# PRD-005 — Plan usage and cost

**Status:** accepted (2026-10-11)

## Problem

Claude subscriptions cap use per 5-hour session and per week; API-key logins
pay per token. Over stream-JSON the CLI answers `/usage` in plain text or not
at all (README Features), so a panel user cannot see how close a limit is or
what a conversation has cost. The figures must come without spending tokens,
reading credentials or opening network connections of the panel's own
(README "What runs on your machine").

## Users and jobs

- Subscription users: see 5-hour and weekly limits at a glance, with reset
  times, before starting long work.
- API-key users: see what a turn and a conversation cost.
- Both: see how full the context window is.

## Requirements

- **PRD-005.R1** — Usage source.
  - The AI Agent Panel shall obtain plan usage only by asking an
    already-running CLI process, whatever its profile: in the first panel view
    that has one, the active conversation's, else another open conversation's.
  - The AI Agent Panel shall never start a CLI process, read a
    credential or make a network request of its own to obtain usage.
  - IF no CLI process is running, THEN the AI Agent Panel shall report
    "Plan usage comes from a running session - send a message first."
  - IF the CLI returns no usage data, THEN the AI Agent Panel shall
    report "This CLI version does not report plan usage."
  - IF the CLI reports that plan limits do not apply to its login, THEN the AI
    Agent Panel shall report "No plan limits on this login - API-key
    and Bedrock/Vertex sessions have none."
  - IF the CLI does not answer within 15 s, THEN the AI Agent Panel
    shall report the timeout as the usage error.
- **PRD-005.R2** — Caching and rate floor.
  - The AI Agent Panel shall reuse the last fetched usage while it is younger
    than "Refresh interval" under Usage (default 300 s, at least 10 s).
  - The AI Agent Panel shall start at most one usage request every 10
    s, forced refreshes included, and answer other requests from the cache.
  - WHILE a usage request is in flight, the AI Agent Panel shall give
    every further request that same result.
  - IF a usage request fails, THEN the AI Agent Panel shall keep showing the
    previous figures and report the error in the plan-usage segment's hover
    card, the usage popover and the usage cards.
- **PRD-005.R3** — Background refresh. Applying usage-setting changes to open
  panels: PRD-001.R25.
  - WHILE "Show plan usage" is on and the plan-usage segment is visible
    (window, the panel's sidebar and its pane shown, the segment not hidden by
    PRD-001.R31), the AI Agent Panel shall request usage within 30 s after the
    refresh interval has passed.
  - The AI Agent Panel shall run one usage timer for all open panel views.
  - IF a background usage request fails, THEN the AI Agent Panel shall make
    the next background request no sooner than one refresh interval after the
    failure.
  - WHILE the plan-usage segment is visible, the AI Agent Panel shall redraw
    it at least every 30 s.
  - WHILE the plan-usage segment is off or hidden, the AI Agent Panel shall
    run no usage timer.
  - WHEN the plan-usage segment becomes visible again, the AI Agent Panel
    shall redraw it and request usage at once.
  - WHEN a turn finishes while the plan-usage segment is visible, the AI Agent
    Panel shall request a forced refresh.
- **PRD-005.R4** — Plan-usage segment.
  - WHERE "Show plan usage" is on (the default), the AI Agent Panel shall show
    in the plan-usage segment the 5-hour window's percentage and the highest
    weekly window's percentage, each when reported, rounded down.
  - The AI Agent Panel shall label the 5-hour item `5h`, and the weekly item
    `wk` for the all-models week or the model's name for a model-specific
    week.
  - The AI Agent Panel shall tint the plan-usage segment orange from the
    warning threshold (default 70) and red from the critical threshold
    (default 90) reached by either item, each threshold settable from 0 to 100
    in steps of 5, with the percentages always in text.
  - WHILE no usage has been fetched, the AI Agent Panel shall show the
    placeholder `usage…`, or "usage unavailable - click to retry" after a
    failure.
  - IF the CLI reports no limit windows, THEN the AI Agent Panel shall
    show "no usage limits".
  - WHEN the pointer rests on the plan-usage segment, the AI Agent Panel shall
    show a hover card listing any refresh failure first as
    `⚠ Refresh failed: <error>`, then each window with its percent used and
    reset time.
