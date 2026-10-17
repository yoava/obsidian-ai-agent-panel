---
status: closed
release: r06-panel-redesign
number: 030
prd: PRD-001.R11, PRD-001.R13, PRD-001.R14
---

# TASK-030 — Walking skeleton

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 0 and ADR-016 Migration step 1: a reachable shell, header,
composer and status line on the `state/`, `tab/`, `ui/` split, mounting
today's tab strip or column, per-tab messages and cards unchanged, so every
later slice replaces one region inside a working panel (constitution: walking
skeleton first; owner D1).

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R11, R13, R14;
[DES-003](../../../current/design/DES-003-panel-ui.md) Layout model, Modules,
Events (rows "from slice 0"), Composer state, Composer, Status line (segments
and labels only), Token contract, Architecture rules, Build order;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) Modules, State
and updates, Lifecycle, Boundaries;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Tokens,
Naming, Container queries, Migration from `styles.css`, Validation.

Acceptance, in a desktop vault against `tests/fake-cli.mjs`, panel 300 px and
1040 px wide, "Conversation tabs" Automatic:

1. Shell: the root is `.ai-agent-panel.ai-agent-panel-scope`, container
   `ai-agent-panel` (size, height 100%); `.ai-agent-panel-main` is container
   `ai-agent-panel-main` (inline-size) and holds the top region, the messages
   host, the composer area, the layer and the announcer of DES-003's layout
   model; today's strip or column sits in the header's nav area or the
   column slot, today's messages elements in the messages host. No
   horizontal scroll bar on the panel at either width.
2. Send (`basic`): Enter outside IME composition sends; Shift+Enter inserts a
   newline; no text and no images sends nothing; the reply `echo: <text>`
   is drawn by today's renderer in the active tab and scrolled into view.
3. Composer state per DES-003's table: PRD-001.R35's, R11's and R7's
   placeholders; "Send" or "Queue message"; Stop shown only while a turn
   runs, tooltip "Stop Claude's turn (Esc)"; Send dimmed and still sending
   while a card waits; the textarea monospace while its text starts with
   `/`.
4. Stop: while a turn runs, Stop, or Escape in the composer outside IME
   composition with no suggest open, sends `interrupt` and no `stop_task`;
   the fake CLI ends the turn and the composer returns to idle. A message
   sent while a turn runs reaches the CLI without a context block and is
   marked "queued mid-turn".
5. One permission (`permission`): today's card shows; today's tab indicator
   shows the waiting state (`activity` is waiting); the placeholder reads
   "Claude is waiting for your answer above…"; Allow and Deny each settle the
   card and end the turn.
