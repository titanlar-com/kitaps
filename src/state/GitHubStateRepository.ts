import { fieldStamp } from './syncModel.ts';
import { applyPendingMutations, assertBookStatePayload, assertPendingMutation, assertQueue, assertStateDocument, emptyStateDocument, publicStateDocument, publicStatePayload, upgradeStateDocument } from './merge.ts';
import {
  BOOK_FIELDS,
  GITHUB_STATE_BASE_KEY,
  GITHUB_STATE_COMMIT_IDENTITY,
  GITHUB_STATE_CONNECT_REVIEW_KEY,
  GITHUB_STATE_MIGRATION_KEY,
  GITHUB_STATE_OWNER,
  GITHUB_STATE_PENDING_KEY,
  GITHUB_STATE_REPOSITORY,
  GITHUB_STATE_TOKEN_KEY,
  LEGACY_GITHUB_STATE_PENDING_KEY,
  type BookField,
  type BookStatePayload,
  type StateBases,
  type GitHubStateRepositoryOptions,
  type PendingStateMutation,
  type PendingStore,
  type StateDocument,
  type StorageLike,
} from './types.ts';

export type GitHubStateErrorCode = 'unauthorized' | 'not-found' | 'conflict' | 'network' | 'invalid-data' | 'storage' | 'rate-limited' | 'token-type' | 'read-only';

export class GitHubStateRepositoryError extends Error {
  readonly code: GitHubStateErrorCode;
  readonly status?: number;
  /** For rate limits: when GitHub accepts requests again (epoch milliseconds). */
  readonly retryAt?: number;

  constructor(code: GitHubStateErrorCode, message: string, status?: number, options?: ErrorOptions & { retryAt?: number }) {
    super(message, options);
    this.name = 'GitHubStateRepositoryError';
    this.code = code;
    this.status = status;
    this.retryAt = options?.retryAt;
  }
}

/** Only these request headers are sent. GitHub's CORS preflight rejects any
 * other custom header (Cache-Control included), which would block every
 * browser request; tests pin this list. */
export const GITHUB_REQUEST_HEADERS = ['Accept', 'X-GitHub-Api-Version', 'Authorization', 'If-None-Match'] as const;

/** Fine-grained personal access tokens can be limited to one repository and
 * one permission. Classic and OAuth tokens cannot, so they are refused. */
export const FINE_GRAINED_TOKEN = /^github_pat_[A-Za-z0-9_]{30,}$/;

/** Anonymous devices may ask the API for a fresh copy at most this often, per
 * page. GitHub allows 60 anonymous requests an hour per network address. */
export const ANONYMOUS_FRESH_READ_INTERVAL_MS = 60_000;

/** A request that hangs (a network change while a phone resumes, say) gives up
 * after this long, so it cannot hold every later write behind it. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Browsers cap the bodies of in-flight keepalive requests at 64 KiB. */
const KEEPALIVE_BODY_LIMIT = 60_000;

/** Where the last successful read came from: the API (fresh) or the CDN copy,
 * which can lag by up to five minutes. `tokenRejected`: GitHub refused the stored
 * key, so the file was read without it. */
export interface ReadInfo {
  source: 'api' | 'cdn';
  authenticated: boolean;
  tokenRejected: boolean;
  at: number;
}

export interface SaveOptions {
  /** The page is being hidden: once sent, the write must outlive the page. */
  keepalive?: boolean;
}

interface GitHubContentsResponse {
  sha: string;
  content: string;
  encoding: 'base64';
}

interface RemoteFile {
  document: StateDocument;
  sha?: string;
}

const memoryStorage = (): StorageLike => {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
};

const encodeBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeBase64 = (value: string): string => {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const header = (response: Response, name: string): string => response.headers?.get?.(name) ?? '';

export class GitHubStateRepository {
  static readonly TOKEN_KEY = GITHUB_STATE_TOKEN_KEY;
  static readonly PENDING_KEY = GITHUB_STATE_PENDING_KEY;
  static readonly LEGACY_PENDING_KEY = LEGACY_GITHUB_STATE_PENDING_KEY;
  static readonly MIGRATION_KEY = GITHUB_STATE_MIGRATION_KEY;

  private readonly owner: string;
  private readonly repository: string;
  private readonly path: string;
  private readonly branch: string;
  private readonly storage: StorageLike;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly clock: () => Date;
  private readonly maxConflictRetries: number;
  private lastMutationTime = 0;
  private cached?: { etag: string; file: RemoteFile };
  /** The newest file this device has read or written in this session. */
  private newest?: StateDocument;
  private nextAnonymousApiRead = 0;
  private lastRead?: ReadInfo;

  constructor(options: GitHubStateRepositoryOptions = {}) {
    this.owner = options.owner ?? GITHUB_STATE_OWNER;
    this.repository = options.repository ?? GITHUB_STATE_REPOSITORY;
    this.path = options.path ?? 'state.json';
    this.branch = options.branch ?? 'main';
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? memoryStorage() : localStorage);
    if (!options.fetch && typeof globalThis.fetch !== 'function') throw new GitHubStateRepositoryError('network', 'Fetch is unavailable.');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.clock = options.clock ?? (() => new Date());
    this.maxConflictRetries = Math.max(0, options.maxConflictRetries ?? 1);
  }

  setToken(token: string): void {
    const clean = token.trim();
    GitHubStateRepository.assertFineGrainedToken(clean);
    this.writeStorage(GITHUB_STATE_TOKEN_KEY, clean);
  }

  clearToken(): void {
    this.removeStorage(GITHUB_STATE_TOKEN_KEY);
  }

  hasToken(): boolean {
    return Boolean(this.readStorage(GITHUB_STATE_TOKEN_KEY)?.trim());
  }

  /** The last successful read's source, or undefined before the first one. */
  lastReadInfo(): ReadInfo | undefined {
    return this.lastRead ? { ...this.lastRead } : undefined;
  }

  hasCompletedInitialMigration(): boolean {
    return this.readStorage(GITHUB_STATE_MIGRATION_KEY) === '1';
  }

  markInitialMigrationComplete(): void {
    this.writeStorage(GITHUB_STATE_MIGRATION_KEY, '1');
  }

  /** Until the review clears, nothing this device holds is sent: a newly connected
   * device first compares its unsent edits with the shared file. The marker
   * survives a reload, so the comparison is never skipped. */
  beginConnectReview(): void {
    this.writeStorage(GITHUB_STATE_CONNECT_REVIEW_KEY, '1');
  }

  hasConnectReviewPending(): boolean {
    return this.readStorage(GITHUB_STATE_CONNECT_REVIEW_KEY) === '1';
  }

  clearConnectReview(): void {
    this.removeStorage(GITHUB_STATE_CONNECT_REVIEW_KEY);
  }

  /** The shared file's field stamps as this device last took them over. */
  readBases(): StateBases {
    try {
      const value = JSON.parse(this.readStorage(GITHUB_STATE_BASE_KEY) ?? 'null') as StateBases | null;
      if (value && typeof value === 'object' && value.books && typeof value.books === 'object') return value;
    } catch { /* A damaged record is rebuilt from the next read. */ }
    return { books: {} };
  }

  /** Records what this device now shows from the shared file. A field an unsent
   * edit carries keeps the stamp that edit was based on; the book's other field and
   * every other book move on. `forceBooks`/`forceQueue` record the file as it was
   * when the reader decided about those books, even though their edits are unsent. */
  recordBases(document: StateDocument, options: { skipBooks?: Iterable<string>; skipQueue?: boolean; forceBooks?: Iterable<string>; forceQueue?: boolean } = {}): void {
    const bases = this.readBases();
    const pending = this.readPending().mutations;
    const skip = new Set(options.skipBooks ?? []);
    const force = new Set(options.forceBooks ?? []);
    const held = new Map<string, Set<BookField>>();
    for (const item of pending) if (item.kind === 'book') held.set(item.bookId, new Set(item.value === null ? BOOK_FIELDS : BOOK_FIELDS.filter(field => field in item.value!)));
    for (const [bookId, record] of Object.entries(document.books)) {
      if (skip.has(bookId)) continue;
      const keep = force.has(bookId) ? new Set<BookField>() : held.get(bookId) ?? new Set<BookField>();
      const stamps = { ...(bases.books[bookId] ?? {}) };
      for (const field of BOOK_FIELDS) {
        if (keep.has(field)) continue;
        const stamp = fieldStamp(record, field);
        if (stamp) stamps[field] = stamp; else delete stamps[field];
      }
      bases.books[bookId] = stamps;
    }
    const queueHeld = pending.some(item => item.kind === 'queue') && !options.forceQueue;
    if (!options.skipQueue && !queueHeld && document.queue) bases.queue = document.queue.updatedAt;
    try { this.writeStorage(GITHUB_STATE_BASE_KEY, JSON.stringify(bases)); } catch { /* Without bases, the next connect asks more often. */ }
  }

  /** The reader kept this device's unsent edits over another device's: they are
   * stamped anew, so they win for exactly the fields they carry. */
  requeuePendingFor(bookIds: Iterable<string>, includeQueue: boolean): void {
    const ids = new Set(bookIds);
    for (const mutation of this.readPending().mutations) {
      if (mutation.kind === 'book' && ids.has(mutation.bookId)) this.queueBookState(mutation.bookId, mutation.value);
      else if (mutation.kind === 'queue' && includeQueue) this.queueQueueState(mutation.value);
    }
  }

  static assertFineGrainedToken(token: string): void {
    if (!token) throw new GitHubStateRepositoryError('unauthorized', 'A GitHub token is required.', 401);
    if (!FINE_GRAINED_TOKEN.test(token)) throw new GitHubStateRepositoryError('token-type', 'Only fine-grained personal access tokens are accepted.');
  }

  /** Checks the token with GitHub before a caller stores it. A token that
   * reports classic OAuth scopes is refused even if its prefix looks right.
   * The repository is public, so any token can read it; the token must also
   * prove it can write. Creating an unreferenced blob needs the same Contents
   * write permission as a save, but changes no branch and makes no commit. */
  async validateToken(token: string): Promise<void> {
    const clean = token.trim();
    GitHubStateRepository.assertFineGrainedToken(clean);
    const response = await this.request(this.contentsUrl(), { headers: this.headers(clean) });
    if (!response.ok) throw this.errorForResponse(response);
    if (header(response, 'X-OAuth-Scopes').trim()) throw new GitHubStateRepositoryError('token-type', 'The token carries classic OAuth scopes.');
    await this.parseContents(response);
    const probe = await this.request(this.blobsUrl(), { method: 'POST', headers: this.headers(clean), body: JSON.stringify({ content: 'Kitaplık yazma denetimi', encoding: 'utf-8' }) });
    if (probe.ok) return;
    const error = this.errorForResponse(probe);
    if (error.code === 'unauthorized' || error.code === 'not-found') throw new GitHubStateRepositoryError('read-only', 'The token cannot write to the state repository.', probe.status);
    throw error;
  }

  /** The shared file. With a token the API is read directly (fresh, and
   * conditional requests keep the rate limit intact). Anonymous devices read
   * the CDN copy, which has no API rate limit but lags by up to five minutes;
   * when freshness matters (opening the page, coming back to it) they ask the
   * API first, at most once a minute, and fall back to the CDN when GitHub
   * refuses. A copy older than one already seen never replaces it. */
  async load(options: { fresh?: boolean } = {}): Promise<StateDocument> {
    return this.keepNewest((await this.readCurrent(options.fresh === true)).document);
  }

  /** This device's unsent edits, oldest first. */
  pendingMutations(): PendingStateMutation[] {
    return structuredClone(this.readPending().mutations);
  }

  async loadWithPending(remote?: StateDocument): Promise<StateDocument> {
    const base = remote ?? await this.load();
    return applyPendingMutations(base, this.readPending().mutations);
  }

  queueBookState(bookId: string, value: BookStatePayload | null, suppliedUpdatedAt?: string): PendingStateMutation {
    if (!bookId.trim()) throw new TypeError('bookId is required.');
    if (value !== null) assertBookStatePayload(value, bookId);
    const store = this.readPending();
    const updatedAt = this.nextTimestamp(store, suppliedUpdatedAt);
    const previous = store.mutations.find(item => item.kind === 'book' && item.bookId === bookId);
    const safeValue = publicStatePayload(value);
    const previousValue = previous?.kind === 'book' ? publicStatePayload(previous.value) : null;
    const coalesced = safeValue === null ? null : { ...(previousValue ?? {}), ...safeValue };
    const mutation: PendingStateMutation = { id: this.mutationId(updatedAt), kind: 'book', bookId, updatedAt, value: structuredClone(coalesced) };
    this.writePending({
      since: store.mutations.length ? store.since ?? updatedAt : updatedAt,
      mutations: [...store.mutations.filter(item => !(item.kind === 'book' && item.bookId === bookId)), mutation],
    });
    return mutation;
  }

  queueQueueState(queue: readonly string[], suppliedUpdatedAt?: string): PendingStateMutation {
    const value = [...queue];
    assertQueue(value);
    const store = this.readPending();
    const updatedAt = this.nextTimestamp(store, suppliedUpdatedAt);
    const mutation: PendingStateMutation = { id: this.mutationId(updatedAt), kind: 'queue', updatedAt, value };
    this.writePending({
      since: store.mutations.length ? store.since ?? updatedAt : updatedAt,
      mutations: [...store.mutations.filter(item => item.kind !== 'queue'), mutation],
    });
    return mutation;
  }

  /** Drops unsent edits the reader chose to replace with the shared values. */
  discardPendingFor(bookIds: Iterable<string>, includeQueue: boolean): void {
    const drop = new Set(bookIds);
    const store = this.readPending();
    const mutations = store.mutations.filter(item => item.kind === 'queue' ? !includeQueue : !drop.has(item.bookId));
    if (mutations.length === store.mutations.length) return;
    if (mutations.length) this.writePending({ since: store.since, mutations });
    else this.removeStorage(GITHUB_STATE_PENDING_KEY);
  }

  getPendingCount(): number {
    return this.readPending().mutations.length;
  }

  /** When the oldest unsent change was made, or null when nothing is pending. */
  getPendingSince(): string | null {
    const store = this.readPending();
    return store.mutations.length ? store.since : null;
  }

  async flushPending(options: SaveOptions = {}): Promise<StateDocument> {
    const snapshot = this.readPending().mutations;
    if (!snapshot.length) return this.load();
    const saved = await this.save(snapshot, options);
    const completed = new Set(snapshot.map(item => item.id));
    const remaining = this.readPending().mutations.filter(item => !completed.has(item.id));
    if (remaining.length) {
      const oldest = remaining.reduce((result, item) => Date.parse(item.updatedAt) < Date.parse(result) ? item.updatedAt : result, remaining[0].updatedAt);
      this.writePending({ since: oldest, mutations: remaining });
    } else {
      this.removeStorage(GITHUB_STATE_PENDING_KEY);
    }
    return applyPendingMutations(saved, remaining);
  }

  async save(mutations: readonly PendingStateMutation[], options: SaveOptions = {}): Promise<StateDocument> {
    for (const mutation of mutations) assertPendingMutation(mutation);
    const token = this.readStorage(GITHUB_STATE_TOKEN_KEY)?.trim();
    if (!token) throw new GitHubStateRepositoryError('unauthorized', 'A GitHub token is required to save state.', 401);

    // The file and sha from the last read or write usually still match GitHub,
    // so the first attempt writes on top of them in a single request, which
    // matters when a phone is about to suspend the page. A file another device
    // changed answers 409/422, and the next attempt starts from a fresh read.
    let remote: RemoteFile | undefined = this.cached?.file.sha ? structuredClone(this.cached.file) : undefined;
    const attempts = this.maxConflictRetries + (remote ? 2 : 1);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      remote ??= await this.readApi(true, true);
      const merged = publicStateDocument(applyPendingMutations(remote.document, mutations));
      // The file's own time always moves forward, so any copy from before this
      // write is recognisably older (see keepNewest).
      merged.updatedAt = new Date(Math.max(Date.parse(merged.updatedAt), Date.parse(remote.document.updatedAt) + 1, this.clock().getTime())).toISOString();
      const body = JSON.stringify({
        message: 'Update Kitaplık state',
        content: encodeBase64(`${JSON.stringify(merged, null, 2)}\n`),
        branch: this.branch,
        author: GITHUB_STATE_COMMIT_IDENTITY,
        committer: GITHUB_STATE_COMMIT_IDENTITY,
        ...(remote.sha ? { sha: remote.sha } : {}),
      });
      const response = await this.request(this.contentsUrl(), { method: 'PUT', headers: this.headers(token), body, keepalive: options.keepalive === true && body.length < KEEPALIVE_BODY_LIMIT });
      if ((response.status === 409 || response.status === 422) && attempt < attempts - 1) {
        this.cached = undefined;
        remote = undefined;
        continue;
      }
      if (!response.ok) throw this.errorForResponse(response);
      const written = await response.json().catch(() => null) as { content?: { sha?: unknown } } | null;
      const sha = typeof written?.content?.sha === 'string' ? written.content.sha : undefined;
      // No ETag: the next read is unconditional, but the next write can start here.
      this.cached = sha ? { etag: '', file: { document: structuredClone(merged), sha } } : undefined;
      this.newest = structuredClone(merged);
      return merged;
    }
    throw new GitHubStateRepositoryError('conflict', 'GitHub state changed during save. Reload and try again.', 409);
  }

  private async readCurrent(fresh: boolean): Promise<RemoteFile> {
    if (this.hasToken()) {
      try {
        const file = await this.readApi(true);
        this.noteRead('api', true, false);
        return file;
      } catch (error) {
        // A refused key stops this device's writes, not its reads: the file is public,
        // so it is read without the key while the device shows how to reconnect.
        if (!(error instanceof GitHubStateRepositoryError && error.code === 'unauthorized')) throw error;
        return this.readAnonymous(fresh, true);
      }
    }
    return this.readAnonymous(fresh, false);
  }

  private async readAnonymous(fresh: boolean, tokenRejected: boolean): Promise<RemoteFile> {
    const now = this.clock().getTime();
    if (fresh && now >= this.nextAnonymousApiRead) {
      this.nextAnonymousApiRead = now + ANONYMOUS_FRESH_READ_INTERVAL_MS;
      try {
        const file = await this.readApi(true, false, true);
        this.noteRead('api', false, tokenRejected);
        return file;
      } catch (error) {
        // The CDN copy stays the anonymous baseline; the API only makes it fresher.
        if (error instanceof GitHubStateRepositoryError && error.retryAt) this.nextAnonymousApiRead = Math.max(this.nextAnonymousApiRead, error.retryAt);
      }
    }
    const file = await this.readRaw();
    this.noteRead('cdn', false, tokenRejected);
    return file;
  }

  private noteRead(source: ReadInfo['source'], authenticated: boolean, tokenRejected: boolean): void {
    this.lastRead = { source, authenticated, tokenRejected, at: this.clock().getTime() };
  }

  /** The CDN can serve a copy older than a file this device has already read
   * or written; an older copy never replaces a newer one. */
  private keepNewest(document: StateDocument): StateDocument {
    if (this.newest && Date.parse(document.updatedAt) < Date.parse(this.newest.updatedAt)) return structuredClone(this.newest);
    this.newest = structuredClone(document);
    return document;
  }

  private async readApi(conditional: boolean, allowMissing = false, anonymous = false): Promise<RemoteFile> {
    const token = anonymous ? undefined : this.readStorage(GITHUB_STATE_TOKEN_KEY)?.trim();
    const etag = conditional ? this.cached?.etag : undefined;
    const response = await this.request(`${this.contentsUrl()}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers(token, etag) });
    if (response.status === 304 && this.cached) return structuredClone(this.cached.file);
    if (response.status === 404 && allowMissing) return { document: emptyStateDocument() };
    if (!response.ok) throw this.errorForResponse(response);
    const file = await this.parseContents(response);
    const nextEtag = header(response, 'ETag');
    this.cached = nextEtag ? { etag: nextEtag, file: structuredClone(file) } : undefined;
    return file;
  }

  private async readRaw(): Promise<RemoteFile> {
    // A plain GET without custom headers is a simple CORS request.
    const response = await this.request(this.rawUrl(), {});
    if (!response.ok) throw this.errorForResponse(response);
    try {
      return { document: this.parseDocument(await response.json()) };
    } catch (error) {
      throw new GitHubStateRepositoryError('invalid-data', 'GitHub state file is invalid.', undefined, { cause: error });
    }
  }

  private async parseContents(response: Response): Promise<RemoteFile> {
    try {
      const payload = await response.json() as GitHubContentsResponse;
      if (payload.encoding !== 'base64' || !payload.content || !payload.sha) throw new Error('Incomplete Contents API response.');
      return { document: this.parseDocument(JSON.parse(decodeBase64(payload.content))), sha: payload.sha };
    } catch (error) {
      throw new GitHubStateRepositoryError('invalid-data', 'GitHub state file is invalid.', undefined, { cause: error });
    }
  }

  private parseDocument(value: unknown): StateDocument {
    const document = upgradeStateDocument(value);
    assertStateDocument(document);
    return publicStateDocument(document);
  }

  private nextTimestamp(store: PendingStore, supplied?: string): string {
    const pendingTime = store.mutations.reduce((latest, item) => Math.max(latest, Date.parse(item.updatedAt)), 0);
    const generated = Math.max(this.clock().getTime(), this.lastMutationTime + 1, pendingTime + 1);
    const updatedAt = supplied ?? new Date(generated).toISOString();
    if (!Number.isFinite(Date.parse(updatedAt))) throw new TypeError('A valid updatedAt is required.');
    this.lastMutationTime = Math.max(this.lastMutationTime, Date.parse(updatedAt));
    return updatedAt;
  }

  private mutationId(updatedAt: string): string {
    return `${updatedAt}:${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  }

  private readPending(): PendingStore {
    let raw: string | null;
    try {
      raw = this.readStorage(GITHUB_STATE_PENDING_KEY);
    } catch {
      return { since: null, mutations: [] };
    }
    if (!raw) return this.migrateLegacyPending();
    try {
      const value = JSON.parse(raw) as PendingStore;
      if (!value || typeof value !== 'object' || !Array.isArray(value.mutations)) throw new Error('Pending state is not a store.');
      for (const mutation of value.mutations) assertPendingMutation(mutation);
      const since = typeof value.since === 'string' && Number.isFinite(Date.parse(value.since)) ? value.since : value.mutations[0]?.updatedAt ?? null;
      return { since, mutations: value.mutations };
    } catch {
      try { this.removeStorage(GITHUB_STATE_PENDING_KEY); } catch { /* Storage can be unavailable. */ }
      return { since: null, mutations: [] };
    }
  }

  /** Version 1 queued per-book payloads that also carried queue positions.
   * Positions are dropped: the device's current queue is re-queued whole. */
  private migrateLegacyPending(): PendingStore {
    let raw: string | null = null;
    try { raw = this.readStorage(LEGACY_GITHUB_STATE_PENDING_KEY); } catch { return { since: null, mutations: [] }; }
    if (!raw) return { since: null, mutations: [] };
    const mutations: PendingStateMutation[] = [];
    try {
      for (const item of JSON.parse(raw) as Array<Record<string, unknown>>) {
        const value = item?.value && typeof item.value === 'object' ? Object.fromEntries(Object.entries(item.value).filter(([key]) => key !== 'queuePosition')) : null;
        if (!value || !Object.keys(value).length || typeof item.bookId !== 'string' || typeof item.updatedAt !== 'string') continue;
        const mutation: PendingStateMutation = { id: String(item.id), kind: 'book', bookId: item.bookId, updatedAt: item.updatedAt, value: value as BookStatePayload };
        assertPendingMutation(mutation);
        mutations.push(mutation);
      }
    } catch {
      mutations.length = 0;
    }
    const store: PendingStore = { since: mutations[0]?.updatedAt ?? null, mutations };
    try {
      if (mutations.length) this.writePending(store);
      this.removeStorage(LEGACY_GITHUB_STATE_PENDING_KEY);
    } catch { /* Keep the legacy copy when storage is unavailable. */ }
    return store;
  }

  private writePending(store: PendingStore): void {
    this.writeStorage(GITHUB_STATE_PENDING_KEY, JSON.stringify(store));
  }

  private contentsUrl(): string {
    return `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/contents/${this.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  private blobsUrl(): string {
    return `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/git/blobs`;
  }

  private rawUrl(): string {
    return `https://raw.githubusercontent.com/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/${encodeURIComponent(this.branch)}/${this.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  private headers(token?: string, etag?: string): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(etag ? { 'If-None-Match': etag } : {}),
    };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
    try {
      return await this.fetcher(url, { ...init, cache: 'no-store', ...(signal ? { signal } : {}) });
    } catch (error) {
      throw new GitHubStateRepositoryError('network', 'GitHub state request failed.', undefined, { cause: error });
    }
  }

  private errorForResponse(response: Response): GitHubStateRepositoryError {
    const remaining = header(response, 'X-RateLimit-Remaining');
    // A secondary rate limit is a 403 with Retry-After while the primary quota remains.
    if (response.status === 429 || (response.status === 403 && (remaining === '0' || header(response, 'Retry-After') !== ''))) {
      const reset = Number(header(response, 'X-RateLimit-Reset'));
      const retryAfter = Number(header(response, 'Retry-After'));
      // Retry-After names the wait for this answer (a secondary limit); the reset time
      // only applies once the hourly quota is used up. Without either, a minute.
      const retryAt = header(response, 'Retry-After') !== '' && Number.isFinite(retryAfter) && retryAfter >= 0 ? Date.now() + retryAfter * 1000
        : remaining === '0' && Number.isFinite(reset) && reset > 0 ? reset * 1000
          : Date.now() + 60_000;
      return new GitHubStateRepositoryError('rate-limited', 'GitHub rate limit reached.', response.status, { retryAt });
    }
    if (response.status === 401 || response.status === 403) return new GitHubStateRepositoryError('unauthorized', 'GitHub rejected the credentials or repository write permission.', response.status);
    if (response.status === 404) return new GitHubStateRepositoryError('not-found', 'GitHub state repository or file was not found.', 404);
    if (response.status === 409 || response.status === 422) return new GitHubStateRepositoryError('conflict', 'GitHub state changed during save. Reload and try again.', response.status);
    return new GitHubStateRepositoryError('network', `GitHub state request failed with status ${response.status}.`, response.status);
  }

  private readStorage(key: string): string | null {
    try { return this.storage.getItem(key); }
    catch (error) { throw new GitHubStateRepositoryError('storage', 'Local sync storage is unavailable.', undefined, {cause: error}); }
  }

  private writeStorage(key: string, value: string): void {
    try { this.storage.setItem(key, value); }
    catch (error) { throw new GitHubStateRepositoryError('storage', 'Local sync storage is full or unavailable.', undefined, {cause: error}); }
  }

  private removeStorage(key: string): void {
    try { this.storage.removeItem(key); }
    catch (error) { throw new GitHubStateRepositoryError('storage', 'Local sync storage is unavailable.', undefined, {cause: error}); }
  }
}
