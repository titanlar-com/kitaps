import { GitHubStateRepositoryError, REQUEST_TIMEOUT_MS, type GitHubStateErrorCode } from './GitHubStateRepository.ts';
import { GITHUB_STATE_COMMIT_IDENTITY, GITHUB_STATE_OWNER, GITHUB_STATE_REPOSITORY, GITHUB_STATE_TOKEN_KEY, type StorageLike } from './types.ts';

/** Bookstore routes live in their own file next to state.json, so the reading
 * state file, its schema and older clients stay untouched. */
export const ROUTES_SCHEMA_VERSION = 1 as const;
export const ROUTES_PATH = 'routes.json';
/** The last known routes file merged with this device's unsent changes. */
export const ROUTES_CACHE_KEY = 'kitapatlasi:routes:v1';
/** Route records changed on this device and not yet written to GitHub. */
export const ROUTES_PENDING_KEY = 'kitapatlasi:routes:pending:v1';
export const ROUTES_COMMIT_MESSAGE = 'Update reading routes';
/** Route ids and bookstore ids share one shape: ASCII kebab case, at most 64 characters. */
export const ROUTE_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
export const MAX_ROUTE_STOPS = 12;
export const MAX_ROUTE_TITLE_LENGTH = 120;
export const MAX_ROUTE_NOTE_LENGTH = 500;

export interface PlannedRoute {
  id: string;
  title: string;
  /** Planned day as YYYY-MM-DD, or null while undated. */
  date: string | null;
  /** Bookstore ids in visiting order. The same store may appear in several routes. */
  stops: string[];
  note: string;
  done: boolean;
}

export interface RouteRecord {
  updatedAt: string;
  /** null marks a deleted route, so the deletion reaches other devices too. */
  value: PlannedRoute | null;
}

export interface RouteDocument {
  schemaVersion: typeof ROUTES_SCHEMA_VERSION;
  updatedAt: string;
  routes: Record<string, RouteRecord>;
}

export interface GitHubRouteRegistryOptions {
  owner?: string;
  repository?: string;
  branch?: string;
  path?: string;
  fetch?: typeof globalThis.fetch;
  storage?: StorageLike;
  clock?: () => Date;
  maxConflictRetries?: number;
}

export interface RouteUpdateResult {
  document: RouteDocument;
  /** false: no token, so the change waits on this device for the next update. */
  saved: boolean;
}

/** Extends the state error, so code that already handles sync errors by `code`
 * handles route errors the same way. */
export class RouteRegistryError extends GitHubStateRepositoryError {
  constructor(code: GitHubStateErrorCode, message: string, status?: number, options?: ErrorOptions & { retryAt?: number }) {
    super(code, message, status, options);
    this.name = 'RouteRegistryError';
  }
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
const later = (left: string, right: string): string => Date.parse(left) >= Date.parse(right) ? left : right;
const byKey = ([left]: [string, unknown], [right]: [string, unknown]): number => left < right ? -1 : left > right ? 1 : 0;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toTime(now: Date | string): number {
  const time = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(time)) throw new TypeError('A valid time is required.');
  return time;
}

/** The route as stored, or the name of the first field that is wrong. */
function readRoute(value: unknown): PlannedRoute | string {
  if (!isObject(value)) return 'value';
  const { id, title, date, stops, note, done } = value;
  if (typeof id !== 'string' || !ROUTE_ID_PATTERN.test(id)) return 'id';
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || cleanTitle.length > MAX_ROUTE_TITLE_LENGTH) return 'title';
  if (date !== null && !isCalendarDate(date)) return 'date';
  if (!Array.isArray(stops) || stops.length > MAX_ROUTE_STOPS || new Set(stops).size !== stops.length
    || stops.some(stop => typeof stop !== 'string' || !ROUTE_ID_PATTERN.test(stop))) return 'stops';
  if (typeof note !== 'string' || note.trim().length > MAX_ROUTE_NOTE_LENGTH) return 'note';
  if (typeof done !== 'boolean') return 'done';
  return { id, title: cleanTitle, date: date as string | null, stops: [...stops] as string[], note: note.trim(), done };
}

const cloneRecord = (record: RouteRecord): RouteRecord => ({
  updatedAt: record.updatedAt,
  value: record.value ? { ...record.value, stops: [...record.value.stops] } : null,
});

