---
status: closed
release: r06-panel-redesign
number: 042
prd: PRD-001.R28, PRD-001.R29
---

# TASK-042 — Close-out

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 12: remove the last of the old view, the `legacy` item kind,
the legacy CSS tail and the allowlist, and record the accessibility audit and
the performance profiles on the finished layout, so change 001 can ship as
release `r06-panel-redesign`.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R28, R29; [DES-003](../../../current/design/DES-003-panel-ui.md) Keyboard and
accessibility, Performance budget, Verification, Build order;
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md);
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Migration
from `styles.css`; [change 001](../../../records/changes/CHG-001-panel-redesign.md)
Rollout, documents, verification.

Acceptance:

1. No `legacy` item kind, no legacy CSS tail and no allowlist remain; every
   rule in `styles.css` passes `tests/styles.test.mjs`; the architecture test
   runs every rule with no named exception.
2. Rules for DOM no slice replaced (the diff view, the plugin's modals and
   pickers, the suggest popups, the settings tab) are rewritten above the
   tail in token form before it is deleted, with no visual change beyond the
   tokens.
3. `view` holds only DES-001's remaining view jobs: the tab list and its
   persistence, the shared `obsidian` MCP server, mounting the panel-level
   components, and the intents that need a service.
4. PRD-001.R28 audit recorded: contrast of prompt text in Obsidian's default
   light and dark themes (M3), keyboard only and a screen reader (M6),
   reduced motion and Windows high contrast (M7), every icon-only control,
   segment, the switcher and the rail labelled.
5. PRD-001.R29 profiles recorded on the new layout (M8): streaming while
   typing in another tab (keystroke echo within 50 ms, p95), a 1,000-message
   reopen (last screen within 1 s, no visible reflow), 60 s idle (no timer,
   no frame callback), a heap snapshot after closing a tab (DOM, listeners,
   observers, timers and render children released), a forced theme with
   30,000 elements; no frame over 100 ms.
6. The full matrix M1 to M8 passes on the finished panel, and every new or
   changed ID of change 001 is named in a `node:test` case or a recorded
   manual row.

## Scope

Expected files:

- Changed: `src/view.ts`, `src/state/tab.ts` and `src/ui/messages.ts` (the
  `legacy` kind out), `styles.css`, `tests/architecture.test.mjs` (the
  allowlist mechanism out), `tests/styles.test.mjs` (no tail).
- Docs: DES-001 (view jobs, components and ownership for the removed view
  code; the file map); `README.md` (a pass over the feature list, the
  disclosures unchanged); `docs/current/plan.md` (change 001 built);
  `RELEASE_NOTES.md`.
- Evidence: `docs/records/verification/` records of the R28 audit, the R29
  profiles and the full matrix.

Negative scope:

- New behavior; changes 002 and 003; the D-01 formatter and D-02 gates
  (deferred past the redesign).
