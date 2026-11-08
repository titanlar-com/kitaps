import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { booksForShelf, normalize } from '../src/library.js';
import { collectionCards, sharePercent } from '../src/core/catalog/collections.js';

// What the Kümeler page shows for each collection (docs/UI-REDESIGN.md, phase 5; ADR 003, K14):
// how much of it is read, which covers preview it, and how many books each of its parts has.
const book = (id, collectionIds, extra = {}) => ({ id, collectionIds, groupIds: [], cover: { src: `covers/${id}.jpg` }, ...extra });
const collection = (id, extra = {}) => ({ id, title: id, description: '', groupIds: [], ...extra });
const cardOf = (cards, id) => cards.find(card => card.collection.id === id);

test('the read share of a collection counts its read books out of all its books', () => {
  const books = [book('a', ['c']), book('b', ['c']), book('d', ['c']), book('e', ['c']), book('other', ['x'])];
  const states = { a: ['okundu'], b: ['alindi', 'okundu'], other: ['okundu'] };
  const card = cardOf(collectionCards({ collections: [collection('c'), collection('x')], books, states }), 'c');
  assert.equal(card.total, 4);
  assert.equal(card.read, 2);
  assert.equal(card.share, 0.5);
  assert.equal(card.done, false);
});

test('only the Okundu mark counts as read: a book being read, bought or left is not', () => {
  const books = [book('a', ['c']), book('b', ['c']), book('d', ['c']), book('e', ['c'])];
  const states = { a: ['okunuyor'], b: ['alindi'], d: ['birakildi'], e: ['araverildi', 'onemli'] };
  const card = cardOf(collectionCards({ collections: [collection('c')], books, states }), 'c');
  assert.equal(card.read, 0);
  assert.equal(card.share, 0);
});

test('a book that belongs to two collections counts in both', () => {
  const books = [book('a', ['c', 'd']), book('b', ['d'])];
  const cards = collectionCards({ collections: [collection('c'), collection('d')], books, states: { a: ['okundu'] } });
  assert.deepEqual([cardOf(cards, 'c').share, cardOf(cards, 'd').share], [1, 0.5]);
});

test('a fully read collection is done; an empty one is neither done nor a division by zero', () => {
  const cards = collectionCards({ collections: [collection('full'), collection('none')], books: [book('a', ['full'])], states: { a: ['okundu'] } });
  assert.equal(cardOf(cards, 'full').done, true);
  const none = cardOf(cards, 'none');
  assert.deepEqual([none.total, none.read, none.share, none.done], [0, 0, 0, false]);
});

test('the preview shows the first books that have a cover, at most four', () => {
  const books = [book('a', ['c']), book('b', ['c'], { cover: null }), book('d', ['c']), book('e', ['c']), book('f', ['c']), book('g', ['c'])];
  const card = cardOf(collectionCards({ collections: [collection('c')], books, states: {} }), 'c');
  assert.deepEqual(card.previews.map(item => item.id), ['a', 'd', 'e', 'f']);
  // A book without a cover still counts as a book of the collection.
  assert.equal(card.total, 6);
});

test('each part of a collection knows its title and how many books it holds', () => {
  const books = [book('a', ['c'], { groupIds: ['g1'] }), book('b', ['c'], { groupIds: ['g1', 'g2'] }), book('d', ['c'], { groupIds: ['g2'] })];
  const groups = { g1: { title: 'Birinci' }, g2: { title: 'İkinci' } };
  const card = cardOf(collectionCards({ collections: [collection('c', { groupIds: ['g2', 'g1'] })], books, states: {}, groups }), 'c');
  assert.deepEqual(card.groups, [{ id: 'g2', title: 'İkinci', count: 2 }, { id: 'g1', title: 'Birinci', count: 2 }]);
});

test('the search reads titles and descriptions the way the catalogue search does, and keeps the order', () => {
  const collections = [collection('a', { title: 'Çocuk kitapları' }), collection('b', { title: 'Strateji', description: 'Kısa bir ÇOCUK seçkisi' }), collection('c', { title: 'Tarih' })];
  assert.deepEqual(collectionCards({ collections, books: [], states: {}, query: 'cocuk' }).map(card => card.collection.id), ['a', 'b']);
  assert.deepEqual(collectionCards({ collections, books: [], states: {}, query: '' }).map(card => card.collection.id), ['a', 'b', 'c']);
  assert.deepEqual(collectionCards({ collections, books: [], states: {}, query: 'yok' }), []);
});

test('on the real catalogue every total and part count equals the page\'s former sum', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
  const groups = Object.fromEntries(catalog.groups.map(group => [group.id, group]));
  const available = booksForShelf(catalog.books, {});
  const cards = collectionCards({ collections: catalog.collections, books: catalog.books, states: {}, groups });
  assert.equal(cards.length, catalog.collections.length);
  for (const card of cards) {
    assert.equal(card.total, available.filter(item => item.collectionIds.includes(card.collection.id)).length, card.collection.id);
    for (const group of card.groups) assert.equal(group.count, available.filter(item => item.groupIds.includes(group.id)).length, group.id);
  }
  // The former search compared the same text in the same way.
  const shown = catalog.collections.filter(item => normalize(`${item.title} ${item.description}`).includes(normalize('strateji')));
  assert.deepEqual(collectionCards({ collections: catalog.collections, books: catalog.books, states: {}, groups, query: 'strateji' }).map(card => card.collection.id), shown.map(item => item.id));
});

test('a share is written as a Turkish percentage, and a small one never reads as nothing', () => {
  assert.equal(sharePercent(0), '%0');
  assert.equal(sharePercent(1), '%100');
  assert.equal(sharePercent(0.16), '%16');
  assert.equal(sharePercent(3 / 1002), '%0,3');
});

test('each card says how far its progress bar goes, to one decimal', () => {
  const [card] = collectionCards({ collections: [{ id: 'k', title: 'K', description: '', groupIds: [] }], books: ['a', 'b', 'c'].map(id => ({ id, collectionIds: ['k'], groupIds: [] })), states: { a: ['okundu'] } });
  assert.equal(card.percent, 33.3);
});
