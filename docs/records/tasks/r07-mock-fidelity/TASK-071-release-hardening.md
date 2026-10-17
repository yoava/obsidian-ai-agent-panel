---
status: closed
release: r07-mock-fidelity
number: 071
prd: PRD-003.R4, PRD-003.R13, PRD-001.R26
---

# TASK-071 — Release hardening from the security review

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Three fixes from the security review, each its own commit. Governing:
[constitution](../../../current/constitution.md) (inert rendering, spawn
rules); [SECURITY.md](../../../current/SECURITY.md);
[DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(launch shapes); [DES-005](../../../current/design/DES-005-persistence-and-sync.md)
(Export); [PRD-003](../../../current/product/PRD-003-conversation-history-and-export.md)
R4, R13; [ADR-008](../../../current/adr/ADR-008-windows-and-wsl-launch-and-cli-profiles.md).

Acceptance:

1. A stored export path holding a backslash or colon (`Agent Chats/..\..\x.md`,
   `Agent Chats/file.txt:note.md`) is not
   reused; the conversation gets a fresh path under the folder.
2. A `.cmd`/`.bat` shim path is always quoted, and a path matching
   `CMD_UNSAFE` (`&`, `^`, `%`, `!`, `"`, CR, LF, ...) is refused with an error
   naming the path and the native build (npm's shim reads its directory
   unquoted). A WSL CLI path keeps `~/`, `$NAME` and `${NAME}` expansion; every
   other `$` is escaped, so no command substitution runs, even under bash.
3. An exported prompt goes through `cutForExport` like replies, thinking and
   errors: a `dataviewjs` fence or remote image in a prompt is inert in the
   note; a plain prompt exports unchanged.

## Scope

Expected files: `src/history-file.ts` (`isSafeExportPath` moved here from
`src/export.ts`, which imports it), `src/protocol/client.ts`,
`src/transcript-markdown.ts`; tests `tests/history-file.test.mjs`,
`tests/protocol.test.mjs`, `tests/transcript-markdown.test.mjs`; docs
`RELEASE_NOTES.md`, `docs/current/SECURITY.md`, DES-001 (module row), DES-002,
DES-005.

Negative scope: panel rendering, history format, settings, symlink handling,
note embeds, `tests/styles.test.mjs`, `tests/architecture.test.mjs`, protected
paths.

## Plan

Test first for each fix, see it fail, fix, run the suite. The export-path
check moves to the Obsidian-free `history-file` (already in `pretest`) so plain
Node tests it. The shim path is quoted with literal quotes after screening, as
`windowsQuote` leaves a whitespace-free path bare. Rejected: escaping `%`/`!`
in the path (cmd.exe has no reliable escape inside quotes; arguments are
refused the same way); allowing `&` inside quotes (the npm shim re-reads its
directory unquoted); exporting prompts as a code fence (prompts stay as
replies export).

## Run log

- Existing test "no two colons meet" asserted a prompt's `%%` comment is kept;
  prompts now take the export form, so it asserts the escaped comment.

## Independent review

Reviewer: independent review agent; cross-review by Codex. Verdict: approve
with changes. Findings and resolutions:

- npm's shim runs an unquoted `SET dp0=%~dp0`, so quoting cannot save a path
  with `&` or `^`. Resolved: the shim path is screened with `CMD_UNSAFE` and
  refused with an error naming the native build; it stays always quoted.
- With bash as `sh`, `${Y:=$(id)}${Y@P}` and `${Z:=a[$(id)]}${HOME:Z}` still
  run a command. Resolved: `shellPath` escapes every `$` except a plain
  `$NAME` or `${NAME}`; both payloads, Codex's
  ``${PANEL_PROBE:=`id`}${PANEL_PROBE@P}`` shape, `$((1))` and `${A:-x}` are
  tested escaped.
- DES-002 claimed `profileLaunchArgs` refuses the path; only `cliSpawnSpec`
  does. Resolved: claim dropped.
- DES-001 `inert-markdown` row omitted exported prompts. Resolved.
- Release note for fix 3 lacked the literal display of code spans, math and
  `%%` comments in prompts. Resolved.
- Codex: `Agent Chats/document.txt:transcript.md` is an NTFS alternate stream.
  Resolved: `isSafeExportPath` refuses `:` too.
- Rejected (Codex suggestion): exporting prompts as a code fence instead of
  `cutForExport`; prompts stay in the same form as replies.
- Out of scope: symlinked export folders.

## Outcome

accepted
