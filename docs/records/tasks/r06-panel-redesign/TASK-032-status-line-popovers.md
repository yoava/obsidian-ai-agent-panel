---
status: closed
release: r06-panel-redesign
number: 032
prd: PRD-001.R3, PRD-001.R22, PRD-001.R23, PRD-001.R31, PRD-002.R8
---

# TASK-032 — Status-line popovers

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 2: the panel's one popover host, the model and effort,
permission and profile popovers replacing today's menus, and the status line's
fit steps.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R3, R22, R23, R31 (and R32's popover clauses, which land in 037);
[PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R8; [DES-003](../../../current/design/DES-003-panel-ui.md) Popover and hover
card (popover machine), Popovers, hover cards and tooltips, Status line,
Models and effort, Layout model (resize pass);
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) Popovers, Size;
DES-004 mode display rule and mode state.

Acceptance:

1. `ui/popover-host` shows one popover per panel inside the main column's
   layer, driven by `state/popover`'s machine: a dialog named by its title;
   its trigger `aria-expanded="true"` and `is-open`; focus to the first
   control or the named one; Escape or a pick closes and refocuses the
   trigger; an outside pointer-down closes and leaves focus where it went;
   focus left to nothing keeps it open on its dialog; the trigger leaving
   the DOM or a tab switch closes it. Opening one closes another.
2. A popover opens up from the composer area, aligned to the trigger's start
   or end edge by the trigger's centre; it is at most the main column less
   16 px wide and as tall as the space above it, read on open, scrolling
   inside.
3. "Model and effort": models as a radio group per PRD-001.R22 (the learned
   list with "Default" first, plus a configured or picked model missing from
   it, descriptions only from the CLI); effort as a segmented radio group in
   R23's order and short strings, levels the selected model lacks disabled;
   "Applies from your next message". The effort segment opens it with focus
   on the effort control; the model segment's tooltip is the full model id.
4. "Permissions": the modes, the current one checked, the warning modes red,
   Bypass only while enabled; the segment's tooltip is the long string and
   hover text joined by " · ".
5. "CLI profile": the profiles, the current one checked; picks follow
   DES-002 as today's menu did.
6. Picks keep today's effects: switch, refusal rollback and Notice, effort
   restart after the turn, profile rules.
7. Fit: `fitStep` returns the fewest steps of R31's order whose total fits,
   or the last step; step 3 is skipped in Auto-approve and Bypass; one write
   sets the step class; the measures run in `ui/shell`'s resize pass (one
   `ResizeObserver` and `css-change`, one pass per frame, label widths read
   once per label change). Below a 360 px main column every step's styles
   apply, step 3 excepted in Auto-approve and Bypass.
