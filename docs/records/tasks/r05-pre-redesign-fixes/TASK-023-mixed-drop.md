---
status: closed
release: r05-pre-redesign-fixes
number: 023
prd: PRD-001.R14
---

# TASK-023 — A paste or drop mixing images and other files

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`imageFilesFrom` kept only the `image/*` files of a paste or drop. A payload
with an image and a PDF attached the image and dropped the PDF without a
word.

What a payload with no image does today: the composer's handlers return
without `preventDefault`, so the event goes on to Obsidian's own handling and
the plugin never touches the files (task 013, D3). No other handler in
`src/` takes a file drop; a vault file dragged from the file explorer carries
text, not `Files`, and the textarea inserts it. PRD-001.R13 and R14 name no
behavior for non-image files. A single event cannot be split between the
composer and Obsidian, so the non-image part of a mixed payload takes the
existing refusal: R14's "skip it and list each refusal in one Notice starting
'Not attached:'".

Governing: PRD-001.R14,
[DES-001](../../../current/design/DES-001-system-overview.md) (`attachments`).

Acceptance:

1. `composerFiles(files)` returns all the files, in order, when any file's
   type starts with `image/` (a BMP or SVG included, which `imageRefusal`
   then refuses by name), and `[]` for no files, for files with other types,
   and for an empty type.
2. The composer takes a paste or drop when `composerFiles` is not empty: the
   images attach as before and each other file is named in the "Not
   attached:" Notice, in file order, with the type refusal's text.
3. A file that is not an image takes no place among the 8 images.
4. The Notice names at most 10 files that are not images; the rest are
   counted in a last entry, "and N more". Image refusals are not capped.
5. A payload with no image file is not intercepted, as before: no
   `preventDefault`, no Notice.

Owner question (end-of-work list; PRD-001.R14 stays as accepted):

- Q1. Take every file drop? Today a payload is the composer's only if it
  holds a file typed `image/*`. So a lone image with an empty MIME type
  (HEIC on Windows, a PNG named `x.dat`) or a folder falls through to
  Obsidian silently, while the same file beside a PNG is named in the Notice;
  the drop highlight (`is-drop-target`) shows for any file drag; and what
  Obsidian does with a file dropped on the composer is not verified (likely
  nothing visible). R14 has no clause that names non-image files in an image
  drop, so this task rests on its "list each refusal" sentence. Recommend:
  amend R14 to say any pasted or dropped file that cannot attach is listed,
  and make `composerFiles` return every non-empty file list, with
  `preventDefault` in both handlers.

## Scope

Expected files:

- `src/attachments.ts` (`composerFiles`, the cap in `collectImages`),
  `src/view.ts` (`imageFilesFrom` becomes `composerFilesFrom`, which reads
  it)
- `tests/attachments.test.mjs`
- `README.md` (Images), `RELEASE_NOTES.md`, `docs/current/plan.md` (backlog
  item removed), `docs/current/DEVELOPMENT.md` (test table), DES-001
  (`attachments` row)

Negative scope:

- A paste or drop of only non-image files: stays with Obsidian (Q1).
- Attaching a non-image file as a chip or a mention; the drop highlight; the
  refusal texts; the limits.
- PRDs and ADRs; the DES-003 draft (a rewrite elsewhere replaces it).
- The other backlog items.

## Plan

- Tests first: `composerFiles` cases, the cap, and a mixed-drop
  `collectImages` case in `tests/attachments.test.mjs`.
- `collectImages` already refuses a non-image by name through `imageRefusal`
  and keeps going, so the loss was the filter that hid those files from it;
  `composerFiles` is that rule, outside the view, so reverting it fails a
  test.
- Verification: `make verify`. `view.ts` is tested by hand in a vault: drop a
  PNG with a PDF, a PNG with a folder, a PDF alone, a PNG alone, and a
  text-only drop of a vault link from the file explorer; paste a screenshot;
  paste two copied files (a PNG and a PDF).

## Run log

- Tests first: the two `composerFiles` tests and the cap test failed
  (`composerFiles is not a function`; the cap test saw 13 names). The other
  new `collectImages` tests (a mixed drop names the other files in order; a
  non-image takes no place; ten files are all named; image refusals are not
  capped) passed against the old code, as expected: the loss was the filter
  in `view.ts`, which `composerFiles` now holds.
- Owed by hand in a vault: the checks of the Plan.

## Independent review

A review agent, not the implementer; `make verify` passed. No Defect.
Findings:

1. Gap: the fix sat in `view.ts`, so reverting it failed no test. Fixed:
   `composerFiles` in `attachments`; tests.
2. Gap: no PRD-001.R14 clause names non-image files in an image drop. Owner
   question Q1.
3. Gap: a drop with no image file falls through, so a lone image with an
   empty MIME type or a folder is ignored silently while the same file
   beside a PNG is named, and the drop highlight shows for any file. Owner
   question Q1.
4. Nit: paste is changed too; the README and release note said "drop".
   Fixed.
5. Nit: no cap on the Notice; missing manual checks. Fixed: ten named, then
   "and N more"; checks added.

## Outcome

A paste or drop holding an image now names its other files in the "Not
attached:" Notice instead of losing them silently. Q1 (take every file
drop, and R14's wording) goes to the owner. Owed by hand in a vault: the
checks in the Plan.
