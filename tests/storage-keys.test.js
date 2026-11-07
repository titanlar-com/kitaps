import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Every browser storage key the app has ever written (ADR 003, K10). A renamed key silently
// resets what readers keep on their devices, so a key is never renamed or dropped. A new key
// is added to this list in the same change that introduces it.
const KEYS = [
  'kitapatlasi:color-scheme',
  'kitapatlasi:github-state:base:v1',
  'kitapatlasi:github-state:connect-review:v1',
  'kitapatlasi:github-state:migrated:v1',
  'kitapatlasi:github-state:pending-basis:v1',
  'kitapatlasi:github-state:pending-recovery:v1',
  'kitapatlasi:github-state:pending:v1',
  'kitapatlasi:github-state:pending:v2',
  'kitapatlasi:github-state:pre-sync-backup:v1',
  'kitapatlasi:github-state:remote:v1',
  'kitapatlasi:github-state:token:v1',
  'kitapatlasi:personal:v1',
  'kitapatlasi:routes:pending:v1',
  'kitapatlasi:routes:v1',
  'kitapatlasi:states:v2',
  'kitapatlasi:sync-notice:dismissed:v1',
  'kitaplik:hide-owned:v1',
  'kitaps:states:v1',
];

const sourceFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? sourceFiles(full) : /\.(js|jsx|ts|mjs)$/.test(entry.name) ? [full] : [];
});

test('the browser storage keys in the code are exactly the registered ones', () => {
  const found = new Set();
  for (const file of sourceFiles(new URL('../src', import.meta.url).pathname)) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/['"`]((?:kitapatlasi|kitaplik|kitaps):[a-z][a-z0-9:-]*)['"`]/g)) found.add(match[1]);
  }
  assert.deepEqual([...found].sort(), [...KEYS].sort());
});
