# CHG-004 — Hover card closes on the pointer

**Status:** incorporated (2026-10-13)

## Intent

A hover card shown by keyboard focus stayed up while the pointer moved over
another tab (owner screenshots, Obsidian 1.14.4, task 046). It now closes
as soon as the pointer reaches another control too.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R32** — Popovers, hover cards and tooltips.
  - Before: WHEN one of those elements receives keyboard focus, the AI Agent Panel shall show its hover card until focus leaves.
  - After: WHEN one of those elements receives keyboard focus, the AI Agent Panel shall show its hover card until focus leaves or the pointer reaches another control (the element's own descendants count as the element).
  - Reason: a card for one element must not stay up while the pointer is on another.

## REMOVED requirements

None.

## Design and migration impact

DES-003 Popover and hover card (the machine's `control` event); task 046.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-004-hover-card-pointer-close.md`, in task
046's commit.
