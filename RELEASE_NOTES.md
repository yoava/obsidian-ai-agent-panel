# Release notes

## Unreleased

**The panel is redrawn, `/clear` keeps your conversation on screen, and
Claude Code's status commands are answered without spending tokens.** The
panel draws in its own light and dark palettes, prompts and turns are easier
to follow and to get back to, settings sit on one page, and a round of
security hardening limits what a synced or edited file can make the panel do.
It is 1.0 because the redesign is complete: the panel, its settings page and
its conversation format are the base for what comes next. The release carries
everything since 0.4.0, the last published version; a device that ran an
unpublished 0.5.0 build updates the same way.

### What's new

- **Read and get around a long conversation.** Each prompt shows its send
  time and context, numbered as a card or shown as a bubble, in a prompt color
  you pick (Sand by default). The prompt of the turn you are reading stays
  pinned at the top, a rail beside the messages has a tick per prompt, and a
  long conversation reopens at once, last screen first. Rename a conversation
  from its tab or row.
- **See what Claude is doing.** A turn reads *Working*, *Writing* or *Waiting
  for you* with its time; a working line stays at the end while Claude works;
  thinking sits behind a toggle; replies stream as formatted Markdown.
  Consecutive tool calls form one card of steps, each opening to its input,
  result or diff; subagents are rows that open to their own replies; background
  tasks are listed with Stop. MCP tools are named readably and images a tool
  returns are shown. A finished turn's footer holds *Restore files*, *Branch*,
  copy, duration and the turn's own cost.
- **`/clear` clears Claude's context and keeps your conversation.** A
  "Context cleared" divider marks the point; the messages above stay, dimmed
  and folded when long. *Undo* on the divider brings the cleared session back
  until you send another message; the permission mode and model the clear
  dropped are set again. A `/clear` typed during a turn waits for the turn,
  and one with agents running asks before stopping them. Compaction shows
  the same way, as a divider with the token counts and a *Summary* button.
- **Claude Code's info commands, answered in the panel.** `/context`, `/mcp`,
  `/status`, `/memory`, `/hooks`, `/permissions`, `/skills`, `/chrome`,
  `/sandbox`, `/cost` and `/help` render as cards with no turn and no tokens.
  `/mcp` can reconnect, enable and disable servers. `/` autocomplete says what
  each command does.
- **One status line under the composer.** Model, effort, permissions, profile,
  the context meter and plan usage share one line; each opens a popover. The
  context segment counts down the prompt cache's estimated time left, offers
  *Compact* and tints while Claude compacts; plan usage lists every limit
  with its reset time.
- **Tabs drawn as Obsidian tabs**, with a hover card per tab, a list of every
  open conversation when they no longer fit, equal widths, and a conversation
  column on wide panels (automatic by width on new installs).
- **A new look.** The panel, its popovers and dialogs draw in their own light
  and dark palettes with your Obsidian accent, set in Geist and Geist Mono
  (bundled, about 70 KB, no download). *Theme* is *Auto*, *Light* or *Dark*;
  Obsidian's own menus, notices and settings window keep Obsidian's look.
  Light-mode text meets 4.5:1 contrast. The panel works down to a 300 px
  pane. A changes chip, `N files +x -y`, opens
  the files the conversation changed.
- **Settings on one page.** Sections under a bar of links, a search field, a
  *Modified* filter showing each changed setting with its default, and reset
  per setting, per section or for everything, with Undo. Tab placement is
  picked from picture cards. CLI profiles are
  stacked with their own *Run via WSL*, path, *Claude in Chrome*, *Sandbox*,
  extra arguments and *Use for new conversations*; a profile whose Claude Code
  is not found is flagged with *Fix it*.
- **Claude in Chrome, the sandbox and your own CLI arguments, per profile.**
  Turn Claude Code's browser integration on for a
  profile, switch its Bash sandbox on or off (macOS, Linux and WSL2), and add
  arguments such as `--add-dir`; flags the panel sets itself are refused with
  a reason. Changes reach open conversations when you close settings.
- **Smaller things you will notice.** The prompt box grows with its text;
  images open large in a viewer with Left and Right between a message's
  images; a selection sent with a message names its note and line range, and
  the note chip reads "N lines selected"; a new conversation offers starters
  (*Summarize*, *Find notes that should link here*, *Draft a follow-up from
  the selection*); commands to bind to keys: *Focus prompt box*, *Stop
  Claude's turn*, *Next* and *Previous conversation tab*; a *Show tooltips*
  setting; *GitHub Sponsors* and *Buy Me a Coffee* at the foot of settings.

### Improvements and fixes

