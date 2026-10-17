# PRD-004 — Vault tools

**Status:** accepted (2026-10-10)

## Problem

From the filesystem alone an agent moves a note by moving the file, which
breaks every backlink; edits YAML frontmatter as text; cannot ask for tags,
properties, headings or backlinks; and cannot tell which note the user means by
"this" (README; docs/current/COMPARISON.md). Obsidian holds that knowledge in
its link graph and metadata index, which only code running inside Obsidian can
reach.

## Users and jobs

- Obsidian desktop users of the panel (PRD-001) who ask Claude to reorganize,
  link, tag or query their vault, and approve what it does.
- Claude, calling the tools on the user's behalf: rename or move a note
  without breaking links, read a note's place in the link graph, find notes by
  metadata, read or set properties, see the active note and selection, open a
  note.

## Requirements

- **PRD-004.R1** — Availability. Which conversations a change of the setting
  reaches: PRD-001.R25.
  - WHERE "Vault tools for Claude" is on (the default), the AI Agent Panel
    shall register an in-process MCP server named "obsidian" with the
    conversation's CLI, offering `obsidian_links`, `obsidian_search`,
    `obsidian_properties`, `obsidian_rename`, `obsidian_active` and
    `obsidian_open`.
  - WHERE that setting is off, the AI Agent Panel shall register no server.
  - IF the CLI ignores the registration, as Claude Code before 2.1.210 does,
    THEN the AI Agent Panel shall run the conversation without the tools.
  - IF the setting is on and a CLI's startup report lists no `obsidian`
    server, THEN the AI Agent Panel shall show a Notice, at most once until
    the plugin reloads, that the vault tools are unavailable and need Claude
    Code 2.1.210 or newer.
  - The AI Agent Panel shall serve the tools over the CLI's existing
    stdio channel, opening no port, writing no MCP configuration file and
    starting no process for them.
- **PRD-004.R2** — MCP protocol.
  - WHEN the CLI sends `initialize`, the AI Agent Panel shall answer
    with the CLI's protocol version (2025-06-18 if none was sent), tools-only
    capabilities, the server name "obsidian" with the plugin version, and
    instructions that point Claude to the tools for link-graph and metadata
    work and to Read and Grep for file contents.
  - WHEN the CLI sends `tools/list`, the AI Agent Panel shall return
    each tool's name, description and input schema.
  - WHEN the CLI sends a message with no `id` member, the AI Agent Panel
    shall answer the control request with success and `mcp_response: null`,
    treating id 0 and id null as real ids.
  - IF the method is unknown, THEN the AI Agent Panel shall answer
    JSON-RPC error -32601 `Method not found: <method>`.
  - IF `tools/call` names an unknown tool, THEN the AI Agent Panel shall
    answer JSON-RPC error -32601 `Unknown tool: <name>`.
  - IF the tool name in `tools/call` is not a string, THEN the AI Agent Panel
    shall answer JSON-RPC error -32602 `tools/call: name must be a string`.
  - IF a tool fails unexpectedly, THEN the AI Agent Panel shall return a
    tool result flagged as an error with `<tool> failed: <message>`.
  - IF the CLI addresses a server other than "obsidian", or sends a message
    that is not a JSON object (null, an array or a primitive), THEN the AI
    Agent Panel shall answer the control request with an error.
- **PRD-004.R3** — Arguments.
  - IF a required text argument is missing or blank, THEN the AI Agent Panel
    shall return the tool error
    `"<key>" is required and must be a non-empty string.`
  - The AI Agent Panel shall resolve a note argument as an exact
    vault-relative path, then with ".md" added, then as wiki-link text.
  - IF a name without a folder matches several notes, THEN the AI Agent
    Panel shall return a tool error listing the matching paths.
  - IF no file resolves, THEN the AI Agent Panel shall return the tool
    error `No note found at "<path>". Paths are vault-relative (e.g.
    "notes/Ideas.md"); a name without a folder works too if it is
    unambiguous.`
