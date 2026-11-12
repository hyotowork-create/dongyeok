// Gemini 채보 · 동역 웹판. 원본(로컬 서버판) public/app.js에서 서버 호출을 브라우저 처리로 바꿈
import { transcribeChunk, describeSong, PART_IDS } from './lib/gemini.js';
import { decodeFile, splitChunks, toMono } from './lib/audio.js';
import { audioChroma, correctKeys, SR as CHROMA_SR } from './lib/keyfix.js';
import { mergeAndQuantize, buildEasyNotes } from './lib/quantize.js';
import { buildMidi } from './lib/midi.js';
import { buildMusicXML } from './lib/musicxml.js';

const $ = id => document.getElementById(id);
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const PART_LABEL = { piano: '피아노', bass: '베이스', guitar: '기타', drums: '드럼' };
const PART_NAMES = { piano: 'Piano', bass: 'Bass', guitar: 'Guitar', drums: 'Drums' };
const PART_COLOR = { piano: '#6b8cff', bass: '#ffb86b', guitar: '#7ed9a0' };
const SOLFEGE = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
const DRUM_ROWS = ['crash', 'ride', 'hihat_open', 'hihat', 'tom_hi', 'tom_mid', 'tom_low', 'snare', 'kick'];
const DRUM_LABEL = { kick: '킥', snare: '스네어', hihat: '하이햇', hihat_open: '오픈 하이햇', tom_hi: '하이 탐', tom_mid: '미드 탐', tom_low: '로우 탐', crash: '크래시', ride: '라이드' };
const MAX_DURATION_SEC = 15 * 60;
const KEY_STORE = 'gemini_batch_apikey'; // Sermon Insight와 같은 키

// ---------- 키 ----------
const store = { get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 이번 화면에서는 씀 */ } } };
$('apiKey').value = store.get(KEY_STORE);
const keyBadge = () => { const ok = !!$('apiKey').value.trim(); $('keyBadge').textContent = ok ? '● 키 입력됨' : '● 키 입력 필요'; $('keyBadge').classList.toggle('ok', ok); };
keyBadge();
$('apiKey').addEventListener('input', keyBadge);
$('saveKey').addEventListener('click', () => { store.set(KEY_STORE, $('apiKey').value.trim()); $('saveKey').textContent = '저장됨'; setTimeout(() => $('saveKey').textContent = '이 브라우저에 저장', 1500); });

// ---------- 입력 ----------
const drop = $('drop'), fileInput = $('file');
let chosenFile = null;
function setFile(f) {
  chosenFile = f || null;
  drop.classList.toggle('has', !!f);
  $('dropText').textContent = f ? `${f.name} (${(f.size / 1048576).toFixed(1)} MB)` : '음악 파일을 끌어다 놓거나 눌러서 선택';
  if (f) $('url').value = '';
}
fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) setFile(f); });
$('url').addEventListener('input', () => { if ($('url').value.trim()) setFile(null); });
const youtubeId = u => (String(u).match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([0-9A-Za-z_-]{11})/) || [])[1];

// ---------- 진행 ----------
let abort = null, tick = null, logs = [];
function setStatus(progress, message) { $('bar').style.width = `${Math.round(progress * 100)}%`; $('status').textContent = message; }
function log(msg) { logs.push(`${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${msg}`); $('logs').textContent = logs.slice(-20).join('\n'); $('logs').scrollTop = $('logs').scrollHeight; }
$('cancel').addEventListener('click', () => { $('cancel').disabled = true; $('cancel').textContent = '중지하는 중…'; abort?.abort(); });

$('start').addEventListener('click', async () => {
  const msg = $('inputMsg');
  msg.className = 'msg';
  const apiKey = $('apiKey').value.trim();
  const url = $('url').value.trim();
  const parts = [...document.querySelectorAll('.part:checked')].map(c => c.value).filter(p => PART_IDS.includes(p));
  const err = !apiKey ? 'Gemini API 키를 먼저 넣어 주세요' : !chosenFile && !url ? '파일을 고르거나 유튜브 링크를 넣어 주세요'
    : url && !youtubeId(url) ? '유튜브 링크가 아닙니다' : !parts.length ? '악기를 하나 이상 고르세요' : '';
  if (err) { msg.textContent = err; msg.classList.add('err'); return; }
  const opts = {
    apiKey, parts, file: chosenFile, youtube: url ? `https://www.youtube.com/watch?v=${youtubeId(url)}` : null,
    model: $('model').value,
    bpmOverride: Number($('bpm').value) > 0 ? Number($('bpm').value) : null,
    chunkSec: Math.min(60, Math.max(10, Number($('chunkSec').value) || 30)),
    splitPitch: Math.min(84, Math.max(36, Number($('splitPitch').value) || 60)),
    hint: $('hint').value.trim().slice(0, 300),
  };
  msg.textContent = '';
  stopPlayback();
  $('start').disabled = true;
  $('resultCard').classList.add('hidden');
  $('progressCard').classList.remove('hidden');
  $('cancel').disabled = false; $('cancel').textContent = '중지'; $('cancel').classList.remove('hidden');
  $('bar').style.background = '';
  logs = []; $('logs').textContent = '';
  abort = new AbortController();
  const t0 = Date.now();
  tick = setInterval(() => { $('elapsed').textContent = `${Math.round((Date.now() - t0) / 1000)}초 경과`; }, 1000);
  try {
    const r = await runPipeline(opts, abort.signal);
    r.processingSec = +((Date.now() - t0) / 1000).toFixed(1);
    setStatus(1, '채보 완료');
    showResult(r);
  } catch (e) {
    const cancelled = abort.signal.aborted;
    setStatus(1, cancelled ? '중지됨' : '실패: ' + friendly(e));
    $('bar').style.background = cancelled ? '#555' : 'var(--danger)';
    if (!cancelled) console.error(e);
  } finally {
    clearInterval(tick); $('start').disabled = false; $('cancel').classList.add('hidden');
  }
});
function friendly(e) {
  const s = e.status;
  if (s === 400 && /API key/i.test(e.message)) return 'API 키가 맞지 않습니다. 키를 다시 확인해 주세요.';
  if (s === 401 || s === 403) return 'API 키가 맞지 않거나, 이 영상을 열 수 없습니다(비공개·연령 제한·생방송 직후 등).';
  if (s === 402 || /prepayment credits are depleted|billing/i.test(e.message || '')) return 'Gemini API 크레딧이 바닥났습니다. aistudio.google.com 의 프로젝트 결제(Billing)에서 충전하거나 다른 키로 바꾼 뒤 다시 시도하세요.';
  if (s === 429) return 'Gemini 무료 한도를 넘었거나 요청이 몰렸습니다. 잠시 뒤 다시 하거나 「빠른 모드」 모델을 골라 보세요.';
  if (s === 404) return '이 모델을 쓸 수 없습니다. 옵션에서 다른 모델을 골라 주세요.';
  return e.message;
}

