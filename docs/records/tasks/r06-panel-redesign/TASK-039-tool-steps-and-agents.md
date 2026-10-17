---
status: closed
release: r06-panel-redesign
number: 039
prd: PRD-001.R16, PRD-001.R18, PRD-002.R6
---

# TASK-039 — Tool steps and agents

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 9: tool calls as grouped step rows, subagents as agent rows
whose threads `ui/turn` draws, and background tasks in the run bar, replacing
today's tool cards, nested threads and task strip.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R16, R18 (R30's step counts);
[PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R6; [DES-003](../../../current/design/DES-003-panel-ui.md) Tool-step group,
Tool steps, Agent rows and run bar, Stream to messages (subagent rows),
Seams for changes 002 and 003;
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Edit planning, Diff sources.

Acceptance (fake CLI `steps` and `permission`, and one real-CLI run):

1. Grouping follows DES-003's event table: a running row joins the open
   group; text, thinking, a Task or Agent call, a card or form, and `result`
   close it; a waiting call has no row; an answered call opens a new group
   with its row first, or an agent row for Task and Agent.
2. Display: one call is a single row with its mark; two or more show "N
   steps" with a running, error or done mark and, once none runs, the
   duration; three or more collapse at close; a header click toggles.
3. Row: icon tile, `toolDisplayName`, a 96-character summary, a mark
   (spinner, check, x-circle, labelled "Running", "Done", "Failed"), the live
   count "N files", "N results" or "N notes" (hidden below 360 px), and
   `+x -y` for a succeeded edit. "Details": input JSON (2000 characters);
   the result (1500), or for a succeeded edit the diff from the file as read
   to the file on disk, a failed edit keeping the raw result; PNG, JPEG, GIF
   or WebP result images, live only.
4. Agent row: bot tile, label (description, else "<type> agent", else
   "Subagent"), type, model, tool count, tokens, elapsed time ticking while
   shown, status as icon and text; a button with `aria-expanded` whose body
   holds the thread drawn by `ui/turn`, grouped by the same rules; running
   tokens replaced by `task_notification`'s totals; an agent row on its own
   when its call is not in the messages.
5. A subagent call's row leaves its thread while its card waits and returns
   as the first row of a new group there once answered; every card sits in
   the main turn.
6. Run bar above the composer: the active tab's background tasks
   (`task_started` adds, `background_tasks_changed` decides, `task_updated`
   patches, `task_notification` removes), each with Stop (`stop_task`;
   "Could not stop that task."); `tab/chat-tab` fires `tasks`.
7. Reopened conversations group only at stored text, thinking, Task or Agent
   calls and `meta` records, with no durations or counts, marks from
   `isError`, and edits showing their stored `+x -y`.

## Scope

Expected files:

- New: `src/state/step-groups.ts`, `src/ui/steps-card.ts`,
  `src/ui/agent-row.ts`, `src/ui/run-bar.ts`,
  `tests/state-step-groups.test.mjs`.
- Changed: `src/tool-labels.ts` (`resultCount`), `src/state/stream.ts`
  (subagent routing, task messages), `src/state/tab.ts`,
  `src/tab/chat-tab.ts` (`tasks`), `src/tab/edit-tracker.ts`,
  `src/ui/turn.ts` (groups, agent rows, threads), `src/view.ts`,
  `styles.css`, `package.json` (`pretest`), `tests/fake-cli.mjs` (scenario
  `steps`: Glob, Grep, an edit, a Task with subagent messages, background
  tasks), `tests/tool-labels.test.mjs`, `tests/state-stream.test.mjs`.
- Docs: DES-004 (the step row's edit outcome); `README.md` (tool activity,
  subagents, background tasks); `docs/current/DEVELOPMENT.md`;
  `RELEASE_NOTES.md`.
- Evidence: `docs/records/verification/` records of the manual rows and of
  the real-CLI run, sanitized.

Negative scope:

- Agent badges, per-agent stop, the workflow view (change 003; only the
  seams: the run bar's place, the tab badge slot, the agent row's stop slot).
- Storing threads or tasks (PRD-003.R3: live only).
- No new dependency; no protected path.
- The real-CLI run is owed, not done: one human session, approved by the
  owner beforehand (metered use, constitution), recorded sanitized.

## Plan

- Tests first: every grouping clause, cards before and after their
  `tool_use`, threads, the reopen rules (`PRD-001.R16`,
  `state-step-groups`); `resultCount` from a first-line count or non-empty
  lines (`PRD-001.R16`, `tool-labels`); subagent routing and totals replaced
  on `task_notification` (`PRD-001.R18`, `state-stream`).
- Moves out of `view.ts`: `renderToolUse`, the `ToolCard` and
  `SubagentThread` code, `subagentThread`, `updateSubagentSummary`,
  `handleSubagentAssistant`, `handleSubagentToolResults`,
  `applyTaskNotification`, `renderBackgroundTasks`, `renderToolImages`,
  `settleEditCard`, `renderEditDiff`, `toolIcon`, `safeJsonPreview`.
- The `steps` scenario is shaped from today's parsing code; the real-CLI run
  compares a Glob, a Grep, an edit, a subagent and a background task with
  it.
- Verification: `make verify`; manual, by someone other than the
  implementer: `steps` and `permission` at 300 and 440 px (and 1040),
  `steps`' agent row, thread and run-bar Stop, an edit's `+x -y` and diff,
  a reopen showing stored counts.
- Risks: a call whose card arrives before its `tool_use`, or after (both
  orders tested); collapsed or hidden agent rows keeping the ticker running
  (they subscribe only while shown).
- Rejected: `ui/agent-row` drawing its own thread (DES-003 Alternatives: one
  drawing path, one importer).

## Run log

- Built on 8fe96be (task 038's wip, under review); no edit to
  `tab/permission-flow` or `session`. Replayed onto `main` at 4ac90d0 (038
  landed) with `git apply --3way` of 8fe96be..919abe2: `ui/turn`'s
  `BlockList` mounts cards through 038's `mountCard`, which now draws a
  card's edit diff, and `CardIntents` keeps `onCardFailed` without
  `renderDiff`; `view` keeps `onCardFailed`; DEVELOPMENT.md's test rows
  merged. Replayed again onto `main` at 6d7cf74 (040 landed) for the review
  fixes: `MessageItem` keeps 040's report and shell items beside
  `AgentItem`; `ui/messages` draws all three; the reopen keeps 040's report
  cards and closes a group at stored text; `view`'s `renderStored` and the
  `drawStored` intent went, since no stored legacy item is built any more
  (the legacy kind stays for slice 12); the dead `.ai-agent-panel-tool*`
  rules went with the last tool card.
- Tests first, against 8fe96be's tree (`git archive`, the new specs copied
  in): `state-step-groups` failed on import (no module); `state-tab` and
  `state-permission` failed on import (no `nextTasks`, no `callProceeds`);
  `state-stream` failed 4 (tool outcomes, subagent results and prompt, task
  events), `tool-labels` 3 (`resultCount`, `toolIcon`), `state-turn` 2
  (groups closed with the turn, a card's held row), `tab-recorder` 1
  (`changed`). The protocol test of the `steps` scenario was written with
  the scenario.
- No protected path touched. `tests/architecture.test.mjs` and
  `tests/styles.test.mjs` unchanged: P5 holds `ui/steps-card` and
  `ui/agent-row` to `ui/turn`, `ui/run-bar` to `view`. Ask-first
  `package.json`: `pretest` gains `state/step-groups`.
- Codex cross-review not called: Codex is unavailable (spend cap).
- Old to new (`view.ts` at 8fe96be):

  | Old | New |
  | --- | --- |
  | `renderToolUse`, `createToolCard`, `ToolCard` per call | `state/step-groups` `addToolUse` (row or agent row), `ui/steps-card`; the record in `tab/chat-tab` `addCall` |
  | `handleToolResults`, `applyToolOutcome`, `stringifyToolResult`, `renderToolImages` | `state/stream` `toolOutcomes`, `addToolResults`; the record's result cut to 1500 (`Recorder.changed` saves it again) |
  | `settleEditCard`, `renderEditDiff` | `landEdit`/`editCounts` (`+x -y`, the same `diffText`), `ui/turn` `editDiff` for cards and rows |
  | `subagentThread`, `handleSubagentAssistant`, `handleSubagentToolResults`, `updateSubagentSummary` | `addAgentMessage`, `agentView`, `ui/agent-row`, the thread drawn by `ui/turn` |
  | `applyTaskNotification`, `handleSystemMessage` tasks, `renderBackgroundTasks` | `state/stream` `TaskEvent`, `state/tab` `nextTasks`, `reportAgent`, `ui/run-bar`, the `tasks` event |
  | `toolIcon`, `safeJsonPreview` | `tool-labels` `toolIcon`, `jsonPreview` (038) |
  | `view.handleStreamMessage` noting edits | `ChatTab.applyStream` through `ChatTabHost.edits` |

- Choices the accepted docs leave open, and departures, for review (DES-003
  says each):
  - Cards carry the call's `tool_use` id and whether a subagent asked
    (`state/permission`); a card holds the row it took out (`HeldCall`),
    which returns timed from the answer. A main-thread card answered before
    its `tool_use` places the row from the card; a subagent's waits for its
    `tool_use`, then first in a new group in its thread; a card without a
    `tool_use` id takes and returns no row; a denied or dismissed card's
    call gets its row (its result fails it).
  - `resultCount`: the count only from a known phrasing (Grep's "Found N
    files", `obsidian_search`'s "N note(s) matched", thousands separators
    read), 0 for "No …", else the non-empty lines but Glob's truncation note
    and Grep's "Found N total occurrences"; singular for one.
  - Agent status: Running, Done, Failed, Stopped; a background agent
    (`run_in_background`, or a running task with its call id) outlives its
    call's result; `task_notification` statuses map `completed` done,
    `failed`/`error` failed, others stopped. At a turn's end its rows still
    running end with no mark and its agents not in the background stop,
    their groups closed (`settleTurnCalls`); the process ending or a restart
    does that to everything and clears the tasks (`endProcess`,
    `ChatTab.processEnded`), so nothing spins or ticks on.
  - A message added mid-turn closes the open group of the item the turn
    leaves (`leaveItem` in `state/turn`), so a group never spans a prompt.
    PRD-001.R16's close list does not name it: for the owner.
  - A group whose calls have no outcome (reopened without them, or ended)
    shows no header mark. Focus moves to the header, or the first row, when
    a focused row collapses into its group or a card takes it.
  - `ChatTab.apply` fires `item:<id>` once per step for an item changed
    several times in it, with its last state.
  - A reopened agent row is not a button (no thread is stored). An agent row
    on its own while no turn runs is a top-level item (`AgentItem`),
    mounted by `ui/messages` through `ui/turn`'s `agentItemView`.
  - Details: "Input" and "Result" labels; an edit's own-strings diff while it
    runs and once reopened (DES-004 Diff sources). Group duration with
    `formatElapsed`.
  - Seams: the run bar's place, an empty agent stop slot, an empty tab badge
    slot (`ui/tab-strip`, not in the expected files).
  - A main-thread call's input that is not an object is drawn as `{}`; one
    without a string id or name is not drawn.
  - Fake CLI `steps`: shaped from today's parsing, not observed. The
    `permission` scenario now announces its Edit as a `tool_use` and
    reports a `tool_result` after the answer (a subagent's request and a
    non-text tool name stay alone), so its row does not run forever.
  - Files beyond the expected list: `src/state/permission.ts`,
    `src/state/turn.ts`, `src/tab/recorder.ts`, `src/ui/dom.ts`
    (`writeMark`), `src/ui/messages.ts`, `src/ui/tab-strip.ts`,
    `tests/state-tab.test.mjs`, `tests/state-turn.test.mjs`,
    `tests/state-permission.test.mjs`, `tests/tab-recorder.test.mjs`,
    `tests/protocol.test.mjs`, PRD-001 (R7's wording), DES-001, DES-003,
    DES-006,
    `docs/current/SECURITY.md`, `docs/current/COMPARISON.md`.
  - `tab/edit-tracker` unchanged: `tab/chat-tab` calls it through
    `ChatTabHost.edits`.
  - PRD-001.R7: "background-task strip" became "run bar", lead-authorized
    maintenance, for the owner to confirm.
- No Chromium self-check: 035's harness is not in this worktree.
- API changes for later slices: `ChatTab` gains `tasks`, `processEnded`,
  the `tasks` event; `ChatTabHost` gains `edits` (`ChatTabEdits`);
  `applyStream` returns only `init` and system changes. `state/stream`:
  `tool-results` carries `parent` and `ToolOutcome`s, `agent-message` and
  `task` (`TaskEvent`, `TaskReport`) replace `subagent`. `state/tab`:
  `StepsBlock`, `StepRow`, `AgentBlock`, `AgentItem`, `ThreadBlock`,
  `HeldCall`, `held` on cards, `nextTasks`, `taskLabel`, the `tasks` tab
  event. `state/turn`: `closeTurn` closes the turn's groups; `addCard`
  takes `held`. `state/permission`: `toolUseId`, `fromAgent`,
  `callProceeds`, `cardToolName`. `ui/turn`: `CardIntents` without
  `renderDiff` (`mountCard` draws a card's diff), `agentItemView`.
  `ui/dom`: `writeMark`. `Recorder.changed`. `tool-labels`: `toolIcon`,
  `resultCount`.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer, at 300, 440 and 1040 px:
  1. `steps`: the first group's four rows running then done, the Read with
     the failed mark, "3 files", "2 results", "4 notes" (hidden at 300 px);
     at the reply the header "4 steps", the error mark, the duration, and
     the group collapsed; a header click expands and collapses it.
  2. `steps`: the Edit as a single row with `+N -M`; its details: Input JSON
     and the diff from the note as read to the note on disk, with the
     Rendered toggle; a failed row's details show its raw result.
  3. `steps`: the Survey agent row: bot tile, "Survey the project notes",
     "Explore · Haiku 4.5 · 2 tools · N tokens", elapsed, "Done"; expanded
     (`aria-expanded`), its replies, then a group of two steps. The Watch
     agent row ticking while it runs, its thread growing after the turn,
     then "Done" with "3 tools" and "4.3k tokens"; a collapsed row and a
     hidden tab keep no timer running (DevTools: no 1 s timer at idle).
  4. `steps`: the run bar above the composer with the two tasks while they
     run; Stop on the shell removes it (and on the agent, "Stopped");
     another tab shows its own (empty) bar; with the CLI killed or the
     settings restart, the bar empties and running agents read "Stopped".
     A Stop that fails shows "Could not stop that task." (by hand: stop a
     task of a CLI that refuses `stop_task`, not in a scenario).
  5. `permission` in Ask: the Edit's row leaves when the card waits, the
     card sits in the turn, and after Allow (or Deny) the row returns below
     the card, done (or failed with the denial text).
  6. Reopen a conversation from `steps`: groups as recorded, no durations or
     counts, marks from the stored outcomes, the Edit's stored `+x -y`, its
     details diffing the tool's own strings; agent rows without a button.
  7. M6: Tab reaches each group header, row and agent row, announced with
     their expanded state; marks read "Running", "Done", "Failed"; the run
     bar's Stop named "Stop this background task" and described by its
     task. M3 and M7: tiles, marks and the run bar in light and dark,
     forced themes and high contrast; the spinner still under reduced
     motion.
- Review fixes (see Independent review), tests first: `state-step-groups`
  failed on import (no `settleTurnCalls`); `tool-labels` failed the
  phrasing test; `state-turn` failed the mid-turn close and the released
  hold. Not unit-tested (imports `obsidian`): the ticker check after an
  agent row is put on the page, the standalone row's scroll-follow, the
  focus move, `ChatTab.apply`'s coalescing, the record kept once per call.
- Cost noted for slice 12's PRD-001.R29 profiles: `callPath`, `cardFor` and
  `agentPath` search the whole model, newest first, per `tool_use`, result
  and subagent message; an index by call id is the fix if the profiles
  show it.
- Owed, not done: the real-CLI run (one human session, approved by the
  owner beforehand: metered use, constitution), recorded sanitized in
  `docs/records/verification/`: a Glob, a Grep, an edit, a subagent and a
  background task, compared with the `steps` scenario's shapes (the tool
  results' text, `task_started`, `background_tasks_changed`,
  `task_notification` and its `usage`, a subagent's `subagent_type` and
  `task_description`), and whether a permission request can come before
  its `tool_use`.

## Independent review

- Reviewer: a session other than the implementer's, in a headless-Chromium
  harness running live fake-CLI tabs (`steps`, `permission`) through the
  real `ChatTab`, `tab/permission-flow`, `ui/turn`, `ui/steps-card`,
  `ui/agent-row` and `ui/run-bar`.
- Findings, all fixed in this commit:
  - D1: a subagent's call whose card came first and whose `tool_use` came
    while the card waited was lost. The card now holds it, with its thread.
  - D2: an agent row on its own did not tick (it subscribed while
    detached). The block list asks the ticker to look again once a new
    agent row is on the page.
  - G1: rows and agents could run forever after a turn's end or the
    process's (a 1 s ticker at idle). `settleTurnCalls` and `endProcess`.
  - G2: `resultCount` read numbers in file names. Known phrasings only.
  - G3: a group could span a prompt sent mid-turn. `leaveItem`.
  - Nits: README and release-note wording (collapsed when the group
    closes); a subagent's array input drawn as `{}`; a reopened Task or
    Agent call outside a turn opens one; no done mark without outcomes;
    focus kept on the group; the standalone row scroll-follows; the
    lookups' cost noted for slice 12.
- Codex (high effort, read-only, on `state/step-groups` and its callers),
  eight findings:
  - Fixed: groups in a stopped foreground agent's thread stayed open at the
    turn's end (`settleTurnCalls` closes them); a settled card kept its
    held row (`patchCard` releases it); a call the CLI repeats was
    recorded twice (recorded once per id); an item changed twice in a step
    fired its stale state first (`ChatTab.apply` fires the last).
  - Not changed: subagent traffic for a Task call whose card waits, and
    subagent output before its Task call's `tool_use`, cannot occur live
    (the subagent runs only once its call is allowed and announced); a
    card leaves its thread's group open, as DES-003 says (the row returns
    in a new group); a withdrawn call's record stays in history, as before
    this slice, so a reopen shows it without a mark; the whole-model
    lookups are the cost noted above.
- Verification: `make verify` (1009 tests); CI on the pull request.

## Outcome

Accepted after the review fixes. Owed to the owner:

- Confirm PRD-001.R7's "run bar" (was "background-task strip"), and
  whether PRD-001.R16's close list should name a message sent mid-turn.
- Manual rows 1 to 7 of the Run log, run and recorded by someone other than
  the implementer.
- The real-CLI run, approved beforehand (metered use), recorded sanitized in
  `docs/records/verification/`.
- Into a gate: the slice 12 R29 profiles cover the step-group lookups.
