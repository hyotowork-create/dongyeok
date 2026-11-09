// 동역 기도실: 새벽빛 타이머, 오르간 소리(WebAudio 합성 — 음원 파일·저작권 없음), 오늘의 말씀·기도 제목, 추천 설교, 성경공부·퀴즈
(() => {
  const P = window.PRAYER, $ = id => document.getElementById(id);
  const day = Math.floor((Date.now() + 9 * 3600e3) / 864e5); // 한국 날짜 기준으로 하루에 한 번 바뀜
  const pick = arr => arr[day % arr.length];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 오늘의 말씀·기도 제목 ----------
  const v = pick(P.verses);
  $('verse').textContent = v.text; $('verseRef').textContent = v.ref + ' · 개역한글';
  $('topic').textContent = pick(P.topics);

  // ---------- 오르간 소리 ----------
  let ac = null, out = null, playing = false, loopTimer = null;
  const CHORDS = [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [48, 55, 60, 64, 67], [41, 48, 53, 57, 65], [43, 50, 55, 62, 67], [48, 52, 55, 60, 64]];
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  function organChord(notes, t, dur) {
    for (const m of notes) for (const [mul, g] of [[1, .5], [2, .22], [3, .08], [4, .05]]) { // 8'·4'·2⅔'·2' 스톱
      const o = ac.createOscillator(), e = ac.createGain();
      o.type = 'sine'; o.frequency.value = hz(m) * mul;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * .035, t + 1.6); e.gain.setValueAtTime(g * .035, t + dur - 1.4); e.gain.linearRampToValueAtTime(0, t + dur + .6);
      o.connect(e).connect(out); o.start(t); o.stop(t + dur + .7);
    }
  }
  function startOrgan() {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    ac.resume();
    if (!out) {
      out = ac.createGain(); out.gain.value = .9;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const dl = ac.createDelay(1); dl.delayTime.value = .23; const fb = ac.createGain(); fb.gain.value = .35; // 예배당 울림 흉내
      out.connect(lp); lp.connect(ac.destination); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(ac.destination);
    }
    playing = true;
    let i = 0, t = ac.currentTime + .1;
    const step = () => { if (!playing) return; organChord(CHORDS[i++ % CHORDS.length], t, 6); t += 6; loopTimer = setTimeout(step, 5000); };
    step();
  }
  function stopOrgan() { playing = false; clearTimeout(loopTimer); }
  function bell() {
    if (!ac) return;
    const t = ac.currentTime;
    for (const [f, g] of [[523.25, .25], [1046.5, .1], [1567.98, .05], [659.25, .08]]) {
      const o = ac.createOscillator(), e = ac.createGain(); o.frequency.value = f;
      e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(.0001, t + 5);
      o.connect(e).connect(ac.destination); o.start(t); o.stop(t + 5);
    }
  }
  $('sound').addEventListener('click', () => {
    const on = !playing; on ? startOrgan() : stopOrgan();
    $('sound').setAttribute('aria-pressed', on); $('sound').textContent = on ? '♪ 소리 켬' : '♪ 소리 끔';
    $('sound').setAttribute('aria-label', on ? '오르간 소리 끄기' : '오르간 소리 켜기');
  });

  // ---------- 기도 타이머 + 새벽빛 ----------
  let minutes = 10, t0 = 0, tick = null;
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); minutes = +c.dataset.min;
  }));
  const setDawn = x => document.documentElement.style.setProperty('--t', Math.max(0, Math.min(1, x)).toFixed(3));
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function finish(done) {
    clearInterval(tick); tick = null;
    document.body.classList.remove('lit');
    $('go').textContent = '촛불 켜고 기도 시작';
    if (done) { bell(); $('clock').textContent = '아멘. 오늘도 수고하셨습니다.'; setDawn(1); }
    else { $('clock').textContent = ''; setDawn(0); }
  }
  $('go').addEventListener('click', () => {
    if (tick) return finish(false);
    ac?.resume();
    document.body.classList.add('lit');
    $('go').textContent = '마치기';
    t0 = Date.now();
    const total = minutes * 60;
    const upd = () => {
      const s = (Date.now() - t0) / 1000;
      if (total) { setDawn(s / total); $('clock').textContent = mmss(Math.max(0, total - s)); if (s >= total) finish(true); }
      else { setDawn(Math.min(1, s / 1800)); $('clock').textContent = mmss(s); }
    };
    upd(); tick = setInterval(upd, 1000);
  });

  // ---------- 탭 ----------
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
    for (const n of ['sermon', 'study', 'quiz']) $('pane-' + n).classList.toggle('hidden', n !== b.dataset.tab);
  }));

  // ---------- 추천 설교 (누를 때만 유튜브를 불러옴) ----------
  $('sermons').innerHTML = P.sermons.map((s, i) => `<li><button data-i="${i}"><img src="https://i.ytimg.com/vi/${esc(s.id)}/mqdefault.jpg" alt="" loading="lazy"><div><b>${esc(s.title)}</b><small>${esc(s.preacher)} · ${esc(s.passage)}<br>출처: 유튜브 「${esc(s.channel)}」</small></div></button></li>`).join('');
  $('sermons').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = P.sermons[b.dataset.i];
    if (!/^[\w-]{11}$/.test(s.id)) return;
    stopOrgan(); $('sound').setAttribute('aria-pressed', false); $('sound').textContent = '♪ 소리 끔';
    $('player').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${s.id}?autoplay=1&rel=0" title="${esc(s.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    $('player').classList.add('on'); $('player').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ---------- 성경공부·퀴즈 ----------
  const st = pick(P.studies);
  $('studyRef').textContent = st.ref + ' · 개역한글';
  $('studyText').textContent = st.text;
  $('studyQ').innerHTML = st.questions.map(q => `<li>${esc(q)}</li>`).join('');
  let right = 0, answered = 0;
  $('quiz').innerHTML = `<h2>${esc(st.ref)} 확인 문제</h2>` + st.quiz.map((q, i) => `<div class="q" data-i="${i}"><p>${i + 1}. ${esc(q.q)}</p>${q.a.map((a, j) => `<button data-j="${j}">${esc(a)}</button>`).join('')}</div>`).join('') + '<p id="score" class="score" aria-live="polite"></p>';
  $('quiz').addEventListener('click', e => {
    const b = e.target.closest('.q button'); if (!b) return;
    const box = b.parentElement; if (box.dataset.done) return;
    const q = st.quiz[box.dataset.i], ok = +b.dataset.j === q.c;
    box.dataset.done = 1; b.classList.add(ok ? 'right' : 'wrong');
    if (!ok) box.querySelectorAll('button')[q.c].classList.add('right');
    right += ok; answered++;
    if (answered === st.quiz.length) $('score').textContent = `${st.quiz.length}문제 중 ${right}문제 맞혔어요`;
  });
  if (/^https:\/\/([\w-]+\.)?quizn\.show\//.test(P.quiznUrl)) { $('quizn').href = P.quiznUrl; $('quizn').classList.remove('hidden'); }
})();
