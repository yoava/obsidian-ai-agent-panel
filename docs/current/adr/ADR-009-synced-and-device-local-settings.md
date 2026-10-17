# ADR-009 — Synced and device-local settings per sync unit

**Status:** accepted (2026-10-16)

## Context

- Obsidian Sync and folder-sync tools carry `data.json` to every device.
  `App.saveLocalStorage` (Obsidian 1.8.7+) stores a vault-specific value in
  the app's `localStorage`, outside the vault folder, so no sync tool carries
  it.
- Some settings are machine facts (CLI paths and profiles, learned CLI
  metadata, column width); others are preferences a user may want everywhere
  or per device.
- Some settings widen what the agent does without a card: the default
  permission mode (auto-approve), the bypass gate, the vault instructions
  appended to the system prompt, the `!` shell escape and the vault tools.
  Whoever can write a synced `data.json` (another device, a shared vault, a
  sync tool) sets what it holds on every device that reads it.
- The constitution keeps CLI paths and profiles, these settings and the list
  of local units on the device by default, and validates a value read from a
  synced or stored file before it can widen what the plugin does.

## Options considered

### Per-row sync units the user can flip; machine facts local by default (recommended)

- Each setting lands where the user wants; CLI paths do not fight across
  devices.
- Two stores and a routing layer. The list of local units and the
  security-relevant units must stay on the device, or a `data.json` writer
  could move a unit back to synced or widen what a device does.

### Everything in `data.json`

- One store, Obsidian's default.
- Install paths and learned CLI metadata overwrite each other across devices;
  whoever writes `data.json` sets every security-relevant setting on every
  device.

### A fixed split with no user choice

- Simpler settings UI; a security-relevant setting could never sync.
- A preference such as the model or usage thresholds is synced or local for
  every user alike.

## Decision

Why per-row units:

- Machine facts break when synced: the `cli` unit holds executable paths and
  profiles (`SYNC_UNITS` in `src/settings-core.ts`), and a synced path launches whatever
  sits there on another device (ADR-008).
- Device-local storage exists without a dependency: `saveLocalStorage` and
  `loadLocalStorage` are in the API from 1.8.7
  (`node_modules/obsidian/obsidian.d.ts`, `@since 1.8.7`), the plugin's floor
  (ADR-013).
- Preferences differ by user, so the split is the user's; a fixed split
  would decide it for everyone.

The design:

- `SYNC_UNITS` in `src/settings-core.ts` maps each settings row to its keys;
  the row's cloud badge flips its unit. `splitSettings` and
  `mergeLocalSettings` route values on save and load.
- Local by default (`defaultLocal: true`): `cli` (profiles, default profile),
  `permissionMode`, `bypass`, `instructions`, `bash` and `obsidianMcp`.
  Always local, with no badge: `localGroups`, `resolvedModels`, `cliModels`,
  `cliStartupModes`. Every other unit defaults to synced.
- `localGroups` lives in device-local storage only; `data.json` no longer
  carries it. A device without a list of its own starts from the
  default-local units plus any unit a `data.json` list written by an earlier
  version names: a list from `data.json` can make more units local, never
  fewer.
- A value still in `data.json` seeds a device that has none of its own, then
  leaves `data.json` on the next save; the CLI profiles and default profile,
  the permission mode, bypass, instructions, shell and vault-tool switches are
  never seeded and start at their defaults on a fresh device (PRD-001.R24; CLI
  profiles start with auto-detect), so a synced value cannot choose the
  executable or widen what a device does. The exception is an update from
  0.5.0 or earlier, recognised by a device object with no `localGroups` key
  and a key those builds wrote (local storage never syncs, so a synced file
  cannot forge it): the device takes the permission mode, instructions, shell
  and vault-tool switches once from `data.json`, the mode only if Plan or
  Claude Code default, a missing key failing closed (off, off, empty,
  default); bypass and the CLI profiles are never taken. The load saves at
  once, device object first, so the seed never repeats after a successful
  save. The update trusts the shared file's current switches, mode and
  instructions once and never grants more than a fresh device's defaults,
  the instructions excepted.
- Every value is validated on load, from either store: `normalizeSettings`
  checks each key against its default's type and allowed values and falls
  back to the default. A permission mode the setting does not offer becomes
  Claude Code default (ADR-002). Device-local reads are typed `unknown`
  (`src/local-store.ts`), so callers must narrow them.
- Layout state (open tabs, column width, collapsed sections) is device-local
  storage outside the settings model; pin state lives in the conversation
  file (ADR-005). So is the record of which session ids this device saw per
  conversation and profile (ADR-018); its one-time migration marker is a
  file in the history folder (ADR-005), so it travels with the history
  rather than with settings.
- Validation: `tests/settings-core.test.mjs`, with cases for the
  security units' local default, the CLI profiles and the security units
  starting at their defaults rather than from `data.json`, a `data.json`
  list that cannot make a default-local unit synced, and a wrong-typed or
  out-of-range value falling back to its default.

## Consequences

- Requires Obsidian 1.8.7 (ADR-013).
- A user who wants the same vault instructions, default mode or local-unit
  choices on every device sets them on each device, or switches the unit to
  synced; a unit switched to synced is set on that device by any writer of
  `data.json`.
- A device with no value of its own for a local setting other than the CLI
  profiles and the five security settings takes it once from `data.json`,
  validated. A fresh device gets the defaults for the profiles and the five
  security settings; the first device to update from 0.5.0 or earlier keeps
  its Bash and vault-tool switches, mode (Plan or Claude Code default) and
  instructions, while a device updating after another one already has (the
  shared file no longer holds them) gets Bash and vault tools off and sets
  the mode and instructions again; profiles return to auto-detect. A device
  still on 0.5.0 after another updated runs with Bash and vault tools on and
  no instructions until it updates, so every device should be updated.
- Switching the `cli` unit to synced shares this device's profiles and
  replaces the synced ones, so a new device that joins a synced vault and
  syncs the group replaces the shared profiles with its own.
- Switching a unit from synced to device-only keeps the values then in
  effect, so CLI profiles taken from `data.json` while synced stay; so do
  profiles an earlier version seeded and saved on the device.
- Rolling back to an earlier release finds no `localGroups` in `data.json`,
  treats only `cli` as local, and finds the moved values gone from
  `data.json`, so the security units and any other local unit fall back to
  their defaults (inferred from `sanitizeLocalGroups` and
  `mergeLocalSettings`).