- **PRD-005.R5** — Usage details.
  - WHEN the user clicks the plan-usage segment, the AI Agent Panel shall open
    a "Plan usage" popover with "as of HH:MM", a Refresh button, a bar per
    reported window (title, percent, reset time and time to reset), the
    extra-usage line, a "/usage in chat" button and a "Usage settings ↗" link
    to `https://claude.ai/settings/usage`, and request usage.
  - WHILE the usage popover is open, the AI Agent Panel shall redraw it
    whenever a usage request settles.
  - WHEN the user presses Refresh, the AI Agent Panel shall disable the
    button and request a forced refresh until it settles.
  - IF the last usage request failed when the popover draws, THEN the AI Agent
    Panel shall show `⚠ Refresh failed: <error> - showing data from HH:MM.` in
    place of the "as of" line, or `Couldn't fetch usage: <error>` when there
    are no figures.
  - WHEN the user presses "/usage in chat", the AI Agent Panel shall run
    `/usage` in the conversation.
- **PRD-005.R6** — Usage commands. Recording of these cards: PRD-001.R20.
  - WHEN the user sends `/usage`, the AI Agent Panel shall answer in the panel
    without a model turn, request a forced refresh, and show a "Plan usage"
    card led by "As of HH:MM" listing "Current session (5h)",
    "Current week (all models)", "Current week (Sonnet)" and each
    model-specific weekly limit, each when reported, with percent used, a bar,
    reset time and time to reset, plus extra usage when enabled and the
    warning and critical thresholds.
  - WHEN the user sends `/usage-credits` or `/extra-usage`, the AI Agent Panel
    shall show a "Usage credits" card led by
    "As of HH:MM · also answers /extra-usage" with the credit status and any
    disabled reason, the monthly limit, credits used this period with the
    percent of the cap and a bar, and a link to claude.ai/settings/usage.
  - IF no usage can be had, THEN the AI Agent Panel shall show the card
    `Couldn't fetch usage: <reason>`.
  - IF the refresh failed but older figures exist, THEN the AI Agent Panel
    shall append `⚠ Refresh failed (<error>) - showing data fetched at HH:MM.`
    to the card.
  - IF the account reports neither a limit window nor enabled extra usage,
    THEN the AI Agent Panel shall show "No usage limits reported for this
    account."
  - IF the account reports no extra-usage credits, THEN the AI Agent Panel
    shall show "Extra-usage credits aren't reported for this account
    (API-key setups and some plans don't have them)."
- **PRD-005.R7** — Turn cost and conversation totals. This requirement owns
  what each cost figure means; PRD-003.R13 exports one of them. A resumed CLI
  continues its session's `total_cost_usd` (real-CLI run 2026-10-10). A
  session started by `/clear` reports totals from zero, so the per-session sum
  needs no change for clears.
  - WHEN a turn finishes without an error, the AI Agent Panel shall show on
    its turn footer the duration in seconds to one decimal and the turn's cost
    to three decimals ("<$0.001" when above zero and below that), being the `total_cost_usd` the CLI reports minus the one
    the previous finished turn of the same session reported, and record the
    duration and the reported total (a turn that ends in an error:
    PRD-001.R15).
  - WHEN a conversation is reopened, the AI Agent Panel shall show each turn's
    cost computed the same way from the recorded totals.
  - The AI Agent Panel shall show the same per-turn cost in each exported
    turn's duration and cost line.
  - WHEN the pointer rests on the duration and cost of a turn finished since
    the conversation was opened, the AI Agent Panel shall show the turn's
    input, output, cache-write and cache-read tokens and the note
    "At API prices; plans count usage instead".
  - The AI Agent Panel shall take as a conversation's cost the latest
    `total_cost_usd` its Claude Code session has reported.
  - WHERE a conversation spans several Claude Code session ids, such as a
    `/clear` segment or a branch fork, the AI Agent Panel shall take as its
    cost the sum of the latest `total_cost_usd` reported for each session id.
  - The AI Agent Panel shall export as a conversation's `cost_usd` its cost,
    to four decimals.
  - WHEN a turn finishes, the AI Agent Panel shall add the turn's input,
    output, cache-write and cache-read tokens to the conversation's totals
    since it was opened in the panel.
  - WHEN a fork starts, at a branch's first message or when a refused rewind
    forks again (PRD-002.R15), the AI Agent Panel shall record as the
    branch's fork base the latest `total_cost_usd` recorded for the forked
    session, replacing an earlier one, unless none is recorded or a turn runs
    in that session.
  - The AI Agent Panel shall take as the fork session's share of the branch's
    cost its latest total minus the fork base, and as the branch's first turn
    cost its total minus the fork base.
  - IF a branch has no fork base, THEN the AI Agent Panel shall show its
    conversation cost with the note "Includes the cost of the conversation it
    branched from".
  - IF the panel did not record every turn of the forked session since it
    began (it did not start it in that conversation, agents or background
    tasks ran in it when the fork started, or another tab ran it), THEN the AI
    Agent Panel shall show the branch's cost as an estimate with the note
    "Estimate: can include some cost of the conversation it branched from".
- **PRD-005.R8** — Context segment.
  - WHEN a turn finishes, the AI Agent Panel shall ask the CLI how full the
    context window is (15 s timeout) and show a ring and percentage in the
    context segment, in the warning color from 80%.
  - WHILE the conversation has no finished turn, the AI Agent Panel shall hide
    the context segment.
  - WHEN the pointer rests on the context segment, the AI Agent Panel shall
    show a hover card with the tokens used of the window and a bar.
  - WHEN the user clicks the context segment, the AI Agent Panel shall open a
    "Context" popover with the model and window size, the tokens used with the
    percentage, a bar and legend by category marking deferred categories
    "(deferred)", the autocompact point with the tokens to go, and a
    "/context details" button.
  - WHEN the user presses "/context details", the AI Agent Panel shall run
    `/context` in the conversation.
  - IF the CLI does not answer, THEN the AI Agent Panel shall keep the
    last known percentage, or show none.
  - The AI Agent Panel shall not ask for context usage for the context segment
    before a conversation's first finished turn (`/context` asks whenever it
    is run, PRD-001.R20).
  - WHEN the pointer rests on the context segment, the AI Agent Panel shall
    add the prompt cache state and its time left to the hover card.
  - The AI Agent Panel shall add to the context popover the prompt cache
    section (R11) and a "Compact" button titled "Summarize the conversation
    now (uses tokens)".
  - WHEN the user presses "Compact", the AI Agent Panel shall send `/compact`
    to Claude Code without asking for confirmation.
  - WHILE a turn runs, the AI Agent Panel shall disable "Compact".
  - WHILE the CLI reports that it is compacting, the AI Agent Panel shall
    tint the context segment with the warning color and add ", compacting" to
    its accessible label.
  - WHEN a clear completes (PRD-001.R38), the AI Agent Panel shall hide the
    context segment until the next turn finishes.
