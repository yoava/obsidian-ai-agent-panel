---
status: closed
release: r05-pre-redesign-fixes
number: 002
prd: PRD-002.R13, PRD-002.R14
---

# TASK-002 — Restore through the CLI's checkpoints

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Restore files rewinds through Claude Code's own file checkpoints instead of
the plugin's pre-image store, which can capture already-edited text when no
card holds the write, and keeps a second copy of notes in the plugin folder.

Governing:
[ADR-006](../../../current/adr/ADR-006-turn-checkpoints-and-branching.md),
PRD-002.R13, PRD-002.R14,
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(launch environment, `rewind_files`, `control`),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Turn record, Restore),
[DES-001](../../../current/design/DES-001-system-overview.md) (plugin
lifecycle step 3), constitution *Bounded file access*.

Acceptance:

1. Every spawn's environment carries
   `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`; in the WSL shape `WSLENV`
   also names it, after the user's entries. A user's
   `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` passes unchanged.
2. `rewindFiles(userMessageId, dryRun)` sends `rewind_files` with
   `user_message_id` and, for a preview, `dry_run: true` (30 s) and returns
   `{canRewind, error, filesChanged, insertions, deletions}`; any other reply
   shape is an error.
3. Each finished turn's `meta` record keeps `rewindUuid`, the `result`'s
   `sessionId`, the session's `profileId`, and `edited` when the main agent
   called Edit, Write, MultiEdit or NotebookEdit.
4. "Restore files" shows on a turn whose record has all four; hidden while
   the record's session or profile is not the tab's; disabled while a turn
   runs. Records from before the switch offer no restore.
5. Pressing it holds the tab's sends, runs a preview (starting the CLI
   without a prompt when none runs; a failed start shows the error and keeps
   the stored session id), then: `canRewind: false` shows the CLI's error or
   "That restore point is no longer available." and hides the button; no file
   shows "Nothing to restore."; otherwise a confirmation lists each file
   (marking those outside the vault), the line totals and the warning of
   PRD-002.R14.
6. Confirm runs the real rewind and shows `Files restored: N.` plus
   `M skipped.`; a failure, timeout or exit shows the error and warns that
   some files may already be restored. Every outcome after confirm re-reads
   the listed in-vault files into the change list and releases sends.
7. The plugin stores no file contents: `src/checkpoints.ts` is gone, and on
   load the plugin removes a legacy `<plugin dir>/checkpoints/` folder,
   logging a failure and trying again on the next load.

## Scope

Expected files:

- `src/protocol/client.ts` (`cliSpawnSpec` environment, `rewindFiles`),
  `src/protocol/types.ts` (`RewindFilesResult`), `src/session.ts`
  (`rewindFiles`)
- `src/view.ts` (turn record, Restore offer and flow, sends held, checkpoint
  capture removed), `src/diffview.ts` (`RestoreConfirmModal`),
  `src/history.ts` (`meta` fields, delete dialog text), `src/main.ts`
  (store removed, legacy folder removed)
- `src/checkpoints.ts`, `tests/checkpoints.test.mjs` (deleted),
  `package.json` (`pretest`)
- `tests/fake-cli.mjs` (`rewind` scenario, environment probe),
  `tests/protocol.test.mjs`
- `src/restore.ts`, `tests/restore.test.mjs` (new: the offer, button and
  Notice logic, testable in plain Node), `styles.css` (dialog rows)
- `README.md` (feature list, data on disk, files outside the vault),
  `docs/current/COMPARISON.md`,
  `docs/current/SECURITY.md`, `docs/current/DEVELOPMENT.md`,
  `docs/current/plan.md` (backlog items), `RELEASE_NOTES.md`; DES-001 (file
  map), DES-002, DES-004, DES-005 and the DES-003 draft where they disagree
  with the code

Negative scope:

- Branch from here (PRD-002.R15) and the profile a branch copies: unchanged.
- Awaiting the pre-edit read for the diff (PRD-002.R6): task 003.
- What the change list tracks: unchanged.
- Subagent edits, Bash, vault tools and directories stay unrestorable
  (ADR-006 open risk).
- A real-CLI run: only with the owner's approval; the manual checks of
  ADR-006 are owed in `docs/records/verification/`.

## Plan

