import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openCatalog } from '../src/core/catalog/contract.ts';
import { indexCatalog } from '../src/core/catalog/catalog.ts';
import { createCatalogListingViewModel } from '../src/core/catalog/listingViewModel.ts';
import { createStore } from '../src/core/store.ts';
import { emptyFilters, prepareBooks } from '../src/library.js';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../src/ranking/ReadingPriorityEngine.ts';
import { listingQueries, personalStates, readFixture, readGolden } from './characterization/oracle.js';

// The catalogue index and the catalogue listing as a feature view model (ADR 003, K6): facts and
// kinds, no React, no copy, no layout. Any design or UI technology binds to the same snapshot.
const real = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const epoch = () => new Date(0);

test('the index builds what catalogData.js builds today: books, maps, authors and the ranking', () => {
  const catalog = indexCatalog(openCatalog(real), { now: epoch });
  assert.deepEqual(catalog.books, prepareBooks(real.books));
  for (const book of catalog.books) assert.equal(catalog.byId[book.id], book);
  assert.deepEqual(Object.keys(catalog.collectionById), real.collections.map(item => item.id));
  assert.deepEqual(Object.keys(catalog.groupById), real.groups.map(item => item.id));
  assert.deepEqual(Object.keys(catalog.categoryById), real.categories.map(item => item.id));
  assert.deepEqual(catalog.authors, [...new Set(catalog.books.map(book => book.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')));
  assert.deepEqual(catalog.ranking, new ReadingRankingViewModel(new ReadingPriorityEngine(real), epoch).build());
});

const fixture = readFixture();
const catalog = indexCatalog(openCatalog(fixture), { now: epoch });
const listingFor = query => {
  const marks = createStore(personalStates(catalog.books));
  const route = createStore(query);
  return { vm: createCatalogListingViewModel({ catalog, query: route, marks }), marks, route };
};

test('for every pinned query, the view model gives the golden page, totals and range', () => {
  const golden = readGolden('catalog-listing');
  for (const { name, ...query } of listingQueries(catalog.books)) {
    const { vm } = listingFor(query);
    const snapshot = vm.getSnapshot();
    const expected = golden[name];
    assert.deepEqual(snapshot.bookIds, expected.displayed, name);
    assert.equal(snapshot.total, expected.filtered.length, name);
    assert.equal(snapshot.shelfTotal, expected.shelf, name);
    assert.equal(snapshot.ownedCount, expected.ownedCount, name);
    assert.equal(snapshot.pages, expected.pages, name);
    assert.equal(snapshot.page, expected.currentPage, name);
    const start = expected.filtered.length ? (expected.currentPage - 1) * query.pageSize + 1 : 0;
    assert.deepEqual(snapshot.range, expected.filtered.length ? { start, end: Math.min(expected.currentPage * query.pageSize, expected.filtered.length) } : null, name);
  }
});

test('the empty state is a kind the design words as it likes', () => {
  const base = { view: 'books', sort: 'reading', filters: emptyFilters(), page: 1, pageSize: 24, hideOwned: false };
  const kind = (query, marks = {}) => createCatalogListingViewModel({ catalog, query: createStore(query), marks: createStore(marks) }).getSnapshot().empty;
  assert.equal(kind(base), null);
  assert.equal(kind({ ...base, view: 'owned' }), 'owned-empty');
  assert.equal(kind({ ...base, view: 'favorites' }), 'favorites-empty');
  assert.equal(kind({ ...base, filters: { ...emptyFilters(), query: 'zzz-no-match' } }), 'no-match');
  const someone = catalog.books[0].id;
  assert.equal(kind({ ...base, view: 'owned', filters: { ...emptyFilters(), query: 'zzz-no-match' } }, { [someone]: ['alindi'] }), 'no-match', 'an owned shelf with books but no match');
  const counts = createCatalogListingViewModel({ catalog, query: createStore(base), marks: createStore({ [someone]: ['onemli', 'alindi'] }) }).getSnapshot();
  assert.deepEqual([counts.ownedCount, counts.favoriteCount], [1, 1]);
});

test('the snapshot stays the same object until the query or the marks change, and then notifies', () => {
  const { vm, marks, route } = listingFor({ view: 'books', sort: 'title', filters: emptyFilters(), page: 1, pageSize: 24, hideOwned: true });
  const first = vm.getSnapshot();
  assert.equal(vm.getSnapshot(), first);
  let calls = 0;
  const stop = vm.subscribe(() => { calls += 1; });
  route.update(query => ({ ...query, page: 2 }));
  assert.equal(calls, 1);
  assert.equal(vm.getSnapshot().page, 2);
  const shownOwned = vm.getSnapshot().bookIds.length;
  marks.update(states => ({ ...states, [vm.getSnapshot().bookIds[0]]: ['alindi'] }));
  assert.equal(calls, 2, 'buying a shown book changes the hidden-purchases page');
  assert.equal(vm.getSnapshot().bookIds.length, shownOwned);
  assert.ok(!vm.getSnapshot().bookIds.includes(first.bookIds[24]), 'the bought book left the list');
  stop();
  vm.dispose();
});
