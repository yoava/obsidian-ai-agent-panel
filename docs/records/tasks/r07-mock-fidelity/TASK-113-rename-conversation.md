---
status: closed
release: r07-mock-fidelity
number: 113
prd: PRD-001.R7, PRD-001.R9, PRD-003.R5
---

# TASK-113 — Rename a conversation from the tab menu

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `feat`. The owner asked on 2026-10-14 that the tab menu offer "Rename";
change 013 records the reversal of PRD-003's "renaming" non-goal and the PRD
edits, which this task applies.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7 (titling, rename clauses), R9 (row menu);
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R5, R7;
[DES-003](../../../current/design/DES-003-panel-ui.md) Row menu, Rename;
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) Rename,
Export, touch rules.

Acceptance:

1. The row menu (tab strip, "All conversations" overflow menu, column rows)
   offers "Rename…" (pencil) after Pin or Unpin.
2. It opens "Rename conversation": a field holding the title, selected; Enter
   or "Rename" saves, Escape or "Cancel" closes; "Rename" is disabled while the
   field is blank.
3. The saved title is the first line, trimmed, up to 80 code points; a title
   equal to the one shown changes nothing.
4. The title shows in the tab, hover card, column row, tab menu, "Previous
   conversations" and the next export's frontmatter, and is saved. A rename
   before the first prompt survives it (`recordPrompt` titles only a conversation
   with none).
5. The exported note's path (`exportPath`) and `updatedAt` do not change.
6. A branch of a renamed conversation is titled "<new title> (branch)".
7. A stored conversation is renamed in its file without opening; a rename of one
   open in another view updates that view's object, so its next save keeps the
   title.

## Scope

Expected files: `src/conversation-list.ts` (`renamedTitle`), `src/confirm-modal.ts`
(`RenameModal`, here because `tests/architecture.test.mjs` admits no new
module without a protected edit), `src/ui/conversation-column.ts` (menu entry,
`onRename`), `src/view.ts`, `src/main.ts` (`renameConversation`), `styles.css`,
`tests/conversation-list.test.mjs`; docs: change 013, PRD-001, PRD-003, DES-001
(file map), DES-003, DES-005, `README.md`, `RELEASE_NOTES.md`.

Negative scope:

- No inline editing in the tab, no rename from the "Previous conversations"
  picker, no auto-generated titles.
- No storage format change; no new dependency; no protected-path edit.

## Plan

- Tests first: `renamedTitle` (first line, trim, 80 code points, blank, unchanged,
  untitled stays untitled) and `branchTitle` of a renamed title.
- One plugin-level `renameConversation` so every view's open object takes the
  title; `touch: false` as for a pin.
- Rejected: a new `rename-modal` module (needs an architecture-test edit); an
  ellipsis cut as `promptTitle` does (a typed title is the user's own).
- Verification: `make verify`; harness menu and dialog, dark and light.

## Run log

- A new module failed `tests/architecture.test.mjs` A3 (no layer), so the dialog
  joined `confirm-modal`.

## Independent review

Independent review agent: approve. Applied from it: `load` waits for the
conversation's write in flight, so a pin or rename of a just-closed
conversation cannot start from an older file (landed as its own `fix`
commit); the DES-001 row names one job. Accepted: the dialog's buttons sit
left, as in the panel's Delete dialog; `RenameModal` shares `confirm-modal`
until `tests/architecture.test.mjs` lists a new module; another device's open
tab can overwrite a rename on its next save, as it can a pin. Harness at
440 px, dark and light: menu order and icon, the dialog, Rename disabled when
blank, the tab retitled. `make verify` exit 0.

## Outcome

Done.
