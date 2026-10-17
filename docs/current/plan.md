# Plan - AI Agent Panel

Current roadmap and delivery state. Events Git cannot show go to
[the log](../records/log.md); what each version shipped is in
[the release notes](../../RELEASE_NOTES.md).

## Vision

An AI coding agent as a native Obsidian panel that works on the vault as a
vault, with real vault operations (backlink-safe renames, links, metadata
search, properties) instead of a folder of text files. It drives an agent CLI
the user already installed and logged in to, has no network, telemetry, or
credentials of its own, and runs nothing sensitive without the user's consent.

## Roadmap

| Horizon | Scope | Status |
| --- | --- | --- |
| 0.x | Claude Code integration: chat panel, permission cards with diffs, vault tools, conversation history and checkpoints, CLI profiles, panel commands | shipped; last published version 0.4.0 |
| 1.0 | The panel redesign, `/clear` in the conversation, the settings redesign and the release-review fixes; Claude Code only | in release |
| Later | Codex / ChatGPT (OpenAI) as a second agent beside Claude Code | planned, not started; an L change: PRD, ADRs (D-04), design, and a walking skeleton before feature work |

## Baseline documents

The product is specified in `docs/current/`: requirements PRD-001 to
PRD-005 (`product/`), decisions ADR-001 to ADR-019 (`adr/`, dated in its
index) and designs DES-001 to DES-007 (`design/`), each with its acceptance
date in its status line. They state intended behavior; the
panel redesign's change 001 is built to them. Where the code still differs,
the backlog below names the defect.

## Phases

Every change runs the lifecycle in proportion to its size: an S or M change
needs a commit or a task; an L change such as the second agent passes every
gate below.

| Phase | Scope | Gate | Status |
| --- | --- | --- | --- |
| 0 Foundation | Agent guide, constitution, templates, gates, CI calling `make verify`, remote controls | local and remote verify; deliberate control tests | closed locally 2026-10-10: gate green, lint fails on warnings, scaffold 2.1.0; D-01 and D-02 deferred past the redesign; remote controls verified outside this checkout |
| 1 Requirements | the second agent's PRD with EARS criteria | human PRD approval commit | planned |
| 2 Design | ADRs and design for the agent abstraction | human ADR/design approval | planned |
| 3 Plan | Dependency-ordered tasks, skeleton first | human plan approval commit | planned |
| 4 Build | Focused tasks with evidence and independent review | per-task acceptance | planned |
| 5 Ship | release branch fast-forwarded into `main` (no release PR), tag, human-published draft release | human fast-forward, push and publish | planned |
| 6 Learn | Derived metrics and release retro | release close | planned |

## Next changes

In order; each is its own change with its own tasks and commits:

1. **Pre-redesign fixes** (M changes): the confirmed defects below.
2. **Panel redesign** (L change; the canvas, spec and brief in
   `docs/work/research/redesign-canvas/`), in three changes:
   - Change 001, panel shell: ships with change 002 in 1.0.0, as built,
     pending the owner's confirmation. Phase 1 is done: the delta is
     incorporated into PRD-001, PRD-002, PRD-003 and PRD-005
     ([record](../records/changes/CHG-001-panel-redesign.md)). Phase 2 is partly
     done: [ADR-016](adr/ADR-016-panel-ui-architecture.md) and
     [ADR-017](adr/ADR-017-panel-css-and-forced-theme.md) and
     [DES-003](design/DES-003-panel-ui.md) are accepted. Phase 3: one task
     per DES-003 slice, 030 to 042, approved under the owner's go-ahead to
     build the whole redesign; the closed tasks are in
     `docs/records/tasks/r06-panel-redesign/`. Phase 4 is done: tasks 030 to 042 have landed, the last with
     headless-harness evidence for PRD-001.R28 and R29
     ([record](../records/verification/2026-10-12-r06-accessibility-and-performance-harness.md)).
     Owed before the release is cut: the DES-003 matrix, the R28 audit and
     the R29 profiles in Obsidian.
   - Change 002 (context events): approved and built (backlog below); it
     ships in 1.0.0 with change 001, pending the owner's confirmation. Change
     003 (agents and workflows): a draft in `docs/work/changes/`; it ships in
     the minor release after 1.0.0 (owner question O6).
   - Owner questions O1 to O6, with recommendations: in the change 001 record;
     O5 and O6 apply as recommended until the owner confirms them.
