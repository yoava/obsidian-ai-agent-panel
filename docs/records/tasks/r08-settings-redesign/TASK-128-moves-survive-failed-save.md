---
status: closed
release: r08-settings-redesign
number: 128
prd: PRD-001.R24
---

# TASK-128 — A setting moved to synced survives a failed `data.json` write

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, `fix` (owner decision 28). Governing:
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R24;
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md);
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) Load and
Save.

`writeStores` writes the device object, then `data.json` (device first, so a
failed local write after a 0.5.0 upgrade leaves `data.json` whole; keep
that). When a save moves a unit from this device to synced (a sync badge
flip, a reset of sync choices, its Undo), the device object drops the unit's
keys and routing before `data.json` holds them; if that `data.json` write
fails, neither store has them, and a restart resets them to defaults (a
profile's CLI path and arguments). 0.5.0 wrote `data.json` first and did not
lose them.

Acceptance:

1. A save that moves units from this device to synced writes three times:
   the device object with the new values, still listing the moving units as
   local and holding their current values; then `data.json`; then the device
   object without them. A save that moves nothing to synced writes as today
   (device object, then `data.json`).
2. After a failed `data.json` write, loading the stores as they are holds
   every moved value (still device-only). After a failed last write, it holds
   every value too.
3. A unit moving to this device, alone or in the same save as one moving to
   synced, keeps today's guarantee: the device object holds it before
   `data.json` drops it.
4. A failed first write reaches neither store, as today.
5. Which units the device object lists as local is read from the device
   object as stored (the key load reads, legacy fallback included), so the
   rule holds for any caller and after a reload; a device object without a
   list of its own means the routing the load derived from both stores.

## Scope

Expected files: `src/settings-core.ts` (`writeStores`, `StoreWriters`),
`src/main.ts` (the writers); tests `settings-core`; docs DES-005 (Load
step 3's save sentence, the Save paragraph), `docs/current/DEVELOPMENT.md`
(test table), `RELEASE_NOTES.md` (Unreleased).

Negative scope:

- No change to the storage format, the keys, `splitSettings`'s routing, the
  load order, the upgrade rule or `serializeSaves`.
- No retry loop and no new Notice; no new dependency; no protected-path edit.

## Plan

- Tests first, confirmed failing: fake writers in `tests/settings-core.test.mjs`
  that record each write and can reject the `data.json` one or throw on the
  nth local one; reload with `settingsFromStores` from what they recorded.
  Cases: `cli` and a non-security unit moved to synced with `data.json`
  failing, succeeding, and the last local write throwing; a unit moved to
  local with `data.json` failing; a mixed save; a save that moves nothing
  (one local write); a first-write throw.
- Reuse `splitSettings`, `sanitizeLocalGroups`, `localSettingKeys`.
- Codex reviews the storage change (brief); `make verify`.
- Rejected: writing `data.json` first (breaks the 0.5.0 upgrade guarantee);
  tracking the stored routing in memory alone (wrong after a failed write and
  duplicated per caller).

## Run log

- Tests first: 8 new or changed tests fail on the old `writeStores` (`# pass 1848`, `# fail 8`).
- Round 2 (Codex P1, the reviewer's remaining risk): a device object without
  a list meant the default routing, not the load's, so a unit a 0.5.0
  `data.json` list made device-only was lost by a failed move. Tests first:
  `# pass 1854`, `# fail 3`; the writers now take `loadedLocalGroups`.
- Round 2 (review patch): one `readLocalSettings` for load and save; DES-005
  says "first write"; a stored list with pre-release group keys is read as
  load reads it (the one surviving mutant).
- Rebased onto task 127 (`8096c1f`); the two doc conflicts kept both.

## Independent review

Codex (two rounds, static) and an Opus review agent (not the implementer),
with 14 mutants of `writeStores` (13 killed, the 14th killed by its new test)
and probes: the 0.5.0 upgrade save, queued saves with failures, a move back
while `data.json` is in flight, a sync-choice reset and its Undo failing, a
fresh device moving `cli` to synced, Bypass moved to synced. Fixed: the
round 2 items. Disclosed, not fixed (predates this task): after a failed move
to this device, an edit that clears an optional value (`lastModel`,
`lastEffort`) and a second failed `data.json` write, the next load takes the
old value from `data.json`. Final verdict: approve after fixes, applied and
verified by the orchestrator (`make verify`).

## Outcome

Done.
