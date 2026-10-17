---
status: closed
release: r08-settings-redesign
number: 120
prd: PRD-001.R24, PRD-001.R25, PRD-001.R28, PRD-001.R33
---

# TASK-120 — Prompt color, and Card and Bubble as the prompt styles

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L, `feat`. Owner decisions 8 to 10
([brief](../../../work/research/redesign-canvas/settings/BRIEF.md)). Target, pending
the owner's approval: [change 016](../../changes/CHG-016-settings-redesign.md)
R24, R25, R28, R33;
[ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md) Prompt
color and Validation; [DES-003 draft](../../../current/design/DES-003-panel-ui.md)
prompt surfaces, token table, Appearance pickers;
[DES-005 draft](../../../current/design/DES-005-persistence-and-sync.md) `promptColor`
unit, load steps 2 and 4, normalize, migration rows.

Acceptance:

1. "Prompt style" offers two cards, "Card" ("numbered, full width") and
   "Bubble" ("right-aligned"). Stored `popout` is Card, `bubble` Bubble.
2. A stored `quiet` loads as `popout` with `promptColor` `clear`, whatever
   `promptColor` held, and persists at the next ordinary save.
3. "Prompt color" follows "Prompt style" in today's page as cards (a swatch
   over the name): Clear, Sand, Stone, Sage, Sea, Mist (default), Lavender,
   Rose, Accent, Custom. It is its own sync unit with a badge; a device
   whose `promptStyle` unit is local and that has no stored `promptColor`
   starts it local too.
4. Each scope root carries `mod-prompt-color-<c>` for every color but Mist
   (the default aliases); the class and Custom's property re-apply on
   `settings` even when the mode is unchanged; a stored value is
   whitelisted before a class is built.
5. Custom shows "Custom color": a text field and a color picker (writes
   hex). `acceptCustomColor` per the ADR-017 draft; a refused value shows
   "Not a CSS color. The prompt keeps the last valid one." or, for
   `var()`, `env()`, `attr()`, `currentColor` or a CSS-wide keyword, "Use a
   color, not var(), env(), attr() or currentColor. The prompt keeps the last
   valid one."; only an accepted value is stored
   and reaches one custom property through `setProperty`; with none
   stored, prompts draw in Mist.
6. Card: `user-bg` fill, `user-line` border, the number box with no fill
   and a 1 px `user-ink` border, "You" in `user-ink`; Clear draws no fill.
   Bubble: fill and border in the prompt color. The pinned prompt and the
   current rail tick use `user-ink`. Prompt text keeps the palette's text
   color.
7. The Theme and Prompt style previews draw in the picked prompt color.
8. `tests/palette.test.mjs` passes per selection: text at least 4.5:1 on
   the fill for every color but Custom; "You" at least 4.5:1 and the number
   box outline at least 3:1 for every color but Custom and Accent.

## Scope

Expected files: `src/settings-core.ts`, `src/state/prompt-color.ts` (new:
`acceptCustomColor`, the class for a color; `tests/state-prompt-color.test.mjs`,
`pretest`), `src/state/theme.ts`, `src/theme-scope.ts`, `src/main.ts`,
`src/settings.ts` (Prompt style and Prompt color rows only), `src/ui/prompt.ts`,
`src/ui/shell.ts`, `src/ui/jump-rail.ts`, `src/view.ts` if the layout class
moves, `styles.css`; tests `settings-core`, `state-theme`, `styles` (only the
edits the ADR-017 draft's Validation names: `PALETTE_TOKENS`, the alias
whitelist, `PROMPT_SELECTION`), `palette`, `tooltips` (counts only, each
listed); docs `RELEASE_NOTES.md`, `README.md` (feature list),
`docs/current/DEVELOPMENT.md` (test table), the drafts where the code
differs.

Negative scope:

- No page layout, search, Modified, reset or profile change (tasks 121 to
  124); no other setting added, renamed or moved.
- No panel change beyond the prompt surfaces, pinned prompt and rail tick.
- No new dependency; no protected-path edit; no real-CLI run.

## Plan

- Tests first, confirmed failing: `acceptCustomColor` (lengths, characters,
  allowed functions, CSS-wide keywords, CSS escapes such as `v\61r(`,
  non-strings, `CSS.supports` injected); the Quiet migration, normalize and
  the local-unit seeding; same-mode re-apply, the Custom property set and
  cleared, an unknown stored color; the styles and palette rules.
- Reuse `drawRadioCards`, `Registrations`, `ModeClasses`, the existing
  palette blocks and the contrast resolver in `palette.test`.
- Codex reviews the migration and the Custom contract before landing.
- Verification: `make verify`; harness board `SettingsPromptColor` at 460
  and 720 px, dark and light; prompt surfaces in Card and Bubble per color.
- Rejected: migrating `popout` to `card` (an earlier 0.6 development build
  would read an unknown style); a dropdown for colors (decision 10).

## Run log

- Proof of failure: the new `state-prompt-color`, `settings-core`,
  `state-theme`, `palette` and `styles` tests ran first against the old
  code: 15 of 1618 failed; all pass after.
- Round 2 (review and Codex): no save during load (`settingsFromStores` is
  the only load function, so a migrated value persists at the next ordinary
  save); a blank field over a stored color shows the refusal; `currentColor`
  and CSS-wide keywords are refused; the error line and the field are scope
  roots; `aria-invalid="true"`; the picker saves on `change` and follows a
  typed hex; the styles test matches selector entries exactly.
- Round 3 (harness): the Custom row's selectors now beat Obsidian's
  `.setting-item-control input` and `input[type="color"]` rules (picker
  30x30, field 200 px in the mono font, the sub-row indented 18 px with its
  line) at 460 and 720 px, dark and light; prompt colors checked in Card and
  Bubble transcripts. The placeholder reads "Hex, rgb(), hsl() or name"
  (sentence-case lint).

## Independent review

An Opus review agent (not the implementer), two rounds, and Codex twice.
Fixed: the load-time save could lose device-local settings when the second
store write failed (Codex blocker; the save is gone); a cleared field hid
the refusal; the styles test's selector match let a rogue rule through; the
error line was not a scope root; the empty Custom swatch, the sub-row
indent and the preview lines differed from the board; the task, change and
DES-005 drafts misdated the prompt style to 0.5.0. Final verdict: approve.

## Outcome

Done.
