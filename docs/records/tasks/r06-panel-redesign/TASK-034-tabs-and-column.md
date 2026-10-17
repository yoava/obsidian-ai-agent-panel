---
status: closed
release: r06-panel-redesign
number: 034
prd: PRD-001.R7, PRD-001.R8, PRD-001.R10
---

# TASK-034 — Tabs and column

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 4: the tab strip, the switcher with its open-tabs list, and the
conversation column as components over `state/tabs` and `state/layout`, and
the shared 1 s ticker. The column's PRD-001.R9 clauses are built here; R9
lands with "More" in 036.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7, R8, R10 (R9, R29's ticker clause, R30's switcher clauses);
[DES-003](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column, Tab activity, Layout model, Keyboard and accessibility;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) Size,
visibility, timers; DES-005 device-local keys.

Acceptance:

1. Strip or column: Top, Side, or Automatic with the column from an 820 px
   panel (780 px while shown), re-checked on every resize and at once on a
   "Conversation tabs" change; `ui/shell` fires `layout`.
2. Column width: unset is 26% of the panel within 220 to 300 px and at most
   half the panel; the handle drags from 140 px to the smaller of 480 px and
   half the pane; double-click clears it; a stored 180 px reads as unset; the
   width is device-local.
3. Tab item: pin glyph or `dotState` (working and writing pulse, waiting
   steady and titled "Waiting for you", idle none), title, close button on
   hover and on the active tab; `tablist` "Conversations" with roving
   `tabindex`, Left, Right, Home, End, Enter, Space and Delete.
4. Tab hover card: PRD-001.R7's lines, the prompt count from `state/prompts`,
   the elapsed time ticking while shown, the conversation's cost when above
   zero.
5. Switch keeps each tab's draft, chips, images, status line and scroll
   position, scrolling to the bottom when the tab was within 120 px of it.
6. Close: without asking unless a turn runs or a card waits, then after
   confirmation; the tab's `Component` is removed; the last tab closed opens
   a fresh one.
7. Drag reorders unpinned open tabs in the strip and in the column's Open
   section; the strip scrolls sideways on the wheel and near its edges; the
   chevron shows while it overflows and opens the open-tabs list.
8. Below a 360 px main column in strip layout, the switcher (state dot,
   title, count; "Switch conversation, N open") replaces the strip; its list
   ("Open conversations") shows every open tab pinned first with its state
   as icon and text, a check on the active one, then "Previous
   conversations…".
9. The column: sections, filter, collapse kept per device, keyed rows that
   write nothing for an unchanged key, row menu (right-click, 500 ms touch
   hold, Shift+F10, context-menu key), hover pin, Delete through `view`
   (PRD-001.R10: confirmation, failure text, detached tab).
