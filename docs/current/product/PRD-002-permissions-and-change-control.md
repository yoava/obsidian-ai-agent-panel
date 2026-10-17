# PRD-002 — Permissions and change control

**Status:** accepted (2026-10-11)

## Problem

With the vault as its working directory, Claude Code can rewrite or delete
notes and run shell commands. Over stream-JSON the CLI hands every permission
decision to its host (`--permission-prompt-tool stdio`), so the panel is the
only place to approve one. Users need to approve each sensitive action inside
Obsidian with the change in view, choose how much runs without asking, and
undo or fork a turn afterwards (README Features; docs/current/SECURITY.md).

## Users and jobs

Obsidian desktop users running Claude Code in the panel (PRD-001):

- Approve or deny a tool call after seeing the exact edit or plan.
- Answer Claude's multiple-choice questions.
- Set per conversation how much runs without asking, and see the mode really
  in force.
- Review what a conversation changed, put a turn's file changes back, or
  continue from an earlier turn without losing the original.
- Run their own shell command in the vault without a model turn.

## Requirements

- **PRD-002.R1** — Permission card.
  - WHEN Claude Code asks permission for a tool call, the AI Agent Panel
    shall show a card in that conversation with Allow and Deny buttons.
  - The AI Agent Panel shall title a permission card with the sentence of
    PRD-004.R10 for a vault tool, else Claude Code's title, else
    `Allow <tool>?`.
  - The AI Agent Panel shall show on a permission card Claude Code's
    description and a one-line summary of the input of at most 96 characters.
  - The AI Agent Panel shall show a permission card's input as JSON under a
    collapsed "Full input", cut to 2000 characters.
  - WHEN the user presses Allow, the AI Agent Panel shall return an
    allow decision with the tool input unchanged and mark the card "Allowed".
  - WHEN the user presses Deny, the AI Agent Panel shall return a deny
    decision with the message "The user denied this action in Obsidian." and
    mark the card "Denied".
  - IF the request's tool name is not a string, THEN the AI Agent Panel
    shall name the tool `unknown`, so a card without a Claude Code title reads
    `Allow unknown?`.
  - WHEN a permission card or question form settles (answered, withdrawn or
    ended), the AI Agent Panel shall replace its buttons with the outcome text
    and drop its waiting highlight.
- **PRD-002.R2** — Always allow.
  - WHERE Claude Code's request carries permission suggestions, the AI Agent
    Panel shall add an "Always allow" button to the card.
  - WHEN the user presses Always allow, the AI Agent Panel shall return
    an allow decision carrying those suggestions unchanged as updated
    permissions and mark the card "Always allowed".
  - The AI Agent Panel shall store no permission rule of its own.
- **PRD-002.R3** — Withdrawn, orphaned and unsupported requests.
  - WHEN Claude Code withdraws a pending request, the AI Agent Panel
    shall mark its card "Cancelled", remove the buttons, and send no answer.
  - IF the CLI process ends while requests are unanswered, THEN the AI Agent
    Panel shall mark each card "Session ended" and treat it as denied.
  - IF Claude Code sends a permission request whose id already waits for an
    answer, THEN the AI Agent Panel shall deny that request, mark the card or
    form waiting under the id "Cancelled", and answer it as denied.
  - IF Claude Code sends a control request of a kind the panel does not
    handle, THEN the AI Agent Panel shall answer with the error
    `Unsupported control request: <subtype>`.
- **PRD-002.R4** — Proposed edit diff.
  - WHEN an Edit, Write or MultiEdit call asks permission, the AI Agent Panel
    shall show on the card the diff that call would make to the file's
    current contents, with a "Reading the file" placeholder until the file is
    read.
  - The AI Agent Panel shall compute the proposed change as Claude
    Code's tools define it: Write replaces the whole file, Edit replaces the
    first literal match (every match with `replace_all`), MultiEdit applies its
    edits in order, and an empty `old_string` on a missing file creates it.
  - The AI Agent Panel shall treat a target path as in the vault only when,
    with its `.` and `..` segments resolved, it lies under the vault root.
  - IF the target path is outside the vault, THEN the AI Agent Panel
    shall diff the tool's own before and after strings and add
    `<path> is outside this vault.`
  - IF an Edit or MultiEdit target cannot be read, or the text to replace is
    not found, THEN the AI Agent Panel shall show an excerpt diff of the
    tool's own strings with a note saying why.
  - IF a Write target exists but cannot be read, THEN the AI Agent Panel
    shall show the proposed contents with the note `<path> exists but could
    not be read.` instead of a diff against an empty file.
