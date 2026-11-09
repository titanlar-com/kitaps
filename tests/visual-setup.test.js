import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// The screenshots are compared on one Linux image, the one they were taken on (ADR 003, K11).
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const { version } = createRequire(import.meta.url)('@playwright/test/package.json');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

test('CI and the local script compare screenshots on the image of the installed Playwright', () => {
  assert.ok(read('.github/workflows/pages.yml').includes(`container: ${image}`), image);
  assert.ok(read('scripts/visual-linux.sh').includes(image), image);
});

test('nothing is published before the screenshots have been compared', () => {
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /needs: \[build, visual\]/);
  assert.match(workflow, /run: npm run test:visual/);
  assert.match(workflow, /visual:[\s\S]*runs-on: ubuntu-24\.04-arm/, 'the same processor family the screenshots were recorded on');
});

test('the screenshots use a frozen cut of the data, so a new book does not move them', () => {
  const config = read('vite.config.js');
  for (const file of ['tests/fixtures/characterization/catalog.json', 'tests/fixtures/visual/bookstores.json', 'tests/fixtures/visual/book-fairs.json']) assert.ok(config.includes(file), file);
  assert.match(JSON.parse(read('package.json')).scripts['test:visual'], /KITAPLIK_FROZEN_DATA=1/);
});
