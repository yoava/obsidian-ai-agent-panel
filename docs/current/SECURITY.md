# Security

## The four capabilities, up front

An automated plugin review flags these, and they are all inherent to hosting a
coding agent. Stated plainly so nothing about them is a surprise:

| Capability | Where | Why |
| --- | --- | --- |
| Process execution | `node:child_process` in `src/protocol/client.ts`, `src/cli.ts`, `src/bash.ts` | Launching and talking to the `claude` CLI, detecting where it is installed, and running the `!` command you typed. `shell: false` with array arguments everywhere the platform allows; the three exceptions are documented under *Hardening choices* below. |
| Filesystem access outside the vault | `node:fs`'s `existsSync` in `src/cli.ts` | Probing a short list of standard CLI install paths under your home directory. Read-only, and the only paths tested are ones the plugin composes itself. The plugin writes nothing outside the vault; the *agent* can, with your approval, exactly as it could from a terminal. |
| Vault enumeration | `getFiles` / `getMarkdownFiles` / `getAllLoadedFiles` in `src/suggest.ts`, `src/ui/composer.ts`, `src/context-builder.ts`, `src/settings.ts`, `src/mcp/vault-tools.ts` | `@`-mention completion and the paths of `@` mentions stored with a prompt, the attach picker, the transcript-folder suggester, and `obsidian_search`'s tag/property queries. These read Obsidian's index - paths, tags, frontmatter - not note bodies. |
| Clipboard | `navigator.clipboard.writeText` in `src/ui/copy.ts`, the one clipboard writer | The copy buttons on prompts, turn footers and command cards. **Write only.** The plugin calls no clipboard read API; pasted images reach it through a `paste` event the user triggered, which carries its own data. |

`isDesktopOnly` is `true` in `manifest.json` - a mobile Obsidian has no Node,
and every one of these except the clipboard depends on it.

## Model

- **Local first.** The plugin spawns your locally installed `claude` CLI with
  the vault root as its working directory. All model traffic is the CLI's,
  authenticated by your existing Claude Code login.
- **The plugin makes no network requests of its own.** Not one - including
  plan usage, which is asked of the *running CLI session* over the stdio pipe
  the plugin already owns (how: [DES-007](design/DES-007-usage-and-cost.md)); the CLI performs any authenticated call itself, with the login it
  already has. The plugin therefore never reads `~/.claude/.credentials.json`,
  never touches the macOS Keychain, never holds an access token, and opens no
  socket. The `fundingUrl` in `manifest.json` is not an exception to this:
  Obsidian renders it as a link in the plugin list, the settings page shows
  the same links at its foot, and nothing is fetched unless you click one, which hands the URL to your browser like any other
  external link.
- **The README's badges are the one thing that fetches without a click**, and
  they are not the plugin doing it. Whatever renders the README - GitHub, or
  Obsidian's plugin browser - loads three badge images: two from `github.com`,
  which it is already talking to for the README itself, and the release badge
  from `img.shields.io`, which is a third party that therefore sees a request
  when the page is viewed. No badge is in the installed plugin, so none of this
  happens in your vault at runtime; it is a property of reading the project
  page, like any image in any README.
