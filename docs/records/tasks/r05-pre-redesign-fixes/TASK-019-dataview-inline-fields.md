---
status: closed
release: r05-pre-redesign-fixes
number: 019
prd: PRD-001.R17, PRD-003.R13
---

# TASK-019 — Dataview inline fields in model text

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Dataview (0.5.68, read from a local install) finds inline fields by `::`:

- With *pretty render inline fields* on (the default), a post processor reads
  the `innerHTML` of every paragraph, heading, list item, span and table cell
  a render produced, the panel's included, finds `[key:: value]` and
  `(key:: value)`, and renders each value again as Markdown. Text the cut
  left inert (an escaped `![…](https://…)`, inline code an export writes as
  escaped text) then renders live: a remote image loads. Task 001 round-1
  finding 5.
- Its indexer reads `key:: value` lines and bracketed fields in every section
  of a note except lists (read item by item) and rules, code blocks included,
  as the note's fields; model text in an exported note sets metadata that
  queries elsewhere in the vault read and render.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R17, [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R13, [DES-001 Rendering boundary](../../../current/design/DES-001-system-overview.md#rendering-boundary)
step 8 and the export form, constitution *Inert rendering*.

Acceptance:

1. Render: where two colons would meet, the second becomes a placeholder,
   one per spelling. Colons are read as Markdown decodes them (`:`, a
   backslash escape, `&colon;`, `&#58`, `&#x3a`, numeric ones with or
   without `;`) and as an image's alt or a link's title ends up, which
   Obsidian unescapes and decodes (`\&colon;` is `:` there), one decoding
   further for safety (`&amp;colon;`). No `::` reaches the renderer, raw,
   decoded or decoded twice. Inside rendered code the
   placeholder comes back as its source; in text and every attribute as its
   text, after Dataview has run.
2. Code spans, math, fences and allowlisted fences built for the renderer
   keep their `::`.
3. Export: `breakInlineFields` puts a word joiner (U+2060) between two
   colons that would meet, read as in acceptance 1 and across a `%%`
   comment once a colon has stood right before one, and changes nothing
   else. `conversationToMarkdown` passes the
   whole note through it (owner decision: frontmatter, user text, titles,
   replies, thinking, tool and shell output, a failed turn's error). The note
   holds no `::`, raw, decoded or decoded twice.
4. Ordinary text (`std::vector`, `fe80::1`, `:smile::wink:`), reference
   labels, footnotes and link targets holding `::` show and work as written
   in the panel; in an exported note they read the same, and a link target
   holding `::` breaks.
5. In Obsidian's parser, the HTML of the render cut and of the exported
   note holds no `::`, decoded twice.
6. A placeholder token never occurs in the input it cuts, as written or
   with its entities decoded once or twice.
7. A failed turn's error is exported through the export form.
8. `breakInlineFields` scans a 2.1 MB note in tens of milliseconds.

## Scope

Expected files:

- `src/inert-markdown.ts`, `src/transcript-markdown.ts` (the whole-note
  break, the failed turn's error), `src/view.ts` (`restoreInert` restores
  colons in every attribute)
- `tests/inert-markdown.test.mjs`, `tests/transcript-markdown.test.mjs`
- `docs/current/design/DES-001-system-overview.md` (Rendering boundary,
  Verification), `docs/current/design/DES-005-persistence-and-sync.md`
  (export, accepted risks), ADR-005 (Consequences), `docs/current/plan.md`
  (Next changes item 1), `docs/current/DEVELOPMENT.md` (test table),
  `RELEASE_NOTES.md`

Negative scope:

- Raw HTML in user text that the renderer drops (inferred residual; user
  text is written as typed).
- Dataview's emoji task fields (`📅 2026-10-11` in a list item): dates only.

## Plan

- Tests first: acceptance 1 to 8 as unit tests, a seeded property over
  every colon spelling in text and attribute positions, render and export,
  and the colon checks in the shared render and export properties.
- One colon scan: a token scan over escapes, `&`, `%%` and colons, plain
  text skipped; at an `&` it decodes as far as a colon's entity can reach.
  Render swaps the second colon of a pair for a placeholder, one per
  spelling; export puts a word joiner before it, over the whole note. It
  runs last, so no later step adds a colon.
- Render relies on `MarkdownRenderer.render` waiting for post processors
  (Obsidian 1.12.7 and 1.14.4 return `Promise.all` of their promises), so
  Dataview has read the text before the view restores the colon, in text and
  every attribute.
- Allowlisted fences rendered alone keep `::`: Dataview's pretty rendering
  collects its elements when called, and Obsidian's highlighting, registered
  first at the same priority, adds spans only after a promise; the fence is
  `pre > code`, which it does not read. A joiner there would reach the copy
  button.
- Export splits fences too, since the indexer reads code blocks. Cost: code
  copied from an exported note keeps the joiner (owner decision, below).
- Verification: `make verify`; Obsidian's parser in the local harness over
  fuzzed render cuts and exported notes; by hand in a vault with Dataview: a
  reply holding `(k:: ![x](http://127.0.0.1:8765/x.png))`, plain and escaped,
  in the panel and the exported note, loads nothing and shows no field.
- Rejected: a joiner in render (copy from the panel would carry it); `\:`
  (renders as `:`); leaving exported fences whole (model code would set the
  note's fields); a placeholder per colon (labels stop matching).

## Run log

- Tests first, each failing before its change: the render and export colon
  cases, the stable placeholders and attribute restore, `freshToken`, the
  whole note, the failed turn, the comment rule, the performance guard and
  the colon property. The test that code, math and fences keep their colons
  passed before and after, as intended.
- Mutation check: 12 mutants (two named entities, the escape, the
  entity window, the stable map, the attribute restore, two token checks,
  the whole-note call, the error's cut, the comment rule, the token scan's
  plain-text reset) each fail a test.
- Obsidian's parser (local harness under `/tmp/claude-1000/`, never
  committed) found, beyond the review's cases, twice-encoded colons
  (`&amp;\#58;`) and a `%%` comment that vanishes between two colons
  (`a:%%x%%:b` renders `a::b`), also across note parts. Both fixed tests
  first.
- The per-character decode took about 400 ms on a 2.1 MB note; the token
  scan takes 16 to 26 ms and matches it on 200,000 random colon-heavy
  inputs everywhere but where `%%` appears (the rule changed there).
- Final harness, 1.12.7 and 1.14.4: 30,000 fuzzed documents each for render,
  export and thinking, and several seeds of 20,000 conversations through
  `conversationToMarkdown`: no `::` in any file or in any HTML decoded
  twice. Reference labels, footnotes, the IPv6 link and the reviewer's alt
  and title inputs parse as intended; main's exporter shows `::` within
  2,000.
- Colon spellings went into a property of their own: added to the shared
  fragments they shifted its seeded stream onto a quirk on main too (an
  image piece's `source` keeps the module's backtick escapes for
  `![r](    ```js\n…)`; cosmetic).
- The same fuzz found a remote image through a split kept image, on main
  too: task 027.

## Independent review

Round 1: a review agent, not the implementer, with Obsidian's parser in a
local harness on 1.12.7 and 1.14.4, and a Codex cross-review of tasks 018 to
020.

1. Defect: `::` reached Dataview through a vault image's alt or a link's
   title, which Obsidian unescapes and decodes: `\&colon;` was read as text.
   Fixed: colons are read as both end up, and one decoding further.
2. Decision (lead): break `::` in the whole exported note, as for `<%`.
   Done; a failed turn's error, which can carry model or server text, now
   goes through the export form.
3. Codex: each colon got its own placeholder, so `[x][a::b]` and its
   definition, and footnote labels, stopped matching, and an IPv6 link kept
   the placeholder in its `href`. Fixed: one placeholder per spelling; the
   colon comes back in every attribute after rendering.
4. Codex: the token was never checked against the input. Fixed: drawn again
   while the input holds it; DES-001 states the strength it has.
5. Nit: DES-001 did not say which rules apply to tool output. Fixed (with
   task 020's bullet).
6. Accepted, documented: entity forms inside fences get a joiner though
   fences do not decode them (breaking more is the safe side).

Round 2: the reviewer's harness found no defect; Codex round 2 reported
more, some settled on the harness as non-issues (equivalent label spellings
behave as Obsidian does without the cut). Fixed:

1. The export cost: the colon break built an object per character, about
   400 ms and 114 MB of temporary memory per MB on every history save of a
   2.1 MB note. Now a token scan, under 30 ms, with a guard test.
2. Codex: a token spelled with entities in the input was not rejected.
   Fixed: the decoded forms are checked too.
3. Codex: `%%` broke the next colon even with no colon before any comment.
   Fixed: only once a colon has stood right before a `%%`.
4. Wrong text: DES-001 and DES-005 said the attribute decode reads
   `&amp;colon;` as `:`; it decodes once, to `&colon;`. Fixed: they state the
   unescape and single decode, and the scan's extra decoding as such.

## Outcome

Owner decisions, made by the lead and to be confirmed by the owner:

- Keep the word joiner in exported code (`std::vector` copied from a note
  carries U+2060).
- Break `::` throughout the exported note, not only model text.

The reviewer's risk table was not passed to the implementer; this one is the
implementer's (impact and probability 1 to 5, score their product):

| Risk | Inherent I×P | Mitigation | Residual I×P |
| --- | --- | --- | --- |
| A field in a note feeds a vault query that renders it as Markdown and loads a remote image (data exfiltration) | 4×2 = 8 | joiner in every `::` of the note | 4×1 = 4 (raw HTML in user text, inferred) |
| Dataview re-renders a field value from text the cut left inert (image loads, inline query runs) | 4×3 = 12 | placeholders in render, joiner in export, both decodes, comments | 4×1 = 4 |
| Code copied from an exported note fails on an invisible U+2060 | 2×3 = 6 (cost of the decision) | release note, DES-005 | 2×3 = 6 |
| A link whose target holds `::` breaks in an exported note | 1×2 = 2 | none | 1×2 = 2 |

Highest residual score 6 (the copy cost); chance of an impact-4 event,
inherent likely, residual low. Leaving exported code whole would remove the
copy cost and keep model and tool code able to set a note's fields.
