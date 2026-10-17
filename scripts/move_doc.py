#!/usr/bin/env python3
"""Move a document between layers and keep every link to it working.

approve: docs/work/{adr,product,design}/... to docs/current/..., status accepted.
close: docs/work/{tasks,changes,research}/... to docs/records/..., tasks become
closed and change deltas incorporated.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import doc_layers as layers  # noqa: E402


ROOT = Path(__file__).resolve().parent.parent
ADR_HEADING = re.compile(r"^# ADR-\d+\s*[—–-]+\s*(.+?)\s*$", re.MULTILINE)


def destination_for(action: str, source: Path, root: Path) -> Path:
    try:
        parts = source.relative_to(root / layers.WORK).parts
    except ValueError as error:
        raise ValueError(f"{action} takes a file under {layers.WORK}/") from error
    allowed = layers.APPROVABLE if action == "approve" else layers.CLOSABLE
    if len(parts) < 2 or parts[0] not in allowed:
        folders = ", ".join(f"{layers.WORK}/{kind}/" for kind in allowed)
        raise ValueError(f"{action} takes a file under {folders}")
    layer = layers.CURRENT if action == "approve" else layers.RECORDS
    return root / layer / Path(*parts)


def mark_status(action: str, kind: str, text: str, today: str) -> str:
    if action == "approve":
        return layers.set_status(text, f"accepted ({today})")
    if kind == "tasks":
        return layers.set_frontmatter_status(text, "closed")
    if kind == "changes":
        return layers.set_status(text, f"incorporated ({today})")
    return text


def rebase_links(text: str, source: Path, destination: Path) -> str:
    """Keep the moved document's own links pointing where they did."""

    def replace(target: str) -> str | None:
        path, anchor = layers.split_anchor(target)
        if not path:
            return None
        absolute = (source.parent / unquote(path)).resolve()
        if absolute == source:
            absolute = destination
        if (destination.parent / unquote(path)).resolve() == absolute:
            return None
        return layers.relative_link(destination.parent, absolute) + anchor

    return layers.rewrite_links(text, replace)


def redirect_inbound(root: Path, source: Path, destination: Path) -> list[Path]:
    changed: list[Path] = []
    for path in layers.markdown_files(root):
        if path.resolve() == destination:
            continue
        text = path.read_text(encoding="utf-8")

        def replace(target: str, here: Path = path) -> str | None:
            if layers.resolve(here, target) != source:
                return None
            return layers.relative_link(here.parent, destination) + layers.split_anchor(target)[1]

        updated = layers.rewrite_links(text, replace)
        if updated != text:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed.append(path)
    return changed


def index_adr(root: Path, adr: Path, today: str) -> Path | None:
    """Add an approved ADR to the in-force table of the ADR index."""
    index = root / layers.CURRENT / "adr" / "README.md"
    if not index.is_file():
        return None
    name = re.match(r"ADR-\d+", adr.name)
    if name is None:
        return None
    number = name.group(0)
    in_force, marker, retired = index.read_text(encoding="utf-8").partition("## Retired")
    if re.search(rf"^\|\s*\[?{number}\b", in_force, re.MULTILINE):
        return None
    lines = in_force.rstrip("\n").split("\n")
    header = next(
        (position for position, line in enumerate(lines) if re.match(r"^\|\s*ADR\s*\|", line)),
        None,
    )
    if header is None:
        return None
    end = header
    while end + 1 < len(lines) and lines[end + 1].startswith("|"):
        end += 1
    heading = ADR_HEADING.search(adr.read_text(encoding="utf-8"))
    title = (heading.group(1) if heading else adr.stem).replace("|", "\\|")
    link = layers.relative_link(index.parent, adr)
    lines.insert(end + 1, f"| [{number}]({link}) | {title} | accepted ({today}) |")
    text = "\n".join(lines) + "\n"
    if marker:
        text += "\n" + marker + retired
    index.write_text(text, encoding="utf-8", newline="\n")
    return index


def git_move(source: Path, destination: Path, root: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        tracked = (
            subprocess.run(
                ["git", "ls-files", "--error-unmatch", str(source)],
                cwd=root,
                capture_output=True,
                check=False,
            ).returncode
            == 0
        )
    except FileNotFoundError:
        tracked = False
    if tracked:
        subprocess.run(["git", "mv", str(source), str(destination)], cwd=root, check=True)
    else:
        source.rename(destination)


def move(action: str, source: Path, root: Path, today: str) -> tuple[Path, list[Path]]:
    root = root.resolve()
    source = source.resolve()
    if not source.is_file():
        raise ValueError(f"not a file: {source}")
    destination = destination_for(action, source, root)
    if destination.exists():
        raise ValueError(f"already exists: {destination.relative_to(root).as_posix()}")
    kind = source.relative_to(root / layers.WORK).parts[0]
    text = mark_status(action, kind, source.read_text(encoding="utf-8"), today)
    text = rebase_links(text, source, destination)
    git_move(source, destination, root)
    destination.write_text(text, encoding="utf-8", newline="\n")
    changed = redirect_inbound(root, source, destination)
    if action == "approve" and kind == "adr":
        index = index_adr(root, destination, today)
        if index is not None and index not in changed:
            changed.append(index)
    return destination, changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("approve", "close"))
    parser.add_argument("doc", help="path of the document under docs/work/")
    args = parser.parse_args(argv)
    if not args.doc:
        print("ERROR: pass DOC=docs/work/<folder>/<file>.md", file=sys.stderr)
        return 2
    root = ROOT.resolve()
    try:
        destination, changed = move(
            args.action, Path(args.doc), root, date.today().isoformat()
        )
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    print(f"{args.action}: {destination.relative_to(root).as_posix()}")
    for path in changed:
        print(f"updated: {path.relative_to(root).as_posix()}")
    print("Review the diff and commit it with the reason in the body.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
