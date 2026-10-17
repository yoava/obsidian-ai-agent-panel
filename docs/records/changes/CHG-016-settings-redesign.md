# CHG-016 — Settings redesign and prompt color

**Status:** incorporated (2026-10-16)

## Intent

The settings tab is six headed groups on one page with no way to find a
setting, see what differs from its default, or undo a change. The settings
boards (`docs/work/research/redesign-canvas/settings/`, brief `BRIEF.md`)
replace it with one page under a sticky bar (search, a Modified filter,
Reset all, section links), per-row and per-section reset with Undo, stacked
CLI profiles, and a new Prompt color setting. Quiet stops being a prompt
style: it is the numbered layout with an outline and no fill, which Card
with the Clear color draws. Setting names and descriptions follow the
boards. Affects PRD-001 (R3, R24, R25, R28, R33; new R39), PRD-002 (R8,
R10), PRD-004 (R1) and PRD-005 (R2).

## ADDED requirements

- **PRD-001.R39** — Settings page.
  - The AI Agent Panel shall show its settings as one scrolling page of the sections General, Permissions, Appearance, Usage, Export and Claude Code, in that order, each a heading, a one-line lead and its rows.
  - The AI Agent Panel shall keep a bar at the top of the page while it scrolls, holding a search field, a "Modified" filter with the number of modified settings, "Reset all…" and one link per section, the links wrapping onto more rows when the page is narrow.
  - WHEN the user activates a section link, the AI Agent Panel shall scroll that section's heading to just under the bar, smoothly unless the reduced-motion preference is on, and move focus to the heading.
  - The AI Agent Panel shall mark as current the link of the section under the bar, and the last section's link once the page is scrolled to its end, without moving focus.
  - WHILE the search field holds text, the AI Agent Panel shall show only the rows whose name, description or shown value contains it, ignoring case, mark the matching text, hide each section with no row shown, show on each link the number of rows shown in its section, dim a link whose number is zero, hide the sections' reset buttons and show a "Show" link on each row.
  - WHEN the user activates a row's "Show" link, the AI Agent Panel shall clear the search, scroll the row to just under the bar and focus its control.
  - WHEN the user presses Escape in the search field, the AI Agent Panel shall clear the search.
  - WHILE "Modified" is on, the AI Agent Panel shall show only the rows whose setting differs from its default, hide each section and CLI profile with none, and show on each link the number of rows shown in its section; with text in the search field, a row shows only when it meets both.
  - The AI Agent Panel shall treat a CLI profile's "Profile name", "Run via WSL" and "Use for new conversations" as naming the profile, never as modified, and reset none of them.
  - WHILE a row's setting differs from its default, the AI Agent Panel shall show "Default: <value>" under its description, a bar on the row's leading edge and a reset button named "Reset <name> to default: <value>".
  - WHEN the user activates a row's reset button, the AI Agent Panel shall reset that setting at once and show a notice with Undo.
  - WHILE a section has rows that differ from their defaults and the search field is empty, the AI Agent Panel shall show "Reset N" on the section's heading, N counting every such row in the section whatever "Modified" says.
  - WHEN the user activates a section's "Reset N" or "Reset all…", the AI Agent Panel shall open a dialog listing each change by name, old value and new value, whether it syncs or stays on this device, "turns on" for a change that switches a capability on, and the first line of any text it deletes, and change nothing until the user confirms.
  - The AI Agent Panel shall group the "Reset all…" dialog's changes by section, state that synced settings change on every device that syncs the vault, and offer "Also reset Claude Code" and "Also reset what syncs", both off; the Claude Code section is reset only with the first, and the sync choices only with the second.
  - WHEN a reset is saved, the AI Agent Panel shall show a notice naming what was reset, with an Undo button that restores every value the reset changed that has not been changed since, sync choices included, and names any value it left.
  - IF saving a reset or its Undo fails, THEN the AI Agent Panel shall say so in a notice and keep offering Undo.
  - The AI Agent Panel shall store each value a reset or its Undo writes where that setting's sync choice says (R24).
  - The AI Agent Panel shall show the Claude Code section's profiles one under another, each under "Profile <name>" with all its rows, "Use for new conversations" and "Remove", followed by "Add a CLI profile".
  - WHERE a CLI profile's CLI cannot be found, the AI Agent Panel shall show a banner at the top of the page naming that profile with a "Fix it" link that scrolls to it, an alert icon on the Claude Code link and heading, and a notice inside that profile saying what is missing.
  - The AI Agent Panel shall offer each choice that has previews (Theme, Conversation tabs, Prompt style, Prompt color) as cards, each a preview over its name.

