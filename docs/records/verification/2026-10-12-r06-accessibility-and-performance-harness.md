# Verification — r06 panel redesign, PRD-001.R28 and R29 in a headless harness

**Verifier:** the implementing session of task 042 (Claude Code); not
independent, and **not a real-Obsidian run**
**Subject:** task 042's landing commit (2026-10-12)
**Date:** 2026-10-12

## Scope

What a headless browser can measure of PRD-001.R28 (accessibility) and R29
(performance budgets) on the finished panel, and the migration's CSS
rewrite. Everything else is owed by hand (below).

Harness, kept in scratch, never in the repository:

- Real: the plugin's `AgentPanelView` and every module it mounts, its
  `styles.css`; Obsidian 1.14.4's `app.css` and `enhance.js` from the local
  install; headless Chromium 148.0.7778.96 (Playwright 1.60).
- Stand-ins: the `obsidian` module (`Component` and `Events` with
  `app.js`'s semantics; `setTooltip` sets `aria-label` as Obsidian does;
  `setIcon` draws a placeholder; `MarkdownRenderer.render` appends the
  parsed DOM at once and settles a microtask later, as 1.14.4's does, but
  parses headings, lists, tables and paragraphs only, so render costs are
  lower bounds), a history store over a Map, workspace and vault stubs. No
  CLI: messages shaped like the fake CLI's `turn` and `steps` scenarios go
  through the view's own stream handler and `PermissionFlow`.
- Panel state for the audit: a finished turn (thinking, reply, a group of
  three calls, an edit, a subagent), a `!` card, a running turn with a
  permission card and a two-question form, an error block, two tabs;
  at 440×900 (Pop-out and Bubble), 1040×900 ("Conversation tabs"
  Automatic: the column) and 300×600, Obsidian dark unless stated.

## Evidence