3. **Settings redesign and prompt color** (L change 016,
   [record](../records/changes/CHG-016-settings-redesign.md)): incorporated with
   ADR-019 and the ADR-017, DES-001, DES-002, DES-003 and DES-005 rewrites.
   Task 120 has landed; tasks 121 to 124 in
   `docs/work/tasks/r08-settings-redesign/` build the rest under the owner's
   instruction to run the whole cycle.
4. **Equal-width tabs and the open-tabs list** (M change 017,
   [record](../records/changes/CHG-017-equal-tabs-and-open-tabs-list.md)):
   incorporated; tasks 125 and 126 have landed.

## Backlog

- Obsidian community-directory listing: 0.3.4 was the review pass; the
  submission state is not recorded in this repository.
- Change 002 (context events), approved; its requirements are in the PRDs.
  All build tasks have landed: 088 to 109 (compaction markers, prompt cache,
  Branch's rewind, session ids and fresh-start records, compacting tint, fork
  base, /clear with Undo, held clear and Stop and clear, the Branch segment),
  the panel fixes 111 to 113 and 115, and the release-review fixes 116 and
  119. The owner's run against the real CLI and WSL is
  [recorded](../records/verification/2026-10-17-task-110-real-cli-clear-panel.md)
  (task 110), with the rows it did not reach. The workflow wording of Stop
  and clear waits for change 003. Task 118 (a settings restart losing a
  message sent mid-turn, as in 0.5.0) is deferred: a fix needs one send at a
  time, a PRD-001.R11 change.
- Confirmed defects, found while writing the baseline documents and verified
  against the code by independent review. Each requirement names the intended
  behavior.
  - Security and bounds:
    - PRD-004.R7: `obsidian_rename` can still create non-dot files that other
      tools load or run (`CLAUDE.md`, `AGENTS.md`, tool configs, executable
      extensions); decide which to refuse.
    - PRD-004.R7: `renameFile` on a case-insensitive file system can overwrite
      a note whose name differs only by case (`Notes/README.md` exists,
      target `notes/readme.md`); check for an existing file ignoring case.
    - PRD-003.R4: the launch-argument screen reads a short flag's first
      letter, so a bundled form (`-dr`) passes as `-d`; commander today reads
      `-dr` as `-d r`, no reserved flag is reached, so this is hardening.
    - DES-004 `!` escape: on native Windows the command line goes through
      `cmd.exe /d /s /c` (`src/bash.ts`); a `"` inside the command can end
      the quoted line early. Refuse or escape it, or document the bound.
    - PRD-001 images: a remote image whose URL is percent-encoded is fetched
      by Obsidian's renderer, not the plugin; confirm in a vault that the
      image rule (DES-003) holds for such a URL and record the evidence.
    - PRD-004.R7, PRD-002.R6: vault checks compare path spelling, so an
      approved edit or rename can reach a folder symlinked or junctioned out
      of the vault; resolve real paths before the check. Target 1.0.x, not a
      release blocker (owner, 2026-10-13).
  - Behavior:
    - PRD-002.R6, R14: under a WSL profile the CLI reports `/mnt/<drive>/...`
      paths, which `vaultRelativePath` (`src/edits.ts`) does not map, so edit
      cards, the change list and the restore dialog treat vault files as
      outside the vault.
    - PRD-001.R12: a slash command's local output
      (`<local-command-stdout>`, the result text of a turn with no assistant
      text) is not shown. Its echo never becomes the turn's rewind uuid:
      `src/state/stream.ts` returns before the uuid changes.
    - PRD-001.R25, R4: a message queued mid-turn (on CLI versions that queue
      rather than steer) is lost when a post-turn restart (effort, profile
      arguments, instructions, vault tools) stops the process at the turn's
      result (`ClaudeSession.setBusy`, `src/session.ts`); defer the restart
      until the CLI has settled after the turn's result.
  - Code gaps against the accepted designs (no user-visible defect yet):
    - Path segments are split twice, by `resolvePath` (`src/edits.ts`) and
      `pathSegments` (`src/mcp/paths.ts`), on purpose: a rename target passes
      `normalizePath`, so `\` separates on every platform there, but a CLI
      path only under a Windows vault root; and `fold` there matches more than
      a vault bound may (matching too much only refuses a rename, but would
      call an outside path inside). Share only an empty-and-`.` filter if a
      third caller appears.
    - Inline copies of the same plain-object check remain in `mcp/server`
      (two; moving them needs DES-001 A7, "imports nothing", relaxed as A5
      was), `local-store` and `settings-core` (`storedRecord`, which also
      drops prototype keys); move them to `src/json.ts` (design rule 2).
