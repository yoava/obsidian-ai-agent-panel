# ADR-016 — Panel UI architecture

**Status:** accepted (2026-10-11)

## Context

- `src/view.ts` is one `AgentPanelView` class of about 5,400 lines
  (`wc -l src/view.ts`) holding tabs, composer, messages, cards, menus and
  stream handling. It imports `obsidian`, so none of it has an automated test
  ([ADR-014](../../current/adr/ADR-014-build-lint-and-test-toolchain.md)).
- [Change 001](../../records/changes/CHG-001-panel-redesign.md) replaces most of that UI
  (PRD-001.R15, R16, R30 to R35); [change 003](../../work/changes/CHG-003-agents-and-workflows.md)
  may add a workflow view with a second host (R36, pending its O3 and E6).
- Constraints: a runtime npm package only through ADR-007's screen
  ([constitution](../../current/constitution.md),
  [ADR-007](../../current/adr/ADR-007-runtime-dependencies.md)); one
  component, one job; logic in Obsidian-free modules under `node:test`
  (AGENTS.md §4); walking skeleton first (constitution; owner D1); module
  boundaries decided here (owner A5, D-02;
  [owner decisions](../../records/research/owner-decisions.md)); PRD-001.R29:
  last screen of a 1,000-message reopen within 1 s, no panel frame over
  100 ms, no periodic DOM work when idle.
- Obsidian API (`node_modules/obsidian/obsidian.d.ts`): `Component` with
  `addChild`, `removeChild`, `register`, `registerEvent`, `registerDomEvent`
  (1835-1912); `Events` (2808); `View.onResize` (7676-7680). Obsidian
  appends `Menu` and `setTooltip` elements to the document `body` (`app.js`
  1.14.4, `showAtPosition` and the tooltip code).
- Each tab already owns one render `Component`, a child of the view
  (`src/view.ts` `ChatTab.renderer`, commit 4971588).
- Lint today (`npx eslint --print-config src/view.ts`; `npm run lint` uses
  `--max-warnings 0`): A10 is enforced by `no-unsanitized/property`,
  `no-unsanitized/method`, `@microsoft/sdl/no-inner-html`, `no-eval` and
  `@typescript-eslint/no-implied-eval` (Function constructor included);
  `no-restricted-globals` restricts `fetch` with the message "Use the
  built-in `requestUrl`", which A9 forbids; `eslint-plugin-import` is
  registered by `eslint-plugin-obsidianmd` as its own dependency;
  `eslint.config.mjs` is protected.
- Probe, esbuild metafile of `src/main.ts`: 37 modules, 0 runtime cycles.

## Options considered

### Vertical slices: Obsidian-free state, thin components subscribed to their owner's events (recommended)

- Each component subscribes, through Obsidian's `Events` and
  `registerEvent`, to the state it draws; unloading it drops the
  subscriptions; no framework code.
- Control flow is indirect; a component that does not subscribe goes stale.

### Same split, owners call each display from a fan-out list

- Control flow reads top to bottom from the owner.
- Every owner lists its displays and prunes the list by hand; a missing entry
  goes stale silently.

### Same split, an in-house reactive store

- Subscriptions by selector; no display forgotten.
- Selectors, equality, batching and unsubscription are framework code to own
  and test.

### A UI library in the bundle (Preact or Lit)

- Mature component model and keyed reconciliation.
- A runtime npm package in `main.js`.

### CSS-first reskin of today's view

- Fastest visible result.
- Grouping, numbering, shortening and dialog popovers need new state and DOM;
  the untested class keeps growing.

### Full decomposition before any visual change

- Clean structure before features.
- A long stretch with no verifiable user-visible step, ending in one large
  diff.

## Decision

Why subscriptions through Obsidian's `Events`:

- Over a fan-out list: the dependency sits in the component that draws it and
  ends with it (`Component.registerEvent`); a fan-out list repeats it in the
  owner and needs hand pruning (inferred cost).
