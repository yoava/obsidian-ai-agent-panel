# Orchestrator liveness

Applies to any session that runs background subagents or shell jobs while
nobody watches it. Numbers live in `scripts/orchestrator/limits.env`; state in
`$AGENTIC_RUN_STATE`, default `~/.local/state/agentic-run/<repo>`. Never edit
`scripts/orchestrator/` locally: `make verify` checks it against
`SHA256SUMS`, and changes land in the agentic-sdlc skill first. Replace a
script that may be running by writing the new file beside it and renaming it
over the old one, never by editing it in place: bash reads a script while it
runs, so an in-place edit fails a running job with a false error. No check
catches an in-place edit.

Prerequisites: a Linux host with bash, `jq`, `flock`, GNU `stat`, `readlink`,
`date` and `timeout`, and a systemd user session (`systemd-run`, `systemctl`).
Check each with `command -v` before the first dispatch: no script checks, and
without `jq` the Stop guard blocks nothing and prints nothing.

## Rules

- HB-1: Before the first dispatch, open the session workspace, then start the
  daemon: `bash scripts/orchestrator/workspace.sh init <session>`, then
  `bash scripts/orchestrator/heartbeat.sh start`. `<session>` is the run
  name; give the Claude Code session the same name (`/rename <session>`). The
  folder is `<workspace>/<session>/` (`git config agentic.workspace`), with a
  date suffix when another run's files hold the name. It holds the live note,
  named after the folder, and `Reports/`; in an Obsidian vault also `Reports.md` and
  `Reports.base`, with the live note and `Reports.md` pinned. With
  `agentic.workspace` unset, `init` fails and prints the setup command; set
  to `""`, both stay in `$AGENTIC_RUN_STATE`. Rerun `init` with the same name
  after a crash, a lost pin or a `reports` alarm. The run owns its folder by
  the identity of its `Reports/` (`$AGENTIC_RUN_STATE/reports.id`): `init`
  finds the folder again under a new name directly in the workspace and never
  takes another run's. A folder moved deeper, out of the workspace, or
  deleted gets a fresh folder; its earlier reports stay where it went.
- HB-2: Register every job right after its launch:
  `heartbeat.sh add <job> <agent|reader|shell> <agent-id|-> <worktree|-> <output|-> <DUE_*|minutes> [pid]`,
  an agent once its dispatch returns its id (or its transcript's absolute
  path, an existing file, stored resolved; either is matched exactly) and
  worktree, a shell job with
  `$!`. `add` rejects an agent without an existing worktree (it would raise a
  false `idle`) and a pid that is not above 1 or not running, records the
  pid's start time (a reused pid then counts as exited), resets and acks the job, and
  writes its `inflight.tsv` row atomically. Never edit `inflight.tsv` by hand.
  A `reader` is a read-only agent (review, verification): its worktree is
  optional and its `idle` goes to the log, not the watch. A second-opinion or
  review CLI call is a `shell` job started per HB-6 with due `DUE_CODEX`,
  never a foreground call: an unbounded call hangs the session with no event.
- HB-3: Keep the watch armed while a job is in flight:
  `Monitor(command: "bash scripts/orchestrator/heartbeat.sh watch", description: "agentic heartbeat", timeout_ms: 1800000)`.
  Re-arm it on its `lease-end` line. Never sleep, poll or schedule
  fixed-interval wakes.
- HB-4: Act on every event line, then run `heartbeat.sh ack <job>`:
  - `report`: read the report file, act on it.
  - `idle`: message the agent once and ask for its state.
  - `stuck`: stop the agent, keep its worktree, and dispatch it once more
    from that worktree; the second time, mark the task blocked.
  - `exited`: read the job's log and act on it.
  - `due`: extend once by half only if `progress` moved in the last 30 min;
    otherwise treat it as `stuck`.
  - `cap`: the agent passed `CALL_CAP` tool calls or `CONTEXT_CAP` tokens of
    context. Tell it to write its handover (TP-4) and stop, then start a
    fresh agent of its model from that handover (TP-6).

  A job waiting for a gate slot shows `state=queued` in `heartbeat.sh status`
  and raises no `idle` or `stuck` while it waits; its due moves out by the
  time queued.
