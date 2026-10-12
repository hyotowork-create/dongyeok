#!/usr/bin/env node
// 청빙 공고 수집기 — 공개 게시판에서 제목·날짜·링크(와 교회명·지역·직책)만 모아 data/jobs.json, data/jobs.js를 만든다.
//
//   node scraper/fetch-jobs.mjs              전체 수집
//   node scraper/fetch-jobs.mjs --only=mtu   한 곳만
//   node scraper/fetch-jobs.mjs --dry        파일을 쓰지 않고 결과만 출력
//
// 원칙: robots.txt 준수 · 같은 사이트에 3초 간격 · 하루 1~2회 · 식별 가능한 User-Agent · 개인정보 필드는 받자마자 버림
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Http, BlockedError, RobotsError, cleanTitle, cleanChurch, extractChurch, churchKey, titleKey, normRegion, areaOf, regionFromTitle, extractPositions, parseDate, kstToday, fnv } from './lib.mjs';
import chongshin from './sources/chongshin.mjs';
import puts from './sources/puts.mjs';
import mtu from './sources/mtu.mjs';
import godpeople from './sources/godpeople.mjs';
import seminaries from './sources/seminaries.mjs';
import denominations from './sources/denominations.mjs';

const SOURCES = [chongshin, puts, mtu, godpeople, ...seminaries, ...denominations];
const KEEP_DAYS = 90;      // 이보다 오래된 공고는 목록에서 뺌
const MAX_ITEMS = 3000;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = join(ROOT, 'data', 'jobs.json');
const OUT_JS = join(ROOT, 'data', 'jobs.js');
// 해외(GitHub 서버) 접속을 막는 출처는 맥에서 따로 모아 이 파일에 둔다 → GitHub 수집 때 합쳐 넣음
const OUT_LOCAL = join(ROOT, 'data', 'jobs-local.json');
const LOCAL_MAX_AGE_DAYS = 3;
// 중간 인증서를 빠뜨린 사이트(certs/extra-ca.pem)를 위해, 보충 인증서를 켠 채로 자기 자신을 다시 실행
const EXTRA_CA = join(ROOT, 'scraper', 'certs', 'extra-ca.pem');
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(EXTRA_CA)) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: EXTRA_CA } });
  process.exit(r.status ?? 1);
}
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

const ONLY = args.only ? new Set(String(args.only).split(',').map(x => x.trim()).filter(Boolean)) : null;

function toItem(src, raw, today) {
  const title = cleanTitle(raw.title);
  if (!title) return null;
  const church = cleanChurch(raw.church) || extractChurch(title);
  const region = normRegion(raw.location) || normRegion(raw.regionText) || regionFromTitle(title);
  const key = (church ? churchKey(church) : '') + '|' + titleKey(title);
  const date = parseDate(raw.date, today);
  return {
    id: `${src.short}-${fnv(key)}`,
    dk: fnv(key),      // 출처가 달라도 같은 공고(교회+제목)면 같은 값 → 사이트에서 하나로 묶음
    source: src.id,
    title,
    church: church || null,
    region: region || null,
    area: raw.location ? areaOf(raw.location) : null,
    positions: extractPositions([title, raw.dept, ...(raw.tags || [])].filter(Boolean).join(' ')),
    denomination: raw.denomination ? String(raw.denomination).trim().slice(0, 30) : null,
    date,
    deadline: raw.deadline ? (/^\d/.test(raw.deadline) ? parseDate(raw.deadline, today) : String(raw.deadline).slice(0, 20)) : null,
    closed: !!raw.closed || /청빙\s*(이\s*)?(완료|마감)|마감되었|완료되었/.test(title),
    truncated: !!raw.truncated,
    url: raw.url
  };
}

