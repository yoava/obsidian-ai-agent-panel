---
status: closed
release: r07-mock-fidelity
number: 107
prd: PRD-001.R38, PRD-002.R14, PRD-003.R1, PRD-003.R4
---

# TASK-107 — Undo of a `/clear`

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L, `feat`. The latest clear's divider offers "Undo" until a message to
Claude Code follows it.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38 (Undo clauses); PRD-002.R14 (Restore files returns after an Undo);
PRD-003.R1, R4; ADR-018 (session provenance);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Undo of a clear; [DES-003](../../../current/design/DES-003-panel-ui.md) Clear
divider; [DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Restore; [DES-005](../../../current/design/DES-005-persistence-and-sync.md).
Real-CLI evidence: `docs/records/verification/2026-10-13-real-cli-clear-undo.md`.

Acceptance:

1. The button is offered on the latest clear only, once complete, until a
   prompt, `/compact` or other message to Claude Code follows it, live and on
   reopen; never while another Undo is pending.
2. Disabled with the title "The cleared session is not available on this
   device" when the ended session is foreign.
3. The press starts a CLI beside the tab's, resuming the ended session, and
   asks for context usage; the tab's CLI is left as it is.
4. A parsed success makes it the tab's, stops the replaced one, removes the
   divider, dimming and clear record, stores the resumed id, and saves at
   once. The file version returns to 1 if no boundary record remains.
5. Sends are held until the Undo ends.
6. An error reply, an error result, an exit, no reply in 15 s, a CLI that
   cannot start, or a changed launch (profile, settings, mode, model, effort)
   stops that CLI, leaves tab, divider and record, and shows "Could not undo
   the clear."
7. Restore files returns on the turns the clear had cut off.

## Scope

Expected files: `src/state/{segments,clear-operation,clear-divider,event-view,turn,tab,boundary-records}.ts`,
`src/tab/{clear-flow,session-link,chat-tab,restore-branch}.ts`,
`src/{session,restore,view}.ts`, `src/protocol/client.ts`,
`src/ui/{event-divider,messages}.ts`, `styles.css`, `tests/fake-cli.mjs` and the
tests that cover them; DES-002, DES-003, DES-005, README, RELEASE_NOTES.

Negative scope: no new dependency or module (the layer table is unchanged); the
`/clear` command bubble stays after an Undo; no protected test is edited; the
real CLI is not driven.

## Plan

Reducer first (`reduceUndo`: begin, replied, failed, timeout, adopted, stop),
then eligibility from stored messages (`undoOffer`), the tab's `ClearFlow.undo`
over a fake host, `ClaudeSession.probe` and `adopt` over the fake CLI
(`FAKE_CLI_UNKNOWN_SESSION`, `FAKE_CLI_USAGE`), then the Obsidian-bound
wiring (`SessionLink.startUndo/adoptUndo`, the divider's button, the view).
Reuses the clear gate, the timer host and `fileVersion`. Rejected: adopting the
Undo's CLI on its `system/init` (a resumed CLI reports none before a turn, V1);
a single process restarted onto the ended session (loses the tab's CLI on
failure).

Verification: `make verify`; board check of ClearStates section 1 in dark and
light at 340, 440 and 600 px.

## Run log

- The fake CLI refused a context request from a resumed process before a turn;
  it now answers it, as the real CLI does (V1).
- Rework after Codex and the independent review: a pending mode or model
  pick blocks and fails an Undo; the unadopted CLI's MCP is limited to
  handshake and discovery; a launch-settings generation fails an Undo whose
  CLI path or WSL changed; no offer while the clear is open; blocked states
  show a reason; the hold survives a throwing callback and waits for the save;
  `startUndo` awaits `closing`; Compact is disabled while sends are held. The
  adoption decision is `mayAdopt` in `state/segments`. `SessionLink`
  (Obsidian-bound) has no Node test: the `closing` wait is verified by reading.
- Shell commands with heredocs were refused by the worktree guard; files were
  written with the editor tools.
- Round 3: `SessionLink.invalidateLaunch` bumps the generation of every tab
  synchronously, before the serial `relaunch` awaits, and only when
  `launchSignature` (settings-core: launch options plus each profile's CLI path,
  WSL, chrome, sandbox, extra args) differs from the view's last one, so opening
  Settings unchanged leaves an Undo alone. The view's `undone` starts the
  conversation save first and awaits it in `finally`, so a throwing
  presentation step cannot skip it. The sends are released when the save
  settles or after 5 s, whichever is first, and only their own hold. Tests:
  "a save that never settles releases the sends after 5 s", "a bound that fires
  after a settled save ...", `launchSignature` in `settings-core.test.mjs`.
  `SessionLink` and `view.ts` are Obsidian-bound: verified by reading. Limit:
  a CLI auto-detected anew (no settings change) does not bump the generation.

## Independent review

Independent review agent, three rounds, and Codex, three rounds: approve.
Rounds 1 and 2 closed a pending mode or model pick that could leave the
adopted CLI looser than the tab shows, vault-tool calls from the un-adopted
CLI, a CLI path or WSL change escaping the launch comparison, an Undo offered
while the clear was still open, a silent no-op when the tab was busy, a
stranded hold after a throw, and an overlapping retry. Round 3 closed later
tabs invalidated too late, a presentation throw skipping the save, a stalled
save holding sends, and an unchanged Settings close failing the Undo. Board
check at 440 px, dark and light: ready, foreign, pending and blocked states
match ClearStates section 1. `make verify` exit 0. Open: the blocked titles
need PRD-001.R38 wording (owner); manual checks in a vault: an Undo with a
pick pending, and Settings changed during an Undo.

## Outcome

Done.
