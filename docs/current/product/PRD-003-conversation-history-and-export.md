# PRD-003 — Conversation history and export

**Status:** accepted (2026-10-11)

## Problem

Claude Code keeps its own session transcripts, but resuming a session does not
replay its messages, the CLI cannot list sessions, and under WSL the files sit
on another filesystem (`src/history.ts:12-20`). Without its own record the
panel could not show an earlier conversation, continue it, or turn it into a
note. Users want to reopen, keep at hand, delete and export conversations from
inside Obsidian (README Features).

## Users and jobs

Obsidian desktop users of the panel (PRD-001):

- Find and reopen an earlier conversation, and continue it where it stopped.
- Keep important conversations at hand by pinning them.
- Delete a conversation they no longer want.
- Keep a readable Markdown copy of a conversation in the vault.

## Requirements

- **PRD-003.R1** — Conversation file.
  - The AI Agent Panel shall store each conversation that has at least one
    message as one JSON file at
    `.obsidian/plugins/ai-agent-panel/history/<id>.json`.
  - The AI Agent Panel shall store with each conversation its id, CLI session
    id, CLI profile id, title, creation and update times, model, effort,
    permission mode and whether the user picked it, export path, and pin flag
    and time.
  - The AI Agent Panel shall record each prompt with its context paths and
    image count, and each `!` shell run, reply, thinking block, and tool call
    with its result.
  - The AI Agent Panel shall record each turn's meta: duration, cost
    (PRD-005.R7), error, turn number, and restore and branch markers.
  - The AI Agent Panel shall record each prompt's send time.
  - The AI Agent Panel shall record each completed clear with its time and the
    id of the session it ended.
  - WHEN the AI Agent Panel starts a session without resuming in a
    conversation whose last turn follows its last clear or fresh start, it
    shall record a fresh start with its time and the session id it did not
    resume, if any.
  - The AI Agent Panel shall record each compaction with its time, its tokens
    before and after where reported, and the summary where supplied.
  - WHEN an Undo completes (PRD-001.R38), the AI Agent Panel shall remove the
    clear's record and store the resumed session id as the conversation's
    session id.
  - WHILE a conversation holds a clear or a fresh start, the AI Agent Panel
    shall store it in a format version that earlier versions refuse to open.
- **PRD-003.R2** — Saving.
  - WHEN a message is recorded, the AI Agent Panel shall save the
    conversation 1 s after the last recorded message, merging saves that
    arrive sooner.
  - WHEN a tab or the panel closes, the AI Agent Panel shall save its
    conversation at once.
  - WHEN the AI Agent Panel saves a conversation, other than for a pin
    change, an export, or a tab or panel close that writes no newly recorded
    message, the AI Agent Panel shall set its update time to the save time.
  - IF a save fails, THEN the AI Agent Panel shall log the failure to
    the developer console and keep the conversation in memory.
  - IF a save fails, THEN the AI Agent Panel shall show a Notice, at most
    once per conversation until the plugin reloads.
  - WHEN a conversation's CLI process ends with an error (PRD-001.R6), the AI
    Agent Panel shall record the error, cut to 500 characters, as a failed
    turn.
- **PRD-003.R3** — What history leaves out.
  - The AI Agent Panel shall store tool inputs in full and cut each
    tool result and each `!` stdout and stderr stream to its first 1500
    characters.
  - The AI Agent Panel shall store pasted images as a count only and
    keep tool-result images, subagent threads, background tasks and permission
    decisions out of history.
  - The AI Agent Panel shall keep report cards in or out of history as
    PRD-001.R20 specifies.
