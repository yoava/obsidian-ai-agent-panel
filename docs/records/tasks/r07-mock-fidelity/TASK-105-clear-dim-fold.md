---
status: closed
release: r07-mock-fidelity
number: 105
prd: PRD-001.R38, PRD-003.R9
---

# TASK-105 — Dimmed and folded segments

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

The messages before a clear stay on screen, dimmed; an earlier segment of more
than four messages folds behind an "N earlier messages" button. Live and on
reopen the same.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R38 (dim, screen-reader text, fold, rail tick on a folded prompt);
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R9 (dimmed and folded on reopen);
[ADR-018](../../../current/adr/ADR-018-conversation-segments-for-clear.md) Design
(`state/segments`); [DES-003](../../../current/design/DES-003-panel-ui.md)
Messages, Reopen, Keyboard and accessibility.

Acceptance:

1. When a clear completes, every section above its `/clear` message and divider
   is dimmed (opacity .42, .75 on hover or focus within) and named "Before the
   clear. Claude no longer sees these messages." (`role="group"`). The `/clear`
   message, the divider and what follows are not dimmed; an earlier divider
   stays at full strength.
2. A segment (the sections between two clears, or from the start to the first)
   of more than four messages (prompts of any kind, commands, `!` runs and
   replies, not continuations) folds everything before its last prompt of any
   kind behind one pill "N earlier messages"; that prompt and all after it
   (reply, continuations, footer) stay visible. The pill unfolds
   its fold for good, by fold key, and moves focus to the first revealed
   control when it had focus; a segment of four or fewer, and the current
   segment, never fold.
3. A rail tick of a folded prompt sits at the pill; clicking it unfolds the
   fold and scrolls to the prompt (`scrollToPrompt`). A folded prompt is not
   watched by the pin.
4. A reopened conversation draws the same; folded sections are drawn by the
   idle chunks, not by the first-screen loop.
5. A clear's divider joins the section of the `/clear` message before it; one
   stored without that message opens its own section.

## Scope

Expected files: `src/state/segments.ts` (new, in `pretest`),
`src/state/clear-divider.ts` (`isClearEcho`), `src/state/tab.ts`
(`opensSection`, `sectionsOf`), `src/ui/messages.ts`, `styles.css`,
`tests/state-segments.test.mjs`, `tests/state-tab.test.mjs`, `package.json`
(`pretest`), DES-001 file map, DES-003, `RELEASE_NOTES.md`.

Negative scope: Undo, Branch logic, Restore (task 102 hides it before a clear),
`state/prompts` and `ui/jump-rail` (the rail already asks `Messages.railAnchor`,
which now answers the pill for a folded prompt), the clear transaction.

## Plan

`state/segments.planSegments(items)` works on the sections `sectionsOf` gives
and returns the dimmed item ids and the folds (key, count, ids); `ui/messages`
applies the plan per drawn section (class, group role, `is-folded`, the pill,
the pin watch) on reset, when a clear is added and when an item is removed.
Folded sections are still drawn, hidden, so unfolding costs nothing; the
first-screen loop stops at them.

Rejected: a wrapper element per segment (re-parenting live prompt, pin and turn
views on every clear); dimming per item (no single named group for screen
readers).

## Run log

- Verification: `make verify`; board check in the r07 harness (fixture
  `ClearFold105`, driver `r105/run.mjs`) and a live clear after three exchanges.
- Folded ticks share one point, the pill (a folded prompt has no height), so
  only the topmost can be pressed; any of them unfolds the whole fold.
- Review rework: unfold by key (a replan makes new `Fold` objects), pill label
  refreshed, focus moved on unfold, and a section's last item is the previous
  drawn one after a removal. Round 2: one fold before the last prompt of any
  kind (no trailing fold, one pill), and the temporary `tabindex` that focus
  sets on a section is removed on blur.

## Independent review

Independent review agent, three rounds: approve. Rounds 1 and 2 found the
unfold lost after a replan, a stale pill label, focus left on the pill, and a
trailing fold that hid the continuation of the kept reply; all fixed. Round 3
checked the single fold at 340, 440 and 600 px, dark and light (fixtures
`ClearFold105` and `ReviewTrail105`), rail ticks, focus and `make verify`
exit 0. Accepted: when the last prompt is a command or `!` run sent during a
turn, the rest of that turn's reply stays visible while its start folds
(PRD-001.R38 read literally, pinned by a test).

## Outcome

Done.
