# ADR-012 — Vendor-neutral identity over Claude-specific code

**Status:** accepted (2026-10-10)

## Context

- Anthropic's terms allow a plain-text statement that a product works with
  Claude Code but forbid its names and logos in a product's name, logo or
  branding. Obsidian's developer policies restrict use of its own mark.
- The plugin id keys installs, updates and the data folder
  (`.obsidian/plugins/<id>/`), so changing it after listing strands users;
  even renaming a storage key needs a migration fallback
  (`src/main.ts:26-27, 251-255`).
- Codex support targets a later release (`README.md`); its PRD comes before
  an ADR on the agent boundary (D-04 in `docs/current/open-decisions.md`).

## Options considered

### Neutral name, id and icon; Claude-specific code until a second agent (recommended)

- No trademark use; the name fits future agents.
- Code says Claude where it means Claude; the agent boundary comes later.

### A Claude-branded name

- Instantly discoverable.
- Uses Anthropic's mark as the product name, which its terms forbid.

### A neutral name plus an agent-adapter layer now

- Ready for Codex.
- An abstraction with one implementation, designed before the second agent's
  requirements and protocol are in hand.

## Decision

Why a neutral identity over Claude-specific code:

- Over a Claude-branded name: "you can't use the Claude Code or Anthropic
  names or logos as part of your own product, feature, or company name"
  (Claude Code docs, *Legal and compliance*).
- The id is permanent once chosen: it names the data folder and storage
  namespace, and the one rename so far still reads a legacy key on every
  load (`src/main.ts:26-27, 251-255`).
- Over an adapter layer now: Codex is planned for a later release
  (`README.md`) and speaks another protocol, `codex app-server` JSON-RPC
  (`docs/current/COMPARISON.md:42`); D-04 puts the "PRD first, then an ADR on
  the session/protocol boundary" (`docs/current/open-decisions.md:10`). A
  boundary drawn from one implementation would likely not fit the second
  (inferred).

The design:

- Name "AI Agent Panel", id `ai-agent-panel`, the same string as the command,
  CSS and storage namespace, and a vendor-neutral icon (a chat bubble with a
  terminal prompt in the theme's accent colour).
- Vendor names appear only as plain-text compatibility statements, each
  stating the project is unofficial.
- The legacy device-local key `claude-code:local-settings` is the fallback on
  every load while `ai-agent-panel:local-settings` is unset; it is never
  deleted (`src/main.ts:251-255`).
- Validation: changes to the manifest, icon or UI text are reviewed against
  the Trademarks section of `docs/current/LEGAL.md`. The legacy fallback is
  checked by hand in a vault that holds only the legacy key.

## Consequences

- The id and namespace are effectively permanent.
- The code is Claude-specific (`ClaudeClient`, `ClaudeSession`, Claude
  protocol types in the view). A second agent needs the session and protocol
  boundary D-04 decides.
