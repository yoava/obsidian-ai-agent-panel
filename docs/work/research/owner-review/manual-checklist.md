# Manual checklist

Rows owed by hand in a desktop vault, from the closed task records r05 (001-029, 043-045) and r06
(030-042). Run by someone other than the
implementer; record results in `docs/records/verification/` (write-once).

## Setup

Build and deploy: `make verify` passes, then copy `main.js`, `manifest.json`, `styles.css` to
`<vault>/.obsidian/plugins/ai-agent-panel/` and reload Obsidian (Ctrl/Cmd-R). Obsidian desktop 1.8.7+;
reviews ran on 1.14.4 (rendering fuzz also on 1.12.7). "Conversation tabs" stays Automatic unless a row
says otherwise. `[real CLI]` marks rows the fake CLI cannot show (metered use needs the owner's go-ahead).

Fake CLI (no login, no tokens; DEVELOPMENT.md "Running the panel against the fake CLI"). The CLI inherits
Obsidian's environment, so set the scenario before Obsidian starts; quit Obsidian first (a running
instance takes the launch without it). Default scenario `basic`.

Windows, native (Node on `PATH`):

1. Create `fake-claude.cmd` holding one line:
   `@node "C:\path\to\obsidian-ai-agent-panel\tests\fake-cli.mjs" %*`
2. Plugin settings: a CLI profile's path = that `.cmd`, "Run via WSL" off. Keep the profile's additional
   arguments free of `"` `%` `!` `&` `|` `<` `>` `^`.
3. PowerShell:
   `$env:FAKE_CLI_SCENARIO = "permission"; & "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe"`
   Change scenario = quit Obsidian, set the variable, relaunch.

Linux/macOS: profile path = absolute path of `tests/fake-cli.mjs`; `FAKE_CLI_SCENARIO=permission obsidian`.

Other variables, set the same way: `FAKE_CLI_REFUSE_MODE`, `FAKE_CLI_REFUSE_MODEL`,
`FAKE_CLI_MODE_DELAY_MS`, `FAKE_CLI_REFUSE_USAGE=1` (usage and context lookups fail),
`FAKE_CLI_REFUSE_REPORTS=1` (report requests fail).

Scenarios used below:

- `basic`: replies `echo: <text>`.
- `permission`: Edit of `note.md`, asks, ends after the answer; a message sent meanwhile queues; Stop or Esc
  withdraws the card ("Cancelled").
- `permission-flagged`, `permission-unflagged`: flagged or unflagged requests (use in Auto-approve).
- `rewind`: 2 s turns writing `Fake CLI note.md` and `Fake CLI new note.md`; restore works.
- `turn`: ~4 s streamed turn (thinking, reply with list/table/code, Read call, short reply, $0.0123 per
  turn, token usage); a message containing "error" ends in an error result.
- `question`: two questions, then one more; "exit" in the message exits the CLI (code 3) 1 s after the form.
- `steps`: ~3 s turn with a tool group, an Edit of `Fake CLI steps note.md`, a Task agent, a background
  agent and a background `sleep 12`.
- `cancel`, `crash`: card withdrawn by the CLI on its own; CLI exits with stderr. (`mcp` routes
  `mcp_message` vault-tool calls; `/mcp` itself answers in every scenario.)
- After any message: plan usage reads `5h 42%` and orange `Sonnet 81%`; context 32%, +20 points per turn.
  Panel commands (`/mcp`, `/status`, `/memory`, `/hooks`, `/permissions`, `/skills`, `/chrome`, `/sandbox`,
  `/cost`) answer in every scenario; `/context` needs a finished turn.

Panel matrix (DES-003): widths 300, 360, 440, 680, 1040 px (the column shows from an 820 px panel); 600 px
tall; Obsidian light and dark; Theme Match/Light/Dark; default theme and one community theme; zoom 80% and
150%; pop-out window; Windows high contrast; reduced motion. Unless a row lists widths, check at 300 and
1040 px. Surfaces named in parentheses are current ones; r05 rows were written before the redesign.

## r05-pre-redesign-fixes

### 001 Rendering boundary [Dataview vault; no CLI]

- Deploy to a vault with Dataview: JavaScript and inline JavaScript queries on; inline queries, codeblock
  inline queries and pretty inline fields on.
- In an empty folder run `python3 -m http.server 8765 --bind 127.0.0.1`; its log shows any request.
- With Obsidian closed, save the probe as `probe.md` beside `make-history.mjs` and run
  `node make-history.mjs "<vault>/.obsidian/plugins/ai-agent-panel/history/rendering-boundary-probe.json"`
  (probe and script: task 001 Outcome).
- Open the panel and reopen "Rendering boundary probe": no `RAN-` text, no request in the server log; math,
  the `bash` block's highlighting, the list and the link still render.
- Export the conversation, open the note in reading view: same result.
- Record Obsidian and Dataview versions, settings and result.

### 002 Restore through the CLI's checkpoints

- Dialog and button states (now the turn footer "Restore files" and "Restore to before turn N"): `rewind`;
  see 036 rows 5 and 7, 037 row 5.
- [real CLI, WSL] Restore with a WSL profile (`WSLENV` carries `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING`):
  preview lists files, confirm restores them.

### 003 Permission mode and sync hardening

- `permission-flagged`, Auto-approve, `note.md` present: a flagged request shows a card; Allow waits for
  the pre-edit read with its buttons disabled meanwhile. `permission-unflagged`: no card.
