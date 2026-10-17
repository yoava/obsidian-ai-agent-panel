# CHG-011 — Working cue

**Status:** incorporated (2026-10-13)

## Intent

The owner's report (2026-10-13): "sometimes claude is working and there's no
visual cue in the conversation other then the stop button in the prompt box
(sometimes it shows thinking / working, but not always)", and "it's best that
we have animation of sorts … the impl is missing the 'Claude working' text and
animation". The turn head carries the only working label and scrolls away with
the turn's start, so a long turn shows nothing between a tool result and the
next output, or during compaction. The boards' ClearStates draws a working
line (spinner mark, activity text, elapsed time). Task 086 implements it.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R15** — Streaming messages.
  - Before: (none)
  - After: WHILE a turn runs, its head is out of view and no permission or question card waits, the AI Agent Panel shall show at the end of the messages a working line with a loader mark, "Thinking…" while thinking streams, "Writing…" while reply text streams, else "Working…", and the elapsed time.
  - Reason: the head's label scrolls away with the turn's start; the boards' ClearStates draws this line, and Main, with the head in view, draws none.

## REMOVED requirements

None.

## Design and migration impact

DES-003 Turn, Events (`thinking`), Modules (`state/working-line`), Turn head
(the working line; the head's ring stops while a card waits); task 086. No
stored data changes.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-011-working-cue.md`, in task 086's commit.
