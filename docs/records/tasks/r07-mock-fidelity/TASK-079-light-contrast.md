---
status: closed
release: r07-mock-fidelity
number: 079
prd: PRD-001.R28, PRD-001.R34
---

# TASK-079 — Light-mode text colours reach 4.5:1

## Spec

Owner decision 2026-10-13: each text colour that fell below 4.5:1 on its
background is moved just enough in lightness (hue and saturation kept) to reach
it, and the contrast test stops exempting pairs. Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R28,
R34; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Palettes
and mode; [DES-003](../../../current/design/DES-003-panel-ui.md) Token contract.

Acceptance:

1. Light: `text-faint` #666670, `ok` and `added` #147c49, `error` and `removed`
   #c83534, `warning` #a55808, `amber-text` #915506; dark: `text-faint`
   #96969f. Soft fills, lines and every other token are unchanged.
2. `tests/palette.test.mjs` finds no pair below its minimum in either palette
   and has no known-exception list.

## Scope

Expected files: `styles.css` (the two palette blocks), `tests/palette.test.mjs`
(`KNOWN_BELOW` removed, as the owner decision authorises),
`docs/current/design/DES-003-panel-ui.md`, `docs/current/DEVELOPMENT.md`,
`RELEASE_NOTES.md`.

Negative scope: soft fills and lines, the accent, the focus-ring ratios,
`tests/styles.test.mjs`, `tests/architecture.test.mjs`, any other palette token.

## Plan

Per colour, step HSL lightness by 0.1 point until every pair it appears in
reaches 4.5:1, then empty the exception list in the test. Rejected: darkening
the soft fills too (changes more than the text).

## Run log

A scratch script could not be written under the scratchpad (protected-path
hook); the search ran inline with `node -e`.

## Independent review

Independent review agent: approved. Recomputed every contrast at 4.5:1 or
more, hue kept, only the seven token values changed, and a headless harness
showed a recolour-only diff on the Main, Approve, Commands and Quiet light
boards. Nits (release-note prefix and blank line) fixed. Noted, out of scope:
status text on soft fills over `bg-recessed` and `fill` measures 4.1 to 4.3,
and was so before this task.

## Outcome

accepted
