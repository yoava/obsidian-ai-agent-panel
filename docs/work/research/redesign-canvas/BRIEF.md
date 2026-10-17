# Panel redesign: implementation brief

Research input for the L change that implements the "AI Agent Panel Redesign"
canvas. Nothing here governs; the change delta, ADRs, DES-003 rewrite and
tasks it leads to do, once a human approves each.

## Sources

- `SPEC.md`: the canvas as a specification. §2 design system and the token
  to Obsidian-variable mapping, §3 layout and responsive rules, §4 every
  board, §5 decisions the owner made while designing, §6 what is mock-only or
  unverified, §7 forty open questions with recommended answers, §8 the
  owner's requests verbatim.
- `project/*.dc.html`, `project/canvas.json`: every board, byte-identical
  to the canvas at https://claude.ai/artifact/7oFC6qZknD4LiF4ib7Ef6y
  (version 1791836126-ab91, canvas v48; open a `.dc.html` in a browser;
  `canvas.json` gives pages, order, titles and rows). Implement the pages
  "Redesign dark" and "Redesign light" (`Light*` wrappers); ignore the two
  "not for implementation" options pages. `generator/common.css` is the
  shared stylesheet; `generator/pops.py` reproduces the three Pop boards. The
  two mobile boards SPEC §4 mentions were dropped from the canvas: do not
  implement.
- Governing today: `docs/current/constitution.md`, `docs/current/adr/`,
  `docs/current/plan.md`, `docs/current/open-decisions.md`; the PRDs and DES
  drafts in `docs/work/` until accepted.

## Owner decisions that override SPEC §7

Filled in by the owner before Phase 1 starts. Until then SPEC §7's
recommendations apply.

| Topic | Decision |
| --- | --- |
| Accent | Obsidian's accent; no accent setting (Q5) |
| Look | Inside the panel and the workflow view the mock's look wins over Obsidian's theme (2026-10-12; ADR pending) |
| Theme | Auto (default), Light, Dark, in Settings and the panel menu; Light and Dark use the mock's full palettes whatever Obsidian's mode (2026-10-12) |
| Tabs | Browser style on Obsidian's workspace tab header (SPEC D16) |
| Prompt style | Quiet, Bubble, Pop-out (default); Pop-out in the bubble's colours (SPEC D17) |
| User-message color | pending: fixed amber as today, or derived from `--color-orange` with non-color cues |
| Tabs setting | keep Top / Side / Automatic; Automatic switches to the list column at 820 px with the existing hysteresis (Q3) |
| Markdown rendering boundary | pending: see D-06 and ADR-010; the panel must not run other plugins' code processors on model text |
| `/clear` | stays in the conversation, SPEC §5 D1; ask before clearing when `/clear` carries text (Q19) |
| Stop semantics | composer Stop interrupts the turn; "Stop all" stops agents and shells (Q22) |
| Workflow view | design as mocked; fall back to a flat agent list when the CLI reports no phases (D3) |

## Constraints

- The constitution, every accepted ADR, and AGENTS.md §4 design rules.
- Runtime libraries only bundled and screened (ADR-007); no network.
- Colors, spacing, radii and fonts from the mock (the Look decision above),
  through a plugin-prefixed token layer; accent from Obsidian.
- CSS: size container queries and `:has()` are available; scroll-state
  queries are progressive enhancement only (Electron 33 lacks them), so the
  stuck-prompt state comes from an `IntersectionObserver` class. No
  `column-reverse` on the message list: DOM order stays chronological and a
  flex spacer bottom-aligns a short transcript (SPEC §3). Size containment
  needs a definite height on the panel root; otherwise inline-size
  containment plus a `ResizeObserver` class for the height rule.
- DOM text through `createEl`/`setText`; sentence-case UI text; no
  `innerHTML`; `aria-label` on every icon-only control; roles and keyboard
  reach for tabs, rows, menus and popovers; `prefers-reduced-motion`.
- UI performance requirement PRD-001.R29 (typing latency while streaming,
  frame budget, reopen time, idle work, memory on tab close).
- Tests: logic in Obsidian-free modules under `node:test`; add each new
  module to `pretest` in `package.json`. `tests/fake-cli.mjs` for every
  automated and routine manual run; a real-CLI run spends metered usage and
  needs the owner's approval first.
- `make verify` green before every commit; one task per commit with a
  `Task: NNN` trailer; the *Unreleased* section of `RELEASE_NOTES.md` and the
  owning doc updated in the same commit.
