---
status: closed
release: r07-mock-fidelity
number: 057
prd: PRD-001.R34, PRD-001.R28, PRD-001.R25
---

# TASK-057 — Plugin palettes, theme scope, Theme Auto/Light/Dark

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Feature (class L, a requirement change:
[change 007](../../../records/changes/CHG-007-panel-palettes.md)). It implements
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)'s
Palettes and mode, Accent and Theme setting sections. The panel's colors
come from its own light and dark palettes (mock literals) with Obsidian's
accent, in place of Obsidian's variables re-resolved in a hidden frame.

Governing: PRD-001 R34, R28 and R25 (changed by change 007); ADR-017;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) U5 (`themeModal`);
[DES-003](../../../current/design/DES-003-panel-ui.md) Token contract,
Modules, Settings that reach the panel;
[DES-001](../../../current/design/DES-001-system-overview.md).

Acceptance:

1. `styles.css` opens with exactly three rules: `.ai-agent-panel-scope` (no
   color), `.ai-agent-panel-scope.is-light`, `.ai-agent-panel-scope.is-dark`.
   Each palette declares the same tokens, `color-scheme`, and exactly the
   115 names of `tests/fixtures/redeclared.json` as `var(--ai-agent-panel-…)`.
   Every token read is declared in the token block or in both palettes.
2. `--interactive-accent` and `--text-on-accent` are read only by the
   `accent` and `on-accent` tokens of the two palettes; no excluded name is
   declared.
3. Every panel root and plugin modal carries `is-light` or `is-dark`: Light
   and Dark as set, Auto the main window's mode. The settings tab's scoped
   parts take the main window's mode whatever the setting. Classes switch
   on attach, `css-change` and the plugin's `settings` event, inside the
   `is-switching-theme` fence.
4. Settings › Appearance › Theme offers Auto, Light, Dark with no note; the
   panel's menu has checkable "Theme: Auto", "Theme: Light", "Theme: Dark"
   in section "view" beside "Show tooltips". Both call `setTheme`, which
   saves and fires `settings`.
5. `tests/palette.test.mjs` measures every pair the panel draws in both
   palettes; the pairs below their minimum with the mock's values are
   exactly its `KNOWN_BELOW`, at their ratio.
6. Mermaid SVG under `is-dark` takes Obsidian's dark inversion; under
   `is-light`, `filter: none`.
7. ADR-017's gate checks 1 (consumer drift both ways, every contract name
   declared by the host) and 2 (render parity outside the recorded
   residue) pass on Obsidian 1.14.4 against the committed contract; check
   3 is `npm test`.

## Scope

Expected files:

- New: `src/theme-scope.ts`, `tests/fixtures/redeclared.json`,
  `tests/palette.test.mjs`, `docs/work/changes/CHG-007-panel-palettes.md`
  (closed in the commit).
