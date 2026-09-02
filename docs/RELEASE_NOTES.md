# Release notes

## Unreleased

- **Optional funding link.** `manifest.json` now carries a `fundingUrl`, so
  Obsidian shows a heart next to the plugin in the plugin list, and the
  repository has a sponsor button. The plugin stays free and MIT-licensed, no
  feature is gated behind it, and the link costs nothing at runtime - Obsidian
  renders it, and nothing is fetched unless you click it.

## 0.3.2 - first public release

AI Agent Panel puts an AI coding agent in an Obsidian sidebar, with the vault
as its working directory. It drives an agent CLI you installed and logged into
yourself; the plugin implements no login and stores no API keys. Claude Code is
the first integration and the only one today. Requires Obsidian desktop 1.5+
and a vault on the local file system.

### The panel

- **Native chat panel** with streamed responses rendered as Obsidian Markdown.
  Transcript text is selectable, every prompt and reply has a hover copy
  button, and links behave as they do in a note - vault links open the file
  (Ctrl/Cmd-click for a new tab, hover to preview), external links open in the
  browser. Your own messages take a fixed amber tint rather than the theme
  accent, so they stay legible across themes and under deuteranopia.
- **Multiple conversations as tabs** - drag to reorder, middle-click to close,
  hover for metadata, per-tab busy indicator. Tabs shrink and then scroll as
  they multiply, and a chevron lists every open conversation by name. Messages
  sent mid-turn steer or queue into the running turn. Open tabs are restored on
  reload, per device. The tabs can sit above the transcript as a strip, beside
  it as a column, or switch between the two by panel width (*Conversation tabs*
  in settings). The side column is resizable - drag its inner edge,
  double-click the handle to reset - and its width is remembered per device
  rather than synced. Widening it also raises the width at which *Automatic*
  is willing to use the column, so a wide column never buys itself a squashed
  transcript.
- **The side column lists every conversation**, not only the open ones: one
  scroller with *Pinned*, *Open* (drag-reorderable, busy dot, `×` closes) and
  *Recent* - everything in history that is not open, muted, with a relative
  time and no `×`, under *Today* / *Yesterday* / *Previous 7 days* / *Older*.
  Sections collapse and remember it per device, a filter field narrows all of
  them by title, and clicking a *Recent* row opens it, so this layout has no
  use for the *Previous conversations* picker (which stays, for the top strip
  and its fuzzy search). Right-click or long-press a row for *Open*, *Export
  to Markdown*, *Close* and *Delete* - deletion asks first and lives only
  here, so `×` can keep meaning "close the tab" and nothing else. Exports are
  written through Obsidian's Vault API, so the file explorer and other plugins
  see the note immediately.
- **Pinned conversations.** Pin from a row's context menu or the pin that
  appears on hover. Pinned rows lead the column in their own section, oldest
  pin first so it stays stable as more are added, and a pinned conversation
  appears *only* there - open or not - so every conversation is still drawn
  exactly once, close button and busy dot included. The top strip sorts
  pinned tabs to the front and marks them with a pin glyph. The flag lives in
  the conversation file rather than in device-local layout state, so it
  travels with the conversation and syncs with the vault; pinning one from
  history does not open it.
- **Conversation history**, saved locally and reopenable, resuming the CLI
  session where it left off.
- **Undo a turn or branch off one.** Every finished turn offers *Restore
  files*, which shows the diff it would undo before putting the notes back, and
  *Branch from here*, which continues from just before that turn in a new tab
  and leaves the original intact. Restoring goes through Obsidian's atomic file
  processing, so a note is never left half-written if something interrupts it.

### Context and input

- **Note context**: the active note's path and your selection ride along by
  default, toggled per message with context chips. Attach more via the **+**
  button, `@`-mentions, or the file explorer's right-click menu. An optional
  *links & properties* chip adds outgoing links, backlinks, broken links and
  frontmatter.
- **Images**: paste or drag a screenshot into the composer; each gets a
  thumbnail chip you can remove.
