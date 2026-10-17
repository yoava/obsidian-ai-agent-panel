# DES-007 — Usage and cost

**Status:** accepted (2026-10-10)

## Requirements

Designs [PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md), R1 to R11.

| ID | Capability | Section below |
| --- | --- | --- |
| PRD-005.R1 | Usage source | Which client answers, Usage service |
| PRD-005.R2 | Caching and rate floor | Usage service |
| PRD-005.R3 | Background refresh | Scheduling |
| PRD-005.R4 | Plan-usage segment | Usage surfaces |
| PRD-005.R5 | Usage details | Usage surfaces |
| PRD-005.R6 | Usage commands | Usage surfaces |
| PRD-005.R7 | Turn cost and conversation totals | Cost and tokens |
| PRD-005.R8 | Context segment | Context segment |
| PRD-005.R9 | Cost command | Cost command |
| PRD-005.R10 | Degrade quietly | Degrade quietly |
| PRD-005.R11 | Prompt cache state | Prompt cache |

Manual verification obligations, in a desktop vault with a subscription login and with an API-key login:

- R1 to R3: no CLI process and no network request appears before a conversation starts; the plan-usage segment stops refreshing while the sidebar or window is hidden or fit step 4 hides it; after a failure the next background request waits one refresh interval.
- R4 to R6: the plan-usage segment, its thresholds and placeholders, its hover card, the popover and its Refresh button, the three usage cards.
- R7 to R9: the turn footer's duration and cost and its hover card, `/cost`'s conversation cost after a respawn and after a reopen, the context segment with its hover card and popover, `/cost` with and without a running CLI.
- R10: an unanswered or failing lookup produces no Notice and no error in the tab.

## Context and constraints

- Fixed by ADRs: usage and account data only through the running CLI ([ADR-003](../../current/adr/ADR-003-plan-usage-and-account-data-through-the-cli.md)); the CLI over stream-JSON ([ADR-001](../../current/adr/ADR-001-drive-the-installed-cli-over-stream-json.md)).
- The constitution forbids network requests, credentials and telemetry of the plugin's own. Every number here is either reported by the CLI in a `result` message or asked of a running CLI over the stdio pipe.
- `get_usage` is marked experimental by Anthropic. `get_usage`, `get_context_usage` and `get_session_cost` replies are untyped control-protocol payloads; every field is type-checked before use.
- `total_cost_usd` is the session's running total: a process resumed with `--resume` continues it, and `modelUsage` likewise ([real-CLI run 2026-10-10](../../records/verification/2026-10-10-real-cli-compact-and-cost.md)). Summing per process would double count.
- Component map and the wiring of services in `main.ts`: [DES-001](../../current/design/DES-001-system-overview.md). Control-request transport, timeouts and process respawn: [DES-002](../../current/design/DES-002-cli-client-and-session-lifecycle.md). The status line, turn footer, panel-command orchestration and how a report card is drawn and recorded: [DES-003](DES-003-panel-ui.md). Stored meta records: [DES-005](../../current/design/DES-005-persistence-and-sync.md).

| Module | Job here | Imports `obsidian` |
| --- | --- | --- |
| `usage-core` | `UsageService` (fetch, cache, floor, failure back-off, the one timer, listeners); `parseUsage`; the snapshot types | no |
| `state/usage-segment` | The plan-usage segment's items, tint and placeholders; its hover rows; the popover's lines; the `/usage` and `/usage-credits` cards as `CommandReport`s (`usageReport`, `creditsReport`); `usageThresholds`, `formatReset`, `formatRemaining` | no |
| `state/status-line` | The context segment, its hover card and popover; whether the plan-usage segment counts as visible (`usageSegmentVisible`) | no |
| `protocol/client` | `getPlanUsage`, `getContextUsage`, `controlRequest` | no |
| `session` | `liveClient`, `contextUsage`, `control` | no |
| `commands` | `costReport`, `conversationCost`, `formatTokens`, `contextCategoryKind` (the `CommandReport` model and `reportMarkdown`: DES-003) | no |
| `state/turn-cost` | `turnCosts`, the footer's figures (`figuresText`), the turn's tokens and their hover rows (`turnTokens`, `tokenRows`) | no |
| `transcript-markdown` | Each exported turn's duration and cost line, from `turnCosts` | no |
| `tab/chat-tab` | At a `result`: the turn record, the footer's figures and tokens, the token totals, the context lookup | yes |
| `ui/turn` | Draws the footer's duration and cost and their hover card ([DES-003](DES-003-panel-ui.md#turn-head-thinking-and-footer)) | yes |
| `tab/panel-commands` | Runs `/usage`, `/usage-credits`, `/extra-usage` and `/cost` into their cards and records them | yes |
| `report-view` | Draws the `/cost` and usage cards (`ReportCard`: DES-003) | yes |
| `view` | The forced refresh after a turn, the status line's usage intents | yes |
| `ui/status-line` | Draws the plan-usage and context segments and their hover cards, opens their popovers, reports the plan-usage segment's visibility ([DES-003](DES-003-panel-ui.md#status-line)) | yes |
| `ui/popovers/plan-usage`, `ui/popovers/context` | The "Plan usage" and "Context" popovers | yes |
| `ui/hover-card-host` | Shows the segments' hover cards ([DES-003](DES-003-panel-ui.md#popovers-hover-cards-and-tooltips)) | yes |
| `main` | Builds the one `UsageService`; supplies its config and client getters | yes |

