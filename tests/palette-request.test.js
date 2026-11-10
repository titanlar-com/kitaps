import test from 'node:test';
import assert from 'node:assert/strict';
import { askForPalette, dropPaletteRequest, paletteStillWanted } from '../src/ui/react/app/paletteRequest.js';

// A stand-in page whose open dialogs the test sets.
const page = (...dialogs) => ({ open: dialogs, querySelectorAll: function () { return this.open; } });

test('a request with nothing in between opens the quick search', () => {
  const doc = page();
  assert.equal(paletteStillWanted(askForPalette(doc), doc), true);
});

test('a dialog that was already open, such as the closing footer menu, does not stop it', () => {
  const menu = { id: 'footer-menu' };
  const doc = page(menu);
  const ask = askForPalette(doc);
  assert.equal(paletteStillWanted(ask, doc), true);
  doc.open = [];
  assert.equal(paletteStillWanted(ask, doc), true);
});

test('a book or another dialog opened after the request stops it', () => {
  const doc = page();
  const ask = askForPalette(doc);
  doc.open = [{ id: 'book-sheet' }];
  assert.equal(paletteStillWanted(ask, doc), false);
});

test('an Escape or a press on the page after the request stops it', () => {
  const doc = page();
  const ask = askForPalette(doc);
  dropPaletteRequest(ask);
  assert.equal(paletteStillWanted(ask, doc), false);
});

test('without a request it stays closed, and dropping nothing does no harm', () => {
  assert.equal(paletteStillWanted(null, page()), false);
  assert.doesNotThrow(() => dropPaletteRequest(null));
});
