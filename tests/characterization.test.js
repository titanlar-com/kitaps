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
  // The frozen catalogue holds books that share a shown title but not an author. Their order is
  // tested in tests/seo-one-account.test.js, because here they already stand in author order.
  // K12 item 3 was settled on 9 November 2026: the hidden purchases change nothing below.
  const byTitle = new Map();
  for (const book of catalog.books) byTitle.set(displayTitle(book).toLocaleLowerCase('tr'), [...(byTitle.get(displayTitle(book).toLocaleLowerCase('tr')) ?? []), book.author]);
  assert.ok([...byTitle.values()].some(authors => new Set(authors).size > 1), 'a shown title shared by different authors');
  const seo = readGolden('seo');
  const compared = Object.keys(seo).filter(name => name.endsWith(' (purchases hidden)') && seo[name.replace(' (purchases hidden)', '')]);
  assert.ok(compared.length >= 3, 'the home page, a title page and the library are compared');
  for (const name of compared) assert.deepEqual(seo[name], seo[name.replace(' (purchases hidden)', '')], name);
});
