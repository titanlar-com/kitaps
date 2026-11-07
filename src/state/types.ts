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
/** The newest shared file this device has read or written, kept across visits so a
 * reopened page never goes back to an older CDN copy. The shared file alone: unsent
 * edits and bases are kept under their own keys. */
export const GITHUB_STATE_REMOTE_KEY = 'kitapatlasi:github-state:remote:v1';
/** Beside the pending queue, by mutation id: what its format cannot hold (see MutationBasis). */
export const GITHUB_STATE_PENDING_BASIS_KEY = 'kitapatlasi:github-state:pending-basis:v1';
/** Copies of pending queues that could not be read in full, kept for the reader. */
export const GITHUB_STATE_RECOVERY_KEY = 'kitapatlasi:github-state:pending-recovery:v1';
/** Set while a newly connected device has not yet compared its unsent edits with the shared file. */
export const GITHUB_STATE_CONNECT_REVIEW_KEY = 'kitapatlasi:github-state:connect-review:v1';
/** Writes through the API bypass the local Git author guard, so every state commit
 * names the owner's identity itself (the owner's standing authorship rule). */
export const GITHUB_STATE_COMMIT_IDENTITY = { name: 'karacaismail', email: '35493655+karacaismail@users.noreply.github.com' } as const;

export type ReadingState = 'onemli' | 'alinacak' | 'alindi' | 'okunuyor' | 'araverildi' | 'birakildi' | 'okundu';

/** Marks that exclude each other on a book, as the mark buttons set them (toggleState). */
export const EXCLUSIVE_STATE_GROUPS: readonly (readonly ReadingState[])[] = [['alinacak', 'alindi'], ['okunuyor', 'okundu', 'araverildi', 'birakildi']];

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

/** What an unsent edit was made on, kept beside the pending queue by mutation id, so the
 * queue's own format stays the one pages already open on older code read.
 * - `stamps`: when this device last edited each field the edit carries. Edits to one book
 *   are folded into one mutation; each field keeps its own time.
 * - `base`: the value of each field the edit is relative to: as this device showed it
 *   before its first unsent edit, or what this device last sent of it. With a base, the
 *   edit is merged with what another device saved meanwhile (three-way); without one (an
 *   edit queued by older code), the later stamp wins.
 * - `sent`: what this device's writes put in the shared file since the base, newest last,
 *   noted just before each PUT. A write can reach GitHub without the page hearing back (a
 *   phone page closing); when the shared field still carries one of these stamps, that
 *   version is the base. `writes` are the ids of the writes that sent the version, as named
 *   in their commit messages; once state.json's commit history shows one, `landed` is set,
 *   and a version the history shows none of is dropped. */
export type MutationBasis =
  | { kind: 'book'; stamps: Partial<Record<BookField, string>>; base: BookStatePayload; sent?: SentBookVersion[] }
  | { kind: 'queue'; base: string[]; sent?: SentQueueVersion[] };
export interface SentBookVersion { stamps: Partial<Record<BookField, string>>; value: BookStatePayload; writes?: string[]; landed?: true }
export interface SentQueueVersion { stamp: string; value: string[]; writes?: string[]; landed?: true }
/** A write's id in its commit message: `Update Kitaplık state (write <id>)`. */
export const WRITE_ID_PATTERN = /^[a-z0-9-]{8,64}$/;
/** At most this many unconfirmed sends are remembered per edit. */
export const MAX_SENT_VERSIONS = 10;

export interface PendingStore {
  /** When the oldest unsent change was made; the 30 second window counts from here. */
  since: string | null;
  mutations: PendingStateMutation[];
}

/** A pending queue that could not be read in full: when it was found, how many of
 * its edits stayed queued, and the stored text exactly as it was. */
export interface PendingRecoveryCopy {
  at: string;
  kept: number;
  raw: string;
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
