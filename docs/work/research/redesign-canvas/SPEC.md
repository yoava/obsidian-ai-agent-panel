# AI Agent Panel redesign: UI specification

Source canvas: "AI Agent Panel Redesign", https://claude.ai/artifact/7oFC6qZknD4LiF4ib7Ef6y (private). Built 2026-10-07 in two Claude Code sessions (s1 `709f1de8…`, s2 `e57a0ff8…`); revised 2026-10-12 in s3 (`253b2296…`). Derived from `project/*.dc.html`, `project/canvas.json`, `generator/common.css`, `generator/pops.py`, the three transcripts, and the repo at `chore/agentic-sdlc`. `project/` is byte-identical to artifact version 1791922481-c760 (canvas v54, checked 2026-10-13); `generator/` reproduces PopUsage, PopModel and PopAgents from it byte for byte. Where the boards and this spec differ, the boards win.

## 1. Scope and sources

The canvas has five pages, registered in `canvas.json`. **Redesign dark** and **Redesign light** are the implementation target and hold the same rows; every light board is a `Light<Name>` wrapper that mounts the dark board of that name with `theme="light"` (`<dc-import>`), so light comparisons use the light page. **Tab options · not for implementation** (TabOption1–9) and **Prompt options · not for implementation** (PromptOption0–7, PromptOptionB) hold s3's explorations; their choices (tab option 3; prompt options 7, B and 5) are folded into the main pages (D16, D17). **Tab thumbnails · chosen B** (TabThumbA–D, 1040×372, s4) holds options for the Settings › Conversation tabs previews; build **TabThumbB** only (D20). Never implement from the options pages. Each main page holds 27 boards in six rows: **Row 1 "Sidebar panel · 440 px"**: Main, Approve, Question, Empty, Commands, Settings. **Row 2 "Responsive · one fluid panel at four sizes"**: Narrow, Short, Medium, Responsive (four identical copies of one component, differing only in `<title>` and preview size; interactive). **Prompt-styles row "Prompt styles · Settings › Prompt style"**: PromptStyleQuiet, PromptStyleBubble, PromptStylePopout (§4.7). **Row 3 "Slash commands answered by the panel"**: SlashUsage, SlashMcp, SlashConfig, SlashTools, SlashHelp. **Row 4 "Agents & context events"**: Agents, WorkflowView (interactive), ContextEvents, ClearStates. **Row 5 "Popovers & tooltips"**: ContextCache, PopUsage, PopModel, PopAgents, Tooltips. **MobileHome and MobileRead were dropped on purpose**: s1 built them as a row "Mobile · desktop-only plugin"; after the user wrote "keep the plugin desktop-only." the assistant said "Removing the mobile row" and later "I took the mobile row out"; the live canvas does not carry them; §4 records them from the s1 transcript. Do not implement them. Provenance: rows 1–3 and the mobile pair come from s1 before its compaction; rows 4–5, Settings › Appearance and the cache timer on every status line from s1 after compaction; ClearStates and the hidden history button at ≥ 820 px from s2; browser tabs, the light page, the prompt-styles row, three prompt styles and the slash boards' 1360 px height from s3. No plugin code was changed in either session.

## 2. Design system

### 2.1 Color tokens

Tokens live on the panel root (`.app` in the mocks). Dark is the default; `.t-light` overrides; accent classes override the four accent tokens. Canonical values are `generator/common.css` plus the board-local tokens the tables mark (`--amber-text`, `--stuck` on the fluid boards and Settings; `--green-word`/`--red-word` on Main and Approve); per-board deviations follow the tables.

| Token | Dark | Light | Purpose |
|---|---|---|---|
| `--bg` | `#141417` | `#fbfbfa` | Panel background; sticky-prompt backdrop |
| `--bg-2` | `#18181c` | `#f4f4f2` | Recessed areas: side column, card footers, diff body, shell output, popover footers, workflow phase bar and detail pane |
| `--surface` | `#1d1d22` | `#ffffff` | Cards: composer, steps, reports, popovers, permission/question, active side row |
| `--surface-2` | `#26262c` | `#f0f0ed` | Hover fill, chips, tiles, segmented-control track, open trigger |
| `--surface-3` | `#2f2f36` | `#e6e6e2` | Bar tracks, free-space segment, toggle-off track, switcher count |
| `--line` | `rgba(255,255,255,.07)` | `rgba(24,24,32,.08)` | Hairlines: header/sub-bar borders, card borders, row separators |
| `--line-2` | `rgba(255,255,255,.12)` | `rgba(24,24,32,.14)` | Stronger lines: composer and popover borders, ghost chips, outline buttons, ring track |
| `--text` | `#ededf0` | `#1b1b20` | Primary text |
| `--muted` | `#a6a6b0` | `#53535d` | Secondary text; icon buttons at rest |
| `--faint` | `#8c8c96` | `#696973` | Meta, labels, timestamps, placeholders |
| `--strip` | `#222227` | `#ebebe7` | Tab strip behind the header's tabs |
| `--user-bg` | `#2a241c` | `#fdf3e4` | Bubble and Pop-out prompt fill |
| `--user-line` | `rgba(245,180,90,.36)` | `#ecca95` | Bubble and Pop-out prompt border |
| `--amber` | `#f5b45a` | `#d98a1c` | Number badge tint (22 %), Quiet prompt border (42 %), `!` glyph, commit hashes, active rail tick |
| `--amber-text` | `#f5b45a` | `#9a5b06` | Number and "You" in Quiet and Pop-out prompts |
| `--green` | `#4fc58c` | `#16864f` | Done, `+N`, OK, warm cache |
| `--red` | `#f2706f` | `#cc3b3a` | Errors, `−N`, stop/deny, Auto/Bypass permission, failed agents |
| `--orange` | `#f5a04a` | `#a85a08` | Waiting for you, permission card, warn threshold, expiring cache, context near full, "Context cleared" |
| `--green-soft` | `rgba(79,197,140,.13)` | `rgba(22,134,79,.09)` | Added diff lines, OK pills, "no tokens" badge |
| `--red-soft` | `rgba(242,112,111,.13)` | `rgba(204,59,58,.08)` | Removed diff lines, Stop fill, stop hover, red pills |
| `--red-line` | `rgba(242,112,111,.45)` | `rgba(204,59,58,.4)` | Error card border, failed agent card |
| `--orange-soft` | `rgba(245,160,74,.13)` | `rgba(168,90,8,.08)` | Permission halo/icon tile, warn pills, usage-warn segment, sandbox warning |
| `--orange-line` | `rgba(245,160,74,.45)` | `rgba(168,90,8,.4)` | Permission card border |
| `--green-word` / `--red-word` | `rgba(79,197,140,.34)` / `rgba(242,112,111,.34)` | `rgba(22,134,79,.22)` / `rgba(204,59,58,.2)` | Changed words inside diff lines |
| `--shadow` | `0 18px 40px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.3)` | `0 18px 40px rgba(24,24,48,.10), 0 2px 8px rgba(24,24,48,.06)` | Composer, popovers, hover cards |
| `--stuck` | `0 10px 22px -10px rgba(0,0,0,.7)` | `0 10px 22px -10px rgba(24,24,48,.25)` | Under a pinned prompt |
| `--tip-bg` / `--tip-text` | `#3b3b44` / `#f4f4f6` | `#26262c` / `#ffffff` | Plain tooltips (dark in both themes) |
| `--wv` | 16×8 SVG mask, path `M0 4 Q4 0.6 8 4 T16 4`, stroke 1.5 | same | Wavy line of context-event dividers |

Accent tokens: `--accent` (accent text/icons), `--accent-fill` (solid buttons, send), `--accent-soft` (tinted fills), `--accent-line` (focus rings, selected borders).

| Accent | Dark: accent / fill / soft / line | Light: accent / fill / soft / line |
|---|---|---|
| violet (default) | `#a99cfa` / `#6d5ce7` / `rgba(139,124,246,.15)` / `rgba(139,124,246,.5)` | `#5847d4` / `#6352e0` / `rgba(99,82,224,.09)` / `rgba(99,82,224,.4)` |
| blue | `#82aeff` / `#2f6fe0` / `rgba(80,140,255,.15)` / `rgba(80,140,255,.5)` | `#1d5cc9` / `#2463d6` / `rgba(36,99,214,.09)` / `rgba(36,99,214,.4)` |
| teal | `#5fd4c6` / `#0f7c74` / `rgba(60,200,185,.14)` / `rgba(60,200,185,.5)` | `#0b6c65` / `#0e7a72` / `rgba(14,122,114,.09)` / `rgba(14,122,114,.4)` |

Category palettes (two, inconsistent, see §7 Q6):
- `/context` card (Commands): `--c0..c4` dark `#6ea8fe #b38cff #4cc9e0 #f5a04a #4fc58c`, light `#2f6fe0 #7b4fd6 #0f8ca3 #d47a14 #1e9a5c` for System prompt, System tools, MCP tools, Memory files, Messages.
- Context popover (ContextCache): dark `#8b8b96 #6aa3f5 #d68be0 #f0a35a var(--accent)`, light `#9a9aa4 #3b7ae0 #b04fc0 #c97a1c` (Messages stays `var(--accent)` in both themes) for System, MCP, (unused), Memory, Messages.

Board deviations (use the canonical values): light `--orange` `#b8620a` on Main, Approve, Question, Empty, Commands; light `--amber` `#b06d0e` on Commands; `--orange-line` `.55`/`rgba(184,98,10,.5)` on Approve; light `--orange-soft` `rgba(184,98,10,.08)` (Main, Approve, Question, Commands) or `rgba(168,90,8,.09)` (SlashUsage, SlashMcp, SlashConfig, SlashTools; SlashHelp defines none); the "no tokens" badge background hard-coded `rgba(79,197,140,.12)` on Commands (use `--green-soft`).

**Obsidian mapping.** Owner decision (2026-10-12): inside the panel and the workflow view the mock's look wins over Obsidian's theme; the accent follows Obsidian's (D13). The mapping below predates that decision; the ADR that implements it decides what survives. Accent and theme are canvas tweaks. s1: "in Obsidian the accent would follow the vault's theme"; Geist is mock-only. No token mapping was decided; AGENTS.md requires colors and spacing from Obsidian CSS variables. Recommended mapping (verify in light and dark, default theme plus one community theme):

| Mock token | Obsidian variable |
|---|---|
| `--bg` | `--background-primary` |
| `--bg-2` | `--background-secondary` |
| `--surface` | `--background-primary-alt` |
| `--surface-2` (hover) | `--background-modifier-hover` |
| `--surface-2` (persistent: chips, tiles, segmented track) | `--interactive-normal`, falling back to `--background-primary-alt`; a hover colour must not paint resting controls |
| `--surface-3` | `--interactive-normal` or `color-mix(in srgb, var(--text-normal) 10%, var(--background-primary))` (bar tracks, toggles, count badges: a fill, never a border variable) |
| `--line-2` | `--background-modifier-border-hover` |
| `--line` | `--background-modifier-border` |
| `--text` / `--muted` / `--faint` | `--text-normal` / `--text-muted` / `--text-faint` |
| `--accent` / `--accent-fill` | `--text-accent` / `--interactive-accent` (label `--text-on-accent`) |
| `--accent-soft` / `--accent-line` | `color-mix(in srgb, var(--interactive-accent) 15%, transparent)` / `… 50%` (channel variables such as `--accent-h` or `--color-red-rgb` are left stale by themes that override only the semantic colours) |
| `--green` / `--red` / `--orange` as status text (ok, failed, warning, "Waiting for you") | `--text-success` / `--text-error` / `--text-warning` |
| `--green` / `--red` / `--orange` as categorical colour (diff stats, meters, swatches) | `--color-green` / `--color-red` / `--color-orange` |
| `--*-soft`, `--*-line`, `--*-word` | `color-mix(in srgb, var(--color-*) α%, transparent)` with the alphas above |
| `--shadow` | `--shadow-l` |
| `--tip-*` | Obsidian native tooltip (`setTooltip`) |
| tabs, `--strip` | Obsidian's own workspace tab header (`.workspace-tab-header-container`, `.workspace-tab-header`, `.is-active`, `-inner`, `-inner-title`, `--tab-*` variables), tuned to §2.7 (D16) |
| `--user-*`, `--amber*` | Owner decision pending: today's fixed `#ffb454` (chosen for deuteranopia) or a `--color-orange`-derived token. Either way one narrowly scoped prompt token: bubble and pop-out fills via `color-mix` into `--background-primary`; prompt numbers, rail ticks, hashes and badges take accent or status variables, not the amber (today's CSS limits the amber to the prompt treatment, `styles.css` ~591) |
| category palette | `--color-blue`, `--color-purple`, `--color-cyan`, `--color-orange`, `--color-green`, `--color-pink` (the mock's order; today's `styles.css` meters run blue, purple, orange, green, cyan, pink: pick one order for both) |
| radii | `--radius-s` (4), `--radius-m` (8), `--radius-l` (12); 14 px cards → `--radius-l` |
| spacing | `--size-2-1`…`--size-4-6` |
| sizes | Host-native: 10.5–12 px → `--font-ui-smaller` (12), 13 px → `--font-ui-small`, body → inherited. This collapses the mock's 10.5 / 11 / 11.5 / 12 steps into one; keep a fixed-px step only where a hierarchy needs it (label vs meta on one row). Decide per component in DES-003 |

### 2.2 Typography

Geist (400/500/600) and Geist Mono (400/500); the mocks load them from Google Fonts (§6 Fonts). Mock base 13.5 px / 1.5; mono spans `.92em`; Markdown inline code `.86em`; question chips track `.02em`.

| px | Use |
|---|---|
| 10.5 | Labels in common.css (`.lbl`: 600, uppercase, `.07em`), kbd, model tag, "no tokens" badge, timeline axis, prompt number |
| 11 | Board labels (600 uppercase `.06em`), side-column section and date headers, row times, step stats |
| 11.5 | Meta: context line under prompts, "Thought for", timestamps, leads, sub-lines, notes |
| 12 | Chips, status segments, small buttons, report footers, tooltips |
| 12.5 | Tabs, step rows, report rows, key/value lists, `/` command bubbles (mono) |
| 13–13.5 | Body, textarea, popover title (13), Empty subtitle (13) |
| 14 | Assistant Markdown (line-height 1.62); Quiet and Pop-out prompt text (400) |
| 15 | Cache countdown in popover; `/cost` tiles |
| 16 | Workflow view title |
| 18 | Settings headings (`-.01em`) |
| 20 | Empty heading (600, `-.01em`) |
| 22–24 | Big figures: context popover (22), `/context` and `/cost` (24, `-.02em`/`-.03em`) |

Weights: 600 titles, "Claude", "You", labels; 500 tool verbs, buttons, option labels, emphasised values; 400 body.

### 2.3 Spacing, radius, sizes

- Spacing: the boards use 1–12 px in 1 px steps, then 14, 16, 18, 20, 22, 24, 26, 28, 36 px (not a strict scale; map to an Obsidian `--size-*` step within 1 px where one exists). Transcript gutter 16 (≥ 560: 24; < 360: 12); composer gutter 12 (≥ 560: 16; < 360: 8).
- Radius: 1 streaming caret; 2–3 bars and word highlights; 4 tooltip kbd; 5 menu kbd, prompt number, inline code; 6 tiles, segmented items, small stop buttons; 7 status segments, card action icons, agent mark; 8 icon buttons, buttons, side rows; 9 send/stop, tab top corners (`9 9 0 0`) and the active tab's concave foot; 10 options, agent cards, hover cards, single-row step card; 12 cards, popovers, run bar, Quiet and Pop-out prompts, starters, compact slash bubble (`12 12 4 12`); 14 composer, permission/question/report cards, bubble prompt (`14 14 4 14`); 15 Empty hero tile; 999 chips and pills. Settings previews use small asymmetric radii of their own (mock-only).
- Sizes: icon button 28×28; tab h30; status segment h26; chip h24 (ghost h26); button h28 (common), h30 (row-1 boards, including the permission and question cards), h26 (report and shell cards); send/stop 30×30; tool tile 22 (Empty 24); agent mark 22; step row h30; agent row min-h 36; run bar h38; dots 6 (status), 4 (activity), 7–8 (report); icons 12/14/16/18, stroke 1.8, round caps and joins.
- Thread max-width 740 centered; composer max-width 772 centered.