- **PRD-002.R5** — Diff display.
  - The AI Agent Panel shall render each diff line by line, marking added
    and removed lines with `+` and `-` signs and line numbers as well as
    color.
  - The AI Agent Panel shall show three unchanged lines of context on each
    side of every change.
  - The AI Agent Panel shall highlight the changed words inside a rewritten
    line of up to 400 characters.
  - The AI Agent Panel shall head a diff with its `+N -N` count and a "new
    file" or "excerpt" badge where one applies.
  - IF a diff shown with a path or note changes nothing, THEN the AI Agent
    Panel shall show "no change" in place of the count.
  - The AI Agent Panel shall collapse each unchanged stretch of two or more
    lines beyond the context into a gap row that shows how many lines it
    hides.
  - WHEN the user clicks a gap row, the AI Agent Panel shall show that gap's
    hidden lines in place, inserted in chunks, leaving the rest of the diff as
    drawn.
  - WHEN the user switches a diff to Rendered, the AI Agent Panel shall
    show the changed region before and after as Obsidian renders it, with
    "(nothing)" for an empty side.
  - The AI Agent Panel shall render both sides of a Rendered diff through the
    Markdown boundary of PRD-001.R17.
  - IF aligning a diff would exceed 1 000 000 comparison cells, THEN the AI
    Agent Panel shall show one wholesale replacement with the note "Too
    large to align line by line - shown as a wholesale replacement."
  - IF a diff exceeds 4000 rows, THEN the AI Agent Panel shall show the first
    4000 and then a row of its own reading `N more rows not shown`, distinct
    from a gap row.
  - The AI Agent Panel shall treat CRLF and CR line ends as LF and not
    count a lone trailing newline as a change.
- **PRD-002.R6** — Edit outcome on the step row.
  - WHEN Claude announces an Edit, Write or MultiEdit call, the AI Agent
    Panel shall start reading the target file before the tool runs.
  - WHILE a conversation is in "Auto-approve everything", the AI Agent Panel
    shall answer an Edit, Write or MultiEdit permission request only after
    that call's read of the target file has finished or 5 s have passed,
    whichever is first.
  - WHEN that call succeeds, the AI Agent Panel shall show `+x -y` on the
    call's step row and, in its details, the diff from the file as read to the
    file now on disk.
  - IF that call fails, THEN the AI Agent Panel shall keep the tool's raw
    result in the row's details.
  - WHEN a conversation is reopened from history, the AI Agent Panel shall
    show each edit's step row with the stored `+x -y` counts and the diff of
    the tool's own strings in its details.
- **PRD-002.R7** — Changes this conversation.
  - WHILE Edit, Write or MultiEdit calls of the main agent or its subagents in
    the open conversation have changed files, the AI Agent Panel shall show a
    changes chip `N files +x -y`, placed as PRD-001.R30 specifies.
  - WHEN the user clicks the changes chip, the AI Agent Panel shall open a
    "Files this conversation changed" popover listing each file with its
    `+x -y` and, for a file the conversation created, "new", a "Review
    changes" button and "Restore to before turn N" (R18).
  - WHEN the user presses "Review changes", the AI Agent Panel shall open
    "Changes this conversation" with one collapsible diff per file from its
    first recorded contents to its latest contents, a "new" tag for created
    files, and the file name as a link that opens the file.
  - IF the clicked file no longer exists, THEN the AI Agent Panel shall
    show `Note not found: <path>`.
  - WHEN a conversation is reopened from history or the panel reloads, the AI
    Agent Panel shall start that conversation's change list empty.
