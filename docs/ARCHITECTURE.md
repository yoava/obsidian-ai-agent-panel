# Architecture

## Overview

```
┌─ Obsidian (desktop) ───────────────────────────────┐
│  ┌─ AgentPanelView (src/view.ts) ────────────────┐ │
│  │  transcript · permission cards · composer     │ │
│  └───────────────▲───────────────────────────────┘ │
│                  │ typed events                     │
│  ┌─ ClaudeSession (src/session.ts) ──────────────┐ │
│  │  process lifecycle · turn state · resume      │ │
│  └───────────────▲───────────────────────────────┘ │
│                  │ stream messages / control reqs   │
│  ┌─ ClaudeClient (src/protocol/client.ts) ───────┐ │
│  │  spawn · NDJSON framing · control protocol    │ │
│  └───────────────▲───────────────────────────────┘ │
└──────────────────┼─────────────────────────────────┘
                   │ stdio (stream-JSON, one object per line)
        ┌──────────┴──────────┐
        │  claude CLI process │  cwd = vault root
        └─────────────────────┘
```

## Vocabulary

Four words, kept distinct in code, docs and UI text. The important pair is
*conversation* vs *session*: one conversation can span several CLI sessions
(every reload resumes it in a new process), so collapsing them would make
"restore the session" ambiguous.

| Word | Means |
|---|---|
| **conversation** | The durable thread: tabbed, saved under `history/`, resumed, branched, exported. The user-facing unit. |
| **chat** | The panel itself, and the act of using it - "Open chat", "Add selection to chat". Never one thread. |
| **session** | The Claude Code CLI process behind a conversation. Internal only; it never appears in UI text. |
| **transcript** | The exported Markdown note. |

## Why spawn the CLI instead of bundling the Agent SDK?

Obsidian plugins ship as a single bundled `main.js`. The official
`@anthropic-ai/claude-agent-sdk` is **proprietary** ("All rights reserved"),
so bundling it would redistribute Anthropic code inside an MIT project - a
license conflict. Instead, the plugin implements a small original client for
the CLI's publicly documented headless interface
(`--input-format stream-json --output-format stream-json`), which is the same
wire protocol the SDK itself uses. Result: **zero runtime dependencies**, a
fully MIT repository, and the user's existing Claude Code install and login do
the heavy lifting.

## The wire protocol

One `claude` process per conversation, kept alive across turns.

The protocol surface is larger than what the plugin uses. The control requests
it does send are listed under *Control requests* below; each one is also
declared in the public `@anthropic-ai/claude-agent-sdk` type definitions, which
are the reference for what a new feature can rely on.

**Spawn** (`ClaudeClient.start`):

```
claude --output-format stream-json --input-format stream-json --verbose \
       --include-partial-messages --permission-prompt-tool stdio \
       --replay-user-messages \
       [--model X] [--effort E] [--permission-mode Y] \
       [--resume SESSION_ID [--fork-session]] \
       [--allow-dangerously-skip-permissions]
```

With **Run via WSL** enabled (Windows), the same command is wrapped as
`wsl.exe --cd <vault> -- <cliPath> …`. On native Windows, a `.cmd`/`.bat` CLI
path (npm's shim) runs through cmd.exe instead (`shell: true`, path and args
quoted), because Node refuses to spawn batch files directly (CVE-2024-27980).
`cliSpawnSpec` (src/protocol/client.ts) is the one place that decides this
launch shape, and it is pinned by tests.

**Detection** (`src/cli.ts`): when no CLI path is configured, well-known
install locations are checked first, then `which`/`where`. `where` output is
filtered (`pickLookupResult`): the `.exe` wins over the `.cmd` shim, and npm's
extensionless POSIX sh shim - which Windows can't execute - is skipped. On
Windows the default WSL distro is probed too
(`wsl.exe -- sh -lc "command -v claude"`); detection returns both the path and
a `useWsl` flag, and the plugin persists the flag so sessions and usage checks
spawn on the side where the CLI was actually found (WSL is probed first when
the toggle is already on).

