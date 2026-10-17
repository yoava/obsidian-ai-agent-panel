---
status: closed
release: r07-mock-fidelity
number: 055
prd: PRD-001.R20, PRD-001.R30, PRD-001.R35
---

# TASK-055 — Narrow-width overflow at 300 px

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

At 300 px the bug hunt found: the empty state wider than the messages element
(starters lose their right edge); the settings tab's "Prompt style" cards,
custom-prompt textarea and arguments field wider than their setting item; a
`/mcp` table read as cut; the diff's "Rendered" toggle against the card edge;
`/usr/local/bin/claude` broken mid-word in `/status`.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R30, R35; [DES-003](../../../current/design/DES-003-panel-ui.md) Layout model.

Acceptance (rendered, in the orchestrator's headless harness, at 300 px, both
themes):

1. `.ai-agent-panel-messages` has `scrollWidth <= clientWidth`;
   `.ai-agent-panel-empty` is no wider than its parent; each starter shows its
   full border and its text wraps.
2. In a 220 px setting item, `.ai-agent-panel-style-cards` is no wider than
   the item, its cards wrap or stack with none cut; the textarea and the
   arguments field are no wider than the item. Wide items keep the three
   cards in one row, each at most 190 px.
3. A wide `/mcp` table scrolls inside itself (`table.scrollWidth >
   clientWidth`, `overflow-x: auto`) and the report card is
   no wider than its parent.
4. The diff's "Rendered" toggle keeps a gap (`--size-4-2`) from the line
   count; the head does not overflow.
5. In `/status`, `/usr/local/bin/claude` breaks after a "/" when it does not
   fit (`/usr/local/bin/` then `claude`), not inside a name; its text is
   unchanged. 440 px and wider: the cards stay in one row, the fields keep
   300 and 240 px.

## Scope

Expected files:

- Changed: `styles.css`, `src/commands.ts` (`pathSegments`),
  `src/report-view.ts` (a `wbr` between segments), `tests/commands.test.mjs`, DES-003 (Layout model, the no-overflow
  bullet), `RELEASE_NOTES.md`.

Negative scope:

- No palette, colour or font change; no layout change above 360 px except
  where the same rule applies (wide settings rows keep three cards in a row).
- No new component, no edit to `tests/styles.test.mjs`
  or any protected path; no new dependency.

## Plan

- Tests first: `pathSegments` (cut after each "/", joins back unchanged).
- CSS: `min-inline-size: 0` and `max-inline-size: 100%` on the empty state
  (an auto margin stops the flex stretch); `white-space: normal` on the
  starter text (Obsidian's button is `nowrap`); the two fields keep 300 and
  240 px with `max-inline-size: 100%`, and their `.setting-item-control` gets
  `flex-shrink: 0; min-inline-size: 0; max-inline-size: 100%` (a percentage
  minimum collapsed the fields, the control being content-sized); cards row
  `flex-wrap: wrap`, cards `flex: 1 1 96px`; a margin before the diff toggle.
- `/status` path: Chromium offers no break after "/", and `overflow-wrap`
  only breaks inside a name, so `report-view` puts a `wbr` (created with
  `createEl`) between `pathSegments` pieces (in `commands`, the pure report
  module: a new module would need the architecture test's layer list) of each pair value; the text is
  unchanged for copy and screen readers.
- Verification: `make verify`; harness facts above.
- Rejected: a CSS-only path break (not possible); a thin scrollbar on the
  /mcp table (drops Obsidian's scrollbar styling); stacking the cards in a container query (the wrap
  adapts to the item, not the panel, and the settings tab is not a panel).

## Run log

- The `/mcp` table already had `display: block; overflow-x: auto`: the "cut"
  columns were its scroll viewport, so its layout is unchanged.
- Review rework: `min(300px, 100%)` collapsed the fields, the control being
  content-sized; the cards at 120 px wrapped 2+1 at 440; the CSS-only path
  break did not work. Harness (hunt-055b) at 300, 440, 680, 900, both
  themes: no overflow or clip in the messages, empty state, cards or fields;
  cards one row from 440 (106 px each) and stacked at 300; fields 300 and
  240 px at 440 and wider; the `/status` path wraps as `/usr/local/bin/` and
  `claude` at 300.
- Manual check owed: the `/mcp` table's scroll is discoverable on macOS
  (overlay scrollbars hide until used).

## Independent review

Reviewer: independent review agent. First review (evidence: harness
`hunt-055`): rework, five findings, all resolved: the percentage minimum
collapsed the fields (now fixed widths with a capped, non-shrinking control);
cards wrapped 2+1 at 440 (basis 96 px); the CSS-only path break failed
(`wbr` after each "/" via `pathSegments`); `scrollbar-width: thin` reverted;
the diff toggle's end padding replaced by a wider gap. Re-review (evidence:
`hunt-055c`, `review-055b.log`): approve.

Accepted residue:

- Cards wrap 2+1 in a 250 to 300 px row (panel about 340 to 390 px), better
  than the base, which overflowed; a container query was rejected.
- Pre-existing and identical in the base: at about 500 px settings width the
  descriptions beside the 300 px field shrink (Vault instructions to 46 px);
  out of scope.
- Manual check: the `/mcp` table's scroll is discoverable on macOS.

## Outcome

accepted.
