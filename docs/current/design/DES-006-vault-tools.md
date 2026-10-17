# DES-006 — Vault tools

**Status:** accepted (2026-10-10)

## Requirements

Designs [PRD-004](../../current/product/PRD-004-vault-tools.md), R1 to R10.

| ID | Capability | Section below |
| --- | --- | --- |
| PRD-004.R1 | Availability | Availability, Transport, CLI version floor |
| PRD-004.R2 | MCP protocol | Transport, Dispatcher |
| PRD-004.R3 | Arguments | Shared argument rules |
| PRD-004.R4 | Links and backlinks | Tool contract |
| PRD-004.R5 | Metadata search | Tool contract, Query language |
| PRD-004.R6 | Properties | Tool contract |
| PRD-004.R7 | Rename without breaking links | Tool contract |
| PRD-004.R8 | Active note | Tool contract |
| PRD-004.R9 | Open a note | Tool contract |
| PRD-004.R10 | Consent | Consent |

Manual verification obligations, in a desktop vault against Claude Code 2.1.210 or newer, and once against an older CLI:

- R1: the tools appear with the setting on and are absent with it off; switching the setting reaches an open conversation when settings close; no port, `.mcp.json` or process appears; an older CLI shows the Notice once.
- R3 to R9: one call per tool, including path resolution by name, an ambiguous name, a rename into a new folder, each refused rename target, a property patch with a null value, `obsidian_active` while the panel has focus, asked at once after the panel opens with a note active, after the last-focused note is closed, and after its tab is switched to a PDF, and each documented error.
- R10: a permission card precedes every call in "Ask before acting", with the sentence title naming the note in `path`.

## Context and constraints

- Fixed by ADRs: vault tools as an in-process MCP server on the CLI pipe ([ADR-004](../../current/adr/ADR-004-vault-tools-as-in-process-mcp-server.md)), consent decided by the CLI ([ADR-002](../../current/adr/ADR-002-permission-prompts-cli-decides-panel-asks.md)), a hand-written dispatcher instead of an MCP library ([ADR-004](../../current/adr/ADR-004-vault-tools-as-in-process-mcp-server.md)).
- The constitution forbids a port, a config file or a process of the plugin's own; the server exists only as a handler for control requests on the stdio pipe the plugin already owns.
- The tools run inside Obsidian with the plugin's full access to the vault. Every argument is chosen by the model.
- Component map: [DES-001](../../current/design/DES-001-system-overview.md). The control-request transport that carries `mcp_message`, the `initialize` handshake and `system/init`: [DES-002](../../current/design/DES-002-cli-client-and-session-lifecycle.md). Activity cards for tool calls: [DES-003](DES-003-panel-ui.md). Permission cards and modes: [DES-004](../../current/design/DES-004-permission-and-change-control.md).

| Module | Job | Imports `obsidian` |
| --- | --- | --- |
| `protocol/client` | Registers server names on `initialize`; routes `mcp_message` to a callback and wraps the reply | no |
| `mcp/server` | JSON-RPC dispatcher `McpServer`; `textResult`, `errorResult`, `requireString`, `optionalNumber` | no |
| `mcp/query` | The `obsidian_search` query: `parseQuery`, `matchesQuery`, `searchLimit` | no |
| `mcp/replies` | `renameReply`: the `obsidian_rename` reply | no |
| `mcp/paths` | `renameTargetError`, `renameTargetPath`: the `obsidian_rename` target path, its refusals and its normal form | no |
| `mcp/vault-tools` | `createVaultTools(app, lastEditor)`: the six tools on Obsidian APIs | yes |
| `tool-labels` | `obsidianToolPrompt`: the card sentence per tool | no |
| `view` | Owns the server instance; checks the server name; shows the missing-server Notice | yes |

## Proposed design

### Availability

