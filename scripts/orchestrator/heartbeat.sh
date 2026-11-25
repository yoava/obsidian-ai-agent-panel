#!/usr/bin/env bash
# agentic-sdlc orchestrator heartbeat; rules in docs/current/runbooks/orchestration.md. Modes:
#   start   launch the daemon as a transient systemd user unit (idempotent); the unit gets the caller's AGENTIC_HOST,
#           AGENTIC_GATE_LOCKS, CLAUDE_CONFIG_DIR, XDG_STATE_HOME and limits.env keys, which it would not inherit
#   run     daemon: every HB_EVERY s measure each job, append actionable events to $S/events.log, write
#           $S/liveness.txt, and wake the session or alarm the owner when the orchestrator stops listening or acting;
#           after HB_STALL alarms in a row $S/status reads STALLED until the guard passes again
#   watch   the orchestrator's Monitor command: streams events from where the last watch stopped; exits at lease end
#   status  read-only measured snapshot (answer "Status?" with it)
#   add J kind id dir out due [pid]  register job J right after its launch: kind agent|reader|shell (reader: a read-only
#           agent, worktree optional, its idle goes to $S/quiet.log only), id the agent id or its transcript's absolute
#           path (an existing file, stored resolved; both matched exactly), "-" = none, due in minutes or a DUE_* name;
#           rejects an agent without a worktree and a job whose pid is not above 1 and live; records the pid's start
#           time in $S/hb/J.start, so a pid reused by another process counts as gone; resets and acks J
#   done J  retire job J once its last report or exit is handled: ack it, clear its pending events, remove its row
#   reset J clear job J's state (add does it); a reused name's .exit and .pid move aside as <file>.<epoch>
#   ack J   mark job J's reports and current events handled; a held event re-emits after HB_REPEAT
# $S/inflight.tsv, written only by add and done: job kind agent_id dir out_file due_epoch pid ("-" = none).
# Reports: $S/reports/<job>-rN.md (agent) and <job>-s<epoch>.md (SubagentStop capture); reports/ may link to an owner-visible folder.
# Event cap: tool calls and last-turn tokens from the agent's transcript, agent-<id>.jsonl or <session-id>.jsonl under
# ${CLAUDE_CONFIG_DIR:-~/.claude}/projects/ (any project: the session's folder is not known here); an id that names more
# than one file there fires "transcript" and is read from none: register the transcript's path instead.
# A job with a live gate-slot.sh ticket is queued: one naming its worktree or a folder in it, or one naming the job from
# this repository (the same git common directory; the queue is host-wide, and another project may reuse a job name).
set -u
D=$(dirname "$(readlink -f "$0")"); P=$(basename "$(dirname "$(dirname "$D")")"); U=agentic-heartbeat-$P
S=${AGENTIC_RUN_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/agentic-run/$P}; IN=$S/inflight.tsv H=$S/hb EV=$S/events.log
Q=${AGENTIC_GATE_LOCKS:-${XDG_STATE_HOME:-$HOME/.local/state}/agentic-run/gate-slots}/queue C=${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects
E=(); if [ "${1:-}" = start ]; then # read before limits.env gives every key its default
  for k in AGENTIC_HOST AGENTIC_GATE_LOCKS CLAUDE_CONFIG_DIR XDG_STATE_HOME $(sed -n 's/^\([A-Z][A-Z_]*\)=.*/\1/p' "$D/limits.env"); do
    [ -z "${!k:-}" ] || E+=("--setenv=$k=${!k}"); done; fi
. "$D/limits.env"
# A reports link is workspace.sh init's (a dangling one alarms in guard); otherwise reports/ is a plain folder.
mkdir -p "$H"; [ -L "$S/reports" ] || mkdir -p "$S/reports"; touch "$IN" "$EV"
reps() { # job: its reports, newest first: <job>-r<digits>.md and <job>-s<digits>.md only, so fix-s1-r1.md is not job fix's
  local f; ls -t "$S/reports/$1"-[rs][0-9]*.md 2>/dev/null | while IFS= read -r f; do
    [[ ${f#"$S/reports/$1"-} =~ ^[rs][0-9]+\.md$ ]] && printf '%s\n' "$f"; done; }
ago() { echo $(( ($(date +%s) - $1) / 60 )); }
hm() { if [ "$1" = - ]; then echo -; else date -d @"$1" +%H:%M; fi; }
emit() { echo "HB $(date +%H:%M) $*" >> "$EV"; }
row() { # job [line]: drop job's row, append line if given; atomic for readers, serialized for writers
  ( flock 9 || exit 1; awk -F'\t' -v j="$1" '$1 != j' "$IN" > "$IN.tmp" || exit 1
    if [ -n "${2:-}" ]; then printf '%s\n' "$2" >> "$IN.tmp"; fi; mv "$IN.tmp" "$IN" ) 9> "$S/inflight.lock"; }
bad() { echo "heartbeat.sh: $*" >&2; exit 2; }
host() { echo "${AGENTIC_HOST:-$(hostname 2>/dev/null || uname -n)}"; }
pstart() { # pid: the process's start time (/proc/<pid>/stat field 22, else ps lstart); empty once it is gone
  local s f; if s=$(cat "/proc/$1/stat" 2>/dev/null); then read -ra f <<< "${s##*) }"; echo "${f[19]:-}"
  else ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' _; fi; }
alive() { # job pid: the registered process runs: the pid is live and, when add recorded one, has the same start time
  local r; kill -0 "$2" 2>/dev/null || return 1; r=$(cat "$H/$1.start" 2>/dev/null); [ -z "$r" ] || [ "$(pstart "$2")" = "$r" ]; }
fresh() { # job [pid]: a new round. Exit and pid markers of an earlier run move aside as <file>.<epoch>, never deleted
  # (a pid marker naming pid, the live process this launch registers, stays); other state is cleared; reports count as read.
  # Only this job's own files are cleared, each known by its suffix: fix-2.8.1.ack belongs to job fix-2.8.1, not to fix-2.8.
  local f n t i k=${2:--}; t=$(date +%s)
  for f in "$H/$1.exit" "$H/$1.pid"; do [ -e "$f" ] || continue
    [ "$f" = "$H/$1.pid" ] && [ "$k" != - ] && [ "$(cat "$f" 2>/dev/null)" = "$k" ] && kill -0 "$k" 2>/dev/null && continue
    n=$f.$t i=0; while [ -e "$n" ]; do i=$((i + 1)); n=$f.$t.$i; done; mv -- "$f" "$n"; done
  for f in "$H/$1".*; do case "${f#"$H/$1".}" in ev.*.*|quiet.*.*) ;;
    ack|prev|act|prog|usage|transcript|qtotal|qstart|ev.*|quiet.*|rep."$1"-[rs][0-9]*.md) rm -f -- "$f" ;; esac; done
  touch "$H/$1.ack"; }
add() { # job kind id dir out due [pid]
  [ $# -ge 6 ] || bad "usage: add <job> <agent|reader|shell> <agent-id|-> <worktree|-> <output|-> <due-min|DUE_*|-> [pid]"
  local j=$1 k=$2 id=$3 dir=$4 out=$5 due=$6 pid=${7:--} m d st=
  case "$*" in *$'\t'*|*$'\n'*) bad "a field holds a tab or newline" ;; esac
  case "$j" in ""|-|*/*|*" "*) bad "job name '$j': empty, '-', or holds a slash or space" ;; esac
  case "$k" in agent|reader|shell) ;; *) bad "kind '$k': not agent, reader or shell" ;; esac
  case "$id" in -) ;; /*.jsonl) d=$(readlink -f -- "$id") && [ -f "$d" ] || bad "transcript '$id' is not an existing file"; id=$d ;;
    ""|*[!A-Za-z0-9_-]*) bad "agent id '$id': letters, digits, '_' and '-', or a transcript's absolute path" ;; esac
  if [ "$dir" != - ]; then d=$(readlink -f -- "$dir") && [ -d "$d" ] || bad "worktree '$dir' is not a directory"; dir=$d
  elif [ "$k" = agent ]; then bad "agent job $j needs its worktree: without one it shows no activity and raises a false idle"; fi
  [ "$k" = shell ] && [ "$pid" = - ] && bad "shell job $j needs its pid: \$! at launch"
  if [ "$pid" != - ]; then case "$pid" in *[!0-9]*|""|0*|1) bad "pid '$pid' is not a number above 1" ;; esac
    kill -0 "$pid" 2>/dev/null && st=$(pstart "$pid") && [ -n "$st" ] || bad "pid $pid of $j is not running: read its log or exit marker"; fi
  case "$due" in -) ;; DUE_*) m=${!due:-}; case "$m" in ""|*[!0-9]*) bad "$due is not set in limits.env" ;; esac
    due=$(( $(date +%s) + m * 60 )) ;; ""|*[!0-9]*) bad "due '$due': minutes, a DUE_* name or -" ;; *) due=$(( $(date +%s) + due * 60 )) ;; esac
  fresh "$j" "$pid"; if [ -n "$st" ]; then echo "$st" > "$H/$j.start"; else rm -f "$H/$j.start"; fi
  row "$j" "$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s' "$j" "$k" "$id" "$dir" "$out" "$due" "$pid")"; }
fire() { # job event detail: emit once, again every HB_REPEAT s while it holds; file keeps first and last fire
  local f=$H/$1.ev.$2 now first=; now=$(date +%s); [ -f "$f" ] && read -r first last < "$f"
  [ -n "$first" ] && [ $((now - last)) -lt "$HB_REPEAT" ] && return 0; echo "${first:-$now} $now" > "$f"; emit "$2 $1 ${3:-}"; }
quiet() { # job event detail: a read-only agent's notice goes to $S/quiet.log, never to the watch or the alarm
  local f=$H/$1.quiet.$2 now last=0; now=$(date +%s); [ -f "$f" ] && read -r last < "$f"
  [ $((now - last)) -lt "$HB_REPEAT" ] && return 0; echo "$now" > "$f"; echo "HB $(date +%H:%M) $2 $1 ${3:-}" >> "$S/quiet.log"; }
transcript() { # job id: the registered transcript path, or the file named exactly by the agent id, cached in $H/<job>.transcript
  local c=$H/$1.transcript t; case "$2" in /*) [ -f "$2" ] && echo "$2"; return ;; esac
  t=$(cat "$c" 2>/dev/null); [ -n "$t" ] && [ -f "$t" ] && { echo "$t"; return; }
  [ "$2" != - ] && [ -d "$C" ] || return 0
  t=$(find "$C" -maxdepth 6 -type f \( -name "agent-$2.jsonl" -o -name "$2.jsonl" \) -print 2>/dev/null | head -2)
  case "$t" in *$'\n'*) fire "$1" transcript "agent id $2 names more than one transcript under $C: register its path"; return 0 ;; esac
  [ -n "$t" ] && t=$(readlink -f -- "$t") && echo "$t" > "$c" && echo "$t"; }
usage() { # transcript: "<tool calls> <context tokens of the last turn>"; a half-written line is skipped
  timeout 10 jq -Rrn '[inputs | fromjson? | select(type == "object" and .type == "assistant") | .message | objects] as $m
    | "\([$m[] | .content[]? | objects | select(.type == "tool_use") | .id] | unique | length) \([$m[] | .usage | objects] | last
    | (.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.output_tokens // 0))"' \
    "$1" 2>/dev/null; }
waiters() { # live gate-slot.sh tickets: epoch<TAB>job<TAB>dir<TAB>repository per line. Live as in gate-slot.sh: the pid in the name has
  # the start time on the third line (a ticket from before 2.8.1 has none: its pid runs gate-slot.sh); others are skipped
  local t b w j s p g; for t in "$Q"/*-*-*; do [ -f "$t" ] || continue; b=${t##*/} p=${t##*-}
    case "$p" in ""|*[!0-9]*) continue ;; esac; w='' j='' s='' g=''; { read -r w; read -r j; read -r s; read -r g; } 2>/dev/null < "$t"
    if [ -n "$s" ]; then [ "$(pstart "$p")" = "$s" ] || continue
    else case "$(ps -o args= -p "$p" 2>/dev/null)" in *gate-slot.sh*) ;; *) continue ;; esac; fi
    b=${b#*-}; printf '%s\t%s\t%s\t%s\n' "$((10#${b%-*}))" "$j" "$w" "$g"; done; }
sample() {
  local now job kind id dir out due pid G; now=$(date +%s); ps -eo pid=,sid=,times= > "$H/ps"; : > "$H/live.tmp"
  waiters > "$H/queued"; G=$(cd "$D" && G=$(git rev-parse --git-common-dir 2>/dev/null) && readlink -f -- "$G")
  while IFS=$'\t' read -r job kind id dir out due pid; do
    [ -n "$job" ] || continue
    local f=$H/$job head=- size=0 cpu=0 n=0 act=0 prog=0 pids="" rep la lp ph psz pc pts tr="" ts=0 calls=- tok=- qs qt state=running eff=-
    [ "$dir" != - ] && pids=$(find /proc -maxdepth 2 -name cwd \( -lname "$dir" -o -lname "$dir/*" \) -printf '%h ' 2>/dev/null | sed 's|/proc/||g')
    read -r cpu n < <(awk -v p=" $pids " -v s="$pid" 'index(p, " " $1 " ") || $2 == s { c += $3; k++ } END { print c + 0, k + 0 }' "$H/ps")
    [ "$dir" != - ] && head=$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo -)
    [ "$out" != - ] && size=$(stat -c %s "$out" 2>/dev/null || echo 0)
    if [ "$kind" != shell ]; then calls='?' tok='?'; tr=$(transcript "$job" "$id")
      if [ -n "$tr" ]; then ts=$(stat -c %s "$tr" 2>/dev/null || echo 0) # measured again only when the transcript grew
        [ "$(cut -d' ' -f1 "$f.usage" 2>/dev/null)" = "$ts" ] || echo "$ts $(usage "$tr")" > "$f.usage"
        read -r _ calls tok < "$f.usage"; calls=${calls:-?} tok=${tok:-?}; fi; fi
    if [ -f "$f.prev" ]; then
      read -r ph psz pc pts < "$f.prev"; [ "$head" != "$ph" ] && prog=1
      [ "$dir" != - ] && [ -n "$(find "$dir" \( -name .git -o -name node_modules \) -prune -o -type f -newer "$f.prev" -print -quit 2>/dev/null)" ] && prog=1
      [ "$size" != "$psz" ] && { act=1; [ "$kind" = shell ] && prog=1; }
      [ "$ts" != "${pts:-0}" ] && act=1
      [ $((cpu - pc)) -ge "$HB_CPUMIN" ] && act=1
    else echo "$now" > "$f.act"; echo "$now" > "$f.prog"; fi
    echo "$head $size $cpu $ts" > "$f.prev"
    rep=$(reps "$job" | head -1)
    [ -n "$rep" ] && [ ! -e "$f.rep.${rep##*/}" ] && { touch "$f.rep.${rep##*/}"; emit "report $job $rep"; prog=1; }
    [ $prog = 1 ] && { act=1; echo "$now" > "$f.prog"; rm -f "$f.ev.stuck"; }
    [ $act = 1 ] && { echo "$now" > "$f.act"; rm -f "$f.ev.idle" "$f.quiet.idle"; }
    # Waiting for a gate slot is neither idle nor stuck, and the wait moves the due time out.
    qs=$(awk -F'\t' -v j="$job" -v d="$dir" -v g="$G" '($2 == j && g != "" && $4 == g) || (d != "-" && ($3 == d || index($3, d "/") == 1)) {
        if (m == "" || $1 < m) m = $1 }
      END { print m }' "$H/queued"); qt=$(cat "$f.qtotal" 2>/dev/null || echo 0)
    if [ -n "$qs" ]; then state=queued; [ -f "$f.qstart" ] || echo "$qs" > "$f.qstart"; qt=$((qt + now - $(cat "$f.qstart")))
      echo "$now" > "$f.act"; echo "$now" > "$f.prog"; rm -f "$f.ev.idle" "$f.ev.stuck" "$f.quiet.idle"
    elif [ -f "$f.qstart" ]; then qt=$((qt + now - $(cat "$f.qstart"))); echo "$qt" > "$f.qtotal"; rm -f "$f.qstart"; fi
    la=$(cat "$f.act"); lp=$(cat "$f.prog")
    if [ "$kind" != shell ]; then
      if [ $((now - la)) -ge "$HB_PING" ]; then state=idle
        if [ "$kind" = reader ]; then quiet "$job" idle "no activity for $(ago "$la")m"; else fire "$job" idle "no activity for $(ago "$la")m"; fi; fi
      [ $((now - lp)) -ge "$HB_STUCK" ] && { state=stuck; fire "$job" stuck "no progress for $(ago "$lp")m"; }
      case "$calls$tok" in *[!0-9]*) ;; *) { [ "$calls" -ge "$CALL_CAP" ] || [ "$tok" -ge "$CONTEXT_CAP" ]; } \
        && fire "$job" cap "$calls calls $tok tokens" ;; esac
    elif [ "$pid" != - ] && ! alive "$job" "$pid"; then state=exited
      fire "$job" exited "pid $pid gone, exit $(cat "$H/$job.exit" 2>/dev/null || echo unknown)"; fi
    [ "$due" != - ] && eff=$((due + qt))
    if [ "$eff" != - ] && [ "$now" -gt "$eff" ]; then fire "$job" due "was due $(hm "$eff")"; else rm -f "$f.ev.due"; fi
    printf '%s %s state=%s head=%s activity=%s progress=%s procs=%s due=%s report=%s calls=%s tokens=%s\n' "$job" "$kind" \
      "$state" "$head" "$(hm "$la")" "$(hm "$lp")" "$n" "$(hm "$eff")" "${rep##*/}" "$calls" "$tok" >> "$H/live.tmp"
  done < "$IN"
  mv "$H/live.tmp" "$S/liveness.txt"; echo "$now" > "$S/heartbeat.last"
}
calm() { # the guard passed: alarms stop counting, and a STALLED status gets back the value it replaced
  rm -f "$H/alarm" "$H/stall"
  case "$(cat "$S/status" 2>/dev/null)" in STALLED*)
    if [ -f "$H/status.before" ]; then mv "$H/status.before" "$S/status"; else rm -f "$S/status"; fi ;; esac; }