10. Every per-second label (today's typing indicator, the tab hover card)
    runs on `state/ticker`, which runs only while a subscriber is shown;
    `view` has no repeating timer, and the allowlist loses its P3 row.

## Scope

Expected files:

- New: `src/state/tabs.ts`, `src/state/layout.ts`, `src/state/ticker.ts`,
  `src/state/prompts.ts` (prompt count only), `src/ui/tab-strip.ts`,
  `src/ui/switcher.ts`, `src/ui/conversation-column.ts`, and
  `tests/state-tabs.test.mjs`, `tests/state-layout.test.mjs`,
  `tests/state-ticker.test.mjs`, `tests/state-prompts.test.mjs`.
- Changed: `src/tabs-layout.ts` (width rules; the threshold moves to
  `state/layout`), `src/conversation-list.ts` (the unchanged-input key),
  `src/timers.ts` (takes the element's window, ADR-016), `src/state/tab.ts`
  (scroll position, the close rule), `src/ui/shell.ts` (the column handle),
  `src/ui/header.ts` (nav area), `src/view.ts` (`history` event),
  `styles.css`, `package.json` (`pretest`); `tests/tabs-layout.test.mjs`,
  `tests/conversation-list.test.mjs`, `tests/state-tab.test.mjs`,
  `tests/timers.test.mjs`, `tests/architecture.test.mjs` (the P3 row out).
- Docs: DES-005 (the column width read as unset at 180 px); `README.md`
  (tabs and column bullets); `docs/current/DEVELOPMENT.md`;
  `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- Title block, "More", "Previous conversations" from "More" (036); turn head
  timing (037); the conversation-cost wording in DES-007 (037).
- `HistoryStore`, pins on disk and `DeleteConversationModal` behavior
  (DES-005, unchanged).
- No new dependency; the allowlist edit above is the only protected path,
  tightening only (owner's 2026-10-11 instruction, recorded in the Run log;
  a loosening edit stops for the owner); no real-CLI run.

## Plan

- Tests first: order (pinned first, then drag order), `dotState`, hover-card
  and accessible-label lines, the switcher label (`PRD-001.R7`, `R28`,
  `R30`); `activity` and the close-confirmation rule (`PRD-001.R7`); 820 and
  780 px, Top, Side (`PRD-001.R8`); unset width, half-panel cap, drag range,
  stored 180 px (`PRD-001.R8`); the unchanged-input key (`PRD-001.R29`); the
  ticker runs only while a subscriber is shown and stops at none
  (`PRD-001.R29`); prompt count (`PRD-001.R7`).
- Moves out of `view.ts`: `addTab`'s tab element, `applyTabPosition`,
  `setupSideResizer`, `sideLayoutIsAutomatic`, the side-width methods,
  `stripOrder`, `columnEntries`, `columnKey`, `renderTabList`,
  `renderColumnSections`, `emptyRecentText`, `toggleSection`,
  `loadSectionState`, `renderColumnRow`, `createPinToggle`,
  `updateTabOverflow`, `scrollTabIntoView`, `openTabMenu` (becomes the
  open-tabs list), `makeTabDraggable`, `refreshTabTooltip`, `setTabBusy`,
  `updateTabTitle`, `updateBusyTimer`, `updateTypingTime`. `view` keeps the
  tab list, `saveTabState`, `restoreTabState`, `togglePin`, delete and
  export intents.
- Allowlist: the `src/view.ts` P3 row (repeating timer) goes with
  `updateBusyTimer`.
- Verification: `make verify`; manual, by someone other than the
  implementer: M1 (every width; 780 to 840 px), M6 (strip, column, menus by
  keyboard), M5 (ticker in a pop-out window), R7's rows (switch restores
  draft, scroll, chips and status line; close confirmation; drag; chevron;
  reopen restores the tabs), R8's (drag, double-click), R10's (confirmation,
  failure text, detached tab); 60 s idle with no timer (M8's idle part).
- Risks: renders during a drag losing the drop (renders wait while a drag
  runs); the ticker kept alive by a hidden subscriber (shown state re-checked
  on tab switch, resize, `layout-change`, `active-leaf-change`,
  `visibilitychange`).
- Rejected: strip and column moving the same tab elements (DES-003
  Alternatives: a component owns one subtree); the open-tabs list as a
  `Menu` (not a dialog named by its title, R32).

## Run log

- Tests first, against 032's tree with empty `state/tabs`, `state/layout`,
  `state/ticker` and `state/prompts` stubs: `state-tabs`, `state-layout`,
  `state-ticker`, `state-prompts`, `tabs-layout`, `conversation-list` and
  `state-tab` failed on import (no `dotState`, `COLUMN_FROM_PX`, `TICK_MS`,
  `promptCount`, `COLUMN_MAX_PX`, `columnEntries`, `closeNeedsConfirmation`;
  later `emptyRecentText`); `timers` failed "ADR-016: a timer runs on the
  window it is given".
- Protected path, under the owner's instruction of 2026-10-11, for the owner
  to confirm: `tests/architecture.test.mjs` loses the allowlist's `view` P3
  row (repeating timer), which `updateBusyTimer` held; tightening only.
  Ask-first `package.json`: `pretest` gains the four state modules.
- Choices the accepted docs leave open, for review:
  - The strip, the switcher and the column are mounted only while their
    layout shows (the view adds and removes them on `layout`), so a hidden
    one renders nothing; each removes its root on unload.
  - A strip tab keeps today's row menu (right-click, Shift+F10, touch hold):
    without it Top layout could not pin, export or delete. The column
    exports `showRowMenu`, which the view opens for a tab; DES-003's strip
    intents gain `onMenu`, the column's `onReorder`.
  - A pinned tab's pin takes the dot's state (pulsing while working, warning
    color and "Waiting for you" while waiting), so PRD-001.R7's busy and
    waiting marks stay on pinned tabs; the accessible name is the title,
    "pinned", and the state in words (PRD-001.R28).
  - Strip and column rows are keyed: `syncChildren` moves only elements out
    of place; `writeClass` skips a class already as asked, since
    `toggleClass` rewrites the attribute. The column's key
    (`conversation-list`'s `columnKey`) also covers titles, since the column
    now draws open rows' titles; activity and the active row are written
    outside the key, set-if-changed.
  - Column rows are a `listitem` holding the row button, a hover pin button
    and, for open rows, a close button (`tabindex="-1"`, as the strip's);
    nested buttons inside one button would be invalid. Recent's date
    groups are each a `list` under their header.
  - The column's drag reads no geometry (P4 does not list it): entering a
    row moves the dragged one past it, toward where it came from. The
    strip keeps today's midpoint rule. Both accept a drop on the dragged
    element itself, where it sits under the pointer after moving.
  - The keyboard menu is the `contextmenu` event Shift+F10 and the
    context-menu key fire at the focused row; no key handler of its own.
  - The active column row is scrolled into view (`scrollIntoView`,
    nearest) on `active` only, so a save does not fight the user's scroll.
  - The 120 px follow rule (`FOLLOW_BOTTOM_PX`) moved to `state/tab`; the
    scroll position is `ChatTab` data without an event.
  - `formatElapsed` sits in `state/tabs` until 037 adds `state/turn`; the
    typing indicator ticks only for the active tab while the panel shows,
    and catches up on a switch.
  - The tab card's start time is HH:MM on the same day, else the date
    before it; its cost is four decimals below $1 and two from $1, as the
    context segment wrote it.
  - `columnLayout` keeps the layout while the panel measures 0 px (hidden),
    so a hidden view does not flip to the strip.
  - Width: `stored` and `drawn` in `ui/shell`; a drag stores at its end only
    when it moved; a double-click stores null (`saveLocalStorage` clears
    the key), so DES-005 now says the plugin deletes that key.
  - The open-tabs list is a radio group (the check is `aria-checked`), each
    row's state its icon and description, then "Previous conversations…"
    in a popover footer.
- Self-check in headless Chromium with Obsidian 1.14.4's `enhance.js` and
  `app.css` (the 032 review's harness, components mounted on stub sources):
  found and fixed the strip's visually hidden names widening the main
  column's scroll width (tabs and rows now `position: relative`), an
  unchanged column key still rewriting 15 class attributes (`writeClass`),
  a click on the handle storing the width (each half of a double-click),
  and the column's drop never firing (its rows did not cancel `dragenter`
  or `dragover`). Checked: order, glyphs and names, roving keys, Delete,
  chevron and fades, reveal, the list down from the chevron and the
  switcher, 300 px switcher, column sections, filter and Escape, collapse,
  row menus, pin, 780/820 px, handle drag and double-click, drag in both.
- Codex cross-review of the diff (4ecbc5f..59e2000, then a follow-up on
  the fixes). Fixed: two unsaved tabs swapped kept the column's key (the
  key now holds the tabs' own keys in drag order, `openKeys`, test first,
  and open rows find their tab by key, not position); a reopen into the
  active empty tab moved its row out of view (`revealActive` after it);
  the open-tabs list went stale while open (it now redraws on `tabs` from
  live sources, refocusing the same tab, each drawing's listeners released
  with it). Kept: a popover whose trigger a container query hides stays
  open on this base (033's trigger `ResizeObserver` closes it, so nothing
  is duplicated here); Recent's relative times refresh on the next render,
  not on a timer, since DES-003's Idle row allows none (Codex agreed).
- Replayed onto `main` at e135e7f (033 landed as bc52e25, with its
  hover-card host): the five wip commits applied as one three-way patch.
  Conflicts kept both sides: `pretest` lists `state/usage-segment` then
  the four new state modules; RELEASE_NOTES, DEVELOPMENT.md's test table
  and DES-001's view lifecycle keep 033's lines beside these; `view` keeps
  033's hover-card host and drops its own usage scheduling, so
  `onSettingsChanged` went. `styles.css` was redone on 033's file (this
  change's sections re-added, its copies of 033's popover footer and text
  button dropped). Then:
  - The tab card goes through the hover-card host; the stand-in is gone.
    `state/popover` gains `placeBelow` and `opensDown` (tests first, each
    failing on import): the popover host's "down" uses `placeBelow`
    beside 033's `placeAbove`/`placeInline`, and a hover card takes a
    direction: down for a strip tab, up for the status line, and for a
    column row, which sits beside the main column whose layer holds the
    card, up where it fits, else down (at the main column's inline-end
    edge, as `placeInline` clamps it).
  - The card's cost is the conversation's (`status.costUsd`), which 033
    took off the status line. `ClaudeSession.totalCostUsd` lost its last
    reader, today's tab tooltip: removed with its `session.test.mjs`
    assertion and DES-007's "Session cost" row; DES-007's conversation
    cost row names the card. RELEASE_NOTES' 033 line says the card shows
    the cost too.
  - The hover-card host watches the main column only, so a column row
    leaving the DOM drops its card through the column's own `detach`,
    as the strip's items do.
  - 033's trigger `ResizeObserver` closes the open-tabs list when a
    container query hides its trigger (Codex's kept finding).
  - Chromium self-check on the replayed tree, with the real host: a tab's
    card opens below it, its elapsed time ticks each second while shown,
    and the ticker stops at the first tick after it hides; column rows'
    cards open up beside the column; a popover opening drops the card; a
    removed tab drops its card; the list closes at 300 px; Automatic flips
    at 820 and 780 px; the earlier checks pass.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer:
  1. M1: panel 300, 360, 440, 680 and 1040 px, "Conversation tabs"
     Automatic: the strip from 360 px, the switcher below it, the column
     from 820 px; widening from 779 to 820 px and narrowing from 820 to
     779 px flips at 820 and 780 px only; Top and Side force their layout
     and a settings change re-lays out at once; no horizontal scroll bar.
  2. Column width: unset, 26% of the panel within 220 to 300 px; the
     handle drags from 140 px to the smaller of 480 px and half the panel,
     a narrow panel caps it and widening restores it; a double-click
     returns to the unset width and clears `ai-agent-panel:side-width`; a
     stored 180 reads as unset; the width survives a reload on this device.
  3. Tabs: pinned first with a pin, a pulsing dot while working (`basic`),
     a steady orange dot titled "Waiting for you" (`permission`); x on
     hover and on the active tab; middle-click closes; a screen reader
     reads the tablist "Conversations" and each tab's state.
  4. M6, keyboard: Tab reaches the active tab; Left, Right, Home and End
     move; Enter or Space selects; Delete closes; Shift+F10 opens the row
     menu; in the column every row, section header, the filter and "+"
     are reachable, Escape clears the filter, Shift+F10 and the
     context-menu key open the row menu.
  5. Switch: each tab keeps its draft, chips, images, status line and
     scroll position; a tab within 120 px of its end comes back at the end.
  6. Close: an idle tab closes at once; a tab in a turn (`basic` mid-turn)
     or with a waiting card (`permission`) asks first and closes only on
     confirm; the last tab closed opens a fresh one; reopen restores the
     open tabs and the active one.
  7. Drag: unpinned tabs reorder in the strip and in the column's Open
     section, with a filter set too; pinned tabs neither move nor take a
     drop; a cancelled drag (Escape) restores the order; the order
     survives a reload.
  8. Overflow: with ten tabs the strip scrolls on the wheel and on a tab
     dragged to an edge; the chevron shows only while it overflows; the
     chevron and the switcher open "Open conversations" down from the top,
     pinned first, each state as icon and text, the active checked,
     "Previous conversations…" last; the list follows a tab changing state
     while open.
  9. Column: Pinned (only when not empty), Open with its count, Recent
     with date groups and "Loading…", "No matches", "No other matches",
     "No previous conversations"; collapse kept after a reload; the hover
     pin pins and unpins without opening; the row menu by right-click,
     a 500 ms touch hold, Shift+F10; Delete asks, deletes, and detaches an
     open tab; a failed delete shows "Could not delete that conversation."
     and leaves the tab attached; "+" clears the filter.
  10. M5: strip, switcher list, column and row menus in a pop-out window.
  11. Tab hover card: after 500 ms, or on keyboard focus, below a strip
      tab and beside a column row, with the state, prompt count, model,
      mode, start and the cost above zero; the elapsed time ticks while it
      shows; none while a popover is open.
  12. M8 idle: 60 s idle with no turn, no hover card: a Performance
      recording shows no timer; during a turn the typing indicator ticks
      once a second only while its tab shows.

## Independent review

A review agent, not the implementer, mounted the real `Shell`, `Header`,
popover and hover-card hosts, `TabStrip`, `Switcher`, `OpenTabsList`,
`ConversationColumn`, `showRowMenu` and `Ticker` in headless Chromium with
Obsidian's `enhance.js` and `app.css`; `make verify` passed. Every
departure in the Run log agreed. Findings, fixed, `make verify` after:

1. D1: reduced motion did not stop the busy dot's pulse: the reduce rule
   (0,1,0) lost to the pulse rules (0,2,0). The pulse now sits inside
   `prefers-reduced-motion: no-preference`; checked in Chromium with the
   preference emulated.
2. G1: Delete on a focused tab other than the active one left focus on
   `body`. The strip now gives focus to the tab now at the closed tab's
   place (the last one when it was last), whenever the closed tab had it;
   checked in Chromium.
3. N1: the ticker's `visibilitychange` listener stayed on the first
   document after "Move to new window". `ui/dom`'s `onOwnDocument` moves a
   document listener with its element (`onWindowMigrated`), used by the
   view's ticker and by the status line, whose own copy it replaces.

## Outcome

Built, reviewed and replayed onto `main`; the strip, switcher and
conversation column run on `state/tabs`, `state/layout` and the shared
ticker. For the owner:

- `tests/architecture.test.mjs`, protected: the allowlist's `view` P3 row
  removed (tightening only, under the instruction of 2026-10-11).
- Manual rows 1 to 12 of the Run log, run and recorded in
  `docs/records/verification/` by someone other than the implementer.
