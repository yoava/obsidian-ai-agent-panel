# Owner decisions

Scope: closed tasks r05 (001-029, 043-045) and r06 (030-042), change 001 "Owner questions", `plan.md`
Backlog, `open-decisions.md`. Commits are on `chore/agentic-sdlc`. "Suggested" marks a recommendation the records do not give.

## A. Amendments applied under delegated authority, for confirmation

1. PRD-002.R6: Auto-approve answers an edit after its pre-edit read or after 5 s, whichever is first
   (was: only after the read). Task 003 D10. c283d80.
2. PRD-001.R24 and ADR-009 (seeding, Consequences): CLI profiles never seed from `data.json`
   (constitution "Device-local settings stay local"); switching the CLI group to synced replaces the
   synced profiles with this device's. Tasks 003 D11, 021. 80bb096.
3. PRD-001.R3: a stored session whose profile this device lacks takes the profile pick until a session
   is live (was: pick refused). Task 011 Q1(b). 6d200cf.
4. PRD-001.R3: Notice now reads "This conversation stays on <profile>; start a new conversation to use
   another." (was "Profile applies when the next conversation starts."). Tasks 011 Q1(a), 024. 79184ff.
5. PRD-001.R7: a conversation is "Untitled" when its first line is empty or blank (was: empty).
   Task 012. afa853c.
6. PRD-004.R7: `obsidian_rename` also refuses any path segment starting with `.` (file name included)
   and any folder named like a Windows 8.3 short name (`CLAUDE~1`). Task 017. 370de95.
7. ADR-002 and PRD-002.R9: Auto-approve also shows a card for `safetyCheck`, `sandboxOverride`,
    `matched_ask_rule`, `org_ask_ceiling`, unknown or mistyped values and a malformed AskUserQuestion;
    owner B8 named only `rule`, `hook`, `requires_user_interaction`. Task 025. 43fa4e8.
8. ADR-005 (Consequences) and ADR-010 (export and tool-output statements): rewritten in place to the
   present behavior (exports inert against Templater, Dataview fields and queries); no change of
   decision. Tasks 018-020. 94f4117, 504d40e, 070d355.
9. DES-001 A5 and DES-002 B1: `protocol/*` may import the pure leaf `json`. Task 045. 784e020.
10. ADR-003 validation line (task 007, 43a5d97) and ADR-009 restated to the present design only
    (tasks 003, 014; fd66ac5). The ADR-003 edit had no recorded approval beyond "approval of all tasks".
11. DES-003 acceptance alignments: ADR-016 names the message list `ui/messages` and limits U2 to
    imports from outside `src/ui`; PRD-001.R12's offer chip yields to R30 at 640 px or less;
    PRD-002.R18 numbers by the prompt that opened the turn; D-02's boundary part left. c374a87.
12. ADR-017 edits (Read: three inherited properties, empty-value rule; Frame: sandbox, CSP, `@font-face`
    skipped, media in cache key; Residuals: page previews) plus SECURITY.md and DES-001. Beyond the
    lead's authorization: the `css-change`-per-theme bullet and the Triggers bullet. Task 031. 467b3ec.
13. ADR-003, ADR-016, ADR-017, DES-007, COMPARISON.md, LEGAL.md: "usage strip" and dialog statements
    restated for the plan-usage segment and popover. Task 033. bc52e25.
14. PRD-002.R7: a changed-files row shows `+x -y` and, for a created file, "new". DES-003 N rule: N is
    the turn's first prompt before its first output, else the last before it (R18's text still says
    "prompt that opened the turn"). Task 036. f4c4a35.
15. PRD-002.R3: new clause, a permission request whose id already waits is denied and the card or form
    waiting under it is "Cancelled" and answered as denied. Task 038. 4ac90d0 (session fix 96fbbd2).
16. PRD-001.R7: "background-task strip" is now "run bar". Task 039. abfd508.
17. ADR-016 (Modules) names `usageReport`/`creditsReport`; ADR-011 evidence names the shell escape's
    one caller. Task 040. 6d7cf74.
18. DES-001 and DES-005: the save-failed Notice is raised by `main` from the store, once per
    conversation, not by each view as designed. Task 028. ac651cd.
19. DES-005: a stored message of unknown `kind` is kept as stored, not dropped (departure from the
    brief, accepted by the coordinator). Task 044. 087f165.
