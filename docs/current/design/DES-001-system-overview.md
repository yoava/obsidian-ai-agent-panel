# DES-001 — System overview

**Status:** accepted (2026-10-16)

## Requirements

Component-level design for all five PRDs.

| PRD | Scope | Design detail |
| --- | --- | --- |
| [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md) | Chat panel and sessions | this doc, [DES-002](DES-002-cli-client-and-session-lifecycle.md), [DES-003](DES-003-panel-ui.md); R24 in [DES-005](DES-005-persistence-and-sync.md) |
| [PRD-002](../../current/product/PRD-002-permissions-and-change-control.md) | Permissions and change control | [DES-004](../../current/design/DES-004-permission-and-change-control.md) |
| [PRD-003](../../current/product/PRD-003-conversation-history-and-export.md) | Conversation history and export | [DES-005](DES-005-persistence-and-sync.md) |
| [PRD-004](../../current/product/PRD-004-vault-tools.md) | Vault tools | [DES-006](../../current/design/DES-006-vault-tools.md) |
| [PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md) | Plan usage and cost | [DES-007](../../current/design/DES-007-usage-and-cost.md) |

Satisfied in this doc: PRD-001.R1 (open the panel), PRD-001.R25 (settings tab), PRD-001.R39 (settings page), PRD-001.R26 (platforms and compatibility), PRD-001.R27 (privacy). [Requirement ownership](#requirement-ownership) assigns every other requirement to a design doc.

Manual verification obligations:

- PRD-001.R1: ribbon icon, the commands and both file-menu items, in a desktop vault; the Notice when no sidebar leaf can be created.
- PRD-001.R25, R39: the settings page on Obsidian 1.13.4, 1.14.4 (`getSettingDefinitions`) and on 1.8.7 to 1.12 (`display`), light and dark, 460 and 720 px, right-to-left; ADR-019's manual checks; each setting reaching open conversations as stated under [Settings page](#settings-page).
- PRD-001.R26: one conversation each on Windows (native executable, npm `.cmd` shim, WSL), macOS and Linux.
- PRD-001.R27: source inspection for network, credential and clipboard-read APIs.
- Plugin unload: disable the plugin, and quit Obsidian, with conversations running; no `claude` process remains.

## Context and constraints

- An Obsidian desktop plugin (id `ai-agent-panel`, `minAppVersion` 1.8.7, `isDesktopOnly: true`; [ADR-013](../../current/adr/ADR-013-desktop-only-obsidian-1-8-7-floor.md)) that runs the user's installed Claude Code CLI as one child process per conversation, with the vault root as working directory ([ADR-001](../../current/adr/ADR-001-drive-the-installed-cli-over-stream-json.md)). The CLI is driven by an original client, never by the Agent SDK ([ADR-001](../../current/adr/ADR-001-drive-the-installed-cli-over-stream-json.md)).
- TypeScript under `src/`, bundled by esbuild into one CommonJS `main.js` with every runtime library bundled in after ADR-007's screen, none today ([ADR-007](../../current/adr/ADR-007-runtime-dependencies.md), [ADR-014](../../current/adr/ADR-014-build-lint-and-test-toolchain.md)).
- The name is vendor-neutral; the code is Claude-specific (`ClaudeClient`, `ClaudeSession`). A second agent is 1.0 work ([ADR-012](../../current/adr/ADR-012-vendor-neutral-identity.md)).
- The [constitution](../../current/constitution.md) fixes the system-wide invariants: no network, credentials or telemetry of the plugin's own, consent before what the CLI submits for approval, no injectable command lines, bounded file access, inert rendering, screened bundled libraries only, desktop only, device-local security settings.

Decisions fixed by ADRs:

| ADR | Fixes | Detail in |
| --- | --- | --- |
| [ADR-001](../../current/adr/ADR-001-drive-the-installed-cli-over-stream-json.md) | The CLI over stream-JSON, one process per conversation, an original client | DES-002 |
| [ADR-002](../../current/adr/ADR-002-permission-prompts-cli-decides-panel-asks.md) | Permission prompts and modes | DES-004 |
| [ADR-003](../../current/adr/ADR-003-plan-usage-and-account-data-through-the-cli.md) | Usage and account data only through the running CLI | DES-007 |
| [ADR-004](../../current/adr/ADR-004-vault-tools-as-in-process-mcp-server.md) | Vault tools as an in-process MCP server | DES-006 |
| [ADR-005](../../current/adr/ADR-005-plugin-owned-conversation-history.md) | Plugin-owned history as JSON files | DES-005 |
| [ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md) | Restore through the CLI's file checkpoints; branch by fork and rewind | DES-004; spawn side in DES-002 |
| [ADR-007](../../current/adr/ADR-007-runtime-dependencies.md) | Runtime dependencies: bundled and screened | this doc |
| [ADR-008](../../current/adr/ADR-008-windows-and-wsl-launch-and-cli-profiles.md) | Launch shapes and CLI profiles | DES-002 |
| [ADR-009](../../current/adr/ADR-009-synced-and-device-local-settings.md) | Synced and device-local settings | DES-005 |
| [ADR-010](../../current/adr/ADR-010-render-model-output-with-markdownrenderer.md) | Rendering through `MarkdownRenderer` | this doc ([Rendering boundary](#rendering-boundary)), DES-003 |
| [ADR-011](../../current/adr/ADR-011-user-shell-escape-outside-agent-permissions.md) | The `!` shell escape | DES-004 |
| [ADR-012](../../current/adr/ADR-012-vendor-neutral-identity.md) | Vendor-neutral identity | this doc |
| [ADR-013](../../current/adr/ADR-013-desktop-only-obsidian-1-8-7-floor.md) | Desktop only, 1.8.7 floor, settings tab rendered two ways | this doc |
| [ADR-014](../../current/adr/ADR-014-build-lint-and-test-toolchain.md) | Build, lint and test toolchain | this doc (test reach) |
| [ADR-015](../../current/adr/ADR-015-release-pipeline-and-supply-chain.md) | Release pipeline | this doc (rollout) |

Trust boundaries:

| Boundary | Crossing | Detail in |
| --- | --- | --- |
| Settings to OS process | CLI path and launch arguments become a spawned command | DES-002 |
| CLI stdout to plugin | NDJSON lines carrying CLI payloads and model content | DES-002 (framing), DES-003 (rendering) |
| Model output to DOM, notes and OS | Markdown rendering, exports, link clicks | [Rendering boundary](#rendering-boundary), DES-003 |
| Vault to Anthropic, through the CLI | Context block, images, whatever the CLI's tools read | DES-003 |
| CLI permission prompt to user | Allow, always allow, deny; plugin-side auto-approve | DES-004 |
| User keystrokes to OS shell | The `!` escape | DES-004 |
| CLI to Obsidian APIs | Vault tools over `mcp_message` | DES-006 |
| Plugin to plugin folder and vault | History, exports | DES-005 |
| Confirmed restore to files the CLI tracks | `rewind_files`, inside or outside the vault | DES-004 |
| Synced `data.json` and stored conversation files to every device | Settings in synced units, stored modes and ids | DES-005, DES-004 |

## Proposed design

### Vocabulary

Kept distinct in code, docs and UI text.

| Word | Means |
| --- | --- |
| conversation | The durable thread: one file under `history/`, shown in a tab while open, resumed, branched, exported. The user-facing unit. One conversation can span several sessions. |
| chat | The panel and the act of using it ("Open chat", "Add selection to chat"). Never one thread. |
| session | The Claude Code session behind a conversation (the id `system/init` reports) and the CLI process serving it; `ClaudeSession` in code. An implementation term, kept out of UI text where another word serves. |
| messages | A tab's on-screen list: prompts, turns (replies, thinking, cards, footers), error blocks. |
| transcript | The exported Markdown note (`TranscriptExporter`, the changes bar's "Transcript" button, the "Transcript folder" setting). Never the on-screen list. |
| tab | An open conversation in the panel (`ChatTab`): its session, messages and composer state. |
| turn | One user prompt through to the CLI's `result` message. Counted per tab. A message sent mid-turn joins the running turn. |
| profile | One way to launch the CLI: path, WSL flag, Chrome and sandbox toggles, extra arguments (`CliProfile`). |
| panel command | A slash command the panel answers itself instead of sending it to the model. |

### Component overview

```text
Obsidian (desktop)
  main.ts                composition root: services, commands, settings
    settings.ts          settings page: the row list, both renderers, the page controller
      state/settings-rows.ts, state/settings-filter.ts, state/section-spy.ts, state/settings-reset.ts   rows as data; search and Modified; the current section; reset plans and their Undo
      state/prompt-color.ts   prompt colors, their root classes, the Custom color check
      confirm-modal.ts     the reset dialogs, beside the confirm and rename dialogs and the image viewer
    view.ts              AgentPanelView: the tab list; mounts src/ui/, owns src/tab/
      session.ts                 one conversation's CLI process lifecycle
        protocol/client.ts       spawn, NDJSON framing, control protocol
          stdio, one JSON object per line
            claude CLI process (cwd = vault root)
      mcp/server.ts, mcp/vault-tools.ts    the obsidian MCP server, fed by mcp_message
    history.ts, export.ts, usage-core.ts   services built by main.ts
      state/session-id.ts, state/session-provenance.ts, state/boundary-records.ts   session-id grammar; which sessions this device recorded; fresh-start and clear records
      state/event-view.ts, state/clear-divider.ts   what an event divider draws; the clear divider
      state/segments.ts   which messages a clear dims and which a segment folds
      state/held-rows.ts, state/held-send.ts, tab/held-sends.ts   the held tray's rows and texts; the send path's held-message decisions; the ordered queue of held sends
      state/stop-operation.ts, state/clear-dialog.ts   Stop and clear: the pure machine; the dialog's counts, title and words (DES-002, DES-003)
      state/clear-operation.ts, tab/clear-flow.ts   the /clear transaction: the pure machine; the flow that feeds it the CLI's messages, exits and timers, and holds a /clear sent mid-turn and the sends behind it (DES-002)
```

```text
AgentPanelView
  +- HistoryStore        --> <plugin dir>/history/<id>.json
  |    +- TranscriptExporter --> Markdown notes in the vault (opt-in)
  +- UsageService        --> the running session's client (get_usage)
  +- McpServer (mcp/)    <-- mcp_message requests, routed from the client
  +- tab/restore-branch  --> the tab's CLI (rewind_files); the CLI writes the files
```

`<plugin dir>` is `manifest.dir`, else `<config dir>/plugins/ai-agent-panel`.

### Layers

| Layer | Modules | Imports from |
| --- | --- | --- |
| 5 Composition | `main` | every layer below |
| 4 Panel UI | `view`, `settings`, `src/tab/*`, `src/ui/*` | layers 1 to 3, `obsidian`; `main` as a type only |
| 3 Obsidian services and widgets | `history`, `export`, `mcp/vault-tools`, `diffview`, `confirm-modal`, `report-view`, `suggest`, `local-store`, `icon`, `context-builder`, `theme-scope`, `fonts` | layers 1 and 2, `obsidian` |
| 2 Process and launch | `session`, `protocol/client`, `cli`, `cli-args`, `bash` | layer 1, Node builtins |
| 1 Pure logic | `src/state/*`, `protocol/types`, `settings-core`, `models`, `commands`, `conversation-list`, `history-core`, `history-file`, `history-notice`, `tabs-layout`, `diff`, `edits`, `tool-labels`, `inert-markdown`, `transcript-markdown`, `restore`, `mcp/server`, `mcp/query`, `timers`, `save-queue`, `mcp/replies`, `usage-core`, `attachments`, `mcp/paths`, `edit-tracker`, `json`, `context-format` | layer 1 |

Layers 1 and 2 never import `obsidian`; their logic is tested in plain Node. The `src/state/`, `src/tab/` and `src/ui/` modules, `context-builder` and `theme-scope` are [ADR-016](../../current/adr/ADR-016-panel-ui-architecture.md)'s; [DES-003](DES-003-panel-ui.md#modules) lists them.

### Components

Module names omit `src/` and `.ts`.

| Module | Layer | One job |
| --- | --- | --- |
| `main` | 5 | Plugin entry: builds the services; registers view, icon, ribbon, commands, file-menu items, hover-link source and settings tab; loads and saves settings; resolves the CLI per profile; persists metadata learned from the CLI; removes the legacy checkpoint folder |
| `view` | 4 | The chat panel, `AgentPanelView`: the tab list and its persistence, the shared `obsidian` MCP server, mounting the panel-level components ([DES-003](DES-003-panel-ui.md#modules)) and the intents that need a service, as listed under [view jobs](#view-jobs); each tab's messages, cards and stream are its `src/tab/` and `src/ui/` modules' |
| `settings` | 4 | Settings page UI ([Settings page](#settings-page)); duration parsing |
| `history` | 3 | Conversation store (one JSON file each) with a metadata cache; picker and delete modals |
| `export` | 3 | Markdown transcript exporter (patterned note names) |
| `mcp/vault-tools` | 3 | The six vault tools on Obsidian APIs |
| `diffview` | 3 | Diff DOM and the modals that list changes: changes this conversation, the restore preview |
| `confirm-modal` | 3 | The panel's dialogs: confirm (delete, reopen in Auto-approve), rename (PRD-001.R7), the reset dialogs (`ResetModal`, PRD-001.R39) and the image viewer (`ImageViewerModal`, PRD-001.R14; DES-003) |
| `report-view` | 3 | Draw a command report as a card |
| `suggest` | 3 | The composer's pickers: `@` file and `/` command autocompletes, the attach picker |
| `local-store` | 3 | Device-local storage reads, typed `unknown` |
| `icon` | 3 | Drawn marks: registers the vendor-neutral icon (a chat bubble with a terminal prompt, `state/agent-icon`) for the ribbon, the view and the agent mark, an icon by the first name the bundled Lucide knows (`drawIcon`), the percentage bar (`meterBar`) |
| `context-builder` | 3 | The context block's inputs from Obsidian: the active note (the last focused Markdown view's file, else the active file) and its selection, the active folder (the file explorer's last clicked folder, reset when a note takes focus, else the note's parent), the note's properties and links from `metadataCache`, the vault paths for `@` mentions; it tells the composer when the note or folder changes or a vault item is renamed ([DES-003](DES-003-panel-ui.md#context-block-and-chips)) |
| `theme-scope` | 3 | The panel's mode: the `is-light` or `is-dark` class on each attached panel root and plugin modal (`themeModal`) from the Theme setting and the main window's mode, and on the settings page's element from the main window's mode alone, with the prompt color class and Custom property on each (`state/prompt-color`), on attach, `css-change` and the plugin's `settings` event, and, as the per-root setup of the panel scope, registers the panel's fonts in each attached root's document (`fonts`); the logic is `state/theme`'s ([ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md)) |
| `fonts` | 3 | The panel's Geist and Geist Mono faces, bundled as `data:` URLs from the two `@fontsource-variable` packages' latin files and registered in each document that shows a panel root: `watchFonts(root)` on attach and window migration (called by `theme-scope`'s `attach`), `disposeFonts(doc)` when a pop-out closes, `disposeAllFonts()` on unload; the logic is `state/fonts`' ([ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md)) |
| `session` | 2 | One conversation's CLI process lifecycle: lazy spawn, resume, respawn for spawn-time options, busy state, fork and rewind-on-start |
| `protocol/client` | 2 | Spawn the CLI, frame NDJSON, run the control protocol in both directions; `cliSpawnSpec` |
| `cli` | 2 | Find the `claude` executable |
| `cli-args` | 2 | A profile's launch arguments and the refusals that guard them |
| `bash` | 2 | The `!` shell escape: invocation shape, run, format |
| `protocol/types` | 1 | Original wire-protocol types; `isCliId`, the id grammar: a session or message id is sent only as a lowercase UUID (ADR-018 Decision 1) |
| `json` | 1 | Shared JSON guards: `isJsonObject`; `asJsonObject`, the object or a fresh empty one |
| `settings-core` | 1 | Settings model, defaults, validation, migration, sync-unit split, profile helpers |
| `models` | 1 | Model picker entries, labels and effort levels learned from the CLI |
| `commands` | 1 | Panel commands: parsing, control reply to report, report Markdown; which messages are sent bare |
| `conversation-list` | 1 | The column's rows from the open tabs and the stored conversations, its sections, sorting, date buckets, title filter, empty-Recent text and unchanged-input key; a conversation's title from its first prompt (also the pin's and the rail's label), a branch's title and the title shown for it |
| `history-core` | 1 | The index's merge at the end of a folder scan, and the journal of saves and deletes made during it (DES-005) |
| `history-file` | 1 | Read-side checks of a stored conversation file: a title and an export path that are not strings read as none; the safe-export-path check; a message that is not an object is dropped and a message field of the wrong type reads as empty or absent (DES-005) |
| `history-notice` | 1 | The save-failure Notice: the once-per-conversation rule and the text (DES-005) |
| `tabs-layout` | 1 | Conversation-column width: the default while none is stored, the drag range, a stored width read back |
| `diff` | 1 | Bounded line and word diff |
| `edits` | 1 | Project Edit, Write and MultiEdit input onto file text; map CLI paths to vault paths |
| `edit-tracker` | 1 | Pre-edit reads of the main agent's and subagents' edits, kept by tool-use id until the result; which results reach the change list; the change list and its counts (DES-004) |
| `tool-labels` | 1 | Name, summarize and icon a tool call: `summarizeToolInput`, `toolDisplayName`, `toolIcon`, `obsidianToolPrompt`, the input preview (`jsonPreview`); a result's count (`resultCount`); read AskUserQuestion's input (`parseAskUserQuestions`) and ExitPlanMode's plan (`planOf`) |
| `inert-markdown` | 1 | Neutralize model Markdown before render, and model Markdown and prompts before export ([Rendering boundary](#rendering-boundary)) |
| `transcript-markdown` | 1 | A conversation as the Markdown note the exporter writes (DES-005) |
| `restore` | 1 | Restore files: which turns offer it, when its button shows, which turn "Restore to before turn N" runs, its result Notice (DES-004) |
| `usage-core` | 1 | Plan-usage service: cache, request floor, failure back-off, the one background timer; reply parsing (DES-007) |
| `attachments` | 1 | Which pasted or dropped payloads the composer takes (`composerFiles`: all files when one is an image, else none) and which images attach (type, size, count); the "Not attached:" Notice, which also names the other files of a payload it took (10 at most, then "and N more"); what a send takes along (`planSend`); `API_IMAGE_MEDIA_TYPES`, which also gates the tool-result images the panel draws |
| `mcp/server` | 1 | In-process MCP JSON-RPC dispatcher |
| `mcp/query` | 1 | The `obsidian_search` query: parse, match, limit |
| `mcp/replies` | 1 | The `obsidian_rename` reply |
| `mcp/paths` | 1 | The `obsidian_rename` target path: its refusals and its normal form |
| `timers` | 1 | Timeouts and intervals on a given window, the main one by default, with a Node fallback for tests; a deadline for a promise |
| `context-format` | 1 | The context block's text from `context-builder`'s inputs: the 8000-character selection cut, the 40-entry lists, an attached item listed once, omission when empty; the message's context label, the paths stored with it and the `@` mentions among them |
| `save-queue` | 1 | Run a save one at a time, coalescing the calls made meanwhile into one more save |

- `npm test` bundles every layer 1 and 2 module (`pretest` in `package.json`) and runs `tests/*.test.mjs` against them, with `tests/fake-cli.mjs` standing in for the CLI.
- `timers` schedules through a window's `setTimeout` and `setInterval`, as Obsidian's plugin guidelines ask: the element's own (`el.win`, ADR-016) where a caller passes it, as `state/ticker` does, else the main window; it falls back to Node's globals under `node --test`.

#### View jobs

`AgentPanelView` orchestrates; each job's logic and wording live in the design named.

| Job | Detail in |
| --- | --- |
| The tab list and its order, switch, close, pin, delete and export; `ui/tab-strip` and `ui/switcher` in the header's nav area in strip layout, `ui/conversation-column` in the shell's column slot in column layout | DES-003 |
| One `context-builder`, which the composer's chips read and each tab's send path (`tab/chat-tab`) asks for the context block; panel commands and the `!` escape are each tab's `tab/panel-commands` and `tab/shell-escape`; the composer and status line are `ui/composer` and `ui/status-line` | DES-003 |
| Holding every tab's session through a launch-settings change; each tab's session is its `tab/session-link` | DES-002 |
| `system/init` and the mode `system/status` reports; `tab/chat-tab` applies the rest of the stream to the messages model, which `ui/turn` draws; a background task's Stop from `ui/run-bar` | DES-003 |
| Markdown rendering (`ui/markdown`), link click and hover (`ui/messages`) | this doc ([Rendering boundary](#rendering-boundary)), DES-003 |
| The model, effort and profile picks from the status line's popovers, which `ui/popover-host` shows | DES-003, DES-002 |
| Each tab's `tab/permission-flow` (permission cards, AskUserQuestion forms); the mode picks from the permission popover | DES-004 |
| `tab/edit-tracker` (pre-edit reads, the change list) and `tab/restore-branch` (Restore files, Branch) per tab; the branch tab | DES-004 |
| History recording (`tab/recorder`) and open-tab persistence | DES-005 |
| The `tabs`, `active`, `history` and `export` events; each tab's state through `tab/chat-tab`; the shared 1 s ticker (`state/ticker`) | DES-003 |
| Owner of the shared `obsidian` MCP server | DES-006 |
| The forced usage refresh after a turn; the usage commands are `tab/panel-commands`', the plan-usage and context segments and plan-usage polling `ui/status-line`'s | DES-007 |

### Runtime wiring

Calls that imports do not show. `main.ts` sets them in `onload`; services reach views only through `plugin.chatViews()` (the leaves of view type `ai-agent-panel-chat`).

| From | To | Purpose |
| --- | --- | --- |
| `history.onChanged` | each view's `onHistoryChanged()` | The view's `history` event: the conversation column redraws from the store's cache |
| `history.onDeleted` | each view's `onConversationDeleted(id)` | Detach every tab showing a deleted conversation (DES-005) |
| `history.onBeforeSave` | `exporter.maybeAutoExport(conversation)` | Regenerate the exported note before each history save |
| `history.onSaveFailed` | `main`: one `Notice` | Names the conversation; one per conversation per session, however many views are open (DES-005) |
| `exporter.onExported` | each view's `onTranscriptExported()` | The view's `export` event, for an open conversation: the changes bar's Transcript button |
| `UsageService` client getter | the first view's `liveUsageClient()` that returns one | Usage through a running session, never a spawn |
| each view's `ui/status-line` | `usage.setSegmentVisible(line, visible)` | Report whether its plan-usage segment can be seen: [DES-007 Scheduling](../../current/design/DES-007-usage-and-cost.md#scheduling) |
| Settings tab `hide()` | `applyLaunchSettings()`, then each view's `onLaunchSettingsChanged()` | Restart sessions whose launch options, vault instructions, vault-tools registration or bypass flag changed (DES-002) |
| Settings rows; `rememberCliModels`, `rememberStartupMode`, `rememberModelResolution` | `applyPanelSettings()`: the plugin's `settings` event | Open panels re-lay out tabs, show or hide the status line's profile and plan-usage segments, relabel its model and mode, re-schedule usage; `theme-scope` re-classes every attached root on a Theme or Prompt color change. A reset or its Undo calls it as an edit does |
| each view's root; each plugin modal's `onOpen`; the settings page's element | `theme.attach(root)`; `themeModal(this)` | The root follows the panel's mode and prompt color until its detach: the view's shell unloading, the modal's `onClose`, the tab's `hide()` |
| `view` | `plugin.resolveCli`, `saveSettings`, `rememberCliModels`, `rememberStartupMode`, `rememberModelResolution`, `cliModelsFor`, `getVaultPath`, `openSettings`; `plugin.history`, `exporter`, `usage`, `cliCommands` | The view's access to services and settings |

### Plugin lifecycle

`AgentPanelPlugin.onload`, in order:

1. `loadSettings`: `loadData` -> `migrateRawSettings` -> defaults -> `mergeLocalSettings` (device-local key, else the legacy key `claude-code:local-settings`) -> `normalizeSettings` (validation included) -> drop learned model resolutions that fail `isCredibleResolution`. `saveSettings` splits by sync unit into `saveData` and `App.saveLocalStorage` (DES-005).
2. Build the services: `ThemeScope` as a child component; `HistoryStore` on `<plugin dir>/history`, `TranscriptExporter`, `UsageService`; wire the callbacks above.
3. Start removing a legacy `<plugin dir>/checkpoints/` folder, without awaiting it; a failure is logged with `console.error` and the next load tries again ([ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md)).
4. Register the icon, the view type `ai-agent-panel-chat`, the hover-link source "AI Agent Panel" (page previews for vault links in replies) and the ribbon icon "Open AI Agent Panel".
5. Register commands and menu items (table below).
6. Add the settings tab.

| Command id | Name | Action |
| --- | --- | --- |
| `open` | Open chat | `activateView` |
| `new-conversation` | New conversation | Activate, then open a new tab |
| `previous-conversations` | Previous conversations | Activate, then open the picker |
| `export-conversation` | Export conversation to Markdown | Activate, then export the active conversation (DES-005) |
| `focus-prompt` | Focus prompt box | `activateView` |
| `stop-turn` | Stop Claude's turn | Stop the active tab's turn (`stopTurn`); offered while it runs (`turnRunning`) |
| `next-tab`, `previous-tab` | Next conversation tab, Previous conversation tab | Reveal, then select the tab after or before the active one in strip order, wrapping (`stepTab`, `state/tabs`); offered with two or more tabs |
| `add-selection` | Add selection to chat | Editor command: Notice "Select some text first." on an empty selection, else activate and append the selection to the composer under its reference line (`noteSelection`, `selectionReference`; DES-003 Context block and chips) |
| file menu, files menu | Add to agent chat | Activate, then attach the file, folder or selection of files as context chips |

- No command has a default hotkey. `panelLeaf` picks the view a command acts on: the focused one, else the first leaf of the view type. `stop-turn`, `next-tab` and `previous-tab` use `checkCallback` (`onPanel`): with no view or nothing to act on they are not offered; run, they reveal the leaf and act.
- `activateView` reuses `panelLeaf`, else takes `workspace.getRightLeaf(false)` and sets its view state; it then reveals the leaf and focuses the composer. With no leaf it shows the Notice PRD-001.R1 names and returns null.
- `resolveCli(profile)` returns the profile's path, or on Windows `claude` for a WSL profile with no path, or the detection result cached per profile id (DES-002).
- Metadata learned from the CLI is persisted by `main.ts`: `cliModels` and `cliStartupModes` per profile, `resolvedModels` per alias (all device-local). The CLI's slash-command list is kept in memory on the plugin object (`cliCommands`), shared by all views.
- `getVaultPath` returns the vault root, or throws "AI Agent Panel requires a vault on the local file system." when the adapter is not a `FileSystemAdapter`; its callers show that text in the tab's messages and start nothing (DES-002, DES-004).
- View lifecycle: `onOpen` mounts `ui/shell`, `ui/hover-card-host`, `ui/announcer`, `ui/popover-host`, `ui/header`, `ui/changes-bar`, `context-builder`, `ui/run-bar`, `ui/composer` and `ui/status-line` as children of the view (the status line subscribes to the usage service and reports its plan-usage segment to it), then the strip and switcher or the column as the shell's layout says, swapping them on its `layout` event, and `ui/jump-rail` while the prompt style is Card and the rail is on, at once on `settings`; it restores device-local layout and the open tabs, and starts the one history folder scan without awaiting it. `onClose` disposes every tab's session and flushes every conversation; unloading stops the ticker. Each tab owns a `Component`, a child of the view and the parent of every `MarkdownRenderer` render for that tab, and its `ui/messages`, also a child of the view; closing the tab unloads both.
- Unload: Obsidian unloads the plugin's views, so `onClose` ends every CLI process; `main.ts` defines no `onunload` of its own.

### Settings page

`AgentPanelSettingTab` describes the page once as `PanelGroup`s of `PanelRow`s ([ADR-019](../../current/adr/ADR-019-settings-page-on-the-declarative-api.md)); both renderers walk that list ([ADR-013](../../current/adr/ADR-013-desktop-only-obsidian-1-8-7-floor.md)):

- A row has a stable `id`, its section, name, description, sync unit, availability (`visible`) and a `build` closure. Every row is a `render` row, so Obsidian 1.13+ indexes it by name and description; `getSettingDefinitions()` gives each group and row its `id`, and `display()` is not called. Before 1.13, `display()` walks the list into `.setting-group` and `.setting-items` elements of our own, so the rules and the page controller are the same on both.
- Availability alone uses `visible`: Run via WSL on Windows, Sandbox where `sandboxAvailable`, a profile's name, heading, "Use for new conversations" and Remove with two or more profiles, "Custom color" while Prompt color is Custom, "Prompt jump rail" with Card, the banner and a profile's notice while a CLI is missing. A change of these calls `refreshDomState()` (1.13+) or redraws (before).
- A structural change (a profile added, removed or made the default, Run via WSL flipped, a Detect that fills a path, a sync badge flipped), always from a click, calls `update()` (1.13+) or redraws (before); the page controller then writes its filter and reset state again and restores current focus or its fallback as ADR-019 specifies. Typing never does, nor do filtering, a reset and its Undo: the page controller redraws the rows they touch through each row's handle, which empties the row's control and runs its `build` again on the same `Setting`.
- Defaults live in `DEFAULT_SETTINGS` (`settings-core.ts`): account default model, CLI default effort, permission mode `default` (Claude Code's own), bypass off, `!` escape on, vault tools on, note context on, conversation tabs Automatic, theme Auto, tooltips on, prompt style Card, prompt color Sand, the pinned prompt and the jump rail on, no vault instructions, export off, plan usage on.

Page, top to bottom (board SettingsTabs, SettingsNarrow):

- The bar: the first group, alone, `position: sticky; top: 0` on an opaque `bg`, spanning the scroller's full width, with a `line` under it. First line: the search field (a visually hidden label "Search settings", placeholder "Search settings", a clear button "Clear search" while it holds text), the Modified chip (a toggle button with `aria-pressed`: a bar mark, "Modified" and the number of modified rows), "Reset all…". Second line: `nav` "Settings sections", six links in section order, each an `<a>` to its heading, the current one `aria-current="location"`; while the search or Modified filters, each shows the number of rows shown in its section, and a link at zero is dimmed. The Claude Code link carries an alert icon while a profile's CLI is missing. Below the page's narrow width (a container query on the tab element), "Modified" and "Reset all…" are visually hidden, leaving the chip's count and Reset all's icon, which then has the tooltip "Reset all settings to default" (`--no-tooltip` otherwise); the links wrap three to a row.
- The banner, its own group, always in the group list and shown (`visible`) while a profile's CLI is missing: an alert icon and "Claude Code was not found <where>, so the <name> profile can't start conversations." with a "Fix it" link that jumps to that profile; <where> is "in WSL", "at <path>" or "on this device".
- The filter line, its own group, always in the group list and shown by the page controller while the search or Modified filters, in `faint` text: with search text, "N settings match “<text>” in M sections. Names, descriptions and values are searched; Esc clears. Show clears the search and scrolls to the setting." (N counting rows that meet both filters); with Modified alone, "N settings differ from their defaults. Each shows its default under the description." (N the chip's total). One reads "1 setting matches" and "1 setting differs from its default. It shows its default under the description."; none, "No settings match “<text>”." without the Show sentence, or "No settings differ from their defaults."
- One group per section, in PRD-001.R39's order. Its first row (`searchable: false`) is the heading: the title (a div with `role="heading"` and `aria-level="2"`, since the lint rule bans an `h2` element; `tabindex="-1"` so a jump can focus it), while the search holds text the number of rows shown in the section, "Reset N" while the search is empty and the section has N modified rows (counting those another row's value hides), the Claude Code section's sync badge (it covers every profile row), and the lead line under it:
  - General: "What a new conversation starts with."
  - Permissions: "Stored on this device by default, so a synced vault cannot loosen them elsewhere."
  - Appearance: "How the panel and its transcript look."
  - Usage: "Plan usage on the status line. Read from the running session; no tokens spent."
  - Export: "A Markdown note per conversation, kept in the vault."
  - Claude Code: "How the panel launches the Claude Code CLI on this device." Its alert icon shows beside the title while a profile's CLI is missing.
- The rows, names and descriptions from the boards (`build/build.py` `ROWS`, `WIN_ROWS`, `wsl_rows`, `ADD_ROW`):
  - General: Model; Default reasoning effort; Include note context by default; Vault instructions (a text area under the row).
  - Permissions: Default permission mode (with a "Details" disclosure listing each mode); Bypass-permissions mode (alert icon); Vault tools for Claude; The composer's "!" shell escape.
  - Appearance: Theme; Conversation tabs; Show tooltips; Prompt style; Prompt color; Custom color (sub-row); Pin the current prompt while scrolling; Prompt jump rail (sub-row). The card pickers and Custom color are DES-003's.
  - Usage: Show plan usage; Refresh interval, Warning threshold, Critical threshold (sub-rows).
  - Export: Export transcripts to Markdown; Folder, Note name pattern, Date format (sub-rows, covered by the first row's badge).
  - Claude Code: each profile under a sub-heading "Profile <name>" (with "default" on the default profile and an alert icon while its CLI is missing): a notice while its CLI is missing ("Claude Code was not found <where>. Install it, or set the path and press Detect."; in WSL "Install it in the distro, or set the path and press Detect."; with one profile, the section's first row), Profile name, Run via WSL, Claude CLI path (with Detect), Claude in Chrome, Sandbox, Additional arguments, Use for new conversations and "Remove the <name> profile"; then "Add a CLI profile" with "Add profile". Profile behavior is DES-002's.
- The support row, the last group (`searchable: false`, so the filters never hide it; an empty sync slot keeps its buttons in line): a pink `heart` before "Support development", the description, and one link per `fundingUrl` entry in `manifest.json`, in its order, named by its key, styled as the "Add profile" button, with a pink `heart` or, for buymeacoffee.com and ko-fi.com, a `coffee` icon (`state/settings-rows` `supportLinks`: a map or one string, `https:` only; the group is hidden with none). Each is an `<a target="_blank">`, which Obsidian hands to the browser; the plugin fetches nothing, and the icons are Obsidian's Lucide set.
- Row anatomy: name and description, then, while Modified is on, "Default: <value>" under the description (on every row shown, one edited back to its default included, so a pick never moves the row's control); on the inline end the reset button while modified, the control, then the sync badge (an empty slot on rows without one, so controls line up). A modified row has a bar on its leading edge (`border-inline-start`, `accent`). The reset button is icon-only: tooltip "Reset to default: <value>", name "Reset <name> to default: <value>". While the search holds text, each shown row ends its text with a "Show" link whose rest, "<name> on the full page", is visually hidden.
- Sub-rows, indented under the row they refine: Prompt jump rail, Refresh interval, Warning threshold, Critical threshold, Folder, Note name pattern, Date format, Custom color. A heading counts as at the bar's bottom within 1 px, so a jump's rounding never leaves the previous link current.
- Layout is logical (`inline`, `block`), so the page mirrors right-to-left. Tokens only; the page's element is a scope root (ADR-017), so it draws in the panel's palette in Obsidian's mode.

The row registry (`state/settings-rows`) describes each row as data for the page model and the reset: its search text (name, description, the value as shown: "On" or "Off", a dropdown's label, a field's text, and for a card picker every card's name with its aliases, Clear's being "outline", "quiet" and "none"), whether it is modified, its default as shown, and its reset patch. Modified and default, by row:

| Rows | Modified when | Default shown |
| --- | --- | --- |
| Model | `model` not empty | Claude Code default |
| Default reasoning effort | `effort` not empty | CLI default |
| Vault instructions | `vaultInstructions` not empty | None |
| Default permission mode | `defaultPermissionMode` not `default` | Claude Code default |
| Each toggle | differs from `DEFAULT_SETTINGS` | On or Off |
| Theme, Conversation tabs, Prompt style, Prompt color | differs from `DEFAULT_SETTINGS` (Prompt color also when Custom: `promptColor` alone counts, and its reset clears `promptCustomColor`) | Auto, Automatic, Card, Sand |
| Refresh interval, Warning threshold, Critical threshold | differs | 5m, 70%, 90% |
| Folder, Note name pattern, Date format | differs | Agent Chats, {date} {title}, YYYY-MM-DD |
| Claude CLI path, Additional arguments | not empty | Auto-detect, None |
| Claude in Chrome, Sandbox | not the CLI default (empty) | Claude Code default |
| Profile name, Run via WSL, Use for new conversations, Custom color, the headings, the banner, Add a CLI profile | never | — |

The page controller (in `settings`, ADR-019) holds the query, the Modified state and each rendered row's handles. On each change it runs the page model (`state/settings-filter`) and applies it in place: hides rows, empty profiles and empty sections with `is-filtered`, wraps matches in `mark` in names, descriptions and card names, writes the counts on the links and headings, the chip's total and each heading's "Reset N", shows or hides "Default:" lines and reset buttons, and remeasures. Escape in the search field clears it. "Show" clears the search, jumps to the row and focuses its control. A jump (`state/section-spy`'s target) sets the tab element's `scrollTop` so the target's top sits under the bar, smoothly unless `prefers-reduced-motion: reduce`, then focuses the heading or control with `preventScroll`. The current section is the last whose heading top is at or above the bar's bottom, else the first; at the scroller's end, the last. It is recomputed on `scroll` (once per animation frame), on resize of the bar or a group, and after every filter change; passive scrolling never moves focus. Input in Obsidian's own settings search, and activating one of its results for this tab, clear the page's filters before the result is scrolled to (ADR-019).

Reset (`state/settings-reset` plans, DES-005 stores):

- A row's reset button resets that row at once.
- A section's "Reset N" and the bar's "Reset all…" open `ResetModal` (`confirm-modal`, `themeModal`): title "Reset <section> to default?" or "Reset all settings to default?"; a line "N setting(s) change." and where they are stored ("It is stored on this device only.", "Both are…", "All are…", or, when any is synced, "Synced ones (cloud) change on every device that syncs this vault."; for everything the line starts "N settings in M sections change."; with no changes, "No settings differ from their defaults.", or "Only the sync choices change." when only "Also reset what syncs" changes something); then the changes, under section names for everything: the sync icon with visually hidden "synced" or "on this device", the row's name (a profile row prefixed "<profile>: " while there are two or more profiles), a "turns on" pill when it switches a capability on, and old → new, a deleted text shown by its first line (at most 60 characters, then "…"). Everything adds "Also reset Claude Code" ("<each Claude Code change>.", or "No Claude Code setting differs from its default.") and "Also reset what syncs" ("Every cloud badge goes back to its default: Claude Code, permissions and vault instructions on this device, the rest synced."), both off; checking one adds its changes to the list and the counts. Buttons: "Cancel", focused, and "Reset N settings" (`mod-cta`; `mod-warning` for everything). Escape, a click outside or Cancel change nothing.
- After any reset: the touched rows redraw; DES-005 saves and applies it (Reset and Undo); once saved, a Notice for 10 s: "<name> reset to default.", "<section> reset to default." or "All settings reset to default.", and an "Undo" button. Undo restores per DES-005 and redraws the rows if the tab is open; its notice closes only once the restore is saved, so a failed save leaves recovery offered.

When a change applies:

| Setting | Reaches |
| --- | --- |
| Tab position, theme, the prompt settings (prompt color included), usage settings, the profile list | Open panels at once |
| Profile launch options, vault instructions, vault tools, bypass | Open conversations when the settings tab closes: each session whose launch config changed restarts after its turn, resuming the same Claude Code session (DES-002) |
| Model, Default reasoning effort, Include note context, Default permission mode | Tabs opened afterwards |
| `!` escape, export settings | The next message or export in every conversation |

A reset and its Undo reach the same places as the edits they make. The CLI profile rows are in DES-002; sync badges, reset storage and Undo in DES-005; the card pickers and prompt previews in DES-003.

### Rendering boundary

Model text (replies, thinking, subagent text, the ExitPlanMode plan, report cards built from CLI replies) reaches the DOM only as text nodes or through `ui/markdown`'s `renderMarkdown`, and reaches a note only through the exporter. Both pass it through `inert-markdown` first ([ADR-010](../../current/adr/ADR-010-render-model-output-with-markdownrenderer.md)).

Where the module's reading of the Markdown could differ from the renderer's, it cuts more: a wrong guess costs formatting, not inertness.

Before `MarkdownRenderer.render`:

1. Every fence and every display-math block (`$$`) is found line by line, inside blockquotes and list items too, cut out, and replaced by a placeholder in a block of its own (no blank lines around it inside a list item, which would loosen the list); no fence reaches the renderer in place. A block whose container ends first is cut where the container ends.
2. Every CommonMark code span and every inline math span (Obsidian's `$…$` and `$$…$$` rules, `$…$` kept to one line) is cut out and replaced by a placeholder, the earlier start winning. A backtick or `$` that opens nothing, and a run of three tildes, is backslash-escaped, so the renderer cannot form code or math the cut did not see. Math holding a MathJax command that sets CSS, attributes or links, or loads code (`\style`, `\bbox`, `\class`, `\cssId`, `\data`, `\href`, `\require`, `\mmlToken`, `\unicode`, `\fcolorbox`, `\setOptions`), is cut as code instead: MathJax's style filter keeps `cursor`, so `cursor: url(…)` fetches, and `\fcolorbox` writes its colour into a style string. Colours set through `\color` and `\colorbox` reach CSS as single properties, where `url()` is invalid.
3. Every image becomes a placeholder for its alt text and URL unless it is an inline `![…](…)` on one line or an Obsidian embed (`![[target]]` on one line, the target non-empty and free of brackets) whose source is a plain vault path: no scheme, no leading `//`, and none of ``: \ < > & ! [ ] ` $ ~``, which could hide a scheme or be rewritten by a later step; the source's percent-decoded form passes the same test, since the renderer may decode it, and a source that does not decode is no vault path. Any other `![[` is read as `![` and an image, as the renderer reads it. A reference-style image always becomes text, since its definition can sit anywhere the renderer looks. An image whose text does not close gets its `!` escaped. Only spaces make a line blank: the renderer continues a paragraph over a whitespace line holding a tab.
4. Every raw HTML tag shows as literal text (`<` written `&lt;`) unless it is an attribute-free inline formatting tag in running text: `br`, `b`, `i`, `u`, `s`, `em`, `strong`, `sub`, `sup`, `kbd`, `mark`, `small`, `del`, `ins`. Such a tag alone on its line shows as text too, since it would open an HTML block. Autolinks stay unless they hold a quote or `=`, and an email autolink only when its local part has no `/` either: inside raw HTML those would become attributes. Angle-bracket link targets lose their brackets, percent-encoded, so the escape cannot break them.
5. `%%` is escaped, so no comment forms: its closer starts a block mid-line, where no line-start escape reaches. A line-start `$$` that step 1 did not read as block math is escaped too.
6. At a line start, after indentation, quote markers, list markers of any length, a task box holding any character, a footnote label or a callout marker (Obsidian parses a callout title as blocks):
   - a `=` or `$=` gets a backslash, so indented code cannot start with a Dataview query; `==` (a highlight, a setext underline) stays, since no query starts with it;
   - a `[` is escaped when no `]` follows it in the text, or when it opens a definition that could continue below its line (no destination, an unclosed `<…>` or an unclosed title): the renderer reads a definition's label, destination and title across blank lines;
   - it is escaped too when it opens a definition whose destination is not a plain vault path (step 3), footnotes aside: emphasis or a highlight that opens before a kept image and closes inside it (`*![r](x*)`, `==![r](x==)`, `*![r](x "t*")`) splits it, and the renderer reads `![r]` as a reference image. A reference-style link to a web address shows as text. Only a line the renderer reads as a definition counts: quote markers (a callout marker only after one), list markers (a task box only after one) and footnote labels, each after at most three spaces, and at most three before the `[`; below a list item or footnote any indentation counts, since a continued item holds definitions indented four or more. Indented code elsewhere stays as written. A definition whose destination is on the next line is escaped by the rule above, a vault path too, so that definition shows as text.
7. Link targets containing spaces are percent-encoded.
8. No two colons meet: where they would, the second becomes a placeholder, one per spelling, so reference labels and footnotes that matched still match. Colons are read as Markdown decodes them (`:`, a backslash escape, an entity, numeric ones without `;`) and as an image's alt and a link's title end up, which Obsidian unescapes and decodes (`\&colon;` becomes `:` there). The scan reads one decoding further than that (`&amp;colon;`, which decodes once, to `&colon;`, counts as a colon too): it costs a placeholder. Dataview reads `[key:: value]` and `(key:: value)` from the HTML of rendered paragraphs, headings, list items, spans and table cells, attributes included, and renders the value again as Markdown, so text the cut left inert would render live. `MarkdownRenderer.render` waits for post processors, Dataview's included, so step 9 restores the colon after Dataview has read the text. Ordinary text (`std::vector`, `fe80::1`, `:smile::wink:`) and links (`https://[fe80::1]/`) show and work as written. Code, math and fences are placeholders already. An allowlisted fence rendered alone keeps its `::`: it is `pre > code`, which Dataview does not read, and Dataview collects its elements before highlighting adds spans.
9. After rendering, `ui/markdown` replaces each placeholder: `code` for a span, `pre` and `code` for a fence, `renderMath` output for math, a text node for an image, each built with `createEl` or Obsidian's math API and holding the original text, so no code-block processor or post processor of another plugin sees it. An allowlisted fence whose text does not start with `=` or `$=`, and whose opener the renderer certainly reads as one (no list marker on its line, at most three spaces in), is instead rendered alone through `MarkdownRenderer` from a fence the module built: its language and text, under a backtick run longer than any inside, so only its own closer ends it; a fence that fails to render falls back to plain code. MathJax output loses any style that would fetch (`url()`, the image functions) and any source attribute before it is attached, which holds if step 2 misses a command. A placeholder inside rendered code comes back as the Markdown it replaced; one in an `alt`, `title`, `aria-label` or `data-heading` attribute comes back as the text it stands for. A colon placeholder comes back in every attribute (a link's `href`, a footnote's id); adding a colon after the first cannot change a URL's scheme.

A placeholder is a token of 12 random letters and digits (about 62 bits), drawn again while the input contains it, plus an index: no input holds one, model text cannot predict one, and the renderer parses none.

Before export (DES-005), the same cut writes Markdown instead of elements:

- A fence becomes one the module built, unindented after a blank line, under its language when allowlisted and `text` otherwise; a leading `=` or `$=` in it gets a backslash, shown literally; a list marker on the opener line stays as a line above it. A display-math block becomes a `text` fence holding its TeX, since no check runs on MathJax output in a note.
- Tool results and `!` output (DES-005) become a fence built the same way, with no language unless its first line reads as a query (`text` then): no line inside closes it, a lone carriage return becomes a newline (the exporter quotes it line by line), and a leading `=` or `$=` gets a backslash, as Dataview runs any `pre > code` that starts with one. Being code, they get no other rule of this section; the note-wide breaks below apply to them as to the rest of the note.
- A code span becomes its text between escaped backticks, with Markdown punctuation backslash-escaped and `<`, `>` and `&` as entities; an image cut in step 3 and inline math become their text the same way: a `$` written as-is could pair with another than the cut did and open math over text a later step escaped.
- Steps 2 to 6 apply unchanged, so nothing before a built fence or math block can open a block that closes inside it.
- Instead of step 8, the exporter breaks every `::` in the whole note, and every Templater `<%` (DES-005).

The fence allowlist is a constant in `inert-markdown`; a fence on it renders through `MarkdownRenderer` alone (step 9). It holds display languages only, matched on the first word of the info string, lower-cased: `text`, `txt`, `plain`, `markdown`, `md`, `json`, `yaml`, `yml`, `toml`, `ini`, `xml`, `html`, `css`, `scss`, `javascript`, `js`, `typescript`, `ts`, `jsx`, `tsx`, `python`, `py`, `bash`, `sh`, `shell`, `zsh`, `powershell`, `diff`, `sql`, `rust`, `go`, `java`, `kotlin`, `swift`, `c`, `cpp`, `csharp`, `ruby`, `php`, `lua`. Never on it: a language a known plugin executes or renders (`dataview`, `dataviewjs`, `mermaid`, `tasks`, `chart`, `tracker`, `run-*`, `js-engine`, `meta-bind`, `templater`) or an empty info string whose first line starts with `=`, `$=`, `TABLE`, `LIST`, `TASK` or `CALENDAR`. A plugin that acts on a listed language (a run button on `python`, for instance) is the stated residual.

A click on a link that is not a vault link is cancelled with `preventDefault`; only `http`, `https`, `mailto` and `obsidian` URLs then go to `window.open`, and a `file:` link or any other scheme opens nothing (DES-003 owns the handler).

Residual: a plugin post processor that reads arbitrary DOM still sees the rendered text outside code.

### Requirement ownership

| Requirements | Design doc | Components |
| --- | --- | --- |
| PRD-001.R1, R25, R26, R27, R39 | DES-001 | `main`, `settings`, `state/settings-rows`, `state/settings-filter`, `state/section-spy`, `state/settings-reset`, `confirm-modal` (`ResetModal`), `icon`, `local-store`, `timers`, `manifest.json` |
| PRD-001.R2 to R6 | DES-002 | `protocol/client`, `protocol/types`, `session`, `cli`, `cli-args`, `main` (`resolveCli`), `settings-core` (profiles, `profilePick`), `settings` (profile rows), `tab/session-link` |
| PRD-001.R7 to R23, R28 to R35 | DES-003 | `view`, `src/state/*`, `src/tab/*`, `src/ui/*`, `conversation-list`, `tabs-layout`, `suggest`, `commands`, `attachments`, `context-builder`, `context-format`, `report-view`, `models`, `tool-labels`, `inert-markdown`, `theme-scope`, `styles.css` |
| PRD-001.R24 | DES-005 | `settings-core` (`settingsFromStores`, `splitSettings`), `save-queue`, `main` (`loadSettings`, `saveSettings`), `local-store`, `settings` (sync badge) |
| PRD-002 | DES-004 | `tab/permission-flow`, `state/permission`, `ui/permission-card`, `ui/question-form`, `ui/turn` (edit diffs on cards and step rows), `state/step-groups` (an edit's `+x -y`), `view` (mode control, the branch tab), `tab/edit-tracker`, `tab/restore-branch`, `tab/shell-escape`, `ui/shell-card`, `restore`, `edits`, `edit-tracker`, `diff`, `diffview`, `confirm-modal`, `bash`, `settings-core` (`cliPermissionMode`, `permissionDecision`, `allowResult`, `allowAfterRead`, `reopenMode`, default-mode validation), `timers` (`withDeadline`); `rewind_files`, fork and rewind, leaving Bypass on the session side in DES-002 |
| PRD-003 | DES-005 | `history`, `history-core`, `history-file`, `history-notice`, `export`, `transcript-markdown`, `inert-markdown`, `settings-core` (`isSafeArgValue`, `dropUnsafeArgValues`, `migrateStoredModel`, `reopenPicks`), `tab/recorder` (recording), `view` (restore, open-tab state) |
| PRD-004 | DES-006 | `mcp/server`, `mcp/query`, `mcp/replies`, `mcp/paths`, `mcp/vault-tools`, `tool-labels` (card titles), `view` (`mcpServer`); `mcp_message` transport in DES-002 |
| PRD-005 | DES-007 | `usage-core`, `state/usage-segment`, `state/status-line` (context segment, polling visibility), `state/turn-cost`, `tab/chat-tab` (a turn's cost and tokens), `ui/turn` (the footer's cost and hover card), `tab/panel-commands` (usage commands), `report-view` (usage cards), `view` (the refresh after a turn), `ui/status-line` (plan-usage and context segments, polling), `ui/hover-card-host`, `ui/popovers/plan-usage`, `ui/popovers/context`, `commands` (`costReport`, `conversationCost`), `transcript-markdown` (`cost_usd`); `get_usage` and `get_context_usage` transport in DES-002 |

## Architecture rules

The Check column names what checks each rule: `tests/architecture.test.mjs` ([ADR-016](../../current/adr/ADR-016-panel-ui-architecture.md)) or `npm run lint`. DES-002, DES-004, DES-005, DES-006 and DES-007 add rules for their own modules.

| # | Rule | Check |
| --- | --- | --- |
| A1 | No runtime import cycles; `main` is imported only as a type | architecture test (U7) |
| A2 | Layer 1 and 2 modules never import `obsidian` or `electron` | architecture test |
| A3 | A module imports only from its own layer or a lower one, the type-only imports of `main` in A1 excepted | architecture test |
| A4 | Only `main` imports `view` | architecture test (U4) |
| A5 | `protocol/*` imports only `protocol/*`, `timers`, `json` and `node:child_process` | architecture test |
| A6 | `session` imports only `protocol/*` | architecture test |
| A7 | `mcp/server`, `mcp/query`, `mcp/replies` and `mcp/paths` import nothing; `mcp/vault-tools` imports only `mcp/*` and `obsidian` | architecture test |
| A8 | `node:child_process` is imported only by `protocol/client`, `bash` and `cli`; `node:fs`, `node:os`, `node:path` only by `cli` | architecture test |
| A9 | No network API anywhere in `src/`: `node:http`, `node:https`, `node:net`, `node:tls`, `node:dgram`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, Obsidian's `requestUrl`, `request`, `ajax` and `ajaxPromise`, Electron's `net` | architecture test (U6) |
| A10 | No `innerHTML`, `outerHTML`, `eval` or `Function` in `src/` | `npm run lint` |
| A11 | `package.json`'s `dependencies` are the admitted ones, keyed by ADR in the architecture test (ADR-017: `@fontsource-variable/geist` and `geist-mono` 5.3.0); the bundle's externals are the Obsidian-provided modules and Node builtins; the only package inputs are the two latin `.woff2` files, imported by `fonts` | architecture test |
| A12 | Every module that does not import `obsidian` is built into the `pretest` bundle, as an entry point or through one | architecture test |
| A13 | `MarkdownRenderer` is called only from `ui/markdown`'s `renderMarkdown`, which takes its input from `inert-markdown`; `transcript-markdown` writes model text only through `inert-markdown` | architecture test (U5); review for `transcript-markdown` |

## Data and security

Data at rest:

| Store | Location | Holds | Carried by | Detail in |
| --- | --- | --- | --- | --- |
| Synced settings | `<plugin dir>/data.json` | Settings in units this device leaves synced | Obsidian Sync, folder sync | DES-005 |
| Device-local settings | `App.saveLocalStorage`, key `ai-agent-panel:local-settings` | `localGroups`; by default the `cli`, `permissionMode`, `bypass`, `instructions`, `bash` and `obsidianMcp` units; learned model lists, alias resolutions, startup modes | nothing | DES-005 |
| Layout state | keys `ai-agent-panel:open-tabs`, `:side-width`, `:side-sections` | Conversation ids, a width, section keys | nothing | DES-003 |
| History | `<plugin dir>/history/<id>.json` | Conversation text, tool inputs, truncated tool results, the conversation's profile id | folder sync only | DES-005 |
| Exports | a vault folder, default `Agent Chats` | Markdown transcripts, neutralized | as notes | DES-005 |
| Claude Code's session files | `~/.claude/projects`, owned by the CLI | not read by the plugin | - | used only through `--resume` (DES-002) |
| Claude Code's file checkpoints | `~/.claude/file-history/<session>/` (inside the distro for a WSL profile), owned by the CLI | Pre-edit copies of files the CLI's edit tools wrote | - | rewound only through `rewind_files` after confirmation (DES-004) |

System-wide properties:

- Network: none. All traffic is the CLI's (rule A9).
- Credentials: none read, stored or requested. The child process inherits Obsidian's environment, so an `ANTHROPIC_API_KEY` there reaches the CLI.
- Telemetry: none. Logging is `console.error` only.
- Process creation: the CLI (`protocol/client`), the `!` escape (`bash`), and `which`, `where` and a WSL probe (`cli`). Nothing else spawns.
- Files outside the vault: `cli.ts` checks composed install paths with `existsSync`; the plugin writes nothing there. A confirmed restore asks the CLI to rewind the files its checkpoints track, inside or outside the vault (DES-004).
- DOM: text nodes and `MarkdownRenderer` behind the [Rendering boundary](#rendering-boundary); no `innerHTML`, `outerHTML`, `eval` or `Function` (rule A10).
- OS hand-off: one `window.open` call, in `ui/messages`, for a user's click on an `http`, `https`, `mailto` or `obsidian` link; the clipboard is written only by `ui/copy`'s copy buttons and never read.
- Stored and synced values are validated before they can widen what the plugin does: ids and paths (DES-005), the permission mode (DES-004), profiles (DES-002).
- Private Obsidian API: `openSettings` calls the untyped `app.setting.open()` and `openTabById()`.
- User-facing residuals are in [SECURITY.md](../../current/SECURITY.md); decision-level risks in the ADRs above.

## Rollout and rollback

- Distribution: the release assets `main.js`, `manifest.json` and `styles.css` per tag ([ADR-015](../../current/adr/ADR-015-release-pipeline-and-supply-chain.md)). `versions.json` maps 0.3.4 and later to Obsidian 1.8.7, earlier versions to 1.5.0.
- Compatibility at load: usage interval in minutes becomes seconds; a flat `cliPath` and `useWsl` become one profile on a device whose CLI profiles sync (elsewhere, like any profile, they are not seeded); the legacy device-local key is read when the current one is empty; pre-release coarse sync-group keys map to per-row units; `localGroups` moves from `data.json` to the device (DES-005); a legacy `checkpoints/` folder is removed. History files use version 1, or 2 while fresh-start or clear records exist; DES-005 owns format compatibility.
- Feature switches are settings: vault tools, `!` escape, bypass mode, export, plan usage, tab position. There are no remote flags.
- Observability: error blocks in the tab, Notices, the CLI's stderr tail on a failed exit, `console.error` from the history store, exporter and legacy-folder removal. Nothing leaves the machine.
- Rollback: install an earlier release's three assets. Settings migration is one-way: the flat `cliPath` and `useWsl` keys are deleted on load, so a return to 0.3.x loses a configured CLI path (auto-detection still applies); an earlier release reads no `localGroups` from `data.json` and so treats the security units as synced with their defaults. Turns recorded before the switch to the CLI's checkpoints offer no restore after it.

## Alternatives

Decisions and their alternatives are in ADR-001 to ADR-015. Design-level choices they do not cover:

- Tool naming and summaries in `view` against a pure `tool-labels` module: the module, because `export` needs `summarizeToolInput` and may not import `view` (A4), and card titles are then testable in plain Node.
- Neutralizing model Markdown in each caller against one `inert-markdown` module: one module, so the panel, the plan card and the exporter cannot drift (A13).
- The reset dialog and the image viewer in `confirm-modal` against a new `ui/` module: `confirm-modal`, since a `ui/` module may not import `theme-scope` (U2) and every modal calls `themeModal` (U5).
- A row's sync choice shown by its badge alone against a " (not synced)" suffix on its name as well: the badge alone, as the boards draw it; its icon differs in shape and its tooltip says where the row is stored. A badge flip then changes no name, so it redraws the badge, not the page.
- Undo held by the notice in memory against stored: memory, since an Undo offered after a reload would restore values the user has since seen and kept.

## Verification

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| PRD-001.R1 | - | Ribbon, commands, file-menu items, the no-leaf Notice, in a desktop vault |
| PRD-001.R25 | `tests/settings-core.test.mjs` "a fresh install gets one auto-detect profile" (defaults), "PRD-001.R25: the theme defaults to Auto and syncs by default" | The page on Obsidian 1.13+ and below; each row of the "When a change applies" table |
| PRD-001.R39 | `tests/state-settings-rows.test.mjs` (modified, defaults, search text, identity rows never modified); `tests/state-settings-filter.test.mjs` (search, Modified, both, marks, counts, empty sections and profiles); `tests/state-section-spy.test.mjs` (current section at top, middle, end, after filtering; jump targets under the bar); `tests/state-settings-reset.test.mjs` (DES-005) | The mock-fidelity harness against the boards at 460 and 720 px, dark and light; on Obsidian 1.13.4, 1.14.4 and before 1.13, light and dark, 460 and 720 px, right-to-left: ADR-019's checks, the jumps and focus, reduced motion, each reset with Undo, the reset dialogs, a missing CLI, keyboard and a screen reader on the bar and links |
| PRD-001.R26 | `tests/protocol.test.mjs`: "cliSpawnSpec runs .cmd shims through the shell with quoting", "cliSpawnSpec spawns .exe and posix binaries directly", "cliSpawnSpec runs WSL through --exec with the args out of any shell's reach" | One conversation per platform and launch shape; the WSL toggle's visibility; a non-local vault message |
| PRD-001.R27 | - | Source inspection for network, credential and clipboard-read APIs, recorded in `docs/records/verification/` |
| Rendering boundary | `tests/inert-markdown.test.mjs`: code, fences and math become placeholders and come back as inert text; images become text unless plainly from the vault; the line-start, HTML and export forms; colons never meet; seeded property tests for render and export | A reply with a `dataview` and `dataviewjs` fence, inline `=` code, a remote image and a `(key:: …)` field, with Dataview enabled: nothing runs, nothing loads, no field shows |
| Rules A1 to A13 | The Check column's checks | Review, for a rule its check does not run yet |

Independent verification boundary: CI on the pull request, outside the implementing agent's control: `make verify` (type-check and build, docs gate, lint, `npm test`), then `npm audit --omit=dev`. Its tests reach the layer 1 and 2 modules. Everything that imports `obsidian` is verified by a person in a desktop vault.

## Open questions

- The split of `main`, `history` and `settings`, each of which mixes two or three jobs, stays open; no design here depends on it. `view.ts` is decomposed by [ADR-016](../../current/adr/ADR-016-panel-ui-architecture.md).
