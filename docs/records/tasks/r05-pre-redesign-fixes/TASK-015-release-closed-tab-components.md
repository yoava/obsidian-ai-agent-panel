---
status: closed
release: r05-pre-redesign-fixes
number: 015
prd: PRD-001.R29
---

# TASK-015 — Release a closed tab's rendered components

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Every `MarkdownRenderer` call parents its render children (embeds, code-block
and post processors) to the view, so a closed tab's children stay loaded until
the view closes. PRD-001.R29: "WHEN a tab closes, the AI Agent Panel shall
release that tab's DOM, listeners, timers and rendered child components."

Governing: PRD-001.R29,
[DES-001](../../../current/design/DES-001-system-overview.md) (view
lifecycle, rendering boundary),
[ADR-010](../../../current/adr/ADR-010-render-model-output-with-markdownrenderer.md).

Acceptance:

1. Each tab owns one `Component`, created with the tab as a child of the view.
2. Every Markdown render made for a tab passes that component: live and
   restored replies, subagent text, usage cards, allowlisted fences, and the
   Rendered panes of edit diffs in tool and permission cards. No call passes
   the view.
3. Closing a tab unloads its component and removes it from the view's
   children; other tabs' components stay loaded. Closing the view still
   unloads every tab's, through the view's children. The unload is the last
   step of the close, and a throwing `onunload` is logged without skipping the
   tab switch, tab list or saved tab state.
4. A tab reused for another conversation (`restoreConversation` on an empty
   tab) gets a fresh component and the old one unloads, same guard.
5. `renderMarkdown` does nothing for a tab that is no longer open: at its
   start, after the first render, and for each fence.
6. A closed tab leaves no tab-scoped timer, frame callback or listener on a
   long-lived target: the 1 Hz busy timer stops unless another tab is busy,
   and no `registerDomEvent`, `registerEvent` or interval is created per tab.

## Scope

Expected files:

- `src/view.ts` (`ChatTab.renderer`, `addTab`, `closeTab`, `unloadRenderer`,
  `restoreConversation`, `renderMarkdown` and its callers `renderEditDiff`,
  `fillPermissionDiff`)
- `RELEASE_NOTES.md`, `docs/current/design/DES-001-system-overview.md` (view
  lifecycle), the DES-003 draft (tab object, close, `renderMarkdown`),
  `docs/current/plan.md` (backlog item reduced to its first half)

Negative scope:

- Reopen rendering: eager render of every message and the scroll before
  Markdown settles (the backlog item's first half).
- Anything outside tab close and tab reuse: the view-close path, session and
  CLI teardown, diff row rendering.
- No new module, dependency or test file: nothing pure emerged (see Plan).

## Plan

- `ChatTab.renderer = this.addChild(new Component())` in `addTab`;
  `unloadRenderer` calls `this.removeChild(renderer)` in a try/catch, which
  unloads it and everything rendered into it. `closeTab` calls it last;
  `restoreConversation` replaces the component of a reused tab and unloads the
  old one. `renderMarkdown(tab, markdown, el)` passes the component to both
  `MarkdownRenderer.render` calls and returns early once the tab is not in
  `this.tabs`; `renderEditDiff` and `fillPermissionDiff` take the tab for the
  diff view's callback.
- Reuses Obsidian's `Component`; the view's own children unload with the view.
- No pure logic: which component a render uses is the `tab` argument, so no
  Obsidian-free module or test applies (`view.ts` imports `obsidian`,
  AGENTS.md section 8). `make verify` covers types and lint.
- Manual check, deferred: the owner tests in a vault at the end of the
  release, so no verification record is written here (PRD-001.R29 is verified
  by hand, DES-003). Open two tabs; in each render a reply with an
  `![[note]]` embed. In DevTools wrap `Component.prototype.unload` from
  `require("obsidian")` with a counter that counts only calls where
  `this.containerEl?.hasClass("markdown-embed")`: closing one tab raises it by
  that tab's embeds and leaves the other tab's embed live; closing the view
  raises it by the rest. Opening a stored conversation in an empty tab whose
  conversation was deleted raises it by the old replies' embeds.
- Rejected: one shared component with per-render children removed on close
  (the tab would have to track every child); passing a `MarkdownRenderChild`
  per message (a component per reply, same ownership, more bookkeeping).

## Run log

- Audit of other tab-scoped resources in `view.ts`: no `registerDomEvent` or
  `registerEvent` is created per tab (all in `onOpen` or the side resizer);
  tab and card listeners sit on elements removed with the tab; timers are the
  view's `busyTimer` (re-evaluated by `closeTab`), `usageTimer`, the scroll
  frame (checks `tab === this.active`) and short UI timeouts. Nothing else to
  fix in this mechanism.
- A render already inside `MarkdownRenderer.render` when its tab closes may
  still add children to the unloaded component; whether Obsidian loads them
  is not verified. `renderMarkdown` starts no further render after the close.
- The manual vault check is deferred to the owner's end-of-release test.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Gap: `restoreConversation` reused an emptied tab (one detached from a
   deleted conversation still shows rendered replies) without releasing the
   old transcript's render children. Fixed: the component is replaced and the
   old one unloaded.
2. Gap: `closeTab` unloaded the component before the tab switch, tab list and
   saved tab state, which a throwing third-party `onunload` would skip. Fixed:
   the unload is the last statement, in a try/catch that logs; the
   replacement in item 1 uses the same guard.
3. Gap: `renderMarkdown` kept rendering for a tab that had closed. Fixed: it
   returns early at its start, after the first render and in the fence
   callback; the Run log no longer claims no resource is held.
4. Stale: the DES-003 draft's residual said the view is passed as the render
   component. Fixed.
5. Nit: the DES-003 draft's tab-object sentence repeated DES-001. Fixed: "its
   render component".
6. Gap: the manual vault check was not run. Deferred to the owner's
   end-of-release test, stated in Plan and Run log; no verification record.
7. Nit: the Plan's heap-snapshot check was imprecise. Fixed: a counter on
   `Component.prototype.unload` filtered on `markdown-embed`.
8. Nit: the release-note bullet did not match the neighbouring "Fixed:"
   style. Fixed.

## Outcome

Each tab owns the component its Markdown renders under; closing the tab, or
replacing its transcript, unloads it. Owed by hand in a vault: the unload
counter check in the Plan.
