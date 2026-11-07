# Data architecture analysis: Claude

- Analyst: a read-only Claude Plan agent.
- Code read: `main` at 625d1bc, 8 November 2026.
- Brief: the same brief as the Codex analysis (`2026-11-08-data-architecture-codex.md`). The two reports were written independently and are synthesised in `docs/ADR-003-data-architecture.md`.
- The report below is unchanged. It is in English because the brief was.

---

Working copy: `.claude/worktrees/data-arch` (branch `data-architecture`, same as `origin/main` at `625d1bc`). I only read files. I ran no tests and changed nothing. All paths below are relative to that worktree.

---

## 1. Current data flow map

### 1.1 Build time

| Source | Transform | Output | Owner / mutator |
|---|---|---|---|
| `data/sources/*.json`, `data/*.json` (27 files), `data/kitaplar.md` | `scripts/merge-data.py` (plus `translation_availability.py`, `bibliographic_facts.py`, `days.py`) | `src/catalog.json`, 2.9 MB, 1019 books, 36 collections, 198 groups, 21 categories | Owned by the Python build. Only `npm run data` changes it. Research scripts (`fetch-*.py`, `upgrade-covers.py`, `infer-added-dates.py`) change the `data/*.json` inputs. |
| `src/catalog.json` | `scripts/generate-sitemap.mjs` (imports `library.js`, `site.js`) | `public/sitemap.xml` (tracked in Git) | `npm run seo`, which runs before every build |
| `src/catalog.json` | `scripts/generate-static-seo.mjs` (imports `library`, `translation`, `recommendations`→`ranking/readingGraph`, `authors`, `workFormat`, `site`) | `dist/catalog/**` | `npm run build` |
| `src/catalog.json` | `vite.config.js:36` fills in `__BOOK_COUNT__`. `:14` puts the catalogue in its own chunk. | `dist/` | Vite |
| catalogue + covers | `scripts/export-standalone.mjs:11` writes `globalThis.__KITAP_COVERS__`. `:14` writes `kitaplik-tum-veri.json`. | standalone HTML | `npm run export` |
| remote `state.json`, `routes.json` | `scripts/check-state-repo.mjs` → `src/state/health.ts` | CI annotation | read-only |

### 1.2 Load time

- **Catalogue.** Five modules import it statically: `App.jsx:6`, `app/catalogData.js:2`, `app/Collections.jsx:5`, `app/BookDetail.jsx:5` and `components/NotesPage.jsx:6`. When `catalogData.js` is imported it builds a set of module-level singletons:
  - `prepareBooks` adds `searchText` (`:8`);
  - `byId`, the collection, group and category maps, and `authorOptions` (`:12-18`);
  - the full ranking, through `ReadingRankingViewModel(...).build()` (`:11`).
- **Lazy pages** (`App.jsx:38-43`). React.lazy loads the data together with the component:
  - `NotesPage` brings `kitaplar.md?raw` (`NotesPage.jsx:7`), and the raw archives on demand (`:21-31`);
  - `BookstoresPage` imports `data/bookstores.json` (`BookstoresPage.jsx:4`);
  - `BookFairsPage` imports `data/book-fairs.json` (`BookFairsPage.jsx:4`).
- **Local storage read at startup.** 17 keys are spread over 6 files:
  - personal data: `kitapatlasi:states:v2` and legacy `kitaps:states:v1` (`catalogData.js:16,20`), `kitapatlasi:personal:v1` (`reading.js:1`);
  - settings: `kitaplik:hide-owned:v1` (`App.jsx:44`), `kitapatlasi:color-scheme` (`App.jsx:194`), and the session key `kitapatlasi:sync-notice:dismissed:v1` (`SyncNotice.jsx:6`);
  - sync: 10 `github-state:*` keys (`state/types.ts:8-24`);
  - routes: 2 `routes:*` keys (`state/routeRegistry.ts:9-11`).

### 1.3 Runtime

