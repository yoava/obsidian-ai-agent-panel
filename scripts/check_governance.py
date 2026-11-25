#!/usr/bin/env python3
"""Deterministic repository-governance checks used by local and CI gates."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import stat
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
    ".agentic/templates/brief.md",
    ".agentic/templates/review-note.md",
    ".agentic/templates/live-note.md",
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
    "scripts/orchestrator/heartbeat.sh",
    "scripts/orchestrator/gate-slot.sh",
    "scripts/orchestrator/limits.env",
    "scripts/orchestrator/stop-guard.sh",
    "scripts/orchestrator/report-capture.sh",
    "scripts/orchestrator/workspace.sh",
    "scripts/orchestrator/SHA256SUMS",
    "docs/current/runbooks/orchestration.md",
    "Makefile",
)
# Required files a release added, by that release: a repository whose .agentic/version
# is older gets a warning naming the port step, not an error, until it is ported.
REQUIRED_SINCE = {
    ".agentic/templates/brief.md": (2, 8, 0),
    ".agentic/templates/review-note.md": (2, 8, 0),
    ".agentic/templates/live-note.md": (2, 8, 0),
}
# Entries the hook's PROTECTED_GOVERNANCE must hold; a repository adds its own there, never removes these.
PROTECTED_REQUIRED = (
    "Makefile",
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
)
# GNU make reads these before Makefile, so either one replaces every protected target.
SHADOWING_MAKEFILES = ("GNUmakefile", "makefile")
# The explicit empty rule that stops make rebuilding Makefile from Makefile.sh, Makefile.c, Makefile.o or s.Makefile.
MAKEFILE_OWN_RULE = re.compile(r"^Makefile:[ \t]*;[ \t]*$", re.MULTILINE)
# The file tools whose edits the protected-path hook must see.
WRITE_TOOLS = ("Edit", "Write", "NotebookEdit")
# Keys of a hook handler that leave it a blocking command; any other (async, a condition) may keep it from blocking.
# onFailure is among them only as "block", which also stops the tool when the hook times out or cannot start.
HANDLER_KEYS = frozenset({"type", "command", "timeout", "onFailure"})
# A matcher Claude Code reads as names: tool names joined by | or a comma. Any other character makes it a pattern.
NAME_MATCHER = re.compile(r"[A-Za-z0-9_|, -]+")
# Events Claude Code fires every time: it reads no matcher there.
UNMATCHED_EVENTS = frozenset({"Stop"})
# The scaffold's hooks, each command exactly as .claude/settings.json must hold it: a hook's name inside
# another command, or a command with its exit status swallowed, protects nothing.
STOP_LINT = (
    r'''cd "$CLAUDE_PROJECT_DIR" || exit 1; python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("stop_hook_active") is True else 1)' 2>/dev/null && exit 0; out=$(make lint-fast 2>&1) && exit 0; printf '%s\n' "$out" >&2; p='before Phase 0 closes|unresolved customization TODO'; printf '%s\n' "$out" | grep ERROR | grep -Eqv "$p" && exit 2; printf '%s\n' "$out" | grep -Eq "$p" || exit 2; exit 0'''
)
HOOK_COMMANDS = {
    "PreToolUse": ("python3 \"$CLAUDE_PROJECT_DIR/scripts/check_protected_paths.py\"",),
    "Stop": (STOP_LINT, "bash \"$CLAUDE_PROJECT_DIR/scripts/orchestrator/stop-guard.sh\""),
    "SubagentStop": ("bash \"$CLAUDE_PROJECT_DIR/scripts/orchestrator/report-capture.sh\"",),
}
# Task records closed before the repository's port to 2.8, written by the port as sha256sum
# lines ("<digest>  <repository-relative path>"); the close checks skip a listed record while
# its content still has that digest, and check every other record.
LEGACY_RECORDS = ".agentic/legacy-records"
LEGACY_LINE = re.compile(r"^([0-9a-f]{64}) [ *](.+)$")

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
TASK_SIZE = re.compile(r"^size:[ \t]*(\S+)", re.MULTILINE)
# An acceptance item and its checked line, top-level list items (four spaces start a code block): the ID, the
# colon, then the text after it.
ACCEPTANCE_ID = re.compile(r"^ {0,3}[-*+]\s+(AC-\d+)\b(:?)[ \t]*(.*)$", re.MULTILINE)
CHECKED_ID = re.compile(r"^ {0,3}[-*+]\s+\[[xX]\]\s+(AC-\d+)\b(:?)[ \t]*(.*)$", re.MULTILINE)
REVIEW_FIELD = re.compile(r"^(reviewer|verdict):[ \t]*(.*?)[ \t]*$", re.MULTILINE | re.IGNORECASE)
# Placeholders compared with spaces, dots, slashes, dashes and underscores removed: N/A, N / A, N.A., not applicable.
NO_VALUE = {"", "na", "notapplicable", "none", "nobody", "pending", "tbd", "todo", "unknown"}
# A verdict that lets the task close is one of these alone, so "pass pending fixes" does not; remarks go on other
# lines. Any other verdict needs an owner override line with a reason.
ACCEPTING = re.compile(r"^(?:accepted|approved|pass|passed|lgtm|ship it)\.?$", re.IGNORECASE)
OVERRIDE = re.compile(r"^owner override:[ \t]*(.*?)[ \t]*$", re.MULTILINE | re.IGNORECASE)
EXEMPT = re.compile(r"^not required \(s\)\.?$", re.IGNORECASE)
UNCHECKED_ITEM = re.compile(r"^\s*[-*+]\s+\[ \]", re.MULTILINE)
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
# Subfolders each layer may hold; files directly in a layer are allowed.
LAYER_FOLDERS = {
    "current": {"adr", "product", "design", "runbooks"},
    "work": {"adr", "product", "design", "changes", "tasks", "research"},
    "records": {"tasks", "changes", "research", "verification"},
}


def relative(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def is_asset(path: Path, folder: Path) -> bool:
    """A file in a document's same-stem asset folder (DES-001-x/ beside DES-001-x.md)."""
    return any(
        (folder / parent.parent / f"{parent.name}.md").is_file()
        for parent in path.relative_to(folder).parents
        if parent != Path(".")
    )


