# CHG-009 — Prompt board rendering

**Status:** incorporated (2026-10-13)

## Intent

The owner's "look like the mock" item for prompts and the empty conversation.
The boards label a prompt's context with the lines selected, draw a bare slash
command such as `/compact` as a compact command bubble, and word the empty
state's line and the link starter differently. Task 062 implements it.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R12** — Note context.
  - Before: WHEN a message is sent with context, the AI Agent Panel shall label the user's message with what was attached (note name, folder, "links & properties", "N attached").
  - After: WHEN a message is sent with context, the AI Agent Panel shall label the user's message with what was attached (note name, then "N lines selected" when the editor has a selection, folder, "links & properties", "N attached").
  - Reason: the boards show the selection's size in the prompt's context line.
- **PRD-001.R33** — Prompt display.
  - Before: WHERE "Prompt style" is "Pop-out" (the default), the AI Agent Panel shall show each prompt full width and tinted, with its number, "You", its send time when recorded, and its context label.
  - After: WHERE "Prompt style" is "Pop-out" (the default), the AI Agent Panel shall show each prompt full width and tinted, with its number, "You", its send time when recorded, and its context label, "N lines" for a selection.
  - Reason: the boards' head reads "6 lines".
  - Before: WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned with its context label under it.
  - After: WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned with its context label under it, "N lines selected" in full.
  - Reason: the boards' line under a bubble reads "6 lines selected".
  - Before: (none)
  - After: The AI Agent Panel shall show a prompt sent bare, such as `/compact`, as a compact monospace message that keeps its number, shown as a badge beside it in Quiet and Pop-out.
  - Reason: the boards draw `/compact` as a compact command bubble; it stays a numbered prompt so the numbers, the pin and the rail agree.
- **PRD-001.R35** — Empty conversation.
  - Before: WHILE a conversation has no messages, the AI Agent Panel shall show the heading "Ask about your vault", the line "Summarize, refactor, link or draft notes with Claude Code." and the placeholder "Ask about your vault… (@ mentions a note, / runs a command)".
  - After: WHILE a conversation has no messages, the AI Agent Panel shall show the heading "Ask about your vault", the line "Summarize, refactor, link or draft notes. Claude reads and edits files only with your permission." and the placeholder "Ask about your vault… (@ mentions a note, / runs a command)".
  - Reason: the boards' wording.
  - Before: "Summarize <note name>": "Summarize @<note path>." and "Find notes to link here": "Find notes in this vault that @<note path> could link to, with one line on why for each."
  - After: "Summarize <note file name>": "Summarize @<note path>." and a starter asking for the notes that ought to link to the active note (DES-003 gives its label): "Find notes in this vault that @<note path> could link to, with one line on why for each."
  - Reason: the boards name the file with its extension and label the link starter "Find notes that should link here"; the PRD keeps to words `scripts/check_prd.py` accepts, so DES-003 holds the exact label.

## REMOVED requirements

None.

## Design and migration impact

DES-003 Prompts, Pinned prompt, Empty conversation, Layout model, Token
contract; task 062. The stored context label gains "N lines selected" for new
messages only; stored files keep their labels.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-009-prompt-board-rendering.md`, in task
062's commit.
