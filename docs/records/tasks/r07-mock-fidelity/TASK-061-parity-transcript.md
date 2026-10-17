---
status: closed
release: r07-mock-fidelity
number: 061
prd: PRD-001.R15, PRD-001.R16, PRD-001.R29, PRD-005.R7
---

# TASK-061 — Transcript turn, steps and replies match the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Survey IDs TR9 to TR30 (turn head, thinking pill, steps card, rows, streaming
card, reply Markdown, footer) and the queued gap "reply code font .86em mono,
inline and in `pre`".

Change: [008](../../changes/CHG-008-transcript-board-rendering.md).

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R15, R16, R29; [PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md)
R7; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md);
[DES-003](../../../current/design/DES-003-panel-ui.md) Turn, Tool steps,
Token contract, Performance budget.

Acceptance:

1. The Claude mark is a 22 px accent-soft tile, 7 px radius, 12 px icon; it
   rings 1.6 s ease-out while the turn runs; the elapsed time is 11 px; the
   thinking pill reads "Thought for Ns" then the chevron.
2. A group of two or more shows rows alone while open or while any row runs;
   once closed with none running it gets a 34 px header (done or error
   mark, "N steps" in weight 500, faint duration, 12 px chevron up while
   expanded), expanded, and never collapses by itself.
3. Rows are 30 px with 22 px tiles (12 px icon); a 1 px `line-strong` rail
   runs through the tiles of a group; a running row's mark is three 4 px
   dots pulsing 1.2 s, delays 0, .2, .4 s, opacity .35 to 1; a done row
   shows no mark but keeps its image role and "Done" name; counts are faint.
4. A file path in a row's summary is vault-relative when inside the vault,
   else as reported.
5. A streaming reply is a card (surface, 1 px line, 12 px radius, 12 px 14 px
   padding, 13.5 px, 1.6) of rendered Markdown, with a 7 by 15 px caret;
   renders are throttled to one per 250 ms or 4 times the last render's cost,
   the first at once and the last trailing, none while the block is hidden; a
   failed render keeps plain text.
6. Replies: paragraphs 0 0 10 px, lists 0 0 10 px with 18 px indent, items
   3 px apart, faint markers, links underlined in the accent line 2 px off;
   code `font-family` mono, `.86em`, inline and in `pre`.
7. Footer: copy button 24 px with a 12 px icon; cost to three decimals
   ("$0.021"), "<$0.001" for a cost above zero that rounds to none; the
   exported note keeps four.

