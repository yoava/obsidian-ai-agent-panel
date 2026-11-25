#!/usr/bin/env python3
"""Regression tests for repository governance gates."""

from __future__ import annotations

import contextlib
import hashlib
import fcntl
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from collections.abc import Callable, Iterator
from pathlib import Path
from types import ModuleType
from typing import Any


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


def until(condition: Callable[[], bool], seconds: float = 20) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if condition():
            return True
        time.sleep(0.2)
    return False


def bounds() -> dict[str, Any]:
    """Four seconds and 1 GiB for a child: a read that never ends fails its test, not the suite."""
    import resource

    def limited() -> None:
        resource.setrlimit(resource.RLIMIT_AS, (1 << 30, 1 << 30))

    return {"timeout": 4, "preexec_fn": limited}


def isolated(temp: str, **extra: str) -> dict[str, str]:
    """Environment for an orchestrator script: its own HOME, run state and gate locks, and no desktop notices."""
    base = Path(temp)
    bin_dir = base / "bin"
    write(bin_dir, "notify-send", "#!/bin/sh\nexit 0\n").chmod(0o755)
    env = {
        key: value for key, value in os.environ.items()
        if key not in ("CLAUDE_CONFIG_DIR", "XDG_STATE_HOME", "AGENTIC_HOST", "AGENTIC_JOB", "AGENTIC_GATE_CLASS", "AGENTIC_GATE_ENV")
    }
    env.update(
        HOME=str(base / "home"), AGENTIC_RUN_STATE=str(base / "state"), AGENTIC_GATE_LOCKS=str(base / "locks"),
        PATH=f"{bin_dir}:{os.environ['PATH']}",
    )
    env.update(extra)
    return env


