---
status: closed
release: r07-mock-fidelity
number: 087
prd: none (evidence for proposed ADR-018 and draft change 002)
---

# TASK-087 — Real-CLI evidence for Undo, held clear, Stop and clear and fork base

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Answer the real-CLI checks of
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md#validation)
*Validation* and [change 002](../../changes/CHG-002-context-events.md) as V1–V10
with one metered real-CLI session, approved by the owner on 2026-10-13: Haiku
or Sonnet, total `total_cost_usd` at most $19.90.

- V1 a promptless `--resume` of a cleared session answering
  `get_context_usage`; V2 resume and fork while the clearing process runs;
  V3 a `/clear` written during a turn; V4 Stop and clear with foreground
  agents, a background task and a workflow, including a stop for an ended
  task; V5 a failed compaction; V6 `--resume` across working directories;
  V7 the fork cost base after later source turns and for a nested fork; V8 a
  main-agent five-minute cache write; V9 resuming the empty post-clear
  session; V10 Branch's fork rewind to an earlier turn on a session never
  cleared, with and without `last_seen_user_message_uuid`, and the
  plugin's call path.

Acceptance:

1. `docs/records/verification/2026-10-13-real-cli-clear-undo.md` gives the CLI
   version and, per V: question, command, sanitized excerpts, answer,
   confidence, and what it decides in ADR-018 or change 002; it stands
   without the transcripts.
2. The sanitized transcripts stay outside the repository: no session id,
   UUID, home path, user name, host, e-mail, MCP server name or CLI path
   slug; event types, field names, order and numbers kept.
3. Each run's cost is logged; the total stays within budget.
4. WSL is recorded as not run.

## Scope

Expected files: the record and this task.

Negative scope: no transcript in the repository; no edit to ADR-018, change
002, any PRD, `src/`, `tests/` or `styles.css`; no protected path; no
`RELEASE_NOTES.md` entry (records only); no CLI run in a vault or the
repository.

## Plan

- Task 083's method: a raw stream-JSON driver with the plugin's flags and
  environment, logging every line both ways, `claude` resolved on `PATH`
  without a shell (the installed binary), a fresh empty folder per run,
  `--max-budget-usd 0.5` per process.
- Runs: D (V2, V7 without rewind, V9, V1 while the clearer runs), E (V1
  after exit, V6, an unknown id), F (V3 with a held permission and during
  streaming), G (V4 agents and a background task; a workflow; G3 a stop after
  completion), H (V5 empty, tiny and interrupted compaction; V8 by setting
  and by environment), R and R2 (rewind refusal, then V7 with a branch
  point), I (V10, added at the coordinator's request within the same
  approval).
- Sanitizer as 083's: numbered placeholders for ids, paths, user, host and
  CLI path slug replaced, MCP server and tool names, account and rate-limit
  data and bulky lists elided, compaction summaries truncated.
- Verification: `make verify` exits 0; on the local transcripts of 083 and
  087 and on the record, `grep` finds none of `/home`, the user name, `@`,
  the host name, `-tmp-claude`, MCP server names, an `apiKeySource` value, a
  UUID, `toolu_` or `msg_0`, both on each line and on the `partial_json`,
  `text` and `thinking` deltas joined per content block.

## Run log

- Base: worktree reset onto `chore/agentic-sdlc` (unmodified tree).
- The worktree guard refused `source ~/.nvm/nvm.sh` and `env PATH=…` in
  compound commands; Node ran by its absolute path. Driver scripts lived in
  the worktree's gitignored `tmp/`.
- Surprises: the CLI's Bash guard refuses `sleep N && …` in subagents (first
  G1 attempt; `timeout N tail -f /dev/null` used instead); the user's settings
  auto-accept `echo`, so V3 held a `Write` prompt; a fork's rewind to any
  but the latest prompt answers `stale_target` (record, V10),
  which makes the shipped Branch keep full history on earlier turns.
- Cost: D $0.0166, E $0.0084, F $0.0233, G1-blocked $0.0122, G $0.0144,
  G3 $0.0081, H $0.0205, I $0.0120, R $0, R2 $0.0043 reported, net of
  carried source totals; total $0.1198.
- Not run: WSL (none on this machine); Sonnet.

## Independent review

Independent review agent, 2026-10-13: approve with changes. Findings, all
fixed:

1. Leak: in the local `run-f.jsonl`, `input_json_delta` fragments joined into
   the scratch path with the user name and the session UUID. Fixed: those
   fragments replaced by `<scratch>/run-f/probe.txt` and empty strings; the
   delta-joined check over both evidence folders (50 blocks) and the
   line-level pattern list find nothing.
2. Verification lacked the delta join and `apiKeySource`. Fixed in the Plan.
3. V2, V6 and V9 facts read from the CLI's session files were not marked.
   Fixed: labelled "seen on disk, not in the stream".
4. V4: the owned Bash tasks' stops came 1–11 ms after the interrupt reply,
   and `background_tasks_changed {"tasks":[]}` came from the workflow stop,
   not the Bash task. Fixed: the record says stop and interrupt are not
   separated there and attributes the event to the workflow stop.
5. V8 confidence omitted `FORCE_PROMPT_CACHING_5M`, the request-source
   allowlist and the subagent setting and variable as read from code. Fixed.
6. V1 unknown id: error result at 0.85 s, exit at 1.70 s. Fixed.
7. The record's cost line omitted G1-blocked, G3 and R, and rounded figures
   did not sum to the total. Fixed: every run at four decimals, sum $0.1198,
   in the record and the run log.
8. Spec said V1–V9. Fixed: V1–V10.

## Outcome

`accepted`. Lesson: stream deltas must be joined before a sanitization grep.
