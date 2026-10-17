# How this compares to other agent plugins

Many Obsidian plugins put an AI coding agent in your vault. On 2026-10-17 two
of them were among the dozen most-downloaded plugins in the directory. This
document says where this plugin sits among them, including the cases where you
should install something else.

Download counts are from Obsidian's own
[`community-plugin-stats.json`](https://github.com/obsidianmd/obsidian-releases)
on 2026-10-17; the rest was gathered on 2026-10-12 from the GitHub API and by
reading each project's source. Cells dated 2026-09-01 or 2026-10-12 were not
refreshed; cells with no date are from 2026-10-12, except in the feature table
(below). This plugin is listed in the community directory (version 0.4.0, 110
downloads on 2026-10-17) and is also installable with BRAT.

Projects change; if yours is described wrongly, open an issue and it will be
corrected.

## The short version

Almost every plugin in this space does the same thing architecturally: it starts
an agent CLI with your vault as its working directory and gives you a nice chat
window in front of it. The agent then works on your notes the way it would work
on any folder of text files - with `Read`, `Write`, `Edit`, `Grep`.

That works, and for many people it is enough. But a vault is not a folder of
text files. It has a link graph, typed frontmatter properties, tags, and a live
notion of which note you are looking at.

This plugin gives the agent six tools that run *inside* Obsidian, through
Obsidian's own API. As of 2026-10-12 (Obsidian's CLI help page; the release date
of 1.12 not verified), the official command line interface since Obsidian 1.12
(Settings > General > Command line interface; Obsidian must be running) can do
much of the same from a shell: move and rename with link updates, backlinks,
links, unresolved links, property read and set, search, tags. An agent that is
told to use it can reach those operations. What differs here: the tools are
built in, need no CLI setup, and need no shell approval.

## The landscape

