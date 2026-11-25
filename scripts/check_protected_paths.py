#!/usr/bin/env python3
"""Fail-closed PreToolUse boundary for human-owned governance paths.

Protected paths are blocked; ask-first paths return an "ask" decision so a
human confirms the edit. A path outside the repository also asks, unless it is
under a folder in `permissions.additionalDirectories` of the gitignored local
settings, which keeps machine-local paths out of the shared configuration.
Protection follows the path's own repository: the lists apply relative to
every checkout or folder above the path that the scaffold governs (it holds
`.agentic/version`, or its main checkout does), so a listed folder silences
the ask and never opens a protected path of a sibling checkout or worktree.
Git's own folder and a worktree's `.git` pointer file are blocked at each of
those folders too: the pointer names the checkout that governs a worktree.
A `.git` entry that is there and cannot be followed governs its folder.
Both the path as written and its symlink target are judged; the stricter wins.
"""

from __future__ import annotations

import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any


# Entries ending in / protect a prefix; every other entry is exact.
PROTECTED_GOVERNANCE = (
    "Makefile",
    # GNU make reads these two before Makefile.
    "GNUmakefile",
    "makefile",
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
# The local settings list the outside folders this hook lets through.
# package.json holds the gate's npm scripts and dependency ranges, but feature
# work edits it too (a new testable module joins pretest), so it asks.
ASK_FIRST = (
    "docs/current/adr/",
    ".claude/settings.local.json",
    "package.json",
)

LOCAL_SETTINGS = ".claude/settings.local.json"
# The file that marks a folder as governed by the scaffold.
VERSION_FILE = ".agentic/version"
# Git's folder, or the one-line file that points a linked worktree at it. The pointer decides which checkout
# governs a worktree, and git runs the hooks and the config the folder holds; no file tool has a reason to write either.
GIT_ENTRIES = (".git", ".git/")
# A pointer file holds one path; the hook reads no more of it than this.
POINTER_BYTES = 4096
# The local settings are read whole or not at all: a longer file lists no folder.
LOCAL_SETTINGS_BYTES = 1 << 20


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


def pointer_text(path: Path, limit: int = POINTER_BYTES) -> str:
    """The start of a regular file, at most `limit` bytes. Anything else raises OSError unread: a FIFO would hold
    the hook past its timeout and a device such as /dev/zero never ends, and the hook reads these files before it
    decides."""
    if not stat.S_ISREG(path.stat().st_mode):
        raise OSError(f"not a regular file: {path}")
    # O_NONBLOCK: a FIFO put there after the stat must not hold the open either.
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOCTTY", 0))
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise OSError(f"not a regular file: {path}")
        data = b""
        while len(data) < limit and (chunk := os.read(descriptor, limit - len(data))):
            data += chunk
        return data.decode("utf-8")
    finally:
        os.close(descriptor)


def present(path: Path) -> bool:
    """Whether a name is taken, by anything: a dangling link counts. An entry that cannot be looked at raises."""
    try:
        path.lstat()
    except (FileNotFoundError, NotADirectoryError):
        return False
    return True


def repository(folder: Path) -> bool:
    """Whether a folder holds what git asks of a repository: `objects/` and `refs/`."""
    return (folder / "objects").is_dir() and (folder / "refs").is_dir()


def main_checkout(checkout: Path) -> Path | None:
    """The checkout that holds a linked worktree's repository. None where git says the folder is no linked
    worktree: no `.git` entry, git's own folder, or a pointer to a git folder without a `commondir` (a submodule,
    a separate git folder). Any other entry raises OSError or ValueError: it cannot be read as git writes it,
    and that includes a folder that holds no repository."""
    entry = checkout / ".git"
    if not present(entry):
        return None
    if entry.is_dir():
        if not repository(entry):
            raise OSError(f"no git folder: {entry}")
        return None
    pointer = pointer_text(entry)
    if not pointer.startswith("gitdir:"):
        raise ValueError(f"not a git pointer: {entry}")
    gitdir = checkout / pointer.removeprefix("gitdir:").strip()
    if not (gitdir / "HEAD").is_file():
        raise OSError(f"the pointer leads to no git folder: {entry}")
    if not present(gitdir / "commondir"):
        if not repository(gitdir):
            raise OSError(f"the pointer leads to no repository: {entry}")
        return None
    named = pointer_text(gitdir / "commondir").strip()
    common = (gitdir / named).resolve()
    if not named or not repository(common):
        raise OSError(f"the pointer leads to no repository: {entry}")
    return common.parent if common.name == ".git" else None


def governed(folder: Path) -> bool:
    """Whether the scaffold governs a folder: it holds the version file, or it is a linked worktree of a checkout
    that does (a worktree of a commit older than the scaffold is governed too). A `.git` entry that is there and
    cannot be followed governs the folder as well: read as "no worktree", a pointer made unreadable took the
    protection off the worktree it names."""
    if (folder / VERSION_FILE).is_file():
        return True
    try:
        main = main_checkout(folder)
    except (OSError, ValueError, RuntimeError):
        return True
    return main is not None and (main / VERSION_FILE).is_file()


def governed_roots(absolute: Path) -> list[Path]:
    """Every folder above a path that the scaffold governs."""
    return [ancestor for ancestor in absolute.parents if governed(ancestor)]


def names_of(absolute: Path, project_dir: Path) -> list[str]:
    """The path relative to this repository and to every governed folder above it."""
    names = [absolute.relative_to(root).as_posix() for root in governed_roots(absolute)]
    in_project = repo_relative(absolute, project_dir)
    return names if in_project is None or in_project in names else [in_project, *names]


def local_folders(project_dir: Path) -> list[Path]:
    """Outside folders the user lets agents edit without this hook asking. Settings that are no regular file of
    at most LOCAL_SETTINGS_BYTES list none."""
    try:
        text = pointer_text(project_dir / LOCAL_SETTINGS, LOCAL_SETTINGS_BYTES + 1)
        if len(text.encode("utf-8")) > LOCAL_SETTINGS_BYTES:
            return []
        entries = json.loads(text)["permissions"]["additionalDirectories"]
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
    return any(
        name not in PROTECTED_EXCEPTIONS and matches(name, PROTECTED_GOVERNANCE + GIT_ENTRIES)
        for absolute in spellings
        for name in names_of(absolute, project_dir)
    )


def confirmation_reason(raw_path: str, project_dir: Path) -> str | None:
    spellings = path_spellings(raw_path, project_dir)
    if spellings is None:
        return None
    names = [name for absolute in spellings for name in names_of(absolute, project_dir)]
    target = spellings[1]
    if target == (project_dir / LOCAL_SETTINGS).resolve() or any(matches(name, ASK_FIRST) for name in names):
        return f"Edits a decision in force, package.json or the local settings: {raw_path}"
    # Where the edit lands decides; approved folders are stored resolved.
    if repo_relative(target, project_dir) is None and not any(
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
