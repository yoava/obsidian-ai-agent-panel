# Verification — task 110: `/clear` in the panel against the real CLI, owner run

**Verifier:** the owner, in an Obsidian vault with the installed CLI; the
implementing sessions saw none of it
**Subject:** the plugin built from branch `chore/agentic-sdlc` (the head-mark
ring of task 135 not included), run on 2026-10-14 and 2026-10-17 against the
installed Claude Code CLI on native Linux and under a WSL profile; the manual
checks of [change 002](../changes/CHG-002-context-events.md#design-and-migration-impact)
*Verification*, the by-hand items of
[ADR-018](../../current/adr/ADR-018-conversation-segments-for-clear.md#validation)
*Validation* and the manual rows of the
[DES-003 matrix](../../current/design/DES-003-panel-ui.md#verification) for
PRD-001.R38
**Date:** 2026-10-17

## Scope

The 22 steps of the task 110 owner checklist (five groups: no agent, held
clear, background agent, WSL, upgrade from 0.5.0), which replay through the
panel the shapes the raw-driver records
[V1–V10](2026-10-13-real-cli-clear-undo.md) and
[W1–W3](2026-10-13-real-cli-compact-branch.md) established against the CLI.

- Model: Haiku 5.5 (the picker). CLI version and tokens spent: not reported.
- Prompts: short single-word replies, as the checklist prescribes.
- The owner chose which steps to run; every step not run below is marked as
  the owner's judgment, not as a failure or a gap found later.

## Evidence

| # | Check | Result |
| --- | --- | --- |
| a | Enter then `/clear` quickly with a slow CLI start | ok (owner, 2026-10-14) |
| b | The tab shows the CLI's mode after a clear | ok (owner, 2026-10-14) |
| c | Undo from the divider | works (owner, 2026-10-14) |
| 1 | Clear: divider, sub-line, Undo, dimming, fold | ok: divider, sub-line and dimming shown (owner, 2026-10-17); the fold not reported |
| 2 | Unfold button and rail tick | not run (owner judged it not needed, 2026-10-17) |
| 3 | Reopen, then Undo | Undo ok: the divider and dimming went, the resumed session answered and still had the first prompt in context (owner, 2026-10-17); the reopen before Undo not reported |
| 4 | Undo disabled while a mode pick is pending | not run (owner judged it not needed, 2026-10-17) |
| 5 | Dark and light at 340, 440 and 600 px; exported note | not run (owner judged it not needed, 2026-10-17) |
| 6 | Branch on a turn before the clear (V10 shape) | not run (owner judged it not needed, 2026-10-17) |
| 7 | Restore hidden on turns before a clear | not run (owner judged it not needed, 2026-10-17) |
| 8 | Held clear with a permission card and a queued message | not run (owner judged it not needed, 2026-10-17) |
| 9 | Cancel on a held clear | not run (owner judged it not needed, 2026-10-17) |
| 10 | Queued-echo timing (sizes task 108's 3 s grace) | not run (owner judged it not needed, 2026-10-17) |
| 11 | Ask dialog with a running agent | not run (owner judged it not needed, 2026-10-17) |
| 12 | Cancel in the dialog | not run (owner judged it not needed, 2026-10-17) |
| 13 | Stop and clear | not run (owner judged it not needed, 2026-10-17) |
| 14 | First message after Stop and clear | not run (owner judged it not needed, 2026-10-17) |
| 15 | Held clear released with an agent running | not run (owner judged it not needed, 2026-10-17) |
| 16 | `/clear` behind a background workflow's own turn | not run (owner judged it not needed, 2026-10-17) |
| 17 | Settings changed during Undo: "Could not undo the clear." | not run (owner judged it not needed, 2026-10-17) |
| 18 | WSL: clear, Undo | ok (owner, 2026-10-17) |
| 19 | WSL: Stop and clear | not run (owner judged it not needed, 2026-10-17) |
| 20–22 | Upgrade from 0.5.0 keeps the four security settings (task 116) | not run (owner judged it not needed, 2026-10-17); the automated cases are in `tests/settings-core.test.mjs` (PRD-001.R24) |

The ADR-018 by-hand items:

| Item | Result |
| --- | --- |
| WSL for the V1–V10 shapes | clear and Undo (V1's shape) ok under WSL (step 18); the held clear, Stop and clear and fork shapes not run |
| A `/clear` written while a background workflow's own turn runs | not run (step 16); the automated case runs over the fake CLI (`tab-clear-flow`) |
| Branch to a turn before a compaction in the same session | answered against the real CLI by [W2](2026-10-13-real-cli-compact-branch.md#w2--branch-to-a-turn-before-a-compaction) and task 097; not repeated through the panel |

## Adversarial checks

None by hand. The races (a clear during a turn, a pending mode pick, agents
still running, a settings change during Undo) are covered by the
`node:test` suites ADR-018 *Validation* names over the fake CLI, not by this
run.

## Findings

None reported. The path exercised, `/clear` then Undo on a fresh session
under native Linux and WSL, behaved as PRD-001.R38 states.

## Not covered

- Every row marked not run above, by the owner's judgment of 2026-10-17; the
  rows stay available in the checklist for a later release.
- Sonnet and Opus (the run used Haiku), native Windows, macOS.
- Step 10's echo timing: task 108's 3 s grace stays as sized from the
  2026-10-13 raw-driver run.

## Disposition

`accepted` by the owner on 2026-10-17, on the evidence above and the
automated suites. Task 110 closes with this record; it was listed in
`docs/current/plan.md` only (no task file was opened), so the plan entry is
removed in the same commit. The DES-003 matrix rows for PRD-001.R38 that this
run did not reach stay owed in the plan's change 001 entry.
