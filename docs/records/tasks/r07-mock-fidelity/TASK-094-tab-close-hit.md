---
status: closed
release: r07-mock-fidelity
number: 094
prd: PRD-001.R7
---

# TASK-094 — A tab's close button takes its clicks

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S. Owner report: the tab's × does not always close it.

Cause: the × sits over the title's end (`margin-inline-start: -18px`). A hovered
tab sets a `mask-image` gradient on the title, which makes the title a stacking
context that paints above the unpositioned × that follows it. Every click on
the × box then lands on the title and bubbles to the tab, which selects it.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7 (close by the close button, shown while the pointer is over a tab);
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Tabs;
[DES-003](../../../current/design/DES-003-panel-ui.md) Tab item.

Acceptance:

1. On a hovered tab that shows its ×, a click anywhere in the 18 px box
   (except the rounded corner) closes the tab, at every tab width from the
   48 px threshold up, and on the active tab.
2. The × keeps its size and place; an inactive tab under 48 px keeps it hidden
   (a click selects).

## Scope

Expected files: `styles.css` (the × positioned), DES-003 (Tab item).

Negative scope: no other tab-strip change; no change to the hide rule for
narrow tabs, drag, the hover card or the resize pass. No release-notes entry:
the strip is unreleased (absent from 0.5.0).

## Plan

`position: relative` on `.workspace-tab-header-inner-close-button`: positioned
elements paint in tree order, so the × (after the title) paints over it.
Rejected: `z-index` on the × (needs the position anyway); `pointer-events: none`
on the title (breaks the title's tooltip and drag handle).

CSS only, no Obsidian-free logic, so no node test; the headless harness probes
the real hit test (elementFromPoint, then a mouse click at a grid across the
box and 3 px outside) before and after.

## Run log

- Harness (panel widths 360 to 660, 6 tabs, tabs 0, 1 and 3, 35 points each,
  stubbed close and select): before, 0 of 630 clicks closed a tab;
  `elementsFromPoint` at the × centre listed the title above the button.
  After, every in-box click on a tab showing its × closes it except the
  rounded corner point; inactive tabs under 48 px select, as designed.

## Independent review

Independent review agent: approve. Confirmed the cause (the hover-only title
mask makes the title a stacking context above the unpositioned close button,
in every state where the button is visible), reproduced it (0 of 210 clicks
closed before), and after the fix every click in the 18 px box closes the tab
except the rounded corner, on active and inactive tabs from 48.2 px up.
Before/after screenshots byte-identical; the hover card, focus ring and
active-tab feet are unaffected. `make verify` exit 0.

## Outcome

Done. The close button is positioned, so it paints above the masked title and
takes the click. Inactive tabs under 48 px still hide it by design, so a click
there selects the tab.
