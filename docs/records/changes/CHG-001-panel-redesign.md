# CHG-001 — Panel shell

**Status:** incorporated (2026-10-11)

## Intent

First of three deltas for the panel redesign, from the canvas in
[SPEC.md](../../work/research/redesign-canvas/SPEC.md); owner question O6 decides
whether it ships alone as release `r06-panel-redesign` (minor bump). Today the
panel has a header with the model id, a tab strip or column, one card per tool
call, a typing indicator, a composer with a control row (model, effort, mode,
profile) and footer meters (context, usage, cost), and a usage dialog. This
delta replaces them with a layout keyed to the panel's size, one status line
with popovers, grouped tool steps, a turn head and footer, prompt display
settings, a theme setting and an empty-conversation screen.

`/clear` keeps today's behavior here. Context events are
[change 002](CHG-002-context-events.md); the run bar, agent stops and workflows
are [change 003](../../work/changes/CHG-003-agents-and-workflows.md). This delta changes no protocol
use; its one storage addition is the prompt's send time (PRD-003.R1).

Evidence: the owner's requests (SPEC §8); the owner's approval of the SPEC §7
answers and redesign defaults
([owner decisions](../../records/research/owner-decisions.md) C17, D1 to D6,
logged 2026-10-10).

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[PRD-002](../../current/product/PRD-002-permissions-and-change-control.md),
[PRD-003](../../current/product/PRD-003-conversation-history-and-export.md),
[PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md).

Depends on: the pre-redesign fixes for PRD-001.R12 (`/` messages sent bare),
PRD-005.R7 (cost per session id), PRD-002.R7 (subagent edits in the change
list) and PRD-003.R1 (the stored profile) land first.

## ADDED requirements

### PRD-001

- **PRD-001.R30** — Layout by size. The main column is the panel minus the conversation list column; an offer chip is a context chip that is off.
  - The AI Agent Panel shall apply this requirement's width rules to the main column and its height rules to the panel, re-checking on every resize.
  - WHILE the main column is narrower than 360 px and the layout is the tab strip, the AI Agent Panel shall replace the strip with a switcher showing the active conversation's state, its title and the number of open tabs.
  - WHEN the user clicks the switcher, the AI Agent Panel shall list every open tab, pinned first, with its working or waiting state and a check on the active one, followed by "Previous conversations…".
  - WHILE the main column is narrower than 360 px, the AI Agent Panel shall replace the history, transcript and settings buttons with a "More" button whose menu offers "Previous conversations", "Open transcript" (when exported), "Export to Markdown" and "Plugin settings".
  - WHILE the main column is narrower than 360 px, the AI Agent Panel shall show the changes chip without its file count, turn-footer actions without labels and step rows without their item counts.
  - WHILE the conversation list column is shown, the AI Agent Panel shall show the active conversation's title, prompt count and start time in the header and hide the tab strip and the header's new-conversation and history buttons.
  - WHILE a conversation has changed files or an exported note, the AI Agent Panel shall show its changes chip (PRD-002.R7) and, while the main column is at least 360 px wide, its "Transcript" button (PRD-003.R11) on a bar under the header, or in the header while the column is shown or the panel is at most 640 px tall.
  - WHILE the panel is at most 640 px tall, the AI Agent Panel shall hide the offer chips, show the chips that are on or attached in one line after the commands button with "+N" for those that do not fit, and show one line of composer text.
  - WHEN the user clicks "+N", the AI Agent Panel shall list the hidden chips, each with a button that removes it or turns it off.
  - The AI Agent Panel shall keep messages in chronological order in the DOM and align a conversation shorter than the view to the bottom.
  - WHILE the main column is at least 300 px wide, the AI Agent Panel shall show no horizontal scroll bar on the panel or the messages, scrolling code blocks, tables and diffs inside themselves.
- **PRD-001.R31** — Status line.
  - The AI Agent Panel shall show under the composer one status line holding, in order, the model, effort, permission-mode and profile segments, then the context segment (PRD-005.R8) and the plan-usage segment (PRD-005.R4).
  - The AI Agent Panel shall label the effort and permission segments with the short strings of the effort table (R23) and the mode table (PRD-002.R8).
  - WHILE the main column is at least 560 px wide, the AI Agent Panel shall use those tables' long strings and add the 5-hour reset time to the plan-usage segment.
  - The AI Agent Panel shall give each status-line segment an accessible label that includes its value, such as "Reasoning effort: High" or "Permissions: Accept edits".
  - WHILE the status line does not fit on one line, the AI Agent Panel shall shorten it in this order until it fits: the profile segment to its icon, the effort segment to its icon, the permission segment to its icon, the plan-usage segment hidden, the context percentage hidden.
  - WHILE the main column is narrower than 360 px, the AI Agent Panel shall apply every step of that order.
  - WHILE a conversation is in Auto-approve or Bypass, the AI Agent Panel shall keep its permission segment red and labelled, at least with its short string, at every width.
- **PRD-001.R32** — Popovers, hover cards and tooltips. An item is a list or menu row.
  - WHEN a popover opens, the AI Agent Panel shall expose it as a dialog named by its title, mark its trigger expanded and move focus to its first control.
  - WHEN a popover opens, the AI Agent Panel shall close any other open popover.
  - WHEN the user presses Escape in a popover or picks one of its items, the AI Agent Panel shall close it and return focus to its trigger.
  - WHEN the user clicks outside an open popover, the AI Agent Panel shall close it and leave focus where the user clicked.
  - WHILE a popover is wider than the main column less 16 px, the AI Agent Panel shall narrow it to that width.
  - WHEN the pointer rests on an icon-only control for 400 ms, the AI Agent Panel shall show a text tooltip with the control's label.
  - WHEN the pointer rests for 500 ms on a tab, the context segment, the plan-usage segment or a turn's duration and cost, the AI Agent Panel shall show that element's hover card.
  - WHEN one of those elements receives keyboard focus, the AI Agent Panel shall show its hover card until focus leaves.