| Requirement/risk | Evidence | Result | Notes |
| --- | --- | --- | --- |
| R28: every icon-only control, segment, the switcher and the rail labelled | Chromium's accessibility tree (CDP `getPartialAXTree`) for each focusable or interactive element: 42 at 440 px, 46 at 1040 px, 40 at 300 px | pass | Each `button`, `tab`, `radio`, `checkbox` and `textbox` has a name: "New conversation", "Previous conversations", "Plugin settings", "More", "Attach a file as context", "Show commands", "Stop Claude's turn (Esc)", "Queue message", "Copy prompt", "Model: Default model", "Reasoning effort: Default", "Permissions: …", "Context: not reported", "Plan usage: …", "Switch conversation, 2 open", ticks "1 · Summarize my note…". The one unnamed node is the turn's duration and cost (finding F3) |
| R28: roles | The same tree | pass | `tablist` "Conversations" with `tab`s; `navigation` "Conversations" (column) with section buttons (`aria-expanded`) and row buttons; `navigation` "Jump to a prompt"; `region` "Messages"; `group` "Permission request", "Claude has questions", "Shell: ls -la", "Conversation status"; `alert` for the error block; the polite live region |
| R28: keyboard focus and Enter/Space | Tab from the first focusable element until focus leaves the panel (37 stops at 440 px, 41 at 1040 px, 36 at 300 px); then each kind activated | pass | Reached in order: tab or switcher, header buttons, rail ticks, prompt copy, thinking toggle, group header, step row, agent row, Branch, copy, duration and cost, `!` card, card and form controls, composer, status segments, then the column (filter, "+", section headers, rows). Enter/Space: thinking toggle, group header, step row and agent row flip `aria-expanded`; a segment opens "Model and effort" with focus on the checked radio, ArrowDown moves without checking, Escape closes and refocuses the segment; focus on the duration and cost shows its card (`aria-describedby` set); Enter on a tick scrolls to its prompt; strip: ArrowRight moves, Enter selects; column: Enter on a row selects it, Space on a header collapses it |
| R28: state not by color alone | The same tree | pass | A tab's name ends "waiting for you"; marks read "Done", "Failed" in their rows' names; the turn head says "Waiting for you". MCP status (`/mcp`) not drawn in the harness: manual |
| R28 / M3: prompt text on its tint, Obsidian's default theme | Text color composited over its backgrounds, WCAG ratio | pass | Pop-out 9.55:1 dark, 13.75:1 light; Bubble 10.47:1 dark, 14.52:1 light (R28: at least 4.5:1) |
| R28 / M7: reduced motion | `document.getAnimations()` on the panel during a streaming turn with a running step | pass | No preference: `ai-agent-panel-ring`, `-blink`, `-spin` running; `prefers-reduced-motion: reduce`: none |
| M7: forced colors | Chromium's `forced-colors: active` emulation, not Windows high contrast; screenshot checked | pass | Active tab outlined; popover, card, composer and error block keep 1 px borders; checked radio and selected effort marked |
| R29: first draw | Mount to the first frame after `onOpen` | pass | `onOpen` 24 to 28 ms; first frame 28 to 33 ms; no frame of 50 ms or more |
| R29: keystroke echo while streaming (budget 50 ms, p95) | 220 keystrokes at 35 ms intervals while a 1,000-message tab streamed 972 messages (6 rich turns, one message every 5 ms); keydown time stamp to the frame after the input | pass | Typing in another tab: p50 10.7 ms, p95 18.2 ms, max 20.4 ms. Typing in the streaming tab: p50 16.4 ms, p95 23.7 ms, max 30.3 ms. Event Timing durations p95 24 and 40 ms, max 48 ms |
| R29: a delta appends without layout | 200 text deltas in one task, CDP `Performance.getMetrics` around it | pass | 0.2 ms in all, 0 forced layouts, 0 forced style recalculations; per delta p95 0.1 to 0.2 ms while streaming; no frame of 50 ms or more during either stream |
| R29: whole-model lookups (`callPath`, `cardFor`, `agentPath`) | Time per message on a model of 252 items (the 1,000 stored messages) | pass | `tool_use` p95 1.6 ms, max 2.9 ms; `tool_result` p95 1.0 ms, max 3.4 ms across runs; no index added |
| R29: 1,000-message reopen (last screen within 1 s, no visible reflow) | 1,000 stored messages, 125 prompts, a 12-line code fence in each turn's last reply; reopened at 440×900, every frame for 6 s | pass after the fix | Last screen at 59 to 70 ms (3 sections), at the end; all 125 sections drawn by 1.6 s; the last section moved at most 1 px and the view never left the end; no frame of 50 ms or more. Before the fix: 186 px short of the end for good (F1) |
| Scroll-follow after the fix | A 400-message reopen, then a reply streaming two messages every 10 ms: 40 wheel steps of 8 px up, a 400 px wheel step, a rail jump to prompt 10, PageUp on a focused copy button, the wheel back to the end | pass | Streaming at the end: 0 px from it. After the 8 px steps the view stays (2,738 px from the end and growing), after the 400 px step too; after the jump it stays on prompt 10; PageUp leaves the end; back at the end it follows again |
| R29: 60 s idle | Every `setTimeout`, `setInterval`, `requestAnimationFrame` and `requestIdleCallback` counted for 60 s after a finished turn, panel shown | pass | 0 calls, 0 callbacks |
| R29: closing tabs releases DOM, listeners, render children | 10 tabs opened with a rich turn each, then closed; two forced garbage collections; CDP DOM counters and `queryObjects` | pass | Nodes 194 → 2,438 → 198; listeners 76 → 477 → 77; `Messages` and `ChatTab` 1 → 11 → 1; `TurnView` and `PromptView` 0 → 10 → 0; view children 15 → 35 → 15; ticker subscribers 1 throughout. The same 4 nodes and 1 listener remain after 5 tabs: not per tab |
| R29 / ADR-017: forced theme with 30,000 elements | 30,000 elements beside the panel (30,312 in all), Theme set to Light while Obsidian is dark; the resolver's pass timed and long animation frames recorded | pass, thin margin | First pass (frame, sheet copies) 65 to 85 ms, its frame 86 to 94 ms (ADR-017 chunks only above 100 ms: F4). Re-resolve: Obsidian back to dark 6 ms, accent change 8 to 9 ms, Obsidian light (nothing forced) 4 ms. Those switches' frames, 177 to 217 ms, are Obsidian's restyle of the document: 172 to 183 ms with Match, where the panel does nothing |
| ADR-017 Migration: the tail's rules rewritten with no visual change beyond the tokens | The `styles.css` before task 042 and after it, each on the same DOM (diff view with gap, cut and Rendered panes; "Changes this conversation"; the restore preview; a confirmation; a history row; the settings error; the branch note), 374 elements × 50 computed properties, light and dark | pass | Equal except `text-align` right/left → end/start, `rgba()` → `color(srgb …)` spellings of the same colors, and the changed-word fill 32% → 30% (the `-word` token) |

