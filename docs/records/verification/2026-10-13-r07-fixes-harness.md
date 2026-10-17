# Verification — r07 fixes 046 to 050 in a headless harness

**Verifier:** a verifier session separate from the implementer (Claude Code);
**not a real-Obsidian run**
**Subject:** commit `068c5f54ed0ff6d8e056d7bcf771b9fb51679d4d` (tasks 046 to 050), built from a
`git archive` of it; tasks 051 and 052 and later commits are not covered
**Date:** 2026-10-13

## Environment

Harness kept in scratch, never in the repository.

- Real: the plugin bundle (esbuild of `src/main.ts`) with its `styles.css`; Obsidian
  1.14.4's `app.css` and `enhance.js`; headless Chrome 155.0.8059.39 (playwright-core
  1.64.0-alpha), fake clock.
- Stand-ins: the `obsidian` module (`setTooltip` sets `aria-label` and Obsidian's
  tooltip handler's `--no-tooltip` read is mirrored; `MarkdownRenderer` parses headings,
  lists, tables and paragraphs only), `child_process` (a scripted fake CLI in stream-JSON,
  never the real `claude`), history store, workspace, ribbon, tab headers and the status
  bar (`.app-container > .status-bar`).
- States: Obsidian dark and light; panel width 300, 440, 680, 1040 at height 900 with
  tabs on top; 1040 with "Conversation tabs" Automatic (conversation column); 440×600
  for the composer's one-line form; host right sidebar and main area for 047.
- Screenshots and raw numbers: `<harness>/out/verify-r07/` (scratch), named
  `046-*`, `047-*`, `048-*`, `049-*`, `050-*`; numbers in `046.json`, `046auto.json`,
  `047.json`, `047b.json`, `048.json`, `049-*.json`, `050.json`.

## Method

Each fact is a computed style, a rectangle, `document.elementFromPoint` or Chromium's
accessibility tree (CDP `Accessibility.getFullAXTree`) on the rendered panel. Fake clock
advanced past the hover delay (700 ms; 1,100 ms for the rest-hover checks). The hover card
has `pointer-events: none`, so its hit tests set `pointer-events: auto` on it for the test
only. "Both themes" below means dark and light gave the same result.

## 046 Floating layers (PRD-001.R32, R33)

| Fact | Measured | Result |
| --- | --- | --- |
| Every `z-index` in `styles.css` reads a token | 6 declarations, all `var(--ai-agent-panel-z-*)` (sticky 1, pin 2, rail 3, float 4) | PASS |
| Computed z-index, all widths, both themes | layer 4, suggest list 4, rail 3, pin bar's sticky 2 | PASS |
| Tab hover card over the pinned prompt bar, 440, 680, 1040 | card and pin bar overlap 8,320 px²; centre and four corner points of the card hit the card | PASS |
| Same in the column layout (row card, 1040 auto) | overlap 7,296 px²; all five points hit the card | PASS |
| Same at 300 | no tab strip or column (switcher) | N/A |
| Status popovers over the rail | where they overlap the rail, the point at the overlap's centre and the five points of the popover hit the popover: model 2,714 px² and effort 2,714 and context 492 at 300; permission 208 and usage 1,565 at 440; usage 1,044 at 680, 1040 and the column. No other popover overlaps the rail at its width. Overlap with the pin bar: 0 | PASS |
| Slash suggest list over the rail | no natural overlap at any width; with the rail shifted 60 px under the list the point hits the suggest list (the rail without the list) | PASS |
| Card closes when the pointer reaches another tab | card of tab 2 shown; 40 ms after the pointer reaches tab 3 it is gone, 700 ms later tab 3's card shows (440, 680, 1040, column) | PASS |
| Card closes when the pointer reaches a button | the card shown on tab 2; 40 ms after the pointer reaches "Plugin settings" it is gone (440, 680, 1040, column) | PASS |

Not exercised here: a card shown by keyboard focus; a `pointerover` without pointer movement
(`tests/state-popover.test.mjs` owns them); `tests/layers.test.mjs`.