## MODIFIED requirements

- **PRD-001.R3** — CLI profiles.
  - Before: The AI Agent Panel shall keep at least one named CLI profile, each holding a CLI path, "Run via WSL", "Claude in Chrome", "Bash sandbox" and additional arguments, with exactly one marked as default.
  - After: The AI Agent Panel shall keep at least one named CLI profile, each holding a CLI path, "Run via WSL", "Claude in Chrome", "Sandbox" and additional arguments, with exactly one marked as default.
  - After: WHEN the user turns on a profile's "Use for new conversations", the AI Agent Panel shall make that profile the default.
  - After: WHILE a profile is the default, the AI Agent Panel shall show its "Use for new conversations" on and disabled.
  - Before: WHILE only one profile exists, the AI Agent Panel shall hide the profile name, the "Default CLI profile" picker and the status line's profile segment.
  - After: WHILE only one profile exists, the AI Agent Panel shall hide its "Profile <name>" heading, its name, its "Use for new conversations", its "Remove" and the status line's profile segment.
  - Reason: the boards replace the picker with a per-profile switch on stacked profiles and name the sandbox row "Sandbox".
- **PRD-001.R4** — Per-profile launch options.
  - Before: WHERE a profile sets "Claude in Chrome" or "Bash sandbox" to On or Off, the AI Agent Panel shall launch that profile's CLI with the option forced to that value.
  - After: WHERE a profile sets "Claude in Chrome" or "Sandbox" to On or Off, the AI Agent Panel shall launch that profile's CLI with the option forced to that value.
  - Before: WHERE a profile leaves "Claude in Chrome" or "Bash sandbox" at "Claude Code default", the AI Agent Panel shall pass nothing for it, leaving the choice to Claude Code's own settings.
  - After: WHERE a profile leaves "Claude in Chrome" or "Sandbox" at "Claude Code default", the AI Agent Panel shall pass nothing for it, leaving the choice to Claude Code's own settings.
  - Reason: board name. The boards also disable Claude in Chrome in a WSL profile; it stays available there, as set (owner, decision 5): Claude Code's docs list WSL as unsupported, but Claude Code 2.1.0 fixed its WSL support and the CLI reaches the extension through a relay.
- **PRD-001.R24** — Settings storage and sync.
  - Before: WHEN settings saved by an earlier version load (a single CLI path, on a device whose CLI profiles sync; a usage interval in minutes; or the pre-rename device-local key), the AI Agent Panel shall migrate them without user action.
  - After: WHEN settings saved by an earlier version load (a single CLI path, on a device whose CLI profiles sync; a usage interval in minutes; the pre-rename device-local key; or the prompt style "Quiet"), the AI Agent Panel shall migrate them without user action, "Quiet" to "Card" with the prompt color "Clear" whatever prompt color is stored.
  - After: WHERE a device stores "Prompt style" on this device only and no store holds a prompt color yet, the AI Agent Panel shall store "Prompt color" on this device only too.
  - Before: WHEN the user clicks a settings row's cloud badge, the AI Agent Panel shall move that setting between synced and this-device-only storage and mark device-only rows "(not synced)".
  - After: WHEN the user clicks a settings row's cloud badge, the AI Agent Panel shall move that setting between synced and this-device-only storage and show a device-only row's badge as a crossed-out cloud, its tooltip saying it is stored on this device only.
  - Reason: Quiet is dropped as a style (owner decision 8); the new setting starts where its sibling is; the boards mark device-only rows by the badge alone.
