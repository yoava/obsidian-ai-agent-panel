# Verification — release/task

**Verifier:** independent session, person, or CI job
**Subject:** commit or pull-request SHA
**Date:** YYYY-MM-DD

## Scope

State requirements, threat/risk areas, and what the implementer could see.
Identify holdout evidence that was intentionally unavailable during
implementation.

## Evidence

| Requirement/risk | Evidence | Result | Notes |
| --- | --- | --- | --- |
| PRD-NNN.R1 | automated test name / command / manual procedure | pass/fail | details |

## Adversarial checks

- Invalid, duplicate, delayed, and partial inputs.
- Permission and trust-boundary violations.
- Dependency or network failure.
- Mutation/holdout result where risk-scaled.
- Rollback or retry behavior.

## Findings

List actionable findings with severity and exact evidence. “Looks good” is not
evidence.

## Disposition

Record `accepted`, `rework required`, or `blocked` and link the resolving task
or commit.
