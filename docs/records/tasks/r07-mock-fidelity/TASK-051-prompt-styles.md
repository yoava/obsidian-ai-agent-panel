---
status: closed
release: r07-mock-fidelity
number: 051
prd: PRD-001.R33, PRD-001.R28, PRD-001.R25
---

# TASK-051 — Three prompt styles: Quiet, Bubble, Pop-out

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A requirement change (owner request, SPEC §2.7, §4.6, D17): "Prompt style"
gains Quiet, the numbered full-width layout on the panel's background with an
amber border; Pop-out stays the default and takes the bubble's fill and border;
Bubble is unchanged. The settings show the three as cards. The delta is
[change 005](../../changes/CHG-005-prompt-styles.md).

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R33 (reworded by this task), R28, R25;
[DES-003](../../../current/design/DES-003-panel-ui.md) Prompts, Settings that
reach the panel, Token contract;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) (tokens only
in components);
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md) (a
stored value still valid).

Acceptance:

1. `PROMPT_STYLES` is `["quiet", "bubble", "popout"]`; the default stays
   `popout`; stored `quiet`, `bubble` and `popout` load as they are; any other
   stored value loads as `popout`.
2. `promptLayout(style)` returns `{ numbered, quiet, rail }`: Quiet
   `{ true, true, true }`, Pop-out `{ true, false, true }`, Bubble
   `{ false, false, false }`.
3. The root carries `mod-prompt-numbered` for Quiet and Pop-out, plus
   `mod-prompt-quiet` or `mod-prompt-popout`; `mod-prompt-bubble` for Bubble;
   `mod-pin-prompt` follows the pin setting in every style; `mod-prompt-rail`
   shows with Quiet and Pop-out when "Prompt jump rail" is on, and the rail is
   mounted under the same condition.
4. Tokens: one pair, `--ai-agent-panel-user-bg` and `-user-line`, fills and
   borders the bubble and Pop-out (the separate `-prompt-fill`, `-prompt-line`,
   `-bubble-fill`, `-bubble-line` and `-prompt` are gone); `-amber`,
   `-amber-text`, `-amber-soft` (22%) and `-amber-line` (42%) are new. Values
   keep the derivation from Obsidian variables.
5. Numbered prompts: Pop-out has the `user-bg` fill and `user-line` border;
   Quiet has the panel background and the `amber-line` border; both have the
   number badge (`amber-soft` fill, `amber-text`, radius 5, at least 18 × 18)
   with "You" in `amber-text`, and prompt text at weight 400. The bubble keeps
   its look in `user-bg` and `user-line`. The pinned prompt takes the same
   fill and border per style.
