---
status: closed
release: r07-mock-fidelity
number: 077
prd: PRD-001.R25
---

# TASK-077 — Conversation tabs default to Automatic

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S. Owner decision of 2026-10-13: "Conversation tabs" defaults to
Automatic for new installs (the redesign canvas, CE2, shows the column at
width); a stored choice is kept.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R25 (the defaults clause), R7 (Automatic's thresholds);
[DES-003](../../../current/design/DES-003-panel-ui.md) Tabs and conversation
column; [ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md).

Acceptance:

1. `DEFAULT_SETTINGS.tabPosition` is `auto`; settings with no stored value
   load as `auto`, as does a stored value outside the three choices.
2. A stored `top`, `side` or `auto` loads unchanged.
3. With no stored value the panel shows the column at 820 px wide or more and
   the strip below.

## Scope

Expected files: `src/settings-core.ts` (default), `src/view.ts` (fallback reads
the default), `tests/settings-core.test.mjs`; docs: PRD-001 R25, DES-001
defaults line, DES-003 strip-or-column row, `README.md`, `RELEASE_NOTES.md`.

Negative scope: no layout change, no migration of stored values, no change to
the choices or their labels.

## Plan

Test first: the default and the invalid-value fallback. Then the one-word
default change and the `?? "top"` fallback in `view`. `make verify`.

## Run log

- A fresh worktree sat on main; switched to the base branch first.

## Independent review

Reviewer: independent review agent. Verdict: approve.

Findings:

1. Minor: the release note said "a choice you already made is kept"; an
   install that persisted the old default `top` keeps Top. Fixed: the note
   says stored settings are unchanged.
2. Minor: the commit body cites the owner decision of 2026-10-13. Done.
3. Nit: the record was unfilled. Filled.
4. Nit: close the task. Done with `make close`.

Harness facts to assert: 1040 px wide shows the column; 680 px shows the
strip; 820 px enters the column and 780 px leaves it (hysteresis); the
"Conversation tabs" dropdown shows Automatic on a fresh install.

## Outcome

accepted