### 2.4 Icons

Lucide stroke icons: plus, history, settings, ellipsis, x, pin, chevron-down/up/left/right, chevrons-up-down, file, file-text, file-diff, file-down, folder, link, search, pencil, terminal, git-branch, rotate-ccw (Restore), rotate-cw (Refresh, Reconnect, Try again), refresh-ccw (usage popover), copy, check, paperclip (attach; replaces today's `plus`), square-slash, arrow-up (send/queue; replaces `send`), square filled (stop), sparkles (model; replaces the agent glyph in that segment), gauge (effort), shield (Ask), shield-check (Accept edits), zap (Auto in red; also cache warm), zap-off (cache cold/rebuilding), bot, workflow, maximize-2 (open workflow view), app-window (open in a tab), loader arc (rotating), circle-dashed (queued/waiting), circle-x (failed), triangle-alert, info, eye (Rendered), eraser (Context cleared), fold-vertical (Compacted), fold-vertical without dashes (Compact button), undo-2, circle-help, book-open (/memory), webhook (/hooks), plug (/mcp), activity (/status), globe (/chrome), package (/sandbox), credit-card (/usage-credits), receipt (/cost), gauge (/usage), external-link, arrow-up-right, power (enable/disable), cloud (settings sync badge). Plan (`clipboard-list`), Bypass (`shield-off`), Don't ask (`shield-x`), Auto mode (`sparkles`) are not mocked; keep today's icons.

Custom agent glyph (unchanged, `src/icon.ts`): chat bubble with a terminal prompt; 24-unit paths `M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z`, `m7.5 8 2.5 2.5L7.5 13`, `M12.5 13h4`. Used as the "Claude" mark (12 px in a 22 px `--accent-soft` tile, radius 7, `--accent` stroke) and the Empty hero (26 px, stroke 1.6, 52 px tile radius 15, inset 1 px `--accent-line`).

Context ring: 16-unit SVG drawn at 13 px; track circle r 6, stroke `--line-2` 2.4; progress circle r 6 rotated −90°, stroke `--accent` (orange near autocompact), round cap, `stroke-dasharray: (pct × 37.7) 37.7`.

### 2.5 Motion

| Name | Spec | Use |
|---|---|---|
| pulse | opacity .35↔1 | busy dot 1.4 s; cache zap while working 2 s; activity dots 1.2 s, delays 0/.2/.4 s |
| ring | box-shadow 0→7 px `--accent-line`, fading, 1.6 s ease-out | live "Claude" mark |
| spin | 360°, 1 s linear | loaders |
| slide | 40 %-wide transparent→accent→transparent gradient sweeping −100 %→250 %, 1.8 s | 2 px line under run bar and running agent cards |
| wv | wave mask scrolls 16 px, .9 s linear; right wave reversed | "Compacting automatically…" |
| blink | 1 s steps | streaming caret (transcript 7×15 accent block; workflow pane 2×13) |
| shimmer | gradient 240 px sweep, 1.4 s | report skeleton |
| toggle | .15 s | settings switch |

Easing: pulse and slide `ease-in-out`; ring `ease-out`; spin, wv and shimmer `linear`; blink `steps(1)`.

Not in mocks, recommended: honour `prefers-reduced-motion`.

### 2.6 Tweak props (canvas only)

| Prop | Values | Default | Effect | Product equivalent |
|---|---|---|---|---|
| `theme` | dark, light | dark | root class `t-light` | Settings › Appearance › Theme |
| `accent` | violet, blue, teal | violet | `acc-blue` / `acc-teal` | Obsidian accent |
| `prompts` (row 2, prompt-styles row) | quiet, bubble, pop-out | pop-out | root class `pp` (Quiet and Pop-out): numbered full-width prompts + jump rail; plus `pq` (Quiet): outline instead of fill | Settings › Transcript › Prompt style |
| `sticky` (row 2) | boolean | true | root class `ps`: current prompt pins while scrolling | "Pin the current prompt while scrolling" |

The rail has its own setting, "Prompt jump rail", shown with Quiet and Pop-out.

### 2.7 Shared components

**Buttons.** `btn-p` primary: `--accent-fill`, white, hover brightness 1.08. `btn-s` secondary: inset 1 px `--line-2`, hover `--surface-2`. `btn-d` danger: `--red` text, hover `--red-soft` (some instances pre-filled `--red-soft`). `btn-g` ghost: `--muted`, hover `--surface-2`/`--text`. h28 (common), h30 (row 1, including the permission and question cards), h26 (report and shell cards); radius 7–8, 12–12.5 px 500.

**Icon button.** 28×28, radius 8, `--muted`; hover `--surface-2`/`--text`. Each has a text tooltip.

**Tab.** Browser style (D16). h30, padding 0 12, radius `9 9 0 0`, 12.5 px `--muted`; max-width 150, active 170 (≥ 560: 200/220); hover fill `--line-2` + `--text`; a 1 px `--line-2` separator (8 px from top and bottom) between neighbours, hidden beside the active tab and beside a hovered one; active: `--bg` fill, `--text`, 600, z 1, never shrinks, and 9 px concave corners at its foot on both sides (radial gradients to `--bg`) so it flows into the transcript. Build it on Obsidian's workspace tab header, which has this shape (§2.1 mapping). Children: pin (12 px `--accent`, pinned tabs, replaces the dot, title "Pinned") · status dot (busy `--accent` pulsing; waiting `--orange` steady, title "Waiting for you"; idle none) · title (ellipsis) · optional agent badge (h18, radius 5, `--accent-soft`/`--accent`, bot + count; tab title "2 agents running"). No × on top tabs.

**Header (default width).** Row, gap 4, padding `6 8 0 10`, background `--strip`, bottom border 1 px `--line-2`: tabs nav (`aria-label` "Conversations"; flex 1, gap 0, tabs bottom-aligned, stretched to the header's height, margin-bottom −1 so the active tab covers the border, overflow hidden) · `+` "New conversation" (16 px icon) · 1×16 divider `--line-2` · history "Previous conversations" · settings "Plugin settings". Below 360 and at ≥ 820 the header drops the strip (§3).

**Sub-bar.** Row, gap 8, padding `8 12 8 12` (`0 12 8 12` below 360), bottom border: changes chip (ghost h26, gap 7: file-diff + "3 files" + mono green "+42" + mono red "−7"; title "Show the files this conversation changed"; click → changed-files popover) · spacer · "Transcript" (segment style, file-text icon; title "Open the exported note"; only when exported).

**Prompt, bubble style.** Right-aligned, max-width 86 % (94 % below 360), `--user-bg`, 1 px `--user-line`, radius `14 14 4 14`, padding `9 12`, line-height 1.55. Under it, right-aligned context line (11.5 `--faint`, file icon 12): "Q4 planning.md · 6 lines selected". Today's 4 px amber left bar is removed. `/` and `!` messages use a compact mono bubble (padding `5–7 11–12`, 12.5 px; `!` in `--amber` 500).

**Prompt, Quiet and Pop-out styles (numbered).** Full width, radius 12, padding `9 12 11 12`. Head (11.5 px, gap 7, margin-bottom 4): number badge (min 18×18, padding 0 5, radius 5, `color-mix(in srgb, var(--amber) 22%, transparent)`, text `--amber-text` 600 10.5) · "You" (600 `--amber-text`) · time "14:02" (`--faint`) · right-aligned context (file icon + "Q4 planning.md · 6 lines", `--faint`, ellipsis). Text 14 px 400. The separate context line is hidden. **Pop-out** (default): the bubble's `--user-bg` fill and 1 px `--user-line` border. **Quiet**: `--bg` fill and 1 px `color-mix(in srgb, var(--amber) 42%, transparent)` border.

**Sticky prompt.** Each turn's prompt wrapper: `position: sticky; top: 0; z-index: 3`, background `--bg`, padding 8 0 with −8 px margins. While stuck: `--stuck` shadow, text clamped to one line, context line hidden. The mock detects the stuck state with `@container scroll-state(stuck: top)`, which Obsidian 1.8 (Electron 33) lacks: toggle an `is-stuck` class from an `IntersectionObserver` sentinel above each prompt and keep the scroll-state query as progressive enhancement only. Click → scroll to the start of that turn. Works in all three styles.

**Prompt jump rail (Quiet and Pop-out).** Absolute, right 8 (5 below 360), top/bottom 16, width 16, z 4; thread right padding 34 (28 below 360, 40 at ≥ 560). One tick per prompt at its relative position: 8×3, radius 2, `--line-2`; hover or current → `--amber`, width 13. Hover shows a card left of the tick (`--surface`, `--line-2`, radius 8, padding `4 9`, `--shadow`, 12 px, max 240, ellipsis): "1 · Turn the open questions into tasks…". Click jumps to the prompt. aria-label "Jump to a prompt".

**Assistant turn.** Head row, gap 8: mark · "Claude" (600 12.5) · state. Finished: pill "Thought for 4s ›" (h22, 11.5 `--faint`, hover `--surface-2`; click expands thinking). Working: "Working" or "Writing" (11.5 `--faint`), ring animation on the mark, elapsed mono "18s" right. Waiting: orange dot + "Waiting for you" (`--orange`), elapsed right. Blocks below, gap 10.

**Steps card.** A turn's tool calls grouped (`--surface`, 1 px `--line`, radius 12). Header button h34, 12 px `--muted`, bottom border: green check · "4 steps" (500 `--text`) · "12s" (`--faint`) · spacer · chevron-up when expanded, chevron-down collapsed. Rows h30, padding 0 10, 12.5 px, hover `--surface-2`: tile (22, radius 6, `--surface-2`/`--muted`; edits and the active row `--accent-soft`/`--accent`) · verb 500 (Search, Read, List, Edit, Grep, Resolve) · mono summary (11.5 `--faint`, ellipsis) · optional result ("9 notes", "7 files") or mono diff stat (11 px green "+12", red "−5"). A 1 px `--line-2` rail joins tiles (left 21, inset 20 top/bottom). Running: no header; active row accent tile, `--muted` summary, three pulsing 4 px dots. One tool call: single-row card (h34, radius 10; the fluid boards draw it inside the 12 px steps card, use 10) with trailing green check, no header.

**Turn footer.** Row gap 2, margin-left −6, items h24 11.5 px `--faint`: "Restore files" (rotate-ccw; title "Put the files this turn changed back as they were") · "Branch" (git-branch; title "Open a new tab that continues from just before this turn") · copy 24×24 ("Copy message") · right mono 11 "12.4s · $0.021" (hover card). Labels drop below 360 px.

**Composer.** Area padding `6 12 10 12`, column gap 6, max-width 772 centered: optional run bar, composer card, status line. Card: `--surface`, 1 px `--line-2`, radius 14, `--shadow`, padding `10 8 8 12`, gap 8; focus-within adds a 1 px `--accent-line` ring (focused variant on Empty/Commands: `--accent-line` border + 3 px `--accent-soft` ring).
1. Chips row (wrap, gap 6). Chip h24, radius 999, 12 px, 12 px icon. On (attached): `--accent-soft`/`--accent`; aria "Active note is attached - click to exclude"; tooltip "Sent with your message · click to leave out". Off (offer): transparent, inset 1 px `--line-2`, `--faint`, `+` icon; arias "Click to attach links and properties", "Click to attach the active folder", "Click to attach the active note".
2. Textarea, 2 rows, no resize handle; mono when the text starts with `/`.
3. Footer: paperclip "Attach a file as context" · square-slash "Show commands" (`--accent-soft`/`--accent` while the slash menu is open) · [inline note chip: at ≤ 640 px tall, and whenever the chips row is absent, as with Question's offer chip] · spacer · Stop (30×30 radius 9, `--red-soft`/`--red`, filled square; only while working or waiting; aria "Stop"; tooltip "Stop Claude’s turn" + kbd "Esc") · Send (30×30 radius 9, `--accent-fill`, white arrow-up 16 px stroke 2.2; aria "Send", or "Queue message" while working).

| State | Placeholder | Card | Send |
|---|---|---|---|
| Idle, ongoing conversation | "Reply, or @ to mention a note…" | normal | accent, "Send" |
| Working | "Claude is working. Enter queues another message…" | normal | accent, "Queue message" |
| Waiting for an answer above | "Claude is waiting for your answer above…" | opacity .92 | disabled look (`--surface-2`/`--faint`), "Queue message" |
| New conversation | not mocked (Empty shows typed text) | focused | accent |

**Status line** (one row under the composer; replaces today's footer meters and config bar). Segment: h26, padding 0 8, radius 7, 12 px `--muted`, hover `--surface-2`/`--text`; `.on` (popover open) `--surface-2` + `aria-expanded="true"`.
1. Model: sparkles (`--accent`) + "Opus 5.5" (`--text`). aria "Model". Click → Model & effort popover.
2. Effort: gauge + "High" (≥ 560 "High effort"). aria `Reasoning effort: <level>` (the row-1 boards' bare "Reasoning effort" is superseded; the level matters below 360 px, where the segment is icon-only).
3. Permissions: icon + short label (≥ 560 long): "Ask" shield; "Edits"/"Accept edits" shield-check; "Auto" zap in `--red` on `--red-soft`. aria `Permissions: <long mode name>` ("Permissions: Accept edits", "Permissions: Auto-approve everything"; the row-1 boards' bare "Permissions" is superseded). Tooltip example: "Accept edits · file edits run without asking; shell commands still ask".
4. Spacer.
5. Context & cache: ring + mono "34%" + 1×12 `--line-2` divider + cache icon + optional countdown.

| State | Icon | Countdown | Gallery caption |
|---|---|---|---|
| Working | zap `--green`, pulsing 2 s | none | "Working. Every request refreshes the cache." |
| Warm | zap `--green` | "4:12" `--text` | "Warm. Counts down from the last request." |
| Expiring | zap `--orange` | "0:48" `--orange` | "Expiring. Under a minute left." |
| Cold | zap-off `--faint` | none | "Cold. The next prompt rebuilds the cache." |
| 1-hour cache | zap `--green` | "52m" | "1-hour cache. Minutes once over 10 left." |
| Nearly full | ring + % `--orange` | per cache state | "Nearly full. Ring turns orange near autocompact." |
| Compacting | ring + % `--orange`, segment fill `--orange-soft`, zap-off | none | (ContextEvents) |

aria patterns: "Context: 68k of 200k tokens (34%). Prompt cache warm, 4:12 left"; "…Prompt cache warm, refreshed by each request"; "…Prompt cache expiring, 0:48 left"; "Context: 190k of 200k tokens (95%), compacting. Prompt cache will be rebuilt after compacting". Hidden until the first turn ends (Empty has none). Below 360: ring + cache icon only. Hover → hover card; click → Context & cache popover.
6. Plan usage: "5h" + mono "42%" (`--text`) + [≥ 560 "resets 16:59" `--faint`] + "·" + "wk" + mono "18%". When a limit passes the warn threshold: segment fill `--orange-soft` and that limit replaces "wk" with an orange 500 value ("5h 42% · Sonnet 81%"). Hidden below 360. aria "Plan usage". Hover → hover card; click → Plan usage popover.
Profile segment: not mocked (§7 Q2).

**Report card** (every slash result). `--surface`, 1 px `--line`, radius 14. Header (padding `12 10 0 12`, gap 9): 26×26 icon tile radius 7 `--accent-soft`/`--accent` · title 600 · "no tokens" badge (h18, radius 999, 10.5 px 500, `--green` on `--green-soft`) · spacer · 26×26 action icons (`--faint`, hover `--surface-2`): "Refresh" (rotate-cw) and/or "Copy as Markdown" (copy). Optional lead (12 px `--faint`, left padding 47 to align with the title). Body padding 14 (top 10–12), gap 12–14. Section header 11 px 600 uppercase `.06em` `--faint`, optional count (500, no tracking). Row lists separated by `--line`, first row borderless. Key/value grid: dt 128–150 px `--muted`, dd; 12.5 px; rows separated by `--line`. Pills h19 radius 999 11 px 500: ok green/green-soft, warn orange/orange-soft, err red/red-soft, off `--faint`/`--surface-2`, acc accent/accent-soft. Status dots 7–8 px: ok green, warn orange, off = 1.5 px `--faint` ring. Footer (padding `9 14`, top border, `--bg-2`, 12 px `--muted`): leading 14 px icon (info, terminal or settings in `--faint`) + note; links `--accent` with external-link icon. The command shows as a compact mono user bubble above the card.

**Context-event divider.** Centered column, gap 4. Line: wave · pill · wave. Wave: flex 1, h8, `currentColor` at .55 through the `--wv` mask. Pill: h24, radius 999, padding 0 10, 12 px 500, fill `color-mix(in srgb, currentColor 9%, var(--bg))`, ring `inset 0 0 0 1px color-mix(in srgb, currentColor 42%, transparent)`, icon in currentColor, label `--text`. Sub-line 11.5 px `--faint`, centered, wraps, "·"-joined. `currentColor`: `--orange` cleared, `--accent` compacted/compacting. Finished events `role="separator"` + aria-label ("Context cleared at 14:02", "Compacted at 14:20, 131k to 18k tokens"); in-progress `role="status"`.

**Popover.** `--surface`, 1 px `--line-2`, radius 12, `--shadow`, 12.5 px. Header padding `11 8 0 12`, title 600 13 px; body padding `10 12 12 12`, gap 10; a second section adds a top border; footer padding `6 6 6 12`, top border, `--bg-2`, gap 4. Anchored above the status line (`bottom: 44px`), aligned to the trigger's side. Its trigger shows `.on`. Close on Esc and outside click (implied).

**Hover card.** `--surface`, 1 px `--line-2`, radius 10, `--shadow`, padding `9 11`, 12 px, gap 6; rows label (grow) + mono value; sub-lines `--muted`/`--faint` 11 px.

**Tooltip.** Padding `5 9`, radius 7, `--tip-bg`/`--tip-text`, 12 px / 1.35, shadow `0 6px 18px rgba(0,0,0,.28)`, nowrap unless given a width; optional kbd (mono 10.5, padding `1 5`, radius 4, `rgba(255,255,255,.14)`).

**Kbd in popovers.** min 18×18, radius 5, `--surface-2`, inset bottom 1 px `--line-2`, mono 10.5 `--muted`.

## 3. Layout model and responsive rules

One fluid component. Every rule keys off the **panel's own size** through container queries (`.app { container: panel / size; width: 100%; height: 100% }`; the mock uses `height: 100vh`, which in a plugin would size against the Obsidian window), not the window. Size containment needs a definite height: give the view content a definite flex height, or use `container-type: inline-size` for the width rules and a `ResizeObserver` class for the ≤ 640 px rule. Structure: a row of [main column: header, sub-bar, transcript, composer area] + [optional side column on the right]. The mock bottom-aligns a short transcript with `flex-direction: column-reverse` on a scroller whose only child is the `.thread`; implement that with normal flow plus a flex spacer (`margin-top: auto`) so DOM, tab and screen-reader order stay chronological and today's scrollTop logic survives, and open at the newest message by scrolling.

| Panel size | Header | Tabs | Sub-bar | Transcript | Composer & status line |
|---|---|---|---|---|---|
| **< 360 px wide** (Narrow 300×900) | No strip or bottom border, padding-bottom 8; `+` stays; history, settings and the divider hide; ⋯ "More: history, transcript, settings" appears | Tabs become a **switcher**: h30 button, radius 8, `--surface-2`, inset `--line-2`, 12.5 px 500: status dot + active title + chevron-down + count badge "4" (h17, `--surface-3`, 11 px); aria "Switch conversation, 4 open" | Changes chip shows "+56 −16" only; Transcript link hides | padding `14 12 10 12`, gap 18; prompt max 94 %; rail right 5; step results and turn-footer labels hide | Padding `6 8 8 8`; chips keep their full label (the mock's `.chip-detail` rule has no target); status segments icon-only (model keeps its name); context % hides; usage hides; segment padding 0 7 |
| **360–559** (default; Short at 440) | full | top tabs | shown | padding `16 16 12`, gap 22 (row-1 boards use mock-local `18 16 10–12`, gap 14–18: superseded) | short labels; usage without reset time |
| **≥ 560** (Medium 680×900) | same | tab max 200, active 220 | shown | padding `22 24 14`, gap 26; Quiet and Pop-out right padding 40 | padding `6 16 12 16`; "High effort", "Accept edits", "resets 16:59" |
| **≥ 820** (Responsive 1040×900) | No strip; bottom border `--line`, padding `10 10 10 16`, gap 6; **title block** (title 600 13.5 + "3 prompts · started 14:02" 11.5 `--faint`) + changes chip ("+56 −16"); `+`, history and divider hide; settings stays | Tabs hide; **conversation list column** appears | hidden | as ≥ 560 | as ≥ 560 |
| **≤ 640 px tall** (Short 440×600) | As default width; changes chip moves into the header | unchanged | hidden | padding-top 10 | Chips row hides; active-note chip shows inline after the slash button; textarea one line (h21); card padding `8 8 6 12`, gap 6 |

Rules combine (300×600 gets compact and short rules). At ≥ 820 the container is the whole panel, so ≥ 560 rules also apply.

**Conversation list column (≥ 820).** `<aside aria-label="Conversations">`. Width `clamp(220px, 26cqw, 300px)`, `--bg-2`, left border; resize grip on the left edge (5×32, radius 3, `--line-2`, `col-resize`, visible on column hover). Top row (padding `10 10 8`): filter (h30, radius 8, `--surface`, inset `--line`, focus inset `--accent-line`; search icon + placeholder "Filter…", aria "Filter conversations by title") + `+` "New conversation". List: scrolls, thin scrollbar, padding `0 8 12`, gap 10 between sections. Section header: h26, 11 px 600 uppercase `.06em` `--faint` (hover `--muted`), chevron-down toggles collapse, **sticky top** on `--bg-2`: "Pinned"; "Open" + count; "Recent". Row: h32, padding 0 8, radius 8, 12.5 px `--muted`; hover `--surface-2`/`--text`; active `--surface` + inset `--line-2` + `--text`. Pinned rows: pin (`--accent`) + title + × (if open; shown on hover and on the active row) or relative time. Open rows: dot (busy/waiting/blank) + title + × (shown on hover and on the active row). Recent rows: title + time ("2h", "1d", "3d", "Sep 12") under date headers (11 px `--faint`, padding `8 8 3`): "Today", "Yesterday", "Previous 7 days", "Older". Mock content: Pinned: "Link cleanup" (×), "Reading list" 3d. Open 3: "Q4 planning review" (busy, active), "Weekly review intro" (waiting, title "Waiting for you"), "Newsletter draft". Recent: Today "Vault tag audit" 2h; Yesterday "Meeting notes to tasks" 1d, "Book notes: Thinking in Systems" 1d; Previous 7 days "Dataview query help" 3d, "Rename the Mtg notes folder" 5d, "Garden plan 2027" 6d; Older "Travel checklist" Sep 12.

**History button (s2).** Hidden at ≥ 820 (the list holds pinned, open and recent, with filter and right-click delete). Shown 360–819 (tabs hold open conversations only). In ⋯ below 360. The command-palette command "Previous conversations" stays.

**Sticky behaviours.** Current prompt pins to the transcript top (setting, default on). Side-column section headers stick. Header, sub-bar, run bar, composer and status line sit outside the scroller. The run bar stays above the composer while agents run.

**Workflow view (container `wf`).** ≤ 1080 px wide: detail pane hides, lanes fill. ≤ 880: Tokens and Cost stats and per-phase details hide. ≤ 640: lanes stack to one column; timeline, subtitle and stats hide; phase bar padding `10 12`, gap 4, connectors 6 px; header left padding 14. ≤ 680 px tall: timeline hides.

## 4. Boards

Format: canvas title, row, preview size. Components named in §2.7 are not re-described. "New" marks things the plugin does not do today.

### 4.1 Main: "Conversation · working" (row 1, 440×960)

Purpose: the everyday conversation while Claude works.
1. Header: tabs "Link cleanup" (pinned), "Q4 planning review" (active, busy dot), "Newsletter draft" (waiting dot, title "Waiting for you"); `+`, divider, history, settings. Strip and bottom border as §2.7.
2. Sub-bar: changes chip "3 files +42 −7"; "Transcript".
3. Turn 1 (finished): bubble prompt "Turn the open questions in this note into tasks, and link each one to the project it belongs to." + context line "Q4 planning.md · 6 lines selected". Head "Claude" + "Thought for 4s ›". Steps card expanded "4 steps 12s": Search `tag:#project status:active` "9 notes"; Read `Projects/Website relaunch.md`; Read `Projects/Hiring plan.md`; Edit `Q4 planning.md` +12 −5 (accent tile). Markdown (14 px): "Five of the six open questions are now tasks under **Next actions**, each linked to its project:" list: [Website relaunch] · copy review, launch date; [Hiring plan] · interview loop, offer bands; [Budget 2027] · new note, since none existed; then "“Who owns vendor renewals?” matched no project, so it stays under **Open questions**." Links accent, underlined in `--accent-line`. Footer: Restore files · Branch · copy · "12.4s · $0.021".
4. Turn 2 (live): prompt "Now add due dates from the meeting notes in Meetings/." (no context line). Head: ringing mark, "Claude", "Working", "18s". Running steps card (no header): List `Meetings/2026-*.md` "7 files"; Read `Meetings/2026-10-02 Planning sync.md` (active, pulsing dots).
5. Composer (working): chips "Q4 planning.md" (on) and "+ links & properties" (off); working placeholder; Stop; Send "Queue message".
6. Status line: "Opus 5.5" · "High" · shield-check "Edits" · context 34 % ring + **working** cache (pulsing zap, no countdown) · "5h 42% · wk 18%".

Interactions: tab click switches, hover shows the tab card; steps header toggles; "Thought for 4s" expands thinking; turn-footer actions as today; segments open popovers. New vs today: grouped steps card, floating composer card, single status line, sparkles model icon, cache indicator, prompt bubble without left bar.

### 4.2 Approve: "Approve an edit" (row 1, 440×960)

Purpose: an edit waiting for permission.
1. Header (bottom border): tabs "Link cleanup" (pinned), "Q4 planning review" (busy), "Weekly review intro" (active, waiting dot). No sub-bar.
2. Transcript bottom-aligned (`justify-content: flex-end`): previous reply "Last week you committed to three things: ship the beta, draft the onboarding survey, and book the offsite venue. Only the beta shipped." with footer cost only "6.1s · $0.008" (right-aligned). Prompt "Tighten the intro of my weekly review. It rambles." + context "Weekly review.md".
3. Head: "Claude" + orange dot "Waiting for you" + "42s". Single step row: Read `Journal/2026/Weekly review.md` ✓. Text "Here’s a tighter intro: two sentences instead of four, same facts."
4. Permission card (`role="group"`, aria "Permission request"): `--surface`, 1 px `--orange-line`, radius 14, halo `0 0 0 4px var(--orange-soft)`.
   - Head (padding `12 12 10`): 30×30 tile (radius 8, `--orange-soft`/`--orange`, pencil); title "Edit Weekly review.md?" (600 13.5); sub-line mono `Journal/2026/` + green "+2" + red "−4" (11.5); right a segmented tablist aria "Diff view": "Diff" (selected) | eye "Rendered". Segment item h24, padding 0 9, radius 6, 11.5 px; selected `--surface` + `0 1px 2px rgba(0,0,0,.2)` + inset `--line`.
   - Diff (top/bottom border, `--bg-2`, padding 4 0): grid `26px 26px 16px 1fr` = old line no., new line no. (right-aligned, `--faint`, .75 opacity), sign, text; mono 11.5 / 1.7, pre-wrap. Added rows `--green-soft` with green "+"; removed `--red-soft` with red "−"; changed words `--green-word`/`--red-word`, radius 3. Content: 1/1 `# Weekly review: Oct 5`; 2/2 blank; −3 "This week was honestly a lot, and I’m not"; −4 "sure where to start, but the main thing"; −5 "is we shipped the beta, [which took longer]"; −6 "[than expected because of] the auth bug."; +3 "We shipped the beta [a week late, held up]"; +4 "[by] the auth bug. Next up: onboarding."; 7/5 blank; 8/6 "## Wins". Collapsed gap: full-width button h26, padding-left 58, `--surface-2`, 11.5 `--faint`, chevrons-up-down + "14 unchanged lines" (click expands).
   - Footer (padding `10 12`): "Full input ›" (segment, expands the JSON input) · spacer · "Deny" (`btn-d`) · "Always allow" (`btn-s`; only when the CLI sent suggestions, as today) · "Allow" (`btn-p` with check).
5. Composer waiting: chip "Weekly review.md" on; placeholder "Claude is waiting for your answer above…"; card opacity .92; Stop active; Send disabled look.
6. Status: "Sonnet 5" · "Medium" · shield "Ask" · 12 % · warm "4:38" · "5h 44% · wk 18%".

Interactions: Diff/Rendered toggle swaps to the rendered before/after view (today's preview); gap expands; Allow/Always allow/Deny settle the card (settled state not mocked, §7 Q24).

### 4.3 Question: "Shell output & question" (row 1, 440×960)

Purpose: `!` shell output and Claude's AskUserQuestion form.
1. Header (bottom border): "Link cleanup" (pinned), "Weekly review template" (active, waiting), "Reading list".
2. Shell bubble (mono): amber "!" + `git log --oneline -3`.
3. Shell card (`--surface`, `--line`, radius 12): head h38 (terminal tile, "Shell" 500, spacer, mono "0.3s", green check + "exit 0"); output `pre` (`--bg-2`, top/bottom border, padding `10 12`, mono 11.5/1.7 `--muted`, hashes `--amber`): `a41c9e2 Add Q3 retro notes` / `7d02b18 Rename Mtg notes to Meetings` / `e9f3a50 Weekly review template draft`; footer (padding `8 10`): small `btn-s` "+ Add output to chat" · spacer · "Claude hasn’t seen this" (11.5 `--faint`). Other statuses as today: "done", "exit N", "failed", "timed out"; stderr block with red rule; "No output."
4. Prompt "Turn that template draft into a real weekly review template."
5. Head: "Claude" + waiting + "1m 04s". Text "Two choices before I write it."
6. Question form (aria "Claude has questions"): `--surface`, 1 px `--accent-line`, radius 14, halo 4 px `--accent-soft`, padding 12, gap 14.
   - Head: 30×30 `--accent-soft` tile with circle-help · "Claude has questions" (600; singular "Claude has a question") · right "2 of 2 answered" (11.5 `--faint`, live count).
   - Q1 legend: chip "Location" (h20, radius 999, `--surface-2`, 11 px 500 `--muted`) + "Where should the template live?" (500). Radio cards: border 1 px `--line-2`, radius 10, padding `9 11`, gap 10; hover `--accent-line`; selected `--accent-line` + `--accent-soft`; native radio with `accent-color: --accent-fill`. "Templates/" (mono 500) / "Beside your other templates" (12 `--muted`), selected; "Journal/Templates/" / "Offered only for journal notes".
   - Divider.
   - Q2: chip "Sections" + "Which sections should it include?"; 2-column grid of checkbox cards (padding `8 10`): Wins ✓, Blockers ✓, Next week’s focus ✓, Energy check-in; hint "Select all that apply" (11.5 `--faint`) under the grid.
   - Free text: input h34, radius 10, 1 px `--line-2`, 13 px, placeholder "Other…" (visually hidden label "Other answer"); focus `--accent-line` + 3 px `--accent-soft`.
   - Buttons right: "Dismiss" (`btn-g`), "Submit answers" (`btn-p`; disabled until every question has an answer, as today).
7. Composer waiting, no chip row; inline ghost chip "+ Templates.md" (aria "Click to attach the active note") after the slash button; Stop; Send disabled look.
8. Status: "Opus 5.5" · "High" · **Auto** (red zap on `--red-soft`) · 21 % · **expiring** orange zap "0:48" · "5h 47% · wk 19%".

Outcome text after submit/dismiss as today ("Answered: a · b" / "Dismissed"; not mocked).

### 4.4 Empty: "New conversation · @-mention" (row 1, 440×960)

Purpose: a new conversation with the @-mention picker open.
1. Header (bottom border): "Link cleanup" (pinned), "Q4 planning review" (busy), "New conversation" (active).
2. Centered hero (main padding `0 28 250 28` to clear the popover): agent glyph tile 52×52; h1 "Ask about your vault" (20/600, margin `18 0 6`); p "Summarize, refactor, link or draft notes. Claude reads and edits files only with your permission." (13 `--muted`, max 300, centered).
3. Starters (new; max-width 340, margin-top 26, gap 6): label "From the open note"; buttons h42, radius 12, `--surface`, 1 px `--line` (hover `--line-2` + `--surface-2`), 13 px: tile 24×24 radius 7 + text + chevron-right: file-text "Summarize **Q4 planning.md**" (note name 500); link "Find notes that should link here"; pencil "Draft a follow-up from the selection". Click presumably fills/sends the prompt (§7 Q19).
4. @-mention listbox (aria "Files matching hir"), anchored above the composer card (left/right 12, bottom `calc(100% - 2px)`), `--surface`, `--line-2`, radius 12, `--shadow`, padding 6, gap 1: label "Files"; options h38, radius 8, 13 px, gap 10 (hover `--surface-2`; selected `--accent-soft`, icon `--accent`): icon (file/folder, `--muted`) + name with matched prefix in 600 + mono path (11 `--faint`, ellipsis) + kbd "↵" on the selected option. Items: **Hir**ing plan.md `Projects/` (selected); **Hir**ing pipeline.md `Areas/People/`; **Hir**ing retro 2025.md `Archive/2025/`; folder **Hir**ing/ `Areas/People/`. Footer (top border, 11 px `--faint`): kbd ↑ ↓ "navigate", kbd ↵ "attach", kbd esc "close".
5. Composer focused: chips "Q4 planning.md" (on) and "+ Planning/" (off; aria "Click to attach the active folder"); text "Compare the hiring section with @hir"; Send active; no Stop.
6. Status: "Opus 5.5" · "Medium" · "Ask" · no context segment · "5h 42% · wk 18%".

Keys: ↑/↓ move, Enter or Tab pick, Esc close (today's behaviour).

### 4.5 Commands: "/context, /usage & the slash menu" (row 1, 440×960)

Purpose: report cards in context and the grouped slash menu.
1. Header (bottom border): "Link cleanup" (pinned), "Q4 planning review" (active).
2. `/context` bubble and card: see §4.11 `/context`.
3. `/usage` bubble and compact usage card: header "Plan usage" + "no tokens" + right "as of 14:32"; meters "Current session (5h)" 42 % accent, "Resets 16:59 · in 2h 27m"; "Current week (Sonnet)" 81 % orange (value 500), "Resets Thu 08:00 · in 3d 17h". Card padding 14, radius 14 (`.card`). Full version: SlashUsage.
4. Slash menu (listbox aria "Commands matching co"), anchored like the @ menu: group head "Answered in the panel" + "no tokens" badge; options h36: mono name (500; selected name `--accent`) + description 12 `--muted` ellipsis: **/context** "What fills the context window" (selected), **/cost** "Tokens and cost for this conversation"; group "Claude Code" (top border): **/compact** + mono hint "[instructions]" (11 `--faint`) + "Summarize to free context".
5. Composer focused, no chips row, textarea mono "/co", slash button active state, Send.
6. Status: "Opus 5.5" · "High" · "Edits" · 34 % warm "4:12" · usage segment in warn: `--orange-soft` fill, "5h 42% · Sonnet 81%" (81 % orange 500).

Menu rules: opens when the text starts with `/` and the caret is in the name; panel commands first, then CLI commands and skills; fuzzy filter; Enter/Tab inserts `/name `; ↑/↓; Esc. New vs today: grouping, "no tokens" badge, hint chip, two sections.

### 4.6 Settings: "Settings · theme & prompt style" (row 1, 680×900)

Purpose: new settings rows. Page padding `28 36`. Rows (`item`): padding 16 0, top border, gap 20; name 14/500; description 12.5 `--muted`, max 420; sync badge (26×26 cloud icon button `--faint`; aria "Synced across devices. Click to store on this device only."; today's cloud/cloud-off device-local toggle).
1. h2 "Appearance" + "Settings → AI Agent Panel" (12.5 `--faint`).
   - **Theme**: "The panel and the workflow view follow Obsidian unless you pick one here." `role="radiogroup"` "Theme". Radio cards (190 px wide, padding 10, radius 12, 1 px `--line-2`; hover `--accent-line`; selected `--accent-line` + `--accent-soft`), each a 92 px preview (radius 8) above a radio + label (prompt-style cards stack the name, 500, over a 12 px `--faint` caption): **Match Obsidian** (default; split dark/light preview; suffix "now Dark"/"now Light" `--faint` 12 px showing the resolved theme), **Light**, **Dark**.
2. h2 "Transcript".
   - **Prompt style**: "How your own messages stand out in the transcript." `role="radiogroup"` "Prompt style". Cards: **Quiet** / "numbered, outlined" (preview: full-width bars outlined in amber 42 % with a faint square badge); **Bubble** / "right-aligned" (preview: right-aligned bubbles in `--user-bg`/`--user-line`); **Pop-out** / "numbered, tinted" (preview: full-width bars in `--user-bg`/`--user-line` with a faint square badge), selected by default.
   - **Pin the current prompt while scrolling** (toggle, on): "The prompt you are reading under stays at the top of the transcript, shortened to one line. Click it to jump back to where that turn starts."
   - **Prompt jump rail** (toggle, on): "A tick per prompt along the transcript’s right edge. Hover one to preview the prompt, click to jump to it. Shown with Quiet and Pop-out."
   Toggle: 38×22 track radius 999 (`--surface-3` off, `--accent-fill` on), 16 px white knob, .15 s; focus-visible 3 px `--accent-soft`.

**Conversation tabs** previews (board TabThumbB, page "Tab thumbnails"; D20): each card's preview is a miniature of the panel without text, every part in grey except where the conversations are listed, which takes the accent (`--accent-soft` fill, 1 px `--accent-line` ring, tab and row bars in `--accent`, the active tab or row on `--bg`). **Top**: tabs strip above a prompt, reply lines and the composer. **Side**: the same transcript with the column on the right, as the panel draws it (a `+` button, the active row with its working dot, rows below). **Automatic**: a narrow panel with the strip, an arrow labelled "wider", and a wide panel with the column. Captions and selection as today.

Other existing settings sections are unchanged and not mocked. In the plugin these rows use Obsidian `Setting` components; the preview cards are custom.

### 4.7 Responsive boards: Narrow, Short, Medium, Responsive (row 2)

Four identical copies of one component (they differ only in `<title>` and `$preview`); tweaks theme, accent, prompts (default Pop-out), sticky. Titles: Narrow "Compact · < 360 px" (300×900); Short "Default width · short height" (440×600); Medium "Roomy · 560–819 px" (680×900); Responsive "Wide · ≥ 820 px, conversation list" (1040×900). What changes per size: §3. Common content:
1. Header: tabs "Link cleanup" (pinned), "Q4 planning review" (active, busy), "Weekly review intro" (waiting), "Newsletter draft"; switcher "Q4 planning review" with count 4; title block "Q4 planning review" / "3 prompts · started 14:02"; header changes chip "+56 −16"; `+`; divider; history; settings; ⋯.
2. Sub-bar: "3 files +56 −16"; "Transcript".
3. Thread (`#p1`…`#p3`):
   - p1, 14:02, context "Q4 planning.md · 6 lines": the Main turn-1 content (steps "4 steps 12s", reply, footer "12.4s · $0.021").
   - p2, 14:09, context "Q4 planning.md": "Group the tasks by owner and flag anything without a due date." "Thought for 2s". Single step row: Edit `Q4 planning.md` +14 −11 ✓. Reply: "Grouped under **Next actions** by owner:"; **Maya** · 3 tasks: Copy review for [Website relaunch] · due Oct 14; Launch date sign-off · due Oct 21; Offer bands for [Hiring plan] · "no due date" (`.flag`: orange 500, not italic); **Daniel** · 2 tasks: Interview loop for [Hiring plan] · due Oct 17; First draft of [Budget 2027] · due Nov 1; **Unassigned** · 1 task: Find an owner for vendor renewals · "no due date" (same flag); "Both undated tasks are tagged `#needs-date`, so they show up in your weekly review query." (inline code: mono .86em, `--surface-2`, padding `1 5`, radius 5). Footer "8.9s · $0.014".
   - p3, 14:16: "Draft a short update I can paste into Slack." Live head: ringing mark, "Claude", "Writing", "9s". Streaming card (`--surface`, `--line`, radius 12, padding `12 14`, 13.5/1.6): "**Q4 planning: where things stand**" / "The open questions from the planning doc are now tracked tasks, grouped by owner. Maya has three (website copy, launch date, offer bands) and Daniel has two (interview loop, 2027 budget). Two still need dates" + blinking caret.
4. Rail ticks at 3 %, 40 %, 86 %: "1 · Turn the open questions into tasks…", "2 · Group the tasks by owner…", "3 · Draft a short update for Slack" (current).
5. Composer working: chips "Q4 planning.md" (on), "+ links & properties" (off); inline chip (short height only).
6. Status: "Opus 5.5" · "High"/"High effort" · "Edits"/"Accept edits" · 34 % working cache · "5h 42% [resets 16:59] · wk 18%".
7. Side column (≥ 820): §3.

Interactive: frames can be resized on the canvas to see the rules; scroll shows sticky prompts.

**Prompt-styles row.** PromptStyleQuiet, PromptStyleBubble and PromptStylePopout (440×900, interactive) each mount Short at 440×900 with `prompts` quiet, bubble or pop-out (sticky on): the Settings › Prompt style choices side by side.

### 4.8 Mobile boards (dropped)

**MobileHome** "Mobile · panel opened" and **MobileRead** "Mobile · reading a conversation" (390×844, not on the canvas; recorded from the s1 transcript). Dropped when the user chose "keep the plugin desktop-only." Recorded for completeness only:
- MobileHome: drawer (352 px) over a scrimmed note; header "AI Agent Panel" + pill "Desktop only" + close; card with laptop icon, "Chat runs on your computer", "The panel drives the Claude Code CLI installed on your desktop. Obsidian on phones and tablets can’t start programs, so new messages need Obsidian on your computer." and "Your conversations sync with the vault, so you can read them here."; "Conversations" list (56 px rows: "Link cleanup" Pinned · 12 prompts; "Q4 planning review" Today 14:16 · 3 prompts; "Weekly review intro" Today 13:40 · waiting for an answer; "Vault tag audit" Today 11:02 · 5 prompts; "Meeting notes to tasks" Yesterday · 4 prompts); footer button "Open exported transcripts" + "Agent Chats/ · plain notes, readable anywhere".
- MobileRead: back, "Q4 planning review" / "Read-only · 3 prompts · Opus 5.5", ⋯ "More: export, copy"; pop-out prompts 2 and 3, "1 step · edited Q4 planning.md +14 −11", reply; footer "Reply from your computer" / "Open this conversation in Obsidian on your desktop; it continues from here." + "Export to a note".

### 4.9 Slash-command cards: shared rules (row 3)

Boards are 440 px wide, padding `20 16`, gap 12, cards stacked with their mono command bubble above. Behaviour kept from today's code (`src/commands.ts`, `src/report-view.ts`, `src/usage.ts`, `runPanelCommand` in `src/view.ts`): a panel command must be the whole message (`/^\/([\w:-]+)(?:\s+([\s\S]*))?$/`, case-insensitive); only `/mcp` takes arguments; no context block or attachments are sent; a bubble plus card are recorded unless a turn is running (then drawn, not recorded); restored transcripts show the recorded Markdown without buttons; tables over 14 rows fold to 12 with "Show all N"; row actions use a 60 s control request, refresh the card, and report failures as a Notice "`<Label>` failed: …". `/help` and `/cost` never spawn the CLI; the usage commands need an already-running CLI; every other command spawns one if needed (a spawn costs no tokens). Header actions per card (as mocked): Refresh + Copy on `/usage`, `/usage-credits`, `/mcp`, `/status`; Copy only on `/cost`, `/memory`, `/permissions`, `/hooks`, `/skills`, `/help`; Refresh only on `/chrome`, `/sandbox` (§7 Q10). Refresh re-runs the command into the same card; "Copy as Markdown" copies `reportMarkdown`.

Loading (SlashHelp): the card shows its title; the icon tile keeps its fill and its icon becomes a spinning loader (`spin 1s linear`); "Asking Claude Code…" (12 `--faint`) after the title, `aria-busy="true"`, and three skeleton bars (h10, radius 5, shimmer; widths 62 %, 88 %, 74 %, gap 10). Neither the loading nor the error card carries the "no tokens" badge or header actions. Replaces today's "Loading…" text; `/usage` cards keep "Checking usage…" as the loading label (recommended).

Error (SlashHelp): `role="alert"`, border `--red-line`; icon tile `--red-soft`/`--red` triangle-alert; title = the command's card title ("Status") + "Couldn’t load" (12 `--red`); body (12.5 `--muted`): "Claude Code could not answer: `Control request timed out: get_status`. Updating it may help." (the inner error in mono `--text`); buttons "Try again" (`btn-p`, rotate-cw) and "Copy error" (`btn-s`). Other error strings from today's code fill the same slot: "Claude Code did not start - see the error above.", "Claude Code's reply had no {what}. It may need updating.", `/mcp` usage errors.

### 4.10 SlashUsage: "/usage · /usage-credits · /cost" (row 3, 440×1360)

**/usage**, title "Plan usage", icon gauge, Refresh + Copy. Lead "As of 14:32". Body: one meter per limit (gap 6): row "label · spacer · mono %"; 6 px bar (`--surface-3` track, radius 3; fill `--accent`, `--orange` at warn, `--red` at critical); sub 11.5 `--faint` "Resets 16:59 · in 2h 27m".
- "Current session (5h)" 42 %; "Current week (all models)" 18 %, "Resets Thu 08:00 · in 3d 17h"; "Current week (Sonnet)" **81 %** (orange 600, orange bar); one row per `rate_limits.model_scoped` entry ("Current week ({name})").
- "Extra usage" "$12.40 of $50.00", bar 25 %, sub "25% of the monthly cap" (only when extra usage is enabled).
- Footer: link "Usage & credit settings ↗" (https://claude.ai/settings/usage) · spacer · "Warns at 75%, critical at 90%" (from the usage warn/critical settings).
- Data: `get_usage` from a live CLI (never spawns; 10 s floor). Empty and error copy from today: "No usage limits reported for this account."; "Couldn't fetch usage: …" with reasons "Plan usage comes from a running session - send a message first.", "This CLI version does not report plan usage.", "No plan limits on this login - API-key and Bedrock/Vertex sessions have none."; stale "⚠ Refresh failed (…) - showing data fetched at HH:MM." (render as an orange note above the footer; not mocked).

**/usage-credits** (also `/extra-usage`, same card), title "Usage credits", credit-card, Refresh + Copy. Lead "As of 14:32 · also answers /extra-usage". Key/value (132 px keys): "Status" green dot + "Enabled" (or "Disabled" + reason); "Monthly limit" mono "$50.00" (or "unlimited" / "-"); "Used this period" mono "$12.40" + "· 25% of the cap" (`--faint`) over a 6 px accent bar. Footer: "Manage extra usage at" + link "claude.ai/settings/usage ↗". No-data copy: "Extra-usage credits aren't reported for this account (API-key setups and some plans don't have them)."

**/cost**, title "Cost", receipt, Copy only. Section "This conversation, since opened": big mono "$0.0412" (24 px 600) + "across 3 turns" (12.5 `--muted`); 2×2 tiles (padding `10 12`, radius 10, `--bg-2`, `--line`; value mono 15/600, label 11.5 `--faint`): "18.2k" Input tokens, "4.1k" Output tokens, "22.6k" Cache written, "141k" Cache read. Section "Claude Code, since it last started" (only if the CLI's text parses): key/value "Total cost" `$0.0412`, "API duration" `1m 12s`, "Wall duration" `9m 40s`, "Code changes" green "+56" red "−16" "lines". Footer (info icon): "Costs are API prices. On a Claude subscription they come out of your plan’s limits instead; `/usage` shows those." Data: the tab's own usage totals; `get_session_cost` only when a CLI is already running.

### 4.11 Commands board: /context card

Title "Context usage", "no tokens", right "Opus 5.5" (11.5 `--faint`). No header icon or actions in this board's variant (§7 Q10).
- Figure row: "68.4k" (24/600) + "of 200k tokens" (12.5 `--muted`) + right mono "34%".
- Meter (role img, aria "Context window: 34% used, 16.5% reserved for autocompact"): h10, 2 px gaps, segments sized by share: System prompt 1.6 % c0 (left radius 3), System tools 6.9 % c1, MCP tools 5.6 % c2, Memory files 3 % c3, Messages 17.2 % c4, free space flex `--surface-3`, autocompact buffer 16.5 % hatched (`repeating-linear-gradient(135deg, --surface-3 0 3px, transparent 3px 6px)` + inset `--line-2`, right radius 3).
- Legend, 2-column grid (column gap 18, row gap 6), 12 px `--muted`, swatch 8×8 radius 2, value mono 11.5 `--text` right: System prompt 3.1k; System tools 13.8k; MCP tools 11.2k; Memory files 6.0k; Messages 34.3k; Free space 98.6k; Autocompact buffer 33.0k.
- Cache line: green zap · "Prompt cache warm" (`--text`) · "· 61.2k tokens" · spacer · mono "4:12" · "left".
- Footer row (top border, padding-top 10): "Auto-compacts at 167k tokens." · button `btn-s` "`/compact` now" (sends `/compact` to the CLI; costs tokens).
- Data: `get_context_usage` as today (categories, deferred handling, kinds free/buffer). Today's extra sections "Memory files", "MCP tools", "Custom agents", "Listed to Claude" are not in the mock (§7 Q9). Auto-compact off copy: "Auto-compact is off; /compact frees space by summarizing."

### 4.12 SlashMcp: "/mcp · /status" (row 3, 440×1360)

**/mcp**, title "MCP servers", plug, Refresh + Copy. Lead "6 servers: 3 connected, 1 needs sign-in, 1 failed, 1 disabled". Rows (padding 9 0, gap 8), problems first (today's status-rank sort, then name). Each row: column [name 500 + status pill; meta 11.5 `--faint` "transport · source[ · N tools]"; optional error mono 11 `--red` ellipsis] + actions:

| Server | Pill | Meta | Error | Actions |
|---|---|---|---|---|
| postgres | err "failed" | stdio · Project settings | `spawn uvx ENOENT` | button "Reconnect" (rotate-cw) + power icon "Disable postgres" |
| linear | warn "needs sign-in" | http · User settings | | "Reconnect" + power "Disable" |
| github | ok "connected" | stdio · User settings · 26 tools | | icon rotate-cw "Reconnect github" + power "Disable github" |
| context7 | ok "connected" | http · claude.ai · 2 tools | | icon reconnect + icon disable |
| obsidian | ok "connected" + acc "this panel" | sdk · 7 tools · on/off in Settings → AI Agent Panel | | none (the panel's own server) |
| figma | off "disabled" (name `--muted`) | http · User settings | | button "Enable" (power) |

Labelled buttons: h26, padding 0 9, radius 7, 11.5 px 500, inset `--line-2`. Icon actions: 26×26, titles "Reconnect"/"Disable". Pending status label "connecting" (warn). Footer (terminal icon): "Servers that need sign-in authenticate in a terminal: run `claude` there and use `/mcp`." (only when some server needs sign-in). Empty: "No MCP servers configured." Args form `/mcp reconnect|enable|disable <server>|all` as today, errors "Usage: /mcp [reconnect|enable|disable <server>|all]", `No MCP server named "X".`, `"X" is the panel's own server; turn it on or off in Settings → AI Agent Panel.`

**/status**, title "Status", activity, Refresh + Copy. Key/value sections (128 px keys):
- "Panel": Plugin "AI Agent Panel 0.5.0"; Profile "Default"; CLI mono `~/.local/bin/claude` (+ " (in WSL)"); Permission mode "Accept edits"; Effort "High" (only if chosen).
- CLI sections as returned by `get_status` (mock labels): "Session": Version mono `2.4.1`, Session ID mono `8f3c2a1e-77b0-4c1d-9e52-a91e`, Model "Opus 5.5", Working directory mono `~/Vaults/Second Brain`; "Account": Login method "Claude account", Plan "[YOUR PLAN]"; "Environment": MCP servers "3 connected, 1 failed" + accent link "· open /mcp" (runs `/mcp`), Memory "2 files", Setting sources "User, Project".
- Today's rules stay: skip "Peer address" and "Session kind"; strip a trailing " · /mcp" from values (the link replaces it).

### 4.13 SlashConfig: "/memory · /permissions · /hooks" (row 3, 440×1360)

**/memory**, title "Memory", book-open, Copy. Section "Instruction files", rows: [label; path mono 11.5 `--faint` (11 on the linked Project path)] + pill: "User instructions" `~/.claude/CLAUDE.md` ok "exists"; "Project instructions" `CLAUDE.md` as an accent underlined link (opens the note when it is in the vault) ok "exists"; "Local instructions" (`--muted`) `CLAUDE.local.md` off "not created". Section "Auto memory" + ok pill "on" (status from `auto_memory.status`): rows mono name (11.5, fixed 150 px; the mock sets title = name on the first row only, set it on all) + description `--muted`: weekly-review-format "Reviews use Wins, Blockers, Next week"; linking-style "Prefer wiki-links over Markdown links"; meeting-notes "Meetings/ as YYYY-MM-DD Title". Empty: "Nothing saved yet in {path}" / "Nothing saved yet." Footer (info): "Edit these files directly; Claude Code reads them when a session starts."

**/permissions**, title "Permission rules", shield, Copy. Sections with a 7 px colored dot + label + count: "Allow 3" (green): `Bash(git status)` Project settings; `Read(Templates/**)` User settings; `mcp__obsidian__search` This session. "Ask 1" (orange): `Bash(git push:*)` User settings. "Deny 1" (red): `Read(./.env)` Managed policy. "Additional directories": `~/Documents/Attachments`. Rows: mono rule (ellipsis, grow) + source 11.5 `--faint`. Source labels as today: User settings, Project settings, Local project settings, Managed policy, --settings, Command line, Command, This session. Empty section "None." Notes: "Only managed-policy rules apply on this machine." (when managed-only); footer (info) always: "Approving a prompt with “Always allow” adds an allow rule."

**/hooks**, title "Hooks", webhook, Copy. Rows (column, gap 3): line 1 = event pill (accent, mono: "PreToolUse", "PostToolUse", "Stop") + mono matcher (`Bash`, `Edit|Write`, `*`) + spacer + source ("User settings", "Project settings"); line 2 = mono command (11.5 `--muted`, ellipsis): `~/.claude/hooks/guard-rm.sh`, `npx prettier --write "$FILE"`, `notify-send "Claude is done"`. Empty "No hooks configured." Footer (info): "Hooks live in your Claude Code settings files; edit them there."

### 4.14 SlashTools: "/skills · /chrome · /sandbox" (row 3, 440×1360)

**/skills**, title "Skills", sparkles, Copy. Lead "7 skills; 5 listed to Claude, ~1.7k tokens of descriptions". Bar (role img, aria "Description tokens per listed skill"): h6, 2 px gaps, one accent segment per listed skill sized by tokens, opacity stepping 1, .8, .65, .5, .38. Rows: status dot (ok green / off ring) + mono name (grow) + source ("Project", "Plugin", "User") + mono tokens right-aligned 44 px ("~420") + state pill: obsidian-plugin Project ~420 "on"; pdf Plugin ~350 "on"; git-conventions User ~310 "on"; docx Plugin ~290 "on"; codex User ~280 "on"; usage-check (`--muted`) User, empty token cell, off pill "when you invoke it"; slack-gif-creator (`--muted`) Plugin, empty token cell, off pill "off". Empty "No skills installed."

**/chrome**, title "Claude in Chrome", globe, Refresh. Key/value (150 px keys) with leading dots: "Extension installed" ok "yes"; "Extension connected" warn "no"; "On in this session" off-ring "no"; "Claude Code default" "off"; "Profile setting" "Claude Code default". Buttons (wrap, gap 6): `btn-p` "Reconnect the extension ↗" (shown when installed but not connected; "Install the extension ↗" when not installed), `btn-s` "Site permissions ↗". Conditional notes as today: "Claude Code does not support Claude in Chrome inside WSL."; "Needs a claude.ai login (Pro, Max, Team or Enterprise)."; "Not available for this account or organization." Footer (settings icon): "Turn it on or off per CLI profile in [Settings → AI Agent Panel]." (link opens plugin settings).

**/sandbox**, title "Sandbox", package, Refresh. Warning box (padding `8 10`, radius 9, `--orange-soft`, 12 px, orange triangle-alert): "Missing: `socat`. Network filtering is off until it is installed." (one box per `dependencies.errors[]`; warnings verbatim; the explanatory second sentence is mock copy, §6). Key/value: "Supported here" ok "yes"; "On in this session" ok "yes" + "(auto-allow)" `--faint`; "Claude Code settings" "on"; "Profile setting" "Claude Code default" (or "not offered on native Windows"). Section "Restrictions" (mono 11.5 values, ellipsis): "Writable paths" `., /tmp`; "Allowed domains" `github.com, registry.npmjs.org`; "Write-protected paths" `.obsidian/`. Other labels as today: Readable paths, Read-protected paths, Blocked domains, Unix sockets. Profile note "Turn it on or off per CLI profile in Settings → AI Agent Panel." when offered (not mocked).

### 4.15 SlashHelp: "/help · /clear · loading & errors" (row 3, 440×1360)

**/help**, title "Commands", square-slash, Copy (no "no tokens" in the header). Section header "Answered by the panel" + "no tokens" badge. Group sub-labels (11.5 `--faint`): rows are buttons, grid `112px 1fr`, padding `4 6`, radius 7, hover `--surface-2`; name mono 12 `--accent`; description 12.5 `--muted` ellipsis; hints mono 11 `--faint`.
- "Usage & cost": /usage "Show plan usage limits"; /usage-credits "Show extra-usage credit status · also /extra-usage"; /cost "This conversation’s token use and cost"; /context "What is using the context window".
- "Setup": /status "Version, account, model and MCP status"; /mcp "[reconnect|enable|disable <server>|all] MCP servers"; /memory "Instruction and memory files Claude Code loads"; /permissions "Allow, ask and deny rules in effect"; /hooks "Hooks Claude Code runs"; /skills "Skills and their context cost"; /chrome "Claude in Chrome status"; /sandbox "Bash sandbox status".
- "Conversation": /clear "Clear Claude’s context; messages above stay, dimmed"; /help "This list".
- Section "Claude Code commands & skills" (top border, names in `--text`): /compact "[instructions] Free up context by summarizing"; /init "Create a CLAUDE.md with documentation"; /security-review "Security review of pending changes"; button `btn-s` h26 "Show all 23 ˅" (expands the full CLI list).
- Footer (info): "Anything else starting with `/` goes to Claude Code. `!` runs a shell command." (second sentence only when the shell escape is enabled). Before a session: today's note "Claude Code's own commands are listed once a conversation has started."
- Row click: not specified (§7 Q11).

**/clear** (as shown on this board, s1): mono bubble "/clear" then the orange divider "Context cleared" (eraser) with sub-line "14:02 · Claude can’t see anything above". Superseded by ClearStates (§4.19), which adds Undo; ContextEvents adds "/clear ·" to the sub-line.

**Loading** "/mcp" and **error** "/status": §4.9.

### 4.16 Agents: "Agents running · stop any of them" (row 4, 440×960)

Purpose: agent run status in the conversation, per-agent stop, stop all, entry to the workflow view.
1. Header: "Link cleanup" (pinned); active "Vault audit" (busy dot + agent badge "2", title "2 agents running"); "Newsletter draft". Main has a top border instead of a sub-bar.
2. Prompt "Check every project note for broken links and stale due dates. Fix what you can."
3. Head: "Claude" · "Working" · "2m 14s".
4. **One-off agent row** (e.g. Explore): card button h40, padding 0 10, gap 9: bot tile 22 · name "Map project notes" (12.5/500, max 44 %, ellipsis) · meta "Explore · Haiku 4.5 · 9 tools · 14k" (11.5 `--faint`, grows) · mono "22s" · green check · chevron-right. Click: §7 Q15. Running variant not mocked; recommended: spinner instead of the check, plus a stop button.
5. **Workflow card** (`card`, aria "Workflow: Link and due-date audit, running"):
   - Head (padding `10 6 8 12`, gap 9): workflow tile 26 (`--accent-soft`) · title "Link & due-date audit" (600) over "Workflow · 7 agents · 2 at a time" (11.5 `--faint`) · maximize icon "Open the workflow view".
   - Phase strip (role img, aria "Scan done, Verify 1 of 4 done, Fix waiting"): grid with columns proportional to each phase's agent count (`2fr 4fr 1fr`), gap 6, padding `2 12 10`; each phase: label (11 px `--faint`; name 500 `--muted`, current phase name `--accent`) "**Scan** 2/2", "**Verify** 1/4 · 1 failed", "**Fix**"; 4 px bar (`--surface-3`): done green 100 %; current = red share for failed + 2 px gap + accent→accent-soft gradient for running; future empty.
   - Agent rows (grid `18px 1fr auto`, gap 9, min-h 36, padding `6 6 6 12`, top border, hover `--surface-2`):
     - Done: green check (aria "Done") · "Scan Projects/" (12.5/500) + " · 31 notes" (11.5 `--faint`) · mono "41s". Same for "Scan Areas/" · 22 notes · 33s.
     - Running: background `linear-gradient(90deg, --accent-soft, transparent 60%)`; spinner (aria "Running") · name "Verify Website relaunch" over mono activity "Read Meetings/2026-10-02 Planning sync.md" (11.5 `--faint`) · mono "1m 33s" + stop (24×24, radius 7, `--faint`, hover `--red-soft`/`--red`, aria/title "Stop this agent"). Second: "Verify Hiring plan" / `Grep "due::" in Projects/Hiring/` / 1m 29s.
     - Failed: red circle-x (aria "Failed") · "Verify Budget 2027" over "Failed · Budget 2027.md not found" (`--red`) · "4s".
     - Queued: dashed circle (aria "Queued") · "Verify Newsletter plan" (400 `--muted`) · "queued".
     - Waiting on a phase: dashed circle (aria "Waiting") · "Fix links & dates" · "after Verify".
   - Footer (padding `8 8 8 12`, top border, `--bg-2`): mono "86k tokens · $0.31" (11 `--faint`) · `btn-d` "Stop workflow" · `btn-s` maximize "Workflow view".
6. **Run bar** (above the composer; `role="status"`, aria "2 agents running, 2 waiting"): h38, radius 12, `--surface`, 1 px `--line-2`, padding `0 4 0 12`, gap 8, 12.5 px: spinner (`--accent`) · "2 agents running" (500) · "· 2 waiting · Link & due-date audit" (`--faint`, ellipsis) · mono "2m 14s" · maximize "Open the workflow view" · `btn-d` h28 on `--red-soft` with stop icon "Stop all" (aria "Stop all agents") · 2 px sweeping accent line along the bottom (slide). Shown only while agents or background tasks run; replaces today's background-tasks strip. Click on the bar body opens the Running agents popover (§4.23).
7. Composer working, no chips; Stop is "Stop Claude’s turn" (aria and title); Send "Queue message".
8. Status: "Opus 5.5" · "High" · "Edits" · 26 % working cache · "5h 47% · wk 19%".

Data (s1): the plugin already receives each subagent's data and can stop one; workflow phases are unconfirmed (§5 D3) and fall back to a flat list.

### 4.17 WorkflowView: "Workflow view · popup, resizable" (row 4, 1200×800, interactive)

Purpose: the whole workflow in a large, resizable popup; can also open as a full Obsidian tab. Fills its container (`width:100%; height:100vh`, container `wf`).
1. Header (padding `14 12 14 20`, gap 12, bottom border): workflow tile 34×34 radius 9 · title "Link & due-date audit" (16/600, `-.01em`) + pill "Running" (h22, radius 999, `--accent-soft`/`--accent`, pulsing dot) · subtitle (12 `--faint`) "Workflow from [Vault audit] · started 14:31 · 2 agents at a time" ("Vault audit" is an underlined link to the conversation) · stats (each: uppercase label + mono 13 value, left border, padding 0 14): "Elapsed 2m 14s", "Agents 3 / 7", "Tokens 86.2k", "Cost $0.31" · `btn-d` h30 with `--red-line` ring "Stop workflow" · app-window "Open in a tab" · x (aria "Close", title "Close (Esc)").
2. Phase bar (nav "Phases"; padding `12 20`, gap 8, `--bg-2`, bottom border): phase chips (flex 1, padding `8 12`, radius 10, `--surface`, `--line`) joined by 20×1 `--line-2` connectors. Phase number circle 22 px: done = green check on `--green-soft`; current = white number on `--accent-fill`; future = outlined number `--faint`. Text: name (500) + detail (11.5 `--faint`): "Scan" "2 of 2 done · 41s"; current "Verify" (chip border `--accent-line` + 3 px `--accent-soft` halo) "2 running · 1 failed · 1 queued" + 4 px bar (red 25 %, accent gradient 50 %); "Fix" (dashed border, transparent, name `--muted`) "starts after Verify".
3. Body: grid `1fr 360px`.
   - **Lanes** (one `section` per phase with `aria-label` = the phase name; 3 columns min 200, gap 16, padding `16 20`, scroll). Lane header: uppercase label (current in `--accent`) + mono count ("2/2", "1/4", "0/1") + right "2 at a time" on the current lane. Agent card (padding `10 8 9 12`, radius 10, `--surface`, `--line`, hover `--line-2`, gap 5): row 1 status icon + name (12.5/500) + model tag (h18, radius 5, `--surface-2`, 10.5 `--muted`); activity (11.5 `--faint`, mono for tool lines); meta mono 11 "41s · 18.2k tok · 14 tools" (+ stop 22×22 on running cards). Variants: running = 2 px sweep at the bottom; selected = `--accent-line` + 3 px `--accent-soft`, `aria-current`; error = `--red-line`, activity red; queued/waiting = dashed `--line-2`, transparent, name `--muted`, activity "Queued · next free slot" / "Waits for Verify · gets its findings". Content: Scan: "Scan Projects/" Haiku 4.5 "31 notes · 112 links · 47 due dates" "41s · 18.2k tok · 14 tools"; "Scan Areas/" Haiku 4.5 "22 notes · 64 links · 19 due dates" "33s · 12.1k tok · 9 tools". Verify: "Website relaunch" Sonnet 5.5 (selected, running) `Read Meetings/2026-10-02 Planning sync.md` "1m 33s · 9.4k tok · 6 tools"; "Hiring plan" Sonnet 5.5 running `Grep "due::" in Projects/Hiring/` "1m 29s · 7.9k tok · 5 tools"; "Budget 2027" Sonnet 5.5 failed "Budget 2027.md not found" "4s · 1.2k tok · 1 tool"; "Newsletter plan" queued. Fix: "Fix links & dates" Opus 5.5 waiting.
   - **Timeline** (`section` aria "Timeline"; below the lanes, top border, padding `12 20 14`): rows `170px 1fr`, h20, 11.5 `--muted`. Axis row: "Timeline" label + ticks "0s", "30s", "1m", "1m 30s", "2m" and an accent "now" marker (1 px `--accent-line` vertical line through all rows). Bars h8 radius 4: done green .75 opacity; running `--accent-fill` (.8), selected agent gradient `--accent-fill`→`--accent` + 2 px `--accent-soft` ring; failed short red; queued hatched placeholder starting at "now"; waiting empty.
   - **Detail pane** (`<aside aria-label="Selected agent">`, 360 px, `--bg-2`, left border): head (padding `14 12 12 16`, bottom border): spinner + "Website relaunch" (14/600) + `btn-d` on `--red-soft` h26 "Stop agent"; model tag "Sonnet 5.5" + mono "1m 33s · 9.4k tokens · 6 tools"; segmented tabs (`role="tablist"`, `role="tab"` + `aria-selected`) "Activity" (selected), "Prompt", "Output". Activity: step list (rail line, 22 px tiles): Read `Projects/Website relaunch.md`; Search `[[Website relaunch` "14 notes"; Read `Areas/Marketing/Launch checklist.md`; Grep `due:: in Projects/` "6 matches"; Resolve `11 links` "3 broken" (red); Read `Meetings/2026-10-02 Planning sync.md` (active, pulsing dots). "Latest" card (`--surface`, radius 10, 12.5/1.55): "3 of 11 links are broken: [[Launch FAQ]] was renamed to [[Launch FAQ 2026]], and two point at deleted notes. Checking the planning sync for the new launch date" + caret (links in `--accent`). Footer (top border): `btn-g` file-text "Full transcript" · spacer · "3 of 7" · chevron-left "Previous agent" · chevron-right "Next agent".
4. Resize behaviour: §3 workflow breakpoints.

Interactions (the board mocks only the agent-card buttons; the rest is recommended): click an agent card or timeline row → select it in the detail pane; stop buttons per agent, per workflow; Esc / × closes; "Open in a tab" moves the view into a workspace leaf; the view follows the panel theme setting (Settings copy). Fallback without phase data: one lane, no phase bar (s1).

### 4.18 ContextEvents: "Context cleared & compacted" (row 4, 440×960)

Purpose: in-transcript markers for clear and compaction.
1. Header (bottom border; simplified: tabs "Link cleanup", "Q4 planning review" active busy; `+`; history).
2. Pill button "^ 6 earlier messages" (h26, radius 999, inset `--line-2`, 11.5 `--faint`, centered): earlier messages before a clear collapsed behind a reveal (§7 Q16).
3. Dimmed pre-clear block (`opacity .42`, hover `.75`; aria "Before the clear. Claude no longer sees these messages."): prompt "Draft the October newsletter intro." + reply "Here’s a warm three-sentence opener that leads with the relaunch date…".
4. **Cleared divider** (orange): eraser "Context cleared"; sub "`/clear` · 14:02 · Claude can’t see anything above".
5. Prompt "Review the Q4 planning note and list the open questions." + reply "Six questions are still open. Four belong to a project: [Website relaunch] and [Hiring plan] have two each."
6. Mono bubble "/compact keep owners and due dates".
7. **Compacted divider** (accent): fold-vertical "Compacted"; sub "14:20 · `131k → 18k` tokens" + toggle "Summary ˄" (h20, radius 5, 11.5 `--muted`, hover `--surface-2`; `aria-expanded`). Expanded summary card (`--surface`, `--line`, radius 12, padding `10 12`, 12.5 `--muted`): label "What Claude kept" + list: "Six open questions in **Q4 planning.md**, four tied to projects"; "Owners: Maya (copy, launch date), Daniel (interview loop, budget)"; "Due dates come from **Meetings/**; vendor renewals has no owner" (bold = `--text`).
8. Prompt "Now group the tasks by owner and add the due dates."
9. **Compacting now** (accent, `role="status"`, aria "Compacting automatically"): animated waves (right one reversed), spinner, "Compacting automatically…"; sub "Context 95% full · Claude picks up where it left off".
10. Composer working; status line: model, effort, (no permission segment on this board), context segment in compacting state (orange-soft fill, orange ring and "95%", zap-off), "5h 51% · wk 20%".

Rules (s1): messages before a clear stay on screen, dimmed; after compaction the cache shows as expired because Claude rebuilds it. The compaction summary text comes from the CLI's compaction output (§6).

### 4.19 ClearStates: "/clear · stays in the conversation" (row 4, 440×1040)

Purpose: the s2 `/clear` decision in three states. Each section has a caption row: uppercase label + right note (11 `--faint`).
1. **"Right after /clear"**, note "same tab · same title · new Claude session".
   - Dimmed block in hover state (`.75`): prompt "Draft the October newsletter intro."; reply "Here’s a warm three-sentence opener that leads with the relaunch date…"; its footer (indented 24): "Restore files" (still works), "Branch" (hovered), copy. Tooltip on Branch: "Continue from before the clear, in a new tab".
   - Mono bubble "/clear".
   - Orange divider "Context cleared"; sub "14:02 · Claude can’t see anything above" + **Undo** button (undo-2, h20, radius 5, `--text`, inset `--line-2`). Undo is available until the next message and resumes the previous session.
2. **"Sent while Claude works"**, note "queued like any message".
   - Working line: spinner mark + "Grouping tasks by owner…" (12.5 `--muted`) + mono "0:42".
   - Queued bubble "/clear" at .6 opacity with a dashed border; under it right-aligned (11.5 `--faint`): dashed circle + "Queued · clears when this turn ends" + "Cancel" link button.
3. **"Agents still running"**, note "asks before stopping them".
   - Confirmation popover (`role="alertdialog"`) above the composer: orange triangle-alert + title "2 agents are still running"; body (padding `6 12 12 34`, `--muted`): "Clearing stops them and the Link & due-date audit workflow (name in `--text`). What they reported so far stays above, dimmed."; footer (padding 8, `--bg-2`): spacer · `btn-g` "Cancel" · `btn-d` (pre-filled `--red-soft`) with stop icon "Stop and clear".
   - Composer with mono text "/clear" (1 row) and Send.

Full decision table: §5 D1.

### 4.20 ContextCache: "Context & cache · click" (row 5, 440×960)

Purpose: the context-and-cache segment's states and its click popover.
1. Gallery (padding 18 16, `--bg-2`, bottom border; label "Context & cache segment"; grid `128px 1fr`, gap 10/12, 12 px `--muted`): the six segment states with captions, exactly as in the §2.7 status-line table (Working, Warm "4:12", Expiring "0:48", Cold, 1-hour "52m", Nearly full "86%" orange with "3:05").
2. Transcript sample: prompt "Draft a short update I can paste into Slack." + reply "**Q4 planning, quick update:** five open questions are now tasks with owners and dates. Maya has copy review and launch sign-off; Daniel has the interview loop and the 2027 budget draft." (shared by all Pop boards).
3. **Popover** (`role="dialog"`, aria "Context and prompt cache"; width 336; right 12; bottom 44):
   - Header: "Context" · spacer · "Opus 5.5 · 200k window" (11.5 `--faint`).
   - Body: "68.4k" (22/600) "of 200k tokens" (`--muted`) · right mono "34%"; meter h8 (role img, aria "Context window: 34% used, 16.5% reserved for autocompact"): System 8.5 %, MCP 5.6 %, Memory 3 %, Messages 17.2 %, free, hatched buffer 16.5 %; inline legend (11.5 `--muted`, 8 px swatches): "System 17k", "MCP 11k", "Memory 6k", "Messages 34k"; key/value "Autocompacts at" — mono "167k · 98k to go".
   - Cache section (top border, gap 8): green zap · "Prompt cache" (600) · pill "Warm" (green on green-soft; also Expiring/Cold variants implied) · right mono "4:12" (15/500); 4 px bar green 84 % (aria "4 minutes 12 seconds of 5 minutes left"); key/values "Cached" — "61.2k tokens"; "Expires" — mono "14:26:40" + "· 5-min TTL"; note (11.5 `--faint`): "Each request restarts the timer. Reply before it runs out and Claude rereads the conversation from cache: faster, and a tenth of the input price."
   - Footer: `btn-g` "`/context` details" (runs `/context`) · spacer · `btn-s` fold icon "Compact" (sends `/compact`).
4. Composer idle ("Reply, or @ to mention a note…", paperclip, Send); status line with the context segment `.on`.

Cache model (s1): lifetime 5 min or 1 h, taken from the cache usage the CLI reports; counted from the last request; each request restarts it; after compaction the cache is expired. Countdown format: `m:ss`; with more than 10 minutes left, whole minutes ("52m").

### 4.21 PopUsage: "Plan usage · click" (row 5, 440×600)

Popover (`role="dialog"`, aria "Plan usage"; width 318; right 12; bottom 44):
- Header: "Plan usage" · spacer · "as of 14:32" · 26×26 refresh-ccw "Refresh".
- Body (gap 12): rows = label (`--text`) + qualifier (`--faint`) + right mono % (13 px) / 6 px bar / sub 11.5 `--faint`: "Session · 5 hours · 42%" "Resets 16:59 · in 2h 27m"; "Week · all models · 18%" "Resets Thu 08:00 · in 3d 17h"; "Week · Sonnet · 81%" (orange 500, orange bar) same reset. Key/value (top border): "Extra usage" — mono "$0 of $50" + "· off".
- Footer: `btn-g` "`/usage` in chat" (posts the /usage card) · spacer · `btn-g` "Usage settings ↗" (arrow-up-right; https://claude.ai/settings/usage).
- Trigger: usage segment `.on`. Replaces today's "Claude plan usage" modal (recommended).

### 4.22 PopModel: "Model & effort · click" (row 5, 440×600)

Popover (`role="dialog"`, aria "Model and effort"; width 300; **left** 12; bottom 44):
- Label "Model". Menu (`role="menu"`, padding `0 6 6`): items `menuitemradio`, padding `7 8`, radius 8, gap 10, hover `--surface-2`, checked row `--accent-soft`. Radio: 16 px circle, unchecked inset 1.5 px `--line-2`, checked `--accent-fill` with a white 10 px check. Text: name 500 (+ optional tag h16 radius 4 `--surface-2` 10.5 `--muted`) over description 11.5 `--faint`:
  - "Default" — "Whatever Claude Code picks · Opus 5.5 now"
  - "Opus 5.5" (checked) — "Most capable for complex work"
  - "Opus 5.5" + tag "1M" — "For long conversations"
  - "Sonnet 5.5" — "Fast and capable for everyday tasks"
  - "Haiku 4.5" — "Fastest for quick answers"
  - "Opus plan → Sonnet" — "Opus plans, Sonnet does the work"
- Effort section (top border): label "Effort" + right "deeper thinking, slower replies" (11.5 `--faint`); 5-way segmented radiogroup (aria "Effort"; track `--surface-2` radius 8; items h26 11.5 px; selected `--surface` + shadow + inset `--line-2`, 500): "Low", "Medium", "High" (selected), "Extra", "Max". Levels the model does not support are disabled (today's rule).
- Footer (padding `8 12`, 11.5 `--faint`): "Applies from your next message · this conversation only".
- Trigger: model segment `.on`. Replaces today's two separate menus (model, effort).

### 4.23 PopAgents: "Running agents · click the run bar" (row 5, 440×640)

Popover (`role="dialog"`, aria "Running agents"; left/right 12; above the run bar):
- Header: "Running in this conversation" · spacer · mono "3 running · 2 waiting" (11 `--faint`).
- Group "Workflow": label + "Link & due-date audit · Verify 1/4" (12 `--muted`, ellipsis) + `btn-g` h22 maximize "Open".
- Rows (grid `18px 1fr auto 24px`, min-h 40, padding `4 4 4 8`, radius 8, hover `--surface-2`): spinner · name (500) over mono activity (11.5 `--faint`) · mono time · stop (aria "Stop {name}", title "Stop"): "Verify Website relaunch" `Read Meetings/2026-10-02 Planning sync.md` 1m 33s; "Verify Hiring plan" `Grep "due::" in Projects/Hiring/` 1m 29s; queued rows (dashed circle, name 400 `--muted`, time "—", no stop): "Verify Newsletter plan" "queued · next free slot"; "Fix links & dates" "after Verify".
- Group "Background shell" (top border): spinner · command "rg -l \"TODO\" --glob \"*.md\"" (500, proportional in the mock) over mono "started by Claude · output 214 lines" · "3m 02s" · stop.
- Footer: "2 finished · 1 failed" (11.5 `--faint`) · `btn-d` on `--red-soft` stop icon "Stop all".
- Run bar, expanded state (`aria-expanded="true"`): `--surface-2` fill, `--accent-line` border; "3 running" (counts background shells) "· 2 waiting · Link & due-date audit" "2m 14s"; maximize "Open the workflow view"; chevron-down "Collapse" (replaces "Stop all", which moves to the popover footer).
- Composer working (Stop + Send); status with working cache.

### 4.24 Tooltips: "Hover tooltips & cards" (row 5, 440×1200)

Seven specimens; each section caption gives trigger and timing.
1. **Icon buttons** ("hover · 400 ms · text only"): `+` → "New conversation"; Stop → "Stop Claude’s turn" + kbd "Esc"; permission segment "Edits" → wrapped tooltip (190 px) "Accept edits · file edits run without asking; shell commands still ask".
2. **Conversation tab** ("hover · 500 ms"): tab "Vault audit" (busy + agent badge 2) → hover card (250 px): "Vault audit" (600 12.5); dot + "Working · 2m 14s" (`--muted`); bot + "2 agents running · 2 waiting"; "6 prompts · Opus 5.5 · started 14:29" (11 `--faint`). Waiting tabs: §7 Q37.
3. **Context & cache** ("hover · click opens details"): card (230 px): "Context" · mono "68k / 200k"; 4 px accent bar 34 %; green zap · "Cache warm" · mono "4:12 left".
4. **Plan usage** ("hover · click opens details"): card (230 px): "5-hour session" · "42%"; "resets 16:59" (`--faint`); "Week" · "18%"; "Week · Sonnet" · "81%" (orange).
5. **Changed files** ("click"): chip "3 files +42 −7" → popover (`role="dialog"`, aria "Files this conversation changed", 300 px): rows (grid `1fr auto auto`, padding `5 6`, radius 7, hover `--surface-2`, 12 px): "Q4 planning.md" +26 −7; "Budget 2027.md" + "new" (11 `--faint`) +14 0; "Projects/Hiring plan.md" +2 0 (zero in `--faint`); footer `btn-g` "Review changes" (opens today's "Changes this conversation" modal) · spacer · `btn-g` rotate-ccw "Restore all" (new).
6. **Turn cost** ("hover"): "12.4s · $0.021" → card (230 px): "Input" 1.2k; "Cache read" 61.2k; "Cache write" 3.4k; "Output" 840; footer line (top border) "At API prices; plans count usage instead".
7. **Context chip** ("hover"): chip "Q4 planning.md" → tooltip "Sent with your message · click to leave out".

Rules: text tooltips for icon-only controls after 400 ms; rich hover cards after 500 ms (tab) or on hover for context/usage/cost; click opens the detail popover where one exists. Hovering a side-column Recent row keeps today's tooltip "{title}\nLast active {time}".

## 5. Behavioural decisions recorded in the sessions

**D1. `/clear` stays in the same conversation** (s2; reverses commit 24678e6, which opens a new conversation). User: "decide if `/clear` sould stay in the same conversation - think about over behavior and decide (e.g., existing remote connection with rc, session id, etc.), consider and decide". Final answer:

| Aspect | After `/clear` |
|---|---|
| CLI process | Stays the same. The panel passes `/clear` to the running CLI. If no CLI is running, the panel just forgets the old session id. |
| Session id | The CLI starts a new session. The conversation keeps each part's session id and resumes from the latest one. |
| Remote Control | Can't be used with `-p`/stream-json today. If supported later, it survives `/clear` because it is tied to the process ("the conversation resets on connected devices too"); a new conversation would start a new process and drop it. |
| Tab, title, pin, model, effort, permission mode, profile, attached notes | Kept |
| Earlier messages | Stay on screen, dimmed. **Branch** on one opens a new tab that continues the old session. **Restore files** still works (panel checkpoints are per turn, not per session). |
| Undo | A button on the divider, available until the next message. It resumes the previous session. |
| Context meter | Resets. The conversation's cost total keeps counting. |
| Sent while Claude is working | Queued like any message; runs when the turn ends; can be cancelled. |
| Agents or a workflow still running | Confirm first: **Stop and clear** or **Cancel**. |
| History and export | Still one entry. The exported note gets a "Context cleared" line. |

Why (assistant): "+" already starts a new conversation; the CLI's own `/clear` keeps you in the same window and process; the problem 24678e6 fixed (silently resuming an empty session under old messages) becomes intended behaviour once the divider makes the clear visible. Hard-to-undo part: storing a session id per segment; "I'll get a second opinion from Codex before implementing that." Evidence gathered: Claude Code docs say `/clear` saves the previous conversation, resumable by id; Remote Control is documented for interactive sessions only; `/compact` keeps the same session; commit 24678e6 shows `/clear` over stream-json starts a new session and emits a new init (so the mechanism works in practice). Memory note `clear-stays-in-conversation` records the same; status "not yet implemented".

**D2. History button hidden when the list column shows** (s2). User: "do we need the history button when sessions are shown on the right?" Answer: "No, not when the list is showing. At 820 px and wider, the list already covers everything the history button opens: pinned, open and recent conversations, plus a filter and delete on right-click." Stays below 820 px (tabs show only open conversations), inside ⋯ below 360 px, and as the command-palette command. Unanswered follow-up: "The plugin itself still shows the button next to the list… Want me to hide it in the code too?"

**D3. Workflow phases: design now, verify later** (s1→s2). Assistant (s1): "I haven't confirmed that the CLI reports which phase each agent belongs to. If it doesn't, the workflow view falls back to a flat list of agents." User (s2): "Workflow phases may not be available - ok, so design the ui/ux for now, and we'll see if feasible during impl or detailed design later". s2: "I left the workflow view's phases as designed".

**D4. Mobile: stays desktop-only, no mobile UI.** User: "also design what happens in mobile. if not supported, the user should get a message." Assistant: the plugin is `isDesktopOnly: true`, "so the Obsidian mobile app never loads it and can't show any message"; showing one would need loading on mobile with launch code switched off, a manifest and review change. User: "keep the plugin desktop-only." Mobile row removed.

**D5. Prompt pop-out setting** (s1; extended to three styles by D17). User: "we should have setting/option to make prompts pop-out (easy to see when scrolling)". Answer: Settings › Transcript › **Prompt style** Bubble ("quiet") / Pop-out ("numbered, full width"), Pop-out selected in the mocks; **Pin the current prompt while scrolling** (on); **Prompt jump rail** (on, Pop-out only). "Each prompt is a full-width, numbered amber card. While you scroll through a turn, its prompt stays pinned at the top, shortened to one line. Marks along the right edge let you jump between prompts."

**D6. Responsive by panel size.** User: "think/design with responsive web design in mind (how the panel will look like and work with many width/heigh sizes, as the side panel and the entire Obsidian window can be resized by the user)". Answer: container queries on the panel's own width and height; < 360 compact, ≥ 560 roomy, ≥ 820 conversation list, ≤ 640 tall short (§3).

**D7. Slash commands answered as UI.** User: "also design all `/` commands that should be handled by the plugin UI/UX and not text (e.g., `/usage`, `/mcp` etc.)". Answer: all 15 panel commands (13 cards: `/extra-usage` shares the `/usage-credits` card and `/clear` is a divider) "using the fields the code actually returns", plus loading, error and `/clear` states; slash menu grouped with "no tokens" labels.

**D8. Agent run status, stop, workflow popup.** User: "ui/ux should include agent run status (and ability to stop), including poupup of agents workflow view…". Answer: workflow card with per-phase progress and per-agent stop, "Stop workflow"; run bar above the composer with "Stop all" and the workflow-view button; one-off agents as a compact row; popup with a column per phase, a timeline, a detail pane with live steps and a stop button, "Stop workflow" and "open the view as a full Obsidian tab"; it rearranges as the frame is resized.

**D9. Context cleared/compressed cue.** User: "Visual cue in the conversation for when session context was cleared or compressed (e.g., wiggly line with name/description of the action that happened, compacted/cleared/etc)". Answer: wavy divider with a label: "Context cleared" (orange), "Compacted" (expandable summary of what Claude kept), animated "Compacting automatically…"; messages before a clear stay, dimmed.

**D10. Dark and light mode.** User: "Support for dark and light mode (user can choose, default uses Obsidian settings)". Answer: Settings › Appearance › Theme: Match Obsidian (default), Light, Dark; the panel and the workflow view follow it.

**D11. Cache validity in the context indicator.** User: "context window indicator should also indicate if cache is still valid and for how long (should be next to or included in the component that shows context window usage)". Answer: zap + countdown after the context percentage on every status line; states warm, under a minute, expired, 1-hour cache; "The 5-minute or 1-hour lifetime comes from the usage the CLI reports, counted from the last request. After compacting, the cache shows as expired, because Claude has to rebuild it."

**D12. Popovers and tooltips.** User: "also design the popups / tooltips that pops on hover or click (e.g., when hovering on context window icon, when hovering on usage, agents, etc.)". Answer: plain text tooltip on icon buttons; summary hover card on context, usage, agents badge/tab and turn cost; click opens a details panel for context, usage, model, the agents bar and the changed-files pill.

**D13. Visual language** (s1): Geist, layered grey surfaces, rounded corners; the composer floats as a card with model, effort and permission on one line under it; "Your prompts stay amber, but the thick left-edge stripe is gone"; every board supports dark/light and three accents, "in Obsidian the accent would follow the vault's theme".

**D14. New features introduced by the mocks** (s1 list): suggested first prompts in an empty conversation; tool calls grouped into one "N steps" card; a Refresh button on command results; "no tokens" labels in the slash menu; a "Go back" button after `/clear` (s1 draft only, on no board now; ClearStates' Undo replaces it); the mobile view (dropped, D4). Later additions also new: per-agent stop in the transcript, run bar, workflow view, context-event dividers, theme setting, cache timer, popovers for context/usage/model/agents/changed files, "Restore all", Esc to stop.

**D15. Process facts** (not UI): s1's `/clear` instruction was executed as a real `/clear` and emptied the session; s2 found it intact on disk and resumable. The canvas link, session id and D1 were saved to auto-memory.

**D16. Browser tabs** (s3). User: "change … ui design such that tab look like classic tabs and not buttons (borders somewhat visible)", then "selected tag should be more intuitive to easy (mild color blind should be able to quickly see which is the active tab)". Nine variants went on the "Tab options" page; user: "go with number 3. the actual design can use the same tab impl that Obsidian uses. (looks similar)". Result: §2.7 Tab and Header on every board; the active tab differs by shape, fill and weight, not colour alone.

**D17. Three prompt styles** (s3). User, on the Responsive row: "why different prmopt colors from the rest?"; on Pop-out: "can we make popup less pop out? (it's too much)", "at least one light it's too much"; on the "Prompt options" page: "I want 6 with B colors (bubble colors - same colors)", then "let's also have 3 theme options, the boring one, when prompt doesn't stand out much from the chat (same colors,  something like 7 colors), the current bubble design where the prompt color stands out, and the popup design". Result: Settings › Prompt style Quiet / Bubble / Pop-out, Pop-out the default; Pop-out takes the bubble's fill and border (the separate `--pop-*` tokens are gone); the rail shows with Quiet and Pop-out; pinning works with all three.

**D18. Light page** (s3). User: "generate another page with the light design example (first page is mostly dark)", then "I want panel redesign + light theme to show all 3 prompt styles. also, both pages should be called redesign dark/light". Result: pages "Redesign dark" and "Redesign light", each with the prompt-styles row.

**D19. Options pages are not a target** (s3). User: "(the options pages should be ignored when implementing - we already chose one)".

**D20. Conversation tabs previews** (s4, 2026-10-13). User: "the thumbnail preview for conversation tabs doesn't visualize truely (not hints at) how it would look like with conversation on top or on the side. generate a few alternative designs for it in the mock artifact and i'll choose one"; options A (miniature with real text), B (tab area in the accent), C (the panel in the Obsidian window), D (Automatic shown resizing); then "let's do B". The shipped previews also drew the column on the left; B draws it on the right.

## 6. Mock-only or infeasible items

- **Fonts**: the mocks load Geist and Geist Mono from Google Fonts. The plugin makes no network requests: it bundles the fonts (owner decision 2026-10-12, §2.1; ADR pending) or inherits Obsidian's.
- **Theme and accent tweaks**: canvas-only switches; accent comes from Obsidian.
- **All data is invented**: notes, people (Maya, Daniel), dates, costs, token counts, timings, session id, MCP servers, skills, hooks, rules; CLI "Version 2.4.1" (installed CLI is 2.1.292); "Plan [YOUR PLAN]" placeholder.
- **Model names and descriptions**: "Sonnet 5.5" (PopModel, WorkflowView) is not in the plugin's fallback list ("Sonnet 5"); PopModel descriptions ("Most capable for complex work"…) are mock copy. Use the CLI-reported list.
- **Mobile boards**: infeasible while `isDesktopOnly: true` (mobile never loads the plugin, so no message can appear); dropped by the user.
- **Workflow phases, concurrency ("2 at a time"), "Queued · next free slot", "Waits for Verify · gets its findings"**: not confirmed to be reported by the CLI (D3); fallback is a flat agent list.
- **Workflow detail "Prompt"/"Output" tabs, "Full transcript", timeline**: need per-agent prompt, output and start/end times; availability over stream-json unverified (the plugin already renders subagent threads, which covers Activity).
- **Remote Control**: documented for interactive sessions only, not `-p`/stream-json (cited in D1).
- **Cache countdown and "Expires 14:26:40"**: the CLI reports cache token counts, not expiry; the timer is an estimate from the last request time and the TTL inferred from usage. "a tenth of the input price" is pricing copy to verify.
- **"Compacting automatically…" and the "What Claude kept" summary**: need a compaction-start signal and the summary text; the plugin currently drops compaction boundaries (`src/view.ts` "compaction boundaries, status pings, thinking counts"); availability unverified.
- **`/sandbox` "Network filtering is off until it is installed."**: explanatory copy not supplied by the CLI.
- **`/status` section names** (Session, Account, Environment and their rows): whatever `get_status` returns.
- **Esc to stop**, **Restore all**, **starter prompts**, **Undo clear**, **"/context details" from the popover**: new behaviour, feasible with existing primitives (interrupt, checkpoints, `--resume`).

## 7. Open questions and recommended answers

| # | Question | Recommendation |
|---|---|---|
| Q1 | The Transcript link lives in the sub-bar, which hides at ≥ 820 px and ≤ 640 px tall. Where does it go? | Header icon button (file-text, tooltip "Open the exported note") beside the changes chip when exported; inside ⋯ below 360. |
| Q2 | The Profile segment (shown when several CLI profiles exist) is not mocked. | Keep it as the 4th status segment (terminal icon + name) after Permissions; icon-only below 360. |
| Q3 | The "Conversation tabs" setting (Top / Side / Automatic, threshold side width + 380 px, 40 px hysteresis, resizable 140–480 px stored per device) vs the fixed 820 px rule and `clamp(220px, 26cqw, 300px)` width. | Keep the setting. Automatic = ≥ 820 px with the existing 40 px hysteresis; Top/Side force a layout. Keep the resizable width; default to the design clamp until the user resizes. |
| Q4 | A panel-only Light/Dark choice conflicts with "colors from Obsidian CSS variables" when it differs from Obsidian's theme. | Decide in the CSS-architecture ADR. Match Obsidian (default) inherits everything and adds no class. For a forced Light or Dark, re-scoping Obsidian's `theme-light` / `theme-dark` on the panel root and the workflow view works for the default theme and for themes keyed on descendant selectors, but themes keyed on `body.theme-dark` or on ancestors still show the host theme, and `color-scheme` only switches native controls. The robust alternative is plugin-owned classes with a complete plugin palette for the forced modes, losing community-theme colours there. Recommended: re-scope, with the plugin palette as fallback for variables the theme leaves unset; verify in a vault with one community theme. |
| Q5 | The canvas offers three accents. | No accent setting; use Obsidian's accent. |
| Q6 | Token drift between boards (light orange, light amber, orange-soft) and two different category palettes. | `generator/common.css` values are canonical; one category palette from Obsidian `--color-*` variables in today's meter order. |
| Q7 | Usage segment under warn shows "Sonnet 81%" instead of "wk" (Commands). | Show 5h plus the highest weekly limit; orange tint at warn, red at critical. |
| Q8 | Placeholders for idle and new conversations differ from today and the new-conversation one is not mocked. | New conversation: "Ask about your vault… (@ mentions a note, / runs a command)"; ongoing: "Reply, or @ to mention a note…"; keep the working and waiting texts as mocked. |
| Q9 | The `/context` mock drops today's Memory files, MCP tools, Custom agents and Listed to Claude sections. | Keep them as collapsible sections under the legend. |
| Q10 | Refresh/Copy actions differ per card; the Commands `/context` card has neither. | Copy on every card; Refresh on every card except `/help`. |
| Q11 | What a `/help` row click does. | Insert `/name ` into the composer without sending. |
| Q12 | Slash menu and `/help` use different descriptions and labels ("Answered in the panel" vs "Answered by the panel"). | One description per command in `PANEL_COMMANDS`, used in both; label "Answered by the panel"; update `/clear` to "Clear Claude’s context; messages above stay, dimmed". |
| Q13 | Effort control shows "Extra" (today "Extra high") and has no "Default". | Add "Default" as the first segment; "Extra high" in tooltips and the status segment. |
| Q14 | Model popover content. | CLI-reported models; show descriptions only when the CLI supplies them; today's fallback list otherwise. |
| Q15 | Click on a one-off agent row (chevron-right). | Expand its subagent thread inline (today's details element). |
| Q16 | "6 earlier messages" pill above dimmed pre-clear messages. | Collapse pre-clear segments longer than 4 messages behind the pill; click reveals them. |
| Q17 | Does Undo survive reload or closing the tab? | Yes until the next message: store the previous session id on the divider record. |
| Q18 | `/clear` while a turn runs and agents run. | Confirm first ("Stop and clear"), then queue it until the turn ends. |
| Q19 | `/clear` with trailing text (how s1 was wiped). | Ask before clearing when `/clear` has arguments; the text is not sent. |
| Q20 | Starter prompts: click behaviour and when shown. | Fill the composer for editing; show only with an active note; the selection starter only with a selection. |
| Q21 | Esc stops the turn (new). | Only when the composer has focus and no menu or popover is open. |
| Q22 | Composer Stop vs run-bar "Stop all". | Stop interrupts the turn as today; background agents and shells keep running until "Stop all" or their own stop. |
| Q23 | Workflow view container ("popup, resizable" + "Open in a tab"). | Obsidian Modal with a resizable frame (remembered size); the same component inside an ItemView for the tab. |
| Q24 | Settled permission card not mocked. | Today's behaviour restyled: neutral `--line` border, no halo, buttons replaced by the outcome ("Allowed", "Always allowed", "Denied", "Cancelled", "Session ended") in 11.5 `--faint`. |
| Q25 | Turn footer is always visible in mocks; today it appears on hover. | Always visible, faint, as mocked. |
| Q26 | Which tool calls form a steps card. | Consecutive tool calls between text blocks; a permission card or question ends the group; one call = single row; finished groups of 3+ collapse. |
| Q27 | Sticky prompt in Bubble style. | Allowed (the setting is independent). |
| Q28 | Prompt numbers across `/clear`. | Continuous within the conversation. |
| Q29 | Switcher and ⋯ menus are not mocked. | Switcher: today's "All conversation tabs" menu (pinned first, status suffix, check on active) + "Previous conversations…". ⋯: Previous conversations, Open transcript (if exported), Export to Markdown, Plugin settings. |
| Q30 | "Restore all" in the changed-files popover (new). | Open the existing Restore modal listing every restorable file across turns; confirm required. |
| Q31 | Usage popover vs today's usage modal. | Replace the modal with the popover. |
| Q32 | "Compact" in the context popover spends tokens. | No confirm; tooltip "Summarize the conversation now (uses tokens)". |
| Q33 | When the context ring turns orange. | Today's threshold, ≥ 80 %. |
| Q34 | Hover mechanics. | `setTooltip` for text tooltips; custom hover cards with a 500 ms show delay and a short hide grace. |
| Q35 | Images, image chips, error banners and the Restore/Delete/Changes modals are not redesigned. | Restyle with the tokens; keep behaviour and copy. |
| Q36 | Hide the history button in code at ≥ 820 px (s2 asked, unanswered). | Yes, as designed. |
| Q37 | Tab hover card for a waiting tab. | Replace "Working · 2m 14s" with orange dot "Waiting for you". |
| Q38 | Top tabs have no close × in any mock (today they do; side rows keep it). | Show × on hover and on the active tab, as in the side column; middle-click still closes. |
| Q39 | What the Effort segment does on click (PopModel is opened from Model). | Open the same popover with focus on the Effort control. |
| Q40 | Permission segment click is not mocked. | Today's mode menu restyled as a popover list; Auto and Bypass in `--red` with "⚠". |
| Q41 | When does the chips row disappear at full height? Question shows the composer with no chips row and the active-note offer chip inline, beside the slash button, while a question waits. | Show the chips row only while at least one context item is attached or the message has attachments; otherwise the offer chip sits inline after the slash button, at every height. |

## 8. Appendix A. User messages, verbatim, in order

Only messages the user typed; tool output, subagent reports and skill text are excluded. Typos are original.

**A1** (s1, 2026-10-07T08:00:52, typed)

```text
let's upgrade the ux/ui design with a fresh, modern and very pretty new ui.
can you generate new mocks for me with claude design?
```

**A2** (s1, 2026-10-07T08:14:13.199Z, typed while Claude worked (queued))

```text
we should have setting/option to make prompts pop-out (easy to see when scrolling)
```

**A3** (s1, 2026-10-07T08:17:16.596Z, typed while Claude worked (queued))

```text
think/design with responsive web design in mind (how the panel will look like and work with many width/heigh sizes, as the side panel and the entire Obsidian window can be resized by the user)
```

**A4** (s1, 2026-10-07T08:18:43.834Z, typed while Claude worked (queued))

```text
also design all `/` commands that should be handled by the plugin UI/UX and not text (e.g., `/usage`, `/mcp` etc.)
```

**A5** (s1, 2026-10-07T08:22:21.199Z, typed while Claude worked (queued))

```text
also design what happens in mobile. if not supported, the user should get a message.
```

**A6** (s1, 2026-10-07T08:37:53, local command)

```text
/compact
```

**A7** (s1, 2026-10-07T08:44:03, typed)

```text
keep the plugin desktop-only.

add features:
ui/ux should include agent run status (and ability to stop), including poupup of agents workflow view (e.g., see agents running in panel but can also view the entire agent workflow and status if needed in a biggest/wider popup)

Visual cue in the conversation for when session context was cleared or compressed (e.g., wiggly line with name/description of the action that happened, compacted/cleared/etc)

Support for dark and light mode (user can choose, default uses Obsidian settings)

context window indicator should also indicate if cache is still valid and for how long (should be next to or included in the component that shows context window usage)
```

**A8** (s1, 2026-10-07T08:49:31.526Z, typed while Claude worked (queued))

```text
also design the popups / tooltips that pops on hover or click (e.g., when hovering on context window icon, when hovering on usage, agents, etc.)
```

**A9** (between s1 and s2, session `505b14f3`; reconstructed from the CLI's `/clear` command name plus its arguments, because Claude Code ran it as a real `/clear`; the recovered text stops after "so des"; A10 restates it)

```text
/clear would stay in the same conversation- think about over behavior and decide (e.g., existing remote connection with rc, session id, etc.)

Workflow phases may not be available - ok, so des[…]
```

**A10** (s2, 2026-10-07T09:13:15, typed)

```text
continuing the design work done at `https://claude.ai/artifact/7oFC6qZknD4LiF4ib7Ef6y#page-dcb81aee8d83` (creating session was cleared accidently) 

open questions were: 
decide if `/clear` sould stay in the same conversation - think about over behavior and decide (e.g., existing remote connection with rc, session id, etc.), consider and decide

Workflow phases may not be available - ok, so design the ui/ux for now, and we'll see if feasible during impl or detailed design later
```

**A11** (s2, 2026-10-07T09:15:00.408Z, typed while Claude worked (queued))

```text
can you also recover the session that created that artifact from session history? (it was cleared by mistake as claude took my `/clear` ux instruction and cleared the actual session)
```

**A12** (s2, 2026-10-07T09:28:31, typed)

```text
do we need the history button when sessions are shown on the right?
```

**A13** (s3, 2026-10-12T19:19:53.895Z, typed)

```text
change https://claude.ai/artifact/7oFC6qZknD4LiF4ib7Ef6y#page-dcb81aee8d83 ui design such that tab look like classic tabs and not buttons (borders somewhat visible)
```

**A14** (s3, 2026-10-12T19:24:47.181Z, typed)

```text
selected tag should be more intuitive to easy (mild color blind should be able to quickly see which is the active tab)
```

**A15** (s3, 2026-10-12T19:27:31.175Z, typed)

```text
I don't like the new design. generate several alternatives for me to chosse from in a dedicated space - (number or name them) I'll choose and let you know.

also, what's the white squares you added?
```

**A16** (s3, 2026-10-12T19:28:43.768Z, typed while Claude worked (queued))

```text
you can remove those boxes
```

**A17** (s3, 2026-10-12T19:29:08.833Z, typed while Claude worked (queued))

```text
I removed them
```

**A18** (s3, 2026-10-12T19:30:32.955Z, typed while Claude worked (queued))

```text
got it. they're added when middle click is clicked
```

**A19** (s3, 2026-10-12T19:34:22.302Z, typed)

```text
which one you recommend?
```

**A20** (s3, 2026-10-12T19:35:18.167Z, typed)

```text
i like 1,3,4 WDYT?
```

**A21** (s3, 2026-10-12T19:35:43.593Z, typed)

```text
6 as well
```

**A22** (s3, 2026-10-12T19:38:28.193Z, typed)

```text
show are 2 inactive tabs look next to each other (how they seperate) - e.g., add a few more tabs
```

**A23** (s3, 2026-10-12T19:42:00.053Z, typed)

```text
go with number 3. the actual design can use the same tab impl that Obsidian uses. (looks similar)
```

**A24** (s3, 2026-10-12T19:44:43.768Z, typed while Claude worked (queued))

```text
Slash commands answered by the panel - the screen is cut off, can't see all examples (e.g., `/hooks` is not visible)
```

**A25** (s3, 2026-10-12T19:46:45.945Z, typed while Claude worked (queued))

```text
generate another page with the light design example (first page is mostly dark)
```

**A26** (s3, 2026-10-12T19:55:57.807Z, typed)

```text
"Responsive · one fluid panel at four sizes" - looks different from the rest, which is the right design? (I like the floating last prompt that sticks to top when scrolling up, but why different prmopt colors from the rest?)
```

**A27** (s3, 2026-10-12T19:57:13.751Z, typed)

```text
can we make popup less pop out? (it's too much)
```

**A28** (s3, 2026-10-12T19:59:44.013Z, typed while Claude worked (queued))

```text
at least one light it's too much
```

**A29** (s3, 2026-10-12T20:03:52.850Z, typed)

```text
can we have one with same colors as non-popup?
```

**A30** (s3, 2026-10-12T20:04:31.489Z, typed)

```text
like 1 or 2 but with same colors
```

**A31** (s3, 2026-10-12T20:06:42.615Z, typed)

```text
I want 6 with B colors (bubble colors - same colors)
```

**A32** (s3, 2026-10-12T20:08:49.873Z, typed)

```text
let's also have 3 theme options, the boring one, when prompt doesn't stand out much from the chat (same colors,  something like 7 colors), the current bubble design where the prompt color stands out, and the popup design
```

**A33** (s3, 2026-10-12T20:12:41.261Z, typed)

```text
where in the redesign can I see how it looks?
```

**A34** (s3, 2026-10-12T20:14:28.189Z, typed)

```text
I want panel redesign + light theme to show all 3 prompt styles.
also, both pages should be called redesign dark/light
```

**A35** (s3, 2026-10-12T20:14:59.235Z, typed while Claude worked (queued))

```text
(the options pages should be ignored when implementing - we already chose one)
```

Later s3 messages concern the implementation prompt, not the design.