- Over a store: `Events` gives subscription and cleanup with no selector or
  batching code; text deltas bypass both (below). That a store would cost the
  streaming path is inferred: `docs/records/verification/` holds no R29
  profile.
- Over a UI library: `Events` already gives subscription and cleanup
  (above), and a library is a runtime package that needs ADR-007's screen
  and an ADR of its own.
- Over a CSS-first reskin: R16 closes a group at reply text, thinking, a
  permission card, a Task call or the turn's end; R33 numbers prompts across
  the conversation; R31 shortens "WHILE the status line does not fit". These
  are state and measurement.
- Over decomposition first: "A new component shall land as a reachable
  walking skeleton before feature logic" (constitution); owner D1.

| Choice | Chosen | Rejected, and why |
| --- | --- | --- |
| Size rules | Container queries for presentational rules; TypeScript for hysteresis, DOM moves and fits | ResizeObserver classes for all: thresholds move into TypeScript, two layouts per resize (inferred). Container queries for all: R8's 820 px, 780 px while shown, needs state; R31 needs measurement |
| Popovers | One host per panel, inside the main column, on a pure state machine | `Menu`: attached to `body`, items only, not "a dialog named by its title" (R32), outside the forced theme. `popover="auto"`: native dismissal, and the top layer escapes the leaf's `contain: strict` clipping, but it paints over Obsidian's menus, modals and other panes, and its dismissal ignores the composer's suggests (inferred) |
| Tab cleanup | The tab's `Component` parents everything per tab | Hand-written teardown: the closed-tab render leak fixed in commit 4971588 came from it |
| Workflow host | Modal and `ItemView` sharing one component (change 003, Q23) | `ItemView` in a pop-out window (`openPopoutLeaf`, `obsidian.d.ts:7909`): one host and a native resizable window, but an OS window per open (inferred) |
| Boundary checks | `tests/architecture.test.mjs` over esbuild's metafile and TypeScript's checker | Core `no-restricted-imports`: matches import text, so `./chat-tab` and `../chat-tab` need separate patterns; a flat-config block replaces obsidianmd's entries for the same rule unless repeated; not covered by `no-restricted-disable`. `import/no-restricted-paths` and `import/no-cycle`: resolved paths and cycles, but a transitive dependency until declared through ADR-014. Both edit the protected `eslint.config.mjs` |

### Modules

- `src/state/`: Obsidian-free state, reducers and view-models; layer 1; each
  in `pretest`, tested with requirement IDs.
- `src/ui/`: components, each a `Component` owning one DOM subtree: event
  wiring and DOM writes only.
- `src/tab/`: one conversation's controllers; `src/view.ts`: the host.

Every DES-001 view job and every R30 to R35 surface has one module:

