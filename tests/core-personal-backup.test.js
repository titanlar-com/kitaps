import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_VERSION, BackupError, createBackup, readBackup } from '../src/core/personal/backup.js';

// A backup is read by the format it says it has (ADR 003, "Önerilip alınmayanlar", done on the
// owner's word on 9 November 2026). A file this code cannot read is refused whole: nothing of it
// reaches the reader's marks, because a half-read backup overwrites good records with wrong ones.
const bookIds = ['a', 'b', 'c'];
const refusedAs = kind => error => error instanceof BackupError && error.kind === kind;

test('a backup is written in the current format and reads back the same', () => {
  const states = { a: ['okundu'], b: ['alindi', 'onemli'] };
  const personal = { queue: ['b', 'c'], reading: { a: { page: 12 } } };
  const written = JSON.parse(JSON.stringify(createBackup({ states, personal }, new Date('2026-11-09T10:00:00Z'))));
  assert.equal(written.version, BACKUP_VERSION);
  assert.equal(written.version, 3, 'the format written since 28 September 2026');
  assert.equal(written.exportedAt, '2026-11-09T10:00:00.000Z');
  const read = readBackup(written, bookIds);
  assert.deepEqual(read.marks, states);
  assert.deepEqual(read.personal.queue, ['b', 'c']);
  assert.equal(read.personal.reading.a.page, 12);
  assert.equal(read.hasQueue, true);
});

test('every older format still reads', () => {
  const marks = { a: ['okundu'] };
  for (const [name, input] of [
    ['plain marks, no version', { a: ['okundu'] }],
    ['marks under states, no version', { states: { a: ['okundu'] } }],
    ['version 1', { version: 1, states: { a: ['okundu'] } }],
    ['version 2', { version: 2, states: { a: ['okundu'] } }],
  ]) {
    const read = readBackup(input, bookIds);
    assert.deepEqual(read.marks, marks, name);
    assert.equal(read.hasQueue, false, `${name} says nothing about the queue, so the queue stays`);
  }
});

test('a backup with records but no marks restores the records', () => {
  const read = readBackup({ queue: ['a'], reading: {} }, bookIds);
  assert.deepEqual(read.marks, {});
  assert.deepEqual(read.personal.queue, ['a']);
  assert.equal(read.hasQueue, true);
});

test('books the catalogue no longer has and marks it does not know are left out', () => {
  const read = readBackup({ version: 3, states: { a: ['okundu', 'uydurma'], yok: ['okundu'], b: 'okundu' } }, bookIds);
  assert.deepEqual(read.marks, { a: ['okundu'] });
});

test('a backup from a newer version of the site is refused whole', () => {
  assert.throws(() => readBackup({ version: BACKUP_VERSION + 1, states: { a: ['okundu'] } }, bookIds), refusedAs('newer'));
});

test('the backup the device sync keeps is not mistaken for a personal backup', () => {
  assert.throws(() => readBackup({ version: 1, copies: [{ states: { a: ['okundu'] } }] }, bookIds), refusedAs('other-file'));
  assert.throws(() => readBackup({ name: 'bir dosya', count: 3 }, bookIds), refusedAs('other-file'));
});

test('a file that is not a backup at all is refused', () => {
  for (const input of [null, 7, 'yedek', [], { version: '3', states: {} }, { version: 2.5, states: {} }, { version: 0, states: {} }, { states: [] }, { version: 3, states: 'x' }]) {
    assert.throws(() => readBackup(input, bookIds), refusedAs('unreadable'), JSON.stringify(input));
  }
});
