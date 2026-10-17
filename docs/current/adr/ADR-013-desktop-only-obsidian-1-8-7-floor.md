# ADR-013 — Desktop only, Obsidian 1.8.7 floor

**Status:** accepted (2026-10-10)

## Context

- The plugin spawns processes and uses Node `fs` (ADR-001); mobile Obsidian
  has no Node.
- It calls `loadLocalStorage`/`saveLocalStorage` (1.8.7), the promise form of
  `workspace.revealLeaf` (1.7.2) and `fileManager.trashFile` (1.6.6).
- From Obsidian 1.13 a settings tab is built from `getSettingDefinitions()`,
  which also indexes it for settings search, and `display()` is not called;
  before 1.13 only `display()` renders it.

## Options considered

### Desktop only; floor 1.8.7; settings described once, rendered both ways (recommended)

- The widest audience the used APIs allow; searchable settings on 1.13+.
- Carries the deprecated `display()` path and its warning.

### Keep 1.5.0 by rewriting to older APIs

- Older apps admitted.
- Raw `localStorage` instead of the API the guidelines want, and deletes that
  ignore the vault's deleted-files setting.

### Raise the floor to 1.13 and drop `display()`

- One rendering path, no deprecation warning.
- Excludes users on 1.8.7 to 1.12 (commits 4ae0cf7, 56cd5c6).

## Decision

Why desktop only, the 1.8.7 floor, and settings described once:

- Desktop only: `isDesktopOnly` is for a plugin that "can only be used on
  the desktop app, for example because it uses NodeJS or Electron APIs"
  (Obsidian docs, *Manifest*); the plugin spawns the CLI
  (`src/protocol/client.ts:230`).
- Over keeping 1.5.0, local storage: `loadLocalStorage` reads "`localStorage`
  for this vault" from 1.8.7 (`node_modules/obsidian/obsidian.d.ts:467-470`);
  raw `localStorage` is shared by every vault the app opens (inferred).
- Over keeping 1.5.0, deletes: `trashFile` honours "the user's preferred
  'trash' options" (`obsidian.d.ts:2914-2918`, `@since 1.6.6`), and the
  directory's lint says "Prefer FileManager.trashFile() over Vault.trash() or
  Vault.delete() to respect user settings"
  (`node_modules/eslint-plugin-obsidianmd/dist/lib/rules/preferFileManagerTrashFile.js:9`).
- Over a 1.13 floor: Obsidian's typings keep `display()` "as a fallback for
  plugins that need to support Obsidian versions older than 1.13.0"
  (`obsidian.d.ts:6635-6636`). Dropping users on 1.8.7 to 1.12 costs more
  than the deprecation warning (inferred); their number is unknown because
  the plugin collects nothing (`docs/current/constitution.md:21-22`).

The design:

- `isDesktopOnly: true`; `minAppVersion` 1.8.7, the lowest that satisfies
  every call site; `versions.json` records the floor per release.
- `AgentPanelSettingTab` describes the tab once as groups of rows;
  `getSettingDefinitions()` maps them to Obsidian definitions and `display()`
  walks them. `requireApiVersion("1.13.0")` gates `update()` and
  `refreshDomState()`.
- Validation: the ESLint error `obsidianmd/no-unsupported-api` fails
  `make verify` on any Obsidian API newer than `minAppVersion` outside a
  `requireApiVersion` guard. `display()` has no automated test; it is checked
  by hand on an Obsidian below 1.13.

## Consequences

- Raising the floor is a change to this ADR.
- The `display()` deprecation warning is accepted while 1.8.7 to 1.12 are
  supported; Obsidian's typings prescribe the hybrid.
- Most rows are custom renders, because a definition cannot carry the per-row
  sync badge (ADR-009); they are still indexed by name and description.
