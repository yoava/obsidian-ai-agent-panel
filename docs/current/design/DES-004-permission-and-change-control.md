# DES-004 — Permission and change control

**Status:** accepted (2026-10-10)

## Requirements

Designs [PRD-002](../../current/product/PRD-002-permissions-and-change-control.md), R1 to R17.

| ID | Capability | Section below |
| --- | --- | --- |
| PRD-002.R1 | Permission card | Permission round trip, Card contract |
| PRD-002.R2 | Always allow | Card contract |
| PRD-002.R3 | Withdrawn, orphaned and unsupported requests | Permission round trip, Failure handling |
| PRD-002.R4 | Proposed edit diff | Edit planning, Diff sources |
| PRD-002.R5 | Diff display | Diff engine and view |
| PRD-002.R6 | Edit outcome on the step row | Diff sources, Permission round trip |
| PRD-002.R7 | Changes this conversation | Change list |
| PRD-002.R8 | Permission modes | Permission modes, Mode state |
| PRD-002.R9 | Auto-approve | Permission round trip, Permission modes, Mode state |
| PRD-002.R10 | Bypass | Permission modes, Mode state |
| PRD-002.R11 | Truthful mode display | Mode state |
| PRD-002.R12 | AskUserQuestion form | AskUserQuestion form |
| PRD-002.R13 | File checkpoints | Turn record |
| PRD-002.R14 | Restore files | Restore |
| PRD-002.R15 | Branch from here | Branch |
| PRD-002.R16 | `!` shell escape | Shell escape |
| PRD-002.R17 | Plan approval | Card contract |

Manual verification obligations, in a desktop vault against a real Claude Code CLI:

- R1, R2, R3 (process exit), R12, R17: the card, the form, the plan on the card, and their settled labels.
- R4 to R7: diffs on the card and in a step row's details, its `+x -y`, the Rendered toggle, the first draw of a 4,000-row diff, closing its card mid-draw, gap expansion on a large file, the row-cut row, the change list with a subagent edit in Ask and in Accept edits, Bypass or under an allow rule.
- R8 to R11: the permission popover, switching and rollback, Auto-approve with a rule-flagged request and with a safety check (`ls &`), the reopen confirmation, the bypass gate, the mode shown before and after the CLI reports one.
- R13 to R15: the restore preview, dialog and result, native and WSL; restore in a reopened conversation; a branch that continues from before the chosen turn.
- R16: the Shell card and "Add output to chat" on each platform shell.

## Context and constraints

