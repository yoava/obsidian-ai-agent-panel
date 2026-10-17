---
status: closed
release: r07-mock-fidelity
number: 115
prd: PRD-001.R38
---

# TASK-115 — The pinned prompt of a dimmed section is opaque

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Bug in task 105's dim, found in review. `.is-before-clear` set opacity .42 on the
whole section; the pin is a child of it and takes no room, so its band hangs over
the next, undimmed section and that content (the `/clear` echo) shows through.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38, R33; [DES-003](../../../current/design/DES-003-panel-ui.md) Dimmed and
folded segments.

Acceptance:

1. With a dimmed section's prompt pinned over the next section, the pin's band is
   opaque: `elementFromPoint` over the echo returns the band, and the echo is not
   visible through it.
2. The pinned prompt looks as the in-flow dimmed prompt does (.42) and rises to
   .75 on hover and focus within, as before.

## Scope

Expected files: `styles.css`; DES-003 (how the dim is applied).

Negative scope: no change to the fold, the dim strength, or which sections dim;
no `RELEASE_NOTES.md` line (task 105's entry is still Unreleased).

## Plan

Dim the section's children except the pin, and dim the pin's bar on its own;
same hover and focus-within raise. Rejected: an opaque background on the section
(it would paint the dimmed content at full strength over the panel).

Verification: the pin probe at 440 px, dark and light, before and after;
`make verify`.

## Run log

- Probe before: pin effective opacity .42, the echo showed through. After: pin
  chain 1, hit over the echo is `prompt-pin-band`, bar dimmed on its own.
- `tests/styles.test.mjs` needs no change.

## Independent review

Independent review agent: approve. Four dimmed sections and a fold, 440 px,
dark and light: every direct child of a dimmed section measures .42 and only
the pin's band stays at 1; the pinned prompt matches an in-flow dimmed prompt
within one colour level; hover on the pin or an in-flow prompt and keyboard
focus raise the children and the bar to .75; the `/clear` bubble no longer
shows through. `make verify` exit 0.

## Outcome

Done.
