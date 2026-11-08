import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emptyFilters, filterBooks } from '../src/library.js';
import { addressBase, bookPageTitle, groupHeading, listingPageTitle, seoState, staticBookUrl, staticListingUrl } from '../src/seo.js';
import { SITE_URL } from '../src/site.js';
import { readFixture } from './characterization/oracle.js';

// ADR 003, phase 5: the SEO state is a pure function of its input. The address it builds on is
// given to it, and the running page and the static pages share the same rules.
const catalog = readFixture();
const route = extra => ({ view: 'books', sort: 'title', book: null, page: 2, pageSize: 24, filters: emptyFilters(), ...extra });
const input = extra => ({ route: route(), catalog, count: catalog.books.length, currentPage: 2, totalPages: 6, displayed: catalog.books.slice(24, 48), ...extra });

test('seoState never reads the browser address', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://not-the-site.example', pathname: '/elsewhere/' } });
  try {
    const state = seoState(input());
    assert.equal(state.canonical, `${SITE_URL}catalog/page/2/`);
    assert.equal(staticBookUrl(catalog.books[0]).startsWith(`${SITE_URL}catalog/books/`), true);
    assert.equal(staticListingUrl(route(), 3), `${SITE_URL}catalog/page/3/`);
    assert.ok(!JSON.stringify(state).includes('not-the-site'));
  } finally {
    if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location;
  }
});

test('every address in the state is built on the base it is given', () => {
  const base = 'http://127.0.0.1:4173/kitaps/';
  const state = seoState(input({ base }));
  for (const value of [state.canonical, state.prev, state.next, state.interactive, state.structured.url, state.structured.mainEntity.itemListElement[0].url]) assert.ok(value.startsWith(base), value);
  assert.equal(staticListingUrl(route(), 3, base), `${base}catalog/page/3/`);
  assert.ok(staticBookUrl(catalog.books[0], base).startsWith(`${base}catalog/books/`));
  const book = seoState(input({ base, route: route({ book: catalog.books[0].id, page: 1 }), currentPage: 1 }));
  assert.ok(book.canonical.startsWith(base) && book.interactive.startsWith(base));
});

test('the base comes from the address the way the page has always read it', () => {
  assert.equal(addressBase({ origin: 'https://a.example', pathname: '/kitaps/' }), 'https://a.example/kitaps/');
  assert.equal(addressBase({ origin: 'https://a.example', pathname: '/kitaps/index.html' }), 'https://a.example/kitaps/');
  assert.equal(addressBase({ origin: 'http://127.0.0.1:4173', pathname: '/' }), 'http://127.0.0.1:4173/');
});

test('the running page and the static pages name a page the same way', () => {
  const group = catalog.groups.find(item => catalog.collections.some(collection => collection.id === item.collectionId && collection.short));
  const collection = catalog.collections.find(item => item.id === group.collectionId);
  assert.equal(groupHeading(group, catalog), `${collection.short} · ${group.title}`);
  assert.equal(seoState(input({ route: route({ filters: { ...emptyFilters(), groups: [group.id] } }) })).title, listingPageTitle(groupHeading(group, catalog), 2));
  assert.equal(listingPageTitle('Tüm kitaplar', 1), 'Tüm kitaplar | Kitaplık');
  const book = catalog.books[0];
  assert.equal(seoState(input({ route: route({ book: book.id, page: 1 }), currentPage: 1 })).title, bookPageTitle(book));
});

test('a static shelf holds the books the running filter finds, and links with the running page\'s addresses', () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-seo-')), 'dist');
  fs.mkdirSync(output);
  const fixture = new URL('./fixtures/characterization/catalog.json', import.meta.url).pathname;
  execFileSync(process.execPath, [new URL('../scripts/generate-static-seo.mjs', import.meta.url).pathname, output, fixture], { stdio: 'pipe' });
  const category = catalog.categories.find(item => catalog.books.filter(book => book.categories.includes(item.id)).length > 1);
  const filters = { ...emptyFilters(), categories: [category.id] };
  const expected = filterBooks(catalog.books, filters);
  const html = fs.readFileSync(path.join(output, 'catalog/category', category.id, 'index.html'), 'utf8');
  assert.ok(html.includes(`<link rel="canonical" href="${staticListingUrl({ filters }, 1)}">`));
  assert.ok(html.includes(`${expected.length} eser`));
  for (const book of expected.slice(0, 24)) assert.ok(html.includes(staticBookUrl(book)), book.id);
  fs.rmSync(path.dirname(output), { recursive: true, force: true });
});

test('the generator takes those rules from the shared module instead of keeping its own copy', () => {
  const source = fs.readFileSync(new URL('../scripts/generate-static-seo.mjs', import.meta.url), 'utf8');
  assert.match(source, /from '\.\.\/src\/seo\.js'/);
  assert.doesNotMatch(source, /const groupHeading=/);
  assert.doesNotMatch(source, /const bookUrl=/);
  assert.doesNotMatch(source, /\.categories\.includes\(item\.id\)/);
});
