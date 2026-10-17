---
status: closed
release: r06-panel-redesign
number: 037
prd: PRD-001.R15, PRD-001.R32, PRD-005.R7
---

# TASK-037 — Turn

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 7: the main thread's stream reduced by `state/stream` into the
messages model and drawn by `ui/turn` (head, text, thinking, footer), the
screen-reader announcer, error blocks, and the session code moved into
`tab/session-link`, with the send path in `tab/chat-tab`. PRD-001.R32 lands
with the turn's hover card, its last surface.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R15, R32 (R6's turn close-out, R11's send path);
[PRD-005](../../../current/product/PRD-005-plan-usage-and-cost.md) R7;
[DES-003](../../../current/design/DES-003-panel-ui.md) Turn, Stream to
messages, Turn head, thinking and footer, Composer (send path), Keyboard and
accessibility (announcer), Performance budget;
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md);
[DES-007](../../../current/design/DES-007-usage-and-cost.md) Cost and tokens;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) State and updates
(deltas bypass events).

Acceptance (fake CLI `turn` and `basic`, and one real-CLI run):

1. A turn opens at a message sent while no turn runs or at the first
   assistant output while none runs, closes at `result` or session end; a
   prompt sent mid-turn starts a continuation without a head; the footer
   sits at the end of the last continuation.
2. Head: the Claude mark ringing while running, "Claude", "Working",
   "Writing" or "Waiting for you" with the elapsed time ("42s", "3m 05s",
   "1h 12m") on the ticker; none once closed.
3. Text deltas append to one text node with a caret, no layout read; a
   finished block renders through `ui/markdown`, keeping plain text if
   rendering rejects; empty text removes the block. Scroll-follow at most
   once per frame, only within 120 px of the bottom, forced by a send,
   skipped for a hidden tab.
4. Thinking: a collapsed toggle, in the head when it is the turn's first
   block; "Thinking…", "Thought for Ns", "Thought process" when the time is
   unknown; a click shows or hides it.
5. Footer, always visible after the turn: "Restore files", "Branch" once the
   turn's uuid is known, a copy button (reply blocks joined by blank lines;
   failure Notice "Could not copy to the clipboard."), the duration to one
   decimal and the turn's cost to four (`total_cost_usd` minus the previous
   finished turn's of the same session), or `Error: <message>` up to 500
   characters; labels hidden below 360 px. Reopened turns compute the cost
   from the recorded totals.
6. Duration and cost take focus; for a turn finished since the conversation
   opened, their hover card shows the four token counts and "At API prices;
   plans count usage instead".
7. `ui/announcer` alone sets `aria-live`: "Claude is waiting for you" when a
   card starts waiting in the active tab, "Claude finished" when its turn
   closes at `result`, cleared before each message. The architecture test
   checks P2.
8. Errors outside a turn (CLI not found, spawn failure, exit) are error
   blocks of up to 2000 characters, `role="alert"`.
9. Session creation, launch options, respawn, leaving Bypass and the model,
   effort and mode calls live in `tab/session-link`; the send path runs in
   `tab/chat-tab` in DES-003's order; `view` no longer imports `session` and
   the allowlist loses its U3 row.
10. Today's typing indicator and meta line are gone.

## Scope

Expected files:

- New: `src/state/stream.ts`, `src/state/turn.ts`, `src/state/turn-cost.ts`,
  `src/tab/session-link.ts`, `src/ui/turn.ts`, `src/ui/announcer.ts`,
  `src/ui/error-block.ts`, `tests/state-stream.test.mjs`,
  `tests/state-turn.test.mjs`, `tests/state-turn-cost.test.mjs`.
- Changed: `src/tab/chat-tab.ts` (send path, applying stream changes),
  `src/state/tab.ts` (turn items, usage totals), `src/ui/messages.ts`
  (mounts turns), `src/view.ts`, `styles.css`, `package.json` (`pretest`),
  `tests/fake-cli.mjs` (scenario `turn`: deltas, thinking, a result with
  token usage), `tests/architecture.test.mjs` (P2 on, the U3 row out).
- Docs: DES-007 (`turnCost`, the footer's cost and tokens, the conversation
  cost in the tab hover card); DES-002 (its `view.ts` module row becomes
  `tab/session-link`); `README.md` (streamed responses, turn footer);
  `docs/current/DEVELOPMENT.md` (spec rows, the scenario); `RELEASE_NOTES.md`.