| Job or surface | Module | Obsidian-free logic |
| --- | --- | --- |
| Host the panel: tab list, open-tab persistence, the shared `obsidian` MCP server (DES-006) | `view` | `tabs` |
| Route one conversation's session events to its parts | `tab/chat-tab` | `tab` |
| Session creation, launch options, respawn | `tab/session-link` | — |
| Permission prompts: pending set, auto decisions, answers | `tab/permission-flow` | `permission` |
| Pre-image reads, diffs, change list | `tab/edit-tracker` | — |
| Restore and branch | `tab/restore-branch` | `restore` |
| `!` escape | `tab/shell-escape` | `bash` |
| Panel commands | `tab/panel-commands` | `commands` |
| History recording | `tab/recorder` | `tab` |
| Context block | `context-builder` (layer 3) | `context-format` |
| Stream messages to transcript changes | — | `stream` |
| Root, rows, container hosts; strip or column; column resize | `ui/shell` | `layout`, `tabs-layout` |
| Title block, header buttons, "More" | `ui/header` | — |
| Tab strip and drag order | `ui/tab-strip` | `tabs` |
| Switcher and its list (R30) | `ui/switcher` | `tabs` |
| Conversation column, filter, row menu, pin | `ui/conversation-column` | `conversation-list` |
| Changes chip and Transcript button (R30) | `ui/changes-bar` | — |
| Message list: order, bottom alignment, scroll-follow, link clicks and hover | `ui/messages` | — |
| Empty state and starters (R35) | `ui/empty-state` | — |
| Prompt in its style, pinned prompt (R33) | `ui/prompt` | `prompts` |
| Jump rail (R33) | `ui/jump-rail` | `prompts` |
| Turn head, text, thinking, footer (R15) | `ui/turn` | `turn`, `turn-cost` |
| Tool steps (R16) | `ui/steps-card` | `step-groups` |
| Agent rows (R18) | `ui/agent-row` | — |
| Run bar, today's background-task strip | `ui/run-bar` | — |
| Permission card, question form (drawing) | `ui/permission-card`, `ui/question-form` | `permission` |
| A `!` run's card | `ui/shell-card` | — |
| An error outside a turn | `ui/error-block` | — |
| Report cards | `report-view` | `commands` |
| Composer: input, chips, images, suggests, send, stop | `ui/composer` | `composer` |
| Status line: segments, fit, plan-usage polling visibility (R31) | `ui/status-line` | `status-line`, `usage-segment` |
| The one open popover (R32) | `ui/popover-host` | `popover` |
| The one hover card (R32) | `ui/hover-card-host` | `popover` |
| Model and effort, permission, profile, context, plan usage, changed files, "More", "+N" chips | `ui/popovers/<name>`, one each | per popover |
| Screen-reader announcements (R15) | `ui/announcer` | — |
| Copy buttons | `ui/copy` | — |
| Markdown rendering | `ui/markdown` | `inert-markdown` |
| Set-if-changed writes, keyed lists | `ui/dom` | — |
| Forced theme (R34) | `theme-scope` ([ADR-017](ADR-017-panel-css-and-forced-theme.md)) | `theme` |
| Shared 1 s ticker | — | `ticker` |

The usage formatters (`formatReset`, `formatRemaining`) and the usage cards
(`usageReport`, `creditsReport`) live in `state/usage-segment`, beside the
plan-usage hover card's rows (`usageHover`), which replace the strip's
tooltip.

### State and updates

| State | Owner |
| --- | --- |
| Settings, history, usage snapshot, CLI command list | Plugin services |
| Each root's mode | `theme-scope` |
| Tab list, active tab | `view` |
| Size class, strip or column, column width | `ui/shell` |
| Collapsed sections, filter text | `ui/conversation-column` |
| Open popover, focus-return target | `ui/popover-host` |
| Shown hover card | `ui/hover-card-host` |
| Transcript model, composer state, turn state, usage totals, scroll position | `tab/chat-tab`, data in `state/tab` |
| Session handle | `tab/session-link` |
| Pending permission prompts | `tab/permission-flow` |
| Pre-images, changed files | `tab/edit-tracker` |

- A component's constructor takes its parent element, a source (the owner's
  typed `Events` and read-only getters) and an intents object of callbacks
  (`onSend`, `onStop`, `onPick`, …); it never imports its owner.
- An input reaches its owner (a stream message `chat-tab`, a DOM event the
  component, which calls an intent, a resize `ui/shell`); the owner applies a
  `state/` function and triggers one event per changed part; each subscribed
  component derives its view-model and writes only what differs.
- Text and thinking deltas: `ui/turn` holds the open block's text node and
  exposes `appendDelta(blockId, text)`, which `chat-tab` calls directly; one
  scroll-follow per frame.
- Panel-level displays of the active tab (composer, status line) move their
  subscriptions on tab switch.

### Popovers, hover cards, tooltips

- The popover host is a layer inside the main column, so `cqi` measures the
  main column (ADR-017). It implements R32: opening one closes the other;
  dialog named by its title; trigger `aria-expanded`; focus to the first
  control; Escape or a pick closes and refocuses the trigger; an outside
  pointer-down closes and leaves focus. Height is bounded by the space on the
  side it opens (up from the status line, down from the header), read once
  on open, with internal scrolling.
