---
status: closed
release: r07-mock-fidelity
number: 072
prd: none
---

# TASK-072 — Release docs

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size M, documentation only. Make the README, the competitor comparison, the
legal review and the release notes current for the next release (not cut here).
The README owns the feature list and the disclosures; COMPARISON.md owns dated
competitor facts; LEGAL.md owns the Anthropic terms review.

Acceptance:

1. README.md states only claims traced below; every disclosure (network,
   account, telemetry, files outside the vault, external CLI) stays true and
   complete; the permission wording matches SECURITY.md; the turn glyph is the
   panel's agent mark; the badges, Codex line (ADR-012) and Sponsors line stay.
2. Every competitor fact in COMPARISON.md carries a date; facts not
   re-verified keep 2026-09-01.
3. LEGAL.md is dated 2026-10-13, quotes the current legal-and-compliance
   wording, and says the plugin meets the technical conditions while the
   clause's applicability is the reading above.
4. No "Claude mark" remains in `docs/current/` or the README.
5. RELEASE_NOTES.md *Unreleased* covers every user-visible change since 0.5.0
   (phase 2).

## Scope

Expected: `README.md`, `docs/current/COMPARISON.md`, `docs/current/LEGAL.md`,
`docs/current/design/DES-001-system-overview.md`,
`docs/current/design/DES-003-panel-ui.md`, `RELEASE_NOTES.md` (phase 2), this
record.

Negative: no code, CSS, tests, ADR, PRD, SECURITY.md, protected paths or
`docs/records/` edits; no version bump, tag or push.

## Plan

Rewrite the README from the drafter's draft; resolve each unverified claim
against `src/` and `docs/current/`, dropping what cannot be verified. Fetch the
Anthropic page for LEGAL.md. Run `make verify`. Release notes last, after
rebasing onto the then-current base.

## Run log

README claim trace (README section: claim: source):

