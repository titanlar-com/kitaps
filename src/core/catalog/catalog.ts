import type { OpenedCatalog } from './contract.ts';
import type { BookRecord, CatalogDocument, CategoryRecord, CollectionRecord, GroupRecord } from './schema.ts';
import { prepareBooks } from './query.js';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../../ranking/ReadingPriorityEngine.ts';
import type { ReadingRankingSnapshot } from '../../ranking/types.ts';

/** A catalogue book with the search text the queries match against. */
export type IndexedBook = BookRecord & { searchText: string };

/**
 * The catalogue after its one-time index (ADR 003, K2 and K3): the books, maps, author list and
 * reading ranking every screen reads through src/ui/react/app/catalogData.js. The ranking depends on the catalogue only, never on personal state.
 */
export interface Catalog {
  readonly document: CatalogDocument;
  readonly books: readonly IndexedBook[];
  readonly byId: Readonly<Record<string, IndexedBook>>;
  readonly collectionById: Readonly<Record<string, CollectionRecord>>;
  readonly groupById: Readonly<Record<string, GroupRecord>>;
  readonly categoryById: Readonly<Record<string, CategoryRecord>>;
  /** Author credits as written, in Turkish order. Not author entities (ADR 003, K3). */
  readonly authors: readonly string[];
  readonly ranking: ReadingRankingSnapshot;
}

export function indexCatalog(opened: OpenedCatalog, { now = () => new Date() }: { now?: () => Date } = {}): Catalog {
  const source = opened.document;
  const books = prepareBooks(source.books) as IndexedBook[];
  return {
    document: source,
    books,
    byId: Object.fromEntries(books.map(book => [book.id, book])),
    collectionById: Object.fromEntries(source.collections.map(item => [item.id, item])),
    groupById: Object.fromEntries(source.groups.map(item => [item.id, item])),
    categoryById: Object.fromEntries(source.categories.map(item => [item.id, item])),
    authors: [...new Set(books.map(book => book.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    ranking: new ReadingRankingViewModel(new ReadingPriorityEngine(source as never), now).build(),
  };
}
