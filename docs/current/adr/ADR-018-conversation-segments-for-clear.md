# ADR-018 — Conversation segments for `/clear`

**Status:** accepted (2026-10-13)

## Context

- Owner decisions: 2026-10-07 (change 002, ClearStates board), `/clear` keeps
  the tab and its history; the messages before it stay, dimmed under a
  "Context cleared" divider, with Undo. Today `/clear` opens a new
  conversation instead (`src/tab/panel-commands.ts:104-108`, PRD-001.R19).
  2026-10-13: build all of [change 002](../../records/changes/CHG-002-context-events.md);
  Restore files hides on turns before a clear and returns after Undo (O1
  (a)); "Stop and clear" stops every agent, background task and the turn, and
  clears once they have ended (O2); a stored session id is used only if this
  device recorded it (decision 1 below); conversations holding a clear or a
  fresh start are written as `version: 2`, which older readers refuse (decision 2 below).
- Real-CLI evidence, CLI 2.1.296, Haiku, native Linux, WSL not run:
  [E record](../../records/verification/2026-10-13-real-cli-context-events.md)
  and [V record](../../records/verification/2026-10-13-real-cli-clear-undo.md).
  - E1: `/clear` written to a running CLI keeps the process: `conversation_reset`
    (`trigger: "clear"`, the old session id), then `system/init` with a new
    session id and the model and permission mode set at runtime, then a
    `result` with `num_turns` 0 and cost 0, in about 320 ms.
  - E2, V2: the ended session resumes intact and forks, also while the
    clearing process still runs; that process no longer writes it.
  - V1: a promptless `--resume` of an ended session answers `initialize`
    (about 1.3 s) and `get_context_usage` with `subtype: "success"`,
    `categories` and `totalTokens`; it sends no `system/init` and no
    `result`. An id the CLI does not hold: stderr, a `result` with
    `subtype: "error_during_execution"`, exit 1, `initialize` never answered.
  - V3: `/clear` written while a turn runs is queued by the CLI: the turn
    runs on, a permission answer given meanwhile applies, and E1's events
    follow the turn's `result`. A `result` before `conversation_reset` is
    the running turn's.
  - V4: `stop_task` on a running task sends `task_updated` (`status:
    "killed"`) and `task_notification` (`status: "stopped"`) within
    milliseconds; its reply was `{}` success in every case tested: running,
    ended and unknown ids alike, no failing stop produced. `interrupt`
    replies `{"still_queued":[]}`; a running turn then ends with an
    `error_during_execution` `result`, and with no turn no `result` comes.
    After a workflow's stop and an interrupt sent with no turn running, the
    tasks its agents owned ended with `task_notification` `stopped`; which of
    the two ended them was not observable.
  - E3, V5: compaction keeps the session id. A success sends
    `compact_result: "success"`, `compact_boundary` and the summary as a
    `user` message; a manual one also sends `system/init` before the boundary,
    an automatic one none and runs inside the user's turn (E3). A failure
    sends `compact_result: "failed"` with `compact_error`; a
    compaction that cannot start sends only a notice as an `assistant`
    message with model `<synthetic>` and a normal `result`.
  - V6: `--resume` reaches a session recorded under any working directory of
    the same CLI configuration.
  - E7, V7: a session started by `/clear` reports totals from zero; a fork's
    total starts from its source's whole total at the fork, whatever the
    rewind; a fork of a fork from its parent's.
  - V9: the empty post-clear session resumes, before any message.
  - V10: on a fork, `rewind_conversation` to any prompt but the source's
    latest replies `rewound: false` (`stale_target`) unless the request
    carries `last_seen_user_message_uuid`. The shipped Branch omits it and
    ignores the reply (`src/session.ts:180`, `src/protocol/client.ts:396-404`),
    so a branch keeps every later turn. Task 088 fixes the shipped Branch.
- `system/init` arrives at the start of every turn (E record, other finding
  4); the session takes every init's id and marks the tab idle on every
  `result` (`src/session.ts:516-523`).
