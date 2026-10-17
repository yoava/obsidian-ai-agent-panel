# CHG-006 — Show tooltips

**Status:** incorporated (2026-10-13)

## Intent

The owner asked (task 052): "Add "Show tooltips" to Settings › Appearance, on
by default, and to the panel's menu beside the theme choice. Off hides the
icon-only controls' text tooltips. Hover cards (tab, context, usage, turn
cost) stay."

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R32** — Popovers, hover cards and tooltips.
  - Before: WHEN the pointer rests on an icon-only control for 400 ms, the AI Agent Panel shall show a text tooltip with the control's label.
  - After: WHERE "Show tooltips" is on (the default), WHEN the pointer rests on an icon-only control for 400 ms, the AI Agent Panel shall show a text tooltip with the control's label.
  - Added: WHILE a control shows its label, the AI Agent Panel shall show the tooltip that R22, PRD-002.R8 or PRD-002.R18 asks for on it whatever "Show tooltips" says.
  - Added: WHEN the pointer rests on a rail tick, the AI Agent Panel shall show its tooltip (R33) whatever "Show tooltips" says.
  - Added: The AI Agent Panel shall offer "Show tooltips" as a checkable item in the panel's menu (the menu of its sidebar tab and its "More options" menu), which turns the setting on or off at once.
  - Reason: the owner's request above. The tooltips other requirements ask for as content (the model's full id, the mode's hover text, the restore title, a rail tick's prompt) are not names for icons, so the request does not cover them.
- **PRD-001.R25** — Settings tab, and which conversations each setting change reaches.
  - Before: The AI Agent Panel shall default to the account's default model, the CLI's default effort, note context on, tabs on top, no vault instructions, vault tools on (PRD-004), permission mode "Claude Code default", `!` shell escape on and bypass mode off (PRD-002), export off (PRD-003), theme "Match Obsidian" (R34), prompt style "Pop-out", the pinned prompt and the jump rail on (R33), and plan usage on (PRD-005).
  - After: The AI Agent Panel shall default to the account's default model, the CLI's default effort, note context on, tabs on top, no vault instructions, vault tools on (PRD-004), permission mode "Claude Code default", `!` shell escape on and bypass mode off (PRD-002), export off (PRD-003), theme "Match Obsidian" (R34), tooltips on (R32), prompt style "Pop-out", the pinned prompt and the jump rail on (R33), and plan usage on (PRD-005).
  - Before: The AI Agent Panel shall list "Theme" under an "Appearance" heading and the prompt settings under a "Messages" heading.
  - After: The AI Agent Panel shall list "Theme" and "Show tooltips" under an "Appearance" heading and the prompt settings under a "Messages" heading.
  - Before: WHEN the user changes "Conversation tabs", the theme, a prompt setting, the usage settings or the profile list, the AI Agent Panel shall apply the change to open panels immediately.
  - After: WHEN the user changes "Conversation tabs", the theme, "Show tooltips", a prompt setting, the usage settings or the profile list, the AI Agent Panel shall apply the change to open panels immediately.
  - Reason: the new setting is a settings row like the others.

## REMOVED requirements

None.

## Design and migration impact

DES-003 Popovers, hover cards and tooltips, Settings that reach the panel
and Token contract; DES-001 (the settings tab); DES-005 (the `showTooltips`
key, synced, default on; a stored value of another type loads as on); task
052. Existing data needs no migration.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-006-show-tooltips.md`, in task 052's
commit.
