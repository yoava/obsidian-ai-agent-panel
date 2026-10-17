---
status: closed
release: r07-mock-fidelity
number: 066
prd: PRD-001.R20, PRD-001.R21, PRD-005.R6
---

# TASK-066 — Report cards match the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Parity survey items CA21–CA50 except CA40, CA45 and CA46 (067) against the
"Redesign dark" and "Redesign light" Slash* and Commands boards. Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R20
(panel-answered commands, "no tokens"), R21 (/mcp);
[PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md) R6;
[DES-003](../../../current/design/DES-003-panel-ui.md) Report cards, Token
contract; [DES-007](../../../current/design/DES-007-usage-and-cost.md);
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md).

Acceptance:

1. Footer band: recessed fill, padding 9 14, top line, 12 px muted, a leading
   info, terminal or settings icon; links in accent with an external-link icon
   (CA21).
2. Key/value rows: key column 128 px (150 in /chrome and /sandbox, 132 in
   /usage-credits, capped at 45 %), a line between rows, paths, ids, versions,
   amounts, durations and hosts in mono (CA22, CA48); yes/no values carry a
   status dot (CA25).
3. Pills h19, r999, 11/500 in ok, warn, error, off and accent tones (CA23).
4. No report draws a table where the board lists rows: /mcp, /permissions,
   /hooks, /skills, /memory and /help are row lists (CA24, CA42–CA44, CA49,
   CA50); section headings carry a dot and a count (CA26).
5. Title 13.5/600; body padding and gap 14, per command as the boards
   (CA27, CA28).
6. A failure sets the CLI's message in mono (CA29).
7. Skeleton bars on `fill` with a `track` sheen, animated only under
   `prefers-reduced-motion: no-preference` (CA30).
8. /context: figure 24/600 with "of 200k tokens" and a mono percentage, the
   model under the title; meter with an explicit free segment, a hatched
   reserve and end radii 3; a two-column legend (gap 18) with mono values and
   no table; category colours by name (CA31–CA33, CA35).
9. /usage: bar gap 6, radius 3, accent-text fill, mono 11.5 value; reset
   text "Resets 16:59 · in 2h 27m" (CA36, CA37). /usage-credits: dotted
   Status, the bar under the value (CA38). /cost: mono figure and 2×2 tiles
   (CA39).
10. /mcp lists the most severe status first (CA41); its buttons stay inside
    the card at 300 and 440 px.
11. /chrome's links are buttons, the first accent-filled (CA47).
12. `reportMarkdown` output is unchanged except where the content changed
    (/mcp order, reset text).

## Scope

Expected files: `src/report-view.ts`, `src/commands.ts` (card-only hints,
/mcp order, `HELP_GROUPS`, `contextCategoryColor`, `failureParts`),
`src/state/report-card.ts` (new), `src/state/usage-segment.ts` (reset text,
credits hints), `styles.css` (report section, two font-size tokens),
`package.json` (pretest), `tests/commands.test.mjs`,
`tests/state-usage-segment.test.mjs`, `tests/state-report-card.test.mjs`
(new), DES-003, DES-007, `RELEASE_NOTES.md`.

Negative scope: command semantics, data sources and control requests; new
commands; per-card Refresh and Copy; CA40, CA45, CA46 (067); popovers (064).
Not done, each new behaviour or Markdown: CA34's cache line and "/compact now"
button (change 002); dropping /help's header badge (R20 requires "no
tokens"); /usage's settings link; /memory's project path as a vault link
(CA49); inline mono inside footer notes; colouring /cost's "+56 −16".

## Plan

The builders keep their Markdown model and add card-only hints that
`reportMarkdown` ignores (`cardLead`, `figure`, `meter.free`, `barPairs`,
section `list`, `marker`, `headingPill`, `recordOnly`, row `detail`, `pill`,
`server`, `tokens`, `command`, `tile`, bar `status`, link `button`). The
card's reading of those hints, never of the cells' text, lives in
`src/state/report-card.ts` (Node-tested: `codeLike`, `headingParts`,
`meterParts`, `serverRow`, `skillBar`, `commandRow`, `commandGroups`,
`tile`); `report-view.ts` only draws. Tests first for the pure parts.
Per-command key widths are written as rules, since styles.test allows no
rule-local custom properties. Rejected: a second renderer per command, which
would duplicate the pairs, pill and footer code.