| Data | Owner | Mutators |
|---|---|---|
| Route (view, filters, sort, book, page, pageSize) | `App.jsx:52` `useState(decodeRoute(...))` | `navigate` (`:94`), about 12 handlers (`:95-123`), popstate and hashchange (`:99`), page clamping (`:103`), `replaceState` effect (`:98`) |
| Listing (shelf → filter → sort → page) | `app/listing.js:8-17`, called inside `useMemo` (`App.jsx:102`) | derived only |
| Draft count, chips, results heading | `App.jsx:105`, `ActiveFilters.jsx:8-15`, `results.js:8-16` | derived only |
| Ranking | built once in `catalogData.js:11`, read by `sortBooks` (`library.js:50-52`) and the badges | none |
| Marks (`states`) and personal data (`queue`, `reading`) | `App.jsx:54,56` `useState`, saved to storage by effects (`:96-97`) | `onToggle`/`onReading`/`onAdd` (`:107-115`), queue callbacks (`:163`), toast undo (`:137`), NotesPage import through raw setters (`:167`, `NotesPage.jsx:45-46`), sync `applyDocument` (`useGitHubStateSync.js:86-106`) |
| Shared state (`state.json`) | `useGitHubStateSync.js:44-414` owns `GitHubStateRepository` and `GitHubStateBatcher` | a diff effect (`:377-409`) turns React state changes into pending mutations; reads come in through `applyDocument` |
| Routes (`routes.json`) | `routes/useRouteRegistry.js:17-66` → `GitHubRouteRegistry` | `RoutePlanner.jsx` save and remove. It shares the token key with state sync (`routeRegistry.ts:2`). |
| Settings | `App.jsx:64-65` (hide-owned), Mantine (colour scheme), `SyncNotice.jsx:7-8` | the components themselves |
| Document head | `applySeo(seoState(...))` effect (`App.jsx:104`) | derived only |
| Exports | catalogue export (`catalogData.js:21`), personal backup v3 (`NotesPage.jsx:74`), full data (`NotesPage.jsx:21-31`), `.ics` file (`BookFairsPage.jsx:24`) | — |

**In summary:** the reference data has one owner, the Python build. The personal data has none. React state in `App.jsx` is the working copy. Two hooks infer what changed, and nine places write to it.

---

## 2. Gap analysis

**G1. Personal data and sync are owned by React.**
- `states` and `personal` are `useState` in `App.jsx:54-57`.
- The sync controller is a 414-line hook (`useGitHubStateSync.js`). It finds edits by diffing React state inside a `useEffect` (`:377-409`), and it writes remote reads back through `setStates`/`setPersonal` (`:86-106`).
- Its user-facing sentences are built inside the hook (`:35-37`, `:177`).
- The route registry is also only reachable through a hook (`useRouteRegistry.js:17`).

**G2. Business rules and derived data live in components.**
- Marking a book writes its reading date inside a handler (`App.jsx:107-113`).
- Which empty state appears, and its copy, is decided in JSX (`App.jsx:156-160`).
- The card decides which reading badges to show and which publisher line to use (`BookCard.jsx:15-22`).
- Collection counts are computed on every render (`Collections.jsx:11-13`).
- Filter options and added-day counts are built in the sheet (`FilterSheet.jsx:58-73`).
- FT awards and the years 2005–2026 are hard-coded (`FilterSheet.jsx:136-137`).
- Related books and their headings are worked out in the view (`BookDiscovery.jsx:20-29`).
- Collection memberships are grouped in JSX (`BookDetail.jsx:47`).
- Backup import validates in the view (`NotesPage.jsx:37-50`).
- The note tables are parsed from React elements (`NoteCards.jsx:12-21`).
- The sync notice and status rules are pure functions, but they sit in JSX files (`SyncNotice.jsx:14-18`, `SyncStatusLine.jsx:12-19`).

**G3. Schemas are implicit or duplicated.**
- **The catalogue has no schema and no version.** `merge-data.py:517` writes nine top-level keys and no `schemaVersion`. There are three partial shapes of it: the Python dict built in `merge-data.py:75`, the reduced `Catalog` type in `ranking/types.ts:8-37`, and untyped JS everywhere else.
- **The reading record has two shapes.**
  - Locally, cleaned values use `''` for page numbers (`reading.js:2,7`).
  - Remotely, the record is sparse and numeric (`state/types.ts:34-41`).
  - `readingPayload` converts local to remote (`useGitHubStateSync.js:7-13`). Remote values are stored back unconverted (`:102`), and `ReadingPanel.jsx:14` only normalises them at render time.
- **The mark vocabulary is defined four times:** `state/types.ts:29`, `merge.ts:21`, `library.js:4` and `library.js:87`. The rule that some marks exclude each other appears twice: `library.js:62-73` and `types.ts:32`.
- **Sort ids are listed twice:** `App.jsx:153` and `library.js:137`.
- **`catalog.updated` is a Turkish display string** ("22 Ekim 2026", `merge-data.py:516`). The JSON export still publishes it as `catalogUpdatedAt` (`catalogExport.js:32`).
- **Three file formats have no documented contract:** personal backup `version:3` (`NotesPage.jsx:74`), pre-sync backup `version:1` (`useGitHubStateSync.js:118`), and the full-data export, which is built twice (`NotesPage.jsx:21-31`, `export-standalone.mjs:14`).
- **One field means something other than its label.** `merge-data.py:443` sets `collection.count` to the merged book count, and `originalCount` (`:101`) is the number of source records. `Collections.jsx:18` labels `c.count` "kaynak kaydı" (source records), so the line always shows the same number twice.