## 047 Status-bar clearance

Bar present: top 913 (right sidebar) or 951 (main area) at height 900; bar absent: none.

| Fact | Measured | Result |
| --- | --- | --- |
| Bar shown, status line vs `.status-bar`, widths 300, 440, 680, 1040, column, both hosts | status line bottom 905 (right) and 943 (main), bar top 913 and 951: 8 px apart, no intersection although they overlap horizontally (270 to 278 px) | PASS |
| Clearance applied | `--ai-agent-panel-bar-clearance: 27px` on the main column; composer area bottom padding 35 px | PASS |
| Bar hidden | clearance 0 px; padding 8 px (its normal value); status line bottom 932 / 970 (panel bottom) | PASS |
| Wide layout, bar shown | clearance 27 px on the main column and the conversation column; column padding-block-end 27 px; column bottom flush with the bar's top (gap 0) | PASS |
| Wide layout, bar hidden | column padding 0 px | PASS |
| Follows the bar hiding and showing (440 and column) | `display: none` and back, `body.is-screenshotting` and back: 27 to 0 to 27 px, padding 35 to 8 to 35 px, each within 300 ms | PASS |
| Follows a bar that no longer reaches the panel | bar narrowed to 40 px at x 0 to 40 (emulates a panel the bar does not reach): clearance 0, padding 8 px; restored: 27 px | PASS |
| Bar widened to the left by 56 px | clearance stays 27 px (its height is unchanged) | PASS |

Not exercised: panel and window resizing while mounted (the width rows are fresh mounts),
a sidebar dragged or moved, no repeating timer; `state/bar-clearance` unit cases are in
`tests/state-bar-clearance.test.mjs`.

## 048 Agent icon

| Fact | Measured | Result |
| --- | --- | --- |
| Registered id, class on the svg | `svg-icon aiap-agent-mark`; 0 of 81 (empty state) and 0 of 114 (turn) svgs carry a class starting `ai-agent-panel`; 8 and 11 svgs carry `aiap-agent-mark` | PASS |
| Empty-state mark: background | svg `rgba(0, 0, 0, 0)`, `background-image: none`; 26×26 px on its 15% accent tile | PASS |
| Empty-state mark: colour = accent | dark `rgb(166, 138, 249)`, light `rgb(138, 92, 245)`, equal to the accent | PASS |
| Turn mark: background and colour | svg `rgba(0, 0, 0, 0)`, `none`; colour dark `rgb(166, 138, 249)`, light `rgb(138, 92, 245)`; 16×16 px | PASS |
| Markup | `g` `fill="none"` `stroke="currentColor"` with 3 paths and no own fill; computed stroke = accent; the zoom screenshots show an outlined speech-bubble glyph, no filled box | PASS |
| Ribbon icon id | the plugin's own `addRibbonIcon` call supplies `aiap-agent-mark` (its svg is among the counted) | PASS |
| View tab icon | the harness draws the tab header from the ribbon's id and never calls `view.getIcon()` (`src/view.ts` returns `AGENT_ICON`) | not measured |

## 049 Icon-only tooltips

`.tooltip` elements counted after a 1.1 s rest on each target.

