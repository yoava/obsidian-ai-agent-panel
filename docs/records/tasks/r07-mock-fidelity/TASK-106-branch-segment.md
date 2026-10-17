---
status: closed
release: r07-mock-fidelity
number: 106
prd: PRD-002.R15
---

# TASK-106 — Branch reads its turn's segment and carries its title

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R15; [ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md)
Decision 1; [DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Branch.

After a clear (task 103) a conversation holds several sessions. Branch must
take the latest prompt from the session of the turn's segment, and its button
must carry the required title.

Acceptance:

1. `latestPrompt(messages, session)` takes a record without a session id as
   the session the first later clear or fresh start ended, else the asked
   session; it never returns a prompt of another segment.
2. The branch's reader of the source's latest prompt finds an open tab whose
   conversation holds the source in any segment, not only as its current
   session (`holdsSession`).
3. Every offered Branch button is titled and described "Branch from just before
   this turn, in a new tab" (its tooltip shows only below 360 px, as Restore
   files'); a disabled one keeps its reason.
4. The no-session Notice already reads "This conversation has no CLI session to
   branch from yet." (unchanged).

## Scope

Expected files: `src/state/branch-history.ts`, `src/view.ts`
(`recordedLatest`), `src/ui/turn.ts`, `styles.css`,
`tests/state-branch-history.test.mjs`, DES-003, DES-004, `RELEASE_NOTES.md`.

Negative scope: fork base, dimming and folding, Undo, `turnSource`, the
provenance verdicts, `src/tab/restore-branch.ts` (it already reads
`latestPrompt` through the shared function).

## Plan

Failing tests for `latestPrompt` over clear and fresh-start records and for
`holdsSession`; then the segment owner in `branch-history`, the tab search in
`view.ts`, and the title constant used by `ui/turn.ts` with a CSS modifier that
keeps Branch's tooltip at every width.

## Run log

2026-10-14: built tests first; review rework applied; `make verify`
exit 0 (1440+ tests).

## Independent review

Independent review agent: rework, small. Fixed: the always-on Branch tooltip
had no requirement behind it (PRD-001.R32 gives labelled buttons none), so it
is gone and the title is the button's name, shown as a tooltip only below
360 px; `recordedLatest` skips a tab whose segment yields no prompt and keeps
looking; tests for the cut after an ending clear, two clears and an id
recorded again after its clear; two whitespace typos. The segment logic and
`holdsSession` were found sound. Harness at 340, 440 and 600 px, dark and
light: the title and the label hiding below 360 px as specified; a disabled
Branch keeps its reason. `make verify` exit 0.

## Outcome

Done.
