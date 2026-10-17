# ADR-017 — Panel CSS architecture and forced theme

**Status:** accepted (2026-10-16)

## Context

- Owner decisions (2026-10-12): inside the panel and the workflow view the
  mock's look wins (surfaces, Geist and Geist Mono, radii, shadows, spacing,
  animations of
  [SPEC §2](../../work/research/redesign-canvas/SPEC.md) and
  `generator/common.css`); the accent follows Obsidian's; the Theme setting
  is Auto, Light, Dark, also in the panel's menu; Light and Dark show the
  mock's full palette whatever Obsidian's mode or theme; boards show
  browser-style tabs; bundled libraries are allowed through
  [ADR-007](../../current/adr/ADR-007-runtime-dependencies.md)'s screen. PRD-001.R29: no panel
  frame over 100 ms.
- Today: `styles.css` (695 rules) reads Obsidian's variables everywhere (112
  `--font-ui-*`, 293 `--size-*`, 57 `--radius-*`); `src/theme-resolver.ts`
  (372 lines) re-resolves Obsidian's variables in a hidden same-origin
  document for the forced modes, default theme only; `tests/state-theme.test.mjs`
  holds 18 R34 tests; `src/ui/prompt.ts` pins the prompt with one
  `IntersectionObserver` (`is-stuck`).
- Floor: `manifest.json` `minAppVersion` 1.8.7. Obsidian 1.14.4 flags
  installers below Electron 28.2.3 (`app.js`, `moe`) = Chromium 120
  (`electron-to-chromium` 1.5.452). `@mdn/browser-compat-data` 8.1.5, Chrome:
  `color-mix` 111, `:has()` 105, `@container` 105, style queries 111,
  `color-scheme` 81, `FontFace` 35; relative color syntax 122 (119–121
  partial, channels resolve wrongly), `light-dark()` 123, scroll-state
  queries 133, `corner-shape` 139.
- Obsidian's CSS contract moved inside the supported range: the 1.13
  changelog (2026-07-30, v1.13.4) states "The `--callout-color` variable now
  expects a valid CSS color. This is a breaking change" (before: an RGB
  triplet); 1.14.4 declares `--callout-info: var(--color-blue)` and reads
  `color-mix(in oklch, var(--callout-color) …)`. No other value-type change
  between 1.8.7 and 1.14.4 is known (inferred; 1.8.7's `app.css` was not
  available).
