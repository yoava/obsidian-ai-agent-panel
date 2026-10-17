---
status: closed
release: r07-mock-fidelity
number: 084
prd: PRD-001.R19
---

# TASK-084 — The commands button's list closes at once

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Owner report (2026-10-13): clicking the composer's commands button opens the
command list and it closes at once; typing `/` keeps it open. S fix.

Cause: `TextareaSuggest` scheduled `close()` 150 ms after every textarea blur.
The button's mousedown blurs the textarea, its click refocuses it and opens the
list, and the pending close then ran.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R19 (the "/" button opens the command list);
[DES-003](../../../current/design/DES-003-panel-ui.md) Suggests.

Acceptance:

1. After a click on the commands button with the textarea focused, the list is
   still shown 200 ms later and until the textarea blurs for good.
2. The list still closes 150 ms after a blur that stays, and a mousedown on a
   row still picks it (the grace is kept).
3. The `@` list shares the behavior; its ranking, rendering and the button's
   look are unchanged.

## Scope

Expected files:

- New: `src/state/blur-close.ts`, `tests/state-blur-close.test.mjs`.
- Changed: `src/suggest.ts`, `package.json` (`pretest`),
  `docs/current/design/DES-003-panel-ui.md`, `RELEASE_NOTES.md`.

Negative scope: ranking, rendering, the button's look, `src/ui/composer.ts`.

## Plan

- Test first: `BlurClose` with a hand-driven timer host: closes after the
  delay; cancel on refocus; no close when the textarea holds focus as the
  timer fires; a second blur replaces the first.
- `BlurClose` (Obsidian-free, on `timers.ts`) replaces the bare
  `window.setTimeout`; `TextareaSuggest` cancels it on `focus` and checks when it fires
  that the textarea is its own document's `activeElement` and that document has
  focus (`holdsFocus`; pop-out windows, and a blur to another window still closes),
  scheduling on the textarea's window.
- Rejected: `preventDefault` on the button's mousedown (leaves any other
  control that returns focus within 150 ms broken).
- Verification: `make verify`; headless harness: click the button with the
  textarea focused, the list remains after 200 ms; the `@` list and a row
  click still work.

## Run log

- Base: the worktree sat on main; switched to `chore/agentic-sdlc`.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes. Its
headless harness (`hunt-084r/probe.mjs`) reproduced the bug before the fix and
showed it fixed after; the grace, a row click and the `@` list all work;
`make verify` exit 0. Findings:

1. The focus check ignored a window that lost focus, so the list stayed open
   after switching windows. Fixed: `holdsFocus` also requires
   `ownerDocument.hasFocus()`; test added.
2. Cancel the pending close on teardown. Not done: the suggests have no unload
   hook and adding one widens scope to `ui/composer`; a close firing after
   unload only touches the detached popup.
3. Release note to one line. Done.

## Outcome

Accepted.
