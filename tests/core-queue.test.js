import test from 'node:test';
import assert from 'node:assert/strict';
import { QUEUE_LIMIT, addToQueue, cleanPersonal, moveInQueue } from '../src/reading.js';
import { queueView } from '../src/core/personal/queue.js';

// What the Sıram page shows (docs/UI-REDESIGN.md, phase 5; ADR 003, K14): the books in the
// reader's own order, where each one can still move, and what is known of its reading.
const books = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, { id, title: id, author: 'Yazar' }]));
const view = (queue, extra = {}) => queueView({ queue, books, reading: {}, states: {}, ...extra });

test('the rows keep the reader\'s order and number it from one', () => {
  const { rows } = view(['c', 'a', 'b']);
  assert.deepEqual(rows.map(row => [row.id, row.position]), [['c', 1], ['a', 2], ['b', 3]]);
  assert.equal(rows[0].book, books.c);
});

test('the first book can only go down, the last only up, and one alone can go nowhere', () => {
  const { rows } = view(['a', 'b', 'c']);
  assert.deepEqual(rows.map(row => [row.canMoveUp, row.canMoveDown]), [[false, true], [true, true], [true, false]]);
  assert.deepEqual(view(['a']).rows.map(row => [row.canMoveUp, row.canMoveDown]), [[false, false]]);
});

test('a move shows at once in the rows: positions follow and the ends are worked out again', () => {
  const queue = moveInQueue(['a', 'b', 'c'], 'c', -1);
  const { rows } = view(queue);
  assert.deepEqual(rows.map(row => [row.id, row.position, row.canMoveUp, row.canMoveDown]), [['a', 1, false, true], ['c', 2, true, true], ['b', 3, true, false]]);
});

test('a book the catalogue no longer has is left out, and the numbers stay in one run', () => {
  const { rows } = view(['a', 'gone', 'b']);
  assert.deepEqual(rows.map(row => [row.id, row.position]), [['a', 1], ['b', 2]]);
  assert.deepEqual(rows.map(row => [row.canMoveUp, row.canMoveDown]), [[false, true], [true, false]]);
});

test('reading progress shows only when the record makes sense', () => {
  const reading = { a: { page: 25, totalPages: 100 }, b: { page: 120, totalPages: 100 }, c: { page: 10 }, d: { page: 3, totalPages: 0 } };
  const { rows } = view(['a', 'b', 'c', 'd'], { reading });
  assert.deepEqual(rows[0].progress, { page: 25, totalPages: 100, percent: 25 });
  assert.deepEqual(rows.slice(1).map(row => row.progress), [null, null, null]);
});

test('a row carries the reading marks only, in a fixed order, and says whether the book is read', () => {
  const states = { a: ['alindi', 'okundu', 'onemli'], b: ['birakildi', 'okunuyor'], c: ['alindi'] };
  const { rows } = view(['a', 'b', 'c'], { states });
  assert.deepEqual(rows.map(row => row.marks), [['okundu'], ['okunuyor', 'birakildi'], []]);
  assert.deepEqual(rows.map(row => row.read), [true, false, false]);
});

test('the view says how much room the queue has left, by the queue\'s own limit', () => {
  assert.equal(QUEUE_LIMIT, 5);
  assert.deepEqual([view([]).free, view([]).full], [5, false]);
  assert.deepEqual([view(['a', 'b']).free, view(['a', 'b']).full], [3, false]);
  const full = Array.from({ length: QUEUE_LIMIT }, (_, index) => `b${index}`);
  const known = Object.fromEntries(full.map(id => [id, { id }]));
  assert.deepEqual([queueView({ queue: full, books: known, reading: {}, states: {} }).free, queueView({ queue: full, books: known, reading: {}, states: {} }).full], [0, true]);
});

test('the limit is the one the queue itself keeps, when adding and when cleaning', () => {
  const full = Array.from({ length: QUEUE_LIMIT }, (_, index) => `b${index}`);
  assert.equal(addToQueue(full, 'more'), full);
  assert.equal(cleanPersonal({ queue: [...full, 'more'] }, [...full, 'more']).queue.length, QUEUE_LIMIT);
});
