import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createKitaplik } from '../src/core/app.ts';
import { COMMAND_TYPES } from '../src/core/commands.ts';
import { openCatalog } from '../src/core/catalog/contract.ts';
import { indexCatalog } from '../src/core/catalog/catalog.ts';
import { decodeRoute, emptyFilters, encodeRoute } from '../src/library.js';
import { readFixture } from './characterization/oracle.js';

// Everything a screen asks of the core goes through one door, kitaplik.execute(command)
// (ADR 003, K7, changed on the owner's word on 9 November 2026).
const catalog = readFixture();
const index = indexCatalog(openCatalog(catalog), { now: () => new Date(0) });
const codec = { decode: location => decodeRoute(location, catalog), encode: route => encodeRoute(route, catalog) };
const open = (start = '?sort=title') => {
  const values = {};
  const entries = [start];
  let at = 0;
  const location = { current: () => entries[at], path: () => '/kitaps/', push: url => { entries.splice(++at, Infinity, url); }, replace: url => { entries[at] = url; }, back: () => { at -= 1; }, onChange: () => () => undefined };
  const storage = { read: key => values[key] ?? null, write: (key, value) => { values[key] = value; return true; }, remove: key => { delete values[key]; } };
  return { app: createKitaplik({ catalog: index, location, codec, storage, now: () => new Date(0) }), entries, values };
};
const [first, second] = catalog.books;
const route = app => app.navigation.getSnapshot().route;

test('every command of the core has its type, so none can be left outside the door', () => {
  const { app } = open();
  // correctPage is the facade's own correction after a listing; no screen asks for it.
  const typed = [...Object.keys(app.navigation.commands).filter(name => name !== 'correctPage'), ...Object.keys(app.personal.commands), ...Object.keys(app.settings.commands)];
  assert.deepEqual([...COMMAND_TYPES].sort(), typed.sort());
  app.dispose();
});

test('a reader\'s command does what the method does and answers the same', () => {
  const { app } = open();
  const result = app.execute({ type: 'toggleMark', id: first.id, key: 'okundu' });
  assert.deepEqual(result.after.includes('okundu'), true);
  assert.deepEqual(result.before, []);
  assert.deepEqual(app.personal.getSnapshot().states[first.id], result.after);
  assert.deepEqual(app.execute({ type: 'addToQueue', id: first.id }), { saved: true });
  app.execute({ type: 'addToQueue', id: second.id });
  app.execute({ type: 'moveInQueue', id: second.id, direction: -1 });
  assert.deepEqual(app.personal.getSnapshot().personal.queue, [second.id, first.id]);
  app.execute({ type: 'removeFromQueue', id: second.id });
  assert.deepEqual(app.personal.getSnapshot().personal.queue, [first.id]);
  app.execute({ type: 'editReading', id: first.id, patch: { page: 7 } });
  assert.equal(app.personal.getSnapshot().personal.reading[first.id].page, 7);
  app.execute({ type: 'restoreBackup', marks: { [second.id]: ['alindi'] }, input: {} });
  assert.deepEqual(app.personal.getSnapshot().states[second.id], ['alindi']);
  app.execute({ type: 'setHideOwned', on: false });
  assert.equal(app.settings.getSnapshot().hideOwned, false);
  app.dispose();
});

test('a screen moves around through the same door', () => {
  const { app, entries } = open();
  app.execute({ type: 'openBook', id: first.id });
  assert.equal(route(app).book, first.id);
  assert.equal(entries.length, 2, 'opening a book is a history entry');
  app.execute({ type: 'showBook', id: second.id });
  assert.equal(route(app).book, second.id);
  assert.equal(entries.length, 2, 'moving between books is not');
  app.execute({ type: 'closeBook' });
  assert.equal(route(app).book, null);
  app.execute({ type: 'goView', view: 'queue' });
  assert.equal(route(app).view, 'queue');
  app.execute({ type: 'go', route: { ...route(app), view: 'books' } });
  assert.equal(route(app).view, 'books');
  app.execute({ type: 'openCategory', id: first.categories[0] });
  assert.deepEqual(route(app).filters.categories, [first.categories[0]]);
  app.execute({ type: 'openCollection', id: first.collectionIds[0], groupId: undefined });
  assert.deepEqual(route(app).filters.collections, [first.collectionIds[0]]);
  app.execute({ type: 'changeFilters', filters: emptyFilters() });
  assert.deepEqual(route(app).filters, emptyFilters());
  app.execute({ type: 'changeSort', sort: 'title' });
  assert.equal(route(app).sort, 'title');
  app.execute({ type: 'changePageSize', pageSize: 48 });
  assert.equal(route(app).pageSize, 48);
  app.execute({ type: 'changePage', page: 2 });
  assert.equal(route(app).page, 2);
  app.execute({ type: 'goHome' });
  assert.equal(route(app).view, 'books');
  app.dispose();
});

test('a command the core does not know is refused and changes nothing', () => {
  const { app, values } = open();
  const before = JSON.stringify(values);
  assert.throws(() => app.execute({ type: 'silBastan' }), error => error instanceof TypeError && /silBastan/.test(error.message));
  assert.equal(JSON.stringify(values), before);
  app.dispose();
});

test('screens reach the core\'s commands only through execute', () => {
  const src = new URL('../src/', import.meta.url).pathname;
  const screens = ['ui/react/App.jsx', ...fs.readdirSync(path.join(src, 'ui/react/app')).map(file => `ui/react/app/${file}`), ...fs.readdirSync(path.join(src, 'ui/react/components')).map(file => `ui/react/components/${file}`)];
  const reaching = screens.filter(file => /(\.commands\b|\bcommands\s*:)/.test(fs.readFileSync(path.join(src, file), 'utf8')));
  assert.deepEqual(reaching, []);
});
