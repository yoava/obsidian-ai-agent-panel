---
status: closed
release: r08-settings-redesign
number: 121
prd: PRD-001.R39, PRD-001.R24, PRD-001.R25, PRD-001.R28, PRD-002.R8, PRD-004.R1, PRD-005.R2
---

# TASK-121 — One settings page under a sticky bar with section links

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L, `feat`. Owner decisions 1 to 3, 9 and 11
([brief](../../../work/research/redesign-canvas/settings/BRIEF.md)). Governing:
[change 016](../../../records/changes/CHG-016-settings-redesign.md)
R39 (page, bar, links), R24 (badge), R25, R28 (navigation landmark),
PRD-002.R8, PRD-004.R1, PRD-005.R2 (names);
[ADR-019](../../../current/adr/ADR-019-settings-page-on-the-declarative-api.md);
[DES-001](../../../current/design/DES-001-system-overview.md) Settings page.

Acceptance:

1. Six sections in order, General, Permissions, Appearance, Usage, Export,
   Claude Code, each a group whose first row (`searchable: false`) draws
   the heading (`role="heading"`, `aria-level="2"`, `tabindex="-1"`; the lint rule bans `h2`), the Claude Code sync badge, and the
   lead line from DES-001. Rows in DES-001's order with the boards' names
   and descriptions (`build/build.py` `ROWS`, `WIN_ROWS`, `wsl_rows`,
   `ADD_ROW`). The Claude Code rows keep today's behavior (task 124
   restacks them).
2. The bar is the first group, alone, `position: sticky; top: 0`, opaque,
   a line under it; it holds `nav` "Settings sections" with six links in
   section order, wrapping when narrow.
3. Activating a link scrolls its heading to just under the bar (smooth
   unless `prefers-reduced-motion: reduce`) and focuses it with
   `preventScroll`. The current link (`aria-current="location"`) is the
   last section whose heading top is at or above the bar's bottom, else the
   first; at the scroller's end, the last. Recomputed on `scroll` (one per
   frame), on resize of the bar or a group; passive scrolling never moves
   focus.
4. The tab element gets `ai-agent-panel-settings-page` (top padding 0,
   `scroll-padding-top` = the bar's measured height) and is one scope root
   (`host`), so the page draws in the panel's palette; Theme previews stay
   nested roots. `hide()` stops the controller and releases the root.
5. Every row is a `render` row with a stable `id`; groups have ids;
   `visible` only for availability; a structural change calls `update()`
   (1.13+) or redraws (before). Both renderers build the same group DOM.
6. A device-local row shows the `cloud-off` badge with "Stored on this
   device only. Click to sync across devices."; no "(not synced)" suffix.
7. Layout uses logical properties; tokens only.

## Scope

Expected files: `src/settings.ts`, `src/state/section-spy.ts` (new;
`tests/state-section-spy.test.mjs`, `pretest`), `styles.css`; tests
`tooltips` (counts only, each listed); docs `RELEASE_NOTES.md`,
`README.md` if a feature line changes, `docs/current/DEVELOPMENT.md` (test
table), the drafts where the code differs.

Negative scope:

- No search, Modified chip, "Default:" line, reset or Undo (tasks 122,
  123); the bar shows only the section links until then.
- No profile restack, Add profile row, missing-CLI banner or WSL change
  (task 124).
- No setting added or dropped; no per-section tabs; no panel change.
- No new dependency; no protected-path edit; no real-CLI run.

## Plan

- Tests first, confirmed failing: `section-spy` (current section from
  heading offsets and the bar's height, the end-of-scroller rule, the jump
  target offset, an empty or single-section page).
- Reuse the `groups()` description, `Registrations`, `theme.attach`; one
  `ResizeObserver` and one `scroll` listener per shown tab.
- Verification: `make verify`; harness boards `SettingsFull-Dark`,
  `SettingsFull-Light`, `SettingsTabs` (bar and links only), `SettingsNarrow`
  (links wrapping), 460 and 720 px, dark and light; jumps under reduced
  motion; legacy renderer.
- Rejected: the bar outside the scroller and per-section `heading` groups
  (ADR-019 Options B, C).

## Run log

- Proof of failure: the first eight `state-section-spy` tests ran against a
  stub and all failed, with the architecture test for the unbundled module
  (9 of 1741); the 1 px tolerance test came later, and round 2's
  `stuckBarBottom` tests failed before the helper existed. All pass after.
- Round 2 (review): a jump from the page top, before the bar sticks, landed
  50 px short and left the previous link current; the target now uses the
  stuck bar's bottom (`stuckBarBottom`, with a test from scroll 0). A
  structural `update()` appended the card groups and the instructions field
  again outside the cleared control; each render now removes what it
  appended and resets its row classes (harness: two badge flips on 1.14.4
  and with 1.13.4 keying keep one of each). At 460 px Obsidian's container
  rule stacked every row; rows stay inline, controls at most 150 px, cards
  three across, links three to a row, the bar full width, as the boards.
- Round 3 (review): the full-width bar had lost its line (the fill's shadow
  covered it; now a border image); the 150 px cap cut dropdown text ("Claude
  Code defa"), so dropdowns size to their choice; Obsidian 1.13+ shows a
  slider's value itself, so the thresholds' own figure no longer doubles it
  there. Harness at 460 and 720 px: line 1 px, no horizontal overflow, no
  dropdown cut.
- Harness: `SettingsFull`, `SettingsTabs`, `SettingsNarrow` at 460 and 720
  px, dark and light, and the legacy renderer: layout matches the boards;
  the bar holds only the links until tasks 122 and 123.

## Independent review

An Opus review agent (not the implementer), three rounds, with its own
harness probes on Obsidian 1.14.4, with 1.13.4's keying and on the legacy
renderer. Fixed: jumps from the page top landing short; `update()`
duplicating card groups and the instructions field (a live second field
writing `vaultInstructions`); rows stacked at 460 px; the narrow links,
full-width bar and sync tooltips differing from the boards; the bar's line;
cut dropdowns; the doubled threshold value. Not fixed, by design: after a
redraw focus falls to the page until task 122 restores it (ADR-019); Export
at 720 px marks Claude Code current, since the page cannot scroll Export's
heading to the bar (the end-of-scroller rule). Final verdict: approve.

## Outcome

Done.
