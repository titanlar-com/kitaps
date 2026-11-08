# Motion architecture analysis: Codex

- Analyst: Codex CLI 0.153.4, model gpt-6-astra, read-only sandbox, web search on.
- Code read: `main` at 3dff24c, 8 November 2026.
- Brief: the same brief as the Claude analysis (`2026-11-08-motion-claude.md`). The two reports were written independently and are synthesised in `docs/ADR-004-motion.md`.
- The report below is unchanged. It is in English because the brief was.

---

# Kitaplık motion architecture report

**Recommendation: keep CSS transitions and Mantine as the motion foundation. Add no animation dependency now.** Consolidate the existing tokens into one source, adapt Mantine’s actual animated elements, and extend the gates to cover keyframes, interruption and component lifecycle.

The main problem is incomplete coordination between existing mechanisms. Adding another animation engine would leave the loader mismatch and lifecycle gaps unresolved.

## 1. Scope and verification

This analysis covers checkout `3dff24cf29ad45ca4f3c4e62e84c86bfa2c652e9`, inspected on **8 November 2026**.

Verified locally:

- Manifest, lockfile and installed packages.
- The binding motion policy, project instructions and requested architecture documents.
- Application styles, components and relevant Mantine internals.
- Fifteen focused Node tests, all passing.
- A production Vite build performed entirely in memory, with `write:false`, followed by gzip measurement.

The installed versions are more specific than the project description:

| Package | Manifest | Lockfile and installed |
|---|---|---|
| React and React DOM | `^19.1.0` | **19.3.0** |
| Mantine core and hooks | `9.6.3` | **9.6.3** |
| Vite | `^7.0.0` | **7.3.6** |
| Playwright | `^1.63.0` | **1.63.0** |
| Vitest | `^5.0.2` | **5.0.2** |

Node was **24.21.0**. Installed Mantine declares React and React DOM `^19.2.0`, which the installed React satisfies.

**Not verified:** browser behaviour, physical devices, live deployment parity, performance traces, or the incremental production bundle cost of uninstalled libraries. No browser tests were run, including Firefox.

No files were changed. The initial and final Git status both showed only the existing untracked `node_modules` symlink.

## 2. Current motion inventory

Paths below are relative to the checkout. Principal sources are [styles.css](/Users/w6x/Documents/Codex/2026-09-26/https-reactbits-dev-https-reactbits-dev/outputs/kitaps/.claude/worktrees/redesign/src/styles.css:62), [motion.js](/Users/w6x/Documents/Codex/2026-09-26/https-reactbits-dev-https-reactbits-dev/outputs/kitaps/.claude/worktrees/redesign/src/motion.js:1), [theme.js](/Users/w6x/Documents/Codex/2026-09-26/https-reactbits-dev-https-reactbits-dev/outputs/kitaps/.claude/worktrees/redesign/src/app/theme.js:7) and [App.jsx](/Users/w6x/Documents/Codex/2026-09-26/https-reactbits-dev-https-reactbits-dev/outputs/kitaps/.claude/worktrees/redesign/src/App.jsx:53).

### Application motion