- Deleted: `src/theme-resolver.ts`.
- Changed: `src/state/theme.ts` (rewritten), `src/main.ts` (`ThemeScope`,
  `setTheme`), `src/view.ts` (menu items), `src/settings.ts` (labels from
  `settings-core`, no notes, scoped elements attached in Obsidian's mode and
  released per row), `src/settings-core.ts` (`THEME_LABELS`),
  `src/suggest.ts`, `src/history.ts`, `src/confirm-modal.ts`,
  `src/diffview.ts` (import path); `styles.css` (the three opening rules,
  the Mermaid pair, the fence comment, accent renames, focus rings on
  the solid `accent`, the pinned prompt on `stuck`, the token block's defaults);
  `tests/state-theme.test.mjs` (rewritten), `tests/styles.test.mjs` and
  `tests/architecture.test.mjs` (only ADR-017 Validation's clauses listed in
  the Run log), `tests/settings-core.test.mjs` (two test names); PRD-001
  (via the change), ADR-016 (the module's name), DES-001, DES-003,
  `docs/current/SECURITY.md`, `docs/current/DEVELOPMENT.md`, `README.md`,
  `RELEASE_NOTES.md`.

Negative scope:

- No font, size, radius, spacing or duration change; no tab markup; no
  restyling beyond the accent token renames, the focus ring, the pinned
  prompt's shadow and the category colors.
- Not in `tests/styles.test.mjs`: the `!important` allow-list for tabs, the
  `--font-ui-*`/`--size-*`/`--radius-*` ban, the `@font-face`/`url(` ban,
  the selector-containment rewrite. Not in `tests/architecture.test.mjs`:
  A11 (fonts) and the `.woff2` loader.
- No dependency, no protected path, no `package.json` change (the state
  module was already in `pretest`); nothing Obsidian draws outside the panel.
- Replies' missing `markdown-rendered` class (a code block without its
  background) is a separate task.

## Plan

- `state/theme` (Obsidian-free): `resolveMode(setting, hostDark)`;
  `ModeClasses`, which keeps each attached root with its mode, whose mode it
  follows (the setting, or the host for the settings tab's parts) and one
  owner per attach, listens to `css-change` and `settings` through
  structural event-hub types (a second `load` adds nothing), and writes a
  root only when its mode differs: fence on, the other mode class off, this
  one on, one style read, fence off; `Registrations`, one detach per
  settings row.
- `theme-scope` (thin `Component`): wires the workspace, the plugin's
  events, the setting, `hostDark` from the main window's `document.body`
  (a pop-out body follows late) and the style read; exports `themeModal`,
  which without a loaded scope (only after unload: the scope loads first in
  `onload`) gives the modal Obsidian's mode.
- Palette values: the mock's `.app` (dark) and `.app.t-light` (light). Where
  the mock has none, Obsidian 1.14.4's default-theme value, measured by
  resolving every contract name in both modes against Obsidian's `app.css`
  in a headless browser. DES-003's table names each source.
- `tests/styles.test.mjs`: `paletteViolations` checks the opening rules,
  `PALETTE_TOKENS` and `color-scheme`, the contract by exact sorted
  equality, the accent's sources, excluded names, reference completeness,
  `var()` cycles and value types, each breach seeded alone; literals are
  exempt in the two palette blocks only.
- Verification: `make verify`; the gate run; the harness facts in the Run log.
- Rejected: keeping the frame resolver for Light and Dark (ADR-017 retires
  it); a submenu for Theme (`setSubmenu` is not in obsidian.d.ts 1.13.1);
  reading `hostDark` from each root's own window body (a pop-out's body
  updates after `css-change`, so a root there would take the stale mode);
  giving the settings tab's parts their own opaque palette background
  (they would stand out as panels inside Obsidian's settings window);
  queueing modals opened before the scope loads (none can open then);
  `releaseAll` before `update()` (rows it does not rebuild would keep
  their class but stop following Obsidian).

## Run log

- Tests first: the fixture, `state-theme`, `palette` and the new
  `styles.test.mjs` checks were written and run red before the code.
- Edits to `tests/styles.test.mjs` (ADR-017 Validation clause each):
  - `OBSIDIAN_COLOR_VAR` comment and message: "outside the token block" →
    "outside the palette blocks"; the token block is no longer exempt from
    the read rule ("the token block holds no color"; accent reads only in
    the two accent tokens).
  - New constants `PALETTE_BLOCKS`, `PREFIX`, `PALETTE_TOKENS`,
    `SHADOW_TOKENS`, `BORDER_TOKENS`, `KEYWORD_TOKENS`, `BLEND_MODES`,
    `ACCENT_SOURCES`, `CONTRACT` (PALETTE_TOKENS exactness; value types; the
    contract file as the one source).
  - `parseRules` returns an at-rule holding declarations (`@font-face`) as a
    rule with no selectors ("parseRules also returns at-rules without nested
    rules").
  - `violations`: color literals and Obsidian color reads skipped in the two
    top-level palette blocks only ("Color literals … only in the palette
    blocks").
  - New `declarations`, `isShadowList`, `valueTypeBreach`, `varCycle`,
    `paletteViolations` (value types: a shadow is 2-4 lengths, the blur not
    negative, one color literal, `inset` at most once; the border a width,
    style and a color literal or token; the
    blend mode a `mix-blend-mode` keyword; contract names by `deepEqual` of
    sorted arrays, a duplicate failing; accent reads; excluded names;
    reference completeness against the token block and both palettes only;
    acyclic graph; first three rules).
  - Tests: the first test asserts the three opening rules in place of
    rules[0] and a token list; a new test runs `paletteViolations` on
    `styles.css`; the seeded test gains a palette block nested in an at-rule
    and the `@font-face` parse; a new test seeds each palette breach alone
    into a clean file and asserts exactly its messages (25 seeds, among them
    a duplicate `--text-normal`, `shadow: red`, a negative blur,
    `blend-mode: banana`, a border color `#12345`, a property only a
    component declares).
- Edits to `tests/architecture.test.mjs` (U5's `themeModal` clause): the
  layer-3 module `theme-resolver` → `theme-scope` (layer list, the
  detach-field check's module and comment, the fixture's file and import),
  the local `fromResolver` → `fromScope`. There were no frame fields to drop.
- Reference completeness follows ADR-017's text: the properties components
  declared (`section-gap`, `status-icon-size`) and the ones the source
  writes per element (side width, bar clearance, tick top, segment, meter
  and context shares, popover and hover-card geometry) have non-color
  defaults in the token block, equal to the fallbacks their reads carry.
- Token decisions: focus rings and `--background-modifier-border-focus`
  use the solid `accent`, so the `focus` token is gone. This deviates from
  SPEC (focus rings use `--accent-line`): with Obsidian's default accent,
  `accent-line` on bg is 1.67:1 light and 1.96:1 dark, below WCAG 1.4.11's
  3:1 and below the old border-focus (1.8, 2.5); the boards draw no focus
  state, so accessibility decides. The accent on bg, bg-recessed, surface
  and fill: light 4.11, 3.87, 4.26, 3.73; dark 4.32, 4.16, 3.94, 3.53; `stuck` is the
  boards' `--stuck`; `embed-border` and `swatch-shadow` live in the palettes;
  `added-line` takes the mock's red-line alpha on green; the categories are
  the boards' (Commands `--c0`…`--c4`, blue, purple, cyan, orange, green),
  the sixth ContextCache's pink `#d68be0` in dark and `#ba3dcb` in light (the
  Commands pairs' mean lightness shift, -19.4 HSL points). `accent-hover`
  and `strip` are declared for the tabs task and not yet read.
- Contrast below the minimum with the mock's values, as `KNOWN_BELOW` (owner
  decision list): light faint on track 4.34; amber text on the badge over
  the tint 4.08 and over the panel 4.28; ok on ok-soft 3.97; error on
  error-soft 4.26; warning on warning-soft 4.42; added on added-soft 3.97;
  removed on removed-soft 4.26; ok on bg 4.45; dark faint on track 3.99.
- Acceptance 7 evidence: `contract-gate.mjs` in the ADR-017 probe folder,
  held outside the repository; it lands in
  `docs/records/verification/2026-10-13-adr-017-css-probes/` once the
  ESLint ignore patch for that folder is applied (ESLint lints its `.mjs`;
  the config is protected). Run with `tests/fixtures/redeclared.json` and
  Obsidian 1.14.4's `app.css` (`contract-gate.json`, exit 0):
  - Check 1: 129 mode-dependent names read by reply, form and scrollbar
    rules, rules keyed on `body`'s mode class included, equal the 115 names
    plus 14 excluded, each declared by the host. The probes' blanket
    `.theme-` exclusion is dropped; the rule classes are otherwise the
    probes'.
  - Check 2: 219 fixture elements, 21 properties by 6 pseudo-elements;
    the only differences are the ADR's residue: 939 on the callout
    subjects, 1 on `.theme-dark .mermaid > svg` (filter), 1 on
    `.theme-dark .dropdown` (chevron).
  - Seeds, exit 1 each: a contract with `--text-normal` dropped and
    `--no-such-name` added fails all three drift lists and parity
    (`contract-gate-stale-seed.json`); a new name read by
    `.theme-dark .markdown-rendered pre` fails drift and parity
    (`contract-gate-mode-consumer-seed.json`).
  - The 404 in the first runs was `app.css`'s
    `url(public/images/….svg)`, an Obsidian bundle image the harness does
    not serve; the script now serves an empty SVG for each such URL, and
    the runs record no console error and no failed request.
- Harness facts (owed to the orchestrator's headless run):
  - The panel root and each plugin modal carry exactly one of
    `is-light`/`is-dark`: Auto follows the host (`body.theme-dark`), Light
    and Dark hold under either host mode; the settings tab's prompt-style
    cards follow the host under all three.
  - Computed `background-color` of `.ai-agent-panel` is `rgb(251, 251, 250)`
    under `is-light` and `rgb(20, 20, 23)` under `is-dark`.
  - Theme Dark under a light host: a reply's code block
    (`.markdown-rendered pre`) computes `--code-background` and its
    background to the dark palette's bg-recessed `rgb(24, 24, 28)`; Theme
    Light under a dark host: `rgb(244, 244, 242)`.
  - The panel's menu (right-click the sidebar tab) lists "Theme: Auto",
    "Theme: Light", "Theme: Dark" in the "view" section next to "Show
    tooltips", the current one checked; choosing one re-classes open panels
    with no reload and Settings shows the same choice.
  - Switching Obsidian's mode with Theme Auto re-classes a panel in a
    pop-out window too.

## Independent review

Round 1. Reviewers: an independent review agent with a headless Obsidian
harness, and Codex (static). Verdict: rework.

- Blocker: Light or Dark under the other host mode put the forced
  palette's text on Obsidian's settings background (cards, the
  launch-arguments error). Resolved: settings-tab roots follow Obsidian's
  mode (`attach(el, "host")`); ADR-017, PRD-001.R34, DES-001 and DES-003
  say so.
- Major: settings redraws kept old roots registered. Resolved:
  `Registrations`, one detach per row, released on row replacement, on a
  legacy full redraw and on `hide()`.
- Major: the palette gate accepted a duplicate re-declaration, `shadow:
  red`, `blend-mode: banana`, and took any quoted source string or
  component declaration as a token source. Resolved: exact sorted equality,
  shadow and blend grammar, reference completeness as ADR-017 states it
  (defaults in the token block), each breach seeded alone.
- Major: ADR-017's contract-driven gate script was missing. Resolved:
  `contract-gate.mjs` in the ADR-017 probe folder (Run log).
- Major: categories were Obsidian's colors, not the boards'. Resolved: the
  boards' Commands `--c0`…`--c4` and ContextCache's pink; light pink
  derived.
- Minor: the contrast test missed status-on-soft, the badge, success on bg,
  faint on tracks and focus. Resolved: added; shortfalls listed in
  `KNOWN_BELOW` at their ratio.
- Minor: `embed-border` and `swatch-shadow` sat in the token block; the
  pinned prompt used `shadow-small`. Resolved: both in the palettes; the
  pin reads `stuck`.
- Minor: `load()` twice leaked listeners; a root attached twice was
  released by either detach; a modal before load got no mode class; after
  unload no fallback. Resolved: guarded load, one owner per attach, the
  scope proven to load first, the host mode class as fallback.
- Nits: the stale pop-out test, `void` on two `setTheme` promises,
  ADR-016's module name. Resolved.

Between rounds, the orchestrator found focus on `accent-line` (1.67 light,
1.96 dark on bg) worse than the old border-focus (1.8, 2.5). Resolved:
focus rings use the solid accent, 3.53 to 4.32 on every surface; the SPEC
deviation is in the Run log and DES-003.

Round 2. Same reviewers. Verdict: approve with changes.

- Major (Codex): the gate's blanket `.theme-` exclusion let a new
  consumer keyed on `body`'s mode class pass. Resolved: removed, seeded,
  re-run; render parity (gate check 2) is now automated too.
- Major (Codex): the modal fallback added the host class without removing
  the other, so a retained modal could hold both. Resolved:
  `setModeClass` clears both first; tested.
- Major: `rerender()` released every root before `update()`, leaving rows
  `update()` keeps unfollowed. Resolved: per-row release only there.
- Minor (Codex): the gate grammar accepted border `#12345` and a negative
  blur. Resolved: rejected and seeded.
- Minor: ADR-017 still had the Theme setting drive the settings error
  line. Resolved in place.
- Minor: a 404 in both gate runs. Resolved: Obsidian's bundle images
  served as empty SVGs; no console error remains.
- Owed to the manual matrix (ADR-017): Mermaid's inversion under forced
  colors, community themes, Windows high contrast.

## Outcome

accepted. `KNOWN_BELOW` (10 text pairs at the mock's values) is the
owner's retune list; the probe folder lands in `docs/records/verification/`
once ESLint ignores it.
