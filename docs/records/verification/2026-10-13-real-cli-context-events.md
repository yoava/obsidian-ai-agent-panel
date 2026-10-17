# Verification — real-CLI clear, compaction, cache and agent events (E1–E7)

**Verifier:** the task 083 session (Claude Code subagent), driving the
installed CLI with a raw stream-JSON driver; no plugin code ran
**Subject:** `claude 2.1.296 (Claude Code)` on 2026-10-13; the evidence spike
of [change 002](../changes/CHG-002-context-events.md#evidence-spike), E5
and E6 for [change 003](../../work/changes/CHG-003-agents-and-workflows.md)
**Date:** 2026-10-13

## Scope

E1–E7, in the one metered session the owner approved on 2026-10-13 (owner
question O4).

- CLI `2.1.296 (Claude Code)`, `--model haiku` (reported as
  `claude-haiku-5-5`), native Linux. WSL: not run, no WSL on this machine.
- Cost: $0.096 reported across seven sessions (budget $2). The stopped
  workflow's two unfinished agents report no cost; at most a few tenths of a
  cent.
- Launch: the plugin's flags (`src/protocol/client.ts` `start()`):
  `--output-format stream-json --input-format stream-json --verbose
  --include-partial-messages --permission-prompt-tool stdio`, plus `--model
  haiku --replay-user-messages`, `--max-budget-usd` as a spend guard, and per
  run `--permission-mode default`, `--resume <id>` with or without
  `--fork-session`, or `--autocompact 100k`. Environment
  `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`; `initialize` first; user
  messages in the plugin's shape.
- Working directory: a fresh empty folder per run under the session
  scratchpad. The user's settings, hooks and plugins loaded, as they do for the
  plugin.
- Permissions: the driver allowed `Bash` `sleep N` and, in the workflow runs,
  `Workflow`; it denied every other prompt.

## Transcripts

The full sanitized transcripts are kept locally by the owner and not committed
(AGENTS.md: no transcripts in the repository). Runs: A (p1 clear, p2 fork and
rewind, p3 resume), B (automatic compaction), C-e5, C-e6 (two-phase
workflow), C-e6-wide (eight agents, then a stop).

Excerpts below are sanitized: session ids as `<session-N>`, other UUIDs as
`<uuid-N>`, tool-use ids as `<toolu-N>`, `…` for omitted fields. Event types,
field names, order and numbers are as the CLI sent them.

## E1 — `/clear` written to a running CLI

**Command:** run A, p1. Two turns in `<session-1>` ("alpha", "beta"), then
`set_permission_mode` `acceptEdits` and `set_model` `sonnet`, then the user
message `/clear`.

**Observed:** within 320 ms, the process still running:

```json
{"type":"conversation_reset","new_conversation_id":"<uuid-18>","uuid":"<uuid-18>","trigger":"clear","user_message_uuid":"<uuid-19>","timestamp":"…","session_id":"<session-1>"}
{"type":"system","subtype":"init","session_id":"<session-2>","model":"claude-sonnet-5-5","permissionMode":"acceptEdits",…}
{"type":"result","subtype":"success","is_error":false,"num_turns":0,"session_id":"<session-2>","total_cost_usd":0,"result":"",…}
```

The `/clear` message was not replayed and no `system/status` came. The next
prompt ran in `<session-2>`.

**Answer:** the process stays. `conversation_reset` (trigger `clear`, still
carrying the old session id) is followed by `system/init` with a new session
id and a zero-cost `result` with `num_turns` 0. The init reports the model and
mode set at runtime, not the launch flags. `new_conversation_id` is not the new
session id.

**Confidence:** high for this CLI version; one run of a local command.

**Decides:** PRD-001.R38 completes a written `/clear` on the following
`system/init`, whose `session_id` is the new session's. The re-apply clause is
a guard this version did not need. The 15 s fallback compares with about
0.3 s observed.

## E2 — resume, fork and rewind the session a clear ended

**Command:** after p1 exited: p2 `--resume <session-1> --fork-session`, then
`rewind_conversation` to the "beta" prompt's uuid, then a prompt asking for
every word replied earlier; p3 `--resume <session-1>`, the same prompt.

**Observed:**

- p2: rewind reply `{"rewound":true,"targetMessageUuid":"<uuid-…>","prefillText":"Reply with the single word: beta.","precedingAssistantUuid":"<uuid-…>"}`;
  init `<session-3>`; answer "alpha".
- p3: init `<session-1>`; answer "alpha, beta". "gamma", sent after the
  clear, is absent.

**Answer:** yes to both. The ended session stays intact and resumable after an
in-process clear, and a fork of it rewinds to one of its messages.

**Confidence:** high.

**Decides:** Undo by resuming the ended session (PRD-001.R38) and Branch on a
turn before a clear by forking that turn's own session (PRD-002.R15) work as
change 002 drafts them.

## E3 — automatic compaction

**Command:** run B with `--autocompact 100k` ("Auto-compact window size (auto,
or 100k–1M tokens)" in `claude --help`). `get_context_usage` then reported
`maxTokens` 100000 and an "Autocompact buffer" of 33000. Filler blocks of about
20k tokens, each ending "Reply with the single word: ok."

**Observed:** after block 2 the context held 72,841 tokens (73%). Compaction
ran at the start of the block 3 turn, before its model request:

```text
system/init, system/status "requesting"
{"type":"system","subtype":"status","status":"compacting","compact_output_chars":0}
  … 6.2 s, no stream events …
{"type":"system","subtype":"status","status":null,"compact_result":"success"}
user: replay of block 3
{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"auto","pre_tokens":81240,"post_tokens":13763,"cumulative_dropped_tokens":67477,"duration_ms":6200,"preserved_segment":{…},"preserved_messages":{…}},"logical_parent_uuid":"<uuid-…>"}
user, "isSynthetic":true: "This session is being continued from a previous conversation that ran out of context. … Summary: …"
assistant "ok"; result success, num_turns 2
```

Same session id; context afterwards 44,349 tokens.

**Answer:** yes, with differences. As for a bare `/compact`: `status`
`compacting`, `compact_boundary` with `pre_tokens` and `post_tokens`, the
summary as a `user` message. Different:

- `trigger` is `auto`.
- It runs inside the turn the user's prompt started; that turn's `result`
  follows the reply, and no result of its own comes.
- No `system/init` between `compacting` and the boundary.
- No `<local-command-stdout>Compacted` message.
- The summary message carries `isSynthetic: true`.
- `status: null` with `compact_result: "success"` ends the compacting status.
- The boundary adds `cumulative_dropped_tokens`, `duration_ms` and the
  preserved messages' ids.

**Confidence:** high for the event set; one automatic compaction seen, no
failed one.

**Decides:** PRD-001.R37 for automatic compaction: `status: compacting`
during a turn the user did not start with `/compact` shows "Compacting
automatically…"; the boundary fills the divider; `compact_result` other than
`success` is the candidate signal for "Compaction did not finish." The
synthetic summary must not render as the user's prompt.

## E4 — one-hour and five-minute cache writes

**Command:** every model response in runs A to C.

**Observed:** `usage.cache_creation` `{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":30414}`
on the `message_start` stream event, on the `assistant` message, on the
`result` (summed) and on each `result.usage.iterations[]` entry. Every
main-agent write was a one-hour write. Every write by the E5 subagents
(`assistant` messages with `parent_tool_use_id` set) was a five-minute write,
for example `{"ephemeral_5m_input_tokens":25426,"ephemeral_1h_input_tokens":0}`.
The E5 `result.usage.cache_creation` was
`{"ephemeral_1h_input_tokens":25157,"ephemeral_5m_input_tokens":0}`: the
result carries the main agent's writes only, without the subagents'
five-minute writes.

**Answer:** yes; the two lifetimes are separate fields, and both occur in one
session.

**Confidence:** high.

**Decides:** PRD-005.R11 takes one hour when the main agent's last response
had `ephemeral_1h_input_tokens` > 0, five minutes otherwise, reading only
messages with `parent_tool_use_id` null; a subagent's five-minute writes must
not shorten the main agent's countdown.

## E5 — `stop_task` on one foreground subagent

**Command:** run C e5. One prompt asking for two foreground `general-purpose`
Agent calls in one message, each told to `sleep 40`; after both
`task_started`, `stop_task` with the first one's `task_id`.

**Observed:**

- `task_started` per subagent: `{"task_id":"af949ed91c9c0b09d","tool_use_id":"<toolu-…>","description":"sleeper one","subagent_type":"general-purpose","is_backgrounded":false,"spawn_depth":1,"task_type":"local_agent","prompt":"Run the Bash command `sleep 40`, …"}`.
- Before the stop: the CLI's built-in Bash guard refused a bare `sleep 40`
  (`"<tool_use_error>Blocked: standalone sleep 40. To wait for a condition, use Monitor …"`),
  so each subagent ran the sleep in the background and the first one armed a
  Monitor. Those calls reached no prompt; the CLI accepted them from settings
  (`"permission_decision":{"decision":"accept","source":"config"}`). Both
  subagents were mid-run when the stop came.
- On `stop_task`: after 6 ms, `task_updated` `{"patch":{"status":"killed","end_time":…}}`
  and `task_notification` `{"status":"stopped","summary":"sleeper one",…}`
  for that subagent, and the reply `{}` success; after 21–22 ms, the same pair
  for each background task it owned. Its Agent `tool_result` became
  `"[Request interrupted by user for tool use]"`, `is_error: true`.
- The other subagent ran on: its own Monitor call, after the stop, reached
  the driver and was denied
  (`{"behavior":"deny","message":"Denied by the spike driver."}`); it then
  ended with `task_updated` `{"patch":{"status":"completed",…}}` and
  `task_notification` `completed`. The turn ended with `result` success.

**Answer:** yes. `stop_task` with a foreground subagent's `task_id` stops that
subagent and the tasks it owns; its sibling and the main turn continue.

**Confidence:** high.

**Decides:** the per-agent stop clauses of change 003 (PRD-001.R18 and R36,
"WHERE the CLI can stop a single subagent") hold.

## E6 — a group of agents in the stream

**Command:** the CLI lists a `Workflow` tool in `system/init`. Run C e6: a
two-phase script (red and blue in parallel, then green). Run C
e6-wide-stop: eight agents in one phase, then `stop_task` with the
workflow's `task_id`.

**Observed:**

- `Workflow` asks permission (`can_use_tool`), then runs in the background:
  `background_tasks_changed`, `task_started` `{"task_type":"local_workflow","workflow_name":"spike-group","description":"Spike: two phases of tiny agents","prompt":"<the script>",…}`,
  and the tool result "Workflow launched in background. Task ID: …". The turn
  ends with its own `result`. On completion the CLI starts a turn with no user
  message: `system/init`, `status`, `assistant`, `result`. That `result`
  carries `"origin":{"kind":"task-notification","producer":"session-task","runId":"…"}`;
  results of turns the user started carry no `origin`.
- `task_progress`, some carrying `workflow_progress`, a full snapshot each
  time:
  `{"type":"workflow_phase","index":1,"title":"First"}` per phase, and per
  agent
  `{"type":"workflow_agent","index":1,"label":"red","phaseIndex":1,"phaseTitle":"First","agentId":"…","model":"claude-haiku-5-5","state":"done","startedAt":…,"queuedAt":…,"attempt":1,"promptPreview":"Reply with the single word: red.","promptFramed":true,"lastProgressAt":…,"tokens":23696,"toolCalls":0,"durationMs":2324,"resultPreview":"red"}`.
  Workflow-wide `usage` `{total_tokens, tool_uses, duration_ms}`;
  `description` names the latest "<phase>: <label>".
- States seen: `start`, `progress`, `done`. A queued agent is `state: "start"`
  with `queuedAt` but no `startedAt` or `agentId`. With eight agents, six
  started and two queued on this 8-CPU machine. No field states the cap; that
  it is min(16, CPUs − 2) is an inference from the Workflow tool's own
  reference text, which the stream does not carry.
- End: `task_updated` `{"status":"completed","end_time":…}`, then
  `task_notification` `{"status":"completed","summary":"Dynamic workflow \"…\" completed","usage":{…}}`.
- `stop_task` on the workflow's `task_id`: success, `task_updated` `killed`,
  `task_notification` `stopped`; no final snapshot, no new turn.
- Workflow agents send no `assistant` or `user` messages. Phase `detail`,
  `log()` text and cost per agent or workflow do not appear. The session's
  `total_cost_usd` includes the agents.
- Foreground Agent-tool subagents (E5) form no group: each is a `local_agent`
  task with its prompt in `task_started`, its activity in
  `task_progress.description` and `last_tool_name`, tokens, tool uses and
  duration in `usage`, its end in `task_updated.end_time`, and its output in
  the Agent `tool_result`. Their tool calls stream as messages with
  `parent_tool_use_id`.

**Answer:** yes, for `Workflow` runs. The stream names the workflow and its
phases and, per agent, the label, phase, model, state, queue and start times,
duration, tokens, tool calls, and previews of prompt and result. It does not
carry the concurrency, a waiting state apart from queued, any cost, the full
prompt or output, the agent's steps, or `log()` lines.

**Confidence:** high for the fields seen. Preview truncation length unknown
(every result was one word). Stopping one agent inside a workflow not tested:
no workflow agent's id appeared as a `task_id`.

**Decides:** PRD-001.R36 stays, under its own fallbacks: no " · M at a time",
no cost (tokens only), "Prompt" and "Output" from the previews, nothing for
"All steps" on workflow agents, and "Stop workflow" as `stop_task` on the
workflow's `task_id`. Per-agent stop buttons apply to Agent-tool subagents
only.

## E7 — `total_cost_usd` after an in-process `/clear`

**Command:** run A, p1, the turn after `/clear`.

**Observed:** `<session-1>` stood at 0.01031644 before the clear; the clear's
`result` reported 0; the next turn's 0.00429546 equals that turn's own usage
(20,696 one-hour cache-write and 15,356 cache-read tokens) alone.

**Answer:** reset; the new session's total starts at zero.

**Confidence:** high.

**Decides:** PRD-005.R7's carried-total clause is not folded (change 002 folds
it only if carried).

