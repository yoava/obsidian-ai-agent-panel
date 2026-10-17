---
status: closed
release: r06-panel-redesign
number: 031
prd: PRD-001.R34, PRD-001.R25
---

# TASK-031 — Theme

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 1: the "Theme" setting and the forced Light and Dark modes,
resolved in a hidden same-origin document under Obsidian's default theme only.
PRD-001.R25 lands here for the theme row and the Appearance heading; its
prompt rows land in 035.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R34, R25; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
Forced-theme mechanism, R34's last clauses, Validation;
[DES-003](../../../current/design/DES-003-panel-ui.md) Settings that reach the
panel, Token contract, Build order;
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md) (the
new row syncs).

Acceptance:

1. "Theme" sits under an "Appearance" heading with Match Obsidian (default),
   Light and Dark; it syncs by default; a stored value outside the three
   loads as Match Obsidian. A change reaches open panels at once.
2. Match Obsidian forces nothing and creates no frame.
3. Light or Dark, differing from Obsidian's mode, under the default theme:
   the panel and every plugin modal draw with the colors Obsidian uses in
   that mode; Obsidian's menus, tooltips and notices keep Obsidian's mode.
4. Under a community theme the panel keeps Obsidian's mode and the setting
   shows "Light and Dark apply with Obsidian's default theme only."; with
   colors equal in both modes, "Light and Dark have no effect with this
   Obsidian setup."; when reading fails, "Light and Dark are unavailable:
   Obsidian's colors could not be read." and the error in `console.error`.
5. A mode switch, an accent change, a font-size change, and a plugin enabled
   or disabled while forced each re-resolve in one pass per frame; roots are
   written only when values change, inside the theme-switch fence (no
   transition flash).
6. A panel in a pop-out window takes the same values.
7. Unload removes every property and class from every root, disconnects the
   observer and removes the frame; the frame makes no network request.
8. Every `Modal`, `SuggestModal` and `FuzzySuggestModal` subclass calls
   `themeModal` in `onOpen` and its detach in `onClose`; the architecture
   test now checks U5's `themeModal` clause.

## Scope

Expected files:

- New: `src/state/theme.ts` (`forcedMode`, the property-map difference),
  `src/theme-resolver.ts` (layer 3), `tests/state-theme.test.mjs`.
- Changed: `src/settings-core.ts` (key, default, validation),
  `src/settings.ts` (Appearance heading, Theme row, its three notes),
  `src/main.ts` (the resolver as a child component), `src/view.ts`
  (`attach(root)`); the modals: `src/history.ts`, `src/confirm-modal.ts`,
  `src/suggest.ts`, `src/diffview.ts`, `src/usage.ts`; `styles.css` (the
  fence rule, the scope class on modals); `package.json` (`pretest`);
  `tests/settings-core.test.mjs`; `tests/architecture.test.mjs` (U5's
  `themeModal` clause on).
