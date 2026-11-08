import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGitHubStateSync } from '../../src/state/useGitHubStateSync';
import { useViewModel } from '../../src/adapters/react/useViewModel.js';
import { browserStorage } from '../../src/adapters/browser/ports.js';
import { createPersonalLibrary } from '../../src/core/personal/library.ts';
import { GitHubStateRepository } from '../../src/state/GitHubStateRepository.ts';

// ADR 003, phase 7a, written first: with the personal library as the one owner of the data,
// what arrives from GitHub never comes back as an outgoing change, and a local command is one.
const BOOKS = ['a', 'b', 'c'].map(id => ({ id, legacyKeys: [] }));
const BOOK_IDS = BOOKS.map(book => book.id);
const at = '2026-09-28T10:00:00.000Z';
const shared = (books, queue = null) => ({ schemaVersion: 2, updatedAt: at, books, queue });
const record = value => ({ updatedAt: at, value, stamps: { states: at, reading: at } });
const pending = () => JSON.parse(localStorage.getItem('kitapatlasi:github-state:pending:v2') || '{"mutations":[]}').mutations;
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';

function github(remote) {
  const calls = [];
  const server = { calls, set(next) { remote = next; }, current: () => remote, read: null };
  server.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (server.read && !init.method) await server.read;
    if (url.startsWith('https://raw.')) return new Response(JSON.stringify(remote));
    if (url.endsWith('/git/blobs')) return new Response('{}', { status: 201 });
    if (init.method === 'PUT') { remote = JSON.parse(atob(JSON.parse(init.body).content)); return new Response('{}', { status: 200 }); }
    return new Response(JSON.stringify({ sha: 'sha-1', encoding: 'base64', content: btoa(JSON.stringify(remote)) }));
  });
  return server;
}

