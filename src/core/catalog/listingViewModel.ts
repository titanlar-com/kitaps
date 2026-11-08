import { derived, type ReadableStore, type ViewModel } from '../store.ts';
import type { Catalog, IndexedBook } from './catalog.ts';
import { catalogListing } from './listing.js';

export type ShelfView = 'books' | 'favorites' | 'owned';
export type SortId = 'reading' | 'title' | 'author' | 'shared' | 'newest' | 'added' | 'saved';
/** The reader's marks by book id ("onemli", "alindi", …). */
export type Marks = Readonly<Record<string, readonly string[]>>;

export interface ListingQuery {
  view: ShelfView;
  filters: Record<string, unknown>;
  sort: SortId;
  page: number;
  pageSize: number;
  hideOwned: boolean;
}

/**
 * The catalogue listing as facts (ADR 003, K6): which books, how many, which page. A design
 * words and lays them out as it likes, so this snapshot has no copy and no layout.
 */
export interface CatalogListingSnapshot {
  readonly query: ListingQuery;
  /** The books of the page, in order. */
  readonly bookIds: readonly string[];
  /** The same books, as the catalogue's own records. */
  readonly books: readonly IndexedBook[];
  /** The whole shelf before filters; a design's filter sheet offers its values. */
  readonly shelf: readonly IndexedBook[];
  /** Books after filters (all pages). */
  readonly total: number;
  /** Books on the shelf before filters. */
  readonly shelfTotal: number;
  readonly ownedCount: number;
  readonly favoriteCount: number;
  /** Purchases are hidden, yet some are listed because the reader filtered by a reading mark. */
  readonly showsHiddenPurchases: boolean;
  /** The page shown: a page past the end shows the last one. */
  readonly page: number;
  readonly pages: number;
  /** The positions of the page's first and last book, or null when nothing matched. */
  readonly range: { start: number; end: number } | null;
  /** Why the list is empty, when it is: an empty owned shelf, no favourites yet, or no match. */
  readonly empty: null | 'owned-empty' | 'favorites-empty' | 'no-match';
}

export function createCatalogListingViewModel({ catalog, query, marks }: { catalog: Catalog; query: ReadableStore<ListingQuery>; marks: ReadableStore<Marks> }): ViewModel<CatalogListingSnapshot, Record<string, never>> {
  const snapshot = derived([query, marks], (current, states) => {
    const result = catalogListing({ books: catalog.books, states, rankings: catalog.ranking.byId, ...current });
    const total = result.filtered.length;
    const empty = current.view === 'owned' && !result.ownedCount ? 'owned-empty'
      : current.view === 'favorites' && !result.shelf.length ? 'favorites-empty'
        : total ? null : 'no-match';
    return {
      query: current,
      bookIds: result.displayed.map((book: { id: string }) => book.id),
      books: result.displayed,
      shelf: result.shelf,
      total,
      shelfTotal: result.shelf.length,
      ownedCount: result.ownedCount,
      favoriteCount: result.favoriteCount,
      showsHiddenPurchases: result.showsHiddenPurchases,
      page: result.currentPage,
      pages: result.pages,
      range: total ? { start: (result.currentPage - 1) * current.pageSize + 1, end: Math.min(result.currentPage * current.pageSize, total) } : null,
      empty,
    } satisfies CatalogListingSnapshot;
  });
  return { getSnapshot: snapshot.getSnapshot, subscribe: snapshot.subscribe, commands: {}, dispose: () => undefined };
}
