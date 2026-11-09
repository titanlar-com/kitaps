// What the UI receives today, computed on the frozen catalogue (ADR 003, phase 0).
// The characterization tests compare these outputs with the golden files recorded on
// 8 November 2026. Any implementation of the same query (the current one, or the new data
// core) is passed in, so both are held to the same golden files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { bookSlug, decodeRoute, emptyFilters, encodeRoute, prepareBooks } from '../../src/library.js';
import { seoState } from '../../src/seo.js';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../../src/ranking/ReadingPriorityEngine.ts';

export const readFixture = () => JSON.parse(fs.readFileSync(new URL('../fixtures/characterization/catalog.json', import.meta.url), 'utf8'));
export const readGolden = name => JSON.parse(fs.readFileSync(new URL(`../fixtures/characterization/golden/${name}.json`, import.meta.url), 'utf8'));
export const writeGolden = (name, value) => {
  const target = new URL(`../fixtures/characterization/golden/${name}.json`, import.meta.url);
  fs.mkdirSync(new URL('.', target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 1)}\n`);
};

const sortedIds = books => books.map(book => book.id).sort();
const unique = values => [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'tr'));

/** A reader's marks on some of the books: every mark, exclusive pairs and several marks at once. */
export function personalStates(books) {
  const pattern = [['onemli'], ['alindi'], ['okunuyor', 'onemli'], ['alinacak'], ['okundu', 'alindi'], ['araverildi'], ['birakildi', 'onemli'], ['alindi', 'onemli']];
  return Object.fromEntries(sortedIds(books).slice(0, 48).map((id, index) => [id, pattern[index % pattern.length]]));
}

/** The catalogue queries the UI can make: every view, sort and filter, page sizes and pages. */
export function listingQueries(books) {
  const categories = unique(books.flatMap(book => book.categories));
  const collections = unique(books.flatMap(book => book.collectionIds));
  const groups = unique(books.flatMap(book => book.groupIds));
  const authors = unique(books.map(book => book.author).filter(Boolean));
  const origins = unique(books.flatMap(book => book.origins));
  const addedDates = unique(books.map(book => book.addedAt).filter(Boolean)).reverse();
  const awards = unique(books.flatMap(book => book.memberships.filter(m => m.collectionId === 'ft' && m.award).map(m => m.award)));
  const awardYears = unique(books.flatMap(book => book.memberships.filter(m => m.collectionId === 'ft' && m.awardYear).map(m => String(m.awardYear))));
  const qualities = unique(books.flatMap(book => book.editions.flatMap(edition => edition.status || [])));
  const base = { view: 'books', sort: 'reading', filters: emptyFilters(), page: 1, pageSize: 24, hideOwned: false };
  const filtered = (name, filters, extra = {}) => ({ name, ...base, ...extra, filters: { ...emptyFilters(), ...filters } });
  const queries = [];
  for (const view of ['books', 'favorites', 'owned']) {
    for (const hideOwned of [false, true]) queries.push({ name: `view ${view}, hide owned ${hideOwned}`, ...base, view, hideOwned });
  }
  for (const sort of ['reading', 'shared', 'title', 'author', 'newest', 'added', 'saved', 'unknown-sort']) queries.push({ name: `sort ${sort}`, ...base, sort });
  for (const pageSize of [24, 48, 96]) {
    for (const page of [1, 2, 3, 999]) queries.push({ name: `page ${page} of ${pageSize}`, ...base, sort: 'title', page, pageSize });
  }
  // Turkish letters in the query and in the title, either case, a dotless i, several words.
  for (const query of ['savaş', 'SAVAS', 'işletmenin', 'İŞLETMENİN', 'ı', 'the art', 'zzz-no-match', '  çocuk  ']) queries.push(filtered(`search "${query}"`, { query }));
  // Pairs that occur together on one book, so the "all" mode has something to match.
  const pair = list => books.map(list).find(values => values.length >= 2).slice(0, 2);
  const award = books.flatMap(book => book.memberships).find(m => m.collectionId === 'ft' && m.award && m.awardYear);
  queries.push(filtered('one category', { categories: categories.slice(0, 1) }));
  queries.push(filtered('two categories, any', { categories: categories.slice(0, 2) }));
  queries.push(filtered('two categories, all', { categories: pair(book => book.categories), categoryMode: 'all' }));
  queries.push(filtered('children category', { categories: ['children'] }));
  queries.push(filtered('two collections, any', { collections: collections.slice(0, 2) }));
  queries.push(filtered('two collections, all', { collections: pair(book => book.collectionIds), collectionMode: 'all' }));
  queries.push(filtered('a group', { groups: groups.slice(0, 1) }));
  queries.push(filtered('marked favourite', { states: ['onemli'] }));
  queries.push(filtered('purchased or reading', { states: ['alindi', 'okunuyor'] }));
  queries.push(filtered('an author', { authors: authors.slice(0, 1) }));
  queries.push(filtered('an origin', { origins: origins.slice(0, 1) }));
  queries.push(filtered('the latest added day', { addedDates: addedDates.slice(0, 1) }));
  queries.push(filtered('an award', { awards: awards.slice(0, 1) }));
  queries.push(filtered('an award year', { awardYears: awardYears.slice(0, 1) }));
  queries.push(filtered('an award in a year', { awards: [award.award], awardYears: [String(award.awardYear)] }));
  queries.push(filtered('an award in a year it was not given, so nothing', { awards: [award.award], awardYears: ['1066'] }));
  queries.push(filtered('an edition status', { qualities: qualities.slice(0, 1) }));
  queries.push(filtered('has an edition', { hasEdition: true }));
  queries.push(filtered('in two or more lists', { shared: true }));
  queries.push(filtered('from 1950', { yearMin: '1950' }));
  queries.push(filtered('up to 1900', { yearMax: '1900' }));
  queries.push(filtered('1900 to 1950', { yearMin: '1900', yearMax: '1950' }));
  queries.push(filtered('search and category', { query: 'a', categories: categories.slice(1, 2) }, { sort: 'author' }));
  queries.push(filtered('favourites view, searched', { query: 'a' }, { view: 'favorites' }));
  queries.push(filtered('owned view, a category', { categories: categories.slice(0, 1) }, { view: 'owned', sort: 'added' }));
  // Asking for purchased books by mark keeps them even while purchases are hidden (8 November 2026).
  queries.push(filtered('hidden purchases with the purchased filter, which keeps them', { states: ['alindi'] }, { hideOwned: true }));
  return queries;
}

/** What one implementation of the catalogue listing gives for every query, by query name. */
export function characterizeListing(listing, catalog) {
  const books = prepareBooks(catalog.books);
  const states = personalStates(books);
  const rankings = new ReadingRankingViewModel(new ReadingPriorityEngine(catalog), () => new Date(0)).build().byId;
  return Object.fromEntries(listingQueries(books).map(({ name, ...query }) => {
    const result = listing({ books, states, rankings, ...query });
    return [name, {
      shelf: result.shelf.length,
      ownedCount: result.ownedCount,
      filtered: result.filtered.map(book => book.id),
      pages: result.pages,
      currentPage: result.currentPage,
      displayed: result.displayed.map(book => book.id),
    }];
  }));
}

/** The reading-priority order, by book: the part the UI shows and sorts by. */
export function characterizeRanking(catalog) {
  const snapshot = new ReadingRankingViewModel(new ReadingPriorityEngine(catalog), () => new Date(0)).build();
  return { version: snapshot.version, ordered: snapshot.ordered.map(item => [item.bookId, item.audience, item.rank, item.ordinal, item.score, item.maturity]) };
}

/** Addresses a reader or a search engine can open: every view, filters, pages, legacy links, books. */
export function seoAddresses(catalog) {
  const [first, second] = [...catalog.books].sort((a, b) => (a.id < b.id ? -1 : 1));
  const group = catalog.groups.find(item => catalog.books.some(book => book.groupIds.includes(item.id)));
  return ['', '?sort=title&page=2', '?category=children', `?collection=${catalog.collections[0].id}`, `?group=${group.id}`,
    '?view=favorites', '?view=library', '?view=queue', '?view=collections', '?view=bookstores', '?view=fairs', '?view=notes',
    `?book=${encodeURIComponent(bookSlug(first))}`, `?book=${second.id}`, '?q=sava%C5%9F', '?status=important', '?page=999',
    '?page-size=48&page=2', '?page-size=50&page=3', '?sort=added', '?source=atlas&sort=author', '#overview', `#${catalog.collections[1].id}`,
    '?f=%7B%22query%22%3A%22a%22%7D', '?category=children&category=no-such-category&year-from=1950&year-to=x'];
}

