# ADR-014 — Build, lint and test toolchain

**Status:** accepted (2026-10-10)

## Context

- Obsidian loads one CommonJS `main.js`; release builds and their
  reproducibility are ADR-015's.
- The community-directory review runs `eslint-plugin-obsidianmd` on
  submissions.
- Tests must run without Obsidian, a CLI login or model calls; the `obsidian`
  module exists only inside the app.
- Every dev dependency needs an accepted ADR: `esbuild`, `typescript`,
  `eslint`, `eslint-plugin-obsidianmd`, `obsidian` (typings), `@types/node`,
  `tslib`, and the `moment` override.
- `make verify` also needs GNU make and Python 3 (`Makefile`,
  `scripts/*.py`, standard library only); neither version is pinned.

## Options considered

### esbuild, tsc type-check only, directory lint rules, `node:test` (recommended)

- A TypeScript change cannot change `main.js`; directory findings reproduce
  locally; no test framework to maintain.
- Code that imports `obsidian` has no automated tests.

### tsc emits, a separate bundler packs

- One tool for checking and emitting.
- A compiler upgrade can change the shipped bundle.

### Vitest or Jest

- Mature runners with mocking, watch mode and coverage; could stub
  `obsidian`.
- A dev tree in the lockfile, where `node:test` ships with the pinned Node
  and adds none; coverage is open decision D-02.

### typescript-eslint without the directory's rules

- Fewer rules to satisfy.
- Directory findings show only on the submission page and can regress
  unnoticed.

## Decision

Why esbuild, a type-check-only tsc, the directory's rules and `node:test`:

- Over tsc emitting: `npm run build` runs `tsc -noEmit -skipLibCheck`, then
  esbuild (`package.json:8`), so a TypeScript upgrade can add type errors but
  cannot change `main.js`.
- Over Vitest or Jest: `node:test` ships with the Node `.nvmrc` pins
  (22.23.1) and adds no package; `npm view <package> dependencies` lists 13
  direct dependencies for vitest 5.0.3 and 4 for jest 30.5.2.
- Over typescript-eslint alone: Obsidian says "Use our eslint plugin to
  check your Obsidian plugin against the official developer guidelines
  locally" and "Each new version is scanned, and if it fails to pass review,
  the plugin is removed from search within 24 hours" (Obsidian blog, *The
  future of plugins*); `eslint.config.mjs:6` applies its recommended config.

The design:

- `esbuild.config.mjs` bundles `src/main.ts` into a CommonJS ES2022
  `main.js`; externals are `obsidian`, `electron`, CodeMirror, Lezer and every
  Node builtin from `node:module`, in both spellings. `npm run build` runs
  `tsc -noEmit -skipLibCheck`, then esbuild.
- `typescript` stays in the range typescript-eslint supports (`~6.0`);
  `@types/node` tracks Node 22, the major of Obsidian's Electron and of CI;
  `tslib` serves `importHelpers`; `moment` is overridden past an advisory
  (types only; the app supplies it at runtime).
- `obsidian` typings are pinned exactly in `package.json`, and Dependabot
  ignores `obsidian`; they move only when the owner moves the pin.
- `npm run lint`: eslint with `eslint-plugin-obsidianmd`; exceptions to its
  sentence-case rule sit in `eslint.config.mjs`, anchored to whole strings.
- `npm test`: `pretest` bundles the 14 Obsidian-free modules into
  `tests/.build/`; `node --test` runs the specs; `tests/fake-cli.mjs` stands
  in for `claude` with no login and no network.

## Consequences

- Logic worth testing has to live in Obsidian-free modules.
- Open risk: `src/view.ts` (permission flow, checkpoint wiring, link
  handling) is tested only by hand in a vault.
- The `obsidian` typings fall behind the app unless updated by hand.
- TypeScript 6.1 and later wait for typescript-eslint.
- A formatter and further gates (coverage, dead code) are open decisions
  (D-01, D-02 in `docs/current/open-decisions.md`).
- Open: `.markdownlint.jsonc` is a protected path, but nothing runs
  markdownlint.
