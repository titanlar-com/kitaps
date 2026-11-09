import { normalize } from '../core/catalog/query.js';
import { displayTitle } from '../core/catalog/translation.js';

// The quick search: the sections and the books under one field (ADR 003, K6). A plain function of
// what was typed, so another interface can use it without Mantine.

/** How many books the list shows; a longer list is what the catalogue is for. */
export const PALETTE_BOOKS = 8;

export function paletteScreen({ query, books, views }) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = text => tokens.every(token => text.includes(token));
  return {
    search: 'Kitap ya da bölüm ara',
    empty: 'Eşleşen kitap ya da bölüm yok.',
    pagesTitle: 'Bölümler',
    booksTitle: 'Kitaplar',
    pages: views.filter(view => matches(normalize(view.label))).map(({ id, label }) => ({ id, label })),
    books: tokens.length ? books.filter(book => matches(book.searchText)).slice(0, PALETTE_BOOKS).map(book => ({ id: book.id, title: displayTitle(book), author: book.author })) : [],
  };
}
