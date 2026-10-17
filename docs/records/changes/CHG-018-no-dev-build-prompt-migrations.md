# CHG-018 — No migrations for prompt settings only development builds saved

**Status:** incorporated (2026-10-16)

Approved by the owner on 2026-10-16 in the session's decision note: decision
8 ("just rename to card. no migration needed (it was never released with
popout, I'm the only test user, just change my local settings to default.
i.e., same as b but no migration code needed)") and decision 10 ("it was
never released so it doesn't matter. I'm the only test user. just change my
settings to the default."). Lands with task 127.

## Intent

0.5.0 has no prompt style and no prompt color, so only development builds
stored `popout`, `quiet` or a device-only prompt style. Card is stored as
`card`; a stored `popout` or `quiet` is an unknown value and loads as the
default, Card, keeping the stored prompt color; "Prompt color" starts synced,
as every new setting outside the security ones does.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md),
[DES-005](../../current/design/DES-005-persistence-and-sync.md) (Load steps
2, 4 and 5, the stored-value line, the migrations table),
[DES-001](../../current/design/DES-001-system-overview.md) (the defaults
line).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-001

- **PRD-001.R24** — Settings storage and sync.
  - Before: WHEN settings saved by an earlier version load (a single CLI
    path, on a device whose CLI profiles sync; a usage interval in minutes;
    the pre-rename device-local key; or the prompt style "Quiet"), the AI
    Agent Panel shall migrate them without user action, "Quiet" to "Card"
    with the prompt color "Clear" whatever prompt color is stored.
  - After: WHEN settings saved by an earlier version load (a single CLI
    path, on a device whose CLI profiles sync; a usage interval in minutes;
    or the pre-rename device-local key), the AI Agent Panel shall migrate
    them without user action.

## REMOVED requirements

### PRD-001

- **PRD-001.R24**, the clause "WHERE a device stores "Prompt style" on this
  device only and no store holds a prompt color yet, the AI Agent Panel shall
  store "Prompt color" on this device only too.": only a development build
  could store a prompt style on this device.

## Design and migration impact

- DES-005: no `quiet` migration and no `promptColor` seeding; `promptStyle`
  is `card` or `bubble`.
- Stored data: a development build's `popout` or `quiet` loads as Card and is
  written as `card` at the next save; the owner's three vaults are reset to
  the default prompt style by hand.
- Rollback: revert the commit; a stored `card` then loads as the default,
  Card, under the old code.

## Incorporation

PRD-001, DES-005 and DES-001 edited on owner approval; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-018-no-dev-build-prompt-migrations.md`.