- **PRD-002.R8** — Permission modes.
  - The AI Agent Panel shall offer per conversation "Ask before
    acting", "Accept edits", "Plan (read-only)" and "⚠ Auto-approve
    everything".
  - WHERE "Bypass-permissions mode" is on, the AI Agent Panel shall also offer
    "⚠ Bypass permissions".
  - WHEN the user picks a mode, the AI Agent Panel shall switch the
    conversation's running CLI, if any, and store the pick with the
    conversation.
  - IF the CLI refuses the switch or does not confirm it within 15 s, THEN the
    AI Agent Panel shall restore the previous mode display and show
    `Could not switch mode: <error>`.
  - The AI Agent Panel shall pass a picked mode, "Ask before acting"
    included, on every later launch of that conversation's CLI.
  - WHILE a conversation is in Auto-approve or Bypass, the AI Agent Panel
    shall show its permission segment in red with a zap or shield-off icon and
    the short label "Auto" or "Bypass".
  - IF the stored "Default permission mode" is none of "Claude Code default",
    "Accept edits", "Plan (read-only)" and "Auto-approve everything", THEN the
    AI Agent Panel shall replace it with "Claude Code default" when settings
    load.
  - WHEN the user clicks the permission segment, the AI Agent Panel shall open
    the mode list as a popover with the current mode checked and
    "⚠ Auto-approve everything" and "⚠ Bypass permissions" in red.
  - WHERE "Show tooltips" is on (PRD-001.R32), WHEN the pointer rests on the permission segment, the AI Agent Panel shall
    show the current mode's long string and hover text from the mode table,
    joined by " · ".

  Mode table:

  | Mode | Short | Long | Hover text |
  | --- | --- | --- | --- |
  | Ask before acting | Ask | Ask before acting | Claude Code asks before any call its rules do not allow |
  | Accept edits | Edits | Accept edits | file edits run without asking; other calls follow Claude Code's rules |
  | Plan (read-only) | Plan | Plan (read-only) | Claude reads and plans, and edits nothing until you approve the plan |
  | Auto-approve everything | Auto | ⚠ Auto-approve everything | every call runs without a card, except calls Claude Code flags |
  | Bypass permissions | Bypass | ⚠ Bypass permissions | Claude Code's permission checks are off |
  | Don't ask | Don't ask | Don't ask (deny what isn't allowed) | calls Claude Code's rules do not allow are denied |
  | Auto mode | Auto mode | Auto mode (Claude Code decides) | Claude Code decides which calls need a card |
  | Inherited, last start known | that mode's short string | that mode's long string, then "· Claude Code's default when it last started" | that mode's hover text |
  | Inherited, none known | Default | Claude Code default (set in its settings) | Claude Code's settings decide the mode |
- **PRD-002.R9** — Auto-approve.
  - IF a conversation in "Auto-approve everything" receives a permission
    request whose `decision_reason_type` is present and none of `mode`,
    `subcommandResults`, `workingDir`, `classifier`, `asyncAgent`,
    `permissionPromptTool` and `other`, that carries `classifier_approvable`
    or `matched_ask_rule`, whose `decision_reason_code` is
    `org_ask_ceiling`, that sets `requires_user_interaction`, or that carries
    one of these fields with the wrong type, THEN the AI Agent Panel shall
    show the permission card for it.
  - IF a conversation in "Auto-approve everything" receives an
    AskUserQuestion request whose input the form cannot show, THEN the AI
    Agent Panel shall show the permission card for it.
  - WHILE a conversation is in "Auto-approve everything", the AI Agent Panel
    shall answer every other permission request with allow and the input
    unchanged, without showing a card.
  - WHILE a conversation is in "Auto-approve everything", the AI Agent Panel
    shall run its CLI in Claude Code's "default" mode, so Claude Code's
    own rules and hooks still decide first.
  - WHILE a conversation is in "Auto-approve everything", the AI Agent Panel
    shall still show a step row for every tool call and a form for every
    AskUserQuestion.
  - WHERE "Default permission mode" is "Auto-approve everything", the AI Agent
    Panel shall start every new conversation in that mode.
  - IF a reopened conversation's stored mode is "Auto-approve everything", THEN
    the AI Agent Panel shall apply that mode only after the user confirms it,
    leaving the tab in the mode it already had otherwise.
