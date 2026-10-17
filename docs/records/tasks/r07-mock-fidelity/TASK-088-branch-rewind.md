---
status: closed
release: r07-mock-fidelity
number: 088
prd: PRD-002.R15
---

# TASK-088 — Branch from an earlier turn keeps the whole history

## Spec

Shipped defect found by task 087's real-CLI run
(`docs/records/verification/2026-10-13-real-cli-clear-undo.md`, V10 and other
finding 1): on Claude Code 2.1.296 a fork's `rewind_conversation` to any
prompt but the source's latest returns `rewound: false` with reason
`stale_target` (no `last_seen_user_message_uuid`) or `unseen_later_turn` (a
wrong one); the panel sent no such field and ignored the reply, so Branch on
an earlier turn kept every later turn in context without notice.

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R15 with [change 012](../../changes/CHG-012-branch-rewind.md);
[ADR-006](../../../current/adr/ADR-006-turn-checkpoints-and-branching.md) (fork and
rewind; edit below); [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Control requests sent, Session lifecycle;
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Turn record, Branch, Failure handling;
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) stored
`meta` fields.

Acceptance:

1. The branch's `rewind_conversation` carries `last_seen_user_message_uuid`
   = the source's latest recorded prompt (`latestPrompt`: the last `meta`
   record of the forked session or without a session, its `lastPromptUuid`,
   else `rewindUuid`), read when the rewind is sent; with none, the field is
   absent.
2. Every prompt echo of a turn is noted; the last one, when not the first, is
   recorded as `lastPromptUuid`, also on the record of a turn that ends
   without a `result` (with the session id).
3. `rewound: true`: the message is written after the rewind; the rewind stays
   armed until the fork's `system/init` on that process.
