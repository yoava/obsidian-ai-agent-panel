---
status: closed
release: r06-panel-redesign
number: 033
prd: PRD-005.R2, PRD-005.R3, PRD-005.R4, PRD-005.R5, PRD-005.R8, PRD-005.R10
---

# TASK-033 — Context and plan usage

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 3: the plan-usage and context segments with their hover cards
and popovers, replacing the usage dialog; the usage formatters move from
`usage.ts` into `state/usage-segment` (ADR-016).

Governing: [PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md)
R2 to R5, R8, R10;
[DES-003](../../../current/design/DES-003-panel-ui.md) Status line,
Popovers, hover cards and tooltips, Popover and hover card (hover-card
machine); [DES-007](../../../current/design/DES-007-usage-and-cost.md)
Scheduling, Usage surfaces, Context meter;
[ADR-003](../../../current/adr/ADR-003-plan-usage-and-account-data-through-the-cli.md).

Acceptance:

1. Plan-usage segment, while "Show plan usage" is on: the 5-hour and the
   highest weekly percentage, each when reported, rounded down, labelled
   `5h` and `wk` or the model's name; orange from the warning threshold, red
   from the critical one, percentages in text; `usage…`, "usage unavailable -
   click to retry" or "no usage limits" as R4 says; the 5-hour reset time
   from a 560 px main column.
2. `ui/hover-card-host` per the hover-card machine: shown after 500 ms of
   pointer rest or on keyboard focus until blur, `role="tooltip"` and named
   by the element's `aria-describedby` while shown, gone when a popover opens
   or the element leaves the DOM. The plan-usage card lists
   `⚠ Refresh failed: <error>` first, then each window's percent and reset
   time; the context card the tokens used of the window and a bar.
3. "Plan usage" popover per PRD-005.R5: "as of HH:MM" or the failure line,
   Refresh disabled until its forced refresh settles, a bar per window, the
   extra-usage line, "/usage in chat" running `/usage`, and "Usage settings
   ↗" as an `external-link` anchor; it requests usage on open and redraws on
   every settled request.
4. Context segment: hidden until the conversation's first finished turn; a
   ring and percentage, warning color from 80%; no lookup before that turn;
   an unanswered lookup keeps the last percentage or shows none. "Context"
   popover per PRD-005.R8, with "/context details" running `/context`.
5. Polling: the segment reports `isShown()` and a fit step below 4 to the
   usage service (`setSegmentVisible`) after each resize pass and on its
   triggers; no usage timer runs while it is off or hidden; while shown it
   redraws at least every 30 s and a finished turn forces a refresh.
6. Usage, cost and context failures show only in the segments, their hover
   cards and popovers and the usage cards: no Notice, no error in the
   messages.
7. `UsageDetailModal` and `src/usage.ts` are deleted; `/usage`,
   `/usage-credits` and `/extra-usage` keep today's Markdown cards, now
   built from `state/usage-segment`.

## Scope

Expected files:

- New: `src/state/usage-segment.ts`, `src/ui/hover-card-host.ts`,
  `src/ui/popovers/context.ts`, `src/ui/popovers/plan-usage.ts`,
  `tests/state-usage-segment.test.mjs`.
- Changed: `src/state/popover.ts` (hover-card machine),
  `src/state/status-line.ts` (context segment, polling visibility),
  `src/ui/status-line.ts`, `src/usage-core.ts` (`setStripVisible` becomes
  `setSegmentVisible`), `src/view.ts`, `styles.css`, `package.json`
  (`pretest`), `tests/fake-cli.mjs` (answers for `get_usage` and
  `get_context_usage`, and a switch that refuses them);
  `tests/state-popover.test.mjs`, `tests/state-status-line.test.mjs`,
  `tests/usage-core.test.mjs`. Deleted: `src/usage.ts`.
