---
status: closed
release: r05-pre-redesign-fixes
number: 008
prd: PRD-001.R5, PRD-001.R6, PRD-001.R22
---

# TASK-008 — Session and protocol fixes

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Three backlog defects against accepted requirements and designs. A model the
CLI refuses stays in the session's config, so every later spawn launches with
it. A stdout line that is `null`, or a `control_response` without a `response`,
throws in the client and drops the rest of its chunk. A branch creates its
session outside the shared guard, so a send while the CLI resolves makes a
second session and a tab closed meanwhile keeps one. Review added what the
fixes touch: a switch in flight when the process is replaced, the cross-tab
`lastModel`, a malformed `control_request`, a refusal with no text, and the
quadratic framing of a long line.

Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R5, R6,
R22,
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(Framing, Session lifecycle: `setModel`, `ensureSession`, Branch),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Branch step 3).

Acceptance:

1. `ClaudeSession.setModel` sends `set_model` when a process runs and takes the
   model into its config only after the CLI accepts; with no process it takes
   it at once. A rejection rethrows and leaves the model as it was, so the
   next spawn passes the previous `--model`. `ClaudeSession.model` is the
   config's model.
2. With several switches in flight, the CLI answers in order and the session
   keeps the last one it accepted.
3. A process replaced while a model or mode switch is in flight (an effort or
   launch-option restart) gets the switch resent, so the live process, the
   config and the view agree. One private helper serves both; a refusal, or a
   process that ended with no replacement, is thrown; the mode generations
   (`leftBypassAt`) still end a superseded switch.
4. The view puts the model the session kept back into the selection when the
   CLI refuses a pick, only if no later pick has been made in that tab and the
   tab is open; `lastModel` goes back only if it still equals the refused
   value. The conversation's model is stored (and its save queued) only when
   the CLI accepts. The Notice `Could not switch model: <error>` is unchanged
   and not shown for a closed tab.
5. `handleStdout` skips a line whose JSON value is not an object (`null`, a
   number, a string, a boolean, an array); `route` skips a `control_response`
   without a `response` object and a `control_request` without a `request`
   object. The rest of the chunk is still processed and a request still
   pending still resolves.
6. A `control_response` error without a string `error` rejects with "Claude
   Code refused the request."
7. `handleStdout` searches only the new chunk for a line end; a multi-megabyte
   line split across chunks arrives whole and in linear time.
8. A branch holds its rewind uuid on the tab (`rewindUuid`); `ensureSession`
   gives it to the first session the tab gets and clears it, so a failed first
   start keeps it. A send while the CLI resolves shares the creation, and a
   session whose tab closed meanwhile is disposed.

## Scope

Expected files:

- `src/session.ts` (`switchLive`, `setModel`, `setPermissionMode`, `model`),
  `src/protocol/client.ts` (`isJsonObject`, `handleStdout`, `route`),
  `src/view.ts` (`ensureSession`, `branchFrom`, `chooseModel`, `applyModel`,
  `ChatTab.modelGeneration`, `ChatTab.rewindUuid`)
- `tests/fake-cli.mjs` (`FAKE_CLI_REFUSE_MODEL`, the `noise`, `bare-error` and
  `bigline` scenarios, `pid` in two probes), `tests/session.test.mjs`,
  `tests/protocol.test.mjs`
- `RELEASE_NOTES.md`, `docs/current/plan.md` (three backlog items removed, one
  added), `docs/current/DEVELOPMENT.md` (test table, fake CLI), DES-002
  (framing, `set_model` and branch rows, lifecycle rows, verification rows),
  DES-004 (Branch step 3, the PRD-002.R8 test row)

Negative scope:

- `createSession`, the rewind request and the rest of the branch flow.
- The stored model: Default stored as undefined, `init` overwriting it with the
  resolved id (PRD-003.R9, backlog).
- Effort switches, and field checks inside `control_request` payloads.
- Folding the three object guards (`isJsonObject`, `rec` in `commands.ts`,
  `asRecord` in `export.ts`) into one helper (backlog).

## Plan

- Tests first, in Obsidian-free modules: `tests/session.test.mjs` runs
  `ClaudeSession` against the fake CLI, which refuses `set_model` for the model
  in `FAKE_CLI_REFUSE_MODEL` and tags its probes with its `pid`, so a test can
  tell which process received a switch; `tests/protocol.test.mjs` runs the
  `noise` scenario (every line kind the framing must skip, ahead of and between
  real messages in one write, answered requests in the same chunk), `bare-error`
  and `bigline`, and feeds `handleStdout` small chunks directly. Record that
  they fail before the fix.
- Fix `setModel` the way `setPermissionMode` assigns, after the await, through
  `switchLive`: it resends to a replacement process only when the failure is
  the process having exited, and asks the caller's `superseded` first, which
  keeps task 003's generations. The view rolls back to `session.model`, not to
  the `previous` it captured: with two picks in flight `previous` can be a
  model the CLI also refused. A per-tab `modelGeneration` (as `modeGeneration`)
  makes only the latest pick roll back.
