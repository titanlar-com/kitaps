import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Phase 7 of docs/UI-REDESIGN.md. The stylesheets and components of the panels take every colour,
// corner and text size from the tokens. tests/ui-gates.test.js already covers motion, focus and
// accent edges for the whole of src/; these are the rules it does not read.
const read = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
const stylesheets = ['components/FilterSheet.css', 'components/FooterMenu.css', 'components/SyncPanels.css', 'components/LibraryToast.css'];
const components = ['FilterSheet', 'GitHubSyncPanel', 'SyncNotice', 'SyncRecovery', 'SyncMergeDialog', 'SyncStatusLine', 'FooterMenu', 'LibraryToast'].map(name => `components/${name}.jsx`);
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = (text, name) => [...withoutComments(text).matchAll(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;}]+)`, 'g'))].map(match => match[1].trim());

for (const file of stylesheets) {
  test(`${file}: colours come only from tokens`, () => {
    const text = withoutComments(read(file));
    assert.deepEqual(text.match(/#[0-9a-f]{3,8}\b/gi) ?? [], [], 'no hex colour');
    assert.deepEqual(text.match(/\b(?:rgba?|hsla?|oklch|lab|lch)\(/gi) ?? [], [], 'no colour function with literal values');
    assert.deepEqual(text.match(/:\s*(?:white|black|red|orange|yellow|green|blue|gray|grey)\b/gi) ?? [], [], 'no named colour');
  });

  test(`${file}: no corner is written by hand`, () => {
    const corners = declarations(read(file), 'border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius');
    assert.deepEqual(corners.filter(value => !/^(?:0|(?:var\(--radius(?:-(?:xs|sm|lg))?\)|0)(?:\s+(?:var\(--radius(?:-(?:xs|sm|lg))?\)|0))*)$/.test(value)), []);
  });

  test(`${file}: no text is set under 14 px`, () => {
    const sizes = declarations(read(file), 'font-size');
    const small = sizes.filter(value => {
      if (/^var\(--text-(?:sm|md|lg|xl)\)$/.test(value)) return false;
      const rem = value.match(/^(\d*\.?\d+)rem$/);
      return !rem || Number(rem[1]) < .875;
    });
    assert.deepEqual(small, []);
  });
}

for (const file of components) {
  test(`${file}: no Mantine palette colour and no native select`, () => {
    const text = read(file);
    assert.deepEqual(text.match(/\bc(?:olor)?=(?:"|\{')(?!dimmed|brand)[a-z]+/g) ?? [], []);
    assert.doesNotMatch(text, /<select\b/);
  });
}

test('the main stylesheet no longer carries the panels\' old rules', () => {
  const styles = read('styles.css');
  assert.doesNotMatch(styles, /\.token-steps/);
  assert.doesNotMatch(styles, /\.library-toast/);
});

test('the filter sheet draws no frame around each row', () => {
  const css = read('components/FilterSheet.css');
  const rule = selector => withoutComments(css).match(new RegExp(`(?:^|})\\s*${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  assert.doesNotMatch(rule('\\.filter-choice'), /border\s*:\s*1px/);
  assert.doesNotMatch(rule('\\.filter-section-link'), /border-bottom/);
});
