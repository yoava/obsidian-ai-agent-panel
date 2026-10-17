# ADR-000 — ADR process

**Status:** accepted (2026-10-07)

## Context

Architectural and technology decisions need a durable record of why.
Contributor guides say how to work, the plan says what is next, and the
constitution says what is non-negotiable. ADRs preserve decision reasoning.
Agents load decisions into context, so a decision file must give one answer to
its question.

## Options considered

### Rewrite decisions in place; Git holds their history (recommended)

- Each question has one governing answer that agents and reviewers read
  directly.
- Why a decision changed needs `git log`, not a scroll.

### Immutable records with amendments and supersession

- Each file preserves what was believed when it was written.
- Readers reconcile amendment chains and superseded files to find the current
  answer, and agents load the losers alongside it.

## Decision

Rewriting in place wins because agents load every decision file they find, so
an amended or superseded record competes with the answer in force.

Write one ADR before implementation for every new dependency, framework,
external service, storage format, public contract, or load-bearing structural
decision. Draft it at `docs/work/adr/ADR-NNN-short-slug.md` from
`.agentic/templates/adr.md`. `make approve DOC=<path>` moves it into
`docs/current/adr/` and marks it accepted; committing that move is the human
approval.

`docs/current/adr/` holds only decisions in force. An ADR number names a
question, not a frozen text:

- When the answer changes, rewrite the ADR in place, move its Status date, and
  put why it changed in the commit body.
- Keep rejected options; they are current reasoning.
- When the old question no longer fits, retire the number: delete the file and
  list it under Retired in `docs/current/adr/README.md` with its replacement.
- Numbers are monotonic repository-wide and never reused.

Each ADR contains Status (`proposed`, or `accepted (YYYY-MM-DD)` once in
`docs/current/`), Context, Options considered (at least two, with honest pros
and cons), Decision, and Consequences. The option the author recommends
carries `(recommended)` in its heading, or `(recommended, with changes)` when
the Decision adapts it: at most one per ADR, exactly one once accepted. The
Decision opens with why it beats each other option, every reason backed by
evidence a reviewer can check (a cited source and what it says, `file:line`, a
command and its output, a measurement, a test); a claim without evidence is
marked `(inferred)`.

## Consequences

- Significant choices are reviewable before code depends on them.
- Human acceptance is the decision gate.
- Earlier wording and the reason it changed live in Git:
  `git log --follow -p <file>`.
- Small implementation details remain in code and task records; ADR ceremony is
  reserved for consequential choices.
