# Data architecture analysis: Codex

- Analyst: Codex CLI 0.153.4, model gpt-6-astra, read-only sandbox.
- Code read: `main` at 625d1bc, 8 November 2026.
- Brief: the same brief as the Claude analysis (`2026-11-08-data-architecture-claude.md`). The two reports were written independently and are synthesised in `docs/ADR-003-data-architecture.md`.
- The report below is unchanged. It is in English because the brief was.

---

**Recommendation: retain the modular monolith and existing domain logic, but introduce a framework-independent application layer that owns data queries, personal-data commands, and subscriptions.** React should become one consumer of that layer. The catalogue pipeline and reviewed synchronization algorithms should remain in place behind explicit contracts.

This report concerns the inspected checkout at `625d1bcfe61eed1a418e86a071a878d9c28d63d`. I did not verify parity with remote `main`. Inspection was read-only. Tests, builds, browser checks, and live synchronization were **not run**.

**1. Current data flow map**

The application already has substantial framework-independent logic. Its main architectural weakness is the distribution of data ownership across that logic, React state, hooks, and source files.

| Source and owner | Transformation and delivery | Runtime owner and mutations |
|---|---|---|
| Editorial catalogue sources, maintained in Git | `scripts/merge-data.py` combines source records and enrichment manifests into `src/catalog.json`. | Read-only in the application. Python writes the generated catalogue. |
| Generated catalogue | `src/app/catalogData.js:8` prepares searchable books, indexes, author options, and ranking. Vite separates the catalogue into a chunk. | Module-level objects shared by React consumers. |
| Bookstores and fairs, maintained editorially | Their JSON files are imported by lazily loaded pages. | Page-local derivation; the source records are not edited by the browser. |
| Notes and source archives | Markdown enters through Vite’s `?raw` import. Archive JSON is imported when downloading. | Notes rendering and download orchestration live in `NotesPage.jsx`. |
| Personal marks, reading records, and queue | Local browser copies combine with GitHub `state.json`, schema 2. | React owns working values; repository and batcher own synchronization machinery. |
| Saved bookstore routes | Browser cache and pending changes combine with GitHub `routes.json`, schema 1. | `RouteRegistry` owns persistence; its React hook exposes records and operations. |
| URL and device settings | URL decoding, history events, local storage, and session storage. | Mostly `App.jsx`, Mantine’s theme manager, and synchronization components. |

**Build-time catalogue.** The primary inputs include `data/sources/atlas-v1.json`, `okuma-kumeleri.json`, `kitaps.json`, and `entrepreneurship-curriculum.json`, plus foundational and preparatory reading manifests (`scripts/merge-data.py:10`).

Further inputs supply category corrections, international and Turkish covers, verified editions, source issues, children’s books, review collections, translation research, bibliographic facts, page counts, addition dates, and reading-guide relationships. These are enrichment sources with distinct responsibilities, not interchangeable copies of one schema (`scripts/merge-data.py:170`, `:238`, `:329`, `:378`, `:404`, `:445`).

The merger establishes identities, consolidates memberships, attaches evidence, and materializes counts and relationship arrays. Identity construction includes title normalization and explicit collision handling (`scripts/merge-data.py:59`). The inspected output contains **1,019 works, 36 collections, 198 groups, and 21 categories**.

Its `updated` value represents the latest evidence date, not the build time. The final envelope has no schema version (`scripts/merge-data.py:514–518`). Raw research and intermediate cover files do not all enter the runtime catalogue directly.

**SEO and exports.** Both SEO generators read the generated catalogue. `generate-sitemap.mjs` produces the sitemap; `generate-static-seo.mjs` writes static catalogue and work pages. They reuse Node-compatible helpers such as URL generation, display titles, and author parsing.

The build does **not** regenerate catalogue data. CI runs tests, type checking, build, and browser tests, but has no catalogue regeneration comparison (`.github/workflows/pages.yml:25–32`). Consequently, checking source JSON and checking generated output are currently separate activities.

Catalogue export has its own schema version 3 (`src/catalogExport.js:30`). Notes also offers a source archive and personal backup. The source archive currently includes seven selected JSON sources plus Markdown, not every enrichment manifest (`src/components/NotesPage.jsx:20–31`). Standalone export additionally embeds cover assets.

