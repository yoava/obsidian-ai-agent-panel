---
status: closed
release: r07-mock-fidelity
number: 059
prd: PRD-001.R34
---

# TASK-059 — Board tabs

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The tabs on top draw as the "Redesign dark/light" boards' tab frame, built on
Obsidian's tab markup so they look the same in every workspace placement.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R34; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Tabs
(override table) and Validation;
[DES-003](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column, Token contract.

Acceptance:

1. `ui/tab-strip` renders `.workspace-tab-header-container` > `-inner` > the
   tab list > `.workspace-tab-header` > `-inner` (icon with the glyph, title,
   status container, close button) under `.ai-agent-panel-board`; roles,
   names, keyboard, hover cards, drag, pin, close and middle-click unchanged.
2. `styles.css`: the board's `--tab-*` values; `!important` only on exactly
   the override table's declarations; no `ai-agent-panel-tab`, `-tab-strip`,
   `-tab-title`, `-tab-close` or `-tab-badge` rule; the strip reads
   `--ai-agent-panel-strip`; no Obsidian `--size-*`, `--radius-*`,
   `--font-ui-*`.
3. `tests/styles.test.mjs`: `IMPORTANT_ALLOW`, the subject check, the five
   rejection seeds, the containment rewrite and its two probes.
4. Harness, both themes, 300/440/680/1040: container 30 px; active foot
   `::before`/`::after` shown; divider hidden beside the active and the
   hovered tab; title `order: 0` and icon before title in the main area, a
   stacked group, a sidebar and a pop-out; content-width tabs up to 150
   (active 170; 200/220 from 560 px); no × at rest.

## Scope

Expected files: `src/ui/tab-strip.ts`, `styles.css`, `tests/styles.test.mjs`
(item 3 only), `src/settings.ts` (a class the containment rule needs),
`src/ui/conversation-column.ts` and `src/view.ts` (the menu's `onHide`),
`tests/tooltips.test.mjs` (the ×'s reset), `src/state/tabs.ts` and
`tests/state-tabs.test.mjs` (the narrow-tab threshold),
`docs/current/adr/ADR-017-panel-css-and-forced-theme.md` (the `--tab-*` values),
`docs/current/design/DES-003-panel-ui.md`, `RELEASE_NOTES.md`, this record.

Negative scope: Obsidian's own tab headers, workspace-level CSS outside
`.ai-agent-panel-board`, new tab behaviours, token changes beyond the board's
`--tab-*` values and the four tokens the override table reads.

## Plan

1. Tests first: allow-list, subject check, seeds, containment probes; then
   fix what the containment rewrite flags elsewhere in `styles.css`.
2. Markup in `ui/tab-strip`; the tab section of `styles.css` rewritten:
   `--tab-*` on the board, restated rules, the override block.
3. Harness facts and side-by-side crops against the boards; DES-003, release
   note; `make verify`.

Deviations from the brief and ADR:

- The glyph sits in `-inner-icon`, not the status container: the boards put
  it before the title. The status container keeps change 003's badge slot.
- ADR-017 Tabs corrected in this landing (owner approves at review): it named
  `--tab-outline-color: var(--ai-agent-panel-border)`, which does not exist,
  and `--tab-font-size: -ui` (12 px). The board sets the outline transparent
  (the boards draw no ring) and `-font-size-control` (12.5 px, as the boards),
  and `--tab-background-hover: transparent` (the boards draw no hover foot).
- × hidden at rest on every tab, the active one included, per the boards
  (owner decision; SPEC Q38 said otherwise). On hover it has no fill and sits
  over the title's end, which fades under it (`-tab-title-mask`), so the
  width holds.
- Tab minimum 24 px: the board's `min-width: 0` plus its 12 + 12 padding.
- `.ai-agent-panel-tab-list` is an extra scroller: the main area's
  `-container-inner` is `overflow: clip` at (0,4,0).
- Feet only on the active tab; the hover-foot rules and their override-table
  row are dropped (the boards draw none). The list's inline padding of two curves (with the matching
  negative margin) holds the active feet, which Obsidian clips with
  `overflow-clip-margin` instead.
- The header row's strip is `.ai-agent-panel-top::before` (≥ 360 px).
- The × resets `--no-tooltip` to the token against a stacked group's
  `--no-tooltip: true`; `tests/tooltips.test.mjs` lists the rule.
- `has-active-menu` on a tab while its row menu is open: `showRowMenu` takes
  the tab as the menu's parent (`Menu.setParentElement`).
- An inactive tab under 48 px hides its × (`isNarrowTab` in `state/tabs`,
  `is-narrow` from the resize pass): the tab's `container-type: normal` turns
  off Obsidian's 3rem container rule that does this.
- `tests/styles.test.mjs` beyond item 3: an allow-listed declaration is
  exempt from the Obsidian color-variable check, since one table row reads
  `--tab-outline-color`, the only `--tab-*` name the check matches.
- The containment rewrite flagged seven selectors outside the tabs (sibling
  anchors, `.workspace-leaf-content` before the view, `:has()` anchors on
  `.setting-item-control`); rewritten, and `src/settings.ts` gives two
  setting controls `ai-agent-panel-settings-control`. The view's padding rule
  becomes `.view-content.ai-agent-panel-view`, (0,3,0) to (0,2,0), as the
  rule requires; it still follows Obsidian's (0,2,0) rule, so computed values
  are unchanged.
- The Main board predates the tab sizing (no max-width, the active tab
  shrinks); the panel sizes tabs as the responsive boards (Short, Medium,
  Narrow, Responsive).

## Run log

- Harness (Chrome 155): `-webkit-app-region` computes `no-drag` on the
  container and its inner, so the unprefixed `app-region: no-drag
  !important` overrides Obsidian's `drag` here; Electron not checked.
- Facts at 440/680/1040, both themes: container 30 px, strip
  `#222227`/`#ebebe7`, padding 0, `ltr`; active tab `bg`, 600, feet shown
  (`0 0 0 36px` in `bg`); inactive feet transparent; dividers hidden after the
  last tab, beside the active and beside a hovered tab; × hidden at rest,
  shown on hover; title order 0, icon before title.
- Placement (Main, 440, both themes): main area, sidebar, stacked, pop-out
  (no `.mod-root`), hidden-frame right space, translucent, RTL, and
  sidebar + translucent + RTL draw the same; only inactive feet's `display`
  differs (sidebar, stacked), with a transparent shadow.
- Visible title widths (px, visible/full): 440 Main: Link cleanup 32/74, Q4
  planning review 121/121, Newsletter draft 48/95; 440 Short: inactive tabs
  shrink to 24 px with no title, active 121/121; 680 and 1040 strip: all
  full (74, 121, 114, 95). 300: the switcher replaces the strip.
- 1040 with "Conversation tabs" automatic: the column shows, the strip and
  the header-row strip are absent; row glyphs pin 12 px, dots 6 px.
- Short at 440: the strip scrolls 40 px to show the active tab (existing
  behaviour); the board clips the strip's end instead. Its changes chip is
  wider than the board's, so the strip is narrower.
- Rebased onto `db6d22e`; one conflict in `styles.css` (067's
  `.ai-agent-panel-report-value > … + …` kept) and one in the release notes.
- After review: tab list `scrollWidth == clientWidth` (578/578 at 680,
  351/351 at 440), no chevron or fade, in the main area and the sidebar, both
  themes, at rest, last tab hovered, last tab active, last tab active and
  hovered. Hovered ×: no fill; title mask transparent under the last 18 px.
  Right-click sets `has-active-menu` (the harness `Menu` stub never hides,
  so removal is unverified there).
- Final pairs and board-vs-panel values: `harness/hunt-059/final/`. Diffs:
  Main 8.1/8.2 %, Short 16.8/16.9 %, Medium 7.6/7.9 %, Narrow 8.3/7.1 %,
  column 13.3/10.5 %; Medium widths within 6 px (font), Short's gap is the
  scroll and the wider changes chip.
- After re-review, both themes, main area and sidebar: Medium at 380 (tabs
  30/38/30 px) and Short at 440 (24 px): the hovered narrow tab's × stays
  hidden and a centre click selects it, closing nothing; right-click sets
  `has-active-menu` (harness stub given `setParentElement`).

## Independent review

Review 1 (coordinator's independent session): rework.

1. Feet overflowed the tab list (545/527 at 680), keeping the chevron and
   fade on. Fixed: foot room in the list's padding, inactive feet hidden.
2. Hover: the ×'s fill showed the title through it; translucent hover feet
   doubled the fill at the corners. Fixed: no fill, title fade, hover foot
   transparent.
3. Stacked groups hid the ×'s tooltip. Fixed with the reset and its test
   entry.
4. `has-active-menu` missing. Implemented (then replaced in review 2).
5. ADR-017's `--tab-*` values corrected.
6. Record wording fixed.

Review 2 (same session, re-review): approve with changes.

1. On narrow inactive tabs the × covered the click target (Medium at 380, a
   centre click closed the tab; Short at 440). Fixed: `is-narrow` below
   48 px keeps the × hidden; a unit test covers the threshold; harness
   centre clicks select.
2. `has-active-menu` through `Menu.onHide` plumbing. Replaced by
   `Menu.setParentElement(tabEl)`.
3. Hover-foot rules drew nothing. Dropped with their ADR-017 table row, its 2
   `IMPORTANT_ALLOW` entries and the ADR's "hover foot".
4. ADR-017 prose: the active foot as the code draws it (no inset ring) and
   the full list of `--tab-*` values the board sets.

## Outcome

Accepted.
