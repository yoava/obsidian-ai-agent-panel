---
status: closed
release: r06-panel-redesign
number: 036
prd: PRD-001.R9, PRD-002.R7, PRD-002.R18, PRD-003.R11
---

# TASK-036 — Header and changes

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 6: the header's title block and "More", the changes bar with
its chip and Transcript button, the changed-files popover with "Restore to
before turn N", and the edit tracking and restore and branch controllers
moved out of the view. PRD-001.R9 lands with "More"'s "Previous
conversations".

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R9, R30's header clauses;
[PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R7, R18; [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R11; [DES-003](../../../current/design/DES-003-panel-ui.md) Header and changes
bar, Layout model (top-region grid);
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Change list, Restore, Branch.

Acceptance:

1. Header per DES-003's table for strip and column layouts, from and below a
   360 px main column; the column layout's title block shows the title,
   prompt count and start time.
2. "More" (below 360 px): "Previous conversations", "Open transcript" when
   exported, "Export to Markdown", "Plugin settings".
3. The changes bar shows while the conversation has changed files or an
   exported note: the chip `N files +x -y` (`+x -y` below 360 px), tooltip
   "Show the files this conversation changed"; "Transcript", tooltip "Open
   the exported note", labelled on the bar, icon-only in the header row, in
   "More" below 360 px. It sits under the header, or in the header row while
   the column shows or the panel is at most 640 px tall, through grid areas
   over a `display: contents` header; no element changes parent.
4. "Files this conversation changed": one row per file with `+x -y` or
   "new"; "Review changes" opens "Changes this conversation"; "Restore to
   before turn N" with PRD-002.R18's title, disabled while a turn runs, left
   out while the change list is empty, running Restore files for the
   earliest turn that offers it, N from `state/prompts`.
5. An exported note missing on click shows `Exported note not found:
   <path>`; a missing changed file `Note not found: <path>`.
6. `view` fires `export` when `exporter.onExported` fires for an open
   conversation; pre-image reads, diffs and the change list live in
   `tab/edit-tracker`, restore and branch in `tab/restore-branch`.

## Scope

Expected files:

- New: `src/ui/changes-bar.ts`, `src/ui/popovers/more.ts`,
  `src/ui/popovers/changed-files.ts`, `src/tab/edit-tracker.ts`,
  `src/tab/restore-branch.ts`.
- Changed: `src/ui/header.ts` (title block, "More"), `src/state/prompts.ts`
  (a turn's prompt number), `src/restore.ts` (the earliest turn offering
  Restore files), `src/view.ts`, `styles.css`, `tests/fake-cli.mjs` (a turn
  that edits a vault note, so the chip and "Restore to before turn N" show
  under `rewind`); `tests/restore.test.mjs`, `tests/state-prompts.test.mjs`.
- Docs: DES-004 (the changes popover, "Restore to before turn N");
  `README.md` (the header's changes link and transcript link);
  `docs/current/DEVELOPMENT.md` (the scenario); `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- `SessionChangesModal`, `RestoreConfirmModal` and the diff view (DES-004,
  unchanged); the backlog item on drawing every file's diff at once.
- The turn footer's Restore files and Branch buttons (037; today's meta line
  keeps them, calling `tab/restore-branch`); the step row's edit outcome
  (039).
- No new dependency; no protected path; no real-CLI run.

## Plan

- Tests first: the earliest turn offering Restore files
  (`PRD-002.R18: …`, `restore`); the prompt number of a `meta.turn`, the last
  numbered prompt recorded before that turn's first output
  (`PRD-002.R18: …`, `state-prompts`).
- Moves out of `view.ts`: `updateTranscriptLink`, `updateChangesLink`,
  `openSessionChanges`, `openTranscriptNote`, `onTranscriptExported` (to the
  `export` event); `readVaultText`, `resolveReportedPath`,
  `recordFileChange` and the pre-image reads to `tab/edit-tracker`;
  `restoreFiles`, `restorePointGone`, `finishRestore`, `releaseRestore`,
  `rereadChangedFiles`, `branchFrom`, `updateRestoreButtons` to
  `tab/restore-branch`. `settleEditCard` and `renderEditDiff` stay with the
  legacy tool card, calling `tab/edit-tracker`, until 039.
- Verification: `make verify`; manual, by someone other than the
  implementer: PRD-001.R9's rows (M1 at 1040 px: filter and Escape, collapse
  kept, row menu, pin; "More" at 300 px), PRD-002.R7's (chip, popover,
  "Review changes"), R18's (`rewind`: the button, its title, disabled while a
  turn runs), PRD-003.R11's (M1: Transcript at 300, 440 and 1040 px and
  600 px tall).
- Risks: restore offered on the wrong turn if `meta.turn` and prompt numbers
  drift (tested); the grid's header-row cases depending on two container
  queries and a class (`is-column`), each threshold in one place.
- Rejected: moving the changes bar into the header in TypeScript (DES-003
  Alternatives: the 640 px rule has no TypeScript signal).

## Run log

- Tests first, against 034's tree (309a907): `state-prompts` and
  `state-tabs` failed on import (no `turnPromptNumber`, `titleBlock`); the
  three `restore` tests failed on `restoreBefore` and the three new
  `edit-tracker` tests on `ChangeList`.
- No protected path touched; `tests/architecture.test.mjs` and
  `tests/styles.test.mjs` unchanged (no allowlist row is due in this
  slice). No `package.json` change: the changed pure modules are in
  `pretest` already.
- Choices the accepted docs leave open, or where this departs from them,
  for review:
  - N: DES-003 said "the last numbered prompt recorded before that turn's
    first output", found by `meta.turn`. That numbers a turn after a
    prompt sent before its first output (which joined or queued behind it)
    and confuses a turn Claude Code takes up from a queued prompt, which
    records the same `meta.turn` as the turn before. `turnPromptNumber`
    takes the turn's record and returns its first prompt recorded before
    its first output, else the last prompt before that output; a panel
    command's card is no output. DES-003 says so. Each turn keeps its N,
    so a detached (deleted) conversation keeps it; the earliest turn is the
    first recorded whose button shows, and a turn without an N is skipped.
  - Restore to before turn N is disabled while a restore runs too, as the
    footer's Restore files is; pressing it presses that turn's button
    (`tab/restore-branch`).
  - Popover rows open their note (`Note not found: <path>` when gone), as
    the modal's file names do; the PRD does not say. DES-003 and DES-004
    say so.
  - A row shows its `+x -y` and "new" when the conversation created the
    file, where PRD-002.R7 said "`+x -y` or "new"": R7 is amended to
    "its `+x -y` and, for a file the conversation created, "new""
    (lead-authorized, for the owner to confirm).
  - The change list (`ChangeList`) moved into the pure `edit-tracker`
    with its counts, computed once per change with `diffText`; the chip
    and the rows read them. `diffview`'s `changeTotals` stays for
    `SessionChangesModal` (negative scope), so the backlog item on the
    modal drawing every diff stays. Files beyond the expected list:
    `src/edit-tracker.ts`, `tests/edit-tracker.test.mjs`,
    `src/state/tabs.ts` (`titleBlock`, sharing the tab card's prompt and
    start wording), `tests/state-tabs.test.mjs`, DES-001, DES-003.
  - Kept in `view` as intent handlers: `openNote` (open a note or say it
    is gone), `openTranscript` and `reviewChanges` (the view receives the
    intents that need a service); `openBranch` (the view owns the tab
    list) behind `RestoreBranch.branch`, which holds the no-session
    Notice, what a branch copies, its title and its note.
    `rereadChangedFiles` became `TabEditTracker.reread`, which
    `tab/restore-branch` calls: the change list is the tracker's.
    `onTranscriptExported` keeps its name for `main` and fires `export`
    for a conversation a tab holds.
  - `ui/changes-bar` also redraws on `tabs`: a reopen into the active tab
    and a detach change its conversation without `active`. DES-003's
    component table says so.
  - Which parts show and where is CSS: classes `has-changes` and
    `has-transcript` on the bar, `is-column`, `@container ai-agent-panel
    (max-height: 640px)` and the 360 px main-column query; below 360 px
    a bar with only Transcript hides.
  - The chip is named by a visually hidden label (`3 files +12 -4`) so
    the tooltip's `aria-label` does not rename it; "Restore to before turn
    N" is named by its text and described by its title. `+x` and `-y` show
    only when not zero, as the old link did.
  - DOM order is nav, actions, bar (grid areas, no element changes
    parent): in the header row the bar sits between them on screen but
    comes after the actions in the Tab order.
  - The title block is drawn only while the column shows, again on
    `layout`. "More" is a list of buttons, focus on the first; "Open
    transcript" shows when the note exists at open.
  - Fake CLI `rewind`: each turn echoes its prompt with uuid
    `u-turn-<n>`, writes `Fake CLI note.md` (created first, outside a tool
    call, when missing, so it reads as the user's note) and creates
    `Fake CLI new note.md` when missing, 2 s after announcing the writes
    (the panel reads first; the wait also shows the disabled restore).
    It keeps each turn's prior contents in memory and rewinds them for its
    own uuids; another process's `u-turn-*` is gone. Files are written
    only when a turn is sent, so the protocol and session tests write
    nothing.
- Self-check in headless Chromium with Obsidian 1.14.4's `enhance.js` and
  `app.css` (the 034 harness: the real shell, popover and hover-card hosts,
  header, changes bar, strip and switcher on stub sources): at 440 px the
  bar sits under the header with `2 files +4 -1` and Transcript; at
  440×600 and at 1040 and 820 px (column) it sits in the header row,
  Transcript icon-only; at 1040 px the title block reads
  `Q4 planning review | 3 prompts · started HH:MM` with settings only; at
  300 px the switcher, "+" and "More", the chip `+4 -1`, Transcript
  hidden, and a bar with only Transcript hidden; no horizontal scroll at
  any width. The popover opens down below the chip, focus on the first
  row, rows `Q4 planning.md +2 -1` and `Budget 2027.md new +2`,
  "Restore to before turn 2" named, described and titled, disabled during
  a turn and enabled after, gone when not offered, rows added while open;
  Enter on a row opens it and refocuses the chip. "More" lists its four
  entries (Open transcript only when exported) and runs them. The fake
  CLI's `rewind` turn, run in a scratch directory: echo, writes, results,
  a dry run listing both files, and a rewind restoring the note and
  deleting the new one.
- Codex cross-review: not obtained. The review of 309a907..38e3c82
  (correctness framing, read-only, limited to the repository) stopped on
  the workspace's Codex spend cap before answering, and a retry was
  refused the same way; a substitute review by a separate agent stopped
  on the account's spend limit. Codex stays unavailable (spend cap); the
  independent review covers it. Meanwhile the implementer re-checked the
  same questions: `turnPromptNumber` against
  every recording path (`recordPrompt`, panel commands and their late
  cards, `/usage` cards, which are always recorded, `!` runs, error
  `meta` records from a session end, prompts queued before and after a
  turn's first output, a turn taken up from a queue); each moved restore,
  branch and change-list path against the removed view code (call sites
  of `restoring`, `restoreEndShown` and the button update; `reread` still
  re-reads only listed vault files the list holds); the bar, popover and
  title block on a switch, a reopen into the active tab, a detach, an
  export, a turn starting or ending and the list emptying while open.
  Found: `update` read the tab's session and profile with no turn to
  write, as the view's early return had avoided (restored). Residual: a
  panel command whose card is never recorded (none known) would make the
  next assistant record count as that card.
- Replayed onto task 035's commit (e947a74), the net diff 309a907..0ae1f05
  applied with `git apply --3way`. Resolved:
  - `state/prompts`: one rule. 035's `turnPromptNumbers` (a map by
    `meta.turn`, last prompt before the first output, a card only right
    after its command) gave way to `turnPromptNumber`; its test cases
    (a `/mcp` card, a `!` run, a prompt sent mid-turn after a tool call, an
    error turn) joined this task's tests, which test the one function.
  - `view`: `addTab` keeps 035's `ChatTab` and messages and gains the
    tracker and `RestoreBranch`; `switchTab` keeps the rail; `openBranch`
    creates the conversation through `tab/recorder` and writes the branch
    note into a legacy item; the legacy links stay deleted.
  - Docs: README, RELEASE_NOTES, DEVELOPMENT and DES-001 keep both sides
    (DES-001's view jobs keep `tab/recorder` for recording).
  - N under 035's chunked reopen: the messages model's legacy items hold
    the stored message objects themselves, so a drawn turn record is found
    in `conversation.messages` by identity and numbered from the whole
    list. But older sections draw later, only while the tab shows, so a
    turn's Restore files registered when drawn left "Restore to before
    turn N" naming a later turn while older ones were undrawn.
    `RestoreBranch.load` now takes every offering record of a reopened
    conversation, with its N, before the reopen draws any (replacing the
    tab's earlier turns, which also drops a reused tab's old buttons in
    place of the `isConnected` filter); a drawn button attaches to its
    record's entry, and a live turn's entry is made at its `result`.
    DES-003 says so.
  - Self-check re-run on the replayed tree: the same results.
- Replayed onto `main` at dd2a397 (task 035 landed: e947a74 plus the pin's
  `is-current` and `linkAnchor`'s element check): bc75952's diff applied
  cleanly with `git apply --3way`.
- Independent review fixes, tests first where pure:
  - D1: after the open conversation was deleted and the user kept
    chatting, the next turns' records went to a new conversation record
    numbered from 1, so "Restore to before turn N" (lowest N) chose them
    with a wrong N. The earliest turn is now the first recorded whose
    button shows (`restoreBefore`), and `turnRestore` adds the tab's
    prompts from the deleted record (`RestoreBranch.detach`, called by
    `onConversationDeleted`); a turn running at the delete takes the last
    of them. Two `restore` tests failed first: the recorded order and the
    reviewer's case (turns 2 and 3 offer Restore files, the delete, then a
    turn shown as prompt 4).
  - D2: the strip did not re-check its overflow when the bar entered or
    left the header row; `ui/changes-bar` takes the resize pass and
    requests one when `has-changes` or `has-transcript` changes. DES-003
    says so.
  - G1: the open popover did not follow restore state; `RestoreBranch`
    fires `restore` when its turns load or one is added, a point is gone,
    or a restore starts or ends, and the popover follows it. DES-003's
    events table and follow list say so.
  - N1: the fake CLI reused `u-turn-<n>` after a rewind dropped
    checkpoints; it counts turns run.
  - N2: RELEASE_NOTES said the short panel's header shows the title block;
    only the column layout's does.
  - N3: PRD-002.R7 amended (above).
  - N5: one `ChangedFile` and one `ChangeTotals`, in `edit-tracker`;
    `diffview` imports both as types (its `FileChange` and `ChangeTotals`
    are gone).
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer, "Conversation tabs" Automatic:
  1. M1 header (PRD-001.R30): at 440 and 680 px the strip, "+", divider,
     history, settings, no "More"; at 300 px the switcher, "+" and "More";
     at 1040 px the title block (title, `N prompts · started HH:MM`,
     updating on a send and a switch) and settings only; no horizontal
     scroll bar at any width.
  2. "More" at 300 px (PRD-001.R9, R30): opens down from the header,
     titled "More": Previous conversations (opens the picker), Open
     transcript (only with an exported note), Export to Markdown, Plugin
     settings; Escape and a pick return focus to "More"; in column layout
     with the column dragged wide enough for a main column under 360 px,
     "More" replaces settings.
  3. PRD-001.R9 at 1040 px: filter and Escape, collapse kept after a
     reload, the row menu, the hover pin (034's row 9).
  4. PRD-002.R7 (`rewind`, Ask): after a turn, the chip
     `2 files +2 -1` under the header at 440 px, tooltip "Show the files
     this conversation changed", `+2 -1` at 300 px, in the header row at
     1040 px and at 440×600; a click opens "Files this conversation
     changed" down from it: `Fake CLI note.md +1 -1` and
     `Fake CLI new note.md new +1`; a row opens its note; with the note
     deleted, `Note not found: <path>`; "Review changes" opens "Changes
     this conversation"; a screen reader names the chip by its counts.
  5. PRD-002.R18 (`rewind`): after turn 1, "Restore to before turn 1",
     its tooltip PRD-002.R18's title; after turn 2 still turn 1; during a
     turn (send, then open the popover within 2 s) disabled, enabled when
     it ends; pressing it opens the preview dialog listing both files,
     Restore files puts the note back to "No turns yet." and deletes the
     new note, `Files restored: 2.`, and the chip goes; Cancel changes
     nothing; after a reopen no chip and no "Restore to before turn N";
     Restore files on a reopened turn says the point is gone (a new fake
     process).
  6. PRD-003.R11 (M1, "Export transcripts to Markdown" on): Transcript
     labelled on the bar at 440 px; icon-only in the header row at 1040
     px and at 440×600; at 300 px hidden from the bar and in "More" as
     Open transcript; tooltip "Open the exported note"; with the note
     deleted, `Exported note not found: <path>`.
  7. R14 and R15 through `tab/restore-branch`: a turn's Restore files
     (preview, confirm, cancel, a running turn disabling it) and Branch
     from here (a new tab with the branch note; "This conversation has no
     CLI session to branch from yet." in a tab without a session) as
     before.
  8. M6 at 300, 440 and 1040 px and 600 px tall: Tab reaches "+",
     history and settings, or "More", then the chip and Transcript; Enter
     or Space opens each; in the popovers Tab and Shift+Tab move, Escape
     closes and refocuses the trigger; a screen reader reads the chip's
     counts, "Restore to before turn N" with its title as description, and
     each popover by its title. With the strip overflowing, the chip
     entering or leaving the header row (600 px tall) updates the chevron.

## Independent review

A review agent, not the implementer, ran the real header, changes bar,
changed-files popover, "More", shell, popover and hover-card hosts and
strip in headless Chromium with Obsidian 1.14.4's `enhance.js` and
`app.css`, and the real `tab/restore-branch`, `tab/edit-tracker` and the
pure modules in Node; `make verify` passed. Every departure in the Run log
agreed. No Codex cross-review: Codex was unavailable (spend cap).
Findings, fixed (Run log, "Independent review fixes"), `make verify`
after: D1, "Restore to before turn N" chose a post-delete turn with a
wrong N; D2, the strip's overflow not re-checked as the bar entered or
left the header row; G1, the open popover not following restore state;
nits N1 (fake CLI uuids reused after a rewind), N2 (release note), N3
(PRD-002.R7's wording), N5 (duplicate change types).

## Outcome

Built, reviewed and replayed onto `main`: the header's title block and
"More", the changes bar with its chip and Transcript button, the
changed-files popover with "Restore to before turn N", and edit tracking,
restore and branch in `tab/edit-tracker` and `tab/restore-branch`. For the
owner:

- PRD-002.R7 amended (lead-authorized): a changed-files row shows its
  `+x -y` and, for a created file, "new".
- DES-003's N rule changed from "the last prompt before the turn's first
  output, by `meta.turn`" to the turn's first prompt before its first
  output, else the last before it, found by the turn's record.
- Codex cross-review not obtained (spend cap).
- Manual rows 1 to 7 of the Run log, run and recorded in
  `docs/records/verification/` by someone other than the implementer,
  including M1 and M6 at 300, 440 and 1040 px wide and 600 px tall, and
  `rewind` in Ask before acting.
