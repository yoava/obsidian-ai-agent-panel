# CHG-021 — "Default:" shows only in the Modified view

**Status:** incorporated (2026-10-16)

Requested by the owner on 2026-10-16: "adding the 'Default: Sand' row when
changing from default makes the entire selection boxes jump a row up/down when
values change. either always show the 'Default: Sand' text, or remove it".
The session took removal from the page and kept the line in the Modified view,
where every row shown carries it, so it never appears or goes on a pick; the
session's decision note lists it as decision 32. Lands with task 134.

## Intent

Picking a value never moves a row's control. The page draws no "Default:"
line; while "Modified" is on, every row shown draws its default, a row edited
back to its default included.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R28, R39), [DES-001](../../current/design/DES-001-system-overview.md) (row
anatomy).

## ADDED requirements

### PRD-001

- **PRD-001.R39** — WHILE "Modified" is on, the AI Agent Panel shall show
  "Default: <value>" under the description of each row shown.

## MODIFIED requirements

### PRD-001

- **PRD-001.R28** — the modified cue.
  - Before: shall show a modified setting by its "Default:" line as well as
    its bar, ...
  - After: shall show a modified setting by its reset button as well as its
    bar, ...
- **PRD-001.R39** — a modified row.
  - Before: WHILE a row's setting differs from its default, the AI Agent Panel
    shall show "Default: <value>" under its description, a bar on the row's
    leading edge and a reset button named "Reset <name> to default: <value>".
  - After: WHILE a row's setting differs from its default, the AI Agent Panel
    shall show a bar on the row's leading edge and a reset button named
    "Reset <name> to default: <value>".

## REMOVED requirements

None.

## Design and migration impact

- The page controller paints the line from the Modified state, not from the
  row's modified state; the reset button still names and tips the default.
- Stored data: unchanged.
- Rollback: revert the commit.

## Incorporation

PRD-001 and DES-001 edited on the owner's request; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-021-default-line-in-modified-view.md`.
