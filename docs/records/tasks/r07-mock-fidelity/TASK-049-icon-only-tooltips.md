---
status: closed
release: r07-mock-fidelity
number: 049
prd: PRD-001.R32, PRD-001.R28
---

# TASK-049 — Tooltips on icon-only controls only

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Fix (class S). Obsidian 1.14.4 shows a text tooltip on pointer-over of any
element with an `aria-label` (one delegated listener on `body`), and
`setTooltip` sets `aria-label`. The panel named its composer, tab strip,
column, messages and other containers with `aria-label`, and set tooltips on
controls with visible text, so "Message Claude" covered the composer and
"Conversations" covered the tab strip and a tab's hover card.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R32 (tooltips on icon-only controls), R28 (accessible names), R22 (the
model segment's full-id tooltip);
[PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R8 (the permission segment's hover text), R18 ("Restore to before turn N"'s
title); [DES-003](../../../current/design/DES-003-panel-ui.md) Popovers,
hover cards and tooltips, Keyboard and accessibility;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) (`ui/dom`
helpers, layer rules).

Acceptance:

1. Only icon-only controls, graphics without text (role `img`, a prompt's
   image thumbnail), and the three tooltips R22, PRD-002.R8 and R18 name
   carry an `aria-label` or a tooltip; hovering the composer, the tab strip,
   the column, the messages, a chip, "+N", the changes chip or a recent row
   shows none. Transcript, a turn's Restore files and Branch, and the effort
   and profile segments show their label as a tooltip only while icon-only
   (`--no-tooltip`).
2. Every renamed element keeps its accessible name (task 042's harness
   record): textarea "Message Claude", `tablist` and `nav` "Conversations",
   input "Filter conversations by title", `region` "Messages", `nav` "Jump to
   a prompt", `group` "Background tasks", "Conversation status" and "Shell:
   <command>", `separator` "Resize the conversation list", each popover
   `radiogroup`'s label, a reopened report's `region` "<title>", a report
   table's "Actions" header, a `/help` row's "Put /<name> in the message",
   "+N"'s "Show hidden context (N)".
3. Text a dropped tooltip added stays for assistive tech: a recent row is
   described by "Last active <time>", the changes chip by "Show the files
   this conversation changed", Transcript by "Open the exported note"; a
   chip's name already holds its tooltip text, and Restore files and Branch
   keep their descriptions.
4. `tests/tooltips.test.mjs` fails on any `aria-label`, `ariaLabel` or
   `setTooltip`/`writeTooltip` call in `src/` that is not in its commented
   per-file list, or on a missing or extra `--no-tooltip` rule in
   `styles.css`; its self-tests catch planted ones.

## Scope

Expected files:

