---
status: closed
release: r07-mock-fidelity
number: 112
prd: PRD-001.R15
---

# TASK-112 — The working cue at the live end of the stream

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Owner report 2026-10-14: the working animation sits at the reply's start (the
head), so as output grows it moves up and goes unnoticed or off screen. Task 086
showed the working line only once an `IntersectionObserver` reported the head
out of view; the head's ring was the cue until then.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R15 with [change 014](../../changes/CHG-014-working-cue-live-end.md); [DES-003](../../../current/design/DES-003-panel-ui.md) Turn;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) (reduced
motion). The boards do not settle the place during a long reply: Main rings
the head, ClearStates "Sent while Claude works" draws the line at the end. The
live end is chosen so the cue follows the output.

Acceptance:

1. While the activity is working or writing, the working line (loader, label,
   clock) is the messages' last child and shown, whether or not the head is in
   view; it follows the output while the view is at the bottom.
2. One moving cue: the head's mark stays still while the working line shows,
   which is from the send on. While a card waits, neither the working line nor
   the head moves (a step row's dots may still pulse; unchanged).
3. Under reduced motion nothing animates (ADR-017).
4. `tests/state-working-line.test.mjs` covers the line without head input and
   `headRings`.

## Scope

Expected files: `src/state/working-line.ts`, `src/ui/working-line.ts`,
`src/ui/messages.ts`, `src/ui/turn.ts`, `src/ui/prompt.ts` and `src/view.ts`
(observer plumbing removed: `liveHead`, `coveredTop`, `relayout`, `pinBand`,
`TurnView.head`), `src/tab/chat-tab.ts` (`workingHeadId` removed),
`tests/state-working-line.test.mjs`, DES-003, PRD-001 R15 wording, `README.md`,
`RELEASE_NOTES.md`.

Negative scope: the composer, status line, queue semantics, the head's state
text and clock, `styles.css`, `tests/styles.test.mjs`,
`tests/architecture.test.mjs`, protected paths.

## Plan

Drop the head observation entirely (`headWatch`, `headInView`, the observer,
the pin-band measurement): the line keys on `activity` alone. `headRings`
narrows to running with activity idle. Rejected: keeping the observer and
showing the line also while the head is in view (two cues; the observer is
the fragile part); moving the line into the last turn item (a report or `!`
card added mid-turn ends the list after the turn).

Verify: `make verify`; r07 harness at 440 px dark and light with a long
streaming reply, screenshots in the scratchpad `r112/`.

## Run log

- The first diagnosis (queued prompts hide the line) did not reproduce; the
  owner's reproduction showed the cue at the head only.

## Independent review

Independent review agent: code approved; docs reworked. The head mark never
rings in practice (the send sets busy before a paint, so the line shows from
the send on); every claim of a ring before the first answer was rewritten, and
task 086's unreleased note was rewritten in place instead of adding a fix.
Checked at 440 px, dark and light: the line stays last through a tool turn, a
queued send, a waiting card, a tab switch and a long stream; one moving cue;
auto-scroll follows at the bottom and holds when scrolled up; no observer or
listener left; reduced motion; no new live region. `make verify` exit 0.
Accepted: the Main board's head ring is not drawn; two static clocks while
the head is in view; a tool row's dots pulse as before.

## Outcome

Done.
