import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SHARED_REFRESH_MS, useGitHubStateSync, readSyncBackup } from '../../src/state/useGitHubStateSync';

const remoteDocument = (books, queue = null) => ({ schemaVersion: 2, updatedAt: '2026-09-28T10:00:00.000Z', books, queue });
const record = value => ({ updatedAt: '2026-09-28T10:00:00.000Z', value });
const BOOK_IDS = ['a', 'b', 'c'];
const pending = () => JSON.parse(localStorage.getItem('kitapatlasi:github-state:pending:v2') || '{"mutations":[]}').mutations;
// Deliberately not shaped like a real token so secret scanners stay quiet.
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';

/** A stand-in for GitHub: the CDN copy, the Contents API, the blob probe and saves.
 * `puts` lists answers for successive saves (default 200); `gate` holds saves until released. */
function github(remote, { blob = 201, puts = [] } = {}) {
  const calls = [];
  let release = null;
  const server = { calls, current: () => remote, set(next) { remote = next; }, hold() { let open; const gate = new Promise(resolve => { open = resolve; }); release = { gate, open }; return () => open(); } };
  server.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', init });
    if (url.startsWith('https://raw.')) {
      // The CDN can lag behind the API: `rawDoc` stands for its older copy.
      if (server.rawDelay) await new Promise(resolve => setTimeout(resolve, server.rawDelay));
      return new Response(JSON.stringify(server.rawDoc ?? remote));
    }
    // A slow API read lets timers fire while a comparison waits for GitHub.
    if (server.readDelay && !init.method) await new Promise(resolve => setTimeout(resolve, server.readDelay));
    if (url.endsWith('/git/blobs')) return new Response('{}', { status: blob });
    if (init.method === 'PUT') {
      if (release) { const { gate } = release; release = null; await gate; }
      const status = puts.shift() ?? 200;
      if (status !== 200) return new Response('{}', { status });
      remote = JSON.parse(atob(JSON.parse(init.body).content));
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify({ sha: 'sha-1', encoding: 'base64', content: btoa(JSON.stringify(remote)) }));
  });
  return server;
}
const putsOf = server => server.calls.filter(call => call.method === 'PUT');

const hidePage = () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
};

function useHarness(initialStates, initialPersonal) {
  const [states, setStates] = useState(initialStates);
  const [personal, setPersonal] = useState(initialPersonal);
  const sync = useGitHubStateSync({ bookIds: BOOK_IDS, states, setStates, personal, setPersonal });
  return { sync, states, setStates, personal };
}

