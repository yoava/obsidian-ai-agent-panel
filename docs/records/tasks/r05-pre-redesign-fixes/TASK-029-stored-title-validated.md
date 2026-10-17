---
status: closed
release: r05-pre-redesign-fixes
number: 029
prd: PRD-003.R4
---

# TASK-029 — Read a stored title that is not a string as none

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`HistoryStore.readFile` returns a parsed conversation file with only the
command-line values checked. A `title` that is a number, an object or missing
in a hand-edited or synced file reaches `sanitizeName` (`src/export.ts`, which
calls `.replace` on it: "Export failed") and `branchTitle` (`src/view.ts`,
`.replace` again). Display already tolerates it (`displayTitle`, `hasTitle`);
the read boundary should not pass it on. A backlog item in `plan.md` (removed
by this task).

Governing: [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R4 (history files are untrusted on read), [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7 (a conversation with no title), [DES-005](../../../current/design/DES-005-persistence-and-sync.md)
(Recording, Identity and validation).

The other text fields `readFile` passes unchecked were read for the same
failure (a string method called on a non-string). `exportPath` is the same
class: a truthy non-string reaches `isSafeExportPath(path.endsWith)` in
`export()` and throws; it is included here, one line in the same helper.
`message` fields are not (see Scope).

Acceptance:

1. A stored `title` that is not a string reads as `""` (shown "New conversation",
   replaced by the next prompt, `sanitizeName` and `branchTitle` get a string).
   A string, blank or not, is kept as stored.
2. A stored `exportPath` that is not a string reads as absent; a string is
   kept for `isSafeExportPath` to judge.
3. No other field changes; the helper is Obsidian-free and the tests run in
   plain Node.
4. A source with no title (blank, missing or not a string) branches as
   `Conversation (branch)`; `branchTitle` is a pure function in
   `conversation-list` and view.ts calls it.
5. DES-005, DES-001's file map, the test table, the release notes and the
   `plan.md` backlog state the present answer.

## Scope

Expected files:

- `src/history-file.ts` (`dropNonStringText`: read-side checks of a stored
  conversation file, apart from the scan merge in `history-core`),
  `tests/history-file.test.mjs`, `package.json` (`pretest`)
- `src/history.ts` (`readFile` calls it)
- `src/conversation-list.ts` (`branchTitle`, moved out of `src/view.ts`),
  `tests/conversation-list.test.mjs`, `src/view.ts` (imports it)
- `docs/current/design/DES-005-persistence-and-sync.md`,
  `docs/current/design/DES-001-system-overview.md`,
  `docs/current/DEVELOPMENT.md`, `docs/current/plan.md`, `RELEASE_NOTES.md`

Negative scope:

- `src/export.ts` (another task is moving it): `sanitizeName` stays as it
  is.
- Message fields (`text`, `command`, `stdout`, `contextPaths`, a message that
  is not an object): a non-string there throws in the renderer and the
  exporter. That is a wider read-side schema check, a `plan.md` backlog item.
- `createdAt`, `updatedAt`, `pinnedAt` (wrong-typed numbers sort and format
  oddly but do not throw).
- PRDs, protected paths, a real CLI run.

## Plan

- Tests first in `tests/history-file.test.mjs`: non-string titles read as `""`
  and as no title to `hasTitle`/`displayTitle`; strings are kept; non-string
  export paths are dropped, strings kept; the object is mutated in place with
  other fields untouched.
- `branchTitle` takes `unknown` and uses `hasTitle`, so a blank title no
  longer branches as ` (branch)`; tests in `tests/conversation-list.test.mjs`.
- `dropNonStringText` has the shape of `dropUnsafeArgValues` and runs after it
  in `readFile`.
- Rejected: validating in `sanitizeName` (a file another task is moving; the
  read boundary is the one place);
  dropping the title key (the type says `title: string`, and `""` is already
  the in-memory "none").
- Verification: `make verify`. By hand in a vault: set a file's `title` to
  `5` and its `exportPath` to `{}`, reopen the plugin; the conversation lists
  as "New conversation" and exports without "Export failed".

## Run log

- Tests first: with `dropNonStringText` absent, `tests/history-core.test.mjs`
  does not load (no such export); all pass after the change.
- After review: `dropNonStringText` moved from `history-core` to
  `history-file` (design rule 1), and `branchTitle` moved to
  `conversation-list` and takes `unknown`. Both specs failed first (module
  not found; no `branchTitle` export). The message-field gap went to the
  `plan.md` backlog.

## Independent review

A review agent, not the implementer; `make verify` passed; the real
`readFile` driven with fake adapters. No Defect. Findings: the call in
`readFile` is untested, as `history.ts` imports `obsidian` (owed by hand);
`branchTitle("")` gave " (branch)", newly reachable (fixed:
`branchTitle` in `conversation-list`, tested); the check lived in
`history-core` (fixed: `history-file`).

## Outcome

A conversation file whose `title` or `exportPath` is not a string loads as
untitled with no export path, so it lists as "New conversation", exports
and branches without an error. Other message fields stay unchecked
(backlog). Owed by hand in a vault: a hand-edited file with `title: 5` and
`exportPath: {}`.
