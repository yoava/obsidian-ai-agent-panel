---
status: closed
release: r05-pre-redesign-fixes
number: 044
prd: PRD-003.R4
---

# TASK-044 — Check the fields of stored messages on read

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`HistoryStore.readFile` checks a conversation file's command-line values, title
and export path, and passes every message through as parsed. A message that is
`null` throws at `msg.kind` (the exporter, `renderStored`, the tooltip count); a
`text` that is not a string throws in the export's `quote` and `.trim()` and in
`renderStored`'s `setText`/copy; a `contextPaths` that is not a list of strings
throws at `path.endsWith`; a `costUsd` or `images` of another type prints
nonsense. A backlog item in `plan.md` (removed by this task).

Governing: [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R4 (a history file is untrusted on read), R9 and R10 (reopen and export of a
stored conversation), [DES-005](../../../current/design/DES-005-persistence-and-sync.md)
(Conversation file, Identity and validation).

Acceptance:

1. An entry that is not an object, or whose `kind` is not a string, is dropped;
   the conversation and its other messages load, `readFile` logs the count
   with `console.warn`, and the next save removes the entries from the file.
2. On the six known kinds, a required text field (`text`, `command`, tool
   `name`) that is not a string reads as `""` and a tool `input` that is not an
   object as `{}`; an optional field of the wrong type reads as absent (text,
   flags, finite numbers, `images` a positive whole number); `contextPaths`
   that is not an array reads as absent and an array loses its non-strings.
3. A message of an unknown kind is kept as stored: no reader throws on it, and
   a record a newer version wrote survives this version's next save.
4. A well-formed file, unknown extra fields included, is deep-equal after the
   check; the check never throws, and running it twice changes nothing.
5. The check is Obsidian-free (`history-file`) and `readFile` calls it; DES-005,
   DES-001's file map, the test table, the release notes and the `plan.md`
   backlog state the present answer.

## Scope

Expected files:

- `src/history-file.ts` (`checkStoredMessages`), `tests/history-file.test.mjs`
- `src/json.ts` (`isJsonObject`, the shared object guard the check uses),
  `tests/json.test.mjs`, `package.json` (`pretest`)
- `src/history.ts` (`readFile` calls it)
- `docs/current/design/DES-005-persistence-and-sync.md`,
  `docs/current/design/DES-001-system-overview.md`,
  `docs/current/DEVELOPMENT.md`, `docs/current/plan.md`, `RELEASE_NOTES.md`

Negative scope:

- `src/export.ts` (another task is moving it) and `src/view.ts`: the readers
  stay as they are; the read boundary is the one place.
- Moving the three existing object guards (`protocol/client`, `commands`,
  `export`) to `src/json.ts`: the `plan.md` backlog item stays, reworded.
- The fields inside a tool `input` (the edit planner and the summaries already
  read them defensively, live or stored) and the text of any field.
- `createdAt`, `updatedAt`, `pinnedAt` and the conversation's other fields
  (task 029, `plan.md`).
- A new dependency or schema library; PRDs, protected paths, a real CLI run.

## Plan

- Tests first in `tests/history-file.test.mjs`, through the exported check:
  well-formed file unchanged; non-object entries and entries without a string
  `kind` dropped in order; unknown kinds kept; each kind's required and optional
  fields against every wrong JSON type (`1e999` for a non-finite number);
  `contextPaths`, `images`, tool `input`; in-place, idempotent, no throw on a
  `messages` that is not a list; the real `conversationCost` and `restorePoint`
  on a checked hostile file.
- One table of fields per kind (`MESSAGE_FIELDS`) and one `readField` per field
  type, so a field added to `StoredMessage` is one table line.
- `checkStoredMessages` mutates in place and runs last in `readFile`.
- Rejected: dropping an unknown kind (no reader throws on it, and a newer
  version's record would be lost at this version's next save); dropping a
  message with a bad required field (its other fields still show); validating in
  the readers (`export.ts` is moving; the boundary is one place); a fourth
  copy of the object guard (this task adds the shared `src/json.ts` and uses
  it; the three older copies move there in the backlog item).
- Verification: `make verify`. By hand in a vault: set a stored message to
  `null`, another's `text` to `5` and a `contextPaths` to `"a.md"`, reopen the
  plugin; the conversation opens, exports without "Export failed", and the
  entries count drops by the `null`.

## Run log

- Tests first: with `checkStoredMessages` absent, `tests/history-file.test.mjs`
  does not load (no such export), so its existing tests fail with it; all 23
  pass after the change.
- A fourth copy of the object guard became `src/json.ts` with
  `tests/json.test.mjs`, which did not load before the module existed.

## Independent review

A review agent, not the implementer; `make verify` passed; a 20,000-case
fuzz showed the check idempotent and stable through a JSON round trip. No
Defect. Every reader of a stored message gets the types it uses; no
prototype pollution. Applied: a JSON-parsed `__proto__`/`constructor`
test, the release note says dropped entries leave the file at the next
save, and `readFile` warns in the console with the count. Left as noted
in the Outcome: the table-to-type link is kept by review; the `readFile`
call is owed by hand.

## Outcome

A conversation file with a damaged message loads, opens and exports: an entry
that is not a message is skipped, a field of the wrong type reads as empty or
absent. Deviation from the brief, accepted by the coordinator: a message of an
unknown `kind` is kept as stored, not dropped, because no reader throws on it
and a newer version's record would otherwise be lost at the next save. Owed by
hand in a vault: a `null` entry, a numeric `text` and a string `contextPaths`;
the `readFile` call and its console warning (the count of left-out entries)
are owed by hand, as `history.ts` imports `obsidian`.

DES-005 owns the message rules; PRD-003.R4 does not name message fields, so
the tests keep the R4 name. The link between `StoredMessage` (`history.ts`)
and the `MESSAGE_FIELDS` table in `history-file.ts` is kept by review: a field
added to a message kind is a table line and a DES-005 line, and no gate checks
it.