6. Status line under the composer: model, effort, permission, profile (only
   with several profiles), context, and plan usage (only while "Show plan
   usage" is on), in that order, each a button named per DES-003's table
   ("Model: <label>", "Reasoning effort: <short string>", "Permissions:
   <long string without ⚠>", "CLI profile: <name>"), opening today's model,
   effort, mode or profile menu, or the usage dialog. Effort and mode show
   the short strings of PRD-001.R23's effort table and PRD-002.R8's mode
   table, the long ones from a 560 px main column; Auto-approve and Bypass
   are red. The context segment draws today's meter and tooltip until 033.
7. PRD-001.R13 and R14 behave as today through `ui/composer`: the attach
   picker, the file menu's "Add to agent chat", a file chip opening its file,
   `@` mentions, "Add selection to chat"; image paste and drop, mixed
   payloads, non-images only, and the "Not attached:" Notice.
8. Switching tabs moves the composer and status line to the incoming tab's
   draft, chips, images, model, effort, mode and profile.
9. A change to "Show plan usage" or "Conversation tabs" reaches an open panel
   at once through the plugin's `settings` event.
10. Today's header model status, composer control row, footer context meter
    and usage strip are gone, with their `view.ts` code and CSS; no region is
    drawn twice.
11. `tests/architecture.test.mjs` checks U1, U2, U4, U6, U7, P4, P5, P6 and
    the DES-001 A-rules it covers, and U3, U5 except `themeModal`, and P3
    with DES-003's five allowlist entries; `tests/styles.test.mjs` checks
    every rule above the legacy tail; both run in `make verify`.

## Scope

Expected files:

- New: `src/state/tab.ts` (activity, composer and status data),
  `src/state/composer.ts`, `src/state/status-line.ts` (segment labels,
  DES-004's mode display rule); `src/tab/chat-tab.ts`; `src/ui/shell.ts`,
  `src/ui/header.ts`, `src/ui/composer.ts`, `src/ui/status-line.ts`,
  `src/ui/dom.ts`.
- Changed: `src/view.ts`, `src/main.ts` (the `settings` event),
  `src/models.ts` (effort table), `src/settings-core.ts` (mode table),
  `src/suggest.ts` (`AddContextModal` moves in, DES-003 Modules),
  `styles.css` (token block and new sections above a legacy tail),
  `package.json` (`pretest` gains the three state modules; ask-first path),
  `tests/fake-cli.mjs` (an interrupt ends a running turn).
- Tests: `tests/state-tab.test.mjs`, `tests/state-composer.test.mjs`,
  `tests/state-status-line.test.mjs`, `tests/architecture.test.mjs`,
  `tests/styles.test.mjs`; additions to `tests/models.test.mjs`,
  `tests/settings-core.test.mjs`, `tests/protocol.test.mjs`.
- Docs: DES-001 (view jobs and runtime wiring: status line, profile segment,
  `settings` event); DES-007 (the strip and meter as status-line segments);
  `README.md` (control row, context meter and usage strip bullets);
  `docs/current/DEVELOPMENT.md` (spec rows; running the panel against the
  fake CLI; the interrupt behavior); `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record of the manual rows.

Negative scope:

- Theme (031); popovers, `fitStep` and the status-line steps (032); context
  and plan-usage hover cards and popovers (033); tabs, column, switcher,
  ticker, column resize (034); messages model, prompts, Markdown, copy and
  links (035); title block, "More", changes bar (036); stream, turn, session
  link and the send path's move into `tab/chat-tab` (037); cards (038);
  steps, agents, run bar (039; today's background-task strip stays mounted);
  reports, slash groups, shell card (040); context block, short height
  (041).
- Behavior beyond R11's strings and the removed surfaces. `handleSend`,
  `ensureSession`, the stream handlers and the menus stay in `view`.
- A DOM test harness; no new dependency (constitution).
- Protected paths: `tests/architecture.test.mjs` and `tests/styles.test.mjs`
  become architecture-policy files added by accepted ADRs (constitution).
  Creating them, and later edits that only add a rule or remove an
  allowlist row, proceed under the owner's instruction of 2026-10-11 to
  build the whole redesign, each recorded in the Run log for the owner to
  confirm; an edit that loosens a rule stops for the owner. No other
  protected path.
- No real-CLI run.

## Plan

- Tests first, failing before the modules exist, names starting with the
  requirement ID: `state/tab`'s `activity` first-match table; the composer
  state table and the Escape action; segment labels, the profile segment only
  with several profiles, the mode display rule; the effort table (other
  levels: their name, and "effort"); the mode table (short, long, hover text,
  warning). The architecture and styles tests are first run against a seeded
  violation of each rule (`window` in a state module, a second importer of a
  `ui/` module, a color literal above the tail) and must fail on it.
- `tab/chat-tab` owns, in `state/tab` data, the fields of today's `ChatTab`
  that activity, composer and status read: busy, pending cards, open text
  block, draft, chips and attached items, images, model, effort, mode,
  profile, status text. The fields leave `ChatTab`, so the compiler finds
  every write; each write goes through a `chat-tab` setter that fires
  `activity`, `composer`, `status`, `card` or `turn`. `view` fires `tabs`
  and `active`; `main` fires `settings` where it loops over
  `onViewSettingsChanged` and `onUsageSettingsChanged` today.
- Components are `Component` children of the view, built from (parent,
  source, intents); intents reach today's code: `onSend` `handleSend`,
  `onStop` `session.interrupt`, `onPickModel` `openModelMenu`, and so on.
- Moves out of `view.ts`: `onOpen`'s header, composer, footer and control-row
  construction; `createSegment`, `renderChips`, `attachImages`,
  `openAddContext`, `openCommandList`, `updateComposerBusy`,
  `updateConfigBar`, the segment writes of `refreshModelLabels`,
  `renderContextMeter`, `renderUsageBar`; `MODE_LABELS` and
  `CLI_ONLY_MODES` (to `settings-core`); the placeholders (to
  `state/composer`); `AddContextModal` (to `suggest`).
- Fake CLI: on `interrupt` while a turn runs it withdraws the pending
  `can_use_tool` (`control_cancel_request`) and ends the turn with a
  `result`. Without it Stop cannot be checked: `basic` ends at once and
  `permission` never ends. The shape follows today's handling
  (`handlePermissionCancelled`, `handleResult`); 037's real-CLI run compares
  it with the CLI's.
- CSS: today's rules move under a legacy-tail marker; above it, the token
  block (DES-003 Token contract) and the shell, header, composer and status
  line sections, tokens only; the legacy rules of the removed surfaces are
  deleted; no legacy rule is converted (ADR-017).
- Architecture test per ADR-016 Boundaries: esbuild's metafile of
  `src/main.ts` and TypeScript's checker, both dev dependencies already; the
  allowlist is DES-003's five rows, each naming the slice that removes it.
- Verification: `make verify`; manual, by someone other than the
  implementer: PRD-001.R11's rows (`basic`, `permission`: Enter, Shift+Enter,
  IME, a message queued mid-turn, Stop, Escape), R13's and R14's rows, all
  at 300 and 1040 px (M1 subset). Codex cross-review of the event and
  component contracts before commit, since every later slice builds on them.
- Risks: legacy code writing a moved field directly leaves a component stale
  (the compiler catches it once the field leaves `ChatTab`); keystroke echo
  over 50 ms (PRD-001.R29) if the input handler recomputes view-models (it
  writes only the textarea's state); the checker slowing `npm test` (probe
  0.9 s).
- Rejected: messages model first (ADR-016: decomposition first leaves no
  verifiable step); keeping the control row and adding the status line beside
  it (a region drawn twice); a slowly streaming scenario to press Stop in
  (Stop races the turn's end; deltas are 037's `turn` scenario).

## Run log

- Tests first: `state-tab`, `state-composer`, `state-status-line`,
  `models` and `settings-core` failed on import (no `activity`,
  `composerView`, `SEGMENT_ORDER`, `effortEntry`, `MODE_TABLE`); the
  protocol interrupt test timed out (the fake CLI ignored `interrupt`); the
  architecture test missed the stub state modules in the bundle graph; the
  styles test found no legacy-tail marker.
- Seeded violations, each failing its test: `window.innerWidth` in
  `src/state/tab.ts` (U1, naming `window` and `innerWidth`); `settings.ts`
  importing `ui/header` (P5, "exactly one importer (settings, view)");
  `color: #ff0000` above the tail (styles). Both tests also keep self-tests
  that seed every graph rule and every CSS rule.
- Protected paths: `tests/architecture.test.mjs` and `tests/styles.test.mjs`
  created under the owner's instruction of 2026-10-11, for the owner to
  confirm. Ask-first `package.json`: `pretest` gains the three state
  modules.
- Choices the accepted docs leave open, for review:
  - Header: today's "AI Agent Panel" title goes (DES-003's header has
    none); today's transcript and changes links sit in the top grid's bar
    row until 036; "+" stays in today's strip toolbar until 034.
  - Status line: Obsidian shows a control's `aria-label` as its tooltip, so
    segments are named through `aria-labelledby` (a visually hidden label)
    and keep DES-003's tooltips; the four menu segments say
    `aria-haspopup="menu"` while they open Obsidian menus (032); the context
    segment is not a button until 033; the line wraps until 032's steps.
  - A model pick clears the reported model id, so the segment shows the pick
    until the CLI reports again.
  - Usage totals and the conversation cost are `chat-tab` status data (the
    `status` event covers "context or usage totals").
  - `main` fires `settings` from one `applyPanelSettings` (replacing
    `applyViewSettings` and `applyUsageSettings`) and from the three
    `remember*` calls (replacing `view.refreshModelLabels`).
  - `SlashCommandSuggest` reads the plugin's command list through a getter;
    the view's `setCommands` pushes reached one view only.
  - `ui/composer` exposes `text`, `append`, `focus` and `contextChanged` to
    the view: the draft is stored at a switch, and the active note or folder
    reaches the chips until `context-builder` (041).
  - The fake CLI ends an interrupted turn with an ordinary success `result`,
    and runs a message sent mid-turn as the next turn; 037's real-CLI run
    compares both with the CLI's.
  - No `docs/records/verification/` record: records are write-once, and the
    rows are run by someone other than the implementer, who records them.
- Codex cross-review of the event and component contracts (diff 81f814b..d3dfde1).
  Fixed: a sent text's clearing raced a tab switch (`/clear` left
  "/clear" as the old tab's draft; text typed during a CLI start was
  erased) - the view now clears what the send path took, where it still
  is (`takeText`); images and the attach picker's pick reached the tab
  active when they finished, not the one they began in - intents name the
  tab; `ChatTab` exposed mutable arrays and fired `turn` and `card` before
  updating its activity; `tabs` did not fire per recorded prompt; Escape
  read "turn running" from the activity; a profile rename did not reach
  the status line; an allowlist row excused any number of uses (rows now
  carry a count); the symbol rules had no self-test (a temporary fixture
  tree now seeds each). Kept: events typed only through `Follower`'s event
  names, not a typed event map.
- Independent review (coordinator): no runtime defect; departures accepted.
  Fixed after it, tests first where testable: the fake CLI queued a
  mid-turn message instead of running a parallel turn (protocol test); the
  session now says how a turn ended (`onBusyChanged(busy, ended)`, session
  test), so the view no longer infers it; the architecture test flags any
  runtime import of Electron (U6), reads P4 geometry only from DOM
  declarations and links its fixture with a junction; the styles test reads
  one exact marker line, allows `!important` only in ADR-017's fence rule
  and allows only the panel's variables and Obsidian's `--size-*`,
  `--radius-*`, `--font-ui-*` and `--font-monospace` outside the token
  block; the header's legacy links moved to the grid's bar row; one
  `iconButton` in `ui/dom` with the commands icon's fallback names; one
  `status` event per result; a profile rename announced once typing
  pauses; docs that named the old fields and calls; Windows route for the
  fake CLI in DEVELOPMENT.md.
- Merged onto `main` at 784e020 (tasks 018 to 020, 027, 043 to 045):
  the four wip commits applied as one cherry-pick. Resolved: `pretest`
  keeps `main`'s list plus the three state modules; the fake CLI keeps
  043's slow-stop hooks and answers `stop_task` beside this task's
  interrupt and queue; `applyModel` keeps 043's dropped-pick return on the
  new tab record; `restoreInert` is `main`'s; the test table, the DES-001
  PRD-005 row and `session.test.mjs` keep both sides. `onBusyChanged(busy,
  ended)` sits on 043's `setBusy` (the owed restart before the callback;
  stale clients' results and closes never reach it), and the replacement
  that fails to start now ends its waiting turns as an exit. The
  architecture test gains `json` and `transcript-markdown` in layer 1 and
  `protocol/* -> json` under A5, as DES-001 now states.
- Round 2 review: the styles test now applies ADR-017's rule as written -
  outside the token block no Obsidian color variable (nor channel
  variable), any other Obsidian variable allowed; `ClaudeSession.setBusy`
  takes a reason whenever it ends a turn (overloads).
- Owner decisions:
  - Gap A: a card can wait with no turn running (a background agent's
    request), and the composer then shows Stop and "Queue message", which
    do nothing for it. Recommendation: show Stop and "Queue message" only
    while a turn runs; that needs DES-003's Composer-state table and
    PRD-001.R11's wording amended.
  - Protected paths: add `tests/architecture.test.mjs` and
    `tests/styles.test.mjs` to `scripts/check_protected_paths.py`
    (constitution: architecture-policy files added by accepted ADRs).
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), each at 300 px
  and 1040 px wide with "Conversation tabs" Automatic:
  1. Shell: no horizontal scroll bar; the strip in the header at 300 px, the
     column at 1040 px; DevTools shows `.ai-agent-panel.ai-agent-panel-scope`
     as a size container and `.ai-agent-panel-main` as an inline-size one.
  2. `basic`: Enter sends and the `echo:` reply is drawn and scrolled into
     view; Shift+Enter inserts a newline; Enter during IME composition does
     not send; Enter with no text and no image sends nothing.
  3. Composer state: a new tab's placeholder is PRD-001.R35's; after a reply
     "Reply, or @ to mention a note…"; text starting with `/` is
     monospace.
  4. `permission`: the card shows; the tab's dot is steady; the placeholder
     reads "Claude is waiting for your answer above…"; Send reads "Queue
     message", looks dimmed and still sends, the message marked "queued
     mid-turn"; Stop (tooltip "Stop Claude's turn (Esc)") shows. Allow ends
     the turn; on a new turn Deny ends it; on a new turn Stop withdraws the
     card ("Cancelled") and the composer returns to idle; on a new turn Esc
     in the textarea with no list open does the same.
  5. Status line: model, effort, permission, profile (only after adding a
     second profile), context (after the first turn) and plan usage (only
     while "Show plan usage" is on), in that order; a screen reader names
     each ("Model: …", "Reasoning effort: …", "Permissions: …", "CLI
     profile: …"); effort and permission show short strings at 300 px and
     long ones at 1040 px; Auto-approve and Bypass are red; each segment
     opens today's menu, plan usage the usage dialog.
  6. PRD-001.R13: the attach picker adds a chip; "Add to agent chat" from the
     file menu adds one; a file chip opens its file and its x removes it;
     `@` offers notes and inserts `@<path>`; "Add selection to chat" appends
     the selection after a blank line.
  7. PRD-001.R14: a pasted image and a dropped image each get a thumbnail
     chip that a click removes; an image dropped with a PDF names the PDF in
     "Not attached:"; a PDF alone is left to Obsidian; a ninth image is
     refused in the Notice.
  8. Switching tabs brings the incoming tab's draft, chips, images and
     segments.
  9. "Show plan usage" and "Conversation tabs" reach the open panel at once.
  10. Gone: the header's model id, the control row, the footer meter and the
      usage strip.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed;
seeded violations of every architecture and styles rule failed. No runtime
Defect; every call site of the old view has a new home. Gaps fixed: the
fake CLI ran a mid-turn message as a parallel turn; the fake-CLI run had no
Windows route; Electron's `net` slipped past U6; seven stale doc lines; the
header's links squeezed the strip at 300 px. Nits fixed: P4 needs a DOM
declaration, the styles checks closed three loopholes, the junction
fixture, the icon fallback, the turn-end reason from the call site, one
icon-button helper, one `status` event per result, a debounced rename.

Round 2: the same reviewer on the merge onto main; `make verify` passed.
Round-1 findings closed; the merge with tasks 043, 044, 045 and the
rendering series checked line by line. Applied: the styles test follows
ADR-017's colour rule exactly; `setBusy(false)` needs a reason. Left for
the owner: Gap A and the protected-path hook (Outcome).

## Outcome

The panel runs on the redesign's `state/`, `tab/`, `ui/` split: a shell,
header, composer and status line mount today's tab strip, messages and
cards, and the header model status, control row, footer meter and usage
strip are gone. The architecture and styles tests are created (protected
from now on; created under the owner's instruction to build the
redesign). Owner decisions: Gap A, a card waiting with no turn running
(a background agent) shows Stop and "Queue message" that do nothing,
recommended fix in the Run log; add the two test files to
`scripts/check_protected_paths.py`. Owed by hand in a vault: the ten
manual rows in the Run log, at 300 and 1040 px against the fake CLI.
