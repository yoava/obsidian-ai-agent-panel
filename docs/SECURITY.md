# Security

## Model

- **Local first.** The plugin spawns your locally installed `claude` CLI with
  the vault root as its working directory. All model traffic is the CLI's,
  authenticated by your existing Claude Code login.
- **The plugin makes no network requests of its own.** Not one - including
  plan usage. The usage strip and the `/usage`, `/usage-credits` and
  `/extra-usage` commands ask the *running CLI session* for the numbers, as a
  `get_usage` control request over the stdio pipe the plugin already owns; the
  CLI performs any authenticated call itself, with the login it already has.
  The plugin therefore never reads `~/.claude/.credentials.json`, never touches
  the macOS Keychain, never holds an access token, and opens no socket. The
  trade-off is that plan usage is only available while a session is running -
  by design, since nothing here will start a CLI process just to draw a strip.
  Anthropic marks `get_usage` experimental, so a CLI that does not answer it
  simply shows no usage rather than erroring. The `fundingUrl` in
  `manifest.json` is not an exception to this: Obsidian renders it as a link in
  the plugin list, and nothing is fetched unless you click it, which hands the
  URL to your browser like any other external link.
- **No credentials of the plugin's own.** The plugin never stores API keys or
  tokens. Its `data.json` holds only plugin settings (model alias, mode
  defaults, vault instructions, export/usage preferences); device-local
  settings - CLI paths/profiles by default, plus any setting switched to
  "this device only" via its cloud badge - are kept in Obsidian's
  per-vault localStorage instead, so they stay out of synced vault data.
- **Local data.** Conversation history lives as JSON under
  `.obsidian/plugins/ai-agent-panel/history/`; optional transcript exports are
  regular notes in the vault. Both contain conversation content, including tool
  inputs and outputs. Obsidian Sync copies only `main.js`, `manifest.json`,
  `styles.css` and `data.json` from a plugin folder, so the history and
  checkpoint folders do not travel through it; any tool that mirrors the whole
  vault folder (iCloud, Dropbox, git, Syncthing) will carry them. Uninstalling
  the plugin deletes the folder and everything in it. Treat exported
  transcripts like any other note.
- **Turn checkpoints hold note contents.** To make "restore files" possible,
  the pre-edit contents of every file a turn changes are written to
  `.obsidian/plugins/ai-agent-panel/checkpoints/`. That is a second copy of those
  notes inside the vault folder - bounded (2 MB per file, 24 MB total, 400
  checkpoints, oldest pruned) and removed with the conversation, but present
  until then. Restoring writes through Obsidian's own APIs and sends files the
  turn created to trash rather than deleting them outright. Checkpoint records
  are refused unless their stored conversation id and turn match their file
  name, so a tampered or synced file cannot make a restore write somewhere
  else.
- **Consent-gated tools.** In the default permission mode, every sensitive
  tool call (file edits, shell commands, web access) requires explicit
  approval in the chat. "Always allow" persists a scoped rule through Claude
  Code's own permission-rule mechanism.
- **Bypass mode is double-gated.** `bypassPermissions` is hidden unless
  enabled in settings (with a warning), and only then selectable per
  conversation.
- **Auto-approve is the plugin answering, not the CLI standing down.** The
  *Auto-approve everything* permission mode leaves the CLI in its normal mode,
  so its permission system, deny rules and hooks all still run and a request
  they refuse never reaches the plugin; what changes is that requests which
  *do* reach it are answered `allow` with no card. It is not gated behind the
  bypass toggle, so treat it as what it says: while it is on, Claude edits
  files and runs shell commands in your vault without asking. Both the mode
  picker and the settings dropdown mark it with a warning, and the control row
  under the composer shows it in red for as long as it is selected. It is
  per-conversation, and every tool call still draws its activity card.
- **The `obsidian` MCP server opens nothing.** The vault tools
  (`obsidian_rename`, `obsidian_links`, `obsidian_search`,
  `obsidian_properties`, `obsidian_active`, `obsidian_open`) run **in-process**,
  as a handler for `mcp_message` control requests on the stdio pipe the plugin
  already owns. No network port is opened, no `.mcp.json` or other config file
  is written, no standalone server process is spawned, and no credential is
  involved or stored. Every call raises the CLI's normal permission prompt, so
  the ones that write (`obsidian_rename`, `obsidian_properties`) or change your
  window (`obsidian_open`) need your approval exactly like any file edit. The
  whole server can be turned off in settings; on Claude Code older than 2.1.210
  it is silently unavailable.
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
  context and anything Claude reads with your permission is sent to
  Anthropic's API by the CLI - identical to running Claude Code on any folder.
  Don't point it at a vault whose contents you may not send to Anthropic.