- **PRD-003.R4** — Identity and integrity.
  - The AI Agent Panel shall name conversation files only with ids
    matching `^[A-Za-z0-9_-]+$` and take a conversation's id from its file
    name when reading it.
  - IF a history file is unreadable, is neither version 1 nor version 2, has no message list, or
    has a name that is not a safe id, THEN the AI Agent Panel shall skip
    it, logging read and parse failures to the developer console.
  - IF a read, write or delete names an unsafe id, THEN the AI Agent Panel shall read, write or remove no conversation file for it.
  - IF a stored model, effort or profile id starts with `-` or contains
    whitespace, THEN the AI Agent Panel shall discard it and treat it as
    absent, so no stored value can reach the command line as a flag.
  - IF a stored session id (the conversation's, a turn's, a clear's, a fresh
    start's, a pending branch's or a fork base's) is not a lowercase UUID,
    THEN the AI Agent Panel shall not use it, on load and again before passing
    it to the CLI.
  - The AI Agent Panel shall record on this device, outside the conversation
    file, each session id the CLI reports in a conversation, with the
    conversation and the CLI profile that ran it, and, when the user branches,
    the source session id with the branch conversation and the branch's
    profile.
  - IF a stored session id is not recorded on this device for that
    conversation and the profile that would run it, THEN the AI Agent Panel
    shall not use it to resume, fork, branch or undo.
  - WHEN this version first lists the history folder in full on a device whose
    history folder holds no migration mark and whose own record is unset, the
    AI Agent Panel shall record the session ids then stored in each
    conversation for its stored profile if the device has it, or for the
    default profile if the conversation stores none, and then write the mark
    into the history folder.
  - IF the history folder holds the mark, or the device's record is set but
    unreadable, THEN the AI Agent Panel shall record no session id from the
    history folder, so conversations it did not record count as not recorded,
    and log an unreadable record to the developer console.
  - IF writing the record fails, THEN the AI Agent Panel shall log it to the
    developer console and keep using the ids it holds until the plugin
    reloads.
  - The AI Agent Panel shall keep a turn's or a clear record's session id it
    does not use in the file as stored, so it is rejected again after a reload
    and never read as a missing id.
- **PRD-003.R5** — Title. The rule is PRD-001.R7.
  - The AI Agent Panel shall store each conversation's title, as
    PRD-001.R7 sets it, in its conversation file.
- **PRD-003.R6** — Conversation index.
  - WHEN the panel opens, the AI Agent Panel shall scan the history
    folder once in the background and keep the conversation list current from
    its own saves and deletes afterwards.
  - IF a save or delete happens during the scan, THEN the AI Agent Panel shall keep that change over what the scan read.
  - IF a pin or export happens during the scan, THEN the AI Agent Panel shall
    list the conversation with the pin and export state it saved, whatever the
    scan read for it.
  - IF the history folder cannot be listed, THEN the AI Agent Panel
    shall finish the scan with the conversations already known.
  - IF conversation files arrive from outside the plugin, such as by sync,
    THEN the AI Agent Panel shall list them after the panel next opens.
- **PRD-003.R7** — Pin storage.
  - WHEN a conversation is pinned or unpinned (PRD-001.R9), the AI Agent Panel
    shall write the pin flag and pin time into its conversation file.
  - IF the conversation cannot be loaded, THEN the AI Agent Panel shall show
    "Could not load that conversation." and change nothing.
  - IF the conversation has no messages yet, a fresh tab's included, THEN the
    AI Agent Panel shall hold the pin in memory and write it with the first
    message.
- **PRD-003.R8** — Deletion.
  - WHEN a conversation is deleted (PRD-001.R10), the AI Agent Panel shall
    remove its conversation file.
  - The AI Agent Panel shall leave exported notes and Claude Code's own
    session transcripts and file checkpoints in place when it deletes a
    conversation.
  - WHEN a conversation is deleted, the AI Agent Panel shall forget the
    session ids recorded for it on this device (R4).
  - IF successful listings of the history folder have found no file named for
    a conversation for 30 days, THEN the AI Agent Panel shall forget the
    session ids recorded for it on this device.
- **PRD-003.R9** — Reopen and resume.
  - WHEN the user opens a stored conversation (column, picker or tab restore,
    PRD-001) that is already open, the AI Agent Panel shall switch to its tab.
  - WHEN the user opens a stored conversation that is not open, the AI Agent
    Panel shall show it, with its stored messages re-rendered, in the active
    tab if that tab is empty, else in a new tab.
  - WHEN a stored conversation is reopened, the AI Agent Panel shall restore
    its model and effort picks, "Default" included, its CLI profile and its
    permission mode (Auto-approve: PRD-002.R9).
  - IF a reopened conversation's stored CLI profile no longer exists, THEN
    the AI Agent Panel shall reopen it on the default profile.
  - WHEN the user sends the first message in a reopened conversation, the AI
    Agent Panel shall start its CLI resuming the stored session id.
  - The AI Agent Panel shall number a reopened conversation's new turns
    on from its highest stored turn.
  - IF a resumed CLI ends with an error before reporting a session id, THEN
    the AI Agent Panel shall drop the stored session id and add "Could
    not resume the original session - your next message starts a fresh one
    (the restored messages above are kept)." to the error.
  - WHEN a conversation that holds clears or compactions is reopened, the AI
    Agent Panel shall show their dividers, with the messages above each clear
    dimmed and folded as PRD-001.R38 specifies.
  - IF a reopened conversation's stored session id cannot be used (R4), THEN
    the AI Agent Panel shall start its next session fresh and show "This
    conversation's Claude Code session is not available on this device, so
    this message starts a fresh one (the messages above are kept)."
- **PRD-003.R10** — Manual export.
  - WHEN the user runs "Export conversation to Markdown" or a row's "Export to
    Markdown", the AI Agent Panel shall write the conversation's note
    whatever the auto-export setting, store its path without changing the
    update time, and show `Exported to <path>`.
  - IF the conversation has no messages, THEN the AI Agent Panel shall
    show "Nothing to export yet."
  - IF writing the note fails, THEN the AI Agent Panel shall show
    `Export failed: <message>`.
  - IF the conversation cannot be loaded, THEN the AI Agent Panel shall show
    "Could not load that conversation."
- **PRD-003.R11** — Automatic export.
  - WHERE "Export transcripts to Markdown" is on (off by default), the AI
    Agent Panel shall regenerate the conversation's note in full before
    every history save.
  - IF an automatic export fails, THEN the AI Agent Panel shall log it
    to the developer console and still save the history.
  - WHILE the active conversation has an exported note, the AI Agent Panel
    shall show a "Transcript" button that opens it, placed as PRD-001.R30
    specifies, or in the "More" menu while the main column is narrower than
    360 px.
  - IF that note no longer exists, THEN the AI Agent Panel shall show
    `Exported note not found: <path>`.
- **PRD-003.R12** — Note location.
  - The AI Agent Panel shall name a new note `<folder>/<pattern>.md`,
    with defaults folder "Agent Chats", pattern `{date} {title}` and date
    format `YYYY-MM-DD`, where `{date}` is the conversation's start, `{title}`
    its title, `{id}` its id, and `/` in the pattern makes subfolders.
  - The AI Agent Panel shall fill `{title}` with the title after replacing
    `\ / : * ? " < > | # ^ [ ]` with spaces, collapsing whitespace and cutting
    it to 60 characters, or with "Conversation" when nothing remains.
  - The AI Agent Panel shall replace the same characters except `/` with
    spaces in each segment of the expanded pattern, drop empty, `.` and `..`
    segments, and use `{title}` alone when nothing remains.
  - The AI Agent Panel shall take the export folder as typed, without
    replacing characters, drop its empty, `.` and `..` segments, and use
    "Agent Chats" when nothing remains.
  - IF a note with the chosen name exists, THEN the AI Agent Panel shall
    append " 2", " 3" and so on.
  - WHEN a conversation is exported again, the AI Agent Panel shall
    reuse its stored note path only if it is a `.md` file inside the current
    export folder with no empty, `.` or `..` segment, and otherwise assign a
    new path.
  - The AI Agent Panel shall write notes through Obsidian's vault API
    and create missing folders.
  - WHILE "Export transcripts to Markdown" is off, the AI Agent Panel shall
    hide the folder, note name pattern and date format settings, which
    manual export still uses.
- **PRD-003.R13** — Note format.
  - The AI Agent Panel shall start the note with frontmatter `title`
    ("Conversation" when unset), `created`, `updated` (local
    `YYYY-MM-DD HH:mm`) and, each only when set, `model`, `effort`, `session`
    and `cost_usd` (meaning: PRD-005.R7).
  - The AI Agent Panel shall render each prompt as a `> [!question]+ You`
    callout, titled `You - <context label>` when it has a context label but
    no context paths, with a "Context:" line of links (files as wiki links,
    folders as `obsidian://search` links) and an "Attached: N image(s)" line.
  - The AI Agent Panel shall render each `!` shell run and tool call as a
    collapsed `> [!example]-` callout with its output fenced and a failure,
    non-zero exit or timeout marked in the title.
  - The AI Agent Panel shall render thinking as a collapsed
    `> [!quote]- Thinking` callout.
  - The AI Agent Panel shall render a failed turn as a
    `> [!failure] Turn failed` callout holding the error.
  - The AI Agent Panel shall render replies, report cards included, as plain
    Markdown.
  - The AI Agent Panel shall write replies and thinking so that rendering the
    note runs no other plugin's processor on an inline code span or on a code
    fence whose language is not on the allowlist of PRD-001.R17.
  - The AI Agent Panel shall write replies and thinking so that rendering the
    note loads no remote image or other remote embed.
  - The AI Agent Panel shall render each other turn meta as an italic
    duration and cost line.
  - The AI Agent Panel shall put a horizontal rule before every prompt
    that follows another rendered message.
  - The AI Agent Panel shall escape ``\ ` * _ ~ = < > [ ]`` with a backslash
    in callout titles.
  - The AI Agent Panel shall fence output with four backticks and break any
    run of four backticks inside it, so the fence cannot close early.
  - The AI Agent Panel shall render each clear as the italic line "Context
    cleared at HH:MM".
  - The AI Agent Panel shall render each compaction as the italic line
    "Compacted at HH:MM, <before> to <after> tokens", leaving out a count that
    was not reported.

Every accepted ID must appear in an automated test name or an explicit manual
verification row before release close.

## Non-goals

- Claude Code's transcripts in `~/.claude/projects` as the history: resuming
  does not replay messages, the CLI cannot list sessions, and under WSL the
  files sit on another filesystem (recorded, `src/history.ts:12-20`).
- The exported note as the source of truth: the JSON stays authoritative
  (recorded, docs/current/design/DES-005-persistence-and-sync.md), so edits made to an exported note
  are overwritten when it is regenerated.
- Undoing a deletion: files are removed, not trashed; the confirmation stands
  in for undo (recorded, `src/history.ts:408-412`).
- Storing images, subagent threads and background tasks: live only by design
  (recorded, docs/current/design/DES-005-persistence-and-sync.md, docs/current/SECURITY.md).
- Bounding history size: no limit on conversation count, file size or age;
  reason not recorded.

## Security and privacy

- History holds conversation text, full tool inputs (including file contents
  carried by Write and Edit calls, and shell command lines), results up to
  1500 characters, context paths, and panel command cards: `/status` shows the
  account email and organization, `/memory` and `/hooks` show paths and hook
  commands.
- It is plain, unencrypted JSON in the plugin folder. Obsidian Sync does not
  copy the `history/` folder (Obsidian's documented behavior, not verifiable
  here); tools that mirror the whole vault folder do. Uninstalling deletes the
  folder.
- Exported notes are ordinary vault notes: synced, indexed and readable by
  other plugins, including ones that execute note content (inferred); model
  text in them reaches no code processor and loads no remote image or embed (R13).
- Deleting a conversation removes its file only; exported notes, Claude
  Code's transcripts under `~/.claude/projects` and its file checkpoints under
  `~/.claude/file-history` remain.
- History files are untrusted on read: ids are pinned to file names and the
  stored export path is re-validated before each overwrite. A stored
  Auto-approve applies on reopen only after the user confirms (PRD-002.R9).
- Compaction summaries, which Claude Code writes from the conversation, are stored with it like replies; clear and fresh-start records store session ids. A stored session id is used only if it is a lowercase UUID this device recorded for that conversation and CLI profile, in device-local storage (R4); conversations present when this version first ran on the first device to upgrade are trusted as they then stood.

## Failure and recovery

- A crash before the save fires loses what was recorded since the last write;
  the wait is 1 s after the last recorded message, so it grows while messages
  keep arriving (inferred).
- A failed save is logged and shown once per conversation until the plugin
  reloads (R2).
- Two devices writing the same conversation file through a folder-mirroring
  tool: the last write wins (inferred).

## Open questions

None.