- **PRD-001.R33** — Prompt display.
  - WHERE "Prompt style" is "Pop-out" (the default), the AI Agent Panel shall show each prompt full width with its number, "You", its send time when recorded, and its context label.
  - WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned with its context label under it.
  - The AI Agent Panel shall number the prompts sent to Claude in order across the whole conversation.
  - The AI Agent Panel shall show a panel command or `!` run as a compact monospace message without a number.
  - WHERE "Pin the current prompt while scrolling" is on (the default), the AI Agent Panel shall pin the prompt of the turn at the top of the view to the top of the messages, cut to one line.
  - WHEN the user clicks a pinned prompt, the AI Agent Panel shall scroll to the start of its turn.
  - WHERE "Prompt style" is "Pop-out" and "Prompt jump rail" is on (the default), the AI Agent Panel shall show one tick per prompt along the right edge of the messages, at the prompt's relative position.
  - WHEN the pointer rests on a rail tick, the AI Agent Panel shall show the prompt's number and first line.
  - WHEN the user clicks a rail tick, the AI Agent Panel shall scroll to its prompt.
- **PRD-001.R34** — Theme.
  - WHERE "Theme" is "Match Obsidian" (the default), the AI Agent Panel shall draw the panel in Obsidian's current light or dark mode.
  - The AI Agent Panel shall take its colors, accent included, from the Obsidian theme's CSS variables and offer no accent setting.
  - WHERE "Theme" is "Light" or "Dark" and Obsidian's default theme is active, the AI Agent Panel shall draw the panel, its popovers and its modals with the colors Obsidian uses in that mode; Obsidian's menus, tooltips and notices keep Obsidian's mode.
  - WHERE "Theme" is "Light" or "Dark" and a community theme is active, the AI Agent Panel shall draw the panel in Obsidian's mode and show under the setting "Light and Dark apply with Obsidian's default theme only."
  - IF "Theme" is "Light" or "Dark" and Obsidian's colors read the same in both modes, THEN the AI Agent Panel shall draw the panel in Obsidian's mode and show under the setting "Light and Dark have no effect with this Obsidian setup."
  - IF "Theme" is "Light" or "Dark" and reading Obsidian's colors fails, THEN the AI Agent Panel shall draw the panel in Obsidian's mode and show under the setting "Light and Dark are unavailable: Obsidian's colors could not be read."

- **PRD-001.R35** — Empty conversation.
  - WHILE a conversation has no messages, the AI Agent Panel shall show the heading "Ask about your vault", the line "Summarize, refactor, link or draft notes with Claude Code." and the placeholder "Ask about your vault… (@ mentions a note, / runs a command)".
  - WHILE a conversation has no messages and a note is active, the AI Agent Panel shall offer under "From the open note" these starters, each followed by the prompt it inserts:
    - "Summarize <note name>": "Summarize @<note path>."
    - "Find notes to link here": "Find notes in this vault that @<note path> could link to, with one line on why for each."
  - WHILE a conversation has no messages and the active editor has a selection, the AI Agent Panel shall also offer the starter "Draft a follow-up from the selection", inserting "Draft a follow-up from the selected text in @<note path>."
  - WHEN the user clicks a starter, the AI Agent Panel shall put its prompt into the composer without sending it.

### PRD-002

- **PRD-002.R18** — Restore to before turn N.
  - WHILE a turn of the conversation offers Restore files (R14), the AI Agent Panel shall offer "Restore to before turn N" in the changed-files popover, N being the number of the earliest such turn.
  - The AI Agent Panel shall title "Restore to before turn N" "Rewinds every file Claude edited from turn N on, including files this list does not show. Changes by subagents, shell commands, vault tools and linked files stay."
  - WHEN the user presses "Restore to before turn N", the AI Agent Panel shall run Restore files (R14) for turn N.
  - WHILE a turn is running in the tab, the AI Agent Panel shall disable "Restore to before turn N".
  - WHILE the conversation's change list is empty, as after a reopen, the AI Agent Panel shall offer the rewind only through each turn's Restore files (R14).

## MODIFIED requirements

Clauses are named by their opening words. "Add:" appends a clause, "Remove:"
deletes one, "Title:" replaces a requirement's title.

### Renames

Applied wherever the term appears in the PRDs named; the entries below hold
every other change.

| Before | After | Where |
| --- | --- | --- |
| usage strip | plan-usage segment | all |
| strip | plan-usage segment | PRD-005 only |
| "Show usage strip" | "Show plan usage" (label; the key is unchanged) | all |
| usage dialog, the dialog, "Claude plan usage" | usage popover | PRD-005 |
| context meter, composer meter, meter | context segment | PRD-005 |
| the turn's meta line | the turn's footer | PRD-002 |
| a meta line, its meta line | a turn footer, its turn footer | PRD-001, PRD-005 |
| Branch from here | Branch | all |
| mode control | permission segment | PRD-002 |
| the composer's Profile control | the status line's profile segment | PRD-001 |
| Profile control (elsewhere) | profile segment | PRD-001 |
| composer's "+" picker | composer's attach picker | PRD-001 |
| an activity card | a step row | PRD-002 |

### PRD-001

