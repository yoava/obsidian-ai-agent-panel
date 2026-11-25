#!/usr/bin/env bash
# Session workspace: the folder the owner sees, holding a run's live note and reports. Rule HB-1 in
# docs/current/runbooks/orchestration.md. Usage:
#   workspace.sh init <session>  create <workspace>/<session>/ (dated suffix when another run's files hold the name), point
#                                $S/reports at its Reports/, record the live note in $S/live-note; prints the folder
#   workspace.sh note            print the live note path, once its folder is still this run's (else fail: rerun init)
#   workspace.sh write           replace the live note with stdin, written inside that verified folder, never by path
# The workspace: $AGENTIC_WORKSPACE when set, else git config agentic.workspace (--global default, --local per clone);
# unset fails with the setup command, empty keeps the session in $S. A run owns its folder by the identity of its
# Reports/ (device:inode, session, host and a random run id in $S/reports.id, the run id also in Reports/.run-id;
# $AGENTIC_HOST, default hostname): a rerun finds it again after a rename inside the workspace and never adopts another
# run's folder; on another host it finds the folder by name directly in the workspace, adopts it only when its run id
# matches, and records the new identity. The run id (32 hex digits) tells this run's folder from another run's of the
# same name; it is no secret: whoever can write the workspace can copy it, and two folders carrying it stop init.
# In an Obsidian vault (an ancestor holding .obsidian/), init also writes
# Reports.md and Reports.base once and pins the live note and Reports.md: Notebook Navigator when enabled, else bookmarks.
# The pins and $S/reports are written by path: a vault file and a link, which heartbeat.sh checks every sample.
set -u -o pipefail
D=$(dirname "$(readlink -f "$0")"); R=$(dirname "$(dirname "$D")"); P=$(basename "$R")
S=${AGENTIC_RUN_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/agentic-run/$P}
bad() { echo "workspace.sh: $*" >&2; exit 2; }
# A temporary file is created by mktemp beside the target (a fresh random name, created exclusively: never through a
# planted symlink, never blocked by a crashed run's leftover), hidden so Obsidian never lists it, given the target's mode
# (else the umask's), and renamed over the target, which replaces a symlink there instead of following it; inside the
# session folder every path is relative to the held folder.
tmp() { # target: print a new empty temporary file beside it
  local t; t=$(mktemp "$(dirname "$1")/.$(basename "$1").XXXXXX") || return 1
  { [ -e "$1" ] && chmod --reference="$1" "$t" 2> /dev/null; } || chmod "$(printf %o $((0666 & ~0$(umask))))" "$t"; echo "$t"; }
