---
status: closed
release: r09-tab-strip
number: 125
prd: PRD-001.R7
---

# TASK-125 — Give every tab the same width

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `feat`. Target, pending the owner's approval:
[change 017](../../changes/CHG-017-equal-tabs-and-open-tabs-list.md) R7 (widths,
"All conversations" while the strip overflows);
[DES-003 draft](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column (tab geometry, tab item, All conversations), Alternatives.

Acceptance:

1. Every strip tab, pinned and active ones too, has the same width: the
   strip's width shared equally, at most `--tab-max-width` (150 px; 200 from
   a 560 px main column) and at least 76 px. Widths differ by at most 1 px at
   any tab count, title length or panel width.
2. Tabs that do not fit at 76 px overflow the strip; wheel and drag
   scrolling, the edge fades and the active tab's reveal work as before.
3. "All conversations" shows exactly while the strip overflows, measured
   with the control as drawn, and never toggles back and forth across a
   resize.
4. The rules that only existed for content-width tabs go, with their tests:
   `stripShortfall`, `READABLE_TAB_PX`, `isNarrowTab`, `NARROW_TAB_PX`,
   `is-narrow`, the active tab's wider maximum.
5. The close button, title fade, hover card, drag and keyboard behave as
   before.

## Scope

Expected files: `styles.css` (tab width rules), `src/ui/tab-strip.ts`
(resize pass), `src/state/tabs.ts`, `tests/state-tabs.test.mjs`; docs
`RELEASE_NOTES.md`, `docs/current/DEVELOPMENT.md` (test table, if test names
change), the DES-003 draft where the code differs.

Negative scope:

- No change to the open-tabs list or the menu (task 126), the column, the
  switcher or its 360 px threshold, the tab markup or ADR-017's override
  table.
- No new dependency; no protected-path edit; no edit of
  `tests/styles.test.mjs` or `tests/architecture.test.mjs`; no real-CLI run.

## Plan

- Tests first, confirmed failing: `showsTabList` from overflow alone, with
  and without the control drawn.
- CSS: each tab `flex: 0 1 var(--tab-max-width)` with an explicit
  `min-inline-size` of 76 px, so equal bases shrink equally and no title's
  min-content widens one tab; the list fills the container so the tabs share
  its width.
- Verification: `make verify`; harness strip at 460 and 720 px, dark and
  light, with 1, 3, 7 and 12 tabs (one pinned, one working, one waiting, a
  long active title); tab widths read by `probe.mjs`.
- Rejected: Chrome's favicon-width floor (our tabs have no icon, so a tab
  that narrow shows a dot and nothing to tell it apart).

## Run log

- Tests first: the new `stripOverflows` test failed only on the missing
  export (the file aborted), since it does the old `showsTabList` arithmetic;
  the width and toggle behavior is CSS and `tab-strip`, which import
  `obsidian`, so they are recorded as manual evidence below.
- Harness (real `styles.css`, Obsidian 1.14.4 `app.css`, the real view): at
  460 px one tab is 150, three 113 each, seven and twelve 76 each with the
  control; at 720 px one 200, three 199.7, seven 85.6, twelve 76; under
  0.02 px between tabs, in the main area, a stacked group and a sidebar.
- Toggle sweep (4, 5, 7 and 12 tabs, 1, 0.5 and 0.25 px steps both ways,
  7,520 steps): the control always agreed with the overflow as drawn and
  never changed between frames at a fixed width.
- Round 2 (review): the tab that first made the strip overflow ended 28 px
  out of view, because showing the control narrowed the list after the
  reveal was measured; `write` now asks for one more reveal pass when the
  control toggles. Probed after the fix: open, add and switch at 460 and
  720 px end with the active tab 18 px clear of the list's end.

## Independent review

An Opus review agent (not the implementer). Fixed: the reveal regression
above; stale active-tab widths, `stripOverflows` and the new token missing
from the DES-003 draft; the reason for measuring with the control drawn; the
release note's missing cap; a duplicated `StripFit` field; a stale CSS
comment. Left as the owner's decision: a band of widths as wide as the
control depends on the resize direction. Final verdict: approve.

## Outcome

Done.