- Component map and layers: [DES-001](../../current/design/DES-001-system-overview.md). Spawn flags and environment, control-request transport and timeouts, session respawn, fork and rewind on the session side: [DES-002](../../current/design/DES-002-cli-client-and-session-lifecycle.md). Activity cards, waiting indicators and the turn footer: [DES-003](DES-003-panel-ui.md). Markdown passes the [rendering boundary](../../current/design/DES-001-system-overview.md#rendering-boundary).
- Fixed by ADRs: the permission model ([ADR-002](../../current/adr/ADR-002-permission-prompts-cli-decides-panel-asks.md)), restore through the CLI's file checkpoints and branching ([ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md)), the `!` escape ([ADR-011](../../current/adr/ADR-011-user-shell-escape-outside-agent-permissions.md)), which settings sync ([ADR-009](../../current/adr/ADR-009-synced-and-device-local-settings.md)), an own diff instead of a library ([ADR-007](../../current/adr/ADR-007-runtime-dependencies.md)).
- Claude Code decides which tool calls need consent: hooks, deny rules, `ask` rules, the mode, then allow rules. The panel sees only the `can_use_tool` requests that remain, so consent covers what the CLI submits and nothing else.
- Claude Code snapshots a file before its Edit, Write or NotebookEdit writes it, keyed to the user message that started the turn, while `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true` (DES-002). It does not track Bash, subagent edits other than a foreground forked skill's, vault tools, linked files or directories, and rewinds to a point, never one turn alone.

Modules:

| Module | Job here | Imports `obsidian` |
| --- | --- | --- |
| `protocol/client` | Parse `can_use_tool` and `control_cancel_request`; write the decision; `rewind_files` | no |
| `settings-core` | `ChatPermissionMode`, `cliPermissionMode`, default-mode validation, `permissionDecision`, `reopenMode` | no |
| `session` | `setPermissionMode`, `adoptPermissionMode`, `rewindOnStart`, the fork flag, `control`, `rewindFiles` | no |
| `restore` | Which turn records offer Restore files, when the button shows, which turn "Restore to before turn N" runs, the result Notice | no |
| `state/branch-history` | The latest prompt a branch's rewind names (`latestPrompt`); the branch still to make (`pendingBranch`) and the record that holds it (`branchRecord`) | no |
| `state/branch-hold` | A branch's rewind held until a rewind succeeds, given once to each session the tab creates (`BranchHold`) | no |
| `state/branch-failure` | A failed branch's error text (`branchFailureText`) | no |
| `state/session-id` | The session-id grammar a stored branch's ids must pass (`isSessionId`) | no |
| `edits` | What an edit tool call would do to a file; CLI path to vault path | no |
| `edit-tracker` | Pre-edit reads per tool-use id, main agent and subagents; which results reach the change list; the change list and its counts | no |
| `diff` | Bounded line and word diff | no |
| `tool-labels` | Card title for a vault tool; summary line; AskUserQuestion input parse; the ExitPlanMode plan; the Full input preview (`jsonPreview`) | no |
| `inert-markdown` | The plan on the card, the Rendered toggle | no |
| `state/permission` | A card's content from its request; the card and form machine (`cardStep`) and the answer each step gives; outcome labels; the form's selections, title, count and answers | no |
| `tab/permission-flow` | One tab's prompts: the decision for each request, the pending set, the answers from cards and forms, a withdrawn request, the process ending | no |
| `ui/permission-card`, `ui/question-form` | The card and the form, drawn from the messages model; their buttons are intents to the flow | yes |
| `diffview` | Diff DOM; restore-confirm and changes modals | yes |
| `bash` | `!` invocation shape, run, chat formatting | no |
| `tab/edit-tracker` | One tab's pre-edit reads and change list, the vault reads behind them; fires `changes` | yes |
| `tab/restore-branch` | One tab's Restore files and Branch: the offered turns, preview, confirmation, rewind, what a branch takes | yes |
| `view` | Wires each tab's flow, `!` escape and restore and branch; mode wiring; opens the branch tab | yes |

Untrusted inputs:

| Input | Source | Handling |
| --- | --- | --- |
| `can_use_tool` fields (tool name, input, title, description, suggestions, decision reason) | CLI, carrying model-chosen content | DOM text nodes only, except the ExitPlanMode plan, which passes the rendering boundary; a title or description that is not a string is not shown; input JSON capped at 2000 characters; a non-string tool name becomes `unknown` and is named in `mistypedFlags`; `decision_reason_type`, `decision_reason_code`, `classifier_approvable`, `matched_ask_rule` (an object, kept only as present) and `requires_user_interaction` type-checked: null counts as absent, and any other wrong type is named in `mistypedFlags`, which flags the request |
| File paths in tool input and in `rewind_files` replies | model, CLI | `vaultRelativePath` resolves `.` and `..` first; a path outside the vault root is not read |
| Stored `permissionMode` | conversation file | `reopenMode` (Mode state) |
| Stored `defaultPermissionMode` | settings | validated on load (Mode state) |
| `!` command | the user's keystrokes | one argv element to a shell |

## Proposed design

### Permission round trip

1. Every spawn passes `--permission-prompt-tool stdio`. Claude Code sends `control_request` with `subtype: "can_use_tool"` for each call that still needs a decision, and waits.
2. `ClaudeClient.handleControlRequest` builds a `PermissionRequest`: `requestId`, `toolName`, `input` (default `{}`), `suggestions` (from `permission_suggestions`), `title`, `description`, `toolUseId`, `agentId`, `decisionReasonType`, `decisionReason`, `decisionReasonCode`, `classifierApprovable`, `matchedAskRule`, `requiresUserInteraction`, `mistypedFlags`.
3. `ClaudeSession` hands it to the tab's `PermissionFlow.request` (`tab/permission-flow`). A request whose id already waits for an answer (a card, a form, or an Auto-approve edit waiting for its pre-edit read) is denied first, and the one waiting is answered as a denial too, its card or form settling "Cancelled", so both answers written under that id agree (PRD-002.R3); Claude Code sends none. Otherwise the flow takes `permissionDecision(mode, req, {questionForm, isEdit})`, first match wins:
   1. `AskUserQuestion` whose input parses as questions: the form.
   2. Tab mode `auto`, and the request is not flagged: allow at once, with no card. Flagged (`permissionDecision`): a `decisionReasonType` outside `AUTO_APPROVE_REASON_TYPES` (`mode`, `subcommandResults`, `workingDir`, `classifier`, `asyncAgent`, `permissionPromptTool`, `other`), so `rule`, `hook`, `safetyCheck`, `sandboxOverride` and an unknown value; `classifierApprovable` set, which Claude Code does only when one of its safety checks is in the reason, nested in a compound command's `subcommandResults` included; `matchedAskRule`, an ask rule reported beside the tool's own reason type; `decisionReasonCode` `org_ask_ceiling`; `requiresUserInteraction` true; a non-empty `mistypedFlags`; an input whose `dangerouslyDisableSandbox` is `true` (`asksSandboxOff`), whatever reason came with it; and an AskUserQuestion that missed step 3.1. A request with no `decisionReasonType` and none of these is not flagged ([values](../../records/verification/2026-10-11-decision-reason-types.md)); a CLI from before the reason fields therefore flags nothing but the sandbox escape, and Auto-approve answers the rest. For Edit, Write and MultiEdit the allow waits for that call's pre-edit read (Diff sources), started at `tool_use`, or started from the request's input when that block has not arrived.
   3. Otherwise: a card. The flow keeps the pending set by request id and gives each card a key of its own, since a new process numbers its requests afresh; the card is an item of the tab's messages model (`ChatTab.addCard`, `setCard`), in the running turn, else at the end, and each event passes `state/permission`'s machine (`cardStep`), which settles a card once. For Edit, Write and MultiEdit the card's diff is the call's pre-edit read. In Auto-approve (a flagged request) Allow and Always allow answer once that read settled, at most 5 s, and disable the buttons while they wait; in every other mode they answer at once (PRD-002.R1). Deny answers at once. An answer goes to the CLI before the card is redrawn, and a redraw that fails cannot hold it.
4. The client writes `control_response` with `subtype: "success"` and the `PermissionResult`. A rejected callback is written as `subtype: "error"`. If the CLI cancelled the request in the meantime, nothing is written.
5. `mcp_message` requests go to the vault tools ([DES-006](DES-006-vault-tools.md)). Any other CLI-initiated subtype is answered with the error `Unsupported control request: <subtype>`.

`PermissionResult` is `{behavior: "allow", updatedInput, updatedPermissions?}` or `{behavior: "deny", message}`. The panel returns the input unchanged, except that an answered AskUserQuestion gains `answers`. Decisions are recorded nowhere.

### Card contract

| Part | Content | Bound |
| --- | --- | --- |
| Title | The vault-tool sentence (`obsidianToolPrompt`, DES-006), else the CLI's `title`, else `Allow <tool>?` | - |
| Description | The CLI's `description`, when present | - |
| Summary | `summarizeToolInput`: the first non-empty of `file_path`, `path`, `notebook_path`; `command`; `pattern`; `url`; `description`, `prompt`, `query`; for a vault tool, the one argument its card names and nothing else (DES-006): `path`, `query` for `obsidian_search`, none for `obsidian_active` | 96 characters |
| Plan | ExitPlanMode only: the input's `plan` (`planOf`), whole, rendered as Markdown through the rendering boundary (`renderMarkdown`), as pre-wrapped plain text when rendering fails; a placeholder ("Rendering the plan…") shows meanwhile; above Full input | none |
| Diff | Edit, Write and MultiEdit only; see Diff sources | diff bounds |
| Full input | Collapsed JSON of the input | 2000 characters |
| Buttons | Deny; Always allow, only when `permission_suggestions` is non-empty; Allow | - |

| Event | Result returned | Card label |
| --- | --- | --- |
| Allow | allow, input unchanged; for an edit in Auto-approve, after its pre-edit read (at most 5 s) | Allowed |
| Always allow | allow, input unchanged, `updatedPermissions` = the CLI's suggestions as received; for an edit in Auto-approve, after its pre-edit read (at most 5 s) | Always allowed |
| Deny | deny, "The user denied this action in Obsidian." | Denied |
| CLI cancels (`control_cancel_request`) | none written | Cancelled |
| CLI process ends | none deliverable | Session ended |
| Stop and clear (PRD-001.R38) | deny, "The conversation is being cleared.", written to the live process | Stopped |

A settled card shows its label in place of its buttons and drops its waiting highlight (DES-003 machine). While a tab has a pending card or form it is in the waiting state (DES-003), and closing it asks for confirmation first (PRD-001.R7). The panel keeps no permission rules of its own; Always allow rules are written by Claude Code into its own configuration.

### AskUserQuestion form

- Valid shape (`parseAskUserQuestions`): a non-empty `questions` array; each entry has a string `question` and a non-empty `options` array whose entries have a string `label`. `header`, `multiSelect` and option `description` are optional. Any other shape gets a card (step 3.3), in Auto-approve too.
- Title "Claude has a question", or "Claude has questions" with several; "N of M answered" while it waits.
- Per question: header chip, question text, options as radio (single-select) or checkbox (multi-select) cards with descriptions, "Select all that apply" for multi-select, a free-text Other field.
- Single-select keeps at most one answer: picking an option clears the Other text and typing Other text that is not blank clears the option.
- Submit stays disabled until every question has an option or Other text.
- Submit returns allow with `updatedInput = {...input, answers}`, where `answers[<question text>]` is the chosen labels, in option order, and the trimmed Other text joined by `", "`. The form is labelled `Answered:` followed by the answers joined by `" · "`, in place of its buttons, its questions disabled.
- Dismiss returns deny with "The user dismissed the question without answering." and the label Dismissed.
- The form is shown in every mode, Auto-approve included.

### Permission modes

| Popover label | Value | Mode sent to the CLI | Who answers a request | Offered |
| --- | --- | --- | --- | --- |
| Ask before acting | `default` | `default` | the user, on a card | always |
| Accept edits | `acceptEdits` | `acceptEdits` | the user, for what the CLI still asks | always |
| Plan (read-only) | `plan` | `plan` | the user | always |
| Auto-approve everything | `auto` | `default` | the panel: allow, no card, except a request the CLI flags (step 3.2) | always; warning style |
| Bypass permissions | `bypassPermissions` | `bypassPermissions` | the CLI; what still reaches the panel gets a card | only while `enableBypassMode` is on; warning style |

- `auto` exists only in the panel. `cliPermissionMode` maps it to `default` for `--permission-mode` and `set_permission_mode`, so Claude Code's rules and hooks still run first. Every tool call still draws its activity card.
- The setting "Default permission mode" (`defaultPermissionMode`) offers Claude Code default (`default`), Accept edits, Plan and Auto-approve everything. It does not offer Bypass. It is in the `permissionMode` sync unit, device-local by default.
- `enableBypassMode` (the `bypass` unit, device-local by default) adds Bypass to the permission popover and makes every session whose launch config is built while it is on pass `--allow-dangerously-skip-permissions`; a change reaches open conversations when the settings tab closes (DES-002).
- A tab in `auto` or `bypassPermissions` shows its mode control in the warning color with a zap or shield-off icon and the short label Auto or Bypass; both popover entries carry a warning sign.
- Modes the CLI can report but the popover does not offer are shown as reported: `dontAsk` as "Don't ask (deny what isn't allowed)", the CLI's own `auto` as "Auto mode (Claude Code decides)", anything else by its raw name.
- Mode table (PRD-002.R8): `MODE_TABLE` in `settings-core` holds each offered mode's icon, short and long strings, hover text and warning flag, `CLI_ONLY_MODES` the reported-only modes, `inheritedModeEntry` the inherited rows; the status line's permission segment, the permission popover, the settings tab and `/status` read them.
- Permission popover ("Permissions", DES-003): `offeredModes(enableBypassMode)` as a radio group of icons and long strings, the warning modes in red, the mode `shownMode` gives checked (none for a reported-only mode). Picking the checked mode does nothing, except while inheriting, where it pins that mode as a pick (`pickPermissionMode`).

### Mode state

Each tab holds `selectedMode`, `inheritMode` (launch without `--permission-mode`) and `cliMode` (the last mode the CLI reported, or null).

| Event | Effect |
| --- | --- |
| Settings load | A `defaultPermissionMode` other than `default`, `acceptEdits`, `plan` or `auto` becomes `default` (`normalizeSettings`). |
| New tab (`addTab`) | `selectedMode` = `defaultPermissionMode`; `inheritMode` is true when that is `default`. |
| CLI launch (`createSession`) | `--permission-mode` is omitted while `inheritMode`, else `cliPermissionMode(selectedMode)`. Without the flag the CLI starts in its own `permissions.defaultMode`. |
| User pick (`pickPermissionMode`) | Set `selectedMode`, clear `inheritMode` and `cliMode`, send `set_permission_mode` (15 s) to a running CLI. The CLI answers in order, so the last switch it accepted is its mode: on success the session keeps the mode for later launches and the conversation stores `permissionMode` and `permissionModePicked: true`, also for an earlier pick answered while a newer one waits. On error or timeout of the latest pick the three fields go back to the mode the CLI last accepted (`confirmedMode`, kept while picks are pending), not to an earlier pick still waiting, and a Notice reads `Could not switch mode: <error>`; a refused earlier pick changes nothing. A switch sent before leaving Bypass is dropped when its answer arrives (a generation count on the session, `leftBypassAt`, and on the tab): the session does not keep it, the conversation does not store it, and a refusal shows no Notice. Picking the mode already shown while inheriting pins it as a pick. |
| CLI reports a mode (`noteCliMode`) | Sources: the initialize reply's `current_permission_mode`, `system/init` and `system/status` (`permissionMode`). Ignored while `selectedMode` is `auto`. Sets `cliMode`; a mode the popover offers also becomes `selectedMode`. |
| CLI switches by itself (`system/status`) | As above. When the new mode is one the popover offers, `inheritMode` is also cleared and `ClaudeSession.adoptPermissionMode` makes later launches of that session pass it; for `dontAsk` or the CLI's own `auto` only `cliMode` changes. The conversation file keeps the user's last pick. |
| Initialize reply after a pick | The reply is dropped when the session's mode no longer equals the mode it was spawned with. |
| CLI launched without a mode reports one | Stored per profile in `cliStartupModes` (device-local, [DES-005](DES-005-persistence-and-sync.md)). |
| Conversation created (`ensureConversation`) | Stores `permissionMode` (`default` while inheriting) and `permissionModePicked` (absent while inheriting). |
| Conversation reopened (`reopenMode`) | A stored value other than the five offered values is ignored. `bypassPermissions` applies only while the bypass setting is on. `auto` applies only after the user confirms it in a dialog (`ConfirmModal`), asked when the conversation is reopened, or for a tab restored at view open when that tab is first shown; no dialog when the tab is already in `auto`. Confirming is a pick of `auto`; keeping changes neither the tab nor the file, so the next reopen asks again. Anything not applied leaves the tab's `selectedMode` and `inheritMode` as they were. A stored mode that applies sets `inheritMode` = `permissionModePicked` is not `true` and the mode is `default`. |
| A clear (PRD-001.R38) | A clear never loosens the permission mode ([DES-002](DES-002-cli-client-and-session-lifecycle.md) Clear transaction, Re-applied picks). The panel's `auto` stays, since it is no CLI mode, and a mode status after the reset is not adopted. |
| Bypass setting off at a settings-close restart | A tab in Bypass (its pick, its `cliMode` or its session's mode) switches to Ask before acting as a pick, and every tab's session drops the bypass flag, before the skips of DES-002's restart. |
| Branch | Copies `selectedMode` and `inheritMode` from the source tab. |

Display (`shownMode`), first match wins:

1. `selectedMode` is `auto`: Auto.
2. `cliMode` is known: that mode.
3. `inheritMode`: the profile's `cliStartupModes` entry, labelled "... · Claude Code's default when it last started"; with no entry, "Claude Code default (set in its settings)", short label Default.
4. Otherwise the pick.

### Edit planning

`src/edits.ts`:

- `isEditTool`: `Edit`, `Write`, `MultiEdit`.
- `editTargetPath(input)`: `file_path`, else `path`, else `notebook_path`, when a non-empty string.
- `vaultRelativePath(reported, vaultRoot, ignoreCase)`: the root's form decides the path's: under a drive or UNC root `\` and `/` both separate, under a POSIX root a path containing `\` is refused. Empty and `.` segments drop and `..` removes the segment before it, but never the anchor: `/`, a drive (`C:/`), or `//host/share/`, which needs both host and share; `..` at an anchor stays there. Refused: a relative path that climbs out or starts at `~`, a segment of only dots and spaces, a drive with no separator after it, a UNC host of `?` or `.`. An absolute path must match the resolved root's anchor and every segment, exactly, or with `ignoreCase` (`namesIgnoreCase`: Windows and macOS) after upper-casing each character where that gives one character that lower-cases back, names of different lengths failing first, and with `ignoreForm` (`namesIgnoreForm`: macOS only, where HFS+ stores NFD and APFS compares the forms as one, so the root Obsidian holds and the CLI's spelling of it may differ in form) after NFC normalization of both names; NTFS and ext4 tell the forms apart, so Windows and Linux compare code points. The segments returned keep the reported form. The path is taken as reported, surrounding whitespace included: a leading space makes a relative path through a folder named by that space, which the dots-and-spaces rule refuses, so it is never shown as the vault's own file. The root itself and anything else return null. The case rule follows the platform, not the volume: a case-sensitive volume, such as a WSL ext4 vault opened as `\\wsl.localhost\...` or case-sensitive APFS, can over-match.
- `planEdit(name, input, before)` returns `{path, before, after, scope, creates, note?}` or null. `before` is the file's text, null when the file is missing, or `{ unreadable: true }` when it exists but cannot be read, so the two cases render differently.

| Call | Plan |
| --- | --- |
| Write | Whole-file replacement by `content` (empty string when absent); `creates` when `before` is null |
| Edit | Literal replacement of the first match of `old_string`, or of every match with `replace_all` |
| MultiEdit | Its `edits` applied in order to the running text; malformed entries dropped |
| Edit with an empty `old_string`, file missing | Create with `new_string` |
| Edit or MultiEdit, file missing or unreadable | `scope: "fragment"`: the tool's own old and new strings, with the note "The file could not be read, so this shows only the replaced text." |
| Write, file exists but unreadable | `scope: "whole"`: the proposed contents, with the note `<path> exists but could not be read.` instead of a diff against an empty file (PRD-002.R4) |
| Nothing matched | `scope: "fragment"` with a note that the text was not found |
| Some MultiEdit entries matched | Whole-file plan of what applied, with the note `N of M replacements did not match the current file.` |
| No usable edit, no path, or another tool | null |

### Diff engine and view

`diffText(old, new, options)` in `src/diff.ts` returns `{rows, added, removed, unchanged, coarse, truncated}`:

1. Split into lines on CRLF, CR or LF; a trailing newline adds no line.
2. Trim the common prefix and suffix.
3. Run a line LCS on the middle. Past the cell budget the middle is one block of removals then additions, and `coarse` is set.
4. Inside each changed block removals precede additions.
5. Word refinement, skipped for coarse diffs: removal k of a block is paired with addition k; tokens are words, whitespace runs and single punctuation characters; a pair is refined only when the shared characters are at least 0.34 of the longer line.
6. Keep `context` lines around each change (3 unless the caller sets a number) and collapse the rest into gap rows carrying their line count and the first line they hide on each side; a gap of one line keeps the line.
7. Cap the rows; past the cap `truncated` is set and a final `cut` row carries the number of rows dropped.

| Bound | Value | Past it |
| --- | --- | --- |
| LCS cells (old middle lines x new middle lines) | 1,000,000 | coarse block, with the note "Too large to align line by line - shown as a wholesale replacement." |
| Line length for word refinement | 400 characters | that pair stays whole-line |
| Rows | 4000 | rows are cut and a final row reads `N more rows not shown` |
| Rows shown by expanding one gap | 20,000 | the rest of that gap stays a gap row |

`renderFileDiff(container, before, after, options)` in `src/diffview.ts` draws:

- A header, when the diff has changes or a note: `+N`, `-N`, a badge ("new file", "excerpt") and the Rendered toggle. "no change" appears only beside a note; an unchanged diff without one draws no header.
- An optional note line.
- Rows with old and new line numbers (hidden for fragment diffs), a `+`, `-` or blank sign, and highlighted changed words. The first chunk of rows (at most 500, or about 50,000 characters of row text) is drawn before `renderFileDiff` returns, so a short diff is on the page at once. The rest arrives a chunk per animation frame of the container's own window (`drawRows`, the helper gap expansion shares), and drawing stops when the diff leaves the page, as when a card is removed, a view closes or the container is emptied to draw it again. A diff attached to the page after its first frame keeps only its first chunk, so callers attach the container before rendering. The returned `FileDiff` is complete before the DOM is. Each diff draws at most one chunk per task, which holds the 100 ms bound per diff (PRD-001.R29); diffs drawing in the same frame add up, as in the changes list, which draws every file's diff at once.
- Gap rows as buttons labelled `N unchanged lines`. A click replaces that gap row with its hidden lines, taken from the texts by line range with no re-diff, appended through the same chunks (`drawRows`).
- The cut row `N more rows not shown`, styled apart from a gap row and not clickable.
- Rendered: Before and After panes built once from the rows of the first draw (gap and cut rows excluded), drawn through the `renderMarkdown` callback the view supplies, which passes the rendering boundary; "(nothing)" for an empty side, plain text if rendering fails. The restore and changes modals pass no callback and so have no toggle.

`diffview.ts` also exports `RestoreConfirmModal`, `SessionChangesModal` and `changeTotals`.

### Diff sources

| Moment | Before | After |
| --- | --- | --- |
| Permission card (`ui/permission-card`) | The call's pre-edit read; "Reading the file…" until it arrives, also after the card settled; nothing when it fails | `planEdit` applied to it |
| Step row's details while the tool runs, and until the file is read again after it | none | `planEdit` on the tool input alone |
| After a successful `tool_result` (`landEdit` in `state/step-groups`) | The pre-image read at `tool_use` | The file re-read from disk; `+x -y` (`editCounts`, the same diff) goes on the step row and into history |
| After a failed `tool_result` | - | The raw result stays in the row's details; no `+x -y` |
| Path outside the vault | The tool's own strings | The tool's own strings; the permission card adds `<path> is outside this vault.` |
| Reopened conversation | The stored tool input | The stored tool input, with the stored `+x -y` |

The pre-image read starts when an `assistant` message announces an Edit, Write or MultiEdit `tool_use`, from the main agent or a subagent (`EditTracker.noteAssistant`, called for every `assistant` message), and is kept per tool-use id until its `tool_result` (`noteResults`), or until the process exits or a deliberate restart replaces it (`clear`, on the session's `onRestarted`). An edit's card shows it, or a read started from the request's input and kept the same way when the `tool_use` has not arrived; a later `tool_use` for that id reuses the request's read, and a request naming another file than the kept read (a hook's `updatedInput`) starts a fresh one in its place (`readFor`). The diff and the step row's `+x -y` wait for the read however long it takes. In Auto-approve the permission answer, with or without a card, waits for it too, but at most 5 s (`withDeadline`): the answer then goes ahead as if the read had failed, and a late result does not hold it, though its diff may then show the edited file; in Accept edits, Bypass and under allow rules no request reaches the panel, so the CLI can write first and the diff then shows the already-edited file.

### Change list

- The tab's change list (`ChangeList` in `edit-tracker`, held by `tab/edit-tracker`) maps a vault path to `{before, after, created, edits}`. `noteResults` hands it each successful Edit, Write or MultiEdit of a vault file that exists afterwards, from the main agent or a subagent: `before` is kept from the first edit, `after` is replaced. A read that lands after the write (Accept edits, Bypass, allow rules) is recorded with `before` equal to `after`: the file is not counted or listed until a later edit changes it, and that first edit is missing from its net diff.
- Each entry's net lines added and removed are counted with `diffText` once per change to it; every total (`changeTotals`, `edit-tracker`) sums those counts and computes no diff. The changes chip (DES-003 Header and changes bar) shows `N files +x -y` from those counts; files with no net change are not counted or listed. It opens the changed-files popover: one row per file with its `+x -y` and "new" for a created file, opening the file (Notice `Note not found: <path>` when it is gone); "Review changes"; "Restore to before turn N" ([Restore](#restore)).
- "Review changes" opens `SessionChangesModal`: one collapsible section per file with its `+x -y` from the list's counts, a "new" tag for created files, the file name as a link (Notice `Note not found: <path>` when it is gone); a file's diff is computed and drawn when its section first opens, so opening the modal computes no diff (PRD-001.R29).
- After a restore, each listed path inside the vault is re-read: `after` becomes the disk text, or the entry is dropped when the file is gone.
- The list is memory only: empty after a reopen or a reload.
- Not listed: files outside the vault, changes by Bash, NotebookEdit, the vault tools or any tool other than Edit, Write and MultiEdit.

### Turn record

At each turn's `result` the view writes the turn's `meta` record (DES-005) with:

| Field | Value |
| --- | --- |
| `rewindUuid` | The turn's user-message uuid: `noteTurnUuid` keeps the first top-level `user` echo of the turn that has a `uuid` and no `tool_result` block (every spawn passes `--replay-user-messages`); it and `edited` reset at each `result`, so a turn started from a queued message does not inherit them |
| `lastPromptUuid` | The turn's last such echo when it is not the first: a prompt queued or steered into the turn. Also on the record of a turn that ends without a `result` (DES-005), with the tab's session id as `sessionId`; Branch reads it |
| `sessionId` | The `session_id` of that `result` |
| `profileId` | The profile of the session that ran the turn |
| `edited` | The main agent called Edit, Write, MultiEdit or NotebookEdit in the turn (`parent_tool_use_id` null) |

The plugin keeps no file contents ([ADR-006](../../current/adr/ADR-006-turn-checkpoints-and-branching.md)). On load `main` removes a legacy `<plugin dir>/checkpoints/` folder (DES-001). A `meta` record without these fields offers no restore.

### Restore

1. Offer: a finished turn's footer gets "Restore files" when its record has `rewindUuid` (read from a file only as a lowercase UUID, DES-005), `sessionId`, `profileId` and `edited`. The button is hidden while the record's session id is not the tab's (its live session's, else the conversation's stored one, which counts only if this device recorded it, ADR-018) or its profile is not the tab's session profile, and disabled while a turn or a restore runs in the tab. It is also hidden on a turn that a clear record follows (PRD-002.R14, `turnRestore`); it shows again if an Undo removes the clear (ADR-018). While the change list lists a file, the changed-files popover offers "Restore to before turn N" (PRD-002.R18), titled with what it rewinds, for the earliest turn whose button shows, N being the prompt that opened it (DES-003 Header and changes bar); it is disabled when that button is, and pressing it presses that button.
2. Click: the tab refuses sends until the restore ends or is cancelled.
3. Preview: `session.rewindFiles(rewindUuid, true)`, the `rewind_files` request with `dry_run: true` (30 s). With no process running this starts the tab's CLI without a prompt, resuming the stored session. If that start fails, the error is shown in the tab's messages and the conversation's stored session id is kept: a session end during a restore start skips the resume-failure fallback (DES-005).
4. Reply:
   - `canRewind: false`: the Notice shows the CLI's `error`, or "That restore point is no longer available.", and the button is hidden. This also covers a user who set `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING`.
   - `filesChanged` empty: Notice "Nothing to restore."; no dialog.
   - Otherwise `RestoreConfirmModal`: each path in `filesChanged`, marked "outside this vault" when `vaultRelativePath` maps it to null; the totals `+insertions -deletions`; the warning that later edits to those files, by later turns, the user, another tab or another tool, are lost, and that tracked files created after the turn are deleted permanently.
5. Confirm: `rewind_files` with the same id and no `dry_run` (30 s). Cancel: nothing is rewound and sends resume.
6. End: Notice `Files restored: N.`, N being the length of the real reply's `filesChanged` (the preview's count when the reply has no list), followed by `M skipped.` when the preview listed M files more than were restored. A real reply with `canRewind: false` is handled as in the preview: the CLI's error or "That restore point is no longer available.", and the button hidden.
7. Failure, timeout or exit during the real rewind: the error, with a warning that some files may already be rewound.
8. In every outcome after step 5, the change list re-reads the listed paths that lie in the vault (Change list). The CLI started for the restore stays running as the tab's process; no model turn is sent.

The CLI writes and deletes the files on disk, outside Obsidian's vault API: created files are deleted, not trashed, and Obsidian reloads changed notes from disk.

### Branch

1. "Branch" appears only on a footer whose turn record has a `rewindUuid`.
2. `branchFrom` needs a session id, live or stored and, when stored, one `SessionProvenance.decide` trusts for the conversation and the profile (ADR-018 Decision 1). The session and profile are the selected turn's own (its record's `sessionId` and `profileId`, else the live session or the conversation's, `turnSource`), so after a fresh start an earlier turn still forks its own session and a later foreign one blocks only itself. A Branch button is disabled, with no title, while the verdict is pending (the id is not in the record and the migration is not complete; a recorded id is trusted without a scan); for a turn whose session this device did not record, or whose profile it no longer has, it is disabled, titled and described "This turn's Claude Code session is not available on this device"; a stored id that fails the grammar hides it. A turn a compaction summarized away (`summarizedAway`, `state/branch-history`: a `compaction` record follows its turn record before the next clear or fresh start) is disabled, titled and described "Claude Code compacted the conversation after this turn, so it can no longer branch from here", because Claude Code refuses a rewind to such a prompt (`target_not_found`); the turn whose prompt triggered an automatic compaction, a manual `/compact` turn and every later turn are not summarized away, since the record of a compaction is written before its turn's end record. A reopened conversation reads the same stored records. A fork's own conversation holds only turns after its boundaries. The other states win when they apply. Restore files shows by its own rule (PRD-002.R18), so a compacted turn keeps it. A click that raced a verdict opens no tab. Otherwise without one the Notice "This conversation has no CLI session to branch from yet." appears and no tab opens.
3. A turn whose stored message id is not a lowercase UUID opens no tab: a Notice says so. The new tab copies model, effort, mode and the source session's profile, sets `resumeSessionId` to the source's session id and `forkOnResume`, gets a conversation titled `<title> (branch)` (the suffix is not stacked), and shows only the branch note of PRD-002.R15. The source's messages are not copied. The uuid waits on the tab, with a reader of the source's latest prompt, read when the rewind is sent, so turns the source records meanwhile count: `latestPrompt` (`state/branch-history`) over the conversation of an open tab whose stored session id is the source or that holds the source in an earlier segment (`holdsSession`: a turn record, clear or fresh start names it; a source reopened since records into a new conversation object), else over the source conversation the branch was made from. It takes the last `meta` record whose session is the source, its `lastPromptUuid`, else its `rewindUuid`; null when none has one. A record's session is its `sessionId`, else, for a record without one (no release up to 0.5.0 recorded one), the session the first later clear or fresh start ended, else (the live segment) the source; records after the clear or fresh start that ended the source are not read. So a turn before a clear never supplies the prompt of the session after it, nor the reverse. Every offered Branch button is titled and described "Branch from just before this turn, in a new tab" (`BRANCH_TITLE`). A recorded id that is not a lowercase UUID gives null. The tab records the branch (`branchRecord`: `branchSession`, `branchTarget`, `branchLatest`) once, ahead of the conversation's first record of any kind (`Recorder` `leadRecord`, `takeBranchIntent`), so a close during the first rewind reopens as this branch; a branch opened and closed unused stores nothing. The record draws nothing. The tab's `SessionLink` holds the rewind (`BranchHold`) until a rewind succeeds and gives it, through `ensure`, as `rewindOnStart(uuid, latest)` to every session it creates meanwhile, once each.
4. First send: the CLI spawns with `--resume <id> --fork-session`; the session sends `rewind_conversation` with `target_message_uuid`, `interrupt_if_running: true` and, unless the reader gives null, `last_seen_user_message_uuid` (30 s), then the user message. The session sends nothing unless both ids are lowercase UUIDs (`isCliId`, ADR-018 Decision 1); otherwise it reports the branch failure below. Claude Code refuses a target that later prompts follow unless that field names its latest prompt: `stale_target` without the field, `unseen_later_turn` with another uuid; an unknown target is `target_not_found`. As the rewind goes to a fresh fork process (the first send, and each retry) the session reports `onForkStart(source)`, and the view records the branch's fork base, the source's total at that moment, so the branch's cost leaves it out (DES-007 Fork base).
5. Failure: a reply with `rewound: false`, a rejected request, or the forked process ending before the reply (exit code, signal or kill). Nothing is written, the turns queued behind the rewind included. A fork still running is stopped through the restart's wait (DES-002), so a send meanwhile waits for it to close (PRD-001.R5); the turn ends (`exit`). `onBranchFailed` reaches the tab with the reason code (`exited` for a process that ended), the CLI's text, and the fork and rewind the next send makes (`retry`, null when the resume was dropped). The tab records and shows `branchFailureText`:

   | Reason | Text after "Could not branch from that turn: " |
   | --- | --- |
   | `stale_target`, `unseen_later_turn` | "the original conversation has messages this panel did not see. Send a message there, then branch again." |
   | `target_not_found` | "Claude Code no longer has it." |
   | `exited` | "Claude Code exited before cutting the conversation." |
   | any other, or none | the CLI's text, or the rejection's message, ending in a period |

   followed by "Nothing was sent; your message is back in the message box.". The unsent prompts of that turn (`lastTurnPrompts`: its opener and those queued into it) are marked "Not sent" (`markNotSent`, DES-003 Prompts) and go back to the composer, their text after a blank line behind what it holds (`appendText`; the draft of a tab switched away from) and their images before its own. A process that ended reports no error of its own: this is the only error shown (DES-002 Session end).
6. Retry: the rewind stays armed on the session until the fork's `system/init` arrives on the process whose rewind succeeded, or else its first `result` (a turn that ends without an init, as an empty `/compact` does), taking the session id from whichever comes first and never releasing the rewind without one (`onBranchCut(sessionId)`, which releases the link's hold, makes later launches resume the branch's session without forking, and stores the id as the conversation's session id), so the next process, or the next session if the tab drops this one (a profile change), is a fresh fork and the next send rewinds it first, reading the latest prompt anew. A latest prompt the source never recorded (a source turn still running, a prompt whose echo did not reach the panel, a turn from another device) makes every retry fail the same way until the source records a newer turn. The resume fallback (DES-005) does not apply while the rewind is armed (`resumeLost` false), so a fork that ends keeps both. A resume dropped otherwise (the conversation deleted) drops the rewind too, and `retry` is null.
7. Reopen: the record made ahead of the conversation's first record, and the failure record while `retry` is set, carry `branchSession`, `branchTarget` and `branchLatest` (DES-005). Reopening a conversation with no stored session id re-arms the fork and rewind from its latest record that has them (`pendingBranch`), whatever other errors were recorded since, unless a record of a session follows it; the reader is as in step 3, with `branchLatest` as the fallback. A turn that ends (a close, a disposal, a failure) while the branch's rewind has not succeeded writes its end record with the branch fields (`withBranch`, from `SessionLink.pendingBranch`); a reopen draws that turn's prompts "Not sent" from those fields alone (DES-003 Prompts), and the branch stays pending. Ids that are not lowercase UUIDs (`isSessionId`, ADR-018 Decision 1, for the session and, since Claude Code's message uuids are UUIDs, for both message uuids) arm nothing: the tab shows "Could not branch from that turn: the stored branch is not valid. Your next message starts a new conversation." and the next send starts a fresh session.
8. The fork flag is cleared when the branch's `system/init` reports a session id, so later respawns resume the branch itself. The branch's turns record the fork's session id, so the original's file checkpoints stay with the original.

A branch rewinds the conversation, not files. The source conversation, its messages and its CLI session are not touched.

### Shell escape

- `tab/shell-escape` checks, at the send path's step 5, after panel commands (DES-003 Composer): the trimmed text starts with `!`, `enableBashMode` is on (the default; the `bash` unit, device-local by default), and a command follows. Otherwise the text goes to Claude as an ordinary message.
- The command runs at once, whether or not a turn is running, and needs no CLI session. Nothing is sent to the model.
- `shellInvocation` builds one of three shapes; the command is always a single argv element, spawned with `shell: false`, no stdin, Obsidian's environment and a hidden window.

| Case | Command line | Working directory |
| --- | --- | --- |
| The tab's session profile (else its selected profile) has `useWsl`, on Windows | `wsl.exe --cd <vault> --exec sh -lc <command>` | set by `--cd` |
| Windows | `%ComSpec%` (else `cmd.exe`) `/d /s /c <command>` | vault root |
| macOS, Linux | `/bin/sh -c <command>` | vault root |

- Limits: killed with SIGKILL after 60 s; each stream is cut at 100,000 characters with a line saying so, and stops accumulating at twice that.
- The Shell card shows "running", then `exit 0`, `exit N`, "timed out" or "failed", the elapsed time, stdout and stderr, or "No output.". "Add output to chat" puts `formatShellResultForChat` (command, fenced output, and a timeout, error, no-exit-code or exit-code line, as the card says) into the composer without sending.
- The run is recorded as a `bash` message with the first 1500 characters of each stream (DES-005).

### Failure handling

| Failure | Behaviour |
| --- | --- |
| CLI withdraws a prompt | Card "Cancelled", or an Auto-approve edit still waiting for its pre-edit read answered as denied; nothing written; its id is free again |
| CLI process ends with prompts open | Every card "Session ended"; the pending promises, an Auto-approve edit still waiting for its read included, resolve as deny, written nowhere; a read settling later answers nothing |
| Stop and clear while prompts are open or arrive | `PermissionFlow.refuse(true)` settles every open card and gated read as a denial (the process lives, so the denial is written) and denies every request that arrives until the clear is sent, in every mode, with the same message, "The conversation is being cleared.", and no card or pre-edit read; an Allow that reaches a settled card finds no waiting id and is dropped, and an answer carries its card's `key` (given when the card opens; one with no key is dropped), a card Stop and clear denied recreates no tool row, so one for a denied card cannot settle a later card that reuses its request id; `refuse(false)` ends the refusal when the clear is sent, the stop fails or the process exits |
| A request id already waiting for an answer | Denied, no card; the request waiting under the id answered as denied, its card or form "Cancelled" |
| A card or form that cannot be built or drawn | The CLI gets a control error with the message, as when the callback throws; nothing waits under the id. A failure reported for a settled card, or for an earlier card under the id, changes nothing |
| Tab closed with prompts open | After the user confirms the close, the session is disposed and the process killed; the prompts are never answered |
| Permission callback throws | The CLI gets a control error with the message |
| `set_permission_mode` refused or timed out | Mode state rolled back; Notice |
| Pre-edit read fails | The read gives null; the diff shows an excerpt or a creation (Edit planning) |
| Restore preview: CLI cannot start | Error shown; stored session id kept; sends resume |
| Restore preview: `canRewind: false` | The CLI's error or "That restore point is no longer available."; button hidden |
| Real rewind: `canRewind: false` | The CLI's error or "That restore point is no longer available."; button hidden; in-vault paths re-read |
| Real rewind fails, times out or exits | Error plus the may-be-partial warning; in-vault paths re-read |
| Rewind for a branch refused, failed, or its process exits or is killed first | Nothing sent; a running fork stopped; one error shown and recorded; the turn's prompts marked "Not sent"; unsent text and images back in the composer; the next send forks and rewinds again, also after a reopen (Branch steps 5 to 7). Accepted loss: text put back in the composer and not sent is gone once the tab closes, since no draft is kept; the reopened prompts, still marked "Not sent", keep their text to copy, not their images |
| The process is replaced by a restart while the branch rewind is pending | Reported as a branch failure (`exited`), as above |
| No user-message uuid was echoed | No "Restore files" or "Branch" on that turn |
| Shell cannot start | Card "failed" with the error text |

## Architecture rules

Each rule is checkable by a dependency-cruiser `forbidden` rule or a test; until a rule runs, review checks it. Already stated elsewhere and relied on here: DES-001 A2 (no `obsidian` in the pure and process layers), A5 and A6 (`protocol/*`, `session`), A8 (`node:child_process` only in `protocol/client`, `bash` and `cli`), A13 (Markdown only through `inert-markdown`).

| # | Rule |
| --- | --- |
| D1 | `edits` and `diff` import nothing |
| D2 | `bash` imports only `timers` and `node:child_process` |
| D3 | `diffview` imports only `diff` and `obsidian`; rendering arrives as a callback |
| D4 | The decision order (`permissionDecision`), the reopen rule (`reopenMode`) and the default-mode validation are pure functions in `settings-core`, tested in plain Node; `tab/permission-flow`, also tested in plain Node, applies the decision order, and `view` wires the rest |

## Data and security

The user-facing threat model is [SECURITY.md](../../current/SECURITY.md).

| Data | Where | Retention |
| --- | --- | --- |
| Pre-edit copies of tracked files | Claude Code's `~/.claude/file-history/<session>/`, inside the distro for a WSL profile | Claude Code's: 100 checkpoints per session, its cleanup (30 days by default) or `claude purge`; not removed with the conversation |
| Turn record | `meta` messages in the conversation file | With the conversation (DES-005) |
| Mode per conversation | `permissionMode`, `permissionModePicked` in the conversation file | With the conversation |
| Mode defaults and gates | `defaultPermissionMode`, `enableBypassMode`, `enableBashMode`, device-local by default | With settings |
| Startup mode per profile | `cliStartupModes`, device-local | With device-local settings |
| Permission decisions | not stored | - |
| Always allow rules | Claude Code's configuration, written by the CLI | Outside the plugin; the panel cannot list or revoke them |
| `!` commands and output | History (1500 characters per stream) and exports | With the conversation |

No credential or network access is involved.

Risks the design accepts:

- Auto-approve is not behind the bypass gate. A synced default reaches other devices only when the user made the `permissionMode` unit synced; a stored `auto` in a conversation file applies only after confirmation.
- Always allow returns the CLI's suggested rules unchanged; the panel does not show or narrow them before they are persisted.
- A confirmed restore rewrites and deletes files the CLI tracked, inside or outside the vault, after the dialog named each one; it also undoes later edits to them, and shows no content diff.
- Restore misses what the CLI does not track: subagent edits other than a foreground forked skill's, Bash, the vault tools, linked files and directories, though the action reads as an undo.
- The plugin folder lies inside the CLI's working directory, so the agent's own file tools can reach `history/` and `data.json`; whether a card precedes such a write depends on the mode.
- The `!` escape runs with the user's full rights outside every permission rule and hook, and is on by default.

## Rollout and rollback

- Switches: `defaultPermissionMode` (read when a tab is created), `enableBypassMode` (the popover reads it at each open; the spawn flag at session creation and at each settings-close restart), `enableBashMode` (read on every send).
- CLI surface this depends on: `--permission-prompt-tool stdio`, `can_use_tool` with its decision-reason fields, `control_cancel_request`, `set_permission_mode`, `current_permission_mode` in the initialize reply, `permissionMode` in `system/init` and `system/status`, `--replay-user-messages`, `--fork-session`, `rewind_conversation` (with `last_seen_user_message_uuid` and the refusal `reason`s `stale_target`, `unseen_later_turn`, `target_not_found`), `rewind_files`, `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING`. None is version-checked. Missing pieces degrade: no reported mode leaves the pick or the "Claude Code default" label; no decision-reason fields make Auto-approve answer without a card; no echoed uuid removes restore and branch; a refused or failed branch rewind, or a fork that exits or is killed during it, sends nothing and says so; a CLI without `rewind_files` shows its error in the preview.
- Migration: the legacy `checkpoints/` folder is removed on load; turns recorded before the switch offer no restore.
- Observability: card labels, Notices and the restore summary.
- Rollback is installing an earlier release (DES-001). Not undone by any rollback: Always allow rules already written to Claude Code's configuration, files already restored, and commands already run through `!`.

## Alternatives

Covered by ADR-002 (bypass as default, auto-approve as bypass, the CLI's own `auto`, a panel default shown without asking the CLI), ADR-006 (plugin-owned pre-images, a mixed store, git or File Recovery, in-place rewind) and ADR-011 (a model Bash turn, `mcp_call`, no escape or off by default). A diff library is excluded by ADR-007. Design-level choice:

- Gap expansion: re-diffing the file with unlimited context, against inserting the clicked gap's lines from the texts. Inserting, because the re-diff loops once per context line per change and blocks the UI thread on large files.

## Verification

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| PRD-002.R1 | `tests/protocol.test.mjs`: "a permission request reaches the callback and the decision goes back", "a denial is reported as a denial"; `state-permission.test.mjs`: the PRD-002.R1 tests, among them "PRD-002.R1: settled, the outcome label replaces the buttons and the waiting highlight goes", "PRD-002.R1: a settled card ignores every later event, so it is answered once"; `tab-permission-flow.test.mjs`: the PRD-002.R1 tests, among them "PRD-002.R1: a card answered twice answers once", "PRD-002.R1: a request id answered before can wait again, as a new process counts from 1, and an old read reaches only its own card"; `settings-core.test.mjs`: "PRD-002.R1: outside Auto-approve every request gets a card that answers at once", "PRD-002.R1: every allow answer carries the input unchanged, and Always allow its rules". "PRD-002.R9: a tool name that is not a string shows as unknown and flags the request" | The card and its labels |
| PRD-002.R2 | Same first test: suggestions arrive and return as `updatedPermissions`; `state-permission.test.mjs`: the two PRD-002.R2 tests | The button and its condition |
| PRD-002.R3 | `tests/protocol.test.mjs`: "a cancelled permission notifies the view and is answered with silence", "an unsupported CLI-initiated control request is answered with an error", "PRD-002.R3: the question scenario's process exits while its form waits"; `state-permission.test.mjs` and `tab-permission-flow.test.mjs`: the PRD-002.R3 tests, a withdrawn card, a form, the process ending, a request id that already waits and a card that cannot be drawn among them; `session.test.mjs`: "PRD-001.R5: a late answer from a replaced process leaves its successor's prompt with the same id open, so the next restart cancels it" | Card labels; process exit with prompts open |
| PRD-002.R4 | `tests/edits.test.mjs`, all tests, among them "Edit replaces the first occurrence only by default", "MultiEdit applies its edits in order", "a replacement that does not match falls back to a fragment diff", "paths outside the vault are rejected", "relative paths pass through but traversal does not", the PRD-002.R4 path tests, among them "PRD-002.R4: an absolute path that climbs out of the vault with .. is outside it", "PRD-002.R4: under a POSIX root a backslash is part of a name, so the path is refused", "PRD-002.R4: a UNC root's host and share are its anchor, which .. cannot leave", "PRD-002.R4: ignoring case upper-cases each character only into one character" | The diff on the card, the placeholder, the outside-vault note |
| PRD-002.R5 | `tests/diff.test.mjs`, all tests, among them "word-level refinement marks only the words that differ", "unchanged stretches collapse into a gap carrying its line count", "oversized inputs degrade to a coarse block instead of hanging", "row output is capped and says so", "PRD-002.R5: an option set to undefined keeps its default", "PRD-002.R5: expanding a gap returns exactly its lines, matching a full-context diff", "PRD-002.R5: a gap past the row limit leaves the rest as a gap row", "PRD-002.R5: the Rendered sides leave out gap and cut rows", "PRD-001.R29: a chunk also ends at about 50,000 characters of row text", "PRD-001.R29: the first chunk draws before the target is on the page; later ones need it there", "PRD-001.R29: a diff at the 4,000-row cap draws in eight chunks of 500 and a ninth with the cut row" | Signs, numbers, badges, the cut row, the first draw of a 4,000-row diff and a card closed mid-draw within the 100 ms task bound, gap expansion on a 20,000-line file within the same bound, Rendered |
| PRD-002.R6 | `state-permission.test.mjs`: the PRD-002.R6 tests of the answering state; `tab-permission-flow.test.mjs`: the PRD-002.R6 tests, a read that never settles holding an answer only to the deadline among them; `settings-core.test.mjs`: "PRD-002.R6: Auto-approve answers an Edit, Write or MultiEdit request only after its pre-edit read finishes", "PRD-002.R6: a failed pre-edit read still lets the answer through", "PRD-002.R6: a flagged edit in Auto-approve is allowed from its card only after the pre-edit read"; `timers.test.mjs`: the four deadline tests, a read that never settles among them; `edit-tracker.test.mjs`: the three PRD-002.R6 tests, a request whose file differs from its tool_use's among them; `state-step-groups.test.mjs`: "PRD-002.R6: a succeeded edit's row shows +x -y from the file as read to the file on disk, with both for its diff", "PRD-002.R6: outside the vault an edit counts its own strings, and a call with nothing to diff counts nothing" | The step row after the tool ran (`+x -y`, the diff in its details, a failed edit's raw result); a flagged edit's buttons disabled while Allow waits |
| PRD-002.R7 | `tests/edit-tracker.test.mjs`: the eight PRD-002.R7 tests, among them "PRD-002.R7: a file's change runs from its first recorded contents to its latest", "PRD-002.R7: a created file is new, and a file with no net change is neither listed nor counted", "PRD-002.R7: a subagent's edit is read at its tool_use and recorded at its result", "PRD-002.R7: a failed edit records nothing and releases its read", "PRD-002.R7: clear drops every kept read, so results after a process exit record nothing"; `session.test.mjs`: "PRD-002.R7: a deliberate restart reports the replaced process, so its edits' reads are dropped" | The change list with main-agent and subagent edits, in Ask and in Accept edits, Bypass or under an allow rule |
| PRD-002.R8 | `tests/protocol.test.mjs`: "optional spawn flags appear only when configured", "an explicit default permission mode is passed". `settings-core.test.mjs`: "PRD-002.R8: a stored default permission mode outside the four options loads as Claude Code default", "PRD-002.R8: the four offered default modes load unchanged", the two mode-table tests, "PRD-002.R8: the permission popover offers the four modes, and Bypass only while it is enabled"; `session.test.mjs`: the four PRD-002.R8 pick tests, one of them across a replaced process | The permission popover, `set_permission_mode`, rollback, warning style |
| PRD-002.R9 | `settings-core.test.mjs`: the `permissionDecision` tests for a rule-flagged, a hook-flagged, an interaction-flagged and a safety-check-flagged request, a compound command with a safety check inside, an ask rule beside the tool's own reason, a sandbox escape by reason type or by the input alone, an organization's MCP ask ceiling, an unknown reason type, a mistyped flag field, an AskUserQuestion its form cannot show, a subagent's request, the listed reason types and every other request, "PRD-002.R9: Auto-approve launches Claude Code in its default mode", the two `reopenMode` tests for `auto`; `protocol.test.mjs`: the PRD-002.R9 decision-reason tests against the `permission-flagged` (a subagent's), `permission-ask-rule`, `permission-safety-check`, `permission-classifier-approvable`, `permission-org-ceiling`, `permission-bad-reason`, `permission-bad-tool-name`, `permission-null-reason` and `permission-unflagged` scenarios | A rule-flagged request and a safety check (`ls &`) under Auto-approve show a card; the reopen confirmation |
| PRD-002.R10 | `tests/protocol.test.mjs`: "optional spawn flags appear only when configured", "PRD-002.R10: the bypass setting adds --allow-dangerously-skip-permissions"; `settings-core.test.mjs`: "PRD-002.R10: a new tab never starts in Bypass, whatever the stored default", "PRD-002.R10: a reopened Bypass conversation applies only while bypass is on"; `session.test.mjs`: the four `leaveBypass` tests and the two superseded-switch tests | The gate; reopen with the gate off; gate off at a settings-close restart |
| PRD-002.R11 | `tests/protocol.test.mjs`: "an unset permission mode leaves the CLI's own default", "an explicit default permission mode is passed"; `settings-core.test.mjs`: the three PRD-002.R11 `reopenMode` tests | `shownMode`, `noteCliMode` |
| PRD-002.R12 | `settings-core.test.mjs`: "PRD-002.R12: a well-formed AskUserQuestion gets its form in every mode"; `state-permission.test.mjs`: the PRD-002.R12 tests (title, count, Submit, single- and multi-select, answers, Dismiss); `tab-permission-flow.test.mjs`: the two PRD-002.R12 tests; `protocol.test.mjs`: "PRD-002.R12: the question scenario's single- and multi-select forms go back answered through the permission flow" | The form in each mode (`question`) |
| PRD-002.R13 | `protocol.test.mjs`: "PRD-002.R13: every spawn turns the CLI's file checkpointing on", "PRD-002.R13: in the WSL shape WSLENV names the variable after the user's entries" | The turn record in a stored conversation; legacy folder removal |
| PRD-002.R14 | `protocol.test.mjs` against the `rewind` scenario of `tests/fake-cli.mjs`: the dry run and the real rewind, a gone checkpoint, malformed replies, a CLI without `rewind_files`; `restore.test.mjs`: the turn record that offers a restore, when the button hides or disables, the result Notice; `edit-tracker.test.mjs`: "PRD-002.R14: after a restore a listed file takes the text on disk, or leaves the list when gone" | Button conditions, preview, dialog, result Notice, failure warning, restore in a reopened conversation, native and WSL, recorded in `docs/records/verification/` |
| PRD-002.R15 | `protocol.test.mjs`: the rewind request and its three refusals; `session.test.mjs`: the PRD-002.R15 tests against the fake's `rewind_conversation` (refusals, ids that are not UUIDs, error, exit and kill during the rewind, the cut report, retry, a send right after a failure waiting for the fork to close, no rewind after the fork's `init`, a dropped resume); `state-branch-history.test.mjs`: the latest prompt, legacy records, the pending branch, its value check, a later error, the record made ahead of the first record; `state-branch-hold.test.mjs`: the rewind held across sessions; `state-tab.test.mjs`: that record draws nothing; `state-branch-failure.test.mjs`: the texts; `state-stream.test.mjs`: every prompt echo; `state-turn.test.mjs`: the last turn's prompts, the turn-end record's echo; `state-composer.test.mjs`: text put back; `history-file.test.mjs`: the new `meta` fields. Required: `--fork-session` and `--replay-user-messages` in the spawn tests | A branch continuing from before the chosen turn; a refused rewind's message, composer text and retry; a failed branch reopened |
| PRD-002.R16 | `tests/bash.test.mjs`, all tests, among them "POSIX commands go to /bin/sh -c as a single argument", "WSL mode wraps the command the same way the CLI is launched", "the command is never concatenated into the argv", "a hanging command is killed at the timeout", "runaway output is truncated and flagged" | The card, the toggle, each platform shell |
| PRD-002.R17 | `tests/tool-labels.test.mjs`: the two `planOf` tests. Required: `tests/inert-markdown.test.mjs` on a plan with a fenced block | A long plan shown whole on the card |

Independent verification boundary: the exported functions of `edits`, `edit-tracker`, `diff`, `bash`, `settings-core`, `tool-labels`, `inert-markdown`, `state/permission` and `tab/permission-flow` in plain Node, and `ClaudeClient` against `tests/fake-cli.mjs` over real stdio, run by CI through `make verify`, outside the implementing agent's control. `view.ts`, `diffview.ts`, `ui/permission-card` and `ui/question-form` are checked by a person in a desktop vault with a real CLI. Which calls Claude Code submits, the decision-reason fields it sets, how it stores Always allow rules, and what `rewind_files`, `rewind_conversation` and `--fork-session` do are properties of the CLI and cannot be verified in this repository.

## Open questions

None.
