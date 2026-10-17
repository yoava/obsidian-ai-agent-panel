---
status: closed
release: r07-mock-fidelity
number: 070
prd: PRD-001.R11
---

# TASK-070 — Last parity gaps: stop icon, segment shadow, motion

## Spec

Governing: [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
(tokens, motion, reduced motion); [DES-003](../../../current/design/DES-003-panel-ui.md)
Token contract; the boards' "Redesign dark" and "Redesign light" pages win over SPEC.

Acceptance:

1. The composer Stop button and a background task's Stop draw the boards' filled
   rounded square (12 of 24, radius 2, `fill: currentColor`, no stroke); the
   accessible name is unchanged. The task Stop is also the board's `.stp`: 24 px,
   12 px icon, faint, radius 7, red-soft hover.
2. The checked effort segment carries `--ai-agent-panel-shadow-small` and its
   1 px ring.
3. Every animation and transition the boards define is audited below against the
   panel; each that exists runs only under `prefers-reduced-motion: no-preference`.
4. `RELEASE_NOTES.md` Unreleased: 069's entry reworded, one entry for this task.

## Scope

Expected files: `styles.css`, `docs/current/design/DES-003-panel-ui.md`,
`RELEASE_NOTES.md`, this task.

Negative scope: no layout, colour or geometry change beyond items 1 and 2; no new
tokens; no behaviour, role or name change; `tests/styles.test.mjs` and
`tests/architecture.test.mjs` unchanged.

## Plan

CSS only. Stop: set the icon rect's geometry, fill and stroke through CSS on
`.ai-agent-panel-icon-button[data-icon="square"] svg rect` (both Stop buttons
share the icon; no other control uses `square`). Rejected: a custom SVG in
`writeIcon` (a second icon path for one glyph). Segment: prepend the shadow token
to the existing ring, as 065 did for the Diff tab. Motion: audit, implement only
what existing tokens cover.

## Motion audit

Boards' animations (SPEC §2.5 and the boards' CSS) against the panel. Under
`reducedMotion: reduce` the measured computed `animation-name` shows none of the
panel's animations running.

| Board motion | Spec | Panel | Token | Reduced motion | Result |
|---|---|---|---|---|---|
| pulse, busy dot | 1.4 s ease-in-out | tab glyph (`pulse-dot`) | `duration-pulse`, `ease-in-out` | off | present |
| pulse, activity dots | 1.2 s, delays 0/.2/.4 s | step dots (`step-dot`) | `duration-dots`, `ease-in-out` | off | present |
| pulse, cache zap | 2 s ease-in-out | no zap icon on the status line | none for 2 s | n/a | skipped: component absent and a 2 s token would be new |
| ring | 1.6 s ease-out | live Claude mark | `duration-ring`, `ease-out` | off | present |
| spin | 1 s linear | loaders, running marks | `duration-spin`, `linear` | off | present |
| slide | 1.8 s ease-in-out, 2 px line under run bar and running agent cards | absent | none for 1.8 s | n/a | stopped: needs a `--ai-agent-panel-duration-slide: 1.8s` token (plus keyframes and a positioned 2 px line) |
| wv | .9 s linear, wave mask | no "Compacting automatically" cue exists | none for .9 s | n/a | skipped: component absent; needs a `duration-wave: 0.9s` token |
| blink | 1 s steps | streaming caret | `duration-blink`, `steps(1)` | off | present |
| shimmer | 1.4 s linear | report skeleton | `duration-shimmer`, `linear` | off | present |
| toggle | .15 s | Obsidian's native switch, unrestyled | none for .15 s | Obsidian's | skipped: not ours |
| card, popover, hover-card enter | none in boards | none | n/a | n/a | n/a |

New tokens needed to finish the audit (stopped, not added): `--ai-agent-panel-duration-slide: 1.8s`,
`--ai-agent-panel-duration-wave: 0.9s`, `--ai-agent-panel-duration-zap: 2s`.

## Run log

Harness (`hunt-070/`, `--repo` this worktree), measured:

- Stop, dark and light: board rect 7 x 7 px at 14 px, `rx` 2, fill the red token,
  stroke none; panel identical (`stop-*` in `measure.json`); pairs
  `final/stop-dark.png`, `final/stop-light.png`.
- Task Stop (V049 vs the Agents board, dark and light): 24x24, icon 12x12, radius 7, faint colour (rgb 140,140,150 dark; 105,105,115 light), both identical (`task-stop.json`).
- Checked segment (PopModel): box-shadow is the three `shadow-small` layers plus
  the inset 1 px ring, dark and light; pairs `final/segment-*.png`.
- Motion: no-preference shows `pulse-dot 1.4s`, `step-dot 1.2s`, `ring 1.6s`,
  `spin 1s`, `blink 1s steps(1)`; under reduce only Obsidian's `node-inserted`
  remains (Main, Agents, ContextEvents, ContextCache, Question, both themes).

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

- Major: the run-bar task Stop was 28 px with a 16 px muted icon; the board's
  `.stp` is 24 px, 12 px icon, faint. Resolution: matched with existing tokens
  (24 px, `radius-7`, `text-faint`, 12 px icon; hover unchanged, which is the
  board's red-soft); measured in V049.
- The motion table's .15 s chevron and hover row was wrong (the boards' only
  transition is the Settings toggle). Resolution: row deleted.
- Known deviation: the board's segment shadow is `0 1px 2px rgba(0,0,0,.2)` plus
  the inset ring; the panel uses `shadow-small` (wider layers), visually close;
  no new token per the brief.
- Nits: template boilerplate dropped; release note says "the redesign's".

## Outcome

accepted