- Titling the release notes, `npm version`, tags, pushes (the owner's).
- No new dependency; the architecture- and styles-test edits above are the
  only protected paths, tightening only (owner's 2026-10-11 instruction, recorded in the Run log;
  a loosening edit stops for the owner); no real-CLI run.

## Plan

- Tests first: the styles test without the tail marker fails on today's
  remaining legacy rules; the architecture test without the allowlist must
  pass once 034, 035 and 037 have removed its rows.
- Code removed from `view.ts`: whatever earlier slices left of the old
  rendering and the `legacy` builders; `ChatTab` shrinks to what `view`'s
  jobs need.
- If the reopen profile fails, ADR-016's fallback: `overflow-anchor: none`
  on the message list and `scrollTop` compensation after each insert and each
  settled render. If the forced theme's one-off setup exceeds 100 ms,
  ADR-017's 500-rule chunks.
- Verification: `make verify`; the matrix, audit and profiles by someone
  other than the implementer; independent review of the whole change's
  traceability against PRD-001, PRD-002, PRD-003 and PRD-005.
- Risks: a legacy rule still styling something the tail's deletion breaks
  (rewrite first, delete second, compare screenshots at 300 and 1040 px); a
  profile failing late (each slice ran its own matrix rows and M8's parts).
- Rejected: keeping the tail for the unreplaced DOM (ADR-017: the last slice
  deletes it; legacy rules would escape the styles test).

## Run log

- Tests first, against 89db517 (041's wip): `styles` failed both checks
  (110 breaches below the old marker: Obsidian color variables, channel
  variables, the dead `.ai-agent-panel-thinking`); `state-turn` failed on
  import (no `addNote`); `state-composer` failed the offer chips' names and
  the three `fitChips` tests (041 review nits, below). `architecture`
  passed without its allowlist, which 037 had emptied.
- Protected paths, under the owner's instruction of 2026-10-11, tightening
  only: `tests/styles.test.mjs` checks every rule of the file, requires the
  token block first and fails on any "legacy tail" text; its marker,
  `checkedPart` and `markerLines` are gone, and its self-test now seeds a
  rule after a would-be marker, which is caught.
  `tests/architecture.test.mjs` loses `ALLOWLIST`, `allowed` and the
  row-count test; the boundary test asserts no breach at all. No
  `package.json` change.
- Choices the accepted docs leave open, for review:
  - The branch note, the last legacy item, is a `note` item (`state/tab`
    `NoteItem`, `state/turn` `addNote`, `ChatTab.addNote`), drawn by
    `ui/messages` as text in `.ai-agent-panel-note`; live only, as before.
    `ui/messages`' drawn-item map loses its unread `turn` and `card` fields.
  - CSS no slice replaced, rewritten in token form and logical properties
    before the tail went: the diff view, the two diff dialogs, the
    confirmation buttons (`ai-agent-panel-permission-buttons` renamed
    `ai-agent-panel-modal-buttons`, the old card's name), the history
    picker, the settings tab, `.ai-agent-panel-hidden`. Mapped one to one:
    `--color-green`/`-red` to `added`/`removed`, their 12% and 32% fills to
    `-soft` (12%) and `-word` (30%), `--color-orange` and `--text-error` to
    `warning` and `error` (Obsidian defines both so), `--text-*` and
    `--background-*` to their tokens. The Rendered view's pane borders
    (50%) had no token: `--ai-agent-panel-added-line` and `-removed-line`
    join DES-003's token table. The settings tab is Obsidian's modal, not a
    scope, so its error line carries `ai-agent-panel-scope` itself.
  - Dead CSS removed: `.ai-agent-panel-thinking` (no element since 037)
    and the second, identical `@keyframes ai-agent-panel-spin` (039 and
    040 each added one).
  - 041 review nits, at the coordinator's request: an offer chip is named
    by its text and its tooltip, as an on chip is (WCAG 2.5.3); when not
    even the first chip fits beside "+N" in the one-line form (a 300 px
    main column with Stop showing), `fitChips` shows it anyway,
    `is-squeezed`, shrunk into the room left while that room is at least
    "+N"'s width (a lone chip takes the whole row); a squeezed chip is never
    measured, so its cached width stays its whole one.
- Harness (scratch only, never in the repository): the real
  `AgentPanelView` mounted in headless Chromium 148 with Obsidian 1.14.4's
  `app.css` and `enhance.js` from the local install, a shim `obsidian`
  module (its `MarkdownRenderer` appends the parsed DOM at once and settles
  a microtask later, as 1.14.4's `app.js` does), and streams shaped like
  the fake CLI's `turn` and `steps`. Not a real-Obsidian run: results in
  [the record](../../../records/verification/2026-10-12-r06-accessibility-and-performance-harness.md).
- R29 failed first in the harness: a reopened 1,000-message conversation
  stopped 186 px short of its end, permanently. The last reply's code
  fence comes back after `MarkdownRenderer.render` settles and grows the
  last screen below the view, which scroll anchoring does not cover and the
  120 px follow rule refused. With an asynchronous renderer the shortfall
  was 1,171 px. Fixed, test first (`state-tab` failed on import, no
  `followsEnd`): `ui/messages` keeps whether the view follows its end, set
  by its own scrolls to the end and by scroll events through `followsEnd`
  (a scroll up leaves it unless still within 120 px, a scroll down to
  within 120 px joins it, anything else keeps it), and scroll-follow
  follows while it holds; a switch saves a following tab as near the end.
  Anchoring still keeps prepended sections (measured: the last section
  moved at most 1 px while 122 older sections drew). This is ADR-016
  Reopen's fallback in part: its "compensate after each render that
  settles" through scroll-follow, without `overflow-anchor: none`, since
  inserts above need no script. DES-003 Stream to messages and Reopen say
  so.
- The whole-model lookups (`callPath`, `cardFor`, `agentPath`) were
  profiled on a 1,000-message model streaming 36 tool calls: a `tool_use`
  took p95 1.8 ms (max 2.9), a `tool_result` p95 1.0 ms (max 3.4); no
  budget is near, so no index was added.
- Docs: DES-001 (the `view` row and the overview line, the view's mounts),
  DES-003 (token rows, scroll-follow, Reopen, the branch note, the offer
  chips' names, `is-squeezed`, the R28 and R29 test rows), DES-004 (the
  `view` row: no diff of its own), `DEVELOPMENT.md` (four test rows),
  README (step rows for edits and Chrome actions, the reopen, the squeezed
  chip), `plan.md`, RELEASE_NOTES.
- Slice leftovers removed: `numberPrompts` (`state/prompts`, 035's numbering,
  replaced by the model's in 037) and `itemsFromStored` (`state/tab`), both
  reached only from tests; their numbering cases now run through
  `modelFromStored` in `state-tab` and give the same numbers. Left for the
  owner: `formatDiffStat` (`diff`), test-only since the initial commit.
- Files beyond the expected list: `src/state/turn.ts`, `src/tab/chat-tab.ts`,
  `src/ui/turn.ts`, `src/state/prompts.ts`, `src/diffview.ts`,
  `src/confirm-modal.ts`, `src/settings.ts`, and for the 041 nits
  `src/state/composer.ts`, `src/ui/composer.ts`; their tests; DES-003,
  DES-004, `DEVELOPMENT.md`.
- Codex cross-review (89db517 to the tree, correctness framing, read-only,
  repository only), then one follow-up on the fixes. Fixed, tests first
  where pure (each failed before): `followsEnd` kept following after a jump
  of the panel's own down the messages (rail, pinned prompt, a plan's
  reveal) and after slow scroll steps under 1 px, each taken as jitter while
  the reference moved with them; the reference now stays until a move of
  more than 1 px, and the panel's own jumps decide the state from where they
  land (`jumped`). A send's or a waiting card's forced follow, pending for
  its frame, overrode a scroll up made meanwhile; it now keeps where the
  view was when asked and yields to a scroll up since and to a jump away
  from the end (the follow-up found a first version, cancelling it from
  scroll events, out of order with the send). The plan's reveal decides
  from where the view is at that moment, not from how far it moved. A lone
  chip was hidden behind "+1" when "+N"'s cached width exceeded the room;
  it now always shows. Kept (041's, conservative): "+N"'s width is cached
  by its current label's length, so at the 9-to-10 boundary one chip fewer
  can show than would fit. Confirmed: no remaining reference to the removed
  names; no selector, specificity or token-scope change in the CSS rewrite;
  the note item through model and view. Harness re-run: the reopen at its
  end; while a reply streams, a 400 px scroll up stays, a rail jump stays,
  back at the end it follows; 8 px steps up were pulled back (F6, fixed in
  the review round below).
- `make verify` passed at each wip commit. The coordinator replayed the
  net diff onto 041's landing (a72cdf6) as 7455107.
- Review fixes (the coordinator's review), tests first where pure:
  - DES-003's transition text cut (the old view's line, Build order with
    its slice table, the allowlist and "Checked from slice" tables, the
    Events table's slice column, "no release between slice 0 and 12"); it
    says once that `tests/architecture.test.mjs` checks every rule with no
    named exception. The owed real-CLI runs stay in the record and
    `plan.md`. DES-001's link to Build order now points at DES-003 Modules.
  - Lead-authorized maintenance, for the owner to confirm: ADR-016 Reopen
    (anchoring keeps sections drawn above; scroll-follow, `followsEnd`,
    holds the end for growth below) and ADR-017 Migration and Validation
    (no tail; the styles test checks the whole file) rewritten in place;
    beyond the authorization, ADR-017 Tokens names the settings tab's error
    line among the scope roots.
  - F6: a scroll up the user makes now leaves the end, however near:
    `scrollsUpByHand` (`state/tab`) marks a wheel up, PageUp, ArrowUp or
    Home outside a text field, and `ui/messages` the scroll bar while
    held; `followsEnd` takes `byUser`, and a scroll up nobody made (the end
    coming up as content shrinks) keeps following within 120 px; 120 px
    only rejoins. Scroll-follow no longer reads the distance itself.
    `state-tab` failed on import first (no `scrollsUpByHand`). Harness: 8
    px wheel steps while a reply streams now leave the end, PageUp on a
    focused copy button too; the reopen still lands and stays at its end.
  - The record names task 042's landing commit and date, not branch hashes;
    F6 moved to fixed.

## Independent review

- The coordinator's review of the replayed diff (7455107): a computed-style
  comparison of the old and new `styles.css` over 464 elements and about
  1,480 properties, light, dark and hover, identical apart from logical
  alignment values, color spelling and the documented 0.32 to 0.30
  changed-word fill; the architecture and styles tests only tighten;
  scroll-follow sampled. Found: DES-003's transition text (gap 1), ADR-016
  Reopen and ADR-017 Migration and Validation out of date (gap 2), F6
  (gap 3), the record naming branch hashes; all fixed in the review round
  above.
- Codex (two rounds, Run log): findings fixed or kept as recorded there.

## Outcome

Accepted after the review fixes. For the owner:

- Confirm the in-place rewrites of ADR-016 Reopen and ADR-017 Migration,
  Validation and Tokens.
- F2: text in `--text-faint` and some control labels below 4.5:1 in
  Obsidian's default theme, outside R28's clauses; F3: the turn's duration
  and cost is a focusable span without an interactive role; F4: the forced
  theme's first pass is 86 to 94 ms per frame in the harness, near ADR-017's
  100 ms chunking trigger; F5: column section headers named in capitals.
- Owed before `r06-panel-redesign` is cut: the DES-003 matrix M1 to M8 in
  Obsidian with each slice's owed rows, the R28 audit (screen reader,
  Windows high contrast, contrast in DevTools) and the R29 profiles in
  Obsidian's Electron, and the two real-CLI runs (owner approval first).
