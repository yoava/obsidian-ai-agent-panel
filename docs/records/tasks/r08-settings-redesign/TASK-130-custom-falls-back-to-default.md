---
status: closed
release: r08-settings-redesign
number: 130
prd: PRD-001.R33
---

# TASK-130 — A Custom prompt color without a valid value draws the default

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`: a Custom color without a valid value drew Mist, not the
default, and a stored refused value claimed "The prompt keeps the last valid
one." with none kept. Governing: [change 020](../../changes/CHG-020-custom-falls-back-to-default.md)
(owner decision 30);
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R33;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Prompt color.

Acceptance:

1. `promptSelection` gives the default color's class
   (`promptColorClass(DEFAULT_SETTINGS.promptColor)`, today
   `mod-prompt-color-sand`) for a color that is no key and for Custom with a
   refused or empty stored value; the Custom property stays null then.
2. The "Custom color" field's message is the reason ("Not a CSS color." or
   "Use a color, not var(), env(), attr() or currentColor.") then "The prompt
   keeps the last valid one." when the stored value is accepted, else
   "Prompts use Sand, the default." (the default's label from
   `PROMPT_COLOR_LABELS`).
3. With the field empty and no valid value stored, the field says "No custom
   color yet. Prompts use Sand, the default." in the same warning style.
4. A stored refused value (an edited `data.json`) shows its reason with
   "Prompts use Sand, the default." when the page draws.

## Scope

Expected files: `src/state/prompt-color.ts`, `src/settings.ts` (the Custom
color field), tests `state-prompt-color`; docs PRD-001 R33, ADR-017 (Prompt
color: the Custom acceptance sentence, and any other sentence that names Mist
as the fallback), DES-003 ("Custom color"), `RELEASE_NOTES.md` only if it
names the fallback.

Negative scope:

- No CSS; Mist keeps the class-less aliases; no change to acceptance rules,
  storage or the picker; `tests/styles.test.mjs` untouched.
- No protected-path edit.

## Plan

- Tests first, confirmed failing: acceptance 1 to 4 as far as Node reaches
  (the message choice as a pure function in `state/prompt-color`).
- Then the code and docs; `make verify`.

## Run log

- Tests first: `npm test` gave 1 failing file-level test before code (the missing `customColorMessage` export fails the whole spec at import), 1844 passing.
- `customColorProblem` now returns "empty" (no typed value, nothing valid stored) in place of null; `customColorMessage(typed, stored, supports)` builds the line.

## Independent review

Size S: the orchestrator read the complete diff against the acceptance and
change 020; a blank field over a stored refused value reads "No custom color
yet.", since nothing valid is stored. `make verify` rerun on landing.

## Outcome

Done.
