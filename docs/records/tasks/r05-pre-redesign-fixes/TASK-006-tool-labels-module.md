---
status: closed
release: r05-pre-redesign-fixes
number: 006
prd: PRD-001.R16, PRD-002.R12, PRD-004.R10
---

# TASK-006 — Tool labels module

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A refactor with no behavior change. `src/export.ts` imports `src/view.ts` for
`summarizeToolInput`, against rule A4 (only `main` imports `view`). The
functions that name and summarize a tool call move to a pure `src/tool-labels.ts`
that `view` and `export` both import, and a plain-Node test pins them.

Governing:
[DES-001](../../../current/design/DES-001-system-overview.md) (A2, A4, A12, the
Components table),
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) (E3),
[DES-006](../../../current/design/DES-006-vault-tools.md) (Consent, F3),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Card contract, AskUserQuestion form), PRD-001.R16, PRD-002.R12, PRD-004.R10.

Acceptance:

1. `src/tool-labels.ts` imports nothing, `obsidian` included, and exports
   `summarizeToolInput`, `toolDisplayName`, `obsidianToolPrompt`,
   `parseAskUserQuestions`, the `UserQuestion` type and the server names
   `OBSIDIAN_MCP_SERVER` and `CHROME_MCP_SERVER`.
2. `src/view.ts` and `src/export.ts` import them from `./tool-labels`;
   `src/export.ts` no longer imports `./view`, and `view` exports nothing but
   `AgentPanelView` and `VIEW_TYPE_AGENT_PANEL`.
3. Moved code unchanged apart from `export`; a module header added.
4. `tests/tool-labels.test.mjs` pins the current output of each moved function
   and passes; `src/tool-labels.ts` is in `pretest`.
5. `make verify` passes.
6. The plan's backlog item, the DES-003 draft's C5 row and the docs below say
   what the code now does.

## Scope

Expected files:

- `src/tool-labels.ts`, `tests/tool-labels.test.mjs` (new); `src/view.ts`
  (moved code removed, import added), `src/export.ts` (import), `package.json`
  (`pretest`)
- `docs/current/design/DES-001-system-overview.md` (Components row),
  `docs/current/design/DES-004-permission-and-change-control.md` (Modules row),
  `docs/current/DEVELOPMENT.md` (test table), `docs/current/plan.md` (backlog
  items), `docs/work/design/DES-003-transcript-and-panel-ui.md` (draft, C5),
  `RELEASE_NOTES.md`

Negative scope:

- No behavior change: summaries, display names, card titles and the
  AskUserQuestion parse return what they returned.
- The vault-tool card naming `path` (PRD-004.R10; the code prefers `file_path`)
  and the ExitPlanMode plan on the card (PRD-002.R17): a later task. The test
  pins today's `file_path`-first choice for that task to change.
- `toolIcon` stays in `view`; it is not part of DES-001's `tool-labels` job.
- `export.ts`'s type import of `AgentPanelSettings` from `./settings` (E3
  names `settings-core`): untouched.

## Plan

- `view.ts` imports `obsidian`, so the pinning tests cannot run before the
  move. Cut the code out of `view.ts` unchanged, add `export`, then write the
  tests against the built module and kill them with mutations of it.
- `OBSIDIAN_MCP_SERVER` and `CHROME_MCP_SERVER` move with their consumers
  (`obsidianToolPrompt`, the server labels); `view` imports them for the MCP
  registration and `toolIcon`.
- Verification: `make verify`.

## Run log

- The worktree was created from 0.4.0, before the docs layout; fast-forwarded
  to `fad1022`.
- Eight of nine mutations of the built module (summary cut length,
  `multiSelect === true`, the `patch` test, the Chrome label, the `file_path`
  preference, the repeated-prefix rule, the two `parseAskUserQuestions` empty
  checks) failed a test; the ninth changed nothing.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Gap: nothing pinned the `startsWith` prefix guard in `obsidianToolPrompt`
   (a same-length lookalike server). Fixed: test added, fails with the guard
   removed.
2. Gap: no rejected AskUserQuestion case mixed a valid and an invalid option.
   Fixed.
3. Stale: the plan's PRD-004.R10 item cited `src/view.ts` line numbers.
   Fixed: it cites `obsidianToolPrompt` in `src/tool-labels.ts`.
4. Stale: DES-004's `tool-labels` row and the module header did not mention
   the AskUserQuestion parse. Fixed.
5. Nit: acceptance 3 said the moved code was identical, though a header was
   added; PRD-003.R13 in the front matter has no pinned behavior. Fixed.
6. Nit: task number. Fixed: 006.

## Outcome

`export` no longer imports `view`: the tool labels live in the pure
`tool-labels` module, pinned by characterization tests, and `export` takes
its settings type from `settings-core` (DES-005 rule E3), added at landing.
No behavior change.
