export const STATE_SCHEMA_VERSION = 2 as const;
export const LEGACY_STATE_SCHEMA_VERSION = 1 as const;
export const MAX_QUEUE_LENGTH = 5;
/** The public repository that holds state.json. A write token must name this
 * owner (an organisation) as its resource owner, or it cannot reach the repository. */
export const GITHUB_STATE_OWNER = 'titanlar-com';
export const GITHUB_STATE_REPOSITORY = 'kitaps-state';
export const GITHUB_STATE_TOKEN_KEY = 'kitapatlasi:github-state:token:v1';
export const GITHUB_STATE_PENDING_KEY = 'kitapatlasi:github-state:pending:v2';
export const LEGACY_GITHUB_STATE_PENDING_KEY = 'kitapatlasi:github-state:pending:v1';
export const GITHUB_STATE_MIGRATION_KEY = 'kitapatlasi:github-state:migrated:v1';
export const GITHUB_STATE_BACKUP_KEY = 'kitapatlasi:github-state:pre-sync-backup:v1';
/** Field stamps of the shared file as this device last took them over. */
export const GITHUB_STATE_BASE_KEY = 'kitapatlasi:github-state:base:v1';
/** Set while a newly connected device has not yet compared its unsent edits with the shared file. */
export const GITHUB_STATE_CONNECT_REVIEW_KEY = 'kitapatlasi:github-state:connect-review:v1';

export type ReadingState = 'onemli' | 'alinacak' | 'alindi' | 'okunuyor' | 'araverildi' | 'birakildi' | 'okundu';

export interface ReadingProgress {
  startedAt?: string;
  finishedAt?: string;
  page?: number;
  totalPages?: number;
  why?: string;
  apply?: string;
}

export interface BookStatePayload {
  states?: ReadingState[];
  reading?: ReadingProgress | null;
}

export type BookField = keyof BookStatePayload;
export const BOOK_FIELDS: readonly BookField[] = ['states', 'reading'];

export interface BookStateRecord {
  /** The newest edit to any field of this book. */
  updatedAt: string;
  value: BookStatePayload | null;
  /** Edit time per field, so concurrent devices merge field by field. */
  stamps?: Partial<Record<BookField, string>>;
}

/** The personal reading queue is one ordered record, never per-book positions. */
export interface QueueRecord {
  updatedAt: string;
  value: string[];
}

export interface StateDocument {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  updatedAt: string;
  books: Record<string, BookStateRecord>;
  queue: QueueRecord | null;
}

export type PendingStateMutation =
  | { id: string; kind: 'book'; bookId: string; updatedAt: string; value: BookStatePayload | null }
  | { id: string; kind: 'queue'; updatedAt: string; value: string[] };

export interface PendingStore {
  /** When the oldest unsent change was made; the 120 second window counts from here. */
  since: string | null;
  mutations: PendingStateMutation[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GitHubStateRepositoryOptions {
  owner?: string;
  repository?: string;
  path?: string;
  branch?: string;
  storage?: StorageLike;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
  maxConflictRetries?: number;
}

/** What this device last saw of the shared file: per book the stamp of each field, and the queue's stamp. */
export interface StateBases {
  books: Record<string, Partial<Record<BookField, string>>>;
  queue?: string;
}
