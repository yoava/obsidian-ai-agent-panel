# ADR-011 — User shell escape outside the agent's permissions

**Status:** accepted (2026-10-10)

## Context

- Users want to run a quick command (`!git status`) beside the conversation
  without a model turn.
- Stream-JSON has no request to run Bash directly; the `mcp_call` control
  request reaches MCP servers only and refuses SDK servers. Claude Code's own
  `!` mode exists only in its terminal UI.
- The constitution allows the `!` escape only from the user's own
  keystrokes, with nothing model-controlled on a command line.

## Options considered

### Run it in the plugin, outside Claude Code's permissions (recommended)

- Deterministic and free of tokens; the user typed it, so there is no model
  decision to approve.
- A shell path that no permission rule or hook sees.

### Ask the model to run it as a Bash call

- Goes through permissions and hooks.
- Non-deterministic and costs tokens.

### The `mcp_call` control request

- Stays inside the CLI.
- MCP-only and refuses SDK servers; no Bash.

### No shell escape, or off by default

- Smaller surface.
- One-off commands need a terminal, or a setting flip first.

## Decision

Why run it in the plugin:

- Over a model Bash call: Claude Code's own `!` mode runs commands "directly
  without going through Claude", "Doesn't require Claude to interpret or
  approve the command", and runs them outside the sandbox "because the
  sandbox applies to the commands Claude runs" (Claude Code docs,
  *Interactive mode*). A model turn is billed (`--output-format json`
  reports `total_cost_usd`, Claude Code docs, *Run Claude Code
  programmatically*) and may alter or decline the command (inferred).
- Over `mcp_call`: it "Invokes an MCP tool", runs with "No permission check",
  and rejects SDK-type servers (Agent SDK 0.3.296, `sdk.d.ts:4697`); Claude
  Code 2.1.296 answers `mcp_call does not support SDK MCP servers.`
  (`strings ~/.local/share/claude/versions/2.1.296 | grep 'mcp_call does
  not support'`).
- Over no escape or off by default: no model path reaches it. Its one caller
  is the composer's send, reading `this.inputEl.value`
  (`src/ui/composer.ts:219`, then `ChatTab.send` step 4 and
  `ShellEscape.start`; `grep -rn runShellCommand src` finds no caller but
  `src/tab/shell-escape.ts`), as the constitution requires: "the `!` escape
  runs only from the user's own keystrokes"
  (`docs/current/constitution.md:36`).

The design:

- `!<command>` in the composer runs locally with the vault as cwd, where the
  conversation's CLI runs: `/bin/sh -c <cmd>`, `cmd.exe /d /s /c <cmd>`, or
  `wsl.exe --cd <vault> --exec sh -lc <cmd>`. The command is one argv
  element, never concatenated.
- 60 s timeout; 100k characters per stream. A setting turns it off; it ships
  on (`DEFAULT_SETTINGS` in `src/settings-core.ts`) because no model path reaches it.
- Not model-reachable: only the user's keystrokes plus Enter run it; a reply
  containing `!rm -rf` is inert text. The model sees the output only if the
  user presses Add output to chat, which fills the composer.
- Validation: `tests/bash.test.mjs` (invocation shape, capture, timeout,
  caps).

## Consequences

- A deliberate exception to "everything goes through Claude Code's
  permissions".
- Output is saved in history (truncated to 1500 characters) and in exports.
- The `bash` setting syncs by default (ADR-009).
