---
status: closed
release: r08-settings-redesign
number: 134
prd: PRD-001.R39
---

# TASK-134 — "Default:" shows only in the Modified view

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`, reported by the owner: picking a prompt color away from Sand
added "Default: Sand" under the row's description, which pushed the cards
down a line; picking Sand again pulled them back up. Change 021: the page
draws no "Default:" line; while "Modified" is on, every row shown draws it,
one edited back to its default included, so a pick moves nothing in either
view.

Acceptance: picking any value leaves the row's control where it was, on the
page and in the Modified view; the Modified view still shows each row's
default; the reset button still names and tips it.

## Scope

Expected files: `src/settings.ts`, PRD-001, DES-001, change 021.

Negative scope: no change to the row registry, the page model, the reset
button or the filter line; no CSS change.

## Run log

- Settings harness (`probe-134.mjs`), 720 px, light, Sand stored, picking
  Mist, Sage, then Modified on, Mist, Sand. Before: the cards' top 377, 398,
  398; in Modified 367, 367, 346 (Sand dropped the line). After: 377, 377,
  377; in Modified 367, 367, 367, "Default: Sand" on each.
- `make verify` OK.

## Independent review

Size S, a one-condition change in an Obsidian-bound file: the orchestrator
measured it in the harness. Real Obsidian: the owner's manual check.

## Outcome

Done. Change 021 incorporated.
