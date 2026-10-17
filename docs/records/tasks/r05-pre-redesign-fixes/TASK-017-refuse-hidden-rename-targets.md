---
status: closed
release: r05-pre-redesign-fixes
number: 017
prd: PRD-004.R7
---

# TASK-017 — Refuse hidden `obsidian_rename` targets

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Claude Code runs with the vault as its working directory, so `<vault>/.claude/`
holds hooks and settings it applies on its next start, `.mcp.json` at the root
registers MCP servers, and on Windows Git runs `.git/hooks/*` on a commit (a Git
sync plugin may commit on a timer). `obsidian_rename` takes any `newPath`
Claude chooses, so a note moved to `.claude/settings.local.json`,
`.git/hooks/pre-commit` or `.mcp.json` becomes configuration or code that
something else runs. Obsidian never indexes a dot-folder, so a note moved there
leaves the vault view: the value lost by refusing is negligible. Task 016 left
this open (its negative scope and review finding 3).

Governing: [PRD-004](../../../current/product/PRD-004-vault-tools.md) R7
(amended by this task),
[DES-006](../../../current/design/DES-006-vault-tools.md) (`obsidian_rename`
steps 1 and 2), constitution *Bounded file access*, backlog item in `plan.md`
(removed by this task).

Owner decision: PRD-004.R7 is amended under the owner's approval of all tasks,
2026-10-11; to confirm. The amendment adds two refusals, "a segment that starts
with `.`" and "a folder named like a Windows 8.3 short name". It decides that
the file name counts as a segment: `.mcp.json`, `.env`, `.envrc` and
`.gitignore` steer tools as much as a folder does.

Acceptance (it replaces 016's acceptance 4 and 5 where they differ; 016's 1, 2,
3 and 6 hold):

1. `renameTargetError(newPath, configDir)` returns the hidden-name error for
   any segment, the file name included, that starts with `.`:
   `.claude/settings.local.json`, `.git/hooks/pre-commit`, `.github/x.yml`,
   `.mcp.json`, `.env`, `notes/.hidden/x.md`, `notes/.env`, `.hidden/x.md`,
   `x/.obsidian/y.md`, `.obsidian-notes/x.md`.
2. It does so however the segment is spelled: any case; either separator;
   empty and `.` segments dropped (`./.claude/x.md`, `.//.git/hooks/x`);
   trailing dots and spaces; a `:` suffix; a character HFS+ ignores before the
   dot (`U+200C`, `U+200D`, `U+200F`, `U+202A` to `U+202E`, `U+206A` to
   `U+206F`, `U+FEFF`) or inside the name. A leading space, a no-break space, a
   tab, a zero-width space (`U+200B`), a word joiner (`U+2060`) or a soft
   hyphen before the dot make a different name on every file system and pass.
