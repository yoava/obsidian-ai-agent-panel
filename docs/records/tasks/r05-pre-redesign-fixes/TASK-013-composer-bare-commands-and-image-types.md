---
status: closed
release: r05-pre-redesign-fixes
number: 013
prd: PRD-001.R12, PRD-001.R14
---

# TASK-013 — Composer: bare commands and image types

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A message starting with `/` was sent behind the context block, so Claude Code
read `/compact` as a prompt
([real-CLI run](../../../records/verification/2026-10-10-real-cli-compact-and-cost.md)).
Any `image/*` file was attached whatever its type, and the eighth-image
refusal stopped the loop, so the rest of a drop went unlisted.

Governing: PRD-001.R12, PRD-001.R14,
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(Wire format: a `/` message is sent as typed),
[DES-001](../../../current/design/DES-001-system-overview.md) (components).

Acceptance:

1. `isBareMessage(text)` is true when the text sent starts with `/`, false
   for empty text and for any other first character, a space included (the
   composer trims first).
2. `planSend(text, queued, pending)` returns `withContext` (true only when
   the message is neither queued nor bare), `send` (the pending images, none
   for a bare message) and `keep` (the pending images that stay, all of them
   for a bare message).
3. A bare message is sent as typed, queued or not: no context block, no
   context label on the bubble, and its stored paths hold only the `@`
   mentions in its text.
4. A bare message consumes no images: the pending images stay on the tab
   with their chips, none is sent with it, and its record has no image
   count. File chips stay too, as they do after every send. They ride the
   next message that is not bare.
5. Any other message is unchanged: context block, labels, images consumed;
   a queued one still skips the block and still takes the images.
6. `imageRefusal({type, size, name}, count)` refuses, in this order: a type
   outside `image/png`, `image/jpeg`, `image/gif`, `image/webp`; a size over
   4 MB (4 MB itself attaches); `count` already at 8. Each refusal names the
   file ("pasted image" when it has no name).
7. `collectImages(files, count, read)` checks every file, so each refusal,
   the ninth image and after included, is listed; the count starts at the
   images already on the message; a file whose `read` throws is listed as
   `<name> could not be read` and takes no place.
8. The refusals form one Notice starting `Not attached:`, entries joined by
   `; `; none, no Notice.

Owner decisions taken for this task (end-of-work list):

- D1. A `/` message leaves the pending images and the file chips for the
  next normal message; it neither sends nor discards them (see Q1).
- D2. "Starts with `/`" is read on the trimmed text the composer sends; the
  CLI receives that text, so the first character it sees is the one tested
  (see Q2).
- D3. A refused `image/*` type is refused with a Notice. A drop with no image
  files still falls through to Obsidian's own drop.

Owner questions (end-of-work list; PRD-001.R12 stays as accepted):

- Q1. R12 holds images back from a `/` message. Recommend changing R12 so a
  `/` message still sends its images: the review reads the context block as
  the only thing that breaks the command, and the CLI passes preceding image
  blocks to it (not verified against the CLI).
