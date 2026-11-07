// Adds the books that are not locked yet to tests/fixtures/identity/books.json (ADR 003, K10).
// It never changes or removes a locked entry: a rename is a reviewed change of its own.
//
//   node tests/characterization/record-identity.mjs
import fs from 'node:fs';
import { bookSlug } from '../../src/library.js';

const root = new URL('../../', import.meta.url);
const target = new URL('tests/fixtures/identity/books.json', root);
const catalog = JSON.parse(fs.readFileSync(new URL('src/catalog.json', root), 'utf8'));
const locked = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
let added = 0;
for (const book of catalog.books) if (!Object.hasOwn(locked, book.id)) { locked[book.id] = bookSlug(book); added += 1; }
const sorted = Object.fromEntries(Object.entries(locked).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
fs.mkdirSync(new URL('.', target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`identity lock: ${added} added, ${Object.keys(sorted).length} locked`);