- **PRD-001.R3** — CLI profiles.
  - Before: WHEN the user picks a profile in the composer of a conversation whose CLI has not started, …
  - After: WHEN the user picks a profile from the profile segment of a conversation whose CLI has not started, the AI Agent Panel shall start that conversation's CLI with the picked profile.
  - Add: WHEN the user clicks the profile segment, the AI Agent Panel shall open the profile list as a popover with the current profile checked.
  - Reason: the profile control moves to the status line (Q2).
- **PRD-001.R7** — Conversation tabs.
  - Before: WHEN the user switches tabs, …
  - After: WHEN the user switches tabs, the AI Agent Panel shall show that tab's own messages, scroll position, composer draft, chips, status line, background-task strip and turn state.
  - Before: WHILE a permission or question card in a tab is unanswered, …
  - After: WHILE a permission or question card in a tab is unanswered, the AI Agent Panel shall show a steady orange dot titled "Waiting for you" on the tab and set the composer placeholder to "Claude is waiting for your answer above…".
  - Before: WHEN the pointer rests on a tab, …
  - After: WHEN the pointer rests on a tab, the AI Agent Panel shall show a hover card with the title, "Working" and the elapsed time or "Waiting for you", and the prompt count, model, permission mode, start time and, when above zero, the conversation's cost (PRD-005.R7).
  - Add: WHILE the pointer is over a tab or the tab is active, the AI Agent Panel shall show the tab's close button.
  - Reason: Q37, Q38; the typing indicator gives way to the turn head (R15), and the cost leaves the composer (PRD-005.R7).
- **PRD-001.R8** — Tab layout.
  - Before: WHERE "Conversation tabs" is "Automatic", …
  - After: WHERE "Conversation tabs" is "Automatic", the AI Agent Panel shall show the column while the panel is at least 820 px wide (780 px while the column is already shown) and the strip otherwise, re-checking on every resize.
  - Add: WHILE no column width is stored, the AI Agent Panel shall size the column to 26% of the panel width, between 220 px and 300 px and at most half the panel.
  - Before: WHEN the user double-clicks the column's inner edge, …
  - After: WHEN the user double-clicks the column's inner edge, the AI Agent Panel shall forget the stored width and return the column to its default width.
  - Add: IF the stored column width is 180 px, THEN the AI Agent Panel shall treat it as not stored.
  - Remove: WHERE the layout is "Automatic", the AI Agent Panel shall cap the column width …
  - Reason: Q3 as the owner decided (BRIEF); width rules key on the main column (R30), so the cap has no job; earlier versions stored 180 px on a double-click.
- **PRD-001.R9** — Conversation list.
  - Before: WHEN the user runs "Previous conversations" from the command palette or the header button, …
  - After: WHEN the user runs "Previous conversations" from the command palette, the header's history button or the "More" menu, the AI Agent Panel shall show a searchable list of saved conversations with relative time and message count, and open the one picked (PRD-003.R9).
  - Reason: the history button hides while the column shows and below 360 px (Q36).
- **PRD-001.R11** — Send, steer and stop.
  - Before: WHILE a turn runs, the AI Agent Panel shall show a Stop button, …
  - After: WHILE a turn runs and no permission or question card waits, the AI Agent Panel shall show a Stop button titled "Stop Claude's turn" with the key Esc, label the send button "Queue message", and set the placeholder to "Claude is working. Enter queues another message…".
  - Add: WHILE a permission or question card waits, the AI Agent Panel shall show Stop, dim the send button labelled "Queue message", and still queue a message sent with Enter or that button.
  - Add: WHILE a conversation has messages and no turn runs, the AI Agent Panel shall set the placeholder to "Reply, or @ to mention a note…".
  - Add: WHEN the user presses Escape outside IME composition in the composer while a turn runs and no list, menu or popover is open, the AI Agent Panel shall ask the CLI to interrupt the running turn.
  - Add: WHEN the user presses Stop or Escape, the AI Agent Panel shall send no stop request for background agents or tasks.
  - Reason: Q8, Q21; Q22 as the owner decided (D4).
- **PRD-001.R12** — Note context.
  - Add: WHILE no context chip is on and nothing is attached, the AI Agent Panel shall hide the chips row and show the active-note offer chip after the commands button.
  - Reason: Q41.
- **PRD-001.R15** — Streaming messages.
  - Before: WHEN thinking streams in, …
  - After: WHEN thinking streams in, the AI Agent Panel shall show a collapsed "Thinking…" toggle for that block, in the turn head for the turn's first block and in place for later ones, reading "Thought for Ns" when done or "Thought process" when the time is unknown.
  - Add: WHEN the user clicks a thinking toggle, the AI Agent Panel shall show or hide that thinking.
  - Before: WHILE a turn runs or waits on the user, …
  - After: WHILE a turn runs and no permission or question card waits, the AI Agent Panel shall show in the turn head "Working", or "Writing" while reply text streams, with the elapsed time.
  - Add: WHILE a permission or question card in the turn waits, the AI Agent Panel shall show "Waiting for you" and the elapsed time in the turn head.
  - Add: WHEN a permission card or question form in the active tab starts waiting, the AI Agent Panel shall announce "Claude is waiting for you" to screen readers.
  - Add: WHEN a turn in the active tab finishes, the AI Agent Panel shall announce "Claude finished" to screen readers.
  - Before: WHEN a turn finishes, the AI Agent Panel shall add a meta line …
  - After: WHEN a turn finishes, the AI Agent Panel shall show under it an always visible footer with "Restore files" and "Branch" where available (PRD-002), a copy button, and the duration and cost (PRD-005.R7).
  - Before: The AI Agent Panel shall show a hover copy button …
  - After: The AI Agent Panel shall offer a copy action on every prompt, shown on hover or keyboard focus, and on every turn footer, copying the prompt's raw text or all the turn's reply text blocks joined by blank lines.
  - Reason: SPEC §2.7 Assistant turn and Turn footer; Q25. The thinking time is measured live and not stored.
