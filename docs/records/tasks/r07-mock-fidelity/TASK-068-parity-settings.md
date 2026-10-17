---
status: closed
release: r07-mock-fidelity
number: 068
prd: PRD-001.R34, PRD-001.R25
---

# TASK-068 — Settings page matches the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The settings tab differs from the "Redesign dark/light" Settings board (survey
IDs SE1-SE7). Boards win over SPEC.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R34, R25, R33; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
Tokens, Palettes and mode; [DES-003](../../../current/design/DES-003-panel-ui.md)
Settings that reach the panel.

Acceptance:

1. SE1: "Theme" is a `radiogroup` of three cards (Auto, Light, Dark),
   named by the row, each radio named by its name; Auto is described
   by "now Dark" or "now Light" from Obsidian's mode. A pick calls
   `setTheme`, as the pane menu does. The radios share a name, so the arrow
   keys move the choice. Each preview draws its palette by its own mode class;
   Auto's shows both halves.
2. SE2: rows are plain, with a 1 px top border and no filled group box; section
   headings are 18 px / 600; "Settings → AI Agent Panel" sits above the first
   section. Only inside the tab's own root.
3. SE3: the section is named "Transcript".
4. SE4: the sync icon sits left of a toggle.
5. SE5: a description is at most 420 px wide.
6. SE6: a toggle is 38 × 22 with a 16 px knob.
7. SE7: cards are 190 × 155 with a 168 × 92 preview.
8. No new setting, stored value or default; the pane menu is unchanged.

## Scope

Expected files: `src/settings.ts`, `src/settings-core.ts` (card names and the
Auto caption), `src/theme-scope.ts` (`mode()`), `styles.css`;
`tests/settings-core.test.mjs`, `tests/state-theme.test.mjs`,
`tests/tooltips.test.mjs` (the renamed heading); DES-001, DES-003, PRD-001
(the heading's name), `README.md`, `RELEASE_NOTES.md`.

Negative scope: no new setting, no change to stored values or defaults, no
pane-menu change, no other row's content; no edit to a protected path.

## Plan

- Tests first: the card names and caption (`settings-core`), the radiogroup and
  shared-name shape, one card function for both rows, mode-class previews
  (`state-theme`).
- The Prompt style card function becomes `drawRadioCards`, taking each card's
  name, optional caption and preview, so Theme reuses it; each card group is a
  scope root attached as its row renders (ADR-017: the palette stays on the
  cards and the error line; the page keeps Obsidian's colors).
- Page geometry hangs from `.ai-agent-panel-settings-tab`: no Obsidian
  variables are set; rows, the filled-group reset, headings and the toggle
  are styled directly, with new geometry tokens (heading size, `space-20`,
  toggle size and knob, description width) in the token block and DES-003.
  The row border is a tint of the row's own text color.
- Rejected: one scope root on the tab (it recolors the whole page and is
  attached when the definitions are fetched, once, so a reopened tab lost it);
  a DOM breadcrumb (it is not the first section's heading).
- Verify: `make verify`; harness pair per theme at 680 and 300.

## Run log

- Tests first: `settings-core` failed on the missing exports; `state-theme`'s
  Theme check failed against the dropdown.
- Rework after review: Theme's first card is "Auto", read from
  `THEME_LABELS` (no second name table); its "now Dark/Light" caption is
  rewritten on `css-change` while the tab is open, the listener released with
  the tab's registrations; the whole-tab scope root is undone (per-row roots
  again); no Obsidian variables set; `.mod-split` clips to the border;
  `.ai-agent-panel-style-card` is `flex: 0 1 190px` so no card stretches;
  the breadcrumb is `content: "…" / ""`. New test: definitions fetched once,
  hide, an Obsidian mode change, re-render: the new card roots follow the mode.
  Existing tests changed: `state-theme` (the dropdown assertion), `tooltips`
  (heading name).
- Harness: `harness/hunt-068/final/settings-{dark,light}.png` (board | panel |
  diff, 680 × 900) and `settings-{dark,light}-300.png` (panel, 300 × 900);
  `measure.json` holds board and panel values for both themes. Board and panel
  agree on: headings 18 px / 600; description box 420 px (board and panel);
  toggle 38 × 22, knob 16 (at x 3, 19 when on); cards 190 × 155, preview
  168 × 92; gap from a section's last row to the next heading 26 px; heading
  and rows share x; row top border 1 px. Panel only: radio groups "Theme" and
  "Prompt style", first card "Auto" captioned "now Dark".
- Not matched: the breadcrumb sits above the first section (CLI profile), not
  above Appearance, because Appearance is not the first section of the plugin's
  page; the Theme description keeps the plugin's text (it also says the tab
  follows Obsidian); at 300 px the sync badge of a cards row wraps below the
  description; the border and breadcrumb tints use the row's text color
  (`color-mix` with `currentcolor`, `opacity`), not the board's palette values.

## Independent review


Reviewer: independent review agent, two rounds.

Round 1, rework. Findings: the tab-wide scope root recolored the whole page
and was attached once, when the definitions were fetched, so a reopened tab
lost it; Obsidian variables (`--toggle-*`, `--setting-items-*`) were set
although ADR-017 does not list them; literal px in rules; the Auto preview
did not follow the rounded border; a wrapped third Theme card stretched;
the description width and heading gap were unmeasured; the breadcrumb was
read by screen readers; "Match Obsidian" duplicated the name table. Resolved:
per-row scope roots attached as each row renders, with a test for fetch once,
hide, mode change, re-render; no Obsidian variables, direct rules and new
geometry tokens; `overflow: hidden` on the split preview; `flex: 0 1 190px`
cards; the board's 420 px description and 26 px heading gap measured and
matched; the breadcrumb is `content: "…" / ""`; "Auto" from `THEME_LABELS`;
the caption follows `css-change`.

Round 2, approve with changes. Findings: the width rules for preview rows
shrank the light half of the split preview; cards without a caption were
shorter than Auto when wrapped; breadcrumb contrast 4.3:1 in light. Resolved:
`.mod-split > .ai-agent-panel-theme-half { inline-size: auto }`; the card's
pick row has a two-line minimum height, for both rows; breadcrumb opacity
.65. Disclosed and accepted: the breadcrumb sits above the first section, the
sync badge of a cards row wraps below the description at 440 px and under, the
Theme description keeps the plugin's text.

## Outcome

accepted
