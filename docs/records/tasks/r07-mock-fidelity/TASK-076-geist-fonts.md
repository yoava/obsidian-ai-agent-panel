---
status: closed
release: r07-mock-fidelity
number: 076
prd: PRD-001.R34
---

# TASK-076 — Bundle the Geist fonts

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size L (ADR-007: the project's first runtime dependencies). The panel draws in
the mock's Geist and Geist Mono, bundled in `main.js` and registered with
`FontFace` in each document that shows a panel root.

Governing: [ADR-017](../../../current/adr/ADR-017-panel-css-and-forced-theme.md)
Typography (Loading, Package, Families), its dependency screen and the
`tests/architecture.test.mjs` and `tests/state-fonts.test.mjs` paragraphs;
[ADR-007](../../../current/adr/ADR-007-runtime-dependencies.md);
[DES-001](../../../current/design/DES-001-system-overview.md) A11;
[DES-003](../../../current/design/DES-003-panel-ui.md) Token contract;
[PRD-001](../../../current/product/PRD-001-chat-panel-and-sessions.md) R34.

Acceptance:

1. `--ai-agent-panel-font-ui` and `-font-mono` are `"AI Agent Panel Geist",
   var(--font-interface)` and `"AI Agent Panel Geist Mono",
   var(--font-monospace)`; the composer, a reply and a code block compute to
   those families.
2. Each document that shows a panel root, the settings tab and plugin modals
   included, holds exactly two faces (`document.fonts`), added before `load()`;
   two roots in one document add once.
3. A root migrating to another window registers there; a closed pop-out's
   faces are deleted; unload deletes every remaining face; a load settling
   after disposal re-adds nothing and does not throw.
4. `main.js` inlines only the two latin variable `.woff2` files as `data:`
   URLs; no network request; `package.json` `dependencies` are exactly the two
   packages at 5.3.0.
5. `LEGAL.md` credits OFL-1.1 and the Geist Project Authors; the README
   discloses the fonts; DES-001 lists `fonts` and A11; `RELEASE_NOTES.md` has
   a New entry.

## Scope

Expected files:

- New: `src/state/fonts.ts` (registry), `src/fonts.ts` (wiring, imports the
  two files), `src/woff2.d.ts` (module type for the import),
  `tests/state-fonts.test.mjs`.
- Changed: `src/theme-scope.ts` (watch fonts per attached root; `window-close`
  and unload disposal), `styles.css` (two tokens), `esbuild.config.mjs`
  (`.woff2` dataurl loader), `package.json` (`pretest`; the dependencies are
  the owner's), `tests/architecture.test.mjs` (A11 admitted dependencies, the
  loader and package-input rule, `fonts` in layer 3, declaration files not
  walked as modules).
- Docs: DES-001, DES-003, `LEGAL.md`, `README.md`, `RELEASE_NOTES.md`.

Negative scope:

- No other font weight, italic or subset; no `@font-face` in `styles.css`.
- `package-lock.json` and the dependency versions are the owner's.
- No change to `tests/styles.test.mjs` or `eslint.config.mjs`.

## Plan

Registry first, with fake documents (`tests/state-fonts.test.mjs`); then the
wiring in `theme-scope` so every root (panel, settings rows, modals) goes
through one `attach`; then the loader, tokens and architecture test. Reuses
`HTMLElement.onWindowMigrated` as `ui/dom`'s `onOwnDocument` does.

Rejected: a generated `styles.css` and base64 `@font-face` in the sheet (ADR-017
Typography).

Verification: `make verify`; main.js growth; in the harness, the computed
families and `document.fonts` once per document.

## Run log

- The worktree started on `main`; switched to `chore/agentic-sdlc`.
- `fonts` imports no `obsidian` at runtime but is Obsidian-bound (element
  helpers), so it joins layer 3 and, for A12, `pretest` with the `.woff2` loader.
- A wildcard `declare module "*.woff2"` needs a `.d.ts` under `src/`; the
  architecture test's module walk skips declaration files.
- The harness's `build.mjs` has no `.woff2` loader and the hook blocked editing
  it; the harness rendering is left to the orchestrator.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes. Confirmed:
lifecycle, the single call site, the two extra architecture-test edits, and in
the harness the faces, families, pop-out, close, unload, about 4 ms per
document and +72.7 KB.

Findings and resolution:

1. Blocker (ADR-007 legal row): the OFL text and both copyright notices must
   ship in `main.js`. Resolved: `esbuild.config.mjs` builds the banner from the
   two packages' `LICENSE` files; `tests/bundle-licenses.test.mjs` builds
   `main.js` and asserts both files, whole, and both copyright lines;
   `LEGAL.md` says where the text ships.
2. ADR-007's protected prerequisites. `make verify` runs `npm test` (the new
   test and the metafile test), and `release.yml` runs `make verify` before
   attaching, so neither the Makefile nor `release.yml` needs a change. The
   Dependabot entry is protected: patch at `076-dependabot.patch` (worktree
   root, untracked) for the owner to apply. Two npm entries for one directory
   are not allowed, so the patch makes one weekly entry whose runtime packages
   sit outside the dev group and arrive one pull request each.
3. Docs: ADR-017 Loading cell and test paragraph, DES-001 `theme-scope` row,
   DEVELOPMENT.md and SECURITY.md no longer say "no runtime dependencies".
4. The `obsidian` 1.13.1 pin in `package.json` rides in this commit at the
   owner's instruction (staging part of the protected lockfile was refused).
5. Known, no action: the settings tab and the conversation-picker modal keep
   Obsidian's fonts.

## Outcome

accepted
