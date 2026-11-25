#!/usr/bin/env bash
# SubagentStop hook: saves an in-flight subagent's final message to $AGENTIC_RUN_STATE/reports/<job>-s<epoch>.md,
# so a hand-back that never reaches the orchestrator still lands on disk. No-op outside a run. An interim stop, while
# another in-flight job with the agent's worktree has a live pid (its gate or test run), is not a hand-back: skipped.
# Never blocks the stop: every jq call is time-bounded and the hook always exits 0. The report is written inside the reports
# folder, entered once and, when workspace.sh linked it, checked against the identity in $S/reports.id; on a mismatch it
# goes to $S/captured/ instead, and the heartbeat alarms on the moved folder.
P=$(basename "$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")")
S=${AGENTIC_RUN_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/agentic-run/$P}; [ -s "$S/inflight.tsv" ] || exit 0
in=$(cat); id=$(timeout 10 jq -r '.agent_id // empty' <<<"$in" 2>/dev/null)
tr=$(timeout 10 jq -r '.agent_transcript_path // empty' <<<"$in" 2>/dev/null)
[ -n "$id" ] && [ -f "$tr" ] && tr=$(readlink -f -- "$tr") || exit 0
# The job registered this exact agent id or transcript path (both resolved); a substring would let id a1 claim a10's stop.
IFS=$'\t' read -r job dir < <(awk -F'\t' -v id="$id" -v tr="$tr" '$3 != "-" && ($3 == id || $3 == tr) { print $1 "\t" $4; exit }' "$S/inflight.tsv")
[ -n "$job" ] || exit 0
# A pid counts while it runs with the start time heartbeat.sh add recorded (field 22 of /proc/<pid>/stat), not a reuse.
# A pid that exits between kill -0 and the read is gone, not alive; without /proc the start time is not checked.
started() { local s f; s=$(cat "/proc/$1/stat" 2>/dev/null) || { [ ! -d /proc/self ]; return; }; read -ra f <<< "${s##*) }"
  [ ! -s "$S/hb/$2.start" ] || [ "${f[19]:-}" = "$(cat "$S/hb/$2.start")" ]; }
if [ -n "$dir" ] && [ "$dir" != - ]; then
  while IFS=$'\t' read -r j _ _ d _ _ pid; do
    [ "$j" != "$job" ] && [ "$d" = "$dir" ] && [ -n "$pid" ] && [ "$pid" != - ] && kill -0 "$pid" 2>/dev/null && started "$pid" "$j" && exit 0
  done < "$S/inflight.tsv"
fi
n="$job-s$(date +%s).md"
body=$(timeout 10 jq -rs '[.[] | select(.type == "assistant") | .message.content[]?
  | if .type == "text" then .text elif (.type == "tool_use" and .name == "SubagentHandback") then .input.message else empty end]
  | last // "(no final message in the transcript)"' "$tr" 2>/dev/null) || exit 0
id=; read -r id _ 2>/dev/null < "$S/reports.id"; [ -L "$S/reports" ] || mkdir -p "$S/reports" 2>/dev/null
( cd -P "$S/reports" 2>/dev/null && { [ -z "$id" ] || [ "$(stat -c %d:%i .)" = "$id" ]; } \
  && t=$(mktemp ".$n.XXXXXX") && printf '%s\n' "$body" > "$t" && chmod "$(printf %o $((0666 & ~0$(umask))))" "$t" && mv -T "$t" "$n" ) \
  || { mkdir -p "$S/captured" && printf '%s\n' "$body" > "$S/captured/$n"; }
exit 0
