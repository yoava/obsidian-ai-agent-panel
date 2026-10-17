# Verification — real-CLI manual compaction, Branch across a compaction, and set_model (W1–W3)

**Verifier:** the task 095 session (Claude Code subagent), driving the
installed CLI with a raw stream-JSON driver; no plugin code ran
**Subject:** `claude 2.1.296 (Claude Code)` on 2026-10-13; the compaction and
model-switch handling of PRD-001.R37 and the Branch rewind of PRD-002.R15
**Date:** 2026-10-13

## Scope

W1–W3, in the third metered session the owner approved on 2026-10-13 (about
$1, hard cap $1.50).

- CLI `2.1.296 (Claude Code)`, `--model haiku` (reported as
  `claude-haiku-5-5`), native Linux. WSL: not run, no WSL on this machine.
  W3 also ran two turns on `claude-sonnet-5-5`.
- Cost: $0.2092 reported, net of the source totals that forks carry (cap
  $1.50): W1 session 0.0143; its forks charlie 0.0060, ask-stdout 0.0052,
  alpha 0.0034, bravo 0.0033; the rewind-only forks 0. W2 auto session
  0.0398; its forks echo 0.0038, b2 0.0037, b3 0.0051, fox 0.0039, b1 0.
  W3 session 0.1028 (a Sonnet turn: 0.0991); W3b 0.0093; W3c 0.0086; their
  rewind-only forks 0.