async function main() {
  const today = kstToday();
  const http = new Http({ delayMs: 3000 });
  let prev = { items: [], sources: [] };
  try { prev = JSON.parse(await readFile(OUT_JSON, 'utf8')); } catch { /* 첫 실행 */ }

  const fresh = []; const statuses = [];
  for (const src of SOURCES) {
    if (ONLY && !ONLY.has(src.id)) { const old = (prev.sources || []).find(s => s.id === src.id); if (old) statuses.push(old); continue; }
    const st = { id: src.id, name: src.name, group: src.group || '신학교', home: src.home, checkedAt: new Date().toISOString() };
    if (!src.enabled) { Object.assign(st, { status: 'off', note: src.disabledReason || '꺼짐' }); statuses.push(st); console.log(`- ${src.name}: 꺼짐 (${st.note})`); continue; }
    try {
      const raws = await src.collect({ http, today });
      const items = raws.map(r => toItem(src, r, today)).filter(x => x && /^https?:\/\//.test(x.url));
      fresh.push(...items);
      Object.assign(st, { status: 'ok', count: items.length });
      const robots = http.robots.get(new URL(src.home).origin);
      if (robots && robots.status === 'unreadable') st.note = 'robots.txt 내용 확인 불가(규칙 없음으로 처리) — 기관에 허락 받기 권장';
      if (src.permission) st.note = '허락: ' + src.permission;
      console.log(`✓ ${src.name}: ${items.length}건`);
    } catch (e) {
      const kind = e instanceof RobotsError ? 'robots' : e instanceof BlockedError ? 'blocked' : 'error';
      Object.assign(st, { status: kind, note: e.message });
      console.log(`✗ ${src.name}: ${kind} — ${e.message}`);
    }
    statuses.push(st);
  }

  if (args.out === 'local') {
    const ok = statuses.filter(s => s.status === 'ok' && (!ONLY || ONLY.has(s.id)));
    const okIds = new Set(ok.map(s => s.id));
    const local = { updatedAt: new Date().toISOString(), sources: ok.map(({ checkedAt, ...s }) => ({ ...s, note: '맥에서 보충 수집' })), items: fresh.filter(it => okIds.has(it.source)) };
    console.log(`맥 보충 수집: ${local.items.length}건 (${ok.map(s => s.name).join(', ') || '없음'})`);
    if (!args.dry) { await mkdir(dirname(OUT_LOCAL), { recursive: true }); await writeFile(OUT_LOCAL, JSON.stringify(local, null, 1) + '\n'); console.log('저장: data/jobs-local.json'); }
    return;
  }
  // GitHub에서 실패한 출처는 맥 보충 파일(3일 이내)의 공고로 채운다
  try {
    const local = JSON.parse(await readFile(OUT_LOCAL, 'utf8'));
    if (Date.now() - new Date(local.updatedAt) < LOCAL_MAX_AGE_DAYS * 86400e3) {
      for (const ls of local.sources || []) {
        const st = statuses.find(s => s.id === ls.id);
        if (!st || st.status === 'ok' || st.status === 'off') continue;
        const add = (local.items || []).filter(it => it.source === ls.id);
        fresh.push(...add);
        Object.assign(st, { status: 'ok', count: add.length, note: `맥에서 보충 수집(${local.updatedAt.slice(0, 10)}) — 해외 접속 차단` });
        console.log(`↺ ${st.name}: 맥 보충 파일에서 ${add.length}건`);
      }
    }
  } catch { /* 보충 파일 없음 */ }
  // 병합: 이번에 실패한 출처의 이전 공고는 그대로 두고, 같은 공고(교회+제목)는 최신 것으로 덮어씀
  const byId = new Map();
  for (const it of prev.items || []) byId.set(it.id, { ...it, dk: it.dk || it.id.slice(it.id.indexOf('-') + 1) });   // 예전 파일에는 dk가 없을 수 있음
  // 같은 출처의 같은 원문 주소·같은 제목인데 id가 다른 옛 기록(교회명 추출 규칙이 바뀐 경우 등)은 지운다
  const freshUrl = new Set(fresh.map(it => it.source + '|' + it.url));
  const freshTitle = new Set(fresh.map(it => it.source + '|' + titleKey(it.title)));
  const freshIds = new Set(fresh.map(it => it.id));
  for (const [id, it] of byId) {
    if (freshIds.has(id)) continue;
    if (freshUrl.has(it.source + '|' + it.url) || freshTitle.has(it.source + '|' + titleKey(it.title))) byId.delete(id);
  }
  const seenNow = new Set();
  for (const it of fresh) {
    const old = byId.get(it.id);
    if (seenNow.has(it.id)) { if (it.date > byId.get(it.id).date) byId.set(it.id, { ...it, firstSeen: byId.get(it.id).firstSeen }); continue; }
    seenNow.add(it.id);
    byId.set(it.id, { ...it, firstSeen: old ? old.firstSeen : new Date().toISOString(), date: old && old.date > it.date ? old.date : it.date });
  }
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
  const enabledIds = new Set(SOURCES.filter(s => s.enabled).map(s => s.id));
  const items = [...byId.values()]
    .filter(it => it.date >= cutoff && enabledIds.has(it.source))       // 꺼진 출처(허락 철회 등)의 공고는 즉시 제거
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.firstSeen).localeCompare(String(a.firstSeen)))
    .slice(0, MAX_ITEMS);

  let links = [];
  try { links = (JSON.parse(await readFile(join(ROOT, 'scraper', 'link-only.json'), 'utf8')).links || []).filter(l => /^https?:\/\//.test(l.url)); } catch { /* 없으면 생략 */ }
  const data = { updatedAt: new Date().toISOString(), sources: statuses.map(({ checkedAt, ...s }) => s), links, items };
  console.log(`합계 ${items.length}건 (이번 수집 ${fresh.length}건, 요청 ${http.count}회)`);
  if (args.dry) { console.log(JSON.stringify(items.slice(0, 5), null, 2)); return; }
  // 켜진 출처가 모두 실패하면 파일을 건드리지 않고 실패로 끝냄 → GitHub Actions가 저장소 주인에게 실패 메일을 보냄
  const tried = statuses.filter(s => s.status !== 'off' && (!ONLY || ONLY.has(s.id)));
  if (tried.length && tried.every(s => s.status !== 'ok')) { console.error('모든 출처 수집 실패 — 저장하지 않음'); process.exitCode = 1; return; }
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(data, null, 1) + '\n');
  // file://로 index.html을 바로 열어도 읽히도록 스크립트 형태로도 저장
  await writeFile(OUT_JS, '// 자동 생성 파일 — scraper/fetch-jobs.mjs가 덮어씁니다. 직접 고치지 마세요.\nwindow.JOBS_DATA = ' + JSON.stringify(data) + ';\n');
  console.log('저장: data/jobs.json, data/jobs.js');
}
main().catch(e => { console.error(e); process.exit(1); });
