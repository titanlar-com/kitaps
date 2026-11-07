# Brief: a sustainable data architecture for Kitaplık (analysis only)

You are one of two independent analysts. The other analyst gets this same brief. Your report will be compared with theirs and synthesised into one architecture, so argue from evidence in the code and say plainly where you are unsure.

## The project

Kitaplık is a Turkish reading-catalogue web app. Canonical repo: titanlar-com/kitaps. Live site: https://titanlar-com.github.io/kitaps/. The working copy you read is the current `main`.

- Stack today: Vite, React 19, Mantine 9.6.3, @tabler/icons-react, plain CSS with tokens in `src/styles.css`. Node 24 runs the tests and strips TypeScript, so `.ts` files are imported directly. Python scripts in `scripts/` build `src/catalog.json` from `data/*.json` (`npm run data`).
- Personal data (reading marks, reading records, favourites, the reading queue, saved bookstore routes) syncs through a public GitHub repo, `titanlar-com/kitaps-state`, which acts as the app's database: `state.json` (schema 2) and `routes.json` (schema 1). See `src/state/` and `docs/ADR-001-reading-priority-and-state.md`.
- Static reference data: the catalogue (about 1000 books, categories, collections, groups, rankings), bookstores (`data/bookstores.json`), book fairs (`data/book-fairs.json`), notes and others.
- Earlier architecture work is in `docs/ADR-002-architecture.md` (modular monolith, `src/views.js` page table, pure functions, `catalogListing`, and others).

## What the owner asked (7 and 8 November 2026)

- The current UI looks bad, and a new UX-focused design will come later. The design language is NOT decided and NOT part of this task. It may be innovative or a classic Amazon/eBay-like shop. **Do not propose any visual design, layout, colours or components.**
- The UI technology may also change: React/Mantine might be replaced by something else. This is a possibility, not a decision.
- So, before any design work: rebuild the architecture of the **data that is delivered to the UI** from first principles, focused on sustainability. It must stay valid whatever the UI and its technology become.
- Design patterns, OOP, MVVM and MVC are important to the owner. Use them where they solve a real problem, and say where they do not.
- Strictly TDD first: no behaviour changes without a failing test first. Existing behaviour must be pinned by tests before anything moves.

## Constraints you must respect

- Owner rules in `AGENTS.md`:
  - page sizes 24/48/96/192/384, default 24;
  - grid 2/3/4 columns;
  - every page size divisible by every column count;
  - canonical addresses under titanlar-com.
  
  These change only with the owner.
- The URL contract (`?view=`, `?book=`, filters, legacy links) and the static SEO pages generated at build time must keep working. `src/library.js`, `src/seo.js` and what they import must run in plain Node (no JSX or CSS imports), because `scripts/generate-sitemap.mjs` and `scripts/generate-static-seo.mjs` use them.
- `state.json` and `routes.json` are read by other devices and by pages still open on older code. Their schemas can only evolve compatibly, with versioned migration. The three-way merge in `src/state/merge.ts` was just fixed after three review rounds. Treat it as high risk and do not redesign its rules. You may propose where it sits architecturally.
- Product is Turkish only. No i18n layer unless justified.
- Public repo: no secrets, tokens or personal data in files.
- Prefer the current stack and few dependencies. Any new library needs a concrete reason.
- Nothing visible may change during the data-architecture work: content, structure and look stay as they are until the new design arrives.

## What to do

Read the code; do not modify anything.
- Do not write, move or delete files.
- Do not run commands that change git state or install packages.
- Do not run tests that write output folders.

Suggested reading:
- `AGENTS.md`
- `docs/ADR-001-reading-priority-and-state.md`
- `docs/ADR-002-architecture.md`
- `src/` (all of it)
- `scripts/merge-data.py`
- the shape of `data/*.json` and `src/catalog.json`: they are large, so sample them with `jq`, `head` or `python3 -c`
- `tests/`
- `package.json`
- `.github/workflows/pages.yml`

## Report (in English, Markdown, about 2500–4000 words)

1. **Current data flow map.** Trace every data source to what the UI renders:
   - build-time: Python merge, `catalog.json`, SEO scripts;
   - load-time: static JSON, lazy pages;
   - runtime: derived lists, filters, rankings, personal state, sync, routes, `localStorage` settings.
   
   Name the modules and files. For each, say who owns the data and who mutates it.
2. **Gap analysis.** Back each finding with `file:line` evidence. Cover:
   - coupling between data and React/Mantine;
   - duplicated or implicit schemas;
   - derived data computed in components;
   - missing contracts or versioning;
   - testability;
   - what would break if the UI technology were replaced tomorrow;
   - what blocks a new design from getting the data it needs.
3. **Proposed architecture.** Cover:
   - layers and module boundaries;
   - the domain model (entities, value objects);
   - repositories and ports for every source;
   - application services or use cases (queries and commands);
   - framework-agnostic view models: how a UI of any technology subscribes and sends commands;
   - where MVVM, MVC, OOP, Repository, Strategy, Observer, Adapter or other patterns apply, and where they would be over-engineering.
   
   Give the key interfaces as TypeScript signatures. Say how the current React UI would bind to them (one adapter) without visible change. Also say how static SEO generation reuses the same core.
4. **Data contracts.**
   - The catalogue schema and its versioning, from the Python build to the runtime.
   - The view-model contracts a UI receives: which "screens' data" exist today, and what a new design could need.
   - How contracts are validated: runtime validation or type-only, and at which boundaries.
5. **TDD-first migration plan.** Cover:
   - strangler steps in order, each shippable alone with all tests green;
   - for each step: the tests to write first (characterization, unit, contract, component, e2e), the gate that proves no visible change, and done criteria;
   - import or boundary gates that keep the architecture from decaying.
6. **Risks and open decisions,** each with your recommendation.

Be concrete and decisive. Where you deliberately disagree with ADR-002, say so and why.
