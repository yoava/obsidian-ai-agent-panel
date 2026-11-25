#!/usr/bin/env bash
# Apply the constitution-adr-007 owner patch as one owner commit, then run make verify.
# Usage, from the worktree that holds this script, on the Node that .nvmrc pins and after npm ci:
#   bash docs/work/patches/constitution-adr-007/owner-apply.sh --expect-tree <tree hash>
# It refuses to commit any tree but the expected one. A second run finds the patch committed,
# checks the tree, commits nothing and runs make verify again. It never tags, pushes or merges.
set -u -o pipefail

PATCH=docs/work/patches/constitution-adr-007/0001-admit-libraries-as-adr-007-sets-out.patch
FILE=docs/current/constitution.md
OLD=f096efc91c9c1563b42da80b3dffb22b1c0adfb2
NEW=8b120282a40f518727ca443127d3112894e707e4
MESSAGE='docs(constitution): admit runtime libraries as ADR-007 sets out

The dependency policy asked for an accepted ADR of a library'"'"'s own, while
ADR-007, which it cites, also accepts a section in the ADR of the area the
library serves. The constitution now defers to ADR-007, so the two cannot
disagree; review r2 of the scaffold 2.8.3 port found it (R2-2).'

die() { printf 'owner-apply: %s\n' "$*" >&2; exit 1; }

expect_tree=
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,6s/^# //p' "$0"; exit 0 ;;
    --expect-tree) [ $# -ge 2 ] || die "--expect-tree needs a tree hash"; expect_tree=$2; shift 2 ;;
    *) die "unknown argument '$1'" ;;
  esac
done
printf '%s\n' "$expect_tree" | grep -Eq '^[0-9a-f]{40}$' || die "--expect-tree <40-hex tree hash> is required"

here=$(git rev-parse --show-toplevel 2>/dev/null) || die "run it from the worktree that holds it"
mine=$(cd "$(dirname "$0")" && git rev-parse --show-toplevel) || die "cannot find this script's repository"
[ "$here" = "$mine" ] || die "run it from $mine, not $here"
cd "$here" || die "cannot enter $here"

[ -z "$(git status --porcelain --untracked-files=all)" ] || die "the tree is not clean; commit or remove the changes first (git status)"
[ -f "$PATCH" ] || die "missing $PATCH"
want="v$(cat .nvmrc)"; have=$(node --version 2>/dev/null) || die "node is not on PATH; run nvm use"
[ "$have" = "$want" ] || die "node $have, .nvmrc pins $want; put it first on PATH"
[ -d node_modules ] || die "node_modules is missing; run npm ci"

base=$(git rev-parse --short HEAD)
committed=$(git rev-parse -q --verify "HEAD:$FILE")
if [ "$committed" = "$NEW" ]; then
  printf 'owner-apply: %s already holds the patch on %s; nothing to commit\n' "$FILE" "$base"
elif [ "$committed" != "$OLD" ]; then
  die "$FILE on $base is neither the reviewed base nor the patched file; nothing was applied"
else
  git apply --check "$PATCH" || die "the patch does not apply to $base; nothing was applied"
  git apply --index "$PATCH" || die "git apply failed; the index may hold part of it (git status)"
  # refuse REASON: take the patch back out of the index and the tree, then stop.
  refuse() {
    if git apply --index --reverse "$PATCH" 2>/dev/null; then
      die "$1; the patch was taken back out, nothing was committed"
    fi
    die "$1; nothing was committed, but taking the patch back out failed: the tree was clean before, so git reset --hard HEAD restores it"
  }
  [ "$(git diff --cached --name-only)" = "$FILE" ] || refuse "the patch staged other files than $FILE"
  [ "$(git rev-parse -q --verify ":$FILE")" = "$NEW" ] || refuse "the staged $FILE is not the reviewed content"
  staged=$(git write-tree) || refuse "git write-tree failed"
  [ "$staged" = "$expect_tree" ] \
    || refuse "the commit would hold tree $staged, not the expected $expect_tree (is HEAD the reviewed branch tip?)"
  printf '%s\n' "$MESSAGE" | git commit --quiet -F - || die "applied and staged, but the commit failed (git status)"
  printf 'owner-apply: %s  %s on %s\n' "$(git rev-parse --short HEAD)" "$(printf '%s\n' "$MESSAGE" | head -n 1)" "$base"
fi

tree=$(git rev-parse 'HEAD^{tree}')
[ "$tree" = "$expect_tree" ] || die "tree $tree, expected $expect_tree; nothing was committed now, compare with git diff $expect_tree HEAD"
log=$(mktemp "${TMPDIR:-/tmp}/owner-apply-verify.XXXXXX") || die "mktemp failed"
printf 'owner-apply: tree %s (as expected); running make verify\n' "$tree"
if make verify > "$log" 2>&1; then
  printf 'owner-apply: make verify passed on %s; nothing was pushed\n' "$(git rev-parse --short HEAD)"
  status=0
else
  printf 'owner-apply: make verify failed on %s (last lines below); the commit stays, nothing was pushed\n' \
    "$(git rev-parse --short HEAD)" >&2
  tail -n 20 "$log" | sed 's/^/    /' >&2
  status=1
fi
printf 'owner-apply: gate log in %s\n' "$log"
exit "$status"
