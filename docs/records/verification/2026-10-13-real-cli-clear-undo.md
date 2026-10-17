# Verification — real-CLI Undo, held clear, Stop and clear, fork base, Branch rewind (V1–V10)

**Verifier:** the task 087 session (Claude Code subagent), driving the
installed CLI with a raw stream-JSON driver; no plugin code ran
**Subject:** `claude 2.1.296 (Claude Code)` on 2026-10-13; the real-CLI checks
in [ADR-018](../../current/adr/ADR-018-conversation-segments-for-clear.md#validation)
*Validation* and [change 002](../changes/CHG-002-context-events.md)
**Date:** 2026-10-13

## Scope

V1–V10, in the second metered session the owner approved on 2026-10-13
(Haiku or Sonnet, at most $19.90).

- CLI `2.1.296 (Claude Code)`, `--model haiku` (reported as
  `claude-haiku-5-5`), native Linux. WSL: not run, no WSL on this machine.
- Cost: $0.1198 reported, net of the source totals that resumes and forks
  carry (budget $19.90): D 0.0166, E 0.0084, F 0.0233, G1-blocked 0.0122,
  G 0.0144, G3 0.0081, H 0.0205, I 0.0120, R 0, R2 0.0043. Stopped subagents and
  workflow agents report no cost; at most a few tenths of a cent.
- Launch, environment, handshake and message shape as in the
  [task 083 record](2026-10-13-real-cli-context-events.md#scope): the
  plugin's flags plus `--model haiku --replay-user-messages
  --max-budget-usd 0.5 --permission-mode default`, per run `--resume <id>`
  with or without `--fork-session`; V8 adds `--settings` or one environment
  variable.
- Working directory: a fresh empty folder per run under the session
  scratchpad; V6 adds a second one. The user's settings, hooks and plugins
  loaded.
- Permissions: the driver allowed `Bash`, `Workflow`, and in V3 a held
  `Write`; it denied every other prompt. Calls the user's settings accept
  reached no prompt.
- Two facts come from the installed CLI's bundled JavaScript, not from the
  stream: the cache-lifetime rules (V8) and the rewind field
  `last_seen_user_message_uuid` (V10). Both are undocumented.

## Transcripts

The sanitized transcripts are kept locally by the owner and not committed
(AGENTS.md). Runs: D (clear, then resume and forks while the clearing process
runs, empty post-clear session), E (Undo-style resume after exit, another
working directory, unknown id), F (held clear), G1-blocked and G (Stop and
clear; G3 a stop after completion), H (compaction failures, five-minute
cache), I (Branch rewind, never cleared), R (rewind refusals, no model
calls), R2 (branch point and nested fork).

Excerpts: session ids as `<session-N>`, other UUIDs as `<uuid-N>`, `…` for
omitted fields; event types, field names, order and numbers as sent.

## V1 — a promptless `--resume` of a cleared session

**Question:** does it answer `get_context_usage`, and with what?

**Command:** run E: one turn in `<session-1>`, `/clear`, exit. Then
`--resume <session-1>`, `initialize`, `get_context_usage`, no prompt;
again 2 s later. Run D p5 did the same while the clearing process still ran.

**Observed (run E):** `initialize` answered after 1.26 s, the request 1.41 s
later:

```json
{"subtype":"success","response":{"categories":[…,{"name":"Messages","tokens":14569},…],"totalTokens":30410,"maxTokens":300000,"percentage":10,"model":"claude-haiku-5-5","apiUsage":{"input_tokens":2,"output_tokens":5,"cache_creation_input_tokens":17686,"cache_read_input_tokens":12722},…}}
```

`totalTokens` is the last turn's input, cache-write and cache-read tokens
(2 + 17,686 + 12,722). The second call returned the same `totalTokens`; its
categories had changed (MCP tools listed once connected, `Messages` 12,135).
No `system/init` and no `result` came without a prompt. Run D p5: success
after 1.23 s, `totalTokens` 36,768.

An unknown id (`--resume` with a well-formed UUID no session has): stderr
`No conversation found with session ID: …`, then
`{"type":"result","subtype":"error_during_execution","is_error":true,"num_turns":0,"errors":["No conversation found with session ID: …"]}`,
the error result at 0.85 s, exit code 1 at 1.70 s; `initialize` never
answered.

**Answer:** yes. It answers successfully with the ended session's context as
of its last turn, under 3 s from spawn. A session the CLI does not hold
fails at once: an error `result`, then exit 1.

**Confidence:** high; two cleared sessions, one unknown id.

**Decides:** Undo as ADR-018 designs it (complete on a parsed reply; fail on
an exit) works; 15 s covers it. The fake-CLI Undo scenarios take these
shapes.

## V2 — resume and fork while the clearing process runs

**Command:** run D p1: three turns ("alpha", "beta", "gamma") in
`<session-1>`, `/clear` (new `<session-2>`), p1 kept running. Meanwhile p2
`--resume <session-1> --fork-session`; p3 a fork of p2's session; p5
`--resume <session-1>`. Each asked for every word replied earlier.

**Observed:** p2 init `<session-3>`, answer "alpha, beta, gamma"; p3
`<session-4>`, the same; p5 init `<session-1>`, the same, its total continuing
`<session-1>`'s (0.00947264 → 0.01004232). p1 stayed on `<session-2>`.
Seen on disk, not in the stream: the CLI's file for `<session-1>` holds p5's
turn.

**Answer:** yes to both. The clearing process no longer writes the ended
session; another process resumes it under its own id or forks it.

**Confidence:** high.

**Decides:** Undo and Branch need not wait for the tab's CLI to exit;
ADR-018's choice to stop it first is not forced by the CLI.

## V3 — `/clear` written while a turn runs

**Command:** run F. (a) A turn asks for a `Write`; while its `can_use_tool`
waited, the driver wrote `/clear`, waited 4 s, then allowed. (b) A long reply;
`/clear` written at its first text delta.

**Observed:** nothing at the write: no replay, no event, no reply. The turn
ran on; in (a) its permission request was answered and applied. Then:

```text
(a) result "written" (num_turns 2, queued_turn_count 0)
    +9 ms   conversation_reset {"trigger":"clear",…,"session_id":"<session-1>"}
    +32 ms  system/init <session-2>; result num_turns 0, total 0
(b) result of the long reply
    +689 ms conversation_reset …; init; zero result
```

The next prompt answered "none" in both: the clear applied.

**Answer:** queued. The CLI holds the `/clear` until the running turn ends,
then clears with E1's events. The turn's `result` does not count it in
`queued_turn_count`.

**Confidence:** high for these two cases; cancelling a queued `/clear` was
not tested.

**Decides:** R38's held clear can rely on the CLI's queue or hold the
`/clear` in the panel; the panel hold remains needed for "Cancel" and for
the messages held behind it. A `result` before `conversation_reset` belongs
to the turn, not to the clear.

## V4 — Stop and clear

**Command:** run G1: one turn starting two foreground `general-purpose`
Agent calls (each running `timeout 50 tail -f /dev/null`) and a background
Bash `sleep 120`; 3 s later `stop_task` for each task, then `interrupt`;
4 s later `stop_task` again for each and for an unknown id; then `/clear`.
Run G2: a background workflow of two slow agents; once the main turn had
ended, `stop_task` for the workflow, `interrupt`, the repeats, `/clear`.
(G1-blocked, a first attempt, used `sleep 50`: the CLI's Bash guard refused
it, so both subagents completed before the stop.)

**Observed:**

- Each `stop_task` on a running task: within 3–5 ms,
  `task_updated {"patch":{"status":"killed","end_time":…}}` and
  `task_notification {"status":"stopped",…}`, then the reply
  `{"subtype":"success","response":{}}`.
- `interrupt` with the turn running: reply `{"still_queued":[]}` in 2 ms;
  the stopped Agent calls' tool results become errors ("The user doesn't
  want to proceed with this tool use…"), then
  `user "[Request interrupted by user for tool use]"` and, 45 ms after the
  interrupt, `result` `"subtype":"error_during_execution","is_error":true,"num_turns":5,"errors":["[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use"]`.
- `interrupt` with no turn running (G2): reply `{"still_queued":[]}`, no
  `result`.
- Workflow stop: `task_updated` killed and `task_notification` stopped for
  the workflow, and `background_tasks_changed {"tasks":[]}`; no final
  progress snapshot, no new turn. The Bash tasks its agents owned
  (`task_started` carried `"owned_by_subagent":true`) each got a
  `task_notification` `stopped` with an empty `output_file` and no
  `task_updated`, 1 and 11 ms after the `interrupt` reply. The stop and the
  interrupt came too close to tell which one ended them.
- `stop_task` for a task already killed, one that completed before the stop
  (run G3), or an unknown id: `{"subtype":"success","response":{}}`, no events.
- `/clear` 4 s after the stops: `conversation_reset` in 8–11 ms, then init
  and the zero `result`.

**Answer:** stops are immediate and each ends in `task_updated` killed (Agent,
background Bash, workflow) or `task_notification` stopped (every task,
including tasks a workflow's agents owned). The `stop_task` reply is success
in every case seen, so it reports nothing about whether a task stopped.
Interrupt ends a running turn with an `error_during_execution` result and
answers without a result when no turn runs. A clear right after works.

**Confidence:** high for these kinds; a stop that fails was not produced.

**Decides:** ADR-018 Stop and clear, step 2's "a stop answered with an
error for a task already in a terminal state" does not occur on this
version; "Could not stop every agent" can come only from the 15 s
quiescence timeout, with `task_notification` as the end signal that covers
every task. After an interrupt with no turn running, quiescence must not
wait for a `result`. The interrupted turn's `error_during_execution` result
ends that turn.

## V5 — a failed compaction

**Command:** run H. h1: `/compact` as the first message. h2: one turn, then
`/compact`. h3: two turns, `/compact`, `interrupt` 400 ms after
`status: compacting`, then a prompt asking for the earlier words.

**Observed:**

- h1, no `status`:
  `assistant` `{"model":"<synthetic>","content":[{"type":"text","text":"Error: No messages to compact"}]}` with
  `"local_command_source":"<local-command-stderr>Error: No messages to compact</local-command-stderr>"`,
  then `result` success, `num_turns` 0.
- h2 succeeded: `status` `compacting`, after 4.4 s
  `{"status":null,"compact_result":"success"}`, `system/init`,
  `compact_boundary` (`trigger` `manual`, 30,423 → 3,973), the summary as a
  synthetic `user` message, `<local-command-stdout>Compacted </local-command-stdout>`,
  `result` num_turns 0. A one-turn session is not a failure.
- h3: interrupt reply `{"still_queued":[]}`, then
  `{"type":"system","subtype":"status","status":null,"compact_result":"failed","compact_error":"API Error: Request was aborted."}`,
  `system/init`, synthetic `assistant` "Compaction canceled." (from
  `<local-command-stdout>`), `result` success, `num_turns` 0, total
  unchanged. The next answer was "beta, alpha": nothing was lost.

**Answer:** a compaction that starts and fails reports
`compact_result: "failed"` with `compact_error`; one that cannot start (empty
session) sends no status, only an error text as a synthetic assistant
message and a normal `result`.

**Confidence:** high for these two failures; an API error during compaction
was not produced.

**Decides:** R37's failure clause: `compact_result` other than `success`
covers the interrupt; the "turn that sent `/compact` ends without a
compaction report" clause covers the empty session. The synthetic assistant
texts are the CLI's own messages (model `<synthetic>`), not replies.

## V6 — `--resume` across working directories

**Command:** run E p3: `--resume <session-1>` from a second empty folder,
then a prompt.

**Observed:** `get_context_usage` succeeded; the prompt answered "alpha" in
`<session-1>` with `system/init` reporting the new folder as `cwd`. Seen on
disk, not in the stream: the CLI appended the turn to the session's file in
the original folder's project directory; the new folder's project directory
got no session file.

**Answer:** yes. `--resume` reaches a session recorded under any working
directory of the same CLI configuration.

**Confidence:** high.

**Decides:** ADR-018 owner decision 1: a substituted id can select any
session on the machine, not only this vault's; the impact score stays as
stated, the "drops to sessions of this vault" mitigation does not apply.

## V7 — fork cost base

**Command:** run R2: fork run D's `<session-1>` (total 0.01004232; four
prompts), rewind to the second prompt ("beta"), prompt; then fork that fork
and prompt. Run D p2 and p3 forked without a rewind.

**Observed:**

| Session | Base it forked from | First `total_cost_usd` | Own turn |
| --- | --- | --- | --- |
| R2 branch at "beta" | 0.01004232 | 0.01355466 | 0.00351234 |
| R2 fork of that branch | 0.01355466 | 0.01438807 | 0.00083341 |
| D p2 fork, no rewind | 0.00947264 | 0.01058577 | 0.00111313 |
| D p3 fork of p2 | 0.01058577 | 0.01215965 | 0.00157388 |

The branch answered "alpha" (history cut at "beta"), yet its total includes
the three turns after the branch point.

**Answer:** a fork's total starts from its source's whole total at the fork,
whatever the rewind; a fork of a fork from its parent's, which already holds
the grandparent's.

**Confidence:** high.

**Decides:** ADR-018 *Fork base*: base = the source session's latest raw
total at the fork, not its total at the branch point; raw bases subtract
correctly for nested forks.

## V8 — a main-agent five-minute cache write

**Command:** run H: h4 `--settings '{"promptCacheTtl":"5m"}'`; h5 with
`CLAUDE_CODE_PROMPT_CACHE_TTL=5m` in the environment. One turn each.

**Observed:** h4 `assistant` usage
`"cache_creation":{"ephemeral_5m_input_tokens":30547,"ephemeral_1h_input_tokens":0}`,
the same on its `result`; h5 `{"ephemeral_5m_input_tokens":14040,"ephemeral_1h_input_tokens":0}`.
Every other main-agent write in these runs was one-hour. The bundled code
picks five minutes also with `FORCE_PROMPT_CACHING_5M`, and by default for a
login that is not a subscription or a request source outside a one-hour
allowlist (subagents read `subagentPromptCacheTtl` and
`CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` instead).

**Answer:** yes: a user setting or environment variable, and per the code a
non-subscription login, gives the main agent five-minute writes.

**Confidence:** high for the setting and the variable; the login case,
`FORCE_PROMPT_CACHING_5M`, the request-source allowlist and the subagent
setting and variable are read from code, not run.

**Decides:** PRD-005.R11 reads the lifetime from the main agent's last write
rather than assuming one hour; the five-minute branch is reachable.

## V9 — the empty post-clear session

**Command:** run D: after p1's `/clear`, nothing sent. p4 `--resume
<session-2>` while p1 ran; p6 after p1 exited, then a prompt.

**Observed:** seen on disk, not in the stream: the session file exists from
the clear, holding the `/clear` command entries. Both resumes answered `get_context_usage` with `Messages`
130 tokens and `"apiUsage":null` (`totalTokens` 17,557 and 15,906, an
estimate). p6's prompt ran in `<session-2>`, the same id.

**Answer:** yes, before any message, both while the clearing process runs
and after it exits.

**Confidence:** high.

**Decides:** nothing in R38 depends on it: storing the new id only at the
first message stays a design choice, not a CLI limit. A context-usage reply
with `apiUsage` null is an estimate.

## V10 — Branch's rewind on a session never cleared

**Question:** does the fork's rewind that Branch issues reach an earlier
turn, and what history does the branch see?

**Plugin path:** Branch always forks; the plugin never rewinds without a
fork. `src/view.ts:1328` `branchFrom` → `src/tab/restore-branch.ts:163`
`branch` → `src/view.ts:1353` `link.branchFrom` (`src/tab/session-link.ts:104`
sets `fork` and the rewind uuid) → `src/tab/session-link.ts:134`
`rewindOnStart` → `src/session.ts:180` `deliver`, which awaits
`client.rewindConversation` before the first message and ignores its reply →
`src/protocol/client.ts:396` `rewindConversation`, which sends only
`target_message_uuid` and `interrupt_if_running`.

**Command:** run I: three prompts ("alpha", "beta", "gamma") in
`<session-1>`, no clear, exit. Then twice `--resume <session-1>
--fork-session`, `rewind_conversation` to the first prompt as Branch sends
it, (a) as the plugin sends it, (b) adding `last_seen_user_message_uuid`
= the third prompt's uuid; then "List every earlier prompt I sent you in
this conversation, verbatim, one per line, oldest first. If there are none,
reply none."

**Observed:**

```json
(a) {"subtype":"rewind_conversation","target_message_uuid":"<uuid-3>","interrupt_if_running":true}
    {"rewound":false,"prefillText":null,"precedingAssistantUuid":null,"error":"stale target","reason":"stale_target"}
(b) {"subtype":"rewind_conversation","target_message_uuid":"<uuid-3>","interrupt_if_running":true,"last_seen_user_message_uuid":"<uuid-27>"}
    {"rewound":true,"targetMessageUuid":"<uuid-3>","prefillText":"Reply with the single word: alpha.","precedingAssistantUuid":null}
```

(a) answered all three prompts ("Reply with the single word: alpha.",
"… beta.", "… gamma."); (b) answered "none".

**Answer:** no. Without `last_seen_user_message_uuid` the CLI refuses any
rewind target that later prompts follow, cleared or not, and the branch
keeps the source's whole history. With it, the rewind cuts the fork at the
target.

**Confidence:** high; the same on a cleared session (other finding 1).

**Decides:** a shipped Branch defect on CLI 2.1.296 (PRD-002.R15): Branch on
any turn but the latest keeps every later turn in context, without notice.
`rewindConversation` must send `last_seen_user_message_uuid` (the source's
latest prompt uuid), and `deliver` must act on `rewound: false` instead of
sending as if cut.

## Other findings

1. On a cleared session too, a fork's rewind refused every target but the
   latest prompt (run R: four targets, with and without a 3 s wait; run D
   p2) and rewound with `last_seen_user_message_uuid` (run R2). V10 states
   the consequence for Branch.
2. The task 083 E2 rewind succeeded because its target was the source's
   latest prompt.
3. `interrupt` replies `{"still_queued":[]}`, listing queued messages; with a
   `/clear` queued it was not tested.
4. Manual `/compact` sends `compact_result: "success"` before
   `system/init` and the boundary, as automatic compaction does (E3).
5. A turn interrupted while subagents ran reports `error_during_execution`
   with `stop_reason: "tool_use"` in its diagnostic, not a success.

## Not covered

- WSL (V1–V10).
- A `stop_task` that fails; stopping one agent inside a workflow; an agent
  started during the stop.
- Cancelling a queued `/clear`; a `/clear` queued behind a background
  workflow's own turn.
- A compaction failing on an API error.
- A rewind on a non-forked resume (the plugin never sends one);
  `allow_summarized_target`.
- Sonnet: every run used Haiku.

## Disposition

`accepted` after independent review (task 087). ADR-018 and change 002 are
rewritten from these answers at their approval, not here.
