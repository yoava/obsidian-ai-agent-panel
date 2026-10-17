# ADR-019 — Settings page drawn through Obsidian's declarative settings API

**Status:** accepted (2026-10-16)

## Context

The settings boards (change 016, PRD-001.R39) ask for one page under a bar
that stays at the top while the page scrolls: one search field, a Modified
filter, Reset all and section links that track the scroll; rows filtered in
place with matches marked; section headings carrying a lead line, "Reset N"
and an alert icon. The same definition list must feed both renderers
(ADR-013): `getSettingDefinitions()` on Obsidian 1.13+, which also indexes
every row for Obsidian's settings search (PRD-001.R25), and `display()` on
1.8.7 to 1.12.

What 1.13 offers (`obsidian` 1.13.1 types; Obsidian 1.13.4 and 1.14.4
`app.js` and `app.css` from the public release builds, read without
running them: the [renderer notes](../../records/research/obsidian-settings-renderer.md)
give sources, hashes, steps and line numbers; 1.13.0 to 1.13.3 were never
public):

- A group (`SettingDefinitionGroup`, `obsidian.d.ts:6079`) has a string
  `heading`, a `cls` on its element (`:6092`), icon-only `extraButtons`
  (`ExtraButtonComponent`, `:6125`), a 1.13.1 `search` that adds an input
  to that group's header and filters only its direct children (`:6097`),
  and `visible`. No text button, no lead line, no element of our own in the
  header.
- `visible: false` hides an item and also excludes it from Obsidian's
  settings search for that render cycle (`:6017`).
- A `render` row (`SettingDefinitionRender`, `:6265`) gets the `Setting`
  and its group and may return a cleanup, run before the row is torn down
  but not guaranteed when the window closes (`:6277`). Obsidian sets the
  row's name and description first, then calls `render`, so `render` may
  replace them.
- `update()` (`:6591`) stores the definitions again and renders every row
  again, a focused `render` row included (only a declarative `control` row
  holding focus is skipped), then moves focus to that row's control
  element; `refreshDomState()` (`:6628`) re-evaluates `visible` and
  `disabled` without re-rendering and hides a group whose rows are all
  hidden.
- Between renders a row is matched by its control key, else its name,
  else its index, and a group by its heading, else its index; 1.14.4 first
  tries an `id` the types do not declare, 1.13.4 has no `id` key.
  Duplicate keys are logged and matched in order. A matched group keeps
  the `cls` it was created with.
- The renderer replaces the tab element's children with the group
  elements, so each group is a direct child of the tab element and nothing
  of ours sits beside them.
- The tab element `.vertical-tab-content` is the scroller (`app.css`:
  `overflow-y: auto; height: 100%; padding-top: var(--size-4-12)`); its
  parent `.vertical-tab-content-container` is `overflow: hidden`. A group
  is `.setting-group` > heading row, search, `.setting-items` > rows, its
  width capped by `--setting-group-max-width`.
- Obsidian's settings search lists matching row names in the modal's
  sidebar; picking one opens the tab and calls `scrollIntoView({ block:
  "center" })` on the row (`app.js` `scrollToDefinition`). Rows are never
  drawn outside the tab element.
- `SettingDefinitionPage` (`:6202`) opens sub-pages: per-section pages,
  which decision 1 rules out.

Floor: Chromium 120 (ADR-017 Context). CSS view timelines exist there
(Chrome 115), but CSS cannot set `aria-current`, which decision 3 needs.

## Options considered

### Option A: the page chrome as rows, filtered by a page controller (recommended)

- The bar is a `render` row alone in the first group, whose `cls` makes
  that group `position: sticky; top: 0`. As a direct child of the scroller,
  it holds for the whole page. Measured, headless Chrome 155 on 1.14.4's
  `app.css`, scroller scrolled 900 px: the group's top 48 px below the
  scroller's (the scroller's top padding); with the tab element classed to
  drop that padding, at the scroller's top.