def text_of(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


TASK = """---
status: active
release: r01-x
number: 004
{size}---

# TASK-004 — T

## Spec

Behavior.

- AC-1: The behavior holds.

## Independent review

{review}

## Outcome

{outcome}
"""


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

    def test_project_paths_stay_protected_in_a_listed_worktree_folder(self) -> None:
        # Worktrees live in <repo>.wt/<branch>; listing that folder in the local settings silences the ask for
        # their open paths and opens no gate, toolchain or release file of any of them (2.8.1 port review F2).
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            project = self.outside_project(temp, [str(base / "repo.wt")])
            write(project, ".agentic/version", "2.8.2\n")
            setup = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t"]
            for command in (
                ["init", "-q", str(project)],
                ["-C", str(project), "commit", "-q", "--allow-empty", "-m", "first"],
                ["-C", str(project), "worktree", "add", "-q", str(base / "repo.wt/branch")],
            ):
                subprocess.run(setup + command, check=True, capture_output=True)
            worktree = f"{temp}/repo.wt/branch"
            for name in (
                "Makefile",
                "GNUmakefile",
                "scripts/check_protected_paths.py",
                ".claude/settings.json",
                ".github/workflows/release.yml",
                ".nvmrc",
                "package-lock.json",
                "eslint.config.mjs",
                "tsconfig.json",
                "version-bump.mjs",
                ".git",
            ):
                with self.subTest(blocked=name):
                    self.assertTrue(protected.is_protected(f"{worktree}/{name}", project))
                    self.assertEqual(self.run_hook(f"{worktree}/{name}", project).returncode, 2)
            for name in ("package.json", "docs/current/adr/ADR-001-x.md", ".claude/settings.local.json"):
                with self.subTest(asks=name):
                    self.assertFalse(protected.is_protected(f"{worktree}/{name}", project))
                    self.assertTrue(protected.needs_confirmation(f"{worktree}/{name}", project))
            for name in ("src/main.ts", "tests/cli.test.mjs", "manifest.json"):
                with self.subTest(open=name):
                    self.assertFalse(protected.is_protected(f"{worktree}/{name}", project))
                    self.assertFalse(protected.needs_confirmation(f"{worktree}/{name}", project))

    def test_a_makefile_make_reads_first_is_protected_and_refused(self) -> None:
        # GNU make reads GNUmakefile, then makefile, before the protected Makefile (QA Q1).
        self.assertEqual(governance.SHADOWING_MAKEFILES, ("GNUmakefile", "makefile"))
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "Makefile", "verify:\n\nMakefile: ;\n")
            self.assertEqual(governance.check_makefile(root), [])
            for name in governance.SHADOWING_MAKEFILES:
                with self.subTest(name=name):
                    self.assertTrue(protected.is_protected(name, ROOT), f"an agent may write {name}")
                    self.assertIn(name, governance.PROTECTED_REQUIRED)
                    shadow = write(root, name, "verify:\n\t@echo agent\n")
                    self.assertEqual(
                        governance.check_makefile(root),
                        [f"{name}: make reads it before the protected Makefile; merge it into Makefile and remove it"],
                    )
                    shadow.unlink()
        self.assertEqual(governance.check_makefile(ROOT), [])

    def test_make_never_rebuilds_the_makefile_from_a_neighbour(self) -> None:
        # Without its own rule make rebuilds Makefile from a newer Makefile.sh (also .c, .o, s.), then runs that (QA Q-R1).
        rule = "Makefile: ;\n"
        makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
        self.assertEqual(governance.check_makefile(ROOT), [])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            ruled = write(root, "Makefile", makefile)
            source = write(root, "Makefile.sh", "help:\n\t@echo agent\n")
            later = time.time() + 5
            os.utime(source, (later, later))
            env = {key: value for key, value in os.environ.items() if key not in ("MAKEFLAGS", "MAKEFILES", "MAKELEVEL")}
            result = subprocess.run(["make", "help"], cwd=root, env=env, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("agent", result.stdout)
            self.assertIn("verify", result.stdout)
            self.assertEqual(ruled.read_text(encoding="utf-8"), makefile, "make rebuilt the Makefile from Makefile.sh")
            for text in (makefile.replace(rule, ""), makefile.replace(rule, "# Makefile: ;\n"), makefile.replace(rule, "Makefile: Makefile.sh\n")):
                with self.subTest(text=text[-40:]):
                    self.assertNotEqual(text, makefile)
                    ruled.write_text(text, encoding="utf-8")
                    self.assertEqual(
                        governance.check_makefile(root),
                        ["Makefile: missing the rule 'Makefile: ;'; without it make rebuilds the Makefile from a "
                         "Makefile.sh beside it and runs that"],
                    )

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
            os.symlink(project / "docs/current/constitution.md", Path(temp) / "notes/link.json")
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

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_protection_follows_the_paths_own_repository(self) -> None:
        # A listed outside folder silences the ask only: a governed repository's protected paths stay blocked from
        # a session rooted anywhere, so listing the worktree folder does not open every worktree (port review F2).
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            project = self.outside_project(temp, [temp])
            other = base / "other"
            write(other, ".agentic/version", "2.8.2\n")
            setup = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t"]
            for command in (
                ["init", "-q", str(other)],
                ["-C", str(other), "commit", "-q", "--allow-empty", "-m", "first"],
                # A linked worktree of a commit that holds no version file: its main checkout governs it.
                ["-C", str(other), "worktree", "add", "-q", str(base / "wt/branch")],
                ["init", "-q", str(base / "plain")],
                ["init", "-q", str(other / "scripts/inner")],
            ):
                subprocess.run(setup + command, check=True, capture_output=True)
            write(base, "unpacked/.agentic/version", "2.8.2\n")
            self.assertFalse((base / "wt/branch/.agentic/version").exists())
            os.symlink(other / "Makefile", base / "notes/link.mk")
            for governed in ("other", "wt/branch", "unpacked"):
                for name in ("Makefile", "GNUmakefile", "scripts/check_protected_paths.py", ".claude/settings.json", ".agentic/version"):
                    with self.subTest(blocked=f"{governed}/{name}"):
                        self.assertTrue(protected.is_protected(f"{temp}/{governed}/{name}", project))
                with self.subTest(open=governed):
                    self.assertFalse(protected.is_protected(f"{temp}/{governed}/src/main.py", project))
                    self.assertFalse(protected.is_protected(f"{temp}/{governed}/scripts/README.md", project))
                    self.assertFalse(protected.needs_confirmation(f"{temp}/{governed}/src/main.py", project))
                    # Its decisions in force and its local settings ask, listed folder or not.
                    self.assertTrue(protected.needs_confirmation(f"{temp}/{governed}/docs/current/adr/ADR-001-x.md", project))
                    self.assertTrue(protected.needs_confirmation(f"{temp}/{governed}/.claude/settings.local.json", project))
            # The outer governed repository still protects what lies in a repository nested in it.
            self.assertTrue(protected.is_protected(f"{temp}/other/scripts/inner/gate.py", project))
            self.assertTrue(protected.is_protected(f"{temp}/notes/link.mk", project))
            self.assertTrue(protected.is_protected("../other/Makefile", project))
            # A repository the scaffold does not govern has no protected list.
            self.assertFalse(protected.is_protected(f"{temp}/plain/Makefile", project))
            self.assertFalse(protected.needs_confirmation(f"{temp}/plain/Makefile", project))
            for path, code in (("other/Makefile", 2), ("wt/branch/scripts/x.py", 2), ("other/src/main.py", 0), ("plain/Makefile", 0)):
                with self.subTest(hook=path):
                    result = self.run_hook(f"{temp}/{path}", project)
                    self.assertEqual((result.returncode, result.stdout), (code, ""), result.stderr)
                    self.assertEqual("Blocked protected governance path" in result.stderr, code == 2)
            # Unlisted, the governed repository's open paths ask like any outside path.
            (project / ".claude/settings.local.json").unlink()
            self.assertTrue(protected.is_protected(f"{temp}/other/Makefile", project))
            self.assertTrue(protected.needs_confirmation(f"{temp}/other/src/main.py", project))

    @unittest.skipUnless(hasattr(os, "mkfifo") and Path("/dev/zero").exists(), "needs a FIFO and /dev/zero")
    def test_a_git_pointer_that_is_no_small_regular_file_is_never_read(self) -> None:
        # The hook reads <ancestor>/.git before it decides. A FIFO there held it past its timeout and a link to
        # /dev/zero read until memory ended, for every path below (review R3-1).
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            project = self.outside_project(temp, [temp])
            for folder in ("fifo", "zero", "common", "gitdir", "long"):
                (base / folder / "sub").mkdir(parents=True)
            os.mkfifo(base / "fifo/.git")
            os.symlink("/dev/zero", base / "zero/.git")
            # A pointer whose commondir is a FIFO, and one that is far longer than a path.
            write(base, "common/.git", "gitdir: ../gitdir\n")
            os.mkfifo(base / "gitdir/commondir")
            write(base, "long/.git", "gitdir: " + "x" * (1 << 20))
            for folder in ("fifo", "zero", "common", "long"):
                with self.subTest(folder=folder):
                    result = self.run_hook(f"{temp}/{folder}/sub/note.md", project, bounded=True)
                    self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
            # The reads run in a child too: in this process a reader without its checks hangs the suite instead of
            # failing it (review R4-1).
            reader = (
                "import runpy, sys\n"
                "from pathlib import Path\n"
                "try:\n"
                "    print(len(runpy.run_path(sys.argv[1])['pointer_text'](Path(sys.argv[2]))))\n"
                "except OSError:\n"
                "    print('OSError')\n"
            )
            for read, expected in (
                ("long/.git", str(protected.POINTER_BYTES)),
                ("fifo/.git", "OSError"),
                ("zero/.git", "OSError"),
                ("gitdir/commondir", "OSError"),
                ("fifo", "OSError"),
            ):
                with self.subTest(read=read):
                    result = subprocess.run(
                        [sys.executable, "-c", reader, str(SCRIPT_DIR / "check_protected_paths.py"), str(base / read)],
                        text=True,
                        capture_output=True,
                        check=False,
                        **bounds(),
                    )
                    self.assertEqual((result.stdout.strip(), result.returncode), (expected, 0), result.stderr)
            # The repository's own protected paths still block below such a folder.
            write(base, "fifo/sub/.agentic/version", "2.8.2\n")
            result = self.run_hook(f"{temp}/fifo/sub/Makefile", project, bounded=True)
            self.assertEqual((result.returncode, result.stdout), (2, ""), result.stderr)
            self.assertIn("Blocked protected governance path", result.stderr)

    @unittest.skipUnless(shutil.which("git") and hasattr(os, "mkfifo") and Path("/dev/zero").exists(), "needs git, a FIFO and /dev/zero")
    def test_a_git_entry_that_cannot_be_followed_governs_its_folder(self) -> None:
        # A worktree of a commit older than the scaffold is governed through its pointer alone. A pointer the hook
        # could not read counted as no worktree, so the worktree's Makefile, scripts and settings passed under a
        # listed folder (Codex on 2.8.2, finding 2). An entry that is there and is neither git's folder nor a
        # pointer the hook can follow now governs the folder; what the protected list leaves open stays open.
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            project = self.outside_project(temp, [temp])
            other, plain = base / "other", base / "plain"
            write(other, ".agentic/version", "2.8.2\n")
            setup = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "protocol.file.allow=always"]
            worktrees = ("fifo", "common", "common-gone", "common-empty", "common-lost", "no-head")
            for command in (
                ["init", "-q", str(other)],
                ["-C", str(other), "commit", "-q", "--allow-empty", "-m", "first"],
                *(["-C", str(other), "worktree", "add", "-q", str(base / name)] for name in worktrees),
                ["init", "-q", str(plain)],
                ["-C", str(plain), "commit", "-q", "--allow-empty", "-m", "first"],
                ["-C", str(plain), "worktree", "add", "-q", str(base / "plain-worktree")],
                ["-C", str(plain), "submodule", "--quiet", "add", str(other), "module"],
                ["init", "-q", "--separate-git-dir", str(base / "store"), str(base / "separate")],
            ):
                subprocess.run(setup + command, check=True, capture_output=True)
            # The Codex case: the pointer of a governed worktree, or what it leads to, made unreadable.
            admin = other / ".git/worktrees"
            (base / "fifo/.git").unlink()
            os.mkfifo(base / "fifo/.git")
            (admin / "common/commondir").unlink()
            os.mkfifo(admin / "common/commondir")
            (admin / "common-gone/commondir").unlink()
            os.symlink("nowhere", admin / "common-gone/commondir")
            write(admin, "common-empty/commondir", "\n")
            write(admin, "common-lost/commondir", "../../nowhere\n")
            (admin / "no-head/HEAD").rename(admin / "no-head/HEAD.moved")
            for folder in ("zero", "long", "junk", "empty", "bytes", "missing", "dangling", "loop", "link", "unreadable"):
                (base / folder).mkdir()
            os.symlink("/dev/zero", base / "zero/.git")
            write(base, "long/.git", "gitdir: " + "x" * (1 << 20))
            write(base, "junk/.git", "not a pointer\n")
            write(base, "empty/.git", "")
            (base / "bytes/.git").write_bytes(b"gitdir: \xff\xfe\n")
            write(base, "missing/.git", "gitdir: ../nowhere\n")
            os.symlink("nowhere", base / "dangling/.git")
            os.symlink(".git", base / "loop/.git")
            os.symlink(base / "fifo/.git", base / "link/.git")
            write(base, "unreadable/.git", "gitdir: ../other/.git/worktrees/fifo\n").chmod(0)
            closed = [*worktrees, "zero", "long", "junk", "empty", "bytes", "missing", "dangling", "loop", "link"]
            if os.access(base / "unreadable/.git", os.R_OK):
                self.assertEqual(os.geteuid(), 0, "only root reads a file without a mode bit")
            else:
                closed.append("unreadable")
            for folder in closed:
                for name in ("Makefile", "GNUmakefile", "scripts/gate.py", ".claude/settings.json", ".git"):
                    with self.subTest(blocked=f"{folder}/{name}"):
                        result = self.run_hook(f"{temp}/{folder}/{name}", project, bounded=True)
                        self.assertEqual((result.returncode, result.stdout), (2, ""), result.stderr)
                        self.assertIn("Blocked protected governance path", result.stderr)
                with self.subTest(open=folder):
                    result = self.run_hook(f"{temp}/{folder}/src/main.py", project, bounded=True)
                    self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
            # Git's own folder, also behind a link, a pointer to a git folder that is no worktree's (a submodule, a
            # separate git folder), a worktree of a repository the scaffold does not govern, and no entry at all:
            # none of them governs the folder.
            (base / "none").mkdir()
            (base / "linked").mkdir()
            os.symlink(plain / ".git", base / "linked/.git")
            self.assertTrue((plain / "module/.git").is_file())
            self.assertFalse((plain / "module/.agentic/version").exists())
            for folder in ("plain", "plain-worktree", "plain/module", "separate", "none", "linked"):
                for name in ("Makefile", "scripts/gate.py", "src/main.py"):
                    with self.subTest(ungoverned=f"{folder}/{name}"):
                        result = self.run_hook(f"{temp}/{folder}/{name}", project, bounded=True)
                        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
            # Only the folder that holds the entry is governed, not the folders in it.
            self.assertEqual(self.run_hook(f"{temp}/junk/sub/Makefile", project, bounded=True).returncode, 0)
            self.assertEqual(self.run_hook(f"{temp}/junk/sub/../Makefile", project, bounded=True).returncode, 2)

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_a_git_entry_that_holds_no_repository_governs_its_folder(self) -> None:
        # A shell step can leave an entry the hook used to read as git's own: any folder as `.git`, a pointer to a
        # folder with a HEAD, a worktree whose `commondir` is gone or names any folder. Each took the protection
        # off a worktree of a commit older than the scaffold (review of 2.8.3, C1 and K1). Git takes a folder as a
        # repository only with `objects/` and `refs/` in it; the hook now asks for the same.
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            project = self.outside_project(temp, [temp])
            other, plain = base / "other", base / "plain"
            write(other, ".agentic/version", "2.8.3\n")
            setup = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t"]
            worktrees = ("folder", "link", "self", "no-common", "common-any")
            for command in (
                ["init", "-q", str(other)],
                ["-C", str(other), "commit", "-q", "--allow-empty", "-m", "first"],
                *(["-C", str(other), "worktree", "add", "-q", str(base / name)] for name in worktrees),
                ["init", "-q", str(plain)],
            ):
                subprocess.run(setup + command, check=True, capture_output=True)
            admin = other / ".git/worktrees"
            (base / "any").mkdir()
            (base / "folder/.git").unlink()
            (base / "folder/.git").mkdir()
            (base / "link/.git").unlink()
            os.symlink(base / "any", base / "link/.git")
            write(base, "self/.git", "gitdir: .\n")
            write(base, "self/HEAD", "ref: refs/heads/main\n")
            (admin / "no-common/commondir").rename(admin / "no-common/commondir.moved")
            write(admin, "common-any/commondir", f"{base / 'any'}\n")
            for folder in worktrees:
                for name in ("Makefile", "scripts/gate.py", ".git"):
                    with self.subTest(blocked=f"{folder}/{name}"):
                        result = self.run_hook(f"{temp}/{folder}/{name}", project, bounded=True)
                        self.assertEqual((result.returncode, result.stdout), (2, ""), result.stderr)
                        self.assertIn("Blocked protected governance path", result.stderr)
                with self.subTest(open=folder):
                    result = self.run_hook(f"{temp}/{folder}/src/main.py", project, bounded=True)
                    self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
            # A repository the scaffold does not govern stays open, also one with nothing committed.
            for name in ("Makefile", "scripts/gate.py"):
                with self.subTest(ungoverned=name):
                    result = self.run_hook(f"{temp}/plain/{name}", project, bounded=True)
                    self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    @unittest.skipUnless(hasattr(os, "mkfifo") and Path("/dev/zero").exists(), "needs a FIFO and /dev/zero")
    def test_local_settings_that_are_no_small_regular_file_list_no_folder(self) -> None:
        # The hook read the local settings whole to find the listed folders: a FIFO there held it past its five
        # seconds, so a write outside the repository got no answer (review of 2.8.3, C2 and K2). It now reads a
        # regular file of at most 1 MiB; anything else lists no folder, so the path asks.
        def large(path: Path) -> None:
            path.write_text(json.dumps({"permissions": {"additionalDirectories": [temp]}, "pad": "x" * (1 << 20)}), encoding="utf-8")

        makers = {
            "a FIFO": os.mkfifo,
            "a link to a FIFO": lambda path: (os.mkfifo(path.with_name("fifo")), os.symlink("fifo", path)),
            "a link to /dev/zero": lambda path: os.symlink("/dev/zero", path),
            "a folder": lambda path: path.mkdir(),
            "a file over the limit": large,
        }
        for label, make in makers.items():
            with self.subTest(settings=label), tempfile.TemporaryDirectory() as temp:
                project = self.outside_project(temp)
                make(project / ".claude/settings.local.json")
                result = self.run_hook(f"{temp}/notes/a.md", project, bounded=True)
                self.assertEqual((result.returncode, result.stderr), (0, ""))
                self.assertNotEqual(result.stdout, "", "the listed folder was read")
                self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "ask")
        with tempfile.TemporaryDirectory() as temp:
            # A listed folder in a file just under the limit still silences the ask.
            project = self.outside_project(temp)
            pad = "x" * ((1 << 20) - 200 - len(temp))
            text = json.dumps({"permissions": {"additionalDirectories": [temp]}, "pad": pad})
            self.assertLessEqual(len(text), 1 << 20)
            self.assertGreater(len(text), (1 << 20) - 4096)
            write(project, ".claude/settings.local.json", text)
            result = self.run_hook(f"{temp}/notes/a.md", project, bounded=True)
            self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_git_folder_and_worktree_pointer_of_a_governed_folder_are_blocked(self) -> None:
        # A worktree of a commit older than the scaffold is governed through its .git pointer: file tools wrote
        # junk there, then a GNUmakefile, then the pointer back (review R3-2). The folder the pointer leads to,
        # and the hooks and config git runs from it, are closed the same way.
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            project = self.outside_project(temp, [temp])
            other = base / "other"
            write(other, ".agentic/version", "2.8.2\n")
            setup = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t"]
            for command in (
                ["init", "-q", str(other)],
                ["-C", str(other), "commit", "-q", "--allow-empty", "-m", "first"],
                ["-C", str(other), "worktree", "add", "-q", str(base / "wt/branch")],
                ["init", "-q", str(base / "plain")],
            ):
                subprocess.run(setup + command, check=True, capture_output=True)
            self.assertTrue((base / "wt/branch/.git").is_file())
            self.assertFalse((base / "wt/branch/.agentic/version").exists())
            for path in (
                "wt/branch/.git",
                "other/.git",
                "other/.git/config",
                "other/.git/hooks/pre-commit",
                "other/.git/worktrees/branch/commondir",
                "other/.git/worktrees/branch/gitdir",
                "repo/.git",
                "repo/.git/config",
            ):
                with self.subTest(blocked=path):
                    self.assertTrue(protected.is_protected(f"{temp}/{path}", project))
            self.assertTrue(protected.is_protected(".git/hooks/pre-commit", project))
            for path in ("other/.gitignore", "other/.github/CODEOWNERS", "other/src/.git", "wt/branch/.gitattributes",
                         "plain/.git/config", "plain/.git"):
                with self.subTest(open=path):
                    self.assertFalse(protected.is_protected(f"{temp}/{path}", project))
            for path in ("wt/branch/.git", "other/.git/worktrees/branch/commondir"):
                with self.subTest(hook=path):
                    result = self.run_hook(f"{temp}/{path}", project)
                    self.assertEqual((result.returncode, result.stdout), (2, ""), result.stderr)
                    self.assertIn("Blocked protected governance path", result.stderr)
            # With the pointer out of reach the worktree stays governed.
            self.assertTrue(protected.is_protected(f"{temp}/wt/branch/GNUmakefile", project))

    def run_hook(self, path: str, project: Path = ROOT, bounded: bool = False) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "check_protected_paths.py")],
            input=json.dumps({"tool_input": {"file_path": str(project / path)}}),
            text=True,
            capture_output=True,
            env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
            check=False,
            **(bounds() if bounded else {}),
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
            record = write(root, "docs/records/tasks/r01-x/TASK-001-z.md", "---\nstatus: closed\n---\n\n# TASK-001\n")
            write(root, governance.LEGACY_RECORDS, f"{hashlib.sha256(record.read_bytes()).hexdigest()}  docs/records/tasks/r01-x/TASK-001-z.md\n")
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


    def test_closed_task_records_pass_the_close_checks_unless_closed_before_the_port(self) -> None:
        old = """---\nstatus: closed\nrelease: r01-x\nnumber: {number}\n{size}---\n\n# TASK-{number} — Old\n\n## Spec\n\nWorks.\n\n## Independent review\n\nReviewed.\n\n## Outcome\n\naccepted\n"""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            closed = TASK.replace("status: active", "status: closed")
            write(root, "docs/records/tasks/r01-x/TASK-001-a.md", closed.format(size="size: M\n", review="Not required (S).", outcome="- [x] AC-1: test"))
            write(root, "docs/records/tasks/r01-x/TASK-003-c.md", closed.format(size="size: S\n", review="Not required (S).", outcome="- [x] AC-1: test"))
            # Closed before the port, in the earlier format, with and without a size: listed, so skipped.
            listed = [
                write(root, "docs/records/tasks/r00-old/TASK-005-old.md", old.format(number="005", size="")),
                write(root, "docs/records/tasks/r00-old/TASK-006-old.md", old.format(number="006", size="size: M\n")),
                write(root, "docs/records/tasks/r00-old/TASK-008-edited.md", old.format(number="008", size="")),
            ]
            # The same format closed after the port, by hand: not listed, so checked.
            write(root, "docs/records/tasks/r01-x/TASK-007-late.md", old.format(number="007", size=""))
            lines = "".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root).as_posix()}\n" for path in listed)
            write(root, governance.LEGACY_RECORDS, f"# closed before the 2.8 port\n{lines}{'0' * 64}  docs/records/tasks/r00-old/TASK-009-gone.md\n"
                  "docs/records/tasks/r00-old/TASK-010-no-digest.md\n")
            # A listed record rewritten after the port no longer matches its digest, so it is checked.
            listed[2].write_text(old.format(number="008", size="size: S\n"), encoding="utf-8")
            errors = governance.check_closed_tasks(root)
            self.assertIn("docs/records/tasks/r01-x/TASK-001-a.md: size M: only S work closes without an independent review", errors)
            self.assertIn("docs/records/tasks/r01-x/TASK-007-late.md: Spec lists no acceptance item: list each as '- AC-N: criterion'", errors)
            self.assertIn(f"docs/records/tasks/r00-old/TASK-008-edited.md: changed since {governance.LEGACY_RECORDS} listed it, so the close checks apply", errors)
            self.assertIn(f"{governance.LEGACY_RECORDS}:6: not a '<sha256>  <path>' line", errors)
            self.assertFalse([error for error in errors if "TASK-003" in error or "TASK-005" in error or "TASK-006" in error], errors)
            self.assertEqual(
                [warning for warning in governance.warnings(root) if governance.LEGACY_RECORDS in warning],
                [f"{governance.LEGACY_RECORDS}: lists docs/records/tasks/r00-old/TASK-009-gone.md, which does not exist; remove the line"],
            )

    def test_the_repository_settings_run_the_scaffold_hooks(self) -> None:
        self.assertEqual(governance.check_settings(ROOT), [])

    def test_settings_whose_hooks_cannot_fire_fail_governance(self) -> None:
        # QA Q8: the hooks are read as Claude Code reads them; the right names somewhere in the text are not enough.
        # The settings are built here, one entry for each event with the scaffold's handlers first: the
        # repository's own file may hold its own hooks first or share the tools out, and the cases below
        # change an entry by its place.
        def entry(event: str, commands: tuple[str, ...]) -> dict:
            matcher = {"matcher": "|".join(governance.WRITE_TOOLS)} if event == "PreToolUse" else {}
            return {**matcher, "hooks": [{"type": "command", "command": command} for command in commands]}

        good = {"hooks": {event: [entry(event, commands)] for event, commands in governance.HOOK_COMMANDS.items()}}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)

            def errors_for(change: Callable[[dict], object]) -> list[str]:
                data = json.loads(json.dumps(good))
                change(data)
                write(root, ".claude/settings.json", json.dumps(data))
                return governance.check_settings(root)

            def pre(data: dict) -> dict:
                return data["hooks"]["PreToolUse"][0]

            per_tool = [{**good["hooks"]["PreToolUse"][0], "matcher": tool} for tool in governance.WRITE_TOOLS]
            for name, change in {
                "unchanged": lambda data: None,
                "hooks explicitly on": lambda data: data.update(disableAllHooks=False),
                "a wider matcher": lambda data: pre(data).update(matcher="Edit|Write|NotebookEdit|Bash"),
                "one entry per tool": lambda data: data["hooks"].update(PreToolUse=per_tool),
                # What Claude Code takes as the same hooks: the key that also blocks when the hook times out or
                # cannot start, names joined by commas, and a matcher on Stop, which it does not read.
                "a handler that blocks on failure": lambda data: pre(data)["hooks"][0].update(onFailure="block"),
                "names joined by commas": lambda data: pre(data).update(matcher="Edit, Write,NotebookEdit"),
                "a matcher on Stop": lambda data: data["hooks"]["Stop"][0].update(matcher="never"),
            }.items():
                with self.subTest(accepted=name):
                    self.assertEqual(errors_for(change), [])
            for name, (change, refusal) in {
                "disableAllHooks": (lambda data: data.update(disableAllHooks=True), "disableAllHooks is set"),
                "matcher without the file tools": (lambda data: pre(data).update(matcher="Bash"), "check_protected_paths.py hook"),
                "matcher without NotebookEdit": (lambda data: pre(data).update(matcher="Edit|Write"), "check_protected_paths.py hook"),
                "two of three tools": (lambda data: data["hooks"].update(PreToolUse=per_tool[:2]), "check_protected_paths.py hook"),
                "name under another event": (
                    lambda data: data["hooks"].update(PreToolUse=[], Notification=good["hooks"]["PreToolUse"]),
                    "hooks.PreToolUse",
                ),
                "exit status swallowed": (
                    lambda data: pre(data)["hooks"][0].update(command=pre(data)["hooks"][0]["command"] + " || true"),
                    "check_protected_paths.py hook",
                ),
                "hook that does not block": (lambda data: pre(data)["hooks"][0].update({"async": True}), "hooks.PreToolUse"),
                "hook that does not block on failure": (lambda data: pre(data)["hooks"][0].update(onFailure="ignore"), "hooks.PreToolUse"),
                # A pattern is not judged: what it matches is Claude Code's to say.
                "a pattern for a matcher": (lambda data: pre(data).update(matcher="Edit|Write|Notebook.*"), "hooks.PreToolUse"),
                "a pattern nested past the recursion limit": (
                    lambda data: pre(data).update(matcher="(" * 5000 + "Edit|Write|NotebookEdit" + ")" * 5000), "hooks.PreToolUse",
                ),
                "names only in a comment": (
                    lambda data: data["hooks"].update(
                        Stop=[{"hooks": [{"type": "command", "command": "true # make lint-fast stop-guard.sh"}]}]
                    ),
                    "hooks.Stop lacks the scaffold's make lint-fast hook",
                ),
                "capture for one agent type": (
                    lambda data: data["hooks"]["SubagentStop"][0].update(matcher="Explore"), "report-capture.sh hook",
                ),
                "hooks of the wrong shape": (lambda data: data.update(hooks=[]), "hooks.SubagentStop"),
            }.items():
                with self.subTest(refused=name):
                    errors = errors_for(change)
                    self.assertTrue([error for error in errors if refusal in error], errors)
            write(root, ".claude/settings.json", "[]")
            self.assertEqual(governance.check_settings(root), [".claude/settings.json: not a JSON object"])
            for text in ("{", "[" * 200000):
                write(root, ".claude/settings.json", text)
                self.assertIn("invalid JSON", governance.check_settings(root)[0])

    def test_local_settings_that_turn_the_hooks_off_warn(self) -> None:
        # The gitignored local settings can set disableAllHooks too; the file is the owner's own, so governance
        # warns with one line and does not fail (port review F5).
        line = (
            ".claude/settings.local.json: disableAllHooks is set; Claude Code runs no hook in this checkout, "
            "the protected-path hook included"
        )
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, ".claude/settings.json", (ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
            self.assertEqual(governance.local_settings_warnings(root), [])
            unread = ".claude/settings.local.json: cannot be read as JSON, so it was not checked; a disableAllHooks in it would go unseen"
            invalid = ".claude/settings.local.json: disableAllHooks is not true or false"
            for text, expected in (
                ('{"disableAllHooks": true}', [line]),
                ('{"disableAllHooks": false}', []),
                ('{"disableAllHooks": null}', []),
                # Claude Code takes the key as a Boolean, so another value turns no hook off (Codex on 2.8.2).
                ('{"disableAllHooks": "true"}', [invalid]),
                ('{"disableAllHooks": 1}', [invalid]),
                ('{"disableAllHooks": 0}', [invalid]),
                ('{"disableAllHooks": {}}', [invalid]),
                ('{"disableAllHooks": []}', [invalid]),
                ('{"permissions": {"additionalDirectories": ["../notes"]}}', []),
                ("[]", []),
                # A file Python cannot parse may still be one Claude Code reads: one line, never silence (review R3-3).
                ("{not json", [unread]),
                ('\ufeff{"disableAllHooks": true}', [unread]),
                ('{"disableAllHooks": true,}', [unread]),
                ('{\n  // off for now\n  "disableAllHooks": true\n}', [unread]),
            ):
                with self.subTest(text=text):
                    write(root, ".claude/settings.local.json", text)
                    self.assertEqual(governance.local_settings_warnings(root), expected)
                    self.assertEqual(governance.check_settings(root), [])
            empty = ".claude/settings.local.json: is empty, so it was not checked; write {} or remove the file"
            for text in ("", " \n\t\n"):
                with self.subTest(empty=text):
                    write(root, ".claude/settings.local.json", text)
                    self.assertEqual(governance.local_settings_warnings(root), [empty])
            # Nested past Python's recursion limit: one line, not a traceback (review R4-3).
            write(root, ".claude/settings.local.json", "[" * 200000)
            self.assertEqual(governance.local_settings_warnings(root), [unread])
            write(root, ".claude/settings.local.json", '{"disableAllHooks": true}')
            self.assertIn(line, governance.warnings(root))
            # The same key in the shared file stays an error.
            write(root, ".claude/settings.json", '{"disableAllHooks": true}')
            self.assertIn(".claude/settings.json: disableAllHooks is set; Claude Code then runs no hook", governance.check_settings(root))

    @unittest.skipUnless(hasattr(os, "mkfifo") and Path("/dev/zero").exists(), "needs a FIFO and /dev/zero")
    def test_local_settings_that_are_no_small_regular_file_are_never_read(self) -> None:
        # Governance read the file whole: a FIFO there held it for good and a link to /dev/zero read until memory
        # ended (review R4-5). It reads a regular file of at most 1 MiB and warns of anything else that is there.
        unread = ".claude/settings.local.json: cannot be read as JSON, so it was not checked; a disableAllHooks in it would go unseen"
        reader = (
            "import json, sys\n"
            "from pathlib import Path\n"
            "sys.path.insert(0, sys.argv[1])\n"
            "import check_governance\n"
            "print(json.dumps(check_governance.local_settings_warnings(Path(sys.argv[2]))))\n"
        )
        limit = governance.LOCAL_SETTINGS_BYTES
        self.assertEqual(limit, 1048576)
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            shapes: dict[str, tuple[Callable[[Path], object], list[str]]] = {
                "fifo": (os.mkfifo, [unread]),
                "zero": (lambda path: os.symlink("/dev/zero", path), [unread]),
                "folder": (lambda path: path.mkdir(), [unread]),
                "link to a fifo": (lambda path: (os.mkfifo(path.with_name("fifo")), os.symlink("fifo", path)), [unread]),
                "loop": (lambda path: os.symlink(path.name, path), [unread]),
                "over the limit": (lambda path: path.write_text("{}" + " " * (limit - 1), encoding="utf-8"), [unread]),
                "at the limit": (lambda path: path.write_text("{}" + " " * (limit - 2), encoding="utf-8"), []),
                "dangling link": (lambda path: os.symlink("nowhere", path), []),
                "missing": (lambda path: None, []),
            }
            for shape, (make, expected) in shapes.items():
                with self.subTest(shape=shape):
                    root = base / shape.replace(" ", "-")
                    (root / ".claude").mkdir(parents=True)
                    make(root / ".claude/settings.local.json")
                    result = subprocess.run(
                        [sys.executable, "-c", reader, str(SCRIPT_DIR), str(root)],
                        text=True,
                        capture_output=True,
                        check=False,
                        **bounds(),
                    )
                    self.assertEqual((result.stdout.strip(), result.returncode), (json.dumps(expected), 0), result.stderr)
            # A file the user cannot read is there all the same.
            root = base / "unreadable"
            write(root, ".claude/settings.local.json", '{"disableAllHooks": true}').chmod(0)
            if os.geteuid() != 0:
                self.assertEqual(governance.local_settings_warnings(root), [unread])

    def test_governance_reads_the_protected_list_from_the_hook(self) -> None:
        # The hook's own tuple is checked, not its source text: an entry in a comment or a string protects nothing.
        self.assertLessEqual(set(governance.PROTECTED_REQUIRED), set(protected.PROTECTED_GOVERNANCE))
        self.assertIn(".markdownlint.jsonc", governance.PROTECTED_REQUIRED)
        self.assertEqual(governance.check_protected(ROOT), [])
        hook = (SCRIPT_DIR / "check_protected_paths.py").read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "scripts/check_protected_paths.py", hook.replace('    ".markdownlint.jsonc",\n', '    # ".markdownlint.jsonc",\n', 1))
            self.assertEqual(governance.check_protected(root), ["scripts/check_protected_paths.py: missing .markdownlint.jsonc"])
            write(root, "scripts/check_protected_paths.py", "PROTECTED_GOVERNANCE = 'Makefile'\n")
            self.assertEqual(
                governance.check_protected(root), ["scripts/check_protected_paths.py: PROTECTED_GOVERNANCE is not a tuple of paths"]
            )
            write(root, "scripts/check_protected_paths.py", "raise SystemExit(0)\n")
            self.assertEqual(len(governance.check_protected(root)), 1)
            self.assertIn("cannot be loaded", governance.check_protected(root)[0])

    def test_a_template_a_newer_release_requires_warns_until_the_port(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("2.7.0", "2.8.0"):
                with self.subTest(version=name):
                    write(root, ".agentic/version", name + "\n")
                    errors = governance.validate(root)
                    missing = "missing required file: .agentic/templates/brief.md"
                    warned = [item for item in governance.warnings(root) if ".agentic/templates/brief.md" in item]
                    if name == "2.7.0":
                        self.assertNotIn(missing, errors)
                        self.assertTrue(warned and "required from scaffold 2.8.0" in warned[0], warned)
                    else:
                        self.assertIn(missing, errors)
                        self.assertEqual(warned, [])

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


class OrchestratorTests(unittest.TestCase):
    def test_runbook_names_what_the_liveness_scripts_need(self) -> None:
        # Without jq the Stop guard blocks nothing and says nothing; the runbook is where a host learns the list.
        runbook = " ".join((ROOT / "docs/current/runbooks/orchestration.md").read_text(encoding="utf-8").split())
        self.assertIn("Prerequisites:", runbook)
        line = runbook.split("Prerequisites:", 1)[1].split("## Rules", 1)[0]
        scripts = "".join(path.read_text(encoding="utf-8") for path in sorted((SCRIPT_DIR / "orchestrator").glob("*.sh")))
        for tool in ("jq", "flock", "stat", "readlink", "date", "timeout", "systemd-run", "systemctl"):
            with self.subTest(tool=tool):
                self.assertIn(tool + " ", scripts, "drop a tool no script calls from this test and the runbook")
                self.assertIn(f"`{tool}`", line)

    def test_liveness_files_match_their_manifest(self) -> None:
        self.assertEqual(governance.check_orchestrator(ROOT), [])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root, "scripts/orchestrator/a.sh", "echo a\n")
            digest = hashlib.sha256(b"echo a\n").hexdigest()
            write(root, "scripts/orchestrator/SHA256SUMS", f"{digest}  scripts/orchestrator/a.sh\n")
            self.assertEqual(governance.check_orchestrator(root), [])
            write(root, "scripts/orchestrator/a.sh", "echo b\n")
            self.assertEqual(len(governance.check_orchestrator(root)), 1)

    def run_script(self, script: str, *args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
        command = ["bash", str(ROOT / "scripts/orchestrator" / script), *args]
        return subprocess.run(
            command, env={**os.environ, **env}, capture_output=True, text=True, check=False
        )

    def test_heartbeat_add_validates_jobs_and_done_retires_them(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state, worktree = Path(temp) / "state", Path(temp) / "wt"
            worktree.mkdir()
            env = {"AGENTIC_RUN_STATE": str(state)}

            def heartbeat(*args: str) -> int:
                return self.run_script("heartbeat.sh", *args, env=env).returncode

            gone = subprocess.Popen(["true"])
            gone.wait()
            for rejected in (
                ("T-1", "agent", "a1", "-", "out", "DUE_M"),
                ("T-1", "agent", "a1", str(Path(temp) / "missing"), "out", "DUE_M"),
                ("T-1", "agent", "a1", str(worktree), "out", "soon"),
                ("T-1-gate", "shell", "-", "-", "log", "5"),
                ("T-1-gate", "shell", "-", "-", "log", "5", str(gone.pid)),
                ("T-1-gate", "shell", "-", "-", "log", "5", "0"),
                ("T-1-gate", "shell", "-", "-", "log", "5", "1"),
                ("T-1-gate", "shell", "-", "-", "log", "5", f"0{os.getpid()}"),
            ):
                self.assertEqual(heartbeat("add", *rejected), 2, rejected)
            self.assertFalse((state / "inflight.tsv").read_text(encoding="utf-8"))
            sleeper = subprocess.Popen(["sleep", "30"])
            try:
                self.assertEqual(heartbeat("add", "T-1", "agent", "a1", str(worktree), "out", "DUE_M"), 0)
                self.assertEqual(heartbeat("add", "T-1-gate", "shell", "-", "-", "log", "5", str(sleeper.pid)), 0)
                self.assertEqual(heartbeat("add", "T-1", "agent", "a2", str(worktree), "out", "-"), 0)
                rows = [row.split("\t") for row in (state / "inflight.tsv").read_text(encoding="utf-8").splitlines()]
                self.assertEqual([row[0] for row in rows], ["T-1-gate", "T-1"])
                self.assertEqual(rows[1], ["T-1", "agent", "a2", str(worktree.resolve()), "out", "-", "-"])
                self.assertEqual(rows[0][6], str(sleeper.pid))
                (state / "hb" / "T-1-gate.ev.exited").write_text("1 1\n", encoding="utf-8")
                self.assertEqual(heartbeat("done", "T-1-gate"), 0)
            finally:
                sleeper.kill()
                sleeper.wait()
            rows = (state / "inflight.tsv").read_text(encoding="utf-8").splitlines()
            self.assertEqual([row.split("\t")[0] for row in rows], ["T-1"])
            self.assertEqual(list((state / "hb").glob("T-1-gate.ev.*")), [])
            self.assertTrue((state / "hb" / "T-1-gate.ack").is_file())

    def test_gate_slot_waits_for_a_free_slot_and_keeps_the_exit_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = {"AGENTIC_GATE_LOCKS": temp, "GATE_SLOTS": "1", "GATE_POLL": "1"}
            self.assertEqual(self.run_script("gate-slot.sh", "sh", "-c", "exit 75", env=env).returncode, 75)
            marker = Path(temp) / "ran"
            with open(Path(temp) / "slot.0.lock", "w", encoding="utf-8") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                gate = subprocess.Popen(
                    ["bash", str(ROOT / "scripts/orchestrator/gate-slot.sh"), "touch", str(marker)],
                    env={**os.environ, **env},
                )
                time.sleep(1.5)
                self.assertFalse(marker.exists())
            self.assertEqual(gate.wait(timeout=20), 0)
            self.assertTrue(marker.exists())

    @contextlib.contextmanager
    def daemon(self, env: dict[str, str], scripts: Path = ROOT / "scripts/orchestrator") -> Iterator[subprocess.Popen[bytes]]:
        """heartbeat.sh run, stopped through a DONE status on exit."""
        state = Path(env["AGENTIC_RUN_STATE"])
        process = subprocess.Popen(
            ["bash", str(scripts / "heartbeat.sh"), "run"],
            env={"HB_EVERY": "1", **env}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            yield process
        finally:
            (state / "status").write_text("DONE\n", encoding="utf-8")
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    @contextlib.contextmanager
    def sleeping(self, seconds: int = 60, cwd: Path | None = None) -> Iterator[subprocess.Popen[bytes]]:
        process = subprocess.Popen(["sleep", str(seconds)], cwd=cwd)
        try:
            yield process
        finally:
            process.kill()
            process.wait()

    def test_limits_derive_gate_slots_from_cores_and_every_key_is_overridable(self) -> None:
        def limits(**env: str) -> list[str]:
            keys = "CONTEXT_CAP CALL_CAP IMPL_PER_SLOT LEAD_CAP HB_STALL GATE_CORES GATE_SLOTS IMPL_CAP"
            script = f'. "{ROOT}/scripts/orchestrator/limits.env"; for k in {keys}; do printf "%s " "${{!k}}"; done'
            clean = {key: value for key, value in os.environ.items() if key not in keys.split()}
            result = subprocess.run(
                [shutil.which("bash") or "bash", "-uc", script], env={**clean, **env}, capture_output=True, text=True, check=True
            )
            return result.stdout.split()

        nproc = int(subprocess.run(["nproc"], capture_output=True, text=True, check=True).stdout)
        slots = max(nproc // 8, 1)
        self.assertEqual(limits(), ["100000", "60", "2", "2", "3", "8", str(slots), str(2 * slots)])
        self.assertEqual(limits(GATE_CORES="1")[6:], [str(nproc), str(2 * nproc)])
        self.assertEqual(limits(GATE_CORES=str(nproc + 1))[6], "1")
        self.assertEqual(limits(GATE_SLOTS="3", IMPL_PER_SLOT="3")[6:], ["3", "9"])
        self.assertEqual(limits(CALL_CAP="7", IMPL_CAP="5")[1], "7")
        self.assertEqual(limits(IMPL_CAP="5")[7], "5")
        with tempfile.TemporaryDirectory() as temp:
            self.assertEqual(limits(PATH=temp)[6:], ["2", "4"])  # nproc cannot run

    def test_gate_slot_refuses_a_slot_count_it_cannot_serve(self) -> None:
        # QA Q10: with no slot, or a fraction of one, the gate waited forever without a word.
        with tempfile.TemporaryDirectory() as temp:
            for key, value, refusal in (
                ("GATE_SLOTS", "0", "limits.env: GATE_SLOTS='0' serves no gate; at least 1"),
                ("GATE_SLOTS", "0.5", "limits.env: GATE_SLOTS='0.5' is not a whole number"),
                ("GATE_SLOTS", "010", "limits.env: GATE_SLOTS='010' is not a whole number"),
                ("GATE_POLL", "1.5", "limits.env: GATE_POLL='1.5' is not a whole number"),
                ("HB_EVERY", "0.5", "limits.env: HB_EVERY='0.5' is not a whole number"),
            ):
                with self.subTest(key=key, value=value):
                    env = {**isolated(temp, GATE_SLOTS="1", GATE_POLL="1"), key: value}
                    command = ["bash", str(ROOT / "scripts/orchestrator/gate-slot.sh"), "true"]
                    try:
                        gate = subprocess.run(command, env=env, capture_output=True, text=True, check=False, timeout=10)
                    except subprocess.TimeoutExpired:
                        self.fail(f"{key}={value}: the gate waits forever")
                    self.assertEqual((gate.returncode, gate.stderr.strip()), (2, refusal))
            fraction = self.run_script("gate-slot.sh", "true", env=isolated(temp, GATE_SLOTS="1", EST_S="0.25", HB_CPUMIN="0"))
            self.assertEqual(fraction.returncode, 0, fraction.stderr)

    def test_heartbeat_logs_a_reader_idle_quietly_and_delivers_an_agent_idle(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, HB_PING="1")
            state, worktree = Path(temp) / "state", Path(temp) / "wt"
            worktree.mkdir()
            for job in (("R", "reader", "-", "-", "-", "-"), ("A", "agent", "-", str(worktree), "-", "-")):
                self.assertEqual(self.run_script("heartbeat.sh", "add", *job, env=env).returncode, 0, job)
            self.assertEqual(self.run_script("heartbeat.sh", "add", "W", "agent", "-", "-", "-", "-", env=env).returncode, 2)
            with self.daemon(env):
                self.assertTrue(until(lambda: "idle R" in text_of(state / "quiet.log") and "idle A" in text_of(state / "events.log")))
            self.assertNotIn("idle R", text_of(state / "events.log"))
            self.assertNotIn("idle A", text_of(state / "quiet.log"))
            self.assertFalse((state / "hb/R.ev.idle").exists())
            self.assertRegex(text_of(state / "liveness.txt"), r"(?m)^R reader state=idle .* calls=\? tokens=\?$")

    def test_heartbeat_raises_cap_from_the_agent_transcript(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "config"
            env = isolated(temp, CLAUDE_CONFIG_DIR=str(config), CALL_CAP="2", CONTEXT_CAP="1000")
            state, worktree = Path(temp) / "state", Path(temp) / "wt"
            worktree.mkdir()

            def turn(*tools: str, tokens: int = 10) -> str:
                content = [{"type": "tool_use", "id": tool, "name": "Bash", "input": {}} for tool in tools]
                usage = {"input_tokens": tokens, "cache_read_input_tokens": tokens, "output_tokens": 1}
                return json.dumps({"type": "assistant", "message": {"content": content, "usage": usage}})

            calls = "\n".join([json.dumps({"type": "user"}), turn("t1"), turn("t2"), turn("t2")]) + '\n{"type": "assist'
            write(config, "projects/-repo/s1/subagents/agent-acalls1.jsonl", calls)
            write(config, "projects/-repo/s1/subagents/agent-atoken1.jsonl", turn("t1", tokens=600) + "\n")
            write(config, "projects/-repo/s1/subagents/agent-anone10.jsonl", turn("t1", "t2", "t3") + "\n")
            for job, agent in (("C", "acalls1"), ("T", "atoken1"), ("N", "anone1")):
                self.assertEqual(self.run_script("heartbeat.sh", "add", job, "agent", agent, str(worktree), "-", "-", env=env).returncode, 0)
            with self.daemon(env):
                self.assertTrue(until(lambda: "calls=? tokens=?" in text_of(state / "liveness.txt") and "cap T" in text_of(state / "events.log")))
            events = text_of(state / "events.log")
            self.assertIn("cap C 2 calls 21 tokens", events)
            self.assertIn("cap T 1 calls 1201 tokens", events)
            self.assertNotIn("cap N", events)  # anone10's transcript is not anone1's
            self.assertEqual(text_of(state / "hb/C.transcript").strip(), str((config / "projects/-repo/s1/subagents/agent-acalls1.jsonl").resolve()))
            self.assertRegex(text_of(state / "liveness.txt"), r"(?m)^N agent .* calls=\? tokens=\?$")

    def test_heartbeat_add_and_reset_rename_exit_and_pid_markers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp)
            hb = Path(temp) / "state/hb"
            gone = subprocess.Popen(["true"])
            gone.wait()
            write(hb, "J.exit", "1\n")
            write(hb, "J.pid", f"{gone.pid}\n")
            write(hb, "J.ev.idle", "1 1\n")
            with self.sleeping() as sleeper:
                self.assertEqual(self.run_script("heartbeat.sh", "add", "J", "shell", "-", "-", "log", "-", str(sleeper.pid), env=env).returncode, 0)
                self.assertEqual([text_of(path) for path in sorted(hb.glob("J.exit.*"))], ["1\n"])
                self.assertEqual([text_of(path) for path in sorted(hb.glob("J.pid.*"))], [f"{gone.pid}\n"])
                self.assertFalse((hb / "J.exit").exists() or (hb / "J.pid").exists() or (hb / "J.ev.idle").exists())
                write(hb, "J.pid", f"{sleeper.pid}\n")
                write(hb, "J.exit", "0\n")
                self.assertEqual(self.run_script("heartbeat.sh", "reset", "J", env=env).returncode, 0)
                self.assertEqual(text_of(hb / "J.pid"), f"{sleeper.pid}\n")  # a live launch keeps its pid marker
                self.assertEqual(sorted(text_of(path) for path in hb.glob("J.exit.*")), ["0\n", "1\n"])
                self.assertTrue((hb / "J.ack").exists())

    def test_heartbeat_add_keeps_the_state_of_a_job_whose_name_extends_this_one(self) -> None:
        # QA Q3: fix-2.8.1.ack starts with "fix-2.8." but is the state of another job.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp)
            hb = Path(temp) / "state/hb"
            other = ("start", "ack", "exit", "pid", "prev", "act", "prog", "usage", "ev.idle", "quiet.idle", "rep.fix-2.8.1-r1.md")
            own = ("prev", "act", "prog", "usage", "transcript", "qtotal", "qstart", "ev.stuck", "quiet.idle", "rep.fix-2.8-r1.md")
            with self.sleeping() as sleeper:
                add = ("shell", "-", "-", "-", "30", str(sleeper.pid))
                self.assertEqual(self.run_script("heartbeat.sh", "add", "fix-2.8.1", *add, env=env).returncode, 0)
                for suffix in other:
                    write(hb, f"fix-2.8.1.{suffix}", "1\n")
                for mode in (("add", "fix-2.8", *add), ("reset", "fix-2.8")):
                    with self.subTest(mode=mode[0]):
                        for suffix in own:
                            write(hb, f"fix-2.8.{suffix}", "1\n")
                        self.assertEqual(self.run_script("heartbeat.sh", *mode, env=env).returncode, 0)
                        self.assertEqual([s for s in other if not (hb / f"fix-2.8.1.{s}").exists()], [], "another job's state is gone")
                        self.assertEqual([s for s in own if (hb / f"fix-2.8.{s}").exists()], [], "this job's state was kept")
                        self.assertTrue((hb / "fix-2.8.ack").exists())

    def test_a_report_belongs_to_one_job_only(self) -> None:
        # QA Q4: fix-s1-r1.md is the report of job fix-s1; read by prefix it was also job fix's, which nobody acks.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, HB_UNACTED="0", HB_STALE="9999")
            state = Path(temp) / "state"
            write(Path(temp), "bin/systemctl", "#!/bin/sh\nexit 0\n").chmod(0o755)
            guard = ["bash", str(ROOT / "scripts/orchestrator/stop-guard.sh")]
            with self.sleeping() as sleeper:
                for job in ("fix", "fix-s1"):
                    added = self.run_script("heartbeat.sh", "add", job, "shell", "-", "-", "-", "30", str(sleeper.pid), env=env)
                    self.assertEqual(added.returncode, 0, added.stderr)
                write(state, "hb/watch.pid", f"{sleeper.pid}\n")
                for name in ("fix.ack", "fix-s1.ack"):
                    os.utime(state / "hb" / name, (1, 1))
                write(state, "reports/fix-s1-r1.md", "report\n")

                def blocked() -> str:
                    return subprocess.run(guard, input='{"session_id": "s"}', env=env, capture_output=True, text=True, check=False).stdout

                self.assertIn("heartbeat.sh ack fix-s1.", blocked())
                self.assertEqual(self.run_script("heartbeat.sh", "ack", "fix-s1", env=env).returncode, 0)
                self.assertEqual(blocked(), "", "job fix is asked to ack the report of job fix-s1")
                with self.daemon(env):
                    self.assertTrue(until(lambda: "report fix-s1 " in text_of(state / "events.log")))
                    time.sleep(2.5)
                self.assertNotIn("report fix ", text_of(state / "events.log"))
                self.assertNotIn("fix report unread", text_of(state / "watchdog.log"))
                (state / "status").unlink()  # the daemon helper ends the run; the guard passes a finished run
                # Both report names of a job still count, and a later one is unread again.
                write(state, "reports/fix-s1-s1700000000.md", "captured\n")
                self.assertIn("fix-s1-s1700000000.md", blocked())
                write(state, "reports/fix-r12.md", "report\n")
                self.assertIn("heartbeat.sh ack fix.", blocked())

    def test_heartbeat_takes_a_registered_transcript_path_and_rejects_a_glob_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, CALL_CAP="1")
            state, worktree = Path(temp) / "state", Path(temp) / "wt"
            worktree.mkdir()
            turn = json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {}}]}})
            transcript = write(Path(temp), "elsewhere/run.jsonl", turn + "\n")
            self.assertEqual(self.run_script("heartbeat.sh", "add", "G", "agent", "a*", str(worktree), "-", "-", env=env).returncode, 2)
            self.assertEqual(self.run_script("heartbeat.sh", "add", "M", "agent", str(Path(temp) / "none.jsonl"), str(worktree), "-", "-", env=env).returncode, 2)
            # A path through a symlink is stored resolved, so the SubagentStop hook matches it however it names the file.
            (Path(temp) / "link").symlink_to(transcript.parent)
            self.assertEqual(self.run_script("heartbeat.sh", "add", "P", "agent", str(Path(temp) / "link/run.jsonl"), str(worktree), "-", "-", env=env).returncode, 0)
            self.assertEqual(text_of(state / "inflight.tsv").split("\t")[2], str(transcript.resolve()))
            with self.daemon(env):
                self.assertTrue(until(lambda: "cap P 1 calls" in text_of(state / "events.log")))

    def test_heartbeat_reads_no_transcript_when_an_agent_id_names_two(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "config"
            env = isolated(temp, CLAUDE_CONFIG_DIR=str(config), CALL_CAP="1")
            state, worktree = Path(temp) / "state", Path(temp) / "wt"
            worktree.mkdir()
            turn = json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {}}]}})
            for project in ("-repo", "-other"):
                write(config, f"projects/{project}/s1/subagents/agent-atwice1.jsonl", turn + "\n")
            self.assertEqual(self.run_script("heartbeat.sh", "add", "W", "agent", "atwice1", str(worktree), "-", "-", env=env).returncode, 0)
            with self.daemon(env):
                self.assertTrue(until(lambda: "transcript W agent id atwice1 names more than one" in text_of(state / "events.log")))
            self.assertNotIn("cap W", text_of(state / "events.log"))
            self.assertFalse((state / "hb/W.transcript").exists())

    def test_report_capture_matches_a_transcript_named_through_a_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp)
            state = Path(env["AGENTIC_RUN_STATE"])
            transcript = write(Path(temp), "real/t.jsonl", json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "done"}]}}) + "\n")
            (Path(temp) / "link").symlink_to(transcript.parent)
            write(state, "inflight.tsv", f"job1\tagent\t{transcript.resolve()}\t-\t-\t-\t-\n")
            stop = json.dumps({"agent_id": "ag9", "agent_transcript_path": str(Path(temp) / "link/t.jsonl")})
            subprocess.run(["bash", str(ROOT / "scripts/orchestrator/report-capture.sh")], input=stop,
                           env={**os.environ, **env}, capture_output=True, text=True, check=True)
            self.assertEqual(len(list((state / "reports").glob("job1-s*.md"))), 1)

    def test_heartbeat_counts_a_reused_pid_as_exited(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp)
            state = Path(temp) / "state"
            with self.sleeping() as job:
                self.assertEqual(self.run_script("heartbeat.sh", "add", "J", "shell", "-", "-", "log", "-", str(job.pid), env=env).returncode, 0)
                stat = text_of(Path(f"/proc/{job.pid}/stat")) if Path(f"/proc/{job.pid}/stat").exists() else ""
                if stat:
                    self.assertEqual(text_of(state / "hb/J.start").strip(), stat.rsplit(")", 1)[1].split()[19])
                self.assertEqual(self.run_script("heartbeat.sh", "reset", "J", env=env).returncode, 0)
                self.assertTrue((state / "hb/J.start").exists(), "reset keeps the start time of the running launch")
                # The same pid with another start time is another process: the job has exited.
                (state / "hb/J.start").write_text("1\n", encoding="utf-8")
                with self.daemon(env):
                    self.assertTrue(until(lambda: f"exited J pid {job.pid} gone" in text_of(state / "events.log")))

    def test_heartbeat_add_moves_aside_a_live_pid_marker_of_another_process(self) -> None:
        # A reused job name must track the process it registers, not the one an earlier launch left.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp)
            hb = Path(temp) / "state/hb"
            with self.sleeping() as earlier, self.sleeping() as launch:
                write(hb, "J.pid", f"{earlier.pid}\n")
                self.assertEqual(self.run_script("heartbeat.sh", "add", "J", "shell", "-", "-", "log", "-", str(launch.pid), env=env).returncode, 0)
                self.assertFalse((hb / "J.pid").exists())
                self.assertEqual([text_of(path) for path in hb.glob("J.pid.*")], [f"{earlier.pid}\n"])
                write(hb, "J.pid", f"{earlier.pid}\n")
                self.assertEqual(self.run_script("heartbeat.sh", "reset", "J", env=env).returncode, 0)
                self.assertFalse((hb / "J.pid").exists())

    def gate(self, env: dict[str, str], *command: str, cwd: Path | None = None) -> subprocess.Popen[str]:
        return subprocess.Popen(
            ["bash", str(ROOT / "scripts/orchestrator/gate-slot.sh"), *command], env=env, cwd=cwd, text=True
        )

    def repository(self, folder: Path) -> Path:
        """A scratch git repository holding a copy of the orchestrator scripts; returns the copy's folder."""
        scripts = folder / "scripts/orchestrator"
        shutil.copytree(ROOT / "scripts/orchestrator", scripts)
        subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "init", "-q", str(folder)], check=True, capture_output=True)
        return scripts

    def sampled(self, scripts: Path, env: dict[str, str]) -> str:
        """liveness.txt after one sample of the heartbeat copy in scripts."""
        live = Path(env["AGENTIC_RUN_STATE"]) / "liveness.txt"
        beat = subprocess.Popen(["bash", str(scripts / "heartbeat.sh"), "run"], env={"HB_EVERY": "1", **env},
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            self.assertTrue(until(live.exists))
            return text_of(live)
        finally:
            beat.kill()
            beat.wait()
            live.unlink(missing_ok=True)

    def test_heartbeat_matches_a_ticket_by_job_name_only_within_its_repository(self) -> None:
        # The queue is host-wide: another project's gate may carry the same job name.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1")
            locks, ours, theirs = Path(temp) / "locks", Path(temp) / "ours", Path(temp) / "theirs"
            scripts, other = self.repository(ours), self.repository(theirs)
            add = ["bash", str(scripts / "heartbeat.sh"), "add", "impl-1", "shell", "-", "-", "-", "-"]
            with open(write(locks, "slot.0.lock", ""), "w", encoding="utf-8") as held, self.sleeping() as job:
                fcntl.flock(held, fcntl.LOCK_EX)
                self.assertEqual(subprocess.run([*add, str(job.pid)], env=env, check=False).returncode, 0)
                for script, cwd, state in ((other, theirs, "running"), (scripts, ours, "queued")):
                    with self.subTest(gate=cwd.name):
                        waiting = subprocess.Popen(["bash", str(script / "gate-slot.sh"), "true"], env={**env, "AGENTIC_JOB": "impl-1"}, cwd=cwd)
                        try:
                            self.assertTrue(until(lambda: any((locks / "queue").glob(f"*-{waiting.pid}"))))
                            ticket = text_of(next((locks / "queue").glob(f"*-{waiting.pid}"))).splitlines()
                            self.assertEqual(ticket[3], str((cwd / ".git").resolve()))
                            self.assertIn(f"impl-1 shell state={state}", self.sampled(scripts, env))
                        finally:
                            waiting.terminate()
                            waiting.wait(timeout=10)

    def test_heartbeat_finds_a_gate_started_through_a_symlink_to_the_worktree(self) -> None:
        # add stores the worktree resolved, so the ticket must name the gate's directory resolved too.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1")
            locks, worktree, link = Path(temp) / "locks", Path(temp) / "wt", Path(temp) / "link"
            worktree.mkdir()
            link.symlink_to(worktree)
            self.assertEqual(self.run_script("heartbeat.sh", "add", "A", "agent", "-", str(link), "-", "-", env=env).returncode, 0)
            with open(write(locks, "slot.0.lock", ""), "w", encoding="utf-8") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                # The shell keeps the logical path in PWD, as an agent that entered the worktree by its link does.
                waiting = subprocess.Popen(["bash", "-c", 'cd "$1" && exec bash "$2" true', "sh", str(link), str(ROOT / "scripts/orchestrator/gate-slot.sh")], env=env)
                try:
                    self.assertTrue(until(lambda: any((locks / "queue").glob(f"*-{waiting.pid}"))))
                    self.assertEqual(text_of(next((locks / "queue").glob(f"*-{waiting.pid}"))).splitlines()[0], str(worktree.resolve()))
                    self.assertIn("A agent state=queued", self.sampled(ROOT / "scripts/orchestrator", env))
                finally:
                    waiting.terminate()
                    waiting.wait(timeout=10)

    def test_gate_slot_serves_waiters_in_arrival_order_landing_first(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1")
            locks, order, here = Path(temp) / "locks", Path(temp) / "order", Path(temp) / "here"
            here.mkdir()
            gone = subprocess.Popen(["true"])
            gone.wait()
            write(locks, f"queue/0-000000000001-{gone.pid}", "/x\n\n")  # a dead waiter's ticket never blocks the queue
            with open(write(locks, "slot.0.lock", ""), "w", encoding="utf-8") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                waiters = {}
                for name, extra in (("A", {"AGENTIC_JOB": "job-a"}), ("B", {}), ("K", {}), ("C", {"AGENTIC_GATE_CLASS": "landing"})):
                    waiters[name] = self.gate({**env, **extra}, "sh", "-c", f"echo {name} >> {order}", cwd=here)
                    self.assertTrue(until(lambda: len(list((locks / "queue").glob(f"*-{waiters[name].pid}"))) == 1))
                    time.sleep(1.1)  # the next waiter arrives a second later
                ticket = next((locks / "queue").glob(f"1-*-{waiters['A'].pid}"))
                self.assertEqual(text_of(ticket).splitlines()[:2], [str(here), "job-a"])
                waiters["K"].terminate()
                self.assertEqual(waiters["K"].wait(timeout=10), 143)
                self.assertEqual(list((locks / "queue").glob(f"*-{waiters['K'].pid}")), [])
            for name in "ABC":
                self.assertEqual(waiters[name].wait(timeout=30), 0)
            self.assertEqual(text_of(order).split(), ["C", "A", "B"])
            self.assertEqual(list((locks / "queue").iterdir()), [])

    def start_time(self, pid: int) -> str:
        """A process's start time as the tickets record it: /proc/<pid>/stat field 22, else ps lstart."""
        stat = Path(f"/proc/{pid}/stat")
        if stat.exists():
            return text_of(stat).rsplit(")", 1)[1].split()[19]
        shown = subprocess.run(["ps", "-o", "lstart=", "-p", str(pid)], capture_output=True, text=True, check=True)
        return "_".join(shown.stdout.split())

    def test_gate_slot_drops_a_ticket_whose_pid_names_another_process(self) -> None:
        # A waiter killed without its trap, or a reboot, leaves its ticket; the pid is reused by an unrelated process.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1", HB_PING="600")
            state, locks, worktree, ran = Path(temp) / "state", Path(temp) / "locks", Path(temp) / "wt", Path(temp) / "ran"
            worktree.mkdir()
            with self.sleeping() as reused, self.sleeping() as earlier:
                stale = [
                    write(locks, f"queue/0-000000000001-{reused.pid}", f"{worktree}\n\n1\n"),
                    write(locks, f"queue/0-000000000002-{earlier.pid}", f"{worktree}\n\n"),  # written before tickets held a start time
                    write(locks, "queue/0-000000000003-1", f"{worktree}\n\n1\n"),
                ]
                self.assertEqual(self.run_script("heartbeat.sh", "add", "A", "agent", "-", str(worktree), "-", "-", env=env).returncode, 0)
                with self.daemon(env):
                    self.assertTrue(until(lambda: "A agent state=" in text_of(state / "liveness.txt")))
                    self.assertIn("A agent state=running", text_of(state / "liveness.txt"))
                gate = self.gate(env, "touch", str(ran))
                try:
                    self.assertEqual(gate.wait(timeout=10), 0)
                except subprocess.TimeoutExpired:
                    self.fail("a ticket of a reused pid kept the gate waiting")
                finally:
                    gate.kill()
                    gate.wait()
                self.assertTrue(ran.exists())
                self.assertEqual([path for path in stale if path.exists()], [])

    def test_gate_slot_waits_behind_an_earlier_releases_live_waiter(self) -> None:
        # A gate waiting through the upgrade holds a ticket without a start time; dropping it would strand that gate.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1")
            locks, ran = Path(temp) / "locks", Path(temp) / "ran"
            earlier = subprocess.Popen(["bash", "-c", "sleep 60 & wait", "gate-slot.sh"], start_new_session=True)
            try:
                ticket = write(locks, f"queue/1-000000000001-{earlier.pid}", "/x\n\n")
                gate = self.gate(env, "touch", str(ran))
                time.sleep(2.5)
                self.assertTrue(ticket.exists() and not ran.exists())
            finally:
                os.killpg(earlier.pid, 15)
                earlier.wait()
            try:
                self.assertEqual(gate.wait(timeout=20), 0)
            finally:
                gate.kill()
                gate.wait()
            self.assertTrue(ran.exists())

    def test_gate_slot_writes_its_ticket_again_when_it_is_gone(self) -> None:
        # Another waiter that cannot see this pid (another PID namespace, a hidden /proc) or a cleanup removes the ticket.
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1")
            locks, ran = Path(temp) / "locks", Path(temp) / "ran"
            with open(write(locks, "slot.0.lock", ""), "w", encoding="utf-8") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                waiting = self.gate(env, "touch", str(ran))
                try:
                    self.assertTrue(until(lambda: any((locks / "queue").glob(f"1-*-{waiting.pid}"))))
                    ticket = next((locks / "queue").glob(f"1-*-{waiting.pid}"))
                    before = text_of(ticket)
                    ticket.rename(Path(temp) / "taken")
                    self.assertTrue(until(ticket.exists, 10), "the waiter did not write its ticket again")
                    self.assertEqual(text_of(ticket), before)
                    ticket.rename(Path(temp) / "taken")
                except BaseException:
                    waiting.kill()
                    raise
            try:
                self.assertEqual(waiting.wait(timeout=10), 0)
            except subprocess.TimeoutExpired:
                self.fail("a waiter without its ticket never took the free slot")
            finally:
                waiting.kill()
                waiting.wait()
            self.assertTrue(ran.exists())
            self.assertEqual(list((locks / "queue").iterdir()), [])

    def test_gate_slot_ticket_records_its_waiters_start_time(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1")
            locks = Path(temp) / "locks"
            with open(write(locks, "slot.0.lock", ""), "w", encoding="utf-8") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                waiting = self.gate(env, "true")
                try:
                    self.assertTrue(until(lambda: any((locks / "queue").glob(f"1-*-{waiting.pid}"))))
                    ticket = next((locks / "queue").glob(f"1-*-{waiting.pid}"))
                    self.assertEqual(text_of(ticket).splitlines()[2], self.start_time(waiting.pid))
                finally:
                    waiting.terminate()
                    waiting.wait(timeout=10)

    def test_gate_slot_reads_the_agents_environment_file_as_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ran = Path(temp) / "ran"
            agents = write(
                Path(temp), "agents.env",
                f"# the agents' variables\nexport GATE_MARK=from-agents\n  QUOTED=\"a b\"\nRAW=$(touch {ran})\n\nLAST='x'",
            )
            env = isolated(temp, AGENTIC_GATE_ENV=str(agents), EXPECT_RAW=f"$(touch {ran})")
            check = ("sh", "-c", 'test "$GATE_MARK" = from-agents && test "$QUOTED" = "a b" && test "$RAW" = "$EXPECT_RAW" && test "$LAST" = x')
            self.assertEqual(self.gate(env, *check).wait(timeout=20), 0)
            self.assertFalse(ran.exists(), "a value ran as a command")
            self.assertEqual(self.gate({**env, "AGENTIC_GATE_ENV": str(Path(temp) / "missing")}, *check).wait(timeout=20), 2)
            # A limits key is read in arithmetic, where x[$(cmd)] would run cmd: any value but a number stops the gate.
            for line in (f"BASH_ENV={ran}", "LD_PRELOAD=/x.so", "touch x", "1A=b", f"GATE_CORES=x[$(touch {ran})]", "HB_EVERY=6O"):
                with self.subTest(line=line):
                    write(Path(temp), "bad.env", line + "\n")
                    gate = self.gate({**env, "AGENTIC_GATE_ENV": str(Path(temp) / "bad.env")}, "true")
                    self.assertEqual(gate.wait(timeout=20), 2)
                    self.assertFalse(ran.exists(), "a value ran as a command")
            for name in ("GATE_CORES", "HB_STUCK"):
                with self.subTest(name=name):
                    self.assertEqual(self.gate({**env, name: f"x[$(touch {ran})]"}, "true").wait(timeout=20), 2)
                    beat = subprocess.run(
                        ["bash", str(ROOT / "scripts/orchestrator/heartbeat.sh"), "status"],
                        env={**env, name: f"x[$(touch {ran})]"}, capture_output=True, text=True, timeout=20, check=False,
                    )
                    self.assertEqual(beat.returncode, 2, beat.stderr)
                    self.assertIn(f"limits.env: {name}=", beat.stderr)
                    self.assertFalse(ran.exists(), "a value ran as a command")
            self.assertEqual(self.gate({**env, "EST_S": "0.5", "GATE_CORES": "4"}, "true").wait(timeout=20), 0)

    def test_heartbeat_shows_a_gate_waiter_queued_without_idle_stuck_or_due(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, GATE_SLOTS="1", GATE_POLL="1", HB_PING="2", HB_STUCK="2")
            state, locks, worktree = Path(temp) / "state", Path(temp) / "locks", Path(temp) / "repo/wt"
            scripts = self.repository(Path(temp) / "repo")
            (worktree / "sub").mkdir(parents=True)
            with open(write(locks, "slot.0.lock", ""), "w", encoding="utf-8") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                waiting = self.gate({**env, "AGENTIC_JOB": "G"}, "true", cwd=worktree / "sub")
                try:
                    self.assertTrue(until(lambda: any((locks / "queue").glob(f"*-{waiting.pid}"))))
                    for job in (("A", "agent", "-", str(worktree), "-", "0"), ("G", "shell", "-", "-", "-", "0", str(waiting.pid))):
                        added = subprocess.run(["bash", str(scripts / "heartbeat.sh"), "add", *job], env=env, check=False)
                        self.assertEqual(added.returncode, 0)
                    with self.daemon(env, scripts):
                        live = state / "liveness.txt"
                        self.assertTrue(until(lambda: "A agent state=queued" in text_of(live) and "G shell state=queued" in text_of(live)))
                        time.sleep(4)  # past HB_PING, HB_STUCK and the due time
                        self.assertIn("A agent state=queued", text_of(live))
                        self.assertNotRegex(text_of(state / "events.log"), r"(idle|stuck|due) [AG]")
                        waiting.terminate()
                        waiting.wait(timeout=10)
                        self.assertTrue(until(lambda: "idle A" in text_of(state / "events.log")))
                finally:
                    waiting.kill()
                    waiting.wait()

    def test_heartbeat_start_hands_the_daemon_the_callers_settings(self) -> None:
        # A transient unit starts with the user manager's environment, not the caller's.
        with tempfile.TemporaryDirectory() as temp:
            args = Path(temp) / "args"
            env = isolated(temp, AGENTIC_HOST="host a", CLAUDE_CONFIG_DIR="/c", XDG_STATE_HOME="/x", HB_STALL="9", DUE_GATE="50")
            env.pop("HB_PING", None)
            write(Path(temp), "bin/systemctl", "#!/bin/sh\nexit 3\n").chmod(0o755)
            write(Path(temp), "bin/systemd-run", f"#!/bin/sh\nprintf '%s\\n' \"$@\" > {args}\n").chmod(0o755)
            started = self.run_script("heartbeat.sh", "start", env=env)
            self.assertEqual(started.returncode, 0, started.stderr)
            passed = text_of(args).splitlines()
            for expected in (
                f"--setenv=AGENTIC_RUN_STATE={(Path(temp) / 'state').resolve()}", "--setenv=AGENTIC_HOST=host a",
                f"--setenv=AGENTIC_GATE_LOCKS={Path(temp) / 'locks'}", "--setenv=CLAUDE_CONFIG_DIR=/c", "--setenv=XDG_STATE_HOME=/x",
                "--setenv=HB_STALL=9", "--setenv=DUE_GATE=50",
            ):
                self.assertIn(expected, passed)
            self.assertFalse([arg for arg in passed if arg.startswith("--setenv=HB_PING=")], "a key the caller did not set")
            self.assertEqual(passed[-3:], ["bash", str(ROOT / "scripts/orchestrator/heartbeat.sh"), "run"])

    def test_heartbeat_start_asks_systemd_for_no_restart_after_exit_0(self) -> None:
        # QA Q5: run exits 0 on DONE or STOPPED; restarted on every exit, the unit came back each RestartSec forever.
        # Checked here: the properties start hands systemd-run, and that run exits 0. No unit runs in this test.
        with tempfile.TemporaryDirectory() as temp:
            args, env = Path(temp) / "args", isolated(temp)
            write(Path(temp), "bin/systemctl", "#!/bin/sh\nexit 3\n").chmod(0o755)
            write(Path(temp), "bin/systemd-run", f"#!/bin/sh\nprintf '%s\\n' \"$@\" > {args}\n").chmod(0o755)
            self.assertEqual(self.run_script("heartbeat.sh", "start", env=env).returncode, 0)
            passed = text_of(args).splitlines()
            # Still restarted when killed (the runbook's daemon-crash test), but not after its own exit 0.
            self.assertIn("Restart=always", passed)
            self.assertIn("RestartPreventExitStatus=0", passed)
            write(Path(temp), "state/status", "DONE\n")
            ended = subprocess.run(
                ["bash", str(ROOT / "scripts/orchestrator/heartbeat.sh"), "run"], env=env, capture_output=True, check=False, timeout=20
            )
            self.assertEqual(ended.returncode, 0)

    def test_heartbeat_marks_stalled_and_restores_the_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp, HB_STALL="2", HB_STALE="0", HB_REPEAT="0")
            state = Path(temp) / "state"
            status = write(state, "status", "RUNNING since 10:00\n")
            with self.sleeping() as job, self.sleeping() as watch:
                self.assertEqual(self.run_script("heartbeat.sh", "add", "J", "shell", "-", "-", "-", "-", str(job.pid), env=env).returncode, 0)
                with self.daemon(env) as daemon:
                    self.assertTrue(until(lambda: text_of(status).startswith("STALLED ")))
                    self.assertIn("no heartbeat watch", text_of(status))
                    self.assertIsNone(daemon.poll())
                    write(state, "hb/watch.pid", f"{watch.pid}\n")
                    self.assertTrue(until(lambda: text_of(status) == "RUNNING since 10:00\n"))
                    (state / "hb/watch.pid").write_text("", encoding="utf-8")
                    status.write_text("PAUSED by the owner\n", encoding="utf-8")
                    alarms = text_of(state / "watchdog.log").count("\n")
                    self.assertTrue(until(lambda: text_of(state / "watchdog.log").count("\n") >= alarms + 3))
                    self.assertEqual(text_of(status), "PAUSED by the owner\n")

    def test_report_capture_skips_an_interim_stop_and_never_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env = isolated(temp)
            state, worktree = Path(temp) / "state", Path(temp) / "wt"
            worktree.mkdir()
            transcript = write(Path(temp), "t.jsonl", json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "done"}]}}) + "\n")
            hook = json.dumps({"agent_id": "a1", "agent_transcript_path": str(transcript)})

            def capture(stdin: str) -> int:
                return subprocess.run(
                    ["bash", str(ROOT / "scripts/orchestrator/report-capture.sh")], input=stdin, env=env,
                    capture_output=True, text=True, check=False, timeout=30,
                ).returncode

            with self.sleeping() as gate:
                for job in (("A", "agent", "a1", str(worktree), "-", "-"), ("A-gate", "shell", "-", str(worktree), "-", "-", str(gate.pid))):
                    self.assertEqual(self.run_script("heartbeat.sh", "add", *job, env=env).returncode, 0)
                self.assertEqual(capture(hook), 0)
                self.assertEqual(list((state / "reports").glob("A-s*.md")), [])
            self.assertEqual(capture("not json"), 0)
            self.assertEqual(capture(json.dumps({"agent_id": "a10", "agent_transcript_path": str(transcript)})), 0)
            self.assertEqual(list((state / "reports").glob("A-s*.md")), [])  # a10 is not a1
            self.assertEqual(capture(hook), 0)
            self.assertEqual([text_of(path) for path in (state / "reports").glob("A-s*.md")], ["done\n"])

    def test_workspace_refuses_a_symlink_swapped_in_after_mkdir(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            work, outside, state = base / "work", base / "outside", base / "state"
            work.mkdir()
            outside.mkdir()
            real = shutil.which("mkdir")
            # A mkdir that lets an attacker swap the new session folder for a symlink right after creating it.
            write(base, "swap/mkdir", f'#!/bin/sh\n{real} "$@" || exit\n'
                  f'case "$*" in *{work}/s) mv "{work}/s" "{work}/s.moved"; ln -s "{outside}" "{work}/s" ;; esac\n').chmod(0o755)
            env = isolated(temp, AGENTIC_WORKSPACE=str(work))
            env["PATH"] = f"{base / 'swap'}:{env['PATH']}"
            result = subprocess.run(
                ["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "init", "s"], env=env, capture_output=True, text=True, check=False
            )
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIn("changed under init", result.stderr)
            self.assertEqual(list(outside.iterdir()), [])
            self.assertFalse((state / "reports.id").exists() or (state / "live-note").exists() or (state / "reports").is_symlink())

    def test_workspace_writes_into_the_held_folder_after_a_symlink_swap(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            work, outside, state = base / "work", base / "outside", base / "state"
            work.mkdir()
            outside.mkdir()
            real = shutil.which("stat")
            # A stat that swaps the session folder for a symlink once init holds it, before the live note is written.
            write(base, "swap/stat", f'#!/bin/sh\n{real} "$@"; rc=$?\n'
                  f'if [ ! -e "{base}/swapped" ]; then touch "{base}/swapped"; mv "{work}/s" "{work}/s.moved"; ln -s "{outside}" "{work}/s"; fi\n'
                  'exit $rc\n').chmod(0o755)
            env = isolated(temp, AGENTIC_WORKSPACE=str(work))
            env["PATH"] = f"{base / 'swap'}:{env['PATH']}"
            result = subprocess.run(
                ["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "init", "s"], env=env, capture_output=True, text=True, check=False
            )
            self.assertTrue((base / "swapped").exists(), result.stderr)
            self.assertEqual(list(outside.iterdir()), [])
            self.assertTrue((work / "s.moved/s.md").is_file(), result.stderr)

    def test_workspace_note_and_write_refuse_a_folder_that_is_no_longer_the_runs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work, elsewhere = Path(temp) / "work", Path(temp) / "elsewhere"
            work.mkdir()
            env = isolated(temp, AGENTIC_WORKSPACE=str(work))
            self.assertEqual(self.run_script("workspace.sh", "init", "run1", env=env).returncode, 0)
            note = self.run_script("workspace.sh", "note", env=env).stdout.strip()
            self.assertEqual(note, str(work / "run1" / "run1.md"))
            written = subprocess.run(["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "write"],
                                     input="# Status\n", env={**os.environ, **env}, capture_output=True, text=True, check=False)
            self.assertEqual(written.returncode, 0, written.stderr)
            self.assertEqual(text_of(Path(note)), "# Status\n")
            # The folder is swapped for a symlink to a look-alike: note and write refuse, nothing lands there.
            (work / "run1").rename(Path(temp) / "moved")
            (elsewhere / "Reports").mkdir(parents=True)
            (work / "run1").symlink_to(elsewhere)
            self.assertEqual(self.run_script("workspace.sh", "note", env=env).returncode, 2)
            written = subprocess.run(["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "write"],
                                     input="# Hijacked\n", env={**os.environ, **env}, capture_output=True, text=True, check=False)
            self.assertEqual(written.returncode, 2)
            self.assertFalse((elsewhere / "run1.md").exists())

    def test_report_capture_writes_into_the_reports_folder_only_while_it_is_the_runs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work, elsewhere = Path(temp) / "work", Path(temp) / "elsewhere"
            work.mkdir()
            env = isolated(temp, AGENTIC_WORKSPACE=str(work))
            state = Path(env["AGENTIC_RUN_STATE"])
            self.assertEqual(self.run_script("workspace.sh", "init", "run1", env=env).returncode, 0)
            transcript = write(Path(temp), "t.jsonl", json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "done"}]}}) + "\n")
            write(state, "inflight.tsv", f"job1\tagent\tag1\t-\t-\t-\t-\n")
            stop = json.dumps({"agent_id": "ag1", "agent_transcript_path": str(transcript)})

            def capture() -> None:
                subprocess.run(["bash", str(ROOT / "scripts/orchestrator/report-capture.sh")], input=stop,
                               env={**os.environ, **env}, capture_output=True, text=True, check=True)

            capture()
            self.assertEqual(len(list((work / "run1" / "Reports").glob("job1-s*.md"))), 1)
            time.sleep(1.1)
            (work / "run1" / "Reports").rename(Path(temp) / "old-reports")
            (elsewhere).mkdir()
            (work / "run1" / "Reports").symlink_to(elsewhere)
            capture()
            self.assertEqual(list(elsewhere.iterdir()), [])
            self.assertEqual(len(list((state / "captured").glob("job1-s*.md"))), 1)

    def test_workspace_without_a_workspace_writes_through_a_symlinked_state_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            real, link = Path(temp).resolve() / "real", Path(temp).resolve() / "link"
            real.mkdir()
            link.symlink_to(real)
            env = isolated(temp, AGENTIC_WORKSPACE="", AGENTIC_RUN_STATE=str(link / "state"))
            self.assertEqual(self.run_script("workspace.sh", "init", "run1", env=env).returncode, 0)
            # heartbeat.sh start hands the daemon the resolved folder; the stored live note keeps the path init saw.
            for state, text in ((link / "state", "# One\n"), (real / "state", "# Two\n")):
                with self.subTest(state=state):
                    written = subprocess.run(["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "write"], input=text,
                                             env={**os.environ, **env, "AGENTIC_RUN_STATE": str(state)}, capture_output=True, text=True, check=False)
                    self.assertEqual(written.returncode, 0, written.stderr)
                    self.assertEqual(text_of(real / "state/run1.md"), text)

    def test_workspace_writes_past_a_crashed_runs_temporary_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp).resolve() / "work"
            work.mkdir()
            env = isolated(temp, AGENTIC_WORKSPACE=str(work))
            self.assertEqual(self.run_script("workspace.sh", "init", "run1", env=env).returncode, 0)
            folder = work / "run1"
            # Leftovers under every name the old scheme could pick, one a symlink out of the folder.
            outside = Path(temp) / "outside"
            for pid in range(1, 400):
                (folder / f".run1.md.tmp.{pid}").write_text("stale\n", encoding="utf-8")
            (folder / ".run1.md.tmp").symlink_to(outside)
            written = subprocess.run(["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "write"],
                                     input="# Fresh\n", env={**os.environ, **env}, capture_output=True, text=True, check=False)
            self.assertEqual(written.returncode, 0, written.stderr)
            self.assertEqual(text_of(folder / "run1.md"), "# Fresh\n")
            self.assertEqual(oct((folder / "run1.md").stat().st_mode & 0o777), oct(0o666 & ~self.umask()))
            self.assertFalse(outside.exists())

    def umask(self) -> int:
        mask = os.umask(0)
        os.umask(mask)
        return mask

    def test_workspace_on_another_host_finds_its_folder_by_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work, state = Path(temp).resolve() / "work", Path(temp) / "state"
            work.mkdir()

            def init(host: str) -> subprocess.CompletedProcess[str]:
                return self.workspace(state, "init", "s", workspace=str(work), host=host)

            self.assertEqual(Path(init("h1").stdout.strip()), work / "s")
            first, session, host, run = text_of(state / "reports.id").split()
            self.assertEqual((session, host), ("s", "h1"))
            self.assertRegex(run, r"^[0-9a-f]{32}$")
            self.assertEqual(text_of(work / "s/Reports/.run-id"), f"{run}\n")
            (work / "s/s.md").write_text("live\n", encoding="utf-8")
            shutil.copytree(work / "s", work / "s.copy")  # the folder as the other host sees it: new device and inode
            shutil.rmtree(work / "s")
            (work / "s.copy").rename(work / "s")
            moved = init("h2")
            self.assertEqual(Path(moved.stdout.strip()), work / "s", moved.stderr)
            again, _, host, kept = text_of(state / "reports.id").split()
            self.assertEqual((again, host, kept), (f"{os.stat(work / 's/Reports').st_dev}:{os.stat(work / 's/Reports').st_ino}", "h2", run))
            self.assertNotEqual(again, first)
            self.assertEqual(text_of(work / "s/s.md"), "live\n")
            (state / "reports.id").write_text(f"{again} s\n", encoding="utf-8")  # a record from before hosts were kept
            self.assertEqual(Path(init("h3").stdout.strip()), work / "s")
            self.assertEqual(text_of(state / "reports.id").split()[2:], ["h3", run])

    def test_workspace_on_another_host_adopts_only_one_folder_with_a_well_formed_run_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work, state = Path(temp).resolve() / "work", Path(temp) / "state"
            work.mkdir()
            self.assertEqual(Path(self.workspace(state, "init", "s", workspace=str(work), host="h1").stdout.strip()), work / "s")
            # The live note named a renamed folder; a copy under the session name carries the same run id.
            (work / "s").rename(work / "t")
            self.assertEqual(Path(self.workspace(state, "init", "s", workspace=str(work), host="h1").stdout.strip()), work / "t")
            shutil.copytree(work / "t", work / "s")
            twice = self.workspace(state, "init", "s", workspace=str(work), host="h2")
            self.assertEqual(twice.returncode, 2)
            self.assertIn("all carry this run's id", twice.stderr)
            shutil.rmtree(work / "s")
            (work / "t/Reports/.run-id").write_text("not-a-run-id\n", encoding="utf-8")
            record = text_of(state / "reports.id").split()
            (state / "reports.id").write_text(" ".join([*record[:3], "not-a-run-id"]) + "\n", encoding="utf-8")
            refused = self.workspace(state, "init", "s", workspace=str(work), host="h3")
            self.assertEqual(refused.returncode, 2)
            self.assertIn("not a run id", refused.stderr)
            (state / "reports.id").write_text(" ".join(record) + "\n", encoding="utf-8")
            fresh = self.workspace(state, "init", "s", workspace=str(work), host="h3")
            self.assertEqual(Path(fresh.stdout.strip()), work / "s", fresh.stderr)
            # On its own host, a folder whose .run-id was changed is not adopted; with a record from before run ids, init stops.
            (work / "s/Reports/.run-id").write_text("x\n", encoding="utf-8")
            broken = self.workspace(state, "init", "s", workspace=str(work), host="h3")
            self.assertNotEqual(Path(broken.stdout.strip()), work / "s", broken.stderr)
            (state / "reports.id").write_text(" ".join(text_of(state / "reports.id").split()[:2]) + "\n", encoding="utf-8")
            (Path(broken.stdout.strip()) / "Reports/.run-id").write_text("x\n", encoding="utf-8")
            stopped = self.workspace(state, "init", "s", workspace=str(work), host="h3")
            self.assertEqual(stopped.returncode, 2)
            self.assertIn("not a run id", stopped.stderr)

    def test_workspace_on_another_host_never_adopts_a_same_named_folder_of_another_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            work, state = Path(temp).resolve() / "work", Path(temp) / "state"
            work.mkdir()
            self.assertEqual(Path(self.workspace(state, "init", "s", workspace=str(work), host="h1").stdout.strip()), work / "s")
            shutil.rmtree(work / "s")
            other = Path(temp) / "other"  # another run of the same session name, claimed after this one's folder went away
            self.assertEqual(Path(self.workspace(other, "init", "s", workspace=str(work), host="h1").stdout.strip()), work / "s")
            moved = self.workspace(state, "init", "s", workspace=str(work), host="h2")
            self.assertEqual(Path(moved.stdout.strip()).name, f"s-{time.strftime('%Y-%m-%d')}", moved.stderr)
            self.assertIn("no folder of this run", moved.stderr)

    def workspace(
        self, state: Path, *args: str, workspace: str | None, host: str | None = None
    ) -> subprocess.CompletedProcess[str]:
        """workspace.sh with AGENTIC_WORKSPACE set, or unset (None): a copy outside any repository, no git config."""
        env = {key: value for key, value in os.environ.items() if key != "AGENTIC_WORKSPACE" and not key.startswith("GIT_")}
        env["AGENTIC_RUN_STATE"] = str(state)
        if host is not None:
            env["AGENTIC_HOST"] = host
        script = ROOT / "scripts/orchestrator/workspace.sh"
        if workspace is None:
            copy = state.parent / "repo/scripts/orchestrator/workspace.sh"
            copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(script, copy)
            script = copy
            env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_CEILING_DIRECTORIES=str(state.parent))
        else:
            env["AGENTIC_WORKSPACE"] = workspace
        return subprocess.run(["bash", str(script), *args], env=env, capture_output=True, text=True, check=False)

    def test_workspace_in_a_vault_writes_reports_once_and_keeps_other_pins(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            vault, state = Path(temp) / "vault", Path(temp) / "state"
            workspace = str(vault / "Work")
            (vault / "Work").mkdir(parents=True)
            nn = write(vault, ".obsidian/plugins/notebook-navigator/data.json", "")
            # Written the way Obsidian writes it: 2-space indent, raw UTF-8, no final newline.
            settings = {"a": 1, "pinnedNotes": {"x.md": {"folder": True}}, "z": "ü", "e": {}}
            nn.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")
            write(vault, ".obsidian/community-plugins.json", '["notebook-navigator"]')
            first = self.workspace(state, "init", "run-1", workspace=workspace)
            self.assertEqual(first.returncode, 0, first.stderr)
            folder = Path(first.stdout.strip())
            self.assertEqual(folder, vault.resolve() / "Work/run-1")
            self.assertEqual(sorted(p.name for p in folder.iterdir()), ["Reports", "Reports.base", "Reports.md", "run-1.md"])
            self.assertEqual((state / "reports").resolve(), folder / "Reports")
            note = self.workspace(state, "note", workspace=workspace).stdout.strip()
            self.assertEqual(note, str(folder / "run-1.md"))
            self.assertIn('file.inFolder("Work/run-1/Reports")', (folder / "Reports.base").read_text(encoding="utf-8"))
            self.assertIn("[[Work/run-1/run-1|run-1]]", (folder / "Reports.md").read_text(encoding="utf-8"))
            pin = {"folder": True, "tag": False, "property": False}
            settings["pinnedNotes"].update({"Work/run-1/run-1.md": pin, "Work/run-1/Reports.md": pin})
            self.assertEqual(nn.read_text(encoding="utf-8"), json.dumps(settings, indent=2, ensure_ascii=False))
            (folder / "Reports.md").write_text("edited\n", encoding="utf-8")
            pins = nn.read_bytes()
            again = self.workspace(state, "init", "run-1", workspace=workspace)
            self.assertEqual(Path(again.stdout.strip()), folder)
            self.assertEqual((folder / "Reports.md").read_text(encoding="utf-8"), "edited\n")
            self.assertEqual(nn.read_bytes(), pins)
            other = self.workspace(Path(temp) / "other", "init", "run-1", workspace=workspace)
            self.assertEqual(Path(other.stdout.strip()).name, f"run-1-{time.strftime('%Y-%m-%d')}")
            (vault / ".obsidian/community-plugins.json").write_text("[]", encoding="utf-8")
            write(vault, ".obsidian/bookmarks.json", '{"items": [{"type": "file", "ctime": 1, "path": "y.md"}]}')
            self.assertEqual(self.workspace(Path(temp) / "s3", "init", "run-2", workspace=workspace).returncode, 0)
            items = json.loads((vault / ".obsidian/bookmarks.json").read_text(encoding="utf-8"))["items"]
            self.assertEqual([item["path"] for item in items], ["y.md", "Work/run-2/run-2.md", "Work/run-2/Reports.md"])

    def test_workspace_finds_its_moved_folder_by_identity_and_never_adopts_another(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            vault, state_a, state_b = Path(temp) / "vault", Path(temp) / "a", Path(temp) / "b"
            write(vault, ".obsidian/bookmarks.json", '{"items": []}')
            work = vault.resolve() / "Work"
            work.mkdir()
            a = self.workspace(state_a, "init", "s", workspace=str(work))
            self.assertEqual(Path(a.stdout.strip()), work / "s", a.stderr)
            (work / "s/s.md").write_text("A live\n", encoding="utf-8")
            (work / "s").rename(work / "s-archived")
            b = self.workspace(state_b, "init", "s", workspace=str(work))
            self.assertEqual(Path(b.stdout.strip()), work / "s", b.stderr)
            (work / "s/s.md").write_text("B live\n", encoding="utf-8")
            again = self.workspace(state_a, "init", "s", workspace=str(work))
            self.assertEqual(Path(again.stdout.strip()), work / "s-archived", again.stderr)
            self.assertEqual((state_a / "reports").resolve(), work / "s-archived/Reports")
            self.assertEqual((state_b / "reports").resolve(), work / "s/Reports")
            self.assertEqual(self.workspace(state_a, "note", workspace=str(work)).stdout.strip(), str(work / "s-archived/s.md"))
            self.assertEqual((work / "s/s.md").read_text(encoding="utf-8"), "B live\n")
            self.assertEqual((work / "s-archived/s.md").read_text(encoding="utf-8"), "A live\n")
            self.assertIn('file.inFolder("Work/s-archived/Reports")', (work / "s-archived/Reports.base").read_text(encoding="utf-8"))
            self.assertIn("[[Work/s-archived/s|s]]", (work / "s-archived/Reports.md").read_text(encoding="utf-8"))
            shutil.rmtree(work / "s-archived")
            gone = self.workspace(state_a, "init", "s", workspace=str(work))
            self.assertEqual(Path(gone.stdout.strip()), work / f"s-{time.strftime('%Y-%m-%d')}", gone.stderr)
            self.assertIn("starting a fresh folder", gone.stderr)
            self.assertEqual((work / "s/s.md").read_text(encoding="utf-8"), "B live\n")
            (work / "link").symlink_to(work / "s")
            write(work, "file", "")
            for taken in ("link", "file"):
                result = self.workspace(Path(temp) / taken, "init", taken, workspace=str(work))
                self.assertEqual(Path(result.stdout.strip()).name, f"{taken}-{time.strftime('%Y-%m-%d')}", result.stderr)

    def test_workspace_outside_a_vault_declined_and_from_git_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state, plain = Path(temp) / "state", Path(temp) / "plain"
            write(state, "reports/early-r1.md", "early\n")
            plain.mkdir()
            self.assertEqual(self.workspace(state, "init", "run-1", workspace=str(Path(temp) / "absent")).returncode, 2)
            result = self.workspace(state, "init", "run-1", workspace=str(plain))
            self.assertEqual(result.returncode, 0, result.stderr)
            folder = Path(result.stdout.strip())
            self.assertEqual(sorted(p.name for p in folder.iterdir()), ["Reports", "run-1.md"])
            self.assertEqual(len(list(state.glob("reports.*/early-r1.md"))), 1)
            for name in ("Reports", "reports", "REPORTS", "../x", ".hidden", "dot.", ""):
                self.assertEqual(self.workspace(state, "init", name, workspace=str(plain)).returncode, 2, name)
            declined = self.workspace(state, "init", "run-1", workspace="")
            self.assertEqual(Path(declined.stdout.strip()), state)
            self.assertTrue((state / "reports").is_dir() and not (state / "reports").is_symlink())
            self.assertEqual(self.workspace(state, "note", workspace="").stdout.strip(), str(state / "run-1.md"))
            env = {key: value for key, value in os.environ.items() if key != "AGENTIC_WORKSPACE"}
            env.update(
                AGENTIC_RUN_STATE=str(Path(temp) / "s2"), GIT_CONFIG_COUNT="1",
                GIT_CONFIG_KEY_0="agentic.workspace", GIT_CONFIG_VALUE_0=str(Path(temp) / "configured"),
            )
            (Path(temp) / "configured").mkdir()
            configured = subprocess.run(
                ["bash", str(ROOT / "scripts/orchestrator/workspace.sh"), "init", "run-3"],
                env=env, capture_output=True, text=True, check=False,
            )
            self.assertEqual(Path(configured.stdout.strip()), Path(temp).resolve() / "configured/run-3", configured.stderr)

    def test_workspace_unset_fails_with_the_setup_command(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp) / "state"
            unset = self.workspace(state, "init", "run-1", workspace=None)
            self.assertEqual(unset.returncode, 2)
            self.assertIn("git config --global agentic.workspace", unset.stderr)
            self.assertFalse((state / "reports").exists() or (state / "live-note").exists())

    def test_workspace_rejects_a_vault_path_before_creating_anything(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            vault, state = Path(temp) / "vault", Path(temp) / "state"
            write(vault, ".obsidian/bookmarks.json", '{"items": []}')
            (vault / "W#1").mkdir()
            result = self.workspace(state, "init", "run-1", workspace=str(vault / "W#1"))
            self.assertEqual(result.returncode, 2)
            self.assertIn("W#1/run-1", result.stderr)
            self.assertEqual(list((vault / "W#1").iterdir()), [])
            self.assertFalse((state / "reports").exists() or (state / "reports").is_symlink())

    def test_heartbeat_alarms_when_reports_leave_the_session_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state, work, bin_dir = Path(temp) / "state", Path(temp) / "work", Path(temp) / "bin"
            work.mkdir()
            notified = Path(temp) / "notified"
            write(bin_dir, "notify-send", f'#!/bin/sh\necho "$*" >> {notified}\n').chmod(0o755)
            env = {
                "AGENTIC_RUN_STATE": str(state), "HB_EVERY": "1", "PATH": f"{bin_dir}:{os.environ['PATH']}",
            }
            self.assertEqual(self.run_script("heartbeat.sh", "reset", "probe", env=env).returncode, 0)
            self.assertTrue((state / "reports").is_dir())
            init = self.workspace(state, "init", "s", workspace=str(work))
            self.assertEqual(init.returncode, 0, init.stderr)
            self.assertEqual(list(state.glob("reports.*")), [Path(state / "reports.id")])
            log = state / "watchdog.log"

            def alarmed() -> bool:
                return log.exists() and "does not resolve to this run's folder" in log.read_text(encoding="utf-8")

            sleeper = subprocess.Popen(["sleep", "60"])
            daemon = None
            try:
                self.assertEqual(self.run_script("heartbeat.sh", "add", "J", "shell", "-", "-", "-", "-", str(sleeper.pid), env=env).returncode, 0)
                (work / "s").rename(work / "moved")
                probe = self.run_script("heartbeat.sh", "reset", "probe", env=env)
                self.assertEqual((probe.returncode, probe.stderr), (0, ""))
                daemon = subprocess.Popen(
                    ["bash", str(ROOT / "scripts/orchestrator/heartbeat.sh"), "run"],
                    env={**os.environ, **env}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                self.assertTrue(until(alarmed))
                self.assertTrue(until(notified.exists))  # the alarm is logged before notify-send runs
                log.unlink()
                found = self.workspace(state, "init", "s", workspace=str(work))
                self.assertEqual(Path(found.stdout.strip()), work.resolve() / "moved", found.stderr)
                self.assertTrue(until(lambda: not (state / "hb/alarm").exists()))
                self.assertFalse(alarmed())
                (work / "other/Reports").mkdir(parents=True)
                (state / "reports").unlink()
                (state / "reports").symlink_to(work / "other/Reports")
                self.assertTrue(until(alarmed))
            finally:
                (state / "status").write_text("DONE\n", encoding="utf-8")
                if daemon is not None:
                    daemon.wait(timeout=10)
                sleeper.kill()
                sleeper.wait()


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

    def test_a_fence_closes_only_on_its_own_character_and_length(self) -> None:
        # One reading of a fence for the link gates and the close gate: a ~~~ line or a shorter run inside a
        # backtick block is code, so a link in the block is no link and one after the block still is.
        text = "[a](a.md)\n\n````text\n~~~\n[code](code.md)\n```\n[still](still.md)\n````\n\n[b](b.md)\n"
        self.assertEqual(governance.layers.link_targets(text), ["a.md", "b.md"])
        moved = governance.layers.rewrite_links(text, lambda target: "x/" + target)
        self.assertEqual(moved, text.replace("(a.md)", "(x/a.md)").replace("(b.md)", "(x/b.md)"))
        self.assertEqual(governance.prose(text).split("\n"), ["[a](a.md)", "", *[""] * 6, "", "[b](b.md)", ""])
        self.assertEqual(list(governance.layers.headings("```\n~~~\n# code\n```\n# Title\n")), ["Title"])
        # A fence indented inside a list item still fences, and a closing fence carries no text.
        self.assertEqual(governance.layers.link_targets("1. Step\n\n    ```sh\n    [x](x.md)\n    ```\n"), [])
        self.assertEqual(governance.layers.link_targets("```\n``` not closed\n[x](x.md)\n```\n[y](y.md)\n"), ["y.md"])

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

    def test_a_move_keeps_a_listed_legacy_record_listed_when_it_rewrites_its_links(self) -> None:
        # A record closed before the port stays out of the close checks only while its digest matches its line.
        old = "---\nstatus: closed\n---\n\n# TASK-00{n} — Old\n\n## Spec\n\nSee [design](../../../work/design/DES-001-x.md).\n\n## Outcome\n\naccepted\n"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            draft = write(root, "docs/work/design/DES-001-x.md", "# DES-001 — X\n\n**Status:** proposed\n")
            listed = write(root, "docs/records/tasks/r00-old/TASK-005-old.md", old.format(n=5))
            edited = write(root, "docs/records/tasks/r00-old/TASK-006-old.md", old.format(n=6))
            lines = [f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root).as_posix()}" for path in (listed, edited)]
            legacy = write(root, governance.LEGACY_RECORDS, "# closed before the 2.8 port\n" + "\n".join(lines) + "\n")
            edited.write_text(old.format(n=6) + "\nEdited after the port.\n", encoding="utf-8")
            self.assertFalse([error for error in governance.check_closed_tasks(root) if "TASK-005" in error])
            _, changed = mover.move("approve", draft, root, "2026-01-05")
            self.assertIn("(../../../current/design/DES-001-x.md)", text_of(listed))
            self.assertEqual(changed, [listed.resolve(), edited.resolve(), legacy.resolve()])
            self.assertFalse([error for error in governance.check_closed_tasks(root) if "TASK-005" in error])
            # Only the digest of the record that matched its line moves; comments and other lines stay as they were.
            self.assertEqual(
                text_of(legacy),
                f"# closed before the 2.8 port\n{hashlib.sha256(listed.read_bytes()).hexdigest()}  docs/records/tasks/r00-old/TASK-005-old.md\n{lines[1]}\n",
            )
            self.assertTrue([error for error in governance.check_closed_tasks(root) if "TASK-006-old.md: changed since" in error])

    def test_close_task_and_reject_wrong_layer(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            done = TASK.format(size="size: S\n", review="Not required (S).", outcome="- [x] AC-1: unit test.\n\naccepted")
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", done)
            destination, _ = mover.move("close", task, root, "2026-01-05")
            self.assertEqual(destination, (root / "docs/records/tasks/r01-x/TASK-004-t.md").resolve())
            self.assertTrue(destination.read_text(encoding="utf-8").startswith("---\nstatus: closed\nrelease: r01-x\n"))
            draft = write(root, "docs/work/adr/ADR-005-x.md", ADR.format(status="proposed"))
            with self.assertRaises(ValueError):
                mover.move("close", draft, root, "2026-01-05")

    def test_close_refuses_a_task_without_review_outcome_or_checked_items(self) -> None:
        checked = "- [x] AC-1: unit test."
        reviewed = "Reviewer: a second session\nVerdict: accepted\nNo findings."
        for size, review, outcome, refusal in (
            ("size: S\n", "", checked, "Independent review is empty or pending"),
            ("size: S\n", "<!-- guidance -->", checked, "Independent review is empty or pending"),
            ("size: S\n", "Pending.", checked, "Independent review is empty or pending"),
            ("size: S\n", "Not required (S).", "Pending", "Outcome is empty or pending"),
            ("size: S\n", "Not required (S).", "accepted", "Outcome does not check AC-1"),
            ("size: S\n", "Not required (S).", checked + "\n- [x] AC-2: extra.", "Outcome checks AC-2, which the Spec does not list"),
            ("size: M\n", "N/A", checked, "needs a 'Reviewer: ...' line"),
            ("size: M\n", "Reviewer: N/A\nVerdict: accepted.", checked, "needs a 'Reviewer: ...' line"),
            ("size: L\n", "Reviewer: a second session; no findings.", checked, "needs a 'Verdict: ...' line"),
            ("size: S\n", "Not required (S).", checked + "\n- [ ] Docs: none.", "unchecked acceptance item"),
            ("size: M\n", "Not required (S).", checked, "size M: only S work closes without an independent review"),
            ("", "Not required.", checked, "size missing: only S work closes without an independent review"),
            ("size: S\n", "Not required.", checked, "only with the line 'Not required \\(S\\)'"),
        ):
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", TASK.format(size=size, review=review, outcome=outcome))
                with self.assertRaisesRegex(ValueError, refusal):
                    mover.move("close", task, root, "2026-01-05")
                self.assertTrue(task.is_file())
                self.assertFalse((root / "docs/records").exists())
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", TASK.format(size="size: L\n", review=reviewed, outcome=checked))
            destination, _ = mover.move("close", task, root, "2026-01-05")
            self.assertTrue(destination.is_file())
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            two = TASK.replace("- AC-1: The behavior holds.", "- AC-1: The behavior holds.\n- AC-2: The docs say so.")
            task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", two.format(size="size: M\n", review=reviewed, outcome=checked))
            with self.assertRaisesRegex(ValueError, "Outcome does not check AC-2"):
                mover.move("close", task, root, "2026-01-05")
            no_ids = TASK.replace("- AC-1: The behavior holds.", "- The behavior holds.")
            task.write_text(no_ids.format(size="size: S\n", review="Not required (S).", outcome=checked), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Spec lists no acceptance item"):
                mover.move("close", task, root, "2026-01-05")
        # The template offers only outcomes the close gate accepts: an abandoned task is removed, never closed.
        template = text_of(ROOT / ".agentic/templates/task.md")
        self.assertNotIn("abandoned`", template)
        self.assertRegex(template, r"abandoned task[^.]*removed with\s+`git rm`[^.]*`docs/records/log.md`")

    def test_close_gate_reads_the_record_lines_not_code_or_placeholders(self) -> None:
        reviewed = "Reviewer: a second session\nVerdict: accepted\nNo findings."
        checked = "- [x] AC-1: unit test."
        fenced = "```text\n- [x] AC-1: shown, not checked\nReviewer: example\nVerdict: accepted\n```"
        for spec, review, outcome, refusal in (
            ("- AC-1: The behavior holds.", reviewed, fenced, "Outcome does not check AC-1"),
            ("- AC-1: The behavior holds.", fenced, checked, "Independent review is empty or pending"),
            ("- AC-1: The behavior holds.", "~~~\nReviewer: x\n~~~\nVerdict: accepted", checked, "needs a 'Reviewer: ...' line"),
            ("- AC-1: The behavior holds.\n- AC-1: Again.", reviewed, checked, "Spec lists AC-1 more than once"),
            ("- AC-1: The behavior holds.", reviewed, checked + "\n- [x] AC-1: again.", "Outcome lists AC-1 more than once"),
            ("- AC-1:", reviewed, checked, "Spec gives AC-1 no text"),
            ("- AC-1: The behavior holds.", reviewed, "- [x] AC-1", "Outcome gives AC-1 no text"),
            ("- AC-1: The behavior holds.", reviewed, "- [x] AC-1: N / A", "Outcome gives AC-1 no text"),
            ("- AC-1: The behavior holds.", "Reviewer: N.A.\nVerdict: accepted", checked, "needs a 'Reviewer: ...' line"),
            ("- AC-1: The behavior holds.", "Reviewer: not applicable\nVerdict: accepted", checked, "needs a 'Reviewer: ...' line"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: do not ship", checked, "does not accept the work"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: not accepted", checked, "does not accept the work"),
            ("- AC-1: The behavior holds.", "Not required, trivial.", checked, "only with the line 'Not required \\(S\\)'"),
            # A verdict is an accepting word alone; one Reviewer and one Verdict line; an override names its reason.
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: accepted with unresolved critical blockers", checked, "does not accept the work"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: pass pending fixes; do not ship", checked, "does not accept the work"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: accepted\nVerdict: do not ship", checked, "2 'Verdict:' lines"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nReviewer: Fable\nVerdict: accepted", checked, "2 'Reviewer:' lines"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: do not ship\nOwner override: <reason>", checked, "Owner override needs a reason"),
            ("- AC-1: The behavior holds.", "Reviewer: Codex\nVerdict: do not ship\nOwner override: N/A", checked, "Owner override needs a reason"),
            # Four spaces start a code block, and the colon after the ID is required.
            ("- AC-1: The behavior holds.", reviewed, "\n    - [x] AC-1: shown in code", "Outcome does not check AC-1"),
            ("    - AC-1: shown in code", reviewed, checked, "Spec lists no acceptance item"),
            ("- AC-1 The behavior holds.", reviewed, checked, "Spec gives AC-1 no text"),
            ("- AC-1: The behavior holds.", reviewed, "- [x] AC-1 unit test.", "Outcome gives AC-1 no text"),
        ):
            with self.subTest(review=review, outcome=outcome), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                text = TASK.replace("- AC-1: The behavior holds.", spec)
                size = "size: S\n" if review.startswith("Not required") else "size: M\n"
                task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", text.format(size=size, review=review, outcome=outcome))
                with self.assertRaisesRegex(ValueError, refusal):
                    mover.move("close", task, root, "2026-01-05")
        for review in ("Reviewer: Codex\nVerdict: do not ship\nOwner override: shipped for the demo, fixes in TASK-009",
                       "Reviewer: Codex\nVerdict: Approved.\nAfter fixes in abc123.", "Reviewer: Codex\nVerdict: LGTM",
                       "Not required (S)"):
            with self.subTest(review=review), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                size = "size: S\n" if review.startswith("Not required") else "size: L\n"
                task = write(root, "docs/work/tasks/r01-x/TASK-004-t.md", TASK.format(size=size, review=review, outcome=checked))
                destination, _ = mover.move("close", task, root, "2026-01-05")
                self.assertTrue(destination.is_file())

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_approve_moves_a_same_stem_folder_and_its_links(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            design = write(root, "docs/work/design/DES-001-x.md", "# DES-001\n\n**Status:** proposed\n\nModel: [m](DES-001-x/model.svg).\n")
            write(root, "docs/work/design/DES-001-x/model.svg", "model {}\n")
            notes = write(root, "docs/work/design/DES-001-x/notes.md", "[doc](../DES-001-x.md), [plan](../../plan.md), [m](model.svg)\n\n## History\n")
            write(root, "docs/work/plan.md", "# Plan\n")
            plan = write(root, "docs/current/plan.md", "[model](../work/design/DES-001-x/model.svg) and [notes](../work/design/DES-001-x/notes.md#a)\n")
            for command in (
                ["git", "init", "-q"],
                ["git", "add", "-A"],
                ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "draft"],
            ):
                subprocess.run(command, cwd=root, check=True, capture_output=True)
            destination, changed = mover.move("approve", design, root, "2026-01-05")
            folder = root.resolve() / "docs/current/design/DES-001-x"
            self.assertEqual(sorted(path.name for path in folder.iterdir()), ["model.svg", "notes.md"])
            self.assertFalse(notes.exists() or (root / "docs/work/design/DES-001-x").exists())
            self.assertIn("[m](DES-001-x/model.svg)", destination.read_text(encoding="utf-8"))
            self.assertEqual(text_of(folder / "notes.md"), "[doc](../DES-001-x.md), [plan](../../../work/plan.md), [m](model.svg)\n\n## History\n")
            self.assertEqual(text_of(plan), "[model](design/DES-001-x/model.svg) and [notes](design/DES-001-x/notes.md#a)\n")
            self.assertEqual(changed, [plan.resolve()])
            status = subprocess.run(["git", "status", "--porcelain"], cwd=root, check=True, capture_output=True, text=True).stdout
            self.assertIn("docs/work/design/DES-001-x/model.svg -> docs/current/design/DES-001-x/model.svg", status)
            # Markdown in the asset folder moves with its document and is not governed on its own.
            self.assertEqual(governance.check_layers(root), [])
            self.assertEqual(governance.check_current_has_no_history(root), [])

    def test_close_keeps_a_task_asset_folder_out_of_the_task_checks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            task = write(root, "docs/work/tasks/r01-x/TASK-001-x.md", "---\nstatus: active\n---\n\n# TASK-001\n")
            write(root, "docs/work/tasks/r01-x/TASK-001-x/evidence.md", "# Evidence\n")
            self.assertEqual(governance.check_layers(root), [])
            write(root, "docs/work/tasks/r01-x/TASK-002-y.md", "# TASK-002\n")
            self.assertTrue(any("TASK-002-y.md: task status None" in error for error in governance.check_layers(root)))
            self.assertTrue(task.exists())


if __name__ == "__main__":
    unittest.main()
