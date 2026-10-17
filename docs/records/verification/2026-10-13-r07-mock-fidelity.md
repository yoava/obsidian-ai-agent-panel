# Verification — r07 board and panel pairs in a headless harness

**Verifier:** a verifier session separate from the implementer (Claude Code);
**not a real-Obsidian run**
**Subject:** commit `20c0472e7b83e078cd43d9e08fd03671e68a719b`
**Date:** 2026-10-13

## Method

Headless Chromium; Obsidian 1.14.4's `app.css` and `enhance.js`; the plugin bundle
built from the subject commit; the fake CLI's scripted turns (no real `claude`, no
vault content). Each of the 26 paired boards on the canvas's "Redesign dark" page and its
"Redesign light" twin (52 pairs; WorkflowView has no panel counterpart) is rendered at
its own size next to the panel in the same state, Obsidian's status bar off.

- Each image in `2026-10-13-r07-mock-fidelity/` is board (left) and panel (right),
  palette-quantized to 256 colours.
- The panel's Geist and Geist Mono are registered by the harness (the board uses them;
  the plugin does not ship them), so the diff measures layout and colour, not the font
  fallback. The diff without Geist is in the last numeric column.
- Diff: share of pixels whose largest RGB channel differs by more than 24. Fixture
  text, a live (scrolled, pinned) transcript against a static frame and the accent hue
  (Obsidian's, by decision) put a floor of about 8 to 10 % under every board.
- The panel's transcript scroll is the offset (ends or a message top) that minimises
  the diff against the board.
- `2026-10-13-r07-mock-fidelity/measured.json`: per board, the composer card, textarea,
  status line, model segment, changes chip and new-conversation button as position,
  size, radius, fill, border, colour and font on both sides, with the panel-minus-board
  delta.

On the boards where both sides were measured, the composer card (130.5 px, radius 14), textarea (40.5 px), model segment (26 px, radius 7) and header button (28 px, radius 8) are equal, except Short, whose composer is 72.3 px against 73.

Verdict terms: **fixture** is test data or the stub CLI, **frame** is the static board against the live panel (scroll, focus, crop, header), **accepted** names the record that keeps the difference, **open** is a measured panel difference no record covers.

## Boards

| Board | Theme | Size | Diff % | Diff % without Geist | Verdict |
| --- | --- | --- | --- | --- | --- |
| Agents | dark | 440×960 | 14.9 | 15.0 | known: run bar, agent rows and workflow card not built (change 003) |
| Approve | dark | 440×960 | 18.7 | 18.8 | matches; frame: pinned-prompt bar shows because the live panel is scrolled, composer focused; fixture: mode and chips; accepted: word highlights per token against the board's hand-authored runs (065), 3 px composer focus ring (063), cache countdown (change 002) |
| ClearStates | dark | 440×1040 | 10.9 | 11.0 | known: /clear stays in the conversation not built (SPEC D1, pending decision) |
| Commands | dark | 440×960 | 16.8 | 16.7 | matches; accepted: Refresh and Copy on each card (065, 066); fixture: figures; frame: pinned-prompt bar shows because the live panel is scrolled |
| ContextCache | dark | 440×960 | 12.4 | 12.6 | known: cache zap, countdown and popover cache section not built (change 002; 070 motion audit) |
| ContextEvents | dark | 440×960 | 13.4 | 13.5 | known: context dividers not built (SPEC D1, pending decision) |
| Empty | dark | 440×960 | 8.5 | 8.7 | accepted: the hero sits about 126 px lower than the board, whose 250 px bottom reserve only clears its open @ list (074); fixture: status line reads "usage unavailable", the stub reports no usage; open: hero icon is the plugin's own bubble with a prompt, the board's a plain chat bubble; starters, @ list and composer match |
| Main | dark | 440×960 | 10.5 | 11.0 | matches; fixture: step labels and file counts (061 leaves tool-label wording), no exported note so the Transcript control is hidden; accepted: 3 px composer focus ring against the board's 1 px (063), cache countdown absent (change 002); frame: the capture focuses the composer, the static board has no focus |
| Medium | dark | 680×900 | 5.6 | 9.0 | matches; fixture: no exported note, so the Transcript control is hidden |
| Narrow | dark | 300×900 | 7.2 | 16.1 | matches; fixture: the second chip wraps to a second row, the board's "no due date" tint is hand-authored markup (Markdown has no such form); accepted: cache zap absent (change 002), context percent kept (063) |
| PopAgents | dark | 440×640 | 13.8 | 13.8 | known: agents popover not built (change 003) |
| PopModel | dark | 440×600 | 17.5 | 17.6 | matches; fixture: the stub lists 4 models against the board's 6 (popover 340 against 440 px, so it sits about 100 px lower), "usage unavailable"; frame: the board has no header or tab strip; open: footer reads "Applies from your next message" without "· this conversation only" |
| PopUsage | dark | 440×600 | 10.6 | 10.6 | matches; accepted: popover and /usage keep the full titles (064, OV30); fixture: extra-usage row needs data the stub lacks |
| PromptStyleBubble | dark | 440×900 | 10.1 | 12.6 | matches; fixture: the board's "no due date" tint is hand-authored markup (Markdown has no such form); accepted: cache zap (change 002) |
| PromptStylePopout | dark | 440×900 | 7.3 | 11.3 | matches; known: cache zap (change 002) |
| PromptStyleQuiet | dark | 440×900 | 7.4 | 11.5 | matches; frame: pinned prompt shows because the live panel is scrolled; fixture: tab content |
| Question | dark | 440×960 | 21.3 | 21.4 | accepted: one "Other…" per question (065, CA14), cache countdown (change 002); fixture: three context chips in two rows against the board's one, the card footer is reachable by scrolling and is cropped under the composer at the chosen offset; open: the "Sections" legend sits on the fieldset border instead of under a divider and its options start 14 px lower, option description 2 px lower (styles.css question rules) |
| Responsive | dark | 1040×900 | 7.2 | 8.1 | matches; captured with Conversation tabs set to Automatic (the board shows the list column; default is Top, decision list CE2); header 11.8 against 12.2 px |
| Settings | dark | 680×900 | 18.9 | 18.9 | matches; known: 068 (breadcrumb, "Auto" label, Theme text), Show tooltips row (not on the board), cards 1 to 4 px higher from Obsidian's 1.3 line height (074) |
| Short | dark | 440×600 | 10.0 | 13.2 | matches; fixture: tab strip content; frame: pinned-prompt bar shows because the live panel is scrolled |
| SlashConfig | dark | 440×1360 | 11.1 | 11.1 | matches in card styling; fixture: stub CLI data; frame: taller than the viewport, no header or tab strip |
| SlashHelp | dark | 440×1360 | 10.1 | 10.2 | matches in card styling; fixture: stub CLI data; frame: taller than the viewport, no header or tab strip |
| SlashMcp | dark | 440×1360 | 11.1 | 11.1 | matches in card styling; fixture: the stub CLI reports one server; frame: the board is taller than the viewport and has no header or tab strip |
| SlashTools | dark | 440×1360 | 14.1 | 14.0 | matches in card styling; fixture: stub CLI data; frame: taller than the viewport, no header or tab strip |
| SlashUsage | dark | 440×1360 | 9.7 | 9.7 | matches in card styling; fixture: figures and rows from the stub CLI; frame: the board is taller than the viewport and has no header or tab strip |
| Tooltips | dark | 440×1200 | 14.8 | 14.0 | not comparable: the board is a specimen sheet of static tooltips, the panel shows one live tooltip; Obsidian draws tooltips (064, OV26 and OV27) |
| Agents | light | 440×960 | 15.3 | 15.3 | known: run bar, agent rows and workflow card not built (change 003) |
| Approve | light | 440×960 | 14.4 | 14.4 | matches; frame: pinned-prompt bar shows because the live panel is scrolled, composer focused; fixture: mode and chips; accepted: word highlights per token against the board's hand-authored runs (065), 3 px composer focus ring (063), cache countdown (change 002) |
| ClearStates | light | 440×1040 | 10.0 | 10.1 | known: /clear stays in the conversation not built (SPEC D1, pending decision) |
| Commands | light | 440×960 | 16.9 | 16.8 | matches; accepted: Refresh and Copy on each card (065, 066); fixture: figures; frame: pinned-prompt bar shows because the live panel is scrolled |
| ContextCache | light | 440×960 | 14.4 | 14.6 | known: cache zap, countdown and popover cache section not built (change 002; 070 motion audit) |
| ContextEvents | light | 440×960 | 12.6 | 12.6 | known: context dividers not built (SPEC D1, pending decision) |
| Empty | light | 440×960 | 6.4 | 6.7 | accepted: the hero sits about 126 px lower than the board, whose 250 px bottom reserve only clears its open @ list (074); fixture: status line reads "usage unavailable", the stub reports no usage; open: hero icon is the plugin's own bubble with a prompt, the board's a plain chat bubble; starters, @ list and composer match |
| Main | light | 440×960 | 9.5 | 10.1 | matches; fixture: step labels and file counts (061 leaves tool-label wording), no exported note so the Transcript control is hidden; accepted: 3 px composer focus ring against the board's 1 px (063), cache countdown absent (change 002); frame: the capture focuses the composer, the static board has no focus |
| Medium | light | 680×900 | 4.6 | 8.1 | matches; fixture: no exported note, so the Transcript control is hidden |
| Narrow | light | 300×900 | 6.0 | 12.8 | matches; fixture: the second chip wraps to a second row, the board's "no due date" tint is hand-authored markup (Markdown has no such form); accepted: cache zap absent (change 002), context percent kept (063) |
| PopAgents | light | 440×640 | 22.1 | 22.2 | known: agents popover not built (change 003) |
| PopModel | light | 440×600 | 9.8 | 9.8 | matches; fixture: the stub lists 4 models against the board's 6 (popover 340 against 440 px, so it sits about 100 px lower), "usage unavailable"; frame: the board has no header or tab strip; open: footer reads "Applies from your next message" without "· this conversation only" |
| PopUsage | light | 440×600 | 15.7 | 15.7 | matches; accepted: popover and /usage keep the full titles (064, OV30); fixture: extra-usage row needs data the stub lacks |
| PromptStyleBubble | light | 440×900 | 9.0 | 11.5 | matches; fixture: the board's "no due date" tint is hand-authored markup (Markdown has no such form); accepted: cache zap (change 002) |
| PromptStylePopout | light | 440×900 | 6.3 | 10.3 | matches; known: cache zap (change 002) |
| PromptStyleQuiet | light | 440×900 | 6.4 | 10.5 | matches; frame: pinned prompt shows because the live panel is scrolled; fixture: tab content |
| Question | light | 440×960 | 13.6 | 13.6 | accepted: one "Other…" per question (065, CA14), cache countdown (change 002); fixture: three context chips in two rows against the board's one, the card footer is reachable by scrolling and is cropped under the composer at the chosen offset; open: the "Sections" legend sits on the fieldset border instead of under a divider and its options start 14 px lower, option description 2 px lower (styles.css question rules) |
| Responsive | light | 1040×900 | 6.3 | 7.1 | matches; captured with Conversation tabs set to Automatic (the board shows the list column; default is Top, decision list CE2); header 11.8 against 12.2 px |
| Settings | light | 680×900 | 13.9 | 13.8 | matches; known: 068 (breadcrumb, "Auto" label, Theme text), Show tooltips row (not on the board), cards 1 to 4 px higher from Obsidian's 1.3 line height (074) |
| Short | light | 440×600 | 8.3 | 11.6 | matches; fixture: tab strip content; frame: pinned-prompt bar shows because the live panel is scrolled |
| SlashConfig | light | 440×1360 | 14.2 | 14.1 | matches in card styling; fixture: stub CLI data; frame: taller than the viewport, no header or tab strip |
| SlashHelp | light | 440×1360 | 8.0 | 8.0 | matches in card styling; fixture: stub CLI data; frame: taller than the viewport, no header or tab strip |
| SlashMcp | light | 440×1360 | 13.1 | 13.0 | matches in card styling; fixture: the stub CLI reports one server; frame: the board is taller than the viewport and has no header or tab strip |
| SlashTools | light | 440×1360 | 14.8 | 14.8 | matches in card styling; fixture: stub CLI data; frame: taller than the viewport, no header or tab strip |
| SlashUsage | light | 440×1360 | 12.8 | 12.7 | matches in card styling; fixture: figures and rows from the stub CLI; frame: the board is taller than the viewport and has no header or tab strip |
| Tooltips | light | 440×1200 | 19.8 | 21.8 | not comparable: the board is a specimen sheet of static tooltips, the panel shows one live tooltip; Obsidian draws tooltips (064, OV26 and OV27) |
WorkflowView (dark and light): no panel counterpart (new component, not parity work); not paired.

Light accent: the panel's accent follows Obsidian's by decision; owner reviews it.

## Open differences

Measured in the harness DOM, no record covers them (a panel fix task decides):

- Question: the "Sections" legend sits on the fieldset's top border and its options start 14 px
  lower (board: divider above the legend, options 28 px under it; panel 42); each option's
  description sits 2 px lower (`.ai-agent-panel-question:not(:first-of-type)` and
  `.ai-agent-panel-question-option-text` gap in `styles.css`). Goes to task 075.
- Empty: hero icon is the plugin's bubble with a prompt (`src/state/agent-icon.ts` through
  `src/ui/empty-state.ts`); the board's is a plain chat bubble. Goes to the owner's decision list.
- PopModel: the footer reads "Applies from your next message", the board adds "· this conversation only". Goes to task 075.
