# CHG-008 — Transcript board rendering

**Status:** incorporated (2026-10-13)

## Intent

The owner's "look like the mock; animations and indicators as on the boards"
item. The boards show a streaming reply as formatted Markdown in a card, a
steps group without a header while it works and expanded once it is done, and
a turn cost like "$0.021". Task 061 implements it.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R15** — Streaming messages.
  - Before: WHEN reply text streams in, the AI Agent Panel shall append it to the messages as plain text and scroll it into view.
  - After: WHEN reply text streams in, the AI Agent Panel shall show it in a card as Obsidian Markdown, re-rendered at most every 250 ms, and scroll it into view.
  - Reason: the boards show formatted text while it streams, not plain text that changes at the end.
  - Before: IF Markdown rendering fails, THEN the AI Agent Panel shall keep the plain text.
  - After: IF Markdown rendering fails, THEN the AI Agent Panel shall keep the text as plain text.
  - Reason: the plain text is now the fallback for streamed text too.
- **PRD-001.R16** — Tool steps.
  - Before: WHILE a group of two or more calls is open, the AI Agent Panel shall head it with "N steps" and a running mark.
  - Before: WHEN a group of two or more calls closes, the AI Agent Panel shall head it with an error mark if any call failed, else a done mark, then "N steps" and the group's duration.
  - Before: WHEN a group of three or more calls closes, the AI Agent Panel shall collapse it.
  - Before: WHEN Claude starts a tool call, the AI Agent Panel shall add to the turn's open group a step row with the tool's icon and name, a summary of up to 96 characters (file path, command, pattern, URL or description) and a running mark.
  - Before: IF a group holds one tool call, THEN the AI Agent Panel shall show it as a single row with its running, done or error mark and no header.
  - Before: WHEN the tool's result arrives, the AI Agent Panel shall mark the row done or error and offer an expandable "Details" with the input (up to 2000 characters) and the result (up to 1500 characters).
  - After: WHILE a group of two or more calls is open or any of its calls runs, the AI Agent Panel shall show its rows without a header.
  - After: WHILE a group of two or more calls is closed and none of its calls runs, the AI Agent Panel shall head it with an error mark if any call failed, else a done mark, then "N steps" and the group's duration, and show it expanded until the user collapses it.
  - After: WHEN Claude starts a tool call, the AI Agent Panel shall add to the turn's open group a step row with the tool's icon and name, a summary of up to 96 characters (file path, command, pattern, URL or description) and a running mark of three pulsing dots.
  - After: IF a group holds one tool call, THEN the AI Agent Panel shall show it as a single row with its running or error mark and no header; a done row shows no mark and is named "Done" for screen readers.
  - After: WHEN the tool's result arrives, the AI Agent Panel shall mark the row done (no visible mark, named "Done" for screen readers) or error and offer an expandable "Details" with the input (up to 2000 characters) and the result (up to 1500 characters).
  - Reason: the boards show running rows alone with dots and a finished group's head over expanded rows, and no check on a done row; a group no longer collapses by itself.
- **PRD-001.R29** — UI performance.
  - Before: WHILE reply text streams, the AI Agent Panel shall append each text delta to the open block without re-rendering earlier messages.
  - After: WHILE reply text streams, the AI Agent Panel shall render the open block's Markdown at most every 250 ms, or every four times the last render took if longer, and not while the block is off screen or its window is in the background, without re-rendering earlier messages.
  - Reason: R15's Markdown while streaming needs a bound on render work; the 100 ms frame and 50 ms echo clauses stay.

### PRD-005

- **PRD-005.R7** — Turn cost and conversation totals.
  - Before: WHEN a turn finishes without an error, the AI Agent Panel shall show on its turn footer the duration in seconds to one decimal and the turn's cost to four decimals, being the `total_cost_usd` the CLI reports minus the one the previous finished turn of the same session reported, and record the duration and the reported total (a turn that ends in an error: PRD-001.R15).
  - After: WHEN a turn finishes without an error, the AI Agent Panel shall show on its turn footer the duration in seconds to one decimal and the turn's cost to three decimals ("<$0.001" when above zero and below that), being the `total_cost_usd` the CLI reports minus the one the previous finished turn of the same session reported, and record the duration and the reported total (a turn that ends in an error: PRD-001.R15).
  - Reason: every board reads "$0.021"; the exported line keeps four decimals (PRD-003.R13).

## REMOVED requirements

None.

## Design and migration impact

DES-003 Turn, Tool steps, Token contract (`ease-out`, `duration-dots`),
Performance budget; task 061. No stored data changes; the recorded cost keeps
its precision.

## Incorporation

Folded into PRD-001 and PRD-005 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-008-transcript-board-rendering.md`, in task
061's commit.
