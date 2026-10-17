---
status: closed
release: r07-mock-fidelity
number: 098
prd: PRD-001.R9, PRD-001.R32
---

# TASK-098 — A row menu opens once

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Class S fix. Right-clicking a tab (or a column row) again stacked another copy
of its menu over the first, under the tab's hover card. Cause: `onRowMenu`
stops the `contextmenu` event, and Obsidian's `Menu` hides itself on a
`contextmenu` that reaches the document, so the open menu never saw it.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R9 (row menu), R32 (hover cards);
[DES-003](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column, Popover and hover card.

Acceptance:

1. At most one row menu is open: opening it again, on the same or another tab
   or row, hides the open one first.
2. No hover card shows or arms while a row menu shows; it unblocks when the
   menu goes.

## Scope

Expected files: `src/ui/conversation-column.ts` (`showRowMenu`), `src/view.ts`
(`rowMenuIntents`), DES-003.

Negative scope: the menu's items, the other menus (tab list, panel menu), the
popover host, `onRowMenu`'s events. No `RELEASE_NOTES.md` entry: the strip and
the column are unreleased. No automated test: the change is Obsidian-bound
(`Menu`), which has no automated tests; checked in the headless harness.

## Plan

`showRowMenu` keeps the open `Menu` in a module variable and hides it before
opening the next; `onHide` clears it. Two intents tell the hover-card host a
menu shows or goes, reusing its popover block. Rejected: dropping
`stopPropagation` in `onRowMenu` (it also keeps other `contextmenu` handlers
from opening Obsidian's own menus on the row).

Verification: `make verify`; harness probe, right-click tab 0 three times, then
tabs 1, 2 and 0: count `body > .menu` and visible `[role=tooltip]`. Manual
(owner, in a vault): right-click the same tab repeatedly, then another tab; at
most one menu shows and no hover card.

## Run log

Harness `Menu` is a stand-in: it never hid itself or called `onHide`; the probe
emulates Obsidian's document `contextmenu` hide and the stub now calls `onHide`.
Before: menus 1, 2, 3 on tab 0 with the card shown; after: 1, 1, 1, no card.

## Independent review

Independent review agent: approve. Every open path (right-click, Shift+F10,
the context-menu key, touch hold) goes through `showRowMenu`; `hide()` fires
`onHide` on every close path, so the hover-card block always lifts; an armed
card is cancelled when the menu opens. Not confirmed from the extracted
`app.js`: that Obsidian hides a menu on a document `contextmenu`; the fix does
not depend on it. Applied its note: a replaced menu's late hide (phone, after
the 150 ms animation) no longer lifts the block. The hover-card block is a
boolean, so a popover and a row menu open together would unblock early; a
popover closes on the pointerdown before the menu opens, so this does not
arise. `make verify` exit 0.

## Outcome

Done; the vault check is the owner's.
