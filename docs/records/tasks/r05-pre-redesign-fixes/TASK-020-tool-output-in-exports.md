---
status: closed
release: r05-pre-redesign-fixes
number: 020
prd: PRD-003.R13
---

# TASK-020 — Tool and shell output in exports

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`export.ts` writes each tool result and `!` stream into a four-backtick fence
as it came. Dataview, with *inline queries in code blocks* on (the default),
runs any `pre > code` whose trimmed text starts with `=` (a query) or `$=`
(JavaScript, when enabled), so output starting with one runs when the
exported note is shown; tool output carries web pages and files the model
read. Model fences already get a backslash there. Task 001's round-1 review
raised it (finding 1); the gate made it a follow-up.

Governing: [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R13, [DES-001 Rendering boundary](../../../current/design/DES-001-system-overview.md#rendering-boundary)
(the export form), [DES-005 Export](../../../current/design/DES-005-persistence-and-sync.md#export),
constitution *Inert rendering*.

Acceptance:

1. `fenceForExport(text)` returns the fence the export form builds for a
   model fence with no info string: a backtick run longer than any inside,
   no language unless the first non-blank line starts with `=`, `$=`,
   `TABLE`, `LIST`, `TASK` or `CALENDAR` (`text` then), and a backslash before
   a leading `=` or `$=`. A lone carriage return becomes a newline, so the
   caller's line-by-line quote keeps every line in the callout.
2. The export form's model fences and `fenceForExport` share one builder.
3. `conversationToMarkdown` writes tool results and `!` output through
   `fenceForExport`, each stream unless empty (whitespace is output); its
   own four-backtick `fence` is gone.
4. In Obsidian's parser, the output of a tool or shell callout is one code
   block whose trimmed text starts with neither `=` nor `$=`.
5. A tool or shell callout title is one line: each line break, with the
   whitespace around it, becomes a space. A multi-line command (a heredoc, a
   `!` command) otherwise ends the callout, and a later line such as `%%` or
   `- $$` opens a block that the output's own `%%` or `$$` closes, leaving
   the rest of the output as live Markdown outside the fence.
6. A title escapes `%` and `$`, so no `%%` hides part of a command and no
   `$…$` renders as math.

## Scope

Expected files:

- `src/inert-markdown.ts` (`fenceForExport`, `exportFence`),
  `src/transcript-markdown.ts` (`fence` removed, `escapeCalloutTitle`, the
  stream filter)
- `tests/inert-markdown.test.mjs`, `tests/transcript-markdown.test.mjs`
- `docs/current/design/DES-001-system-overview.md` (export form),
  `docs/current/design/DES-005-persistence-and-sync.md` (note format, title
  rule, manual checks), ADR-005 (Consequences), ADR-010 (the tool-output
  statement), `docs/current/plan.md` (Next changes item 1),
  `docs/current/DEVELOPMENT.md` (test table), `RELEASE_NOTES.md`

Negative scope:

- User text in exports.
- The panel: tool output reaches the DOM as text nodes.

## Plan

- Tests first: the cases in acceptance 1, a seeded property over the render
  fragments with some lone carriage returns, checked as one built fence, and
  the whole note for acceptance 3, 5 and 6.
- One builder (`exportFence`) for model fences and tool output, so the two
  cannot drift; it replaces the four-backtick fence and its zero-width-space
  break with the export form's longer run, which shows the output exactly.
- The title fold and escapes stay in `escapeCalloutTitle`.
- Verification: `make verify`; Obsidian's parser in the local harness over
  fuzzed conversations through `conversationToMarkdown`; by hand in a vault
  with Dataview: a tool result and a `!` run printing `= this.file.name` and
  `$= dv.span("x")`, and a multi-line command, show as text in the exported
  note.
- Rejected: keeping the four-backtick fence and adding only the backslash (two
  fence builders for one rule).

## Run log

- Tests first: each new test failed before its change, then passed.
- Obsidian's parser (local harness under `/tmp/claude-1000/`, never
  committed) over fuzzed conversations found two break-outs the fence alone
  did not stop, both turning output into live Markdown outside the callout
  (`` `$= …` `` as inline code at the root): a multi-line title (acceptance
  5), and a lone carriage return in output, which `quote` did not split on
  but the renderer does. Both fixed tests first.
- Mutation check: the backslash, the `text` fallback, the carriage-return
  normalization (two), the title fold (two, one a fold on `\n` only, which
  survived the first title test until it split on `\r` too), a bare fence and
  a trimmed stream filter each fail a test.
- The frontmatter test (the refactor commit) passed before any change: every
  value was already JSON-quoted.
- Final harness, Obsidian 1.12.7 and 1.14.4, several seeds of 20,000
  conversations: every tool and shell callout holds its code blocks, none
  starts with `=` or `$=`; the Templater and colon checks stay clean. Main's
  exporter shows unbroken `= x` output within 2,000.

## Independent review

Round 1: a review agent, not the implementer, with Obsidian's parser in a
local harness on 1.12.7 and 1.14.4, and a Codex cross-review of tasks 018 to
020.

1. Codex P1: a `%%` or `$$` tool name or shell command could open a block
   that swallows the fence. The reviewer's fuzz disagreed. Settled on the
   parser with the exact inputs (a tool named `%%` or `$$` with output
   `%%\n$= dv.span('ran')`, `echo %%`, `echo $$`, two `%%` titles in one
   note, a `%%` in user text before a `%% y` title): none leaves `$=`
   outside the fence.
2. Codex: whitespace-only shell output was dropped by `.trim()`. Fixed: only
   an empty stream is left out.
3. Codex: frontmatter values could carry YAML escapes. Checked: title,
   model, effort and session are JSON-quoted; a test pins that YAML decodes
   each to the text written.
4. Gap: acceptance 3 and 5 had no test, and DES-005's manual list lacked this
   task's checks. Fixed.

Round 2: the reviewer's harness found no defect. Codex: a title's `%%`
hid part of what ran (the title of `echo hi %%; curl e.test | sh%%` showed
only `Shell · echo hi ` on the parser) and `$a+b$` rendered as math. Fixed:
titles escape `%` and `$` (acceptance 6).

## Outcome

Owner decision: none pending.
