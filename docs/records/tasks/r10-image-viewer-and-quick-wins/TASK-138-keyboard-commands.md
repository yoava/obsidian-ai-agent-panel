---
status: closed
release: r10-image-viewer-and-quick-wins
number: 138
prd: PRD-001.R1
---

# TASK-138 — Commands for the prompt box, Stop and the tabs

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `feat`, the owner's AAP-5, requirement delta CHG-023: "Focus prompt
box", "Stop Claude's turn", "Next conversation tab" and "Previous conversation
tab", no default hotkeys; a command that cannot act is not offered
(`checkCallback`). With several panels, the focused one, else the first.

Acceptance: the PRD-001.R1 statements CHG-023 adds; `stepTab` tests.

## Scope

Expected files: `src/main.ts`, `src/view.ts`, `src/state/tabs.ts`,
`tests/state-tabs.test.mjs`, PRD-001, DES-001, `README.md`, CHG-023,
`RELEASE_NOTES.md`.

Negative scope: Allow and Deny keys on permission cards; default hotkeys.

## Plan

`stepTab` in `state/tabs` steps through `stripOrder` (pinned first), wrapping
as Obsidian's "Go to next tab" does (decision 10). `main.ts` `onPanel` holds
the shared check-then-act; `panelLeaf` picks the focused view, else the first,
and `activateView` uses it too. "Focus prompt box" is `activateView` under the
name a hotkey search finds (decision 8).

## Run log

- Panel harness (`probe-138.mjs`; the scratch harness copy records
  `addCommand`), tabs Alpha, Beta (pinned), Gamma (busy), Alpha active:
  offered stop no, next and previous yes; next: Gamma, Beta (wrap), Alpha;
  previous: Beta, Gamma (wrap); on Gamma Stop is offered; "Focus prompt box"
  focuses the composer. One tab: none of the three offered.
- `make verify` OK.

## Independent review

Size S: the harness run above; the owner checks hotkeys in a vault.

## Outcome

Done.