| Plugin | Downloads (2026-10-17) | How it talks to the agent | Agents | Obsidian API tools for the agent |
| --- | ---: | --- | --- | --- |
| [Copilot](https://github.com/logancyang/obsidian-copilot) | 2,656,647 | opencode; Claude Code through the Agent SDK; Codex through codex-acp | Claude Code, Codex, OpenCode | none; shipped skills (Markdown, Bases, Canvas, Obsidian CLI) |
| [Claudian](https://github.com/YishenTu/claudian) | 2,437,193 | per-agent adaptors (bundled Agent SDK, app-server, ACP) | Claude Code, Codex, Grok Build, OpenCode, Pi, DeepSeek Harness | none; renames through the Obsidian CLI |
| [Agent Client](https://github.com/RAIT-09/obsidian-agent-client) | 303,246 | Agent Client Protocol (ACP) | 9 presets + any ACP agent | none, by design |
| [Claude Sidebar](https://github.com/derek-larson14/obsidian-claude-sidebar) | 85,745 (2026-10-12; no stats entry on 2026-10-17) | real terminal (Python PTY) | Claude Code and 6 other CLIs | none documented |
| [Claude Code IDE](https://github.com/petersolopov/obsidian-claude-ide) | 19,813 | MCP over WebSocket to an external terminal | Claude Code | read-only editor context |
| [Codex Panel](https://github.com/murashit/codex-panel) | 17,243 (2026-10-12; no stats entry on 2026-10-17) | `codex app-server` JSON-RPC | Codex only | one, read-only (2026-09-01) |
| Companion for Claude | 4,727 | Claude Code sign-in, Anthropic API, or Ollama/OpenAI-compatible | Claude Code, API models | MCP bridge; Canvas and Bases |
| [Claude Code Skills](https://github.com/p3nguln5/obsidian-claude-code-skills) | 3,571 | `claude --print` stream | Claude Code | none |
| [Terminus](https://github.com/notenerdofficial/terminus) | 2,417 | terminal + pending-changes panel | Claude Code | none, but warns on backlink breakage |
| Claude Panel | 1,440 | Claude Code subprocess | Claude Code | `.mcp.json` only |
| [Terminal Agent Tabs](https://github.com/hirose30/terminal-agent-tabs) | 913 | xterm.js terminal (POSIX PTY) | any CLI, via profiles | none |
| [Agent MCP](https://github.com/rospaans/obsidian-agent-mcp) | 1,304 | terminal + IDE bridge + MCP (2026-09-01) | Claude Code, Ollama, Codex (2026-09-01) | 3, read-only (2026-09-01) |
| **AI Agent Panel** (this) | 110 | stdio `stream-json`, the CLI's own protocol | Claude Code (more planned) | **6, read and write** |
| [Glass](https://github.com/humantorch/glass) | 2,850 | xterm.js terminal + local MCP server (Bearer token) | Claude Code | 18, read and write; no rename, no properties |
| [Flint](https://github.com/aliou/obsidian-flint) | unlisted (2026-09-01) | in-process Pi agent, no CLI (2026-09-01) | Pi, OpenAI-compatible APIs (2026-09-01) | 10, incl. typed properties (2026-09-01) |

The long tail (for example Agent Threads and Vault Claude, 2026-10-12) does not
change the picture: chat panels or terminals over a working directory.

## The structural difference

Your vault's semantics live in Obsidian's metadata cache and file manager, not
on disk. Six operations follow from that. The table records which plugins
expose each one *to the agent as a built-in callable tool* - not which ones use
the API internally for their own UI, which most do, and not what an agent can
reach by running the Obsidian CLI through a shell.

| Capability | Who else has it |
| --- | --- |
| **Rename a note through Obsidian's own link updating** (`fileManager.renameFile`) | **No other built-in tool found** as of 2026-10-12. Reachable through the Obsidian CLI (`move`, `rename`; link updates follow the vault setting): Claudian's prompt tells the agent to do so. Otherwise an agent renaming a note breaks every `[[link]]` pointing at it. |
| **Read *and write* frontmatter properties atomically** (`processFrontMatter`) | **No other built-in tool found** as of 2026-10-12. Reachable through the Obsidian CLI (`property:set`, `property:read`, `property:remove`). Flint reads typed properties (2026-09-01). |
| **Search by metadata** - `tag:project -prop:status=done`, `heading:"Open questions"`, `prop:due` | Flint, via Obsidian Bases (dormant, unlisted, 2026-09-01); Obsidian CLI `search` and `tags`. |
| **Query the link graph** - outgoing links, backlinks, embeds, links that point nowhere | Glass; Flint (2026-09-01); Obsidian CLI (`backlinks`, `links`, `unresolved`). |
| **Ask what the user is looking at** - active note, cursor, selection | Flint (active note only, 2026-09-01). Others push the path into the prompt as text. |
| **Open a note in the user's window** | Glass (`open_note`, `navigate_to_heading`). |

Two of the larger competitors are not merely missing this - they are built so
as not to have it. Agent Client advertises
`fs: { readTextFile: false, writeTextFile: false }` to every agent it connects
to, documenting that "agents handle file operations through their own tools."
Codex Panel's design document caps its ambition explicitly at "narrow,
read-only Obsidian semantics that Codex cannot reproduce from the filesystem
alone." (Both from 2026-09-01.)

These six tools run over the stdio connection the plugin already holds open,
so they see the same live state your window does. The mechanism is in
[DES-006](design/DES-006-vault-tools.md), the permission and exposure details in
[SECURITY.md](SECURITY.md).

## Everything else, feature by feature

Against the three plugins most people actually choose between. Cells carry the
date they were last checked; cells with no date are from 2026-09-01.

| | This | Claudian | Agent Client | Codex Panel |
| --- | --- | --- | --- | --- |
| Conversation tabs | yes | yes | yes, plus floating windows and in-note chats | per-pane |
| History and session resume | yes | yes | agent-dependent | yes |
| Branch a conversation | yes | yes | agent-dependent | yes |
| Undo a turn's file changes | **yes**, through Claude Code's checkpoints, after listing the files | yes, two modes | **no** - documentation says use Git | conversation rollback only |
| Diff before you approve | **yes**, word-level, collapsible, **plus a rendered-Markdown preview** | in transcript, not on the prompt | agent-dependent | in transcript, not on the prompt |
| Permission prompts | yes, on by default | Auto / Manual / Accept edits / YOLO; **default Auto** since 2.3.10 (2026-10-03), YOLO is opt-in | yes, agent-dependent; auto-allow off | yes |
| Model picker | **built from the CLI's own reported list**, so new models appear without a plugin update | curated list | agent-supplied | `/model` |
| Plan usage / quota | yes, in the status line and `/usage` | no (2026-10-12) | no (2026-10-12) | yes, for Codex |
| Token, cost and context meter | yes, with a per-category breakdown | context % only | context indicator only (2026-10-12) | yes |
| Subagent transcripts | yes, in the agent row's thread | yes | **no** | yes |
| Markdown export | yes, configurable | **no** | yes | yes |
| Images | yes | yes | yes | yes |
| Run your own shell command (`!git status`) | **yes**, outside the agent's view unless you share it | no | **no** | no |
| Windows / WSL | **CLI profiles**, auto-detection across both sides | WSL for Codex only | WSL mode | no WSL handling |
| Per-setting sync control | **yes** - flip any setting between synced and device-local | no | no | no |
| Agents supported | Claude Code | 6 (2026-10-12) | 9 + any ACP (2026-10-12) | Codex |

Copilot (5-hour and 7-day), Claude Panel and the Claude Code VS Code extension
(`/usage`) also show plan usage (2026-10-12).

## When you should use something else

Install another plugin if you are one of these:

- **You want the most-supported choice.** Install
  [Claudian](https://github.com/YishenTu/claudian) (2.4 million downloads
  and version 2.3.22 on 2026-10-17; six agent backends, inline edit with a
  diff, desktop and a separate mobile plugin, 2026-10-12) or
  [Copilot](https://github.com/logancyang/obsidian-copilot) (2.7 million on
  2026-10-17; Projects, Quick Ask, semantic search; AGPL-3.0, and its hosted
  features call Brevilabs; 2026-10-12). Claudian passes Claude through the bundled Anthropic Agent SDK;
  its permission default is Auto and YOLO (full bypass) is opt-in - check the
  dropdown before your first message.
- **You want the widest agent support, or you use Gemini CLI, Kiro or
  OpenCode.** Install [Agent Client](https://github.com/RAIT-09/obsidian-agent-client).
  ACP means new agents work without waiting for a plugin update.
- **You only use Codex.** [Codex Panel](https://github.com/murashit/codex-panel)
  is built around it, with the best rate-limit and spend meters in the space
  (2026-09-01).
- **You want a real terminal, not a chat panel.** Glass, Claude Sidebar,
  Terminal Agent Tabs or Agent MCP - though note that Terminal Agent Tabs is
  macOS-only and Agent MCP's terminal needs a Unix PTY (2026-09-01).
- **You want semantic search over the vault.** Smart Connections (1,240,654
  downloads on 2026-10-17, local embeddings), Copilot or Companion for Claude. This plugin
  has none (2026-10-12).
- **You want inline editing in the note, or a floating or in-note chat.**
  Claudian and Agent Client have them (2026-10-12); this plugin has the sidebar panel only.
- **You want this on mobile.** No plugin that drives a local CLI can work there,
  this one included. Companion for Claude and Claudian's separate mobile plugin
  run on phones (2026-10-12; not tested).

This plugin also has no Projects UI and no turn-complete
notification, and needs an installed, logged-in Claude Code.

Use this plugin if you want the agent to work on your vault *as a vault* with
built-in tools - to rename a note without breaking your links, to set a property
without mangling your YAML, to find every note tagged `project` without a
`status` - and a permission card with a diff before anything is written.
