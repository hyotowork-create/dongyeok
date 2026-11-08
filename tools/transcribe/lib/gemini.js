// Gemini REST 호출(브라우저): (1) 오디오 조각 채보 (2) 곡 해설. 원본 server/gemini.js에서 SDK·파일 읽기만 바꿈
export const PART_IDS = ['piano', 'bass', 'guitar', 'drums'];
export const DRUM_PIECES = ['kick', 'snare', 'hihat', 'hihat_open', 'tom_hi', 'tom_mid', 'tom_low', 'crash', 'ride'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

function buildSchema(parts) {
  const props = {
    bpm: { type: 'NUMBER', description: 'estimated tempo in beats per minute' },
    key: { type: 'STRING', description: 'musical key, e.g. "C major" or "A minor"' },
    timeSignature: { type: 'STRING', description: 'e.g. "4/4"' },
    chords: { type: 'STRING', description: 'one chord change per line: "<onset_seconds> <chord_symbol>"' },
    lyrics: { type: 'STRING', description: 'one sung phrase per line: "<onset_seconds> <words>"; empty if no vocals' },
  };
  const noteDesc = 'one note per line: "<midi_pitch> <onset_seconds> <duration_seconds>"';
  if (parts.includes('piano')) props.notes = { type: 'STRING', description: 'piano notes, ' + noteDesc };
  if (parts.includes('bass')) props.bass = { type: 'STRING', description: 'bass guitar notes, ' + noteDesc };
  if (parts.includes('guitar')) props.guitar = { type: 'STRING', description: 'acoustic guitar notes, ' + noteDesc };
  if (parts.includes('drums')) props.drums = { type: 'STRING', description: 'drum hits, one per line: "<onset_seconds> <piece>"' };
  return { type: 'OBJECT', properties: props, required: Object.keys(props) };
}

function buildPrompt({ offsetSec, durationSec, hint, parts }) {
  const lines = [
    'You are an expert automatic music transcription system.',
    `This audio is a ${durationSec ? durationSec.toFixed(1) + '-second' : 'short'} segment of a longer recording, starting at ${offsetSec.toFixed(1)} s of the full track.`,
    hint ? `Hint from the user: ${hint}` : '',
    'All times are in seconds from the START OF THIS SEGMENT (0.00 = segment start), with two decimals. Sort every list by onset. Include events cut off at the segment edges. If a part is silent or absent in this segment, return an empty string for it.',
    'Return JSON with these fields:',
    '- bpm: estimated tempo (number). key: like "C major" or "F# minor". timeSignature: like "4/4" or "3/4".',
    '- chords: the harmony as chord symbols, one line per chord change: "<onset_seconds> <symbol>" using symbols like C, G7, Am, F#m7, Dsus4, Bb/D. Give the actual sounding chords of the song.',
    '- lyrics: if there is singing, the sung words, one short phrase (a few words) per line: "<onset_seconds> <words>" in the original language. Empty string if no vocals.',
  ];
  const noteFmt = 'one note per line "<midi_pitch> <onset_seconds> <duration_seconds>" (60 = middle C, duration minimum 0.05, chords = several lines with the same onset)';
  if (parts.includes('piano')) lines.push(
    `- notes: a PIANO ARRANGEMENT of everything that sounds, ${noteFmt}. The MELODY (the most prominent line, or the sung vocal line) is the most important part: transcribe it note by note for the WHOLE segment and never skip bars. Then add the accompaniment (chords, bass line, arpeggios) underneath, as a pianist would play it.`);
  if (parts.includes('bass')) lines.push(
    `- bass: the BASS GUITAR (or bass line) only, ${noteFmt}. Pitches are usually MIDI 28–55. One note at a time.`);
  if (parts.includes('guitar')) lines.push(
    `- guitar: the ACOUSTIC GUITAR part only, ${noteFmt}. Pitches usually MIDI 40–76. For strummed chords write all chord tones with the same onset; for arpeggios write the individual notes.`);
  if (parts.includes('drums')) lines.push(
    `- drums: every DRUM hit, one per line "<onset_seconds> <piece>" where piece is one of: ${DRUM_PIECES.join(', ')}. Include the hi-hat/ride pattern, kick and snare, fills and crashes.`);
  return lines.filter(Boolean).join('\n');
}

const NOTE_RE = /^(\d{1,3})[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/;
export function parseNotes(text) {
  const notes = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.trim().match(NOTE_RE);
    if (!m) continue;
    const p = parseInt(m[1], 10), s = parseFloat(m[2]), d = parseFloat(m[3]);
    if (p < 21 || p > 108 || !(s >= 0) || !(d > 0)) continue;
    notes.push({ p, s, d });
  }
  return notes;
}
function parseTimed(text, re, map) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.trim().match(re);
    if (!m) continue;
    const v = map(m);
    if (v) out.push(v);
  }
  return out;
}
export const parseChords = t => parseTimed(t, /^(\d+(?:\.\d+)?)\s+([A-G][#b♯♭]?[^\s]*)/, m => ({ s: parseFloat(m[1]), name: m[2].replace('♯', '#').replace('♭', 'b') }));
export const parseLyrics = t => parseTimed(t, /^(\d+(?:\.\d+)?)\s+(.+)$/, m => ({ s: parseFloat(m[1]), text: m[2].trim() }));
export const parseDrums = t => parseTimed(t, /^(\d+(?:\.\d+)?)\s+([a-z_]+)/i, m => DRUM_PIECES.includes(m[2].toLowerCase()) ? { s: parseFloat(m[1]), piece: m[2].toLowerCase() } : null);

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function post(model, key, body, signal) {
  const res = await fetch(`${API}${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(j.error?.message || `HTTP ${res.status}`, res.status);
  return j;
}
const textOf = j => (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
const RETRY = s => [429, 500, 503].includes(s) || s === undefined;

/**
 * chunk: {index, offsetSec, durationSec, audio: {mimeType, base64}} 또는 {index, offsetSec, durationSec, youtube: url}
 * 유튜브 구간이 영상 끝을 넘으면 ApiError(status 400)를 그대로 던진다(호출하는 쪽이 끝으로 판단).
 */
export async function transcribeChunk(chunk, { apiKey, model, hint, signal, parts = ['piano'], log = () => {} }) {
  const media = chunk.youtube
    ? { file_data: { file_uri: chunk.youtube, mime_type: 'video/mp4' }, video_metadata: { fps: 0.05, start_offset: `${chunk.offsetSec}s`, end_offset: `${chunk.offsetSec + chunk.durationSec}s` } }
    : { inline_data: { mime_type: chunk.audio.mimeType, data: chunk.audio.base64 } };
  const body = {
    contents: [{ role: 'user', parts: [media, { text: buildPrompt({ ...chunk, hint, parts }) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: buildSchema(parts), temperature: 0, maxOutputTokens: 65536, ...(chunk.youtube ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}) },
  };
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const j = await post(model, apiKey, body, signal);
      const text = textOf(j);
      if (!text) throw new ApiError('Gemini가 빈 응답을 돌려줬습니다', 500);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch {
        parsed = {};
        for (const k of ['bpm', 'key', 'timeSignature', 'notes', 'bass', 'guitar', 'drums', 'chords', 'lyrics']) {
          const m = text.match(new RegExp(`"${k}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"?|[\\d.]+)`));
          if (m) parsed[k] = m[1].startsWith('"') ? m[1].slice(1).replace(/"$/, '').replace(/\\n/g, '\n') : parseFloat(m[1]);
        }
        log(`조각 ${chunk.index + 1}: 응답이 잘려서 부분 복구`);
      }
      // 유튜브 구간의 실제 오디오 길이(초): 오디오는 초당 32토큰
      const audioTok = (j.usageMetadata?.promptTokensDetails || []).find(d => d.modality === 'AUDIO')?.tokenCount;
      return {
        bpm: Number(parsed.bpm) || null,
        key: parsed.key || null,
        timeSignature: parsed.timeSignature || null,
        notes: parts.includes('piano') ? parseNotes(parsed.notes) : [],
        bass: parts.includes('bass') ? parseNotes(parsed.bass) : [],
        guitar: parts.includes('guitar') ? parseNotes(parsed.guitar) : [],
        drums: parts.includes('drums') ? parseDrums(parsed.drums) : [],
        chords: parseChords(parsed.chords),
        lyrics: parseLyrics(parsed.lyrics),
        audioSec: audioTok ? audioTok / 32 : null,
      };
    } catch (err) {
      if (signal?.aborted) throw new Error('cancelled');
      lastErr = err;
      if (attempt < 4 && RETRY(err.status)) {
        const wait = (err.status === 429 ? 8000 : 2000) * attempt;
        log(`조각 ${chunk.index + 1}: ${String(err.message).slice(0, 80)} → ${wait / 1000}초 뒤 다시 시도`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** 비전공자용 곡 해설 (오디오 없이 요약만으로) */
export async function describeSong(info, { apiKey, model, signal }) {
  const schema = {
    type: 'OBJECT',
    properties: { summary: { type: 'STRING' }, structure: { type: 'STRING' }, difficulty: { type: 'STRING' }, tips: { type: 'STRING' } },
    required: ['summary', 'structure', 'difficulty', 'tips'],
  };
  const prompt = [
    '당신은 음악을 전공하지 않은 사람에게 곡을 쉽게 설명해 주는 친절한 선생님입니다. 아래는 자동 채보 결과의 요약입니다. 한국어로, 전문 용어는 꼭 필요할 때만 쓰고 괄호로 뜻을 덧붙여 설명하세요. 가사는 인용하지 마세요.',
    `제목: ${info.title}`,
    `길이: ${Math.round(info.duration)}초, 조: ${info.key}, 박자: ${info.timeSignature}, 템포: 약 ${info.bpm} BPM`,
    `코드 진행(마디 순): ${info.chordProgression || '(없음)'}`,
    `파트별 음 수: ${info.partCounts}`,
    info.hasLyrics ? '보컬 있음' : '가사 없음(연주곡으로 보임)',
    '다음 JSON 필드를 채우세요:',
    '- summary: 이 곡이 어떤 분위기·빠르기·조성인지 2~3문장. 조성은 "G장조(솔이 으뜸음)"처럼 풀어서.',
    '- structure: 코드 진행이 어떻게 반복되는지, 곡이 몇 부분으로 나뉘는지 2~3문장. 코드가 몇 개인지, 가장 많이 나오는 코드는 무엇인지.',
    '- difficulty: "쉬움 / 보통 / 어려움" 중 하나와 이유 한 문장.',
    '- tips: 피아노나 기타로 따라 치려는 초보자를 위한 실용 팁 2~3문장 (예: 왼손은 근음만, 코드 4개만 익히면 됨, 어느 구간이 어려운지).',
  ].join('\n');
  const j = await post(model, apiKey, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 } }, signal);
  const text = textOf(j);
  try { return JSON.parse(text); } catch { return { summary: text.slice(0, 500), structure: '', difficulty: '', tips: '' }; }
}
