---
status: closed
release: r07-mock-fidelity
number: 096
prd: PRD-002.R15
---

# TASK-096 — Replays of local commands are not prompts

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The CLI replays a local command's output as a `user` message holding
`<local-command-stdout>…</local-command-stdout>`, with a uuid and
`isReplay: true` and no `isSynthetic`: after a manual `/compact`, and in front
of the `control_response` of every `set_model` that changes the model, idle or
mid-turn (task 095 record, W1 and W3). The CLI does not count it as a user
prompt for `last_seen_user_message_uuid` and it is no file checkpoint. The
panel took it for a prompt echo:

- Mid-turn change: its uuid became the turn's `lastPromptUuid`, so every later
  Branch to an earlier turn was refused `unseen_later_turn`.
- Idle change: its uuid became the next turn's `rewindUuid`, so Restore files
  failed for an edited turn.
- Idle change: `ClaudeSession` re-armed busy on the `user` message and no
  `result` followed, so the session stayed busy (found while adding the fake's
  replay; not in the 095 record).
- A `/compact` turn's `rewindUuid` was the stdout uuid. The CLI accepts it as a
  rewind target (W1), but it is not a prompt and holds no checkpoint; the
  turn edits no file. Decision: the turn has no rewind target, so no Branch
  control. Keeping it would need a manual-turn exception in the tab and would
  still misfire for an idle model change before a `/compact`.

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R15 (Branch), R14 (Restore files);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
stream rules; [DES-003](../../../current/design/DES-003-panel-ui.md) Stream to
messages.

Acceptance:

1. A `user` message whose text starts `<local-command-stdout>` yields no
   `uuid` change and does not mark the turn as started.
2. A Branch after a mid-turn model change names the real prompt as last seen.
3. An idle model change leaves the session idle; the message still reaches
   the view.
4. The fake CLI replays the change before the `set_model` reply only when the
   model changes, and gives `/compact`'s stdout a uuid and `isReplay: true`.

## Scope

- Changed: `src/protocol/types.ts` (`isLocalCommandOutput`),
  `src/state/stream.ts`, `src/session.ts`, `tests/fake-cli.mjs`,
  `tests/state-stream.test.mjs`, `tests/session.test.mjs`,
  `tests/protocol.test.mjs`, DES-002, DES-003, `RELEASE_NOTES.md`.
- Negative scope: Branch availability before a compaction boundary (separate
  task); typed `/model` handling; `<local-command-stderr>` (not observed);
  protected paths.

## Plan

Tests first (state-stream, session), then the predicate in the protocol
module (the architecture test lets `session` import only protocol), used by
both consumers. The fake gains the replay so the session test reaches it.
Rejected: a predicate in `state/stream.ts` (breaks the session's import rule);
keeping the `/compact` stdout uuid as that turn's rewind target.

## Run log

- The new session test failed first for the right reason, and the fake's
  replay broke an existing session test ("a model the CLI accepts…") by
  leaving the session busy: the third defect above.
- A text that starts with the tag but is typed by the user would also be
  ignored; accepted, the CLI itself uses the tag for command output.

## Independent review

Independent review agent: approve, no rework. Confirmed against the code and
the real-CLI record (W1, W3): the replay is ignored as a prompt echo and as
turn activity only; nothing else read it, and it was never shown or stored;
`send` sets busy itself, so no real turn activity is missed; the busy re-arm
on any `user` message is in 0.5.0, so the Fixed entry is right; dropping the
`/compact`-only turn's rewind uuid changes nothing visible, since that turn
has no footer. `make verify` exit 0.

## Outcome

Done.