## Adversarial checks

- A renderer that fills the DOM a microtask late (worse than Obsidian's):
  the reopen held its end after the fix (it was 1,171 px short before).
- Background and foreground streaming at 200 messages a second while typing.
- Query handles that kept closed tabs alive were found in the harness itself
  and released before counting.

## Findings

- F1, fixed in task 042: a reopened conversation stopped short of its end
  when the last screen's fences or embeds settled below the view; scroll
  anchoring covers only content above it. Scroll-follow now holds a view
  that followed its end (`followsEnd`).
- F2, for the owner: below 4.5:1 in Obsidian's default theme, outside
  R28's clauses: text in `--ai-agent-panel-text-faint` (Obsidian's
  `--text-faint`: times, durations, step summaries, agent meta, form hints,
  "Full input"; 2.0 to 2.2:1 light, 2.3 to 2.7:1 dark), the footer's
  *Branch* label and the thinking toggle (2.3:1 light, 3.0:1 dark), *Waiting
  for you* and a `!` card's "done" (2.95 and 2.5:1 light), the error block
  (3.5:1 light, 4.3:1 dark), diff and step `+`/`-` figures (2.2 to 4.0:1
  light, 4.0 to 4.3:1 dark). WCAG 2.2 SC 1.4.3 asks 4.5:1.
  Recommendation: decide whether R28 extends to them; if so, controls'
  labels in `-text-muted` first.
- F3, for the owner: the turn's duration and cost is a focusable `span`
  without an interactive role (DES-003 Keyboard and accessibility); Chromium
  exposes it as `generic`, named by its text only when focused.
- F4, for the owner: the forced theme's first pass is 86 to 94 ms per frame
  here, below ADR-017's 100 ms trigger for 500-rule chunks; Obsidian with
  community plugins' sheets may cross it. The owed profile decides.
- F5, minor: the column's section headers are named in capitals ("OPEN 2"),
  as Chromium applies `text-transform` to the name.
- F6, fixed in task 042: while a reply streamed, a scroll up that stayed
  within 120 px of the end between two frames was pulled back, so small
  wheel or trackpad steps could not leave the end. A scroll up the user
  makes (wheel, PageUp, ArrowUp, Home, the scroll bar) now leaves it; 120 px
  only rejoins it.

## Change 001's IDs

Named in `node:test` cases (test names start with the ID): PRD-001.R3,
R7, R8, R9, R11, R12, R15, R16, R18, R19, R20, R22, R23, R25, R28, R29,
R30, R31, R32, R33, R34, R35; PRD-002.R1, R6, R7, R8, R12, R16, R18;
PRD-003.R1; PRD-005.R2 to R8. Manual rows only: PRD-003.R11 (DES-003
matrix, M1: Transcript at 300, 440 and 1040 px and 600 px tall) and
PRD-005.R10 (task 033's row 6: no Notice and no error in the messages).

## Owed by hand, in Obsidian, by someone other than the implementer

1. The DES-003 matrix M1 to M8 on the finished panel, with each slice's
   owed rows (tasks 030 to 041, Run logs).
2. R28: a screen reader (NVDA or VoiceOver, M6); Windows high contrast
   (M7); prompt-text contrast in DevTools in Obsidian's default light and
   dark and in the forced Light and Dark (M3); MCP status in `/mcp`.
3. R29 in Obsidian's Electron (M8): streaming while typing in another tab;
   a 1,000-message reopen with Obsidian's renderer and embeds; 60 s idle;
   a heap snapshot after closing a tab; the forced theme with 30,000
   elements, which decides ADR-017's chunks.
4. The real-CLI runs of slices 7 and 9 (owner approval first: metered).

## Disposition

Harness evidence recorded; F1 and F6 fixed; F2 to F5 for the owner; rows 1 to 4
owed before `r06-panel-redesign` is cut.
