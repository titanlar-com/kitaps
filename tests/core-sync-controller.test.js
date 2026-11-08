import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/core/store.ts';
import { createSyncController, RETURN_REFRESH_MS, SHARED_REFRESH_MS } from '../src/core/sync/controller.js';
import { GitHubStateRepository } from '../src/state/GitHubStateRepository.ts';

// The sync controller (ADR 003, phase 8): the order of operations the React hook used to hold,
// driven here in plain Node behind its ports. tests/components/sync-hook.test.jsx runs the same
// controller through its React binding.
const AT = '2026-09-28T10:00:00.000Z';
const BOOK_IDS = ['a', 'b', 'c'];
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';
const shared = (books, queue = null) => ({ schemaVersion: 2, updatedAt: AT, books, queue });
const record = value => ({ updatedAt: AT, value, stamps: { states: AT, reading: AT } });

function github(remote) {
  const calls = [];
  const server = { calls, gate: null, set(next) { remote = next; }, current: () => remote };
  server.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', keepalive: init.keepalive });
    if (server.gate && !init.method) await server.gate;
    if (url.startsWith('https://raw.')) return new Response(JSON.stringify(remote));
    if (url.endsWith('/git/blobs')) return new Response('{}', { status: 201 });
    if (init.method === 'PUT') { remote = JSON.parse(atob(JSON.parse(init.body).content)); return new Response('{}', { status: 200 }); }
    return new Response(JSON.stringify({ sha: 'sha-1', encoding: 'base64', content: btoa(JSON.stringify(remote)) }));
  };
  return server;
}

function setup({ remote = shared({}), token = false, migrated = true, states = {}, personal = { queue: [], reading: {} }, kept: stored = {} } = {}) {
  const values = new Map();
  const web = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  if (migrated) web.setItem('kitapatlasi:github-state:migrated:v1', '1');
  if (token) web.setItem('kitapatlasi:github-state:token:v1', TOKEN);
  for (const [key, value] of Object.entries(stored)) web.setItem(key, value);
  const clock = { now: 1_000_000 };
  const server = github(remote);
  const repository = new GitHubStateRepository({ storage: web, fetch: server.fetch, clock: () => new Date(clock.now) });
  const data = createStore({ states, personal });
  let applied = 0;
  const source = { getSnapshot: data.getSnapshot, subscribe: data.subscribe, applyRemote(update) { applied += 1; data.set(update(data.getSnapshot())); } };
  const page = { visibility: 'visible', onVisibility: new Set(), onHide: new Set() };
  const lifecycle = {
    visibility: () => page.visibility,
    onVisibilityChange(listener) { page.onVisibility.add(listener); return () => page.onVisibility.delete(listener); },
    onPageHide(listener) { page.onHide.add(listener); return () => page.onHide.delete(listener); },
  };
  const ticks = new Set();
  const delays = new Set();
  const timers = {
    setInterval(callback, delay) { const tick = { callback, delay }; ticks.add(tick); return tick; },
    clearInterval: tick => ticks.delete(tick),
    setTimeout(callback, delay) { const timer = { callback, delay }; delays.add(timer); return timer; },
    clearTimeout: timer => delays.delete(timer),
  };
  const kept = { read: key => web.getItem(key), write: (key, value) => { web.setItem(key, value); return true; }, remove: key => web.removeItem(key) };
  const controller = createSyncController({ bookIds: BOOK_IDS, source, repository, lifecycle, timers, storage: kept, now: () => clock.now });
  const pending = () => JSON.parse(web.getItem('kitapatlasi:github-state:pending:v2') || '{"mutations":[]}').mutations;
  const settle = async () => { for (let round = 0; round < 6; round += 1) await new Promise(resolve => setImmediate(resolve)); };
  const edit = change => data.update(change);
  const setMarks = marks => edit(value => ({ ...value, states: marks }));
  return { controller, repository, server, data, source, page, clock, ticks, delays, web, pending, settle, setMarks, applied: () => applied, puts: () => server.calls.filter(call => call.method === 'PUT') };
}
const started = async options => { const world = setup(options); world.controller.start(); await world.settle(); return world; };

