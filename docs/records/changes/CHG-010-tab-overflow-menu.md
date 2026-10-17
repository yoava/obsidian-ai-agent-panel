# CHG-010 — All-conversations menu when the tabs crowd

**Status:** incorporated (2026-10-13)

## Intent

The tab strip's chevron showed only once the strip scrolled, and inactive
tabs shrink to 24 px before it does, so with eight tabs at 440 px the titles
were slivers and no menu offered them. The owner's request of 2026-10-13
approves the change: "when too many tabs are opened and sessions not in side
(and it's hard to see or can't see all tabs), I want a small icon/button that
shows a dropdown of windows (e.g., there's a limit to how many tabs can be see
when on top. when there's too many tabs I want a drop down that allows viewing
all active sessions)". Task 078 implements it.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R7** — Conversation tabs.
  - Before: WHILE the tab strip overflows, the AI Agent Panel shall scroll it with the mouse wheel or a tab dragged to its edge and show a chevron menu listing every open tab with its working or waiting state.
  - After: WHILE the tab strip overflows, the AI Agent Panel shall scroll it with the mouse wheel or a tab dragged to its edge.
  - After: WHILE the tab strip overflows or has shrunk a tab with a cut title below 64 px, the AI Agent Panel shall show an "All conversations" button at the strip's end.
  - After: WHEN the user activates "All conversations" by pointer or keyboard, the AI Agent Panel shall show a menu of every open tab in strip order with its working or waiting state and a check on the active one.
  - After: WHEN the user picks a conversation from that menu, the AI Agent Panel shall make it the active tab and scroll its tab into view.
  - Reason: tabs shrink to 24 px before the strip scrolls, so the chevron came too late to help; below 64 px a tab shows four letters or fewer of its title. The menu is Obsidian's tab-list control, as the strip is Obsidian's tab markup (ADR-017 Tabs).

## REMOVED requirements

None.

## Design and migration impact

DES-003 Tabs and conversation column, Popovers, Accessibility, Alternatives;
task 078. No stored data changes.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-010-tab-overflow-menu.md`, in task 078's
commit.
