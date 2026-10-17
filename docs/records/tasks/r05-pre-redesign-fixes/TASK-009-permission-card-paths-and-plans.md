---
status: closed
release: r05-pre-redesign-fixes
number: 009
prd: PRD-004.R10, PRD-002.R17
---

# TASK-009 — Permission card: the note it names, the plan it shows

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Two permission-card defects.

- A vault-tool card names `file_path` before `path`, so a model that adds a
  decoy `file_path` makes the card name a note the tool does not act on.
- ExitPlanMode's plan reaches the user only as JSON cut at 2000 characters
  inside "Full input".

Governing:
[PRD-004](../../../current/product/PRD-004-vault-tools.md) R10,
[PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R17, [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R17,
[DES-006](../../../current/design/DES-006-vault-tools.md) (Consent, F3),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Card contract), constitution *Inert rendering*.

Acceptance:

1. `obsidianToolPrompt` and `summarizeToolInput` read one table of the six
   vault tools (`mcp__obsidian__<tool>`). A title names the note in
   `input.path` (and `newPath` for rename, `query` for search) and no other
   key; with only a `file_path` or a non-string `path` it reads "a note".
2. A vault tool's summary is the one argument it acts on and nothing else:
   `path` for `obsidian_rename`, `obsidian_properties`, `obsidian_links` and
   `obsidian_open`; `query` for `obsidian_search`; none for `obsidian_active`.
   A blank or non-string argument gives an empty summary, whatever other keys
   the input carries.
3. Any other name keeps the existing summary order and gets no vault title: a
   tool of another server, `mcp__obsidian__` plus an unknown or inherited name
   (`obsidian_unknown`, `constructor`), and a name that is not a string.
4. `planOf(input)` in `src/tool-labels.ts` returns `input.plan` unchanged when
   it is a string with a non-blank character, else null.
5. On an ExitPlanMode permission card with a plan, the whole plan is rendered
   as Markdown through `renderMarkdown` (the PRD-001.R17 boundary, scoped to
   the tab) in a block above "Full input", with "Rendering the plan…" shown
   meanwhile. If rendering fails the block shows the plan as pre-wrapped plain
   text (`is-plain`). Tables in it scroll and carry borders as in a reply. A
   card with no plan is as before.
6. When the render settles and the user has not scrolled away from where the
   card was parked, the card is scrolled into view: from its top when it is
   taller than the message list, else to its bottom; otherwise nothing moves.
7. The plan's backlog items for both requirements are removed, a new one for
   ExitPlanMode's `allowedPrompts` is added, and DES-001, DES-004, DES-006 and
   DEVELOPMENT.md say what the code now does.
8. `make verify` passes.

## Scope

Expected files:

- `src/tool-labels.ts`, `tests/tool-labels.test.mjs`, `src/view.ts`
  (`handlePermissionRequest`, `fillPermissionPlan`), `styles.css`
- `docs/current/design/DES-001-system-overview.md`,
  `docs/current/design/DES-004-permission-and-change-control.md`,
  `docs/current/design/DES-006-vault-tools.md`,
  `docs/current/DEVELOPMENT.md`, `docs/current/plan.md`, `RELEASE_NOTES.md`

Negative scope:

- No change to the Full input preview, its 2000-character cap, the card
  buttons, or any tool other than the six vault tools and ExitPlanMode.
- No change to what the vault tools act on; only what the card and activity
  line say.
- The ExitPlanMode activity card and the exported note keep their summary
  line; the plan is not added there.
- `allowedPrompts` (granted by Allow, shown only in Full input) is a backlog
  item, not part of this task.
- `inert-markdown` is not touched.

## Plan

- Tests first in `tests/tool-labels.test.mjs`: replace the "(current)" test
  that pins the `file_path`-first title, add title and summary decoy tests and
  `planOf` tests; run them against the old module and record the failures.
- `tool-labels.ts`: a `Map` of the six tools, each with its subject argument,
  icon and title builder; `vaultToolOf(name)` (string-checked) serves the
  title and the summary; `planOf`.
- `view.ts`: `fillPermissionPlan(tab, card, el, plan)` mirrors
  `fillPermissionDiff`: the caller creates the empty block, the method adds the
  placeholder, parks the list at the bottom, renders with
  `renderMarkdown(tab, plan, el)`, falls back to `setText`, then scrolls the
  card into view if the list is still within `FOLLOW_BOTTOM_PX` of where it
  was parked. The card never waits on the render. `FOLLOW_BOTTOM_PX` replaces
  the literal 120 at its two other uses.
- Verification: `make verify`, then the manual checks below.

### Manual checks

Owed by the owner at the end of the release, in a desktop vault with a real
CLI; no verification record is written here.

1. A long ExitPlanMode plan: the whole plan shows rendered above "Full input",
   starting at its top; scrolling up while it renders leaves the list alone.
2. A short plan: the buttons are in view after it renders.
3. A plan with a fenced block, a `dataviewjs` block, inline code and an
   `![[note]]` embed or remote image: fences show as inert code, nothing runs
   or loads.
4. Forced render failure: in DevTools replace `MarkdownRenderer.render` from
   `require("obsidian")` with a function that throws, then trigger a plan: the
   plan shows as plain text with its line breaks.
5. A wide table in a plan scrolls sideways inside the card.
6. A vault-tool call with a decoy `file_path` (ask Claude to call
   `obsidian_open` with a `path` and a different `file_path`): the card, and
   the activity line after it, name the `path` note, and the tool opens it.
7. A tool of a lookalike server (`mcp__<other>__obsidian_open`) keeps its CLI
   title and the generic summary.

## Run log

- The worktree was created from `5d78c34`; `docs/work/tasks/` did not exist
  in it and was created.
- Tests first: five of the six new or changed tests failed against the old
  module (the two title tests, the summary test, both `planOf` tests); the
  lookalike-server guard passed, as it pins unchanged behavior.
- Eight mutations of the first version of the module (title reads `file_path`
  first, summary falls to the generic order, summary drops `query`, summary
  also reads `file_path`, summary prefix test loosened to
  `includes("obsidian")`, `planOf` without the blank check, with a trim, and
  coercing a non-string) each failed a test.
- Review round 1 changed the summary to one argument per tool. Tests first
  again: the five new or rewritten tests (note tools, search, active, unknown
  names, non-string names) failed against the first version.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Defect: a vault tool's summary read `path` then `query` for every tool, so
   a decoy `path` named `obsidian_search` and a `query` named a note tool.
   Fixed: one table gives each tool its one argument (search `query`, active
   none, the rest `path`), shared with the titles; tests for each.
2. Gap: the vault rule applied to every `mcp__obsidian__*` name, so an unknown
   tool lost the generic summary. Fixed: only the six known names, found
   through a `Map` (so `constructor` finds nothing); tested.
3. Gap: the non-forced scroll after the render never followed the grown card,
   and its comment said it did. Fixed: the list is parked, and the card is
   scrolled into view after the render only if the user has not scrolled away,
   from its top when taller than the list.
4. Gap: the plain-text fallback collapsed line breaks. Fixed: `is-plain` with
   `white-space: pre-wrap`; DES-004 says so.
5. Gap: tables in a plan were unstyled. Fixed: the reply table rules now name
   the plan block in one selector group.
6. Out of scope: Allow on an ExitPlanMode card also grants `allowedPrompts`,
   shown only in Full input. Fixed: backlog item added to the plan.
7. Gap: nothing showed while the plan rendered. Fixed: "Rendering the plan…",
   as the diff has "Reading the file…".
8. Gap: the exporter passes tool names read from stored conversations; a
   non-string name threw in `summarizeToolInput`. Fixed: `vaultToolOf` checks
   the type; tested for the summary and the title.
9. Stale: the release note said the card named the note the tool "acts on" for
   all arguments. Fixed: it names the note in `path` or the search query.
10. Nit: `planOf` treats a plan of only zero-width characters as text. No
    change: it renders as an empty block, and the CLI does not send one.
11. Gap: the task lacked its manual checks. Fixed: the section above.

## Outcome

A vault-tool card's title and summary name only what the tool acts on, and
an ExitPlanMode card shows the whole plan rendered through the inert
boundary, above "Full input". The `allowedPrompts` grant is a backlog item.
Owed by hand in a vault: the manual checks in the Plan.
