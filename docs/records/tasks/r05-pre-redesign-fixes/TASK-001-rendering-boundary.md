---
status: closed
release: r05-pre-redesign-fixes
number: 001
prd: PRD-001.R17, PRD-003.R13
---

# TASK-001 — Rendering boundary

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Model text reaches the DOM and exported notes through one pure module,
`inert-markdown`, so no other plugin's code-block or inline-code processor
runs on it and no remote image or embed loads.

Governing: [ADR-010](../../../current/adr/ADR-010-render-model-output-with-markdownrenderer.md),
PRD-001.R17, PRD-003.R13,
[DES-001 Rendering boundary](../../../current/design/DES-001-system-overview.md#rendering-boundary),
DES-005 export table, constitution *Inert rendering*.

Acceptance:

1. Before `MarkdownRenderer.render`, every fence, display-math block, code
   span and inline math span is replaced by an alphanumeric placeholder; no
   fence passes to the renderer in place. After rendering the view rebuilds
   spans and fences as `code` or `pre > code` with `createEl` and math with
   `renderMath`, its output stripped of styles that fetch. An allowlisted
   fence whose text does not start with `=` or `$=`, and whose opener is
   certainly a fence, is rendered alone from a fence the module built,
   under a backtick run longer than any inside. A placeholder inside rendered code comes back
   as its source; one in `alt`, `title`, `aria-label` or `data-heading` as
   its text.
2. Fences inside blockquotes and list items are found with their container;
   one whose container ends first is cut where the container ends.
3. No raw backtick, `$` or run of three tildes remains: unmatched ones are
   backslash-escaped, and `%%` is escaped. Math holding a MathJax command
   that sets CSS, attributes or links (`\style`, `\bbox`, `\href`, …) is
   cut as code.
4. An image becomes its alt text and URL unless it is an inline `![…](…)` on
   one line or an Obsidian embed `![[target]]` whose source is a plain vault
   path; any other `![[` is read as `![`; a reference-style image always
   becomes text; an image whose text does not close gets its `!` escaped.
5. A raw HTML tag shows as literal text (`<` written `&lt;`) unless it is an
   attribute-free inline formatting tag (`br`, `b`, `i`, `u`, `s`, `em`,
   `strong`, `sub`, `sup`, `kbd`, `mark`, `small`, `del`, `ins`) in running
   text; alone on its line it is text too. Autolinks stay unless they hold a
   quote or `=` (an email's local part, `/` too).
6. At a line start (after indentation, quote markers, list markers of any
   length, a task box holding any character, a footnote label or a callout
   marker), `=` or `$=` gets a backslash (`==` stays), and a `[` is escaped
   when no `]` follows or when it opens a definition that could continue
   below its line.
7. Link targets with spaces are percent-encoded outside code (moved from
   `view.ts`).
8. A click on a link that is not a vault link is always cancelled; only
   `http`, `https`, `mailto` and `obsidian` go to `window.open`. `file:` and
   every other scheme open nothing.
9. Export writes replies and thinking through the export form: every fence
   rebuilt unindented after a blank line (allowlisted language or `text`, a
   leading `=` or `$=` backslashed), display math as a `text` fence, inline
   code, cut images and inline math as escaped text; rules 3 to 6
   unchanged.
10. Every render site goes through `renderMarkdown`: final and reopened
    replies, subagent text, usage cards, the diff view's Rendered toggle.

## Scope

Expected files:

- `src/inert-markdown.ts` (new), `src/view.ts` (`renderMarkdown`, restore
  walker, `handleLinkClick`, link-repair helpers removed), `src/export.ts`
  (assistant and thinking through the export form)
- `tests/inert-markdown.test.mjs` (new), `package.json` (`pretest` entry)
- `docs/current/design/DES-001-system-overview.md` (rendering boundary),
  `docs/current/design/DES-005-persistence-and-sync.md` (export row links to
  it), `docs/work/design/DES-003-transcript-and-panel-ui.md` (draft),
  `docs/current/SECURITY.md`, `README.md` (network disclosure),
  `docs/current/DEVELOPMENT.md` (test table), `docs/current/plan.md`
  (backlog items landed), `RELEASE_NOTES.md`
- `docs/records/verification/` manual evidence record

Negative scope:

- The ExitPlanMode plan as Markdown (PRD-002.R17): task 4. It will call
  `renderMarkdown` and inherits this boundary.
- `tool-labels` extraction and `export.ts`'s import of `view.ts`: task 4.
- Tool, shell and user text in exports: written by `export.ts` in plain
  fences or as user text; unchanged (decision b at the gate).
- Dataview inline fields `[x:: …]` (round-1 finding 5) and Templater
  commands, including trigger-on-create on `<% %>` (finding 6): not covered
  by ADR-010; raised as decisions, not fixed here.
- No change to which plugins' post processors run on the rendered element
  (accepted residual, ADR-010).

## Plan

- Tests first in `tests/inert-markdown.test.mjs`, named by requirement ID:
  each round-1 finding as a failing case, then seeded property tests over
  adversarial fragments for render and for export.
- `inert-markdown` is a line scanner for fences and display math (with
  container prefix and closers), a scanner for code spans and inline math
  in the renderer's precedence, and line-start rules for the block starts
  the renderer reads. When its model of the Markdown could differ from the
  renderer's, it cuts more, never less.
- No fence is handed to the renderer in place: an allowlisted one is
  rendered alone from a fence the module built, so no surrounding block can
  close or reopen it.
- Placeholder token: random per render, letters and digits only.
- `view.ts` keeps only the DOM walk that swaps placeholders for elements.
- Verification: `make verify`; Obsidian's reading-view parser in a
  local-only harness (extracted from `obsidian.asar`, never committed) for
  the round-1 cases and a fuzz of render, export and thinking-callout
  output; independent review; Codex cross-review of the diff; by hand in a
  vault with Dataview enabled, recorded in `docs/records/verification/`.
- Rejected: escaping only the fence info string (inline `$=` code still
  runs); plain text for any reply holding code (loses Markdown, ADR-010);
  stripping after render (an `img` starts loading when created); passing
  allowlisted fences in place (round 1: blocks the cut does not model close
  them early); escaping every `$$` (loses math, which `renderMath` keeps
  inert).

## Run log

- `make verify` fails on HEAD before this change: `make format` flags
  trailing whitespace in the byte-identical canvas mirror
  `docs/work/research/redesign-canvas/` (commit 014a3b3). Every other step
  passes; the format check passes with that folder excluded.
- First session: the sandbox mounted device files over `.claude/loop.md` and
  siblings, so `check_governance.py` ran on a copy of the tree, and Codex
  could not run (read-only `~/.codex`, `auth.openai.com` blocked). Second
  session: governance runs in place.
- Mutation check (first pass): five mutants of the built module each failed
  2 to 3 tests.
- Found while implementing and fixed: CRLF input hid fences (safe, lost
  formatting); reference labels needed CommonMark's Unicode case folding.
- Round-1 rework, tests first: each finding became a failing case (22 tests
  failed before the change).
- Obsidian's parser harness (local only, `/tmp/claude-1000/`), run over the
  round-1 cases and a fuzz of render, export and thinking-callout output,
  found more mismatches, each fixed with a test:
  - remark-parse 8 reads a definition label across blank lines and takes a
    destination from the next non-blank line, so a `[` before a fence the
    module built could swallow its opener; escaping the dangling `]` made
    it worse (the label then ran on), so the `[` is escaped;
  - a callout title, a task item and a footnote definition are parsed as
    blocks, so indented code could start after `[!note]`, `[ ]` or `[^1]:`;
  - a block comment's closer starts a block mid-line, past every line-start
    escape, so `%%` is escaped in render too;
  - a kept vault image's destination was rewritten into a remote URL by the
    export escapes, and one spanning a line lost to a list item opening on
    the next; kept images now need a plain one-line vault source;
  - the module's own HTML escape broke math (`$x<y$`), so math is cut whole
    and rebuilt with `renderMath`.
- Final harness run, after round 2 and Codex, on Obsidian 1.12.7 and
  1.14.4: the round-1 and round-2 cases and the manual-evidence probe show
  no violation in render, export or thinking; 360,000 documents from this
  task's fuzzer and 210,000 from the round-2 reviewer's three fuzzers
  (structural, character-level, line-prefix) show none. 12 documents were
  skipped on a harness loader error.
- Codex attempt 1 was stopped by OpenAI's safety filter; attempt 2 was
  framed as a code review limited to the repository.

## Independent review

Round 1: a review agent, not the implementer. It ran the module's output
through Obsidian's reading-view parser (remark-parse 8 plus Obsidian's
extensions), extracted from the local `obsidian.asar` into a throwaway
harness under `/tmp/claude-1000/` (`load-obs.cjs`, `check.mjs`, `fuzz.mjs`;
never commit it). It read Dataview 0.5.68 and Templater 2.25.1 from a local
vault. CONFIRMED means shown against that parser; PLAUSIBLE means the last
step is plugin runtime.

Findings, open:

1. Dataview's default `inlineQueriesInCodeblocks` evaluates any `pre > code`
   whose trimmed text starts with `=` or `$=`. Affected: an allowlisted
   fence such as `text`, an indented code block, and in export the
   retagged `text` fences plus the plain fences that hold tool and shell
   output. A string result is rendered as Markdown, so it can load an image
   carrying vault data. CONFIRMED to the parser, PLAUSIBLE in Dataview.
   Fix: apply the `=`/`$=` first-line check to every fence and to indented
   code, in render and export.
2. A line holding only an allowed tag (`<b>`) starts a raw HTML block.
   - Everything after it up to a blank line passes raw: `img`, `iframe`,
     `<code>$=…`. This holds in render and in export, including fences
     retagged `text` and the thinking callout.
   - The email-autolink exception also lets
     `<code/class='language-dataview'/x@e.test>` through.
   - CONFIRMED. Fix: escape an allowed tag that sits alone on its line;
     keep `<…@…>` only when the local part has no `/`, `'` or `=`.
3. Blocks the module does not model swallow a fence opener, and the rest
   renders as live Markdown (raw backticks, remote images). CONFIRMED.
   - `$$` math and `%%` comments, each with a fence inside.
   - A 4-space opener continuing a paragraph, or one under a list item at
     depth.
   - `text\n2. ~~~js…`: a list that does not start at 1 cannot interrupt a
     paragraph.

   Fix: pass no fence verbatim. Render each allowlisted fence alone as a
   fence the module builds (a run longer than any in its content). Export
   fences in that same form, with a blank line before and no indentation,
   and escape `$$` and `%%` outside fences.
4. Reference images missed. CONFIRMED.
   - A label containing a backtick: the definitions map is keyed on the raw
     label, but the lookup uses the escaped one.
   - A definition URL in `<…>` on the next line, also after a blank line.
   - A failed inline form `![r](x` that falls back to the shortcut
     reference.

   Fix: build the definitions from the same escaped text the lookup uses,
   strip `<>`, allow a blank line before the URL, and try the reference
   when the inline form fails.
5. Dataview's default `prettyRenderInlineFields` re-renders an inline
   field's value (`[x:: …]`) through `MarkdownRenderer`, from `innerHTML`,
   so an entity-encoded image or `` `= …` `` in it loads or runs.
   ADR-010's residual says such plugins only see text. Decision needed,
   for example breaking `::` in model text. CONFIRMED to the parser,
   PLAUSIBLE in Dataview.
6. Templater's dynamic commands `<%+ … %>` run in reading view of any real
   file, so in an opened exported note; `&lt;%` inside code decodes back.
   The panel is safe (source path `""`). Decide together with the
   trigger-on-create item. PLAUSIBLE.
7. Minor: `` $`x`$ `` loses its code inside math; the token shows in
   `data-heading` and image `alt`; a literal `\`` shows inside HTML
   blocks.

No issue: the link-click handling, the placeholder restore and forging,
entity and control-character URLs, normal replies (fences in lists and
callouts, tables with `<br>`, links with spaces, nested fences), 40k fuzzed
non-fence inputs, AGENTS.md design rules.

Resolution:

- Fixed: 1 (a fence or indented code starting with `=` or `$=` never
  reaches the renderer as code: inert `pre > code`, or a backslash in
  export and at line starts), 2 (a lone allowed tag is text; email and URL
  autolinks lose `/`, quote and `=` cases), 3 (no fence passes in place;
  export rebuilds every fence unindented after a blank line; `%%` and stray
  `$$` escaped), 4 (every reference image is text; definitions read from
  the cut text), 7 (math is cut whole and rebuilt with `renderMath`;
  placeholders in `alt`, `title`, `aria-label`, `data-heading` read as text;
  no HTML block forms).
- Decided at the gate (2026-10-11): 1 for tool and shell output in exports,
  5 and 6 become follow-up changes in `docs/current/plan.md`.

Round 2: a fresh review agent, not the implementer, with its own checker
over Obsidian's parser in a local-only harness (`/tmp/claude-1000/review2/`;
never commit it). The installed Obsidian is 1.14.4 and the round-1
extraction 1.12.7; it extracted 1.14.4 and every confirmed finding
reproduces on both. Fuzz: about 990,000 documents each for render and
export, 910,000 for thinking, 530,000 for adjacent replies.

