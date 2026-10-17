# Development

## Prerequisites

- Node.js at the exact version in `.nvmrc` (`nvm use`); CI reads the same file
- npm
- GNU make and Python 3, for `make verify`
- Claude Code 2.x installed and logged in (for manual testing)

## Setup & build

```bash
npm ci
npm run dev     # esbuild watch mode → main.js with inline sourcemaps
npm run build   # tsc type-check + production build
npm run lint    # eslint + eslint-plugin-obsidianmd (the directory reviewer's own rules)
make verify     # the full CI gate: build, docs checks, whitespace, lint, tests
```

The build bundles `src/main.ts` into a single CommonJS `main.js`. Node
builtins, `obsidian`, and `electron` stay external; the only runtime
dependencies are the two Geist font packages, whose latin `.woff2` files esbuild
inlines as `data:` URLs and whose license texts the build writes into the
`main.js` header ([ADR-007](adr/ADR-007-runtime-dependencies.md) admits screened ones).

`tsc` only type-checks (`-noEmit`) - esbuild produces the bundle - so a
TypeScript version change cannot change the shipped output. Note that
`tsconfig.json` names `"types": ["node"]` explicitly: without that line every
`process` and `node:*` reference fails to resolve under a TypeScript that does
not include `@types/*` implicitly. `@types/node` deliberately tracks the major
that CI runs on (Node 22), not the newest published.

## Linting

`npm run lint` runs [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin-obsidianmd),
the same rule set the community-directory review runs against a submitted
release, so directory findings are reproducible locally and CI fails on a
regression. `eslint.config.mjs` ignores the build output, the bundled test
build, and `graphify-out/`.

The devDependency is pinned to `typescript@~6.0` **for the linter's sake**:
typescript-eslint supports TypeScript below 6.1, and its type-aware rules crash
under TypeScript 7 (`TypeError: Cannot read properties of undefined (reading
'Intrinsic')` inside `ts-api-utils`). Move to 6.1 or 7 when typescript-eslint's
`typescript` peer range admits it (`npm view typescript-eslint
peerDependencies`). Since `tsc` is only a type-checker here, this has no effect
on `main.js` - the released bundle still reproduces byte-for-byte.

`package.json` `overrides` pins `moment` to a patched release: the `obsidian`
typings package depends on an exact `moment` with an advisory. Only its types
are used - at runtime the plugin gets Obsidian's own `moment` - so the override
exists to keep the full-tree `npm audit` clean. Drop it once `obsidian` moves
past the affected range.

## Testing in a vault

Copy (or symlink) the plugin into a vault and enable it:

```bash
VAULT=/path/to/vault
mkdir -p "$VAULT/.obsidian/plugins/ai-agent-panel"
cp manifest.json main.js styles.css "$VAULT/.obsidian/plugins/ai-agent-panel/"
```

