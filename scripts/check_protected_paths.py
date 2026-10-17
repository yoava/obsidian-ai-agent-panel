#!/usr/bin/env python3
"""Fail-closed PreToolUse boundary for human-owned governance paths.

Protected paths are blocked; ask-first paths return an "ask" decision so a
human confirms the edit. A path outside the repository also asks, unless it is
under a folder in `permissions.additionalDirectories` of the gitignored local
settings, which keeps machine-local paths out of the shared configuration.
Both the path as written and its symlink target are judged; the stricter wins.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any


# Entries ending in / protect a prefix; every other entry is exact.
PROTECTED_GOVERNANCE = (
    "Makefile",
    ".agentic/",
    ".claude/settings.json",
    ".github/workflows/",
    ".markdownlint.jsonc",
    ".dependency-cruiser.cjs",
    ".go-arch-lint.yml",
    "deny.toml",
    "docs/current/adr/ADR-000-adr-process.md",
    "docs/current/constitution.md",
    "scripts/",
    # Project gates, toolchain, supply chain, and release policy.
    ".github/dependabot.yml",
    ".nvmrc",
    ".npmrc",
    "LICENSE",
    "eslint.config.mjs",
    "package-lock.json",
    "tsconfig.json",
    "version-bump.mjs",
)

# Documentation about the gates, not a gate itself; safe for agents to edit.
PROTECTED_EXCEPTIONS = (
    "scripts/README.md",
)

# Decisions in force change rarely; a human confirms each edit.
# package.json holds the gate's npm scripts and dependency ranges, but feature
# work edits it too (a new testable module joins pretest), so it asks.
# The local settings list the outside folders this hook lets through.
ASK_FIRST = (
    "docs/current/adr/",
    "package.json",
    ".claude/settings.local.json",
)

LOCAL_SETTINGS = ".claude/settings.local.json"


def path_spellings(raw_path: str, project_dir: Path) -> tuple[Path, Path] | None:
    """The path as written and with symlinks resolved; None blocks it."""
    if not isinstance(raw_path, str) or not raw_path:
        return None
    root = project_dir.resolve()
    portable = raw_path.replace("\\", "/")
    if os.name != "nt" and re.match(r"^[A-Za-z]:/", portable):
        return None
    candidate = Path(portable)
    joined = candidate if candidate.is_absolute() else root / candidate
    return Path(os.path.normpath(joined)), joined.resolve()


def repo_relative(absolute: Path, project_dir: Path) -> str | None:
    """Relative to the repository, also when reached through another mount."""
    root = project_dir.resolve()
    if absolute.is_relative_to(root):
        return absolute.relative_to(root).as_posix()
    for ancestor in absolute.parents:
        try:
            if ancestor.samefile(root):
                return absolute.relative_to(ancestor).as_posix()
        except OSError:
            continue
    return None


def local_folders(project_dir: Path) -> list[Path]:
    """Outside folders the user lets agents edit without this hook asking."""
    try:
        settings = json.loads((project_dir / LOCAL_SETTINGS).read_text(encoding="utf-8"))
        entries = settings["permissions"]["additionalDirectories"]
    except (OSError, ValueError, KeyError, TypeError):
        return []
    if not isinstance(entries, list):
        return []
    root = project_dir.resolve()
    folders = []
    for entry in entries:
        if not isinstance(entry, str) or not entry:
            continue
        try:
            folders.append((root / Path(entry).expanduser()).resolve())
        except (OSError, RuntimeError, ValueError):
            continue  # An entry that cannot be resolved approves nothing.
    return folders


def matches(normalized: str, entries: tuple[str, ...]) -> bool:
    return any(
        normalized.startswith(entry) if entry.endswith("/") else normalized == entry
        for entry in entries
    )


def is_protected(raw_path: str, project_dir: Path) -> bool:
    spellings = path_spellings(raw_path, project_dir)
    if spellings is None:
        return True
    for absolute in spellings:
        normalized = repo_relative(absolute, project_dir)
        if normalized is None or normalized in PROTECTED_EXCEPTIONS:
            continue
        if matches(normalized, PROTECTED_GOVERNANCE):
            return True
    return False


def confirmation_reason(raw_path: str, project_dir: Path) -> str | None:
    spellings = path_spellings(raw_path, project_dir)
    if spellings is None:
        return None
    names = [repo_relative(absolute, project_dir) for absolute in spellings]
    target = spellings[1]
    if target == (project_dir / LOCAL_SETTINGS).resolve() or any(
        name is not None and matches(name, ASK_FIRST) for name in names
    ):
        return (
            f"Edits a human-confirmed path (decision in force, package.json "
            f"or local settings): {raw_path}"
        )
    # Where the edit lands decides; approved folders are stored resolved.
    if names[1] is None and not any(
        target.is_relative_to(folder) for folder in local_folders(project_dir)
    ):
        return f"Edits a path outside the repository: {raw_path}"
    return None


def needs_confirmation(raw_path: str, project_dir: Path) -> bool:
    return confirmation_reason(raw_path, project_dir) is not None


def paths_from_tool_input(tool_input: Any) -> list[str]:
    if not isinstance(tool_input, dict):
        return []
    candidates: list[Any] = [
        tool_input.get("file_path"),
        tool_input.get("notebook_path"),
        tool_input.get("path"),
    ]
    edits = tool_input.get("edits")
    if isinstance(edits, list):
        for edit in edits:
            if isinstance(edit, dict):
                candidates.append(edit.get("file_path"))
    return [candidate for candidate in candidates if isinstance(candidate, str)]


def main() -> int:
    try:
        return check()
    except Exception as error:  # A crashing hook would let the edit through.
        print(f"Blocked: protected-path check failed ({error})", file=sys.stderr)
        return 2


def check() -> int:
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as error:
        print(f"Blocked: malformed PreToolUse payload ({error})", file=sys.stderr)
        return 2
    paths = paths_from_tool_input(payload.get("tool_input"))
    if not paths:
        print("Blocked: write tool supplied no recognizable path", file=sys.stderr)
        return 2
    blocked = next((path for path in paths if is_protected(path, project_dir)), None)
    if blocked is not None:
        print(f"Blocked protected governance path: {blocked}", file=sys.stderr)
        return 2
    reasons = (confirmation_reason(path, project_dir) for path in paths)
    reason = next((reason for reason in reasons if reason is not None), None)
    if reason is not None:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "ask",
                        "permissionDecisionReason": reason,
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
