# ADR-002 — Permission prompts: the CLI decides, the panel asks

**Status:** accepted (2026-10-10)

## Context

- Claude Code decides which tool calls need consent: it runs hooks, then deny
  rules, then `ask` rules, then the permission mode, then allow rules. With
  `--permission-prompt-tool stdio` it sends each call left undecided to the
  client as a `can_use_tool` control request and waits.
- In `bypassPermissions`, deny rules, explicit `ask` rules and hooks still
  apply, and `rm`/`rmdir` of a critical path still reaches the client; the
  mode needs `--allow-dangerously-skip-permissions` at launch.
- `can_use_tool` carries `decision_reason_type` (`rule`, `mode`, `hook`,
  `safetyCheck`, `sandboxOverride`, `classifier` and others),
  `decision_reason`, `decision_reason_code` (`org_ask_ceiling`: an
  organization's MCP ceiling of `ask`), `classifier_approvable` (set only
  when one of Claude Code's safety checks is in the reason, nested in a
  compound command's `subcommandResults` included), `matched_ask_rule` (an
  ask rule forced the prompt while the reason type stays the tool's own),
  `requires_user_interaction` and the call's `tool_use_id` (request schema
  in Claude Code 2.1.296;
  [values](../../records/verification/2026-10-11-decision-reason-types.md)).
- The CLI's modes are `default`, `acceptEdits`, `plan` and
  `bypassPermissions`; it can also report `dontAsk` and its classifier mode
  `auto`. Without `--permission-mode` it starts in the user's
  `permissions.defaultMode`, and it changes mode by itself (leaving plan mode).
- `AskUserQuestion` reaches the client through the same request.
- For an edit's diff the panel reads the target file when the call's
  `tool_use` block arrives, before the tool runs.
- `data.json` and conversation files in the plugin folder reach every device
  through Obsidian Sync or a folder-sync tool (ADR-005, ADR-009).
- Users want an unattended mode. The constitution requires a card for every
  call the CLI submits for approval in the default mode, bypass hidden until
  enabled, and a card in auto-approve for a call the CLI's rules or hooks
  flag.

## Options considered

### Panel cards for the CLI's prompts, plugin-side auto-approve, gated bypass (recommended, with changes)

- Claude Code's rules and hooks stay authoritative; the panel answers only
  what reaches it, and can show a diff before approval. Auto-approve needs no
  launch flag.
- As built, auto-approve also allows what the user's `ask` rules and hooks
  escalate, and critical-path removals, all of which bypass still asks about;
  it answers before the read behind the edit's diff finishes; and it is taken
  unchecked from synced settings and from conversation files.

### Default to `bypassPermissions`

- No prompts.
- Edits files, protected paths included, and runs shell commands without
  asking; breaks the constitution's *Consent first*.

### Auto-approve implemented as `bypassPermissions`

- The CLI enforces it, keeping deny rules, `ask` rules, hooks and the
  critical-path check.
- Needs `--allow-dangerously-skip-permissions`, so it exists only behind the
  bypass setting and duplicates Bypass; the constitution names Auto-approve as
  a mode of its own.

### Offer the CLI's own `auto` mode

- The CLI's classifier decides per call.
- Its availability depends on plan, model and settings, and Anthropic can
  turn it off server-side; its semantics differ from the panel's
  auto-approve.

### A panel default shown without asking the CLI

- Simple.
- The control says "Ask" while the CLI runs in the user's configured
  `defaultMode`, and stays on "Plan" after the CLI leaves plan mode.

## Decision

Why the recommended option:

- Cards, not a bypass default: the constitution requires a card for every
  call the CLI submits for approval in the default mode and keeps bypass
  hidden until enabled (`docs/current/constitution.md:26-32`).
