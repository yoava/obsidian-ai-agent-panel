# Brief — Track or task

Track file: `<absolute path>`; its line 1 is the state, rewritten in place:
`planned|active|blocked|done — one line`.

## Goal

What done means, in one paragraph, with the acceptance items.

## Inputs

Base commit, accepted ADRs and requirements, paths to read (line ranges
where possible).

Commands: only ones checked against the help output of the build under test.

Hosts the run may reach: `<host>`, `<host>`.

## Phases

Plan, implement, fix round: one agent each, handing over through
`<reports>/<task>-handover.md` (runbook TP-4).

## Gate

The exact commands: targeted tests of changed components while developing,
the full gate once on the final tree through the gate slot. A command missing
from the build: run the nearest real one and record it under Deviations.

## Standing authorizations

Clear recommendations the agent follows without asking; each use goes in the
report for owner review.

- `<situation>`: `<action>`.

## Report

Write `<absolute report path>` by shell with an atomic rename. Line 1: a
one-line status. Then these sections:

- Left existing or running: objects, processes, branches, worktrees.
- Proof per step: command and observed result.
- Not done: each piece and the gate or owner item it waits on.
- Deviations: each with its cause and any rule changed because of it.
- Standing authorizations used.
- Spend, and disruption of shared resources: what, how long, restored.
- Handed over: commit `<sha>`. A later commit to that branch is reported to
  the orchestrator before it is made; a gate run on an older commit restarts.

Final reply: at most three lines naming the report.

## Hard rules

- No force push, no history rewrite, no tag or publish beyond this scope.
- Never weaken, skip or delete a failing gate.
- A permission denial is recorded in the report, never worked around.
- No secrets in briefs, reports or logs; never read credential files.
- Protected paths change only by a patch file (AGENTS.md section 10).
- Network only to the hosts under Inputs.
- Retry only the failing test, never the suite.
- Before reporting, remove leftover temporary HOMEs and finished wait shells.
- A fault on a shared resource that another person or run caused goes in the
  report with its evidence and is left untouched.
- A rehearsal or probe on shared infrastructure runs under its own label and
  namespace, never touches the shared or production release, records every
  object it creates, tears them all down and proves none remain with the
  platform's list commands.
