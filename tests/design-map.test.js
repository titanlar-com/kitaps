import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// docs/UI-REDESIGN.md names the Mantine component each screen is built from. The owner asked for
// the whole map, with nothing left out on purpose (9 November 2026), so this holds it in place.
const read = file => fs.readFileSync(new URL(`../src/ui/react/${file}`, import.meta.url), 'utf8');
const imports = (file, name, from = '@mantine/core') => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${from}'`).test(read(file));

const MAP = [
  ['AppShell', 'App.jsx'],
  ['Kbd', 'App.jsx'],
  ['Affix', 'components/BackToTop.jsx'],
  ['Chip', 'app/ActiveFilters.jsx'],
  ['AspectRatio', 'app/BookCover.jsx'],
  ['Breadcrumbs', 'app/BookDetail.jsx'],
  ['Menu', 'app/BookDetail.jsx'],
  ['Typography', 'components/NotesPage.jsx'],
  ['TableOfContents', 'components/NotesPage.jsx'],
  ['Timeline', 'components/ReadingQueue.jsx'],
];

for (const [name, file] of MAP) test(`${file} is built with ${name}`, () => assert.ok(imports(file, name), `${name} is on the design map`));

test('the command palette is Mantine Spotlight, and it loads only when it is asked for', () => {
  assert.ok(imports('components/CommandPalette.jsx', 'Spotlight', '@mantine/spotlight'));
  assert.match(read('App.jsx'), /React\.lazy\(\(\)=>import\('\.\/components\/CommandPalette'\)\)/);
});

test('the design document no longer lists anything as left out of the map', () => {
  const doc = fs.readFileSync(new URL('../docs/UI-REDESIGN.md', import.meta.url), 'utf8');
  assert.doesNotMatch(doc, /Breadcrumbs kullanılmadı/);
  assert.doesNotMatch(doc, /Timeline yerine numaralı/);
  assert.doesNotMatch(doc, /ileride değerlendirilir/);
});