## Proposed design

### Control requests

| Request | Sent through | Timeout | Feeds | Starts a CLI |
| --- | --- | --- | --- | --- |
| `get_usage` | `ClaudeClient.getPlanUsage` | 15 s | Plan-usage segment, its hover card and popover, `/usage`, `/usage-credits`, `/extra-usage` | never |
| `get_context_usage` | `ClaudeSession.contextUsage` -> `ClaudeClient.getContextUsage` | 15 s | Context segment, its hover card and popover | never |
| `get_session_cost` | `ClaudeSession.control` on a session that is already running | 30 s | Second section of `/cost` | never |

None costs a model turn. `/context` sends `get_context_usage` too, through the report-command path, which may start the CLI (DES-003).

### Which client answers

- `main.ts` builds one `UsageService` for the plugin with two getters: the refresh interval from settings, and a client.
- The client getter walks the open panel views in workspace order and returns the first non-null `view.liveUsageClient()`.
- `liveUsageClient()` returns the active tab's `session.liveClient`, else that of the first other tab that has one. `liveClient` is the session's current `ClaudeClient` or null; it never spawns.
- The tab's profile plays no part. The service holds one snapshot, not keyed by profile or account, so the figures are those of whichever login answered last.

### Usage service

`UsageService.refresh(force)` in `src/usage-core.ts`, first match wins:

1. A request is in flight: return that same promise.
2. Not forced, and the snapshot is younger than `max(10, usageRefreshSeconds)` seconds: return the snapshot.
3. Not forced, and the last attempt failed less than `max(10, usageRefreshSeconds)` seconds ago: return the current snapshot, which may be null, without a request.
4. Less than 10 s since the last attempt: return the current snapshot without a request. This floor applies to forced refreshes too; a forced call inside it is dropped, not deferred.
5. Otherwise record the attempt time and fetch. On success the snapshot is replaced, `lastError` cleared and the failure time dropped. On failure the snapshot is kept, `lastError` set and the failure time recorded. Either way every listener is called.

- A kept snapshot never expires; after a failure the plan-usage segment keeps showing it, with the error in its hover card and the popover. `lastError` stays set until the next success.
- A forced refresh (Refresh in the popover, a usage command, a finished turn) skips steps 2 and 3, not the floor.

| Fetch outcome | `lastError` |
| --- | --- |
| No running client | "Plan usage comes from a running session - send a message first." |
| Reply is not an object | "This CLI version does not report plan usage." |
| `rate_limits_available` is `false` | "No plan limits on this login - API-key and Bedrock/Vertex sessions have none." |
| Control error, timeout, or process gone | The client's error text, such as `Control request timed out: get_usage` |

The snapshot lives in memory only.

### Reply parsing

`parseUsage` reads `rate_limits` from the reply; an absent or non-object value gives a snapshot with no windows.

