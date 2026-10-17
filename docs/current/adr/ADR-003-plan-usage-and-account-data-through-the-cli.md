# ADR-003 — Plan usage and account data only through the running CLI

**Status:** accepted (2026-10-10)

## Context

- The panel shows plan usage (the status line's plan-usage segment, `/usage`,
  `/usage-credits`, `/extra-usage`) and account details (`/status`).
- Anthropic's terms forbid third parties from collecting, storing or
  intermediating Claude.ai credentials or session tokens.
- A running CLI answers a `get_usage` control request with its own login;
  the Agent SDK typings declare it and mark it experimental
  (`docs/current/LEGAL.md`).
- The constitution forbids network access, credentials and telemetry of the
  plugin's own.

## Options considered

### Ask a running session over the existing stdio pipe (recommended)

- No credential, socket or HTTP request in the plugin.
- Usage appears only while a conversation's CLI runs; the request can change
  or vanish.

### Read the CLI's stored OAuth token and call the usage endpoint

- Works without a session.
- Reads `~/.claude/.credentials.json` or the macOS Keychain and calls
  Anthropic itself: the credential intermediation the terms forbid, plus
  network and credential handling in the plugin.

### Start a CLI process to fetch usage

- Works without a conversation; a control request costs no tokens.
- A process start per refresh just to draw a segment, and each start runs the
  user's SessionStart hooks and launches their MCP servers.

### Send `/usage` as a turn and parse the reply

- Needs no experimental request.
- The reply is unstructured: over stream-JSON, Claude Code answers local
  commands in plain text or refuses them.

## Decision

Why the running session's pipe:

- Over reading the stored OAuth token: the plugin "never reads the CLI's
  credential file or the OS keychain" and makes no HTTP request
  (`docs/current/constitution.md:16-17, 23-24`), and Anthropic's terms say
  "developers may not collect, store, or intermediate Claude.ai credentials or
  session tokens" (Claude Code docs, *Legal and compliance*).
- Over starting a CLI for usage: SessionStart hooks run "when Claude Code
  starts a new session or resumes an existing session" (Claude Code docs,
  *Hooks*), and a `-p` session "runs the hooks in a project's
  `.claude/settings.json` and connects the servers in its `.mcp.json`"
  (Claude Code docs, *Run Claude Code programmatically*).
- Over `/usage` as a turn: `get_usage` returns "the structured /usage data"
  (Agent SDK 0.3.296, `sdk.d.ts:4275`), while in `-p` mode "Built-in commands
  that only run in the terminal interface, such as `/login`, aren't
  available" and `/mcp` "prints a text summary" (Claude Code docs, *Run
  Claude Code programmatically*).

The design:

- `UsageService` sends `get_usage` through the active tab's live client, else
  any running tab's; it never spawns one.
- Results are cached; the segment polls only while enabled and visible,
  refreshes after each finished turn, and any lookup, forced or not, waits at
  least 10 s after the last.
- A failure (no session, a CLI without `get_usage`, a login without plan
  limits) shows "usage unavailable" with the reason, never an error.
- The info commands (`/status`, `/context`, `/mcp`, ...) use the same pipe
  and may start the CLI, because the user asked. They only read, except
  `/mcp`'s actions: reconnect, and enable/disable (`mcp_toggle`), which
  changes Claude Code's own MCP configuration (`docs/current/SECURITY.md`).
- The plugin calls no `fetch` or `requestUrl`, opens no socket, stores no
  token and collects nothing.
- Validation: `tests/commands.test.mjs` pins the card builders and the `/mcp`
  action requests against captured CLI replies, and
  `tests/usage-core.test.mjs` pins the service's caching, 10 s spacing and
  failure back-off against a stub client. No spec sends `get_usage` to a CLI,
  so the no-spawn rule and "usage unavailable" are checked by hand in a vault.
  Nothing in `make verify` fails on a network call or a credential read;
  review is the check.

## Consequences

- README and `docs/current/LEGAL.md` can state no network, no credentials and
  no telemetry without exceptions.
- Usage is invisible until a conversation runs.
- `get_usage`, `get_status` and the dialog requests can change in any CLI
  release; each reply is checked field by field.
- `/status` cards (account email, organization) are saved in history and
  exports like any card.
