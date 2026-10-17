---
status: closed
release: r07-mock-fidelity
number: 104
prd: PRD-001.R38
---

# TASK-104 — A clear keeps the mode and model

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The CLI answers `/clear` in the same process and, as observed, keeps the model
and permission mode set at runtime. A CLI that does not would start the new
session in another mode than the user's, possibly a looser one. The clear now
compares what the new session's `system/init` reports with what the CLI ran
with before, sets the earlier values again, and falls back to a restart.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38 (the re-apply and restart clauses);
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Clear transaction.

Acceptance:

1. WHEN a clear completes and the new session reports a permission mode or
   model other than the ones in force in the CLI before the clear, the panel
   sends those again (`set_permission_mode`, `set_model`) to the running
   process. Models are compared through the aliases the CLI resolved.
2. Nothing is sent when the reports are equal, or either side did not report.
3. The panel's own Auto-approve policy (a CLI launched in `default`) is not
   touched and never sent.
4. The tab's sends stay held until the set-again settles.
5. A refusal, the process ending, or no answer within 15 s restarts the CLI
   with the conversation's mode and model flags, resuming the new session; the
   clear stays completed.
6. The session's launch config is unchanged by the set-again.

## Scope

Expected files: `src/state/clear-operation.ts` (`lostPicks`, the `reapplying`
phase), `src/tab/clear-flow.ts`, `src/session.ts` (`effective`, `reapply`),
`src/view.ts` (host wiring), `tests/fake-cli.mjs` (`FAKE_CLI_CLEAR_RESETS`, the
turn init reports the current model), `tests/state-clear-operation.test.mjs`,
`tests/tab-clear-flow.test.mjs`, `tests/session.test.mjs`, DES-002, DES-004
Mode state, SECURITY.md, `RELEASE_NOTES.md`.

Negative scope: UI (no new element or style), Undo, held clear, Stop and
clear, dimming, the picker and the launch flags, `resolvedModels` learning.
`src/tab/session-link.ts` gains only the `picking` getter: the session
already owns the config a restart reads. No board check (no rendering change).

## Plan

Tests first in the Obsidian-free machine: the comparison, the `reapplying`
phase and its three exits. The session tracks the mode and model the CLI runs
with from launch, init, status and accepted switches; the flow snapshots it at
`begin`. The re-apply goes out when the clear's acknowledging result arrives,
so the CLI is idle and the sends are already held.

Rejected: re-applying through `setPermissionMode` and `setModel` (they write
the launch config, pinning an alias to a resolved id); re-applying at the
commit init (the CLI is still answering the clear).

## Run log

- Base worktree sat on main; switched to `chore/agentic-sdlc`.
- The fake CLI's turn `init` named a fixed model, unlike its clear `init`;
  both now report the model in use, or every clear would look like a loss.

- Review rework (independent agent and Codex): the value to keep is the one
  in force at the reset plus later picks, not a snapshot at `begin`; every
  mode report until release is compared; a missing mode report fails closed;
  status and init do not adopt a mode into the tab or launch config while a
  clear is open; `reapply` checks its process after each await; a send that
  entered before the clear opened is held after `ensure()`. That re-check
  (`ChatTab.send`, imports `obsidian`) has no Node test (AGENTS.md section 8);
  manual evidence needed: in a vault, with a slow CLI start, press Enter and
  `/clear` in quick succession in a new tab and see the message sent only after
  the clear completes.

- Second rework: `reapply` writes nothing a bypass-leave or newer pick overtook;
  every status and init until release is compared in every phase; Default for
  the model is a pick; status and init stand aside only from the reset, and the
  tab takes the CLI's mode at release; a set-again shows no mode while a pick
  waits. The view wiring (`picking`, `released`, `resetSeen`) is tested through
  the flow's host; the view itself needs manual evidence.

## Independent review

Independent review agent, four rounds, and Codex, three rounds: approve. The
rounds narrowed the races around the set-again: the value to keep, reports
during the set-again, a newer pick or a bypass-leave overtaking `reapply`,
Bypass adopted from a status while the setting is off, a Default model pick
after a pinned one, and `released` after a restart. Final round: no path
loosens the mode or lets a send through before the picks are restored; a
mutation check showed the generation clause pinned by a test; `make verify`
exit 0. Open: the manual evidence above (send then `/clear` with a slow CLI
start; the tab showing the CLI's mode after a clear).

## Outcome

Done.