- Obsidian 1.14.4 `app.css` through CSSOM and a rendered fixture (probe
  scripts and results in the verification record this ADR names under
  Validation; nothing from Obsidian copied): 1,177 custom properties, 320
  differ between `.theme-light` and `.theme-dark`, all declared on `body` as
  `var()` chains ending in a base, named or accent color. A custom property
  inherits its computed value, so overriding a base color on a scope changes
  nothing derived from it; re-declaring the derived name on the scope does.
  Measured per selector branch: Obsidian's rules for rendered Markdown
  inside a plugin view (266 rules) read 73 mode-dependent names, its form
  controls, modals, prompts and suggestions (627 rules) 67; union 127, plus
  `--scrollbar-thumb-bg` and `--scrollbar-active-thumb-bg` (from
  `--mono-100`) for scrollers inside replies. Closure check: a fixture of
  219 rendered-Markdown and control elements under the scope, host dark,
  the 127 names set to their host-light values, `color-scheme: light` and
  `color` set on the scope, compared on 21 color-bearing properties and 6
  pseudo-elements against host light: 2 differences, both rules keyed on
  `body`'s mode, `.theme-dark .mermaid > svg` (filter) and `.theme-dark
  .dropdown` (chevron image); adding any further mode-dependent name fixes
  nothing. The same fixture run with the contract this ADR adopts (115
  names: the 127 plus the two scrollbar names, minus the 13 callout colors
  and the host accent, `--text-on-accent` never being in the closure)
  differs from host light on the five callouts' fill, border, title and
  icon colors (the host mode's named hue: `--callout-info` `#027aff` dark
  against `#086ddd` light), on the subjects that read the host-sourced
  `--interactive-accent` (`.mod-cta`, the enabled toggle: `rgb(138,92,245)`
  against `rgb(152,115,247)`, Obsidian's `--color-accent-1` offset) and on
  the two `body`-keyed rules; its drift check lists exactly the 14
  exclusions in one direction and the two inspected scrollbar names in the
  other. That run derives its name set from the measured closure, so it is
  the initial evidence for the contract's content, not a run of the
  committed-contract gate. Hover, focus and scrollbar
  pseudo-states are not in the snapshot. Without `color` on the scope the
  whole subtree inherits `body`'s computed text color.
  - Accent: `--color-accent` is `hsl(--accent-h, --accent-s, --accent-l)` in
    both modes; `--interactive-accent` is `--color-accent-1` on `body`
    (lighter by 7.5 %) and `--color-accent` under `.theme-dark`;
    `--text-accent` the reverse. `setAccentColor` writes the channels inline
    on `body` without `css-change`.
  - Mode events: `updateTheme` toggles the class on the main `document.body`
    and calls `workspace.trigger("css-change")` synchronously; pop-out bodies
    copy the main body's classes later, from a `MutationObserver` callback.
  - Sizes: `--font-ui-smaller/small/medium` are 12/13/15 px on desktop,
    `.markdown-preview-view` reads `--font-text-size` (16 px, the Font size
    setting); `--radius-s/m/l` 4/8/12 px; `--layer-popover/modal/notice/menu/
    tooltip` 30/50/60/65/70; `--status-bar-position: fixed`.
  - Tabs: 136 rules mention `workspace-tab-header`; 70 apply with no
    workspace ancestor, 66 need one. A plugin leaf always has such ancestors:
    in the main area `.workspace .mod-root …` rules at (0,4,x) draw the
    concave foot and divider; stacked groups, `.workspace .mod-root
    .workspace-tabs.mod-stacked .workspace-tab-container
    .workspace-tab-header` (0,6,0), set vertical writing, width, zero radius
    and hide the foot; `.mod-sidedock .workspace-tab-header-container` sets
    the sidebar background; hidden-frame and translucent window rules add
    padding, `app-region` pseudo-elements and one `!important`; `.mod-rtl`
    sets direction. `app.js` runs no DOM query for the class; the one
    handler testing `closest(".workspace-tab-header")` is the macOS
    double-click-to-maximize listener attached to Obsidian's own header
    container and title bar elements (`ZO(el)`).
- Owner constraint on libraries: they pass ADR-007's screen and esbuild
  folds them into `main.js` or `styles.css`.
- Fonts: `@fontsource-variable/geist` and `geist-mono` 5.3.0, OFL-1.1 with
  no Reserved Font Name, no scripts or dependencies, latin variable woff2
  29,400 and 23,128 B (base64 39,200 and 30,840); `main.js` is 690,829 B,
  `styles.css` 122,545 B. Obsidian's CSP (`style-src 'unsafe-inline' 'self'
  https://fonts.googleapis.com`, no `default-src` or `font-src`) loads
  `data:` fonts: two `@font-face` rules in a sheet reach `fonts.ready` in
  20 ms, `new FontFace(…, "url(data:…)")` loads in 4.1 ms; the hidden
  frame's `default-src 'none'` blocks both. Obsidian copies head `style`
  elements into every pop-out window (the same observer). Obsidian's
  policies: no assets from the network; comply with licenses, attribution
  in the README; the theme guide embeds fonts as base64 `@font-face`.
- Mock accent text against its fill, closest `color-mix` (canvas pixel
  read): dark `color-mix(in srgb, accent, white 40%)` (violet Δ9, blue Δ14,
  teal Δ45); light `… black 5%` (Δ7, Δ4; teal 8 %, Δ1). RGB distance is a
  fit, not a contrast proof.
- The directory lint forbids creating `style` and `link` elements
  (`eslint-plugin-obsidianmd` `noForbiddenElements`); it does not mention
  `FontFace`.

## Options considered

### Tokens from Obsidian's variables, hidden-document re-resolve for forced modes

- Today's mechanism; Obsidian updates and snippets flow through; new
  Obsidian variables are covered without a list.
- Cannot show the mock's palette in any mode; forced modes default theme
  only; 43 to 52 ms one-off and a 372-line resolver.

### Plugin palettes, no re-declaration

- Two literal palettes, `color-scheme`, one class toggle; no resolver.
- Rendered replies, Obsidian's form controls and the plugin's modals keep
  Obsidian's mode: two modes on screen whenever Theme differs from it.

### Plugin palettes plus a measured re-declaration of Obsidian's variables (recommended)

- The two palettes, and on the scope the 115 Obsidian names Obsidian's own
  rules read inside the panel, each a `var()` of a plugin token; the set is
  a committed contract, tested for exactness against `styles.css`, and
  checked for drift against each Obsidian upgrade.
- Names outside the set, rules keyed on `body`'s mode and a community
  theme's own rules keep the host's mode; the set is Obsidian-version
  specific.

### Plugin palettes, hidden document fed the mock's base colors

- Covers all 320 mode-dependent names by Obsidian's own derivations.
- The derivations are Obsidian's, not the mock's; it runs in every mode,
  including Auto, 43 to 52 ms per open and per theme change; default theme
  only; keeps the resolver.

## Decision

Plugin palettes with a measured re-declaration, because:

- Over today's mechanism: the owner's decision rules out Obsidian's surfaces
  inside the panel; the resolver existed only to borrow them.
- Over no re-declaration: a dark reply on a light panel breaks R34; the
  fixture shows the contract makes Obsidian's default-theme rendering
  inside the scope identical to the other mode except the callouts' hue
  and two `body`-keyed rules.
- Over the fed hidden document: its 43 to 52 ms per open would land in Auto
  too, the most common mode, for Obsidian's derivations of the mock's base
  colors rather than the mock's own; the measured set adds no recurring
  resolver work.

### Palettes and mode

- `.ai-agent-panel-scope` marks every plugin root: panel roots, plugin
  modals, workflow hosts, and the settings tab's own element while the tab
  shows (ADR-019), so the whole page draws in the panel's palette as the
  settings boards do; the Theme cards' previews are nested roots with
  their own mode class.
- `styles.css` opens with three rules, in this order: `.ai-agent-panel-scope`
  (non-color tokens: fonts, sizes, radii, shadow geometry, durations;
  `color: var(--ai-agent-panel-text)`, `caret-color`), then
  `.ai-agent-panel-scope.is-light` and `.ai-agent-panel-scope.is-dark`
  (every color token as a literal from `generator/common.css` `.app.t-light`
  and `.app`, `color-scheme`, the accent tokens, the re-declarations). The
  two palette blocks declare the same exact token set. Tokens are internal,
  not a snippet interface.
- Mode: `src/state/theme.ts` becomes `resolveMode(setting, hostDark)`:
  `light`/`dark` return themselves; `match` returns the host's. The scope
  module (`src/theme-scope.ts`, replacing `theme-resolver.ts`) sets `is-light`
  or `is-dark` on each root before attach, on `css-change` and on the
  plugin's `settings` event (today's trigger in `theme-resolver.ts:109`,
  kept: it is how a Theme change in Settings or the panel's menu reaches
  the roots), reading `hostDark` from the main window's `document.body`
  only: `css-change` fires before pop-out bodies sync, so a root's own
  window is stale at that moment. The settings tab's roots sit on
  Obsidian's settings background, so they take the host's mode
  (`resolveMode("match", hostDark)`) whatever the Theme setting, through
  `attach(root, "host")`; every other root takes the setting's. Panel roots
  and workflow hosts call `attach(root)` and register its detach on their component; `Modal` is not
  a `Component` (`obsidian.d.ts:4477`), so each modal calls
  `themeModal(this)`, exported by `theme-scope`, in `onOpen` and its
  returned detach in `onClose` (ADR-016 U5 checks every `Modal`,
  `SuggestModal` and `FuzzySuggestModal` subclass). A root keeps its class
  across `onWindowMigrated`; on unload the module detaches its listeners
  and leaves the classes to be removed with the roots. The plugin's CSS
  never keys on `.theme-light` or `.theme-dark`.
- Re-declared names: the 115 of the contract, derived by the fixture
  script, never by subtraction in prose (DES-003 lists them, grouped: text,
  backgrounds and modifiers, icons, code, callout blend mode, highlights,
  links and tags, tables, lists and structure, embeds, interactive, inputs,
  checkboxes, sliders, pills, dropdowns, modals, prompts and suggestions,
  settings items, shadows, scrollbars), each `var(--ai-agent-panel-<token>)`.
  The contract file also lists the exclusions with their reason (13 callout
  colors: pre-1.13 value type; `--interactive-accent`: source). The sources `--interactive-accent` and
  `--text-on-accent` are read into `--ai-agent-panel-accent` and
  `--ai-agent-panel-on-accent` and never re-declared: re-declaring them
  through tokens that read them would be a `var()` cycle and both invalid.
  `--text-accent` and the other accent-derived names are re-declared from
  the plugin's accent variants.
- Also stated on the scope: `.ai-agent-panel-scope.is-dark .mermaid > svg`
  with Obsidian's inversion filter and `.is-light` with `filter: none`, so
  the diagram follows the panel's mode; `.dropdown` stays unused (ADR-016
  U5).
- Callout colors (13 names, `--callout-default` to `--callout-warning`) are
  excluded from the set while the floor is below 1.13: on those hosts
  `rgb(var(--callout-color))` needs a triplet and a CSS color leaves
  callouts untinted. `--callout-blend-mode` has no type problem and stays
  re-declared to the panel mode's value. Residual, measured on 1.14.4: a
  callout's fill, border, title and icon take the host mode's named hue
  (`#027aff` against `#086ddd` for info), mixed into the re-declared
  `--background-primary`; text on them stays the re-declared
  `--text-normal`. Rejected: triplet tokens behind
  `requireApiVersion("1.13.0")` (channel variables in the palette, a second
  palette path); raising `minAppVersion` to 1.13.4 restores the 13 names
  with no branch and is the owner's call. Hosts before 1.13 are supported
  by this exclusion alone: no fixture run on such a host exists, so their
  value types for the other 115 names are owed, not shown.
