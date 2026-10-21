import { GitHubStateRepository, GitHubStateRepositoryError, type GitHubStateErrorCode } from './GitHubStateRepository.ts';
import type { BookStatePayload, PendingStateMutation } from './types.ts';

/** The project owner's decision of 22 October 2026: 30 seconds (it was 120). */
export const MIN_GITHUB_SYNC_DELAY_MS = 30_000;

/** Failures only the reader can fix (a refused key, full storage, a broken or
 * missing file): retrying cannot help, so the queue waits for them. */
export const PERMANENT_SYNC_ERRORS: ReadonlySet<GitHubStateErrorCode> = new Set(['unauthorized', 'storage', 'invalid-data', 'not-found', 'token-type', 'read-only']);
export const isPermanentSyncError = (error: unknown): boolean => error instanceof GitHubStateRepositoryError && PERMANENT_SYNC_ERRORS.has(error.code);

export interface GitHubStateBatcherOptions {
  delayMs?: number;
  retryDelaysMs?: number[];
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Persists every mutation immediately, then coalesces remote writes into one
 * flush at least 30 seconds after the first unsent change. The window is
 * measured from that stored change time, not from the page load, so a change
 * made in a short visit is sent on the next visit once the window has passed.
 * Disposing only cancels the timer; the local queue survives navigation.
 */
export class GitHubStateBatcher {
  readonly delayMs: number;

  private timer?: ReturnType<typeof setTimeout>;
  private readonly repository: GitHubStateRepository;
  private readonly flush: () => Promise<unknown>;
  private readonly now: () => number;
  private readonly scheduleTimer: NonNullable<GitHubStateBatcherOptions['setTimeout']>;
  private readonly cancelTimer: NonNullable<GitHubStateBatcherOptions['clearTimeout']>;
  private readonly retryDelaysMs: number[];
  private retryAttempt = 0;

  constructor(
    repository: GitHubStateRepository,
    flush: () => Promise<unknown>,
    options: GitHubStateBatcherOptions = {},
  ) {
    this.repository = repository;
    this.flush = flush;
    this.delayMs = Math.max(MIN_GITHUB_SYNC_DELAY_MS, options.delayMs ?? MIN_GITHUB_SYNC_DELAY_MS);
    this.now = options.now ?? Date.now;
    this.scheduleTimer = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimer = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    // After the last step the batcher keeps retrying at that step while changes wait.
    this.retryDelaysMs = options.retryDelaysMs?.length ? options.retryDelaysMs : [15_000, 30_000, 60_000, 120_000, 300_000];
  }

  queueBookState(
    bookId: string,
    value: BookStatePayload | null,
    updatedAt?: string,
    schedule = true,
  ): PendingStateMutation {
    const mutation = this.repository.queueBookState(bookId, value, updatedAt);
    if (schedule) this.schedule();
    return mutation;
  }

  queueQueueState(queue: readonly string[], updatedAt?: string, schedule = true): PendingStateMutation {
    const mutation = this.repository.queueQueueState(queue, updatedAt);
    if (schedule) this.schedule();
    return mutation;
  }

  /** Milliseconds until the oldest pending change is 30 seconds old. */
  remainingDelay(): number {
    const since = Date.parse(this.repository.getPendingSince() ?? '');
    if (!Number.isFinite(since)) return this.delayMs;
    return Math.max(0, since + this.delayMs - this.now());
  }

  schedule(): void {
    if (!this.repository.getPendingCount()) return;
    if (this.timer !== undefined) return;
    this.retryAttempt = 0;
    this.setFlushTimer(this.remainingDelay());
  }

  private setFlushTimer(delayMs: number): void {
    // Only one timer may exist; a replaced handle could no longer be cancelled.
    this.cancel();
    this.timer = this.scheduleTimer(() => {
      this.timer = undefined;
      void this.flush().then(() => { this.retryAttempt = 0; }).catch((error: unknown) => {
        if (!this.repository.getPendingCount() || isPermanentSyncError(error)) return;
        const step = Math.max(0, this.retryDelaysMs[Math.min(this.retryAttempt, this.retryDelaysMs.length - 1)]);
        this.retryAttempt += 1;
        // A rate limit names when GitHub accepts requests again; nothing is sent before then.
        const retryAt = error instanceof GitHubStateRepositoryError ? error.retryAt : undefined;
        this.setFlushTimer(retryAt ? Math.max(step, retryAt - this.now()) : step);
      });
    }, delayMs);
  }

  cancel(): void {
    if (this.timer === undefined) return;
    this.cancelTimer(this.timer);
    this.timer = undefined;
  }

  dispose(): void {
    this.cancel();
  }
}
