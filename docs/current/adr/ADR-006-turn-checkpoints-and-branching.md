# ADR-006 — Restore through the CLI's file checkpoints; branch by fork and rewind

**Status:** accepted (2026-10-10)

## Context

- Users need to undo what a turn did to their files, and to continue from an
  earlier turn without losing the original conversation.
- The panel replaces the CLI process on effort or profile changes and after
  crashes, resuming the same session id (ADR-001). A conversation records no
  profile, so a reopened one may resume on another install (ADR-008).
- Claude Code snapshots a file before its Edit, Write or NotebookEdit tool
  writes it, keyed to the user message that started the turn, as plain text
  under `~/.claude/file-history/<session>/`. Snapshots survive `--resume`; the
  CLI keeps the 100 most recent checkpoints per session and deletes them on
  its `cleanupPeriodDays` sweep (30 by default) or `claude purge`. Under `-p`
  this is off unless `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`;
  `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` turns it off.
- The `rewind_files` control request (`user_message_id`, optional `dry_run`)
  returns every tracked file to its state at that message and answers
  `canRewind`, `error`, `filesChanged`, `insertions`, `deletions`,
  `skippedLinks`. It skips links, files whose folder no longer resolves to
  where it was, and unreadable backups. It does not track Bash, subagent
  edits other than a foreground forked skill's, or directories. It has no
  `interrupt_if_running`.
- `rewind_conversation` truncates a session to a user-message uuid;
  `--fork-session` with `--resume` copies a session under a new id. The CLI
  reports the uuids of the client's own user messages only with
  `--replay-user-messages`.

## Options considered

### The CLI's file checkpoints and `rewind_files` (recommended)

- While checkpointing is on, the CLI snapshots before the write in every
  permission mode; covers NotebookEdit; skips links safely; survives process
  replacement; the plugin keeps no store and no file contents.
- Misses subagent edits. Rewinds later turns too, never one turn alone. The
  preview lists files and line totals, not a diff. Writes and deletes on disk
  outside Obsidian's vault API, so a created file is deleted, not trashed.
  Note copies sit in `~/.claude`, outside the vault, until the CLI deletes
  them.

### Plugin-owned pre-image checkpoints

- Covers subagent edits; restores only the files one turn touched; the dialog
  shows a content diff; restores go through the vault API, trashing created
  files.
- The pre-image read is asynchronous, so where no card waits it can land
  after the write and store the edited text. A second copy of notes in the
  plugin folder, which the agent's own file tools can reach, with stored
  paths to validate. Store, pruning and id-safety code to maintain.

### CLI checkpoints for the main agent, plugin pre-images for subagents

- Covers subagent edits without the race for the main agent's.
- Two stores and two restore paths with different semantics; the race and
  the plugin's copies remain for subagent edits.

### Git or Obsidian's File Recovery

- Nothing for the plugin to store.
- The vault may not be a repository; File Recovery snapshots at a set
  interval, not per turn.

### Branch by an in-place `rewind_conversation`, not fork and rewind

- Native; no fork.
- Destroys the original conversation.

## Decision

Why the CLI's checkpoints:

- They survive what the panel does to processes: "Claude Code saves
  checkpoints with the conversation, so you can still run `/rewind` after you
  resume a session" (Claude Code docs, *Checkpointing*), and a respawn
  resumes the same session id (`src/session.ts:142`).
- They are taken before the write. The plugin's pre-image read starts at
  `tool_use` and nothing holds the write for it (`src/view.ts:3244-3254`), so
  with no card it can capture the edited text.
- The stdio interface carries them: `rewind_files` takes `user_message_id`
  and `dry_run` and answers `canRewind`, `filesChanged`, `insertions`,
  `deletions` (request schema in Claude Code 2.1.296; Agent SDK reference,
  `RewindFilesResult`).