- Launch, environment, handshake and message shape as in the
  [task 083 record](2026-10-13-real-cli-context-events.md#scope): the
  plugin's flags (`src/protocol/client.ts:287`) plus `--model haiku
  --replay-user-messages --max-budget-usd 0.5 --permission-mode default`;
  W2's automatic run adds `--autocompact 100k`; a fork adds `--resume <id>
  --fork-session`. `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`;
  `initialize` first; user messages in the plugin's shape.
- Branch as the plugin makes it: the fork above, then `rewind_conversation`
  with `target_message_uuid`, `interrupt_if_running: true` and
  `last_seen_user_message_uuid` = the source's latest real prompt
  (`src/session.ts:245`, `src/protocol/client.ts:399`), then the first
  message. Most forks stopped after the rewind (no model call) and read
  `get_context_usage`; the forks that asked a question sent: "List every
  codeword I asked you to remember in this conversation, and quote every
  earlier prompt of mine you can still see, verbatim, one per line. If you
  see none, say none."
- Working directory: a fresh empty folder per run under the session
  scratchpad. The user's settings, hooks and plugins loaded. The driver
  denied every permission prompt; none came.
- Sessions: W1 `[ALPHA7, BRAVO8, /compact, CHARLIE9, DELTA3]`; W2 automatic
  `[ECHO5, three 20k-token reference blocks b1–b3, FOXTROT6, GOLF1]`; W3
  `[HOTEL4, set_model, question, /model, set_model]`; W3c
  `[INDIA1, set_model ×2 (idle), JULIET2, a counting prompt with a mid-turn
  set_model (after the turn), set_model ×2]`. Codewords are placeholder words the prompts
  ask Claude to remember.

## Transcripts

The sanitized transcripts are kept locally by the owner and not committed
(AGENTS.md: no transcripts in the repository). Runs: w1 (session, three
branches that asked, three that did not), w2 manual (two failed branches),
w2 auto (session and five branches), w3, w3b, w3c (sessions and their
rewind-only forks, one `rewind_files` dry run).

Excerpts are sanitized: session ids as `<session-N>`, other UUIDs as
`<uuid-N>`, `…` for omitted fields; numbering restarts in each excerpt. Event
types, field names, order and numbers are as the CLI sent them. Summary and
reference-block texts are truncated.

## W1 — a manual `/compact` typed as a user message

**Question:** the full event sequence; is the `<local-command-stdout>` user
message carrying a uuid, synthetic or replayed; is it or the boundary an
accepted rewind point; does Branch from the first turn after it work, and
what does the fork contain?

**Command:** run w1, one process: two turns, the user message `/compact`,
two more turns. Then forks of its session.

**Observed (the `/compact` turn, 10.2 s):**

```text
in   user "/compact"                      (never echoed back)
out  system/status  {"status":"compacting"}                       (no "requesting")
out  system/status  {"status":null,"compact_result":"success"}
out  system/init
out  system/compact_boundary  {"compact_metadata":{"trigger":"manual","pre_tokens":36810,"post_tokens":5313,"cumulative_dropped_tokens":31497,"duration_ms":10201,"preserved_segment":{"head_uuid":"<uuid-1>","anchor_uuid":"<uuid-2>","tail_uuid":"<uuid-3>"},"preserved_messages":{…}},"logical_parent_uuid":"<uuid-3>"}
out  user  {"content":"This session is being continued from a previous conversation …","uuid":"<uuid-2>","isReplay":false,"isSynthetic":true}
out  user  {"content":"<local-command-stdout>Compacted </local-command-stdout>","uuid":"<uuid-4>","isReplay":true}
out  result {"subtype":"success","num_turns":0,"total_cost_usd":0.01158526}
```

`<uuid-3>` is the pre-compaction reply to BRAVO8 (the preserved tail), not a
user message. The next turn's `system/init` and `requesting` came as usual,
and its prompt echo was a normal `user` with `isReplay: true`. The boundary,
the summary and the stdout message each carry a `uuid`; the summary content is
a string here (an automatic compaction's is a block array).

Rewinds on forks of the session, each with `last_seen_user_message_uuid` =
the DELTA3 prompt (the latest real prompt):

| Target | Reply | Fork context (`get_context_usage`, an estimate) |
| --- | --- | --- |
| CHARLIE9 prompt (first turn after) | `rewound: true`, `precedingAssistantUuid` = the preserved tail `<uuid-3>` | 23,217 tokens, Messages 7,433 |
| the `<local-command-stdout>` message | `rewound: true`, same `precedingAssistantUuid`, `prefillText` = the stdout text | 16,789 tokens, Messages 1,005 |
| the synthetic summary message | `rewound: true`, `precedingAssistantUuid: null` | 15,793 tokens, Messages 10 |
| the `compact_boundary` uuid | `rewound: false`, `error: "target not found"`, `reason: "target_not_found"` | unchanged |

Asked what they remember: the CHARLIE9 fork answered "Codewords: ALPHA7 and
BRAVO8" and quoted both earlier prompts "as far as the summary preserves
them"; CHARLIE9 and DELTA3 were absent. The stdout fork answered the same
(ALPHA7, BRAVO8, from the summary). A rewind to the summary leaves the fork
with no history at all (Messages 10 tokens). The summary text, 2,240 characters
here, also names the user's MCP servers and the scratch folder's transcript
path.

**Answer:** the stdout message is a user message with a uuid, `isReplay: true`
and no `isSynthetic`, so it looks like a prompt echo; it is a member of the
conversation chain and the CLI accepts it as a rewind target. The boundary is
not (a system message: `target_not_found`). The summary is accepted but cuts
away the summary itself. A Branch from the first turn after the compaction
works and the fork holds the summary plus the preserved tail, not the turns
after the target. The `/compact` text is never echoed.

**Confidence:** high for the sequence, the flags and the four rewinds (one
manual compaction, plus the same order in the [task 087 record](2026-10-13-real-cli-clear-undo.md#v5--a-failed-compaction) (h2)); one
compaction only, no `/compact` with instructions, and the stdout message's
uuid was not checked as a `last_seen_user_message_uuid` (no earlier target
survives a compaction that is the last turn).

**Decides:**

- `src/state/stream.ts:247-257` `userMessage` takes any non-synthetic `user`
  message with a uuid as a prompt echo. The stdout message is one, so the
  manual `/compact` turn's `rewindUuid` is the stdout message's uuid
  (`src/tab/chat-tab.ts:422-425`, `:620`) and not a prompt of the user's.
  A Branch there rewinds to it and works, with the fork holding the summary;
  Restore files on it would fail (W3, `rewind_files`), but a `/compact` turn
  edits no file, so none is offered (`src/restore.ts:34`). Nothing breaks
  today, but the assumption "an echoed non-synthetic user message is the
  user's prompt" is false for `<local-command-stdout>` messages.
  `src/state/compaction.ts:78` rightly skips it (`isSynthetic !== true`).
- `tests/fake-cli.mjs:1245` (`compact-manual`) sends the stdout message
  without a `uuid` or `isReplay`, so no test reaches the path above; the
  event order matches the real one (status, success, init, boundary, summary,
  stdout, result). The fake's summary of a manual compaction (`:1244`) is a string, as
  here; of an automatic one (`:1231`) it is a string, where the real one is a
  block array (the code reads both, `src/state/compaction.ts:47`).
- `prefillText` is read by no plugin code, so the stdout text it returns for
  that target is harmless.

## W2 — Branch to a turn before a compaction

**Question:** does the rewind succeed, fail with which error, or keep the
summary; what does the fork see?

**Command:** the forks of W1's session, and a second session (run w2 auto)
that compacts twice by itself: `--autocompact 100k`, ECHO5, three reference
blocks of about 20k tokens each ("Reply with the single word: ok."), then
FOXTROT6 and GOLF1. Each fork rewound with `last_seen_user_message_uuid` =
the GOLF1 prompt.

**Observed (automatic run):** the compaction ran inside b2's turn and again
inside b3's (`pre_tokens` 76,439 to 20,360, then 68,352 to 20,138); in each,
the turn's prompt was echoed once, after the boundary's `compact_result`, as
a normal `user` with a fresh uuid, then the boundary, then the synthetic
summary (a block array).
Rewinds:

| Target | Reply |
| --- | --- |
| manual run: ALPHA7, BRAVO8 (before the boundary) | `rewound: false`, `error: "target not found"`, `reason: "target_not_found"` |
| automatic run: ECHO5, b1, b2 (before the second boundary; b2 triggered the first) | the same refusal |
| automatic run: b3 (triggered the second compaction) | `rewound: true`, `precedingAssistantUuid` set; `prefillText` = the whole reference block |
| automatic run: FOXTROT6 (after both) | `rewound: true` |

A refused rewind does not stop the fork: it kept the whole conversation, and
asked what it remembered it listed ALPHA7, BRAVO8, CHARLIE9 and DELTA3 (manual
run), and ECHO5, FOXTROT6 and GOLF1 with the reference block (automatic run,
the summary's paraphrase of the earlier ones). After the b3 rewind the fork
answered "ECHO5" from the compaction summary, quoted the first prompt and
"Here is reference text …" as paraphrased by the summary, said the block body
was not in its context, and knew nothing of FOXTROT6 or GOLF1. After the
FOXTROT6 rewind it saw ECHO5 and the preserved b3 prompt, and neither later
codeword. BRAVO8's prompt is not a valid target although its reply sits in the
manual run's preserved segment: the preserved segments keep assistant
messages and the turn that triggered an automatic compaction, not earlier
prompts.

**Answer:** a Branch to a turn the compaction summarized away fails with
`rewound: false`, reason `target_not_found`, and cuts nothing; it never keeps
the summary and rewinds around it. A target at or after the compaction (the
turn that triggered an automatic one, the first turn after a manual one)
works, and the fork keeps the summary.

**Confidence:** high for the refusal (five prompt targets, both triggers) and
the fork contents; one run per trigger.

**Decides:**

- `src/session.ts:245-262` `rewindBranch` turns `rewound: false` into
  `onBranchFailed` and sends nothing; `src/state/branch-failure.ts:17` says
  "Claude Code no longer has it.", which is accurate here. No code assumes
  the target survives a compaction, but nothing tells the user why: the
  Branch control (`src/ui/turn.ts:706`) is offered on a turn that a
  compaction summarized away and then always fails. A candidate for the
  ADR-018 / DES-004 text: name compaction as the usual cause.
- A turn's `rewindUuid` is the first non-synthetic echo of the turn, so the
  turn that triggered an automatic compaction records the post-boundary
  replay uuid ([E3](2026-10-13-real-cli-context-events.md#e3--automatic-compaction)), which the CLI accepts (b3 above); the code needs no
  change for it.
- `tests/fake-cli.mjs:797` `rewindConversationReply` models `target_not_found`
  only for a uuid absent from `FAKE_CLI_SOURCE_PROMPTS` and does not drop
  prompts when a compaction scenario runs; a test of "Branch to a summarized
  turn" must list the prompts without it.

## W3 — `set_model` mid-conversation

**Question:** does the CLI replay anything on stdout (local-command-stdout,
earlier messages, init), with which uuids and flags; any double-counted
cost or usage?

**Command:** run w3: HOTEL4, `set_model` `sonnet`, `get_context_usage`, a
question (on Sonnet), the user message `/model haiku`, `set_model` `null`.
Run w3b: `set_model` `haiku` on a Haiku session (no change), three calls: idle, once
during a turn, and after it. Run w3c: real changes Haiku to Sonnet and back, idle, during
a turn, and last; no turn ran on Sonnet. The plugin sends only `set_model`
(`src/protocol/client.ts:387`); its panel commands do not include `/model`
(`src/commands.ts:31`), so a typed `/model` reaches the CLI as a message.

**Observed (idle `set_model`, run w3):**

```text
in   control_request {"subtype":"set_model","model":"sonnet"}
out  user  {"content":"<local-command-stdout>Set model to `sonnet (claude-sonnet-5-5)`</local-command-stdout>","uuid":"<uuid-1>","isReplay":true}
out  control_response {"subtype":"success"}                    (same millisecond; no "response" field)
```

- No `system/init`, no `result`, no `status`, no change in
  `total_cost_usd`. The next turn's `system/init` reports the new model
  (`claude-sonnet-5-5`); `get_context_usage` before it already reports it.
- `set_model` `null` sent the same message with ``Set model to `claude-opus-5-5` ``
  (the CLI's default for this account), and a reply without a payload.
- Setting the model the session already uses sends no stdout message
  (run w3b: three calls, one mid-turn).
- During a running turn (run w3c) the message came after the turn's prompt
  echo and before the `result`; the turn finished normally.
- Cost: the Sonnet turn's `result.total_cost_usd` was 0.10277322 =
  0.00367302 (Haiku) + 0.0991002 (Sonnet); `modelUsage` lists each model once
  with its own counts; the turn's `usage` equals the Sonnet entry. No count appears twice. The first turn on the new model wrote
  its whole context to the cache (cache write 24,436 tokens, read 12,722)
  because the cache is per model.
- `/model haiku` typed as a message: `system/init`, a synthetic `assistant`
  message (`model: "<synthetic>"`, `local_command_source` carrying
  ``<local-command-stdout>Set model to `Haiku 5.5` for this session only``), a
  `result` with `num_turns: 0` and the unchanged total. No `user` replay, no
  uuid for the command.
- In run w3 every rewind to an earlier prompt answered
  `unseen_later_turn`, whichever `last_seen` it named. The chain ended with
  the `set_model null` stdout message (``Set model to `claude-opus-5-5` ``).
  The likely cause is the typed `/model haiku`, the latest user message,
  which echoes no uuid, so no id the panel holds could be right; this is
  inferred, not isolated (the same `last_seen` works in run w3c). Other typed
  commands that echo no uuid likely block Branch the same way; only `/model`
  was run.
- The stdout message is a real chain member and a rewind target, but not a
  prompt: on a fork of run w3c's session (the latest real prompt `<uuid-4>`):

| Rewind | Reply |
| --- | --- |
| target INDIA1, `last_seen` = latest real prompt | `rewound: true` |
| target INDIA1, `last_seen` = the last `set_model` stdout message | `rewound: false`, `unseen_later_turn` |
| target JULIET2 (the prompt after two set_models), `last_seen` = latest real prompt | `rewound: true` |
| target a `set_model` stdout message, `last_seen` = latest real prompt | `rewound: true`, `precedingAssistantUuid` = the reply before it |
| target the latest real prompt, `last_seen` = itself | `rewound: true` |

  `rewind_files` (dry run) on the same session: a prompt uuid answers
  `canRewind: true`; a `set_model` stdout uuid answers
  `canRewind: false`, `error: "No file checkpoint found for this message."`

**Answer:** yes, it replays one thing: a `user` message with a uuid,
`isReplay: true` and no `isSynthetic`, holding `<local-command-stdout>Set
model to …</local-command-stdout>`, in front of the `control_response`, on
every real change, idle or mid-turn. Nothing else is replayed; cost and usage
are not double counted. The CLI does not count the message as a user prompt
for `last_seen_user_message_uuid`.

**Confidence:** high for the message, its position and the cost; three runs,
six idle changes and one mid-turn change; `set_model` with an unavailable model was
not run.

**Decides:**

- `src/state/stream.ts:247-257` treats the replay as a prompt echo
  (`message.uuid` set, not synthetic), and `src/tab/chat-tab.ts:422-425`
  keeps it in `turnUuid` and `lastEcho`. Two consequences, neither guarded:
  1. Idle before a turn (the model picker used between turns): the stdout
     uuid is the turn's first echo, so the turn's `rewindUuid`
     (`:620`) is the stdout message and `lastPromptUuid` (`:621`) the real
     prompt. A Branch on that turn still cuts at the right place (the
     stdout message sits directly before the prompt), but Restore files
     (`src/restore.ts:33-34`) would send a uuid with no checkpoint and
     fail, for an edited turn.
  2. During a turn: `lastEcho` becomes the stdout uuid, recorded as the
     turn's `lastPromptUuid`; `src/state/branch-history.ts:22` returns it as
     the source's latest prompt, so every later Branch to an earlier turn
     sends it as `last_seen_user_message_uuid` and the CLI refuses with
     `unseen_later_turn` (table above) until another turn is sent. The user
     sees "the original conversation has messages this panel did not see"
     (DES-004) with nothing unseen.
  The same applies to the manual-compaction stdout message (W1). The
  candidate fix is in `userMessage`: skip a message whose text starts with
  `<local-command-stdout>` (or `<local-command-stderr>`), as the summary is
  skipped.
- `tests/fake-cli.mjs:899-902` answers `set_model` with a bare success and
  sends no replay, so the fake does not match; a faithful scenario replays
  the stdout `user` message (with `uuid`, `isReplay: true`) before the reply
  and nothing on a no-change call.
- `src/session.ts:487` `setModel` and `src/protocol/client.ts:387` wait for
  the `control_response` only; the extra message before it needs no handling
  there.

## Other findings

1. A manual compaction takes about 10 s on a 37k-token context; an
   automatic one 5-7 s on 70k ([E3](2026-10-13-real-cli-context-events.md#e3--automatic-compaction) saw 6.2 s); the `compacting` status
   arrives within 5 ms of the message.
2. The compaction summary (and so a rewind reply's `prefillText`) includes
   the user's MCP server names, the scratch folder's path and the transcript
   path; the sanitizer truncated it, and the plugin never shows it except in
   the divider's Summary toggle.
3. A fork's total starts from its source's whole total, as in [V7](2026-10-13-real-cli-clear-undo.md#v7--fork-cost-base): every
   fork here reported at least the source's total (costs above are net).

## Not covered

- WSL (W1–W3).
- A compaction with instructions (`/compact <text>`); a `/compact` queued
  behind a running turn; a compaction failing on an API error (task 087 V5).
- A Branch from the stdout message with `last_seen` = that message; a rewind
  across a compaction of a session compacted three or more times.
- `set_model` with a model the account lacks (the fake's
  `FAKE_CLI_REFUSE_MODEL` path); a model switch before the first turn.
- Sonnet for W1 and W2: every compaction and rewind used Haiku.

## Disposition

`accepted` after independent review (task 095). Follow-ups: task 096 for
the `<local-command-stdout>` replay read as a prompt echo (W1, W3); task 097
for Branch to a turn before a compact boundary (W2). The typed command
without a uuid blocking Branch (W3) is recorded, not scheduled. This record
changes no code, ADR or change.
