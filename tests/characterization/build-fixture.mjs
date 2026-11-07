// Builds the frozen catalogue the characterization tests run on (ADR 003, phase 0).
// It is a deterministic cut of src/catalog.json: every eighth book by id, plus books that
// exercise edge cases. It is committed and rebuilt only on purpose, so the books the owner
// adds every week never change what the characterization tests pin.
//
//   node tests/characterization/build-fixture.mjs
import fs from 'node:fs';
import { readingAudience } from '../../src/ranking/ReadingPriorityEngine.ts';

const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('src/catalog.json', root), 'utf8'));
const byId = [...catalog.books].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const chosen = new Set(byId.filter((_, index) => index % 8 === 0).map(book => book.id));
const firstThree = predicate => byId.filter(predicate).slice(0, 3).forEach(book => chosen.add(book.id));
firstThree(book => readingAudience(book) === 'children');
firstThree(book => book.memberships.some(m => m.collectionId === 'ft' && m.award));
firstThree(book => book.verifiedEdition);
firstThree(book => book.editions.some(edition => edition.status === 'avoid'));
firstThree(book => book.collectionIds.length >= 4);
firstThree(book => book.legacyKeys.length > 0);
firstThree(book => /[çğıöşüİ]/.test(book.title));
const latest = [...byId].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 3);
latest.forEach(book => chosen.add(book.id));

const fixture = { ...catalog, books: catalog.books.filter(book => chosen.has(book.id)) };
const target = new URL('tests/fixtures/characterization/catalog.json', root);
fs.mkdirSync(new URL('.', target), { recursive: true });
// One book per line keeps the file small and its diffs readable.
const body = Object.entries(fixture).map(([key, value]) => key === 'books'
  ? `"books":[\n${value.map(book => JSON.stringify(book)).join(',\n')}\n]`
  : `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',\n');
fs.writeFileSync(target, `{\n${body}\n}\n`);
console.log(`characterization catalogue: ${fixture.books.length} of ${catalog.books.length} books`);
