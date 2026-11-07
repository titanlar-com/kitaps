import { derived, type ReadableStore, type Unsubscribe, type ViewModel } from './store.ts';
import { openCatalog } from './catalog/contract.ts';
import { indexCatalog, type Catalog } from './catalog/catalog.ts';
import { createCatalogListingViewModel, type CatalogListingSnapshot, type ListingQuery, type Marks, type ShelfView, type SortId } from './catalog/listingViewModel.ts';
import { createNavigator, type LocationPort, type NavigationCommands, type NavigationSnapshot, type RouteCodec } from './navigation/navigator.ts';
import { createSettings, type KeyValueStore, type SettingsSnapshot } from './settings/settings.ts';

/** What the composition root hands to any UI (ADR 003, K2): the feature view models. */
export interface Kitaplik {
  readonly catalog: Catalog;
  readonly navigation: ViewModel<NavigationSnapshot, NavigationCommands>;
  readonly settings: ViewModel<SettingsSnapshot, { setHideOwned(on: boolean): void }>;
  readonly listing: ViewModel<CatalogListingSnapshot, Record<string, never>>;
  dispose(): void;
}

export interface KitaplikPorts {
  /** The catalogue document as the build wrote it; opened through its gate. */
  catalog: unknown;
  location: LocationPort;
  codec: RouteCodec;
  storage: KeyValueStore;
  /** The reader's marks. Until the personal library owns them (ADR 003, phase 7a), the UI does. */
  marks: ReadableStore<Marks>;
  now?: () => Date;
}

const sameQuery = (a: ListingQuery, b: ListingQuery): boolean => a.view === b.view && a.sort === b.sort && a.page === b.page
  && a.pageSize === b.pageSize && a.hideOwned === b.hideOwned && JSON.stringify(a.filters) === JSON.stringify(b.filters);

/** The Facade that puts the core together. The browser and tests pass their own ports. */
export function createKitaplik(ports: KitaplikPorts): Kitaplik {
  const catalog = indexCatalog(openCatalog(ports.catalog), { now: ports.now });
  const navigation = createNavigator({ location: ports.location, codec: ports.codec });
  const settings = createSettings(ports.storage);
  // Opening a book changes the route but not the listing's query, so the listing keeps its snapshot.
  const query = derived([navigation, settings], (nav, setting): ListingQuery => ({
    view: nav.route.view as ShelfView, filters: nav.route.filters, sort: nav.route.sort as SortId,
    page: nav.route.page, pageSize: nav.route.pageSize, hideOwned: setting.hideOwned,
  }), sameQuery);
  const listing = createCatalogListingViewModel({ catalog, query, marks: ports.marks });
  // A page past the end shows the last page, and the address says so (App.jsx today).
  const correct = (): void => {
    const page = listing.getSnapshot().page;
    if (navigation.getSnapshot().route.page !== page) navigation.commands.correctPage(page);
  };
  const stops: Unsubscribe[] = [listing.subscribe(correct)];
  correct();
  return {
    catalog, navigation, settings, listing,
    dispose() { for (const stop of stops) stop(); listing.dispose(); navigation.dispose(); settings.dispose(); },
  };
}