| Reply field | Snapshot field |
| --- | --- |
| `rate_limits.five_hour`, `.seven_day`, `.seven_day_sonnet`: `{utilization, resets_at}` | `fiveHour`, `sevenDay`, `sevenDaySonnet`: `{utilization, resetsAt}`, each part null unless a number or a string |
| `rate_limits.model_scoped[]`: `{display_name, utilization, resets_at}` | `modelLimits[]`; an entry without a string name and a numeric utilization is dropped |
| `rate_limits.extra_usage`: `{is_enabled, monthly_limit, used_credits, utilization, currency, disabled_reason}` | `extraUsage`; amounts are minor currency units, divided by 100 for display |
| - | `fetchedAt`: the time of parsing |

### Scheduling

One timer for all panel views, owned by `UsageService` in `src/usage-core.ts`. Each view's status line tells the service whether its plan-usage segment can be seen through `setSegmentVisible(line, visible)`: `showUsage` on, the document not hidden, the segment rendered at the last fit pass (the window, the panel's sidebar and pane shown; not hidden by the 360 px rule), and a fit step below 4 (`usageSegmentVisible` in `state/status-line`; [DES-003 Status line](DES-003-panel-ui.md#status-line)).

- The status line reports after every resize pass from what the pass read, and at once on `visibilitychange` (of the window the panel is in, followed when the panel moves to another window), workspace `layout-change`, `active-leaf-change` and `resize`, and the plugin's `settings` event from whether the segment renders now, each of which also requests a pass. Unloading reports hidden.
- No segment visible anywhere: the service clears the timer. Nothing runs in the background.
- At least one segment visible: one interval timer with period `min(30 s, max(10 s, usageRefreshSeconds))`. Each tick calls `refresh()` and notifies the subscribed status lines, which redraw their segments and so keep the reset time current. A snapshot is therefore requested within one period.
- When a segment becomes visible, the service notifies the subscribed status lines, so it redraws at once, and calls `refresh()`.
- After every `result`, the tab calls the view's `refreshIfVisible()`: a forced refresh if the service counts any segment visible.
- A settled fetch notifies the subscribed status lines: a visible segment redraws; a hidden one is marked dirty and redrawn at the status line's next fit pass while the panel shows, since its width decides whether it fits, or when it is next reported visible.
- On unload `main` calls `dispose()`: the timer stops and the subscriptions are dropped.
- A usage-setting change (the plugin's `settings` event) makes each status line redraw for new thresholds and report again; the service re-times the timer when the period changed.

With no running session each request ends at the client getter returning null, so nothing is sent; the segment reads "usage unavailable - click to retry" until a conversation runs, and the first finished turn forces a refresh.

### Usage surfaces

The hover card shows each row under a short title ("5-hour session", "Week", "Week · Sonnet", "Week · <model>"); the popover and `/usage` show the full one. Rows, in order, for the hover card, the popover and `/usage`: "Current session (5h)", "Current week (all models)", "Current week (Sonnet)", then `Current week (<model>)` per model limit. A window with no utilization is left out. Percentages are rounded down. Reset times are `Resets HH:MM · in 2h 27m` in the popover and `/usage`, and `resets HH:MM` in the hover card, with the weekday for another day and no countdown once past.

Plan-usage segment (`usageSegment`), at the status line's end, only while "Show plan usage" is on:

| State | Shown |
| --- | --- |
| Snapshot with windows | `5h N%`, with `resets HH:MM` from a 560 px main column; then the highest weekly window: `wk N%` for the all-models week, `Sonnet N%`, or `<model> N%`, a tie going to that order; each when reported |
| Snapshot without windows | "no usage limits" |
| No snapshot, no error | `usage…` |
| No snapshot, an error | "usage unavailable - click to retry" |

- Each percentage takes the warning color from `usageWarnPercent` (default 70) and the critical color from `usageCritPercent` (default 90); the segment is tinted by the higher of its items. Each threshold is settable from 0 to 100 in steps of 5; the percentages are always in text.
- Accessible name: "Plan usage: " and the items as shown ("5h 42%, wk 18%"), or the placeholder.
- Hover card (`usageHover`): `⚠ Refresh failed: <error>` first when the last request failed, then each row with its percent in its threshold color and its reset time; with no row, "Fetching usage…" before the first answer, or "No usage limits reported for this account." for a snapshot without windows. It redraws while shown on every settled request and tick.
- A click opens the "Plan usage" popover.

"Plan usage" popover (`usagePopover`, `ui/popovers/plan-usage`):

- On open it requests usage, forced when the last request failed (so "click to retry" retries; the 10 s floor still applies), else not forced. While shown it subscribes to the service and redraws in place on every settled request and tick.
- Lead: "as of HH:MM", or `⚠ Refresh failed: <error> - showing data from HH:MM.`; with no snapshot, `Couldn't fetch usage: <error>` or "Fetching usage…". Beside it Refresh, disabled while the service has a request in flight (`refreshing`, read at every draw, so a tick or another view's show does not re-enable it); a click requests a forced refresh.
- One bar per row: title, percent and bar in its threshold color, reset time; or "No usage limits reported for this account."; then the extra-usage line when enabled.
- Footer: "/usage in chat", which closes the popover and runs `/usage` in the tab (while a restore runs, nothing, and the popover stays), and "Usage settings ↗", an `external-link` anchor to `https://claude.ai/settings/usage` that Obsidian opens in the browser.
- Focus on open: Refresh, or "/usage in chat" while Refresh is disabled.

Cards (`tab/panel-commands`), drawn and recorded as every report card ([DES-003](DES-003-panel-ui.md#report-cards)):

- `/usage`, `/usage-credits` and `/extra-usage` are answered in the panel: the command shows as a compact message and its card loads ("Checking usage…") while `refresh(true)` runs, then shows the `CommandReport` `state/usage-segment` builds.
- `/usage` -> `usageReport`: "Plan usage", lead `As of HH:MM`, a bar per row (title, percent in its threshold tint, `Resets HH:MM · in 2h 27m`), "Extra usage" while enabled (spent against the cap, with a bar and the percent of the monthly cap while there is a cap), and the note `Warning from N%, critical from M%.`; "No usage limits reported for this account." in its place when there is neither a row nor extra usage.
- `/usage-credits`, `/extra-usage` -> `creditsReport`: "Usage credits", lead `As of HH:MM · also answers /extra-usage`, status with any disabled reason, monthly limit, credits used this period with a bar and the percent of the cap, a link to claude.ai/settings/usage; or "Extra-usage credits aren't reported for this account (API-key setups and some plans don't have them)." with the link.
- With no snapshot: a failed card, `Couldn't fetch usage: <error>`. With an older snapshot and a failed refresh: the old figures plus `⚠ Refresh failed (<error>) - showing data fetched at HH:MM.`
- Recording: DES-005.

### Cost and tokens

Source: each `result` message carries `session_id`, `duration_ms`, `total_cost_usd` (the session's running total) and `usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`).

| Figure | Where | Computed as | Lives in |
| --- | --- | --- | --- |
| Turn cost | Turn footer and each exported turn: duration to one decimal, cost to four. An error result shows and records the error text instead of either, and still records `costUsd` without showing it | `turnCosts`: the turn's `total_cost_usd` minus the previous record's of the same session id; a session's first turn costs its whole total; records without a session id are one session, continued by the first later session as `conversationCost` counts them, so the turns add up to the conversation's cost while no total drops; a total lower than the turn before (a killed process's lost spend) costs 0, and then the turns add up to more than the conversation's cost, which takes the latest total | Derived from history (`meta.durationMs`, `meta.costUsd`, `meta.sessionId`), live and on reopen alike |
| Turn tokens | The footer's duration and cost: a hover card with input, output, cache-write and cache-read tokens and "At API prices; plans count usage instead", for a turn finished since the conversation was opened | The `result`'s `usage` (`turnTokens`), a malformed count as 0 | Memory, on the turn's footer |
| Conversation cost | `/cost`, the tab hover card while above zero (four decimals below $1, two from $1), the export's `cost_usd` | `conversationCost(metas)`: for each distinct `sessionId` among the conversation's meta records, the `costUsd` of its latest record, error turns included, summed. A failed resume, where the CLI starts a new session under the conversation, adds a session id (a branch is a new conversation); respawns and resumes of one session never do. Meta records without a `sessionId` (0.5.0 and earlier, before the turn record) join the first later session if its first reported total is at least their latest total, since a resumed session's total never drops; otherwise they count as a session of their own, and no later session takes them over | Derived from history, so it survives reopen and reload |
| Conversation tokens and turns | `/cost` | Sum over `result` messages since the tab opened the conversation | Memory (`tab/chat-tab`'s status data) |
| Claude Code's own lines | `/cost`, second section | `get_session_cost` reply text | Only in the recorded `/cost` card |

- At every `result`, error results included, `tab/chat-tab` records the turn's meta first, then reads the turn's cost and the conversation's from the records and adds the turn's tokens to the totals.
- The conversation cost is computed from `tab.conversation.messages` (`conversationCost`) when a turn's `meta` is recorded, when the conversation reopens and when it is deleted, and kept in the tab's status data (`tab/chat-tab`).
- The export's `cost_usd` line: [DES-005](DES-005-persistence-and-sync.md).
- A process killed before its last `result` is persisted by the CLI can leave the next process's total lower than the last recorded one; the conversation cost takes the latest record per session as reported.

#### Fork base

A branch's CLI session is a fork of its source, and its `total_cost_usd` starts at the source's whole total at the fork, whatever the rewind. `forkBase` (`{ costUsd, sessionId?, estimate? }` on the branch conversation, [DES-005](DES-005-persistence-and-sync.md)) is that total, so the branch's figures leave it out (`state/fork-base`).

- Recorded when a fork starts: `ClaudeSession` reports `onForkStart(source)` as it sends the branch's rewind to a fresh fork process, which is the branch's first message and each retry after a refused rewind. The view (`recordForkBase`) sets `forkBase` on the branch conversation, replacing an earlier fork's, and saves it.
- Its cost is the latest `costUsd` an open tab's conversation recorded for the source session (`sessionTotal`), the largest if several tabs did. With none, or while a turn runs in a tab holding the source, there is no `forkBase` (`decideForkBase`): unknown is never zero.
- `estimate` is true unless the panel recorded every turn of the source: the source is in `started` of the conversation that recorded the chosen total (`SessionProvenance.began`, so it was begun in the panel and not grandfathered or resumed from elsewhere), no agent or background task runs in a tab holding it, and no other open tab holds or runs it.
- `forkBase.sessionId` is the fork's first reported session id, filled when the rewind succeeds (`onBranchCut`), before the fork's first turn record. The base comes off that session's figures only, once it is among the records (`forkTarget`); every other session counts in full. A fork dropped without a session of its own (a refused rewind that will not be retried, a resume dropped or refused, a lost resume) deletes the base (`SessionLink.abandonForkBase`), so a fresh session after it shows its whole cost.
- The fork session's share of the conversation cost is its latest total minus the base; its first turn costs its total minus the base; later turns cost the difference of totals, as for any session. A total below the base costs 0. `conversationCost(messages, forkBase)`, `turnCosts(messages, forkBase)`, the footers of a reopened branch (`modelFromStored`), `/cost`, the tab hover card and the export all take it.
- Notes (`costNote`): an estimate shows "Estimate: can include some cost of the conversation it branched from"; a branch (its records hold a branch record) with no `forkBase` shows "Includes the cost of the conversation it branched from"; an exact base shows none. They appear in the notes of `/cost` and under the cost on the tab hover card.
- A branch reopened from disk whose source is not open in a tab records no base at its next fork start: the source's total is only in the source's file, which the panel does not read for this, so the note applies.

### Context segment

- After each `result`, `tab/chat-tab` calls `session.contextUsage()`. It returns null when the CLI is not running or the request fails; the segment then keeps the last value, or shows no percentage.
- The segment never asks before a conversation's first finished turn; the CLI refuses the request until then. `/context` can ask at any time (DES-003).
- The segment is the status line's ([DES-003](DES-003-panel-ui.md#status-line)), from `contextSegment` in `state/status-line`: hidden while the tab has no finished turn since it opened the conversation; then a ring whose arc is the percentage, and the percentage rounded, in the warning color from 80% as shown; with no reply yet, an empty ring and no percentage. Accessible name: `Context: <used> of <window> tokens (<P>%)`, or "Context: not reported"; while the CLI reports compacting it ends ", compacting" and the segment is tinted ([DES-003 Status line](DES-003-panel-ui.md#status-line)).
- A clear (PRD-001.R38) empties the figure and hides the segment until the next finished turn (`StatusData.contextHidden`); the new session's first `result` asks again as any. The cache is marked cold at once (next section). The new session's cost counts as a second session of the conversation (`conversationCost`).
- Hover card (`contextHover`): "Context", the tokens used of the window ("68.4k of 200.0k tokens") and a bar; with no reply, "Claude Code has not reported the context window yet."
- A click opens the "Context" popover (`contextPopover`, `ui/popovers/context`), drawn from the last reply as it stood at open: the model (the reply's, else the one the CLI last reported) and window size; the tokens used and the percentage; a bar of each category in the window by its share of it, the autocompact buffer hatched at the end and free space the rest; a legend of every category with tokens except free space, deferred ones marked "(deferred)" and left out of the bar; `Autocompacts at <threshold> · <tokens to go> to go` when the reply has autocompact on and a threshold; and "/context details", which closes the popover and runs `/context` in the tab (while a restore runs, nothing, and the popover stays).
- `ClaudeClient.getContextUsage` normalizes the reply: it needs numeric `totalTokens` and `maxTokens`, else null; `percentage` is the reply's, else the rounded ratio; a category entry must be an object with a string `name` and numeric `tokens`, else it is dropped; an entry that is not an object is dropped first; a trailing "(deferred)" in a name is stripped and folded into the `deferred` flag together with `isDeferred` and a `kind` of "deferred"; a category's `kind` is kept when a string, else ""; `model` is kept when a non-empty string, else null; `autoCompactAt` is `autoCompactThreshold` when that is a number and `isAutoCompactEnabled` is `true`, else null. A category's kind is its `kind`, else read from its name ("Free space", "Autocompact buffer"), by `contextCategoryKind` in `commands`, which `/context` shares.

### Prompt cache

The CLI reports cache writes by lifetime but no expiry, so the countdown is an estimate, kept per tab in `StatusData.cache` (`state/prompt-cache`) and empty after a reload.

- `cacheAfter(cache, message, now)` folds each stream message in `tab/chat-tab.applyStream`, ignoring any message with a `parent_tool_use_id` (a subagent's five-minute writes never set the main countdown). A main-agent `message_start` marks the cache refreshing. A main-agent `assistant` message whose usage read or wrote the cache restarts the timer at `now`: the lifetime is one hour when its `usage.cache_creation.ephemeral_1h_input_tokens` is above 0, five minutes when only `ephemeral_5m_input_tokens` is, and the previous one when it writes nothing; the cached tokens are `cache_read_input_tokens` plus `cache_creation_input_tokens`. `message_stop` and `result` end the refreshing (`cacheIdle`). A `compact_boundary` system message, and a model pick or a reported model that differs from the last, make the cache cold (`coldCache`).
- `cacheView(cache, now)` derives the state: refreshing while a response streams; cold when marked cold or the time has run out; expiring under one minute left; warm otherwise. Time left reads `m:ss`, and whole minutes (`52m`) above 10 minutes.
- Surfaces: the context segment's divider, bolt (`zap`, `zap-off` while cold) and time, its accessible label and hover row ([DES-003 Status line](DES-003-panel-ui.md#status-line)); the context popover's "Prompt cache" section (state, time, a bar, cached tokens, expiry time with the TTL, and the note "Estimated from the last request; Claude Code reports no expiry. Each request restarts the timer.", from `cacheSection` in `state/cache-surfaces`); a live `/context` card's cache line ([DES-003 Report cards](DES-003-panel-ui.md#report-cards)). Recorded Markdown never holds it.
- Compact (the popover) and "/compact now" (the card) send `/compact` through the send path, titled "Summarize the conversation now (uses tokens)", and are disabled while a turn runs or a restore is under way (`compactAllowed`, one predicate for both buttons and the send).
- Ticking uses the shared `state/ticker`: a subscriber may name `periodMs`, and the timer runs at the shortest period among the shown subscribers. The cache's period is one minute while more than 11 minutes are left, else one second. A surface subscribes as shown only while the view it last drew has a countdown (warm or expiring), so a refreshing or cold cache costs no timer and the draw that turns it cold still happens. A subscriber may name a `phase` (the expiry): when it changes, the timer starts again, so a minute label flips a minute after a restart.

### Cost command

- `/cost` builds `costReport(<the tab's token totals>, conversationCost(messages, forkBase), cliText, costNote(messages, forkBase))` and never starts a CLI.
- First section, "This conversation, since opened": turns, input, output, cache written, cache read.
- Second section, "This conversation, all turns": one row, the conversation's cost, which also covers turns from before the tab opened it.
- `cliText` is the `text` of a `get_session_cost` reply, asked only when the tab's session is running. Lines of the form `label: value` become the section "Claude Code, since it last started". A failed request, or no parsable line, omits the section.
- Note: "Costs are API prices. On a Claude subscription they come out of your plan's limits instead - /usage shows those." A branch adds the fork-base note under it ([Fork base](#fork-base)).
- The card is drawn by `ReportCard` and recorded as `reportMarkdown(report)`, like every report command; both are specified in [DES-003](DES-003-panel-ui.md#report-cards).

### Degrade quietly

| Lookup | On failure |
| --- | --- |
| `get_usage` | `lastError` is set and shown only in the plan-usage segment's text and hover card, the popover, and a usage card the user asked for. No Notice, no error block in the tab. |
| `get_context_usage` | null; the context segment keeps what it had, or shows no percentage |
| `get_session_cost` | The section is left out of `/cost` |
| A reply field of the wrong type | That value is null or the entry is dropped |

## Architecture rules

`tests/architecture.test.mjs` checks G1 and G2; review checks G3. Already stated elsewhere and relied on here: DES-001 A8 and A9 (no process, file or network API in the usage modules); DES-002 B6 (the usage service gets the client typed as the narrower `UsageClient`).

| # | Rule |
| --- | --- |
| G1 | `usage-core` imports only `settings-core` and `timers`; it reaches the CLI only through the injected `UsageClient` |
| G2 | Only `main` imports `usage-core` at runtime; other modules take its types only |
| G3 | `conversationCost` is a pure function in `commands`, used by the tab's status data, `/cost` and the exporter, so the figure is computed once |

## Data and security

The user-facing threat model is [SECURITY.md](../../current/SECURITY.md).

- Credentials: none. The CLI makes any authenticated call with its own login; the plugin reads no token, file or keychain entry.
- Network: none of the plugin's own. The popover's settings link reaches the browser only on a click.
- No process is started for usage, the context segment or `/cost`.
- At rest: the usage snapshot and the token totals are memory only. Usage, credit and `/cost` cards (plan percentages, credit amounts, token and cost figures) and each turn's cost are stored in history and exports (DES-005).
- The snapshot carries no account identity. With profiles logged in to different accounts, the plan-usage segment shows the account of whichever running CLI answered, which need not be the active tab's.
- An `ANTHROPIC_API_KEY` in Obsidian's environment makes the CLI bill that key; such a login reports no plan limits, which the plan-usage segment shows as unavailable with the reason in its hover card.
- Costs are API prices reported by the CLI; the panel computes none and enforces no budget.

## Rollout and rollback

- Switches: `showUsage` (on by default), `usageRefreshSeconds` (default 300, at least 10), `usageWarnPercent`, `usageCritPercent`; synced units by default and applied to open views at once.
- Compatibility: `get_usage`, `get_context_usage` and `get_session_cost` can change or disappear in any Claude Code release. No version is checked; a missing request shows as the texts under Degrade quietly.
- Observability: the plan-usage hover card and popover show the last error, the popover the fetch time. Nothing is logged.
- Rollback: turning `showUsage` off stops the timer and every automatic `get_usage`; the usage commands still ask on demand. There is no persisted state to undo.

## Alternatives

Covered by ADR-003: reading the CLI's stored OAuth token and calling the usage endpoint, starting a CLI process to fetch usage, sending `/usage` as a turn and parsing the reply. Design-level choices:

- Conversation cost: the highest total seen since the tab opened, or a sum per process, against the latest total per session id summed across ids. Per session id, because a resumed process continues its session's total ([real-CLI run 2026-10-10](../../records/verification/2026-10-10-real-cli-compact-and-cost.md)), and the meta records carry the session id.
- Turn cost: the last total seen in memory, against the recorded totals. Recorded totals, so a reopened turn shows the figure it showed live and the export the same.
- Retry after a failure: on every tick, against once per refresh interval. Once per interval, so an outage does not draw a request every 10 to 30 s.

## Verification

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| PRD-005.R1 to R3 | `tests/usage-core.test.mjs`, `UsageService` over a fake clock: the failure reasons, in-flight sharing, freshness, the 10 s floor, the failure back-off (also across a hide and show), one timer for all views, its period and re-timing, one background request per interval through an outage, the in-flight flag the popover draws from, the forced refresh after a turn, `dispose`; `tests/state-status-line.test.mjs`: polling needs the segment on, rendered, a visible document and a fit step below 4; `tests/protocol.test.mjs`: the fake CLI's `get_usage` reply and refusal | The timer in a real window (hidden sidebar, two panels, fit step 4), no process before a conversation |
| PRD-005.R4 to R6 | `tests/usage-core.test.mjs`: `parseUsage` keeps well-typed fields only; `tests/state-usage-segment.test.mjs`: item choice, labels, tints, placeholders, hover rows, popover lines, failure text, the reset formats, the two cards | The segment, hover card, popover and cards with each login |
| PRD-005.R7 | `tests/commands.test.mjs`, `conversationCost`: two processes of one session count once; a second session id adds; records without a session id join a resumed session that continues their total and otherwise count separately; the latest total stands, error turns included; malformed and non-meta records add nothing. `costReport` puts the cost in its own section. `tests/state-turn-cost.test.mjs`: a turn's cost from the totals, a session's first turn, sessions apart, reopen and error turns adding up to `conversationCost`, records without a session id, a lower total costing 0, the footer's figures, the tokens and their rows; `tests/state-tab.test.mjs`: reopened footers, a branch's first footer; `tests/transcript-markdown.test.mjs`: each exported turn's own cost, a branch's without its base. Fork base: `tests/state-fork-base.test.mjs`: the base, its absence, the estimate, the session it comes off, the notes; `tests/commands.test.mjs` and `tests/state-turn-cost.test.mjs`: the base off the conversation and the first turn, a total below it, the `/cost` note; `tests/history-file.test.mjs`: a base read as absent or as an estimate; `tests/state-session-provenance.test.mjs`: `began`; `tests/state-tabs.test.mjs`: the card's note; `tests/session.test.mjs`: `onForkStart` at the first send and the retry, not for a resume or a refused fork, and the fake CLI's fork total (`FAKE_CLI_SOURCE_TOTAL`) | The footer's figures and hover card (`turn`, `basic`); `/cost`'s conversation cost across a respawn, a reopen and a `/clear` segment; the exported `cost_usd` and turn lines; a branch's first turn, `/cost` note and hover card against a source with a known cost |
| PRD-005.R8 | `tests/protocol.test.mjs`: "a \"(deferred)\" marker baked into a category name is not kept in the name", "either half of the deferred signal alone still marks the category", "a category name that is nothing but the marker does not survive as one", "malformed categories are dropped rather than rendered" (a null entry among them), "PRD-005.R8: a category whose kind is deferred is marked deferred", "PRD-005.R8: getContextUsage keeps the model, the autocompact point and each category's kind when typed", the fake CLI's reply only after a turn. `tests/state-status-line.test.mjs`: hidden before the first finished turn, warning from 80% as shown, no percentage without a reply, the hover card, the popover | The segment, its timing, its hover card and popover, "/context details" |
| PRD-005.R9 | `tests/commands.test.mjs`: "PRD-005.R9: costReport adds the CLI's own lines when it runs" | No spawn for `/cost` |
| PRD-005.R10 | - | A failing lookup shows no Notice or error block |
| PRD-005.R11 | `tests/state-prompt-cache.test.mjs`: the reducer and view (main-agent writes only, lifetimes, refreshing, expiring, cold, formats); `tests/state-cache-surfaces.test.mjs`: the popover section and card line; `tests/state-status-line.test.mjs`: the segment, label and hover; `tests/state-ticker.test.mjs`: per-subscriber periods; `tests/state-tab.test.mjs`: the empty cache; `tests/protocol.test.mjs`: the fake CLI's turn and steps scenarios (`FAKE_CLI_CACHE_TTL=5m`) | The segment, popover section, card line and both Compact buttons, dark and light, with a real login |
| Resumed `total_cost_usd` | [real-CLI run 2026-10-10](../../records/verification/2026-10-10-real-cli-compact-and-cost.md) | - |

Independent verification boundary: `ClaudeClient.getContextUsage` with a stubbed request, `UsageService` and `parseUsage` over a fake clock, `state/usage-segment`, the context and polling logic in `state/status-line`, `costReport` and `conversationCost`, in plain Node, run by CI through `make verify`, outside the implementing agent's control. The segments, their hover cards and popovers, the cards and the timer in a real window are checked by a person in a desktop vault, against `tests/fake-cli.mjs` and with a real CLI and login. The content of the three replies is a property of Claude Code and cannot be verified in this repository.

## Open questions

None.
