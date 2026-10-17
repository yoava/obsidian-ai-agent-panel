---
status: closed
release: r07-mock-fidelity
number: 080
prd: none (test-only refactor)
---

# TASK-080 — Share the CSS rule parser between tests

## Spec

Refactor, S. `tests/layers.test.mjs` imported `parseRules` from
`tests/styles.test.mjs`, which reran every styles test. `parseRules`,
`splitList` and `splitComplex` move to `tests/css-rules.mjs`, which has no
test registrations.

Owner authorised the `styles.test.mjs` edit on 2026-10-13, limited to this move.

Acceptance:

1. `node --test` runs each unique test name once; the unique name set is
   unchanged.
2. `make verify` exits 0.

No `RELEASE_NOTES.md` entry: test-only change, no user-visible behaviour.

## Scope

Changed files:

- New: `tests/css-rules.mjs` (the three helpers, exported).
- `tests/styles.test.mjs`: the helpers removed; one import line added.
- `tests/layers.test.mjs`, `tests/palette.test.mjs`,
  `tests/styles-markdown-code.test.mjs`: the `parseRules` import now points at
  `css-rules.mjs`. The last two were not in the brief; they imported
  `parseRules` from `styles.test.mjs` and would break once it stopped
  exporting it.

Negative scope: no assertion, fixture, or product code changes; no new tests;
no change to `tests/architecture.test.mjs`.

## Plan

Move by line range, add exports, update imports. No new test is written: the
existing suite is the regression check, compared by test name before and after.

Test count: 1171 before, 1147 after. The 24 removed entries are duplicate
registrations: 8 `styles.test.mjs` names each ran 4 times (once per importing
file), so 3 extra copies each, 24 in all. The unique name set is identical
(1147 names before and after).

The `palette.test.mjs` and `styles-markdown-code.test.mjs` import edits follow
from the owner's authorisation: without them both break once `styles.test.mjs`
stops exporting `parseRules`.

## Run log

- Baseline: 1171 pass, 0 fail (`node --test`, Node 22.23.1).
- After the move: 1147 pass, 0 fail; unique names identical.
- `make verify`: exit 0.

## Independent review

- Reviewer: independent review agent.
- Verdict: approve.
- Findings: none blocking. The two extra import edits are implied by the
  owner's authorisation; recorded in Plan.
- Resolution: the 24-count breakdown was checked against the baseline and
  is 8 names × 4 copies, 3 extra each.

## Outcome

Accepted.