- HB-5: Every agent and review prompt names its report's full path,
  `<reports>/<job>-rN.md`, and tells the agent to write it with the shell
  (a hidden `.<name>.tmp` beside it, then `mv`) before its final message: the protected-path hook
  stops file-tool writes outside the repository, and nobody answers it. `<reports>` is
  `$AGENTIC_RUN_STATE/reports`, linked to the session's `Reports/` (HB-1). The
  report file is the hand-back; a notification or final message alone is
  not.
- HB-6: Start shell jobs in the background as
  `setsid -w env --default-signal=HUP,INT bash -c 'set -o pipefail; echo $$ > "$AGENTIC_RUN_STATE/hb/<job>.pid"; timeout -k 60 <due-seconds> <command> > <log> 2>&1; echo $? > "$AGENTIC_RUN_STATE/hb/<job>.exit"' &`
  and register them with `$!` (HB-2), never a `pgrep` lookup.
  - Signals: an `&` or `nohup` launch starts the job with SIGINT or SIGHUP
    ignored, and no shell under it can trap or reset them, so signal tests
    fail only in detached runs. `env --default-signal` resets them; it needs
    GNU coreutils 8.31 or later, so check `env --default-signal=HUP true` on
    each host. Where it fails, put
    `perl -e '$SIG{HUP}=$SIG{INT}="DEFAULT"; exec @ARGV' --` in place of
    `env --default-signal=HUP,INT`.
  - Status: `<command>` is the gate or job itself, never a wrapper that
    swallows its exit status; a pipeline relies on the recipe's `pipefail`.
    A result is the `.exit` file read together with the log's last line.
  - Retention: never delete a log or an exit marker. Before reusing a name,
    rename the old file with a `.<epoch>` suffix; `heartbeat.sh add` does it
    for `.exit` and `.pid`.
- HB-7: Retire a job with `heartbeat.sh done <job>` once its last report or
  exit is handled: it acks the job, clears its pending events and removes its
  row atomically. A row removed any other way leaves its events to alarm as a
  stall.
- HB-8: Answer every status question from `heartbeat.sh status`, never from
  memory.
- HB-9: Keep two independent jobs in flight while the plan has them, so one
  stall never idles the run.
- HB-10: On resume, run `heartbeat.sh status`, reconcile every row against
  its reports, process and worktree, then re-arm the watch. A relaunched or
  successor agent reads results from the handover and the `hb/<job>.exit`
  files, never from notifications: an ended agent's children report to it,
  not to its successor.
- HB-11: Wait on a pid (`while kill -0 <pid>`) or an exit-marker file
  (`until [ -e <job>.exit ]`), never on `pgrep -f`; stop a job by the pid in
  `hb/<job>.pid` (`pkill -TERM -s <pid>` ends its whole session), never by
  `pkill -f`. A command-line pattern also matches the agent's own shell,
  which then waits forever or is killed. HB-6 records the pid, so no pattern
  is needed.