- Evidence: `docs/records/verification/` records of the manual rows and of
  the real-CLI run, sanitized.

Negative scope:

- Subagent traffic, tool calls, background tasks (039: `legacy` until then);
  permission cards (038); panel commands and the `!` escape, which the send
  path reaches through `view` callbacks until 040; the context block, through
  a callback until 041.
- The backlog's local-command output (PRD-001.R12) and restart ordering
  (PRD-001.R5) defects.
- No new dependency; the architecture-test edits above are the only
  protected path, tightening only (owner's 2026-10-11 instruction, recorded in the Run log;
  a loosening edit stops for the owner).
- The real-CLI run is owed, not done: one human session, approved by the
  owner beforehand (metered use, constitution), recorded sanitized.

## Plan

- Tests first: deltas, finalized text, thinking blocks, the uuid from the
  first echo without a `tool_result` (`PRD-001.R15`, `state-stream`); turn
  open and close, continuations, head and thinking labels, `formatElapsed`,
  copy text (`PRD-001.R15`, `state-turn`); per-turn cost from totals, the
  first turn of a session, reopen, an error turn (`PRD-005.R7`,
  `state-turn-cost`).
- Moves out of `view.ts`: `handleStreamMessage`, `handleStreamEvent`,
  `handleAssistantMessage`, `noteTurnUuid`, `handleResult`, `renderTurnMeta`,
  `addTurnActions`, `startStreamingText`, `finalizeText`,
  `startStreamingThinking`, `finalizeThinking`, `renderError`, `showTyping`,
  `removeTyping`, `accumulateUsage`, `conversationCostOf` to `state/stream`,
  `ui/turn`, `ui/error-block` and `chat-tab`; `handleSend` to `chat-tab`;
  `ensureSession`, `createSession`, `onLaunchSettingsChanged`'s per-tab part,
  `leaveBypass`, `handleSessionEnded`, `applyModel`, `applyEffort`,
  `pickPermissionMode`'s session calls to `tab/session-link`. `view` keeps
  the shared MCP server and hands it in.
- Allowlist: the `src/view.ts` U3 row (imports `session`) goes; the test
  starts checking P2.
- The `turn` scenario and the state tests' messages are shaped from today's
  parsing code; the real-CLI run checks both against the CLI and the 030
  interrupt shape. Residual: a stream shape neither exercised.
- Verification: `make verify`; manual, by someone other than the
  implementer, at least at 300 and 1040 px: `turn` (streaming, head, footer,
  copy), M6 (the two announcements), `basic` (footer and its hover card),
  R32's rows (M1, M5, M6), and M8's streaming-while-typing profile in another
  tab. Codex cross-review before commit: session creation and leaving
  Bypass move.
- Risks: a session behavior changing in the move (`session.test.mjs` stays
  green; DES-002's manual rows rerun: restart on settings close, leaving
  Bypass); deltas lost when a block's start arrives after its first delta.
- Rejected: deltas through events (ADR-016: the streaming path bypasses
  them); keeping the typing indicator beside the head (drawn twice).

## Run log