- **PRD-002.R10** — Bypass. Which conversations a change of the bypass
  setting reaches: PRD-001.R25.
  - WHERE "Bypass-permissions mode" is on, the AI Agent Panel shall launch a
    conversation's CLI with `--allow-dangerously-skip-permissions`.
  - The AI Agent Panel shall start a new conversation in Bypass only when the
    user picks Bypass for it, whatever the stored default permission mode.
  - WHERE "Bypass-permissions mode" is off, the AI Agent Panel shall not apply
    a stored Bypass when its conversation is reopened, leaving the tab in the
    mode it already had.
  - WHEN "Bypass-permissions mode" is turned off while a conversation is in
    Bypass, the AI Agent Panel shall restart that conversation's CLI without
    the flag in Ask and show Ask.
- **PRD-002.R11** — Truthful mode display.
  - WHERE "Default permission mode" is "Claude Code default" (the default),
    the AI Agent Panel shall launch a new conversation's CLI without
    `--permission-mode`, so Claude Code's `permissions.defaultMode` applies.
  - WHEN the CLI reports its permission mode, at start or on a change, the AI
    Agent Panel shall show that mode, including modes the menu does not
    offer, such as "Don't ask (deny what isn't allowed)" and "Auto mode (Claude
    Code decides)".
  - WHILE an inheriting conversation's CLI has not started, the AI Agent Panel
    shall show the mode that profile's CLI last started in on this
    device, marked "Claude Code's default when it last started", or "Claude
    Code default (set in its settings)" when none is known.
  - WHEN the CLI changes mode by itself, such as leaving plan mode after an
    approved plan, the AI Agent Panel shall launch any replacement CLI
    process for that conversation in the new mode.
  - IF the user picks a mode while the CLI's startup report is in flight, THEN
    the AI Agent Panel shall keep the pick and ignore the reported mode.
  - WHILE a conversation is in "Auto-approve everything", the AI Agent Panel
    shall show "Auto" whatever mode the CLI reports.
  - WHEN a stored conversation is reopened, the AI Agent Panel shall
    pass its stored mode at launch, except a stored "default" the user never
    picked, which inherits Claude Code's default.
- **PRD-002.R12** — AskUserQuestion form.
  - WHEN Claude calls AskUserQuestion with a well-formed list of questions,
    the AI Agent Panel shall show a form instead of a permission card,
    with per question a header chip, the question, option buttons with
    descriptions, "Select all that apply" for multi-select questions, and a
    free-text "Other" field.
  - WHILE a question is single-select, the AI Agent Panel shall keep at
    most one answer for it, either one option or the Other text.
  - WHILE any question has no option selected and no Other text, the AI Agent
    Panel shall keep Submit disabled.
  - WHEN the user submits, the AI Agent Panel shall return an allow
    decision whose `answers` map each question's text to its chosen labels and
    Other text joined by ", ", and mark the form "Answered:" followed by the
    answers.
  - WHEN the user presses Dismiss, the AI Agent Panel shall return a
    deny decision with "The user dismissed the question without answering."
    and mark the form "Dismissed".
  - IF the AskUserQuestion input has an unexpected shape, THEN the AI Agent
    Panel shall handle it as an ordinary permission request.
  - The AI Agent Panel shall title the form "Claude has a question", or
    "Claude has questions" when it holds several.
  - WHILE the form waits, the AI Agent Panel shall show how many of its
    questions are answered as "N of M answered".