- **PRD-005.R9** — Cost command.
  - WHEN the user sends `/cost`, the AI Agent Panel shall show a "Cost"
    card without a model turn, with "This conversation, since opened" (turns,
    input, output, cache written, cache read), the conversation's cost and
    the note "Costs are API prices. On a Claude subscription they come out of
    your plan's limits instead - /usage shows those."
  - WHERE the conversation's CLI is already running, the AI Agent Panel
    shall add Claude Code's own figures under "Claude Code, since it last
    started".
  - The AI Agent Panel shall answer `/cost` without starting a CLI
    process.
  - IF Claude Code's cost request fails, THEN the AI Agent Panel shall
    omit its section.
- **PRD-005.R10** — Degrade quietly.
  - The AI Agent Panel shall report usage, cost and context lookup failures
    only inside the plan-usage and context segments, their hover cards and
    popovers, and the usage cards, never as a notice or an error in the
    messages.
- **PRD-005.R11** — Prompt cache state. The CLI reports cache writes by lifetime, one hour or five minutes, but no expiry, so the countdown is an estimate. The main agent writes for one hour unless the user's settings, environment or login choose five minutes (V8). A main-agent response is one the CLI does not attribute to a subagent; subagent writes, five-minute in every case observed, never set the main agent's countdown.
  - The AI Agent Panel shall take as the cache lifetime one hour when the main agent's last cache write was a one-hour write, and five minutes otherwise.
  - WHEN a main-agent model response reports cache reads or writes, the AI Agent Panel shall restart the countdown at the cache lifetime.
  - WHILE a main-agent model response streams, the AI Agent Panel shall show the cache as refreshing, with no countdown.
  - WHILE the countdown runs, the AI Agent Panel shall show the time left after the context percentage as `m:ss`, or as whole minutes ("52m") while more than 10 minutes are left.
  - WHILE less than one minute is left, the AI Agent Panel shall show the cache as expiring, in the warning color.
  - WHEN the countdown ends, the conversation is compacted or cleared, or its model changes, the AI Agent Panel shall show the cache as cold.
  - IF no main-agent model response has reported cache tokens since the conversation was opened, THEN the AI Agent Panel shall show no cache state.
  - WHEN the user opens the context popover, the AI Agent Panel shall show a "Prompt cache" section with the state ("Refreshing", "Warm", "Expiring" or "Cold"), the time left, the cached tokens, the expiry time with the lifetime, and the note "Estimated from the last request; Claude Code reports no expiry. Each request restarts the timer."

