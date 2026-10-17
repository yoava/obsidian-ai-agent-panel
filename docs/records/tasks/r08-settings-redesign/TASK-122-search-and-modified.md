---
status: closed
release: r08-settings-redesign
number: 122
prd: PRD-001.R39, PRD-001.R28, PRD-001.R33
---

# TASK-122 — Search the settings and filter to modified ones

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L, `feat`. Owner decisions 2, 4 and 5
([brief](../../../work/research/redesign-canvas/settings/BRIEF.md)). Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R39 (search, Show, Escape, Modified, identity rows, "Default:"), R28
("Default:" with the bar), R33 (Clear's aliases);
[ADR-019](../../../current/adr/ADR-019-settings-page-on-the-declarative-api.md)
Mechanism; [DES-001](../../../current/design/DES-001-system-overview.md)
Settings page (bar, row anatomy, registry table, page controller).

Acceptance:

1. The bar's first line: a search field (visually hidden label "Search
   settings", placeholder "Search settings", "Clear search" button while it
   holds text) and the Modified chip (a toggle button with `aria-pressed`,
   a bar mark, "Modified", the count of modified rows).
2. While the search holds text: only rows whose name, description or shown
   value contains it (case-insensitive) show; matches are wrapped in `mark`;
   sections with none shown are hidden; each link shows its section's shown
   count and is dimmed at zero; each shown row ends with "Show" (rest "<name>
   on the full page" visually hidden). "Show" clears the search, jumps the
   row under the bar and focuses its control. Escape in the field clears it.
   "outline", "quiet" and "none" find Clear.
3. While Modified is on: only modified rows show (per DES-001's registry
   table); empty sections and CLI profiles are hidden; links carry counts.
   With search text, a row shows only when it meets both.
4. A modified row shows "Default: <value>" under its description and a
   leading-edge bar (`border-inline-start`, `accent`). Profile name, Run via
   WSL and Use for new conversations are never modified.
5. Filtering never touches `visible`, `update()` or the legacy redraw: the
   page controller applies the page model in place through each row's
   handles and remeasures; focus and typed text stay put.
6. Input in Obsidian's own settings search, and while it holds text a
   `pointerdown`, `click` or Enter `keydown` in the settings modal outside the tab
   element (capture phase), clear the page's search and Modified filter
   before Obsidian scrolls to the result picked.
7. The filter line (DES-001) above the sections while a filter is on,
   in its own group that is always in the group list (ADR-019).
8. After a structural redraw (a sync badge flipped, a profile added or
   removed, a Detect) the controller restores the focus it recorded
   before, by row `id` and control role, with draft text and selection, or
   its fallback (next shown control, previous, page search), after writing
   its filter state again; it holds the redraw during text composition, and
   a Detect completing late keeps the focus current; every render toggles its row's state classes rather than only
   adding them (ADR-019, identity without `id`).

## Scope

Expected files: `src/state/settings-rows.ts` and `src/state/settings-filter.ts`
(new; `tests/state-settings-rows.test.mjs`,
`tests/state-settings-filter.test.mjs`, `pretest`), `src/settings.ts`,
`styles.css`; tests `tooltips` (counts only, each listed); docs
`RELEASE_NOTES.md`, `README.md` (feature list), `docs/current/DEVELOPMENT.md`
(test table), the drafts where the code differs.

Negative scope:

- No reset buttons, "Reset N", "Reset all…", dialog or Undo (task 123); the
  registry carries no reset patch yet.
- No profile restack or missing-CLI state (task 124).
- No setting added or dropped; no panel change; no new dependency; no
  protected-path edit; no real-CLI run.

## Plan

- Tests first, confirmed failing: the registry (search text per row kind,
  modified and default as shown for every row in DES-001's table, the
  identity rows never modified, Clear's aliases) and the page model (query
  and Modified combined, match ranges, per-section shown counts, the
  modified total, empty sections and profiles, a query of spaces).
- Reuse task 121's controller, row handles and `section-spy` jump.
- Verification: `make verify`; harness boards `SettingsSearch` ("prompt")
  and `SettingsTabs` (Modified on), 460 and 720 px, dark and light; focus
  stays in the field while typing; legacy renderer.
- Rejected: filtering through `visible` (drops rows from Obsidian's search,
  `obsidian.d.ts:6017`); per-group `search` (ADR-019 Option B).

## Run log

- Proof of failure: the 26 new registry and page-model tests ran against
  stubs and 25 failed (1756 of 1781 passed); all pass after.
- Moved verbatim into `settings-core`: the mode labels, the prompt-style
  cards and the duration helpers, so the registry can read them without
  `obsidian`.
- Round 2 (review): the search field is `type="search"`, so Obsidian's
  Escape leaves it to the field; the Show target skips the row's info and
  badge; a match is marked in the row's first text, not its children
  twice; the modified bar is a `::before` at -14 px inset from the row's
  top and bottom (`auto` end, or Obsidian's divider rule stretches it over
  the row and it swallows clicks); "Default:" draws its value muted at
  medium weight; headings carry their shown count while searching; below
  400 px the chip shows only its mark and count; the Modified line counts
  the chip's total, not rows kept after an edit back to default (a test
  failing 4 against 3 before).
- Harness on Obsidian 1.14.4, with 1.13.4's keying and on the legacy
  renderer: search, Show, Escape, Modified, both combined, Obsidian's
  own search clearing the filters, focus and draft restored after a badge
  flip, a profile removed and a late Detect, the redraw held during
  composition; `SettingsSearch`, `SettingsTabs`, `SettingsNarrow` at 460
  and 720 px, dark and light.

## Independent review

An Opus review agent (not the implementer), with its own harness probes
on 1.14.4, 1.13.4 keying and the legacy renderer, 17 of 18 test mutants
killed. Fixed: the eight round 2 items. Disclosed, not fixed: the page
model's per-row match ranges are tested but the controller marks from the
DOM text through `matchRanges` (same function, same text); real Escape on
pre-1.13 and on 1.13.4, global-search clearing and focus restore need a
real vault (owner checklist). Final verdict: approve after fixes, applied
and verified by the orchestrator (harness and `make verify`).

## Outcome

Done.
