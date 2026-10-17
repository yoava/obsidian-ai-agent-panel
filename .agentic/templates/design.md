# DES-NNN — Title

**Status:** draft | accepted (YYYY-MM-DD)

## Requirements

List the accepted PRD IDs this design satisfies and any explicit manual
verification obligations.

## Context and constraints

Describe current architecture, trust boundaries, performance/availability
constraints, migration state, and decisions already fixed by ADRs. State what
research established here; link research as evidence, never as a base this
design amends.

## Proposed design

Describe components, responsibilities, data flow, contracts, persistence, and
failure handling. Prefer the smallest observable vertical slice.

## Architecture rules

State dependency directions and boundaries that will become executable build or
lint rules. A diagram without an enforceable boundary is explanatory only.

## Data and security

Describe data classification, retention, deletion, credentials, network
communication, untrusted inputs, and least-privilege controls.

## Rollout and rollback

Describe compatibility, migration, feature flags, observability, rollback, and
the point at which rollback stops being safe.

## Alternatives

Reference ADRs and record material alternatives not already covered there.

## Verification

Map each requirement to automated, mutation/holdout, or manual evidence. Name
the independent verification boundary.

## Open questions

List unresolved decisions. The design cannot be accepted while a load-bearing
question is silently assumed.
