import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalLibrary, LEGACY_STATE_KEY, STATE_KEY } from '../src/core/personal/library.ts';
import { PERSONAL_KEY } from '../src/core/personal/reading.js';
import * as library from '../src/library.js';
import * as marks from '../src/core/personal/marks.js';
import { browserStorage } from '../src/adapters/browser/ports.js';

// The personal library (ADR 003, phase 7a): the one owner of a reader's marks, reading records
// and queue. It runs in plain Node; the page binds to it and never writes these itself.
const BOOKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => ({ id, legacyKeys: [`old-${id}`] }));
const memory = (values = {}) => {
  const writes = [];
  return { values, writes, read: key => values[key] ?? null, write: (key, value) => { values[key] = value; writes.push(key); return true; }, remove: key => { delete values[key]; } };
};
const open = (values, storage = memory(values)) => ({ storage, library: createPersonalLibrary({ storage, books: BOOKS, now: () => new Date(2026, 10, 8, 12) }) });
const watch = store => { let calls = 0; store.subscribe(() => { calls += 1; }); return () => calls; };

test('the mark rules live in the core and the old module hands out the same functions', () => {
  for (const name of ['STATE_LABELS', 'toggleState', 'migrateStates']) assert.equal(library[name], marks[name], name);
});

test('a reading mark is a purchase, and the two lists stay separate afterwards (owner, 8 November 2026)', () => {
  const { toggleState } = marks;
  assert.deepEqual(toggleState(['alinacak'], 'okunuyor').sort(), ['alindi', 'okunuyor']);
  for (const mark of ['okunuyor', 'okundu', 'araverildi', 'birakildi']) assert.deepEqual(toggleState([], mark).sort(), ['alindi', mark].sort());
  assert.deepEqual(toggleState(['alindi', 'okunuyor'], 'okunuyor'), ['alindi'], 'taking the reading mark off leaves the purchase');
  assert.deepEqual(toggleState(['alindi', 'okunuyor'], 'alindi'), ['okunuyor'], 'taking the purchase off leaves the reading mark');
  assert.deepEqual(toggleState(['okunuyor', 'alindi'], 'okundu').sort(), ['alindi', 'okundu']);
  assert.deepEqual(toggleState(['alinacak'], 'onemli').sort(), ['alinacak', 'onemli'], 'a favourite buys nothing');
});

test('it opens from the kept records, in the formats older tabs read, and writes them back once', () => {
  const stored = { [STATE_KEY]: JSON.stringify({ a: ['onemli', 'bilinmeyen'], zzz: ['okundu'] }), [PERSONAL_KEY]: JSON.stringify({ queue: ['a', 'yok', 'b'], reading: { a: { page: '12', why: 'Merak' }, yok: { page: 1 } } }), [LEGACY_STATE_KEY]: JSON.stringify({ 'old-b': ['alindi'] }) };
  const { storage, library: personal } = open(stored);
  const { states, personal: records, saved } = personal.getSnapshot();
  assert.deepEqual(states, { a: ['onemli'], zzz: ['okundu'], b: ['alindi'] }, 'as migrateStates reads them');
  assert.deepEqual(records.queue, ['a', 'b']);
  assert.deepEqual(records.reading.a, { startedAt: '', finishedAt: '', page: 12, totalPages: '', why: 'Merak', apply: '' });
  assert.equal(saved, true);
  assert.deepEqual([...storage.writes].sort(), [PERSONAL_KEY, STATE_KEY].sort(), 'each key once, as the page wrote them on opening');
  assert.equal(storage.values[STATE_KEY], JSON.stringify(states));
  assert.equal(storage.values[PERSONAL_KEY], JSON.stringify(records));
});

test('damaged records open as an empty library', () => {
  const { library: personal } = open({ [STATE_KEY]: '{oops', [PERSONAL_KEY]: 'null' });
  assert.deepEqual(personal.getSnapshot().states, {});
  assert.deepEqual(personal.getSnapshot().personal, { queue: [], reading: {} });
  assert.equal(personal.getSnapshot().saved, true);
});

test('storage that refuses everything opens empty, says so at once, and still works for the visit', () => {
  const refuse = () => { throw new Error('blocked'); };
  const storage = browserStorage({ getItem: refuse, setItem: refuse, removeItem: refuse });
  const personal = createPersonalLibrary({ storage, books: BOOKS, now: () => new Date(0) });
  assert.deepEqual(personal.getSnapshot().states, {});
  assert.equal(personal.getSnapshot().saved, false, 'the reader is warned before the first change');
  assert.deepEqual([...personal.commands.toggleMark('a', 'onemli').after], ['onemli']);
  assert.deepEqual(personal.getSnapshot().states.a, ['onemli']);
});

test('marking a book as being read changes the marks and the reading record in one step', () => {
  const { storage, library: personal } = open();
  const notified = watch(personal);
  storage.writes.length = 0;
  const result = personal.commands.toggleMark('a', 'okunuyor');
  assert.equal(notified(), 1, 'one change, not two');
  assert.deepEqual(result.before, []);
  assert.deepEqual([...result.after].sort(), ['alindi', 'okunuyor']);
  assert.equal(result.saved, true);
  const now = personal.getSnapshot();
  assert.deepEqual([...now.states.a].sort(), ['alindi', 'okunuyor']);
  assert.equal(now.personal.reading.a.startedAt, '2026-11-08');
  assert.deepEqual([...storage.writes].sort(), [PERSONAL_KEY, STATE_KEY].sort());
  assert.equal(storage.values[STATE_KEY], JSON.stringify(now.states));
});

