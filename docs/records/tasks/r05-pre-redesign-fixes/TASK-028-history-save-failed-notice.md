---
status: closed
release: r05-pre-redesign-fixes
number: 028
prd: PRD-003.R2
---

# TASK-028 — Notice when a history write fails

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

PRD-003.R2 says a failed save is logged and shows a Notice, at most once per
conversation until the plugin reloads. `HistoryStore.save` only logs: the hook
`onSaveFailed` that DES-001 and DES-005 name does not exist, so a read-only
history folder or a full disk loses conversations without a word. A backlog
item in `plan.md` (removed by this task).

Governing: [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R2, [DES-005](../../../current/design/DES-005-persistence-and-sync.md) (Save
path, Failure handling, E2), [DES-001](../../../current/design/DES-001-system-overview.md)
(Runtime wiring).

Where the rule lives: the store sits below every panel view, and several views
can hold one conversation, so a Notice raised per view would repeat. The
once-per-id rule is in the store (`OncePerId`, `history-notice`) and `main`
shows the Notice itself, not through the views. The design said "each view's
`onHistorySaveFailed(id)`"; DES-001 and DES-005 now say `main`. The hook also
carries the title, because a conversation whose first save failed is not in
the store's cache.

Acceptance:

1. When a conversation's write fails, `onSaveFailed(id, title)` runs, the
   first time for that id until the plugin reloads; later failures of the same
   id, from any view's save, run it no more.
2. `main` shows one Notice per call:
   `Could not save "<title>" to history. The conversation stays open; the next save tries again.`
   A title that is blank or not a string reads "New
   conversation" (`displayTitle`).
3. A failed write is still logged with `console.error`, the conversation stays
   in memory and the next save tries again.
4. A failure of the pre-save hook (automatic export) raises no Notice.
5. A write that succeeded raises none: `remember` (the list redraw through
   `onChanged`) runs after the write's `try`, with its own log-only
   `try`, so a redraw that throws is not a failed save and does not use up the
   conversation's one announcement.
6. A handler that throws is logged; `save` never rejects for it.
7. DES-001, DES-005, the test table, the release notes and the `plan.md`
   backlog state the present answer.

## Scope

Expected files:

- `src/history-notice.ts` (`OncePerId`, `saveFailedText`: the Notice rule,
  apart from the scan merge in `history-core`, one job each),
  `tests/history-notice.test.mjs`, `package.json` (`pretest`)
- `src/history.ts` (`onSaveFailed`, `announceSaveFailure`, the order in
  `save`), `src/main.ts` (the wiring)
- `docs/current/design/DES-005-persistence-and-sync.md`,
  `docs/current/design/DES-001-system-overview.md`,
  `docs/current/DEVELOPMENT.md` (test table), `docs/current/plan.md`,
  `RELEASE_NOTES.md`

Negative scope:

- `view.ts`: no per-view method.
- Retry or back-off of a failed write, clearing the once-rule after a later
  success, a persistent "unsaved" marker on the tab.
- The delete and load Notices.
- PRD-003 (it already states the behavior), protected paths, a real CLI run.

## Plan

- Tests first in `tests/history-notice.test.mjs`: an id is claimed once, ids are
  independent, the text names the title and falls back to "New conversation".
- `OncePerId` is a set behind `claim(id)`; `HistoryStore` owns one, so the
  rule lasts as long as the store, which is the plugin's lifetime.
- `saveFailedText` sits beside it so the whole sentence is tested; `main` only
  constructs the `Notice`.
- Rejected: a per-view `onHistorySaveFailed(id)` as the design had it (one
  Notice per open view, none when no view holds the conversation, and the view
  would need the title from the tab); keying the once-rule in `main` (the
  store is where saves fail and the hook would run more than once).
- In `save`, the write has its own `try`; its catch logs, announces and
  returns; `remember` follows in a log-only `try`. `announceSaveFailure`
  claims the id, then calls the hook inside a `try` that logs.
- Verification: `make verify`. By hand in a vault: make the history folder
  read-only, send two messages, see one Notice and one console error per
  save; open a second panel view on the same conversation, still one Notice.

## Run log

- Tests first: with `OncePerId` and `saveFailedText` absent, the new tests
  fail (`tests/history-core.test.mjs` does not load: the module has no export
  `OncePerId`); all pass after the change.
- After review: the Notice rule moved from `history-core` to
  `history-notice` (design rule 1); the new spec failed first (module not
  found). The order in `save` and the guarded handler are in `history.ts`,
  which imports `obsidian`, so plain Node cannot test them; owed by hand: a
  view whose `onChanged` redraw throws raises no Notice for a good write, and
  a throwing `onSaveFailed` handler leaves `save` resolving.

## Independent review

A review agent, not the implementer; `make verify` passed; the real
`history.ts` driven with fake adapters. No Defect. Findings: a throwing
redraw after a good write raised a false Notice and used up the claim
(fixed: the write has its own try; `remember` runs after it, log-only); a
throwing handler escaped `save` (fixed: log-only); the Notice sentence was
partly tested (fixed); the release note said "Obsidian reloads" (fixed);
`history-core` had four jobs (fixed: `history-notice`). The wiring in
`history.ts` and `main` imports `obsidian` and is owed by hand.

## Outcome

A failed history write shows one Notice naming the conversation, once per
conversation until the plugin reloads, however many panel views are open;
the hook moved from each view to `main`, and DES-001 and DES-005 say so.
After a failure, a later success and a second failure show no second
Notice, as PRD-003.R2 says. Owed by hand in a vault: a read-only history
folder with two messages and two views gives one Notice.