- **PRD-001.R16** — Tool activity cards.
  - Title: Tool steps. A group is a run of a turn's tool calls shown as one steps card.
  - Before: WHEN Claude starts a tool call, …
  - After: WHEN Claude starts a tool call, the AI Agent Panel shall add to the turn's open group a step row with the tool's icon and name, a summary of up to 96 characters (file path, command, pattern, URL or description) and a running mark.
  - Add: The AI Agent Panel shall close a group at reply text, thinking, a permission card, a question form, a Task or Agent call, or the end of the turn, and open a new group at the next tool call.
  - Add: The AI Agent Panel shall show a Task or Agent call as an agent row (R18), outside any group.
  - Add: WHILE a call waits on its permission card or question form, the AI Agent Panel shall show no step row for it.
  - Add: WHEN a call's permission card or question form is answered, the AI Agent Panel shall add that call's step row as the first row of a new group.
  - Add: WHILE a group of two or more calls is open, the AI Agent Panel shall head it with "N steps" and a running mark.
  - Add: WHEN a group of two or more calls closes, the AI Agent Panel shall head it with an error mark if any call failed, else a done mark, then "N steps" and the group's duration.
  - Add: WHEN a group of three or more calls closes, the AI Agent Panel shall collapse it.
  - Add: IF a group holds one tool call, THEN the AI Agent Panel shall show it as a single row with its running, done or error mark and no header.
  - Add: WHEN the user clicks a group's header, the AI Agent Panel shall expand or collapse the group.
  - Before: WHEN the tool's result arrives, …
  - After: WHEN the tool's result arrives, the AI Agent Panel shall mark the row done or error and offer an expandable "Details" with the input (up to 2000 characters) and the result (up to 1500 characters).
  - Add: WHEN a Glob, Grep or `obsidian_search` call finishes since the conversation was opened, the AI Agent Panel shall show on its row the count its result states in its first line, or else its non-empty result lines, as "N files" (Glob), "N results" (Grep) or "N notes" (`obsidian_search`).
  - Add: WHEN a conversation is reopened, the AI Agent Panel shall close its groups only at stored reply text, thinking, Task or Agent calls and turn ends.
  - Add: WHEN a conversation is reopened, the AI Agent Panel shall head each stored group of two or more calls without a duration and show no counts on its rows.
  - Before: WHEN a tool result contains PNG, …
  - After: WHEN a tool result contains PNG, JPEG, GIF or WebP images, the AI Agent Panel shall show them in the row's details for the live session only.
  - Reason: SPEC §2.7 Steps card; Q26. History stores no permission cards, no per-call timing, and results cut to 1500 characters, which give wrong counts.
- **PRD-001.R18** — Subagents and background tasks.
  - Before: WHEN Claude delegates to a subagent, …
  - After: WHEN Claude delegates to a subagent, the AI Agent Panel shall show an agent row with its label, type, model, tool count, tokens, elapsed time and status, holding the subagent's replies, thinking and tool calls as a collapsed thread.
  - Remove: The AI Agent Panel shall summarize each subagent thread …
  - Add: WHEN the user clicks an agent row, the AI Agent Panel shall expand its thread in place.
  - Before: IF a subagent's Task card is not in the messages, …
  - After: IF a subagent's Task or Agent call is not in the messages, THEN the AI Agent Panel shall show its agent row on its own.
  - Reason: R16 places Task and Agent calls as agent rows; Q15. The removed clause is folded into the agent row.
- **PRD-001.R19** — Slash commands.
  - Before: WHEN the composer text starts with `/` and the command name is not yet followed by whitespace, …
  - After: WHEN the composer text starts with `/` and the command name is not yet followed by whitespace, the AI Agent Panel shall list matching commands in two groups, "Answered by the panel" marked "no tokens" and then "Claude Code", each with its description and argument hint, and insert `/<name>` and a space for the one chosen.
  - Add: The AI Agent Panel shall use one description per panel command in the command list and in `/help`.
  - Reason: SPEC §4.5; Q12.
- **PRD-001.R20** — Panel report commands.
  - Before: WHEN the user runs `/context`, the AI Agent Panel shall show the model, …
  - After: WHEN the user runs `/context`, the AI Agent Panel shall show the model, tokens used of the window with a percentage, a bar and legend by category and the auto-compact note, followed by memory files, MCP tools per server, agents and skills as collapsed sections.
  - Add: WHILE a report command waits for Claude Code, the AI Agent Panel shall show the card's title with "Asking Claude Code…" and mark the card busy.
  - Before: IF Claude Code returns an error, refuses the request, or gives no answer within 60 s, …
  - After: IF Claude Code returns an error, refuses the request, or gives no answer within 60 s, THEN the AI Agent Panel shall show the card's title with "Couldn't load", the text `Claude Code could not answer: <message>.` with a suggestion to update Claude Code, and "Try again" and "Copy error" buttons.
  - Add: The AI Agent Panel shall mark each answered report card "no tokens".
  - Add: The AI Agent Panel shall give every live report card a "Copy as Markdown" action.
  - Add: The AI Agent Panel shall give every live report card except `/help` a "Refresh" action that re-runs its command into the same card.
  - Add: WHEN a recorded report card is refreshed, the AI Agent Panel shall replace its recorded Markdown with the new report.
  - Add: WHEN the user clicks a command in a `/help` card, the AI Agent Panel shall insert `/<name>` and a space into the composer without sending it.
  - Add: WHILE Claude Code has reported more than three commands, the AI Agent Panel shall list three in a `/help` card behind a "Show all N" button.
  - Add: WHEN the user clicks "open /mcp" in a `/status` card, the AI Agent Panel shall run `/mcp`.
  - Reason: SPEC §4.9 to §4.15; Q9 to Q11; a refresh keeps restore, export and copy equal to the card.
