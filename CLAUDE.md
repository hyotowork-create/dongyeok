# 동역 · 부교역자 라운지 — 인수인계·유지보수 안내

> Claude Code가 이 폴더에서 세션을 시작하면 이 파일을 자동으로 읽는다.
> 이 파일 = 맥락·결정·현재 상태·유지보수 절차. 다른 계정·다른 세션이 이어받아도 이 파일만으로 일할 수 있게 쓴다.
> 상세 운영 설명 = `docs/운영가이드.md`. 수집기 수리 절차 = `.claude/skills/dongyeok-scraper/SKILL.md`.
> 운영자 관련 정보(호칭·보고 방식·계정·이 맥의 사정)는 `CLAUDE.local.md`(저장소에 안 올라감)에 있다. 있으면 반드시 함께 읽는다.
> 저장소가 공개라서 이 파일에는 운영자 실명·개인 연락처를 적지 않는다.
> 마지막 갱신: 2026-10-12 17시 반 (서울 중계·공개 연락처·약관 시행일·세라핌 0.2.0, 두 세션 작업 통합)

## 한 줄 요약
부교역자 커뮤니티 사이트입니다. 기능은 네 가지입니다.
- **청빙 공고**: 27곳을 하루 3번 자동 수집합니다. 직책을 나누고, 본문에 적힌 사례비를 읽어 분류합니다.
- **교회 평가**: 그 교회에서 사역했던 교역자의 익명 평가입니다. 운영자 검수 후 공개됩니다.
- **예배 도구**: 세라핌 내려받기, 콘티 만들기·나눔, 웹 가사 화면입니다.
- **대나무숲·자료실**: 익명 게시판과 자료 공유입니다.

## 바로 알아야 할 것

