---
status: closed
release: r06-panel-redesign
number: 038
prd: PRD-002.R1, PRD-002.R12
---

# TASK-038 — Permission card and question form

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 8: the permission card and the AskUserQuestion form as
components over `state/permission`, with the pending set, automatic decisions
and answers moved into `tab/permission-flow`. The card contract and the
answers are unchanged; what changes is the settled state and the form's
title and count.

Governing: [PRD-002](../../../current/product/PRD-002-permissions-and-change-control.md)
R1, R12 (R3's withdrawn requests, R6's 5 s wait, R9's Auto-approve, R17's
plan);
[DES-003](../../../current/design/DES-003-panel-ui.md) Permission card and
question form, Cards, Tool-step group (a card closes the open group);
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
Permission round trip, Card contract, AskUserQuestion form;
[ADR-002](../../../current/adr/ADR-002-permission-prompts-cli-decides-panel-asks.md);
constitution (Consent first).

Acceptance:

1. Card states: waiting (Allow; Always allow when the CLI sent suggestions;
   Deny; the waiting highlight); answering (Allow or Always allow pressed in
   Auto-approve while the call's pre-edit read is pending, at most 5 s:
   buttons disabled, highlight kept); settled (the outcome label in place of
   the buttons, no highlight), for answered, withdrawn and ended cards.
2. The card is `role="group"` named "Permission request"; title, description,
   96-character summary, "Full input" (2000 characters), the edit diff and
   the plan as DES-004 states.
3. Form: `role="group"` named by its title, "Claude has a question" or
   "Claude has questions"; per question a header chip, the text, radio or
   checkbox option cards with descriptions, "Select all that apply" for
   multi-select, an "Other…" field; "N of M answered" while waiting; Submit
   enabled once every question has an answer; Dismiss; the outcome label
   ("Answered: …", "Dismissed") once settled.
4. A card or form sits in the main turn and closes its open group (the
   groups arrive in 039); `tab/chat-tab` fires `card` on start and settle,
   which the announcer and the tab's activity read.
5. Decisions are unchanged: Allow returns the input unchanged, Deny returns
   "The user denied this action in Obsidian.", answers as PRD-002.R12 maps
   them; Auto-approve still shows a card for a call the CLI's rules or hooks
   flag; Bypass is unchanged.

## Scope

Expected files:

- New: `src/state/permission.ts`, `src/tab/permission-flow.ts`,
  `src/ui/permission-card.ts`, `src/ui/question-form.ts`,
  `tests/state-permission.test.mjs`.
- Changed: `src/tab/chat-tab.ts`, `src/ui/turn.ts` (mounts cards),
  `src/state/tab.ts` (card items), `src/view.ts`, `styles.css`,
  `package.json` (`pretest`), `tests/fake-cli.mjs` (scenario `question`:
  single- and multi-select questions).
