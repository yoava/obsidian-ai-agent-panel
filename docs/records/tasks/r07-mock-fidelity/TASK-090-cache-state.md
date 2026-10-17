---
status: closed
release: r07-mock-fidelity
number: 090
prd: PRD-005.R11
---

# TASK-090 — Prompt cache state

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

M, from change 002 (now in docs/current): the prompt-cache countdown (PRD-005.R11), estimated from the
cache usage the main agent's responses report, since Claude Code reports no
expiry. It shows in the context segment, its hover card and accessible label,
the context popover's "Prompt cache" section and a live `/context` card, with
two buttons that send `/compact`: the popover's "Compact" and the card's
"/compact now", both titled "Summarize the conversation now (uses tokens)" and
disabled while a turn runs.

Governing: [PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md)
R11 and [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R20, R28, R29 (incorporated from change 002);
[DES-007](../../../current/design/DES-007-usage-and-cost.md) Prompt cache;
[DES-003](../../../current/design/DES-003-panel-ui.md) Status line, Report
cards. Boards: `ContextCache` and `LightContextCache`.

Acceptance:

1. A main-agent `assistant` message that read or wrote the cache restarts the
   countdown; a one-hour write gives one hour, a five-minute-only write five
   minutes; a message with `parent_tool_use_id` changes nothing.
2. States: refreshing while a response streams, warm, expiring under one
   minute, cold after a compaction, a model change, or the time running out.
3. The segment shows the divider, a `zap` (`zap-off` while cold) and the time
   (`m:ss`, whole minutes above 10); the time is hidden below 360 px; the
   accessible label ends "Prompt cache warm, 4:12 left".
4. The shared ticker runs only while a countdown is shown, once a minute while
   more than 11 minutes are left, else once a second.
5. The popover and a live `/context` card show the cache and the Compact
   buttons; the recorded Markdown does not hold it. The card always has the
   footer and "/compact now" (PRD-001.R20), whether the cache reports before
   or after the card draws; the cache line sits in the body above the footer.
   Both buttons share one busy predicate with the send (`compactAllowed`).
   A surface ticks from the view it last drew, so the draw that turns it cold
   happens; the ticker restarts a minute-period subscriber's timer when its
   phase (the expiry) changes.
6. The state is empty after a reload and says it is an estimate.

## Scope

Expected files:

- New: `src/state/prompt-cache.ts`, `src/state/cache-surfaces.ts`,
  `tests/state-prompt-cache.test.mjs`, `tests/state-cache-surfaces.test.mjs`.
- Changed: `src/state/ticker.ts` (per-subscriber periods),
  `src/state/status-line.ts`, `src/state/tab.ts`, `src/tab/chat-tab.ts`,
  `src/ui/status-line.ts`, `src/ui/popovers/context.ts`, `src/ui/messages.ts`,
  `src/report-view.ts`, `src/view.ts`, `styles.css`, `package.json` (`pretest`),
  `tests/fake-cli.mjs`, `tests/protocol.test.mjs`, `tests/tooltips.test.mjs`
  (the allowed sites), and the ticker, status-line and tab tests.
- Docs: DES-003, DES-007, `RELEASE_NOTES.md`.

Negative scope: compaction markers and the divider (089), `/clear`, the fork
base, provenance, the compacting tint, edits to the PRDs or change 002, new
dependencies, a real CLI.

## Plan

- Tests first, in Obsidian-free modules: the reducer and view, the surfaces,
  the ticker's periods, the status-line views, the fake CLI's usage split
  (`cache_creation`) and `message_start`/`message_stop` events.
- One reducer, `cacheAfter`, folded in `ChatTab.applyStream`; `cacheIdle` at
  the turn's end; `coldCache` on a model change.
- One shared ticker; a subscriber names its period and is shown only while it
  displays a countdown.
- Rendering is checked later in the headless harness against the boards.
- Risk: the fit step must re-measure when the cache part changes, so the
  context segment's measure key holds its structure and the time's length.
- Rejected: a ticker of its own per surface (the ticker rule P3).

## Run log

- Tests first: the new modules failed on import; the ticker's period tests
  failed until `periodMs` existed.
- `tests/tooltips.test.mjs` allows the two new tooltips and the cache bar's
  label (an image); both Compact buttons use `writeTooltip`/`setTooltip`, so
  "Show tooltips" off hides them.

## Independent review

Three rounds by a separate review agent, with a browser harness against the
ContextCache, LightContextCache and Commands boards in dark and light at 340,
440 and 600 px.

- Round 1, rework: the countdown froze at expiry on the popover and card, the
  card lost its row when the cache reported late, the minute phase never
  realigned, the hover card rebuilt every tick, two busy predicates, and
  board mismatches on all three surfaces.
- Round 2, rework: the expiring time lost its warning colour, compaction
  turned the cache cold through two parsers, a one-minute disagreement
  between surfaces, spacing and sizes, "167.0k".
- Round 3, land after three edits (applied by the coordinator): DES-003's
  time colour, the "/compact now" mono size, and the recorded note kept as
  one sentence.
- Out of scope, its own `fix`: the context percentage still shows below
  360 px (SPEC §2.7, DES-003), predating this task.

## Outcome

Accepted. `make verify` passes; the surfaces match the boards at the
reviewed widths and themes, apart from palette tokens outside this task.
