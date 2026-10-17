---
status: closed
release: r05-pre-redesign-fixes
number: 010
prd: PRD-002.R4, PRD-002.R6, PRD-002.R7
---

# TASK-010 — Vault bounds and subagent edits

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

`vaultRelativePath` tested the vault-root prefix before resolving `..`, so
`/v/../x.md` returned `../x.md`, a vault path. Subagent edits never reached
the change list: no pre-edit read started at a subagent's `tool_use`, a
subagent's permission request read without keeping it, and its result
recorded nothing.

Governing: PRD-002.R4 ("in the vault only when, with its `.` and `..`
segments resolved, it lies under the vault root"), PRD-002.R6, PRD-002.R7
("Edit, Write or MultiEdit calls of the main agent or its subagents"),
[DES-004](../../../current/design/DES-004-permission-and-change-control.md)
(Edit planning, Diff sources, Change list),
[ADR-006](../../../current/adr/ADR-006-turn-checkpoints-and-branching.md),
`AGENTS.md` design rule 4.

Acceptance:

1. `vaultRelativePath(reported, root, ignoreCase)`: the root's form decides
   the path's. Under a drive or UNC root `\` and `/` both separate; under a
   POSIX root a path containing `\` is refused.
2. Empty and `.` segments drop; `..` removes the segment before it but never
   the anchor (`/`, a drive `C:/`, `//host/share/` with both host and share),
   so `..` at an anchor stays there.
3. Refused (null): a relative path that climbs out or starts at `~`, a
   segment of only dots and spaces, a drive with no separator after it, a UNC
   path without a share or with host `?` or `.`.
4. An absolute path is in the vault only when the resolved root's anchor and
   every segment match and a segment follows; the result is the rest joined
   by `/`, in the path's case. Names compare exactly, or with `ignoreCase` by
   upper-casing each character where that gives one character that
   lower-cases back, so the Kelvin, Ohm and Angstrom signs, the dotless i and
   the long s stay apart from k, ω, å, i and s; names of different lengths
   fail before any folding. The view passes
   `namesIgnoreCase(process.platform)`: Linux exact, Windows and macOS
   ignoring case.
5. Null for `/v/../x.md`, `/v/./../v2/x`, repeated `..`, Windows and
   mixed-separator paths that climb out, `/v2/x` against `/v`, the root
   itself, another anchor, an empty or relative root,
   `/home/me/.config/autostart/..\..\..\vault\evil.desktop` under
   `/home/me/vault`, `\\evil\x\..\..\wsl.localhost\Ubuntu\home\me\vault\a.md`
   and `\\host\share2\..\share\v\a.md` against their roots. `a/../b.md` gives
   `b.md`; a root with trailing separators, `.` or `..` matches as resolved;
   a vault at `D:\` works.
6. `EditTracker` (`src/edit-tracker.ts`, no Obsidian import) gets every
   `assistant` message, main agent or subagent, and starts the read of each
   Edit, Write or MultiEdit `tool_use` that names a file, kept by tool-use id;
   a call whose permission request came first keeps the request's read.
7. A permission request reuses the kept read when it names the same file,
   else starts a fresh one in its place (a hook's `updatedInput`).
8. It gets every `user` message, main agent or subagent, and releases the
   read of each call reported, card or no card. A non-error result re-reads
   the file, records it in the change list when it is in the vault
   afterwards, and goes to the call's card; an error records nothing.
9. The process exit (`failPendingPermissions`) and a deliberate restart (the
   session's `onRestarted`) clear every kept read.
10. A read that lands after the write is recorded with `before` equal to
    `after` (DES-004 Change list).
11. Unchanged: the main agent's activity card and restore; subagent edits stay
    out of the turn record (`edited`), so *Restore files* does not offer them
    (ADR-006). Its tooltip says it puts back the files Claude Code tracked
    for the turn.

## Scope

Expected files:

- `src/edits.ts` (`namesIgnoreCase`, `resolvePath`, `foldCase`,
  `vaultRelativePath`)
- `src/edit-tracker.ts` (new), `package.json` (`pretest`)
- `src/view.ts` (stream dispatch, `handleToolResults`, `settleEditCard`,
  `handlePermissionRequest`, `failPendingPermissions`, `resolveReportedPath`,
  the *Restore files* tooltip; `capturePreImage` and `preEditRead` removed)
- `src/protocol/types.ts` (comment on `agentId`), `src/session.ts`
  (`onRestarted`)
- `tests/edits.test.mjs`, `tests/edit-tracker.test.mjs` (new),
  `tests/session.test.mjs`
- `RELEASE_NOTES.md`, `docs/current/plan.md`, DES-001, DES-002, DES-004

Negative scope:

- WSL `/mnt/<drive>/` path mapping (PRD-002.R6, R14): a separate owner
  decision; stays in the backlog.
- Restore: unchanged; subagent edits stay unrestorable (ADR-006).
- A diff or `+x -y` on a subagent's tool row.
- `docs/current/SECURITY.md`: states no path rule; unchanged.
- Sharing segment splitting with `src/mcp/paths.ts`: a backlog line says why
  not.
- Windows short names, NTFS stream suffixes and trailing dots or spaces on
  other names; macOS Unicode normalization (a path differing only in form
  counts as outside); per-volume case sensitivity (the rule follows the
  platform, so a case-sensitive volume can over-match; DES-004).

## Plan

- Tests first in `tests/edits.test.mjs` and `tests/edit-tracker.test.mjs`,
  adversarial paths included.
- One resolver, `resolvePath`, for the path and the root, in the root's form;
  an anchor and segment-wise comparison replaces the string prefix test.
- `EditTracker` holds the keep, take and record decisions for the main agent
  and subagents alike; the view calls it once per `assistant` and `user`
  message and wires `resolve`, `read` and `recordFileChange`.
  `settleEditCard` keeps the card body, header counts and history.
- Verification: `make verify`; mutants of `resolvePath`, `vaultRelativePath`
  and `EditTracker`. By hand in a vault, deferred to the owner's end-of-work
  test pass: the change list with a subagent edit, in Ask and in Accept
  edits, Bypass or under an allow rule; an edit card for a `<vault>/../x.md`
  path saying it is outside the vault.
- Rejected: resolving a relative path against the root (accepts
  `../<vault name>/x`, against DES-004's leftover-`..` rule); Node's `path`
  (platform-dependent; `edits` imports nothing, DES-004 D1); skipping a
  record when `before` equals `after` (a later edit would take the same
  `before`, so the net diff gains nothing).

## Run log

- Tests first: five of the six first R4 tests failed (`/v/../x.md` gave
  `../x.md`); the case test passed already.
- A first version collapsed a UNC `//` into `/`, so `/host/share/v/a.md`
  matched `\\host\share\v`; the test failed first.
- Review round 1, tests first: the seven new R4 tests failed (POSIX `\`, UNC
  anchor, case flag, case folding, `~`, dots and spaces, drive without
  separator); `tests/edit-tracker.test.mjs` failed at build (no module).
- Mutation, by a scratch script (not committed): 19 mutants of
  `resolvePath`, `vaultRelativePath`, `namesIgnoreCase` and `EditTracker`.
  Survivors were a redundant empty-root check (removed) and the
  drive-without-separator check, which shows only against a root of the same
  shape (assertion added); all 19 fail the tests now.
- `git commit` and `git rebase` were denied by this session's permissions;
  the coordinator merged the change onto main (`6d200cf`, branch
  `task-010b`).
- Review round 2, tests first: the dotless i and long s assertions and the
  `onRestarted` session test failed before the fixes.
- `make verify` on the merged branch: OK, 459 tests. The manual vault
  checks are deferred to the owner's end-of-work test pass.

## Independent review

Round 1: a review agent, not the implementer; `make verify` passed.
Findings:

1. Defect: `..` could leave a UNC root's share
   (`\\evil\x\..\..\wsl.localhost\...`, `\\host\share2\..\share\...`).
   Fixed: host and share are the anchor; no share, or host `?` or `.`, is
   refused; tests.
2. Defect: under a POSIX root `\` became `/`, so
   `/home/me/.config/autostart/..\..\..\vault\evil.desktop` counted as
   `vault/evil.desktop`. Fixed: `\` separates only under a drive or UNC root,
   else the path is refused; the test that locked the conversion uses a
   Windows root; test.
3. Case: names compared ignoring case everywhere, by lower-casing, so the
   Kelvin sign matched k. Fixed: `namesIgnoreCase(process.platform)` from the
   view, per-character upper-casing into one character; tests; DES-004.
4. A relative path at `~` counted as a vault path. Fixed: refused; test.
5. A segment of only dots and spaces counted as a name. Fixed: refused; test.
6. A request whose input a hook rewrote reused the `tool_use`'s read. Fixed:
   `readFor` keeps the path beside the read and starts a fresh one when the
   request's differs; test.
7. Leaks: a result with no card kept its read, and nothing cleared on exit.
   Fixed: the tracker releases every reported call before the card lookup;
   `failPendingPermissions`, which the process exit calls, clears it.
8. The subagent wiring was untestable. Fixed: `EditTracker`, tests named in
   DES-004's R7 row; deleting its capture or settle fails them. The late read
   is recorded with no net change (DES-004 Change list); the manual check
   covers Accept edits, Bypass and allow rules.
9. DES-004 lacked the segment and anchor rules. Fixed.
10. The release notes named the *Restore files* dialog. Fixed: removed.
11. `PermissionRequest.agentId`: kept, with a comment.
12. The *Restore files* tooltip implied every edit of the turn. Fixed: "Put
    the files Claude Code tracked for this turn back as they were".
13. Sharing segment splitting with `src/mcp/paths.ts`: not shared; its split
    takes `\` on every platform and its `fold` matches more than a vault
    bound may; backlog line in `plan.md`.

Added while fixing 1 and 2: a drive with no separator after it (`C:..\x.md`)
is refused; test.

Round 2: the same reviewer on the merged branch; `make verify` passed. All 13
verified fixed; the attack probes no longer escape. Findings:

1. N1: upper-casing matched the dotless i and the long s to i and s. Fixed: a
   character folds only when its upper case lower-cases back; test with
   `/Users/me/Obsıdıan/x.md` against `/Users/me/Obsidian`; DES-004 says the
   case rule follows the platform, not the volume.
2. N2: the release notes said `\` is part of a name. Fixed: such a path
   counts as outside the vault.
3. N3: the run log's test count and the merge. Fixed.
4. N4: a deliberate restart left a background subagent's read kept until the
   tab closed. Fixed: the session reports `onRestarted` when it replaces a
   live process and the view clears the tracker; session test against the
   fake CLI; the tracker's `clear` was already tested.
5. N5: folding cost scaled with segment length before any mismatch showed.
   Fixed: names of different lengths fail first, and the comparison stops at
   the first differing character. No test: the result is the same either way.

## Outcome

A path that leaves the vault through `..`, a UNC share change or a `\`
under a POSIX root counts as outside it; names compare ignoring case only
on Windows and macOS, one character at a time. Subagent edits reach the
change list through `EditTracker`, unrestorable as before (ADR-006). WSL
`/mnt/<drive>/` mapping stays in the backlog for the owner. Owed by hand in
a vault: a subagent edit in the change list under Default, Accept edits
and Bypass; a deliberate restart mid-subagent.