- Protected paths are never edited without the owner's explicit say-so.
- `graphify query` before grepping raw source (repo hook).

## Phases and gates

Each phase ends at a human gate. Present the artifacts, stop, and wait.

### Phase 1: requirements (change delta)

`docs/work/changes/CHG-001-panel-redesign.md` from `.agentic/templates/change.md`,
against the accepted PRDs. ADDED, MODIFIED and REMOVED requirements with
EARS clauses (one `shall` each; `scripts/check_prd.py` rules). Cover at
least: layout and responsive rules (SPEC §3); the status line and its three
popovers; the prompt style, pinned prompt and jump rail settings; the theme
setting; assistant turn, steps card and turn footer; report cards for all
15 panel commands, the slash menu groups and "no tokens" labels; agents run
bar, per-agent stop, "Stop all", the workflow view; context-event dividers,
compaction states; `/clear` in the conversation with undo, queueing and the
confirm; cache state in the context indicator; starter prompts; Esc to stop;
"Restore all"; settled permission-card state; accessibility (PRD-001.R28); the history button rules; what is REMOVED (the fixed
left bar, the footer meters, the usage modal if Q31 holds). Mark anything
SPEC §6 lists as unverified with the CLI evidence it needs. Gate: owner
approves the delta and folds it into the PRDs.

### Phase 2: design

ADRs, each comparing at least two options honestly, in `docs/work/adr/`:

1. Panel UI architecture: decompose `src/view.ts` by vertical slice into
   Obsidian-free state and view-model modules plus thin DOM components;
   walking skeleton first; the alternatives are a CSS-first reskin and a
   full decomposition before any visual change.
2. CSS architecture: plugin-prefixed semantic tokens over Obsidian
   variables (SPEC §2.1 mapping: hover and resting fills split, status text
   through `--text-success/error/warning`, `color-mix` over channel
   variables), container queries, the forced-theme mechanism (re-scope
   Obsidian's theme classes or a plugin palette, SPEC §7 Q4), motion policy.
3. Dev-only DOM test harness for view-model and component tests (compare
   the mature options; amends ADR-014).
4. `/clear` inside a conversation: one session id per segment in the stored
   conversation, resume from the latest, undo (amends ADR-005; Codex
   cross-review before acceptance, as the owner asked).
5. Markdown rendering boundary, if D-06 has not settled it.

Rewrite `docs/work/design/DES-003-panel-ui.md` as the target
design: layout model, component boundaries and their single jobs, state
machines (composer, turn, permission card, tab, clear/compact segment),
token contract, keyboard and accessibility, performance budget, and a
verification matrix (300, 440, 680 and 1040 px wide; 600 px tall; light and
dark; default and one community theme; zoom; a pop-out window). Update
DES-005 (segments), DES-007 (cache state) and DES-004 (settled card) where
they change. Gate: owner approves ADRs and designs.

### Phase 3: plan

Dependency-ordered tasks in `docs/work/tasks/r06-panel-redesign/` from
`.agentic/templates/task.md`, numbered after the highest task number in
`docs/`. Suggested order: 001 walking skeleton (responsive shell, header,
composer, status line; mounts today's transcript and cards as adapters;
sends one prompt, streams, stops, answers one permission; narrow and wide
layouts); 002 token layer and theme setting; 003 tabs, switcher and list
column; 004 prompts, pinned prompt, jump rail, settings; 005 assistant turn,
steps card, turn footer; 006 report cards and slash menu; 007 status-line
popovers; 008 permission and question cards; 009 agents run bar and stops;
010 workflow view; 011 context events, `/clear`, undo; 012 accessibility and
keyboard; 013 performance evidence; 014 docs, README disclosures, old CSS
removed. Gate: owner approves the plan.

### Phase 4: build

Per task, in a fresh context: tests first for the pure modules (confirm they
fail), implement, manual matrix run with the fake CLI, `make verify`, an
independent review agent, Codex cross-review for 004/011 storage and any
trust-boundary change, record the run log and review in the task, `make
close`, one commit. Never widen a task; stop and ask for a plan update.

### Phase 5: ship

Release notes titled, release PR into main, tag by the owner.

## Models

Opus for ADRs, DES-003, state machines and reviews; Sonnet for implementing
specified tasks and CSS; Haiku for mechanical edits. Independent review is
never the implementing agent.

## Negative scope

No second agent (Codex) support; no mobile; no accent setting; no new
runtime dependency; no protected-path edits; no real-CLI runs without
approval; no weakening of a failing gate.
