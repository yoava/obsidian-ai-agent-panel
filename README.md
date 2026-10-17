# AI Agent Panel for Obsidian

[![CI](https://github.com/yoava/obsidian-ai-agent-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/yoava/obsidian-ai-agent-panel/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yoava/obsidian-ai-agent-panel/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/yoava/obsidian-ai-agent-panel/security/code-scanning)
[![Release](https://img.shields.io/github/v/release/yoava/obsidian-ai-agent-panel?sort=semver&label=release)](https://github.com/yoava/obsidian-ai-agent-panel/releases/latest)

A chat panel in Obsidian for the [Claude Code](https://code.claude.com) CLI you have installed, with your vault as its working directory.

Unofficial: not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI or Obsidian. "Claude" and "Claude Code" are trademarks of Anthropic, PBC; "Codex" and "ChatGPT" of OpenAI; "Obsidian" of Dynalist Inc. They appear only to say what the panel works with.

Claude Code is the only agent today. Codex is planned for a later release.

## Requirements

- Obsidian desktop 1.8.7 or later. Mobile is not supported.
- Claude Code installed and logged in; `claude` must work in your terminal. The vault tools need 2.1.210 or later.
- A vault on the local file system.

Sessions run the CLI in its non-interactive stream-JSON mode. Anthropic may count such sessions differently from terminal use; see [its sign-in article](https://support.claude.com/en/articles/13189465-logging-in-to-your-claude-account) for your plan. If `ANTHROPIC_API_KEY` is set when Obsidian starts, the CLI bills that key.

## Install

Community plugins: *Settings > Community plugins > Browse*, search **AI Agent Panel**, install, enable.

BRAT: add `yoava/obsidian-ai-agent-panel` in [BRAT](https://github.com/TfTHacker/obsidian42-brat).

From source:

```bash
git clone https://github.com/yoava/obsidian-ai-agent-panel.git
cd obsidian-ai-agent-panel
npm ci
npm run build
```

Copy `manifest.json`, `main.js` and `styles.css` to `<vault>/.obsidian/plugins/ai-agent-panel/` and enable the plugin.

### Verifying a release

`main.js` and `styles.css` carry a build-provenance attestation: `gh attestation verify main.js --repo yoava/obsidian-ai-agent-panel`.

## Use

1. Open the panel from the ribbon icon or **AI Agent Panel: Open chat**.
2. Type a message. The active note is attached as context; click its chip to leave it out. `@` mentions files and folders; `/` lists commands.
3. Approve or deny the cards that appear.

Other commands: **New conversation**, **Previous conversations**, **Add selection to chat**, **Export conversation to Markdown**, **Focus prompt box**, **Stop Claude's turn**, **Next conversation tab**, **Previous conversation tab**. None has a default hotkey; set one under *Settings > Hotkeys*.

Windows: a native `claude.exe` or `claude.cmd` install works as is, except that a `claude.cmd` path containing `&`, `^`, `%`, `!` or a quote is refused (use the native build). For a WSL install, **Detect** in settings switches on **Run via WSL**. **Add CLI profile** keeps one launch configuration per install.

## Features

### Conversation

- Streamed replies rendered as Obsidian Markdown; a working line at the end of the conversation while Claude works; collapsible thinking; a divider where Claude Code compacts the conversation, with its summary; tool calls grouped into step cards; subagent rows; background tasks with Stop.
- Each turn is headed by the panel's agent mark, which stays still: the working line at the end of the conversation is the moving cue while Claude works. A finished turn shows its duration and cost, a copy button, and **Restore files** and **Branch** where they apply. Cost and context come from the CLI at no token cost.
- Tabs drawn as Obsidian tabs on top, a side column (Pinned, Open, Recent) or, by default, automatic by panel width. Drag to reorder, pin, rename, filter, resume; an open-tabs list, with state marks and close buttons, opens from All conversations and the narrow switcher.
- Messages sent mid-turn queue or steer the running turn. Esc or **Stop** interrupts.
- Status line under the composer: model, effort, permissions, CLI profile, context window with the prompt cache's estimated time left, plan usage (5-hour and weekly limits).
- Context: active note, selection, `@` files and folders, pasted images (8 per message, 4 MB each), optional links and properties, optional active folder.
- `!command` runs a shell command yourself; Claude does not see it unless you add its output to the chat.
- `/context`, `/mcp`, `/status`, `/memory`, `/hooks`, `/permissions`, `/skills`, `/chrome`, `/sandbox`, `/cost`, `/usage` and `/help` render as report cards at no token cost.
- `/clear` clears Claude's context in the same conversation: a divider marks the point, the messages above stay, and the next message starts a new Claude Code session. "Undo" on the divider takes the latest clear back until you send another message.
- Per-profile Claude in Chrome, Sandbox and extra CLI arguments.

### Prompts

- Prompt style: Card (default) or Bubble, in a prompt color: Clear, Sand (default), Stone, Sage, Sea, Mist, Lavender, Rose, Accent or a Custom CSS color. The current turn's prompt stays pinned while you scroll. In Card, prompts are numbered and a jump rail has one tick per prompt.
- A new conversation offers starters: with a note open, *Summarize* and *Find notes that should link here*; with text selected, *Draft a follow-up from the selection*.
- Vault instructions: per-vault system-prompt additions, or a `CLAUDE.md` in the vault root.

### Permissions

- In the default mode, every request Claude Code sends for approval shows a card: Allow, Always allow or Deny. Your Claude Code allow rules, and sandboxed commands under `sandbox.autoAllowBashIfSandboxed`, run without one.
- Edit cards show a word-level diff and a rendered-Markdown view.
- Modes: Ask before acting, Accept edits, Plan (read-only), Auto-approve everything. *Bypass permissions* is off and hidden until enabled in settings.
- `AskUserQuestion` renders as a form.

### Vault tools

Six tools that run inside Obsidian; they can be switched off:

- Rename or move a note; Obsidian updates links as your link-update setting directs.
- List outgoing links, embeds, backlinks and broken links.
- Search by tag, property, heading or folder.
- Read and set frontmatter properties.
- Read the active note, cursor and selection.
- Open a note.

Each call asks for permission first. Design: [DES-006](docs/current/design/DES-006-vault-tools.md).

### History and export

- Every conversation is saved locally and resumes its Claude Code session on a device that ran it, with the same CLI profile. Anywhere else it keeps its messages and starts a fresh session.
- **Restore files** rewinds the files Claude edited, after listing them, using Claude Code's checkpoints. **Branch** continues from before a turn.
- Optional Markdown export: folder, note-name pattern and date format are configurable.

### Settings

- One page in six sections under a bar of section links, with a search field and a *Modified* filter; reset one setting, a section or all, with Undo.
- *Appearance*: theme (Auto, Light or Dark), conversation tabs, tooltips, prompt style and color, pinned prompt, jump rail.
- Default permission mode, plan-usage thresholds, export, CLI profiles stacked under one heading each, with a banner and alert icons when a profile's Claude Code is not found.
- Each setting syncs or stays on this device. CLI paths and profiles, default permission mode, bypass, vault instructions, `!` and vault tools are device-only by default.

## What runs on your machine

| Capability | Why |
| --- | --- |
| Starts a program (`child_process`) | Launches your `claude` CLI over stdin/stdout, and runs the `!` commands you type. `shell: false` with array arguments wherever the platform allows. |
| Reads files outside the vault (`fs`) | Only to find the CLI: standard install locations under your home directory, plus `which` or `where`. |
| Lists vault files (`getFiles`, `getMarkdownFiles`) | `@` completion, the transcript-folder suggester, and the vault tools' tag and property search. Reads Obsidian's index, not note bodies. |
| Writes the clipboard | Copy buttons. The plugin never reads the clipboard. |

## Disclosures

- **Network.** The plugin makes no network requests and holds no credentials. The Claude Code process it starts sends your prompts, attached context, anything Claude reads, pasted images and plan-usage lookups to Anthropic. Claude Code's read-only tools run in the vault without a card by default. With your approval Claude Code can also reach other hosts: web fetch, shell commands, and Claude in Chrome with your browser sessions. Remote images and embeds in replies are shown as their address and not fetched. What Anthropic does with the data is governed by your account settings and its terms.
- **Account.** A Claude Code installation logged in to your own Anthropic account (free or paid plan) or configured with your own API key. The plugin stores no keys or tokens.
- **Telemetry.** None.
- **Files outside the vault.** The plugin writes nothing outside the vault. The CLI keeps its settings, sessions and login in `~/.claude`. The panel turns on Claude Code's file checkpoints: before an edit the CLI copies the file, files outside the vault included, to `~/.claude/file-history/`, where *Restore files* reads it. The copies stay until Claude Code's own cleanup, not until you delete the conversation. Commands you run with `!`, and tools Claude runs with your approval, can read and write anywhere your user account can.
- **Fonts.** The panel is set in Geist and Geist Mono, © 2024 The Geist Project Authors, bundled in `main.js` under the SIL Open Font License 1.1 ([notice](docs/current/LEGAL.md#third-party-components)). Nothing is fetched.
- **External CLI.** The plugin starts your installed `claude` as a child process. It does not bundle, download or patch it.
- **Data on disk.** History (tool inputs in full, results cut to 1500 characters) is stored in `.obsidian/plugins/ai-agent-panel/`; exports go in your vault. Both can hold anything said in the chat. Obsidian Sync does not copy the history folder; tools that mirror the whole vault folder do. This device also keeps, in Obsidian's local storage, a record of the Claude Code sessions it ran for each conversation, and a `.session-provenance-migrated` marker file in the history folder; a conversation that arrives from another device starts a fresh Claude Code session. Uninstalling the plugin deletes its folder.
- **Defaults.** `!` and the vault tools are on; the default permission mode is *Claude Code default* (your Claude Code settings decide).
- **Risk.** With your approval the agent can rewrite and delete notes and run shell commands. Keep backups. Auto-approve answers requests without a card, except those Claude Code escalates, and Bypass turns the CLI's checks off; both show in red.

## More

- Threat model, permission modes and what each skips: [docs/current/SECURITY.md](docs/current/SECURITY.md). Report a vulnerability as [SECURITY.md](SECURITY.md) describes.
- Other agent plugins, dated: [docs/current/COMPARISON.md](docs/current/COMPARISON.md).
- Licensing and trademarks: [docs/current/LEGAL.md](docs/current/LEGAL.md).
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md); build and test: [docs/current/DEVELOPMENT.md](docs/current/DEVELOPMENT.md). Release history: [RELEASE_NOTES.md](RELEASE_NOTES.md).

## License

[MIT](LICENSE).

Optional support: [GitHub Sponsors](https://github.com/sponsors/yoava), [Buy Me a Coffee](https://buymeacoffee.com/yoava). No feature is gated behind it.
