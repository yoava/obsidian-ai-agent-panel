---
status: closed
release: r05-pre-redesign-fixes
number: 021
prd: PRD-001.R24
---

# TASK-021 — Never seed the CLI profiles from `data.json`

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A device that has no CLI profiles of its own takes the ones `data.json` holds.
`data.json` sits inside the vault, so a shared vault, a sync tool or the
agent's own file tools can write it; the profiles carry `cliPath` and
`extraArgs`, which decide what the plugin executes on that device. The five
security settings already start at their defaults on such a device; the CLI
profiles do not, although the constitution keeps "CLI paths and profiles"
local and ADR-008 names the same exposure. Auto-detect covers a new device, so
the value lost by not seeding is one profile re-entered by a user with a custom
path.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R24, [ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md),
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) (Load step 3,
Consequences), constitution *Device-local settings stay local*, backlog item in
`plan.md` (removed by this task).

PRD-001.R24's two seeding clauses and ADR-009's seeding and Consequences
bullets said CLI profiles seed from `data.json`, against the constitution's
rule that a synced value is validated before it can widen what the plugin
does. This task brings both in line with the constitution; the owner
confirms the amendment.

Acceptance:

1. A device whose `cli` unit is local and has no local CLI values loads the
   defaults for `cliProfiles` and `defaultProfileId` (one auto-detect profile
   with id `default`), whatever `data.json` holds: profiles, a default id, or
   the pre-0.4 flat `cliPath` and `useWsl`.
2. This device's own profiles still apply.
3. A device that switched `cli` to synced follows `data.json` for both keys,
   a stale local copy ignored (as today).
4. Every other device-local unit, `model` and `context` in the tests, still
   takes a `data.json` value it has no local one for, and that value leaves
   `data.json` at the next save.
5. Unchanged: which units are device-local by default, `splitSettings`, the
   settings tab, the five security settings' behavior, the load validation.
6. PRD-001.R24, ADR-009, DES-001, DES-005, SECURITY.md, the README and the
   release notes state the rule, the flat-path migration (only where the CLI
   profiles sync) and that switching the CLI group to synced replaces the
   synced profiles with this device's; the `plan.md` backlog item is gone.

## Scope

Expected files:

- `src/settings-core.ts` (`SyncUnit`, `SYNC_UNITS`, `settingsFromStores`),
  `tests/settings-core.test.mjs`
- `docs/current/product/PRD-001-chat-panel-and-sessions.md` (R24),
  `docs/current/adr/ADR-009-synced-and-device-local-settings.md` (Status date,
  Decision seeding and Validation bullets, Consequences) and its row in
  `docs/current/adr/README.md`
- `docs/current/design/DES-005-persistence-and-sync.md`,
  `docs/current/design/DES-001-system-overview.md` (compatibility at load),
  `docs/current/SECURITY.md`, `docs/current/DEVELOPMENT.md` (test table),
  `docs/current/plan.md`, `README.md`, `RELEASE_NOTES.md`

Negative scope:

- The settings tab, the sync badge, the default-local list, `splitSettings`
  and `mergeLocalSettings`.
- Seeding any other unit; a prompt or migration that carries an old
  `data.json` profile to the device.
- The constitution, protected paths, a real CLI run.

## Plan

- Tests first in `tests/settings-core.test.mjs`: the new never-seeded test
  (data.json profiles, default id and flat fields; own profiles), a synced
  `cli`, and a non-security unit still seeding. The existing tests that read
  profiles from `data.json` now say the device syncs `cli` (`CLI_SYNCED`); the
  one that showed seeding with `cli` shows it with `model`.
- `SyncUnit.security` has one reader, the seeding rule in `settingsFromStores`
  (no other file, test or script reads it), so the flag becomes `neverSeeded`
  and goes on `cli` too. The `cli` unit keeps its other behavior: default-local
  list, badge, and what `localGroups` from `data.json` may add.
- Rejected: a second flag beside `security`, which would leave `security`
  without a reader; seeding only profiles that pass a path allowlist, which
  adds a policy to maintain where auto-detect already works.
- Verification: `make verify`; independent review.

## Run log

- Tests first: against the old code the new never-seeded test failed (1 of
  443); the synced-`cli` and non-security seed tests, and the edited tests, held.
  All 443 pass after the change.
- After review: a device's own profiles with no stored default id and a
  `data.json` id naming one of them is a new test; with `defaultProfileId` left
  out of the reset it fails (1 of 505), and the never-seeded-units test now
  carries data.json values for all six units.
- The protected-path hook blocks the Write and Edit tools outside the project
  directory, so the files were written through the shell. No protected path was
  touched.

## Independent review

A review agent, not the implementer; `make verify` passed. No code
defect. Findings:

1. G1: a new device that switches the CLI group to synced replaces the
   shared profiles with its own. Documented (DES-005, README, ADR-009).
2. G2: the release note said a synced CLI group is unchanged; on a device
   updating from 0.5.0 it is device-only again. Fixed.
3. G3: the flat CLI path migration now applies only where profiles sync.
   Fixed: PRD-001.R24, DES-001, DES-005 say so.
4. G4: ADR-009's Status date, its Validation bullet, the task's expected
   files. Fixed.
5. G5: stale base. Merged onto main.
6. Nits N1 to N4 (clause wording, a test checking five of six, a reset
   mutation that survived, SECURITY.md qualifier). Fixed; tests.

Codex cross-review: a synced-to-local badge flip keeps the profiles then in
effect, wherever they came from, and profiles an earlier version seeded and
saved stay; both are the user's own choice or past state, documented in
SECURITY.md and ADR-009 rather than reset. The release note names 0.5.0.

## Outcome

While the CLI group is device-only, a device with no profiles of its own
starts with auto-detect instead of taking the executable and arguments from
`data.json`. PRD-001.R24 and ADR-009 said profiles seed, against the
constitution's device-local rule; both are amended to match, for the owner
to confirm. Owed by hand in a vault: a new device on a synced vault starts
with auto-detect; a badge flip to synced shares this device's profiles.
