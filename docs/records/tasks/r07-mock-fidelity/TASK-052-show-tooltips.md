---
status: closed
release: r07-mock-fidelity
number: 052
prd: PRD-001.R32, PRD-001.R25
---

# TASK-052 — Show tooltips

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Feature (class M, a requirement change: [change 006](../../changes/CHG-006-show-tooltips.md)).
Owner request: a "Show tooltips" setting in Settings > Appearance, on by
default, and in the panel's menu beside the theme choice; off hides the
icon-only controls' text tooltips; hover cards (tab, context, usage, turn
cost) stay; no prompt on the empty screen.

Interpretation:

- "No prompt on the empty screen": the empty conversation gets no hint or
  prompt about the setting; it lives in Settings > Appearance and the
  panel's menu only.
- "The panel's menu": Obsidian's view menu (`onPaneMenu` of the panel's
  `ItemView`: right-click the sidebar tab, or "More options" in the main
  area). The item is checkable, in the "view" section, where the theme
  choice joins it in a later task.
- "Icon-only controls' text tooltips": the tooltips that name an icon or a
  graphic. Tooltips that a requirement asks for as content stay whatever the
  setting says while the control shows its label: the model's full id
  (PRD-001.R22), the permission mode's hover text (PRD-002.R8) and "Restore
  to before turn N" (PRD-002.R18). The permission segment, icon-only at fit
  step 3 and below 360 px, is then an icon-only control and the setting
  governs it. A jump-rail tick's prompt (PRD-001.R33) has no label and stays.
  The brief called the rail tick a hover card; it is a text tooltip
  (`writeTooltip`), kept on the same reading: the owner decides whether it
  hides too.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R32 (changed by change 006), R25 (defaults, the Appearance list, what applies
at once);
[DES-003](../../../current/design/DES-003-panel-ui.md) Popovers, hover cards
and tooltips, Settings that reach the panel, Token contract;
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) (the key
syncs); [ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md);
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) (tokens).
Mechanism (Obsidian 1.14.4, read in `app.js`): a tooltip shows on pointer-over
of an `[aria-label]` element unless
`getComputedStyle(el).getPropertyValue("--no-tooltip").trim() === "true"`.

Acceptance:

1. `showTooltips` is a boolean setting, default on, synced by default; a
   stored value of another type loads as on.
2. Settings > Appearance lists "Show tooltips" after "Theme", with the line
   "Name icon buttons when the pointer rests on them. Hover cards stay."
3. The panel's menu has a checkable "Show tooltips" in section "view",
   checked while on; choosing it flips and saves the setting.
4. A change from either place reaches every open panel at once, with no
   reload: the root carries `mod-no-tooltips` exactly while the setting is
   off.
5. Off: no `.tooltip` element after a 1 s rest on a header icon button, a
   composer icon button, a column icon button, an icon button in a popover
   (the layer), a report card's icon button, or the conversation picker's
   delete button; none on the effort, profile or (icon-only) permission
   segment, Transcript, Restore files or Branch at any size. The model
   segment, the permission segment with its label showing, "Restore to
   before turn N", a rail tick, and the tab, context, usage and turn-cost
   hover cards still show.
6. On: tooltips as before task 052.
7. `tests/tooltips.test.mjs` fails if a `--no-tooltip` reset is not the
   token, if the scope's rule or the token declarations are missing or
   changed, or if the menu item or the settings row is missing.

## Scope

Expected files:

- New: `src/state/tooltips.ts` (`NO_TOOLTIPS_CLASS`, `hidesTooltips`),
  `tests/state-tooltips.test.mjs`, `docs/work/changes/CHG-006-show-tooltips.md`
  (closed in the commit).
- Changed: `src/settings-core.ts` (key, default, sync unit),
  `src/settings.ts` (the row), `src/main.ts` (`setShowTooltips`, shared by
  the row and the menu), `src/ui/shell.ts` (the root class),
  `src/view.ts` (`onPaneMenu`, the shell source, the picker's argument),
  `src/history.ts` (the picker modal's class); `styles.css` (the token, the
  scope rule, four content-tooltip exemptions, the resets);
  `package.json` (`pretest` gains the module); `tests/settings-core.test.mjs`,
  `tests/tooltips.test.mjs`; PRD-001 (via the change), DES-001, DES-003,
  DES-005, `docs/current/DEVELOPMENT.md`, `README.md`, `RELEASE_NOTES.md`.

Negative scope:

- No theme menu item or theme rename; no change to hover cards, to which
  controls are icon-only (049), or to palette, fonts or tabs.
- No hint on the empty screen; no change to Obsidian's own tooltips (the
  settings tab's extra buttons).
- No edit to `tests/styles.test.mjs`, `tests/architecture.test.mjs` or any
  protected path; no new dependency.

## Plan

- One token on the scope: `--ai-agent-panel-no-tooltip` is `false`, and
  `true` under `.mod-no-tooltips`; the scope's `--no-tooltip` is the token,
  so every descendant inherits "true" while off. 049's resets (`initial`,
  which let a control show its tooltip while icon-only) become the token, so
  "off" wins in the same places "on" shows them. The token block is the one
  rule `tests/styles.test.mjs` allows on `.ai-agent-panel-scope`, so the
  declarations join it.