**G4. The same derivation is written several times, and some copies disagree.**
- The result range is computed three times: `App.jsx:159`, `CatalogPagination.jsx:14-15`, `seo.js:54-55`.
- The group heading is built three times: `seo.js:50`, `results.js:12`, `generate-static-seo.mjs:26`.
- **Title sort breaks ties differently.** At runtime ties fall back to catalogue order (`library.js:46,59`). The static listing breaks them by author (`generate-static-seo.mjs:20`). Yet the runtime `?sort=title` page declares that static page as its canonical (`seo.js:14,59`).
- **Book JSON-LD is built twice, with different fields.**
  - Runtime (`seo.js:60-61`): `isbn` = `verifiedEdition?.isbn || cover?.isbn`.
  - Static (`generate-static-seo.mjs:87`): `isbn` from `turkishEdition`, `inLanguage` set differently, and extra fields (publisher, translator, image).
- **Runtime SEO counts a personally filtered list.** The structured data comes from the list with purchased books hidden (`listing.js:10`, `App.jsx:104`), but `publicListing` (`seo.js:10-15`) still marks the page indexable.
- **Dates and "today" have several helpers.** Formatters: `formatDay` (`library.js:9-15`), `longDay` (`dates.js:3`), and the month names twice (`fairs.js:7`, `merge-data.py:506`). "Today": `todayLocal` (`reading.js:40`) and `todayInIstanbul` (`fairs.js:10`). The second pair is deliberate (ADR-002:78).
- `clampPage`, a pagination rule, lives in `recommendations.js:44`.

**G5. Module singletons are not Node-runnable.**
- `catalogData.js` imports JSON without an import attribute, so plain Node cannot load it.
- It also reads `localStorage` (`:19-20`) and touches the DOM (`:21`).
- `results.js:3`, `AgeLibrary.jsx:4` and `ActiveFilters.jsx:6` depend on these singletons.
- Dead imports: `books` in `BookCover.jsx:6` and `download` in `ActiveFilters.jsx:4`.
- By contrast, `library.js` and `seo.js` take the catalogue as a parameter. That is the right pattern.

**G6. Contracts and versioning are missing.**
- Book ids are built from normalised titles (`merge-data.py:60-75`). Slugs depend on title patches (`library.js:89-97`, `slugAuthor`).
- No test guarantees that an id or slug stays stable, yet `?book=` links, `state.json` records and `routes.json` all depend on them.
- The `sync` object is in practice a ViewModel (state plus commands, `useGitHubStateSync.js:413`), but it is untyped JS and carries display text.

**G7. Testability.**
- `tests/ui-structure.test.js:7-9` reads `App.jsx` and `src/app/*` as text and runs 15 regex assertions on it, for example `:26`, `:28` and `:50`. That last one fixes the exact line `const readingRanking=new ReadingRankingViewModel(...)`. Any move breaks these tests even when behaviour stays the same.
- The sync orchestration can only be driven through `renderHook` (`tests/components/sync-hook.test.jsx:3-4`, 579 lines).
- No import-boundary gate exists. The rule that SEO code must run in Node is checked only implicitly, because `node --test` imports `library.js` and `seo.js`.
- Strong point: the pure modules (library, seo, ranking, merge, fairs, routes) have thorough `node:test` suites, and `tests/e2e/structure.spec.js:18,48,53` already uses ARIA snapshots.

**G8. What breaks if the UI technology is replaced tomorrow.**
- **Must be rewritten:**
  - `App.jsx`: route state, history and about 15 handlers;
  - `useGitHubStateSync.js`, the riskiest code outside `merge.ts`;
  - `useRouteRegistry.js`;
  - the singletons in `catalogData.js`;
  - every derivation listed in G2;
  - lazy data loading, which is tied to `React.lazy` chunks;
  - colour-scheme persistence through Mantine (`App.jsx:194`);
  - the note rendering, which depends on react-markdown element trees (`NoteCards.jsx`).
- **Survives as is:** `library.js`, `seo.js`, `views.js`, `translation.js`, `workFormat.js`, `recommendations.js`, `src/ranking/*`, `src/state/*.ts`, `routes/planner.js`, `fairs.js`, `reading.js`, `catalogExport.js`.

