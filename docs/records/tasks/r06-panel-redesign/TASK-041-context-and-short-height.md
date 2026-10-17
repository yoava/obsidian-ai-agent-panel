---
status: closed
release: r06-panel-redesign
number: 041
prd: PRD-001.R12, PRD-001.R30
---

# TASK-041 — Context and short height

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 11: the context block moves into `context-builder`, the chips
row gains the inline offer chip and the short-height one-line form with
"+N", and PRD-001.R30 lands with its last clauses.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R12, R30 (R13's dedupe and `@` paths);
[DES-003](../../../current/design/DES-003-panel-ui.md) Context block and chips,
Layout model, Popovers, hover cards and tooltips (`ui/popovers/chips`), Data
and security.

Acceptance:

1. The context block is DES-003's, from `context-builder`, omitted when
   empty: active note and selection (8000 characters), active folder,
   properties and links (40 per list, then "... N more"), attached files and
   folders, an attached item equal to an on chip listed once; paths, not
   note bodies. `@` mentions and context paths are stored with the message.
2. Chips: on and attached chips in the accent fill, tooltip "Sent with your
   message · click to leave out"; offer chips outlined with "+" and their
   "Click to attach …" labels; note, folder and "links & properties" toggle;
   a file chip opens its file; its remove button removes it. Chips are a
   keyed list.
3. While the panel is taller than 640 px with no chip on and nothing
   attached, the chips row hides and the active-note offer chip shows after
   the commands button.
4. At most 640 px tall: offer chips hidden; on and attached chips on one line
   after the commands button, those past `fitChips`' count marked
   `is-overflow`; "+N" opens "Hidden context", each chip with its remove or
   turn-off button; one line of composer text.
5. PRD-001.R30 holds end to end: every width rule on the main column and
   height rule on the panel, re-checked on every resize; no horizontal
   scroll bar on the panel or messages from a 300 px main column.

## Scope

Expected files:

- New: `src/context-builder.ts` (layer 3), `src/context-format.ts` (layer 1)
  with `tests/context-format.test.mjs`, `src/ui/popovers/chips.ts`.
- Changed: `src/state/composer.ts` (`fitChips`), `src/ui/composer.ts`
  (keyed chips, inline offer chip, one-line form, the "+N" measure in the
  resize pass), `src/tab/chat-tab.ts` (send path step 7), `src/view.ts`,
  `styles.css`; `tests/state-composer.test.mjs`.
- Docs: DES-001 (`context-builder`'s Components row); `README.md` (note
  context bullet); `docs/current/DEVELOPMENT.md`; `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- What the block contains and when it is sent (PRD-001.R12; bare messages in
  `commands`, `planSend` in `attachments`; unchanged).
- The active-folder chip's reading of the file explorer's DOM (DES-003 Data
  and security; unchanged).
- No new dependency; no protected path; no real-CLI run.

## Plan

- Tests first: `fitChips(available, gap, plusWidth, chipWidths)` with all,
  some and none fitting (`PRD-001.R30`); `commands`' bare messages and
  `attachments`' `planSend` stay green (`PRD-001.R12`).
- Moves out of `view.ts`: `buildContext`, `describeNoteGraph`,
  `describeContext` (the context label), `isRedundantAttachment`,
  `findMentionedPaths`, `stringifyProperty`, the folder-click listener and
  `lastEditorView` to `context-builder`.
- The block's text is built by the Obsidian-free `context-format` (DES-003
  Context block and chips), tested first in `tests/context-format.test.mjs`
  (the 8000-character cut, the 40-entry lists, the dedupe, omission);
  `context-builder` only gathers its inputs from Obsidian.
- Verification: `make verify`; manual, by someone other than the
  implementer: M1 at 440 px and 600 px tall (chip toggles, the inline offer
  chip, the one-line form, "+N"), the context block in the CLI's input, M4,
  and R30's clauses across M1. Codex cross-review before commit: the block
  carries selection text and property values off the machine.
- Risks: a chip replaced between mouse-down and mouse-up (keyed list); chip
  widths re-read on every pass (read on create or relabel, cached by key;
  "+N" once per `css-change`).
- Rejected: hiding chips in TypeScript at a height threshold (DES-003: the
  640 px rule is a container query; `fitChips` runs only while the row's
  computed `flex-wrap` is `nowrap`).

## Run log

- Tests first, against f5db9b7 with an empty `src/context-format.ts`:
  `context-format` and `state-composer` failed on import (no
  `MAX_LIST_ENTRIES`, `CHIP_ON_TOOLTIP`). After the Codex review, three new
  cases failed before their fixes (an unpaired surrogate at the cut, a
  cyclic property value, a 41st property formatted). `commands`' bare
  messages and `attachments`' `planSend` unchanged and green.
- Protected path, under the owner's instruction of 2026-10-11, for the owner
  to confirm: `tests/architecture.test.mjs`'s layer 1 gains
  `context-format` (A3 fails a module without a layer; it is now held to
  layer 1's rules); tightening only. `tests/styles.test.mjs` unchanged.
  Ask-first `package.json`: `pretest` gains `src/context-format.ts`.
- Choices the accepted docs leave open, and departures, for review:
  - Tooltips: DES-003 gave every on or attached chip "Sent with your
    message · click to leave out", but a file chip's click opens it
    (PRD-001.R13). Attached file: "<path> · Sent with your message · click
    to open"; attached folder: "<path>/ · Sent with your message"; an on
    chip is named by its text and the tooltip. DES-003 says so.
  - A chip is a pill holding a button and, for an attached item, a remove
    button (no button inside a button); an attached folder's label is not a
    button, having no click. Chips were not focusable before.
  - Images count as attached for PRD-001.R12's inline offer (canvas Q41),
    lead the row, and are listed by "+N" with "Remove <name>".
  - "+N" is named "Show hidden context (N)"; the popover's rows say
    "Remove <name>" or "Turn off <name>". It stays open and follows the
    hidden chips, focus kept on its row or the one now in its place, without
    scrolling; the last one gone closes it through the host (focus to the
    textarea).
  - In the one-line form chips are capped at 9em, so one fits beside "+N"
    from a 300 px main column; "+N" is monospace and its width is cached by
    its label's length. Stop showing or hiding asks for a pass.
  - Properties are capped at 40 with "… N more" like the link lists
    (DES-003's "40 entries per list"); before, the 41st on were dropped
    silently. DES-003 wrote "... N more"; the block has always sent "…".
  - The selection's cut leaves out whole a surrogate pair it would split; a
    property value JSON cannot write reads `[object Object]` instead of
    failing the send.
  - A vault rename redraws the chips (Codex finding); before, a chip kept
    its old name until the next note switch.
  - Tab order: the chips row is first in the DOM, so in the inline and
    one-line forms it comes before the textarea while drawn after the
    commands button (036's header precedent).
  - No `docs/records/verification/` record, though Scope lists one: the
    rows below are run by someone other than the implementer, who records
    them (030 to 040's practice).
  - For the owner: ADR-016's Modules table names `context-format` as the
    context block's Obsidian-free module (lead-authorized maintenance, at
    the replay below).
  - Residuals: a deleted attached item keeps its chip and its path is
    still sent, as before; a popover placed when it opened is not
    re-placed if the panel narrows while it is open (every popover).
- Self-check in headless Chromium with Obsidian 1.14.4's `app.css` and
  `enhance.js` (040's harness: the real shell, popover host and composer on
  a real `ChatTab`, stub targets): at 440x900 with nothing on, the note
  offer after the commands button, the other offers hidden; note on: the
  row above the textarea, offers outlined; with images and attachments the
  order and names above; at 440x600 the textarea 1lh, offers hidden, chips
  after the commands button with "+4"; the popover's rows, removal by
  keyboard keeping focus, the last removal closing it with focus in the
  textarea; Stop shown refits; a relabelled note chip refits; 300x600 and
  300x900 with no horizontal overflow; after `css-change` two passes, no
  loop; a hidden then shown panel keeps its chips.
- Codex cross-review (f5db9b7..24849f3, correctness framing, read-only,
  repository only), then one follow-up confirming the fixes. Confirmed: the
  block, its order, the paths, the dedupe and `findMentionedPaths` match
  the old code for the same inputs; a queued or bare send reads no
  selection or metadata; no resize loop, hidden chips in the tall layout,
  listener leak, wrong-tab popover action or grid misplacement. Fixed,
  tests first where pure: "+N"'s width was cached across a label change
  (+9 to +10), so it could be clipped (now by label length, monospace;
  Codex confirmed no oscillation); the properties past 40 were formatted
  before the cut, so one could throw or stall; an unpaired high surrogate
  at the cut was dropped; a rename left chips stale. Kept: a deleted
  attached item (residual above; Codex agreed).
- Replayed onto `main` at abfd508 (040 landed as 6d7cf74, 039 as abfd508):
  the net diff f5db9b7..bf874a5 applied with `git apply --3way`.
  Resolved: `view` keeps 039's run bar (today's background-task strip is
  gone) with the context builder made before it, and drops the context
  helpers that 039 left as the file's last functions; `tab/chat-tab` keeps
  039's edit-tracker types and takes `SendContext` from `context-format`;
  `styles.css` is `main`'s with this task's composer section and "Hidden
  context" rules (the composer section was the same on both bases);
  `pretest`, RELEASE_NOTES, DEVELOPMENT.md and `plan.md` keep both sides.
  The Chromium self-check re-run on the replayed tree: the same results.
- API changes for later slices: new `context-format` (`sendContext`,
  `contextBlock`, `contextName`, `contextPaths`, `listedAttachments`,
  `cutSelection`, `stringifyProperty`, `findMentionedPaths`,
  `ContextSources`, `NoteGraph`, `VaultEntry`, `SendContext`, moved from
  `tab/chat-tab`) and `context-builder` (`ContextBuilder` with `targets()`,
  `lastEditorView`, `forSend`); `view` loses `activeTargets`,
  `lastEditorView`, `selectedFolder` and the context helpers.
  `state/composer` gains `CHIP_ON_TOOLTIP`, `composerChips`, `ChipsInput`,
  `ChipsView`, `ChipView`, `ChipSlot`, `fitChips`. `Composer` is a
  `ResizeMeasure`; `ComposerSource` gains `resizePass`, `ComposerIntents`
  `openPopover`; `ui/popovers/chips` (`ChipsPopover`, `HiddenChip`).
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer:
  1. M1 at 440 px wide and 900 px tall, "Include note context" off, a note
     open: no chips row; "+ <note>" outlined after the commands button,
     tooltip "Click to attach the active note"; a click shows the row above
     the textarea with the note chip in the accent (tooltip "Sent with your
     message · click to leave out"), "+ <folder>/" and "+ links &
     properties"; each toggles; turning the note off returns to the inline
     chip. A folder clicked in the file explorer becomes the folder chip;
     opening a note resets it to the note's folder.
  2. Attachments: the paperclip picker, "Add to agent chat" on a file and a
     folder, a pasted image: images first, then the context chips, then the
     attached items; a file chip opens its file, its x removes it; an image
     click removes it; a folder chip has only its x; renaming an attached
     file or the active note renames its chip.
  3. M1 at 440x600 and 300x600: one line of text; no offers; the on and
     attached chips after the commands button, "+N" for the rest; "+N"
     opens "Hidden context" up from it; Remove and Turn off keep it open
     with focus on the next row; the last one closes it and focuses the
     textarea; during `basic`'s turn (Stop shown) the line refits; dragging
     the panel's height across 640 px switches forms with nothing left
     hidden; no horizontal scroll bar at 300 px.
  4. The context block as the CLI receives it (`basic` echoes it): note
     chip on with a selection over 8000 characters (cut at 8000) and one
     whose 8000th character starts an emoji (the emoji left out whole);
     folder chip on; links & properties on a note with more than 40
     properties and links ("… N more"); the active note also attached
     (listed once) and another file and folder attached; the prompt label
     names them. A message queued mid-turn and `/compact` carry no block;
     an `@` mention is stored in the conversation file's `contextPaths`.
  5. M4 at 80% and 150% zoom and a changed interface font size: the
     one-line form refits without a resize.
  6. M6: Tab reaches each chip, each remove button and "+N"; a screen
     reader reads a chip's name and tooltip, an offer's label, "+N" as
     "Show hidden context (N)" opening a dialog; Escape in the popover
     returns focus to "+N".
  7. M3: offers outlined and on chips in the accent in Obsidian light and
     dark and the forced Light and Dark.

## Independent review

A review agent, not the implementer. It compared the context block, label
and stored paths of the old view code (extracted from abfd508) with the new
modules over 64 cases: 61 byte-identical, 3 differing exactly as
documented (a split emoji left out, "… N more" past 40 properties, a cyclic
property sent instead of failing the send); with context off nothing extra
is read. In headless Chromium (Obsidian 1.14.4 `enhance.js` and `app.css`):
the inline offer, the tall and one-line forms, "+N" and "Hidden context",
re-fits, no loop and no horizontal overflow at 300 and 440 px wide, 600 and
900 px tall. Codex during the build: four fixes, confirmed. Nits passed to
task 042: offer chips' accessible names should include their visible text;
at 300 px with Stop showing no chip fits beside "+N".

## Outcome

The context block moves into `context-format` and `context-builder`, chips
fit one line on a short panel behind "+N", and the composer drops to one
line at 640 px tall or less. Owner items: ADR-016's Context block row now
names `context-format`; at 640 px tall or less an offer turned off cannot
be turned back on until the panel is taller, as PRD-001.R30 says (a "Turn
on" row in "Hidden context" would close it); manual rows 1 to 7 in the Run
log.