- Docs: DES-007 (surfaces, the context segment, `setSegmentVisible`, the
  module table); DES-001 (the `usage` row, layers, runtime wiring);
  `README.md` (plan usage and context meter bullets);
  `docs/current/DEVELOPMENT.md`; `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- Tab and turn hover cards (034, 037); the usage cards as `CommandReport`s
  and the `/context` card (040); the turn footer's cost (037).
- The usage service's cache, floor and back-off (`usage-core`, unchanged
  beyond the rename).
- No new dependency; no protected path; no real-CLI run.

## Plan

- Tests first: item choice, labels, tints, placeholders, hover rows, popover
  lines and failure text (`PRD-005.R4`, `R5`, `R2`, `R10`); polling
  visibility needs a fit step below 4 (`PRD-005.R3`); the context segment
  hidden before the first finished turn and warning from 80% (`PRD-005.R8`);
  every hover-card transition (`PRD-001.R32`).
- Moves out of `view.ts`: `renderUsageBar`, `renderContextMeter`,
  `usageVisible`, `updateUsageScheduling`, `onUsageSettingsChanged`'s
  drawing; out of `usage.ts`: `formatReset`, `formatRemaining`,
  `usageTooltip`, `usageMarkdown`, `creditsMarkdown`.
- Fake CLI: today it refuses both requests, so the vault shows only failure
  states. Replies are shaped from the captured replies in
  `tests/commands.test.mjs` and `usage-core`'s parsing.
- Verification: `make verify`; manual, by someone other than the
  implementer: M1 (every width; at 300 px the segment hides and polling
  stops), M2's step-4 case (no `get_usage` while hidden, seen with a DevTools
  logpoint on the service's request), a failed refresh, the hover cards, the
  popovers, "/context details", at least at 300 and 1040 px.
- Risks: polling while hidden if a visibility trigger is missed (each
  trigger is a manual check); a hover card left on screen when its element
  is removed (machine transition, tested).
- Rejected: keeping `UsageDetailModal` beside the popover (two surfaces for
  one job); a text tooltip for the plan-usage figures (R4 asks for a hover
  card that keyboard focus shows).

## Run log

- Tests first, against 032's code (4ff2915): `state-usage-segment` failed
  on import (no `state/usage-segment`); `state-popover` and
  `state-status-line` failed on import (no `hoverStep`, `contextSegment`,
  `usageSegmentVisible`); 11 `usage-core` tests failed on
  `setSegmentVisible`; four protocol tests failed (`get_usage` and
  `get_context_usage` unsupported by the fake CLI; no `model`,
  `autoCompactAt` or `kind` from `getContextUsage`). The placement tests
  characterize code moved out of 032's popover host and passed on arrival.
- Protected paths, under the owner's instruction of 2026-10-11, for the
  owner to confirm: `tests/architecture.test.mjs` tightened only: layer 3
  drops the deleted `usage` (its graph fixture now uses `history`); DES-007
  G1 (`usage-core` imports only `settings-core` and `timers`) and G2 (only
  `main` imports `usage-core` at runtime) added with seeded breaches, which
  failed with the checks removed. No allowlist row is due in this slice.
  `tests/styles.test.mjs` unchanged. Ask-first `package.json`: `pretest`
  gains `src/state/usage-segment.ts`.
- Choices the accepted docs leave open, for review:
  - PRD-005.R8's popover needs the model and the autocompact point, which
    `getContextUsage` dropped: it now keeps `model`, `autoCompactAt`
    (`autoCompactThreshold` while `isAutoCompactEnabled` is `true`) and each
    category's `kind`, type-checked. Files beyond the expected list:
    `src/protocol/types.ts`, `src/protocol/client.ts`, `src/commands.ts`
    (`contextCategoryKind`, shared with `/context`), `src/ui/dom.ts`,
    `src/ui/popover-host.ts`, `tests/protocol.test.mjs`,
    `tests/architecture.test.mjs`, DES-002, DES-003.
  - The context segment shows no cost (DES-003: ring and percentage), so the
    conversation's cost leaves the status line until the tab hover card
    (034); `/cost` shows it. A reopened conversation's segment stays hidden
    until a turn finishes there.
  - With no reply the segment shows an empty ring and no percentage, named
    "Context: not reported"; the popover is drawn from the reply at open.
  - Plan-usage tint: the segment takes the higher item's level, each
    percentage its own color (canvas). The 5-hour item's 560 px addition is
    `resets HH:MM` (canvas), not today's time to reset.
  - `usageTooltip` became `usageHover`: R4's failure line and windows only;
    the extra-usage line and fetch time are the popover's. With no snapshot
    the hover card says `⚠ Refresh failed: <error>` (R4's text), the popover
    `Couldn't fetch usage: <error>` (R5's).
  - "/usage in chat" and "/context details" run the command in the tab
    whose popover it was, then close it as a pick; while a restore runs they
    do nothing and the popover stays, as the composer keeps a command it
    cannot send. Focus on open: Refresh, or "/usage in chat" while the
    request made on open keeps Refresh disabled.
  - Polling visibility moved into `ui/status-line` (ADR-016's owner): it
    reports after every pass from what the pass read, and on
    `visibilitychange`, workspace `layout-change`, `active-leaf-change`,
    `resize` and `settings` from a fresh `isShown()` (as the view did); the
    view no longer schedules usage. The context warning compares the
    rounded percentage shown.
  - Hover cards: keyboard focus is `:focus-visible`, so a click's focus
    shows none; a card shown by focus ignores the pointer; the pointer
    entering another element arms it; a redraw drops a card whose element no
    longer shows (a tab switch hiding the context segment). Placement is
    the popover's, extracted to `state/popover` (`placeAbove`,
    `placeInline`) for both hosts; the bar is `meterBar` in `ui/dom`.
  - Fake CLI: `get_context_usage` is refused before the first finished turn
    with "no turn received yet" (the refusal `getContextUsage` documents)
    and fills 40k of a 200k window per turn; `FAKE_CLI_REFUSE_USAGE` refuses
    both requests.
  - Styles: the legacy usage-modal rules are deleted; today's meter and
    strip rules above the tail are replaced.
