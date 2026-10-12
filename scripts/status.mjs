#!/usr/bin/env node
// 상태 점검 한 번에 — 맥·클라우드 세션 공용. 읽기만 한다(--health는 「상태 확인」 워크플로를 한 번 실행할 뿐 아무것도 바꾸지 않음).
//   node scripts/status.mjs            저장소 · 자동 수집(예약 포함) · 최근 수집 요약 · 공고 데이터 신선도 · 맥 보충 파일
//   node scripts/status.mjs --health   + 공개 사이트 · Supabase(인증·DB) · 서울 중계 응답(GitHub 서버에서 확인, 1~2분)
// 클라우드 세션은 Actions 로그를 내려받지 못하므로, 워크플로가 남긴 annotation(수집 결과·상태 확인)을 API로 읽는다.
// 맥 launchd 상태와 Supabase 이용 현황(SQL)은 여기서 보지 않는다 — CLAUDE.md 「상태 점검」 3·6번.
import { execFileSync } from 'node:child_process';

const R = 'hyotowork-create/dongyeok';
const HEALTH = process.argv.includes('--health');
const sh = (cmd, args, env) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, env: { ...process.env, ...env } }).replace(/\s+$/, '');
const gh = (...a) => JSON.parse(sh('gh', a) || 'null');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const problems = [];
const say = (ok, msg) => { if (ok === false) problems.push(msg); console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${msg}`); };
const kst = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5, 16).replace('-', '/');
const mins = iso => Math.round((Date.now() - new Date(iso)) / 60000);
const ago = iso => { const m = mins(iso); return m < 90 ? `${m}분 전` : m < 2880 ? `${Math.round(m / 6) / 10}시간 전` : `${Math.round(m / 144) / 10}일 전`; };
const annotations = jobId => gh('api', `repos/${R}/check-runs/${jobId}/annotations`) || [];
const runNotes = runId => (gh('api', `repos/${R}/actions/runs/${runId}/jobs`)?.jobs || []).flatMap(j => annotations(j.id));

// 1. 저장소
console.log('— 저장소');
try { sh('git', ['fetch', '-q', 'origin', 'main']); } catch { say(false, 'git fetch 실패 — 네트워크·권한 확인'); }
const dirty = sh('git', ['status', '--porcelain']);
say(!dirty, dirty ? `미커밋 변경 있음 — 내가 만든 것이 아니면 건드리지 말고 운영자에게 알림\n${dirty}` : '작업 폴더 깨끗함');
const behind = +sh('git', ['rev-list', '--count', 'HEAD..origin/main']);
if (behind) say(null, `origin/main보다 ${behind}커밋 뒤 — 고치기 전에 git pull --rebase origin main`);
console.log(sh('git', ['log', '--format=%h %ad %s', '--date=format-local:%m/%d %H:%M', '-5', 'origin/main'], { TZ: 'Asia/Seoul' }).replace(/^/gm, '  '));

// 2. 자동 수집
console.log('\n— 자동 수집(GitHub Actions)');
const wf = gh('api', `repos/${R}/actions/workflows`)?.workflows || [];
for (const w of wf) say(w.state === 'active', `워크플로 「${w.name}」 ${w.state}`);
const runs = gh('run', 'list', '-R', R, '--workflow', 'fetch-jobs.yml', '--limit', '30', '--json', 'event,status,conclusion,createdAt,databaseId') || [];
const sched = runs.filter(r => r.event === 'schedule');
if (!sched.length) say(false, '예약 실행이 최근 30회 안에 없음 — 예약이 안 도는지 조사(수동 실행으로 땜질하지 말 것)');
else say(mins(sched[0].createdAt) < 13 * 60, `마지막 예약 실행 ${kst(sched[0].createdAt)}(${ago(sched[0].createdAt)}) ${sched[0].conclusion || sched[0].status} · 최근 30회 중 예약 ${sched.length}회`);
const failed = runs.filter(r => r.conclusion && !['success', 'skipped', 'cancelled'].includes(r.conclusion));
if (failed.length) say(false, `실패한 실행 ${failed.length}회: ${failed.slice(0, 3).map(r => `${kst(r.createdAt)} ${r.event} #${r.databaseId}`).join(', ')}`);
// 예약은 30분마다 깨어나 대부분 「건너뜀」으로 끝나므로, 실제로 수집한 최근 실행을 찾아 요약을 보여 준다
let shown = 0;
for (const r of runs.filter(r => r.event !== 'push' && r.status === 'completed' && r.conclusion !== 'cancelled').slice(0, 12)) {
  const notes = runNotes(r.databaseId);
  const got = notes.find(a => /수집 결과/.test(a.title || ''));
  if (!shown) { const skip = notes.find(a => /건너뜀/.test(a.title || '')); if (skip) say(null, `${kst(r.createdAt)} ${r.event} 건너뜀: ${skip.message}`); }
  if (got) { say(null, `${kst(r.createdAt)} ${r.event} ${got.title}: ${got.message}`); shown = 1; break; }
  shown = 1;
}

// 3. 공고 데이터(저장소 main 기준 — 배포본과 같음)
console.log('\n— 공고 데이터');
const jobs = JSON.parse(sh('git', ['show', 'origin/main:data/jobs.json']));
const groups = new Set(jobs.items.map(i => i.dk)).size;
say(mins(jobs.updatedAt) < 13 * 60, `갱신 ${kst(jobs.updatedAt)}(${ago(jobs.updatedAt)}) · ${jobs.items.length.toLocaleString()}건(묶으면 ${groups.toLocaleString()}건)`);
// 수집 시간대(KST 06·12·18시 시작)마다 한 번 모아야 한다. 시간대가 시작되고 2시간이 지났는데 그 뒤 갱신이 없으면 예약이 계속 빠지는 것
const slotStart = (() => {
  const k = new Date(Date.now() + 9 * 3600e3), h = k.getUTCHours();
  const base = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600e3;
  return h >= 18 ? base + 18 * 3600e3 : h >= 12 ? base + 12 * 3600e3 : h >= 6 ? base + 6 * 3600e3 : base - 6 * 3600e3;
})();
const slotName = `${kst(new Date(slotStart).toISOString())}~`;
if (new Date(jobs.updatedAt) >= slotStart) say(true, `이번 수집 시간대(${slotName}) 수집됨`);
else if (Date.now() - slotStart > 2 * 3600e3) say(false, `이번 수집 시간대(${slotName})가 시작되고 2시간이 지났는데 아직 수집 안 됨 — 예약이 빠지는 중. 원인 조사(수동 실행으로 땜질하지 말 것)`);
else say(null, `이번 수집 시간대(${slotName}) 수집 대기 중 — 예약이 매시 17·47분에 깨어남`);
for (const s of jobs.sources) {
  if (s.status === 'off') continue;
  if (s.status !== 'ok') say(false, `출처 ${s.name}(${s.id}) ${s.status} — ${s.note || ''}`);
}
const relay = jobs.sources.filter(s => /서울 중계/.test(s.note || ''));
say(relay.every(s => s.status === 'ok'), `서울 중계 출처: ${relay.map(s => `${s.name} ${s.status} ${s.count ?? 0}건`).join(', ') || '없음'}`);
const off = jobs.sources.filter(s => s.status === 'off');
if (off.length) say(null, `꺼진 출처: ${off.map(s => s.name).join(', ')}`);
try {
  const local = JSON.parse(sh('git', ['show', 'origin/main:data/jobs-local.json']));
  const d = mins(local.updatedAt) / 1440;
  say(d < 3 ? (d < 2 ? true : null) : false, `맥 보충 파일 ${kst(local.updatedAt)}(${ago(local.updatedAt)})${d >= 3 ? ' — 3일 넘어 합쳐지지 않음, 맥 확인' : d >= 2 ? ' — 곧 3일, 맥이 꺼져 있는지 확인' : ''}`);
} catch { say(null, '맥 보충 파일 없음'); }

// 4. 응답 확인(선택)
if (HEALTH) {
  console.log('\n— 응답 확인(GitHub 서버에서, 「상태 확인」 워크플로)');
  const since = Date.now() - 30_000;
  // gh workflow run은 GraphQL을 써서 클라우드 세션에서 막히므로 REST로 실행한다
  try { sh('gh', ['api', '-X', 'POST', `repos/${R}/actions/workflows/health.yml/dispatches`, '-f', 'ref=main']); }
  catch (e) { say(false, `상태 확인 워크플로 실행 실패: ${(e.stderr || e.message).split('\n')[0]}`); }
  let run;
  for (let i = 0; i < 30 && !(run && run.status === 'completed'); i++) {
    await sleep(5000);
    run = (gh('run', 'list', '-R', R, '--workflow', 'health.yml', '--limit', '1', '--json', 'databaseId,createdAt,status,conclusion') || [])[0];
    if (run && new Date(run.createdAt) < since) run = undefined;
  }
  if (!run || run.status !== 'completed') say(false, '상태 확인 실행이 2분 반 안에 끝나지 않음 — 나중에 다시');
  else {
    const notes = runNotes(run.databaseId).filter(a => a.title && !/^Process completed/.test(a.message || ''));
    for (const a of notes) say(a.annotation_level === 'notice' ? true : false, `${a.title}: ${a.message}`);
    if (!notes.length) say(run.conclusion === 'success', `상태 확인 ${run.conclusion}(#${run.databaseId}) — 결과 annotation 없음`);
  }
}

console.log(problems.length ? `\n문제 ${problems.length}개 — 위 ✗ 줄 참고` : '\n문제 없음');
if (!HEALTH) console.log('(사이트·Supabase·서울 중계 응답까지 보려면 --health)');
process.exit(problems.length ? 1 : 0);
