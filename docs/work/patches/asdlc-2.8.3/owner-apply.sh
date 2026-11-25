#!/usr/bin/env bash
# Apply the asdlc-2.8.3 owner patch as one owner commit, check the patched files, then run make verify.
# Usage, from the chore/asdlc-2.8.3 worktree root, on the Node that .nvmrc pins and after npm ci:
#   bash docs/work/patches/asdlc-2.8.3/owner-apply.sh [--expect-tree <tree hash>]
# The commit message comes from the owner-commits block of TASK-147. A second run finds the files
# already at their expected content, commits nothing and runs make verify again.
# --expect-tree refuses to commit a tree other than the reviewed one. It never tags, pushes or merges.
set -u -o pipefail

PATCH=docs/work/patches/asdlc-2.8.3/0001-port-scaffold-2-8-3.patch
TASK=docs/work/tasks/r12-scaffold-2-8-3/TASK-147-port-scaffold-2-8-3.md
# Blob of each file the patch changes or creates, as the 2.8.3 render and the merge left it.
EXPECTED='
1f43c7718bf91263b386a4a723e4075062658ed2 .agentic/legacy-records
2699be096d2dc0d6bf0271c192f7bd9b3b3dbbf5 .agentic/templates/brief.md
dc9aa7eba21370af8cd014c645ed584a2012d5a6 .agentic/templates/live-note.md
98d82390a4b50bb60f961bdcb3777db72d822c84 .agentic/templates/review-note.md
235047d4212762e5e8605497256383e692886522 .agentic/templates/task.md
9f8d8a9164a7ba7a14228a3d2a94931bcfbdf97c .agentic/version
e79c585d3da9ab9345350e1d64c11e455148b6c9 .claude/settings.json
5c3cc1a5d395c4a1f0772633c6eddf9a3e3f8a4f .github/PULL_REQUEST_TEMPLATE.md
fd4243553ef24cfe2ec45ffd4a161473bba40863 .gitignore
4720adf4990afe67641008028191bfbb0daafdb3 AGENTS.md
6a5a8d78687a5f0ceb5eb5564b36f83d358f1748 CLAUDE.md
2e6fe06be0d9cb5f779e99d8cb2d7847207eb59c Makefile
c698f7c1f825cf0286d867136fa0da1cbf35c65f RELEASE_NOTES.md
c9d4d271b81ec4d2ce9e0000d6e96f7d694b9ed3 docs/current/adr/ADR-000-adr-process.md
f096efc91c9c1563b42da80b3dffb22b1c0adfb2 docs/current/constitution.md
307851446c58fbcd5da0e2221afdb96bb62ba3f2 docs/current/plan.md
4c822f3af5b86aecc8ce08cd85cb6b67c7290db9 docs/current/runbooks/agent-work.md
5e2886e5601689ee4d00a942b1bac33b83790944 docs/current/runbooks/orchestration.md
be062cf9bc6e7a6606904f8dcb8a5936901171bc scripts/check_governance.py
7cb27051590998b91701d3a1d16c8bc70ee1dd2e scripts/check_protected_paths.py
85942b3c5113a1634404c2e202a1b79803bd927b scripts/doc_layers.py
61d65cf24692e147bc6f240170bb347d4293986c scripts/move_doc.py
2452819a5746b2fa36086f617e01557248c7e5a9 scripts/orchestrator/SHA256SUMS
67f1a89ab9b71b089573024610b390c38b1994e4 scripts/orchestrator/gate-slot.sh
2ba561fd2129427a77773728441c2e80b09775d4 scripts/orchestrator/heartbeat.sh
3cb3c7673fe5099ead836095b07abf55dfd97092 scripts/orchestrator/limits.env
a629975772a620ceebe29a444103d829792d843c scripts/orchestrator/report-capture.sh
b3a71c74d8286d8b8892d0303c13d12223f1c343 scripts/orchestrator/stop-guard.sh
726480236a37c7c9ffe22a5f625b185f7599888a scripts/orchestrator/workspace.sh
85cbad4f4fd518f75bf565ef3593ec96e0c3adbd scripts/test_agentic_gates.py'
# The files the patch creates; it changes no mode and deletes nothing.
CREATES='
create mode 100644 .agentic/legacy-records
create mode 100644 .agentic/templates/brief.md
create mode 100644 .agentic/templates/live-note.md
create mode 100644 .agentic/templates/review-note.md
create mode 100644 docs/current/runbooks/agent-work.md
create mode 100644 docs/current/runbooks/orchestration.md
create mode 100644 scripts/orchestrator/SHA256SUMS
create mode 100644 scripts/orchestrator/gate-slot.sh
create mode 100644 scripts/orchestrator/heartbeat.sh
create mode 100644 scripts/orchestrator/limits.env
create mode 100644 scripts/orchestrator/report-capture.sh
create mode 100644 scripts/orchestrator/stop-guard.sh
create mode 100644 scripts/orchestrator/workspace.sh'

die() { printf 'owner-apply: %s\n' "$*" >&2; exit 1; }

expect_tree=
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,7s/^# //p' "$0"; exit 0 ;;
    --expect-tree) [ $# -ge 2 ] || die "--expect-tree needs a tree hash"; expect_tree=$2; shift 2 ;;
    *) die "unknown argument '$1'" ;;
  esac
done