- HB-12: The live note (`workspace.sh note`) is the run's status note, laid
  out as `.agentic/templates/live-note.md` and rewritten whole on each write
  through `workspace.sh write < <new note>`, which checks the folder is still
  the run's and renames the new note into place inside it; never write it by
  path.
  - Sections in order: Status (the run level as a labeled word, never colour
    alone; at most six one-line items: now, next, ETA, the gate the release
    waits on, open `W<n>` ids; no hash, path or host the owner does not act
    on), Waiting on you (open items only, HB-15), In flight (running, then
    blocked, then queued; never a done row), Releases (a step checklist per
    unshipped release, then queued work), Done in the last 24 h (newest
    first).
  - Form: bullets and tables, one fact per line, no paragraphs. A fact
    appears once. A cell holds about 25 words; more goes to a report the
    cell names. A status cell takes one value from the template's closed
    list; times go in ETA, details in Detail.
  - Times: every time comes from `date` or a commit read in that write,
    never from memory. An ETA is a clock time or a named trigger, never a
    bare duration: `hh:mm` today, `MM-DD hh:mm` on another day; bare times
    get their date on the first write after midnight. An estimate says so and
    names its assumption. The Status title and frontmatter `updated` hold the
    same clock reading.
  - Write when a job starts, ends, fails or blocks; a waiting item opens or
    closes; a release changes status, scope or ETA; a checklist step changes;
    an ETA passes; and at least at each watch `lease-end` while a job runs.
  - Each write prunes closed waiting items and moves finished rows to Done. A
    failed run is a Done row with its cause, and its fix a new In flight row.
    Done rows and shipped releases older than 24 h move to
    `<reports>/live-note-archive-<YYYY-MM-DD>.md` (same columns, newest
    first), linked from the note's last line; nothing is deleted.
  - Writers: the render hook writes only the Status time and each registered
    job's measured Detail cell, keeping the layout; the orchestrator writes
    the rest.
  - No script checks the layout yet; the template is the reference.
- HB-13: In the live note, reports and hand-backs, an ADR, DES, PRD or file
  outside this repository is named by its full path (`ADR-011 in
  /path/to/Decisions.md`); a bare ID means this repository.
- HB-14: Every issue key or item ID in a message to the owner (chat, live
  note, report) carries its title or a one-line goal: a bare key costs the
  owner a lookup per line. No guard: only a reader can tell.
- HB-15: An item waiting on the owner stands alone in plain language:
  - what happened; what is asked and why the owner, not the run, decides;
  - the options and what each does, the recommended one first. An item with
    a default lists it first, marked recommended: the run proceeds on it and
    keeps the item open until the owner answers;
  - under each option, its exact reply or command in its own fenced block,
    in chat and in the note alike; never a pointer to an earlier message.

  It gets an id `W<n>` before it is first shown, one-line questions
  included, from the note's frontmatter `next_w`, raised in the same write
  and never reused. A lost counter becomes the highest `W` id in the note
  and its archives plus one. The id stays on everything the answer starts
  (In flight row, Done row with the decision, commits, chat and tracker
  comments); a closed item leaves the section on the next write. No guard:
  only a reader can tell an item stands alone.

## Throughput and landing

- TP-1: At most `IMPL_CAP` implementer agents at a time, critical path
  first: `IMPL_PER_SLOT` per full-gate slot, summed over every gate host
  (`IMPL_CAP` defaults to `IMPL_PER_SLOT` times `GATE_SLOTS`), and at most
  `LEAD_CAP` leads. Reviews, verification passes and gates come on top.
  Raise `IMPL_CAP` by one only while tasks are ready and no full gate waited
  for a slot in the last hour (`state=queued`, HB-4). Why: agents beyond the
  gate slots only queue and spend budget. No guard: dispatch is the
  orchestrator's call. Before each dispatch, weekly usage percent
  plus the remaining estimates of the tasks in flight plus this task's
  (`EST_S`, `EST_M`, `EST_L` points) stays at or below `WEEK_CAP`; otherwise
  dispatch only critical-path tasks, and offer the owner paid extra usage as a
  waiting item (HB-15). An owner who asks to run faster lifts `WEEK_CAP` for that run.
  Why: the weekly limit binds before wall time.
