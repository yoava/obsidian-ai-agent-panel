---
status: closed
release: r07-mock-fidelity
number: 053
prd: PRD-001.R33
---

# TASK-053 — Stale jump-rail ticks on an empty tab

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Switching to a new empty tab, or clearing a conversation, left the previous
tab's jump-rail ticks visible and clickable. `ui/jump-rail` forgot what it
had drawn by setting its key to `""` on `active`, which is also the key of a
tab with no prompts, so the rebuild returned before clearing the ticks.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R33; [DES-003](../../../current/design/DES-003-panel-ui.md) Prompts.

Acceptance:

1. After a tab with prompts, an empty tab shows no `.ai-agent-panel-rail-tick`
   and the rail is hidden.
2. Switching back shows that tab's ticks.
3. Clearing a conversation leaves no ticks.
4. An unchanged prompt list still writes nothing.

## Scope

Expected files: `src/state/prompts.ts` (`RailDrawn`), `src/ui/jump-rail.ts`,
`tests/state-prompts.test.mjs`, `docs/current/design/DES-003-panel-ui.md`,
`RELEASE_NOTES.md`, this record.

Negative scope: no rail restyling, no tick tooltip or hover change, no other
component.

## Plan

"Nothing drawn" becomes `null`, distinct from the empty list's key `""`;
`RailDrawn` (Obsidian-free, `state/prompts`) holds it: `next(labels)` returns
the new key or null when unchanged, and `forget()`, called on `active`, resets
it. The forget rule lives in the tested module so a wrong reset value fails
a test. Tests first. Rejected:
clearing the ticks inside the `active` handler, which would duplicate the
rebuild's removal path.

## Run log

Worktree was on main; switched to `chore/agentic-sdlc` (027fd42). Review
found the first tests passed with the bug restored (the reset lived in
untested `ui/jump-rail`); the rule moved into `RailDrawn` and the test was
confirmed to fail with `forget()` resetting to `""`. `make verify` green
(exit 0) before and after.

Harness fact: on an empty tab after a tab with prompts,
`.ai-agent-panel-rail-tick` count is 0 and the rail is hidden.

## Independent review

Reviewer: independent review agent. Findings: (1) major, tests passed with the
bug restored; (2) minor, the clear case did not model the `active` reset;
(3) minor, record gaps; (4) nit, DES-003 parenthetical. Resolved: all four
(`RailDrawn` with `forget()`/`next()`, mutation-checked; clear modelled as
forget then empty; record and DES-003 updated).

## Outcome

accepted