- New: `tests/tooltips.test.mjs`.
- Changed: `src/ui/dom.ts` (`hiddenText`; the radio group's name),
  `src/ui/composer.ts`, `src/ui/tab-strip.ts`, `src/ui/conversation-column.ts`,
  `src/ui/messages.ts`, `src/ui/run-bar.ts`, `src/ui/shell-card.ts`,
  `src/ui/shell.ts`, `src/ui/status-line.ts`, `src/ui/jump-rail.ts`,
  `src/ui/changes-bar.ts`, `src/ui/turn.ts`, `src/ui/prompt.ts`,
  `src/ui/copy.ts`, `src/ui/popovers/changed-files.ts` (comment),
  `src/report-view.ts`; `styles.css` (`--no-tooltip`);
  `docs/current/design/DES-003-panel-ui.md`,
  `docs/current/DEVELOPMENT.md` (spec row), `RELEASE_NOTES.md`.

Negative scope:

- No "Show tooltips" setting, no restyling, no hover-card or z-index logic
  (046), no status bar (047), no icon drawing (048).
- No PRD wording change; no state-module change (`SegmentView.tooltip` and
  `ChipView.tooltip` keep their names).
- No protected path; `tests/architecture.test.mjs` and `tests/styles.test.mjs`
  untouched; no new dependency.

## Plan

- Tests first: `tests/tooltips.test.mjs` parses every `src/**/*.ts` with
  TypeScript's parser (as `architecture.test.mjs` does), counts per file the
  `"aria-label"` strings, `.ariaLabel` accesses and `setTooltip` /
  `writeTooltip` calls, and compares them with a
  commented per-file allowlist; a planted source checks the scan, including
  that `aria-labelledby` and comments are no sites.
- `ui/dom` gains `hiddenText(el, relation, text, host)`: a visually hidden,
  `aria-hidden` span that `aria-labelledby` or `aria-describedby` points at.
  Containers use it; where a component syncs its element's children (run
  bar, rail) the span is kept first in the list; the tab strip's sits in the
  strip root. Text fields get a visually hidden `<label for>`. A button with
  visible text is named by its content (the `/help` insert button, the
  report's "Actions" header) or `aria-labelledby` ("+N").
- `report-view` (layer 3, no `ui/dom`) names a reopened card by a hidden
  title span under the id the header title uses; its icon buttons and dot
  stay on the list.
- A control icon-only only at some sizes keeps its tooltip and takes
  `--no-tooltip: true`, reset to `initial` by the rules that hide its text.
- Verification: `make verify`; the harness facts below.
- Rejected: `--no-tooltip: true` on every named container (keeps the
  `aria-label`s, and leaves the scan unable to tell a deliberate tooltip
  from an accidental one); a `title` attribute (the browser's own tooltip).

## Run log

- The worktree started at main (a29533d); fast-forwarded to
  `chore/agentic-sdlc` (2cebf76), then to b6b710b mid-task (tasks 047 and
  048), re-applying the edits from a tagged stash.
- Tests first: the scan failed, listing every site of the source map; the
  planted-source test passed from the start.
- Requirement conflict with the brief: PRD-001.R22 asks for the model
  segment's full-id tooltip, PRD-002.R8 for the permission segment's hover
  text, PRD-002.R18 for "Restore to before turn N"'s title. Those three keep
  their tooltips (allowlisted with the requirement), for the owner to keep or
  drop by changing those requirements.
- Redundant `aria-label` attributes beside `setTooltip` (`iconButton`, run
  bar Stop, copy, Send, a chip's remove, the report's icon buttons) removed:
  `setTooltip` sets the same label.
- Harness facts (owed to the orchestrator's headless run):
  - `aria-label` (from a tooltip or on an image): header, composer and
    column `iconButton`s; tab close "Close <title>"; column row pin
    "Pin"/"Unpin" and close; run-bar Stop; copy buttons; rail ticks
    "N · <first line>"; Send/"Queue message"; an attached item's remove
    "Remove <name>"; report icon buttons; step and agent marks; tab glyph
    "Waiting for you"; report status dots; the context bar "Context window:
    N% used"; `.ai-agent-panel-prompt-image` (its file name); every menu
    segment of the status line; "Restore to before turn N";
    `.ai-agent-panel-turn-action` ("Restore files", "Branch");
    `.ai-agent-panel-changes-transcript` ("Transcript"). The last five keep
    their `aria-labelledby` name.
  - No `aria-label` on: the composer textarea, `.ai-agent-panel-tab-strip-list`,
    `.ai-agent-panel-conversation-column`, the column filter input,
    `.ai-agent-panel-messages`, `.ai-agent-panel-rail`,
    `.ai-agent-panel-run-bar`, `.ai-agent-panel-shell-card`,
    `.ai-agent-panel-status-line`, `.ai-agent-panel-column-handle`, each
    `.ai-agent-panel-radio-group`, `.ai-agent-panel-report-card`, report
    `th`s, `.ai-agent-panel-report-insert`, `.ai-agent-panel-composer-chips-more`,
    `.ai-agent-panel-composer-chip-main`, `.ai-agent-panel-changes-chip`,
    `.ai-agent-panel-column-row-main`.
  - Computed `--no-tooltip` is `true` on the effort and profile segments at
    fit step 0 from 360 px, on `.ai-agent-panel-turn-action` from 360 px,
    and on Transcript on the bar; empty for the profile segment at
    `is-fit-1`+, effort at `is-fit-2`+, both and the turn actions below
    360 px, and Transcript in the header row (`is-column` or 640 px tall or
    less).
  - Accessible names unchanged (acceptance 2); descriptions as acceptance 3.
  - Pointer over the composer textarea and the tab strip for 1 s:
    no `.tooltip` element in the document; over the effort segment at fit
    step 0, none; at `is-fit-2`, one reading "Reasoning effort: <short>".

## Independent review

Reviewer: independent review agent (not the implementer); `make verify` exit
0; names, the scan, the citations and the descriptions confirmed. Verdict:
approve with changes.

1. Major (PRD-001.R32): controls icon-only only at some sizes (effort and
   profile segments at their fit steps and below 360 px, Restore files and
   Branch below 360 px, Transcript in the header row) lost their tooltip.
   Fixed: each keeps its label as a tooltip, with `--no-tooltip: true` on
   the element and `initial` in the rules that hide its text; the test
   asserts those rules.
2. Minor: the scan skipped `src/ui/dom.ts`. Fixed: it is a counted entry.
3. Minor: per-file counts can mask a new site when another in the same file
   goes at once. Fixed: stated in the test's header.
4. Minor: a prompt's image thumbnail is a graphic without text. Fixed: its
   file-name tooltip is back.
5. Nits: `iconButton` dropped its redundant `aria-label`; `hiddenText`'s doc
   says a hover-card element takes no `aria-describedby` from it.

Rendering checks run later by the orchestrator in a headless harness, not by
the implementer.

## Outcome

Accepted. For the owner's decision list: sighted users no longer see the
full name of a truncated composer chip or a truncated recent-row title
(those tooltips were dropped; screen readers still hear both). Nothing moves
into an automated gate beyond `tests/tooltips.test.mjs`: the DOM side has no
harness (DES-003, Context and constraints); the harness facts are in the Run
log.
