#!/usr/bin/env python3
"""Regression tests for repository governance gates."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent


def load(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / f"{name}.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prd = load("check_prd")
protected = load("check_protected_paths")
governance = load("check_governance")
mover = load("move_doc")

ADR = """# ADR-001 — Example

**Status:** {status}

## Context

Forces.

## Options considered

### A (recommended)

- Pro.

### B

- Con.

## Decision

A.

## Consequences

Easier.
"""

INDEX = """# ADR index

| ADR | Title | Status |
| --- | --- | --- |
{rows}
## Retired

| ADR | Title | Retired | Replaced by |
| --- | --- | --- | --- |
{retired}
"""


def write(root: Path, relative: str, text: str) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


class PrdGateTests(unittest.TestCase):
    def write(self, folder: Path, body: str) -> Path:
        path = folder / "PRD-001-example.md"
        path.write_text(body, encoding="utf-8")
        return path

    def test_accepts_structural_ears(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = self.write(
                Path(temp),
                """# PRD-001 — Example

**Status:** draft

## Requirements

- **PRD-001.R1** — Behavior.
  - WHEN input arrives, the system shall persist it.
  - IF input is invalid, THEN the system shall reject it.

## Non-goals
""",
            )
            self.assertEqual(prd.validate(path), [])

    def test_rejects_duplicate_and_gameable_clause(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = self.write(
                Path(temp),
                """# PRD-001 — Example

**Status:** draft

## Requirements

- **PRD-001.R1** — Behavior.
  - when input arrives, the system should accept and shall persist it.
  - Users shall receive an answer.
- **PRD-001.R1** — Duplicate.
  - The system shall persist input.

