# DES-005 — Persistence and sync

**Status:** accepted (2026-10-16)

## Requirements

Designs [PRD-003](../../current/product/PRD-003-conversation-history-and-export.md), R1 to R13, and the settings-storage requirement of [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md), R24.

| ID | Capability | Section below |
| --- | --- | --- |
| PRD-003.R1 | Conversation file | Conversation file, Recording |
| PRD-003.R2 | Saving | Save path |
| PRD-003.R3 | What history leaves out | Conversation file |
| PRD-003.R4 | Identity and integrity | Identity and validation |
| PRD-003.R5 | Title | Recording |
| PRD-003.R6 | Conversation index | Index |
| PRD-003.R7 | Pin storage | Pins |
| PRD-003.R8 | Deletion | Delete |
| PRD-003.R9 | Reopen and resume | Reopen and resume |
| PRD-003.R10 | Manual export | Export |
| PRD-003.R11 | Automatic export | Export |
| PRD-003.R12 | Note location | Export |
| PRD-003.R13 | Note format | Export |
| PRD-001.R24 | Settings storage and sync | Settings storage, Device-local keys, What travels |
| PRD-001.R39 | Reset and Undo store each value by its sync choice | Reset and Undo |

Manual verification obligations, in a desktop vault:

- PRD-003.R1 to R9: record a conversation, close and reopen it, resume it on its profile and on a device without that profile, pin it (a fresh tab included), delete it from the row menu and from the picker; inspect the JSON file after each step; a failed save (read-only history folder) shows one Notice.
- PRD-003.R10 to R13: manual and automatic export, a name collision, a changed export folder, the note's frontmatter and callouts, a reply with a `dataview` fence, inline code and a remote image viewed with Dataview enabled; a first export of a reply, tool output and fence holding `<%* … %>` and `<%+ … %>` with Templater's *Trigger Templater on new file creation* on, then the note in reading view; a tool result and a `!` run printing `= this.file.name` and `$= dv.span(…)`, and a multi-line command, each output shown as text in its callout.
- PRD-001.R24: flip a sync badge and inspect `data.json` and the device-local key; load settings written by an earlier version, `localGroups` in `data.json` included.
- PRD-001.R39: reset a row, a section and everything, each with and without Undo; inspect `data.json` and the device-local key after each.

## Context and constraints