- **PRD-001.R25** — Settings tab, and which conversations each setting change reaches.
  - Before: The AI Agent Panel shall default to the account's default model, the CLI's default effort, note context on, conversation tabs Automatic, no vault instructions, vault tools on (PRD-004), permission mode "Claude Code default", `!` shell escape on and bypass mode off (PRD-002), export off (PRD-003), theme "Auto" (R34), tooltips on (R32), prompt style "Pop-out", the pinned prompt and the jump rail on (R33), and plan usage on (PRD-005).
  - After: The AI Agent Panel shall default to the account's default model, the CLI's default effort, note context on, conversation tabs Automatic, no vault instructions, vault tools on (PRD-004), permission mode "Claude Code default", `!` shell escape on and bypass mode off (PRD-002), export off (PRD-003), theme "Auto" (R34), tooltips on (R32), prompt style "Card", prompt color "Mist", the pinned prompt and the jump rail on (R33), and plan usage on (PRD-005).
  - Before: The AI Agent Panel shall list "Theme" and "Show tooltips" under an "Appearance" heading and the prompt settings under a "Transcript" heading.
  - After: The AI Agent Panel shall list the theme, conversation tabs, "Show tooltips" and the prompt settings under "Appearance" (R39).
  - Reason: one page in six sections; the boards name the default style Card.
- **PRD-001.R28** — Accessibility.
  - Before: The AI Agent Panel shall distinguish the user's own messages from Claude's by a "You" label, shown in Quiet and Pop-out styles and given to screen readers in Bubble style, and by alignment or shape, not by color alone.
  - After: The AI Agent Panel shall distinguish the user's own messages from Claude's by a "You" label, shown in Card style and given to screen readers in Bubble style, and by alignment or shape, not by color alone.
  - Before: The AI Agent Panel shall tint the user's own messages with its prompt color token, keeping text on it at a contrast ratio of at least 4.5:1 in both of the plugin's palettes.
  - After: WHERE "Prompt color" is not "Custom", the AI Agent Panel shall keep the prompt's text at a contrast ratio of at least 4.5:1 on the prompt's fill in both of the plugin's palettes.
  - After: WHERE "Prompt color" is neither "Custom" nor "Accent", the AI Agent Panel shall keep the "You" label at a contrast ratio of at least 4.5:1 and the number box's outline at least 3:1 against the prompt's fill, composited over the panel background where translucent.
  - After: The AI Agent Panel shall show a modified setting by its "Default:" line as well as its bar, and a missing CLI by icon and text, not by color alone.
  - After: The AI Agent Panel shall expose the settings page's section links as a navigation landmark of links, the current one marked `aria-current="location"`.
  - Reason: Quiet is gone; a custom color is the user's responsibility, and Accent's ink follows whatever accent Obsidian has, checked only at Obsidian's default.