20. DES-003 rewritten in place by slices: pinned prompt is a zero-height sticky element (dd2a397);
    turn opens with its prompt item (9e8f437); card footer order Deny, Always allow, Allow (4ac90d0);
    arrow keys in radio groups move without picking (4ecbc5f); `context-format` module added (81f814b).

71. ADR-016 Modules: the Context block row names `context-format` (Obsidian-free). Task 041, a72cdf6.
72. ADR-016 Reopen (scroll-follow holds the end; anchoring keeps sections above) and ADR-017
    Migration, Validation and Tokens (no legacy tail; styles test checks the whole file; the settings
    error line is a scope root — the Tokens edit went beyond the authorized scope). Task 042, ca5f2d3.

## B. Open choices

Permissions and security

21. Task 025 Q1, fail closed (applied): an unknown `decision_reason_type` or a mistyped flag gets a
    card; a missing type is answered. Recommend keep: risk 4x2=8 -> 4x1=4; cost 1x3=3 (new harmless
    value shows cards until listed). 43fa4e8.
22. Task 025 Q2: `sandboxOverride` gets a card (applied); the sandbox network prompt
    (`SandboxNetworkAccess`) does not. Recommend no card for it: a card per new host; residual 3x2=6;
    `sandbox.allowUnsandboxedCommands: false` removes the escape. 43fa4e8.
23. Task 025 Q3, Q4 (applied): `org_ask_ceiling` gets a card though Claude Code marks the code
    `@internal` (fail-closed covers a non-string code only); a malformed AskUserQuestion gets a card.
    Recommend keep: risks 3x1=3 and 1x1=1. 43fa4e8.
24. Task 025 Q5, compound ask-rule limitation: an ask rule on one command of a compound command where
    another also needs approval (`npm run build && git push`) gets no card in Auto-approve; risk 4x3=12,
    4x1=4 with a `PreToolUse` `ask` hook. Recommend accept, plus an upstream report. 43fa4e8.
25. Task 025 Q6, constitution "Consent first": accept the limitation as an explicit exception, or
    reword (protected path), e.g. "a card for a call Claude Code reports to the panel as flagged by
    its rules, hooks or safety checks". Recommend reword; current text names rules and hooks only.
26. Task 003 D1-D3: leaving Bypass drops the bypass flag from every tab's CLI, runs before DES-002's
    skips (DES-002 reordered) and happens when the settings close. Recommend confirm. f3ffbe7.
27. Task 003 D5: reopening a conversation stored in Auto-approve asks via `ConfirmModal` (focus on
    "Keep current mode"; declining asks again on the next reopen). Recommend confirm. f3ffbe7.
28. Task 003 D7: security settings start at defaults once per device; vault instructions in `data.json`
    leave it at the first save. Recommend confirm. The other 003 decisions are settled: D4, D6, D8, D10,
    D11 by 014, 025, 021 and item 1; D9 needs none. f3ffbe7.
29. Task 024: a tab whose CLI moved, or whose profile arguments are refused, keeps its process and
    gets none of the new instructions or vault-tools setting (PRD-001.R4 skip rules). No recommendation
    recorded; suggested: keep. 79184ff.
30. Task 011 Q2 / D-06: a written conversation file chooses which of this device's CLI profiles
    (executable and arguments included) its reopen runs on. Recommend accept: it can name only a
    profile the device already has; this closes D-06. 6d200cf.
31. Task 043 limitations: a steering message sent mid-turn while leaving Bypass runs in that turn after
    the mode switch; on Windows a killed `cmd.exe` or `wsl.exe` wrapper may leave its CLI running
    briefly (manual check owed). Recommend accept. ed99b25.
32. Protected-path hook list: `tests/architecture.test.mjs` and `tests/styles.test.mjs` are policy files
    (constitution, Protected paths) but are not in `PROTECTED_GOVERNANCE` in
    `scripts/check_protected_paths.py` (protected; owner edit). Recommend add both as exact entries.
33. Hook coverage: the hook (`Edit|Write|NotebookEdit`) fails closed outside the project directory, so
    worktree agents wrote files through the shell, ask-first ADR and `package.json` edits included
    (listed in A and C). Recommend accept; AGENTS.md section 11 names CI and review as backstop.
34. Task 030 test rules: the architecture test reads P4 geometry only from DOM declarations; the styles
    test applies ADR-017's colour rule as written (no Obsidian colour variable outside the token
    block; `!important` only in the fence rule). Recommend confirm. 16ec436.