- Each section is a group without `heading`, its first row a `render` row
  that draws our heading (title, lead, "Reset N", the Claude Code alert),
  `searchable: false`.
- Every setting row is a `render` row, so each hands its elements to the
  page controller as it renders and takes them back in its cleanup.
- The page's own search and Modified filter never touch `visible`: the
  controller hides rows and empty groups with its own class and draws
  marks, counts, "Show", "Default:" and the reset buttons in place, on both
  renderers. `visible` says only whether a row exists now (platform, profile
  count, a sub-row's parent value), so Obsidian's search keeps every row
  that exists.
- `update()` (1.13+) and the legacy redraw run only when rows are added
  or removed or a row's store changes: a profile added or removed, a
  Detect that fills a path, a sync badge flipped. Each comes from a click,
  never from typing, since `update()` rebuilds the focused row.
- Disadvantages: relies on behaviors seen in 1.13.4 and 1.14.4 and not
  documented: groups as direct children of the tab element, the group
  wrapper classes, and how rows are matched between renders; a theme that styles `.setting-group` may
  draw the bar's group oddly; Obsidian's settings search shows our rows
  without a section heading.

### Option B: the API's own group features

- Group `heading`, `extraButtons` for an icon-only section reset, the
  1.13.1 per-group `search`; the bar as an ordinary first group that
  scrolls away.
- Advantages: documented API only; Obsidian draws headings and search.
- Disadvantages: six search fields, no counts across sections; a heading
  string can carry a count but changes only through `update()`; no lead
  line, no "Reset N" text button, no alert icon beside the heading; no
  sticky bar (decisions 2 to 4, 6); `search` needs 1.13.1, above the 1.13
  gate the plugin uses today.

### Option C: the bar outside the scroller

- The bar's mount, from a `render` callback on 1.13+ and `display()`
  before, inserts the bar into `.vertical-tab-content-container` above the
  scroller; its cleanup and `hide()` remove it.
- Advantages: sticky by construction, no padding override.
- Disadvantages: writes into an element Obsidian owns and shares with
  every other tab, so the plugin must remove its bar on every path that
  leaves the tab; the container's layout (`position: relative`, no flex
  column) needs our CSS on Obsidian's element (inferred).

### Option D: `display()` on every version

- Advantages: one imperative path, full control.
- Disadvantages: `display()` is deprecated since 1.13 and is not called
  when definitions exist (`obsidian.d.ts:6633`); without definitions the
  rows leave Obsidian's settings search (PRD-001.R25).

## Decision

Option A. Against B: the group's documented header slots supply no lead
line, no text-labelled "Reset N" and no heading alert, and `cls` styles a
group but adds no header slot (`obsidian.d.ts:6079` to `:6139`). Against
C: keeping every mount inside the tab element avoids cleanup in a host
container every tab shares (inferred; `containerEl` is public,
`obsidian.d.ts:6567`). Against D: definitions feed Obsidian's settings
search, which PRD-001.R25 requires, and `display()` is the pre-1.13
fallback (`obsidian.d.ts:6577` to `:6591`, `:6631` to `:6638`).

Mechanism:

- `settings.ts` builds one list of `PanelGroup`s and `PanelRow`s, each row
  with a stable `id`, its section, its sync unit and keys, and its
  availability; `getSettingDefinitions` maps it, giving each group and row
  its `id`, and `display` walks it into our own group and row elements of
  the same classes.