- Intro, Requirements: Claude Code CLI, vault as working directory: `src/protocol/client.ts`, DES-002. Obsidian 1.8.7+, desktop only, mobile unsupported: `manifest.json`. Vault tools need 2.1.210+: `src/settings.ts:646`, DES-006. Local file system vault: PRD-001.
- Intro, trademarks, Codex planned for 1.0 only: LEGAL.md, ADR-012, AGENTS.md section 1.
- Stream-JSON mode counted differently, `ANTHROPIC_API_KEY` bills that key: LEGAL.md (Authentication), PRD-001.R5, DES-002; sign-in article URL: link on the legal page, fetched 2026-10-13.
- Install: Community plugins listing: scratchpad research (community.obsidian.md, 2026-10-12), not re-fetched. BRAT: unchanged from the old README. Build steps: `package.json`, DEVELOPMENT.md. Attestation of `main.js` and `styles.css`: `.github/workflows/release.yml:30-32`.
- Use: ribbon icon, command names: `src/main.ts:90-125`. Active note chip, `@`, `/`: `src/ui/composer.ts`, PRD-001. Windows `claude.exe`/`claude.cmd`, WSL Detect, Run via WSL, Add CLI profile: `src/cli.ts:12-13,59`, `src/settings.ts` (Detect, Run via WSL, Add CLI profile).
- Conversation: streaming Markdown, thinking, step cards, subagent rows, background tasks with Stop: `src/ui/turn.ts`, `steps-card.ts`, `agent-row.ts`, `run-bar.ts`, DES-003. Agent mark rings while running: `src/ui/turn.ts` (head), DES-003. Duration, cost, copy, Restore files, Branch: `src/ui/turn.ts:684-700`. Tabs as Obsidian tabs, side column Pinned/Open/Recent, automatic by width, drag, pin, filter: `src/ui/tab-strip.ts`, `conversation-column.ts:263-275`, `state/layout.ts:9-11`, `settings.ts` (TAB_POSITION_LABELS). Queue or steer, Esc or Stop: PRD-001, `src/state/composer.ts`. Status line segments: `src/ui/status-line.ts`, `state/status-line.ts`. Context items, images 8 x 4 MB: `src/attachments.ts:20-22`, `src/context-builder.ts`. `!` shell: `src/tab/shell-escape.ts` ("Add output to chat"). Info commands as cards at no token cost: `src/tab/panel-commands.ts`, DES-003. Per-profile Chrome, sandbox, arguments: `src/settings.ts:1223-1266`, SECURITY.md.
- Prompts: styles and Pop-out default, pin, rail: `src/settings-core.ts` (DEFAULT_SETTINGS), `src/settings.ts:794-851`. Numbering and rail only in Pop-out and Quiet: DES-003, release notes. Starters and their conditions: `src/state/prompts.ts:185-198`. Vault instructions and CLAUDE.md: `src/settings.ts:718`, PRD-001.
- Permissions: card wording, allow rules, sandbox auto-allow: SECURITY.md (Model, Profile launch options). Edit card diff and Rendered: `src/ui/permission-card.ts`, `diffview.ts`. Modes and bypass hidden: `src/settings-core.ts` (MODE_TABLE, offeredModes). `AskUserQuestion` form: `src/ui/question-form.ts`.
- Vault tools: six tools and what they do: `src/mcp/vault-tools.ts`, PRD-004, DES-006; asks permission, can be switched off: `src/settings.ts` (enableObsidianMcp).
- History and export: local history, resume: `src/history.ts`, PRD-003. Restore and Branch: `src/restore.ts`, `src/tab/restore-branch.ts`, SECURITY.md. Export options: `src/settings.ts:961-1018`.
- Settings: Theme Auto/Light/Dark (stored `match`): `src/settings-core.ts:391`. Show tooltips: `src/settings.ts:782`. Transcript heading holds prompt style, pin, rail: `src/settings.ts:794`. Device-only list: `src/settings-core.ts` (SYNC_UNITS, defaultLocal).
- What runs on your machine and Disclosures: SECURITY.md (four capabilities, Model). 1500-character results: `src/state/step-groups.ts:34` (RESULT_CHARS), PRD-001.R16; the `!` record limit is separate (`src/tab/shell-escape.ts:8`). File checkpoints: `src/protocol/client.ts:137,187`, SECURITY.md. Read-only tools without a card, remote images not fetched, Obsidian Sync and the history folder, uninstall deletes the folder: SECURITY.md. Defaults: `src/settings-core.ts` (enableBashMode, enableObsidianMcp, defaultPermissionMode). Reaching other hosts: SECURITY.md (Chrome, web access, shell).

Dropped or not verified:

- "Claude Code 2.x": no minimum is enforced or documented; only 2.1.210 (vault tools) and 2.1.292 (verification) appear.
- Metering: reduced to "may count such sessions differently"; LEGAL.md holds the detail.
- Dropped from the README, still owned elsewhere: `/clear` opens a new conversation, `/usage-credits` and `/extra-usage` cards (DES-003, PRD-005); Restore caveats (subagent edits, shell commands, vault-tool writes not restored; deletes created files outright) (SECURITY.md); images are not saved in history (PRD-003); reproducible-build line (DEVELOPMENT.md); the old Auto-approve warning, folded into the Risk bullet; compound-command ask-rule caveat and Auto-approve reopen confirmation (SECURITY.md, PRD-002); 8,000-character selection and 40-item list limits (`src/context-format.ts:10,12`, PRD-001); Obsidian 1.13 settings search; link-click behaviour; Other-files-dropped notice; "How it works" and Development quick start (DES-002, DEVELOPMENT.md).
- COMPARISON.md: figures from the 2026-10-12 research. Not re-verified: Obsidian CLI release date (1.12), Claudian and Copilot ranks, Flint, Agent MCP, Codex Panel tools, cells dated 2026-09-01. The unsourced long-tail names (Codian, KatmerCode, Lodestone, Any AI CLI, Oh My Claudian, Buildian) and "more than thirty plugins" were cut. "No Skills UI" dropped (`/skills` renders a card); "no turn-complete notification" verified (no notification code in `src/`).
- LEGAL.md: only the legal-and-compliance page was re-checked (2026-10-13); other sources keep their 2026-09-01/02 dates.

