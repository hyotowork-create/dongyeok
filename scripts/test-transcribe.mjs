// Gemini 채보 웹판(tools/transcribe/lib) 점검 9개: 묶기·쉬운 악보·MusicXML·MIDI·응답 해석. 네트워크 없음. 실행: node --test scripts/test-transcribe.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAndQuantize, buildEasyNotes, chordRootPitch } from '../tools/transcribe/lib/quantize.js';
import { buildMusicXML, keyToFifths, parseChordSymbol, assignFrets, GUITAR_TUNING } from '../tools/transcribe/lib/musicxml.js';
import { buildMidi } from '../tools/transcribe/lib/midi.js';
import { parseChords, parseLyrics, parseDrums } from '../tools/transcribe/lib/gemini.js';

const chunk = {
  offsetSec: 0, bpm: 120, key: 'G major', timeSignature: '4/4',
  notes: [
    { p: 67, s: 0, d: 0.5 }, { p: 71, s: 0, d: 0.5 }, { p: 74, s: 0, d: 0.5 },
    { p: 72, s: 0.5, d: 0.25 }, { p: 73, s: 0.75, d: 0.25 },
    { p: 79, s: 1.0, d: 2.5 },
    { p: 43, s: 0, d: 2.0 }, { p: 43, s: 2.0, d: 2.0 }, { p: 41, s: 4.0, d: 1.0 },
  ],
  bass: [{ p: 31, s: 0, d: 1.9 }, { p: 38, s: 2, d: 1.9 }],
  guitar: [{ p: 55, s: 0, d: 0.4 }, { p: 59, s: 0, d: 0.4 }, { p: 62, s: 0, d: 0.4 }, { p: 67, s: 0.5, d: 0.4 }],
  drums: [{ s: 0, piece: 'kick' }, { s: 0, piece: 'hihat' }, { s: 0.5, piece: 'hihat' }, { s: 1, piece: 'snare' }, { s: 1, piece: 'hihat' }],
  chords: [{ s: 0, name: 'G' }, { s: 2, name: 'D/F#' }, { s: 4, name: 'Em7' }],
  lyrics: [{ s: 0.2, text: '나는 예배자입니다' }],
};

test('키·코드 해석', () => {
  assert.equal(keyToFifths('G major').fifths, 1);
  assert.equal(keyToFifths('Bb major').fifths, -2);
  assert.equal(keyToFifths('D# minor').fifths, -6);
  assert.deepEqual(parseChordSymbol('F#m7'), { root: 'F', rootAlter: 1, suffix: 'm7', kind: 'minor-seventh', bass: null, bassAlter: 0 });
  assert.equal(parseChordSymbol('D/F#').bass, 'F');
  assert.equal(chordRootPitch('Em7'), 40);
  assert.equal(chordRootPitch('D/F#'), 42);
});

test('Gemini 텍스트 파싱', () => {
  assert.equal(parseChords('0.00 G\n2.40 D/F#\nxx').length, 2);
  assert.equal(parseLyrics('1.5 hello world')[0].text, 'hello world');
  assert.deepEqual(parseDrums('0.00 kick\n0.5 cowbell\n1.0 HiHat'), [{ s: 0, piece: 'kick' }, { s: 1, piece: 'hihat' }]);
});

test('합치기·양자화·쉬운 버전', () => {
  const m = mergeAndQuantize([chunk]);
  assert.equal(m.bpm, 120);
  assert.equal(m.parts.piano.length, 9);
  assert.equal(m.parts.bass.length, 2);
  assert.equal(m.parts.drums.length, 5);
  assert.equal(m.chords.length, 3);
  assert.equal(m.chords[1].beat, 4);
  assert.equal(m.lyrics[0].text, '나는 예배자입니다');
  const easy = buildEasyNotes(m);
  assert.ok(easy.some(n => n.p === 74 && n.start === 0)); // 멜로디 = 가장 높은 음
  assert.ok(easy.some(n => n.p === 43 && n.start === 0)); // G 근음
});

test('TAB 현·프렛 배정', () => {
  const notes = [{ p: 40, start: 0, dur: 1 }, { p: 64, start: 1, dur: 1 }, { p: 55, start: 2, dur: 1 }, { p: 59, start: 2, dur: 1 }];
  const f = assignFrets(notes, GUITAR_TUNING);
  assert.deepEqual(f.get(notes[0]), { string: 6, fret: 0 });
  assert.deepEqual(f.get(notes[1]), { string: 1, fret: 0 });
  assert.notEqual(f.get(notes[2]).string, f.get(notes[3]).string);
});

