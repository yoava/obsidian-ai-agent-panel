# Constitution - AI Agent Panel

These non-negotiables are checked at every phase gate. Changes to this file are
a human decision, never an autonomous agent edit. Evidence and detail:
[SECURITY.md](SECURITY.md) and the accepted designs in [design/](design/).

## Product

- The product shall remain honest about what it does, what it cannot verify,
  and the provenance of material outputs; the README's disclosures match the
  code.
- User-visible state changes shall be deterministic or explicitly explain why
  they are not.
- Failure and recovery behavior shall be observable and safe to retry where
  the domain permits it.
- **No network of its own.** The plugin makes no HTTP request, opens no
  socket, and listens on no port. Model traffic and every authenticated call,
  plan usage included, belong to the CLI, asked for over the stdio pipe the
  plugin owns. The in-process `obsidian` MCP server writes no config file and
  spawns no process.
- **No telemetry.** The plugin collects nothing and the maintainer receives
  nothing.
- **No credentials.** The plugin implements no login, stores no API key or
  token, and never reads the CLI's credential file or the OS keychain.
  `data.json` holds settings only.
- **Consent first.** In the default permission mode every call the CLI
  submits for approval (file edit, shell command, web access, vault tool)
  shows an Allow/Deny card before it runs; the CLI's own deny and ask rules
  and hooks run first and are never overridden. *Bypass permissions* stays
  hidden until enabled in settings; *Auto-approve everything* still shows a
  card for a call the CLI's rules or hooks flag, and both modes are marked in
  red while active.
- **No injectable command lines.** Processes are spawned with `shell: false`
  and array arguments wherever the platform allows. The only shell paths are
  the three in [SECURITY.md](SECURITY.md); nothing model-controlled enters a
  command line, and the `!` escape runs only from the user's own keystrokes.
- **Bounded file access.** Outside the vault the plugin only probes CLI install
  paths it composes itself and runs `which`/`where`; it writes nothing there.
  Inside the vault it writes only its plugin folder (`data.json`, `history/`),
  transcript exports when enabled, and vault-tool changes through Obsidian's
  APIs after approval. A confirmed *Restore files* asks the CLI to rewind the
  files its own checkpoints track, inside or outside the vault, after a
  preview has named each of them; the plugin itself writes nothing outside the
  vault. Stored ids and paths are validated so a tampered or synced file
  cannot steer a write or delete elsewhere. Vault bounds are checked on the
  path as spelled, so a folder symlinked or junctioned into the vault counts
  as inside it ([SECURITY.md](SECURITY.md)).
- **Inert rendering.** Model output reaches the DOM only through Obsidian's
  `MarkdownRenderer` or text nodes. Before rendering or export, inline code
  and every fence not on the plugin's allowlist are neutralized so no other
  plugin's processor runs on model text, and no remote image or other remote
  embed is loaded; an embed of a vault note renders as Obsidian renders the
  note ([SECURITY.md](SECURITY.md)); no `innerHTML`, `outerHTML`, `eval`, or
  `Function`.
- **Bundled libraries only; no Anthropic code.** A runtime library ships
  inside `main.js` or `styles.css`, never fetched at runtime, once it passes
  the dependency screen (Security) and ADR-007; bundled code obeys every rule
  above. No Anthropic code is bundled, vendored, or copied; the repository
  stays MIT.
- **Desktop only** (`isDesktopOnly: true`), within Obsidian's plugin guidelines
  and developer policies.
- **Device-local settings stay local.** CLI paths and profiles, the
  permission mode, bypass, the instructions suffix, the shell and vault-tool
  switches, and the list of local units are device-only by default and stay
  out of synced plugin data; a value read from a synced or stored file is
  validated before it can widen what the plugin does.
- **Verifiable releases.** Release assets (`main.js`, `manifest.json`,
  `styles.css`) are built by `release.yml`, carry a provenance attestation,
  and rebuild byte-for-byte from their tag.

## Quality

- `make verify` is the single complete gate and is mirrored in CI.
- Tests shall trace to accepted requirement IDs or explicit manual evidence.
- Risk-bearing logic shall receive changed-line coverage, mutation, or holdout
  evidence in proportion to the cost of a false green.
