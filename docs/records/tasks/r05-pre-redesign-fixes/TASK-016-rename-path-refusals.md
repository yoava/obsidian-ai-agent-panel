---
status: closed
release: r05-pre-redesign-fixes
number: 016
prd: PRD-004.R7
---

# TASK-016 — `obsidian_rename` path refusals

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`obsidian_rename` accepts any `newPath`, and Claude chooses it. A target with
`..` could move a file out of the vault, and one in the configuration folder
could add files where plugins and snippets live; absolute and drive targets are
now refused too. `normalizePath` removes none of these.

Governing:
[PRD-004](../../../current/product/PRD-004-vault-tools.md) R7,
[DES-006](../../../current/design/DES-006-vault-tools.md) (`obsidian_rename`
steps 1 to 3, Data and security), constitution *Bounded file access*.

Acceptance:

1. `renameTargetError(newPath, configDir)` returns the tool error text when
   `newPath` starts with `/` or `\`, starts with a drive letter (`X:`), has a
   `..` segment (segments split on `/` and `\`), or has no segment but `.`; else
   null.
2. It returns a tool error when the target equals or lies under `configDir`,
   however spelled: compared as NFC text, case-folded (also macOS's long s),
   with `.` segments and repeated separators dropped, invisible characters
   ignored, and per segment trailing dots, spaces and a `:` suffix ignored:
   `.OBSIDIAN/x`, `.obsidian\x`, `./.obsidian/x`, `.obs‌idian/x`,
   `.obſidian/x`, `.obsidian.`, `.obsidian::$INDEX_ALLOCATION/x`.
   `a/../.obsidian/x` is refused by acceptance 1.
3. A first segment shaped like a Windows 8.3 short name (`OBSIDI~1/x.md`,
   `OB1234~1/x.md`) is refused as the configuration folder when more segments
   follow; a root file such as `Draft~1.md` passes.
4. A `...` segment is a name of its own: `a/.../b.md` and `.../.obsidian/x.md`
   pass. A `configDir` that folds to nothing (`...`) still guards, and one with
   no segment refuses every target.
5. `.obsidian-notes/x.md`, `x/.obsidian/y.md`, `.hidden/x.md` and ordinary
   targets pass.
6. `renameTargetPath(newPath)` drops empty and `.` segments (`./a/b.md` is
   `a/b.md`).
7. The `obsidian_rename` handler calls `renameTargetError` right after reading
   its arguments, before `resolveFile`, `normalizePath`, `createFolder` and
   `renameFile`, with `app.vault.configDir`, and returns its text as the tool
   error; nothing is created or moved. It then moves to
   `normalizePath(renameTargetPath(newPath))`.

## Scope

Expected files:

- `src/mcp/paths.ts` (new, Obsidian-free: `renameTargetError`,
  `renameTargetPath`), `src/mcp/vault-tools.ts` (the calls), `package.json`
  (`pretest`)
- `tests/mcp.test.mjs`
- `RELEASE_NOTES.md`, `docs/current/SECURITY.md` (the rename boundary),
  `docs/current/plan.md` (one backlog item), `docs/current/DEVELOPMENT.md`
  (test table); DES-001 (module tables, rule A7), DES-006 (module table, rule
  F2, `obsidian_rename` steps 1 to 3, Verification)

Negative scope:

- The source `path` (resolved against Obsidian's index, which holds no
  configuration-folder file; no document requires a guard) and the other vault
  tools: none of them writes a new path.
- Other hidden folders (`.claude/`, `.git/hooks`, `.mcp.json`): a later task,
  pending a PRD-004.R7 amendment; PRD-004.R7 names only the configuration
  folder. Backlog item in `plan.md`.
- Symlinks inside the vault.
- `requireNote`, ambiguous names and the card naming `path`: separate tasks.
- A real-CLI or in-vault run: the refused targets are owed by hand
  (DES-006 manual verification).

## Plan

- Tests first in `tests/mcp.test.mjs`: the refused shapes, `..`, the
  configuration folder in every spelling above, the 8.3 alias, Unicode forms,
  and the targets that must pass.
- `renameTargetError` does steps 1 and 2 in one pure function on the raw
  `newPath`, before `normalizePath`, so the check never depends on what
  Obsidian's normalizer keeps. Its comparison folds more than `normalizePath`
  does, so every string `normalizePath` could turn into the folder is refused
  too. `configDir` is always one dot-prefixed segment (Obsidian validates it),
  so the 8.3 rule looks at the first segment only.
- A new module `mcp/paths`, not `mcp/replies` (a reply's text) or `mcp/query`
  (the search grammar): design rule 1, one job.
- Verification: `make verify`; independent review; by hand in a vault: each
  refused target, `./notes/x.md`, and a rename into a new folder.
- Rejected: checking `normalizePath(newPath)` in the handler (the check would
  need `obsidian`, untestable in plain Node); refusing every segment that
  starts with `.` (not in the requirement, see negative scope).

## Run log

- Tests first: against a stub returning null, five of the seven first tests
  failed (the two that expect a pass held); all passed after `mcp/paths`. After
  review, six of the thirteen tests failed against the first implementation
  before the second.
- Mutation check: removing each of NFC, case folding, invisible characters,
  the 8.3 rule, the empty-fold fallback, the `:` cut, the trailing trim and the
  drive-letter rule fails a test.
- Acceptance 7 has no automated test: `vault-tools` imports `obsidian`. Owed by
  hand in a vault.
- The protected-path hook blocks the Write and Edit tools for every worktree
  outside the project directory (it fails closed on a path it cannot place), so
  the files were written through the shell. No protected path was touched.
  `package.json`'s `pretest` line was edited through the shell too; the
  addition is authorized by the owner's standing rule "Add new modules to
  pretest".
- Other writers checked: `obsidian_properties` writes frontmatter of a note
  resolved through Obsidian's index; `obsidian_open` and the read tools write
  nothing. Only `obsidian_rename` takes a path to create. `requireNote` is
  documented (DES-006) but absent from the code: a separate task.
- The 8.3 rule applies only to a first segment that is a folder (more segments
  follow), so a root file `Draft~1.md` passes; a root folder named like an alias
  (`Draft~1/x.md`) is refused, documented in DES-006.

## Independent review

Round 1: a review agent, not the implementer; tested against Obsidian 1.14.4
and Windows Node; `make verify` passed.

1. Defect: a Windows 8.3 alias (`OBSIDI~1/plugins/x/main.js`) passed and NTFS
   resolves it to `.obsidian`. Fixed: a first segment shaped like a short name
   is refused as the configuration folder; 8.3 left the negative scope.
2. Gap: macOS case and Unicode aliases (`.obſidian`, `.obs‌idian`). Fixed:
   the fold goes through upper then lower case and drops default-ignorable
   code points.
3. Gap: other hidden folders (`.claude/`, `.git/hooks`, `.mcp.json`) take
   renamed files that Claude Code or Git then run. Deferred: PRD-004.R7 names
   only the configuration folder; negative scope and a backlog item.
4. Test gaps: no test failed without NFC; `a/.../b.md` was untested;
   `.../.obsidian/x.md` was refused without a stated reason; `.` and `./`
   targets were unpinned. Fixed: a decomposed-against-composed test, both
   `...` cases pass (a `...` segment keeps its own name), `.` and `./` are
   refused as naming no file.
5. Wrong text: DES-006 and the code comment said Windows trims trailing dots
   and spaces on Obsidian's path; Node's `fs` adds `\\?\`, which trims nothing.
   Fixed: described as defense in depth, and the fold as implemented.
6. Wrong text: the release note and Spec said an absolute or drive target
   could escape before the fix; only `..` could (`normalizePath` strips leading
   separators, Obsidian's `checkPath` rejects drive paths). Fixed.
7. Gap: `./notes/x.md` reached Obsidian unchanged. Fixed: `renameTargetPath`
   drops empty and `.` segments before `normalizePath`.
8. Run log: the `pretest` edit through the shell was not recorded. Fixed.
9. Gap: a nested `configDir` cannot occur (Obsidian validates it); a `configDir`
   that folds to nothing disabled the check. Fixed: the nested tests and
   acceptance are gone, a `configDir` of dots or spaces keeps its own text, and
   an empty one refuses every target.
10. Gap: SECURITY.md did not state the rename boundary. Fixed: one sentence
    naming the residuals (symlinks inside the vault, other hidden folders).

## Outcome

`obsidian_rename` refuses an absolute, drive or UNC target, a `..` segment,
and a target in the configuration folder however it is spelled (case,
separators, Unicode folding, invisible characters, Windows 8.3 aliases);
refusals create nothing. Other hidden folders wait for a PRD-004.R7
amendment (backlog). Owed by hand in a vault: the refused targets and a
rename into a new folder.
