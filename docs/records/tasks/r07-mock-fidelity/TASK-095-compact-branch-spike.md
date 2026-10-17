---
status: closed
release: r07-mock-fidelity
number: 095
prd: none (evidence for PRD-001.R37 and PRD-002.R15)
---

# TASK-095 — Real-CLI evidence for manual compaction, Branch across a compaction and set_model

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Answer three real-CLI questions with one metered session, approved by the
owner on 2026-10-13: Haiku where the behaviour does not depend on the model,
about $1, hard cap $1.50 in total.

- W1 a manual `/compact` typed as a user message: the event sequence, the
  `<local-command-stdout>` user message (uuid, synthetic, replayed), whether it
  or the boundary is an accepted rewind point, and a Branch (fork and rewind
  as the plugin makes it) from the first turn after it.
- W2 a Branch to a turn before a compaction boundary (automatic or manual):
  success, the exact error, or the summary kept; what the fork sees.
- W3 `set_model` mid-conversation, and the `/model` path: anything replayed
  on stdout, with which uuids and flags; double-counted cost or usage.

Acceptance:

1. `docs/records/verification/2026-10-13-real-cli-compact-branch.md` gives the
   CLI version and, per W: question, command, sanitized excerpts, answer,
   confidence, and what it means for the code (file and line, and whether
   `tests/fake-cli.mjs` matches); it stands without the transcripts.
2. The sanitized transcripts stay outside the repository: no session id,
   UUID, home path, user name, host, e-mail, MCP server name or CLI path
   slug; event types, field names, order and numbers kept.
3. Each run's cost is logged; the total stays within the cap.
4. WSL is recorded as not run.

## Scope

Expected files: the record and this task.

Negative scope: no transcript in the repository; no edit to `src/`,
`tests/`, any ADR, PRD, design or change document, `styles.css`; no protected
path; no `RELEASE_NOTES.md` entry (records only); no CLI run in a vault or the
repository; no real-CLI use beyond this task's runs.

## Plan

- Task 083's and 087's method: a raw stream-JSON driver with the plugin's
  flags and environment, logging every line both ways, `claude` resolved on
  `PATH` without a shell, a fresh empty folder per run under the scratchpad,
  `--max-budget-usd 0.5` per process; raw logs outside the repository.
- Runs: w1 (a session with a manual `/compact` in the middle; forks that
  rewind to the first turn after it, to the stdout message, the boundary and
  the summary, and to two turns before it); w2 auto (`--autocompact 100k`,
  reference blocks that compact twice; forks to turns before, at and after
  the boundaries); w3 (`set_model` to Sonnet and back, a Sonnet turn, a typed
  `/model`); w3b and w3c (the same without `/model`, idle and mid-turn, no
  turn on Sonnet, forks that rewind and a `rewind_files` dry run).
- Sanitizer as 087's: numbered placeholders for ids, paths, user, host and
  CLI path slug replaced, MCP server and tool names, account and rate-limit
  data and bulky lists elided, strings over 240 characters truncated.
- Verification: `make verify` exits 0; on the local transcripts and the
  record, a grep finds none of `/home`, the user name, `@`, the host name,
  `-tmp-claude`, MCP server names, an `apiKeySource` value, a UUID, `toolu_`
  or `msg_0`, on each line and on the `partial_json`, `text` and `thinking`
  deltas joined per content block.

## Run log

- Base: worktree reset onto `chore/agentic-sdlc` (unmodified tree); the shared
  `node_modules` symlinked, not staged.
- The worktree guard refuses compound and heredoc commands; the driver
  scripts were written to the gitignored `tmp/` as `*.off` files and copied to
  the scratchpad one by one.
- Surprises: the stdout replay of `set_model` and of the manual compaction is a
  plain `user` message with a uuid (record, W1 and W3); the first W3 run's
  rewinds all failed `unseen_later_turn`; the chain ended with the
  `set_model null` stdout message and the likely cause is the typed `/model`
  (latest user message, no echoed uuid), inferred, so W3b and W3c repeated the
  `set_model` checks without it; `set_model` to the model already in use
  replays nothing, so W3c used real changes with no turn on Sonnet.
- Cost: w1 session $0.0143, its forks $0.0179; w2 auto $0.0398, its forks
  $0.0165; w3 $0.1028, w3b $0.0093, w3c $0.0086; rewind-only forks $0; total
  $0.2092 reported, net of carried source totals (cap $1.50).
- Not run: WSL (none on this machine); Sonnet for compaction and rewind.

## Independent review

Independent review agent, 2026-10-13: approve after edits. W1-W3 confirmed
against the transcripts and raw logs; sanitization grep clean; references
verified. Findings, all fixed: the w3 rewind failures named the typed
`/model` as fact (now "likely", trailing `set_model` message named); w3b's
call count (three); w3c's `set_model` count; an unmatched "task 087 H2"
citation; unlinked E3 and V7; Disposition unfilled.

## Outcome

`accepted`.
