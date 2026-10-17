---
status: closed
release: r08-settings-redesign
number: 132
prd: PRD-001.R39
---

# TASK-132 — No breadcrumb above the settings bar

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`, owner decision 31 ("ok, so remove the breadcrumb"): the page
drew "Settings → AI Agent Panel" through a CSS `::before`, copied from the
boards, which draw the settings window's own chrome. Obsidian's sidebar
already marks the plugin, and no other plugin draws one. Governing:
[DES-001](../../../current/design/DES-001-system-overview.md) settings page
(names no breadcrumb).

Acceptance: no breadcrumb on 1.13+ or pre-1.13; the 20 px room above the bar
stays, and the bar still sticks flush at the top.

## Scope

Expected files: `styles.css`.

Negative scope: no other spacing, no DOM change; `tests/styles.test.mjs`
untouched.

## Run log

- Settings harness, 460 px and 720 px, light: before, the breadcrumb and 14 px
  under it; after, the search field 20 px below the top. `make verify` OK.

## Independent review

Size S, CSS only: the orchestrator compared the shots. Real Obsidian: the
owner's manual check.

## Outcome

Done.
