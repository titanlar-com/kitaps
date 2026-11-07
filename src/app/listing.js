import { booksForShelf, filterBooks, sortBooks } from '../library.js';

// The catalogue as a page shows it (ADR 002, phase 3): the shelf the view stands for, the
// filtered and sorted list, and the page cut out of it. A page past the end shows the last one,
// and an empty list still has one page. Pure, so tests/app-logic.test.js checks it in Node.
// hideOwned ("Satın aldıklarımı gösterme", on by default) takes purchased books out of the
// catalogue; the owned shelf, which exists to show them, ignores it.
export function catalogListing({ books, states, view, filters, sort, page, pageSize, rankings, hideOwned = false }) {
 const all = booksForShelf(books, states, view === 'owned' ? 'owned' : view === 'favorites' ? 'favorites' : 'catalog');
 const shelf = hideOwned && view === 'books' ? all.filter(book => !(states[book.id] || []).includes('alindi')) : all;
 const ownedCount = booksForShelf(books, states, 'owned').length;
 const filtered = sortBooks(filterBooks(shelf, filters, states), sort, states, rankings);
 const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
 const currentPage = Math.min(page, pages);
 const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
 return { shelf, ownedCount, filtered, pages, currentPage, displayed };
}