- The hover-card host: 500 ms delay; shown on keyboard focus until blur.
- Text tooltips: `setTooltip(el, label, { delay: 400 })`
  (`obsidian.d.ts:7201-7219`, `delay` since 1.4.11).
- Composer Escape (R11) interrupts only when the host and the suggests report
  nothing open. `Menu` stays for the row's context menu.

### Size, visibility, timers

| Rule | Mechanism |
| --- | --- |
| Main column below 360 px, from 560 px (R30, R31) | CSS container queries (ADR-017) |
| Panel at most 640 px tall (R30) | CSS container query on the root (ADR-017) |
| Strip or column at 820 px, 780 px while shown (R8) | `state/layout` from `onResize` |
| Status-line steps, "+N" chips, rail tick positions | One `ResizeObserver` on the main column (column drags fire no `onResize`) and `css-change` (font, zoom), coalesced to one pass per frame; widths read once per label change; a pure function picks the step |
| Pinned prompt's stuck state (R33) | `IntersectionObserver` class |
| Plan-usage polling visibility (PRD-005.R3) | `isShown()` on the segment |

- Each threshold lives in one place, CSS or TypeScript.
- Observers and timers come from the element's own window (`el.win`);
  `timers` takes that window as a parameter.
- `state/ticker` runs while a subscriber reports itself shown (turn head of
  a running turn in the active tab, open tab hover card, run bar); shown
  state is re-checked on tab switch, `onResize`, workspace `resize`,
  `layout-change` and `active-leaf-change`, and `visibilitychange` (sidebar
  collapse requests a resize, not an immediate `layout-change`; `app.js`
  `collapse`).

### Reopen (R29)

- Render the newest turns until the messages fill the view plus one screen,
  scroll to the end, then render older turns in idle-time chunks above. Rail
  ticks come from the model and settle as turns render.
