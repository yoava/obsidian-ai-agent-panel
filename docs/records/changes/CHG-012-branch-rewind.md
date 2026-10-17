# CHG-012 — Branch rewind

**Status:** incorporated (2026-10-13)

## Intent

Claude Code 2.1.296 refuses a fork's `rewind_conversation` to any target that
later prompts follow unless the request names the source's latest prompt as
`last_seen_user_message_uuid` (`stale_target` without it, `unseen_later_turn`
with another; real-CLI record
`docs/records/verification/2026-10-13-real-cli-clear-undo.md`, V10 and other
finding 1). The panel sent no such field and, as PRD-002.R15 required, sent
the branch's first message on the full fork without notice: Branch on any
turn but the latest kept every later turn in Claude's context. Task 088 names
the latest prompt and makes a refused or failed rewind visible and
recoverable.

Affected: [PRD-002](../../current/product/PRD-002-permissions-and-change-control.md).

## ADDED requirements

None.

## MODIFIED requirements

### PRD-002

- **PRD-002.R15** — Branch.
  - Before: IF the rewind fails, THEN the AI Agent Panel shall send the
    branch's first message on the full forked history without notice.
  - After: The AI Agent Panel shall name in the rewind, as the last user
    message seen, the latest one the original conversation recorded in its
    CLI session (or recorded without a session, in older files), read when
    the rewind is sent, or none when it recorded none.
  - After: IF Claude Code refuses the rewind, the rewind fails, or the forked
    CLI ends before it answers, THEN the AI Agent Panel shall send nothing,
    end the forked CLI, show only `Could not branch from that turn: <why>
    Nothing was sent; your message is back in the message box.`, mark the
    unsent messages "Not sent", also when reopened, put their text and images
    back in the composer, and fork and rewind again on the
    branch's next send, also after the branch is closed and reopened. <why>
    is "the original conversation has messages this panel did not see. Send
    a message there, then branch again." for a stale target or an unseen
    later turn, "Claude Code no longer has it." for a target not found,
    "Claude Code exited before cutting the conversation." for a CLI that
    ended, and Claude Code's own error otherwise.
  - Reason: the old clause made a refusal, now the common case, silently keep
    the history the user branched away from. A conversation whose latest
    prompt is unknown sends none or a stale one; Claude Code then refuses any
    target but its latest, which the failure clause shows, so Branch stays
    offered there. Files written before sessions were recorded (0.5.0 and
    older) name their last recorded uuid, since a wrong one is refused,
    never a full fork.

## REMOVED requirements

None.

## Design and migration impact

- DES-002: `rewind_conversation` payload and failure; `send` with a pending
  rewind; the rewind armed until the fork's `system/init`; a failed fork
  stopped through the restart's wait; `clearResume` drops the rewind.
- DES-004: Turn record (`lastPromptUuid`), Branch steps 3 to 8, Failure
  handling, CLI surface, Verification.
- DES-005: stored `meta` fields.
- ADR-006 edit (applied by the coordinator at landing; text in task 088,
  "ADR-006 edit"): "If the rewind fails, the branch keeps the full history"
  becomes the failure behaviour above.
- Stored data: optional `meta` fields `lastPromptUuid` (a turn's last echoed
  prompt, also on the record of a turn that ends without a `result`, with its
  `sessionId`) and `branchSession`, `branchTarget`, `branchLatest` (a branch
  failure's fork, each checked as a lowercase UUID, `isSessionId`, ADR-018 Decision 1, when read). Older readers
  drop nothing and ignore them; no version bump.
- Rollback restores the silent full fork; files written meanwhile keep the
  extra fields, which the old reader ignores.

## Incorporation

Folded into PRD-002 and moved to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-012-branch-rewind.md`, in task 088's commit.
