# Contributing

Thanks for your interest! This is a small, focused plugin - contributions are
welcome.

## Getting started

```bash
npm ci
npm run dev
```

See [docs/current/DEVELOPMENT.md](docs/current/DEVELOPMENT.md) for the full workflow and
[docs/current/design/DES-001-system-overview.md](docs/current/design/DES-001-system-overview.md) for how the pieces fit together.

## Ground rules

- **No Anthropic code.** The repository is MIT; the CLI is driven purely over
  its public stdio interface. Don't vendor or copy from
  `@anthropic-ai/claude-agent-sdk` or the `claude` binary.
- **Every new dependency and version passes the screen** in the
  [constitution](docs/current/constitution.md) (Security): mature,
  security-reviewed, risk-analyzed, and permissively licensed (MIT,
  Apache-2.0, BSD, ISC; never GPL). A runtime library also ships bundled
  ([ADR-007](docs/current/adr/ADR-007-runtime-dependencies.md)). Open an issue
  before proposing one.
- **Security first.** No `innerHTML`, no shell-string spawning, no credential
  handling. Model output goes through Obsidian's `MarkdownRenderer` or text
  nodes only.
- Follow Obsidian's [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
  (sentence-case UI text, no leaf detaching in
  `onunload`, …). Styles read the panel's `--ai-agent-panel-*` tokens, not
  Obsidian's variables: [AGENTS.md](AGENTS.md) §4 rule 5,
  [ADR-017](docs/current/adr/ADR-017-panel-css-and-forced-theme.md).
- Run `make verify` before opening a PR: it is the gate CI runs (build with
  type-check, lint, docs checks, tests). Commit, docs (each change adds a line to
  the *Unreleased* section of [RELEASE_NOTES.md](RELEASE_NOTES.md)), and release
  rules for humans and agents: [AGENTS.md](AGENTS.md).

## Reporting issues

Include Obsidian, plugin, and Claude Code versions (`claude --version`), your
OS (note WSL setups), and steps to reproduce. For suspected security issues
see [SECURITY.md](SECURITY.md) - please don't open public issues.