- Sections drawn above the view keep it in place through Chromium's scroll
  anchoring (`overflow-anchor: auto`, the default; neither `styles.css` nor
  Obsidian's `app.css` sets it). No script compensates for them: on top of
  anchoring it would move twice (probe: prepending 800 px above a list
  scrolled to its end moved `scrollTop` from 1700 to 2500 with no script).
- Content that grows below the view as Markdown, restored fences and embeds
  settle is outside anchoring: scroll-follow keeps a view that follows its
  end there (`followsEnd`, DES-003 Stream to messages).
- The 1,000-message R29 reopen profile checks both in Obsidian's Electron.
  DES-003 sets the chunk size.

### Workflow view's second host

Only if change 003 keeps R36:

- `ui/workflow-view`, host-agnostic, mounted by `WorkflowModal` (remembered
  size) and `WorkflowTabView` (`ItemView`, view type
  `ai-agent-panel-workflow`), registered in `main`.
- `main` hands the hosts a `WorkflowSource` that `view` implements; the
  conversation's tab owns the live state; closing it marks the workflow
  ended (R36).
- View state holds only the conversation and workflow ids; a tab restored
  without live data shows R36's restart message.

### Lifecycle

- The tab's `Component` parents its controllers, components, observers,
  ticker subscriptions and render children; `removeChild` on close releases
  them in one call.
- Shell, header, composer, status line, both hosts and the announcer are
  children of the view.

### Boundaries (D-02)

`tests/architecture.test.mjs` (`node:test`) builds esbuild's metafile for
runtime imports and runs TypeScript's checker for symbols; both are dev
dependencies already. Probe: 37 modules, 0 cycles; the checker found
`window` in `timers.ts` and nothing in `conversation-list.ts`; 0.9 s.
Type-only imports are erased and stay free. The test fails when a
`src/**/*.ts` file with runtime statements is missing from the metafile, so
no module escapes the rules and dead modules surface; a types-only file,
which esbuild erases, is exempt. Node builtins match with and without the
`node:` prefix.

| # | Rule |
| --- | --- |
| U1 | `src/state/**` imports no `obsidian`, `electron`, `src/ui/**`, `src/tab/**`, `view`, and uses no identifier or member whose every declaration is in `lib.dom*.d.ts` or `obsidian.d.ts` (globals such as `window`, and Obsidian's prototype additions such as `Array.prototype.contains`, which throw under `node --test`); checked by symbol |
| U2 | From outside `src/ui/`, `src/ui/**` imports only `src/state/**`, layer 1 modules, `diffview`, `report-view`, `suggest`, `confirm-modal`, `icon` and `obsidian`; imports inside `src/ui/` follow DES-003's P5 |
| U3 | Only `src/tab/**` imports `session`; only `view` imports `tab/chat-tab` |
| U4 | Only `main` imports `view` and the workflow hosts |
| U5 | Only `ui/markdown` references `MarkdownRenderer`; only `ui/messages` calls `window.open`; only `ui/copy` uses `navigator.clipboard`; no `DropdownComponent` or `addDropdown` outside `settings`; every `Modal`, `SuggestModal` or `FuzzySuggestModal` subclass calls `themeModal` (ADR-017); checked by symbol, so `import * as obsidian` cannot bypass it |
| U6 | No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `requestUrl`, `request`, Obsidian's `ajax` and `ajaxPromise` (`obsidian.d.ts:253-254`), Electron's `net`, `node:http`, `node:https`, `node:net`, `node:tls`, `node:dgram` in `src/` (A9, which gains the same list) |
| U7 | No runtime import cycles (A1) |

- The same test checks DES-001's A2, A3, A5 to A8, A11 (no `dependencies`)
  and A12 (every Obsidian-free module in `pretest`); A10 stays with today's
  lint. No `eslint.config.mjs` edit; the loss is editor feedback.
- On acceptance DES-001's A-table gains a Check column, its layers gain
  `src/state/` (1), `context-builder` and `theme-scope` (3), `src/tab/`
  and `src/ui/` (4); U1 to U7 replace the DES-003 draft's C3, C4, C6 and C7;
  D-02's boundary part leaves
  [open-decisions.md](../../current/open-decisions.md).

### Migration

1. Walking skeleton: `ui/shell`, `ui/header`, `ui/composer` and
   `ui/status-line` mount today's per-tab message elements and open today's
   menus; send, stream, stop and one permission against the fake CLI, at 300
   and 1040 px. Today's header, composer footer and control row go in the
   same commit.
2. One slice per task, in one commit: a region's `state/` modules and tests,
   its component, its CSS, and deletion of the `view.ts` code and CSS it
   replaces. No feature flags; no region drawn twice.
3. No release is cut from `main` between the first and the last slice of
   change 001; a hotfix branches from the last tag, is tagged there, and is
   cherry-picked to `main`. On acceptance `docs/current/DEVELOPMENT.md` gets
   the procedure: `npm version` on the hotfix branch, and resolving the
   `manifest.json`, `versions.json` and `RELEASE_NOTES.md` conflicts the
   cherry-pick brings.

### Validation

- `node:test` for every `src/state/` module and `tests/architecture.test.mjs`,
  both in `make verify`.
- Components: the DES-003 matrix rows each slice touches; DOM tests once
  change 001's DOM test-harness ADR is accepted.
- PRD-001.R29 profiles on the new layout, the 1,000-message reopen included.

## Consequences

- Easier: logic tested without Obsidian; regions replaced and reviewed one at
  a time; every A-rule checked by a test.
- Harder: indirect updates through events; `main` cannot be released mid-way
  through change 001.
- Locked in: no UI framework; the `state/`, `tab/`, `ui/` split; one popover
  per panel.
- Reversible: events are internal to each owner and component.
- Open: splitting `main`, `history` and `settings` (DES-001 open question);
  the second host waits on change 003's O3 and E6.
