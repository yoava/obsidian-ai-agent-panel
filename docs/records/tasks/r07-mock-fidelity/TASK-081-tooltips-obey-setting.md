---
status: closed
release: r07-mock-fidelity
number: 081
prd: PRD-001.R32, PRD-001.R22, PRD-002.R8
---

# TASK-081 — Model and permission tooltips obey Show tooltips

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Fix (S). The model segment's full-id tooltip (PRD-001.R22) and the permission
segment's hover text (PRD-002.R8) showed with "Show tooltips" off, because
`styles.css` set `--no-tooltip: false` on both. Owner decision 2026-10-13: they
keep their content but obey the setting. The rail tick preview (PRD-001.R33)
keeps showing, being the only way to read a tick; "Restore to before turn N"
(PRD-002.R18) is unchanged.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R32 (reworded), R22, R33; PRD-002 R8, R18;
[DES-003](../../../current/design/DES-003-panel-ui.md) Popovers, hover cards
and tooltips.

Acceptance:

1. With "Show tooltips" off, the model and permission segments resolve
   `--no-tooltip: true` at every width, warning state and fit step; with it on
   they resolve `false` and still carry their tooltip text.
2. The effort and profile segments, "Restore to before turn N" and the rail
   tick behave as before.

## Scope

Expected files: `styles.css` (the model and permission segments leave the
`false` rule; the permission-only resets go, as the segment now inherits the
token), `tests/tooltips.test.mjs` (the rule map), the comment in
`src/ui/status-line.ts`, PRD-001.R32, DES-003, `RELEASE_NOTES.md`.

Negative scope: no change to what the tooltips say, to the hover cards, the
rail tick, the effort or profile segments, or to `tests/styles.test.mjs`.

## Plan

Tests first: the `--no-tooltip` rule map in `tests/tooltips.test.mjs` drops the
`false` entry for the model and permission segments and the three permission
resets; it fails against the old stylesheet. Then remove those rules. Rejected:
setting the segments to the token explicitly, which repeats what inheritance
from the scope gives.

## Run log

- Tests first: `tooltips.test.mjs` "a tooltip on a label shows only while the
  label hides" failed on the old rules, passed after.
- Harness facts to assert (orchestrator): in a panel with `mod-no-tooltips`,
  `getComputedStyle(el).getPropertyValue("--no-tooltip")` is `true` on
  `.mod-model` and `.mod-permission` (also with `.is-warning`, at fit steps 1
  to 5 and below 360 px); without the class it is `false`; on `.rail-tick` and
  `.mod-restore-before` it is `false` in both cases; `data-tooltip` is still
  set on both segments.

## Independent review

Independent review agent: approve with changes. Harness: 288 checks at 300,
440 and 680 px, fit steps 0 to 5, warning on and off, setting on and off, 0
failures (60 on the old CSS); the rail tick and "Restore to before turn N"
stay `false`.

- Minor: PRD-002.R8 and PRD-001.R22's tooltip clauses still read as
  unconditional. Fixed: both now say WHERE "Show tooltips" is on.
- Nit: the record was unfilled. Fixed.

## Outcome

accepted