- **PRD-001.R22** — Model selection.
  - Before: The AI Agent Panel shall offer in the model menu …
  - After: The AI Agent Panel shall offer in the "Model and effort" popover exactly the models the profile's CLI reported at its last start, plus a configured or picked model missing from that list, each with a description only where the CLI supplies one.
  - Before: The AI Agent Panel shall show the model id the CLI reports in the panel header.
  - After: The AI Agent Panel shall show the label of the model the CLI reports in the model segment and its full id in the segment's tooltip.
  - Add: WHEN the user clicks the model segment, the AI Agent Panel shall open the "Model and effort" popover.
  - Add: The AI Agent Panel shall show "Applies from your next message" in the "Model and effort" popover.
  - Reason: SPEC §4.22; Q14; conflict K1.
- **PRD-001.R23** — Reasoning effort.
  - Before: The AI Agent Panel shall offer "Default" plus every effort level …
  - After: The AI Agent Panel shall offer in the popover's effort control "Default" plus every effort level any reported model supports, in the CLI's order, labelled with the effort table's short strings, disabling levels the selected model does not support.
  - Add: WHEN the user clicks the effort segment, the AI Agent Panel shall open the "Model and effort" popover with focus on the effort control.
  - Reason: Q13, Q39. The table folds into this requirement.

Effort table:

| Level | Short | Long |
| --- | --- | --- |
| Default | Default | Default effort |
| Low | Low | Low effort |
| Medium | Medium | Medium effort |
| High | High | High effort |
| Extra high | Extra high | Extra high effort |
| Max | Max | Max effort |
| any other level the CLI reports | its name | its name and "effort" |

- **PRD-001.R25** — Settings tab.
  - Before: The AI Agent Panel shall default to the account's default model, …
  - After: The AI Agent Panel shall default to the account's default model, the CLI's default effort, note context on, tabs on top, no vault instructions, vault tools on (PRD-004), permission mode "Claude Code default", `!` shell escape on and bypass mode off (PRD-002), export off (PRD-003), theme "Match Obsidian" (R34), prompt style "Pop-out", the pinned prompt and the jump rail on (R33), and plan usage on (PRD-005).
  - Add: The AI Agent Panel shall list "Theme" under an "Appearance" heading and the prompt settings under a "Messages" heading.
  - Before: WHEN the user changes "Conversation tabs", the usage settings or the profile list, …
  - After: WHEN the user changes "Conversation tabs", the theme, a prompt setting, the usage settings or the profile list, the AI Agent Panel shall apply the change to open panels immediately.
  - Reason: SPEC §4.6; conflict K6.
- **PRD-001.R28** — Accessibility.
  - Before: The AI Agent Panel shall distinguish the user's own messages …
  - After: The AI Agent Panel shall distinguish the user's own messages from Claude's by a "You" label, shown in Pop-out style and given to screen readers in Bubble style, and by alignment or shape, not by color alone.
  - Before: The AI Agent Panel shall show the waiting-for-you state and MCP server status …
  - After: The AI Agent Panel shall show the waiting-for-you state, MCP server status and step status as text or icon shape as well as color, and as text in their accessible labels.
  - Before: The AI Agent Panel shall give an accessible label to the icon-only buttons …
  - After: The AI Agent Panel shall give an accessible label to every icon-only control, every status-line segment, the conversation switcher and the jump rail.
  - Before: The AI Agent Panel shall let the user focus every conversation tab …
  - After: The AI Agent Panel shall let the user focus every conversation tab, conversation-list row, status-line segment, popover control, step row, group header, agent row, thinking toggle, turn duration and cost, and rail tick with the keyboard and activate it with Enter or Space.
  - Reason: conflict K2; the controls R30 to R35 add.
- **PRD-001.R29** — UI performance.
  - Add: The AI Agent Panel shall drive every per-second display, such as elapsed times, from one shared 1 s ticker that runs only while such a display is visible.
  - Reason: every turn head and tab card gains a per-second display.

### PRD-002

- **PRD-002.R1** — Permission card.
  - Add: WHEN a permission card or question form settles (answered, withdrawn or ended), the AI Agent Panel shall replace its buttons with the outcome text and drop its waiting highlight.
  - Reason: Q24.
- **PRD-002.R6** — Edit outcome on the activity card.
  - Title: Edit outcome on the step row.
  - Before: WHEN that call succeeds, …
  - After: WHEN that call succeeds, the AI Agent Panel shall show `+x -y` on the call's step row and, in its details, the diff from the file as read to the file now on disk.
  - Before: IF that call fails, …
  - After: IF that call fails, THEN the AI Agent Panel shall keep the tool's raw result in the row's details.
  - Before: WHEN a conversation is reopened from history, …
  - After: WHEN a conversation is reopened from history, the AI Agent Panel shall show each edit's step row with the stored `+x -y` counts and the diff of the tool's own strings in its details.
  - Reason: tool cards become step rows (PRD-001.R16).
- **PRD-002.R7** — Changes this conversation.
  - Before: WHILE Edit, Write or MultiEdit calls …
  - After: WHILE Edit, Write or MultiEdit calls of the main agent or its subagents in the open conversation have changed files, the AI Agent Panel shall show a changes chip `N files +x -y`, placed as PRD-001.R30 specifies.
  - Before: WHEN the user clicks it, …
  - After: WHEN the user clicks the changes chip, the AI Agent Panel shall open a "Files this conversation changed" popover listing each file with its `+x -y` or "new", a "Review changes" button and "Restore to before turn N" (R18).
  - Add: WHEN the user presses "Review changes", the AI Agent Panel shall open "Changes this conversation" with one collapsible diff per file from its first recorded contents to its latest contents, a "new" tag for created files, and the file name as a link that opens the file.
  - Reason: SPEC §4.24 Changed files.
