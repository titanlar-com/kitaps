import test from 'node:test';
import assert from 'node:assert/strict';
import * as library from '../src/library.js';
import * as translation from '../src/translation.js';
import * as workFormat from '../src/workFormat.js';
import * as query from '../src/core/catalog/query.js';
import * as coreTranslation from '../src/core/catalog/translation.js';
import * as coreWorkFormat from '../src/core/catalog/workFormat.js';
import { catalogListing } from '../src/core/catalog/listing.js';
import { characterizeListing, readFixture, readGolden } from './characterization/oracle.js';

// The catalogue rules live in the core (ADR 003, phase 3). The old paths stay as facades, so
// every importer and every earlier test keeps working, and there is one copy of each rule.

test('the core catalogue listing gives exactly what the UI received on 8 November 2026', () => {
  const golden = readGolden('catalog-listing');
  const actual = characterizeListing(catalogListing, readFixture());
  assert.deepEqual(Object.keys(actual), Object.keys(golden));
  for (const name of Object.keys(golden)) assert.deepEqual(actual[name], golden[name], name);
});

test('library.js hands out the core\'s filter, sort and shelf rules, not copies of them', () => {
  for (const name of ['normalize', 'prepareBooks', 'filterBooks', 'sortBooks', 'booksForShelf', 'emptyFilters']) {
    assert.equal(library[name], query[name], name);
  }
});

test('translation.js and workFormat.js are facades over the core', () => {
  assert.deepEqual(Object.keys(translation).sort(), Object.keys(coreTranslation).sort());
  for (const name of Object.keys(coreTranslation)) assert.equal(translation[name], coreTranslation[name], name);
  for (const name of Object.keys(coreWorkFormat)) assert.equal(workFormat[name], coreWorkFormat[name], name);
});
