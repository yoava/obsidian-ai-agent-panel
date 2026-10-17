# Settings redesign: implementation brief

Research input for the change that implements the settings boards and the
prompt color. Nothing here governs; the change delta, design and ADR updates
and tasks it leads to do, once the owner approves each.

## Sources

- The boards in this folder, byte-identical to the canvas
  https://claude.ai/artifact/7oFC6qZknD4LiF4ib7Ef6y, pages "Settings - one
  page, search, reset" and "Settings - full page, dark and light".
  `build/build.py` regenerates them in place; its `ROWS`, `WIN_ROWS`,
  `wsl_rows` and `PALETTE` hold the copy and the color values.
  `build/common.css` is the stylesheet the boards were built from, older
  than `../generator/common.css`; the code follows DES-003's tokens, not
  either file.
- Preview: `python3 -m http.server` in this folder, open a board, add
  `?theme=light` for light. `support.js` is a local stand-in for the
  canvas runtime.

| Board | Shows |
| --- | --- |
| `SettingsTabs` | 720 px: sticky bar, section links, Modified filter on |
| `SettingsSearch` | Search "prompt": matches in place, counts, Show |
| `SettingsNarrow` | 460 px: links on two rows, CLI-missing banner, stacked profiles |
| `SettingsReset` | Reset a row, a section, everything; Undo |
| `SettingsPromptColor` | Prompt color, Custom, an invalid value, every color in both modes |
| `SettingsFull-Dark`, `SettingsFull-Light` | Every row, default state |

- These supersede `../project/Settings.dc.html` and SPEC section 4.6. The
  canvas's "Redesign dark" page still shows the Quiet and Pop-out prompt
  styles; these boards win.
- Governing today: PRD-001 (R25 settings tab), DES-001 (the settings tab),
  DES-003 (prompt style, pinned prompt, jump rail), DES-005 (settings and
  device-local keys), ADR-009, ADR-013 (1.8.7 floor), ADR-017 (prompt color
  from `--color-orange`).

## Owner decisions

1. One scrolling page, no per-section tabs. Sections in order: General,
   Permissions, Appearance, Usage, Export, Claude Code.
2. Sticky bar: the plugin's own search, the Modified chip with its count,
   Reset all, the section links. Obsidian 1.13's global settings search
   keeps finding the settings too.
3. Section links: a link scrolls its heading to just under the bar (smooth,
   instant under reduced motion) and focuses the heading; passive scrolling
   never moves focus. The link of the section under the bar is current; at
   the bottom, the last section. `<nav>`, links and
   `aria-current="location"`, not tab semantics. Narrow, they wrap onto two
   rows.
4. Search filters the page in place over names, descriptions and values;
   matches are marked, empty sections hidden, counts on the links, zero-count
   links dimmed. Each hit has Show: clear the search, scroll to the setting,
   focus it. Esc clears. Section Reset buttons hide while searching.
5. Modified: the chip shows only settings that differ from their default,
   hides empty sections and profiles, shows counts on the links. A modified
   row always shows "Default: `<value>`" under its description and a bar on
   its leading edge. Search and Modified combine (AND).
6. Reset: a modified row's reset icon resets at once, no dialog. A section's
   "Reset N" and the bar's "Reset all..." open a dialog listing each change
   (old -> new, synced or device-local), marking one that turns a capability
   on, listing text it deletes by its first line. Reset all groups by
   section, says synced settings change on every device, and offers "Also
   reset Claude Code" and "Also reset what syncs", both unchecked. Every
   reset ends with a notice that has Undo. A section's count covers the
   whole section whatever the filters.
7. Claude Code section last. Profiles stacked, every row shown, each under a
   "Profile `<name>`" sub-heading; Add profile; Remove per profile; "Use for
   new conversations" per profile. A profile whose CLI is missing gets a
   banner at the top of the page with "Fix it" jumping to it, an alert icon
   on the Claude Code link and on its heading, and its own notice.
