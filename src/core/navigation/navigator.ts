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
  /** The books opened before the current one from a book page, to step back along. */
  readonly bookTrail: readonly string[];
}

export interface NavigationCommands {
  openBook(id: string): void;
  closeBook(): void;
  previousBook(): void;
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
 * or a book opened from the catalogue is a history entry; sort, filters and corrections are not.
 */
export function createNavigator({ location, codec }: { location: LocationPort; codec: RouteCodec }): ViewModel<NavigationSnapshot, NavigationCommands> {
  const urlFor = (route: Route): string => {
    const encoded = codec.encode(route);
    return location.path() + (encoded ? `?${encoded}` : '');
  };
  const state = createStore<NavigationSnapshot>({ route: codec.decode(location.current()), bookTrail: [] });
  /** A book opened from the catalogue: closing it goes back in the history instead. */
  let openedFromCatalog = false;
  location.replace(urlFor(state.getSnapshot().route));

  const commit = (route: Route, { push = false, bookTrail = state.getSnapshot().bookTrail }: { push?: boolean; bookTrail?: readonly string[] } = {}): void => {
    const current = state.getSnapshot();
    if (push) location.push(urlFor(route));
    if (current.route === route && current.bookTrail === bookTrail) return;
    if (!push && JSON.stringify(current.route) === JSON.stringify(route) && current.bookTrail === bookTrail) return;
    state.set({ route, bookTrail });
    location.replace(urlFor(route));
  };
  const route = (): Route => state.getSnapshot().route;
  const navigate = (next: Route, bookTrail?: readonly string[]): void => commit(next, { push: true, bookTrail });

  const stop = location.onChange(() => {
    openedFromCatalog = false;
    commit(codec.decode(location.current()), { bookTrail: [] });
  });

  const commands: NavigationCommands = {
    openBook(id) {
      const current = route();
      if (!current.book) {
        openedFromCatalog = true;
        navigate({ ...current, book: id }, []);
      } else commit({ ...current, book: id }, { bookTrail: [...state.getSnapshot().bookTrail, current.book] });
    },
    closeBook() {
      if (openedFromCatalog) {
        openedFromCatalog = false;
        location.back();
      } else commit({ ...route(), book: null });
    },
    previousBook() {
      const trail = state.getSnapshot().bookTrail;
      const id = trail.at(-1);
      if (id) commit({ ...route(), book: id }, { bookTrail: trail.slice(0, -1) });
    },
    goView(view) {
      navigate({ ...route(), view, book: null, page: 1, ...(viewById[view]?.shelf ? { filters: emptyFilters() } : {}) });
    },
    goHome() {
      location.push(location.path());
      openedFromCatalog = false;
      commit(codec.decode(''), { bookTrail: [] });
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