- Docs: DES-004 (the settled card and form); `README.md` (permission and
  question bullets if their wording changes); `docs/current/DEVELOPMENT.md`;
  `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record.

Negative scope:

- The decision order, mode rules and flag rules (`settings-core`, ADR-002;
  unchanged); the diff engine (DES-004).
- The `safetyCheck` backlog item (ADR-002).
- No new dependency; no protected path; no real-CLI run.

## Plan

- Tests first: outcome labels replace the buttons for each settle reason
  (`PRD-002.R1`); answering only in Auto-approve with a pending read, back to
  settled after the read or 5 s (`PRD-002.R6`); singular and plural titles,
  "N of M answered", Submit enabled only with every question answered
  (`PRD-002.R12`).
- Moves out of `view.ts`: `handlePermissionRequest`, `fillPermissionPlan`,
  `fillPermissionDiff`, `handleQuestionRequest`, `handlePermissionCancelled`,
  `failPendingPermissions`, `PRE_EDIT_READ_MS`; the plan renders through
  `ui/markdown`, the diff through `diffview`.
- Verification: `make verify` (`settings-core`'s decision-order tests stay
  green); manual, by someone other than the implementer, at least at 300 and
  1040 px: `permission`, `permission-flagged` in Auto-approve, `cancel`,
  `crash`, `question`, M6 (native controls by keyboard). Codex cross-review
  before commit: the consent path moves.
- Risks: a card answered twice or never after the move (the flow owns the
  pending set; `cancel` and `crash` rows); the answering state stranding
  disabled buttons if the read never settles (the 5 s bound).
- Rejected: drawing the form as an ordinary card with JSON (PRD-002.R12
  requires the form); keeping settled cards' buttons disabled instead of
  replaced (R1: replaced by the outcome).

## Run log

- Replayed onto task 037's review fixes (379eac8, cherry-picked at the
  coordinator's request) before the first commit.
- Tests first: `state-permission` and `tab-permission-flow` failed on
  import against empty stubs (no `CANCELLED_MESSAGE`, `PRE_EDIT_READ_MS`);
  `state-turn` failed on import (no `addCard`); the protocol tests of the
  `question` scenario failed without it (no form shown, no exit);
  `tool-labels` gained the moved `jsonPreview`'s test. Found while
  implementing, test first: a duplicate request's pre-edit read stepped the
  waiting card (answered it early); a request id reused by a new process
  could take the old card's read. Cards are keyed by the flow since.
- No protected path touched. `tests/architecture.test.mjs` and
  `tests/styles.test.mjs` unchanged: P5 already holds each card module to one
  importer (`ui/turn`), A12 puts the Obsidian-free `tab/permission-flow` in
  `pretest`. Ask-first `package.json`: `pretest` gains `state/permission`
  and `tab/permission-flow`.
- Codex cross-review not called: Codex is unavailable (spend cap). The
  independent review covers the consent path's move.
- Old to new, each decision (`view.ts` at 379eac8):

  | Old | New |
  | --- | --- |
  | `handlePermissionRequest`: AskUserQuestion parse, `permissionDecision(tab.chat.status.selectedMode, req, {questionForm, isEdit})` | `PermissionFlow.request`, the same calls on the same status |
  | `form` → `handleQuestionRequest`; `allow` → `allowResult(input)` | `questionForm` card; `allowResult(input)` |
  | `readFor(toolName, toolUseId, input)`; gate `withDeadline(read, PRE_EDIT_READ_MS = 5000, null)` for `allow-after-read` and `card-after-read` | the same; `PRE_EDIT_READ_MS` moved to `tab/permission-flow` |
  | `allow-after-read` with a gate → `allowAfterRead(gate, input)`, no card; without one (no path to read) → a card answering at once | the same, both |
  | Card content: vault sentence, else `req.title`, else `Allow <tool>?`; icon; description; `summarizeToolInput`; `planOf` for ExitPlanMode; `safeJsonPreview(input, 2000)` | `permissionCard`; `jsonPreview` in `tool-labels`, shared with tool cards |
  | Allow, no gate → `allowResult(input)`, "Allowed" | `cardStep` `allow`, gate none or settled → settled, the same answer |
  | Allow with a gate → buttons disabled, `allowAfterRead(gate, input, perms)`, then settle | gate pending → answering (buttons disabled), `read-settled` → settled with `allowResult(input, perms)` |
  | Always allow only when `suggestions && suggestions.length > 0`; returns them as received | `card.suggestions`, the same test; `allowResult(input, suggestions)` |
  | Deny → "The user denied this action in Obsidian.", "Denied", never waiting | `deny` from waiting; ignored while answering, whose buttons were disabled before too |
  | `settle` guarded by `takePendingCard`: answered once | the flow drops the answer once given; a settled card ignores every event |
  | `handlePermissionCancelled` → "Cancelled", deny "Cancelled" | `flow.cancelled` → `cancelled` event |
  | `failPendingPermissions` → every card "Session ended", deny "The agent session ended before this was answered.", then `edits.clear()` | `flow.ended()`, the same |
  | 043: a restart cancels the old process's open prompts (`onPermissionCancelled`), its late requests denied in `session` | unchanged; reaches `flow.cancelled` |
  | `fillPermissionDiff`: "Reading the file…", the read, removed on none or nothing to diff, the outside-vault note, also after settling | `card.diff` from the flow, `ui/permission-card` with `renderDiff` (the view's `renderEditDiff`) |
  | `fillPermissionPlan`: placeholder, park at the end, render or plain text, reveal unless scrolled 120 px away | `ui/permission-card` with `ui/messages`' `revealAfter` |
  | `tab.messages.follow(true)` per card | `ui/messages` follows on `card` with `waiting` |
  | `handleQuestionRequest`: picks, Other clearing, Submit enabled, answers, label, Dismiss | `ui/question-form` over `pickOption`, `typeOther`, `canSubmit`, `formAnswers` |
  | `ChatTab` pending map (`addPendingCard`, `takePendingCard`, `takeAllPendingCards`) | the flow's pending set; `ChatTab.addCard` and `setCard` place cards in the model and count the unsettled ones for the activity |

- Departures and choices the accepted docs leave open, for review:
  - Footer order Deny, Always allow, Allow (canvas), so Deny is first in the
    Tab order; DES-003 and DES-004 say so.
  - A title or description that is not a string is not shown (the client
    casts them unchecked); DES-004's input table says so.
  - A pre-edit read that rejects removes the diff (it left "Reading the
    file…" and an unhandled rejection).
  - A request id that already waits for a card or form is denied, with no
    card, and the card or form waiting under it settles "Cancelled",
    answered as denied, so both answers under the id agree (the second
    replaced the first in the pending map, stranding it); PRD-002.R3,
    DES-004 step 3 and Failure handling say so (review fix, below).
  - Answering exists only while the read is pending: Allow after it settled
    answers at once (a microtask later before; the same answer).
  - Single-select options are native radios, so a second click no longer
    unpicks one; Other text still clears it (DES-003 Cards).
  - Focus moves to the card or form when its pressed button gives way to the
    outcome (DES-003 Cards). Settled, a form's questions are disabled and its
    count hidden.
  - A card that arrives while no turn runs (a background agent's request)
    is an item at the end, as 037's legacy item was; DES-003 says so.
  - Submit keeps its name (the canvas's "Submit answers" is evidence, not
    the PRD's wording).
  - Fake CLI `question`: shaped from the panel's parser, not captured; a
    message containing "exit" ends the process while the form waits, for the
    "Session ended" row.
  - No `docs/records/verification/` record: the rows are run by someone other
    than the implementer, who records them (030 to 037's practice).
- No Chromium self-check: 035's harness is not in this worktree; the rows
  below cover the drawing.
- API changes for later slices: `ChatTab` loses `PendingCard`,
  `addPendingCard`, `takePendingCard`, `takeAllPendingCards` and gains
  `addCard(key, card)`, `setCard(key, card)`; `pendingCount` counts unsettled
  cards. `state/tab` gains `CardBlock` and `CardItem`; `state/turn` gains
  `ItemRef` (`LegacyRef` is its alias), `addCard`, `patchCard`.
  `state/permission` and `tab/permission-flow` (`PermissionFlow`,
  `FlowTab`, `FlowEdits`, `PRE_EDIT_READ_MS`) are new. `ui/turn` exports
  `cardView`, `CardView`, `CardIntents`; `TurnIntents` gains `onAnswer`,
  `renderDiff`, `revealAfter` (the last implemented by `ui/messages`, so
  `MessagesIntents` omits it). `tool-labels` gains `jsonPreview` (the view's
  `safeJsonPreview` is gone). `PanelTab.flow`.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer, at 300 and 1040 px:
  1. `permission` in Ask: the card in the turn with the orange ring, the
     shield-alert tile, "Allow Edit?", the summary `note.md`, "Reading the
     file…" then the diff (or none when `note.md` is missing), Full input
     collapsed with the JSON; footer Deny, Always allow, Allow; the tab's dot
     and the head say "Waiting for you"; Allow → "Allowed" in place of the
     buttons, the ring gone, focus on the card; on new turns Always allow →
     "Always allowed", Deny → "Denied"; the card scrolled into view when it
     appears, also after scrolling up.
  2. `permission-flagged` in Auto-approve, `note.md` present: a card whose
     Allow answers (the read has settled by then; the answering state of a
     read still pending, and its 5 s bound, are covered by the tests only);
     `permission-unflagged` in Auto-approve: no card.
  3. `cancel`: the card settles "Cancelled" by itself; Stop or Esc during
     `permission`'s card does the same.
  4. `question` (a message containing "exit"): the form, then after 1 s
     "Session ended" in place of its buttons, its options disabled, then
     the exit's error block. `crash`: the error block, no card.
  5. `question`: "Claude has questions", "0 of 2 answered"; the Location chip
     and question, radio cards with descriptions; the Sections chip,
     checkbox cards, "Select all that apply"; picking a radio clears the
     Other text, typing Other clears the radio; the count and Submit follow;
     Submit → "Answered: … · …"; the next form "Claude has a question";
     Dismiss → "Dismissed"; the reply names the answers or "dismissed".
  6. M6: Tab reaches Deny, Always allow, Allow; in the form each radio group
     is one stop (arrows move and pick), each checkbox and Other field a stop;
     Enter or Space presses; a screen reader names the card "Permission
     request" with its title, the form by its title, each fieldset by its
     legend, each option by its label with its description, "Other
     answer"; "Claude is waiting for you" is announced once per card.
  7. ExitPlanMode in a real or captured run is not in a scenario: owed with
     037's real-CLI session (the plan rendered on the card, "Rendering the
     plan…" meanwhile, the card brought into view).
  8. M3 and M7: the rings and tiles in Obsidian light and dark, forced Light
     and Dark, and Windows high contrast (borders stay, rings go).
- Replayed by the coordinator onto `main` as 8fe96be (037 landed as
  9e8f437); the review fixes below are a second commit on it.
- Review fixes, tests first (each failed before its fix):
  - Gap 1 (T8): a duplicate request id is now refused before the decision
    order, in every mode, and the card or form waiting under the id is
    cancelled, so the two answers written under one id both deny and no
    card claims "Allowed"; a duplicate starts no pre-edit read. PRD-002.R3
    gains the rule (EARS), lead-authorized, for the owner to confirm;
    DES-004 step 3 and Failure handling follow.
  - Gap 2 (T7): `ClaudeSession`'s open prompts were one set for every
    process, and a late answer to a replaced process's prompt deleted its
    successor's prompt of the same id, so the next restart left that card
    live for a dead process. Each client now keeps its own set; the session
    test against the fake CLI reuses `cli_1` across two restarts. DES-002's
    replaced-client row says so.
  - Nit 1: an answer goes to the CLI before the card is redrawn, and a
    redraw that throws is logged, not raised, so `ended()` settles every
    card; a card is registered only once the tab holds it.
  - Nit 2: the pre-edit read always gets its handlers, also when no card
    opens.
  - Nit 3: content that cannot be built, a model that throws on `addCard`,
    and a component that cannot be built (`ui/turn`'s `mountCard`, the new
    intent `onCardFailed` → `PermissionFlow.failed`) each give the CLI an
    error reply, as the callback throwing did before, and leave nothing
    waiting under the id; the tab stops waiting on such a card.
  - API: `PermissionFlow.failed(card, error)`; `CardIntents` is an
    interface with `onCardFailed(card, error)`; `ui/turn` exports `mountCard`
    in place of `cardView`.
- Review round 2 (the coordinator's harness and a Codex review, both
  confirming the fixes above), tests first, each failing before its fix:
  - T12 (Codex P2): in Auto-approve an unflagged edit waiting for its
    pre-edit read has no card, so a flagged request under its id opened one,
    and the edit's later allow was a second answer under the id. The flow
    now tracks every unanswered request, the cardless ones waiting for a
    read included: a duplicate of one is denied, and the waiting one is
    answered as a denial instead of allowed.
  - The session's open prompts are now kept per client and per request,
    not deleted by id: one process sending two prompts under one id no
    longer loses the open one from a restart's cancel when the other is
    answered (fake CLI `FAKE_CLI_DUPLICATE_PROMPT`).
  - T11: `PermissionFlow.failed` takes the card the component was given; a
    settled card, or an earlier card under the id, changes nothing.
- Review round 3 (Codex: P2 resolved, no path with no or two replies), test
  first: `cancelled` and `ended` cleared only the cards' pending set, so an
  Auto-approve edit whose read still hung after its process exited or
  restarted kept its id, and the next process's first request under that id
  was denied as a duplicate. A withdrawal or the process ending now answers
  such an edit as denied and frees its id; the client writes that denial
  nowhere (a withdrawn request, a stopped or closed process), as the old
  code's later allow went nowhere; the read settling later answers nothing.
- Final series built on `main` (9e8f437): the session fix first, as its own
  commit (it fixes 043's restart cancel, a defect before this task), then
  the task.

## Independent review

- Adversarial review by the coordinator: a harness running the old flow
  and the new one side by side over 6000 random sequences. No defect: the
  move is faithful, and it fixes an old-code defect (T6: a second request
  under a waiting id stranded the first card). Findings, fixed above: Gap
  1 (T8, two replies disagreeing under one id), Gap 2 (T7, `session.ts`'s
  shared open-prompt set), Nits 1 to 3.
- Round 2: the harness again and a Codex review (obtained by the
  coordinator; the implementer's was blocked by the spend cap) confirmed
  those fixes and both found T12 (Codex P2), fixed in round 2 above with
  T11 and the session's per-request tracking.
- `make verify` after each round: OK.

## Outcome

- Owner items:
  - Confirm the PRD-002.R3 amendment (lead-authorized): a request whose id
    already waits for an answer is denied, and the one waiting answered as a
    denial, its card or form "Cancelled".
  - Confirm the departure kept by the lead: single-select options are native
    radios, so a second click no longer unpicks one (Other text still
    clears it).
  - Manual rows 1 to 8 of the Run log, by someone other than the
    implementer, recorded in `docs/records/verification/`; row 7 with
    037's real-CLI session.