- Fixed by ADRs: plugin-owned history as JSON files ([ADR-005](../../current/adr/ADR-005-plugin-owned-conversation-history.md)), synced and device-local settings per sync unit ([ADR-009](../../current/adr/ADR-009-synced-and-device-local-settings.md)), the Obsidian 1.8.7 floor that `App.saveLocalStorage` needs ([ADR-013](../../current/adr/ADR-013-desktop-only-obsidian-1-8-7-floor.md)), no file contents kept for restoring ([ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md)).
- A conversation is not a CLI session: one conversation outlives several CLI processes and can hold several session ids (meta records); the file stores the latest one for `--resume`.
- Obsidian Sync carries `main.js`, `manifest.json`, `styles.css` and `data.json` from a plugin folder and nothing else (Obsidian's behaviour, not verifiable in this repository).
- Component map, runtime wiring and plugin lifecycle: [DES-001](../../current/design/DES-001-system-overview.md). `--resume`, session ids and respawn: [DES-002](../../current/design/DES-002-cli-client-and-session-lifecycle.md). The conversation column, tabs and the settings tab UI: [DES-003](../../current/design/DES-003-panel-ui.md). Turn records, restore and the mode reopen rule: [DES-004](../../current/design/DES-004-permission-and-change-control.md). Cost figures: [DES-007](../../current/design/DES-007-usage-and-cost.md).

## Proposed design

### Stores

| Store | Location | Written through | Format |
| --- | --- | --- | --- |
| Synced settings | `<plugin dir>/data.json` | `Plugin.saveData` | JSON object |
| Device-local settings | local-storage key `ai-agent-panel:local-settings` | `App.saveLocalStorage` | object |
| Layout state | local-storage keys `ai-agent-panel:open-tabs`, `:side-width`, `:side-sections` | `App.saveLocalStorage` | see Device-local keys |
| Conversations | `<plugin dir>/history/<id>.json` | `vault.adapter.write` (`HistoryStore`) | `StoredConversation`, `version: 1`, or `2` while a `fresh-start` or `clear` record exists |
| Exported notes | `<export folder>/<pattern>.md` in the vault | Vault API (`TranscriptExporter`) | Markdown, derived from the conversation |
| Claude Code's session files | `~/.claude/projects`, owned by the CLI | never by the plugin | not read; used only through `--resume` |

### Conversation file

`StoredConversation` (`src/history.ts`), written as compact JSON:

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | `1`, or `2` while a `fresh-start` or `clear` record exists (a save writes the lower one that fits, `fileVersion`) | The reader accepts 1 and 2; 0.5.x refuses 2 |
| `id` | string | The file name without `.json`; overwritten from the file name on every read |
| `sessionId` | string or null | The latest CLI session id, for `--resume` |
| `profileId` | string, optional | The CLI profile of the conversation's session |
| `title` | string | See Recording; empty until the first prompt to Claude |
| `createdAt`, `updatedAt` | number | Milliseconds since the epoch; one that is not a whole number a `Date` holds reads as the other, else both as 0 (`checkStoredTimes`) |
| `model` | string, optional | The model pick; `""` is Default |
| `effort` | string, optional | The effort pick; `""` is Default |
| `resolvedModel` | string, optional | The model id the CLI last reported in `system/init`; `""` until it reports one; absent only in files from 0.5.x |
| `permissionMode` | `default`, `acceptEdits`, `plan`, `bypassPermissions` or `auto`, optional | DES-004 |
| `permissionModePicked` | boolean, optional | Absent means a stored `default` inherits Claude Code's own default |
| `forkBase` | `{ costUsd, sessionId?, estimate? }`, optional | On a branch: the source session's `total_cost_usd` when the fork started, which the fork's totals include; `estimate` when the panel may not have recorded all of the source (DES-007 Fork base). Version 1 holds it; 0.5.x ignores it, so a branch's cost there includes the source's |
| `exportPath` | string, optional | Vault path of the exported note |
| `pinned`, `pinnedAt` | boolean, number, optional | Absent means not pinned |
| `messages` | array | `StoredMessage` entries, in recorded order |

| `kind` | Fields |
| --- | --- |
| `user` | `text`; `contextName`; `contextPaths` (folders end with `/`); `images` (a count); `sentAt` (milliseconds since the epoch, on a prompt sent to Claude; absent in older files, which reopen without send times) |
| `bash` | `command`; `stdout`, `stderr` (first 1500 characters each); `code`; `timedOut`; `durationMs` |
| `assistant` | `text` (Markdown); panel command cards are stored as this kind |
| `thinking` | `text` |
| `compaction` | `at` (when it was reported); `trigger` (`"auto"` or `"manual"`); `preTokens`, `postTokens` (where the CLI reported them); `summary` (the CLI's summary, where it supplied one). An optional kind of version 1 (ADR-018): an older version skips it |
| `fresh-start` | `at` (when the session started); `sessionId` (the id not resumed, kept as stored even when it fails the grammar, absent when there was none). A boundary that draws nothing, in the conversation's messages and in the export (ADR-018); an older reader refuses the file (version 2) |
| `clear` | `at` (when it completed); `sessionId` (the session it ended, kept as stored even when it fails the grammar, absent when there was none). Drawn on reopen as the "Context cleared" divider and exported as an italic line (DES-003 Clear divider); a boundary like `fresh-start`, so an older reader refuses the file (version 2). An Undo removes the record and sets the conversation's `sessionId` to the id it carried, in one step (DES-002 Undo of a clear); the next save writes version 1 again if no boundary record is left |
| `tool` | `name`; `input` (in full); `result` (first 1500 characters); `isError`; `added`, `removed` |
| `meta` | `durationMs`; `costUsd` (the session's `total_cost_usd` at that turn, also on an error turn); `error` (500 characters); `turn` (the tab's turn counter, DES-003 Turn; "Restore to before turn N" takes N from the record's place instead, DES-003 Header and changes bar); `rewindUuid`, `lastPromptUuid`, `sessionId`, `profileId`, `edited` (the turn record, DES-004; a turn ending without a `result` keeps `turn`, `lastPromptUuid` and `sessionId`); `branchSession`, `branchTarget`, `branchLatest` (a branch still to make, recorded ahead of the conversation's first record and on a failure that kept the fork, DES-004 Branch; each a lowercase UUID, `isSessionId`, when read) |

Not stored: image bytes, tool-result images, subagent threads, background tasks, permission decisions, cards of commands run while a turn is running, the per-conversation token totals and the change list.

Migration rules:

- The reader accepts `version` 1 and 2 with an array `messages`.
- A new optional field needs no version bump when its absence means the old behaviour (ADR-005). Every optional field above follows that rule: an absent `profileId` reopens on the default profile, absent picks are Default, a `meta` without the turn record offers no restore, a legacy `restorable` flag is ignored.
- A file without `resolvedModel` was written by 0.5.x, whose `model` held the id the CLI reported: `migrateStoredModel` reads it as `resolvedModel` = `model` and a Default pick.
- A message of an unknown `kind` is skipped by the renderer and by the exporter, and stays in the file.

### Recording

- Recording is `tab/recorder`'s, one per tab. `ensureConversation()` creates the object in memory at the first recorded message, on a pin, or at once for a branch: a new id, `sessionId: null`, an empty title, the tab's model and effort picks, `resolvedModel: ""`, its profile and its mode.
- `record(message)` appends, marks the conversation dirty, then calls `queueSave`. The first message sets `createdAt` and `updatedAt` to now, so a conversation a pin or a branch created earlier starts with it (PRD-003.R12 `{date}`). The first `user` message sent to Claude (not a panel command or a `!` run) sets the title: its first line (ended by LF, CRLF or CR) of up to 80 code points (never cut inside a surrogate pair): a longer line is cut at the last whitespace within 12 code points of the limit, else at the limit, and ended by "…"; or "Untitled" when that line is empty or blank (`promptTitle`, `conversation-list`). A stored title that is not a non-blank string counts as none, so the next prompt titles the conversation. A rename (Rename) sets the title later; the first prompt only titles a conversation with none, so a rename keeps. A conversation with no title is shown as "New conversation" everywhere (`displayTitle`). A branch is titled `<title> (branch)` without stacking the suffix, or `Conversation (branch)` when the source has no title (`branchTitle`, `conversation-list`).
- `newConversationId()` is `<time in base 36>-<6 random base-36 characters>`.

| Recorded | When |
| --- | --- |
| `user` | On send, with the context label, context paths and image count, and a prompt to Claude with its send time |
| `bash` | When the `!` command has finished |
| `assistant`, `thinking` | When the CLI's final block arrives; thinking only when non-empty |
| `compaction` | At `compact_boundary`, with the trigger and the counts as reported; the CLI's summary is added to the same record while that turn runs, and only then (DES-003 Compaction dividers). A compaction with no boundary, a failed one and one that did not finish write none |
| `fresh-start` | When a session starts without `--resume` in a conversation that has a turn after its last boundary: the stored session is not one this device recorded, its id fails the grammar, a respawn was refused, or the resume was lost. Once per boundary; the next save writes `version: 2` (DES-002 Resume) |
| `tool` | At `tool_use`; the result and error flag are added at `tool_result`, the `+x -y` counts after the diff |
| `meta` | At the turn's `result`, with the turn record; holding `turn` (with `lastPromptUuid` and `sessionId` when the CLI echoed a prompt in it), when a turn ends without a `result` (the CLI exits, a send fails, the tab or the view closes mid-turn), and holding only `turn` before the next prompt when a reopened file left its last turn open; holding only `error`, when the session ends with an error; `error` with the `branch*` fields, when a branch's rewind fails and the fork is kept (DES-004 Branch) |
| Panel command | Unless a turn runs as it starts: as it runs, a `user` message and an `assistant` message holding `pendingMarkdown` ("<title> - No answer recorded"); when its card answers or fails, and again after a Refresh, Try again or `/mcp` row action, that `assistant` message's text becomes the card's (`reportMarkdown`, or `failureMarkdown`), saved also when the tab closed meanwhile |

`system/init` writes `sessionId`, with the session's profile as `profileId`, and `resolvedModel` into the conversation and queues a save; it never changes the model and effort picks. Recording the profile only then keeps a CLI that only a panel command started, on a fallback profile, from marking that profile as the session's. A model or effort pick, and a profile pick that applies to a conversation without a stored session id (DES-002), update the object in memory and reach the disk with the next save.

### Save path

- `queueSave(conversation)`: one timer per conversation id, 1 s; a newer call restarts it, so the write lands 1 s after the last queued change.
- `save` runs at most one write per conversation id at a time: a save waits for the previous write of the same file, then serializes the conversation as it is then, so an older write never lands after a newer one (a clear saves at once, DES-002). A delete voids the saves queued before it and waits for the write in flight, so a queued save cannot recreate a deleted conversation. The file `version` is computed from the snapshot being serialized, after the write's awaits.
- `save(conversation, {touch})`:
  1. Return when there are no messages. A conversation with no message is never written.
  2. Set `updatedAt` to now when `touch` is true.
  3. Run `onBeforeSave` (automatic export). A failure is logged and the save continues.
  4. Create `history/` if missing and write the file; clear the dirty mark.
  5. Update the index and fire `onChanged` when the title, time, message count or pin state moved. A failure here (a view's redraw) is logged; the file is written, so it is not a failed save.
- `touch` is true for every save except: a pin toggle, a rename and an export (`touch: false`), and a tab or view close, which flushes with `touch` equal to the dirty mark, so a close that writes no newly recorded message does not move the conversation in time.
- `flush(conversation, {touch})` cancels the timer and saves now. Callers: tab close, view close and manual export.
- A failed write is logged with `console.error`; the conversation stays in memory and the next save tries again. The first failure for a conversation id calls `onSaveFailed(id, title)` (`OncePerId`, `history-notice`) and later failures of that id do not, until the plugin reloads. `main` answers with one Notice naming the conversation (`saveFailedText`, `history-notice`: its `displayTitle`), so several open views still show one. A failure of `onBeforeSave` is not a failed write and raises none, and a handler that throws is logged, not raised from `save`.

### Identity and validation

- Ids must match `^[A-Za-z0-9_-]+$`. For any other id `load` returns null, and `save` and `delete` reject before touching the disk.
- `readFile` returns null for a file that cannot be read or parsed (logged), that is not `version` 1 or 2, that has no `messages` array, or whose name is not a safe id. On success it sets `id` to the file name, so a stored id can never point a later save or delete at another file.
- Values that reach a command line are checked with `isSafeArgValue` (`settings-core`): a string of 1 to 200 characters with no whitespace, no control character and none of `CMD_UNSAFE`'s characters (DES-002) that does not start with `-`. `readFile` passes each file through `migrateStoredModel`, then `dropUnsafeArgValues`: a stored `model`, `effort` or `profileId` that fails it is read as absent (Default, the default profile), and a `resolvedModel` as `""` (none reported), which keeps the format marker; `""` stays a Default pick. A `sessionId` that is no string reads as `null`; a string one is kept as stored, and only one the session-id grammar accepts (`state/session-id`, ADR-018) is ever resumed.
- Times: `readFile` runs `checkStoredTimes` (`history-file`). A `createdAt` or `updatedAt` that is not a whole number of milliseconds a `Date` holds (0 to 8.64e15) takes the other's value, and with neither usable both read as 0, so the conversation sorts last and its export dates as 1970 rather than "Invalid date"; a `pinnedAt` that is not one reads as absent.
- Text that the exporter and the panel call string methods on: `readFile` then runs `dropNonStringText` (`history-file`). A stored `title` that is not a string becomes `""`, none (shown as "New conversation", titled by the next prompt), so the export's file name and a branch's title never see another type; an `exportPath` that is not a string is read as absent. A string is kept for its own check.
- Messages: `readFile` last runs `checkStoredMessages` (`history-file`), so the exporter, the panel, `conversationCost` and restore only see the types the table above gives. A bad message never drops the conversation.
  - An entry that is not an object, or whose `kind` is not a string, is dropped: `readFile` logs the count with `console.warn` (no Notice), and the file loses the entries at the conversation's next save. A `kind` this version does not know is kept as stored: the readers skip it, and a newer version's record survives a save.
  - On a known kind, a required text field (`text`, `command`, a tool's `name`) that is not a string reads as `""`, and a tool's `input` that is not an object as `{}`.
  - An optional field of the wrong type reads as absent: text, a flag that is not a boolean, a number that is not finite (`code`, `durationMs`, `added`, `removed`, `costUsd`, `turn`), `images` that is not a positive whole number, `sentAt` that is not a whole number of milliseconds a `Date` holds (0 to 8.64e15), a message id (`rewindUuid`, `lastPromptUuid`, `branchTarget`, `branchLatest`) that is not a lowercase UUID (`isSessionId`, ADR-018 Decision 1: the id goes back to the CLI in a rewind request, so Restore files and Branch are offered only for one it takes). `contextPaths` that is not an array reads as absent, and an array loses its non-string entries. A turn record's `sessionId` and `branchSession` are kept as stored: `sessionId` is only compared with the tab's, and `branchSession` names the fork source of a branch whose rewind failed only after `pendingBranch` (`state/branch-history`) has found it, its target and its latest prompt to be lowercase UUIDs; a record failing that makes no branch (`branch-failure`).
  - Other fields of a known kind are kept as stored.
- A stored `forkBase`: `readFile` runs `readForkBase` (`history-file`, `checkForkBase`). A `costUsd` that is not a finite number of at least 0 reads the whole base as absent (the branch's cost then shows the "Includes the cost of the conversation it branched from" note); an `estimate` that is present and not a boolean reads as `true`; a `sessionId` that fails `isSessionId` is dropped (the base then takes nothing off); other fields are not kept. The `sessionId` is only compared with records' ids and is never passed to the CLI.
- The stored `permissionMode` passes `reopenMode` (DES-004).
- `exportPath` is re-validated before every reuse (Export).

### Index

`HistoryStore` keeps `Map<id, ConversationMeta>` with `id`, `title`, `updatedAt`, `messageCount`, `pinned`, `pinnedAt`. The conversation column draws from it without touching the disk.

- `refresh()` is the only folder scan. It reads and parses every `.json` file in `history/`. It runs when a panel view opens (not awaited) and on the first `list()`; concurrent calls share one scan.
- Merge at the end of a scan (`mergeScan`, `history-core`): a cached entry replaces the scanned one when the scan did not find it, when its `updatedAt` is strictly newer, or when its id was saved during the scan (pins and exports included); ids deleted during the scan are dropped. A later save of a deleted id, or delete of a saved one, replaces the earlier event (`ScanJournal`, `history-core`: records only while a scan runs, cleared when one begins and ends). A save wins over a newer file the scan read for the same id, such as one a vault sync landed meanwhile; that file is listed after the panel next opens.
- A folder that cannot be listed still completes the scan with what the cache holds.
- `save` and `delete` update the map and fire `onChanged`, which `main.ts` fans out to every open view. `load` fills the map without firing, and first waits for the conversation's write in flight, so a pin or rename of a just-closed conversation never starts from an older file.
- `snapshot()` is the synchronous read, newest first. `list()` scans once, then returns the snapshot.
- Nothing watches the folder. A file that arrives from outside the plugin is listed after a panel view next opens; one removed outside the plugin stays listed until then.

### Rename

- `main.renameConversation(id, title)` sets `title` on the object of every open view's tab for that id; with none open it loads the file, looks for an owning tab again, and otherwise uses the loaded copy. It saves one object with `touch: false`, so the conversation keeps its place in Recent, and a view that did not own it redraws from `onChanged`; each view holding it redraws its tabs.
- `title` is the input's first line, trimmed and cut at 80 code points (`renamedTitle`, `conversation-list`); a blank one, or one equal to the title shown, changes nothing.
- A fresh tab's conversation is created as for a pin; a conversation with no message is not written, and its title is saved with the first message.
- `exportPath` is untouched: the next export reuses it (Export) and writes the new title in the frontmatter. A branch is titled from the new title.
- A conversation that cannot be loaded gives the Notice "Could not load that conversation." and nothing changes.

### Pins

- On an open tab the hover pin and the row menu pin `ensureConversation(tab)`, which creates the conversation on a fresh tab. `togglePin(id, pinned)` uses the open tab's own object when one exists; otherwise it loads the file, then looks for an owning tab again before writing.
- It sets `pinned` (true, or removed) and `pinnedAt` (now, or removed) and calls `save` with `touch: false`.
- A conversation with no message is not written; the flag stays on the in-memory object and is saved with the first message.
- A conversation that cannot be loaded gives the Notice "Could not load that conversation." and nothing changes.

### Delete

Both entry points, the row menu's Delete and the picker's trash button, ask first in `DeleteConversationModal`. On confirm:

1. `HistoryStore.delete(id)` cancels a pending save and removes the file through the adapter (removed, not trashed).
2. If removal throws and the file still exists: Notice "Could not delete that conversation." and return false; the cache and the tabs are left as they were.
3. Otherwise: drop the cache entry, remember the id for a scan in flight, fire `onDeleted(id)` and `onChanged`, return true.
4. `onDeleted` reaches every panel view, which detaches each of its tabs showing that conversation: the messages stay on screen, the tab loses its conversation and resume id, and its next message starts a new record.

Exported notes, Claude Code's session files and its file checkpoints are left in place.

### Reopen and resume

- Entry points: a Recent row, the picker, and tab restore at view open (ids from `ai-agent-panel:open-tabs`; ids whose file is gone drop out).
- `restoreConversation(stored)`: switch to its tab if already open; else use the active tab when it has no conversation and no session, or a new tab. It restores `resumeSessionId` from `sessionId`, through `reopenPicks` the model and effort picks (Default included) and the profile (`profileId` when that profile exists on this device, else the default profile), and the mode through `reopenMode` (DES-004); rebuilds the messages model from every stored message (DES-003 Reopen); and sets the turn counter to the highest stored `meta.turn`, or to the number of turns rebuilt when that is higher.
- The first message spawns the CLI with `--resume <sessionId>` on the restored profile (DES-002).
- Resume failure: when the session ends with an error, the tab had a resume id and the session never reported a session id (a restore preview's reply that can rewind counts, DES-002), the resume id is cleared on the tab, the session and the conversation, and the error gains "Could not resume the original session - your next message starts a fresh one (the restored messages above are kept)." The error is recorded as a `meta` message. A restore's promptless start is exempt (DES-004).

### Export

`TranscriptExporter.export(conversation)` writes the whole note every time and returns its path.

| Trigger | Condition | On failure |
| --- | --- | --- |
| Automatic: `onBeforeSave` -> `maybeAutoExport` | `exportEnabled` (off by default) | `console.error`; the history save continues |
| Command "Export conversation to Markdown"; row menu "Export to Markdown" | the conversation loads, else Notice "Could not load that conversation."; at least one message, else Notice "Nothing to export yet." | Notice `Export failed: <message>` |

A manual export then flushes with `touch: false` and shows `Exported to <path>`. `onExported` makes the header's "transcript" link appear; clicking it opens the note, or shows `Exported note not found: <path>`.

Path:

1. Folder: `exportFolder` through `normalizePath`, with empty, `.` and `..` segments dropped; "Agent Chats" when nothing is left.
2. Reuse the stored `exportPath` only if it ends in `.md`, starts with `<folder>/`, holds no backslash or colon and has no empty, `.` or `..` segment.
3. Otherwise assign one: the pattern (default `{date} {title}`) with `{date}` = the conversation's `createdAt` in `exportDateFormat` (default `YYYY-MM-DD`), `{title}` = the title with `\ / : * ? " < > | # ^ [ ]` replaced by spaces, whitespace collapsed, cut to 60 characters ("Conversation" when empty), `{id}` = the id. `/` in the result makes subfolders; each segment is sanitized again and empty, `.` and `..` segments are dropped; `{title}` alone when nothing remains.
4. If `<folder>/<name>.md` exists, try `<name> 2.md`, `<name> 3.md`, and so on.
5. Create missing folders, then `vault.process` on an existing note or `vault.create`.

A path that fails step 2 gets a new assignment; the old note stays where it was.

Note format (`conversationToMarkdown` in `transcript-markdown`, which imports no `obsidian`):

| Part | Rendering |
| --- | --- |
| Frontmatter | `title` (JSON-quoted, "Conversation" when unset), `created`, `updated` (local `YYYY-MM-DD HH:mm`); then, each only when set, `model` (`resolvedModel`, else a non-empty pick), `effort` and `session`, JSON-quoted, and `cost_usd` (the conversation's cost, DES-007, four decimals, written only when above zero) |
| `user` | `> [!question]+ You` callout, titled `You - <context label>` when it has a label but no paths; a Context line of links (files as wiki links, folders as `obsidian://search` links; a stored path with a control character or one of `\ [ ] | # ^ \` < >`, which no vault path holds and which would end the link or the callout line, is left out, and the compact label stands in when none is left); an "Attached: N image(s)" line; the text through `inert-markdown`'s export form |
| `bash`, `tool` | Collapsed `> [!example]-` callout titled with the command, or the tool name and `summarizeToolInput` ("Failed:" first on an error, a non-zero exit or a timeout); the output (each of stdout and stderr unless empty) in a fence from `inert-markdown`'s `fenceForExport` ([rendering boundary](../../current/design/DES-001-system-overview.md#rendering-boundary)) |
| `thinking` | `> [!quote]- Thinking`, its text through `inert-markdown`'s export form |
| `assistant` | Plain Markdown through `inert-markdown`'s export form ([rendering boundary](../../current/design/DES-001-system-overview.md#rendering-boundary)) |
| `compaction` | An italic line, "Compacted at 14:20, 131k to 18k tokens" (a time or a count the record lacks is left out); the summary is not exported |
| `clear` | An italic line, "Context cleared at 14:02" (the time left out when the record has none); the session id is not exported |
| `meta` | `> [!failure] Turn failed` with the error through `inert-markdown`'s export form (the CLI's error text can carry what the model or a server wrote), else an italic line with the duration and the turn's own cost (DES-007 `turnCosts`) |
| Between turns | A horizontal rule before every `user` message that follows another rendered message |

Callout titles are one line, each line break with the whitespace around it written as a space, and escape ``\ ` * _ ~ = < > [ ] % $`` with a backslash: a second line would end the callout and could open a comment or math block that swallows the fence below, a `%%` would hide the rest of a command, and `$…$` would render as math.

The finished note, frontmatter to the last tool output, passes through `inert-markdown`'s `breakTemplateCommands`: a word joiner (U+2060) follows every `<` that a `%` follows, each written as itself, a backslash escape or an entity, so Templater's opening tag `<%` is in neither the file nor any text node of the rendered note, fences included. Templater parses the whole file of a note created while *Trigger Templater on new file creation* is on (an export's first write creates the note) or used as a template, and runs `<%+` commands from the text nodes of a note in reading view.

Then `breakInlineFields` puts a word joiner between every two colons that would meet: read as Markdown decodes them and as an image's alt or a link's title ends up (Obsidian unescapes and decodes them, so `\&colon;` becomes `:`), one decoding further for safety (`&amp;colon;`, which decodes once to `&colon;`), and across a `%%` comment once a colon has stood right before one, since a comment vanishes from the rendered note. Dataview's index reads `key:: value` lines and bracketed fields in every section but lists and rules, code blocks included, as the note's fields, and its rendering of the note reads `[key:: value]` and `(key:: value)` from the HTML of paragraphs, headings, list items, spans and table cells and renders the value again as Markdown. Raw HTML in user text that the renderer drops (a comment, a `script`) could still bring two colons together (inferred); user text is written as typed.

The note reads the same; text copied from it, code included, keeps the joiners, and a link whose target holds `::` (an IPv6 address) breaks.

### Settings storage

The model is `AgentPanelSettings` in `src/settings-core.ts`. A sync unit is one settings row with its own badge, except `cli` (the whole CLI group, badge on its heading) and `export` (one badge for its four rows). A unit is either in `data.json` or in the device-local key.

| Unit | Keys | Default store |
| --- | --- | --- |
| `cli` | `cliProfiles`, `defaultProfileId` | device |
| `permissionMode` | `defaultPermissionMode` | device |
| `bypass` | `enableBypassMode` | device |
| `instructions` | `vaultInstructions` | device |
| `bash` | `enableBashMode` | device |
| `obsidianMcp` | `enableObsidianMcp` | device |
| `model` | `model`, `lastModel` | synced |
| `effort` | `effort`, `lastEffort` | synced |
| `context` | `includeContextByDefault` | synced |
| `tabPosition` | `tabPosition` | synced |
| `theme` | `theme` | synced |
| `showTooltips` | `showTooltips` | synced |
| `promptStyle` | `promptStyle` | synced |
| `promptColor` | `promptColor`, `promptCustomColor` | synced |
| `pinPrompt` | `pinPrompt` | synced |
| `promptRail` | `promptRail` | synced |
| `showUsage` | `showUsage` | synced |
| `usageRefresh` | `usageRefreshSeconds` | synced |
| `usageWarn` | `usageWarnPercent` | synced |
| `usageCrit` | `usageCritPercent` | synced |
| `export` | `exportEnabled`, `exportFolder`, `exportFilePattern`, `exportDateFormat` | synced |
| none, always device | `localGroups` (the unit keys that are device-local), `resolvedModels`, `cliModels`, `cliStartupModes` | device, no badge |

Load (`loadSettings` in `main.ts`, through `settingsFromStores` in `settings-core`):

1. `loadData()`, then `migrateRawSettings`.
2. `localGroups`: the device-local object's list when it has one; else, once, a legacy `localGroups` from `data.json` united with the default-local units; else the default-local units. `sanitizeLocalGroups` expands legacy group keys and drops unknown keys; an explicit empty list is kept. A synced file can therefore add local units on a device that has no list, never remove a default-local one.
3. Defaults overlaid with the stored keys, `data.json`'s `localGroups` and the always-device caches (`resolvedModels`, `cliModels`, `cliStartupModes`) excepted, so a synced file never chooses what the model picker offers; the keys of `cli` (profiles and default profile) and of the five security units (`permissionMode`, `bypass`, `instructions`, `bash`, `obsidianMcp`) are put back to their defaults while the unit is local (`neverSeeded` in `SYNC_UNITS`), so `data.json` never seeds them; a device with no profiles of its own starts with one auto-detect profile. One exception, an upgrade from 0.5.0 or earlier: a device object with no `localGroups` key at all and at least one key those builds wrote (`cliProfiles`, `defaultProfileId`, `resolvedModels`, `cliModels`, `cliPath`, `useWsl`; `isUpgradeShape`) takes four units once from `data.json`, which held them then (local storage never syncs, so a synced file cannot forge the shape). `defaultPermissionMode` is kept only when `plan` or `default` (Claude Code's configured mode), else the default; `enableBashMode` and `enableObsidianMcp` stay on only when stored as exactly `true`, else off (an absent key means another device's save already moved it out of the file), and `vaultInstructions` is kept as stored, empty when absent; `enableBypassMode` and the CLI profiles are never taken (a profile is an executable, so a synced file never chooses one). `loadSettings` saves at once after such a load, so the next load sees `localGroups`; a save writes the device object before `data.json` and, for units moving to synced, again after it (`writeStores`, Save), so a failed first write leaves `data.json` whole. A failed save after an upgrading load is logged and does not stop startup: a failed local write leaves the old shape, so the next load repeats the same upgrade; a failed `data.json` write leaves `localGroups` set, so the next load keeps the saved values. A fresh device (no or an empty object) and a device whose object has `localGroups`, even malformed, start at the defaults.
4. `mergeLocalSettings` overlays the device-local object, read from `ai-agent-panel:local-settings` or, when that key is unset, the legacy `claude-code:local-settings`. Only keys of units that are local now are applied.
5. `normalizeSettings`: profiles are rebuilt field by field, at least one exists, and the default id names one of them; every key that has a default takes it when its value is of another type (a non-finite number included), when `defaultPermissionMode` is outside its four options (DES-004), `tabPosition` outside `top`, `side`, `auto`, `theme` outside `match`, `light`, `dark`, `promptStyle` outside `card`, `bubble`, `promptColor` outside `clear`, `sand`, `stone`, `sage`, `sea`, `mist`, `lavender`, `rose`, `accent`, `custom`, `promptCustomColor` longer than 64 characters, or a usage threshold outside 0 to 100; the learned caches keep only well-shaped entries, prototype keys dropped: a `resolvedModels` value that passes `isSafeArgValue`, a `cliStartupModes` value that is a string, and a `cliModels` list as `safeCliModels` reads it (`parseCliModels`, then each entry's value, the Default pick `""` aside, and resolved id pass `isSafeArgValue`, since a pick reaches `--model`, and each entry keeps only the effort levels that pass it, since a level reaches `--effort`; the view refuses an effort pick that fails it too); a cache that is no object, or a profile's list with nothing left, is absent; the same `safeCliModels` screens the initialize reply's list before `rememberCliModels` stores it; `model`, `lastModel`, `effort` and `lastEffort` that are set and fail `isSafeArgValue` become `""`.
6. Learned `resolvedModels` entries that fail `isCredibleResolution` are dropped. A resolution is read by its own key (`resolvedId`, `models`), so a pick named like an object member (`constructor`) resolves to nothing, never to an inherited function.

Save (`saveSettings`): `splitSettings` routes every key to `synced` or `local` by the current units, puts `localGroups` in `local`, then `writeStores` writes the device object (`saveLocalStorage(key, local)`) before `data.json` (`saveData(synced)`), so a failed first write leaves `data.json` whole (the 0.5.0 upgrade rule). `writeStores` reads the units the stored device object lists as local (`readLocal`: the key load reads, legacy key as fallback); a device object without a list of its own means the routing the load derived from both stores (`loadedLocalGroups`). If this save moves some of them to synced, it writes three times: the device object with the new values, the moving units still listed as local and holding their current values; `data.json`; the device object as split. A failed `data.json` write or a failed last write then leaves every moved value in a store. A unit moving to this device needs no extra write: the first write already holds it before `data.json` drops it. One save runs at a time (`serializeSaves`); calls made meanwhile share one more save, which splits the settings as they are when it runs, so an older device-local list is never written last.

`promptStyle` stores `card` or `bubble`; any other stored value, a development build's `popout` or `quiet` included, loads as `card` with the stored `promptColor` kept. `promptCustomColor` is stored trimmed, once the settings tab accepts it as a color (DES-003); the CSS check runs where it is applied, since Node has none.

Consequences:

- A key that `data.json` still holds for a local unit other than `cli` and the five security units seeds a device with no local value (PRD-001.R24), passes the load validation, then leaves `data.json` at that device's next save. The key of a never-seeded unit leaves `data.json` at that save too, unused on a fresh device, where a user whose profiles were only in `data.json` enters them again; an upgraded device takes the four units above once, never the profiles (Load, step 3).
- A unit moved back to synced ignores its stale local copy.
- Moving `cli` to synced writes this device's profiles and default profile to `data.json`, replacing the synced ones. A device that joins a synced vault with only its auto-detect profile therefore replaces the shared profiles if its owner syncs the group; with the group still device-only it changes nothing.
- Once a unit is local and its keys have left `data.json`, a device with no local value gets the defaults for it.
- The sync badge on a row adds or removes its unit key in this device's `localGroups`, saves and redraws the badge: `cloud-off` with "Stored on this device only. Click to sync across devices." for a local unit, `cloud` otherwise (PRD-001.R24). Each device keeps its own choice.

Migrations in `migrateRawSettings`, `sanitizeLocalGroups` and `normalizeSettings`:

| Stored shape | Becomes |
| --- | --- |
| `usageRefreshMinutes` | `usageRefreshSeconds` = minutes x 60; the old default of 10 maps to the current default (300 s); the old key is dropped |
| Flat `cliPath`, `useWsl` | On a device whose `cli` unit is synced, one profile with id `default`, name "Default"; elsewhere, like any profile, not seeded (the device starts with auto-detect). The flat keys are dropped either way |
| `localGroups` key `permissions` | `permissionMode`, `bypass` |
| `localGroups` key `chat` | `bash`, `obsidianMcp`, `context` |
| `localGroups` key `usage` | `showUsage`, `usageRefresh`, `usageWarn`, `usageCrit` |
| `localGroups` in `data.json` | Seeds this device's list (Load step 3), then leaves `data.json` |
| Profile without `chrome`, `sandbox`, `extraArgs` | Those fields at the CLI's own default (empty) |

The legacy group key `model` equals the current unit key, so it is read as the `model` unit alone and Effort keeps its own choice.

### Reset and Undo

`src/state/settings-reset.ts` (layer 1) plans a reset; `settings.ts` applies it.

- A plan lists, per changed row: section, name, old and new value as shown, the unit's store (synced or device), whether it switches a capability on (`enableObsidianMcp`, `enableBashMode`, `includeContextByDefault` going from off to on) and, for `vaultInstructions`, the old text's first line. It also holds the patches to apply and their inverse.
- A patch writes one settings key (`model` with `lastModel`, `effort` with `lastEffort`, `promptColor` with `promptCustomColor`, as their units pair them), one field of one CLI profile by profile id (`cliPath`, `chrome`, `sandbox`, `extraArgs`), or, with "Also reset what syncs", `localGroups` back to the default-local units. A profile's name, `useWsl` and default flag name it and are never reset (PRD-001.R39); a reset never adds or removes a profile.
- Scopes: a row; a section (every modified row in it, shown or not); everything (every section but Claude Code unless "Also reset Claude Code", `localGroups` only with "Also reset what syncs").
- Confirm: the dialog's plan is built again from the settings at that moment; if it differs from the one shown (a change from another window, a sync), the dialog shows the new one and waits for another confirm.
- Apply: the patches mutate the loaded settings, then one `saveSettings`, so each key lands in the store its unit names at that save (a reset of `localGroups` moves keys with it, as a badge flip does). Then `applyPanelSettings`, and, when the settings tab is closed (a reset is only made from it, an Undo can come after), `applyLaunchSettings`; while it is open, closing it applies them as for an edit.
- Undo: held in memory by the notice for its 10 s; never stored. It writes back the old value of each patch whose target holds the value the reset wrote, skipping a target that now holds another value and a profile since removed, and names what it skipped ("Undone, except <names>, changed since."); then save and apply as above. A value changed and changed back counts as unchanged. Undo of `localGroups` restores the old list.
- Failure: the reset's notice shows only once its save resolves. If `saveSettings` rejects (the two stores are written one after the other, so either may hold the new values), the notice reads "Could not save the settings: <message>" with the same Undo, which restores the eligible values in memory and saves again. If Undo's save fails, the restored values stay in memory and the notice offers the save again, without applying the inverse a second time; the next successful save writes whatever memory then holds to both stores.

### Device-local keys

All go through `App.saveLocalStorage`, which scopes a key to this vault on this device. Reads go through `src/local-store.ts` (`loadLocalValue`, `loadLocalRecord`), which returns `unknown` so each caller must narrow.

| Key | Value | Written | Read |
| --- | --- | --- | --- |
| `ai-agent-panel:local-settings` | Object of device-local settings, `localGroups` included | `saveSettings` | `loadSettings` |
| `claude-code:local-settings` | The same, from before the rename | never | `loadSettings`, when the key above is unset |
| `ai-agent-panel:open-tabs` | `{ids, activeId}`: conversation ids only | Tab switch, close, reorder, reopen, delete, restore, first recorded message | View open |
| `ai-agent-panel:side-width` | Number of pixels | At the end of a drag of the column's handle; a double-click clears it | View open, through `parseStoredColumnWidth`: clamped to 140 to 480 px; junk, and the 180 px earlier versions stored as their default, read as unset |
| `ai-agent-panel:session-provenance` | `{version: 1, migrated, conversations: {<id>: {sessions: {<profileId>: [session ids]}, started: [session ids], missingSince?}}}`; `migrated` is `false` until the grandfathering migration completes on this device, and a record without it reads as `true`: the sessions this device recorded (ADR-018) | Each `system/init` or branch cut that adds an id (at once, before the migration too), a branch's cut, Delete, a history scan that prunes or grandfathers | History scan, Resume, Branch, Undo; malformed reads as empty, unset triggers the one-time grandfathering, and a successful scan completes the migration (`migrated: true`): it seeds ids unless the listing holds the marker, then the key write and the marker write are each attempted whether or not the other succeeded, and a later successful scan retries a failed key write and recreates an absent marker; seeded ids are a conversation's, its turn and boundary records' and a pending branch's |
| `ai-agent-panel:side-sections` | Array of collapsed section keys: `pinned`, `open`, `recent` | Section toggle | View open; other values dropped |

A tab with no conversation is not restored. A branch tab or a pinned fresh tab has a conversation, and so an id, before its first message but no file yet; such an id drops out at restore. The plugin deletes none of these keys except the width, on a double-click.

### What travels

| Data | Obsidian Sync | Folder-mirroring tools (iCloud, Dropbox, git, Syncthing) |
| --- | --- | --- |
| `data.json`: units this device leaves synced | yes | yes |
| Device-local settings, `localGroups` and layout keys | no | no |
| `history/`: messages, pins, modes, profile ids, export paths, the `.session-provenance-migrated` marker | no | yes |
| Exported notes | yes, as notes | yes |

The Obsidian Sync column is Obsidian's documented behaviour, not verifiable here.

### Failure handling

| Failure | Behaviour |
| --- | --- |
| History write fails | `console.error`; one Notice per conversation until reload; retried by the next save |
| Obsidian quits or crashes before the debounce fires | Everything recorded since the last write is lost: up to 1 s after the last record, longer while records keep arriving |
| History file unreadable or invalid | Skipped; the rest load |
| Folder listing fails | The scan completes with the cache |
| Delete fails with the file still present | Notice; the tab stays attached |
| Automatic export fails | `console.error`; the save continues |
| Stored session cannot be resumed | Fresh session on the next message; the messages on screen are kept |
| Stored profile missing on this device | Reopens on the default profile; a Profile pick applies until a session is live (DES-002); a resume the CLI cannot find falls back as above |
| Two devices write the same conversation file through a mirroring tool | The last write wins |

## Architecture rules

Rules E1 to E3 are checkable by dependency-cruiser, E4 and E5 by an ESLint `no-restricted-properties` rule; until one runs, review checks them. Already stated elsewhere and relied on here: DES-001 A2 (no `obsidian` in `settings-core`), A3 and A4 (layering; only `main` imports `view`), A13 (model text into notes only through `inert-markdown`).

| # | Rule |
| --- | --- |
| E1 | `settings-core` imports only types, from `models` and `protocol/types` |
| E2 | `history` imports none of `view`, `main`, `export`; export, deletion fan-out and save-failure Notices attach through `onBeforeSave`, `onDeleted`, `onChanged` and `onSaveFailed`, wired in `main` |
| E3 | `export` imports only `obsidian`, `transcript-markdown` and types from `history` and `settings-core`; `transcript-markdown` imports only `commands`, `inert-markdown`, `tool-labels` and types from `history` |
| E4 | `App.loadLocalStorage` is called only in `local-store` |
| E5 | `loadData` and `saveData` are called only in `main` |

## Data and security

The user-facing threat model is [SECURITY.md](../../current/SECURITY.md).

| Store | Holds |
| --- | --- |
| `history/` | Prompts, replies, thinking, tool inputs in full (file text carried by Write and Edit, shell command lines), the first 1500 characters of each tool result and `!` stream, context paths, panel command cards as Claude Code reported them (`/status` shows the account email and organization, `/memory` and `/hooks` show paths and hook commands; also usage, credit and cost figures), turn records, the profile id |
| Exported notes | What history holds, except that a tool call exports as its name, a one-line input summary and the stored result, and model text is neutralized; ordinary notes, so indexed, synced and readable by other plugins |
| `data.json` | Settings in the units this device leaves synced |
| Device-local settings | `localGroups`, CLI paths and extra arguments, the security units by default, learned model lists and startup modes |
| Layout keys | Conversation ids, a width, section names |

- No store holds a credential or token, and nothing here uses the network.
- Everything is plain text on disk. History has no size or age bound.
- Deletion: a conversation's file goes with Delete; exported notes and Claude Code's files under `~/.claude/` stay. Removing the plugin folder removes `data.json` and `history/`, not exported notes; the plugin has no code that clears its local-storage keys.

What is validated on read, and what is taken as stored:

| Source | Validated | Taken as stored |
| --- | --- | --- |
| Conversation file | `version`; `messages` is an array; `id` from the file name; `sessionId` (a string kept as stored; used only as a lowercase UUID this device recorded), `model`, `effort`, `profileId`, `resolvedModel` (`isSafeArgValue`); `permissionMode` (`reopenMode`); `exportPath` before reuse; the type of `title` and of every message entry and field (`dropNonStringText`, `checkStoredMessages`) | The text of `title` and of every message, and the fields of a tool `input`, rendered only through text nodes and the rendering boundary |
| `data.json` | Profiles; the type of every key that has a default, and the values of `defaultPermissionMode`, `tabPosition`, `theme`, `promptStyle` and the usage thresholds; `model`, `effort` and their last picks; legacy keys | Keys without a default other than the last picks |
| Device-local values | Read as `unknown`; `localGroups` sanitized; tab ids filtered to strings and section keys to the three; width parsed and clamped; settings applied only for units that are local now | The values of those settings keys, then `normalizeSettings` |

Risks the design accepts:

- The plugin folder lies inside the vault, which is the CLI's working directory, so the agent's own file tools, and anything else with vault access, can write `data.json` and `history/`; whether Claude Code asks first depends on the mode. What such a write can widen is bounded by the validation above, except as the next item says.
- Carried, not yet accepted: a written conversation file's `profileId` chooses which of this device's CLI profiles, with its executable and arguments, a reopen of that conversation runs on; it can name only a profile the device already has. Accepting it is open owner decision D-06 ([open decisions](../../current/open-decisions.md)).
- Exported notes: text copied from one, code included, keeps the word joiners that break Templater's `<%` and Dataview's `::`; a link target holding `::` breaks.
- `/status` cards put what Claude Code reports about the account into history and exports.
- A unit the user makes synced is set by a shared or edited `data.json` on every device where it is synced, the executable included for `cli`.

## Rollout and rollback

- Formats: conversation files at `version: 1`, or `version: 2` while a `fresh-start` or `clear` record exists, both read, with the new optional fields; exported notes are derived and can be regenerated; settings migrate on load as listed above. 0.5.0 keeps `promptColor` and `promptCustomColor` in `data.json` when they are there; it does not load them from the device-local object, and drops them from it on its next save.
- Switches: `exportEnabled` (off by default) and the per-row sync badge. A flipped badge takes effect at the save it triggers.
- Observability: `console.error` for failed saves, reads, folder listings, deletes and automatic exports; Notices for a failed save, a failed delete, an export result and a conversation that cannot be loaded.
- Rollback is installing an earlier release (DES-001); files stay on disk. Settings migration is one-way: the legacy keys and `localGroups` are gone from `data.json` after the first save, so an earlier release treats every unit as synced at its default except `cli`.
- Not reversible: deleting a conversation (the file is removed, not trashed), removing the plugin folder, and automatic export overwriting hand edits to a note on the next save.

## Alternatives

Covered by ADR-005 (Claude Code's session files, Markdown notes as the source of truth, conversations in `data.json`, a vault folder) and ADR-009 (everything in `data.json`, a fixed split). Design-level choices:

- `localGroups` in `data.json`, so devices agree, against on each device: on each device, so a synced file cannot move a security unit back to synced.
- Model pick and resolved id in one field, against two: two, so Default survives a reopen and `system/init` cannot overwrite the pick.

## Verification

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| PRD-001.R39 (reset and Undo storage) | `tests/state-settings-reset.test.mjs`: scope selection, paired keys, profile-id patches, a stale plan confirmed again, per-value Undo guards, sync-choice restoration, failed-save recovery | Row, section and all resets with both stores inspected; a failed reset save and a failed Undo save; Undo after the settings tab closes |
| PRD-003.R1 to R7 | `tests/settings-core.test.mjs`: "PRD-003.R4: isSafeArgValue takes a string of 1 to 200 characters with no whitespace or control character, not starting with -", "PRD-003.R4: isSafeArgValue refuses every character cmd.exe would act on (CMD_UNSAFE)", "PRD-003.R4: a stored session id, model, effort, profile id or resolved model that fails isSafeArgValue is read as absent", "PRD-003.R4: safe stored values and a Default pick are kept as stored", "PRD-003.R4, ADR-009: a model or effort pick in either store that fails isSafeArgValue loads as Default", "PRD-003.R4: safe model and effort picks load unchanged, an absent last pick stays absent". `tests/history-core.test.mjs`: every "PRD-003.R6:" test (the scan merge). `tests/history-file.test.mjs`: every test ("PRD-001.R7:", "PRD-003.R4:", "PRD-003.R1, R4:": a title or export path that is not a string reads as none; a message that is not an object is dropped and a field of the wrong type reads as empty or absent, a send time and a message id that is no lowercase UUID included; "PRD-003.R1, R12:": a conversation time that is no time reads as the other, else the epoch). `tests/tab-recorder.test.mjs`: every test (a prompt recorded with its send time, the title, a conversation a pin created). `tests/history-notice.test.mjs`: every "PRD-003.R2:" test (one announcement per conversation id, the Notice text). `tests/conversation-list.test.mjs`: every "PRD-001.R7:" test (the title a prompt gives, the title shown, a branch's title) | Id pinning, a tampered `sessionId`, `model` and `profileId` read as absent, a hand-edited message (`null`, a number as `text`) that loads and exports without an error, the scan merge with a pin made mid-scan, the touch rules; record, close, reopen, resume on its profile and on the default, pin a fresh tab, a failed save |
| PRD-003.R8 | - | Delete from the row menu and the picker, both confirmed; tabs in two panel views detached |
| PRD-003.R9 | `tests/protocol.test.mjs` "optional spawn flags appear only when configured" (`--resume`). `tests/settings-core.test.mjs`: "PRD-003.R9: a reopened conversation restores its model and effort picks, Default included", "PRD-003.R9: a reopened conversation restores its CLI profile, else the default profile", "PRD-003.R9: a file from 0.5.x reads its model as the resolved id and a Default pick", "PRD-003.R9: a current file keeps its model pick, with or without a resolved id" | Reopen, turn numbering, the resume fallback |
| PRD-003.R10 to R13 | `tests/inert-markdown.test.mjs`, the export form; `tests/transcript-markdown.test.mjs`, the whole note | Manual and automatic export, a conversation that cannot be loaded, collisions, folder change, the note viewed with Dataview enabled |
| PRD-001.R24 | `tests/settings-core.test.mjs`: "PRD-001.R24: CLI profiles and the five security settings are device-local by default", "PRD-001.R24: the five security settings are never seeded from data.json", "PRD-001.R24: CLI profiles are never seeded from data.json", "PRD-001.R24: a device's own CLI profiles ignore the default profile id in data.json", "PRD-001.R24: CLI profiles this device switched to synced follow data.json", "PRD-001.R24: a device-only unit other than the six never-seeded ones still seeds from data.json", "PRD-001.R24: an upgrade from 0.5.0 keeps Bash and vault tools off, Plan, and the instructions", "PRD-001.R24: an upgrade never carries over a default that runs without a card", "PRD-001.R24: an upgrade never takes CLI profiles or the default profile id from data.json", "PRD-001.R24: only a device object with no localGroups key and a key an earlier build wrote is an upgrade", "PRD-001.R24: an upgrade fails closed for keys another device already moved out of data.json", "PRD-001.R24: an upgrade reads an invalid Bash or vault-tools value as off", "PRD-001.R24: an upgrade reads a non-string permission mode as the default without throwing", "PRD-001.R24: a device object with localGroups never takes the never-seeded units from data.json", "PRD-001.R24: a save writes this device's object before data.json, and no file when that fails", "PRD-001.R24: the seed from 0.5.0 does not repeat after the first save", "PRD-001.R24: prototype keys in data.json change nothing on upgrade", "PRD-001.R24: a security setting this device switched to synced follows data.json", "PRD-001.R24: the list of device-only settings is stored on the device, never in data.json", "PRD-001.R24: a data.json list can make more units device-only, never fewer", "PRD-001.R24: this device's own list wins, an explicit empty list included", "ADR-009: a wrong-typed security value falls back to its default", "ADR-009: prototype keys in either store change nothing", "PRD-002.R8: a stored default permission mode outside the four options loads as Claude Code default", "device-local values override synced ones, absent ones seed from synced", "a group moved back to synced ignores its stale local copy", "marking a group local moves its values out of data.json", "learned model resolutions never sync", "sanitizeLocalGroups keeps an explicit empty choice and drops junk", "pre-release coarse group keys map onto today's per-row units", "every sync-unit setting exists on the settings model", "legacy cliPath/useWsl migrate into a single profile", "profiles from before the launch options default them to the CLI's own", "usage minutes migration still applies", "ADR-009: a value of the wrong type loads as its default, from either store", "ADR-009: a wrong-typed list of profiles loads as the one default profile", "ADR-009: values of the right type load unchanged", "ADR-009: a tab position the setting does not offer, and a usage percent outside 0 to 100, load as the default", "ADR-009: a value has its default's kind: null, arrays, objects and non-finite numbers are told apart", "PRD-001.R24: a device-only Model row leaves Effort synced", "PRD-001.R24: the learned caches are never seeded from data.json", "PRD-003.R4: a learned cache entry of another shape or with an unsafe value is dropped", "PRD-003.R4: the initialize reply's models are screened as a stored list is". `tests/tabs-layout.test.mjs`: "PRD-001.R8: a stored 180 px reads as unset", "PRD-001.R8: a stored width is clamped on the way in, junk reads as unset". `save-queue.test.mjs`: "PRD-001.R24: settings saves run one at a time, the queued one with the latest state", "PRD-001.R24: a failed save still lets the queued save run", "PRD-001.R24: a save made right after another settles never runs beside the queued one". | `loadSettings` and `saveSettings`, the legacy local key, the sync badge, the open-tabs and sections keys |

Independent verification boundary: the exported functions of `settings-core`, `tabs-layout`, `inert-markdown` and `tab/recorder` in plain Node, run by CI through `make verify`, outside the implementing agent's control. `HistoryStore`, `TranscriptExporter` and the view's reopen code are checked by a person in a desktop vault, by reading the files the plugin writes. What Obsidian Sync carries is Obsidian's behaviour and cannot be verified in this repository.

## Open questions

None.
