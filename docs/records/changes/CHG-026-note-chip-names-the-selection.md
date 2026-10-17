# CHG-026 — The note chip names the selection

**Status:** incorporated (2026-10-17)

Requested by the owner on 2026-10-17 in the image viewer and quick wins
session: the composer should show whether the note goes whole or with selected
lines, as other editors' chat panels show "N selected lines" in place of the
file name. Lands with task 141.

## Intent

Before sending, the user sees that a selection goes with the message.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R12), [DES-003](../../current/design/DES-003-panel-ui.md) (Context block and
chips, component events).

## ADDED requirements

### PRD-001

- **PRD-001.R12** — Note context: WHILE text is selected in the active note's
  editor, the AI Agent Panel shall show "N lines selected" on the note chip in
  place of the note's name, naming the note and the selected lines in the
  chip's accessible name.

## MODIFIED requirements

None.

## REMOVED requirements

None.

## Design and migration impact

- Wording "N lines selected", as the message label already reads; "1 line
  selected" for one.
- The count is the block lead's range, so a selection ending at the start of
  a line leaves that line out here too.
- Refreshed on document `selectionchange`, once per frame, redrawing only
  when the range changed; the panel's own document only, as the empty state's
  starters.
- Stored data: unchanged. Rollback: revert the commit.

## Incorporation

PRD-001 and DES-003 edited on the owner's request; the record moves to
`docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-026-note-chip-names-the-selection.md`.