- Reopen a conversation stored in Auto-approve from a column row, the picker and a tab restored at view
  open: dialog with focus on "Keep current mode"; Enter keeps; declining leaves the file unchanged and asks
  again next reopen; no dialog when the tab is already in Auto-approve.
- Bypass on, a tab in Bypass: turn bypass off in settings and close: the tab goes to Ask, a running turn
  gets `default` and the CLI restarts after it. Turn it on again: open sessions restart with the flag.
- Click a security setting's sync badge twice quickly: it ends in the state shown.

### 004 Diff context, gaps and the cut

- Click a gap on a 20,000-line file of paragraph-length lines: expands within 100 ms (DevTools Performance).
- The "N more rows not shown" row looks distinct in light and dark.

### 005 Vault-tool limits and replies [real CLI]

- `obsidian_active` with the panel focused: right after opening the panel over a note; after closing the
  last-focused note; after switching its tab to a PDF.
- Rename with automatic link updates on, then off: the reply follows the setting.
- `obsidian_search` with `limit` 0, then 2.5.

### 007 Usage timer and conversation cost (now 033 and 034 surfaces)

- Hide the sidebar, open two panels: one usage timer, none while hidden (033 row 7).
- Reopen a conversation: its cost shows in `/cost` and the tab hover card before any new turn.
- Plan-usage popover: Refresh disabled while a request runs; "usage unavailable - click to retry" retries
  (033 rows 3 and 4).
- Export a conversation: `cost_usd` present, omitted at zero.

### 008 Session and protocol fixes

1. Set *Model* to an id the account lacks (or `FAKE_CLI_REFUSE_MODEL`), pick it mid-conversation: Notice
   `Could not switch model: ...`; control returns; a later effort change restarts on the previous model;
   reopening shows the previous model. Close the tab right after the pick: no Notice.
2. [real CLI] Branch from the first of three turns, press Enter at once with "What was my last question
   before this one?" (slow profile, e.g. WSL): the answer names the first turn's question; `ps` shows one
   `claude` for the tab.
3. Point the profile at a missing CLI, branch and send: error shows. Fix the path, send: reply ignores the
   later turns.
4. Branch, close the new tab before sending: no `claude` process remains.

### 009 Permission card: the note it names, the plan it shows [real CLI]

1. Long ExitPlanMode plan: whole plan rendered above "Full input" from its top; scrolling up while it
   renders leaves the list alone.
2. Short plan: the buttons are in view after it renders.
3. Plan with a fenced block, a `dataviewjs` block, inline code and an `![[note]]` embed or remote image:
   inert code, nothing runs or loads.
4. In DevTools replace `MarkdownRenderer.render` from `require("obsidian")` with a function that throws,
   trigger a plan: it shows as plain text with line breaks.
5. A wide table in a plan scrolls sideways inside the card.
6. `obsidian_open` with a `path` and a different `file_path`: the card and activity line name the `path`
   note; the tool opens it.
7. A lookalike server's `mcp__<other>__obsidian_open` keeps its CLI title and generic summary.

### 010 Vault bounds and subagent edits [real CLI]

- A subagent edit appears in the change list under Default, Accept edits and Bypass.
- A deliberate restart mid-subagent (effort change): the change list stays consistent.
- An edit card for a `<vault>/../x.md` path says it is outside the vault.

### 011 What a conversation stores and restores

- Reopen on a stored profile and on a profile this device lacks (default profile; a pick is accepted).
- Default model and effort picks survive a reopen.
- Tampered history file and `data.json` (session id, model or effort with spaces or `-`): read as absent.
- Profile pick with a live, an ended and a panel-command-only session: rules per PRD-001.R3 (032 row 1).
- Pin on a fresh tab from the hover pin and the row menu: pin kept, written with the first message.
- Export an old (0.5.x) and a new file: frontmatter `model`.

### 012 Conversation titles, list, delete and export

- New tab, `/status` then `!ls`: tab, tooltip, column row and tab menu say "New conversation"; file `title`
  is `""`; then a prompt: the title is its first line.
- Old file with `"title": ""`: "New conversation" in the picker, found by searching "new".
- Picker trash: dialog; Cancel and Escape keep row and file and return focus to the input; Delete removes
  both and detaches a tab showing it; typing works afterwards.
- Delete from the row menu with the panel in two windows: both tabs detach.
- Reload with a large history; while the column says "Loading...", pin one row and export another: after the
  scan the row is still pinned and the file has its `exportPath`.
- Export a Recent row whose file was damaged or removed: "Could not load that conversation."; export from a
  fresh or pinned-empty tab: "Nothing to export yet."

### 013 Composer: bare commands and image types

- [real CLI] `/compact` with a note open and an image pending: runs as a command; the image chip stays.
- [real CLI] `/compcat` (mistyped command): sent bare, without the context block.
- Branch on the `/compact` turn (footer "Branch").
- Drop a BMP, an SVG and ten PNGs: one Notice "Not attached:" naming each refusal.

### 014 Settings validation and texts

- *Default CLI profile* (several profiles) mentions picking a profile from the composer's Profile control;
  *Show plan usage* (was *Show usage strip*) describes the segment and popover; tab-position dropdown lists
  Top, Side, Automatic.

### 015 Release a closed tab's rendered components

- Two tabs, each with a reply holding an `![[note]]` embed. DevTools: wrap `Component.prototype.unload` from
  `require("obsidian")` with a counter for `this.containerEl?.hasClass("markdown-embed")`.
- Close one tab: counter rises by that tab's embeds; the other tab's embed stays live. Close the view: rises
  by the rest.
- Open a stored conversation in an empty tab whose conversation was deleted: rises by the old replies' embeds.