here=$(git rev-parse --show-toplevel 2>/dev/null) || die "run it from the port worktree"
mine=$(cd "$(dirname "$0")" && git rev-parse --show-toplevel) || die "cannot find this script's repository"
[ "$here" = "$mine" ] || die "run it from $mine, not $here"
cd "$here" || die "cannot enter $here"

[ -z "$(git status --porcelain --untracked-files=all)" ] || die "the tree is not clean; commit or remove the changes first (git status)"
[ -f "$TASK" ] || die "missing $TASK"
[ -f "$PATCH" ] || die "missing $PATCH"
want="v$(cat .nvmrc)"; have=$(node --version 2>/dev/null) || die "node is not on PATH; run nvm use"
[ "$have" = "$want" ] || die "node $have, .nvmrc pins $want; put it first on PATH"
[ -d node_modules ] || die "node_modules is missing; run npm ci"

messages=$(mktemp -d "${TMPDIR:-/tmp}/owner-apply.XXXXXX") || die "mktemp failed"
# The block between the two markers: 'NNNN subject' starts the entry, two-space indented lines are its body.
awk -v out="$messages" '
  /^<!-- owner-commits -->$/ { inside = 1; next }
  /^<!-- \/owner-commits -->$/ { inside = 0; next }
  !inside || /^```/ { next }
  /^[0-9][0-9][0-9][0-9] / { if (file != "") close(file); file = out "/" substr($0, 1, 4); printf "%s\n\n", substr($0, 6) > file; next }
  file != "" { sub(/^  /, ""); print > file }
' "$TASK" || die "cannot read the owner-commits block of $TASK"
m="$messages/0001"
[ -s "$m" ] || die "$TASK lists no commit message for 0001"
subject=$(head -n 1 "$m")
[ "${#subject}" -le 72 ] || die "subject is longer than 72 characters: $subject"
printf '%s\n' "$subject" | grep -Eq '^(feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert)(\([a-z0-9-]+\))?!?: [a-z]' \
  || die "subject is not a Conventional Commits subject: $subject"
! grep -Eqi '^(co-authored-by|claude-session):' "$m" || die "the message carries an agent trailer"
# Drop trailing blank lines so the message ends at its last trailer.
printf '%s\n' "$(cat "$m")" > "$m.final"

# at REV: every expected file holds its expected blob there (REV ':' is the index).
at() {
  local blob path
  while read -r blob path; do
    [ -n "$path" ] || continue
    [ "$(git rev-parse -q --verify "$1$path" 2>/dev/null)" = "$blob" ] || return 1
  done <<< "$EXPECTED"
}

base=$(git rev-parse --short HEAD)
if at HEAD:; then
  printf 'owner-apply: the patched files are already committed on %s; nothing to commit\n' "$base"
else
  if ! git apply --check "$PATCH" 2>/dev/null; then
    git apply --check "$PATCH"
    die "the patch does not apply to $base and the files are not at their patched content; nothing was applied"
  fi
  git apply --index "$PATCH" || die "git apply failed; the index may hold part of it (git status)"
  # refuse REASON: take the patch back out of the index and the tree, then stop.
  refuse() {
    if git apply --index --reverse "$PATCH" 2>/dev/null; then
      die "$1; the patch was taken back out, nothing was committed"
    fi
    die "$1; nothing was committed, but taking the patch back out failed: the tree was clean before, so git reset --hard HEAD restores it"
  }
  # The staged change must be exactly the expected files, contents and creates.
  got=$(git diff --cached --name-only | sort)
  [ "$got" = "$(printf '%s\n' "$EXPECTED" | sed '/^$/d' | cut -d' ' -f2 | sort)" ] \
    || refuse "the patch staged other files than expected"
  at : || refuse "a staged file does not match its expected content"
  [ "$(git diff --cached --summary | sed 's/^ //')" = "$(printf '%s\n' "$CREATES" | sed '/^$/d')" ] \
    || refuse "the patch creates, deletes or changes the mode of other files than expected"
  staged=$(git write-tree) || refuse "git write-tree failed"
  [ -z "$expect_tree" ] || [ "$staged" = "$expect_tree" ] \
    || refuse "the commit would hold tree $staged, not the expected $expect_tree (is HEAD the reviewed branch tip?)"
  git commit --quiet -F "$m.final" || die "applied and staged, but the commit failed (git status)"
  printf 'owner-apply: %s  %s on %s\n' "$(git rev-parse --short HEAD)" "$subject" "$base"
fi

tree=$(git rev-parse 'HEAD^{tree}')
if [ -n "$expect_tree" ] && [ "$tree" != "$expect_tree" ]; then
  die "tree $tree, expected $expect_tree; the commit stays, compare with git diff $expect_tree HEAD"
fi
printf 'owner-apply: tree %s%s; running make verify\n' "$tree" "${expect_tree:+ (as expected)}"
log="$messages/verify.log"
if make verify > "$log" 2>&1; then
  printf 'owner-apply: make verify passed on %s; nothing was pushed\n' "$(git rev-parse --short HEAD)"
  status=0
else
  printf 'owner-apply: make verify failed on %s (last lines below); the commit stays, nothing was pushed\n' \
    "$(git rev-parse --short HEAD)" >&2
  tail -n 20 "$log" | sed 's/^/    /' >&2
  status=1
fi
printf 'owner-apply: message and the gate log in %s\n' "$messages"
exit "$status"