- **PRD-004.R4** — Links and backlinks.
  - IF the target of a links call is not a Markdown note, THEN the AI Agent
    Panel shall return an error naming the file and change nothing.
  - WHEN Claude calls `obsidian_links` for a note, the AI Agent Panel
    shall return the sections "Outgoing links", "Embeds", "Backlinks" and
    "Unresolved links", each with its count, sorted entries, and "(none)" when
    empty, including links in frontmatter.
  - IF a section has more than 500 entries, THEN the AI Agent Panel
    shall list the first 500 and a line counting the rest.
- **PRD-004.R5** — Metadata search.
  - WHEN Claude calls `obsidian_search` with a query, the AI Agent Panel
    shall return how many Markdown notes match every term and list them
    sorted by path, each with its tags and up to 6 non-empty properties.
  - The AI Agent Panel shall match `tag:` against a note's inline and
    frontmatter tags, with or without `#`, including tags nested under it.
  - The AI Agent Panel shall match `heading:` and `path:` as substrings of a
    heading and of the note path.
  - The AI Agent Panel shall match `prop:key` when the property exists and
    `prop:key=value` when one of its values equals the value.
  - The AI Agent Panel shall match `folder:` against notes in that folder
    and below.
  - The AI Agent Panel shall accept `tags:`, `headings:`, `property:`,
    `properties:` and `dir:` as aliases of `tag:`, `heading:`, `prop:`,
    `prop:` and `folder:`.
  - The AI Agent Panel shall match a bare word as a substring of the note
    name or path.
  - The AI Agent Panel shall negate any term that starts with `-`.
  - The AI Agent Panel shall keep spaces inside double or single quotes.
  - The AI Agent Panel shall compare every term case-insensitively.
  - IF a term uses an unknown field, THEN the AI Agent Panel shall match
    it as text and add `Note: <field> is not a filter, so it was matched as
    text. Filters are tag, heading, path, prop, folder.`
  - IF the query has no usable term, THEN the AI Agent Panel shall
    return the tool error "That query had nothing to match on. Try tag:,
    heading:, prop:, folder:, path:, or a bare word."
  - The AI Agent Panel shall list at most `limit` notes, taken as a whole
    number from 1 to 200 (default 50).
  - IF more notes match than the limit, THEN the AI Agent Panel shall end
    with `… N more (raise limit to see them)`.
  - The AI Agent Panel shall match note metadata only, never note text.
- **PRD-004.R6** — Properties.
  - IF the target of a properties call is not a Markdown note, THEN the AI
    Agent Panel shall return an error naming the file and change nothing.
  - WHEN Claude calls `obsidian_properties` without a patch, or with a null
    patch, the AI Agent Panel shall return `<path> properties:` followed by
    the frontmatter as JSON, or `<path> has no frontmatter properties.`
  - WHEN Claude calls `obsidian_properties` with an object patch, the AI
    Agent Panel shall set each key through Obsidian's frontmatter writer and
    delete each key whose value is null.
  - WHEN a patch is applied, the AI Agent Panel shall leave the file's
    content outside the frontmatter block byte-identical.
  - WHEN a patch is applied, the AI Agent Panel shall return
    `<path>: set <keys>; removed <keys>.` with only the non-empty parts, or
    `<path>: nothing to change.`
  - IF the patch is neither absent, null nor a plain object, THEN the AI Agent
    Panel shall return the tool error
    `"patch" must be an object of property names to values.`
- **PRD-004.R7** — Rename without breaking links.
  - WHEN Claude calls `obsidian_rename` with a note and a new path, the AI
    Agent Panel shall move the note through Obsidian's file-manager rename,
    creating missing parent folders.
  - IF the new path has a `..` segment, is absolute, lies in the vault's
    configuration folder, has a segment that starts with `.` (a hidden folder,
    or a hidden file name), has a segment named like a Windows 8.3 short
    name (such as `CLAUDE~1` or `MCP~1.JSO`, the file name included), or has a
    character Obsidian forbids in a name (`* " < > : | ?`), THEN the
    AI Agent Panel shall return a tool error and
    create or move nothing.
  - The AI Agent Panel shall leave link updating to that rename, which
    updates links to the note as the user's Obsidian link-update preference
    directs.
  - WHEN the rename succeeds, the AI Agent Panel shall return the new path
    and how many notes linked to the note, describing link updates as subject
    to the user's link-update preference.
  - IF the new path equals the current one, THEN the AI Agent Panel
    shall return `<path> is already there.`
  - IF something already exists at the new path, THEN the AI Agent Panel
    shall return the tool error `<target> already exists - pick another name.`