stall() { # why: HB_STALL alarms in a row; DONE, STOPPED and PAUSED stay, any other status is kept to restore
  case "$(cat "$S/status" 2>/dev/null)" in DONE*|STOPPED*|PAUSED*) return ;; STALLED*) ;;
    *) if [ -f "$S/status" ]; then cp -p "$S/status" "$H/status.before"; else rm -f "$H/status.before"; fi ;; esac
  printf 'STALLED %s %s\n' "$(date +%H:%M)" "$1" > "$S/status.tmp" && mv "$S/status.tmp" "$S/status"; }
guard() { # the orchestrator must be listening (a watch armed) and acting (no event or report left unhandled)
  local now why="" e first r j sock id hst n; now=$(date +%s)
  if [ ! -s "$IN" ]; then rm -f "$H/lost"; calm; return; fi
  if kill -0 "$(cat "$H/watch.pid" 2>/dev/null)" 2>/dev/null; then rm -f "$H/lost"
  else [ -f "$H/lost" ] || echo "$now" > "$H/lost"
    [ $((now - $(cat "$H/lost"))) -ge "$HB_STALE" ] && why="no heartbeat watch since $(hm "$(cat "$H/lost")")"; fi
  # The session folder's identity and host, recorded by workspace.sh init; a two-field record is this host's.
  id='' hst=''; read -r id _ hst _ 2>/dev/null < "$S/reports.id"
  [ -d "$S/reports/" ] && { [ -z "$id" ] || { [ "$(stat -L -c %d:%i "$S/reports")" = "$id" ] && { [ -z "$hst" ] || [ "$hst" = "$(host)" ]; }; }; } \
    || why="$why; $S/reports does not resolve to this run's folder (session folder moved?): rerun workspace.sh init <session>"
  for e in "$H"/*.ev.*; do [ -e "$e" ] || continue; read -r first _ < "$e"
    [ $((now - first)) -ge "$HB_UNACTED" ] && why="$why; ${e##*/} unhandled since $(hm "$first")"; done
  while IFS=$'\t' read -r j _; do [ -n "$j" ] || continue; r=$(reps "$j" | head -1)
    [ -n "$r" ] && [ "$r" -nt "$H/$j.ack" ] && [ $((now - $(stat -c %Y "$r"))) -ge "$HB_UNACTED" ] && why="$why; $j report unread"; done < "$IN"
  why=${why#; }; if [ -z "$why" ]; then calm; return; fi
  [ "$why" = "$(cat "$H/alarm" 2>/dev/null)" ] && [ $((now - $(stat -c %Y "$H/alarm"))) -lt "$HB_REPEAT" ] && return
  echo "$why" > "$H/alarm"; echo "$(date -Is) $why" >> "$S/watchdog.log"; sock=$(cat "$H/inbox" 2>/dev/null)
  n=$(( $(cat "$H/stall" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$H/stall"; [ "$n" -ge "$HB_STALL" ] && stall "$why"
  [ -S "$sock" ] && printf 'agentic heartbeat: %s. Run heartbeat.sh status, act on every job, re-arm the watch.\n' "$why" \
    | timeout 10 socat - UNIX-CONNECT:"$sock" >> "$S/watchdog.log" 2>&1
  [ -x "$S/render" ] && "$S/render" --alarm "Orchestrator stalled: $why" >/dev/null 2>&1; notify-send -u critical "$P run" "$why" 2>/dev/null
  [ "${AGENTIC_HEADLESS:-}" = 1 ] && [ -f "$H/lost" ] && [ $((now - $(cat "$H/lost"))) -ge "$HB_KILL" ] && [ -s "$S/claude.pid" ] \
    && kill "$(cat "$S/claude.pid")" && echo "$(date -Is) killed claude for RESUME" >> "$S/watchdog.log"
}
case "${1:-}" in
  # A killed daemon is restarted; one that ended the run itself (exit 0 on DONE or STOPPED) is not.
  start) systemctl --user is-active --quiet "$U" || systemd-run --user --unit="$U" --collect -p Restart=always \
           -p RestartPreventExitStatus=0 -p RestartSec=10 --setenv=AGENTIC_RUN_STATE="$(readlink -f "$S")" --setenv=AGENTIC_HEADLESS="${AGENTIC_HEADLESS:-}" \
           ${E[@]+"${E[@]}"} bash "$D/heartbeat.sh" run ;;
  run) while :; do
         case "$(cat "$S/status" 2>/dev/null)" in DONE*|STOPPED*) exit 0 ;; esac
         sample; guard
         [ -n "$(find "$H/render.stamp" -mmin -9 2>/dev/null)" ] || { [ -x "$S/render" ] && "$S/render" >/dev/null 2>&1; touch "$H/render.stamp"; }
         sleep "$HB_EVERY"
       done ;;
  watch) echo $$ > "$H/watch.pid"; echo "${CLAUDE_CODE_MESSAGING_SOCKET:-}" > "$H/inbox"
         echo "${CLAUDE_CODE_SESSION_ID:-}" > "$H/orchestrator.session"
         lease=$HB_LEASE; [ "${AGENTIC_HEADLESS:-}" = 1 ] && lease=540
         off=$(cat "$H/watch.off" 2>/dev/null || stat -c %s "$EV")
         timeout "$lease" tail -c +$((off + 1)) -F "$EV" 2>/dev/null; stat -c %s "$EV" > "$H/watch.off"
         echo "HB $(date +%H:%M) lease-end: re-arm the watch; last sample $(ago "$(cat "$S/heartbeat.last" 2>/dev/null || echo 0)")m ago"
         sed 's/^/  /' "$S/liveness.txt" 2>/dev/null ;;
  status) echo "sample $(hm "$(cat "$S/heartbeat.last" 2>/dev/null || echo 0)") ($(ago "$(cat "$S/heartbeat.last" 2>/dev/null || echo 0)")m ago)," \
            "daemon $(systemctl --user is-active "$U")"; cat "$S/liveness.txt" 2>/dev/null; tail -n 5 "$EV" ;;
  # A reset job starts a new round: reports already on disk belong to the round before, so count them read.
  reset) fresh "${2:?job}" "$(awk -F'\t' -v j="$2" '$1 == j { print $7; exit }' "$IN")" ;;
  add) shift; add "$@" ;;
  # A retired job's pending events would alarm as a stall: clear them with the row.
  done) touch "$H/${2:?job}.ack"; rm -f "$H/$2".ev.*; row "$2" ;;
  ack) n=$(date +%s); for e in "$H/${2:?job}".ev.*; do [ -e "$e" ] && echo "$n $n" > "$e"; done; touch "$H/$2.ack" ;;
  *) sed -n '2,/^set -u$/p' "$0" | sed '$d'; exit 2 ;;
esac