8. A plan-usage segment hidden by step 4 counts as not visible for usage
   polling (today's `setStripVisible`); 033 completes PRD-005.R3.
9. Escape in the composer interrupts only while no popover reports open.
10. Today's Obsidian `Menu` model, effort, mode and profile menus are
    deleted; the architecture test checks P1.

## Scope

Expected files:

- New: `src/state/popover.ts` (popover machine), `src/ui/popover-host.ts`,
  `src/ui/popovers/model-effort.ts`, `src/ui/popovers/permission.ts`,
  `src/ui/popovers/profile.ts`, `tests/state-popover.test.mjs`.
- Changed: `src/state/status-line.ts` (`fitStep`, segment view-models),
  `src/state/composer.ts` (popover open in the Escape action),
  `src/ui/status-line.ts`, `src/ui/shell.ts` (the resize pass),
  `src/view.ts`, `styles.css`, `package.json` (`pretest`);
  `tests/state-status-line.test.mjs`, `tests/state-composer.test.mjs`,
  `tests/architecture.test.mjs` (P1 on).
- Docs: DES-001 (view jobs: popovers); DES-004 (the permission popover and
  the mode table); `README.md` (control row bullet);
  `docs/current/DEVELOPMENT.md`; `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- Hover cards and their machine, the context and plan-usage popovers,
  `setSegmentVisible` (033); open-tabs list (034); "More" and changed files
  (036); "+N" chips (041).
- Session calls behind the picks (they stay in `view` until 037).
- No new dependency; the architecture-test edit above is the only protected
  path, tightening only (owner's 2026-10-11 instruction, recorded in the Run log;
  a loosening edit stops for the owner); no real-CLI
  run.

## Plan

- Tests first: every transition of the popover machine
  (`PRD-001.R32: …`); `fitStep` order, the last-step result and step 3
  skipped in Auto-approve and Bypass (`PRD-001.R31: …`); the profile segment
  only with several profiles (`PRD-001.R3: …`); the Escape action with a
  popover open (`PRD-001.R11: …`).
- Moves out of `view.ts`: `openModelMenu`, `openEffortMenu`, `openModeMenu`,
  `openProfileMenu` and `modeOptions`. The pick handlers (`chooseModel`,
  `applyEffort`, `pickPermissionMode`, the profile pick) stay, reached
  through `onPickModel`, `onPickEffort`, `onPickMode`, `onPickProfile`.
- Each popover module has one importer, `ui/status-line`, and gets the host
  as the `openPopover` intent (P5).
- Verification: `make verify`; manual, by someone other than the
  implementer: M2 (one and two profiles; the four modes and Bypass; a main
  column narrow enough for step 4), M1, M4, M5 (a popover in a pop-out
  window), M6 (arrows in radio groups, Escape, focus return), at least at
  300 and 1040 px.
- Risks: Obsidian hotkeys or the composer's suggests taking keys meant for an
  open popover; clipping by the leaf's `contain: strict` (the host sits
  inside the main column, so it is clipped there by design); a measure loop
  if a step class changes the width it measured (one pass per frame, writes
  after reads).
- Rejected: Obsidian `Menu` (attached to `body`, items only, not a dialog
  named by its title, outside the forced theme) and `popover="auto"` (paints
  over Obsidian's menus and modals, ignores the suggests), both ADR-016;
  measuring hidden copies of the line (DES-003 Alternatives).

## Run log

- Tests first, against 030's code with a stub `state/popover`:
  `state-popover`, `state-status-line`, `models` and `settings-core` failed
  on import (no `CLOSED`, `FIT_ORDER`, `effortChoices`, `offeredModes`);
  `state-composer` failed "PRD-001.R11: Escape does not interrupt while a
  popover reports open".
- Protected paths, under the owner's instruction of 2026-10-11, for the
  owner to confirm: `tests/architecture.test.mjs` tightened only: P1 added
  (a string or template literal naming `ai-agent-panel-popover` or
  `ai-agent-panel-hover-card` as a whole class outside `ui/popover-host` and
  `ui/hover-card-host`), with a seeded fixture (two breaches in
  `ui/popovers/rogue`; none for `ai-agent-panel-popover-label` or the host);
  no allowlist row is due in this slice. `tests/styles.test.mjs` unchanged.
  Ask-first `package.json`: `pretest` gains `src/state/popover.ts`.
- Choices the accepted docs leave open, for review:
  - Logic in layer 1, where DES-003's Popovers table puts it:
    `modelOptions(resolved, cliModels, extras)` (Default first, plus the
    configured or picked model), `effortChoices`, `offeredModes`; tested in
    `models` and `settings-core`. Files beyond the expected list:
    `src/models.ts`, `src/settings-core.ts`, `src/ui/dom.ts`, their tests,
    DES-002, DES-003 and DES-007.
  - Radio groups (`radioGroup` in `ui/dom`, three importers): one tab stop;
    the arrows, Home and End move focus without picking, Enter, Space or a
    click picks. WAI-ARIA's check-on-arrow would send a `set_model` or an
    effort restart per key press. Recorded in DES-003's keyboard table.
  - Popover contents are `Component`s the host loads while they show
    (ADR-016: a `ui/` module owns a subtree as a `Component`), so their
    listeners go at close; this also keeps them out of A12, which a module
    importing `obsidian` only through `ui/dom` would otherwise trip.
  - Fit: `labelNatural` is the label wrapper's `scrollWidth` (its text is
    inline, so the model label can still ellipsize at the last step);
    widths are cached per segment by the label shown, the 560 px short/long
    switch read once per pass as the effort segment's long string's computed
    `display`; `css-change` clears the cache. Only the model segment
    shrinks, so every other one is read at its natural width. DES-003
    Status line says so.
  - The context segment (today's meter until 033) gains a text wrapper for
    step 5 and hides by `is-hidden`; the spacer gave way to
    `margin-inline-start: auto` on the context segment, or on plan usage
    while context is hidden, so the line has no extra flex gap.
  - Plan-usage polling: `usageFits` is the segment's `isShown()` read in the
    pass with the next step below 4; leaving step 4 reports not visible
    until the next pass, which the write requests, so no request is made
    for a segment the 360 px rule hides. A snapshot that arrives while the
    segment is hidden is drawn in the next pass's write while the line
    shows, since its width decides the fit (DES-007 Scheduling says so);
    widths read for other content count as 0 for one pass.
  - The 5-hour reset time shows from a 560 px main column only (R31), by a
    container rule on today's strip; 033 redraws the segment.
  - Placement: bottom edge 4 px above the trigger, height bounded by the
    space above it less 12 px; after inserting, the width is read once and
    the start or end alignment is kept 8 px inside the main column,
    measured from its inline-start edge (direction read on open). Only
    "up from the composer area" exists; 034 and 036 add "down from the top
    region".
  - Escape closes while focus is in the popover or on its trigger (a
    document `keydown`, stopped there).
  - Model rows show the CLI's descriptions; today's menu showed none.
  - Theme (031): popovers live inside the panel root, so the forced theme
    reaches them; this slice opens no `Modal` (the usage segment still opens
    today's `UsageDetailModal` until 033).
- Codex cross-review of the popover host contract and the fit (diff
  3297543..6d5759a, then two follow-ups confirming the fixes). Confirmed: every row
  of the popover table in Chromium's event order (own-trigger toggle,
  another trigger, Escape on the trigger, tab switch, re-entrant focus,
  pop-out documents), `fitStep`, the cache keys, cleanup. Fixed: segments
  that could shrink or be capped were measured below their natural width
  (only the model segment shrinks now, no cap); a usage snapshot arriving
  while the segment was hidden by step 4 or the 360 px rule was never
  drawn, so a narrower one could not show; a focused control removed from
  the popover left focus nowhere unnoticed (the observer now checks, with a
  disabled control's `focusout`); the reset time showed below 560 px;
  placement used a physical offset for a logical inset (RTL).
- Replayed onto `main` at 467b3ec (030 landed, 031 Theme): the three wip
  commits applied as one three-way patch. Every conflict kept both sides:
  `pretest` lists `state/theme` then `state/popover`; DEVELOPMENT.md's test
  table keeps the theme row beside the popover row; `view` attaches the
  shell root to `theme-resolver`, then mounts the popover host; the
  architecture test keeps 031's modal rule and its fixture assertions
  beside P1's. The popover's dialog sits inside the shell root that
  `theme-resolver` writes, so the forced theme reaches it with no attach
  of its own.
- Independent review (coordinator; headless Chromium with Obsidian
  1.14.4's `enhance.js` and `app.css`), fixed on the replayed tree, tests
  first where pure (`fitStep`'s pixel to spare, the hidden-trigger row,
  `modeName`, each failing before):
  - D1: the model segment was read while squeezed below its icon and the
    reading cached; it now keeps its icon (`min-inline-size`), and a line
    fits only with a pixel to spare, as `scrollWidth` rounds.
  - D2: in a pop-out window every event counted as outside (an adopted
    node fails `instanceof` the pop-out's `Node`), and the listeners stayed
    on the main document; the node test no longer depends on the window,
    and the host adds its document listeners on open to the dialog's own
    document and removes them on close.
  - G1: a plan-usage segment hidden by step 4 flashed at each redraw; its
    last widths now stand in while it is hidden, and below 560 px its key
    leaves out the ticking reset time.
  - N1: radios are named by their label (a mode without its "⚠",
    `modeName` in `settings-core`, shared with the segment's label) and
    described by their description. N2: the icon-text gap is the label's
    margin, so a collapsed segment is icon-only and still measures the
    same. N3: Left and Right swap in right-to-left (Obsidian's `mod-rtl`).
    N4: a trigger hidden by `toggle(false)` closes its popover (machine
    event `trigger-hidden`, observed on the trigger's `style`). N5: DES-003
    Status line and keyboard rows updated.
- Review round 2: D1, D2, G1 and N1 to N5 verified in Chromium. D3, from
  G1's fix: a hidden plan-usage segment's widths, read in the long mode or
  for longer text, stood in forever, so it stayed hidden and unpolled
  where it fitted. Fixed, tests first (`hiddenWidths`, failing on import
  before): the last widths stand in only when read in the same mode for
  text no shorter, else 0 for one pass, which shows and measures it.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), at 300 px and
  1040 px wide unless stated, "Conversation tabs" Automatic:
  1. M2, profiles: with one profile no profile segment; with two, the
     segment opens "CLI profile" with the current profile checked; a pick
     before the CLI starts shows on the segment and the next send starts on
     it; a pick after a turn shows "This conversation stays on <profile>;
     start a new conversation to use another."
  2. M2, modes: the permission segment opens "Permissions": Ask before
     acting, Accept edits, Plan (read-only), ⚠ Auto-approve everything in
     red, the current one checked; ⚠ Bypass permissions only after enabling
     it in settings; a pick changes the segment; with
     `FAKE_CLI_REFUSE_MODE` set, the segment returns and the Notice reads
     `Could not switch mode: …`; hovering the segment shows "<long> ·
     <hover text>".
  3. M2, model and effort: the model segment opens "Model and effort",
     models with "Default model" first and the current one checked, the
     effort levels Default, Low, Medium, High, Extra high, Max as a
     segmented row, "Applies from your next message"; the effort segment
     opens it with focus on the checked effort; a model pick with
     `FAKE_CLI_REFUSE_MODEL` set rolls back with `Could not switch model:
     …`; the model segment's tooltip is the full id. Descriptions and
     disabled levels need a CLI-reported model list, which the fake CLI
     does not send: checked by `models` tests only until a real-CLI run.
  4. M2 and M1, fit: narrowing the main column (column layout at 1040 px,
     dragging the column wider; panel widths 680, 440, 360) collapses the
     profile label first, then effort, then permission, then hides plan
     usage (no further `get_usage` in the fake CLI's traffic), then the
     context percentage; in Auto-approve and Bypass the permission segment
     keeps "Auto" or "Bypass" in red; below 360 px every step applies; the
     line never wraps and the panel has no horizontal scroll bar; widening
     restores each step in reverse.
  5. Popover placement: opens up from its segment, aligned to its start
     edge for model and effort, to its end edge for a segment right of
     centre; never wider than the main column less 16 px; on a 600 px tall
     panel the list scrolls inside.
  6. M4: at 80% and 150% zoom and a changed interface font size the line
     re-fits without a resize.
  7. M5: in a pop-out window a popover opens, closes on Escape, on an
     outside click and on a pick, and focus returns as below.
  8. M6: Tab reaches each segment; Enter or Space opens its popover with
     focus on the checked choice; the arrows, Home and End move without
     picking; Enter or Space picks, closes and refocuses the segment;
     Escape closes and refocuses it; Tab out of the popover closes it; a
     click outside closes it and focus stays where clicked; switching tabs
     closes it and focuses the composer when focus was inside; a screen
     reader announces the dialog by its title, the radio groups and each
     choice's checked state, and the segment's expanded state.

## Independent review

A review agent, not the implementer, ran the real shell, popover host,
status line and popovers in headless Chromium 148 with Obsidian 1.14.4's
`enhance.js` and `app.css`; `make verify` passed each round.

Round 1: D1, the fit measured the model segment squeezed and rounded, so
labels were cut while a further step fit; D2, popovers were unusable in a
pop-out window (cross-realm node check, listeners on the wrong document);
G1, a one-frame flicker when plan usage was hidden; nits on radio names,
the icon gap, RTL arrows, a hidden trigger, DES-003 wording. Round 2: all
fixed; the G1 fix left plan usage hidden where it fit (D3). Round 3: D3
fixed (`hiddenWidths`); a 450-sample resize walk is at the right step every
time, no labels cut, no flicker; keyboard, pointer, placement, RTL,
pop-out and cleanup verified. Codex cross-review during the build: fixes
recorded in the Run log.

## Outcome

The status line's segments open one popover host: model and effort,
permissions (the mode table) and profile, with keyboard, focus and
pop-out handling per DES-003, and the line shortens step by step to fit.
The architecture test gains P1 (tightening, for the owner to confirm).
Owed by hand in a vault: manual rows M1, M2, M4, M5 and M6 in the Run log.
