---
status: closed
release: r07-mock-fidelity
number: 056
prd: PRD-001.R33
---

# TASK-056 — Prompt titles cut mid-word without an ellipsis

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The pin bar and the rail tick labels showed a long prompt's first line cut at
80 code points, mid-word and with no sign of the cut ("…link each one to the
projec"). The same text is the conversation's stored title, so the cut also
showed in tab cards, the column header, history rows, notices, close
tooltips, branch titles and transcript frontmatter.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R33 (pin, tick tooltip), R7 (title, "up to 80 characters", still literally
true);
[DES-003](../../../current/design/DES-003-panel-ui.md) Pinned prompt, Jump rail;
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) title rule.

Acceptance:

1. A first line of 80 code points or fewer is unchanged; a blank one is
   "Untitled".
2. A longer one ends with "…" (U+2026), 80 code points in all, cut at the
   last whitespace within the 12 code points before the cut when there is one
   (the blanks before it dropped), else at the limit; never inside a
   surrogate pair.
3. The pin text, the rail tick label and its tooltip, and the title stored
   for a new conversation (`tab/recorder`) all use that text.
4. Titles already stored stay as they are; nothing re-derives them.
5. Rendered, in the orchestrator's harness: for a prompt whose first line is
   over 80 code points, `.ai-agent-panel-pin` text and the rail tick labels
   end with "…" and are at most 80 code points (ticks after the "N · "
   prefix); a short prompt has no "…".

## Scope

Expected files:

- Changed: `src/conversation-list.ts` (`promptTitle`), `tests/conversation-list.test.mjs`,
  `tests/state-prompts.test.mjs`, `tests/tab-recorder.test.mjs`; DES-001
  (file map), DES-003, DES-005; `RELEASE_NOTES.md`.
- `src/state/prompts.ts`, `src/ui/prompt.ts` and `src/tab/recorder.ts` call
  `promptTitle` and need no change beyond the name (`tab/recorder` none).

Negative scope:

- No CSS truncation change; `TITLE_MAX_CODE_POINTS` stays 80; no change to
  file-name derivation (`sanitizeName` cuts to 60 characters, so the ellipsis
  never reaches an export file name); no rewrite of stored titles; no other
  text.

## Plan

- Tests first: the cut-title tests fail on the missing ellipsis.
- One function, `promptTitle`, serves the stored title, the pin and the
  tick; it collects at most 81 code points of the first line.
- Rejected: a separate display-only label with the stored title left cut,
  since the stored title is shown in many places and keeping it cut left the
  mid-word cut visible there; a display-side guess at old titles.

## Run log

- Tests first: the cut tests failed on the missing ellipsis, then passed.
- First draft kept the stored title uncut on the claim that the export file
  name derives from it; review showed `sanitizeName` cuts to 60 characters,
  so the ellipsis never reaches a file name, and the draft's separate
  `promptLabel` was merged into `promptTitle`.
- The recorder's title is covered by a `tab-recorder` test.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

- Major: the reason for keeping the stored title uncut was wrong
  (`sanitizeName` cuts to 60 characters), and users still saw the mid-word cut
  through the stored title. Resolved: one `promptTitle` for the stored title,
  pin and tick; DES-005 reworded; recorder test added; release note names
  titles; old titles untouched.
- Minor: the label built an array of the whole first line on every draw.
  Resolved: at most 81 code points are collected.
- Nit: DES-001 file map omitted the label. Resolved.

## Outcome

accepted.
