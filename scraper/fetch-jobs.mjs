#!/usr/bin/env node
// 청빙 공고 수집기 — 공개 게시판에서 제목·날짜·링크(와 교회명·지역·직책)만 모아 data/jobs.json, data/jobs.js를 만든다.
//
//   node scraper/fetch-jobs.mjs              전체 수집
//   node scraper/fetch-jobs.mjs --only=mtu   한 곳만
//   node scraper/fetch-jobs.mjs --dry        파일을 쓰지 않고 결과만 출력
//
// 원칙: robots.txt 준수 · 같은 사이트에 3초 간격 · 하루 1~2회 · 식별 가능한 User-Agent · 개인정보 필드는 받자마자 버림
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { Http, KrRelay, BlockedError, RobotsError, isNotJob, CLERGY, classifyPositions, parseSalary, cleanTitle, cleanChurch, extractChurch, churchKey, titleKey, normRegion, areaOf, regionFromTitle, extractPositions, parseDate, kstToday, fnv } from './lib.mjs';
import chongshin from './sources/chongshin.mjs';
import puts from './sources/puts.mjs';
import mtu from './sources/mtu.mjs';
import godpeople from './sources/godpeople.mjs';
import seminaries from './sources/seminaries.mjs';
import denominations from './sources/denominations.mjs';

const SOURCES = [chongshin, puts, mtu, godpeople, ...seminaries, ...denominations];
const KEEP_DAYS = 90;      // 이보다 오래된 공고는 목록에서 뺌
const MAX_ITEMS = 6000;   // 10/27 3,000건에 닿아 44일치만 남던 것을 90일 유지로(운영자 결정)

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
// 모르는 옵션은 무시하지 않고 멈춘다 — 무시하면 전체 수집이 돌아 버림(10/13 `--help`로 전체 수집이 시작된 일)
const unknown = Object.keys(args).filter(k => !['only', 'dry', 'detail', 'offline', 'out'].includes(k));
if (unknown.length) { console.error(`모르는 옵션: ${unknown.join(', ')} — 쓸 수 있는 것: --only=id,id|auto --dry --detail=N --offline --out=local`); process.exit(2); }

// --only=auto: 직전 GitHub 수집에서 실패했거나 맥 보충으로 채운 출처 + 서울 중계로도 안 되는 출처
// (대신대·기독정보넷·총신대·목원대는 2026-10-12부터 GitHub가 서울 중계로 직접 모음. 중계가 실패하면 위 조건으로 다시 맥이 맡음)
const ALWAYS_LOCAL = ['kwangshin'];   // 광신대: 학교 서버의 옛 TLS 방식을 서울 함수(Deno)가 지원하지 않음 → 맥만 가능
function resolveOnly() {
  if (!args.only) return null;
  if (args.only !== 'auto') return new Set(String(args.only).split(',').map(x => x.trim()).filter(Boolean));
  let prevSrc = []; try { prevSrc = JSON.parse(readFileSync(OUT_JSON, 'utf8')).sources || []; } catch { }
  return new Set([...ALWAYS_LOCAL, ...prevSrc.filter(s => s.status !== 'off' && (s.status !== 'ok' || /맥/.test(s.note || ''))).map(s => s.id)]);
}
const ONLY = resolveOnly();

