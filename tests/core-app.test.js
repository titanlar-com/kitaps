import test from 'node:test';
import assert from 'node:assert/strict';
import { createKitaplik } from '../src/core/app.ts';
import { createSettings, HIDE_OWNED_KEY } from '../src/core/settings/settings.ts';
import { createStore } from '../src/core/store.ts';
import { decodeRoute, encodeRoute } from '../src/library.js';
import { personalStates, readFixture } from './characterization/oracle.js';

// The composition root (ADR 003, K2): one facade puts the core together for any UI. These tests
// drive it end to end without React or a browser.
const catalog = readFixture();
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
  const app = createKitaplik({ catalog, location: browser.port, codec, storage: memory(), marks: createStore({}), now: () => new Date(0) });
  const listing = app.listing.getSnapshot();
  assert.equal(listing.page, listing.pages);
  assert.equal(app.navigation.getSnapshot().route.page, listing.pages);
  assert.ok(browser.entries.at(-1).endsWith(`page=${listing.pages}`), browser.entries.at(-1));
  assert.equal(browser.entries.length, 1, 'corrected in place');
  app.dispose();
});

test('opening a book does not recompute the listing; the setting and the marks do', () => {
  const marks = createStore(personalStates(catalog.books));
  const app = createKitaplik({ catalog, location: history('?sort=title').port, codec, storage: memory(), marks, now: () => new Date(0) });
  const before = app.listing.getSnapshot();
  app.navigation.commands.openBook(before.bookIds[0]);
  assert.equal(app.listing.getSnapshot(), before, 'the listing snapshot is the same object');
  app.settings.commands.setHideOwned(false);
  const shown = app.listing.getSnapshot();
  assert.notEqual(shown, before);
  assert.ok(shown.shelfTotal > before.shelfTotal, 'purchased books come back');
  marks.update(states => ({ ...states, [shown.bookIds[0]]: ['onemli'] }));
  assert.equal(app.listing.getSnapshot().favoriteCount, shown.favoriteCount + (personalStates(catalog.books)[shown.bookIds[0]]?.includes('onemli') ? 0 : 1));
  assert.equal(app.catalog.byId[shown.bookIds[0]].id, shown.bookIds[0], 'the index is there for book pages');
  app.dispose();
});
