# ADR-001 — Drive the installed Claude Code CLI over stream-JSON

**Status:** accepted (2026-10-10)

## Context

- The plugin hosts an AI coding agent in an Obsidian panel. Claude Code's
  agent loop, tools, permission system, hooks and login live in Anthropic's
  proprietary `claude` CLI, which the user installs and logs in to.
- An Obsidian plugin ships as one bundled `main.js`; this repository is MIT.
- The CLI has a headless interface: `--input-format stream-json` and
  `--output-format stream-json` (NDJSON on stdio) plus a control protocol
  (`initialize`, `can_use_tool`, `interrupt`, `mcp_message`, ...). Anthropic's
  Agent SDK speaks the same protocol; its type definitions declare the control
  requests, several marked experimental, few documented elsewhere.
- Anthropic's terms forbid third parties from collecting, storing or
  intermediating Claude.ai credentials, and Anthropic may meter stream-JSON
  sessions differently from interactive use.

## Options considered

### Spawn the user's CLI in stream-JSON mode with an original client (recommended)

- No Anthropic code ships; the user's own install, login, settings, rules and
  hooks apply unchanged.
- Keeps the bundle free of runtime dependencies (ADR-007).
- Depends on flags and control requests that are partly undocumented or
  experimental and can change in any CLI release.

### Bundle `@anthropic-ai/claude-agent-sdk`

- The most mature client for this protocol: maintained by Anthropic, typed.
- Proprietary ("All rights reserved"): bundling it redistributes Anthropic
  code inside an MIT project.

### Call the Anthropic API directly

- No CLI install needed.
- The plugin would hold an API key, or use a subscription login only by
  intermediating credentials; the constitution forbids both
  (`docs/current/constitution.md:23-24`).
- Loses Claude Code's tools, permission system and hooks, which live in the
  CLI; the plugin would reimplement the agent.

### Embed the interactive CLI in a terminal (xterm.js and a PTY)

- Works with any agent CLI; no protocol dependency.
- A terminal carries screen text, not structured events: no permission cards,
  pre-approval diffs, history or checkpoints.
- A PTY needs a native module, a runtime dependency (ADR-007); two such
  plugins are macOS-only or need a Unix PTY
  (`docs/current/COMPARISON.md:44-45, 125-127`).

### Agent Client Protocol (ACP) adapter

- One protocol for many agents.
- Claude Code speaks ACP only through a separate npm adapter,
  `@zed-industries/claude-agent-acp`, built on the Agent SDK.
- Agent Client, the ACP plugin, shows no plan usage and an agent-dependent
  token and context meter (`docs/current/COMPARISON.md:97-98`).

### One `claude -p` process per turn

- Simplest process model.
- No mid-turn steering (`src/view.ts:2018`) and no `interrupt`, `set_model`
  or `mcp_message`, which need a live process
  (`src/protocol/client.ts:291-301, 549`); the panel refuses `-p`
  (`src/cli-args.ts:44-46`).

## Decision

Why the user's CLI over stream-JSON:

- Over the Agent SDK: the package is proprietary
  (`npm pack @anthropic-ai/claude-agent-sdk@0.3.296`, `package/LICENSE.md`:
  "© Anthropic PBC. All rights reserved."), and the bundle carries no
  Anthropic code (`docs/current/constitution.md:55-56`).
- Over the Anthropic API: the plugin would hold an API key or a subscription
  credential, which the constitution forbids
  (`docs/current/constitution.md:23-24`) and Anthropic's terms restrict:
  "developers may not collect, store, or intermediate Claude.ai credentials or
  session tokens" (Claude Code docs, *Legal and compliance*). The tools and
  agent loop are client-side ("The Agent SDK gives you the same tools, agent
  loop, and context management that power Claude Code", Claude Code docs,
  *Run Claude Code programmatically*), so the plugin would rebuild them.
- Over a terminal: permission cards are built from `can_use_tool` control
  requests (`src/protocol/client.ts:494-520`), which screen text does not
  carry (inferred); the two PTY plugins are macOS-only or need a Unix PTY
  (`docs/current/COMPARISON.md:125-127`).
- Over ACP: Claude Code's adapter is built on an older Agent SDK:
  `npm view @zed-industries/claude-agent-acp dependencies` lists
  `'@anthropic-ai/claude-agent-sdk': '0.2.83'` while the SDK is at 0.3.296.
  Agent Client, the ACP plugin, shows no plan usage
  (`docs/current/COMPARISON.md:97`).
- Over `claude -p` per turn: a mid-turn send goes to the running process,
  which steers the turn (`src/view.ts:2018-2020`), and `interrupt` and
  `set_model` are requests to a live process
  (`src/protocol/client.ts:291-301`).

The design:

Spawn the user's `claude` with the vault root as cwd:

```text
claude --output-format stream-json --input-format stream-json --verbose
       --include-partial-messages --permission-prompt-tool stdio
       --replay-user-messages
       [model, effort, permission mode, resume, profile args]
```

One process per conversation, kept alive across turns; after it exits, the
next send resumes with `--resume <session id>`.

- `src/protocol/client.ts` (spawn, NDJSON framing, control protocol) and
  `src/protocol/types.ts` are original; nothing is copied from the Agent SDK
  or the CLI.
- The `initialize` handshake carries the vault-instructions system-prompt
  suffix and the in-process MCP registration (ADR-004).
- Unknown stream message types are ignored; unknown CLI control requests are
  answered with an error; control replies are checked field by field.
- Validation: the client has no Obsidian import and is tested end to end
  against `tests/fake-cli.mjs`.

## Consequences

- Authentication and billing are the CLI's: the user's subscription login, or
  `ANTHROPIC_API_KEY` when set in Obsidian's environment, which the CLI
  inherits.
- Anthropic may meter or credit stream-JSON sessions differently; the plugin
  takes no position on a user's plan.
- Features carry CLI version floors (2.1.210 for in-process MCP) and degrade
  when undocumented requests change.
- Desktop only, since it spawns a process (ADR-013).
- A second agent needs its own client
  ([ADR-012](ADR-012-vendor-neutral-identity.md)).
