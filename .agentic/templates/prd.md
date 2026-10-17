# PRD-NNN — Title

**Status:** draft

## Problem

What hurts, for whom, why now, and what evidence supports the claim.

## Users and jobs

Who uses the product and what observable job they hire it to perform.

## Requirements

Stable IDs are never renumbered. Give each requirement one or more EARS
acceptance clauses with exactly one `shall` each.

- **PRD-NNN.R1** — Short name.
  - WHEN [trigger], the ai-agent-panel system shall [observable response].
  - IF [failure or edge condition], THEN the ai-agent-panel system shall
    [observable handling].
- **PRD-NNN.R2** — Invariant.
  - The ai-agent-panel system shall [always-observable behavior].
- **PRD-NNN.R3** — State or option.
  - WHILE [state], the ai-agent-panel system shall [observable response].
  - WHERE [feature is present], the ai-agent-panel system shall [observable
    response].

Every accepted ID must appear in an automated test name or an explicit manual
verification row before release close.

## Non-goals

List deliberate exclusions and one honest reason for each.

## Security and privacy

Describe sensitive data, trust boundaries, credentials, retention, export, and
deletion obligations.

## Failure and recovery

Describe invalid input, timeouts, retries, duplicates, interruption, partial
failure, degraded dependencies, and recovery.

## Open questions

Flag unknowns and `needs clarification` items. Resolve them before acceptance
or carry them explicitly into design.
