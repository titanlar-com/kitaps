# Motion architecture analysis: Claude

- Analyst: Claude Code, written before reading the Codex report.
- Code read: `main` at 3dff24c, 8 November 2026. Installed: React 19.3.0, Mantine 9.6.3, Vite 7.
- Brief: the same brief as `2026-11-08-motion-codex.md`. The two reports are synthesised in `docs/ADR-004-motion.md`.
- Binding input: the owner's motion policy in `AGENT.md`, one symmetric curve, `cubic-bezier(.65, 0, .35, 1)`.

## 1. What the site has today

| Kind | Where | State |
| --- | --- | --- |
| CSS transitions, about 18 | `src/styles.css`, `src/components/FilterSheet.css` | All use `--motion-fast` or `--motion-base` and `--motion-ease`. The gate in `tests/ui-gates.test.js` holds this. |
| Mantine's own transitions, written with `ease` | `node_modules/@mantine/core/styles/*.css` | A catch-all with `!important` (`src/styles.css:297`) forces the curve. Durations are set for only five selectors (`:299`), the rest stay at Mantine's 100 or 150 ms. |
| Mantine's own keyframes | Loader, Skeleton, Progress stripes, Indicator, RollingNumber | **Not covered.** `animation-timing-function` is not in the catch-all. The Loader bars run 1.2 s with `cubic-bezier(0, .5, .5, 1)`, Skeleton is linear. This is the different rhythm the owner noticed. |
| Mantine lifecycles | `src/app/theme.js:36-38`, `src/motion.js` | Fourteen components take `transitionProps` from the JS constants. |
| JS-driven | `Transition` for the toast (`src/App.jsx:175`), drag on the book sheet | Bound to `src/motion.js` by the gate. |
| HTML shell | `index.html` | Its own keyframes at 700 ms, a third rhythm. Only the curve is tied to the tokens. |

Gaps:

1. **Tokens name speed, not purpose.** `fast` and `base` do not say whether a value belongs to a hover, a panel or a page. A 90 dvh sheet and a tooltip both take 200 ms although one travels a hundred times further.
2. **Three hand-kept copies:** `styles.css`, `motion.js` and `index.html`. The gate compares two of them.
3. **The gate reads source only.** It cannot see what a third-party component actually runs. Nothing would have caught the Loader.
4. **Moments that matter do not move at all.** Changing section, opening a book and paging through the catalogue swap the page in one frame. Covers pop in when they load. Counts jump.

## 2. Technology

| Option | Fit for this stack | Verdict |
| --- | --- | --- |
| CSS transitions and keyframes | Already the base. Retarget natively from the current position, which is what the policy asks. | **Keep as the base.** |
| Mantine `Transition`, `Collapse`, `transitionProps` | Installed, handles exit lifecycle, takes duration and curve. | **Keep for enter and exit.** |
| React 19.3 `<ViewTransition>` | Stable since 19.3 (9 September 2026), already installed, no added bytes. Runs on same-document View Transitions: Chrome 111, Safari 18, Firefox 144. Only animates updates inside `startTransition`. | **Adopt for view changes and the shared cover.** A browser without it gets the instant change it has today. |
| Web Animations API | Native, cancellable. The gate already covers `.animate()`. | Keep for rare imperative cases, none needed yet. |
| `@starting-style`, `transition-behavior` | Baseline since August 2024, Firefox reports conflict on `display:none` entry. | Allowed for simple CSS-only entries. |
| `interpolate-size` | Verified only for Chrome and Edge 129. | **Do not rely on it.** Mantine `Collapse` already animates height. |
| Motion (motion.dev) | MIT, about 5 kB with LazyMotion for the first render, up to about 30 to 50 kB with layout animation. Default transitions are springs. | **Reject.** A second motion system next to Mantine, with its own adapter, for capabilities View Transitions already gives. |
| GSAP | Free since April 2025 under Webflow's no-charge licence, which restricts competing no-code tools. | **Reject.** Not an open-source licence, and the owner prefers open source. Imperative, heavy for this need. |
| react-spring | Physics curves. | **Reject.** Cannot honour the single-curve policy. |
| AutoAnimate | About 3 kB, list enter and exit. | **Reject.** Own timing to adapt, no need that View Transitions leaves open. |

