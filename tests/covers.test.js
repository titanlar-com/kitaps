import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/catalog.json'), 'utf8'));
const upgrades = JSON.parse(fs.readFileSync(path.join(root, 'data/cover-upgrades.json'), 'utf8'));

/** Pixel width of a JPEG, PNG or WebP file, read from its header. */
function widthOf(file) {
 const data = fs.readFileSync(file);
 if (data.toString('ascii', 1, 4) === 'PNG') return data.readUInt32BE(16);
 if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return data.readUInt16LE(26) & 0x3fff;
  if (chunk === 'VP8L') return 1 + (((data[22] & 0x3f) << 8) | data[21]);
  if (chunk === 'VP8X') return 1 + data.readUIntLE(24, 3);
 }
 for (let offset = 2; offset < data.length;) {
  const marker = data[offset + 1];
  const length = data.readUInt16BE(offset + 2);
  if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return data.readUInt16BE(offset + 7);
  offset += 2 + length;
 }
 throw new Error(`unknown image format: ${file}`);
}

const covers = [...new Set(catalog.books.filter(book => book.cover?.src).map(book => book.cover.src))];

test('every cover has a large copy and a small copy for phones and thumbnails', () => {
 for (const src of covers) {
  const large = path.join(root, 'public', src);
  const small = path.join(root, 'public', src.replace(/^covers\//, 'covers/sm/'));
  assert.ok(fs.existsSync(small), `${src}: missing covers/sm copy`);
  const [largeWidth, smallWidth] = [widthOf(large), widthOf(small)];
  // The srcset in App.jsx announces 400w and 720w.
  assert.ok(smallWidth <= 400, `${src}: small copy is ${smallWidth} px`);
  assert.ok(largeWidth <= 720, `${src}: large copy is ${largeWidth} px`);
  assert.ok(smallWidth <= largeWidth, `${src}: small copy wider than the large one`);
  // The small copy is never shrunk below what the cover has, up to its own 400 px.
  assert.ok(smallWidth >= Math.min(largeWidth, 400), `${src}: small copy is only ${smallWidth} px of ${largeWidth}`);
 }
});

test('every cover in the catalog has its resolution record', () => {
 // A run for a few covers (--only) must not drop the records of all the others.
 const missing = covers.filter(src => !upgrades.covers[src]);
 assert.deepEqual(missing, []);
});

test('a cover replaced after review says why', () => {
 const reviewed = Object.entries(upgrades.covers).filter(([, entry]) => entry.status === 'replaced-by-review');
 for (const [src, entry] of reviewed) {
  assert.ok(entry.reason?.length > 20, src);
  assert.match(entry.to.url, /^https:\/\//, src);
 }
});

test('every sharper cover is a larger copy of the same image from its own source', () => {
 // Another site's image of the same ISBN often shows another printing, so only the
 // recorded source's own larger copy is used (scripts/upgrade-covers.py).
 const upgraded = Object.entries(upgrades.covers).filter(([, entry]) => entry.status === 'upgraded');
 assert.ok(upgraded.length > 0);
 for (const [src, entry] of upgraded) {
  assert.ok(covers.includes(src), src);
  // Some FT originals are served only over plain http (an S3 website endpoint); the file itself is local.
  assert.match(entry.to.url, /^https?:\/\//, src);
  assert.ok(entry.to.hashDistance <= 6, `${src}: not shown to be the same image`);
  assert.ok(entry.to.effective > entry.from.effective, `${src}: not sharper than before`);
  assert.equal(entry.to.source, 'kaynağın büyük kopyası', src);
 }
});