6. Settings > Messages > Prompt style is a `radiogroup` named by the row's name
   (`aria-labelledby`, no `aria-label`) of three cards in the order Quiet, Bubble, Pop-out; each card is a decorative mini
   preview over a radio with the name stacked over its caption ("numbered,
   outlined", "right-aligned", "numbered, tinted"); the radio is named by the
   name and described by the caption; no tooltips. "Prompt jump rail" shows
   with Quiet and Pop-out and says so.
7. PRD-001.R33 and R28 reworded, change 005 incorporated, DES-003 and DES-001
   state the present answer.

## Scope

Expected files:

- Changed: `src/settings-core.ts` (`PROMPT_STYLES`, `promptLayout`),
  `src/settings.ts` (the cards), `src/ui/shell.ts` (root classes),
  `src/view.ts` (rail mount), comments in `src/ui/prompt.ts` and
  `src/ui/jump-rail.ts`, `styles.css`, `tests/settings-core.test.mjs`.
- Docs: `docs/current/product/PRD-001-chat-panel-and-sessions.md` (R33, R28),
  `docs/work/changes/CHG-005-prompt-styles.md` (closed in the commit),
  `docs/current/design/DES-003-panel-ui.md`,
  `docs/current/design/DES-001-system-overview.md`, `README.md`,
  `RELEASE_NOTES.md`.

Negative scope:

- No palette values (a later task under ADR-017 replaces the token values with
  the mock's), no fonts, no theme setting change, no tooltip setting, no tab
  strip, no change to the sticky-prompt mechanism.
- No new module, dependency or setting key; no edit to
  `tests/styles.test.mjs`, `tests/architecture.test.mjs` or any protected path.
- `docs/work/research/redesign-canvas/` is not edited.

## Plan

- Tests first: `PROMPT_STYLES` order, the default and the normaliser,
  `promptLayout` over the three styles (names start `PRD-001.R33`).
- `promptLayout` lives in `settings-core` beside `PROMPT_STYLES` (layer 1,
  already in `pretest`), read by `ui/shell` (classes), `view` (rail) and
  `settings` (rail row visibility), so the decision exists once.
- CSS: the numbered rule becomes `mod-prompt-numbered`; Quiet overrides border
  and fill. Badge, "You" and text weight are base rules because Bubble hides
  the badge and "You" already.
- Cards: a module-level `drawPromptStyleCards` in `settings.ts`, appended to
  the row element (the row wraps) with native radios so the arrow keys work;
  the group carries the panel token scope like the args error.
- Rejected: a dropdown kept beside the cards; a new `ui/` module for the cards
  (the architecture test's settings rule would need an edit).

## Run log

- Tests first: the three new `settings-core` tests failed before the
  change (`promptLayout` missing; Quiet unknown).
- Base `efa7bf6` (the worktree was on `main`, unmodified, and was switched to
  `chore/agentic-sdlc`).
- The theme cards the brief points to do not exist in this tree (Theme is a
  dropdown), so the card pattern was built here from SPEC §4.6 and
  `Settings.dc.html`.
- "Context line hidden in numbered styles" (SPEC): in the plugin the
  bubble's context line and the numbered head's context label are one element,
  already in the head in numbered styles; nothing to hide.
- Bubble's token pair (9% / 35%) became the shared pair, so Pop-out is lighter
  than before (was 14% / 50%): the request says "in the bubble's fill and
  border".
- `--ai-agent-panel-amber-text` mixes orange 50% with the text color: plain
  orange on light backgrounds is likely under 4.5:1 (DES-003's earlier
  decision); the real values come with the palette task.
- Owed to the orchestrator's harness (rendering, not checkable in plain Node):
  see the report of this task.
- Phase 2: the branch moved to `068c5f5` (task 049) by stash, switch and pop;
  one conflict in DES-003's test map, resolved by keeping 049's rows and this
  task's R25 and R33 additions.
- The harness's `PromptStyleQuiet` fixture note "rendered Pop-out" is stale:
  the reviewer set `promptStyle=quiet` (`--setting`) and measured Quiet.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes. Harness
checked: root classes, borders and fills, badge, text weight, pin bar, and
contrast (5.09 to 9.31); 9% / 35% matches the boards.

- Blocker: the radiogroup carried `aria-label` "Prompt style", failing 049's
  tooltips test and showing an Obsidian tooltip. Resolved: `aria-labelledby`
  the row's name element, which gets an id.
- Major: every radio change called `refreshVisibility()`; before Obsidian 1.13
  the redraw dropped focus to `BODY` after one ArrowRight. Resolved: it runs
  only when `promptLayout(old).rail !== promptLayout(new).rail`, and the redraw
  refocuses the checked radio (a one-shot flag read by `drawPromptStyleCards`).
- Minor: cards wrapped and the sync badge dropped against the board at 680 px.
  Resolved: three cards in one row (`flex: 1 1 0`, max 190 px, no wrap) and the
  row's info element `flex: 1 1 0; min-inline-size: 0`.
- Minor: the row description now reads the board's "How your own messages
  stand out in the transcript."; the captions carry the rest.
- Minor: prompt styles never shipped, so the release notes fold Quiet and the
  cards into "Prompts, redrawn." and drop clauses about changes no user saw.
- Minor: change 005 quotes R33's Bubble sentence and R28 verbatim, before and
  after.
- Nits: focus ring via `:has(input:focus-visible)`; the card name is
  `--font-ui-small`.

## Outcome

accepted.
