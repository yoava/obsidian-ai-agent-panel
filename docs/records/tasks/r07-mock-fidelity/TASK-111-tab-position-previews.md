---
status: closed
release: r07-mock-fidelity
number: 111
prd: PRD-001.R7
---

# TASK-111 — Conversation tabs previews show the layouts

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The three "Conversation tabs" cards drew a hint (three bars and lines) of where
the tab list sits. They now draw board TabThumbB (SPEC §4.6, D20, option B): a
textless miniature of the panel, grey except where the conversations are
listed, which takes the accent.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7; [DES-003](../../../current/design/DES-003-panel-ui.md) Settings that reach
the panel; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
(tokens only).

Acceptance:

1. Top: a strip of three tabs above a prompt, reply lines and the composer.
2. Side: the same transcript with the column on the right: a new button, the
   active row with a working dot, a waiting row, two more.
3. Automatic: a narrow panel with the strip, an arrow labelled "wider", a wide
   panel with the column; "narrow" and "wide" under the panels.
4. The tab strip, column, tab and row bars, new button and active tab or row
   take the accent; everything else is grey; both Obsidian modes.
5. Names, captions, selection, the radiogroup and the stored values are
   unchanged; each preview stays `aria-hidden`.

## Scope

Expected files: `src/settings.ts` (`drawTabsPreview`, `drawMiniPanel`),
`styles.css` (the `ai-agent-panel-mini-*` rules replace the `tabs-*` ones),
DES-003 (the cards' description), `RELEASE_NOTES.md`.

Negative scope: the setting's behavior, captions, other settings cards, the
panel itself, protected tests. UI only; no Obsidian-free logic to extract, so
no unit test; the board check below is the evidence.

## Plan

Draw with `createDiv`/`createSpan` and the existing panel tokens (the cards sit
in their own `ai-agent-panel-scope`, so the board's tokens are already the
palette): `bg`, `line-strong`, `fill`, `track`, `surface`, `accent-soft`,
`accent-line`, `accent-text`, `amber`. Verify in the r07 harness against
TabThumbB, light and dark, at 700 and 1000 px.

## Run log

- Base worktree sat on main; switched to `chore/agentic-sdlc`.
- First render clipped Automatic: the base rules `.style-preview > :nth-child(n)`
  gave the arrow and the wide panel percentage widths; reset for `mod-tabs`.

## Independent review

Independent review agent: approve. The cards are 190 px wide in the plugin
(the owner's wider cards are display zoom), so the previews keep the board's
proportions. Applied from the review: panel widths as percentages of the
preview (Top 60 %, Side 94 %; the Automatic pair 31 % and 46 %, since the
board's 36 % and 52 % clip at this width), the board's panel shadow (light
only: the dark theme's `mono` token is white and the board's shadow does not
show on its ground), and an all-round accent ring on the strip and column.
Board check after the fixes, light and dark at 700 and 1000 px: matches
TabThumbB. Under RTL the arrow still points right. `make verify` exit 0.

## Outcome
