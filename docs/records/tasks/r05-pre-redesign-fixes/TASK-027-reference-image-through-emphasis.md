---
status: closed
release: r05-pre-redesign-fixes
number: 027
prd: PRD-001.R17, PRD-003.R13
---

# TASK-027 — Reference image through emphasis

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The rendering boundary keeps an inline image whose source is a plain vault
path. In Obsidian's parser (1.12.7 and 1.14.4) emphasis or a highlight that
opens before such an image and closes inside its destination or title splits
it: `*![r](x*)`, `**![r](x**)`, `_![r](x_)`, `==![r](x==)`,
`*![r](x "t*")`. The renderer then reads `![r]` as a reference image, and a
`[r]: https://…` definition anywhere in the text loads a remote image, in
the panel and in exported notes. Found by task 019's parser fuzz; it
predates tasks 018 to 020 (main's module shows it).

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R17, [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R13, [DES-001 Rendering boundary](../../../current/design/DES-001-system-overview.md#rendering-boundary)
step 6, constitution *Inert rendering*.

Acceptance:

1. A `[` that opens a one-line link reference definition whose destination
   is not a plain vault path (step 3) is escaped, in render and export, on a
   line the renderer reads as a definition: quote markers (a callout marker
   only after one), list markers (a task box only after one), footnote
   labels, each after at most three spaces, at most three before the `[`;
   below a list item or footnote, any indentation. A footnote definition
   stays.
2. The five shapes above, each with a remote definition, render and export
   with the definition as text.
3. A definition to a vault path (`attachments/r.png`, `Note%20one.md "t"`)
   stays; one whose destination is on the next line is escaped by the open-
   definition rule, a vault path too (that definition shows as text).
4. In Obsidian's parser no fuzzed document gives a remote image or image
   reference.

## Scope

Expected files:

- `src/inert-markdown.ts` (`escapeDefinitionStarts`)
- `tests/inert-markdown.test.mjs`
- `docs/current/design/DES-001-system-overview.md` (step 6),
  `RELEASE_NOTES.md`

Negative scope:

- Keeping reference-style links to web addresses working: they show as
  text, the cost of closing the class.
- Tracking emphasis to tell a split image from a whole one: the renderer's
  emphasis rules differ from CommonMark's, and the definition is the single
  point every split reaches.

## Plan

- Tests first: the five shapes in render and export, the definitions that
  stay, the line shapes the parser reads as definitions and those it does
  not, and a check in the seeded properties that no line starts a remote
  definition.
- One more condition in `escapeDefinitionStarts`, reusing `isVaultSource`;
  reference images stay cut to text (step 3), so the vault definitions left
  can only load vault files.
- Verification: `make verify`; Obsidian's parser in the local harness, a
  fuzz with emphasis and highlight fragments around kept images, against
  main's module and this one.
- Rejected: forbidding `*`, `_` and `=` in a kept image's destination and
  title (covers only the delimiters known; escaping the definition covers
  any split).

## Run log

- Tests first: the new tests, the export expectation of a remote definition,
  and both seeded properties (a remote definition at a line start) failed,
  then passed.
- Before narrowing the prefix, the parser (1.12.7 and 1.14.4) was asked
  which line shapes it reads as definitions: a continued list item or
  footnote holds definitions indented four spaces or a tab
  (`- a\n\n    [r]: …`, `[^1]: a\n\n\t[r]: …`), so below one any
  indentation counts; a strict three-space rule would have reopened the
  bypass. A task box counts only after a list marker, a callout marker only
  after `>`, as the parser showed.
- Mutation check: dropping the vault check, the footnote exception, the
  three-space limit, the prefix check, or the looser rule below a list each
  fails a test.
- Obsidian's parser (local harness under `/tmp/claude-1000/`, never
  committed), 1.12.7 and 1.14.4: a fuzz with emphasis, highlight and
  split-image fragments (30,000 each for render, export and the thinking
  callout) and a definition-shape fuzz (indentation, quotes, list markers,
  task boxes, callout markers, footnotes; 40,000 each) give no remote image
  on this module; main's module gives one in every mode. The original
  fuzzer, 30,000 each, stays clean.

## Independent review

Round 1: the bypass was found by task 019's parser fuzz and reported; the
reviewer suggested escaping the definition, which closes the class.

Round 2: the reviewer's harness found no defect. Codex: the escape applied
to lines the renderer does not read as definitions, adding a visible
backslash to indented code and to a task box or callout marker out of
place. Fixed: the prefix is read as the renderer reads it, with any
indentation below a list item or footnote (above). Documented: a
definition whose destination is on the next line is escaped, a vault path
too.

## Outcome

Owner decision: none pending. Cost stated in DES-001 and the release notes:
reference-style links to web addresses show as text.