- A new component shall land as a reachable walking skeleton before feature
  logic, and dead code shall not accumulate.
- Each component shall do one thing well, logic shall not be duplicated, and a
  mature library shall be preferred over new code (`AGENTS.md` design rules).

## Security

- Building, testing, and CI need no secrets. CI uses only the workflow's
  automatic `GITHUB_TOKEN`: read-only in `ci.yml`; `release.yml` alone gets
  `contents`, `id-token`, and `attestations` write, on tag pushes.
- A local secret, if one is ever needed, lives outside the repository at
  `~/.config/ai-agent-panel/env`; only the location is documented here. The
  developer's Claude Code login stays in the CLI's own `~/.claude` and never
  enters the tree, a fixture, or a transcript.
- Workflow actions are pinned to full commit SHAs; Dependabot proposes pin
  updates as pull requests.
- Agent credentials are scoped below human credentials and never hold merge or
  bypass rights.
- Unsupervised automation shall never combine private-data access, untrusted
  content, and external communication.
- Dependencies and external services require an accepted ADR, registry
  verification, and human lockfile review.
- Every new dependency and every version change of one, with the packages it
  pulls in, passes the dependency screen before it lands, and a human accepts
  the result:
  - Mature: a stable release (1.0 or later, not a pre-release, not
    deprecated), actively maintained, widely adopted; the chosen version
    public for at least 7 days unless it fixes a known advisory.
  - Security review: no known advisory, registry signature or provenance
    verified where the ecosystem offers it, no unreviewed install script, and
    the added code read for network, credential, file and code-execution
    reach.
  - Risk analysis: per risk, impact and probability (1-5) and their product,
    inherent and residual; the highest score and the chance of any impact-4+
    event; the value lost by building it in-house instead.
  - Legal review: a permissive license (MIT, Apache-2.0, BSD-2-Clause,
    BSD-3-Clause, ISC, 0BSD) whose full text and copyright notices ship with
    anything distributed; never GPL, LGPL, AGPL or other copyleft,
    source-available, proprietary, or missing terms. Two exceptions, each
    accepted by a human: OFL-1.1 for font files, and MPL-2.0 in a dev-only
    tool that never ships.

  A version change re-runs the security and legal reviews every time, and the
  whole screen for a major version, a new transitive package, or a change of
  license or maintainer.
- Shared repository configuration shall not activate machine-local executable
  paths, credentials, or network endpoints without explicit local approval.

## Cost

- High-judgment models are reserved for requirements, architecture, subtle
  failures, and deep review; precisely described execution uses the standard
  implementation model; mechanical work uses the least expensive adequate
  model.
- Each task starts in a fresh context and loads only relevant artifacts.
- Cost and usage metrics are derived from machine evidence or marked
  unavailable, never reconstructed from memory.
- Budget: no metered spend. Development runs on the maintainer's Claude
  subscription; tests and CI make no model calls (`tests/fake-cli.mjs` stands
  in for the CLI) and use free public-repository Actions minutes.
- Escalation: anything that would spend metered API tokens or paid usage
  credits, including a test against a real CLI, needs human approval first. A
  task still failing after two diagnosed hypotheses goes to a stronger model or
  to the human.

## Protected paths

Agents never edit these paths without explicit human authorization:

- `docs/current/constitution.md`
- `docs/current/adr/ADR-000-adr-process.md`
- `.agentic/`
- `Makefile`
- `scripts/` (except `scripts/README.md`)
- `.claude/settings.json`
- `.github/workflows/` and `.github/dependabot.yml`
- `.markdownlint.jsonc`, `eslint.config.mjs`, `tsconfig.json`
- `.nvmrc`, `.npmrc`, `package-lock.json`, `version-bump.mjs`
- `LICENSE`
- Architecture and dependency-policy files added by accepted ADRs
- Metrics ledgers and holdout evidence

The Claude Code PreToolUse hook blocks file-tool edits to these paths and asks
before any file-tool edit to `docs/current/adr/` or `package.json`. Shell
permissions remain a separate boundary; the hook does not parse arbitrary
shell writes. Other agents must map the boundary to their sandbox or tool
policy. CI and human review remain the independent backstop.