describe('useGitHubStateSync on a device that has never synced', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('adds device-only records, and asks before touching a record both sides changed', async () => {
    vi.stubGlobal('fetch', github(remoteDocument({ a: record({ states: ['okundu'] }) })).fetch);
    const { result } = renderHook(() => useHarness({ a: ['onemli'], b: ['alindi'] }, { queue: ['b'], reading: {} }));
    await waitFor(() => expect(result.current.sync.mergePrompt).toEqual({ conflicts: ['a'], queueConflict: false, reason: 'first-sync' }));
    expect(result.current.states.a).toEqual(['onemli']);
    expect(pending().map(item => item.kind === 'queue' ? 'queue' : item.bookId).sort()).toEqual(['b', 'queue']);
    expect(readSyncBackup().states).toEqual({ a: ['onemli'], b: ['alindi'] });
    expect(localStorage.getItem('kitapatlasi:github-state:migrated:v1')).toBeNull();

    await act(() => result.current.sync.resolveMerge('shared'));
    expect(result.current.states.a).toEqual(['okundu']);
    expect(result.current.states.b).toEqual(['alindi']);
    expect(result.current.sync.mergePrompt).toBeNull();
    expect(pending().some(item => item.bookId === 'a')).toBe(false);
    expect(localStorage.getItem('kitapatlasi:github-state:migrated:v1')).toBe('1');
  });

  it('keeps this device’s value and queues it when the reader chooses so', async () => {
    vi.stubGlobal('fetch', github(remoteDocument({ a: record({ states: ['okundu'] }) }, { updatedAt: '2026-09-28T10:00:00.000Z', value: ['c'] })).fetch);
    const { result } = renderHook(() => useHarness({ a: ['onemli'] }, { queue: ['a'], reading: {} }));
    await waitFor(() => expect(result.current.sync.mergePrompt).toEqual({ conflicts: ['a'], queueConflict: true, reason: 'first-sync' }));
    await act(() => result.current.sync.resolveMerge('device'));
    expect(result.current.states.a).toEqual(['onemli']);
    expect(result.current.personal.queue).toEqual(['a']);
    const queued = pending();
    expect(queued.find(item => item.bookId === 'a').value.states).toEqual(['onemli']);
    expect(queued.find(item => item.kind === 'queue').value).toEqual(['a']);
  });

  it('seeds an empty shared file without asking', async () => {
    vi.stubGlobal('fetch', github(remoteDocument({})).fetch);
    const { result } = renderHook(() => useHarness({ a: ['onemli'] }, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).not.toBe('loading'));
    expect(result.current.sync.mergePrompt).toBeNull();
    expect(pending().map(item => item.bookId)).toEqual(['a']);
    expect(localStorage.getItem('kitapatlasi:github-state:migrated:v1')).toBe('1');
    expect(result.current.sync.message).toMatch(/bu cihazı bağla/);
  });

  it('opens with a fresh API copy, and reads the CDN with a simple request when GitHub refuses', async () => {
    const fetch = vi.fn(async url => url.startsWith('https://raw.')
      ? new Response(JSON.stringify(remoteDocument({})))
      : new Response('{}', { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '4102444800' } }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    const [[apiUrl, apiInit], [cdnUrl, cdnInit]] = fetch.mock.calls;
    expect(apiUrl).toMatch(/^https:\/\/api\.github\.com\/repos\/titanlar-com\/kitaps-state\/contents\/state\.json/);
    expect(apiInit.headers.Authorization).toBeUndefined();
    expect(cdnUrl).toBe('https://raw.githubusercontent.com/titanlar-com/kitaps-state/main/state.json');
    expect(cdnInit.headers).toBeUndefined();
  });
});