- Kept of the host: `.modal-bg` (outside `modalEl`), Obsidian's menus,
  tooltips and notices, page previews of vault links in replies (drawn
  outside the panel), vault embeds whose renderer reads the mode from
  `body` (Obsidian's PDF embed), hover and focus states of the 115 names not
  snapshotted (their names are in the set; the states are a matrix item),
  the other mode-dependent names (none read inside the panel by 1.14.4's
  rules), and any community-theme rule that colors replies or controls by
  its own variables, literals or `body`'s mode class. The plugin owns the
  typography and geometry of replies and controls it draws (font family and
  size, line height, spacing, radii in `.ai-agent-panel-report-markdown`
  and the plugin's modal classes); a theme's deeper or `!important` rules
  still win there.
- Switch, in one task: add `is-switching-theme`, set the mode class, read
  one style value of the root, remove `is-switching-theme`. The fence rule
  `.ai-agent-panel-scope.is-switching-theme,
  .ai-agent-panel-scope.is-switching-theme *,
  .ai-agent-panel-scope.is-switching-theme *::before,
  .ai-agent-panel-scope.is-switching-theme *::after
  { transition: none !important; }` mirrors Obsidian's
  `.app-container.no-transition *`; a list, because `:is()` does not take
  pseudo-elements. Cost: one class toggle and the root subtree's style
  recalculation; no recurring resolver work. The R29 profile covers the
  largest supported panel subtree (a board with every tab open and a long
  reply) inside a 30,000-element workspace before acceptance.
- `color-scheme` on the scope sets native scrollbars, form controls and
  `::selection` defaults to the forced mode; `scrollbar-color` (121) is not
  used.

### Accent

- Source `--interactive-accent`, read in both palette blocks into
  `--ai-agent-panel-accent` (Obsidian's own fill, the name themes override
  most often; inferred). Variants from the token: dark text `color-mix(in
  srgb, var(--ai-agent-panel-accent), white 40%)`, light `… black 5%`; hover
  `… white 8%` dark, `… black 8%` light; tints `color-mix(in srgb,
  var(--ai-agent-panel-accent) α%, transparent)`. Contrast of text on and
  beside the accent is verified in the matrix at 4.5:1 for the six mock
  accents, not assumed from the fit.
- Residual: in a forced mode opposite to the host's the fill carries
  Obsidian's 7.5 % lightness offset of the other mode; `--color-accent`
  would avoid it but misses themes that set only `--interactive-accent`.
  Owner choice; one line.
- Rejected: relative color syntax (`oklch(from …)`): partial and wrong
  119–121, complete at 122, above the floor; `light-dark()` (123);
  `--accent-h/s/l` channels (deprecated channel interface, no `css-change`).

### Typography

| Choice | Chosen | Rejected, and why |
| --- | --- | --- |
| Loading | `FontFace` from `main.js`: esbuild `loader: { ".woff2": "dataurl" }`; `src/fonts.ts` imports the two latin files and keeps an enumerable `Map<Document, FontFace[]>`; `ensureFonts(doc)` is idempotent: when the document is unregistered it creates `new FontFace("AI Agent Panel Geist", "url(<dataurl>)", { weight: "100 900", display: "swap", unicodeRange })` and the mono face, `doc.fonts.add()`s both before calling `load()` (rejection swallowed; a face is never re-added, so a load settling after cleanup resurrects nothing); `disposeFonts(doc)` is idempotent: `doc.fonts.delete(face)` for the document's faces and removal from the map. `ThemeScope.attach` is the per-root setup of the panel scope (mode class and fonts) and every panel root, settings row and plugin modal goes through it, so it calls `watchFonts(root)`: `ensureFonts(root.doc)` now and again from the root's `onWindowMigrated` callback (the `onOwnDocument` helper, `src/ui/dom.ts:318`, runs its listener on migration only, not on install), the returned detach stopping that following; `workspace.on("window-close", (win: WorkspaceWindow, window: Window) => disposeFonts(window.document))` drops closed pop-outs (the second argument is the `Window`, `obsidian.d.ts:8096`); plugin unload disposes every document still in the map. The registry logic lives in `src/state/fonts.ts` (no `obsidian` import, documents and a `FontFace` factory injected, in `pretest`); `src/fonts.ts` is the thin wiring. 4.1 ms per document measured; `main.js` grows 70 KB (10 %) | A generated `styles.css` (esbuild second entry `src/styles/index.css` with the same loader, `outfile: styles.css`): Obsidian would propagate and remove the sheet itself and no lifecycle code would exist, but `styles.css` becomes a build output: ADR-014 (hand-written sheet) and ADR-015 (attested artifact built from the committed file) are amended, the committed `styles.css` either turns generated with a staleness check in `make verify` (protected Makefile and scripts) or is gitignored so a dev vault needs a build, `release.yml` stays as it is only because `make verify` already runs the build before the attach step, and the styles test must target the sources; base64 `@font-face` hand-pasted into the hand-written sheet: not esbuild folding, the owner's constraint |
| Package | `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` 5.3.0, latin subset, in `dependencies` (they ship) so audit, Dependabot and the tests see them | `geist` (Vercel): 2.7× the bytes, ships Next.js loaders; Google Fonts at runtime: network, forbidden |
| Families | `"AI Agent Panel Geist", var(--font-interface)` and `"AI Agent Panel Geist Mono", var(--font-monospace)` as `--ai-agent-panel-font-ui` and `-mono` in the token block | the registered names `Geist`, `Geist Mono`: a theme or user font of the same name would collide |
| Sizes | Chrome: the mock's px scale as literals (SPEC §2.2); replies: `calc(var(--font-text-size) * 0.875)` so Obsidian's Font size setting still scales reading text | Obsidian's `--font-ui-*`: fixed 12/13/15 px on desktop, not the mock's scale |

- Until ADR-007's prerequisites land (DES-001 A11 rewrite and test, the
  architecture test extended to bundled package inputs, license and notice
  checks in `make verify` and the release workflow, Dependabot), the token
  block reads the fallback stack alone and `src/fonts.ts` does not exist;
  the palette, re-declaration and tab work land first. The fonts commit
  adds the two packages (owner installs; the lockfile is protected), the
  loader line in `esbuild.config.mjs`, `src/fonts.ts` and its tests, the
  build-generated notice, the LEGAL.md entry and the README attribution.
  Why `FontFace` over the generated sheet: it touches no protected path
  beyond the A11 test and leaves ADR-014 and ADR-015 as they are, for about
  50 lines of lifecycle code testable with fake documents.
- Dependency screen (ADR-007), evidence gathered: license OFL-1.1 without a
  Reserved Font Name, author Google Inc. on behalf of the Geist Project
  Authors (Vercel), repository `fontsource/font-files`, no JavaScript, no
  scripts, no dependencies, `metadata.json` 2026-05-13, the file ships
  unmodified. Owner runs: `npm view` for the publish date and the 7-day
  rule, weekly downloads, `npm audit --omit=dev` and `npm audit signatures`.
  Risk analysis, impact × probability, inherent and residual (inferred):

| Risk | Inherent | Residual |
| --- | --- | --- |
| Upstream compromise: a malicious woff2 reaches the sheet | 5 × 1 = 5 | 5 × 1 = 5 (the bytes are data parsed by Chromium's font sanitizer; pinned exact, lockfile integrity, signatures, the equality test; a parser vulnerability stays Chromium's) |
| Abandonment of the fontsource packages | 1 × 2 = 2 | 1 × 1 = 1 (the vendored bytes keep working; a replacement is a one-rule change) |
| Vulnerability in bundled code | 1 × 1 = 1 | 1 × 1 = 1 (no code ships) |
| License change upstream | 2 × 1 = 2 | 2 × 1 = 2 (OFL is irrevocable for the shipped version) |
| Bundle size: 70 KB in `main.js` | 2 × 5 = 10 | 2 × 5 = 10 (accepted; latin subset only) |
| Registry removal of the pinned tarball | 2 × 1 = 2 | 2 × 1 = 2 (the build fails until the font is vendored under ADR-007's legal row) |

Highest 10 inherent and residual (size, accepted); chance of an impact-4+
event about 2 % per year inherent and residual.

### Radii, shadows, spacing, durations

- Literals from the mock in the scope's token block (`--ai-agent-panel-radius-*`,
  `-shadow-*`, `-space-*`, `-duration-*`); Obsidian's `--radius-*`,
  `--size-*`, `--font-ui-*` are no longer read. Honest cost: themes that
  rescale spacing or radii do not reach the panel; accepted by the owner's
  decision.
- Obsidian variables still read: `--interactive-accent`, `--text-on-accent`,
  `--font-interface`, `--font-monospace`, `--font-text-size`, `--layer-*` for
  elements appended to `body`, `--status-bar-*` for clearance (DES-003),
  `--tab-*` and `--header-height` set on the board for Obsidian's tab
  markup.

### Tabs

- Markup: Obsidian's `workspace-tab-header-container` → `-container-inner` →
  `workspace-tab-header` (`is-active`, `has-active-menu`) → `-inner` →
  `-inner-icon`, `-inner-title`, `-status-container`, under the prefixed
  ancestor `.ai-agent-panel-board` (the owner's choice; the alternative
  below is the switch). Geometry and colors arrive through the `--tab-*`
  variables set on the board, so Obsidian's own rules and the plugin's
  re-statements draw the same pixels whichever wins.
- The board sets: `--tab-curve: 9px; --tab-radius: 9px 9px 0 0;
  --tab-radius-active: 9px 9px 0 0; --header-height: 30px;
  --tab-container-background: var(--ai-agent-panel-strip);
  --tab-outline-width: 0px; --tab-outline-color: transparent;
  --tab-outline-color-hover: transparent` (the boards draw no ring, so the
  active tab's foot joins the transcript); `--tab-divider-color:
  var(--ai-agent-panel-line-strong); --tab-background-active:
  var(--ai-agent-panel-bg); --tab-background-hover: transparent` (the
  boards draw no hover foot); `--tab-inner-background-hover:
  var(--ai-agent-panel-line-strong)` (`transparent` on the active tab);
  `--tab-text-color*; --tab-font-size:
  var(--ai-agent-panel-font-size-control)` (12.5 px, as the boards);
  `--tab-font-weight` (400, 600 on the active tab); `--tab-width;
  --tab-max-width`, and the stacked-mode variables to their horizontal
  values (`--tab-stacked-text-writing-mode: horizontal-tb;
  --tab-stacked-header-width: var(--tab-width); --tab-stacked-text-transform:
  none; --tab-stacked-font-size: var(--tab-font-size);
  --tab-stacked-font-weight; --tab-stacked-text-align; --tab-stacked-shadow:
  none`).
- Re-stated under `.ai-agent-panel-board` so sidebars and pop-outs, which
  lack `.mod-root`, draw the main-area look: the active foot
  (`::before/::after`, `box-shadow: 0 0 0 calc(var(--tab-curve) * 4)
  var(--tab-background-active)`; no inset ring, as the outline is
  transparent), the divider `::after` hidden beside the active and hovered tab, tab
  width and flex, the active tab's bottom edge merged into the header's
  border; `app-region: no-drag`, the container's height, margin and padding.
- Placement rules neutralised, each measured in `app.css`:
  - Stacked groups: `.workspace .mod-root .workspace-tabs.mod-stacked
    .workspace-tab-container .workspace-tab-header` (0,6,0) and its `-inner`,
    `-inner-title`, `::before/::after` rules. The variable-valued
    declarations (writing mode, width, transform, font) are neutralised by
    the board's stacked variables; the literals (`padding: 0`,
    `border-radius: 0`, the stacked `box-shadow`, `display: none` on the
    foot and the divider, the inner padding and radius, title `order`) are
    neutralised by the override block below, whose declarations carry
    `!important`: the second named exception to the `!important` rule, an
    exact allow-list. Rejected: beating (0,6,0) by repeating classes in a
    compound (a specificity hack the reader has to decode; the test cannot
    bound it).
  - Sidebar: `.mod-sidedock .workspace-tab-header-container` (0,2,0)
    background: the board's own container rule (0,2,0), later in cascade
    order, wins; verified in the matrix, not assumed (plugin sheets load
    after `app.css`).
  - Hidden frame: `app.js` adds `mod-top`, `mod-top-left-space` and
    `mod-top-right-space` to the `containerEl` of the first tab group of
    each column (`g.containerEl.addClass("mod-top","mod-top-left-space")`),
    the `.workspace-tabs` that contains the leaf, so `.is-hidden-frameless
    … .workspace-tabs.mod-top-left-space .workspace-tab-header-container`
    (`app.css:4391`, padding, (0,4,0)) and its `::before/::after` blocks
    (`content: ''`, absolute, frame-space width, `app-region: no-drag`,
    (0,5,1)) reach a board in a top group. Neutralised in the override
    block: the container's `padding`, `content: none` on both
    pseudo-elements, `app-region: no-drag` on container and inner.
  - Translucent: `.is-translucent:not(.is-fullscreen) .mod-top
    .workspace-tab-header-container { background-color: transparent
    !important }` (0,4,0) reaches the top group of every column, the two
    sidebars included. The board's container background is declared on
    `.ai-agent-panel-scope.is-light .ai-agent-panel-board
    .workspace-tab-header-container` and its `.is-dark` twin: three
    compounds, (0,4,0), `!important`, later in cascade order (plugin sheets
    load after `app.css`), so it wins at equal specificity.
  - `.mod-rtl .workspace-tab-header-container { direction: rtl }`: the
    board's chrome stays left to right (the direction rule below),
    re-stated as `direction: ltr` in the override block.
  - Override block, the exact allow-list the styles test mirrors (every
    selector under `.ai-agent-panel-board`, every declaration `!important`,
    values from the board's `--tab-*` and `--ai-agent-panel-*` tokens):

| Subject | Context | Properties: values |
| --- | --- | --- |
| `.workspace-tab-header-container` | none | `height: var(--header-height)`; `padding: 0`; `margin: 0`; `app-region: no-drag`; `direction: ltr` |
| `.ai-agent-panel-scope.is-light .ai-agent-panel-board .workspace-tab-header-container`, `.is-dark` twin | none | `background-color: var(--tab-container-background)` |
| `.workspace-tab-header-container::before`, `::after` | none | `content: none` |
| `.workspace-tab-header-container-inner` | none | `margin: 0`; `padding: var(--ai-agent-panel-tab-strip-padding)`; `app-region: no-drag` |
| `.workspace-tab-header` | none | `writing-mode: horizontal-tb`; `text-orientation: mixed`; `width: var(--tab-width)`; `padding: var(--ai-agent-panel-tab-padding)`; `border-radius: var(--tab-radius-active)`; `box-shadow: none`; `background-color: transparent` |
| `.workspace-tab-header.is-active` | none | `box-shadow: inset 0 0 0 1px var(--tab-outline-color)`; `background-color: var(--tab-background-active)` |
| `.workspace-tab-header.is-active::before`, `::after` | none | `display: block` |
| `.workspace-tab-header-inner` | none | `padding: var(--ai-agent-panel-tab-inner-padding)`; `border-radius: var(--tab-radius)` |
| `.workspace-tab-header:hover .workspace-tab-header-inner` | `@media (hover: hover)` | `background-color: var(--tab-inner-background-hover)` |
| `.workspace-tab-header-inner::after` | none | `display: block` |
| `.workspace-tab-header.is-active .workspace-tab-header-inner::after`, `:hover` twin | none, `@media (hover: hover)` | `display: none` |
| `.workspace-tab-header-inner-title` | none | `display: block`; `order: 0`; `width: auto`; `padding: 0`; `transform: none`; `text-align: start`; `mask-image: var(--ai-agent-panel-tab-title-mask)` |
| `.workspace-tab-header-inner-icon` | none | `display: flex`; `order: 0`; `cursor: inherit`; `padding: 0`; `border-radius: 0` |
| `.workspace-tab-header-inner-icon:hover` | `@media (hover: hover)` | `background-color: transparent` |
| `.workspace-tab-header-inner-icon:active` | none | `cursor: inherit` |
| `.workspace-tab-header-inner-close-button` | none | `display: flex`; `order: 0`; `color: inherit` |
| `.workspace-tab-header-status-container` | none | `display: flex`; `order: 0` |

    The subject of every allowed selector is one of these tab parts or
    their pseudo-elements; the test rejects any other `!important`
    declaration, including an allowed selector with a property or value
    not in its row. The stacked rules reorder the icon (`order: 2`, grab
    cursors, padding, hover fill; `app.css:7423-7437`) and recolor the
    close button, hence their rows. A tab placement probe (the board's
    markup under the main-area, stacked, sidedock, hidden-frame top,
    translucent top and `mod-rtl` ancestors, with the override block
    applied) compares each tab part's `getBoundingClientRect` and computed
    `order`, `writing-mode`, `padding`, `cursor` and `background-color`
    with the main-area reference and must find them equal; it runs with
    the upgrade gate.
  - `dblclick`: `ZO(el)` attaches the macOS maximize-on-double-click handler
    to Obsidian's own tab header container and title bar elements; the
    board lives in the leaf's content, not inside them, so its double-clicks
    never reach the handler (measured: `window.frameDom && ZO(r)` with `r`
    the group's header container). No `stopPropagation` needed. Obsidian's
    tab drag handlers are attached directly to its header elements
    (Codex's reading of `app.js`, unverified by me); the board's own drag
    payloads stay separate and the matrix covers a drop onto Obsidian's
    headers.
- Risk of a community theme or an Obsidian upgrade restyling the embedded
  classes, impact × probability (1 to 5), inherent and with the rules above
  (inferred):

| Risk | Inherent | Residual |
| --- | --- | --- |
| Theme recolors or reshapes `.workspace-tab-header*` and the board's tabs follow | 3 × 4 = 12 | 3 × 2 = 6 (the board's `--tab-*` values and `!important` geometry win over a theme's non-important rules; a theme's `!important` or `--tab-*` set on the header itself still wins) |
| Theme hides tab parts (icon-only or title-only tabs) | 4 × 2 = 8 | 4 × 1 = 4 (`display` in the `!important` block) |
| Obsidian changes the tab classes, `--tab-*` or the stacked rules | 3 × 2 = 6 | 3 × 2 = 6 (the matrix and the fixture gate per upgrade) |
| Translucent or hidden-frame top group restyles the strip | 2 × 2 = 4 | 2 × 1 = 2 (the (0,4,0) `!important` background and the `content: none` pseudo-elements; depends on the plugin sheet loading after `app.css`, which Obsidian guarantees for plugin styles) |

Highest 12 inherent, 6 residual; chance of an impact-4 event about 10 % per
theme inherent, 3 % residual.

- Which wins against a community theme, the mock or the theme: this ADR
  makes the mock win for geometry (`!important` block) and for colors set
  through `--tab-*` on the board; it leaves the theme winning where it
  styles `.workspace-tab-header*` with `!important` or sets `--tab-*` on
  the header. Recommendation: the mock wins, as above; letting the theme
  win would mean dropping the `!important` block and accepting the stacked
  breakage. Owner question.

- Rejected alternative, kept for the switch: the plugin's own
  `ai-agent-panel-tab-strip`, `-tab`, `-tab-icon`, `-tab-title`, `-tab-close`
  with `is-active`, `has-menu`, the same geometry written once (about 60
  lines), `body.is-focused` dimming and the forced-colors outline re-stated
  in about six rules, no `!important`, no reachable Obsidian rule. Its risk
  table: theme restyles the board's tabs 3 × 1 = 3 (only a theme targeting
  `ai-agent-panel-*`); Obsidian's tab look drifts from the board's 2 × 3 =
  6 (accepted); a state missed in the re-statement 3 × 2 = 6 inherent, 3 ×
  1 = 3 residual. Highest 6; no impact-4 event. Value lost: the 70 free
  rules and future Obsidian tab fixes. It loses to the owner's choice, not
  on evidence.

### Stacking and status bar

- The panel root is `isolation: isolate`; plugin z-indexes (1 to 4) exist
  only inside it: sticky layers below floating ones (popovers, cards).
  Elements appended to `body` (plugin modals through Obsidian's `Modal`)
  take Obsidian's `--layer-*`. The status line clears Obsidian's fixed
  status bar through `--status-bar-*` padding. DES-003 owns the layer table
  and the clearance rule; this ADR fixes only the principle.

### Sticky prompt

- `is-stuck` from one `IntersectionObserver` (today's mechanism) remains the
  only one; `@container scroll-state(stuck: top)` needs Chromium 133, above
  the 120 floor, and ADR-016 allows one mechanism per threshold. Revisit
  when the floor passes 133. The owner asked for both; on the list.

### Prompt color

- PRD-001.R33's Prompt color picks one of ten colors for the user's
  prompts. Each named color has a fill, a line and an ink per palette:
  27 palette tokens `prompt-<color>-fill`, `-line`, `-ink` for `clear`,
  `sand`, `stone`, `sage`, `sea`, `mist`, `lavender`, `rose`, `accent`.
  Values: the settings boards' `PALETTE` (`build/build.py`), except four
  light inks darkened, hue kept, to the least lightness that holds 4.5:1
  on their fill (sand `#9c6414`, sage `#377d4c`, sea `#257b75`, rose
  `#bd4166`). Clear's fill is `rgba(0, 0, 0, 0)`. Accent's fill is
  `color-mix(in srgb, var(--ai-agent-panel-accent) 16%, var(--ai-agent-panel-bg))`
  (dark) or 8% (light), its line `var(--ai-agent-panel-accent-line)`, its
  ink `var(--ai-agent-panel-accent-text)` (dark) or
  `color-mix(in srgb, var(--ai-agent-panel-accent), black 11%)` (light).
- Three palette tokens carry the color in effect: `user-bg`, `user-line`
  and the new `user-ink`, declared in both palettes as aliases of Mist's
  (`var(--ai-agent-panel-prompt-mist-fill)` and so on). Every prompt rule
  reads only these three: the prompt card and bubble, the pinned prompt,
  the held bubble, the number box (`user-ink` border, `text` digits), the
  "You" label (`user-ink`), the current rail tick (`user-ink`) and the
  settings previews. `amber-text`, `amber-soft` and `amber-line` go, read
  by nothing else; `amber` stays for the shell hash and the waiting dot.
- Selection: the scope module classes each attached root
  `mod-prompt-color-<color>` for every color but Mist, beside its mode
  class. On `settings` it reapplies the prompt selection when it differs
  from the registration's cached selection, whether or not the mode
  changed; a reset and its Undo fire `settings` as an edit does.
  A released root keeps its last classes until it is attached again, which
  reclasses it. `promptColor` is one of the ten keys before a class is
  built from it (DES-005). One rule per color, after the palette blocks,
  re-aliases the three tokens on that root and on the scope roots inside
  it:
  `.ai-agent-panel-scope.mod-prompt-color-sage, .ai-agent-panel-scope.mod-prompt-color-sage .ai-agent-panel-scope { --ai-agent-panel-user-bg: var(--ai-agent-panel-prompt-sage-fill); … }`.
  The descendant branch (0,3,0) beats a nested root's palette block
  (0,2,0), so a Light preview inside a dark page keeps the pick in light
  values.
- The Prompt color cards draw their own color, not the pick: each card's
  swatch is classed `mod-<color>` and one rule per color reads that color's
  three tokens directly.
- Custom: the root gets `mod-prompt-color-custom`, and, whenever the stored
  Custom color is accepted, whichever color is picked, the inline property
  `--ai-agent-panel-prompt-custom` (through `setCssProps`), so the Custom
  card shows it; the Custom rule sets `user-bg` to that property, `user-line` to
  `color-mix(in srgb, var(--ai-agent-panel-prompt-custom), var(--ai-agent-panel-text) 25%)`
  and `user-ink` to `var(--ai-agent-panel-text-muted)`. The property is
  declared nowhere in `styles.css`, so nested roots inherit it; only the
  Custom rule and the Custom card's swatch read it.
- Custom acceptance (`acceptCustomColor` in `src/state/prompt-color.ts`,
  `CSS.supports` injected so Node tests it): a string of at most 64
  characters; only letters, digits, spaces and `#`, `.`, `,`, `%`, `/`,
  `+`, `-`, `(`, `)`, so no backslash escape, quote, colon, semicolon,
  brace or `@`; every function name, in lower case, one of `rgb`, `rgba`,
  `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color`,
  `color-mix`, `calc`, `min`, `max`, `clamp`, so a value that refers to
  another (`var()`, `env()`, `attr()`), `currentColor` or a CSS-wide keyword
  (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) is refused with
  its own message, "Use a color, not var(), env(), attr() or currentColor.
  The prompt keeps the last valid one." while a valid color is stored, else "Prompts use Sand,
  the default." (PRD-001.R33); and `CSS.supports("color", value)`. The
  settings tab stores a typed value only once accepted, so the stored value
  is the last accepted one. On load and on every apply the value is checked
  again: a refused or empty stored value (an edited `data.json`, another
  device's) puts the root on the default prompt color
  (`DEFAULT_SETTINGS.promptColor`) and its Custom card on the plus icon.
  The value is data from a synced file, so it reaches only one custom
  property of the plugin's own roots, through `setProperty`, never a
  selector, a declaration of ours or a stylesheet.
- Contrast: `tests/palette.test.mjs` holds, for each named color and both
  palettes, `text` and `prompt-<color>-ink` on `prompt-<color>-fill` at
  4.5:1 (a translucent fill over `bg`), with the accent at the assumed
  value as the other accent pairs. Text on Accent's fill holds whatever
  the accent, since the fill is at most 16% accent over `bg` (inferred
  from the 8% light and 16% dark sRGB mixes; computed over every accent,
  13.85:1 light and 9.77:1 dark at worst, with no test holding it);
  Accent's ink holds only at the assumed accent. So PRD-001.R28 guarantees the text for every color
  but Custom and the ink for every named color but Accent; Custom has no
  guarantee.
- Rejected: inline properties for every color (the palette test reads
  only `styles.css`, so the colors would need a second checked source); a copy of each prompt rule per color
  (ten colors times eight rules); classes on the panel root only (the
  modals, the workflow view and the settings previews would keep Mist).

### Theme setting, R34, R28

- Stored key `match` stays (no migration), label "Auto"; choices Auto, Light,
  Dark in Settings and in the panel's menu. `THEME_NOTES` and the three
  conditional R34 clauses go.
- R34, final:
  - The AI Agent Panel shall draw its own chrome (the panel, the workflow
    view, their popovers, the board's tabs, the plugin's modals and the
    settings page, the page in Obsidian's mode whatever "Theme" is) in its
    own light and dark palettes, with Obsidian's accent color.
  - The AI Agent Panel shall pass the palette in effect to the content and
    controls Obsidian renders inside the panel through the variables
    Obsidian's default theme reads, except callout colors, which keep
    Obsidian's mode while the plugin supports Obsidian before 1.13.
  - WHERE "Theme" is "Auto", the AI Agent Panel shall use the palette of
    Obsidian's current mode and follow Obsidian's mode changes in every
    window.
  - WHERE "Theme" is "Light" or "Dark", the AI Agent Panel shall use that
    palette whatever Obsidian's mode or theme; what a community theme
    colors by its own rules, and Obsidian's menus, tooltips, notices,
    modal backdrop and settings window, keep Obsidian's mode.
  - The AI Agent Panel shall offer the Theme choice in Settings and in the
    panel's menu.
- PRD-001.R28's prompt contrast clause is PRD-001's; what
  each prompt color guarantees is under [Prompt color](#prompt-color).

### Forced colors, contrast, motion, direction

- Forced colors: a boundary that carries meaning (focus, active tab,
  selected segment, card and popover edges, the waiting highlight) is a
  `border` or `outline`; where a token draws it as a fill or inset shadow, a
  forced-colors rule uses `ButtonBorder`, `Highlight` or `CanvasText`, as
  Obsidian does for `button` and the active tab. `forced-color-adjust: none`
  only on color that is data and also printed as text (legend swatches). The
  Theme setting has no visible effect there (inferred).
- No `prefers-contrast` rules; `app.css` has none.
- Motion: the mock's animations, on `opacity` and `transform` only;
  `prefers-reduced-motion: reduce` stops pulse, ring, slide, wave, shimmer
  and caret blink, and stills spinners.
- Direction: logical properties only; chrome stays left to right (English
  UI). Obsidian marks RTL interface languages with `body.mod-rtl`.

### Naming, scoping, source

| Choice | Chosen | Rejected, and why |
| --- | --- | --- |
| Classes | `ai-agent-panel-<component>[-<part>]`; state classes `is-*`/`mod-*` only beside a prefixed class; Obsidian's `workspace-tab-header*` classes are the one admitted unprefixed family, always under `.ai-agent-panel-board` | Short classes under one root class: themes style generic names such as `.card` and `.tab` (inferred) |
| Tokens | `--ai-agent-panel-*` | `--aap-*`: a second convention beside `--ai-agent-panel-side-width` |
| Selectors | A prefixed class in each first compound (Validation); at most three compounds; no nesting; no `!important` except the theme-switch fence, which must beat every component's `transition`, and the board's tab override allow-list; resets in `:where()` | Nesting: harder-to-read specificity, no runtime gain. A fence without `!important`: at (0,2,0) it loses to the plugin's three-class selectors |
| Source | One hand-written `styles.css`, sectioned in `src/ui/` order (ADR-014) | Bundled CSS files: `styles.css` becomes a build output, amending ADR-014 and ADR-015 |

### Container queries and performance

- `.ai-agent-panel-main`: `container: ai-agent-panel-main / inline-size`;
  the rules below 360 px and from 560 px (R30, R31).
- Panel root: `container: ai-agent-panel / size`, `height: 100%`; the rule at
  most 640 px tall; the height is definite under the leaf's
  `contain: strict`.
- Popovers live in the main column's host layer (ADR-016):
  `max-inline-size: calc(100cqi - 16px)` (R32); `max-block-size` from the
  space on the side it opens, read on open, with `overflow: auto`.
- Workflow view: its own `size` container on an explicitly sized frame.
- Layout through container queries and classes; geometry read only in
  resize callbacks and once per label change (ADR-016).
- `:has()` only inside one component, never on the root, the main column or
  the message list.

### Validation

`tests/styles.test.mjs` (all plain Node, on the whole file):

- The first three style rules are, in order, `.ai-agent-panel-scope`,
  `.ai-agent-panel-scope.is-light`, `.ai-agent-panel-scope.is-dark`;
  `parseRules` also returns at-rules without nested rules (today an
  `@font-face` parses to zero rules and would pass unseen).
- Each palette block declares exactly `PALETTE_TOKENS` (a sorted constant
  in the test) and `color-scheme`; `deepEqual`, not subset.
- The contract file `tests/fixtures/redeclared.json` (`names`: the 115;
  `excluded`: name and reason; `obsidian`: the version measured) is the
  one source for the test, DES-003's list and the fixture script. Each
  palette block's non-`--ai-agent-panel-*` properties equal `names` exactly
  (`deepEqual` of sorted arrays), each valued `var(--ai-agent-panel-…)`
  that resolves (both directions: every contract name mapped, every
  mapping in the contract); `--interactive-accent` and `--text-on-accent`
  appear only as `var()` reads inside the two accent tokens; no `excluded`
  name is declared anywhere.
- Reference completeness and cycles: every `var(--ai-agent-panel-x)` read
  anywhere names a token declared in the token block or in both palettes;
  the `var()` graph over the three blocks is acyclic.
- Value types: a palette color token is a color literal, a `color-mix()` of
  tokens, the accent reads, or exactly one of these aliases: `user-bg`,
  `user-line`, `user-ink` as `var(--ai-agent-panel-prompt-mist-fill)`,
  `-line`, `-ink`; `prompt-accent-line` as
  `var(--ai-agent-panel-accent-line)`; the dark `prompt-accent-ink` as
  `var(--ai-agent-panel-accent-text)`. The token block holds no color.
- Prompt color selection (`PROMPT_SELECTION` in the test): outside the
  palette blocks, palette tokens are declared only by rules whose selector
  is exactly `.ai-agent-panel-scope.mod-prompt-color-<color>,
  .ai-agent-panel-scope.mod-prompt-color-<color> .ai-agent-panel-scope`,
  one per color but Mist, outside any at-rule; each declares exactly
  `user-bg`, `user-line` and `user-ink`, valued
  `var(--ai-agent-panel-prompt-<color>-fill)`, `-line`, `-ink` (Custom: as
  the Prompt color section says). Those rules keep every other check.
  `--ai-agent-panel-prompt-custom` is the one custom property read without
  a declaration, and only in the Custom rule and the Custom swatch rule.
- Per selection: `tests/styles.test.mjs` checks both palettes for cycles
  with every selection rule applied; `tests/palette.test.mjs` checks the
  prompt contrast of the nine named colors, Custom excluded and Accent at
  the assumed accent.
- Color literals (hex, `rgb()`, `hsl()`, `oklch()`, named) only in the
  palette blocks; elsewhere `transparent`, `currentColor` and system colors
  inside forced-colors rules.
- Selector containment: each complex selector of each branch is split on
  combinators; the first compound carries a prefixed class; a prefixed
  class inside `:has()`, `:is()`, `:where()` or `:not()` does not count;
  the combinator that follows the first compound is descendant or child,
  never `+` or `~` (a sibling of the anchor is outside the component);
  `+` and `~` may appear later. The probes `body:has(.ai-agent-panel-board)
  .x` and `.ai-agent-panel-board + .x` pass a textual check and must
  fail.
- No `.theme-light`, `.theme-dark`, `--font-ui-*`, `--size-*`,
  `--radius-*`, channel variables or `scroll-state(`.
- No `@font-face` and no `url(` anywhere.
- `!important`: every declaration carrying it is either the fence or an
  entry of `IMPORTANT_ALLOW`, a constant mirroring the override table
  (selector text after whitespace normalisation, at-rule context, property,
  value); the selector's subject must be an admitted tab part or its
  pseudo-element. Rejection seeds: `.ai-agent-panel-board
  .workspace-tab-header + .ai-agent-panel-card { display: none !important }`,
  `.ai-agent-panel-board .workspace-tab-header .ai-agent-panel-x { color: red
  !important }`, an allowed selector with `color: inherit !important`, an
  allowed selector and property with another value, an allowed entry
  outside its media context. `.workspace-*` compounds admitted only after
  `.ai-agent-panel-board`, never as the first compound.

`tests/architecture.test.mjs`:

- U5's `themeModal` clause: module `theme-resolver` becomes `theme-scope`;
  the detach-field check drops the frame fields.
- "DES-001 A11: package.json has no runtime dependencies" becomes "A11:
  runtime dependencies are the admitted ones": `deepEqual(Object.entries
  (pkg.dependencies ?? {}).sort(), ADMITTED)` with `ADMITTED` keyed by ADR
  and holding exact versions (`017: @fontsource-variable/geist 5.3.0,
  geist-mono 5.3.0`), empty until the fonts commit.
- The test's own esbuild invocation gains the `.woff2` `dataurl` loader and
  stops skipping package inputs (ADR-007's prerequisite); `fonts` joins
  layer 3 and the module walk skips `.d.ts` files (`src/woff2.d.ts` types the
  `.woff2` import); the import rule
  admits `.woff2` imports only from `src/fonts.ts` and only of the two
  packages' `files/*-latin-wght-normal.woff2`; every other package input is
  a failure; the metafile proves the two files are the only
  non-`src/` inputs.
- `esbuild.config.mjs` builds the banner from the two packages' `LICENSE`
  files (the OFL text and both copyright notices, whole), and
  `tests/bundle-licenses.test.mjs` builds `main.js` and asserts the header
  holds both files and both copyright lines (ADR-007's legal row; `make
  verify` runs it through `npm test`, and `release.yml` runs `make verify`
  before attaching).
- `tests/state-fonts.test.mjs` (DES-003 P6 names it), with fake documents
  (a `fonts` set, a `FontFace` factory recording arguments and a
  controllable `load()` promise): two faces with the namespaced families
  and `url(data:` sources, added before `load()`; two roots sharing one
  document add once; a root migrating to a second document adds there and
  leaves the first; a pop-out closed before unload, delivered as the
  `window-close` pair `(win, window)` and disposed through
  `window.document`, is deleted and the map no longer holds it; a load resolving or rejecting after `disposeFonts`
  neither throws nor re-adds; unload disposes every remaining document;
  disable then re-enable registers exactly two faces per document again;
  `disposeFonts` twice is a no-op.
- `tests/state-theme.test.mjs`: `resolveMode`'s six cases; the scope
  module with fake roots, a fake main body and a fake workspace: `css-change`
  with the main body dark and a stale pop-out body light sets `is-dark` on
  both roots; the `settings` event switching Auto → Light → Dark → Auto
  re-classes every root in both windows; attach classes a new root at once;
  unload detaches both listeners. The property-map tests go with the
  resolver.

Evidence and the upgrade gate:

- The probe scripts, the fixture and their results, with Obsidian 1.14.4
  and Chrome 155.0.8059.39 named, land as
  `docs/records/verification/2026-10-13-adr-017-css-probes/` (scripts, JSON,
  PNG; no Obsidian code). The fixture script reads `app.css` from the
  local install's `.asar` at a path the runner passes, so it cannot run in
  CI.
- Gate, on each Obsidian upgrade and before each release, the fixture
  script run with the committed contract file as input, never with a set it
  measures itself (a set regenerated from the host could pass while the
  plugin's CSS was stale):
  1. Consumer drift: it measures the names Obsidian's rules read inside the
     fixture and compares them with `names` plus `excluded` in both
     directions; a name read but not in the contract, a contract name no
     longer read, or a contract name the host no longer declares fails.
  2. Render parity: it injects the contract's `names` at their host-light
     values under a dark host and compares the fixture against host light,
     with `--interactive-accent` set to the host-light value in both
     snapshots (a normalisation: the design keeps the accent host-sourced,
     and the matrix verifies its offset separately); any difference outside
     the recorded residue (the callout subjects, the two `body`-keyed
     rules) fails.
  3. `npm test` proves `styles.css` re-declares exactly the contract.
  A failure blocks the release until the contract, DES-003 and the palette
  blocks are updated together; the run's output is the release's
  verification record. The gate script is written with the implementation
  and reads the contract file; its first run on 1.14.4 is the acceptance
  evidence. The probe runs committed with this ADR (`css-analysis3`, the
  closure; `css-analysis4`, the closure minus the exclusions) are initial
  evidence for the method and the contract's content, not gate runs.
- Manual DES-003 matrix: Auto, Light, Dark against Obsidian light and dark,
  default theme and two community themes; the panel in the main area, a
  stacked group, both sidebars and a pop-out; a mode switch with a pop-out
  open (both windows repaint on the same event); window migration of an
  open board; accent change; Font size change; each modal while forced; a
  reply with callouts, code, tags, a table, mermaid, embeds, a checklist
  and a scrolling code block, hovered and focused; contrast of text on and
  beside each of the six mock accents at 4.5:1; Windows high contrast;
  reduced motion; the fonts in both windows (`document.fonts` entries with
  status `loaded` and DevTools' rendered-fonts panel, not `fonts.check()`);
  no network request (DevTools); 300 to 1040 px wide; the R29 profile of a
  theme switch with the largest panel subtree and 30,000 workspace
  elements. Owed before acceptance of pre-1.13 support as verified: the
  fixture and the matrix on an Obsidian 1.8.7 install (the owner can
  download the installer); until then the floor rests on the callout
  exclusion and the browser-feature evidence alone.

### AGENTS.md §4 rule 5

Styles read the plugin's `--ai-agent-panel-*` tokens. Obsidian variables
read directly: the accent (`--interactive-accent`, `--text-on-accent`),
`--layer-*`, `--status-bar-*`, `--font-interface`, `--font-monospace` and
`--font-text-size` in the token block, and the `--tab-*` values the board
sets. AGENTS.md §4 rule 5 and CONTRIBUTING.md point here.

### Documents that change with this ADR

Change 016 (prompt color): DES-003 (prompt tokens, selection), DES-001
(settings tab as a scope root), `tests/styles.test.mjs` (`PALETTE_TOKENS`
gains the 27 color tokens and `user-ink`, loses `amber-text`,
`amber-soft`, `amber-line`; the alias value type; `PROMPT_SELECTION`),
`tests/palette.test.mjs` (the prompt pairs above replace the `amber-text`
pairs), `tests/state-theme.test.mjs` (the prompt class on attach and on
`settings`).

DES-003 (token contract: literals per palette, the 115-name contract by group,
the layer table, status-bar clearance, the tab geometry), DES-001 (file
map: `theme-scope.ts`, `fonts.ts`; the private-API list loses `app.customCss.theme` and
`styleEl`), PRD-001 (R34, R28), SECURITY.md (the hidden-frame paragraph
goes; fonts are bundled data in `main.js`), README (theme disclosure,
font attribution), LEGAL.md (OFL notices), DEVELOPMENT.md (adding a
dependency, the upgrade gate), the ADR README;
`docs/records/changes/001` stays a record.

## Consequences

- Easier: the panel looks like the mock in every mode; no resolver, no
  default-theme restriction, no frame cost; forced modes under community
  themes for everything Obsidian draws from the re-declared names and
  everything the plugin draws itself.
- Harder: Obsidian's theming no longer reaches the panel's chrome; the
  re-declared set is tied to an Obsidian version and re-verified by the
  fixture on each upgrade; callouts keep the host's hue until the floor
  reaches 1.13; `main.js` carries 70 KB of fonts and the project its first
  runtime dependencies, under ADR-007's gates; the board's tabs carry one
  `!important` block against Obsidian's stacked-tab rules.
- Locked in: literal palettes in `styles.css`; one mode class and one
  prompt color class set by the plugin on each root; Obsidian's tab markup inside the
  board with the neutralising overrides.
- Reversible: the accent source, the reply font scale, the callout
  exclusion and the sticky mechanism are one line each; the board's own
  tab classes are a CSS and markup change inside one component; moving
  fonts to a generated `styles.css` is a build change and two ADR
  amendments.
- Inferred until the matrix runs: the switch cost on the largest panel
  subtree, hover and focus parity, value types of the re-declared names on
  hosts before 1.13 other than callouts, how often community themes color
  replies by their own rules, and contrast of the mock's accent variants.
- Open: right-to-left message text (`dir="auto"`) needs a requirement.
