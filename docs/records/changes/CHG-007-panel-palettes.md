# CHG-007 — Panel palettes

**Status:** incorporated (2026-10-13)

## Intent

[ADR-017](../../current/adr/ADR-017-panel-css-and-forced-theme.md) (accepted)
gives the panel its own light and dark palettes from the mock, with
Obsidian's accent, and fixes the final text of PRD-001.R34 and of R28's
second clause; its Theme setting section labels the stored `match` "Auto".
Task 057 implements it.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R34** — Theme.
  - Before: WHERE "Theme" is "Match Obsidian" (the default), the AI Agent Panel shall draw the panel in Obsidian's current light or dark mode.
  - Before: The AI Agent Panel shall take its colors, accent included, from the Obsidian theme's CSS variables and offer no accent setting.
  - Before: WHERE "Theme" is "Light" or "Dark" and Obsidian's default theme is active, the AI Agent Panel shall draw the panel, its popovers and its modals with the colors Obsidian uses in that mode; Obsidian's menus, tooltips and notices keep Obsidian's mode.
  - Before: WHERE "Theme" is "Light" or "Dark" and a community theme is active, the AI Agent Panel shall draw the panel in Obsidian's mode and show under the setting "Light and Dark apply with Obsidian's default theme only."
  - Before: IF "Theme" is "Light" or "Dark" and Obsidian's colors read the same in both modes, THEN the AI Agent Panel shall draw the panel in Obsidian's mode and show under the setting "Light and Dark have no effect with this Obsidian setup."
  - Before: IF "Theme" is "Light" or "Dark" and reading Obsidian's colors fails, THEN the AI Agent Panel shall draw the panel in Obsidian's mode and show under the setting "Light and Dark are unavailable: Obsidian's colors could not be read."
  - After: The AI Agent Panel shall draw its own chrome (the panel, the workflow view, their popovers, the board's tabs and the plugin's modals) in its own light and dark palettes, with Obsidian's accent color.
  - After: The AI Agent Panel shall pass the palette in effect to the content and controls Obsidian renders inside the panel through the variables Obsidian's default theme reads, except callout colors, which keep Obsidian's mode while the plugin supports Obsidian before 1.13.
  - After: WHERE "Theme" is "Auto", the AI Agent Panel shall use the palette of Obsidian's current mode and follow Obsidian's mode changes in every window.
  - After: WHERE "Theme" is "Light" or "Dark", the AI Agent Panel shall use that palette whatever Obsidian's mode or theme; what a community theme colors by its own rules, and Obsidian's menus, tooltips, notices, modal backdrop and settings window, keep Obsidian's mode.
  - After: The AI Agent Panel shall offer the Theme choice in Settings and in the panel's menu.
  - Reason: ADR-017's R34, final; the settings window keeps Obsidian's mode because the plugin's parts in it sit on Obsidian's background.
- **PRD-001.R28** — Accessibility.
  - Before: The AI Agent Panel shall tint the user's own messages with a color derived from the theme's `--color-orange`, keeping text on it at a contrast ratio of at least 4.5:1, verified in Obsidian's default light and dark themes.
  - After: The AI Agent Panel shall tint the user's own messages with its prompt color token, keeping text on it at a contrast ratio of at least 4.5:1 in both of the plugin's palettes.
  - Reason: ADR-017's R28 second clause, final.
- **PRD-001.R25** — Settings tab, and which conversations each setting change reaches.
  - Before: … export off (PRD-003), theme "Match Obsidian" (R34), tooltips on (R32), …
  - After: … export off (PRD-003), theme "Auto" (R34), tooltips on (R32), …
  - Reason: ADR-017 Theme setting: the stored `match` is labelled "Auto".

## REMOVED requirements

None.

## Design and migration impact

DES-003 Token contract (the palettes, the 115-name contract), Modules,
Settings that reach the panel, Performance budget, Verification; DES-001
(file map, events, settings tab, private API); `docs/current/SECURITY.md`
(the frame paragraph goes); task 057. The stored value `match` stays, so
existing data needs no migration.

## Incorporation

Folded into PRD-001 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-007-panel-palettes.md`, in task 057's
commit.