- A conversation file (`version: 1`, ADR-005) stores one session id for
  `--resume`; turn records store the id their `result` reported
  (`src/tab/chat-tab.ts:535`) only since after 0.5.0, so older turns have none
  (`conversationCost`, `src/commands.ts`). Only the conversation's id passes
  `isSafeArgValue` on load (`src/settings-core.ts:202-206`), which blocks flags
  but accepts paths (`src/settings-core.ts:184-185`); a turn record's id is
  checked only as a string (`src/history-file.ts:72-82`); `--resume` takes the
  id as stored (`src/protocol/client.ts:311`).
- All 38 session files under this repository's `~/.claude/projects/` folder on
  the author's machine are named as lowercase UUIDs.
- History files sit in the plugin folder, which folder-mirroring tools carry
  between devices and the agent's file tools can write (ADR-005, DES-005
  *What travels*). CLI sessions live in each machine's `~/.claude`, so another
  device's session id does not resume here (inferred). `App.saveLocalStorage`
  keeps a value per vault on this device, never synced (ADR-009, DES-005
  *Device-local keys*).
- A resume that fails before the CLI reports a session nulls the stored id;
  the next message starts a fresh session (`src/tab/session-link.ts:200-208`,
  PRD-003.R9). A tab with a session keeps its CLI profile (PRD-001.R3).
- Restore files shows only on turns whose session and profile are the tab's
  (`src/restore.ts:57`).
- Readers: an unknown message kind is kept and skipped
  (`src/history-file.ts:117-121`). 0.5.0 does the same, refuses a file whose
  `version` is not 1 (0.5.0 `src/history.ts:359`), and exports as `cost_usd`
  only the last turn's total (0.5.0 `src/export.ts:133-148`).
- Pending permission cards are settled only by a session end (DES-002).
- No library applies: the state lives in the plugin's own history format.

## Options considered