| Fact | Measured | Result |
| --- | --- | --- |
| No tooltip at rest: composer textarea, message text, composer chip, changes chip, status line's gap, jump rail track, tab body, tab strip, column row, filter, column | `[]` in dark and light at 440, 1040 (column) and dark at 300 and 440×600 (hover cards of tabs and rows still show, as intended) | PASS |
| "+N" chip | visible at 300 and 440 with 5 hidden items at height 600: no tooltip, no `aria-label`; name "Show hidden context (5)" from `aria-labelledby` | PASS |
| `aria-label` only on the allowed controls | scanned 25 selectors over 6 states: no `aria-label` on textarea, tab strip, column, filter, messages, rail, run bar, shell card, status line, handle, radio groups, report card and cells, "+N", chips, changes chip, column rows; present only on tab and row close, send, Branch and Restore files, Transcript, the model segment (full id, R22), rail ticks | PASS |
| Icon-only controls show their tooltip | "New conversation" at 300, 440; "Plugin settings" at 440; effort segment at 300, 440 ("Reasoning effort: High") | PASS |
| Branch and Restore files: tooltip only while icon-only | main column 300, 340, 359 px: label width 0, `--no-tooltip` unset, tooltip "Restore files" at 300; 360, 380, 440, 770 px: label 69 and 40 px wide, `--no-tooltip: true`, no tooltip at 440 and 1040 | PASS |
| Effort segment: tooltip only while icon-only | label hidden and `--no-tooltip` unset at 300 to 440 (and 440×600); label 33 px at 450 to 520, 70.6 px at 680 and 1040, `--no-tooltip: true`; no tooltip at 1040 | PASS |
| Accessible names kept (AX tree, both themes, 300, 440, 1040) | textbox "Message Claude"; tablist "Conversations" (tabs on top); navigation "Conversations", textbox "Filter conversations by title", separator "Resize the conversation list" (column); region "Messages"; navigation "Jump to a prompt"; groups "Background tasks", "Conversation status", "Shell: git log --oneline -3"; radiogroups "Model" and "Reasoning effort"; a /help report region "Commands"; /help rows' buttons "Put /<name> in the message"; "Show hidden context (5)" | PASS |
| Descriptions kept | changes chip "Show the files this conversation changed"; Restore files "Put the files Claude Code tracked for this turn back as they were"; Branch "Open a new tab that continues from just before this turn, …"; background Stop "Index the vault" | PASS |

Not exercised: Transcript's tooltip and description (the control is hidden without an
exported note; its `--no-tooltip` rule is `true` at every width); the profile segment (not
shown in the fixture); a recent row's "Last active <time>" (the harness has no stored
conversations); the report table's "Actions" header and a reopened report view (the
/help card has no actions column; the report view is not mounted); the model, permission and
"Restore to before turn N" tooltips (R22, PRD-002.R8, R18); `tests/tooltips.test.mjs`.

## 050 Empty thinking toggle

| Fact | Measured | Result |
| --- | --- | --- |
| Empty block, streaming | `span.turn-thinking-toggle` "Thinking…"; 0 buttons, 0 chevrons, 0 `aria-expanded` and 0 `aria-controls` in the thinking element and head slot; not focusable (`tabIndex` -1); cursor `auto`, no hover fill | PASS |
| Empty block, finished | `span`, "Thought for 1s"; same absences | PASS |
| Whitespace-only block, finished | `span`, "Thought for 1s"; same absences | PASS |
| First delta after an empty block | the same label becomes a `button` with a chevron, `aria-expanded="false"`, `aria-controls` set, focusable, collapsed | PASS |
| Block with text, finished | `button`, chevron, `aria-expanded="false"`, `aria-controls`; click: `true` and class `is-expanded`; second click: `false` | PASS |
| Block with text, streaming | same as finished | PASS |
| Layout | label height 22 px in every state | PASS |
| Page errors | 0 in both themes | PASS |

All 050 rows give the same values in dark and light.

## Stand-in gaps

Markdown rendering is a subset; tooltips come from a stub that mirrors Obsidian's
`--no-tooltip` read; the status bar, ribbon, tab headers and sidebar are static stand-ins;
the CLI is scripted; fonts are the local set.

## Owed by hand, in Obsidian

1. 046: a tab's card over the pinned prompt and a popover over the rail in Obsidian 1.14.4
   (the owner's screenshots), with the keyboard-focus card.
2. 047: the real status bar over a right-sidebar and a main-area panel, a left-sidebar panel
   it does not reach, a sidebar dragged, the window resized, the bar's items changing.
3. 048: the ribbon icon and the view's tab icon, dark and light.
4. 049: Transcript, the profile segment, a recent row's description, the report view's
   "Actions" header, and the three required tooltips (R22, PRD-002.R8, R18).
5. 050: a real thinking stream that starts empty.

## Disposition

38 rows pass, 1 is not applicable at its width (046 card at 300) and 1 is not measured
(048 tab icon); no FAIL.