8. Prompt style: Card (today's Pop-out renamed: numbered, full width) and
   Bubble (right-aligned). Quiet is dropped as a style: it is the numbered
   layout with an outline and no fill, so a stored `quiet` becomes Card with
   the Clear color. Default Card. Whether the stored value `popout` stays or
   migrates is a design call.
9. Prompt color, a new setting, synced like Prompt style: Clear (outline
   only), Sand, Stone, Sage, Sea, Mist, Lavender, Rose, Accent (Obsidian's
   accent), Custom. Default Mist. Each named color has a dark and a light
   fill, line and ink (`PALETTE`); all muted, never saturated. Text keeps the
   theme's text color; the number box takes the color's ink. Custom: any
   CSS color for both modes, typed or picked (the picker writes hex); an
   invalid value shows "Not a CSS color. The prompt keeps the last valid
   one." Search finds Clear as outline, quiet or none. Replaces the fixed
   color from `--color-orange`.
10. Pickers with thumbnails stay thumbnails, never dropdowns. The Theme and
    Prompt style thumbnails draw in the picked prompt color.
11. Names and descriptions come from the boards wherever the setting exists.

## Constraints

- One definition list, both renderers: `getSettingDefinitions()` on 1.13+
  and `display()` on 1.8.7 to 1.12. First establish what the 1.13 API can
  host (sticky bar, in-place filtering, dialogs; `SettingDefinitionRender`,
  `SettingDefinitionPage` in `node_modules/obsidian/obsidian.d.ts`). Where it
  cannot, present options before designing around it.
- The boards' scroll-spy uses CSS view timelines, a mock device. Check
  support at the 1.8.7 floor's Electron, else observe the settings scroller
  (`.vertical-tab-content`). Measure the bar's height for jump offsets;
  recompute on filtering and resize.
- Color never carries meaning alone: the modified bar has its "Default:"
  line; alerts have an icon and text.
- Right-to-left works: logical properties, no left or right assumptions.
- Resets and Undo go through the existing save path and sync units
  (ADR-009).
- Every setting on the boards must exist in code and vice versa, except
  Prompt color and Custom color. List each mismatch and ask; never add or
  drop a setting on your own.

## Cycle

Run the whole cycle without stopping; the owner reviews and tests at the
end. Where an owner call is needed, take the recommended answer, keep going,
and add it to one numbered decision list with a recommendation each.

1. Drafts: change delta `docs/work/changes/<NNN>-settings-redesign.md` from
   `.agentic/templates/change.md`, numbered after the highest change number
   in `docs/`, EARS clauses, against PRD-001 and any other PRD it touches;
   DES-001 (settings tab), DES-003 (prompt style and color), DES-005 (keys,
   migration); ADR-017 amended for the prompt color; an ADR for the 1.13
   renderer approach if it needs a choice. Codex cross-reviews each ADR.
   Approving them (`make approve`) is the owner's; list it.
2. Tasks: one per change in `docs/work/tasks/r08-settings-redesign/` from
   `.agentic/templates/task.md`, with negative scope, numbered after the
   highest task number in `docs/`.
3. Per task:
   - Tests first in Obsidian-free modules, confirmed failing; a new module
     joins `pretest` and gets a layer (architecture rule A3).
   - `nvm use`, then `make verify` logged to a file; check the exit code and
     the closing "verify: OK".
   - An independent review agent, never the implementer. Codex cross-review
     for the migration and for the reset and Undo storage.
   - Mock fidelity: a UI task is accepted only when its harness screenshots
     match the boards (460 px and 720 px, dark and light). Method:
     `docs/records/verification/2026-10-13-r07-mock-fidelity.md`; harness in
     scratch, never in the repository.
   - In the same commit: the *Unreleased* section of `RELEASE_NOTES.md` and
     the doc that owns each fact. `make close`, a `Task: NNN` trailer, the
     git-conventions skill.
   - Never widen a task; re-plan instead.
4. Real-Obsidian checks (1.13 and pre-1.13, light and dark, 460 px and
   720 px, right-to-left) go to the owner's manual checklist; never claim
   them.

## Rules

- Protected paths (the hook's list, e.g. `eslint.config.mjs`,
  `package-lock.json`, `docs/current/constitution.md`): write the exact
  patch to a file and give the owner `! git apply <full path>`; packages as
  `! npm install <pkg>`.
- `tests/styles.test.mjs` and `tests/architecture.test.mjs` change only as
  an ADR requires; list each edit.
- `tests/tooltips.test.mjs` forbids `aria-label` on non-icon controls; the
  boards use it freely. The test wins.
- Fake CLI only; each real-CLI run needs the owner's approval.
- Never stage untracked dotfiles or device files; ask before deleting any.
- Release-ready, not released: no `npm version`, tag or push.
- Opus orchestrates, writes the drafts and reviews; Sonnet implements in
  worktrees without committing, and the orchestrator lands; Haiku for
  mechanical edits.

## Negative scope

No per-section tabs; no settings added or dropped beyond the prompt color;
no panel changes beyond the prompt color and style; no new runtime
dependency; no protected-path edits; no real-CLI runs without approval; no
mobile.
