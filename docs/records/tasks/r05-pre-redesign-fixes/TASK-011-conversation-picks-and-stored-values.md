---
status: closed
release: r05-pre-redesign-fixes
number: 011
prd: PRD-003.R1, PRD-003.R4, PRD-003.R7, PRD-003.R9, PRD-001.R3
---

# TASK-011 — What a conversation stores and restores

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A conversation's stored session id, model, effort and profile id, and the
model and effort keys in `data.json`, reach `--resume`, `--model` and
`--effort` unchecked. A conversation does not store its CLI profile, stores a
Default pick as absent and lets `system/init` overwrite its model pick, so a
reopen takes the tab's last picks and the default profile. A profile pick on a
conversation with a session moves the tab off the session's profile. A pin on
a fresh tab is dropped.

Governing:
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R1, R4, R7, R9;
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R3;
[ADR-005](../../../current/adr/ADR-005-plugin-owned-conversation-history.md)
(optional fields, no version bump);
[ADR-009](../../../current/adr/ADR-009-synced-and-device-local-settings.md);
[DES-005](../../../current/design/DES-005-persistence-and-sync.md)
(Conversation file, Recording, Identity and validation, Pins, Reopen and
resume, Export, Load step 5);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(CLI profiles); constitution *No injectable command lines*, *Device-local
settings stay local*.

Acceptance:

1. `isSafeArgValue(value)` is true only for a string of 1 to 200 characters
   with no whitespace, control character or `CMD_UNSAFE` character that does
   not start with `-`.
2. Reading a history file (`readFile`, so `load` and the scan) through
   `migrateStoredModel`, then `dropUnsafeArgValues`: a `sessionId` that fails
   it is read as null; a `model` or `effort` other than `""`, or a
   `profileId`, that fails it is read as absent, and a `resolvedModel` as
   `""`.
3. Settings load: `model`, `lastModel`, `effort` and `lastEffort` from either
   store that are not `""` and fail it load as `""`; an absent `lastModel` or
   `lastEffort` stays absent.
