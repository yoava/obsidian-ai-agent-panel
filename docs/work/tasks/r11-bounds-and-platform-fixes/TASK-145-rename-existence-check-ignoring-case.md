---
status: planned
release: r11-bounds-and-platform-fixes
number: 145
prd: PRD-004.R7
---

# TASK-145 — Rename existence check ignoring case

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`, the owner's decision of 2026-10-17 (1.0.0 known issue; risk
row 5). `obsidian_rename` checks the target with an exact-string lookup in the
vault index (`src/mcp/vault-tools.ts`, DES-006 Tool contract step 3), so on a
case-insensitive file system `Notes/README.md` renamed to `notes/readme.md`
may replace an existing `readme.md`. Unverified: Obsidian's rename may refuse
it. PRD-004.R7 names the intended behavior.

Acceptance:

- Evidence first: the behavior in a vault on macOS or Windows, recorded in
  `docs/records/verification/`. If Obsidian refuses the overwrite, the task
  closes with that record and the notes' known issue is dropped.
- Otherwise, on win32 and darwin the check compares case-folded paths, so a
  target matching another file only by case is refused with the existing
  error naming that file.
- A rename that changes only the case of the note's own name succeeds.
- Linux is unchanged.

## Scope

Expected files: `src/mcp/vault-tools.ts`, a case-folding helper shared with
`namesIgnoreCase` (`src/edits.ts`), `tests/mcp.test.mjs`, DES-006,
`RELEASE_NOTES.md`.

Negative scope: the platform-versus-volume rule (DES-004 states that a
case-sensitive volume on Windows over-matches), Unicode form folding on
macOS (`namesIgnoreForm`), the non-dot tool-loaded names (backlog).

## Plan

Walk the vault index comparing folded paths, allowing the file's own path.
Rejected: `fs.existsSync` on the adapter path, which also matches the file
itself and bypasses the index DES-006 names as the source of truth.

## Run log

Not started.

## Independent review

Pending.

## Outcome

Pending.
