# ADR-008 — Windows and WSL launch shapes, and CLI profiles

**Status:** accepted (2026-10-10)

## Context

- Claude Code may be installed natively (an executable, or npm's `claude.cmd`
  shim), inside WSL, or both on one Windows machine.
- Node refuses to spawn `.cmd`/`.bat` files without a shell (its
  CVE-2024-27980 hardening). Through cmd.exe, `%`, `!` and `"` act even inside
  quotes.
- `wsl.exe -- <command>` hands its command line to the distro's default shell
  to re-parse, and bash, zsh and fish read quotes differently;
  `wsl.exe --exec` runs a program directly.
- Profiles carry arguments the user types, so a launch shape must not let a
  shell re-parse them.
- Claude Code does not support Claude in Chrome under WSL; native Windows has
  no Bash sandbox; paths in extra arguments differ per install.

## Options considered

### Three spawn shapes decided in one function, plus named profiles (recommended)

- Arguments never reach a shell that parses them, except cmd.exe for the
  shim, where unsafe ones are refused.
- An argument containing a cmd.exe metacharacter cannot reach a `.cmd`
  install.

### `wsl.exe -- <cli> <args>`

- Shortest command line.
- The default shell re-parses every argument, differently per shell.

### `cross-spawn`, the mature library for Windows shims

- Escapes cmd.exe metacharacters instead of refusing them.
- A runtime dependency (ADR-007), and cmd.exe escaping is fragile: `%` and
  `!` expand even inside quotes.

### Native executables only

- No cmd.exe path at all.
- Excludes npm's `claude.cmd` shim, supported deliberately since the first
  public release (0.3.2).

### A single CLI path setting

- Simpler settings.
- Cannot express a machine with both a Windows and a WSL install, or
  per-install Chrome, sandbox and argument choices.

## Decision

Why three spawn shapes in one function, plus profiles:

- Over `wsl.exe -- <cli> <args>`: `wsl.exe --help` gives `--exec` as
  "Execute the specified command without using the default Linux shell" and
  `--` as "Pass the remaining command line as-is"; only `--exec` keeps the
  user's shell from re-parsing arguments (`tests/protocol.test.mjs:413`).
- Over `cross-spawn`: it is a runtime package with dependencies of its own
  that ADR-007's screen would have to admit, and cmd.exe expands `%` inside
  quotes: a batch line `@echo "%OS%"` run by `cmd.exe /d /c` prints
  `"Windows_NT"`. Refusing such characters is easier to verify than escaping
  them (inferred); `tests/protocol.test.mjs:445` pins the refusal.
- Over native executables only: the first public release already found npm's
  shim (`git show 0.3.2:src/cli.ts`, line 13:
  `path.join(appData, "npm", "claude.cmd")`), so those installs would break.
- Over a single CLI path: installs on one machine need different choices:
  "Chrome integration isn't supported in Windows Subsystem for Linux (WSL)"
  (Claude Code docs, *Use Claude Code with Chrome*), and "The sandbox runs on
  macOS, Linux, and WSL2. On native Windows, Claude Code runs commands
  unsandboxed" (Claude Code docs, *Sandboxing*).

The design:

- `cliSpawnSpec` in `src/protocol/client.ts` alone shapes the launch:
  - WSL: `wsl.exe --cd <vault> --exec sh -lc 'exec "<cli>" "$@"' sh <args...>`.
    Only the CLI path is shell text: double-quoted, a leading `~/` left
    outside, so `$VAR` and `$(…)` in it still expand, deliberately, as in a
    terminal. Arguments are positional parameters.
  - `.cmd`/`.bat` on Windows: cmd.exe (`shell: true`) with the path and
    arguments quoted; an argument matching `CMD_UNSAFE` (`"`, `%`, `!`, `&`,
    pipe, `<`, `>`, `^`, CR, LF) is refused.
  - Otherwise: the path and an argument array with `shell: false`.
- Detection (`src/cli.ts`) when no path is set: known install paths, then
  `which`/`where` (`.exe` over `.cmd`, POSIX shims skipped), and on Windows
  the default WSL distro (`wsl.exe -- sh -lc "command -v claude"`, a fixed
  string). Cached per profile; `useWsl` is saved to match where the CLI was
  found.
- Profiles hold `name`, `cliPath`, `useWsl`, `chrome`, `sandbox` and
  `extraArgs`; one is the default, each conversation picks one. Chrome and
  sandbox toggles add nothing unless set; sandbox is not offered on native
  Windows. Flags the panel sets itself are refused as extra arguments
  (`src/cli-args.ts`). Changes apply when settings close, by respawning idle
  sessions.
- The `!` escape follows the same WSL rule (ADR-011).
- Validation: `tests/protocol.test.mjs`, `tests/cli-args.test.mjs` and
  `tests/bash.test.mjs` pin the shapes.

## Consequences

- Users of the npm shim must drop unsafe characters or install the native
  build.
- The CLI inherits Obsidian's environment.
- Extra arguments can widen what Claude may do (`--allowedTools`, a
  permissive `--settings`); that is the user's call, as on a command line.
- Open risk: `cliPath` and `extraArgs` decide what executes. They are
  device-local by default; if the user syncs the `cli` unit, `data.json`
  chooses the executable on every device. See ADR-009.
- Open risk: `StoredConversation` records no profile. A reopened
  conversation launches on its tab's profile (the default in a new tab) and
  may `--resume` a session that belongs to another install.