- **Defaults.** Out of the box the `!` shell escape and the `obsidian` MCP
  server are on, the permission mode is *Ask before acting*, and *Bypass
  permissions* is hidden until enabled in settings. *Auto-approve everything*
  is never selected out of the box, but it is not per-conversation only: it is
  one of the choices in the *Default permission mode* setting, so it can be
  made the persisted default that every new conversation starts in.

## Hardening choices in the code

- `child_process.spawn` with `shell: false` and array arguments wherever the
  platform allows - no shell string interpolation, no injection surface. The
  WSL CLI-detection probe (`wsl.exe -- sh -lc "command -v claude"`) uses a
  fixed command line with no interpolated input.
  Two places involve a shell:
  - On native Windows, npm installs the CLI as a `claude.cmd` batch shim,
    which Node refuses to spawn shell-less (its CVE-2024-27980 hardening) -
    that one launch goes through `cmd.exe`, with a command line the plugin
    builds entirely itself: the quoted shim path plus fixed flags, the
    configured model/effort and a session id. Nothing model-controlled is in
    it. The exact shape is asserted in `tests/protocol.test.mjs`.
  - The `!` shell escape, where the user's command is passed as a **single
    argv element** (`/bin/sh -c <command>`), never concatenated into a larger
    command line - so the shell sees exactly the text that was typed and
    nothing is re-parsed. Asserted in `tests/bash.test.mjs`.
- No `innerHTML` / `outerHTML` / `eval` / dynamic `Function`. Model output is
  rendered via Obsidian's `MarkdownRenderer`, which strips scripts and
  dangerous HTML; everything else enters the DOM as text nodes.
- **Path handling is validated, not trusted.** Exported note names are
  sanitized per path segment (traversal characters and `..` segments
  stripped) and always resolve under the configured folder; a note's stored
  export path is re-validated on every reuse. Conversation ids (which become
  history file names) are checked against the generated id shape before any
  read/write/delete, and each loaded record's id is pinned to its file name.
  This blocks a tampered or synced history/settings file from steering a
  write or delete outside the plugin's folders.
- Zero runtime npm dependencies. CI audits the tree that ships
  (`npm audit --omit=dev`); the full tree, dev dependencies included, was also
  clean at release time. A dev-only advisory affects the build, not the
  plugin you install, so it does not gate contributor pull requests.
- **Release workflow actions are pinned to commit SHAs**, not to mutable tags.
  `release.yml` runs with `contents: write` and produces the `main.js` users
  install, so a third party who moved a `v4` tag could otherwise have run code
  in that job. The trailing comment records which version each SHA was, and
  Dependabot proposes the bumps (`.github/dependabot.yml`) so a pin is only
  ever moved by a reviewed pull request, never silently.
- Tool inputs/results shown in the UI are length-capped before rendering.

## Residual considerations

- **Rendered links and images in model output.** Claude's replies are
  rendered as Markdown, and Obsidian auto-loads embedded images - so a reply
  containing `![](https://host/…)` fetches that URL when displayed, exactly
  as viewing any note would. Under prompt injection this is a possible
  data-exfiltration channel (encoding context into an image URL). It is
  inherent to rendering Markdown; if this matters for your threat model, run
  in *Plan* mode with untrusted inputs and review replies rather than relying
  on rendering to be inert. Following a link is always your click: vault
  links are opened only when they resolve to a file that already exists (a
  stray click can't create a note), and only `http(s)`, `mailto`, `obsidian`
  and `file` targets are handed to the OS handler - any other scheme is
  ignored.
- **Local data footprint.** History JSON stores full (untruncated) tool
  inputs and results even though the UI truncates them, and exported notes
  contain the whole conversation. This is intended - the history is the
  source of truth - but it means anything Claude saw is on disk in your
  vault/plugin folder.

## Reporting a vulnerability

Please open a GitHub security advisory (or a private report to the
maintainer) rather than a public issue. Include reproduction steps and the
plugin/Obsidian/Claude Code versions involved.

The full policy - supported versions, response expectations, and how a
confirmed issue gets published as an advisory - is in
[SECURITY.md](../SECURITY.md) at the repository root.