/** What a page tells the browser and search engines (title, canonical, robots, structured data),
 * and the address it writes back, for every address above. */
export function characterizeSeo(listing, catalog) {
  const books = prepareBooks(catalog.books);
  const states = personalStates(books);
  const rankings = new ReadingRankingViewModel(new ReadingPriorityEngine(catalog), () => new Date(0)).build().byId;
  // The same addresses again with purchases hidden (on by default). What a page tells search
  // engines comes from the public list, so these match the addresses above (ADR 003, K12 item 3).
  const addresses = [...seoAddresses(catalog).map(address => [address, false]), ...['', '?sort=title&page=2', '?status=purchased', '?view=library'].map(address => [address, true])];
  return Object.fromEntries(addresses.map(([address, hideOwned]) => {
    const route = decodeRoute(address, catalog);
    const { currentPage, publicListing } = listing({ books, states, rankings, view: route.view, filters: route.filters, sort: route.sort, page: route.page, pageSize: route.pageSize, hideOwned });
    const seo = seoState({ route: { ...route, page: currentPage }, catalog, count: publicListing.total, currentPage, totalPages: publicListing.pages, displayed: publicListing.books });
    // As the page writes it: structured data reaches the browser as JSON, without undefined fields.
    return [`${address || '(home)'}${hideOwned ? ' (purchases hidden)' : ''}`, JSON.parse(JSON.stringify({ route, encoded: encodeRoute(route, catalog), seo }))];
  }));
}

/** The static pages the build writes for the frozen catalogue, as a digest per file. It pins the
 * static pages independently of the catalogue the owner keeps growing. */
export function characterizeStaticSeo() {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-static-')), 'dist');
  fs.mkdirSync(output);
  const script = new URL('../../scripts/generate-static-seo.mjs', import.meta.url).pathname;
  execFileSync(process.execPath, [script, output, new URL('../fixtures/characterization/catalog.json', import.meta.url).pathname], { stdio: 'pipe' });
  const files = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else files.push(full); } };
  walk(output);
  const digest = Object.fromEntries(files.map(file => [path.relative(output, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)]).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.rmSync(path.dirname(output), { recursive: true, force: true });
  return digest;
}
