---
status: closed
release: r07-mock-fidelity
number: 064
prd: PRD-001.R32
---

# TASK-064 — Popovers, suggest lists, hover cards and tooltips match the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The survey's Overlays area (OV1 to OV44) lists where the popovers, the `@` and
slash lists and the hover cards differ from the "Redesign dark/light" boards
(PopModel, PopUsage, ContextCache, Tooltips, Empty, Commands). Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R32,
[PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md) R5, R7, R8,
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md),
[DES-003](../../../current/design/DES-003-panel-ui.md) (Popovers, Suggests).

Acceptance: each popover, list and card measures as its board (widths 300,
318, 336; head, body and footer padding; radio 16 px with a 10 px check;
meter, context bar and legend; list padding 6, rows 36 and 38, header and key
hints; hover cards 230 px), in dark and light, with no colour literal,
Obsidian size token or `!important` added and `tests/styles.test.mjs`,
`tooltips` and `layers` unedited and green.

## Scope

Changed: `styles.css`; `src/state/popover.ts`, `status-line.ts`,
`turn-cost.ts`, `usage-segment.ts`; `src/ui/dom.ts`, `popover-host.ts`,
`switcher.ts`, `status-line.ts`, `turn.ts`, `popovers/*`; `src/suggest.ts`;
`package.json` (pretest); DES-003, DES-007, `RELEASE_NOTES.md`. New:
`src/state/suggest-rows.ts` and its test.

Negative scope: no cache section (change 002), no agents popover (change
003), no change to what opens what, focus management or keyboard handling,
no composer or status line work (063).

Skipped, with why: OV26 and OV27 (the board's tooltip chip needs palette
tokens the gate forbids adding here: `tip-bg`, dark rgb(59,59,68) and light
rgb(38,38,44), and `tip-text`; Obsidian's tooltip stays); the OV18 qualifier
(the CLI titles the model rows); OV13 (a harness artifact); OV22 and OV25
(not parity work). OV14's drop shadow under the checked segment is not done:
no palette shadow colour fits, so it needs a token `segment-shadow` =
`0 1px 2px rgba(0,0,0,.2)` in both palettes (the ring is kept).

Done differently from the survey: OV29, the context hover card is text only
(no meter; the context popover keeps its bar); OV30, the plan-usage hover card
names limits "5-hour session", "Week", "Week · Sonnet", "Week · <model>"; the
popover and `/usage` keep the full titles. The usage card's "(in 2h 57m)" is
unchanged.

## Plan

Evidence first: tests for the placement constants, `shortTokens` and the
hover figures, the turn-cost row order, the short usage titles and
`matchedPrefix`/`folderLabel` failed before the code. The popover gets a
shell (`PopoverShell`: `meta()`, `footer()`) so footers sit outside the
scrolling body, as on the boards; the suggest base class gets `headerLabel()`
and `footerHints()` hooks, which 063's `onShownChange` leaves alone. Rejected:
a per-popover stylesheet block for the footer, which would repeat the band
in four places.

## Run log

`make verify` green (log: scratchpad/verify-064.log; needs Node 22 on PATH).
Harness pairs (board | panel | diff, dark and light) in
`harness/hunt-064/final/`: PopModel, PopUsage, ContextCache, Tooltips, Empty,
Commands; measured values in `final/measured.json`; the context popover's
panel crop in `final/Context-panel-<theme>.png` (the ContextCache fixture
does not open it). Measured: popovers 300, 318 (usage) and 336 (context);
head padding 11 8 0 12; footer 6 6 6 12 on the recessed fill; radio 16 px;
`@` list radius 12, padding 6, 38 px rows, 13 px text, accent-soft selected.
Remaining pair differences are fixture content (CLI model names, tab titles,
the empty-state text), not styling. Tooltips: the board stacks seven
specimens, the panel shows one hover at a time.

## Independent review

Reviewer: independent review agent. Approved with changes; its merge check
onto db6d22e passed. Findings and resolutions: (1) major, the ↵ key cap
showed on every `@` row (a later equal-specificity rule won): it now hides on
rows that are not selected; (2) the short titles in DES-007 and the release
note now match the code; (3) OV14 shadow: no fitting token, recorded above;
(4) the context hover card's meter removed; (5) OV26/27, OV29 and OV30
wording corrected above; (6) the `@` footer's hints now have whitespace
between each key and action, and between hints, without changing the look.

## Outcome

accepted
