---
status: closed
release: r07-mock-fidelity
number: 085
prd: PRD-001.R19
---

# TASK-085 — ADR-018 and change 002 ready for approval

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

L-change gate for change 002 (context events): the ADR its storage and
session model need, and the delta rewritten on the evidence, so the owner can
approve both. No behaviour changes here.

Governing: [ADR-000](../../../current/adr/ADR-000-adr-process.md);
[ADR-005](../../../current/adr/ADR-005-plugin-owned-conversation-history.md) and
[ADR-006](../../../current/adr/ADR-006-turn-checkpoints-and-branching.md), which
ADR-018 amends; PRD-001.R19 (today's `/clear`). Inputs: owner decisions of
2026-10-13 (build all of change 002; O1 (a); O2 as recommended); the
[evidence record](../../../records/verification/2026-10-13-real-cli-context-events.md)
(task 083).

Acceptance:

1. `docs/work/adr/ADR-018-conversation-segments-for-clear.md`, status proposed,
   from the ADR template: segments, clear records under `version: 2` and
   compaction records as optional `version: 1` additions, Undo, branch from
   the turn's own session, validation of every stored session id, the exact
   ADR-005 and ADR-006 clause changes (and any other current document's) as
   text ready to apply; at least two options, each with impact × probability
   inherent and residual, highest score, chance of an impact-4+ event, and
   value lost; the owner's decisions on session-id trust and history version
   with the rejected options' scores.
2. `docs/work/changes/CHG-002-context-events.md` rewritten in place: every clause
   that named an E number states the evidenced answer; O1 and O2 resolved and
   out of Depends on; re-apply kept as a guard (E1); automatic compaction
   clauses (E3); one-hour and five-minute reading from main-agent responses
   (E4); no carried-total clause (E7); a branch's fork base (a fork's
   total includes its source's); E5 and E6 removed with a pointer to change
   003; every finding of the reviews below closed.
3. Round 2: the owner decisions of 2026-10-13 (a session id is used only if
   this device recorded it, per conversation and CLI profile, with its
   store, record shape, foreign-conversation behaviour and pruning;
   `version: 2`) folded into both documents; every real-CLI placeholder
   replaced by the V record's answer (V1–V10), with ADR-018's dependence on
   task 088 stated.
4. `make verify` exits 0.

## Scope

Expected files:

- New: `docs/work/adr/ADR-018-conversation-segments-for-clear.md`, this task.
- Changed: `docs/work/changes/CHG-002-context-events.md`.

Negative scope: `docs/current/` (ADR-005, ADR-006, PRDs, designs), `src/`,
`tests/`, protected paths, change 003, `RELEASE_NOTES.md` (no user-facing
change).

## Plan

- Read the evidence record and transcripts list, ADR-005, ADR-006, change 001's
  owner questions, and the code each ADR claim cites.
- Options: today's new tab (A), in-process `/clear` with segments (B), a
  restart per clear (C), a file per segment (D), each with a risk table.

## Run log

- Worktree started on `main`; switched to `chore/agentic-sdlc` (unmodified).
- Added beyond the brief, flagged for review: a fork base for the branch's
  cost; after review it moved to the branch conversation and lands as its
  own task.
- The evidence record landed on `chore/agentic-sdlc` (35b8d98) during review;
  the worktree was fast-forwarded to it and the citations became links.
- Round 2 on `chore/agentic-sdlc` at c4610e9 (task 087's V record). Design
  changes the evidence or the owner's decisions forced:
  - Provenance settled as a device-local key with a per-conversation,
    per-profile shape, one-time grandfathering, 30-day pruning of
    conversations whose file is gone, and a foreign conversation that keeps
    its messages, starts a fresh session with a notice, and shows Branch and
    Undo disabled with a reason.
  - A fresh-start record bounds a segment when a session starts without
    resuming (foreign, rejected or failed resume), so a legacy turn never
    branches from the session that followed it.
  - `version: 2` for conversations holding a clear or a fresh start; option
    text removed.
  - The new session id is stored when the clear commits (V9), which also
    closes Codex round 2's lost-resume-target finding without a dispatch
    hook; the timeout restart resumes the new session.
  - A `result` before `conversation_reset` is a turn the CLI ran (V3), not a
    failed clear; the fallback is the 15 s timeout, paused during such a
    turn.
  - The held clear is held by the panel and written after the turn's
    `result` (V3).
  - Stop and clear ignores `stop_task` replies (success for any id, V4) and
    waits for `task_updated` or `task_notification`; "could not stop" comes
    only from the 15 s timeout or an exit.
  - Undo resumes in its own process while the tab's CLI keeps running (V2)
    and is adopted only on a parsed `get_context_usage` reply (V1); a failure
    stops only that process, so nothing of the tab needs restoring.
  - Branch names the segment's latest prompt as
    `last_seen_user_message_uuid` and depends on task 088 (V10).
  - V6 removed the vault-only mitigation; V7 confirmed the fork base; V8
    confirmed the five-minute branch of PRD-005.R11.
  - Amendments now also cover ADR-009, SECURITY.md and the ADR index.

## Independent review

Two reviews of the first draft, both "approve with changes": Codex
cross-review (session 01a134a4-e595-7ea2-9c2e-88fe245920da, static, read-only)
and the independent review agent. Dispositions, all fixed in the ADR and the
delta:

- Undo waits for an init a promptless resume never sends: Undo completes on a
  `get_context_usage` reply, as Restore does on `rewind_files`.
- Undo with no CLI completes at once and can fail silently: Undo always
  starts the CLI.
- Undo failure took the ordinary resume-failure path (null id): restores the
  stored id it had before Undo.
- E2 claimed beyond evidence: qualified (resumed after the clearing process
  exited); resume and fork while it runs, and a promptless resume, are
  real-CLI checks and Open.
- Stop and clear could hang on a workflow outliving its turn, or fail falsely
  (interrupt before `stop_task`): stops first, then interrupt; clear at
  quiescence, including tasks started meanwhile; 15 s abandonment returns
  held messages to the composer; an exit clears as without a process;
  pending permission cards denied first, late answers dropped.
- Empty post-clear session and two clears in a row: `/clear` is a no-op when
  no message to Claude Code followed the last clear; no resume id is stored
  until the new session's first turn finishes; Undo only on the latest
  clear.
- Clear was not a transaction: committed at the matching init, held through
  the consumed trailing `result` and the re-apply guard, keyed to the process
  generation, with every case of Codex's table defined.
- CLI without `conversation_reset`: a result without it fails at once; the
  fallback completes the clear by option C's restart instead of resuming the
  old session.
- Branch fallback could fork the wrong segment: source is the turn's id, else
  (legacy) the next clear's ended id, else the tab's session only when no
  clear follows; otherwise Branch is hidden; a rejected id never falls back.
- Fork base: moved to the branch conversation, captured when the fork starts,
  raw-total arithmetic, unknown is not zero (note shown); lands as its own
  task.
- `isSafeArgValue` blocks flags, not substitution or paths: lowercase-UUID
  grammar on load and at the argv boundary; ownership is owner decision 1.
- Version 1 is readable but behaviourally unsafe on downgrade: owner
  decision 2, recommending `version: 2` for conversations holding a clear.
- Impact gaps: SECURITY.md, DES-005 identity and validation table, DES-001
  file map, ADR index, one job per new module, permission cards under Stop
  and clear, pop-out windows: all listed in the delta's impact section and the
  ADR's design.
- Annual percentages removed; ordinal scores only, the impact-4+ chance
  stated as not quantifiable; C and D rescored with full tables (C's
  independence from `/clear` events counted, D's downgrade safety counted).
- Nits: one rule for the re-apply comparison; E4 inference qualified; the
  rollback note adds 0.5.x's last-turn `cost_usd`; compaction summary matched
  to its record by process generation.

Codex round 2 (same session): points 2 and 3 (with decision 2) closed; 1, 4,
5 and 6 partly. Dispositions, all fixed:

- Provenance was a vault-wide set and claimed to remove substitution: now
  bound to conversation and CLI profile; upgrade seeding stated as explicit
  grandfathering; described as provenance, not authorization.
- A rejected id became legacy absence after save and reload: rejected ids
  stay in the file as stored and are rejected again on reload.
- A crash in the first post-clear turn lost its resume target: the new id is
  stored when the clear commits (round 2, V9).
- Undo failure left the pre-clear context live: completion needs a
  successful, parsed reply to that request from that process generation; on
  failure the Undo process is stopped and the tab's session and link
  configuration restored before sends resume.
- Process exit taken as quiescence (a wrapper can exit while the CLI runs,
  DES-002): an exit during Stop and clear abandons the clear.
- The re-apply guard conflated panel and CLI modes: it compares the
  effective pre-clear CLI mode and model, maps explicit picks through
  `cliPermissionMode`, and keeps the Auto-approve policy apart.
- Known-but-incomplete fork bases: labelled estimates.
- Risk arithmetic: B's residual maximum is 5 (flag-or-path row), higher under
  the rejected options of decisions 1 and 2; Codex's six residual rows added
  to B and referenced from C and D.

Round 2 (owner decisions and the V record), "accept with changes" from Codex
and the independent review agent. Dispositions, all fixed in the ADR and the
delta:

- Grandfathering ran again after storage loss: a one-time migration marked
  by `sessionProvenanceMigrated` in `data.json`; a cleared device or one
  that receives the vault by sync seeds nothing (owner confirmation in
  Open); a profile this device lacks is not seeded; a malformed key reads as
  empty and seeds nothing. Rows 134 and 142 rescored.
- Fresh starts also force `version: 2`; compaction and the fork base stay
  optional `version: 1` additions.
- Fork base exact only when the panel recorded every turn of the source
  session since it began (its `started` list); otherwise an estimate. The
  base is re-read when task 088's retry forks again.
- Provenance store: shape validation (profile keys, timestamps, version,
  own-key access), serialized writes, a defined write failure, pruning by
  file name only after a successful listing (`src/history.ts:341` must stop
  marking a failed scan as done).
- Undo: offered only after the clear operation closes and never while
  another Undo is pending; its process stops when the tab closes and is
  never adopted after a launch-configuration change; the adopted process
  keeps the resumed id.
- Stop and clear: stops written without waiting, then `interrupt` even with
  no turn; one 15 s deadline; a task ends only at a known terminal status
  matched to its id and process generation.
- Clear transaction: the old id is the last reported id or the
  launched-to-resume id; the 15 s timer pauses during a CLI-run turn; models
  compare through `settings.resolvedModels`; a guard reply missing for 15 s
  counts as a rejection; a clear in an empty conversation, or in a branch
  tab before its first message, records nothing and drops the pending fork.
- Records: the clear's `sessionId` is optional; the fresh start's is
  captured at the refused or failed resume.
- Branch uses the turn's `profileId`; its rewind clause is stated as a
  Before/After against change 012; Branch across a compaction is Open and in
  Validation. The ADR-006 rewind-failure sentence is task 088's.
- Wording: V4 "every case tested"; the cause of the owned tasks' end
  unobserved; automatic compaction sends no init before the boundary (E3);
  the SECURITY.md amendment moves to the provenance commit; the exact ADR
  index row; "Reversible" qualified.

Re-review of bb48398, "accept with changes". Dispositions, all fixed:

- Task 088's pending branch (`branchSession`) joins the id-format check, and
  the verified source id is recorded for the branch conversation and its
  profile, so a reopened pending branch is checked there.
- The migration mark moves from `data.json` to
  `history/.session-provenance-migrated`, so it travels with the history it
  vouches for; devices sharing only settings keep their own history
  trusted. The scan reads only `.json` files, so the mark is never listed.
- `started` also takes the first id of a process launched without
  `--resume` and a clear's committing id.

Final check of f083c89 by the orchestrator: the diff applies N1 to N3 as
specified and nothing else. Codex's two follow-ups are spent.

## Outcome

Accepted on the owner's behalf (owner-delegated approval, 2026-10-13):
ADR-018 accepted with its amendments to ADR-005, ADR-006 and ADR-009 and the
index row; change 002 approved for build, incorporated as its tasks land.
Open for the owner: the strict migration (a second device's pre-upgrade
conversations start fresh). Lesson: an evidence run before acceptance
rewrote five clauses and found a shipped defect (task 088); run it before
the first draft next time.
