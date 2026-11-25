#!/usr/bin/env bash
# Stop hook: while jobs are in flight, blocks the turn end until the heartbeat daemon and watch run and every
# report is acked. Exits 0 (allow) outside a run. Claude Code overrides a block after 8 in a row; the daemon's alarm covers that.
D=$(dirname "$(readlink -f "$0")"); P=$(basename "$(dirname "$(dirname "$D")")")
S=${AGENTIC_RUN_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/agentic-run/$P}
[ -s "$S/inflight.tsv" ] || exit 0
case "$(cat "$S/status" 2>/dev/null)" in DONE*|STOPPED*|PAUSED*) exit 0 ;; esac
in=$(cat); why=""
# Only the session that armed the watch is the orchestrator; other sessions in this repo pass.
o=$(cat "$S/hb/orchestrator.session" 2>/dev/null); sid=$(jq -r '.session_id // empty' <<<"$in" 2>/dev/null)
[ -n "$o" ] && [ -n "$sid" ] && [ "$sid" != "$o" ] && exit 0
systemctl --user is-active --quiet "agentic-heartbeat-$P" || why="Heartbeat daemon down: run bash $D/heartbeat.sh start."
# Armed: a live watch pid, or a listed monitor; the hook input's task schema is not guaranteed.
kill -0 "$(cat "$S/hb/watch.pid" 2>/dev/null)" 2>/dev/null \
  || jq -e '[.background_tasks[]? | select((.description // "") | test("agentic heartbeat"))] | length > 0' <<<"$in" >/dev/null 2>&1 \
  || why="$why No heartbeat watch."
[[ "$why" == *"No heartbeat watch."* ]] && why="$why Arm it: Monitor(command: \"bash $D/heartbeat.sh watch\", description: \"agentic heartbeat\", timeout_ms: 1800000)."
while IFS=$'\t' read -r j _; do [ -n "$j" ] || continue
  # The job's own reports, as heartbeat.sh reads them: fix-s1-r1.md is job fix-s1's, not job fix's.
  r=$(ls -t "$S/reports/$j"-[rs][0-9]*.md 2>/dev/null | while IFS= read -r f; do
    [[ ${f#"$S/reports/$j"-} =~ ^[rs][0-9]+\.md$ ]] && printf '%s\n' "$f"; done | head -1)
  [ -n "$r" ] && [ "$r" -nt "$S/hb/$j.ack" ] && why="$why Unread report $r: read it, act, then run bash $D/heartbeat.sh ack $j."
done < "$S/inflight.tsv"
[ -z "$why" ] && exit 0
jq -n --arg r "$why" '{decision: "block", reason: $r}'