- The CLI stays the authority: hooks, deny and `ask` rules and the mode run
  before `can_use_tool` (Claude Code docs, *Configure permissions*, "How
  permissions are evaluated"), so the panel only answers what is left and
  adds a diff.
- Auto-approve stays plugin-side because bypass needs
  `--allow-dangerously-skip-permissions` (`src/protocol/client.ts:221`), which
  the bypass setting gates.
- The control shows the CLI's mode, since the CLI picks its starting mode
  from settings and leaves plan mode itself (docs, *Choose a permission
  mode*, "Which mode a session starts in").
- The CLI's `auto` is shown when reported, not offered, because Claude Code
  can withhold it per account, model, settings or server-side switch (same
  page, "Eliminate prompts with auto mode").

The changes:

- Auto-approve keeps a card for escalated calls. It answers `allow` to every
  request but AskUserQuestion (`src/view.ts:3702-3703`), so it approves calls
  bypass would still ask about (docs, *Bypass permissions mode*: "Deny rules,
  explicit `ask` rules, and hooks are evaluated before the mode check";
  critical-path removals "still fall through to your `canUseTool`
  callback"), while the constitution requires a card for a call the CLI's
  rules or hooks flag (`docs/current/constitution.md:30-31`). A critical-path
  removal arrives as a safety check, which Claude Code returns before the
  mode and allow rules can allow it.
- Auto-approve waits for the pre-edit read. The read starts at `tool_use`
  and nothing holds the write for it (`src/view.ts:3244-3254`), so an
  immediate `allow` lets the CLI write first and the diff's before-text can
  be the edited text.
- The mode is checked wherever it is read. A new tab takes the default mode
  as stored, checking only bypass (`src/view.ts:949-951`), and a reopened
  conversation applies a stored `auto` (`src/view.ts:1918-1922`), so a shared
  or tampered `data.json` or history file can put tabs into auto-approve. The
  constitution keeps the permission mode and bypass on the device by default
  and validates a stored value before it can widen what the plugin does
  (`docs/current/constitution.md:59-63`).

The design:

- Every session launches with `--permission-prompt-tool stdio`. Each
  `can_use_tool` becomes a card: a title (vault tools get a sentence), a
  summary, a live diff for Edit/Write/MultiEdit, the input (capped), and
  Allow / Always allow / Deny. Always allow appears only when the CLI sends
  `permission_suggestions` and returns them unchanged as `updatedPermissions`.
- `AskUserQuestion` with a valid shape renders as a form; the answers return
  as `allow` with `updatedInput.answers`.
- Modes per conversation: Claude Code default (no flag; the CLI's
  `defaultMode` applies), the CLI's modes, and Auto-approve everything
  (`auto`).
- Auto-approve launches the CLI in `default` and answers `allow` with the
  input unchanged and no card; activity cards still draw. Exceptions:
  - AskUserQuestion keeps its form; one whose input the form cannot show
    gets the normal card.
  - A flagged request gets the normal card: a `decision_reason_type` that
    is not one Auto-approve may answer (`mode`, `subcommandResults`,
    `workingDir`, `classifier`, `asyncAgent`, `permissionPromptTool`,
    `other`), so `rule`, `hook`, `safetyCheck`, `sandboxOverride` and any
    unknown value; `classifier_approvable` or `matched_ask_rule` present;
    `decision_reason_code` `org_ask_ceiling`; `requires_user_interaction`
    set; or any of these fields with the wrong type. A request with none of
    them, no `decision_reason_type` included, is answered without a card.
  - An Edit, Write or MultiEdit request is answered only after the pre-edit
    read started for its `tool_use_id` has finished.
- `bypassPermissions` is offered only while the bypass setting is on; that
  setting adds `--allow-dangerously-skip-permissions` to every spawn. A new
  tab never starts in bypass. Auto-approve and bypass show in red while
  selected.
- The setting "Default permission mode" offers Claude Code default,
  `acceptEdits`, `plan` and `auto`. When settings load, any other stored value
  becomes Claude Code default. The setting and the bypass setting are
  device-local by default (ADR-009).
- The control shows the mode the CLI reports (initialize reply,
  `system/init`, `system/status`); a mode the CLI switches to is kept for
  respawns. A pick goes through `set_permission_mode`, rolls back if refused,
  and is stored with the conversation.
- A reopened conversation applies its stored mode only if the panel offers
  it: a stored `bypassPermissions` only while the bypass setting is on, and a
  stored `auto` only after the user confirms it in the tab. Until then the
  tab keeps the mode it already had.
- A CLI cancel settles the card as Cancelled; process exit settles pending
  cards as deny.
- Validation: the default-mode check and the auto-approve rule (which
  requests get a card) are pure functions with `node:test` cases; the
  awaited read, the reopen confirmation and the escalated cards are checked
  by hand in a vault, recorded in `docs/records/verification/`.

## Consequences

- Consent covers only what the CLI asks about. In `default` mode Claude Code
  runs reads without asking (docs, *Choose a permission mode*, "Available
  modes"), and vault-tool consent relies on the CLI prompting (ADR-004).
- Always allow writes the CLI's suggested rules into Claude Code's settings as
  suggested; the panel does not narrow them.
- Auto-approve stays outside the bypass gate. A device on which the user
  syncs "Default permission mode" takes auto-approve from any writer of
  `data.json`.
- A stored bypass reopens without a confirmation on a device whose bypass
  setting is on.
- Where the CLI asks nothing (`acceptEdits`, bypass, allow rules), nothing
  holds the write, so an edit's diff can show the edited text as its
  before-text (inferred).
- An `ask` rule that matches one command of a compound command in which
  another command also needs approval (`npm run build && git push`, with an
  ask rule on `git push`) arrives as `subcommandResults` with no marker, so
  Auto-approve answers it without a card (Claude Code 2.1.296). A `PreToolUse` hook that returns `ask` for
  such commands arrives as `hook` and gets the card.
- Open risk: launched without a mode flag, the CLI can start in its
  classifier `auto` mode when that is its built-in default (docs: the
  starting mode "can be auto mode"), approving calls without a card; whether
  stream-JSON sessions get that default is unverified (inferred).
- The rest of the permission flow lives in `src/view.ts`, which imports
  `obsidian` and has no automated tests (ADR-014).
