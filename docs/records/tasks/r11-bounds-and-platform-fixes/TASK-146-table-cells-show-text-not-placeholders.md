---
status: closed
release: r11-bounds-and-platform-fixes
number: 146
prd: PRD-001.R17
---

# TASK-146 — Table cells show text, not placeholders

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `fix`, the owner's request of 2026-10-19. TableBase copies each table
cell's `textContent` during `MarkdownRenderer.render` and redraws the table
from that copy, so the placeholders of DES-001 Rendering boundary (code, math,
images) show as tokens (`i5a1105fz7yzq2z`) and the late restore cannot reach
them. The fix stays generic: no code names a table plugin.

Acceptance:

- In a reply's table, a table view shows code, math and images as their text.
- A native table still shows code as `code`, math as MathJax output.
- No cell's text or HTML holds `::` while other post processors run,
  including colons that meet across elements (`**a:**:b`) and at a piece's seam.
- A node another plugin changed or copied is not reverted.
- PRD-001.R17, DES-001 (step 9, residual) and `docs/current/SECURITY.md` state it.

## Scope

Expected files: `src/ui/markdown.ts`, `src/inert-markdown.ts`, `src/main.ts`,
`tests/inert-markdown.test.mjs`, DES-001, PRD-001, `docs/current/SECURITY.md`,
`RELEASE_NOTES.md`.

Negative scope: TableBase's own link handling (residual), attribute
placeholders (step 10 unchanged), cutting whole tables before render.

## Plan

`renderMarkdown` keeps its render in an in-flight set; a post processor at
sort order -10000 writes each table cell's placeholders as text and breaks
colon pairs with a word joiner (`breakCellColons`), recording each node; the
late restore reverts recorded nodes still under the root and unchanged.

Risks (impact x probability, conditional on a reply holding the content and
Dataview enabled): Dataview reading a field TableBase rebuilt from flattened
text, 5x5=25 inherent, 5x1=5 residual with the colon breaks over every cell of
a panel render; restore overwriting another plugin's text, 2x3=6, 2x1=2 with
the unchanged-node check. Rejected: `<wbr>` between colons (lost when a table
view flattens cells); parking tables with placeholders until the restore
(gives up table views on every table holding code).

## Run log

- 2026-10-19: built and tested; `make verify` passes.

## Independent review

Codex, two rounds on the design before code: found that `<wbr>` breaks vanish
when TableBase flattens cells and Dataview (order 100) reads the rebuilt
cells; found that cells without placeholders need the sweep too (a
pre-existing hole: `[k**:**: ...]`); asked for full-placeholder matching,
per-render records, root containment over `isConnected` (renders use detached
scratch elements) and an unchanged-node check. A review of the diff then
found placeholders inside rendered code expanded early, admission by token
prefix rather than a whole placeholder, and doc claims broader than the code;
all fixed. Its remaining point is the owed check below.

## Outcome

Landed. Owed: a vault run with TableBase on Obsidian 1.8.7 and current,
confirming the post-processor order and that sections are under the render
root while post processors run (the sweep of cells without placeholders
depends on it).