- Identity without `id` (1.13): the group list never changes (the bar, the
  missing-CLI banner, the filter line, the six sections; a group with nothing to show is
  `visible: false`) and no group sets `heading`, so each group keeps its
  index key and the `cls` it was created with. Every `render` writes its
  row's whole state, toggling classes rather than adding them, since a
  matched row element may last have drawn another row of the same name
  (another profile's). Before a structural redraw the controller records
  the focused control by row `id` and control role, with its draft text
  and selection, and holds the redraw during text composition. After it,
  since Obsidian moves focus to the row's control element, the controller
  writes its filter and reset state again and restores that control if
  shown and enabled, else the next shown enabled control, else the
  previous, else the page search. A Detect that completes after focus
  moved keeps the focus current at its redraw, not its own button.
- Row registry (`src/state/settings-rows.ts`, layer 1): per row, the text
  the page model searches (name, description, shown value, choice labels,
  aliases), whether it differs from its default, its default as shown, and
  the reset patch (DES-005 Reset and Undo). One job: describing rows as
  data; no DOM.
- Page model (`src/state/settings-filter.ts`, layer 1): rows, query and
  Modified in; which rows show, the match ranges, each section's shown
  count, the total modified, each section's modified count out. One job:
  filtering.
- Section spy (`src/state/section-spy.ts`, layer 1): section heading
  offsets, the bar's height, the scroll offset and the scroller's extent
  in; the current section and a jump target out. One job: scroll geometry.
- Page controller (in `settings.ts`): holds the handles each render row
  registers, the query and the Modified state, and applies the page model's
  result to the handles. It starts, with empty filters, at the first bar
  row render since the tab last hid (1.13+) or in `display()` (before):
  it adds `ai-agent-panel-settings-page` to the tab element (zero top
  padding; `scroll-padding-top` set to the bar's height, so focus moves and
  Obsidian's own `scrollIntoView` land below the bar), attaches the tab
  element as a scope root (ADR-017), and observes the tab element's
  `scroll` and, with one `ResizeObserver`, the bar and each group. A
  structural redraw keeps the controller and its filters: each row's
  cleanup takes back its handles and stops observing its elements, and the
  new render registers fresh ones. `hide()` stops it, removing the class
  and releasing the root, since a cleanup may not run. It remeasures after
  every filter change and every structural redraw. It clears the page's
  search and Modified filter on `input` in Obsidian's settings search and,
  while that search holds text, on a `pointerdown`, a `click` or an Enter `keydown`
  in the settings modal outside the tab element, listening in the capture
  phase so the filters clear before Obsidian scrolls to the result picked.
- If Obsidian stops placing groups directly under the tab element, the bar
  scrolls with the page; the manual checklist names it.

Validation: `tests/state-settings-rows.test.mjs`,
`tests/state-settings-filter.test.mjs` and
`tests/state-section-spy.test.mjs` (Node); the mock-fidelity harness at 460
and 720 px, dark and light, against the boards; by hand (owner) on 1.13.4,
1.14 and a pre-1.13 build: the bar stays while the page scrolls; typing in
the search keeps focus and updates the counts; Obsidian's settings search
finds a row while the page's own search or Modified filter is on, and
picking it shows the row, also when the page's filters changed after
Obsidian's search was typed; closing and reopening the tab; adding and
removing a profile and flipping a sync badge, focus restored or its
fallback used; a Detect completing after another field took focus,
leaving that field's focus, draft text and selection; renaming a profile, the field keeping focus and text while
typing.

## Consequences

- Easier: one search across all sections, counts and headings as the
  boards draw them, the same rows and the same in-place filtering on both
  renderers; Obsidian's search unaffected by the page's own filters.
- Harder: undocumented behaviors (groups under the tab element, group
  wrapper classes, rows matched by name or index) are load-bearing; a
  change in Obsidian breaks stickiness or focus on redraw, not data. On
  1.13, with two or more profiles, Obsidian logs a duplicate-key error for
  each profile row name that repeats. Every setting row is a
  `render` row, so no row uses a declarative `control`.
- Locked in: section headings are ours, so Obsidian's search shows rows
  without their section.
- Reversible: Option B needs only the mapping in `getSettingDefinitions`
  changed; the row registry, page model and spy stay.
- Unverified: 1.13.0 to 1.13.3, never public builds.