- **No credentials of the plugin's own.** The plugin never stores API keys or
  tokens. Its `data.json` holds only plugin settings (model alias,
  export/usage preferences, and any setting switched to synced); device-local
  settings - by default CLI paths/profiles, the default permission mode, the
  bypass switch, vault instructions, the `!` shell escape and the vault tools,
  plus any setting switched to "this device only" via its cloud badge - are
  kept in Obsidian's per-vault localStorage instead, so they stay out of
  synced vault data. Which settings are device-only is itself kept per
  device. While device-only, the CLI profiles and the five security settings
  never take a value from `data.json` on a fresh device; they start at their
  defaults (one auto-detect CLI profile). A device updating from 0.5.0 or
  earlier, which kept the security settings in `data.json`, takes four of them once: the
  default permission mode only if Plan or Claude Code default (the mode the
  CLI is configured with), Bash and vault tools and vault instructions as
  stored, or off, off and empty when another device already moved them out of
  the file; Bypass and the CLI profiles never. The update therefore trusts the
  shared file's current Bash, vault-tools, mode (Plan or Claude Code's
  configured default) and instructions values once, and never grants more than
  a fresh device's defaults, the instructions excepted. A device still on 0.5.0
  after another updated runs with Bash and vault tools on and no instructions
  until it updates; update every device. A stored
  value of the wrong type falls back to its default. A shared or edited
  `data.json` therefore cannot choose the executable and its arguments on a
  device that keeps its profiles local; it can on a device that syncs them,
  and switching the group from synced to device-only keeps the profiles then
  in effect. Profiles a device already holds stay, wherever they came from.
  The learned model lists, resolutions and startup modes never seed from
  `data.json` either, and the device's copy is read as data: an entry of another
  shape or with a value that could act as a command-line argument is dropped.
- **Local data.** Conversation history lives as JSON under
  `.obsidian/plugins/ai-agent-panel/history/`; optional transcript exports are
  regular notes in the vault. Both contain conversation content, including tool
  inputs and (cut to 1500 characters) results. Obsidian Sync copies only `main.js`, `manifest.json`,
  `styles.css` and `data.json` from a plugin folder, so the history folder
  does not travel through it; any tool that mirrors the whole
  vault folder (iCloud, Dropbox, git, Syncthing) will carry them. Uninstalling
  the plugin deletes the folder and everything in it. Treat exported
  transcripts like any other note.