Findings and resolution:

1. Bypass, CONFIRMED: a task box holds any character and a list number any
   length, so `- [/]     $= x` and `1234567890.     = x` reached indented
   code, and `- [?] <b>` opened an HTML block. Fixed: the line prefix takes
   both.
2. Bypass, CONFIRMED in export: a `<…>` definition destination runs across
   blank lines and swallowed a rebuilt fence's opener. Fixed: a `[` that
   opens a definition able to continue below its line (no destination, an
   unclosed `<…>` or title) is escaped; a `[` that opens a wrapped link
   stays.
3. Bypass, CONFIRMED: a `![[` that is no embed (`![[a]b](url)`,
   `![[]](url)`, across a line) was kept and parsed as a remote image.
   Fixed: only Obsidian's one-line embed form is kept; anything else is
   read as `![`.
4. Bypass, CONFIRMED: a whitespace line holding a tab continues a
   paragraph, so an image's text closed past it. Fixed: only spaces make a
   line blank, and an image whose text does not close gets `\!`.
5. Bypass, PLAUSIBLE (MathJax and Chromium): MathJax's style filter lets
   `\style{cursor:url(…)}` through. Fixed: math holding a command that sets
   CSS, attributes or links is cut as code, and every unpaired `$` is
   escaped, so no math forms that the cut did not see.
