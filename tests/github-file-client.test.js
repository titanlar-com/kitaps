import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GITHUB_REQUEST_HEADERS, GitHubStateRepository, GitHubStateRepositoryError, REQUEST_TIMEOUT_MS } from '../src/state/GitHubStateRepository.ts';
import { GitHubRouteRegistry, RouteRegistryError, emptyRouteDocument, putRoute } from '../src/state/routeRegistry.ts';
import { GITHUB_STATE_TOKEN_KEY } from '../src/state/types.ts';
import { createGitHubFileClient, decodeBase64, encodeBase64 } from '../src/state/githubFile.ts';

// state.json and routes.json share one way of talking to GitHub (ADR 002, phase 5, done on the
// owner's word on 9 November 2026). What the two files do with an answer stays their own.
class Refused extends Error {
  constructor(code, message, status, options) { super(message, options); this.code = code; this.status = status; this.retryAt = options?.retryAt; }
}
const MESSAGES = { transport: 'transport', unauthorized: 'unauthorized', notFound: 'not found', conflict: 'conflict', status: status => `status ${status}` };
const NOW = Date.parse('2026-11-09T10:00:00Z');
const client = (fetcher, extra = {}) => createGitHubFileClient({
  owner: 'titanlar com', repository: 'kitaps-state', branch: 'ana dal', path: 'dosyalar/şu an.json',
  fetcher: () => fetcher, now: () => NOW, timeoutMs: 5000, makeError: (...args) => new Refused(...args), messages: MESSAGES, ...extra,
});
const answer = (status, headers = {}) => new Response(status === 304 ? null : '{}', { status, headers });
const recordTimeouts = t => {
  const asked = [];
  t.mock.method(AbortSignal, 'timeout', ms => { asked.push(ms); return new AbortController().signal; });
  return asked;
};
const errorFor = (status, headers) => client(async () => answer(200)).errorFor(answer(status, headers));

test('every address encodes each part', () => {
  const github = client(async () => answer(200));
  assert.equal(github.contentsUrl(), 'https://api.github.com/repos/titanlar%20com/kitaps-state/contents/dosyalar/%C5%9Fu%20an.json');
  assert.equal(github.rawUrl(), 'https://raw.githubusercontent.com/titanlar%20com/kitaps-state/ana%20dal/dosyalar/%C5%9Fu%20an.json');
  assert.equal(github.repositoryUrl('git/blobs'), 'https://api.github.com/repos/titanlar%20com/kitaps-state/git/blobs');
  assert.equal(github.readUrl(), `${github.contentsUrl()}?ref=ana%20dal`);
});