## Other findings

1. A forked session's `total_cost_usd` includes its source's: p2's first
   total, 0.01376828, is `<session-1>`'s 0.01031644 plus its own call. A
   Branch tab's total counts the source's spend again; PRD-005.R7 does not
   address this yet.
2. A resumed session continues its total (p3: 0.01214955), as the
   [2026-10-10 record](2026-10-10-real-cli-compact-and-cost.md) found.
3. A background workflow's completion starts a turn with no user message, so
   the plugin receives `system/init` … `result` it did not ask for; the
   result's `origin.kind` `task-notification` marks it (E6).
4. `system/init` arrives at the start of every turn.
5. `set_model` adds a replayed user message
   `<local-command-stdout>Set model to …</local-command-stdout>` to the
   session.

## Not covered

- WSL.
- `/clear` while a turn, an agent or a background task runs (R38's held clear
  and "Stop and clear").
- Resuming or forking the cleared session while the process that cleared it
  still runs (E2 resumed it after that process exited).
- A failed compaction; a main-agent five-minute cache write.
- Stopping a backgrounded Agent-tool subagent; stopping one agent inside a
  workflow.
- A failed workflow; workflow agents' cache lifetimes.

## Disposition

`accepted` after independent review (task 083). The clauses of changes 002
and 003 that name an E number are rewritten at their approval, not here.