test('a read reaches the data in one step and produces no outgoing change', async () => {
  const world = await started({ remote: shared({ a: record({ states: ['okundu'] }), b: record({ states: ['alindi'] }) }, { updatedAt: AT, value: ['a'] }), token: true });
  assert.equal(world.applied(), 1);
  assert.deepEqual(world.data.getSnapshot().states, { a: ['okundu'], b: ['alindi'] });
  assert.deepEqual(world.data.getSnapshot().personal.queue, ['a']);
  assert.deepEqual(world.pending(), []);
  await world.controller.commands.load();
  await world.settle();
  assert.deepEqual(world.pending(), []);
  assert.deepEqual(world.puts(), []);
  world.controller.stop();
});

test('what a read brought is the base of later edits, even though it changed the data in that same step', async () => {
  // The base is recorded right after the read is applied. "Edited while the read ran" must be
  // judged on what was shown before the read landed, or every book it changed looks edited.
  const world = await started({ remote: shared({ a: record({ states: ['okundu'] }) }, { updatedAt: AT, value: ['a'] }) });
  const bases = world.repository.readBases();
  assert.equal(bases.books.a?.states, AT, 'the book the read brought');
  assert.equal(bases.queue, AT, 'and the queue');
  world.controller.stop();
});

test('an edit made while a read runs keeps its value, goes out once and leaves its old base', async () => {
  const world = await started({ remote: shared({ b: record({ states: ['okundu'] }) }) });
  world.server.set(shared({ a: record({ states: ['alindi'] }), b: record({ states: ['okundu'] }) }));
  let open;
  world.server.gate = new Promise(resolve => { open = resolve; });
  const reading = world.controller.commands.load();
  await world.settle();
  world.setMarks({ ...world.data.getSnapshot().states, a: ['onemli'] });
  assert.deepEqual(world.pending().map(item => item.bookId), ['a'], 'seen as an edit at once');
  world.server.gate = null;
  open();
  await reading;
  await world.settle();
  assert.deepEqual(world.data.getSnapshot().states.a, ['onemli']);
  assert.deepEqual(world.pending().map(item => item.bookId), ['a'], 'once');
  assert.equal(world.repository.readBases().books.a, undefined, 'its base is not moved under it');
  world.controller.stop();
});

test('an edit made before the first read goes out after it, as a change against what was read', async () => {
  const world = setup({ remote: shared({ b: record({ states: ['okundu'] }) }), states: { a: ['onemli'] } });
  world.controller.start();
  world.setMarks({ a: ['onemli'], c: ['alindi'] });
  assert.deepEqual(world.pending(), [], 'nothing is compared before the first read');
  await world.settle();
  assert.deepEqual(world.pending().map(item => item.bookId).sort(), ['a', 'c']);
  world.controller.stop();
});

test('leaving the page sends what waits, with keepalive, whichever way the page goes', async () => {
  for (const leave of [world => { world.page.visibility = 'hidden'; for (const listener of world.page.onVisibility) listener(); }, world => { for (const listener of world.page.onHide) listener(); }]) {
    const world = await started({ token: true });
    world.setMarks({ a: ['alindi'] });
    leave(world);
    await world.settle();
    assert.equal(world.puts().length, 1);
    assert.equal(world.puts()[0].keepalive, true);
    assert.deepEqual(world.pending(), []);
    world.controller.stop();
  }
});

test('leaving without a key sends nothing', async () => {
  const world = await started({});
  world.setMarks({ a: ['alindi'] });
  for (const listener of world.page.onHide) listener();
  await world.settle();
  assert.deepEqual(world.puts(), []);
  assert.equal(world.pending().length, 1);
  world.controller.stop();
});

test('a visible page reads the shared file once it is due; a hidden one does not', async () => {
  const world = await started({});
  const [tick] = world.ticks;
  assert.equal(tick.delay < SHARED_REFRESH_MS, true, 'the check runs more often than the refresh');
  const reads = () => world.server.calls.length;
  const before = reads();
  world.clock.now += SHARED_REFRESH_MS - 1;
  tick.callback();
  await world.settle();
  assert.equal(reads(), before, 'not yet due');
  world.clock.now += 1;
  world.page.visibility = 'hidden';
  tick.callback();
  await world.settle();
  assert.equal(reads(), before, 'hidden');
  world.page.visibility = 'visible';
  tick.callback();
  await world.settle();
  assert.ok(reads() > before);
  world.controller.stop();
});

test('coming back reads a fresh copy once the last read is old enough', async () => {
  const world = await started({});
  const back = () => { world.page.visibility = 'visible'; for (const listener of world.page.onVisibility) listener(); };
  const reads = () => world.server.calls.length;
  const before = reads();
  world.clock.now += RETURN_REFRESH_MS - 1;
  back();
  await world.settle();
  assert.equal(reads(), before);
  world.clock.now += 1;
  back();
  await world.settle();
  assert.ok(reads() > before);
  world.controller.stop();
});