- **`!` shell escape**: `!git status` runs locally with the vault as working
  directory and prints stdout/stderr in a monospace card. It is your command,
  so it bypasses the agent's permission prompts - and the agent never sees it
  or its output unless you press *Add output to chat*. Can be switched off.
- **Slash commands** with autocomplete, covering the CLI's built-ins plus your
  own commands and skills.

### Consent and review

- **Permission prompts in the chat.** Every sensitive tool call shows an Allow
  / Always allow / Deny card; nothing runs without consent in the default mode.
- **See the diff before approving it** - green/red gutters, line numbers, and
  word-level highlighting inside rewritten lines, with unchanged stretches
  collapsed. Flip any diff to *rendered* to see the change as Obsidian draws
  it. A **N files +x -y** header link opens everything the conversation has
  changed.
- **Interactive questions** render as a real form - clickable options,
  multi-select where allowed, free-text "Other".
- **Permission modes**: *Ask before acting*, *Accept edits*, *Plan
  (read-only)*, and *Auto-approve everything*, switchable mid-conversation.
  Auto-approve is the plugin answering the prompts rather than the CLI standing
  down - its rules and hooks still run - but while it is on nothing asks you
  first, so the control row shows it in red. *Bypass permissions* exists too
  and stays hidden unless explicitly enabled in settings.

### Obsidian-native tools

Six tools that run *inside* Obsidian, so the agent works with your vault as a
vault rather than a folder of text files: rename or move a note without
breaking a backlink; ask what links where; search by metadata
(`tag:project -prop:status=done`, `heading:"Open questions"`, `folder:daily`);
read and patch frontmatter with Obsidian rewriting the block; report the active
note, cursor and selection; open a note. Each still asks permission, and they
run over the connection the plugin already owns - no port, no config file, no
extra process. Needs Claude Code 2.1.210+; can be switched off.

### Visibility

- **Tool activity cards** with expandable inputs and results.
- **Subagents nest** as a collapsed thread under their Task card, carrying the
  agent's own replies, tool calls, model, token count and duration.
- **Background tasks** appear as a strip above the composer while they run,
  each with a stop button.
- **Per-conversation context meter** showing window occupancy and cost so far,
  with a hover breakdown by category. Its bar is driven by a CSS variable
  rather than an inline style, so a theme or snippet can restyle it.
- **Plan usage** with an optional strip below the composer, configurable
  warning and critical thresholds, a popup with progress bars, and `/usage`,
  `/usage-credits`, `/extra-usage`. The numbers are asked of the running CLI
  session over the channel the plugin already owns, so they spend no tokens and
  the plugin never reads a credential of yours - they appear once a
  conversation is under way. The figures refresh every five minutes by default;
  *Usage refresh interval* in settings changes that.

### Configuration

- **A control row under the composer** - **model · effort · permissions ·
  profile**, one menu each, switchable mid-conversation, with the context meter
  and plan usage sharing the row above it. Model entries come from the list
  your CLI and account actually accept, reported at session start, so new model
  releases are selectable without a plugin update and unsupported effort levels
  are greyed out.
- **CLI profiles**: several named launch configurations (say, a Windows install
  and a WSL one) with a default, pickable per conversation from the row's *Profile*
  control. Both are invisible with a single profile.
- **Per-setting sync**: each settings row carries a cloud badge that flips it
  between synced plugin data and this-device-only storage. CLI paths and
  profiles are device-local by default, so machines with different install
  locations stop overwriting each other through Obsidian Sync.
- **Vault instructions**: per-vault system-prompt additions, or just keep a
  `CLAUDE.md` in the vault root.
- **Windows**: native installs work out of the box, including npm's
  `claude.cmd` shim; a WSL-only install is auto-detected and launched through
  `wsl.exe`.

### Notes

Conversation history and turn checkpoints live under
`.obsidian/plugins/ai-agent-panel/` and contain full note contents; transcript
exports are ordinary notes. Treat both as you would any other note when syncing
or sharing a vault. See [SECURITY.md](SECURITY.md) for the full model and
[LEGAL.md](LEGAL.md) for licensing and trademark detail.
