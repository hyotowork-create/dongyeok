# 동역 · 부교역자 라운지

부교역자를 위한 커뮤니티 사이트입니다. 기능은 다섯 가지입니다.

- **청빙 공고**: 여러 공개 게시판의 청빙 공고를 모아 보여 줍니다. 공고마다 그 교회에서 사역했던 교역자들의 **교회 평가**를 함께 봅니다.
- **예배 도구**: 세라핌(Seraphim)을 내려받을 수 있습니다. 콘티를 만들어 나누고(가사는 공유하지 않음), 세라핌용 파일을 받고, 웹 가사 화면을 띄웁니다.
- **대나무숲**: 익명 게시판입니다. 익명 이름은 글마다 새로 정해집니다.
- **자료실**: 설교·신학·교육 자료를 나눕니다.

KSA 홈페이지와 같은 방식으로 만들었습니다. 빌드 없는 단일 `index.html` SPA를 GitHub Pages에 올리고, 글쓰기만 Supabase에 맡깁니다. 이용자는 로그인 없이 익명으로 쓰고, 개인정보는 받지 않습니다.

```
index.html                 사이트 전체(화면 21개)
config.js                  사이트 이름·Supabase 연결값·도구 목록 ← 여기만 고치면 됨
data/jobs.json, jobs.js    수집된 청빙 공고(자동 생성)
scraper/                   청빙 공고 수집기(Node 20)
supabase/schema.sql        DB·권한·트리거(SQL Editor에 붙여 넣기)
supabase/test/             schema.sql 자동 점검(PGlite)
supabase/functions/kr-relay/  서울 리전 중계 함수(해외 접속을 막는 출처용)
.github/workflows/         하루 3번 자동 수집
docs/운영가이드.md          설정·운영·법적 유의사항 전체 안내
CLAUDE.md                  인수인계·유지보수 안내(현재 상태·알려진 문제·절차)
```

## 바로 해 보기

`index.html`을 브라우저로 열면 **체험 모드**로 동작합니다. 글은 그 브라우저에만 저장되고, 운영(검수) 화면까지 써 볼 수 있습니다.

```bash
node scraper/fetch-jobs.mjs        # 청빙 공고 새로 수집 (처음 한 번 cd scraper && npm install)
node scraper/test-parsers.mjs      # 수집기 점검(네트워크 없이)
```

공개 주소: https://hyotowork-create.github.io/dongyeok/

실제 운영(모두가 글을 공유) 설정은 [docs/운영가이드.md](docs/운영가이드.md)의 5장을 따르세요.
