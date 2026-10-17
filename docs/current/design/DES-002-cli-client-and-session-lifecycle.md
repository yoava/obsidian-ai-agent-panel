# DES-002 — CLI client and session lifecycle

**Status:** accepted (2026-10-16)

## Requirements

From [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md):

| Requirement | What this design carries |
| --- | --- |
| PRD-001.R2 | CLI detection |
| PRD-001.R3 | CLI profiles |
| PRD-001.R39 | The Claude Code section's profile rows and the missing-CLI state |
| PRD-001.R4 | Per-profile launch options, argument parsing and refusals, restart on settings close |
| PRD-001.R5 | One CLI process per conversation: lazy spawn, launch shapes, environment, shutdown |
| PRD-001.R6 | CLI failures and recovery |
| PRD-001.R25 | Which settings reach open conversations, through the restart on settings close |
| PRD-001.R26 | Launch shape per platform |
| PRD-001.R11, PRD-001.R18, PRD-001.R20, PRD-001.R21, PRD-001.R22, PRD-001.R23 | Protocol side only: `interrupt`, `stop_task`, the read-only control requests, `set_model`, respawn for effort. UI side in [DES-003](DES-003-panel-ui.md) |

It is also the transport for [PRD-002](../../current/product/PRD-002-permissions-and-change-control.md) (`can_use_tool`, `set_permission_mode`, `rewind_files`, fork and rewind; [DES-004](../../current/design/DES-004-permission-and-change-control.md)), [PRD-004](../../current/product/PRD-004-vault-tools.md) (`mcp_message`, the missing-server warning; [DES-006](../../current/design/DES-006-vault-tools.md)) and [PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md) (`get_usage`, `get_context_usage`; [DES-007](../../current/design/DES-007-usage-and-cost.md)).

Manual verification obligations: detection and a first turn on each launch shape (native executable, npm `.cmd` shim, WSL, macOS, Linux); crash and resume; effort respawn; restart on settings close; profile switch; that stopping the cmd.exe and `wsl.exe` wrappers ends the CLI behind them.

## Context and constraints

- Fixed by [ADR-001](../../current/adr/ADR-001-drive-the-installed-cli-over-stream-json.md) (the installed CLI over stream-JSON, one process per conversation, an original client) and [ADR-008](../../current/adr/ADR-008-windows-and-wsl-launch-and-cli-profiles.md) (three launch shapes decided in one function, detection, profiles). [ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md) adds the checkpointing environment variable and `rewind_files`. ADR-001 also rules out the Agent SDK, and ADR-008 `cross-spawn`; [ADR-013](../../current/adr/ADR-013-desktop-only-obsidian-1-8-7-floor.md) makes the plugin desktop only.
- The protocol is the CLI's headless interface (`--input-format stream-json --output-format stream-json`) plus its control protocol. The control-request subtypes are declared in the Agent SDK's public type definitions; several are undocumented elsewhere and `get_usage` is marked experimental, so every reply field is checked before use.
- CLI versions: Claude Code 2.x; `sdkMcpServers` needs 2.1.210 or newer and is ignored by older versions. The plugin checks no version; features degrade instead (Rollout).
- Whether a message sent mid-turn steers the running turn or queues for the next depends on the CLI version; the client cannot tell which happened.
- Trust boundaries: settings decide which executable runs and with which arguments; CLI stdout, including model content inside it, is untrusted input; stored conversations and synced settings supply argv values.
- Component map and layering: [DES-001](../../current/design/DES-001-system-overview.md).

## Proposed design

### Components

| Component | Responsibility |
| --- | --- |
| `cli.ts`: `detectClaudeCli`, `pickLookupResult` | Find the executable when a profile has no path |
| `main.ts`: `resolveCli` | Path and WSL flag for a profile; detection cache per profile id |
| `settings-core.ts`: `CliProfile`, `migrateRawSettings`, `normalizeSettings`, `profileById`, `defaultProfile`, `profilePick`, `keptProfileNotice`, `profileLabel`, `settingsLaunchOptions` | Profile model, migration, repair, what a Profile pick does and says, how a profile is named (`standalone` for popover rows and headings), the launch options the settings decide |
| `cli-args.ts`: `parseCliArgs`, `profileLaunchArgs`, `sandboxAvailable`, `relaunchOptions` | A profile's arguments for one launch, or the reason it cannot launch; what an open conversation restarts with on settings close, or that it keeps its process |
| `protocol/client.ts`: `cliSpawnSpec` | The one place that decides the launch shape and environment |
| `protocol/client.ts`: `ClaudeClient` | One process: spawn, NDJSON framing, control requests both ways |
| `protocol/types.ts` | Message and control types |
| `session.ts`: `ClaudeSession` | One conversation across processes: lazy spawn, busy state, resume, respawn once the old process has closed (`hold` and `holdAll` make several launch changes one restart), fork |
| `tab/session-link.ts`: `SessionLink` (`ensure`, `relaunch`, `leaveBypass`, `endedWith`, the model, effort and mode calls), `holdSessions` | One tab's session: builds its config, resumes or forks it, relaunches it on a settings change, falls back after a failed resume |
| `state/clear-operation.ts`, `tab/clear-flow.ts`: `ClearFlow` | The clear transaction: the pure machine, and the flow that feeds it the CLI's messages, exits and timers, carries out its actions and holds the tab's sends |
| `view.ts`: `onLaunchSettingsChanged`, `handleSessionEnded` | Holds every tab's session through a settings change; settles a tab's cards at its session's end |

### CLI profiles

