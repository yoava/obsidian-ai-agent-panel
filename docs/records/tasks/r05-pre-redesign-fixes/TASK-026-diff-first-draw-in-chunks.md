---
status: closed
release: r05-pre-redesign-fixes
number: 026
prd: PRD-001.R29
---

# TASK-026 — Draw a diff's first rows in chunks

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`renderFileDiff` draws every row of a diff in one task, up to the 4000-row cap,
while gap expansion already draws in chunks (task 004). A 4,000-row diff on a
permission card, an activity card or in the changes list can pass the 100 ms
frame bound of PRD-001.R29. Task 004's review (finding 4) left it as a backlog
item.

Governing: PRD-001.R29,
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Diff engine and view), backlog item in `plan.md` (removed by this task).

Acceptance:

1. The first draw of a diff uses the chunking gap expansion uses: at most 500
   rows or about 50,000 characters of row text per chunk, the first chunk
   drawn before `renderFileDiff` returns, each later one on an animation frame
   of the container's own window. A diff within one chunk is drawn exactly as
   before.
2. Drawing stops when the diff's body has left the page: a card removed, a
   view closed, or the container emptied to draw the diff again (a settled
   edit card). A body not yet on the page when `renderFileDiff` runs still
   gets its first chunk; one attached after its first frame keeps only that
   chunk, so callers attach before rendering. The returned `FileDiff` is
   complete before the DOM is.
3. Gap expansion and the first draw share one helper; no second copy of the
   scheduling and liveness rule.
4. Unchanged: the row cap, the gap limits, the Rendered preview (built from
   the diff's rows, not the DOM), the header and notes.

## Scope

Expected files:

- `src/diff.ts` (`drawInChunks`: the first chunk no longer waits on `alive`),
  `tests/diff.test.mjs`
- `src/diffview.ts` (`drawRows`, used by the first draw and the gap click)
- `RELEASE_NOTES.md`, `docs/current/plan.md` (backlog item out, one in), DES-004

Negative scope:

- The restore path's eager rendering of every message (the other PRD-001.R29
  backlog item), the 4000-row cap and the gap limits.
- `styles.css`, `view.ts`, and the callers of `renderFileDiff`.
- Virtualizing the diff or drawing rows lazily on scroll.
- The changes list drawing every file's diff at once and running `diffText`
  three times per file: the bound holds per diff, not per frame; backlog item
  added to `plan.md`.

## Plan

- Tests first in `tests/diff.test.mjs`: `drawInChunks` draws its first chunk
  with `alive` false from the start, then draws nothing more; with `alive`
  turning true by the next frame it goes on. A diff at the cap draws in eight
  chunks of 500 and a ninth holding the cut row (a guard on `diffText` and
  `drawInChunks` together).
- `drawInChunks` keeps its first chunk outside the `alive` check, since the
  caller asked for it now and a body may be built off the page.
- `diffview.ts` gets `drawRows(anchor, rows, draw)`, which binds
  `drawInChunks` to the anchor's window frames and `isConnected`; the first
  draw anchors on the diff body, the gap click on the gap row.
- Verification: `make verify`. By hand in a vault, owed (PRD-001.R29 is
  verified by DevTools profiles, no DOM harness exists): a 4,000-row diff on a
  permission card and in the changes list stays responsive, with no task past
  100 ms; a short diff draws in one frame; closing the card or the changes
  list mid-draw throws nothing and draws nothing more.
- Rejected: a second chunking path in `renderFileDiff` (design rule 2);
  drawing the first chunk only when `body.isConnected` (a body built off the
  page would show nothing).

## Run log

- Tests first: "the first chunk draws before the target is on the page; later
  ones need it there" failed before the change (nothing was drawn with `alive`
  false). The 4,000-row cap test passed already and guards the chunk count.

## Independent review

A review agent, not the implementer; `make verify` passed. No Defect.
Findings:

1. Gap: the 100 ms bound holds per diff; diffs drawing in the same frame
   add up (changes list, restored conversations). Fixed: DES-004 says so;
   backlog line for the changes list.
2. Gap: a diff attached after its first frame keeps only its first chunk.
   No caller does this. Fixed: the contract is in DES-004 and the
   `renderFileDiff` docstring.
3. Gap: the `diffview` half has no automated guard (it imports
   `obsidian`). Manual check below.
4. Nits: the cap test's title; the docstring. Fixed.

## Outcome

A diff's first draw now shows its first 500 rows at once and the rest on
later frames, through the helper the gap expansion uses. Owed by hand in a
vault: a 4,000-row diff stays responsive; a short one draws in one frame;
closing the card mid-draw throws nothing.