**Load-time delivery.** `App.jsx` imports the catalogue immediately and lazily loads bookstores, fairs, and notes (`src/App.jsx:38`). Those pages import their reference data within their modules. This is bundled static delivery, not a catalogue API.

`catalogData.js` computes ranking once, independently of personal state. The ranking engine, policy, and reading graph live under `src/ranking/`. Cover rendering resolves catalogue metadata into image resources, with a separate embedded-image path for standalone output.

**Runtime derivation.** `library.js` prepares search fields, filters, sorts, handles reading marks, migrates legacy local marks, and encodes or decodes URLs. `app/listing.js` combines shelf selection, the hide-owned preference, filtering, sorting, pagination, and page clamping.

Other independent helpers cover translation evidence, edition page counts, work formats, recommendations, reading progress, fairs, and bookstore route planning. Components still perform additional joins and calculations.

**Personal state.** `App.jsx:54–57` owns marks and personal reading data. Effects persist them locally; handlers update marks, stamp reading dates, and change the queue (`src/App.jsx:96–115`). Notes receives raw setters and can restore backups.

`useGitHubStateSync.js` coordinates loading, connection decisions, refreshes, local edits during reads, batching, retries, and lifecycle events. `GitHubStateRepository.ts` manages GitHub reads and writes, cached documents, pending operations, recovery, and concurrency. `GitHubStateBatcher.ts` enforces batching. `merge.ts` supplies the reviewed merge rules.

Saved routes use a separate repository and hook. They have whole-route timestamp resolution and tombstones, rather than the personal-state merge model (`src/state/routeRegistry.ts:136`).

**Local settings and navigation.** Browser storage contains legacy and current marks, personal records, hide-owned preference, theme preference, synchronization credentials, cached documents, pending changes, connection-review markers, and recovery information. Session storage holds synchronization-notice dismissal. These have different durability and privacy requirements.

URL state is initialized and updated inside React, including history navigation and legacy hash handling (`src/App.jsx:52`, `:94–99`). Device-local reading dates and Istanbul fair dates intentionally differ.

**2. Gap analysis**

**Application behavior depends on React lifecycle.** The main coupling is not Mantine styling. It is that important operations exist only through React handlers, effects, and refs. Replacing React would require reconstructing synchronization sequencing and personal-state ownership, not merely rewriting rendering (`src/state/useGitHubStateSync.js:70–107`, `:286–340`, `:361–409`).

**The catalogue entry point mixes responsibilities.** `catalogData.js` combines pure preparation, singleton indexes, ranking, browser storage, and downloads (`:2–21`). Its extensionless imports and JSON import also make it unsuitable as the shared plain-Node entry point without adaptation. `app/results.js:3` inherits that dependency through its maps.

**Schemas are partial and implicit.** Ranking’s `CatalogBook` describes only ranking inputs, not the full catalogue (`src/ranking/types.ts:8`). The Python envelope, JavaScript property access, exports, and tests collectively define the broader contract. There is no single runtime decoder for it.

Personal reading data also has multiple representations: form-friendly empty strings, cleaned local values, and optional or nullable synchronization fields. Conversion happens in the sync hook (`src/state/useGitHubStateSync.js:7–23`). Those distinctions are legitimate, but their boundary is poorly located.

**Derived data remains in rendering code.** Examples include:

- Facet options, dependent groups, and addition-date counts in `FilterSheet.jsx:58–73`.
- Collection counts in `app/Collections.jsx:11–14`.
- Membership grouping in `app/BookDetail.jsx:47`.
- Queue joins, progress, and validation in `ReadingQueue.jsx:10–14`.
- Store grouping and planned-stop calculations in `BookstoresPage.jsx:68`, `:95`.
- Fair filtering and month grouping in `BookFairsPage.jsx:46–48`.
- Markdown-table interpretation through React children in `NoteCards.jsx:7–25`.

A replacement UI would either duplicate these rules or import rendering modules. A new design cannot reliably request the same derived information independently.