// 새 공고의 본문을 한 번만 읽어 사례비 숫자만 뽑는다(본문·연락처는 저장하지 않음). 1회 실행 상한을 둔다.
// 본문 앞부분(모집 부서·자격)에서 직책 힌트 — 담임목사는 본문 언급만으로 붙이지 않음(교회 소개에 자주 나옴)
const bodyHint = text => { const t = String(text || ''); const i = Math.max(0, t.search(/모집|청빙|초빙|부서|자격|사역\s*내용/)); return classifyPositions(t.slice(i, i + 1200)).filter(p => CLERGY.includes(p)).slice(0, 4); };   // 본문에서는 교역자 직책만(반주·방송 등은 제목·부서에서만)
const DETAIL_MAX = args.detail != null ? Number(args.detail) : 150, DETAIL_PER_SOURCE = 20, DETAIL_DAYS = 45;
async function fillPay(http, items, okSources) {
  const bySrc = new Map(SOURCES.map(s => [s.id, s]));
  const since = new Date(Date.now() - DETAIL_DAYS * 86400e3).toISOString().slice(0, 10);
  const queues = new Map();
  for (const it of [...items].sort((a, b) => b.date.localeCompare(a.date))) {
    const src = bySrc.get(it.source);
    const unknownPos = !(it.positions || []).length || ((it.positions || []).length === 1 && it.positions[0] === '교역자(직책 미상)');
    const needHint = it.payChecked && unknownPos && it.posHint === undefined;   // 본문은 읽었지만 직책 힌트를 아직 안 뽑은 공고(한 번만)
    if ((it.payChecked && !needHint) || !src || src.noDetail || !okSources.has(src.id) || it.date < since || !/^https?:/.test(it.url)) continue;
    if (!queues.has(src.id)) queues.set(src.id, []);
    if (queues.get(src.id).length < DETAIL_PER_SOURCE) queues.get(src.id).push(it);
  }
  let done = 0, found = 0; const fails = new Map();
  while (done < DETAIL_MAX && [...queues.values()].some(q => q.length)) {
    for (const [sid, q] of queues) {                    // 출처를 돌아가며 하나씩(같은 사이트 연속 요청 줄이기)
      if (!q.length || done >= DETAIL_MAX) continue;
      if ((fails.get(sid) || 0) >= 3) { q.length = 0; continue; }
      const it = q.shift();
      try {
        const html = await http.request(it.url, { source: bySrc.get(sid), encoding: 'auto' });
        const $ = cheerio.load(html); $('script, style, noscript, header, footer, nav').remove();
        const text = ($('body').text() || $.root().text()).replace(/\s+/g, ' ');
        it.pay = parseSalary(text); it.payChecked = true; done++;
        it.posHint = bodyHint(text);
        if (it.pay && it.pay.min) found++;
      } catch (e) { fails.set(sid, (fails.get(sid) || 0) + 1); if (e instanceof RobotsError || e instanceof BlockedError) fails.set(sid, 9); }
    }
  }
  if (done) console.log(`사례비: 본문 ${done}건 확인, 금액 ${found}건`);
}

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
    positions: classifyPositions(title, raw.dept, (raw.tags || []).join(' ')),
    dept: raw.dept ? String(raw.dept).replace(/\s+/g, ' ').trim().slice(0, 40) : null,
    tags: (raw.tags || []).map(x => String(x).trim().slice(0, 12)).filter(Boolean).slice(0, 6),
    pay: raw.pay || null,
    payChecked: !!raw.payChecked,
    posHint: raw.posHint && raw.posHint.length ? raw.posHint : undefined,
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
  // 해외 접속을 막는 출처(viaKR)는 GitHub Actions에서 서울 중계 함수를 거침. 맥·로컬에서는 relay가 null(직접 접속)
  const http = new Http({ delayMs: 3000, relay: args.out === 'local' ? null : KrRelay.fromEnv(new Set(SOURCES.filter(s => s.viaKR).map(s => new URL(s.home).host))) });
  if (http.relay) console.log(`서울 중계 사용: ${[...http.relay.hosts].join(', ')}`);
  let prev = { items: [], sources: [] };
  try { prev = JSON.parse(await readFile(OUT_JSON, 'utf8')); } catch { /* 첫 실행 */ }

  const fresh = []; const statuses = [];
  for (const src of SOURCES) {
    if (args.offline || (ONLY && !ONLY.has(src.id))) { const old = (prev.sources || []).find(s => s.id === src.id); if (old) statuses.push(old); continue; }
    const st = { id: src.id, name: src.name, group: src.group || '신학교', home: src.home, checkedAt: new Date().toISOString() };
    if (!src.enabled) { Object.assign(st, { status: 'off', note: src.disabledReason || '꺼짐' }); statuses.push(st); console.log(`- ${src.name}: 꺼짐 (${st.note})`); continue; }
    try {
      const raws = await src.collect({ http, today });
      const items = raws.map(r => toItem(src, r, today)).filter(x => x && /^https?:\/\//.test(x.url) && !isNotJob(x.title, src.id));   // 청빙 아닌 글은 처음부터 받지 않음(본문도 안 읽음)
      fresh.push(...items);
      Object.assign(st, { status: 'ok', count: items.length });
      const robots = http.robots.get(new URL(src.home).origin);
      if (robots && robots.status === 'unreadable') st.note = 'robots.txt 내용 확인 불가(규칙 없음으로 처리) — 기관에 허락 받기 권장';
      if (src.permission) st.note = '허락: ' + src.permission;
      if (src.viaKR && http.relay) st.note = '서울 중계 서버 경유(해외 접속 차단 출처)';
      console.log(`✓ ${src.name}: ${items.length}건`);
    } catch (e) {
      const kind = e instanceof RobotsError ? 'robots' : e instanceof BlockedError ? 'blocked' : 'error';
      const why = e.message + (e.cause && (e.cause.code || e.cause.message) ? ` (${e.cause.code || e.cause.message})` : '');
      Object.assign(st, { status: kind, note: why });
      console.log(`✗ ${src.name}: ${kind} — ${why}`);
    }
    statuses.push(st);
  }

  if (args.out === 'local') {
    const ok = statuses.filter(s => s.status === 'ok' && (!ONLY || ONLY.has(s.id)));
    const okIds = new Set(ok.map(s => s.id));
    let prevLocal = []; try { prevLocal = JSON.parse(await readFile(OUT_LOCAL, 'utf8')).items || []; } catch { }
    const localItems = fresh.filter(it => okIds.has(it.source)).map(it => { const o = prevLocal.find(x => x.id === it.id); return !it.payChecked && o && o.payChecked ? { ...it, pay: o.pay, payChecked: true } : it; });
    await fillPay(http, localItems, okIds);
    const local = { updatedAt: new Date().toISOString(), sources: ok.map(({ checkedAt, ...s }) => ({ ...s, note: '맥에서 보충 수집' })), items: localItems };
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
    const keepPay = !it.payChecked && old && old.payChecked ? { pay: old.pay, payChecked: true, posHint: old.posHint } : {};   // 본문에서 읽어 둔 사례비는 유지
    byId.set(it.id, { ...it, ...keepPay, firstSeen: old ? old.firstSeen : new Date().toISOString(), date: old && old.date > it.date ? old.date : it.date });
  }
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
  const enabledIds = new Set(SOURCES.filter(s => s.enabled).map(s => s.id));
  const items = [...byId.values()]
    .filter(it => it.date >= cutoff && enabledIds.has(it.source))       // 꺼진 출처(허락 철회 등)의 공고는 즉시 제거
    .filter(it => !isNotJob(it.title, it.source))                                 // 청빙 아닌 글(구걸·광고·행사 안내) 제거
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.firstSeen).localeCompare(String(a.firstSeen)))
    .slice(0, MAX_ITEMS);

  const okNow = new Set(statuses.filter(s => s.status === 'ok' && !/맥/.test(s.note || '')).map(s => s.id));
  if (DETAIL_MAX > 0 && !args.dry && !args.offline) await fillPay(http, items, okNow);
  for (const it of items) {   // 분류 규칙이 바뀌면 예전 공고도 다시 분류. 제목으로 모르면 본문 힌트 사용
    const p = classifyPositions(it.title, it.dept, (it.tags || []).join(' '));
    const hint = (it.posHint || []).filter(x => CLERGY.includes(x));
    it.positions = (!p.length || (p.length === 1 && p[0] === '교역자(직책 미상)')) && hint.length ? hint : p;
  }
  let links = [];
  try { links = (JSON.parse(await readFile(join(ROOT, 'scraper', 'link-only.json'), 'utf8')).links || []).filter(l => /^https?:\/\//.test(l.url)); } catch { /* 없으면 생략 */ }
  const data = { updatedAt: new Date().toISOString(), sources: statuses.map(({ checkedAt, ...s }) => s), links, items };
  console.log(`합계 ${items.length}건 (이번 수집 ${fresh.length}건, 요청 ${http.count}회${http.relay ? `, 그중 서울 중계 ${http.relayCount}회` : ''})`);
  if (args.dry) { console.log(JSON.stringify(items.slice(0, 5), null, 2)); return; }
  // 켜진 출처가 모두 실패하면 파일을 건드리지 않고 실패로 끝냄 → GitHub Actions가 저장소 주인에게 실패 메일을 보냄
  const tried = statuses.filter(s => s.status !== 'off' && (!ONLY || ONLY.has(s.id)));
  if (!args.offline && tried.length && tried.every(s => s.status !== 'ok')) { console.error('모든 출처 수집 실패 — 저장하지 않음'); process.exitCode = 1; return; }
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(data, null, 1) + '\n');
  // file://로 index.html을 바로 열어도 읽히도록 스크립트 형태로도 저장
  await writeFile(OUT_JS, '// 자동 생성 파일 — scraper/fetch-jobs.mjs가 덮어씁니다. 직접 고치지 마세요.\nwindow.JOBS_DATA = ' + JSON.stringify(data) + ';\n');
  console.log('저장: data/jobs.json, data/jobs.js');
}
main().catch(e => { console.error(e); process.exit(1); });
