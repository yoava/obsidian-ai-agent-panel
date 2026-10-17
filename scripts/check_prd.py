#!/usr/bin/env python3
"""Structural EARS checks for accepted and draft PRD documents."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


STATUS = re.compile(r"^\*\*Status:\*\* (?:draft|accepted \(\d{4}-\d{2}-\d{2}\))$")
HEADING = re.compile(r"^# (PRD-\d+) — ")
REQUIREMENT = re.compile(r"^- \*\*(PRD-\d+\.R\d+)\*\*")
BANNED = {"should", "may", "will"}


def clause_errors(clause: str, requirement_id: str) -> list[str]:
    errors: list[str] = []
    if not re.match(r"^(?:The |WHEN |WHILE |IF |WHERE )", clause):
        errors.append(f"{requirement_id}: clause does not use an EARS opening")
    words = re.findall(r"[A-Za-z0-9]+", clause.lower())
    shall_count = words.count("shall")
    if shall_count != 1:
        errors.append(f"{requirement_id}: {shall_count} shalls (want exactly 1)")
    for word in sorted(BANNED.intersection(words)):
        errors.append(f'{requirement_id}: banned word "{word}"')
    if clause.startswith("IF ") and " THEN " not in clause:
        errors.append(f"{requirement_id}: IF clause missing THEN")
    if re.match(r"^(when|if|where|while) ", clause):
        errors.append(f"{requirement_id}: lowercase EARS keyword opening clause")
    return errors


def validate(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        return [f"(file): cannot read ({error})"]

    filename_match = re.match(r"PRD-(\d+)", path.name)
    document_id = ""
    for line in lines:
        match = HEADING.match(line)
        if match:
            document_id = match.group(1)
            break
    if not document_id:
        errors.append("(file): missing PRD document heading")
    if filename_match and document_id != f"PRD-{filename_match.group(1)}":
        errors.append("(file): PRD heading does not match filename")

    status_lines = [line for line in lines if line.startswith("**Status:**")]
    if not status_lines:
        errors.append("(file): missing Status line")
    elif len(status_lines) != 1 or not STATUS.fullmatch(status_lines[0]):
        errors.append("(file): bad Status line")

    try:
        start = lines.index("## Requirements") + 1
    except ValueError:
        errors.append("(file): missing Requirements section")
        return errors
    end = next(
        (index for index in range(start, len(lines)) if lines[index].startswith("## ")),
        len(lines),
    )

    seen: set[str] = set()
    current_id = ""
    clauses: list[str] = []
    active_clause: list[str] = []
    requirement_count = 0

    def flush_clause() -> None:
        nonlocal active_clause
        if active_clause:
            clauses.append(" ".join(active_clause))
            active_clause = []

    def flush_requirement() -> None:
        nonlocal clauses
        flush_clause()
        if current_id and not clauses:
            errors.append(f"{current_id}: no acceptance clauses")
        for clause in clauses:
            errors.extend(clause_errors(clause, current_id))
        clauses = []

    for line in lines[start:end]:
        requirement_match = REQUIREMENT.match(line)
        if requirement_match:
            flush_requirement()
            current_id = requirement_match.group(1)
            requirement_count += 1
            if current_id in seen:
                errors.append(f"{current_id}: duplicate requirement id")
            seen.add(current_id)
            if document_id and not current_id.startswith(f"{document_id}.R"):
                errors.append(f"{current_id}: requirement id does not match PRD filename")
            continue
        if line.startswith("  - "):
            flush_clause()
            active_clause = [line[4:]]
            continue
        if line.startswith("    ") and active_clause:
            active_clause.append(line.strip())
            continue
        flush_clause()

    flush_requirement()
    if requirement_count == 0:
        errors.append("(file): Requirements section has no requirements")
    return errors


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("files", nargs="+", type=Path)
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    failed = False
    for path in args.files:
        for error in validate(path):
            print(f"{path}: {error}", file=sys.stderr)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
