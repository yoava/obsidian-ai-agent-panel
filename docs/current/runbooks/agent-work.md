# Agent working rules

Binding like `AGENTS.md`, which caps at 220 lines and cites this file; the
headings name the guide section each group extends. Unattended runs also
follow [orchestration.md](orchestration.md).

## Adding behavior (guide section 3)

- Get a second opinion from another model family before a hard-to-reverse
  decision, on a risky or security-sensitive diff, and after two failed
  debugging hypotheses; the owner may change these triggers.

## Design rules (guide section 4)

- Token discipline: one agent per phase, handing over through a file; read
  line ranges, not whole files; print only the tail of test output.
- A design review maps each stated goal to the acceptance test proving it.
- A new rule names its guard test, or says why it has none.
- `make verify` runs from a fresh worktree with no prior setup beyond
  `nvm use` and `npm ci`.
- A scan gate fails on empty input: in a worktree, scan files or the range
  patch on stdin, never a mode that can scan nothing.

## ADR process (guide section 5)

- Every ADR marks the recommended option and backs the choice with checkable
  evidence.

## Task workflow (guide section 6)

- Every numbered file starts with its ID: `ADR-`, `PRD-`, `DES-`, `TASK-`,
  `CHG-`.
- A task with a tracker issue links it in frontmatter `issue:`, and its
  commits cite it in a `Refs:` trailer.
- Planning slices a task too large for one review (L, several components, or
  over about 500 changed lines) into sub-tasks of its issue when the slices
  share one goal and ship together, else into independent tasks. A slice is
  one reviewable unit (branch or commit series, gates, review) landed on its
  own, its commits trailed `Task: NNN` and `Refs:` the sub-task key; the task
  lists its slices (key, scope, status) and closes with the last. An
  implementer that finds its task too big stops and reports a slicing
  proposal.
- A task closes only after each acceptance item is checked against the diff.
  `make close` enforces the record's form: `.agentic/templates/task.md`.
- Deferred or skipped work is recorded when decided, naming its source: a
  tracker issue when a tracker is bound, else a line in the plan backlog.
- Owner guidance on how agents work is committed here or in the guide; agent
  memory only points to it.
- Every commit in a series builds and passes its targeted tests.
- A copied or synced file keeps its mode (copy preserving it, or restore it
  from the index); read `git diff --summary` for mode changes before a commit.
- Default models, which the owner may change: smallest adequate for lookups
  and mechanical work, one tier up for bookkeeping, top for design, ports and
  fixes, another family for review.
- An issue key or item ID in a message to the owner carries its title or goal.
- An agent's issue, comment or pull request names the agent that generated it.
- Every owner action carries the exact reply text or one complete runnable
  block with absolute paths; a revert never shares a block with the action.
  A default comes first, marked recommended; the run proceeds on it and keeps
  the item open until answered. Each option's reply sits in its own fenced
  block under it, never a pointer to an earlier message. Decisions go to the
  owner as `.agentic/templates/review-note.md`.
- Sub-agents get a brief from `.agentic/templates/brief.md`.

## Testing (guide section 8)

- A temporary HOME, set by the test target before the test process starts,
  isolates ambient configuration only (absolute paths and account lookup
  still reach the real home); guard-test that HOME is not the real home, and
  run a suite that must not touch the host in an OS sandbox. Only the setup
  of a scratch repository runs git with `-c core.hooksPath=/dev/null`; gates
  run with a PATH holding only the declared toolchain, or with a fake first.
- A signal test resets SIGINT and SIGHUP in its child: a detached launcher
  (`nohup`, or `&` in a script) starts jobs with them ignored, untrappable.
- A fix to a test that damaged the host protects it once no older tree can
  gate there: retire or rebase older branches, worktrees and gate checkouts,
  then tell the owner when restoring what was damaged is safe.
- A rehearsal on shared infrastructure uses its own label and namespace,
  never touches the shared release, tears down every object it made, proves
  no leftovers with the platform's list commands, and reports spend and any
  disruption it caused.

## What not to do (guide section 10)

- Do not land a dependency or version change the constitution's dependency
  screen has not passed.
- Do not run the full gate more than once per final tree, or outside
  `scripts/orchestrator/gate-slot.sh` in an unattended run.
- Do not re-apply a branch whose files name its own commits (pins, locks):
  move it onto the target's tip, re-pin there, and land it by fast-forward.
- Do not edit a shell script in place while anything may run it; write a new
  file and rename it over the old one.
- Do not patch an object a tool owns (a release, lockfile, generated file or
  job list); change it through the tool or its declared inputs.
- Do not accept an unknown SSH host key or otherwise trust a new host; report
  the failure and the fingerprint, and the owner verifies it.
- Do not read, print or copy credential files, tokens or keys. The owner
  runs credential steps in their own terminal; agents check only owner and
  mode. Briefs carry no secrets; a secret in a diff stops the run.
- Do not edit protected governance with any tool. Write the change as a patch
  under `docs/work/patches/<slug>/`, list it in the task, and give the owner
  one paste-ready `git apply` command.
- Do not make a choice guide section 3 reserves for an ADR before it is
  accepted.
