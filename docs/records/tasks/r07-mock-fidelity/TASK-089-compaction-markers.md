---
status: closed
release: r07-mock-fidelity
number: 089
prd: PRD-001.R37
---

# TASK-089 — Compaction markers

## Spec

Change 002 (R37): the conversation shows when Claude Code compacts it;
the change is incorporated (`docs/records/changes/CHG-002-context-events.md`) and
PRD-001.R37 is in `docs/current`. Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R37 and R28, [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R1, R9, R13, [ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md)
(the compaction record), [DES-003](../../../current/design/DES-003-panel-ui.md)
Compaction dividers, [DES-005](../../../current/design/DES-005-persistence-and-sync.md);
boards `ContextEvents.dc.html` and `LightContextEvents.dc.html`; wire shapes E3
and V5 in `docs/records/verification/`.

Acceptance:

1. `system/status` `compacting` draws a status divider: "Compacting
   automatically…" (a user's `/compact` turn: "Compacting…"), spinner, both
   waves running, sub-line "Context N% full · Claude picks up where it left
   off" (the percentage left out when unknown); `role="status"`.
2. `compact_result: "success"` or `compact_boundary`, whichever first, makes it
   a separator: "Compacted", sub-line "14:20 · 131k → 18k tokens" (a count not
   reported is left out), named "Compacted at 14:20, 131k to 18k tokens".
3. The synthetic summary adds a "Summary" toggle opening "What Claude kept"
   (rendered as a reply is, R17); no summary, no toggle.
4. A failed compaction, or a turn ending while "compacting" or a `/compact`
   turn with no compaction message (the empty session's notice included),
   reads "Compaction did not finish."; the CLI's two notices are not replies.
5. A record `{kind: "compaction", at, trigger, preTokens?, postTokens?,
   summary?}` is written at `compact_boundary` and completed by the summary only
   in the same turn; a compaction with no boundary, a failed or an unfinished
   one writes none. Reopen draws it; the export writes one italic line.
6. The divider follows the prompt when the turn has no block yet; a turn that
   held only a compaction shows no head and no footer. A `/compact` queued
   behind a running turn is a `/compact` turn when its result comes.

## Scope

Expected files: `src/state/compaction.ts`, `tests/state-compaction.test.mjs`,
`package.json` (pretest), `src/state/stream.ts`, `src/state/tab.ts`,
`src/state/turn.ts`, `src/tab/chat-tab.ts`, `src/history.ts`,
`src/history-file.ts`, `src/transcript-markdown.ts`,
`src/ui/compaction-divider.ts`, `src/ui/messages.ts`, `styles.css`,
`tests/fake-cli.mjs`, `tests/tooltips.test.mjs` (one allowed `aria-label` site),
the existing specs, DES-003, DES-005, `README.md`, `RELEASE_NOTES.md`.

Negative scope: `/clear` (R38), the cache countdown, the fork base, provenance,
version 2, Branch; the PRDs and change 002; `tests/styles.test.mjs`,
`tests/architecture.test.mjs`.

## Plan

A pure reducer in `state/compaction` returns the divider's data and the record
operation for each signal, so the order of E3 (status, then boundary) and V5
(success, boundary, summary, `init`) is tested without Obsidian; `chat-tab`
applies the step through `appendTop` (the divider is outside the turn, which
continues after it) and the recorder. The summary is a synthetic `user`
message and must not become the turn's uuid. Tests first; the fake CLI gets
`compact-auto`, `compact-manual`, `compact-failed` and `compact-empty`.

Rendering is checked in the headless harness by the orchestrator: dark and
light at 340, 440 and 600 px against the boards (pill 24 px high, padding
0 10px, 12px/500 label; waves 8 px high, 16 px period, .55 opacity; sub-line
11.5px faint; summary box 12px radius, 12.5px/1.55; 12 px section gap).

Alternative rejected: drawing the divider inside the turn. A turn is one item
with its head and footer; a divider in the middle would split its blocks, and
the existing `!` card already sets the precedent of a top-level item.

## Run log

- The `tooltips` spec lists every `aria-label` site; the divider's one site was
  added there (a requirement, R28, names the label).
- A separator's children are presentational, so the Summary button sits outside
  the element carrying the role and the name.

- Review round 1 (coordinator, harness `hunt-089r`): placement, Markdown
  summary, queued `/compact`, CSS measures, record timing, fake-CLI shapes,
  CLI notices and a11y reworked. The summary box is a tab stop unconditionally:
  DES-001 P4 forbids the layout read that "only when it scrolls" needs.
- The rebase onto `chore/agentic-sdlc` was denied; the coordinator resolves it
  at landing.

## Independent review

Two rounds by a separate review agent (not the implementer), with a browser
harness against the boards in dark and light at 340, 440 and 600 px.

- Round 1, rework: divider placed after the turn head, summary as raw text,
  a queued `/compact` read as automatic, measured size gaps, record written at
  `success` instead of `compact_boundary`, fake CLI shapes off E3/V5, the
  CLI's own notices drawn as replies, a11y.
- Round 2, land after one fix: summary paragraph margins (applied with the
  region name on the focusable summary box). The always-on tab stop is
  accepted (DES-001 P4 forbids the scroll measurement).
- Open, not a blocker: whether the manual `/compact` stdout message carries a
  uuid that Branch would send as the latest prompt; needs a real-CLI run.

## Outcome

Accepted. `make verify` passes; the divider matches the boards at the
reviewed widths and themes.
