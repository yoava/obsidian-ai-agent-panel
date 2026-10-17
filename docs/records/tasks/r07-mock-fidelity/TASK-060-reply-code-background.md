---
status: closed
release: r07-mock-fidelity
number: 060
prd: PRD-001.R34
---

# TASK-060 — A reply's code block has no background

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`MarkdownRenderer.render` only appends children, so reply bodies do not carry
Obsidian's `markdown-rendered` class and Obsidian's `pre` and `code` rules never
apply: a fenced code block has a transparent background in both modes (task 057
harness). Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R34 clause 2 (host-drawn content in a reply takes the panel palette);
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md);
[DES-003](../../../current/design/DES-003-panel-ui.md) (Markdown path).

Acceptance:

1. In each container `ui/markdown` renders into (`.ai-agent-panel-turn-text`,
   `-card-plan`, `-report-markdown`, `-diff-pane-body`), `pre` and inline code
   have `background-color: var(--code-background)`, which the scope resolves to
   the panel mode's value (dark rgb(24,24,28), light rgb(244,244,242) once task
   057 lands; Obsidian's or the resolver's value before it), under Theme Auto
   and a forced theme opposite the host.
2. No `!important`; `tests/styles.test.mjs` unedited and green.
3. Headings, lists and tables in a reply measure as before.

## Scope

Changed: `styles.css`, `docs/current/design/DES-003-panel-ui.md`,
`RELEASE_NOTES.md`. New: `tests/styles-markdown-code.test.mjs`.

Negative scope: no palette value, no typography; no change to parsing or
sanitising; no TypeScript change.

## Plan

Option (b), chosen: panel-scoped rules for `pre` and `:not(pre) > code` in the
four containers. `pre`: `--code-background`, a 1px `--ai-agent-panel-line`
border (the value `--code-border-color` takes; the palette gate allows that
Obsidian color name only inside the palette blocks), padding `10px 12px` and
`--radius-s`, after the boards' shell-output block, since the block alone is
1.04:1 against the reply background in dark. Inline code follows the boards'
`.md code`: `--ai-agent-panel-fill`, padding `1px 5px`, radius `5px` (a literal
px; no Obsidian radius token is 5, and the styles test allows it).

Rejected, option (a): adding `markdown-rendered` to the containers. It turns on
all of Obsidian's reading-view rules (heading margins, list indents, tables,
callouts, embeds, link and tag styling) and takes its code colors from
Obsidian's own `code` rules, not the boards' values (inline code on the fill
token); it is a large change where code styling alone was missing, and the TS
class list would need a module and test.

Evidence first: `tests/styles-markdown-code.test.mjs` failed (8 of 9) before the
rule, passes after.

## Run log

Rebased onto 057 (palettes re-declare `--code-background`); the new test
reuses `parseRules` from `tests/styles.test.mjs` (which re-runs that suite;
noted for later). Harness (Main fixture, a reply-shaped fragment in each of the
four containers; host light/dark crossed with Theme Auto/Light/Dark), same in
all four containers and following the Theme setting, not the host:
light: `pre` rgb(244,244,242), border rgba(24,24,32,0.08), inline code
rgb(240,240,237); dark: `pre` rgb(24,24,28), border rgba(255,255,255,0.07),
inline code rgb(38,38,44). `pre code` stays transparent; `pre` padding 10px
12px, radius 4px; inline padding 1px 5px, radius 5px; heading margin and list
indent unchanged.

Known gaps for the parity task: code font size (`.86em` mono on the boards;
typography is out of scope here), `pre` min-height, and the copy button, always
visible inside the block (predates this change).

## Independent review

Reviewer: independent review agent. Approved with changes: (1) inline code
must follow the boards' `.md code` (fill token, `1px 5px`, radius 5px): done;
(2) fenced blocks 1.04:1 on the reply background in dark: border and
`10px 12px` padding added, re-measured above; (3) task record: rejection of
(a) completed, gaps listed: done; (4) nit on the `parseRules` import: noted.
One deviation from the review's wording: the border reads
`--ai-agent-panel-line`, not `--code-border-color`, which the palette gate
reserves for the palette blocks.

## Outcome

accepted
