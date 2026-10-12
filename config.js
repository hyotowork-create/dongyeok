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
  goatcounter: '',

  // 예배 도구 목록 — 설치 파일은 GitHub Releases에 올리고 그 주소를 넣습니다(저장소에 직접 넣지 않음).
  tools: [
    {
      id: 'seraphim',
      name: 'Seraphim (세라핌)',
      summary: '예배 송출·가사 자막·성경 슬라이드·온라인 주보를 한 프로그램에서',
      features: ['가사 입력 → 절 단위 자동 분할 송출', '예배별 플레이리스트', '성경 슬라이드(개역한글 내장)', '배경 영상·전환 효과', '온라인 주보 발행 + QR', '찬양 PPT·텍스트·JSON 곡 가져오기'],
      platforms: 'Windows · macOS(Apple Silicon)',
      license: 'MIT 무료',
      download: 'https://github.com/hyotowork-create/Seraphim/releases',
      source: 'https://github.com/hyotowork-create/Seraphim'
    }
  ],

  // 자료실 업로드 한도(MB). Supabase 버킷 한도(supabase/schema.sql의 file_size_limit)와 맞춰 둡니다.
  // ※ 평가 사전 검수·신고 자동 가림(3건) 같은 규칙은 schema.sql에서 서버가 강제합니다.
  maxUploadMB: 10
};
