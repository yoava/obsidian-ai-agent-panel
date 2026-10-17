---
status: closed
release: r10-image-viewer-and-quick-wins
number: 136
prd: PRD-001.R30
---

# TASK-136 — The prompt box grows with its text

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `feat`, the owner's AAP-3: the textarea was two lines tall with no
resize grip, so a long prompt was read through a two-line slot. It now grows
with its text up to its 16em cap, then scrolls, and shrinks back as text is
removed or sent. The short-height form stays one line (PRD-001.R30). No drag
handle. DES-003 Composer owns the rule; no requirement changes.

Acceptance: at 460 x 900 the box is two lines empty, grows a line per line of
text to 16em, scrolls beyond, and is two lines again once emptied; at 600 px
tall it is one line whatever the text; a view at its end stays at its end
while the box grows; a view scrolled up does not move.

## Scope

Expected files: `styles.css`, `src/ui/shell.ts`, `src/ui/messages.ts`,
`src/view.ts`, `tests/styles-composer.test.mjs`, DES-003, `RELEASE_NOTES.md`.

Negative scope: no resize handle, no change to the short-height form, the
chips or the send path; no requirement change.

## Plan

CSS `field-sizing: content` on the textarea between its `min-block-size: 2lh`
and `max-block-size: 16em`; `rows="2"` stays as the fallback below Chromium
123 (ADR-017's floor is 120). A script that sets the height from
`scrollHeight` on each input was rejected: a forced layout per keystroke
(PRD-001.R29) and a collapse to `auto` that can clamp the messages' scroll.

The harness showed a growing box hid the conversation's end (the scroller
shrinks, no scroll event fires). The shell's one `ResizeObserver` now also
watches the messages host and fires `messages-resize` from its callback,
before the paint; the view calls the active tab's `Messages.keepEnd()`, which
puts a view that follows its end back at it.

## Run log

- Panel harness (`probe-136.mjs`, Chromium 155, Obsidian 1.14.4 `app.css`),
  460 x 900: 0, 1, 2 lines 40.5 px; 3 lines 60.8; 5 lines 101.3; 8 lines
  162; 12, 20, 30 lines 216 (16em at 13.5 px) with `scrollHeight` 243 to
  608; back to 3 lines 60.8 and empty 40.5; a long wrapped line 121.5.
  Before the change every case was 40.5. At 460 x 600: 20.3 px (one line) in
  every case.
- `probe-136b.mjs`, a 40-paragraph reply at its end: before `keepEnd`, the
  end fell 20, 80 and 161 px out of view at 3, 6 and 10 lines; after, 0 in
  each and 0 once emptied. Scrolled up to 300 px, the view stayed at 300.
- `make verify` OK.

## Independent review

Size S: the orchestrator measured it in the harness; real Obsidian is the
owner's manual check. The owner decides whether Chromium 120 to 122 keeping
two lines is acceptable (live note, decision 4).

## Outcome

Done.
