---
status: closed
release: r05-pre-redesign-fixes
number: 012
prd: PRD-001.R7, PRD-001.R10, PRD-003.R6, PRD-003.R10
---

# TASK-012 — Conversation titles, list, delete and export

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A panel command (`/status`) titles the conversation, and an untitled one shows
blank in the "Previous conversations" list. The list's trash button deletes
without asking. A load failure on export says "Nothing to export yet." A pin or
export made during the first scan can drop from the list, because it saves
without moving `updatedAt` and the scanned entry wins a tie. Deleting a
conversation detaches its tab in one view only: `HistoryStore.onDeleted` is
never assigned.

Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R7, R10;
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R6, R10;
[DES-005](../../../current/design/DES-005-persistence-and-sync.md)
(Recording, Index, Delete, Export);
[DES-001](../../../current/design/DES-001-system-overview.md) (callbacks);
design rule 2.

Acceptance:

1. `promptTitle(text)` is the first line (LF, CRLF or a lone CR), cut to 80
   code points (never inside a surrogate pair), or "Untitled" when that line
   is empty or only blanks.
2. `hasTitle(title)` is true only for a string with a non-whitespace
   character. `displayTitle(title)` is the stored title, or "New
   conversation" for anything else: `null`, `undefined`, an empty or blank
   string, or a non-string a hand-edited file holds. Every display site uses
   it:
   tab label and tooltip, column rows (open and Recent) and the filter over
   them, the tab menu, the picker's rows and search text, the delete and
   reopen-in-Auto-approve dialogs, the branch note.
3. Only a prompt sent to Claude titles a conversation (`recordPrompt`, the
   first one while `hasTitle` is false, so a legacy blank title is retitled).
   A panel command or a `!` run, though recorded as messages, never does; a
   later prompt titles the conversation.
4. The picker's trash button opens `DeleteConversationModal`; the row goes
   only after the user confirms and the file is gone. The row menu and the
   picker both construct it with the store, which does the delete. The
   picker's input takes the focus back on every outcome (`ConfirmModal`'s
   `afterClose`; `onDone(false)` on a dismissal).
5. Export: a conversation that cannot be loaded shows "Could not load that
   conversation."; one with no messages, or a tab with no conversation, shows
   "Nothing to export yet." The command and the row menu run one body
   (`exportConversation`).
6. `mergeScan(scanned, cached, savedIds, deletedIds)` keeps a cached entry
   when the scan did not find it, when it is strictly newer, or when its id is
   in `savedIds`; it drops `deletedIds`; it changes no input. `ScanJournal`
   (`history-core`) holds the two id sets for `HistoryStore`: it records saves
   and deletes only while a scan runs, a later delete or save of the same id
   replaces the earlier record (the sets stay disjoint), and both are cleared
   when a scan begins and when it finishes.
7. `main.ts` assigns `history.onDeleted` to call `onConversationDeleted(id)`
   on every panel view, which detaches its tabs showing that conversation. A
   view with no such tab changes and saves nothing. Neither delete path calls
   it directly.

## Scope

Expected files:

- `src/conversation-list.ts` (`promptTitle`, `hasTitle`, `displayTitle`,
  `NEW_CONVERSATION_TITLE`), new `src/history-core.ts` (`mergeScan`,
  `ScanJournal`)
- `src/history.ts` (`scan`, `remember`, `delete`, `DeleteConversationModal`,
  `ConversationPickerModal`), `src/confirm-modal.ts` (`afterClose`)
- `src/view.ts` (`recordPrompt`, `record`, display sites,
  `confirmDeleteConversation`, `exportCurrent`, `exportConversation`,
  `onConversationDeleted`, `openHistory`), `src/main.ts`
- `tests/conversation-list.test.mjs`, new `tests/history-core.test.mjs`,
  `package.json` (`pretest`)
- `RELEASE_NOTES.md`, `docs/current/DEVELOPMENT.md` (test table),
  `docs/current/plan.md` (four backlog items and the delete code gap out, the
  `onSaveFailed` gap in), `docs/current/product/PRD-001-chat-panel-and-sessions.md`
  (R7: "empty or blank"); DES-001 (module rows), DES-005 where they disagree
  with the code

Negative scope:

- Titles already stored (`/status` from earlier versions): unchanged.
- `branchTitle` and the export's `{title}`: not display sites.
- `onSaveFailed` (DES-001, DES-005): not implemented; backlog.
- A non-string `title` in `export` (`sanitizeName`): the export fails with
  its Notice; not this task.
- Draw and layout changes to the picker or column.
- A real-CLI run.

## Plan

