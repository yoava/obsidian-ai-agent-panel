---
status: closed
release: r07-mock-fidelity
number: 100
prd: PRD-005.R7, PRD-003.R4
---

# TASK-100 — Fork base

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A branch's CLI session starts at its source's whole `total_cost_usd`, so the
branch's cost, first turn, `/cost`, hover card and export counted the
source's spend. The branch records a fork base when its fork starts and every
cost figure leaves it out.

Governing: [PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md)
R7 (the four fork-base clauses) and *Failure and recovery*;
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R4 (a fork base's session id follows the grammar);
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md) *Fork
base* and *Validation on load*.

Acceptance:

1. When a fork starts (the branch's first message; the retry after a refused
   rewind; a reopened pending branch's next send) the branch conversation
   stores `forkBase { costUsd, sessionId?, estimate? }`, replacing an earlier
   one. `costUsd` is the latest total an open tab's conversation recorded for
   the source session.
2. With no recorded total, or a turn running in a tab holding the source, no
   `forkBase` is stored (an earlier one is removed).
3. `estimate` is true unless the source is in `started` of its conversation
   (`SessionProvenance.began`) and no agent or background task runs in the
   source's tab and no other open tab holds it.
4. `forkBase.sessionId` is the fork's first reported session id, set before
   the fork's first turn record. The base comes off that session only; a
   fork dropped without a session of its own deletes the base, so a fresh
   session after a refused rewind shows its full cost.
5. The fork session's share of the cost is its latest total minus the base;
   its first turn costs its total minus the base; later turns the difference
   of totals; a total below the base costs 0. The composer's cost, `/cost`,
   the tab hover card, reopened footers and the export's `cost_usd` and turn
   lines agree.
6. A branch with no `forkBase` shows "Includes the cost of the conversation it
   branched from"; an estimate shows "Estimate: can include some cost of the
   conversation it branched from"; an exact base shows no note. Notes appear in
   `/cost`'s notes and under the cost on the tab hover card.
7. On load a `costUsd` that is not a finite number of at least 0 reads the
   base as absent; an `estimate` that is present and not a boolean reads as
   true.

## Scope

Expected files:

- New: `src/state/fork-base.ts`, `tests/state-fork-base.test.mjs`.
- Changed: `src/commands.ts`, `src/state/turn-cost.ts`, `src/state/tab.ts`,
  `src/state/tabs.ts`, `src/history.ts`, `src/history-file.ts`,
  `src/state/session-provenance.ts`, `src/session.ts`,
  `src/tab/session-link.ts`, `src/tab/chat-tab.ts`, `src/tab/panel-commands.ts`,
  `src/transcript-markdown.ts`, `src/view.ts`, `src/ui/dom.ts`,
  `package.json` (`pretest`), `tests/fake-cli.mjs` (`FAKE_CLI_SOURCE_TOTAL`),
  tests named in the Plan.
- Docs: DES-007 *Cost and tokens* (Fork base), DES-005 (field and
  validation), DES-004 *Branch*, `RELEASE_NOTES.md`.

Negative scope:

- `/clear`, segments, dimming, Undo (tasks 102 and after).
- Reading a closed source's history file for its total.
- No new dependency, no CSS change, no protected path, no real-CLI run.

## Plan

- Tests first, named with PRD-005.R7: `state-fork-base` (decision, totals,
  target session, notes), `commands` and `state-turn-cost` (the base off the
  conversation and the first turn), `history-file` (`checkForkBase`),
  `state-session-provenance` (`began`), `state-tabs`, `state-tab`,
  `transcript-markdown`, `session` (`onForkStart`; fake CLI total).
- One pure module for the decision; `conversationCost` and `turnCosts` take
  the base as an optional argument, so every caller uses the one computation.
- Event `onForkStart(source)` fires from `ClaudeSession` where it sends the
  rewind to a fresh fork process: one place for the first message, every
  retry and a reopened pending branch.
- Rejected: storing the base when the branch tab opens (not the fork's real
  start; a refused rewind forks again later); reading the source's file for
  the total (async, not needed while the source is open).
- Verification: `make verify`; no board for this.

## Run log

- Heredocs and multi-command Bash are refused in this worktree; edits went
  through the Edit tool.
- The implementation and its tests were written together, so no red run was
  recorded before the code.

## Independent review

Independent review agent, two rounds: approve. The arithmetic matches the
real CLI's V7 evidence (a fork's first total is the source's whole total at
the fork, so a fork of a fork subtracts only its parent's), the base is
subtracted once per fork session and clamped at 0, and every cost surface
uses the same base. Round one found a stale base could be subtracted from a
fresh session after an abandoned fork, and `began` was OR-ed across holders;
both fixed: the base applies only to the session its `sessionId` names, an
abandoned fork drops a base without one, and `began` comes from the holder
whose total was taken. The fork base's id is grammar-checked on load.
Follow-up, not in this task: a snapshot at branch open for a source closed
before the fork's first send. `make verify` exit 0.

## Outcome

Done.
