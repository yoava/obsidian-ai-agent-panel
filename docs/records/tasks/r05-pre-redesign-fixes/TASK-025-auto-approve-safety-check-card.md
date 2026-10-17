---
status: closed
release: r05-pre-redesign-fixes
number: 025
prd: PRD-002.R9
---

# TASK-025 — Auto-approve: a card for Claude Code's safety checks

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

In *Auto-approve everything* the panel allows a request Claude Code raised
through its own safety check (a dangerous removal, a write to its settings, a
background `&`, …) without a card, because ADR-002's flag rule names only
`rule`, `hook` and `requires_user_interaction` (task 003, D6). Claude Code
returns a safety-check ask before allow rules apply, and keeps some of them
in Bypass; the panel's Auto-approve must not answer it unseen. Nor may it
answer an ask rule Claude Code reports in `matched_ask_rule` beside the
tool's own reason type: that request is rule-forced, which ADR-002 and
PRD-002.R9 already send to a card.

Governing:
[ADR-002](../../../current/adr/ADR-002-permission-prompts-cli-decides-panel-asks.md)
(Decision, Exceptions), PRD-002.R9,
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Permission round trip step 3.2), constitution *Consent first*, backlog item
in `plan.md` (removed by this task). Evidence:
[decision reason types](../../../records/verification/2026-10-11-decision-reason-types.md).

Acceptance:

1. In Auto-approve a request gets the normal card when its
   `decision_reason_type` is present and not one Auto-approve may answer
   (`AUTO_APPROVE_REASON_TYPES`: `mode`, `subcommandResults`, `workingDir`,
   `classifier`, `asyncAgent`, `permissionPromptTool`, `other`), so `rule`,
   `hook`, `safetyCheck`, `sandboxOverride` and any unknown value; when it
   carries `classifier_approvable` (either value; Claude Code sets it
   whenever a safety check is in the reason, nested in a compound command's
   `subcommandResults` included) or `matched_ask_rule`; when its
   `decision_reason_code` is `org_ask_ceiling`; when
   `requires_user_interaction` is true; when a flag field came with the
   wrong type; and for an AskUserQuestion its form cannot show. An edit's
   Allow still waits for its pre-edit read.
