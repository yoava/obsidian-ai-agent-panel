---
status: planned
release: r11-bounds-and-platform-fixes
number: 142
prd: PRD-004.R7
---

# TASK-142 — Real paths before the vault-bounds check

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `fix`, the owner's decision of 2026-10-17 (1.0.0 known issue; risk
row 2 of the release's risk table). Vault bounds compare path spelling, so a
folder symlinked or junctioned into the vault counts as inside it: edit cards
and the change list place the path as the vault's own (`placeInVault`,
`src/edits.ts`; DES-004 Edit planning), and `obsidian_rename` moves a note into
it (`src/mcp/vault-tools.ts`; DES-006 Tool contract step 3). PRD-002.R6 and
PRD-004.R7 name the intended behavior; `docs/current/SECURITY.md` discloses
the bound.

Acceptance:

- An edit whose target's real path lies outside the vault root's real path is
  shown as outside the vault on the card and in the change list.
- `obsidian_rename` refuses a target whose parent folder's real path lies
  outside the vault, with an error naming the folder.
- A vault whose root is itself a symlink still places its own files.
- A root whose real path cannot be read (a non-local file system) falls back
  to spelling, and the card says so.
- SECURITY.md, DES-004, DES-006 and the notes' known issue are rewritten.

## Scope

Expected files: `src/edits.ts`, `src/mcp/vault-tools.ts`, one shared
real-path module, `tests/edits.test.mjs`, `tests/mcp.test.mjs`,
DES-004, DES-006, `docs/current/SECURITY.md`, `RELEASE_NOTES.md`.

Negative scope: non-dot names other tools load (`CLAUDE.md`, `lefthook.yml`;
backlog, no fix), the WSL `/mnt` mapping (task 143), the platform case rule
(DES-004 states it).

## Plan

One helper resolves the vault root and a target with `fs.realpath.native`,
cached per root for the turn, and feeds `vaultRelativePath` the real forms;
both callers use it. Tests create a temporary vault with a real symlink and
skip where the platform refuses symlinks. Then `make verify` and a vault run
with a symlinked folder on Linux and a junction on Windows, recorded in
`docs/records/verification/`.

Risks: a realpath per card on a slow volume (the cache bounds it); vaults that
symlink shared folders lose rename into them (accepted by the owner).
Rejected: refusing every symlink target outright, which also blocks reading
them for the diff.

## Run log

Not started.

## Independent review

Pending.

## Outcome

Pending.