- **PRD-002.R8** — Permission modes.
  - Add: WHEN the user clicks the permission segment, the AI Agent Panel shall open the mode list as a popover with the current mode checked and "⚠ Auto-approve everything" and "⚠ Bypass permissions" in red.
  - Add: WHEN the pointer rests on the permission segment, the AI Agent Panel shall show the current mode's long string and hover text from the mode table, joined by " · ".
  - Reason: Q40; conflict K4. The table folds into this requirement; its last four rows are the modes R11 shows but the list does not offer.

Mode table:

| Mode | Short | Long | Hover text |
| --- | --- | --- | --- |
| Ask before acting | Ask | Ask before acting | Claude Code asks before any call its rules do not allow |
| Accept edits | Edits | Accept edits | file edits run without asking; other calls follow Claude Code's rules |
| Plan (read-only) | Plan | Plan (read-only) | Claude reads and plans, and edits nothing until you approve the plan |
| Auto-approve everything | Auto | ⚠ Auto-approve everything | every call runs without a card, except calls Claude Code's rules or hooks flag |
| Bypass permissions | Bypass | ⚠ Bypass permissions | Claude Code's permission checks are off |
| Don't ask | Don't ask | Don't ask (deny what isn't allowed) | calls Claude Code's rules do not allow are denied |
| Auto mode | Auto mode | Auto mode (Claude Code decides) | Claude Code decides which calls need a card |
| Inherited, last start known | that mode's short string | that mode's long string, then "· Claude Code's default when it last started" | that mode's hover text |
| Inherited, none known | Default | Claude Code default (set in its settings) | Claude Code's settings decide the mode |

- **PRD-002.R12** — AskUserQuestion form.
  - Add: The AI Agent Panel shall title the form "Claude has a question", or "Claude has questions" when it holds several.
  - Add: WHILE the form waits, the AI Agent Panel shall show how many of its questions are answered as "N of M answered".
  - Reason: SPEC §4.3 question form.
- **PRD-002.R16** — `!` shell escape.
  - Add: WHEN the command ends, the AI Agent Panel shall show "Claude hasn't seen this" beside "Add output to chat".
  - Reason: SPEC §4.3 shell card.

### PRD-003

