---
status: closed
release: r07-mock-fidelity
number: 103
prd: PRD-001.R38, PRD-001.R19, PRD-003.R1, PRD-005.R8, PRD-005.R11
---

# TASK-103 — Clear skeleton

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`/clear` runs in process: a new Claude Code session in the same conversation,
replacing the new-tab behavior. Walking skeleton of change 002: the clear
transaction as a tested state machine, a thin flow around it, and the seams the
later tasks fill.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38 (core clauses), R19, *Failure and recovery* (clear half);
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md) R1;
[PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md) R8, R11;
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md) Option B, Decision 1;
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Clear transaction.

Acceptance:

1. `/clear` with a running idle process writes the CLI's `/clear`, commits on
   `conversation_reset` then `system/init` with a valid new id, consumes the
   zero-turn `result`, and shows the clear divider; no tab opens.
2. The commit records the new id in the device's provenance as started, then the
   clear record and the conversation's `sessionId` together; the new id alone
   reaches `--resume`.
3. No commit in 15 s, or the process ends first: the process stops, none
   spawns, the clear completes with no session id. No result in 15 s after the
   commit: the process is replaced, resuming the new session.
4. A CLI turn before the reset (a queued message) passes untouched and pauses
   the 15 s window; a stray, stale-generation or stale-timer event changes
   nothing.
5. Sends wait while a clear is open and run after it.
6. Nothing due (no message since the start or last clear): nothing happens; an
   unstarted branch drops its fork and records nothing.
7. After a clear the context figure is hidden until the next finished turn and
   the prompt cache is cold; Restore files is off the turns above.
8. While a turn, agent or task runs, `/clear` stays in the composer and sends
   nothing (interim for 108, 109). Text after `/clear` asks "Clear the context?".
9. A written conversation holds version 2 while a clear exists.

## Scope

Expected files:

- New: `src/state/clear-operation.ts`, `src/tab/clear-flow.ts`,
  `tests/state-clear-operation.test.mjs`, `tests/tab-clear-flow.test.mjs`.
- Changed: `src/session.ts` (gate, generation, `writeClear`, `restart`,
  `abandon`), `src/tab/session-link.ts`, `src/tab/chat-tab.ts`,
  `src/tab/restore-branch.ts`, `src/tab/panel-commands.ts`, `src/commands.ts`,
  `src/state/{boundary-records,status-line,tab}.ts`, `src/ui/status-line.ts`,
  `src/protocol/types.ts`, `src/view.ts`; `package.json` (`pretest`);
  `tests/fake-cli.mjs` and the tests of the changed modules.
- Docs: DES-001, DES-002, DES-003, DES-007, `README.md`, `RELEASE_NOTES.md`.

Negative scope:

- The re-apply guard (104), dimming and folding (105), the divider's stored
  reopening beyond 102 (106), Undo (107), the held clear (108), Stop and clear
  (109).
- Codex; the real `claude`; protected paths and protected tests.

## Plan

State machine first (pure reducer, injected clock and timers), then the session
gate, then the flow over fakes, then the view wiring. Reuses `TimerHost`,
`ConfirmModal`, `clearRecord`, `fileVersion`, `recordSession`. Rejected: a
hook-free design where `ChatTab` watches messages itself (stream races untested
in plain Node); resuming by the old id after a failed clear (the CLI may have
already reset).

Verification: `make verify`; fake CLI modes `FAKE_CLI_CLEAR=silent|no-init|
no-result|exit|self-turn|same-id`.

## Run log

- Timers go through `src/timers.ts`, which `mock.timers` does not reach: the
  flow takes a `TimerHost`.
- The generation counter is module-level so two sessions of one tab never share
  a number.
- No automated test covers the `ChatTab` hold or the prompt-cache coldness
  (Obsidian-bound); the board check does.

## Independent review

An independent agent and Codex reviewed phase 1: rework. Fixed, each with a
test first: a dropped unstarted branch ends its session and leaves no stored
intent; a clear after a failed branch records no source id; the `/clear`
command bubble; an owed restart waits for the turn's result; the CLI's own
turn result after the reset still clears busy; the file version is computed at
serialization and a commit saves at once; closing the view disposes the clear
flow first; the fake CLI's init reports the runtime model and mode.

Codex rechecked twice. Fixed, tests first where Obsidian-free: dropping a
branch keeps the failed turn's target, so its prompts stay "not sent"; a
turn's result reaches the view even when the busy callback throws (logged, so
the rest of the chunk is read); the clear's acknowledgement is told from the
CLI's own turn by `num_turns` 0 and the new session id, in either order, and
sends wait for both; saves of one conversation run in order and a delete skips
the saves queued before it. The independent agent approved the final diff.
Board check, ClearStates section 1, dark and light at 340, 440 and 600 px,
live and reopened: divider and `/clear` bubble match; the bubble's radius
(12 against 14) and its gap to the divider (14 against 12) come from shared
tokens this task does not touch; Undo (107) and dimming (105) come later.
Not tested automatically: `history.ts` and the view wiring (Obsidian-bound).

## Outcome

Done.