| 항목 | 값 |
|---|---|
| 공개 주소 | https://hyotowork-create.github.io/dongyeok/ |
| 저장소 | https://github.com/hyotowork-create/dongyeok (공개, 기본 브랜치 `main`, 저장소 번호 1415107065) |
| 운영자 맥의 작업 폴더 | `~/Downloads/dongyeok` (git 클론, origin = 위 저장소) |
| 배포 | `.github/workflows/fetch-jobs.yml`. main에 push하면 배포만, 예약·수동 실행이면 수집→커밋→배포. Pages Source = GitHub Actions |
| 자동 수집 | 하루 3번, KST 06:07·12:07·18:07 (`cron: '7 21,3,9 * * *'`) |
| 해외 차단 출처 | 총신대·대신대·목원대·기독정보넷은 **서울 리전 Supabase 함수 `kr-relay`를 거쳐** GitHub가 직접 모읍니다. 광신대만 운영자 맥(launchd)이 모읍니다 |
| 커뮤니티 기능 | Supabase 운영 중. 프로젝트 `xjmexzeyxkxqsgvwaupz`(서울 ap-northeast-2, 조직 dongyeok, Free). **이용자는 로그인 없이 익명 식별값(Supabase anonymous sign-in)으로 쓰고 개인정보를 받지 않습니다.** 이메일 로그인은 운영자만(관리자 1명 지정됨) |
| 공개 연락처 | `seraphim7997@gmail.com` — `config.js` `contactEmail`. 신고·임시조치·삭제 요청 접수처로 이용 안내·개인정보처리방침에 표시됨 |
| 디자인 | v2: 밤색(#0e1230)·금색(#ffc24b)·보라(#7c5cff), 예배 사진 슬라이드와 조명 빔, Unsplash 사진 핫링크 |

## 새 계정·새 세션으로 이어받을 때
1. **이 파일 → `CLAUDE.local.md` → `docs/운영가이드.md`** 순서로 읽습니다. 작업 전에 `git pull --rebase origin main`(봇이 하루 3번 커밋함).
2. 필요한 접근 권한과 누가 여는지
   | 대상 | 필요한 일 | 여는 사람 |
   |---|---|---|
   | GitHub 저장소 | 코드 수정·push, Actions 확인 | 운영자 계정(hyotowork-create)으로 `gh auth login`을 하거나, 운영자가 Settings → Collaborators에서 새 계정을 초대 |
   | Supabase 대시보드 | 함수 재배포, SQL 실행, 인증 설정 | 운영자가 로그인하거나 Organization `dongyeok` → Team에서 새 계정 초대 |
   | 운영자 맥 launchd | 광신대 보충 수집 | 운영자 맥에만 있음(아래 「외부 자원」) |
   - Claude는 계정 생성·비밀번호·토큰 입력·기기 인증 코드 입력을 하지 않습니다. 로그인은 운영자가 하고, 그다음 작업을 이어받습니다.
3. Claude 메모리는 계정·기기마다 따로일 수 있습니다. 결정·상태는 모두 이 파일과 `CLAUDE.local.md`에 적어 둡니다. 새로 정한 것이 생기면 이 파일의 「현재 상태」「남은 일」「작업 기록」을 고치고 커밋합니다.
4. 비밀값은 어디에도 없습니다. `config.js`의 Supabase 공개(publishable) 키와 함수 주소는 공개값입니다. service_role 키·비밀번호·토큰은 저장소·문서·채팅에 넣지 않습니다.

### 동시 작업 주의
2026-10-12에 한 대화가 두 세션으로 갈라져 이 폴더를 동시에 고쳤습니다(충돌 없이 통합함, 기록은 `CLAUDE.local.md`). 앞으로는 한 번에 한 세션만 고칩니다. 작업 전에 `git pull --rebase origin main`과 `git status`를 보고, 내가 만들지 않은 미커밋 변경이 있으면 건드리지 말고 운영자에게 알립니다.

## 외부 자원(전부)

| 자원 | 위치 | 비고 |
|---|---|---|
| GitHub Pages | 저장소 Settings → Pages(Source: GitHub Actions) | HTTPS 강제 켜짐 |
| GitHub Actions | `청빙 공고 수집·배포` 워크플로 | 저장소 Secrets 없음. 서울 함수 권한은 OIDC 토큰(`id-token: write`) |
| 저장소 보호 | 비밀키 유출 감시·push 차단, Dependabot 알림 | 켜짐 |
| Supabase 프로젝트 | `xjmexzeyxkxqsgvwaupz`, 서울, Free | 7일 무활동 시 일시정지 → 대시보드에서 Restore |
| Supabase Auth | Anonymous sign-ins **켜짐**, Email(운영자 전용), Site URL·Redirect = 공개 주소 | 운영자 메일은 Supabase 기본 메일 |
| Supabase DB | `supabase/schema.sql` 전체 적용됨(여러 번 실행 안전) | 관리자 1명(`public.admins`) |
| Supabase Storage | 버킷 `resources`(10MB, 문서·이미지) | 익명 이용자 업로드 금지(정책·트리거) |
| Supabase Edge Function | **`kr-relay`**(서울 중계) — 코드 `supabase/functions/kr-relay/index.ts` | 대시보드에 붙여 넣어 배포. 시험용 `probe-kr`은 2026-10-12 삭제 |
| 운영자 맥 launchd | `~/Library/LaunchAgents/kr.dongyeok.fetch.plist`(05:45·11:45·17:45) → `~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.sh` | 별도 git 클론. `~/Downloads`는 macOS 폴더 보호로 예약 작업이 못 읽음 |
| 세라핌 | 저장소 `hyotowork-create/Seraphim`, 릴리스 **0.2.0**(2026-10-12, Windows 설치형·포터블, Mac Apple Silicon) | 사이트 「내려받기」 = `/releases/latest`. 0.2.0 소스는 아직 GitHub에 없음(운영자 맥의 작업 브랜치) |
| 사진 | Unsplash 핫링크(`photo-…` 아이디) | 목록은 운영가이드 2-3 |
| 통계 | `config.js`의 `goatcounter` | 비어 있음(꺼짐) |

## 현재 상태 (2026-10-12)

### 정상인 것
- 공개 사이트: 화면 21개, 콘솔 오류 0건, 휴대폰 폭 정상, 보안 정책(CSP) 적용
- 커뮤니티(실사이트에서 확인): 익명 글·댓글·공감 토글, 교회 평가(검수 대기·본인만 보임), 자료 링크 공유, 내 글 삭제(소프트 삭제), 익명 파일 업로드 거절
- 운영 화면: 운영자가 시험 평가 「시험교회」를 반려 → DB `status = rejected`, `moderation_log`에 기록(10-12 16:50) 확인
- 공개 연락처: 이용 안내·개인정보처리방침 3곳에 메일 링크 표시 확인(「설정 필요」 문구 없음)
- 청빙 공고: 약 1,250건(묶음 후 약 1,160건). 사례비가 숫자로 적힌 공고 약 220건, 내규·협의 약 330건
- **서울 중계(kr-relay)**: 2026-10-12 16:33 GitHub Actions 시험 실행(저장 안 함, `--only=chongshin,daeshin,mokwon,cjob --dry --detail=0`)에서 총신대 150·대신대 15·목원대 14·기독정보넷 40건, 요청 10회 모두 중계 성공(run 38218382989)
  - 실서버 거절 동작 확인: 토큰 없음 401, 미국 지역 지정 421, GET 405
  - 같은 날 16:48 **실제 저장까지** 확인: `--only=chongshin,daeshin,mokwon,cjob --detail=0` 수동 실행(run 38219812292) → 4곳 성공, 커밋 a163e19, 배포 성공. 공개 사이트 `data/jobs.json`에 네 출처 note 「서울 중계 서버 경유」 반영 확인
  - 그 결과 다음 맥 보충 수집 대상은 광신대 하나만 남음(`--only=auto` 계산으로 확인)
- 점검(모두 외부 요청 없음):
  - `node scraper/test-parsers.mjs` 15개 통과
  - `node scraper/test-relay.mjs` 14개 통과
  - `deno test --allow-env supabase/functions/kr-relay/` 7개 통과
  - `cd supabase/test && npm test` 17개 통과
  - npm audit 0건, 수집 데이터의 이메일·전화번호 0건

### 아직 확인하지 않은 것
- **예약 실행이 한 번도 돌지 않았습니다.** 저장소가 10/12 14:23에 처음 올라와서 첫 예약이 10/12 18:07입니다(중계·저장·배포는 16:48 수동 실행으로 이미 확인). 예약 자체가 도는지만 남았습니다. 확인할 것:
  - `gh run list -R hyotowork-create/dongyeok --event schedule`에 실행이 생겼는지(예약은 수십 분 늦을 수 있음)
  - `data/jobs.json`의 총신대·대신대·목원대·기독정보넷 `note`가 「서울 중계 서버 경유」인지
  - 다음 맥 실행(10/13 05:45) 로그에 광신대만 남았는지(`~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.log`)

### 알려진 문제 (우선순위 순)
1. **광신대는 맥에서만 모입니다.** GitHub(미국)에서는 막히고, 서울 함수(Deno)는 학교 서버의 옛 TLS 방식을 지원하지 않아 `received fatal alert`로 실패합니다.
   - 맥이 꺼져 있거나 3일 넘게 실패하면 광신대 공고(약 10건)만 오래된 상태로 남습니다. 3일이 넘은 보충 파일은 합치지 않습니다.
   - 서울 중계가 실패한 출처가 생기면 다음 맥 실행이 자동으로 그 출처도 맡습니다(`--only=auto`).
2. **익명 운영의 한계**(2026-10-12 운영자 결정: 개인정보를 받지 않음)
   - 내 글 삭제는 글을 쓴 브라우저에서만 됩니다.
   - 브라우저를 바꿔 여러 번 쓰거나 신고하기가 쉽습니다. 막는 장치: 1분 5건 도배 방지, Supabase 익명 발급 제한(IP당), 평가 사전 검수, 신고 3건 자동 가림 후 운영자 복구.
   - 악용이 늘면 Cloudflare Turnstile(무료 CAPTCHA)을 Supabase Auth의 Bot and Abuse Protection에 연결합니다. 운영자가 Cloudflare 계정과 키를 만들어야 합니다.
   - 익명 이용자는 자료를 링크로만 공유합니다(파일 업로드는 DB 트리거·저장소 정책이 거절). 운영자 계정은 파일 업로드 가능.
3. 개인정보처리방침·이용약관: 시행일 2026-10-12 기입(운영자 결정), 화면의 "초안" 표시는 뺐습니다. **법률 검토는 아직 안 했습니다**(남은 일).
4. **대신대 중간 인증서가 2027-11-02에 만료됩니다.** `scraper/certs/extra-ca.pem`과 `supabase/functions/kr-relay/index.ts`의 `EXTRA_CA` **두 곳을 함께** 바꾸고 함수를 다시 배포합니다(SKILL.md 참고).
5. Supabase 무료 플랜은 7일 동안 활동이 없으면 일시정지됩니다. 정지되면 커뮤니티 기능과 서울 중계가 함께 멈춥니다(공고는 이전 것이 유지됨).

## 구조

```
index.html                 사이트 전체(단일 파일 SPA, 화면 21개). 라우터: #pg-화면?키=값 + hashchange
config.js                  이름·주소·Supabase 공개값·통계·도구 목록·업로드 한도 (공개돼도 되는 값만)
404.html
data/jobs.json, jobs.js    수집 결과(자동 생성, 직접 고치지 않음). jobs.js = file://로 열어도 읽히는 사본
data/jobs-local.json       맥 보충 수집 결과(광신대 등). GitHub 수집이 합침
scraper/
  fetch-jobs.mjs           수집·병합·본문 읽기·재분류·저장(옵션 아래)
  lib.mjs                  Http(robots·3초 간격·식별 UA·차단 감지·인코딩 자동), KrRelay(서울 중계), 지역·교회명·직책·사례비
  sources/                 출처 정의 — _board.mjs(공통 틀), seminaries.mjs(신학교 15), denominations.mjs(총회·언론·포털 9),
                           chongshin.mjs, mtu.mjs, godpeople.mjs, puts.mjs(꺼짐). 해외 차단 출처는 viaKR: true
  link-only.json           수집하지 않고 링크만 거는 게시판 13곳
  certs/extra-ca.pem       중간 인증서를 빠뜨린 서버용 공개 인증서(자동 적용)
  fixtures/ + test-parsers.mjs   개인정보를 지운 표본 + 점검 15개
  test-relay.mjs           서울 중계 사용 점검 14개(가짜 중계를 이 컴퓨터 안에 띄움)
supabase/schema.sql        DB·열 단위 권한·RLS·트리거·RPC(SQL Editor에 통째로 Run, 여러 번 실행 안전)
supabase/test/             PGlite로 schema.sql 점검(17개)
supabase/functions/kr-relay/   서울 중계 함수 index.ts + 점검 test.ts(Deno, 7개)
scripts/mac-fetch-jobs.sh  맥 보충 수집 → data/jobs-local.json 커밋·푸시(launchd는 별도 사본에서 실행)
.claude/skills/dongyeok-scraper/SKILL.md   수집기 수리·출처 추가 절차
docs/운영가이드.md          설정·운영·법적 유의사항 전체
docs/수집허락요청문.md       robots.txt 금지 기관에 보낼 요청문
promo/                     홍보 문구(저장소 제외)
```

### 수집 구조
- **출처 27곳**
  - 신학교 17: 총신·감신·고려신대원·합신·대신·광신·웨신·한일장신·영남신·부산장신·서울장신·백석대학원·횃불·목원·협성·한세 대학원·아신
  - 총회 4: 통합·기장·기침·기성
  - 언론 3: 한국기독공보·기독교개혁신보·기독일보
  - 포털 3: 갓피플·기독정보넷·청빙넷
- **링크만 거는 곳 13**: robots.txt 금지이거나 로그인이 필요한 곳. 장신대·침신대·호남신대·대전신대·한국성서대(성서대학원), 예성·나사렛·백석·대신(수호) 총회, CTS, 기감·기하성(여의도)·기독신문
- **어디서 요청하나**
  | 출처 | GitHub Actions(미국) | 경로 |
  |---|---|---|
  | 22곳 | 직접 | GitHub |
  | 총신대·대신대·목원대·기독정보넷 | 막힘 | GitHub → **서울 함수 kr-relay** → 사이트 |
  | 광신대 | 막힘(서울 함수도 TLS 실패) | 운영자 맥 launchd → `data/jobs-local.json` → GitHub가 합침 |
- **저장하는 것**: 제목, 날짜, 원문 링크, 교회명(교회·공동체로 끝나는 이름만), 지역, 직책, 모집 부서, 교단, 마감, 사례비 숫자. 본문 문장·연락처·작성자 이름은 저장하지 않습니다.
- **병합 규칙**
  - id = 출처 약자 + hash(교회명|정규화한 제목). `dk`가 같으면 출처가 달라도 같은 공고로 보고, 화면에서 하나로 묶습니다.
  - 같은 출처의 같은 원문 주소·같은 제목인데 id가 다른 옛 기록은 지웁니다.
  - 그 회차에 실패한 출처의 이전 공고는 유지합니다.
  - 90일이 지난 공고는 지우고, 최대 3,000건까지만 둡니다.
- **사례비 읽는 곳**
  - 총신대: 목록 API의 본문. 응답이 끊기면 본문 없이 목록만 받습니다.
  - 영남신대: 목록 양식의 사례비 칸
  - 기독정보넷: RSS
  - 나머지: 새 공고 본문을 한 번만 읽습니다. 1회 최대 150건, 출처당 20건, 45일 이내 공고만 읽습니다. 한국기독공보·기독일보는 제외합니다. 중계 출처의 본문도 중계로 읽습니다.
- **직책**: 제목 + 부서 + 태그로 분류합니다. 제목으로 모르면 본문 앞부분에서 교역자 직책만 보충합니다(`posHint`).
- **서울 중계(kr-relay)**
  - 수집기(`KrRelay`)는 워크플로 환경값 `KR_RELAY_URL`·`KR_RELAY_APIKEY`(공개값)와 Actions OIDC 토큰이 있을 때만 켜집니다. 맥에서는 꺼져 있습니다.
  - 함수는 허용 4개 사이트만 중계합니다(GET, POST는 총신대 목록 API만). 이 저장소 main의 OIDC 토큰만 받고, 서울이 아니면 거절합니다. 비밀키 없음.
  - UA·robots.txt·3초 간격은 수집기가 그대로 지킵니다. 출처 상태 `note`에 「서울 중계 서버 경유」가 붙습니다.
  - 출처를 중계에 넣거나 뺄 때는 소스의 `viaKR`과 함수의 `ALLOW`를 같이 고치고 함수를 다시 배포합니다.
- **맥 보충 수집**
  - 명령: `--only=auto --out=local`
  - 대상: 광신대(고정) + 직전 GitHub 수집에서 실패했거나 맥으로 채운 출처
  - 결과를 `data/jobs-local.json`에 쓰고, GitHub 수집이 실패한 출처만 이 파일(3일 이내)로 채웁니다.
  - 두 쪽이 쓰는 파일이 달라서 충돌하지 않습니다. 커밋 전에 `git pull --rebase`를 합니다.

### Supabase 설계(운영 중)
- `author_id`는 열 단위 권한으로 API에서 아무도 읽을 수 없습니다(관리자 포함). 익명 이름은 서버 트리거가 정합니다.
- 교회 평가는 `pending`으로 들어가고 운영자가 공개합니다. 서로 다른 신고가 3건 쌓이면 자동으로 가립니다. 도배는 1분에 5건까지입니다.
- 내 글 목록은 `my_items()`, 운영 화면은 `moderation_queue()`·`moderate()`가 맡고, 처리 기록은 `moderation_log`에 남습니다.
- 콘티는 `lyrics` 키가 있으면 DB가 거절합니다(가사 저작권).
- 익명(`is_anonymous`) 사용자의 파일 업로드는 저장소 정책과 `tg_content_before_insert` 트리거가 모두 거절합니다.
- 사이트 쪽: `index.html`의 `LiveAPI.ensureUser()`가 처음 쓸 때 `signInAnonymously()`를 부릅니다. 로그인 링크는 implicit 방식이고, 주소창의 토큰은 바로 지웁니다.

## 결정 기록(왜 이렇게 했나)
| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-10-07 | 단일 파일 SPA + GitHub Pages + Supabase | KSA 홈페이지와 같은 방식, 무료, 다른 단체로 재사용 쉬움 |
| 2026-10-07 | 청빙 공고는 제목·링크 등만 저장, robots.txt 금지·로그인 필요 곳은 링크만 | 저작권·개인정보·이용약관 위험 최소화 |
| 2026-10-12 | 이용자 로그인 없음(익명 식별값), 개인정보 미수집 | 운영자 결정: 개인정보 보관 부담과 이용자의 찜찜함을 없앰 |
| 2026-10-12 | 교회 평가 사전 검수 유지 | 명예훼손 위험(형법 307조 1항) |
| 2026-10-12 | 해외 차단 출처는 서울 Supabase 함수로 중계, 광신대만 맥 | 맥을 계속 켜 두지 않아도 되게. Meta Muse는 예약 반복 기능이 없고 미국 서비스라 같은 곳이 막힘, Claude 클라우드 예약 실행도 미국 서버라 같은 문제가 있어 제외. 수집기를 Deno로 옮기는 방식(pg_cron) 대신 중계를 고른 이유: 코드가 한 벌로 유지되고, 함수의 실행 시간·CPU 한도에 걸리지 않음 |

## 자주 쓰는 명령
```bash
cd ~/Downloads/dongyeok
git pull --rebase origin main                          # 작업 전 항상(봇이 하루 3번 커밋함)
node scraper/test-parsers.mjs                          # 수집기 점검(네트워크 없음)
node scraper/test-relay.mjs                            # 서울 중계 사용 점검(네트워크 없음)
deno test --allow-env supabase/functions/kr-relay/     # 중계 함수 점검(네트워크 없음)
node scraper/fetch-jobs.mjs                            # 전체 수집(이 맥=한국 회선, 중계 안 씀)
node scraper/fetch-jobs.mjs --only=mtu --dry           # 한 곳만, 저장 안 함
node scraper/fetch-jobs.mjs --offline                  # 요청 없이 분류 규칙만 다시 적용
node scraper/fetch-jobs.mjs --detail=0                 # 본문(사례비) 읽기 끄기
zsh ~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.sh   # 맥 보충 수집 + 커밋·푸시(launchd가 하루 3번 자동 실행)
launchctl print gui/$(id -u)/kr.dongyeok.fetch | grep -E 'state|last exit'   # 예약 작업 상태
cd supabase/test && npm test                           # DB 스키마 점검
gh run list -R hyotowork-create/dongyeok --limit 5     # 자동 수집·배포 결과
gh workflow run fetch-jobs.yml -R hyotowork-create/dongyeok   # 수동 전체 수집(하루 1~2회 이내로)
gh workflow run fetch-jobs.yml -R hyotowork-create/dongyeok -f args="--only=chongshin,mokwon --dry --detail=0"   # GitHub에서 일부만 시험(저장 안 함)
```
사이트를 로컬에서 미리 보는 방법: 운영자 맥의 미리보기 서버는 `~/Downloads`를 읽지 못합니다(macOS 폴더 보호). 그래서 사이트 파일을 임시 폴더에 복사해서 띄웁니다. 자세한 방법은 `CLAUDE.local.md`에 있습니다.

## 유지보수 절차

### 정기 점검(주 1회 권장)
1. `gh run list`로 최근 실행이 성공했는지 봅니다. 실패하면 GitHub가 저장소 주인에게 메일을 보냅니다.
2. `data/jobs.json`의 `sources[]`에서 `status`가 ok가 아닌 출처를 봅니다. 중계 출처 4곳의 `note`는 「서울 중계 서버 경유」, 광신대는 「맥에서 보충 수집」이 정상입니다.
3. 맥 보충 파일 `data/jobs-local.json`의 `updatedAt`이 3일 이내인지 봅니다. 오래됐다면 `~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.log`와 `~/Library/Logs/dongyeok-fetch.log`를 확인합니다.
4. 사이트를 열어 오늘 날짜 공고가 있는지, 「직책별 사례비」 표가 정상인지 봅니다.
5. 공개 저장소는 60일 동안 활동이 없으면 예약 실행이 꺼집니다. 봇이 매번 커밋하므로 보통 유지되지만, 꺼졌다면 Actions 화면에서 Enable을 누릅니다.
6. 운영 화면(푸터 「운영자 로그인」 → 상단 「운영」)에서 검수 대기 평가와 신고된 글을 처리합니다(`docs/운영가이드.md` 7장).
7. Supabase 무료 플랜은 7일 동안 활동이 없으면 일시정지됩니다. 정지되면 대시보드에서 Restore를 누릅니다.

### 수집이 깨졌을 때
`dongyeok-scraper` 스킬(`.claude/skills/dongyeok-scraper/SKILL.md`)을 따릅니다.
1. 원인부터 나눕니다. 맥에서는 되고 GitHub에서만 안 되면 해외 차단이고, 맥에서도 0건이면 사이트 개편입니다.
2. 선택자를 고칩니다.
3. 표본(fixtures)을 갱신합니다. 이때 개인정보를 지웁니다.
4. `test-parsers` → `--only=<id> --dry`로 확인합니다.

### 서울 중계가 실패할 때
`note`나 Actions 로그에 「서울 중계 실패: …」가 보이면 뒤의 사유로 나눕니다.
| 사유 | 원인 | 할 일 |
|---|---|---|
| 호출 권한 없음: 다른 저장소 | 저장소를 새로 만들었거나 복사함 | 함수 `REPO_ID`를 새 번호로 바꿔 재배포 |
| 호출 권한 없음: main이 아닌 브랜치 | main 말고 다른 브랜치에서 실행 | main에서 실행 |
| 허용하지 않은 사이트 | 소스에 `viaKR`을 달았는데 함수 `ALLOW`에 없음(또는 사이트 주소가 바뀜) | `ALLOW` 고쳐 재배포 |
| 서울이 아닌 곳에서 실행됨 | 지역 지정이 빠짐 | `KrRelay`가 `x-region`·`forceFunctionRegion`을 보내는지 확인 |
| 사이트 접속 실패 | 그 사이트가 서울 AWS도 막음, 또는 TLS 문제 | 그 출처의 `viaKR`을 빼고 맥 보충(`ALWAYS_LOCAL`)으로 돌림 |
| HTTP 404/503(사유 없음) | 함수가 없거나 Supabase 일시정지 | 대시보드에서 Restore, 함수 재배포 |
재배포 방법은 `docs/운영가이드.md` 6-3에 있습니다.

### 출처 추가
1. robots.txt의 `User-agent: *` 규칙과 이용약관을 확인합니다. 로그인이 필요한 곳은 넣지 않습니다.
2. `sources/seminaries.mjs` 또는 `denominations.mjs`에 `board({...})` 항목을 추가하고 점검을 붙입니다.
3. 수집이 금지된 곳은 `link-only.json`에 링크만 넣습니다.
4. GitHub에서만 막히면 `viaKR: true`와 함수 `ALLOW`를 함께 고칩니다.
5. `docs/운영가이드.md` 6-1 표를 고칩니다. 사이트 이용 안내의 출처 표는 자동으로 갱신됩니다.

### 분류 규칙(직책·사례비)을 고칠 때
`lib.mjs`의 `classifyPositions`·`parseSalary`를 고칩니다. `test-parsers.mjs`에 사례를 추가한 뒤 `--offline`으로 다시 분류하고 커밋합니다. 화면의 직책 목록은 `index.html`의 `POS_GROUPS`이며, `lib.mjs`의 `POSITION_GROUPS`와 같게 유지해야 합니다. 직책별 현실 범위는 `PAY_RANGE`에 있습니다.

### schema.sql을 고칠 때
`cd supabase/test && npm test`로 점검한 뒤 Supabase SQL Editor에 전체를 붙여 넣고 Run 합니다(여러 번 실행 안전). 대시보드 작업은 운영자 로그인이 필요합니다.

### 디자인·문구를 고칠 때
`index.html` 맨 위 `:root` 토큰을 씁니다. 사진은 `photo-…` 아이디로 바꿉니다(목록은 운영가이드 2-3). 보안 정책(CSP 메타)에 없는 외부 주소를 추가하면 그 주소가 차단되므로 CSP도 함께 고칩니다.

## 절대 규칙
- **robots.txt가 막은 곳과 로그인이 필요한 곳은 수집하지 않습니다.** UA를 바꾸거나, 상용 프록시·IP 돌려 쓰기로 차단을 피하지 않습니다. 기관의 서면 허락을 받으면 소스의 `permission`에 기록하고 켭니다.
  - 서울 중계 함수는 우리가 운영하는 한국 리전 서버에서 같은 식별 UA로 요청하는 것이고(맥 보충 수집과 같은 성격), robots.txt·간격 규칙이 그대로 적용됩니다. 어떤 사이트가 한국 회선에서도 우리 봇을 막거나 robots.txt로 금지하면 그 출처는 멈춥니다.
- **본문 문장·연락처·작성자 이름·IP는 저장하지 않습니다.** 숫자(사례비)와 직책 힌트만 뽑고 버립니다. 표본도 개인정보를 지운 뒤 커밋합니다.
- **`config.js`에는 공개값만 넣습니다.** Supabase anon(publishable) 키는 넣어도 되고, service_role 키·비밀번호는 절대 넣지 않습니다. 저장소는 공개입니다.
- 교회 평가는 사전 검수를 유지합니다(명예훼손 위험: 형법 307조 1항은 사실을 적시해도 처벌될 수 있음). 권리침해 신고에는 임시조치(정보통신망법 44조의2)로 대응합니다.
- 콘티 나눔에는 가사를 넣지 않습니다(DB가 거절함). 자료실에는 권리가 있는 자료만 올리게 합니다.
- 수동 수집(`gh workflow run`, 로컬 전체 수집)은 하루 1~2회 이내로 합니다. 10/12에 여러 번 돌린 뒤 일부 사이트가 GitHub 서버를 막기 시작했습니다. 시험은 `--only=… --dry --detail=0`으로 요청을 줄입니다.
- 확인하지 않은 것을 "정상"이라고 보고하지 않습니다. 맥에서 된 것, GitHub에서 된 것, 서울 중계로 된 것을 구분해서 보고합니다.
- 공개·외부 발신(배포 외의 게시, 메일, 수집 허락 요청, 스레드 게시)과 운영자 맥 설정 변경(launchd 등)은 운영자 승인 후에 합니다.

## 남은 일
| 일 | 담당 | 비고 |
|---|---|---|
| 첫 예약 실행(10/12 18:07) 확인 | Claude | 위 「아직 확인하지 않은 것」 |
| 세라핌 0.2.0 소스 공개 여부 | 운영자 | 시험용 파일에 찬송가·CCM 가사와 실제 예배 PPT가 있어 그대로 공개하면 저작권 문제. 공개하려면 그 파일을 빼고 올림 |
| 개인정보처리방침·약관 법률 검토 | 운영자 | |
| 수집 허락 요청 메일 발송 | 운영자 | `docs/수집허락요청문.md` |
| 스레드 연재 | 운영자 | `promo/스레드-출시문구.md`(저장소 제외). 헬라어·인용은 10/12 확인 완료(풀이 한 곳 수정). [고백] 2줄은 운영자 실제 경험일 때만 쓰고, 아니면 파일에 적어 둔 대안 사용 |
| 광신대를 맥 없이 모으는 방법 | Claude(선택) | 학교에 허락을 받고 TLS 개선을 요청하거나, 그대로 맥에 둠 |
| 악용이 늘면 Turnstile 연결 | 운영자 + Claude | 운영자가 Cloudflare 키 발급 |
| 중간 인증서 교체(두 곳) | Claude | 2027-11-02 전 |

## 작업 기록
| 날짜 | 내용 |
|---|---|
| 2026-10-07 | 사이트·수집기(총신·감신·갓피플)·Supabase 스키마·운영가이드 작성. 디자인 v2(교회 이미지·조명). 출처를 27곳으로 확대 |
| 2026-10-12 | GitHub 공개·Pages 배포(af70c77). Supabase 생성·연결(서울, 42cd60a), 관리자 지정, 로그인 없이 쓰기(익명 식별값·개인정보 미수집, 2e0dc1d) — 실사이트에서 익명 글·댓글·공감·평가(검수 대기)·자료 링크·삭제·익명 파일 거절 확인. CSP·의존성 알림 적용. 한국성서대 링크 추가. 해외 차단 출처 맥 보충 수집. 직책 세분화·사례비 분류·직책별 사례비 표(8c99bb4). 총신대 폴백, 맥 보충 자동 선택(65a0d10). 인수인계 문서(c563189). 맥 보충 수집 launchd 설치(05:45·11:45·17:45, 별도 사본 ~/Developer/dongyeok-collector) |
| 2026-10-12 | 서울 리전 시험 함수(probe-kr)로 확인: 서울 AWS에서 총신·대신·목원·기독정보넷 접속 성공, 광신대는 TLS 실패. Meta Muse·Claude 클라우드 예약 실행 검토 후 제외. **서울 중계 함수 kr-relay 배포·수집기 연결(69d263d)**, GitHub 시험 실행에서 4곳 성공. probe-kr 삭제. 맥 보충은 광신대만 고정 |
| 2026-10-12 | 서울 중계 실수집(4곳 저장·배포, a163e19) 확인. 공개 연락처 seraphim7997@gmail.com 설정(bd5a596). 운영 화면 반려 동작 확인(시험교회 → rejected) |
| 2026-10-12 | 세라핌 0.2.0 릴리스(설치 파일 3개·SHA256·제3자 고지), Seraphim main에 LICENSE(MIT)·THIRD-PARTY-NOTICES 추가(d177b1c). 사이트 내려받기 링크를 /releases/latest로 |
| 2026-10-12 | 개인정보처리방침·이용약관 시행일 2026-10-12 기입, 위탁 표의 저장 위치를 "대한민국(서울)"로 확정. 스레드 문구 원어·숫자 점검 |
| 2026-10-12 | 세라핌 LICENSE를 표준 MIT 문구만 남겨 GitHub가 MIT로 인식(Seraphim 904cc40, 제3자 안내는 README로). 두 세션 작업 내용 통합 |
| 2026-10-12 | **운영자가 사이트를 공개 오픈(홍보 시작)**. 이후 매일 운영 화면에서 검수·신고 처리 필요 |