**G9. What blocks a new design from getting its data.**
- There is no projection contract. A card's data only exists inside `BookCard.jsx`.
- The book sheet takes 19 props drilled from `App.jsx:191`.
- Facets with counts exist only for added days (`FilterSheet.jsx:62`).
- Authors and publishers are plain strings, not entities. `splitAuthors` is used only by the export and SEO (`catalogExport.js:21`, `generate-static-seo.mjs:85`).
- Related books need the raw catalogue (`BookDiscovery.jsx:24-29`).
- Every screen ships the whole catalogue in one chunk (`vite.config.js:14,44`). Measured in the raw JSON: covers 475 KB, memberships 324 KB, verified editions 167 KB, translation research 161 KB.
- So a shop-style design (facets, author pages, light grids) would have to rebuild all of this by hand.

---

## 3. Proposed architecture

### 3.1 Layers and boundaries

```
src/core/            framework-free, runs in Node: no DOM, no React, no CSS, no Vite queries
  catalog/           schema, openCatalog (index), queries (listing, facets, book page), sort/filter strategies
  personal/          marks, reading record, queue: value objects + PersonalLibrary store
  navigation/        Route value object, codec (today's library.js decode/encode + views.js), Navigator
  places/            bookstores, fairs, route planner (fairs.js, routes/planner.js)
  seo/               seoState, static page model
  viewmodels/        one per screen + shell + sync
  copy/              today's Turkish strings as pure functions (no i18n)
  ports.ts, store.ts, app.ts (composition: createKitaplik)
src/state/, src/ranking/   unchanged paths (ADR-002:26); src/state is the replication module
src/adapters/browser/      localStorage, history, document head, file saver, dynamic-import sources
src/ui/react/              today's components + one binding hook
scripts/                   Node adapters (fs sources) + static HTML template
```

**Dependency rule:** `ui → core ← adapters`. Only the composition root (`src/main.jsx` and the scripts) knows the adapters. `merge.ts` stays where it is. It is a domain service of the replication subdomain, and only `GitHubStateRepository` and the new `SyncController` use it. No ViewModel ever sees a `StateDocument`.

### 3.2 Domain model

- **Entities with identity:**
  - `Book` (BookId), `Collection`, `Group`, `Category`;
  - `Bookstore`, `Fair`, `PlannedRoute`;
  - `PersonalLibrary`, the root object for one reader's marks, reading records and queue.
- **Value objects:** `Marks` (keeps the exclusivity rule, taken once from `EXCLUSIVE_STATE_GROUPS`), `ReadingRecord`, `ReadingQueue` (at most 5), `Filters`, `Route`, `PageSize` (24/48/96/192/384), `IsoDay`, `Isbn13`, `TurkishEdition` (the evidence chain in `translation.js:27-40`).
- **Catalogue records stay plain, read-only JSON**, with policy functions next to them. They are not classes. There are 1019 of them, they are serialised for SEO and export, and they have no behaviour of their own.

### 3.3 Key interfaces

```ts
// src/core/store.ts: the only reactive contract any UI needs
export type Unsubscribe = () => void;
export interface ReadableStore<S> {
  getSnapshot(): S;                         // same reference until something changed
  subscribe(onChange: () => void): Unsubscribe;
}
export interface ViewModel<S, C> extends ReadableStore<S> { readonly commands: C; dispose(): void }

// src/core/ports.ts
export interface KeyValueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } // = state/types.ts StorageLike
export interface ReferenceSource<T> { load(): Promise<T> }          // read-only: bookstores, fairs, notes, raw archives
export interface LocationPort { current(): string; push(query: string): void; replace(query: string): void; back(): void; onPop(cb: () => void): Unsubscribe }
export interface DocumentHeadPort { apply(seo: SeoState): void }
export interface ClockPort { now(): Date }
export interface FileSaverPort { save(name: string, data: string | object, type?: string): void }
export type SharedStatePort = GitHubStateRepository;               // existing class is the adapter
export type RouteRegistryPort = Pick<GitHubRouteRegistry, 'cached' | 'load' | 'update' | 'flush' | 'pendingCount' | 'hasToken'>;

// src/core/catalog
export function openCatalog(input: unknown): Catalog;               // version gate + one-time index
export interface Catalog {
  readonly document: CatalogDocument; readonly books: readonly IndexedBook[];
  book(id: BookId): IndexedBook | undefined; collection(id: string): CollectionRecord | undefined;
  readonly authors: readonly string[]; readonly ranking: ReadingRankingSnapshot; readonly graph: ReadingGraph;
}
export interface SortStrategy { id: SortId; label: string; compare(a: IndexedBook, b: IndexedBook, ctx: SortContext): number }
export const SORTS: readonly SortStrategy[];                        // feeds sortBooks, the URL whitelist and the select

// src/core/personal
export interface PersonalSnapshot { marks: Readonly<Record<BookId, readonly ReadingState[]>>; reading: Readonly<Record<BookId, ReadingRecord>>; queue: readonly BookId[]; storageError: boolean }
export interface PersonalLibrary extends ReadableStore<PersonalSnapshot> {
  toggleMark(id: BookId, mark: ReadingState): void;                 // toggleState + stampReadingDate, one transition
  editReading(id: BookId, patch: Partial<ReadingRecord>): void;
  addToQueue(id: BookId): void; moveInQueue(id: BookId, step: -1 | 1): void; removeFromQueue(id: BookId): void;
  importBackup(json: unknown): ImportReport; exportBackup(): PersonalBackupV3;
  applyRemote(update: (s: PersonalSnapshot) => PersonalSnapshot): void; // sync only, atomic
}

// src/core/app.ts: Facade / composition root
export interface KitaplikApp {
  shell: ViewModel<ShellScreen, ShellCommands>;      catalog: ViewModel<CatalogScreen, CatalogCommands>;
  filters: ViewModel<FilterSheetScreen, FilterCommands>; book: ViewModel<BookSheet | null, BookCommands>;
  queue: ViewModel<QueueScreen, QueueCommands>;      collections: ViewModel<CollectionsScreen, { search(q: string): void }>;
  bookstores(): Promise<ViewModel<BookstoresScreen, RoutePlannerCommands>>;
  fairs(): Promise<ViewModel<FairsScreen, { setScope(s: 'all' | 'tr' | 'world'): void }>>;
  notes(): Promise<ViewModel<NotesScreen, NotesCommands>>;
  sync: ViewModel<SyncScreen, SyncCommands>;         dispose(): void;
}
export function createKitaplik(deps: { catalog: unknown; storage: KeyValueStorage; session: KeyValueStorage;
  location: LocationPort; head: DocumentHeadPort; clock: ClockPort; files: FileSaverPort; fetch: typeof fetch;
  sources: { bookstores: ReferenceSource<BookstoresData>; fairs: ReferenceSource<FairsData>; notes: ReferenceSource<string> } }): KitaplikApp;
```

