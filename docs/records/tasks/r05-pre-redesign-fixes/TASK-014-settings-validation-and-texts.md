---
status: closed
release: r05-pre-redesign-fixes
number: 014
prd: PRD-001.R24, PRD-001.R3, PRD-005.R1, PRD-005.R5
---

# TASK-014 — Settings validation and texts

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Three settings defects:

- `LEGACY_UNIT_KEYS` maps the legacy group key `model` to `model` and
  `effort`, so a device-only Model row takes Effort with it. DES-005: the
  key "equals the current unit key, so it is read as the `model` unit alone".
- `normalizeSettings` checks only the profiles, the default permission mode
  and the five security settings; every other key loads as stored. ADR-009:
  each key is checked against its default's type and allowed values and falls
  back to the default.
- Two settings rows and one comment describe behavior that no longer exists:
  the *Default CLI profile* row (account lookups, the model button), the
  *Show usage strip* row (click to refresh), `defaultProfile`'s comment.

Governing: PRD-001.R24, PRD-001.R3 (the Profile control is in the composer),
PRD-005.R1 (usage comes from whichever CLI is running), PRD-005.R5 (a click
opens the usage dialog),
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md),
[DES-005](../../../current/design/DES-005-persistence-and-sync.md) (Load,
Data and security).

Acceptance:

1. `sanitizeLocalGroups(["model"])` is `["model"]`; a device-only Model row
   keeps `model` and `lastModel` on the device and `effort` in `data.json`.
   The legacy `permissions`, `chat` and `usage` keys still expand.
2. On load, from either store, a key that has a default takes it when its
   value is not of the default's type: string, boolean, finite number (`NaN`
   and `Infinity` are wrong), array, plain object, never `null`.
3. A `defaultPermissionMode` outside its four options, a `tabPosition`
   outside `top`, `side`, `auto`, and a usage threshold outside 0 to 100 take
   the default.
4. Unchanged: profile repair, keys without a default (`lastModel`,
   `lastEffort`, `resolvedModels`, `cliModels`, `cliStartupModes`), values of
   the right type, prototype keys never copied.
5. *Default CLI profile* reads "Used for new conversations. A conversation
   can pick another profile before it starts, from the composer's Profile
   control." (PRD-001.R3). *Show usage strip* puts the strip "in the composer
   footer" (PRD-005.R4) and reads "Hover for details, click to open "Claude
   plan usage"." (PRD-005.R5). `defaultProfile`'s comment no longer names
   account lookups.
6. `sameKind` tells null, arrays, objects and non-finite numbers apart.

## Scope

Expected files:

- `src/settings-core.ts` (`LEGACY_UNIT_KEYS`, `normalizeSettings`,
  `sameKind`, `TAB_POSITIONS`, the `defaultProfile` comment),
  `src/settings.ts` (two descriptions, `TAB_POSITION_LABELS`)
- `tests/settings-core.test.mjs`
- `RELEASE_NOTES.md`, `docs/current/design/DES-005-persistence-and-sync.md`
  (Load step 5, the validated table, the test list),
  `docs/current/DEVELOPMENT.md` (test file summary),
  `docs/current/plan.md` (three backlog items removed)

Negative scope:

- Seeding CLI profiles from `data.json` (owner decision D11, backlog).
- `isSafeArgValue` and the validation of `model`, `effort`, their last picks
  and a conversation's stored ids (PRD-003.R4, backlog).
- Range checks on `usageRefreshSeconds` (the settings row and `usage-core`
  clamp it to 10 s), contents of `exportFolder` and the other string
  settings, and the learned caches' contents.
- ADR-009's "The changes" list, which still describes the settings before
  tasks 003 and 014: a backlog item (an accepted ADR is rewritten in its own
  change).
- A real-CLI run.

## Plan

- Tests first in `tests/settings-core.test.mjs`, then the code.
- One loop in `normalizeSettings` over `DEFAULT_SETTINGS` replaces the loop
  over the security units and the separate mode check; per-key limits sit in
  one table (`VALUE_LIMITS`). Optional keys have no default, so the loop
  skips them without a list.
- `TAB_POSITIONS` makes the allowed positions a value; `TabPosition` derives
  from it, and the settings tab's labels are a record keyed by `TabPosition`.
- `sameKind` is exported so its null and array-versus-object branches are
  pinned: with today's defaults the profile rebuild masks them in `load`.
- Verification: `make verify`. By hand in a vault, owed by the owner at the
  end-of-release test pass, so no verification record yet: the settings tab
  shows the two rows' new texts (*Default CLI profile* with several
  profiles, *Show usage strip*), and the tab position dropdown still lists
  Top, Side and Automatic.
- Rejected: skipping `cliProfiles` in the loop (the array check is then
  dead code, and the profile rebuild already replaces the default's array);
  a range for `usageRefreshSeconds` (a second clamp beside the two that exist).

## Run log

- Tests first: three failed before the fix (the wrong-type table, the tab
  position and percent limits, the Model row); the wrong-typed profile list
  and right-type tests passed already and guard the new loop.
- Review round 1, mutants run against the tests: dropping `lastModel` from
  the `model` unit, restoring the legacy `model` entry, dropping the `null`
  check, the array comparison or `Number.isFinite` in `sameKind` each fail
  at least one test.
- ADR-009's "The changes" block is stale since tasks 003 and 014; not edited
  here, a plan.md backlog item instead.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed. No
defects. Findings:

1. Test gap: the Model-row test did not pin `lastModel` or an `effort` kept
   in `data.json`. Fixed: it seeds both and checks where each lands; dropping
   `lastModel` from the unit now fails it.
2. DES-005 wording: Load step 5 and the validated table named the last picks
   as unvalidated keys. Fixed: "(the learned caches)" and "Keys without a
   default other than the last picks".
3. ADR-009's "The changes" block is stale since tasks 003 and 014. Not
   edited here; plan.md backlog item added.
4. Duplication: the tab position choices were listed in the dropdown and in
   `TAB_POSITIONS`. Fixed: `TAB_POSITION_LABELS`, a record keyed by
   `TabPosition`, passed to `addOptions`.
5. Test gap: nothing pinned the `null` check or the array-versus-object
   comparison in `normalizeSettings`. Fixed: `sameKind` exported and tested
   directly; each branch's removal fails the test.
6. Missing evidence: the settings-tab read of the two rows was not listed as
   a manual check. Fixed: Plan, owed by the owner.
7. Texts: the two descriptions did not use the requirement's wording. Fixed:
   *Default CLI profile* says a conversation picks before it starts;
   *Show usage strip* says "in the composer footer" and "Claude plan usage";
   acceptance 5 and the release notes match.
8. Nit: three unrelated defects in one commit. No change: the owner asked for
   the backlog to land as grouped tasks.

## Outcome

Every setting with a default now loads only as its default's kind, with the
offered values or ranges where the setting limits them; a device-only Model
row no longer takes Effort with it; three stale descriptions match the UI.
ADR-009's "The changes" block is a backlog item. Owed by hand in a vault: the
two settings rows and the tab-position dropdown.
