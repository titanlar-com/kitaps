import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { motionCss } from '../src/motion.js';
import viteConfig from '../vite.config.js';

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

test('its motion reads the shared tokens, and stops for readers who ask for less motion', () => {
  assert.match(html, /animation:first-load var\(--motion-busy\) var\(--motion-ease\) infinite/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#first-load i\{animation:none\}\}/);
});

test('the build writes the motion tokens into the first response, in every build mode', async () => {
  for (const mode of ['production', 'standalone']) {
    const plugin = viteConfig({ mode }).plugins.flat().find(item => item?.name === 'motion-tokens');
    assert.ok(plugin, `motion-tokens plugin in ${mode}`);
    const hook = plugin.transformIndexHtml;
    const output = await (hook.handler ?? hook)('<head></head>');
    assert.ok(output.includes(`<style>${motionCss()}</style>`), mode);
  }
});

test('its colours come from the chosen scheme, with walnut as the fallback', () => {
  assert.match(html, /background:var\(--paper,#[0-9a-f]{6}\)/);
  assert.match(html, /color:var\(--ink,#[0-9a-f]{6}\)/);
});
