---
status: closed
release: r07-mock-fidelity
number: 058
prd: PRD-001.R34
---

# TASK-058 — Mock geometry tokens

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The panel takes its type scale, spacing, corners, shadow geometry and motion
timing from the "Redesign dark/light" boards through panel tokens, not from
Obsidian's `--font-ui-*`, `--size-*` and `--radius-*`.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R34; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
Typography, Radii, Value types, Validation;
[DES-003](../../../current/design/DES-003-panel-ui.md) Token contract.

Acceptance:

1. The token block on `.ai-agent-panel-scope` declares fonts, role font
   sizes, the reply size `calc(var(--font-text-size) * 0.875)`, line heights
   1.5 and 1.62, `-space-*` (only the boards' steps), `-radius-*` (1–10, 12,
   14, 15, pill), shadow geometry, the durations and easings rules read; it
   holds no color, `transparent` or `currentColor`.
2. `styles.css` reads no `--font-ui-*`, `--size-*`, `--radius-*`, channel
   variable or `scroll-state(`; `tests/styles.test.mjs` fails on each.
3. At 440 px: tab h30 r`9 9 0 0` 12.5px; status segment h26 r7 12px; chip h24
   r999 12px; send 30×30 r9; composer r14; cards r12–14; popover r12;
   permission-card buttons h30 r8 12.5px.

## Scope

Expected files: `styles.css`, `tests/styles.test.mjs` (ADR-017 ban and the
token block's no-color check only), `docs/current/design/DES-003-panel-ui.md`,
`RELEASE_NOTES.md`, this record.

Negative scope: colors, font loading, tab markup, DOM or component structure,
new components, new animations.

## Plan

1. Tests first: the ban and the token-block check, seeded; the base
   `styles.css` gives 469 violations.
2. Mechanical migration (`--size-*` → `-space-*`, `--radius-s/m/l` → 4/8/12,
   literal radii → tokens, font families, role font sizes per rule).
3. Per component, the boards' geometry (`project/`, `generator/`; boards over
   SPEC).
4. DES-003 token table; release note; `make verify`; harness facts.

Deviations from the brief:

- Elevation shadows (`shadow`, `shadow-small`, `stuck`, `input-shadow`, …)
  stay whole in the palettes: splitting them means changing the palette
  check's `SHADOW_TOKENS`/`PALETTE_TOKENS` lists, outside this task. Only
  ring, halo, dot and edge geometry moved to the token block.
- `radius-3` added: the boards use it (bars, diff word highlights).
- Durations (review decision): SPEC §2.5 or the boards' value where they name
  the element, otherwise the element's previous duration and easing. They
  name only the settings toggle (0.15 s), which the panel does not style, so
  every transition keeps 100 ms `ease-in-out` or 120 ms `ease`, now through
  `duration-100/120` and `ease`/`ease-in-out`. Unused SPEC durations are not
  declared; the motion task adds what it reads.
- Popover body padding keeps one value: the boards' paddings differ per
  popover. The diff's Rendered toggle keeps its structure: the boards wrap it
  in a segmented control the panel does not have.
- Suggest rows are 36 px, radius 8 (Commands board); the Empty board shows
  38 px, radius 10.
- Margins of 1–2 px on visually hidden elements and the pin's sentinel stay
  literal.

## Run log

- 060 landed mid-task; work moved onto `36646ad` and 060's `pre` and inline
  `code` rules now read `space-10/12`, `radius-4`, `space-1/5`, `radius-5`
  (`tests/styles-markdown-code.test.mjs` passes).
- Harness (`Main`, `Approve`, `PopModel`, `Question`, dark, 440 px): tab
  30 px, `9px 9px 0 0`, 12.5px, padding `0 12px`; status segment 26 px, 7px,
  12px; chip 24 px, 999px, 12px; send 30×30, 9px; composer 14px, padding
  `10px 8px 8px 12px`, gap `8px 2px`, 13.5px; reply text 14px at a 16px font
  size; steps card 12px; permission card 14px, gap 10px; its buttons 30 px,
  8px, 12.5px; popover 12px, 12.5px, title 13px, padding `11px 8px 4px 12px`;
  option rows 7px 8px, 8px, gap 10px; question chip 20 px; Other input 34 px,
  10px, padding `0 11px`; turn action gap 5px. No page errors.
- Handed to 059: at 440 px the boards' tab padding (12/12) on 72 px tabs
  truncates tab titles.

## Independent review

Independent session review (harness `hunt-058r/`, `review-058.log`):
approve with changes. Findings and resolution:

1. DES-003 gave the wrong shadow reason; remaining literal spacing.
   Fixed: the real reason recorded; spacing tokenised, the sentence names the
   1–2 px exceptions.
2. Unused tokens (`duration-pulse-cache`, `-pulse-activity`, `-slide`,
   `-wave`, `ease-out`). Dropped.
3. Transitions moved to 150 ms without a source. Fixed per the decision above.
4. Geometry: question chip 20 px, Other input 34 px r10 `0 11`, popover title
   bottom padding 4, turn action gap 5. Applied; suggest rows and the diff
   toggle recorded as deviations.
5. The token-block check's handling of `transparent` and `currentColor` was
   unseeded. It missed both; the check now rejects them, with one seed each.
6. Tab-title truncation at 440 px handed to 059.

`make verify` exit 0 after the fixes.

## Outcome

Accepted.