def governed(folder: Path) -> list[Path]:
    """The Markdown documents under folder; asset folders move with their document."""
    if not folder.is_dir():
        return []
    return sorted(path for path in folder.rglob("*.md") if not is_asset(path, folder))


def documents(folder: Path) -> list[Path]:
    return [path for path in governed(folder) if path.name != "README.md"]


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


def prose(text: str) -> str:
    """The text without HTML comments and with fenced code blanked: neither is a record line."""
    lines = ["" if in_code else line for in_code, line in layers.fenced(COMMENT.sub("", text).splitlines())]
    return "\n".join(lines) + "\n"


def is_placeholder(value: str) -> bool:
    return value.startswith("<") or re.sub(r"[\s./_-]", "", value.lower()) in NO_VALUE


def acceptance_items(pattern: re.Pattern[str], body: str, where: str, errors: list[str]) -> list[str]:
    """The IDs in body in order; a repeated ID or one with no text after it is an error."""
    ids: list[str] = []
    for item, colon, rest in pattern.findall(body):
        if item in ids:
            errors.append(f"{where} lists {item} more than once")
            continue
        ids.append(item)
        if not colon or is_placeholder(rest.strip()):
            errors.append(f"{where} gives {item} no text: write '{item}: ...'")
    return sorted(ids, key=lambda item: int(item[3:]))


