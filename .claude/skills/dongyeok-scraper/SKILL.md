---
name: dongyeok-scraper
description: 동역 사이트의 청빙 공고 수집기(scraper/)를 고치거나 출처를 추가할 때 쓴다. "수집이 0건", "공고가 안 올라와", "OO신학교 추가", "Actions 수집 실패", "사이트 개편으로 깨짐" 같은 요청에 해당.
---

# 동역 청빙 공고 수집기 유지보수

## 구조
- `scraper/fetch-jobs.mjs` — 모든 출처를 돌려 `data/jobs.json`·`data/jobs.js`를 만든다. 병합·90일 보관·중복(교회+제목) 제거.
- `scraper/lib.mjs` — `Http`(robots.txt 확인, 같은 호스트 3초 간격, 식별 UA `dongyeok-jobs-bot`, 403·429·차단 화면 감지), `KrRelay`(서울 중계), 지역·교회명·직책 추출.
- `scraper/sources/*.mjs` — 출처 정의. `{ id, short, name, group, home, enabled, pages, permission?, disabledReason?, viaKR?, collect({http}) }`.
  - `viaKR: true` = 해외(GitHub) 접속을 막는 출처. GitHub Actions에서는 서울 중계 함수를 거친다(지금: 총신대·대신대·목원대·기독정보넷).
  - `_board.mjs`: 게시판 목록 공통 틀 `board({listUrl, row, parse, filter})`. 대부분의 출처는 이것으로 몇 줄이면 된다.
  - `seminaries.mjs`(신학교 15곳), `denominations.mjs`(교단 총회·언론·포털 9곳), 그리고 개별 파일(`chongshin`·`mtu`·`godpeople`·`puts`).
- `scraper/link-only.json` — 수집하지 않고 링크만 거는 게시판. `scraper/certs/extra-ca.pem` — 중간 인증서를 빠뜨린 서버용(수집기가 자동 적용).
- `scraper/fixtures/` + `scraper/test-parsers.mjs` — 네트워크 없이 파서를 확인하는 표본과 점검.
- `.github/workflows/fetch-jobs.yml` — 하루 3번 수집·커밋·배포. 수동 실행 때 옵션 칸(`args`)에 `--only=… --dry --detail=0`을 넣으면 GitHub에서 일부만 시험한다.
- `supabase/functions/kr-relay/index.ts` — 서울 리전 중계 함수. 허용 사이트(`ALLOW`)만, 이 저장소 main의 OIDC 토큰만 받는다. 점검 `test.ts`(Deno). `scraper/test-relay.mjs`는 수집기 쪽 점검.
- 예비: `scripts/mac-fetch-jobs.sh`(맥 launchd, `--only=auto --out=local`). 고정 대상은 `fetch-jobs.mjs`의 `ALWAYS_LOCAL`(지금 광신대).

## 직책·사례비
- 분류 규칙 `classifyPositions`, 금액 읽기 `parseSalary`(lib.mjs). 규칙을 고치면 `test-parsers.mjs`에 사례를 추가하고 `node scraper/fetch-jobs.mjs --offline`으로 요청 없이 다시 분류한다.
- 본문은 금액·직책 힌트만 뽑고 버린다(`fillPay`). 본문 문장·연락처를 저장하는 코드를 넣지 않는다.

## 절대 규칙
1. **robots.txt가 막은 곳, 로그인이 필요한 곳은 수집하지 않는다.** 기관의 서면 허락이 있으면 `permission`에 날짜·부서·허락 내용을 적고 켠다. 브라우저인 척 UA를 바꾸거나 상용 프록시·IP 돌려 쓰기로 차단을 피하지 않는다. 서울 중계 함수는 우리 한국 리전 서버에서 같은 UA로 요청하는 것(맥과 같은 성격)이며, 한국 회선에서도 우리 봇을 막는 곳은 멈춘다.
2. **제목·날짜·링크·교회명·지역·직책만** 저장한다. 연락처·이메일·담임목사 이름·작성자 정보·IP는 `collect()` 안에서 바로 버린다.
3. 표본(`fixtures/`)을 새로 저장할 때는 전화번호·이메일·사람 이름을 지운다(저장소는 공개).
4. 요청량은 출처당 1회 실행에 10건 안팎. 페이지 수(`pages`)를 함부로 늘리지 않는다.

