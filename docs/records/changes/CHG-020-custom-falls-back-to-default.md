# CHG-020 — A Custom prompt color without a valid value draws the default

**Status:** incorporated (2026-10-16)

Approved by the owner on 2026-10-16 in the session's decision note, decision
30 ("use the default, which is currently sand (should be codede to fallback to
default with a warn message) - change and close the task"). Lands with task
130.

## Intent

While "Prompt color" is Custom and no valid custom color is stored, prompts
draw the default prompt color (Sand) instead of Mist, and the "Custom color"
field says so. Its messages name what the prompt shows: the last valid color
when one is stored, else the default.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R33), [ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md) (Prompt
color, Custom acceptance), [DES-003](../../current/design/DES-003-panel-ui.md)
("Custom color").

## ADDED requirements

### PRD-001

- **PRD-001.R33** — WHILE "Prompt color" is "Custom", no valid custom color is
  stored and the "Custom color" field is empty, the AI Agent Panel shall say
  "No custom color yet. Prompts use Sand, the default."

## MODIFIED requirements

### PRD-001

- **PRD-001.R33** — the two refusal clauses.
  - Before: ... THEN the AI Agent Panel shall say "Not a CSS color. The prompt
    keeps the last valid one." and keep the last valid color. (and the same
    for "Use a color, not var(), env(), attr() or currentColor.")
  - After: ... THEN the AI Agent Panel shall say "Not a CSS color." (or "Use a
    color, not var(), env(), attr() or currentColor.") followed by "The prompt
    keeps the last valid one." when a valid custom color is stored, else
    "Prompts use Sand, the default.", and keep the stored color.
- **PRD-001.R33** — Custom without a valid color.
  - Before: WHILE "Prompt color" is "Custom" and no valid custom color is
    stored, the AI Agent Panel shall draw prompts in Mist.
  - After: WHILE "Prompt color" is "Custom" and no valid custom color is
    stored, the AI Agent Panel shall draw prompts in the default prompt color.

## REMOVED requirements

None.

## Design and migration impact

- `promptSelection`: a refused or empty Custom value, and a color that is no
  key, give the default color's class (`DEFAULT_SETTINGS.promptColor`), not
  Mist's (none).
- ADR-017 Custom acceptance: "leaves the root on Mist" becomes "puts the root
  on the default prompt color".
- Stored data: unchanged.
- Rollback: revert the commit.

## Incorporation

PRD-001, ADR-017 and DES-003 edited on owner approval; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-020-custom-falls-back-to-default.md`.