def task_close_errors(text: str) -> list[str]:
    """Why a task may not close: an accepting review, and every Spec acceptance ID checked with evidence.

    Lines inside fenced code and HTML comments do not count.
    """
    raw = sections(prose(text))
    found = {name: body.strip() for name, body in raw.items()}
    errors: list[str] = []
    for name, title in (("independent review", "Independent review"), ("outcome", "Outcome")):
        if not found.get(name) or found[name].lower().startswith("pending"):
            errors.append(f"{title} is empty or pending")
    outcome = found.get("outcome", "")
    # Items are read with their indentation, which tells a list item from a code block.
    spec = acceptance_items(ACCEPTANCE_ID, raw.get("spec", ""), "Spec", errors)
    checked = acceptance_items(CHECKED_ID, raw.get("outcome", ""), "Outcome", errors)
    if not spec:
        errors.append("Spec lists no acceptance item: list each as '- AC-N: criterion'")
    errors.extend(
        f"Outcome does not check {item}: list it as '- [x] {item}: evidence'"
        for item in spec
        if item not in checked
    )
    errors.extend(
        f"Outcome checks {item}, which the Spec does not list" for item in checked if item not in spec
    )
    if UNCHECKED_ITEM.search(outcome):
        errors.append("Outcome holds an unchecked acceptance item '- [ ]'")
    size = TASK_SIZE.search(layers.frontmatter(text) or "")
    label = size.group(1).upper() if size else None
    review = found.get("independent review", "")
    first = review.splitlines()[0].strip() if review else ""
    if first.lower().startswith("not required"):
        if label != "S":
            errors.append(
                f"size {label or 'missing'}: only S work closes without an independent review"
            )
        elif not EXEMPT.match(first):
            errors.append("an S task skips the review only with the line 'Not required (S)'")
    elif review and not review.lower().startswith("pending"):
        fields: dict[str, list[str]] = {}
        for name, value in REVIEW_FIELD.findall(review):
            fields.setdefault(name.lower(), []).append(value)
        for name in ("reviewer", "verdict"):
            values = fields.get(name, [""])
            if len(values) > 1:
                errors.append(f"Independent review has {len(values)} '{name.title()}:' lines; keep one")
            if is_placeholder(values[0]):
                errors.append(
                    f"Independent review needs a '{name.title()}: ...' line naming a real "
                    "reviewer and verdict, not empty or N/A"
                )
        verdict = fields.get("verdict", [""])[0]
        reasons = OVERRIDE.findall(review)
        if reasons and all(is_placeholder(reason) for reason in reasons):
            errors.append("Owner override needs a reason: 'Owner override: <why the owner accepts it>'")
        elif not is_placeholder(verdict) and not ACCEPTING.match(verdict) and not reasons:
            errors.append(
                f"Verdict '{verdict}' does not accept the work: record 'Verdict: accepted' alone, "
                "remarks on other lines, once the findings are resolved, or an 'Owner override: <reason>' line"
            )
    return errors


def legacy_records(root: Path) -> tuple[dict[str, str], list[int]]:
    """The listed records, path to digest, and the numbers of lines that are not sha256sum lines."""
    path = root / LEGACY_RECORDS
    records: dict[str, str] = {}
    malformed: list[int] = []
    if not path.is_file():
        return records, malformed
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = LEGACY_LINE.match(line)
        if match:
            records[match.group(2)] = match.group(1)
        else:
            malformed.append(number)
    return records, malformed


def check_closed_tasks(root: Path) -> list[str]:
    """Every closed task record passes the close checks, except those closed before the 2.8 port and unchanged since."""
    legacy, malformed = legacy_records(root)
    errors = [f"{LEGACY_RECORDS}:{number}: not a '<sha256>  <path>' line" for number in malformed]
    for path in documents(root / layers.RECORDS / "tasks"):
        name, data = relative(root, path), path.read_bytes()
        listed = legacy.get(name)
        if listed == hashlib.sha256(data).hexdigest():
            continue
        found = task_close_errors(data.decode("utf-8"))
        if listed and found:
            errors.append(f"{name}: changed since {LEGACY_RECORDS} listed it, so the close checks apply")
        errors.extend(f"{name}: {error}" for error in found)
    return errors


def version_of(text: str) -> tuple[int, ...] | None:
    match = re.fullmatch(r"\s*(\d+)\.(\d+)\.(\d+)\s*", text)
    return tuple(int(part) for part in match.groups()) if match else None


def installed_version(root: Path) -> tuple[int, ...] | None:
    path = root / ".agentic/version"
    return version_of(path.read_text(encoding="utf-8")) if path.is_file() else None


def ported_later(root: Path, relative_path: str) -> bool:
    """A file a newer release requires, missing from a repository still at an older version."""
    since = REQUIRED_SINCE.get(relative_path)
    installed = installed_version(root)
    return since is not None and installed is not None and installed < since


# The local settings are read up to this size; a larger file is not a settings file anyone wrote.
LOCAL_SETTINGS_BYTES = 1 << 20