## Non-goals
""",
            )
            errors = "\n".join(prd.validate(path))
            self.assertIn('banned word "should"', errors)
            self.assertIn("lowercase EARS keyword", errors)
            self.assertIn("clause does not use an EARS opening", errors)
            self.assertIn("duplicate requirement id", errors)


class ProtectedPathTests(unittest.TestCase):
    def test_blocks_governance_and_unjudgeable_paths(self) -> None:
        self.assertTrue(protected.is_protected("docs/current/constitution.md", ROOT))
        self.assertTrue(protected.is_protected(".agentic/templates/adr.md", ROOT))
        self.assertTrue(protected.is_protected("Makefile", ROOT))
        self.assertTrue(protected.is_protected(".go-arch-lint.yml", ROOT))
        self.assertTrue(protected.is_protected("", ROOT))
        self.assertTrue(protected.is_protected("scripts/new_gate.py", ROOT))
        self.assertFalse(protected.is_protected("scripts/README.md", ROOT))
        self.assertFalse(protected.is_protected("src/main.py", ROOT))

    def test_project_gates_and_supply_chain(self) -> None:
        for path in (
            ".nvmrc",
            ".npmrc",
            "package-lock.json",
            "eslint.config.mjs",
            "tsconfig.json",
            ".github/dependabot.yml",
            ".github/workflows/release.yml",
            "version-bump.mjs",
            "LICENSE",
        ):
            self.assertTrue(protected.is_protected(path, ROOT), path)
        for path in ("src/main.ts", "tests/cli.test.mjs", "manifest.json", "package.json"):
            self.assertFalse(protected.is_protected(path, ROOT), path)
        self.assertTrue(protected.needs_confirmation("package.json", ROOT))
        self.assertFalse(protected.needs_confirmation("src/package.json", ROOT))

    def test_decisions_in_force_ask_first(self) -> None:
        self.assertTrue(protected.needs_confirmation("docs/current/adr/ADR-001-x.md", ROOT))
        self.assertFalse(protected.needs_confirmation("docs/work/adr/ADR-001-x.md", ROOT))
        self.assertFalse(protected.needs_confirmation("docs/current/design/x.md", ROOT))

    def outside_project(self, temp: str, folders: object = None) -> Path:
        """A repository at temp/repo whose local settings list `folders`."""
        project = Path(temp) / "repo"
        (project / ".claude").mkdir(parents=True)
        (Path(temp) / "notes").mkdir()
        if folders is not None:
            settings = {"permissions": {"additionalDirectories": folders}}
            (project / ".claude/settings.local.json").write_text(
                json.dumps(settings), encoding="utf-8"
            )
        return project

    def test_outside_paths_ask_unless_in_local_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            project = self.outside_project(temp)
            note = str(Path(temp) / "notes/a.md")
            self.assertFalse(protected.is_protected(note, project))
            self.assertTrue(protected.needs_confirmation(note, project))
            (project / ".claude/settings.local.json").write_text("{not json", encoding="utf-8")
            self.assertTrue(protected.needs_confirmation(note, project))
        # Relative entries count; a non-list or unresolvable entry approves nothing.
        for folders, asks in (
            (["../notes"], False),
            ("../notes", True),
            (["~no-such-user-x/notes"], True),
            (["a\0b"], True),
        ):
            with tempfile.TemporaryDirectory() as temp:
                project = self.outside_project(temp, folders)
                note = str(Path(temp) / "notes/a.md")
                self.assertEqual(protected.needs_confirmation(note, project), asks, folders)
        with tempfile.TemporaryDirectory() as temp:
            project = self.outside_project(temp, [f"{temp}/notes"])
            self.assertFalse(protected.needs_confirmation(f"{temp}/notes/a.md", project))
            for path in (
                f"{temp}/notes-other/a.md",
                f"{temp}/notes/../elsewhere.md",
                ".claude/settings.local.json",
            ):
                self.assertTrue(protected.needs_confirmation(path, project), path)

    def test_symlinks_and_aliases_keep_the_stricter_decision(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            project = self.outside_project(temp, [f"{temp}/notes"])
            os.symlink(Path(temp) / "notes/target", project / "Makefile")
            os.symlink(project / "tsconfig.json", Path(temp) / "notes/link.json")
            os.symlink(Path(temp) / "elsewhere.md", Path(temp) / "notes/escape.md")
            os.symlink(project, Path(temp) / "alias")
            self.assertTrue(protected.is_protected(str(project / "Makefile"), project))
            self.assertTrue(protected.is_protected(f"{temp}/notes/link.json", project))
            self.assertTrue(protected.needs_confirmation(f"{temp}/notes/escape.md", project))
            self.assertTrue(protected.is_protected(f"{temp}/alias/Makefile", project))
            alias = Path(temp) / "alias/Makefile"
            self.assertEqual(protected.repo_relative(alias, project), "Makefile")
        with tempfile.TemporaryDirectory() as temp:
            project = self.outside_project(temp, [f"{temp}/notes-link"])
            os.symlink(Path(temp) / "notes", Path(temp) / "notes-link")
            self.assertFalse(protected.needs_confirmation(f"{temp}/notes-link/a.md", project))
            (project / "src").mkdir()
            (project / ".claude/settings.local.json").rename(project / "src/local.json")
            os.symlink(project / "src/local.json", project / ".claude/settings.local.json")
            self.assertTrue(protected.needs_confirmation("src/local.json", project))

    def run_hook(self, path: str, project: Path = ROOT) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "check_protected_paths.py")],
            input=json.dumps({"tool_input": {"file_path": str(project / path)}}),
            text=True,
            capture_output=True,
            env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
            check=False,
        )

    def test_hook_decisions(self) -> None:
        blocked = self.run_hook("docs/current/constitution.md")
        self.assertEqual(blocked.returncode, 2)
        self.assertIn("Blocked protected governance path", blocked.stderr)
        asked = self.run_hook("docs/current/adr/ADR-001-example.md")
        self.assertEqual(asked.returncode, 0)
        decision = json.loads(asked.stdout)["hookSpecificOutput"]
        self.assertEqual(decision["permissionDecision"], "ask")
        allowed = self.run_hook("src/main.py")
        self.assertEqual(allowed.returncode, 0)
        self.assertEqual(allowed.stdout, "")
        failed = self.run_hook("src/a\0b.py")
        self.assertEqual(failed.returncode, 2)
        self.assertIn("protected-path check failed", failed.stderr)
        with tempfile.TemporaryDirectory() as temp:
            project = self.outside_project(temp, [f"{temp}/notes"])
            listed = self.run_hook(f"{temp}/notes/a.md", project)
            outside = self.run_hook(f"{temp}/note.md", project)
            local = self.run_hook(".claude/settings.local.json", project)
        self.assertEqual((listed.returncode, listed.stdout), (0, ""))
        for asked, reason in ((outside, "outside the repository"), (local, "local settings")):
            self.assertEqual(asked.returncode, 0)
            decision = json.loads(asked.stdout)["hookSpecificOutput"]
            self.assertEqual(decision["permissionDecision"], "ask")
            self.assertIn(reason, decision["permissionDecisionReason"])


class GovernanceTests(unittest.TestCase):
    def test_constitution_todo_state_matches_governance_result(self) -> None:
        errors = governance.validate(ROOT)
        unresolved = "docs/current/constitution.md: unresolved customization TODO"
        constitution = (ROOT / "docs/current/constitution.md").read_text(encoding="utf-8")
        if "[TODO:" in constitution:
            self.assertIn(unresolved, errors)
        else:
            self.assertNotIn(unresolved, errors)

    def test_accepts_consistent_layers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "docs/current/adr/ADR-001-example.md", ADR.format(status="accepted (2026-01-02)"))
            write(root, "docs/current/adr/README.md", INDEX.format(rows="| [ADR-001](ADR-001-example.md) | Example | accepted |", retired=""))
            write(root, "docs/work/adr/ADR-002-next.md", ADR.format(status="proposed"))
            write(root, "docs/work/tasks/r01-x/TASK-003-y.md", "---\nstatus: active\n---\n\n# TASK-003\n")
            write(root, "docs/records/tasks/r01-x/TASK-001-z.md", "---\nstatus: closed\n---\n\n# TASK-001\n")
            self.assertEqual(governance.check_layers(root), [])

    def test_numbered_files_carry_their_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for relative in (
                "docs/work/adr/002-bare.md",
                "docs/work/tasks/r01-x/003-bare.md",
                "docs/records/changes/004-bare.md",
                "docs/work/product/DES-005-wrong.md",
            ):
                write(root, relative, "# x\n")
            for relative in (
                "docs/work/adr/ADR-006-ok.md",
                "docs/records/tasks/r01-x/TASK-007-ok.md",
                "docs/work/changes/CHG-008-ok.md",
                "docs/work/research/notes.md",
                "docs/records/verification/2026-01-02-run.md",
            ):
                write(root, relative, "# x\n")
            errors = governance.check_prefixes(root)
            self.assertEqual(
                errors,
                [
                    "docs/work/adr/002-bare.md: a numbered file here is named ADR-NNN-slug.md",
                    "docs/work/product/DES-005-wrong.md: a numbered file here is named PRD-NNN-slug.md",
                    "docs/work/tasks/r01-x/003-bare.md: a numbered file here is named TASK-NNN-slug.md",
                    "docs/records/changes/004-bare.md: a numbered file here is named CHG-NNN-slug.md",
                ],
            )

    def test_rejects_mixed_layers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "docs/current/adr/ADR-001-example.md", ADR.format(status="proposed") + "\n## Amendment (2026-01-03)\n\nLater.\n")
            write(root, "docs/current/adr/ADR-003-thin.md", "# ADR-003 — Thin\n\n**Status:** accepted (2026-01-02)\n\n## Context\n\nX.\n")
            write(root, "docs/current/adr/README.md", INDEX.format(rows="| [ADR-001](ADR-001-example.md) | Example | accepted |", retired="| ADR-003 | Old | 2026-01-01 | ADR-001 |"))
            write(root, "docs/work/adr/ADR-001-dup.md", ADR.format(status="accepted (2026-01-02)"))
            write(root, "docs/work/tasks/r01-x/TASK-004-done.md", "---\nstatus: closed\n---\n\n# TASK-004\n")
            write(root, "docs/current/design/DES-001-x.md", "# DES-001\n\n**Status:** accepted (2026-01-02)\n\nSee [model](../research/model.md).\n")
            write(root, "docs/design/_template.md", "# template\n")
            write(root, "docs/kickoff.md", "# Kickoff\n")
            write(root, "docs/current/tasks/TASK-005-x.md", "---\nstatus: active\n---\n")
            write(root, "docs/current/product/v2/PRD-002-x.md", "# PRD-002 — X\n\n**Status:** draft\n")
            errors = "\n".join(governance.check_layers(root))
            self.assertIn("docs/current/product/v2/PRD-002-x.md: docs/current/ holds accepted", errors)
            for expected in (
                "holds accepted documents only",
                "holds draft or proposed documents only",
                "history section 'Amendment (2026-01-03)'",
                "docs/kickoff.md: every document sits in",
                "docs/current/tasks/TASK-005-x.md: docs/current/ holds only",
                "missing or empty 'options considered' section",
                "fewer than two options considered",
                "ADR-001 used by more than one file",
                "ADR-003 is retired and never reused",
                "ADR-003 missing from index",
                "task status closed",
                "broken link ../research/model.md",
                "templates belong in .agentic/templates/",
            ):
                self.assertIn(expected, errors)


    def test_history_detection_is_precise(self) -> None:
        for heading in ("Amendment (2026-01-03)", "Amendments to the research shapes",
                        "Prototypes (superseded)", "Review rounds", "Status log", "Disposition ledger"):
            self.assertTrue(governance.is_history(heading), heading)
        for heading in ("Log retention", "Logs", "Logging", "Historical data model", "Ledger"):
            self.assertFalse(governance.is_history(heading), heading)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "docs/current/design/DES-001-x.md", "# DES-001\n\n```markdown\n## History\n```\n")
            self.assertEqual(governance.check_current_has_no_history(root), [])

    def test_options_may_be_a_table(self) -> None:
        table = "\n| Option | Pros | Cons |\n| --- | --- | --- |\n| A | x | y |\n| B | x | y |\n"
        self.assertEqual(governance.option_count(table), 2)
        self.assertEqual(governance.option_count("\n- Only one option.\n"), 1)


class MoveTests(unittest.TestCase):
    def test_links_keep_their_form_and_follow_the_move(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            index = write(root, "docs/current/adr/README.md", "# ADR index\n\n| Other | Table |\n| --- | --- |\n| x | y |\n\n" + INDEX.format(rows="", retired="").split("\n", 2)[2])
            draft = write(root, "docs/work/adr/sub/ADR-006-a.md", ADR.format(status="proposed").replace("Example", "Pipe | title") + "\n[self](ADR-006-a.md#decision)\n")
            note = write(root, "docs/current/plan.md", "See [a](<../work/adr/sub/ADR-006-a.md>) and [ref].\n\n[ref]: ../work/adr/sub/ADR-006-a.md#context\n")
            destination, _ = mover.move("approve", draft, root, "2026-01-05")
            self.assertIn("[self](ADR-006-a.md#decision)", destination.read_text(encoding="utf-8"))
            text = note.read_text(encoding="utf-8")
            self.assertIn("[a](<adr/sub/ADR-006-a.md>)", text)
            self.assertIn("[ref]: adr/sub/ADR-006-a.md#context", text)
            rows = index.read_text(encoding="utf-8")
            self.assertIn("| x | y |\n\n", rows)
            self.assertIn("| [ADR-006](sub/ADR-006-a.md) | Pipe \\| title | accepted (2026-01-05) |", rows)

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_tracked_document_moves_with_git(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            draft = write(root, "docs/work/adr/ADR-007-g.md", ADR.format(status="proposed"))
            for command in (
                ["git", "init", "-q"],
                ["git", "add", "-A"],
                ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "draft"],
            ):
                subprocess.run(command, cwd=root, check=True, capture_output=True)
            mover.move("approve", draft, root, "2026-01-05")
            status = subprocess.run(
                ["git", "status", "--porcelain"], cwd=root, check=True, capture_output=True, text=True
            ).stdout
            self.assertIn("docs/work/adr/ADR-007-g.md -> docs/current/adr/ADR-007-g.md", status)

    def test_approve_moves_marks_and_relinks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "docs/work/adr/README.md", "# x\n")
            draft = write(
                root,
                "docs/work/adr/ADR-002-next.md",
                ADR.format(status="proposed") + "\nSee [sibling](ADR-003-other.md) and [plan](../../current/plan.md).\n",
            )
            write(root, "docs/work/adr/ADR-003-other.md", ADR.format(status="proposed"))
            write(root, "docs/current/plan.md", "# Plan\n")
            index = write(root, "docs/current/adr/README.md", INDEX.format(rows="| [ADR-000](ADR-000-x.md) | Process | accepted |", retired=""))
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", "---\nstatus: active\n---\n\nCites [ADR-002](../../adr/ADR-002-next.md#decision).\n")
            destination, changed = mover.move("approve", draft, root, "2026-01-05")
            in_force, _, retired = index.read_text(encoding="utf-8").partition("## Retired")
            self.assertIn("| [ADR-000](ADR-000-x.md) | Process | accepted |\n| [ADR-002](ADR-002-next.md) | Example | accepted (2026-01-05) |\n", in_force)
            self.assertIn("| ADR | Title | Retired | Replaced by |", retired)
            self.assertEqual(destination, (root / "docs/current/adr/ADR-002-next.md").resolve())
            self.assertFalse(draft.exists())
            text = destination.read_text(encoding="utf-8")
            self.assertIn("**Status:** accepted (2026-01-05)", text)
            self.assertIn("[sibling](../../work/adr/ADR-003-other.md)", text)
            self.assertIn("[plan](../../current/plan.md)", text)
            self.assertIn("(../../../current/adr/ADR-002-next.md#decision)", task.read_text(encoding="utf-8"))
            self.assertEqual(changed, [task.resolve(), index.resolve()])

    def test_close_task_and_reject_wrong_layer(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", "---\nstatus: active\nrelease: r01-x\n---\n\n# TASK-004\n")
            destination, _ = mover.move("close", task, root, "2026-01-05")
            self.assertEqual(destination, (root / "docs/records/tasks/r01-x/TASK-004-t.md").resolve())
            self.assertTrue(destination.read_text(encoding="utf-8").startswith("---\nstatus: closed\nrelease: r01-x\n"))
            draft = write(root, "docs/work/adr/ADR-005-x.md", ADR.format(status="proposed"))
            with self.assertRaises(ValueError):
                mover.move("close", draft, root, "2026-01-05")

    def test_recommended_marker_is_counted_per_option(self) -> None:
        self.assertEqual(governance.recommended_count("\n### A (recommended)\n\n- Pro.\n\n### B\n"), 1)
        self.assertEqual(governance.recommended_count("\n### A (Recommended, with changes)\n\n### B\n"), 1)
        self.assertEqual(governance.recommended_count("\n### A\n\n- Beats B (recommended).\n\n### B\n"), 0)
        table = "\n| Option | Pros |\n| --- | --- |\n| A (recommended) | x |\n| B | y |\n"
        self.assertEqual(governance.recommended_count(table), 1)

    def test_accepted_adr_marks_exactly_one_option_and_a_draft_at_most_one(self) -> None:
        unmarked = ADR.replace(" (recommended)", "")
        doubled = ADR.replace("### B", "### B (recommended)")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "docs/current/adr/ADR-001-example.md", unmarked.format(status="accepted (2026-01-02)"))
            write(root, "docs/current/adr/ADR-002-double.md", doubled.format(status="accepted (2026-01-02)"))
            write(root, "docs/current/adr/README.md", INDEX.format(rows="| [ADR-001](ADR-001-example.md) | Example | accepted |\n| [ADR-002](ADR-002-double.md) | Double | accepted |", retired=""))
            write(root, "docs/work/adr/ADR-003-open.md", unmarked.format(status="proposed"))
            write(root, "docs/work/adr/ADR-004-split.md", doubled.format(status="proposed"))
            errors = "\n".join(governance.check_adrs(root))
            self.assertIn("ADR-001-example.md: an accepted ADR marks exactly one option", errors)
            self.assertIn("ADR-002-double.md: an accepted ADR marks exactly one option", errors)
            self.assertNotIn("ADR-003-open.md", errors)
            self.assertIn("ADR-004-split.md: more than one option marked (recommended)", errors)


class MoveTests(unittest.TestCase):
    def test_links_keep_their_form_and_follow_the_move(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            index = write(root, "docs/current/adr/README.md", "# ADR index\n\n| Other | Table |\n| --- | --- |\n| x | y |\n\n" + INDEX.format(rows="", retired="").split("\n", 2)[2])
            draft = write(root, "docs/work/adr/sub/ADR-006-a.md", ADR.format(status="proposed").replace("Example", "Pipe | title") + "\n[self](ADR-006-a.md#decision)\n")
            note = write(root, "docs/current/plan.md", "See [a](<../work/adr/sub/ADR-006-a.md>) and [ref].\n\n[ref]: ../work/adr/sub/ADR-006-a.md#context\n")
            destination, _ = mover.move("approve", draft, root, "2026-01-05")
            self.assertIn("[self](ADR-006-a.md#decision)", destination.read_text(encoding="utf-8"))
            text = note.read_text(encoding="utf-8")
            self.assertIn("[a](<adr/sub/ADR-006-a.md>)", text)
            self.assertIn("[ref]: adr/sub/ADR-006-a.md#context", text)
            rows = index.read_text(encoding="utf-8")
            self.assertIn("| x | y |\n\n", rows)
            self.assertIn("| [ADR-006](sub/ADR-006-a.md) | Pipe \\| title | accepted (2026-01-05) |", rows)

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_tracked_document_moves_with_git(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            draft = write(root, "docs/work/adr/ADR-007-g.md", ADR.format(status="proposed"))
            for command in (
                ["git", "init", "-q"],
                ["git", "add", "-A"],
                ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "draft"],
            ):
                subprocess.run(command, cwd=root, check=True, capture_output=True)
            mover.move("approve", draft, root, "2026-01-05")
            status = subprocess.run(
                ["git", "status", "--porcelain"], cwd=root, check=True, capture_output=True, text=True
            ).stdout
            self.assertIn("docs/work/adr/ADR-007-g.md -> docs/current/adr/ADR-007-g.md", status)

    def test_approve_moves_marks_and_relinks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "docs/work/adr/README.md", "# x\n")
            draft = write(
                root,
                "docs/work/adr/ADR-002-next.md",
                ADR.format(status="proposed") + "\nSee [sibling](ADR-003-other.md) and [plan](../../current/plan.md).\n",
            )
            write(root, "docs/work/adr/ADR-003-other.md", ADR.format(status="proposed"))
            write(root, "docs/current/plan.md", "# Plan\n")
            index = write(root, "docs/current/adr/README.md", INDEX.format(rows="| [ADR-000](ADR-000-x.md) | Process | accepted |", retired=""))
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", "---\nstatus: active\n---\n\nCites [ADR-002](../../adr/ADR-002-next.md#decision).\n")
            destination, changed = mover.move("approve", draft, root, "2026-01-05")
            in_force, _, retired = index.read_text(encoding="utf-8").partition("## Retired")
            self.assertIn("| [ADR-000](ADR-000-x.md) | Process | accepted |\n| [ADR-002](ADR-002-next.md) | Example | accepted (2026-01-05) |\n", in_force)
            self.assertIn("| ADR | Title | Retired | Replaced by |", retired)
            self.assertEqual(destination, (root / "docs/current/adr/ADR-002-next.md").resolve())
            self.assertFalse(draft.exists())
            text = destination.read_text(encoding="utf-8")
            self.assertIn("**Status:** accepted (2026-01-05)", text)
            self.assertIn("[sibling](../../work/adr/ADR-003-other.md)", text)
            self.assertIn("[plan](../../current/plan.md)", text)
            self.assertIn("(../../../current/adr/ADR-002-next.md#decision)", task.read_text(encoding="utf-8"))
            self.assertEqual(changed, [task.resolve(), index.resolve()])

    def test_close_task_and_reject_wrong_layer(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", "---\nstatus: active\nrelease: r01-x\n---\n\n# TASK-004\n")
            destination, _ = mover.move("close", task, root, "2026-01-05")
            self.assertEqual(destination, (root / "docs/records/tasks/r01-x/TASK-004-t.md").resolve())
            self.assertTrue(destination.read_text(encoding="utf-8").startswith("---\nstatus: closed\nrelease: r01-x\n"))
            draft = write(root, "docs/work/adr/ADR-005-x.md", ADR.format(status="proposed"))
            with self.assertRaises(ValueError):
                mover.move("close", draft, root, "2026-01-05")


if __name__ == "__main__":
    unittest.main()

if __name__ == "__main__":
    unittest.main()
