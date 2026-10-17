---
status: planned
release: r11-bounds-and-platform-fixes
number: 144
prd: PRD-002.R16
---

# TASK-144 — Pass a `!` command to cmd.exe verbatim

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `fix`, the owner's decision of 2026-10-17 (1.0.0 known issue; risk
row 4). On native Windows `shellInvocation` (`src/bash.ts`) spawns
`%ComSpec% /d /s /c <command>` with array arguments and `shell: false`; Node
quotes the command for the Windows command line and escapes `"` as `\"`,
which cmd.exe does not read, so a command containing `"` may be cut short.
PRD-002.R16 and DES-004 Shell escape state the intended shape.

Acceptance:

- On native Windows, `!echo "a b"` and a command holding `%`, `&` or `|`
  behave as the same line typed in cmd.exe.
- The WSL and POSIX shapes are unchanged.
- A unit test asserts that the win32 invocation carries
  `windowsVerbatimArguments: true` and the command as one quoted argument,
  and that the other platforms carry neither.
- The owner's run on Windows is recorded; the notes' known issue is dropped.

## Scope

Expected files: `src/bash.ts`, `tests/bash.test.mjs`, DES-004 Shell escape,
`RELEASE_NOTES.md`.

Negative scope: the `claude.cmd` launch quoting (`windowsQuote`,
`src/protocol/client.ts`, PRD-001 launch arguments), the WSL shape.

## Plan

Build the win32 line as `/d /s /c "<command>"` with
`windowsVerbatimArguments: true`, the form cmd.exe's `/s` rule strips. Test
first, `make verify`, then a manual row on the F15's native profile recorded
in `docs/records/verification/`.

Rejected: refusing `"` (quoting is legitimate in a shell line); escaping it
(cmd.exe has no escape for `"` inside a `/c` string).

## Run log

Not started.

## Independent review

Pending.

## Outcome

Pending.
