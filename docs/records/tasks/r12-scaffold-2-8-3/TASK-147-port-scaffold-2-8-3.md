---
status: closed
release: r12-scaffold-2-8-3
number: 147
size: M
prd: none
---

# TASK-147 — Port the governance scaffold from 2.4.0 to 2.8.3

## Spec

The repository's governance scaffold is 2.4.0 (`.agentic/version`); the
released scaffold is 2.8.3. No requirement governs it; the constitution's
Protected paths section does: every protected file changes only through a
patch the owner applies. The port follows the Upgrading section of the 2.8.3
release's `references/scaffold-contract.md`. It replaces the unapplied ports
on `chore/asdlc-2.8.1` and `chore/asdlc-2.8.2` (TASK-046, TASK-047), which
were built on a 2.1.0 tree that `main` no longer has.

- AC-1: `.agentic/version` reads `2.8.3` and the 2.8.3 release's
  `validate_project.py` reports no error and no warning.
- AC-2: `make verify` exits 0 on the Node that `.nvmrc` pins, on the tree the
  owner command produces.
- AC-3: The project's own rules survive: its eight protected toolchain,
  supply-chain and release paths, `package.json` asking first, its gate
  allow rules, its `toolchain` Makefile target, its constitution text, and
  task numbers monotonic repository-wide.
- AC-4: The hook blocks `GNUmakefile`, `makefile` and `.git`, and the
  protected paths of a worktree under a folder listed in
  `permissions.additionalDirectories`; the `Makefile` holds `Makefile: ;`.
- AC-5: Every task record closed before the port is listed in
  `.agentic/legacy-records` with its digest.
- AC-6: No protected path is committed by an agent; the port lands as one
  owner commit from `docs/work/patches/asdlc-2.8.3/`, and a second run of
  `owner-apply.sh` commits nothing.

## Scope

Expected files, all in `0001-port-scaffold-2-8-3.patch`:

- Replaced whole from the 2.8.3 render: `scripts/check_governance.py`,
  `scripts/doc_layers.py`, `scripts/move_doc.py`, `.agentic/templates/task.md`,
  `.agentic/version`.
- New from the render: `scripts/orchestrator/` (five scripts, `limits.env`
  at its defaults, `SHA256SUMS`), `docs/current/runbooks/orchestration.md`,
  `.agentic/templates/{brief,review-note,live-note}.md`.
- Render plus the project's own entries: `scripts/check_protected_paths.py`,
  `scripts/test_agentic_gates.py`.
- Merged: `.claude/settings.json`, `Makefile`, `.gitignore`,
  `docs/current/constitution.md`, `docs/current/adr/ADR-000-adr-process.md`,
  `AGENTS.md`, `CLAUDE.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `docs/current/plan.md`, `RELEASE_NOTES.md`.
- New, project-owned: `docs/current/runbooks/agent-work.md`,
  `.agentic/legacy-records`.

Committed by the agent: this task, the patch folder, one `.gitattributes`
line.

Negative scope: `src/`, `tests/`, `package.json`, `package-lock.json`,
`.nvmrc`, `.github/workflows/`, `.markdownlint.jsonc`, `scripts/check_prd.py`
(equal to the render), the log entry for the owner's approval, the branches
`chore/asdlc-2.8.1` and `chore/asdlc-2.8.2`.

## Plan

- No 2.4.0 render exists (the oldest is 2.7.0), so steps 2.5 to 2.7 come
  from the contract; the files they touch are replaced or merged at 2.8.3.
- Project files: `git merge-file` with base the 2.1.0 tree TASK-046 started
  from (`9313ea7`), ours `main`, theirs TASK-047's reviewed result (tree
  `78aa0d4`), so the decisions of those ports carry over; conflicts resolved
  by hand. The protected-path script and its tests: `git merge-file` with
  base the 2.8.2 render, ours TASK-047's result, theirs the 2.8.3 render.
- Decisions kept from TASK-046 and TASK-047: the render's `Edit` and `Write`
  ask rules stay out of `.claude/settings.json`; the 2.8 guide rules that do
  not change an existing line live in `docs/current/runbooks/agent-work.md`;
  owner patches live in `docs/work/patches/<slug>/`; the render's
  git-lookalike test names `.github/CODEOWNERS`; the worktree-folder test.
- Conflicts: design rule 3 keeps `main`'s bundled-library text; section 6
  keeps "task numbers are monotonic"; the constitution and ADR-000 take the
  2.8 dependency policy; the ADR index keeps `main`'s rows.
- The constitution's hook paragraph also names `.git`, the local settings
  and outside paths, which the hook already handles; its dependency policy
  keeps ADR-007's ADR per runtime library.
- `CLAUDE.md` imports `docs/current/runbooks/agent-work.md`, and the guide's
  load sentence names it, so the moved rules load in every session.
- Verification: `make verify`, the 2.8.3 `validate_project.py`, hook probes,
  and two rehearsals of the owner command in throwaway clones.
- Risk: the Stop hook now blocks a stop once on a lint failure, where it was
  advisory; `make test` runs about 70 s longer.

Owner command, on the branch `chore/asdlc-2.8.3` (it puts Node 24.22.3 first
on PATH: on this machine another Node precedes nvm's), with the tree review r2
checked:

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.3/bin:$PATH" && cd /home/yoava/Projects/yoava/obsidian-ai-agent-panel.wt/asdlc-2.8.3 && npm ci && bash docs/work/patches/asdlc-2.8.3/owner-apply.sh --expect-tree 031f7ac286bd74e63c10d50dd8f26f840802b868
```

