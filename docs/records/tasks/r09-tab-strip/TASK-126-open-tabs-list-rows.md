---
status: closed
release: r09-tab-strip
number: 126
prd: PRD-001.R7, PRD-001.R30
---

# TASK-126 — Draw the open-tabs list like the tabs, with close buttons

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `feat`. Target, pending the owner's approval:
[change 017](../../changes/CHG-017-equal-tabs-and-open-tabs-list.md) R7 (the
list, close), R30 (the switcher's list);
[DES-003 draft](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column (All conversations, open-tabs list), Popovers, Keyboard and
accessibility, Alternatives.

Acceptance:

1. `conversationRow` and `drawOpenRow` in `ui/dom` build and draw an open
   row: the `listitem`, the main button (glyph, title, visually hidden
   name), the close button at the row's end, the state (`data-state`, the
   glyph via `writeGlyph`, `is-active`, `aria-current`, the name from
   `tabItem`); the column's time and pin are options. The conversation
   column uses them, unchanged in look and behavior.
2. The open-tabs list draws every open tab with them, without time, pin,
   drag, row menu or hover card, then "Previous conversations…": a pinned
   row shows the pin, a working one the pulsing accent dot, a waiting one
   the warning dot titled "Waiting for you", the active row the column's
   active style. No `loader` or `circle-dashed` icon and no check remain.
3. The strip's "All conversations" opens this list through `view`, as the
   switcher does (down, end-aligned to the button); the Obsidian `Menu` and
   `stateTitle` are gone. The button has `aria-haspopup="dialog"`,
   `aria-expanded` and, while the list shows, `is-open` (set by the popover host).
4. A click on a row selects its tab and closes the list. The close button
   (shown on hover, on the active row and while the row holds focus), or
   Delete on a focused row, closes that tab through `onClose` (confirmation
   rule first); the list stays open and redraws, focus moving to the row
   now in its place, else the row before it. A close that asks for
   confirmation closes the list.
5. Up, Down, Home and End move between rows; Enter or Space selects; Escape
   closes the list.
6. The list closes when its trigger hides (the strip stops overflowing, the
   layout changes).

## Scope

Expected files: `src/ui/dom.ts`, `src/ui/conversation-column.ts`,
`src/ui/switcher.ts`, `src/ui/tab-strip.ts`, `src/view.ts`,
`src/state/tabs.ts`, `styles.css`; tests `state-tabs`, `tooltips` (counts
only, each listed); docs `RELEASE_NOTES.md`, `docs/current/DEVELOPMENT.md`
(test table, if test names change), the DES-003 draft where the code
differs.

Negative scope:

- No change to the column's look or behavior, the tab widths (task 125) or
  the row menu.
- No new module (the row lives in `ui/dom`), so no edit of
  `tests/architecture.test.mjs`; no edit of `tests/styles.test.mjs`.
- No new dependency; no protected-path edit; no real-CLI run.

## Plan

- Tests first, confirmed failing: `openTabsList` rows carry what the row
  draws (key, `tabItem` view, active) and no icon or state words; the focus
  target after a close (the row in its place, else the one before).
- Verification: `make verify`; harness: the list from the chevron at 460
  and 720 px and from the switcher at 300 px, dark and light, with a pinned,
  a working, a waiting and the active tab, a row hovered and one focused;
  the column at 1040 px against the shots before the change.
- Rejected: keeping Obsidian's `Menu` and writing into its items (the API
  exposes no item element); a separate row component (a new module and an
  architecture-test edit for a builder two callers share).

## Run log

- Tests first: `focusAfterClose` and the open-tabs rows failed before the
  code (3 failures); round 2's popover test (`tab-changed` kept open by the
  content) failed first too.
- Harness (real view, `styles.css` and Obsidian 1.14.4 `app.css`): the list
  from the chevron at 460 and 720 px and from the switcher at 300 px, dark
  and light, shows the tabs' pin and state dots, the active row raised and
  its close button; hover and keyboard focus show a row's close; Delete on a
  row, the active one included, closes it and keeps the list open with
  focus on the next row; the conversation column is pixel-identical to
  before.
- Round 2 (review): closing the active row closed the list and focused the
  composer (the host closed on every tab switch); the list now keeps itself
  open only during its own close, and `switchTab` leaves focus in it. The
  roving tab stop is one row after a redraw, through a `rovingFocus` helper
  shared with `radioGroup`.

## Independent review

An Opus review agent (not the implementer), two rounds; Codex on the
DES-003 wording. Fixed: closing the active row closed the list; the keep-open
exemption covered any tab switch, not only the list's own close; the roving
tab stop drifted after a redraw; a third copy of the roving keydown block;
`has-active-menu` in the acceptance; the README feature line; the intents
and `aria-current` placement in DES-003. Final verdict: accept.

## Outcome

Done.