## 수집이 0건이거나 실패할 때
1. `data/jobs.json`의 `sources[]`에서 `status`(ok·off·robots·blocked·error)와 `note`를 본다. Actions라면 「수집」 단계 로그를 본다.
2. `blocked`·`fetch failed`가 GitHub Actions에서만 나면(맥에서는 정상) 해외 IP 차단이다.
   - 소스에 `viaKR: true`를 달고, `supabase/functions/kr-relay/index.ts`의 `ALLOW`에 호스트를 넣어 함수를 다시 배포한다(대시보드 → Edge Functions → kr-relay → Code에 붙여 넣고 Deploy, 운영자 로그인 필요). POST가 필요하면 그 경로만 `post`에 넣는다.
   - GitHub에서 `-f args="--only=<id> --dry --detail=0"`로 시험한다. 로그에 「서울 중계 사용」과 `✓`가 나오면 된다.
   - 서울에서도 안 되면(예: 광신대 TLS) `viaKR`을 빼고 `ALWAYS_LOCAL`에 넣어 맥에 맡긴다.
   - 「서울 중계 실패: …」 사유별 대처는 CLAUDE.md 「서울 중계가 실패할 때」 표.
3. `error`나 0건이면 사이트 개편이다. 목록 페이지를 한 번 받아(`curl -A 'dongyeok-jobs-bot/1.0 (+https://hyotowork-create.github.io/dongyeok/#pg-guide)'`) 선택자·API 주소를 고친다. 개인정보를 지운 표본을 `fixtures/`에 갱신한다.
4. 확인: `node scraper/test-parsers.mjs` → `node scraper/fetch-jobs.mjs --only=<id> --dry`.

## 출처 추가
1. robots.txt(`https://호스트/robots.txt`)의 `User-agent: *` 규칙과 게시판 경로를 확인하고, 이용약관에 수집 금지 조항이 있는지 본다.
2. 서버 HTML 게시판은 `seminaries.mjs`/`denominations.mjs`에 `board({...})` 항목 하나를 추가한다(그누보드·K2Web·XE·Dimode 예시가 있음). JSON API는 `chongshin.mjs`·한일장신대 항목, RSS는 `readRss`(denominations.mjs), EUC-KR은 `encoding: 'euc-kr'`.
   - `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 오류면 서버가 중간 인증서를 빠뜨린 것이다. `openssl s_client -showcerts`로 발급자를 확인하고, 발급 CA의 공식 주소에서 중간 인증서를 받아 검증(`openssl verify`)한 뒤 `certs/extra-ca.pem`에 덧붙인다. 검증 끄기(`rejectUnauthorized:false`)는 쓰지 않는다.
   - 그 출처가 서울 중계(`viaKR`)도 쓰면 `kr-relay/index.ts`의 `EXTRA_CA`에도 같은 인증서를 넣고 그 호스트에 `extraCa: true`를 달아 재배포한다. 대신대 인증서(RapidSSL TLS RSA CA G1)는 2027-11-02 만료 — 두 곳을 함께 교체한다.
3. `fetch-jobs.mjs`의 `SOURCES`에 넣고, 표본과 점검(`test-parsers.mjs`)을 추가한다.
4. 링크만 걸 곳(수집 금지·로그인)은 `scraper/link-only.json`에 넣는다. 사이트의 「다른 청빙 게시판」 목록에 표시된다.
5. `docs/운영가이드.md` 6-1 출처 현황표와 사이트 이용 안내(`#pg-guide`) 표를 함께 고친다.
