---
status: closed
release: r05-pre-redesign-fixes
number: 043
prd: PRD-001.R5
---

# TASK-043 — Restart after the old process closes

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Backlog item: a restart (effort, profile arguments, instructions, vault tools,
leaving Bypass) spawns the replacement while `ClaudeClient.stop` may leave the
old process up to 3 s before SIGKILL, so two processes run for one
conversation (`ClaudeSession.restartClient`).

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R5 (one CLI process per conversation; force-kill 3 s after the end) and R6
(resume after a process ends), PRD-002.R10 (leaving Bypass),
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(Session lifecycle, Restart on settings close).

Acceptance:

1. A restart spawns the replacement only after the process the plugin
   spawned for the old one (the CLI, or on Windows its cmd.exe or `wsl.exe`
   wrapper) has closed, or at its SIGKILL 3 s after the stop. A wrapper's CLI
   descendant may outlive that SIGKILL briefly (DES-002 limitation).
2. A send made during that wait is not written to the old process and not
   dropped: it goes to the replacement, in order and behind a pending branch
   rewind, and the session is busy meanwhile. A warm-up, panel command,
   restore preview, Stop or background-task Stop during the wait spawns
   nothing of its own; they reach the one replacement. A send, panel command,
   restore preview, Stop or background-task Stop after the replacement
   started reaches it after the turns still waiting behind the rewind.
3. Nothing the old process does after the restart reaches the session: its
   close reports no session end, its stream messages and handshake reply are
   dropped, its permission requests are denied and its MCP calls refused.
   Its prompts still open in the view are cancelled at the restart, and no
   answer (an Allow, a vault-tool reply) is written to it after `stop`.
4. A conversation that left Bypass runs no turn on the process launched with
   the bypass flag: the replacement is built from the config when it spawns,
   so a change made during the wait reaches it.
5. A mode or model switch the restart cut off reaches the replacement unless
   leaving Bypass or a newer pick superseded it; one answered by the old
   process counts only while no newer pick exists, and is then part of the
   config the replacement spawns with. A dropped switch returns false and the
   view stores it nowhere.
6. A tab closed during the wait starts no replacement.
7. A replacement that cannot spawn ends the waiting turns with the error,
   even when the view's callbacks throw; nothing is left as an unhandled
   rejection.

## Scope

Expected files:

- `src/protocol/client.ts` (`stop` returns when the process has closed or was
  killed), `src/session.ts` (`restartClient`, the wait, `send`, `deliver`,
  `warmUp`, `control`, `rewindFiles`, `interrupt`, `stopTask`, `switchLive`,
  `setModel`, the client callbacks), `src/view.ts` (`applyModel` stores no
  dropped pick)
- `tests/fake-cli.mjs` (`FAKE_CLI_SIGTERM_DELAY_MS`, `FAKE_CLI_HOLD_STDOUT_MS`,
  `FAKE_CLI_TALK_ON_SIGTERM`, `FAKE_CLI_INIT_DELAY_MS`, `stop_task`),
  `tests/session.test.mjs`
- `docs/current/design/DES-002-cli-client-and-session-lifecycle.md`,
  `docs/current/DEVELOPMENT.md` (session spec line), `docs/current/plan.md`,
  `RELEASE_NOTES.md`

Negative scope:

- PRD and ADR text; the 3 s grace itself.
- A message queued mid-turn that a post-turn restart loses (its own backlog
  item).
- Whether stopping the cmd.exe and `wsl.exe` wrappers ends the CLI behind
  them (DES-002 manual verification).
- A message sent mid-turn while leaving Bypass: it steers the running turn on
  the old process after `set_permission_mode` `default` (task 003).
- The view beyond `applyModel`: it sees the wait as a session with no running
  client.

## Plan

State machine of `ClaudeSession`'s process (`client`, `replacing`):

| State | `client` | `replacing` | Entered by | Left by |
| --- | --- | --- | --- | --- |
| None | null | null | creation; the current process closing (`onEnded`) | `send`, `control`, `rewindFiles`, `warmUp` spawning |
| Live | set | null | a spawn | the process closing (to None), `restartClient` (to Replacing), `dispose` |
| Replacing | null | the old client's stop, then the spawn | `restartClient` on a live client: an idle restart, a turn ending with a restart owed, a hold released, a send while a restart is held | the old process closing, or its SIGKILL 3 s after the stop |

