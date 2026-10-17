# AI Agent Panel agent guide

Canonical guide for every contributor and agent; `CLAUDE.md` imports it. Keep
it to facts a senior contributor would not infer from the code.

## 1. Project overview

Unofficial Obsidian desktop plugin that puts an AI coding agent in a native
chat panel inside the vault. It spawns the agent CLI the user installed and
logged in to (Claude Code today; Codex is planned for a later release) and
talks to it over stdio stream-JSON, with the vault as working directory, every
sensitive action behind an in-chat permission card, and in-process vault tools
(backlink-safe rename, links, metadata search, properties).

It is a TypeScript plugin bundled into one `main.js`, libraries included
(ADR-007). It already ships, so the plugin itself is the walking skeleton.
Requirements, decisions, and phase gates live in committed artifacts; chat or
session state never constitutes approval.

## 2. Layout

- `src/`: plugin source, entry `src/main.ts`; file map in
  `docs/current/design/DES-001-system-overview.md`. `manifest.json` and `styles.css` ship with
  the built `main.js`.
- `tests/`: `node:test` specs and `fake-cli.mjs`, a stand-in `claude`.
- `docs/current/`: what governs now: `constitution.md`, `plan.md`,
  `open-decisions.md`, `adr/`, `product/` (requirements), `design/`
  (mechanisms), `SECURITY.md` (threat model), `DEVELOPMENT.md`,
  `COMPARISON.md`, `LEGAL.md`.
- `docs/work/`: in progress, not binding: drafts under the same folder names,
  `changes/` requirement deltas, active `tasks/` and `research/`.
- `docs/records/`: closed tasks, verification evidence, incorporated changes,
  finished research, and `log.md` for events Git cannot show. Write-once.
- `RELEASE_NOTES.md` (root): what each release shipped. It sits outside
  `docs/records/` because its *Unreleased* section is edited on every change.
- `.agentic/`: document templates and the scaffold version.
- `scripts/`: deterministic governance checks and their tests.
- `.claude/`: shared permissions and hooks, the graphify skill. `.github/`:
  CI, release, Dependabot, templates. Root `SECURITY.md` is the reporting
  policy GitHub shows.

Load this guide, the constitution, your task, and what it cites; search
`docs/current/` first. Only `docs/current/` governs; never treat a draft,
research note, or record as a requirement or decision. For why or when
something changed, use `git log --follow -p <file>` and `docs/records/`.

Current documents state the present answer completely. Rewrite them in place,
never add amendment, history, or log sections, and put why a document changed
in the commit body. `make approve DOC=<path>` moves an approved draft into
`docs/current/` (a human approval commit); `make close DOC=<path>` moves
finished work into `docs/records/`. The *Unreleased* section of
`RELEASE_NOTES.md` grows until a release titles it.

When `graphify-out/graph.json` exists (gitignored; `graphify .` builds it),
answer codebase questions with `graphify query "<question>"`,
`graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` before raw
search; navigate with `graphify-out/wiki/index.md` if present; read
`graphify-out/GRAPH_REPORT.md` only for broad architecture review. After
modifying code, run `graphify update .` (AST only, no API cost).

## 3. Adding behavior

1. Classify the change as S (small fix), M (feature), or L (new component or
   agent integration) and create only proportionate artifacts.
2. Cite accepted requirements and governing ADRs.
3. For M and L, record one focused task with expected files, negative scope,
   and verification.
4. For a new component, land the observable walking skeleton first.
5. Add acceptance evidence before implementation where the risk warrants it.
6. Run `make verify`, read the complete diff, and obtain independent review
   for M and L.
7. Land code, tests, docs, and the closed task record in one commit.