6. Cosmetic: fixed a line-start `==highlight==` (kept where it cannot be
   indented code) and fences in tight lists (no blank lines in a list
   item); a wrapped link at a line start keeps its link. Kept: export moves
   fences out of lists.
7. Correctness: the reopened-reply and usage-card renders had no fallback.
   Fixed: both fall back to the raw text, as the other render sites do.

Found while re-running the parser fuzz over the fixes, and fixed:

- An exported fence needs a blank line of spaces only before it; a tab line
  continued the paragraph.
- Inline math written as-is in export could pair differently in the
  renderer and open math over escaped `\style{…}` text (CSS undoes the
  backslashes). Export now writes inline math as escaped TeX.
- MathJax's `\fcolorbox` writes its colour into a style string, so a
  colour like `red; cursor:url(…)` injects a fetching style; added to the
  unsafe commands. `\color` and `\colorbox` set single CSS properties,
  where `url()` is invalid.

Codex cross-review (Codex CLI, read-only sandbox, not the implementer):

- Attempt 1 ran 200k tokens, then OpenAI's safety filter stopped it with no
  answer; its log is lost but for the tail, which shows it reading the
  MathJax bundle the round-2 reviewer extracted under `/tmp/claude-1000/`.
- Attempt 2, framed as a code review and limited to the repository:
  1. High: the TeX denylist misses commands built by `\csname`. Not
     reproducible: Obsidian's MathJax 4.1.3 has no `\csname`. Fixed anyway
     in depth: MathJax output loses styles that fetch and source attributes
     before it is attached, and export writes all math as TeX.
  2. High: an indented or `2.` opener the renderer reads as paragraph text
     was rendered as an allowlisted fence. Fixed: only a certain fence (no
     list marker on its line, at most three spaces in) is rendered as one;
     others are plain code. Export keeps the list marker as a line.
  3. Medium: one failing fence render dropped the reply and skipped
     `finishRenderMath`. Fixed: each fence falls back to plain code alone;
     `finishRenderMath` runs in `finally`.
  4. Medium: the export property counted any fence after a blank line as
     built. Fixed: it asserts the language, the run and the body. Not
     fixed: `restoreInert` has no automated test (it imports `obsidian`);
     the manual evidence covers it.
  5. Low: reference labels lost their spaces, so `[ab]` matched `[a b]`.
     Fixed: whitespace collapses to one space.