- **PRD-002.R13** — File checkpoints.
  - The AI Agent Panel shall start every Claude Code process with
    `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`, added to `WSLENV`
    without dropping the user's entries when the profile runs via WSL
    (ADR-006).
  - WHEN a turn finishes, the AI Agent Panel shall record with it the
    session id its result reports, the CLI profile that ran it, and whether
    the main agent called Edit, Write, MultiEdit or NotebookEdit.
  - The AI Agent Panel shall store no file contents for restoring.
  - WHEN the plugin loads and a legacy
    `.obsidian/plugins/ai-agent-panel/checkpoints/` folder exists, the AI
    Agent Panel shall delete it.
  - IF deleting the legacy folder fails, THEN the AI Agent Panel shall
    continue loading and try again on the next load.
- **PRD-002.R14** — Restore files.
  - WHEN a turn finishes in which the main agent called Edit, Write, MultiEdit
    or NotebookEdit and Claude Code reported the turn's user-message id, the
    AI Agent Panel shall add "Restore files" to the turn's footer, kept when
    the conversation is reopened.
  - WHILE the turn's session id or profile is not the tab's, the AI Agent
    Panel shall hide its Restore files button.
  - WHILE a turn is running in the tab, the AI Agent Panel shall disable
    Restore files.
  - WHEN the user presses Restore files, the AI Agent Panel shall have
    Claude Code preview the rewind, starting the session's CLI without a
    prompt if none runs.
  - WHILE a restore is between its preview and its end, the AI Agent Panel
    shall send nothing from that tab.
  - IF the CLI cannot start for a restore, THEN the AI Agent Panel shall
    show the error and keep the conversation's stored session id.
  - WHEN the preview lists files, the AI Agent Panel shall open a
    confirmation listing each file, marking those outside the vault, with
    the lines added and removed, and warning that later edits to those files,
    by later turns, the user, another tab or another tool, are lost and that
    tracked files created after the turn are deleted permanently.
  - IF the preview lists no file, THEN the AI Agent Panel shall show
    "Nothing to restore." and open no confirmation.
  - IF Claude Code reports it cannot rewind, THEN the AI Agent Panel shall
    show Claude Code's error, or "That restore point is no longer available."
    when it gives none, and hide the button.
  - WHEN the user confirms, the AI Agent Panel shall have Claude Code
    return the files to their state before the turn.
  - WHEN the rewind ends, the AI Agent Panel shall show
    `Files restored: N.`, followed by `N skipped.` when Claude Code skipped
    any, and re-read the listed files that lie in the vault into the change
    list.
  - IF the rewind fails, times out or its CLI exits, THEN the AI Agent Panel
    shall show the error, warn that some files could already be rewound, and
    re-read the listed files that lie in the vault.
  - WHILE a turn precedes a clear, the AI Agent Panel shall hide its Restore
    files.
  - WHEN an Undo removes the clear after a turn, the AI Agent Panel shall
    offer that turn's Restore files again only under this requirement's other
    conditions.
- **PRD-002.R15** — Branch.
  - WHEN a turn finishes and the CLI has reported that turn's user-message id,
    the AI Agent Panel shall add "Branch" to the turn's footer.
  - WHEN the user presses Branch, the AI Agent Panel shall open a new tab with
    the same model, effort and mode, on the CLI profile that turn's record
    names, else the conversation's, titled per PRD-001.R7, whose CLI forks the
    session of that turn's segment and rewinds it to just before that turn
    ahead of the branch's first message.
  - The AI Agent Panel shall take as the session of a turn's segment the
    session id its turn record holds; for a turn recorded without one, the
    session the first later clear or fresh start (PRD-003.R1) ended; for a
    turn with neither, the conversation's session.
  - IF the session of a turn's segment cannot be determined this way, or its
    recorded session id was discarded (PRD-003.R4), THEN the AI Agent Panel
    shall hide that turn's Branch.
  - IF the session of a turn's segment is not one this device recorded for
    that profile (PRD-003.R4), or this device lacks that profile, THEN the AI
    Agent Panel shall show that turn's Branch disabled, titled "This turn's
    Claude Code session is not available on this device".
  - The AI Agent Panel shall title every Branch button "Branch from just
    before this turn, in a new tab".
  - The AI Agent Panel shall leave the original conversation, its
    messages and its CLI session unchanged by a branch.
  - WHEN the branch tab opens, the AI Agent Panel shall show only the
    note `Branched from "<title>". Claude keeps everything up to that point in
    context; this conversation's later turns are not part of the branch.`
  - IF the turn has no later clear and no recorded session id, and neither
    the running session nor the stored conversation has one, THEN the AI Agent
    Panel shall show "This conversation
    has no CLI session to branch from yet." and open no tab.
  - The AI Agent Panel shall name in the rewind, as the last user message
    seen, the latest one the original conversation recorded in the session of
    that turn's segment (or recorded without a session, in older files), read when the
    rewind is sent, or none when it recorded none.
  - IF Claude Code refuses the rewind, the rewind fails, or the forked CLI
    ends before it answers, THEN the AI Agent Panel shall send nothing, end
    the forked CLI, show only `Could not branch from that turn: <why> Nothing
    was sent; your message is back in the message box.`, mark the unsent
    messages "Not sent", also when reopened, put their text and images back
    in the composer, and fork and rewind again on the branch's
    next send, also after the branch is closed and reopened. <why> is "the
    original conversation has messages this panel did not see. Send a
    message there, then branch again." for a stale target or an unseen later
    turn, "Claude Code no longer has it." for a target not found, "Claude
    Code exited before cutting the conversation." for a CLI that ended, and
    Claude Code's own error otherwise.
  - WHEN the branch's CLI reports its own session id, the AI Agent Panel
    shall resume that id without forking again on later restarts.
