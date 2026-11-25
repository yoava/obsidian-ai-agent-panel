#!/usr/bin/env bash
# Runs one full gate (make verify, an acceptance suite) in one of GATE_SLOTS host-wide slots and exits with its status;
# one full gate saturates the cores. Rule TP-2 in docs/current/runbooks/orchestration.md. Usage: gate-slot.sh <command> [arg...]
# Waiters are served in arrival order, landing gates (AGENTIC_GATE_CLASS=landing) first: each holds the ticket
# $AGENTIC_GATE_LOCKS/queue/<class>-<epoch>-<pid> naming its resolved directory, $AGENTIC_JOB, its own start time and its
# repository (the resolved git common directory); heartbeat.sh shows its job queued. A ticket whose pid is gone or now
# names another process (a killed waiter, a reboot) is dropped.
# AGENTIC_GATE_ENV, when set, names the agents' environment file, so every gate runs as the agents do: KEY=value lines
# (optional "export ", one pair of quotes, # comments) read as data, never run; keys that make a shell or the loader run code
# are refused. Its values (PATH) still choose what the gate runs: keep the file where agents cannot write.
set -u
D=$(dirname "$(readlink -f "$0")")
[ $# -gt 0 ] || { sed -n 2,10p "$0"; exit 2; }
genv() { # file: export each KEY=value line, unevaluated
  local l k v n=0; exec 3< "$1" || { echo "gate-slot.sh: cannot read AGENTIC_GATE_ENV=$1" >&2; return 2; }
  while IFS= read -r l <&3 || [ -n "$l" ]; do n=$((n + 1)); l=${l#"${l%%[![:space:]]*}"}
    case "$l" in "" | "#"*) continue ;; "export "*) l=${l#export } ;; esac; k=${l%%=*} v=${l#*=}
    [[ $l == *=* && $k =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "gate-slot.sh: $1:$n: not KEY=value" >&2; return 2; }
    case "$k" in BASH_ENV | ENV | BASH_FUNC_* | BASHOPTS | SHELLOPTS | PROMPT_COMMAND | PS4 | IFS | LD_* | DYLD_*)
      echo "gate-slot.sh: $1:$n: $k would run code; not taken" >&2; return 2 ;; esac
    case "$v" in \"*\" | \'*\') v=${v:1:${#v}-2} ;; esac; export "$k=$v"; done; exec 3<&-; }
if [ -n "${AGENTIC_GATE_ENV:-}" ]; then genv "$AGENTIC_GATE_ENV" || exit 2; fi
. "$D/limits.env"
L=${AGENTIC_GATE_LOCKS:-${XDG_STATE_HOME:-$HOME/.local/state}/agentic-run/gate-slots}; Q=$L/queue; mkdir -p "$Q"
c=1; [ "${AGENTIC_GATE_CLASS:-}" = landing ] && c=0
T=$Q/$c-$(printf '%012d' "$(date +%s)")-$$
pstart() { # pid: the process's start time, as heartbeat.sh reads it; empty once it is gone
  local s f; if s=$(cat "/proc/$1/stat" 2> /dev/null); then read -ra f <<< "${s##*) }"; echo "${f[19]:-}"
  else ps -o lstart= -p "$1" 2> /dev/null | tr -s ' ' _; fi; }
g=$(git rev-parse --git-common-dir 2> /dev/null) && g=$(readlink -f -- "$g") || g=
ticket() { printf '%s\n%s\n%s\n%s\n' "$(pwd -P)" "${AGENTIC_JOB:-}" "$(pstart $$)" "$g" > "$T.tmp" && mv "$T.tmp" "$T"; }
ticket || { echo "gate-slot.sh: cannot write $T" >&2; exit 2; }
trap 'rm -f "$T" "$T.tmp"' EXIT; trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM
live() { # ticket pid: the waiter runs: the pid has the start time on the ticket's third line. A ticket written before
  # 2.8.1 holds none and counts while its pid runs gate-slot.sh, so a gate waiting through the upgrade keeps its place.
  local s; s=$(sed -n 3p "$1" 2> /dev/null); if [ -n "$s" ]; then [ "$(pstart "$2")" = "$s" ]
  else case "$(ps -o args= -p "$2" 2> /dev/null)" in *gate-slot.sh*) ;; *) false ;; esac; fi; }
first() { # the ticket that sorts first among those of live waiters; any other waiter's ticket is dropped
  local LC_COLLATE=C t p; for t in "$Q"/[01]-*-*; do p=${t##*-}; case "$p" in "" | *[!0-9]*) continue ;; esac
    [ -f "$t" ] || continue; if live "$t" "$p"; then echo "$t"; return; fi; rm -f "$t"; done; }
while :; do
  # A ticket another waiter dropped (it cannot see this pid: another PID namespace) or a cleanup removed is written
  # again under the same name, which keeps its place in line.
  [ -e "$T" ] || ticket
  if [ "$(first)" = "$T" ]; then
    for ((s = 0; s < GATE_SLOTS; s++)); do
      exec {fd}> "$L/slot.$s.lock"
      # The gate runs without the lock fd, so a daemon it leaves behind cannot hold the slot.
      if flock -n "$fd"; then rm -f "$T"; trap - EXIT HUP INT TERM; "$@" {fd}>&-; exit $?; fi
      exec {fd}>&-
    done
  fi
  sleep "$GATE_POLL" & wait $!
done
