---
status: closed
release: r07-mock-fidelity
number: 101
prd: PRD-001.R37
---

# TASK-101 — Event divider

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A refactor, no behavior change. The compaction divider's drawing becomes a
generic event divider so the clear divider (102) reuses it rather than copying
it (AGENTS.md design rule 2). Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R37, R28;
[DES-003](../../../current/design/DES-003-panel-ui.md) Compaction dividers;
change 002 (`docs/records/changes/CHG-002-context-events.md`).

Acceptance:

1. A compaction still draws the same DOM: rule, pill, icon, label, sub-line,
   Summary toggle and box, roles and names, `data-phase` and `data-tone`.
2. The divider is drawn from a generic `EventView` (phase, role, tone, icon,
   label, sub-line, name, optional summary and its text); `compactionView`
   returns it.
3. `tests/state-compaction.test.mjs` passes unchanged.

## Scope

Expected files: `src/ui/event-divider.ts` (renamed from
`src/ui/compaction-divider.ts`), `src/ui/messages.ts`, `src/state/compaction.ts`
(`EventView`), `tests/tooltips.test.mjs` (the site's path),
`docs/current/design/DES-003-panel-ui.md`, `RELEASE_NOTES.md`.

Negative scope:

- CSS, behavior, the clear divider and its Undo action (102, 107), the
  `item:<id>` event wiring.
- No new module, so no `pretest` change; no protected path.

## Plan

- `EventView` replaces `CompactionView` in `state/compaction`, gaining `phase`
  (the `data-phase` value) and `summaryText` so the divider reads nothing from
  the item itself.
- `EventDivider<Item>` takes the item and a `describe(item)` function; a
  compaction passes `compactionView`.
- An action slot is left to 107, which needs it; adding it now would be unused
  code.
- Verification: `make verify`; the existing compaction tests; a regression
  screenshot of ContextEvents in the harness.
- Rejected: a state module of its own for `EventView` (a second file with one
  caller until 102).

## Run log

- Tests: no new test; `state-compaction` and `tooltips` cover the refactor.
  The tooltips site list changes `compaction-divider.ts` to `event-divider.ts`,
  same count (`aria-label`: 1).

## Independent review

Independent review agent: approve. A standalone harness rendered the old
divider and the new `EventDivider` with `compactionView` in eight compaction
states (compacting auto and manual, compacted with, without and with an
empty summary, without counts, failed, reopened), through the Summary toggle
and live phase changes: the serialized DOM is byte-identical in every
snapshot. No stale references remain; the generic fits task 102's clear
divider. `make verify` exit 0.

## Outcome

Done.
