import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bookSlug, decodeRoute } from '../src/library.js';

// Book ids and their address slugs are a contract (ADR 003, K10): `?book=` links, records in
// state.json and saved routes depend on them. Every locked book must still exist under its id,
// and its slug must still open it. New books may be added freely; record them with
//   node tests/characterization/record-identity.mjs
// A rename needs its own reviewed change that keeps the old link working.
const catalog = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const locked = JSON.parse(fs.readFileSync(new URL('./fixtures/identity/books.json', import.meta.url), 'utf8'));

test('every locked book keeps its id, and its old address still opens it', () => {
  const byId = new Map(catalog.books.map(book => [book.id, book]));
  const missing = Object.keys(locked).filter(id => !byId.has(id));
  assert.deepEqual(missing, [], 'locked ids missing from the catalogue');
  const broken = Object.entries(locked).filter(([id, slug]) => decodeRoute(`?book=${encodeURIComponent(slug)}`, catalog).book !== id).map(([id, slug]) => `${id} (${slug})`);
  assert.deepEqual(broken, [], 'old addresses that no longer open their book');
});

test('no two books share an id or an address', () => {
  const ids = catalog.books.map(book => book.id);
  const slugs = catalog.books.map(bookSlug);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(slugs.filter((slug, index) => slugs.indexOf(slug) !== index), []);
});
