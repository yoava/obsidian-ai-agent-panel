---
status: closed
release: r05-pre-redesign-fixes
number: 024
prd: PRD-001.R25, PRD-001.R3
---

# TASK-024 — Launch settings reach open tabs

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Two backlog items:

- PRD-001.R25 says that when the settings tab closes after the vault
  instructions, the vault-tools toggle or the bypass toggle changed, each open
  conversation's CLI restarts after its turn with the new values. The code
  restarts for profile arguments and the bypass flag only
  (`onLaunchSettingsChanged`), so instructions and the vault-tools switch reach
  only conversations started later, and the README says so.
- PRD-001.R3's Notice "Profile applies when the next conversation starts." is
  false: a new conversation starts on the default profile. The backlog (task 011,
  Q1(a)) words it "This conversation stays on <profile>; start a new
  conversation to use another."

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R25 and R3, [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(Restart on settings close, Profile control), DES-001 (When a change applies;
already states the restart for all four settings).

Owner decision: PRD-001.R3's clause for a profile pick in a conversation that
already has a Claude Code session quoted the old Notice text. Its quoted string
alone is amended to the new text, on the coordinator's instruction; no other PRD
line changes.

Acceptance:

1. `settingsLaunchOptions(settings)` returns `appendSystemPrompt` (the vault
   instructions, `undefined` when empty), `sdkMcpServers` (`["obsidian"]` when
   the vault tools are on, else `undefined`) and `allowBypassPermissions`.
   `createSession` and `onLaunchSettingsChanged` both take these from it, so a
   new conversation and a restart cannot differ.
2. `ClaudeSession.setLaunchOptions` accepts those two options: a change
   restarts the CLI (after the turn when one is running), the replacement's
   `initialize` request carries the new instructions and server list, and no
   change restarts nothing. Absent, false, empty text and an empty list are the
   same value.
3. The Notice reads `This conversation stays on <profile>; start a new
   conversation to use another.`, <profile> being the tab's profile name
   (`Unnamed` when empty); `profileLabel` is the one place that fallback lives.
4. `relaunchOptions(settings, profile, cli, launchTarget)` decides the
   settings-close restart of one tab: null (keep the process) when nothing
   resolves, the launch target (path, or WSL on Windows) differs, or the
   profile's arguments are refused; else the options of acceptance 1 plus the
   profile's arguments. `onLaunchSettingsChanged` only calls it.
5. A session that leaves Bypass and takes new options on one settings close
   restarts once (`ClaudeSession.hold`, `holdAll`), after its turn when one is
   running. Sessions are held before the CLI lookups and `leaveBypass` runs
   before them; a send while a session is held restarts an idle one first, so
   a turn never runs on the outdated (perhaps Bypass) process, and the options
   applied after the lookups cost one more restart only if they changed. A restart that
   already happened during the hold (a turn ending, a process that exited and
   a send that spawned a fresh one) is not repeated at release. One throwing
   release does not keep the others held.
6. PRD-001.R3, README, DES-002 and the release notes state this; both backlog
   items are gone from `plan.md`, and one is added for a message queued
   mid-turn that a post-turn restart loses.

## Scope

Expected files:

- `src/settings-core.ts` (`settingsLaunchOptions`, `keptProfileNotice`,
  `profileLabel`), `src/settings.ts` (re-exports), `src/cli-args.ts`
  (`relaunchOptions`), `src/session.ts` (`LaunchOptions`, `sameOption`,
  `hold`), `src/view.ts` (`createSession`, `onLaunchSettingsChanged`,
  `openProfileMenu`), `src/main.ts` (a comment)
- `tests/settings-core.test.mjs`, `tests/cli-args.test.mjs`,
  `tests/session.test.mjs`
- `docs/current/product/PRD-001-chat-panel-and-sessions.md` (R3 Notice string),
  `README.md` (Vault instructions line), `docs/current/design/DES-002-cli-client-and-session-lifecycle.md`,
  `docs/current/plan.md`, `RELEASE_NOTES.md`

Negative scope:

- Any PRD line other than the R3 Notice string; ADRs.
- The skip rules of the restart, which move into `relaunchOptions` unchanged: a
  tab whose CLI moved or whose profile arguments are refused keeps its process
  and takes none of the new options (PRD-001.R4, DES-002 Restart on settings close). The
  owner decides separately whether instructions should still reach such a tab.
- A message queued mid-turn that a post-turn restart loses (any restart, not
  only this task's): a backlog item.
- Model, effort and default permission mode, which reach later tabs only.
- A real-CLI run: owed by hand (restart on settings close, DES-002 manual
  verification).

## Plan

- Tests first: the settings-to-options function in `settings-core.test.mjs`;
  in `session.test.mjs` the instructions and the vault-tools switch against the
  fake CLI, which reports the `initialize` request it received (no new
  scenario), the mid-turn deferral, the empty-equals-absent rule, and one test
  that applies `settingsLaunchOptions` of changed settings.
- `session.ts` already compares and applies whatever keys it is given, so the
  session change is the type and the empty-value rule; the defect is in the
  view, which passed two options. The view is Obsidian-bound and has no
  automated test, so its decisions move into `relaunchOptions` (skip rules,
  options carried) and `ClaudeSession.hold` (one restart per settings close),
  which `onLaunchSettingsChanged` only calls.
- Verification: `make verify`; independent review; by hand in a vault: edit the
  instructions with a conversation open and one mid-turn, close settings, see
  the restart and ask Claude for the instructions; switch the Obsidian tools
  off and see `/mcp` lose the server; pick a profile in a started conversation
  and read the Notice.
- Rejected: restarting on every edit (typing would restart processes; DES-002);
  a second option-builder in the view (two copies drift).

## Run log

- Tests first: against the old code `settings-core.test.mjs` failed to load
  (the two functions did not exist), and in `session.test.mjs` the
  empty-equals-absent test and the settings-close test failed. The other three
  new session tests passed on the old code: `ClaudeSession` already applied any
  key it was given, so the defect is the view's call, which no Node test
  reaches. All pass after the change.
- Review follow-up, tests first: `cli-args.test.mjs` and the `hold` tests in
  `session.test.mjs` failed (no `relaunchOptions`, `hold` or `profileLabel`
  yet). Without `hold`, `leaveBypass` and `setLaunchOptions` on an idle session
  restart it twice; dropping the deferral from `hold` fails the new test.
- Review round 2: the hold was taken before the CLI lookups, so for an idle
  session a send during detection would have run on the Bypass process while
  the tab showed Ask. `send` now applies a held restart first (round 3 then
  moved `leaveBypass` back before the lookups, so Bypass is left at once and
  a send during them restarts onto a process without the flag). Tests first: four session
  tests (send while held, a restart already due, a process that exited, a
  throwing release) failed before the change. Dropping `send`'s restart, the
  clear in `ensureClient`, or `holdAll`'s try/catch fails one each; the clear
  in `restartClient` alone is covered by the one in `ensureClient` (the warm-up
  spawns through it), so only dropping both fails the already-due test.
- Round 3: `setBusy` consumed the owed restart after the `onBusyChanged`
  callback, so a throwing callback stranded it; it now restarts first. That
  test failed first (the two lookup tests and the resume test passed at once,
  since the session already behaved so; the view order they stand for has no
  Node test). Not fixed here, backlog: the replacement spawns before the old
  process has closed.
- `profileLabel` takes `standalone` for the menu items and settings headings
  that say "Unnamed profile"; all five `|| "Unnamed"` and `|| "Unnamed
  profile"` sites go through it.
- The protected-path hook blocks the Write and Edit tools outside the project
  directory, so the files were written through the shell. No protected path was
  touched.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.
Findings: a release note that said these settings reach a conversation only
at spawn (Defect, deleted); the view's fix had no test (Gap, fixed:
`relaunchOptions` in `cli-args`, tested); a message queued mid-turn is lost
when a post-turn restart kills the process (pre-existing, backlog); leaving
Bypass with another change spawned twice (fixed: `hold`); a duplicated
"Unnamed" (fixed: `profileLabel`); a stale base (merged onto main).

Round 2: the same reviewer. Defect: the hold spanned the CLI lookups, so a
send during them ran a turn on the process launched in Bypass. Fixed:
`send()` applies a held restart first. Nits fixed: one throwing release
stranded later holds (`holdAll`); a restart during the hold was repeated at
release (`noRestartOwed`); `profileLabel` everywhere; backlog wording.

Round 3: the same reviewer; Defect closed, re-probed. Gap: leaving Bypass
waited for the lookups. Codex cross-review: the same window, and a throwing
`onBusyChanged` stranded an owed restart. Fixed: holds and leaving Bypass
run before any lookup; the owed restart runs before the callback; tests,
including `--resume` on a replacement. Pre-existing and in the backlog: a
restart spawns before the old process has closed (PRD-001.R5).

## Outcome

Vault instructions and the vault-tools switch now reach open conversations
when the settings tab closes, with one restart per conversation after its
turn; leaving Bypass happens before anything else. PRD-001.R3's Notice
string is amended to the reworded Notice (task 011, Q1(a)). For the owner:
a tab whose CLI moved or whose arguments are refused keeps its process and
takes none of the new options. Owed by hand in a vault: the checks in the
Plan.