| Motion | Implementation and location | Assessment |
|---|---|---|
| Shared timing | `src/styles.css:64–66`; `src/motion.js:4–10` | Approved curve, 150 ms and 200 ms. Values are duplicated and checked for equality. They are not generated from one source. |
| Initial loading bars | `index.html:18–26` | CSS keyframes, 700 ms per alternating leg, positive delays of 150/300 ms, `scaleY(.4)` to `scaleY(1)`. Curve is correct, but timing and movement differ from Mantine. |
| Lazy-page loading | `src/components/PageLoading.jsx:6–9`; `src/App.jsx:204–206` | Mantine bars loader. Its internal animation bypasses the project’s transition overrides. |
| Button loading | `GitHubSyncPanel.jsx:47`; `SyncMergeDialog.jsx:37–38` | Mantine animates the loading presentation and renders the same bars loader. These states therefore inherit the loader inconsistency. |
| Control feedback | `src/styles.css:285,307,394,569,741,961`; `FilterSheet.css:29,51`; `FooterMenu.css:4,20` | Colour, background, border, shadow and opacity transitions generally use the project tokens. |
| Sticky-header elevation | `src/App.jsx:83–85`; `src/styles.css:348–350` | Scroll toggles an attribute. CSS transitions shadow and border over 200 ms. No per-frame React update. |
| Cover hover lift | `src/styles.css:504,514,542–544` | Image and marks move up 3 px over 200 ms. The hit area remains stationary. Distance and hover shadow are local literals. Hover lift itself is not capability-gated. |
| Cover-action reveal | `src/styles.css:569–576` | Opacity reveal over 150 ms on hover or focus-within, restricted to fine-pointer hover environments. |
| Disclosure | `ReadingPrioritySummary.jsx:14`; `src/styles.css:466–467`; Accordion consumers in `Collections`, `BookDetail`, `BookDiscovery`, `EditionGuide`, `NotesPage` | Mantine height/opacity transitions and rotating chevrons. Theme supplies duration and Collapse easing. |
| Selection indicators | `src/App.jsx:86–90,179`; `BookFairsPage.jsx:55` | FloatingIndicator and SegmentedControl animate measured position and size. Theme supplies 200 ms. |
| Progress | `src/styles.css:632`; `ReadingPanel.jsx:24`; `ReadingSummary.jsx:32`; `ReadingPriorityCard.jsx:8–9` | Pagination width uses 200 ms. Mantine progress sections are overridden to 150 ms. No animated stripes are requested. |
| Drawers | `BookSheet.jsx:23`; `FilterSheet.jsx:95`; `FooterMenu.jsx:18` | Mantine owns enter/exit. Book and filter sheets additionally pass the reduced-motion-aware helper. |
| Modals and floating panels | `src/App.jsx:226–227`; `TranslationStatus.jsx:14`; `CatalogPagination.jsx:25`; selects and tooltips | Mantine transition props generally supply the curve and 200 ms. Movement shape still follows component presets. |
| Purchase notification | `src/App.jsx:55,94–105,175`; `LibraryToast.jsx:9–30` | Opacity plus an 8 px translation, 200 ms both ways. Exit retains content and makes it inert. Focus obstruction triggers an explicit immediate-removal exception. |
| Sheet drag | `BookSheet.jsx:13–24` | Pointer events update an offset directly. Transition duration becomes zero during direct manipulation. Release clears the offset and may close the sheet. Handoff continuity needs browser evidence. |
| Scrolling | `src/styles.css:206`; `BookstoresPage.jsx:28`; `focusMode.js:22` | Global smooth scrolling uses browser-selected timing. Most route and pagination scrolls explicitly use `instant`. |
| Route and content replacement | `src/App.jsx:108–118,154–161,186–206` | No route transition or shared-element engine. Results, views and text are replaced through ordinary React updates. |
| Reduced motion | `src/styles.css:917–919`; `index.html:26`; `src/app/theme.js:17` | CSS stops transitions and animations, including pseudo-elements. Mantine also receives `respectReducedMotion:true`. Mid-flight lifecycle handling remains untested. |

There is **no application-authored WAAPI animation, GSAP, Motion, react-spring or AutoAnimate implementation**. Application `requestAnimationFrame` calls primarily handle focus and measurement.

### Mantine internals

The entire Mantine stylesheet is imported at `src/App.jsx:4`. Its shipped animations must be distinguished from those actually activated by this application.

| Mantine surface | Installed source | Behaviour |
|---|---|---|
| Bars loader, active | `node_modules/@mantine/core/styles.css:981–1017` | **1,200 ms**, `cubic-bezier(0, .5, .5, 1)`, delays **−240/−120/0 ms**. Scales from `.6` and fades from zero opacity, reaching full scale at 50%. |
| Dots loader, inactive | Same file, `1021–1053` | 800 ms, `linear`, staggered scaling/opacity. |
| Oval loader, inactive | Same file, `1057–1082` | 1,200 ms, `linear`, rotating pseudo-element. |
| Checkbox, active in route planner | Same file, `2983–2985,3050–3052` | 100 ms colour, transform and opacity transitions. Project easing applies where static Mantine classes exist, but these durations remain vendor literals. |
| Switch, active | Same file, `7936–7938,7994,8037` | 150 ms track, thumb and label transitions. Duration happens to match the project’s fast token but does not consume it. |
| Button loading presentation, active | Same file, `3481–3483,3529–3531`; `esm/components/Button/Button.mjs:81–93` | Internal CSS plus a hard-coded 150 ms `Transition`. The project overrides some CSS surfaces, not every internal lifecycle value. |
| FloatingIndicator, active | Same file, `1789–1801`; `esm/components/FloatingIndicator/use-floating-indicator.mjs:41–47,93–95` | CSS position/size transitions; temporary zero duration during measurement and resize, plus initialization timers. These require narrow treatment as positioning operations. |
| Skeleton, currently unused | Same file, `7194–7215` | 1,500 ms linear opacity loop on `::after`. Theme radius configuration does not adapt its animation. |
| Processing Indicator, unused | Same file, `4917–4979` | 1,000 ms linear expanding/fading pulse. |
| Animated Progress stripes, unused | Same file, `6192–6209,6268–6269,6304` | 1,000 ms linear background movement. |
| Marquee, unused | Same file, `5089–5116,5189–5209` | Horizontal/vertical linear loops. |
| Rolling number, unused | Same file, `6676–6722` | Variable-driven width/opacity transitions and rolling keyframes. No project adapter exists. |

Mantine bars contain children with hashed classes only:

`node_modules/@mantine/core/esm/components/Loader/loaders/Bars.mjs:7–14`.

