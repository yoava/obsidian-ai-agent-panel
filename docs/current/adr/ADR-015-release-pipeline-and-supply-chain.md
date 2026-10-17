# ADR-015 — Release pipeline and supply-chain controls

**Status:** accepted (2026-10-10)

## Context

- Obsidian installs `main.js`, `manifest.json` and `styles.css` from the
  GitHub release whose tag equals the manifest `version`, with no `v` prefix.
- `main.js` runs with full Node access in users' vaults; whoever can change
  it controls their machines.
- CI runs on pull requests, including from forks; workflow actions are
  third-party code running in jobs that hold tokens.
- The bundle has no runtime dependencies yet; ADR-007 admits screened ones.
- The constitution requires release assets to rebuild byte-for-byte from
  their tag.

## Options considered

### Attested tag build, draft release, SHA-pinned actions, least-privilege CI (recommended)

- Published bytes are tied to a workflow run and commit
  (`gh attestation verify`); a moved action tag cannot inject code.
- Pins need Dependabot to stay current; publishing is a manual step.

### Tag build with actions pinned by version tag, no attestation

- Less to maintain; readable workflow files.
- A moved tag runs arbitrary code in a job with `contents: write`; nothing
  ties the published bytes to source.

### Build locally and upload by hand

- No CI permissions involved.
- Nothing ties the bytes to source; a repository-write compromise could swap
  `main.js` unnoticed.

## Decision

Why the attested, pinned pipeline:

- Moved action tags are a real attack: the `tj-actions/changed-files` tags
  were repointed to a commit that printed CI secrets to logs
  (CVE-2025-30066). A full-SHA pin makes a moved tag inert.
- Attestation lets anyone check that published bytes came from this
  repository's workflow run and commit (`gh attestation verify`, GitHub
  *Artifact attestations*); a hand upload proves nothing.
- A draft release keeps a human between the build and every user's vault,
  since Obsidian installs the assets of the release whose tag equals the
  manifest version.
- The release job installs and runs the gate as CI does
  (`.github/workflows/release.yml:19-26`, `.github/workflows/ci.yml:16-23`):
  the `.nvmrc` Node, no lifecycle scripts while the job holds write tokens,
  and `make verify` before anything is attested, so a tag that fails the
  gate gets no attestation and no draft.

The design:

- Versioning: SemVer 0.x. The release notes' Unreleased section is titled
  with the version and committed first, since `npm version` refuses a dirty
  tree; `npm version` runs `version-bump.mjs` to sync `manifest.json` and
  `versions.json`, commits as `chore(release): <version>` (`.npmrc`
  `message`), so release tooling reads the one commit npm writes, and
  creates a bare tag (`.npmrc` `tag-version-prefix=""`).
- `release.yml` on a tag push (`.github/workflows/release.yml:3-5`), with
  `contents`, `id-token` and `attestations` write (`release.yml:7-12`):
  setup-node with `node-version-file: .nvmrc` (`release.yml:19-22`),
  `npm ci --ignore-scripts` (`release.yml:23-24`), `make verify`, which
  builds `main.js` (`release.yml:25-26`), attest `main.js`, `manifest.json`
  and `styles.css` with `actions/attest-build-provenance` (`release.yml:27-33`),
  and create a draft release with the same three assets (`release.yml:34-41`);
  a human publishes it. Only this workflow gets write permissions.
- `ci.yml` on pushes to `main` and on pull requests, with `contents: read`
  and the `.nvmrc` Node (`.github/workflows/ci.yml:3-19`):
  `npm ci --ignore-scripts`, `make verify`, then `npm audit --omit=dev`
  (`ci.yml:20-24`). The audit covers the shipped tree only, so a
  dev-only advisory does not fail contributor pull requests.
- Every action is pinned to a full commit SHA with a version comment
  (`release.yml:18-19`, `release.yml:28`). Dependabot: actions weekly; npm
  weekly, ranges included (runtime packages and `obsidian` are pinned
  exactly); dev-dependency minor and patch updates grouped, each runtime
  update and each major its own pull request, so a runtime update re-runs
  the dependency screen (ADR-007); `obsidian` ignored.
- GitHub CodeQL default setup, configured in repository settings with no
  workflow file, scans the code and workflows; it is an external service
  this pipeline relies on.
- Validation: before publishing a draft, a human runs
  `gh attestation verify` on the downloaded `main.js` and `styles.css`,
  confirms the tagged commit passed CI, and rebuilds from the tag with the
  `.nvmrc` Node to compare bytes. None of this is automated.

## Consequences

- Open risk: byte-for-byte reproducibility is claimed in the constitution
  and docs but checked by nothing; the attestation ties bytes to a run and
  commit, not to a clean build.
- CodeQL's configuration lives outside the checkout and changes without a
  commit.
- The draft release carries no notes; they live in the repository.
- npm majors never arrive automatically; they are taken deliberately.
- The release commit's message convention is an open decision (D-05 in
  `docs/current/open-decisions.md`).