### 016, 017 Rename refusals [real CLI or a vault-tool call]

- `obsidian_rename` to each target: `..` segment, absolute, drive, `.obsidian/x`, `OBSIDI~1/x.md`,
  `.claude/x.md`, `.git/hooks/x`, `.mcp.json`, `notes/.hidden/x.md`: refused, nothing created or moved.
- `./notes/x.md`, a rename into a new folder and `notes/a.b.md` succeed.

### 018 Templater commands in exports

- Templater with "Trigger Templater on new file creation" on: export a conversation holding `<%* ... %>` in a
  reply, a fence and tool output: the note opens with nothing run.

### 019 Dataview inline fields

- Dataview on: a reply holding `(k:: ![x](http://127.0.0.1:8765/x.png))`, plain and escaped, in the panel
  and in the exported note: no request, no field shown.

### 020 Tool and shell output in exports

- Dataview on: a tool result and a `!` run printing `= this.file.name` and `$= dv.span("x")`, plus a
  multi-line command: all show as text in the exported note.

### 021 CLI profiles never seeded

- A new device on a synced vault (no local profiles) starts with auto-detect, not the `data.json` profile.
- Flip the CLI group's badge to synced: this device's profiles become the shared ones.

### 023 A paste or drop mixing images and other files

- Drop a PNG with a PDF (PDF named in "Not attached:"), a PNG with a folder, a PDF alone (left to Obsidian),
  a PNG alone, a vault link dragged from the file explorer (text only).
- Paste a screenshot; paste two copied files (a PNG and a PDF).

### 024 Launch settings reach open tabs [real CLI]

- Edit vault instructions with one conversation open and one mid-turn; close settings: both restart after
  their turn; ask Claude for the instructions.
- Switch the Obsidian tools off: `/mcp` loses the server.
- Pick a profile in a started conversation: Notice "This conversation stays on <profile>; start a new
  conversation to use another."

### 025 Auto-approve: a card for safety checks [real CLI]

- In Auto-approve, have Claude run `ls &` (background-operator safety check): a card shows.

### 026 Draw a diff's first rows in chunks

- A 4,000-row diff on a permission card and in the changes list stays responsive, no task past 100 ms.
- A short diff draws in one frame.
- Close the card or list mid-draw: no error, nothing more drawn.

### 028 Notice when a history write fails

- Make the history folder read-only, send two messages: one Notice and one console error per save.
- Open a second panel view on the same conversation: still one Notice.

### 029 Read a stored title that is not a string as none

- Set a file's `title` to `5` and `exportPath` to `{}`, reload the plugin: lists as "New conversation",
  exports without "Export failed".

### 043 Restart after the old process closes

- Change the effort and send at once: `ps` shows one `claude` per tab; the message is answered.
- Send right after an effort change and press Stop at once: the turn stops.
- Windows: stopping `cmd.exe` or `wsl.exe` ends the CLI behind it (DES-002 manual verification).

### 044 Check the fields of stored messages on read

- Set one stored message to `null`, another's `text` to `5`, a `contextPaths` to `"a.md"`, reload: the
  conversation opens and exports without "Export failed"; the console warns with the dropped count; the next
  save removes the `null` entry.

No manual rows: 006, 022 (dropped), 027, 045.

## r06-panel-redesign

### 030 Walking skeleton (`basic`, `permission`; 300 and 1040 px)

1. Shell: no horizontal scroll bar; strip in the header at 300 px, column at 1040 px; DevTools shows
   `.ai-agent-panel.ai-agent-panel-scope` as a size container and `.ai-agent-panel-main` as inline-size.
2. `basic`: Enter sends, `echo:` reply drawn and scrolled into view; Shift+Enter inserts a newline; Enter
   during IME composition does not send; Enter with no text and no image sends nothing.
3. A new tab's placeholder is PRD-001.R35's; after a reply "Reply, or @ to mention a note..."; text starting
   with `/` is monospace.