describe('useGitHubStateSync getting changes off the device', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('kitapatlasi:github-state:migrated:v1', '1'); });
  afterEach(() => { vi.unstubAllGlobals(); delete document.visibilityState; });

  it('a connected device sends a waiting change as soon as the page is hidden', async () => {
    localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN);
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['alindi'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    expect(server.calls.some(call => call.method === 'PUT')).toBe(false);
    act(hidePage);
    await waitFor(() => expect(server.current().books.a?.value.states).toEqual(['alindi']));
    await waitFor(() => expect(result.current.sync.pending).toBe(0));
  });

  it('a visible page reads the shared file again 30 seconds after its last read, not a whole period later', async () => {
    expect(SHARED_REFRESH_MS).toBe(30_000);
    localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN);
    const server = github(remoteDocument({}));
    // The first read ends a little after the page starts its timers, as in a browser.
    server.readDelay = 30;
    vi.stubGlobal('fetch', server.fetch);
    const realSetInterval = window.setInterval.bind(window);
    const checks = [];
    // The testing library polls with short intervals of its own; only the page's checks are recorded.
    const spy = vi.spyOn(window, 'setInterval').mockImplementation((callback, delay, ...rest) => {
      if (delay < 1000) return realSetInterval(callback, delay, ...rest);
      checks.push({ callback, delay, from: Date.now() });
      return realSetInterval(() => {}, 1e9);
    });
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    const check = checks.at(-1);
    const reads = () => server.calls.filter(call => call.method === 'GET').length;
    const before = reads();
    const realNow = Date.now.bind(Date);
    let read = null;
    // The page's own timer, tick by tick, on a clock moved forward.
    for (let tick = 1; tick * check.delay <= 2 * SHARED_REFRESH_MS && read === null; tick += 1) {
      const at = check.from + tick * check.delay;
      vi.spyOn(Date, 'now').mockReturnValue(at);
      await act(async () => { check.callback(); await new Promise(resolve => setTimeout(resolve, 60)); });
      if (reads() > before) read = at - check.from;
    }
    vi.spyOn(Date, 'now').mockImplementation(realNow);
    spy.mockRestore();
    expect(read).toBeGreaterThanOrEqual(SHARED_REFRESH_MS);
    expect(read).toBeLessThan(SHARED_REFRESH_MS + 10_000);
  });

  it('connecting a device sends the changes that waited on it right away', async () => {
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['alindi'] }));
    await waitFor(() => expect(result.current.sync.message).toMatch(/bu cihazı bağla/));
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(server.current().books.a?.value.states).toEqual(['alindi']));
    expect(server.calls.some(call => call.url.endsWith('/git/blobs'))).toBe(true);
    await waitFor(() => expect(result.current.sync.message).toBe('GitHub ile eşitlendi.'));
    expect(result.current.sync.pending).toBe(0);
  });

  it('connecting asks before replacing a book another device saved meanwhile, then sends the choice at once', async () => {
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['okunuyor'], b: ['onemli'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(2));
    // Meanwhile the phone, already connected, buys book a.
    server.set(remoteDocument({ a: { updatedAt: '2026-10-04T09:00:00.000Z', value: { states: ['alindi'] }, stamps: { states: '2026-10-04T09:00:00.000Z' } } }));
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(result.current.sync.mergePrompt).toEqual({ conflicts: ['a'], queueConflict: false, reason: 'connect' }));
    expect(putsOf(server)).toHaveLength(0);
    expect(readSyncBackup().states.a).toEqual(['okunuyor']);
    expect(readSyncBackup().pending.map(item => item.bookId).sort()).toEqual(['a', 'b']);
    // Hiding the page while the reader decides sends nothing.
    act(hidePage);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(putsOf(server)).toHaveLength(0);
    await act(() => result.current.sync.resolveMerge('shared'));
    await waitFor(() => expect(putsOf(server)).toHaveLength(1));
    expect(server.current().books.a.value.states).toEqual(['alindi']);
    expect(server.current().books.b.value.states).toEqual(['onemli']);
    expect(result.current.states.a).toEqual(['alindi']);
    expect(localStorage.getItem('kitapatlasi:github-state:connect-review:v1')).toBeNull();
  });

  it('a change older than the 30 second window still waits for the comparison', async () => {
    // Marks made days ago on a device that was never connected: the batcher would send them at once.
    const old = '2026-09-28T08:00:00.000Z';
    localStorage.setItem('kitapatlasi:github-state:pending:v2', JSON.stringify({ since: old, mutations: [{ id: `${old}:a`, kind: 'book', bookId: 'a', updatedAt: old, value: { states: ['okunuyor'] } }] }));
    const server = github(remoteDocument({ a: { updatedAt: '2026-10-04T09:00:00.000Z', value: { states: ['alindi'] }, stamps: { states: '2026-10-04T09:00:00.000Z' } } }));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).not.toBe('loading'));
    server.readDelay = 80;
    // Not awaited inside act: React commits as a browser would, so the batcher can fire
    // while the comparison still waits for GitHub.
    let connecting;
    act(() => { connecting = result.current.sync.saveToken(TOKEN); });
    await waitFor(() => expect(result.current.sync.mergePrompt?.reason).toBe('connect'));
    await act(() => connecting);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(putsOf(server)).toHaveLength(0);
  });

  it('a reload during the comparison brings the question back, and a failed read sends nothing', async () => {
    localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN);
    localStorage.setItem('kitapatlasi:github-state:connect-review:v1', '1');
    const old = '2026-09-28T08:00:00.000Z';
    localStorage.setItem('kitapatlasi:github-state:pending:v2', JSON.stringify({ since: old, mutations: [{ id: `${old}:a`, kind: 'book', bookId: 'a', updatedAt: old, value: { states: ['okunuyor'] } }] }));
    const failing = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', failing);
    const first = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(first.result.current.sync.status).toBe('error'));
    await act(async () => { await first.result.current.sync.flush(); });
    expect(failing.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    first.unmount();
    const server = github(remoteDocument({ a: { updatedAt: '2026-10-04T09:00:00.000Z', value: { states: ['alindi'] }, stamps: { states: '2026-10-04T09:00:00.000Z' } } }));
    vi.stubGlobal('fetch', server.fetch);
    const second = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(second.result.current.sync.mergePrompt?.reason).toBe('connect'));
    expect(putsOf(server)).toHaveLength(0);
  });

  it('keeping this device’s edit changes only the field it edited', async () => {
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['okunuyor'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    // The phone buys the book and writes a note on it.
    const at = '2026-10-04T09:00:00.000Z';
    server.set(remoteDocument({ a: { updatedAt: at, value: { states: ['alindi'], reading: { why: 'Telefondaki not' } }, stamps: { states: at, reading: at } } }));
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(result.current.sync.mergePrompt?.reason).toBe('connect'));
    await act(() => result.current.sync.resolveMerge('device'));
    await waitFor(() => expect(putsOf(server)).toHaveLength(1));
    expect(server.current().books.a.value).toEqual({ states: ['okunuyor'], reading: { why: 'Telefondaki not' } });
  });

  it('editing a value this device itself read is not a conflict', async () => {
    const at = '2026-10-04T09:00:00.000Z';
    const server = github(remoteDocument({ a: { updatedAt: at, value: { states: ['onemli'] }, stamps: { states: at } } }));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.states.a).toEqual(['onemli']));
    act(() => result.current.setStates({ a: ['onemli', 'alindi'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(putsOf(server)).toHaveLength(1));
    expect(result.current.sync.mergePrompt).toBeNull();
    expect(server.current().books.a.value.states).toEqual(['onemli', 'alindi']);
  });

  it('a comparison never relies on a CDN copy read before the key was stored', async () => {
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['okunuyor'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    // The phone buys book a; the CDN still serves the file from before.
    server.rawDoc = remoteDocument({});
    server.set(remoteDocument({ a: { updatedAt: '2026-10-04T09:00:00.000Z', value: { states: ['alindi'] }, stamps: { states: '2026-10-04T09:00:00.000Z' } } }));
    server.rawDelay = 80;
    // A refresh without the key (a CDN read, as the second fresh read within a minute is) is under way.
    act(() => { void result.current.sync.load(); });
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(result.current.sync.mergePrompt?.reason).toBe('connect'));
    expect(putsOf(server)).toHaveLength(0);
  });

  it('a field this device never set does not travel, so another device’s note survives', async () => {
    // Book a was marked on this device before it ever synced; the shared file was empty.
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    localStorage.removeItem('kitapatlasi:github-state:migrated:v1');
    const { result } = renderHook(() => useHarness({ a: ['onemli'] }, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).not.toBe('loading'));
    expect(pending().find(item => item.bookId === 'a').value).toEqual({ states: ['onemli'] });
    // Meanwhile the phone writes a note on the same book.
    const at = '2026-10-04T09:00:00.000Z';
    server.set(remoteDocument({ a: { updatedAt: at, value: { reading: { why: 'Telefondaki not' } }, stamps: { reading: at } } }));
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(putsOf(server)).toHaveLength(1));
    expect(result.current.sync.mergePrompt).toBeNull();
    expect(server.current().books.a.value).toEqual({ states: ['onemli'], reading: { why: 'Telefondaki not' } });
  });

  it('a book decided at the first sync is not asked about again when the device connects', async () => {
    localStorage.removeItem('kitapatlasi:github-state:migrated:v1');
    const at = '2026-10-04T09:00:00.000Z';
    const server = github(remoteDocument({ a: { updatedAt: at, value: { states: ['alindi'] }, stamps: { states: at } } }));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({ a: ['onemli'] }, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.mergePrompt?.reason).toBe('first-sync'));
    await act(() => result.current.sync.resolveMerge('device'));
    await act(() => result.current.sync.saveToken(TOKEN));
    await waitFor(() => expect(putsOf(server)).toHaveLength(1));
    expect(result.current.sync.mergePrompt).toBeNull();
    expect(server.current().books.a.value.states).toEqual(['onemli']);
  });

  it('a failed read while a connect waits for its comparison says so in the notice', async () => {
    localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN);
    localStorage.setItem('kitapatlasi:github-state:connect-review:v1', '1');
    localStorage.setItem('kitapatlasi:github-state:pending:v2', JSON.stringify({ since: '2026-09-28T08:00:00.000Z', mutations: [{ id: 'x', kind: 'book', bookId: 'a', updatedAt: '2026-09-28T08:00:00.000Z', value: { states: ['okunuyor'] } }] }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.writeError).toMatch(/karşılaştırılamadı/));
  });

  it('a change made while a write is under way gets its own write right after it', async () => {
    localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN);
    const server = github(remoteDocument({}));
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['alindi'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    const open = server.hold();
    let first;
    act(() => { first = result.current.sync.flush(); });
    await waitFor(() => expect(putsOf(server)).toHaveLength(1));
    act(() => result.current.setStates({ a: ['alindi'], b: ['okundu'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(2));
    act(hidePage);
    open();
    await act(() => first);
    await waitFor(() => expect(server.current().books.b?.value.states).toEqual(['okundu']));
    expect(putsOf(server)).toHaveLength(2);
    await waitFor(() => expect(result.current.sync.pending).toBe(0));
  });

  it('a refused write is remembered for the notice until a write succeeds', async () => {
    localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN);
    const server = github(remoteDocument({}), { puts: [401] });
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['alindi'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    await act(async () => { await result.current.sync.flush().catch(() => undefined); });
    expect(result.current.sync.writeError).toMatch(/GitHub anahtarı reddetti/);
    await act(async () => { await result.current.sync.flush(); });
    expect(result.current.sync.writeError).toBeNull();
    expect(server.current().books.a.value.states).toEqual(['alindi']);
  });

  it('a token that cannot write is not stored, and the reader is told why', async () => {
    const server = github(remoteDocument({}), { blob: 403 });
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    await act(async () => { await expect(result.current.sync.saveToken(TOKEN)).rejects.toMatchObject({ code: 'read-only' }); });
    expect(localStorage.getItem('kitapatlasi:github-state:token:v1')).toBeNull();
    expect(result.current.sync.message).toMatch(/yazamıyor/);
    expect(server.calls.some(call => call.method === 'PUT')).toBe(false);
  });
});

describe('useGitHubStateSync when GitHub refuses the key or asks to wait', () => {
  const TOKEN_KEY = 'kitapatlasi:github-state:token:v1';
  const REVIEW_KEY = 'kitapatlasi:github-state:connect-review:v1';
  beforeEach(() => { localStorage.clear(); localStorage.setItem('kitapatlasi:github-state:migrated:v1', '1'); });
  afterEach(() => { vi.unstubAllGlobals(); delete document.visibilityState; });

  /** GitHub that refuses the key on reads once `refuse()` says so; anonymous reads always work. */
  function keyed(remote, { refuse = () => true, put } = {}) {
    const calls = [];
    const fetch = vi.fn(async (url, init = {}) => {
      const authorized = Boolean(init.headers?.Authorization);
      const method = init.method || 'GET';
      calls.push({ url, method, authorized });
      if (url.endsWith('/git/blobs')) return new Response('{}', { status: 201 });
      if (method === 'PUT') {
        if (put) return put(init);
        remote = JSON.parse(atob(JSON.parse(init.body).content));
        return new Response('{}', { status: 200 });
      }
      if (authorized && refuse()) return new Response('', { status: 401 });
      if (url.startsWith('https://raw.')) return new Response(JSON.stringify(remote));
      return new Response(JSON.stringify({ sha: 'sha-1', encoding: 'base64', content: btoa(JSON.stringify(remote)) }));
    });
    return { fetch, calls, current: () => remote, puts: () => calls.filter(call => call.method === 'PUT') };
  }

  it('a key GitHub refuses on a read stops writes while reads go on, and an accepted read resumes them', async () => {
    localStorage.setItem(TOKEN_KEY, TOKEN);
    let refusing = true;
    const server = keyed(remoteDocument({ b: record({ states: ['okundu'] }) }), { refuse: () => refusing });
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.tokenRejected).toBe(true));
    expect(result.current.states.b).toEqual(['okundu']);
    act(() => result.current.setStates(previous => ({ ...previous, a: ['alindi'] })));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    act(hidePage);
    await act(async () => { await result.current.sync.flush(); });
    expect(server.puts()).toHaveLength(0);
    expect(result.current.sync.writeError).toMatch(/GitHub anahtarı reddetti/);
    // "Şimdi gönder" checks the key again; once GitHub accepts it, the refusal clears.
    refusing = false;
    await act(async () => { await result.current.sync.flush(); });
    await waitFor(() => expect(result.current.sync.tokenRejected).toBe(false));
    expect(result.current.sync.writeError).toBeNull();
    await act(async () => { await result.current.sync.flush(); });
    await waitFor(() => expect(server.current().books.a?.value.states).toEqual(['alindi']));
    expect(result.current.sync.lastSentAt).toBeTypeOf('number');
  });

  it('a connect comparison never completes on a read made without the key', async () => {
    let keyedReads = 0;
    // The key passes the write check, then GitHub refuses it on the comparison's own read.
    const server = keyed(remoteDocument({}), { refuse: () => ++keyedReads > 1, put: () => new Response('', { status: 401 }) });
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['alindi'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    await act(async () => { await result.current.sync.saveToken(TOKEN); });
    expect(localStorage.getItem(REVIEW_KEY)).toBe('1');
    expect(server.puts()).toHaveLength(0);
    expect(result.current.sync.tokenRejected).toBe(true);
    expect(result.current.sync.message).toMatch(/GitHub anahtarı reddetti/);
  });

  it('no path sends before GitHub’s requested wait ends', async () => {
    localStorage.setItem(TOKEN_KEY, TOKEN);
    const server = keyed(remoteDocument({}), { refuse: () => false, put: () => new Response('{}', { status: 403, headers: { 'Retry-After': '600' } }) });
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => result.current.setStates({ a: ['alindi'] }));
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    await act(async () => { await result.current.sync.flush().catch(() => undefined); });
    expect(server.puts()).toHaveLength(1);
    expect(result.current.sync.retryAt).toBeGreaterThan(Date.now());
    await act(async () => { await result.current.sync.flush(); });
    act(hidePage);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(server.puts()).toHaveLength(1);
    expect(result.current.sync.message).toMatch(/sonrasında gönderilecek/);
  });

  it('"Şimdi gönder" with nothing queued reads the file again instead of claiming a send', async () => {
    localStorage.setItem(TOKEN_KEY, TOKEN);
    const server = keyed(remoteDocument({}), { refuse: () => false });
    vi.stubGlobal('fetch', server.fetch);
    const { result } = renderHook(() => useHarness({}, { queue: [], reading: {} }));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    const reads = server.calls.length;
    await act(async () => { await result.current.sync.flush(); });
    expect(server.puts()).toHaveLength(0);
    expect(server.calls.length).toBeGreaterThan(reads);
    expect(result.current.sync.lastSentAt).toBeNull();
    expect(result.current.sync.message).not.toBe('GitHub ile eşitlendi.');
  });
});