/** Records sorted by id, so the written file changes only where a route changed. */
const sortedRoutes = (routes: Record<string, RouteRecord>): Record<string, RouteRecord> => Object.fromEntries(Object.entries(routes).sort(byKey));

export function emptyRouteDocument(now?: Date | string): RouteDocument {
  return { schemaVersion: ROUTES_SCHEMA_VERSION, updatedAt: new Date(now === undefined ? 0 : toTime(now)).toISOString(), routes: {} };
}

/** Reads a routes file. A wrong schema version or a broken file throws, so a
 * newer or damaged file is never overwritten. A single malformed record is
 * dropped and the rest is kept. Unknown fields inside a record are ignored. */
export function parseRouteDocument(input: unknown): RouteDocument {
  if (!isObject(input)) throw new RouteRegistryError('invalid-data', 'The routes file must be a JSON object.');
  if (input.schemaVersion !== ROUTES_SCHEMA_VERSION) throw new RouteRegistryError('invalid-data', `Unsupported routes schema version: ${String(input.schemaVersion)}.`);
  if (!isTimestamp(input.updatedAt)) throw new RouteRegistryError('invalid-data', 'The routes file updatedAt must be an ISO timestamp.');
  if (!isObject(input.routes)) throw new RouteRegistryError('invalid-data', 'The routes file must hold a routes object.');
  const routes: Record<string, RouteRecord> = {};
  for (const [id, record] of Object.entries(input.routes)) {
    if (!ROUTE_ID_PATTERN.test(id) || !isObject(record) || !isTimestamp(record.updatedAt)) continue;
    if (record.value === null) {
      routes[id] = { updatedAt: record.updatedAt, value: null };
      continue;
    }
    const value = readRoute(record.value);
    if (typeof value !== 'string' && value.id === id) routes[id] = { updatedAt: record.updatedAt, value };
  }
  return { schemaVersion: ROUTES_SCHEMA_VERSION, updatedAt: input.updatedAt, routes: sortedRoutes(routes) };
}

/** Per route id the record with the newer updatedAt wins; on a tie `b` wins.
 * Deletions are records too, so a newer deletion removes an older route. */
export function mergeRouteDocuments(a: RouteDocument, b: RouteDocument): RouteDocument {
  const routes: Record<string, RouteRecord> = {};
  for (const [id, record] of Object.entries(a.routes)) routes[id] = cloneRecord(record);
  for (const [id, record] of Object.entries(b.routes)) {
    const existing = own(routes, id);
    if (!existing || Date.parse(record.updatedAt) >= Date.parse(existing.updatedAt)) routes[id] = cloneRecord(record);
  }
  return { schemaVersion: ROUTES_SCHEMA_VERSION, updatedAt: later(a.updatedAt, b.updatedAt), routes: sortedRoutes(routes) };
}

/** A new record always moves past the one it replaces, even when this device's
 * clock is behind the device that wrote the old one. */
function withRecord(doc: RouteDocument, id: string, value: PlannedRoute | null, now: Date | string): RouteDocument {
  const previous = own(doc.routes, id);
  const time = Math.max(toTime(now), previous ? Date.parse(previous.updatedAt) + 1 : -Infinity);
  const updatedAt = new Date(time).toISOString();
  const routes: Record<string, RouteRecord> = {};
  for (const [key, record] of Object.entries(doc.routes)) routes[key] = cloneRecord(record);
  routes[id] = { updatedAt, value };
  return { schemaVersion: ROUTES_SCHEMA_VERSION, updatedAt: later(doc.updatedAt, updatedAt), routes: sortedRoutes(routes) };
}

/** Adds or replaces a route. The title and note are trimmed; an invalid route throws a TypeError. */
export function putRoute(doc: RouteDocument, route: PlannedRoute, now: Date | string): RouteDocument {
  const value = readRoute(route);
  if (typeof value === 'string') throw new TypeError(`Invalid route ${value}.`);
  return withRecord(doc, value.id, value, now);
}

/** Marks a route deleted. The deletion is kept as a record so other devices drop it too. */
export function removeRoute(doc: RouteDocument, id: string, now: Date | string): RouteDocument {
  if (typeof id !== 'string' || !ROUTE_ID_PATTERN.test(id)) throw new TypeError('Invalid route id.');
  return withRecord(doc, id, null, now);
}

