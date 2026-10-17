---
status: closed
release: r07-mock-fidelity
number: 086
prd: PRD-001.R15
---

# TASK-086 — A working cue whenever Claude works

## Spec

Owner reports 2026-10-13: no cue in the conversation while Claude works,
"sometimes it shows thinking / working, but not always"; and the boards'
"Claude working" text and animation are wanted. Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R15,
with the clause [change 011](../../changes/CHG-011-working-cue.md) adds;
[DES-003](../../../current/design/DES-003-panel-ui.md) Turn, Turn head;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) (tokens,
reduced motion); boards ClearStates "Sent while Claude works" (SPEC §4.19),
Main (SPEC §2 Assistant turn, §4.1).

Acceptance:

1. While the tab's activity is working or writing and the running turn's
   head is out of view (under the pinned prompt counts as out), the last
   child of the messages list is a working line: a 22 px accent-soft tile
   holding a 12 px loader, "Working…", "Thinking…" (a thinking block streams)
   or "Writing…" (12.5 px, muted), the turn's elapsed time as "0:42" (11 px
   mono, faint) right, a 12 px section gap above it at every width; every
   busy interval of the Phase A list shows the head or the line.
2. Waiting and idle: the line is hidden; the head reads "Waiting for you"
   and its mark does not ring. Head in view: no line, as on Main.
3. Motion: the loader spins 1 s linear, the head mark rings 1.6 s, the step
   dots pulse 1.2 s (0/.2/.4 s); none animates under reduced motion.
4. No new live region; the turn's announcements are unchanged.
5. `tests/state-working-line.test.mjs` covers the label, the clock, the
   hiding and `headRings`.

## Scope

Expected files: `src/state/working-line.ts` (new),
`tests/state-working-line.test.mjs` (new), `package.json` (pretest),
`src/ui/working-line.ts` (new), `src/ui/messages.ts`, `src/ui/turn.ts`,
`src/ui/prompt.ts` (`pinBand`), `src/view.ts` (`relayout` on settings and layout), `src/tab/chat-tab.ts` (`thinking` and its
event, `workingHeadId`), `src/state/tab.ts`
(`TabEvent`), `styles.css`, `docs/current/product/PRD-001-chat-panel-and-sessions.md`,
`docs/work/changes/CHG-011-working-cue.md`, `docs/current/design/DES-003-panel-ui.md`,
`README.md`, `RELEASE_NOTES.md`.

Negative scope: the composer, status line, run bar (change 003), compaction
markers (change 002), tab dots; `tests/styles.test.mjs`,
`tests/architecture.test.mjs`; a cue between a `result` and the CLI taking up
a queued message (the panel is not told the CLI is busy then).

## Plan

Phase A in the headless harness (fake CLI turns, motion on and reduced),
probing which cues are visible inside the messages in each busy interval:

| Interval | Before | Cause |
| --- | --- | --- |
| Before the first stream event | head "Working", ring | — (head in view at the start) |
| Between a tool result and the next output | nothing | the head label is the only state text and sits at the turn's start (`src/ui/turn.ts` drawHead); done rows carry no mark |
| Thinking, head off screen | in-place "Thinking…" toggle only, no motion | as above |
| Long streamed reply, head off screen | caret only | as above |
| Turn taken up from a queued message | head of the new turn | — (a head opens at the end) |
| Subagent running | agent row spinner | — while the row is in view |
| Card answered, turn resuming | the call's row dots, then nothing | as above |
| Compaction mid-turn | nothing | `system/status` compacting is not drawn (change 002 draft) and the head is off screen |
| Tab switched away and back | step row dots | — while the row is in view |
| Reopen mid-turn | not a busy interval: a reopen of an open conversation selects its live tab; a reopened file runs no turn |

The head's ring and the step dots already existed and match the boards; under
reduced motion (the harness's default, and the OS setting on Linux when
animations are off) none animate. Why the owner saw no cue: the head scrolls
away.

Fix: `state/working-line` (label, elapsed, `headRings`, hidden while the
head is in view), drawn by `ui/working-line` as the messages list's last
child, following `activity`, `thinking` (new `tab/chat-tab` event), `turn`
and the messages' item changes, ticking on the shared ticker, and watching
the running turn's head with one `IntersectionObserver` from the head's
window, its top margin the pinned prompt's height. The head's ring keys on `is-working` on the head instead of the turn's
`is-running`, so it stops while a card waits. The line's elapsed time reads
as the ClearStates board's clock ("0:42", `formatClock`) and the head keeps
Main's "18s" (boards win, the owner's mock-fidelity rule).
Rejected: the line inside the last turn item (a report or `!` card added
mid-turn ends the list after the turn); a "thinking" activity (would change
the composer, status line and tab dots).

## Run log

- Writes to the scratchpad were refused (protected-path hook for Write; the
  worktree guard for Bash heredocs with `>` or arrows), so the harness
  scripts live in the gitignored `tmp/hunt-086/` and `tmp/hunt-086r/` of the
  worktree, renamed `*.off` so ESLint skips them.
- Hiding the line while the head is in view first counted a head under the
  pinned prompt as visible (S3, S8 showed no cue); the observer's top margin
  now subtracts the pin.
- The harness probe reads the DOM before the observer's first report (one
  frame); the screenshots taken right after show the line.

## Independent review

Independent review agent: approved with changes. All ten intervals, the
board pairs (dark and light), reduced motion, no live-region chatter, scroll
stability and tick cost passed. Findings, all fixed:

- Major: the line duplicated the head while the head was on screen (Main
  has no line; two clocks, "Thinking…" twice). The line now hides while the
  running turn's head is in view (`headInView`, tested), watched by one
  `IntersectionObserver` per head from its own window, disconnected at turn
  close and unload.
- The gap above the line was 12 px only at medium width; the two width
  breakpoints now subtract the list's 18 px and 26 px gaps (measured 12 px at
  340, 440 and 600 px).
- Order next to a queued prompt kept (below it, where the continuation
  draws) and recorded in DES-003.
- Nits: labels end with "…" as on the board; README notes the ring stops
  while a card waits; the PRD clause says "a loader mark".

Re-verified with the reviewer's `review.mjs`, `scroll.mjs`, `ring.mjs`,
`restart.mjs`, `pair.mjs` and `scen.mjs` (dark and light, motion and
reduced) plus `headleave.mjs`: the line hides with the head on screen,
appears as it leaves with the view following, and no scroll jump when
scrolled up.

Re-review: do not land, one blocker, fixed. Back on a tab whose head had
scrolled away while it was hidden (output arriving, or a queued turn taken
up), the line stayed hidden: the hidden tab's reports were ignored and the
observer reported nothing new on show. The line now watches the head afresh
(`headWatch`, tested), re-measuring the pin, when the tab shows, when the
settings or the layout change, and when it moves window. Re-verified with the
reviewer's `rv-io.mjs` (A pin band and scroll back, B queued turn taken up
while hidden, C no flash on tab switch, D output while hidden: line shown on
return), `rv-review`, `rv-scroll`, `rv-ring`, `rv-restart`, `rv-pair`,
`rv-approve` and `rv-scen` (every busy interval shows the head or the line).

Second re-review of the fix: land (`reverify2/`). Scenarios A to F pass,
including both switch-away cases, Pin prompt toggled mid-turn, and at most one
live observer across 3 turns and 5 tab switches. Minor, accepted: the
observer keeps watching a closed turn's head until the next turn, tab show or
unload; DES-003 now says so.

## Outcome

accepted
