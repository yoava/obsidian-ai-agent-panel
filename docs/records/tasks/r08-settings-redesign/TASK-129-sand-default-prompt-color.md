---
status: closed
release: r08-settings-redesign
number: 129
prd: PRD-001.R25, PRD-001.R33
---

# TASK-129 — Sand is the default prompt color

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `feat`: new settings and a reset draw prompts in Sand.
Governing: [change 019](../../changes/CHG-019-sand-default-prompt-color.md);
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R25,
R33; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
Prompt color (unchanged).

Acceptance:

1. `DEFAULT_SETTINGS.promptColor` is `sand`; an unknown stored value loads
   as `sand`; a stored `mist` loads as `mist`.
2. The settings row shows "Sand" as the default; `promptColor: "sand"` is
   not Modified and `mist` is; resetting Prompt color sets `sand` and clears
   the custom color.
3. Unchanged: `promptColorClass("mist")` is null; a refused or empty Custom,
   or a value that is no key, leaves the root on Mist (`promptSelection`).

## Scope

Expected files: `src/settings-core.ts` (the default and its comment),
`src/settings.ts` (the Prompt color description); tests `settings-core`,
`state-settings-rows`, `state-settings-reset`, and comments in
`palette.test.mjs` that call Mist the default; docs PRD-001 (per change
019), DES-001, DES-003, `README.md`, `RELEASE_NOTES.md`.

Negative scope:

- No CSS, no ADR-017 edit, no change to `promptSelection` or
  `promptColorClass`; Mist keeps the class-less aliases.
- No migration; no setting added or dropped; no protected-path edit;
  `tests/styles.test.mjs` untouched.

## Plan

- Tests first, confirmed failing: acceptance 1 and 2.
- Then the code and docs; `make verify`.
- Rejected: re-aliasing the palettes to Sand and classing Mist (CSS, ADR-017
  and `tests/styles.test.mjs` edits for the same visible result).

## Run log

- Tests first: 8 of 1857 failed before the code change (settings-core 3, state-settings-reset 3, state-settings-rows 2); all passed after.
- Added checks that a stored `mist` loads as `mist` and is Modified. `make verify` ends "verify: OK".

## Independent review

Size S: the orchestrator read the complete diff against the acceptance and
negative scope (no CSS, ADR-017, `promptSelection` or `tests/styles.test.mjs`
edit) and reran `make verify`.

## Outcome

Done. The owner's three vaults store no prompt color, so they take Sand.
