---
status: closed
release: r07-mock-fidelity
number: 093
prd: PRD-003.R4, PRD-003.R1, PRD-002.R15
---

# TASK-093 — Session ids this device recorded

## Spec

Governing: [ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md)
Decision 1 (session-id grammar, device provenance, grandfathering, pruning) and
Decision 2 (history `version: 2`);
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md) R4;
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md) Branch,
[DES-005](../../../current/design/DES-005-persistence-and-sync.md).

Acceptance:

1. A stored session id (the conversation's, a turn's, a boundary's, a pending
   branch's) that is not a lowercase UUID is never used, is kept as stored, and
   reads differently from an absent one. `--resume` is built only from a UUID.
2. This device records the sessions it ran, per conversation and CLI profile,
   in the device key `ai-agent-panel:session-provenance`; a failed write is
   logged and the ids stay usable in memory.
3. Once per device, conversations present when the history folder is first
   scanned are trusted (marker `history/.session-provenance-migrated`, key
   unset); a failed listing retries. Resume, Branch and Undo wait for the first
   scan.
4. A conversation whose stored session is not recorded opens with all its
   messages. Its next message starts a fresh session, writes
   `{kind: "fresh-start", at, sessionId?}` and shows the notice "This
   conversation's Claude Code session is not available on this device, so this
   message starts a fresh one (the messages above are kept)." The file is
   `version: 2` while a fresh-start or clear record exists, else 1.
5. Branch on such a source is disabled, titled "This turn's Claude Code session
   is not available on this device"; Restore files is hidden.
6. Delete removes the conversation's provenance entry; a missing conversation's
   entry is dropped after 30 days.

## Scope

Expected files: `src/state/session-provenance.ts`, `src/state/boundary-records.ts`
(new), `src/state/session-id.ts`, `src/settings-core.ts`, `src/history.ts`,
`src/history-file.ts`, `src/main.ts`, `src/protocol/client.ts`,
`src/tab/session-link.ts`, `src/tab/restore-branch.ts`, `src/ui/turn.ts`,
`src/view.ts`, `src/transcript-markdown.ts`, `package.json` (pretest);
`tests/state-session-provenance.test.mjs`, `tests/state-boundary-records.test.mjs`
(new) and the tests of the modules above; `tests/fake-cli.mjs` (UUID ids);
DES-001, DES-002, DES-004, DES-005, `docs/current/SECURITY.md`,
`RELEASE_NOTES.md`.

Negative scope: the /clear operation and its record, segments, dimming, Undo,
Stop and clear, the cost fork base, compaction; protected paths.

## Plan

State modules stay Obsidian-free and are tested in plain Node. The history scan
reports listing success apart from file names so a failed listing neither
prunes nor migrates. `SessionLink.vetResume` is the one place a stored id is
refused. `ClaudeClient` is the last guard. The Branch button's state is
pushed from `RestoreBranch` through a retitle callback so `ui/` keeps its
tooltip call sites.

Rejected: a provenance field inside the history file (it travels with the
folder, which is what the check guards against).

Verification: `make verify`.

## Run log

- The fake CLI's session ids (`fake-session-1`, `fake-source`) were not UUIDs;
  they became UUIDs in `fake-cli.mjs` and the tests.
- `tests/tooltips.test.mjs` counts tooltip call sites per file; the Branch
  retitle goes through the existing `ui/turn.ts` helper, not a new site.

- The segments task (/clear) applies `isSessionId` at use of a clear record's `sessionId`: 093 stores it as written.

## Independent review

Reviewer: independent review agent. Four rounds: rework, then approve after doc fixes three times. Codex cross-review ran three rounds (7, 5 and 2 findings), all fixed. ADR-018 Decision 1 was amended for the `migrated` field and the three-way decision (trusted, pending, foreign) on the owner's standing approval. Harness hunt-093r: 60 PASS.

## Outcome

Accepted.
