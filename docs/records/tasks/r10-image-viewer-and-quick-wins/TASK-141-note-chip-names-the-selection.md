---
status: closed
release: r10-image-viewer-and-quick-wins
number: 141
prd: PRD-001.R12
---

# TASK-141 — The note chip names the selection

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `feat`, the owner's request of 2026-10-17, requirement delta CHG-026:
while text is selected in the active note's editor, the note chip reads "N
lines selected" instead of the file name; its accessible name continues with
the file name and the line range.

Acceptance: the PRD-001.R12 statement CHG-026 adds; `state-composer` tests.

## Scope

Expected files: `src/context-format.ts`, `src/context-builder.ts`,
`src/state/composer.ts`, `src/ui/composer.ts`,
`tests/state-composer.test.mjs`, PRD-001, DES-003, CHG-026,
`RELEASE_NOTES.md`.

Negative scope: the context block and the message label (unchanged), an
editor in another window than the panel's, a chip tooltip (PRD-001.R32).

## Plan

`lineRange` and `selectedLinesName` (`context-format`) serve the block's
lead, the message label and the chip. `ContextTargets` carries the selected
range of the target note's editor. The composer re-reads it on its document's
`selectionchange`, once per frame, and redraws the chips only when the range
changed.

## Run log

- `tests/state-composer.test.mjs`: the chip's text, accessible name and
  turn-off name with a selection of several lines and of one, offered and on;
  no chip without a note.
- `tests/context-format.test.mjs`: the lead and label unchanged.
- `make verify` OK.

## Independent review

Size S: unit tests above; the owner checks the chip follows a selection in a
vault, including a selection made by keyboard.

## Outcome

Done.
