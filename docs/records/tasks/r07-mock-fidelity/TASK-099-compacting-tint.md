---
status: closed
release: r07-mock-fidelity
number: 099
prd: PRD-005.R8
---

# TASK-099 — The context segment is tinted while compacting

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Class S. PRD-005.R8's last clauses: WHILE the CLI reports that it is
compacting, the context segment is tinted with the warning color and its
accessible label gains ", compacting". Not built yet: the compaction divider
(089) shows the state, the status line does not.

Governing: [PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md)
R8, R11; [ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md);
change 002 (`docs/records/changes/CHG-002-context-events.md`);
[DES-003](../../../current/design/DES-003-panel-ui.md) Status line;
[DES-007](../../../current/design/DES-007-usage-and-cost.md) Context segment.

Acceptance:

1. While `system/status` says compacting (the tab's compaction state is
   `compacting`), the context segment has the `warning-soft` fill, and its
   percentage and ring arc are in the warning color.
2. Its accessible label ends ", compacting" (after the cache sentence when
   there is one).
3. The cache part shows `zap-off` with no time while compacting, when a cache
   was reported; none appears otherwise.
4. The tint ends when the compaction succeeds, fails, or the turn ends.
5. A segment hidden before the first finished turn stays hidden.

## Scope

Expected files: `src/state/status-line.ts` (`contextSegment`),
`src/state/tab.ts` (`StatusData.compacting`), `src/tab/chat-tab.ts`
(`syncCompacting`), `src/ui/status-line.ts`, `styles.css`,
`tests/state-status-line.test.mjs`, DES-003, DES-007, `RELEASE_NOTES.md`.

Negative scope: dividers, `/clear`, the cache estimate and its logic, the hover
card and popover, the board's label "Prompt cache will be rebuilt after
compacting" (the PRD wording governs).

## Plan

`contextSegment(usage, cache, compacting)` returns `compacting` and builds the
label and cache part; `ChatTab` mirrors its compaction state into
`StatusData.compacting` and fires `status` on a change. Tests first in
`tests/state-status-line.test.mjs`. Rejected: deriving the flag in the UI from
the divider item (the UI would read message state), and recoloring through the
existing `warn` flag (that one means 80% full).

Verification: `make verify`; harness: the segment's computed background and
color while a compaction runs, dark and light, 340, 440 and 600 px, against
ContextEvents item 10.

## Run log

## Independent review

Independent review agent: approve, with the board check. Headless harness,
ContextEvents item 10 against the panel driven through the fake CLI's
compacting status, dark and light at 340, 440 and 600 px: fill, ring,
percentage and struck bolt match. Deviations, none this task's: the light
`--ai-agent-panel-warning` token is #a55808 against the board's #a85a08 (used
by every warning element); the cold bolt differs by a few levels; the label
follows PRD-005.R8 (", compacting") instead of the board's cache sentence.
The tint clears on an error result (the CLI's reply to an interrupt), on the
compact boundary and on process close, checked in the harness; the turn
reset was read, not run. `make verify` exit 0.

## Outcome
