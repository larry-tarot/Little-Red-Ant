#!/usr/bin/env bash
# git-log-readable.sh
#
# 漂亮地打印 git log, 对于被双重 UTF-8 编码污染的 commit, 自动从
# refs/notes/corrected-msg 取回真实中文 message 并显示.
#
# 用法:
#   ./scripts/git-log-readable.sh           # 最近 20 个
#   ./scripts/git-log-readable.sh 30        # 最近 30 个
#   ./scripts/git-log-readable.sh 96fe8bc   # 单个 commit
#   ./scripts/git-log-readable.sh -20       # 别名传 -N 表示 N 条

set -euo pipefail

# 颜色
GRAY='\033[90m'
YELLOW='\033[33m'
CYAN='\033[36m'
GREEN='\033[32m'
RED='\033[31m'
RESET='\033[0m'

count=20
target=""

case "${1:-}" in
  ""|"-h"|"--help")
    count=20
    ;;
  -[0-9]*)
    count="${1#-}"
    ;;
  *)
    # 视作 commit-ish
    target="$1"
    ;;
esac

print_one() {
  local sha="$1"
  local raw_subj raw_body note
  raw_subj="$(git show -s --format='%s' "$sha")"
  note="$(git notes --ref=corrected-msg show "$sha" 2>/dev/null | grep -v '^#' | sed '/^$/d' | head -n 1 || true)"

  if [ -n "$note" ]; then
    echo -e "${YELLOW}★${RESET} ${GREEN}${sha:0:9}${RESET} ${GRAY}(原 subject 含乱码, 已通过 git notes 修正)${RESET}"
    echo -e "  ${note}"
  else
    echo -e "${GREEN}${sha:0:9}${RESET} ${raw_subj}"
  fi
}

if [ -n "$target" ]; then
  print_one "$target"
  echo
  echo -e "${CYAN}--- commit details ---${RESET}"
  git show -s --format='%H%n%an <%ae>%n%ad%n%n%B' --date=iso "$target" | head -n 20
  exit 0
fi

# 列出最近 N 个 commit
mapfile -t SHAS < <(git log --format='%H' -n "$count")
for sha in "${SHAS[@]}"; do
  print_one "$sha"
done
