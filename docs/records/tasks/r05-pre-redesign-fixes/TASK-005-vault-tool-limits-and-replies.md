---
status: closed
release: r05-pre-redesign-fixes
number: 005
prd: PRD-004.R2, PRD-004.R5, PRD-004.R7, PRD-004.R8
---

# TASK-005 — Vault-tool limits and replies

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Four vault-tool behaviors differ from PRD-004: a search `limit` below 1 or
fractional, an array `mcp_message` answered as a notification, a rename reply
that says links were updated whatever the user's setting, and
`obsidian_active` finding no editor while the panel has focus.

Governing:
[PRD-004](../../../current/product/PRD-004-vault-tools.md) R2, R5, R7, R8,
[DES-006](../../../current/design/DES-006-vault-tools.md) (Transport step 4,
`obsidian_search`, `obsidian_rename` step 5, `obsidian_active`).

Acceptance:

1. `obsidian_search` lists at most `limit` notes, `limit` a finite number
   truncated to a whole number and clamped to 1 to 200; any other value gives
   50. The tool's schema text says so.
2. `McpServer.handle` throws `mcp_message carried no JSON-RPC message` for
   null, an array or a primitive, so the client answers the control request
   with an error; the view keeps no check of its own.
3. The rename reply names the old and new path and how many notes linked to
   the note, and says Obsidian updates those links as the user's link-update
   setting directs, or that nothing linked to it. It never says links were
   updated; the tool's description and the server instructions say the same.
4. `obsidian_active` reads the Markdown view the panel last saw focused
   (`lastEditor`, a getter the view passes to `createVaultTools`) while it has
   a file and a `markdown` leaf holds it, else the workspace's most recent
   leaf when that is a Markdown view with a file, else the workspace's active
   file; the answer is the same while the panel has focus.

## Scope

Expected files:

- `src/mcp/server.ts` (`handle` guard), `src/mcp/query.ts` (`searchLimit`),
  `src/mcp/replies.ts` (new: `renameReply`), `src/mcp/vault-tools.ts`
  (including the `obsidian_rename` description), `src/view.ts` (object check
  removed, `lastEditor` passed, server instructions)
- `tests/mcp.test.mjs`, `package.json` (`pretest`)
- `README.md` (rename claims), `RELEASE_NOTES.md`, `docs/current/plan.md`
  (four backlog items), `docs/current/DEVELOPMENT.md` (test table), DES-001
  (module tables, rule A7), DES-006 (module table, Transport, Dispatcher,
  `obsidian_active`, rule F2, Verification), and the line references in
  PRD-004 and ADR-004 that this change moves (replaced by symbol names)

Negative scope:

- `obsidian_rename` path refusals (`..`, absolute, config folder): a separate
  task, as are ambiguous names, `requireNote` and the card naming `path`.
- Card titles, including "…, updating backlinks?" (PRD-004.R10 wording), and
  the other tools' descriptions: unchanged.
- Every other backlog item.
- A real-CLI run.

## Plan

- Tests first in `tests/mcp.test.mjs`: the non-object messages against
  `McpServer.handle`, the limit table through `optionalNumber` as the tool
  reads it, and the rename reply text.
- The guard sits in `handle`, so every caller gets it; `ClaudeClient` already
  turns a throw into a control error (`tests/protocol.test.mjs`, "a handler
  that throws surfaces as a control-response error"). The view's check is then
  redundant and goes.
- `searchLimit` beside the query grammar; `renameReply` in a new Obsidian-free
  `mcp/replies` module, since `vault-tools` imports `obsidian` and `server` is
  the protocol half.
- `lastEditor` is `() => this.lastEditorView`; the tool trusts that view only
  while it has a file and `getLeavesOfType("markdown")` still holds it, then
  tries `getMostRecentLeaf()`, then `getActiveFile()`.
- Verification: `make verify`; independent review; by hand in a vault:
  `obsidian_active` with the panel focused, asked at once after the panel
  opens over an active note, after the last-focused note is closed, and after
  its tab is switched to a PDF; a rename with automatic link updates on and
  off; a search with `limit` 0 and 2.5.
- Rejected: `searchLimit(unknown)` (leaves `optionalNumber` unused);
  `renameReply` in `server.ts` (vault wording in the protocol module).

## Run log

- Tests first: the non-object message test failed (`null` raised a
  `TypeError`; arrays, numbers and strings resolved to `null`); the limit and
  rename-reply tests failed on the missing `searchLimit` and `mcp/replies`.
- Acceptance 4 has no automated test: `vault-tools` imports `obsidian`.
  Owed by hand in a vault.
- The worktree was cut from 0.4.0, without the document layers; it was
  fast-forwarded to `chore/agentic-sdlc` before the work started.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Gap: with no remembered view (panel opened over an active note),
   `obsidian_active` skipped the editor. Fixed: the workspace's most recent
   leaf comes next.
2. Gap: a remembered view outlived its closed tab, or its tab switched to a
   PDF. Fixed: it counts only while a `markdown` leaf holds it.
3. Stale: README's rename claims ("rewrites every link"). Fixed.
4. Gap: the `obsidian_rename` description and the server instructions
   promised updated links (PRD-004.R7). Fixed; the card title stays
   (PRD-004.R10).
5. Stale: PRD-004 and ADR-004 line references into `server.ts` and
   `vault-tools.ts`. Fixed: symbol names.
6. Nit: DES-006 restated rule A7's import list. Fixed: a link.
7. Gap: DES-006's R5 manual evidence lost the limit check. Fixed.
8. Nit: `searchLimit` relied on its caller to drop non-finite numbers, and
   the tests did not assert NaN and Infinity directly. Fixed.
9. Nit: DES-001's job text for `mcp/query` used "and", `mcp/replies` was
   wider than its one function, and the row named the function. Fixed.
10. Nit: the `MarkdownView` import kind in `vault-tools`. Fixed: it stays a
    value import, since `instanceof` uses it.
11. Nit: the limit release note's cause sentence; no note for the rename
    description. Fixed.
12. Nit: DES-006 stated the non-object rule in Transport and in the
    Dispatcher. Fixed: Transport refers to the Dispatcher.

## Outcome

The search limit is a whole number from 1 to 200, a non-object MCP message
gets a control error, the rename reply and every rename description follow
the user's link-update setting (the settings text and COMPARISON.md too),
and `obsidian_active` finds the last editor while the panel has focus. Owed
by hand in a vault: `obsidian_active` with the panel focused, right after
opening the panel, after closing the last-focused note and after switching
its tab to a PDF; a rename with link updates on and off; `limit` 0 and 2.5.
