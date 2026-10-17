#!/usr/bin/env python3
"""Deterministic repository-governance checks used by local and CI gates."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import doc_layers as layers  # noqa: E402


ROOT = Path(__file__).resolve().parent.parent
REQUIRED = (
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".agentic/version",
    ".agentic/templates/adr.md",
    ".agentic/templates/change.md",
    ".agentic/templates/design.md",
    ".agentic/templates/prd.md",
    ".agentic/templates/task.md",
    ".agentic/templates/verification.md",
    "docs/current/constitution.md",
    "docs/current/adr/ADR-000-adr-process.md",
    "docs/current/adr/README.md",
    "docs/current/plan.md",
    "docs/current/open-decisions.md",
    "docs/records/log.md",
    ".claude/settings.json",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/workflows/ci.yml",
    ".gitignore",
    ".markdownlint.jsonc",
    "scripts/check_prd.py",
    "scripts/check_protected_paths.py",
    "scripts/check_governance.py",
    "scripts/doc_layers.py",
    "scripts/move_doc.py",
    "scripts/test_agentic_gates.py",
    "Makefile",
)

ACCEPTED = re.compile(r"^accepted \(\d{4}-\d{2}-\d{2}\)$")
INCORPORATED = re.compile(r"^incorporated \(\d{4}-\d{2}-\d{2}\)$")
# Heading names that carry history; an optional "(...)" suffix such as a date.
HISTORY_NAME = re.compile(
    r"^(?:history|log|status log|change ?log|run log|revision history|review history|"
    r"change history|dispositions?|disposition ledger)(?:\s*\(.*\))?$",
    re.IGNORECASE,
)
HISTORY_PREFIX = re.compile(r"^(?:amendments?|review rounds?|disposition)\b", re.IGNORECASE)
SUPERSEDED = re.compile(r"\(superseded\)", re.IGNORECASE)
ADR_FILE = re.compile(r"^ADR-(\d{3,})-.+\.md$")
ADR_ROW = re.compile(r"^\|\s*\[?ADR-(\d{3,})\b", re.MULTILINE)
NUMBERED = re.compile(r"^(?:([A-Z]+)-)?\d{3,}\b")
ADR_SECTIONS = ("context", "options considered", "decision", "consequences")
RECOMMENDED = re.compile(r"\(recommended(?:,[^)]*)?\)", re.IGNORECASE)
# Subfolders each layer may hold; files directly in a layer are allowed.
LAYER_FOLDERS = {
    "current": {"adr", "product", "design", "runbooks"},
    "work": {"adr", "product", "design", "changes", "tasks", "research"},
    "records": {"tasks", "changes", "research", "verification"},
}


def relative(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def documents(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(path for path in folder.rglob("*.md") if path.name != "README.md")


def is_history(heading: str) -> bool:
    return bool(
        HISTORY_NAME.match(heading) or HISTORY_PREFIX.match(heading) or SUPERSEDED.search(heading)
    )


def option_entries(body: str) -> list[str]:
    """One line per option: its ### heading, table row, or list item."""
    subheadings = re.findall(r"^### .*$", body, re.MULTILINE)
    if subheadings:
        return subheadings
    rows = [
        line
        for line in body.splitlines()
        if line.startswith("|") and not re.fullmatch(r"\|[\s:|-]*", line.strip())
    ]
    if rows:
        return rows[1:]
    return re.findall(r"^(?:[-*+]|\d+\.)\s.*$", body, re.MULTILINE)


def option_count(body: str) -> int:
    return len(option_entries(body))


def recommended_count(body: str) -> int:
    return sum(1 for entry in option_entries(body) if RECOMMENDED.search(entry))


def check_placement(root: Path) -> list[str]:
    errors: list[str] = []
    docs = root / "docs"
    for path in layers.markdown_files(docs):
        parts = path.relative_to(docs).parts
        if parts == ("README.md",):
            continue
        if parts[0] not in LAYER_FOLDERS or len(parts) == 1:
            errors.append(
                f"{relative(root, path)}: every document sits in "
                f"{layers.CURRENT}/, {layers.WORK}/ or {layers.RECORDS}/"
            )
        elif len(parts) > 2 and parts[1] not in LAYER_FOLDERS[parts[0]]:
            allowed = ", ".join(sorted(LAYER_FOLDERS[parts[0]]))
            errors.append(
                f"{relative(root, path)}: docs/{parts[0]}/ holds only {allowed} folders"
            )
    return errors