- Setting `enableObsidianMcp`, "Vault tools for Claude", on by default, in the `obsidianMcp` sync unit (device-local by default; [DES-005](../../current/design/DES-005-persistence-and-sync.md)).
- `createSession` reads it and sets `sdkMcpServers: ["obsidian"]`, or leaves the field out. A change reaches open conversations when the settings tab closes: their sessions restart after the current turn with the new registration (DES-002).
- Off means "not registered": the `mcp_message` handler stays wired for every session, and the CLI sends nothing to an unregistered server.
- The `/mcp` card offers no buttons for this server and `/mcp ... all` skips it (DES-003); the setting is its switch.

### Transport

1. `ClaudeClient.start` puts `sdkMcpServers` on the `initialize` control request; with none configured the field is absent.
2. Claude Code runs an MCP client against each registered name. Each JSON-RPC message arrives as `control_request` with `subtype: "mcp_message"`, `server_name` and `message`.
3. `ClaudeClient.handleMcpMessage` calls the `onMcpMessage` callback, which `ClaudeSession` forwards to `AgentPanelView.handleMcpMessage`.
4. The view rejects a server name other than `obsidian` (`Unknown in-process MCP server: <name>`), then calls `McpServer.handle(message)` (Dispatcher).
5. The client answers with `control_response`, `subtype: "success"` and `{mcp_response: <reply or null>}`. A throw from step 3 or 4 becomes `subtype: "error"` with its message. With no callback registered the answer is the error "No in-process MCP server is registered".

Properties of this transport:

- Strictly request and response: `mcp_response` must be the reply to exactly that message, and a notification gets an explicit `null`. The server cannot send anything on its own.
- One `McpServer` per panel view, created at the first message and shared by every tab; its tools act on the one workspace.
- The plugin sets no timeout on a tool handler.
- Nothing is persisted, and no port, config file, process or credential is involved.

### Dispatcher

`McpServer.handle(message)` in `src/mcp/server.ts`:

| Message | Reply |
| --- | --- |
| Not a JSON object (null, an array, a primitive) | Throws "mcp_message carried no JSON-RPC message"; no reply |
| No `id` member (any method) | `null`. An `id` of 0 or null is a real id. |
| `initialize` | `protocolVersion`: the client's when it is a string, else `2025-06-18`; `capabilities: {tools: {}}`; `serverInfo: {name: "obsidian", version: <plugin version>}`; `instructions` |
| `ping` | `{}` |
| `tools/list` | `{tools: [{name, description, inputSchema}]}` |
| `tools/call` | The handler's result |
| Any other method | Error -32601 `Method not found: <method>` |

`tools/call` details:

- `params.name` not a string: error -32602 "tools/call: name must be a string".
- Unknown tool: error -32601 `Unknown tool: <name>`.
- `params.arguments` that is not a plain object is replaced by `{}`.
- A handler that throws becomes a tool result, not a protocol error: `{content: [{type: "text", text: "<tool> failed: <message>"}], isError: true}`, so the model can read it.

Only `tools` is advertised; a `resources/list` or `prompts/list` request gets -32601. The `instructions` text tells Claude to use these tools for anything that depends on the link graph or metadata index, and Read and Grep for file contents. A tool result is `{content: [{type: "text", text}], isError?}`.

### Shared argument rules

- `requireString(args, key)`: a missing, blank or non-string value returns the tool error `"<key>" is required and must be a non-empty string.`; the value is trimmed.
- `resolveFile(app, raw)`: `normalizePath(raw)`, then in order:
  1. The exact vault path.
  2. The path with `.md` appended.
  3. The text as a link: `getLinkpath` drops a `#heading` or `^block` part, then `metadataCache.getFirstLinkpathDest`. When the text has no folder and several files carry that name, the call is refused with the candidates' paths (PRD-004.R3) instead of taking Obsidian's pick.
- `requireNote(file)`: `obsidian_properties` and `obsidian_links` refuse a resolved file whose extension is not `md` with an error naming the file and change nothing (PRD-004.R4, R6).
- No match returns the tool error `No note found at "<raw>". Paths are vault-relative (e.g. "notes/Ideas.md"); a name without a folder works too if it is unambiguous.`

