---
status: closed
release: r07-mock-fidelity
number: 065
prd: PRD-002.R1
---

# TASK-065 — Permission card, question form and shell card parity

## Spec

The permission card, the AskUserQuestion form and the shell card match the
"Redesign dark/light" boards (survey CA1–CA20) at the board's width, in both
themes. Governing: PRD-002.R1, R12, R16; DES-003 Cards; DES-004 card contract.

Acceptance:

- Permission card: edge-to-edge diff on a recessed band; tool icon tile, title,
  folder and `+x −y` sub-line; Diff / Rendered as a `tablist` (arrow keys, Home,
  End, roving tabindex); diff grid, word highlights, gap button; footer of
  "Full input", Deny, Always allow, Allow.
- The tablist, gap button and diff grid are shared code, so they also apply to
  step-row and changes-modal diffs, consistent with the boards.
- Question form: two-column multi-select, board gaps and text size, hint after
  the list, "Other…" input, Dismiss ghost and "Submit answers" primary.
- Shell card: "exit 0", line height 19.55 px, amber commit hashes, footer button.
- Every footer, shell and gap button shows a keyboard focus ring of at least
  3:1 in both themes.

## Scope

Files: `src/state/{permission,tab,roving,shell-output}.ts`, `src/diff.ts`,
`src/diffview.ts`, `src/tool-labels.ts`, `src/transcript-markdown.ts`,
`src/ui/{permission-card,question-form,shell-card,turn,dom}.ts`, `styles.css`,
`package.json` (pretest list), tests, DES-003, DES-004, `RELEASE_NOTES.md`.

Negative scope: what a permission answer sends, auto-approve rules, control
requests, report cards (066), other tasks' areas.

Label changes (same action): Submit becomes "Submit answers"; shell "done"
becomes "exit 0". Deny, Always allow, Allow, Dismiss unchanged.

## Plan

Tests first for the Obsidian-free logic (`rovingIndex`, `outputParts`,
`cardLocation`, `isPathLike`, aligned word diff, titles and icons), then UI and
CSS, then board-versus-panel measurement.

Known differences:

- CA14: the board's Question form has two questions and one "Other…"; one per
  question stays, because a single input has no defined question and changing
  it would change what answers send.
- `isPathLike` is a heuristic for the code-font option labels.
- Selected tab: `--ai-agent-panel-shadow-small` plus the ring, as the existing
  popover rule does; no new token.
- Word highlights come from the plugin's aligned diff; the board's are
  hand-authored and differ on some words.
- A title sent by the CLI keeps precedence over the new fallback title.

## Run log

- Tests added: `state-roving`, `state-shell-output`, `diff-align` (including a
  work-budget test); extended `state-permission`, `state-tab`,
  `tab-shell-escape`.
- Evidence in the harness folder `hunt-065/final/`: `permission-{dark,light}.png`,
  `question-{dark,light}.png`, `permission-300.png`, per-element measurements
  `{board,panel}-{permission,question,shell}-dark.txt`,
  `measured-interaction.json` (tablist, keyboard, Full input, gap row) and
  `measured-focus.json` (focus ring per button, both themes, 3.0 to 3.94).
- Shell card measured against the board in dark only.
- Word-diff timings (ms, HEAD to now): 10 table rewrites 5.8 to 11.0; 1 dense
  block 1.7 to 2.0; 20 dense blocks 37.8 to 39.0.
- At 300 px the Diff / Rendered tabs wrap below the title and the answer
  buttons wrap together, end-aligned.

## Independent review

Verdict: approve with changes. Findings and resolutions:

- B1 (blocker), focus ring lost on card footer, shell footer and gap buttons:
  `:focus-visible` outline rules added; measured on every button.
- M1, word-diff alignment cost: pairs are scored by shared token characters,
  `refinePair` runs only for chosen pairs, and a block over `MAX_ALIGN_WORK`
  (Σ tokens²) pairs by offset; tests count work.
- m1 head wraps at narrow widths; m2 answer buttons form one group; m3 tablist
  named (card title, path or hidden text); m4 Rendered panel exists up front;
  m5 one stat writer (`writeDiffStat`); m6 gap padding is logical.
- m7 scope and acceptance now name step-row and changes-modal diffs; n1 selected
  tab shadow reuses existing tokens; n2 CA14 reason corrected; n3 shell status
  has hidden "succeeded" or "failed"; n4 `baseName` shared from `tool-labels`.

## Outcome

accepted
