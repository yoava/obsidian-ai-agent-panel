# CHG-019 — Sand is the default prompt color

**Status:** incorporated (2026-10-16)

Approved by the owner on 2026-10-16 in the session ("make sand the default
prompt color"). Lands with task 129.

## Intent

New settings and a reset draw prompts in Sand instead of Mist. Mist stays the
color the palettes' aliases draw with no class (ADR-017), so a refused or
empty Custom still draws Mist and no CSS changes.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R25, R33), [DES-001](../../current/design/DES-001-system-overview.md) (the
defaults line, the Modified table),
[DES-003](../../current/design/DES-003-panel-ui.md) (the token table).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R25** — Defaults.
  - Before: ... prompt style "Card", prompt color "Mist", ...
  - After: ... prompt style "Card", prompt color "Sand", ...
- **PRD-001.R33** — Prompt color cards.
  - Before: "Clear", "Sand", "Stone", "Sage", "Sea", "Mist" (the default),
    "Lavender", "Rose", "Accent" and "Custom".
  - After: "Clear", "Sand" (the default), "Stone", "Sage", "Sea", "Mist",
    "Lavender", "Rose", "Accent" and "Custom".

## REMOVED requirements

None.

## Design and migration impact

- `DEFAULT_SETTINGS.promptColor` is `sand`; a default root carries
  `mod-prompt-color-sand`.
- Stored data: no released version stores a prompt color; an unknown stored
  value loads as Sand; a stored `mist` stays Mist. The owner's three vaults
  store none, so they take Sand.
- Rollback: revert the commit.

## Incorporation

PRD-001, DES-001 and DES-003 edited on owner approval; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-019-sand-default-prompt-color.md`.