- Accepted losses: subagent edits ("Edits a subagent applies aren't tracked
  or restored", docs, *Rewind file changes with checkpointing*), restore of
  one turn alone, and a content diff in the dialog.

Branching forks because an in-place `rewind_conversation` truncates the only
copy of the session (`src/protocol/client.ts:303-308`).

The design:

- Capture: every spawn sets `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`;
  for a WSL profile the name is also appended to `WSLENV`, keeping the user's
  entries (ADR-008). Every spawn passes `--replay-user-messages`. A finished
  turn's meta record keeps its user-message uuid, the session id its
  `result` reports, the profile that ran it, and whether the main agent
  called Edit, Write, MultiEdit or NotebookEdit.
- Offer: "Restore files" on a turn with all four, while its session and
  profile are the tab's; disabled while a turn runs in the tab.
- Restore:
  1. The tab holds its sends from the preview until the rewind ends.
  2. The tab's CLI, started without a prompt when no process runs, sends
     `rewind_files` with `dry_run: true`. A start that fails here leaves the
     conversation's stored session id in place.
  3. A dialog lists `filesChanged`, marking paths outside the vault, and the
     line totals. It warns that later edits to those files, by later turns,
     the user, another tab or another tool, are lost, and that tracked files
     created after the turn are deleted permanently.
  4. Confirm sends `rewind_files` without `dry_run`.
  5. `canRewind: false` shows the CLI's `error`, or "That restore point is no
     longer available.", and hides the button. A timeout or exit mid-rewind
     says files may have changed.
  6. The change list re-reads each listed path that maps into the vault, as
     reported tool paths are mapped.
- The plugin keeps no file contents: `src/checkpoints.ts` goes, and on load
  the plugin deletes a legacy `<plugin dir>/checkpoints/` folder, retrying on
  the next load if that fails. Turns recorded before the switch offer no
  restore.
- Branch: a new tab resumes the session of the chosen turn's segment
  (ADR-018, Branch source) with `--fork-session` and sends
  `rewind_conversation` to that turn's user-message uuid before its first
  message; Branch is hidden when that session is unknown and disabled when
  this device did not record it. If the rewind is refused or fails, or the
  forked process ends before it answers, nothing is sent: the branch says
  why, puts the message back in the composer, and its next send forks and
  rewinds again, also after the branch is closed and reopened
  (PRD-002.R15). The branch's turns record the fork's session id, so the
  original's checkpoints stay with the original.
- Validation: a `tests/fake-cli.mjs` scenario answers `rewind_files`, dry run
  and real; `ClaudeClient` tests assert the request, the parsed result and
  the spawn environment, `WSLENV` included. The dialog, the promptless start
  and both rewinds are checked by hand against the real CLI, native and WSL,
  recorded in `docs/records/verification/`.

## Consequences

- While checkpointing is on, no snapshot can hold the already-edited text,
  and no stored path can aim a restore elsewhere.
- Restore can rewrite files outside the vault that the main agent edited,
  as the constitution's *Bounded file access* allows: "A confirmed *Restore
  files* asks the CLI to rewind the files its own checkpoints track, inside or
  outside the vault, after a preview has named each of them; the plugin
  itself writes nothing outside the vault"
  (`docs/current/constitution.md:41-44`).
- Restoring a turn also undoes every later turn's tracked edits.
- Turns before a clear ran in another session and offer no restore until
  Undo returns to it (ADR-018).
- Created files are deleted outright; Obsidian reloads changed notes from
  disk.
- Full contents of each tracked file are copied to
  `~/.claude/file-history/<session>/` (inside the distro for a WSL profile)
  and are not deleted with the conversation. README and SECURITY.md disclose
  it.
- `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING`, set in Obsidian's environment or
  by the WSL login shell, wins: the button shows and the preview reports
  restore unavailable.
- Restoring in a reopened conversation starts its CLI and leaves it running
  as the tab's process; no model turn is sent.
- A branch rewinds the conversation, not files: the vault stays as the
  original tab left it.
- Restore and branching depend on `rewind_files`, `rewind_conversation`,
  `--fork-session` and the checkpointing variable keeping their documented
  behaviour. A Codex adapter (a later release) needs its own restore or none.
- Open risk: subagent edits (other than a foreground forked skill's), Bash,
  vault tools (ADR-004), linked files and directories are not restored,
  though the action reads as a whole-turn undo.
- Open risk: the dialog warns about later edits but shows no content diff
  that would reveal them.
