import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogListing } from '../src/app/listing.js';
import { displayTitle } from '../src/translation.js';
import { characterizeListing, characterizeRanking, characterizeSeo, characterizeStaticSeo, readFixture, readGolden } from './characterization/oracle.js';

// Characterization (ADR 003, phase 0): before the data architecture moves, what the UI
// receives today is pinned on a frozen cut of the catalogue (tests/fixtures/characterization).
// The new data core must give exactly the same, query by query. A golden file changes only
// with an intended, reviewed change of behaviour (tests/characterization/record.mjs).
const catalog = readFixture();

test('the catalogue listing gives, for every view, sort, filter and page, what it gave on 8 November 2026', () => {
  const golden = readGolden('catalog-listing');
  const actual = characterizeListing(catalogListing, catalog);
  assert.deepEqual(Object.keys(actual), Object.keys(golden), 'the same queries');
  for (const name of Object.keys(golden)) assert.deepEqual(actual[name], golden[name], name);
});

test('the reading priority gives the same order, ranks and scores as on 8 November 2026', () => {
  assert.deepEqual(characterizeRanking(catalog), readGolden('reading-ranking'));
});

test('every address decodes, re-encodes and describes itself to search engines as on 8 November 2026', () => {
  const golden = readGolden('seo');
  const actual = characterizeSeo(catalogListing, catalog);
  assert.deepEqual(Object.keys(actual), Object.keys(golden), 'the same addresses');
  for (const address of Object.keys(golden)) assert.deepEqual(actual[address], golden[address], address);
});

test('the build writes the same static pages for the frozen catalogue as on 8 November 2026', () => {
  assert.deepEqual(characterizeStaticSeo(), readGolden('static-seo'));
});

test('the golden files exercise every case they claim to', () => {
  const golden = readGolden('catalog-listing');
  // Each filter narrows the list to something, so none of them is pinned only as "empty".
  const empty = Object.entries(golden).filter(([name, result]) => !result.filtered.length && !/no-match|nothing/.test(name)).map(([name]) => name);
  assert.deepEqual(empty, [], 'queries that match nothing');
  assert.ok(golden['page 999 of 24'].currentPage < 999, 'a page past the end shows the last page');
  assert.ok(golden['view books, hide owned true'].shelf < golden['view books, hide owned false'].shelf, 'hiding purchases takes books out');
  // K12 item 1 is pinned only if the frozen catalogue has books that share a shown title but
  // not an author, and item 3 only if hiding purchases changes what a page tells search engines.
  const byTitle = new Map();
  for (const book of catalog.books) byTitle.set(displayTitle(book).toLocaleLowerCase('tr'), [...(byTitle.get(displayTitle(book).toLocaleLowerCase('tr')) ?? []), book.author]);
  assert.ok([...byTitle.values()].some(authors => new Set(authors).size > 1), 'a shown title shared by different authors');
  const seo = readGolden('seo');
  assert.ok(Object.keys(seo).some(name => name.endsWith(' (purchases hidden)') && JSON.stringify(seo[name]) !== JSON.stringify(seo[name.replace(' (purchases hidden)', '')] ?? null)), 'hiding purchases changes a page');
});
