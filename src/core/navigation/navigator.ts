import { createStore, type Unsubscribe, type ViewModel } from '../store.ts';
import { emptyFilters } from '../catalog/query.js';
import { viewById } from '../../views.js';

/** Where the app is: the address as a value (src/library.js decodes and encodes it). */
export interface Route {
  view: string;
  filters: Record<string, unknown>;
  sort: string;
  book: string | null;
  page: number;
  pageSize: number;
}

/** The address bar and the history, as the browser adapter or a test gives them. */
export interface LocationPort {
  /** The address as the codec reads it: the hash when there is one, otherwise the query. */
  current(): string;
  /** The page's path, which every written address starts with. */
  path(): string;
  push(url: string): void;
  replace(url: string): void;
  back(): void;
  /** The back and forward buttons, and a changed hash. */
  onChange(listener: () => void): Unsubscribe;
}

/** How an address becomes a route and back. A Strategy: the core does not know the format. */
export interface RouteCodec {
  decode(location: string): Route;
  encode(route: Route): string;
}

export interface NavigationSnapshot {
  readonly route: Route;
}

/**
 * Steps a design composes. How a book sheet stacks (a trail of books, "closing goes back when
 * the book was opened from the catalogue") is the design's policy, not the core's (ADR 003, K6).
 */
export interface NavigationCommands {
  /** Opens a book as a new history entry. */
  openBook(id: string): void;
  /** Shows another book in the same history entry. */
  showBook(id: string): void;
  /** Closes the book in place. */
  closeBook(): void;
  /** The previous history entry; the route follows when the browser reports the change. */
  back(): void;
  goView(view: string): void;
  goHome(): void;
  openCollection(id: string, groupId?: string): void;
  openCategory(id: string): void;
  changeFilters(filters: Record<string, unknown>): void;
  changeSort(sort: string): void;
  changePage(page: number): void;
  changePageSize(pageSize: number): void;
  /** The listing found the page past the end: show the last page, without a history entry. */
  correctPage(page: number): void;
}

/**
 * The controller of MVC (ADR 003, K9): it turns the address bar and the history into a route
 * and back, as App.jsx does today. Every change is written back to the address in today's
 * form, so a legacy address is corrected in place. A new page, a view, a shelf, a collection
 * or an opened book is a history entry; sort, filters and corrections are not.
 */
export function createNavigator({ location, codec }: { location: LocationPort; codec: RouteCodec }): ViewModel<NavigationSnapshot, NavigationCommands> {
  const urlFor = (route: Route): string => {
    const encoded = codec.encode(route);
    return location.path() + (encoded ? `?${encoded}` : '');
  };
  const state = createStore<NavigationSnapshot>({ route: codec.decode(location.current()) });
  location.replace(urlFor(state.getSnapshot().route));

  const route = (): Route => state.getSnapshot().route;
  const commit = (next: Route, { push = false }: { push?: boolean } = {}): void => {
    if (push) location.push(urlFor(next));
    if (!push && JSON.stringify(route()) === JSON.stringify(next)) return;
    state.set({ route: next });
    location.replace(urlFor(next));
  };
  const navigate = (next: Route): void => commit(next, { push: true });

  const stop = location.onChange(() => commit(codec.decode(location.current())));

  const commands: NavigationCommands = {
    openBook(id) { navigate({ ...route(), book: id }); },
    showBook(id) { commit({ ...route(), book: id }); },
    closeBook() { commit({ ...route(), book: null }); },
    back() { location.back(); },
    goView(view) {
      navigate({ ...route(), view, book: null, page: 1, ...(viewById[view]?.shelf ? { filters: emptyFilters() } : {}) });
    },
    goHome() {
      location.push(location.path());
      commit(codec.decode(''));
    },
    openCollection(id, groupId) {
      navigate({ ...route(), view: 'books', book: null, page: 1, filters: { ...emptyFilters(), collections: [id], groups: groupId ? [groupId] : [] } });
    },
    openCategory(id) {
      navigate({ ...route(), view: 'books', book: null, page: 1, filters: { ...emptyFilters(), categories: [id] } });
    },
    changeFilters(filters) { commit({ ...route(), filters, page: 1 }); },
    changeSort(sort) { commit({ ...route(), sort: sort || 'reading', page: 1 }); },
    changePage(page) { navigate({ ...route(), page, book: null }); },
    changePageSize(pageSize) { navigate({ ...route(), page: 1, pageSize, book: null }); },
    correctPage(page) { if (route().page !== page) commit({ ...route(), page }); },
  };

  return { getSnapshot: state.getSnapshot, subscribe: state.subscribe, commands, dispose: stop };
}
