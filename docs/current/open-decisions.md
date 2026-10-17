# Open decisions

Unresolved questions only. Remove a row in the commit that accepts the ADR or
design answering it.

| ID | Decision needed | Needed by | Proposal |
| --- | --- | --- | --- |
| D-01 | Code formatter: Prettier, Biome, or none; until then `make format` checks whitespace only | after the panel redesign (deferred by the owner 2026-10-10) | ADR comparing Prettier and Biome against the tabs convention; one reformat commit on its own, after the redesign's CSS and view rewrites land |
| D-02 | Remaining TypeScript-profile gates: coverage, dead code, duplicate code | after the panel redesign (deferred by the owner 2026-10-10) | `node --test` coverage (no new dependency), knip and jscpd each through an ADR |
| D-04 | Agent abstraction for a second CLI (Codex) | the second agent's design, after 1.0 | PRD first, then an ADR on the session/protocol boundary |
| D-06 | Whether to accept that a written conversation file chooses which of this device's CLI profiles, executable and arguments included, its reopen runs on (DES-005 risks, SECURITY.md) | release `r05-pre-redesign-fixes` | Accept: it can name only a profile the device already has |
