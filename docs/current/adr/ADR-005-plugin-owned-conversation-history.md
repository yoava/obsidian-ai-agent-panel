# ADR-005 — Plugin-owned conversation history as JSON files

**Status:** accepted (2026-10-11)

## Context

- The panel reopens, resumes, branches and exports conversations; one
  conversation outlives several CLI processes (respawn on effort or profile
  change, crash, reload).
- `--resume` restores the CLI's context but replays no past messages; the CLI
  has no command to list sessions; its transcripts sit in `~/.claude/projects`,
  inside the WSL filesystem when the CLI runs there.
- Obsidian Sync carries only `main.js`, `manifest.json`, `styles.css` and
  `data.json` from a plugin folder.

## Options considered

### Record what the panel renders, one JSON file per conversation in the plugin folder (recommended)

- Full control over what a reopen shows; the same for native and WSL CLIs;
  hidden from the file explorer and search; within the constitution's
  file-access bound (`history/`).
- A second store beside the CLI's transcripts; Obsidian Sync does not carry
  it; uninstalling the plugin deletes it.

### The same JSON files in a vault folder outside `.obsidian`

- Survives uninstall; Obsidian Sync carries it when set to sync other file
  types.
- A folder in the user's file explorer that they and other plugins can move,
  rename or delete; the constitution's file-access bound would need a human
  change to allow it.

### Read the CLI's transcripts

- One source of truth, no duplication.
- The constitution's file-access bound forbids reading `~/.claude/projects`;
  there is also no list command, no replay over the protocol, and the files
  sit on another filesystem under WSL.

### Markdown notes as the source of truth

- Visible, searchable and synced as notes.
- Notes the user can edit would have to round-trip through a parser back into
  tool cards, metadata and resume ids.

### Conversations in `data.json`

- Synced with settings.
- Grows without bound, and every history save (debounced 1 s) becomes a
  synced settings write.

## Decision

Why one JSON file per conversation in the plugin folder:

- Over a vault folder: in-vault writes are limited to "its plugin folder
  (`data.json`, `history/`), transcript exports when enabled, and vault-tool
  changes" (`docs/current/constitution.md:39-41`), so it needs a human
  constitution change; in the file explorer the user and other plugins could
  move or delete the files (inferred).
- Over the CLI's transcripts: outside the vault the plugin "only probes CLI
  install paths it composes itself and runs `which`/`where`"
  (`docs/current/constitution.md:37-38`), and `!` output, which the plugin
  runs itself (`src/view.ts:2007-2013`), never reaches the CLI's transcript.
- Over Markdown notes: the session id for `--resume`, model, effort,
  permission picks and pin state (`src/history.ts:70-100`) would have to
  survive a parse of text the user can edit (inferred).
- Over `data.json`: "`data.json` holds settings only"
  (`docs/current/constitution.md:25`); `saveData` writes that one file
  (`node_modules/obsidian/obsidian.d.ts:5058-5059`), so every history save,
  debounced 1 s (`src/history.ts:111`), would rewrite all conversations.

The design:

- `HistoryStore` writes `<plugin dir>/history/<id>.json`
  (`StoredConversation`, `version: 1`, or `version: 2` for a conversation
  holding a clear or a fresh start, ADR-018) through the vault adapter,
  debounced 1 s; an in-memory metadata cache feeds the conversation list.
- The history folder also holds `history/.session-provenance-migrated`, the
  session-provenance migration marker (ADR-018). The folder scan reads only
  `.json` files, so it never lists the marker as a conversation.
- A conversation is distinct from a CLI session and spans one per segment
  between boundaries (ADR-018); its file stores the latest session id for
  `--resume`, and its turn and boundary records store their own. A stored
  session id is used only if it is a lowercase UUID that this device
  recorded for that conversation and CLI profile (ADR-018). Conversation ids
  must match `^[A-Za-z0-9_-]+$` and are pinned to the file name on load.
- Stored: messages as rendered, tool inputs in full, tool results and `!`
  output truncated to 1500 characters, image counts only (bytes stay in
  memory), model, effort and permission picks, pin state, clear, fresh-start
  and compaction records, and a branch's fork base (ADR-018). Subagent
  threads and background tasks are live only.
- A new optional field needs no version bump when its absence means the old
  behaviour. A record whose omission would make an older reader act on the
  wrong session needs a new version (ADR-018: `version: 2` for conversations
  holding a clear or a fresh start).
- Markdown export is a derived view: when enabled, the conversation's note is
  regenerated in full before every history save, into a sanitized path under
  the export folder.
- Validation: `src/history.ts` and `src/export.ts` import `obsidian` and are
  not in `pretest`, so id pinning and export-path re-validation have no
  automated test today; they are checked by hand in a vault.

## Consequences

- Conversations do not travel through Obsidian Sync; folder-mirroring tools
  (iCloud, Dropbox, git, Syncthing) carry them. Uninstalling the plugin
  deletes them.
- Conversation content, tool inputs included, sits on disk in the plugin
  folder and, with export on, in vault notes.
- A reopened conversation shows truncated tool output.
- Hand edits to an exported note are overwritten on the next save.
- Exported notes carry model text through the rendering boundary's export
  form (ADR-010), and tool and shell output in fences Dataview does not run;
  no Templater command opens and Dataview reads no inline field anywhere in
  a note (DES-005). Text copied from a note keeps the word joiners that break
  `<%` and `::`.
- Open risk: history files feed state back into the panel. Conversation ids,
  every stored session id and export paths are re-validated; a stored permission mode is accepted if the menu
  offers it, auto-approve included (ADR-002).