Release notes (item 5): *Unreleased* rewritten as New / Changed / Fixed from the 141 commits between the 0.5.0 tag and the base. Entries that built one feature are merged (tabs, status line, prompts, report cards, tooltips, security settings, vault tools, conversation files, exports). Facts of the earlier entries are kept unless superseded: tabs drawn as Obsidian tabs, *Messages* now *Transcript*, "Claude mark" now the agent mark, the 070 and 071 wording.

Commits since 0.5.0 with no user-visible entry, and why:

- Governance and planning documents only (`docs(adr)`, `docs(product)`, `docs(design)`, `docs(plan)`, `docs(constitution)`, `docs(changes)`, `docs(records)`, `docs(research)`, `docs(security)`, `docs(prd)` and plain `docs`: the ADR, PRD and DES drafting and acceptance commits, the plan and decision-sheet commits, 5e19558, be4b7d7, 1399e3e, 4071123, 4d4c6e3, c374a87, 06c5168, c283d80, fd66ac5, f0f51f5, 2a2223c, e32a0c5): they change no shipped behavior; the effect of each is in its feature entry.
- Layout moves: 73f86a9, 4adae33 (repository layout, not behavior).
- Scaffold, gates and CI: 747cc3c, 960a6e5, 1b1a0d9, 996bad9, f31b977 (release workflow runs the gate), dea4e6b (lint fails on warnings), 85cb4ba (whitespace check skips the canvas mirror): contributor and release tooling.
- Internal refactors with no behavior change: a6fbdeb (tool labels module), 90fa5dd (export module), 784e020 (shared JSON guard).
- Evidence and research: 4a44b11 (harness evidence), aab6e40, 014a3b3, 2cebf76 (redesign canvas mirror), a415db5, efd2aed, 2252fdb: not shipped.

## Independent review

Reviewer: independent review agent. Verdict: approve with changes.

Findings and resolutions:

1. File-checkpoint disclosure missing from the README: added (the panel turns checkpoints on, files outside the vault included, kept until Claude Code's cleanup).
2. Numbering and the jump rail apply to Quiet and Pop-out only; starters depend on a note and a selection: fixed.
3. Attestation covers `main.js` and `styles.css`, not `manifest.json`: fixed.
4. Risk bullet lacked Auto-approve and Bypass, defaults lacked the default permission mode: added.
5. Network bullet lacked other hosts reached with approval: added.
6. Duplicates in the README and filler in COMPARISON: removed.
7. LEGAL.md re-dated everything: now only the legal-and-compliance page is dated 2026-10-13, the condition sentence is reworded, the em dash is restored.
8. COMPARISON dating gaps (CLI paragraph, note on undated cells, new facts, long tail): dated or cut. At release-notes time the Agent MCP, Flint and Codex Panel tools cells got explicit 2026-09-01 dates so the undated-cells rule cannot cover them.
9. Claim trace and dropped list incomplete, 1500-character source wrong: completed and corrected.

Second round (release notes at 0e97da7): changes needed, all applied.

1. False statements fixed: the tab close button shows on hover only; the setting is *Show plan usage* and a click opens the *Plan usage* popover (no usage dialog); a pin shows at once and only the save waits for the first message.
2. Lost facts restored: prompt labels break at a word and end with "…"; `/mcp` buttons fit 300 px; a property that cannot be written no longer fails the send and a split emoji is left out; the pinned prompt keeps its whole head; status icons are muted except the model's; a done step shows no check; the 4000-row cut is a plain row; a conversation whose profile this device lacks takes a pick until its session starts.
3. Wording: "Messages to Transcript" history removed; numbering and "You" only in Pop-out and Quiet; "the redesign's" replaced by plain wording; Restore's subagent caveat stated once.
4. Grouping: bugs in features new in this release folded into those features' entries; real fixes moved from Changed to Fixed (`/mcp` order, Enter, `/clear`, permission control, `/` messages, images, cost, Auto-approve, Bypass, `obsidian_rename`); the Restore rewrite is under Changed.
5. README: `claude.cmd` refusal and Auto-approve escalation wording; COMPARISON landscape table ordered by downloads with "not recorded" and "unlisted" last.

## Outcome

accepted
