# CHG-013 — Rename a conversation

**Status:** incorporated (2026-10-14)

Approved by the owner's request of 2026-10-14, "tab popup menu should have an
option to rename tab"; the PRD edits land with task 113.

## Intent

The first prompt fixes a conversation's title and nothing changes it (PRD-003
non-goal, "reason not recorded"). The owner asks for a Rename entry in the tab
menu, which reverses that non-goal. The row menu is one component for the tab
strip, the overflow menu and the column rows, so one entry serves them all.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[PRD-003](../../current/product/PRD-003-conversation-history-and-export.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R9** — Conversation list.
  - Before: the row menu offers Open (Recent rows only), Pin or Unpin, Export
    to Markdown, Close (open rows only) and Delete.
  - After: the row menu offers Open (Recent rows only), Pin or Unpin,
    Rename…, Export to Markdown, Close (open rows only) and Delete.
- **PRD-001.R7** — Conversation tabs. New clauses after the titling clause:
  - WHEN the user picks "Rename…" in a tab's or a row's menu, the AI Agent Panel shall show a "Rename conversation" dialog with a text field holding the title, selected, and the buttons "Cancel" and "Rename".
  - WHEN the user presses Enter in the field or "Rename", the AI Agent Panel shall retitle the conversation with the field's first line, trimmed, up to 80 characters, and close the dialog.
  - WHEN the user presses Escape or "Cancel", the AI Agent Panel shall close the dialog and change nothing.
  - WHILE the field is empty or blank, the AI Agent Panel shall disable "Rename"; a title equal to the one shown changes nothing.
  - The AI Agent Panel shall show a renamed conversation's title wherever R7 shows a title, keep it when the first prompt is sent, and save it (PRD-003.R5).
  - WHEN a conversation is renamed, the AI Agent Panel shall keep its last-updated time and its exported note's path.
  - WHEN a renamed conversation is exported again, the AI Agent Panel shall write the new title in the note's frontmatter.
  - WHEN the user renames a conversation that is not open, the AI Agent Panel shall retitle it without opening it.
  - WHEN the user renames a conversation that is open in another panel, that panel shall show the new title.

## REMOVED requirements

### PRD-003 non-goals

- "Renaming a conversation: the first prompt fixes the title; reason not
  recorded."

## Design and migration impact

- DES-003: the row menu entry and the dialog.
- DES-005: stored `title` written by a rename with `touch: false`.
- Stored data: none; `title` is already stored. No version bump.
- Rollback: renamed titles stay in the files; the old reader shows them.

## Incorporation

PRD-001 and PRD-003 edited in task 113's commit; the record moved to
`docs/records/changes/` by `make close DOC=docs/records/changes/CHG-013-rename-conversation.md`.