- Entering Replacing: owed restarts cleared, the old client dropped as
  current (so its close is stale: no `onEnded`), `stop()` called, `onRestarted`
  reported.
- A non-current client reaches nothing: every client callback checks that
  its client is `this.client`; a permission request is denied and an MCP
  call refused. The session tracks the current client's open prompts and
  cancels them in `restartClient` through `onPermissionCancelled`, which the
  view already answers by settling the card as denied and dropping it from
  its pending map. `ClaudeClient.write` drops everything after `stop()`.
- `deliver` keeps `delivering` while turns wait behind a rewind: a later
  `deliver` chains behind it. `pending` is `replacing`, else `delivering`;
  `control` and `rewindFiles` (through `withClient`), `interrupt`, `stopTask`
  and `switchLive` loop `while (this.pending) await this.pending;` and then
  choose the client and write to it in the same step, so a restart cannot
  start between the last check and the write.
- In Replacing: `send` queues the turn and sets busy; `warmUp` does nothing;
  `control`, `rewindFiles`, `interrupt` and `stopTask` wait for the
  replacement; `respawn`
  finds no client, so a change to the config (effort, launch options, leaving
  Bypass, a mode or model switch, which with no process takes at once) is
  carried by the replacement's spawn. `switchLive` takes `newer` (a later
  pick of the same kind exists; model picks get a generation like mode
  picks): an answer from a non-current client, or a request the close cut
  off, is dropped and not resent when a newer pick exists. The catch awaits
  the replacement before looking for it, so it does not rely on the
  replacement spawning in fewer promise steps than the rejection takes.
- Leaving Replacing: `replacing` cleared first; disposed: nothing spawns and
  the queued turns are dropped; else the replacement spawns and `deliver`
  writes the queued turns in order, behind the pending rewind (`send` uses
  the same `deliver`), or with none `warmUp` spawns. A spawn that throws ends
  the waiting turns: busy off, then `onEnded(error)` in a `finally`; the
  `replacing` chain logs a throw to the console, so it never rejects.
- Bypass: no turn reaches the old process after `restartClient`, since
  `client` is null from then on; the replacement reads the config when it
  spawns, after every change made during the wait.
- `ClaudeClient.stop()` returns a promise resolved by the close or at the
  SIGKILL, so a process holding its pipes past SIGKILL cannot block a
  restart; repeated calls share it.

Tests first, in `session.test.mjs` against the fake CLI with a new
`FAKE_CLI_SIGTERM_DELAY_MS` (SIGTERM ends the process only after the delay;
a long one leaves it to SIGKILL) and `FAKE_CLI_HOLD_STDOUT_MS` (a child keeps
stdout open, so the close comes after the SIGKILL): the old pid is dead when
the replacement reports; a send during the wait runs on the replacement
without the bypass flag; a warm-up, a panel command, two sends and a Stop
during the wait reach one replacement; a process ignoring SIGTERM, whose close
comes late, delays the replacement until the SIGKILL, no longer; a tab closed
during the wait spawns nothing and reports no end; a replacement that cannot
spawn ends the waiting turn. The two switch-across-replacement tests are made
deterministic for both paths (answer before the close, close before the
answer).

Verification: `make verify`; independent review; by hand in a vault: change
the effort and send at once, then check with `ps` that one `claude` runs per
tab and the message is answered; send right after an effort change and press
Stop at once: the turn stops.

Rejected: creating the replacement client at once and starting its process
later (the client would buffer writes and requests, `running` would change
meaning for every caller, and a config change during the wait would need a
second restart); waiting in the view (the session would still spawn from
`warmUp`).

## Run log

- Tests first: against the old code the five PRD-001.R5 tests and the
  reworked PRD-001.R22 in-flight test failed, three runs of the full suite in
  a row. The fake installed its SIGTERM handler after its first report at
  first, so a test reacting to that report could kill it with the default
  handler and pass on the old code under load; it now installs it before.
- Mutations, each failing at least one test: no queue in `send`, no guard in
  `warmUp`, no wait in `control` or `interrupt`, no `disposed` check or busy
  off in `spawnReplacement`, a replacement spawned at once, and `stop` not
  resolving at the SIGKILL. An await plus `superseded` recheck in
  `switchLive`'s catch survived every test: the replacement always spawns
  before the rejection reaches the catch, so it was removed rather than kept
  as code no test can reach; the PRD-002.R8 in-flight test holds that order.
