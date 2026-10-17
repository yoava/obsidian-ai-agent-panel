---
status: closed
release: r07-mock-fidelity
number: 083
prd: none (evidence for draft changes 002 and 003)
---

# TASK-083 — Real-CLI evidence for clear, compaction, cache and agent events

## Spec

Answer E1–E7 of the evidence spike in
[change 002](../../changes/CHG-002-context-events.md#evidence-spike) (E5 and E6
also serve [change 003](../../../work/changes/CHG-003-agents-and-workflows.md)) with one
metered real-CLI session, approved by the owner on 2026-10-13 (owner question
O4): Haiku, total `total_cost_usd` at most $2.

Acceptance:

1. `docs/records/verification/2026-10-13-real-cli-context-events.md` gives the
   CLI version and, per E: question, command, observed events with sanitized
   excerpts, answer, confidence, and what it decides; it stands without the
   transcripts.
2. The sanitized transcripts stay outside the repository (AGENTS.md: no
   transcripts committed): no session id, UUID, home path, user name, host,
   e-mail, MCP server name or CLI path slug; event types, field names, order
   and numbers kept.
3. Each run's cost is logged; the total stays within budget.
4. WSL is recorded as not run.

## Scope

Expected files: the record and this task.

Negative scope: no transcript in the repository; no edit to changes 002 or
003, any PRD, `tests/fake-cli.mjs` (implementation tasks derive scenarios),
`src/` or `styles.css`; no protected path; no `RELEASE_NOTES.md` entry
(records only, nothing user-visible); no CLI run in a vault or the
repository.

## Plan

- Raw driver mirroring `ClaudeClient.start()`'s flags and environment, logging
  every line both ways; `command claude` resolved to the installed binary.
  Rejected: the bundled `ClaudeClient`, which hides control responses.
- Run A: E1, E7, E4 in one process; E2 by fork-and-rewind and by plain resume
  of the cleared session. Run B: E3 with `--autocompact 100k` (documented in
  `--help`) and filler blocks. Run C: E5 with two foreground subagents; E6
  with the `Workflow` tool, two phases, then eight agents and a stop.
- `--max-budget-usd` per process as a spend guard.
- Sanitizer: ids mapped to numbered placeholders, paths, names and CLI path
  slugs replaced, bulky lists elided.
- Verification: `make verify` exits 0; on the local transcripts and the
  record, `grep` finds none of `/home`, the user name, `@`, the host name,
  `-tmp-claude`, MCP server names, an `apiKeySource` value, a UUID
  (`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`), `toolu_`
  or `msg_0`.

## Run log

- Base: the worktree started on `main`; switched to `chore/agentic-sdlc`
  (unmodified tree) per the brief.
- The protected-path hook blocks writes outside the repository, including the
  scratchpad; driver scripts lived in the worktree's gitignored `tmp/`, and
  only the CLI's working folders and raw logs sat in the scratchpad.
- Cost: run A $0.020 (p1 0.0146, p2 0.0035, p3 0.0018), run B $0.025, E5
  $0.018, E6 $0.014, E6 wide $0.019 reported; total $0.096.
- Not run: WSL (none on this machine).

## Independent review

Independent review agent, verdict approve with changes. Findings and
resolution:

1. Transcripts committed against AGENTS.md: moved out of the repository to the
   owner's machine; the record now quotes every excerpt its answers need and
   says the transcripts are kept locally.
2. Sanitization gaps (MCP server names in the compaction summary, CLI path
   slugs, `apiKeySource`): replaced or elided in the local copies; the record
   carries none.
3. E5 accuracy: the `sleep` block is the CLI's built-in Bash guard, not a user
   hook; the background sleep and first Monitor were accepted from settings
   (`source: "config"`); the sibling's later Monitor was denied by the driver
   and the sibling still completed; 6 ms holds for the subagent, 21–22 ms for
   its owned tasks. Corrected.
4. E4: the `result` usage carries the main agent's one-hour writes only, not
   the subagents' five-minute writes. Stated.
5. E6: the concurrency cap is marked as inference; `result.origin.kind`
   `task-notification` added as the marker of the unrequested turn.
6. Not covered: added resume or fork while the clearing process runs,
   stopping a backgrounded Agent subagent, a failed workflow, workflow agents'
   cache lifetimes.
7. Subject line names the CLI version and date, not a commit; verification
   commands added to the Plan.

## Outcome

accepted