**Version numbers do not establish compatibility.** Personal backup export declares version 3, while its importer primarily inspects shape and does not dispatch by version (`src/components/NotesPage.jsx:40–48`, `:74`).

More critically, state parsing rejects unknown fields, while route parsing reconstructs known fields and discards others (`src/state/merge.ts:27–36`, `:76–89`; `src/state/routeRegistry.ts:89–100`). Adding a field can therefore cause rejection or eventual loss through an older writer.

**Similar computations are not necessarily equivalent.** Browser title sorting compares displayed titles; static SEO adds an author tie-breaker (`src/library.js:42–59`; `scripts/generate-static-seo.mjs:20`). Structured-data author handling also differs. Consolidating these mechanically would change output.

**Testing is strong but unevenly placed.** Pure logic and synchronization already have extensive tests, including concurrent edits and recovery. However, source-text assertions still inspect implementation placement (`tests/ui-structure.test.js:7–49`). Accessibility-tree and geometry checks do not prove complete visual equivalence. ADR-002 explicitly records the absence of reviewed screenshot baselines (`docs/ADR-002-architecture.md:80`).

Thus the blocker for redesign is **missing reusable query and command contracts**, not inadequate catalogue size, lack of classes, or a demonstrated need for another database.

**3. Proposed architecture**

Keep one application and deployment. Establish four dependency boundaries:

```text
React presentation ──> Application queries, commands, subscriptions
                                  │
                                  v
                         Pure domain functions
                                  ^
                                  │
                 Ports implemented by external adapters

Node SEO entry points ──> Public queries and pure domain functions
```

Adapters include bundled JSON, Node file reads, browser storage and history, downloads, lifecycle events, and the existing GitHub repositories. Composition roots assemble them. Domain and application modules never import React, Mantine, JSX, CSS, browser globals, or Vite-specific imports.

Keep existing public paths, particularly `src/ranking`, `src/state`, `src/catalog.json`, `library.js`, and `seo.js`. Facades can preserve imports during migration. Folder movement should follow proven boundaries.

**Domain model.** Use immutable records and small validating functions:

- **Work:** stable existing ID, title variants, author credit, format, bibliographic facts, and provenance.
- **Edition evidence:** ISBN when available, publisher, translator, language, page count, source, verification status, and dates.
- **Collection, group, category, membership, and reading-guide relationship:** explicit entities and relationships with existing ordering preserved.
- **Personal library:** marks, reading records, and the bounded reading queue.
- **Bookstore, fair, and saved bookstore route:** separate domains. A saved visit route is not a catalogue reading guide.

Treat IDs, ISBNs, calendar days, timestamps, and validated filter specifications as value types. Do not recalculate stable IDs from corrected titles. Preserve `slugAuthor`, legacy keys, and URL aliases.

Do not invent an authoritative author entity from the current credit strings. Likewise, preserve the difference between unknown page count, zero progress, unavailable translation, and unverified evidence.

**Application ownership.** One application service owns the working personal-state projection. Commands express intent: toggle a mark, patch a reading record, change queue order, restore a backup, or save a route. Components receive neither mutable records nor raw state setters.

This does not create a second synchronization engine. Existing repositories, pending-operation structures, batcher, and merge functions remain authoritative for synchronization. A framework-independent controller takes over the hook’s orchestration incrementally.

Public reference data is immutable for a loaded revision. Indexes and ranking depend on catalogue revision and ranking-policy version. Personal changes invalidate affected projections, not catalogue ranking.

**Ports.** Provide narrow ports for each source family:

| Boundary | Adapter and responsibility |
|---|---|
| Catalogue | Validated bundled snapshot in the browser; validated file input for Node. |
| Bookstores and fairs | Separate lazy reference loaders retaining present loading boundaries. |
| Notes and source archive | Markdown/content loader and on-demand archive loader. |
| Covers | Asset resolver supporting normal and standalone output. |
| Personal working data | Existing-key local-storage adapter with explicit persistence outcomes. |
| Personal synchronization | Adapter around the existing repository and batcher. |
| Saved routes | Adapter around `RouteRegistry`, retaining its separate protocol. |
| Settings | Device-preference adapter; presentation preferences remain presentation-owned. |
| Environment | Clock, lifecycle, URL/history, credentials, and download ports. |