/** Live routes: dated ones by day (then title), then undated ones by title, in Turkish order. */
export function listRoutes(doc: RouteDocument): PlannedRoute[] {
  return Object.values(doc.routes)
    .flatMap(record => record.value ? [cloneRecord(record).value as PlannedRoute] : [])
    .sort((left, right) => {
      if (left.date !== right.date) {
        if (left.date === null) return 1;
        if (right.date === null) return -1;
        return left.date < right.date ? -1 : 1;
      }
      return left.title.localeCompare(right.title, 'tr') || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    });
}

const TURKISH_LETTERS: Record<string, string> = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' };

/** An ASCII kebab-case id from a Turkish title ("Kadıköy turu" → "kadikoy-turu"),
 * made unique with a numeric suffix ("-2", "-3", …). */
export function newRouteId(title: string, existingIds: Iterable<string> = []): string {
  const base = String(title ?? '')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, letter => TURKISH_LETTERS[letter])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rota';
  const fit = (length: number): string => base.slice(0, length).replace(/-+$/, '');
  const taken = new Set(existingIds);
  let candidate = fit(64);
  for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${fit(64 - String(suffix).length - 1)}-${suffix}`;
  return candidate;
}

interface GitHubContentsResponse {
  sha?: unknown;
  content?: unknown;
  encoding?: unknown;
}

interface RemoteRoutes {
  document: RouteDocument;
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

/** UTF-8 safe in Node and the browser: btoa/atob only take one byte per character. */
const encodeBase64 = (value: string): string => {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeBase64 = (value: string): string => {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
};

const header = (response: Response, name: string): string => response.headers?.get?.(name) ?? '';

/** True when `written` already holds this record, as itself or as a newer one. */
const holds = (written: RouteDocument, id: string, record: RouteRecord): boolean => {
  const saved = own(written.routes, id);
  return saved !== undefined && Date.parse(saved.updatedAt) >= Date.parse(record.updatedAt);
};

const covers = (written: RouteDocument, pending: RouteDocument): boolean => Object.entries(pending.routes).every(([id, record]) => holds(written, id, record));

/** Records `next` adds or changes compared with `current`. Each must be valid. */
function changedRecords(current: RouteDocument, next: RouteDocument, updatedAt: string): RouteDocument {
  let checked: RouteDocument;
  try { checked = parseRouteDocument(next); } catch (error) { throw new TypeError('The route update must return a routes document.', { cause: error }); }
  const routes: Record<string, RouteRecord> = {};
  for (const id of Object.keys(next.routes)) {
    const record = own(checked.routes, id);
    if (!record) throw new TypeError(`Invalid route record ${id}.`);
    const before = own(current.routes, id);
    if (!before || JSON.stringify(before) !== JSON.stringify(record)) routes[id] = record;
  }
  return { schemaVersion: ROUTES_SCHEMA_VERSION, updatedAt, routes };
}

/** Saves routes.json in the public state repository with the same token the
 * reading state uses. Changes are kept on the device first and written to
 * GitHub when a token is present; without one they wait for the next update. */
export class GitHubRouteRegistry {
  static readonly CACHE_KEY = ROUTES_CACHE_KEY;
  static readonly PENDING_KEY = ROUTES_PENDING_KEY;

  private readonly owner: string;
  private readonly repository: string;
  private readonly branch: string;
  private readonly path: string;
  private readonly storage: StorageLike;
  private readonly fetcher?: typeof globalThis.fetch;
  private readonly clock: () => Date;
  private readonly maxConflictRetries: number;
  /** Writes from this page run one after another, so they never conflict with each other. */
  private writing: Promise<unknown> = Promise.resolve();

  constructor(options: GitHubRouteRegistryOptions = {}) {
    this.owner = options.owner ?? GITHUB_STATE_OWNER;
    this.repository = options.repository ?? GITHUB_STATE_REPOSITORY;
    this.branch = options.branch ?? 'main';
    this.path = options.path ?? ROUTES_PATH;
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? memoryStorage() : localStorage);
    this.fetcher = options.fetch;
    this.clock = options.clock ?? (() => new Date());
    this.maxConflictRetries = Math.max(0, options.maxConflictRetries ?? 3);
  }

  hasToken(): boolean {
    return Boolean(this.token());
  }

  /** How many route changes wait on this device. */
  pendingCount(): number {
    return Object.keys(this.readDocument(ROUTES_PENDING_KEY).routes).length;
  }

  /** The routes as this device last knew them, with its unsent changes. Never throws. */
  cached(): RouteDocument {
    return mergeRouteDocuments(this.readDocument(ROUTES_CACHE_KEY), this.readDocument(ROUTES_PENDING_KEY));
  }

  /** Reads routes.json (the API with a token, the CDN copy without one) and adds
   * this device's unsent changes. A missing file is an empty document. */
  async load(): Promise<RouteDocument> {
    const remote = await this.readRemote();
    const document = mergeRouteDocuments(remote.document, this.prunePending(remote.document));
    this.writeCache(document);
    return document;
  }

  /** Applies `mutate` (use putRoute/removeRoute) on this device first, then writes
   * routes.json when a token is stored. Any failure keeps the change pending. */
  async update(mutate: (doc: RouteDocument, now: Date) => RouteDocument): Promise<RouteUpdateResult> {
    const now = this.clock();
    const current = this.cached();
    const changes = changedRecords(current, mutate(structuredClone(current), now), now.toISOString());
    if (Object.keys(changes.routes).length) {
      this.writeDocument(ROUTES_PENDING_KEY, mergeRouteDocuments(this.readDocument(ROUTES_PENDING_KEY), changes));
      this.writeCache(mergeRouteDocuments(this.readDocument(ROUTES_CACHE_KEY), changes));
    }
    if (!this.token()) return { document: this.cached(), saved: false };
    return this.serialize(() => this.send());
  }

  /** Sends changes that waited without a token. */
  flush(): Promise<RouteUpdateResult> {
    return this.update(doc => doc);
  }

  private async send(): Promise<RouteUpdateResult> {
    const token = this.token();
    if (!token) return { document: this.cached(), saved: false };
    for (let attempt = 0; attempt <= this.maxConflictRetries; attempt += 1) {
      const remote = await this.readApi(token);
      const pending = this.readDocument(ROUTES_PENDING_KEY);
      if (covers(remote.document, pending)) {
        // Nothing new for GitHub (another tab may have sent it already): no empty commit.
        const document = mergeRouteDocuments(remote.document, this.prunePending(remote.document));
        this.writeCache(document);
        return { document, saved: true };
      }
      const merged = mergeRouteDocuments(remote.document, pending);
      merged.updatedAt = later(merged.updatedAt, this.clock().toISOString());
      const response = await this.request(this.contentsUrl(), {
        method: 'PUT',
        headers: this.headers(token),
        body: JSON.stringify({
          message: ROUTES_COMMIT_MESSAGE,
          content: encodeBase64(`${JSON.stringify(merged, null, 2)}\n`),
          branch: this.branch,
          author: { ...GITHUB_STATE_COMMIT_IDENTITY },
          committer: { ...GITHUB_STATE_COMMIT_IDENTITY },
          ...(remote.sha ? { sha: remote.sha } : {}),
        }),
      });
      // Another device wrote in between: read the new file and merge again.
      if (response.status === 409 || response.status === 422) continue;
      if (!response.ok) throw this.errorForResponse(response);
      const document = mergeRouteDocuments(merged, this.prunePending(merged));
      this.writeCache(document);
      return { document, saved: true };
    }
    throw new RouteRegistryError('conflict', 'routes.json kept changing during the save. Try again.', 409);
  }

  private async readRemote(): Promise<RemoteRoutes> {
    const token = this.token();
    if (token) {
      try {
        return await this.readApi(token);
      } catch (error) {
        // The file is public: a refused token stops writes, not reads.
        if (!(error instanceof GitHubStateRepositoryError && error.status === 401)) throw error;
      }
    }
    return this.readRaw();
  }

  private async readApi(token: string): Promise<RemoteRoutes> {
    const response = await this.request(`${this.contentsUrl()}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers(token) });
    if (response.status === 404) return { document: emptyRouteDocument() };
    if (!response.ok) throw this.errorForResponse(response);
    try {
      const payload = await response.json() as GitHubContentsResponse;
      if (payload.encoding !== 'base64' || typeof payload.content !== 'string' || typeof payload.sha !== 'string') throw new Error('Incomplete Contents API response.');
      return { document: parseRouteDocument(JSON.parse(decodeBase64(payload.content))), sha: payload.sha };
    } catch (error) {
      throw error instanceof RouteRegistryError ? error : new RouteRegistryError('invalid-data', 'routes.json on GitHub is invalid.', undefined, { cause: error });
    }
  }

  private async readRaw(): Promise<RemoteRoutes> {
    // A plain GET without custom headers needs no CORS preflight; the query skips stale CDN copies.
    const response = await this.request(`${this.rawUrl()}?t=${this.clock().getTime()}`, {});
    if (response.status === 404) return { document: emptyRouteDocument() };
    if (!response.ok) throw this.errorForResponse(response);
    try {
      return { document: parseRouteDocument(await response.json()) };
    } catch (error) {
      throw error instanceof RouteRegistryError ? error : new RouteRegistryError('invalid-data', 'routes.json on GitHub is invalid.', undefined, { cause: error });
    }
  }

  private token(): string | undefined {
    try { return this.storage.getItem(GITHUB_STATE_TOKEN_KEY)?.trim() || undefined; } catch { return undefined; }
  }

  private readDocument(key: string): RouteDocument {
    try {
      const raw = this.storage.getItem(key);
      return raw ? parseRouteDocument(JSON.parse(raw)) : emptyRouteDocument();
    } catch {
      return emptyRouteDocument();
    }
  }

  private writeDocument(key: string, document: RouteDocument): void {
    try { this.storage.setItem(key, JSON.stringify(document)); }
    catch (error) { throw new RouteRegistryError('storage', 'Local route storage is full or unavailable.', undefined, { cause: error }); }
  }

  /** The cache only speeds up the first paint; losing it loses nothing. */
  private writeCache(document: RouteDocument): void {
    try { this.storage.setItem(ROUTES_CACHE_KEY, JSON.stringify(document)); } catch { /* Rebuilt by the next load. */ }
  }

  /** Drops pending records that `written` already holds (or holds newer) and
   * returns the rest. Changes made while a write was in flight stay pending. */
  private prunePending(written: RouteDocument): RouteDocument {
    const pending = this.readDocument(ROUTES_PENDING_KEY);
    const routes = Object.fromEntries(Object.entries(pending.routes).filter(([id, record]) => !holds(written, id, record)));
    const rest: RouteDocument = { ...pending, routes };
    try {
      if (Object.keys(routes).length) this.storage.setItem(ROUTES_PENDING_KEY, JSON.stringify(rest));
      else this.storage.removeItem(ROUTES_PENDING_KEY);
    } catch { /* Kept records are sent again; merging makes that harmless. */ }
    return rest;
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writing.then(task, task);
    this.writing = run.catch(() => undefined);
    return run;
  }

  private contentsUrl(): string {
    return `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/contents/${this.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  private rawUrl(): string {
    return `https://raw.githubusercontent.com/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}/${encodeURIComponent(this.branch)}/${this.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** The same three headers the state repository sends; GitHub's CORS preflight allows them. */
  private headers(token: string): Record<string, string> {
    return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}` };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const fetcher = this.fetcher ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetcher) throw new RouteRegistryError('network', 'Fetch is unavailable.');
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
    try {
      return await fetcher(url, { ...init, cache: 'no-store', ...(signal ? { signal } : {}) });
    } catch (error) {
      throw new RouteRegistryError('network', 'GitHub routes request failed.', undefined, { cause: error });
    }
  }

  private errorForResponse(response: Response): RouteRegistryError {
    const status = response.status;
    const remaining = header(response, 'X-RateLimit-Remaining');
    const retryAfter = header(response, 'Retry-After');
    // GitHub also answers rate limits with 403; those are not a refused token.
    if (status === 429 || (status === 403 && (remaining === '0' || retryAfter !== ''))) {
      const seconds = Number(retryAfter);
      const reset = Number(header(response, 'X-RateLimit-Reset'));
      const now = this.clock().getTime();
      const retryAt = retryAfter !== '' && Number.isFinite(seconds) && seconds >= 0 ? now + seconds * 1000
        : remaining === '0' && Number.isFinite(reset) && reset > 0 ? reset * 1000
          : now + 60_000;
      return new RouteRegistryError('rate-limited', 'GitHub rate limit reached.', status, { retryAt });
    }
    if (status === 401 || status === 403) return new RouteRegistryError('unauthorized', 'GitHub rejected the token or its write permission.', status);
    if (status === 404) return new RouteRegistryError('not-found', 'The routes repository was not found.', 404);
    if (status === 409 || status === 422) return new RouteRegistryError('conflict', 'routes.json changed during the save.', status);
    return new RouteRegistryError('network', `GitHub routes request failed with status ${status}.`, status);
  }
}
