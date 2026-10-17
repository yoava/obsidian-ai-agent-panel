# CHG-024 — The selection names its note and lines

**Status:** incorporated (2026-10-17)

Requested by the owner on 2026-10-17 as vault task AAP-7 ("Prompt - Image
viewer and quick wins"), decision 11 approved that day: the selection goes
with the note's vault path and its line range as on disk (1-based,
frontmatter counted), covering the whole selection even when the text is cut
at 8000 characters; "Add selection to chat" appends the same line above the
text. Lands with task 139.

## Intent

Claude can find the selected passage in the file and edit it in place.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R12, R13), [DES-003](../../current/design/DES-003-panel-ui.md) (Context block
and chips), [DES-001](../../current/design/DES-001-system-overview.md)
(`add-selection`).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R12** — the note chip's block.
  - Before: ... a context block naming the active note's path and the editor
    selection, up to 8000 characters.
  - After: ... a context block naming the active note's path and the editor
    selection, up to 8000 characters, led by the lines the whole selection
    spans in the file on disk (1-based, frontmatter counted).
- **PRD-001.R13** — "Add selection to chat".
  - Before: ... shall append the selection to the composer after a blank line.
  - After: ... shall append to the composer, after a blank line, the context
    block's line naming the note's path and the selection's lines, then the
    selection.

## REMOVED requirements

None.

## Design and migration impact

- The lead line is "Selected text from <path>, lines <from>-<to>:", "line
  <n>" for one; a selection ending at the start of a line leaves that line
  out. It replaces "Selected text:".
- The message label's "N lines selected" counts the same range.
- Stored data: unchanged; stored blocks keep the old lead.
- Rollback: revert the commit.

## Incorporation

PRD-001, DES-001 and DES-003 edited on the owner's request; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-024-selection-names-its-place.md`.
