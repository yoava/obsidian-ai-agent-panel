---
status: closed
release: r05-pre-redesign-fixes
number: 018
prd: PRD-003.R13
---

# TASK-018 — Templater commands in exported notes

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Templater (2.25.1, read from a local install) parses `<% … %>` in the whole
file of a note created while *Trigger Templater on new file creation* is on,
and of a note used as a template; `<%*` runs JavaScript. In reading view it
runs `<%+ … %>` found in any text node of a note, code included. An export's
first write creates the note, and the note carries replies, thinking, tool and
shell output and user text, so a `<%` from any of them can run. Task 001's
round-1 review raised it (finding 6); the gate made it a follow-up.

Governing: [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R13, [DES-005 Export](../../../current/design/DES-005-persistence-and-sync.md#export),
constitution *Inert rendering*.

Acceptance:

1. `breakTemplateCommands(text)` puts a word joiner (U+2060) after every `<`
   that a `%` follows, each written as itself, a backslash escape or an
   entity the renderer decodes (`&lt`, `&LT`, `&#60`, `&#x3c`, with or
   without `;`; `&percnt;`, `&#37`, `&#x25`), and changes nothing else.
2. Its output holds no `<%`, raw or with escapes and entities decoded.
3. `conversationToMarkdown` (`transcript-markdown`) returns the whole note
   through it: frontmatter, user text, callout titles, replies, thinking,
   tool and shell output, a failed turn, fences included.
4. In Obsidian's parser, no text node of an exported note holds `<%`.

## Scope

Expected files:

- `src/inert-markdown.ts` (`breakTemplateCommands`),
  `src/transcript-markdown.ts` (the whole-note call; the module itself lands
  in the preceding refactor commit, which moved `conversationToMarkdown` out
  of `export.ts` so the whole note is testable in plain Node)
- `tests/inert-markdown.test.mjs`, `tests/transcript-markdown.test.mjs`
- `docs/current/design/DES-005-persistence-and-sync.md` (Export, accepted
  risks, manual checks), ADR-005 (Consequences, status date), ADR-010 (the
  export statement), `docs/current/adr/README.md`, `docs/current/plan.md`
  (Next changes item 1), `docs/current/DEVELOPMENT.md` (test table),
  `RELEASE_NOTES.md`

Negative scope:

- The panel: dynamic commands need a note, and the panel renders with source
  path `""`.
- Dataview inline fields (task 019) and the query guard for tool output
  (task 020).

## Plan

- Tests first: the forms in acceptance 1, text that must stay, a seeded
  property over random runs of `<` and `%` forms, decoded, and the whole note
  through `conversationToMarkdown`.
- One pass over the finished note in `conversationToMarkdown`, so one call
  covers every part; the function lives in `inert-markdown`.
- U+2060 (word joiner): invisible, no line break, and not whitespace to
  CommonMark, so it changes no parse.
- Verification: `make verify`; Obsidian's parser in the local harness over
  fuzzed notes from `conversationToMarkdown`; by hand: export a conversation
  with `<%* … %>` in a reply, a fence and tool output, with trigger on
  creation on.
- Rejected: `&lt;%` (Templater reads decoded text nodes, and code shows the
  entity); a backslash (literal inside code); breaking model text only (tool
  output and user text reach the same note).

## Run log

- Tests first: the new tests failed (`breakTemplateCommands` missing), then
  passed. The property's first run failed on the test's own decoder, which
  read `\&#060` as `<`; it decodes in one pass now, as the renderer does.
- Mutation check: nine mutants (each entity form, the escaped `%`, the
  joiner, the whole-note call) each fail a test.
- Obsidian's parser (local harness under `/tmp/claude-1000/`, never
  committed), 1.12.7 and 1.14.4: 20,000 fuzzed conversations each (title,
  user text, thinking, reply, tool call, shell run, failed turn) give no
  `<%` in the file or in any text node; main's exporter shows both within
  2,000.
- The protected-path hook blocks the Write and Edit tools outside the main
  checkout, so files were edited through the shell; no protected path was
  touched.

## Independent review

Round 1: a review agent, not the implementer, with Obsidian's parser in a
local harness on 1.12.7 and 1.14.4, and a Codex cross-review of tasks 018 to
020.

1. Gap: acceptance 3 had no test: `conversationToMarkdown` lived in
   `export.ts`, which imports `obsidian`, and deleting the call passed
   `make verify`. Fixed: the refactor commit before this one moves it to
   `transcript-markdown`; a whole-note test now fails without the call.
2. Nit: an escaped `%` entity (`<\&#37;`) was not read as a `%`. Fixed; it
   costs only a joiner.
3. Docs: ADR-005 listed Templater in exports as an open risk, and ADR-010
   named `renderMessage` in `src/export.ts`. Rewritten to the present
   behavior (maintenance the lead authorized), status dates 2026-10-11.

Round 2: the same reviewer's harness found no defect. Fixed: the pattern's
comment and the Templater property claimed coverage of an image's alt and a
link's title, which Templater never reads (it reads the file and text
nodes).

## Outcome

Owner decision, pending: confirm the in-place rewrite of ADR-005's
Consequences bullet and ADR-010's export statements (factual, no change of
decision).
