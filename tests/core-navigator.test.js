import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigator } from '../src/core/navigation/navigator.ts';
import { bookSlug, decodeRoute, encodeRoute, emptyFilters } from '../src/library.js';
import { readFixture } from './characterization/oracle.js';

// Navigation as App.jsx does it today (ADR 003, phase 5), without React or a browser: the
// Navigator plays the controller role. It turns the address and history into a route and back;
// the codec (library.js) is passed in, so the core does not depend on it.
const catalog = readFixture();
const codec = { decode: location => decodeRoute(location, catalog), encode: route => encodeRoute(route, catalog) };
const [first, second] = [...catalog.books].sort((a, b) => (a.id < b.id ? -1 : 1));

/** A browser history: entries, the current one, push, replace, back and the popstate event. */
function fakeHistory(start = '') {
  const history = { entries: [start], index: 0, listeners: new Set() };
  const port = {
    current: () => history.entries[history.index],
    path: () => '',
    push: url => { history.entries.splice(history.index + 1, Infinity, url); history.index += 1; },
    replace: url => { history.entries[history.index] = url; },
    back: () => { if (history.index > 0) { history.index -= 1; for (const listener of [...history.listeners]) listener(); } },
    onChange: listener => { history.listeners.add(listener); return () => history.listeners.delete(listener); },
  };
  return { history, port, url: () => history.entries[history.index] };
}
const open = (start = '') => {
  const browser = fakeHistory(start);
  const navigator = createNavigator({ location: browser.port, codec });
  return { ...browser, navigator, route: () => navigator.getSnapshot().route, go: navigator.commands };
};

test('the first address is read, and a legacy address is written back in today\'s form', () => {
  const { route, url } = open('#overview');
  assert.equal(route().view, 'collections');
  assert.equal(url(), '?view=collections');
  assert.equal(open('').url(), '', 'the home address stays empty');
});

test('opening a book adds a history entry; back returns to the list, closing stays in place', () => {
  const { route, url, go, history } = open('?sort=title');
  go.openBook(first.id);
  assert.equal(route().book, first.id);
  assert.equal(url(), `?sort=title&book=${bookSlug(first)}`);
  assert.equal(history.entries.length, 2);
  go.back();
  assert.equal(route().book, null, 'the browser reported the change and the route followed');
  assert.equal(history.index, 0);
  go.openBook(second.id);
  go.closeBook();
  assert.equal(route().book, null);
  assert.equal(url(), '?sort=title');
  assert.equal(history.index, 1, 'closing in place keeps the entry');
});

test('showing another book replaces the entry, so a design can keep its own trail of books', () => {
  const { route, go, history } = open('');
  go.openBook(first.id);
  go.showBook(second.id);
  assert.equal(route().book, second.id);
  assert.equal(history.entries.length, 2);
  const direct = open(`?book=${second.id}`);
  direct.go.closeBook();
  assert.equal(direct.route().book, null);
  assert.equal(direct.history.entries.length, 1, 'a book opened by link closes without leaving the page');
  assert.equal(direct.url(), '');
});

test('the back button reads the address again; changing the page closes the book', () => {
  const { route, go, history } = open('');
  go.openBook(first.id);
  go.changePage(2);
  assert.equal(route().book, null, 'changing the page closes the book');
  history.index = 0;
  for (const listener of history.listeners) listener();
  assert.deepEqual(route(), codec.decode(''));
});

test('views, shelves, collections, categories and pages are history entries; sort and filters replace', () => {
  const { route, url, go, history } = open('?q=a&page=2');
  go.goView('favorites');
  assert.deepEqual([route().view, route().page, route().filters], ['favorites', 1, emptyFilters()], 'a shelf view starts without filters');
  go.goView('queue');
  assert.equal(route().view, 'queue');
  go.openCollection(catalog.collections[0].id, 'g');
  assert.deepEqual([route().view, route().filters.collections], ['books', [catalog.collections[0].id]]);
  go.openCategory('children');
  assert.deepEqual(route().filters.categories, ['children']);
  go.changePageSize(48);
  assert.deepEqual([route().pageSize, route().page], [48, 1]);
  const entries = history.entries.length;
  go.changeSort('author');
  go.changeFilters({ ...emptyFilters(), query: 'savaş' });
  assert.equal(history.entries.length, entries, 'sort and filters do not add entries');
  assert.deepEqual([route().sort, route().filters.query, route().page], ['author', 'savaş', 1]);
  assert.ok(url().includes('sort=author'));
});

test('a page past the end is corrected in place, and the home link resets everything', () => {
  const { route, go, history, navigator } = open('?page=9&sort=title');
  go.correctPage(3);
  assert.equal(route().page, 3);
  assert.equal(history.entries.length, 1);
  go.openBook(first.id);
  go.goHome();
  assert.deepEqual(route(), codec.decode(''));
  assert.equal(navigator.getSnapshot().route.book, null);
});

test('the snapshot is the same object until the route changes', () => {
  const { navigator, go } = open('');
  const before = navigator.getSnapshot();
  assert.equal(navigator.getSnapshot(), before);
  let calls = 0;
  navigator.subscribe(() => { calls += 1; });
  go.changeSort('reading');
  assert.equal(calls, 0, 'the same sort is no change');
  go.changeSort('title');
  assert.equal(calls, 1);
});
