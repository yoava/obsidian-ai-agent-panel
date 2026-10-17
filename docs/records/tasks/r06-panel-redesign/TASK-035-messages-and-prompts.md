---
status: closed
release: r06-panel-redesign
number: 035
prd: PRD-001.R17, PRD-001.R33, PRD-001.R35, PRD-003.R1, PRD-001.R25
---

# TASK-035 — Messages and prompts

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

DES-003 slice 5: each tab's messages become a model in `state/tab` drawn by
`ui/messages`, with prompts, the pinned prompt, the jump rail, the empty state
and the chunked reopen. Turns, cards, tool calls, reports and shell runs stay
today's DOM as the opaque `legacy` item kind until their slices. The one
Markdown, copy and link paths move here, so the rendering boundary changes
hands. PRD-001.R25 lands with the prompt rows.

Governing: [PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md)
R17, R25, R33, R35 (R28's "You" and prompt-tint clauses, R29's reopen);
[PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R1; [DES-003](../../../current/design/DES-003-panel-ui.md) Messages (Reopen,
Markdown and links, Prompts), Empty conversation, Settings that reach the
panel; [DES-001](../../../current/design/DES-001-system-overview.md) Rendering
boundary; [ADR-010](../../../current/adr/ADR-010-render-model-output-with-markdownrenderer.md);
[ADR-016](../../../current/adr/ADR-016-panel-ui-architecture.md) Reopen.

Acceptance:

1. The messages model is a tagged union built by `state/tab`, live and from
   stored messages (no timing, counts or recording); `tab/chat-tab` fires
   `items` and `item:<id>`; `ui/messages` keeps chronological DOM order and
   bottom-aligns a short conversation with a spacer.
2. Prompts: numbered across the conversation; panel commands and `!` runs
   compact, monospace and unnumbered. Pop-out (default): full width, number
   badge, "You", the send time as HH:MM when recorded, the context label;
   Bubble: right-aligned, at most 86% wide (94% below 360 px), "You"
   visually hidden. "queued mid-turn" on a prompt sent while a turn runs; a
   copy button on hover and focus.
3. The send time is recorded with each prompt; a file without send times
   reopens without them, and an earlier release ignores the field.
4. Pinned prompt (setting on): the current numbered prompt sticks to the top
   cut to one line, `is-stuck` from one `IntersectionObserver` per messages
   element; a click scrolls to its section's start.
5. Jump rail (Pop-out, setting on): a tick per numbered prompt at its
   position, or its index fraction before it is drawn; re-read on content or
   main-column resize, written only on a move of 1 px or more; each tick a
   button labelled "N · <first line>" with a 400 ms tooltip, scrolling to
   its prompt.
6. Empty conversation: PRD-001.R35's heading and line, and the starters for
   the active note and selection, re-evaluated on `active-leaf-change` and
   `selectionchange` once per frame; a starter fills the composer without
   sending.
7. Settings: "Prompt style", "Pin the current prompt while scrolling" and
   "Prompt jump rail" (shown with Pop-out) under a "Messages" heading, with
   R25's defaults; a change reaches open panels at once.
8. Links (PRD-001.R17): delegated `click` and `auxclick` per messages
   element; vault links resolve as written, open in a new tab on middle or
   modifier click, unresolved ones show the Notice and create nothing; only
   `http`, `https`, `mailto` and `obsidian` reach `window.open`; hover raises
   page preview.
9. `ui/markdown` is the one `MarkdownRenderer` caller (replies, recorded
   reports, subagent text, the plan on a card, the diff's Rendered toggle),
   `ui/copy` the one clipboard writer, `ui/messages` the one `window.open`;
   the allowlist loses its three U5 rows.
10. Reopen of up to 1,000 messages: newest sections first until two view
    heights, scroll to the end, older sections in `requestIdleCallback`
    chunks (at least 20 messages or under 4 ms left), position kept by
    scroll anchoring.

## Scope

Expected files:

- New: `src/ui/messages.ts`, `src/ui/prompt.ts`, `src/ui/jump-rail.ts`,
  `src/ui/empty-state.ts`, `src/ui/markdown.ts`, `src/ui/copy.ts`,
  `src/tab/recorder.ts`.
- Changed: `src/state/tab.ts` (the messages model), `src/state/prompts.ts`
  (numbers, first lines, turn prompt numbers, rail fractions, starters),
  `src/tab/chat-tab.ts` (`items`, `item:<id>`), `src/history.ts` (the
  optional send time and its validation), `src/settings-core.ts` (prompt
  keys, defaults, validation), `src/settings.ts` (Messages rows),
  `src/diffview.ts` and `src/report-view.ts` (render through the callback),
  `src/view.ts`, `styles.css`;
  `tests/state-tab.test.mjs`, `tests/state-prompts.test.mjs`,
  `tests/settings-core.test.mjs`, `tests/architecture.test.mjs` (three
  allowlist rows out).
- Docs: DES-001 (rendering boundary, A13, the prompt rows and defaults);
  DES-005 (the send time, the prompt keys); `docs/current/SECURITY.md` (the
  clipboard row names `ui/copy`); `README.md` (prompt display, links, copy);
  `docs/current/plan.md` (the eager-reopen backlog item out);
  `docs/current/DEVELOPMENT.md`; `RELEASE_NOTES.md`.
- Evidence: a `docs/records/verification/` record, with the reopen profile.

Negative scope:

- Turn head, footer, streaming and thinking (037); cards (038); steps and
  agents (039); report cards and the shell card (040): `legacy` items here.
- `inert-markdown`'s cuts (unchanged); export (DES-005).
- No new dependency; the allowlist edit above is the only protected path,
  tightening only (owner's 2026-10-11 instruction, recorded in the Run log;
  a loosening edit stops for the owner); no real-CLI run.

## Plan

- Tests first: numbering across the conversation, commands and `!` runs
  unnumbered, first lines, rail fractions (`PRD-001.R33`); starters for a
  note, a selection and neither (`PRD-001.R35`); the send time only when
  recorded (`PRD-003.R1`); the model built from stored messages, `legacy`
  kinds included; the prompt settings' defaults and load validation
  (`PRD-001.R25`).
- Moves out of `view.ts`: `renderMarkdown` and the placeholder swap
  (`TEXT_ATTRIBUTES`, `withoutRemoteStyles`) to `ui/markdown`;
  `handleLinkClick`, `handleLinkHover`, `resolveLinktext`, `linkAnchor`,
  `internalLinktext`, `pathCandidates`, `safeDecode`, `scrollToBottom` and
  `scrollToBottomThrottled` to `ui/messages`; `addCopyButton` to `ui/copy`;
  `renderWelcome` to `ui/empty-state`; `renderStored` and
  `restoreConversation`'s drawing to the model and the reopen; `record`,
  `recordPrompt`, `ensureConversation` to `tab/recorder`.
- Allowlist: the three `src/view.ts` U5 rows (`MarkdownRenderer`,
  `window.open`, `navigator.clipboard`) go.
- Verification: `make verify`; manual, by someone other than the
  implementer, at least at 300 and 1040 px: R17's rows (vault and external
  links through `basic`'s echo, page preview, no remote image), R33's (M1,
  both styles, pinned prompt, rail), R35's starter, PRD-003.R1's reopen of a
  file without send times, M3's prompt-text contrast (R28), and a
  1,000-message reopen profile (M8's reopen part). Codex cross-review before
  commit: the rendering boundary and the link and clipboard paths move.
- Risks: a missed `MarkdownRenderer` path rendering model text uncut (the
  architecture test's U5 rows fail on any other caller); scroll anchoring
  failing with asynchronous embeds, then ADR-016's fallback (`overflow-anchor:
  none` and compensation); rail re-reads costing layout on every streamed
  chunk (re-reads wait for a text block's end once 037 lands).
- Rejected: `column-reverse` for bottom alignment (DES-003: chronological DOM
  order); prompt color on the "You" label and number (contrast, DES-003
  Alternatives).

## Run log

- Tests first, against 034's tree with 034's review fixes (aba75b5,
  cherry-picked at the coordinator's request): `state-prompts` and
  `state-tab` failed on import (no `numberPrompts`, `chunkDone`; later
  `contextLabel`); `settings-core` failed its two prompt-setting tests
  (`promptStyle` undefined); `history-file` failed "PRD-003.R1, R4: a
  prompt's send time is kept; one that is not a time reads as absent" (a
  wrong-typed `sentAt` was kept as stored); `tab-recorder` failed on import
  (no module).
- Protected path, under the owner's instruction of 2026-10-11, for the
  owner to confirm: `tests/architecture.test.mjs` loses the allowlist's
  three `view` U5 rows (`MarkdownRenderer` ×3, `window.open`,
  `navigator.clipboard`); tightening only, the U3 row stays.
  `tests/styles.test.mjs` unchanged. Ask-first `package.json`: `pretest`
  gains `src/tab/recorder.ts`.
- Rendering boundary: `renderMarkdown`, `restoreInert` and
  `withoutRemoteStyles` moved verbatim into `ui/markdown` (diffed against
  the old functions); the view's wrapper passes the tab's render component
  and a liveness check, now also failing once a reopen replaced that
  component. `inert-markdown` is unchanged.
- Choices the accepted docs leave open, and departures, for review:
  - Pinned prompt: DES-003 described the numbered prompt's wrapper as the
    sticky element, cut to one line when stuck. Shrinking an in-flow
    element under the top moves the content below it by the lines it
    loses at every stick and unstick. The pin is instead a zero-height
    sticky element at the section's start holding the number and first
    line, shown while stuck; the prompt stays in flow. DES-003 Prompts
    rewritten in place. The observer's root reaches far below the view
    (`rootMargin` bottom 1000000%), so a sentinel leaves it only across
    the top edge (a jump from above the top to below the view otherwise
    fires nothing); the sentinel sits 2 px above its section, so a section
    scrolled to its start (a pin click, a rail jump) pins its own prompt.
    The pinned bar is a button named "Scroll to prompt N <first line>";
    only the pinned prompt's pin shows, every other one is `aria-hidden`
    and inert.
  - Messages DOM: the scroller (`region` "Messages") holds the empty
    state, the sections list (`margin-block-start: auto` is the spacer)
    and a trailer for today's typing indicator, which is not a model item.
    A legacy item is a `display: contents` host the old code draws into
    (`legacyEl` in `view`), so today's CSS lays its elements out as
    before. A streamed text block that ends empty removes its item.
  - Reopen: chunks run only while the tab shows; a tab reopened while
    hidden draws its first screen when shown, as scroll anchoring does not
    act from offset 0; a rail jump to an undrawn prompt draws down to it.
    DES-003 Reopen says so.
  - The empty state shows while the model has no items: an error before
    any prompt, or a branch's note, hides it.
  - `item:<id>` is fired by `ChatTab.updatePrompt`, which `ui/prompt`
    redraws on; no prompt changes after it is added in this slice.
  - Prompt head: the send time on numbered prompts only, HH:MM through
    `formatClock` (the user's locale, as 033 kept); a reopened prompt's
    image count joins the context label ("2 images"), replacing today's
    "🖼 2 images" line; live images stay thumbnails. Bubble hides the
    number and time too. Panel commands and `!` runs are right-aligned
    compact bubbles in both styles, "You" visually hidden. The bubble's
    and the compact message's copy button sits beside them.
  - Starters name the note by its basename; the selection counts only in
    the editor of the open note. `ui/composer` gains `setText`.
  - The rail: positions written as `--ai-agent-panel-tick-top` in px from
    the rail's height read in the pass; ticks rebuilt only when their
    labels change; the hover and current widening is a `transform`
    (ADR-017 motion). `ui/shell` owns the root's prompt classes and adds
    `mod-prompt-rail` (the messages reserve the rail's width);
    `ResizeMeasure.content` marks a measure the messages content's resizes
    run, and `observeContent` follows the active tab.
  - `turnPromptNumbers`: a panel command's card is no output; a turn with
    no output takes the last prompt before its `meta`.
  - `newConversationId` moved into `tab/recorder`, its only caller, so the
    recorder is Obsidian-free, in `pretest` (A12) and tested
    (`tests/tab-recorder.test.mjs`).
  - Links: `linkAnchor` uses `Node.instanceOf`, so links in a pop-out
    window work (the old `instanceof HTMLElement` failed across windows).
  - `diffview` and `report-view` unchanged: the diff's Rendered toggle
    already renders through the callback, and report cards render no
    Markdown. Files beyond the expected list: `src/history.ts`,
    `src/history-file.ts`, `src/ui/shell.ts`, `src/ui/composer.ts`,
    `tests/history-file.test.mjs`, `tests/tab-recorder.test.mjs`,
    `package.json`.
  - No `docs/records/verification/` record: the rows are run by someone
    other than the implementer, who records them (030 to 034's practice).
- Self-check in headless Chromium with Obsidian 1.14.4's `enhance.js` and
  `app.css` (the real shell, messages, prompts, rail and empty state on a
  real `ChatTab`, stub legacy drawing): found and fixed a reopen that drew
  every section at once (the empty state's class hid the list while the
  heights were read), every prompt counted pinned after a jump (the
  observer fired nothing for a sentinel moving from above the top to below
  the view), and the previous prompt counted pinned at a section's exact
  start. Checked: empty state and starters (note, selection, none, a click
  fills the composer); live prompt, command, `!` run, queued prompt and an
  item removed; both styles; bottom alignment; 1,000 stored messages
  reopened at 440×700: 5 sections drawn in 21 to 34 ms, at the end, the
  rest drawn while idle in about 1.9 s still at the end, 250 rail ticks in
  order; the pinned prompt and the rail's current tick mid-scroll; the pin
  click and a rail jump landing on their section; every link row of
  PRD-001.R17 (vault, unresolved Notice, heading ignored, encoded, middle
  and Ctrl click, `https`, `mailto`, `obsidian` opened, `file:` and
  `javascript:` cancelled, right-click passed, hover only on resolved
  vault links); a hidden tab's reopen drawn when shown, at the end; 300 px
  with no horizontal overflow.
- Codex cross-review of 7a14ea7..111faf6 (correctness framing). Confirmed:
  sanitization order, placeholder restore in text nodes and attributes,
  fences, MathJax style stripping, link handling, `Node.instanceOf`, no
  other DOM sink for model text, the streaming blocks, the typing
  trailer, the pin logic, the recorder. Fixed (b03ee65): idle chunks
  prepended under a hidden tab's saved scroll position (now only while
  shown); a rail jump to an undrawn prompt drew every pending section
  (now down to it); Markdown liveness ignored a replaced render component;
  an undrawn removed item would have been drawn later (latent); the rail
  kept old positions after a reset with the same prompts. Its high
  finding predates this slice (7a14ea7 has the same check) and is fixed
  here at the coordinator's request, test first (`reopenReusesTab` failed
  on import): restoring a stored conversation reused the active tab while
  a send waited on its CLI's start or a `!` run was in flight, and that
  send or run then landed in the restored conversation. A reopen now
  reuses the active tab only with no conversation, no session and nothing
  in flight (CLI starting, turn, `!` run or usage command, waiting card);
  the tab counts its `!` runs and usage commands (`localRuns`). DES-003
  "Previous conversations" says so. The follow-up confirming the fixes did
  not run (the Codex workspace's spend cap); the fixes were re-checked in
  the Chromium harness instead.
- Replayed onto `main` at 309a907 (034 landed): the six wip commits'
  net diff (7a14ea7..e17f90e) applied with `git apply --3way`, every file
  clean; `plan.md` counts 035 among the landed tasks.
- Review fixes (the independent review's nits), `make verify` after:
  N1, every stuck pin bar was a focusable button in the accessibility
  tree (97 of 100 after a 400-message reopen): only the pinned prompt's
  pin shows now (`is-current`, from `PinObserver`), every other is
  `aria-hidden` and inert; checked in Chromium, one pin bar focusable
  after a 400-message reopen. N2, a click on an SVG or MathML element
  inside a link was not intercepted (`instanceOf(HTMLElement)`): the
  handler takes any `Element`; checked with a path inside an SVG in a
  link. N3, copy in a real Electron pop-out, added to the manual rows
  (row 11). DES-003 Prompts says which pin shows.
- API changes for later slices: `ChatTab` gains `items`, `loadStored`,
  `addPrompt`, `addLegacy`, `removeItem`, `updatePrompt` and the `items`
  (`ItemsChange`) and `item:<id>` events; `state/tab` gains the model
  types, `itemsFromStored`, `sectionsOf`, `withItem`, `firstScreenDone`,
  `chunkDone`; `state/prompts` gains `numberPrompts`, `turnPromptNumbers`,
  `tickLabel`, `railFractions`, `tickMoved`, `sentLabel`, `contextLabel`,
  `starters`; `ui/messages` (`legacyEl`, `trailerEl`, `follow`,
  `scrollToEnd`, `scrollPosition`, `restoreScroll`, `setShown`, `pinned`,
  `railPrompts`, `railAnchor`, `scrollToPrompt`); `ui/markdown`
  `renderMarkdown(app, markdown, el, owner, live)`; `ui/copy` `copyText`,
  `copyButton(parent, text, label)`; `tab/recorder` `Recorder`;
  `ShellSource.prompts`, `Shell.observeContent`, `ResizeMeasure.content`;
  `Composer.setText`; `history`'s `newConversationId` moved to
  `tab/recorder`; `StoredMessage` user `sentAt`.
- Owed by hand, in a desktop vault against `tests/fake-cli.mjs`
  (DEVELOPMENT.md, "Running the panel against the fake CLI"), by someone
  other than the implementer, at 300 and 1040 px unless stated:
  1. PRD-001.R17 (DES-001's row): `basic` echoes a reply holding a vault
     link, an unresolved vault link, an `https` link, a `file:` link and a
     remote image: the vault link opens its note (a new tab on middle or
     Ctrl/Cmd click), the unresolved one shows `No file in this vault
     matches "<text>".` and creates nothing, `https` opens the browser,
     `file:` opens nothing, the image shows as text and DevTools Network
     shows no request; hovering the vault link raises the page preview.
     A reply with a `dataview` fence, inline `=` code and a `(key:: …)`
     field with Dataview enabled: nothing runs, no field shows.
  2. PRD-001.R33, M1 (300, 360, 440, 680, 1040 px): Pop-out prompts full
     width with the number, "You", HH:MM and the context label cut with an
     ellipsis; Bubble right-aligned at 86% (94% below 360 px), the context
     label under it, "You" read by a screen reader only; `/status` and
     `!ls` compact and monospace without a number; a prompt sent during
     `basic`'s turn marked "queued mid-turn"; numbers continue across a
     reopen; the copy button on hover and on Tab focus, copying the raw
     text.
  3. Pinned prompt: scrolling a long conversation pins the current
     prompt in one line at the top; clicking it returns to the start of
     its turn; nothing reflows as prompts pin and unpin; off in settings,
     no pin.
  4. Jump rail (Pop-out): a tick per prompt at its position, the pinned
     prompt's and a hovered tick in the prompt color, the 400 ms tooltip
     "N · <first line>", Enter or Space on a tick and a click scroll to the
     prompt; Bubble or the setting off removes the rail and its reserved
     width at once; a screen reader reads the nav "Jump to a prompt".
  5. PRD-001.R35: a new tab shows "Ask about your vault", the line and,
     with a note open, "Summarize <note>" and "Find notes to link here";
     selecting text in that note adds "Draft a follow-up from the
     selection"; switching notes updates them; a starter fills the
     composer and sends nothing.
  6. PRD-001.R25: "Messages" with "Prompt style", "Pin the current prompt
     while scrolling" and "Prompt jump rail" (only with Pop-out), synced
     by default; each change reaches an open panel at once.
  7. PRD-003.R1: a new prompt's file entry has `sentAt`; a conversation
     file from before this change reopens without send times and without
     an error.
  8. M3: prompt-text contrast on the Pop-out and Bubble fills in
     Obsidian's default light and dark themes, measured in DevTools (at
     least 4.5:1).
  9. PRD-003.R9, in-flight reopen: in a fresh tab run `!sleep 3; echo
     done` and, while it runs, pick a stored conversation from "Previous
     conversations": it opens in a new tab, and the run finishes and is
     recorded in the first; the same during `basic`'s turn and with
     `permission`'s card waiting; an idle fresh tab, and one detached from
     a deleted conversation, are reused. (A send still waiting on its CLI's
     start is too short a window to time by hand; the `reopenReusesTab`
     test covers it.)
  10. M8 (reopen): a 1,000-message conversation reopened, profiled in
     DevTools: last screen within 1 s, no frame over 100 ms while older
     sections draw, no visible reflow; the view stays at the end as
     Markdown and embeds settle (else ADR-016's fallback).
  11. M5: the panel in a pop-out window (a real Electron pop-out): a
      prompt's and a reply's copy button put the text on the clipboard;
      a vault link opens its note and an `https` link the browser; the
      pinned prompt, the rail and the starters work there.

## Independent review

A review agent, not the implementer, mounted the real `Shell`,
`Messages`, `PromptView` and `PinObserver`, `JumpRail`, `EmptyState` and
`ChatTab` in headless Chromium with Obsidian's `enhance.js` and `app.css`,
and compared the rendering boundary's functions byte for byte with the
code they left in `view.ts`: moved unchanged. It re-checked the Codex
fixes in place of the follow-up the spend cap stopped, and agreed with
every departure in the Run log. No defects; links now also work in
pop-out windows. Nits, fixed (Run log, "Review fixes"): N1, every stuck
pin bar focusable and read by screen readers; N2, links missed clicks on
SVG and MathML inside them; N3, copy in a real Electron pop-out added to
the manual rows.

## Outcome

Built, reviewed and replayed onto `main`. Each tab's messages are a model
in `state/tab` drawn by `ui/messages`, with numbered prompts in two
styles, the pinned prompt, the jump rail, the empty state's starters and a
chunked reopen; `ui/markdown`, `ui/copy` and `ui/messages` hold the one
Markdown path, clipboard writer and `window.open`; a reopen reuses the
active tab only when nothing is in flight there. For the owner:

- `tests/architecture.test.mjs`, protected: the allowlist's three `view`
  U5 rows (`MarkdownRenderer`, `window.open`, `navigator.clipboard`)
  removed (tightening only, under the instruction of 2026-10-11).
- Manual rows 1 to 11 of the Run log, the 1,000-message reopen profile
  (row 10) included, run and recorded in `docs/records/verification/` by
  someone other than the implementer.