async function runPipeline({ apiKey, parts, file, youtube, model, bpmOverride, chunkSec, splitPitch, hint }, signal) {
  const concurrency = /lite/i.test(model) ? 3 : 2;
  const results = [];
  let duration = 0, title = '', audioUrl = null, keyFix = null;
  const call = c => transcribeChunk(c, { apiKey, model, hint, signal, parts, log });
  const report = (r, c) => {
    const counts = ['notes', 'bass', 'guitar', 'drums'].map(k => r[k]?.length ? `${k === 'notes' ? '피아노' : PART_LABEL[k]} ${r[k].length}` : null).filter(Boolean).join(', ');
    log(`조각 ${c.index + 1}: ${counts || '음 없음'}, 코드 ${r.chords.length}, ${r.bpm ?? '?'} BPM, ${r.key ?? '?'}`);
  };

  if (file) {
    title = file.name.replace(/\.[^.]+$/, '');
    setStatus(0.04, '오디오를 읽고 나누는 중');
    const buf = await decodeFile(file);
    duration = buf.duration;
    if (duration > MAX_DURATION_SEC) throw new Error(`오디오가 너무 깁니다 (${Math.round(duration / 60)}분). 15분 이하만 됩니다.`);
    const chunks = await splitChunks(buf, chunkSec);
    audioUrl = URL.createObjectURL(file);
    log(`길이 ${duration.toFixed(1)}초, 호출 ${chunks.length}건 (${chunkSec}초 단위, 파트: ${parts.map(p => PART_LABEL[p]).join('·')})`);
    let done = 0, next = 0;
    setStatus(0.1, `Gemini 채보 중 (0/${chunks.length})`);
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
      while (next < chunks.length) {
        const c = chunks[next++];
        const r = await call(c);
        results[c.index] = { ...r, offsetSec: c.offsetSec, durationSec: c.durationSec };
        report(r, c); done++;
        setStatus(0.1 + 0.78 * done / chunks.length, `Gemini 채보 중 (${done}/${chunks.length})`);
      }
    }));
    // 조 보정: 음원에서 잰 음별 에너지와 비교해, Gemini가 통째로 옮겨 적은 조각을 되돌린다(파일만 — 유튜브는 음원이 없어 못 함)
    setStatus(0.89, '음원에서 조를 재서 맞추는 중');
    try {
      keyFix = correctKeys(results, audioChroma(await toMono(buf, CHROMA_SR)));
      const moved = keyFix.perChunk.map((p, i) => p.shift ? `${i + 1}: ${p.shift > 0 ? '+' : ''}${p.shift}` : null).filter(Boolean);
      log(`조 보정: 음원 기준 ${keyFix.target ?? '판단 불가'}${moved.length ? ` · 옮긴 조각 ${moved.join(', ')}` : ' · 옮길 필요 없음'}`);
    } catch (e) { keyFix = null; log(`조 보정 건너뜀: ${String(e.message).slice(0, 80)}`); }
  } else {
    title = (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtube)}`).then(r => r.ok ? r.json() : null).catch(() => null))?.title || '유튜브 영상';
    // 영상 길이를 미리 알 수 없어, 영상 끝을 넘는 구간(400)이나 짧게 끝난 구간을 만나면 거기서 멈춘다
    const maxIdx = Math.ceil(MAX_DURATION_SEC / chunkSec);
    let endIdx = maxIdx, next = 0, done = 0;
    log(`유튜브: ${title} (${chunkSec}초 단위, 최대 15분)`);
    setStatus(0.06, 'Gemini가 유튜브 영상을 듣는 중');
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next < endIdx) {
        const c = { index: next, offsetSec: next * chunkSec, durationSec: chunkSec, youtube };
        next++;
        let r;
        try { r = await call(c); }
        catch (e) {
          if (e.status === 400 && c.index > 0) { endIdx = Math.min(endIdx, c.index); continue; }
          if (e.status === 400) e.message = '이 영상을 열 수 없습니다(비공개·일부 공개 영상이거나 잘못된 링크). ' + e.message;
          throw e;
        }
        if (c.index >= endIdx) continue;
        if (r.audioSec != null && r.audioSec < chunkSec - 1) { endIdx = Math.min(endIdx, c.index + 1); duration = Math.max(duration, c.offsetSec + r.audioSec); }
        results[c.index] = { ...r, offsetSec: c.offsetSec };
        report(r, c); done++;
        setStatus(Math.min(0.88, 0.1 + 0.05 * done), `Gemini 채보 중 (조각 ${done}개 완료)`);
      }
    }));
    results.length = Math.min(results.length, endIdx);
    if (!duration) duration = endIdx * chunkSec;
    if (endIdx >= maxIdx) log('15분까지만 채보했습니다');
  }

  const got = results.filter(Boolean);
  setStatus(0.9, '악보와 MIDI를 만드는 중');
  const merged = mergeAndQuantize(got, { bpmOverride });
  const partIds = parts.filter(id => merged.parts[id]?.length);
  if (!partIds.length) throw new Error('채보된 음표가 없습니다. 음악이 또렷한 구간인지 확인해 주세요.');
  const R = {
    title, duration, model, youtube, audioUrl,
    bpm: merged.bpm, key: merged.key, timeSignature: merged.timeSignature, splitPitch,
    partIds, parts: merged.parts, chords: merged.chords, lyrics: merged.lyrics,
    easy: buildEasyNotes({ ...merged }, splitPitch),
    noteCount: partIds.reduce((n, id) => n + merged.parts[id].length, 0),
    description: null, keyFix: keyFix ? { applied: keyFix.applied, target: keyFix.target } : null,
  };
  setStatus(0.95, '곡 해설을 쓰는 중');
  try {
    R.description = await describeSong({
      title, duration, key: merged.key, timeSignature: merged.timeSignature, bpm: merged.bpm,
      chordProgression: merged.chords.slice(0, 48).map(c => c.name).join(' '),
      partCounts: partIds.map(id => `${PART_LABEL[id]} ${merged.parts[id].length}음`).join(', '),
      hasLyrics: merged.lyrics.length > 0,
    }, { apiKey, model, signal });
  } catch (e) {
    if (signal.aborted) throw e;
    log(`곡 해설 실패(건너뜀): ${String(e.message).slice(0, 80)}`);
  }
  log(`완료: ${R.noteCount}음, ${R.bpm} BPM, ${R.key}, ${R.timeSignature}, 코드 ${R.chords.length}개`);
  return R;
}

// ---------- 재생 시계: 파일은 <audio>, 유튜브는 원곡 소리 없이 타이머 ----------
class Clock extends EventTarget {
  constructor(duration) { super(); this.duration = duration; this._t = 0; this._s = 0; this._rate = 1; this.paused = true; this.volume = 1; }
  get currentTime() { return this.paused ? this._t : Math.min(this.duration, this._t + (performance.now() - this._s) / 1000 * this._rate); }
  set currentTime(v) { this._t = v; this._s = performance.now(); this.dispatchEvent(new Event('timeupdate')); }
  get playbackRate() { return this._rate; }
  set playbackRate(v) { this._t = this.currentTime; this._s = performance.now(); this._rate = v; }
  play() {
    if (!this.paused) return;
    this._s = performance.now(); this.paused = false;
    this._iv = setInterval(() => { this.dispatchEvent(new Event('timeupdate')); if (this.currentTime >= this.duration) { this.pause(); this.dispatchEvent(new Event('ended')); } }, 250);
  }
  pause() { if (this.paused) return; this._t = this.currentTime; this.paused = true; clearInterval(this._iv); }
}
const audioEl = $('audio');
let player = audioEl;
function bindPlayer(p) {
  p.addEventListener('ended', stopPlayback);
  p.addEventListener('timeupdate', () => { if (!seeking) $('seek').value = Math.round(player.currentTime / (R?.duration || 1) * 1000); $('tCur').textContent = fmt(player.currentTime); });
}
bindPlayer(audioEl);

// ---------- 결과 ----------
let R = null;
let timeline = [];              // 재생용 이벤트 {kind, p|piece, startSec, durSec}
const partOn = { piano: true, bass: true, guitar: true, drums: true };
const blobUrls = [];

function showResult(r) {
  R = r;
  $('progressCard').classList.add('hidden');
  $('resultCard').classList.remove('hidden');
  $('rTitle').textContent = R.title;
  const partsTxt = R.partIds.map(p => `${PART_LABEL[p]} ${R.parts[p].length.toLocaleString()}음`).join(' · ');
  $('rMeta').textContent = `${fmt(R.duration)} · ${R.key} · ${R.timeSignature} · 약 ${R.bpm} BPM · ${partsTxt} · 코드 ${R.chords.length}개${R.lyrics.length ? ` · 가사 ${R.lyrics.length}줄(화면에만)` : ''} · 처리 ${R.processingSec}초 · ${R.model}${R.keyFix?.applied ? ' · 조 보정됨(음원 기준)' : ''}`;
  if (R.description) {
    $('desc').classList.remove('hidden');
    $('descSummary').textContent = R.description.summary || '';
    $('descStructure').textContent = R.description.structure || '';
    $('descDifficulty').textContent = R.description.difficulty || '';
    $('descTips').textContent = R.description.tips || '';
  } else $('desc').classList.add('hidden');
  $('easyWrap').classList.toggle('hidden', !R.partIds.includes('piano') && !R.partIds.includes('guitar'));
  $('drumsTab').classList.toggle('hidden', !R.partIds.includes('drums'));
  $('partToggles').innerHTML = R.partIds.map(p => `<button data-part="${p}" class="${partOn[p] ? '' : 'off'}">${PART_LABEL[p]}</button>`).join('');
  $('partToggles').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { partOn[b.dataset.part] = !partOn[b.dataset.part]; b.classList.toggle('off'); rebuildTimeline(); }));
  updateDownloadLinks();
  if (R.audioUrl) { player = audioEl; audioEl.src = R.audioUrl; audioEl.volume = $('volOrig').value / 100; }
  else { player = new Clock(R.duration); bindPlayer(player); }
  $('volOrigWrap').classList.toggle('hidden', !R.audioUrl);
  player.playbackRate = rate;
  $('tEnd').textContent = fmt(R.duration);
  $('seek').value = 0;
  sheetCache.clear(); osmd = null; $('sheet').innerHTML = ''; leadPages = null; $('lead').innerHTML = '';
  rebuildTimeline();
  switchTab('roll');
  resizeRoll(); drawRoll();
}
/** 요청 옵션(easy)에 맞는 파트 목록 */
function partsFor({ easy }) {
  if (easy) return [{ id: 'piano', name: 'Piano (easy)', notes: R.easy, splitPitch: R.splitPitch }];
  return R.partIds.map(id => ({ id, name: PART_NAMES[id], notes: R.parts[id], drums: R.parts[id], splitPitch: R.splitPitch }));
}
function buildXml(easy, solfege) {
  return buildMusicXML({ title: R.title + (easy ? ' (쉬운 악보)' : ''), bpm: R.bpm, key: R.key, timeSignature: R.timeSignature, parts: partsFor({ easy }), chords: R.chords, solfege });
}
function updateDownloadLinks() {
  const easy = $('easy').checked, sol = $('solfege').checked, name = safeTitle();
  while (blobUrls.length) URL.revokeObjectURL(blobUrls.pop());
  const link = (el, data, type, file) => { const u = URL.createObjectURL(new Blob([data], { type })); blobUrls.push(u); el.href = u; el.download = file; };
  link($('dlMidi'), buildMidi({ bpm: R.bpm, timeSignature: R.timeSignature, parts: partsFor({ easy }), title: R.title }), 'audio/midi', `${name}${easy ? '-easy' : ''}.mid`);
  link($('dlXml'), buildXml(easy, sol), 'application/vnd.recordare.musicxml+xml', `${name}${easy ? '-easy' : ''}${sol ? '-solfege' : ''}.musicxml`);
}
function rebuildTimeline() {
  timeline = [];
  const easy = $('easy').checked;
  for (const id of R.partIds) {
    if (!partOn[id]) continue;
    if (id === 'drums') { for (const d of R.parts.drums) timeline.push({ kind: 'drums', piece: d.piece, startSec: d.startSec, durSec: 0.2 }); continue; }
    const src = (id === 'piano' && easy) ? R.easy : R.parts[id];
    for (const n of src) timeline.push({ kind: id, p: n.p, startSec: n.startSec, durSec: n.durSec });
  }
  timeline.sort((a, b) => a.startSec - b.startSec);
  if (!player.paused) seekSched(player.currentTime + 0.02);
}
$('easy').addEventListener('change', () => { updateDownloadLinks(); rebuildTimeline(); drawRoll(); if (activeTab === 'sheet') loadSheet(); });
$('solfege').addEventListener('change', () => { updateDownloadLinks(); drawRoll(); if (activeTab === 'sheet') loadSheet(); });

// ---------- 재생: player가 시계, 채보는 WebAudio 신디사이저 ----------
let ctx = null, synthGain = null, noiseBuf = null;
let schedIdx = 0, schedTimer = null;
const LOOKAHEAD = 0.3;
let rate = 1;
$('speed').addEventListener('change', e => { rate = Number(e.target.value); player.playbackRate = rate; if (!player.paused) seekSched(player.currentTime + 0.02); });
function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    synthGain = ctx.createGain();
    synthGain.gain.value = $('volSynth').value / 100;
    synthGain.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}
function env(g, when, peak, decayTo, decayTime, dur, release) {
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), when + Math.min(decayTime, dur));
  g.gain.setValueAtTime(Math.max(0.0001, decayTo), when + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);
}
function osc(type, freq, dest, when, stop) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(dest); o.start(when); o.stop(stop); return o; }
function noise(dest, when, stop, filterType, freq) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
  s.connect(f); f.connect(dest); s.start(when); s.stop(stop); return s;
}
function playEvent(e, when) {
  const dur = Math.max(0.08, e.durSec / rate);
  const g = ctx.createGain(); g.connect(synthGain);
  const end = when + dur + 0.3;
  if (e.kind === 'drums') {
    const t = when;
    switch (e.piece) {
      case 'kick': { const o = osc('sine', 150, g, t, t + 0.3); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); env(g, t, 0.9, 0.3, 0.1, 0.18, 0.1); break; }
      case 'snare': { noise(g, t, t + 0.25, 'highpass', 1200); osc('triangle', 190, g, t, t + 0.15); env(g, t, 0.5, 0.15, 0.08, 0.12, 0.1); break; }
      case 'hihat': { noise(g, t, t + 0.1, 'highpass', 7000); env(g, t, 0.25, 0.05, 0.03, 0.04, 0.03); break; }
      case 'hihat_open': { noise(g, t, t + 0.5, 'highpass', 6000); env(g, t, 0.25, 0.08, 0.15, 0.3, 0.15); break; }
      case 'crash': { noise(g, t, t + 1.4, 'bandpass', 5000); env(g, t, 0.35, 0.1, 0.4, 0.9, 0.4); break; }
      case 'ride': { noise(g, t, t + 0.6, 'bandpass', 8000); osc('sine', 3200, g, t, t + 0.4); env(g, t, 0.18, 0.06, 0.15, 0.3, 0.2); break; }
      case 'tom_hi': { const o = osc('sine', 260, g, t, t + 0.35); o.frequency.exponentialRampToValueAtTime(160, t + 0.2); env(g, t, 0.6, 0.2, 0.1, 0.2, 0.1); break; }
      case 'tom_mid': { const o = osc('sine', 190, g, t, t + 0.4); o.frequency.exponentialRampToValueAtTime(110, t + 0.25); env(g, t, 0.6, 0.2, 0.1, 0.25, 0.1); break; }
      case 'tom_low': { const o = osc('sine', 130, g, t, t + 0.5); o.frequency.exponentialRampToValueAtTime(75, t + 0.3); env(g, t, 0.7, 0.2, 0.12, 0.3, 0.1); break; }
    }
    return;
  }
  const freq = 440 * Math.pow(2, (e.p - 69) / 12);
  if (e.kind === 'bass') {
    osc('sine', freq, g, when, end); const g2 = ctx.createGain(); g2.gain.value = 0.35; g2.connect(g); osc('triangle', freq, g2, when, end);
    env(g, when, 0.5, 0.25, 0.3, dur, 0.08);
  } else if (e.kind === 'guitar') {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, when); f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + 0.4); f.connect(g);
    osc('sawtooth', freq, f, when, end); const g2 = ctx.createGain(); g2.gain.value = 0.4; g2.connect(g); osc('triangle', freq, g2, when, end);
    env(g, when, 0.22, 0.05, 0.5, dur, 0.1);
  } else {
    osc('triangle', freq, g, when, end); const g2 = ctx.createGain(); g2.gain.value = 0.25; g2.connect(g); osc('sine', freq * 2, g2, when, end);
    const peak = 0.22 * (e.p < 48 ? 0.8 : 1);
    env(g, when, peak, peak * 0.35, 0.4, dur, 0.12);
  }
}
function seekSched(t) {
  let lo = 0, hi = timeline.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (timeline[m].startSec < t) lo = m + 1; else hi = m; }
  schedIdx = lo;
}
function schedule() {
  const t = player.currentTime;
  const horizon = t + LOOKAHEAD * rate;
  while (schedIdx < timeline.length && timeline[schedIdx].startSec < horizon) {
    const e = timeline[schedIdx++];
    playEvent(e, ctx.currentTime + Math.max(0, (e.startSec - t) / rate));
  }
}
function startPlayback() {
  ensureCtx();
  seekSched(player.currentTime + 0.02);
  player.play();
  clearInterval(schedTimer);
  schedTimer = setInterval(schedule, 100);
  $('play').textContent = '❚❚';
}
function stopPlayback() {
  player.pause();
  clearInterval(schedTimer); schedTimer = null;
  $('play').textContent = '▶';
}
$('play').addEventListener('click', () => { if (!R) return; player.paused ? startPlayback() : stopPlayback(); });
let seeking = false;
$('seek').addEventListener('input', () => { seeking = true; $('tCur').textContent = fmt($('seek').value / 1000 * R.duration); });
$('seek').addEventListener('change', () => { seeking = false; seekTo($('seek').value / 1000 * R.duration); });
function seekTo(t) {
  player.currentTime = Math.max(0, Math.min(R.duration, t));
  $('tCur').textContent = fmt(player.currentTime);
  $('seek').value = Math.round(player.currentTime / (R.duration || 1) * 1000);
  if (!player.paused) seekSched(player.currentTime + 0.02);
}
$('volOrig').addEventListener('input', e => { audioEl.volume = e.target.value / 100; });
$('volSynth').addEventListener('input', e => { if (synthGain) synthGain.gain.value = e.target.value / 100; });

// ---------- 피아노 롤 ----------
const canvas = $('roll'), cx = canvas.getContext('2d');
const LOW = 21, HIGH = 108, KEYW = 56;
let pxPerSec = 80, viewStart = 0;
const isBlack = p => [1, 3, 6, 8, 10].includes(p % 12);
function rollNotes() {
  const out = [];
  for (const id of R.partIds) {
    if (id === 'drums' || !partOn[id]) continue;
    const src = (id === 'piano' && $('easy').checked) ? R.easy : R.parts[id];
    for (const n of src) out.push({ ...n, kind: id });
  }
  return out;
}
function resizeRoll() {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.height = ($('solfege').checked ? 88 * 11 : 560) + 'px';
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resizeRoll(); drawRoll(); });
$('zoom').addEventListener('input', e => { pxPerSec = +e.target.value; drawRoll(); });
$('solfege').addEventListener('change', () => { resizeRoll(); if ($('solfege').checked) $('rollPane').scrollTop = (HIGH - 72) * 11; });
canvas.addEventListener('click', e => { if (!R) return; const x = e.offsetX; if (x < KEYW) return; seekTo(viewStart + (x - KEYW) / pxPerSec); drawRoll(); });
canvas.addEventListener('wheel', e => {
  if (!R) return;
  const dx = e.shiftKey ? e.deltaY : e.deltaX;
  if (Math.abs(dx) < 1) return;
  e.preventDefault();
  $('follow').checked = false;
  viewStart = Math.max(0, viewStart + dx / pxPerSec * 0.5);
  drawRoll();
}, { passive: false });

function drawRoll() {
  if (!R) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const kh = h / (HIGH - LOW + 1);
  const yOf = p => (HIGH - p) * kh;
  const t = player.currentTime;
  const visSec = (w - KEYW) / pxPerSec;
  if ($('follow').checked && (t < viewStart || t > viewStart + visSec * 0.7)) viewStart = Math.max(0, t - visSec * 0.3);
  cx.clearRect(0, 0, w, h);
  for (let p = LOW; p <= HIGH; p++) { cx.fillStyle = isBlack(p) ? '#0b0d12' : '#11141b'; cx.fillRect(KEYW, yOf(p), w - KEYW, kh); }
  const secPerBeat = 60 / R.bpm;
  const beatsPerBar = Number(R.timeSignature.split('/')[0]) * 4 / Number(R.timeSignature.split('/')[1]);
  const barSec = secPerBeat * beatsPerBar;
  for (let b = Math.floor(viewStart / barSec); b * barSec < viewStart + visSec; b++) {
    const x = KEYW + (b * barSec - viewStart) * pxPerSec;
    cx.fillStyle = '#1f2430'; cx.fillRect(x, 0, 1, h);
    if (pxPerSec * secPerBeat > 14) for (let k = 1; k < beatsPerBar; k++) { cx.fillStyle = '#161a23'; cx.fillRect(x + k * secPerBeat * pxPerSec, 0, 1, h); }
    cx.fillStyle = '#4a5063'; cx.font = '10px sans-serif'; cx.fillText(String(b + 1), x + 3, 10);
    const ch = R.chords.find(c => Math.abs(c.startSec - b * barSec) < secPerBeat / 2);
    if (ch) { cx.fillStyle = '#9fb3ff'; cx.font = 'bold 12px sans-serif'; cx.fillText(ch.name, x + 3, 24); }
  }
  const active = new Set();
  const showNames = $('solfege').checked;
  for (const n of rollNotes()) {
    const x0 = KEYW + (n.startSec - viewStart) * pxPerSec;
    const x1 = x0 + Math.max(2, n.durSec * pxPerSec - 1);
    if (x1 < KEYW || x0 > w) continue;
    const on = t >= n.startSec && t < n.startSec + n.durSec;
    if (on) active.add(n.p);
    cx.fillStyle = on ? '#ffffff' : PART_COLOR[n.kind];
    const xa = Math.max(KEYW, x0), xb = Math.min(w, x1);
    cx.fillRect(xa, yOf(n.p) + 1, xb - xa, Math.max(1, kh - 2));
    if (showNames && xb - xa > 16 && kh >= 9) { cx.fillStyle = on ? '#000' : '#0b0d12'; cx.font = `${Math.min(10, kh - 2)}px sans-serif`; cx.fillText(SOLFEGE[n.p % 12], xa + 2, yOf(n.p) + kh - 2); }
  }
  const px = KEYW + (t - viewStart) * pxPerSec;
  if (px >= KEYW && px <= w) { cx.fillStyle = '#ffffffaa'; cx.fillRect(px, 0, 1.5, h); }
  cx.fillStyle = '#f4f4f4'; cx.fillRect(0, 0, KEYW, h);
  for (let p = LOW; p <= HIGH; p++) {
    if (isBlack(p)) continue;
    cx.fillStyle = active.has(p) ? '#9fb3ff' : '#f4f4f4';
    cx.fillRect(0, yOf(p) - (isBlack(p + 1) ? kh / 2 : 0), KEYW, kh + (isBlack(p + 1) ? kh / 2 : 0) + (isBlack(p - 1) ? kh / 2 : 0));
    cx.fillStyle = '#d0d0d0'; cx.fillRect(0, yOf(p) + kh + (isBlack(p - 1) ? kh / 2 : 0) - 1, KEYW, 1);
    if (showNames && kh >= 9) { cx.fillStyle = '#555'; cx.font = '9px sans-serif'; cx.fillText(SOLFEGE[p % 12] + (p % 12 === 0 ? (p / 12 - 1) : ''), 3, yOf(p) + kh - 1); }
    else if (p % 12 === 0) { cx.fillStyle = '#777'; cx.font = '9px sans-serif'; cx.fillText('C' + (p / 12 - 1), 3, yOf(p) + kh - 1); }
  }
  for (let p = LOW; p <= HIGH; p++) { if (!isBlack(p)) continue; cx.fillStyle = active.has(p) ? '#3b5bdb' : '#1a1a1a'; cx.fillRect(0, yOf(p), KEYW * 0.6, kh); }
  cx.fillStyle = '#2a2f3c'; cx.fillRect(KEYW - 1, 0, 1, h);
}

// ---------- 드럼 그리드 ----------
const dg = $('drumGrid'), dcx = dg.getContext('2d');
function drawDrumGrid() {
  if (!R || !R.parts.drums) return;
  const dpr = window.devicePixelRatio || 1;
  const w = dg.clientWidth, h = dg.clientHeight;
  if (dg.width !== Math.round(w * dpr)) { dg.width = Math.round(w * dpr); dg.height = Math.round(h * dpr); }
  dcx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const LABELW = 90, rowH = (h - 20) / DRUM_ROWS.length;
  const secPerBeat = 60 / R.bpm, stepSec = secPerBeat / 4;
  const beatsPerBar = Number(R.timeSignature.split('/')[0]) * 4 / Number(R.timeSignature.split('/')[1]);
  const stepsPerBar = beatsPerBar * 4;
  const stepW = Math.max(6, (pxPerSec * stepSec));
  const t = player.currentTime;
  const visSteps = (w - LABELW) / stepW;
  let start = Math.floor(viewStart / stepSec);
  if ($('follow').checked) { const cur = t / stepSec; if (cur < start || cur > start + visSteps * 0.7) start = Math.max(0, Math.floor(cur - visSteps * 0.3)); viewStart = start * stepSec; }
  dcx.clearRect(0, 0, w, h);
  dcx.fillStyle = '#0b0d12'; dcx.fillRect(0, 0, w, h);
  for (let s = start; s < start + visSteps + 1; s++) {
    const x = LABELW + (s - start) * stepW;
    const inBar = s % stepsPerBar;
    dcx.fillStyle = inBar === 0 ? '#2a3040' : (inBar % 4 === 0 ? '#1a1f2a' : '#12151c');
    dcx.fillRect(x, 20, 1, h - 20);
    if (inBar === 0) { dcx.fillStyle = '#4a5063'; dcx.font = '10px sans-serif'; dcx.fillText(String(s / stepsPerBar + 1), x + 3, 12); }
  }
  DRUM_ROWS.forEach((piece, i) => {
    const y = 20 + i * rowH;
    dcx.fillStyle = i % 2 ? '#0f1218' : '#0b0d12'; dcx.fillRect(LABELW, y, w - LABELW, rowH);
    dcx.fillStyle = '#8b91a1'; dcx.font = '12px sans-serif'; dcx.fillText(DRUM_LABEL[piece], 8, y + rowH / 2 + 4);
  });
  for (const d of R.parts.drums) {
    const s = Math.round(d.startSec / stepSec);
    if (s < start - 1 || s > start + visSteps + 1) continue;
    const i = DRUM_ROWS.indexOf(d.piece); if (i < 0) continue;
    const x = LABELW + (s - start) * stepW, y = 20 + i * rowH;
    const on = t >= d.startSec && t < d.startSec + stepSec;
    dcx.fillStyle = on ? '#fff' : (d.piece === 'kick' ? '#ff8e8e' : d.piece === 'snare' ? '#ffd166' : '#6b8cff');
    dcx.beginPath(); dcx.roundRect(x + 1, y + 3, stepW - 2, rowH - 6, 3); dcx.fill();
  }
  const px = LABELW + (t / stepSec - start) * stepW;
  if (px >= LABELW && px <= w) { dcx.fillStyle = '#ffffffaa'; dcx.fillRect(px, 0, 1.5, h); }
}
dg.addEventListener('click', e => { if (!R) return; const x = e.offsetX; if (x < 90) return; const stepSec = 60 / R.bpm / 4; seekTo(viewStart + (x - 90) / Math.max(6, pxPerSec * stepSec) * stepSec); });

(function raf() {
  if (R) { if (activeTab === 'roll') drawRoll(); else if (activeTab === 'drums') drawDrumGrid(); }
  requestAnimationFrame(raf);
})();

// ---------- 탭 ----------
let activeTab = 'roll';
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  for (const t of ['roll', 'sheet', 'lead', 'drums']) $(t + 'Pane').classList.toggle('hidden', name !== t);
  $('zoomWrap').classList.toggle('hidden', name !== 'roll' && name !== 'drums');
  if (name === 'roll') { resizeRoll(); drawRoll(); }
  if (name === 'sheet') loadSheet();
  if (name === 'lead') renderLead();
}

// ---------- 악보 (OSMD) ----------
let osmd = null, sheetLoading = null;
const sheetCache = new Map(); // variant → xml
function sheetVariant() { return `${$('easy').checked ? 1 : 0}${$('solfege').checked ? 1 : 0}`; }
async function loadSheet() {
  const variant = sheetVariant();
  if (osmd && osmd._variant === variant) return;
  if (sheetLoading) { await sheetLoading; if (osmd && osmd._variant === variant) return; }
  sheetLoading = (async () => {
    $('sheetMsg').textContent = '악보를 그리는 중…';
    try {
      if (!window.opensheetmusicdisplay) throw new Error('악보 라이브러리(OSMD)를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
      let xml = sheetCache.get(variant);
      if (!xml) { xml = buildXml(variant[0] === '1', variant[1] === '1'); sheetCache.set(variant, xml); }
      $('sheet').innerHTML = '';
      osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay($('sheet'), { autoResize: false, backend: 'svg', drawTitle: true, drawComposer: false, drawPartNames: true, pageFormat: 'A4_P', pageBackgroundColor: '#FFFFFF' });
      await osmd.load(xml);
      osmd.render();
      osmd._variant = variant;
      $('sheetMsg').textContent = '';
    } catch (e) {
      $('sheetMsg').textContent = '악보 표시 실패: ' + e.message;
      osmd = null;
    } finally { sheetLoading = null; }
  })();
  return sheetLoading;
}


// ---------- 코드·가사 리드시트 (캔버스 → PDF) ----------
let leadPages = null;
// withLyrics=false면 가사 없이(받는 PDF용). 화면에는 가사를 보여 준다
function leadCanvases(withLyrics) {
  const W = 1240, H = 1754, M = 80, BARS = 4, ROWH = 150;
  const beatsPerBar = Number(R.timeSignature.split('/')[0]) * 4 / Number(R.timeSignature.split('/')[1]);
  const secPerBeat = 60 / R.bpm, barSec = secPerBeat * beatsPerBar;
  const totalBars = Math.max(1, Math.ceil(R.duration / barSec));
  const chordsIn = b => R.chords.filter(c => c.beat >= b * beatsPerBar && c.beat < (b + 1) * beatsPerBar);
  const lyricsIn = b => !withLyrics ? [] : R.lyrics.filter(l => l.startSec >= b * barSec && l.startSec < (b + 1) * barSec);
  const uniq = [...new Set(R.chords.map(c => c.name))];
  const pages = [];
  let page = null, y = 0;
  const newPage = () => {
    page = document.createElement('canvas'); page.width = W; page.height = H;
    const c = page.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    pages.push(page); y = M;
    if (pages.length === 1) {
      c.fillStyle = '#000'; c.font = 'bold 36px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      c.fillText(R.title.length > 40 ? R.title.slice(0, 39) + '…' : R.title, M, y + 36); y += 56;
      c.font = '20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'; c.fillStyle = '#444';
      c.fillText(`${R.key} · ${R.timeSignature} · ♩= ${R.bpm}${uniq.length ? ` · 사용 코드 ${uniq.length}개: ${uniq.slice(0, 12).join('  ')}${uniq.length > 12 ? ' …' : ''}` : ''}`, M, y + 20); y += 50;
      if (!R.chords.length && !(withLyrics && R.lyrics.length)) { c.fillStyle = '#888'; c.fillText('이 곡에서는 코드와 가사가 잡히지 않았습니다.', M, y + 20); y += 40; }
    }
  };
  newPage();
  const barW = (W - 2 * M) / BARS;
  for (let b = 0; b < totalBars; b++) {
    if (b % BARS === 0) { if (y + ROWH > H - M) newPage(); }
    const c = page.getContext('2d');
    const x = M + (b % BARS) * barW;
    c.strokeStyle = '#999'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y + 40); c.lineTo(x, y + ROWH - 20); c.stroke();
    if (b % BARS === BARS - 1 || b === totalBars - 1) { c.beginPath(); c.moveTo(x + barW, y + 40); c.lineTo(x + barW, y + ROWH - 20); c.stroke(); }
    c.strokeStyle = '#ccc'; c.beginPath(); c.moveTo(x, y + 40); c.lineTo(x + barW, y + 40); c.stroke();
    c.fillStyle = '#999'; c.font = '13px sans-serif'; c.fillText(String(b + 1), x + 4, y + 36);
    c.fillStyle = '#000'; c.font = 'bold 26px "Helvetica Neue", Arial, sans-serif';
    for (const ch of chordsIn(b)) { const frac = (ch.beat - b * beatsPerBar) / beatsPerBar; c.fillText(ch.name, x + 10 + frac * (barW - 20), y + 30); }
    c.fillStyle = '#222'; c.font = '17px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    let ly = y + 68, line = '';
    const words = lyricsIn(b).map(l => l.text).join(' ');
    for (const word of words.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (c.measureText(test).width > barW - 16 && line) { c.fillText(line, x + 8, ly); ly += 22; line = word; if (ly > y + ROWH - 24) { line += '…'; break; } }
      else line = test;
    }
    if (line) c.fillText(line, x + 8, ly);
    if (b % BARS === BARS - 1) y += ROWH;
  }
  pages.forEach((p, i) => { const c = p.getContext('2d'); c.fillStyle = '#999'; c.font = '13px sans-serif'; c.fillText(`${i + 1} / ${pages.length} · Gemini 채보 · 개인 연습용`, W - M - 140, H - 40); });
  return pages;
}
function renderLead() {
  if (leadPages) return;
  leadPages = leadCanvases(true);
  $('lead').innerHTML = '';
  for (const p of leadPages) $('lead').appendChild(p);
}
function leadPdfBlob() {
  const pages = leadCanvases(false);
  const pdf = new jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  pages.forEach((p, i) => { if (i > 0) pdf.addPage('a4', 'p'); pdf.addImage(p.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297); });
  return pdf.output('blob');
}
$('dlLead').addEventListener('click', () => { if (!R) return; saveBlob(leadPdfBlob(), `${safeTitle()} 코드 리드시트.pdf`); });

// ---------- PDF / 공유 ----------
function safeTitle() { return R.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'transcription'; }
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
async function makePdfBlob() {
  if (activeTab !== 'sheet') switchTab('sheet');
  await loadSheet();
  if (!osmd) throw new Error('악보가 준비되지 않았습니다');
  const backends = osmd.Drawer.Backends;
  const pdf = new jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  for (let i = 0; i < backends.length; i++) { if (i > 0) pdf.addPage('a4', 'p'); await pdf.svg(backends[i].getSvgElement(), { x: 0, y: 0, width: 210, height: 297 }); }
  return pdf.output('blob');
}
$('dlPdf').addEventListener('click', async () => {
  if (!R) return;
  const btn = $('dlPdf'); btn.disabled = true; btn.textContent = 'PDF 만드는 중…';
  try { saveBlob(await makePdfBlob(), `${safeTitle()}${$('easy').checked ? ' (쉬운 악보)' : ''}${$('solfege').checked ? ' (계이름)' : ''}.pdf`); }
  catch (e) { console.error(e); alert('PDF 자동 생성에 실패해 브라우저 인쇄 창을 엽니다. "PDF로 저장"을 고르세요.\n(' + e.message + ')'); window.print(); }
  finally { btn.disabled = false; btn.textContent = '악보 PDF 받기'; }
});
