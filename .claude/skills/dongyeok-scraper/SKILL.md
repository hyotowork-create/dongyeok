---
name: dongyeok-scraper
description: 동역 사이트의 청빙 공고 수집기(scraper/)를 고치거나 출처를 추가할 때 쓴다. "수집이 0건", "공고가 안 올라와", "OO신학교 추가", "Actions 수집 실패", "사이트 개편으로 깨짐" 같은 요청에 해당.
---

# 동역 청빙 공고 수집기 유지보수

## 구조
- `scraper/fetch-jobs.mjs` — 모든 출처를 돌려 `data/jobs.json`·`data/jobs.js`를 만든다. 병합·90일 보관·중복(교회+제목) 제거.
- `scraper/lib.mjs` — `Http`(robots.txt 확인, 같은 호스트 3초 간격, 식별 UA `dongyeok-jobs-bot`, 403·429·차단 화면 감지), 지역·교회명·직책 추출.
- `scraper/sources/*.mjs` — 출처 정의. `{ id, short, name, group, home, enabled, pages, permission?, disabledReason?, collect({http}) }`.
  - `_board.mjs`: 게시판 목록 공통 틀 `board({listUrl, row, parse, filter})`. 대부분의 출처는 이것으로 몇 줄이면 된다.
  - `seminaries.mjs`(신학교 15곳), `denominations.mjs`(교단 총회·언론·포털 9곳), 그리고 개별 파일(`chongshin`·`mtu`·`godpeople`·`puts`).
- `scraper/link-only.json` — 수집하지 않고 링크만 거는 게시판. `scraper/certs/extra-ca.pem` — 중간 인증서를 빠뜨린 서버용(수집기가 자동 적용).
- `scraper/fixtures/` + `scraper/test-parsers.mjs` — 네트워크 없이 파서를 확인하는 표본과 점검.
- `.github/workflows/fetch-jobs.yml` — 하루 3번 수집·커밋·배포. 예비: `scripts/mac-fetch-jobs.sh`(맥 launchd).

## 직책·사례비
- 분류 규칙 `classifyPositions`, 금액 읽기 `parseSalary`(lib.mjs). 규칙을 고치면 `test-parsers.mjs`에 사례를 추가하고 `node scraper/fetch-jobs.mjs --offline`으로 요청 없이 다시 분류한다.
- 본문은 금액·직책 힌트만 뽑고 버린다(`fillPay`). 본문 문장·연락처를 저장하는 코드를 넣지 않는다.

## 절대 규칙
1. **robots.txt가 막은 곳, 로그인이 필요한 곳은 수집하지 않는다.** 기관의 서면 허락이 있으면 `permission`에 날짜·부서·허락 내용을 적고 켠다. 브라우저인 척 UA를 바꾸거나 프록시로 차단을 피하지 않는다.
2. **제목·날짜·링크·교회명·지역·직책만** 저장한다. 연락처·이메일·담임목사 이름·작성자 정보·IP는 `collect()` 안에서 바로 버린다.
3. 표본(`fixtures/`)을 새로 저장할 때는 전화번호·이메일·사람 이름을 지운다(저장소는 공개).
4. 요청량은 출처당 1회 실행에 10건 안팎. 페이지 수(`pages`)를 함부로 늘리지 않는다.

## 수집이 0건이거나 실패할 때
1. `data/jobs.json`의 `sources[]`에서 `status`(ok·off·robots·blocked·error)와 `note`를 본다. Actions라면 「수집」 단계 로그를 본다.
2. `blocked`가 GitHub Actions에서만 나면(맥에서는 정상) 해외 IP 차단이다. `scripts/mac-fetch-jobs.sh`를 launchd로 돌리거나 서울 리전 Supabase Edge Function으로 옮긴다(운영가이드 6-3).
3. `error`나 0건이면 사이트 개편이다. 목록 페이지를 한 번 받아(`curl -A 'dongyeok-jobs-bot/1.0 (+https://hyotowork-create.github.io/dongyeok/#pg-guide)'`) 선택자·API 주소를 고친다. 개인정보를 지운 표본을 `fixtures/`에 갱신한다.
4. 확인: `node scraper/test-parsers.mjs` → `node scraper/fetch-jobs.mjs --only=<id> --dry`.

## 출처 추가
1. robots.txt(`https://호스트/robots.txt`)의 `User-agent: *` 규칙과 게시판 경로를 확인하고, 이용약관에 수집 금지 조항이 있는지 본다.
2. 서버 HTML 게시판은 `seminaries.mjs`/`denominations.mjs`에 `board({...})` 항목 하나를 추가한다(그누보드·K2Web·XE·Dimode 예시가 있음). JSON API는 `chongshin.mjs`·한일장신대 항목, RSS는 `readRss`(denominations.mjs), EUC-KR은 `encoding: 'euc-kr'`.
   - `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 오류면 서버가 중간 인증서를 빠뜨린 것이다. `openssl s_client -showcerts`로 발급자를 확인하고, 발급 CA의 공식 주소에서 중간 인증서를 받아 검증(`openssl verify`)한 뒤 `certs/extra-ca.pem`에 덧붙인다. 검증 끄기(`rejectUnauthorized:false`)는 쓰지 않는다.
3. `fetch-jobs.mjs`의 `SOURCES`에 넣고, 표본과 점검(`test-parsers.mjs`)을 추가한다.
4. 링크만 걸 곳(수집 금지·로그인)은 `scraper/link-only.json`에 넣는다. 사이트의 「다른 청빙 게시판」 목록에 표시된다.
5. `docs/운영가이드.md` 6-1 출처 현황표와 사이트 이용 안내(`#pg-guide`) 표를 함께 고친다.
