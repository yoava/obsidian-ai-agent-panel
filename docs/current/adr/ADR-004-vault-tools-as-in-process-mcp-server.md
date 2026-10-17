# ADR-004 — Vault tools as an in-process MCP server on the CLI pipe

**Status:** accepted (2026-10-10)

## Context

- A vault's semantics (link graph, typed frontmatter, tags, the active note)
  live in Obsidian's metadata cache and file manager. A filesystem-only agent
  renames notes without rewriting backlinks and edits YAML by hand.
- Claude Code 2.1.210+ accepts `sdkMcpServers` on `initialize`, then drives
  each named server with `mcp_message` control requests over the existing
  stdio pipe; older versions ignore it.
- The constitution forbids ports, config files and extra processes of the
  plugin's own (`docs/current/constitution.md:16-20`).

## Options considered

### In-process server over `mcp_message`, hand-written dispatcher (recommended)

- No port, `.mcp.json` or process; tools run inside Obsidian on live state.
- Needs Claude Code 2.1.210+; tools only.

### In-process server on `@modelcontextprotocol/sdk` with a custom transport

- The most mature MCP implementation; full protocol.
- A runtime dependency (ADR-007) for four methods: `initialize`, `ping`,
  `tools/list`, `tools/call` (`McpServer.handle`).

### Standalone MCP server process registered in `.mcp.json`

- Standard; any MCP client can use it.
- Writes config and adds a process, both forbidden, and still needs a
  channel back into Obsidian's APIs.

### Localhost HTTP or WebSocket MCP server

- The pattern Claude Code IDE integrations use.
- Opens a port.

### No vault tools

- Nothing to build or secure.
- Renames break backlinks; the model parses and re-emits frontmatter.

## Decision

Why a hand-written in-process server:

- Over `@modelcontextprotocol/sdk`: the server needs four methods
  (`McpServer.handle`); the SDK brings 17 direct dependencies,
  `express`, `hono` and `jose` among them
  (`npm view @modelcontextprotocol/sdk@1.32.1 dependencies`), each a runtime
  package that ADR-007's screen would have to admit.
- Over a `.mcp.json` server process: the `obsidian` server "writes no config
  file and spawns no process" (`docs/current/constitution.md:19-20`), and the
  tools call `app.fileManager` (the `obsidian_properties` and
  `obsidian_rename` handlers) from the `obsidian` module, which only the
  running app supplies (`esbuild.config.mjs:24-25`).
- Over a localhost server: the plugin "listens on no port"
  (`docs/current/constitution.md:16-17`).
- Over no vault tools: `renameFile` will "Rename or move a file safely, and
  update all links to it" and `processFrontMatter` will "Atomically read,
  modify, and save the frontmatter of a note"
  (`node_modules/obsidian/obsidian.d.ts:2896, 2934`); a file-system rename or
  YAML edit does neither (inferred).

The design:

- While `enableObsidianMcp` is on (default), sessions register `obsidian`.
  `src/mcp/server.ts` answers `initialize` (tools capability only), `ping`,
  `tools/list` and `tools/call`; notifications get `null`; a tool that throws
  becomes an `isError` result the model can read. One server per panel view,
  shared by its tabs.
- `src/mcp/vault-tools.ts` provides six tools on Obsidian APIs:
  `obsidian_links`, `obsidian_search` (metadata-only query language in
  `src/mcp/query.ts`), `obsidian_properties` (read, or patch through
  `processFrontMatter`), `obsidian_rename` (`fileManager.renameFile`, links
  rewritten), `obsidian_active`, `obsidian_open`.
- Consent: the plugin does not gate `tools/call`. The CLI raises
  `can_use_tool` before every MCP call (verified live); the card words it as
  a sentence.
- Validation: `tests/mcp.test.mjs` replays the handshake as the CLI performs
  it and covers the search grammar.

## Consequences

- On older CLIs the tools silently do not appear.
- Strictly request/response: no resources, prompts or server-initiated
  messages.
- Under auto-approve, bypass or an always-allow rule, `obsidian_rename` and
  `obsidian_properties` write without a card.
- Open risk: vault-tool writes are not checkpointed, so Restore files cannot
  undo them (ADR-006).
- The `/mcp` card leaves this server to its setting.
