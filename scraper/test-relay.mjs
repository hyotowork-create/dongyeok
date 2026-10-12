#!/usr/bin/env node
// 서울 중계(KrRelay) 점검 — 이 컴퓨터 안에 가짜 중계 함수·가짜 토큰 발급처를 띄워 확인한다(외부 요청 없음).
//   node scraper/test-relay.mjs
// 중계 함수 자체의 점검은 supabase/functions/kr-relay/test.ts(Deno)에 있다.
import { createServer } from 'node:http';
import { Http, KrRelay, BlockedError, RobotsError, RELAY_AUDIENCE } from './lib.mjs';

let pass = 0, failN = 0;
const ok = (cond, msg) => { if (cond) pass++; else { failN++; console.log('✗ ' + msg); } };

const TOKEN = 'h.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.s';
const log = { token: 0, relay: [] };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/token') {                       // GitHub OIDC 토큰 발급처 흉내
    log.token++;
    ok(req.headers.authorization === 'Bearer req-token' && u.searchParams.get('audience') === RELAY_AUDIENCE, '토큰 요청 형식');
    res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ value: TOKEN }));
  }
  // 중계 함수 흉내: 헤더 확인 후 요청 주소에 따라 응답
  let body = ''; for await (const c of req) body += c;
  const job = JSON.parse(body);
  log.relay.push({ job, h: req.headers, q: u.searchParams.get('forceFunctionRegion') });
  const p = new URL(job.url).pathname;
  if (p === '/robots.txt' && job.url.includes('broken')) { res.statusCode = 401; res.setHeader('x-relay-error', encodeURIComponent('호출 권한 없음: 다른 저장소')); return res.end('{}'); }
  res.setHeader('x-upstream-url', encodeURIComponent(job.url));
  if (p === '/robots.txt') { res.setHeader('x-upstream-status', '200'); res.setHeader('x-upstream-type', 'text/plain'); return res.end('User-agent: *\nDisallow: /secret\n'); }
  if (p === '/euc') { res.setHeader('x-upstream-status', '200'); res.setHeader('x-upstream-type', 'text/html; charset=euc-kr'); return res.end(Buffer.from([0xc3, 0xbb, 0xba, 0xf9])); }   // "청빙"
  if (p === '/deny') { res.setHeader('x-upstream-status', '403'); res.setHeader('x-upstream-type', 'text/html'); return res.end('no'); }
  res.setHeader('x-upstream-status', '200'); res.setHeader('x-upstream-type', 'text/plain'); res.end('ok:' + job.method + ':' + (job.body || ''));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const env = { KR_RELAY_URL: `${base}/functions/v1/kr-relay`, KR_RELAY_APIKEY: 'sb_publishable_test', ACTIONS_ID_TOKEN_REQUEST_URL: `${base}/token?api-version=2.0`, ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'req-token' };
const hosts = new Set(['www.mokwon.ac.kr', 'broken.example']);

try {
  ok(KrRelay.fromEnv(hosts, {}) === null, '환경값이 없으면(맥) 중계를 쓰지 않음');
  ok(KrRelay.fromEnv(new Set(), env) === null, '중계할 호스트가 없으면 쓰지 않음');
  const relay = KrRelay.fromEnv(hosts, env);
  const http = new Http({ delayMs: 0, relay });
  const src = { id: 't', home: 'https://www.mokwon.ac.kr/' };

  const text = await http.request('https://www.mokwon.ac.kr/euc', { source: src, encoding: 'auto' });
  ok(text === '청빙', `EUC-KR 응답을 그대로 받아 해석(${text})`);
  ok(log.relay[0].job.url === 'https://www.mokwon.ac.kr/robots.txt', 'robots.txt도 중계로 확인');
  const h = log.relay[0].h;
  ok(h['x-region'] === 'ap-northeast-2' && log.relay[0].q === 'ap-northeast-2', '서울 리전 지정(헤더·주소)');
  ok(h['x-gh-oidc'] === TOKEN && h.apikey === 'sb_publishable_test', 'OIDC 토큰·공개 키 전달');
  ok(!('user-agent' in (log.relay[1].job.headers || {})), 'UA는 중계 함수가 정함(수집기가 바꾸지 않음)');

  const post = await http.request('https://www.mokwon.ac.kr/api', { source: src, method: 'POST', body: new URLSearchParams({ page: '1' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  ok(post === 'ok:POST:page=1', `POST 본문 전달(${post})`);
  ok(log.token === 1, `토큰은 만료 전까지 한 번만 받음(${log.token}회)`);

  let e1 = null; try { await http.request('https://www.mokwon.ac.kr/deny', { source: src }); } catch (e) { e1 = e; }
  ok(e1 instanceof BlockedError, '사이트의 403은 차단으로 처리');
  let e2 = null; try { await http.request('https://www.mokwon.ac.kr/secret', { source: src }); } catch (e) { e2 = e; }
  ok(e2 instanceof RobotsError, 'robots.txt 금지는 중계를 거쳐도 그대로 지킴');
  let e3 = null; try { await http.request('https://broken.example/x', { source: { id: 'b' } }); } catch (e) { e3 = e; }
  ok(e3 instanceof RobotsError && /서울 중계 실패: 호출 권한 없음/.test(e3.message), `중계 실패 사유가 기록에 남음(${e3 && e3.message})`);
  ok(http.relayCount >= 5 && http.count === http.relayCount, '중계 횟수 집계');
} finally { server.close(); }

console.log(`\n${pass}개 통과, ${failN}개 실패`);
process.exit(failN ? 1 : 0);