**CLI profiles** (`src/settings-core.ts`): the CLI location is a list of named
`{cliPath, useWsl}` profiles rather than one pair of fields - most vaults have
exactly one (the pre-profile settings migrate into it), in which case the
settings UI looks unchanged. `AgentPanelPlugin.resolveCli(profile)` performs
the detection above per profile (cached per profile id), each conversation tab carries
a `selectedProfileId` (seeded from the default profile, offered by the
composer's *Profile* control only when several profiles exist), and
account-level lookups (plan usage) follow the default profile.

**stdin** (client → CLI), one JSON object per line:

- User turns: `{"type":"user","message":{"role":"user","content":[{"type":"text","text":…}]},"session_id":…,"parent_tool_use_id":null}`. Attached images ride in the same `content` array as `{"type":"image","source":{"type":"base64","media_type":…,"data":…}}` blocks, images first, text last.
- Control requests: `{"type":"control_request","request_id":"obs_N","request":{"subtype":…}}` - used for `initialize` (handshake, also carries the vault-instructions system-prompt suffix), `interrupt`, `set_permission_mode`, `set_model`, `stop_task`, `get_context_usage`, `rewind_conversation`.
- Control responses to CLI-initiated requests (see below).

**stdout** (CLI → client), one JSON object per line:

| type | meaning |
|---|---|
| `system` / `init` | session id, model, tool list |
| `stream_event` | raw Anthropic streaming events (text/thinking deltas) |
| `assistant` | completed content blocks (text, thinking, `tool_use`) |
| `user` | tool results (`tool_result` blocks) |
| `result` | turn finished: duration, cost, error flag |
| `control_request` | CLI asks the client something - notably `can_use_tool` (a permission prompt) |
| `control_response` | reply to one of our control requests |
| `control_cancel_request` | CLI withdraws a pending permission prompt |

The CLI also sends `mcp_message` control requests, which carry JSON-RPC for the
in-process `obsidian` MCP server (see below).

**Permission flow**: `--permission-prompt-tool stdio` routes permission
decisions to us. On `can_use_tool` the view renders a card; the user's click
resolves a promise; the client answers with
`{"behavior":"allow","updatedInput":…}` (optionally with `updatedPermissions`
to persist an always-allow rule the CLI suggested) or
`{"behavior":"deny","message":…}`.

The conversation's *Auto-approve everything* mode is the plugin's own, not one of the
CLI's four: `cliPermissionMode` (`src/settings-core.ts`) maps it to `default`
for `--permission-mode` and `set_permission_mode`, and `handlePermissionRequest`
answers `allow` without rendering a card. The CLI's rules and hooks therefore
still run - a request they deny never arrives - which is what separates it from
`bypassPermissions`. Stored conversations keep the conversation-level value, so
reopening one restores the mode it ran in.

`AskUserQuestion` is special-cased: instead of an Allow/Deny card, the view
renders the tool's questions as an interactive form (option buttons per
question, multi-select toggles when `multiSelect` is set, plus a free-text
"Other" field). Submitting answers with
`{"behavior":"allow","updatedInput":{…, answers:{<question>: <labels>}}}` -
the CLI passes `answers` to the model as the tool result. If the input
doesn't match the expected shape, it falls back to the generic card.

## Rendering (src/view.ts)

- Streamed text accumulates as plain `textContent` (cheap), then the
  authoritative block from the `assistant` message is re-rendered through
  Obsidian's `MarkdownRenderer` (sanitized by Obsidian).
- `tool_use` blocks become activity cards keyed by tool-use id;
  `tool_result` blocks update their card (status, collapsible output preview).
- **Edit tools render diffs instead of JSON** (see below).
- Thinking blocks render as a collapsed `<details>`.
- Links get no behavior from `MarkdownRenderer` outside a Markdown view, so
  the transcript container delegates clicks: a vault link is resolved through
  `metadataCache.getFirstLinkpathDest` (trying the percent-decoded and
  root-relative forms) and opened with `openLinkText`, an unresolved one only
  warns; `http(s)/mailto/obsidian/file` targets go to `window.open`. Hover
  fires `hover-link` for the page-preview plugin (registered in `main.ts`).
  Link targets containing spaces are percent-encoded before rendering, since
  Markdown otherwise doesn't parse them as links at all.
