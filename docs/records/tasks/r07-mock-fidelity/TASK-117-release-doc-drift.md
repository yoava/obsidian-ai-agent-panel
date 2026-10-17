---
status: closed
release: r07-mock-fidelity
number: 117
prd: none (docs only: plan.md, DEVELOPMENT.md, README.md)
---

# TASK-117 — Current docs match the code before 0.6.0

## Spec

Release review found three current documents that contradict HEAD. Governing:
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md),
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md).

Acceptance:

1. `plan.md` says changes 001 and 002 ship together in 0.6.0, lists the landed
   tasks as landed, and owes only task 110 and tasks 116 to 119.
2. `DEVELOPMENT.md` Conventions states the `--ai-agent-panel-*` token rule and
   links ADR-017.
3. `README.md` says a conversation synced from another device starts a fresh
   Claude Code session (DES-002 first-launch row).

## Scope

`docs/current/plan.md`, `docs/current/DEVELOPMENT.md`, `README.md`. Negative
scope: no code, ADR, PRD or constitution edits; no release-notes entry.

## Plan

Rewrite the three statements in place; `make verify`.

## Run log

`make verify` exit 0 (after the review fixes: README rule per ADR-018 and SECURITY.md, plan.md no longer ties 0.6.0 to O6).

## Independent review

An Opus review agent (not the implementer): README's resume rule restated per ADR-018 (a device that ran it with the same CLI profile); plan.md no longer attributes shipping 001 and 002 together to O6, which chose 001 alone, and marks it pending the owner; task metadata fixed. The orchestrator checked the fixes against the findings.

## Outcome

Done.