Risk tables score impact × probability, each 1 to 5, inherent (no
mitigations) and residual (with the option's mitigations). The scores are
ordinal judgments: the evidence supports no rates, so the chance of any
impact-4+ event is unquantified, inherent and residual, for every option.

Every option shares the shipped Branch defect (V10): Branch on an earlier turn
keeps the later turns without notice, 3 × 5 = 15 inherent, 3 × 1 = 3 residual
once task 088 sends `last_seen_user_message_uuid` and refuses a
`rewound: false`. It is each option's highest inherent score and is not
repeated below.

### A. A new conversation tab per `/clear` (today)

- Shipped; no format change; one session per conversation.
- Does not do what the owner decided: the earlier messages leave the tab,
  there is no Undo, and every clear adds a tab and a history entry.

| Risk | Inherent | Residual |
| --- | --- | --- |
| The user loses sight of the earlier work in this tab | 2 × 5 = 10 | 2 × 5 = 10 (the old conversation stays in history) |
| Tabs and history entries pile up | 1 × 4 = 4 | 1 × 4 = 4 |

Highest of its own rows 10 inherent and residual; no impact-4+ row. Value
lost by avoiding it: no new code, no format change, no dependence on the
CLI's `/clear` events.

### B. In-process `/clear` with segments in the same conversation (recommended)

- Matches the owner's decision; one process; a clear in about 0.3 s on
  Linux (E1); Undo by resuming the ended session (E2, V1); cost stays right
  because the new session starts at zero (E7) and the conversation sums the
  latest total per session id (`conversationCost`).
- Depends on the order of the CLI's `/clear` events; new records and a new
  format version; several sessions per conversation, each a `--resume`
  argument from a file other tools can write.

| Risk | Inherent | Residual |
| --- | --- | --- |
| A CLI release changes `/clear`'s events, so a clear stalls | 3 × 2 = 6 | 2 × 2 = 4 (no commit within 15 s completes the clear by C's restart) |
| The clear's trailing `result` settles the next turn, or a stale event commits a clear | 3 × 2 = 6 | 3 × 1 = 3 (transaction keyed to the process generation; a `result` before the reset is the running turn's, V3) |
| A CLI release resets model or mode on clear, loosening the mode the panel shows | 4 × 2 = 8 | 4 × 1 = 4 (re-apply guard against the effective pre-clear CLI values; the panel's Auto-approve policy kept apart) |
| A crafted or synced history file selects another session on this machine, of any working directory (V6) | 4 × 2 = 8 | 4 × 1 = 4 (decision 1: only ids this device recorded for that conversation and profile) |
| Grandfathering trusts an edited history or remaps a profile, at upgrade or again after storage loss | 4 × 2 = 8 | 4 × 1 = 4 (one-time migration marked by `history/.session-provenance-migrated`, which travels with the history, and run only while the device key is unset; no profile remapped; a second device upgraded before sync grandfathers its own scan, accepted) |
| A stored id carries a flag or path into `--resume` | 5 × 2 = 10 | 5 × 1 = 5 (session-id grammar on load and at the argv boundary) |
| Branch on a turn before a boundary forks the wrong segment (legacy turns, rejected ids, a fresh start) | 3 × 4 = 12 | 3 × 1 = 3 (source resolved per segment; fresh starts recorded; Branch hidden or disabled when the source is unknown or not this device's) |
| Undo stalls, loses the post-clear state, or leaves the pre-clear context live | 3 × 2 = 6 | 3 × 1 = 3 (Undo resumes in its own process; the tab switches only on a parsed reply) |
| An old agent, task or permission answer crosses the clear | 4 × 2 = 8 | 4 × 1 = 4 (cards denied; stops before the interrupt; clear at confirmed quiescence) |
| Stop and clear takes a stop reply (success in every case tested, V4), an unknown status or a wrapper's exit as proof that a task ended | 4 × 2 = 8 | 4 × 1 = 4 (only known terminal statuses of that task and process generation count; an exit abandons the clear) |
| A downgraded panel branches from the wrong segment, across a clear or a fresh start | 3 × 3 = 9 | 3 × 1 = 3 (decision 2: version 2 while a clear or fresh-start record exists) |
| A downgraded panel hides conversations holding a clear or a fresh start | 2 × 2 = 4 | 2 × 2 = 4 (accepted by the owner) |
| Resume, Branch and Undo lost for older conversations after the device storage is cleared, on a device that received the history folder by sync after another device migrated, or for a removed profile | 2 × 3 = 6 | 2 × 3 = 6 (accepted; a fresh session with a notice; Branch and Undo disabled with a reason) |
| A fork base missing spend the panel never saw is shown as exact | 2 × 3 = 6 | 2 × 1 = 2 (exact only when the panel recorded every turn of the source session since it began; otherwise an estimate) |

Highest of its own rows 12 inherent, 6 residual (lost resume on a device
that did not record the session, accepted); highest impact-4+ residual 5
(flag or path). Value lost by
avoiding it: the owner's `/clear` and Undo, and a sub-second clear on Linux.

### C. Restart the CLI on a new session per `/clear`, segments in the same conversation

- Same view as B. Independent of the order and shape of the CLI's `/clear`
  events: the panel stops the process and starts one without `--resume`, so
  the event-order, trailing-result and mode-reset rows do not exist; launch
  flags carry the picks.
- Every clear costs a spawn and `initialize` and restarts MCP servers; its
  latency on Windows and WSL is unmeasured. The CLI's own clear handling,
  such as hooks keyed to a clear, does not run (inferred). Storage, Branch,
  Undo, id trust, downgrade and shutdown rows are B's.

| Risk | Inherent | Residual |
| --- | --- | --- |
| Slow clear on every use | 2 × 4 = 8 | 2 × 4 = 8 (accepted; unmeasured on Windows and WSL) |
| The user's clear-time hooks do not run | 2 × 3 = 6 | 2 × 3 = 6 |
| B's rows other than its first three | as B | as B (highest 6) |

Highest of its own rows 12 inherent, 8 residual. Value lost by avoiding it:
independence from the CLI's `/clear` events, which B keeps as its fallback.

### D. In-process `/clear`, one conversation file per segment linked by id

- Each file keeps one session, so ADR-005's model is unchanged, and a
  downgraded panel sees separate one-session conversations.
- History must hide linked files and join them into one tab; delete,
  export, pin and title follow the chain; a partial sync or a deleted file
  splits or orphans a tab. Clear transaction, Undo, id trust and shutdown
  are B's.

| Risk | Inherent | Residual |
| --- | --- | --- |
| A broken or partially synced chain shows a split or orphaned conversation | 2 × 3 = 6 | 2 × 2 = 4 (missing links read as separate conversations) |
| Delete or export misses a linked file | 3 × 2 = 6 | 3 × 1 = 3 (chain walk tested) |
| A downgraded panel branches from the wrong segment | 3 × 1 = 3 | 3 × 1 = 3 |
| B's rows other than its two downgrade rows | as B | as B (highest 6) |

Highest of its own rows 12 inherent, 6 residual. Value lost by avoiding it:
downgrade safety without a version bump.

## Decision

- B over A: A does not deliver the owner's decision and offers no Undo.
- B over C: the CLI answers an in-process `/clear` in about 0.3 s without a
  restart (E1), keeping MCP servers and its own clear handling; B falls back
  to C's restart, so a change in the `/clear` events degrades to C, not to a
  stall. C's latency on Windows and WSL is unmeasured, so this rests on
  Linux timing.
- B over D: with `version: 2`, B gets D's downgrade safety from a version
  number instead of a file chain, and keeps one file per conversation.
- B depends on task 088: Branch on a segment forks and rewinds only if the
  rewind carries `last_seen_user_message_uuid` and a refused rewind stops the
  branch's first message (V10).

### Decision 1: trust of stored session ids (owner, 2026-10-13)

Session-id grammar: a stored session id is used only if it is a lowercase
UUID (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`),
checked on load for the conversation's, every turn record's, every boundary
record's, a pending branch's `branchSession` (task 088) and the fork base's
id, and again where `--resume` is pushed. A
failing id is *rejected*: never used, kept in the file as stored so a reload
rejects it again, and distinct from a legacy record that never had one. The
grammar blocks flags and paths; it does not prove the panel created the
session.

Chosen: **this device's own.** A well-formed id is used to resume, fork,
Branch or Undo only if this device recorded it for that conversation and the
CLI profile that would run it; otherwise it is *foreign*. This is provenance
(this conversation on this device saw the CLI report the id), not
authorization: a recorded session can still be gone from the CLI (PRD-003.R9).
Rejected: a documented trust assumption (any well-formed id used; residual
4 × 2 = 8), and a dialog to approve unknown ids (approval by habit, 4 × 2 = 8,
and one more dialog).

- Store: the device-local key `ai-agent-panel:session-provenance`, written
  with `App.saveLocalStorage` and read through `loadLocalValue`
  (`src/local-store.ts`), as ADR-009 and DES-005 *Device-local keys* define
  for device-local values; never in a conversation file or `data.json`.
- Shape:

  ```json
  {
    "version": 1,
    "migrated": true,
    "conversations": {
      "<conversation id>": {
        "sessions": { "<profile id>": ["<session id>", "…"] },
        "started": ["<session id>", "…"],
        "missingSince": 1760313600000
      }
    }
  }
  ```

  `started` lists the sessions this panel began in that conversation, fresh
  or as its fork (Fork base). `migrated` is `false` until the grandfathering
  migration below completes on this device; a record without it reads as
  `true`. Read with own-key access only: `version` must
  be 1; conversation ids match `^[A-Za-z0-9_-]+$`, profile ids pass
  `isSafeArgValue`, session ids the grammar; `missingSince` is an optional
  non-negative integer of epoch milliseconds; anything else is dropped. An
  unset key is empty. A set key that is not an object, or whose `version`
  is not 1, reads as empty and is logged to the developer console.
- Writes: every change applies to the one in-memory record, and a save queue
  writes it at once, also before the migration, one save at a time, as
  settings saves are. A failed write is logged; the ids stay usable in memory
  until the plugin reloads, after which ids that were never written are
  foreign.
- Recording: each session id a `system/init` reports in a tab with a
  conversation joins that conversation's list for the profile that ran it,
  before the id is saved in the conversation file; an Undo's resumed id is
  already there. The first id reported by a process launched without
  `--resume`, and a clear's committing id, also join `started`. At Branch,
  the verified source id also joins the branch conversation's entry for the
  branch's profile, so a reopened pending branch is checked there; the
  fork's id joins that entry and its `started`.
- Use: a resume, fork or Undo checks the id against the conversation's
  entry for the profile that would run it, at every process start; Branch
  checks the source id for the profile the turn record names (`profileId`),
  else the conversation's, and a profile this device lacks makes the source
  foreign. The check answers trusted (the id is in the record), pending (not
  in the record while the migration has not completed) or foreign. Pending
  starts nothing: the stored id, the fork and rewind and the message are
  kept, and the panel says the history is not read yet. Only foreign starts
  fresh.
- Grandfathering, a one-time upgrade migration: it runs on a device only
  while the history folder holds no marker file
  `history/.session-provenance-migrated` and the device key is unset or
  holds `migrated: false`, so neither a storage loss nor a history-folder
  writer alone can run it again once both completion writes have landed.
  The marker lives with the history it vouches for: a vault sync that
  carries `history/` carries it, while Obsidian Sync carries `data.json` but
  not `history/` (DES-005), so devices that share only settings keep their
  own history grandfathered. The first complete history scan (PRD-003.R6) then
  enters each listed conversation's stored ids (its own and its turn
  records') for its stored profile if this device has it, or for the
  default profile if the conversation stores none; a conversation whose
  stored profile this device lacks is not seeded. It then sets `migrated:
  true` and writes the device key and the marker file (which holds the
  migration time), each attempted whether or not the other succeeds; a later
  successful scan retries a failed key write and recreates an absent marker.
  A successful scan that finds the marker seeds nothing and sets `migrated:
  true`. Completion never reverts in memory. The scan learns of the marker
  from its listing; it reads only `.json` files, so the marker is never
  listed as a conversation. A failed listing completes nothing and the next
  panel open retries. History is trusted as it stands then; a crash or
  failed write between the two completion writes leaves one indicator, and
  losing that one store lets the next scan grandfather again. A device whose storage is
  cleared, or that receives the history folder by sync after the marker,
  grandfathers nothing: its older conversations count as foreign. Two
  devices that upgrade before sync carries the marker each grandfather their
  own scan. A malformed key grandfathers nothing.
- A foreign conversation, from another device or vault, or from before a
  storage loss, or whose profile this device lacks: it opens with every
  message. Its next message starts a fresh session (a fresh-start record
  below) with the notice "This conversation's Claude Code session is not
  available on this device, so this message starts a fresh one (the
  messages above are kept)." Branch on a turn whose source session is
  foreign shows disabled, titled "This turn's Claude Code session is not
  available on this device"; Undo on a clear whose session is foreign shows
  disabled, titled "The cleared session is not available on this device".
  Restore files stays hidden there, its session not being the tab's.
- Pruning: Delete (PRD-003.R8) removes the conversation's entry. A history
  scan whose listing succeeded sets `missingSince` on entries whose
  conversation has no file and clears it on those that have one, judged by
  `.json` file names, so an unreadable file counts as present; an entry missing for
  30 days goes at the next such scan. Thirty days is a retention grace
  period matching the CLI's default session cleanup (ADR-006), not proof
  that the session expired. A listing failure prunes nothing; this needs the
  scan to report success and the listed file names apart, since today it
  sets the scan done after a failed listing (`src/history.ts:341`). A
  removed profile's ids stay until their conversation goes.

### Decision 2: history format (owner, 2026-10-13)

Chosen: **`version: 2` for a conversation holding a clear or fresh-start
record.** Readers accept 1 and 2; a save writes 2 while such a record exists,
1 otherwise (Undo of the only clear in a conversation with no fresh start
returns it to 1). 0.5.x refuses version 2 (0.5.0 `src/history.ts:359`): it
does not list those conversations, and the files stay until the user
upgrades. Compaction records and the fork base stay optional `version: 1`
additions: an older reader ignoring them selects no different session.
Rejected: boundary records as optional `version: 1` additions, under which
0.5.x shows every message undimmed and branches a turn before a clear or a
fresh start from the latest session (residual 3 × 3 = 9).

### Design

Components, one job each:

- `src/state/session-id.ts`: the session-id grammar.
- `src/state/session-provenance.ts`: the provenance record: parse, record,
  check, grandfather, prune. Reads and writes go through the view and
  `src/local-store.ts`.
- `src/state/segments.ts`: from a conversation's records, each turn's
  segment, source session and the segment's latest prompt uuid, which
  messages are dimmed and folded, and which clear offers Undo.
- `src/state/clear-operation.ts`: the clear transaction's state machine
  (events in, actions out), Undo's and Stop and clear's included.
- `conversationCost` (`src/commands.ts`): the fork base.

Records:

- `{ kind: "clear", at, sessionId? }`: a boundary; the time and the session
  the clear ended, absent when none was known.
- `{ kind: "fresh-start", at, sessionId? }`: a boundary with no divider,
  written when a session starts without `--resume` in a conversation whose
  last turn follows its last boundary: the resume id was absent, rejected or
  foreign, or the resume failed (PRD-003.R9). `sessionId` is the id not
  resumed, captured when it is refused or its resume fails, before the
  stored id is dropped.
- `{ kind: "compaction", at, trigger, preTokens?, postTokens?, summary? }`:
  written at `compact_boundary` (`trigger` `"manual"` or `"auto"`, counts as
  reported). The summary is the next summary `user` message of the same
  process generation before that turn's `result`; it updates that record
  only, and a summary arriving later or from another process is dropped. A
  compaction that fails or cannot start (V5) writes none.
- On a branch conversation, `forkBase?: { costUsd, sessionId?, estimate? }`.

`/clear` does nothing but empty the composer when no message to Claude Code
follows the conversation's start or its last clear, so two clears never
stack and an empty conversation records none. In a branch tab before its
first message it also drops the pending fork and rewind.

Clear transaction (a process runs, no turn runs):

1. The panel opens an operation keyed to the process generation and the old
   session id: the id the process last reported, or the id it was launched
   to resume when it has reported none (a promptless resume reports none,
   V1). It holds the tab's sends and writes `/clear`.
2. From that generation only: a turn the CLI runs by itself before
   `conversation_reset` (V3), from its `system/init` to its `result`, is
   handled as a turn. Then
   `conversation_reset` with `trigger: "clear"` and the old session id, and
   the next `system/init` with a valid id different from the old one, which
   commits: the new id is recorded (decision 1), then the clear record and
   the new id as the conversation's resume id are saved together. The
   process continues in the new session (V9: it is resumable at once).
3. The re-apply guard compares the committing init's `permissionMode` and
   `model` with the effective CLI values before the clear: the last init's
   report, updated by every acknowledged `set_permission_mode` and
   `set_model` since; models compare after mapping a pick through
   `settings.resolvedModels`. On a difference it sends that effective value;
   an explicit pick goes through `cliPermissionMode`
   (`src/settings-core.ts:20-21`), so Auto-approve sends `default`. The
   panel's approval policy (Auto-approve answering allow) is panel state,
   unchanged by the clear. It waits for both replies; a rejection, or no
   reply within 15 s, restarts the CLI with the launch flags the picks
   convert to, resuming the new session.
4. The trailing zero-turn `result` is consumed by the operation: no turn
   record, footer, cost or idle change. The operation closes, and sends are
   released, once it and the guard have settled.

| Case | Outcome |
| --- | --- |
| No commit within 15 s of the write, the time paused while a turn the CLI runs by itself is under way | Fallback |
| The process exits before the commit | Fallback |
| Committed, no trailing `result` within 15 s, or the process exits | The clear stays; the CLI restarts resuming the new session; sends released |
| Events from an earlier process generation, or after the operation closed | Ignored |
| An init with the old id, an invalid id, or none | Not a commit |

Fallback: stop the process, save the clear record with the old session id
and a null resume id, release the sends; the next send starts a new session
(C). Without a process, a clear does the same.

Held clear: sent while a turn runs, `/clear` waits in the panel and is
written after that turn's `result` with no queued message pending. The panel
holds it itself rather than relying on the CLI's queue (V3) because "Cancel"
and the messages held behind the clear need the panel's hold, and cancelling
a queued `/clear` is unobserved. The turn's permission cards stay
answerable. When it is released and agents or background tasks run, the
panel asks as for a clear sent then.

Stop and clear (O2):

1. Deny every pending permission card of the tab as a session end does; a
   later Allow or tool reply for it is dropped.
2. Write `stop_task` for each running agent and background task (a workflow
   by its own `task_id`) without waiting for replies, then `interrupt`,
   whether or not a turn runs (V4 saw a workflow's owned tasks end after an
   interrupt sent with no turn). Stops go first so an interrupt that ends a
   subagent cannot race its stop. A `stop_task` reply is no evidence: it was
   success in every case tested (V4).
3. A task has ended at a `task_notification` with status `stopped`,
   `completed` or `failed`, or a `task_updated` with status `killed`,
   `completed` or `failed`, carrying that task's id from the operation's
   process generation; another status counts as running. Tasks that start
   meanwhile are stopped too. An interrupted turn ends at its
   `error_during_execution` `result`, recorded as an interrupted turn; with
   no turn running nothing waits for a `result`. The clear runs when no turn
   runs and every known task has ended.
4. One deadline covers the operation: not quiescent within 15 s of the first
   stop, the clear is abandoned with "Could not stop every agent, so the
   context was not cleared."; the messages held behind it return to the
   composer, in order, unsent.
5. The process exits meanwhile: abandoned as in 4, because a Windows or WSL
   wrapper can exit while the CLI behind it runs (DES-002, limitations of one
   process per conversation).

Undo:

- Offered only on the latest clear, once its clear operation has closed,
  while no message to Claude Code follows it and no other Undo is pending,
  also after reopen; a `/compact` sent after the clear is such a message,
  and compaction before the clear stays in the resumed session. A clear
  record whose id is absent or rejected offers no Undo; one whose id is
  foreign shows it disabled (decision 1).
- Undo starts a new process generation with the tab's launch configuration,
  `--resume <clear record's sessionId>` and no prompt, and sends
  `get_context_usage` (V1). The tab's own process, if any, keeps running in
  the post-clear session meanwhile (V2). Sends are held throughout.
- It completes on a `success` reply to that request from that process whose
  `response` has a numeric `totalTokens` and a `categories` array: the tab
  takes that process as its session, with the resumed id as its session id
  since it reports no init (V1), and stops the old one; the clear record
  goes and the ended id becomes the conversation's, saved together.
- It fails on an error reply, one that does not parse, an error `result` or
  an exit before the reply (an id the CLI does not hold, V1), no reply within
  15 s of the spawn, or a change to the tab's launch configuration meanwhile
  (a settings restart or profile change), so a process started with stale
  settings is never adopted: the panel stops the Undo process, shows "Could
  not undo the clear.", and releases sends. The tab's process, link and
  stored id were never changed; the record stays. Closing the tab stops the
  Undo process.
- After Undo, Restore files on the returned turns follows its usual
  conditions (session, profile, checkpoint availability, busy).

Branch source, for the chosen turn:

1. The turn record's session id, if it passes the grammar.
2. Else, for a turn with no id (legacy), the `sessionId` of the first later
   boundary (clear or fresh start).
3. Else, for a legacy turn with no later boundary, the conversation's
   session.
4. Else Branch is hidden on that turn. A rejected id never falls through to
   2 or 3.

The branch runs on the profile the turn record names (`profileId`), else the
conversation's. A source that passes the grammar but is foreign for that
profile, or a profile this device lacks, shows Branch disabled (decision 1).
The rewind sends, as `last_seen_user_message_uuid`, the latest recorded
prompt uuid of the source's segment, and an unknown one or a refused rewind
is handled as task 088 defines (V10). A rewind to a turn before a compaction
in the same session is unverified (Open).

Fork base (independent of clears; lands as its own task):

- When a fork actually starts, at the branch's first message or at task
  088's retry after a refused rewind, the panel reads the latest raw
  `total_cost_usd` recorded for the source session and stores it as
  `forkBase.costUsd` on the branch conversation, replacing a base an earlier
  failed fork stored; the fork's first reported session id fills
  `forkBase.sessionId`. The CLI's base is the source's whole total at the
  fork, whatever the rewind (V7).
- For that session: conversation contribution = latest raw total − base;
  first turn = raw total − base; later turns = raw total − previous raw
  total. Bases are raw, so nested forks subtract correctly (V7).
- Unknown base (no recorded total, or a turn running in the source at the
  fork): no `forkBase`; the branch's cost shows with the note "Includes the
  cost of the conversation it branched from". Unknown is never zero.
- The base is exact only when the panel recorded every turn of the source
  session since it began: the session is in its conversation's `started`
  list (decision 1), so it was begun here rather than grandfathered or
  resumed from elsewhere, and at the fork no agent or background task ran
  in it and no other tab ran it. Otherwise `forkBase.estimate: true`, and
  the cost shows as an estimate with the note "Estimate: may include some
  cost of the conversation it branched from". Spend another program added
  to the session is invisible to the panel.
- Survives reloads, error results and resumes of the fork, all of which
  continue the raw total.

Validation on load: `version` 1 or 2; the grammar on every session id above;
provenance on every id used to resume, fork, Branch or Undo; a rejected id
stays in the file as stored and is never used; a clear record without a
valid id draws its divider and offers no Undo and no Branch fallback; a
`forkBase.costUsd` that is not a finite number ≥ 0 reads as absent, and an
`estimate` that is not a boolean as `true`.

Readers: reopen draws dividers for clears and compactions and dims and folds
earlier segments; a fresh start draws nothing. Export writes each clear and
compaction as one italic line (PRD-003.R13). Cost and restore skip all three
kinds.

Pop-out windows: the operation belongs to the tab, so a panel in a pop-out
runs it the same; its dialogs open in the tab's window.

The designs, README and SECURITY.md change with the code that lands each
part ([change 002](../../records/changes/CHG-002-context-events.md), *Design and migration impact*).

### Validation

- Fake-CLI scenarios from the two records' shapes: clear (E1); a turn the CLI
  runs before the reset (V3); no reset; no init; exit mid-clear; a mode reset
  after clear, also under Auto-approve; Undo's promptless resume answering
  `get_context_usage` (V1), and an unknown id's error `result` and exit 1;
  Stop and clear with agents, a background task, a workflow and its owned
  tasks, a pending card, `stop_task` replying success with no events, an
  interrupt with no turn, an unknown task status, and a wrapper exit (V4); compaction success, failure and the empty-session
  notice (V5); a fork whose first total includes its source's (V7).
- `node:test`, named with the requirement IDs: `clear-operation` (every case
  in the table, held clear, Stop and clear, Undo and its failure),
  `segments` (Branch source, fresh starts, fold, Undo eligibility, two
  clears, a rejected id across save and reload), `session-provenance`
  (shape validation, own-key access, recording, profile binding, foreign
  ids, grandfathering once and not after storage loss or with the marker
  file present, the marker never listed as a conversation, a missing profile not seeded, pruning by file name and only after a
  successful listing, a failed write), `session-id`, record validation,
  `conversationCost` with `forkBase` and its estimate rule, the version
  written.
- By hand against the real CLI, recorded in `docs/records/verification/`:
  WSL for V1–V10's shapes; a `/clear` written while a background workflow's
  own turn runs; Branch to a turn before a compaction in the same session.

## Consequences

- A conversation holds several CLI sessions; Branch and Undo reach any of
  them, so every stored session id is checked input to the command line.
- A change in the CLI's `/clear` events degrades to a restart-based clear
  (C); a failed Undo leaves the tab and the conversation as they were.
- 0.5.x does not list conversations holding a clear or a fresh start
  (release notes).
- A conversation this device did not record keeps its messages but
  resumes, branches and undoes none of its earlier segments, and its next
  message starts a fresh session: one from another device or vault, one
  older than a clearing of this device's storage, every pre-upgrade
  conversation on a device that receives the history folder by sync after
  another device migrated, and one whose profile this device lacks.
- Conversations present at the upgrade on each device that migrates before
  sync carries the marker file are grandfathered, as are those of devices
  that share only settings: their ids are trusted as they stand then.
- Undo works only while the CLI keeps the ended session (its cleanup sweep,
  30 days by default, ADR-006).
- Branch on any segment needs task 088's rewind fix.
- A branch's cost excludes its source's exactly only when the panel recorded
  every turn of the source session; otherwise the cost is an estimate, or,
  with no recorded total, carries the note that it includes the source's.
- Reversible in code: A is a one-function change back that can keep this
  ADR's reader. Files already written as version 2 stay version 2, so a
  release before this one keeps refusing them.
- Open: WSL; a `/clear` queued behind a background workflow's own turn;
  Branch to a turn before a compaction in the same session. Owner: confirm
  the strict migration (a second device's pre-upgrade conversations start
  fresh) over re-grandfathering after storage loss.