def local_settings_text(path: Path) -> str | None:
    """The local settings file as text; None when no file is there. Anything but a regular file of at most
    LOCAL_SETTINGS_BYTES raises OSError unread: a FIFO would hold the gate for good and a device never ends."""
    try:
        if not stat.S_ISREG(path.stat().st_mode):
            raise OSError(f"not a regular file: {path}")
        # O_NONBLOCK: a FIFO put there after the stat must not hold the open either.
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOCTTY", 0))
    except (FileNotFoundError, NotADirectoryError):
        return None
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise OSError(f"not a regular file: {path}")
        data = b""
        while len(data) <= LOCAL_SETTINGS_BYTES and (chunk := os.read(descriptor, LOCAL_SETTINGS_BYTES + 1 - len(data))):
            data += chunk
    finally:
        os.close(descriptor)
    if len(data) > LOCAL_SETTINGS_BYTES:
        raise OSError(f"larger than {LOCAL_SETTINGS_BYTES} bytes: {path}")
    return data.decode("utf-8")


def local_settings_warnings(root: Path) -> list[str]:
    """The gitignored local settings are the owner's own: what fails in the shared file warns here. A file that
    is there and is not JSON warns once: nothing in it was checked, and Claude Code may read it all the same."""
    relative_path = ".claude/settings.local.json"
    try:
        text = local_settings_text(root / relative_path)
        if text is None:
            return []
        if not text.strip():
            return [f"{relative_path}: is empty, so it was not checked; write {{}} or remove the file"]
        settings = json.loads(text)
    except (OSError, ValueError, RecursionError):
        return [f"{relative_path}: cannot be read as JSON, so it was not checked; a disableAllHooks in it would go unseen"]
    switch = settings.get("disableAllHooks") if isinstance(settings, dict) else None
    if switch is None or switch is False:
        return []
    if switch is not True:
        # Claude Code takes the key as a Boolean; 0 equals False in Python and is neither.
        return [f"{relative_path}: disableAllHooks is not true or false"]
    return [f"{relative_path}: disableAllHooks is set; Claude Code runs no hook in this checkout, the protected-path hook included"]


def warnings(root: Path = ROOT) -> list[str]:
    """Findings that do not fail the gate: a port still to do, a stale legacy-records line, hooks turned off locally."""
    found = [
        f"missing {relative_path}, required from scaffold {'.'.join(map(str, REQUIRED_SINCE[relative_path]))}: "
        "add it from that release's render, as its port in the skill's references/scaffold-contract.md says"
        for relative_path in REQUIRED
        if not (root / relative_path).is_file() and ported_later(root, relative_path)
    ]
    found.extend(
        f"{LEGACY_RECORDS}: lists {listed}, which does not exist; remove the line"
        for listed in sorted(legacy_records(root)[0])
        if not (root / listed).is_file()
    )
    found.extend(local_settings_warnings(root))
    return found


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
        for path in governed(folder):
            status = layers.frontmatter_status(path.read_text(encoding="utf-8"))
            if status not in allowed:
                errors.append(
                    f"{relative(root, path)}: task status {status} not in "
                    f"{sorted(allowed)}; close finished tasks with make close"
                )
    return errors


def check_current_has_no_history(root: Path) -> list[str]:
    errors: list[str] = []
    # An asset folder's Markdown moves with its document and is not a current document itself.
    for path in governed(root / layers.CURRENT):
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
    errors.extend(check_closed_tasks(root))
    errors.extend(check_current_has_no_history(root))
    errors.extend(check_prefixes(root))
    errors.extend(check_adrs(root))
    errors.extend(check_links(root))
    return errors


def check_orchestrator(root: Path) -> list[str]:
    """The liveness files must be byte-identical to the agentic-sdlc release they came from."""
    errors: list[str] = []
    sums = root / "scripts/orchestrator/SHA256SUMS"
    for line in sums.read_text(encoding="utf-8").splitlines():
        digest, _, name = line.partition("  ")
        path = root / name
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
        if actual != digest:
            errors.append(
                f"{name}: differs from the agentic-sdlc release; change the skill, "
                "then port its copy (references/scaffold-contract.md)"
            )
    return errors


def check_protected(root: Path) -> list[str]:
    """The protected-path hook must still list every entry the scaffold protects: its tuple, not its text."""
    relative_path = "scripts/check_protected_paths.py"
    spec = importlib.util.spec_from_file_location("protected_paths_under_check", root / relative_path)
    try:
        assert spec is not None and spec.loader is not None
        hook = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hook)
        listed = hook.PROTECTED_GOVERNANCE
    except BaseException as error:  # Any failure, a SystemExit too, means the hook's list cannot be trusted.
        return [f"{relative_path}: cannot be loaded ({type(error).__name__}: {error})"]
    if not isinstance(listed, tuple) or not all(isinstance(entry, str) for entry in listed):
        return [f"{relative_path}: PROTECTED_GOVERNANCE is not a tuple of paths"]
    return [f"{relative_path}: missing {path}" for path in PROTECTED_REQUIRED if path not in listed]


