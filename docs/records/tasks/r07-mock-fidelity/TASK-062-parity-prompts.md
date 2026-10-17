---
status: closed
release: r07-mock-fidelity
number: 062
prd: PRD-001.R12, PRD-001.R33, PRD-001.R35
---

# TASK-062 — Prompts, pinned prompt, empty state and thread width match the boards

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Parity survey IDs TR1-TR8, CE1, CE3-CE7 against the "Redesign dark" and
"Redesign light" boards.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R12, R33, R35 (reworded by change 009);
[DES-003](../../../current/design/DES-003-panel-ui.md) Prompts, Empty
conversation, Token contract; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md).

Acceptance:

1. The pinned prompt (Quiet, Pop-out) is the whole prompt: head with number,
   You, time and context, then the text on one line; height 66, padding
   9 12 11, weight 400, on a panel-background band 8 px above and below. The
   button's accessible name is unchanged ("Scroll to prompt", number, text).
2. The pinned Bubble prompt is 41 px high with the bubble's 14 14 4 14 corner.
3. Prompt and bubble text have line height 1.55.
4. A prompt's context line has a 12 px icon (file for a note, folder for a
   folder alone, none otherwise) and, with a selection, "N lines selected"
   after the note; the numbered head and the pin read "N lines", the line
   under a bubble "N lines selected".
5. A bare slash prompt (`/compact`) is drawn as the compact monospace command
   bubble; it keeps its number, pin and rail tick, and in Quiet and Pop-out
   shows its number badge beside the bubble.
6. Empty state: heading line height 30, margin 18 0 6; line at most 300 px
   wide with the board's copy; first starter "Summarize <file name with
   extension>"; second "Find notes that should link here"; chevron 12 px;
   starters 340 px wide.
7. The thread and the composer area are at most 740 px wide, centred, with or
   without the conversation column.

## Scope

Expected files: `src/ui/prompt.ts`, `src/ui/empty-state.ts`,
`src/state/prompts.ts`, `src/context-format.ts`, `styles.css`,
`tests/state-prompts.test.mjs`, `tests/context-format.test.mjs`; docs: DES-003,
PRD-001 R12, R33 and R35 through change 009, `README.md`, `RELEASE_NOTES.md`.

Negative scope: `PinObserver`, the rail, prompt fills and colors, the list
column default (CE2), turns, steps and replies (061), tabs, cards, popovers.
No dependency, no protected path.

## Plan

Tests first (`isCommandBubble`, `contextName` selection count, starters,
`splitSelection`, `contextIcon`), then the pin DOM (band, head, text), CSS,
copy, docs, harness pairs.

## Run log

- Tests first: the new `PRD-001.R33` / `PRD-001.R35` tests fail on the old
  code (missing export, old copy and label).
- Choices for review:
  - The selection count lives in `contextName`, so it is stored with the
    message and shows in the pin, the prompt and the transcript export.
  - `/compact` stays a numbered `prompt` (numbering, pin and rail unchanged);
    only its look changes. Any text sent bare (starting "/") gets the look.
  - The pin head's You, time and context are `aria-hidden`, so the name is as before.
  - New token `--ai-agent-panel-line-height-prompt` (1.55), also used by the
    empty-state line (board 20.15 px at 13 px).
  - The starter tile icon is also 12 px (board value; same rule as the chevron).
  - CE1: no 820 container rule: the main column of a 1040 pane with the list
    is 770 wide, so a plain `max-inline-size: 740px` gives the board's result.
- Review round:
  - The numbered bare command shows its badge (`has-number`); the head's
    other parts stay visually hidden.
  - `.ai-agent-panel-empty` takes `inline-size: 100%`; measured starters 340
    at 440 and 680, 268 at 300 (pane less padding); the line caps at 300.
  - Change 009 added; PRD-001 R12, R33, R35 edited to match; R35 states the
    link starter in words that pass `check_prd.py`, DES-003 holds the label.
  - `splitSelection` gives the head form ("6 lines"); the stored label is
    unchanged; "selected" shows only under a bubble (CSS).
  - `contextIcon`: file for a note, folder for a folder alone, none for
    "links & properties" and "N attached". The note icon stays the board's
    `file` glyph, not the chip's `file-text`.
  - The composer area is capped at 740 px and centred. Measured (list and
    composer area): 1040 top tabs 740 at x 850; 1040 with the column 740;
    820 740; 680 full width.
  - Stuck pairs in dark and light for Pop-out, Quiet and Bubble
    (`harness/hunt-062/final/stuck-*`): board 66/66/41, panel 66/66/41, both
    themes. An earlier note that the PromptStyle boards ignore light was wrong:
    the `Light` boards exist.
  - Nits: the heading takes `--ai-agent-panel-line-height`; README lists bare
    slash commands.
- Other harness evidence (`harness/hunt-062/final/`): `empty-*`, `thread-*`,
  `compact-*` in dark and light.
- `make verify`: `scratchpad/verify-062.log`.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

1. `/compact` numbering invisible in Quiet and Pop-out: the badge now shows;
   DES-003 and PRD-001.R33 reworded.
2. The empty state's starters narrowed to their content: fixed with
   `inline-size: 100%`.
3. No change record for the PRD wording: change 009 added.
4. Head and pin should read "N lines": `splitSelection`, tested.
5. The composer was not lined up with the thread without the column: capped at 740 px.
6. Evidence and a wrong claim about the light boards: pairs added, record fixed.

Nits (heading line-height token, icon for a note or folder only, README): done.

## Outcome

Accepted.
