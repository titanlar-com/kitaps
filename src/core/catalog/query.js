import { displayTitle } from './translation.js';

// The catalogue's query rules (ADR 003, phase 3), moved verbatim from src/library.js, which
// re-exports them. Pure and framework-free: the browser, Node scripts and any UI use the same.
export const emptyFilters = () => ({ query: '', categories: [], collections: [], groups: [], states: [], authors: [], origins: [], awards: [], awardYears: [], qualities: [], addedDates: [], categoryMode: 'any', collectionMode: 'any', hasEdition: false, shared: false, yearMin: '', yearMax: '' });
export const normalize = value => String(value ?? '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
export function prepareBooks(books) {
 return books.map(book => ({ ...book, searchText: normalize([book.title, book.titleTr, book.cover?.title, book.cover?.publisher, book.cover?.isbn, book.author, ...book.aliases, ...(book.verifiedEdition?.translators||[]), book.verifiedEdition?.publisher, book.verifiedEdition?.isbn, ...book.editions.flatMap(e => [e.translator,e.publisher,e.turkish,e.original]), ...book.notes.map(n=>n.text)].join(' ')) }));
}
const matchesValues = (actual, selected, mode = 'any') => !selected.length || (mode === 'all' ? selected.every(x => actual.includes(x)) : selected.some(x => actual.includes(x)));
export function filterBooks(books, filters, states = {}) {
 const f = { ...emptyFilters(), ...filters };
 const tokens = normalize(f.query).trim().split(/\s+/).filter(Boolean);
 return books.filter(b => {
  if (!tokens.every(t => b.searchText.includes(t))) return false;
  if (!matchesValues(b.categories, f.categories, f.categoryMode)) return false;
  if (!matchesValues(b.collectionIds, f.collections, f.collectionMode)) return false;
  if (!matchesValues(b.groupIds, f.groups)) return false;
  if (!matchesValues(states[b.id] || [], f.states)) return false;
  if (!matchesValues([b.author], f.authors)) return false;
  if (!matchesValues(b.origins, f.origins)) return false;
  if (!matchesValues([b.addedAt], f.addedDates)) return false;
  if (!matchesValues(b.editions.flatMap(e => e.status || []), f.qualities)) return false;
  if (f.hasEdition && !b.verifiedEdition && !b.editions.some(e => e.translator || e.publisher)) return false;
  if (f.shared && b.collectionIds.length < 2) return false;
  if ((f.yearMin !== '' || f.yearMax !== '') && !b.years.some(y => (f.yearMin === '' || y >= Number(f.yearMin)) && (f.yearMax === '' || y <= Number(f.yearMax)))) return false;
  // The award and its year must match the SAME membership, not two unrelated records.
  if ((f.awards.length || f.awardYears.length) && !b.memberships.some(m => m.collectionId === 'ft' && matchesValues([m.award],f.awards) && matchesValues([String(m.awardYear)],f.awardYears))) return false;
  return true;
 });
}
export function sortBooks(books, sort, states = {}, rankings = {}) {
 const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
 const title = b => displayTitle(b);
 return [...books].sort((a,b) => {
  // Books that share a title read by author, on the running page and on the static pages alike.
  const tie = () => collator.compare(title(a),title(b)) || collator.compare(a.author,b.author);
  // General books come before children's books, which are ranked among
  // themselves. Books with an equal priority share a rank and read
  // alphabetically by the title the reader sees, never by internal identifiers.
  const audience = id => rankings[id]?.audience === 'children' ? 1 : 0;
  const byReading = () => audience(a.id)-audience(b.id)||(rankings[a.id]?.rank??Number.MAX_SAFE_INTEGER)-(rankings[b.id]?.rank??Number.MAX_SAFE_INTEGER)||tie();
  if (sort === 'reading') return byReading();
  // Latest additions first; books added on the same day keep their reading order.
  if (sort === 'added') return (b.addedAt||'').localeCompare(a.addedAt||'') || byReading();
  if (sort === 'shared') return b.collectionIds.length - a.collectionIds.length || tie();
  if (sort === 'author') return collator.compare(a.author,b.author) || tie();
  if (sort === 'newest') return Math.max(0,...b.years) - Math.max(0,...a.years) || tie();
  if (sort === 'saved') return Number((states[b.id]||[]).includes('onemli')) - Number((states[a.id]||[]).includes('onemli')) || tie();
  return tie();
 });
}
export function booksForShelf(books,states,shelf='catalog') {
 return books.filter(book=>shelf==='owned'?(states[book.id]||[]).includes('alindi'):shelf==='favorites'?(states[book.id]||[]).includes('onemli'):true);
}