- **PRD-004.R8** — Active note.
  - WHEN Claude calls `obsidian_active`, the AI Agent Panel shall return
    the path of the note the user last had active, also while the chat panel
    has focus.
  - WHERE that note is open in an editor, the AI Agent Panel shall add the
    1-based cursor line and column of the editor the user last focused and its
    selected text (first 4000 characters, then a truncation marker) or
    "Selection: none".
  - IF the note is not open in an editor, THEN the AI Agent Panel
    shall return its path with "(not open in an editor, so there is no cursor
    or selection)".
  - IF no note is open, THEN the AI Agent Panel shall return "No note is
    open."
- **PRD-004.R9** — Open a note.
  - WHEN Claude calls `obsidian_open`, the AI Agent Panel shall open the
    note in the current pane, or in a split when `newPane` is true, and return
    `Opened <path>.`
- **PRD-004.R10** — Consent.
  - The AI Agent Panel shall run a vault tool only when the CLI calls
    it, adding no consent check of its own to Claude Code's permission request.
  - WHEN Claude Code asks permission for a vault tool, the AI Agent Panel
    shall title the card with a sentence:
    `Rename <a> to <b>, updating backlinks?`, `Read <note>'s properties?`,
    `Update <note>'s properties?`, `Look up <note>'s links and backlinks?`,
    `Search the vault's metadata for "<query>"?`, `Open <note> in your window?`
    or "Read which note you have open, and your selection?"
  - The AI Agent Panel shall name in a vault-tool card's title and summary
    the note in the tool's `path` argument, the one the tool acts on.
  - WHILE a conversation is in Auto-approve or Bypass, or an Always-allow rule
    covers a vault tool, the AI Agent Panel shall let vault-tool calls,
    writes included, run without a card, except the requests PRD-002.R9
    still shows.

Every accepted ID must appear in an automated test name or an explicit manual
verification row before release close.

## Non-goals

- Searching note text: Claude Code's Grep does that (recorded,
  `src/mcp/query.ts:1-7`).
- MCP resources and prompts: tools only, since advertising them invites list
  round-trips for nothing (recorded, the `initialize` case of `McpServer.handle`).
- A separate MCP server process, `.mcp.json` entry or localhost port: avoided
  so nothing is written, spawned or opened (recorded,
  docs/current/design/DES-006-vault-tools.md).
- A plugin-side consent gate: Claude Code's prompt precedes every MCP call
  (recorded as verified live, docs/current/design/DES-006-vault-tools.md).

## Security and privacy

- Claude chooses every argument, and the tools act inside Obsidian with full
  vault access. Consent comes only from Claude Code's permission request
  (external behavior, recorded as verified live; no test in this repository
  covers it).
- Auto-approve, Bypass and Always-allow rules let `obsidian_rename`,
  `obsidian_properties` writes and `obsidian_open` run with no card
  (PRD-002).
- `obsidian_rename` refuses targets outside the vault, in its configuration
  folder, at a hidden name or at a name that may be a Windows short name for
  one, where Claude Code or Git would run what they find (R7).
- Writes by `obsidian_rename` and `obsidian_properties` are not checkpointed,
  diffed or listed as changes, so Restore files cannot undo them (PRD-002,
  Non-goals).
- Data sent to Anthropic through the CLI: tool results, including up to 4000
  characters of the user's selection, frontmatter values, link lists and
  search results over every Markdown note.
- The tools toggle stays on the device by default (PRD-001.R24).
- Nothing is persisted, and no port, configuration file, process or credential
  is involved.

## Failure and recovery

- While Obsidian's metadata cache is still indexing (startup, a large sync),
  links, backlinks and search results can be incomplete (inferred).
- A tool that throws returns a readable tool error and the conversation
  continues (R2).
- On a CLI older than 2.1.210 Claude falls back to filesystem tools, and the
  user is told once (R1).

## Open questions

None.
