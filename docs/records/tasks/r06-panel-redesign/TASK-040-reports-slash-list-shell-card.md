---
status: closed
release: r06-panel-redesign
number: 040
prd: PRD-001.R19, PRD-001.R20, PRD-001.R21, PRD-002.R16, PRD-005.R6
---

# TASK-040 — Reports, slash list, shell card

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 10: report cards with loading, answered and failed states and
callback actions, the usage cards as reports, the grouped slash list, and the
`!` run's card, with panel commands and the shell escape moved into
`tab/panel-commands` and `tab/shell-escape`.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R19, R20, R21; [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R16; [PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md) R6;
[DES-003](../../../current/design/DES-003-panel-ui.md) Panel commands, Report
cards, Suggests, Cards (shell card);
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Shell escape; [DES-007](../../../current/design/DES-007-usage-and-cost.md);
[ADR-011](../../../current/adr/ADR-011-user-shell-escape-outside-agent-permissions.md).

Acceptance:

1. Report card states: loading (the busy title, "Checking usage…" for usage
   cards, `aria-busy="true"`, skeleton bars, no badge or actions); answered
   (header with icon tile, title, "no tokens", Refresh on live cards except
   `/help`, "Copy as Markdown" on live cards; body parts per DES-003's
   table); failed (`role="alert"`, "Couldn't load", the failure text, "Try
   again", "Copy error"; the did-not-start and missing-field texts in the
   same slot). A card is a `region` named by its title.
2. Actions are callbacks: Refresh and Try again re-run into the same card
   (a recorded card's Markdown replaced); copies go through `ui/copy`; row
   actions only on live cards; `/help` rows insert `/<name>` and a space;
   `/status`'s "open /mcp" runs `/mcp`; tables over 14 rows show 12 behind
   "Show all N"; only `https` links.
3. Recording per PRD-001.R20: the command and `reportMarkdown(report)` unless
   a turn runs; not for a conversation deleted meanwhile; reopen draws the
   Markdown through `ui/markdown`.
4. `/usage` and `/usage-credits` (`/extra-usage`) cards are `CommandReport`s
   from `state/usage-segment` with PRD-005.R6's content and failure lines.
5. Slash list: "Answered by the panel" marked "no tokens", then "Claude
   Code", each sorted, with descriptions and argument hints, the panel's
   description winning on a shared name, one description per panel command
   in the list and in `/help`; the commands button prefixes `/` and opens it;
   `/clear` opens a new tab.
6. `/mcp`: servers by severity, Reconnect and Disable or Enable on live rows,
   none for the panel's own server; R21's texts.
7. Shell card: "Shell", duration, "running", then "done", "exit N", "failed"
   or "timed out", stdout and stderr or "No output."; "Add output to chat"
   with "Claude hasn't seen this" once ended; only the user's own composer
   text runs.

## Scope

Expected files:

- New: `src/tab/panel-commands.ts`, `src/tab/shell-escape.ts`,
  `src/ui/shell-card.ts`.
- Changed: `src/report-view.ts` (states, header actions, bars, callbacks),
  `src/suggest.ts` (groups), `src/commands.ts` (descriptions, the list
  merge), `src/state/usage-segment.ts` (the usage reports),
  `src/tab/chat-tab.ts` (send path steps 3 and 4), `src/ui/messages.ts`
  (report items and their callbacks), `src/view.ts`, `styles.css`,
  `tests/fake-cli.mjs` (answers to the report requests, trimmed from the
  replies `tests/commands.test.mjs` already holds, and a switch that fails
  them); `tests/commands.test.mjs`, `tests/state-usage-segment.test.mjs`.
- Docs: DES-007 (the usage cards as reports); `README.md` (info commands,
  slash commands, `!` escape); `docs/current/DEVELOPMENT.md`;
  `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- Which commands the panel answers and the control requests behind them
  (`commands`, DES-007; unchanged); `bash`'s invocation, limits and timeout
  (DES-004, ADR-011; unchanged).
- `/clear` staying in the conversation (change 002).
- No new dependency; no protected path; no real-CLI run.

## Plan

- Tests first: one description per panel command and the list merge
  (`PRD-001.R19`); report builders and `/help`'s "Show all N"
  (`PRD-001.R20`); `mcpReport` and `mcpActionRequests` (`PRD-001.R21`); the
  usage and credits reports and their failure lines (`PRD-005.R6`).
- Moves out of `view.ts`: `runPanelCommand`, `buildReport`,
  `panelStatusRows`, `runLocalUsageCommand` to `tab/panel-commands`;
  `runBashCommand` to `tab/shell-escape`; `createBashCard`, `fillBashCard` to
  `ui/shell-card`, which imports `bash`'s `ShellResult` as a type only.
- Fake CLI: today it refuses every report request, so only failed cards can
  be checked in a vault; DES-003 names `mcp` for R21, but that scenario
  drives `mcp_message`, not `mcp_status`.
- Verification: `make verify`; manual, by someone other than the
  implementer, at least at 300 and 1040 px: R20's rows (loading, failed, Try
  again, Refresh, Copy as Markdown, a refreshed recorded card after reopen),
  R21's `/mcp` rows, R19's (slash groups, the commands button, `/clear`),
  `/usage` and `/usage-credits`, a `!` run's card. Codex cross-review before
  commit: the `!` escape's path moves and CLI-reported strings reach the
  DOM.
- Risks: a CLI string reaching the DOM other than as text (DES-003 Data and
  security: report cells, server names, command hints set as text);
  recording a card twice on Refresh (the recorded `assistant` message is
  replaced).
- Rejected: usage cards as Markdown (DES-003 Alternatives: one drawing path
  with shared states and actions).

## Run log

- Tests first, against 9e8f437 (037 landed): `commands`, `state-tab`,
  `state-turn`, `state-composer` and `state-usage-segment` failed on import
  (no `DID_NOT_START`, `shellStatus`, `addReport`, `withCommand`,
  `creditsReport`); `protocol` failed "the fake CLI answers each report
  request…" (refused as unsupported) and "the fake CLI reports commands at
  start" (no `commands`). `tab-shell-escape` was written with the module it
  tests, when A12 required it in `pretest`; against 9e8f437 it fails on
  import.
- Ask-first `package.json`: `pretest` gains `src/tab/shell-escape.ts` (A12:
  every module without `obsidian` is bundled for tests).
  `tests/architecture.test.mjs` and `tests/styles.test.mjs` unchanged.
- Codex cross-review not called: Codex is unavailable (spend cap). The
  independent review covers the `!` escape's move and the CLI strings
  reaching the DOM.
- Choices the accepted docs leave open, and departures, for review:
  - Model: `report` and `shell` item kinds (`state/tab`), added and
    replaced by `addReport`, `addShell` and `updateItem` (`state/turn`); a
    reopen builds them, a recorded card holding its Markdown. Legacy items
    remain for tool calls, cards and the branch note. `state/tab` and
    `state/turn` were not in the expected files.
  - `shellStatus` lives in `state/tab`, not `bash`: the reopen (state) and
    the card (ui) both need it, and neither may import `bash` at runtime.
    The duration reads to a tenth of a second (`formatSeconds`, extracted to
    `state/turn` and used by the turn footer too; it was whole seconds); a
    run killed with no exit code reads "failed" (it read "exit null").
  - Bars: `ReportBar.percent` may be null (a row without a bar) and a bar
    may carry its `value`, so the credits card's status, limit and use, and
    extra usage without a cap, are bar rows in PRD-005.R6's order; recorded
    as `- **label:** value - sub`. The `/usage` card is titled "Plan usage"
    (PRD-005.R6; it was "Claude usage") and notes the thresholds;
    `usageThresholds` moved from `ui/status-line` to `state/usage-segment`.
  - A failed card is recorded too (`failureMarkdown`): a reopen pairs each
    recorded command with the next `assistant` message, so a command
    without its card would take Claude's reply as its card. Try again
    repeats the command's arguments; Refresh and row actions do not. A row
    action's failure stays a Notice (`<label> failed: <error>`), then the
    card lists again.
  - Card titles are `PANEL_COMMANDS`' `title`, read by the loading card and
    the builders (`reportTitle`). `/help` shows all of the panel's commands
    under "Answered by the panel" with a "no tokens" badge, and three of
    Claude Code's; its rows put `/<name>` and a space at the start of the
    composer, replacing a command typed there (`withCommand`). `/status`'s
    "open /mcp" is the action of the row whose value ended in the CLI's
    `· /mcp` hint. Tile icons per command from the canvas SPEC (§4.9 to
    4.15).
  - Slash list: `commandList` in `commands` (the built-in descriptions moved
    from `suggest`); group headers through the base suggest's `groupOf` and
    `renderGroup`; with a query, the best match first within each group.
    The suggest CSS moved above the legacy tail.
  - `report-view` (layer 3) cannot import `ui/dom`: it draws its own icon
    buttons and icon fallback, and reuses `meterBar`'s classes for bars.
  - Fake CLI: replies to every report request (trimmed from the captured
    ones in `tests/commands.test.mjs`), `mcp_status` with five servers whose
    `mcp_toggle` and `mcp_reconnect` change them, six commands in the
    `initialize` reply, `FAKE_CLI_REFUSE_REPORTS`; `protocol` builds every
    card from them.
  - Residual, as before: a prompt sent while a card loads whose reply text
    is recorded before the card answers (a slow CLI start) makes a reopen
    take that reply as the card.
  - For the owner: ADR-016 (Modules, last paragraph) still names
    `usageMarkdown` and `creditsMarkdown`, now `usageReport` and
    `creditsReport`; ADRs were not edited.
  - Files beyond the expected list: `src/state/tab.ts`, `src/state/turn.ts`,
    `src/state/turn-cost.ts`, `src/state/composer.ts`, `src/ui/composer.ts`,
    `src/ui/status-line.ts`, `tests/state-tab.test.mjs`,
    `tests/state-turn.test.mjs`, `tests/state-composer.test.mjs`,
    `tests/protocol.test.mjs`, `tests/tab-shell-escape.test.mjs`,
    `package.json`, DES-001, DES-003, DES-004, DES-005, `plan.md`.
  - No `docs/records/verification/` record: the rows are run by someone
    other than the implementer, who records them (030 to 037's practice).
- Self-check in headless Chromium with Obsidian 1.14.4's `enhance.js` and
  `app.css` (the real shell, messages, `ChatTab`, `PanelCommands`, report
  and shell cards and slash suggest; stub session replies, usage service,
  icons and Markdown): `/status` loading (`region` "Status", `aria-busy`,
  "Asking Claude Code…", no badge or buttons), then answered with "no
  tokens", Refresh and Copy as Markdown and the panel's rows; "open /mcp"
  ran `/mcp`; Disable on github set the card loading, sent `mcp_toggle`,
  listed again with github disabled, and replaced the recorded Markdown
  (one `assistant` message); `/help` with three of five CLI commands and
  "Show all 5", a row click putting `/chrome ` in the composer; `/context`'s
  collapsed sections toggling with `aria-expanded`; a refused `/memory`
  card `role="alert"` with "Couldn't load", Copy error copying the text, and
  Try again answering into the same card, recorded once; `/usage` "Checking
  usage…", then bars tinted at 81% and 95%; `/usage-credits` with its link;
  shell cards done, exit 2 (stderr rule), timed out, "No output.", failed
  with the spawn error, running; every card reopened from the recorded
  messages as Markdown with no buttons; no horizontal overflow at 300 or
  1040 px; the slash list's two headers, "no tokens", and `/co` filtering
  within each group.
- API changes for later slices: `ChatTab` gains `addReport`, `addShell`,
  `updateItem`, `card(id, kind)`; `ChatTabHost.runPanelCommand` and
  `runShell` now reach `tab/panel-commands` (`PanelCommands.run`, `refresh`,
  `act`) and `tab/shell-escape` (`ShellEscape.start`, `addOutput`).
  `state/tab` gains `ReportItem`, `ShellItem`, `shellStatus`; `state/turn`
  `addReport`, `addShell`, `updateItem`, `formatSeconds`; `state/composer`
  `withCommand`; `state/usage-segment` `usageReport`, `creditsReport`,
  `usageThresholds` (`usageMarkdown`, `creditsMarkdown` gone). `commands`
  gains `SlashCommand`, `commandList`, `reportTitle`, `reportHeader`,
  `ReportState`, `ReportBar`, `foldedAt`, `failureMarkdown`,
  `DID_NOT_START`, `couldNotAnswer`, `USAGE_COMMANDS`; `ReportAction` is a
  request or a command; rows gain `insert`, sections `badge`, `collapsed`,
  `fold`. `report-view`: `ReportCard` and `ReportCallbacks` replace
  `renderReport`. `ui/messages` intents gain `onRefreshReport`,
  `onReportAction`, `onInsertCommand`, `onAddOutput`; `Composer` gains
  `insertCommand`.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer, at 300 and 1040 px unless stated:
  1. PRD-001.R20 (`basic`): `/status` loading (spinning tile, "Asking
     Claude Code…", three shimmering bars, no badge or buttons), then
     answered with "no tokens", Refresh and Copy as Markdown (pasted text is
     the card's Markdown); "open /mcp" runs `/mcp`; `/memory`, `/hooks`,
     `/permissions`, `/skills`, `/chrome` (its links open in the browser),
     `/sandbox`, `/cost`; `/context` after one message: meter, legend, four
     collapsed sections that open and close; `/help`: a row puts the
     command in the composer unsent, "Show all 5" shows the rest, no
     Refresh.
  2. PRD-001.R20, failed: with `FAKE_CLI_REFUSE_REPORTS=1`, `/status` reads
     "Status Couldn't load" and "Claude Code could not answer: Refused
     get_status. Updating it may help.", read out as an alert; Copy error
     pastes that text; Try again loads again into the same card. A profile
     with a missing CLI path: "Claude Code did not start - see the error
     above." under the error block. `/context` before any message fails
     with "no turn received yet".
  3. PRD-001.R20, recording: Refresh a recorded `/mcp` card, close the tab,
     reopen the conversation from history: the refreshed card shows once,
     as Markdown, without buttons; the exported note has it. A `/status` run
     during a `turn` scenario turn shows its card and is missing after a
     reopen.
  4. PRD-001.R21 (`basic`): `/mcp` lists postgres (failed, with the spawn
     error), linear (needs sign-in), github and obsidian (connected), figma
     (disabled), with the sign-in note; obsidian has no buttons; Disable on
     github lists it disabled, Enable brings it back; `/mcp disable all`,
     `/mcp reconnect nope` (`No MCP server named "nope".`), `/mcp frob`
     (the usage text), `/mcp disable obsidian` (the plugin setting).
  5. PRD-001.R19: the slash list shows "Answered by the panel" with "no
     tokens", then "Claude Code" (compact, init, security-review before a
     CLI starts; six once one has, `context` only in the panel's group);
     `/co` filters within the groups; the commands button prefixes `/` and
     opens it; `/clear` in a tab with a conversation opens a new tab.
  6. PRD-005.R6: `/usage` after a message: bars at 42%, 18%, an orange 81%
     and 12% with reset times, extra usage $3.50 of $50.00 with 7%, the
     thresholds note; `/usage-credits` and `/extra-usage`: "As of HH:MM ·
     also answers /extra-usage", status, limit, use with a bar, the link
     opening claude.ai/settings/usage; before any CLI runs, and with
     `FAKE_CLI_REFUSE_USAGE=1`, a failed card `Couldn't fetch usage: …`.
  7. PRD-002.R16: `!echo hi` (running, then done with its time), `!ls nope`
     (exit 2, stderr with a red rule), `!sleep 70` (timed out at 60 s), a
     long output scrolling inside the card at 300 px; Add output to chat
     fills the composer unsent, beside "Claude hasn't seen this"; a reopen
     shows the cards; with the escape off `!ls` goes to Claude.
  8. M6, M7: Tab reaches every card button and the collapsed sections;
     reduced motion stills the spinner and the shimmer; in Windows high
     contrast the status dots and legend swatches keep their colors.
  9. Review fixes: close a tab while `/status` loads (a slow CLI start),
     reopen the conversation: the card shows its answer; Refresh, Try again
     and a `/mcp` row's button by keyboard keep focus on the control (on
     the card while loading), "Show all 5" moves it to the first row shown;
     `/mcp frob` answers with the servers and the usage text, no Try again.

- Review fixes, in `wip: task 040 review fixes`, tests first where pure
  (`tab-panel-commands` failed 5 of 7 on the old logic once the module had
  no `obsidian` import; `state-composer` failed on `withCommand`; `bash`
  failed on the killed run's text):
  - D1: a card loading when its tab closed was never recorded, so its
    command reopened with the next reply as its card. The card's
    `assistant` message is now recorded with the command
    (`pendingMarkdown`, "<title> - No answer recorded") and its text follows
    the card, saved whether or not the tab is open; only the redraw needs
    it. This also fixes the residual above: a reply recorded while a card
    loads stays a reply on reopen.
  - D2: Try again repeated the typed arguments after a failed Refresh; it
    now repeats the failed attempt's.
  - Gap 4: a redraw kept no focus; it returns to the control, its row, or
    the card (`tabindex="-1"`), and "Show all N" focuses the first row shown.
  - Gap 5: an `/mcp` argument error is an answered card listing the servers,
    the error as its lead, not a failure with a useless Try again.
  - Nits: "open /mcp" checks for a running restore (PRD-002.R14);
    `drawIcon` and `meterBar` moved to `icon` (layer 3, which `ui/` and
    `report-view` may import), ending the copies in `report-view`; the
    shell output is capped at `20lh`; `withCommand` replaces only a lone
    `/` or a known command name; "Add output to chat" says a run killed with
    no exit code failed, as the card does; a stale comment in `view.ts`; a
    shell card is named "Shell: <command>".
  - `tab/panel-commands` lost its `obsidian` import (Notices through the
    host), so A12 puts it in `pretest` (ask-first `package.json`).
  - Lead-authorized maintenance, for the owner: ADR-016 (Modules) names
    `usageReport` and `creditsReport` for the old Markdown formatters, and
    ADR-011's evidence names today's one caller of the escape
    (`src/ui/composer.ts:219`, `ChatTab.send`, `ShellEscape.start`).
- Replayed onto `main` at 4ac90d0 (038 landed): the net diff
  9e8f437..f946ef2 applied with `git apply --3way`. Resolved: `MessageItem`
  holds 038's `card` items beside `report` and `shell`; `state/turn` keeps
  `addCard` and `patchCard` beside `addReport`, `addShell` and
  `updateItem`; `ui/messages` draws all three, the report and shell entries
  with no `card`; the view's Messages intents take 038's card intents and
  this slice's; `pretest` lists both slices' modules; `styles.css` rebuilt
  from `main` with this slice's edits (038 had already dropped the
  permission plan's legacy table rules); release notes, DES-001, DES-003,
  DEVELOPMENT.md and `plan.md` merged. The Chromium self-check re-run on the
  replayed tree: the same results, focus included.

## Independent review

A review agent, not the implementer, in a clone and a headless-Chromium
harness with Obsidian 1.14.4's `enhance.js` and `app.css`; no Codex (spend
cap). Round 1: D1, closing a tab while a card loaded recorded the command
with no card (a regression); D2, Try again repeated the typed arguments,
not the failed attempt's; Gap 3, a reply recorded before a slow card
reopened as the card; Gap 4, focus fell to the page after Refresh, Try
again, a row action or Show all; Gap 5, `/mcp` argument errors drew as a
failed load; nits (the restore check on "open /mcp", duplicated icon and
meter code, the shell cap, `withCommand`, the killed-run text, a stale
comment, shell card names, ADR-016 and ADR-011 references). The `!`
escape, CLI strings as text only, https-only links and recording were
verified unchanged. Round 2 on the branch replayed onto 038: all fixed;
the merge with 038's cards and the CSS deletions checked.

## Outcome

- Reopened report cards no longer carry the "Copy message" button they had:
  DES-003 draws a recorded card with no actions.
- Owner items: ADR-016 and ADR-011 statements rewritten to today's code;
  `package.json` `pretest` gains two modules; manual rows 1 to 9 in the
  Run log, recorded by someone other than the implementer.
- Residual: a conversation saved before this task with a command whose
  card was never recorded still pairs the next reply with that command.
