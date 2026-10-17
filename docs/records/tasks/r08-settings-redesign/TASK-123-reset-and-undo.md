---
status: closed
release: r08-settings-redesign
number: 123
prd: PRD-001.R39, PRD-001.R24
---

# TASK-123 — Reset a setting, a section or everything, with Undo

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L, `feat`. Owner decision 6
([brief](../../../work/research/redesign-canvas/settings/BRIEF.md)). Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R39 (reset clauses), R24; [ADR-019](../../../current/adr/ADR-019-settings-page-on-the-declarative-api.md);
[DES-001](../../../current/design/DES-001-system-overview.md) Settings page,
Reset; [DES-005](../../../current/design/DES-005-persistence-and-sync.md)
Reset and Undo.

Acceptance:

1. A modified row's reset button (icon-only; tooltip "Reset to default:
   <value>", name "Reset <name> to default: <value>") resets it at once.
2. A section heading shows "Reset N" while N rows in the section are
   modified (whatever Modified says) and the search is empty; the bar shows
   "Reset all…". Both open `ResetModal` (`confirm-modal`, `themeModal`) with
   DES-001's copy: the count and storage line, each change (sync icon with
   hidden "synced" or "on this device", name, "turns on" pill, old → new, a
   deleted text by its first line, at most 60 characters then "…"), grouped
   by section for everything, "Also reset Claude Code" and "Also reset what
   syncs" off; Cancel focused; "Reset N settings" (`mod-cta`, `mod-warning`
   for everything). Nothing changes until confirmed.
3. Confirm rebuilds the plan; if it differs from the one shown, the dialog
   shows the new plan instead of applying.
4. Apply mutates the patches, saves once, applies the panel settings, and
   the launch settings when the settings tab is closed. Profile name, Run
   via WSL and the default profile are never reset; no profile is added or
   removed.
5. Once saved, a Notice for 10 s names what was reset ("<name> reset to
   default.", "<section> reset to default.", "All settings reset to
   default.") with "Undo". Undo restores only the values still holding the
   reset value, sync choices included, names any it left ("Undone, except
   <names>, changed since."), saves, applies, and redraws the touched rows
   if the tab is open.
6. A failed save shows "Could not save the settings: <message>" and keeps
   offering Undo, which restores memory and saves again.
7. Touched rows redraw through their handles; focus stays where it was or
   moves to the row's control when its reset button disappears.

## Scope

Expected files: `src/state/settings-reset.ts` (new: plan, patches, inverse,
the Undo guard; `tests/state-settings-reset.test.mjs`, `pretest`),
`src/state/settings-rows.ts` (reset patches), `src/confirm-modal.ts`
(`ResetModal`), `src/settings.ts`, `src/main.ts` (apply paths), `styles.css`;
tests `tooltips` (counts only, each listed); docs `RELEASE_NOTES.md`,
`README.md` (feature list), `docs/current/DEVELOPMENT.md` (test table), the
drafts where the code differs.

Negative scope:

- No reset of profile identity; no profile added or removed by a reset.
- No change to the save path or the sync units beyond calling them; no
  storage format change.
- No profile restack or missing-CLI state (task 124); no panel change; no
  new dependency; no protected-path edit; no real-CLI run.

## Plan

- Tests first, confirmed failing: the plan per scope (row, section,
  everything, with and without the two options), turns-on marks, first
  lines, the patches and their inverse (paired keys `model`+`lastModel`,
  `effort`+`lastEffort`, `promptColor`+`promptCustomColor`; profile fields
  by id; `localGroups`), the stale-plan check, Undo with a value changed
  since and with one changed and changed back.
- Codex reviews the reset and Undo storage before landing.
- Verification: `make verify`; harness board `SettingsReset` (row, section,
  everything, notice), 460 and 720 px, dark and light; a failing
  `saveSettings` stand-in.
- Rejected: Undo stored on disk (a 10 s notice; a crash loses only the
  Undo); a confirmation for a single row (decision 6).

## Run log

- Proof of failure: the 24 new reset tests and the pretest module check ran
  against a stub; 25 failed (1756 of 1781 passed). All pass after.
- Round 2 (Codex, storage): with the tab closed, an Undo on the legacy
  renderer rebuilt the hidden page, so the launch settings were not applied
  (no redraw while closed now); a section or everything left modified rows
  that another row's value hides (they are reset now, and "Reset N" counts
  them).
- Round 2 (review): under Modified or a search, a reset filtered its own row
  out and dropped focus (the rows a reset touches stay shown, as an edit's
  do); Reset all's narrow tooltip now follows `--no-tooltip` with a stable
  name, not an `aria-label` added by width; the dialog's buttons sit at its
  end with the board's padding.
- Harness on Obsidian 1.14.4, with 1.13.4's keying and on the legacy
  renderer, both stores inspected after each step: row, section and all
  resets with both options, Cancel, a stale plan, Undo with a value changed
  since and changed back, Undo after the tab closed, a rejected reset save
  and a rejected Undo save; `SettingsReset` at 460 and 720 px, dark and
  light.

## Independent review

Codex (storage, static) and an Opus review agent (not the implementer), with
its own harness probes and six test mutants, all killed. Fixed: the round 2
items. Settled in DES-001: the storage line for everything follows the same
rule as a section; a profile row is prefixed only while two or more profiles
exist; the empty-plan wordings. Disclosed, not fixed: a save that moves keys
between the stores writes the device store first, so a failed `data.json`
write after a move to synced loses those keys at the next restart; a badge
flip has the same exposure, and the save path is outside this task (owner
decision). After Undo, focus stays with the closed notice. Final verdict:
approve after fixes, applied and verified by the orchestrator (harness shots
and `make verify`).

## Outcome

Done.