- Q2. "Starts with `/`" also catches an absolute path ("/home/me/a.md what
  is this?"), which then loses its context. Recommend R12 read "starts with a
  `/` command name" (`/^\/[A-Za-z0-9_][A-Za-z0-9:_-]*(\s|$)/`), matching the
  CLI's own dispatch.

## Scope

Expected files:

- `src/commands.ts` (`isBareMessage`), `src/attachments.ts` (new:
  `API_IMAGE_MEDIA_TYPES` and the limits moved out of `view.ts`,
  `PendingImage`, `imageRefusal`, `unreadableRefusal`, `notAttachedMessage`,
  `collectImages`, `planSend`), `src/view.ts` (`handleSend`, `attachImages`,
  imports; the icon fallback of an image chip and the type filter on a sent
  message's thumbnails, both dead now that only the four types attach)
- `tests/commands.test.mjs`, `tests/attachments.test.mjs` (new),
  `package.json` (`pretest`)
- `README.md` (image types, slash commands), `RELEASE_NOTES.md`,
  `docs/current/plan.md` (two backlog items removed, two added),
  `docs/current/DEVELOPMENT.md` (test table), DES-001 (components, layer 1),
  the DES-003 draft where it disagrees with the code

Negative scope:

- Panel commands (`parsePanelCommand`) and which commands the CLI lists:
  unchanged.
- Queued-message behaviour other than the `/` rule: unchanged.
- `imageFilesFrom`, thumbnails, the stored image count, the CLI's own
  downscaling: unchanged.
- Showing a slash command's local output: backlog.
- The other backlog items.
- A real-CLI run: not needed; the CLI side is already verified.

## Plan

- Tests first: `isBareMessage` cases in `tests/commands.test.mjs`; a new
  `tests/attachments.test.mjs` for the type, size and count rules, their
  order, the nameless file, the Notice text, `collectImages` (a loop that
  stops at the first refusal fails it) and `planSend`.
- `imageRefusal` takes `{type, size, name}` so a `File` passes as is, and
  `collectImages` takes the file read as a callback, so the module stays free
  of the DOM. The type set and limits move with them, so `view.ts` keeps one
  definition (design rule 2). `planSend` is what `handleSend` reads, so the
  rule is tested outside the view.
- Verification: `make verify`. `view.ts` changes are tested by hand in a
  vault: `/compact` with a note open and an image pending; a mistyped command
  (`/compcat`); "Branch from here" on the `/compact` turn; a drop of a BMP,
  an SVG and ten PNGs.

## Run log

- Tests first: the `isBareMessage` cases failed to load
  (`commands.mjs` had no such export), `tests/attachments.test.mjs` failed
  (no `attachments.mjs`), and `pretest` could not bundle `src/attachments.ts`.
  All pass after the change.
- Review round 1 moved the wiring into `attachments` (`collectImages`,
  `planSend`). With a `break` put back in `collectImages`, its test fails.
- Owed by hand in a vault: the manual checks of the Plan.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.

1. Gap: a `/` message holds images back, which R12 says but may not need.
   Open: Q1, recommend changing R12.
2. Gap: "starts with `/`" also catches an absolute path and drops its
   context. Open: Q2, recommend a command-name pattern.
3. Gap: manual checks missing for `/compact`, a mistyped command and
   "Branch from here" on the `/compact` turn; a command's local output is
   not shown and its echo may become the rewind uuid. Fixed: checks added to
   the Plan, backlog item added to the plan.
4. Gap: the wiring in `view.ts` was untested, so a restored `break` passed.
   Fixed: `collectImages` and `planSend` in `attachments`, tested; the
   reimplemented-loop test dropped.
5. Stale: DES-003 draft step 6 mixed the turn counter with the block. Fixed.
6. Stale: DES-003 draft test table said "none (gap)" for R12 and R14. Fixed:
   the new tests are named, the view wiring stays a manual gap.
7. Stale: the README's slash-commands bullet did not say a `/` message is
   sent bare. Fixed.
8. Nit: DES-003 draft stated the bare rule twice. Fixed: merged into step 7.
9. Nit: `IMAGE_MEDIA_TYPES` also gates tool-result images, so its name hid a
   job. Fixed: `API_IMAGE_MEDIA_TYPES`, said in the module header and the
   DES-001 row.
10. Nit: a nameless file was "image" in refusals and "pasted image" on the
    chip. Fixed: "pasted image" in both.
11. Gap: D3 overstated falling through to Obsidian's drop when a drop mixes
    images and other files. Fixed: D3 reworded; backlog item added.
12. No change: the owner asked for the backlog to land as grouped tasks.

## Outcome

A message starting with `/` goes to Claude Code without the context block or
images, which stay for the next message; only PNG, JPEG, GIF and WebP attach,
and every refusal is listed in one Notice. Owner questions Q1 and Q2 stand as
recommended until answered. Owed by hand in a vault: `/compact` with a note
open and an image pending, `/compcat`, "Branch from here" on the `/compact`
turn, and a drop of a BMP, an SVG and ten PNGs.
