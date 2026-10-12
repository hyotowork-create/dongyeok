#!/usr/bin/env bash
# 클라우드 세션(Claude 앱의 클라우드 작업 공간)에서 동역 유지보수를 시작할 때 한 번 실행한다. 여러 번 실행해도 안전.
#   bash scripts/cloud-setup.sh
# 하는 일: 커밋 작성자 설정(이 클론만), 점검 의존성 설치, Deno 설치(npm 경유, .tools/), 무엇에 닿는지 출력.
# 클라우드 작업 공간은 시간이 지나면 지워지므로, 새 세션마다 다시 실행한다. 절차 설명은 CLAUDE.md 「클라우드 세션에서 유지보수」.
set -u
cd "$(dirname "$0")/.."
ok() { printf '✓ %s\n' "$*"; }
no() { printf '✗ %s\n' "$*"; }

# 1. 커밋 작성자 — 저장소 관례(공개 저장소라 실명·개인 메일을 쓰지 않음). 전역 설정은 건드리지 않는다.
git config user.name '동역 운영자'
git config user.email '249303709+hyotowork-create@users.noreply.github.com'
ok "커밋 작성자: $(git config user.name) <$(git config user.email)>"

# 2. 점검 의존성
(cd scraper && npm ci --silent >/dev/null 2>&1) && ok "수집기 의존성(scraper)" || no "수집기 의존성 설치 실패: cd scraper && npm ci"
(cd supabase/test && npm ci --silent >/dev/null 2>&1) && ok "DB 점검 의존성(supabase/test)" || no "DB 점검 의존성 설치 실패: cd supabase/test && npm ci"

# 3. Deno — 공식 설치 주소는 클라우드 네트워크에서 막혀 있어 npm 패키지로 받는다(.tools/는 git 제외)
DENO=.tools/node_modules/.bin/deno
if [ ! -x "$DENO" ]; then
  mkdir -p .tools
  [ -f .tools/package.json ] || echo '{"private":true}' > .tools/package.json
  (cd .tools && npm i --silent deno@2 >/dev/null 2>&1)
fi
[ -x "$DENO" ] && ok "Deno $("$DENO" --version | head -1 | cut -d' ' -f2) — $DENO test --allow-env supabase/functions/kr-relay/" || no "Deno 설치 실패(중계 함수 점검만 못 함)"

# 4. 휴대폰 점검용 글꼴 — 사이트 글꼴(Pretendard)을 받는 CDN이 막혀 있어, 없으면 더 넓은 대체 글꼴로 그려져
#    scripts/mobile-check.mjs가 실제 휴대폰에 없는 넘침을 보고한다(10/13 확인). npm 패키지에서 글꼴 파일 하나만 꺼내 설치.
if ! fc-list 2>/dev/null | grep -q 'Pretendard Variable'; then
  (cd .tools && npm pack --silent pretendard@1.3.9 >/dev/null 2>&1 \
    && tar -xzf pretendard-1.3.9.tgz package/dist/public/variable/PretendardVariable.ttf \
    && mkdir -p ~/.local/share/fonts && cp package/dist/public/variable/PretendardVariable.ttf ~/.local/share/fonts/ \
    && rm -rf package pretendard-1.3.9.tgz && fc-cache -f >/dev/null 2>&1)
fi
fc-list 2>/dev/null | grep -q 'Pretendard Variable' && ok "휴대폰 점검 준비(Pretendard 글꼴·Chromium) — node scripts/mobile-check.mjs" || no "Pretendard 글꼴 설치 실패 — 휴대폰 점검이 넘침을 과하게 보고할 수 있음"

# 5. 어디에 닿는지
git fetch -q origin main 2>/dev/null && ok "GitHub 저장소(git)" || no "GitHub 저장소(git fetch) 실패"
if gh api repos/hyotowork-create/dongyeok --jq .full_name >/dev/null 2>&1; then
  ok "GitHub API(gh) — Actions 실행 목록·수동 실행·annotation 읽기 가능"
else
  no "GitHub API(gh) 안 됨 — 이 세션에 저장소를 쓰기 권한으로 연결해야 함(Claude가 저장소 추가 도구로 요청, 효범님은 승인만)"
fi
for u in https://hyotowork-create.github.io/dongyeok/ https://xjmexzeyxkxqsgvwaupz.supabase.co/auth/v1/health; do
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$u" 2>/dev/null)
  case "$c" in
    000) printf '· %s — 셸에서 막힘(이 환경의 네트워크 정책). 응답 확인은 node scripts/status.mjs --health\n' "${u%%/auth*}" ;;
    *) ok "$u → $c" ;;
  esac
done

# 6. 저장소에 없는 운영자 파일
for f in CLAUDE.local.md 인수인계.local.md; do
  [ -f "$f" ] && ok "$f 있음" || printf '· %s 없음 — 운영자 구글 드라이브 「동역/dongyeok」의 사본을 드라이브 도구로 읽는다(promo/도 같은 곳)\n' "$f"
done

echo
echo "다음: node scripts/status.mjs  (상태 점검, --health를 붙이면 사이트·Supabase·서울 중계 응답까지)"
