import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stampReadingDate } from '../src/reading.js';
import { catalogListing } from '../src/app/listing.js';
import { emptyFilters, prepareBooks } from '../src/library.js';

// Business rules that lived in App.jsx's handlers (ADR 002, phase 3), pinned before they move.
const catalog = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url)));
const books = prepareBooks(catalog.books);

test('marking a book as being read or read fills its start or finish day once, and only then', () => {
 const personal = { queue: [], reading: {} };
 const started = stampReadingDate(personal, 'goal', 'okunuyor', '2026-11-07');
 assert.equal(started.reading.goal.startedAt, '2026-11-07');
 assert.equal(started.reading.goal.finishedAt, '');
 // A day already written is kept.
 const again = stampReadingDate(started, 'goal', 'okunuyor', '2026-12-01');
 assert.equal(again.reading.goal.startedAt, '2026-11-07');
 const finished = stampReadingDate(started, 'goal', 'okundu', '2026-11-20');
 assert.equal(finished.reading.goal.finishedAt, '2026-11-20');
 assert.equal(finished.reading.goal.startedAt, '2026-11-07');
 // Other marks leave the reading record alone, and nothing is changed in place.
 assert.equal(stampReadingDate(personal, 'goal', 'alindi', '2026-11-07'), personal);
 assert.deepEqual(personal, { queue: [], reading: {} });
});

test('the catalogue listing filters the shelf, keeps the page in range and cuts the page out', () => {
 const states = { goal: ['alindi'], builttolast: ['alindi', 'okundu'] };
 const listing = (view, page, pageSize = 24) => catalogListing({ books, states, view, filters: emptyFilters(), sort: 'title', page, pageSize, rankings: {} });
 const all = listing('books', 1);
 assert.equal(all.filtered.length, books.length);
 assert.equal(all.displayed.length, 24);
 assert.equal(all.pages, Math.ceil(books.length / 24));
 // A page past the end shows the last one.
 const last = listing('books', 9999);
 assert.equal(last.currentPage, last.pages);
 assert.deepEqual(last.displayed, all.filtered.slice((last.pages - 1) * 24));
 // The owned shelf holds only owned books, and counts them.
 const owned = listing('owned', 1);
 assert.deepEqual(owned.filtered.map(book => book.id).sort(), ['builttolast', 'goal']);
 assert.equal(owned.ownedCount, 2);
 assert.equal(owned.pages, 1);
 // An empty shelf still has one page.
 assert.equal(listing('favorites', 3).pages, 1);
 assert.equal(listing('favorites', 3).currentPage, 1);
});

// "Satın aldıklarımı gösterme" (owner's request, 7 November 2026): on by default, it takes the
// purchased books out of the catalogue. The owned shelf, which exists to show them, keeps them.
test('hiding purchased books removes them from the catalogue but not from the owned shelf', () => {
 const states = { goal: ['alindi', 'onemli'], builttolast: ['alindi', 'okundu'], meditations: ['onemli'] };
 const listing = (view, hideOwned) => catalogListing({ books, states, view, filters: emptyFilters(), sort: 'title', page: 1, pageSize: 24, rankings: {}, hideOwned });
 const hidden = listing('books', true);
 assert.equal(hidden.filtered.length, books.length - 2);
 assert.ok(!hidden.filtered.some(book => ['goal', 'builttolast'].includes(book.id)));
 assert.equal(listing('books', false).filtered.length, books.length);
 assert.deepEqual(listing('owned', true).filtered.map(book => book.id).sort(), ['builttolast', 'goal']);
 // Favourites are a personal shelf as well: a purchased favourite stays there.
 assert.deepEqual(listing('favorites', true).filtered.map(book => book.id).sort(), ['goal', 'meditations']);
});
