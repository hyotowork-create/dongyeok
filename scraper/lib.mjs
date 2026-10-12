// 수집기 공통 도구 — 예의 바른 요청(robots.txt·간격·식별 가능한 UA), 인코딩, 정규화
export const BOT_TOKEN = 'dongyeok-jobs-bot';
export const UA = `${BOT_TOKEN}/1.0 (+https://hyotowork-create.github.io/dongyeok/#pg-guide)`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class BlockedError extends Error { constructor(msg) { super(msg); this.name = 'BlockedError'; } }
export class RobotsError extends Error { constructor(msg) { super(msg); this.name = 'RobotsError'; } }

/* ── robots.txt ── */
export function parseRobots(text) {
  const groups = []; let cur = null; let lastWasUA = false;
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasUA = true; continue;
    }
    lastWasUA = false;
    if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
  }
  return groups;
}
function ruleMatches(rule, path) {
  const re = '^' + rule.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$');
  return new RegExp(re).test(path);
}
export function robotsAllows(groups, pathWithQuery, token = BOT_TOKEN) {
  let g = groups.filter(x => x.agents.some(a => a !== '*' && token.toLowerCase().includes(a)));
  if (!g.length) g = groups.filter(x => x.agents.includes('*'));
  let best = null;
  for (const r of g.flatMap(x => x.rules)) {
    if (r.path === '') continue;                       // "Disallow:" (빈 값) = 막는 것 없음
    if (!ruleMatches(r.path, pathWithQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/* ── HTTP ── */
export class Http {
  constructor({ delayMs = 3000, timeoutMs = 20000, log = console.log } = {}) {
    this.delayMs = delayMs; this.timeoutMs = timeoutMs; this.log = log;
    this.lastAt = new Map(); this.robots = new Map(); this.count = 0;
  }
  async throttle(host) {
    const wait = (this.lastAt.get(host) || 0) + this.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastAt.set(host, Date.now());
  }
  async fetchRaw(url, { method = 'GET', body, headers = {} } = {}) {
    const u = new URL(url);
    await this.throttle(u.host);
    this.count++;
    return fetch(url, { method, body, headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(this.timeoutMs) });
  }
  /** RFC 9309 기준: 4xx = 규칙 없음(허용), 5xx·연결 실패 = 전부 금지, 내용이 robots 형식이 아니면 규칙 없음으로 보고 기록만 남김 */
  async robotsFor(origin) {
    if (this.robots.has(origin)) return this.robots.get(origin);
    let info;
    try {
      const res = await this.fetchRaw(origin + '/robots.txt');
      if (res.status >= 500) info = { status: 'unreachable', groups: null };
      else if (res.status >= 400) info = { status: 'none', groups: [] };
      else {
        const text = await res.text();
        if (/<html|<body|<br|차단/i.test(text) && !/user-agent\s*:/i.test(text)) info = { status: 'unreadable', groups: [], sample: text.replace(/\s+/g, ' ').slice(0, 80) };
        else info = { status: 'ok', groups: parseRobots(text) };
      }
    } catch (e) { info = { status: 'unreachable', groups: null, error: e.message }; }
    this.robots.set(origin, info);
    return info;
  }
  async checkRobots(url, source) {
    if (source.permission) return { status: 'permission' };   // 운영 기관의 허락을 받은 경우(허락 내용을 소스 파일에 기록)
    const u = new URL(url);
    const info = await this.robotsFor(u.origin);
    if (info.status === 'unreachable') throw new RobotsError(`robots.txt에 접근할 수 없어 수집하지 않음 (${u.host})`);
    if (!robotsAllows(info.groups, u.pathname + u.search)) throw new RobotsError(`robots.txt가 수집을 금지함: ${u.pathname}`);
    return info;
  }
  /** 텍스트로 받기. encoding: 'utf-8' | 'euc-kr' */
  async request(url, { source, method = 'GET', body, headers, encoding = 'utf-8' } = {}) {
    await this.checkRobots(url, source);
    const res = await this.fetchRaw(url, { method, body, headers });
    if (res.status === 403 || res.status === 429) throw new BlockedError(`HTTP ${res.status} — 사이트가 요청을 거절함`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = new TextDecoder(encoding).decode(await res.arrayBuffer());
    if (/웹 보안 정책에 위배되어 차단|비정상적인 접근|captcha/i.test(text.slice(0, 2000))) throw new BlockedError('사이트 보안 장치가 요청을 막음');
    return text;
  }
}

/* ── 정규화 ── */
export const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '해외'];
const LONG = [
  [/^서울/, '서울'], [/^경기/, '경기'], [/^인천/, '인천'], [/^부산/, '부산'], [/^대구/, '대구'], [/^광주/, '광주'], [/^대전/, '대전'], [/^울산/, '울산'], [/^세종/, '세종'],
  [/^강원/, '강원'], [/^(충북|충청북)/, '충북'], [/^(충남|충청남)/, '충남'], [/^(전북|전라북)/, '전북'], [/^(전남|전라남)/, '전남'],
  [/^(경북|경상북)/, '경북'], [/^(경남|경상남)/, '경남'], [/^제주/, '제주'], [/^(해외|미국|캐나다|일본|호주|중국|독일|영국|뉴질랜드)/, '해외']
];
// 행정통합 명칭(예: 전남광주통합특별시) — 다음 칸이 '구'면 광역시, 아니면 도
const MERGED = [[/^전남광주/, '광주', '전남'], [/^대구경북/, '대구', '경북'], [/^대전충남/, '대전', '충남'], [/^부산경남/, '부산', '경남'], [/^광주전남/, '광주', '전남']];
const CITY = {
  경기: '수원 성남 분당 용인 고양 일산 부천 안양 군포 의왕 과천 광명 시흥 안산 화성 동탄 평택 오산 의정부 남양주 구리 하남 이천 여주 양평 가평 파주 김포 양주 동두천 포천 연천 안성 판교 산본 위례',
  강원: '춘천 원주 강릉 속초 동해 삼척 태백 홍천 횡성',
  충북: '청주 충주 제천 음성 진천',
  충남: '천안 아산 공주 논산 서산 당진 보령 계룡 홍성',
  전북: '전주 익산 군산 정읍 남원 김제',
  전남: '목포 여수 순천 광양 나주',
  경북: '포항 경주 구미 안동 김천 영주 상주 경산',
  경남: '창원 마산 진해 김해 양산 진주 거제 통영 사천 밀양',
  제주: '서귀포'
};
const CITY_RE = Object.entries(CITY).map(([prov, list]) => [new RegExp(`(^|[\\s\\[\\(/·,])(${list.split(' ').join('|')})`), prov]);

export function normRegion(text) {
  const t = String(text || '').replace(/^[\s\[\(]+/, '').trim();
  if (!t) return null;
  for (const [re, city, prov] of MERGED) if (re.test(t)) { const second = t.split(/\s+/)[1] || ''; return /구$/.test(second) ? city : prov; }
  for (const [re, r] of LONG) if (re.test(t)) return r;
  if (/^서울남|^중부|^동부/.test(t)) return /^서울/.test(t) ? '서울' : null;   // 감리교 연회 이름
  for (const [re, prov] of CITY_RE) if (re.test(' ' + t)) return prov;
  return null;
}
/** "경기 군포시 부곡동" → "경기 군포시" */
export function areaOf(location) {
  const p = String(location || '').trim().split(/\s+/);
  if (!p[0]) return null;
  const r = normRegion(location);
  return [r || p[0], p[1]].filter(Boolean).join(' ').slice(0, 30) || null;
}
/** 제목 맨 앞 [지역/지방] 또는 (지역) 표기에서 지역 */
export function regionFromTitle(title) {
  const m = String(title || '').match(/^\s*[\[\(]([^\]\)]{1,30})[\]\)]/);
  if (m) {
    const parts = m[1].split(/[\/·,]/).map(s => s.replace(/(연회|지방|지역)\s*$/, '').trim());
    for (const p of parts) { const r = normRegion(p); if (r) return r; }
    // "[중부 연회/새인천 지방]"처럼 지역명이 단어 안에 들어 있는 경우
    const inside = REGIONS.find(r => r !== '해외' && m[1].includes(r));
    if (inside) return inside;
  }
  return normRegion(title);
}
const BUMP = /[\[\(]\s*(끌어\s*올림|끌올|재공고|재게시|수정|up)\s*[\]\)]|끌어\s*올림|끌올|재공고/gi;
export function cleanTitle(t) {
  return String(t || '').replace(/\s+/g, ' ').replace(/^\s*[\[\(]\s*(끌어\s*올림|끌올)\s*[\]\)]\s*/i, '').replace(/^\s*(끌어\s*올림|끌올)\s*/i, '').trim().slice(0, 160);
}
export function titleKey(t) { return cleanTitle(t).replace(BUMP, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase(); }
const NOT_CHURCH = /^(본|우리|저희|지역|개척|한국|섬기는|건강한|작은|모든|이)교회$/;
// 교회·공동체 이름으로 보이는 것만 받는다(작성자 칸에 개인 이름이 들어오는 게시판이 있음 — 개인정보 보호)
const CHURCH_LIKE = /(교회|공동체|채플|예배당|선교회|church)$/i;
export function cleanChurch(name) {
  const n = String(name || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
  if (n.length < 2 || n.length > 30 || NOT_CHURCH.test(n) || !CHURCH_LIKE.test(n)) return null;
  return n;
}
export function extractChurch(title) {
  const re = /([가-힣A-Za-z0-9]{1,20}교회)/g; let m;
  const t = String(title || '').replace(/[\[\(][^\]\)]*[\]\)]/g, ' ');
  while ((m = re.exec(t))) { const c = cleanChurch(m[1]); if (c) return c; }
  // "[여의도순복음교회 찬양특별교구] 교육전도사 모집"처럼 괄호 안에만 교회명이 있는 경우
  const raw = /([가-힣A-Za-z0-9]{1,20}교회)/g;
  while ((m = raw.exec(String(title || '')))) { const c = cleanChurch(m[1]); if (c) return c; }
  return null;
}
export const churchKey = n => String(n || '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
const POS_RULES = [
  ['담임목사', /담임\s*(목사|목회자|청빙)/],
  ['부목사', /부목사|부\s*교역자|교구\s*목사|전임\s*목사|협동\s*목사/],
  ['교육목사', /교육\s*목사/],
  ['강도사', /강도사/],
  ['전임전도사', /전임\s*전도사|풀타임\s*전도사|준전임|전임\s*사역자/],
  ['교육전도사', /교육\s*전도사|파트\s*(타임|사역자|전도사|교역자)?|교육부서|교회학교|영아부|유치부|유년부|유초등부|초등부|아동부|소년부|중고등부|청소년부/],
  ['심방전도사', /심방|여\s*전도사|여\s*교역자/],
  ['찬양·예배', /찬양|예배\s*인도|워십/],
  ['반주자', /반주|오르간|피아노/],
  ['간사', /간사/]
];
export function extractPositions(text) {
  const t = String(text || '');
  const out = POS_RULES.filter(([, re]) => re.test(t)).map(([l]) => l);
  if (!out.length && /전도사/.test(t)) out.push('전도사');
  if (!out.length && /목사/.test(t)) out.push('목사');
  return out;
}
export function fnv(s) { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return (h >>> 0).toString(36); }
export function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
/** 여러 날짜 표기 → YYYY-MM-DD (모르면 오늘) */
export function parseDate(s, today = kstToday()) {
  const t = String(s || '').trim();
  let m;
  if ((m = t.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/))) return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{1,2})[-./](\d{1,2})$/))) {
    const y = Number(today.slice(0, 4)); let d = `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (d > today) d = `${y - 1}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return d;
  }
  return today;   // "15:05"처럼 시각만 있으면 오늘
}