test('the start day is written once, unmarking writes none, and other marks leave the record alone', () => {
  const { library: personal } = open();
  const { commands, getSnapshot } = personal;
  commands.toggleMark('a', 'okunuyor');
  commands.editReading('a', { startedAt: '2026-01-02' });
  commands.toggleMark('a', 'okunuyor');
  commands.toggleMark('a', 'okunuyor');
  assert.equal(getSnapshot().personal.reading.a.startedAt, '2026-01-02');
  commands.toggleMark('b', 'onemli');
  assert.equal(getSnapshot().personal.reading.b, undefined);
  commands.toggleMark('c', 'okunuyor');
  commands.editReading('c', { startedAt: '' });
  commands.toggleMark('c', 'okunuyor');
  assert.equal(getSnapshot().personal.reading.c.startedAt, '', 'taking the mark off writes no day back');
});

test('reading records and the queue keep today\'s rules', () => {
  const { library: personal } = open();
  const { commands, getSnapshot } = personal;
  commands.editReading('a', { page: '40', totalPages: 'x' });
  assert.deepEqual(getSnapshot().personal.reading.a, { startedAt: '', finishedAt: '', page: 40, totalPages: '', why: '', apply: '' });
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'a']) commands.addToQueue(id);
  assert.deepEqual(getSnapshot().personal.queue, ['a', 'b', 'c', 'd', 'e'], 'at most five, each once');
  commands.moveInQueue('b', -1);
  assert.deepEqual(getSnapshot().personal.queue, ['b', 'a', 'c', 'd', 'e']);
  commands.moveInQueue('b', -1);
  commands.removeFromQueue('c');
  assert.deepEqual(getSnapshot().personal.queue, ['b', 'a', 'd', 'e']);
});

test('restoring a backup merges both parts in one step', () => {
  const { library: personal } = open({ [STATE_KEY]: JSON.stringify({ a: ['onemli'], b: ['alindi'] }), [PERSONAL_KEY]: JSON.stringify({ queue: ['a'], reading: { a: { why: 'x' } } }) });
  const notified = watch(personal);
  personal.commands.restoreBackup({ b: ['okundu'] }, { queue: ['c', 'yok'], reading: { c: { page: 3 } } });
  assert.equal(notified(), 1);
  const now = personal.getSnapshot();
  assert.deepEqual(now.states, { a: ['onemli'], b: ['okundu'] });
  assert.deepEqual(now.personal.queue, ['c']);
  assert.equal(now.personal.reading.a.why, 'x');
  assert.equal(now.personal.reading.c.page, 3);
  personal.commands.restoreBackup({}, { reading: {} });
  assert.deepEqual(personal.getSnapshot().personal.queue, ['c'], 'a backup without a queue keeps the queue');
});

test('a failed write keeps the change for the visit and says so; the next good write clears it', () => {
  let fail = false;
  const storage = { read: () => null, write: () => !fail, remove() {} };
  const personal = createPersonalLibrary({ storage, books: BOOKS, now: () => new Date(0) });
  assert.equal(personal.getSnapshot().saved, true);
  fail = true;
  const result = personal.commands.toggleMark('a', 'onemli');
  assert.equal(result.saved, false);
  assert.deepEqual(personal.getSnapshot().states.a, ['onemli']);
  assert.equal(personal.getSnapshot().saved, false);
  personal.commands.addToQueue('a');
  fail = false;
  personal.commands.toggleMark('b', 'onemli');
  assert.equal(personal.getSnapshot().saved, false, 'the queue written during the failure has not been written again yet');
  personal.commands.addToQueue('b');
  assert.equal(personal.getSnapshot().saved, true, 'once each part has been written again');
});

test('a remote read is applied as one step and is kept like any other change', () => {
  const { storage, library: personal } = open({ [STATE_KEY]: JSON.stringify({ a: ['onemli'] }) });
  const notified = watch(personal);
  storage.writes.length = 0;
  personal.applyRemote(({ states, personal: records }) => ({ states: { ...states, b: ['okundu'] }, personal: { ...records, queue: ['b'] } }));
  assert.equal(notified(), 1);
  assert.deepEqual(personal.getSnapshot().states, { a: ['onemli'], b: ['okundu'] });
  assert.deepEqual(personal.getSnapshot().personal.queue, ['b']);
  assert.equal(storage.values[STATE_KEY], JSON.stringify({ a: ['onemli'], b: ['okundu'] }));
  assert.deepEqual([...storage.writes].sort(), [PERSONAL_KEY, STATE_KEY].sort());
});

test('the snapshot is the same object until something changes, and the view holds no write access', () => {
  const { library: personal } = open();
  assert.equal(personal.getSnapshot(), personal.getSnapshot());
  assert.equal(Object.isFrozen(personal.commands), true);
  assert.deepEqual(Object.keys(personal.commands).sort(), ['addToQueue', 'editReading', 'moveInQueue', 'removeFromQueue', 'restoreBackup', 'toggleMark']);
});
