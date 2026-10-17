---
status: planned
release: rNN-slug
number: NNN
prd: PRD-NNN.R#
---

# TASK-NNN — Title

Lives at `docs/work/tasks/<rNN-slug>/TASK-NNN-slug.md` with status `planned`
or `active`; `make close DOC=<this file>` in the landing commit sets `closed`
and moves it to `docs/records/tasks/`.

## Spec

Explain what and why, cite accepted requirements and ADRs, and state observable
acceptance criteria.

## Scope

List expected files and explicit negative scope. If work outside this boundary
becomes necessary, stop and request a plan update.

## Plan

Record the approach, the existing shared code and mature libraries it reuses,
evidence-first sequence, verification commands, risks, and alternatives
rejected.

## Run log

Record, while working, only what a release retro would use: gates hit,
surprises, model escalations, and human interventions.

## Independent review

Record the reviewer/session/CI evidence, findings, and resolution. The
implementer cannot be the only verifier for M/L work.

## Outcome

Record `accepted`, `reworked`, or `abandoned`, plus anything that should move
into an automated gate or the contributor-guide footgun list.