- Tests first: `conversation-list.test.mjs` for the two title functions and
  `history-core.test.mjs` for the merge; both run against the old rules (the
  old title expression, the old merge) before the change.
- The pure rules sit in `conversation-list` and `history-core`;
  `history` and `view` only call them (design rule 4). `view` and the picker
  cannot run in plain Node.
- One delete path: `DeleteConversationModal` takes the store and deletes on
  confirm; the store's `onDeleted` reaches every view. One export body.
- Verification: `make verify`; independent review. By hand in a vault, owed:
  - A new tab's first message `/status`, then `!ls`: the tab, tooltip, column
    row and tab menu say "New conversation" and the file's `title` is `""`;
    then a prompt: the title is its first line.
  - An old file with `"title": ""` shows as "New conversation" in the picker
    and is found by searching "new".
  - Picker trash: the dialog shows; Cancel and Escape leave the row and the
    file and put the focus back in the picker's input; Delete removes both,
    detaches a tab showing it and does the same; typing works afterwards.
  - Delete from the row menu with the panel open in two windows: both tabs
    detach.
  - Reload with a large history folder; while the column says "Loading…", pin
    one row and export another: after the scan the row is still pinned and
    the file has its `exportPath`.
  - Export a Recent row whose file was damaged or removed behind the plugin:
    "Could not load that conversation."; export from a fresh or pinned-empty
    tab: "Nothing to export yet."
- Rejected: titling in `record` by a flag on the message (a panel command and
  a prompt are both `user` messages, so the flag would be a second
  discriminator); keeping the picker's own delete beside the modal.

## Run log

- Tests first: against the old rules (`promptTitle` and `displayTitle` as the
  old inline expressions, `mergeScan` ignoring `savedIds`) seven tests failed:
  CRLF, blank first line, blank title shown, the always-something test, and
  the three saved-id merges.
- Hand mutants of the new logic (saved ids ignored, `<=` for newer, deleted
  kept, not-found ignored, input mutated, blank title, CRLF, 81 characters,
  blank display) each fail at least one test; "not found ignored" survived
  until the unlistable-folder test was added.
- Review round 1, tests first: `conversation-list.test.mjs` and
  `history-core.test.mjs` failed at import (`hasTitle`, `ScanJournal`
  absent). `ScanJournal` moved the saved/deleted bookkeeping out of
  `HistoryStore` so plain Node tests it. `afterClose`, the focus return, the
  early return in `onConversationDeleted` and the `hasTitle` retitle are in
  `confirm-modal`, `history` and `view`: checked by hand. Ten hand mutants of
  the new logic (no trim, no type check, no lone CR, a cut by UTF-16 units,
  and six `ScanJournal` rules) each fail a test, bar one equivalent: a delete
  not removing the id from the saved set, since the merge drops a deleted id
  whatever else is recorded.
- `make verify`: OK.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed. No
Defect. Findings:

1. `displayTitle` threw on a non-string title, breaking the column. Fixed:
   any non-string or blank title is untitled; tests.
2. Picker trash: Cancel or Escape left focus on the page. Fixed:
   `ConfirmModal` `afterClose`; the picker refocuses on every outcome.
3. The saved/deleted-during-scan bookkeeping was untested. Fixed:
   `ScanJournal` in `history-core`; tests.
4. The release note said `!ls` titled conversations. Fixed: `/status` and
   `/usage`.
5. PRD-001.R7 said "empty", the code "empty or blank". Fixed: PRD wording
   (decision-list item below).
6. Deleting a conversation open in no tab of a view still rewrote that
   view's tab state. Fixed: early return.
7. The retitle check differed from the blank rule. Fixed: one `hasTitle`.
8. Test and cut nits (zero-width case, surrogate pairs, lone CR). Fixed;
   tests.
9. The save-over-sync tie-break was undocumented. Fixed: DES-005.
10. Process: review and manual evidence owed. This section; manual checks
    below.
11. A stale comment. Fixed.

Round 2: the same reviewer on the branch merged onto main; `make verify`
passed. All 11 fixed. Two nits: the `history-core` header (fixed) and the
non-string title in the export and `branchTitle` (backlog line).

## Outcome

Decision-list item (delegated owner amendment, to confirm): PRD-001.R7 now
says "Untitled" when the first line is "empty or blank", matching the code
and DES-005; a whitespace-only first line is not left as a blank title.

Untitled conversations show as "New conversation" and panel commands no
longer title one; the picker's trash asks first and every panel view
detaches a deleted conversation's tabs; a pin or export during the first
scan survives it; exports share one body. Owed by hand in a vault: the
checks in the Plan, the focus return included.