## Run log

- `make verify` exit 0 (`scratchpad/verify-066.log`).
- Evidence in `harness/hunt-066/final/`: `<area>-<dark|light>.png` pairs at
  440 px for usage, mcp, config, tools, help and context, and
  `measured.json` (panel values per card and ID, including /mcp at 300 px and
  the loading and failed states). Fixtures in `harness/hunt-066/fx/` feed the
  boards' data through the fake CLI's reply shapes.
- Measured: title 13.5; footer padding 9 14 on `bg-recessed`, 12 px; pills
  19 px; keys 128 px (/status), 132 (/usage-credits), first rows unlined; /mcp buttons end 11 px
  inside the card at 300 and 440 px, no horizontal scroll; /context legend
  2 × 171 px, gap 18, segments `is-c1`–`is-c5`, `is-free`, `is-reserved`;
  skeleton base `fill`, sheen `track` (the harness forces reduced motion, so
  the animation computes `none`); /status failure mono "Control request timed
  out: get_status".
- Deviations: mono values wrap where the boards ellipsize; the /context model
  sits under the title, not at its right; deferred categories leave the
  /context legend (the Markdown keeps them); /mcp sorts by name within a
  status, so context7 precedes github.
- After review: `harness/hunt-066/final/measured-focus-narrow.json`.
  Keyboard focus (`:focus-visible`) on Reconnect, "Show all", a /help row,
  both /chrome link buttons and a footer link draws a 2 px solid accent
  outline; contrast against the surface behind it 3.94 (footer 4.16) dark,
  3.43 (footer 3.11) light. At 300 px the /context legend is one 230 px
  column with nothing cut; no /help, /skills or /memory name is cut (only
  /help's one-line descriptions ellipsize), and no card overflows
  (`tools-300.png`). Every row list is a list of listitems; headings read
  "Allow 3", skill tokens "~420 tokens", a hook "matcher Bash".
- CA40's row content (pill, meta, error line, buttons) is implemented
  although CA40 is 067's: CA24's row list replaced the /mcp table, and a
  row without those parts would have dropped what the table showed.
- Context colours: all six category tokens are taken (`cat-1`–`cat-5` by
  name, `cat-6` for any other), so "Skills" and "Custom agents" share
  `cat-6`; separating them needs a new palette token, left for a decision.

## Independent review

Verdict: approve with changes. Findings and resolutions:

- 1, no focus ring on the card's own controls: one `:focus-visible` rule
  (2 px accent outline) for row buttons, "Show all", /help rows, link
  buttons and footer links; measured above, contrast ≥ 3.1.
- 2, /context legend cut at 300 px: values never wrap, one column below a
  360 px panel; /help, /skills and /memory names wrap, and a /skills state
  pill that does not fit drops to a second line.
- 3, rebase: onto 064's `-font-size-figure` (ours is `-display`, 24 px)
  and 062; package.json, DES-003's token table and DES-007 keep both sides.
- 4, accessibility: row lists are lists (/help one per group, named by its
  label); hidden " tokens" after "~N"; spaces before heading counts, pills
  and badges; a hook's matcher is named.
- 5, reset text: popover and /usage "Resets 16:59 · in 2h 27m", the hover
  card "resets 16:59" (`resetWhen`, as the status segment); copied bars
  join their figures with " · ".
- 6, re-parsing builder strings: rows carry `pill`, `server`, `tokens`,
  `command` and `tile`; `state/report-card` reads only those.
- 7, context colours: no free category token; recorded in the run log.
- 8, /mcp order as its own `fix` commit with its test and release note.
- Nits: new tests named by requirement, CA IDs after; CA40 note added.

## Outcome

accepted
