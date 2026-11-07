import { booksForShelf, filterBooks, sortBooks } from './query.js';

// The catalogue as a page shows it (ADR 002, phase 3; in the data core since ADR 003): the shelf the view stands for, the
// filtered and sorted list, and the page cut out of it. A page past the end shows the last one,
// and an empty list still has one page. Pure, so tests/app-logic.test.js and the characterization tests check it in Node.
// hideOwned ("Satın aldıklarımı gösterme", on by default) takes purchased books out of the
// catalogue while the reader browses; the owned shelf, and a filter by reading mark, keep them.
export function catalogListing({ books, states, view, filters, sort, page, pageSize, rankings, hideOwned = false }) {
 const all = booksForShelf(books, states, view === 'owned' ? 'owned' : view === 'favorites' ? 'favorites' : 'catalog');
 // A filter by reading mark asks for those books by name, so purchases stay in it.
 const shelf = hideOwned && view === 'books' && !filters.states?.length ? all.filter(book => !(states[book.id] || []).includes('alindi')) : all;
 const ownedCount = booksForShelf(books, states, 'owned').length;
 // The header's counters: every favourite and every purchase, whatever the view hides.
 const favoriteCount = booksForShelf(books, states, 'favorites').length;
 const filtered = sortBooks(filterBooks(shelf, filters, states), sort, states, rankings);
 const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
 const currentPage = Math.min(page, pages);
 const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
 return { shelf, ownedCount, favoriteCount, filtered, pages, currentPage, displayed };
}