- The decision (class from setting) is `state/tooltips`, Obsidian-free, with
  a unit test; `ui/shell` applies it on load and on `settings`.
- Modals: only the conversation picker has an icon-only control outside the
  root (its delete button); it takes the class when it opens (a modal lives
  only while open, so no event is needed). The other plugin modals have no
  `aria-label` or tooltip.
- The menu item and the settings row call one `plugin.setShowTooltips`
  (set, save, apply).
- Verification: `make verify`; the harness facts below.
- Rejected: hiding every panel text tooltip, the four content tooltips
  included (it would break R22, R33, PRD-002.R8 and R18 or need them all
  qualified; the owner asked only for icon-only controls'); a class on
  `body` (global state across windows, and the plugin would manage it per
  window); `visibility: hidden` on Obsidian's `.tooltip` (hides the hover
  cards' text too, and not just ours).

## Run log

- The worktree started on `main`; switched to `chore/agentic-sdlc`
  (068c5f5, task 049 landed), then moved to fbb1ba8 (task 051) by stash and
  switch; the stash conflicted in DES-001 and DES-003 only, resolved by
  keeping 051's text with this task's additions.
- Tests were written with the code in one pass rather than before it; they
  fail on the old code (no key, no token, `initial` resets), and the gate
  runs them all.
- Requirement call: the content tooltips stay on (see Spec). One rule in
  `styles.css` (the exemptions) and one PRD-001.R32 clause carry it; hiding
  them too is deleting that rule and the clause.
- Another agent edits the prompt-style setting in `settings-core.ts`,
  `settings.ts` and `ui/shell.ts` concurrently; this change adds separate
  lines there (the key, a row after Theme, a source member, a method) and
  touches no prompt line.
- Harness facts (owed to the orchestrator's headless run):
  - Root: `.ai-agent-panel` has class `mod-no-tooltips` exactly while the
    setting is off; computed `--no-tooltip` on the root is `true` off and
    `false` on, and on any descendant without its own rule the same.
  - Off: computed `--no-tooltip` is `true` on `.ai-agent-panel-icon-button`
    in the header, composer, column and a popover; on the tab close button,
    copy buttons, the report card's icon buttons, `.ai-agent-panel-prompt-image`;
    on the effort and profile segments, Transcript, and Restore files and
    Branch (at every size); and `false` on `.mod-model` and `.mod-permission`
    segments, `.mod-restore-before` and `.ai-agent-panel-rail-tick`.
  - Off, 1 s rest: no `.tooltip` on a header icon button, a composer icon
    button, a column icon button, an icon button in a popover, the delete
    button in the conversation picker; a `.tooltip` on the model segment, a
    rail tick; the tab hover card and the context hover card
    (`role="tooltip"` in the layer) still open after 500 ms.
  - On: tooltips as after task 049 (step 3 of its facts).
  - The panel menu: right-click the sidebar tab, "Show tooltips" with a
    check mark when on; choosing it removes or adds the class with no reload,
    and the Settings toggle matches after reopening the tab.

## Independent review

Reviewer: independent review agent (not the implementer); `make verify`
green; harness-verified: off hides the icon tooltips, 049's icon-only states
included; the model and permission segments and rail ticks still show; hover
cards open; the toggle through the panel menu is live. Verdict: approve with
changes.

1. Major (PRD-001.R32): the permission segment's tooltip showed with the
   setting off while the segment was only an icon (fit step 3 and below
   360 px, seen at 180, 220 and 260 px). Fixed: both icon-only rules reset
   `--no-tooltip` to the token for `.mod-permission:not(.is-warning)`, both
   are in `tests/tooltips.test.mjs` and DES-003, and the exemption clause is
   reworded to "while a control shows its label", the rail tick named on its
   own.
2. Minor: change 006 paraphrased requirement text and invented a reason.
   Fixed: it quotes each clause before and after, and gives the owner's
   request as the reason.
3. Minor: the Run log must keep the admission that the tests were written
   with the code. Kept.
4. Nit: set, save and apply were written twice. Fixed:
   `plugin.setShowTooltips(value)`.

Rendering checks were run by the orchestrator in a headless harness, not by
the implementer.

## Outcome

Accepted. For the owner's decision list: with "Show tooltips" off, a rail
tick still shows its prompt, because PRD-001.R33 asks for it as content; the
fix for hiding it is one selector in `styles.css` and one clause in
PRD-001.R32.
