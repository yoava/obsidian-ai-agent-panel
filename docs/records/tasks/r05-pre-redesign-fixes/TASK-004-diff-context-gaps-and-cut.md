---
status: closed
release: r05-pre-redesign-fixes
number: 004
prd: PRD-002.R5, PRD-001.R29
---

# TASK-004 — Diff context, gap expansion and the row cut

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Three diff defects against PRD-002.R5: diffs draw no context lines, a gap
click re-diffs the whole file and draws up to 20,000 rows in one task, and the
4000-row cut reads as "N unchanged lines".

Governing: PRD-002.R5, PRD-001.R29,
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Diff engine and view, steps 6 and 7, the bounds table).

Acceptance:

1. An option passed as `undefined` keeps its default: `diffText` with
   `{ context: undefined }` shows three unchanged lines each side of a change.
   A `context` of 0 still means none.
2. A gap row carries the old and new line number of the first line it hides.
3. The row cap ends in a `cut` row, not a gap row, carrying the number of rows
   dropped. The view draws it as `N more rows not shown`, styled apart from a
   gap row and not clickable; the Rendered preview leaves it out.
4. A gap click shows only that gap's lines, in its place, taken from the text
   by line range with no re-diff; the rest of the diff stays as drawn.
5. Rows are appended at most 500 or about 50,000 characters of row text per
   animation frame, whichever comes first, and drawing stops when the diff
   has left the page.
6. One gap shows at most 20,000 rows; the rest stays a gap row with its own
   start lines and count.

## Scope

Expected files:

- `src/diff.ts` (options defaulting, `cut` row type, gap start lines,
  `expandGap`, `drawInChunks`, `sidesOf`), `tests/diff.test.mjs`
- `src/diffview.ts` (gap click, chunked insert, cut row), `styles.css` (cut
  row)
- `RELEASE_NOTES.md`, `docs/current/plan.md` (three backlog items out, one in),
  DES-004 where it disagrees with the code

Negative scope:

- Every other backlog item, the first draw of a diff in chunks included.
- What the change list tracks (`FileChange`, `changeTotals`): unchanged.
- The re-diff design: gap expansion does not diff again, and the bounds (LCS
  cells, 4000 rows, 20,000 rows per gap) keep their values.
- The Rendered preview beyond leaving out the cut row.

## Plan

- Tests first in `tests/diff.test.mjs`: default and `undefined` context, a
  gap's start lines, the cut row beside gap rows, `expandGap` against a
  full-context diff, the 20,000-row limit with a 30,000-line file, and a chain
  of smaller limits covering one gap; `sidesOf`; `drawInChunks` with a fake
  scheduler.
- `diff.ts` stays pure and holds everything testable: `expandGap` returns the
  context rows for a gap's range from the old text's lines (unchanged lines
  read the same on both sides) and a gap row for the remainder;
  `drawInChunks` splits rows into chunks of at most 500 rows or about 50,000
  characters, the first drawn in the click, the rest when the scheduler
  calls, none once the target is gone.
- `diffview.ts` only inserts: each chunk is a fragment before the emptied gap
  row, which the last chunk replaces (with the remainder gap row when the
  limit was hit); frames come from the gap's own window.
- Verification: `make verify`. By hand in a vault, owed: a gap click on a
  20,000-line file of paragraph-length lines stays within the 100 ms task
  bound (DES-004), and the cut row's look in light and dark themes.
- Rejected: filling the whole gap in one task (PRD-001.R29); a per-gap
  `diffText` call (it is the re-diff DES-004 rules out).

## Run log

- Tests first: seven tests failed before the change in `tests/diff.test.mjs`
  ("row output is capped and says so" with its new `cut` assertion, and the
  new tests for `undefined` options, gap start lines, the cut row, and three
  for `expandGap`); the default-context and `context: 0` tests passed already
  and guard against regressions. The review's tests (`sidesOf`,
  `drawInChunks`) also failed first, as the functions did not exist.
- The worktree began at 0.4.0 without `docs/current/`; it was fast-forwarded to
  `fad1022`, where the governing documents are.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Gap: no test gave a remainder gap a new line number different from its old
   one. Fixed: the 30,000-line test inserts a line, and a mutation making
   `newLine` follow `oldLine` fails three tests.
2. Gap: `sidesOf` and the chunk loop were testable logic inside `diffview.ts`
   (design rule 4). Fixed: both moved to `src/diff.ts` (`sidesOf`,
   `drawInChunks`) with tests.
3. Gap: 500 paragraph-length lines can pass the 100 ms task bound
   (PRD-001.R29). Fixed: a chunk also ends at about 50,000 characters of row
   text; DES-004 says so.
4. Gap: the first draw of a diff renders up to 4,000 rows at once. Not this
   task: backlog item added to the plan.
5. Nit: `window.requestAnimationFrame` ignores popout windows. Fixed: the gap
   element's own `win`.
6. Gap: keyboard focus was lost when the focused gap button was emptied.
   Fixed: the leftover gap's button takes focus unless the user moved it.
7. Nit: the release note said "as documented". Fixed.
8. Nit: staging note about the untracked `node_modules` link. No change.

## Outcome

Diffs show three context lines, a gap expands in place by line range in
chunks, and the row cut has its own row. Owed by hand in a vault: a gap
click on a 20,000-line file of paragraph-length lines within 100 ms, and the
cut row in light and dark themes.