3. A segment of only dots is hidden too: `a/.../b.md`, `.../x.md`,
   `a/..../b.md`, `. ./x.md` are refused (supersedes 016's `...` passes). A `..`
   segment is still the shape error, not the hidden error.
4. The configuration folder keeps its own error text and is checked first, so
   `.obsidian/x.md` still names it; the check holds for a `configDir` with no
   leading dot, one that folds to nothing, and an empty one (refuses all).
   Another dot-folder is hidden, not the configuration folder.
5. A folder named like a Windows 8.3 short name, at any depth, is refused with
   the hidden-name error: `CLAUDE~1/settings.local.json`, `GIT~1/hooks/pre-commit`,
   `OBSIDI~1/x.md` (the configuration folder's own short name),
   `a/OBSIDI~1/x.md`, `projects/app/GIT~1/hooks/pre-commit`,
   `projects/app/CLAUDE~1/rules/x.md`. The file name is not a folder: `Draft~1.md`,
   `a/OBSIDI~1.md` and `projects/app/OBSIDI~1` pass.
6. Dots inside a name do not refuse: `notes/a.b.md`, `a.b/c.d.md`,
   `notes/v1.2..3.md`, `a..md`, `a./b.md`, `./notes/New.md`, `notes/./New.md`
   and the other ordinary targets pass.
7. Unchanged: the shape errors (`/`, `\`, drive letter, `..` segment), the
   no-file error, the configuration-folder comparison, `renameTargetPath`, and
   the handler (it already calls `renameTargetError` first and returns its
   text; nothing is created or moved).
8. PRD-004.R7, DES-006 (steps 1 and 2, consequences, alternatives, test list),
   SECURITY.md and the release notes state the rule and, in SECURITY.md and
   DES-006, what it does not stop; the `plan.md` backlog item is replaced by
   one for non-dot names.

## Scope

Expected files:

- `src/mcp/paths.ts` (hidden-name rule and error text, the short-name rule at
  every folder), `tests/mcp.test.mjs`
- `docs/current/product/PRD-004-vault-tools.md` (R7, Security and privacy),
  `docs/current/design/DES-006-vault-tools.md`, `docs/current/SECURITY.md`,
  `docs/current/plan.md`, `RELEASE_NOTES.md`

Negative scope:

- Symlinked or junctioned folders inside the vault: a residual in SECURITY.md.
- Non-dot names that tools load or run (`CLAUDE.md`, `CLAUDE.local.md` and
  `AGENTS.md`, root or nested; tool configs such as `lefthook.yml`; a new
  extension such as `x.md` to `x.cmd`): a different threat with no requirement
  yet; a residual in SECURITY.md and a backlog item in `plan.md`.
- The source `path` and the other vault tools: none writes a new path.
- The handler, the tool description and the panel's instructions to Claude.
- A real-CLI or in-vault run: owed by hand (DES-006 manual verification).

## Plan

- Tests first in `tests/mcp.test.mjs`: the refused hidden shapes and spellings,
  dot-only segments, the configuration-folder precedence and its non-dot
  `configDir`, the short-name folders at every depth, the names that pass;
  update the 016 tests whose expectation this task reverses (`...`, `.hidden/`,
  `.obsidian-notes/`, `x/.obsidian/`, `..a.md`, `a/OBSIDI~1/x.md`).
- `renameTargetError`: after the shape and configuration-folder checks, refuse
  any segment whose first character is `.` (once the characters HFS+ ignores
  are dropped; no other folding, since a leading space or a zero-width space
  makes another name on every file system) and any folder, not the file name,
  shaped like a short name, with one new error. The configuration-folder fold
  is unchanged.
- Verification: `make verify`; independent review; by hand in a vault:
  `.claude/x.md`, `.git/hooks/x`, `.mcp.json` and `notes/.hidden/x.md` are
  refused, `notes/a.b.md` moves.
- Rejected: a list of known names (`.claude`, `.git`, `.mcp.json`), which misses
  `.envrc`, `.husky` and the next tool's folder; refusing only a leading hidden
  folder, which leaves `.mcp.json` and `notes/.env`; refusing only folders but
  not the file name, which leaves `.mcp.json` and `.env`; folding leading
  spaces and invisible characters before the dot test, which guards no path and
  only over-refuses.

## Run log

- Tests first: against the 016 implementation, eight of the 47 `mcp.test.mjs`
  tests failed (the four new hidden-name tests and four changed ones: dots
  inside a name, 8.3, the vault-named configuration folder, a folder that folds
  to nothing); the ordinary-targets test held. All pass after the change.
- After review: tests first again, two failed (the short name at any depth, the
  names that pass) before the second implementation; 48 pass.
- Mutation check: dropping the dot rule fails seven tests; dropping the HFS+
  drop, the short-name rule's reach (first folder only, or including the file
  name), the dot test on the folded text, or the configuration-folder check
  fails at least one.
- The protected-path hook blocks the Write and Edit tools outside the project
  directory, so the files were written through the shell. No protected path was
  touched.
- `make verify`: OK.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Defect: the 8.3 short-name rule looked at the first segment only, so a
   nested repository's `projects/app/GIT~1/hooks/pre-commit` and
   `a/OBSIDI~1/x.md` passed, and NTFS resolves them to `.git` and `.obsidian`.
   The negative-scope reason ("only a vault-root folder is a place Claude Code
   or Git look") was false. Fixed: the rule applies to every folder segment, the
   file name excepted; the reason is gone.
2. Gap: the rule's residuals were not stated. Fixed: SECURITY.md names
   symlinked or junctioned folders and non-dot names other tools load or run
   (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, tool configs, a new extension);
   DES-006 says the same; `plan.md` has a backlog item to decide which to
   refuse.
3. Over-refusal: folding leading spaces and every default-ignorable character
   before the dot test refused names no tool reads as the dot name; `normalizePath`
   trims nothing and Win32 strips no leading space. Fixed: the dot test drops
   only the characters HFS+ ignores and nothing else; DES-006 and the plan say
   so, and its cost claim names the short-name folders too.
4. Owner decision: the amendment to PRD-004.R7 stays marked "to confirm"; the
   coordinator collects it for the owner.
5. Mismatch: the PRD clause did not name the short-name refusal the code
   applies. Fixed: the clause says "or has a folder named like a Windows 8.3
   short name (such as `CLAUDE~1`)".
6. Wrong claim: the release note said Git runs hooks on a commit; on other
   systems it needs the executable bit a renamed note lacks. Fixed: "on
   Windows", in the note and in the Spec.
7. Wrong text: DES-006 implied the configuration folder's short name gets the
   configuration-folder error (it gets the hidden-name error), and the code
   comment said a moved note "only leaves the vault". Fixed: both reworded, as
   "leaves the vault view".
8. Layout: the edited SECURITY.md paragraph had an over-long line. Fixed:
   rewrapped.

## Outcome

`obsidian_rename` also refuses a target with a hidden segment (a leading
`.`, after the characters HFS+ ignores) and a folder named like a Windows
8.3 short name at any depth; PRD-004.R7 is amended to match, pending the
owner's confirmation. Non-dot names other tools load or run are a backlog
item. Owed by hand in a vault: the refused targets and an ordinary rename.