- **PRD-001.R33** — Prompt display.
  - Before:
    - The AI Agent Panel shall offer "Prompt style" as three cards, each a preview over its name and a caption, in this order: "Quiet" ("numbered, outlined"), "Bubble" ("right-aligned") and "Pop-out" ("numbered, tinted").
    - WHERE "Prompt style" is "Pop-out" (the default), the AI Agent Panel shall show each prompt full width and tinted, with its number, "You", its send time when recorded, and its context label, "N lines" for a selection.
    - WHERE "Prompt style" is "Quiet", the AI Agent Panel shall show each prompt as in Pop-out, outlined on the panel's background instead of tinted.
    - WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned with its context label under it, "N lines selected" in full.
    - The AI Agent Panel shall show a prompt sent bare, such as `/compact`, as a compact monospace message that keeps its number, shown as a badge beside it in Quiet and Pop-out.
    - WHERE "Prompt style" is "Quiet" or "Pop-out" and "Prompt jump rail" is on (the default), the AI Agent Panel shall show one tick per prompt along the right edge of the messages, at the prompt's relative position.
  - After:
    - The AI Agent Panel shall offer "Prompt style" as two cards: "Card" ("numbered, full width") and "Bubble" ("right-aligned").
    - WHERE "Prompt style" is "Card" (the default), the AI Agent Panel shall show each prompt full width in the prompt color, with its number, "You", its send time when recorded, and its context label, "N lines" for a selection.
    - WHERE "Prompt style" is "Bubble", the AI Agent Panel shall show each prompt right-aligned in the prompt color with its context label under it, "N lines selected" in full.
    - The AI Agent Panel shall show a prompt sent bare, such as `/compact`, as a compact monospace message that keeps its number, shown as a number box beside it in Card.
    - WHERE "Prompt style" is "Card" and "Prompt jump rail" is on (the default), the AI Agent Panel shall show one tick per prompt along the right edge of the messages, at the prompt's relative position.
    - The AI Agent Panel shall offer "Prompt color" as cards: "Clear", "Sand", "Stone", "Sage", "Sea", "Mist" (the default), "Lavender", "Rose", "Accent" and "Custom".
    - WHERE "Prompt color" is "Clear", the AI Agent Panel shall outline each prompt over the panel's background with no color fill.
    - WHERE "Prompt color" is Sand, Stone, Sage, Sea, Mist, Lavender or Rose, the AI Agent Panel shall fill and outline each prompt with that color's version for the palette in effect.
    - WHERE "Prompt color" is "Accent", the AI Agent Panel shall derive the prompt's fill and outline from Obsidian's accent.
    - The AI Agent Panel shall draw prompt text and number-box digits in the palette's text color, and the number-box outline, "You" label and current rail tick in the prompt color's ink.
    - The AI Agent Panel shall draw the pinned prompt with the selected prompt fill and outline over the panel background.
    - WHERE "Prompt color" is "Custom", the AI Agent Panel shall show a "Custom color" field that takes, typed or picked (the picker writes a hex value), a CSS color of at most 64 characters, using letters, digits, spaces and `#.,%/+-()`, with function names limited to `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color`, `color-mix`, `calc`, `min`, `max` and `clamp`, accepted by the host's CSS color parser and containing no `var()`, `env()`, `attr()`, `currentColor` or CSS-wide keyword, and use that color in both palettes.
    - IF the user clears the "Custom color" field while a color is stored, or the field holds a value that fails the length, character, function or host-parser check and is not refused under the next clause, THEN the AI Agent Panel shall say "Not a CSS color. The prompt keeps the last valid one." and keep the last valid color.
    - IF the "Custom color" field holds a value within the length and character limits that uses `var()`, `env()`, `attr()`, `currentColor` or a CSS-wide keyword, THEN the AI Agent Panel shall say "Use a color, not var(), env(), attr() or currentColor. The prompt keeps the last valid one." and keep the last valid color.
    - WHILE "Prompt color" is "Custom" and no valid custom color is stored, the AI Agent Panel shall draw prompts in Mist.
    - The AI Agent Panel shall draw the Theme and Prompt style previews in the picked prompt color.
    - WHEN the settings search holds "outline", "quiet" or "none", the AI Agent Panel shall find "Clear" among the prompt colors.
  - The other clauses stay.
  - Reason: owner decisions 8 to 10.