def matcher_covers(matcher: object, tools: tuple[str, ...]) -> bool:
    """Whether a hook entry fires every time: no matcher, or names that hold each tool. A pattern never
    covers: what it matches is Claude Code's to say, and no pattern is compiled here."""
    if matcher in (None, "", "*"):
        return True
    if not isinstance(matcher, str) or not tools or not NAME_MATCHER.fullmatch(matcher):
        return False
    names = {name.strip() for name in re.split("[|,]", matcher)}
    return all(tool in names for tool in tools)


def blocking_commands(entries: object, tools: tuple[str, ...], matched: bool = True) -> set[str]:
    """The commands an event runs as blocking hooks for every one of the tools; entries may share the tools out.
    matched is False for an event of UNMATCHED_EVENTS: every entry fires, whatever matcher it holds."""
    if len(tools) > 1:
        return set.intersection(*(blocking_commands(entries, (tool,), matched) for tool in tools))
    commands: set[str] = set()
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict) or (matched and not matcher_covers(entry.get("matcher"), tools)):
            continue
        handlers = entry.get("hooks")
        for handler in handlers if isinstance(handlers, list) else []:
            if isinstance(handler, dict) and handler.get("type") == "command" and set(handler) <= HANDLER_KEYS:
                if isinstance(handler.get("command"), str) and handler.get("onFailure", "block") == "block":
                    commands.add(handler["command"])
    return commands


def check_settings(root: Path) -> list[str]:
    """The settings must run the scaffold's hooks: read as Claude Code reads them, not searched as text."""
    relative_path = ".claude/settings.json"
    try:
        settings = json.loads((root / relative_path).read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as error:
        return [f"{relative_path}: invalid JSON ({error})"]
    if not isinstance(settings, dict):
        return [f"{relative_path}: not a JSON object"]
    errors = []
    if settings.get("disableAllHooks") not in (None, False):
        errors.append(f"{relative_path}: disableAllHooks is set; Claude Code then runs no hook")
    hooks = settings.get("hooks")
    hooks = hooks if isinstance(hooks, dict) else {}
    for event, commands in HOOK_COMMANDS.items():
        tools = WRITE_TOOLS if event == "PreToolUse" else ()
        matched = event not in UNMATCHED_EVENTS
        found = blocking_commands(hooks.get(event), tools, matched)
        where = f", matching {', '.join(tools)}," if tools else ", without a matcher," if matched else ""
        for command in commands:
            if command not in found:
                named = re.search(r"scripts/[\w./-]+|make [\w-]+", command)
                errors.append(
                    f"{relative_path}: hooks.{event} lacks the scaffold's {named.group(0) if named else 'command'} hook: a "
                    f"command hook with exactly the scaffold's command{where} "
                    'and no key besides type, command, timeout and onFailure "block"'
                )
    return errors


def check_makefile(root: Path) -> list[str]:
    """Only Makefile may hold the targets: the names are compared as the folder spells them."""
    present = {entry.name for entry in root.iterdir()}
    errors = [
        f"{name}: make reads it before the protected Makefile; merge it into Makefile and remove it"
        for name in SHADOWING_MAKEFILES
        if name in present
    ]
    if not MAKEFILE_OWN_RULE.search((root / "Makefile").read_text(encoding="utf-8")):
        errors.append(
            "Makefile: missing the rule 'Makefile: ;'; without it make rebuilds the Makefile from a "
            "Makefile.sh beside it and runs that"
        )
    return errors


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for relative_path in REQUIRED:
        if not (root / relative_path).is_file() and not ported_later(root, relative_path):
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

    errors.extend(check_makefile(root))
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

    errors.extend(check_settings(root))
    errors.extend(check_protected(root))
    errors.extend(check_orchestrator(root))
    errors.extend(check_layers(root))
    return errors


def main() -> int:
    errors = validate()
    for warning in warnings():
        print(f"WARNING: {warning}", file=sys.stderr)
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("governance: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
