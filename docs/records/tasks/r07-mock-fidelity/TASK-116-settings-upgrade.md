---
status: closed
release: r07-mock-fidelity
number: 116
prd: PRD-001.R24
---

# TASK-116 — An upgrade from 0.5.0 keeps the device's security settings

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Release review found that `settingsFromStores` resets every never-seeded unit
to its default whenever the device-local object has no `localGroups`. Every
0.5.0 device has such an object, so on upgrade Bash mode and vault tools
turned off came back on, Plan became the default and the vault instructions
were lost.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R24 (clause change drafted in change 015);
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md)
(rewrite pending owner approval);
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) Load.

Acceptance:

1. A device object with no `localGroups` key and a key a 0.5.0-or-earlier build
   wrote is an upgrade. It takes the permission default (only `plan` or
   `default`), shell escape, vault tools and vault instructions from
   `data.json`; a missing key loads off, off, empty, default. Bypass and the
   CLI profiles are never taken; the device's own values win.
2. A fresh device, a malformed or present `localGroups`, and an unknown-keys
   object start the never-seeded units at their defaults.
3. An upgrading load saves at once, device object first; the seed never repeats.
4. Prototype keys in `data.json` change nothing.

## Scope

Expected files: `src/settings-core.ts`, `tests/settings-core.test.mjs`,
DES-005, `docs/current/SECURITY.md`, `RELEASE_NOTES.md`,
`docs/records/changes/CHG-015-settings-upgrade-keeps-security.md`.

Negative scope: no change to fresh-device or post-upgrade loading, no new
setting, no UI change; `docs/current/adr/` and the PRD are not edited (owner
approval).

## Plan

Tests first in `tests/settings-core.test.mjs`, then `isUpgradeShape`,
`writeStores` and the upgrade branch of `settingsFromStores`; `main.ts`
saves after an upgrading load. Two existing tests that used a local object
without `localGroups` as a fresh device now use one with `localGroups`.
Rejected: reading the version from `manifest.json` (not available in the
pure module) and a stored marker (a second persisted shape).

## Run log

- Tests added, existing two adjusted; `npm test` green.
- Rebased onto 85866ad; the new R24 clause split in two, one "shall" each, for the PRD check; task 120's test that `loadSettings` never saves now allows only the upgrade's save (`tests/state-theme.test.mjs`); `make verify` OK.

## Independent review

An Opus review agent (not the implementer), three rounds, and Codex, three rounds. Fixed: a synced file could choose the executable (CLI profiles are never taken now); a later-updating device fell back to Bash and vault tools on (keys another device moved out now load off); invalid Bash or vault-tools values loaded on, and a non-string mode could throw; the upgrade was persisted only at the first save, and a failed upgrade-time save stopped the plugin loading; local storage is now written before data.json; the docs overclaimed. Disclosed, not fixed: the upgrade trusts the shared file's current Bash, vault-tools, mode and instructions once (never beyond a fresh device's defaults, the instructions excepted; Codex would add a confirmation, an owner decision), and a device still on 0.5.0 after another updated runs on defaults until it updates. Final verdict: approve; `make verify` exit 0.

## Outcome

Done.