- Docs: DES-001 (the Theme row, its default, when it applies; the
  resolver's row; `app.customCss.theme` and `app.customCss.styleEl` on the
  private-API list); DES-005 (the key); `README.md` (feature list);
  `docs/current/DEVELOPMENT.md` (spec row); `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record of the manual rows.

Negative scope:

- Forced modes under community themes, an accent setting, a palette of the
  plugin's own (PRD-001 non-goals, ADR-017).
- Converting legacy rules to tokens; Obsidian's menus, tooltips and notices;
  vault embeds that read the mode from `body` (ADR-017 residuals).
- The prompt rows and the Messages heading (035).
- No new dependency; the architecture-test edit above is the only protected
  path, tightening only (owner's 2026-10-11 instruction, recorded in the Run log;
  a loosening edit stops for the owner); no real-CLI
  run.

## Plan

- Tests first: `forcedMode(setting, obsidianIsDark, defaultThemeInEffect)`
  over every combination; the property-map difference (added, changed,
  removed); the setting's default and its load validation. Names start with
  `PRD-001.R34` or `PRD-001.R25`.
- `theme-resolver` exactly as ADR-017's mechanism: lazy start after
  `onLayoutReady` while a mode is forced; the default-theme test with the
  `css-change` guard; a hidden `iframe` on the main window's body with no
  source, adopting sheets constructed in its own window (skip `@import`,
  disabled and unreadable sheets; cache by identity, text and rule count);
  a mirrored body with the mode class swapped; the self-check; triggers
  coalesced to one pass per frame; writes inside the fence; full unload.
- Verification: `make verify`; manual, by someone other than the
  implementer: M3 (Obsidian light and dark × Match, Light, Dark; default and
  one community theme; started with a community theme and Light set; accent,
  font size, mode switch, a plugin toggled; each modal while forced), M5,
  M7, and M8's forced-theme profile with 30,000 elements in the workspace;
  DevTools shows no request from the frame; heap snapshots with and without
  it. Codex cross-review before commit: the frame and the sheet
  serialization must load and run nothing.
- Risks: the untyped `customCss` fields change in an Obsidian upgrade (each
  upgrade is an M3 row); a theme still loading read as the default one (the
  `css-change` guard); the one-off setup (43 to 52 ms in the probe) exceeding
  100 ms in a real workspace, then split into 500-rule chunks (ADR-017); a
  snippet's width media query resolved in the zero-width frame (residual).
- Rejected (ADR-017): re-scoping Obsidian's theme class (fails with the
  default theme), a plugin palette, swapping the live body's class (127 to
  163 ms at 30,000 elements).

## Run log

- Tests first: `state-theme` failed on import (no `state/theme`);
  `settings-core`'s two theme tests failed (`theme` undefined); the
  architecture test's tree check failed on the six modals without
  `themeModal` (`ConfirmModal`, `RestoreConfirmModal`, `SessionChangesModal`,
  `ConversationPickerModal`, `AddContextModal`, `UsageDetailModal`). Its
  fixture self-test seeds `Unthemed` (calls `themeModal` on another object),
  `NoOpen` (no `onOpen`), `Overrides` (a subclass's own `onOpen` without
  it) and `Bare` (through `import * as obsidian`), and finds exactly those,
  not `Themed`, `Inherits` or `CallsSuper`; the seeds added after the Codex
  review below are found too.
- Protected path: `tests/architecture.test.mjs` gains U5's `themeModal`
  clause and its fixtures; a rule added, nothing loosened, under the owner's
  instruction of 2026-10-11, for the owner to confirm. Ask-first
  `package.json`: `pretest` gains `src/state/theme.ts`.
- Choices the accepted docs leave open, for review:
  - `state/theme` also holds `defaultThemeInEffect` and `takesEffect`, pure
    and tested (AGENTS.md design rule 4), beside ADR-017's `forcedMode` and
    property-map difference (`modeDifference` between the modes,
    `propertyChanges` on a root).
  - A property only Obsidian's mode has a value for is set to `initial` on
    roots, unset as in the forced mode; an empty value counts as absent in
    either mode, since writing "" would remove the property instead.
  - Self-check: no effect when neither `--background-primary` nor
    `--text-normal` differs. A read missing either property in Obsidian's
    mode is a read failure.
  - `app.customCss` of another shape (an Obsidian upgrade) is a read
    failure: nothing forced, the read-failure note, the error in
    `console.error`.
  - The `css-change` guard is kept per configured theme: the theme's name is
    recorded at each `css-change`, and an empty theme style element counts
    as the default theme only when it names the configured theme, so a
    switch to a community theme still loading is not taken for the default
    one. It counts from the resolver's load with the plugin.
  - Passes coalesce on the first animation frame of the main window or the
    focused one: a minimized main window gets no frames, a closed pop-out
    none ever.
  - The frame carries `sandbox="allow-same-origin"` (its own scripts off,
    the parent's access kept) and a `Content-Security-Policy` meta,
    `default-src 'none'; style-src 'unsafe-inline'`, so no `url()`,
    `@font-face` or image in a copied sheet can fetch; the inline style is
    allowed for the mirrored body. A frame that lost its document or policy
    is replaced, with its sheet copies, on the next pass.
  - A head change triggers a pass only when a style or link element is
    added, removed or changed (`touchesSheets`, pure and tested), not the
    title each note switch sets.
  - The observers run while Theme is Light or Dark; the frame is created by
    the first pass that forces; Match removes the frame and the sheet copies,
    so a later Light serializes again.
  - `themeModal` themes `modalEl` and gives it `ai-agent-panel-scope`; the
    backdrop keeps Obsidian's mode, as it dims Obsidian. The two
    `FuzzySuggestModal` subclasses call `super.onOpen()` and
    `super.onClose()` around it.
  - The note is a line in the Theme row's description, redrawn on the
    resolver's `status` event while the tab shows. "Appearance" follows
    "Conversations".
  - No `docs/records/verification/` record: the rows below are run by
    someone other than the implementer, who records them.
- Codex cross-review of the frame, the sheet copies and the rule
  (5be38fd). Fixed: loads were prevented only by Chromium's laziness in a
  hidden frame (sandbox and fetch policy added); the theme-loading guard was
  a lifetime latch (now per theme); a pass requested in a pop-out that then
  closed was lost (now also the main window's frame); the rule did not check
  the detach in `onClose` or class expressions (both added, with fixtures
  `NeverDetached`, `SkipsSuperClose` and an anonymous class). Kept: a
  sheet changed through the CSSOM with its rule count unchanged, and inline
  values another component writes on a root, stay stale until the next
  change (ADR-017's unsignalled-styling residual); only `body` is mirrored,
  per ADR-017 (rules keyed on `html` state resolve as on the host); the
  per-modal detach field instead of themed base classes, since ADR-017
  names `themeModal`. A follow-up confirmed the sandbox and the policy
  leave the read working (90 to 95% confidence, static) and found a closed
  focused window could break scheduling (closed windows now skipped, one
  run per request). Residual: the same community theme reloading with its
  style element briefly empty reads as the default theme for that moment;
  the rule follows the repository's pattern only (no dead-branch
  analysis, `onOpen` as a method).
- Replayed onto main at 16ec436 (030 landed with API changes); conflicts in
  `package.json`, `plan.md`, DES-005 and the architecture test's fixtures
  were merges of both sides.
- Independent review, run against Obsidian 1.14.4's `app.css` in headless
  Chromium. Fixed, tests first where logic changed:
  - D1: `color`, `caret-color` and `scrollbar-color` are set on `body`
    through `var()` and inherit resolved, so modal text and the composer
    caret kept Obsidian's mode. The resolver now reads them on the frame
    body in both modes and writes the differing ones like the custom
    properties; the mirrored body classes keep `hide-cursor` and
    `styled-scrollbars` in the read. New test: inherited properties differ
    like custom ones (passes on the pure function as it was; the defect was
    in what the resolver read).
  - G1: a forced value of "" was written as a removal. Failed first:
    `modeDifference` returned `--emptied: ""` and `--both-empty: " "`.
  - G2: `@font-face` rules are skipped like `@import`; the policy stays.
  - G3: head records count only through `touchesSheets`. Failed first on
    import (no `touchesSheets`).
  - G4: U5 also flags `new` of Obsidian's `Modal`, `SuggestModal` or
    `FuzzySuggestModal`, named or through a namespace. Failed first on the
    two seeded `new Modal(app)` fixtures; `new Themed(app)` passes. A rule
    added, nothing loosened, for the owner to confirm. Residual: a
    parenthesized callee (`new (Modal)(app)`) and a local alias
    (`const M = Modal; new M(app)`) are not seen.
  - N2: ADR-017 (ask-first, lead-authorized maintenance, for the owner to
    confirm): Read takes the three inherited properties and the empty-value
    rule; Frame takes the sandbox, the policy and the `@font-face` skip;
    Residuals take page previews of vault links in replies. Beyond the
    authorization, for the owner to confirm: the default-theme bullet says
    the `css-change` counts per theme since load, and Triggers says which
    head changes count. SECURITY.md's hardening list and DES-001's
    ownership row name the frame and `theme-resolver`.
- Review round 2 nits: a sheet's copy is also keyed by its media
  (`sameSource`, pure; its test failed first on import), since a `media`
  change keeps the sheet's identity, text and rule count; DES-001 and the
  resolver's comments name the three inherited properties; ADR-017 drops
  the inferred "no font or image load from the hidden frame" (designed out
  and probed), gives the policy's rationale and adds media to the cache
  bullet.
- Owed by hand, in a desktop vault (DEVELOPMENT.md, "Running the panel
  against the fake CLI"), panel at 300 px and 1040 px:
  1. Settings: "Appearance" with "Theme" (Match Obsidian, Light, Dark),
     cloud badge synced; settings search finds "Theme" (1.13+), and the note
     shows there and follows a status change; the tab below 1.13;
     `"theme": "blue"` in `data.json` loads as Match Obsidian.
  2. M3, default theme, Obsidian light, then dark: Match draws Obsidian's
     mode and DevTools shows no `.ai-agent-panel-theme-frame`; the setting
     equal to Obsidian's mode forces nothing and shows no note; the other
     mode draws the panel, the `@` and `/` lists and each modal (history
     picker, attach picker, delete confirmation, restore preview, changes
     this conversation, plan usage) in it at once, modal text and the
     composer caret included, while the status-line menus, tooltips and
     Notices keep Obsidian's mode; no transition flash on any switch.
  3. While forced: Obsidian's mode switched both ways, the accent changed,
     the font size changed, a plugin with a `styles.css` enabled and
     disabled, a snippet changing `--background-primary` toggled: each
     re-resolves, one pass per frame in a Performance recording.
  4. A named community theme: Light and Dark draw Obsidian's mode with "Light
     and Dark apply with Obsidian's default theme only."; back to the default
     theme, forced again. Obsidian restarted with a community theme and Light
     set: never forced, then the default theme: forced.
  5. A snippet making `--background-primary` and `--text-normal` equal in
     both modes: "Light and Dark have no effect with this Obsidian setup.",
     nothing forced.
  6. In the console, `app.customCss.theme = 5`, then a mode switch: "Light
     and Dark are unavailable: Obsidian's colors could not be read." and the
     `console.error`; `app.customCss.theme = ""` restores it.
  7. M5: the panel in a pop-out window takes the values; a mode switch made
     while working in the pop-out reaches it.
  8. Match after a forced mode, and disabling the plugin while forced: no
     frame left, no `theme-light`, `theme-dark`, `is-switching-theme`,
     inline `--*`, `color`, `caret-color` or `scrollbar-color` on a panel
     root or modal.
  9. DevTools Network while forcing with a snippet holding `@import`, an
     `@font-face` `url()` and a mode-dependent `background-image`: no
     request from the frame, whose element shows `sandbox` and the policy
     meta; the console shows no policy error other than such blocked
     fetches. A heap snapshot with and without the frame.
  10. M7: reduced motion; Windows high contrast (Theme has no visible
      effect).
  11. M8: forced, 30,000 elements in the workspace: R29 profiles of opening
      a forced panel and of a mode switch. This row decides the first
      pass's cost: under 100 ms, or ADR-017's 500-rule chunks follow.

## Independent review

Round 1: a review agent, not the implementer, ran the resolver in headless
Chromium 148 against Obsidian 1.14.4's `app.css`. Findings:

1. Defect D1: `color`, `caret-color` and `scrollbar-color` resolve on
   `body` through `var()` and inherit resolved, so plugin modals drew
   Obsidian-mode text on the forced background and the composer caret kept
   Obsidian's mode. Fixed: read and written like the custom properties.
2. G1: a forced value of "" was written as a removal. Fixed: an empty
   value counts as absent; test.
3. G2: the frame tried to fetch Obsidian's fonts, refused by its policy and
   logged. Fixed: `@font-face` skipped; the policy kept.
4. G3: the head observer re-read on every note switch (the title). Fixed:
   `touchesSheets`; tests.
5. G4: U5 missed `new Modal(app)`. Fixed: flagged; fixtures.
6. Nits N1 to N5 (Run log wording, ADR-017's Frame and residuals,
   SECURITY.md and DES-001, a frame that lost its policy replaced, manual
   rows 1 and 11). Fixed.

Round 2: the same reviewer; every round 1 finding verified fixed in the
browser. Nits: the cache key lacked media; three places named only custom
properties; ADR-017 kept a now-settled inference and a history-style
clause; the new-modal check's residual forms unrecorded. Fixed (Run log).

## Outcome

Built and reviewed; for the owner to confirm before it lands:

- ADR-017 edits, ask-first. Lead-authorized: Read (the three inherited
  properties, the empty-value rule), Frame (sandbox, policy and its
  rationale, `@font-face` skipped, media in the cache key), Residuals (page
  previews of vault links in replies), the inferred no-load line dropped.
  Beyond that authorization: the default-theme bullet (`css-change` per
  theme since load) and Triggers (which head changes count).
- `tests/architecture.test.mjs`, protected: U5's `themeModal` clause (the
  detach in `onClose`, class expressions, `new` of Obsidian's modals) with
  its fixtures; rules added, nothing loosened.
- Manual rows 1 to 11 of the Run log, run and recorded in
  `docs/records/verification/` by someone other than the implementer; row
  11 (M8) decides whether the first pass needs ADR-017's 500-rule chunks.