4. `permission`: card shows; tab dot steady; placeholder "Claude is waiting for your answer above...";
   Send reads "Queue message", dimmed, still sends, message marked "queued mid-turn"; Stop (tooltip "Stop
   Claude's turn (Esc)") shows. Allow ends the turn; on new turns: Deny ends it; Stop withdraws the card
   ("Cancelled") and the composer idles; Esc in the textarea with no list open does the same.
5. Status line, in order: model, effort, permission, profile (only with a second profile), context (after the
   first turn), plan usage (only while "Show plan usage" is on); a screen reader names each ("Model: ...",
   "Reasoning effort: ...", "Permissions: ...", "CLI profile: ..."); short strings at 300 px, long at
   1040 px; Auto-approve and Bypass red; each opens its popover (032), plan usage its popover (033).
6. PRD-001.R13: attach picker adds a chip; "Add to agent chat" adds one; a file chip opens its file, x
   removes it; `@` offers notes and inserts `@<path>`; "Add selection to chat" appends after a blank line.
7. PRD-001.R14: pasted and dropped images get a thumbnail chip, a click removes it; image + PDF drop names the
   PDF in "Not attached:"; a PDF alone is left to Obsidian; a ninth image is refused in the Notice.
8. Switching tabs brings the incoming tab's draft, chips, images and segments.
9. "Show plan usage" and "Conversation tabs" changes reach the open panel at once.
10. Gone: header model id, composer control row, footer meter, usage strip.

### 031 Theme (300 and 1040 px)

1. Settings: "Appearance" > "Theme" (Match Obsidian, Light, Dark) with the synced badge; settings search
   finds "Theme" (1.13+); the note shows there and follows status changes; classic tab below 1.13;
   `"theme": "blue"` in `data.json` loads as Match Obsidian.
2. M3, default theme, Obsidian light then dark: Match draws Obsidian's mode, no
   `.ai-agent-panel-theme-frame`; Theme equal to Obsidian's mode forces nothing and shows no note; the other
   mode draws the panel, `@` and `/` lists and each modal (history picker, attach picker, delete
   confirmation, restore preview, changes this conversation, plan usage) in it at once, text and caret
   included; popovers' menus, tooltips and Notices keep Obsidian's mode; no transition flash.
3. While forced: switch Obsidian's mode both ways, change accent, change font size, enable and disable a
   plugin with `styles.css`, toggle a snippet changing `--background-primary`: each re-resolves, one pass per
   frame (Performance recording).
4. A named community theme: Light/Dark draw Obsidian's mode with "Light and Dark apply with Obsidian's
   default theme only."; back to the default theme, forced again. Restart Obsidian with a community theme and
   Light set: never forced; then the default theme: forced.
5. Snippet making `--background-primary` and `--text-normal` equal in both modes: "Light and Dark have no
   effect with this Obsidian setup.", nothing forced.
6. Console: `app.customCss.theme = 5`, then a mode switch: "Light and Dark are unavailable: Obsidian's colors
   could not be read." plus `console.error`; `app.customCss.theme = ""` restores.
7. M5: pop-out window takes the values; a mode switch made in the pop-out reaches it.
8. Match after a forced mode, and disabling the plugin while forced: no frame, no `theme-light`,
   `theme-dark`, `is-switching-theme`, inline `--*`, `color`, `caret-color` or `scrollbar-color` left on a
   panel root or modal.
9. DevTools Network, forcing with a snippet holding `@import`, an `@font-face` `url()` and a mode-dependent
   `background-image`: no request from the frame (its element shows `sandbox` and the policy meta); no policy
   error besides blocked fetches. Heap snapshot with and without the frame.
10. M7: reduced motion; Windows high contrast (Theme has no visible effect).
11. M8: forced, 30,000 elements in the workspace: profile opening a forced panel and a mode switch. Under
    100 ms, or ADR-017's 500-rule chunks follow (owner decision 48).

### 032 Status-line popovers (300 and 1040 px unless stated)

1. M2 profiles: one profile, no segment; two, the segment opens "CLI profile" with the current checked; a
   pick before the CLI starts shows and the next send uses it; after a turn the Notice reads "This
   conversation stays on <profile>; start a new conversation to use another."
2. M2 modes: "Permissions" lists Ask before acting, Accept edits, Plan (read-only), red "Auto-approve
   everything", the current checked; "Bypass permissions" only after enabling it; with `FAKE_CLI_REFUSE_MODE`
   the segment returns and the Notice reads `Could not switch mode: ...`; tooltip "<long> . <hover text>".
3. M2 model and effort: "Model and effort" with "Default model" first, current checked; effort Default, Low,
   Medium, High, Extra high, Max; "Applies from your next message"; the effort segment opens it with focus on
   the checked effort; with `FAKE_CLI_REFUSE_MODEL` a pick rolls back with `Could not switch model: ...`;
   model tooltip is the full id. (Descriptions and disabled levels need a CLI-reported model list: real CLI.)
4. M2 and M1 fit (column layout at 1040 px; drag the column; panel 680, 440, 360): collapses profile label,
   then effort, then permission, then hides plan usage (no further `get_usage`), then the context percentage;
   in Auto-approve and Bypass the permission segment keeps "Auto" or "Bypass" in red; below 360 px every step
   applies; the line never wraps, no horizontal scroll bar; widening restores in reverse.
5. A popover opens up from its segment, start edge for model and effort, end edge for a segment right of
   centre, at most the main column less 16 px; at 600 px tall the list scrolls inside.
6. M4: at 80% and 150% zoom and a changed interface font size the line re-fits without a resize.
7. M5: in a pop-out window a popover opens and closes on Escape, outside click and pick; focus returns.
8. M6: Tab reaches each segment; Enter or Space opens with focus on the checked choice; arrows, Home, End
   move without picking; Enter or Space picks, closes, refocuses; Escape closes and refocuses; Tab out
   closes; outside click closes and focus stays; a tab switch closes it and focuses the composer if focus
   was inside; a screen reader announces the dialog by title, radio groups, checked state and expanded state.

### 033 Context and plan usage (300 and 1040 px unless stated)

1. M1 plan usage: before a message `usage...` then "usage unavailable - click to retry"; after one `5h 42%` and
   orange `Sonnet 81%` on an orange segment, `resets HH:MM` after `5h` from a 560 px main column; warning 40
   turns `5h` orange, critical 80 turns the segment red; "Show plan usage" off hides it, no `get_usage`.
2. Hover cards: 500 ms rest shows the card above the segment, leaving drops it; Tab onto a segment shows it at
   once until blur; click opens the popover and drops it, no card arms while open, Escape returns focus
   without a card; `role="tooltip"` named by `aria-describedby`; switching to a tab with no finished turn
   drops the context card.
3. "Plan usage" popover: "as of HH:MM"; Refresh disabled until the request settles (enabled when the 10 s
   floor drops it); four bars with `resets ... (in ...)`, Sonnet orange; "Extra usage: $3.50 (of $50.00) -
   7%"; "/usage in chat" closes it and posts the `/usage` card; "Usage settings" opens claude.ai/settings/usage.
4. Failed refresh: after a message close that tab with another open; Refresh: the hover card leads with
   `Refresh failed: Plan usage comes from a running session - send a message first.` above the old rows; the
   popover ends `... - showing data from HH:MM.`
5. Context: hidden in a new tab and a reopened conversation until a turn finishes; then 32%, 52%, 72%, orange
   92% at the fourth; hover card tokens and bar; popover "fake-model-1 . 200.0k window", bar, legend with
   "System tools (deferred)", "Autocompacts at 167.0k . ... to go"; "/context details" posts the `/context`
   card. With `FAKE_CLI_REFUSE_USAGE=1`: empty ring, no percentage, "Claude Code has not reported the context
   window yet."
6. PRD-005.R10: no Notice and no error in the messages in rows 1-5.
7. M2 step 4: a main column narrow enough for step 4 hides the segment and a DevTools logpoint on
   `UsageService.refresh` shows no request; widening redraws and requests at once; same at 300 px. Polling
   also stops with the sidebar collapsed, the window minimized, another leaf over the panel; a finished turn
   while shown forces a refresh.
8. M6, M5, M3: keyboard path of row 2 and the popovers with a screen reader; cards and popovers in a pop-out;
   after "Move to new window" no `get_usage` while that pop-out is minimized; all in forced Light and Dark.

### 034 Tabs and column (widths 300, 360, 440, 680, 1040 px)

1. M1: strip from 360 px, switcher below, column from 820 px; widening 779 -> 820 px and narrowing 820 ->
   779 px flips at 820 and 780 px only; Top and Side force their layout and a settings change re-lays out at
   once; no horizontal scroll bar.
2. Column width: unset is 26% of the panel within 220-300 px; the handle drags from 140 px to the smaller of
   480 px and half the panel; double-click returns to unset and clears `ai-agent-panel:side-width`; a stored
   180 reads as unset; the width survives a reload on this device.
3. Tabs: pinned first with a pin; pulsing dot while working (`basic`); steady orange dot titled "Waiting for
   you" (`permission`); x on hover and on the active tab; middle-click closes; a screen reader reads the
   tablist "Conversations" and each tab's state.
4. M6 keyboard: Tab reaches the active tab; Left, Right, Home, End move; Enter or Space selects; Delete
   closes; Shift+F10 opens the row menu; in the column every row, section header, filter and "+" are
   reachable, Escape clears the filter, Shift+F10 and the context-menu key open the row menu.
5. Switch keeps each tab's draft, chips, images, status line and scroll position; a tab within 120 px of its
   end returns at the end.
6. Close: idle tab closes at once; a tab mid-turn (`basic`) or with a waiting card (`permission`) asks first;
   last tab closed opens a fresh one; reopen restores open tabs and the active one.
7. Drag: unpinned tabs reorder in the strip and the column's Open section (also with a filter set); pinned
   tabs neither move nor take a drop; Escape restores the order; the order survives a reload.
8. Overflow: ten tabs scroll on the wheel and on a tab dragged to an edge; chevron only while overflowing;
   chevron and switcher open "Open conversations" down from the top, pinned first, state as icon and text,
   active checked, "Previous conversations..." last; the list follows state changes while open.
9. Column: Pinned (only when not empty), Open with count, Recent with date groups and "Loading...", "No
   matches", "No other matches", "No previous conversations"; collapse kept after reload; hover pin pins and
   unpins without opening; row menu by right-click, 500 ms touch hold, Shift+F10; Delete asks, deletes and
   detaches an open tab; failed delete shows "Could not delete that conversation." and leaves the tab; "+"
   clears the filter.
10. M5: strip, switcher list, column and row menus in a pop-out window.
11. Tab hover card: after 500 ms or on keyboard focus, below a strip tab and beside a column row, with state,
    prompt count, model, mode, start and cost above zero; elapsed time ticks while shown; none while a
    popover is open.
12. M8 idle: 60 s idle with no turn and no hover card: no timer in a Performance recording; during a turn the
    typing indicator ticks once a second only while its tab shows.

### 035 Messages and prompts (300 and 1040 px unless stated)

1. PRD-001.R17: `basic` echoes a reply with a vault link, an unresolved vault link, an `https` link, a
   `file:` link, a remote image: vault link opens its note (new tab on middle or Ctrl/Cmd click); unresolved
   shows `No file in this vault matches "<text>".` and creates nothing; `https` opens the browser; `file:`
   opens nothing; the image shows as text and Network shows no request; hovering the vault link raises page
   preview. A reply with a `dataview` fence, inline `=` code and a `(key:: ...)` field with Dataview on:
   nothing runs, no field.
2. PRD-001.R33, M1 (300, 360, 440, 680, 1040): Pop-out prompts full width with number, "You", HH:MM and the
   context label ellipsized; Bubble right-aligned at 86% (94% below 360 px), label under it, "You" for
   screen readers only; `/status` and `!ls` compact, monospace, unnumbered; a prompt sent during `basic`'s
   turn marked "queued mid-turn"; numbers continue across a reopen; copy button on hover and Tab focus copies
   the raw text.
3. Pinned prompt: scrolling pins the current prompt in one line at the top; a click returns to the start of
   its turn; nothing reflows as prompts pin and unpin; off in settings, no pin.
4. Jump rail (Pop-out): a tick per prompt at its position, pinned and hovered ticks in the prompt colour,
   400 ms tooltip "N . <first line>", Enter, Space or a click scrolls to the prompt; Bubble or the setting
   off removes the rail and its reserved width at once; a screen reader reads the nav "Jump to a prompt".
5. PRD-001.R35: a new tab shows "Ask about your vault", the line and, with a note open, "Summarize <note>" and
   "Find notes to link here"; a selection adds "Draft a follow-up from the selection"; switching notes
   updates them; a starter fills the composer and sends nothing.
6. PRD-001.R25: "Messages" with "Prompt style", "Pin the current prompt while scrolling" and "Prompt jump
   rail" (only with Pop-out), synced by default; each change reaches an open panel at once.
7. PRD-003.R1: a new prompt's file entry has `sentAt`; a file from before reopens without send times, no error.
8. M3: prompt-text contrast on Pop-out and Bubble fills in default light and dark themes at least 4.5:1.
9. PRD-003.R9 in-flight reopen: in a fresh tab run `!sleep 3; echo done` and meanwhile pick a stored
   conversation: it opens in a new tab and the run is recorded in the first; same during `basic`'s turn and
   with `permission`'s card waiting; an idle fresh tab and one detached from a deleted conversation are reused.
10. M8 reopen: a 1,000-message conversation: last screen within 1 s, no frame over 100 ms while older sections
    draw, no visible reflow, the view stays at the end as Markdown and embeds settle (else ADR-016's fallback).
11. M5 in a real Electron pop-out: copy buttons reach the clipboard; a vault link opens its note, an `https`
    link the browser; pinned prompt, rail and starters work.

### 036 Header and changes (`rewind` for rows 4, 5, 7; 300, 440, 1040 px; 600 px tall)

1. M1 header: at 440 and 680 px the strip, "+", divider, history, settings, no "More"; at 300 px the switcher,
   "+" and "More"; at 1040 px the title block (title, `N prompts . started HH:MM`, updating on send and
   switch) and settings only; no horizontal scroll bar.
2. "More" at 300 px opens down, titled "More": Previous conversations (opens the picker), Open transcript (only
   with an exported note), Export to Markdown, Plugin settings; Escape and a pick return focus to "More"; in
   column layout with the column dragged so the main column is under 360 px, "More" replaces settings.
3. PRD-001.R9 at 1040 px: filter and Escape, collapse kept after reload, row menu, hover pin (034 row 9).
4. PRD-002.R7 (`rewind`, Ask): after a turn the chip `2 files +2 -1` under the header at 440 px, tooltip "Show
   the files this conversation changed", `+2 -1` at 300 px, in the header row at 1040 px and 440x600; click
   opens "Files this conversation changed" down from it: `Fake CLI note.md +1 -1`, `Fake CLI new note.md new
   +1`; a row opens its note; with the note deleted `Note not found: <path>`; "Review changes" opens "Changes
   this conversation"; a screen reader names the chip by its counts.
5. PRD-002.R18 (`rewind`): after turn 1 "Restore to before turn 1" with R18's tooltip; after turn 2 still turn
   1; during a turn (send, open the popover within 2 s) disabled, enabled when it ends; pressing it opens the
   preview dialog listing both files; Restore files puts the note back to "No turns yet." and deletes the new
   note, `Files restored: 2.`, the chip goes; Cancel changes nothing; after a reopen no chip and no "Restore to
   before turn N"; Restore files on a reopened turn says the point is gone (new fake process).
6. PRD-003.R11 (M1, "Export transcripts to Markdown" on): Transcript labelled on the bar at 440 px;
   icon-only in the header row at 1040 px and 440x600; at 300 px hidden from the bar and in "More" as Open
   transcript; tooltip "Open the exported note"; note deleted: `Exported note not found: <path>`.
7. R14 and R15: a turn's Restore files (preview, confirm, cancel, a running turn disables it) and Branch (new
   tab with the branch note; "This conversation has no CLI session to branch from yet." in a tab without one).
8. M6 at 300, 440, 1040 px and 600 px tall: Tab reaches "+", history, settings or "More", then the chip and
   Transcript; Enter or Space opens each; in popovers Tab and Shift+Tab move, Escape closes and refocuses the
   trigger; a screen reader reads the chip's counts, "Restore to before turn N" with its title as description,
   each popover by title. With the strip overflowing, the chip entering or leaving the header row (600 px
   tall) updates the chevron.

### 037 Turn (`turn`, `basic`, `crash`; 300 and 1040 px unless stated)

1. PRD-001.R15 (`turn`): head with ringing mark, "Claude", "Working", ticking time; "Thinking..." in the head
   then "Thought for 1s", a click shows and hides it; "Writing" with a blinking caret while the reply streams
   as plain text, then rendered Markdown (heading, list, table scrolling inside itself at 300 px, code block);
   the Read card inside the turn; the second reply; head state and time gone at the end. Footer: Branch, copy,
   `N.Ns . $0.0123` (second turn again $0.0123, not the total); icons only below 360 px with tooltips; copy
   pastes both replies joined by a blank line. A message containing "error" ends `Error: API Error:
   Overloaded`. A message sent during the turn is marked "queued mid-turn" and the turn goes on below it; Stop
   ends it with a footer.
2. PRD-005.R7, R32 (M1 at 300, 360, 440, 680, 1040; M5 pop-out): hovering duration and cost 500 ms shows Input
   1.2k, Output 340, Cache write 2.0k, Cache read 56.0k and "At API prices; plans count usage instead"; a
   `basic` turn and a reopened turn show none; the head ticks in a pop-out. The tab hover card says "Working .
   Ns" during the turn and the conversation's cost after. The exported note shows each turn's own cost.
3. M6: Tab reaches the thinking toggle (expanded/collapsed announced), Restore files, Branch, copy and the
   duration and cost, whose focus shows the card until blur; with NVDA or VoiceOver `permission`'s card in the
   active tab announces "Claude is waiting for you" and a turn's end "Claude finished", twice in a row too;
   nothing from a background tab; `crash`'s error block is read as an alert.
4. Errors: a profile with a missing CLI path shows the error block on send; `crash` closes the turn, then
   shows "Claude exited with code 3" with stderr as an alert, recorded; reopening shows it after the closed turn.
5. Reopen of a conversation with several turns: footers with each turn's cost, "Thought process", no ticking
   head; a 0.5.0 file (turn records without session id) reopens with its costs; Restore files and Branch on
   `rewind`'s turns as before (036 row 7).
6. M8: DevTools profile of `turn` streaming in one tab while typing in another: each delta one text-node
   append, no layout read, echo within 50 ms (p95), no frame over 100 ms; the rail re-reads after the text
   block ends, not per delta.
7. DES-002 rows after the move: settings closed during a turn restart its CLI after the turn; Bypass off moves
   a tab in Bypass to Ask; a refused model rolls back with its Notice; a reopened conversation whose session
   cannot resume says so and starts afresh.
8. [real CLI, metered, owner go-ahead] One session, sanitized record in `docs/records/verification/`: a turn
   with thinking, a streamed reply, a tool call, a message sent mid-turn and an interrupt, compared with the
   `turn` scenario's shape and the 030 interrupt shape.

### 038 Permission card and question form (300 and 1040 px)

1. `permission` in Ask: card in the turn with orange ring, shield-alert tile, "Allow Edit?", summary
   `note.md` ("Vault root", the file's folder, once the file is read), "Reading the file..." then the diff
   (none if `note.md` is missing), Full input collapsed;
   footer Deny, Always allow, Allow; tab dot and head say "Waiting for you"; Allow -> "Allowed" in place of
   the buttons, ring gone, focus on the card; new turns: Always allow -> "Always allowed", Deny -> "Denied";
   the card scrolls into view when it appears, also after scrolling up.
2. `permission-flagged` in Auto-approve with `note.md` present: a card whose Allow answers; `permission-
   unflagged` in Auto-approve: no card.
3. `cancel`: the card settles "Cancelled" by itself; Stop or Esc during `permission`'s card does the same.
4. `question` (message containing "exit"): the form, then after 1 s "Session ended" in place of its buttons,
   options disabled, then the exit's error block. `crash`: error block, no card.
5. `question`: "Claude has questions", "0 of 2 answered"; Location chip and question with radio cards and
   descriptions; Sections chip with checkbox cards and "Select all that apply"; picking a radio clears Other
   text, typing Other clears the radio; count and Submit follow; Submit -> "Answered: ... . ..."; next form
   "Claude has a question"; Dismiss -> "Dismissed"; the reply names the answers or "dismissed".
6. M6: Tab reaches Deny, Always allow, Allow; in the form each radio group is one stop (arrows move and pick),
   each checkbox and Other field a stop; Enter or Space presses; a screen reader names the card "Permission
   request" with its title, the form by its title, fieldsets by legend, options by label and description,
   "Other answer"; "Claude is waiting for you" announced once per card.
7. [real CLI] ExitPlanMode: the plan rendered on the card, "Rendering the plan..." meanwhile, the card brought
   into view (with 037 row 8's session).
8. M3 and M7: rings and tiles in light and dark, forced Light and Dark, and Windows high contrast (borders
   stay, rings go).

### 039 Tool steps and agents (`steps`, `permission`; 300, 440, 1040 px)

1. `steps`: the first group's four rows running then done, the Read with the failed mark, "3 files", "2
   results", "4 notes" (hidden at 300 px); at the reply the header "4 steps", error mark, duration, group
   collapsed; a header click expands and collapses it.
2. `steps`: the Edit as a single row with `+N -M`; Details: Input JSON and the diff from the note as read to
   the note on disk with the Rendered toggle; a failed row's details show its raw result.
3. `steps`: the Survey agent row: bot tile, "Survey the project notes", "Explore . Haiku 4.5 . 2 tools . N
   tokens", elapsed, "Done"; expanded (`aria-expanded`) shows its replies then a group of two steps. The Watch
   agent row ticks while running, its thread grows after the turn, then "Done" with "3 tools" and "4.3k
   tokens"; a collapsed row and a hidden tab keep no timer (DevTools: no 1 s timer at idle).
4. `steps`: the run bar above the composer with two tasks while they run; Stop on the shell removes it (on the
   agent, "Stopped"); another tab shows its own empty bar; killing the CLI or a settings restart empties the
   bar and running agents read "Stopped". A failing `stop_task` shows "Could not stop that task." (not in a
   scenario).
5. `permission` in Ask: the Edit's row leaves while the card waits, the card sits in the turn, after Allow (or
   Deny) the row returns below the card, done (or failed with the denial text).
6. Reopen a conversation from `steps`: groups as recorded, no durations or counts, marks from stored outcomes,
   the Edit's stored `+x -y`, details diffing the tool's own strings; agent rows without a button.
7. M6: Tab reaches each group header, row and agent row, announced with expanded state; marks read "Running",
   "Done", "Failed"; the run bar's Stop is "Stop this background task" described by its task. M3 and M7:
   tiles, marks and the run bar in light and dark, forced themes, high contrast; the spinner still under
   reduced motion.
8. [real CLI, metered, owner go-ahead] One session, sanitized record in `docs/records/verification/`: a Glob,
   a Grep, an edit, a subagent and a background task, compared with the `steps` shapes (result text,
   `task_started`, `background_tasks_changed`, `task_notification` and its `usage`, a subagent's
   `subagent_type` and `task_description`); and whether a permission request can come before its `tool_use`.

### 040 Reports, slash list, shell card (300 and 1040 px unless stated)

1. PRD-001.R20 (`basic`): `/status` loading (spinning tile, "Asking Claude Code...", three shimmering bars, no
   badge or buttons) then answered with "no tokens", Refresh, Copy as Markdown (pastes the card's Markdown);
   "open /mcp" runs `/mcp`; `/memory`, `/hooks`, `/permissions`, `/skills`, `/chrome` (links open in the
   browser), `/sandbox`, `/cost`; `/context` after one message: meter, legend, four collapsed sections that
   open and close; `/help`: a row puts the command in the composer unsent, "Show all 5" shows the rest, no
   Refresh.
2. Failed: with `FAKE_CLI_REFUSE_REPORTS=1` `/status` reads "Status Couldn't load" and "Claude Code could not
   answer: Refused get_status. Updating it may help.", read as an alert; Copy error pastes that text; Try again
   loads into the same card. A profile with a missing CLI path: "Claude Code did not start - see the error
   above." under the error block. `/context` before any message fails with "no turn received yet".
3. Recording: Refresh a recorded `/mcp` card, close the tab, reopen from history: the refreshed card shows
   once, as Markdown, without buttons; the exported note has it. A `/status` run during a `turn` turn shows its
   card and is missing after a reopen.
4. PRD-001.R21 (`basic`): `/mcp` lists postgres (failed, with the spawn error), linear (needs sign-in), github
   and obsidian (connected), figma (disabled), with the sign-in note; obsidian has no buttons; Disable on
   github lists it disabled, Enable brings it back; `/mcp disable all`, `/mcp reconnect nope` (`No MCP server
   named "nope".`), `/mcp frob` (the usage text), `/mcp disable obsidian` (the plugin setting).
5. PRD-001.R19: the slash list shows "Answered by the panel" with "no tokens", then "Claude Code" (compact,
   init, security-review before a CLI starts; six once one has, `context` only in the panel's group); `/co`
   filters within the groups; the commands button prefixes `/` and opens it; `/clear` in a tab with a
   conversation opens a new tab.
6. PRD-005.R6: `/usage` after a message: bars 42%, 18%, orange 81%, 12% with reset times, extra usage $3.50 of
   $50.00 with 7%, the thresholds note; `/usage-credits` and `/extra-usage`: "As of HH:MM . also answers
   /extra-usage", status, limit, use with a bar, the link opening claude.ai/settings/usage; before any CLI
   runs, and with `FAKE_CLI_REFUSE_USAGE=1`, a failed card `Couldn't fetch usage: ...`.
7. PRD-002.R16: `!echo hi` (running, then done with its time), `!ls nope` (exit 2, stderr with a red rule),
   `!sleep 70` (timed out at 60 s), a long output scrolling inside the card at 300 px; Add output to chat
   fills the composer unsent beside "Claude hasn't seen this"; a reopen shows the cards; with the escape off
   `!ls` goes to Claude.
8. M6, M7: Tab reaches every card button and the collapsed sections; reduced motion stills the spinner and
   shimmer; in Windows high contrast status dots and legend swatches keep their colours.
9. Review fixes: close a tab while `/status` loads (slow CLI start), reopen: the card shows its answer;
   Refresh, Try again and a `/mcp` row button by keyboard keep focus on the control (on the card while
   loading), "Show all 5" moves focus to the first row shown; `/mcp frob` answers with servers and usage
   text, no Try again.

### Cross-cutting after 041 and 042

- DES-003 matrix: M1 widths (300, 360, 440, 680, 1040; 600 px tall), M2 modes/profiles, M3 light/dark and
  community theme, M4 zoom and font size, M5 pop-out, M6 keyboard and screen reader, M7 reduced motion and
  high contrast, M8 profiles (PRD-001.R29: typing echo within 50 ms p95, no frame over 100 ms, 1,000-message
  reopen within 1 s, no periodic DOM work when idle).

## 041 — Context and short height
- 440×900: inline "+ <note>" offer after the commands button; chip toggles; folder chip follows explorer clicks.
- Attachments: picker, "Add to agent chat" (file and folder), pasted image; order, open, ×, rename.
- 440×600 and 300×600: one-line text, offers hidden, "+N" and "Hidden context" (Remove / Turn off, focus), re-fit during a turn, crossing 640 px tall, no horizontal scroll.
- `basic` echo of the context block: selection over 8000 chars, emoji at the cut, folder chip, links and properties over 40, duplicate attachment listed once; no block when queued or for `/compact`.
- M4 zoom 80% and 150%, changed interface font; M6 keyboard and screen reader on chips; M3 light/dark and forced modes.

## 042 — Close-out (whole panel)
- The DES-003 matrix M1–M8 on the finished panel.
- R28 audit: screen reader pass, Windows high contrast, prompt contrast in DevTools (light, dark, forced), `/mcp` status.
- R29 profiles in Obsidian's Electron: keystroke echo, first draw, 1,000-message reopen, streaming, forced theme first pass (decides ADR-017 chunking).
- Scroll: while a reply streams, a small scroll up leaves the end; a reopen stays at the end while code blocks draw.
- `[real CLI]` (metered, needs approval): the runs owed by 037 (turn shapes, interrupt) and 039 (Glob, Grep, edit, subagent, background task; a permission request before its tool_use).
