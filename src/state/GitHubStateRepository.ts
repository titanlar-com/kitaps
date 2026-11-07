import { fieldStamp } from './syncModel.ts';
import { applyPendingMutations, assertBookStatePayload, assertMutationBasis, assertPendingMutation, assertQueue, assertStateDocument, emptyStateDocument, publicStateDocument, publicStatePayload, same, sameMarks, upgradeStateDocument } from './merge.ts';
import {
  BOOK_FIELDS,
  GITHUB_STATE_BASE_KEY,
  GITHUB_STATE_COMMIT_IDENTITY,
  GITHUB_STATE_CONNECT_REVIEW_KEY,
  GITHUB_STATE_MIGRATION_KEY,
  GITHUB_STATE_OWNER,
  GITHUB_STATE_PENDING_BASIS_KEY,
  GITHUB_STATE_PENDING_KEY,
  GITHUB_STATE_RECOVERY_KEY,
  GITHUB_STATE_REMOTE_KEY,
  GITHUB_STATE_REPOSITORY,
  GITHUB_STATE_TOKEN_KEY,
  LEGACY_GITHUB_STATE_PENDING_KEY,
  MAX_SENT_VERSIONS,
  type BookField,
  type BookStatePayload,
  type StateBases,
  type GitHubStateRepositoryOptions,
  type MutationBasis,
  type SentBookVersion,
  type SentQueueVersion,
  type SentWrite,
  type PendingRecoveryCopy,
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

/** The CDN serves a copy at most five minutes old. A copy older than the one this device
 * kept, read this long after it was kept, means the shared file itself went back (it was
 * reset or restored), so it is taken. */
export const KEPT_COPY_TRUST_MS = 10 * 60_000;

/** What a damaged pending queue left: how many copies are kept, how many of their edits
 * stayed queued, and whether every copy is stored (false while storage is too full for
 * the copy, when the damaged record stays where it is). */
export interface PendingRecoveryStatus {
  copies: number;
  kept: number;
  stored: boolean;
}

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
/** How many commits one history read lists; fewer means the whole history was read. */
const HISTORY_PAGE_SIZE = 100;
/** The history is read from this long before a write, as this device's clock may be off. */
const HISTORY_CLOCK_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;
/** The history only settles a guess, so a slow answer does not hold up the page's read. */
const HISTORY_TIMEOUT_MS = 5_000;
const HISTORY_RETRY_MS = 60_000;
const newWriteId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
/** Two sent versions with the same stamps and values, whichever writes sent them. */
const sameVersion = (left: SentBookVersion | SentQueueVersion, right: SentBookVersion | SentQueueVersion): boolean => {
  const { writes: _left, landed: _leftLanded, ...a } = left;
  const { writes: _right, landed: _rightLanded, ...b } = right;
  return JSON.stringify(a) === JSON.stringify(b);
};
/** Which shared value an edit sends: one book, or the queue. */
const sendKey = (mutation: PendingStateMutation): string => mutation.kind === 'queue' ? 'queue' : `book:${mutation.bookId}`;

export class GitHubStateRepository {
  static readonly TOKEN_KEY = GITHUB_STATE_TOKEN_KEY;
  static readonly PENDING_KEY = GITHUB_STATE_PENDING_KEY;
  static readonly LEGACY_PENDING_KEY = LEGACY_GITHUB_STATE_PENDING_KEY;
  static readonly MIGRATION_KEY = GITHUB_STATE_MIGRATION_KEY;
  static readonly REMOTE_KEY = GITHUB_STATE_REMOTE_KEY;
  static readonly RECOVERY_KEY = GITHUB_STATE_RECOVERY_KEY;
  static readonly BASIS_KEY = GITHUB_STATE_PENDING_BASIS_KEY;

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
  /** The newest file this device has read or written, kept across visits. */
  private newest?: StateDocument;
  /** The shared file the page last showed, merged with the unsent edits (loadWithPending,
   * flushPending). A folded edit made on that view is based on it. */
  private viewed?: StateDocument;
  /** The open writes last asked about in the commit history, and when a failed lookup may
   * be tried again (see resolveUnanswered). */
  private askedHistory = '';
  private historyRetryAt = 0;
  /** state.json's blob sha as this page last read or wrote it ('' for no file), and when. */
  private knownSha?: string;
  private knownShaAt = 0;
  /** The books (`book:<id>`) and queue a PUT under way writes, and that PUT's write id. */
  private readonly sending = new Map<string, string>();
  /** Whether `newest` was read or written in this visit, rather than kept from an earlier one. */
  private newestSeen = false;
  /** When this device kept `newest` (on its own clock). */
  private newestKeptAt = 0;
  /** A damaged pending record whose copy could not be stored yet: it stays where it is,
   * its readable edits are used, and nothing overwrites it until the copy is stored. */
  private uncopied?: { raw: string; store: PendingStore; legacy: boolean; at: string; sent: Set<string> };
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
    const kept = this.readKeptRemote();
    this.newest = kept?.document;
    this.newestKeptAt = kept?.keptAt ?? 0;
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
   * stamped anew and based on `remote`, the shared file the reader decided against, so
   * they win for exactly the fields they carry; only what another device saves after
   * the decision is merged with them. */
  requeuePendingFor(bookIds: Iterable<string>, includeQueue: boolean, remote?: StateDocument): void {
    const ids = new Set(bookIds);
    for (const mutation of this.readPending().mutations) {
      if (mutation.kind === 'book' && ids.has(mutation.bookId)) {
        const record = remote?.books[mutation.bookId];
        this.queueBook(mutation.bookId, mutation.value, undefined, remote ? { states: record?.value?.states ?? [], reading: record?.value?.reading ?? null } : undefined, true);
      } else if (mutation.kind === 'queue' && includeQueue) this.queueQueue(mutation.value, undefined, remote ? remote.queue?.value ?? [] : undefined, true);
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
  async load(options: { fresh?: boolean; requireToken?: boolean } = {}): Promise<StateDocument> {
    return (await this.loadRead(options)).document;
  }

  /** The shared file with where this very read came from (`lastReadInfo` can
   * already describe a later read by then). `requireToken`: only a read made with
   * the stored key will do (a connect comparison); a refused key then throws
   * instead of falling back to an anonymous read. */
  async loadRead(options: { fresh?: boolean; requireToken?: boolean } = {}): Promise<{ document: StateDocument; info: ReadInfo }> {
    const { file, info } = await this.readCurrent(options.fresh === true, options.requireToken === true);
    return { document: this.keepNewest(file.document, info.source), info };
  }

  /** This device's unsent edits, oldest first. */
  pendingMutations(): PendingStateMutation[] {
    return structuredClone(this.readPending().mutations);
  }

  async loadWithPending(remote?: StateDocument): Promise<StateDocument> {
    const base = remote ?? await this.load();
    await this.resolveUnanswered();
    const pending = this.readPending().mutations;
    const shown = applyPendingMutations(base, pending, this.settled(this.readBasis(pending)));
    this.viewed = structuredClone(base);
    return shown;
  }

  /** Queues an edit to a book. `base`: the value of the fields it carries as this
   * device showed them before the edit, so the edit can later be merged with what
   * another device saved meanwhile. Edits to one book are folded into one: each field
   * keeps the time of its own last edit and the base of its first unsent one. */
  queueBookState(bookId: string, value: BookStatePayload | null, suppliedUpdatedAt?: string, base?: BookStatePayload): PendingStateMutation {
    return this.queueBook(bookId, value, suppliedUpdatedAt, base, false);
  }

  /** Queues the reading queue; `base` as for queueBookState. */
  queueQueueState(queue: readonly string[], suppliedUpdatedAt?: string, base?: readonly string[]): PendingStateMutation {
    return this.queueQueue(queue, suppliedUpdatedAt, base, false);
  }

  /** `rebase`: every field is stamped anew and takes `base` (a decision about these edits). */
  private queueBook(bookId: string, value: BookStatePayload | null, suppliedUpdatedAt: string | undefined, base: BookStatePayload | undefined, rebase: boolean): PendingStateMutation {
    if (!bookId.trim()) throw new TypeError('bookId is required.');
    if (value !== null) assertBookStatePayload(value, bookId);
    const store = this.readPending();
    const bases = this.readBasis(store.mutations);
    const safeValue = publicStatePayload(value);
    const updatedAt = this.nextTimestamp(store, suppliedUpdatedAt, this.seenBookStamp(bookId, safeValue));
    const previous = store.mutations.find(item => item.kind === 'book' && item.bookId === bookId);
    const previousValue = previous?.kind === 'book' ? publicStatePayload(previous.value) : null;
    const coalesced = safeValue === null ? null : { ...(previousValue ?? {}), ...safeValue };
    const mutation: PendingStateMutation = { id: this.mutationId(updatedAt), kind: 'book', bookId, updatedAt, value: structuredClone(coalesced) };
    const earlierBasis = previous ? bases.get(previous.id) : undefined;
    const earlier = earlierBasis?.kind === 'book' ? earlierBasis : undefined;
    if (previous) bases.delete(previous.id);
    if (coalesced) {
      const before = this.validBookBase(base, bookId);
      const stamps: Partial<Record<BookField, string>> = {};
      const fieldBase: Record<string, unknown> = {};
      const viewed = this.viewedBook(bookId, previous, earlier);
      const rebased = new Set<BookField>();
      for (const field of BOOK_FIELDS) {
        if (!(field in coalesced)) continue;
        const carried = !rebase && previousValue !== null && field in previousValue;
        stamps[field] = rebase || field in safeValue! ? updatedAt : earlier?.stamps[field] ?? previous!.updatedAt;
        // A field an edit queued by older code carried keeps no base: it merges as before.
        let from = carried ? (earlier && field in earlier.base ? earlier.base : undefined) : before && field in before ? before : undefined;
        // The page showed the unsent edit merged with another device's change, and this
        // edit was made on that view: it is based on the shared value the view came from,
        // so a later removal on the other device is not taken for an addition here. The
        // view already settled which earlier sends landed, so they are not used again.
        if (carried && from && before && field in before && viewed && !this.sending.has(sendKey(mutation))) {
          const shown = field === 'states' ? viewed.shown.states ?? [] : viewed.shown.reading ?? null;
          const absorbed = field === 'states' ? !sameMarks(before.states ?? [], previousValue!.states ?? []) : !same(before.reading ?? null, previousValue!.reading ?? null);
          const onView = field === 'states' ? sameMarks(before.states ?? [], shown as string[]) : same(before.reading ?? null, shown);
          if (absorbed && onView) {
            from = field === 'states' ? { states: [...(viewed.shared.states ?? [])] } : { reading: structuredClone(viewed.shared.reading ?? null) };
            rebased.add(field);
          }
        }
        if (from) fieldBase[field] = structuredClone(from[field]);
      }
      // Sends of the folded edit whose answer never came stay known (see MutationBasis),
      // except for fields just based on the view.
      const kept = !rebase && earlier?.sent?.length ? earlier.sent.flatMap(version => {
        const fields = BOOK_FIELDS.filter(field => field in version.value && !rebased.has(field));
        return fields.length ? [{ stamps: Object.fromEntries(fields.map(field => [field, version.stamps[field]])), value: Object.fromEntries(fields.map(field => [field, structuredClone(version.value[field])])) }] : [];
      }) : [];
      const sent = kept.length ? { sent: kept } : {};
      bases.set(mutation.id, { kind: 'book', stamps, base: fieldBase as BookStatePayload, ...sent } as MutationBasis);
    }
    const mutations = [...store.mutations.filter(item => !(item.kind === 'book' && item.bookId === bookId)), mutation];
    this.writePending({ since: this.windowStart(store, updatedAt), mutations });
    this.writeBasis(bases, mutations);
    return mutation;
  }

  private queueQueue(queue: readonly string[], suppliedUpdatedAt: string | undefined, base: readonly string[] | undefined, rebase: boolean): PendingStateMutation {
    const value = [...queue];
    assertQueue(value);
    const store = this.readPending();
    const bases = this.readBasis(store.mutations);
    const seen = this.newest?.queue ? Date.parse(this.newest.queue.updatedAt) : 0;
    const updatedAt = this.nextTimestamp(store, suppliedUpdatedAt, seen);
    const mutation: PendingStateMutation = { id: this.mutationId(updatedAt), kind: 'queue', updatedAt, value };
    const previous = store.mutations.find(item => item.kind === 'queue');
    const earlier = previous ? bases.get(previous.id) : undefined;
    if (previous) bases.delete(previous.id);
    let before = previous && !rebase ? (earlier?.kind === 'queue' ? earlier.base : undefined) : this.validQueueBase(base);
    // As for a book: an edit made on the view the page showed of the unsent queue merged
    // with another device's is based on the shared queue that view came from. A view that
    // left out books this device cannot show is not that view, so nothing is rebased.
    const view = this.validQueueBase(base);
    let rebased = false;
    if (previous?.kind === 'queue' && !rebase && before && view && this.viewed && !this.sending.has('queue') && !same(view, previous.value)) {
      const shown = applyPendingMutations(this.viewed, [previous], new Map(earlier ? [[previous.id, earlier]] : [])).queue?.value ?? [];
      if (same(view, shown)) { before = [...(this.viewed.queue?.value ?? [])]; rebased = true; }
    }
    const sent = !rebase && !rebased && earlier?.kind === 'queue' && earlier.sent?.length ? { sent: structuredClone(earlier.sent) } : {};
    if (before) bases.set(mutation.id, { kind: 'queue', base: [...before], ...sent });
    const mutations = [...store.mutations.filter(item => item.kind !== 'queue'), mutation];
    this.writePending({ since: this.windowStart(store, updatedAt), mutations });
    this.writeBasis(bases, mutations);
    return mutation;
  }

  /** For a folded book edit: the shared value of the book on the file the page showed,
   * and what the page showed of it with the edit being folded. */
  private viewedBook(bookId: string, previous: PendingStateMutation | undefined, earlier: MutationBasis | undefined): { shared: BookStatePayload; shown: BookStatePayload } | undefined {
    if (!this.viewed || previous?.kind !== 'book' || !previous.value) return undefined;
    const shown = applyPendingMutations(this.viewed, [previous], new Map(earlier ? [[previous.id, earlier]] : [])).books[bookId]?.value ?? {};
    return { shared: this.viewed.books[bookId]?.value ?? {}, shown };
  }

  private validBookBase(base: BookStatePayload | undefined, bookId: string): BookStatePayload | undefined {
    if (!base) return undefined;
    try { assertBookStatePayload(base, bookId); return publicStatePayload(base) ?? undefined; } catch { return undefined; }
  }

  private validQueueBase(base: readonly string[] | undefined): string[] | undefined {
    if (!base) return undefined;
    try { const queue = [...base]; assertQueue(queue); return queue; } catch { return undefined; }
  }

  /** Each unsent edit's basis, by mutation id. An entry that does not fit its edit is
   * left out, and that edit merges as one queued by older code. */
  private readBasis(mutations: readonly PendingStateMutation[]): Map<string, MutationBasis> {
    const result = new Map<string, MutationBasis>();
    let stored: unknown;
    try { stored = JSON.parse(this.readStorage(GITHUB_STATE_PENDING_BASIS_KEY) ?? '{}'); } catch { return result; }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result;
    for (const mutation of mutations) {
      const entry = (stored as Record<string, unknown>)[mutation.id];
      if (entry === undefined) continue;
      try { assertMutationBasis(entry, mutation); result.set(mutation.id, entry); } catch { /* Merged without a basis. */ }
    }
    return result;
  }

  /** Written after the queue itself, for the edits it now holds only. */
  private writeBasis(bases: ReadonlyMap<string, MutationBasis>, mutations: readonly PendingStateMutation[]): void {
    const kept = Object.fromEntries(mutations.filter(item => bases.has(item.id)).map(item => [item.id, bases.get(item.id)]));
    try {
      if (Object.keys(kept).length) this.writeStorage(GITHUB_STATE_PENDING_BASIS_KEY, JSON.stringify(kept));
      else this.removeStorage(GITHUB_STATE_PENDING_BASIS_KEY);
    } catch { /* Without a basis these edits merge as before: the later stamp wins. */ }
  }

  /** Drops unsent edits the reader chose to replace with the shared values. */
  discardPendingFor(bookIds: Iterable<string>, includeQueue: boolean): void {
    const drop = new Set(bookIds);
    const store = this.readPending();
    const mutations = store.mutations.filter(item => item.kind === 'queue' ? !includeQueue : !drop.has(item.bookId));
    if (mutations.length === store.mutations.length) return;
    if (!mutations.length) return this.clearPending();
    this.writePending({ since: store.since, mutations });
    this.writeBasis(this.readBasis(mutations), mutations);
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
    // A page being left sends at once; the history waits for the next visit.
    if (!options.keepalive) await this.resolveUnanswered();
    const saved = await this.save(snapshot, options);
    const completed = new Set(snapshot.map(item => item.id));
    const remaining = this.readPending().mutations.filter(item => !completed.has(item.id));
    const bases = this.readBasis(remaining);
    // Edits made while this write ran were folded into the ones it sent: GitHub now has
    // what was sent, so they are relative to that.
    const sentFor = new Map(snapshot.map(item => [item.kind === 'queue' ? 'queue' : `book:${item.bookId}`, item]));
    for (const item of remaining) {
      const sent = sentFor.get(item.kind === 'queue' ? 'queue' : `book:${item.bookId}`), basis = bases.get(item.id);
      if (!sent || !basis) continue;
      if (basis.kind === 'queue' && sent.kind === 'queue') bases.set(item.id, { kind: 'queue', base: [...sent.value] });
      else if (basis.kind === 'book' && sent.kind === 'book' && sent.value) {
        const base: Record<string, unknown> = { ...basis.base };
        for (const field of BOOK_FIELDS) if (field in sent.value && field in item.value!) base[field] = structuredClone(sent.value[field] ?? (field === 'states' ? [] : null));
        bases.set(item.id, { kind: 'book', stamps: basis.stamps, base: base as BookStatePayload });
      }
    }
    try {
      if (remaining.length) {
        const oldest = remaining.reduce((result, item) => Date.parse(item.updatedAt) < Date.parse(result) ? item.updatedAt : result, remaining[0].updatedAt);
        this.writePending({ since: this.onThisClock(oldest), mutations: remaining });
        this.writeBasis(bases, remaining);
      } else {
        this.clearPending();
      }
    } catch (error) {
      // A damaged record that cannot be replaced yet (no room for its copy) still holds
      // the edits just sent; they are not sent again.
      if (this.uncopied) for (const id of completed) this.uncopied.sent.add(id);
      throw error;
    }
    this.viewed = structuredClone(saved);
    return applyPendingMutations(saved, remaining, this.settled(bases));
  }

  /** Just before a PUT, what it sends is remembered with the edits it carries (see
   * MutationBasis.sent): each edit's own values and edit stamps, which a later merge takes
   * as the base once the write landed, and the write itself. The edits pending now get it,
   * also one folded meanwhile. The same values sent again stay one version that lists both
   * writes. Returns the books and queue it was noted for. */
  private noteSending(mutations: readonly PendingStateMutation[], known: ReadonlyMap<string, MutationBasis>, write: SentWrite): string[] {
    const pending = this.readPending().mutations;
    const bases = this.readBasis(pending);
    const noted: string[] = [];
    for (const item of mutations) {
      const key = sendKey(item);
      const target = pending.find(other => sendKey(other) === key);
      const basis = target ? bases.get(target.id) : undefined;
      const own = known.get(item.id);
      if (!target || !basis || !own) continue;
      let version: SentBookVersion | SentQueueVersion | undefined;
      if (basis.kind === 'queue' && item.kind === 'queue') version = { stamp: item.updatedAt, value: [...item.value] };
      else if (basis.kind === 'book' && own.kind === 'book' && item.kind === 'book' && item.value) {
        const fields = BOOK_FIELDS.filter(field => field in item.value!);
        version = {
          stamps: Object.fromEntries(fields.map(field => [field, own.stamps[field] ?? item.updatedAt])),
          value: Object.fromEntries(fields.map(field => [field, structuredClone(item.value![field] ?? (field === 'states' ? [] : null))])),
        };
      }
      if (!version) continue;
      const sent = [...(basis.sent ?? [])] as Array<SentBookVersion | SentQueueVersion>;
      const index = sent.findIndex(earlier => sameVersion(earlier, version!));
      // At most MAX_SENT_VERSIONS writes per version; a version that reached it is never dropped.
      if (index >= 0) { if ((sent[index].writes?.length ?? 0) < MAX_SENT_VERSIONS) sent[index] = { ...sent[index], writes: [...(sent[index].writes ?? []), write] }; }
      else sent.push({ ...version, writes: [write] });
      bases.set(target.id, { ...basis, sent: sent.slice(-MAX_SENT_VERSIONS) } as MutationBasis);
      noted.push(key);
    }
    this.writeBasis(bases, pending);
    return noted;
  }

  /** Takes `write` off the versions of `keys`; a version no other write sent, and not known
   * to have landed, goes. Used when the write surely did not land. */
  private forgetSending(keys: readonly string[], write: string): void {
    if (!keys.length) return;
    const mutations = this.readPending().mutations;
    const bases = this.readBasis(mutations);
    let changed = false;
    for (const item of mutations) {
      const basis = bases.get(item.id);
      if (!basis?.sent || !keys.includes(sendKey(item))) continue;
      const sent = (basis.sent as Array<SentBookVersion | SentQueueVersion>).flatMap(version => {
        if (!version.writes?.some(other => other.id === write)) return [version];
        changed = true;
        const writes = version.writes.filter(other => other.id !== write);
        return writes.length || version.landed ? [{ ...version, writes }] : [];
      });
      const { sent: _dropped, ...rest } = basis;
      bases.set(item.id, (sent.length ? { ...rest, sent } : rest) as MutationBasis);
    }
    if (changed) this.writeBasis(bases, mutations);
  }

  /** The bases as the page should show them: a version only a write still under way sent is
   * left out until its answer comes. */
  private settled(bases: ReadonlyMap<string, MutationBasis>): Map<string, MutationBasis> {
    const result = new Map(bases);
    if (!this.sending.size) return result;
    const inFlight = new Set(this.sending.values());
    for (const [id, basis] of bases) {
      if (!basis.sent) continue;
      const sent = (basis.sent as Array<SentBookVersion | SentQueueVersion>).filter(version => version.landed || !version.writes?.length || version.writes.some(write => !inFlight.has(write.id)));
      if (sent.length === basis.sent.length) continue;
      const { sent: _inFlight, ...rest } = basis;
      result.set(id, (sent.length ? { ...rest, sent } : rest) as MutationBasis);
    }
    return result;
  }

  /** A write whose answer never came either landed or did not. state.json's commit history
   * tells which: a version a listed write sent is marked landed. A write the history does
   * not list can never land once state.json's blob is no longer the one it was written on
   * (GitHub takes a write only on the current blob), so a version all of whose writes are
   * like that is dropped, judged on a blob read after the write was sent. The history is
   * read from three days before the oldest open write, to allow for this device's clock; a
   * full page proves nothing. Without a key, when GitHub
   * cannot answer, or for a write still on its way from this page, nothing changes and the
   * merge goes by stamps. Each set of open writes is asked about once per page; a failed
   * lookup is tried again a minute later. */
  private async resolveUnanswered(): Promise<void> {
    const token = this.readStorage(GITHUB_STATE_TOKEN_KEY)?.trim();
    const current = this.knownSha;
    if (!token || current === undefined) return;
    const inFlight = new Set(this.sending.values());
    const open = new Map<string, SentWrite>();
    for (const basis of this.readBasis(this.readPending().mutations).values()) {
      for (const version of (basis.sent ?? []) as Array<SentBookVersion | SentQueueVersion>) {
        if (!version.landed) for (const write of version.writes ?? []) if (!inFlight.has(write.id)) open.set(write.id, write);
      }
    }
    const question = `${current} ${[...open.keys()].sort().join(' ')}`;
    if (!open.size || this.askedHistory === question || this.clock().getTime() < this.historyRetryAt) return;
    const oldest = Math.min(...[...open.values()].map(write => Date.parse(write.at)));
    let messages: string[];
    let complete: boolean;
    try {
      const response = await this.request(this.commitsUrl(new Date(oldest - HISTORY_CLOCK_MARGIN_MS).toISOString()), { headers: this.headers(token) }, HISTORY_TIMEOUT_MS);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const list = await response.json() as unknown;
      if (!Array.isArray(list)) throw new Error('Not a commit list.');
      messages = list.map(item => String((item as { commit?: { message?: unknown } })?.commit?.message ?? ''));
      complete = list.length < HISTORY_PAGE_SIZE;
    } catch {
      this.historyRetryAt = this.clock().getTime() + HISTORY_RETRY_MS;
      return;
    }
    this.askedHistory = question;
    const listed = (write: SentWrite): boolean => messages.some(message => message.includes(`(write ${write.id})`));
    // Only a blob read after the write was sent shows that it can no longer land.
    const lost = (write: SentWrite): boolean => complete && !listed(write) && write.sha !== current && this.knownShaAt >= Date.parse(write.at);
    const mutations = this.readPending().mutations;
    const bases = this.readBasis(mutations);
    let changed = false;
    for (const item of mutations) {
      const basis = bases.get(item.id);
      if (!basis?.sent) continue;
      const sent = (basis.sent as Array<SentBookVersion | SentQueueVersion>).flatMap(version => {
        const writes = version.writes ?? [];
        if (version.landed || !writes.length) return [version];
        if (writes.some(write => open.has(write.id) && listed(write))) { changed = true; return [{ ...version, landed: true as const }]; }
        if (writes.length < MAX_SENT_VERSIONS && writes.every(write => open.has(write.id) && lost(write))) { changed = true; return []; }
        return [version];
      });
      const { sent: _resolved, ...rest } = basis;
      bases.set(item.id, (sent.length ? { ...rest, sent } : rest) as MutationBasis);
    }
    if (changed) this.writeBasis(bases, mutations);
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
    // Every attempt merges on what was known before this write: its own earlier attempts
    // were answered with 409, so they never landed.
    const bases = this.readBasis(mutations);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      remote ??= await this.readApi(true, true);
      const merged = publicStateDocument(applyPendingMutations(remote.document, mutations, bases));
      const write: SentWrite = { id: newWriteId(), at: this.clock().toISOString(), sha: remote.sha ?? '' };
      // The file's own time always moves forward, so any copy from before this
      // write is recognisably older (see keepNewest).
      merged.updatedAt = new Date(Math.max(Date.parse(merged.updatedAt), Date.parse(remote.document.updatedAt) + 1, this.clock().getTime())).toISOString();
      const body = JSON.stringify({
        // The id lets a later visit find out from the history whether this write landed.
        message: `Update Kitaplık state (write ${write.id})`,
        content: encodeBase64(`${JSON.stringify(merged, null, 2)}\n`),
        branch: this.branch,
        author: GITHUB_STATE_COMMIT_IDENTITY,
        committer: GITHUB_STATE_COMMIT_IDENTITY,
        ...(remote.sha ? { sha: remote.sha } : {}),
      });
      // An offline browser sends nothing, so nothing is remembered as sent.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GitHubStateRepositoryError('network', 'The browser is offline.');
      const noted = this.noteSending(mutations, bases, write);
      for (const key of noted) this.sending.set(key, write.id);
      let response: Response;
      try {
        response = await this.request(this.contentsUrl(), { method: 'PUT', headers: this.headers(token), body, keepalive: options.keepalive === true && body.length < KEEPALIVE_BODY_LIMIT });
      } catch (error) {
        // A request the browser refused while offline never left it.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) this.forgetSending(noted, write.id);
        throw error;
      } finally {
        for (const key of noted) if (this.sending.get(key) === write.id) this.sending.delete(key);
      }
      // GitHub's answer, other than a server error, means this write did not land.
      if (!response.ok && response.status < 500) this.forgetSending(noted, write.id);
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
      if (sha) this.noteSha(sha);
      this.remember(merged);
      return merged;
    }
    throw new GitHubStateRepositoryError('conflict', 'GitHub state changed during save. Reload and try again.', 409);
  }

  private async readCurrent(fresh: boolean, requireToken = false): Promise<{ file: RemoteFile; info: ReadInfo }> {
    if (this.hasToken()) {
      try {
        return this.noteRead(await this.readApi(true), 'api', true, false);
      } catch (error) {
        // A refused key (401) stops this device's writes, not its reads: the file is
        // public, so it is read without the key while the device asks to reconnect.
        // A 403 is not taken as a refusal: GitHub also answers secondary limits with it.
        if (requireToken || !(error instanceof GitHubStateRepositoryError && error.status === 401)) throw error;
        return this.readAnonymous(fresh, true);
      }
    }
    if (requireToken) throw new GitHubStateRepositoryError('unauthorized', 'A GitHub token is required for this read.', 401);
    return this.readAnonymous(fresh, false);
  }

  private async readAnonymous(fresh: boolean, tokenRejected: boolean): Promise<{ file: RemoteFile; info: ReadInfo }> {
    const now = this.clock().getTime();
    if (fresh && now >= this.nextAnonymousApiRead) {
      this.nextAnonymousApiRead = now + ANONYMOUS_FRESH_READ_INTERVAL_MS;
      try {
        return this.noteRead(await this.readApi(true, false, true), 'api', false, tokenRejected);
      } catch (error) {
        // The CDN copy stays the anonymous baseline; the API only makes it fresher.
        if (error instanceof GitHubStateRepositoryError && error.retryAt) this.nextAnonymousApiRead = Math.max(this.nextAnonymousApiRead, error.retryAt);
      }
    }
    return this.noteRead(await this.readRaw(), 'cdn', false, tokenRejected);
  }

  private noteRead(file: RemoteFile, source: ReadInfo['source'], authenticated: boolean, tokenRejected: boolean): { file: RemoteFile; info: ReadInfo } {
    const info: ReadInfo = { source, authenticated, tokenRejected, at: this.clock().getTime() };
    this.lastRead = info;
    return { file, info: { ...info } };
  }

  /** The CDN can serve a copy older than a file this device has already read
   * or written, also in an earlier visit; an older copy never replaces a newer one.
   * The API answers for the file as it is now, so it replaces a copy kept from an
   * earlier visit (the file may have been reset since); within one visit nothing
   * older replaces what was seen. */
  private keepNewest(document: StateDocument, source: ReadInfo['source']): StateDocument {
    // Another tab of this browser may have kept a newer file meanwhile.
    const kept = this.readKeptRemote();
    if (kept && (!this.newest || Date.parse(kept.document.updatedAt) > Date.parse(this.newest.updatedAt))) {
      this.newest = kept.document;
      this.newestKeptAt = kept.keptAt;
      this.newestSeen = false;
    }
    const older = this.newest && Date.parse(document.updatedAt) < Date.parse(this.newest.updatedAt);
    const reset = !this.newestSeen && this.clock().getTime() - this.newestKeptAt > KEPT_COPY_TRUST_MS;
    if (older && !reset && (source === 'cdn' || this.newestSeen)) return structuredClone(this.newest!);
    this.remember(document);
    return document;
  }

  private remember(document: StateDocument): void {
    this.newest = structuredClone(document);
    this.newestSeen = true;
    this.newestKeptAt = this.clock().getTime();
    try { this.writeStorage(GITHUB_STATE_REMOTE_KEY, JSON.stringify({ file: this.fileId(), keptAt: this.newestKeptAt, document })); } catch { /* This visit still keeps it. */ }
  }

  private readKeptRemote(): { document: StateDocument; keptAt: number } | undefined {
    try {
      const kept = JSON.parse(this.readStorage(GITHUB_STATE_REMOTE_KEY) ?? 'null') as { file?: unknown; keptAt?: unknown; document?: unknown } | null;
      if (kept?.file !== this.fileId()) return undefined;
      return { document: this.parseDocument(kept.document), keptAt: typeof kept.keptAt === 'number' && Number.isFinite(kept.keptAt) ? kept.keptAt : 0 };
    } catch {
      return undefined;
    }
  }

  private fileId(): string {
    return `${this.owner}/${this.repository}/${this.branch}/${this.path}`;
  }

  /** The newest stamp this device has seen in the shared file for the fields an edit
   * carries, by the rule merge.ts applies: a clear must be newer than the whole record. */
  private seenBookStamp(bookId: string, value: BookStatePayload | null): number {
    const record = this.newest?.books[bookId];
    if (!record) return 0;
    if (value === null) return Date.parse(record.updatedAt);
    return BOOK_FIELDS.filter(field => field in value).reduce((latest, field) => {
      const stamp = record.stamps ? record.stamps[field] : record.updatedAt;
      return stamp ? Math.max(latest, Date.parse(stamp)) : latest;
    }, 0);
  }

  private async readApi(conditional: boolean, allowMissing = false, anonymous = false): Promise<RemoteFile> {
    const token = anonymous ? undefined : this.readStorage(GITHUB_STATE_TOKEN_KEY)?.trim();
    const etag = conditional ? this.cached?.etag : undefined;
    const response = await this.request(`${this.contentsUrl()}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers(token, etag) });
    if (response.status === 304 && this.cached) return structuredClone(this.cached.file);
    if (response.status === 404 && allowMissing) { this.noteSha(''); return { document: emptyStateDocument() }; }
    if (!response.ok) throw this.errorForResponse(response);
    const file = await this.parseContents(response);
    if (file.sha) this.noteSha(file.sha);
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

  /** A new edit's stamp: never earlier than this device's own earlier edits, and
   * after `seen`, the newest shared stamp for what it changes, so an edit made on a
   * clock that runs behind still wins over the value it was made on. */
  private nextTimestamp(store: PendingStore, supplied?: string, seen = 0): string {
    const pendingTime = store.mutations.reduce((latest, item) => Math.max(latest, Date.parse(item.updatedAt)), 0);
    const generated = Math.max(this.clock().getTime(), this.lastMutationTime + 1, pendingTime + 1, seen ? seen + 1 : 0);
    const updatedAt = supplied ?? new Date(generated).toISOString();
    if (!Number.isFinite(Date.parse(updatedAt))) throw new TypeError('A valid updatedAt is required.');
    this.lastMutationTime = Math.max(this.lastMutationTime, Date.parse(updatedAt));
    return updatedAt;
  }

  /** The 30 second window counts from the first unsent change on this device's own
   * clock: a stamp lifted past a shared one never moves it into the future. */
  private windowStart(store: PendingStore, updatedAt: string): string {
    return store.mutations.length && store.since ? store.since : this.onThisClock(updatedAt);
  }

  private onThisClock(stamp: string): string {
    return new Date(Math.min(Date.parse(stamp), this.clock().getTime())).toISOString();
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
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = undefined; }
    const store = value && typeof value === 'object' ? value as Partial<PendingStore> : undefined;
    const listed = Array.isArray(store?.mutations) ? store.mutations as unknown[] : [];
    const mutations = listed.filter((mutation): mutation is PendingStateMutation => {
      try { assertPendingMutation(mutation); return true; } catch { return false; }
    });
    const since = typeof store?.since === 'string' && Number.isFinite(Date.parse(store.since)) ? store.since : this.oldestOnThisClock(mutations);
    if (store && Array.isArray(store.mutations) && mutations.length === listed.length) return { since, mutations };
    return this.rescue(raw, { since, mutations }, false);
  }

  private withoutSent(store: PendingStore): PendingStore {
    const sent = this.uncopied?.sent;
    return sent?.size ? { since: store.since, mutations: store.mutations.filter(item => !sent.has(item.id)) } : store;
  }

  /** Unsent edits are never thrown away: a record that cannot be read in full is copied
   * aside as it was, and the edits that can still be read stay queued. When storage is
   * too full for the copy, the record stays where it is and its readable edits are used
   * from memory; nothing overwrites it until the copy is stored or the reader deletes it. */
  private rescue(raw: string, store: PendingStore, legacy: boolean): PendingStore {
    try {
      this.keepForRecovery(raw, store.mutations.length);
    } catch {
      const same = this.uncopied?.raw === raw ? this.uncopied : undefined;
      this.uncopied = { raw, store, legacy, at: same?.at ?? this.clock().toISOString(), sent: same?.sent ?? new Set() };
      return this.withoutSent(store);
    }
    this.uncopied = undefined;
    try {
      if (store.mutations.length) this.writeStorage(GITHUB_STATE_PENDING_KEY, JSON.stringify(store));
      else if (!legacy) this.removeStorage(GITHUB_STATE_PENDING_KEY);
      if (legacy) this.removeStorage(LEGACY_GITHUB_STATE_PENDING_KEY);
    } catch { /* The copy is kept; the next read finds the same record. */ }
    return store;
  }

  /** Before anything replaces a damaged record whose copy is not stored yet, the copy is
   * stored; while storage is too full for it, this throws and the record stays. */
  private ensureCopied(): void {
    if (!this.uncopied) return;
    this.keepForRecovery(this.uncopied.raw, this.uncopied.store.mutations.length);
    if (this.uncopied.legacy) this.removeStorage(LEGACY_GITHUB_STATE_PENDING_KEY);
    this.uncopied = undefined;
  }

  private oldestOnThisClock(mutations: readonly PendingStateMutation[]): string | null {
    if (!mutations.length) return null;
    return this.onThisClock(new Date(Math.min(...mutations.map(item => Date.parse(item.updatedAt)))).toISOString());
  }

  /** Copies of pending queues that could not be read in full, oldest first, with a
   * damaged record whose copy could not be stored yet last. */
  pendingRecovery(): PendingRecoveryCopy[] {
    const stored = this.readStorage(GITHUB_STATE_RECOVERY_KEY);
    let copies: PendingRecoveryCopy[] = [];
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (!Array.isArray(parsed)) throw new Error('Not a list.');
        copies = parsed.filter((copy): copy is PendingRecoveryCopy => typeof (copy as PendingRecoveryCopy | null)?.raw === 'string');
      } catch {
        // A damaged list is still handed over, as the text it is.
        copies = [{ at: '', kept: 0, raw: stored }];
      }
    }
    const uncopied = this.uncopied;
    if (uncopied && !copies.some(copy => copy.raw === uncopied.raw)) copies.push({ at: uncopied.at, kept: uncopied.store.mutations.length, raw: uncopied.raw });
    return copies;
  }

  hasPendingRecovery(): boolean {
    return Boolean(this.uncopied) || this.readStorage(GITHUB_STATE_RECOVERY_KEY) !== null;
  }

  recoveryStatus(): PendingRecoveryStatus | null {
    if (!this.hasPendingRecovery()) return null;
    const copies = this.pendingRecovery();
    return { copies: copies.length, kept: copies.reduce((total, copy) => total + (Number.isInteger(copy.kept) ? copy.kept : 0), 0), stored: !this.uncopied };
  }

  /** The reader no longer needs the copies (they downloaded them, say). A damaged record
   * whose copy could not be stored is deleted with them; its readable edits stay queued. */
  clearPendingRecovery(): void {
    this.removeStorage(GITHUB_STATE_RECOVERY_KEY);
    const uncopied = this.uncopied;
    if (!uncopied) return;
    const store = this.withoutSent(uncopied.store);
    if (store.mutations.length) this.writeStorage(GITHUB_STATE_PENDING_KEY, JSON.stringify(store));
    else this.removeStorage(GITHUB_STATE_PENDING_KEY);
    if (uncopied.legacy) this.removeStorage(LEGACY_GITHUB_STATE_PENDING_KEY);
    this.uncopied = undefined;
  }

  private keepForRecovery(raw: string, kept: number): void {
    const existing = this.readStorage(GITHUB_STATE_RECOVERY_KEY);
    // A damaged list of copies is itself kept, as text, rather than overwritten.
    const damaged = (): unknown[] => [{ at: this.clock().toISOString(), kept: 0, raw: existing ?? '' } satisfies PendingRecoveryCopy];
    let copies: unknown[];
    try {
      const parsed = JSON.parse(existing ?? '[]') as unknown;
      copies = Array.isArray(parsed) ? parsed : damaged();
    } catch {
      copies = damaged();
    }
    if (copies.some(copy => (copy as PendingRecoveryCopy | null)?.raw === raw)) return;
    copies.push({ at: this.clock().toISOString(), kept, raw } satisfies PendingRecoveryCopy);
    this.writeStorage(GITHUB_STATE_RECOVERY_KEY, JSON.stringify(copies));
  }

  /** Version 1 queued per-book payloads that also carried queue positions.
   * Positions are dropped: the device's current queue is re-queued whole. */
  private migrateLegacyPending(): PendingStore {
    let raw: string | null = null;
    try { raw = this.readStorage(LEGACY_GITHUB_STATE_PENDING_KEY); } catch { return { since: null, mutations: [] }; }
    if (!raw) return { since: null, mutations: [] };
    const mutations: PendingStateMutation[] = [];
    let items: unknown;
    try { items = JSON.parse(raw); } catch { items = undefined; }
    let damaged = !Array.isArray(items);
    for (const item of Array.isArray(items) ? items as unknown[] : []) {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      // Only an object is an edit; anything else is damage, never a clear of the book.
      if (!entry.value || typeof entry.value !== 'object' || Array.isArray(entry.value)) { damaged = true; continue; }
      const value = Object.fromEntries(Object.entries(entry.value).filter(([key]) => key !== 'queuePosition'));
      // An entry that only held a queue position is dropped on purpose.
      if (!Object.keys(value).length) continue;
      const mutation = { id: String(entry.id), kind: 'book', bookId: entry.bookId, updatedAt: entry.updatedAt, value } as PendingStateMutation;
      try { assertPendingMutation(mutation); mutations.push(mutation); } catch { damaged = true; }
    }
    const store: PendingStore = { since: this.oldestOnThisClock(mutations), mutations };
    // A queue that cannot be read in full is rescued like the current one.
    if (damaged) return this.rescue(raw, store, true);
    try {
      if (mutations.length) this.writePending(store);
      this.removeStorage(LEGACY_GITHUB_STATE_PENDING_KEY);
    } catch { /* Keep the legacy copy when storage is unavailable. */ }
    return store;
  }

  private writePending(store: PendingStore): void {
    this.ensureCopied();
    this.writeStorage(GITHUB_STATE_PENDING_KEY, JSON.stringify(store));
  }

  private clearPending(): void {
    this.ensureCopied();
    this.removeStorage(GITHUB_STATE_PENDING_KEY);
    try { this.removeStorage(GITHUB_STATE_PENDING_BASIS_KEY); } catch { /* Pruned with the next queued edit. */ }
  }

  private contentsUrl(): string {
    return `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/contents/${this.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  private noteSha(sha: string): void {
    this.knownSha = sha;
    this.knownShaAt = this.clock().getTime();
  }

  /** state.json's commits on the branch, newest first. */
  private commitsUrl(since: string): string {
    return `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/commits?path=${encodeURIComponent(this.path)}&sha=${encodeURIComponent(this.branch)}&since=${encodeURIComponent(since)}&per_page=${HISTORY_PAGE_SIZE}`;
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

  private async request(url: string, init: RequestInit, timeout = REQUEST_TIMEOUT_MS): Promise<Response> {
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeout) : undefined;
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
