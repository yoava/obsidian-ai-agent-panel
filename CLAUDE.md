# AI Agent Panel

@AGENTS.md
@docs/current/runbooks/agent-work.md

## Claude Code only

- `.claude/settings.json` is committed and shared, so it stays least
  privilege: gate commands allowed, `git push` asks, destructive git and secret
  reads denied, bypass mode disabled, the protected-path PreToolUse hook
  (`scripts/check_protected_paths.py`), the `make lint-fast` Stop hook (a
  failure blocks the stop once), and the orchestrator Stop and SubagentStop
  hooks. Personal settings (`defaultMode`, wider allows) and hooks that name a
  machine-local binary, such as graphify's `hook-guard`, go in
  `.claude/settings.local.json` (gitignored); Claude Code merges both files.
- The protected-path hook asks before an edit outside the repository, unless
  the path is under a folder in `permissions.additionalDirectories` of
  `.claude/settings.local.json` (absolute paths); edits to that file ask too.
- Committed hooks run with your privileges. Review an untrusted branch in a
  throwaway clone: `"disableAllHooks": true` in `.claude/settings.local.json`
  also turns off the protected-path hook, and governance warns while it is set.
- The graphify skill is `.claude/skills/graphify/` (`/graphify`).