These are capabilities, not a generic CRUD repository hierarchy.

The following signatures illustrate the key boundaries. Referenced domain types would be defined in the contracts package.

```ts
interface ObservableValue<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

interface ReadPort<T> {
  load(): Promise<T>;
}

interface ReferencePorts {
  catalog: ReadPort<CatalogSnapshot>;
  bookstores: ReadPort<BookstoreReference>;
  fairs: ReadPort<FairReference>;
  notes: ReadPort<NotesDocument>;
  sourceArchive: ReadPort<SourceArchive>;
}

interface PersonalStoragePort {
  read(): StorageRead<PersonalSnapshot>;
  write(value: PersonalSnapshot): PersistenceResult;
}

interface ClockPort {
  now(): string;
  localDay(): string;
  istanbulDay(): string;
}

interface QueryContracts {
  catalog: { input: CatalogQuery; output: CatalogListingVM };
  detail: { input: { bookId: BookId }; output: BookDetailVM };
  collections: { input: CollectionQuery; output: CollectionsVM };
  queue: { input: undefined; output: ReadingQueueVM };
  bookstores: { input: StoreQuery; output: BookstoresVM };
  fairs: { input: FairQuery; output: FairsVM };
  notes: { input: undefined; output: NotesVM };
  sync: { input: undefined; output: SyncVM };
}

type PersonalCommand =
  | { type: "toggleMark"; bookId: BookId; mark: ReadingMark }
  | { type: "patchReading"; bookId: BookId; patch: ReadingPatch }
  | { type: "moveQueueItem"; bookId: BookId; direction: -1 | 1 }
  | { type: "restoreBackup"; input: unknown };

interface LibraryApplication {
  observe<K extends keyof QueryContracts>(
    query: K,
    input: QueryContracts[K]["input"]
  ): ObservableValue<QueryState<QueryContracts[K]["output"]>>;

  execute(command: PersonalCommand): Promise<CommandReceipt>;
  dispose(): void;
}
```

The command union would also cover existing queue additions/removals and route operations. Connection, recovery, and explicit-send operations need typed methods preserving current decisions. Credentials stay outside serializable view models and diagnostic command logs.

A command receipt must distinguish application in memory, local persistence, and remote delivery. Returning successfully must never imply “synced” unless a send actually succeeded.

**Framework-neutral view models.** These are readonly data-transfer objects, not mandatory classes. They contain meaningful data, current Turkish labels where needed, validation results, and capabilities. They contain no React nodes, icons, component props, or styling instructions.

Subscriptions return an unsubscribe function. Snapshots retain their reference until their contents change. Errors, stale data, pending writes, recovery requirements, and last successful reads/sends remain distinct.

