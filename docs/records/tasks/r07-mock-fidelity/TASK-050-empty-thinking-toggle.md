---
status: closed
release: r07-mock-fidelity
number: 050
prd: PRD-001.R15
---

# TASK-050 — No expand control on an empty thinking block

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A "Thinking…" pill showed a chevron and a button that opened nothing. Claude
Code can stream thinking blocks whose text is empty (redacted, or summaries
off), and while one streams its text may not have arrived yet.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R15; [DES-003](../../../current/design/DES-003-panel-ui.md) Turn head,
thinking and footer.

Acceptance:

1. A thinking block whose text is empty or whitespace shows its label
   ("Thinking…", "Thought for Ns", "Thought process", unchanged) as plain
   text: no button, no chevron, no `aria-expanded` or `aria-controls`, not
   focusable, nothing to expand. It keeps its place, the head slot when it is
   the turn's first block.
2. When text arrives by delta, the same label becomes the usual toggle with
   its chevron, collapsed.
3. A block with text is unchanged: a button with `aria-expanded` and
   `aria-controls`, chevron, expand and collapse.
4. The decision is an Obsidian-free function (`thinkingExpandable`), tested.
5. Rendered, in the orchestrator's headless harness: for an empty block no
   `.ai-agent-panel-turn-thinking-chevron` and no `button`, `aria-expanded` or
   `aria-controls` in the thinking element or head slot; a non-empty block
   unchanged; after a first delta the chevron and button appear.

## Scope

Expected files:

- Changed: `src/state/turn.ts` (`thinkingExpandable`), `src/ui/turn.ts` (the
  label drawn as button or plain span), `styles.css` (the hover rule scoped
  to `button`), `tests/state-turn.test.mjs`; DES-003 (Turn head, thinking and
  footer; test map); `RELEASE_NOTES.md`.

Negative scope:

- No restyling of the pill beyond dropping the hover and the chevron on the
  plain label; no change to the labels' wording.
- No change to recording or export of thinking (an empty block stays
  unrecorded, as `tab/chat-tab` `finishThinking` does); the one touch is that
  `finishThinking` now asks `thinkingExpandable` instead of `text.trim()`, with
  no behaviour change.
- No other block kind; no edit to `tests/styles.test.mjs`,
  `tests/architecture.test.mjs` or any protected path; no new dependency.

## Plan

- Test first: `thinkingExpandable` is missing, so the new test fails.
- `ui/turn` draws the label through one method that builds the button (chevron,
  `aria-expanded`, `aria-controls`, click) or a plain span from the text node's
  current data, and swaps the element in place when that changes. It runs at
  creation, on every redraw, and from `appendDelta` while the block is not yet
  expandable, so the first delta is one extra check, not a redraw.
- The plain label keeps the class `ai-agent-panel-turn-thinking-toggle` for
  the pill's layout; the hover rule is scoped to `button` so it does not
  invite a click.
- Rejected: always a button, disabled while empty (still announced as a
  control, still focus-stop-adjacent, chevron still needs hiding).

## Run log

- Tests first: before `thinkingExpandable` existed the new test failed on the
  missing export.
- The DOM facts of acceptance 5 cannot run in plain Node; they are owed to
  the orchestrator's headless harness.
- Owed to the orchestrator's r07 harness record too: the plain span's height,
  line-height and alignment against the 22 px button pill, and that it has no
  hover background.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

- Minor: each button build registered a new click listener, leaking on
  text, blank, text. Resolved: the button and the plain span are each built
  once per block (`buttonEl`, `plainEl`) and swapped.
- Nit: `thinkingExpandable` trimmed the text, copying it on every draw.
  Resolved: `/\S/.test(text)`.
- Nit: `finishThinking` repeated the blank check. Resolved: it uses
  `thinkingExpandable`.
- Accepted: a focused button whose text turns blank drops focus (rare); the
  plain span keeps the `-toggle` class.

## Outcome

accepted. A focused toggle that turns blank loses focus; accepted as rare.