- **PRD-001.R34** — Theme.
  - Before: The AI Agent Panel shall draw its own chrome (the panel, the workflow view, their popovers, the board's tabs and the plugin's modals) in its own light and dark palettes, with Obsidian's accent color.
  - After: The AI Agent Panel shall draw its own chrome (the panel, the workflow view, their popovers, the board's tabs, the plugin's modals and the settings page, the page in Obsidian's mode whatever "Theme" is) in its own light and dark palettes, with Obsidian's accent color.
  - Reason: the settings boards draw the page in the plugin's palette, and following Obsidian's mode matches the settings window around it.
- **PRD-002.R8**, **PRD-002.R10** and PRD-002 *Security and privacy* — "Enable bypass-permissions mode".
  - Before: WHERE "Enable bypass-permissions mode" is on, the AI Agent Panel shall also offer "⚠ Bypass permissions".
  - After: WHERE "Bypass-permissions mode" is on, the AI Agent Panel shall also offer "⚠ Bypass permissions".
  - Before: WHERE "Enable bypass-permissions mode" is on, the AI Agent Panel shall launch a conversation's CLI with `--allow-dangerously-skip-permissions`.
  - After: WHERE "Bypass-permissions mode" is on, the AI Agent Panel shall launch a conversation's CLI with `--allow-dangerously-skip-permissions`.
  - Before: WHERE "Enable bypass-permissions mode" is off, the AI Agent Panel shall not apply a stored Bypass when its conversation is reopened, leaving the tab in the mode it already had.
  - After: WHERE "Bypass-permissions mode" is off, the AI Agent Panel shall not apply a stored Bypass when its conversation is reopened, leaving the tab in the mode it already had.
  - Before: WHEN "Enable bypass-permissions mode" is turned off while a conversation is in Bypass, the AI Agent Panel shall restart that conversation's CLI without the flag in Ask and show Ask.
  - After: WHEN "Bypass-permissions mode" is turned off while a conversation is in Bypass, the AI Agent Panel shall restart that conversation's CLI without the flag in Ask and show Ask.
  - Documentation: in PRD-002's Security and privacy section, "Enable bypass-permissions mode" becomes "Bypass-permissions mode".
  - Reason: board name.
- **PRD-004.R1** — "Give Claude the vault's link graph and metadata".
  - Before: WHERE "Give Claude the vault's link graph and metadata" is on (the default), the AI Agent Panel shall register an in-process MCP server named "obsidian" with the conversation's CLI, offering `obsidian_links`, `obsidian_search`, `obsidian_properties`, `obsidian_rename`, `obsidian_active` and `obsidian_open`.
  - After: WHERE "Vault tools for Claude" is on (the default), the AI Agent Panel shall register an in-process MCP server named "obsidian" with the conversation's CLI, offering `obsidian_links`, `obsidian_search`, `obsidian_properties`, `obsidian_rename`, `obsidian_active` and `obsidian_open`.
  - Reason: board name.
- **PRD-005.R2** — "Usage refresh interval".
  - Before: The AI Agent Panel shall reuse the last fetched usage while it is younger than "Usage refresh interval" (default 300 s, at least 10 s).
  - After: The AI Agent Panel shall reuse the last fetched usage while it is younger than "Refresh interval" under Usage (default 300 s, at least 10 s).
  - Reason: board name.

## REMOVED requirements

None. The Quiet clauses of PRD-001.R33 fold into Card with the Clear color
(MODIFIED above).

## Design and migration impact

- ADR-019 (new, `docs/current/adr/ADR-019-settings-page-on-the-declarative-api.md`):
  how one page with a sticky bar, in-place filtering and its own section
  headings is drawn through `getSettingDefinitions()` on 1.13 and
  `display()` before it.
- ADR-017 (rewrite, `docs/current/adr/ADR-017-panel-css-and-forced-theme.md`):
  prompt color tokens per color and palette, the selection classes, the
  Custom color's inline property and the `tests/styles.test.mjs` and
  `tests/palette.test.mjs` edits they need.
- DES-001 (settings page), DES-002 (stacked profiles, the missing-CLI
  state), DES-003 (prompt style and color), DES-005
  (the `promptColor` unit, `promptCustomColor`, the Quiet migration, reset
  and Undo storage): drafts in `docs/work/design/`.
- Data: two new synced keys, `promptColor` (default `mist`) and
  `promptCustomColor` (default empty), one sync unit with the prompt color's
  badge. The stored prompt style keeps `popout` for Card, so no migration
  runs for it and an earlier development build reads it unchanged; `quiet`
  migrates on each load until the next save.
  0.5.0 keeps the two new keys in `data.json` when they are there; it does
  not load device-local prompt colors and drops them from its device-local
  object on its next save.
- Rollback: an earlier build reads `popout` and `bubble` as before; a
  migrated `quiet` stays Card (Pop-out) there with no color.
- Docs: README feature list (settings search and reset, prompt color),
  RELEASE_NOTES *Unreleased*.

## Incorporation

Approval folds these deltas into the canonical PRDs in `docs/current/product/`
without renumbering unchanged requirements, and `make close DOC=<this file>`
moves this delta to `docs/records/changes/`, both in the approval commit. An
accepted requirement never lives outside the PRD.
