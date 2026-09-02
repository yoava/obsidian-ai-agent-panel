# How this compares to other agent plugins

Obsidian has more than thirty plugins that put an AI coding agent in your vault.
Several are enormous - one of them is the 13th most-downloaded plugin in the
entire directory. This document is an honest account of where this plugin sits
among them, including the cases where you should install something else.

Figures were gathered on 2026-09-01 from Obsidian's own
[`community-plugin-stats.json`](https://github.com/obsidianmd/obsidian-releases),
the GitHub API, and by reading each project's source. This plugin is not yet
published, so its own download count is zero.

These comparisons were made by reading each project's source on the date above.
Projects change; if yours is described wrongly, open an issue and it will be
corrected.

## The short version

Almost every plugin in this space does the same thing architecturally: it starts
an agent CLI with your vault as its working directory and gives you a nice chat
window in front of it. The agent then works on your notes the way it would work
on any folder of text files - with `Read`, `Write`, `Edit`, `Grep`.

That works, and for many people it is enough. But a vault is not a folder of
text files. It has a link graph, typed frontmatter properties, tags, and a live
notion of which note you are looking at. An agent holding only a filesystem
cannot see any of it.

This plugin gives the agent six tools that run *inside* Obsidian, through
Obsidian's own API. As of this writing, no other plugin in the directory offers
three of the capabilities they provide.

## The landscape

| Plugin | Downloads | How it talks to the agent | Agents | Obsidian API tools for the agent |
| --- | ---: | --- | --- | --- |
| [Claudian](https://github.com/YishenTu/claudian) | 1,967,678 | per-agent adaptors (Agent SDK, app-server, ACP) | Claude Code, Codex, Grok, OpenCode, Pi | none |
| [Copilot](https://github.com/logancyang/obsidian-copilot) | 1,794,769 | agent runner | Claude Code, Codex, OpenCode | none documented |
| [Agent Client](https://github.com/RAIT-09/obsidian-agent-client) | 254,426 | Agent Client Protocol (ACP) | 7 presets + any ACP agent | none, by design |
| [Claude Sidebar](https://github.com/derek-larson14/obsidian-claude-sidebar) | 74,163 | CLI subprocess | Claude Code, Codex, others | none documented |
| [Claude Code IDE](https://github.com/petersolopov/obsidian-claude-ide) | 15,460 | MCP over WebSocket | Claude Code | read-only editor context |
| [Codex Panel](https://github.com/murashit/codex-panel) | 11,931 | `codex app-server` JSON-RPC | Codex only | one, read-only |
| [Claude Code Skills](https://github.com/p3nguln5/obsidian-claude-code-skills) | 1,787 | `claude --print` stream | Claude Code | none |
| [Glass](https://github.com/humantorch/glass) | 1,668 | xterm.js terminal + vault MCP server | Claude Code | 10, read-only |
| [Terminal Agent Tabs](https://github.com/hirose30/terminal-agent-tabs) | 566 | xterm.js terminal (POSIX PTY) | any CLI, via profiles | none |
| [Agent MCP](https://github.com/rospaans/obsidian-agent-mcp) | 472 | terminal + IDE bridge + MCP | Claude Code, Ollama, Codex | 3, read-only |
| [Terminus](https://github.com/notenerdofficial/terminus) | 446 | terminal + pending-changes panel | Claude Code | none, but warns on backlink breakage |
| [Flint](https://github.com/aliou/obsidian-flint) | unlisted | in-process Pi agent, no CLI | Pi, OpenAI-compatible APIs | 10, incl. typed properties |
| **AI Agent Panel** (this) | unpublished | stdio `stream-json`, the CLI's own protocol | Claude Code (more planned) | **6, read and write** |

There is a long tail below this - Codian, KatmerCode, Lodestone, Any AI CLI,
Claude Panel, Oh My Claudian, Buildian and a dozen more. None of them changes
the picture: they are chat panels or terminals over a working directory.

## The one structural difference

Your vault's semantics live in Obsidian's metadata cache and file manager, not
on disk. Six operations follow from that, and this table records which plugins
expose each one *to the agent as a callable tool* - not which ones use the API
internally for their own UI, which most do.

| Capability | Who else has it |
| --- | --- |
| **Rename a note and rewrite every backlink** (`fileManager.renameFile`) | **None found** as of 2026-09-01: zero uses in the sources of Claudian, Codex Panel and Flint; undocumented in all others. In every other plugin, an agent renaming a note silently breaks every `[[link]]` pointing at it. |
| **Read *and write* frontmatter properties atomically** (`processFrontMatter`) | **None found** as of 2026-09-01: Flint reads typed properties but can only write by rewriting the whole file. Everyone else sees frontmatter as raw YAML text the model must parse and re-emit by hand. |
| **Search by metadata** - `tag:project -prop:status=done`, `heading:"Open questions"`, `prop:due` | **Only Flint**, via Obsidian Bases - and Flint is dormant since June 2026, unlisted, and has no permission prompts. |
| **Query the link graph** - outgoing links, backlinks, embeds, links that point nowhere | Glass (read-only), Flint. |
| **Ask what the user is looking at** - active note, cursor, selection | Flint (active note only). Others push the path into the prompt as text; none lets the agent *ask*. |
| **Open a note in the user's window** | **None found** as of 2026-09-01 as an agent-callable tool. |

Two of the largest competitors are not merely missing this - they are built so
as not to have it. Agent Client advertises
`fs: { readTextFile: false, writeTextFile: false }` to every agent it connects
to, documenting that "agents handle file operations through their own tools."
Codex Panel's design document caps its ambition explicitly at "narrow,
read-only Obsidian semantics that Codex cannot reproduce from the filesystem
alone."

These six tools run over the stdio connection the plugin already holds open. No
port, no lock file, no MCP config, no second process - and because they execute
inside Obsidian, they see the same live state your window does. Every one still
asks permission first, and they can be switched off entirely.

## Everything else, feature by feature

Against the three plugins most people actually choose between.

| | This | Claudian | Agent Client | Codex Panel |
| --- | --- | --- | --- | --- |
| Conversation tabs | yes | yes | yes, plus floating windows and in-note chats | per-pane |
| History and session resume | yes | yes | agent-dependent | yes |
| Branch a conversation | yes | yes | agent-dependent | yes |
| Undo a turn's file changes | **yes**, after showing the diff it would undo | yes, two modes | **no** - documentation says use Git | conversation rollback only |
| Diff before you approve | **yes**, word-level, collapsible, **plus a rendered-Markdown preview** | in transcript, not on the prompt | agent-dependent | in transcript, not on the prompt |
| Permission prompts | yes, on by default | exist, but **the factory default is `yolo`** - full bypass, no prompt ever | yes, agent-dependent | yes |
| Model picker | **built from the CLI's own reported list**, so new models appear without a plugin update | curated list | agent-supplied | `/model` |
| Plan usage / quota | yes, with a usage strip and `/usage` | no | no | yes, for Codex |
| Token, cost and context meter | yes, with a per-category breakdown | context % only | agent-dependent | yes |
| Subagent transcripts | yes, nested under the Task card | yes | **no** | yes |
| Markdown export | yes, configurable | **no** | yes | yes |
| Images | yes | yes | yes | yes |
| Run your own shell command (`!git status`) | **yes**, outside the agent's view unless you share it | no | **no** | no |
| Windows / WSL | **CLI profiles**, auto-detection across both sides | WSL for Codex only | WSL mode | no WSL handling |
| Per-setting sync control | **yes** - flip any setting between synced and device-local | no | no | no |
| Agents supported | Claude Code | 5 | 7 + any ACP | Codex |

## When you should use something else

This is a young plugin with no public users yet. Be honest with yourself about
which of these you are:

- **You want the most-supported choice.** Install
  [Claudian](https://github.com/YishenTu/claudian). Two million downloads, a
  release every two or three days, sponsors, and five agent backends. It is
  clean on privacy - no telemetry, no analytics, no endpoint of its own - but
  **switch its composer toggle from YOLO to Safe before your first message.**
  Out of the box it passes `bypassPermissions` to Claude and
  `sandbox: danger-full-access` to Codex, so the agent can edit any note and run
  any shell command without ever asking. That default is deliberate and the
  maintainer has declined to change it ([#878](https://github.com/YishenTu/claudian/issues/878)).
- **You want the widest agent support, or you use Gemini CLI, Kiro or
  OpenCode.** Install [Agent Client](https://github.com/RAIT-09/obsidian-agent-client).
  ACP means new agents work without waiting for a plugin update.
- **You only use Codex.** [Codex Panel](https://github.com/murashit/codex-panel)
  is built around it, with the best rate-limit and spend meters in the space.
- **You want a real terminal, not a chat panel.** Glass, Terminal Agent Tabs or
  Agent MCP - though note that Terminal Agent Tabs is macOS-only and Agent MCP's
  terminal needs a Unix PTY.
- **You want this on mobile.** No plugin that drives a local CLI can work there,
  this one included. Flint is the only agent plugin that runs on phones, because
  it calls model APIs directly.

Use this plugin if you want the agent to work on your vault *as a vault* - to
rename a note without breaking your links, to set a property without mangling
your YAML, to find every note tagged `project` without a `status`, and to know
which paragraph you have selected. That is the thing it does that the others do
not.
