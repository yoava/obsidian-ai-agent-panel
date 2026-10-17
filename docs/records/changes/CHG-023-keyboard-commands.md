# CHG-023 — Commands for the prompt box, Stop and the tabs

**Status:** incorporated (2026-10-17)

Requested by the owner on 2026-10-17 as vault task AAP-5 ("Prompt - Image
viewer and quick wins"), decisions 8 to 10 approved that day: commands with
no default hotkeys to focus the prompt box, stop the turn and step through
the tabs, each offered only when it can act. Allow and Deny keys on
permission cards are out of scope. Lands with task 138.

## Intent

Everything a hand on the keyboard does often in the panel can be bound to a
key.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R1), [DES-001](../../current/design/DES-001-system-overview.md) (commands),
`README.md` (feature list).

## ADDED requirements

### PRD-001

- **PRD-001.R1** — commands.
  - WHEN the user runs "Stop Claude's turn", the AI Agent Panel shall stop the
    active tab's turn as Stop does.
  - WHEN the user runs "Next conversation tab" or "Previous conversation tab",
    the AI Agent Panel shall select the tab after or before the active one in
    strip order, wrapping at the ends.
  - WHILE the view is closed or its active tab runs no turn, the AI Agent
    Panel shall leave "Stop Claude's turn" out of the command palette.
  - WHILE the view is closed or holds fewer than two tabs, the AI Agent Panel
    shall leave "Next conversation tab" and "Previous conversation tab" out of
    the command palette.
  - WHERE several views are open, the AI Agent Panel shall run a command in
    the focused view, else in the first one.
  - The AI Agent Panel shall give its commands no default hotkeys.

## MODIFIED requirements

### PRD-001

- **PRD-001.R1** — opening the panel.
  - Before: WHEN the user clicks the ribbon icon or runs "Open chat", the AI
    Agent Panel shall show its view in the right sidebar and focus the
    composer.
  - After: WHEN the user clicks the ribbon icon or runs "Open chat" or "Focus
    prompt box", the AI Agent Panel shall show its view in the right sidebar
    and focus the composer.

## REMOVED requirements

None.

## Design and migration impact

- "Focus prompt box" shares "Open chat"'s `activateView`: the same act under
  the name a hotkey search finds (decision 8).
- `activateView` now prefers the focused view over the first, as the new
  commands do.
- Stored data: unchanged.
- Rollback: revert the commit.

## Incorporation

PRD-001, DES-001 and README edited on the owner's request; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-023-keyboard-commands.md`.