The React adapter uses `useSyncExternalStore` against stable handles, then maps results into the existing props. React documents this API specifically for subscribing to external stores and requires stable cached snapshots. [React documentation](https://react.dev/reference/react/useSyncExternalStore)

Seed the initial catalogue synchronously from the existing bundle. Introducing the application layer must not introduce a new loading display or eagerly load currently lazy data. Focus, motion, and transient interaction state remain in the presentation adapter.

**SEO reuse.** Node composition loads validated catalogue data and calls public queries without personal repositories or browser adapters. Extract DOM metadata application from pure SEO calculation while preserving `seo.js` exports.

Share primitives and explicit query policies. Preserve browser and static ordering separately until an authorized behavior change unifies them. Preserve generated URLs, content, canonical rules, and structured-data output.

**Patterns and ADR-002.** MVVM fits the separation of projections, commands, and rendering. Observer fits subscriptions. Adapter fits browser, Node, and GitHub boundaries. Repository fits persistent aggregates. Strategy fits existing ranking policies and explicit sort functions.

Existing ranking engines, graphs, repositories, and lifecycle controllers justify encapsulated objects. Entity classes, a dependency-injection container, event bus, ORM, generic repository framework, or class per screen do not.

MVC is useful terminology for input handling and rendering, but adding a parallel MVC layer would duplicate the application boundary.

I agree with ADR-002’s modular monolith, pure functions, stable paths, and rejection of automatic ViewModel classes. I deliberately amend two points:

- Hooks should bind React to application behavior, rather than remain its sole orchestration home (`ADR-002:22`).
- Static sources deserve narrow read ports because Node and alternative UIs need independent access. They still do not need mutable repository classes (`ADR-002:23`).

**4. Data contracts**

**Catalogue contract.** Introduce a complete `CatalogWireV1` describing the existing envelope and optional evidence fields. First support the current unversioned document through an explicit legacy decoder. Only then add `schemaVersion: 1` to generated output, after proving existing consumers tolerate it.

Keep separate concepts:

- Schema version describes structure.
- Content revision identifies a particular catalogue snapshot.
- `updated` retains its evidence-date meaning.
- Ranking-policy version describes scoring rules.
- Export and backup versions describe their own formats.

Python remains responsible for source-specific consolidation. A shared TypeScript decoder validates its candidate output before publication and also validates Node/runtime inputs. Python’s existing source validators remain useful; do not maintain a second complete catalogue schema manually in Python.

Validation must cover types, unique IDs, references, memberships, allowed values, slug collisions, and documented count semantics. Source-entry counts must not be mistaken for unique-work counts. Existing incomplete bibliographic evidence must remain representable.

**View-model coverage.**

| Current data surface | Contract content |
|---|---|
| Books, favourites, owned shelf | Ordered results, totals, pagination, selected filters, facet options, ranking, marks, and summaries. |
| Work details and discovery | Titles, editions, provenance, translation status, memberships, reading relationships, recommendations, and personal record. |
| Collections | Existing hierarchy, counts, descriptions, and query results. |
| Reading queue | Ordered works, progress, validation, and permitted commands. |
| Bookstores and saved routes | Store facts, status evidence, editorial ordering, saved routes, and planning calculations. |
| Fairs | Upcoming/current/undated records, date evidence, grouping, and calendar-export data. |
| Notes and sources | Content sections, source counts, archive availability, and backup results. |
| Synchronization | Connection decisions, pending work, persistence failures, recovery, and read/send history. |

These contracts should expose reusable facts and relationships, not freeze today’s page composition. A later design may need selected-work comparisons, batch summaries, alternative discovery queries, or fuller provenance. Add those as tested queries when requirements exist.

**Validation boundaries.** Runtime validation belongs at generated JSON ingestion, remote documents, local-storage reads, backup imports, and command inputs. Type-only checking is sufficient between trusted internal functions, supplemented by contract tests.

Do not silently tighten existing recovery or import behavior during extraction. Characterize current acceptance and rejection first.

Keep `state.json` schema 2 and `routes.json` schema 1 unchanged throughout this migration. Future evolution requires tests involving both old readers **and old writers**. A new reader’s migration function alone cannot prevent an older writer from rejecting or discarding new data.

**5. TDD-first migration plan**

Every step begins with characterization of the current path. A new seam or requirement receives a failing test before implementation. Existing behavior tests must pass before code moves.

For each implementation step, the shared release gate is the existing unit/component suite, type checking, production build, and relevant browser tests. No content, URL, ordering, structure, or visible change is accepted as incidental cleanup.

| Step | Tests written first | Equivalence gate and done criteria |
|---|---|---|
| **0. Establish observable baselines** | Capture representative catalogue queries, URL round-trips, detail evidence, backup behavior, all registered views, and deterministic SEO output. Establish reviewed visual baselines separately in the agreed Linux environment. | Existing behavior is documented by executable expectations. Accessibility snapshots are explicitly distinguished from pixel comparisons. |
| **1. Establish catalogue contracts** | Decoder tests for current data, malformed records, missing optional evidence, unknown versions, broken references, and ID/slug stability. Characterize merger output before extracting candidate generation. | Candidate regeneration matches committed content. Validation precedes output replacement. No source corrections are bundled into this step. |
| **2. Extract catalogue construction and queries** | Tests for index construction, listing, facets, edition selection, recommendations, and browser/static tie rules. Compare old and new results on identical fixtures. | Result IDs, ordering, counts, labels, and evidence are equal. Existing components still receive equivalent props. |
| **3. Introduce observable read models** | Subscription, stable-snapshot, invalidation, disposal, and lazy-loader tests. Component tests verify adapter wiring. | One view at a time uses the application layer. Initial rendering, lazy requests, URL behavior, and visual baselines remain unchanged. |
| **4. Centralize personal commands** | Tests for mark exclusivity, one-time dates, reading cleaning, queue limits, backup restore, and storage failure. Pin current sync-boundary conversions. | One writer owns working personal data. The existing sync hook temporarily receives equivalent values through a bridge. No duplicate local or remote writes occur. |
| **5. Extract sync orchestration** | Reuse existing hook scenarios against a framework-free controller: edits during refresh, undo during send, first connection, recovery, rate limits, lifecycle flush, disposal, and old-client compatibility. | Existing repository, batcher, serialization, and `merge.ts` rules remain unchanged. React adapter tests and independent review confirm sequencing parity. |
| **6. Extract remaining feature services** | Characterize saved-route operations, pending replay, store grouping, missing coordinates, fair-date boundaries, notes sections, and downloads. | Existing route wire format, ordering, clocks, lazy loading, imports, and download contents remain identical. |
| **7. Complete Node reuse and enforce boundaries** | Plain-Node import tests, generated-HTML comparisons, dependency-gate tests, and browser bundle/request checks. | SEO consumes the shared public core. Presentation has no direct reference-data or storage access outside adapters. Compatibility facades remain where required. |

The existing merge and sync tests are valuable assets, not candidates for replacement with simpler happy-path tests. Particularly important suites include `github-state-repository.test.js`, `components/sync-hook.test.jsx`, `route-registry.test.js`, and `components/route-registry-hook.test.jsx`.

Browser validation should retain the project’s default Chromium, WebKit, and mobile-emulation coverage. Firefox remains opt-in. Emulated WebKit must not be reported as physical-device Safari validation.

Introduce import gates early and tighten them incrementally:

- Domain and application modules cannot import presentation, browser globals, CSS, or Vite-only modules.
- Raw reference files are imported only by designated adapters.
- Personal storage and mutation access occur only through designated owners.
- Node entry points must load under Node 24 without bundler resolution.
- Gates must include negative fixtures proving forbidden dependencies are detected.

Use the installed TypeScript toolchain for dependency inspection where appropriate. Avoid adding a dependency merely to enforce a small graph.

I would **defer ADR-002’s shared GitHub transport extraction** until after orchestration is isolated. It combines two different persistence protocols and is not necessary to make the UI replaceable. If pursued, it deserves a separate compatibility-focused change and independent review.

**6. Risks and open decisions**

- **Older clients are the greatest compatibility risk.** Recommendation: freeze both remote formats and merge semantics during this work. Require mixed-version read/write tests before later evolution.
- **Identity changes can orphan personal records and break links.** Preserve IDs, legacy mappings, and slug behavior. Bibliographic corrections belong in separate reviewed changes.
- **Two owners during migration can duplicate writes.** Transfer ownership once per aggregate. Temporary adapters may translate calls, but must not independently persist the same change.
- **Validation can accidentally remove uncertain records.** Preserve evidence and unknown values. Architecture validation must not become an unapproved editorial cleanup.
- **Exact visual equivalence is not currently proven.** Establish reviewed baselines before substantial extraction. Current geometry and accessibility tests provide narrower evidence.
- **The future design remains unknown.** Build reusable queries around demonstrated needs. Do not preselect a new framework or invent a universal screen-description language.
- **Performance needs measurement.** The current catalogue size alone does not justify a backend, worker, or query library. Profile preparation, invalidation, and transferred resources before adding infrastructure.
- **Public synchronization is an existing product decision.** Keep its addresses and access model. Use synthetic personal fixtures; exclude credentials and real reading records from source, logs, static SEO, and architecture examples.
- **Rollback must preserve pending work.** Prefer code rollback with unchanged storage keys and wire formats. Any later storage migration requires a separate recovery contract.

The proposed migration is source-grounded, but its equivalence gates remain future work. No test, generated artifact, browser result, or live repository state was verified in this analysis.

