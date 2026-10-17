# Owner decisions, 2026-10-10

Research input for closing the governance baseline and starting the panel
redesign. Nothing here governs; the PRDs, ADRs and designs that absorb these
answers do, once approved. Step 1 of the plan reads this file.

How to answer: fill the **Decision** column. Empty means the recommendation.
Write `no` plus a line for anything else. **Blocking** rows stop Step 1 or
Step 2 until answered.

## A. Process

| ID | Question | Recommendation | Decision |
| --- | --- | --- | --- |
| A1 | Approve DES-001, 002, 004, 005, 006, 007 once rewritten as normative designs; DES-003's first accepted version is the redesign rewrite. | Yes. | yes |
| A2 | `docs/current/plan.md` says accepted designs replace `ARCHITECTURE.md`; AGENTS.md names `ARCHITECTURE.md` the owner of mechanisms. Which? | The designs replace it; AGENTS.md's owner table changes in the acceptance commit. | yes |
| A3 | Vocabulary: "transcript" stays the exported note; the on-screen list becomes "messages"; DES-003 is retitled "Panel UI". | Yes. | yes |
| A4 **blocking** | Commit `docs/work/research/redesign-canvas/` (728 KB: 24 boards, SPEC.md, BRIEF.md). | Yes; implementing sessions cannot rely on the artifact being readable. | yes |
| A5 | Phase 0 leftovers D-01 to D-03. | D-03 now: fix the two lint warnings, tighten `make lint`. D-02: module boundaries through ESLint in the redesign's UI-architecture ADR; coverage, dead-code and duplicate gates deferred in writing. D-01 formatter deferred in writing. | yes |
| A6 | Each PRD lacks a "why now" line. | Optional one line from you per PRD, or leave out. | yes |
| A7 | Porting the ADR template, ADR-000 and the ADR gate to scaffold 2.1.0 (protected paths). | Authorize me to port them in one commit. | yes |

## B. Security and governance (constitution owner)

| ID | Question | Recommendation | Decision |
| --- | --- | --- | --- |
| B1 **blocking** | Markdown rendering boundary (ADR-010, D-06). Options: (a) keep Obsidian's renderer; before render and export replace every inline code span and every fence not on an allowlist with placeholders, re-insert them as inert code elements after; strip remote images. (b) plain text now, renderer chosen by a later ADR (Codex's position). (c) sandboxed iframe with an in-house renderer, a constitution change. | (a). Closes the code-processor class without losing Markdown. Residual: plugins that read arbitrary DOM. | yes |
| B2 | Checkpoint path validation. | Removed: ADR-006 now restores through the CLI's checkpoints and deletes `src/checkpoints.ts`. | n/a |
| B3 **blocking** | Permission mode and settings sync (ADR-002, ADR-009): `permissionMode`, `bypass`, `instructions`, `bash`, `obsidianMcp` and `localGroups` device-local by default; validate `permissionMode` on load; a history file storing `auto` reopens in auto only after confirmation. | Yes. | yes |
| B4 | Link schemes handed to the OS from rendered replies. | Keep `obsidian:`, drop `file:`. | yes |
| B5 | Auto-approve answers before the pre-edit read that feeds the diff finishes. | Await it. | yes |
| B6 **blocking** | Constitution wording, protected: "every sensitive tool call shows a card" becomes "every call the CLI submits"; *Bounded file access* covers a confirmed restore through the CLI outside the vault and drops `checkpoints/`; *Inert rendering* aligned with B1. | Authorize me to make these edits, or make them yourself. | yes |
| B7 **blocking** | `release.yml`, protected: Node from `.nvmrc`, `npm ci --ignore-scripts`, `make verify` before attesting (ADR-015). | Authorize me to make the edit. | yes |
| B8 | ADR-002's new recommendation: Auto-approve everything still shows a card when the CLI's `decision_reason_type` is `rule` or `hook`, or `requires_user_interaction` is set. | Yes. | yes |

## C. Product open questions (PRD-001 to 005)

| ID | Question | Recommendation | Decision |
| --- | --- | --- | --- |
| C1 | Old CLI without the `obsidian` MCP server while the vault-tools toggle is on. | Warn once per session when startup lists no `obsidian` server. | yes |
| C2 | Do instructions, vault-tools and bypass changes reach open conversations? | Yes, through the restart that closing settings already triggers. | yes |
| C3 | Dedicated messages for a missing configured CLI path, a non-local vault, and "Open chat" failing. | Yes; not-logged-in stays with the CLI's own message. | yes |
| C4 | Cap on concurrent CLI processes. | None in 0.x, stated as a non-goal. | yes |
| C5 | Context block on messages starting with `/`. | Drop it. | yes |
| C6 | Accessibility scope for the redesign. | Focusable tabs and rows, roles, pin label, reduced motion in scope; English-only a non-goal. | yes |
| C7 | Confirm before closing a tab? | Only while a turn runs or a card waits. | yes |
| C8 | Restore: unreadable vs missing files. | Superseded by ADR-006: the CLI skips what it cannot restore and the dialog reports the count. | n/a |
| C9 | Change list includes subagent edits; README claims Edit, Write and MultiEdit only. | Include them; fix the README. | yes |
| C10 | The 4000-row diff cut. | Its own "N more rows not shown" row. | yes |
| C11 | ExitPlanMode plan on the card. | Rendered as Markdown, through the B1 boundary. | yes |
| C12 | Closing a tab restamps the updated time. | It does not. | yes |
| C13 | Failed history save. | One Notice per conversation per session. | yes |
| C14 | Profile with the conversation. | Store and restore the profile id (ADR-006 already records it per turn). | yes |
| C15 | Vault rename targets. | Refuse `..`, absolute and config-folder targets; ambiguous note names refused with candidates. | yes |
| C16 | Usage refresh after a failure; cost across processes. | Retry once per interval; conversation cost sums each process's total. | yes |
| C17 | User-message colour. | Derive from `--color-orange` with the "You" label and shape as non-colour cues, instead of fixed `#ffb454`. | yes |
| C18 | PRD-001.R29 UI performance thresholds. | Typing echo within 50 ms p95 while streaming; no panel frame over 100 ms; reopen 1,000 messages within 1 s; no periodic DOM work when idle. | yes |
| C19 | Two checks need a metered real-CLI run: does `/compact` still run with a context block in front, and does a resumed CLI reset `total_cost_usd`? | Approve one run each. | yes |

## D. Redesign defaults (SPEC §7 applies unless overridden)

| ID | Question | Recommendation | Decision |
| --- | --- | --- | --- |
| D1 | Sequencing. | Incremental vertical slices, walking skeleton first; dev-only DOM test harness through an ADR. | yes |
| D2 | Accent and theme. | No accent setting. Theme setting kept, Match Obsidian default; the forced-theme mechanism is decided in the CSS ADR (SPEC Q4). | yes |
| D3 | `/clear`. | Stays in the conversation; ask before clearing when `/clear` carries text. | yes |
| D4 | Stop semantics, usage modal, release. | Composer Stop interrupts the turn; "Stop all" stops agents and shells; usage modal replaced by the popover; release `r06-panel-redesign`, a minor bump. | yes |
| D5 **blocking** | "Restore all" (SPEC Q30) after ADR-006: a rewind goes to a point, not per file. | Keep it: rewind to before the earliest restorable turn, same dialog. Or drop the control. | yes |
| D6 | SPEC §7 Q1 to Q41. | The recommended answers apply; list any Q you override here. | yes |