test('MusicXML 여러 파트 + 코드 + 계이름', () => {
  const m = mergeAndQuantize([chunk]);
  const parts = ['piano', 'bass', 'guitar', 'drums'].map(id => ({ id, name: id, notes: m.parts[id], drums: m.parts[id], splitPitch: 60 }));
  const xml = buildMusicXML({ title: 'T<est>', bpm: m.bpm, key: m.key, timeSignature: m.timeSignature, parts, chords: m.chords, solfege: true });
  assert.match(xml, /<work-title>T&lt;est&gt;<\/work-title>/);
  assert.equal((xml.match(/<part id=/g) || []).length, 4);
  assert.match(xml, /<harmony[^>]*><root><root-step>D<\/root-step><\/root><kind text="">major<\/kind><bass><bass-step>F<\/bass-step><bass-alter>1<\/bass-alter><\/bass><\/harmony>/);
  assert.match(xml, /<kind text="m7">minor-seventh<\/kind>/);
  assert.match(xml, /<lyric number="1"><syllabic>single<\/syllabic><text>레<\/text><\/lyric>/);
  assert.match(xml, /<sign>TAB<\/sign>/);
  assert.match(xml, /<technical><string>\d<\/string><fret>\d+<\/fret><\/technical>/);
  assert.match(xml, /<sign>percussion<\/sign>/);
  assert.match(xml, /<unpitched><display-step>F<\/display-step><display-octave>4<\/display-octave><\/unpitched>/);
  assert.match(xml, /<notehead>x<\/notehead>/);
  assert.match(xml, /<tie type="start"\/>/);
});

test('MIDI 여러 파트', () => {
  const m = mergeAndQuantize([chunk]);
  const parts = ['piano', 'bass', 'drums'].map(id => ({ id, name: id, notes: m.parts[id], drums: m.parts[id], splitPitch: 60 }));
  const buf = Buffer.from(buildMidi({ bpm: m.bpm, timeSignature: m.timeSignature, parts, title: 'x' }));
  assert.equal(buf.subarray(0, 4).toString(), 'MThd');
  assert.equal(buf.readUInt16BE(10), 5); // 템포 + 양손 2 + 베이스 + 드럼
});

import { transposeChord, transposeKey, correctKeys } from '../tools/transcribe/lib/keyfix.js';

test('조 보정: 코드·조 옮기기', () => {
  assert.equal(transposeChord('E', 1, true), 'F');
  assert.equal(transposeChord('B/D#', 1, true), 'C/E');
  assert.equal(transposeChord('C#m7', 1, true), 'Dm7');
  assert.equal(transposeChord('Gmaj7', -2, true), 'Fmaj7');
  assert.equal(transposeChord('A2', 1, true), 'Bb2');
  assert.equal(transposeKey('E major', 1), 'F major');
  assert.equal(transposeKey('A minor', 2), 'B minor');
  assert.equal(transposeKey('D major', 0), 'D major');
});

test('조 보정: Gemini가 반음 낮게 적은 조각을 음원 기준으로 되돌린다', () => {
  // 음원: F장조 음계 에너지 (F G A Bb C D E), 30초짜리 조각 2개
  const fMajor = new Float64Array(12); for (const [pc, w] of [[5, 6], [7, 3], [9, 4], [10, 3], [0, 5], [2, 3], [4, 3]]) fMajor[pc] = w;
  const chroma = { hopSec: 30, winSec: 0, frames: [fMajor, fMajor] };
  const eNotes = [64, 66, 68, 69, 71, 73, 75, 64, 71, 68].map((p, i) => ({ p, s: i, d: p % 12 === 4 ? 2 : 0.5 }));   // E장조
  const fNotes = [65, 67, 69, 70, 72, 74, 76, 65, 72, 69].map((p, i) => ({ p, s: i, d: p % 12 === 5 ? 2 : 0.5 }));   // F장조(맞음)
  const results = [
    { offsetSec: 0, durationSec: 30, key: 'E major', notes: eNotes, chords: [{ s: 0, name: 'E' }, { s: 2, name: 'B/D#' }] },
    { offsetSec: 30, durationSec: 30, key: 'F major', notes: fNotes, chords: [{ s: 0, name: 'F' }] },
  ];
  const fix = correctKeys(results, chroma);
  assert.equal(fix.target, 'F major');
  assert.deepEqual(fix.perChunk.map(p => p.shift), [1, 0]);
  assert.equal(results[0].key, 'F major');
  assert.deepEqual(results[0].chords.map(c => c.name), ['F', 'C/E']);
  assert.equal(results[0].notes[0].p, 65);
  assert.equal(results[1].notes[0].p, 65); // 맞는 조각은 그대로
});

import { audioChroma, SR } from '../tools/transcribe/lib/keyfix.js';
test('조 보정: 샘플에서 크로마 — 440Hz 사인파는 A가 가장 큼', () => {
  const x = new Float32Array(SR * 3);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin(2 * Math.PI * 440 * i / SR);
  const c = audioChroma(x);
  assert.ok(c.frames.length > 0);
  assert.equal(c.frames[0].indexOf(Math.max(...c.frames[0])), 9);
});
