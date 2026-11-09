import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogListing } from '../src/ui/react/app/listing.js';
import { emptyFilters, prepareBooks, sortBooks } from '../src/library.js';
import { seoState, staticBookUrl, staticListingUrl } from '../src/seo.js';
import { bookSlug } from '../src/library.js';
import { readFixture } from './characterization/oracle.js';

// The running page and the static pages give one account of a book or a shelf (ADR 003, K12:
// items 1, 2, 3 and 5, decided on 9 November 2026 after the owner said to finish them).
const catalog = readFixture();
const books = prepareBooks(catalog.books);
let output;

before(() => {
  output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-one-account-')), 'dist');
  fs.mkdirSync(output);
  execFileSync(process.execPath, [new URL('../scripts/generate-static-seo.mjs', import.meta.url).pathname, output, new URL('./fixtures/characterization/catalog.json', import.meta.url).pathname], { stdio: 'pipe' });
});
after(() => fs.rmSync(path.dirname(output), { recursive: true, force: true }));

const staticHtml = relative => fs.readFileSync(path.join(output, 'catalog', relative, 'index.html'), 'utf8');
const structuredOf = html => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
const asWritten = value => JSON.parse(JSON.stringify(value));

const running = (filters, page = 1) => {
  const route = { view: 'books', sort: 'title', book: null, page, pageSize: 24, filters: { ...emptyFilters(), ...filters } };
  const result = catalogListing({ books, states: {}, rankings: {}, view: 'books', filters: route.filters, sort: 'title', page, pageSize: 24 });
  return seoState({ route, catalog, count: result.filtered.length, currentPage: result.currentPage, totalPages: result.pages, displayed: result.displayed });
};
const countOf = list => books.filter(list).length;
const anyBook = list => catalog.books.find(list);

test('books that share a title read by author, whatever order the catalogue holds them in', () => {
  const book = (id, author) => ({ id, title: 'Aynı Ad', titleTr: 'Aynı Ad', author, editions: [], notes: [], aliases: [], categories: [], collectionIds: [], groupIds: [], years: [] });
  const [zeki, ayse] = [book('zeki', 'Zeki Yazar'), book('ayse', 'Ayşe Yazar')];
  assert.deepEqual(sortBooks([zeki, ayse], 'title').map(item => item.id), ['ayse', 'zeki']);
  assert.deepEqual(sortBooks([ayse, zeki], 'title').map(item => item.id), ['ayse', 'zeki']);
});

test('the static catalogue lists the books in the running page\'s title order', () => {
  const pages = Math.max(1, Math.ceil(books.length / 24));
  const written = [];
  for (let page = 1; page <= pages; page += 1) written.push(...structuredOf(staticHtml(page > 1 ? `page/${page}` : '')).mainEntity.itemListElement.map(item => item.url));
  assert.deepEqual(written, sortBooks(books, 'title').map(book => staticBookUrl(book)));
});

test('every book tells search engines the same thing on both kinds of page', () => {
  for (const book of catalog.books) {
    const route = { view: 'books', sort: 'reading', book: book.id, page: 1, pageSize: 24, filters: emptyFilters() };
    const state = seoState({ route, catalog, count: 1, currentPage: 1, totalPages: 1, displayed: [book] });
    assert.deepEqual(asWritten(state.structured), structuredOf(staticHtml(`books/${bookSlug(book)}`)), book.id);
  }
});

test('a book page names no next or previous page, on either kind of page', () => {
  const book = catalog.books[0];
  const route = { view: 'books', sort: 'title', book: book.id, page: 2, pageSize: 24, filters: emptyFilters() };
  const state = seoState({ route, catalog, count: 144, currentPage: 2, totalPages: 6, displayed: catalog.books.slice(24, 48) });
  assert.deepEqual([state.prev, state.next], ['', '']);
  assert.equal(/<link rel="(?:prev|next)"/.test(staticHtml(`books/${bookSlug(book)}`)), false);
});

test('every kind of shelf tells search engines the same thing on both kinds of page', () => {
  const category = catalog.categories.find(item => countOf(book => book.categories.includes(item.id)));
  const collection = catalog.collections.find(item => countOf(book => book.collectionIds.includes(item.id)));
  const group = catalog.groups.find(item => item.id.includes(':') && countOf(book => book.groupIds.includes(item.id)));
  const shelves = [
    [{}, 1, ''], [{}, 2, 'page/2'],
    [{ categories: [category.id] }, 1, `category/${category.id}`],
    [{ collections: [collection.id] }, 1, `collection/${collection.id}`],
    [{ groups: [group.id] }, 1, `group/${group.id}`],
  ];
  for (const [filters, page, file] of shelves) assert.deepEqual(asWritten(running(filters, page).structured), structuredOf(staticHtml(file)), file || 'the catalogue');
});

test('a group page names itself in the spelling the running page and the sitemap use', () => {
  const group = catalog.groups.find(item => item.id.includes(':') && anyBook(book => book.groupIds.includes(item.id)));
  const html = staticHtml(`group/${group.id}`);
  const address = staticListingUrl({ filters: { ...emptyFilters(), groups: [group.id] } }, 1);
  assert.ok(address.includes(encodeURIComponent(group.id)), 'the address encodes the colon');
  assert.ok(html.includes(`<link rel="canonical" href="${address}">`), 'canonical');
  assert.ok(html.includes(`<meta property="og:url" content="${address}">`), 'og:url');
  assert.equal(structuredOf(html).url, address);
  assert.equal(html.includes(`/group/${group.id}/`), false, 'no raw spelling is left in the page');
});

test('what a page tells search engines does not depend on the reader hiding purchases', () => {
  const states = Object.fromEntries(books.slice(0, 40).map(book => [book.id, ['alindi']]));
  const query = { books, states, rankings: {}, view: 'books', filters: emptyFilters(), sort: 'title', page: 2, pageSize: 24 };
  const hidden = catalogListing({ ...query, hideOwned: true });
  const open = catalogListing({ ...query, hideOwned: false });
  assert.ok(hidden.filtered.length < open.filtered.length, 'the switch takes books out of what the reader sees');
  assert.deepEqual(hidden.publicListing, { total: open.filtered.length, pages: open.pages, books: open.displayed });
  assert.deepEqual(open.publicListing, { total: open.filtered.length, pages: open.pages, books: open.displayed });
});

test('past the end of the shorter hidden list, the public list is cut at the page the reader is sent to', () => {
  // 144 books are 6 pages. One purchase leaves 143, still 6. Twenty-five leave 119, which is 5.
  const states = Object.fromEntries(books.slice(0, 25).map(book => [book.id, ['alindi']]));
  const query = { books, states, rankings: {}, view: 'books', filters: emptyFilters(), sort: 'title', page: 6, pageSize: 24 };
  const hidden = catalogListing({ ...query, hideOwned: true });
  const open = catalogListing({ ...query, page: 5, hideOwned: false });
  assert.deepEqual([hidden.pages, hidden.currentPage], [5, 5]);
  assert.deepEqual(hidden.publicListing, { total: 144, pages: 6, books: open.displayed });
});
