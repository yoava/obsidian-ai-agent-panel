# Contributing

Thanks for your interest! This is a small, focused plugin - contributions are
welcome.

## Getting started

```bash
npm ci
npm run dev
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full workflow and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Ground rules

- **No Anthropic code.** The repository is MIT; the CLI is driven purely over
  its public stdio interface. Don't vendor or copy from
  `@anthropic-ai/claude-agent-sdk` or the `claude` binary.
- **No new runtime dependencies** without prior discussion - the zero-dependency
  bundle is a feature.
- **Security first.** No `innerHTML`, no shell-string spawning, no credential
  handling. Model output goes through Obsidian's `MarkdownRenderer` or text
  nodes only.
- Follow Obsidian's [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
  (theme CSS variables, sentence-case UI text, no leaf detaching in
  `onunload`, …).
- Run `npm run build` (type-check included) before opening a PR.

## Reporting issues

Include Obsidian, plugin, and Claude Code versions (`claude --version`), your
OS (note WSL setups), and steps to reproduce. For suspected security issues
see [docs/SECURITY.md](docs/SECURITY.md) - please don't open public issues.