4. A conversation stores `profileId`: set by `ensureConversation` (the tab's
   session profile, else its picked profile, else the default), by
   `system/init` reporting a session id (the session's profile), and by a
   profile pick that applies to a conversation without a stored session id;
   a branch starts on the source tab's session profile.
5. Reopen (`reopenPicks`): the model and effort picks are the stored ones,
   `""` (Default) when absent or invalid; the profile is the stored
   `profileId` when this device has it, else the default profile. Restore
   files on that profile's turns shows without a pick.
6. Model and effort picks are stored as `""` for Default (at creation, on a
   pick, on a refused model's rollback); a new conversation stores
   `resolvedModel: ""`. `system/init` writes `resolvedModel`, never a pick.
   The export's `model` is `resolvedModel`, else a non-empty pick; `model`,
   `effort` and `session` are JSON-quoted.
7. Profile pick (`profilePick`): no session, the pick applies; a session only
   a panel command started (no session id, not busy) is disposed and the pick
   applies; a live session (a session id or a turn running), or a stored
   session id on the tab or the conversation whose `profileId` names a
   profile on this device, keeps the tab's profile for its Profile control,
   restarts, `!` commands, model list and branches, and always shows "Profile
   applies when the next conversation starts." A stored session whose
   `profileId` names no profile here takes the pick until a session is live.
8. A pin on a fresh tab, from the hover pin or the row menu, creates the
   conversation with `ensureConversation`; the pin stays in memory and is
   written with the first message, which sets `createdAt` and `updatedAt`.
9. Older files load: no `profileId` reopens on the default profile; no
   `resolvedModel` (0.5.x) reads `model` as `resolvedModel` and a Default
   pick, so the export's `model` is unchanged.

Owner questions:

- Q1(a). "Profile applies when the next conversation starts." is
  PRD-001.R3's text but false: a new conversation starts on the default
  profile. Kept. Recommend rewording R3's Notice to "This conversation stays
  on <profile>; start a new conversation to use another." (backlog item).
- Q1(b). PRD-001.R3 amended under the owner's approval of all tasks,
  2026-10-11; to confirm: the keep case excludes a stored session whose
  profile this device lacks, which takes the pick until its CLI reports a
  session.
- Q2. A written conversation file chooses which of this device's CLI
  profiles, executable and arguments included, its reopen runs on; it can
  name only a profile the device has. Carried, not accepted: open decision
  D-06 (DES-005, SECURITY.md). Recommend accepting it.

## Scope

Expected files:

- `src/settings-core.ts` (`isSafeArgValue`, `dropUnsafeArgValues`,
  `migrateStoredModel`, `reopenPicks`, `profilePick`, `normalizeSettings`)
- `src/history.ts` (`StoredConversation.profileId`, `resolvedModel`;
  `readFile`)
- `src/view.ts` (`ensureConversation`, `createSession`,
  `record`, `restoreConversation`, `branchFrom`, `system/init`, `chooseModel`,
  `applyModel`, `applyEffort`, `openProfileMenu`, `createPinToggle`,
  `openConversationMenu`)
- `src/export.ts` (frontmatter `model`, `effort`, `session`)
- `tests/settings-core.test.mjs`
- `RELEASE_NOTES.md`, `README.md` (the Profile control line),
  `docs/current/product/PRD-001-chat-panel-and-sessions.md` (R3, Q1(b)),
  `docs/current/open-decisions.md` (D-06),
  `docs/current/plan.md` (five backlog items out, Q1(a) in), `docs/current/SECURITY.md`
  (stored values), `docs/current/DEVELOPMENT.md` (test table); DES-001,
  DES-002, DES-005 where they disagree with the code

Negative scope:

- Turn records' `sessionId` and `profileId`: Restore files compares them and
  passes neither to a command line.
- Validation of other settings keys (ADR-009 backlog item), the legacy
  `model` unit key, `ClaudeSession.setModel` storing before the CLI accepts
  (PRD-001.R22): backlog.
- `resolvedModel` after a mid-conversation model pick: unchanged until the
  next `system/init` (DES-005 as written).
- A pinned fresh tab across a reload before its first message: not restored
  (DES-005 Device-local keys).
- Rewording PRD-001.R3's Notice: Q1, backlog.
- A real-CLI run: only with the owner's approval.

## Plan

- Tests first in `tests/settings-core.test.mjs` for `isSafeArgValue`,
  `dropUnsafeArgValues`, the settings load, `reopenPicks` and `profilePick`.
- The pure decisions sit in `settings-core` beside `reopenMode` (DES-005 names
  `isSafeArgValue` there; E1 keeps it free of `history` imports); `history`
  and `view` only call them.
- `resolvedModel` is validated like the picks, `""` meaning none reported;
  its presence marks a file written after 0.5.x.
- `isSafeArgValue` lists `CMD_UNSAFE`'s characters itself (E1 keeps
  `protocol/client` out of `settings-core`); a test checks every character
  `CMD_UNSAFE` matches.
- Verification: `make verify`; independent review. By hand in a vault, owed:
  reopen on a stored profile and on a missing one, Default picks across a
  reopen, a tampered history file and `data.json`, the profile pick with a
  live, ended and panel-command-only session, a pin on a fresh tab from both
  entry points, an export of an old and a new file.
- Rejected: validating in `view` at each use (several call sites, none
  testable in plain Node).

## Run log

- Tests first: `settings-core.test.mjs` failed at import (the four new
  exports); after the change its 54 tests pass.
- Eight hand mutants of the new `settings-core` logic (no settings check, an
  absent last pick checked, busy without an id, no length cap, a Default pick
  dropped, the session id unchecked, no restart, the stored profile ignored)
  each fail at least one new test.
- The README said every conversation can pick its CLI; corrected.
- `make verify`: OK.
- Review round 1, tests first: against the round's code (the new export
  stubbed) six tests failed: the length and `CMD_UNSAFE` rules (the two new
  refused samples), the `""` resolved id kept (two), the 0.5.x migration and
  the stored session on a missing profile. The `--wsl` fixture guards a
  mutant and passed. Three hand mutants (no check in `reopenPicks`, keep
  regardless of `storedProfileKnown`, the 0.5.x pick kept) each fail a test.
