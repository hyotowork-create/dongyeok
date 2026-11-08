// 브라우저 오디오 준비: 파일 해독 → 모노 16kHz → 조각별 WAV(base64). 원본의 ffmpeg 자르기를 대신함
const RATE = 16000; // Gemini는 오디오를 16kHz로 낮춰 듣는다

export async function decodeFile(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try { return await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('이 파일의 소리를 읽지 못했습니다. mp3·m4a·wav 파일로 다시 시도해 주세요.'); }
  finally { ctx.close?.(); }
}

async function toMono16k(buf) {
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * RATE), RATE);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start(0);
  return (await off.startRendering()).getChannelData(0);
}

export function wavBytes(samples, rate = RATE) {
  const v = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Uint8Array(v.buffer);
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** [{index, offsetSec, durationSec, audio:{mimeType, base64}}] — 조각 하나는 30초 기준 약 1MB */
export async function splitChunks(buf, chunkSec) {
  const mono = await toMono16k(buf);
  const per = chunkSec * RATE, out = [];
  for (let i = 0, k = 0; i < mono.length; i += per, k++) {
    const part = mono.subarray(i, Math.min(mono.length, i + per));
    if (part.length < RATE * 0.5) break; // 0.5초 미만 꼬리는 버림
    out.push({ index: k, offsetSec: i / RATE, durationSec: part.length / RATE, audio: { mimeType: 'audio/wav', base64: toBase64(wavBytes(part)) } });
  }
  return out;
}