Consequently, the broad selector at `src/styles.css:297` has two limitations:

1. It sets **transition** timing, whereas loaders use **animation** timing.
2. It does not select those hashed-only children.

Setting the easing on `.mantine-Loader-root` would also be insufficient because animation timing is not inherited.

### Findings that matter most

**1. The loader discrepancy is confirmed in source.**  
The shell and Mantine differ in curve, duration, phase offsets, direction, scaling axis and opacity. Matching only the duration would not make them consistent.

Retain Mantine’s Loader and animation implementation, but adapt the actual bars’ timing through CSS. Align the shell’s presentation with that adapted implementation. This requires no custom JavaScript animation.

**2. The motion contract is distributed across three sources.**  
CSS, JavaScript and HTML contain independently authored values. Equality tests help, but the shell’s duration and delays are outside those tests. `docs/UI-REDESIGN.md:19` also says “one curve and duration”, although the implementation already has two durations.

**3. Several component lifecycles bypass intended motion.**

- `src/app/BookDetail.jsx:28–29` ties `opened` and content existence to the same `b` value. Clearing the route removes the content before the Drawer’s exit finishes.
- `SyncMergeDialog.jsx:13,30` conditionally mounts a Modal with `opened` already true and removes it when the prompt disappears. Installed `Transition` initializes mounted content as entered. This bypasses the ordinary false-to-true entrance and true-to-false exit lifecycle.
- `src/App.jsx:172,226` restores sync-dialog focus in `onExitTransitionEnd`. That explicitly ties focus restoration to animation completion, contrary to the immediate-focus policy.
- Installed `ModalBaseContent.mjs:29–38` disables its focus trap when closed but retains dialog semantics during the visual exit. The application needs tests for focusability and accessibility exposure during that interval.

These are source findings. Their visible effects have not been reproduced in a browser during this review.

**4. Browser smooth scrolling cannot promise the approved curve.**  
`scroll-behavior:smooth` leaves easing and duration to the browser. Remove it from application-triggered navigation and focus recovery. Immediate scrolling is appropriate for those correctness operations. Leave ordinary user scrolling to the browser. [MDN scroll behaviour](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-behavior)

**5. Gates currently prove less than their names suggest.**

In [tests/ui-gates.test.js](/Users/w6x/Documents/Codex/2026-09-26/https-reactbits-dev-https-reactbits-dev/outputs/kitaps/.claude/worktrees/redesign/tests/ui-gates.test.js:141):

- Source collection covers `src/`, excluding HTML and vendor CSS.
- The parser skips `@keyframes` bodies.
- `animation:none` is allowed outside reduced motion.
- Token references are checked without fully validating their resolved duration.
- JavaScript checks are pattern-based and can miss indirection.
- The drag exception is removed by exact string replacement.

`tests/theme.test.js:36–58` checks selected theme defaults but excludes Loader and the active Checkbox/Switch internals.

`tests/e2e/ui-quality.spec.js:217–242` checks a button, two internal transition surfaces, press stability and one reduced-motion result. It does not establish loader cadence, both-direction completion, rapid reversal or immediate semantics.

## 3. Technology comparison

### Versions, maintenance and stack fit

These are the current versions evidenced by the linked sources. Registry downloads were unavailable, so this is not a complete npm registry audit.