test('the batcher waits on the timer port and sends when it fires', async () => {
  const world = await started({ token: true });
  world.setMarks({ a: ['alindi'] });
  assert.equal(world.delays.size, 1, 'one timer for the window');
  assert.deepEqual(world.puts(), []);
  const [timer] = world.delays;
  assert.equal(timer.delay, 30_000, 'the window counts from the change, on the port\'s clock');
  timer.callback();
  await world.settle();
  assert.equal(world.puts().length, 1);
  world.controller.stop();
});

test('stopping leaves nothing running and no way back in', async () => {
  const world = await started({ token: true });
  world.setMarks({ a: ['alindi'] });
  world.controller.stop();
  assert.equal(world.ticks.size, 0);
  assert.equal(world.delays.size, 0);
  assert.equal(world.page.onVisibility.size + world.page.onHide.size, 0);
  const waiting = world.pending().length;
  world.setMarks({ a: ['alindi'], b: ['onemli'] });
  assert.equal(world.pending().length, waiting, 'edits are no longer watched');
});

test('the snapshot stays the same object until something changes, and never holds the key', async () => {
  const world = await started({});
  const first = world.controller.getSnapshot();
  assert.equal(world.controller.getSnapshot(), first);
  let calls = 0;
  world.controller.subscribe(() => { calls += 1; });
  world.setMarks({ a: ['alindi'] });
  assert.ok(calls >= 1);
  assert.notEqual(world.controller.getSnapshot(), first);
  assert.equal(world.controller.getSnapshot().pending, 1);
  await world.controller.commands.saveToken(TOKEN);
  assert.equal(world.controller.getSnapshot().hasToken, true);
  assert.ok(!JSON.stringify(world.controller.getSnapshot()).includes(TOKEN));
  world.controller.stop();
});

test('the wait GitHub asked for leaves the snapshot when it is over', async () => {
  const world = await started({ token: true });
  world.server.fetch = world.server.fetch;
  const repository = world.repository;
  const original = repository.loadRead.bind(repository);
  repository.loadRead = async () => { throw Object.assign(new Error('wait'), { code: 'rate-limited', retryAt: world.clock.now + 60_000 }); };
  await world.controller.commands.load();
  const waiting = world.controller.getSnapshot();
  assert.equal(waiting.retryAt, world.clock.now + 60_000);
  world.clock.now += 60_000;
  assert.equal(world.controller.getSnapshot().retryAt, null);
  repository.loadRead = original;
  world.controller.stop();
});

test('removing the key with edits waiting says they wait for a key', async () => {
  const world = await started({ token: true });
  world.setMarks({ a: ['alindi'] });
  world.controller.commands.clearToken();
  await world.settle();
  const now = world.controller.getSnapshot();
  assert.equal(now.status, 'queued');
  assert.match(now.message, /bu cihazı bağla/);
  assert.equal(world.delays.size, 0, 'nothing is timed to send without a key');
  world.controller.stop();
});

test('the copy taken before a connect decision holds what the page showed, not what the read just wrote', async () => {
  const stale = '2026-09-01T08:00:00.000Z';
  const world = await started({
    token: true,
    states: { a: ['okunuyor'], b: ['onemli'] },
    personal: { queue: ['c'], reading: {} },
    remote: shared({ a: { updatedAt: AT, value: { states: ['okundu'] }, stamps: { states: AT } }, b: { updatedAt: AT, value: { states: ['alindi'] }, stamps: { states: AT } } }, { updatedAt: AT, value: ['a'] }),
    kept: {
      'kitapatlasi:github-state:connect-review:v1': '1',
      'kitapatlasi:github-state:pending:v2': JSON.stringify({ since: stale, mutations: [{ id: 'x', kind: 'book', bookId: 'a', updatedAt: stale, value: { states: ['okunuyor'] } }] }),
      'kitapatlasi:github-state:base:v1': JSON.stringify({ books: { a: { states: stale } } }),
    },
  });
  assert.equal(world.controller.getSnapshot().mergePrompt?.reason, 'connect');
  const copy = JSON.parse(world.web.getItem('kitapatlasi:github-state:pre-sync-backup:v1'));
  assert.deepEqual(copy.states.b, ['onemli']);
  assert.deepEqual(copy.queue, ['c']);
  world.controller.stop();
});
