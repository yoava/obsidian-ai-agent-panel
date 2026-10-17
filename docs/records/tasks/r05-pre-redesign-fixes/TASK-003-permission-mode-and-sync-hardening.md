---
status: closed
release: r05-pre-redesign-fixes
number: 003
prd: PRD-001.R24, PRD-002.R6, PRD-002.R8, PRD-002.R9, PRD-002.R10
---

# TASK-003 — Permission mode and sync hardening

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A synced or edited `data.json` could start new tabs in Bypass and set the
security settings on every device; Auto-approve answered requests Claude Code
escalated, could allow an edit before its diff's read, and reopened without
asking; turning bypass off left open conversations in Bypass.

Governing:
[ADR-002](../../../current/adr/ADR-002-permission-prompts-cli-decides-panel-asks.md),
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md),
PRD-001.R24, PRD-002.R6, R8, R9, R10,
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Permission round trip, Mode state, D4),
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) (Load,
Save), [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(Session lifecycle, Restart on settings close), constitution *Consent first*.

Acceptance:

1. Settings load: a `defaultPermissionMode` other than `default`,
   `acceptEdits`, `plan`, `auto` becomes `default`; a new tab never starts in
   Bypass.
2. CLI profiles and the five security settings (default permission mode,
   bypass, vault instructions, `!` escape, vault tools) are device-local by
   default. `localGroups` is stored on the device only; without a device list,
   a `data.json` list adds local units to the defaults, never removes one.
   Local security settings are never seeded from `data.json`; a wrong-typed
   security value falls back to its default.
3. A reopened conversation stored in `auto` applies it only after the user
   confirms a dialog, asked on reopen, or when a tab restored at view open is
   first shown; no dialog when the tab is already in `auto`; keeping changes
   neither tab nor file. Stored Bypass applies only while the bypass setting
   is on; an unknown stored mode is ignored.
4. `PermissionRequest` carries `decisionReasonType`, `decisionReason`,
   `requiresUserInteraction`, type-checked. In Auto-approve a request with
   `rule` or `hook`, or `requiresUserInteraction`, gets the card; others are
   allowed without one; AskUserQuestion keeps its form.
5. In Auto-approve an Edit, Write or MultiEdit is allowed, with or without
   its card, only after its pre-edit read settled (the one started at
   `tool_use`, else one started from the request's input), at most 5 s; a
   failed or late read still allows, and a late result does not hold the answer; the
   card's buttons are disabled while Allow waits. In other modes a card's
   Allow answers at once (PRD-002.R1). Every edit card's diff is that one
   read; Deny answers at once.
6. When the settings close with bypass off: a tab in Bypass switches to Ask as
   a pick, stored on the conversation; every tab's session drops the bypass
   flag, before the profile and CLI skips; a running turn gets
   `set_permission_mode default` at once and the process restarts after it.
   A mode switch sent before then is dropped when answered. With bypass on,
   open sessions restart with the flag.
7. Settings saves run one at a time, the queued one splitting the latest
   state; no save starts beside it.
8. Mode switches: the CLI's answers come in order, so the last accepted one
   is the session's mode; a refused latest pick goes back to the mode last
   accepted, not to an earlier pick still waiting.

Owner decisions taken for this task (end-of-work list):

- D1. Bypass off drops the flag from every tab's CLI, not only tabs in
  Bypass. Instructions and the vault-tools switch reaching open
  conversations (PRD-001.R25) stay a backlog item.
- D2. Leaving Bypass runs before DES-002's skips; DES-002 reordered.
- D3. The switch happens when the settings close, as DES-002 and DES-004 say.
- D4. Validation covers the default permission mode and the types of the
  five security settings; ADR-009's check of every other key is a backlog
  item.
- D5. The reopen confirmation is an Obsidian modal, `ConfirmModal`, shared
  with the delete dialog; declining leaves the file unchanged, so it asks
  again on the next reopen; no dialog when the tab is already in Auto-approve;
  keeping leaves `selectedMode` and `inheritMode` as they were; the dialog
  focuses "Keep current mode", so Enter does not switch.
- D6. The flag rule follows ADR-002 (`rule`, `hook`,
  `requires_user_interaction`); `safetyCheck` is a backlog item for ADR-002.
- D7. ADR-009 as accepted: the five start at their defaults once per device,
  and vault instructions held in `data.json` leave it at the first save; the
  release notes say so.
- D8. The legacy `model` key in `LEGACY_UNIT_KEYS` stays its own backlog item.
- D9. The pure functions sit in `settings-core` (DES-004 D4); `isEdit` is
  passed in, since `settings-core` may not import `edits` (DES-005 E1).
- D10. The 5 s bound on the Auto-approve answer deviates from PRD-002.R6's
  literal "only after that call's read has finished"; recommend amending R6
  to "or after 5 s, whichever is first" (backlog item).
- D11. The `cli` unit is still seeded from `data.json` on a device without
  its own profiles, so a synced file can still choose the CLI path or extra
  arguments there; behavior unchanged here, README and SECURITY.md say so.
  Recommend never seeding `cli`, since auto-detect covers a new device
  (backlog item).

## Scope

Expected files:

- `src/settings-core.ts` (`validDefaultPermissionMode`, `reopenMode`,
  `permissionDecision`, `allowAfterRead`, `settingsFromStores`, security
  units, `splitSettings`, `normalizeSettings`), `src/settings.ts`
  (re-exports), `src/main.ts` (`loadSettings`, `saveSettings`),
  `src/save-queue.ts` (new), `src/timers.ts` (`withDeadline`),
  `src/settings.ts` (dropdown typed by `DEFAULT_MODE_CHOICES`, sync badge
  read at click time)
- `src/protocol/types.ts`, `src/protocol/client.ts` (decision-reason fields)
- `src/session.ts` (`setLaunchOptions`, `leaveBypass`, mode generation)
- `src/view.ts` (`addTab`, reopen and its confirmation, permission decision,
  pre-edit read, bypass off at settings close), `src/confirm-modal.ts` (new),
  `src/history.ts` (delete dialog on `ConfirmModal`)
- `tests/settings-core.test.mjs`, `tests/protocol.test.mjs`,
  `tests/fake-cli.mjs` (`permission-flagged`, `permission-bad-reason`,
  `permission-unflagged`, `FAKE_CLI_MODE_DELAY_MS`, `FAKE_CLI_REFUSE_MODE`), `tests/session.test.mjs`,
  `tests/timers.test.mjs`, `tests/save-queue.test.mjs` (new), `package.json`
  (`pretest` gains `src/session.ts`, `src/timers.ts`, `src/save-queue.ts`)
- `README.md`, `docs/current/SECURITY.md`, `docs/current/DEVELOPMENT.md`,
  `docs/current/plan.md`, `RELEASE_NOTES.md`; DES-001 (components),
  DES-002, DES-004, DES-005, the DES-003 draft where they disagree with the
  code

Negative scope:

- Vault instructions and vault tools reaching open conversations
  (PRD-001.R25): backlog.
- Validation of settings other than the default mode and the five: backlog.
- `safetyCheck` under Auto-approve: backlog (ADR-002).
- The legacy `model` unit key, subagent edits in the change list
  (PRD-002.R7), the other confirmed defects: tasks 004 onward.
- What the mode menu offers, `shownMode`, `noteCliMode`, branch: unchanged.
- A real-CLI run: only with the owner's approval.

## Plan

- Tests first: `settings-core` tests for the loader, the security defaults
  and validation, `reopenMode`, `permissionDecision`, `allowAfterRead`;
  protocol tests for the decision-reason fields (two new fake-CLI scenarios)
  and the bypass flag; `session` tests against the fake CLI for
  `setLaunchOptions` and `leaveBypass`.
- One loader, `settingsFromStores`, so `main` and the tests run the same
  code (the test helper used to copy `main`).
- The view only wires the pure decisions (DES-004 D4).
- Verification: `make verify`; independent review agent; Codex
  cross-review. By hand in a vault, deferred to the owner's end-of-work test
  pass, so no verification record yet: the escalated card, the reopen dialog
  (row, picker, restored tab), the awaited read and the disabled buttons,
  bypass off and on at settings close, the sync badge clicked twice.
- Rejected: a `security` list separate from `SYNC_UNITS` (a second list to
  keep in step); the CLI's `safetyCheck` as a flag (not in ADR-002).

## Run log

- Tests first: `settings-core.test.mjs` failed at import (the new exports),
  the decision-reason test and the five `session` tests failed; the bypass
  flag and wrong-type tests passed already (the flag existed; the fields were
  not parsed at all).
- Five existing settings tests changed with the design: the default-local
  set, the list moving to the device, the seeding exception.
- `make verify`'s ESLint step also lints other agents' worktrees under
  `.claude/worktrees/`, which fail; ESLint on this tree alone is clean.
- Codex fixes, tests first: 12 tests failed before the fixes (the save
  queue, the two superseded-switch tests, the flagged-edit decision and
  wait, the deadline tests); "turning bypass on reaches a running session"
  passed already, since the gap was the view not passing the flag.
- The card's diff used to read the file a second time; it now shows the one
  pre-edit read, in every mode.
- Round 2 fixes, tests first: the `false` interaction flag, the late-save
  gap, the two pick-order tests and the `allowResult` and prototype-key
  tests failed before the fixes; the `leaveBypass(false)` and
  pick-after-leaving-Bypass tests guard mutants and passed. Removing the
  `++` from `setPermissionMode` fails three session tests.
- The manual vault checks are deferred to the owner's end-of-work test pass.

## Codex cross-review

Codex CLI, read-only, not the implementer, on the uncommitted change:

1. Defect: a flagged edit under Auto-approve, answered from its card, did not
   wait for the pre-edit read, and the card's diff read the file again. Fixed:
   one shared read feeds the diff; Allow and Always allow wait for it; Deny
   does not.
2. Defect: concurrent settings saves could write an older device-local list
   last. Fixed: `serializeSaves` runs one save at a time and the queued one
   splits the current state.
3. Defect: a mode switch answered after leaving Bypass could put Bypass back
   in the session config and the conversation. Fixed: a generation count on
   the session and on the tab drops a superseded switch.
4. Defect: a pre-edit read that never settled hung the permission answer.
   Fixed: `withDeadline`, 5 s, then the read counts as failed and a late
   result is ignored (DES-004).
5. Defect: turning bypass on did not reach open sessions (PRD-001.R25).
   Fixed: the settings-close restart passes `allowBypassPermissions` from the
   setting.

Round 2, on the fixes: findings 1, 4 and 5 verified fixed; 2 not fully (its
finding 1), 3 partly (its finding 2).

1. High: the save queue could still run two writes at once. Fixed
   (independent review 1).
2. Medium: a refused latest pick could restore an earlier pick never
   committed. Fixed (independent review 2).
3. Low: `requires_user_interaction: false` was dropped. Fixed: carried
   whenever it is a boolean; test added.

## Independent review

Round 1: a review agent, not the implementer; interrupted by an API limit
before it reported.

Round 2: a review agent, not the implementer; `make verify` passed. Findings,
with Codex round 2 where both raised one:

1. Defect: a save called in the gap after the running write settled could
   start beside the queued one. Fixed: `serializeSaves` is a drain loop that
   claims the queued save in the step that settles the last.
2. Defect: any newer pick dropped an accepted switch, and a refused latest
   pick restored an earlier pick's optimistic state. Fixed: only leaving
   Bypass drops a switch (`leftBypassAt`); a refused latest pick goes back
   to `confirmedMode`.
3. Defect: edit cards in every mode waited for the read, against PRD-002.R1.
   Fixed: only in Auto-approve; `editPreImages` keeps the raw read; the 5 s
   bound applies to the Auto-approve answer only; buttons disabled while
   Allow waits. D10 for the owner.
4. Stale claim: README and SECURITY.md said a synced file cannot widen what
   another device runs, but CLI profiles still seed. Fixed: both corrected;
   D11 and a backlog item.
5. Test gap: `leaveBypass(false)` on a session without the flag. Fixed: test
   added.
6. Test gap: prototype keys in either store. Fixed: test added; the loader
   copies own keys without `__proto__`, `constructor`, `prototype`.
7. Gap: the manual vault checks were not stated as deferred. Fixed: Plan
   and Run log.
8. Stale claim: DES-005 cites `isSafeArgValue`, which does not exist. Kept
   the design; backlog item for PRD-003.R4.
9. Stale text: README said only turning bypass off reaches running
   conversations. Fixed.
10. Stale references: plan.md line numbers in `history.ts`,
    `settings-core.ts`, `session.ts`. Fixed: symbol names.
11. Nits: SECURITY.md wrap, the DES-005 R24 row order, DES-001's R24 and
    PRD-002 rows, DES-004's `permissionDecision` signature. Fixed.
12. Duplication: the allow result built in three places. Fixed:
    `allowResult`.
13. Duplication: the mode lists in `settings-core`, `view` and `settings`.
    Fixed: `DEFAULT_MODE_CHOICES` and `MENU_MODES` exported; `MODE_LABELS`
    and `DEFAULT_MODE_LABELS` are records keyed by them.
14. Defect: the sync badge flipped from the state drawn, so two quick clicks
    could leave a security unit synced. Fixed: read at click time.

## Outcome