- **Security: what a synced or edited file may do.** The default permission
  mode, Bypass, vault instructions, the `!` shell escape and the vault tools
  are now per device, so a synced settings file cannot switch them on, start
  conversations in Bypass, add CLI profiles or fill the model picker. Stored
  conversation files are checked field by field: ids, models, efforts,
  profiles, paths and times that could act as flags or point outside the
  vault are ignored, and a conversation resumes only a session this device
  recorded. Nothing to do; a value that fails a check is dropped.
- **Security: permissions.** Auto-approve shows a card for every request
  Claude Code meant you to see: escalated by your rules or hooks, flagged by
  its safety checks, an MCP tool set to always ask, or a command asking to run
  outside the sandbox (also from a CLI that sends no reason fields). The
  permission control shows the mode Claude Code reports.
- **Security: rendering and export.** Replies, thinking and exports can no
  longer run other plugins' code (`dataviewjs`, inline `$=`, Templater `<%`,
  Dataview `::`) or load remote images, percent-encoded addresses included;
  raw HTML shows as text; links open
  only for `http`, `https`, `mailto` and `obsidian`; a stored context path
  that is no vault path is left out of exported notes.
- **Security: vault tools and launch.** `obsidian_rename` refuses targets
  outside the vault, in the configuration folder, hidden (`.claude/`,
  `.mcp.json`), shaped like a Windows short name (`MCP~1.JSO`) or holding a
  character Obsidian forbids (`* " < > : | ?`). A `claude.cmd` path cmd.exe
  would misread is refused and always quoted; a WSL path and `!` command no
  longer pass through the distro's default shell, so `$(...)` and `'$HOME'`
  behave as in a terminal.
- **Conversation and history.** Branch starts at the chosen turn, leaves
  the source's cost out and is disabled on turns a compaction summarized
  away; a reopened conversation keeps its model, effort,
  profile and cost; `/compact` and other slash commands are sent as typed; a
  model change or a manual `/compact` no longer counts as your message; a
  model Claude Code refused stays refused; a permission card no longer
  outlives a restart; conversation files that cannot be read or saved say so,
  and a malformed entry is skipped; titles, pins and deletes behave.
- **Edits and restores.** *Restore files* uses Claude Code's own
  checkpoints after listing the files it would change. Edit cards place a
  reported path as spelled, keep vault bounds after `..`, follow subagent
  edits and, on macOS, compare the vault root in NFC, so an accented vault
  path no longer puts every edit outside the vault. Diffs
  show three lines of context with folded gaps that open in place, draw in
  batches, and "Review changes" opens at once however many files changed.
- **Panel and settings.** Settings of the wrong type load as defaults; a
  setting switched between device-only and synced is kept even when saving
  fails; the first device to update from an older version keeps its security
  settings;
  the composer, cards and question forms are reachable by keyboard; the
  commands list stays open; `/usage` runs the exact command and is saved in
  order; closed tabs release their embeds; one usage timer serves every
  panel; only PNG, JPEG, GIF and WebP attach, and other files are named.
- **Vault tools.** `obsidian_search` takes `limit` as a whole number from 1
  to 200; `obsidian_active` finds the editor you last focused; a vault-tool
  card names the note it acts on; a rename's reply no longer claims to have
  updated links (Obsidian does, as your link-update setting directs).

### Upgrade notes

- **Update every device.** The `!` shell escape, the vault tools, the
  default permission mode and the vault instructions move out of the synced
  settings file to each device. The first device to update keeps its own
  values (`!` and the vault tools stay off if they were, instructions carry
  over, Plan or Claude Code default stays). A device that updates after
  another gets `!` and the vault tools off and needs its default mode and
  instructions set again. A device still on the old version after another
  has updated runs with `!` and the vault tools on and no instructions until
  it updates.
- **CLI profiles are device-only again.** A device with none of its own
  starts with one auto-detect profile; add yours again.
- **Restore before you update if you still need it.** *Restore files* now
  uses Claude Code's checkpoints under `~/.claude/file-history/`; turns from
  before the update offer no restore, and the panel deletes its old copies
  folder.
- **Sessions resume only where this device ran them.** A conversation copied
  or synced from another machine opens with all its messages, starts a fresh
  session on its next message, and has *Branch* disabled.
- **Conversations with a clear or a fresh start need this release**; an
  older version leaves them out of its list. A conversation saved in Auto-approve asks
  before reopening in it.
- **Codex is not in this release.** The panel drives Claude Code only; a
  second agent is planned for a later release.

### Known issues

- **A message sent while Claude works can be lost when a setting change or a
  new effort restarts Claude Code at the end of that turn** (as before): it
  shows as sent but never runs. Wait for the turn to end before changing
  launch settings or effort.
