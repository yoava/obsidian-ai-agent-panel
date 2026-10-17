---
status: closed
release: r08-settings-redesign
number: 133
prd: PRD-001.R25
---

# TASK-133 — Narrow settings rows stack as Obsidian's do

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`, reported by the owner with screenshots: in a narrow settings
window, "Claude CLI path" and "Default permission mode" showed their name and
description a word wide ("Cl… CLI pa…"). Below a 400 px container Obsidian
stacks every plain row, name over a full-width control; the page undid that
to keep the board SettingsNarrow's side-by-side rows, so a wide control (a
path with Detect, "Auto-approve everything") took nearly all the width. The
owner ranks compatibility over the boards for the settings screens.

Acceptance: below 400 px every plain row stacks as Obsidian draws it; the
cards share their line, the chip keeps its mark and count, and the section
links wrap three and three, as before.

## Scope

Expected files: `styles.css`.

Negative scope: no wide-layout change; no DOM change; `tests/styles.test.mjs`
untouched.

## Run log

- Settings harness, 360 to 560 px, light, with a long CLI path and
  "Auto-approve everything": before, at 400 px "Default permission mode" had
  a 125 px name column and "Claude CLI path" one word wide; after, both stack
  with a 336 px name and the control below. `make verify` OK.

## Independent review

Size S, CSS only (a removal): the orchestrator compared the shots. Real
Obsidian: the owner's manual check.

## Outcome

Done. The SettingsNarrow board's side-by-side rows are no longer matched.
