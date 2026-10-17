---
status: closed
release: r05-pre-redesign-fixes
number: 007
prd: PRD-005.R3, PRD-005.R7
---

# TASK-007 — Usage timer and conversation cost

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Two backlog defects against accepted requirements. Every open panel view runs
its own usage timer and a failed request is retried on every tick; the
conversation cost is a per-tab maximum that is lost on reopen and ignores
session ids, and the export takes only the last turn's session total.

Governing:
[PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md) R3, R7,
[DES-007](../../../current/design/DES-007-usage-and-cost.md) (Usage service,
Scheduling, Cost and tokens, rule G3),
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R13 (`cost_usd`),
[DES-001](../../../current/design/DES-001-system-overview.md) (file map,
rule A12).

Acceptance:

1. One usage timer serves all open panel views, owned by `UsageService`. It
   runs only while some view reports its strip visible (`showUsage` on, the
   window, the sidebar and the pane shown), with period
   `min(30 s, max(10 s, refresh interval))`, and stops when none does or the
   last view closes. A settings change re-times it.
2. Each tick requests usage (cache permitting) and redraws every subscribed
   strip. A strip that becomes visible gets a redraw and a request at once.
3. After a failed request, an unforced `refresh()` makes no request until one
   refresh interval has passed since the failure; a forced one skips that
   wait but not the 10 s floor. A success ends the wait. An outage therefore
   draws one background request per interval. The dialog's open-time refresh
   is forced when the last attempt failed, so "click to retry" retries.
4. `UsageService` and the reply parser are Obsidian-free in `src/usage-core.ts`,
   built into the `pretest` bundle; `src/usage.ts` keeps the formatting and
   the detail dialog. The service exposes `refreshing` (the dialog draws
   Refresh disabled from it, so redraws keep it disabled), `refreshIfVisible()`
   (the forced refresh after a turn) and `dispose()` (called on unload).
