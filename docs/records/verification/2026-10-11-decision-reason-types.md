# Claude Code's `decision_reason_type` values

**Date:** 2026-10-11. **Method:** `grep -a` on the installed Claude Code
builds 2.1.291, 2.1.292 and 2.1.296; no CLI was run. Behavior below is read
from 2.1.296.

The `can_use_tool` schema types `decision_reason_type` as one enum, the same
in all three builds: `rule`, `mode`, `subcommandResults`,
`permissionPromptTool`, `hook`, `asyncAgent`, `sandboxOverride`,
`workingDir`, `safetyCheck`, `classifier`, `other`. Its description lets
hosts "make policy (e.g. auto-deny safetyCheck)".

How the CLI treats an ask that reaches the client:

- Outside Bypass, an ask whose reason is or nests a `safetyCheck`, is
  `sandboxOverride`, or is plan mode is returned before the mode and allow
  rules can allow it.
- In Bypass these still ask: a whole-tool ask rule, a content ask rule on
  any tool (`Bash(git push:*)`, `Edit(note.md)`; nested in a compound
  command included),
  `requiresUserInteraction`, an MCP org ceiling of `ask`, a safety check
  whose circuit breaker is bypass-immune (`dangerousRemoval`,
  `isolatePeerMachines`, `restrictedMode`, `outsideReadsBlocked`), and
  `sandboxOverride` under `blockReadsOutsideWorkingDirectories`. Other asks
  are allowed.
- The CLI's own `auto` mode, its unattended approver, hands to a person a
  safety check with `classifier_approvable: false` whose breaker is not
  classifier-routed, an ask rule, an MCP org ceiling of `ask`, plan mode and
  `requires_user_interaction`. Classifier-routed checks
  (`backgroundOperator`, `suspiciousWindowsPath`) and checks with
  `classifier_approvable: true` go to its classifier; `dangerousRemoval`,
  though classifier-routed, meets its deny branch first and is
  denied or asked with an auto-deny timer. None goes straight to allow.

The panel's Auto-approve runs the CLI in `default` and has no classifier.

| Value | When the CLI sends it | Panel in Auto-approve |
| --- | --- | --- |
| `rule` | an ask rule matched | Card |
| `hook` | a hook asked | Card |
| `safetyCheck` | the CLI's own checks: dangerous `rm`, writes to its settings and other protected files, a background `&`, paths it cannot check against the read block, a worktree outside `.claude/worktrees/`, foreign artifact reads, and more | Card: no allow rule approves it, and in `auto` only a person or the CLI's classifier does |
| `subcommandResults` | a compound shell command; the type stays this "even when a safetyCheck is nested inside" | Card only with a nested safety check, which `classifier_approvable` shows. An `ask` rule on one of its commands is flagged (`rule` or `matched_ask_rule`) unless another command also needs approval (`npm run build && git push`, with an ask rule on `git push`); then it carries no marker and is answered without a card (limitation; a `PreToolUse` hook returning `ask` arrives as `hook`) |
| `sandboxOverride` | a Bash call with `dangerouslyDisableSandbox` ("Run outside of the sandbox") | Card: no allow rule approves it outside Bypass, like `backgroundOperator` |
| `mode` | the mode decided (default asks, plan refuses writes) | No card |
| `workingDir` | a path outside the working directories | No card; Bypass allows it |
| `classifier` | the CLI's auto-mode classifier blocked or escalated a call | No card; every producer is the CLI's `auto` mode, which Auto-approve never runs |
| `asyncAgent` | no prompt surface (headless, background agent) | No card; a deny reason, not an ask |
| `permissionPromptTool` | the permission prompt tool answered | No card; the client's own answer |
| `other` | catch-all, among them `requiresUserInteraction` and an MCP org ceiling | No card unless another field flags it |
| absent | asks with no reason, the sandbox's network prompt (`SandboxNetworkAccess`, `input: {host}`) among them | No card |
| any other | a value this list does not know | Card |

Other `can_use_tool` fields:

| Field | Meaning | Panel in Auto-approve |
| --- | --- | --- |
| `classifier_approvable` | "Set when a safetyCheck is present anywhere in the decision reason (including nested inside subcommandResults)"; `false`: one "requires manual approval" | Card, either value |
| `matched_ask_rule` | an ask rule forced the prompt but the tool's own reason was kept, "so the rule rides here instead of decision_reason_type 'rule'"; hosts "running host-side auto-approval should treat asks carrying this field as rule-forced" | Card |
| `decision_reason_code` | `@internal` closed-set code; `org_ask_ceiling`: an MCP tool whose org ceiling is `ask`, with type `rule` or `other`; asks before the Bypass check | Card for `org_ask_ceiling` |
| `requires_user_interaction` | the card is the interaction surface, or the ask can be shown only locally | Card when true |

A flag field of the wrong type gets a card; null counts as absent.
