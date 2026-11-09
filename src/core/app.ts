import { derived, type Unsubscribe, type ViewModel } from './store.ts';
import type { Catalog } from './catalog/catalog.ts';
import { createCatalogListingViewModel, type CatalogListingSnapshot, type ListingQuery, type ShelfView, type SortId } from './catalog/listingViewModel.ts';
import { createNavigator, type LocationPort, type NavigationCommands, type NavigationSnapshot, type RouteCodec } from './navigation/navigator.ts';
import { createPersonalLibrary, type PersonalLibrary } from './personal/library.ts';
import { createSettings, type KeyValueStore, type SettingsSnapshot } from './settings/settings.ts';
import { createExecute, type Execute } from './commands.ts';

/** What the composition root hands to any UI (ADR 003, K2): the feature view models. */
export interface Kitaplik {
  readonly catalog: Catalog;
  readonly navigation: ViewModel<NavigationSnapshot, NavigationCommands>;
  readonly settings: ViewModel<SettingsSnapshot, { setHideOwned(on: boolean): void }>;
  readonly listing: ViewModel<CatalogListingSnapshot, Record<string, never>>;
  /** The one owner of the reader's marks, reading records and queue. */
  readonly personal: PersonalLibrary;
  /** The one door a screen uses to ask the core for anything (K7). */
  readonly execute: Execute;
  dispose(): void;
}

export interface KitaplikPorts {
  /** The catalogue after its gate and its one-time index. */
  catalog: Catalog;
  location: LocationPort;
  codec: RouteCodec;
  storage: KeyValueStore;
  now?: () => Date;
}

const sameQuery = (a: ListingQuery, b: ListingQuery): boolean => a.view === b.view && a.sort === b.sort && a.page === b.page
  && a.pageSize === b.pageSize && a.hideOwned === b.hideOwned && JSON.stringify(a.filters) === JSON.stringify(b.filters);

/** The Facade that puts the core together. The browser and tests pass their own ports. */
export function createKitaplik(ports: KitaplikPorts): Kitaplik {
  const { catalog, now = () => new Date() } = ports;
  const navigation = createNavigator({ location: ports.location, codec: ports.codec });
  const settings = createSettings(ports.storage);
  // Opening a book changes the route but not the listing's query, so the listing keeps its snapshot.
  const query = derived([navigation, settings], (nav, setting): ListingQuery => ({
    view: nav.route.view as ShelfView, filters: nav.route.filters, sort: nav.route.sort as SortId,
    page: nav.route.page, pageSize: nav.route.pageSize, hideOwned: setting.hideOwned,
  }), sameQuery);
  const personal = createPersonalLibrary({ storage: ports.storage, books: catalog.books, now });
  const marks = derived([personal], data => data.states);
  const listing = createCatalogListingViewModel({ catalog, query, marks });
  // A page past the end shows the last page, and the address says so (App.jsx today).
  const correct = (): void => {
    const page = listing.getSnapshot().page;
    if (navigation.getSnapshot().route.page !== page) navigation.commands.correctPage(page);
  };
  const stops: Unsubscribe[] = [listing.subscribe(correct)];
  correct();
  return {
    catalog, navigation, settings, listing, personal,
    execute: createExecute({ navigation: navigation.commands, personal: personal.commands, settings: settings.commands }),
    dispose() { for (const stop of stops) stop(); listing.dispose(); navigation.dispose(); settings.dispose(); personal.dispose(); },
  };
}