- **File checkpoints are Claude Code's.** The panel starts the CLI with
  `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`, so before the main agent's
  `Edit`, `Write`, `MultiEdit` or `NotebookEdit` writes a file, Claude Code
  copies it to `~/.claude/file-history/<session>/` (inside the distro for a
  WSL profile), files outside the vault included. The plugin stores no file
  contents. The copies stay until Claude Code's own cleanup (30 days by
  default) or `claude purge`, not until the conversation is deleted; a
  `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` you set turns them off (for a WSL
  profile, set inside the distro or named in `WSLENV`).
  *Restore files* asks the CLI for a dry run, names every file in a
  confirmation (marking those outside the vault), then has the CLI write them
  back; it also undoes later turns' tracked edits and deletes tracked files
  created since, outright rather than to trash. Subagent edits (other than a
  foreground forked skill's), shell commands, the vault tools, links and
  directories are not restored. On load
  the plugin removes the folder of pre-edit copies earlier versions kept in
  `.obsidian/plugins/ai-agent-panel/checkpoints/`.
- **Consent-gated tools.** In the default permission mode, every sensitive
  tool call (file edits, shell commands, web access) requires explicit
  approval in the chat. "Always allow" persists a scoped rule through Claude
  Code's own permission-rule mechanism.
- **Profile launch options pass nothing unless you set them.** Each CLI
  profile's *Claude in Chrome* and *Sandbox* default to *Claude Code default*,
  where the panel adds no flag and your Claude Code settings decide.
  - *Claude in Chrome* on: Claude can act in your browser with your logged-in
    sessions. Which sites it may use is governed by the extension's own
    per-site permissions; Claude Code's permission rules still apply to the
    browser tools.
  - *Sandbox* on: Claude Code runs shell commands inside an OS-enforced
    boundary (files and hosts per your Claude Code settings) and, by its
    default `sandbox.autoAllowBashIfSandboxed`, runs sandboxed commands
    without a permission card. Fewer cards, inside a boundary - not a
    weaker setting. In *Auto-approve everything* the panel also answers,
    without a card, the sandbox's prompt to reach a host outside its
    allowed list; a command asking to run outside the sandbox gets the card.
    Claude Code's `sandbox.allowUnsandboxedCommands: false` removes that
    escape altogether. Native Windows has no sandbox, so the option is not
    offered there.
  - *Additional arguments* are passed as typed. Flags the panel sets itself
    (`--model`, `--resume`, `--permission-mode`, the stream-JSON and
    `--dangerously-skip-permissions` flags, …) are refused, so the chat's
    controls stay truthful. Anything else - including flags that widen what
    Claude may do, such as `--allowedTools` or a `--settings` that grants
    permissions - is your call, exactly as on a command line.
  The profiles live in the *Claude Code CLI* settings group, which is
  device-local by default, so a device's own profiles never go into
  `data.json` unless you choose to sync that group; a device with no profiles
  of its own starts with auto-detect and takes none from `data.json`.
- **Command cards are saved like the rest of the transcript.** `/status`
  shows your account's email and organization and `/memory` and `/hooks`
  show paths and hook commands; a card is stored in the conversation history
  and, with export on, in the exported note. `/mcp`'s Enable and Disable
  buttons, and `/mcp enable|disable <server>|all`, change which MCP servers
  Claude Code loads, and Claude Code records that in its own configuration
  exactly as `/mcp` in a terminal does; Reconnect only reconnects. The panel's
  own `obsidian` server is left out - its setting is the switch. Nothing else
  a card offers changes state.
- **Bypass mode is double-gated.** `bypassPermissions` is hidden unless
  enabled in settings (with a warning), and only then selectable per
  conversation. A new conversation never starts in it, a saved one reopens
  in it only while the setting is on, and turning the setting off moves
  conversations in Bypass to *Ask before acting* and restarts every open
  conversation's CLI without the bypass flag when the settings close.
- **A clear never loosens the permission mode.** The panel keeps the mode in
  force just before the reset, or a mode the user picked since, and sets it
  again before it sends anything if the new session reports another, none or an
  unrecognised one; if the CLI refuses or does not answer within 15 s, it
  restarts the CLI with the conversation's mode flag.
- **Auto-approve is the plugin answering, not the CLI standing down.** The
  *Auto-approve everything* permission mode leaves the CLI in its normal mode,
  so its permission system, deny rules and hooks all still run and a request
  they refuse never reaches the plugin; what changes is that requests which
  *do* reach it are answered `allow` with no card, except a request Claude
  Code flags, which gets the normal card: one decided by a rule, a hook or
  one of Claude Code's own safety checks (such as removing a critical path),
  a command asking to run outside the sandbox (by Claude Code's reason or by
  the call's own `dangerouslyDisableSandbox` input), an MCP tool your
  organization set to always ask, one needing the user, and one whose
  reason the panel does not recognize. A Claude Code from before these
  reason fields reports nothing to flag, so on it Auto-approve answers every
  request that reaches the panel, the sandbox escape excepted; keep the CLI
  current. One gap: an `ask` rule that matches
  one command of a compound command in which another command also needs
  approval (`npm run build && git push`, with an ask rule on `git push`)
  reaches the panel with no sign of the rule, so Auto-approve answers it; a
  `PreToolUse` hook that returns `ask` for such commands is flagged and gets
  the card.
  In this mode an edit, with or without its card, is
  answered once the file has been read for its diff, or after 5 seconds
  without that read. A conversation saved in Auto-approve reopens in it only
  after you confirm. It is not gated behind the bypass toggle, so treat it as
  what it says: while it is on, Claude edits
  files and runs shell commands in your vault without asking. Both the mode
  picker and the settings dropdown mark it with a warning, and the status line
  under the composer shows it in red for as long as it is selected. It is
  per-conversation, and every tool call still draws its step row.
- **Stop and clear approves nothing and loosens no mode.** A `/clear` that
  meets running agents or background tasks asks first. On "Stop and clear" the
  panel denies every open permission card and every request that arrives until
  the clear is sent, in every mode, so an Allow clicked after the press, or a request
  racing it, cannot approve a tool; it stops each task and interrupts the CLI,
  and clears only once every task has been reported ended by a status known to
  be terminal, and a last look at the tab, just before the clear, finds the same
  CLI process alive and no turn, queued message or unfinished task. A stop
  reply, an unknown status, a missing task or an exit is not that report. If that
  does not happen within 15 seconds, or the CLI exits, nothing is cleared and
  the context stays as it was.
- **The `obsidian` MCP server opens nothing.** The vault tools
  (`obsidian_rename`, `obsidian_links`, `obsidian_search`,
  `obsidian_properties`, `obsidian_active`, `obsidian_open`) run **in-process**,
  as a handler for `mcp_message` control requests on the stdio pipe the plugin
  already owns. No network port is opened, no `.mcp.json` or other config file
  is written, no standalone server process is spawned, and no credential is
  involved or stored. Every call raises the CLI's normal permission prompt, so
  the ones that write (`obsidian_rename`, `obsidian_properties`) or change your
  window (`obsidian_open`) need your approval exactly like any file edit.
  `obsidian_rename` confines its target to the vault and refuses the
  configuration folder and any hidden name, a segment starting with `.` such as
  `.claude/`, `.git/hooks` or `.mcp.json`, where Claude Code or Git would run
  what it finds, any segment shaped like a Windows short name (`CLAUDE~1`,
  `MCP~1.JSO`), which on NTFS opens the hidden one it shortens, and any name
  with a character Obsidian forbids (`* " < > : | ?`; on NTFS a `:` addresses
  a stream the vault never lists)
  ([DES-006](design/DES-006-vault-tools.md), steps 1 and 2). It
  does not stop a target inside a symlinked or junctioned folder, or a non-dot
  name that another tool loads or runs: `CLAUDE.md`, `CLAUDE.local.md` or
  `AGENTS.md` at the root or in a folder, a tool config such as `lefthook.yml`,
  or a new extension (`x.md` to `x.cmd`). The whole server can be turned off in
  settings; on Claude Code older than 2.1.210 it is silently unavailable.
- **The `!` shell escape is yours, not the model's.** Typing `!<command>` in
  the composer runs that command locally, with the vault as its working
  directory, and shows stdout/stderr. It deliberately does **not** go through
  Claude Code's permission prompts, because there is no model decision to
  approve - you typed it, the way you would in a terminal. The model never
  sees the command or its output unless you press *Add output to chat*, which
  only puts the text in the composer for you to send. It cannot be triggered by
  model output: a reply containing `!rm -rf` is inert text, since the only path
  to execution is your own keystrokes plus Enter in the composer. Each run is
  killed after 60 seconds and each stream is capped at 100k characters. The
  whole feature can be turned off in settings (*Enable the composer's "!" shell
  escape*).
- **Images you attach are sent to Anthropic**, like any other context. They are
  held in memory until the message is sent and are **not** written to the
  conversation history - only the number of images is recorded.
- **Data leaves your machine by design** when you use it: attached note
  context (note, folder and file paths; your editor selection, up to 8,000
  characters; with *links & properties* on, the note's property values and
  its link lists - note text sent without a tool call), and anything Claude
  reads, is sent to Anthropic's API by the CLI -
  identical to running Claude Code on any folder. Under Claude Code's default
  rules its read-only tools (Read, Grep, Glob) run inside the vault without a
  permission card, so reading is not consent-gated the way edits and commands
  are.
  Don't point it at a vault whose contents you may not send to Anthropic.
- **Defaults.** Out of the box the `!` shell escape and the `obsidian` MCP
  server are on, the permission mode is Claude Code's own default (*Ask before
  acting* unless your Claude Code settings set `permissions.defaultMode`), and
  *Bypass permissions* is hidden until enabled in settings. *Auto-approve
  everything* is never selected out of the box, but it is not per-conversation only: it is
  one of the choices in the *Default permission mode* setting, so it can be
  made the persisted default that every new conversation starts in on this
  device (the setting is device-only unless you sync it). A stored default
  outside that setting's four choices loads as Claude Code default.

## Hardening choices in the code

- `child_process.spawn` with `shell: false` and array arguments wherever the
  platform allows - no shell string interpolation, no injection surface. The
  WSL CLI-detection probe (`wsl.exe -- sh -lc "command -v claude"`) uses a
  fixed command line with no interpolated input.
  Three places involve a shell; the launch shapes are in
  [DES-002](design/DES-002-cli-client-and-session-lifecycle.md) and the `!`
  escape in [DES-004](design/DES-004-permission-and-change-control.md):
  - **`claude.cmd` on native Windows** (npm's batch shim, which Node refuses to
    spawn shell-less since CVE-2024-27980) goes through `cmd.exe` with a
    command line the plugin builds entirely itself: the shim path (always
    quoted), fixed flags, the configured model/effort, a session id and the
    profile's arguments. An argument or shim path with a character cmd.exe
    would act on (`&`, `^`, `%`, `!`, `"`, a line break) is refused, not
    escaped, and nothing model-controlled is in the line. Shape asserted in
    `tests/protocol.test.mjs`.
  - **Run via WSL** uses `wsl.exe --exec` and a login `sh` that receives the
    arguments as positional parameters, so no shell parses them (with `--`
    the distro's default shell would re-parse the whole line, and bash, zsh
    and fish each read quotes differently). Checked against a real `wsl.exe`
    with arguments containing `;`, `$`, backticks, quotes, trailing
    backslashes, tabs and newlines. Only the CLI path is shell text; it comes
    from your settings or from detection, never from the model. It keeps
    `~/`, `$NAME` and `${NAME}` expansion but runs no command: backticks and
    every other `$` are escaped.
  - **The `!` shell escape** passes the user's command as a single argv
    element, never concatenated into a larger command line, so the shell sees
    exactly the text that was typed. Asserted in `tests/bash.test.mjs`.
- No `innerHTML` / `outerHTML` / `eval` / dynamic `Function`. Model output is
  rendered via Obsidian's `MarkdownRenderer`, which strips scripts and
  dangerous HTML; everything else enters the DOM as text nodes. Before it
  renders or exports a reply, `src/inert-markdown.ts` cuts out every code
  span, fence and math span, and the panel rebuilds them as plain `code`
  elements and MathJax output the renderer never saw (math that sets CSS or
  links shows as code); a fence in a display language is rendered alone from
  a fence the module built. So no other
  plugin's code-block or inline-code processor (Dataview's JavaScript
  queries, for example) runs on model text. Images become their alt text and
  URL unless plainly from the vault, raw HTML other than simple inline
  formatting shows as text, and a line cannot start indented code with a
  Dataview query, so displaying a reply loads nothing from the network. An
  exported note gets the same cut as inert Markdown (your prompts included,
  not only replies), its fences rebuilt so nothing before them can reopen
  one. Rules:
  [DES-001](design/DES-001-system-overview.md#rendering-boundary); asserted
  in `tests/inert-markdown.test.mjs`.
- **Path handling is validated, not trusted.** Exported note names are
  sanitized per path segment (traversal characters and `..` segments
  stripped) and always resolve under the configured folder; a note's stored
  export path is re-validated on every reuse (a backslash or colon is
  refused). Conversation ids (which become history file names) are checked
  against the generated id shape before any read/write/delete, and each loaded record's id is pinned to its file name.
  This blocks a tampered or synced history/settings file from steering a
  write or delete outside the plugin's folders. A stored session id, model,
  effort or profile id, in a conversation file or the settings, that starts
  with `-`, holds whitespace, a control character or a character cmd.exe acts
  on, or is over 200 characters is ignored, so no stored value reaches the
  CLI's command line as a flag. A stored session id, the conversation's, a turn's, a boundary's or a pending branch's, must also be a lowercase UUID, checked on load and again where `--resume` is built, and is used to resume, fork, branch or undo only if this device recorded it for that conversation and CLI profile, in device-local storage no sync tool carries (ADR-018); conversations present when the history folder was first migrated on a device are trusted as they then stood. A conversation file still chooses which of
  this device's CLI profiles, with its executable and arguments, its reopen
  runs on: a risk carried until the owner decides it
  ([open decision D-06](open-decisions.md)). Device-local values are read
  back through `src/local-store.ts`, which types them `unknown` rather than
  Obsidian's `any`, so the compiler makes every caller narrow a stored value
  before using it.
- The only runtime npm dependencies are the two Geist font packages
  (`@fontsource-variable/geist`, `geist-mono`): `.woff2` data in `main.js`, no
  code, no scripts; any other is admitted only through the dependency screen
  ([ADR-007](adr/ADR-007-runtime-dependencies.md)). CI audits the tree that ships
  (`npm audit --omit=dev`); the full tree, dev dependencies included, was also
  clean at release time. A dev-only advisory affects the build, not the
  plugin you install, so it does not gate contributor pull requests.
- **Release workflow actions are pinned to commit SHAs**, not to mutable tags.
  `release.yml` runs with `contents: write` and produces the `main.js` users
  install, so a third party who moved a `v4` tag could otherwise have run code
  in that job. The trailing comment records which version each SHA was, and
  Dependabot proposes the bumps (`.github/dependabot.yml`) so a pin is only
  ever moved by a reviewed pull request, never silently.
- **Release assets carry a signed provenance attestation.** `release.yml`
  attests `main.js`, `manifest.json` and `styles.css` with
  `actions/attest-build-provenance`, so each release asset has a Sigstore-signed
  statement naming the workflow, repository, and commit that produced it. Anyone
  can check that the `main.js` in a release really came from this repository's
  release workflow, rather than being uploaded by hand (the command is in the
  [README](../../README.md) under *Verifying a release*). This is what makes
  the reproducible build useful to a third party: the build is byte-for-byte
  repeatable from source, and the attestation ties the published bytes to the
  run that produced them.
- Tool inputs/results shown in the UI are length-capped before rendering.

## Residual considerations

- **What still sees rendered replies.** Other plugins' post processors run
  on the rendered reply, so a plugin that reads arbitrary DOM sees its text,
  and one that reads it after rendering finishes also sees the rebuilt code.
  A plugin that acts on a display language the panel renders (a run button
  on `python` blocks, for example) acts on model code too; the allowlist
  rests on known plugins, since Obsidian cannot list what is registered.
  Embeds of vault notes render as they do when opened. Following a link is
  always your click: vault links open only when they resolve to a file that
  already exists (a stray click can't create a note), only `http(s)`,
  `mailto` and `obsidian` targets go to the OS handler, and a `file:` link or
  any other scheme opens nothing. An `obsidian://` link still runs whatever
  Obsidian or a plugin registered for it.
- **Local data footprint.** History JSON stores tool inputs in full (the UI
  cuts its display of them) and tool results, and `!` command output, cut to
  1500 characters each, the id of each Claude Code session that a clear or a
  fresh start ended or did not resume (an id the panel uses only if this
  device recorded it, the rule under *Hardening choices*), and the summary Claude
  Code writes when it compacts
  the conversation (what it kept of the conversation, in full; exported notes
  leave it out); exported notes contain the whole stored conversation.
  This is intended - the history is the source of truth - but it means most of
  what Claude saw is on disk in your vault/plugin folder.

## Reporting a vulnerability

Please open a GitHub security advisory (or a private report to the
maintainer) rather than a public issue. Include reproduction steps and the
plugin/Obsidian/Claude Code versions involved.

The full policy - supported versions, response expectations, and how a
confirmed issue gets published as an advisory - is in
[SECURITY.md](../../SECURITY.md) at the repository root.
