---
status: closed
release: r07-mock-fidelity
number: 074
prd: PRD-001.R30, PRD-001.R35, PRD-001.R33
---

# TASK-074 — Last offsets against the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Task 073's side-by-side capture left five vertical offsets between the panel
and the "Redesign dark" and "Redesign light" boards. Each is measured in the
DOM (harness, both themes) and fixed with existing tokens; boards win over
SPEC.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R30 (layout by size), R35 (empty conversation), R33 (prompt style cards);
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) (tokens, no
`!important`); [DES-003](../../../current/design/DES-003-panel-ui.md) Layout
model, Header and changes bar, Empty conversation, Settings.

Acceptance (panel vs board, px, clip-relative; 440, 680, 1040 and 300 wide and
440×600, both themes):

1. Composer card and status line: bottom gap under the status line equals the
   board's at every width (8 at 300, 10 at 440, 12 from 560); the card top
   matches. Bottom controls still clear Obsidian's status bar (the clearance is
   added, as in 056).
2. Header icon buttons sit at the board's vertical position (centred on the
   tabs).
3. Empty: recorded, no change (the board's 250 px reserve only clears its open
   list).
4. Settings: the Theme and Prompt style cards sit 12 px under the row's
   description, as on the board.
5. Main: the first prompt sits at the board's offset below the changes bar.

## Scope

Expected files: `styles.css`, `docs/current/design/DES-003-panel-ui.md`,
`RELEASE_NOTES.md`, this record.

Negative scope: no colour, font or token-value change, no new token; no DOM,
role, name or behaviour change; `tests/styles.test.mjs` and
`tests/architecture.test.mjs` untouched. CSS only, so no new unit test; the
evidence is the harness measurement below.

## Plan

Measure board and panel with the harness (`hunt-074/m.mjs`, `m2.mjs`: element
rects relative to the clip, panel transcript at scroll 0, status bar off, the
Responsive fixture with Conversation tabs set to Automatic). Read the board's
own padding at each width, then set the panel's from the same tokens.

## Run log

Measured values: board | panel before | panel after. `final/measured.json` and
`final/summary.txt` hold every number; side-by-sides are
`final/<Board>-<theme>.png` (board | panel | diff), dark and light, for Main,
Medium, Responsive, Short, Narrow, Empty and Settings. All under
`harness/hunt-074/`. Dark and light give identical geometry.

1. Composer area bottom. Gap below the status line: 440 and Short 10 | 8 | 10;
   680 and 1040 12 | 8 | 12; 300 8 | 8 | 8. Card top: Main 787.5 | 789.5 |
   787.5; Medium and Responsive 725.5 | 729.5 | 725.5; Short 485 | 487.8 | 485.8
   (the 0.8 left is the card's own height in the one-line textarea case; the gap
   below the status line matches). Cause: the board's bottom padding is 8, 10 and 12 at the three
   widths, the panel used 8 throughout. `styles.css` composer area (base 10;
   below 360 8; from 560 12; each plus `--ai-agent-panel-bar-clearance`).
2. Header buttons, top of the 28 px button. Main and Medium 6.5 | 8 | 7; Short
   6.5 | 10 | 7; Narrow 7 | 8 | 7; Responsive (column) 12.2 | 11.8 | 11.8
   (already within the board's fractional header height, unchanged). Cause:
   the actions were end-aligned in the 36 px row, and in the header-row cases
   centred in a 42 px row made by the changes bar's 8 px above its chip.
   Fix: actions `align-self: center`; header-row changes bar padding 6 above,
   none below (the chip stays at the board's 8). The 0.5 left at Main, Medium
   and Short is the board's half pixel from its 1 px header border; the panel
   draws the line as an inset shadow, so it has none.
3. Empty. Hero tile top 115.4 on the board, 241.4 on the panel (126 lower):
   the board's `main` reserves 250 px at the bottom "to clear the popover"
   (SPEC, Empty); it exists only
   to clear its open list and is not a centring rule. No change: the panel
   keeps centring in the whole area. A first attempt reserving 250 px while a
   list is open was reverted on review (ADR-017: no `:has()` on the main
   column; a scrollbar and still an overlap below about 850 px height). The
   board's open-list frame therefore differs by that reserve. The composer
   area's 2 px bottom change (item 1) moves the hero 1 px.
4. Settings. Cards top minus the description's bottom: Theme 12 | 32 | 12;
   Prompt style 11.9 | 32 | 12. Cards top minus the row top: Theme 89.5 |
   105.6 | 85.6; Prompt style 70.7 | 89.5 | 69.5. Cause: the row's 20 px
   gap applied as a row gap above the cards' 12 px margin. Fix: row gap 0 on
   the cards row (`.ai-agent-panel-settings-tab .setting-item.ai-agent-panel-settings-cards`,
   specificity above the shared row rule). Left, fixture- and Obsidian-caused:
   the cards sit 3.9 (Theme, two-line description) and 1.2 px (Prompt style) higher than the board relative to the row top because
   Obsidian's setting name and description lines are 18.2 and 16.25 px
   (line height 1.3) against the board's 21 and 18.75 (1.5), a font change
   outside this task.
5. Main first prompt, top. Main 97 | 94 | 97. The panel's 3 px were 2 from the
   thread's top padding (16 against the board's 18 on Main, Approve, Question
   and Commands; Agents has 16, Short 10 on a scrolled thread, so 18 is the
   majority; the wider and narrower thresholds already match theirs at 22 and
   14) and 1 from the changes bar (the board's bar is 43 with its line, the
   panel's 42). Fix: messages list top 18; changes bar 9 below its chip.
   Narrow, whose board bar is 35 (no top padding): bar bottom 79 | 86 | 79
   after a below-360 rule placed before the header-row rule, so a 300x600 panel
   keeps the header-row padding.

Found, not changed:

- Narrow composer top 729.5 | 699.5 | 699.5: the panel shows the second chip
  "links & properties", which wraps to a second chip row; the board's Narrow
  frame has only the note chip. Fixture content, not an offset.
- The board's Short, Medium, Narrow and Responsive threads are scrolled
  mid-conversation, so their first prompt is not comparable; only Main's is.

Gate: `make verify` exit 0 (`scratchpad/verify-074.log`), 1171 tests.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

1. The `:has()` empty-state reserve broke ADR-017 and left an overlap and a
   scrollbar at short heights. Resolved: reverted; recorded in item 3 and
   DES-003; release-note sentence removed.
2. The below-360 changes-bar rule overrode the header-row rule at 300x600.
   Resolved: moved before the header-row rule; DES-003 states the case.
3. Record the 1 px hero shift. Resolved in item 3.

## Outcome

accepted

RELEASE_NOTES: a clause in the panel-look entry ("Spacing matches the design.").
