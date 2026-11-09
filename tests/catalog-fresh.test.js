import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The catalogue the site ships is what the data files produce (ADR 003, "Önerilip alınmayanlar",
// done on the owner's word on 9 November 2026). A book added to data/ without `npm run data`, or
// a hand edit of src/catalog.json, stops here, in `npm test` and so before every publication.
test('src/catalog.json is exactly what the data files produce', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-catalog-'));
  try {
    const written = path.join(folder, 'catalog.json');
    execFileSync('python3', [new URL('../scripts/merge-data.py', import.meta.url).pathname, written], { stdio: 'pipe' });
    const shipped = fs.readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8');
    assert.ok(fs.readFileSync(written, 'utf8') === shipped, 'src/catalog.json differs from what the data files produce. Run npm run data and commit the result.');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
