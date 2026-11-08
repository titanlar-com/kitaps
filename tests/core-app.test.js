import test from 'node:test';
import assert from 'node:assert/strict';
import { createKitaplik } from '../src/core/app.ts';
import { createSettings, HIDE_OWNED_KEY } from '../src/core/settings/settings.ts';
import { openCatalog } from '../src/core/catalog/contract.ts';
import { indexCatalog } from '../src/core/catalog/catalog.ts';
import { STATE_KEY } from '../src/core/personal/library.ts';
import { decodeRoute, encodeRoute } from '../src/library.js';
import { personalStates, readFixture } from './characterization/oracle.js';

// The composition root (ADR 003, K2): one facade puts the core together for any UI. These tests
// drive it end to end without React or a browser.
const catalog = readFixture();
const index = indexCatalog(openCatalog(catalog), { now: () => new Date(0) });
const codec = { decode: location => decodeRoute(location, catalog), encode: route => encodeRoute(route, catalog) };
const memory = (values = {}) => ({ values, read: key => values[key] ?? null, write: (key, value) => { values[key] = value; return true; }, remove: key => { delete values[key]; } });
const history = start => {
  const entries = [start];
  let index = 0;
  return { entries, port: { current: () => entries[index], path: () => '/kitaps/', push: url => { entries.splice(++index, Infinity, url); }, replace: url => { entries[index] = url; }, back: () => { index -= 1; }, onChange: () => () => undefined } };
};

test('the hide-purchases setting is on unless it was turned off, and is written as on or off', () => {
  const fresh = memory();
  const settings = createSettings(fresh);
  assert.equal(settings.getSnapshot().hideOwned, true);
  assert.equal(fresh.values[HIDE_OWNED_KEY], 'on', 'written once read, as App.jsx does');
  settings.commands.setHideOwned(false);
  assert.equal(fresh.values[HIDE_OWNED_KEY], 'off');
  assert.equal(createSettings(memory({ [HIDE_OWNED_KEY]: 'off' })).getSnapshot().hideOwned, false);
  const broken = { read() { return null; }, write: () => false, remove() {} };
  const failing = createSettings(broken);
  failing.commands.setHideOwned(false);
  assert.deepEqual(failing.getSnapshot(), { hideOwned: false, saved: false }, 'the choice holds for the visit and says it was not saved');
});

test('the app corrects a page past the end in the address, as the page does today', () => {
  const browser = history('?sort=title&page=99');
  const app = createKitaplik({ catalog: index, location: browser.port, codec, storage: memory(), now: () => new Date(0) });
  const listing = app.listing.getSnapshot();
  assert.equal(listing.page, listing.pages);
  assert.equal(app.navigation.getSnapshot().route.page, listing.pages);
  assert.ok(browser.entries.at(-1).endsWith(`page=${listing.pages}`), browser.entries.at(-1));
  assert.equal(browser.entries.length, 1, 'corrected in place');
  app.dispose();
});

test('opening a book does not recompute the listing; the setting and the marks do', () => {
  const marks = personalStates(catalog.books);
  const app = createKitaplik({ catalog: index, location: history('?sort=title').port, codec, storage: memory({ [STATE_KEY]: JSON.stringify(marks) }), now: () => new Date(0) });
  const before = app.listing.getSnapshot();
  app.navigation.commands.openBook(before.bookIds[0]);
  assert.equal(app.listing.getSnapshot(), before, 'the listing snapshot is the same object');
  app.settings.commands.setHideOwned(false);
  const shown = app.listing.getSnapshot();
  assert.notEqual(shown, before);
  assert.ok(shown.shelfTotal > before.shelfTotal, 'purchased books come back');
  const target = shown.bookIds.find(id => !(marks[id] || []).includes('onemli'));
  app.personal.commands.toggleMark(target, 'onemli');
  assert.equal(app.listing.getSnapshot().favoriteCount, shown.favoriteCount + 1, 'the listing follows the personal library');
  assert.equal(app.catalog.byId[shown.bookIds[0]].id, shown.bookIds[0], 'the index is there for book pages');
  app.dispose();
});

