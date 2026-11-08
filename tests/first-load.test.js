import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MOTION_EASE } from '../src/motion.js';

// The script and the catalogue are megabytes; until they arrive the page has nothing of its own.
// The owner, 8 November 2026: a loading state is what keeps a reader on the site, so the first
// response carries one. It lives in the HTML because no script has run yet.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the first response says the site is loading, inside the root React replaces', () => {
  assert.match(html, /<div id="root"><div id="first-load" role="status">/);
  assert.match(html, /Kitaplık hazırlanıyor…/);
});

test('without JavaScript the loading state does not stay on screen', () => {
  assert.match(html, /<noscript><style>#first-load\{display:none\}<\/style><\/noscript>/);
});

test('its motion is the site curve and stops for readers who ask for less motion', () => {
  assert.ok(html.includes(MOTION_EASE), 'uses the shared curve');
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#first-load i\{animation:none\}\}/);
});

test('its colours are the site tokens in both schemes, so the page does not flash', () => {
  const [light, dark] = css.match(/--paper:#[0-9a-f]{6}/g).map(value => value.split(':')[1]);
  const [inkLight, inkDark] = css.match(/--ink:#[0-9a-f]{6}/g).map(value => value.split(':')[1]);
  for (const colour of [light, dark, inkLight, inkDark]) assert.ok(html.includes(colour), colour);
  assert.match(html, /@media \(prefers-color-scheme:dark\)/);
});
