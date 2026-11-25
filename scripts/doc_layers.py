#!/usr/bin/env python3
"""Shared rules for the current, work, and records document layers."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Callable, Iterable, Iterator
from urllib.parse import quote, unquote


CURRENT = "docs/current"
WORK = "docs/work"
RECORDS = "docs/records"
# Drafts in these folders move from work to current when approved.
APPROVABLE = ("adr", "product", "design")
# Finished items in these folders move from work to records when closed.
CLOSABLE = ("tasks", "changes", "research")
# A numbered file in these folders starts with its ID: ADR-001-slug.md.
PREFIXES = {"adr": "ADR", "product": "PRD", "design": "DES", "tasks": "TASK", "changes": "CHG"}

SKIPPED_DIRS = {".git", ".venv", "build", "dist", "node_modules", "target", "vendor"}
STATUS_LINE = re.compile(r"^\*\*Status:\*\*[ \t]*(.*?)[ \t]*$", re.MULTILINE)
LINK = re.compile(r"(\]\()(<[^>\n]+>|[^)\s]+)((?:\s+\"[^\"]*\")?\))")
LINK_DEFINITION = re.compile(r"^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>\n]+>|\S+)(.*)$")
EXTERNAL = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|#|/)")
INLINE_CODE = re.compile(r"`[^`]*`")
FENCE = re.compile(r"^[ \t]*(`{3,}|~{3,})")


def markdown_files(root: Path) -> Iterator[Path]:
    for directory, subdirectories, files in os.walk(root):
        subdirectories[:] = sorted(d for d in subdirectories if d not in SKIPPED_DIRS)
        for name in sorted(files):
            if name.endswith(".md"):
                yield Path(directory) / name


def fenced(lines: Iterable[str]) -> Iterator[tuple[bool, str]]:
    """Yield (in_code, line): a fence line and what it encloses are code. A fence closes on a line of its own
    character, at least as long, with nothing after it; any other fence line inside it is code."""
    fence = ""
    for line in lines:
        found = FENCE.match(line)
        if fence:
            if found and found.group(1)[0] == fence[0] and len(found.group(1)) >= len(fence) \
                    and not line.strip().lstrip(fence[0]):
                fence = ""
            yield True, line
        elif found:
            fence = found.group(1)
            yield True, line
        else:
            yield False, line


def prose_lines(text: str) -> Iterator[tuple[bool, str]]:
    """Yield (is_prose, line) with line endings; fenced code is not prose."""
    for in_code, line in fenced(text.splitlines(keepends=True)):
        yield not in_code, line


def headings(text: str) -> Iterator[str]:
    for is_prose, line in prose_lines(text):
        if is_prose and re.match(r"^#{1,6}[ \t]", line):
            yield line.lstrip("#").strip()


def substitute_target(target: str, replace: Callable[[str], str | None]) -> str | None:
    angle = target.startswith("<") and target.endswith(">")
    inner = target[1:-1] if angle else target
    if EXTERNAL.match(inner):
        return None
    new_target = replace(inner)
    if new_target is None:
        return None
    return f"<{unquote(new_target)}>" if angle else new_target


def rewrite_links(text: str, replace: Callable[[str], str | None]) -> str:
    """Apply replace to each relative link target outside code; None keeps it."""
    lines: list[str] = []
    for is_prose, line in prose_lines(text):
        if not is_prose:
            lines.append(line)
            continue
        definition = LINK_DEFINITION.match(line)
        if definition:
            new_target = substitute_target(definition.group(2), replace)
            if new_target is not None:
                line = (
                    definition.group(1)
                    + new_target
                    + definition.group(3)
                    + line[definition.end() :]
                )
            lines.append(line)
            continue
        code = [span.span() for span in INLINE_CODE.finditer(line)]

        def substitute(match: re.Match[str]) -> str:
            if any(start <= match.start() < end for start, end in code):
                return match.group(0)
            new_target = substitute_target(match.group(2), replace)
            if new_target is None:
                return match.group(0)
            return match.group(1) + new_target + match.group(3)

        lines.append(LINK.sub(substitute, line))
    return "".join(lines)


def link_targets(text: str) -> list[str]:
    targets: list[str] = []

    def collect(target: str) -> None:
        targets.append(target)

    rewrite_links(text, collect)
    return targets


def split_anchor(target: str) -> tuple[str, str]:
    match = re.match(r"([^#?]*)(.*)", target)
    assert match is not None
    return match.group(1), match.group(2)


def resolve(source: Path, target: str) -> Path | None:
    """Absolute path a relative link points to; None for a same-file anchor."""
    path, _ = split_anchor(target)
    if not path:
        return None
    return (source.parent / unquote(path)).resolve()


def relative_link(from_directory: Path, destination: Path) -> str:
    return quote(Path(os.path.relpath(destination, from_directory)).as_posix())


def status_of(text: str) -> str | None:
    match = STATUS_LINE.search(text)
    return match.group(1).lower() if match else None


def set_status(text: str, value: str) -> str:
    if not STATUS_LINE.search(text):
        raise ValueError("document has no **Status:** line")
    return STATUS_LINE.sub(f"**Status:** {value}", text, count=1)


def frontmatter(text: str) -> str | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 3)
    return text[4 : end + 1] if end != -1 else None


def frontmatter_status(text: str) -> str | None:
    block = frontmatter(text)
    match = re.search(r"^status:[ \t]*(\S+)", block or "", re.MULTILINE)
    return match.group(1).lower() if match else None


def set_frontmatter_status(text: str, value: str) -> str:
    block = frontmatter(text)
    if block is None or not re.search(r"^status:", block, re.MULTILINE):
        raise ValueError("document has no frontmatter status")
    updated = re.sub(r"^status:.*$", f"status: {value}", block, count=1, flags=re.MULTILINE)
    return "---\n" + updated + text[4 + len(block) :]
