---
status: closed
release: r07-mock-fidelity
number: 097
prd: PRD-002.R15, PRD-001.R37
---

# TASK-097 — No Branch on turns a compaction summarized away

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S. A real-CLI run (task 095 record, W1 and W2) showed Claude Code refuses a
rewind to a prompt before a compaction boundary, manual or automatic
(`rewound: false`, `target_not_found`), while the turn whose prompt triggered an
automatic compaction (its echo follows the boundary), a manual `/compact` turn
and later turns rewind. Branch was offered on the earlier turns and always
failed with "Claude Code no longer has it."

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R15; [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R37;
[DES-004](../../../current/design/DES-004-permission-and-change-control.md) Branch;
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md) Records.

Acceptance:

1. A turn whose record is followed by a `compaction` record, before the next
   clear or fresh start, shows Branch disabled with the title and description
   "Claude Code compacted the conversation after this turn, so it can no longer
   branch from here".
2. The turn that triggered an automatic compaction, a manual `/compact` turn and
   later turns keep Branch enabled.
3. A reopened conversation decides the same from its stored records; a
   compaction after a clear or fresh start does not disable turns before it.
4. The foreign, pending and hidden states win where they apply; Restore files
   is unchanged.

## Scope

Expected files: `src/state/branch-history.ts` (`summarizedAway`,
`SUMMARIZED_BRANCH_TITLE`), `src/tab/restore-branch.ts`, `src/view.ts`
(`branchBlock`), `tests/state-branch-history.test.mjs`, DES-003 (module row),
DES-004 (Branch step 2), `RELEASE_NOTES.md`.

Negative scope: `src/state/stream.ts`, `tests/fake-cli.mjs` (task 096);
Restore files; the failure text; the replay of `local-command-stdout`.

## Plan

Pure `summarizedAway(messages, record)` over the stored records, using the
record order (a compaction record is written mid-turn, before the turn's end
record). `branchBlock` returns `compacted` after the session checks;
`RestoreBranch.updateBranch` retitles. Buttons refresh on `restore.update()` at
each turn end. Rejected: tracking the boundary uuid (the panel does not record
it), and probing the CLI with a rewind per turn.

## Run log

- Tests and implementation were written in one step; the three tests pass.
- Not known: whether `rewind_files` also fails for a prompt before a boundary
  (task 095 ran a dry run only on a `set_model` stdout uuid), so Restore files
  stays as it is.
- Not modeled: the fake CLI's `rewind_conversation` does not drop prompts on a
  compaction scenario (`tests/fake-cli.mjs:797`); the rule is tested on stored
  records only.

## Independent review

Independent review agent: approve after one wording fix (DES-004: Restore
files follows its own rule, not Branch's state; applied). The rule matches
every refused and accepted target in the real-CLI evidence (W1, W2);
compaction records are written only on a boundary, mid-turn, before the
turn's end record, so failed or interrupted compactions disable nothing;
clear and fresh-start records bound the scan; a fork holds only its own
turns. The view layer (`branchBlock`, `updateBranch`) is Obsidian-bound and
was read, not run.

## Outcome

Done. `make verify` exit 0. Conversations stored before this release carry
no compaction records, so their summarized turns still offer Branch and fail
with "Claude Code no longer has it."
