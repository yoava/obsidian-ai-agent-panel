# CLAUDE.md

Obsidian plugin: a Claude Code chat panel inside the vault (unofficial integration with Anthropic's Claude Code CLI).

## Workflow

- Commit each requested feature or fix as its own commit once it builds (`npm run build`). Don't batch unrelated changes together, and don't sweep unrelated in-progress work from the working tree into the commit - stage only the files belonging to the change.
- **Docs before commit.** Before every commit, update the docs to cover the change and include them in the same commit: the feature list in `README.md`, the *Unreleased* section of `docs/RELEASE_NOTES.md` (create it if missing - it becomes the next version's notes), `docs/ARCHITECTURE.md` when structure or data flows change, and `docs/SECURITY.md` when anything security-relevant changes (network calls, credentials, file writes, permissions).

## Releases

- Tag each release locally in git. The tag name must exactly match the `version` in manifest.json - no "v" prefix (Obsidian plugin convention), e.g. `0.1.0`.
- Version bumps go through `npm version <patch|minor|major>`, which runs version-bump.mjs to sync manifest.json and versions.json, commits, and creates the release tag. `.npmrc` sets `tag-version-prefix=""` so the tag comes out bare (`0.1.1`, not `v0.1.1`).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
