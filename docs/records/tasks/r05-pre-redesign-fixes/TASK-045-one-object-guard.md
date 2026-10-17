---
status: closed
release: r05-pre-redesign-fixes
number: 045
prd: none
---

# TASK-045 — One plain-object guard

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

A refactor with no behavior change; no requirement governs it. Backlog item
(removed by this task): three copies of the plain-object guard, `isJsonObject`
in `protocol/client`, `rec` in `commands` and `asRecord` in
`transcript-markdown` (the exporter's note builder), against design rule 2 (no
duplicated code, `AGENTS.md`). Task 044 added the shared `isJsonObject` in
`src/json.ts`; the three callers move to it.

Governing: [DES-001](../../../current/design/DES-001-system-overview.md)
(Layers, A3, A5), [DES-002](../../../current/design/DES-002-cli-client-and-session-lifecycle.md)
(B1).

Acceptance:

1. `src/json.ts` exports `isJsonObject` and `asJsonObject(value)`: the object
   itself, else a fresh `{}` per call (a caller may write to it).
2. `protocol/client` imports `isJsonObject` from `../json`; `commands` calls
   `asJsonObject` where it called `rec`; `transcript-markdown` calls it where it
   called `asRecord`. The three local functions are gone.
3. No behavior change. The one input class on which a copy differed: `asRecord`
   passed an array through, the shared guard reads it as `{}`. Its only caller
   hands the result to `summarizeToolInput`, which reads named string
   properties (`file_path`, `path`, `command`, `questions`, ...) that an array
   lacks, so the title is the same; `readFile` already turns an array `input`
   into `{}` (task 044).
4. DES-001 A5 and DES-002 B1 list `json` among what `protocol/*` may import
   (`json` is a pure leaf, as `timers` is); the file map, the test table, the
   release notes and the `plan.md` backlog state the present answer.

## Scope

Expected files:

- `src/json.ts` (`asJsonObject`), `tests/json.test.mjs`
- `src/protocol/client.ts`, `src/commands.ts`, `src/transcript-markdown.ts`
- `tests/commands.test.mjs`, `tests/transcript-markdown.test.mjs` (pin the
  inputs the old copies handled)
- `docs/current/design/DES-001-system-overview.md` (file map, A5),
  `docs/current/design/DES-002-cli-client-and-session-lifecycle.md` (B1),
  `docs/current/DEVELOPMENT.md`, `docs/current/plan.md`, `RELEASE_NOTES.md`

Negative scope:

- Other code that tests for an object inline: `mcp/server` (twice; A7 has it
  import nothing), `local-store`, `settings-core` `storedRecord` (also drops
  prototype keys). They stay in the backlog, reworded.
- Checks with other semantics: `protocol/client` `getPlanUsage` (an array
  passes, `null` otherwise), `mcp/vault-tools` `patch` (`null` means read),
  `usage-core`.
- A new dependency, a module, `package.json` `pretest` (`json` is built
  already), protected paths, a real CLI run.

## Plan

- Tests first: `asJsonObject` in `tests/json.test.mjs`, which does not load
  without the export. Characterization tests for what the three copies
  accepted, written green against the old code: `contextReport` and
  `mcpReport` on replies and entries that are not objects (`commands`), a tool
  `input` that is not an object (`transcript-markdown`). The `protocol/client`
  guard is covered end to end by `tests/protocol.test.mjs`, unchanged.
- Then move the callers; the diff is deletions, an import each and the renamed
  calls.
- A5 and B1 name `timers` as the one shared helper `protocol/*` may import;
  `json` joins it rather than keeping a fourth copy in `protocol/client`.
- Rejected: `commands` and `transcript-markdown` keeping a local alias such as
  `const rec = asJsonObject` (a second name for one function); an
  `isJsonObject(v) ? v : {}` at each call (the same expression repeated, which
  is what this task removes).
- Verification: `make verify`.

## Run log

- Tests first: with `asJsonObject` absent, `tests/json.test.mjs` fails to load
  (the import has no such export), so its two existing tests fail with it. The
  characterization tests in `commands` and `transcript-markdown` pass before
  and after the move, as a refactor's guards must.

## Independent review

A review agent, not the implementer; `make verify` passed. No Defect:
every call site behaves as before (`rec` equalled `asJsonObject`; the
`asRecord` array case is unobservable through its one caller; no caller
mutates the fresh `{}`). Nits: the backlog line now says `mcp/server` needs
A7 relaxed first. Merge note for the redesign branch: its architecture
test must allow `json` in A5 and list `json` in layer 1.

## Outcome

One plain-object guard in `src/json.ts` serves `protocol/client`,
`commands` and `transcript-markdown`; DES-001 A5 and DES-002 B1 let
`protocol/*` import that leaf, for the owner to confirm. No behavior
changes.