- `isJsonObject` in `client.ts` is used by the line filter, by the
  `control_response` case and by the `control_request` case.
- The rewind uuid lives on the tab and `ensureSession` applies it, so no
  ordering of promise continuations is relied on.
- Verification: `make verify`. View-bound, by hand in a vault (owed by the
  owner):
  1. Set the *Model* setting to an id the account lacks, open a conversation,
     pick it from the model menu mid-conversation: the Notice appears, the
     control returns to the previous model, a later effort change restarts the
     CLI on the previous model (ask it which model it is), and the reopened
     conversation shows the previous model. Close the tab right after picking
     it: no Notice.
  2. Branch from the first of three turns with distinct questions, press Enter
     at once with "What was my last question before this one?" (a slow-to-resolve
     profile, such as WSL, makes the window): the answer names the first turn's
     question, not the third's, and `ps` shows one `claude` for the tab.
  3. Point the profile at a missing CLI, branch and send: the error shows.
     Fix the path in settings and send again: the reply ignores the later
     turns.
  4. Branch, then close the new tab before sending: no `claude` process
     remains.
- Rejected: rolling the view back to `previous` (wrong with picks in flight);
  a second copy of the accepted model on the tab (the session already holds
  it); a guard inside `createSession` (the shared promise is the view's);
  re-sending only when the helper's caller asks (the two callers need the same
  rule).

## Run log

- Tests first, before any fix: `tests/protocol.test.mjs` 2 of 42 failed (both
  `noise` tests, an uncaught `TypeError` on the `null` line);
  `tests/session.test.mjs` 4 of 16 failed. Two of those four failed only for
  want of `ClaudeSession.model`; with the getter added alone, the rejection test
  and the picks-in-flight test still failed (kept `opus` where `sonnet` and
  `haiku` were expected), which is the defect itself. All pass after the change.
- Mutation check: dropping the `control_response` guard, or the line filter,
  alone fails both protocol tests.
- Surprise: the view rolled back to the `previous` it captured and did not queue
  a save of the conversation, so a record saved while the switch was pending
  kept the refused model on disk.
- Review round 1 tests, before their fixes: both `noise` tests failed again
  (the new `control_request` lines), the refusal-without-text test, the three
  replaced-process tests and the small-chunk test failed; that last one took
  42 s at 4 MB against the old framing and milliseconds after the fix. The
  `bigline` test passed before and after: it covers correctness over a real
  pipe, not speed.
- Surprise: my first fix (assign after the await) made the replaced-process
  case worse than before. The old code assigned first, so a respawn started on
  the new model; the new one started the replacement on the old model and the
  switch was lost or rejected. `switchLive` resends.
- No real CLI was run; the manual checks above are owed by the owner in a vault.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Defect: a process replaced while `set_model` was in flight left the live
   process on the old model while the config and the view said the new one.
   Fixed: `switchLive`, shared by `setModel` and `setPermissionMode`, resends
   to the replacement; tests for model, refusal and mode across a respawn.
2. Defect: a refusal restored `lastModel` over another tab's later pick. Fixed:
   only if `lastModel` still equals the refused value; release note matches.
3. Defect: the branch's rewind was lost when the first start failed, and relied
   on the order of promise continuations. Fixed: the uuid waits on the tab
   (`rewindUuid`) and `ensureSession` applies it.
4. Defect: a `control_request` without a `request` object threw in
   `handleControlRequest`. Fixed: skipped in `route`; the `noise` scenario has
   four such lines.
5. Gap: DES-002 did not state the model rollback. Fixed: the `set_model` row,
   the lifecycle rows and the verification rows.
6. Defect: `applyModel` stored `conversation.model` before the CLI accepted it.
   Fixed: stored, with its save queued, on success only; the rollback-time save
   went with it.
7. Gap: the branch release note named a second process, and manual check 2 did
   not tell a rewound branch from a full fork. Fixed: both reworded.
8. Gap: three copies of the plain-object guard. Backlogged, not merged here.
9. Defect: a closed tab got the rollback and the Notice. Fixed: both skipped.
10. Defect: `handleStdout` re-split the whole buffer for every chunk, quadratic
    for a long line. Fixed: only the new chunk is searched; tests for a 3 MB
    line over a pipe and for 20,000 small chunks.
11. Gap: a `control_response` error without text rejected with an empty
    message. Fixed: "Claude Code refused the request."; test.
12. Gap: the task file did not say who owes the manual checks. Fixed: the owner.

## Outcome

A model or mode switch is kept only once Claude Code accepts it, and reaches
a process that replaced the one it was sent to; non-object lines and
malformed control messages are skipped without losing the rest of the
chunk, and framing no longer re-splits the whole buffer; a branch keeps its
rewind until its first session starts. Owed by hand in a vault: the manual
checks in the Plan.
