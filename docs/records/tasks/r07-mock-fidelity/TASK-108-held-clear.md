---
status: closed
release: r07-mock-fidelity
number: 108
prd: PRD-001.R38
---

# TASK-108 — Held clear

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A `/clear` sent while a turn runs is held instead of staying in the composer.
It shows as "Queued · clears when this turn ends" with Cancel and is written
after the turn's `result`. Messages sent behind it are held and sent in order
after the clear; Cancel releases them in order; permission cards stay
answerable.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38; [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Clear transaction; [DES-003](../../../current/design/DES-003-panel-ui.md)
Held messages, Send path.

Acceptance:

1. A `/clear` sent while a turn runs writes nothing and shows the dimmed
   bubble, "Queued · clears when this turn ends" and Cancel after the
   working line.
2. It is written once the turn's `result` is recorded; a message queued
   behind the turn defers it to that turn's end, or by 3 s if none starts.
3. Messages sent meanwhile, or behind an open clear or an Undo, are held with
   their images, each kept in order, and none is ignored.
4. Cancel drops the `/clear` and sends them in order, writing nothing.
5. A held `/clear` that finds an agent, a background task or a restore
   running is not written: the messages behind it return to the composer,
   in order with their images, with a note naming the cause; "/clear" returns
   only when nothing was held behind it and the composer is empty.
6. Closing the tab drops everything unsent.

## Scope

Expected files:

- Changed: `src/state/clear-operation.ts` (`reduceHold`),
  `src/state/clear-divider.ts` (`heldRows`, texts), `src/tab/clear-flow.ts`,
  `src/tab/chat-tab.ts` (send path split into hold and deliver), `src/ui/announcer.ts`, `src/view.ts`,
  `src/ui/messages.ts`, `src/state/cache-surfaces.ts` (comment), `styles.css`;
  `tests/state-clear-operation.test.mjs`, `tests/tab-clear-flow.test.mjs`,
  `tests/state-clear-divider.test.mjs`.
- New: `src/ui/held-tray.ts`, `src/tab/held-sends.ts`, `src/state/held-rows.ts`,
  `src/state/held-send.ts`, with `tests/state-held-rows.test.mjs`,
  `tests/state-held-send.test.mjs`, `tests/tab-held-sends.test.mjs`; `package.json`
  `pretest` lists the three.
- Docs: DES-001 (file map), DES-002, DES-003, `RELEASE_NOTES.md`.

Negative scope:

- Asking about running agents and Stop and clear (109); the interim no-op
  for agents and background tasks stays at send time.
- Protected tests and files; no new dependency; no real-CLI run.

## Plan

- Tests first: `reduceHold` (hold, fire, grace, cancel, stale timer);
  `ClearFlow` held clear and ordered sends over a rig host; `heldRows`.
- Held prompts live in the flow, drawn by `ui/held-tray` after the working
  line, not in the messages model, so no ordering glitch with the divider.
- Replay goes through the normal send path (`deliver`), one at a time.
- Verification: `make verify`; board check against ClearStates §2, dark and
  light at 340, 440 and 600 px.
- Rejected: a held prompt item in the messages model (reorders against the
  divider); writing `/clear` mid-turn (the CLI would run it as a queued turn).

## Run log

- Gate hit: the tooltips test allows no new `aria-label`; the tray group is
  unlabelled and the status lines carry the text.
- Open, for task 110 (real CLI, not run here): whether the `--replay-user-messages` echo of a message queued mid-turn arrives when the CLI picks it up or when it receives it; it sizes the 3 s grace.
- Open: the client cannot tell a steered message from a queued one, so a
  queued message defers the clear by a 3 s grace.

## Independent review

Independent review agent, three rounds: approve. Round 1 found a declined
clear sending its held messages into the old context, a throw at fire
stranding the queue, two tests asserting less than their names, the send
path untested in Node, the context block built at replay, announcements on
hidden live regions, the fire inside the result handler before an owed
restart, and a held delivery wiping an equal draft; all fixed. Round 2 found
the declined return splicing "/clear" into the composer (Enter then dropped
the held message) and the clamp showing part of a seventh line; fixed. Board
check at 440 px, dark and light: held, behind, declined and a long held
message match ClearStates section 2. `make verify` exit 0. Accepted: the 3 s
grace; the real-CLI timing of a queued message's echo is checked in task
110.

## Outcome

Done.