Reload Obsidian (Ctrl/Cmd-R) after each rebuild, or use the
[Hot Reload](https://github.com/pjeby/hot-reload) plugin during development.

## Automated tests

```bash
npm test
```

Plain Node (`node --test`), no framework. The `pretest` step esbuild-bundles the
Obsidian-free modules into `tests/.build/` and the specs import from there:

| spec | covers |
|---|---|
| `tests/diff.test.mjs` | `src/diff.ts` - line and word diffing, context collapsing, the size fallbacks |
| `tests/edits.test.mjs` | `src/edits.ts` - Edit/Write/MultiEdit projection, path resolution |
| `tests/edit-tracker.test.mjs` | `src/edit-tracker.ts` - pre-edit reads by tool-use id, which results reach the change list, each file's net change and counts, the re-read after a restore |
| `tests/bash.test.mjs` | `src/bash.ts` - shell invocation shape, capture, timeout, output caps, the text "Add output to chat" puts in the composer |
| `tests/tabs-layout.test.mjs` | `src/tabs-layout.ts` - the column's unset width, its drag range and half-panel cap, a stored width read back (180 px as unset) |
| `tests/conversation-list.test.mjs` | `src/conversation-list.ts` - the column's rows, sections, sort orders, date buckets, filter, empty-Recent text and unchanged-input key, the title a prompt gives, a branch's title and the title shown |
| `tests/history-core.test.mjs` | `src/history-core.ts` - the index merge at the end of a scan (newer or saved entries win, deleted ids drop) and the journal of saves and deletes made during it |
| `tests/history-file.test.mjs` | `src/history-file.ts` - a stored title or export path that is not a string reads as none; stored messages that are not objects are dropped and their fields of the wrong type read as empty or absent, a prompt's send time included |
| `tests/json.test.mjs` | `src/json.ts` - `isJsonObject` accepts objects and refuses `null`, arrays and primitives; `asJsonObject` returns an object itself and anything else as a fresh empty one |
| `tests/history-notice.test.mjs` | `src/history-notice.ts` - the once-per-conversation rule and the text of the save-failure Notice |
| `tests/mcp.test.mjs` | `src/mcp/server.ts` + `src/mcp/query.ts` + `src/mcp/replies.ts` + `src/mcp/paths.ts` - the handshake as a real CLI performs it, the search grammar and limit, the rename reply, the rename target (refusals, normal form) |
| `tests/protocol.test.mjs` | `src/protocol/client.ts` end to end against `tests/fake-cli.mjs`; the `turn` scenario's stream through `src/state/stream.ts`; the `steps` scenario's calls, subagents and background tasks through `src/state/stream.ts` and `src/state/step-groups.ts`; the `question` scenario's forms answered through `src/tab/permission-flow.ts`; the fake CLI's report replies through the report builders, its `/mcp` actions and its commands |
| `tests/commands.test.mjs` | `src/commands.ts` - panel command parsing, which messages are bare, each report built from captured CLI replies with its command's title, `/mcp` actions, `/status`'s "open /mcp", `/context`'s collapsed sections, report Markdown and its escaping (bars, badges, a failed card), the card header per state, the failure texts, folded tables and `/help`'s "Show all N", the slash list's groups and one description per panel command, `conversationCost` |
| `tests/usage-core.test.mjs` | `src/usage-core.ts` - usage request caching, the 10 s floor and the failure back-off, the one background timer, reply parsing (a fake clock stands in for time) |
| `tests/cli-args.test.mjs` | `src/cli-args.ts` - argument parsing, refused flags, Chrome/sandbox flags, the `.cmd` guard |
| `tests/cli.test.mjs` | `src/cli.ts` - `pickLookupResult`, the `which`/`where` output filter (the probing itself is untested); `configuredPathMissing` (relative paths from the vault, joined so a symlink precedes `..`, `.com`/`.exe` on Windows; empty path and bare command names are not checked) |
| `tests/models.test.mjs` | `src/models.ts` - parsing the CLI's model list, learned labels, the popover's models and effort levels, the effort table |
| `tests/settings-core.test.mjs` | `src/settings-core.ts` - profile migration and repair, synced vs device-local split, the defaults of the never-seeded settings (CLI profiles, security settings), the load validation of every setting, the permission decision order, the reopen mode and picks, stored command-line values and the 0.5.x model field, the profile pick, the mode table, the permission popover's modes, the prompt settings' defaults and load validation (an unknown stored style loading as Card, the stored color kept) and limits, the store write order and a setting moved between device-only and synced surviving a failed write |
| `tests/session.test.mjs` | `src/session.ts` against `tests/fake-cli.mjs` - launch options and leaving Bypass, with the restart after the turn; a restart waits for the old process to close (a fake CLI slow to stop), what is sent meanwhile reaches the replacement in order, and nothing the old process writes reaches the session, nor does an answer to one prompt drop another open under the same id, from its successor or from the same process; mode switches answered in order, and one sent before leaving Bypass; a refused model switch is not kept, and a switch is resent to a replaced process; how a turn's busy state ends; `onReached` once at the first `system/init`, and `onExitBeforeInit` with the exit code (the `exit127` scenario) and not after init |
| `tests/timers.test.mjs` | `src/timers.ts` - the deadline on a promise, with Node's fake timers; timers on the window they are given |
| `tests/save-queue.test.mjs` | `src/save-queue.ts` - saves one at a time, the queued one with the latest state |
| `tests/context-format.test.mjs` | `src/context-format.ts` - the context block and its omission, the 8000-character selection cut, the 40-entry lists with "… N more" (only the properties sent are formatted), property values, an attached item listed once, the message's label, the stored paths, `@` mentions |
| `tests/attachments.test.mjs` | `src/attachments.ts` - the image type, size and count rules, `composerFiles`, `collectImages`, the "Not attached:" Notice, what a send takes along (`planSend`) |
| `tests/restore.test.mjs` | `src/restore.ts` - which turns offer Restore files, when the button shows, which turn "Restore to before turn N" runs and when it shows or is disabled, the result Notice |
| `tests/inert-markdown.test.mjs` | `src/inert-markdown.ts` - the rendering boundary: code, fence and math cuts, images, raw HTML, line starts, the export form, the Templater and colon breaks, tool output fences, seeded property tests |
| `tests/transcript-markdown.test.mjs` | `src/transcript-markdown.ts` - the exported note as a whole: each message's form, each turn's own cost, the frontmatter, the Templater and colon breaks |
| `tests/tool-labels.test.mjs` | `src/tool-labels.ts` - tool display names, card summaries, vault-tool card titles (each vault tool has one), step-row icons, Glob, Grep and `obsidian_search` result counts, AskUserQuestion input parsing, ExitPlanMode's plan, the input preview |
| `tests/state-tab.test.mjs` | `src/state/tab.ts` - a tab's activity, a new tab's composer and status data, token totals per turn, the close-confirmation rule, the scroll position a switch keeps, whether the messages follow their end and which inputs scroll them up by hand; the messages model built from stored messages (prompt numbers, turns with their footers and costs, mid-turn prompts, report cards and `!` runs, a session's ending error), a `!` run's status, its sections, item updates and stored counts, when a reopen's first screen and its idle chunks end, when a reopen reuses the active tab; the background tasks and their labels |
| `tests/state-composer.test.mjs` | `src/state/composer.ts` - placeholders, Send and Stop per activity, what Escape does (nothing while a list or popover is open), the command font, a `/help` row's insert, the chips' order, labels and tooltips, the inline offer chip's rule, `fitChips` |
| `tests/state-status-line.test.mjs` | `src/state/status-line.ts` - segment order, strings, accessible labels and tooltips; the profile segment only with several profiles; the mode display rule; `fitStep`; the context segment, its hover card and popover; when plan usage is polled |
| `tests/state-popover.test.mjs` | `src/state/popover.ts` - every transition of the popover and hover-card machines and where focus goes; placement up and down from a trigger, and which way a hover card opens |
| `tests/state-usage-segment.test.mjs` | `src/state/usage-segment.ts` - the plan-usage segment's items, labels, tints and placeholders; its hover card; the popover's lines and failure text; the reset formats; the `/usage` and `/usage-credits` cards as reports, with their failure, stale and empty lines |
| `tests/state-tabs.test.mjs` | `src/state/tabs.ts` - tab order (pinned first, then drag order), a drop's new order, `dotState`, a tab's glyph and accessible label, the hover card's lines, elapsed times, the switcher's label, the open-tabs list's rows and the focus after a close, the title block |
| `tests/state-layout.test.mjs` | `src/state/layout.ts` - strip or column: 820 px, 780 px while shown, Top, Side, a panel not laid out |
| `tests/state-bar-clearance.test.mjs` | `src/state/bar-clearance.ts` - the part of a column Obsidian's status bar covers: overlap, no horizontal overlap, hidden or absent, partial, whole pixels |
| `tests/state-ticker.test.mjs` | `src/state/ticker.ts` - the 1 s ticker runs only while a subscriber is shown, on its window |
| `tests/state-stream.test.mjs` | `src/state/stream.ts` - text and thinking deltas, a delta before its block's start, finalized text, thinking timed and closed, tool calls, the turn's uuid from its first echo, the result and a session end finalizing open blocks, tool results with their text and images, subagent messages, background-task messages, other system messages |
| `tests/state-turn.test.mjs` | `src/state/turn.ts` - a turn opened by a prompt or by Claude's output, a prompt sent mid-turn starting a continuation, the footer at the end of the last continuation and its open tool-step groups closed, the branch note after the turn, report and `!` cards after it and their changes, block changes, a message added mid-turn closing the group it leaves, a card holding and releasing its call's row, the head and thinking labels, elapsed times, the copy text |
| `tests/state-step-groups.test.mjs` | `src/state/step-groups.ts` - every grouping clause: rows joining the open group, text, thinking, Task or Agent calls and the turn's end closing it, cards before and after their `tool_use`, answered, denied, withdrawn and ended; subagent threads, an agent row on its own, a subagent call's card; results, counts and images; agents ending, in the background, reported, rows and agents ended with the turn or the process; group headers, collapse, edit counts; the reopen rules |
| `tests/state-turn-cost.test.mjs` | `src/state/turn-cost.ts` - a turn's cost from the recorded session totals, a session's first turn, sessions apart, reopened and error turns adding up to the conversation's cost, records without a session id, a lower total, the footer's figures, the tokens and their hover rows |
| `tests/state-prompts.test.mjs` | `src/state/prompts.ts` - the prompt count, without panel commands and `!` runs; a turn's prompt number; rail tick labels, positions and the 1 px write rule; the send time shown; the context label; the empty conversation's starters |
| `tests/state-permission.test.mjs` | `src/state/permission.ts` - a card's title, description, summary, plan, Full input and Always allow; each answer and its label, answered once; the answering state while the pre-edit read is pending; withdrawn and ended cards and forms; the form's title, count, Submit, single- and multi-select answers, Dismiss; the call a card names, and whether it runs once settled |
| `tests/tab-recorder.test.mjs` | `src/tab/recorder.ts` - a prompt recorded with its send time, the title the first prompt gives, a conversation created before its first message, a record changed in place saved again |
| `tests/tab-permission-flow.test.mjs` | `src/tab/permission-flow.ts` against a fake tab and fake reads - the decision for each mode and flag, Auto-approve's wait for the pre-edit read and its deadline, the form in every mode, the card's diff, a withdrawn request, the process ending, a card answered twice, a request id waiting twice (the waiting card cancelled, or the cardless Auto-approve edit denied) or reused once answered, an answer given before a redraw that throws, a card that cannot be built or drawn, a drawing failure reported for a settled or earlier card, a cardless Auto-approve edit withdrawn or ended while its read hangs |
| `tests/tab-panel-commands.test.mjs` | `src/tab/panel-commands.ts` - a card recorded with its command and its text following the card (a closed tab, a reply recorded meanwhile, the reopen), none mid-turn, Try again's arguments, `/mcp` argument errors and row-action failures, "open /mcp" during a restore |
| `tests/tab-shell-escape.test.mjs` | `src/tab/shell-escape.ts` - which texts run, a run's card running then ended, its record, "Add output to chat" |
| `tests/state-theme.test.mjs` | `src/state/theme.ts` - the mode each Theme choice gives under each host mode; a root classed at attach inside the fence; `css-change` read from the main window only; `settings` re-classing every root; roots that follow Obsidian's mode; no write when the mode is unchanged; shared attaches, detach, a second load and unload; the prompt class and Custom property on attach, on `settings` and on a released root; settings rows released on redraw; the scope loaded before any view; the Theme labels and the panel menu's items |
| `tests/state-settings-rows.test.mjs` | `src/state/settings-rows.ts` - each row's search text (the value as shown, a picker's cards, Clear's aliases outline, quiet and none), whether it differs from its default and the default as shown; the identity rows, the headings and Custom color never modified; a second profile reading its own settings |
| `tests/state-settings-filter.test.mjs` | `src/state/settings-filter.ts` - the query (trimmed, case-insensitive), Modified, both together, match ranges, rows and sections shown, empty sections and profiles, the total independent of the filters, `keep`, the filter line's wording |
| `tests/state-cli-missing.test.mjs` | `src/state/cli-missing.ts` - the per-run missing state keyed by path, WSL and revision (an edit drops it, a stale result is dropped), the page checks (disk check, native auto-detect once per configuration, no WSL probe, no Windows verdict on a native miss), a failed search marking only an empty path (a configured native path is judged by its own check), a later observation winning over an earlier search, the start reports, the banner, notice and start-message texts |
| `tests/state-settings-reset.test.mjs` | `src/state/settings-reset.ts` - plans per scope and option, each section's Reset N count (hidden rows included), stores, turns-on marks, shown values, patches (paired keys, profile fields), the dialog and notice wording, a stale plan, Undo (per-value guards, sync choices, removed profile, failed saves) |
| `tests/state-section-spy.test.mjs` | `src/state/section-spy.ts` - the current section at the top, in the middle, after a jump (1 px tolerance) and at the scroller's end; one, no and short-page sections; a jump's target under the bar and its clamping |
| `tests/state-prompt-color.test.mjs` | `src/state/prompt-color.ts` - the ten colors, their order, labels and classes (none for Mist); `acceptCustomColor`'s length, character set, function list, `var`/`env`/`attr`, `currentColor` and CSS-wide keyword refusals with their reasons; the Custom field's problem and message (a blank field, a stored refused value, the kept or default consequence) and the picker's hex; the selection a stored color and Custom value give, the default color for none |
| `tests/architecture.test.mjs` | Module boundaries over esbuild's metafile and TypeScript's checker: ADR-016's U-rules, DES-001's A-rules, DES-003's P-rules, DES-007's G1 and G2, with no named exception |
| `tests/styles.test.mjs` | The whole of `styles.css`: the token block and the two palettes first, ADR-017's selector, color and token rules, each palette's exact tokens and value types (colors, shadow lists, the border, the blend mode) and the re-declaration contract exactly (`tests/fixtures/redeclared.json`), the accent's sources, every token read declared in the token block or both palettes, an acyclic `var()` graph, `PROMPT_SELECTION` (one exact rule per color but Mist) and the Custom property's two readers, no legacy tail |
| `tests/palette.test.mjs` | Both palettes in `styles.css`: WCAG contrast of every pair the panel draws, text at 4.5:1 and the focus ring at 3:1, with no exempt pair, and each prompt color's text on fill, "You" and number-box outline (PRD-001.R28, R33, R34) |
| `tests/tooltips.test.mjs` | Every `src` file's `aria-label`s and tooltip calls against a list of icon-only call sites and the three tooltips a requirement names, and `styles.css`'s `--no-tooltip` rules and the "Show tooltips" token (DES-003 Popovers, hover cards and tooltips); planted sources each scan must catch |

`tests/fake-cli.mjs` is a stand-in for the `claude` binary that speaks just
enough of the stream-JSON protocol to exercise the client - spawn flags, NDJSON
framing across chunk boundaries, the `initialize` handshake, permission
allow/deny/cancel, a subagent's request flagged by a rule
(`permission-flagged`), by an ask rule beside the tool's own reason
(`permission-ask-rule`), by a safety check inside a compound command
(`permission-safety-check`) or one the classifier may approve
(`permission-classifier-approvable`), by an organization's MCP ask ceiling
(`permission-org-ceiling`), with mistyped flags (`permission-bad-reason`), a
mistyped tool name (`permission-bad-tool-name`) or null flags
(`permission-null-reason`), an unflagged one
(`permission-unflagged`), AskUserQuestion forms (`question`), a slow `set_permission_mode`
(`FAKE_CLI_MODE_DELAY_MS`) that can refuse one mode (`FAKE_CLI_REFUSE_MODE`),
a refused `set_model` (`FAKE_CLI_REFUSE_MODEL`), an `interrupt` that withdraws
the waiting permission requests and ends a running turn with a `result`, a
message sent mid-turn queued and run as the next turn (its probe says
`queued: true`), refusals with no text (the
`bare-error` scenario), output lines the client must skip (the `noise`
scenario), a 3 MB line (`bigline`), `mcp_message` routing, `rewind_files`
and turns that edit files it can rewind (the `rewind` scenario), a streamed turn of thinking and text deltas, a tool call and a `result` with token usage (`turn`, shaped from the panel's parsing rather than captured from a real CLI), tool calls, an edit, a subagent's thread and background tasks with `stop_task` (`steps`, shaped the same way), `get_usage` and, once a turn has finished,
`get_context_usage` replies (both refused with `FAKE_CLI_REFUSE_USAGE`),
replies to the panel's report requests (`get_status`, `get_memory_dialog`,
`get_hooks_listing`, `list_permission_rules`, `get_skills_dialog`,
`get_chrome_dialog`, `get_sandbox_dialog`, `get_session_cost`, `mcp_status`,
`mcp_toggle`, `mcp_reconnect`; all refused with `FAKE_CLI_REFUSE_REPORTS`),
trimmed from Claude Code 2.1.292's, a command list in the `initialize` reply,
unsupported control requests, a crash with stderr, a
process slow to stop (`FAKE_CLI_SIGTERM_DELAY_MS`: SIGTERM ends it only after
the delay) that can write a turn's messages and requests while it stops
(`FAKE_CLI_TALK_ON_SIGTERM`), a child holding its stdout open so the close
comes late (`FAKE_CLI_HOLD_STDOUT_MS`), a late handshake reply
(`FAKE_CLI_INIT_DELAY_MS`), and a permission prompt and vault-tool call with
no turn running (`background-permission`), with a second prompt under the
first one's id (`FAKE_CLI_DUPLICATE_PROMPT`). It reports
the checkpointing variables it was started with. It
needs no login and makes no network calls. Pick a scenario with the
`FAKE_CLI_SCENARIO` environment variable; it reports what it saw as
`system/probe` messages so a test can assert on the client's own side of the
conversation.

Anything that imports `obsidian` is not unit-tested - test those in a vault.

## Running the panel against the fake CLI

The manual rows of DES-003's verification matrix run against
`tests/fake-cli.mjs` instead of a real CLI, so they need no login and spend
no tokens. The CLI inherits Obsidian's environment, so the scenario is set
in it before Obsidian starts; quit Obsidian first, since a running instance
takes the launch without the variable. Without it the scenario is `basic`.

Windows, native (Node on the Windows `PATH`):

1. Create `fake-claude.cmd` anywhere, holding one line with the repository's
   absolute path: `@node "C:\path\to\obsidian-ai-agent-panel\tests\fake-cli.mjs" %*`.
2. In the plugin settings, set a CLI profile's path to that `.cmd` file,
   with "Run via WSL" off. The panel runs a `.cmd` through `cmd.exe` and
   refuses an argument holding `"`, `%`, `!`, `&`, `|`, `<`, `>` or `^`, so
   keep the profile's additional arguments free of them.
3. From PowerShell: `$env:FAKE_CLI_SCENARIO = "permission"; & "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe"`
   (Obsidian's default per-user install path).

Linux and macOS:

1. Set a CLI profile's path to the absolute path of `tests/fake-cli.mjs`
   (executable, with a `node` shebang).
2. Start Obsidian with the scenario: `FAKE_CLI_SCENARIO=permission obsidian`
   on Linux,
   `FAKE_CLI_SCENARIO=permission /Applications/Obsidian.app/Contents/MacOS/Obsidian`
   on macOS.

What the scenarios do in the panel: `basic` answers each message with
`echo: <text>` (the text includes the context block while a context chip is
on). `permission` announces an Edit of `note.md`, asks for it, and once the card
is answered reports a result (a failure when denied) without changing the
file, then ends the turn; a message sent meanwhile is queued and runs as the
next turn. Stop or Esc during the wait withdraws the card ("Cancelled") and ends
the turn. `rewind` takes 2 s a turn and writes `Fake CLI note.md` in the
vault (put there first as an existing note when missing) and creates
`Fake CLI new note.md` when missing, so the changes chip, the changed-files
popover, Restore files and "Restore to before turn N" show; its restores
put those files back as they were before the turn, and a CLI started since
answers that the restore point is gone. `turn` streams each turn over about
4 s: a thinking block, a Markdown reply with a list, a table and a code
fence, a Read call, then a short reply, ending at $0.0123 more each turn
with token usage; a message containing "error" ends in an error result
instead. `question` asks two questions, one single-select and one
multi-select, then, once they are answered, one more, and replies with the
answers; a message containing "exit" makes the CLI exit with code 3 a second
after the first form shows. `steps` takes about 3 s a turn: a reply, a
group of Glob, Grep, `obsidian_search` (counts 3, 2 and 4) and a failing
Read, a reply, an Edit that changes `Fake CLI steps note.md` in the vault
(put there first when missing), a Task whose agent row opens to its replies
and two steps, then a background agent and a background `sleep 12`, both in
the run bar. After the turn the background agent adds a step a second to
its thread for three seconds and then reports its totals; the shell ends
after 12 s; Stop ends either at once. Once a message has run, plan usage
reads `5h 42%` and an orange `Sonnet 81%`, and the context segment shows
32%, 20 points more per turn, orange from the fourth. With
`FAKE_CLI_REFUSE_USAGE=1` set the same way as the scenario, both lookups
fail. In every scenario the panel commands answer: `/mcp` lists five servers,
one of each status and the panel's own, whose Reconnect, Disable and Enable
change the list; `/status`, `/memory`, `/hooks`, `/permissions`, `/skills`,
`/chrome`, `/sandbox` and `/cost` show short replies; `/context` needs a
finished turn first. The slash list and `/help` show six Claude Code
commands, `context` among them. With `FAKE_CLI_REFUSE_REPORTS=1` every
report request is refused, for the failed cards.

## Testing the protocol client against the real CLI

`src/protocol/client.ts` has no Obsidian imports, so it can also be pointed at a
real CLI:

```bash
npx esbuild src/protocol/client.ts --bundle --platform=node --format=esm \
    --outfile=/tmp/client.mjs
```

Then import `ClaudeClient` from that bundle in a scratch script. This is the
quickest way to exercise the protocol end to end: init handshake, streamed text
deltas, permission allow (file created), permission deny (file not created), and
multi-turn memory within one process. Note that anything driving a real turn
spends real tokens.

## Release process

1. Title the *Unreleased* section of `RELEASE_NOTES.md` with the version
   about to be cut, and commit it - `npm version` refuses a dirty tree, so the
   notes have to land first, and this way the tagged commit carries its own.
2. `npm version <patch|minor|major>` - the `version` script syncs
   `manifest.json` and `versions.json`, commits, and creates the bare tag.
3. Push: `git push && git push --tags`.
4. The `release.yml` workflow builds and attaches `main.js`, `manifest.json`,
   and `styles.css` to a draft GitHub release - review and publish it. It also
   attests `main.js` and `styles.css` with `actions/attest-build-provenance`,
   so each asset carries a signed statement of the run that built it; the
   verify command is in the [README](../../README.md).

While change 001 (the panel redesign) is being built, no release is cut
from `main` ([ADR-016](adr/ADR-016-panel-ui-architecture.md)). A hotfix
branches from the last tag: fix it there, run steps 1 to 4 on that branch,
then cherry-pick the fix to `main`, resolving the `manifest.json`,
`versions.json` and `RELEASE_NOTES.md` conflicts by keeping `main`'s
*Unreleased* notes and the new version.

For Obsidian community-plugin submission requirements, see the
[developer docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## Knowledge graph (graphify)

The graphify skill is checked in under `.claude/skills/graphify/`, so any agent
working in this repo picks it up without a separate install. It builds a
queryable graph of the codebase:

```sh
graphify .                      # full build - writes graphify-out/
graphify update .               # incremental refresh after code changes (AST only, no API calls)
graphify query "<question>"     # scoped subgraph instead of grepping the tree
```

`graphify-out/` is generated and gitignored - build it locally rather than
expecting it in a clone. `.gitattributes` declares a `merge=graphify` driver
for `graphify-out/graph.json`, which only matters if that directory is ever
tracked. Nothing needs configuring to work on this repo: the driver is not
defined in any shipped config, and git falls back to its normal merge when an
attribute names a driver the clone does not have.

## Conventions

- Tabs for indentation (Obsidian sample-plugin convention).
- All DOM text via Obsidian helpers (`createEl`, `setText`) - never `innerHTML`.
- Colors and spacing in `styles.css` come from `--ai-agent-panel-*` tokens; Obsidian variables only as [ADR-017](adr/ADR-017-panel-css-and-forced-theme.md) lists.