### Tool contract

The CLI exposes each tool to the model as `mcp__obsidian__<name>`.

| Tool | Arguments | Effect | Obsidian API |
| --- | --- | --- | --- |
| `obsidian_links` | `path` | Read | `metadataCache.getFileCache`, `getLinkpath`, `getFirstLinkpathDest`, `resolvedLinks`, `unresolvedLinks` |
| `obsidian_search` | `query`, `limit?` | Read | `vault.getMarkdownFiles`, `metadataCache.getFileCache` |
| `obsidian_properties` | `path`, `patch?` | Read without `patch`; writes frontmatter with it | `metadataCache.getFileCache`, `fileManager.processFrontMatter` |
| `obsidian_rename` | `path`, `newPath` | Writes: moves the file, may create a folder | `vault.createFolder`, `fileManager.renameFile` |
| `obsidian_active` | none | Read | the view's last focused `MarkdownView`, `workspace.getLeavesOfType`, `getMostRecentLeaf`, `getActiveFile` |
| `obsidian_open` | `path`, `newPane?` | Changes the user's window | `workspace.getLeaf`, `leaf.openFile` |

`obsidian_links`:

- Sections, in order: "Outgoing links" (body and frontmatter links that resolve, subpaths dropped before resolving), "Embeds", "Backlinks" (every other note whose resolved links include this file), "Unresolved links" (links and embeds that do not resolve, plus the index's own unresolved entries for the file).
- Each section shows its count, sorted entries, "(none)" when empty, and at most 500 entries followed by a line counting the rest.

`obsidian_search`:

- Builds one fact record per Markdown note (path, name, tags, headings, properties) and keeps the notes that match every term.
- Reply: the match count, a note for any unknown field, then matches sorted by path. Each line carries the note's tags and up to 6 non-empty properties, lower-cased as matched.
- `limit`: a finite number is truncated to a whole number and clamped to 1 to 200 (`searchLimit`); anything else gives 50. A trailing line `… N more (raise limit to see them)` counts the notes left out.
- A query with no usable term returns the tool error "That query had nothing to match on. Try tag:, heading:, prop:, folder:, path:, or a bare word."

`obsidian_properties`:

- Without `patch` (or with `null`): `<path> properties:` and the frontmatter from the metadata cache as indented JSON, or `<path> has no frontmatter properties.`
- With an object `patch`: inside `processFrontMatter`, a key whose value is `null` is deleted and every other key is set; the body outside the frontmatter block is left byte-identical. The reply is `<path>: set <keys>; removed <keys>.` with only the non-empty parts, or `<path>: nothing to change.`
- A `patch` that is an array or not an object returns the tool error `"patch" must be an object of property names to values.`

`obsidian_rename`:

1. `renameTargetError(newPath, configDir)` runs first, on `newPath` as given, before `normalizePath` and any file call. It refuses with a tool error a `newPath` that starts with `/` or `\`, starts with a drive letter (`X:`), has a `..` segment, or has no segment but `.` (the vault root); segments split on `/` and `\`.
2. It also refuses a `newPath` that equals or lies under the vault's config folder (`vault.configDir`), with the error naming the config folder; the check holds for a name with no leading dot. Everything else hidden gets a second error: any segment, the file name included, that starts with `.` (`.claude/settings.local.json`, `.git/hooks/pre-commit`, `.mcp.json`, `notes/.env`), or any segment, at any depth and the file name included, named like a Windows 8.3 short name (`CLAUDE~1/x.md`, `projects/app/GIT~1/hooks/pre-commit`, `MCP~1.JSO`, which on NTFS is `.mcp.json`; the config folder's own short name `OBSIDI~1/x.md` gets this error, not the config-folder one; `Draft~1.md` is refused with them, while `Meeting~1.md`, seven characters before the tilde, is no short name and passes). Claude Code, Git and other tools run or read what they find in such a folder or file, and Obsidian indexes none of it, so a note moved there leaves the vault view; the vault index lists no short name, so the "already exists" check below cannot see the file one opens. A segment of only dots (`...`) starts with a dot and is refused too. A segment is hidden when its first character is `.` once the characters HFS+ ignores (zero-width and bidirectional marks, the byte order mark) are dropped; a zero-width space makes another name on every file system, and passes the check; a leading space would too, but the handler trims the surrounding whitespace of every string argument first (`requiredString`, `mcp/server`), so ` .claude/x.md` reaches the check as `.claude/x.md` and is refused. The config folder is compared as Unicode text (NFC), case-folded (also macOS's long s), with empty and `.` segments dropped, invisible characters ignored, and per segment trailing dots and spaces and a `:` suffix ignored; the trailing-dot and space folding is defense in depth: Node's `fs` gives Windows a `\\?\` path, which trims nothing. Last, a `newPath` with a character Obsidian forbids in a name (`* " < > : | ?`, the separators aside) gets a third error: Obsidian's own rename dialog refuses them on every platform, Windows cannot store them, and on NTFS a `:` addresses an alternate data stream (`notes/c:d.md` is stream `d.md` of `notes/c`), which the vault index never lists. The config-folder and hidden checks come first, so `.obsidian:stream/x.md` reports the config folder and `.mcp.json:stream` a hidden name.
3. The target is `normalizePath(renameTargetPath(newPath))`: empty and `.` segments dropped, so `./a/b.md` is `a/b.md`. Equal to the current path: `<path> is already there.` Something already at the target: the tool error `<target> already exists - pick another name.`
4. A missing parent folder is created with `vault.createFolder`; a failure there surfaces in the rename.
5. The backlink count is taken from `resolvedLinks`, then `fileManager.renameFile` moves the file. `renameReply` names the old and new path and how many notes linked to it, and says that Obsidian updates those links as the user's link-update setting directs; or that nothing linked to it.

`obsidian_active`:

- The note the user last had active, found in this order; none gives "No note is open." The answer is the same while the chat panel has focus.
  1. The Markdown view the panel last saw focused (`lastEditor`, a getter the view passes to `createVaultTools`), while it has a file and a `markdown` leaf still holds it. A closed tab, or one switched to a PDF, is skipped.
  2. The workspace's most recent leaf (`getMostRecentLeaf`), when its view is a Markdown view with a file; this covers a panel opened while a note is active, before any focus change.
  3. The workspace's active file.
- With an editor: the path, the cursor as 1-based line and column, and the selection (its length, then the first 4000 characters and a truncation marker) or "Selection: none".
- Without an editor: the path and "(not open in an editor, so there is no cursor or selection)".

`obsidian_open`:

- Opens the file in the current leaf, or in a split when `newPane` is exactly `true`, and returns `Opened <path>.`

### Query language

`parseQuery` and `matchesQuery` in `src/mcp/query.ts`. Metadata only; note text is Grep's job.

Parsing:

- Tokens are separated by whitespace; single or double quotes group a run and are removed.
- A leading `-` on a token longer than one character negates it.
- A token with a colon after its first character is `field:value`. An unknown field makes the whole token a text term and is reported back as `Note: <field> is not a filter, so it was matched as text. Filters are tag, heading, path, prop, folder.` A known field with an empty value is dropped.
- Everything is compared lower-cased. `tag:` drops a leading `#`. `prop:` splits on the first `=` into key and value.

| Field (aliases) | Matches when |
| --- | --- |
| `tag` (`tags`) | A tag equals the value or is nested under it (`tag:work` matches `#work/active`). Tags come from the body and from frontmatter `tags`, or `tag` when `tags` is absent; a frontmatter string is one tag and is not split. |
| `heading` (`headings`) | Any heading contains the value |
| `path` | The note's path contains the value |
| `folder` (`dir`) | The note's folder is the value or below it; `folder:/` matches notes at the vault root only |
| `prop` (`property`, `properties`) | `prop:key`: the frontmatter key exists. `prop:key=value`: one of its values equals the value. Lists match per element; objects are compared as JSON text. |
| bare word | The note's name or path contains it |

All terms must hold; a negated term must not. A query with no term matches nothing.

### Consent

- The plugin puts no check of its own in front of `tools/call`. Claude Code sends `can_use_tool` before every MCP tool call ([ADR-004](../../current/adr/ADR-004-vault-tools-as-in-process-mcp-server.md), verified live).
- `obsidianToolPrompt` in `tool-labels` titles the card for `mcp__obsidian__*` tools:

| Tool | Card title |
| --- | --- |
| `obsidian_rename` | `Rename <path> to <newPath>, updating backlinks?` |
| `obsidian_properties` without `patch` | `Read <path>'s properties?` |
| `obsidian_properties` with `patch` | `Update <path>'s properties?` |
| `obsidian_links` | `Look up <path>'s links and backlinks?` |
| `obsidian_search` | `Search the vault's metadata for "<query>"?` |
| `obsidian_open` | `Open <path> in your window?` |
| `obsidian_active` | "Read which note you have open, and your selection?" |

- `<path>` in a title is the input's `path`, the argument every handler acts on, else "a note"; a missing `newPath` reads "a new path" and a missing `query` reads "notes". No other argument (`file_path` included) names anything on the card.
- The card's summary line is the one argument the tool acts on and nothing else: `path` for `obsidian_rename`, `obsidian_properties`, `obsidian_links` and `obsidian_open`; `query` for `obsidian_search`; none for `obsidian_active`. A tool name outside these six keeps the ordinary summary (DES-004).
- The rest of the card (full input, buttons) is the ordinary one (DES-004).
- No card is shown, writes included, while the conversation is in Bypass, or when a Claude Code allow rule (an Always allow answer, or one from its settings) covers the tool. In Auto-approve a call shows a card only when the CLI flags it (DES-004).

### CLI version floor

- Claude Code accepts `sdkMcpServers` from 2.1.210. An older CLI ignores the field and the tools do not appear.
- The plugin checks no version. When a session registered `obsidian` and its `system/init` lists no `obsidian` entry in `mcp_servers`, the view shows a Notice, at most once until the plugin reloads, that the vault tools are unavailable and need Claude Code 2.1.210 or newer (PRD-004.R1; DES-002).

### Failure handling

| Failure | Behaviour |
| --- | --- |
| A tool handler throws | Tool error `<tool> failed: <message>`; the conversation continues |
| Missing or blank required text argument; a `patch` that is not an object | Tool error naming the argument |
| A `limit` that is not a number; a `newPane` that is not `true` | The default applies |
| Path does not resolve, or a name is ambiguous | Tool error with the path guidance, or with the candidates |
| A refused rename target | Tool error; nothing moves |
| Unknown server name, or a message that is not a JSON object | Control error to the CLI |
| Unknown method or tool | JSON-RPC error |
| Metadata cache still indexing (startup, a large sync) | Links, backlinks and search results can be incomplete |
| CLI older than 2.1.210 | No tools; one Notice until the plugin reloads; Claude falls back to filesystem tools |

## Architecture rules

Each rule is checkable by a dependency-cruiser `forbidden` rule; until one runs, review checks them. Already stated in [DES-001](../../current/design/DES-001-system-overview.md#architecture-rules) and relied on here: A7 (what the `mcp/*` modules import), A8 and A9 (no Node process, file-system or network module under `mcp/`; the tools write only through Obsidian's API).

| # | Rule |
| --- | --- |
| F1 | `mcp/*` and `protocol/*` never import each other; `view` joins them |
| F2 | `mcp/server` is imported only by `view` and `mcp/vault-tools`; `mcp/query`, `mcp/replies` and `mcp/paths` only by `mcp/vault-tools`; `mcp/vault-tools` only by `view` |
| F3 | Every tool `mcp/vault-tools` defines has a case in `obsidianToolPrompt`; a `tool-labels` test asserts it against the tool names |

## Data and security

The user-facing threat model is [SECURITY.md](../../current/SECURITY.md).

| Tool | Reads | Changes |
| --- | --- | --- |
| `obsidian_links` | One note's links, embeds, backlinks | nothing |
| `obsidian_search` | Paths, tags and frontmatter of every Markdown note | nothing |
| `obsidian_properties` | One note's frontmatter | Frontmatter keys, when given a patch |
| `obsidian_rename` | The backlink count | The file's path; links to it, by Obsidian; a new parent folder |
| `obsidian_active` | Active note path, cursor, up to 4000 characters of the selection | nothing |
| `obsidian_open` | nothing | The user's window |

- Every result goes to the model, so it leaves the machine through the CLI to Anthropic.
- The server persists nothing and holds no credential.
- Consent comes only from Claude Code's permission request. Under Bypass or an allow rule the writing tools run with no card; Auto-approve answers them unless the CLI flags the call.
- Writes by `obsidian_rename` and `obsidian_properties` are not covered by the CLI's file checkpoints, diffed or listed as changes; Restore files does not undo them (DES-004).
- The card names the note in `path`, the one the tool acts on.
- `obsidian_rename` cannot move a file outside the vault, into the config folder or to a hidden name (steps 1 and 2); the card shows the target before approval. It does not stop a symlinked or junctioned folder, or a non-dot name another tool loads or runs (`CLAUDE.md`, `AGENTS.md`, tool configs, a new extension such as `x.cmd`); SECURITY.md names them and the backlog tracks them.
- The `enableObsidianMcp` toggle is device-local by default (DES-005).

## Rollout and rollback

- On by default; the switch is `enableObsidianMcp`, applied to open conversations when settings close.
- Compatibility: Claude Code 2.1.210 or newer; an older CLI loses the tools and the user sees one Notice. The MCP protocol version is echoed from the client, so no version negotiation can fail.
- Observability: step rows and permission cards per call. A failed tool is visible as a row with the error mark; the plugin logs nothing.
- Rollback: turn the setting off. Renames, folder creation and property changes already made stay; nothing in the plugin reverses them.

## Alternatives

Covered by ADR-004: an MCP SDK with a custom transport, a standalone server process registered in `.mcp.json`, a localhost HTTP or WebSocket server, no vault tools. A plugin-side consent gate on `tools/call` is not built; ADR-004 leaves consent to the CLI. Design-level choices:

- Ambiguous names: take Obsidian's pick, against refusing with the candidates. Refused, so a write never lands on a note the model did not mean.
- Rename targets: rely on Obsidian to confine the path, against refusing `..`, absolute, config-folder and hidden-name targets first. Refused first, since nothing verifies Obsidian's confinement.
- Hidden names: refuse any segment starting with `.`, against a list of known folders (`.claude`, `.git`, `.mcp.json`). A list misses `.envrc`, `.husky` and whatever a tool reads next; the rule costs the notes nobody could see in Obsidian, and a name shaped like a short name (`Report~1`, `Draft~1.md`).

## Verification

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| PRD-004.R1 | `tests/protocol.test.mjs`: "sdkMcpServers is registered on the initialize handshake", "no sdkMcpServers field is sent when none are configured" | The setting's wiring and its reach on settings close; the Notice with an older CLI |
| PRD-004.R2 | `tests/mcp.test.mjs`: "initialize echoes the client's protocol version and advertises only tools", "initialize without a protocol version still answers", "instructions are included only when set", "notifications/initialized is answered with null, not an error", "any message without an id is treated as a notification", "tools/list returns name, description and schema only", "tools/call runs the handler and returns its content", "tools/call with no arguments object still calls the handler", "id 0 is a real id, not a missing one", "an unknown tool is a JSON-RPC error", "an unknown method is a JSON-RPC error", "a thrown handler becomes a tool error the model can read, not a protocol error", "a missing tool name is an invalid-params error", "PRD-004.R2: a message that is not a JSON object is refused, not answered with null". `tests/protocol.test.mjs`: "mcp_message is routed to the handler and its reply wrapped for the CLI", "a client with no MCP handler refuses mcp_message rather than hanging", "a handler that throws surfaces as a control-response error". Required: the `2025-06-18` fallback and the `Method not found:` text asserted | The view's server-name check |
| PRD-004.R3 | `tests/mcp.test.mjs`: "requireString rejects blanks and non-strings", "errorResult flags itself so the model knows it failed" | `resolveFile`: path, `.md`, link text with a subpath, an ambiguous name, not found |
| PRD-004.R4 | - | `obsidian_links` on a note with body, frontmatter, embed, subpath and unresolved links |
| PRD-004.R5 | `tests/mcp.test.mjs`: "an empty query matches nothing rather than everything", "tags match with or without the hash, and nested tags match their parent", "headings match as substrings and quoting keeps spaces", "properties can be tested for existence or for a value", "folder matches the containing folder and its descendants", "bare words match the note name or path", "every term must hold", "a leading minus negates any term", "an unrecognized field is matched as text and reported", "a filter with no value is dropped rather than matching everything", "frontmatter is normalized to lower-cased string lists", "properties survive normalization for matching", "PRD-004.R5: the search limit is a whole number from 1 to 200, default 50". Required: `path:`, every alias, single quotes | The tool wrapper: `limit` 0 and 2.5 list 1 and 2 notes with a whole "more" count; sorting, reply text |
| PRD-004.R6 to R9 | `tests/mcp.test.mjs`, R7 only: "PRD-004.R7: the rename reply counts the notes that linked and leaves link updates to the user's preference", "PRD-004.R7: a rename target that is absolute, has a drive letter or a UNC root is refused", "PRD-004.R7: a rename target with a .. segment is refused, with either separator", "PRD-004.R7: a rename target that names no file is refused", "PRD-004.R7: dots inside a segment name are not a .. segment", "PRD-004.R7: a rename target in the configuration folder is refused however it is written", "PRD-004.R7: case and invisible-character aliases of the configuration folder are refused", "PRD-004.R7: a segment named like a Windows 8.3 short name is refused, at any depth, the file name included", "PRD-004.R7: a path that climbs out and back into the configuration folder is refused", "PRD-004.R7: the configuration folder is compared as Unicode text, case-folded", "PRD-004.R7: the configuration folder is whatever the vault names it", "PRD-004.R7: a configuration folder that folds to nothing still guards, and an empty one refuses all", "PRD-004.R7: ordinary rename targets pass", "PRD-004.R7: a rename target with a character Obsidian forbids in a name is refused", "PRD-004.R7: a rename target with a hidden folder or file name is refused", "PRD-004.R7: a hidden name is refused however it is written", "PRD-004.R7: a name no file system reads as starting with a dot is not hidden", "PRD-004.R7: a segment of only dots is hidden, whatever its length", "PRD-004.R7: a parent segment is a shape error, a hidden name is not", "PRD-004.R7: the rename target path drops empty and . segments, so ./a/b.md is a/b.md" | One call per tool and error, the body left byte-identical by a patch, each refused rename target, `obsidian_active` with the panel focused: asked at once after the panel opens with a note active, after the last-focused note is closed, and after its tab is switched to a PDF |
| PRD-004.R10 | Required: `tests/tool-labels.test.mjs`, a title and a summary per tool from the argument it acts on, and rule F3 | A card before every call in "Ask before acting" |

Independent verification boundary: `McpServer.handle`, the query functions and `tool-labels` in plain Node, and the `mcp_message` round trip through `ClaudeClient` against `tests/fake-cli.mjs`, run by CI through `make verify`, outside the implementing agent's control. The six tools are checked by a person in a desktop vault with a real CLI. That Claude Code asks permission before every MCP tool call, and ignores `sdkMcpServers` before 2.1.210, are properties of the CLI and cannot be verified in this repository.

## Open questions

None.