- Three existing tests encoded the synchronous spawn: one read `liveClient`
  right after a release (now after the replacement's handshake), and the two
  in-flight switch tests, whose replacement could now spawn before or after
  the answer (now one deterministic test per path).
- `session.test.mjs` takes 13 s instead of 3.5 s (the SIGKILL test and its
  stdout-holding child); the full suite's wall time is unchanged at 30 s.
- The Write and Edit tools are blocked outside the main checkout, so files
  were written through the shell. No protected path was touched.
- Review round 1 (independent review: no defect; Codex: request changes).
  Tests first, each failing on the staged code before the change: stale
  output from the old process (stream, permission, cancel, MCP; the fake
  writes them during its SIGTERM delay), a late handshake reply, an old
  model answer after a newer pick, an old Bypass answer after Ask was picked
  during the wait, a cut-off mode switch with a newer pick, `stopTask` during
  the wait, two waiting turns behind a pending rewind (they came out
  reversed), and throwing busy and end callbacks after a failed spawn (the
  end was skipped and the rejection unhandled). Two gap tests passed at once
  (a restore preview during the wait; a panel command then dispose).
- Mutations after round 1: each callback gate, both `newer` checks, the
  model generation, the `stopTask` wait, the ordered flush, the `finally`
  and the logging catch fail at least one test. The await in the catch
  survives, as before; it is kept on the reviewer's request, so the resend
  does not depend on promise-step ordering.
- `setModel` now returns a boolean, so `applyModel` in the view stores no
  dropped pick; that view line has no Node test.
- Review round 2 (Codex re-check: the seven resolved, two interleavings
  left). Tests first, each failing on the staged code: a send, and a Stop,
  made right after the replacement started overtook the turn queued behind
  the rewind; a prompt open at the restart stayed open and its answer was
  written to the stopping process. Mutations: the delivery chain in `send`,
  `settled()` waiting for it, the prompt cancel, the cleanup of answered
  prompts (a test added for it) and the write guard each fail a test. The
  write guard adds no behavior: `stop` already ends stdin, so a later write
  fails with write-after-end; it makes the rule explicit and testable.
- The chain also fixes two sends in a row while a branch rewind is pending
  outside a restart, which could swap before.
- Review round 3 (Codex: both fixes confirmed, one race left). Test first,
  failing on the staged code: a panel command issued just before a restart
  resumed after an await with nothing pending, missed the restart that
  started in that gap, and spawned a second process beside the closing one.
  A first fix (recheck, then `ensureClient`) still left a gap between
  choosing the client and writing to it, so the command went to the stopped
  client and failed; `withClient` now runs the write in the same step. A
  gap inserted before choosing the client, or between choosing and writing,
  fails the test.

## Independent review

A review agent, not the implementer; `make verify` passed; adversarial
tests and mutations in a scratch copy. No Defect. Gaps: a restore preview
and a tab closed during the wait were untested; the fake-CLI options were
undocumented; a Stop during the wait is only fake-verified (manual check
added). Nits: an unhandled rejection on the replacement chain; an implicit
one-microtask margin in `switchLive`; a stale DES-002 row. All fixed.

Codex cross-review, three rounds. Round 1: the old process's late stream
messages, answers and handshake could change the new state; a late model
or mode answer could overwrite a newer pick; `stopTask` was lost during the
wait; queued sends reordered behind a rewind; an unhandled rejection. Round
2: a send or Stop could overtake turns queued behind a rewind; a card
accepted before a restart could be answered to the old process. Round 3: a
panel command issued just before a restart could spawn a second process.
All fixed with tests that failed first. Documented limitations: a
steering message sent mid-turn while leaving Bypass runs in the running
turn after the mode switch; on Windows a killed `cmd.exe` or `wsl.exe`
wrapper may leave its CLI running briefly.

## Outcome

A restart now spawns the replacement only after the old process has
closed, or at its SIGKILL 3 s after the stop; sends, panel commands,
Stop, restore previews and mode or model picks made meanwhile reach the
replacement in order, and nothing the old process still reports or asks
reaches the session. Owed by hand in a vault: change the effort and send at
once, then confirm one `claude` process per tab; send right after an
effort change and press Stop at once: the turn stops.
