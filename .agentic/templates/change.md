# CHG-NNN — Title

**Status:** draft

## Intent

Describe the brownfield behavior being changed, the evidence for changing it,
and the canonical PRD affected.

## ADDED requirements

- **PRD-NNN.RX** — New obligation.
  - WHEN [trigger], the system shall [observable response].

## MODIFIED requirements

- **PRD-NNN.RY** — Existing obligation.
  - Before: [accepted clause].
  - After: WHEN [trigger], the system shall [observable response].
  - Reason: [why semantics changed].

## REMOVED requirements

- **PRD-NNN.RZ** — Removed obligation.
  - Reason: [why removal is safe and approved].
  - Compatibility/cleanup: [migration and evidence].

## Design and migration impact

List ADRs, data or API compatibility, rollout, rollback, and documentation
changes.

## Incorporation

Approval folds these deltas into the canonical PRD in `docs/current/product/`
without renumbering unchanged requirements, and `make close DOC=<this file>`
moves this delta to `docs/records/changes/`, both in the approval commit. An
accepted requirement never lives outside the PRD.
