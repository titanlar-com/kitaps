import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE_BOOKS, paletteScreen } from '../src/screens/palette.js';

// The quick search (Ctrl K or Cmd K): sections and books under one field. A plain function, like every screen model.
const books = [
  { id: 'dune', title: 'Dune', titleTr: 'Dune', author: 'Frank Herbert', searchText: 'dune frank herbert' },
  { id: 'ilyada', title: 'İlyada', author: 'Homeros', searchText: 'iliad ilyada homeros' },
  ...Array.from({ length: 20 }, (_, index) => ({ id: `tarih-${index}`, title: `Tarih ${index}`, titleTr: `Tarih ${index}`, author: 'Yazar', searchText: `tarih ${index} yazar` })),
];
const views = [{ id: 'books', label: 'Kitaplar' }, { id: 'queue', label: 'Sıram' }, { id: 'notes', label: 'Notlar' }];
const screen = query => paletteScreen({ query, books, views });

test('with nothing typed it offers every section and no book', () => {
  const model = screen('');
  assert.deepEqual(model.pages, [{ id: 'books', label: 'Kitaplar' }, { id: 'queue', label: 'Sıram' }, { id: 'notes', label: 'Notlar' }]);
  assert.deepEqual(model.books, []);
});

test('it finds a book by any word, Turkish letters or not', () => {
  assert.deepEqual(screen('homeros').books.map(book => book.id), ['ilyada']);
  assert.deepEqual(screen('HOMEROS İLYADA').books.map(book => book.id), ['ilyada']);
});

test('it shows the title a reader knows and the author', () => {
  assert.deepEqual(screen('homeros').books[0], { id: 'ilyada', title: 'İlyada', author: 'Homeros' });
});

test('it finds a section by name', () => {
  assert.deepEqual(screen('sira').pages, [{ id: 'queue', label: 'Sıram' }]);
});

test('it keeps the list short enough to read', () => {
  assert.equal(screen('tarih').books.length, PALETTE_BOOKS);
});

test('it says when nothing matched, and names its parts', () => {
  const model = screen('zzz');
  assert.deepEqual([model.pages, model.books], [[], []]);
  assert.deepEqual({ search: model.search, empty: model.empty, pagesTitle: model.pagesTitle, booksTitle: model.booksTitle }, { search: 'Kitap ya da bölüm ara', empty: 'Eşleşen kitap ya da bölüm yok.', pagesTitle: 'Bölümler', booksTitle: 'Kitaplar' });
});