Docs before commit: every commit updates, in the same commit, the *Unreleased*
section of `RELEASE_NOTES.md` (create it if missing; it becomes the next
version's notes) and the one doc that owns each fact it changes; elsewhere
link, never copy. Owners: `README.md` for the feature list and the directory
disclosures (network, account, telemetry, files outside the vault, external
CLI); the accepted designs in `docs/current/design/` for mechanisms (one
per area; DES-001 holds the overview and file map); `docs/current/SECURITY.md`
for the threat model and capabilities (consent, what is stored where, what each
mode skips); `LEGAL.md`, `DEVELOPMENT.md`, `COMPARISON.md` for licensing, build
and release steps, and dated competitor facts.

Never add a dependency, framework, external service, storage format, public
contract, or load-bearing structural decision without an accepted ADR.

## 4. Design rules

Every design and every code change follows these:

1. **One component, one job.** A component does one thing well. If its job
   needs "and" to describe, split it into several components.
2. **No duplicated code.** When logic appears a second time, extract it to a
   shared function or module, scoped to its callers.
3. **Mature library before new code.** Adopt one through an ADR once it
   passes the constitution's dependency screen; a runtime library ships
   bundled (ADR-007).
4. **Logic testable in plain Node.** Logic lives in modules without
   `obsidian` imports; Obsidian-bound files stay thin.
5. **Plugin conventions.** Tabs; DOM text via `createEl`/`setText`; styles
   from `--ai-agent-panel-*` tokens, Obsidian variables only as ADR-017 lists;
   sentence-case UI; spawn `shell: false`, array args (one exception, the
   `claude.cmd` shim: `docs/current/SECURITY.md`). More: `CONTRIBUTING.md`.

## 5. ADR process

Follow `docs/current/adr/ADR-000-adr-process.md`: draft in `docs/work/adr/`,
rewrite accepted ADRs in place, and retire a number rather than reuse it. Keep
`docs/current/adr/README.md` current. Every ADR compares at least two options
honestly and is accepted before implementation.

## 6. Task workflow

M and L work uses `.agentic/templates/task.md`; active tasks live in
`docs/work/tasks/<rNN-slug>/`, task numbers are monotonic repository-wide, and
a code-landing task is one commit with a `Task: NNN` trailer. Humans control
phase approvals, pushes, and merges. File names lead with the ID (`TASK-048-`).

Commit each requested feature or fix as its own commit once `make verify`
passes. Do not batch unrelated changes; stage only the files that belong to
the change, never unrelated work in the tree.

Commit messages follow Conventional Commits:

- `type(scope)!: description`, then a blank line, a body, and trailers. Types:
  `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`,
  `style`, `revert`. Scope is optional.
- `fix` and `perf` bump patch, `feat` bumps minor, `!` plus a
  `BREAKING CHANGE:` footer bumps major; other types do not bump.
- Release tooling trusts the type. A change that is both `feat` and `fix` is
  two commits; an unclear type or breaking status is asked, not guessed.
  Renames, moves, and formatting are `refactor` or `style`.
- Description: imperative, lowercase after the colon, no trailing period,
  whole subject under 72 characters, stating the behavior change.
- Body: the why and any rejected alternative, never a restatement of the diff.
  References such as `Task: NNN` and `Fixes #123` go in trailers.

Releases follow the Obsidian convention, not `vX.Y.Z` tags:

- The tag equals `version` in `manifest.json`, with no `v` prefix (`0.5.0`;
  `.npmrc` sets `tag-version-prefix=""`). Tag locally; a human pushes.
- Bump only with `npm version <patch|minor|major>`: `version-bump.mjs` syncs
  `manifest.json` and `versions.json`, then npm commits (subject: the bare
  version, the one non-Conventional subject) and tags. Commit the titled
  *Unreleased* notes first; steps in `docs/current/DEVELOPMENT.md`.
- A pushed tag runs `release.yml`: build, attest, draft GitHub release with
  `main.js`, `manifest.json`, `styles.css`; a human publishes it.

## 7. Build and development

Node is pinned in `.nvmrc` (`nvm use`); CI reads the same file. `make help`
lists targets. `make verify` is the complete local and CI gate: Node version
check, `npm run build` (`tsc` type-check, esbuild bundle), governance and
document-layer checks, a whitespace check (`git diff --check`), ESLint with
`eslint-plugin-obsidianmd` (the community directory's rules), policy-script
tests, and `npm test`.

CI also runs `npm run audit` (shipped tree, needs the network). `npm run dev`
rebuilds on change. Testing in a vault and against a real CLI:
`docs/current/DEVELOPMENT.md`.

## 8. Testing

`npm test` runs plain `node --test`: `pretest` bundles the Obsidian-free
modules into `tests/.build/` with esbuild, and `tests/*.test.mjs` import from
there. A new testable module is added to `pretest` in `package.json`.
`tests/fake-cli.mjs` stands in for `claude` with no login, network, or tokens;
pick a scenario with `FAKE_CLI_SCENARIO`. Code that imports `obsidian` is
tested by hand in a vault.

Policy scripts require regression tests (`scripts/test_agentic_gates.py`).
Keep all tests deterministic and local. Name automated tests with requirement
IDs or record explicit manual evidence in `docs/records/verification/`.

## 9. Tech stack

| Area | Choice | Decision |
| --- | --- | --- |
| Language | TypeScript 6.0; `tsc` only type-checks | predates ADRs; `docs/current/DEVELOPMENT.md` |
| Bundle | esbuild to one CommonJS `main.js`; runtime libraries bundled after ADR-007's screen | ADR-007, ADR-014; `docs/current/design/DES-001-system-overview.md` |
| Agent interface | `claude` CLI over stdio stream-JSON; original client, no Agent SDK | ADR-001; `docs/current/design/DES-002-cli-client-and-session-lifecycle.md` |
| Host and toolchain | Obsidian desktop 1.8.7+; Node from `.nvmrc`; npm with `package-lock.json` | predates ADRs |
| Lint and tests | ESLint with `eslint-plugin-obsidianmd`; `node:test` | predates ADRs; `docs/current/DEVELOPMENT.md` |
| External services | none of the plugin's own; the CLI talks to Anthropic | `docs/current/SECURITY.md` |

## 10. What NOT to do

- Do not implement behavior before its required PRD/design/task gates.
- Do not cite a draft, research note, or record as governing, and do not add
  history to a current document.
- Do not vendor, copy, or bundle Anthropic code (`@anthropic-ai/claude-agent-sdk`,
  the `claude` binary); drive the CLI over its public stdio interface only.
- Do not give the plugin network requests, telemetry, or credential
  handling (constitution).
- Do not use `innerHTML`, `outerHTML`, `eval`, `Function`, or shell-string
  spawning.
- Do not add dependencies from memory; verify the registry, review lockfiles,
  and land no dependency or version the dependency screen has not passed.
- Do not weaken or bypass a failing gate to make a change pass.
- Do not edit protected governance without explicit human authorization.
- Do not read secrets or commit credentials, transcripts, or sensitive fixtures.
- Do not let shared repository configuration activate machine-local executable
  paths, credentials, or network endpoints; those go in
  `.claude/settings.local.json` (gitignored).
- Do not hand-type metrics or let an implementing agent be the only verifier.
- Do not run `npm version`, tag, push, merge, force-push, or rewrite shared
  history unless the human asks.

## 11. Known limitations

- Remote branch protection, required checks, secret scanning, and bot
  permissions cannot be proven from this checkout; verify them remotely.
- `make format` checks whitespace only, and coverage, dead-code,
  duplicate-code, and architecture gates are missing
  (`docs/current/open-decisions.md`).
- Code that imports `obsidian` has no automated tests.
- The protected-path hook runs in Claude Code only; for other agents the
  boundary is advisory, with CI and human review as the backstop.
- The `make` surface assumes a POSIX shell (WSL or Linux locally, Ubuntu CI).