## Outcome

Accepted at the gate on 2026-10-11, with `.gitattributes` exempting the
canvas mirror from the whitespace check in its own commit first (85cb4ba).

Still owed before release close: the manual evidence for DES-001's
rendering-boundary row, recorded in `docs/records/verification/`. Procedure:

1. Build this commit and deploy it to a vault with Dataview. Turn on
   JavaScript and inline JavaScript queries; keep inline queries, codeblock
   inline queries and pretty inline fields on.
2. In an empty folder run `python3 -m http.server 8765 --bind 127.0.0.1`;
   its log shows any request.
3. With Obsidian closed, save the probe below as `probe.md` next to the
   script below, and run
   `node make-history.mjs "<vault>/.obsidian/plugins/ai-agent-panel/history/rendering-boundary-probe.json"`.
4. Open the panel and reopen "Rendering boundary probe". Pass: no joined
   `RAN-…` text and no request in the server log; math, the `bash` block's
   highlighting, the list and the link still render.
5. Export the conversation, open the note in reading view, and check the
   same.
6. Record the Obsidian and Dataview versions, the settings, and the result.

Probe (`probe.md`); without the module it shows 18 violations in Obsidian's
parser, with it none:

`````markdown
Probe for the rendering boundary. Any text RAN-<name> or any hit on the local server is a failure.

```dataviewjs
dv.paragraph("RAN" + "-fence-js")
```

```dataview
LIST
```

```text
$= dv.span("RAN" + "-text-fence")
```

```
= "RAN" + "-plain-fence"
```

Inline: `= "RAN" + "-dql"` and `$= dv.span("RAN" + "-inline-js")`.

Indented:

    $= dv.span("RAN" + "-indented")

> [!note]     $= dv.span("RAN" + "-callout-title")

- [ ]     $= dv.span("RAN" + "-task")

<b>
<code>$= dv.span("RAN" + "-html-block")</code>
<img src="http://127.0.0.1:8765/html-img.png">

<code/class='language-dataviewjs'/x@e.test>

$$
```js
$$
`$= dv.span("RAN" + "-math-block")`
```

%%
```js
%%
`$= dv.span("RAN" + "-comment")`
```

%%
a
%%    $= dv.span("RAN" + "-comment-closer")

[r0]:
```js
`$= dv.span("RAN" + "-definition")`
```

![inline](http://127.0.0.1:8765/inline.png) ![[http://127.0.0.1:8765/embed.png]]

![a`b] ![r1] ![r2] ![r3](x

![r3](
1) item

[a`b]: http://127.0.0.1:8765/ref-backtick.png
[r1]:
<http://127.0.0.1:8765/ref-next-line.png>
[r2]:

<http://127.0.0.1:8765/ref-blank-line.png>
[r3]: http://127.0.0.1:8765/ref-fallback.png

Still formatted: **bold**, $x<y$, a [link with spaces](Probe target.md), <kbd>Ctrl</kbd>.

$$
E=mc^2
$$

1. Step
   ```bash
   echo ok
   ```
2. Next
`````

`make-history.mjs`:

```js
// Writes a stored conversation whose reply and thinking carry the probe.
import fs from "node:fs";
const probe = fs.readFileSync(new URL("./probe.md", import.meta.url), "utf8");
const now = Date.now();
const conversation = {
	version: 1, id: "rendering-boundary-probe", sessionId: null, title: "Rendering boundary probe",
	createdAt: now, updatedAt: now,
	messages: [
		{ kind: "user", text: "Show the probe." },
		{ kind: "thinking", text: probe },
		{ kind: "assistant", text: probe },
		{ kind: "meta", durationMs: 1000 },
	],
};
fs.writeFileSync(process.argv[2], JSON.stringify(conversation, null, "\t") + "\n");
```

Gate candidates: a parser-level check of the module (the local harness) has
no home in CI, since Obsidian's code cannot be committed; the property tests
check output with regular expressions.