4. Refused, failed, or the process exits or is killed first: no user message
   is written (queued ones included); a running fork is stopped through the
   restart's wait, so a send meanwhile cannot run two processes; the tab shows
   and records `branchFailureText` (known reasons in the user's words) as the
   only error, the process's own exit error and the resume fallback left out;
   the turn's prompts are marked "Not sent", live and on reopen; the unsent
   text and images return to the composer.
5. The next send spawns a fresh `--resume <source> --fork-session` process and
   retries the rewind with the latest prompt read again; a dropped resume
   drops the rewind.
6. A failed branch closed and reopened re-arms the fork and rewind from its
   failure record; stored ids that are not lowercase UUIDs (`isSessionId`,
   ADR-018 Decision 1) arm nothing and the tab says so.
7. `tests/fake-cli.mjs` answers `rewind_conversation` as Claude Code 2.1.296
   does.

## Scope

Expected files: `src/protocol/client.ts`, `src/protocol/types.ts`,
`src/session.ts`, `src/tab/session-link.ts` (reader carried),
`src/tab/restore-branch.ts`, `src/state/branch-history.ts` (new),
`src/state/branch-failure.ts` (new), `src/state/session-id.ts` (new),
`src/state/stream.ts`, `src/state/turn.ts`, `src/state/tab.ts`,
`src/state/composer.ts`, `src/ui/composer.ts`, `src/ui/prompt.ts`,
`styles.css`,
`src/tab/chat-tab.ts`, `src/view.ts`, `src/history.ts`,
`src/history-file.ts`, `package.json` (pretest list);
`tests/fake-cli.mjs`, `tests/protocol.test.mjs`, `tests/session.test.mjs`,
`tests/state-branch-history.test.mjs` (new),
`tests/state-branch-failure.test.mjs` (new),
`tests/state-session-id.test.mjs` (new), `tests/state-tab.test.mjs`,
`tests/state-stream.test.mjs`,
`tests/state-turn.test.mjs`, `tests/state-composer.test.mjs`,
`tests/history-file.test.mjs`;
`docs/current/product/PRD-002-permissions-and-change-control.md`,
`docs/work/changes/CHG-012-branch-rewind.md`, DES-002, DES-003, DES-004,
DES-005, `RELEASE_NOTES.md`.

Negative scope: `/clear`, segments and cost (ADR-018, change 002); Restore
files; the fork's cost base; hiding Branch where the latest prompt is unknown;
the real CLI (fake only); `tests/styles.test.mjs`,
`tests/architecture.test.mjs`; `docs/current/adr/` (the ADR-006 edit is
applied at landing).

## ADR-006 edit

In Decision, the Branch bullet, replace "If the rewind fails, the branch keeps
the full history." with:

"If the rewind is refused or fails, or the forked process ends before it
answers, nothing is sent: the branch says why, puts the message back in the
composer, and its next send forks and rewinds again, also after the branch is
closed and reopened (PRD-002.R15)."

## Plan

- Tests first, then code.
- `ClaudeClient.rewindConversation(target, lastSeen)` returns `reason` too.
  `ClaudeSession` keeps a `BranchRewind` (`target`, `latest` reader) armed
  until `system/init` on the process it rewound; `rewindBranch` reports
  `onBranchFailed({ reason, detail, retry })`, reason `exited` when the
  process ended first; a current fork is stopped through `replaceAfter`, the
  restart's wait without a warm-up; `clearResume` drops the rewind. A close
  while the rewind is out reports no error of its own, and `resumeLost`
  (read by `SessionLink.endedWith`) is false while the rewind is armed, so
  the resume fallback never drops a branch's fork.
- `state/stream` reports every prompt echo (`first` marks the turn's own);
  `ChatTab` records the last as `lastPromptUuid`, on `turnEndRecord` too.
- `state/branch-history`: `latestPrompt` (moved from `restore`, legacy
  records without a session counted), `pendingBranch` (the reopen's re-arm,
  ids checked with `state/session-id`'s `isSessionId`). `state/branch-failure`:
  `branchFailureText`. `state/turn` `markNotSent`, applied live by
  `ChatTab.branchFailed` and on reopen by `modelFromStored` at a failure
  record with `branchTarget`; `ui/prompt` shows "Not sent".
- `ChatTab.branchFailed` records the error with `branchSession`,
  `branchTarget`, `branchLatest` when the fork is kept; the view puts the text
  back and, on reopen, calls `branchFrom` from `pendingBranch`, reading the
  latest from an open tab holding the source session, else the stored value.
- Reopen: persisting the pending branch in the failure record (three optional
  `meta` strings) was picked over blocking Send there; it needs no format
  change beyond optional `meta` fields and keeps the branch usable.
- Rejected: a snapshot at Branch time (stale once the source moves on, and a
  retry could never succeed); rewinding at Branch time before the user types
  (a process per Branch click, and a rework of the restart and delivery
  ordering); hiding Branch on earlier turns when the latest is unknown;
  closing the branch tab on failure (loses the user's text); an `Object`
  lookup for reason words (prototype keys).
- Verification: `make verify`; the reviewer's headless harness once its stub
  carries the rewind rules.

## Run log

- Scratchpad writes (Write and Edit, the harness stub included) are refused
  by the protected-path hook; repository edits made in place.
- `tests/architecture.test.mjs` lists top-level layer-1 modules by name and
  may not be edited, so the new modules live under `state/`.
- Round 2, reviewer's headless harness (`branch2.mjs`, its fixed stub, dark):
  B2, B6, B9 show one error, "Not sent" on the failed prompts, and the next
  send forks and rewinds; B12's reopen now reports the stored branch invalid,
  since the harness's ids (`sess-N`, `u-sess-N-M`) are not UUIDs; B13 as
  before. Bubble layout not shot.
- Evidence gaps, not verified against the real CLI:
  - whether Claude Code counts tool results or synthetic messages
    (compaction summary, local command output) as the "last user message";
  - whether a queued prompt's echo reaches the panel, and when;
  - whether a slash command's echo uuid is a transcript row the CLI accepts
    as last seen;
  - the exact `target_not_found` reply (the fake assumes its shape).
  A wrong or missing uuid takes the visible failure path, never a full fork.

## Independent review

Independent review agent with the headless harness (`scratchpad/harness/hunt-088r/`), 2026-10-13, three rounds.

Round 1 (rework), all applied:

1. A fork that exited or was killed during the rewind dropped the rewind; the
   next send forked without it. Now armed until `system/init` on the rewound
   process, dropped only with the resume; the exit reports `exited` and
   returns the text. Tests: exit with a code, kill.
2. Pre-0.6 records have no `sessionId`, so every Branch from them failed.
   `latestPrompt` counts records without a session. Test.
3. Queued or steered prompts and crashed turns were not counted. Every echo
   is noted; `lastPromptUuid` on turn and turn-end records. Tests.
4. Error text: reason words in `state/branch-failure`. Test.
5. A send right after a failure could spawn beside the stopping fork. Stopped
   through the restart's wait. Test.
6. Fake: `unseen_later_turn`, `target_not_found`, no prompts when nothing was
   resumed; PRD-001.R5 rewind tests run on a fork.
7. DES-004 Branch and Failure handling cover all reasons, crashed and queued
   source turns, persistent failure until the source records a newer turn.
8. Reopen re-arms the branch from its failure record. Stored values checked
   (ADR-018 review addition; round 2 below). Test.
9. `latestPrompt` moved to `state/branch-history`.
10. Harness stub: not updated; the protected-path hook refused writes to the
    scratchpad stub and to `hunt-088r/stub-fixed`. Patch handed to the
    coordinator.

Round 2 (rework):

1. Blocker: a fork exiting with a code during the rewind showed two errors,
   and the link's resume fallback ran `clearResume` before the branch failure,
   so nothing retried. Now the close reports no error while the rewind is
   out, and `endedWith` reads `resumeLost`, false while the rewind is armed.
   `SessionLink` imports `obsidian`, so the test drives a session whose end
   handler does what `endedWith` does; plus a `resumeLost` test.
2. `branchSession`, `branchTarget`, `branchLatest` checked with
   `isSessionId` (new `state/session-id`). Message uuids are UUIDs: the
   real-CLI records sanitize them as UUIDs (`<uuid-N>`, distinct from tool
   ids); their case is not recorded, and Claude Code generates them as
   lowercase. A wrong guess only shows the invalid-branch message.
3. A failed branch's prompts are marked "Not sent", live and on reopen. Test
   (state).
4. Accepted loss stated in DES-004 Failure handling: unsent text put back in
   the composer is gone once the tab closes.

Round 3: land. The changed tests fail against HEAD's `src` (20 failures).
Harness `branch3.mjs` with UUID ids: B1 to B14 pass, B6 and B9 through the
real `SessionLink.endedWith`; "Not sent" in all three prompt styles, dark and
light. Follow-ups, accepted: an empty "Claude" header with a copy button on a
turn with no reply (as for any turn ending in an error); the branch note is
not shown after reopen; a source whose transcript is gone fails on every
send (PRD-002.R15 accepts it).

## Outcome

Accepted. ADR-006's Branch bullet rewritten at landing. Lesson: a reply the
code ignores (`rewound: false`) hid a shipped defect for a release; every
control reply the plugin awaits must be checked or stated as ignored.