Conclusion: **no new library.** Every need is covered by installed code and the platform. Adding a library would create a second source of timing, which is the problem being solved.

## 3. Architecture

**Token layers.** Primitive durations form a small scale (150, 200, 300 ms and a loop of 1200 ms). Semantic roles sit above them and components use only roles. A role answers "what is this moment", so a change of pace is one line.

| Role | Duration | Used for |
| --- | --- | --- |
| `feedback` | 150 ms | Hover, press, colour, focus-adjacent surfaces |
| `move` | 200 ms | Markers, chevrons, the cover lift, small displacements |
| `reveal` | 200 ms | Accordions, collapses, popovers, tooltips, toasts |
| `panel` | 300 ms | Drawers, sheets, dialogs. They travel far. |
| `view` | 200 ms | Section and page changes |
| `loop` | 1200 ms | Loading indicators |

Duration follows distance. The curve never changes.

**One source.** `src/motion.js` holds the table. `styles.css` carries the same values as custom properties, and `index.html` carries what the first paint needs. A generic gate walks the table and fails on any difference. A generator would add a build step for six values, so the comparison stays a test.

**Third-party adapter.** One block in `styles.css` binds Mantine's internal keyframes (`animation-timing-function`, `animation-duration`) the way `:297` binds its transitions. Only CSS, no custom JS.

**Runtime gate.** A Playwright audit walks the real pages and interactions and reads `document.getAnimations()`. Every running animation must use the approved curve and a duration from the scale. It sees what any component actually does, including future ones, which a source lint cannot. It needs checking in each engine, because transition and animation timing are reported in different places.

**Reduced motion.** The blanket rule at `styles.css:917` stays, and `::view-transition-*` pseudo-elements are added to it, because `*` does not match them. The loading bars then stand still and the words remain.

**Semantics stay instant.** `startTransition` delays only the visual swap. Pointer events on the transition overlay are turned off so that a click is never swallowed.

**Interruption.** CSS and Mantine retarget from the current position. A new View Transition skips the running one to its end state, which is acceptable for a whole-view change and must be recorded as a known limit.

## 4. Motion language: a calm reading desk

- Motion explains where something came from and where it went. It is never decoration.
- Pointer-driven surfaces answer quickly. Large surfaces travel slowly enough to be followed.
- **Things that move:** the section marker, a change of section (a soft crossfade), a book leaving the shelf (its cover travels into the detail page), a cover appearing when it loads (fades in), sheets and panels.
- **Things that never move:** text while it is being read, body layout, the page on load, anything on scroll except the header's shadow. No parallax, no bounce, no autoplaying loops other than a real wait.
- One thing moves at a time. No stagger across the catalogue grid, 24 cards arriving in sequence would be noise.

## 5. Decision and phases, each test first

1. **Roles and the source table.** `src/motion.js`, `styles.css`, the generic equality gate in `tests/ui-gates.test.js`.
2. **Third-party adapter and one rhythm for waiting.** Loader, Skeleton and the HTML shell share `loop`. `tests/e2e/loading.spec.js`.
3. **Runtime audit.** `tests/e2e/motion-audit.spec.js`.
4. **View change crossfade** with `<ViewTransition>`, navigation wrapped in `startTransition`, reduced-motion coverage, pointer events off.
5. **Book opening:** the cover as a shared element.
6. **Small moments:** covers fade in on load.

## Sources

- [React 19.3 announcement](https://react.dev/blog/2026/09/09/react-19-3)
- [What's new in view transitions (2025)](https://developer.chrome.com/blog/view-transitions-in-2025)
- [web.dev: new to the web platform in October 2025](https://web.dev/blog/web-platform-10-2025?hl=en)
- [web.dev: entry animations in Baseline](https://web.dev/blog/baseline-entry-animations?hl=en)
- [Chrome: animate to height auto](https://developer.chrome.com/docs/css-ui/animate-to-height-auto)
- [Motion: reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size)
- [Webflow: GSAP becomes free](https://webflow.com/blog/gsap-becomes-free)
- [Atlassian: applying motion](https://atlassian.design/foundations/motion/applying-motion)
- [PatternFly: motion](https://patternfly.org/design-foundations/motion)

Not verified: current Safari and Firefox status of `interpolate-size`, official Material 3 token values, and how each engine reports transition timing through `getAnimations()`. The last one is settled by the audit test itself.