- TP-2: While developing, run the lint and tests of each changed component and
  of every component that imports it. Run the full gate (`make verify` and
  the task's acceptance commands) once, on the final tree after the review fix
  round and bookkeeping, through `scripts/orchestrator/gate-slot.sh <command>`,
  and report `git rev-parse HEAD^{tree}` with the results; a later change
  re-runs it, and a gate that ran on an older commit than the branch tip is
  restarted on the tip. Landing gates use the same wrapper with
  `AGENTIC_GATE_CLASS=landing`. Start a full gate per HB-6 and wait on its
  pid or exit marker in foreground waits of up to 10 min, never in sleep
  loops or repeated `tail` checks; its result is the exit file plus the
  log's last line. Why: one full gate saturates the cores, and more than
  `GATE_SLOTS` at once caused flakes.
- TP-3: Dispatch the reviews when the implementer reports ready-for-review.
  Relay each reviewer's blockers and majors as soon as that reviewer reports,
  with stable IDs (`F1`, `C1`) and the evidence that will close each.
  Unresolved or new blockers and majors block landing and get one more
  targeted round; minor findings become follow-ups in the task's Independent
  review section, never another round.
- TP-4: With its ready-for-review report, the implementer writes
  `<reports>/<task>-handover.md`: base and tip SHAs, files touched, decisions
  and why, each gate command with its last result, open risks. The tip SHA
  is the exact commit handed over: a later commit to that branch is reported
  to the orchestrator before it is made, and a gate on the older commit
  restarts (TP-2). Guard: before landing, the orchestrator compares the
  handover's tip with `git rev-parse <branch>`. A fix round
  with a blocker, three or more majors, or an implementer past `FRESH_AFTER`
  minutes goes to a fresh agent of the task's model in the task's worktree,
  given the task file, the reports, the handover and the commit range;
  otherwise message the implementer. A cross-model pass (Codex, read-only,
  medium effort, where available) verifies it: every finding against the
  whole fix-round diff, and regressions in the changed hunks only. Why: late
  fix-round turns ran at twice a fresh agent's context.
- TP-5: Land in dependency order, re-running the full gate after each task.
  Before close, build and gate the task on the landed base, not its fork
  point. Landing gates run with `AGENTIC_GATE_ENV` naming the agents'
  environment file, so they see what the agents saw. Cherry-pick rewrites
  SHAs: a branch whose files name its own commits (embed locks, pins) lands
  by fast-forward only: move it onto the target's tip, re-pin there, gate,
  then fast-forward; never re-apply it. Land and push from a clean landing
  worktree, never the owner's checkout, and remove the task's worktree once
  it lands. Independent landing-gate failures get one fix agent each, in
  parallel. When a fix to a test that damaged the host (wiped credentials or
  caches) lands, retire or rebase every older branch, worktree and gate
  checkout that still holds the old test, then open a waiting item (HB-15)
  saying when restoring what was damaged is safe: until then any tree
  without the fix can gate there. No guard beyond `git worktree list` and
  `git branch --contains`.
- TP-6: The orchestrator stays lean: it hands each track to a lead through a
  brief (`.agentic/templates/brief.md`) and keeps only owner questions, the
  live note and decisions. A lead only orchestrates: one implementer per
  slice, reading summaries, gate results and verdicts. One agent per phase
  (plan, implement, fix round), each handing over through a file; read line
  ranges, print only output tails. An agent cannot see its token count, so a
  lead counts its own tool calls: at `CALL_CAP` it writes its handover and
  stops, and the orchestrator starts a fresh lead from that handover. The
  `cap` event (HB-4) enforces `CALL_CAP` and `CONTEXT_CAP` for every agent.
  At most `LEAD_CAP` leads at once. Stopping a lead ends its background
  jobs, so a lead runs long gates detached (HB-6) and its successor reads
  them per HB-10. A fresh orchestrator starts each release from the
  checkpoint. Register read-only agents as `reader` (HB-2).
- TP-7: By default the token budget outranks wall-clock: add hosts or
  parallelism only where they add no agent turns, never agents, reviews or
  debug rounds to save time; spend turns on another host only to shorten the
  critical path. The owner may lift this for a run.
- TP-8: Before arming an unattended chain (gate, then land, push or
  publish), run each of its precondition checks once by hand against the
  real artifact it reads, in the tool's dry-run mode where it has one. Why:
  a check that reads the wrong file stops the chain or, worse, passes it. No
  guard: the hand run is the guard.
- TP-9: At each release close, remove every worktree whose release is
  published and whose work is on a pushed ref (`git worktree remove`, then
  `git worktree prune`). Before removing one: confirm no `inflight.tsv` row
  and no process uses it; save its `git diff` and untracked files to
  `<reports>/`; give a detached HEAD on no ref a keep ref
  (`refs/keep/<worktree>`). Keep only trees the next release still reads,
  until it publishes. Why: per-task removal (TP-5) misses trees under
  release pressure. Guard: `git worktree list` is empty of published work.

## What enforces them

- `heartbeat.sh add` and `done` are the only writers of `inflight.tsv`;
  `gate-slot.sh` holds a host-wide slot (lock files under
  `$AGENTIC_GATE_LOCKS`, default `~/.local/state/agentic-run/gate-slots`).
  `GATE_SLOTS` defaults to the host's cores over `GATE_CORES`.
- `gate-slot.sh` serves waiters in arrival order, landing gates
  (`AGENTIC_GATE_CLASS=landing`) first, through queue tickets under
  `$AGENTIC_GATE_LOCKS/queue/`; a job named by a ticket of this repository
  (`AGENTIC_JOB`) or whose worktree holds one shows `queued`, and a ticket
  whose waiter is gone is dropped. It reads `$AGENTIC_GATE_ENV`,
  when set, as `KEY=value` data, never as a script, refusing keys that make
  a shell or the loader run code; keep that file where agents cannot write,
  since its values (`PATH`) still choose what runs. A `limits.env` key
  holding anything but a number, from that file or the environment, stops
  the gate and the heartbeat, since arithmetic would run it. It exits with
  the gate's own status.
- An allowed gate invocation (`make verify`, `gate-slot.sh make test`) runs
  the repository's tests and recipes, which agents edit, without a prompt,
  as an allowed `git worktree add` runs the `post-checkout` hook (in-tree
  when `core.hooksPath` points into the repository): a protected path rests
  on the review of the diff there, not on the file-tool hook.
- The run state (`$AGENTIC_RUN_STATE`, `$AGENTIC_GATE_LOCKS`) is trusted
  like `limits.env`: the scripts write its files by name, so a symlink
  planted there redirects a write; only the owner's processes write there.
- `heartbeat.sh add` and `reset` rename a reused name's `.exit` and `.pid`
  with an epoch suffix instead of deleting them.
- The daemon reads each agent's transcript for its tool calls and context
  tokens and emits `cap` at `CALL_CAP` or `CONTEXT_CAP`; without a
  transcript, `status` shows `calls=?` and no event fires. An agent id is
  looked up across every project folder there; one naming two transcripts
  fires `transcript` and is read from neither: register the path. A `reader`'s
  `idle` goes to `quiet.log`, not `events.log`.
- The daemon samples every job each `HB_EVERY` seconds and appends only
  actionable events to `events.log`.
- The Stop hook (`stop-guard.sh`) blocks the end of a turn while jobs are in
  flight and the daemon or the watch is down, or a report is unacked.
- The SubagentStop hook (`report-capture.sh`) saves every in-flight
  subagent's final message to `reports/<job>-s<epoch>.md`, so a lost
  hand-back still lands on disk. It skips an interim stop (another in-flight
  row on the agent's worktree has a live pid) and never blocks the stop.
- The daemon alarms when no watch runs for `HB_STALE`, an event or report
  waits unhandled for `HB_UNACTED`, or `reports` stops resolving to the session folder: it posts to the session inbox, calls
  `$AGENTIC_RUN_STATE/render --alarm`, and sends a desktop notification.
  Headless (`AGENTIC_HEADLESS=1`), it stops the session after `HB_KILL` so
  the wrapper resumes it. After `HB_STALL` alarms in a row it writes
  `STALLED <hh:mm> <why>` to `$AGENTIC_RUN_STATE/status` (unless that reads
  `DONE`, `STOPPED` or `PAUSED`), keeps running, and restores the earlier
  value once the guard passes.
- `workspace.sh init` creates each session folder, then verifies it by
  identity (no symlink, device and inode of the resolved path under the
  workspace) and writes nothing on a mismatch; it then holds the folder as
  its working directory, so a symlink swapped in later cannot redirect the
  files it writes there; it enters `Reports/` the same way before writing
  `.run-id`. `reports.id` records the host and a random run id, also kept in
  `Reports/.run-id`, so `init` on another host adopts a folder by session
  name only when its run id (32 hex digits) matches, and stops when two
  folders carry it. The run id detects a collision with another run's
  folder, not forgery: whoever can write the workspace can copy it. `note` prints the live note only while
  its folder still has that identity, and `write` replaces the note from
  inside it. `report-capture.sh` writes into `reports` only while it
  resolves to that folder, otherwise into `$AGENTIC_RUN_STATE/captured/`.
  The pins and the `reports` link are still written by path; the daemon
  checks the link every sample.
- The daemon exits when `$AGENTIC_RUN_STATE/status` starts with `DONE` or
  `STOPPED`.
- `$AGENTIC_RUN_STATE/render`, when present, runs every 9 min and updates
  only the live note's Status time and each registered job's measured Detail
  cell, keeping the layout (HB-12).

## Fault checks

Run each after a change to `scripts/orchestrator/`, with the `HB_*`
thresholds shrunk to seconds:

| Fault | Inject | Expect |
| --- | --- | --- |
| Lost hand-back | Subagent ends without writing its report | `report` event from `<job>-s<epoch>.md` within one sample |
| Watch expiry | Kill the watch, end the turn | Stop hook blocks; alarm after `HB_STALE` |
| Hung job | Shell job that sleeps without output | `due`, then `exited` with its exit code after its `timeout -k` |
| Session idle | Ignore an event | Inbox post and alarm after `HB_UNACTED` |
| Busy but useless agent | CPU without commits or writes | `idle` stays quiet; `stuck` after `HB_STUCK` |
| Daemon crash | Kill the daemon | systemd restarts it within 10 s |
| Session folder moved | Rename the session folder while a job is in flight | Alarm within one sample; `workspace.sh init` finds the renamed folder and relinks |
| Pin while Obsidian runs | `workspace.sh init` a new session with the vault open | Both notes appear pinned |
| Symlink swap | Replace a session folder with a symlink out of the workspace between `init`'s check and its writes | `init` fails and writes nothing outside the workspace |
| Interim stop | A subagent stops while its child shell job runs | No `<job>-s<epoch>.md` capture; the stop goes through |
| Queued waiter | Hold every gate slot, start a gate from a registered job | `state=queued`; no `idle` or `stuck`; its due moves out |
| Gate order | Queue two gates, then a landing gate | The landing gate takes the next slot, then the others in arrival order |
| Repeated alarms | Leave an alarm unhandled `HB_STALL` times | `status` reads `STALLED <hh:mm> <why>`, restored once handled |
| Call cap | An agent passes `CALL_CAP` tool calls | `cap` event within one sample |
| Host move | `init` the same session from another host on the shared workspace | Finds the folder by name; `reports.id` records the new host |
| Ignored signals | From a non-interactive shell, start a job per HB-6 that traps INT, send INT | The trap fires |

### Live checks after deployment

The harness cannot inject these; run each once on every host after
deploying:

- Inbox delivery: an alarm's post reaches the session inbox.
- Stop hook override cap: after the harness's override cap lets a turn end,
  the daemon still alarms.
- Headless resume: with `AGENTIC_HEADLESS=1`, the session stops after
  `HB_KILL` and the wrapper resumes it.
- Ignored TERM: a job that ignores TERM is killed after its `timeout -k`
  grace.