function useOwned(library) {
  const { states, personal } = useViewModel(library);
  const sync = useGitHubStateSync({ bookIds: BOOK_IDS, states, personal, applyRemote: library.applyRemote, source: library });
  return { sync, states, personal };
}
const opened = () => createPersonalLibrary({ storage: browserStorage(localStorage), books: BOOKS, now: () => new Date(2026, 10, 8, 12) });
const puts = server => server.calls.filter(call => call.method === 'PUT');
const hidePage = () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('the personal library as the one owner of the data', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('kitapatlasi:github-state:migrated:v1', '1'); localStorage.setItem('kitapatlasi:github-state:token:v1', TOKEN); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete document.visibilityState; });

  it('a remote read reaches the page and produces no outgoing change', async () => {
    const server = github(shared({ a: record({ states: ['okundu'], reading: { why: 'Uzak' } }) }, { updatedAt: at, value: ['a', 'b'] }));
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    await waitFor(() => expect(result.current.states.a).toEqual(['okundu']));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    expect(result.current.personal.queue).toEqual(['a', 'b']);
    expect(result.current.personal.reading.a.why).toBe('Uzak');
    expect(pending()).toEqual([]);
    await act(() => result.current.sync.load());
    await act(() => result.current.sync.flush());
    expect(pending()).toEqual([]);
    expect(puts(server)).toEqual([]);
  });

  it('a later change on GitHub is taken over the same way', async () => {
    const server = github(shared({}));
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    server.set(shared({ b: record({ states: ['alindi'] }) }, { updatedAt: at, value: ['b'] }));
    await act(() => result.current.sync.load());
    expect(result.current.states.b).toEqual(['alindi']);
    expect(result.current.personal.queue).toEqual(['b']);
    expect(pending()).toEqual([]);
    expect(puts(server)).toEqual([]);
  });

  it('one command is one outgoing change that carries the mark and its day together', async () => {
    const server = github(shared({}));
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    act(() => { library.commands.toggleMark('a', 'okunuyor'); });
    const queued = pending();
    expect(queued).toHaveLength(1);
    expect([...queued[0].value.states].sort()).toEqual(['alindi', 'okunuyor']);
    expect(queued[0].value.reading).toEqual({ startedAt: '2026-11-08' });
    await act(() => result.current.sync.flush());
    expect(puts(server)).toHaveLength(1);
    expect(pending()).toEqual([]);
  });

  it('an edit made while a read is under way stays, and goes out exactly once', async () => {
    const server = github(shared({ b: record({ states: ['okundu'] }) }));
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    let open; server.read = new Promise(resolve => { open = resolve; });
    let reading;
    act(() => { reading = result.current.sync.load(); });
    act(() => { library.commands.toggleMark('a', 'onemli'); });
    const queued = pending();
    expect(queued.map(item => item.bookId)).toEqual(['a']);
    open(); server.read = null;
    await act(() => reading);
    expect(result.current.states.a).toEqual(['onemli']);
    expect(result.current.states.b).toEqual(['okundu']);
    expect(pending()).toEqual(queued);
    await act(() => result.current.sync.flush());
    expect(puts(server)).toHaveLength(1);
    expect(pending()).toEqual([]);
  });

  it('an edit that lands just before a read is taken over is not overwritten by it', async () => {
    const server = github(shared({}));
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    server.set(shared({ a: record({ states: ['okundu'], reading: { why: 'Uzak' } }) }));
    // The read has already been combined with the device's unsent edits when this one is made.
    const combine = GitHubStateRepository.prototype.loadWithPending;
    const spy = vi.spyOn(GitHubStateRepository.prototype, 'loadWithPending').mockImplementation(async function (...args) {
      const combined = await combine.apply(this, args);
      spy.mockRestore();
      library.commands.toggleMark('a', 'onemli');
      return combined;
    });
    await act(() => result.current.sync.load());
    expect(result.current.states.a).toEqual(['onemli']);
    expect(result.current.personal.reading.a.why).toBe('Uzak');
    expect(pending().map(item => item.bookId)).toEqual(['a']);
  });

  it('an edit made while the first read runs keeps what another device saved meanwhile', async () => {
    const when = '2026-10-04T09:00:00.000Z';
    localStorage.setItem('kitapatlasi:states:v2', JSON.stringify({ a: ['alindi'] }));
    const server = github(shared({ a: { updatedAt: when, value: { states: ['alindi', 'okundu'] }, stamps: { states: when } } }));
    let open; server.read = new Promise(resolve => { open = resolve; });
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    act(() => { library.commands.toggleMark('a', 'onemli'); });
    open(); server.read = null;
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    act(hidePage);
    await waitFor(() => expect(puts(server)).toHaveLength(1));
    expect([...server.current().books.a.value.states].sort()).toEqual(['alindi', 'okundu', 'onemli']);
  });

  it('a queue change made while the first read runs keeps the book another device added', async () => {
    const when = '2026-10-04T09:00:00.000Z';
    localStorage.setItem('kitapatlasi:personal:v1', JSON.stringify({ queue: ['b'], reading: {} }));
    const server = github(shared({}, { updatedAt: when, value: ['b', 'c'] }));
    let open; server.read = new Promise(resolve => { open = resolve; });
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    const { result } = renderHook(() => useOwned(library));
    act(() => { library.commands.addToQueue('a'); });
    open(); server.read = null;
    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    act(hidePage);
    await waitFor(() => expect(puts(server)).toHaveLength(1));
    expect([...server.current().queue.value].sort()).toEqual(['a', 'b', 'c']);
  });

  it('the page takes one notification for one read, however many books it carries', async () => {
    const server = github(shared({ a: record({ states: ['okundu'] }), b: record({ states: ['alindi'] }), c: record({ states: ['onemli'] }) }, { updatedAt: at, value: ['c'] }));
    vi.stubGlobal('fetch', server.fetch);
    const library = opened();
    let changes = 0;
    library.subscribe(() => { changes += 1; });
    const { result } = renderHook(() => useOwned(library));
    await waitFor(() => expect(result.current.sync.status).toBe('ready'));
    expect(changes).toBe(1);
  });
});
