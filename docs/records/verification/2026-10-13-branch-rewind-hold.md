# Verification — a branch keeps its rewind until it is cut (task 092)

**Verifier:** the task 092 implementer, with a headless harness that runs the
real `SessionLink` and `Recorder` (bundled, `obsidian` stubbed) against the
fake CLI (`tests/fake-cli.mjs`); no real CLI, no transcripts
**Subject:** [PRD-002](../../current/product/PRD-002-permissions-and-change-control.md)
R15 after task 092
**Date:** 2026-10-13

## Checks

Fake CLI scenario `basic`; the source holds three prompts, the branch's target
is the second.

| # | Steps | Expected | Result |
| --- | --- | --- | --- |
| 1 | Branch naming a stale latest prompt; first send is refused; the link drops the session (a profile change); the source's latest is updated; send again | the new fork is rewound with the new latest, then the message follows | pass |
| 2 | Branch naming the right latest; first send succeeds; drop the session; send again | one rewind in all; the new process runs `--resume` on the branch's own session id, without `--fork-session` | pass |
| 3 | As 2, with an effort change instead of the drop | no second rewind, no fork on the respawn | pass |
| 4 | Branch opened (conversation created), nothing recorded | the conversation holds no messages | pass |
| 5 | A panel command, then a `!` run, are the conversation's first records | the branch record leads, once; kinds `meta, user, user`; its source, target and latest are the branch's | pass |

| 6 | The fork's turn ends with a `result` and no `init` (`FAKE_CLI_NO_INIT`); effort change; send again | the conversation takes the fork's session id; the respawn resumes it without `--fork-session`; one rewind in all | pass |
| 7 | The first rewind is refused, the fork takes 700 ms to exit (`FAKE_CLI_SIGTERM_DELAY_MS`); the session is dropped at once; send again | the first process has exited when the second starts; the second is rewound | pass |

Result: all seven pass. Checks 2 and 3 cover the link's `onBranchCut` handler
(resume id set to the branch's session, fork off).

## Not verified

The real CLI, and a rendered reopen of a recorded branch (a node test covers
that `pendingBranch` finds it).
