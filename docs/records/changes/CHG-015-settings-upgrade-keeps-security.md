# CHG-015 — An upgrade from 0.5.0 keeps the device's security settings

**Status:** incorporated (2026-10-14)

Approved by the owner on 2026-10-14 ("approve change 015"); the PRD edit lands
with task 116.

## Intent

0.5.0 kept the CLI profiles and the five security settings in the synced
plugin data and wrote a device-local object without a list of local units.
Loading that device under the never-seeded rule turned Bash and vault tools
back on, reset the permission default and dropped the vault instructions. A
device whose local object shows it ran 0.5.0 or earlier now takes four of them once,
without ever loosening: a synced file cannot forge that shape, so a fresh
device still starts at the defaults.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[ADR-009](../../current/adr/ADR-009-synced-and-device-local-settings.md) (its
never-seeded Decision bullet and the "return to defaults" Consequence need
a rewrite for the upgrade rule).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R24** — Settings storage and sync.
  - Before: The AI Agent Panel shall start the settings the previous clause
    excepts at their defaults on a device that has no value of its own for
    them, the CLI profiles at one profile that finds the CLI itself.
  - After: The AI Agent Panel shall start the settings the previous clause
    excepts at their defaults on a device that has no value of its own for
    them, the CLI profiles at one profile that finds the CLI itself.
    WHEN a device updates from 0.5.0 or earlier, which kept the default
    permission mode, the vault instructions and the shell-escape and
    vault-tools toggles in the synced plugin data, the AI Agent Panel shall
    take those four from the synced plugin data once, keeping the default
    permission mode only if it is "Plan" or "Claude Code default", and
    treating a missing value as shell escape off, vault tools off, no
    instructions and "Claude Code default". WHEN a device updates from 0.5.0
    or earlier, the AI Agent Panel shall leave bypass mode off unless this
    device's own value says on, and take no CLI profiles from the synced
    plugin data.

## REMOVED requirements

None.

## Design and migration impact

- DES-005 Load step 3 and Consequences; SECURITY.md local-data clause.
- First device to update keeps Bash and vault tools off, Plan and the
  instructions; one that updates after another has gets Bash and vault tools
  off and re-sets Plan and instructions (the shared file no longer holds them).
- Stored data: the first save after the upgrade writes the list of local
  units, so the seed never repeats.
- Rollback: revert the commit; devices fall back to the defaults.

## Incorporation

PRD-001 and ADR-009 edited on owner approval; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-015-settings-upgrade-keeps-security.md`.
