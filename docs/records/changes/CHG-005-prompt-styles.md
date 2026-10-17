# CHG-005 — Three prompt styles: Quiet, Bubble, Pop-out

**Status:** incorporated (2026-10-13)

## Intent

"Prompt style" gains a third value, Quiet: the numbered full-width layout on
the panel's background, outlined in amber. Pop-out stays the default and keeps
the numbered layout, now in the bubble's fill and border; Bubble is unchanged.
The settings offer the three as cards (owner request, redesign canvas D17,
task 051).

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R33** — Prompt display.
  - Before: WHERE "Prompt style" is "Pop-out" (the default), the AI Agent Panel shall show each prompt full width with its number, "You", its send time when recorded, and its context label. WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned with its context label under it. WHERE "Prompt style" is "Pop-out" and "Prompt jump rail" is on (the default), the AI Agent Panel shall show one tick per prompt along the right edge of the messages, at the prompt's relative position.
  - After: The AI Agent Panel shall offer "Prompt style" as three cards, each a preview over its name and a caption, in this order: "Quiet" ("numbered, outlined"), "Bubble" ("right-aligned") and "Pop-out" ("numbered, tinted"). WHERE "Prompt style" is "Pop-out" (the default), the AI Agent Panel shall show each prompt full width and tinted, with its number, "You", its send time when recorded, and its context label. WHERE "Prompt style" is "Quiet", the AI Agent Panel shall show each prompt as in Pop-out, outlined on the panel's background instead of tinted. WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned with its context label under it. WHERE "Prompt style" is "Quiet" or "Pop-out" and "Prompt jump rail" is on (the default), the AI Agent Panel shall show one tick per prompt along the right edge of the messages, at the prompt's relative position. The pinned prompt applies in every style.
  - Reason: a prompt that stands out less than Pop-out, while keeping its number and the jump rail.
- **PRD-001.R28** — Accessibility.
  - Before: The AI Agent Panel shall distinguish the user's own messages from Claude's by a "You" label, shown in Pop-out style and given to screen readers in Bubble style, and by alignment or shape, not by color alone.
  - After: The AI Agent Panel shall distinguish the user's own messages from Claude's by a "You" label, shown in Quiet and Pop-out styles and given to screen readers in Bubble style, and by alignment or shape, not by color alone.
  - Reason: Quiet is a numbered style.

Defaults (PRD-001.R25) are unchanged: prompt style "Pop-out", the pinned prompt
and the jump rail on. A stored "popout" or "bubble" stays valid; any other
stored value loads as "popout".

## REMOVED requirements

None.

## Design and migration impact

DES-003 Prompts, Settings that reach the panel and Token contract (the prompt
fill and line, which Pop-out and Bubble now share, and the amber tokens);
DES-001 Settings tab; README feature list; task 051. No stored data changes.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-005-prompt-styles.md`, in task 051's commit.