- **PRD-003.R1** — Conversation file.
  - Add: The AI Agent Panel shall record each prompt's send time.
  - Reason: R33 shows it. Optional in `version: 1` (ADR-005's rule); prompts recorded earlier show no time.
- **PRD-003.R11** — Automatic export.
  - Before: WHILE the active conversation has an exported note, …
  - After: WHILE the active conversation has an exported note, the AI Agent Panel shall show a "Transcript" button that opens it, placed as PRD-001.R30 specifies, or in the "More" menu while the main column is narrower than 360 px.
  - Reason: Q1.

### PRD-005

- **PRD-005.R2** — Caching and rate floor.
  - Before: IF a usage request fails, …
  - After: IF a usage request fails, THEN the AI Agent Panel shall keep showing the previous figures and report the error in the plan-usage segment's hover card, the usage popover and the usage cards.
  - Reason: the strip's tooltip becomes a hover card.
- **PRD-005.R3** — Background refresh.
  - Before: WHILE "Show usage strip" is on and the strip is visible …
  - After: WHILE "Show plan usage" is on and the plan-usage segment is visible (window, the panel's sidebar and its pane shown, the segment not hidden by PRD-001.R31), the AI Agent Panel shall request usage within 30 s after the refresh interval has passed.
  - Reason: the segment can hide (PRD-001.R31).
- **PRD-005.R4** — Usage strip.
  - Title: Plan-usage segment.
  - Before: WHERE "Show usage strip" is on (the default), …
  - After: WHERE "Show plan usage" is on (the default), the AI Agent Panel shall show in the plan-usage segment the 5-hour window's percentage and the highest weekly window's percentage, each when reported, rounded down.
  - Before: The AI Agent Panel shall label the strip's items …
  - After: The AI Agent Panel shall label the 5-hour item `5h`, and the weekly item `wk` for the all-models week or the model's name for a model-specific week.
  - Before: The AI Agent Panel shall mark an item orange …
  - After: The AI Agent Panel shall tint the plan-usage segment orange from the warning threshold (default 70) and red from the critical threshold (default 90) reached by either item, each threshold settable from 0 to 100 in steps of 5, with the percentages always in text.
  - Before: WHEN the pointer rests on the strip, …
  - After: WHEN the pointer rests on the plan-usage segment, the AI Agent Panel shall show a hover card listing any refresh failure first as `⚠ Refresh failed: <error>`, then each window with its percent used and reset time.
  - Reason: SPEC §2.7 Status line, §4.24; Q7.
- **PRD-005.R5** — Usage details.
  - Before: WHEN the user clicks the strip, …
  - After: WHEN the user clicks the plan-usage segment, the AI Agent Panel shall open a "Plan usage" popover with "as of HH:MM", a Refresh button, a bar per reported window (title, percent, reset time and time to reset), the extra-usage line, a "/usage in chat" button and a "Usage settings ↗" link to `https://claude.ai/settings/usage`, and request usage.
  - Before: IF the last usage request failed when the dialog draws, …
  - After: IF the last usage request failed when the popover draws, THEN the AI Agent Panel shall show `⚠ Refresh failed: <error> - showing data from HH:MM.` in place of the "as of" line, or `Couldn't fetch usage: <error>` when there are no figures.
  - Add: WHEN the user presses "/usage in chat", the AI Agent Panel shall run `/usage` in the conversation.
  - Reason: SPEC §4.21; Q31 as the owner decided (D4).
- **PRD-005.R6** — Usage commands.
  - Before: WHEN the user sends `/usage`, …
  - After: WHEN the user sends `/usage`, the AI Agent Panel shall answer in the panel without a model turn, request a forced refresh, and show a "Plan usage" card led by "As of HH:MM" listing "Current session (5h)", "Current week (all models)", "Current week (Sonnet)" and each model-specific weekly limit, each when reported, with percent used, a bar, reset time and time to reset, plus extra usage when enabled and the warning and critical thresholds.
  - Before: WHEN the user sends `/usage-credits` or `/extra-usage`, …
  - After: WHEN the user sends `/usage-credits` or `/extra-usage`, the AI Agent Panel shall show a "Usage credits" card led by "As of HH:MM · also answers /extra-usage" with the credit status and any disabled reason, the monthly limit, credits used this period with the percent of the cap and a bar, and a link to claude.ai/settings/usage.
  - Reason: SPEC §4.10.
- **PRD-005.R7** — Turn cost and conversation totals.
  - Before: WHEN a turn finishes without an error, …
  - After: WHEN a turn finishes without an error, the AI Agent Panel shall show on its turn footer the duration in seconds to one decimal and the turn's cost to four decimals, being the `total_cost_usd` the CLI reports minus the one the previous finished turn of the same session reported, and record the duration and the reported total.
  - Add: WHEN a conversation is reopened, the AI Agent Panel shall show each turn's cost computed the same way from the recorded totals.
  - Add: The AI Agent Panel shall show the same per-turn cost in each exported turn's duration and cost line.
  - Remove: WHILE a conversation's cost is above zero, the AI Agent Panel shall show it in the composer, …
  - Remove: WHILE a conversation has a finished turn since it was opened, the AI Agent Panel shall give the composer meter a tooltip …
  - Add: WHEN the pointer rests on the duration and cost of a turn finished since the conversation was opened, the AI Agent Panel shall show the turn's input, output, cache-write and cache-read tokens and the note "At API prices; plans count usage instead".
  - Reason: a footer beside per-turn tokens reads as per-turn cost (constitution: honest about what it does; conflict K5). The conversation's cost stays in the tab hover card (PRD-001.R7), `/cost` and the export's `cost_usd`. History stores no per-turn tokens, so reopened turns show duration and cost only.
- **PRD-005.R8** — Context meter.
  - Title: Context segment.
  - Before: WHEN a turn finishes, the AI Agent Panel shall ask the CLI how full the context window is …
  - After: WHEN a turn finishes, the AI Agent Panel shall ask the CLI how full the context window is (15 s timeout) and show a ring and percentage in the context segment, in the warning color from 80%.
  - Add: WHILE the conversation has no finished turn, the AI Agent Panel shall hide the context segment.
  - Add: WHEN the pointer rests on the context segment, the AI Agent Panel shall show a hover card with the tokens used of the window and a bar.
  - Add: WHEN the user clicks the context segment, the AI Agent Panel shall open a "Context" popover with the model and window size, the tokens used with the percentage, a bar and legend by category marking deferred categories "(deferred)", the autocompact point with the tokens to go, and a "/context details" button.
  - Add: WHEN the user presses "/context details", the AI Agent Panel shall run `/context` in the conversation.
  - Reason: SPEC §2.7 Status line, §4.20; Q33.
- **PRD-005.R10** — Degrade quietly.
  - Before: The AI Agent Panel shall report usage, cost and context lookup failures only inside …
  - After: The AI Agent Panel shall report usage, cost and context lookup failures only inside the plan-usage and context segments, their hover cards and popovers, and the usage cards, never as a notice or an error in the messages.
  - Reason: the surfaces changed.

### Other PRD sections

- PRD-001 Problem, scope sentence becomes: "Scope: the panel, its layout and theme, its CLI sessions, conversations and tabs, the composer and its context, message rendering, subagents, panel commands, models and effort, settings, platforms and errors."
- PRD-001 Non-goals, add: "- An accent setting: the panel takes its colors from the Obsidian theme (owner decision D2, 2026-10-10)."
- PRD-005 Failure and recovery, the outage line becomes: "- During a long CLI or Anthropic outage the plan-usage segment keeps its last figures with the failure in its hover card (R2) and retries once per refresh interval (R3)."

## REMOVED requirements

None. Clauses removed from kept requirements are marked "Remove:" above. What
leaves the UI: the header's model status, the composer's control row and
footer meters, the usage dialog, the prompt's left bar, and close buttons on
inactive top tabs at rest.

## Adopted decisions

SPEC §7 answers apply as the owner approved them (D6), except:

- Q3: width rules key on the main column; only the column's 820 px threshold keys on the panel.
- Q4: ADR-017 decides the mechanism (owner D2): forced modes under Obsidian's default theme only, with no palette of the plugin's own (R34).
- Q13: "Extra high" everywhere; the mock's "Extra" is dropped.
- Q26: an open group of two or more calls has a header.
- Q30: owner D5, offered as "Restore to before turn N".
- Q41: at 640 px tall or less only the offer chips hide.

## Conflicts with accepted documents

- K1: the model popover footer's "this conversation only" contradicts PRD-001.R22 and R23, which seed new conversations with the last pick. Resolved in R22.
- K2: Bubble prompts carry no "You", which PRD-001.R28 requires. Resolved in R28.
- K3: the empty state's "Claude reads and edits files only with your permission" is false under Claude Code's default read rules, Accept edits, Auto and Bypass (constitution: honest about what it does). Resolved in R35.
- K4: the permission tooltip's "shell commands still ask" contradicts PRD-002's rule that Claude Code's rules decide what asks. Resolved in PRD-002.R8.
- K5: the mock's footer figures read as per turn; PRD-005.R7 shows the session's total. Resolved in PRD-005.R7.
- K6: SPEC §4.6 names a settings section "Transcript"; "transcript" is the exported note (owner A3). Resolved in R25.

## Design and migration impact

### ADRs

1. [ADR-016](../../current/adr/ADR-016-panel-ui-architecture.md), panel UI
   architecture (accepted): Obsidian-free `state/` modules and thin `ui/`
   components by vertical slice, walking skeleton first; module boundaries
   checked by `tests/architecture.test.mjs`; the workflow view's second host
   waits on change 003's O3 and E6.
2. [ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md), panel CSS
   architecture and forced theme (accepted): `--ai-agent-panel-*` tokens over
   Obsidian variables, container queries on the main column, forced modes
   resolved in a hidden document under the default theme only (R34), motion
   and reduced motion.
3. Dev-only DOM test harness, amending ADR-014: not yet drafted; the library
   choice, registry check and lockfile review are part of its acceptance.

ADR-010 (rendering), ADR-003 (usage through the CLI) and ADR-009 (new rows
sync by default) stand unchanged.

### Designs

- DES-003 is rewritten as the target "Panel UI" design and accepted as its
  first accepted version (owner A1, A3): layout model, components and their
  single jobs, state machines (composer, turn, tool-step group, permission
  card, tab), token contract, keyboard and accessibility, performance budget,
  verification matrix.
- DES-001: file map and module boundaries.
- DES-004: settled card, changes popover, "Restore to before turn N",
  permission popover and the mode table.
- DES-005: the prompt send time, the new settings keys, the column-width
  migration.
- DES-007: plan-usage segment and popover (`UsageDetailModal` removed),
  context segment and popover, per-turn cost in the panel and the export.

### Data, settings and rollback

- Conversation files stay `version: 1`; the prompt send time is optional. New
  settings (theme, prompt style, pinned prompt, jump rail) sync by default.
  "Show usage strip" keeps its key. A stored column width of 180 px reads as
  not stored.
- Rollback: the previous release ignores the send time and the new settings,
  starts the column at its old 180 px default, and shows the session total in
  the turn line again.

### Rollout, documents, verification

- Tasks in `docs/work/tasks/r06-panel-redesign/`, walking skeleton first: a
  container-query shell, header, composer and status line mounting today's
  messages and menus; send, stream, stop and one permission against the fake
  CLI; checked at 300 and 1040 px.
- Documents: README feature list; `RELEASE_NOTES.md` *Unreleased*;
  `docs/current/plan.md` Next changes lists changes 001 to 003 and the
  evidence spike; D-02's boundary part leaves
  `docs/current/open-decisions.md` with ADR-016.
- Every new and changed ID is named in a `node:test` case for its
  Obsidian-free logic (size rules, status-line shortening, tool-step groups
  and counts, prompt numbering, usage item choice, per-turn cost) or in a
  manual row of the DES-003 matrix: 300, 360, 440, 680 and 1040 px wide, with
  and without a profile segment and in Auto-approve; 600 px tall; light and
  dark; the default and one community theme; zoom; a pop-out window. The
  PRD-001.R29 profiles are repeated on the new layout.

## Owner questions

- **O1 — Restore files on turns before a clear** (change 002). SPEC §5 D1 keeps
  it working because "panel checkpoints are per turn"; ADR-006 removed those
  checkpoints and offers restore only for the tab's current session.
  - (a) Hide it on turns before a clear; it returns after Undo. Amends D1.
  - (b) Restart the tab's CLI on the turn's session, rewind, then resume the
    latest session. Needs E2 and an ADR-006 amendment in ADR 4.
  - Recommended: (a).
- **O2 — "Stop and clear"** (change 002, SPEC Q18). Q18 stops the agents and
  queues the clear until the turn ends, during which the main agent can start
  new agents. Recommended: interrupt the turn, stop every agent and background
  task, and clear when the CLI reports the turn ended.
- **O3 — Does the workflow requirement (PRD-001.R36, change 003) wait for
  E6?** Recommended: yes; if the stream names no group of agents, R36 is
  dropped and its ID retired.
- **O4 — One metered real-CLI evidence session before changes 002 and 003**,
  covering E1 to E7 ([change 002](CHG-002-context-events.md#evidence-spike)),
  native and WSL, on Haiku, with sanitized stream transcripts recorded in
  `docs/records/verification/` and the fake-CLI scenarios derived from them.
  Recommended: approve.
- **O5 — Empty-state copy**: R35's heading, line, placeholder, starters and
  the prompts they insert. Recommended: approve as written.
- **O6 — Release.** (a) Ship 001 as `r06-panel-redesign` and changes 002 and
  003 in the next minor release; (b) hold r06 until all three are done.
  Recommended: (a); 002 and 003 wait on the evidence spike, and 001 needs
  none.

Adopted until the owner confirms: O5 as recommended; O6 (a), recorded in
`docs/current/plan.md`.

## Incorporation

Approval folds these deltas, the renames and the two tables included, into
PRD-001, PRD-002, PRD-003 and PRD-005 in `docs/current/product/` without
renumbering unchanged requirements, with R34 as ADR-017 finalized it.
`make close DOC=docs/work/changes/CHG-001-panel-redesign.md` moves this delta to
`docs/records/changes/`, both in the approval commit. An accepted requirement
never lives outside the PRD.
