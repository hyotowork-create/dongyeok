#!/usr/bin/env node
// 첫 화면 숫자 줄(data/hero-stats.json)을 2일에 한 번 갱신 — 수집 작업 끝에 불림. 48시간이 안 지났으면 그대로 둠(--force면 바로 갱신)
//   jobs     최근 90일 청빙 공고(같은 공고 묶은 수)
//   newJobs  최근 2일(KST 오늘·어제) 게시된 공고(묶은 수)
//   visits   GoatCounter 누적 방문(공개 카운터). 못 읽으면 이전 값 유지
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'data/hero-stats.json';
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
if (!process.argv.includes('--force') && prev.updatedAt && Date.now() - new Date(prev.updatedAt) < 47 * 3600e3) {
  console.log(`첫 화면 숫자: ${prev.updatedAt} 갱신분 유지(2일 주기)`); process.exit(0);
}
const { items = [] } = JSON.parse(readFileSync('data/jobs.json', 'utf8'));
const kst = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const since = kst(Date.now() - 86400e3);
const uniq = list => new Set(list.map(j => j.dk || j.id)).size;
let visits = prev.visits ?? null;
try {
  const r = await fetch('https://dongyeok.goatcounter.com/counter/TOTAL.json', { signal: AbortSignal.timeout(10000) });
  if (r.ok) visits = Number(String((await r.json()).count).replace(/\D/g, '')) || visits;
} catch {}
const out = { updatedAt: new Date().toISOString(), jobs: uniq(items), newJobs: uniq(items.filter(j => j.date >= since)), visits };
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('첫 화면 숫자 갱신:', JSON.stringify(out));
