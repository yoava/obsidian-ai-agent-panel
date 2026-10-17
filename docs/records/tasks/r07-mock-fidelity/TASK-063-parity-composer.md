---
status: closed
release: r07-mock-fidelity
number: 063
prd: PRD-001.R11, PRD-001.R30
---

# TASK-063 — Composer, status line and sub-bar match the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Parity survey items CS1–CS13 and CS15–CS18 against the "Redesign dark" and
"Redesign light" boards. Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R11
(waiting state), R30 (one-line form);
[DES-003](../../../current/design/DES-003-panel-ui.md) Composer, Composer
state, Token contract; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md).

Acceptance:

1. The composer card carries the `--shadow` token; while it holds focus it adds
   a 3 px accent-soft ring (CS1, CS2).
2. The textarea is two lines (40.5 px; card 130.5 px), no resize grip, radius 0 (CS3, CS4).
3. A tab waiting for a card marks the card `is-waiting`: fill, border and
   children at 0.92 opacity (CS5).
4. At most 640 px tall, a note chip is not cut at 9 em (CS6).
5. Paperclip, slash and stop icons are 14 px; lucide icons on icon buttons, the
   status line and the changes chip stroke 1.8; Send strokes 2.2 (CS7, CS8, CS10).
6. The commands button is active (accent-soft fill, accent-text icon) while the
   slash list shows (CS9).
7. Status icons are 12 px (ring 13 px) and muted, the model's accent; the model
   label is in `--text` (CS11–CS13).
8. At most 359 px wide the context segment keeps its percentage; icon-only
   segments are 26 px wide (CS15, CS16).
9. The changes chip has a 1 px line-strong ring and a 12 px icon (CS17, CS18).

## Scope

Expected files: `styles.css`, `src/state/composer.ts` (`waiting`),
`src/ui/composer.ts`, `src/suggest.ts` (`onShownChange`),
`tests/state-composer.test.mjs`, DES-003, `RELEASE_NOTES.md`.

Negative scope: the cache indicator (CS14, change 002), the tab strip (059),
placeholder text, send and stop behaviour, popovers (064).

## Plan

CSS for CS1–CS4, CS6–CS8, CS10–CS13, CS15–CS18; the `waiting` field of
`composerView` (test first) and a shown-change hook on the suggest for CS5 and
CS9. New token `--ai-agent-panel-icon-stroke` (geometry, no palette change).
Rejected: `opacity: .92` on the card itself, which starts a stacking context and
traps the suggest lists (tests/layers.test.mjs); the fill, border and every
child but the lists fade instead.

## Run log

- First `make verify` failed `layers.test.mjs` on `.is-waiting { opacity }`;
  reworked as above, then exit 0 (`scratchpad/verify-063.log`).
- Evidence in `harness/hunt-063/final/`: `<Board>-<dark|light>.png` pairs for
  Main, Approve, Empty, Short, Narrow, Medium, Commands, and `measured.json`
  (panel values per board).
- Measured after: textarea 394 x 40.5, card 130.5; shadow `0 18 40 / 0 2 8`
  (+ 3 px ring in the harness, which focuses the card); icons 14 px (paperclip,
  slash, stop) stroke 1.8, Send 16 px stroke 2.2; status icons 12 px, ring 13,
  model icon accent-text, others muted, model text 237,237,240; Narrow context
  52.7 wide with the percentage, effort/permission 26; changes chip ring
  `inset 0 0 0 1px` line-strong, icon 12 px; Commands: slash button `is-active`.
- CS6: the chip no longer cuts ("Q4 planning.md" whole) but is 126 px against
  the board's 121.5 (chip padding, not part of this item).
- CS5: the card's own `opacity` is 1 by design (see Plan); the dimming is the
  fill, border and children.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

Findings and resolution:

1. Major: the footer is `display: contents`, so opacity on it dims nothing.
   Fixed: the rule targets `.is-waiting > :not(.suggest, .footer)` and
   `.is-waiting > .footer > *`; the harness shows attach, commands, stop and
   send computing 0.92 in Approve and Question, dark and light, and 1 elsewhere.
2. The changes-chip ring uses `var(--ai-agent-panel-shadow-ring)
   var(--ai-agent-panel-line-strong)`; the chip left the shared hover
   `box-shadow: none` rule (only Transcript keeps it). Fixed.
3. `sendDimmed` always equalled `waiting`: one field, `waiting`, drives
   `is-dimmed` on Send and `is-waiting` on the card; tests updated. Fixed.
4. Recorded: the `onShownChange` hook is DOM wiring in an obsidian-importing
   file, checked by hand in the harness (open, Esc, pick, blur, double click);
   `iconButton`'s 1.8 stroke also reaches the report view's icons; a focused
   waiting card keeps its full accent ring (the board shows no such state).
   Accepted.
5. Double blank line removed. Fixed.

The Stop icon stays as is (a later task).

## Outcome

accepted
