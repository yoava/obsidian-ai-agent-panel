# Pull request

## Intent

Describe the accepted task and the smallest observable change.

## Traceability

- Requirements: PRD-NNN.R#
- ADRs/design:
- Task: NNN

## Evidence

- [ ] Acceptance evidence was written first where risk warranted it.
- [ ] `make verify` passes locally.
- [ ] Independent CI re-ran the complete gate.
- [ ] Independent reviewer findings are resolved.
- [ ] Requirement IDs map to automated tests or manual evidence.

## Risk and security

- Trust boundaries, credentials, untrusted input, or external communication:
- Dependency and lockfile changes (each new package and version passes the
  constitution's dependency screen):
- Data migration, retention, deletion, or compatibility:
- Failure, retry, and rollback behavior:

## Scope and documentation

- [ ] The full diff was read for overreach and generated artifacts.
- [ ] Each new component does one job, no logic is duplicated, and a mature
      library was sought before new code was written.
- [ ] Code, tests, current docs, ADR index, and the closed task record move
      together; current docs carry no history and commit bodies say why.
- [ ] The *Unreleased* release notes and the doc that owns each changed fact
      (README, a design, SECURITY, ...) cover the change; no fact is
      copied into a second doc.
- [ ] Commit subjects and the PR title follow Conventional Commits; breaking
      changes carry `!` and a `BREAKING CHANGE:` footer.
- [ ] Protected governance changed only with explicit human authorization.
- [ ] No secret, sensitive fixture, transcript, or machine-local configuration
      is included.

## Human gate

- [ ] A human reviewed the whole diff and controls merge.
