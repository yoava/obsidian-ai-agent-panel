---
status: closed
release: r07-mock-fidelity
number: 119
prd: PRD-001.R38
---

# TASK-119 — A /clear keeps a permission mode known only from the handshake

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

With the default setting no mode flag is passed, so the CLI's configured mode
is known only from the initialize reply's `current_permission_mode`. That value
reached the display and the startup mode but not `ClaudeSession.effective`, so a
`/clear` sent as the first message of a process that has reported nothing else
had no mode to keep and `lostPicks` skipped it.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38; [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
Re-applied picks.

Acceptance:

1. A session launched with no mode takes the handshake's mode as its effective
   mode.
2. The handshake mode fills only an unset slot: it never replaces the launch's
   mode, a pick, or a `system/init` or `system/status` report, and an
   unrecognised value is not taken.
3. A clear whose target is a mode known only from the handshake sets it again
   when the new session reports none.

## Scope

Expected files: `src/session.ts` (`noteHandshakeMode`), `src/tab/session-link.ts`
(call behind the stale-pick guard), `tests/fake-cli.mjs` (scenario
`handshake-mode`), `tests/session.test.mjs`,
`tests/state-clear-operation.test.mjs`, DES-002.

Negative scope: no change to the display, the launch config or the startup
mode; no new mode.

## Plan

Tests first, then `noteHandshakeMode` (sets `inForce.permissionMode` only when
unset and no mode change happened since spawn), called from `onInitInfo` after
the existing guard. Verify with `make verify`.

## Run log

- Proof of failure: with the body of `noteHandshakeMode` neutralised, both new
  session tests fail ("a launch with no mode takes the mode the handshake
  reports", "the handshake mode never replaces ... a report"); restored, all pass.
- Round 2 (review): handshake Bypass taken only while the bypass setting is
  on; `reapply` never sends Bypass while it is off; the accepted modes come
  from `PERMISSION_MODES` in `protocol/types` (session may import only
  protocol); the report test made deterministic; DES-002 states both Bypass rules.
- Round 3 (Codex): a refused pick no longer blocks the handshake mode (the
  mode-generation check is gone; only an accepted pick or a report fills the
  slot first); `reapply` answers `{ modeSkipped }` and the clear never records a
  skipped Bypass as applied, its target following the CLI's report. Both new
  tests failed on the round 2 code first.
- `/clear` machinery already took any `inForce` mode as its target; the defect
  was only that the slot stayed empty.

## Independent review

An Opus review agent (not the implementer), three rounds, and Codex. Fixed: the mode list split the class from its doc comment and duplicated the protocol type (now PERMISSION_MODES); a CLI that started in Bypass with the panel's bypass setting off became the clear's target, and reapply sent set_permission_mode for Bypass (now never sent, answered as skipped, never recorded as applied); a refused pick kept the inherited mode out for good (only an accepted pick or a report fills the slot first); the report-first test was not deterministic; DES-002 states the rules. Final verdict: approve; `make verify` exit 0.

## Outcome

Done.