35. Reviews without Codex (spend cap from about task 035): 036, 037, 040 had agent review in a Chromium
    harness only. 037 moved session creation and leaving Bypass; 040 the `!` escape. Recommend Codex
    review of 9e8f437 and 6d7cf74 before release, or accept the substitute.

Composer, conversations, UI behavior

36. Task 013 Q1: PRD-001.R12 holds pending images back from a `/` message. Recommend amend R12 so a
    `/` message still sends its images (the context block is what breaks the command; the CLI passing
    preceding image blocks is not verified). a740851.
37. Task 013 Q2: "starts with `/`" also catches an absolute path ("/home/me/a.md what is this?") and
    drops its context. Recommend R12 read "starts with a `/` command name"
    (`/^\/[A-Za-z0-9_][A-Za-z0-9:_-]*(\s|$)/`). a740851.
38. Task 023 Q1, take every file drop: the composer takes a payload only if it holds an `image/*` file,
    so a lone HEIC, empty-MIME file or folder falls to Obsidian silently. Recommend amend R14 (list any
    file that cannot attach) and take every non-empty list. 19f75a2.
39. Task 030 Gap A: a card can wait with no turn running (a background agent's request); the composer
    then shows Stop and "Queue message", which do nothing for it. Recommend show them only while a
    turn runs; needs the DES-003 composer-state table and PRD-001.R11 amended. 16ec436.
40. Task 039: PRD-001.R16's close list does not name "a message sent mid-turn", which the code closes a
    group at. Suggested: add it to R16. abfd508.
41. Task 038: single-select question options are native radios, so a second click no longer unpicks
    one (Other text still clears it). Recommend accept. 4ac90d0.
42. Task 040: reopened report cards no longer carry a "Copy message" button (DES-003 draws a recorded
    card with no actions). Suggested: accept. 6d7cf74.
43. Task 033: the conversation's cost leaves the status line; it shows in the tab hover card (034)
    and `/cost`. Suggested: accept (DES-003: ring and percentage only). bc52e25.
44. Change 001 O5 (empty-state copy, R35) and O6 (001 ships alone as `r06-panel-redesign`, a minor
    bump; 002 and 003 in the next minor): both applied as recommended. Confirm. 06c5168.

Rendering and exports

45. Task 019: the word joiner (U+2060) stays in exported code (`std::vector` copied from an export
    carries it) and `::` is broken throughout the note. Copy cost 2x3=6; leaving code whole lets model
    code set a note's Dataview fields (4x2=8 -> 4x1=4 with the joiner). Recommend keep. 504d40e.
46. Task 027: reference-style links to web addresses show as text in the panel and in exports (closes
    the remote-image bypass through emphasis splits). Recommend keep. 38867b3.
47. ADR-017 / PRD-001.R34: forced Light and Dark only under Obsidian's default theme; a community
    theme draws Obsidian's mode with a note; the "no effect" and "unavailable" clauses stand. Recommend
    keep; reversible once a verification record covers named themes. 2a2223c, 467b3ec.
48. Task 031 row 11 (M8, 30,000 elements): decides whether the forced theme's first pass stays under
    100 ms or ADR-017's 500-rule chunks follow. Pending the measurement.

Redesign architecture and process

49. ADR-016: no release is cut from `main` until the last redesign slice lands (041, 042); an urgent
    fix meanwhile needs a branch from the last tag (inferred). Recommend accept. 2a2223c.
50. ADR-016 U6 / `eslint.config.mjs` (protected): `no-restricted-globals` reports `fetch` with "Use the
    built-in `requestUrl`", which A9 forbids; U6 in the architecture test already enforces the
    ban. Recommend leave, or reword the message in an owner edit.
51. DOM test harness ADR (amends ADR-014) is not drafted; reviewers used an uncommitted
    headless-Chromium harness. Recommend draft it only if committed DOM tests are wanted; until then the
    manual rows and R29 profiles stay manual.

Real-CLI evidence

52. Change 001 O4 and owed real-CLI runs (metered, native and WSL, Haiku; sanitized records in
    `docs/records/verification/`): 037 turn and interrupt, 039 steps and background task, 038
    ExitPlanMode plan, PRD-001.R12 local output, changes 002/003 E1-E7. Recommend one combined session.
53. Change 001 O1-O3 (changes 002/003, not blocking r06): O1 restore on turns before a clear, hide
    until Undo; O2 "Stop and clear", interrupt the turn, stop agents and tasks, clear when the CLI
    reports the end; O3 workflow requirement R36 waits for E6. Recommend as written.

Open decisions and backlog

54. D-01 formatter (Prettier, Biome or none; `make format` checks whitespace only): deferred past the
    redesign; proposal ADR plus one reformat commit after CSS and view rewrites land.
55. D-02 remaining gates (coverage, dead code, duplicate code): deferred past the redesign; proposal
    `node --test` coverage, knip and jscpd, each through an ADR.
56. D-04 agent abstraction for a second CLI (Codex): 1.0 design; PRD first, then an ADR.
57. D-05 release commit subject: set `message="chore(release): %s"` in `.npmrc` (protected); needed by
    the next release. Recommend as proposed.
58. PRD-004.R7 non-dot names (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, tool configs, executable
    extensions) can still be created by `obsidian_rename`. Suggested: refuse the agent-instruction names
    and script or executable extensions; value lost: a note legitimately so named. Task 017.
59. PRD-002.R6, R14 under a WSL profile: the CLI reports `/mnt/<drive>/...`, which `vaultRelativePath`
    does not map, so edit cards, the change list and the restore dialog treat vault files as outside
    the vault. Suggested: map for WSL profiles only. Tasks 002, 010.
60. Obsidian community-directory listing: 0.3.4 was the review pass; the submission state is recorded
    nowhere in the repository. Owner to record it.

73. Short panel (≤640 px tall): an offer chip turned off cannot be turned back on until the panel is
    taller (PRD-001.R30). Suggested: a "Turn on" row in "Hidden context". Task 041.
74. Contrast below 4.5:1 for Obsidian's faint text and some control labels (2.0–3.0:1), outside R28.
    Decide whether R28 covers them. Task 042 (F2).
75. The turn footer's duration-and-cost span is focusable with no interactive role (F3); column
    section headers read in capitals (F5). Suggested: fix both in a follow-up. Task 042.
76. Forced theme first pass 65–85 ms in the harness (F4): the Obsidian profile decides whether
    ADR-017's 500-rule chunking is needed. Task 042.

## C. Protected-path edits under "build the whole redesign"

Each recorded in the task's Run log for confirmation. `tests/architecture.test.mjs` and
`tests/styles.test.mjs` are not in the hook list (item 32); `package.json` is ask-first.

61. `tests/architecture.test.mjs`, `tests/styles.test.mjs`: created. Task 030. 16ec436.
62. `tests/architecture.test.mjs`: U5 `themeModal` clause (detach in `onClose`, class expressions,
    `new Modal`) with fixtures; rule added. Task 031. 467b3ec.
63. `tests/architecture.test.mjs`: P1 added with a seeded fixture; tightening only. Task 032. 4ecbc5f.
64. `tests/architecture.test.mjs`: layer 3 drops the deleted `usage`; DES-007 G1, G2 added with seeded
    breaches; tightening only. Task 033. bc52e25.
65. `tests/architecture.test.mjs`: allowlist `view` P3 row removed; tightening only. Task 034. 309a907.
66. `tests/architecture.test.mjs`: allowlist `view` U5 rows removed (`MarkdownRenderer`, `window.open`,
    `navigator.clipboard`); tightening only. Task 035. dd2a397.
67. `tests/architecture.test.mjs`: last allowlist row (`view` U3) removed, so the allowlist is empty;
    P2 checked; tightening only. Task 037. 9e8f437.
68. `tests/architecture.test.mjs`: not purely tightening. Layer 1 gains `json` and
    `transcript-markdown`, and A5 allows `protocol/*` -> `json`, following the DES-001 A5 amendment
    (item 9). Task 030 merge onto 784e020; confirm it.
69. `package.json` (ask-first): `pretest` gains 19 Obsidian-free modules over tasks 030-040 (15 under
    `state/`; `tab/` recorder, permission-flow, shell-escape, panel-commands), under the standing rule
    "Add new modules to pretest".
70. Tasks 036, 038-040 touched no protected path besides item 69; `tests/styles.test.mjs` is unchanged
    after 030. `git log 5012059..HEAD` on the other protected paths shows only 6f7d05c (baseline,
    owner-authorized 2026-10-10).
77. Task 041 added `context-format` to layer 1 of `tests/architecture.test.mjs`; task 042 removed the
    allowlist mechanism and made `tests/styles.test.mjs` check the whole file (tightening only).
