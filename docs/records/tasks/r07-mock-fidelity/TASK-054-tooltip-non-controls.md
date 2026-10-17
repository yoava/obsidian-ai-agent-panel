---
status: closed
release: r07-mock-fidelity
number: 054
prd: PRD-001.R32
---

# TASK-054 — Tooltips only on icon-only controls: tab close, pinned glyph, step marks

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R32 (a card closes when the pointer reaches another control; text tooltips only
on icon-only controls); [DES-003](../../../current/design/DES-003-panel-ui.md)
Popovers, hover cards and tooltips.

Acceptance:

1. The pointer on a tab's close button shows no tab hover card and the button's
   own tooltip, "Close <title>", when Show tooltips is on; none when off.
2. A control inside a hover-card element counts as another control; other
   descendants still count as the element. The decision is one Obsidian-free
   function (`controlUnder`).
3. Moving from the close button back onto the tab arms the tab's card; movement
   within the tab does not (`returnedFromInner`).
4. The pin glyph of a pinned tab shows no tooltip; the tab's accessible name
   still says "pinned". The waiting dot keeps its "Waiting for you" title
   (PRD-001.R7).
5. A step mark shows no tooltip; its `role="img"` and `aria-label` stay.
6. A conversation-column row needs no change: its pin and close buttons are
   siblings of the button that has the card.

## Scope

Expected files: `src/state/popover.ts`, `src/ui/hover-card-host.ts`,
`src/state/tabs.ts`, `styles.css` (`--no-tooltip: true` on the step mark),
`tests/state-popover.test.mjs`, `tests/state-tabs.test.mjs`,
`tests/tooltips.test.mjs`, `docs/current/design/DES-003-panel-ui.md`,
`RELEASE_NOTES.md`.

Negative scope: which icon-only controls have tooltips, hover-card content and
timing, styling, the model and permission segment and rail tick exemptions.

## Plan

Tests first: `controlUnder` cases, the pin glyph title, the `--no-tooltip` rule
map entry for `.ai-agent-panel-step-mark`. Then the function, the host's
`pointerover` and `pointerenter` handling (the last `pointerover` target tells
`pointerenter` that the pointer is on an inner control), the glyph title and the
CSS rule. Rejected: hidden text in place of the step mark's `aria-label`, which
would change what screen readers hear for no gain.

## Run log

Rendering is checked by the orchestrator's headless harness: pointer on
`.ai-agent-panel-tab-close` gives no hover card and a "Close" tooltip (on) or
none (off); pointer on the pin glyph and on a step mark give no tooltip.
Evidence: `scratchpad/harness/hunt-054/*.json` (close button: no card, tooltip
on and off; pin glyph and step marks: no tooltip; column row controls keep
their tooltips). The host wiring (`pointerover`, `pointerenter`) is covered by
the harness only; the decisions (`controlUnder`, `returnedFromInner`) have unit
tests.

## Independent review

Reviewer: independent review agent, with headless-harness evidence. Approved
with changes:

1. Major: the card re-armed on any pointer movement inside an attached element
   while idle (a card closed by Escape came back on moving within the
   segment). Fixed: `returnedFromInner` arms only on a return from an inner
   control; unit test fails for the broad version.
2. Minor: DES-003's transition table lacked the return row and the inner
   control. Fixed.
3. Minor: Run log cites the harness evidence and the harness-only wiring.
   Fixed.
4. Nit: DES-003 parenthetical moved next to "only when the pointer moved".
   Fixed.

## Outcome

accepted
