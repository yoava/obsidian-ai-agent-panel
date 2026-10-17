# DES-003 — Panel UI

**Status:** accepted (2026-10-16)

## Requirements

| Requirement | Section here |
| --- | --- |
| PRD-001.R3 CLI profiles: the profile segment and its popover | [Status line](#status-line) |
| PRD-001.R7 Conversation tabs | [Tabs and conversation column](#tabs-and-conversation-column), [Tab activity](#tab-activity) |
| PRD-001.R8 Tab layout | [Layout model](#layout-model), [Tabs and conversation column](#tabs-and-conversation-column) |
| PRD-001.R9 Conversation list | [Tabs and conversation column](#tabs-and-conversation-column) |
| PRD-001.R10 Delete a conversation | [Tabs and conversation column](#tabs-and-conversation-column) |
| PRD-001.R11 Send, steer and stop | [Composer](#composer), [Composer state](#composer-state) |
| PRD-001.R12 Note context | [Context block and chips](#context-block-and-chips) |
| PRD-001.R13 File and folder attachments | [Context block and chips](#context-block-and-chips), [Suggests](#suggests) |
| PRD-001.R14 Images | [Images](#images), [Image viewer](#image-viewer) |
| PRD-001.R15 Streaming messages | [Stream to messages](#stream-to-messages), [Turn](#turn), [Turn head, thinking and footer](#turn-head-thinking-and-footer) |
| PRD-001.R16 Tool steps | [Tool-step group](#tool-step-group), [Tool steps](#tool-steps) |
| PRD-001.R17 Untrusted model output and links | [Markdown and links](#markdown-and-links) |
| PRD-001.R18 Subagents and background tasks | [Agent rows and run bar](#agent-rows-and-run-bar) |
| PRD-001.R19 Slash commands | [Suggests](#suggests), [Panel commands](#panel-commands) |
| PRD-001.R20 Panel report commands | [Panel commands](#panel-commands), [Report cards](#report-cards) |
| PRD-001.R21 MCP server management | [Panel commands](#panel-commands) |
| PRD-001.R22 Model selection | [Models and effort](#models-and-effort) |
| PRD-001.R23 Reasoning effort | [Models and effort](#models-and-effort) |
| PRD-001.R25 Settings tab: the theme and prompt rows reaching open panels | [Settings that reach the panel](#settings-that-reach-the-panel) (the tab: DES-001) |
| PRD-001.R28 Accessibility | [Keyboard and accessibility](#keyboard-and-accessibility) |
| PRD-001.R29 UI performance | [Performance budget](#performance-budget) |
| PRD-001.R30 Layout by size | [Layout model](#layout-model), [Header and changes bar](#header-and-changes-bar), [Context block and chips](#context-block-and-chips) |
| PRD-001.R31 Status line | [Status line](#status-line) |
| PRD-001.R32 Popovers, hover cards and tooltips | [Popover and hover card](#popover-and-hover-card), [Popovers, hover cards and tooltips](#popovers-hover-cards-and-tooltips) |
| PRD-001.R33 Prompt display: style and color | [Prompts](#prompts), [Settings that reach the panel](#settings-that-reach-the-panel) |
| PRD-001.R34 Theme | [Token contract](#token-contract); mechanism in [ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md) |
| PRD-001.R35 Empty conversation | [Empty conversation](#empty-conversation) |
| PRD-002.R1 Permission card: the settled card | [Permission card and question form](#permission-card-and-question-form), [Cards](#cards) |
| PRD-002.R6 Edit outcome on the step row | [Tool steps](#tool-steps) |
| PRD-002.R7 Changes this conversation: chip and popover | [Header and changes bar](#header-and-changes-bar) |
| PRD-002.R8 Permission modes: segment, popover, hover text | [Status line](#status-line), [Popovers, hover cards and tooltips](#popovers-hover-cards-and-tooltips) |
| PRD-002.R12 AskUserQuestion form: title and count | [Permission card and question form](#permission-card-and-question-form), [Cards](#cards) |
| PRD-002.R16 `!` shell escape: the shell card | [Cards](#cards) |
| PRD-002.R18 Restore to before turn N | [Header and changes bar](#header-and-changes-bar) |
| PRD-003.R1 Conversation file: the send time shown | [Prompts](#prompts) |
| PRD-003.R11 Automatic export: the Transcript button | [Header and changes bar](#header-and-changes-bar) |
| PRD-005.R2, R3, R4, R5, R8, R10, R11 Plan-usage, context and prompt-cache surfaces | [Status line](#status-line), [Popovers, hover cards and tooltips](#popovers-hover-cards-and-tooltips) |
| PRD-005.R6 Usage commands: the cards | [Report cards](#report-cards) |
| PRD-005.R7 Turn cost on the footer | [Turn head, thinking and footer](#turn-head-thinking-and-footer) |

Requirements live in [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md), [PRD-002](../../current/product/PRD-002-permissions-and-change-control.md), [PRD-003](../../current/product/PRD-003-conversation-history-and-export.md) and [PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md); quoted UI strings are theirs.

Elsewhere: process, control requests and respawn in [DES-002](../../current/design/DES-002-cli-client-and-session-lifecycle.md); the card contract, mode state and display rule, diffs, change list, Restore files, Branch and the `!` escape in [DES-004](../../current/design/DES-004-permission-and-change-control.md); recording, stored fields, settings keys and device-local keys in [DES-005](../../current/design/DES-005-persistence-and-sync.md); the usage service, its scheduling, and the cost and context figures in [DES-007](../../current/design/DES-007-usage-and-cost.md); the settings tab in [DES-001](../../current/design/DES-001-system-overview.md). This design owns where and how those show.

Manual verification obligation: the rows of the [verification matrix](#verification).

## Context and constraints

- Fixed by [ADR-016](../../current/adr/ADR-016-panel-ui-architecture.md): the `src/state/`, `src/tab/`, `src/ui/` split, every module and its job, the state owners, updates through Obsidian's `Events`, the one popover host and hover-card host, which size rules are CSS and which TypeScript, the reopen strategy, lifecycle, boundary rules U1 to U7, and migration by vertical slice.
- Fixed by [ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md): class and token naming, the token rules, container queries, the palettes and mode mechanism, forced colors, motion, and `tests/styles.test.mjs`. This design owns the token table.
- Also in force: [ADR-010](../../current/adr/ADR-010-render-model-output-with-markdownrenderer.md) and DES-001's [rendering boundary](../../current/design/DES-001-system-overview.md#rendering-boundary); [ADR-001](../../current/adr/ADR-001-drive-the-installed-cli-over-stream-json.md) (the stream drawn here); [ADR-003](../../current/adr/ADR-003-plan-usage-and-account-data-through-the-cli.md) (report commands and usage go through the CLI); [ADR-005](../../current/adr/ADR-005-plugin-owned-conversation-history.md) (what is recorded); [ADR-009](../../current/adr/ADR-009-synced-and-device-local-settings.md) (layout state device-local, the new settings synced); [ADR-013](../../current/adr/ADR-013-desktop-only-obsidian-1-8-7-floor.md) (Electron at the 1.8.7 floor has no scroll-state container queries).
- No DOM test harness exists. Components are verified by the manual matrix; their logic lives in `src/state/` under `node:test`.
- `tests/fake-cli.mjs` streams text, permission requests and control replies; its `turn`, `question` and `steps` scenarios add deltas, thinking, tool calls, forms, subagents and background tasks, shaped from the panel's parsing rather than captured.
- Untrusted when they reach the DOM: model text, tool inputs and results, CLI reports, model and command lists, stored history.
- Vocabulary is DES-001's: "messages" is a tab's on-screen list, "transcript" the exported note.
- Visual values come from the redesign canvas ([SPEC](../../work/research/redesign-canvas/SPEC.md)), which is evidence, not a requirement.

## Proposed design

### Layout model

```text
.ai-agent-panel.ai-agent-panel-scope   root: container "ai-agent-panel" (size), height 100%
  .ai-agent-panel-main                 container "ai-agent-panel-main" (inline-size)
    .ai-agent-panel-top                grid: ui/header (display: contents) and ui/changes-bar
    .ai-agent-panel-messages-host      one ui/messages per tab, inactive ones hidden; ui/jump-rail (its list and the composer area are at most 740 px wide, centred, with or without the conversation column)
    .ai-agent-panel-composer-area      ui/run-bar, ui/composer, ui/status-line
    .ai-agent-panel-layer              ui/popover-host, ui/hover-card-host
    .ai-agent-panel-announcer          ui/announcer, visually hidden
  .ai-agent-panel-column               ui/conversation-column, mounted in column layout only
```

| Condition | Mechanism | Effect |
| --- | --- | --- |
| Main column below 360 px | `@container ai-agent-panel-main` | Switcher replaces the strip; "More" replaces history, Transcript and settings; changes chip without its file count; turn-footer labels and step counts hidden; every status-line step applied; gutters 12 px (messages) and 8 px (composer); messages top 14 px; composer bottom 8 px; changes bar 9 px under its chip, none above |
| Main column from 560 px | `@container ai-agent-panel-main` | Long effort and mode strings; plan-usage reset time; gutters 24 px and 16 px; messages top 22 px; composer bottom 12 px; tab max width 200 px |
| Panel at most 640 px tall | `@container ai-agent-panel` | Changes bar in the header row; offer chips hidden; on and attached chips on one line with "+N"; one-line textarea |
| Column shown | class `is-column` on the root, from `state/layout` | Title block replaces the strip; "+" and history hidden; changes bar in the header row |
| Strip or column | `state/layout` on `onResize` and on a "Conversation tabs" change | Automatic (the default): column while the panel is at least 820 px wide, 780 px while shown; Top: strip; Side: column |
| Status-line fit, "+N" chips, rail positions | The resize pass below | [Status line](#status-line), [Context block and chips](#context-block-and-chips), [Prompts](#prompts) |
| Obsidian's status bar over the panel | `state/bar-clearance` in the resize pass; `--ai-agent-panel-bar-clearance` | The composer area and the conversation column add the bar's overlap to their bottom padding |

- Between the thresholds: messages gutter 16 px, messages top 18 px, composer gutter 12 px, composer bottom 10 px, tab max width 150 px. Each composer bottom is the board's, plus the status bar's overlap.
- The header's action buttons are centred in the strip row (36 px), so they line up with the tabs; in the header-row cases (also below 360 px when the panel is at most 640 px tall) the changes bar is 6 px above its chip and none below, so the row stays 36 px.
- The top region is a grid. `ui/header`'s root is `display: contents`, so its nav area, its action buttons and the changes bar are grid items: areas `"nav actions" "bar bar"` by default and `"nav bar actions"` in the header-row cases. No element moves between parents.
- Messages keep chronological DOM order. A flex spacer (`margin-block-start: auto`) before the first item bottom-aligns a conversation shorter than the view; no `column-reverse`.
- From a 300 px main column nothing overflows inline: flex items take `min-inline-size: 0`, prose `overflow-wrap: anywhere`, `pre`, tables (`display: block`) and diffs scroll inside themselves, images `max-inline-size: 100%`; the messages element is `overflow-x: hidden`. The empty state, the settings tab's card pickers (which wrap) and its fields shrink to their container; a report value gets a `<wbr>` after each "/" (`commands` `pathSegments`, Chromium offers no break there), so a path wraps at its slashes before it breaks inside a name.
- Column width (`tabs-layout`): unset, 26% of the panel, clamped to 220 to 300 px and to half the panel; dragged on `ui/shell`'s handle, 140 px to the smaller of 480 px and half the panel, the minimum winning when both cannot hold. The stored width is device-local (DES-005); a stored 180 px reads as unset; a double-click clears it. The preference is kept apart from the drawn width (`--ai-agent-panel-side-width` on the root), so a briefly narrow panel caps the drawing without losing it; the layout settles once at drag end.
- Stacking, bottom to top, one z-index token each (`tests/layers.test.mjs`): the active tab's feet, under the tab's content and focus ring (`-z-below`), column section headers and the column handle (`-z-sticky`), the pinned prompt (`-z-pin`), the jump rail (`-z-rail`), then every floating layer (`-z-float`): the main column's layer, which holds every popover and hover card, and the suggests. No ancestor of a floating layer (root, main column, composer area, composer) starts a stacking context by a declaration; the `container` shorthand on the root and the main column may start one, which is harmless: the main column encloses the layer, the suggests, the pinned prompt and the rail, and only the column's section headers and handle sit outside it. The rail ticks' text tooltips are Obsidian's, drawn outside the panel.
- Resize pass: `ui/shell` owns one `ResizeObserver` (ADR-016) on the main column, the messages host and the active tab's messages content. Its callback and `css-change` schedule one pass per frame: every registered measure (status line, chips, rail, strip overflow) reads, the pure fits run, then every write happens. Messages-content entries trigger only the rail's re-read. A messages-host entry fires `messages-resize` from the callback, before the paint, for scroll-follow.
- Status bar clearance: Obsidian draws `.status-bar` fixed over the workspace's bottom inline-end corner, and the panel's own padding is 0, so a panel under it would have its status line covered. The pass reads the bar, `.app-container > .status-bar`, from the panel's own document (a pop-out window has none) and, for the main column and for the conversation column while it is mounted, gets the overlap from `state/bar-clearance`: the part of the column below the bar's top, when the bar has a size and reaches the column horizontally, else 0. `ui/shell` writes it as `--ai-agent-panel-bar-clearance` on each column, and `styles.css` adds it to the composer area's bottom padding and to the conversation column's, so the status line and the column's last rows stay fully visible and nothing is added where the bar does not reach. The panel resizing, the bar resizing as its items change, the bar's class or style or the body's classes changing (hiding it), `layout-change` and `resize` of the workspace, and `css-change` each schedule the pass; no timer repeats it. A pass for the bar alone runs no measure; when a written clearance changes the messages host's height, one full pass follows so the rail re-reads it.

### Modules

Jobs, owners and the update flow are ADR-016's. New Obsidian-free modules are `src/state/<name>.ts`, each in `pretest` with `tests/state-<name>.test.mjs`, whose test names start with the requirement ID.

| Module | Pure job |
| --- | --- |
| `state/tab` | One tab's data (messages model, composer state, status, usage totals, scroll position) and its [activity](#tab-activity); whether the messages follow their end (`followsEnd`) and which inputs scroll them up by hand (`scrollsUpByHand`); builds the messages model from stored messages; a `!` run's status (`shellStatus`) |
| `state/stream` | Reduce one stream message to messages-model changes |
| `state/compaction` | The [compaction dividers](#compaction-dividers): the CLI's compaction messages as signals (`compactionSignal`), the divider's data and the record each signal asks for (`reduceCompaction`, `settleCompaction`), the divider's view (`compactionView`, an `EventView`) and texts (`compactedLine`), a stored record read back |
| `state/clear-divider` | The [clear divider](#clear-divider): a stored clear as the messages draw it (`clearFromRecord`), its view (`clearView`, an `EventView`) and the separator's name and exported line (`clearedLine`) |
| `state/held-rows` | The held tray's rows and status texts (`heldRows`), the live-region announcements, and the note or error a `/clear` that did not run leaves (`declineNote`) |
| `state/clear-dialog` | The Stop and clear dialog's words, and the counts and title from the tab's task list |
| `state/stop-operation` | The Stop and clear machine (DES-002): task messages, turns, exits and the timer in; stops, interrupt, clear or failure out |
| `state/held-send` | The send path's decisions about held messages: `sendGate`, `submitRoute`, `routeAfter`, the image and context merges |
| `state/event-view` | The `EventView` and `SubPart` types both dividers are drawn from |
| `state/tabs` | Order the open tabs (pinned first, then drag order); `dotState`; whether the strip overflows (`stripOverflows`); tab, open-tabs list and tab hover-card view-models |
| `state/layout` | Strip or column, with hysteresis |
| `state/bar-clearance` | The pixels of a column's bottom that Obsidian's status bar covers |
| `state/prompts` | Prompt count, first lines, the prompt number of a turn, rail tick fractions, the empty-state starters |
| `state/turn` | The [turn](#turn) machine over the messages model; the head and thinking labels; `formatElapsed`; copy text; the last turn's prompts (`lastTurnPrompts`, a failed branch's unsent text, DES-004 Branch) |
| `state/branch-history` | What a branch reads from stored records (DES-004 Branch): the latest prompt its rewind names (`latestPrompt`, read from the turn's segment) and whether a conversation holds a session in any segment (`holdsSession`), whether a compaction summarized a turn away (`summarizedAway`), the branch still to make (`pendingBranch`), and the record that holds it (`branchRecord`, `isBranchIntent`) |
| `state/branch-hold` | A branch's rewind held by the tab until a rewind succeeds, given once to each session the tab creates meanwhile (`BranchHold`), and the record of a branch handed out once ahead of the conversation's first record (`BranchIntent`, DES-004 Branch) |
| `state/branch-failure` | A failed branch's error text: Claude Code's reason in the user's words (`branchFailureText`) |
| `state/session-id` | The session-id grammar: a stored id is used only as a lowercase UUID (`isSessionId`, ADR-018 Decision 1) |
| `state/working-line` | The working line's label and elapsed time (`formatClock`); whether the head's mark rings (`headRings`: only while no working line shows, in practice never) |
| `state/turn-cost` | Per-turn cost and the token hover rows |
| `state/step-groups` | The [tool-step group](#tool-step-group) machine and its view-models |
| `state/permission` | The [card and form](#permission-card-and-question-form) machine, outcome texts, answered count |
| `state/image-viewer` | The [image viewer](#image-viewer)'s state: the image shown, fitted or actual size, stepping (`stepViewer`), the caption (`viewerCaption`), a thumbnail's name (`thumbLabel`), a tool result's images as viewer images (`stepViewerImages`), file sizes (`formatBytes`) |
| `state/composer` | The [composer state](#composer-state), the Escape action, the chips' view-models and the inline offer rule (`composerChips`), `fitChips`, a `/help` row's insert (`withCommand`), text appended after a blank line (`appendText`) |
| `state/status-line` | Segment view-models (DES-004's mode display rule, the context segment), accessible labels, `fitStep` |
| `state/usage-segment` | Plan-usage item choice, tint, hover rows, popover rows, the usage cards; the usage formatters from `usage.ts` |
| `state/popover` | The [popover and hover-card](#popover-and-hover-card) machine; placement up or down from a trigger |
| `state/agent-icon` | The plugin icon's registry id and outline markup (stroke `currentColor`, fill none). Obsidian puts a registered id on the `<svg>` as a class, so the id starts with no panel class prefix and no rule of `styles.css` selects it |
| `state/theme` | `resolveMode`; `ModeClasses`: the `is-light`/`is-dark` class on each attached root, by the Theme setting or by Obsidian's mode, switched inside the fence (ADR-017); `Registrations`: one detach per settings row |
| `state/ticker` | The shared ticker: 1 s, or the shortest period a shown subscriber names |
| `state/prompt-cache` | The prompt-cache reducer over stream messages and its view (PRD-005.R11; [DES-007 Prompt cache](../../current/design/DES-007-usage-and-cost.md#prompt-cache)) |
| `state/cache-surfaces` | The popover's "Prompt cache" section and the `/context` card's cache line |
| `state/tooltips` | The class a scope carries while "Show tooltips" is off |

- Existing layer-1 modules keep their jobs and gain: `tabs-layout` the column width above; `conversation-list` an unchanged-input key; `tool-labels` `resultCount` and `toolIcon`; `commands` one description and card title per panel command, the slash list's merge (`commandList`) and the card header (`reportHeader`); `models` the effort table (short and long strings); `settings-core` the mode table (icon, short, long, hover text, warning), read by the status line, the permission popover, the settings tab and `/status`. `attachments` already holds `composerFiles` and the "Not attached:" cap; `edit-tracker` is `tab/edit-tracker`'s logic.
- `suggest` holds the composer's pickers: `@`, `/`, and the attach picker `AddContextModal`.
- `view` mounts the panel-level components, `ui/tab-strip` and `ui/switcher` into `ui/header`'s nav area and `ui/conversation-column` into `ui/shell`'s column slot, so it is their one importer (P5); calls `theme-scope`'s `attach(root)` for its root (ADR-017); and receives every intent that needs a service (open, close, delete, export, settings).
- `report-view` draws cards (`ReportCard`, on its item's `item:<id>`) and takes their actions (Refresh, Copy as Markdown, Try again, Copy error, row actions, a `/help` row's insert, the recorded Markdown's render) as callbacks; `ui/messages` passes them in.

| Component | Subscribes to | Intents |
| --- | --- | --- |
| `ui/shell` | `settings`, `onResize`, its `ResizeObserver` | — |
| `ui/header` | `active`, `tabs`, `layout` | `onNew`, `onHistory`, `onSettings`, `onExport`, `onTranscript` |
| `ui/tab-strip` | `tabs`, `active` | `onSelect`, `onClose`, `onReorder`, `onMenu` (the column's row menu, for a tab), `onOpenTabsList` |
| `ui/switcher` | `tabs`, `active` | `onOpenTabsList`; its list: `onSelect`, `onClose`, `onHistory` |
| `ui/conversation-column` | `tabs`, `active`, `history` | `onSelect`, `onOpenStored`, `onPin`, `onRename`, `onExport`, `onClose`, `onDelete`, `onNew`, `onReorder` |
| `ui/changes-bar` | `active`, `tabs` (a reopen or a detach changes the conversation), `changes`, `export` | `onReviewChanges`, `onRestoreBefore`, `onTranscript`, `onOpenFile` |
| `ui/messages` | `items` | link clicks and hover (delegated); per item: `onToggle`, `onAnswer`, `onRestore`, `onBranch`, `onAddOutput`, report-card actions |
| `ui/jump-rail` | `active`, `items`, `settings` | `onJump` |
| `ui/empty-state` | `items`, workspace `active-leaf-change`, document `selectionchange` | `onStarter` |
| `ui/run-bar` | `active`, `tasks` | `onStopTask` |
| `ui/composer` | `active`, `composer`, `activity`; `context-builder`'s note or folder change and vault renames; document `selectionchange` | `onSend`, `onStop`, `onToggleChip`, `onRemoveChip`, `onRemoveImage`, `onOpenChip`, `onAttach`, `onImages`, `openPopover` |
| `ui/status-line` | `active`, `status`, `activity`, the usage snapshot, `settings` | `onPickModel`, `onPickEffort`, `onPickMode`, `onPickProfile`, `onRefreshUsage`, `onRunCommand` |
| `ui/announcer` | `card` and `turn` of the active tab | — |

`ui/prompt`, `ui/turn`, `ui/steps-card`, `ui/agent-row`, `ui/permission-card`, `ui/question-form`, `ui/shell-card`, `ui/event-divider` (drawn from an `EventView`, which `compactionView` supplies for a compaction and `clearView` for a clear) and `ui/error-block` are mounted by `ui/messages` or `ui/turn`, subscribe to `item:<id>` for their item, and pass their intents up. `ui/messages` also mounts `ui/working-line`, which subscribes to the tab's `activity`, `thinking` and `turn`, and `ui/held-tray`, which subscribes to `held`. Components get the popover and hover-card hosts as intents (`openPopover`, `attachHoverCard`), never by import.

`ui/dom` holds what every component shares: set-if-changed writes (`writeText`, `writeAttr`, `writeIcon`, `writeTooltip`, `writeGlyph`), keyed children (`syncChildren`), the icon-only button (`iconButton`), the radio group of the popovers (`radioGroup`) and the arrow keys it shares with the tab strip (`rovingTarget`), the row menu's pointer and keyboard events (`onRowMenu`), the image thumbnail buttons of prompts and tool results (`thumbButtons`), the open row shared by the column and the open-tabs list (`conversationRow`, `drawOpenRow`), the tab hover card shared by the strip and the column (`drawTabCard`, ticking through `TickingCards`), `Follower`, which moves a panel-level component's subscriptions to the active tab and drops them on unload, and the popover contract: `PopoverContent` (a `Component` with a title and a `render(el, picked)` returning its focus targets, loaded by the host while it shows) and the `OpenPopover` intent.

### Events

| Owner | Event | Fires when |
| --- | --- | --- |
| plugin | `settings` | A setting that reaches open panels changes (DES-001) |
| `view` | `tabs` | A tab opens, closes, moves, is pinned, is renamed, records a prompt, or changes activity |
| `view` | `active` | The active tab changes; panel-level components move their subscriptions |
| `view` | `history` | `history.onChanged` fires (DES-001 runtime wiring) |
| `view` | `export` | `exporter.onExported` fires for an open conversation |
| `ui/shell` | `layout` | Strip or column changes |
| `tab/chat-tab` | `activity` | The tab's activity changes |
| `tab/chat-tab` | `thinking` | A thinking block of the running turn starts or stops streaming |
| `tab/chat-tab` | `composer` | Draft, chips, images, or whether the tab has messages, change |
| `tab/chat-tab` | `status` | Model, effort, mode, profile, context or usage totals change |
| `tab/chat-tab` | `card` | A permission card or question form starts waiting or settles |
| `tab/chat-tab` | `turn` | A turn opens or closes, with how it ended |
| `tab/chat-tab` | `items` | Items are added to or removed from the messages model |
| `tab/chat-tab` | `item:<id>` | One item changes |
| `tab/chat-tab` | `tasks` | Background tasks change |
| `tab/edit-tracker` | `changes` | The changed-files list changes |
| `tab/restore-branch` | `restore` | The turns offering Restore files, one becoming unavailable, or a restore starting or ending |

Obsidian's workspace events and document events reach components through `registerEvent` and `registerDomEvent` directly. Usage snapshots arrive through the usage service's own subscription ([DES-007](../../current/design/DES-007-usage-and-cost.md#scheduling)). Text and thinking deltas bypass events (ADR-016).

### State machines

#### Tab activity

`state/tab`'s `activity(turnRunning, pendingCards, textBlockOpen)`, first match:

| Activity | When |
| --- | --- |
| waiting | `pendingCards > 0` |
| writing | `turnRunning` and `textBlockOpen` |
| working | `turnRunning` |
| idle | otherwise |

- `pendingCards` counts the tab's unsettled permission cards and question forms; `textBlockOpen` is true from a text block's `content_block_start` to its `content_block_stop`.
- Closing asks first while `turnRunning` or `pendingCards > 0` (PRD-001.R7).
- `tab/chat-tab` fires `activity` when the result changes.

#### Turn

`state/turn`.

- A turn opens at a message sent to Claude while no turn runs, or at the first assistant output while no turn runs (Claude Code taking up a message queued during the previous turn). The tab's turn counter goes up when a turn opens. A turn closes at `result` or session end.
- Head label by activity: working, writing and waiting give PRD-001.R15's "Working", "Writing" and "Waiting for you" with the elapsed time; a closed turn has none.
- Working line (`state/working-line`, drawn by `ui/working-line` as the last child of the messages list, after the sections, so the live end of the stream): while the activity is working or writing, wherever the running turn's head is, "Writing…" while reply text streams, "Thinking…" from a thinking block's `content_block_start` to its `content_block_stop`, else "Working…", with the turn's elapsed time as the boards' clock (`formatClock`: "0:42", "10:00", "1:02:05"); hidden while waiting and idle. Showing or hiding asks for scroll-follow; it is no live region. It is the one moving cue while Claude works: the head's mark stays still while the line shows, which is from the send on, and the head keeps its state text and clock. The boards leave the cue's place during a long reply open (Main rings the head, ClearStates draws the line at the end); the live end is chosen so the cue follows the output, with no observation of the head.
  - Below a queued prompt: the line stays last, under a prompt sent mid-turn, because the running turn's output continues there (its continuation).
- When the turn's first block is thinking, its toggle sits in the head in every state.
- Thinking toggle: "Thinking…" while streaming; "Thought for Ns" when done (N whole seconds, at least 1); "Thought process" when the time is unknown (reopened).
- `formatElapsed` gives "42s", "3m 05s", "1h 12m", for the head, the tab hover card and agent rows.
- A prompt sent while a turn runs starts a new section holding a continuation item: the running turn's body continued, without a head. The footer goes at the end of the turn's last continuation.

#### Tool-step group

`state/step-groups`. A group opens at the end of the turn's items, or of its last continuation.

| Event | Effect |
| --- | --- |
| `tool_use`, Task or Agent | Close the open group; add an agent row |
| `tool_use` of a call whose card or form already waits | No row; the card holds it, with its thread, unless it holds one |
| `tool_use`, other tool | Add a running row to the open group, opening one if none is open |
| Text or thinking block starts | Close the open group |
| A user message, panel command, `!` run or other item is added mid-turn | Close the open group of the item the turn leaves |
| A call's card or form starts waiting | Remove that call's row, if any (an emptied group is removed); close the open group; add the card |
| That card or form is answered | Task or Agent: add an agent row and open no group. Other: open a new group with the call's row first |
| That card or form is withdrawn, or its session ends | No row |
| `tool_result` | Mark the row done or error; record its end time and, for Glob, Grep and `obsidian_search`, its `resultCount` |
| `result` or session end | Close the open group; rows still running end with no mark; agents still running stop and their groups close, except in the background (`settleTurnCalls`) |

| Group | Shown as |
| --- | --- |
| One call | A single row with its own mark, no header |
| Two or more, open or a row still running | Rows alone, no header |
| Two or more, closed, no row running | Header: error mark if a call failed, else done mark if one succeeded, else none (no outcomes, as reopened without them); "N steps"; the duration from first start to last end; expanded until the user collapses it, whatever its size (`headShown`) |

- A header click expands or collapses its group; a group never collapses by itself.
- A call is placed once: a `tool_use` for a call that has a row or agent row adds none.
- A card takes out and holds its call's row, or holds the row of a `tool_use` that comes while it waits; answered, the row returns to its thread, timed from the answer; settled any other way, the card lets it go. A card answered before its call's `tool_use` came: a main-thread call's row is made from the card's tool and input at the answer, a subagent's (the request names an agent) waits for its `tool_use`, which is then the first row of a new group in its thread. A card without a `tool_use` id takes and returns no row.
- The process ending, or a restart replacing it, closes every open group, the threads' too; every row still running ends with no mark and every agent still running stops (`endProcess`), so nothing spins or ticks on.
- When a focused row is collapsed into its group or taken out by a card, focus moves to the group's header, or to its first row when it has none.
- Every card, a subagent's included, sits in the main turn and closes the main turn's open group; one that arrives while no turn runs (a background agent's request) sits at the end of the messages. A subagent call's row leaves its thread while its card waits and, once the card is answered, returns to its thread as the first row of a new group there.
- An agent's thread otherwise groups its calls by the same rules: text, thinking, Task or Agent calls and the thread's end close a group.
- Reopened conversations (`fromStored`): groups close only at stored text, thinking, Task or Agent calls and `meta` records; no durations, no counts; marks from `isError`.

#### Permission card and question form

`state/permission`; the contract, the answers and the outcome labels are DES-004's.

| Card state | Footer | Waiting highlight |
| --- | --- | --- |
| waiting | Deny; Always allow when the CLI sent suggestions; Allow | yes |
| answering: Allow or Always allow pressed in Auto-approve while the call's pre-edit read is pending (at most 5 s) | buttons disabled | yes |
| settled | the outcome label | no |

| Form state | Shown |
| --- | --- |
| waiting | PRD-002.R12's title and "N of M answered"; Submit enabled once every question has an answer |
| settled | The outcome label in place of the buttons |

#### Composer state

`state/composer`, from the tab's activity and whether it has messages:

| Tab | Placeholder | Send | Stop |
| --- | --- | --- | --- |
| No messages | PRD-001.R35's | "Send" | hidden |
| idle, with messages | PRD-001.R11's idle one | "Send" | hidden |
| working, writing | PRD-001.R11's working one | "Queue message" | shown, tooltip "Stop Claude's turn (Esc)" |
| waiting | PRD-001.R7's waiting one | "Queue message", dimmed, still sends; the card is at 0.92 opacity (`is-waiting`) | shown |

- Escape in the composer: nothing during IME composition or while a suggest or popover reports open (they take it); else, while a turn runs, `interrupt`. Stop does the same. Neither sends `stop_task`.
- The textarea is monospace while its text starts with `/`.

#### Popover and hover card

`state/popover`, one per panel. Placement and sizing are ADR-016's.

| From | Event | To | Focus |
| --- | --- | --- | --- |
| closed | Trigger activated | open (id, trigger, focus target) | The focus target: the first control, or a named one (the effort control, PRD-001.R23) |
| open | Another trigger activated | open (new id) | The new focus target |
| open | Its own trigger activated | closed | Trigger |
| open | Pointer down on its own trigger | open, unchanged | — |
| open | Escape, or an item picked | closed | Trigger |
| open | Pointer down outside the popover and its trigger | closed | Where it went |
| open | Focus moves to an element outside the popover other than its trigger | closed | Where it went |
| open | Focus leaves to nothing (the focused control was disabled or removed, as Refresh disables itself) | open | The popover's dialog element |
| open | Its trigger leaves the DOM or is hidden, or the active tab changes, except a switch the content causes itself (the open-tabs list closing the active tab: it stays open and focus stays in the list) | closed | The composer, when focus was inside the popover |

| Hover card | Event | To |
| --- | --- | --- |
| idle | Pointer enters a hover-card element, or returns onto it from a control inside it | armed, 500 ms |
| armed | 500 ms pass, the element still showing | shown (pointer) |
| armed, shown (pointer) | Pointer leaves | idle |
| idle, armed, shown | The element takes keyboard focus, other than focus a closing popover returns to it | shown (focus); pointer leave ignored |
| armed, shown (pointer or focus) | Pointer reaches another control: another hover-card element, a control inside this one, or any other interactive element of the panel (a button, a tab, a segment, a row) | idle, then armed for a hover-card element |
| shown (focus) | Blur | idle |
| armed, shown | The element leaves the DOM or stops showing | idle |
| any | A popover opens, or a row menu shows | blocked: no card arms or shows |
| blocked | The popover closes, or the row menu goes | idle |

While a popover is open its trigger has `aria-expanded="true"` and the `is-open` class. Keyboard focus is focus that matches `:focus-visible`, so a click's focus shows no card; `ui/popover-host` tells the hover-card host when a popover opens, closes, and returns focus to its trigger. An element's descendants count as the element, except a control of their own (a tab's close button), which is another control: `controlUnder` in `state/popover` decides it from the path up from the pointer's target, and the pointer entering the element while on such a control arms no card. `ui/hover-card-host` reports the control under the pointer from one `pointerover` listener on the panel root, only when the pointer moved since the last `pointerover` (a scroll or a content change under a still pointer reaches no control); it arms the element's card (`returnedFromInner`) only when the pointer returns onto it from an inner control, not on movement within it; a card shown by focus otherwise stays until blur.

### Tabs and conversation column

Each open conversation is a tab: `tab/chat-tab` with its controllers, its `ui/messages` and its render `Component` (ADR-016). A session keeps streaming into its tab while another is shown.

- New tab ("+", the column's "+", the command): mode from `defaultPermissionMode`, never Bypass (DES-004); model and effort from the last pick, else the settings; the default profile; note context per "Include note context by default"; it clears the column filter.
- Switch: store the outgoing tab's draft and scroll position; hide its messages element and show the incoming one; panel-level components move their subscriptions; scroll to the bottom when the tab was within 120 px of it, else to where it was.
- Close (close button, middle-click, row menu, Delete on a focused tab): the [confirmation rule](#tab-activity) first; then dispose the session (DES-002), flush the conversation (DES-005), remove the tab's `Component`; closing the last tab opens a fresh one.
- Strip markup (`ui/tab-strip`): Obsidian's tab markup inside `.ai-agent-panel-board`, so it draws as a native tab group: `.workspace-tab-header-container` > `-container-inner` > `.ai-agent-panel-tab-list` (the `tablist` and the scroller, since the main area clips Obsidian's inner) > one `.workspace-tab-header` per tab, holding `.workspace-tab-header-inner` (`-inner-icon` with the glyph, `-inner-title`, `-status-container` for change 003's badge, `-inner-close-button`) and the visually hidden name; after `-container-inner`, Obsidian's tab-list control `.workspace-tab-header-tab-list` holding the "All conversations" button. A tab carries `has-active-menu` while its row menu is open (the menu is parented to it, `Menu.setParentElement`); the button carries `aria-expanded="true"` and `is-open`, which the popover host sets, while the open-tabs list it opened shows. The list's inline padding of two curves holds the active tab's feet, so they never make it scroll.
- Tab geometry, set on the board as Obsidian's `--tab-*` values: height 30 (`--header-height`), corners and foot curve 9, no outline ring, every tab the same width, pinned and active ones too: the strip's width shared equally, at most 150 px (200 from a 560 px main column) and at least 76 px (`--ai-agent-panel-tab-min-width`), past which the strip overflows, 12.5 px titles, 600 on the active tab; strip `strip`, active tab `bg`, hovered tab `line-strong`, divider `line-strong`; feet only on the active tab, under its content so a focus ring paints whole; text muted, active and hovered `text`. ADR-017's override table holds the only `!important` declarations, so the tab draws the same in the main area, a stacked group, a sidebar and a pop-out.
- Tab item: pin glyph when pinned, else `dotState(activity)` (working or writing: pulsing accent; waiting: steady warning color, titled "Waiting for you"; idle: none), the pin taking the dot's state, before the title; close button on hover only, with no fill, over the title's end, which fades under it (the button is positioned, so it paints over the title, whose fade mask is a stacking context, and takes every click in its 18 px box). Its accessible name is the title, then "pinned" and the state in words.
- Tab hover card: PRD-001.R7's lines, the prompt count from `state/prompts`, the elapsed time from `formatElapsed`, ticking while shown, and the conversation's cost per [DES-007](../../current/design/DES-007-usage-and-cost.md#cost-and-tokens).
- Reorder: HTML5 drag among unpinned open tabs, in the strip and in the column's Open section; the list re-syncs on drop; renders wait while a drag runs.
- Strip overflow: a vertical wheel scrolls it sideways while it can move; a tab dragged within 28 px of an edge scrolls it. The active tab, on a switch or a resize, scrolls clear of the edge fades (the list's padding and the 20 px gradient), never past either end.
- All conversations (Obsidian's tab-list control, strip layout only): shown while the strip overflows (the list's `scrollWidth` above its `clientWidth` by more than 1 px), read by the resize pass (run on resize and on `tabs`, so on a tab opened, closed or renamed) with the control as drawn: hidden, it shows once the tabs overflow without it; shown, the list is narrower, so it hides only once they fit beside it; toggling it never undoes itself. Geometry as Obsidian's: an 18 px `chevron-down` 4 px in (26 px), radius 4, 2 px from the strip's end, centred in the 30 px header, in the icon-button colors, `is-open` drawing the hover fill (`aria-haspopup="dialog"`). The button opens the open-tabs list through `view`, as the switcher does, down from the top region with its end edge on the button's; a picked tab scrolls into view on the next pass. The control is hidden in the column layout (no strip) and below a 360 px main column (the switcher); the popover host closes the list when its trigger hides.
- Switcher (main column below 360 px, strip layout): state dot, active title, count badge; labelled "Switch conversation, N open"; opens the open-tabs list.
- Open-tabs list (`ui/switcher`'s popover content, a menu popover titled "Open conversations", opened by `view` for the switcher and for All conversations): a `list` of every open tab in `openTabsList` order (pinned first, then drag order), then "Previous conversations…" in the footer. Each row is the conversation column's open row, built by `conversationRow` (`ui/dom`) with the column's classes: the tab glyph under the row's `data-state` (pin or dot, the pulse and the waiting color as on the tab), the title, the visually hidden name (`tabItem`'s label), `is-active` on the active row and `aria-current="true"` on its main button, and the close button at the row's end (shown on hover, on the active row and while the row holds focus; `tabindex="-1"`, tooltip "Close <title>"); no time, pin button, drag, row menu or hover card. The rows are one tab stop, the active row's. A click on a row selects its tab and closes the list. The close button, or Delete on a focused row, closes the tab through the intent the tab's close button uses (the confirmation rule first); the list stays open and redraws on `tabs` and `active`, focus moving to the row now in the closed row's place, else the row before it. A close that asks for confirmation moves focus to the dialog, and the popover host closes the list.
- Persistence: open ids and the active id on every change, under DES-005's open-tabs key. View open reloads each from history, drops ids that no longer load, re-selects the active one, and opens a fresh tab if none remain. Drafts, chips and images are not kept.

Conversation column (`ui/conversation-column`):

- `columnEntries` merges the open tabs with `history.snapshot()` minus what is open; `groupConversations` sections them per PRD-001.R9 (open pinned tabs under Pinned; future times count as Today).
- Rows are a keyed list. `conversation-list`'s key covers row identities and positions, history-row times, filter, collapsed sections, scan state and the current minute; an unchanged key writes nothing.
- Open and pinned rows: pin or state dot, title, close button on hover and on the active row. Recent rows: muted title and relative time, no close button, described by "Last active <time>".
- The filter matches titles case-insensitively; Escape clears it; it is not stored. Section collapse is stored on this device (DES-005).
- Row menu (right-click, a 500 ms touch hold, Shift+F10 or the context-menu key): an Obsidian `Menu` with PRD-001.R9's entries. At most one is open, for a tab or a column row: opening another (`onRowMenu` stops the `contextmenu` event that would make Obsidian hide the open one) hides the open one first, and `showRowMenu` blocks the hover cards while it shows (`onMenuShow`, `onMenuHide`). Each row has a hover pin toggle labelled "Pin" or "Unpin".
- Rename (`Rename…`, pencil icon, after Pin or Unpin; `onRename`): the `RenameModal` of `confirm-modal` (themed like every modal), titled "Rename conversation": a text field holding the title shown (`displayTitle`), selected, and the buttons "Cancel" and "Rename" (`mod-cta`, disabled while the field is blank). Enter (outside IME composition) or "Rename" closes it and, unless `renamedTitle` (`conversation-list`) is null, calls `main.renameConversation`; Escape or "Cancel" changes nothing. `renameConversation` sets the title on every view's own object for that id, else on a copy loaded from disk and re-checked after the load, saves with `touch: false` and has each view redraw the tabs it holds (DES-005 Rename).
- Pin: the open tab's own conversation, else a copy loaded from disk and re-checked after the load; `pinned` and `pinnedAt` saved without moving the last-updated time; a conversation without messages is not written (DES-005).
- Delete: `onDelete` to `view`, which confirms with `DeleteConversationModal`, calls `history.delete(id)`, and detaches open tabs only when the file is gone (PRD-001.R10).
- "Previous conversations" (command palette, header history button, "More"): `ConversationPickerModal` per PRD-001.R9 and R10; picking switches to the conversation's tab when open, and reuses the active tab only when it has no conversation and no session and nothing is in flight there (its CLI starting, a turn, a `!` run or a usage command, a waiting card: `reopenReusesTab`, `state/tab`), since what finishes there later would be drawn and recorded into the reopened conversation; otherwise it opens in a new tab.

### Header and changes bar

| Layout | Main column | Header |
| --- | --- | --- |
| Strip | from 360 px | Tab strip, "+" (New conversation), divider, history (Previous conversations), settings (Plugin settings) |
| Strip | below 360 px | Switcher, "+", "More" |
| Column | from 360 px | Title block, settings |
| Column | below 360 px | Title block, "More" |

- Title block: the active conversation's title, then its prompt count and start time.
- "More" popover: PRD-001.R30's entries.
- The changes bar (`ui/changes-bar`) shows while the conversation has changed files or an exported note: the changes chip `N files +x -y` (below 360 px `+x -y`; described by "Show the files this conversation changed") and "Transcript" (described by "Open the exported note"): a labelled button on the bar, icon-only with the tooltip "Transcript" in the header row, in "More" below 360 px. The bar is 8 px above and 9 px below its chip (the board's line under it is the ninth). When the bar starts or stops showing chip or Transcript, it requests a resize pass ([Layout model](#layout-model)), since in the header row it changes the strip's room and so its overflow.
- Changed-files popover ("Files this conversation changed"): one row per file with its `+x -y` and "new" for a file the conversation created, opening the file (`Note not found: <path>` when it is gone); "Review changes" opens `SessionChangesModal` (DES-004); "Restore to before turn N" per PRD-002.R18, disabled while a turn or a restore runs, left out while the change list is empty. While open it follows the tab's `changes`, `turn`, `status` and `restore`.
- "Restore to before turn N" runs Restore files (DES-004) for the earliest turn, in the order recorded, whose Restore files shows. N is the number of the prompt that opened that turn, which `state/prompts` finds from the turn's `meta` record: the turn's records start after the previous `meta` record, and its first output is Claude's text, thinking or tool call, a panel command's card not counting; the opener is the turn's first prompt recorded before that output, else the last prompt recorded before it (a prompt Claude Code took up after the turn it was sent in). `tab/restore-branch` takes every such record of a reopened conversation before the reopen draws any, since older sections draw later ([Reopen](#reopen)), and a finished turn's at its `result`; each keeps its N, so a detached conversation keeps it. After the open conversation is deleted from history, the tab records its next message in a new conversation but keeps numbering its prompts, so a later turn's N adds the deleted record's prompts, and a turn running at the delete takes the last of them.

### Messages

#### Stream to messages

`state/stream` reduces each message to changes in the tab's messages model; `tab/chat-tab` applies them and fires `items` or `item:<id>`. Messages carrying `parent_tool_use_id` are subagent traffic.

| Message | Effect |
| --- | --- |
| `system/init` | Model segment label; mode noted (DES-004); alias resolution learned; `slash_commands` fallback; session id and model saved (DES-005) |
| `system/task_started`, `background_tasks_changed`, `task_updated`, `task_notification` | Run bar tasks; agent-row totals |
| `system/status` | `compacting`, or a null status with `compact_result`: the [compaction divider](#compaction-dividers). Otherwise a mode change (DES-004) |
| `system/compact_boundary` | The divider's counts, and its record ([compaction dividers](#compaction-dividers)) |
| `stream_event`, main thread | `content_block_start` opens a text or thinking block; `text_delta` and `thinking_delta` go to `ui/turn.appendDelta`; `content_block_stop` ends the block |
| `stream_event`, subagent | Ignored |
| `assistant`, main thread | Per block: text finalized, thinking closed, `tool_use` to a step row or an agent row |
| `assistant`, subagent | The agent's thread |
| `user`, main thread | The first echo without a `tool_result` gives the turn's uuid (Branch); `tool_result` blocks settle rows; a message with `isSynthetic: true` is the compaction summary, never the uuid; a replayed `<local-command-stdout>` message (a manual `/compact`, a model change) is neither, so a `/compact` turn has no uuid and no Branch control |
| `assistant`, main thread, model `<synthetic>`, text "Compaction canceled." or "Error: No messages to compact" | The CLI's compaction notice, not a reply ([compaction dividers](#compaction-dividers)) |
| `user`, subagent | The thread's rows settle; the subagent's prompt (no `tool_result`) is ignored |
| `result` | Open blocks finalized; turn closed; usage (DES-007); turn record (DES-004); context lookup (DES-007) |
| any other type | Ignored |

- A finalized text block is rendered from the `assistant` message's complete text through `ui/markdown`; if rendering rejects, the plain text stays; empty text removes the block.
- Scroll-follow (`ui/messages`): at most once per frame, and only while the view follows its end (`followsEnd`, `state/tab`). A scroll up of more than 1 px that the user makes leaves it, however near the end: the scroll after a wheel up, PageUp, ArrowUp or Home outside a text field (`scrollsUpByHand`), or while the scroll bar is held; one nobody made (the end coming up as content shrinks) keeps it while within 120 px. A scroll down to within 120 px of the end rejoins it; scroll anchoring's moves are downward and keep it; content that grows below the view (Markdown, fences and embeds settling) scrolls nothing and keeps it. The panel's own jumps (rail, pinned prompt, a plan's reveal) follow only when they land within 120 px. When the messages host changes height (the composer growing or shrinking), a view that follows its end is put back at it before the paint (`keepEnd`). A user send forces a follow, unless the view moved up or a jump of the panel's own left the end before its frame; a hidden tab skips it.
- Errors outside a turn (CLI not found, spawn failure, exit) are error blocks of up to 2000 characters (DES-002); a reopen draws the recorded error a session ended with (a `meta` record holding only its error) the same way, after the turn it closed.
- A turn that ends without a `result` (the CLI exits, a send fails, the tab or the view closes) records its end, a `meta` record holding only `turn` (DES-005); a reopened file that left its last turn open gets that record before the next prompt.
- A reopen builds turns by the same rules from the stored order: a `meta` record closes the turn; a prompt recorded between a turn's output and its `meta` record was sent mid-turn and starts a continuation, which for a file from before turn ends were recorded can also be a prompt sent after a turn that never ended; a turn the file leaves open is closed. Reply text is recorded when its block finishes, so text that was streaming when a prompt was sent mid-turn reopens after that prompt.

#### Reopen

- `state/tab` builds the whole messages model from the stored messages first, without timing, counts or recording (DES-005).
- `ui/messages` then renders whole sections newest first, reading the height once per section, until the messages hold two view heights, and scrolls to the end.
- Older sections follow in `requestIdleCallback` chunks (from the element's window, `timeout: 250`): whole sections until at least 20 messages or under 4 ms left. Scroll anchoring keeps the position as they are prepended (ADR-016); what grows below the view as the first screen's Markdown, fences and embeds settle, which anchoring does not cover, is scroll-follow's.
- Chunks run only while the tab shows, so nothing moves under a hidden tab's saved scroll position; a tab reopened while hidden, where nothing has a height, draws its first screen when it shows, before its scroll position is restored. A jump to a prompt not yet drawn draws the sections down to it at once.

#### Markdown and links

- `ui/markdown` is the one Markdown path: `cutForRender` (`inert-markdown`), `MarkdownRenderer.render(app, markdown, el, "", tab Component)`, then the placeholders swapped for inert elements (DES-001 [rendering boundary](../../current/design/DES-001-system-overview.md#rendering-boundary)). It renders replies, recorded report cards, subagent text, the plan on a card, and the diff view's Rendered toggle (as a callback). `MarkdownRenderer.render` only appends children, so the containers do not carry Obsidian's `markdown-rendered` class and Obsidian's code rules never apply; `styles.css` gives each container (reply and subagent text, plan, report, diff preview) its code: `pre` takes `--code-background` (re-declared for the panel's mode), a 1px `--ai-agent-panel-line` border (the value `--code-border-color` takes), padding `space-10 space-12` and `radius-4`; inline `code` takes `--ai-agent-panel-fill`, padding `space-1 space-5` and `radius-5`, as the boards' `.md code`. Every other string reaches the DOM through `createEl`, `setText` or `appendText`.
- `ui/messages` delegates `click` and `auxclick` (left and middle) on each messages element:
  - Vault link (`data-href`, or `href` on `.internal-link`): a bare `#heading` is ignored; the target resolves through `metadataCache.getFirstLinkpathDest` as written, percent-decoded and without a leading slash; resolved, `openLinkText`, in a new tab on middle-click or a modifier click; unresolved, PRD-001.R17's Notice.
  - Any other link: `preventDefault`, then `window.open(href, "_blank")` only for `http`, `https`, `mailto` and `obsidian`.
- Hover on a resolvable vault link triggers `hover-link` with the view type as source (page preview, DES-001).

#### Prompts

- Each user message starts a section of the messages, and so does a clear's divider unless the `/clear` message just before it (which started its own) is there to take it (`opensSection`).
- `state/prompts` numbers the user messages sent to Claude across the conversation; a panel command (`parsePanelCommand`) or a `!` run gets no number. Those, and a prompt sent bare such as `/compact` (which keeps its number and pin), show as a compact monospace message (`isCommandBubble`); in Card a bare prompt shows its number box beside the bubble, in Bubble none. The context label is `contextName`: the note, then "N lines selected" while the note chip is on and the editor has a selection, then the folder and the rest; it is drawn with a 12 px icon (`contextIcon`: a file for a note, a folder for a folder alone, none for "links & properties" or "N attached"). The numbered head and the pin read "N lines" (`splitSelection` leaves out "selected"); the line under a bubble reads "N lines selected". Prompt text has line height 1.55.
- `promptLayout(style)` (`settings-core`) decides what a style shows: `{ numbered, rail }`. `ui/shell` writes it as root classes: `mod-prompt-numbered` for Card, or `mod-prompt-bubble`.
- Every prompt surface reads the prompt color in effect through three tokens, `--ai-agent-panel-user-bg` (fill), `-user-line` (border) and `-user-ink` (the number box's outline, "You", the current rail tick), never a named color; the scope root's `mod-prompt-color-<color>` class picks them (ADR-017 Prompt color, [Token contract](#token-contract)). The prompt's text keeps `--ai-agent-panel-text`.
- Card (the default): full width; `user-bg` fill and 1 px `user-line` border; head with the number box, "You", the send time as HH:MM when recorded (DES-005), and the context label right-aligned and cut with an ellipsis (the bubble's separate context line does not exist here); then the text at weight 400. The number box: no fill, a 1 px `user-ink` border, `text` digits, radius 5, at least 18 × 18 px; "You" in `user-ink`. Clear is this card with a transparent fill.
- Bubble: right-aligned, at most 86% wide (94% below 360 px), `--ai-agent-panel-user-bg` fill and `-user-line` border, the context label under it, "You" visually hidden.
- A prompt sent while a turn runs is marked "queued mid-turn"; whether the CLI steers the turn with it or queues it depends on the CLI's version.
- A prompt of a branch whose rewind failed (PRD-002.R15) is marked "Not sent" (`notSent`, `markNotSent`), live and on reopen (a stored branch failure with `branchTarget`): in the head's meta text in Card, under the bubble in the queued line's faint meta style in Bubble.
- Every prompt has a copy button (raw text), shown on hover and on focus within the prompt.
- Pinned prompt (setting on): a numbered prompt's section starts with a sentinel and a pin, a zero-height `position: sticky; top: 0` band of opaque `--ai-agent-panel-bg` with 8 px above and below, holding a bar drawn as the prompt (Card: padding 9 12 11, the head of number, "You", time and context, then the first line (`promptTitle`: a line over 80 code points is cut at a word break within the last 12, else at the limit, and ended by "…", 80 in all) clamped to one line; the user fill and line over the background; Bubble: the text alone in the bubble's shape, right-aligned) with `--ai-agent-panel-stuck` under it; the button's name is "Scroll to prompt", the number and the text, the rest of the head being `aria-hidden`; the prompt itself stays in flow, so sticking reflows nothing. `ui/prompt` owns one `IntersectionObserver` per messages element, its root reaching far below the view so that a sentinel leaves it only across the top edge, and sets `is-stuck` on a pin while its sentinel is above the top (a section scrolled to its start counts). The pinned prompt is the last stuck one; only its pin shows and takes focus, every other pin is `aria-hidden` and inert. A click on the pin scrolls to its section's start.
- Jump rail (Card with the setting on): one `ui/jump-rail` on the messages host's right edge, following the active tab; the messages reserve its width.
  - The rail always reflects the active tab's prompts (`RailDrawn`, `state/prompts`, forgets what was drawn on every tab switch): a tab switch redraws it, and a tab with none has no ticks and the rail is hidden.
  - One tick per numbered prompt at the prompt's `offsetTop` over the messages' `scrollHeight`; before a prompt is drawn, at its index fraction.
  - Re-read when the messages content resizes (toggles, settled Markdown, rendered chunks) or the main column does; resizes while a text block streams wait for its `content_block_stop`. A tick is written only when it moves by 1 px or more.
  - The pinned prompt's tick and a hovered tick take `--ai-agent-panel-user-ink`.
  - A tick is a button labelled "N · <first line>" (`tickLabel`, the pin's `promptTitle` text), the same text as its 400 ms tooltip; activating it scrolls to the prompt.

#### Turn head, thinking and footer

`ui/turn` draws one turn: head, its items in model order (text and thinking itself; groups, agent rows, cards through their components), footer. A continuation is the same component without a head.

- Head: the agent mark (`state/agent-icon` glyph, in a 22 px accent-soft tile, 7 px radius, 12 px icon), "Claude", the [turn](#turn) head label, elapsed time (11 px) right-aligned. The tile rings while the turn runs and no card waits (`headRings`): a 7 px accent-line shadow fading out, 1.6 s ease-out.
- Working line: the same tile holding a loader (12 px, spinning 1 s linear), the [turn](#turn) working-line label (12.5 px, muted, one line), elapsed time (11 px mono, faint) right-aligned; a section gap below the item before it. Under reduced motion the ring, the loader and the step dots stand still.
- Thinking: toggles per the [turn](#turn) rules, collapsed; a click shows or hides the text. A block with no text beyond whitespace (redacted, or before its first delta) shows its label as plain text: no button, chevron or ARIA state, and nothing to expand; its first delta turns it into the toggle (`state/turn` `thinkingExpandable`). The time is measured from `content_block_start` to `content_block_stop` and not stored.
- A streaming text block is a card (surface, 1 px line, 12 px radius, 12 px 14 px padding, 13.5 px, line height 1.6) with a caret (7 by 15 px, accent). `appendDelta(blockId, text)` keeps the text and asks `RenderThrottle` (`state/stream-render`) for a render: at once for the first delta, then at most every 250 ms, or 4 times the last render's cost when that is longer, with a trailing render after the last delta. A render goes into a scratch element through `ui/markdown`, under a component of its own, and is swapped in whole (the previous render's component unloads then); no render runs while the block is off screen or its window in the background (`RenderThrottle.setHidden`), and one follows when it shows; one still running when the block settles is dropped (`renderSeq`). If a render rejects the text stays plain (`is-plain`, pre-wrap). Thinking text is appended to its one text node.
- Reply Markdown: paragraphs 0 0 10 px apart, lists 0 0 10 px with 18 px indent, items 3 px apart, markers faint, links underlined in the accent line colour 2 px off; code in the mono family at .86em, inline and in `pre`.
- Footer, always visible once the turn closes: "Restore files" (DES-004 `restoreButtonState`), "Branch" (once the turn uuid is known), a copy button (24 px, 12 px icon; all the turn's reply text blocks joined by blank lines), and right-aligned the duration to one decimal and the turn's cost to three decimals, "<$0.001" when above zero and below that (`footerFiguresText`, PRD-005.R7), or `Error: <message>` up to 500 characters. Below 360 px the labels hide.
- For a turn finished since the conversation was opened, the duration and cost take focus and their hover card shows PRD-005.R7's token rows and note.
- Restore files is named by its label and described by "Put the files Claude Code tracked for this turn back as they were". Branch is named by its label and described "Branch from just before this turn, in a new tab" (`BRANCH_TITLE`, `state/branch-history`), or by the reason it is disabled (DES-004 Branch). For both, the tooltip is the title (Restore files' its label, Branch's `BRANCH_TITLE` or the reason), shown only below 360 px, where the label hides.

#### Tool steps

- Row: the tool's icon in a tile (`toolIcon`, a vault tool's own), `toolDisplayName`, `summarizeToolInput` (96 characters), a mark (three pulsing 4 px dots while it runs, 1.2 s, offset .2 s; error; none once done: a done row keeps only its accessible name "Done"), a file path vault-relative when inside the vault (`toVaultPath`), the live count ("N files", "N results", "N notes"; hidden below 360 px), and for edits `+x -y` (PRD-002.R6), each figure only when not zero.
- `resultCount`: the count the first line states in a known phrasing (Grep's "Found 1,234 files", `obsidian_search`'s "12 note(s) matched"), 0 for a first line starting "No ", else the non-empty lines but Glob's truncation note and Grep's "Found N total occurrences" line; never a number in a file name; "1 file", "1 result", "1 note" for one. A failed call has none.
- A group's duration is `formatElapsed` of first start to last end, in the faint UI font. The head is 34 px with the count in weight 500 and a 12 px chevron that turns up while expanded; rows are 30 px with 22 px tiles (6 px radius, 12 px icon) and, in a group, a 1 px `line-strong` rail through the tiles.
- A row click toggles its details: "Input", the input as JSON (2000 characters); for an edit that did not fail, its diff (`diffview`, DES-004): from the file as read to the file now on disk once it landed, else of the call's own strings (while it runs, and reopened); otherwise "Result" and the result (1500 characters); result images of PNG, JPEG, GIF or WebP from base64 data, live only, as thumbnail buttons that open the [image viewer](#image-viewer). Drawn while shown, and again when the row changes.

#### Agent rows and run bar

- Agent row (`ui/agent-row`): bot tile; label (the task description, else "<type> agent", else "Subagent", each cut to 96 characters); type, models by their short names, tool count, tokens; elapsed, ticking while running and shown; status as icon and text: "Running", "Done", "Failed", "Stopped". A button with `aria-expanded`; expanded, `ui/turn` draws the thread's replies, thinking and grouped calls into the row's body, first when it is first expanded. A reopened row has no thread and no button. A slot after it waits for change 003's per-agent stop.
- Status: running from the call; its `tool_result` ends it, done or failed, unless it runs in the background (`run_in_background` in its input, or a running background task with its `tool_use_id`), which only `task_notification` or the process ending ends; one not in the background still running when its turn ends stops.
- Running tokens are input plus output plus cache-creation tokens from the subagent's messages, and the tool count its `tool_use` blocks; `task_notification` (same `tool_use_id`) replaces them with the CLI's totals, tool uses, duration and status (`completed` done, `failed` or `error` failed, any other stopped).
- A thread whose Task or Agent call is not in the messages shows its agent row on its own: in the running turn, else at the end of the messages, following its thread's growth as a turn does. A row put on the page asks the ticker to look again, so it ticks where no turn head runs.
- Run bar (`ui/run-bar`, above the composer): the active tab's background tasks: `task_started` adds, `background_tasks_changed` decides what still runs, `task_updated` patches, `task_notification` removes, the process ending clears; each shows a bot icon for an agent (`local_agent`), else a loader, its description, else its subagent type, else "Background task", and Stop "Stop this background task" (`stop_task`; failure text per PRD-001.R18).
- Threads and tasks are live only (PRD-003.R3).

#### Cards

- Permission card (`ui/permission-card`): `role="group"`, named "Permission request" and described by its title; content, bounds and answers per DES-004's card contract; a head of tool icon tile, title, description and, for an edit, a sub-line of the folder (`cardLocation`) and `+x −y`, with the Diff / Rendered tabs (`role="tablist"` named by the card title, in a diff head by its path, of `tab`s with `aria-selected`, a roving tabindex and a Rendered panel that exists from the start and fills on first use; arrow keys, Home and End through `state/roving`); the tablist, diff grid and gap button are the same in step-row and changes-modal diffs at its end; the diff edge to edge on a recessed band; a footer of "Full input" (a disclosure button that shows the raw input) then Deny, Always allow and Allow (check icon) in one end-aligned group that wraps together; the waiting highlight while waiting; footer per the [machine](#permission-card-and-question-form). `ui/turn` mounts it, and `ui/messages` for a card outside a turn; a card starting to wait is followed into view, and an ExitPlanMode card is brought back into view once its plan renders unless the user scrolled away.
- Question form (`ui/question-form`): `role="group"` named by its title; per question a fieldset, its legend the header chip and the text, options as native radio or checkbox cards with descriptions, "Select all that apply" for multi-select, and an "Other…" field named "Other answer" (multi-select options in two columns, path-like labels in the code font); Dismiss and "Submit answers"; behavior per DES-004. Mounted as the card is.
- When a pressed button gives way to the outcome label, focus moves to its card or form.
- Shell card (`ui/shell-card`): a `shell` item, a `group` named "Shell: <command>", the `!` run (DES-004) that `tab/shell-escape` runs, the card importing `bash`'s `ShellResult` as a type only: "Shell", once ended the duration to a tenth of a second, status as icon and text, "exit N" followed by hidden ", succeeded" or ", failed" (`shellStatus`, `state/tab`: "running", then "exit 0", "exit N", "failed" (it could not start, or was killed with no exit code), "timed out"), stdout and stderr as text (a leading commit hash in amber, `state/shell-output`), each capped at 20 lines' height and scrolling, or "No output."; once ended, "Add output to chat" (`tab/shell-escape` formats the run for the composer) with PRD-002.R16's note beside it.
- Error block (`ui/error-block`): the error text, `role="alert"`.
- Branch note: a `note` item, drawn by `ui/messages` as text (PRD-002.R15); live only.

#### Compaction dividers

PRD-001.R37; the wire shapes are E3 and V5 (ADR-018). `state/compaction` reads each compaction message as a signal; `tab/chat-tab` applies the step it returns, one divider per compaction, as a `compaction` item outside the running turn. While the turn has no block yet (a `/compact`, or an automatic compaction before the model request, E3) the divider goes before the turn's item, so it follows the prompt and the reply follows it; otherwise it goes at the end and the turn goes on in a continuation after it (as after a `!` card). The turn's next compaction starts a new divider.

| Signal | Divider | Record (DES-005) |
| --- | --- | --- |
| `system/status` `compacting` | A status: "Compacting automatically…", or "Compacting…" in a turn the user started with `/compact` or queued behind a running one (`queueSend`, `nextTurn`: each result takes the next queued send's flag); sub-line "Context N% full · Claude picks up where it left off", the percentage being the last known one and left out with its dot when none is | None |
| `compact_result: "success"` | A separator: "Compacted", sub-line "14:20 · 131k → 18k tokens" (time of the report) | None |
| `compact_boundary` | Fills in the trigger and the counts, and makes the divider a separator if the success has not come | Added, with the time, the trigger and the counts |
| The synthetic summary (`isSynthetic` user message), once, after the compaction is reported | A "Summary" toggle opens "What Claude kept" with the text | `summary` added to the record |
| `compact_result` other than `success` | A status, "Compaction did not finish." in the warning color | None |
| The CLI's notices, `<synthetic>` assistant messages "Compaction canceled." and "Error: No messages to compact" (V5) | Not a reply: "Canceled" adds nothing after a failure; the empty-session notice is the failure itself | None |
| The turn ends while still "compacting", or a `/compact` turn ends with no compaction message | The same failure text, in place of the status or as a divider of its own | None |

A count the CLI did not report is left out of the sub-line and the name; no summary, no toggle. After the turn ends a summary is dropped, so a record is only ever completed by its own process and turn (ADR-018). A turn that held only a compaction (a `/compact`) closes with no head and no footer: its prompt, then the divider; its turn record is still stored, so its cost counts in the conversation's totals (`closeTurn`), and a turn that ended in an error keeps its turn.

Drawing (`ui/event-divider`, a divider drawn from a generic `EventView` of phase, role, tone, icon, label, sub-line, name and optional summary, so another event reuses it; redrawn on `item:<id>`; one status element created empty and its text set afterwards, then changed in place): a pill, 24 px high, between two waves; the pill's ring and fill follow the accent text color (the warning color when it failed), its label the text color; the icon is a 12 px spinner while compacting, `fold-vertical` once compacted. The waves are masks of a repeated 16 × 8 px curve with `currentColor` strokes, at .55 opacity; while compacting they run at .9 s, the second against the first, and not under reduced motion. The item has a 2 px vertical margin on top of the section gap. The sub-line's figures are in the mono font at .92 em. The rule (the line holding waves and pill) is `role="status"` while compacting or failed and `role="separator"` once compacted, named "Compacting automatically" or "Compacting", "Compaction did not finish", or "Compacted at 14:20, 131k to 18k tokens" (PRD-001.R28); the sub-line of a separator is hidden from assistive technology so the name is not read twice, and the "Summary" button (`aria-expanded`) stays outside the separator. The summary is rendered through `ui/markdown` as a reply is (PRD-001.R17), in a box 10 px under the sub-line with tight bullet lists, and is a tab stop so a long one can be scrolled by keyboard. Reopen draws the stored record as a finished divider; the exporter writes it as one italic line (DES-005).

#### Clear divider

PRD-001.R38, PRD-003.R9. A stored `clear` record reopens (`modelFromStored`) as a `clear` item outside any turn, after the messages it cleared, drawn by the same `ui/event-divider` from `state/clear-divider`'s `clearView`: the warning-colored pill with an `eraser` icon and "Context cleared", the sub-line "14:02 · Claude can't see anything above" (the time and its dot left out when the record has none), and a `role="separator"` named "Context cleared at 14:02" (just "Context cleared" without a time). It has no Summary toggle. On the latest clear while it offers Undo (DES-002 Undo of a clear), the sub-line ends with an "Undo" button after "Claude can't see anything above": an `undo-2` icon and the word, 20 px high, radius 5, `--text`, an inset 1 px `--line-strong`, the mock's `lnk strong`. It is `aria-disabled` and titled "The cleared session is not available on this device" when the session is not this device's, and `aria-busy` and titled "Undoing the clear" while an Undo runs; neither presses. While the tab cannot start one it is disabled with the reason as its title: "A turn or background task is running", "A restore is running", "Claude Code is starting", "A mode or model change is pending". It is absent while the clear's own answer has not settled. The latest divider draws again (`ChatTab.refreshClears`) when a clear completes and settles, an Undo starts or ends, a turn, restore or pick starts or ends, or a message is sent. The exporter writes the italic line "Context cleared at 14:02" (DES-005). A `fresh-start` record draws nothing. The turns before a clear show no Restore files button (DES-004 Restore).

#### Dimmed and folded segments

PRD-001.R38, PRD-003.R9. `state/segments.planSegments` reads the sections of the messages model (`sectionsOf`) and returns which items are dimmed and which folds exist; `ui/messages` applies it per drawn section, when the model is drawn (live or reopened), when a `clear` item is added and when an item is removed. The section holding a clear (its divider and the `/clear` message before it) is a boundary; every other section above the last boundary is dimmed, an earlier boundary included in neither.

- Dimmed: the section carries `is-before-clear` (its children dim to opacity .42, .75 on hover and focus within; the pin is not dimmed as a whole, because it hangs over the next section: its band stays opaque and only its bar dims the same way) and is a `role="group"` named "Before the clear. Claude no longer sees these messages."; its copy and Branch actions stay.
- Fold: in each run of sections between boundaries, more than four messages (a prompt of any kind, a reply, a command, a `!` run; never a continuation) fold everything before the run's last prompt of any kind (to Claude, a command or a `!` run) behind one pill; that prompt and all after it (its reply, continuations, footer, later sections) stay visible. The pill reads "N earlier messages" (N the messages folded), is 26 px high, centered, with `chevron-up`, 11.5 px faint text on a 1 px inset line, and sits in the place of the fold's oldest drawn section. The run in progress after the last clear never folds. Folded sections are drawn hidden (`is-folded`), so unfolding is a class change; they are skipped by the reopen's first-screen loop and drawn by the idle chunks, and their prompts are not watched by the pin. A pill unfolds its fold for good (until the model is replaced), found by `Fold.key`, the id of the fold's first item, which a replan keeps; pressing it from the keyboard moves focus to the first control the fold revealed. Drawing or moving a pill, and the idle chunks, ask the rail for a pass.
- Rail: a folded prompt's tick sits at the pill (`Messages.railAnchor`); pressing it opens the fold and scrolls to the prompt (`scrollToPrompt`). The folded prompts share that point (a folded prompt has no height), so the topmost tick is the one pressed.

#### Empty conversation

`ui/empty-state`, while the tab has no messages: PRD-001.R35's heading and line, then the starters `state/prompts` returns for the active note and editor selection. The link starter is labelled "Find notes that should link here". The heading has margin 18 above and 6 below, the line is at most 300 px wide, and the first starter names the note's file with its extension. A starter puts its prompt into the composer without sending. The hero and starters centre in the whole messages area; the board's 250 px bottom padding exists only to clear its open `@` list and is not reproduced. The starters are re-evaluated on `active-leaf-change` and on `selectionchange`, coalesced to one per frame, while shown.

### Composer

`ui/composer`: the composer card (chips row, textarea, footer: attach "Attach a file as context", commands "Show commands", inline chips, Stop, Send) over the status line. The card is a grid and its footer `display: contents`, so the one chips row sits above the textarea or after the commands button by grid areas, with no element changing parent; the chips row comes first in the Tab order either way.

- The textarea grows with its text from two lines to 16em, then scrolls, and shrinks back as text is removed or sent (`field-sizing: content`; below Chromium 123 it stays two lines); one line in the short-height form; no resize grip. The card carries the panel shadow, plus a 3 px accent-soft ring while it holds focus. The commands button is active (accent-soft fill) while the slash list shows.
- Enter sends unless Shift is held or IME composition is active; Shift+Enter inserts a newline. Open suggests take Enter, Tab, the arrows and Escape first.
- A message sent mid-turn goes straight to the CLI without a context block and joins the running turn. A `/clear` sent mid-turn is [held](#held-messages).
- Stop and Escape: [Composer state](#composer-state). An interrupt the CLI does not confirm within 15 s shows nothing and leaves the turn running until `result` or exit.

Send path (`tab/chat-tab`), in order:

1. A restore of this tab is between its preview and its end: return, leaving the text in the composer (PRD-002.R14). While a `/clear` is held, a written `/clear` awaits the CLI or an Undo runs (`ClearFlow.holds`), the message is [held](#held-messages) with its images and context, and the composer empties; each further message is held behind it, in order.
2. No text and no images: return.
3. `/clear` (`parsePanelCommand` name `clear`): not a panel command's card. While a restore is under way, say so in a note and return, leaving the text in the composer. Text after `/clear` asks "Clear the context?", "The text after /clear is not sent.", Clear and Cancel (`ConfirmModal`); Cancel returns, leaving the text. While an agent or a background task runs, ask [Stop and clear](#stop-and-clear-dialog): Cancel returns, leaving the text; "Stop and clear" takes the text and calls `ClearFlow.stopAndClear`. Otherwise, while a turn runs, hold the `/clear` ([Held messages](#held-messages)), else take the text and call `ClearFlow.request`. A replayed held message runs this path again (`deliver`), so a restore or a clear that began meanwhile holds it once more.
4. `parsePanelCommand` matches: `tab/panel-commands` runs it; nothing reaches the model.
5. Text starts with `!`, the escape is on and a command follows: `tab/shell-escape` runs it (DES-004). A lone `!`, or `!cmd` with the escape off, continues as a message.
6. `queued` = the tab's session is busy.
7. `tab/session-link` ensures a session (DES-002); return if none could be created, or if a restore began meanwhile.
8. `planSend` decides what the message carries; unless queued or bare (`isBareMessage`), `context-builder` prefixes the context block.
9. Add the prompt item with its context label and send time: unless queued, a turn opens after it; queued, it starts the running turn's continuation. Record it (DES-005), clear the input and the images sent. A bare message sends no images; they stay for the next message that is not bare.
10. `session.send`: the text, or the image blocks then one text block.

#### Context block and chips

`context-builder` gathers the note, selection and chips from Obsidian; the Obsidian-free `context-format` (layer 1, `tests/context-format.test.mjs`) builds the text from them (the 8000-character cut, which never splits a surrogate pair, the 40-entry lists, the dedupe) and returns, or omits when there is nothing to say:

```text
<context>
The user is working in an Obsidian vault.
Active note: <path>
Selected text from <path>, lines <from>-<to>:
"""
<selection, first 8000 characters>
"""
Active folder: <path>/
Properties:
  <key>: <value>
Links to (N):
  <path>
Linked from (N):
  <path>
Broken links (N):
  <link text>
Attached file: <path>
Attached folder: <path>/
</context>
```

| Part | Chip | Default | Source |
| --- | --- | --- | --- |
| Active note path and selection | note chip | on, per setting | The last focused Markdown view's file, else the workspace's active file; its editor selection |
| Active folder | folder chip | off | The folder last clicked in the file explorer (a document listener on `.nav-folder-title[data-path]`, reset when a note takes focus), else the note's parent |
| Properties and links | "links & properties" chip | off | `metadataCache`: frontmatter values, resolved outgoing links and embeds, backlinks from `resolvedLinks`, unresolved links; 40 entries per list (properties in their order, links sorted, each once), then "… N more" |
| Attached items | one removable chip each | none | The attach picker (active folder, files by recency, folders), the file menu's "Add to agent chat"; kept for every later turn until removed |

- The selection's lead names its lines as on disk, 1-based with the frontmatter counted (the editor's lines plus one), "line <n>" for one; a selection that ends at the start of a line leaves that line out (`selectionLines`, `selectionReference`). The range is the whole selection's when its text is cut. `context-builder`'s `noteSelection` reads text and range from the editor, for the block and for "Add selection to chat", which appends the same lead line above the text. The message's label counts the range's lines.
- An attached item equal to the active note or folder whose chip is on is listed once.
- `context-format`'s `contextPaths` stores the same paths plus the prompt's `@` mentions (`findMentionedPaths`: the longest vault path after an `@` at a token start) with the message, for export links (DES-005).
- Order: images, the note, folder and "links & properties" chips, then the attached items. A chip is a pill holding a button and, for an attached item or an image, its remove button "Remove <name>"; an attached folder's label is not a button.
- The note chip's text is the note's file name, or, while text is selected in that note's last focused editor, "N lines selected" ("1 line selected"), counting the lines the block's lead names (`selectedLinesName`); its name then continues with "<file name>, lines <from>-<to>" (`lineRange`). `context-builder`'s `targets()` reads the range; the composer reads it again on document `selectionchange`, once per frame, and redraws the chips when it changed. The note's file name stays in "Turn off" and the inline offer chip follows the same text.
- On note, folder or "links & properties" chip: accent fill, named by its text and "Sent with your message · click to leave out". Offer (off): outlined with "+", named by its text and "Click to attach the active note", "Click to attach the active folder" or "Click to attach links and properties", so the name holds what it shows (WCAG 2.5.3). Attached file: accent fill, named "<path> · Sent with your message · click to open"; attached folder: "<path>/ · Sent with your message"; image: "<name> (<size>) · Sent with your message · click to view". A chip has no tooltip; its remove button's is its name. Clicking the note, folder or "links & properties" chip toggles it; clicking a file chip opens the file; clicking an image chip shows it in the [image viewer](#image-viewer), among the composer's images.
- PRD-001.R12 and R30 decide when the chips row, the inline offer chip and the one-line form show.
- PRD-001.R12's inline offer chip: `composerChips` reports no chip on (an on chip needs its note or folder) and nothing attached, images included; the card takes `is-inline-offer`, and CSS places the row after the commands button showing only the note chip.
- One-line form: while the chips row is in it (its computed `flex-wrap` is `nowrap`, which only the short-height container query sets), the resize pass runs `fitChips(available, gap, plusWidth, chipWidths)` over the on and attached chips, all of them when they fit, else the most that fit in order beside "+N", and the chips past the count take `is-overflow`; chips are capped at 9em there and cut with an ellipsis. When not even the first fits beside "+N" (a 300 px main column with Stop showing), it shows anyway with `is-squeezed`, shrunk into the room left, while that room is at least "+N"'s width; a lone chip takes the whole row. A squeezed chip keeps the width read while it showed whole. Each chip's width is read while it shows, cached by its chip until `css-change`; a relabelled chip shows again for the next pass to read. "+N" shows only while chips are hidden; it is monospace, so its width is read when it shows with a label of a new length, until `css-change` (unread, it counts as 0 and the next pass fits again). Stop showing or hiding asks for a pass, since it takes the row's room.
- "+N" ("Show hidden context (N)") opens "Hidden context": the hidden chips, each with its remove or turn-off button ("Remove <name>", "Turn off <name>"). It follows the hidden chips while open, focus staying on its row or moving to the row now in its place; once nothing is hidden "+N" goes and the host closes it.
- Chips are a keyed list, so a chip is never replaced between mouse-down and mouse-up.

#### Images

- `composerFiles` takes a paste into the textarea or a drop on the composer whole when one of its files has an `image/*` type; otherwise the event falls through to Obsidian unchanged.
- `collectImages` checks each taken file with `imageRefusal` (PRD-001.R14's types, size and count); every file that is not an image takes no place among the images. One Notice from `notAttachedMessage` names, in drop order, each refused image and the first `MAX_NAMED_OTHER_FILES` (10) other files, then "and N more"; a file without a name is "pasted image".
- Each image is held base64-encoded on the tab and shown as a thumbnail chip; a click views it, its remove button removes it. Images go as `image` blocks ahead of the text; history stores only the count.

#### Image viewer

PRD-001.R14. `ImageViewerModal` (`confirm-modal`, `themeModal`), opened by `new ImageViewerModal(app, images, index).open()` on Obsidian's active window, which the click or key on the thumbnail has made the thumbnail's window; its state is `state/image-viewer`.

- Opened from an image chip (the composer's images), a sent prompt's thumbnail (that prompt's images, live only) or a tool result's thumbnail (that row's images, named "Tool result image N"). Prompt and tool thumbnails are buttons from `thumbButtons` (`ui/dom`), named by their tooltip "View <name>", `cursor: zoom-in`; `ui/messages` binds the `viewImages` intent to its app and passes it to `ui/prompt` and, through `ui/turn`, `ui/steps-card`.
- The dialog: no title; the stage holds the image as a toggle button named by visually hidden "Actual size" (no tooltip; `aria-pressed`, described by the caption), which takes focus. It opens fitted: the image within the dialog's content width (92vw less its padding and border) by 88vh less 60 px, the dialog sized to it. A click shows it at actual size, the stage then scrolling; a second click fits it again and scrolls the stage back to its start.
- Caption, muted UI size under the image: "2 of 3" when there are several, the name, the file size (`formatBytes`), and the pixel size once loaded ("1920 × 1080").
- Left and Right (`scope.register`) show the previous or next image, fitted; nothing at either end. Escape closes (Obsidian's).

#### Suggests

- `@` (`FileMentionSuggest`): on `@` at a token start; up to 8 fuzzy matches over file and folder paths, name matches boosted, or the 8 most recently modified files before a query; inserts `@<path>` and a space (folders end with `/`); suppressed after a leading space, a newline or 80 characters. A row is the icon, the name with its extension (folders end with `/`) with the part the query spells in bold (`matchedPrefix`), the folder in mono (`folderLabel`), and on the selected row a ↵ key cap; the list has a "Files" header and a footer of key hints (↑ ↓ navigate, ↵ attach, esc close).
- `/` (`SlashCommandSuggest`): while the text starts with `/` and the name has no whitespace yet; fuzzy over the list (`state/slash-rank`): the group holding the command named exactly as typed (any case) first, and within a group that command, then names the text prefixes, then the best fuzzy score; PRD-001.R19's two groups under headers, each row with its description and argument hint; inserts `/<name>` and a space. The commands button prefixes `/` and opens it. A list closes 150 ms after the textarea blurs, so a mousedown on a row lands first, unless the textarea has focus again by then (`state/blur-close`; the button refocuses it and keeps the list open); a focus cancels the pending close. A row is the name in mono (accent while selected) with the argument hint faint, then the description.
- A list is as wide as the composer card, padded 6 px, its rows scrolling between the header and the footer; the selected row is accent-soft.
- The list merges the panel's commands with the CLI's (the panel's description wins on a shared name), each group sorted by name. The CLI's come from the initialize reply's `commands` (`parseCliCommands`), kept on the plugin for all views; `system/init`'s names-only `slash_commands` serves until a described list arrives.

### Held messages

`ui/held-tray`, after the working line at the live end of the messages; PRD-001.R38. It draws what the tab holds and owns nothing: `ClearFlow.heldView()` is its model and the tab's `held` event its redraw (`heldRows`, `state/held-rows`). The queue is `tab/held-sends` (`HeldSends`), which `ClearFlow` owns; the send path's decisions (`sendGate`, `submitRoute`, `routeAfter`, the image and context merges) are `state/held-send`.

- A `/clear` sent while a turn runs is held: the composer empties and a dashed, dimmed bubble `/clear` (opacity .6, mono) shows, a line under it right-aligned with a dashed circle, "Queued · clears when this turn ends" and a quiet "Cancel" link. Nothing is written to the CLI. The turn's `result` is recorded first; then, after its handler has run, `/clear` is written (DES-002 Clear transaction). A message queued behind the running turn means the CLI may run it next, so the clear waits up to 3 s for that turn to start and, if one does, for its end; the client cannot tell a steered message from a queued one.
- A message sent while a `/clear` is held, a written `/clear` awaits the CLI, or an Undo runs is held with its images and the context block as it was sent (`HeldSend.context`), and its composer text is cleared. It draws as the same bubble, clamped to six lines with an ellipsis, with "Queued · sends in order" (plus " · N image(s)") and no Cancel. Each distinct send is kept, none dropped. They are replayed one at a time through the send path in the order they were made, once nothing holds them; a replay does not take the composer's text, so an equal unsent draft stays. A replay the send path returns to the composer (a restore, a pending resume, an error) goes back with its images, and the rest still go; one that throws is logged and counts as returned.
- Cancel drops only the `/clear`; the messages behind it go in order at once.
- A held `/clear` released while an agent or a background task runs asks first ([Stop and clear dialog](#stop-and-clear-dialog)); the sends behind it wait for the answer. "Cancel" returns the `/clear` and the messages behind it to the composer, in order with their images, unsent and with no note (`returnsClear`: "/clear" itself returns only when nothing was held behind it and the composer is empty, never into a draft). A failed stop returns them the same way and shows the error. A restore under way declines the `/clear` with the note "Not cleared: a restore is under way." Nothing is sent into the context the clear was to end. A `/clear` replayed from the held messages meets the same checks; one typed with a task running asks, and "Cancel" leaves its text in the composer.
- A permission card of the running turn stays answerable throughout; the tray is not modal.
- Accessibility: the tray is a plain `role="group"` and its status lines plain text; `ui/announcer` says each change once ("Clear queued until this turn ends", "Message queued", "Clear cancelled"), and "Cancel" is described by its status line. Rows are keyed and changed in place, so a focused Cancel keeps focus.
- Tokens only: `--ai-agent-panel-user-bg`, `-user-line`, `-font-size-control`, `-font-size-meta`, `-text-faint`.

### Stop and clear dialog

`ui/popovers/clear-confirm` (`StopConfirm`), PRD-001.R38; board ClearStates §3. Popover-host content with `alert` set, so the host draws it as `role="alertdialog"` named by its title and described by its body, above the composer in the panel's own window (a pop-out asks there), as wide as the composer card (`fitTrigger`). The popover machine closes it on Escape, a click outside and a tab switch; unload and closing without a button answer no. The composer card is the trigger; a question asked while another is open is answered no (a second popover on the same trigger would only close the first).

- Head: a warning-colored `triangle-alert` icon (`alert-triangle` fallback), then the title from `stopTitle` (`state/clear-dialog`): the agents (`taskType` `local_agent`) and the other background tasks counted from the tasks the tab holds unfinished (`ChatTab.unfinished`, DES-002), "is" only when a single part starts with "1". No task: no dialog, the clear goes on.
- Body: "Clearing stops them. What they reported so far stays above, dimmed." muted, padded 6 12 12 34.
- Footer on the recessed fill, right-aligned: ghost "Cancel", focused, and "Stop and clear" with a filled square icon in the error-soft fill and error text. Enter on the focused Cancel stops nothing.
- A tab that is not shown keeps its messages held and asks when it is next shown, as Auto-approve does (`PanelTab.askStop`, `stopAskMode`).
- A failed stop shows "Could not stop every agent, so the context was not cleared." as an error row in the messages.
- Tokens only: `--ai-agent-panel-warning`, `-error`, `-error-soft`, `-bg-recessed`, `-text-muted`.

### Status line

`ui/status-line`, under the composer, the active tab's:

| Segment | Shows | Accessible label | Click | Hover | Step |
| --- | --- | --- | --- | --- | --- |
| Model | Sparkles icon and the label of the model the CLI reported (`describeModel`), or of the pick before it reports | "Model: <label>" | Model and effort popover | Tooltip: the full model id | — |
| Effort | Gauge icon and the effort's short string (long from 560 px) | "Reasoning effort: <short string>" | Model and effort popover, focus on the effort control | Tooltip: the accessible label, while icon-only | 2: icon only |
| Permissions | The mode's icon and short string (long from 560 px); red in Auto-approve and Bypass | "Permissions: <long string without ⚠>" | Permission popover | Tooltip: the long string and hover text joined by " · " | 3: icon only, skipped in Auto-approve and Bypass |
| Profile | Terminal icon and the profile name; only with several profiles (DES-002) | "CLI profile: <name>" | Profile popover | Tooltip: the accessible label, while icon-only | 1: icon only |
| Context | Ring and percentage per PRD-005.R8, then a divider, a bolt and the time left per PRD-005.R11 | "Context: <used> of <window> tokens (<P>%). Prompt cache <state>, <left>" | Context popover | Hover card, with a "Prompt cache" row | 5: percentage hidden |
| Plan usage | PRD-005.R4's items, tint and placeholders; from 560 px the 5-hour reset time; only while "Show plan usage" is on | "Plan usage: <items>" | Plan-usage popover | Hover card | 4: hidden |

- Strings come from the effort table in `models` and the mode table in `settings-core`; `state/status-line` applies DES-004's mode display rule. Plan-usage items, tints and placeholders come from `state/usage-segment`.
- Steps 1, 2, 3 and 5 collapse a label wrapper to `inline-size: 0; overflow: hidden`; its text keeps its natural width. Step 4 hides the plan-usage segment with `display: none`. The line does not wrap; the step is one class on it (`is-fit-N`); only the model segment shrinks, never below its icon, its label cut with an ellipsis when even the last step does not fit. The icon-text gap is the label's margin, so a collapsed label takes it along.
- The pass (the resize pass, and once after a label changes) reads the line's width, its gap (once per `css-change`), and per shown segment, once per change of the label it shows, `fixed` (its width minus its label wrapper's) and `labelNatural` (the wrapper's `scrollWidth`). Whether the 560 px rule shows the long strings is part of that label, read per pass as the computed `display` of the effort segment's long string. The plan-usage segment's width is read while it shows and cached; while it is hidden, the widths last read stand in only when read in the same short or long mode for text no shorter than it now holds (`hiddenWidths`); otherwise, and with none read yet, it counts as 0 for one pass, shows, and the next pass corrects. Below 560 px its text leaves out the reset time, which does not show there.
- `fitStep(available, gap, segments, skipPermission)`, with the shown `segments` in line order as `{kind, fixed, labelNatural}`, returns the fewest steps, in order, whose total fits with a pixel to spare (`scrollWidth` rounds), or the last step when none does; one write sets the step class.
- Below 360 px a container query applies every step's styles whatever the class, except step 3 in Auto-approve or Bypass.
- The cache part (`.ai-agent-panel-status-cache`) sits outside the percentage's wrapper, so step 5 keeps it. It shows once a main-agent response has reported the cache: the bolt (`zap`; `zap-off` while cold; pulsing while refreshing, unless the user prefers reduced motion) in the state's color (ok refreshing and warm, warning expiring, faint cold), and the time (in the text color; the warning color while expiring) (`m:ss`, or whole minutes above 10) only while a countdown runs and not below 360 px. The measure key of the context segment holds the bolt, the time's length and whether the time shows, so a change of structure asks for a new pass. It subscribes to `state/ticker` as shown only while a countdown is on screen, with the period `cachePeriodMs`, and redraws the segment, its label and a shown hover card.
- After a clear (PRD-005.R8): `ChatTab.addClear` empties `usage.context` and sets `StatusData.contextHidden`, live only; `contextSegment(usage, cache, compacting, hidden)` returns null while it is set, so the segment and its hover card and popover go until the next finished turn (`addTurnUsage` clears the flag). The prompt cache is cold at once (PRD-005.R11).
- Compacting (PRD-005.R8): `StatusData.compacting` is true while the tab's compaction state is `compacting` (`ChatTab.syncCompacting`, after every compaction step and the turn reset; it fires `status` when it changes, and is never stored). `contextSegment` then returns `compacting`, appends ", compacting" to the label, and shows the cache part as a struck bolt (`zap-off`, cold) with no time, whatever the estimate; no cache part appears if none was reported. `ui/status-line` sets `is-compacting` on the segment: `warning-soft` fill, and `warning` for the text and the ring's arc. The tooltip and hover card are unchanged.
- Plan-usage polling visibility (PRD-005.R3) is the segment's `isShown()` with a fit step below 4, reported to the usage service (DES-007) after each pass and on its triggers.

### Popovers, hover cards and tooltips

`ui/popover-host` shows one popover at a time; the component whose trigger opens it supplies the content (the one importer of its `ui/popovers/<name>` module), and `view` opens the open-tabs list for the switcher and for All conversations. Mechanics per ADR-016 and the [machine](#popover-and-hover-card). A popover opens up from the composer area (status line, "+N") or down from the top region (switcher, "More", changes chip), aligned to the trigger's start edge when the trigger's center is in the main column's first half, else to its end edge. A popover is a title row (the title and, right-aligned, the content's meta) over a scrolling body and, where the content asks, a footer band outside the body (`PopoverShell`: `meta()`, `footer()`); a menu popover (`menu`) has rows to its edge, 6 px in, and its title is read by assistive technology only. Widths: 300 px, plan usage 318, context 336; the gaps to the trigger and to the column's edge are `POPOVER_GAP` and `POPOVER_EDGE`. A checked radio is an accent disc with a check. Its trigger counts as hidden under any rule (an inline style, a fit step, the 360 px rule, a hidden panel), seen by a `ResizeObserver` on the trigger while it is open.

| Popover | Opened by | Title | Content | Logic |
| --- | --- | --- | --- | --- |
| `ui/popovers/model-effort` | `ui/status-line` | "Model and effort" | Models as a radio group, the current one checked, each with a description only where the CLI supplies one; effort as a segmented radio group in PRD-001.R23's order and strings, levels the selected model lacks disabled; PRD-001.R22's note | `models` |
| `ui/popovers/permission` | `ui/status-line` | "Permissions" | The modes, the current one checked, the warning modes in red, Bypass only while enabled (DES-004) | `settings-core` |
| `ui/popovers/profile` | `ui/status-line` | "CLI profile" | The profiles, the current one checked (pick rules: DES-002) | `settings-core` |
| `ui/popovers/context` | `ui/status-line` | "Context" | PRD-005.R8's popover; below the legend its "Prompt cache" section (a state-colored bolt, the title, the state as a pill, the time left at 15 px in mono, a bar, cached tokens, "Expires" with the time of day and the faint TTL, the estimate note; hidden before the cache is first reported) redrawn in place on the ticker and on the tab's `status` and `activity` events; the footer holds "/context details" and an outlined Compact with a `fold-vertical` icon, titled "Summarize the conversation now (uses tokens)", which sends `/compact`, closes the popover and is disabled while `compactAllowed` is false (PRD-005.R11) | `state/status-line`, `state/cache-surfaces` |
| `ui/popovers/plan-usage` | `ui/status-line` | "Plan usage" | PRD-005.R5's popover; "Usage settings ↗" is an `external-link` anchor | `state/usage-segment` |
| `ui/popovers/changed-files` | `ui/changes-bar` | "Files this conversation changed" | [Header and changes bar](#header-and-changes-bar) | `restore`, `state/prompts` |
| `ui/popovers/more` | `ui/header` | "More" | PRD-001.R30's entries | — |
| `ui/popovers/clear-confirm` | `view` (a `/clear` met running agents or tasks) | "N agents are still running" and the like | [Stop and clear dialog](#stop-and-clear-dialog) | `state/clear-dialog` |
| `ui/popovers/chips` | `ui/composer` | "Hidden context" | The chips "+N" hides, each with its remove or turn-off button | `state/composer` |
| `ui/switcher`'s list | `view` | "Open conversations" | [Tabs and conversation column](#tabs-and-conversation-column) | `state/tabs` |

- Hover cards (`ui/hover-card-host`; the [machine](#popover-and-hover-card)): a tab, the context segment, the plan-usage segment and a turn's duration and cost, with the contents PRD-001.R7, PRD-005.R8, PRD-005.R4 and PRD-005.R7 name. A card is `role="tooltip"`, referenced by its element's `aria-describedby` while shown. It opens in the main column's layer up from its element, down from a tab of the strip, and from a column row up where it fits, else down; aligned as a popover, at most 260 px and the main column less 16 px wide; the context, plan-usage and turn-cost cards are 230 px (`mod-fixed`), and the turn-cost card's note sits under a rule (`mod-footnote`). Its component redraws it while shown; one whose element no longer shows goes, and no card shows for an element hidden while it waited.
- Text tooltips: `setTooltip(el, label, { delay: 400 })` (`writeTooltip`) on every icon-only control, with the control's accessible label; on an image thumbnail (a prompt's or a tool result's), "View <name>"; and on three elements with visible text whose requirements ask for one: the model segment (PRD-001.R22), the permission segment (PRD-002.R8) and "Restore to before turn N" (PRD-002.R18). Nothing else has one. The model and permission tooltips obey "Show tooltips"; the third shows whatever it says.
- A control icon-only only at some sizes (the effort and profile segments, Restore files and Branch, Transcript) has its tooltip always and `--no-tooltip: true` in `styles.css`, which Obsidian reads to show none; the rules that hide its text reset it to `var(--ai-agent-panel-no-tooltip)`. The model and permission segments carry no reset: their content tooltips inherit the scope's token, so the setting governs them at every width.
- "Show tooltips" (PRD-001.R32): `ui/shell` puts `mod-no-tooltips` on the root while the setting is off (`state/tooltips`), and `ConversationPickerModal` on its modal, whose delete button is the one icon-only control outside the root. The token block sets `--ai-agent-panel-no-tooltip` to `false` and `--no-tooltip` to the token on every scope, and `.mod-no-tooltips` sets the token to `true`; so everything inside, popovers and the report cards included, inherits `--no-tooltip: true` and Obsidian shows no text tooltip, and the reset rules above take the token's value instead of overriding it. Two tooltips set `--no-tooltip: false` on their element and show whatever the setting says: "Restore to before turn N" (PRD-002.R18) while the control shows its label, and a rail tick (PRD-001.R33), which has no label and always shows its prompt. Hover cards are not text tooltips and are unaffected. The panel's menu (`onPaneMenu` of the view, in the "view" section beside the Theme items) and the settings tab flip the same setting and fire `settings`.
- Obsidian shows a tooltip for any element with an `aria-label` (`setTooltip` sets one), so only those controls and graphics without text (a step mark, a report's status dot, the context bar) have one. Any other element is named without it: a text field by a visually hidden `<label>`; a region, group, list, separator or radio group by `aria-labelledby` to visually hidden text (`hiddenText`, `ui/dom`); a button with visible text by its content or `aria-labelledby`, which wins over a tooltip's `aria-label`. Text a tooltip would have added is the element's `aria-describedby` (`hiddenText`; not on an element with a hover card, which sets that attribute) or part of its name. `tests/tooltips.test.mjs` fails on an `aria-label` or tooltip call not in its list of sites, or a missing or changed `--no-tooltip` rule or token.

### Models and effort

- Model values are CLI aliases (`opus`, `sonnet[1m]`); the CLI maps each to its family's current snapshot.
- The initialize reply's `models` (value, resolved id, display name, description, effort levels) is validated by `safeCliModels` (`parseCliModels`, the CLI's `default` becoming the empty value, then `isSafeArgValue` on each value and resolved id, since a pick reaches `--model`) and stored per profile, device-local, by `rememberCliModels`. `cliModelsFor(profile)` returns that profile's list, else the default profile's, else null, when the static `MODEL_OPTIONS` apply.
- Popover models (`modelOptions`): the learned list with "Default" first, plus the configured or picked model when missing from it.
- Labels: a learned entry labels itself from its resolved id or display name. `rememberModelResolution` stores the id an alias resolved to only when the alias is learnable and the id names its own family (`isCredibleResolution`); non-credible stored entries are pruned at load; `opusplan` keeps a fixed label.
- A model pick becomes the tab's and `lastModel`, updates the conversation, and sends `set_model` when a process runs; on rejection all three return to the previous value with PRD-001.R22's Notice (DES-002).
- Effort levels: "Default" plus `effortLevels(cliModels)`, the union of the reported models' levels in the CLI's order. A pick stores `lastEffort` and calls `session.setEffort`, which replaces the process after the turn (DES-002).
- New tabs start from `lastModel` and `lastEffort`; changing the Model or Default reasoning effort setting clears them.

### Panel commands

`tab/panel-commands`. `parsePanelCommand` matches a message that is exactly `/<name>` plus optional arguments, any case, for the 15 names of `PANEL_COMMANDS`.

| Command | Control request | CLI started if not running |
| --- | --- | --- |
| `/help` | none; `helpReport` from the known commands | no |
| `/cost` | `get_session_cost` only when a process runs (DES-007) | no |
| `/usage`, `/usage-credits`, `/extra-usage` | `get_usage` through the usage service (DES-007) | no |
| `/context` | `get_context_usage` | yes |
| `/mcp` | `mcp_status`; with an action, `mcp_reconnect` or `mcp_toggle` per server first | yes |
| `/status` | `get_status`, with the panel's rows (plugin version, profile, CLI path, mode, effort) first | yes |
| `/memory`, `/hooks`, `/permissions`, `/skills` | `get_memory_dialog`, `get_hooks_listing`, `list_permission_rules`, `get_skills_dialog` | yes |
| `/chrome`, `/sandbox` | `get_chrome_dialog`, `get_sandbox_dialog`, read with the profile's toggle | yes |
| `/clear` | none; not a card (a compact command bubble above the divider, recorded as a user message before the clear record, live and on reopen): `/clear` writes the CLI's own `/clear` and starts a new session in the same conversation (DES-002 Clear transaction, PRD-001.R38), described "Clear Claude's context; messages above stay, dimmed" | no |

- A run shows the command as a compact message and its card loading (a `report` item), builds the `CommandReport`, draws it answered or failed, and records the command and the card (DES-005) unless a turn runs as it starts; a card whose conversation was deleted meanwhile is not recorded. Starting the CLI for a report sends no turn; requests time out at 60 s.
- `/mcp`: servers most severe first (failed, needs sign-in, connecting, connected, disabled), then by name; live rows have Reconnect and Disable, or Enable; a button sends its request (60 s), rebuilds the card and replaces the recorded Markdown. The panel's own server (transport `sdk`) has no buttons, `all` skips it, and naming it points to the plugin setting. Texts per PRD-001.R21; an argument error is an answered card listing the servers, the error as its lead.

### Report cards

`ReportCard` (`report-view`) draws a `report` item's `CommandReport` (`commands`) with text nodes only, for every report command and the usage cards; its actions are callbacks. The card carries `data-command` for per-command spacing and key widths. The builders' card-only fields (`cardLead`, `figure`, `meter.free`, `barPairs`, a section's `list`, `marker`, `headingPill` and `recordOnly`, a row's `detail`, `pill`, `server`, `tokens`, `command` and `tile`, a bar's `status`, a link's `button`) never reach `reportMarkdown`; `state/report-card` turns them into what the card draws, without parsing the cells.

| Part | Drawn as |
| --- | --- |
| Header | Icon tile, title (13.5 px semibold), "no tokens" badge once answered; Refresh (live cards except `/help`) and "Copy as Markdown" (live cards) |
| `cardLead`, else `lead` | One line under the title; `/context` shows the model's name |
| `figure` | A 24 px semibold figure, a muted caption, a mono figure at the line's end |
| `meter` | `/context`: the used categories (each `tokens / max` wide, colored by name, `contextCategoryColor`: system prompt `cat-1`, system tools `cat-2`, MCP tools `cat-3`, memory files `cat-4`, messages `cat-5`, any other `cat-6`), then free space (the rest, `track`), then the reserve hatched; 10 px, 2 px gaps, outer ends rounded 3 px; a two-column legend (swatch, name, mono figure at the end, never wrapped), one column below a 360 px panel, adding free space when the reply reports it |
| `bars` | One bar per row: label, mono figure, 6 px bar (`accent-text`, or the warning or critical tint), sub-line; with `barPairs` (`/usage-credits`) key/value rows, the dot before the figure, the sub-line beside it, the bar under it |
| Section `heading` | Uppercase caption; a `marker` puts a dot before it and the row count after; `headingPill` draws its closing "(…)" as a pill; a text space before the count and the pill, so it reads "Allow 3" |
| Section with `list` | A row list, lines between rows, no column headers: `servers` (`/mcp`: name, status pill, "this panel" pill for the panel's server, meta "transport · source · N tools", the error in red mono; a connected server's buttons icon-only, any other's first button labelled), `rules` (`/permissions`: mono rule, source at the end), `hooks` (event pill, mono matcher named "matcher" in visually hidden text, source; the command in mono under them), `skills` (a 6 px bar of description tokens per listed skill in accent at stepped opacity; rows: dot, mono name, source, "~N" with a visually hidden " tokens", state pill, which drops to a second line when it does not fit), `files` and `memories` (`/memory`: file, mono path, "exists" or "not created" pill; mono name, description), `commands` (`/help`: grouped by `HELP_GROUPS` for the panel's commands, name in mono, hint, description on one line), `tiles` (`/cost`: 2-column tiles, mono 15 px figure, label; an odd first tile spans the row), `figure` (a 24 px mono figure). Every list but `figure` is `role="list"` with `listitem` rows; `/help` has one list per group, named by its label. Names wrap rather than ellipsize |
| Section with `columns` | A table; a status dot in the first cell when the row has a status |
| Section without `columns` | Key/value rows separated by lines, the key column 128 px (132 px on `/usage-credits`, 150 px on `/chrome` and `/sandbox`, at most 45%); a row's status a dot before its value; a value that is a path, id, version, amount, duration, host or a list of them (`codeLike`) in mono; a closing "(…)" quieter |
| `recordOnly` section | Not drawn; `/context`'s category table, which the legend shows |
| Folding | Above 14 rows only the first 12, or a section's `fold`, behind "Show all N" |
| Collapsed section | A toggle that shows the section; `/context`'s memory files, MCP tools per server, agents and skills |
| Empty section | Its `empty` text |
| `notes`, `links` | A footer band (recessed, a line above, 12 px muted): an icon (`terminal` on `/mcp`, `settings` on `/chrome` and `/sandbox`, none on the usage cards, `info` otherwise), one paragraph per note, then `https` links (`isWebLink`) in accent with an external-link icon; on `/usage` the link leads and the note ends the line, faint |
| `links` with `button` | Buttons in the body: `primary` filled with the accent, `secondary` outlined (`/chrome`) |
| Row `actions` | Buttons, on live cards only; in a list at the row's end, icon-only ones named by their tooltip ("Disable github"); in a table in the last column, which wraps them under one another |
| Keyboard focus | Row buttons, "Show all N", `/help` rows, link buttons and footer links take the panel's 2 px accent outline (`:focus-visible`) |

| Card state | Shown |
| --- | --- |
| loading | PRD-001.R20's busy title ("Checking usage…" for usage cards), `aria-busy="true"`, skeleton bars (`fill`, a `track` sheen sweeping left to right); no badge, no actions |
| answered | Header, body, footer |
| failed | `role="alert"`; PRD-001.R20's failure title, text (Claude Code's message in mono), "Try again" (re-runs into the card) and "Copy error"; the same slot holds the did-not-start and missing-field texts |

- Refresh re-runs the command into the same card; Try again repeats the failed attempt, with its arguments (those typed for the first, none after a Refresh or a row action); for a recorded card the recorded `assistant` message's text is replaced (DES-005).
- A redraw keeps focus: on the card while a re-run loads, then on the control that had it (Refresh or Try again, a row's button, else another of that row's), else on the card; after "Show all N" on the first row it showed.
- `/help`: command rows are buttons that put `/<name>` and a space at the start of the composer, replacing a lone `/` or a command name typed there (`withCommand`, `state/composer`), without sending; all of the panel's commands; Claude Code's commands per PRD-001.R20's "Show all N" rule, their names in text color.
- `/status`: "open /mcp" runs `/mcp`, unless a restore of the tab runs (PRD-002.R14).
- A live `/context` card has, closing its body, a cache line (once the cache is reported): a bolt, "Prompt cache <state>", "· <tokens> tokens" muted, then the time left in mono and "left"; and, always, the footer's "/compact now" button after the note "Auto-compacts at <threshold> tokens." (the note's "; /compact does it now" is dropped on the live card), titled "Summarize the conversation now (uses tokens)", which sends `/compact` through the send path and is disabled while `compactAllowed` is false (PRD-001.R20, PRD-005.R11). The button reuses `.ai-agent-panel-report-row-action`. The line redraws in place on the tab's `status` and `activity` events and on the ticker, keeping focus; neither is in `reportMarkdown`, so a reopened card has none.
- `/usage` and `/usage-credits` cards are built by `state/usage-segment` (content: PRD-005.R6).
- The recorded form is `reportMarkdown(report)`: the same text as Markdown, formatting escaped and newlines folded, a bar as its label and figures joined by " · ", without meters, dots or buttons; a failed card's is `failureMarkdown` (its title, "Couldn't load" and the text). A reopened card is a `report` item holding that Markdown, drawn through `ui/markdown` with no actions.

### Settings that reach the panel

The settings page (layout, bar, rows, reset) is DES-001's and the keys DES-005's. Under "Appearance" come "Theme", "Conversation tabs", "Show tooltips", "Prompt style", "Prompt color" with its "Custom color" sub-row, "Pin the current prompt while scrolling" and "Prompt jump rail" (shown with Card). The panel's menu offers the Theme choices as checkable "Theme: Auto", "Theme: Light" and "Theme: Dark" in its "view" section, and both call the plugin's `setTheme`.

- Card pickers: "Theme", "Conversation tabs", "Prompt style" and "Prompt color" are each a `radiogroup`, named by the row's name, of radio cards drawn by one function of `settings` 12 px under the row's name and description: a decorative preview (`aria-hidden`) over a radio named by the card's name and, where it has one, described by its caption; the radios share a name, so the arrow keys move the choice. A change redraws the page before Obsidian 1.13 only when it shows or hides a sub-row, and focus then returns to the checked radio.
- "Theme": three cards in `THEME_CHOICES` order, "Auto" (captioned "now Dark" or "now Light" by Obsidian's mode, rewritten on `css-change` while the page shows, its listener released with the page), "Light" and "Dark"; each preview is a prompt, three reply lines and a composer drawn under its own mode class (`is-light`, `is-dark`), Auto's both side by side, the prompt in the picked prompt color.
- "Conversation tabs": three cards in `TAB_POSITIONS` order, "Top" ("strip above"), "Side" ("column beside") and "Automatic" ("by panel width"), each a textless miniature of the panel (board TabThumbB), grey except where the conversations are listed, which takes the accent (`accent-soft` fill, `accent-line` ring, `accent-text` bars, the active tab or row on `bg`): "Top" a strip of three tabs above a prompt, reply lines and the composer; "Side" the same transcript with a column on the right (new button, the active row with a working dot, a waiting row, two more); "Automatic" a narrow panel with the strip, an arrow labelled "wider" and a wide panel with the column, captioned "narrow" and "wide".
- "Prompt style": two cards in `PROMPT_STYLES` order, "Card" ("numbered, full width") and "Bubble" ("right-aligned"), each a mini transcript whose prompts take the picked prompt color.
- "Prompt color": ten cards in `PROMPT_COLORS` order, Clear, Sand, Stone, Sage, Sea, Mist, Lavender, Rose, Accent, Custom, without captions, five to a row (four below the page's narrow width); each preview is a small prompt (a number box and a text bar) over two reply lines in that card's own color, whatever is picked; Custom's shows the accepted Custom color, or a plus icon when none is accepted. The page model also matches Clear by "outline", "quiet" and "none" (DES-001).
- "Custom color" (shown while Prompt color is Custom): a native color input and a text field, placeholder "Hex, rgb(), hsl() or name", side by side. The picker saves when its dialog settles and writes the hex value into the field; a typed #rrggbb shows in the picker. A typed value is checked on input (`state/prompt-color` `acceptCustomColor`, ADR-017): accepted, it is stored and drawn at once; refused, the field is `aria-invalid` with an error line under the row's description, "Not a CSS color.", or, for a value that refers to another or a CSS-wide keyword, "Use a color, not var(), env(), attr() or currentColor.", then "The prompt keeps the last valid one." while a valid value is stored, else "Prompts use Sand, the default." (`customColorMessage`); nothing is stored and the prompt keeps the last accepted value. A blank field over a valid stored value is refused with the first message; with none stored the line says "No custom color yet. Prompts use Sand, the default." without `aria-invalid`. A stored value that is refused shows its message when the page draws.
- A change fires `settings`; the root's `mod-prompt-numbered` or `mod-prompt-bubble`, `mod-pin-prompt` and, while the rail shows, `mod-prompt-rail` (`ui/shell`), `mod-no-tooltips` while "Show tooltips" is off, the rail's mount (`view`), and every scope root's mode and prompt color classes and Custom property (`theme-scope`) follow at once.
- Scope roots: the page's own element is one root, attached when the page shows and released when it hides, in host mode, so the page draws in the panel's palette in Obsidian's mode whatever the Theme setting (ADR-017; a community theme no longer colors it). Theme previews are nested roots with their own mode class; they inherit the prompt color from the page root and need no attach of their own.

### Token contract

Three rules open `styles.css` (ADR-017 Palettes and mode): the token block on `.ai-agent-panel-scope`, then the palettes on `.ai-agent-panel-scope.is-light` and `.ai-agent-panel-scope.is-dark`. `theme-scope` puts one of the two mode classes on every scope root: the Theme setting's mode on panel roots and plugin modals, Obsidian's on the settings tab's parts. Components read tokens only.

The token block holds no color:

| Token | Value | Use |
| --- | --- | --- |
| `--ai-agent-panel-z-below`, `-z-sticky`, `-z-pin`, `-z-rail`, `-z-float` | `-1`, `1`, `2`, `3`, `4` | Every z-index: the stacking order in [Layout model](#layout-model) |
| `--ai-agent-panel-no-tooltip` | `false`; `true` on a scope with `mod-no-tooltips` | Whether Obsidian shows text tooltips: `--no-tooltip` on every scope, and the reset in every rule that makes a control icon-only, read it ([Popovers, hover cards and tooltips](#popovers-hover-cards-and-tooltips)) |
| `--ai-agent-panel-section-gap` | `var(--ai-agent-panel-space-12)` | Gap between a section's messages, and the pin's offsets |
| `--ai-agent-panel-font-ui`, `-font-mono` | `"AI Agent Panel Geist", var(--font-interface)`, `"AI Agent Panel Geist Mono", var(--font-monospace)` | Every font-family; the faces are registered per document by `fonts` (`FontFace`, from `main.js`), so text falls back to Obsidian's fonts where a document has none |
| `--ai-agent-panel-font-size-label`, `-caption`, `-meta`, `-ui`, `-control`, `-title`, `-body`, `-prompt`, `-stat`, `-heading`, `-hero`, `-figure`, `-display` | `10.5px`, `11px`, `11.5px`, `12px`, `12.5px`, `13px`, `13.5px`, `14px`, `15px`, `18px`, `20px`, `22px`, `24px` | Section labels and badges; durations, stats and hints; secondary lines; chips, segments and buttons; tabs, rows and popovers; titles and starters; the panel and composer text, report titles; a numbered prompt; a `/cost` tile's figure; the settings tab's section headings; the empty state's heading; the context popover's figure; a report's large figure |
| `--ai-agent-panel-font-size-reply` | `calc(var(--font-text-size) * 0.875)` | Rendered replies and report cards, following Obsidian's *Font size* |
| `--ai-agent-panel-line-height`, `-line-height-reply`, `-line-height-prompt` | `1.5`, `1.62`, `1.55` | The panel and composer; rendered replies; prompts and the empty state's line |
| `--ai-agent-panel-space-N` | N px for N in 1–12, 14, 16, 18, 20, 22, 24, 26 | Every padding, margin and gap except the 1–2 px offsets of visually hidden elements and the pin's sentinel; only the steps the boards use |
| `--ai-agent-panel-radius-N`, `-radius-pill` | N px for N in 1–10, 12, 14, 15; `999px` | Every border-radius: tiles 6–7, controls 7–8, send 9, hover cards and options 10, cards and popovers 12, composer and question cards 14, the empty-state mark 15 |
| `--ai-agent-panel-shadow-ring`, `-ring-thick`, `-halo`, `-dot`, `-edge-bottom`, `-edge-start` | `inset 0 0 0 1px`, `inset 0 0 0 1.5px`, `0 0 0 4px`, `inset 0 0 0 4px`, `inset 0 -1px 0`, `inset 1px 0 0` | Shadow geometry a rule follows with a palette color. Elevation shadows (`shadow`, `shadow-small`, `stuck`, `input-shadow`, …) stay whole in the palettes: the palette check requires its listed shadow tokens to be literal shadow lists, and splitting them would mean changing those lists |
| `--ai-agent-panel-duration-100`, `-120`, `-pulse`, `-ring`, `-dots`, `-spin`, `-blink`, `-shimmer` | `100ms`, `120ms`, `1.4s`, `1.6s`, `1.2s`, `1s`, `1s`, `1.4s` | Every transition and animation: SPEC §2.5's value where it names the element, otherwise the panel's own (card chevrons and copy buttons 100 ms; the column handle, column section chevrons and rail ticks 120 ms) |
| `--ai-agent-panel-ease`, `-ease-in-out`, `-ease-out` | `ease`, `ease-in-out`, `ease-out` | Transition and animation easing |
| `--ai-agent-panel-status-icon-size` | `12px` | Status-line icons and their segments' minimum width (the context ring is 13 px) |
| `--ai-agent-panel-icon-stroke` | `1.8` | Stroke width of the lucide icons on icon buttons, the status line and the changes chip; the Send arrow is 2.2 |
| `--ai-agent-panel-toggle-width`, `-toggle-height`, `-toggle-knob`, `-settings-desc-width` | `38px`, `22px`, `16px`, `420px` | The settings tab's toggle and the widest a row's description grows |
| `--ai-agent-panel-side-width`, `-bar-clearance`, `-tick-top`, `-segment-share`, `-meter-percent`, `-context-share`, `-popover-top`, `-popover-bottom`, `-popover-start`, `-popover-max-height`, `-hover-card-top`, `-hover-card-bottom`, `-hover-card-start` | `220px`, `0px`, `0`, `0%`, `0%`, `0%`, `0`, `0`, `0`, `none`, `0`, `0`, `0` | Geometry the source writes per element (`setCssProps`); these are the values before the first write |
| `--ai-agent-panel-tab-strip-padding`, `-tab-padding`, `-tab-inner-padding`, `-tab-title-mask` | `0`, `0`, `0 var(--ai-agent-panel-space-12)`, `none` | The board's tab paddings and title mask, read by ADR-017's override table |
| `--ai-agent-panel-tab-min-width` | `76px` | Every tab's minimum width (change 017) |

It also sets `color` and `caret-color` to `--ai-agent-panel-text`.

Each palette declares the same tokens (`PALETTE_TOKENS` in `tests/styles.test.mjs`) and `color-scheme`. Values come from the mock (`docs/work/research/redesign-canvas/generator/common.css`: `.app` dark, `.app.t-light` light; "mock" below). Six light text tokens (`text-faint`, `ok`, `error`, `warning`, `added`, `removed`) and the dark `text-faint` are the mock's value darkened (light) or lightened (dark) in lightness, hue kept, to the least 4.5:1 on their backgrounds; their soft fills keep the mock's. Where the mock has none, the value is Obsidian 1.14.4's default theme ("Obsidian" below). The accent is Obsidian's: `--interactive-accent` and `--text-on-accent` are read only here, by `accent` and `on-accent`. The categories are the boards' (`project/Commands.dc.html` `--c0` to `--c4`, in SPEC's order blue, purple, cyan, orange, green); the sixth, pink, is `project/ContextCache.dc.html`'s `#d68be0` in dark and, in light, that color moved by the mean HSL lightness shift of the five Commands pairs (-19.4 points, hue and saturation kept), `#ba3dcb`. `stuck` is the boards' `--stuck`. The prompt colors are the settings boards' `PALETTE` (`docs/work/research/redesign-canvas/settings/build/build.py`, "settings boards" below); four light inks are darkened the same way to the least 4.5:1 on their fill.

| Token | Light | Dark | Source | Use |
| --- | --- | --- | --- | --- |
| **Surfaces, lines and text** | | | | |
| `--ai-agent-panel-bg` | `#fbfbfa` | `#141417` | mock `--bg` | Panel; the active tab; the pinned prompt's backdrop |
| `--ai-agent-panel-bg-recessed` | `#f4f4f2` | `#18181c` | mock `--bg-2` | Column, card and popover footers, diff body, shell output |
| `--ai-agent-panel-surface` | `#ffffff` | `#1d1d22` | mock `--surface` | Composer, cards, popovers, hover cards, the active column row |
| `--ai-agent-panel-fill` | `#f0f0ed` | `#26262c` | mock `--surface-2` | Resting fills: tiles, segmented track, open trigger, count badge |
| `--ai-agent-panel-fill-hover` | `#f0f0ed` | `#26262c` | mock `--surface-2` | Hover |
| `--ai-agent-panel-track` | `#e6e6e2` | `#2f2f36` | mock `--surface-3` | Bar tracks, free space, toggle-off track |
| `--ai-agent-panel-strip` | `#ebebe7` | `#222227` | mock `--strip` | The tab strip and the header row |
| `--ai-agent-panel-line` | `rgba(24, 24, 32, 0.08)` | `rgba(255, 255, 255, 0.07)` | mock `--line` | Hairlines, card borders, row separators |
| `--ai-agent-panel-line-strong` | `rgba(24, 24, 32, 0.14)` | `rgba(255, 255, 255, 0.12)` | mock `--line-2` | Composer and popover borders, offer chips, outline buttons, ring track, tab hover, dividers and the strip's bottom line |
| `--ai-agent-panel-cover` | `rgba(220, 220, 220, 0.4)` | `rgba(10, 10, 10, 0.4)` | Obsidian `--background-modifier-cover` | Obsidian's modal cover inside the scope |
| `--ai-agent-panel-bg-translucent` | `color-mix(in srgb, var(--ai-agent-panel-bg) 80%, transparent)` | same | Obsidian `--embed-actions-background` (80 % of bg) | Obsidian's embed actions |
| `--ai-agent-panel-mono` | `#000000` | `#ffffff` | Obsidian `--mono-100` | Obsidian's `--mono-100` |
| `--ai-agent-panel-text` | `#1b1b20` | `#ededf0` | mock `--text` | Text |
| `--ai-agent-panel-text-muted` | `#53535d` | `#a6a6b0` | mock `--muted` | Secondary text |
| `--ai-agent-panel-text-faint` | `#666670` | `#96969f` | mock `--faint` | Meta |
| **Accent** | | | | |
| `--ai-agent-panel-accent` | `var(--interactive-accent)` | same | Obsidian `--interactive-accent` | Send, primary buttons, checked radios, focus rings |
| `--ai-agent-panel-on-accent` | `var(--text-on-accent)` | same | Obsidian `--text-on-accent` | Text and icons on the accent |
| `--ai-agent-panel-accent-text` | `color-mix(in srgb, var(--ai-agent-panel-accent), black 5%)` | `color-mix(in srgb, var(--ai-agent-panel-accent), white 40%)` | ADR-017 Accent | Accent text and icons, links |
| `--ai-agent-panel-accent-hover` | `color-mix(in srgb, var(--ai-agent-panel-accent), black 8%)` | `color-mix(in srgb, var(--ai-agent-panel-accent), white 8%)` | ADR-017 Accent | Accent fill on hover |
| `--ai-agent-panel-accent-soft` | `color-mix(in srgb, var(--ai-agent-panel-accent) 9%, transparent)` | `color-mix(in srgb, var(--ai-agent-panel-accent) 15%, transparent)` | mock `--accent-soft` alpha | Chips on, selected rows and segments, active step tile |
| `--ai-agent-panel-accent-line` | `color-mix(in srgb, var(--ai-agent-panel-accent) 40%, transparent)` | `color-mix(in srgb, var(--ai-agent-panel-accent) 50%, transparent)` | mock `--accent-line` alpha | Selected borders, the question form's border |
| `--ai-agent-panel-selection` | `color-mix(in srgb, var(--ai-agent-panel-accent) 20%, transparent)` | `color-mix(in srgb, var(--ai-agent-panel-accent) 33%, transparent)` | Obsidian `--text-selection` alpha | Selected text |
| **Status and diff** | | | | |
| `--ai-agent-panel-ok` | `#147c49` | `#4fc58c` | mock `--green` | Status marks and text: done |
| `--ai-agent-panel-error` | `#c83534` | `#f2706f` | mock `--red` | Status marks and text: failed |
| `--ai-agent-panel-sponsor` | `#bf3989` | `#db61a2` | GitHub Sponsors' heart | The settings page's support hearts (DES-001) |
| `--ai-agent-panel-warning` | `#a55808` | `#f5a04a` | mock `--orange` | Status marks and text: waiting, thresholds |
| `--ai-agent-panel-ok-soft` | `rgba(22, 134, 79, 0.09)` | `rgba(79, 197, 140, 0.13)` | mock `--green-soft` | "no tokens" badge |
| `--ai-agent-panel-error-soft` | `rgba(204, 59, 58, 0.08)` | `rgba(242, 112, 111, 0.13)` | mock `--red-soft` | Stop fill, Bypass segment fill |
| `--ai-agent-panel-warning-soft` | `rgba(168, 90, 8, 0.08)` | `rgba(245, 160, 74, 0.13)` | mock `--orange-soft` | Auto-approve segment fill, waiting halo, warning tint |
| `--ai-agent-panel-error-line` | `rgba(204, 59, 58, 0.4)` | `rgba(242, 112, 111, 0.45)` | mock `--red-line` | Failed card border |
| `--ai-agent-panel-warning-line` | `rgba(168, 90, 8, 0.4)` | `rgba(245, 160, 74, 0.45)` | mock `--orange-line` | Waiting card border |
| `--ai-agent-panel-added` | `#147c49` | `#4fc58c` | mock `--green` | `+x`, diff signs |
| `--ai-agent-panel-removed` | `#c83534` | `#f2706f` | mock `--red` | `-y`, diff signs |
| `--ai-agent-panel-added-soft` | `rgba(22, 134, 79, 0.09)` | `rgba(79, 197, 140, 0.13)` | mock `--green-soft` | Diff line fills |
| `--ai-agent-panel-removed-soft` | `rgba(204, 59, 58, 0.08)` | `rgba(242, 112, 111, 0.13)` | mock `--red-soft` | Diff line fills |
| `--ai-agent-panel-added-word` | `rgba(22, 134, 79, 0.22)` | `rgba(79, 197, 140, 0.34)` | mock `--green-word` | Changed words |
| `--ai-agent-panel-removed-word` | `rgba(204, 59, 58, 0.2)` | `rgba(242, 112, 111, 0.34)` | mock `--red-word` | Changed words |
| `--ai-agent-panel-added-line` | `rgba(22, 134, 79, 0.4)` | `rgba(79, 197, 140, 0.45)` | mock `--green` at `--red-line`'s alpha | The diff's Rendered view: the after pane's border |
| `--ai-agent-panel-removed-line` | `rgba(204, 59, 58, 0.4)` | `rgba(242, 112, 111, 0.45)` | mock `--red-line` | The diff's Rendered view: the before pane's border |
| **Prompts (PRD-001.R28)** | | | | |
| `--ai-agent-panel-amber` | `#d98a1c` | `#f5b45a` | mock `--amber` | A commit hash in shell output; the waiting mini-dot |
| `--ai-agent-panel-user-bg` | `var(--ai-agent-panel-prompt-mist-fill)` | same | ADR-017 Prompt color | Prompt fill: card, bubble, pinned prompt, held bubble, previews |
| `--ai-agent-panel-user-line` | `var(--ai-agent-panel-prompt-mist-line)` | same | ADR-017 Prompt color | Prompt border |
| `--ai-agent-panel-user-ink` | `var(--ai-agent-panel-prompt-mist-ink)` | same | ADR-017 Prompt color | Number box outline, "You", current rail tick |
| `--ai-agent-panel-prompt-clear-fill`, `-line`, `-ink` | `rgba(0, 0, 0, 0)`, `rgba(24, 24, 32, 0.18)`, `#696973` | `rgba(0, 0, 0, 0)`, `rgba(255, 255, 255, 0.18)`, `#a6a6b0` | settings boards | Prompt color Clear |
| `--ai-agent-panel-prompt-sand-fill`, `-line`, `-ink` | `#fdf3e4`, `#ecca95`, `#9c6414` | `#2a241c`, `rgba(245, 180, 90, 0.36)`, `#f5b45a` | settings boards; light ink darkened from `#d98a1c` | Sand, the default |
| `--ai-agent-panel-prompt-stone-fill`, `-line`, `-ink` | `#f0f0ed`, `#d6d6d0`, `#696973` | `#232328`, `rgba(255, 255, 255, 0.16)`, `#a6a6b0` | settings boards | Stone |
| `--ai-agent-panel-prompt-sage-fill`, `-line`, `-ink` | `#edf5ef`, `#bfdac6`, `#377d4c` | `#1e2620`, `rgba(134, 194, 150, 0.34)`, `#86c296` | settings boards; light ink darkened from `#3f8f57` | Sage |
| `--ai-agent-panel-prompt-sea-fill`, `-line`, `-ink` | `#e9f5f3`, `#b8dcd6`, `#257b75` | `#1a2527`, `rgba(102, 196, 190, 0.32)`, `#66c4be` | settings boards; light ink darkened from `#2a8c85` | Sea |
| `--ai-agent-panel-prompt-mist-fill`, `-line`, `-ink` | `#ecf2fb`, `#c3d3ee`, `#3c6cc0` | `#1d2330`, `rgba(128, 164, 228, 0.36)`, `#80a4e4` | settings boards | Mist; the aliases' base |
| `--ai-agent-panel-prompt-lavender-fill`, `-line`, `-ink` | `#f2effc`, `#d3caf2`, `#6a52d6` | `#232030`, `rgba(168, 150, 240, 0.38)`, `#a896f0` | settings boards | Lavender |
| `--ai-agent-panel-prompt-rose-fill`, `-line`, `-ink` | `#fbeef1`, `#ecc6d0`, `#bd4166` | `#2a1f24`, `rgba(232, 140, 166, 0.34)`, `#e88ca6` | settings boards; light ink darkened from `#c0476b` | Rose |
| `--ai-agent-panel-prompt-accent-fill` | `color-mix(in srgb, var(--ai-agent-panel-accent) 8%, var(--ai-agent-panel-bg))` | `color-mix(in srgb, var(--ai-agent-panel-accent) 16%, var(--ai-agent-panel-bg))` | settings boards | Accent |
| `--ai-agent-panel-prompt-accent-line` | `var(--ai-agent-panel-accent-line)` | same | settings boards | Accent |
| `--ai-agent-panel-prompt-accent-ink` | `color-mix(in srgb, var(--ai-agent-panel-accent), black 11%)` | `var(--ai-agent-panel-accent-text)` | `accent` darkened to 4.5:1 on the light fill (`accent-text` reaches 4.08); dark `accent-text` | Accent |
| **Categories** | | | | |
| `--ai-agent-panel-cat-1` | `#2f6fe0` | `#6ea8fe` | boards `--c0` (blue) | Categories: context legend, meters |
| `--ai-agent-panel-cat-2` | `#7b4fd6` | `#b38cff` | boards `--c1` (purple) | Categories: context legend, meters |
| `--ai-agent-panel-cat-3` | `#0f8ca3` | `#4cc9e0` | boards `--c2` (cyan) | Categories: context legend, meters |
| `--ai-agent-panel-cat-4` | `#d47a14` | `#f5a04a` | boards `--c3` (orange) | Categories: context legend, meters |
| `--ai-agent-panel-cat-5` | `#1e9a5c` | `#4fc58c` | boards `--c4` (green) | Categories: context legend, meters |
| `--ai-agent-panel-cat-6` | `#ba3dcb` | `#d68be0` | ContextCache pink; light derived | Categories: context legend, meters |
| **Rendered content** | | | | |
| `--ai-agent-panel-code-function` | `#e0ac00` | `#e0de71` | Obsidian `--code-function` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-important` | `#ec7500` | `#e9973f` | Obsidian `--code-important` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-keyword` | `#d53984` | `#fa99cd` | Obsidian `--code-keyword` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-operator` | `#e93147` | `#fb464c` | Obsidian `--code-operator` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-property` | `#00bfbc` | `#53dfdd` | Obsidian `--code-property` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-string` | `#08b94e` | `#44cf6e` | Obsidian `--code-string` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-tag` | `#e93147` | `#fb464c` | Obsidian `--code-tag` | Rendered replies: code, highlights |
| `--ai-agent-panel-code-value` | `#7852ee` | `#a882ff` | Obsidian `--code-value` | Rendered replies: code, highlights |
| `--ai-agent-panel-highlight-blue` | `rgba(8, 109, 221, 0.3)` | `rgba(2, 122, 255, 0.3)` | Obsidian `--highlight-background-blue` | Rendered replies: code, highlights |
| `--ai-agent-panel-highlight-green` | `rgba(8, 185, 78, 0.3)` | `rgba(68, 207, 110, 0.3)` | Obsidian `--highlight-background-green` | Rendered replies: code, highlights |
| `--ai-agent-panel-highlight-orange` | `rgba(236, 117, 0, 0.3)` | `rgba(233, 151, 63, 0.3)` | Obsidian `--highlight-background-orange` | Rendered replies: code, highlights |
| `--ai-agent-panel-highlight-purple` | `rgba(120, 82, 238, 0.3)` | `rgba(168, 130, 255, 0.3)` | Obsidian `--highlight-background-purple` | Rendered replies: code, highlights |
| `--ai-agent-panel-highlight-red` | `rgba(233, 49, 71, 0.3)` | `rgba(251, 70, 76, 0.3)` | Obsidian `--highlight-background-red` | Rendered replies: code, highlights |
| `--ai-agent-panel-highlight-yellow` | `rgba(224, 172, 0, 0.3)` | `rgba(224, 222, 113, 0.3)` | Obsidian `--highlight-background`, `--highlight-background-yellow` | Rendered replies: code, highlights |
| `--ai-agent-panel-blend-mode` | `darken` | `lighten` | Obsidian `--callout-blend-mode`, `--highlight-mix-blend-mode` | Obsidian's callout and highlight blend |
| `--ai-agent-panel-scrollbar-thumb` | `rgba(0, 0, 0, 0.1)` | `rgba(255, 255, 255, 0.1)` | Obsidian `--scrollbar-thumb-bg` | Scrollbar thumb |
| `--ai-agent-panel-scrollbar-thumb-active` | `rgba(0, 0, 0, 0.2)` | `rgba(255, 255, 255, 0.2)` | Obsidian `--scrollbar-active-thumb-bg` | Scrollbar thumb, dragged |
| **Shadows, rings and the embed border** | | | | |
| `--ai-agent-panel-shadow` | `0 18px 40px rgba(24, 24, 48, 0.1), 0 2px 8px rgba(24, 24, 48, 0.06)` | `0 18px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)` | mock `--shadow` | Composer, popovers, hover cards |
| `--ai-agent-panel-shadow-small` | `0 1px 2px rgba(0, 0, 0, 0.028), 0 3.4px 6.7px rgba(0, 0, 0, 0.042), 0 15px 30px rgba(0, 0, 0, 0.07)` | `0 1px 2px rgba(0, 0, 0, 0.121), 0 3.4px 6.7px rgba(0, 0, 0, 0.179), 0 15px 30px rgba(0, 0, 0, 0.3)` | Obsidian `--shadow-s` | Composer, the suggest list, a selected segment (with the 1 px ring) |
| `--ai-agent-panel-input-shadow` | `inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 1px 2px 0 rgba(0, 0, 0, 0.065)` | `inset 0 0.5px 0.5px 0.5px rgba(255, 255, 255, 0.09), 0 2px 4px 0 rgba(0, 0, 0, 0.15), 0 1px 1.5px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.2)` | Obsidian `--input-shadow` | Obsidian's inputs and buttons |
| `--ai-agent-panel-input-shadow-hover` | `inset 0 0 0 1px rgba(0, 0, 0, 0.17), 0 1px 2px 0 rgba(0, 0, 0, 0.1)` | `inset 0 0.5px 1px 0.5px rgba(255, 255, 255, 0.16), 0 2px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 1.5px 0 rgba(0, 0, 0, 0.2), 0 1px 2px 0 rgba(0, 0, 0, 0.4)` | Obsidian `--input-shadow-hover` | Obsidian's inputs and buttons, hovered |
| `--ai-agent-panel-stuck` | `0 10px 22px -10px rgba(24, 24, 48, 0.25)` | `0 10px 22px -10px rgba(0, 0, 0, 0.7)` | mock `--stuck` | Under the pinned prompt |
| `--ai-agent-panel-swatch-shadow` | `inset 0 0 0 1px rgba(24, 24, 32, 0.14)` | `inset 0 0 0 1px rgba(255, 255, 255, 0.12)` | `line-strong` as a ring | Obsidian's `--swatch-shadow` |
| `--ai-agent-panel-embed-border` | `2px solid var(--ai-agent-panel-accent)` | same | Obsidian `--embed-border-start` shape | Obsidian's `--embed-border-start` |

Each palette also re-declares the 115 Obsidian variables in `tests/fixtures/redeclared.json` as `var(--ai-agent-panel-<token>)`. Obsidian's own rules inside the scope (rendered replies, controls, its modal classes) then draw in the panel's mode. Excluded: the 13 callout colors while the plugin supports Obsidian before 1.13 (there they need an RGB triplet; a callout keeps the host mode's hue), and `--interactive-accent`, the accent's source.

| Group | Obsidian variable → token |
| --- | --- |
| Text | `--text-normal` → `text`; `--text-muted` → `text-muted`; `--text-faint` → `text-faint`; `--text-accent` → `accent-text`; `--text-error` → `error`; `--text-warning` → `warning`; `--text-selection` → `selection` |
| Backgrounds and modifiers | `--background-primary` → `bg`; `--background-primary-alt`, `--background-modifier-form-field`, `--background-modifier-form-field-hover` → `surface`; `--background-secondary` → `bg-recessed`; `--background-modifier-hover` → `fill-hover`; `--background-modifier-active-hover` → `accent-soft`; `--background-modifier-border` → `line`; `--background-modifier-border-hover` → `line-strong`; `--background-modifier-border-focus` → `accent`; `--background-modifier-cover` → `cover`; `--background-modifier-error`, `--background-modifier-error-hover` → `error`; `--mono-100` → `mono` |
| Icons | `--icon-color`, `--icon-color-hover` → `text-muted`; `--icon-color-active` → `accent-text`; `--icon-color-focused` → `text` |
| Code | `--code-background` → `bg-recessed`; `--code-border-color` → `line`; `--code-normal` → `text`; `--code-comment` → `text-faint`; `--code-punctuation` → `text-muted`; `--code-function` → `code-function`; `--code-important` → `code-important`; `--code-keyword` → `code-keyword`; `--code-operator` → `code-operator`; `--code-property` → `code-property`; `--code-string` → `code-string`; `--code-tag` → `code-tag`; `--code-value` → `code-value` |
| Callout blend mode | `--callout-blend-mode` → `blend-mode` |
| Highlights | `--highlight-background`, `--highlight-background-yellow` → `highlight-yellow`; `--highlight-background-blue` → `highlight-blue`; `--highlight-background-green` → `highlight-green`; `--highlight-background-orange` → `highlight-orange`; `--highlight-background-purple` → `highlight-purple`; `--highlight-background-red` → `highlight-red`; `--highlight-mix-blend-mode` → `blend-mode` |
| Links and tags | `--link-color`, `--link-color-hover`, `--link-external-color`, `--link-external-color-hover`, `--link-unresolved-color`, `--tag-color`, `--tag-color-hover` → `accent-text`; `--link-unresolved-decoration-color` → `accent-line`; `--tag-background`, `--tag-background-hover`, `--tag-border-color`, `--tag-border-color-hover` → `accent-soft` |
| Tables | `--table-border-color`, `--table-header-border-color` → `line`; `--table-header-color` → `text` |
| Lists and structure | `--list-marker-color`, `--collapse-icon-color` → `text-faint`; `--list-marker-color-hover`, `--checklist-done-color` → `text-muted`; `--list-marker-color-collapsed`, `--collapse-icon-color-collapsed` → `accent-text`; `--indentation-guide-color` → `line-strong`; `--blockquote-border-color` → `accent`; `--hr-color`, `--divider-color` → `line` |
| Embeds | `--embed-border-start` → `embed-border`; `--embed-actions-background` → `bg-translucent` |
| Interactive | `--interactive-normal`, `--hotkey-background` → `fill`; `--interactive-hover` → `track`; `--metadata-label-background-active` → `fill-hover`; `--swatch-shadow` → `swatch-shadow` |
| Inputs | `--input-shadow` → `input-shadow`; `--input-shadow-hover` → `input-shadow-hover`; `--input-placeholder-color`, `--input-date-separator` → `text-faint`; `--search-icon-color`, `--search-clear-button-color` → `text-muted` |
| Checkboxes | `--checkbox-color` → `accent`; `--checkbox-marker-color` → `bg`; `--checkbox-border-color` → `text-faint`; `--checkbox-border-color-hover` → `text-muted` |
| Sliders | `--slider-fill-background` → `accent`; `--slider-track-background` → `track`; `--slider-thumb-border-color` → `line-strong` |
| Pills | `--pill-color` → `text-muted`; `--pill-color-hover` → `text`; `--pill-color-remove` → `text-faint`; `--pill-color-remove-hover` → `accent-text`; `--pill-border-color` → `line`; `--pill-border-color-hover` → `line-strong` |
| Dropdowns | `--dropdown-background` → `fill`; `--dropdown-background-hover` → `track` |
| Modals | `--modal-background` → `bg`; `--modal-border-color` → `line-strong` |
| Prompts and suggestions | `--prompt-background`, `--suggestion-background` → `bg`; `--prompt-border-color` → `line-strong` |
| Settings items | `--settings-background` → `bg`; `--setting-items-background` → `surface`; `--setting-items-border-color`, `--setting-items-divider-color` → `line`; `--setting-item-name-color`, `--setting-group-heading-color` → `text` |
| Shadows | `--shadow-l` → `shadow`; `--shadow-s` → `shadow-small` |
| Scrollbars | `--scrollbar-thumb-bg` → `scrollbar-thumb`; `--scrollbar-active-thumb-bg` → `scrollbar-thumb-active` |

- `.ai-agent-panel-scope.is-dark .mermaid > svg` inverts Mermaid diagrams with Obsidian's dark-mode filter. `.is-light` sets `filter: none`.
- Only "You" and the number box's outline take the prompt ink (`user-ink`); the prompt's text and the box's digits are `--ai-agent-panel-text`. Custom has no ink of its own: `user-ink` is `text-muted` (ADR-017).
- `tests/palette.test.mjs` measures every pair the panel draws in both palettes: text, muted and faint on each surface, muted and faint on tracks and the strip, prompt text and the prompt ink on each named prompt color's fill, each status color on its soft fill, success on the panel (4.5:1), and the focus ring on bg, bg-recessed, surface and fill (3:1, with Obsidian's default accent `#8a5cf5`: light 4.11, 3.87, 4.26, 3.73; dark 4.32, 4.16, 3.94, 3.53). Every pair meets its minimum; none is exempt.
- Sizes are the boards' values through the token block; no rule reads Obsidian's `--font-ui-*`, `--size-*` or `--radius-*` (`tests/styles.test.mjs`). Font weights and layers are still Obsidian's.
- Stop (the composer's and a background task's, `[data-icon="square"]`) draws the boards' filled rounded square: the icon's rect is 12 of 24 with radius 2, `fill: currentColor`, no stroke; its name is unchanged.
- Motion (ADR-017 rules): pulse (busy dot, 1.4 s), ring (the live agent mark, 1.6 s), spin (loaders, 1 s), blink (streaming caret, 1 s), shimmer (report skeleton, 1.4 s).

### Keyboard and accessibility

| Element | Role and name | Keys |
| --- | --- | --- |
| Tab strip | `tablist` "Conversations"; tabs `tab` with `aria-selected`, roving `tabindex` | Left, Right, Home, End move; Enter or Space selects; Delete closes |
| Tab close button | button "Close <title>", `tabindex="-1"` | pointer; middle-click on the tab |
| All conversations | button "All conversations" (its tooltip, under "Show tooltips"), after the `tablist` in the tab order; `aria-haspopup="dialog"`, `aria-expanded` while its list shows | Enter, Space |
| Open-tabs list | `list` of rows, each a button named by the title, "pinned" and the state in words, the active one `aria-current="true"`; close buttons "Close <title>", `tabindex="-1"` | Up, Down, Home, End move between rows; Enter or Space selects; Delete closes the row's tab; Escape closes the list |
| Switcher | button "Switch conversation, N open"; `aria-haspopup="dialog"` | Enter, Space |
| Column | `nav` "Conversations"; section headers are buttons with `aria-expanded`; each section a `list` of rows, each a button, the active one `aria-current="true"` | Enter or Space opens; Shift+F10 or the context-menu key opens the row menu |
| Column filter, resize handle | input "Filter conversations by title"; `separator` "Resize the conversation list" | Escape clears the filter |
| Header, composer and footer icon buttons | buttons named by their tooltips | Enter, Space |
| Messages | `region` "Messages" | — |
| Messages before a clear | each dimmed section a `group` "Before the clear. Claude no longer sees these messages." | — |
| Fold button | button "N earlier messages", `aria-expanded="false"` | Enter, Space |
| Prompt | "You", visible in Card and visually hidden in Bubble; copy button "Copy prompt" | the copy button is in the tab order |
| Card pickers (Theme, Conversation tabs, Prompt style, Prompt color) | `radiogroup` named by its row's name; each card a radio named by its name and described by its caption (Theme's Light and Dark and the Prompt color cards have none) | Arrow keys move the choice; Space selects |
| Custom color | the text field named by the row's name, `aria-invalid` while its value is refused, described by the error line; the color input's name "Pick a color" | Tab moves between them |
| Thinking toggle, group header, step row, agent row | button with `aria-expanded` | Enter, Space |
| Step and agent marks | icon shapes (spinner, check, x-circle) labelled "Running", "Done", "Failed" | — |
| Turn duration and cost | `tabindex="0"` while it has a hover card, `aria-describedby` the card while shown | focus shows the card |
| Jump rail | `nav` "Jump to a prompt"; ticks are buttons | Enter, Space |
| Composer | textarea "Message Claude"; chips are buttons named as above, attached items' remove "Remove <name>"; "+N" a button "Show hidden context (N)" with `aria-haspopup="dialog"` | Enter sends; Escape stops |
| Status line | `group` "Conversation status"; segments are buttons with `aria-haspopup="dialog"` and `aria-expanded` | Enter, Space |
| Popover | `dialog`, `aria-labelledby` its title; model, effort and mode lists are `radiogroup`s, one tab stop each; a choice is named by its label (a mode without its "⚠") and described by its description | arrows, Home and End move within a radio group without picking (Left and Right swap right to left); Enter, Space or a click picks; Escape closes |
| Permission card, question form | `group` "Permission request"; `group` named by the form's title | native controls |
| Report card | `region` named by its title; loading `aria-busy="true"`; failed `role="alert"` | — |

- `ui/announcer` holds one visually hidden `aria-live="polite"` region per panel. It says "Claude is waiting for you" on a `card` event that starts a wait in the active tab, and "Claude finished" on a `turn` event closing a turn of the active tab at `result`; it clears the region before each message so a repeat is read.
- The waiting state, MCP status and step status show as icon shape or text as well as color, and as text in their accessible labels.
- Focus shows a 2px `--ai-agent-panel-accent` outline on `:focus-visible`. SPEC gives focus rings `--accent-line`, but at 40-50% alpha it reaches only 1.67:1 (light) and 1.96:1 (dark) on the panel, below WCAG 1.4.11's 3:1; the boards draw no focus state, so the solid accent is used. Forced colors, reduced motion and direction: ADR-017.

### Performance budget

Targets are PRD-001.R29's; matrix row M8 profiles them.

| Path | Budget | Mechanism |
| --- | --- | --- |
| Text delta | A string append; a Markdown render into a scratch element at most every 250 ms (or 4 times the last render's cost), swapped in whole, none while the block is hidden; one render component alive per block | `ui/turn.appendDelta`, `state/stream-render`; scroll-follow as in [Stream to messages](#stream-to-messages) |
| Thinking delta | One text-node append; no layout read | `ui/turn.appendDelta` |
| Keystroke while any tab streams | Echo within 50 ms (p95) | The input handler writes only the textarea's own state; view-models recompute on state changes; no layout reads |
| Any frame | Under 100 ms | The rows below |
| Reopen of up to 1,000 messages | Last screen within 1 s, no visible reflow | [Reopen](#reopen) |
| Per-second labels | One text write per shown label per second | `state/ticker` |
| Idle | No timer, no frame callback | The ticker stops with no shown subscriber; usage polling per DES-007 |
| Fit, "+N", rail, All conversations | At most one pass per frame | The resize pass: reads, then pure fits, then writes |
| Column with unchanged inputs | No DOM write | `conversation-list` key, keyed rows |
| Tab switch | No re-render | Each tab keeps its messages element; panel-level components re-subscribe and write what differs |
| Tab close | DOM, listeners, observers, timers and render children released | The tab's `Component` (ADR-016) |
| Theme switch | One class change per scope root, inside the fence, and one style read; none when the mode is unchanged | `state/theme` |

### Seams for changes 002 and 003

| Seam | Where | Used by |
| --- | --- | --- |
| The messages model is a tagged union of item kinds; `ui/messages` maps each kind to a component | `state/tab`, `ui/messages` | [Change 002](../../records/changes/CHG-002-context-events.md): dividers, dimmed and folded segments |
| Prompt numbers run across the whole conversation | `state/prompts` | Change 002: clears |
| A slot after the context segment's percentage | `ui/status-line` | Change 002: prompt-cache state |
| The run bar is its own component above the composer; the tab item has a badge slot; the agent row a stop-button slot | `ui/run-bar`, `ui/tab-strip`, `ui/agent-row` | [Change 003](../../work/changes/CHG-003-agents-and-workflows.md): run bar, agent badge, per-agent stop |
| Popover content modules are host-agnostic | `ui/popover-host` | Change 003: running-agents popover; the workflow host is ADR-016's |

## Architecture rules

ADR-016's U1 to U7 and DES-001's A-rules apply. This design adds the rules below. `tests/architecture.test.mjs` checks every rule, with no named exception.

| # | Rule |
| --- | --- |
| P1 | Only `ui/popover-host` and `ui/hover-card-host` reference the popover and hover-card root classes (`ai-agent-panel-popover`, `ai-agent-panel-hover-card`) |
| P2 | Only `ui/announcer` sets `aria-live` |
| P3 | No repeating timer (`setInterval`, `setRepeatingTimer`) in `src/ui/`, `src/tab/` or `view`; per-second displays subscribe to `state/ticker` |
| P4 | In `src/ui/**`, geometry reads (`getBoundingClientRect`, `offsetTop`, `offsetWidth`, `offsetHeight`, `clientWidth`, `clientHeight`, `scrollWidth`, `scrollHeight`, `scrollTop`, `getComputedStyle`) occur only in `ui/shell`, `ui/status-line`, `ui/composer`, `ui/jump-rail`, `ui/tab-strip`, `ui/popover-host`, `ui/hover-card-host` and `ui/messages`; `theme-scope` reads one computed style value per switch, inside the fence (ADR-017) |
| P5 | Every `src/ui/**` module except `ui/dom`, `ui/markdown` and `ui/copy` has exactly one importer |
| P6 | Every `src/state/**` module has `tests/state-<name>.test.mjs` |

## Data and security

- Rendering: DES-001's boundary. Popovers, hover cards, tooltips and segment labels are text only; CLI-reported strings (model names and descriptions, command names, hints and descriptions, report cells, MCP server names) are set as text. Tool-result images come only from base64 data of the four allowed types.
- Residuals (ADR-010): the tab's `Component` is the render component, so other plugins' post processors see rendered reply text; `obsidian:` links go to Obsidian on click.
- Leaves the machine through the CLI: the prompt, the context block (paths; the selection up to 8000 characters; property values and link lists when that chip is on), attached images, and whatever the CLI's tools read. The selection and property values are note content sent without a tool call.
- The active-folder chip reads the file explorer's DOM (`.nav-folder-title[data-path]`), not a public API.
- Stored with the conversation (DES-005): prompts with their send time and context paths, replies, thinking, tool inputs, truncated results, turn records and report cards. `/status` cards carry the account email and organization into history and exports. Not stored: image bytes, tool-result images, subagent threads, background tasks, thinking times, per-turn tokens.
- Device-local: open tabs, column width, collapsed sections (DES-005), read back through `local-store` and type-checked.
- Clipboard: written only through `ui/copy` (copy buttons, and `report-view`'s "Copy as Markdown" and "Copy error" callbacks); a failure shows PRD-001.R15's Notice; never read. Pasted images arrive through the paste event.
- OS hand-off: `window.open` only in `ui/messages`' link handler; the usage popover's settings link is an `external-link` anchor that Obsidian opens.
- No network of the plugin's own.

## Rollout and rollback

- No feature flags.
- The new settings sync by default with PRD-001.R25's defaults; the send time is optional in `version: 1` (DES-005).
- Rollback: an earlier release ignores the send time and the new settings (Prompt color included; a Quiet prompt style migrated to Card with Clear shows there as Pop-out), starts the column at its own 180 px default when no width is stored, and shows each turn's session total, not the turn's own cost, in its meta line. No stored format changes beyond the optional send time.
- Observability: the messages themselves (error blocks, footers, card states) and Notices.

## Alternatives

ADR-016, ADR-017 and ADR-010 hold the decisions. Design-level choices they leave open:

- Strip and column moving the same live tab elements, against each drawing its own keyed rows: own rows, since a component owns one subtree (ADR-016) and keyed rows skip unchanged ones (R29).
- Moving the changes bar into the header in TypeScript, against grid areas over a `display: contents` header: grid areas, since the 640 px rule is a container query with no TypeScript signal and each threshold lives in one place.
- Measuring hidden copies of the status line, against labels that collapse while their inner span keeps its natural width: collapsing labels, with no second DOM; only the plan-usage segment hides outright, so that `isShown()` stops its polling.
- The number box's digits in the prompt ink, against the text color: the text color with an ink outline, as the settings boards draw it, so the digits read on every fill and Custom needs no ink of its own.
- Prompt colors as fixed palette tokens selected by a class, against one user-chosen color for every surface: fixed tokens for the nine named colors, so `tests/palette.test.mjs` checks each; only Custom is unchecked (ADR-017).
- Usage cards as Markdown, against `CommandReport`s: reports, one drawing path with the shared header actions, states and recorded form.
- The switcher's open-tabs list as an Obsidian `Menu`, against the popover host: the host, since a `Menu` is not a dialog named by its title (R32) and the list ends in "Previous conversations…".
- The strip's "All conversations" as the open-tabs popover, against an Obsidian `Menu`: the popover, since the `Menu` API reaches no item element, so its rows could carry neither the tabs' glyphs nor a close button (change 017), and one list then serves both triggers.
- Equal tab widths with a 76 px floor, against widths following the titles (the boards) with "All conversations" once a tab shrank below 64 px: equal widths (change 017), so a long title no longer squeezes the other tabs to a dot; no tab is then shrunk below readable before the strip overflows, so the control shows exactly while it overflows. 76 px is Firefox's default minimum tab width: the dot and about six letters.
- Its fit measured with the control as drawn, against measured as if the control were hidden (subtracting its width): as drawn, as the simpler rule; it cannot oscillate, and at most a band of widths as wide as the control (28 px) depends on the resize direction, where the strip scrolls by up to that much with the control shown.
- An agent's thread drawn by `ui/agent-row`, against `ui/turn` drawing it into the row's body: `ui/turn`, so text, thinking and groups have one drawing path and each component one importer (P5).

## Verification

Automated: the `node:test` specs below, whose test names start with the requirement ID, plus `tests/architecture.test.mjs` and `tests/styles.test.mjs`, all in `make verify`. Manual: the rows below, in a desktop vault against `tests/fake-cli.mjs` (scenarios `basic`, `permission`, `cancel`, `crash`, `rewind`, `mcp`, `turn`, `question`, `steps`), recorded in `docs/records/verification/` with screenshots or profiles.

| Row | Setup |
| --- | --- |
| M1 | Panel 300, 360, 440, 680 and 1040 px wide with "Conversation tabs" Automatic; 600 px tall at 440 and at 300 px wide |
| M2 | One and two CLI profiles; Ask before acting, Accept edits, Auto-approve everything and Bypass permissions; a main column from 360 px narrow enough for fit step 4, where the plan-usage segment hides and polling stops |
| M3 | Obsidian light and dark; Theme Auto, Light and Dark from Settings and from the panel's menu, each under both host modes; the default theme and one named community theme; ADR-017's theme checks; prompt-text contrast measured in DevTools |
| M4 | Obsidian zoom at 80% and 150%; a changed interface font size |
| M5 | The panel in a pop-out window |
| M6 | Keyboard only, then a screen reader (NVDA or VoiceOver) |
| M7 | Reduced motion on; Windows high contrast |
| M8 | DevTools Performance profiles on the new layout: streaming while typing in another tab; a 1,000-message reopen; 60 s idle; a heap snapshot after closing a tab; a Theme switch with 30,000 elements in the workspace (ADR-017) |

| Requirement | `node:test` | Manual |
| --- | --- | --- |
| PRD-001.R3 | `state-status-line`: the profile segment only with several profiles | M2: the popover, current profile checked; a pick before the CLI starts |
| PRD-001.R7 | `state-tabs`: order, `dotState`, `stripOverflows`, hover-card lines, the open-tabs list's rows; `state-tab`: `activity`, the close-confirmation rule | M1, M6: switch restores draft, scroll, chips and status line; close confirmation while working; drag; equal tab widths from one tab to overflow at 440 and 680 px; "All conversations" shown while the strip overflows, its list (glyphs, the active row, close and Delete, focus after a close), and the picked tab scrolled into view; reopen restores the tabs |
| PRD-001.R8 | `state-layout`: 820 and 780 px, Top, Side; `tabs-layout`: unset width, half-panel cap, drag range, stored 180 px unset | M1 between 780 and 840 px; drag, double-click |
| PRD-001.R9 | `conversation-list`: sections, sorting, buckets, filter, unchanged-input key | M1 at 1040 px: filter and Escape, collapse kept, row menu, pin; "More" at 300 px |
| PRD-001.R10 | — | Delete confirmation, the failure text, the detached tab |
| PRD-001.R11 | `state-composer`: placeholders, send label, Stop, dimmed send while waiting, the Escape action | `basic`, `permission`: Enter, Shift+Enter, IME, a message queued mid-turn, Stop, Escape |
| PRD-001.R12 | `commands`: bare messages; `attachments`: `planSend`; `context-format`: the block, its omission, the 8000-character cut, the 40-entry lists, the label; `state-composer`: the chips' labels and the inline offer rule | M1 at 440 px and 600 px tall: chips toggle, the inline offer chip, the one-line form; the context block in the CLI's input |
| PRD-001.R13 | `context-format`: an attached item listed once, the stored paths, `@` mentions, the selection's reference line | The attach picker, the file menu, a file chip opening its file, `@` mentions, "Add selection to chat" |
| PRD-001.R14 | `attachments`: `composerFiles`, refusals, drop order, the 10-name cap; `state-image-viewer`: open, step, size toggle, caption, thumbnail names, tool-result images | Paste and drop of images, of mixed files, of non-images only; the image viewer from a chip, a prompt and a tool result, by click and by key, in a pop-out window |
| PRD-001.R15 | `state-stream`: deltas, finalized text, thinking; `state-turn`: turn open and close, head labels, thinking labels and when thinking expands, copy text | `turn`: streaming, head, footer, copy; M6: the two announcements |
| PRD-001.R16 | `state-step-groups`: every grouping clause, cards before and after `tool_use`, threads, reopen; `tool-labels`: `resultCount` | `steps`, `permission` at 300 and 440 px |
| PRD-001.R17 | `inert-markdown` (DES-001) | Vault and external link clicks, page preview, no remote image (DES-001's row) |
| PRD-001.R18 | `state-stream`: subagent routing, totals replaced on `task_notification` | `steps`: agent row, thread, run bar Stop |
| PRD-001.R19 | `commands`: one description per panel command, the list merge | The slash list groups, the commands button, `/clear` |
| PRD-001.R20 | `commands`: report builders, the card header, `/help`'s "Show all N"; `state-tab`, `state-turn`: report items live and reopened; `tab-panel-commands`: recording with the command, a closed tab, Try again; `protocol`: the fake CLI's replies build every card | `basic`, and `FAKE_CLI_REFUSE_REPORTS` for failed cards: loading, failed, Try again, Refresh, Copy as Markdown, a refreshed recorded card after reopen |
| PRD-005.R11 | See [DES-007](../../current/design/DES-007-usage-and-cost.md#verification) | Harness: the segment, popover section and card row, dark and light |
| PRD-001.R21 | `commands`: `mcpReport`, `mcpActionRequests`; `tab-panel-commands`: argument errors, a row action's failure; `protocol`: the fake CLI's `/mcp` actions | `basic`: `/mcp`'s list and buttons |
| PRD-001.R22 | `models` | M2: the popover, a refused switch, the full id tooltip |
| PRD-001.R23 | `models`: effort levels and the effort table | M2: disabled levels; effort click focuses the effort control |
| PRD-001.R25 (theme and prompt rows) | `settings-core`: the new defaults; `promptLayout` | The Appearance section; each change reaching an open panel at once |
| PRD-001.R28 | `state-status-line`, `state-tabs`, `state-composer`: accessible labels; `tooltips`: no `aria-label` outside icon-only sites; `palette`: every drawn pair against its minimum in both palettes, no exceptions | M3 contrast, M6, M7 |
| PRD-001.R37 | `state-compaction`: the signals, the divider through E3 and V5 orders (status then boundary, boundary alone, failure, unfinished, empty session), the record and its summary patch, the texts and names; `state-stream`: compaction changes, the synthetic summary is not the uuid; `state-tab`, `state-turn`: the item, appended outside the turn, reopened from a record; `session`: the fake CLI's `compact-*` scenarios | `compact-auto`, `compact-manual`, `compact-failed`, `compact-empty`: the divider in both palettes at 340, 440 and 600 px, the wave, the Summary toggle, reopen, the exported note |
| PRD-001.R38 (reopened clear), PRD-003.R9, PRD-003.R13 | `state-clear-divider`: the view, the separator's name and the line, the record read back; `state-boundary-records`: the record; `state-tab`: the reopened item; `transcript-markdown`: the italic line; `restore`: Restore files hidden on turns before a clear, "Restore to before turn N" skipping them | A reopened clear: the divider in both palettes at 340, 440 and 600 px, the sub-line wrapping, the exported note |
| PRD-001.R38 (Stop and clear) | `state-stop-operation`: the machine and every race; `state-clear-dialog`: counts and title; `tab-clear-flow`: the stop over a rig host and over the fake CLI (`FAKE_CLI_STOP`); `tab-permission-flow`: refusing | The dialog against ClearStates §3 in both themes at 340, 440 and 600 px |
| PRD-001.R38 (held clear) | `state-clear-operation`: `reduceHold`; `tab-clear-flow`: the held clear, its write after the result handler, the declined clear, throwing host calls, a held permission card; `tab-held-sends`: the ordered queue; `state-held-rows`, `state-held-send` | The tray against ClearStates §2 in both themes at 340, 440 and 600 px |
| PRD-001.R29 | `state-ticker`: runs only while a subscriber is shown; `conversation-list`: key; `state-tab`: `followsEnd`, `scrollsUpByHand` | M8 |
| PRD-001.R30 | `state-composer`: `fitChips`; `state-tabs`: the switcher label; `state-bar-clearance`: overlap, no horizontal overlap, hidden, partial | M1, M4; the status line clear of Obsidian's status bar in the right sidebar, the left sidebar and the main area, with the bar shown and hidden |
| PRD-001.R31 | `state-status-line`: order, strings, labels, `fitStep` order and its last-step result, step 3 skipped in Auto-approve and Bypass | M1, M2, M4 |
| PRD-001.R32 | `state-popover`: every transition of both machines; `tooltips`: tooltips only on icon-only controls and the listed sites, the `--no-tooltip` rules and the token; `state-tooltips`: the class follows the setting | M1, M5, M6; "Show tooltips" off: no tooltip on a header, composer or column icon button, the conversation picker's delete button, nor on the model, effort, permission or profile segment, with rail ticks and hover cards still showing |
| PRD-001.R33 | `state-tab`: numbering across the conversation, commands and `!` runs unnumbered; `state-prompts`: rail fractions; `settings-core`: the styles and their order, an unknown stored style, `quiet` and `popout` included, loading as Card with the stored color kept, `promptLayout`; `state-prompt-color`: the colors and their order, the root classes, `acceptCustomColor`; `palette`: each named color's pairs | M1: both styles in every prompt color, both palettes; Custom accepted and refused; the pinned prompt, the rail; the Prompt style and Prompt color cards |
| PRD-001.R34 | `state-theme`: `resolveMode`, the mode and prompt color classes and the Custom property on attach, `css-change` and `settings`, roots that follow Obsidian's mode, shared attaches, detach, a second load and unload, settings rows released on redraw, the scope loaded before any view, the Theme labels and menu items; `styles`: the palettes, the contract, the accent's sources; `palette`: contrast in both palettes | M3, M5 |
| PRD-001.R35 | `state-prompts`: the starters for a note, a selection and neither | A starter fills the composer without sending |
| PRD-002.R1 | `state-permission`: outcome labels replace the buttons, answered once, the answering state; `tab-permission-flow`: the decisions, the pending set, withdrawn and ended cards | `permission`, `permission-flagged` in Auto-approve, `cancel`, `crash`, `question` with "exit" |
| PRD-002.R6 | — (diffs: DES-004) | `steps`: an edit's `+x -y` and diff; reopen shows stored counts |
| PRD-002.R7 | — | The chip, its popover, "Review changes" |
| PRD-002.R8 | `settings-core`: the mode table | M2 |
| PRD-002.R12 | `state-permission`: singular and plural titles, "N of M answered", Submit enabled, single- and multi-select answers; `tab-permission-flow`: the form in every mode | `question` |
| PRD-002.R16 | `state-tab`: `shellStatus`, a reopened run; `tab-shell-escape`: which texts run, the card running then ended, the record, "Add output to chat" | A `!` run's card |
| PRD-002.R18 | `restore`: the earliest turn offering Restore files; `state-prompts`: its prompt number | `rewind`: the button, its title, disabled while a turn runs |
| PRD-003.R1 | `state-prompts`: the send time only when recorded | Reopen a file without send times |
| PRD-003.R11 | — | M1: Transcript at 300, 440 and 1040 px and 600 px tall |
| PRD-005.R2, R4, R5, R10 | `state-usage-segment`: items, labels, tints, placeholders, hover rows, popover lines, failure text | M1; a failed refresh |
| PRD-005.R3 | `state-status-line`: polling visibility needs a fit step below 4 | M1 at 300 px and M2's step-4 case: no requests while hidden |
| PRD-005.R6 | `state-usage-segment`: the usage and credits reports | `/usage`, `/usage-credits` |
| PRD-005.R7 | `state-turn-cost`: per-turn cost from totals, reopen | `basic`: footer and its hover card |
| PRD-005.R8 | `state-status-line`: hidden before the first finished turn, warning from 80% | The hover card, the popover, "/context details" |

Independent verification boundary: CI runs `make verify` on the pull request, outside the implementing agent's control. The manual rows are run and recorded by someone other than the implementing agent.

## Open questions

None.