2. A request with none of these, no `decision_reason_type` included (the
   sandbox's network prompt among them), is allowed without a card.
3. The client passes each flag field only when of its type
   (`matched_ask_rule`, when an object, as `matchedAskRule: true`); null
   counts as absent; any other wrong type is named in `mistypedFlags`.
4. A subagent's request is decided as the main agent's.
5. Other modes unchanged.

## Scope

Expected files:

- `src/settings-core.ts` (`AUTO_APPROVE_REASON_TYPES`,
  `permissionDecision`), `src/protocol/types.ts` (`PermissionFlags`),
  `src/protocol/client.ts` (`permissionFlags`), `src/view.ts` (comment)
- `tests/settings-core.test.mjs`, `tests/protocol.test.mjs`,
  `tests/fake-cli.mjs` (the `permission-*` reason scenarios)
- ADR-002, PRD-002, DES-004, DES-002, `docs/current/SECURITY.md`,
  `README.md`, `docs/current/DEVELOPMENT.md`, `RELEASE_NOTES.md`,
  `docs/current/plan.md`, the verification note

Negative scope:

- An `ask` rule that matches one command of a compound command in which
  another command also needs approval: Claude Code sends no marker for it;
  recorded as a limitation with its workaround, not fixed.
- A card for the sandbox's network prompt (`SandboxNetworkAccess`).
- Showing the reason, `classifier_approvable` or the matched rule on the
  card; the card, the form and the other modes.
- The constitution's wording (protected).

## Plan

- Evidence first, read-only: the `decision_reason_type` enum, the other
  reason fields and the Bypass and `auto` handling in Claude Code 2.1.291,
  2.1.292 and 2.1.296, by `grep -a` on the installed builds; no CLI run.
- Tests first, each named PRD-002.R9: a card for every flagged case of
  acceptance 1, an allow for each listed type and for none, the list itself,
  a subagent's request; the protocol carries each field, names mistyped
  ones and treats null as absent.
- `client.ts` reads the flag fields in `permissionFlags`;
  `permissionDecision` flags by the list and the fields. Both share
  `PermissionFlags`.
- Verification: `make verify`. By hand in a vault, owed: in Auto-approve,
  `ls &` (Claude Code's background-operator safety check) shows a card.
- Rejected: flagging only `classifier_approvable: false` (a `true` check may
  be approved only by Claude Code's classifier, which does not run while
  Auto-approve keeps the CLI in `default`); flagging by
  `decision_reason_type` alone (a nested safety check arrives as
  `subcommandResults`); flagging every `subcommandResults` to catch nested
  ask rules (a card for every compound command).

## Run log

- Evidence: a nested safety check arrives as `subcommandResults`, so the
  type alone would miss `cd x && rm …`; `classifier_approvable` marks it.
  Also found: `matched_ask_rule`, `sandboxOverride` and the `@internal`
  `org_ask_ceiling` code.
- Coordinator decision: `matched_ask_rule` is rule-forced, so settled by
  ADR-002 and PRD-002.R9; added to this task.
- Tests first: "Auto-approve shows the card for a request Claude Code's
  safety check flagged", "… for a compound command with a safety check
  inside" and "a permission request carries Claude Code's safety-check flag"
  failed before the change (3 of 505); the two `matched_ask_rule` tests
  failed before theirs (2 of 507).
- Independent review and Codex cross-review: fail open on unknown and
  mistyped values, `sandboxOverride` and `org_ask_ceiling` unflagged, a
  malformed AskUserQuestion allowed, an ask rule inside a compound command
  unmarked (Defect 1), corrections to the evidence, missing tests. The
  lead's decisions (Outcome Q1 to Q5) applied.
- Round-2 review: the Defect 1 wording narrowed to compound commands in
  which another command also needs approval; a non-string `tool_name` named
  in `mistypedFlags` ("a tool name that is not a string shows as unknown and
  flags the request" failed first, 1 of 542).
- Tests first for them: the settings-core suite failed at import (no
  `AUTO_APPROVE_REASON_TYPES`); with only that export added, 7 of 541 failed
  (sandbox escape, org ceiling, unknown type, mistyped flag, malformed
  AskUserQuestion; protocol: mistyped flags named, org ceiling carried).
  The subagent, null-as-absent and list tests passed already and stay as
  guards.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed;
mutations fail named tests. Defect: a compound command hitting an ask rule
arrives as `subcommandResults` with no marker and is answered; kept as
owner question Q5 with the hook workaround, documented. Gaps: the evidence
treated `sandboxOverride` unlike the safety checks; two imprecise evidence
statements; the manual `ls &` check. Codex cross-review: the organization
ceiling (`decision_reason_code`) was answered; unknown and malformed markers
failed open; a malformed AskUserQuestion was answered; missing tests.
Resolved: fail closed on an allowlist of reason types, mistyped flags flag,
`sandboxOverride` and the org ceiling flagged, a malformed AskUserQuestion
gets a card, the evidence rewritten, tests added.

Round 2: the same reviewer; `make verify` passed; no path left where a
flagged or mistyped request is answered. Gaps: the nested ask-rule
limitation was worded too broadly (fixed: only when another command also
needs approval); Q6 now names the constitution exception. Nits fixed; a
non-string tool name also fails closed.

## Outcome

ADR-002 (Context, Exceptions, Consequences) and PRD-002.R9 were amended: the
flag rule now covers the safety check, `matched_ask_rule`, `sandboxOverride`,
`org_ask_ceiling`, unknown and mistyped values, and a malformed
AskUserQuestion. The owner's decision B8
([owner decisions](../../../records/research/owner-decisions.md)) named
`rule` and `hook` only, so the owner confirms the amendment.

Owner decisions, taken by the lead after review, for the owner to confirm
([evidence](../../../records/verification/2026-10-11-decision-reason-types.md)).
Risks as impact × probability (1 to 5), inherent → residual:

- Q1. Fail closed: an unknown `decision_reason_type` and a flag field of
  the wrong type get a card; a missing type is still answered (asks with no
  reason and the sandbox's network prompt carry none); the answerable types
  are an explicit list. Risk, a new reason that needs a person answered
  unseen: 4 × 2 = 8 → 4 × 1 = 4 (only an ask with no type at all remains).
  Cost: a new harmless value shows cards until the list names it, 1 × 3 = 3.
- Q2. `sandboxOverride` gets a card, as `backgroundOperator` does; the
  sandbox's network prompt (`SandboxNetworkAccess`) is answered without one,
  as SECURITY.md says, with `sandbox.allowUnsandboxedCommands: false` as the
  setting that removes the escape. Risk, a command run outside the sandbox
  unseen: 4 × 2 = 8 → 4 × 1 = 4. Risk accepted, a connection to a host
  outside the sandbox's list unseen: 3 × 2 = 6 → 6. Owner: whether the
  network prompt should get a card too (cost: a card per new host).
- Q3. `decision_reason_code` `org_ask_ceiling` gets a card, though Claude
  Code marks the code `@internal`. Risk, an MCP call the organization set to
  ask answered unseen: 3 × 1 = 3 → 3 × 1 = 3 if the code changes silently
  (fail closed covers a non-string code only).
- Q4. An AskUserQuestion its form cannot show gets a card, not an allow.
  Risk, the model proceeds as if answered: 2 × 1 = 2 → 1 × 1 = 1.
- Q5. Defect 1 kept, option (b): an `ask` rule that matches one command of
  a compound command in which another command also needs approval
  (`npm run build && git push`, with an ask rule on `git push`) arrives as
  `subcommandResults` with no marker, so Auto-approve answers it; recorded in the evidence, ADR-002 Consequences,
  SECURITY.md and README with the workaround (a `PreToolUse` hook returning
  `ask` arrives as `hook` and gets a card). Risk: 4 × 3 = 12 → 12 without
  the hook, 4 × 1 = 4 with it. Value lost by option (a), a card for every
  compound command: most of Auto-approve's use for shell work. Owner: an
  upstream report asking Claude Code to mark a nested ask rule.
- Q6. The accepted limitation (Q5) is an exception to the constitution's
  *Consent first*, which requires in Auto-approve "a card for a call the
  CLI's rules or hooks flag": that call is rule-flagged and gets no card.
  The owner either accepts the exception explicitly or rewords the
  constitution (protected path), e.g. to "a card for a call Claude Code
  reports to the panel as flagged by its rules, hooks or safety checks".
