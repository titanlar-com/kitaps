import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(found, ['css-import.js', 'document.js', 'env.js', 'jsx-import.js', 'mantine-import.js', 'nested/outside.js', 'raw-import.js', 'react-import.js', 'storage.js', 'view.jsx', 'window-probe.js']);
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
