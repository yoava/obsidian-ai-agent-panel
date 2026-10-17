---
status: closed
release: r07-mock-fidelity
number: 082
prd: PRD-001.R7
---

# TASK-082 — Conversation tabs as picture cards under Appearance

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M. Owner request of 2026-10-13: the conversation tabs setting belongs
under Appearance and shows thumbnails for its options, like "Theme" and
"Prompt style".

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R7 (the three placements; unchanged), R25;
[DES-003](../../../current/design/DES-003-panel-ui.md) Settings that reach the
panel; [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
Tokens.

Acceptance:

1. "Conversation tabs" sits under "Appearance", after "Theme", before "Show
   tooltips"; it is no longer in the first group.
2. It is a radio group of three cards, Top ("strip above"), Side ("column
   beside"), Automatic ("by panel width"), drawn by the function that draws the
   Theme and Prompt style cards; the card matching the stored value is
   selected; choosing one stores `top`, `side` or `auto` and re-lays out open
   panels as the dropdown did.
3. Previews are decorative (`aria-hidden`), drawn from DOM and existing tokens
   in both palettes; Top shows a tab strip over three lines, Side a tab column
   beside them, Automatic both halves side by side.
4. Keyboard and screen reader behaviour is the Theme cards': shared radio
   name, arrow keys, focus ring, name and caption announced.
5. Both renderers (Obsidian 1.13 definitions, `renderLegacy`) draw it, as they
   share `groups()`.

## Scope

Expected files: `src/settings-core.ts` (`TAB_POSITION_CARDS`),
`src/settings.ts` (row moved, previews), `styles.css`,
`tests/settings-core.test.mjs`; docs: DES-003, `RELEASE_NOTES.md`.

Negative scope: no change to layout behaviour, defaults, thresholds, stored
values or the description's meaning; no new token; PRD and README name no
location for the control, so neither changes; no tab-strip code (078).

## Plan

Test first: the cards' names, captions and order. Then move the row, add
`drawTabsPreview` beside the Theme preview, and the preview rules beside the
Theme card rules. Alternative rejected: a second card component for tabs;
`drawRadioCards` already takes any `RadioCard<T>`.

## Run log

- Fresh worktree sat on main; switched to the base branch first.
- Writing a helper script under the scratchpad was refused by the
  protected-path hook; the edits were made with the edit tool instead.

## Independent review

Reviewer: independent review agent. Verdict: approve; a harness run confirmed
the row under Appearance after Theme, three cards, the stored value selected,
no overflow at 300 px, arrow keys with a focus ring, and each choice
re-laying out an open panel.

Findings:

1. Nit: a test title claimed "only Automatic says what decides" without
   asserting it. Fixed: the title drops the claim.
2. The row description repeated what the cards show. Fixed: one sentence
   ("Where the open conversations are listed. Automatic uses the side column
   whenever the panel is wide enough for one."); DES-003 does not quote it.

## Outcome

accepted
