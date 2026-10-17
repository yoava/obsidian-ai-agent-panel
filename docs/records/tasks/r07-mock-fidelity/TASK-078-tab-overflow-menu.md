---
status: closed
release: r07-mock-fidelity
number: 078
prd: PRD-001.R7
---

# TASK-078 — All-conversations menu when the tabs crowd

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The owner's request of 2026-10-13: with many tabs on top, a small button whose
dropdown lists every open conversation. The strip already had a chevron, but
inactive tabs shrink to 24 px before the strip scrolls, so it showed only once
titles were slivers (measured: none with 8 tabs at 440 or 680 px, shown from
about 13 hidden at 440 px).

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7 (reworded by [change 010](../../changes/CHG-010-tab-overflow-menu.md));
[DES-003](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column, Accessibility, Alternatives;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Tabs.

Acceptance:

1. Strip layout, main column at least 360 px: the "All conversations" button
   shows while the strip scrolls or any tab is shrunk below 64 px with its
   title cut, and not otherwise, measured with the button as drawn, so it
   never toggles on a pass that changes nothing. Absent with three tabs at 440
   and 680 px; present with 8 and 20 tabs at 440 and 680 px.
2. It is Obsidian's tab-list control: `.workspace-tab-header-tab-list` after
   `-container-inner` inside `.workspace-tab-header-container`, holding a
   `button.ai-agent-panel-icon-button.mod-tab-list`, an 18 px `chevron-down`
   4 px in (26 by 26), radius 4, 2 px from the strip's end, centred in the
   header; `aria-label` "All conversations" (its tooltip, under "Show
   tooltips"), `aria-haspopup="menu"`, `aria-expanded` while its menu shows;
   reachable by Tab after the tablist; Enter or Space opens it.
3. Its Obsidian `Menu`, parented to the button (`has-active-menu`), lists every
   open tab in strip order (pinned first), the title, `loader` or
   `circle-dashed` with the state in words for a working or waiting tab, the
   active one checked. Picking one selects it and scrolls its tab into view,
   clear of the edge fades.
4. Hidden in the column layout and below a 360 px main column (switcher). The
   switcher's "Open conversations" popover is unchanged.

## Scope

Expected files: `src/state/tabs.ts`, `src/ui/tab-strip.ts`, `src/view.ts`,
`src/ui/switcher.ts` (comment), `styles.css`, `tests/state-tabs.test.mjs`;
docs: PRD-001 R7 through change 010, DES-003, `README.md`, `RELEASE_NOTES.md`.

Negative scope: the switcher and its popover, the conversation column, the
"Conversation tabs" default (task 077), tab geometry and the board tokens, the
ADR-017 override table. No dependency, no new token, no protected path.

## Plan

Tests first (`stripShortfall`, `showsTabList`, the menu's rows from
`openTabsList`), then the strip: the control in Obsidian's place, its fit in
the resize pass's read and write, the `Menu`; CSS from existing tokens; docs;
harness at 300, 440 and 680 px with 3, 8 and 20 tabs, dark and light.

## Run log

- Tests first: `state-tabs` failed on the missing exports.
- Choices for review:
  - Crowded means the strip scrolls or a tab is shrunk below
    `READABLE_TAB_PX` (64) with its title cut. Rejected: any cut title, which
    showed the button at the Main board's 440 px with three tabs (the boards
    cut two of three titles there) and squeezed those tabs further; overflow
    only, the old rule.
  - `showsTabList(shortfall)` measures the tabs as drawn: shown, the control
    hides once they are readable beside it; hidden, it shows when they are not
    without it. The first rule subtracted the control's width while shown and
    flickered (review).
  - The menu is an Obsidian `Menu`, as the brief asks and Obsidian's tab-list
    control does; this reverses DES-003's alternative for the strip only. The
    switcher keeps the popover (R32 dialog, "Previous conversations…").
    The rows reuse `openTabsList`; a working or waiting row's title is a
    fragment with the state in visually hidden words (native menus show
    them).
  - Reveal: picking the last tab left its end under the fade (the old 12 px
    pad is inside the 38 px fade); the active tab now scrolls clear of the
    fade (list padding + 20 px), clamped to the scroll range.
  - Obsidian displays `.workspace-tab-header-tab-list` only under `.mod-root`
    and `.titlebar`; the board's (0,3,0) rule, later in cascade order,
    displays it everywhere without `!important`, and `toggle()`'s inline
    style hides it. No ADR-017 table change.
  - The button is `mod-tab-list` on the shared icon button: the styles test
    allows three compounds per selector.
- Harness (`scratchpad/harness/hunt-078/`, `probe.mjs`): before (`before/`):
  button absent at 440 and 680 px with 8 tabs (tabs at 24 px at 440).
  After (`final/`), dark and light: 300 px switcher, no strip; 3 tabs absent
  at 440 and 680; 8 and 20 present at both; the menu lists 8 and 20 items;
  picking the last tab activates it and shows it whole, no end fade (18 px
  from the list's edge, its padding). The Main board at 440 px (`main-sys/`,
  `main-geist/`): tabs 74-77, 151-157 and 84-87 px, no button. The harness `Menu` stub ignores
  `setChecked` and the `overlap`/`left` placement, so the check mark and the
  right-aligned menu are for the vault check.
- `make verify`: `scratchpad/verify-078.log`.

## Independent review

Independent reviewer session (orchestrator), 2026-10-13, with a width sweep
and an events check in the harness (`scratchpad/harness/hunt-078r/`). Verdict:
rework.

- Blocker: `showsTabList(shortfall, buttonRoom)` flickered. Hiding the button
  does not give its 29 px back to the sub-64 px tabs alone, since the wider
  tabs take part (4 tabs at 471 px: hidden 4 px short, so shown; shown 21 px
  short, under 29, so hidden; every pass). Bands of 12 to 36 px for 3 to 8
  tabs; each `tabs` event flipped it, so it blinked during turns. Fixed: the
  fit is measured with the button as drawn (`showsTabList(shortfall)`); test
  with the 471 px numbers; DES-003 and acceptance 1 reworded. Re-verified:
  sweep up and down in 2 px steps and a wiggle at each edge for 3 to 8 and 20
  tabs, one transition per crossing and none at rest (shows below 408, 480,
  550, 624, 690 and 760 px going down; hides from 438, 510, 580, 654, 720 and
  790 going up); events check at 440, 471, 472 and 600 px, no flip on `tabs`,
  rename, add or select (`flicker-fixed.txt`, `events-fixed.txt`).
- Minor: the menu lacks Obsidian's tab-list title cap, and its state icons are
  uncolored. The `Menu` API exposes neither a class nor its element, and the
  panel's tokens do not reach a menu outside the panel; recorded in DES-003 as
  accepted.
- Nit: the Alternatives entry now names each rejected option with "against".
- Re-review of the committed fix by the same independent reviewer
  (`reverify/`): verdict land. Same sweep from 360 to 1000 px, one transition
  per crossing, none at rest; events check unchanged, no flips; matrix and Main
  fixture unchanged in both themes. Accepted nit: the 1 px rounding slack lets
  a tab of 63 to 64 px with a cut title rest with the button hidden, under a
  pixel off R7, never with the strip scrolling.

## Outcome

Accepted. The fit check against a toggled element must measure it as drawn;
a check that subtracts the element's own size oscillates whenever the freed
room is shared.