| Option | Version and maintenance evidence | Licence | Fit |
|---|---|---|---|
| CSS | Browser platform, continuously maintained | No added package licence | Best foundation for control feedback and existing surfaces. |
| Web Animations API | Browser platform | No added package licence | Framework-independent. Useful for a specific imperative animation needing explicit cancellation or reversal. |
| Mantine | Installed **9.6.3**; current documentation shows **9.7.5** | MIT | Existing component lifecycle, accessibility and theme integration. Inspect the installed version rather than assuming current docs describe it exactly. [Transition](https://mantine.dev/core/transition/) |
| Motion | **14.10.1**, changelog dated 5 November 2026; React peers include 19 | MIT core | Good React integration, presence and layout tools. Mantine would still own modal semantics. Requires careful separation of transform ownership. [Package](https://raw.githubusercontent.com/motiondivision/motion/main/packages/motion/package.json), [changelog](https://raw.githubusercontent.com/motiondivision/motion/main/CHANGELOG.md), [licence](https://github.com/motiondivision/motion/blob/main/LICENSE.md) |
| GSAP | **3.15.1**, repository update 4 November 2026 | Standard “No Charge” licence, **not MIT or unrestricted open source** | Strong timelines and imperative control. React integration provides cleanup. Its scope and licence restrictions make it a poor default here. [Version](https://raw.githubusercontent.com/greensock/GSAP/master/package.json), [React integration](https://gsap.com/resources/React/), [licence](https://gsap.com/community/standard-license/) |
| react-spring | Stable **10.1.2**; 11 beta also present. Version 10.1.2 explicitly accepts React 19 | MIT | Technically compatible, but its central spring model conflicts with the required fixed curve. [Releases](https://github.com/pmndrs/react-spring/releases), [versioned package](https://raw.githubusercontent.com/pmndrs/react-spring/v10.1.2/targets/web/package.json) |
| AutoAnimate | **0.10.2**, released 6 November 2026 | MIT | React hook and DOM integration exist. Automatic child movement is poorly matched to a tightly controlled catalogue and Mantine overlays. [Releases](https://github.com/formkit/auto-animate/releases), [usage](https://auto-animate.formkit.com/) |
| Browser View Transitions | Platform API with independently evolving features | No added package licence | Useful for snapshots and shared elements. Does not replace ordinary component transitions. |
| React ViewTransition | **Stable in React 19.3**, already installed here | React’s MIT licence | Available without upgrading React. Availability does not resolve its interruption-policy mismatch. [React 19.3 announcement](https://react.dev/blog/2026/09/09/react-19-3) |

GSAP currently permits ordinary commercial website use without charge, but its field-of-use restrictions distinguish it from the MIT alternatives. Public source availability should not be confused with an unrestricted open-source licence.

### Behaviour and policy compatibility

| Option | Interruption | Reduced motion | Single-curve verdict |
|---|---|---|---|
| **CSS transitions** | Native transitions retarget from the current interpolated value. Reversal can shorten the remaining duration. Keyframe animations do not automatically provide equivalent retargeting. | Explicit media query, responsive to preference changes. | **Accept.** Use the exact cubic token and explicit properties on the base state. [CSS transition specification](https://drafts.csswg.org/css-transitions-1/) |
| **WAAPI** | `reverse()` can reverse an existing animation. Retargeting requires preserving the current presentation before cancelling/replacing it. Cancellation alone can snap back. | Explicit preference handling and cleanup required. | **Accept for a demonstrated gap.** Use the same easing string and millisecond tokens. Do not build a general engine around it. [WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API), [reverse](https://developer.mozilla.org/en-US/docs/Web/API/Animation/reverse) |
| **Mantine** | CSS interpolation plus component lifecycle. Installed Transition cancels pending timers/frames, but current-position reversal still needs behavioural tests. | Theme support exists; the site also has CSS overrides. Preference changes during an active lifecycle need testing. | **Accept with adapters and tests.** Theme props alone do not cover internal CSS, keyframes or hard-coded transitions. |
| **Motion** | Supports retargetable animations and presence/layout ownership. Do not use queued exit-before-enter sequences for responsive controls. | `MotionConfig reducedMotion="user"` must be enabled. It suppresses transform/layout motion, while opacity can remain. | **Adaptable.** Explicit `type:"tween"` and `ease:[.65,0,.35,1]`; reject spring/inertia defaults and arbitrary local overrides. [Transitions](https://motion.dev/docs/react-transitions), [MotionConfig](https://motion.dev/docs/react-motion-config) |
| **GSAP** | Reversible timelines and overwrite control. New tweens should begin from current values; default overwrite is false. | Explicit `matchMedia` handling. | **Adaptable.** Register `CustomEase` from the exact control points. Named power eases are not substitutes. [CustomEase](https://gsap.com/docs/v3/Eases/CustomEase/), [overwrite](https://gsap.com/docs/v3/GSAP/gsap.to%28%29/), [matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/) |
| **react-spring** | Controllers can retarget active values. The attraction of continuous spring velocity is largely lost under this policy. | `useReducedMotion` is provided and should be installed at the application root. | **Adaptable but disproportionate.** Requires duration mode plus a function implementing the exact cubic Bézier. `easeInOutCubic` is not necessarily that Bézier. [Configuration](https://www.react-spring.dev/docs/advanced/config), [reduced motion](https://www.react-spring.dev/docs/utilities/use-reduced-motion) |
| **AutoAnimate** | Cancels existing animations and operates from stored geometry. Seamless rapid reversal is not established. | Default setup checks preference. The reviewed core checks it at initialization; plugins bypass that default check. | **Reject as configured.** Version 0.10.2 hard-codes `ease-in` for additions and `ease-out` for removals; the supplied easing governs movement. Compliance needs custom plugins and live preference handling. [Versioned source](https://raw.githubusercontent.com/formkit/auto-animate/v0.10.2/src/index.ts) |
| **Browser View Transitions** | Snapshot transitions have a different interruption model. Skipping finishes the visual transition rather than smoothly retargeting its current picture. | Explicit pseudo-element rules or skipping required. | **Reject as the general motion foundation.** The curve is configurable, but the current-position interruption requirement is not automatically met. [skipTransition](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition/skipTransition) |
| **React ViewTransition** | React documents waiting for an active transition, then batching subsequent destinations. | React explicitly does not disable it automatically for reduced motion. | **Reject for this plan.** Waiting and batching conflict with the owner’s immediate redirection requirement. [React reference](https://react.dev/reference/react/ViewTransition) |

For every external engine, React compatibility is separate from Mantine integration. Animating the same `transform` or opacity property through both engines creates competing ownership.

### Browser support and modern CSS

The following are compatibility-data findings, not tests of this site.

| Feature | Chrome | Safari | Firefox | Decision |
|---|---:|---:|---:|---|
| Ordinary transitions/keyframes and cubic easing | Supported | Supported | Supported | Baseline mechanism. |
| `@starting-style` | 117+ | 17.5+ | 129+ | Useful for entry presentation, but does not retain React content for exit. |
| `transition-behavior` | 117+ | 17.4+ | 129+, partial | Do not equate property support with support for transitioning `display`. |
| Discrete `display` transitions | 117+ | 18+ | Not supported in reviewed data | Cannot be the sole cross-browser exit mechanism. |
| `interpolate-size` | 129+ | Not supported in reviewed data | Not supported in reviewed data | Do not replace Mantine Collapse with it. |
| `linear()` easing function | 113+ | 17.2+ | 112+ | Piecewise easing can approximate complex curves, but is unnecessary and outside this exact-curve contract. |
| `Element.animate()` | 36+ | 13.1+ | 48+ | Available across the relevant modern engines. Check additional methods separately. |
| Same-document View Transitions | 111+ | 18+ | 144+ | Basic support exists; this does not establish all subfeatures. |
| View Transition options/types | 125+ | 18.2+ | 147+ | Relevant to framework integrations. |
| Cross-document View Transitions | 126+ | 18.2+ | Preview in reviewed data | Not a baseline for the application. |

Sources: MDN compatibility data for [starting styles](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/starting-style.json), [discrete transitions](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/transition-behavior.json), [intrinsic size](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/interpolate-size.json), [easing functions](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/types/easing-function.json), [Element animation](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Element.json), [document transitions](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Document.json) and [cross-document transitions](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/view-transition.json).

Additional library support:

- Mantine currently documents Chromium 108+, Safari 15.4+ and Firefox 101+. These are library claims, not Kitaplık’s complete support floor. [Mantine browser support](https://mantine.dev/browser-support/)
- Motion documents modern-browser support, including the relevant browser families. Exact minimum versions were not established. [Motion FAQ](https://motion.dev/docs/faqs)
- GSAP advertises all major browsers. Exact current minimum versions were not established.
- react-spring’s current precise browser-version matrix was not verified.
- AutoAnimate depends on browser animation and observer APIs. Modern Chrome, Safari and Firefox provide the relevant foundations, but exact version floors and this site’s behaviour were not verified.

### Measured payload cost

I invoked the existing Vite configuration through its API, with file writing disabled. I did **not** run `npm run build`, because that also regenerates tracked SEO output.

Measurements use Node `gzipSync`, level 9. Units are decimal kB.

| Current initial asset group | Gzipped size |
|---|---:|
| Application JavaScript | 60.46 kB |
| React JavaScript | 69.05 kB |
| Mantine JavaScript | 98.16 kB |
| Icons JavaScript | 4.11 kB |
| **Initial executable JavaScript subtotal** | **231.78 kB** |
| Catalogue data JavaScript | 347.98 kB |
| **Initial JavaScript including catalogue** | **579.76 kB** |
| Initial application and Mantine CSS | 47.96 kB |
| **Initial JavaScript and CSS subtotal** | **627.71 kB** |

This excludes images, fonts, HTML and later lazy chunks. It is compressed artifact size, not measured GitHub Pages transfer size.

| Choice | Additional cost against this site |
|---|---|
| CSS or native WAAPI | No external engine payload. Application CSS/adapter changes still have a cost, not yet implemented or measured. |
| Existing Mantine mechanisms | No new library required. The 98.16 kB Mantine chunk is already present. |
| Browser View Transitions | No external engine payload. Application integration cost unmeasured. |
| React ViewTransition | React 19.3 is already present. Integration delta unmeasured. |
| Motion | **Site-specific delta not verified.** Published figures are approximately 3.3 kB for React mini, 23 kB for hybrid and 43 kB for the full motion component. Relative to this site’s executable-JS baseline, those are roughly 1.4%, 9.9% and 18.6%. |
| GSAP, react-spring, AutoAnimate | **Site-specific delta not verified.** No defensible current production-build measurements were obtained. |

Motion’s figures are publisher guidance, not measurements of version 14.10.1 integrated here. LazyMotion’s small initial wrapper also excludes subsequently loaded features. [Motion bundle guidance](https://motion.dev/docs/react-reduce-bundle-size)

Before adopting any package, compare identical production builds of one representative feature, counting added shared chunks, CSS, adapters and deferred chunks. Package archive sizes and whole-package bundle estimators are insufficient.

## 4. Sustainable architecture

### One source, a small vocabulary

Extend existing `src/motion.js` into the canonical source. Keep the existing structure instead of introducing a framework-neutral animation service.

Use two levels:

1. **Primitives:** exact curve, 150/200 ms durations, busy-loop duration, phase offsets, zero default delay and small movement distances.
2. **Semantic roles:** control feedback, disclosure, overlay, progress and busy indication.

Components select a role. They should not choose arbitrary durations or alternative curves.

A compact initial vocabulary is sufficient:

| Role | Proposed timing | Purpose |
|---|---:|---|
| `control` | 150 ms | Hover, selected surfaces, checkbox/switch decoration and small feedback. |
| `disclosure` | 200 ms | Accordion height, chevron and related reveal. |
| `overlay` | 200 ms | Drawer, dialog and popover enter/exit. |
| `feedback` | 200 ms | Purchase notification. |
| `progress` | 200 ms | Presentation of a newly calculated progress value. |
| `busy` | 1,200 ms cycle | Mantine loading bars, with shared phase offsets. |
| `hintDelay` | 250 ms | Pointer hover intent only. Never delays focus, input or semantic state. |

All finite entrance and exit motions use the same approved curve and positive duration. The busy cycle has a different purpose and timescale, while retaining the same curve.

The current document’s “one duration” wording should be reconciled with these roles. It should not force a loading loop to run at button speed.

### Delivery to CSS, JavaScript, Mantine and the shell

Use the existing Vite HTML transformation mechanism:

```text
src/motion.js
    ├── JavaScript consumers
    ├── src/app/theme.js
    └── Vite HTML transform
            └── initial :root motion variables
                    ├── index.html loader
                    ├── src/styles.css
                    └── Mantine CSS adapters, including portals
```

The HTML transformation must run for development, normal production and standalone export. Tokens must exist in the first response, before React executes.

This avoids runtime computed-style parsing and hand-maintained copies. A small pure serializer in the existing motion module is enough.

Keep vendor adaptations in one clearly named section of `src/styles.css`:

- Use supported props for Transition, Collapse and indicator timing.
- Target actual animated child elements and pseudo-elements where props do not reach them.
- Prefer stable exported classes or explicit adapter classes over copied hashed selectors.
- Document any dependency on internal markup and test it during Mantine upgrades.
- Never compensate for lifecycle problems by changing CSS duration alone. CSS and unmount timing must agree.

Motion remains in the presentation layer. It must not enter `src/core`, state merging, persistence or catalogue queries. This follows [ADR 003](/Users/w6x/Documents/Codex/2026-09-26/https-reactbits-dev-https-reactbits-dev/outputs/kitaps/.claude/worktrees/redesign/docs/ADR-003-data-architecture.md:38).

### Lifecycle and interruption

Maintain three distinct concepts:

- **Actual state:** selected book, open/closed, checked value, saved record.
- **Retained presentation:** the last content needed to finish an exit.
- **Animation lifecycle:** entering, entered, exiting, removed.

Actual state changes immediately. Retained content must not remain interactive or misleading to assistive technology.

Apply that distinction narrowly to BookDetail and SyncMergeDialog. Do not introduce a global presence manager.

Use Mantine’s callbacks for presentation cleanup. Restore focus at the appropriate close action or commit, rather than waiting 200 ms. Preserve nested-dialog Escape handling with a regression test.

For interruption:

- Reuse CSS transitions for current-value retargeting.
- Preserve node identity during reversal.
- Prevent a stale completion callback from clearing a newly opened item.
- Test dragging, release, cancellation and immediate reopening.
- If a specific Mantine behaviour cannot pass, investigate its supported API first. A narrowly scoped WAAPI adapter is the fallback, not a second application-wide engine.

### Layout, choreography and navigation

- Keep Mantine Collapse for measured height. Avoid oversized `max-height` tricks, whose visible duration depends on content height.
- Test height changes while content loads or wraps at large text sizes.
- Open a panel, its backdrop and its heading together. Serial choreography would delay access.
- Do not stagger 24–384 catalogue cards. Search and filtering should reveal their results immediately.
- Loading-bar phase offsets are justified choreography. A site-wide timing scheduler is unnecessary.
- Keep route state, counts and reading data immediate. Existing tab-indicator motion supplies orientation.
- Defer shared-cover transitions. They would add duplicate-image, portal, aspect-ratio and cancellation problems without an established user need.

### Reduced motion and performance

Keep both CSS media-query handling and Mantine’s reduced-motion support. Test preference changes while a panel is moving or a loader is active.

The reduced-motion state should show static bars and the loading message. It must not leave content invisible, focus trapped or cleanup waiting for an event that no longer fires.

Performance rules should be concrete:

- Prefer opacity and transform for decorative movement.
- Permit height animation only where disclosure requires layout.
- Keep cover geometry and control hit areas fixed.
- Avoid animation-wide `transition:all`, persistent `will-change`, per-frame React state and unnecessary timers.
- Do not animate the entire catalogue or apply looping motion to idle content.
- Retain immediate data and ARIA updates even when presentation animates.
- Measure representative interactions before setting numerical frame-time budgets. No device performance baseline was established in this review.

## 5. Proposed motion language

The existing “reading desk” design direction is appropriate. Motion should help readers locate changes while leaving books and text easy to scan.

| Moment | Rule |
|---|---|
| Pointer enters a control | Transition its surface or colour over 150 ms. Preserve its position and dimensions. |
| Pointer leaves | Return over the same role and curve. Rapid reversal starts from the current presentation. |
| Book cover hover | Keep the existing small 3 px decorative lift, centralise its distance, and restrict it to hover-capable input. The cover button stays fixed. |
| Selection changes | Update selection and ARIA immediately. Animate only the decorative thumb, marker or surface. |
| Accordion opens/closes | Height and chevron move together over 200 ms. No delayed text appearance. |
| Drawer opens/closes | Keep its directional relationship to the screen edge, using 200 ms both ways. |
| Dialog or popover appears | Prefer a restrained fade. Avoid Mantine’s relatively conspicuous scale/translation preset where it adds no orientation value. |
| Purchase succeeds | Show the real result immediately. Present the notification with its existing short movement and 200 ms transition. |
| Progress changes | Update the number immediately and interpolate the bar over 200 ms. |
| Search, filter or page changes | Render correct content immediately. Avoid cascading entrances, count-up animations and travelling cards. |
| Loading | Use one bars rhythm across the HTML shell, page fallback and button loading. Keep the explanatory text steady. Never delay completion to finish a loop. |
| Focus, typing and validation | Apply immediately. Do not fade the focus indicator, caret or input text. |
| Reduced motion | Remove decorative movement and loops, retaining state, text and usable focus. |

The 150/200 ms choices preserve the current timing scale and limit the scope of aesthetic change. The loader’s 1,200 ms cycle preserves Mantine’s existing cadence while bringing its easing and shell counterpart under the same contract.

## 6. Enforcement and phased test-first plan

### Phase 1: make the known gaps fail

Change tests before implementation.

| File | Proposed test names or additions |
|---|---|
| `tests/ui-gates.test.js` | `rejects invalid resolved motion tokens`; `checks HTML styles and keyframe declarations`; `rejects unscoped animation suppression`; `rejects unapproved motion entry points` |
| `tests/first-load.test.js` | `shell loading timing comes from the canonical motion source` |
| `tests/theme.test.js` | Extend coverage to used internal surfaces and semantic role mappings. |
| `tests/e2e/loading.spec.js` | `shell page and button loaders share curve cycle and phase`; `loading remains understandable with reduced motion` |
| `tests/e2e/motion-policy.spec.js` | New focused behavioural coverage described below. |
| `playwright.config.js` | Add the new spec to both `layoutChecks.testMatch` and its `grep`, so WebKit and the iPhone project actually execute it. |

The source gate should inspect declarations and syntax rather than depend on growing regex exceptions. Validate:

- Exact easing.
- Finite, positive, bounded durations.
- Named, justified delays.
- Base-state transitions.
- Explicit property lists.
- Keyframe-level timing overrides.
- Conditional exceptions.
- CSS variables that resolve to invalid or missing values.

Do not lint every inactive vendor rule as though it runs. Instead, test the vendor surfaces used by the application and require coverage before introducing another animated component.

### Phase 2: unify tokens and loading

Files:

- `src/motion.js`
- `vite.config.js`
- `index.html`
- `src/styles.css`
- `src/app/theme.js`

Implement the canonical values and HTML delivery. Adapt Mantine bars through CSS while retaining its component and animation implementation. Align the shell’s loader movement and timing with the adapted bars.

The shell’s unavoidable pre-React animation should be checked against the Mantine counterpart, including effective keyframes, direction and phase. Matching only `animation-duration` is insufficient.

### Phase 3: repair lifecycle and semantics

Files:

- `src/app/BookDetail.jsx`
- `src/components/BookSheet.jsx`
- `src/components/SyncMergeDialog.jsx`
- `src/App.jsx`
- Relevant Vitest component tests.

Add behavioural regressions:

- `book content remains visible but inert until exit completes`
- `merge dialog enters and exits through its lifecycle`
- `closing sync restores focus before visual exit completes`
- `reopening cancels stale exit cleanup`
- `sheet release continues from the dragged position`
- `reduced motion during exit does not strand retained content`

Keep persistence, merge rules and route identity outside animation callbacks.

### Phase 4: complete the used-component adapters

Cover Checkbox, Switch, button-loading internals, progress, FloatingIndicator, Accordion, Collapse and portal surfaces.

Add computed-style tests that inspect:

- Each active transition property.
- Child elements and pseudo-elements.
- Animation duration, easing, delay, direction and iteration count.
- Both themes and reduced motion.

Add behavioural tests:

- `controls reverse without resetting their presentation`
- `disclosures reverse while partly open`
- `selected checked and expanded semantics update immediately`
- `control hit areas remain fixed`
- `closed presentation cannot receive focus`
- `focus recovery does not use browser smooth scrolling`

A computed duration alone does not prove that a transition occurred. Sample intermediate presentation and the final state.

### Phase 5: acceptance and documentation

Begin at **320 CSS px**, then cover the existing product widths and relevant overlay/landscape states. Run Chromium, WebKit and the iPhone profile. **Do not add Firefox execution.**

For motion review, capture fixed intermediate frames alongside a short trace or recording. A settled screenshot cannot establish rhythm or interruption quality.

Future implementation checks should include:

```sh
TZ=UTC npm test
npm run typecheck
npm run build
E2E_PORT=4517 npm run test:e2e -- tests/e2e/motion-policy.spec.js tests/e2e/loading.spec.js tests/e2e/ui-quality.spec.js
```

Then run the existing relevant lifecycle, focus and grid regressions. Meaningful UI delivery should receive the project’s independent QA review.

Update `docs/UI-REDESIGN.md`, `docs/UX-VALIDATION.md` and `AGENTS.md` with the implemented roles, adapter locations, exceptions and actual gate commands. Keep this within the existing documentation structure.

## 7. Decision and rejected alternatives

**Adopt:** CSS transitions, existing Mantine lifecycle components, one canonical motion source and targeted adapters.

**Reserve:** native WAAPI for a specific interruption problem that the existing mechanisms demonstrably cannot solve.

**Defer Motion:** it is the strongest external candidate if the product later needs substantial shared-element or layout animation. Today, its benefits do not justify another runtime and another set of lifecycle rules.

**Reject GSAP for this scope:** timeline capabilities exceed the need, React ownership requires more care, and the licence is less aligned with the owner’s open-source preference.

**Reject react-spring for this scope:** enforcing a fixed Bézier removes the main reason to choose a spring engine.

**Reject AutoAnimate:** its actual enter/exit defaults violate the policy, and achieving compliance sacrifices its principal simplicity.

**Reject View Transitions as the foundation:** browser and React support have progressed, but their snapshot and queuing behaviour does not satisfy the required interruption contract.

**Use modern CSS selectively:** `@starting-style` can improve an appropriate entry case. Discrete display transitions and intrinsic-size interpolation should not replace working Mantine lifecycle behaviour across the supported engines. `linear()` has no useful role under this exact-curve policy.

## 8. Verification record and source list

Executed successfully:

```sh
node --test tests/ui-gates.test.js tests/theme.test.js tests/first-load.test.js
```

**Result: 15 passed, 0 failed.** This verifies the existing checks, including their documented coverage gaps.

The in-memory Vite build succeeded and reproduced the existing JavaScript/CSS asset names and sizes. This was not the complete SEO-generating build command.

Browser behaviour, CI, real devices, live deployment and external-library bundle deltas remain **not_run** or **not_verified**, as applicable.

Primary sources used:

- Binding [motion policy](/Users/w6x/AGENT.md:15) and [implementation guide](/Users/w6x/.claude/skills/coding-standards/references/ui-motion.md).
- Project instructions, `docs/UI-REDESIGN.md`, ADR 003, source files and installed Mantine 9.6.3 code cited above.
- [Mantine Transition](https://mantine.dev/core/transition/), [Loader](https://mantine.dev/core/loader/) and [browser support](https://mantine.dev/browser-support/).
- [Motion configuration](https://motion.dev/docs/react-motion-config), [transitions](https://motion.dev/docs/react-transitions), [bundle guidance](https://motion.dev/docs/react-reduce-bundle-size) and [changelog](https://raw.githubusercontent.com/motiondivision/motion/main/CHANGELOG.md).
- [GSAP licence](https://gsap.com/community/standard-license/), [CustomEase](https://gsap.com/docs/v3/Eases/CustomEase/) and [React integration](https://gsap.com/resources/React/).
- [react-spring releases](https://github.com/pmndrs/react-spring/releases), [configuration](https://www.react-spring.dev/docs/advanced/config) and [reduced motion](https://www.react-spring.dev/docs/utilities/use-reduced-motion).
- [AutoAnimate releases](https://github.com/formkit/auto-animate/releases) and [versioned implementation](https://raw.githubusercontent.com/formkit/auto-animate/v0.10.2/src/index.ts).
- [React 19.3](https://react.dev/blog/2026/09/09/react-19-3) and [ViewTransition reference](https://react.dev/reference/react/ViewTransition).
- [CSS transition specification](https://drafts.csswg.org/css-transitions-1/) and the MDN compatibility datasets linked in the browser table.