- A profile is `{id, name, cliPath, useWsl, chrome, sandbox, extraArgs}`. `chrome` and `sandbox` are `""` (Claude Code default), `"on"` or `"off"`. `settings.defaultProfileId` names the default.
- `normalizeSettings` rebuilds every stored profile as a fresh object of the right shape, guarantees at least one (`{id: "default", name: "Default"}` with an empty path) and repoints a dangling default id at the first profile.
- `migrateRawSettings` turns the flat `cliPath` and `useWsl` of 0.3.x into one profile named "Default"; profiles stored before launch options get empty toggles and arguments.
- Each tab carries a profile id (`ChatTab`'s `status.profileId`): the default profile for a new tab, the stored conversation's `profileId` on reopen when that profile exists on this device, else the default (DES-005). A session records the profile it was created from (`ClaudeSession.profileId`).
- Settings UI (`settings.ts`, the Claude Code section of DES-001's page): the profiles one under another, each with Profile name, Claude CLI path (with Detect), Run via WSL on Windows, Claude in Chrome, Sandbox except on native Windows, Additional arguments, Use for new conversations and "Remove the <name> profile"; with one profile, its sub-heading, name, Use for new conversations and Remove are hidden. Turning on a profile's "Use for new conversations" makes it the default (`defaultProfileId`); the default's is on and disabled. "Add profile" appends `Profile <N>`; if the only profile is still named "Default" and uses WSL it is renamed "WSL". Removing the default makes the first remaining profile the default.
- Missing CLI (PRD-001.R39): `state/cli-missing` keeps, per profile id for this run, whether the profile's CLI is known missing: a configured native path that `cli` reports absent where the launch looks (from the vault; on Windows also with `.com` or `.exe`; a bare command name is never checked), an auto-detect or a Detect that found nothing for an empty path (a configured native path is judged by its own check instead), or a WSL launch that exited with code 127 before `system/init`. A successful check of the configured path, a Detect or auto-detect that finds the CLI, or a start that reaches `system/init` clears it. A result belongs to the configuration it checked: path, effective WSL flag and a revision that each path or WSL change bumps (an edit, Detect, a reset, its Undo; seen at each save), so a change drops it and a stale result is dropped; a start reports on the configuration it resolved. A later observation replaces an earlier one, and a search reports as of when it began. When the settings page shows, on a path or WSL edit and when a profile is added, a configured native path is checked on disk and an empty one is auto-detected once per configuration, on this device only and without changing the WSL flag; on Windows a miss there says nothing, since the CLI may be in WSL; a WSL profile is not probed. The page draws the banner, the alerts and the profile's notice from this state.
- The status line's profile segment (shown only with several profiles) opens the "CLI profile" popover; a pick on a tab (`profilePick`):
  - No session yet: the tab's profile id changes (`ChatTab.setProfile`); the next start uses it.
  - A session that only a panel command started (no session id, not busy, and no stored session id unless its profile is missing, as below): it is disposed and the pick applies.
  - A conversation with a Claude Code session, running or ended (a session id on the session, a turn running, or a session id on the tab or the conversation whose `profileId` names a profile on this device): the tab keeps the session's profile for its profile segment, its CLI restarts, its `!` commands, its model list and a branch from it, and shows the Notice "This conversation stays on <profile>; start a new conversation to use another." (`keptProfileNotice`, <profile> being the tab's profile name)
  - A stored session id whose `profileId` names no profile on this device (absent in files from 0.5.x, or a removed profile), with no live session: the pick applies, so `--resume` runs on the picked profile; the conversation records it when the CLI reports the session (`system/init`).
- Claude in Chrome is passed for a WSL profile as set: Claude Code's docs list WSL as unsupported, Claude Code 2.1.0 fixed its WSL support, and `/chrome` reports whether it connected.
- Profiles are in the `cli` sync unit, device-local by default ([ADR-009](../../current/adr/ADR-009-synced-and-device-local-settings.md), DES-005).

### Detection

`resolveCli(profile)` in order:

1. A non-empty `cliPath`: used as written, with the profile's `useWsl`.
2. Windows, `useWsl` on, empty path: the bare command `claude`, resolved by the distro's PATH. No probe.
3. Otherwise `detectClaudeCli(profile.useWsl)`. A hit is cached per profile id until the plugin reloads; a miss is not cached. If the CLI is found on the other side of the Windows/WSL boundary than `useWsl` says, the flag is corrected and saved.

`detectClaudeCli(preferWsl)` runs a native probe then a WSL probe (the reverse with `preferWsl`) and returns the first hit as `{path, useWsl}`:

| Probe | Steps | Timeout |
| --- | --- | --- |
| Native, Windows | `existsSync` on `~/.local/bin/claude.exe`, then `%APPDATA%/npm/claude.cmd`; then `where claude` | 5 s |
| Native, macOS and Linux | `existsSync` on `~/.local/bin/claude`, `~/.claude/local/claude`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`; then `which claude` | 5 s |
| WSL, Windows only | `wsl.exe -- sh -lc "command -v claude"` (a fixed string), first output line | 15 s |

`pickLookupResult` filters lookup output: on Windows the first `.exe` line, else the first `.cmd` or `.bat` line, never npm's extensionless shell shim; elsewhere the first line.

The settings "Detect" button calls `detectClaudeCli` directly, writes the path and WSL flag into the profile and shows "Found Claude Code: `<path>`" or "Found Claude Code in WSL: `<path>`"; on a miss it shows `Claude Code CLI not found. Install it from https://code.claude.com` and changes no setting. A Detect answered after the profile's path or WSL flag changed does neither.

### Launch arguments

`ClaudeClient.start` builds the argument list in this order:

| Arguments | Present when | Value from |
| --- | --- | --- |
| `--output-format stream-json --input-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio` | always | fixed |
| `--model <model>` | the tab has a model | tab pick, else last pick, else settings; a stored conversation's pick on reopen |
| `--effort <level>` | the tab has an effort | same sources as the model |
| `--permission-mode <mode>` | the tab does not inherit Claude Code's default | tab mode through `cliPermissionMode` (`auto` becomes `default`; DES-004) |
| `--allow-dangerously-skip-permissions` | `enableBypassMode` was on when the session's launch config was last built | settings |
| `--replay-user-messages` | always | fixed; the CLI then echoes user turns with their uuid, which restore and branching need |
| `--resume <session id>` | the session has an id, or the tab restores or branches a conversation | `system/init`, else the stored conversation's id when it is a lowercase UUID this device recorded for the conversation and profile (`SessionLink.vetResume`, after the history's first scan); the session asks the link again at every process start that resumes or forks (`mayResume`), a restart or crash respawn included, and a refusal starts that process fresh (`onResumeRefused`); `ClaudeClient` refuses any other id. One decision at every process start, the first launch, an effort restart and a crash respawn alike (`SessionProvenance.decide`): `trusted` when the exact conversation, profile and id are in the device's record (no scan needed), `pending` when they are not and the migration has not completed, else `foreign`. Pending starts nothing and drops nothing: the stored id, the fork and the rewind are kept, an error says the history could not be read, and the message stays in the box (`RESUME_PENDING`; it is not a lost resume): `ChatTab.send` asks `ClaudeSession.checkResume` before consuming the message, so text and images stay in the composer. A profile this device lacks is foreign: a branch is not run on the default profile, and a cached session whose profile was removed is foreign at its next process start |
| `--fork-session` | branching, and only with `--resume` | tab `forkOnResume` |
| profile arguments | the profile sets any | `profileLaunchArgs` |

`profileLaunchArgs(profile, {cliPath, useWsl})` returns `{args, error}`:

1. `parseCliArgs(extraArgs)`: whitespace separates, single or double quotes group, backslashes are literal except `\"` inside double quotes, no `~` or `$VAR` expansion. An unterminated quote yields the error "Unterminated `<quote>` quote in additional arguments."
2. The sandbox toggle is dropped on native Windows (`sandboxAvailable` is false there).
3. Each extra argument's option name (`--name` before any `=`, or the two-character short flag) is checked; values are not. Refused:
   - "`<flag>` is set by the panel itself.": `-p`, `--print`, `--output-format`, `--input-format`, `--include-partial-messages`, `--replay-user-messages`, `--permission-prompt-tool`, `-r`, `--resume`, `-c`, `--continue`, `--fork-session`, `--session-id`, `--model`, `--effort`, `--permission-mode`, `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, `--no-session-persistence`.
   - `--chrome`, `--no-chrome`: `Use the profile's "Claude in Chrome" setting instead of <flag>.`
   - `--settings`, only while the sandbox toggle already passes one.
4. If the CLI is a `.cmd` or `.bat` file on native Windows, an extra argument containing a cmd.exe metacharacter is refused here, before launch.
5. Result order: `--chrome` or `--no-chrome`; `--settings {"sandbox":{"enabled":true|false}}`; then the extra arguments.

The settings tab calls `profileLaunchArgs` on every edit and shows the error under the arguments field. `SessionLink` calls it with the resolved CLI; on an error it shows the reason plus "Fix the `<name>` profile in Settings -> AI Agent Panel." in the tab's messages and creates no session.

### Launch shapes and environment

`cliSpawnSpec(options, args, platform)` returns `{command, args, cwd, shell, env}`:

