import type { GitHubStateErrorCode } from './GitHubStateRepository.ts';

/**
 * The one way the state.json and routes.json clients talk to GitHub (ADR 002, phase 5): addresses, headers,
 * base64, time limits and what each refusal means. Reading, merging and retrying stay with each
 * file, because the two keep different promises about a reader's data.
 */
type Fetch = typeof globalThis.fetch;
type MakeError<E extends Error> = (code: GitHubStateErrorCode, message: string, status?: number, options?: ErrorOptions & { retryAt?: number }) => E;

export interface GitHubFileClientOptions<E extends Error> {
  owner: string;
  repository: string;
  branch: string;
  path: string;
  /** Asked at each request, so a page can gain `fetch` after the client is built. */
  fetcher: () => Fetch | undefined;
  /** Milliseconds, the same clock the file's own timestamps use. */
  now: () => number;
  timeoutMs: number;
  makeError: MakeError<E>;
  messages: { transport: string; unauthorized: string; notFound: string; conflict: string; status: (status: number) => string };
}

/** Only these request headers are sent. GitHub's CORS preflight rejects any
 * other custom header (Cache-Control included), which would block every
 * browser request; tests pin this list. */
export const GITHUB_REQUEST_HEADERS = ['Accept', 'X-GitHub-Api-Version', 'Authorization', 'If-None-Match'] as const;

/** UTF-8 safe in Node and the browser: btoa and atob only take one byte per character. */
export const encodeBase64 = (value: string): string => {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** GitHub folds its base64 with line breaks. */
export const decodeBase64 = (value: string): string => {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
};

export const responseHeader = (response: Response, name: string): string => response.headers?.get?.(name) ?? '';

export function createGitHubFileClient<E extends Error>({ owner, repository, branch, path, fetcher, now, timeoutMs, makeError, messages }: GitHubFileClientOptions<E>) {
  const home = `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const file = path.split('/').map(encodeURIComponent).join('/');
  const repositoryUrl = (rest: string): string => `https://api.github.com/repos/${home}/${rest}`;
  const contentsUrl = (): string => repositoryUrl(`contents/${file}`);

  return {
    repositoryUrl,
    contentsUrl,
    /** The file on this branch, through the API. */
    readUrl: (): string => `${contentsUrl()}?ref=${encodeURIComponent(branch)}`,
    /** The file through GitHub's cached copy, which needs no token. */
    rawUrl: (): string => `https://raw.githubusercontent.com/${home}/${encodeURIComponent(branch)}/${file}`,

    /** GITHUB_REQUEST_HEADERS names the only headers GitHub's CORS preflight allows. */
    headers: (token?: string, etag?: string): Record<string, string> => ({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(etag ? { 'If-None-Match': etag } : {}),
    }),

    async request(url: string, init: RequestInit, timeout = timeoutMs): Promise<Response> {
      const send = fetcher();
      if (!send) throw makeError('network', 'Fetch is unavailable.');
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeout) : undefined;
      try {
        return await send(url, { ...init, cache: 'no-store', ...(signal ? { signal } : {}) });
      } catch (error) {
        throw makeError('network', messages.transport, undefined, { cause: error });
      }
    },

    errorFor(response: Response): E {
      const { status } = response;
      const remaining = responseHeader(response, 'X-RateLimit-Remaining');
      const retryAfter = responseHeader(response, 'Retry-After');
      // GitHub also answers rate limits with 403; a secondary limit is a 403 with Retry-After
      // while the hourly quota remains. Those are not a refused token.
      if (status === 429 || (status === 403 && (remaining === '0' || retryAfter !== ''))) {
        const seconds = Number(retryAfter);
        const reset = Number(responseHeader(response, 'X-RateLimit-Reset'));
        // Retry-After names the wait for this answer; the reset time applies once the quota is
        // used up. Without either, a minute.
        const retryAt = retryAfter !== '' && Number.isFinite(seconds) && seconds >= 0 ? now() + seconds * 1000
          : remaining === '0' && Number.isFinite(reset) && reset > 0 ? reset * 1000
            : now() + 60_000;
        return makeError('rate-limited', 'GitHub rate limit reached.', status, { retryAt });
      }
      if (status === 401 || status === 403) return makeError('unauthorized', messages.unauthorized, status);
      if (status === 404) return makeError('not-found', messages.notFound, 404);
      if (status === 409 || status === 422) return makeError('conflict', messages.conflict, status);
      return makeError('network', messages.status(status), status);
    },
  };
}

export type GitHubFileClient<E extends Error> = ReturnType<typeof createGitHubFileClient<E>>;
