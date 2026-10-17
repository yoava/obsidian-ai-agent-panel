---
status: closed
release: r07-mock-fidelity
number: 073
prd: PRD-001.R11
---

# TASK-073 — Keep the final board and panel pairs as evidence

## Spec

Governing: [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md); the
boards' "Redesign dark" and "Redesign light" pages win over SPEC.

Acceptance:

1. Every board on both pages that has a panel counterpart (26 per page) has one
   composite (board | panel) per theme under
   `docs/records/verification/2026-10-13-r07-mock-fidelity/`, palette-quantized, at most
   8 MB in total.
2. `measured.json` there holds, per board, the pixel-diff share and the measured
   geometry and colours of the composer, status line and header on both sides.
3. `docs/records/verification/2026-10-13-r07-mock-fidelity.md` gives date, commit,
   method and the table board, diff, verdict; each deviation names the record or
   decision that accepts it, or is marked open.
4. No local path, user name or vault content in the note or the JSON.

## Scope

Expected files: the folder, the note, this task.

Negative scope: no `src/`, `styles.css`, test or other documentation change; no
protected path. Open differences are listed, not fixed.

## Plan

Harness pair per board and theme (board and panel rendered at the board's size, same
state), transcript scroll aligned by minimum diff, key values read from both DOMs,
composites joined and quantized with Pillow. Rejected: a diff map in each image
(a third panel adds a third of the bytes).

## Run log

- Measured at `20c0472` (after task 074); 52 composites, 2.9 MB.
- Not paired: WorkflowView (no component). Tooltips is paired but not comparable: the
  board is a specimen sheet of static tooltips, the panel shows one live tooltip.
- Review follow-up, each item checked in the harness DOM. Fixture or frame: Question chips
  and clipped footer (footer reachable by scrolling), Empty "usage unavailable", the
  "no due date" tint (markup the board authors by hand), tab strips on the Slash and Pop
  frames, PopModel popover height (4 stub models against 6), composer focus (capture
  focuses it), Responsive header (captured now with Conversation tabs Automatic: 11.8
  against 12.2 px), Settings PNG width (680 board frame against the 678 modal clip).
  Accepted: Question "Other…" (065), word highlights (065), focus ring size (063), Empty
  hero position (074), light accent (decision). Open: Question Sections legend and
  spacing, Empty hero icon, PopModel footer text (note, Open differences).
- Composer, status line and header buttons sit at the boards' offsets (header 0.5 px).
- Evidence only, not user-visible: no `RELEASE_NOTES.md` entry.

## Independent review

Independent reviewer, verdict approve with changes. Findings and resolution:

1. Question differences unclassified: each checked in the DOM; footer reachable by
   scrolling (frame), chips (fixture), "Other…" (accepted, 065); the legend and spacing
   are open, routed to task 075.
2. Empty hero icon and "usage unavailable": status line is a stub fixture; the icon is
   open, routed to the owner's decision list.
3. "no due date" tint: fixture (hand-authored board markup, no Markdown form).
4. Tab strips and PopModel popover height: frame and stub data (4 models against 6); the
   footer text difference is open, routed to task 075.
5. Approve word highlights and composer focus ring: accepted (065, 063); focus presence
   is the capture's.
6. Responsive header and Settings width: re-captured with Conversation tabs Automatic
   (11.8 against 12.2 px); 678 against 680 px is the modal clip.
7. "known" entries without a record and nits: each now fixture, frame, accepted or
   open; claim on line 31 restricted; the Narrow caption and wording nits fixed.

## Outcome

accepted