| Shape | When | Command | Shell | Guard |
| --- | --- | --- | --- | --- |
| WSL | `useWsl` (`SessionLink` sets it only on Windows) | `wsl.exe --cd <vault> --exec sh -lc 'exec <cli> "$@"' sh <args...>` | none parses the arguments; they are positional parameters of a login `sh` | In the script the CLI path is double-quoted with `"`, backslash and backtick escaped, and every `$` except a plain `$NAME` or `${NAME}`, so no command substitution runs (not even `${X:=$(id)}` under bash); a leading `~/` stays outside the quotes, so `~/...`, `$HOME/...` and `${HOME}/...` expand |
| cmd shim | Windows and the path ends in `.cmd` or `.bat` | the path always in double quotes plus each argument quoted by Windows rules | cmd.exe (`shell: true`) | Any argument, or the shim path, matching `CMD_UNSAFE` throws (`cliSpawnSpec` only; npm's shim reads its own directory unquoted, so quoting cannot save a path with `&` or `^`); nothing is escaped |
| Direct | everything else | the path and the argument array | none (`shell: false`) | none needed |

- `CMD_UNSAFE` is the character class of double quote, `%`, `!`, `&`, pipe, `<`, `>`, `^`, CR and LF. The check covers every argument, the panel's own included; the error names the argument and says to remove it or install the native build.
- Environment: `process.env` plus `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true` ([ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md)). In the WSL shape `WSLENV` also carries that name: appended after a `:` to the user's existing entries, or alone when there are none. A `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` the user set is passed unchanged and wins (DES-004).
- Spawn options: `cwd` is the vault root (through `--cd` in the WSL shape), stdio is three pipes, `windowsHide` is on.
- A throw from `cliSpawnSpec` or `spawn` leaves no current client: `send` surfaces it as an error block in the tab; `warmUp`, and the replacement's spawn after a restart's wait, as a session end (`onEnded`).

### Wire format

One JSON object per line in both directions.

Client to CLI (stdin):

- User turn: `{"type":"user","session_id":<id or "">,"message":{"role":"user","content":[...]},"parent_tool_use_id":null}`. A string becomes one `text` block; with images the content is `image` blocks (`{"type":"image","source":{"type":"base64","media_type":...,"data":...}}`) first and the `text` block last.
- A message whose text starts with `/` is sent as typed: no context block and no attachments, because a leading context block makes the CLI treat a command such as `/compact` as prose ([real-CLI run 2026-10-10](../../records/verification/2026-10-10-real-cli-compact-and-cost.md)). The composer applies the rule (DES-003).
- Control request: `{"type":"control_request","request_id":"obs_N","request":{"subtype":...}}`. `N` counts up per process.
- Control response to a CLI request: `{"type":"control_response","response":{"subtype":"success","request_id":...,"response":...}}` or `{"subtype":"error","request_id":...,"error":...}`.

CLI to client (stdout), as routed by `ClaudeClient.route`:

| `type` | Routed to | Meaning |
| --- | --- | --- |
| `control_response` | the pending `obs_N` request: resolve on `success`, reject with `error` otherwise ("Claude Code refused the request." when `error` is not text); unknown ids ignored | reply to a request of ours |
| `control_request` | `handleControlRequest`; a `request` that is not an object is skipped | the CLI asks the client something |
| `control_cancel_request` | `onPermissionCancelled(request_id)`; the id is remembered so no reply is written | the CLI withdrew a prompt |
| anything else | `onStreamMessage`, through `ClaudeSession` to the tab (DES-003 Stream to messages) | `system` (`init` and other subtypes), `stream_event`, `assistant`, `user`, `result`, and types the panel ignores |

Framing (`handleStdout`): only the new chunk is searched for its last `\n`; the buffered remainder and the chunk's complete lines are split once, and the unterminated remainder waits for the next chunk, so a long line is not rescanned per chunk. Blank lines, lines that are not valid JSON, lines whose value is not a JSON object, a `control_response` without a `response` object and a `control_request` without a `request` object are skipped; the rest of the chunk is still processed. stderr is kept as its last 40 non-blank lines. Writes after the process ended are dropped; stdin `error` events (EPIPE) are swallowed and the failure surfaces through `close`.

### Initialize handshake

`start` sends `initialize` right after spawning, with `appendSystemPrompt` (the vault instructions, when set) and `sdkMcpServers: ["obsidian"]` (when vault tools are on). User turns may be written before the reply arrives.

| Reply field | Consumer |
| --- | --- |
| `models` | `safeCliModels` (DES-005 Load), then `rememberCliModels(profileId)`: the "Model and effort" popover (DES-003) |
| `commands` | `parseCliCommands`: slash autocomplete and `/help` (DES-003) |
| `current_permission_mode` | `noteCliMode` (DES-004); stored per profile as the startup mode when the launch passed none. Ignored when the session's mode changed after the spawn |

A failed or timed-out handshake is not reported; it surfaces only if the process then ends.

`system/init`, the first stream message of every process, is used by `ClaudeSession` for the session id (and to spend the fork flag) and by the view for the status line's model segment, the alias resolution, the reported permission mode, the names-only `slash_commands` fallback, the conversation's stored `sessionId` and resolved model id, and the missing-server check: when the session registered `obsidian` and `system/init`'s `mcp_servers` list does not name it, the view shows the Notice of [DES-006](../../current/design/DES-006-vault-tools.md#cli-version-floor), at most once until the plugin reloads.

### Control requests sent

Sent through `ClaudeClient.request`, which rejects at once with "Claude is not running" when no process is up, with "Control request timed out: `<subtype>`" at the timeout, and with "Claude process exited" when the process ends first. No other subtype is sent.

| Subtype | Payload | Timeout | Sent when | On failure |
| --- | --- | --- | --- | --- |
| `initialize` | `appendSystemPrompt`, `sdkMcpServers` | 120 s | every spawn | not reported |
| `interrupt` | none | 15 s | Stop button, if a process runs | ignored; the turn stays busy until `result` or exit |
| `set_permission_mode` | `mode` | 15 s | a mode pick, if a process runs | `tab/session-link` rolls the pick back (DES-004) |
| `set_model` | `model` or null | 15 s | a model pick, if a process runs | the view rolls the selection and `lastModel` back to the model the session kept, with a Notice; only the latest pick rolls back, `lastModel` only if no other tab picked since, and a tab closed meanwhile shows nothing. The conversation's model is stored, and its save queued, only when the CLI accepts |
| `rewind_conversation` | `target_message_uuid`, `interrupt_if_running: true`, `last_seen_user_message_uuid` unless the caller knows none | 30 s | before the first message of a branch | a target or last-seen id that is not a lowercase UUID (nothing is sent), a rejection or a reply without `rewound: true` (its `error` and `reason` kept): nothing sent, the fork stopped, `onBranchFailed` (DES-004 Branch) |
| `rewind_files` | `user_message_id`, `dry_run` | 30 s | Restore files: a dry run, then the real rewind after confirmation | DES-004 |
| `stop_task` | `task_id` | 15 s | a background task's Stop | Notice "Could not stop that task." |
| `get_usage` | none | 15 s | the usage service, through a running session's client | no usage shown (DES-007) |
| `get_context_usage` | none | 15 s after each `result`; 60 s for `/context` | context segment; `/context` | segment keeps its last value; report card says why |
| `get_session_cost` | none | 30 s | `/cost`, only if a process runs | CLI lines omitted |
| `mcp_status` | none | 60 s | `/mcp` | report card says why |
| `mcp_reconnect` | `serverName` | 60 s | `/mcp reconnect`, Reconnect button | card text or Notice |
| `mcp_toggle` | `serverName`, `enabled` | 60 s | `/mcp enable` or `disable`, buttons | card text or Notice |
| `get_status`, `get_memory_dialog`, `get_hooks_listing`, `list_permission_rules`, `get_skills_dialog`, `get_chrome_dialog`, `get_sandbox_dialog` | none | 60 s | `/status`, `/memory`, `/hooks`, `/permissions`, `/skills`, `/chrome`, `/sandbox` | report card says why |

- `rewindFiles` returns `{canRewind, error, filesChanged, insertions, deletions}`: `canRewind` must be a boolean, `filesChanged` an array of strings (other entries dropped) or absent, the counts numbers or absent; any other reply is an error.
- `get_context_usage` replies are normalized in `getContextUsage`: a reply without numeric `totalTokens` and `maxTokens` is null; category entries that are not objects, or lack a string `name` and numeric `tokens`, are dropped; a "(deferred)" suffix in a category name is stripped and folded into the `deferred` flag with `isDeferred` and a `kind` of "deferred"; a category's `kind` is kept when it is a string, else "". `model` is kept when it is a non-empty string, and `autoCompactAt` is `autoCompactThreshold` when that is a number and `isAutoCompactEnabled` is `true`; otherwise each is null. The CLI rejects the request before a session's first turn.

### Control requests received

| From the CLI | Handling | Reply |
| --- | --- | --- |
| `control_request`, `can_use_tool` | Build a `PermissionRequest` (`tool_name` that is not a string becomes "unknown" and is named in `mistypedFlags`; `input`, `permission_suggestions`, `title`, `description`, `tool_use_id`, `agent_id`, `decision_reason` passed on when a string; `decision_reason_type`, `decision_reason_code`, `classifier_approvable` and `requires_user_interaction` passed on when of their type, and `matched_ask_rule`, when an object, as `matchedAskRule: true`; null counts as absent, and any other wrong type is named in `mistypedFlags`) and await `onPermissionRequest` (DES-004) | `success` with the `PermissionResult`; `error` if the callback rejects; nothing if the CLI cancelled meanwhile |
| `control_request`, `mcp_message` | `onMcpMessage(server_name, message)` (DES-006) | `success` with `{mcp_response: <reply or null>}`; `error` when no handler is wired or it throws |
| `control_request`, any other subtype | none | `error` "Unsupported control request: `<subtype>`" |
| `control_cancel_request` | Mark the id cancelled, call `onPermissionCancelled` | none |

### Session lifecycle

`ClaudeSession` holds a config (`SessionConfig`, built by `SessionLink`), at most one `ClaudeClient`, the session id, the busy flag and the session cost.

| Event | Effect |
| --- | --- |
| `SessionLink.ensure`, first call (`tab/session-link`) | Resolve the CLI and the profile arguments, build the config. No process starts |
| First `send`, `control` or `warmUp` | `ensureClient`: new `ClaudeClient` with `resumeSessionId = sessionId ?? config.resumeSessionId`, then `start` |
| `send(content)` | Busy on; write the user turn. With a pending rewind not yet sent to this client: `rewind_conversation` first, naming the latest prompt its reader gives then; the turn only once it rewound and the client is still current. Until that turn is written, later turns queue behind it, and `control`, `rewindFiles`, `interrupt` and `stopTask` wait for it |
| Branch rewind refused or failed, client current | Nothing written, the turns behind it included; the client stopped through the restart's wait without a warm-up (its close stale, a send meanwhile waiting for it), busy off (`exit`), then `onBranchFailed({ reason, detail, retry })`, a throw from either logged to the console |
| Branch rewind pending when its process ends | The close is handled as any, except that `onEnded` carries no error: `onBranchFailed` with reason `exited` follows and is the one report. A client a restart replaced, or a disposed session, reports nothing |
| Pending rewind | Armed from `rewindOnStart` until `system/init` arrives on the process whose rewind succeeded; so after a failure, an exit or a kill the next process is a fresh fork (`sessionId` still null, `forkSession` still set) that is rewound again. `retry` is the source, target and latest sent, or null when `clearResume` dropped the rewind |
| `system/init` | Record `session_id`; clear `forkSession` so a later restart resumes the branch instead of forking again; drop the pending rewind once it succeeded on this process, and report `onBranchCut(sessionId)`; a `result` of that process does the same when no `init` came, and a rewound fork with no session id keeps the rewind armed |
| `assistant`, `user`, `stream_event` | Busy on (a message queued mid-turn can start a turn after the previous `result`), except a `user` message whose text starts `<local-command-stdout>`: the CLI replays a local command's output with a uuid and `isReplay: true` after a manual `/compact` and in front of the `control_response` of every `set_model` that changes the model, idle or mid-turn. It is no prompt, no turn activity and no file checkpoint (its uuid is not a valid `last_seen_user_message_uuid`), but it still reaches the view and is a chain member the CLI accepts as a rewind target |
| `result` | Record `total_cost_usd`, the session's running total, which a resumed process continues (DES-007); busy off |
| Process closes, current client | Client dropped, busy off, `onEnded(error)`. Failed means a spawn error or a non-zero exit code; the message is the spawn error, or "Claude exited with code N" plus the stderr tail. A clean exit ends silently |
| Process closes, replaced client | Ignored (identity check), so a deliberate restart shows no error; the restart itself reports `onRestarted` |
| Replaced client writes or asks | Dropped by the same check: stream messages (a late `result`, `system/init` or mode report), the handshake reply and cancellations reach nothing; a permission request is denied ("Claude Code was restarted.") and an MCP call refused without reaching the view. Its prompts still open in the view are cancelled at the restart (`onPermissionCancelled`; the view settles the card as denied), and nothing is written to it after `stop`, so a late Allow or vault-tool reply never reaches it. Each client keeps its own set of open prompts, each request by itself, since a new process numbers its requests afresh and ids can repeat: an answer to one request, late or not, cannot drop another open under the same id from the next restart's cancel |
| Next `send` after an exit | A new process with `--resume <session id>` |
| First launch of a conversation whose stored session this device did not record, or whose stored id is not a lowercase UUID | No `--resume`, no fork and no rewind: a fresh session. The tab records `{kind: "fresh-start", at, sessionId?}` once per boundary (the refused id, a malformed one kept as stored), and a resume the CLI lost writes it at once and shows the note "This conversation's Claude Code session is not available on this device, so this message starts a fresh one (the messages above are kept)." A session recorded at `system/init` joins the device's record (DES-005) |
| `setEffort`, `setLaunchOptions` (spawn-time options: profile arguments, vault instructions, `sdkMcpServers`, bypass flag), `leaveBypass` | Update the config. Unchanged: nothing. No client: nothing more. Busy: restart when the turn ends. Idle: restart now |
| Restart (`restartClient`) | The client stops being current, so its close is stale; `stop` it and report `onRestarted`. Once it has closed, or at its SIGKILL 3 s after the stop, spawn the replacement from the config as it is then, resuming the session, and send it the turns that waited, in order. A tab closed meanwhile spawns nothing |
| During a restart's wait | No client runs (`running` false, `liveClient` null). `send` queues the turn and sets busy; `warmUp` does nothing; `control`, `rewindFiles`, `interrupt` and `stopTask` wait for the replacement, checking again after each wait and writing in the same step as the last check, so a restart that starts while they wait is waited out too; a config change (effort, launch options, leaving Bypass, a model or mode pick, which with no process takes at once) reaches the replacement through its spawn. The waiting turns go to the replacement in order, behind a pending branch rewind. A replacement that cannot spawn ends them: busy off, then `onEnded(error)` even if the busy callback throws; a throw from either is logged to the console. Exception: a pending resume verdict (`RESUME_PENDING`) keeps the waiting turns, and they go first, in order, with the next send |
| `setModel` | `set_model` if a process runs; the config takes the model once the CLI accepts it, or at once when no process runs. Each pick takes a generation. An answer from a process a restart replaced counts only while no newer pick exists: then the config takes it and the replacement spawns with it or is sent it; else it is dropped, not resent, and the call returns false. The same holds for a switch the close cut off, which is sent to the replacement once it has spawned (`switchLive`, shared with `setPermissionMode`). The view stores a dropped pick nowhere |
| `setPermissionMode` | `set_permission_mode` if a process runs (resent to a replacement process as for `setModel`), then update the config; the CLI answers in order, so the last accepted switch is its mode. Each mode change takes a generation; a switch sent before `leaveBypass` (at or below `leftBypassAt`) is dropped when answered and the call returns false, a refusal included; an answer from a replaced process is dropped when a newer pick exists, as for `setModel` |
| `adoptPermissionMode` | Update the config only (the CLI changed mode itself) |
| `control(request)` | Spawn if needed, then send; no turn starts and no tokens are spent |
| `rewindFiles(uuid, dryRun)` | Spawn if needed, then `rewind_files`; Restore uses it to start a CLI without a prompt (DES-004). A reply that can rewind proves the resume worked, so an unforked session takes its resume id as its session id |
| `dispose` / `closed` | `dispose` stops the process and any fork a failed rewind was stopping; `closed` resolves when they have exited, and `SessionLink` awaits it before it creates the next session, so two forks never overlap |
| `writeClear`, `restart`, `abandon`, `generation`, `setClearGate` | The clear transaction's calls (below): write `/clear` without setting busy; replace the process resuming the session as it is; stop the process and spawn none; the current process's number; the gate that sees each message first and each process end (an exit, a restart, an abandon, a dispose) after the busy change |
| `effective`, `reapply` | The mode and model the CLI runs with now; set a mode and a model on the running process, rejecting when the CLI refuses or the process is gone |
| `clearResume` | Forget the resume id, session id and any pending branch rewind; the next spawn starts a fresh session |
| `resumeLost` | A resume id, no session id, and no pending branch rewind: the resume most likely failed. `SessionLink.endedWith` reads it for the resume fallback (DES-005), so a branch's fork that ends keeps its resume and rewind |
| `dispose` | Stop the client; later closes are ignored |

- One session per tab. `SessionLink.ensure` shares one in-flight creation between concurrent callers (a double Enter while the CLI resolves, a branch's first message), and disposes a session whose tab closed while it was being created.
- No cap on live processes and no idle shutdown: every tab that has started keeps its process until the tab or the view closes.
- `ClaudeClient.stop`: end stdin, send SIGTERM, send SIGKILL 3 s later unless the process closed; every write after it is dropped. Its promise resolves on the close or at the SIGKILL, so a process whose pipes a child keeps open delays a restart no longer than 3 s.
- Limitations of one process per conversation: the guarantee covers the process the plugin spawned. On Windows that is the cmd.exe or `wsl.exe` wrapper, and a SIGKILL of the wrapper may leave the CLI behind it running briefly. A message sent mid-turn while leaving Bypass steers the running turn on the old process, after `set_permission_mode` `default` was sent to it; the restart waits for the turn to end.
- Branch (ADR-006): the view opens a tab with the original tab's session profile, and `SessionLink.branchFrom` sets the original's session id to resume, the fork flag, the rewind uuid and the reader of the original's latest prompt; `ensure` calls `rewindOnStart(uuid, latest)` on each session the tab gets until `onBranchCut` (a failed first start or a dropped session keeps them). The process starts on the branch's first message.
- Session end: the busy change (`exit`) closes the tab's turn, its streamed text and thinking finalized and its end recorded (DES-003 Turn); `handleSessionEnded` settles pending permission cards as denied ("Session ended"). On an error: if the tab was resuming and the process never reported a session id, `SessionLink.endedWith` drops the resume id, nulls the conversation's `sessionId` and appends the resume-failure text of PRD-003.R9; the tab records the error with the conversation (500 characters) and shows it as an error block (2000 characters).

Failures before a process exists, each shown in the tab's messages with no session created:

| Failure | Message |
| --- | --- |
| No CLI found | `Claude Code CLI not found. Install it from https://code.claude.com, or set the path in Settings -> AI Agent Panel.` |
| A configured native `cliPath` that does not exist (`existsSync` before the session is created), or a WSL launch that exits with code 127 before `system/init` | The missing-path message of PRD-001.R6, naming the path and the profile |
| Refused or unparseable profile arguments | The refusal plus "Fix the `<name>` profile in Settings -> AI Agent Panel." |
| Not a local vault (`getVaultPath` throws) | "AI Agent Panel requires a vault on the local file system." |

A CLI that is not logged in reports that itself, as a turn error or an exit with its stderr; the panel adds nothing.

### Clear transaction

PRD-001.R38, ADR-018 Option B. `ClearFlow` (`tab/clear-flow`) runs one tab's `/clear` over `state/clear-operation`, a pure machine (events in, actions out), and is the `ClearGate` every session of the tab consults first (`ClaudeSession.setClearGate`, set by `SessionLink.create`). Each process has a number from one counter (`ClaudeSession.generation`, unique across sessions); an event of another number, or of a timer other than the armed one, changes nothing. `ChatTab.send` takes the composer's text and calls `ClearFlow.request`:

1. A branch before its first message (`SessionLink.unstartedBranch`): the fork, rewind and fork base are dropped and the session is disposed, since a fork a panel command started would take the next prompt uncut (`dropBranch`); the branch intent and the branch fields of a failure are removed from the conversation (`stripBranch`), so a reopen makes no branch. Nothing is recorded.
2. No conversation, or no message to Claude Code since it began or since its last clear (`clearDue`, `state/boundary-records`): nothing. A fresh start counts as a clear: its context is already empty.
3. No running process: the clear is recorded (below) with a null session id, so the next send starts a new session. The recorded old id is the session's own, else the one the conversation continues, never the source of a fork it has not left (`SessionLink.clearOldId`).
4. Otherwise `ClaudeSession.writeClear` writes `/clear` to the process, setting no busy, the old id being the session's last reported id or the launch resume id; every message sent while the clear is open is held, in order, and replayed through the send path once it settles (`HeldSends`, `tab/held-sends`).

| Event of the written clear's process | Effect |
| --- | --- |
| Messages before the reset | The CLI's own turn: they pass as any turn (a `/clear` written mid-turn waits for the turn's result), and the 15 s window stops until its `result`. A `result` of that turn arriving after the reset, before or after the new `system/init`, passes too (it clears busy); the next `result` is the clear's. After the init, a `result` with `num_turns` 0 and the new session's id is the clear's whichever comes first; when it comes while the old turn's result is outstanding, it is consumed and the sends keep waiting for the old result, which passes and clears busy (the 15 s window covers one that never comes). A busy callback that throws at a turn's end is logged and the rest of the chunk is processed. The branch drop keeps a failure record's mark that its prompts were not sent |
| `conversation_reset`, trigger `clear` | Consumed |
| `system/init` after the reset, with a valid id (`isSessionId`) other than the old one | Commit: `recordSession(newId)` first (the id joins the device's record as started, ADR-018 Decision 1); then the clear record `{kind: "clear", at, sessionId: oldId}` and the conversation's `sessionId` = newId together; `SessionLink.cleared(newId)`; the tab shows the clear (below). The init then reaches the session as any (`noteInit` saves no id while the clear is open). Any other init passes with no effect |
| `result` after the reset | Consumed: no turn, footer, cost or busy change. Ends the transaction and releases the sends, unless the new session runs a mode or model other than the target (below) |
| The set-again's answer | Taken: the transaction ends, the tab shows the picks (`reapplied`) and the sends are released. Refused, the process ending, or no answer within 15 s of the request: `ClaudeSession.restart` (nothing when it exited), the replacement resuming the new session with the conversation's mode and model flags; sends released. An answer after the transaction ended is dropped |
| No commit within 15 s of the write, or the process ends first | `ClaudeSession.abandon` (stop, spawn nothing); the clear completes as with no process; sends released |
| No `result` within 15 s of the commit, or the process ends first | `ClaudeSession.restart` (nothing when it exited): the replacement resumes the new session; sends released |
| A write no process took | As the process ending |

Re-applied picks (PRD-001.R38). A clear never loosens the permission mode: the panel keeps the mode in force just before the reset, or a mode the user picked since, and sets it again before it sends anything if the new session reports another, none or an unrecognised one; if the CLI refuses or does not answer within 15 s, it restarts the CLI with the conversation's mode flag.

`ClaudeSession.effective` is the CLI's mode and model as it runs them: the launch config until the process reports (a launch with no mode flag takes the mode of the initialize reply's `current_permission_mode`, if it is a known mode, Bypass only while the bypass setting is on, and no accepted pick or report came first; a refused pick does not count), then the last `system/init` (model, mode) or `system/status` (mode) it sent, then each switch it accepted. The machine's target is `effective` as it was when the CLI's `conversation_reset` reached the gate, before the session took in what follows; each mode or model the user picks and the CLI accepts afterwards replaces that value (`ClearGate.picked`, from `setPermissionMode`, `setModel` and leaving Bypass). What the new session runs starts as its init's report, then each `system/status` mode and each accepted pick. When the clear's acknowledging `result` arrives, `lostPicks` (`state/clear-operation`) compares the two: the mode is lost unless the session runs exactly the target (a missing, empty or other report is lost); the model is lost when both are known and differ after each is looked up in the resolved aliases (`resolvedModels`), so an alias equals the id it resolved to. If either is lost, the machine enters `reapplying` instead of releasing the sends and asks `ClaudeSession.reapply` to send the mode, then the model. A pick accepted while that is out is sent again when the answer arrives (three rounds at most, then the restart), and the tab shows the target's values. `reapply` writes nothing once its process was replaced; a mode that took becomes the launch config's and `effective`, unless leaving Bypass or a newer pick came after it began, or it is Bypass while the bypass setting is off, which is then not sent at all and answered as skipped: the clear does not record it as applied or show it, and its target becomes the mode the new session reports, the others being left as they are; the model config is not changed. Every `system/status` and `system/init` report until the release is compared again, so a mode lost meanwhile is set again within the round cap. A report of a key while it is set again supersedes what was sent for that key, so the answer does not overwrite it. Default for the model is a pick that replaces the model to keep; a pinned model sent before it is undone by a set-again with no model. `adoptPermissionMode` never takes Bypass once the bypass setting is off. At the release the tab is not told the mode when the clear restarted or abandoned the CLI, whose own init shows it. From the reset until the release, `system/status` and `system/init` change neither the tab's mode and model display nor the launch config (`view.handleStreamMessage`, `noteInit`); at the release the tab shows the mode the CLI runs, and the set-again shows no mode while the user's own pick is still waiting for the CLI, whose acceptance shows it. The panel's Auto-approve policy is not a CLI mode (it launches the CLI in `default`) and is never sent.

A turn's `result` is forwarded and recorded before the restart that turn owed (an effort change) and the exit it causes reach the gate, so no turn record lands after the clear record. The commit saves the conversation at once, not after the debounce; a save computes the file version from the snapshot it writes, after its awaits (ADR-018).

A completed clear (`onCleared`): the command is recorded as a user message `/clear` before the clear record and drawn as a compact command bubble above the divider (`ChatTab.addClear`; it owns no card, `parseCardCommand`); `ChatTab.addClear` draws the divider at the end, empties the context figure and hides the context segment until the next finished turn (`StatusData.contextHidden`, PRD-005.R8) and makes the prompt cache cold (PRD-005.R11); `RestoreBranch.cleared` takes Restore files off the turns above (PRD-002.R14). Closing the tab disposes the flow: timers cancelled, nothing recorded, the held `/clear` and the held sends dropped unsent. A `/clear` sent while a turn runs is held by the flow (`ClearFlow.holdClear`, `reduceHold`) and written only after that turn's `result` is recorded and its handler has run, so a restart the turn owed goes first and no turn record lands after the clear record; the messages sent meanwhile or while a clear is open are held in order (`HeldSends`) and replayed through the tab's send path once the clear completes or is cancelled (DES-003 Held messages). A held `/clear` released while a restore is under way is not written: the messages held behind it go back to the composer, in order with their images, with a note, and nothing is sent into the old context. While an agent or a background task runs, a `/clear` asks first, typed now or released from the held messages, and runs as [Stop and clear](#stop-and-clear); text after `/clear` asks "Clear the context?" first (`ConfirmModal`).

#### Stop and clear

PRD-001.R38, ADR-018 (O2). `ClearFlow.stopAndClear` runs over `state/stop-operation`, a second pure machine fed by the same flow: the stream's task messages (`taskSignal`, which reads `state/stream`'s `taskEvent`), the turn's start and end (with a message queued behind it), the process's exit and one timer. It begins with the sends held, the process's generation (the session object is kept for the check in step 4), the task ids the tab holds unfinished (`ChatTab.unfinished`) and whether a turn runs (`turnRunning`, which reads `SessionLink.busy` too) and whether the last turn ended with a message queued behind it (remembered from `turnChanged`, so a `result` announced before the press still counts). A host call that throws here, or in the clear that follows, fails the stop closed: nothing is written, the messages return as in step 5, and none drains without a clear.

1. Deny: `PermissionFlow.refuse(true)` settles every open card and gated read as a denial, "The conversation is being cleared." (outcome "Stopped"), so a later answer finds nothing (an answer also names its card's `key`, so one for a denied card never settles a later card under the same request id), and denies every request that arrives until the clear is sent, with the same message, no card, in every mode.
2. `stop_task` for each known task in order, then `interrupt` whether or not a turn runs; the writes are not awaited and a refused write proves nothing. The 15 s timer (`STOP_MS`) is armed at the first stop.
3. A task has ended only at a `task_notification` of `stopped`, `completed` or `failed`, or a `task_updated` of `killed`, `completed` or `failed`, of this generation; an end is final. `ChatTab` keeps this as a ledger per process (`TaskLedger`, a `Map` by task id with what was last known of each task, so an omitted agent still counts as an agent; cleared when the process ends or an adopted Undo's CLI replaces it): a task stays unfinished when the run bar drops it at a notification whose status is no known end, and is finished at a terminal `task_updated` though the bar keeps its row. A task first seen meanwhile (`task_started`, a list, any other status) is stopped and waited for; a list that omits a task proves nothing. A turn that starts meanwhile is interrupted again; a message queued behind the turn that ended is waited for (a turn ends only when no earlier queued message is pending, R38) and its turn interrupted when it starts.
4. Nothing seems to run: after the handler of the turn's `result` (a restart it owed goes first) the flow takes one last look at the tab itself, in the same step as the clear it allows: the stop's own process must still be running with the generation the stop began with (a CLI exit ends the turn before it reports its close, so a quiet turn alone is no proof), and no turn, queued message or unfinished task may exist. If any does, it is stopped and waited for within the same 15 s. Otherwise the timer is cleared and `ClearFlow.request` runs the clear above, still with the cards denied; the refusal is lifted once the request is sent, and the sends are released once the clear settles.
5. The timer fires, the process exits or the last look finds it gone: the refusal is lifted, nothing is written, `declined("stop-failed")` returns the messages held behind the clear to the composer unsent and the tab shows "Could not stop every agent, so the context was not cleared."
6. Closing the tab disposes the machine; a second `/clear`, a typed `request` and an Undo are refused while a stop or its question is open. With no running process there is nothing to stop and the clear runs as for an idle tab.

A `/clear` submission (typed or replayed) is guarded from its first question to its hold or request (`enterClear`, `leaveClear`): a second one is refused meanwhile, though the tasks finish. A clear that throws after it began (a refused write) is dropped whole: state and session reset, so a later `/clear` works. A held `/clear` released over running tasks holds the sends, asks (`confirmStop`; "clear" when nothing runs any more, which takes the plain route: held while a turn runs, else sent) and, on "Cancel", returns the `/clear` and the messages behind it through `declined("cancelled")` with no note. A tab that is not shown holds them and asks when it is next shown; a question asked while another is open is answered no.

#### Undo of a clear

PRD-001.R38, ADR-018. The offer is derived from the stored messages, so a live tab and a reopened one agree (`undoOffer`, `state/segments`): the latest `clear` record, with no prompt, `/compact` or other message to Claude Code after it (a panel command, a `!` run and a fresh start are not one), and a session id that passes the grammar. It is disabled when `decide` says `foreign` for the tab's profile; `pending` counts as ready and is resolved on the press (a history scan, then `decide` again). `undoBlock` (`state/segments`) names what keeps the tab from starting an Undo or adopting its CLI: a clear still open (the divider offers no Undo until the CLI's answer to it has settled, and draws again when it does), a restore, a turn, agent or background task, the tab's CLI starting, or a mode or model pick waiting for the CLI (`SessionLink.pickPending`; a refusal arriving after the swap would leave the adopted CLI in another mode than the tab shows). The button is then disabled with the reason as its title (DES-003 Clear divider), and `ClearFlow.undo` does nothing while a block holds, another Undo runs, or there is no offer, or the session is foreign.

The press starts a second `ClaudeSession` through `SessionLink.startUndo`: the tab's profile and launch settings, `--resume <ended id>` and no fork, no prompt. `startUndo` first awaits every CLI the link already dropped (`closing`), so a stopping candidate never overlaps the next. Its gate consumes everything it says; its events do nothing for the tab until it is adopted. Of its MCP traffic only `initialize`, notifications and `tools/list` reach the vault server; every other message, `tools/call` included, gets a JSON-RPC error (`unadoptedMcp`, `mcp/replies`), and any permission request is denied. The reducer `reduceUndo` (`state/clear-operation`) runs one Undo: `begin` starts the CLI and arms 15 s; the CLI is asked `get_context_usage` once it runs (`ClaudeSession.probe`), which a process that resumed a session answers before any turn (V1); a reply with a total, a maximum and the categories list is a success (`replied`), anything else, an error result (`undoFailure`), the process ending, a CLI that cannot start, or the timer is `failed` and stops it. A stale run, timer or event is ignored, so a late reply never adopts a CLI that was stopped. Sends are held (`held`) from `begin` to the end.

On a success the tab adopts the CLI only if `mayAdopt` (`state/segments`) holds: no block (`undoBlock`, read again), the same conversation, the same latest clear with no message after it and the session still this device's, and the same launch generation as at the press (`SessionLink.launchGeneration`, bumped for every tab at once, before any relaunch awaits, when the launch settings or a profile's CLI really changed (`launchSignature`), so a CLI path, WSL or profile edit during the lookup, the start or the probe fails the Undo and opening Settings without a change does not); then `SessionLink.adoptUndo` also requires `launchKey` of the launch the tab would make now (profile, settings, mode, model, effort) equal to the one it started with. `SessionLink.adoptUndo` makes it the session (`ClaudeSession.adopt` gives it the id it resumed), gives it the tab's gate and events, resumes `resumeId` from it later, and disposes the one it replaces; its close is awaited before the next launch. The Undo then removes the `clear` record from the messages and stores the ended id as the conversation's session id in one step, removes the divider (the dimming follows the plan), shows the probe's context usage, lets Restore files return (`RestoreBranch.uncleared`), and saves the conversation at once, the sends staying held until that save has resolved, failed or 5 s have passed (the release touches only its own hold); the save starts before any message or Restore update, so none can skip it; a host call that throws is logged and the release still runs. While the sends are held, Compact is disabled (`compactAllowed`), so no second send is dropped. The file version falls back to 1 when no boundary record is left (`fileVersion`). The `/clear` command bubble stays. A failure stops the CLI, leaves the tab, divider and record as they were, and shows "Could not undo the clear." as an error row. Closing the tab stops the Undo's CLI without showing it.

### Restart on settings close

`AgentPanelSettingTab.hide()` calls `onLaunchSettingsChanged` in each view.

1. Every session is held (`holdAll`, which `ClaudeSession.hold` serves) before anything is awaited.
2. While the bypass setting is off, every tab leaves Bypass: a tab in Bypass (its pick, the mode its CLI reported, or its session's mode) switches to Ask as a pick (DES-004), and `ClaudeSession.leaveBypass` drops the bypass flag from its config, takes `default` as its mode when the tab was in Bypass, sends `set_permission_mode` to a CLI in the middle of a turn, and asks for a restart. The restart is held, so a send before the release restarts an idle session first and its turn runs on the replacement, without the flag.
3. For every tab with a session whose profile still exists: resolve the CLI again (a failed lookup counts as nothing resolved), then ask `relaunchOptions(settings, profile, cli, launchTarget)`. It returns null, so the tab keeps its process, if nothing resolved, if the session's launch target (path or WSL flag) differs from the resolved one, or if the profile's arguments are refused. Otherwise it returns the options a new session launches with: `settingsLaunchOptions(settings)` (`appendSystemPrompt` from `vaultInstructions`, `sdkMcpServers` from `enableObsidianMcp`, the bypass flag from `enableBypassMode`, so turning bypass on reaches the tab too) and the profile's arguments from `profileLaunchArgs`.
4. `setLaunchOptions` applies them; a session whose options differ (an empty value equals an absent one) asks for a restart.
5. The release restarts each session whose restart was asked for, once however many changes asked: after the current turn if one is running, resuming the same Claude Code session. A release that throws does not keep the other sessions held. A restart or spawn that happened first (a turn ending, a send during step 3, a send after the process exited) carried the whole config as it was then, so the release adds none; options that changed after it cost one more restart.

Applying on close rather than per change keeps typing in a field from restarting processes per keystroke.

## Architecture rules

Each rule is checkable by a dependency-cruiser `forbidden` rule or an ESLint `no-restricted-imports` rule; until one runs, review checks them.

| # | Rule |
| --- | --- |
| B1 | `protocol/*` imports only `protocol/*`, `timers`, `json` and `node:child_process` |
| B2 | `session` imports only `protocol/*` |
| B3 | `cli` imports only Node builtins |
| B4 | `protocol/*`, `session`, `cli`, `cli-args` never import `obsidian` |
| B5 | `protocol/client` is imported only by `session`, and by `cli-args` for `CMD_UNSAFE` and `isCmdShim`, so the settings tab refuses what the launch would |
| B6 | `session` is imported only by `src/tab/**` (`tab/session-link`; ADR-016 U3); the panel reaches the CLI only through `ClaudeSession`. `ClaudeSession.liveClient` hands the usage service the client typed as the narrower `UsageClient` |
| B7 | `node:child_process` is imported only by `protocol/client`, `bash` and `cli` |
| B8 | `spawn` with `shell: true` occurs only behind `cliSpawnSpec` (`bash` passes one argv element to an explicit shell with `shell` unset) |

## Data and security

- Untrusted input: every stdout line. Framing skips what is not a JSON object; unknown message types are ignored, unknown CLI control requests are refused, `tool_name` and the decision-reason fields are type-checked; other `can_use_tool` fields are passed to the view as received and rendered as text (DES-004).
- Command line: nothing the model writes reaches it. Sources are fixed flags, settings (path, extra arguments, model, effort, bypass flag), the CLI's own reports (session id, model list) and stored conversations. No shell parses an argument in any launch shape; the cmd shape refuses metacharacters; the reserved-flag refusal covers profile arguments.
- Stored values become flag values: `sessionId`, `model` and `effort` from a conversation file, and `model` and `effort` from `data.json`, are validated on read (DES-005) before they reach `--resume`, `--model` and `--effort`, so a tampered or synced file cannot inject a flag.
- In the WSL shape the CLI path is shell text with `$` left active, so a `$(...)` in a configured path runs in the distro's `sh`. The path comes from settings, device-local by default (ADR-008, ADR-009).
- `cliPath` and `extraArgs` decide what executes and how. Extra arguments can widen what Claude may do (`--allowedTools`, a permissive `--settings`).
- Environment: the child inherits `process.env` plus the checkpointing variable; an `ANTHROPIC_API_KEY` there makes the CLI bill that key. The plugin reads no credential.
- The handshake sends the vault instructions to the CLI as a system-prompt suffix; the setting is device-local by default (ADR-009).
- stderr: the last 40 lines of a failed process are shown in the tab and the first 500 characters of the message are stored in history, whatever they contain.
- Detection reads outside the vault: `existsSync` on composed paths, `where` or `which`, one WSL probe. Nothing is written there.
- Network: none; the process pipe is the only channel.
- Retention: the client keeps nothing on disk. Session files and file checkpoints are the CLI's, under `~/.claude/`.

## Rollout and rollback

- Settings migration at load: flat `cliPath` and `useWsl` (0.3.x) become one profile; missing launch options default to "Claude Code default". The legacy device-local key is read so CLI paths survive the rename (DES-005).
- CLI compatibility is by degradation, not by version check: an older CLI ignores `sdkMcpServers`, the vault tools do not appear and a Notice says so once (DES-006); an unknown control request is answered with an error and the caller shows a message or nothing; a reply without `models` or `commands` leaves the static model list and the `system/init` command names in use; a CLI without `rewind_files` makes the restore preview show its error (DES-004).
- Switches: `enableBypassMode` adds `--allow-dangerously-skip-permissions`; `enableObsidianMcp` adds `sdkMcpServers`; per-profile Chrome, sandbox and extra arguments. All are read when a tab's session is created and again on every settings close.
- Observability: the stderr tail on a failed exit and the error block in the tab. There is no protocol trace or debug log.
- Rollback: an earlier plugin version resumes the same CLI sessions, since they belong to the CLI. A version before profiles (0.3.x) does not read `cliProfiles`, so a configured path is lost on downgrade.

## Alternatives

ADR-001 and ADR-008 cover the client and launch alternatives. Design-level choices they do not:

- Effort change: asking the user to restart, against replacing the process silently. Replaced silently, because no `set_effort` request exists and `--effort` is spawn-time; the restart waits for the turn, swallows the stale close and warms the replacement up so the cost is not paid on the next send.
- Launch options, instructions, vault tools and bypass: applying each edit at once, against applying on settings close. On close, so typing in a field does not restart processes per keystroke.
- Settings that reach open conversations: only at session creation, against the settings-close restart. The restart, so a change reaches every open conversation without closing it.
- Spawning when a tab opens, against on first use: on first use, so a conversation the user has not started costs no process.
- A restart's replacement: spawned at once, against once the old process has closed. Once closed, so one process runs per conversation (PRD-001.R5); a send meanwhile waits for it, at most until the SIGKILL 3 s after the stop. Creating the replacement client at once and starting its process later was rejected: it would buffer writes and requests, change what `running` means to every caller, and miss config changes made during the wait.

## Verification

Tests are in `tests/`; all run without a CLI login or network.

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| PRD-001.R2 | `cli.test.mjs`: "pickLookupResult takes the first line on posix", "pickLookupResult skips npm's sh shim and prefers the .exe on Windows", "pickLookupResult falls back to the .cmd shim on Windows", "pickLookupResult returns null when Windows has no runnable match" | Probe order, candidate paths, WSL probe, timeouts, cache, saved WSL flag, Detect button |
| PRD-001.R3 | `settings-core.test.mjs`: "a fresh install gets one auto-detect profile", "existing profile arrays pass through untouched", "normalize repairs malformed profiles and a dangling default id", "normalize never aliases DEFAULT_SETTINGS' profile array", "profile lookups fall back sensibly", "legacy cliPath/useWsl migrate into a single profile", "profiles from before the launch options default them to the CLI's own", "PRD-001.R3: a profile pick before any session applies to the conversation", "PRD-001.R3: a profile pick stops a CLI only a panel command started, then applies", "PRD-001.R3: a conversation with a Claude Code session, running or ended, keeps its profile", "PRD-001.R3: a stored session on a profile this device lacks takes the pick until a session is live", "PRD-001.R3: the Notice for a kept profile names it and says how to use another", "a profile with no name is Unnamed, or Unnamed profile where it stands alone" | Profile UI; the four profile-segment pick cases |
| PRD-001.R39 (profiles) | None: the rows are DOM | The settings page: stacked profiles, "Use for new conversations", a missing native path and a WSL exit 127 each showing the banner, the alerts and the notice; Detect clearing them |
| PRD-001.R4 | `cli-args.test.mjs`, all 15 tests, among them "PRD-001.R4: a restart is skipped when the CLI no longer resolves or has moved", "PRD-001.R4: a restart is skipped when the profile's arguments cannot launch, with no option applied", "parseCliArgs rejects an unterminated quote", "flags the panel sets itself are refused, in either spelling", "Chrome flags point at the profile setting instead", "a .cmd shim refuses what cmd.exe would interpret" | Live error under the field, error at launch, restart on settings close |
| PRD-001.R5 | `protocol.test.mjs`: "spawn flags carry the documented stream-JSON interface", "optional spawn flags appear only when configured", "profile arguments are appended after the panel's own", "an unset permission mode leaves the CLI's own default", "an explicit default permission mode is passed", "the initialize handshake goes out before the first turn", "a user turn round-trips and the result arrives", "PRD-002.R13: every spawn turns the CLI's file checkpointing on", "PRD-002.R10: the bypass setting adds --allow-dangerously-skip-permissions", the `cliSpawnSpec` tests, the environment and `WSLENV` among them; `session.test.mjs`: "PRD-001.R5: a restart spawns the replacement once the old process has closed, and reports no end", "PRD-001.R5: a send while the Bypass process closes waits for the replacement, which has left Bypass", "PRD-001.R5: a warm-up, sends, a panel command and a Stop during the wait reach one replacement", "PRD-001.R5: a process that ignores SIGTERM holds the replacement back until its SIGKILL, no longer", "PRD-001.R5: a tab closed while the old process closes starts no replacement", "PRD-001.R5: the old process's late handshake reply does not reach the session", "PRD-001.R5: what the old process writes while it closes does not reach the session", "PRD-001.R5: a background task's Stop during the wait reaches the replacement", "PRD-001.R5: turns that waited for the replacement keep their order behind a pending rewind", "PRD-001.R5: a restore preview during the wait goes to the replacement, once", "PRD-001.R5: a panel command during the wait fails when the tab closes, and nothing spawns", "PRD-001.R5: a send right after the replacement started waits behind the turn queued for the rewind", "PRD-001.R5: a Stop right after the replacement started reaches it after the turn queued for the rewind", "PRD-001.R5: a prompt open when the CLI restarts is cancelled, and no answer is written to the old process", "PRD-001.R5: a prompt answered before a restart is not cancelled by it", "PRD-001.R5: a late answer from a replaced process leaves its successor's prompt with the same id open, so the next restart cancels it", "PRD-001.R5: of two prompts one process sent under one id, the one still open is cancelled at a restart after the other was answered", "PRD-001.R5: a panel command just before a restart starts no process while the old one closes". Required: `--replay-user-messages` and `--fork-session` when set; every `CMD_UNSAFE` character; one process for a double send | Stop of the wrapper shapes; one `claude` process per tab after an effort change and a send at once |
| PRD-001.R6 | `protocol.test.mjs`: "a crashed CLI surfaces its exit code and stderr tail", "NDJSON framing survives split lines and multiple objects per chunk", "control requests reject once the process is gone", "PRD-001.R6: lines that are not JSON objects, and a control_response without a response, are skipped and the rest of the chunk is processed" and "PRD-001.R6: a request is still answered when skipped lines share its chunk" (the `noise` scenario, which includes `control_request` lines without a `request` object), "PRD-001.R6: a multi-megabyte line split across chunks arrives whole, with the message after it" and "PRD-001.R6: a long line arriving in small chunks is not rescanned for every chunk". `session.test.mjs`: "PRD-001.R6: a replacement that cannot start ends the turn that waited for it, with the error", "PRD-001.R6: a replacement that cannot start ends the waiting turn even when the callbacks throw". Required: `session` tests for resume after exit and the resume-failure fallback | The four pre-process failure messages; stdin EPIPE |
| PRD-001.R25 (reach) | `session.test.mjs`: "PRD-001.R25: setLaunchOptions restarts the CLI only when an option changed", "PRD-001.R25: a session that has not started takes the options without spawning", "PRD-001.R25: turning bypass on reaches a running session with the flag", "PRD-001.R25: new vault instructions restart the CLI, whose handshake carries them", "PRD-001.R25: the vault-tools switch restarts the CLI, whose handshake registers or drops the server", "PRD-001.R25: empty instructions and an empty server list are the same as none", "PRD-001.R25: instructions changed mid-turn restart the CLI after the turn", "PRD-001.R25: a settings-close restart passes what a new conversation would get, once", "PRD-001.R25: leaving Bypass together with another launch change restarts the CLI once", "PRD-001.R25: a send while restarts are held runs on a process with the new launch options", "PRD-001.R25: a restart already due after the turn is not repeated when the hold is released", "PRD-001.R25: a process that exited during the hold is replaced by the send, not restarted again at release", "PRD-001.R25: a release that throws cannot leave the other sessions held", "PRD-001.R25: a send during the CLI lookups runs without Bypass, and unchanged options add no restart", "PRD-001.R25: a send during the CLI lookups runs without Bypass, and changed options add one restart", "PRD-001.R25: an owed restart is consumed before a throwing busy callback", "PRD-001.R4: a replacement process resumes the session its predecessor learned", "PRD-001.R25: a held session that changed nothing keeps its process, and a busy one restarts after its turn", "PRD-002.R10: leaving Bypass mid-turn switches the running CLI at once and restarts it after the turn"; `settings-core.test.mjs`: "PRD-001.R25: the settings decide the vault instructions, the vault tools and the bypass flag of a launch"; `cli-args.test.mjs`: "PRD-001.R25: a settings-close restart carries each option a new conversation launches with" | Instructions, vault tools and bypass reaching an open conversation on settings close |
| PRD-001.R26 | `protocol.test.mjs`: "cliSpawnSpec runs .cmd shims through the shell with quoting", "cliSpawnSpec always quotes a shim path, whitespace or not", "cliSpawnSpec refuses a shim path cmd.exe would interpret", "cliSpawnSpec leaves a WSL path's ~/ and $VARIABLE expansion but not command substitution", "cliSpawnSpec spawns .exe and posix binaries directly", "cliSpawnSpec runs WSL through --exec with the args out of any shell's reach", "cliSpawnSpec keeps a WSL CLI path one word that still expands ~ and $VARS", "cliSpawnSpec keeps empty args and trailing backslashes intact through a .cmd shim" | A real launch per platform |
| PRD-001.R11, R18, R22, R23 (protocol side) | `session.test.mjs`: the seven PRD-001.R22 tests (a rejected model is not kept, an accepted one reaches the next spawn, no process, picks in flight, a switch in flight when the process is replaced, a refusal after replacement, an old process's answer after a newer pick), the PRD-002.R8 and PRD-002.R10 tests for a mode switch across a replacement, a newer pick during the wait among them; `protocol.test.mjs`: "PRD-001.R22: a refusal with no text of its own still says something". Required: `session` tests for `interrupt` and `stop_task` on a running process | Each against a real CLI; the model rollback with two picks in flight, with another tab's pick since, and with the tab closed meanwhile |
| PRD-001.R38 (core), PRD-003.R1, ADR-018 Decision 1 | `state-clear-operation.test.mjs` (every clause of the machine: the commit, the consumed result, a stray result, both 15 s timeouts, the CLI's own turn pausing the first, an exit before and after the commit, stale generations and timers); `tab-clear-flow.test.mjs` (the flow over fakes and over a real session against the fake CLI's `FAKE_CLI_CLEAR` modes); `session.test.mjs` ("writeClear sets no busy, and the gate sees the reset, the new session and the zero result first", "the gate hears a process end", the effective mode and model, `reapply`); the re-apply clauses in the same machine and flow tests, with `FAKE_CLI_CLEAR_RESETS`; `state-boundary-records.test.mjs` (`clearDue`) | A clear against a real CLI |
| PRD-001.R20, R21 (protocol side) | Required: `ClaudeSession.control` starts a process without a turn | The 60 s timeout |
| `rewind_files` transport (ADR-006) | `protocol.test.mjs` against the `rewind` scenario of `tests/fake-cli.mjs`: "PRD-002.R14: a restore preview sends rewind_files as a dry run and parses the reply" and the three tests after it | Against a real CLI, native and WSL |

Transport evidence for other PRDs, in `protocol.test.mjs`: permission round trip ("a permission request reaches the callback and the decision goes back", "a denial is reported as a denial", "a cancelled permission notifies the view and is answered with silence", the PRD-002.R9 decision-reason tests, among them "PRD-002.R9: decision-reason fields of the wrong type are dropped, and the flags among them named", "PRD-002.R9: decision-reason fields sent as null count as absent", "PRD-002.R9: a permission request carries an organization's MCP ask ceiling"); MCP ("sdkMcpServers is registered on the initialize handshake", "no sdkMcpServers field is sent when none are configured", "mcp_message is routed to the handler and its reply wrapped for the CLI", "a client with no MCP handler refuses mcp_message rather than hanging", "a handler that throws surfaces as a control-response error"); context usage normalization (four tests on the "(deferred)" marker and malformed categories, and "PRD-005.R8: getContextUsage keeps the model, the autocompact point and each category's kind when typed").

Independent verification boundary: the process boundary. `protocol.test.mjs` drives the real `ClaudeClient` over real pipes against `tests/fake-cli.mjs`, a separate process scripted by `FAKE_CLI_SCENARIO` that reports its own argv, environment and what it received; CI runs it under `make verify`. `session` is Obsidian-free and bundled for tests (DES-001 A12). The view wiring, detection, and any behaviour of a real CLI are verified by a person (a real-CLI test needs human approval under the constitution).

## Open questions

None.
