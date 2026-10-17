---
status: closed
release: r05-pre-redesign-fixes
number: 022
prd: PRD-002.R17
---

# TASK-022 — Plan card: the prompts Allow also grants

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The backlog said Allow on an ExitPlanMode card also grants the input's
`allowedPrompts`, which the card showed only inside "Full input". The task
listed them on the card as "Also allows:".

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R17, [DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Card contract).

## Scope

Expected files: `src/tool-labels.ts`, `src/view.ts`, `styles.css`,
`tests/tool-labels.test.mjs`, DES-004, `DEVELOPMENT.md`, `RELEASE_NOTES.md`,
`docs/current/plan.md`.

Negative scope: Allow, Always allow, Deny and Full input unchanged.

## Independent review

A review agent, not the implementer; `make verify` passed. Finding D1
(Defect): the premise is false. Claude Code marks the field "Deprecated: no
longer used." and no code path the panel uses reads it
([evidence](../../../records/verification/2026-10-11-exitplanmode-allowed-prompts.md)),
so the card would state a grant the user never gets. Gaps G1 to G3 (rows
past 20 unreadable, the 96-character cut, blank prompts skipped) are moot.

## Outcome

Not landed: the code, tests and design rows were dropped. Only the backlog
line leaves `plan.md`, with the evidence recorded.
