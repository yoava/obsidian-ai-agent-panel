---
status: closed
release: r10-image-viewer-and-quick-wins
number: 139
prd: PRD-001.R12
---

# TASK-139 — The selection names its note and lines

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `feat`, the owner's AAP-7, requirement delta CHG-024: the selection
in the context block is led by "Selected text from <path>, lines 12-18:"
("line 12" for one), the lines as on disk, 1-based, frontmatter counted, the
range the whole selection's even when the text is cut at 8000 characters;
"Add selection to chat" appends the same line above the text.

Acceptance: the PRD-001.R12 and R13 statements CHG-024 modifies;
`context-format` tests.

## Scope

Expected files: `src/context-format.ts`, `src/context-builder.ts`,
`src/main.ts`, `tests/context-format.test.mjs`, PRD-001, DES-001, DES-003,
CHG-024, `RELEASE_NOTES.md`.

Negative scope: reading view selections (no editor), several cursors (the
main selection only, as before), stored blocks.

## Plan

`ContextSources.selection` becomes `NoteSelection` (text, from, to). The
editor's lines are the file's, frontmatter included, so the range is the
cursor lines plus one; a selection ending at `ch` 0 of a later line leaves
that line out (decision 11). `selectionLines` and `selectionReference` are
pure (`context-format`); `noteSelection` (`context-builder`) reads the editor
for the send path and the command. The label counts the range.

## Run log

- `tests/context-format.test.mjs`: lines on disk and the start-of-line rule,
  the reference wording, the range kept over the 8000-character cut, the
  block and label with the new shape.
- `make verify` OK.

## Independent review

Size S: unit tests above; the owner checks the line numbers against a note
with frontmatter in a vault.

## Outcome

Done.
