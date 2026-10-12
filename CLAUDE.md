# 동역 · 부교역자 라운지 — 인수인계·유지보수 안내

> Claude Code가 이 폴더에서 세션을 시작하면 이 파일을 자동으로 읽는다.
> 이 파일 = 맥락·결정·현재 상태·유지보수 절차. 상세 운영 설명 = `docs/운영가이드.md`. 수집기 수리 절차 = `.claude/skills/dongyeok-scraper/SKILL.md`.
> 운영자 관련 정보·이 맥의 사정은 `CLAUDE.local.md`(저장소에 안 올라감)에 있다. 있으면 함께 읽는다.
> 마지막 갱신: 2026-10-12

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
| 저장소 | https://github.com/hyotowork-create/dongyeok (공개, 기본 브랜치 `main`) |
| 이 맥의 작업 폴더 | `~/Downloads/dongyeok` (git 클론, origin = 위 저장소) |
| 배포 | `.github/workflows/fetch-jobs.yml`. main에 push하면 배포만, 예약·수동 실행이면 수집→커밋→배포. Pages Source = GitHub Actions |
| 자동 수집 | 하루 3번, KST 06:07·12:07·18:07 (`cron: '7 21,3,9 * * *'`) |
| 커뮤니티 기능 | Supabase 연결됨(2026-10-12). 프로젝트 `xjmexzeyxkxqsgvwaupz`(서울, 조직 dongyeok, Free). **단, 자체 메일 서버(SMTP)가 없어서 아직 일반 이용자 로그인 메일이 나가지 않음** → 「알려진 문제」 참고 |
| 디자인 | v2: 밤색(#0e1230)·금색(#ffc24b)·보라(#7c5cff), 예배 사진 슬라이드와 조명 빔, Unsplash 사진 핫링크 |

## 현재 상태 (2026-10-12)

### 정상인 것
- 공개 사이트: 화면 21개, 콘솔 오류 0건, 휴대폰 폭 정상, 보안 정책(CSP) 적용
- 청빙 공고: 1,252건(묶음 후 1,161건). 사례비가 숫자로 적힌 공고 222건, 내규·협의 332건
- 점검:
  - `node scraper/test-parsers.mjs` 15개 통과
  - `cd supabase/test && npm test` 16개 통과
  - npm audit 0건, 수집 데이터의 이메일·전화번호 0건
- 저장소 보호: 비밀키 유출 감시·커밋 차단, 의존성 취약점 알림, HTTPS 강제 모두 켜짐

### 알려진 문제 (우선순위 순)

1. **GitHub(미국 서버)에서 실패하는 출처가 5곳입니다.**
   - 대신대·광신대·기독정보넷은 늘 해외 접속을 막습니다(robots.txt 응답 없음, 403).
   - 총신대·목원대는 10/12 오후 첫 수집 때는 됐지만 여러 번 돌린 뒤 `fetch failed`가 납니다. 원인은 미확정이고, 다음 실행부터 오류 코드가 `data/jobs.json`의 `sources[].note`에 남습니다.
   - 대응: **맥 보충 수집이 launchd로 하루 3번(05:45·11:45·17:45) 자동 실행됩니다**(2026-10-12 설치). GitHub 수집보다 먼저 돌아서 결과가 바로 합쳐집니다.
     - 맥이 꺼져 있거나 3일 넘게 실패하면 이 5곳의 공고가 오래된 상태로 남습니다. 3일이 넘은 보충 파일은 합치지 않습니다.
     - 실행 기록은 `~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.log`에 남습니다.
2. **일반 이용자 로그인 수단이 필요합니다.** Supabase는 연결했습니다(스키마 실행·RLS 14개·버킷·사이트 주소 등록 완료).
   - 기본 메일 서버는 프로젝트 팀원 주소로만 메일을 보내는 것으로 알려져 있습니다. 템플릿(6자리 코드)도 자체 SMTP를 연결해야 고칠 수 있습니다.
   - 해결책은 둘 중 하나입니다: ① SMTP 연결(Gmail 앱 비밀번호나 Brevo) ② 카카오(또는 구글) 로그인 연결.
   - 둘 다 운영자가 직접 계정·비밀값을 만들어 대시보드에 넣어야 합니다(Claude는 비밀번호·키를 입력하지 않음).
3. `config.js`의 `contactEmail`(신고·임시조치 접수처)이 비어 있습니다. 화면에는 "설정 필요"로 보입니다.
4. 개인정보처리방침·이용약관은 초안입니다. 법률 검토와 시행일 기입이 필요합니다.
5. 세라핌 저장소(`hyotowork-create/Seraphim`)에 Releases가 없어서 「내려받기」 버튼이 빈 릴리스 페이지로 갑니다.
6. `scraper/certs/extra-ca.pem`(대신대 중간 인증서)이 **2027-11-02에 만료됩니다.** 그 전에 교체해야 합니다(SKILL.md 참고).
7. Supabase 무료 플랜은 7일 동안 활동이 없으면 일시정지됩니다. 연결한 뒤에 주의가 필요합니다.

## 구조

```
index.html                 사이트 전체(단일 파일 SPA, 화면 21개). 라우터: #pg-화면?키=값 + hashchange
config.js                  이름·주소·Supabase 공개값·통계·도구 목록·업로드 한도 (공개돼도 되는 값만)
404.html
data/jobs.json, jobs.js    수집 결과(자동 생성, 직접 고치지 않음). jobs.js = file://로 열어도 읽히는 사본
data/jobs-local.json       맥 보충 수집 결과(해외 차단 출처). GitHub 수집이 합침
scraper/
  fetch-jobs.mjs           수집·병합·본문 읽기·재분류·저장(옵션 아래)
  lib.mjs                  Http(robots·3초 간격·식별 UA·차단 감지·인코딩 자동), 지역·교회명·직책·사례비
  sources/                 출처 정의 — _board.mjs(공통 틀), seminaries.mjs(신학교 15), denominations.mjs(총회·언론·포털 9),
                           chongshin.mjs, mtu.mjs, godpeople.mjs, puts.mjs(꺼짐)
  link-only.json           수집하지 않고 링크만 거는 게시판 13곳
  certs/extra-ca.pem       중간 인증서를 빠뜨린 서버용 공개 인증서(자동 적용)
  fixtures/ + test-parsers.mjs   개인정보를 지운 표본 + 점검 15개
supabase/schema.sql        DB·열 단위 권한·RLS·트리거·RPC(SQL Editor에 통째로 Run, 여러 번 실행 안전)
supabase/test/             PGlite로 schema.sql 점검(16개)
scripts/mac-fetch-jobs.sh  맥 보충 수집 → data/jobs-local.json 커밋·푸시
                           (launchd는 이 맥의 별도 사본 ~/Developer/dongyeok-collector에서 실행 — ~/Downloads는 macOS 폴더 보호로 예약 작업이 못 읽음)
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
  - 나머지: 새 공고 본문을 한 번만 읽습니다. 1회 최대 150건, 출처당 20건, 45일 이내 공고만 읽습니다. 한국기독공보·기독일보는 제외합니다.
- **직책**: 제목 + 부서 + 태그로 분류합니다. 제목으로 모르면 본문 앞부분에서 교역자 직책만 보충합니다(`posHint`).
- **맥 보충 수집**
  - 명령: `--only=auto --out=local`
  - 대상: 직전 GitHub 수집에서 실패했거나 맥으로 채운 출처 + 늘 막히는 3곳
  - 결과를 `data/jobs-local.json`에 쓰고, GitHub 수집이 실패한 출처만 이 파일(3일 이내)로 채웁니다.
  - 두 쪽이 쓰는 파일이 달라서 충돌하지 않습니다. 커밋 전에 `git pull --rebase`를 합니다.

### Supabase 설계(연결 전이지만 점검 완료)
- `author_id`는 열 단위 권한으로 API에서 아무도 읽을 수 없습니다(관리자 포함). 익명 이름은 서버 트리거가 정합니다.
- 교회 평가는 `pending`으로 들어가고 운영자가 공개합니다. 서로 다른 신고가 3건 쌓이면 자동으로 가립니다. 도배는 1분에 5건까지입니다.
- 내 글 목록은 `my_items()`, 운영 화면은 `moderation_queue()`·`moderate()`가 맡고, 처리 기록은 `moderation_log`에 남습니다.
- 콘티는 `lyrics` 키가 있으면 DB가 거절합니다(가사 저작권).

## 자주 쓰는 명령
```bash
cd ~/Downloads/dongyeok
git pull --rebase origin main                          # 작업 전 항상(봇이 하루 3번 커밋함)
node scraper/test-parsers.mjs                          # 수집기 점검(네트워크 없음)
node scraper/fetch-jobs.mjs                            # 전체 수집(이 맥=한국 회선)
node scraper/fetch-jobs.mjs --only=mtu --dry           # 한 곳만, 저장 안 함
node scraper/fetch-jobs.mjs --offline                  # 요청 없이 분류 규칙만 다시 적용
node scraper/fetch-jobs.mjs --detail=0                 # 본문(사례비) 읽기 끄기
zsh ~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.sh   # 맥 보충 수집 + 커밋·푸시(launchd가 하루 3번 자동 실행)
launchctl print gui/$(id -u)/kr.dongyeok.fetch | grep -E 'state|last exit'   # 예약 작업 상태
cd supabase/test && npm test                           # DB 스키마 점검
gh run list -R hyotowork-create/dongyeok --limit 5     # 자동 수집·배포 결과
gh workflow run fetch-jobs.yml -R hyotowork-create/dongyeok   # 수동 수집(하루 1~2회 이내로)
```
사이트를 로컬에서 미리 보는 방법: 이 맥의 미리보기 서버는 `~/Downloads`를 읽지 못합니다(macOS 폴더 보호). 그래서 사이트 파일을 임시 폴더에 복사해서 띄웁니다. 자세한 방법은 `CLAUDE.local.md`에 있습니다.

## 유지보수 절차

### 정기 점검(주 1회 권장)
1. `gh run list`로 최근 실행이 성공했는지 봅니다. 실패하면 GitHub가 저장소 주인에게 메일을 보냅니다.
2. `data/jobs.json`의 `sources[]`에서 `status`가 ok가 아니거나 `note`에 "맥"이 있는 출처를 확인합니다.
3. 맥 보충 파일 `data/jobs-local.json`의 `updatedAt`이 3일 이내인지 봅니다. 오래됐다면 `~/Developer/dongyeok-collector/scripts/mac-fetch-jobs.log`와 `~/Library/Logs/dongyeok-fetch.log`를 확인합니다.
4. 사이트를 열어 오늘 날짜 공고가 있는지, 「직책별 사례비」 표가 정상인지 봅니다.
5. 공개 저장소는 60일 동안 활동이 없으면 예약 실행이 꺼집니다. 봇이 매번 커밋하므로 보통 유지되지만, 꺼졌다면 Actions 화면에서 Enable을 누릅니다.
6. Supabase를 연결한 뒤에는 운영 화면에서 검수 대기 평가와 신고된 글을 처리합니다(`docs/운영가이드.md` 7장).

### 수집이 깨졌을 때
`dongyeok-scraper` 스킬(`.claude/skills/dongyeok-scraper/SKILL.md`)을 따릅니다.
1. 원인부터 나눕니다. 맥에서는 되고 GitHub에서만 안 되면 해외 차단이고, 맥에서도 0건이면 사이트 개편입니다.
2. 선택자를 고칩니다.
3. 표본(fixtures)을 갱신합니다. 이때 개인정보를 지웁니다.
4. `test-parsers` → `--only=<id> --dry`로 확인합니다.

### 출처 추가
1. robots.txt의 `User-agent: *` 규칙과 이용약관을 확인합니다. 로그인이 필요한 곳은 넣지 않습니다.
2. `sources/seminaries.mjs` 또는 `denominations.mjs`에 `board({...})` 항목을 추가하고 점검을 붙입니다.
3. 수집이 금지된 곳은 `link-only.json`에 링크만 넣습니다.
4. `docs/운영가이드.md` 6-1 표를 고칩니다. 사이트 이용 안내의 출처 표는 자동으로 갱신됩니다.

### 분류 규칙(직책·사례비)을 고칠 때
`lib.mjs`의 `classifyPositions`·`parseSalary`를 고칩니다. `test-parsers.mjs`에 사례를 추가한 뒤 `--offline`으로 다시 분류하고 커밋합니다. 화면의 직책 목록은 `index.html`의 `POS_GROUPS`이며, `lib.mjs`의 `POSITION_GROUPS`와 같게 유지해야 합니다. 직책별 현실 범위는 `PAY_RANGE`에 있습니다.

### 디자인·문구를 고칠 때
`index.html` 맨 위 `:root` 토큰을 씁니다. 사진은 `photo-…` 아이디로 바꿉니다(목록은 운영가이드 2-3). 보안 정책(CSP 메타)에 없는 외부 주소를 추가하면 그 주소가 차단되므로 CSP도 함께 고칩니다.

## 절대 규칙
- **robots.txt가 막은 곳과 로그인이 필요한 곳은 수집하지 않습니다.** UA를 바꾸거나 프록시를 쓰거나 차단을 우회하지 않습니다. 기관의 서면 허락을 받으면 소스의 `permission`에 기록하고 켭니다.
- **본문 문장·연락처·작성자 이름·IP는 저장하지 않습니다.** 숫자(사례비)와 직책 힌트만 뽑고 버립니다. 표본도 개인정보를 지운 뒤 커밋합니다.
- **`config.js`에는 공개값만 넣습니다.** Supabase anon(publishable) 키는 넣어도 되고, service_role 키·비밀번호는 절대 넣지 않습니다. 저장소는 공개입니다.
- 교회 평가는 사전 검수를 유지합니다(명예훼손 위험: 형법 307조 1항은 사실을 적시해도 처벌될 수 있음). 권리침해 신고에는 임시조치(정보통신망법 44조의2)로 대응합니다.
- 콘티 나눔에는 가사를 넣지 않습니다(DB가 거절함). 자료실에는 권리가 있는 자료만 올리게 합니다.
- 수동 수집(`gh workflow run`, 로컬 전체 수집)은 하루 1~2회 이내로 합니다. 10/12에 여러 번 돌린 뒤 일부 사이트가 GitHub 서버를 막기 시작했습니다.
- 확인하지 않은 것을 "정상"이라고 보고하지 않습니다. 맥에서 된 것과 GitHub에서 된 것을 구분해서 보고합니다.

## 남은 일
| 일 | 담당 | 비고 |
|---|---|---|
| 총신대·목원대 GitHub 실패 원인 확인 | Claude | 다음 실행 로그의 오류 코드로 판단. 계속 막히면 서울 리전 Supabase Edge Function 이전 검토 |
| Supabase 프로젝트 생성(서울)·schema.sql 실행·URL·anon key 전달 | 운영자 | 그 뒤 `config.js`를 고치고 푸시, 관리자 SQL 실행(운영가이드 5-2) |
| 공개 이메일 → `config.js` `contactEmail` | 운영자 → Claude | |
| 세라핌 Releases에 설치 파일·LICENSE 올리기 | 운영자 | |
| 개인정보처리방침·약관 법률 검토 | 운영자 | |
| 수집 허락 요청 메일 발송 | 운영자 | `docs/수집허락요청문.md` |
| 스레드 연재 | 운영자 | `promo/스레드-출시문구.md`. 평가·대나무숲 글은 Supabase 연결 뒤에 올림 |
| 중간 인증서 교체 | Claude | 2027-11-02 전 |

## 작업 기록
| 날짜 | 내용 |
|---|---|
| 2026-10-07 | 사이트·수집기(총신·감신·갓피플)·Supabase 스키마·운영가이드 작성. 디자인 v2(교회 이미지·조명). 출처를 27곳으로 확대 |
| 2026-10-12 | GitHub 공개·Pages 배포(af70c77). CSP·의존성 알림 적용. 한국성서대 링크 추가. 해외 차단 출처 맥 보충 수집. 직책 세분화·사례비 분류·직책별 사례비 표(8c99bb4). 총신대 폴백, 맥 보충 자동 선택(65a0d10). 인수인계 문서(c563189). 맥 보충 수집 launchd 설치(05:45·11:45·17:45, 별도 사본 ~/Developer/dongyeok-collector) |