Every accepted ID must appear in an automated test name or an explicit manual
verification row before release close.

## Non-goals

- Usage without a running conversation: nothing starts a CLI process or reads
  a credential just to draw the plan-usage segment (recorded, the header
  comment of `src/usage-core.ts`, docs/current/SECURITY.md).
- Reading Claude Code's login token to call the usage endpoint directly:
  Anthropic's terms forbid intermediating subscription credentials (recorded,
  docs/current/LEGAL.md).
- Spending limits, budgets or cost confirmations: the panel shows cost and
  usage but never stops a turn on them; reason not recorded.
- Pricing subscription use: costs are API prices and subscribers are pointed
  to `/usage` (recorded, `costReport` in `src/commands.ts`).
- Usage per profile: usage is account-level and follows whichever running CLI
  answers (recorded, docs/current/design/DES-007-usage-and-cost.md).

## Security and privacy

- The panel holds no credential and makes no request of its own; the CLI makes
  the authenticated usage call with its own login.
- `get_usage` is experimental in Claude Code and free to change or vanish
  (recorded, `src/protocol/client.ts:346-348`); every reply field is
  type-checked before use.
- Usage shows the account of whichever conversation's CLI answered; with
  profiles logged in to different accounts it changes as tabs change.
- Usage and credits cards, with plan percentages and credit amounts, are kept
  in history and exported notes (PRD-003).
- An `ANTHROPIC_API_KEY` present when Obsidian starts makes the CLI bill that
  key; such logins report no plan limits (README Requirements).

## Failure and recovery

- Usage figures live in memory only; after a reload the plan-usage segment
  waits for the next running conversation.
- During a long CLI or Anthropic outage the plan-usage segment keeps its last
  figures with the failure in its hover card (R2) and retries once per refresh
  interval (R3).
- A resumed CLI continues its session's `total_cost_usd` (R7); whether a
  killed process's last spend is persisted into that total is untested.
- The prompt cache countdown is an estimate (R11) and starts empty after a reload.
- A branch's fork base is the source session's latest total recorded on this device when the fork starts; spend on that session the panel never recorded still counts in the branch (R7).

## Open questions

None.