- Tests first, against 036's tree (bc75952, with 035's review fixes
  dbaff7a cherry-picked at the coordinator's request): `state-stream`,
  `state-turn` and `state-turn-cost` failed on import (no modules);
  `state-tab` failed on import (no `modelFromStored`); `transcript-markdown`
  failed "PRD-005.R7: each exported turn shows its own cost" (the line read
  the session's $0.0250); the architecture test's P2 fixture fails with the
  rule disabled.
- Protected path, under the owner's instruction of 2026-10-11, for the
  owner to confirm: `tests/architecture.test.mjs` loses the allowlist's last
  row (`view` U3, imports `session`), so the allowlist is empty, and checks
  P2 (an `aria-live` string or the `ariaLive` property outside
  `ui/announcer`), with fixtures; tightening only. `tests/styles.test.mjs`
  unchanged. Ask-first `package.json`: `pretest` gains `state/stream`,
  `state/turn` and `state/turn-cost`.
- Codex cross-review not called: Codex is unavailable (spend cap). The
  independent review covers session creation and leaving Bypass moving.
- Choices the accepted docs leave open, and departures, for review:
  - Model: a turn item holds its blocks (text, thinking, and as `legacy`
    blocks today's tool cards, permission cards and question forms until
    038 and 039); panel-command cards, `!` runs and the branch note stay
    top-level `legacy` items; errors are `error` items. One machine
    (`state/turn`) serves live and reopen: `modelFromStored` replays the
    stored messages through it.
  - Send path: the turn opens with the prompt item at step 8 (one model
    change: prompt, then head), not at step 7. DES-003 says so.
  - `ClaudeSession` reports busy-off before it forwards the `result`, so
    the turn closes when the `result` is applied (its footer needs the
    figures) while `turn` fires at the busy change; an exit closes the turn
    at the busy change, finalizing streamed text and thinking.
  - Reopen: a prompt recorded between a turn's output and its `meta`
    record is marked "queued mid-turn" and continues the turn; a `meta`
    record holding only its error is the error a session ended with and
    reopens as an error block; a turn the file leaves open is closed.
    Residuals: reply text is recorded when its block finishes, so text that
    was streaming when a prompt was sent mid-turn reopens after that prompt;
    an unfinished turn (no `meta`) followed by a new prompt reopens as one
    turn with a continuation. DES-003 says so.
  - The turn counter (`meta.turn`) also counts turns Claude's output opened
    (DES-003 Turn); on reopen it continues from the highest of the recorded
    numbers and the turns rebuilt.
  - Per-turn cost: from the recorded totals, live and on reopen alike,
    joining records without a session id as `conversationCost` does, so the
    turns add up to the conversation's cost; a total lower than the turn
    before costs 0, not less. The export's turn lines use it (PRD-005.R7;
    `transcript-markdown` was not in the expected files). DES-007 says so.
  - Stream: a delta before its block's start opens the block and the start
    adopts it (the plan's named risk); a text or thinking block starting
    while an earlier one waits for its `assistant` message finalizes the
    earlier one from its deltas; any block's start ends the streaming of
    the one before. Thinking in an `assistant` message without stream
    events now shows as a closed "Thought process" block (it drew nothing).
  - Head: "Working" between the send and the CLI's turn start; the
    waiting state also shows a dot in the warning color.
  - Footer: Restore files (rotate-ccw) and Branch (git-branch) as icon and
    label, named by today's tooltips; "Branch from here" becomes "Branch"
    (PRD-002.R15; DES-004 and README updated). The copy button stays
    visible; replies lose their own copy buttons. The duration and cost are
    focusable even for a reopened turn, which has no hover card.
  - Announcer: clears, then writes the message 100 ms later, so a repeat is
    read; `aria-atomic`.
  - Jump rail: a pass for the messages content alone while the active tab
    is writing waits for the activity to leave writing (DES-003 Prompts);
    `ResizeMeasure.read` gains `full`.
  - `formatElapsed` moved from `state/tabs` to `state/turn` (DES-003 module
    table).
  - Fake CLI `turn`: shaped from the panel's parsing, not observed; a
    protocol test runs it through `state/stream` and the turn machine.
  - Files beyond the expected list: `src/transcript-markdown.ts`,
    `src/state/tabs.ts`, `src/ui/shell.ts`, `src/ui/jump-rail.ts`,
    `src/tab/restore-branch.ts` (comments), `tests/state-tab.test.mjs`,
    `tests/state-tabs.test.mjs`, `tests/transcript-markdown.test.mjs`,
    `tests/protocol.test.mjs`, DES-001, DES-003, DES-004, DES-005,
    `docs/current/SECURITY.md`.
- Self-check in headless Chromium with Obsidian 1.14.4's `enhance.js` and
  `app.css` (035's harness: the real shell, messages, turn, announcer and
  rail on a real `ChatTab`, fed the `turn` scenario's captured stream; stub
  Markdown, icons and session): head "Working 0s" at the send; "Thinking…"
  in the head, then "Thought for 1s"; "Writing" with the caret (7 px
  accent block) while text streams; the finished turn: thinking, two
  replies and the Read card in order, footer Branch, copy, "3.2s ·
  $0.0123" focusable; the copy text the two replies joined by a blank
  line; the token hover card's rows and note; the announcer `polite` with
  "Claude finished"; a prompt sent mid-turn queued, the turn continuing
  below it, its error footer `Error: API Error: Overloaded` at the end of
  the continuation; an exit mid-stream closing the turn with a footer and
  an `alert` error block; the reopen rebuilding all of it ("Thought
  process", costs, the queued mark, the error block); labels hidden at 300
  px and shown at 1040 px; no horizontal overflow at 300, 440 or 1040 px.
- Replayed onto `main` at f4c4a35 (035 and 036 landed): the net diff
  130ee33..1565086 applied with `git apply --3way`, every file clean but a
  comment in `tab/restore-branch.ts`. Resolved:
  - Restore wiring: the footer hands its Restore files button to 036's
    final `RestoreBranch.addTurn` (signature unchanged), which now fires
    `restore` for the changes bar; `TurnMessage` comes from `restore`; the
    view's `detach(prompts)` on a delete stays beside `forgetResume`.
  - One rule for turn numbers: `meta.turn` is the tab's turn counter
    (DES-003 Turn, counting turns Claude's output opens too); "Restore to
    before turn N" takes N from the record's place (`turnRestore`,
    PRD-002.R18), never from `meta.turn`. DES-005 says both, and that a
    reopen continues the counter from the higher of the recorded `turn` and
    the turns rebuilt.
  - Fake CLI: 036's running `rewind` counter (`u-turn-N`) and the `turn`
    scenario's `u-stream-N` coexist.
  - Self-check re-run on the replayed tree, the same results, and with
    036's real `RestoreBranch`: a turn whose Write call is checkpointed
    gets Restore files and Branch on its footer (today's tooltips), the
    record `{turn 1, rewindUuid u-stream-1, sessionId, profileId,
    edited}`, `restore` fired, "Restore to before turn 1" offered and
    disabled while the next turn runs, Restore files running the dry run
    and opening the confirm dialog, Branch taking the uuid, the next turn
    costing $0.0077 of the session's $0.02; reopened, the button attaches
    to the loaded entry and N stays 1.
- API changes for later slices: `ChatTab` gains `connect(ChatTabHost)`,
  `send`, `applyStream` (returns the changes today's code draws),
  `sessionEnded`, `addError`, `setDeltaSink`, `streamed`, `workingSince`;
  `addLegacy(inTurn)` returns a `LegacyRef`; `addPrompt` takes a
  `NewPrompt` (now in `state/tab`, without `queued`); `addTurnUsage` and
  `setTextBlockOpen` are private; `removeItem` is gone. `state/tab` gains
  the turn, block, footer and error item types, `MessagesModel`,
  `EMPTY_MODEL`, `ModelChange`, `Step`, `modelFromStored`, `storedCount`.
  `state/turn`: the machine (`openTurn`, `addUserMessage`, `addBlock`,
  `patchBlock`, `removeBlock`, `closeTurn`, `addLegacy`, `addError`),
  `headView`, `thinkingLabel`, `turnCopyText`, `footerOf`, `endedSession`,
  `formatElapsed`. `state/turn-cost`: `turnCosts`, `figuresText`,
  `turnTokens`, `tokenRows`. `state/stream`: `reduceStream`,
  `finishStream`, `StreamChange`. `tab/session-link`: `SessionLink`,
  `holdSessions`. `ui/messages`: `legacyEl(ref)`, no `trailerEl`; its
  source takes `ticker`, its intents `renderMarkdown`, `attachHoverCard`,
  `attachRestore`, `onBranch`. `Shell.announcerEl`; `JumpRailSource.activeTab`
  returns a `RailTab` (with `activity`).
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer, at 300 and 1040 px unless stated:
  1. PRD-001.R15 (`turn`): a send shows the head with the ringing mark,
     "Claude", "Working" and a ticking time; "Thinking…" in the head, then
     "Thought for 1s", a click shows and hides the thinking; "Writing" with
     a blinking caret while the reply streams as plain text, then rendered
     Markdown (heading, list, a table that scrolls inside itself at 300 px,
     a code block); the Read card inside the turn; the second reply; the
     head's state and time gone at the end. Footer: Branch, copy, `N.Ns ·
     $0.0123` (the second turn again $0.0123, not the running total); below
     360 px icons only, with tooltips; the copy button pastes both replies
     joined by a blank line. A message containing "error" ends in `Error:
     API Error: Overloaded (the fake CLI's error turn)`. A message sent
     during the turn is marked "queued mid-turn" and the turn goes on below
     it; Stop during the turn ends it with a footer.
  2. PRD-005.R7, R32 (M1 at 300, 360, 440, 680, 1040 px; M5 in a pop-out
     window): hovering the duration and cost 500 ms shows Input 1.2k,
     Output 340, Cache write 2.0k, Cache read 56.0k and "At API prices;
     plans count usage instead"; a turn of `basic` (no usage) and a
     reopened turn show none; the head ticks in a pop-out window. The tab
     hover card says "Working · Ns" during the turn and the conversation's
     cost after it. The exported note shows each turn's own cost.
  3. M6: Tab reaches the thinking toggle (announced expanded or
     collapsed), Restore files, Branch, copy and the duration and cost,
     whose focus shows the card until blur; with NVDA or VoiceOver,
     `permission`'s card in the active tab announces "Claude is waiting for
     you" and the end of a turn "Claude finished", twice in a row too;
     nothing from a background tab; the error block of `crash` is read as an
     alert.
  4. Errors: a profile with a missing CLI path shows the error block on
     send; `crash` closes the turn, then shows "Claude exited with code
     3" with the stderr lines as an alert, recorded; reopening shows it
     after the closed turn.
  5. Reopen of a conversation with several turns: footers with each turn's
     cost, "Thought process", no ticking head; a 0.5.0 file (turn records
     without a session id) reopens with its costs; Restore files and
     Branch on `rewind`'s turns as before (036's row 7).
  6. M8: a DevTools profile of `turn` streaming in one tab while typing in
     another: each delta one text-node append and no layout read, echo
     within 50 ms (p95), no frame over 100 ms; the rail re-reads after the
     text block ends, not per delta.
  7. DES-002's rows after the move: settings closed during a turn restart
     its CLI after the turn; turning Bypass off moves a tab in Bypass to
     Ask; a model refused by the CLI rolls back with its Notice; a
     reopened conversation whose session cannot resume says so and
     starts afresh.
- Owed, not done: the real-CLI run (one human session, approved by the
  owner beforehand: metered use, constitution), recorded sanitized in
  `docs/records/verification/`: a turn with thinking, a streamed reply, a
  tool call, a message sent mid-turn and an interrupt, checked against the
  `turn` scenario's shape and the 030 interrupt shape.

- Review fixes, in a second commit on e23ed18 (038 builds on it), tests
  first where pure (`state-tab` failed: no `unclosed`; `state-turn` failed:
  no `turnEndRecord`):
  - G1: a turn with no record of its end (the CLI exiting, a failed send,
    the tab or the view closing mid-turn) followed by a prompt reopened as
    one turn, the prompt marked "queued mid-turn". A turn that ends without
    a `result` now records `meta` holding only `turn` (`turnEndRecord`),
    which closes it on reopen and exports nothing; a reopened file that left
    its last turn open (`StoredModel.unclosed`) records it before the next
    prompt, while the tab still holds that conversation. Files written
    before keep the reopen rule. DES-003, DES-005 and DES-002 say so.
  - N1: Restore files and Branch are named by their labels
    (`aria-labelledby`) and described by their tooltips.
  - N2: the duration and cost take focus only with a hover card.
  - N3: DES-007's turn cost says the turns add up to the conversation's
    cost only while no total drops.
  - N4: a thinking toggle keeps its label element instead of a query and
    `instanceof`.
  - Self-check re-run: an exit mid-stream records `{ kind: "meta", turn }`
    after the partial reply and before the session's error; the footer
    buttons' names are their labels; a reopened turn's figures take no
    focus; the earlier results unchanged.

## Independent review

- Reviewer: a session other than the implementer's, in a headless-Chromium
  harness running the real `ChatTab`, `ui/turn` and `ui/announcer` fed the
  `turn` scenario's stream; the session code's move into
  `tab/session-link` checked function by function against the removed
  `view` code. No defects.
- Findings: G1 (a turn without a record reopening merged with the next
  prompt), N1 (footer buttons named by their tooltips), N2 (focusable
  figures with no card), N3 (DES-007's sum claim), N4 (`instanceof` in the
  thinking label). All fixed in "wip: task 037 review fixes" (Run log).
- The Run log's other departures were agreed; three changed here: a turn
  ending without a record (G1), the footer buttons' names (N1), the
  figures' focus (N2).
- Codex not obtained: unavailable (spend cap).

## Outcome

Accepted after the review fixes. Owed to the owner:

- Confirm the protected-path edit to `tests/architecture.test.mjs`: the
  allowlist emptied (its last row, `view` U3) and P2 checked; tightening
  only.
- The real-CLI run, approved beforehand (metered use): a turn with
  thinking, a streamed reply, a tool call, a message sent mid-turn and an
  interrupt, against the `turn` scenario's shape and the 030 interrupt
  shape, recorded sanitized in `docs/records/verification/`.
- Manual rows 1 to 7 of the Run log, run and recorded by someone other than
  the implementer.