5. `conversationCost(messages)` in `src/commands.ts` returns, for each
   distinct `sessionId` among the `meta` records, the `costUsd` of its latest
   record, summed; a missing or non-finite `costUsd` adds nothing. Decision
   for records without a `sessionId` (0.5.0 and earlier): they join the first
   later session if its first reported total is at least their latest total (a
   resumed session's total never drops), otherwise they count as a session of
   their own; no later session takes them over. Error turns record `costUsd` too (not shown on their line).
6. The composer's cost, the meter tooltip's `Cost` line, `/cost` and the
   exported note's `cost_usd` all come from it, read from the saved turn
   records: the cost shows after a conversation is reopened (before any turn),
   after a respawn, and for a second session id. `/cost` shows it in its own
   section, "This conversation, all turns". The export omits `cost_usd` when
   the cost is zero (DES-005 owns the line).
7. The meter element is hidden only while the tab has no finished turn and
   the cost is zero.

## Scope

Expected files:

- `src/usage-core.ts` (new: `UsageService`, `UsageClock`, `parseUsage`, the
  snapshot types), `src/usage.ts` (service and parser removed),
  `src/timers.ts` (`setRepeatingTimer`, `clearRepeatingTimer`, which accepts
  `undefined` like `clearTimer`),
  `src/settings-core.ts` and `src/settings.ts` (`MIN_USAGE_REFRESH_SECONDS`
  moves to the Obsidian-free module the service needs)
- `src/commands.ts` (`conversationCost`, `costReport` takes the cost),
  `src/view.ts` (timer removed, visibility reported, meter and `/cost` read
  the derived cost, error turns record their cost, the forced refresh after a
  turn goes through the service), `src/main.ts` (import, `dispose` on unload),
  `src/export.ts` (the `cost_usd` frontmatter line only), `package.json`
  (`pretest`)
- `tests/usage-core.test.mjs` (new), `tests/commands.test.mjs`
- `RELEASE_NOTES.md`, `docs/current/plan.md` (both backlog items removed),
  DES-007, DES-005 (`cost_usd` rule, error-turn `costUsd`), DES-001 (file map,
  wiring), ADR-003 (validation line), PRD-005 (code pointers),
  `docs/current/DEVELOPMENT.md` (test table); line-number pointers my change
  moved are now symbol names (ADR-009, ADR-010, ADR-011, PRD-005, plan)

Negative scope:

- Moving the formatting functions, the dialog or `/usage` wiring out of
  `src/usage.ts` or `src/view.ts`.
- Which client answers, the 10 s floor, the cache rules, the cards and the
  strip's wording.
- `export.ts`'s import of `view` (another task).
- The `/clear` behavior (open decision) and the stored meta shape, except
  `costUsd` on error turns.
- A healthy refresh landing up to 30 s after the interval is allowed by
  PRD-005.R3 and is not a defect.

## Plan

- Tests first, in Obsidian-free modules: `tests/usage-core.test.mjs` runs
  `UsageService` over a fake clock and a hand-fired timer; `conversationCost`
  tests in `tests/commands.test.mjs` for the three cases DES-007 lists, plus
  the latest-wins, malformed and non-meta cases.
- Step 1: move the service and parser unchanged to `usage-core.ts` with an
  injected clock (no back-off, no timer) and run the new tests; they fail.
  Step 2: add the back-off, the visibility set and the timer.
- The timer is owned once: views report visibility, the service decides. The
  clock injects `now` and `every`, so no test needs real time or Node's mock
  timers; the default clock uses `timers.ts`, which keeps
  `window.setInterval` for Obsidian.
- The cost is derived, not stored in `tab.usage`, so one function serves the
  composer, `/cost` and the exporter (DES-007 G3). `accumulateUsage` runs after
  the turn's `meta` is recorded so the meter reads the new total.
- Verification: `make verify`; the timer in a real window, the strip, and the
  composer cost after reopen are checked by hand (DES-007 manual rows).
- Rejected: keeping a per-tab maximum and adding stored totals (a second copy
  of what the records already hold); a back-off inside the view (it would stay
  per view).

## Run log

- The worktree started at 0.4.0, before `docs/current/`; fast-forwarded to
  `fad1022` before any edit.
- Tests first: against the service moved unchanged (clock injected, no
  back-off, no timer), 9 of the 17 `tests/usage-core.test.mjs` tests failed
  (the back-off, the shared timer and its period, the redraw and the outage
  test), and `tests/commands.test.mjs` did not load for want of
  `conversationCost`. All pass after the change.
- Surprise: the first outage test advanced the clock before the first failure
  had settled, so the failure time was taken 30 s late. The service stamps a
  failure when it settles; the test now waits for it.
- A settings change used to redraw the strip through the timer restart; the
  view now redraws itself, so new thresholds still apply to shown figures.
- The meter's `is-tight` class was set only when a context reading existed and
  could outlive a tab switch; with the cost-only meter it is now set on every
  draw.
- The export omits `cost_usd` at a cost of zero (PRD-003.R13: only when
  set); before, a reported total of 0 wrote `cost_usd: 0.0000`.
- The strip's "click to retry" opened a dialog whose open-time refresh was
  unforced, so within one interval after a failure nothing was retried; review
  made it forced after a failure (the 10 s floor still applies).
- Decision (review, 2026-10-11): records without a session id join the first
  later session if its first reported total is at least their latest total,
  else count separately. Only that first session decides; a later one never
  takes them over (pinned by a test).
- No real CLI was run; the manual rows of DES-007 (timer in a real window,
  composer cost after a reopen, the exported `cost_usd`) are owed in a vault.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Defect: records without a session id (0.5.0 and earlier) were counted as
   their own session beside the resumed session that carries their total, a
   double count. Fixed: the join rule above, with tests.
2. Defect: a tick or another view's show rebuilt the usage dialog and
   re-enabled Refresh while its request was in flight. Fixed: the service
   exposes `refreshing` and the button is drawn from it.
3. Gap: the strip's "click to retry" made no request within the interval after
   a failure. Fixed: the dialog's open-time refresh is forced after a failure.
4. Gap: an error turn stored no `costUsd`, so its total never reached the
   conversation cost. Fixed: stored, not shown on the error line.
5. Gap: tests let mutants survive (timer recreated on every report, failure
   stamped at the attempt, retry on hide and show, redraw counts). Fixed: four
   tests added or tightened.
6. Gap: `usageDirty` was set and never read. Fixed: a visible, dirty strip is
   redrawn when its view reports.
7. Stale: line-number pointers moved by the change (PRD-005, ADR-009, ADR-010,
   ADR-011, plan). Fixed: symbol names.
8. Gap: DES-007 restated the `cost_usd` rule DES-005 owns. Fixed: DES-005
   states it, DES-007 links.
9. Stale: DES-007 and the `conversationCost` comment named a branch fork as a
   case that adds a session id. Fixed: a failed resume does; a branch is a new
   conversation.
10. Gap: `/cost` put the conversation's cost under "since opened". Fixed: its
    own section.
11. Gap: the service had no teardown, and `clearRepeatingTimer` rejected
    `undefined`. Fixed: `dispose()` registered on unload; the helper ignores
    `undefined`.
12. Defect: the forced refresh after a turn depended on the finishing view's
    own visibility. Fixed: `refreshIfVisible()` asks the service.
13. Nit: DES-001's wiring row restated DES-007 Scheduling. Fixed: a link.
14. Gap: the ADR-003 validation line was edited without recorded approval.
    Covered by the owner's approval of all tasks, 2026-10-11.

## Outcome

One usage timer serves every panel view, with a back-off after a failure;
the conversation cost is the latest total per session, records from 0.5.0
or earlier folded into the session that continues them, and the composer,
`/cost` and the export read it. Owed by hand in a vault: the timer with a
hidden sidebar and two panels, the composer cost after a reopen, the
dialog's Refresh and "click to retry", and the exported `cost_usd`.