- **Under a WSL profile, edit cards and the change list treat vault files as
  outside the vault**, since the CLI reports `/mnt/<drive>/...` paths. The
  edits themselves are fine; use a native Linux or Windows profile for the
  vault-relative view.
- **A folder symlinked or junctioned into the vault counts as inside it**
  for edit previews and `obsidian_rename`, since bounds are checked by path
  spelling. Read the card's path before approving a write into such a folder.
- **On native Windows, a `!` command containing `"` may be cut short** by
  `cmd.exe`'s quoting. Avoid double quotes there, or run `!` through a WSL
  profile.
- **On a case-insensitive file system, `obsidian_rename` can overwrite a note
  whose name differs only by case.** Pick a distinct name when a card shows
  one.

### For contributors

- **`make verify`** is the one local and CI gate, with Node pinned in
  `.nvmrc`; ESLint warnings fail it, and the release workflow runs it before
  attesting.
- **`AGENTS.md`** is the contributor guide (it names the one shell launch,
  the `claude.cmd` shim, bounded in `docs/current/SECURITY.md`); governing
  docs live under `docs/current/`, records under `docs/records/`, and
  numbered docs start with their ID. The repository records Agentic SDLC
  scaffold 2.4.0, and edits outside the repository ask in Claude Code.
- **Dependabot** opens one pull request per runtime package update, so each
  passes the dependency screen.
- **README and listing:** the README is written as the directory page, with
  two screenshots of a fixture conversation under `docs/images/`; the
  manifest's description names the permission card, the vault tools and the
  user's own CLI login.
- **TypeScript 6.0**, `moment` pinned to 2.31 through `overrides` (dev
  only), in-range ESLint and typescript-eslint updates.
- **Records for this release:** the owner's real-CLI run of `/clear` and
  Undo on native Linux and WSL (task 110), the cross-review's design
  corrections, and the comparison's download counts from 2026-10-17.

## 0.4.0

Opus 5.5 support, and one less thing that waits on a plugin release.

- **Opus 5.5 and Fable 5.1 by name from the first run.** The model picker
  already takes its entries and labels from your CLI, so Opus 5.5 appeared on
  its own once a session had started; the labels shown before that first
  session now name the current versions too. Verified against Claude Code
  2.1.282.
- **Effort levels come from your CLI too.** The effort menu and the default
  effort setting offer every level the CLI reports for your models, so a level
  a future Claude Code adds shows up without a plugin update.

### Development

- **Build tooling updated** to ESLint 10 and the latest in-range dev
  dependencies. TypeScript stays on 5.9: typescript-eslint does not support
  TypeScript 7, and on 6.0 its type-aware rules report false errors.

## 0.3.4

The community-directory review pass. No features change; what changes is that
the plugin now says truthfully what it needs, proves where its release assets
came from, and stops a few things that were wrong but silent.

- **Obsidian 1.8.7 is now the minimum.** The panel has been calling
  `app.loadLocalStorage` / `app.saveLocalStorage` (1.8.7),
  `workspace.revealLeaf` (1.7.2) and `fileManager.trashFile` (1.6.6) while
  declaring 1.5.0, so on an older Obsidian those calls were simply missing.
  The declaration now matches what the code actually needs. The APIs
  themselves stay: `loadLocalStorage`/`saveLocalStorage` are what Obsidian's
  guidelines ask for over raw `localStorage`, and `trashFile` is what honours
  your vault's "deleted files" setting. The plugin is desktop-only and needs
  the Claude Code CLI installed anyway, so this is not a meaningful extra
  requirement.
- **Release assets are attested.** `main.js` and `styles.css` now ship with a
  signed build-provenance attestation, so you can check that the file you
  installed came from this repository's release workflow:
  `gh attestation verify main.js --repo yoava/obsidian-ai-agent-panel`.
- **Timers are scoped to the window that scheduled them**, as Obsidian asks, so
  a debounced save or a process kill-timer belonging to a popout window stops
  when that window closes instead of firing into a closed document.
- **The plugin's settings are in Obsidian's settings search.** On Obsidian 1.13
  and later the tab is built from the declarative settings API
  (`getSettingDefinitions()`), so searching *Settings* for "usage", "WSL" or
  "transcript" finds these rows instead of only the app's own. The tab looks and
  behaves exactly as before; older Obsidian releases keep the imperative
  rendering, and both are generated from one description of the tab, so they
  cannot drift apart.
- **The stylesheet stops reaching outside the plugin.** The rule that hides
  elements was a bare `.is-hidden { display: none !important }`, which applied
  to *any* element in the app carrying that state class, not only this
  plugin's - and `!important` meant a theme or snippet could not undo it. It is
  now a prefixed class winning on specificity alone.
