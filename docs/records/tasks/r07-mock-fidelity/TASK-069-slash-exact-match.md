---
status: closed
release: r07-mock-fidelity
number: 069
prd: PRD-001.R19
---

# TASK-069 — An exact slash command wins Enter

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Typing `/usage` and pressing Enter ran `/extra-usage`: the slash list's first
(selected) row was the best fuzzy score, not the command named as typed.
Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R19; [DES-003](../../../current/design/DES-003-panel-ui.md) Suggests.

Acceptance:

1. With `/usage` typed, `usage` is the first and selected row; Enter inserts it.
2. The exact match ignores case and holds for panel and Claude Code commands.
3. After it come names the typed text prefixes, then the other fuzzy matches by
   score. The group holding the exact match is listed first; groups stay
   contiguous. With no exact match the order is unchanged.
4. The `@` list is unchanged.

## Scope

Expected files: new `src/state/slash-rank.ts` and
`tests/state-slash-rank.test.mjs`; `src/suggest.ts` (`search` calls the
ranking); `package.json` (`pretest`); `RELEASE_NOTES.md`; DES-003 Suggests.

Negative scope: no change to the list's look (064), to what Enter does when the
list is closed, or to fuzzy matching beyond putting the exact match first; no
change to the `@` list.

## Plan

Move the ordering out of the Obsidian-bound `SlashCommandSuggest.search` into a
pure `rankSlash` taking the fuzzy scorer as a parameter, so plain Node tests
cover it. Tests first, then the module. Rejected: a global exact-first sort
(would split a group and repeat its header).

## Run log

Tests written first and failed on the missing module.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

- Finding: the first test used a shortness scorer, so it passed on the old
  group-then-score order. Resolution: it now uses a score table
  (`extra-usage` 5, `usage-credits` 3, `usage` 1) that lists `usage` last under
  the old order and first under `rankSlash`.
- Reviewer's harness: `/usage`, `/clear`, `/context`, `/mcp` exact first and
  selected, Enter inserts and closes, `/Usage`, group headers contiguous for
  `/us /co /re /c /s`, `@` list unchanged. The Claude Code group leading is
  covered by the unit test only.

## Outcome

accepted