- Subagent traffic (`parent_tool_use_id != null`) nests as a collapsed
  `<details>` thread inside its parent Task card - the agent's text, tool calls
  and their outcomes, plus the model, token total and duration it reports. The
  thread is keyed by the parent tool-use id, so a `system/task_notification`
  (which carries the same `tool_use_id`) can fold the finished agent's
  authoritative totals into the summary line.
- The tabs, transcript and composer sit in one flex `body`: a column with the
  tab strip on top, or (class `is-tabs-side`) a row with the tabs as a column
  beside the rest. The elements are identical either way - `applyTabPosition`
  flips the class and the axis that `updateTabOverflow`, `scrollTabIntoView`,
  the wheel redirect and drag-reordering work on. `auto` picks by pane width,
  with hysteresis so dragging the pane edge across the threshold cannot make
  the layout flicker; `onResize` (which Obsidian also fires on reveal/hide) is
  what re-evaluates it.
- The composer ends in two rows. The first is the input's own controls (**+**,
  **/**, the conversation's context meter, the account's plan-usage strip, stop
  and send); the second is what the conversation runs as - model, effort,
  permissions, and (only with several CLI profiles) profile. Each of the four
  is a button that opens its own Obsidian `Menu` with the current value
  checked, so a change takes two clicks and no popup owns the pane.
- Background work is tracked from `system/task_started`,
  `background_tasks_changed` (authoritative for what is still running),
  `task_updated` and `task_notification`, and rendered as a strip above the
  composer with a stop button per task (`stop_task` control request).
- The per-conversation context meter sums token counts across `result.usage`
  and takes `total_cost_usd` as-is (it is already cumulative, and is clamped to
  never shrink so a process restart cannot lose the running total). The context
  *percentage* comes from a `get_context_usage` control request issued after
  each turn - `result.usage` reports per-request tokens, not window occupancy.
  The request is only valid once a turn has run. Its per-category reply is
  normalized in `getContextUsage` before the view sees it: the CLI marks a
  deferred category twice over, both as an `isDeferred` flag and as a
  "(deferred)" suffix inside the display name, so the suffix is stripped from
  the name and folded into the flag. The view owns the label, which keeps it
  from being rendered twice while still showing up if the CLI stops embedding
  it. Nothing declares the format of `name`, so it is not relied on.
- All user/model strings enter the DOM via `setText`/`createEl` text - never
  `innerHTML`.

Subagent threads and background tasks are live-only: they are not written to
the conversation history, so a restored conversation shows the Task card and its
result summary as before.

## Diffs (src/diff.ts, src/edits.ts, src/diffview.ts)

An edit is only reviewable if you can see it, so `Edit`/`Write`/`MultiEdit` are
rendered as diffs rather than as tool input.

**`src/diff.ts`** is an original, dependency-free diff: line-level LCS after
trimming the common prefix and suffix, then a word-level LCS inside lines that
were replaced so a one-word change highlights that word instead of repainting
the line. Everything is bounded - past a cell budget the diff degrades to "this
block was replaced" and reports `coarse: true` rather than blocking the UI
thread. Unchanged stretches collapse into `gap` rows carrying their line count.

**`src/edits.ts`** answers "what would this tool call do to this file" from the
tool input alone - mirroring the documented Edit/Write/MultiEdit semantics
(literal replacement, `replace_all`, sequential MultiEdit) - which is what makes
a diff possible *before* approval. It also maps CLI-reported absolute paths back
to vault-relative ones, rejecting anything outside the vault.

Both files are pure and Obsidian-free, and are tested in plain Node
(`npm test`). **`src/diffview.ts`** holds the DOM and the "changes this
conversation" modal.

Where the before/after text comes from:

| moment | before | after |
|---|---|---|
| permission card | the file, read now (still pre-edit) | `planEdit` applied to it |
| card while running | - | `planEdit` on the tool input alone |
| after `tool_result` | the pre-image captured at `tool_use` | the file, re-read from disk |
| restored conversation | the stored tool input | the stored tool input |

The pre-image matters: `tool_use` is announced *before* the tool runs, which is
the last moment the old contents exist, so `capturePreImage` starts the read
there and `settleEditCard` awaits it when the result lands. After the fact the
diff is the real one (pre-image vs. what is actually on disk), not a
re-derivation of what the tool claimed it would do.

Per-conversation change tracking keeps the **first** pre-image and the **latest**
post-image per path, so the header's "N files +x -y" link and its modal always
show the net change since the conversation began - not the last edit alone.

Every edit diff also carries a **rendered** toggle: the changed region (context
rows included, collapsed stretches excluded) is reconstructed as before/after
Markdown and drawn through the view's `MarkdownRenderer`. A vault is made of
Markdown, so a raw diff of a table or a `**bold**` run is not always the clearest
way to see what a change does. `diffview.ts` takes the renderer as a callback,
which keeps it from reaching into the view.

## The `obsidian` MCP server (src/mcp/)

The plugin exposes an **in-process MCP server** to the CLI, giving Claude the
things it cannot get from the filesystem: Obsidian's link graph and its metadata
index. This is the one capability the VS Code extension has no equivalent of,
because it needs Obsidian's own APIs.

**How it is wired.** `sdkMcpServers: ["obsidian"]` on the `initialize` control
request registers it. The CLI then runs a standard MCP client against it, with
one `mcp_message` control request per JSON-RPC message; the reply this plugin
returns becomes that request's `mcp_response`. The handshake is exercised end
to end in `tests/mcp.test.mjs`.

Consequences of that transport, all load-bearing:

- It is **strictly request/response**. The CLI feeds whatever comes back
  straight into `onmessage`, so `mcp_response` must be the reply to exactly
  that message. Notifications get an explicit `null`.
- Only `{tools:{}}` is advertised, so the CLI never asks for `resources/list`
  or `prompts/list`.
- A handler that throws becomes a **tool-level** error (`isError: true`) rather
  than a JSON-RPC error, so the model reads the failure and can adapt.

**Constraints honoured by construction:** no port is opened, no `.mcp.json` is
written, no process is spawned, and nothing is persisted. The server exists only
as a handler for `mcp_message` on the stdio pipe the plugin already owns. It
requires Claude Code 2.1.210+; on older CLIs `sdkMcpServers` is ignored and the
tools simply do not appear. It can be switched off in settings.

**Permissions.** Every MCP tool call raises the CLI's normal `can_use_tool`
prompt (verified live), so nothing here is a way around consent. The view
rewrites the prompt into a sentence for these tools - "Rename notes/A.md to
archive/A.md, updating backlinks?" rather than
"Allow mcp__obsidian__obsidian_rename?".

### Tool contract

| tool | arguments | effect | Obsidian API |
|---|---|---|---|
| `obsidian_links` | `path` | Read. Outgoing links, embeds, backlinks and unresolved links for one note. | `metadataCache.getFileCache`, `resolvedLinks`, `unresolvedLinks`, `getFirstLinkpathDest` |
| `obsidian_search` | `query`, `limit?` | Read. Metadata-aware search over every Markdown note. | `vault.getMarkdownFiles`, `metadataCache.getFileCache` |
| `obsidian_properties` | `path`, `patch?` | Read without `patch`; **writes** frontmatter with it (`null` deletes a key). | `fileManager.processFrontMatter` |
| `obsidian_rename` | `path`, `newPath` | **Writes.** Renames/moves a note and rewrites every link pointing at it. | `fileManager.renameFile` |
| `obsidian_active` | - | Read. Active note path, cursor position, selected text. | `workspace.getActiveViewOfType(MarkdownView)` |
| `obsidian_open` | `path`, `newPane?` | **Side effect** on the user's window. | `workspace.getLeaf().openFile` |

`path` accepts a vault-relative path, the same without an extension, or link
text - resolved through `getFirstLinkpathDest`, since the model usually has a
name from a wiki link rather than a full path.

`obsidian_search`'s query language lives in `src/mcp/query.ts` (pure, tested):

```
tag:project           heading:"Open questions"    prop:status=done
prop:due              folder:daily                path:2026
-tag:archive          roadmap        (bare word: note name or path)
```

All terms must match; `-` negates any of them; nested tags match their parent
(`tag:work` hits `#work/active`); an empty query matches **nothing** rather than
everything. A word that looks like a filter but is not (`titel:x`) is matched as
text *and* reported back, so the model can correct itself.

The search is deliberately metadata-only. Claude already has Grep for note
contents; what it cannot do without Obsidian is ask about tags, properties and
headings.

## Checkpoints and rewind (src/checkpoints.ts)

Two independent things, offered on every finished turn:

**Restore files.** Before a turn's first edit lands, the pre-image of each file
it is about to touch is written to
`.obsidian/plugins/ai-agent-panel/checkpoints/<conversationId>__<turn>.json`. The
read that feeds the diff is the same read that feeds the checkpoint, so this
costs nothing extra, and it happens at `tool_use` time - the last moment the old
contents still exist. Only the **first** pre-image per path per turn is kept, so
restoring returns the vault to how it looked before the turn, however many times
a file was edited. Subagent edits are snapshotted too, from the nested
`tool_use` blocks.

The store is bounded (2 MB per file, 24 MB and 400 checkpoints in total, oldest
pruned first, never pruning a turn still being written), refuses unsafe
conversation ids and turn numbers, and pins each record's identity to its file
name so a tampered or synced file cannot claim another conversation. IO is
injected as an interface - Obsidian's `DataAdapter` happens to satisfy it - which
keeps the file Obsidian-free and testable.

Restoring writes through the `Vault` API (so open panes and the metadata cache
update) and deletes created files via `fileManager.trashFile`, honouring the
user's deleted-files setting. A confirmation modal diffs each file against what
is on disk *now*, so the user sees exactly what the restore would undo -
including their own later edits.

**Branch from here.** The plugin cannot rewind a conversation in place without
destroying it, so branching opens a new tab whose session resumes the original
with `--fork-session` (a new session id; the original transcript untouched) and
issues a `rewind_conversation` for that turn's user-message uuid *before* the
branch's first message. Learning that uuid is why every session is spawned with
`--replay-user-messages`: without it the CLI never echoes our own turns, so they
have no reported uuid. The fork flag
is spent once the branch reports its own session id, so a later restart resumes
the branch rather than forking again.

Why not the CLI's own `rewind_files`? It is session-scoped, and this plugin
replaces the CLI process deliberately (an effort change) and after crashes - so
those checkpoints would evaporate exactly when they are wanted. It also does not
cover subagent edits.

## The composer's "!" shell escape (src/bash.ts)

`!<command>` runs locally rather than through a tool call. There is no protocol
path for "invoke Bash directly" (the `mcp_call` control request is MCP-only and
refuses SDK servers), and routing it through a model turn would be neither
deterministic nor free - so the plugin runs it itself, with the vault as cwd.

That is a deliberate departure from "everything goes through Claude Code's
permissions": the user issued the command, so there is no model decision to
approve. The model is not told about it either, unless the user presses *Add
output to chat*, which only fills the composer. `src/bash.ts` is Obsidian-free
and tested; see [SECURITY.md](SECURITY.md) for the reasoning and the limits
(single-argv shell invocation, 60s timeout, 100k per stream, settings toggle).

## Crash / restart behavior

`ClaudeSession` records the session id from `system/init`. If the process dies
(crash, interrupt at a bad time), the next send spawns a fresh process with
`--resume <sessionId>` so the conversation continues.

The same machinery makes **effort switching** invisible. There is no
`set_effort` control request and
`--effort` is spawn-time only, so `setEffort` replaces the process: it waits for
any running turn to finish, drops the old client (whose close event is
recognised as stale and swallowed, so no error surfaces), and immediately warms
up a replacement with `--resume`, rather than leaving the cost of the respawn
for the user's next send.

## Conversation history & transcript export

The CLI's `--resume` restores context server-side but never replays past
messages, so the plugin records what it renders: each conversation is a JSON
file under `.obsidian/plugins/ai-agent-panel/history/<id>.json`, saved with a 1s
debounce (`src/history.ts`). Optional Markdown export (`src/export.ts`) runs
as a pre-save hook and regenerates the conversation's note in full on every
save; the note name comes from a configurable pattern (`{date}`, `{title}`,
`{id}`; `/` nests subfolders) plus a Moment date format. The JSON history
stays the source of truth.

The set of open tabs (conversation ids + the active one) is persisted through
`App.saveLocalStorage`, which is scoped to the vault on the current machine
and never syncs; on view open the tabs are restored from the history store,
silently dropping conversations that were deleted in the meantime. The side
column's width (`ai-agent-panel:side-width`) rides in the same store for the
same reason - how wide a column fits is a fact about the screen, not the
vault - which is why it is not an `AgentPanelSettings` key and has no sync
unit.

## Conversation-column geometry (src/tabs-layout.ts)

The side column is resized by dragging its inner (left) edge; the width lands
on `bodyEl` as `--ai-agent-panel-side-width`, which the `flex-basis` reads.
Two numbers govern it, both in the Obsidian-free `src/tabs-layout.ts` so they
can be unit-tested and cannot drift apart:

- `clampSideWidth(width, paneWidth)` - the draggable range, `[140px,
  min(480px, half the pane)]`, with the minimum winning in a pane too narrow
  for both. The view keeps the user's chosen width separately from the drawn
  one, so a pane that is briefly too narrow caps what is drawn without
  discarding the preference.
- `sideLayoutThreshold(sideWidth, onSide)` - the pane width from which
  *Automatic* uses the column: the column itself plus a 380px transcript
  budget, less a 40px hysteresis while the column is already showing. Deriving
  it from the *current* width (rather than the old hard-coded 560px, which
  assumed a 180px column) is what stops a column dragged wide from leaving a
  squashed transcript. At the 180px default it still evaluates to 560px.

The layout is re-settled once on drag end rather than per `pointermove`, so a
threshold crossing cannot flip the layout under the pointer mid-drag.

## The conversation column (src/conversation-list.ts)

In the side layout the column is the complete conversation list - open tabs
**and** history - so that layout needs no "Previous conversations" picker. One
scroller holds three sections, and every conversation appears in exactly one:
*Pinned*, then *Open* (a count in the header), then *Recent*, itself split
into *Today* / *Yesterday* / *Previous 7 days* / *Older*. Sectioning, sorting,
date bucketing and the title filter are pure functions in
`src/conversation-list.ts` (`groupConversations`), tested without a DOM.

`renderTabList` draws whatever that returns. Two rules make it safe to call
often:

- **Tab elements are moved, never rebuilt.** A `ChatTab`'s element carries its
  drag handlers, `is-active`/`is-busy` classes and tooltip from `addTab`
  onwards, so the renderer re-parents it into the right section rather than
  recreating it. That is also what lets an open conversation keep its close
  button and busy dot while being drawn in *Pinned*.
- **A fingerprint guards the rebuild.** `columnKey` renders the section
  structure as a string; a save that moves nothing (the common case, about
  once a second while a turn runs) compares equal and does no DOM work.

Rows differ by section on purpose. *Recent* rows are muted, carry a relative
time, and have **no `×`**: a button that closes a tab in one section and
destroys a conversation in the next is a trap. Deletion is only in the
right-click / long-press menu, behind a confirmation
(`DeleteConversationModal`).

## History cache (src/history.ts)

`HistoryStore` keeps a `Map<id, ConversationMeta>`. The column is on screen
continuously, so it cannot re-read the folder to redraw: a scan reads and
JSON-parses *every* conversation file, and a running turn saves about once a
second.

- `refresh()` is the only folder scan, run on view open (not awaited - open
  tabs paint first and *Recent* fills in behind them) or when files can have
  appeared behind the plugin's back, such as a vault sync. Concurrent calls
  share one in-flight scan.
- `save()` and `delete()` update the map in place and fire `onChanged`, which
  `main.ts` fans out to the open views. `load()` fills the map silently -
  restoring a dozen tabs must not cost a dozen re-renders.
- A scan takes a while and writes keep happening during it, so entries the
  cache gained meanwhile win over what the scan read, and ids deleted
  mid-scan are dropped from its result rather than resurrected.
- `snapshot()` is the synchronous, IO-free read the renderer uses; `list()`
  still exists for the picker modal and scans once on first use.
- A scan that cannot read the folder still completes, keeping whatever the
  cache holds: the view calls `refresh()` as `void`, and nothing calls it
  again, so a rejection would strand the column on "Loading…" for the session.
- `delete()` only forgets a conversation once the file is actually gone. An
  `remove()` that fails while the file survives keeps the cache entry and says
  so, because dropping it would take the row off the column now and have the
  next scan bring the conversation back as a duplicate.

### Pinning

`StoredConversation` carries `pinned?: boolean` and `pinnedAt?: number`, both
surfaced on `ConversationMeta`. They live in the conversation file rather than
in the device-local layout state next to the column width, because pinning is
a judgement about the conversation, not about this screen - so it travels with
the file and syncs with the vault. No version bump was needed: an absent field
already means "not pinned", which is exactly what every existing file says.

Two consequences worth keeping straight:

- `save()` takes `{ touch: false }` for a pin toggle. Every other save stamps
  `updatedAt`, and pinning is not activity - without it, unpinning a
  months-old conversation would drop it into *Recent* under today's date.
- `remember()` compares `pinned`/`pinnedAt` as well as title and timestamps,
  or a pin toggle - which by design changes nothing else - would update the
  cache without telling anyone to redraw.

In the top strip, `stripOrder()` sorts a *copy* of the tabs array so pinned
tabs lead: the array itself stays the drag order, and the sort is stable, so
unpinned tabs keep the positions they were dragged into. Dragging across the
pinned/unpinned boundary is refused, since the pinned run is ordered by pin
time rather than by hand.

## Settings storage (src/settings-core.ts)

Settings live in two stores. `data.json` is the synced one - Obsidian Sync
(and any tool that syncs `.obsidian/`) carries it between devices.
Device-local settings go through `App.saveLocalStorage` under
`ai-agent-panel:local-settings` (per vault, per machine, never synced). What is
local is decided per **sync unit** (`SYNC_UNITS`, one unit per settings-tab
row): each row carries a cloud / cloud-off badge (`addSyncBadge`, the
Notebook Navigator pattern) that flips its unit, the chosen unit keys are
stored - synced - in `data.json`'s `localGroups`, and
`splitSettings`/`mergeLocalSettings` route values on save/load. The CLI
section defaults to local (install paths are machine facts); learned caches
like `resolvedModels` and `cliModels` are always local and carry no badge. A
key that data.json still carries (older plugin version, or a unit freshly
made local elsewhere) seeds a device that has no local value of its own,
then drops out of data.json on the next save.

## Model picker (src/models.ts)

The picker stores CLI **aliases** (`opus`, `sonnet[1m]`, …), which the CLI
itself points at the latest snapshot of each family - so a new model release
needs no plugin change to be selectable. Both the *entries* and the *labels*
are learned rather than hard-coded:

- **Entries**: the `initialize` handshake's response lists the models this CLI
  version + account accept (value, resolved id, display name, description,
  supported effort levels - the same payload as the `list_models` control
  request). `parseCliModels` validates it, `rememberCliModels` caches it per
  CLI profile in `settings.cliModels` (device-local - it describes this
  machine's install), and `modelOptions` builds the picker from it, so a model
  the CLI would reject with "not a recognized model id" never appears. The
  entries' effort lists grey out unsupported effort levels, and should
  `set_model` still be rejected, the view rolls the selection back. The
  literals in `MODEL_OPTIONS` only cover the first run, before any session has
  reported a list.
- **Labels**: every session's `system/init` reports the id the alias resolved
  to (`opus` → `claude-opus-5`), which `rememberModelResolution` caches in
  `settings.resolvedModels` and `describeModelId` formats for display
  (`claude-haiku-4-5-20251001` → "Haiku 4.5"). `opusplan` keeps its
  hand-written label, since the single reported id describes only its
  execution half.

A learned resolution is trusted only when it names the alias's own model
family (`isCredibleResolution`): a CLI that doesn't recognize an alias
silently runs its default model, and crediting that id to the alias would
mislabel the picker entry (e.g. "fable" shown as "Opus 4.8"). Cross-family
reports are refused at write time and pruned from `settings.resolvedModels`
on load.

## Plan usage

`src/usage.ts` asks the **running CLI session** for the numbers, with a
`get_usage` control request over the stdio channel the plugin already owns
(`src/protocol/client.ts`); the CLI makes any authenticated call itself, with
the login it already has. The plugin holds no token and reads no credential
store. Results are cached; the view polls only while the usage strip is
enabled **and** visible (window, sidebar, and leaf all shown), re-fetches once
after each finished turn, and every lookup - even forced - is rate-floored.
The strip highlights windows past configurable warn/crit thresholds and opens
a detail modal on click.

Because the data comes from a session, usage is only available while one is
running: there is deliberately no path that starts a CLI process just to draw
the strip. Anthropic marks `get_usage` experimental, so a CLI that does not
answer it renders nothing rather than erroring.

## File map

| file | role |
|---|---|
| `src/main.ts` | plugin entry: view/commands/ribbon/settings registration, service wiring |
| `src/view.ts` | the chat panel UI: tabs, transcript, composer, usage strip |
| `src/tabs-layout.ts` | side-column clamp + "auto" layout threshold (no Obsidian imports - plain-Node tests) |
| `src/conversation-list.ts` | column sectioning, sorting, date buckets, title filter (same, pure) |
| `src/diff.ts` | original line + word diff (no Obsidian imports - plain-Node tests) |
| `src/edits.ts` | what an Edit/Write/MultiEdit call would do (same, pure) |
| `src/diffview.ts` | diff DOM and the "changes this conversation" modal |
| `src/bash.ts` | the composer's `!` shell escape (no Obsidian imports, tested) |
| `src/checkpoints.ts` | per-turn file snapshots + restore planning (same, pure) |
| `src/mcp/server.ts` | the in-process MCP server: JSON-RPC dispatch (same, pure) |
| `src/mcp/query.ts` | `obsidian_search`'s query language (same, pure) |
| `src/mcp/vault-tools.ts` | the six vault tools, on the Obsidian App API |
| `src/session.ts` | conversation lifecycle around one CLI process |
| `src/protocol/client.ts` | stdio transport + control protocol (no Obsidian imports - testable in plain Node) |
| `src/protocol/types.ts` | original type definitions for the wire protocol |
| `src/cli.ts` | `claude` executable discovery |
| `src/settings-core.ts` | settings model, defaults, migration, CLI-profile helpers (no Obsidian imports - plain-Node tests) |
| `src/settings.ts` | the settings tab UI, duration parsing |
| `src/models.ts` | model picker entries and their self-updating labels |
| `src/history.ts` | plugin-owned conversation persistence + history picker modal |
| `src/export.ts` | Markdown transcript exporter (patterned note names) |
| `src/usage.ts` | plan-usage service, formatting, and detail modal |
| `src/suggest.ts` | `@` file-mention and `/` slash-command autocompletes |
| `src/icon.ts` | the plugin's vendor-neutral ribbon icon (chat bubble with a terminal prompt) |
