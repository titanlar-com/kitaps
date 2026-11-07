import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreViolations, filesUnder, importGraph } from './architecture/boundaries.js';

// The data core stays free of any UI technology (ADR 003, "Sınır kapıları"), so a new design
// or a new framework can use it as it is, and Node scripts (SEO) can too.
const core = new URL('../src/core', import.meta.url).pathname;
const fixtures = new URL('./fixtures/architecture/', import.meta.url).pathname;

test('the data core imports no UI technology, no bundler asset and no browser global', () => {
  assert.deepEqual(coreViolations(core), []);
});

test('every module of the data core loads in plain Node', async () => {
  for (const file of filesUnder(core)) await import(pathToFileURL(file).href);
});

test('the gate catches each kind of violation and passes code that keeps the rules', () => {
  const found = coreViolations(path.join(fixtures, 'violations')).map(line => line.split(':')[0]).sort();
  assert.deepEqual(found, ['css-import.js', 'document.js', 'env.js', 'global-this.js', 'history.js', 'jsx-import.js', 'location.js', 'mantine-import.js', 'media.js', 'nested/outside.js', 'raw-import.js', 'react-import.js', 'scoped.js', 'storage.js', 'view.jsx', 'window-probe.js']);
  assert.deepEqual(coreViolations(path.join(fixtures, 'clean')), []);
});

test('library.js and seo.js, which the build scripts run in Node, reach no JSX, CSS or UI package', () => {
  for (const entry of ['../src/library.js', '../src/seo.js']) {
    const reached = importGraph(new URL(entry, import.meta.url).pathname);
    const forbidden = reached.filter(item => /\.(jsx|tsx|css)$|\?raw|^react|^@mantine|^@tabler/.test(item));
    assert.deepEqual(forbidden, [], entry);
    assert.ok(reached.length > 1, `${entry} imports something, so the walk is real`);
  }
});

// A core module nothing uses yet is listed here by name (ADR 003, "Sınır kapıları"). The list
// only shrinks: binding the UI (phase 7) removes names, and a new module that nothing reaches
// fails this test instead of rotting unnoticed.
const WAITING_FOR_THE_UI = [
  'adapters/browser/ports.js',
  'adapters/react/useViewModel.js',
  'core/app.ts',
  'core/catalog/catalog.ts',
  'core/catalog/listing.js',
  'core/catalog/listingViewModel.ts',
  'core/navigation/navigator.ts',
  'core/settings/settings.ts',
  'core/store.ts',
];

test('every core and adapter module is used by the app or a build script, or listed as waiting for the UI', () => {
  const src = new URL('../src/', import.meta.url).pathname;
  const entries = [path.join(src, 'main.jsx'), ...fs.readdirSync(new URL('../scripts/', import.meta.url)).filter(name => name.endsWith('.mjs')).map(name => new URL(`../scripts/${name}`, import.meta.url).pathname)];
  const reached = new Set(entries.flatMap(entry => importGraph(entry)));
  const modules = [...filesUnder(path.join(src, 'core')), ...filesUnder(path.join(src, 'adapters'))];
  const unreached = modules.filter(file => !reached.has(file)).map(file => path.relative(src, file)).sort();
  assert.deepEqual(unreached, WAITING_FOR_THE_UI);
  // Lower this whenever a module is bound; raising it needs an independent review.
  assert.ok(WAITING_FOR_THE_UI.length <= 9, 'the list only shrinks');
});
