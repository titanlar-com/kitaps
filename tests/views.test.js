import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeRoute, encodeRoute, emptyFilters, DEFAULT_PAGE_SIZE } from '../src/library.js';
import { seoState } from '../src/seo.js';

// Characterisation of every page's address and title (architecture plan, phase 0, 7 November
// 2026). These tests pin today's behaviour so that moving the view list into one registry
// changes nothing a reader or a search engine sees.
const catalog = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url)));
const route = view => ({ view, sort: 'reading', book: null, page: 1, pageSize: DEFAULT_PAGE_SIZE, filters: emptyFilters() });
const seo = view => seoState({ route: route(view), catalog, count: 0, currentPage: 1, totalPages: 1, displayed: [] });

// view id, its address, the page title's heading part
const VIEWS = [
 ['books', '', 'Tüm kitaplar'],
 ['owned', 'view=library', 'Kitaplığım'],
 ['favorites', 'view=favorites', 'Favorilerim'],
 ['queue', 'view=queue', 'Okuma sıram'],
 ['collections', 'view=collections', 'Kitap kümeleri'],
 ['notes', 'view=notes', 'Kaynaklar ve notlar'],
 ['bookstores', 'view=bookstores', 'Kitapçılar'],
 ['fairs', 'view=fairs', 'Kitap fuarları'],
];

test('every page has one address that reads back as the same page', () => {
 for (const [view, address] of VIEWS) {
  assert.equal(encodeRoute(route(view), catalog), address, view);
  assert.equal(decodeRoute(`?${address}`, catalog).view, view, address);
 }
 // An unknown page falls back to the catalogue.
 assert.equal(decodeRoute('?view=nowhere', catalog).view, 'books');
});

test('links shared before the current addresses still open their page', () => {
 assert.equal(decodeRoute('#overview', catalog).view, 'collections');
 assert.equal(decodeRoute('#sources', catalog).view, 'notes');
 const collection = catalog.collections[0].id;
 const shared = decodeRoute(`#${collection}`, catalog);
 assert.equal(shared.view, 'books');
 assert.deepEqual(shared.filters.collections, [collection]);
});

test('every page has its own title, and only the catalogue listing is indexed', () => {
 for (const [view, , heading] of VIEWS) {
  const state = seo(view);
  assert.equal(state.title, `${heading} | Kitaplık`, view);
  assert.ok(state.description.length > 20, `${view} has a description`);
 }
 assert.equal(seo('bookstores').robots, 'noindex,follow');
 assert.equal(seo('fairs').robots, 'noindex,follow');
 assert.match(seo('fairs').description, /kitap fuarları/);
 assert.match(seo('bookstores').description, /kitapçılar/);
});

// One table for every page (ADR 002, phase 2): src/views.js names each page once, and the
// header, the footer menu, the addresses and the titles all read it.
test('the page table names every page once and puts exactly four in the header', async () => {
 const { VIEWS, HEADER_VIEWS, viewById } = await import('../src/views.js');
 assert.deepEqual(VIEWS.map(view => view.id).sort(), VIEWS_IDS.slice().sort());
 assert.equal(new Set(VIEWS.map(view => view.id)).size, VIEWS.length);
 // The owner's rule: four sections side by side on a phone (AGENTS.md).
 assert.deepEqual(HEADER_VIEWS, ['books', 'queue', 'collections', 'bookstores']);
 for (const [view, , heading] of VIEWS_TABLE) assert.equal(viewById[view].heading, heading, view);
});
const VIEWS_TABLE = VIEWS;
const VIEWS_IDS = VIEWS.map(([view]) => view);
