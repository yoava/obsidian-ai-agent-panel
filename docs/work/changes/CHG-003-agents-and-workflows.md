# CHG-003 — Agents and workflows

**Status:** draft

## Intent

Third delta of the panel redesign; owner question O6 decides its release.
Today background tasks are listed in a strip above the composer, each with a
Stop button, and a subagent stops only with the whole turn. This delta
replaces the strip with a run bar and its popover, adds "Stop all", per-agent
stop and an agent badge on tabs, and adds workflows: a card in the messages
and a workflow view (SPEC §4.16, §4.17, §4.23).

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[PRD-003](../../current/product/PRD-003-conversation-history-and-export.md).

Depends on: [change 001](../../records/changes/CHG-001-panel-redesign.md) folded; E5 and E6 from the
[evidence spike](../../records/changes/CHG-002-context-events.md#evidence-spike); the owner's answer to
O3 ([owner questions](../../records/changes/CHG-001-panel-redesign.md#owner-questions)).

If E6 finds no group of agents in the stream, these leave this delta:
PRD-001.R36 (its ID retired), the run bar's workflow name, the R24
window-size clause, the R34 workflow-view clause, "the workflow view" in the
PRD-001 scope sentence, "workflow runs" in PRD-003.R3 and its non-goal, and
the workflow body of change 002's clear confirmation; ADR-016 drops the
workflow view's second host.

## ADDED requirements

### PRD-001

- **PRD-001.R36** — Workflows. Needs E5 and E6.
  - WHEN the CLI reports a group of agents as one workflow, the AI Agent Panel shall show a workflow card with the workflow's title, "Workflow · N agents · M at a time", a phase strip, one row per agent with its status as icon and text and its elapsed time, "<tokens> tokens · $<cost>", and "Stop workflow" and "Workflow view" buttons.
  - IF the CLI reports no title for a workflow, THEN the AI Agent Panel shall title it "Workflow".
  - IF the CLI reports no concurrency for a workflow, THEN the AI Agent Panel shall leave " · M at a time" out.
  - IF the CLI reports no token count or cost for a workflow, THEN the AI Agent Panel shall leave the missing figure out.
  - IF the CLI reports no phases for a workflow, THEN the AI Agent Panel shall show its agents as one flat list without a phase strip or phase bar.
  - WHEN the user presses "Stop workflow", the AI Agent Panel shall ask the CLI to stop every running agent of that workflow.
  - IF the CLI reports that an agent of the workflow could not be stopped, THEN the AI Agent Panel shall show "Could not stop the workflow."
  - WHEN the user opens the workflow view, the AI Agent Panel shall show it in a resizable window with the workflow's status and stats, its phases, one lane of agent cards per phase and a pane for the selected agent.
  - WHEN the user selects an agent card, the AI Agent Panel shall show that agent's activity, model, elapsed time, tokens and tool count in the pane.
  - WHERE the CLI can stop a single subagent (E5), the AI Agent Panel shall add a "Stop agent" button to the pane and a stop button to each running agent's card and row.
  - WHERE the stream carries an agent's prompt or output, the AI Agent Panel shall add a "Prompt" or "Output" tab to the pane.
  - WHERE the stream carries agents' start and end times, the AI Agent Panel shall show a timeline whose rows select their agent.
  - WHEN the user presses "All steps", the AI Agent Panel shall show every step and reply the stream carried for the selected agent, in order.
  - The AI Agent Panel shall render workflow and agent text as R17 specifies.
  - WHEN the user presses "Open in a tab", the AI Agent Panel shall move the workflow view into an Obsidian tab.
  - WHEN the user presses Escape or Close in the workflow window, the AI Agent Panel shall close the window.
  - WHEN the user resizes the workflow window, the AI Agent Panel shall reopen it at that size on this device.
  - WHEN the tab of the workflow's conversation closes, the AI Agent Panel shall keep the workflow view's last state, show "Ended: its conversation was closed." and disable its stop buttons.
  - WHEN Obsidian restores a workflow tab after a restart, the AI Agent Panel shall show only "This workflow ran before Obsidian restarted; its live data is gone."
  - WHILE the workflow view is at most 1080 px wide, the AI Agent Panel shall show the detail pane over the lanes only while an agent is selected.
  - WHILE the workflow view is at most 880 px wide, the AI Agent Panel shall hide the tokens and cost stats and the phases' details.
  - WHILE the workflow view is at most 640 px wide, the AI Agent Panel shall stack the lanes in one column and hide the timeline, subtitle and stats.
  - WHILE the workflow view is at most 680 px tall, the AI Agent Panel shall hide the timeline.
  - The AI Agent Panel shall take workflow and agent data only from the CLI's stream, reading no file the CLI writes.

## MODIFIED requirements

### Renames

"background-task strip" becomes "run bar" wherever it appears in PRD-001.

### PRD-001

- **PRD-001.R7** — Conversation tabs.
  - Add: WHILE agents run in a conversation, the AI Agent Panel shall show on its tab a badge with the running agent count, titled "1 agent running" or "N agents running".
  - Add: WHILE agents run in a conversation, the AI Agent Panel shall add "1 agent running" or "N agents running" to its tab's hover card.
  - Reason: SPEC §2.7 Tab, §4.24.
- **PRD-001.R18** — Subagents and background tasks.
  - Title: Subagents and background tasks. An agent is a subagent a Task or Agent call started; a task is any other background item the CLI reports; a subagent running in the background counts once, as an agent.
  - Before: WHILE the CLI reports background tasks, …
  - After: WHILE agents or tasks run in a conversation, the AI Agent Panel shall show a run bar above the composer with the running count, the workflow's name while one runs, the elapsed time and a "Stop all" button.
  - Add: The AI Agent Panel shall word the run bar's running count "1 agent running" or "N agents running" while only agents run, "1 task running" or "N tasks running" while only tasks run, and "N running" while both run.
  - Add: WHERE the CLI reports waiting agents, the AI Agent Panel shall add "· N waiting" to the run bar and to the tab's hover card, and list the waiting agents in the run bar's popover.
  - Add: WHEN the user clicks the run bar, the AI Agent Panel shall open a "Running in this conversation" popover listing each running agent and task with its activity, elapsed time and stop button, then "N finished · M failed" and "Stop all".
  - Add: WHEN the user presses "Stop all", the AI Agent Panel shall ask the CLI to stop every running agent and task of the conversation.
  - Add: IF the CLI reports that an agent or task could not be stopped after "Stop all", THEN the AI Agent Panel shall show "Could not stop every agent and task."
  - Add: WHERE the CLI can stop a single subagent (E5), the AI Agent Panel shall show a stop button titled "Stop <name>" on each running agent's row.
  - Before: WHEN the user presses a background task's Stop, …
  - After: WHEN the user presses the stop button of an agent or task, the AI Agent Panel shall ask the CLI to stop it.
  - Reason: SPEC §4.16, §4.23; Q22 as the owner decided (D4). Without E5, stop buttons appear on tasks only.
- **PRD-001.R24** — Settings storage and sync.
  - Before: The AI Agent Panel shall keep the model lists, …
  - After: The AI Agent Panel shall keep the model lists, alias labels and startup permission modes learned from the CLI, the open tabs, the column width, the collapsed sections and the workflow window's size on this device only.
  - Reason: Q23; the size is layout state (ADR-009).
- **PRD-001.R28** — Accessibility.
  - Add: The AI Agent Panel shall show each agent's status (done, running, failed, and queued or waiting where the CLI reports them) by icon shape as well as color, and as text in its accessible label.
  - Add: The AI Agent Panel shall expose the run bar as a status and label its "Stop all" button "Stop all agents and tasks".
  - Reason: SPEC §4.16 agent rows.
- **PRD-001.R34** — Theme.
  - Add: The AI Agent Panel shall draw the workflow view in the mode it draws the panel in.
  - Reason: SPEC §4.6 Theme.

### PRD-003

- **PRD-003.R3** — What history leaves out.
  - Before: The AI Agent Panel shall store pasted images as a count only …
  - After: The AI Agent Panel shall store pasted images as a count only and keep tool-result images, subagent threads, background tasks, workflow runs and permission decisions out of history.
  - Reason: workflows are live only, like subagents.

### Other PRD sections

- PRD-001 Problem, scope sentence becomes: "Scope: the panel, its layout and theme, the workflow view, its CLI sessions, conversations and tabs, the composer and its context, message rendering, subagents, panel commands, models and effort, settings, platforms and errors."
- PRD-001 Non-goals, add: "- Agent detail read from the CLI's transcript files: outside the constitution's bounded file access."
- PRD-003 Non-goals, the storing line becomes: "- Storing images, subagent threads, background tasks and workflow runs: live only by design (recorded, docs/current/design/DES-005-persistence-and-sync.md, docs/current/SECURITY.md)."

## REMOVED requirements

None. The background-task strip becomes the run bar.

## Adopted decisions

- Q23: an Obsidian modal with a remembered size, and the same component in a workspace tab for "Open in a tab".
- SPEC's "Full transcript" is "All steps" and shows only what the stream carried, since "transcript" names the exported note (owner A3) and reading the CLI's transcript files would breach the constitution's bounded file access.

## Design and migration impact

- DES-002: `stop_task` for subagents (E5), the workflow stream messages (E6).
  DES-003: run bar, popover, workflow card and view. DES-005: the device-local
  window size.
- Data: nothing stored; workflows and the run bar are live only.
- Rollback: the previous release shows its background-task strip again.
- Rollout: walking skeleton first, the run bar with one task's stop against
  the fake CLI; then the popover and "Stop all", per-agent stop, the workflow
  card, the workflow view.
- Verification: `node:test` cases named with these IDs for the run-bar counts
  and wording, stop requests and their failures, and workflow fallbacks,
  against fake-CLI scenarios derived from the spike; manual rows for the
  workflow view at 600, 900 and 1200 px wide and 600 px tall, and after its
  conversation's tab closes.

## Incorporation

Approval folds these deltas into PRD-001 and PRD-003 in
`docs/current/product/` without renumbering unchanged requirements.
`make close DOC=docs/work/changes/CHG-003-agents-and-workflows.md` moves this
delta to `docs/records/changes/`, both in the approval commit. An accepted
requirement never lives outside the PRD.
