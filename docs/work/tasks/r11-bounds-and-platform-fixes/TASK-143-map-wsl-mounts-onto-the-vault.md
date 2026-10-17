---
status: planned
release: r11-bounds-and-platform-fixes
number: 143
prd: PRD-002.R6
---

# TASK-143 — Map WSL mounts onto the vault

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `fix`, the owner's decision of 2026-10-17 (1.0.0 known issue; risk
row 7, the highest residual score). Under a profile that runs via WSL the CLI
reports `/mnt/<drive>/...` paths; `placeInVault` (`src/edits.ts`) places such
a path only when the root is spelled the same way, so edit cards, the change
list (PRD-002.R6, R7) and the restore dialog (PRD-002.R14) treat vault files
as outside the vault. The edits themselves are correct.

Acceptance:

- With a WSL profile and the vault at `C:\Users\me\Vault`, an edit reported as
  `/mnt/c/Users/me/Vault/Notes/a.md` shows as `Notes/a.md` on the card, in
  the change list and in the restore dialog; the drive letter matches in
  either case.
- The mapping applies only to the WSL profile's session, never to a native
  profile or on macOS and Linux.
- A vault opened through `//wsl.localhost/` is unchanged (DES-004 bound).
- DES-004 Edit planning and the notes' known issue are rewritten.

## Scope

Expected files: `src/edits.ts` or a new pure path module, the edit-planning
caller that knows the session's profile, `tests/edits.test.mjs`, DES-004,
`RELEASE_NOTES.md`.

Negative scope: a custom mount root (`automount.root` other than `/mnt`),
`\\wsl$` paths, symlinks (task 142).

## Plan

A pure `wslMountToWindows(path)` returns `<D>:/...` for `/mnt/<d>/...` and
null otherwise; `placeInVault` takes a `useWsl` flag and maps before the
existing comparison. Tests first, then `make verify`, then the owner's check
in the F15 vault under its WSL profile, recorded in
`docs/records/verification/`.

Rejected: respelling the vault root as `/mnt/<d>/` instead, since the root's
form decides the separator rules in `vaultRelativePath`.

## Run log

Not started.

## Independent review

Pending.

## Outcome

Pending.
