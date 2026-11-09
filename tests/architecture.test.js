import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { boundToScreens, coreTexts, coreViolations, filesUnder, importGraph, hasRuntimeCode, shownWords, uiDataImports } from './architecture/boundaries.js';
import os from 'node:os';

// The data core stays free of any UI technology (ADR 003, "Sınır kapıları"), so a new design
// or a new framework can use it as it is, and Node scripts (SEO) can too.
const core = new URL('../src/core', import.meta.url).pathname;
const fixtures = new URL('./fixtures/architecture/', import.meta.url).pathname;

test('the data core imports no UI technology, no bundler asset and no browser global', () => {
  assert.deepEqual(coreViolations(core), []);
});

test('the words the core shows a reader live in one module', () => {
  assert.deepEqual(coreTexts(core), []);
});

test('that gate catches a shown word, and leaves code, comments and data values alone', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-texts-'));
  try {
    fs.writeFileSync(path.join(folder, 'text.js'), "export const A = 'Kitaplığım';\n");
    fs.writeFileSync(path.join(folder, 'clean.js'), "// Kitaplığım\nexport const b = fair => fair.country === 'Türkiye' ? 'ok' : 'no';\n");
    assert.deepEqual(coreTexts(folder), []);
    fs.writeFileSync(path.join(folder, 'shown.js'), 'export const c = n => `${n} gün kaldı`;\n');
    fs.writeFileSync(path.join(folder, 'plain.js'), "export const d = 'Türkçe var';\n");
    assert.deepEqual(coreTexts(folder).map(line => line.split(':')[0]).sort(), ['plain.js', 'shown.js']);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

// Screen models (ADR 003, K6) carry a screen's words and composition, and pass the core's own gate.
const src = new URL('../src/', import.meta.url).pathname;
test('screen models use no UI technology, no browser global and nothing but the core', () => {
  assert.deepEqual(coreViolations(path.join(src, 'screens'), { alsoAllowed: [path.join(src, 'core')] }), []);
});

// The audit panel exists only on the development server, for the people working on the site.
const DEVELOPMENT_ONLY = ['components/AccessibilityAudit.jsx'];
test('every word a reader sees comes from a screen model or the core', () => {
  const screens = ['App.jsx', 'main.jsx', ...fs.readdirSync(path.join(src, 'app')).map(file => `app/${file}`), ...fs.readdirSync(path.join(src, 'components')).map(file => `components/${file}`)].filter(file => /\.jsx?$/.test(file) && !DEVELOPMENT_ONLY.includes(file));
  assert.deepEqual(screens.flatMap(file => shownWords(path.join(src, file)).map(word => `${file}: ${word}`)), []);
  assert.ok(boundToScreens(src).length >= 11, 'the screens are bound, so the walk is real');
});

test('the word gate catches words with no Turkish letter too, and leaves code alone', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-words-'));
  const words = source => { const file = path.join(folder, 'part.jsx'); fs.writeFileSync(file, source); return shownWords(file); };
  try {
    assert.deepEqual(words('export const A = () => <Button>Temizle</Button>;\n'), ['Temizle']);
    assert.deepEqual(words('export const A = () => <a aria-label="Sayfa"/>;\n'), ['Sayfa']);
    assert.deepEqual(words("export const a = { closeButtonProps: { 'aria-label': 'Kapat' } };\n"), ['Kapat']);
    assert.deepEqual(words('export const A = () => <input placeholder={\'Ara\'}/>;\n'), ['Ara']);
    assert.deepEqual(words('export const A = ({ t }) => <div className="book-card" data-x="y" aria-label={t} alt="">{t} · 3</div>;\n'), []);
    assert.deepEqual(words("export const a = { label: t => t, value: 'title' };\n"), []);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
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
const WAITING_FOR_THE_UI = [];

test('every core and adapter module is used by the app or a build script, or listed as waiting for the UI', () => {
  const src = new URL('../src/', import.meta.url).pathname;
  const entries = [path.join(src, 'main.jsx'), ...fs.readdirSync(new URL('../scripts/', import.meta.url)).filter(name => name.endsWith('.mjs')).map(name => new URL(`../scripts/${name}`, import.meta.url).pathname)];
  const reached = new Set(entries.flatMap(entry => importGraph(entry)));
  const modules = [...filesUnder(path.join(src, 'core')), ...filesUnder(path.join(src, 'adapters'))].filter(hasRuntimeCode);
  const unreached = modules.filter(file => !reached.has(file)).map(file => path.relative(src, file)).sort();
  assert.deepEqual(unreached, WAITING_FOR_THE_UI);
  // Lower this whenever a module is bound; raising it needs an independent review.
  assert.ok(WAITING_FOR_THE_UI.length === 0, 'the list only shrinks');
});

// After binding, screens get data through the facade (src/app/catalogData.js) and the core
// (ADR 003, "Sınır kapıları"). The pages below still load their own data in their own lazy chunk,
// which is what keeps it out of the first download. This list only shrinks.
const OWN_DATA_PAGES = ['components/BookFairsPage.jsx', 'components/BookstoresPage.jsx', 'components/NotesPage.jsx', 'components/RoutePlanner.jsx'];

test('screens do not import the catalogue, the data files or the GitHub repositories directly', () => {
  const src = new URL('../src/', import.meta.url).pathname;
  const screens = ['App.jsx', 'main.jsx', ...fs.readdirSync(path.join(src, 'app')).map(file => `app/${file}`), ...fs.readdirSync(path.join(src, 'components')).map(file => `components/${file}`)].filter(file => /\.(js|jsx)$/.test(file) && file !== 'app/catalogData.js');
  const reaching = screens.filter(file => uiDataImports(path.join(src, file)).length).sort();
  assert.deepEqual(reaching, OWN_DATA_PAGES);
});

test('the screen gate reports each kind of direct import and leaves the facade alone', () => {
  const fixtures = new URL('./fixtures/architecture/ui/', import.meta.url).pathname;
  assert.equal(uiDataImports(path.join(fixtures, 'reads-data.jsx')).length, 5);
  assert.deepEqual(uiDataImports(path.join(fixtures, 'keeps-the-rule.jsx')), []);
});