- **PRD-002.R16** — `!` shell escape.
  - WHERE the shell escape is on (the default), WHEN the user sends text
    starting with `!` followed by a command, the AI Agent Panel shall
    run the command locally with the vault as working directory and send
    nothing to Claude.
  - The AI Agent Panel shall run only commands the user sends from the
    composer, never text from model output.
  - The AI Agent Panel shall pass the command as one argument to
    `/bin/sh -c` on macOS and Linux, `%ComSpec% /d /s /c` on Windows, or
    `wsl.exe --cd <vault> --exec sh -lc` when the conversation's profile runs
    via WSL, with no input stream.
  - WHILE a turn is running, the AI Agent Panel shall still run `!`
    commands at once rather than queue them.
  - WHILE the command runs, the AI Agent Panel shall show a Shell card
    with status "running".
  - WHEN the command ends, the AI Agent Panel shall show on the card the
    status "done", `exit N`, "timed out" or "failed", the elapsed time, and
    stdout and stderr, or "No output.".
  - IF the command runs longer than 60 s, THEN the AI Agent Panel shall
    kill it and mark the card "timed out".
  - IF a stream exceeds 100 000 characters, THEN the AI Agent Panel
    shall cut it there with a line saying so.
  - IF the shell cannot start, THEN the AI Agent Panel shall mark the
    card "failed" with the error text.
  - WHEN the user presses "Add output to chat", the AI Agent Panel shall
    put the command, its fenced output and any timeout, error or exit-code note
    into the composer without sending it.
  - WHERE the shell escape is off, the AI Agent Panel shall send `!`
    text to Claude as an ordinary message.
  - IF nothing follows the `!`, THEN the AI Agent Panel shall send the
    text to Claude as an ordinary message.
  - WHEN the command ends, the AI Agent Panel shall show
    "Claude hasn't seen this" beside "Add output to chat".
- **PRD-002.R17** — Plan approval.
  - WHEN Claude Code asks permission for ExitPlanMode, the AI Agent Panel
    shall show the whole proposed plan on the card, rendered as Markdown
    through the boundary of PRD-001.R17, without the user opening "Full
    input".
- **PRD-002.R18** — Restore to before turn N.
  - WHILE a turn of the conversation offers Restore files (R14), the AI Agent
    Panel shall offer "Restore to before turn N" in the changed-files popover,
    N being the number of the prompt that opened the earliest such turn.
  - The AI Agent Panel shall title "Restore to before turn N" "Rewinds every
    file Claude edited from turn N on, including files this list does not
    show. Changes by subagents, shell commands, vault tools and linked files
    stay."
  - WHEN the user presses "Restore to before turn N", the AI Agent Panel shall
    run Restore files (R14) for the earliest turn that offers it.
  - WHILE a turn is running in the tab, the AI Agent Panel shall disable
    "Restore to before turn N".
  - WHILE the conversation's change list is empty, as after a reopen, the AI
    Agent Panel shall offer the rewind only through each turn's Restore files
    (R14).