**Use cases:**
- **Queries:** `catalogListing` (exists), `facets`, `bookPage`, `collectionsOverview`, `queueView`, `fairsFrom` (exists), `seoState` (exists), `staticPages`.
- **Commands:**
  - navigation: `openBook`, `closeBook`, `goView`, `changeFilters`, `changePage`, `changePageSize`, `changeSort`, `openCollection`, `openCategory`, `goHome`;
  - personal: the `PersonalLibrary` methods;
  - settings: `setHideOwned`;
  - sync: `connect`, `disconnect`, `sendNow`, `refresh`, `resolveMerge`, `clearRecovery`;
  - routes: `saveRoute`, `removeRoute`, `suggestRoute`, `orderStops`.

### 3.4 How any UI subscribes

Each screen ViewModel is a memoised store with a command object. The contract `getSnapshot`/`subscribe` matches React's `useSyncExternalStore` exactly, and it maps onto Svelte stores, Vue refs, Solid signals, Lit controllers or vanilla code in a few lines. **The current React UI needs exactly one adapter:**

```js
// src/ui/react/useViewModel.js
import { useSyncExternalStore } from 'react';
export const useViewModel = vm => useSyncExternalStore(vm.subscribe, vm.getSnapshot, vm.getSnapshot);
```

Wiring:
1. `main.jsx` calls `createKitaplik(...)` with the browser adapters and provides the result through an `AppContext`.
2. `App.jsx` replaces its `useState` calls with `useViewModel(app.catalog)` and the other screen VMs.
3. The handlers become `app.catalog.commands.*`.
4. The components keep their markup and receive the same values, so nothing visible changes.

During the migration, the sync hook keeps its `setStates`/`setPersonal` signature through two small updater shims over `personal.applyRemote`.

### 3.5 Static SEO reuses the same core

The static generator is in fact already a second UI technology: an HTML string template in Node. It re-implements derivations because the core was not separated (G4).

- In the target design, `scripts/generate-static-seo.mjs` builds the catalogue with `openCatalog(JSON.parse(fs.readFileSync(...)))` and iterates `core/seo/staticPages(catalog)`.
- `staticPages` uses the same `SORTS`, listing query, `bookPage` projection and JSON-LD builder that the runtime `seoState` uses.
- Only the HTML template stays in the script.
- The sitemap iterates the same page list. `library.js` and `seo.js` remain as re-export facades, so their paths and the tests keep working.

### 3.6 Patterns: where they help, where they would be over-engineering

