---
status: closed
release: r10-image-viewer-and-quick-wins
number: 137
prd: PRD-001.R14
---

# TASK-137 — Images open large in a viewer

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `feat`, the owner's AAP-14, requirement delta CHG-022: a click, Enter
or Space on an image chip, a sent prompt's image or a tool result's image shows
it large in a themed Obsidian modal on the thumbnail's window, fitted; a click
toggles actual size; Left and Right step through the same message's or tool
result's images; Escape closes; the caption gives name, file size and pixel
size. The image chip views on click and removes by its own button. Thumbnails
are buttons named "View <name>".

Acceptance: the PRD-001.R14 viewer statements; `state-image-viewer` tests;
harness screenshots of the chips and the viewer, dark and light, in the live
note.

## Scope

Expected files: `src/state/image-viewer.ts`, `src/state/composer.ts`,
`src/confirm-modal.ts`, `src/ui/dom.ts`, `src/ui/composer.ts`,
`src/ui/prompt.ts`, `src/ui/steps-card.ts`, `src/ui/turn.ts`,
`src/ui/messages.ts`, `styles.css`, `package.json` (pretest),
`tests/state-image-viewer.test.mjs`, `tests/state-composer.test.mjs`,
`tests/tooltips.test.mjs`, PRD-001, DES-001, DES-003, CHG-022,
`RELEASE_NOTES.md`.

Negative scope: hover preview, a main-window tab, images in reopened
conversations, images inside rendered Markdown; no stored-data change.

## Plan

The modal is `ImageViewerModal` in `confirm-modal`: a `ui/` module may not
import `theme-scope` (ADR-016 U2), the reset dialog's precedent in DES-001;
a new layer-3 module would have needed U2 widened. `thumbButtons` sits in
`ui/dom`, shared by `ui/prompt` and `ui/steps-card` (P5). Tool images carry no
name: "Tool result image N" (decision 5). No wrap at the ends (decision 6).

## Run log

- Panel harness (`probe-137.mjs`, Obsidian 1.14.4 `app.css`), 1100 x 760,
  a pasted 2400 x 1500 and a 480 x 320 PNG: chips show both with a remove
  button; the chip click opens the viewer, focus on the image; fitted 974 x 609,
  caption "1 of 2 · screenshot-wide.png · 3.4 MB · 2400 × 1500"; a click shows
  2400 x 1500 in a scrolling stage, `aria-pressed` true. Dark and light.
- Independent review (fresh subagent): the thumbnail tooltip overwrote the
  "View <name>" label (`setTooltip` sets `aria-label`), now the tooltip itself;
  the viewer's `aria-label` showed an "Actual size" tooltip over the image, now
  hidden text; the fitted image overflowed pop-outs under ~600 px, now capped
  at the dialog's content box (the harness then showed the image 1 px wider
  and 8 px taller than the stage: the border and `em` on two elements; both
  now share one pixel bound, image = stage = 974 x 609, and 342 x 214 in a
  400 x 600 window); a stale comment. Kept: the modal in
  `confirm-modal` (U2), `formatBytes` in `state/image-viewer`.
- `make verify` OK.

## Independent review

Fresh subagent review of the full diff before landing; findings above.
Focus return after Escape and pop-out windows are the owner's manual checks.

## Outcome

Done.
