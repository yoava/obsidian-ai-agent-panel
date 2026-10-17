---
status: closed
release: r07-mock-fidelity
number: 102
prd: PRD-003.R1, PRD-003.R9, PRD-003.R13, PRD-002.R14, PRD-002.R18, PRD-001.R28
---

# TASK-102 — Clear record reader

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The read side of a clear, before anything writes one (task 103): a stored
`clear` record is typed, drawn, exported and respected by Restore files.

Governing: [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R1 (the clear record: time and ended session), R9 (reopen shows the divider),
R13 (the exported line); [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R14 (Restore files), R18 ("Restore to before turn N");
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R28 (the
separator's name), R38 (the divider's wording);
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md)
Decision 2 and owner ruling O1; change 002 (`docs/records/changes/CHG-002-context-events.md`).

Acceptance:

1. A reopened conversation with a `clear` record draws, after the messages
   before it, an orange divider: the `eraser` icon, "Context cleared", the
   sub-line "HH:MM · Claude can't see anything above" (no time, no dot, when
   the record has none), a `role="separator"` named "Context cleared at HH:MM"
   ("Context cleared" without a time), no Summary toggle and no Undo.
2. A `fresh-start` record still draws nothing.
3. The Markdown export writes the italic line "Context cleared at HH:MM" for
   each clear, without the session id.
4. A turn that a clear record follows shows no Restore files button, whatever
   the tab's session, and "Restore to before turn N" skips it; a turn after the
   clear, or before only a fresh start, is unchanged.
5. `clearRecord(at, sessionId)` builds the record as `freshStartRecord` does
   (a string id kept as stored, anything else left out); the file reader keeps
   a clear's `at` and `sessionId` and drops mistyped fields.
6. The divider is drawn by the shared `ui/event-divider` from a
   `state/clear-divider` view; `EventView` lives in `state/event-view`.

## Scope

Expected files:

- New: `src/state/clear-divider.ts`, `src/state/event-view.ts` (types, moved
  from `state/compaction`), `tests/state-clear-divider.test.mjs`.
- Changed: `src/state/boundary-records.ts` (`ClearRecord`, `clearRecord`),
  `src/history.ts` (the union), `src/state/tab.ts` (`ClearItem`,
  `DRAWN_KINDS`, `modelFromStored`), `src/state/turn.ts` (`addClear`),
  `src/state/compaction.ts` and `src/ui/event-divider.ts` (import
  `EventView`), `src/ui/messages.ts` (`drawEvent`), `src/transcript-markdown.ts`,
  `src/restore.ts`, `src/tab/restore-branch.ts`, `package.json` (`pretest`),
  the tests of those modules.
- Docs: DES-001 file map, DES-003 (modules, Clear divider, test matrix),
  DES-004 Restore, DES-005 (the `clear` kind, the export row), SECURITY.md
  (history stores session ids in clear and fresh-start records),
  `RELEASE_NOTES.md` (the reopened divider; the version-2 rollback note).

Negative scope:

- Writing a clear record, the live divider, the clear itself, dimming and
  folding, Undo (tasks 103 to 109). No `styles.css` change: the warning tone
  already exists.
- `tests/styles.test.mjs`, `tests/architecture.test.mjs`.
- Recomputing a turn's `cleared` flag after an Undo or a live clear (107, 103).

## Plan

1. Tests first: `state-clear-divider`, `state-boundary-records`, `state-tab`,
   `transcript-markdown`, `restore`, `history-file`.
2. `EventView` and `SubPart` move to `state/event-view` (two views now use
   them); `clearView` and `clearedLine` in `state/clear-divider`, shaped like
   `compactionView` and `compactedLine`.
3. `turnRestore` computes `cleared` from the messages after the turn; the
   button state takes it as a fourth argument, defaulting to false.
4. One `drawEvent` in `ui/messages` for both dividers.

Rejected: a clear flag on the turn record (the clear record is the single
source); the board's "/clear ·" sub-line prefix (PRD-001.R38 words the
sub-line without it).

## Run log

- `make verify` exit 0. Board check in the headless harness (new fixture
  `ClearReopen`, the ContextEvents cleared divider as the board), dark and
  light at 340, 440 and 600 px: pill 24, label 18, icon 12, wave 8 and
  sub-line heights equal; icon, ring, fill, wave and text colors equal. Deviations:
  the "/clear ·" prefix on the board's sub-line (PRD wins), the board's curly
  apostrophe (PRD text is straight), the faint text and light warning tokens
  one to three levels off the board's (global tokens, not this task), Obsidian's
  own `eraser` glyph against the board's older one.

## Independent review

Independent review agent: approve. Board check against ContextEvents' cleared
divider, dark and light at 340, 440 and 600 px: pill, wave, icon, label,
spacing and tone match. Deviations confirmed: no "/clear ·" prefix on the
sub-line (PRD-001.R38 words it without), a straight apostrophe, Obsidian's
own `eraser` glyph, the global faint-text and light warning token offsets,
and the board's fixed 407 px width. No conflict with tasks 099 and 100
(trial merge clean). `TurnRestore.cleared` is set when the turn entry is
made; tasks 103 and 107 refresh it. `make verify` exit 0.

## Outcome

Done.
