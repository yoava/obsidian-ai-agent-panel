# CHG-014 — The working line stays at the live end

**Status:** incorporated (2026-10-14)

Approved by the owner's report of 2026-10-14 that the cue "moves up as more
output is generated … can be unnoticed or off screen"; the PRD edit lands with
task 112.

## Intent

The working line showed only once the turn's head was out of view, so while the
head was on screen the head's ringing mark was the only cue, and it moved up
as output grew. The line now shows whenever Claude works, at the end of the
messages.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R15** — Working line.
  - Before: WHILE a turn runs, its head is out of view and no permission or
    question card waits, the working line shows at the end of the messages.
  - After: WHILE a turn runs and no permission or question card waits, the
    working line shows at the end of the messages, wherever the head is.

## REMOVED requirements

None.

## Design and migration impact

- DES-003 Turn: the line keys on activity alone; the head's mark stays still
  while the line shows, which is from the send on.
- Stored data: none.
- Rollback: revert the commit.

## Incorporation

PRD-001 edited in task 112's commit; the record moves to
`docs/records/changes/` by `make close DOC=docs/records/changes/CHG-014-working-cue-live-end.md`.
