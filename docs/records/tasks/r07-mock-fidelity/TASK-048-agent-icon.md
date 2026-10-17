---
status: closed
release: r07-mock-fidelity
number: 048
prd: PRD-001.R34
---

# TASK-048 — Transparent agent icon in the accent

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The empty state's agent icon sat on an opaque square with a dark stroke
instead of a transparent glyph in the accent. Obsidian draws an icon
registered with `addIcon` as `<svg class="svg-icon <id>">`; the id
`ai-agent-panel` is the panel root's class, so the root rule (`background-color`,
`color`, `display: flex`, `container: size`, `overflow: hidden`) matched the
svg.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R34 (colors, accent included, from the Obsidian theme);
[DES-003](../../../current/design/DES-003-panel-ui.md) Modules, Turn head;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) (components
read tokens; the root rule owns the panel's background and text color).

Acceptance:

1. The registered icon id starts with no panel class prefix and is no class
   any selector of `styles.css` names, at any rule depth or in a class
   attribute selector; a test fails otherwise.
2. The icon's markup is `fill="none"` and `stroke="currentColor"` with no
   filled shape, hard-coded color or style attribute; a test fails otherwise.
3. Both checks have a self-test over seeded bad inputs.
4. Rendered, in the orchestrator's headless harness (recorded in r07's
   verification record): the empty-mark svg's computed background is
   transparent and its colour equals the accent; the turn mark's svg the
   same; no svg carries the class `ai-agent-panel`.
5. The empty-state mark, the turn head's Claude mark, the ribbon icon and the
   view's tab icon draw the one icon from the one id and markup.

## Scope

Expected files:

- New: `src/state/agent-icon.ts` (id and markup, Obsidian-free),
  `tests/state-agent-icon.test.mjs`.
- Changed: `src/icon.ts` (registers from the new module), `src/main.ts`,
  `src/view.ts`, `src/ui/turn.ts`, `src/ui/empty-state.ts` (import
  `AGENT_ICON` from `state/agent-icon`); `package.json` (`pretest`);
  DES-001 (`icon` row), DES-003 (module table, Turn head);
  `RELEASE_NOTES.md`.

Negative scope:

- No restyling: `.ai-agent-panel-empty-mark`, `.ai-agent-panel-turn-mark` and
  the root rule are unchanged; the glyph's geometry is unchanged.
- No edit to `tests/styles.test.mjs`, `tests/architecture.test.mjs` or any
  protected path; no new dependency.

## Plan

- Tests first: with the old id the id test fails on the panel prefix and on
  the root rule.
- Move the id and markup to `state/agent-icon` (the DES-003 home of new
  Obsidian-free modules, already layer 1 for the architecture test, which an
  `src/` module outside it would need edited); `icon` keeps the thin
  `addIcon` call. New id `aiap-agent-mark`.
- Hunt: other registered ids (none); Lucide icons carry `svg-icon` and
  `lucide-<name>` (no rule selects either); no `<img>` or background sits
  behind an icon; the only bare `.ai-agent-panel` class is the root.
- Rejected: scoping the root rule away from svg (`.ai-agent-panel:not(svg)`),
  which leaves the collision for the next rule; renaming the root class,
  which every selector and the token block depend on.

## Run log

- Tests first: with the id set back to `ai-agent-panel` the id test failed
  ("starts with the panel's class prefix"); the first selector scanner
  dropped nested rules with their declarations, found by the self-test.
- The computed-style checks of acceptance 4 (empty-mark svg background
  transparent and colour = accent; turn mark the same; no `ai-agent-panel`
  class on any svg) cannot run in plain Node; they are owed to the
  orchestrator's headless-harness verification record for r07.
- Gate: `make verify` fails only because ESLint scans the untracked
  `.claude/worktrees/`. Run instead: `make toolchain build docs format`,
  `npx eslint . --max-warnings 0 --ignore-pattern ".claude/worktrees/**"`,
  `make test`: all exit 0. The orchestrator re-runs the full `make verify`
  once the worktrees are removed.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

- Major: rendered evidence missing. Resolved: it cannot be produced in plain
  Node; the Run log and acceptance 4 owe it to the headless-harness record.
- Minor: a deferred (not yet loaded) panel tab reads the stored old icon id
  from the saved layout and shows no icon until the view loads. Accepted.
- Minor: `REGISTERED` was hand-listed. Resolved: a test scans `src/` for
  `addIcon(` calls and asserts each id is listed, with a self-test.
- Minor: PRD-001.R1 dropped from the frontmatter and Spec.

## Outcome

accepted. A deferred tab shows no icon until its view loads, because the
saved layout still names the old id `ai-agent-panel`; accepted, it resolves
itself on the next layout save. The icon id and outline checks are now an
automated gate (`tests/state-agent-icon.test.mjs`).