def sections(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    current = None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip().lower()
            result[current] = ""
        elif current is not None:
            result[current] += line + "\n"
    return result


def check_statuses(root: Path) -> list[str]:
    errors: list[str] = []
    for kind in layers.APPROVABLE:
        for path in documents(root / layers.CURRENT / kind):
            status = layers.status_of(path.read_text(encoding="utf-8"))
            if status is None or not ACCEPTED.match(status):
                errors.append(
                    f"{relative(root, path)}: {layers.CURRENT}/ holds accepted "
                    f"documents only (status: {status})"
                )
        for path in documents(root / layers.WORK / kind):
            status = layers.status_of(path.read_text(encoding="utf-8"))
            if status is None or not status.startswith(("draft", "proposed")):
                errors.append(
                    f"{relative(root, path)}: {layers.WORK}/ holds draft or proposed "
                    f"documents only (status: {status}); approve with make approve"
                )
    for path in documents(root / layers.WORK / "changes"):
        if layers.status_of(path.read_text(encoding="utf-8")) != "draft":
            errors.append(f"{relative(root, path)}: an open change delta is draft")
    for path in documents(root / layers.RECORDS / "changes"):
        status = layers.status_of(path.read_text(encoding="utf-8")) or ""
        if not INCORPORATED.match(status):
            errors.append(f"{relative(root, path)}: a closed change delta is incorporated")
    for folder, allowed in (
        (root / layers.WORK / "tasks", {"planned", "active"}),
        (root / layers.RECORDS / "tasks", {"closed"}),
    ):
        if not folder.is_dir():
            continue
        for path in sorted(folder.rglob("*.md")):
            status = layers.frontmatter_status(path.read_text(encoding="utf-8"))
            if status not in allowed:
                errors.append(
                    f"{relative(root, path)}: task status {status} not in "
                    f"{sorted(allowed)}; close finished tasks with make close"
                )
    return errors


def check_current_has_no_history(root: Path) -> list[str]:
    errors: list[str] = []
    for path in layers.markdown_files(root / layers.CURRENT):
        for heading in layers.headings(path.read_text(encoding="utf-8")):
            if is_history(heading):
                errors.append(
                    f"{relative(root, path)}: history section '{heading}' in a current "
                    "document; rewrite in place and put the why in Git"
                )
    return errors


def check_adrs(root: Path) -> list[str]:
    errors: list[str] = []
    current = root / layers.CURRENT / "adr"
    for path in documents(current):
        found = sections(path.read_text(encoding="utf-8"))
        for name in ADR_SECTIONS:
            if not found.get(name, "").strip():
                errors.append(f"{relative(root, path)}: missing or empty '{name}' section")
        options = found.get("options considered", "")
        if option_count(options) < 2:
            errors.append(f"{relative(root, path)}: fewer than two options considered")
        if recommended_count(options) != 1:
            errors.append(
                f"{relative(root, path)}: an accepted ADR marks exactly one option "
                "(recommended)"
            )
    for path in documents(root / layers.WORK / "adr"):
        options = sections(path.read_text(encoding="utf-8")).get("options considered", "")
        if recommended_count(options) > 1:
            errors.append(f"{relative(root, path)}: more than one option marked (recommended)")

    numbers: dict[str, list[Path]] = {}
    for folder in (current, root / layers.WORK / "adr"):
        for path in documents(folder):
            match = ADR_FILE.match(path.name)
            if match:
                numbers.setdefault(match.group(1), []).append(path)
    index_path = current / "README.md"
    index = index_path.read_text(encoding="utf-8") if index_path.is_file() else ""
    in_force, _, retired_part = index.partition("## Retired")
    listed = set(ADR_ROW.findall(in_force))
    retired = set(ADR_ROW.findall(retired_part))
    for number, paths in sorted(numbers.items()):
        names = ", ".join(relative(root, path) for path in paths)
        if len(paths) > 1:
            errors.append(f"ADR-{number} used by more than one file: {names}")
        if number in retired:
            errors.append(f"ADR-{number} is retired and never reused: {names}")
        in_current = any(current in path.parents for path in paths)
        if in_current and number not in listed:
            errors.append(f"{relative(root, index_path)}: ADR-{number} missing from index")
    for number in sorted(listed):
        if not any(current in path.parents for path in numbers.get(number, [])):
            errors.append(
                f"{relative(root, index_path)}: lists ADR-{number} with no file in "
                f"{layers.CURRENT}/adr/"
            )
    return errors


def check_prefixes(root: Path) -> list[str]:
    errors: list[str] = []
    for layer in (layers.CURRENT, layers.WORK, layers.RECORDS):
        for kind, prefix in layers.PREFIXES.items():
            for path in documents(root / layer / kind):
                match = NUMBERED.match(path.name)
                if match and match.group(1) != prefix:
                    errors.append(
                        f"{relative(root, path)}: a numbered file here is named {prefix}-NNN-slug.md"
                    )
    return errors


def check_links(root: Path) -> list[str]:
    errors: list[str] = []
    resolved_root = root.resolve()
    for path in layers.markdown_files(root):
        for target in layers.link_targets(path.read_text(encoding="utf-8")):
            destination = layers.resolve(path, target)
            if destination is None:
                continue
            try:
                destination.relative_to(resolved_root)
            except ValueError:
                continue
            if not destination.exists():
                errors.append(f"{relative(root, path)}: broken link {target}")
    return errors


def check_layers(root: Path) -> list[str]:
    errors = [
        f"{relative(root, path)}: templates belong in .agentic/templates/"
        for path in sorted((root / "docs").rglob("_template*.md"))
    ]
    errors.extend(check_placement(root))
    errors.extend(check_statuses(root))
    errors.extend(check_current_has_no_history(root))
    errors.extend(check_prefixes(root))
    errors.extend(check_adrs(root))
    errors.extend(check_links(root))
    return errors


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for relative_path in REQUIRED:
        if not (root / relative_path).is_file():
            errors.append(f"missing required file: {relative_path}")
    if errors:
        return errors

    agents = (root / "AGENTS.md").read_text(encoding="utf-8")
    constitution = (root / "docs/current/constitution.md").read_text(encoding="utf-8")
    plan = (root / "docs/current/plan.md").read_text(encoding="utf-8")
    for relative_path, text in (
        ("AGENTS.md", agents),
        ("docs/current/constitution.md", constitution),
        ("docs/current/plan.md", plan),
    ):
        if "[TODO:" in text:
            errors.append(f"{relative_path}: unresolved customization TODO")
    if len(agents.splitlines()) > 220:
        errors.append("AGENTS.md: exceeds 220 lines; prune discoverable context")
    if "AGENTS.md" not in (root / "CLAUDE.md").read_text(encoding="utf-8"):
        errors.append("CLAUDE.md: does not point to canonical AGENTS.md")
    if "human decision" not in constitution.lower():
        errors.append("docs/current/constitution.md: human ownership is not explicit")

    makefile = (root / "Makefile").read_text(encoding="utf-8")
    for target in ("help", "docs", "approve", "close", "build", "format", "lint", "test", "verify"):
        if not re.search(rf"^{target}:", makefile, re.MULTILINE):
            errors.append(f"Makefile: missing target {target}")

    ci = (root / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    if "permissions:\n  contents: read" not in ci:
        errors.append(".github/workflows/ci.yml: read-only default permission missing")
    if "make verify" not in ci:
        errors.append(".github/workflows/ci.yml: does not run make verify")
    for line in ci.splitlines():
        match = re.search(r"\buses:\s+\S+@([^\s#]+)", line)
        if match and not re.fullmatch(r"[0-9a-fA-F]{40}", match.group(1)):
            errors.append(f".github/workflows/ci.yml: action not SHA-pinned: {line.strip()}")

    try:
        settings = json.loads(
            (root / ".claude/settings.json").read_text(encoding="utf-8")
        )
    except json.JSONDecodeError as error:
        errors.append(f".claude/settings.json: invalid JSON ({error})")
    else:
        hooks = json.dumps(settings.get("hooks", {}))
        if "check_protected_paths.py" not in hooks:
            errors.append(".claude/settings.json: protected-path hook missing")
        if "make lint-fast" not in hooks:
            errors.append(".claude/settings.json: fast Stop hook missing")

    protected = (root / "scripts/check_protected_paths.py").read_text(
        encoding="utf-8"
    )
    for path in (
        "Makefile",
        ".agentic/",
        ".claude/settings.json",
        ".github/workflows/",
        ".dependency-cruiser.cjs",
        ".go-arch-lint.yml",
        "deny.toml",
        "docs/current/adr/ADR-000-adr-process.md",
        "docs/current/constitution.md",
        "scripts/",
    ):
        if f'"{path}"' not in protected:
            errors.append(f"scripts/check_protected_paths.py: missing {path}")

    errors.extend(check_layers(root))
    return errors


def main() -> int:
    errors = validate()
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("governance: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
