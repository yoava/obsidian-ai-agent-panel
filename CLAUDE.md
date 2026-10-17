# AI Agent Panel

@AGENTS.md

## Claude Code only

- `.claude/settings.json` is committed and shared, so it stays least
  privilege: gate commands allowed, `git push` asks, destructive git and secret
  reads denied, bypass mode disabled, the protected-path PreToolUse hook
  (`scripts/check_protected_paths.py`), and the advisory `make lint-fast` Stop
  hook. Personal settings (`defaultMode`, wider allows) and hooks that name a
  machine-local binary, such as graphify's `hook-guard`, go in
  `.claude/settings.local.json` (gitignored); Claude Code merges both files.
- The protected-path hook asks before an edit outside the repository, unless
  the path is under a folder in `permissions.additionalDirectories` of
  `.claude/settings.local.json` (absolute paths); edits to that file ask too.
- Committed hooks run with your privileges. Before reviewing an untrusted
  branch, set `"disableAllHooks": true` in `.claude/settings.local.json`.
- The graphify skill is `.claude/skills/graphify/` (`/graphify`).
