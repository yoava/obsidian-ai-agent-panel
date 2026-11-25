---
status: planned
release: rNN-slug
number: NNN
size: S
issue: https://tracker.example/KEY-NNN
prd: PRD-NNN.R#
---

# TASK-NNN — Title

Lives at `docs/work/tasks/<rNN-slug>/TASK-NNN-slug.md` with status `planned`
or `active`; `make close DOC=<this file>` in the landing commit sets `closed`
and moves it to `docs/records/tasks/`. `issue` links the task's issue in the
project's tracker; delete the line when there is none. `size` is the change's
class, S, M or L (`AGENTS.md` section 3).

## Spec

Explain what and why, cite accepted requirements and ADRs, and list each
observable acceptance criterion with an ID that the Outcome checks:

- AC-1: Observable criterion.

## Scope

List expected files and explicit negative scope. If work outside this boundary
becomes necessary, stop and request a plan update.

## Plan

Record the approach, the existing shared code and mature libraries it reuses,
evidence-first sequence, verification commands, risks, and alternatives
rejected.

## Slices

Only for a task too large for one review: one row per sub-task of `issue`
(key, scope, status). The task closes when the last slice lands. Delete
otherwise.

| Key | Scope | Status |
| --- | --- | --- |
| KEY-NNN | Scope | planned |

## Run log

Record, while working, only what a release retro would use: gates hit,
surprises, model escalations, and human interventions.

## Independent review

<!-- Record who reviewed and the verdict on their own lines, then the
evidence (session, link or CI run), findings, and resolution:
`Reviewer: <model, person or CI job>` and `Verdict: accepted` alone, remarks
on other lines (once the findings are resolved; any other verdict closes only
with an `Owner override: <reason>` line). The implementer cannot be the only
verifier for M/L work: the line `Not required (S)` instead of the fields is
allowed only for size S. Minor findings stay here as follow-ups; they never
start another review round. `make close` refuses this section empty or
`Pending`, and a missing, repeated, empty or `N/A` Reviewer or Verdict; lines
in code fences, indented code and comments do not count. -->

## Outcome

<!-- Before closing, check each Spec acceptance item against the diff, one
line each with its ID and a colon: `- [x] AC-1: evidence`. `make close`
refuses a Spec without IDs, a repeated ID or one without text, a Spec ID the
Outcome does not check, an Outcome ID the Spec does not list, an unchecked
`- [ ]` item, or this section empty or `Pending`. Record `accepted` or
`reworked`, plus anything that should move into an automated gate or the
contributor-guide footgun list. An abandoned task is not closed: it is
removed with `git rm` and the reason noted in `docs/records/log.md`. -->
