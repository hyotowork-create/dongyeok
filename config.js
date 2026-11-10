/* ─────────────────────────────────────────────────────────────
   사이트 설정 — 이 파일만 고치면 이름·색·연결 서비스가 바뀝니다.
   다른 단체·모임 사이트로 재사용할 때도 여기서 시작하세요.
   ※ 여기에는 "공개돼도 되는 값"만 넣습니다.
     Supabase anon(publishable) 키는 공개용이라 괜찮지만,
     service_role 키·비밀번호는 절대 넣지 마세요.
   ───────────────────────────────────────────────────────────── */
window.SITE_CONFIG = {
  name: '동역',
  tagline: '부교역자를 위한 청빙 정보·교회 평가·예배 도구·익명 나눔 공간',
  url: 'https://hyotowork-create.github.io/dongyeok/',  // 공개 주소(도메인 연결 후 교체)
  contactEmail: 'seraphim7997@gmail.com',              // 운영자 연락처(신고·임시조치 접수). 비워 두면 안내만 표시

  // Supabase 연결값. 둘 다 비워 두면 "체험 모드"(이 브라우저에만 저장)로 동작합니다.
  supabaseUrl: 'https://xjmexzeyxkxqsgvwaupz.supabase.co',          // 서울(ap-northeast-2), 조직 dongyeok(Free)
  supabaseAnonKey: 'sb_publishable_1cyG9HPpcC4hqJZIv4wbuA_JpoS_UiQ',  // 공개용(publishable) 키 — 보안은 RLS가 지킴

  // 방문 통계(GoatCounter 코드). 비워 두면 통계 스크립트를 넣지 않습니다.
  goatcounter: 'dongyeok',                               // https://dongyeok.goatcounter.com (2026-10-12 연결, 쿠키 없음)

  // 예배 도구 목록 — 설치 파일은 GitHub Releases에 올리고 그 주소를 넣습니다(저장소에 직접 넣지 않음).
  tools: [
    {
      id: 'prayer',
      name: '동역 기도실',
      summary: '사역 사이에 잠시 머무는 곳 — 새벽빛 아래 기도하고, 말씀·설교·성경공부를 함께',
      features: ['기도 시간 정하기(5·10·20분·시간 없이), 새벽빛이 밝아지는 화면', '오늘의 말씀·사역자를 위한 기도 제목', '추천 설교(유튜브)', '성경공부 질문과 확인 퀴즈, 퀴즈앤 연동'],
      platforms: '웹 브라우저(설치 없음)',
      license: '무료 · 로그인 없음',
      open: 'prayer/'
    },
    {
      id: 'seraphim',
      name: 'Seraphim (세라핌)',
      summary: '예배 송출·가사 자막·성경 슬라이드·온라인 주보를 한 프로그램에서',
      features: ['가사 입력 → 절 단위 자동 분할 송출', '예배별 플레이리스트', '성경 슬라이드(개역한글 내장)', '배경 영상·전환 효과', '온라인 주보 발행 + QR', '찬양 PPT·텍스트·JSON 곡 가져오기', 'YouTube 라이브 송출·녹화'],
      platforms: 'Windows · macOS(Apple Silicon)',
      license: 'MIT 무료',
      download: 'https://github.com/hyotowork-create/Seraphim/releases/latest',   // 사이트에서는 내려받기 안내 창(운영체제별 파일·첫 실행 경고 대처)을 열고, 이 주소는 창을 못 열 때만 씀
      source: 'https://github.com/hyotowork-create/Seraphim'
    },
    {
      id: 'sermon',
      name: 'Sermon Insight',
      summary: '강단의 말이 본문에 뿌리내리고 있는지 비춰 보는 설교 분석 도구',
      features: ['설교 원고·유튜브 링크·녹음 파일 입력', '본문 해석·논리 구조·개인적 주장과 말씀의 구별', '정통 신앙고백과 합치하지 않는 내용·정치 선동·기복 신호를 실제 문장과 함께'],
      platforms: '웹 브라우저(설치 없음)',
      license: '무료 · 본인 Gemini 키 필요',
      dialog: 'sermon-dlg'
    },
    {
      id: 'shorts',
      name: 'Sermon Shorts (시험판)',
      summary: '설교 영상에서 좋은 대목을 골라 세로 쇼츠로 만드는 프로그램',
      features: ['설교 영상 파일 → AI가 30~60초 대목 3~5개와 위쪽 제목 추천', '자막 자동 생성 후 직접 고치기, 실제 모양 미리보기', '1080×1920 MP4 저장(교회 이름·마지막 안내 장면)', '업로드 문안(제목·설명·해시태그) 초안', '영상은 내 컴퓨터 밖으로 나가지 않음'],
      platforms: 'Windows 10·11 · macOS(Apple Silicon·Intel)',
      license: 'MIT 무료 · 본인 Gemini 키 필요',
      dialog: 'shorts-dlg',
      dialogLabel: '내려받기',
      source: 'https://github.com/hyotowork-create/SermonShorts'
    },
    {
      id: 'transcribe',
      name: 'Gemini 채보 (시험판)',
      summary: '음원·유튜브 링크를 넣으면 피아노·베이스·기타·드럼 악보와 코드를 뽑아 주는 반주 연습 도구',
      features: ['음악 파일·공개 유튜브 영상 입력(15분까지)', '피아노 롤·오선 악보·코드 리드시트·드럼 그리드', 'MIDI·MusicXML·PDF 받기, 쉬운 악보·계이름', '개인 연습용 — 가사는 화면에만, 받는 파일에는 넣지 않음'],
      platforms: '웹 브라우저(설치 없음) · 설치판 Mac/Windows(Node)',
      license: 'MIT 무료 · 본인 Gemini 키 필요',
      open: 'tools/transcribe/',
      source: 'https://github.com/hyotowork-create/gemini-transcriber'
    },
    {
      id: 'tunemate',
      name: '튠메이트 TuneMate (시험판)',
      summary: '예배당 소리를 재고 보정 EQ·하울링 억제를 제안하는 AI 음향 도우미',
      features: ['측정 마이크로 공간 응답 측정 → 보정 EQ 계산', '하울링 주파수 찾기·노치 제안', 'AI 대화형 진단(Claude·ChatGPT·Gemini 중 본인 키)', '기본은 제안 모드 — 사람이 「적용」을 눌러야 믹서가 바뀜', '실제 믹서 시험 전: 리허설에서 먼저 확인'],
      platforms: 'macOS (iPhone·iPad는 준비 중)',
      license: 'MIT 무료',
      download: 'https://github.com/hyotowork-create/TuneMate/releases/latest',
      source: 'https://github.com/hyotowork-create/TuneMate'
    }
  ],

  // 자료실 업로드 한도(MB). Supabase 버킷 한도(supabase/schema.sql의 file_size_limit)와 맞춰 둡니다.
  // ※ 평가 사전 검수·신고 자동 가림(3건) 같은 규칙은 schema.sql에서 서버가 강제합니다.
  maxUploadMB: 10
};