| Pattern | Apply here | Over-engineering here |
|---|---|---|
| MVVM | One ViewModel per screen (the main seam a new design needs) | One VM per widget (the translation popover's open state stays in the view) |
| MVC | Only the `Navigator`, which maps intents to the route and history, plays a controller role | A separate MVC layer on top of the VMs |
| OOP classes | Stateful services with a lifecycle: `PersonalLibrary`, `SyncController`, `Navigator`, plus the existing `GitHubStateRepository`, `GitHubRouteRegistry` and `ReadingPriorityEngine` | Classes for book or collection records, or getters on value objects |
| Repository | `state.json`, `routes.json` (both exist), `PersonalLocalStore` over local storage | A generic `Repository<T>`, or a Repository for read-only catalogue data |
| Strategy | Sort comparators, filter predicates, ranking policy (exists) | — |
| Chain of Responsibility | Turkish edition evidence (`translation.js:27-40`), name it only | — |
| Observer | Stores; `SyncController` observes `PersonalLibrary`; the location port | An event bus or domain events |
| Adapter | `useViewModel`, browser ports, GitHub clients | — |
| Facade | `createKitaplik` | A DI container |
| Also avoid | — | Redux, MobX, RxJS, Zustand, Zod, CQRS or event sourcing, i18n |

### 3.7 Where I deliberately disagree with ADR-002

1. **ADR-002:22 and :59 plan hooks (`usePersonalState`) as the binding.** I propose framework-free stores and one adapter instead. A hook would make React the owner of the data again, which is G1.
2. **ADR-002:24 says no ViewModel per feature.** The owner's new requirement makes screen VMs the stable contract, so I propose one per screen, about 11, as plain objects.
3. **ADR-002:23 keeps static JSON out of any abstraction.** I propose a read-only `ReferenceSource<T>`, not a Repository, because Node (SEO) and a non-React UI both need to load the data without `React.lazy`.
4. **ADR-002:62 plans `src/features/*` folders that mix JSX and logic.** I propose features *inside* `src/core`, with the UI separate. The replaceable-UI boundary should then be a directory, not a naming convention.
5. **ADR-002 phase 5 (one shared GitHub client).** I would postpone it. It is high-risk and not needed for UI independence.

I agree with ADR-002 on the rest: the modular monolith, no router or state library, no i18n, frozen paths, and test first.

---

## 4. Data contracts

### 4.1 Catalogue schema and versioning

- **Python side.** `merge-data.py` adds `schemaVersion: 1` (an additive change). It also adds `updatedOn: 'YYYY-MM-DD'` next to the display-only `updated`. Before writing, a `validate_catalog(result)` checks the invariants Python already knows: unique ids, references that resolve, ISO days.
- **TypeScript side.** `src/core/catalog/schema.ts` defines `CatalogDocument`, `BookRecord` (fields as in §1: 16 always present, 14 optional, sampled with `python3`), `CollectionRecord`, `GroupRecord` and `ReadingGuides`. The reduced `Catalog` type in `ranking/types.ts` becomes a `Pick` of it.
- **Versioning rule.**
  - Adding a field changes nothing.
  - Removing a field, renaming it or changing its meaning bumps the major version.
  - `openCatalog` accepts versions `1` and missing (missing during the transition), and otherwise throws a clear error.
  - The catalogue ships in the same build as the code, so the gate mostly protects external consumers: the export (`schemaVersion: 3`) and `kitaplik-tum-veri.json`.
- **Identity contract.** A committed list of book ids and slugs must stay a subset of the current ones, or be redirected through `mapping`/`legacyKeys`. This protects `?book=` links and `state.json`.
- **Projection contracts.** `BookSummary` (the fields a card needs) and `BookDetail` (the rest). Defining them now lets the catalogue be split later without any UI change.

### 4.2 View-model contracts

**Screens that exist today:**
- Shell: active view, header tabs, footer groups, `ownedCount`, `hideOwned`, catalogue dates.
- Catalogue, favourites and owned shelves.
- Filter sheet.
- Book sheet.
- Queue.
- Collections.
- Bookstores, including the route planner.
- Fairs.
- Notes.
- Sync: notice kind, status-line kind, merge prompt.

Example:

```ts
export interface CatalogScreen {
  view: 'books' | 'owned' | 'favorites'; searchLabel: string; query: string;
  sort: { value: SortId; options: { value: SortId; label: string }[] };
  chips: { id: string; label: string }[]; heading: string; total: number; range: { start: number; end: number } | null;
  cards: BookCardView[]; pagination: { page: number; pages: number; pageSize: PageSize; pageSizes: readonly PageSize[]; href(p: number): string };
  banners: { coreRoute: { count: number } | null; ageLibrary: AgeLibraryView | null; prioritySummary: { criteria: string[] } | null };
  empty: null | 'owned-empty' | 'favorites-empty' | 'no-match';
}
export interface BookCardView { id: BookId; title: string; author: string | null; childAge: string | null; publisherLine: string;
  translation: { status: 'available' | 'unavailable' | 'unverified'; label: string; description: string; sourceUrl?: string } | null;
  priority: { rank: number; score: number; label: string; audience: 'general' | 'children' } | null;
  marks: { favourite: boolean; owned: boolean; read: boolean; readingBadges: string[] };
  queue: { position: number | null; full: boolean }; cover: { src: string; srcSmall: string; alt: string } | { placeholder: { kind?: string; title: string; author: string } } }
```

- VMs carry enum kinds and numbers. Today's Turkish strings come from `core/copy`, so the current views render exactly what they render now, and a new design may reword the text without touching any rule.
- **A new design could need** facets with counts (`facets(shelf, filters)` returns per-option counts), author and publisher pages (`splitAuthors` becomes an index), search suggestions, and "next in route" lists. Each of these is one query on `Catalog`, not a component.

### 4.3 Where contracts are validated

| Boundary | Validation |
|---|---|
| Python → `catalog.json` | Python invariants plus a Node contract test (`assertCatalog`) on the generated file. Build time, full. |
| `bookstores.json`, `book-fairs.json` | Node contract tests (they partly exist: `tests/bookstores.test.js`, `tests/fairs.test.js:60-88`) |
| Browser loads the catalogue | Version gate only (types inside) |
| `state.json`, `routes.json` | Runtime, full (exists: `assertStateDocument`, `parseRouteDocument`). Do not change. |
| local storage, backup import, URL | Runtime cleaning (exists: `cleanPersonal`, `migrateStates`, `decodeRoute`), moved into core use cases |
| core → VM → UI | Types only |

No validation library is needed: the hand-written asserts already follow the house style.

---

## 5. TDD-first migration plan

Every step ships on its own. The standing gates for every step are:
- `npm test`, `typecheck` and `build`;
- the e2e specs on chromium, webkit and mobile-safari;
- the content baselines from step 0, unchanged.

A text-matching assertion in `ui-structure.test.js` may be retired only when two things land in the same commit: a behavioural test of at least the same strength, and a demonstration that this new test fails when the behaviour is broken (deliberate mutation). Otherwise the check would be loosened, which AGENTS.md forbids.

**S0. Safety net (no code moves).**
- Tests first:
  - Extend the ARIA snapshots (`toMatchAriaSnapshot`, already used in `structure.spec.js`) to the main content of 12 addresses: `/`, `?sort=title&page=2`, `?category=children`, `?collection=core`, owned and favourites with seeded storage, queue, collections, bookstores, fairs (fixed `page.clock`), notes, and one `?book=` sheet.
  - Node golden tests: `seoState` for about 20 routes; the first page of ids for each sort × view; the static SEO output for sample pages, written to a temporary directory as in `seo.test.js:61`.
- Add `tests/architecture.test.js`:
  - the whole import graph of `library.js`/`seo.js` is free of JSX and CSS;
  - the banned-import rules for `src/core` (empty at first);
  - a self-test showing that the rules catch planted violations, as `ui-gates.test.js:209` does.
- Done: the baselines are reviewed and committed.

**S1. Contracts.**
- Tests first: the catalogue contract test expects `schemaVersion` and fails.
- Then: the Python change, `npm run data`.
- Also: the storage-key registry test (pins all 17 names); the id/slug stability test; and a test that `readingPayload(cleanReading(x))` equals `readingPayload(x)` for every remote shape, before the reading record is normalised at the boundary.

**S2. Store primitive and React adapter.**
- `createStore`/`derived` with `node:test` unit tests (notification, memoised snapshot identity).
- `useViewModel` with a Vitest component test.

**S3. Composition root and catalogue index.**
- Tests first: Node tests showing that `openCatalog` returns the same derived maps, `authors` and ranking as `catalogData.js` does today.
- `catalogData.js` becomes a re-export.
- In the same commit, replace `ui-structure.test.js:50` with a core test: the ranking snapshot is identical whatever the personal state.

**S4. `PersonalLibrary` and settings stores (local only).**
- Tests first: port the behaviour of `App.jsx:107-118,137,163` and `NotesPage.jsx:37-50` into unit tests.
- Bind `App.jsx` to the stores. The sync hook is unchanged and uses the updater shims.
- Gate: `sync-hook.test.jsx`, `sync.spec.js` and `devices-sync.spec.js` unchanged and green; `reading-marks.spec.js`, `hide-owned.spec.js`.
- This step needs an independent review.

**S5. Navigator.**
- Tests first: unit tests on a fake `LocationPort`. Opening a book from the catalogue pushes history; closing goes back; popstate clears the book trail; an out-of-range page is corrected with `replaceState`; the home link resets the route.
- Replace the regex assertions at `ui-structure.test.js:24-30` with these tests.

**S6. Catalogue screen VM, filter-sheet VM, `BookCardView`.**
- Tests first: one unit test per snapshot field, against the values pinned in S0.
- The components receive VM values.
- Gate: ARIA baselines; `catalog-grid.spec.js`; `site.spec.js`.

**S7. Book-sheet VM.**
- Move the derivations out of `BookCard`, `BookDetail`, `BookDiscovery`, `EditionSummary`, `EditionGuide` and `ReadingQueue` into `bookPage`.
- Gate: `tests/components/book-page.test.jsx` unchanged.

**S8. Reference screens.**
- Collections, bookstores, fairs and notes VMs, loaded through `ReferenceSource`. The lazy chunks stay separate.
- Tests first: VM tests with in-memory sources; an e2e test that the bookstores data is requested only when that page opens.

**S9. `SyncController` (highest risk).**
- Tests first:
  - run the existing `sync-hook.test.jsx` cases against the controller directly;
  - keep the original hook tests against a thin `useGitHubStateSync` wrapper;
  - add a test that a remote read produces no outgoing mutation.
- Move the code verbatim. The controller observes `PersonalLibrary`.
- Then move `syncNoticeKind`/`syncStatusKind` into the sync VM, and build the route-planner VM.
- Needs an independent review and all sync profiles green.

**S10. SEO unification.**
- `staticPages` and a single JSON-LD builder.
- Gate: the S0 static outputs stay byte-identical. Any difference needs an owner decision (see §6).

**S11. Clean-up and ADR-003.** Remove the dead imports, update `AGENTS.md`/ADR.

**Boundary gates** (in `tests/architecture.test.js`, run by `npm test`):
- `src/core/**` may import only `src/core`, `src/state/*.ts`, `src/ranking`, `site.js` and `views.js`. It may not use `react`, `@mantine`, `@tabler`, `.jsx`, `.css`, `?raw`, `import.meta.env`, `window`, `document`, `localStorage`, `sessionStorage` or `navigator`.
- `src/ui/**` may not import `catalog.json`, `data/*`, `GitHubStateRepository` or `routeRegistry`.
- Only `main.jsx` and `scripts/*` import `src/adapters`.
- Every file under `src/core` is dynamically imported under plain Node.
- The self-test from S0 proves each rule catches a planted violation.

---

## 6. Risks and open decisions

1. **Sync timing during S9.** Today an edit is detected once per React commit. If the controller diffed after each store notification, a remote read that updates marks and reading in two steps could create a spurious mutation. *Recommendation:* `applyRemote` is atomic, the diff is coalesced per task, and both are pinned by tests first. If review is not convinced, ship S0–S8 and keep the hook behind `SyncPort` until it is. I am unsure this is the only timing difference. That is why S9 comes last.
2. **Runtime and static title sort tie-break; JSON-LD differences (G4).** *Recommendation:* pin both now and change neither without the owner, because the order is visible. The static-and-runtime list is a decision to bring to the owner.
3. **Runtime structured data uses the hide-owned list.** *Recommendation:* compute SEO from the public listing (head metadata only, not visible), test first, with the owner's approval.
4. **`collection.count` labelled "kaynak kaydı" (G3).** This is a visible bug. *Recommendation:* document the field now; fix it (show `originalCount`) only with the owner, after the design work.
5. **Content baselines.** *Recommendation:* ARIA snapshots now. They do not depend on the operating system and are already in use. Screenshots stay the open decision in ADR-002:80.
6. **Where the copy lives.** *Recommendation:* a `core/copy` module, Turkish only. VMs expose kinds plus strings.
7. **Splitting the catalogue (summary and detail).** *Recommendation:* define the contracts now and split only when the new design's loading needs are known.
8. **One schema source for Python and TS.** *Recommendation:* TS types plus a Node contract test on the generated file are the gate. Python keeps only its own invariants. JSON Schema would need a Python dependency.
9. **Storage key names** (`kitaplik:` vs `kitapatlasi:`). *Recommendation:* never rename; register the names and pin them. Renaming would reset readers' devices.
10. **ADR-002 phase 5 (shared GitHub client).** *Recommendation:* postpone it as a separate, reviewed change. It is orthogonal to the data the UI receives.
11. **Id stability.** Ids come from titles (`merge-data.py:60-75`). *Recommendation:* the S1 lock test, plus required `mapping` entries for any rename.

### Critical files for implementation
- src/App.jsx
- src/state/useGitHubStateSync.js
- src/app/catalogData.js
- src/library.js (with src/seo.js and scripts/generate-static-seo.mjs)
- scripts/merge-data.py
