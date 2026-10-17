---
status: closed
release: r07-mock-fidelity
number: 092
prd: PRD-002.R15
---

# TASK-092 — A branch keeps its rewind until the branch is cut

## Spec

Follow-up to [088](../../../records/tasks/r07-mock-fidelity/TASK-088-branch-rewind.md):
a Codex review of its commit found four ways a branch could still fork with no
rewind (the original silent full-history defect) or lose its intent.

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R15; [ADR-006](../../../current/adr/ADR-006-turn-checkpoints-and-branching.md)
Branch bullet; [ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md)
Decision 1 (session-id grammar);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md) Branch.

Acceptance:

1. After a failed rewind, a session the tab drops (a profile change) does not
   lose the rewind: the tab holds it until a rewind succeeds (the fork's
   `system/init` on the rewound process) and gives it once to every session it
   creates meanwhile.
2. A rewind's target and last-seen ids that are not lowercase UUIDs are never
   sent: the session reports a branch failure, nothing is written. A stored
   latest prompt that is not a UUID is not offered as the latest seen.
3. A later error without branch fields (a panel command's fork that exited)
   does not hide the branch still to make; a record of the fork's own session
   does.
4. The branch is recorded once, ahead of the conversation's first record of
   any kind (a send, a panel command, a `!` run), so closing during the first
   rewind reopens as that branch; a branch opened and closed unused stores
   nothing; the record draws nothing.
5. Branch from a turn whose stored message id is not a UUID opens no tab and
   shows a Notice.
6. When the rewound fork reports its session (`init`, else its first `result`; never released without an id), the link resumes that session
   and no longer forks; the conversation stores the id.
7. A dropped session's processes (a fork a failed rewind is stopping) have exited before the next session starts.
8. A turn that ends before its branch's rewind succeeded records the branch on its end record, and reopens with its prompts "Not sent"; a turn ended after the cut does not.

## Scope

Expected files: `src/state/branch-hold.ts` (new), `src/state/branch-history.ts`,
`src/state/session-id.ts`, `src/state/tab.ts`, `src/protocol/types.ts`
(`isCliId`), `src/session.ts`, `src/tab/session-link.ts`, `src/tab/recorder.ts`, `src/tab/chat-tab.ts`,
`src/view.ts`, `src/history.ts`, `package.json` (pretest);
`tests/state-branch-hold.test.mjs` (new), `tests/state-branch-history.test.mjs`,
`tests/state-tab.test.mjs`, `tests/session.test.mjs`, `tests/protocol.test.mjs`,
`tests/fake-cli.mjs` (UUID ids); DES-001 to DES-005 rows; `docs/current/plan.md`
Backlog (one line on `shell: true`).

Negative scope: `/clear`, segments, provenance (the stored ordinary
`sessionId` keeps `isSafeArgValue`), cost; the cmd.exe `shell: true` launch;
`tests/architecture.test.mjs`, `tests/styles.test.mjs`. No release-notes entry:
the promise 088 made (the branch retries, also after a reopen) is unchanged.

## Plan

- Tests first; the fake CLI's branch ids become UUIDs.
- `BranchHold` (pure) in `state/`; `SessionLink` uses it; `ClaudeSession`
  reports `onBranchCut` when the rewound fork's `init` arrives.
- The id check sits in `ClaudeSession.rewindBranch`, the control boundary that
  may import `protocol/types` only (architecture A5, A6); `isCliId` lives in
  `protocol/types` and `state/session-id` re-exports it as `isSessionId`.
- `branchRecord` builds the record for both the open-time intent and the
  failure; `isBranchIntent` keeps it out of the model.
- Rejected: a new `protocol/ids` module (not in the frozen architecture test's
  layer list); recording the intent when the tab opens (an unused branch would then be
  listed).

## Run log

- Intent taken by `Recorder.record` for the conversation's first record
  (`leadRecord`, `SessionLink.takeBranchIntent`), once per branch.
- Verification: [2026-10-13-branch-rewind-hold](../../../records/verification/2026-10-13-branch-rewind-hold.md)
  (fake CLI, `SessionLink` and `Recorder` in a headless harness).

## Independent review

- Review agent (not the implementer): land after three fixes (a panel command
  or `!` before the first send, refuse a bad target at open, resume the fork
  after the cut), all applied; harness evidence recorded.
- Codex, on the uncommitted fix: the four findings on 7dd3ce8 closed; two
  further gaps (a cut confirmed by `result` without `init`, overlapping forks
  after a profile drop) and one P3 (inferred "Not sent") found and fixed;
  `create()` cannot hang, since `stop()` resolves at its SIGKILL timeout.
- Residual: a crash after a successful rewind but before the fork reports its
  session marks the prompt "Not sent"; the next send forks and rewinds again,
  so the branch's context matches the label.

## Outcome

Accepted. `make verify` passes; the harness's seven checks pass.
