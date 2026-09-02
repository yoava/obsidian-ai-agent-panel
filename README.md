# AI Agent Panel for Obsidian

Chat with an AI coding agent inside your Obsidian vault - a native panel that drives an agent CLI you have already installed and logged in to yourself.

The agent gets your vault as its working directory: it can search notes, answer questions about them, refactor and link notes, draft new ones, and run any of its tools - always behind Obsidian-native permission prompts.

## Agent integrations

| Agent | Status |
| --- | --- |
| [Claude Code](https://code.claude.com) (Anthropic) | **Available** - the first integration, and the only one today |
| Codex / ChatGPT (OpenAI) | **Planned** - not implemented yet |

Right now the panel requires Claude Code, so everything below describes that
integration. Adding a second agent means writing another adapter over the same
session layer; until that lands, treat Codex support as a roadmap item rather
than a feature.

> **Unofficial and independent.** This community plugin is not affiliated with,
> endorsed by, or sponsored by Anthropic or OpenAI. It implements no login and
> handles no credentials: it launches whichever agent CLI *you* installed, on
> your machine, under your own account with that vendor. "Claude" and "Claude
> Code" are trademarks of Anthropic, PBC; "Codex" and "ChatGPT" are trademarks
> of OpenAI; "Obsidian" is a trademark of Dynalist Inc. Those names appear here
> only to say which agent the panel works with.

Obsidian has more than thirty plugins that put an agent in your vault, several
of them very large. The one thing this one does that none of them do is give the
agent real vault operations - a rename that rewrites every backlink, frontmatter
properties as properties, search by tag and property - instead of a folder of
text files. [docs/COMPARISON.md](docs/COMPARISON.md) sets that out plugin by
plugin, including the cases where you should install one of the others.

## Features

- **Native chat panel** in the right sidebar with streamed responses, rendered as Obsidian Markdown. Transcript text is selectable, and every prompt and reply has a hover copy button. Links work as they do in a note: a link to a vault file opens it (Ctrl/Cmd-click for a new tab, hover for a page preview), external links open in your browser. Your own messages get a fixed amber/gold tint, border, and left bar - deliberately not the vault theme's accent color, so they stand out consistently and stay distinguishable under deuteranopia.
- **Multiple conversations via tabs** - drag to reorder, middle-click to close, hover for conversation metadata, busy indicator per tab (steady orange when Claude is waiting for a permission or question answer). More tabs than fit? They shrink, then the strip scrolls (mouse wheel, or drag a tab to an edge), and a chevron next to **+** lists every open conversation by name. Messages sent mid-turn steer or queue into the running turn. Open tabs are restored when Obsidian reloads (per device - the layout never syncs). Put the tabs **on top** as a strip, **on the side** as a column of conversation rows (easier to read when you keep many), or leave it on **automatic**, which uses the side column whenever the panel is wide enough for one and the strip when it is not. The side column is **resizable** - drag its inner edge, double-click to reset - and the width is remembered per device, never synced, since how wide a column fits is a property of the screen.
- **Conversation history**: every conversation is saved locally and can be reopened later, resuming the CLI session where it left off.
- **Undo a turn, or branch off one**: every finished turn offers **Restore files** - putting the notes it changed back exactly as they were, after showing you the diff it would undo - and **Branch from here**, which opens a new tab continuing from just before that turn while leaving the original conversation intact.
- **Note context**: the active note's path and your current selection are attached to your message (toggle per message via the context chips); attach more files/folders via the **+** button, `@`-mentions, or the file explorer's right-click menu. A **links & properties** chip (off by default) additionally sends the note's outgoing links, backlinks, broken links and frontmatter - for when the question is about where a note sits in the vault rather than what it says.
- **Images**: paste or drag a screenshot into the composer and Claude sees it. Each one gets a thumbnail chip you can click to remove.
- **`!` shell escape**: type `!git status` to run a command yourself, with the vault as the working directory, and get stdout/stderr in a monospace card. It is *your* command, so it doesn't go through Claude's permission prompts - and Claude doesn't see it, or its output, unless you press **Add output to chat**. Can be switched off in settings.
- **Permission prompts in the chat**: every sensitive tool call (edits, shell commands, web access) shows an Allow / Always allow / Deny card. Nothing runs without your consent in the default mode.
- **See the diff before you approve it**: an edit's permission card shows the actual proposed change - green/red gutters, line numbers, and the *words* that differ highlighted inside a rewritten line - with unchanged stretches collapsed and expandable. Flip any diff to **rendered** to see the changed section before and after as Obsidian actually draws it. Finished edits keep the diff on their activity card, and a **N files +x -y** link in the header opens everything the conversation has changed, per file, with a click through to the note.
- **Interactive questions**: when Claude asks you to choose between options (the `AskUserQuestion` tool), the panel renders a proper form - clickable options with descriptions, multi-select where allowed, and a free-text "Other" answer - instead of a raw permission prompt.
- **Permission modes**: *Ask before acting*, *Accept edits*, *Plan (read-only)*, *Auto-approve everything* - switchable mid-conversation. Auto-approve is answered by the plugin, not by the CLI standing down: Claude Code's own rules and hooks still run and anything they deny never happens, but everything they'd ask you about is allowed without a card, so the control row marks it in red. A *Bypass permissions* mode, which switches the CLI's permission system off entirely, also exists but stays hidden unless you explicitly enable it in settings.
- **A control row under the composer**, CLI status-line style: **model · effort · permissions · profile**, each a one-click menu, switchable mid-conversation. The context meter and plan usage share the row above it, so the whole composer costs two compact lines. The model entries are the ones *your* CLI and account actually accept - the CLI reports them at session start, and the menu offers exactly that list, with unsupported effort levels greyed out. New model releases are selectable without a plugin update, and each entry re-labels itself with the version the CLI resolved it to.
- **CLI profiles**: keep several ways to launch the CLI (e.g. a Windows install and a WSL one) as named profiles with a default, and pick one per conversation from the row's **Profile** control. Both are invisible while you have just one profile - which is the normal case.
- **Choose which settings sync**: every settings row has a cloud badge - click it to flip that setting between the synced plugin data and this-device-only storage. CLI paths/profiles are device-only by default, so machines with different install locations stop overwriting each other through Obsidian Sync.
- **Slash commands** with autocomplete - Claude Code's built-ins plus your custom commands and skills.
- **Plan usage at a glance**: an optional usage strip in the row below the composer with configurable warning/critical highlighting, a detailed popup with progress bars, and local `/usage`, `/usage-credits`, `/extra-usage` commands. The numbers are asked of the running CLI session over the pipe the plugin already owns, so they cost no tokens and the plugin never touches a credential - they appear once a conversation is under way.
- **Markdown transcript export** (opt-in): auto-exported notes with linked context files, configurable folder, note-name pattern, and date format; a small *transcript* header link opens the note.
- **Tool activity cards** show what Claude is doing (file edited, command run, …) with expandable inputs and results.
- **Subagents are visible**: when Claude delegates to a subagent, its whole transcript nests as a collapsed thread under the Task card - the agent's own replies, its tool calls, its model, token count and duration - instead of vanishing behind a one-line summary.
- **Background tasks**: work Claude pushes to the background shows as a strip above the composer while it runs, each with a stop button.
- **Per-conversation context meter** in the composer: how full the context window is and what the conversation has cost so far, with a hover breakdown of input/output/cache tokens by category.
- **Obsidian-native tools** (the thing no editor integration can give you): Claude gets six tools that run *inside* Obsidian, so it can work with your vault as a vault rather than as a folder of text files.
  - **Rename or move a note without breaking a single backlink** - Obsidian rewrites every link pointing at it.
  - **Ask what links where**: outgoing links, embeds, backlinks, and links that point nowhere.
  - **Search by metadata**, not text: `tag:project -prop:status=done`, `heading:"Open questions"`, `folder:daily`, `prop:due`. (Text search is what Grep is for.)
  - **Read and set frontmatter properties**, with Obsidian rewriting the block so your formatting survives.
  - **Know what you're looking at** - the active note, your cursor, your selection - so "summarize this section" means the right section.
  - **Open a note** in your window when you ask to be taken somewhere.

  Every one of these still asks permission first, and they run over the connection the plugin already has: no port, no config file, no extra process. Needs Claude Code 2.1.210+; can be switched off in settings.
- **Vault instructions**: per-vault system-prompt additions - or just keep a `CLAUDE.md` in your vault root, which Claude Code reads natively.
- **Uses whatever login your Claude Code installation already has**, subscription or API key, and stores no keys or tokens of its own. How Anthropic counts sessions started from a third-party panel is Anthropic's decision; see Requirements.

## Requirements

- Obsidian **desktop** 1.5+ (the plugin spawns a local process; mobile is not supported).
- [Claude Code](https://code.claude.com) **2.x** installed and logged in (`claude` must work in your terminal).
- A vault on the local file system.

Sessions started by this plugin run the CLI in its non-interactive stream-JSON
mode, the same mode Anthropic's Agent SDK uses. Anthropic distinguishes such
sessions from interactive terminal use and has said it may meter them
differently or draw them from usage credits; check
[Anthropic's current policy](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)
for your plan. If an `ANTHROPIC_API_KEY` environment variable is set when
Obsidian starts, the CLI bills that key instead of your subscription.

## Disclosures

Obsidian asks plugin authors to state these things plainly.

- **Account required.** You need a Claude Code installation that is logged in
  to an Anthropic account, on a free or paid plan, or an Anthropic API key
  configured for it.
- **Network use.** The plugin opens no connection of its own. The Claude Code
  process it starts sends your prompts, attached note context, anything Claude
  reads with your permission, pasted images, and plan-usage lookups to
  Anthropic's API under your account. Replies are rendered as Markdown, so an
  image link in a reply is fetched from that URL when displayed, as in any
  note.
- **Files outside the vault.** To find the CLI, the plugin checks a few
  standard install locations in your home directory and runs `which` or
  `where`. The CLI keeps its own settings, sessions and login under
  `~/.claude`. Commands you run with the `!` escape, and tools Claude runs with
  your approval, can read and write anywhere your user account can.
- **Data on disk.** Conversation history (including full tool inputs and
  outputs), per-turn checkpoints of notes before Claude edited them, and
  optional transcript exports are stored under
  `.obsidian/plugins/ai-agent-panel/` and, for exports, in your vault. Obsidian
  Sync does not copy the history and checkpoint folders; tools that mirror the
  whole vault folder do. Uninstalling the plugin deletes its folder.
- **Telemetry.** None. The plugin collects nothing and the maintainer receives
  nothing.
- **Defaults.** The `!` shell escape and the Obsidian vault tools are on;
  *Bypass permissions* is off until you enable it in settings.
- **Warning.** With your approval the agent can rewrite and delete notes and
  run shell commands. Keep backups. The default mode asks before every such
  action. *Auto-approve everything* answers every permission request for you
  without showing a card, and *Bypass permissions* turns the CLI's own checks
  off; both are marked in red while active.

## Install

### From source

```bash
git clone https://github.com/yoava/obsidian-ai-agent-panel.git
cd obsidian-ai-agent-panel
npm ci
npm run build
```

Then copy `manifest.json`, `main.js`, and `styles.css` into `<your vault>/.obsidian/plugins/ai-agent-panel/` and enable **AI Agent Panel** in *Settings → Community plugins*.

### Via BRAT

Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin and add this repository (`yoava/obsidian-ai-agent-panel`). BRAT installs release builds and keeps them updated.

## Usage

1. Open the panel: click the chat-bubble icon in the ribbon, or run **AI Agent Panel: Open chat**.
2. Type a question - the active note is attached as context by default (click the chip to toggle). `@` mentions files/folders, `/` lists commands.
3. When the agent wants to edit a file or run a command, approve or deny the request card in the chat.
4. Useful commands (Ctrl/Cmd-P):
   - **AI Agent Panel: Open chat**
   - **AI Agent Panel: New conversation**
   - **AI Agent Panel: Previous conversations**
   - **AI Agent Panel: Add selection to chat**
   - **AI Agent Panel: Export conversation to Markdown**
5. In the chat, `/usage` shows your plan limits without spending tokens (once a conversation is running); clicking the usage strip opens a detailed popup.

### Windows

A native Windows install of the CLI works out of the box - both the standalone installer's `claude.exe` and an `npm install -g` (npm installs a `claude.cmd` shim, which the plugin launches through `cmd.exe`, as Windows requires).

If Claude Code is installed inside WSL instead, auto-detection handles it: **Detect** (and the automatic lookup when no path is set) probes both Windows and your default WSL distro, and switches **Run via WSL** on when the CLI is only found in WSL. You can also configure it manually - enable **Run via WSL** and set the CLI path to the Linux-side path (e.g. `/home/you/.local/bin/claude`). The plugin launches it through `wsl.exe` with your vault as the working directory.

Have Claude Code installed on both sides? **Add CLI profile** in settings keeps a named launch configuration for each (e.g. *Windows* and *WSL*), with one as the default; every conversation can then pick its CLI from the **Profile** control under the composer. With a single profile none of this UI appears.

## Security model

- The plugin runs Claude Code **locally**, with the vault root as its working directory. Model traffic is the CLI's, under your existing Claude account.
- **The plugin itself makes no network requests at all.** Even plan usage is asked of the running CLI over the existing stdio channel, and the CLI makes any authenticated call itself with its own login. The plugin reads no credential file, opens no socket, and holds no token.
- The plugin stores no API keys or credentials of its own; its `data.json` holds only settings.
- Tool use is governed by Claude Code's permission system; in the default mode every sensitive action requires your explicit approval in the chat. "Always allow" persists a rule via Claude Code's own settings mechanism.
- Note content you attach as context (and anything Claude reads from the vault with your permission) is sent to Anthropic's API by the CLI - same as using Claude Code on any folder.
- Conversation history is stored locally under the plugin folder; optional transcript exports are notes in your vault. Both can contain anything said in the chat - treat them like any other note.

See [docs/SECURITY.md](docs/SECURITY.md) for details and reporting.

**Privacy.** Nothing leaves your machine except what the Claude Code process
sends to Anthropic under your own account, as described under Disclosures. The
plugin has no server and the maintainer receives nothing. What Anthropic does
with the content it receives, including whether it is used for training, is
governed by your Anthropic account settings and Anthropic's terms, not by this
plugin.

Your use of Claude Code itself is governed by [Anthropic's terms](https://code.claude.com/docs/en/legal-and-compliance); this plugin simply launches your own installation and implements no login or credential handling of its own. Licensing and trademark details: [docs/LEGAL.md](docs/LEGAL.md).

## How it works

The plugin spawns your installed `claude` CLI with `--input-format stream-json --output-format stream-json` and talks to it over stdio - the same interface the official Claude Agent SDK uses. The protocol client is a small original implementation (no Anthropic code is bundled), which keeps this repository fully MIT. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Quick start:

```bash
npm ci
npm run dev    # watch mode
npm run build  # type-check + production build
```

## License

[MIT](LICENSE)
