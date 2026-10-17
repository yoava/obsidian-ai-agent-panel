---
status: closed
release: r08-settings-redesign
number: 124
prd: PRD-001.R3, PRD-001.R4, PRD-001.R39
---

# TASK-124 — Stacked CLI profiles and a missing-CLI banner

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L, `feat`. Owner decision 7
([brief](../../../work/research/redesign-canvas/settings/BRIEF.md)). Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R3, R4, R39 (profiles, banner); [ADR-019](../../../current/adr/ADR-019-settings-page-on-the-declarative-api.md);
[DES-001](../../../current/design/DES-001-system-overview.md)
Settings page (Claude Code rows, banner);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Settings UI, Missing CLI.

Acceptance:

1. Each profile stacks under a sub-heading "Profile <name>" ("default" on
   the default one): Profile name, Claude CLI path (with Detect), Run via
   WSL, Claude in Chrome, Sandbox, Additional arguments, Use for new
   conversations, and "Remove the <name> profile"; then "Add a CLI profile"
   with "Add profile". The "Default CLI profile" dropdown is gone.
2. "Use for new conversations" turned on makes that profile the default; on
   the default it is on and disabled. With one profile, the sub-heading,
   name, the toggle and Remove are hidden.
3. A WSL profile's "Claude in Chrome" stays available and is passed as set
   (owner, decision 5); the row's description ends its sentence "Needs the
   extension and a claude.ai login" with "; Claude Code's docs list WSL as
   unsupported." instead of "; not available in WSL."
4. Main keeps a per-profile, per-run missing state: a native path that does
   not exist (checked on page show and on each path edit), a failed
   auto-detect or Detect, or WSL exit 127 before init; cleared by a
   successful Detect or start. A profile with an empty path and no
   detection yet is detected once on page show; WSL is not probed.
5. While a profile's CLI is missing: the banner group under the bar, always
   in the group list and shown through `visible` (ADR-019; alert
   icon, "Claude Code was not found <where>, so the <name> profile can't
   start conversations.", "Fix it" jumping to that profile); alert icons on
   the Claude Code link, its heading and the profile's sub-heading; the
   profile's notice ("Claude Code was not found <where>. Install it, or set
   the path and press Detect."; in WSL "Install it in the distro, or set the
   path and press Detect."). <where> is "in WSL", "at <path>" or "on this
   device". Icon and text, never color alone.
6. Adding, removing or renaming a profile keeps focus and typed text in
   their row (structural redraw by id).

## Scope

Expected files: `src/settings.ts`, `src/cli.ts` (existence check),
`src/cli-args.ts`, `src/main.ts` (missing state), `src/settings-core.ts` if
the missing-state shape lives there, `styles.css`; tests `cli-args`, `cli`,
`settings-core` or a new `state-` module with its test and `pretest`,
`tooltips` (counts only, each listed); docs `RELEASE_NOTES.md`, `README.md`
(feature list), `docs/current/DEVELOPMENT.md` (test table), the drafts where
the code differs.

Negative scope:

- No change to how a profile launches; no new profile field; no stored
  missing state.
- No probing of WSL; no real-CLI run (fake CLI only).
- No setting added or dropped; no panel change; no new dependency; no
  protected-path edit.

## Plan

- Tests first, confirmed failing: the
  missing state's transitions (path absent, detect failed, exit 127, cleared
  on success); the banner's <where> text.
- Reuse `resolveCli`, `profileLabel`, task 121's jump and controller, task
  122's registry (identity rows), task 123's reset (profile fields by id).
- Verification: `make verify`; harness board `SettingsNarrow` (two profiles,
  one missing) and the Claude Code part of `SettingsFull-*`, 460 and 720 px,
  dark and light; fake CLI for exit 127.
- Rejected: probing WSL for the binary (spawns a distro on page show).

## Run log

- Proof of failure: the new missing-state, path-check and exit-127 tests ran
  against stubs; 26 failed (1807 of 1833 passed). All pass after.
- Scope: `src/session.ts`, `src/tab/session-link.ts` and `src/view.ts` carry
  the start and exit-127 reports acceptance 4 needs; the stale-gap and select
  width fixes in `styles.css` repair task 121's unreleased narrow rule.
- Round 2 (review and Codex): a relative path is checked from the vault, and
  on Windows with `.com`/`.exe`; the page check is native-only and never
  changes Run via WSL; a Detect miss marks only an empty or absent native
  path; each result carries a revision, so an edit, Reset or Undo drops it
  and re-checks, and A to B to A rejects the late answer; Detect and
  auto-detect write nothing after a concurrent edit; a start reports the
  configuration it resolved; Clear and Undo sessions forward both reports;
  the notice sits under the sub-heading, Remove is the board's ghost button
  with its icon, and Detect and Add profile take the outlined style.
- Round 3 (Codex, test first, 6 then 1 failing): a relative POSIX path keeps
  its `..` for the file system to follow; a later observation replaces an
  earlier one and a search reports as of when it began; a Detect miss clears
  a configured native path that exists, judged when it answers.
- Narrow rows on 1.13+ get the 12 px column gap (the rule lost to the group
  rule's specificity); a select is as wide as its choice from Chromium 123.
- Harness on Obsidian 1.14.4, with 1.13.4's keying and on the legacy
  renderer: rename, a missing path typed, Fix it, Detect hit and miss, path
  Reset and Undo, Use for new conversations, the WSL flip, Add and Remove;
  `SettingsNarrow` and the Claude Code part of `SettingsFull-*` at 460 and
  720 px, dark and light, with the 122 and 123 states as regression shots.
  Exit 127 runs on the fake CLI (`exit127` scenario).

## Independent review

Codex (three rounds, static) and an Opus review agent (not the implementer),
with its own harness probes and ten test mutants, all killed. Fixed: the
round 2 and 3 items. Disclosed, not fixed: the page's 32 px right gutter at
narrow widths (board 16) and, at 460 px, the Claude Code section's Reset and
badge wrapping under its lead predate this task; the board stacks the WSL
path row at 460 px (owner call); Remove shows on every profile, as DES-001
asks; a native `~/` path is not expanded, so it is reported missing, as its
launch fails; PRD-001's non-goal "Claude in Chrome inside WSL" reads against
decision 5; after Undo, focus stays on the page. Final verdict: approve after
fixes, applied and verified by the orchestrator (harness shots and
`make verify`).

## Outcome

Done.
