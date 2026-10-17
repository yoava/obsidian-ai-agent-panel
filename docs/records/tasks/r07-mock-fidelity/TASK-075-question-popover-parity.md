---
status: closed
release: r07-mock-fidelity
number: 075
prd: PRD-002.R12, PRD-001.R22
---

# TASK-075 — Question and model-popover parity

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Measured in the harness DOM against the Question and PopModel boards (dark and
light, the board's width).

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R12; [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R22;
[DES-003](../../../current/design/DES-003-panel-ui.md) Permission card and
question form.

Acceptance:

1. A question after the first has its divider above the legend (14 px of card
   gap, the 1 px line, 14 px), not on the legend; its legend sits 37 px above
   the first option's text, as on the board. The fieldset and legend are kept.
2. An option's description starts 19 px under its name (card 57 px).
3. The model popover footer reads "Applies from your next message · this
   conversation only" only if a model picked there applies to the current
   conversation only.

## Scope

Expected files: `styles.css` (`.ai-agent-panel-question`,
`.ai-agent-panel-question-option-text`); this task file.

Negative scope: other boards, tokens, DOM roles, `tests/styles.test.mjs`,
`tests/architecture.test.mjs`, the hero icon, the popover footer text.

## Plan

CSS only. The divider moves from the next fieldset's top border (which a
fieldset draws through its legend) to the bottom border of every fieldset but
the last, with 14 px padding above it. The option text column loses its 2 px
gap; the board's two lines sit flush. Verified with the harness
(`hunt-075/`); no unit test can see layout, and the style test is out of scope.

## Run log

- Item 3 not changed: a model picked in the popover is stored as `lastModel`
  and seeds every new conversation until the "Model" setting changes
  (PRD-001.R22; `src/view.ts`, `src/settings-core.ts`, seeded at `src/state/tab.ts:226`). "This conversation
  only" would be false.
- Measured, board | before | after (dark and light identical):
  - Sections chip top to first option text: 37.2 | 51.1 | 37.1.
  - Option card with description: 56.6 | 58.6 | 56.6; description 19 px under
    the name.

## Independent review

Independent reviewer: approve, no finding above nit. Re-measured the Question
board at 440 and 300 wide, dark and light; confirmed the fieldsets are the only
`fieldset` siblings, so `:last-of-type` holds; confirmed the model footer reading.

1. Item 3's reason should cite the seeding point: now cites `src/state/tab.ts:226`.
2. Independent review and Outcome were pending: filled here.

## Outcome

accepted
