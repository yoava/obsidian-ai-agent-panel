---
status: closed
release: r07-mock-fidelity
number: 046
prd: PRD-001.R32, PRD-001.R33
---

# TASK-046 — Floating layers above sticky ones

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Owner screenshots (Obsidian 1.14.4): a tab's hover card draws under the
pinned prompt bar; a tab's card stays up while the pointer is over another
tab. Cause: `.ai-agent-panel-layer` had no z-index, so the sticky pin (z 3)
and the rail (z 4) drew over it; a card shown by keyboard focus ignored the
pointer until blur.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R32 (popovers, hover cards), R33 (pinned prompt, jump rail);
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) (state machines in
Obsidian-free modules); [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
(token block); [DES-003](../../../current/design/DES-003-panel-ui.md) Layout
model, Popover and hover card, Token contract.

Acceptance:

1. Every z-index in `styles.css` reads a `--ai-agent-panel-z-*` token from the
   token block; the floating layers (the layer, which holds popovers and hover
   cards, and the suggests) sit above every sticky or positioned element; no
   ancestor of a floating layer starts a stacking context by a declaration
   (the `container` shorthand on the root and main column may, harmlessly:
   the main column encloses every floating layer, the pin and the rail).
   `tests/layers.test.mjs` fails otherwise and proves it fires.
2. A tab's hover card draws over a pinned prompt; a popover draws over the
   jump rail (harness: `elementFromPoint` at the card's or popover's centre
   and corners returns it).
3. A card, armed or shown by pointer or by focus, goes as soon as the pointer
   reaches another control of the panel (a hover-card element, a button, a
   tab, a segment, a row); its own element's descendants count as itself. A
   `pointerover` without pointer movement (a scroll, a content change) reaches
   no control. PRD-001.R32 amended by change 004. Unit tests in
   `tests/state-popover.test.mjs`.

## Scope

Expected files:

- `src/state/popover.ts` (the `control` event, `pointerMoved`), `src/ui/hover-card-host.ts`
  (one `pointerover` listener on the panel root reporting the control),
  `src/view.ts` (passes the root), `styles.css` (z tokens, the layer's
  z-index, every z-index on a token).
- Tests: `tests/state-popover.test.mjs`, new `tests/layers.test.mjs`.
- Docs: DES-003 (Layout model stacking bullet, hover-card table row and rule,
  Token contract row), PRD-001.R32 (the focus clause),
  `docs/records/changes/CHG-004-hover-card-pointer-close.md` (the delta, closed
  as incorporated), `RELEASE_NOTES.md`.

Negative scope: no restyling; no tooltip or aria-label changes (049); no
status-bar work (047); no icon work (048); no edit to
`tests/styles.test.mjs` or `tests/architecture.test.mjs`.

## Plan

- Tests first: hover-machine cases for `control` (plain control, another
  card's element, its own element, idle, blocked) and for `enter` dropping a
  focus card; the stacking check over `styles.css` with a self-test on
  synthetic CSS.
- Machine: `control` with an element other than the card's goes idle from
  armed or shown (either cause); `enter` on another element arms it even
  from a focus card. The host resolves the control as the nearest attached
  ancestor, else the nearest interactive element (`closest`).
- CSS: tokens `-z-sticky` 1, `-z-pin` 2, `-z-rail` 3, `-z-float` 4; the
  layer and the suggests take `-z-float`.
- `tests/layers.test.mjs` reuses `parseRules` from `tests/styles.test.mjs`
  rather than copying it; importing that file reruns its 3 tests in this
  file's process. Moving `parseRules`, `splitList` and `compounds` into a
  shared `tests/css-rules.mjs` edits `tests/styles.test.mjs`, which this task
  may not touch: an owner decision. `ANCESTORS` in the test is kept by hand.
- Rejected: a z-index per popover and hover card (they draw inside the layer,
  whose z-index is what competes); `pointerleave` on each attached element
  only (misses non-card controls and the focus case).
- Verify: `make verify`.

## Run log

- The worktree branch started at `main`; fast-forwarded to
  `chore/agentic-sdlc` before any change.
- The rail ticks' text tooltips are Obsidian's (`setTooltip`), drawn outside
  the panel; nothing to stack.
- Acceptance 2 (`elementFromPoint`: card over the pin, popover over the rail)
  is owed to the orchestrator's r07 harness verification record; no
  automated test here renders the panel.
- Residual: the moved check compares with the last `pointerover`, so a
  scroll after the pointer moved within one element still counts as a move.

## Independent review

Reviewer: independent review agent; verdict approve with changes, `make verify`
exit 0 on the reviewed tree.

- Major: PRD-001.R32 said a focus card shows "until focus leaves". Resolved:
  R32 amended through change 004, closed as incorporated in this commit.
- Minor: a focus card could close with no pointer movement (boundary events
  after a scroll or content change). Resolved: `pointerMoved` in
  `state/popover`, unit-tested; the host dispatches `control` only on a move.
- Minor: `parseRules` import reruns the styles tests. Kept (editing
  `tests/styles.test.mjs` is not authorised here); recorded in the Plan as an
  owner decision.
- Minor: acceptance 2 has no automated evidence. Recorded in the Run log as
  owed to the r07 harness record.
- Nits: the `container` shorthand's possible stacking context is now stated
  as harmless in the test and DES-003, and `ANCESTORS` noted as hand-kept;
  the listener returns before `controlAt` while idle or blocked. Resolved.

## Outcome

Accepted. Candidate gate: move the CSS rule parser into a shared
`tests/css-rules.mjs` (owner decision).
