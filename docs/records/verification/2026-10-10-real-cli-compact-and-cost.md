# Verification — real-CLI checks for PRD-001 and PRD-005

**Verifier:** independent session (Claude Code subagent), driving the installed
CLI directly, not through the plugin
**Subject:** `chore/agentic-sdlc` at e10fd64 (plugin source read for the exact
launch flags and message shape; no plugin code ran)
**Date:** 2026-10-10

## Scope

Two open questions the PRD drafts could not settle from the code, each needing
one metered run against the real CLI, approved by the owner on 2026-10-10
(decision C19 in `docs/work/research/owner-decisions.md`):

1. PRD-001: does `/compact` still run when the plugin's context block precedes
   it in the same user message?
2. PRD-005: does a process resumed with `--resume` restart `total_cost_usd`
   from its own spend, or continue the session total?

CLI: `claude 2.1.296 (Claude Code)`, model `haiku`, two processes, about
$0.021 in total. Launch flags copied from `src/protocol/client.ts:199`:
`--output-format stream-json --input-format stream-json --verbose
--include-partial-messages --permission-prompt-tool stdio --model haiku`
(then `--resume <id>` for the second process); the `initialize` control
request first, then user messages of the plugin's shape. The context block was
the plugin's (`buildContext`, `src/view.ts:2701`): `<context>` … `</context>`,
two newlines, then the text, as `src/view.ts:2026` sends it. Working directory:
an empty folder, the same for both processes.

## Evidence

| Requirement/risk | Evidence | Result | Notes |
| --- | --- | --- | --- |
| PRD-001, context block before `/compact` | Message 2 = context block + `\n\n/compact`: events `system:init`, `system:status(requesting)`, `assistant` (thinking and a prose reply "Context compacted. Nothing substantive is in progress…"), `result:success` with `num_turns` 1 and 365 output tokens; no `compacting` status, no `compact_boundary`; cache read stayed near 27.7k tokens | fail: the text was sent to the model as a prompt | The model's reply claims a compaction that did not happen |
| PRD-001, bare `/compact` (control) | Message 3 = `/compact`: `system:status(compacting)`, `system:init`, `system:compact_boundary` `{"trigger":"manual","pre_tokens":47791,"post_tokens":5623}`, `user` summary, `user` `<local-command-stdout>Compacted</local-command-stdout>`, `result:success` with `num_turns` 0 | pass | The real command ran |
| PRD-005, cost across a resume | Process 1 (session `d743febf-…`): `total_cost_usd` 0.0082308 after the first call, 0.016337105 after `/compact`; clean exit. Process 2 with `--resume`, one call of 21,441 cache-creation, 26,663 cache-read and 100 output tokens: `total_cost_usd` 0.020942135; `modelUsage` cumulative (94,400 cache-creation tokens against 21,441 for this process) | continues the session total | The increment 0.004605 matches one call of that size; a restart would have reported about 0.0046 |

## Adversarial checks

- A killed process (SIGKILL or crash) was not tested; the persisted total
  could lag behind the last `result` event.
- Only `/compact` was tested; the CLI showed no slash-command exemption for a
  leading context block, so every slash command is assumed affected.

## Findings

1. **A leading context block breaks `/compact`** (and, by the same mechanism,
   any slash command). Resolution: PRD-001 requires that a message starting
   with `/` is sent without the context block and without attachments
   (owner decision C5).
2. **`total_cost_usd` is cumulative per session across processes.** Summing
   each process's total would double count. Resolution: PRD-005 takes the
   conversation's cost as the latest total the current session reports, and
   sums only across distinct session ids (owner decision C16, corrected).

## Disposition

`accepted`: both findings are written into PRD-001 and PRD-005 in the
baseline-acceptance commits of 2026-10-10. Event logs and the driver script
stayed in the verifier's scratch folder; they are CLI transcripts and are not
committed.
