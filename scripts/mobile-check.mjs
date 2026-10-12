#!/usr/bin/env node
// 휴대폰 화면 점검 — Chrome(맥) 또는 Chromium(클라우드 세션)을 화면 없이 띄워 휴대폰(기본 390px)처럼 열고, 화면마다 가로로 넘치는 요소를 찾는다.
//   node scripts/mobile-check.mjs                         공개 사이트 21개 화면 점검(공개 사이트에 닿지 않으면 이 폴더의 index.html로)
//   node scripts/mobile-check.mjs --url=file:///…/index.html --width=390 --shot=pg-review-new
//     --url=local        이 폴더의 index.html(고친 뒤 push 전에 볼 때)
//     --shot=화면아이디  그 화면을 PNG로 저장(scripts/mobile-<아이디>.png, 저장소에는 올리지 않음)
// 「넘침」이 보이면 그 요소가 화면 폭을 넓히는 것. scrollW가 폭과 같으면 옆으로 미는 칸 안의 내용이라 괜찮다.
// 클라우드 세션: 공개 사이트·Supabase·사진이 막혀 있어 이 폴더의 파일로 열린다. 레이아웃 점검은 되지만, DB에서 오는 목록(평가·글)은 비어 보인다.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = 'https://hyotowork-create.github.io/dongyeok/';
const LOCAL = pathToFileURL(join(ROOT, 'index.html')).href;
const reachable = async u => { try { return (await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } };
const BASE = args.url === 'local' ? LOCAL : args.url || (await reachable(PUBLIC) ? PUBLIC : (console.log('공개 사이트에 닿지 않아 이 폴더의 index.html로 점검합니다.'), LOCAL));
const W = Number(args.width || 390), mobile = W < 700;
const PAGES = (readFileSync(join(ROOT, 'index.html'), 'utf8').match(/const ALL_PAGES\s*=\s*\[([^\]]*)\]/)[1].match(/pg-[a-z-]+/g));
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium'), '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('Chrome/Chromium을 찾지 못함 — CHROME=경로 로 지정'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const prof = mkdtempSync(join(tmpdir(), 'dongyeok-mobile-'));
const port = 9300 + Math.floor(Math.random() * 500);
const extra = process.getuid?.() === 0 ? ['--no-sandbox'] : [];   // 클라우드 컨테이너는 root라 샌드박스를 못 씀
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', ...extra, `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++seq; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
let bad = 0;
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { } }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); } });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await send('Page.enable');
  for (const p of (args.shot ? [args.shot] : PAGES)) {
    await send('Page.navigate', { url: `${BASE}${BASE.includes('?') ? '&' : '?'}mc=${Date.now()}#${p}` });
    await sleep(3500);
    const r = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const vw = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > vw + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.ticker,.beams,.tile'); })
        .slice(0, 6).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + ' ' + Math.round(e.getBoundingClientRect().right) + 'px');
      return { vw, scrollW: document.documentElement.scrollWidth, over };
    })()` })).result.value;
    const pageOverflow = r.scrollW > r.vw;
    if (pageOverflow) bad++;
    console.log(`${pageOverflow ? '✗' : '✓'} ${p.padEnd(16)} 폭 ${r.vw} / 내용 ${r.scrollW}${r.over.length ? '  넘침: ' + r.over.join(', ') : ''}`);
    if (args.shot) {
      const m = await send('Page.getLayoutMetrics');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: Math.min(Math.ceil(m.cssContentSize.height), 8000), scale: 1 } });
      const out = join(ROOT, 'scripts', `mobile-${p}.png`);
      writeFileSync(out, Buffer.from(shot.data, 'base64')); console.log('저장:', out);
    }
  }
} finally { try { ws && ws.close(); } catch { } chrome.kill(); }
console.log(bad ? `\n가로로 넘치는 화면 ${bad}개` : '\n모든 화면이 폭 안에 들어옴');
process.exit(bad ? 1 : 0);