- Codex cross-review of the slice (3f0075d, 37baf42, 94da9f7, 36e57f7),
  then two follow-ups confirming the fixes. Confirmed sound: the hover
  machine's transitions, the `:focus-visible` gate, cleanup on detach and
  unload; the fit passes against off, hidden document, step 4, the 360 px
  rule and unload, with no pass loop; the popover's request on open,
  Refresh state, focus target and redraw; item choice, rounding,
  placeholders and failure lines; the fake CLI. Fixed, tests first where
  pure: a trigger reported the last pass's visibility, so a panel hidden
  meanwhile could start the timer (now a fresh read; a false-then-true
  report was rejected, as it would restart the timer on every leaf change);
  a card stayed, or armed and showed, for a segment that a fit step, the
  360 px rule or a hidden panel hid; `kind: "deferred"` did not mark a
  category deferred (failed first); a null category entry discarded the
  whole reply (failed first; DES-007's required case); "/usage in chat"
  closed its popover and did nothing during a restore; a 79.5% reply showed
  80% without the warning color (failed first). Kept: times stay in the
  user's locale (`toLocaleTimeString`, as before this slice), which gives
  `04:59 PM` in a 12-hour locale; the PRD's "HH:MM" names a clock time.
- Composed with 032's review fixes: the context percentage sits in its own
  span carrying the icon-text margin, and the ring takes
  `--ai-agent-panel-status-icon-size`.
- Replayed onto `main` at 4ecbc5f (032 landed, with `hiddenWidths`): this
  task's own diffs (4ff2915..94da9f7 and 0358772..00b38ab) applied with
  `git apply --3way`. One conflict, the context segment's rules in
  `styles.css`, took this task's side; `read()` composed with
  `hiddenWidths` unchanged, the usage key below 560 px being the
  accessible label `hiddenWidths` already reads.
- Fixed on the replay, test first (`lostTrigger` failed on import): a fit
  step or the 360 px rule hides the plan-usage segment by CSS, which 032's
  `trigger-hidden` (inline style only) missed, so its popover stayed open
  over a hidden trigger. While a popover is open, a `ResizeObserver` on its
  trigger sees its box go to zero under any rule and closes it
  (`lostTrigger` in `state/popover` picks removed or hidden); the callback
  runs after layout, so `isShown()` forces none. DES-003 Popovers says so.
- Review fixes (coordinator's review, no defects), amended into the one
  commit, tests first where pure:
  - G1: a panel moved to another window ("Move to new window") kept its
    `visibilitychange` listener on the main document, so polling went on
    while the pop-out was minimized. The listener follows the line's
    window (`onWindowMigrated`); DES-007 Scheduling says so.
  - G2: the settings row read "Show usage strip" with today's strip and
    dialog; it is now "Show plan usage", describing the segment and its
    popover (key `showUsage` kept), and the refresh-interval row and the
    `settings-core` comment follow.
  - N1, N2: the hover machine gains a `blocked` phase while a popover is
    open (no card arms or shows; failed first on the new events) and
    ignores the focus a closing popover returns to its trigger (failed
    first); `PopoverHostSource` gains `onHide` and `onReturnFocus`, and
    DES-003's machine table says so.
  - N3: the context bar's shares shrink with its 2 px gaps inside its
    width, so the reserve stays visible at the end.
  - N4, lead-authorized maintenance, for the owner to confirm: statements
    rewritten in place in ADR-003 (Context, the rejected per-refresh start,
    Design: "strip" to the plan-usage segment), ADR-016 (the formatters'
    home, `usageHover` for the old tooltip), ADR-017 (the modal list without
    `UsageDetailModal`), DES-007 (R7's manual row: `/cost`'s conversation
    cost), `COMPARISON.md` and, beyond the list, `LEGAL.md` ("usage strip").
- API changes for later slices: `ui/dom` gains `AttachHoverCard`,
  `HoverCardHandle`, `HoverCardRender` and `meterBar`; `PopoverHostSource`
  gains `onShow`, `onHide` and `onReturnFocus`; `state/popover` gains
  `lostTrigger`, `placeAbove`, `placeInline` and the hover machine with its
  `blocked` phase; `HoverCardHost.attach(el, render)`, `popoverOpened()`,
  `popoverClosed()` and `focusReturning(trigger)`;
  `StatusLineSource` gains `workspaceEvents` and loses `usageVisible` and
  `usageFormat`; `StatusLineIntents` gains `attachHoverCard`,
  `onRefreshUsage(force)` and `onRunCommand(tab, name)` (returns whether it
  ran) and loses
  `onOpenUsage` and `onUsageVisibility`; `UsageService.setSegmentVisible`
  replaces `setStripVisible`; `ContextUsage` gains `model`, `autoCompactAt`
  and category `kind`.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), at 300 px and
  1040 px wide unless stated:
  1. Plan usage (M1): before a message, `usage…`, then "usage unavailable -
     click to retry"; after one, `5h 42%` and an orange `Sonnet 81%` on an
     orange segment, `resets HH:MM` after `5h` from a 560 px main column;
     warning 40 turns `5h` orange, critical 80 turns the segment red; "Show
     plan usage" off hides it and no `get_usage` follows.
  2. Hover cards (PRD-001.R32): 500 ms of rest shows the card above the
     segment, leaving drops it; Tab onto a segment shows it at once until
     focus leaves; a click opens the popover and drops it, no card arms
     while it is open, and Escape returns focus to the segment without a
     card; DevTools shows `role="tooltip"` named by the segment's
     `aria-describedby`; switching to a tab without a finished turn drops
     the context card.
  3. "Plan usage" popover: "as of HH:MM"; Refresh disabled until its
     request settles, and enabled at once when the 10 s floor drops it; four
     bars with `resets … (in …)`, Sonnet orange; "Extra usage: $3.50 (of
     $50.00) - 7%"; "/usage in chat" closes it and posts the `/usage` card;
     "Usage settings ↗" opens claude.ai/settings/usage in the browser.
  4. A failed refresh: after a message, close that tab with another open;
     Refresh: the hover card leads with `⚠ Refresh failed: Plan usage comes
     from a running session - send a message first.` above the old rows,
     the popover with `… - showing data from HH:MM.`
  5. Context: hidden in a new tab and a reopened conversation until a turn
     finishes there; then 32%, 52%, 72%, and orange 92% at the fourth; the
     hover card's tokens and bar; the popover's "fake-model-1 · 200.0k
     window", bar, legend with "System tools (deferred)", "Autocompacts at
     167.0k · … to go"; "/context details" posts the `/context` card. With
     `FAKE_CLI_REFUSE_USAGE=1`: an empty ring, no percentage, the popover's
     "Claude Code has not reported the context window yet."
  6. PRD-005.R10: no Notice and no error in the messages in rows 1 to 5.
  7. M2's step-4 case: a main column narrow enough for step 4 hides the
     segment, and a DevTools logpoint on `UsageService.refresh` shows no
     request while hidden; widening redraws it and requests at once; at
     300 px (360 px rule) the same. Polling also stops with the sidebar
     collapsed, the window minimized and another leaf over the panel; a
     finished turn while shown forces a refresh.
  8. M6, M5, M3: the keyboard path of row 2 and the popovers with a screen
     reader (the card read as the segment's description); hover cards and
     popovers in a pop-out window, and, after "Move to new window", no
     `get_usage` while that pop-out is minimized; both in a forced Light and
     Dark.

## Independent review

The coordinator, not the implementer, reviewed the replayed commit: it ran
the real hover-card and popover hosts, the status line, both popovers and a
scripted `UsageService` in headless Chromium, and `make verify`. No defect.
Gaps, fixed in the same commit (Run log, "Review fixes"): G1, polling went
on in a minimized pop-out after "Move to new window"; G2, the settings row
still described the strip and the dialog. Nits, fixed: N1, a card on the
focus a closing popover returns; N2, cards arming while a popover is open;
N3, the context bar's gaps pushing the reserve out of the bar; N4, stale
statements in ADR-003, ADR-016, ADR-017, DES-007 and COMPARISON.md.

## Outcome

Built and reviewed. The plan-usage and context segments have hover cards
and popovers; `UsageDetailModal` and `usage.ts` are gone; the status line
polls plan usage only while its segment shows. For the owner to confirm
before it lands:

- `tests/architecture.test.mjs`, protected: layer 3 drops `usage`; DES-007
  G1 and G2 added with seeded breaches; nothing loosened.
- ADR edits, ask-first, lead-authorized maintenance: ADR-003, ADR-016 and
  ADR-017 statements rewritten in place (Run log, N4).
- The conversation's cost leaves the status line until the tab hover card
  (034); `/cost` shows it meanwhile.
- Manual rows 1 to 8 of the Run log, run and recorded in
  `docs/records/verification/` by someone other than the implementer.
