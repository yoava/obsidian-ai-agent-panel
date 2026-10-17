---
status: closed
release: r07-mock-fidelity
number: 067
prd: PRD-001.R20
---

# TASK-067 — Report card content bugs

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, a fix. Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R20; [DES-003](../../../current/design/DES-003-panel-ui.md) Report cards.

Acceptance:

1. CA40: at 440 px the `/mcp` row buttons (Reconnect, Disable, Enable) are
   whole, not scrolled out of the table; at 680 px the layout is the same.
2. CA45 and CA46 (`/sandbox` note and Restrictions): not bugs, see the run log.

## Scope

Expected files: `styles.css` (report table),
`docs/current/design/DES-003-panel-ui.md`, `RELEASE_NOTES.md`.

Negative scope: no report-card redesign (066: pills, meta line, board row
layout); no new data source; no change to `sandboxReport` or any other TS; no
behaviour, DOM or accessible-name change.

## Plan

- CSS, only for a table that has an actions column (`:has`): cell end
  padding 6 px (last cell 0), the actions cell wraps its buttons and they
  take 6 px side padding.
- Rejected: a sticky actions column (it covers the From and Tools cells);
  `overflow-wrap: anywhere` on the cells (the auto table layout crushes every
  column to a few characters).

## Run log

- CA45 and CA46 are not bugs: the survey's fixture (`fx/Rich.mjs`) sent
  `errors: ["Missing: socat"]` and camelCase restriction keys, while the code
  and `tests/fake-cli.mjs` use `socat` and snake_case keys and render
  correctly with that shape. An attempted tolerant parser was reverted: the
  real CLI's spelling is not guessed. A real-CLI check of `/sandbox`'s JSON
  is on the owner's list.
- CA40 measured (probe): the table needed 375 px against 360 px available at
  440 px, now 360 of 360 with the last button's right edge 4 px inside the
  table; 300 px still scrolls (359 needed of 230; the columns' words keep
  their width), 680 px the same layout, slightly tighter (rows +4 px, actions column 148 to 124 px).
- Evidence: `harness/hunt-067/final/mcp-{dark,light}.png` (board | panel |
  diff, 440 px) and `final/CA40-measure.txt`. The `sandbox-*.png` pairs there
  show the fixture's shape and are not evidence for this task.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes. Harness
evidence: at 440 px the buttons are inside the table; at 680 px the same
layout; at 300 px the table still scrolls; the other report tables are
byte-identical to HEAD in 36 renders.

Findings and resolution:

1. Spec and run log said 680 px "unchanged": fixed, it is the same layout,
   slightly tighter (rows +4 px, actions column 148 to 124 px).
2. The adjacent-button spacing rule was removed for every button, but
   `actionButtons` also draws a pair's actions: restored as
   `.ai-agent-panel-report-value > .row-action + .row-action`, so two pair
   buttons never touch.

## Outcome

accepted.