- Tests first: a `tests/fake-cli.mjs` scenario answering `rewind_files` (a
  dry run, a real run that skips one file, a gone checkpoint, a malformed
  reply) and reporting its checkpointing environment; `ClaudeClient` tests
  for the request, the parsed result, the error cases and the spawn
  environment; `cliSpawnSpec` tests for `WSLENV`.
- `cliSpawnSpec` returns the environment, so the one launch function stays
  the one place that decides it and stays testable.
- The view keeps the flow: hold sends, preview through the session (which
  spawns when needed), modal, real rewind, re-read, release.
- Verification: `make verify`; independent review agent; the real-CLI checks
  of ADR-006 (native and WSL) only with approval.
- Rejected: keeping the plugin's store for subagent edits (ADR-006: two
  stores, the race stays).

## Run log

- Tests first: the fake CLI's `rewind` scenario and seven client and
  `cliSpawnSpec` tests failed before the change.
- Removing the store also removed the snapshot of subagent edits, which the
  CLI does not track (ADR-006 accepted loss), and the 15 store tests.
- `history.onDeleted` was wired only to the store; it stays unwired here.
  Deletion fan-out to every view is a backlog item (plan, DES-005).
- Real CLI, native, approved by the owner:
  `docs/records/verification/2026-10-11-real-cli-rewind-files.md`. A resumed
  CLI answers the preview before any prompt; the real reply carries only
  `canRewind`, as review item 6 anticipated. No code change.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Defect: README's feature list still described the old restore. Fixed.
2. Gap: Enter and Restore pressed while a reopened tab's session was being
   created could run a turn and a rewind together. Fixed: both re-check
   after the await.
3. Gap: `canRewind: false` on the real rewind was reported as a partial
   failure. Fixed: shown as the CLI's refusal, the button hidden.
4. Gap: the buttons were not refreshed when a delete or a failed resume
   cleared the session id. Fixed.
5. Gap: under WSL, `/mnt/<drive>/` paths are not mapped into the vault (also
   edit cards). Predates the task: backlog item.
6. Gap: a real-rewind reply without `filesChanged` read as "0 restored".
   Fixed: an absent list stays absent and the preview's count is used; the
   real reply's shape is part of the owed real-CLI check.
7. Gap: whether the CLI answers `rewind_files` before loading the resumed
   session's file history: owed real-CLI check.
8. Gap: the offer and Notice logic lived only in `view.ts` (design rule 4).
   Fixed: `src/restore.ts` with `tests/restore.test.mjs`.
9. Gap: a CLI started for a restore that later exits with an error dropped
   the stored session id. Fixed: a preview reply marks the resume as worked.
10. Stale text: the turn-counter comment, COMPARISON.md, a release-notes
    bullet calling ADR-006 unbuilt, DES-004's preview call and citation, the
    DES-003 draft. Fixed. DES-004's subagent pre-image read is the target
    design; the code gap is a backlog item.
11. to 19. Nits: a misplaced JSDoc, the dialog layout and warning text, the
    hold released before the dialog opened, double error text, an
    environment-dependent test, a duplicated tool set, a queued turn
    inheriting the previous turn's uuid, SECURITY.md wording. Fixed, except
    a Notice for a send held during a restore (none: PRD-002.R14 only says
    nothing is sent).

Out of scope, now backlog items: a conversation's CLI profile is not stored
(PRD-003.R1, R9), and subagent edits never reach the change list
(PRD-002.R7).

Round 2, the same reviewer on the fixes; `make verify` passed. Every
round-1 fix verified. Remaining, all fixed:

1. Defect: `view` imported `protocol/client` (DES-002 rules B5, B6). The
   exit message moved to `protocol/types`.
2. Gap: any `rewind_files` reply marked a resume as worked, `canRewind:
   false` included, which a lazily validated `--resume` could answer. Only a
   reply that can rewind does now (DES-002, DES-005 say so).
3. Stale: DES-004's result count, the real rewind's refusal, the Modules
   table and the turn-record reset. Updated.
4. Nit: a restore's CLI that exited cleanly before replying showed only a
   Notice; the tab now says so in its messages unless the exit error is
   already there.

## Outcome

Restore files rewinds through Claude Code's checkpoints; the plugin keeps no
file contents. Owed by hand in a vault: the dialog and button states, and the
WSL run (`WSLENV`).