- **A plain underline stands in** where a renderer does not take the
  `text-decoration: underline dotted` shorthand, so the transcript and changed-
  file links keep their underline either way.
- **The usage sliders lost their hover tooltip** - Obsidian now shows a slider's
  value inline, next to the slider, all the time.
- **UI text follows Obsidian's sentence case.** The diff's *Rendered* toggle,
  and the *Default*, *Auto-detect* and vault-instructions placeholders in
  settings, are capitalized the way the rest of Obsidian's interface is. Names
  and literal values are deliberately left alone - "AI Agent Panel", "Claude
  Code CLI", "Run via WSL", and the placeholders that repeat a setting's real
  default (`5m`, `YYYY-MM-DD`, `Agent Chats`) would all be wrong in sentence
  case; the exceptions are listed in `eslint.config.mjs`.
- **A permission card can no longer be titled `[object Object]`.** A
  `can_use_tool` request whose `tool_name` is not a string is now labelled
  *unknown* rather than stringified into the card's title.
- **What the plugin can do, stated up front.** `README.md` and
  `docs/current/SECURITY.md` now open with the four capabilities a plugin review flags
  in this one - it starts a process, reads a few paths outside the vault to find
  the CLI, lists the vault's files, and writes to the clipboard - each with the
  reason it is there and where it stops, plus the four things the plugin does
  not do. One of them is narrower than it looked: the clipboard is only ever
  written, never read.

### Development

- **The directory reviewer's linter now runs here.** `npm run lint` runs
  `eslint-plugin-obsidianmd` - the same rule set the Obsidian community-plugin
  review applies to a submitted release - and CI runs it on every push and pull
  request, so a finding cannot regress silently.
- **An in-process MCP callback keeps its receiver.** The protocol client called
  the registered handler through a local variable, so a callback written as a
  class method would have run with no `this`. Nothing in the plugin was written
  that way, so no behaviour changes today.
- **Frontmatter reads no longer widen to `any`.** Obsidian types a note's
  frontmatter as an untyped bag, so the vault tools' tag and property handling
  was unchecked at compile time; it is `unknown` at the boundary now and
  validated where it is used. Behaviour is unchanged - the runtime checks were
  already there.
- **Dead type-level code removed**: four type assertions that asserted nothing
  and three unused imports/constants.
- **File/folder handling narrows with `instanceof`** in the `@`-mention
  suggester and the context chips, instead of asserting "not a folder, so a
  file". Obsidian has more than two kinds of `TAbstractFile`, so the assertion
  was an assumption; now it is a check.
- **Device-local storage reads are typed `unknown`.** Obsidian declares
  `loadLocalStorage` as returning `any`, so a stale or hand-edited value used
  to enter the plugin unchecked. `src/local-store.ts` narrows the type at the
  boundary, which makes the compiler insist every caller validates what it
  read.
- **Two lint warnings are deliberately accepted.** `PluginSettingTab.display()`
  is deprecated as of Obsidian 1.13, and the settings tab still calls it - as
  the documented fallback for the 1.8.7-to-1.12 range this plugin still
  supports. Obsidian's own typings say to keep `display()` for exactly that,
  and `obsidianmd/settings-tab/require-display` requires it while
  `minAppVersion` is below 1.13.0. The warnings go away if and when the floor
  moves to 1.13.
- **One fewer build dependency.** `builtin-modules` is replaced by Node's own
  `import { builtinModules } from "node:module"`. The built `main.js` is
  byte-identical either way, verified before and after.
- **TypeScript moved to 5.9** for the linter's benefit: typescript-eslint's
  type-aware rules crash under TypeScript 7. `tsc` only type-checks here
  (esbuild does the bundling), so the shipped `main.js` is unaffected and still
  reproduces byte-for-byte.

## 0.3.3

- **Optional funding link.** `manifest.json` now carries a `fundingUrl`, so
  Obsidian shows a heart next to the plugin in the plugin list, and the
  repository has a sponsor button. The plugin stays free and MIT-licensed, no
  feature is gated behind it, and the link costs nothing at runtime - Obsidian
  renders it, and nothing is fetched unless you click it.
- **Author link.** `manifest.json` also carries an `authorUrl`, so the author
  name in the plugin list links to the maintainer's GitHub profile.

Nothing else changed: the plugin code is identical to 0.3.2, and `main.js` and
`styles.css` are byte-for-byte the files that release shipped.

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
or sharing a vault. See [SECURITY.md](docs/current/SECURITY.md) for the full model and
[LEGAL.md](docs/current/LEGAL.md) for licensing and trademark detail.
