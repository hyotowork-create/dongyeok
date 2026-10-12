#!/bin/zsh
# 맥에서 청빙 공고를 수집해 GitHub에 올리는 예비 수단
# (GitHub Actions가 해외 접속 차단으로 실패할 때. 한국 인터넷에서 돌므로 차단 위험이 가장 낮음)
#
#   수동 실행:  zsh scripts/mac-fetch-jobs.sh
#   자동 실행:  docs/운영가이드.md 6-3의 launchd 설정 참고
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="scripts/mac-fetch-jobs.log"
{
  echo "── $(date '+%Y-%m-%d %H:%M:%S') 시작"
  git pull --ff-only --quiet
  [ -d scraper/node_modules ] || (cd scraper && npm ci --no-audit --no-fund)
  node scraper/test-parsers.mjs > /dev/null
  node scraper/fetch-jobs.mjs
  git add data/jobs.json data/jobs.js
  if git diff --cached --quiet; then echo "변경 없음"; else
    git commit -q -m "청빙 공고 갱신(맥) $(date '+%Y-%m-%d %H:%M')"
    git push -q
    echo "올림 완료"
  fi
} >> "$LOG" 2>&1
