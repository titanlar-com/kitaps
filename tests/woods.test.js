import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_WOOD, WOODS, WOOD_KEY, readWood, saveWood } from '../src/app/woods.js';

// The owner, 8 November 2026: a reader picks a wood colour scheme, and dark walnut is the default.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/woods.css', import.meta.url), 'utf8');
const memory = (initial = {}) => { const data = new Map(Object.entries(initial)); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), data }; };

test('there are three woods and walnut comes first', () => {
  assert.deepEqual(WOODS.map(wood => wood.id), ['ceviz', 'mese', 'akasya']);
  assert.equal(DEFAULT_WOOD, 'ceviz');
  for (const wood of WOODS) assert.ok(wood.label && wood.note, wood.id);
});

test('every wood has a dark and a light block in the stylesheet', () => {
  for (const wood of WOODS) for (const mode of ['dark', 'light']) assert.ok(css.includes(`[data-wood='${wood.id}'][data-mantine-color-scheme='${mode}']`), `${wood.id} ${mode}`);
});

test('a saved wood is read back, and anything else falls back to walnut', () => {
  assert.equal(readWood(memory({ [WOOD_KEY]: 'mese' })), 'mese');
  assert.equal(readWood(memory({ [WOOD_KEY]: 'plastik' })), 'ceviz');
  assert.equal(readWood(memory()), 'ceviz');
  assert.equal(readWood({ getItem() { throw new Error('blocked'); } }), 'ceviz');
});

test('saving a wood survives a storage that refuses it', () => {
  const storage = memory();
  saveWood('akasya', storage);
  assert.equal(storage.data.get(WOOD_KEY), 'akasya');
  assert.doesNotThrow(() => saveWood('mese', { setItem() { throw new Error('full'); } }));
});

// The scheme is set before the first paint, by the script in index.html.
const prePaint = html.match(/<script>([\s\S]*?data-wood[\s\S]*?)<\/script>/)?.[1];
const runPrePaint = localStorage => {
  const attributes = {};
  vm.runInNewContext(prePaint, { localStorage, document: { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } } });
  return attributes;
};

test('the first visit opens in dark walnut, whatever was saved under the old brick design', () => {
  assert.ok(prePaint, 'index.html sets the scheme before the first paint');
  const storage = memory({ 'kitapatlasi:color-scheme': 'light' });
  assert.deepEqual(runPrePaint(storage), { 'data-wood': 'ceviz', 'data-mantine-color-scheme': 'dark' });
  assert.equal(storage.data.get('kitapatlasi:color-scheme'), undefined, 'the old choice is cleared once');
  assert.equal(storage.data.get(WOOD_KEY), 'ceviz', 'so it is cleared only once');
});

test('later visits keep the reader\'s wood and mode', () => {
  assert.deepEqual(runPrePaint(memory({ [WOOD_KEY]: 'akasya', 'kitapatlasi:color-scheme': 'light' })), { 'data-wood': 'akasya', 'data-mantine-color-scheme': 'light' });
  assert.deepEqual(runPrePaint(memory({ [WOOD_KEY]: 'mese' })), { 'data-wood': 'mese', 'data-mantine-color-scheme': 'dark' });
  assert.deepEqual(runPrePaint(memory({ [WOOD_KEY]: 'plastik' })), { 'data-wood': 'ceviz', 'data-mantine-color-scheme': 'dark' });
});

test('a blocked storage still paints dark walnut', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} };
  assert.deepEqual(runPrePaint(blocked), { 'data-wood': 'ceviz', 'data-mantine-color-scheme': 'dark' });
});

test('the pre-paint script knows every wood', () => {
  for (const wood of WOODS) assert.ok(prePaint.includes(wood.id), wood.id);
  assert.ok(prePaint.includes(WOOD_KEY));
});
