import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePercent } from '../src/core/catalog/collections.js';

// A collection one book short of done must not say %100 beside "not finished".
test('a share short of the whole never rounds up to a hundred percent', () => {
  assert.equal(sharePercent(337 / 338), '%99');
  assert.equal(sharePercent(1), '%100');
  assert.equal(sharePercent(0.5), '%50');
});