Every accepted ID must appear in an automated test name or an explicit manual
verification row before release close.

## Non-goals

- Rewinding a conversation in place: it destroys the original; branching keeps
  it (recorded, docs/current/design/DES-004-permission-and-change-control.md).
- Plugin-owned copies of file contents for restoring: the pre-edit read can
  land after the write, and the copies sit inside the vault (ADR-006).
- Undoing one turn without later ones: Claude Code rewinds to a point
  (ADR-006).
- Restoring changes made by shell commands, subagents other than a
  foreground forked skill, the vault tools, linked files or directories:
  Claude Code's checkpoints do not track them (ADR-006).
- Bypass as a default, or Auto-approve implemented as Bypass: the first is
  unsafe (recorded, docs/current/COMPARISON.md); the second would drop Claude
  Code's deny rules and hooks (recorded, `src/settings-core.ts`).
- Offering Claude Code's own `auto` classifier mode in the menu: shown when
  reported, never offered; reason not recorded.
- Routing `!` commands through permission prompts: the user typed the command,
  so there is no model decision to approve (recorded,
  docs/current/SECURITY.md).

## Security and privacy

- Consent: in "Ask before acting" every call Claude Code asks about (edits,
  shell, web, vault tools) waits for a card; Claude Code's own rules decide
  which calls ask. "Accept edits" lets Claude Code approve file edits itself.
- Auto-approve waives every card Claude Code would raise, shell commands and
  vault-tool writes included, except requests Claude Code flags (R9);
  Claude Code's deny rules and hooks still apply. It is not behind the
  bypass setting.
- Bypass switches Claude Code's permission checks off. Every conversation
  launched while the setting was on carries
  `--allow-dangerously-skip-permissions` (PRD-001.R25 says for how long), so
  any of them can be switched into Bypass.
- "Always allow" writes Claude Code's suggested rule, unchanged, into Claude
  Code's configuration; the panel cannot revoke it.
- Synced settings: "Default permission mode" (Auto-approve included),
  "Bypass-permissions mode", the shell-escape toggle and the CLI profile
  (executable, extra arguments) stay on the device by default
  (PRD-001.R24); a stored default mode outside the setting's options resets
  on load (R8). Once the user switches one to synced, a synced or shared
  `data.json` sets it on every device, the executable included.
- A conversation file stores its mode; a stored Auto-approve applies on
  reopen only after the user confirms (R9), and a stored Bypass only while
  the bypass setting is on (R10).
- The `!` escape runs with the user's full account rights, outside every
  permission check, and is on by default.
- Claude Code's file checkpoints hold full pre-edit contents of each file
  they track, as plain text under `~/.claude/file-history/`, until Claude
  Code's 100-checkpoint cap, its cleanup (30 days by default) or
  `claude purge`; deleting the conversation does not remove them (ADR-006).
- A confirmed restore can rewrite files outside the vault that the main
  agent edited (ADR-006).
- Permission decisions are recorded nowhere; history keeps the tool call and
  its result only (PRD-003).

## Failure and recovery

- A tab closed with prompts pending, once the user confirms (PRD-001.R7),
  kills its CLI without answering them.
- The pre-edit read starts when a call is announced, and Auto-approve waits
  for it before answering (R6). In Accept edits, Bypass and under allow rules
  Claude Code decides without the panel and can write first, leaving a diff
  of the already-edited file (inferred, unverified).
- Claude Code skips a linked file, a file whose folder no longer resolves to
  where it was, and an unreadable backup, and counts them as skipped.
- A branch rewinds the conversation, not files: the vault stays as the
  original tab left it.
- A restore also undoes edits made after the turn to the listed files, by the
  user, another tab or another tool; the confirmation lists the files but
  shows no diff.

## Open questions

None.
