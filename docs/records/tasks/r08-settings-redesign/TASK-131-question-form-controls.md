---
status: closed
release: r08-settings-redesign
number: 131
prd: PRD-002.R12
---

# TASK-131 — Question form controls as the boards draw them

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`, reported by the owner with a screenshot: a picked radio drew
as an accent disk with a hollow center, and a checkbox in an option with a
description sat on the description line. Governing:
[DES-003](../../../current/design/DES-003-panel-ui.md) question form (native
radio or checkbox cards); board Question (SPEC.md 4.3: native controls with
`accent-color`).

Cause: Obsidian's `app.css` sets `appearance: none` on every radio and
checkbox and draws its own (accent fill, a `::after` mark in
`--checkbox-marker-color`), so `accent-color` had no effect; the multi-select
cards centered the box on the card, which the board's label-only cards hide.

Acceptance:

1. The option's input is the browser's own control in the accent: no
   Obsidian fill or `::after` mark, light and dark.
2. Single- and multi-select inputs sit 2 px below the top of the option's
   name, with or without a description.

## Scope

Expected files: `styles.css`, `RELEASE_NOTES.md`.

Negative scope: no DOM, behavior or token change; `tests/styles.test.mjs`
untouched; no other control restyled.

## Plan

- Reproduce in the panel harness (the real `QuestionFormView` mounted in the
  panel, Obsidian 1.14.4's `app.css`), fix, re-shoot.

## Run log

- Before: computed `appearance: none`; the picked radio an accent disk with a
  bg-colored center; checkboxes in described options 21.1 px below the
  name's top.
- After `appearance: auto` alone, Obsidian's `:checked::after` mark still
  covered the native dot; `content: none` on it fixed that.
- After: `appearance: auto`, every input 2 px below its name, light and dark,
  440 px; `make verify` OK.

## Independent review

Size S, CSS only: the orchestrator compared harness shots against the board's
spec in both themes. Real Obsidian: the owner's manual check.

## Outcome

Done.
