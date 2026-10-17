---
status: closed
release: r07-mock-fidelity
number: 109
prd: PRD-001.R38
---

# TASK-109 — Stop and clear

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A `/clear` that meets running agents or background tasks, typed now or
released from the held messages, asks first. "Stop and clear" denies the
tab's open permission cards, stops each task, interrupts the CLI, and clears
once no turn runs and every task has been reported ended; "Cancel" changes
nothing. A failed stop leaves the context as it was.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38; [ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md)
Stop and clear (O2); [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Clear transaction; [DES-003](../../../current/design/DES-003-panel-ui.md)
Held messages, Popovers; [DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Permission round trip.

Acceptance:

1. The dialog is an `alertdialog` above the composer, in the tab's window:
   a warning icon and the title with counts, the body, "Cancel" (focused) and
   "Stop and clear". Escape, a click outside, a tab switch and unload answer
   no.
2. Pressing "Stop and clear" denies every open permission card and every
   request that comes until the stop ends; an answer to a denied card is
   dropped.
3. Each task is stopped before the CLI is interrupted; the interrupt is sent
   whether or not a turn runs.
4. The clear is written only when no turn runs and every task, including any
   started meanwhile, has ended by a status known to be terminal. A stop
   reply, an unknown status and a task missing from a list prove nothing.
5. Not quiet 15 s after the first stop, or the CLI exits: nothing is cleared,
   "Could not stop every agent, so the context was not cleared." shows, and
   the messages held behind the clear return to the composer unsent.
6. Closing the tab, a second `/clear` and Cancel each leave nothing running
   that was not already, and write nothing.
7. Typed `/clear` + Cancel leaves the text in the composer. A released held
   `/clear` + Cancel returns the messages behind it unsent, and "/clear" itself
   only when nothing was held behind it and the composer is empty
   (`returnsClear`).

## Scope

Expected files:

- New: `src/state/stop-operation.ts` (the machine), `src/state/clear-dialog.ts`
  (counts, title, words), `src/ui/popovers/clear-confirm.ts`,
  `tests/state-stop-operation.test.mjs`, `tests/state-clear-dialog.test.mjs`;
  `package.json` `pretest` lists the two state modules.
- Changed: `src/tab/clear-flow.ts`, `src/tab/chat-tab.ts`,
  `src/tab/permission-flow.ts` (`refuse`), `src/state/held-rows.ts`,
  `src/ui/popover-host.ts` and `src/ui/dom.ts` (`alert` content),
  `src/view.ts`, `styles.css`; `tests/tab-clear-flow.test.mjs`,
  `tests/tab-permission-flow.test.mjs`, `tests/state-held-rows.test.mjs`,
  `tests/fake-cli.mjs` (`FAKE_CLI_STOP`).
- Docs: DES-001 (file map), DES-002, DES-003, DES-004, `SECURITY.md`,
  `RELEASE_NOTES.md`.

Negative scope:

- The workflow wording of the body (change 003, not accepted); a workflow is
  stopped by its own `task_id`.
- Protected files and tests; no new dependency; no real-CLI run.

## Plan

- Tests first: the machine (every race), then the flow over a rig host and
  over the fake CLI.
- A separate `stop-operation` machine, not more cases in `clear-operation`:
  its state (task ids, a turn, a timer) shares nothing with the clear's.
- The dialog is the popover host's content with an `alert` flag, so focus,
  Escape, outside click and tab change reuse its machine.
- Rejected: counting a stop reply as an end (ADR-018); a bypass of the
  dialog for a held `/clear` (its tasks may have changed).
- Verification: `make verify`; board check against ClearStates section 3,
  dark and light at 340, 440 and 600 px.

## Run log

- Gate hit: the architecture test allows the popover root class and geometry
  reads only in the hosts, so the dialog is host content, not its own
  component.
- Open: the stream marks no task's owner, so the title counts the tab's task
  list at the ask; tasks first seen during the stop are waited for, not
  counted.

## Independent review

An Opus review agent (not the implementer) and Codex, four rounds. Fixed: a CLI exit read as a finished stop; a task, turn or queued message starting between the last terminal status and the clear (a final look keeps the stop and the deny-all on until the clear is sent); throws failing open; the stop seeded from the run bar instead of a per-process terminal-status ledger (now a Map, kept across failed stops, reset on exit and Undo adoption); permission answers bound to the card key; a second question hanging; a hidden tab's question deferred to when it is shown; a deferred yes with nothing left taking the plain /clear route; one denial message; duplicated task parsing; a live test writing into the repo. Kept: a task a listing only omits stays unfinished (omission is no proof, real-CLI V4). Final verdict: approve; `make verify` exit 0, 1697 tests. Screens: ClearStates section 3 matched at 340, 440 and 600 px, dark and light; the workflow name waits for change 003.

## Outcome

Done.
