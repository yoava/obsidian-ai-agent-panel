---
status: closed
release: r08-settings-redesign
number: 127
prd: PRD-001.R24, PRD-001.R33
---

# TASK-127 — Store Card as `card`, without development-build migrations

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `refactor`: no released version stored a prompt style or color.
Governing: [change 018](../../changes/CHG-018-no-dev-build-prompt-migrations.md)
(owner decisions 8 and 10);
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R24,
R33; [DES-005](../../../current/design/DES-005-persistence-and-sync.md) Load.

Acceptance:

1. `PROMPT_STYLES` is `card`, `bubble`; the default `promptStyle` is `card`;
   every reader of the value uses `card` where it used `popout`.
2. A stored `popout`, `quiet` or any other unknown value loads as `card`; the
   stored prompt color is kept as stored (validated as today).
3. No `promptColor` seeding into the local units: with `promptStyle`
   device-only and no prompt color stored, `promptColor` stays synced.
4. The settings search still finds Clear by "outline", "quiet" and "none"
   (PRD-001 search clause, unchanged).

## Scope

Expected files: `src/settings-core.ts`, any `src/` file that compares the
stored value; tests `settings-core` and any test naming `popout` as the
stored style (not the pop-out window tests); docs PRD-001 (R24, per change
018), DES-005, DES-001, `docs/current/DEVELOPMENT.md` (test table),
`RELEASE_NOTES.md` only if it names a stored value.

Negative scope:

- No change to the Clear search aliases, the 0.5.0 upgrade, other migrations
  or what any style looks like.
- No setting added or dropped; no protected-path edit.

## Plan

- Tests first, confirmed failing: the four acceptance items.
- Then the code and docs; `make verify`.
- Rejected: a `popout` to `card` load migration (owner, decision 8).

## Run log

- Tests first: 5 failing, 1838 passing (`npm test`, before the code change).
- DES-003 also named `popout` and the Quiet migration (the Card line and the
  R33 test row); rewritten with the rest.
- Codex: a stored Quiet with Custom must keep `custom` as the selection, not
  only its value; the test now asserts style, selection and value together.

## Independent review

Codex (static, read-only): no remaining reader or writer of `popout` or
`quiet` as a stored style (the reset and Modified logic read
`DEFAULT_SETTINGS`; the panel reads `promptLayout`); no doc left
contradicting the code; one test gap, fixed. Size S: no further reviewer.
Verified by the orchestrator (`make verify`).

## Outcome

Done. The owner's two vaults that stored `popout` are reset to the default
prompt style by hand at deploy.