test('only the headers GitHub\'s CORS preflight allows are sent, and a token only when there is one', () => {
  const github = client(async () => answer(200));
  assert.deepEqual(github.headers(), { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  const full = github.headers('anahtar', '"etag"');
  assert.equal(full.Authorization, 'Bearer anahtar');
  assert.equal(full['If-None-Match'], '"etag"');
  for (const name of Object.keys(full)) assert.ok(GITHUB_REQUEST_HEADERS.includes(name), name);
});

test('text survives the round trip through base64, Turkish letters included', () => {
  const text = 'Kitaplığım: çğıöşü ÇĞİÖŞÜ “tırnak” 📚\n';
  assert.equal(decodeBase64(encodeBase64(text)), text);
  assert.equal(decodeBase64(`${encodeBase64(text).slice(0, 8)}\n ${encodeBase64(text).slice(8)}`), text, 'GitHub folds its base64 with line breaks');
});

test('a request skips the browser cache and has a time limit', async () => {
  const calls = [];
  const github = client(async (url, init) => { calls.push({ url, init }); return answer(200); });
  await github.request('https://example.test/', { method: 'PUT', body: 'x' });
  assert.equal(calls[0].url, 'https://example.test/');
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('a request waits as long as its file asks, and otherwise the file\'s own limit', async t => {
  const asked = recordTimeouts(t);
  const github = client(async () => answer(200));
  await github.request('https://example.test/', {});
  await github.request('https://example.test/', {}, 1234);
  assert.deepEqual(asked, [5000, 1234]);
});

test('a request that cannot reach GitHub is a network error that keeps its cause', async () => {
  const cause = new Error('kablo');
  await assert.rejects(client(async () => { throw cause; }).request('https://example.test/', {}), error => error instanceof Refused && error.code === 'network' && error.message === 'transport' && error.cause === cause);
  await assert.rejects(client(undefined).request('https://example.test/', {}), error => error instanceof Refused && error.code === 'network' && error.message === 'Fetch is unavailable.');
});

test('each refusal has its own code, and a rate limit says when to come back', () => {
  assert.deepEqual([401, 403, 404, 409, 422, 500].map(status => [errorFor(status).code, errorFor(status).status, errorFor(status).message]), [
    ['unauthorized', 401, 'unauthorized'], ['unauthorized', 403, 'unauthorized'], ['not-found', 404, 'not found'],
    ['conflict', 409, 'conflict'], ['conflict', 422, 'conflict'], ['network', 500, 'status 500'],
  ]);
  assert.equal(errorFor(403, { 'X-RateLimit-Remaining': '4990' }).code, 'unauthorized', 'a refused key with quota left is a refused key, not a wait');
  const limited = (status, headers) => { const error = errorFor(status, headers); assert.equal(error.code, 'rate-limited'); return error.retryAt; };
  assert.equal(limited(429, { 'Retry-After': '30' }), NOW + 30_000, 'Retry-After names the wait');
  assert.equal(limited(403, { 'Retry-After': '0' }), NOW, 'a secondary limit is a 403 with Retry-After');
  assert.equal(limited(403, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1793000000' }), 1793000000_000, 'the reset time when the quota is used up');
  assert.equal(limited(429), NOW + 60_000, 'a minute when GitHub says nothing');
  assert.equal(limited(429, { 'Retry-After': 'soon' }), NOW + 60_000, 'a Retry-After that is not a number is ignored');
  assert.equal(limited(403, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': 'x' }), NOW + 60_000);
  assert.equal(limited(429, { 'Retry-After': '30', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1793000000' }), NOW + 30_000, 'Retry-After wins over the reset time');
  assert.equal(limited(429, { 'Retry-After': '-5' }), NOW + 60_000, 'a negative wait is ignored');
  assert.equal(limited(403, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '0' }), NOW + 60_000, 'a reset time of zero is ignored');
});

test('neither file keeps its own copy of the connection', () => {
  for (const file of ['GitHubStateRepository.ts', 'routeRegistry.ts']) {
    const source = fs.readFileSync(new URL(`../src/state/${file}`, import.meta.url), 'utf8');
    for (const copy of ['btoa(', 'atob(', 'AbortSignal', 'api.github.com', 'raw.githubusercontent.com', 'X-GitHub-Api-Version', 'X-RateLimit']) assert.equal(source.includes(copy), false, `${file} still holds ${copy}`);
  }
});

// Each file keeps its own error class and words; the shared code only decides which one applies.
const storage = () => { const values = new Map(); values.set(GITHUB_STATE_TOKEN_KEY, 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests'); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const CLOCK = () => new Date(NOW);
const FILES = [
  ['state.json', () => new GitHubStateRepository({ storage: storage(), clock: CLOCK, fetch: async () => answer(200) }), GitHubStateRepositoryError, ['GitHub rejected the credentials or repository write permission.', 'GitHub state repository or file was not found.', 'GitHub state changed during save. Reload and try again.', 'GitHub state request failed with status 500.']],
  ['routes.json', () => new GitHubRouteRegistry({ storage: storage(), clock: CLOCK, fetch: async () => answer(200) }), RouteRegistryError, ['GitHub rejected the token or its write permission.', 'The routes repository was not found.', 'routes.json changed during the save.', 'GitHub routes request failed with status 500.']],
];

for (const [name, open, Kind, [unauthorized, notFound, conflict, failed]] of FILES) {
  test(`${name} answers each refusal with its own error and words`, () => {
    const { github } = open();
    for (const [status, code, message] of [[401, 'unauthorized', unauthorized], [403, 'unauthorized', unauthorized], [404, 'not-found', notFound], [409, 'conflict', conflict], [422, 'conflict', conflict], [500, 'network', failed]]) {
      const error = github.errorFor(answer(status));
      assert.ok(error instanceof Kind, `${name} ${status}`);
      assert.deepEqual([error.code, error.status, error.message], [code, status, message]);
    }
  });

  test(`${name} counts a rate limit from its own clock`, () => {
    const error = open().github.errorFor(answer(429, { 'Retry-After': '30' }));
    assert.ok(error instanceof Kind);
    assert.equal(error.retryAt, NOW + 30_000);
  });
}

test('a route is written with the full time limit', async t => {
  const asked = recordTimeouts(t);
  const content = Buffer.from(JSON.stringify(emptyRouteDocument('2026-11-09T10:00:00.000Z'))).toString('base64');
  const registry = new GitHubRouteRegistry({ storage: storage(), clock: CLOCK, fetch: async (url, init = {}) => init.method === 'PUT' ? new Response('{"content":{"sha":"yeni"}}', { status: 200 }) : new Response(JSON.stringify({ sha: 'eski', encoding: 'base64', content }), { status: 200 }) });
  await registry.update((routes, now) => putRoute(routes, { id: 'r', title: 'r', date: null, stops: [], note: '', done: false }, now));
  assert.ok(asked.length >= 2, 'a read and a write');
  assert.deepEqual([...new Set(asked)], [REQUEST_TIMEOUT_MS]);
});