- Review round 2, tests first: the unsafe-`resolvedModel` test failed before
  the fix. Recording `profileId` at `system/init` is in `view`, checked by
  hand. `make docs` passed on the PRD-001.R3 amendment.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Defect: a stored session whose profile this device lacks (absent, a 0.5.0
   file, a removed profile) refused every pick, so it could not resume on
   the right profile. Fixed: `profilePick` takes `storedProfileKnown`; with
   no live session such a conversation takes the pick, and its `profileId` is
   recorded when the session starts. Test added; DES-002 pick cases and
   DES-005's failure row updated.
2. Wrong text: "Profile applies when the next conversation starts." is
   false. Kept as PRD-001.R3 says; Q1 and a backlog item.
3. Gap: 0.5.x files held the resolved id in `model`, which reopened as a
   pick. Fixed: `migrateStoredModel` reads such a file (no `resolvedModel`)
   as `resolvedModel` = `model` and a Default pick; new conversations store
   `resolvedModel: ""` so the field marks the format. Tests added; DES-005
   migration rules.
4. Undocumented risk: a written history file chooses the profile a reopen
   runs on. Documented in DES-005 (risks; the "bounded by the validation"
   claim corrected) and SECURITY.md; Q2.
5. Test gap: removing `isSafeArgValue` from `reopenPicks` failed no test.
   Fixed: the fixture has a profile with id `--wsl`.
6. Export frontmatter `model`, `effort` and `session` were unquoted. Fixed:
   JSON-quoted like `title`; DES-005 export table and validation wording.
7. Gap: `isSafeArgValue` let cmd.exe metacharacters through. Fixed: it
   refuses `CMD_UNSAFE`'s characters; tests and DES-005 definition.
8. Stale text: DES-005 Device-local keys named only branch tabs. Fixed:
   pinned fresh tabs too.
9. Nit: a pinned fresh tab's `createdAt` was the pin time, which dates
   the export (PRD-003.R12). Fixed: the first recorded message sets
   `createdAt` and `updatedAt`. In `view`, so checked by hand.

Round 2: the same reviewer; `make verify` passed. Findings 1 to 9 verified.

1. An unsafe `resolvedModel` was deleted, which dropped the format marker
   and let the next read migrate a current file as 0.5.x. Fixed: it becomes
   `""`; test updated.
2. `createSession` recorded `profileId`, so a CLI only a panel command
   started on a fallback profile marked that profile known and blocked the
   pick finding 1 allowed. Fixed: `system/init` with a session id records
   the session's profile; DES-002 and DES-005 updated. In `view`, checked by
   hand.
3. PRD-001.R3's keep bullet contradicted the apply case. Fixed: amended in
   place (Q1(b)); the Notice text kept (Q1(a)). Q2 is an open owner decision,
   D-06, not an accepted risk: SECURITY.md and DES-005 reworded.
4. The record relabelled round-1 findings 3 and 9. Fixed: the reviewer's
   tags, Gap and Nit, restored.

## Outcome

Stored session ids, models, efforts, profile ids and resolved models, and
the model and effort picks in `data.json`, must pass `isSafeArgValue` before
reaching the command line; a conversation records its profile and its
Default picks, reopens on them (else the default profile), and keeps the
reported model apart from the pick, 0.5.x files migrating on read; a
profile pick follows PRD-001.R3 as amended; a pin on a fresh tab holds.
Owner decisions: Q1(a) the Notice wording, Q1(b) the R3 amendment, Q2 the
carried history-file risk (open decision D-06). Owed by hand in a vault:
the manual checks in the Plan.