put() { local t; t=$(tmp "$1") && cat > "$t" && mv -T "$t" "$1" || { rm -f "${t:-}"; bad "cannot write $1"; }; } # file < content
jqw() { local f=$1 t; t=$(tmp "$1"); shift; [ -n "$t" ] && jq -j "$@" "$f" > "$t" && mv -T "$t" "$f" || { rm -f "${t:-}"; bad "cannot update $f"; }; }
now() { date +%Y-%m-%dT%H:%M; }
host() { echo "${AGENTIC_HOST:-$(hostname 2> /dev/null || uname -n)}"; }
same() { # folder: a real folder at that very path under $W: no symlink, and the inode its resolved path names
  local r; r=$(readlink -f -- "$1") && [ "$r" = "$1" ] && [ ! -L "$1" ] && [ -d "$1" ] \
    && case "$r" in "$W"/*) ;; *) false ;; esac && [ "$(stat -c %d:%i -- "$1")" = "$(stat -L -c %d:%i -- "$r")" ]; }
hold() { # folder: make it the working directory once it is verified, so every later write lands in that very folder
  # even if its path is swapped for a symlink afterwards (the working directory is a held reference, not a path)
  cd -P -- "$1" 2> /dev/null && [ "$(pwd -P)" = "$1" ] && [ ! -L "$1" ] && case "$1" in "$W"/*) ;; *) false ;; esac; }
take() { # claim a new or empty folder by creating its Reports exclusively, so two inits never share one; never a symlink.
  # The folder is held before its Reports is made, so one swapped for a symlink in between fails before anything is written.
  mkdir "$1" 2> /dev/null || { [ -d "$1" ] && [ ! -L "$1" ] && [ -z "$(ls -A "$1")" ]; } || return 1
  hold "$1" || bad "$1 changed under init (a symlink?): nothing written"
  mkdir Reports 2> /dev/null || return 1
  [ -d Reports ] && [ ! -L Reports ] || bad "$1/Reports changed under init (a symlink?): nothing written"; }
runid() { od -An -N16 -tx1 /dev/urandom | tr -d ' \n'; } # random, so no other run's folder carries it
isrun() { [[ $1 =~ ^[0-9a-f]{32}$ ]]; }
ours() { # Reports folder, run id: the folder's recorded run id is this run's; a record without one matches any
  [ -z "$2" ] || { isrun "$2" && [ "$(cat "$1/.run-id" 2> /dev/null)" = "$2" ]; }; }
mine() { # session: this run's folder under $W, found by the identity recorded at its claim; empty when there is none
  local id sn hst run c m=(); read -r id sn hst run 2> /dev/null < "$S/reports.id" && [ "$sn" = "$1" ] || return 0
  [ -z "$run" ] || isrun "$run" || bad "$S/reports.id holds '$run', not a run id (32 hex digits)"
  if [ -n "$hst" ] && [ "$hst" != "$(host)" ]; then # another host: device and inode differ, the name and run id do not
    for c in "$(basename "$(dirname "$(cat "$S/live-note" 2> /dev/null)")")" "$1"; do
      [ -n "$c" ] && [ -n "$run" ] && [ -d "$W/$c/Reports" ] && same "$W/$c" && same "$W/$c/Reports" && ours "$W/$c/Reports" "$run" \
        && [[ " ${m[*]} " != *" $W/$c "* ]] && m+=("$W/$c"); done
    [ ${#m[@]} -le 1 ] || bad "${m[*]} all carry this run's id (a copied folder?): keep one and rerun init"
    [ ${#m[@]} -eq 0 ] || { echo "${m[0]}"; return; }
    echo "workspace.sh: no folder of this run in $W on host $(host); starting a fresh folder" >&2; return 0; fi
  c=$(find "$W" -mindepth 2 -maxdepth 2 -type d -name Reports -inum "${id#*:}" -print -quit 2> /dev/null)
  if [ -n "$c" ] && [ "$(stat -c %d:%i "$c")" = "$id" ] && ours "$c" "$run"; then dirname "$c"
  else echo "workspace.sh: this run's folder is no longer in $W; starting a fresh folder (earlier reports stay where the folder went)" >&2; fi; }
vok() { # folder: its vault path must not hold a character wiki links or base formulas break on
  [ -n "$V" ] || return 0; case "${1#"$V"/}" in *[\"\\\[\]\|#^:]*) bad "vault path '${1#"$V"/}' holds a character links or formulas break on" ;; esac; }
pin() { # vault-relative path; adds the pin only when absent, never touches other keys or pins
  local o=$V/.obsidian nn=$V/.obsidian/plugins/notebook-navigator/data.json bm=$V/.obsidian/bookmarks.json
  if [ -f "$nn" ] && jq -e 'index("notebook-navigator")' "$o/community-plugins.json" > /dev/null 2>&1; then
    # Checked again after a second: the plugin's own save can land between the read and the rename.
    for _ in 1 2; do jq -e --arg p "$1" '.pinnedNotes[$p]' "$nn" > /dev/null 2>&1 && return
      jqw "$nn" --arg p "$1" '.pinnedNotes[$p] = {"folder": true, "tag": false, "property": false}'; sleep 1; done
  else
    [ -f "$bm" ] || echo '{"items": []}' | put "$bm"
    jq -e --arg p "$1" '[.. | objects | select(.type? == "file" and .path? == $p)] | length > 0' "$bm" > /dev/null 2>&1 \
      || jqw "$bm" --arg p "$1" --argjson t "$(date +%s%3N)" '.items += [{"type": "file", "ctime": $t, "path": $p}]'
  fi
}
init() { # session
  local n=${1:-} W F V rel id old i c run found=""
  [[ $n =~ ^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9_-])?$ ]] && [ "${n,,}" != reports ] \
    || bad "session '$n': letters, digits, '.', '_' and '-', starting with a letter or digit, not ending in '.', not Reports"
  if [ -n "${AGENTIC_WORKSPACE+x}" ]; then W=$AGENTIC_WORKSPACE
  else W=$(git -C "$R" config --type=path --get agentic.workspace) \
    || bad "agentic.workspace is not set: git config --global agentic.workspace <absolute path>, or '' to keep run files in $S"; fi
  mkdir -p "$S" || bad "cannot create $S"
  if [ -z "$W" ]; then # no visible workspace: everything stays in the run state directory
    if [ -L "$S/reports" ]; then rm -f "$S/reports"; fi; rm -f "$S/reports.id"; mkdir -p "$S/reports"
    echo "$S/$n.md" | put "$S/live-note"; echo "$S"; return; fi
  case "$W" in /*) ;; *) bad "workspace '$W' is not an absolute path" ;; esac
  [ -d "$W" ] || bad "workspace '$W' is not a directory (a vault not mounted?)"; W=$(readlink -f "$W")
  V=$W; while [ "$V" != / ] && [ ! -d "$V/.obsidian" ]; do V=$(dirname "$V"); done; [ -d "$V/.obsidian" ] || V=
  vok "$W/$n"; F=$(mine "$n") || exit 2; [ -z "$F" ] || { vok "$F"; found=1; } # all checked before anything is created; a dated suffix adds safe characters only
  # A real reports folder: an empty one (a heartbeat call before init) goes; reports written before init move aside.
  if [ -d "$S/reports" ] && [ ! -L "$S/reports" ]; then
    rmdir "$S/reports" 2> /dev/null || mv -T "$S/reports" "$S/reports.$(date +%s)" || bad "cannot move $S/reports aside"; fi
  old=$(cat "$S/live-note" 2> /dev/null)
  if [ -z "$F" ]; then F=$W/$n; i=1; while ! take "$F"; do i=$((i + 1)); F=$W/$n-$(date +%F); [ $i -gt 2 ] && F=$F-$((i - 1)); done
    [ "$F" = "$W/$n" ] || echo "workspace.sh: $W/$n holds another run's files; this session uses $F" >&2
  else hold "$F" || bad "$F changed under init (a symlink?): nothing written"; fi
  { [ -d Reports ] || mkdir Reports; } && [ ! -L Reports ] && id=$(stat -c %d:%i Reports) || bad "cannot create $F/Reports"
  # A found folder keeps its run id (a record from before run ids takes the folder's); a new one gets a fresh id.
  # Reports is entered once and checked by identity, so the run id is read from and written into that very folder.
  run=$(cd -P Reports 2> /dev/null && [ "$(stat -c %d:%i .)" = "$id" ] || bad "$F/Reports changed under init (a symlink?)"
    r=; [ -z "$found" ] || r=$(cat .run-id 2> /dev/null)
    [ -z "$r" ] || isrun "$r" || bad "$F/Reports/.run-id holds '$r', not a run id (32 hex digits)"
    [ -n "$r" ] || r=$(runid); isrun "$r" || bad "cannot draw a run id"
    [ -f .run-id ] || echo "$r" | put .run-id; echo "$r") || exit 2
  # The identity first: a crash before the link swap still finds this folder on the next init.
  echo "$id $n $(host) $run" | put "$S/reports.id"
  ln -sfn "$F/Reports" "$S/reports.tmp.$$" && mv -T "$S/reports.tmp.$$" "$S/reports" || bad "cannot link $S/reports"
  # A folder found again after a rename keeps its live note; a new one names it after the folder.
  if [ -n "$found" ] && [ -f "${old##*/}" ]; then n=${old##*/}; n=${n%.md}; else n=${F##*/}; fi
  echo "$F/$n.md" | put "$S/live-note"
  [ -e "$n.md" ] || printf -- '---\ncreated: %s\nupdated: %s\ndescription: Live status of the %s run.\ntags:\n  - ai/generated\n---\n\nStarting.\n' \
    "$(now)" "$(now)" "$n" | put "$n.md"
  if [ -n "$V" ]; then
    rel=${F#"$V"/}; old=${old%/*}; old=${old#"$V"/}
    if [ -n "$found" ] && [ -n "$old" ] && [ "$old" != "$rel" ]; then for i in Reports.md Reports.base; do # renamed: relink
      [ -f "$i" ] || continue; c=$(cat "$i")
      [ "$c" = "${c//"[[$old/"/}" ] && [ "$c" = "${c//"(\"$old/"/}" ] && continue
      c=${c//"[[$old/"/"[[$rel/"}; c=${c//"(\"$old/"/"(\"$rel/"}; printf '%s\n' "$c" | put "$i"; done; fi
    [ -e Reports.md ] || printf -- '---\ncreated: %s\nupdated: %s\ndescription: Reports, captured agent stops and reviews of the %s run, newest first.\ntags:\n  - ai/generated\n---\n\nStatus: [[%s|%s]]. Names: `<job>-rN` report of round N, `<job>-s<epoch>` captured agent stop, `<job>-handover` handover, `codex-*` and `fable-*` reviews.\n\n![[%s/Reports.base]]\n' \
      "$(now)" "$(now)" "$n" "$rel/$n" "$n" "$rel" | put Reports.md
    [ -e Reports.base ] || put Reports.base <<EOF
filters:
  and:
    - file.ext == "md"
    - file.inFolder("$rel/Reports")
formulas:
  kind: if(file.basename.startsWith("codex"), "Codex review", if(file.basename.startsWith("fable"), "Fable review", if(file.basename.contains("-handover"), "Handover", if(file.basename.contains("-s1"), "Captured stop", "Report"))))
  task: file.basename.replace("codex-", "").replace("fable-", "").split("-").slice(0, 2).join("-")
properties:
  file.name:
    displayName: Report
  formula.kind:
    displayName: Kind
  formula.task:
    displayName: Task
  file.mtime:
    displayName: Updated
views:
  - type: table
    name: Latest
    order:
      - file.name
      - formula.kind
      - formula.task
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC
  - type: table
    name: By task
    groupBy:
      property: formula.task
      direction: ASC
    order:
      - file.name
      - formula.kind
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC
EOF
    pin "$rel/$n.md"; pin "$rel/Reports.md"
  fi
  echo "$F"
}
note() { # the live note path; with a workspace, only while its folder is a real folder whose Reports has the recorded identity
  local f d id=; f=$(cat "$S/live-note" 2> /dev/null) || { echo "$S/$P.md"; return; }; d=${f%/*}
  read -r id _ 2> /dev/null < "$S/reports.id"
  [ -z "$id" ] || { [ ! -L "$d" ] && [ "$(readlink -f -- "$d")" = "$d" ] && [ ! -L "$f" ] && [ ! -L "$d/Reports" ] \
    && [ "$(stat -c %d:%i -- "$d/Reports" 2> /dev/null)" = "$id" ]; } \
    || bad "the live note's folder $d is no longer this run's (moved, or a symlink?): rerun workspace.sh init <session>"
  echo "$f"; }
write() { # stdin: the new live note, renamed into place inside the folder held as the working directory
  local f d id=; f=$(note) || exit 2; d=${f%/*}; read -r id _ 2> /dev/null < "$S/reports.id"
  # Without a workspace the note sits in the run state folder, which may be reached through a symlink: no identity to keep.
  [ -n "$id" ] || d=$(readlink -f -- "$d") || bad "cannot resolve ${f%/*}"
  cd -P -- "$d" 2> /dev/null && [ "$(pwd -P)" = "$d" ] || bad "cannot enter $d"
  [ -z "$id" ] || { [ ! -L Reports ] && [ "$(stat -c %d:%i Reports 2> /dev/null)" = "$id" ]; } \
    || bad "$d changed under write (a symlink?): rerun workspace.sh init <session>"
  put "${f##*/}"; }
case "${1:-}" in
  init) init "${2:-}" ;;
  note) note ;;
  write) write ;;
  *) sed -n 2,12p "$0"; exit 2 ;;
esac