Commit message `owner-apply.sh` uses, by patch number:

<!-- owner-commits -->
```text
0001 chore: port the governance scaffold from 2.4.0 to 2.8.3
  The scaffold moved four minor and three patch releases while this
  repository stayed on 2.4.0. A task closes only with checked acceptance IDs
  and a named reviewer and verdict, a dependency needs an ADR only for a
  significant choice, the Stop hook blocks a stop once on a lint failure,
  and the liveness scripts and runbook for unattended runs arrive. The
  protected-path hook judges a path by the repository that holds it, so a
  folder in additionalDirectories no longer opens a sibling worktree's
  protected files, and it blocks GNUmakefile, makefile and .git.

  The project's protected paths, allow rules, toolchain target and
  constitution text stay. The guide is at its 220-line cap, so the 2.8 rules
  that change no existing line live in docs/current/runbooks/agent-work.md.
  It is one commit because the new checker fails the old records, and the
  guide cites files only the patch adds.

  Task: 147
```
<!-- /owner-commits -->

After it: the owner sets the run workspace once if unset (recommended `""`,
run files stay in the run state folder); an agent then logs the approval in
`docs/records/log.md`, records the verdict here, and lands `make close` of
this task in one commit; the patch folder stays as the record of what was
applied.

```bash
git config --global agentic.workspace ""
```

## Run log

- `main` holds scaffold 2.4.0 on a rebuilt history, so the 2.8.1 and 2.8.2
  patches do not apply to it; rebuilt from `main`.
- `AGENTS.md` came to 222 lines after the merge; the ADR sentence, section 6,
  the load sentence and one limitation were reflowed to stay at 220.
- The agent commits carry no `RELEASE_NOTES.md` entry; the note lands with
  the owner commit, which is where the change happens.
- Rehearsed twice in fresh clones on Node 24.22.3 after `npm ci`: the first
  run made one commit and `make verify` passed; the second committed nothing
  and passed; the 2.8.3 `validate_project.py` reported no error and no
  warning. Rehearsed again after the review fixes.
- The owner answered the six owner questions with the recommended options
  and ran the owner command: commit `3d69bb1`, tree
  `031f7ac286bd74e63c10d50dd8f26f840802b868` as expected, `make verify`
  passed.

## Independent review

Reviewer: Claude Opus 5.5, fresh general-purpose agent (Codex capped)
Verdict: accepted

Review r1 of `939f9d7`: apply, no blocker. Resolved in `dbb7341`: F1
(major: the moved rules were never loaded; now imported and named), F2 (the
script checks the tree before committing), F3 (a refused apply is taken back
out), F4 (ADR-007 kept in the dependency policy), F5 (plan row), F9 (hooks-off
advice), F10 (whitespace exemption narrowed to `*.patch`).

Review r2 of `dbb7341`: apply, no blocker or major; r1 fixes confirmed, tree
after the owner command as expected, a second run idempotent. R2-1 (the
owner command lacked `--expect-tree`) is fixed in the command above. R2-2
(the constitution's dependency policy asks for an ADR of a library's own,
where ADR-007 also accepts a section in the area's ADR) is an owner patch in
`docs/work/patches/constitution-adr-007/`.

Follow-ups: F7 (`AGENTS.md` at the 220-line cap, one 89-column line), F11
(upstream "colour"), R2-3 (the load sentence cites `runbooks/agent-work.md`
without `docs/current/`).

## Outcome

Accepted. Checked against `3d69bb1`:

- [x] AC-1: `.agentic/version` reads `2.8.3`; the 2.8.3
  `validate_project.py` reports 0 errors and 0 warnings.
- [x] AC-2: `make verify` passed on Node 24.22.3 in the owner command, on
  tree `031f7ac286bd74e63c10d50dd8f26f840802b868`.
- [x] AC-3: `scripts/check_protected_paths.py` keeps the eight project paths
  and `package.json` in `ASK_FIRST`; the `Makefile` keeps `toolchain` and the
  gate allow rules stay in `.claude/settings.json`; section 6 keeps
  monotonic task numbers; the constitution's project text stays (review r1
  interdiff).
- [x] AC-4: `scripts/test_agentic_gates.py` covers `GNUmakefile`,
  `makefile`, `.git` and the sibling worktree under an additional directory;
  `Makefile` line 43 is `Makefile: ;`.
- [x] AC-5: `.agentic/legacy-records` lists the 137 records closed before
  the port.
- [x] AC-6: the agent commits `55cfa3d`, `939f9d7` and `dbb7341` touch only
  `docs/work/` and `.gitattributes`; `3d69bb1` is the owner's commit with
  no agent trailer; review r2 found a second run commits nothing.
