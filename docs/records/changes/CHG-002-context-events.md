# CHG-002 — Context events

**Status:** incorporated (2026-10-13)

Approved for build on the owner's behalf on 2026-10-13; each task incorporates
its requirements as it lands.

## Intent

Second delta of the panel redesign, built in full (owner decision of
2026-10-13). Today `/clear` opens a new tab (PRD-001.R19), compaction leaves no
mark in the messages, and nothing shows the prompt cache. This delta keeps
`/clear` in the conversation (owner decision of 2026-10-07, SPEC §5 D1,
[ClearStates](../../work/research/redesign-canvas/project/ClearStates.dc.html)), marks
compaction with dividers, and adds the prompt cache state to the context
segment.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[PRD-002](../../current/product/PRD-002-permissions-and-change-control.md),
[PRD-003](../../current/product/PRD-003-conversation-history-and-export.md),
[PRD-005](../../current/product/PRD-005-plan-usage-and-cost.md).

Depends on: [ADR-018](../../current/adr/ADR-018-conversation-segments-for-clear.md) accepted
(owner decisions of 2026-10-13: a stored session id is used only if this
device recorded it; `version: 2` for conversations holding a clear or a fresh
start); task 088
(Branch's rewind, V10) landed; approval of this delta, which the owner
delegated on 2026-10-13.

## Evidence spike

Recorded in
[E record](../../records/verification/2026-10-13-real-cli-context-events.md)
and [V record](../../records/verification/2026-10-13-real-cli-clear-undo.md)
(CLI 2.1.296, Haiku, native Linux; WSL not run), and for a bare `/compact` in
[2026-10-10](../../records/verification/2026-10-10-real-cli-compact-and-cost.md).
The `tests/fake-cli.mjs` scenarios are derived from the transcripts. The
clauses below state these answers.

| ID | Answer | Decides |
| --- | --- | --- |
| E1 | `/clear` keeps the process: `conversation_reset` (`trigger: "clear"`, old session id), then `system/init` with the new session id and the model and permission mode set at runtime, then a `result` with `num_turns` 0 and cost 0, in about 0.3 s | R38 completes on that init; the re-apply clauses stay as a guard |
| E2, V2 | The ended session resumes intact and forks, also while the clearing process runs | Undo and Branch on turns before a clear (PRD-002.R15); Undo need not stop the tab's CLI first |
| E3 | Automatic compaction sends `status: "compacting"`, `compact_boundary` (`trigger: "auto"`, token counts) and the summary as a synthetic `user` message, inside the turn of the user's prompt, with no `result` of its own; `status: null` with `compact_result: "success"` ends it | R37 for automatic compaction |
| E4, V8 | Usage splits cache writes into one-hour and five-minute counts; main-agent writes are one-hour unless a setting, an environment variable or the login chooses five minutes; subagent writes were five-minute | PRD-005.R11's lifetime, from the main agent's last write |
| E7, V7 | A session started by `/clear` reports totals from zero; a fork's total starts from its source's whole total at the fork, whatever the rewind, and a fork of a fork from its parent's | PRD-005.R7: no carried-total clause; a branch subtracts its fork base |
| V1 | A promptless resume of an ended session answers `get_context_usage` successfully within 3 s, with no init and no `result`; an id the CLI does not hold gets an error `result` and exit 1 | R38's Undo completes on that reply and fails on the error or exit, with 15 s as the limit |
| V3 | A `/clear` written mid-turn is queued by the CLI until the turn's `result`; a permission answer given meanwhile applies | R38 holds the clear in the panel for "Cancel" and the messages behind it; a `result` before the clear's events is a turn's |
| V4 | `stop_task` ends a task with `task_updated` killed or `task_notification` stopped, and replies success for any id; `interrupt` ends a running turn with an error `result` and sends none with no turn | "Stop and clear" waits for those events, not the replies, with 15 s as the limit |
| V5 | A compaction that fails reports `compact_result: "failed"`; one that cannot start sends only a notice and a `result` | R37's failure clause |
| V6 | `--resume` reaches a session of any working directory | PRD-003.R4's device provenance |
| V9 | The empty post-clear session resumes | R38 stores the new id when the clear completes |
| V10 | A fork's rewind to any prompt but the source's latest is refused unless it names that latest prompt; the shipped Branch keeps the later turns | Task 088; PRD-002.R15 names the segment's latest prompt |

E5 and E6 decide [change 003](../../work/changes/CHG-003-agents-and-workflows.md) only; the record
answers them.

## ADDED requirements

### PRD-001

- **PRD-001.R37** — Compaction markers. The CLI compacts on `/compact` and, by itself, inside the turn of the prompt that filled the context; either keeps the session.
  - WHILE the CLI reports that it is compacting the conversation, the AI Agent Panel shall show in the messages "Compacting…" in a turn the user started with `/compact`, or "Compacting automatically…" in any other turn, with the sub-line "Context <P>% full · Claude picks up where it left off", P being the last known context percentage.
  - IF no context percentage is known, THEN the AI Agent Panel shall show the sub-line "Claude picks up where it left off".
  - WHEN the CLI reports that it compacted the conversation, the AI Agent Panel shall show a "Compacted" divider with the sub-line "HH:MM · <before> → <after> tokens".
  - IF the compaction report lacks a token count, THEN the AI Agent Panel shall leave that count out of the sub-line.
  - WHERE the CLI supplies the compaction summary, the AI Agent Panel shall add a collapsed "Summary" toggle to the divider that shows the summary under "What Claude kept", rendered through the boundary of R17.
  - The AI Agent Panel shall show the compaction summary only under that toggle, never as a prompt.
  - IF the CLI reports that a compaction ended other than successfully, or a turn that sent `/compact` or showed a compacting status ends without a compaction report, THEN the AI Agent Panel shall show "Compaction did not finish." in place of the status.
- **PRD-001.R38** — Clear the context. The CLI answers `/clear` with a new session in the same process, keeping the model and permission mode set at runtime; the re-apply clauses guard a CLI that does not keep them, and the restart clauses a CLI that does not answer as observed. Here a message is a prompt, a reply, a panel command or a `!` run, a message to Claude Code is a prompt or a `/compact`, and a turn ends at a `result` with no earlier queued message pending.
  - WHEN the user sends `/clear` alone in a tab that has a conversation or a running CLI, the AI Agent Panel shall start a new Claude Code session in the same conversation, keeping its tab, title, pin, model, effort, permission mode, profile and attached items.
  - IF the user sends `/clear` in a tab whose conversation has no message to Claude Code since it began or since its last clear, or in a tab with no conversation, THEN the AI Agent Panel shall empty the composer and record nothing.
  - WHILE the tab's CLI process runs, the AI Agent Panel shall clear by writing `/clear` to that process without restarting it.
  - IF the tab has no running CLI process, THEN the AI Agent Panel shall clear by recording the clear and dropping the conversation's resume id, so its next message starts a new session.
  - IF the user sends `/clear` in a branch tab before the branch's first message, THEN the AI Agent Panel shall drop the pending fork and rewind and record nothing.
  - IF the user sends `/clear` between a restore's preview and its end, THEN the AI Agent Panel shall keep `/clear` in the composer and send nothing.
  - WHEN the CLI acknowledges a written `/clear` and reports a new session id, the AI Agent Panel shall complete the clear and store the new session's id as the conversation's resume id.
  - The AI Agent Panel shall record no turn, footer or cost for the CLI's answer to `/clear`, and shall not let that answer end a later turn.
  - WHEN a clear completes and the CLI reports a permission mode or model other than the ones in force in the CLI before the clear, the AI Agent Panel shall set those again, leaving its own Auto-approve policy unchanged.
  - IF the CLI rejects that re-apply or does not answer it within 15 s, THEN the AI Agent Panel shall restart the CLI with the conversation's model and mode flags, resuming the new session.
  - WHILE a written `/clear` awaits its new session or the CLI's answer to it, or a re-apply of the picks has not settled, the AI Agent Panel shall hold every send from that tab.
  - IF the CLI ends a turn of its own before acknowledging a written `/clear`, THEN the AI Agent Panel shall record that turn as any other and keep waiting for the acknowledgement.
  - IF the CLI does not acknowledge a written `/clear` with a new session within 15 s of the write, not counting time while a turn of its own runs, or exits first, THEN the AI Agent Panel shall stop the tab's CLI and complete the clear as when no CLI runs.
  - IF the CLI's answer to a completed clear does not arrive within 15 s, THEN the AI Agent Panel shall restart the tab's CLI resuming the new session and send the held messages.
  - WHEN a clear completes, the AI Agent Panel shall show a "Context cleared" divider with the sub-line "HH:MM · Claude can't see anything above" and an "Undo" button.
  - WHEN a clear completes, the AI Agent Panel shall dim the messages above its divider, keeping their copy actions and their Branch actions as PRD-002.R15 allows.
  - The AI Agent Panel shall describe the dimmed messages to screen readers as "Before the clear. Claude no longer sees these messages."
  - WHILE an earlier segment (the messages before a clear and after the previous one) holds more than four messages, the AI Agent Panel shall fold all but its last prompt and reply behind an "N earlier messages" button that unfolds them.
  - WHEN the user clicks the rail tick of a folded prompt, the AI Agent Panel shall unfold its segment and scroll to the prompt.
  - The AI Agent Panel shall offer "Undo" only on the conversation's latest clear, only once that clear has completed and the CLI's answer to it has arrived, only until a message to Claude Code follows it, and never while another Undo is pending.
  - IF the session a clear ended is not one this device recorded (PRD-003.R4), THEN the AI Agent Panel shall show its "Undo" disabled, titled "The cleared session is not available on this device".
  - WHEN the user presses "Undo", the AI Agent Panel shall start a CLI for the tab resuming the session the clear ended, leaving the tab's running CLI as it is, and ask it for its context usage.
  - WHEN the CLI started by Undo answers that request successfully, the AI Agent Panel shall make it the tab's CLI, stop the one it replaces, remove the divider, the dimming and the clear's record, and store the resumed session id as the conversation's session id.
  - WHILE an Undo has not completed or failed, the AI Agent Panel shall hold every send from that tab.
  - IF the CLI started by Undo answers with an error, ends with an error, exits, or does not answer within 15 s, or the tab's launch settings or profile change meanwhile, THEN the AI Agent Panel shall stop that CLI, leave the tab's CLI, the divider, the dimming and the clear's record as they were, and show "Could not undo the clear." in the messages before sending anything.
  - WHEN a conversation whose last clear has no later message to Claude Code is reopened, the AI Agent Panel shall offer that clear's "Undo".
  - WHILE a turn runs, the AI Agent Panel shall hold a sent `/clear` until the turn ends, writing nothing to the CLI meanwhile, shown as "Queued · clears when this turn ends" with a "Cancel" button, leaving the turn's permission requests answerable.
  - WHILE a `/clear` is held, the AI Agent Panel shall hold every later message and send them in order after the clear completes.
  - WHEN the user presses "Cancel" on a held `/clear`, the AI Agent Panel shall drop it and send the messages held behind it in order.
  - IF agents or background tasks run when the user sends `/clear`, or when a held `/clear` is released, THEN the AI Agent Panel shall ask before clearing, with "Cancel", "Stop and clear", the body "Clearing stops them. What they reported so far stays above, dimmed." and this title:
    - "1 agent is still running" or "N agents are still running";
    - "1 background task is still running" or "N background tasks are still running";
    - for both kinds, the two counts joined by "and" ("2 agents and 1 background task are still running").
  - WHERE a workflow runs (PRD-001.R36, change 003), the AI Agent Panel shall word that body "Clearing stops them and the <name> workflow. What they reported so far stays above, dimmed."
  - WHEN the user presses "Stop and clear", the AI Agent Panel shall deny the tab's pending permission requests, ask the CLI to stop every agent and background task, then interrupt the CLI whether or not a turn runs, and clear once no turn runs and the CLI has reported every agent and task ended, including any started meanwhile.
  - The AI Agent Panel shall not take the CLI's reply to a stop request as a report that the agent or task ended.
  - IF the agents and tasks have not all ended within 15 s of the first stop request, THEN the AI Agent Panel shall show "Could not stop every agent, so the context was not cleared.", leave the context as it was, and return the messages held behind the clear to the composer unsent.
  - IF the tab's CLI exits during "Stop and clear", THEN the AI Agent Panel shall abandon the clear as when an agent could not be stopped.
  - IF text follows `/clear`, THEN the AI Agent Panel shall ask "Clear the context? The text after /clear is not sent." with "Clear" and "Cancel".
  - WHEN the user presses "Clear" in that dialog, the AI Agent Panel shall clear as for `/clear` alone.
  - WHEN the user presses "Cancel" in that dialog, the AI Agent Panel shall keep the whole text in the composer.

### PRD-005

- **PRD-005.R11** — Prompt cache state. The CLI reports cache writes by lifetime, one hour or five minutes, but no expiry, so the countdown is an estimate. The main agent writes for one hour unless the user's settings, environment or login choose five minutes (V8). A main-agent response is one the CLI does not attribute to a subagent; subagent writes, five-minute in every case observed, never set the main agent's countdown.
  - The AI Agent Panel shall take as the cache lifetime one hour when the main agent's last cache write was a one-hour write, and five minutes otherwise.
  - WHEN a main-agent model response reports cache reads or writes, the AI Agent Panel shall restart the countdown at the cache lifetime.
  - WHILE a main-agent model response streams, the AI Agent Panel shall show the cache as refreshing, with no countdown.
  - WHILE the countdown runs, the AI Agent Panel shall show the time left after the context percentage as `m:ss`, or as whole minutes ("52m") while more than 10 minutes are left.
  - WHILE less than one minute is left, the AI Agent Panel shall show the cache as expiring, in the warning color.
  - WHEN the countdown ends, the conversation is compacted or cleared, or its model changes, the AI Agent Panel shall show the cache as cold.
  - IF no main-agent model response has reported cache tokens since the conversation was opened, THEN the AI Agent Panel shall show no cache state.
  - WHEN the user opens the context popover, the AI Agent Panel shall show a "Prompt cache" section with the state ("Refreshing", "Warm", "Expiring" or "Cold"), the time left, the cached tokens, the expiry time with the lifetime, and the note "Estimated from the last request; Claude Code reports no expiry. Each request restarts the timer."

## MODIFIED requirements

Clauses are named by their opening words as change 001 leaves the PRDs.

### PRD-001

- **PRD-001.R19** — Slash commands.
  - Before: WHEN the user sends `/<name>` with optional arguments …
  - After: WHEN the user sends `/<name>` with optional arguments and `<name>` is, in any case, one of `chrome`, `clear`, `context`, `cost`, `extra-usage`, `help`, `hooks`, `mcp`, `memory`, `permissions`, `sandbox`, `skills`, `status`, `usage` or `usage-credits`, the AI Agent Panel shall handle it without a model turn.
  - Before: WHEN the user runs `/clear` in a tab …
  - After: WHEN the user runs `/clear`, the AI Agent Panel shall clear the context as R38 specifies.
  - Add: The AI Agent Panel shall describe `/clear` as "Clear Claude's context; messages above stay, dimmed".
  - Reason: `/clear` now goes to the CLI, which answers it without the model; Q12.
- **PRD-001.R20** — Panel report commands.
  - Add: The AI Agent Panel shall show in a live `/context` card the prompt cache state, the cached tokens and the time left (PRD-005.R11), and a "/compact now" button after the auto-compact note.
  - Add: The AI Agent Panel shall leave the cache line out of a `/context` card's recorded Markdown.
  - Add: WHEN the user presses "/compact now", the AI Agent Panel shall send `/compact` to Claude Code.
  - Add: WHILE a turn runs, the AI Agent Panel shall disable "/compact now".
  - Reason: SPEC §4.11; a countdown in history is stale; a mid-turn `/compact` would go straight to the running CLI (R11).
- **PRD-001.R28** — Accessibility.
  - Add: The AI Agent Panel shall show the prompt cache state by icon shape as well as color, and as text in the context segment's accessible label: "Prompt cache warm, <left>", "Prompt cache expiring, <left>", "Prompt cache cold" or "Prompt cache refreshing", where <left> is "m:ss left" or "N min left".
  - Add: The AI Agent Panel shall expose a finished context-event divider as a separator labelled "Context cleared at HH:MM" or "Compacted at HH:MM, <before> to <after> tokens", and one in progress as a status labelled "Compacting automatically" or "Compacting".
  - Reason: warm and expiring differ by color alone in the mock; SPEC §2.7 Context-event divider.
- **PRD-001.R29** — UI performance.
  - Add: WHILE the cache countdown shows whole minutes and no other per-second display is visible, the AI Agent Panel shall tick once a minute.
  - Reason: a one-hour countdown needs no per-second work.

### PRD-002

- **PRD-002.R14** — Restore files.
  - Add: WHILE a turn precedes a clear, the AI Agent Panel shall hide its Restore files.
  - Add: WHEN an Undo removes the clear after a turn, the AI Agent Panel shall offer that turn's Restore files again only under this requirement's other conditions.
  - Reason: owner answer O1 (a) of 2026-10-13; ADR-006 restores only the tab's current session, and Undo removes the clear and so shows the button again.
- **PRD-002.R15** — Branch.
  - Before: WHEN the user presses Branch, …
  - After: WHEN the user presses Branch, the AI Agent Panel shall open a new tab with the same model, effort and mode, on the CLI profile that turn's record names, else the conversation's, titled per PRD-001.R7, whose CLI forks the session of that turn's segment and rewinds it to just before that turn ahead of the branch's first message.
  - Add: The AI Agent Panel shall take as the session of a turn's segment the session id its turn record holds; for a turn recorded without one, the session the first later clear or fresh start (PRD-003.R1) ended; for a turn with neither, the conversation's session.
  - Add: IF the session of a turn's segment cannot be determined this way, or its recorded session id was discarded (PRD-003.R4), THEN the AI Agent Panel shall hide that turn's Branch.
  - Add: IF the session of a turn's segment is not one this device recorded for that profile (PRD-003.R4), or this device lacks that profile, THEN the AI Agent Panel shall show that turn's Branch disabled, titled "This turn's Claude Code session is not available on this device".
  - Before (change 012): The AI Agent Panel shall name in the rewind, as the last user message seen, the latest one the original conversation recorded in its CLI session, read when the rewind is sent, or none when it recorded none.
  - After: The AI Agent Panel shall name in the rewind, as the last user message seen, the latest one the original conversation recorded in the session of that turn's segment, read when the rewind is sent, or none when it recorded none.
  - Add: The AI Agent Panel shall title every Branch button "Branch from just before this turn, in a new tab".
  - Before: IF neither the running session nor the stored conversation has a CLI session id, …
  - After: IF the turn has no later clear and no recorded session id, and neither the running session nor the stored conversation has one, THEN the AI Agent Panel shall show "This conversation has no CLI session to branch from yet." and open no tab.
  - Reason: a conversation with clears holds several sessions, so a branch forks the turn's own ([ADR-018](../../current/adr/ADR-018-conversation-segments-for-clear.md), amending ADR-006); a session a clear ended forks, also while the clearing CLI runs (E2, V2), and its fork rewinds only when the request names its latest prompt (V10; task 088 fixes and states the refusal). ClearStates' "Continue from before the clear" contradicts the rewind to before the turn. A discarded id never falls back to another session, because the branch would fork the wrong history.

### PRD-003

- **PRD-003.R1** — Conversation file.
  - Add: The AI Agent Panel shall record each completed clear with its time and the id of the session it ended.
  - Add: WHEN the AI Agent Panel starts a session without resuming in a conversation whose last turn follows its last clear or fresh start, it shall record a fresh start with its time and the session id it did not resume, if any.
  - Add: The AI Agent Panel shall record each compaction with its time, its tokens before and after where reported, and the summary where supplied.
  - Add: WHEN an Undo completes (PRD-001.R38), the AI Agent Panel shall remove the clear's record and store the resumed session id as the conversation's session id.
  - Add: WHILE a conversation holds a clear or a fresh start, the AI Agent Panel shall store it in a format version that earlier versions refuse to open.
  - Reason: the owner's decisions of 2026-10-07 (`/clear`) and 2026-10-13 (history version); Q17. Shape in ADR-018; compaction records are optional additions in `version: 1`; an earlier version that read clear or fresh-start records as optional would branch from the wrong session. A fresh start ends a segment, so a turn recorded without a session id never branches from the session that followed it.
- **PRD-003.R4** — Identity and integrity.
  - Before: IF a stored session id, model, effort or profile id starts with `-` …
  - After: IF a stored model, effort or profile id starts with `-` or contains whitespace, THEN the AI Agent Panel shall discard it and treat it as absent, so no stored value can reach the command line as a flag.
  - Add: IF a stored session id (the conversation's, a turn's, a clear's, a fresh start's, a pending branch's or a fork base's) is not a lowercase UUID, THEN the AI Agent Panel shall not use it, on load and again before passing it to the CLI.
  - Add: The AI Agent Panel shall record on this device, outside the conversation file, each session id the CLI reports in a conversation, with the conversation and the CLI profile that ran it, and, when the user branches, the source session id with the branch conversation and the branch's profile.
  - Add: IF a stored session id is not recorded on this device for that conversation and the profile that would run it, THEN the AI Agent Panel shall not use it to resume, fork, branch or undo.
  - Add: WHEN this version first lists the history folder in full on a device whose history folder holds no migration mark and whose own record is unset, the AI Agent Panel shall record the session ids then stored in each conversation for its stored profile if the device has it, or for the default profile if the conversation stores none, and then write the mark into the history folder.
  - Add: IF the history folder holds the mark, or the device's record is set but unreadable, THEN the AI Agent Panel shall record no session id from the history folder, so conversations it did not record count as not recorded, and shall log an unreadable record to the developer console.
  - Add: IF writing the record fails, THEN the AI Agent Panel shall log it to the developer console and keep using the ids it holds until the plugin reloads.
  - Add: The AI Agent Panel shall keep a turn's or a clear record's session id it does not use in the file as stored, so it is rejected again after a reload and never read as a missing id.
  - Reason: Branch and Undo pass the turn's and the clear record's ids to `--resume`, which reaches any session on the machine (V6); the CLI writes session ids as lowercase UUIDs (ADR-018), and a well-formed id from an edited or synced file could otherwise select another session. Owner decision of 2026-10-13: only ids this device recorded. A rejected id read as missing would let Branch fall back to another session (PRD-002.R15). The upgrade's trust of existing history runs once, marked in the history folder so the mark travels with the history it vouches for: neither a storage loss nor a device receiving that history by sync extends the trust to history edited since, while devices that share only settings keep their own history trusted.
- **PRD-003.R8** — Deletion.
  - Add: WHEN a conversation is deleted, the AI Agent Panel shall forget the session ids recorded for it on this device (R4).
  - Add: IF successful listings of the history folder have found no file named for a conversation for 30 days, THEN the AI Agent Panel shall forget the session ids recorded for it on this device.
  - Reason: the record would otherwise grow without bound; 30 days is the CLI's default session cleanup, and a file a sync tool briefly removes keeps its record.
- **PRD-003.R9** — Reopen and resume.
  - Add: WHEN a conversation that holds clears or compactions is reopened, the AI Agent Panel shall show their dividers, with the messages above each clear dimmed and folded as PRD-001.R38 specifies.
  - Add: IF a reopened conversation's stored session id may not be used (R4), THEN the AI Agent Panel shall start its next session fresh and show "This conversation's Claude Code session is not available on this device, so this message starts a fresh one (the messages above are kept)."
  - Reason: the stored session id is the latest segment's; a conversation from another device names a session this device does not hold.
- **PRD-003.R13** — Note format.
  - Add: The AI Agent Panel shall render each clear as the italic line "Context cleared at HH:MM".
  - Add: The AI Agent Panel shall render each compaction as the italic line "Compacted at HH:MM, <before> to <after> tokens", leaving out a count that was not reported.
  - Reason: SPEC §5 D1.

### PRD-005

- **PRD-005.R7** — Turn cost and conversation totals. A session started by `/clear` reports totals from zero, so the per-session sum needs no change for clears. The fork base below is independent of clears and lands as its own task.
  - Add: WHEN a fork starts, at a branch's first message or when a refused rewind forks again (PRD-002.R15), the AI Agent Panel shall record as the branch's fork base the latest `total_cost_usd` recorded for the forked session, replacing an earlier one, unless none is recorded or a turn runs in that session.
  - Add: The AI Agent Panel shall take as the fork session's share of the branch's cost its latest total minus the fork base, and as the branch's first turn cost its total minus the fork base.
  - Add: IF a branch has no fork base, THEN the AI Agent Panel shall show its conversation cost with the note "Includes the cost of the conversation it branched from".
  - Add: IF the panel did not record every turn of the forked session since it began (it did not start it in that conversation, agents or background tasks ran in it when the fork started, or another tab ran it), THEN the AI Agent Panel shall show the branch's cost as an estimate with the note "Estimate: may include some cost of the conversation it branched from".
  - Reason: a fork's `total_cost_usd` starts from its source's whole total at the fork, whatever turn it branched from, and a fork of a fork from its parent's (E7, V7), so a branch's first turn and its conversation cost count the source's spend again; an unknown base is not zero.
- **PRD-005.R8** — Context segment.
  - Add: WHEN the pointer rests on the context segment, the AI Agent Panel shall add the prompt cache state and its time left to the hover card.
  - Add: The AI Agent Panel shall add to the context popover the prompt cache section (R11) and a "Compact" button titled "Summarize the conversation now (uses tokens)".
  - Add: WHEN the user presses "Compact", the AI Agent Panel shall send `/compact` to Claude Code without asking for confirmation.
  - Add: WHILE a turn runs, the AI Agent Panel shall disable "Compact".
  - Add: WHILE the CLI reports that it is compacting, the AI Agent Panel shall tint the context segment with the warning color and add ", compacting" to its accessible label.
  - Add: WHEN a clear completes (PRD-001.R38), the AI Agent Panel shall hide the context segment until the next turn finishes.
  - Reason: SPEC §4.18, §4.20; Q32.

### Other PRD sections

- PRD-001 Failure and recovery, add: "- A `/clear` the CLI does not acknowledge with a new session within 15 s completes by restarting the CLI on a new session (R38); an Undo the resumed CLI does not answer within 15 s leaves the clear and the tab as they were (R38)."
- PRD-003 Security and privacy, add: "- Compaction summaries, which Claude Code writes from the conversation, are stored with it like replies; clear and fresh-start records store session ids. A stored session id is used only if it is a lowercase UUID this device recorded for that conversation and CLI profile, in device-local storage (R4); conversations present when this version first ran on the first device to upgrade are trusted as they then stood."
- PRD-005 Failure and recovery, add: "- The prompt cache countdown is an estimate (R11) and starts empty after a reload."
- PRD-005 Failure and recovery, add: "- A branch's fork base is the source session's latest total recorded on this device when the fork starts; spend on that session the panel never recorded still counts in the branch (R7)."

## REMOVED requirements

None. PRD-001.R19's new-tab `/clear` is replaced above.

## Adopted decisions

SPEC §7 answers apply as the owner approved them (D6), except:

- Q16: the fold keeps the segment's last prompt and reply in view.
- Q18: replaced by the owner's answer O2 of 2026-10-13: "Stop and clear" stops every agent and background task and the turn, and clears once they have ended (R38). The stops go before the interrupt, so an interrupt that ends a subagent cannot race its stop, and the clear waits for every agent and task, not the turn's end alone, because a workflow outlives its turn.
- Q32: "Compact" and "/compact now" are disabled while a turn runs.
- The cache note leaves out SPEC's "a tenth of the input price", pricing copy no source here backs.

## Design and migration impact

- [ADR-018](../../current/adr/ADR-018-conversation-segments-for-clear.md): segments and
  their boundaries (clear, fresh start), the clear transaction with a restart
  fallback, Undo in its own process, Stop and clear, the Branch source, the
  session-id grammar and device provenance, `version: 2`, the fork base. The commit
  that lands the provenance check adds to `docs/current/SECURITY.md`,
  *Hardening choices in the code*, after "so no stored value reaches the
  CLI's command line as a flag.": "A stored session id, the conversation's,
  a turn's, a boundary's or a pending branch's, must also be a lowercase
  UUID, checked on load and again where `--resume` is built, and is used to
  resume, fork, branch or undo only if this device recorded it for that
  conversation and CLI profile, in device-local storage no sync tool carries
  (ADR-018); conversations present when the history folder was first
  migrated on a device are trusted as they then stood."
- New modules, one job each (ADR-018): `state/session-id`,
  `state/session-provenance`, `state/segments`, `state/clear-operation`;
  DES-001's file map lists them.
- DES-002: the clear transaction (process generation, a turn's `result`
  before `conversation_reset`, the committing init, the consumed trailing
  `result`, timeouts, fallback), the held clear written after the turn's
  `result`, the re-apply guard, Undo's own process, its
  `get_context_usage` proof, adoption and failure path, Stop and clear
  (pending permission cards denied as at a session end, `stop_task` before
  `interrupt`, end events rather than replies, 15 s abandonment, an exit
  abandons), compaction stream messages (`status`, `compact_result`,
  `compact_boundary`, the summary matched to its record), cache usage fields
  read from main-agent messages only, the session-id and provenance check
  where `--resume` is pushed, the fresh-start record. DES-003: the segment
  state machine (clear, held clear, Undo), dividers, fold, cache countdown,
  disabled Branch and Undo with their titles; a panel in a pop-out window
  runs the same, with its dialogs in the tab's window. DES-004: the Branch
  source and its latest prompt, Restore files hidden before a clear and
  after Undo under its usual conditions. DES-005: clear, fresh-start and
  compaction records, the fork base, the version written, the session-id
  grammar in *Identity and validation* and its validated-on-read table, the
  `ai-agent-panel:session-provenance` key in *Device-local keys* and *What
  travels*, the marker file `history/.session-provenance-migrated` in the
  history storage (the scan reads only `.json` files, so it lists no
  conversation for it), reopen. DES-007: cache countdown, Compact, the fork base in turn
  and conversation cost.
- Documents: `docs/current/SECURITY.md` (history stores clear and
  fresh-start records with session ids and compaction summaries; device
  storage holds the provenance record); README (`/clear` stays in the
  conversation; a conversation from another device starts a fresh session);
  `RELEASE_NOTES.md` *Unreleased*, including the rollback note below.
- Rollback to 0.5.x: it does not list conversations holding a clear or a
  fresh start, until the user upgrades again; the files stay. It ignores the
  fork base, so a branch's cost counts the source's spend again.
- Rollout: task 088 first; then a walking skeleton, an in-process `/clear`
  that shows the divider and stores the record, with the session-id grammar
  and provenance; then Undo, the held clear, Stop and clear, compaction, the
  cache. The fork base lands as its own task.
- Verification: `node:test` cases named with these IDs for the clear
  operation (every case of ADR-018's table, hold, re-apply, Undo and its
  failure, Stop and clear), the segments (Branch source, fresh starts, fold,
  Undo eligibility, two clears), the session-id grammar, provenance
  (recording, profile binding, grandfathering once, pruning), the fold rule, the
  cache countdown and the fork base, run against fake-CLI scenarios derived
  from the E and V records; manual rows for the dividers, dimming, disabled
  Branch and Undo, and reopen in the DES-003 matrix; by hand against the
  real CLI, WSL, a `/clear` written while a background workflow's own
  turn runs, and Branch to a turn before a compaction in the same session.

## Incorporation

Approval folds these deltas into PRD-001, PRD-002, PRD-003 and PRD-005 in
`docs/current/product/` without renumbering unchanged requirements.
`make close DOC=docs/work/changes/CHG-002-context-events.md` moves this delta to
`docs/records/changes/`, both in the approval commit. An accepted requirement
never lives outside the PRD.
