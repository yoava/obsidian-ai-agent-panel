---
status: closed
release: r07-mock-fidelity
number: 047
prd: PRD-001.R30
---

# TASK-047 — Panel clear of Obsidian's status bar

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Fix (class S). Obsidian draws `.status-bar` fixed over the bottom inline-end
corner of the workspace. Obsidian keeps its own views clear with
`padding-bottom` on `.view-content`, which the panel zeroes
(`styles.css`, "Obsidian pads every view's content"), so a panel in the right
sidebar had its status line (model, effort, permissions, context, usage)
hidden under the bar.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R30, R31;
[DES-003](../../../current/design/DES-003-panel-ui.md) Layout model;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) (geometry reads in
`ui/shell`, observers from the element's window, Obsidian-free logic in
`src/state/`).

Acceptance:

1. With the status bar shown over a panel's bottom (right sidebar), the status
   line's rectangle does not intersect `.status-bar`.
2. With the bar hidden (`is-screenshotting`, a snippet, absent in a pop-out
   window), or a panel the bar does not reach (left sidebar), the composer
   area's bottom padding equals its normal value.
3. In the wide layout the conversation column's bottom clears the bar when the
   bar covers it, and takes nothing when it does not.
4. The value follows the panel resizing, the window resizing, a sidebar
   dragged or moved, the bar's width changing as items change, and the bar
   showing or hiding; no repeating timer.
5. `state/bar-clearance` returns the covered pixels: overlap, no horizontal
   overlap, hidden (null or no size), partial, below or above the region.

## Scope

Expected files:

- New: `src/state/bar-clearance.ts`, `tests/state-bar-clearance.test.mjs`.
- Changed: `src/ui/shell.ts` (the clearance read and write in the resize
  pass; observers), `styles.css` (the property added to the composer area's
  and the conversation column's bottom padding), `package.json` (`pretest`),
  `docs/current/design/DES-003-panel-ui.md`, `docs/current/DEVELOPMENT.md`
  (spec row), `RELEASE_NOTES.md`.

Negative scope:

- No restyling, no other overlay work (popovers, hover cards, notices).
- No change to Obsidian's `.view-content` padding rule or to the status bar.
- No protected path; no new dependency.

## Plan

- Tests first: `barClearance(region, bar)` over overlap, partial horizontal
  reach, none, hidden, below, above, a fractional edge, a region not laid out.
- `ui/shell` reads the bar with `querySelector(".status-bar")` on the panel's
  own document, then `getBoundingClientRect` of the bar and of each column in
  the pass's read phase, writes `--ai-agent-panel-bar-clearance` on the main
  column and the conversation column in the write phase, only on change. The
  bar joins the pass's `ResizeObserver`; mutation observers on the bar's
  class and style and the body's class; workspace `layout-change` and
  `resize`; the existing `css-change` and main-column resizes. Per column, so
  a column the bar does not reach takes nothing.
- Verification: `make verify`; the harness facts below.
- Rejected: restoring Obsidian's `.view-content` padding (a fixed 32 px gap
  with the bar hidden or elsewhere, the bug 029 removed); a fixed padding
  keyed to the right sidebar (does not follow the bar's presence or width).

## Run log

- The worktree started at main (a29533d), not `chore/agentic-sdlc`;
  fast-forwarded to it (2cebf76) before work.
- Tests first: `state-bar-clearance` failed on import (no
  `state/bar-clearance`).
- Harness facts: with the bar visible over a right-sidebar panel, the status
  line's rect does not intersect `.status-bar`; with the bar hidden or the
  panel in the left sidebar, the composer area's bottom padding equals its
  normal value (`--size-4-2`).

## Independent review

Reviewer: independent review agent (not the implementer); `make verify` exit
0, no blockers. Verdict: approve with changes.

1. Minor: the jump rail reads the root's height before the clearance is
   written, so a clearance change (a panel moved under the bar by
   `layout-change` alone) left stale tick positions. Fixed: a written
   clearance that differs from the zero the stylesheet assumes requests one
   full pass, which finds the same values and ends. No new unit test: the
   decision is a comparison in `ui/shell`, which has no DOM harness.
2. Minor: `querySelector(".status-bar")` took the first match; Obsidian's bar
   is `.app-container > .status-bar`. Fixed: that selector.
3. Nit: a clearance-only pass also ran the rail's read and write (every body
   class toggle). Fixed: content measures run only on a full pass or a
   pending messages-content resize (`contentDirty`).

Rendering checks run later by the orchestrator in a headless harness, not by
the implementer.

## Outcome

Accepted. Nothing moves into an automated gate: the DOM side has no harness
(DES-003, Context and constraints); the harness facts are in the Run log.
