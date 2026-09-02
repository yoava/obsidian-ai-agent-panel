# Development

## Prerequisites

- Node.js ≥ 18 (developed on 22)
- npm
- Claude Code 2.x installed and logged in (for manual testing)

## Setup & build

```bash
npm ci
npm run dev     # esbuild watch mode → main.js with inline sourcemaps
npm run build   # tsc type-check + production build
npm run lint    # eslint + eslint-plugin-obsidianmd (the directory reviewer's own rules)
```

The build bundles `src/main.ts` into a single CommonJS `main.js`. Node
builtins, `obsidian`, and `electron` stay external; there are **no runtime
dependencies**.

`tsc` only type-checks (`-noEmit`) - esbuild produces the bundle - so a
TypeScript version change cannot change the shipped output. Note that
`tsconfig.json` names `"types": ["node"]` explicitly: without that line every
`process` and `node:*` reference fails to resolve under a TypeScript that does
not include `@types/*` implicitly. `@types/node` deliberately tracks the major
that CI runs on (Node 22), not the newest published.

## Linting

`npm run lint` runs [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin-obsidianmd),
the same rule set the community-directory review runs against a submitted
release, so directory findings are reproducible locally and CI fails on a
regression. `eslint.config.mjs` ignores the build output, the bundled test
build, and `graphify-out/`.

The devDependency is pinned to `typescript@^5.9` **for the linter's sake**:
typescript-eslint's type-aware rules crash under TypeScript 7
(`TypeError: Cannot read properties of undefined (reading 'Intrinsic')` inside
`ts-api-utils`). Since `tsc` is only a type-checker here, this has no effect on
`main.js` - the released bundle still reproduces byte-for-byte.

## Testing in a vault

Copy (or symlink) the plugin into a vault and enable it:

```bash
VAULT=/path/to/vault
mkdir -p "$VAULT/.obsidian/plugins/ai-agent-panel"
cp manifest.json main.js styles.css "$VAULT/.obsidian/plugins/ai-agent-panel/"
```

Reload Obsidian (Ctrl/Cmd-R) after each rebuild, or use the
[Hot Reload](https://github.com/pjeby/hot-reload) plugin during development.

## Automated tests

```bash
npm test
```

Plain Node (`node --test`), no framework. The `pretest` step esbuild-bundles the
Obsidian-free modules into `tests/.build/` and the specs import from there:

| spec | covers |
|---|---|
| `tests/diff.test.mjs` | `src/diff.ts` - line and word diffing, context collapsing, the size fallbacks |
| `tests/edits.test.mjs` | `src/edits.ts` - Edit/Write/MultiEdit projection, path resolution |
| `tests/bash.test.mjs` | `src/bash.ts` - shell invocation shape, capture, timeout, output caps |
| `tests/checkpoints.test.mjs` | `src/checkpoints.ts` - snapshot semantics, pruning, restore plans, id safety |
| `tests/tabs-layout.test.mjs` | `src/tabs-layout.ts` - side-column clamp, the "auto" threshold and its hysteresis |
| `tests/conversation-list.test.mjs` | `src/conversation-list.ts` - column sections, sort orders, date buckets, filter |
| `tests/mcp.test.mjs` | `src/mcp/server.ts` + `src/mcp/query.ts` - the handshake as a real CLI performs it, and the search grammar |
| `tests/protocol.test.mjs` | `src/protocol/client.ts` end to end against `tests/fake-cli.mjs` |

`tests/fake-cli.mjs` is a stand-in for the `claude` binary that speaks just
enough of the stream-JSON protocol to exercise the client - spawn flags, NDJSON
framing across chunk boundaries, the `initialize` handshake, permission
allow/deny/cancel, `mcp_message` routing, unsupported control requests, and a
crash with stderr. It
needs no login and makes no network calls. Pick a scenario with the
`FAKE_CLI_SCENARIO` environment variable; it reports what it saw as
`system/probe` messages so a test can assert on the client's own side of the
conversation.

Anything that imports `obsidian` is not unit-tested - test those in a vault.

## Testing the protocol client against the real CLI

`src/protocol/client.ts` has no Obsidian imports, so it can also be pointed at a
real CLI:

```bash
npx esbuild src/protocol/client.ts --bundle --platform=node --format=esm \
    --outfile=/tmp/client.mjs
```

Then import `ClaudeClient` from that bundle in a scratch script. This is the
quickest way to exercise the protocol end to end: init handshake, streamed text
deltas, permission allow (file created), permission deny (file not created), and
multi-turn memory within one process. Note that anything driving a real turn
spends real tokens.

## Release process

1. Update `package.json` version, then `npm version <patch|minor|major>` -
   the `version` script syncs `manifest.json` and `versions.json`.
2. Update `docs/RELEASE_NOTES.md`.
3. Tag and push: `git push && git push --tags`.
4. The `release.yml` workflow builds and attaches `main.js`, `manifest.json`,
   and `styles.css` to a draft GitHub release - review and publish it.

For Obsidian community-plugin submission requirements, see the
[developer docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## Knowledge graph (graphify)

The graphify skill is checked in under `.claude/skills/graphify/`, so any agent
working in this repo picks it up without a separate install. It builds a
queryable graph of the codebase:

```sh
graphify .                      # full build - writes graphify-out/
graphify update .               # incremental refresh after code changes (AST only, no API calls)
graphify query "<question>"     # scoped subgraph instead of grepping the tree
```

`graphify-out/` is generated and gitignored - build it locally rather than
expecting it in a clone. `.gitattributes` declares a `merge=graphify` driver
for `graphify-out/graph.json`, which only matters if that directory is ever
tracked. Nothing needs configuring to work on this repo: the driver is not
defined in any shipped config, and git falls back to its normal merge when an
attribute names a driver the clone does not have.

## Conventions

- Tabs for indentation (Obsidian sample-plugin convention).
- All DOM text via Obsidian helpers (`createEl`, `setText`) - never `innerHTML`.
- Colors and spacing in `styles.css` come from Obsidian CSS variables only.