test('the listing hands a design the books themselves and why purchases are showing', () => {
  const someone = index.books[0].id;
  const app = createKitaplik({ catalog: index, location: history('?status=purchased').port, codec, storage: memory({ [STATE_KEY]: JSON.stringify({ [someone]: ['alindi'] }) }), now: () => new Date(0) });
  const listing = app.listing.getSnapshot();
  assert.deepEqual(listing.books.map(book => book.id), listing.bookIds);
  assert.equal(listing.books[0], index.byId[listing.bookIds[0]], 'the catalogue\'s own records, not copies');
  assert.equal(listing.shelf.length, listing.shelfTotal);
  assert.equal(listing.showsHiddenPurchases, true);
  app.dispose();
});

test('reading priority comes from the catalogue alone: no mark ever moves a book', () => {
  const location = history('?page-size=384');
  const app = createKitaplik({ catalog: index, location: location.port, codec, storage: memory({ 'kitaplik:hide-owned:v1': 'off' }), now: () => new Date(0) });
  const order = () => app.listing.getSnapshot().bookIds;
  const before = order();
  assert.ok(before.length > 100);
  for (const [position, id] of before.entries()) app.personal.commands.toggleMark(id, ['onemli', 'alindi', 'okundu', 'okunuyor'][position % 4]);
  assert.equal(app.catalog.ranking, index.ranking, 'built once, with the index');
  assert.deepEqual(order(), before);
  app.dispose();
});

const liveHistory = start => {
  const entries = [start];
  let index = 0;
  const listeners = new Set();
  return { entries, current: () => entries[index], set(url) { entries[index] = url; for (const listener of [...listeners]) listener(); }, port: { current: () => entries[index], path: () => '', push: url => { entries.splice(++index, Infinity, url); }, replace: url => { entries[index] = url; }, back() {}, onChange: listener => { listeners.add(listener); return () => listeners.delete(listener); } } };
};

test('the back button landing past the last page corrects the address too', () => {
  const browser = liveHistory('?sort=title');
  const app = createKitaplik({ catalog: index, location: browser.port, codec, storage: memory(), now: () => new Date(0) });
  browser.set('?sort=title&page=9999');
  const { page, pages } = app.listing.getSnapshot();
  assert.equal(page, pages);
  assert.equal(app.navigation.getSnapshot().route.page, pages);
  assert.ok(browser.current().endsWith(`page=${pages}`), browser.current());
  app.dispose();
});

test('a list that shrinks under the last page moves the page and the address back, in place', () => {
  const marks = Object.fromEntries(index.books.slice(0, 25).map(book => [book.id, ['onemli']]));
  const browser = liveHistory('?view=favorites&page=2');
  const app = createKitaplik({ catalog: index, location: browser.port, codec, storage: memory({ [STATE_KEY]: JSON.stringify(marks) }), now: () => new Date(0) });
  assert.equal(app.navigation.getSnapshot().route.page, 2);
  app.personal.commands.toggleMark(index.books[0].id, 'onemli');
  assert.equal(app.listing.getSnapshot().pages, 1);
  assert.equal(app.navigation.getSnapshot().route.page, 1);
  assert.equal(browser.current(), '?view=favorites');
  assert.equal(browser.entries.length, 1, 'no new entry');
  app.dispose();
});

test('turning a setting that shrinks the list corrects the page the same way', () => {
  const owned = Object.fromEntries(index.books.map(book => [book.id, ['alindi']]));
  const browser = liveHistory('?sort=title&page=3');
  const app = createKitaplik({ catalog: index, location: browser.port, codec, storage: memory({ 'kitaplik:hide-owned:v1': 'off', [STATE_KEY]: JSON.stringify(owned) }), now: () => new Date(0) });
  assert.equal(app.navigation.getSnapshot().route.page, 3);
  app.settings.commands.setHideOwned(true);
  assert.equal(app.navigation.getSnapshot().route.page, 1);
  assert.ok(!browser.current().includes('page='), browser.current());
  app.dispose();
});
