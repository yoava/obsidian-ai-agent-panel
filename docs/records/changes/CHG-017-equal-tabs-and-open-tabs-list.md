# CHG-017 — Equal-width tabs and an open-tabs list drawn like the tabs

**Status:** incorporated (2026-10-16)

## Intent

The strip sizes each tab to its title, so a long active title leaves the
other tabs a few letters or a dot, and the "All conversations" menu marks a
tab's state with icons the tabs do not use, with no way to close a tab from
it. The owner's request of 2026-10-16: "tabs should have the same width
which adjusts as needed and keeps a sensible minimum width (like in chrome
in other browsers)"; "the tabs menu drop down (when there's too many tabs)
should have the same indications style as tabs for active/running/waiting
on user (it currently uses different indicators. also should code reuse if
possible)"; "tabs lists in the tabs menu drop down should have an
option/button to close the tab". Affects PRD-001 (R7, R30, R32).

## ADDED requirements

None.

## MODIFIED requirements

- **PRD-001.R7** — Conversation tabs.
  - Before: WHILE the tab strip overflows or has shrunk a tab with a cut title below 64 px, the AI Agent Panel shall show an "All conversations" button at the strip's end.
  - After: The AI Agent Panel shall give every tab in the strip the same width, sharing the strip's width between them, at most 150 px (200 px while the main column is 560 px or wider) and at least 76 px; tabs that do not fit at 76 px make the strip overflow.
  - After: WHILE the tab strip overflows, the AI Agent Panel shall show an "All conversations" button at the strip's end.
  - Before: WHEN the user activates "All conversations" by pointer or keyboard, the AI Agent Panel shall show a menu of every open tab in strip order with its working or waiting state and a check on the active one.
  - After: WHEN the user activates "All conversations" by pointer or keyboard, the AI Agent Panel shall show the open-tabs list: every open tab in strip order, each row with the tab's pin or state dot as the tab shows it, its title and a close button, the active row marked as the conversation list column marks it, followed by "Previous conversations…".
  - After: WHEN the user activates a row's close button or presses Delete on a row of the open-tabs list, the AI Agent Panel shall close that tab as its tab's close button does, and keep the list open unless closing asks for confirmation or the list's trigger becomes hidden.
  - Before: WHEN the user picks a conversation from that menu, the AI Agent Panel shall make it the active tab and scroll its tab into view.
  - After: WHEN the user selects a conversation from the open-tabs list, the AI Agent Panel shall make it the active tab and scroll its tab into view when the strip is shown.
  - Reason: the owner's request; at 76 px (Firefox's default minimum tab width) a tab shows its dot and about six letters, so no tab is shrunk below readable before the strip overflows, and the 64 px clause can no longer hold.
- **PRD-001.R30** — Layout by size.
  - Before: WHEN the user clicks the switcher, the AI Agent Panel shall list every open tab, pinned first, with its working or waiting state and a check on the active one, followed by "Previous conversations…".
  - After: WHEN the user clicks the switcher, the AI Agent Panel shall show the open-tabs list (R7).
  - Reason: one list for both triggers, as the owner asked for reuse.
- **PRD-001.R32** — Popovers, hover cards and tooltips.
  - Before: WHEN the user presses Escape in a popover or picks one of its items, the AI Agent Panel shall close it and return focus to its trigger.
  - After: WHEN the user presses Escape in a popover or activates an item to select it, the AI Agent Panel shall close the popover and return focus to its trigger.
  - After: WHEN the user activates an open-tabs row's close button, the AI Agent Panel shall follow R7's close and list-retention clauses.
  - Reason: a row's close button is not a pick; R7 says when the list stays open.

## REMOVED requirements

None.

## Design and migration impact

DES-003 Modules, Tabs and conversation column, Popovers, Keyboard and
accessibility, Alternatives, Verification ([DES-003](../../current/design/DES-003-panel-ui.md)).
Tasks 125 (widths) and 126 (the list). No stored data changes.

## Incorporation

Folded into PRD-001 in the approval commit, which moved this delta to
`docs/records/changes/` with `make close`.