Skipped: TR24 (an earlier turn's footer shows its cost only on Approve): that
board is a simplification, Main shows the full footer, and PRD-001.R15 requires
an always-visible footer. TR26 (caret height) is set to the board's 15 px.

## Scope

Expected files:

- New: `src/state/stream-render.ts`, `tests/state-stream-render.test.mjs`.
- Changed: `src/state/step-groups.ts` (`headShown`, `collapsesAtClose`
  removed), `src/state/turn-cost.ts` (`footerFiguresText`),
  `src/tool-labels.ts`, `src/ui/dom.ts`, `src/ui/steps-card.ts`,
  `src/ui/turn.ts`, `src/view.ts`, `styles.css`, `package.json` (`pretest`),
  and the tests of the changed state modules and `tool-labels`.
- Docs: PRD-001 R15, R16, R29; PRD-005 R7; DES-003 (Turn, Tool steps, token
  table, performance budget); `RELEASE_NOTES.md`.

Negative scope:

- Prompts and the pinned prompt (062), agent rows and the run bar (change 003),
  tool-label wording beyond the path, what a step records.
- No new dependency, no colour literal, no `!important`; the two new tokens
  (`ease-out`, `duration-dots`) are timing only.
- `tests/styles.test.mjs` and `tests/architecture.test.mjs` unchanged.

## Plan

- Tests first: `RenderThrottle` over a 2,000-delta play-through (renders
  bounded, at least the gap apart, first at 0, trailing within one gap), a slow
  render, a delta during a render, reset; `headShown`; `footerFiguresText`
  and the export's four decimals; `summarizeToolInput` with a path placer.
- Streaming renders go into a scratch element and are swapped in; a counter
  voids renders in flight once the block settles.
- Verification: `make verify`; harness pairs of the Main board and the panel,
  dark and light, with measured values.
- Risks: each render is a Markdown child of an owner component; one
  component per block stays alive, the previous unloading at each swap.
  Selection is lost at each swap (accepted). A WSL path reported through
  `/mnt/c/...` stays absolute, as in the edit tracker.

## Run log

- Tests first: the new and changed tests failed on import or assertion before
  the code.
- `figuresText` is shared with the transcript export (PRD-003.R13), so the
  footer got its own `footerFiguresText`; the export keeps four decimals.
- `styles.test.mjs` caught a four-compound selector (the footer copy icon);
  shortened to three. `tooltips.test.mjs` counts `aria-label` sites, so the
  dots live in `writeMark` (a fourth parameter) rather than a new function.
- Requirement wording changed in the same change: PRD-001 R15 (streamed text
  is Markdown in a card, not plain), R16 (no header while open or running; no
  collapse at close), R29 (render throttle in place of delta append), PRD-005 R7
  (cost to three decimals, "<$0.001" under that), all in change 008. For the owner to confirm.
- Harness: Main board against the panel, dark and light, pairs and
  `measured.json` in the scratchpad under `harness/hunt-061/`. The pairs were
  taken again after the review fixes. The pair diff is dominated by fixture
  differences (tabs, scroll position).
- Review fixes, tests first where logic changed: each render has its own
  component (`renderMarkdown` takes an owner), unloaded when the next
  rendering swaps in or the block goes; `RenderThrottle.setHidden` and `due`
  pause renders while the block is off screen (`IntersectionObserver`) or the
  window is in the background (`visibilitychange`), with one render when it
  shows; `drawText` no longer empties the block before the final paint;
  footer cost is three decimals with "<$0.001"; the vault-relative helper is
  `placeInVault` in `edits.ts`, called by the edit tracker and the view;
  caret `vertical-align: -2px`; R16 words the done row as no visible mark
  with the name "Done".
- Harness, a 374-line reply with 22 code fences streamed at 8 characters per
  20 ms in real time (headless Chromium; the harness renders Markdown with
  `marked`, lighter than Obsidian's renderer): no task over 50 ms; keystroke
  echo while streaming p50 14 ms, p95 19 ms, max 25 ms (idle max 17 ms,
  frame wait included); script, layout and style 476 ms over the 26.7 s
  run, at most about 91 renders at the 250 ms gap, so under 6 ms each on
  average; hidden for 4 s: 0 renders; 4 DOM swaps in the 700 ms after it
  shows. Numbers in `harness/p061/perf.json` (scratchpad). The real-Obsidian
  DevTools profile (matrix M8) is on the owner's list.
- `make verify`: see the report.

## Independent review

Round 1: approve with changes, all applied.

1. Major, render children leak: each render now has a component of its own,
   unloaded after each swap and with the block; the Risks line is corrected.
2. Major, R29: renders pause while the block is hidden, with a test, and a
   long reply was measured (Run log); the M8 profile in real Obsidian is the
   owner's.
3. `drawText` keeps the streamed rendering until the final paint swaps in.
4. Footer cost is three decimals with "<$0.001"; code, test, PRD-005.R7,
   change 008, DES-003 agree.
5. PRD-001.R16 and change 008 say "closed ... expanded until the user
   collapses it" and describe the done row as named "Done" with no visible
   mark (the boards show none).
6. One helper, `placeInVault`, with tests.
7. WSL `/mnt/c` paths stay absolute, as in the edit tracker.
8. Caret `vertical-align: -2px`.
Left as is: selection lost at each swap.

Round 2: approve with changes, three minor, all applied. The reviewer
re-ran the streaming harness with a 2,000-delta reply holding 30 vault
embeds and a code fence: live render components stayed at one per block
through 62 swaps and the final swap, and dropped when the tab closed; a tab
hidden for 3 s rendered nothing and rendered once on showing, as did a
reply scrolled off screen; no empty frame at settle, final text complete.

1. PRD-001.R29 and change 008 say "not while the block is off screen or its
   window is in the background", as DES-003 does.
2. The streaming watch uses the block's own window's `IntersectionObserver`
   and removes `visibilitychange` from the document it was added to, kept in
   `view.watch`, so a block that moves to a pop-out cleans up correctly.
3. "<$0.001" is shown for any cost above zero and below 0.001 (0.0007
   included, test added), not when `toFixed(3)` happens to read zero.

## Outcome

Accepted. Streaming replies render as throttled Markdown in a card, steps
and replies follow the boards, and the footer cost reads "$0.021"; change
008 is incorporated into PRD-001 and PRD-005.
