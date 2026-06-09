/* ========================================================================
   QuizBlast — static client-side trivia app
   All data lives in localStorage. No network calls, no backend.
   ======================================================================== */

const App = (() => {
  const KEY = 'quizblast_quizzes_v1';
  let quizzes = [];
  let draft = [];           // questions being built in Create
  let importDraft = null;   // parsed quiz awaiting save in Import
  let game = null;          // active play session

  /* ---------- storage ---------- */
  function load() {
    try { quizzes = JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (e) { quizzes = []; }
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(quizzes)); }

  /* ---------- helpers ---------- */
  const $ = id => document.getElementById(id);
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  }
  function toast(msg, dur = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), dur);
  }

  /* ---------- view routing ---------- */
  function show(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    $('view-' + name).classList.add('is-active');
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-link[data-nav="${name}"]`);
    if (navBtn) navBtn.classList.add('active');
    if (name === 'home') renderLibrary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- library ---------- */
  function renderLibrary() {
    const grid = $('quiz-grid');
    const empty = $('lib-empty');
    $('lib-count').textContent = quizzes.length + ' quiz' + (quizzes.length !== 1 ? 'zes' : '');
    if (!quizzes.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    grid.innerHTML = quizzes.map((q, i) => `
      <div class="quiz-card" onclick="App.play(${i})">
        <div class="qc-num">№ ${String(i + 1).padStart(2, '0')}</div>
        ${q.category ? `<div class="qc-cat">${esc(q.category)}</div>` : ''}
        <div class="qc-title">${esc(q.title)}</div>
        <div class="qc-meta">${q.questions.length} Q · ${q.timerSecs > 0 ? q.timerSecs + 's each' : 'untimed'}</div>
        <div class="qc-actions">
          <button class="btn btn-danger" onclick="event.stopPropagation();App.remove(${i})" aria-label="Delete">✕</button>
        </div>
      </div>`).join('');
  }

  function remove(i) {
    if (!confirm('Delete "' + quizzes[i].title + '"?')) return;
    quizzes.splice(i, 1);
    persist();
    renderLibrary();
    toast('Quiz deleted');
  }

  /* ---------- create ---------- */
  function renderDraft() {
    $('c-qcount').textContent = draft.length;
    $('c-list').innerHTML = draft.map((q, i) => `
      <div class="q-row">
        <span class="q-idx">${String(i + 1).padStart(2, '0')}</span>
        <div class="q-body">
          <div class="q-text">${esc(q.question)}</div>
          <div class="q-ans">→ <b>${esc(q.answer)}</b>${q.alternatives && q.alternatives.length ? ' · alt: ' + esc(q.alternatives.join(', ')) : ''}${q.hint ? ' · hint: ' + esc(q.hint) : ''}</div>
        </div>
        <button class="q-del" onclick="App.dropQuestion(${i})" aria-label="Remove">✕</button>
      </div>`).join('');
  }

  function addQuestion() {
    const q = $('c-q').value.trim();
    const a = $('c-a').value.trim();
    if (!q || !a) { toast('Question and answer are both required'); return; }
    const alt = $('c-alt').value.split(',').map(s => s.trim()).filter(Boolean);
    draft.push({ question: q, answer: a, alternatives: alt, hint: $('c-hint').value.trim() });
    ['c-q', 'c-a', 'c-alt', 'c-hint'].forEach(id => $(id).value = '');
    renderDraft();
    $('c-q').focus();
  }

  function dropQuestion(i) { draft.splice(i, 1); renderDraft(); }

  function saveCreated() {
    const title = $('c-title').value.trim();
    if (!title) { toast('Add a title first'); return; }
    if (!draft.length) { toast('Add at least one question'); return; }
    quizzes.push({
      title,
      category: $('c-category').value.trim(),
      timerSecs: parseInt($('c-timer').value, 10),
      questions: draft.map(q => ({ ...q })),
      createdAt: Date.now()
    });
    persist();
    clearCreate();
    toast('Quiz saved ✓');
    show('home');
  }

  function clearCreate() {
    $('c-title').value = '';
    $('c-category').value = '';
    $('c-timer').value = '30';
    ['c-q', 'c-a', 'c-alt', 'c-hint'].forEach(id => $(id).value = '');
    draft = [];
    renderDraft();
  }

  /* ---------- import: parsing ---------- */
  function parseCSV(text) {
    // minimal CSV parser supporting quoted fields
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], nx = text[i + 1];
      if (inQ) {
        if (c === '"' && nx === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += c;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  }

  function fromCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('CSV needs a header row plus at least one question');
    const header = rows[0].map(h => h.trim().toLowerCase());
    const qi = header.indexOf('question');
    const ai = header.indexOf('answer');
    const hi = header.indexOf('hint');
    const alti = header.indexOf('alternatives');
    if (qi === -1 || ai === -1) throw new Error('CSV header must include "question" and "answer" columns');
    const questions = rows.slice(1).map(r => ({
      question: (r[qi] || '').trim(),
      answer: (r[ai] || '').trim(),
      hint: hi !== -1 ? (r[hi] || '').trim() : '',
      alternatives: alti !== -1 ? (r[alti] || '').split('|').map(s => s.trim()).filter(Boolean) : []
    })).filter(q => q.question && q.answer);
    if (!questions.length) throw new Error('No valid question/answer rows found');
    return { title: 'Imported Quiz', category: '', timerSecs: 30, questions };
  }

  function fromJSON(text) {
    const data = JSON.parse(text);
    const quizObj = Array.isArray(data) ? { title: 'Imported Quiz', questions: data } : data;
    if (!Array.isArray(quizObj.questions)) throw new Error('JSON must have a "questions" array');
    const questions = quizObj.questions.map(q => {
      if (!q.question || !q.answer) throw new Error('Every question needs "question" and "answer" fields');
      return {
        question: String(q.question).trim(),
        answer: String(q.answer).trim(),
        hint: q.hint ? String(q.hint).trim() : '',
        alternatives: Array.isArray(q.alternatives) ? q.alternatives.map(s => String(s).trim()).filter(Boolean) : []
      };
    });
    return {
      title: quizObj.title ? String(quizObj.title) : 'Imported Quiz',
      category: quizObj.category ? String(quizObj.category) : '',
      timerSecs: Number.isFinite(quizObj.timerSecs) ? quizObj.timerSecs : 30,
      questions
    };
  }

  function ingest(text, filename) {
    const trimmed = text.trim();
    const looksJSON = trimmed.startsWith('{') || trimmed.startsWith('[');
    const isCSVName = filename && /\.csv$/i.test(filename);
    let parsed;
    if (looksJSON && !isCSVName) parsed = fromJSON(trimmed);
    else if (isCSVName) parsed = fromCSV(trimmed);
    else {
      // guess: try JSON first, fall back to CSV
      try { parsed = fromJSON(trimmed); }
      catch (e) { parsed = fromCSV(trimmed); }
    }
    showImportPreview(parsed);
  }

  function showImportPreview(parsed) {
    importDraft = parsed;
    $('import-error').hidden = true;
    $('imp-title').value = parsed.title;
    $('imp-list').innerHTML = parsed.questions.map((q, i) => `
      <div class="q-row">
        <span class="q-idx">${String(i + 1).padStart(2, '0')}</span>
        <div class="q-body">
          <div class="q-text">${esc(q.question)}</div>
          <div class="q-ans">→ <b>${esc(q.answer)}</b>${q.alternatives && q.alternatives.length ? ' · alt: ' + esc(q.alternatives.join(', ')) : ''}${q.hint ? ' · hint: ' + esc(q.hint) : ''}</div>
        </div>
      </div>`).join('');
    $('import-preview').hidden = false;
    $('import-preview').scrollIntoView({ behavior: 'smooth' });
    toast(parsed.questions.length + ' questions parsed ✓');
  }

  function importError(msg) {
    const el = $('import-error');
    el.textContent = '⚠ ' + msg;
    el.hidden = false;
    $('import-preview').hidden = true;
  }

  function parsePasted() {
    const text = $('paste-area').value.trim();
    if (!text) { toast('Paste some content first'); return; }
    try { ingest(text, null); }
    catch (e) { importError(e.message); }
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try { ingest(reader.result, file.name); }
      catch (e) { importError(e.message); }
    };
    reader.onerror = () => importError('Could not read that file');
    reader.readAsText(file);
  }

  function saveImported() {
    if (!importDraft) return;
    importDraft.title = $('imp-title').value.trim() || 'Imported Quiz';
    importDraft.createdAt = Date.now();
    quizzes.push(importDraft);
    persist();
    importDraft = null;
    $('paste-area').value = '';
    $('import-preview').hidden = true;
    toast('Imported ✓');
    show('home');
  }

  function cancelImport() {
    importDraft = null;
    $('import-preview').hidden = true;
    $('paste-area').value = '';
  }

  /* ---------- templates ---------- */
  function downloadTemplate(kind) {
    let content, name, type;
    if (kind === 'json') {
      content = JSON.stringify({
        title: 'My Quiz',
        category: 'General',
        timerSecs: 30,
        questions: [
          { question: 'What does PV stand for?', answer: 'Photovoltaic', alternatives: ['photo voltaic'], hint: 'Two words' },
          { question: 'Capital of France?', answer: 'Paris', alternatives: [], hint: '' }
        ]
      }, null, 2);
      name = 'quizblast-template.json'; type = 'application/json';
    } else {
      content = 'question,answer,hint,alternatives\n'
        + 'What does PV stand for?,Photovoltaic,Two words,photo voltaic|photo-voltaic\n'
        + 'Capital of France?,Paris,,\n';
      name = 'quizblast-template.csv'; type = 'text/csv';
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    toast('Template downloaded');
  }

  /* ---------- play ---------- */
  function play(i) {
    const quiz = quizzes[i];
    game = {
      quizIndex: i,
      quiz,
      idx: 0,
      answers: quiz.questions.map(() => null),
      timer: null,
      timeLeft: 0,
      locked: false
    };
    show('play');
    renderQuestion();
  }

  function renderQuestion() {
    clearInterval(game.timer);
    game.locked = false;
    const q = game.quiz.questions[game.idx];
    const total = game.quiz.questions.length;
    const done = game.answers.filter(a => a !== null).length;
    const pct = Math.round((done / total) * 100);

    $('play-area').innerHTML = `
      <div class="play-top">
        <div>
          <div class="play-title">${esc(game.quiz.title)}</div>
          <div class="play-progress-txt">${done} of ${total} answered</div>
        </div>
        ${game.quiz.timerSecs > 0 ? `<div class="timer" id="timer">${game.quiz.timerSecs}</div>` : ''}
      </div>
      <div class="track"><div class="track-fill" style="width:${pct}%"></div></div>
      <div class="q-counter">Question ${game.idx + 1} / ${total}</div>
      <div class="q-display">${esc(q.question)}</div>
      <div class="hint-wrap" id="hint-wrap">
        ${q.hint ? `<button class="btn btn-ghost btn-small" onclick="App.revealHint()">Show hint</button>` : ''}
      </div>
      <div class="answer-wrap">
        <input class="answer-inp" id="answer" type="text" placeholder="type your answer…"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        <button class="btn btn-solid" onclick="App.submit()">Go</button>
      </div>
      <div class="chips">
        ${game.quiz.questions.map((_, k) => {
          const a = game.answers[k];
          let cls = 'chip';
          if (a !== null) cls += a.correct ? ' done' : ' done miss';
          if (k === game.idx) cls += ' now';
          return `<span class="${cls}">${k + 1}</span>`;
        }).join('')}
      </div>
      <div class="play-nav">
        <button class="btn btn-ghost btn-small" onclick="App.prev()" ${game.idx === 0 ? 'disabled' : ''}>← Prev</button>
        <button class="btn btn-ghost btn-small" onclick="App.skip()">${game.idx === total - 1 ? 'Finish →' : 'Skip →'}</button>
        <button class="btn btn-ghost btn-small" onclick="App.quit()">Quit</button>
      </div>`;

    const inp = $('answer');
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    if (game.quiz.timerSecs > 0) {
      game.timeLeft = game.quiz.timerSecs;
      game.timer = setInterval(() => {
        game.timeLeft--;
        const el = $('timer');
        if (el) { el.textContent = game.timeLeft; if (game.timeLeft <= 5) el.classList.add('warn'); }
        if (game.timeLeft <= 0) { clearInterval(game.timer); timeUp(); }
      }, 1000);
    }
  }

  function revealHint() {
    const q = game.quiz.questions[game.idx];
    $('hint-wrap').innerHTML = `<span class="hint-text">◆ ${esc(q.hint)}</span>`;
  }

  function isCorrect(input, q) {
    const n = norm(input);
    if (n === norm(q.answer)) return true;
    return (q.alternatives || []).some(alt => norm(alt) === n);
  }

  function submit() {
    if (game.locked) return;
    const inp = $('answer');
    if (!inp.value.trim()) return;
    const q = game.quiz.questions[game.idx];
    const correct = isCorrect(inp.value, q);
    game.answers[game.idx] = { given: inp.value.trim(), correct };
    game.locked = true;
    clearInterval(game.timer);
    inp.classList.add(correct ? 'right' : 'wrong');
    inp.disabled = true;
    if (correct) { toast('Correct ✓'); setTimeout(advance, 750); }
    else { toast('Answer: ' + q.answer, 2800); setTimeout(advance, 1600); }
  }

  function timeUp() {
    if (game.locked) return;
    const q = game.quiz.questions[game.idx];
    game.answers[game.idx] = { given: '', correct: false };
    game.locked = true;
    toast("Time's up — " + q.answer, 2500);
    setTimeout(advance, 1800);
  }

  function advance() {
    if (game.idx < game.quiz.questions.length - 1) { game.idx++; renderQuestion(); }
    else results();
  }

  function skip() {
    clearInterval(game.timer);
    if (game.answers[game.idx] === null) game.answers[game.idx] = { given: '', correct: false };
    advance();
  }

  function prev() {
    clearInterval(game.timer);
    if (game.idx > 0) { game.idx--; renderQuestion(); }
  }

  function quit() {
    clearInterval(game.timer);
    show('home');
  }

  /* ---------- results ---------- */
  function results() {
    clearInterval(game.timer);
    const total = game.quiz.questions.length;
    const correct = game.answers.filter(a => a && a.correct).length;
    const pct = Math.round((correct / total) * 100);
    let verdict = 'Not bad';
    if (pct === 100) verdict = 'Flawless';
    else if (pct >= 80) verdict = 'Sharp';
    else if (pct >= 50) verdict = 'Solid effort';
    else if (pct < 25) verdict = 'Room to grow';

    $('results-area').innerHTML = `
      <div class="results">
        <div class="res-score"><span class="pct">${pct}%</span></div>
        <div class="res-label">${correct} of ${total} correct · ${verdict}</div>
        <div class="res-list">
          ${game.quiz.questions.map((q, i) => {
            const a = game.answers[i] || { correct: false, given: '' };
            return `<div class="res-row ${a.correct ? 'hit' : 'miss'}">
              <span class="res-icon">${a.correct ? '✓' : '✕'}</span>
              <div class="res-q">${esc(q.question)}
                ${!a.correct && a.given ? `<span class="res-yours">you said: ${esc(a.given)}</span>` : ''}
              </div>
              <span class="res-a">${esc(q.answer)}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="play-nav">
          <button class="btn btn-solid" onclick="App.play(${game.quizIndex})">Play again</button>
          <button class="btn btn-ghost" onclick="App.show('home')">Library</button>
        </div>
      </div>`;
    show('results');
  }

  /* ---------- samples ---------- */
  function loadSamples() {
    const samples = [
      {
        title: 'Solar Energy Basics', category: 'Engineering', timerSecs: 30, createdAt: Date.now(),
        questions: [
          { question: 'What does PV stand for?', answer: 'Photovoltaic', alternatives: ['photo voltaic', 'photo-voltaic'], hint: 'Two words, starts with P' },
          { question: 'What device converts DC from panels into AC?', answer: 'Inverter', alternatives: [], hint: 'It flips the current type' },
          { question: 'What unit measures a panel\'s power output?', answer: 'Watts', alternatives: ['watt', 'W'], hint: 'Named after a Scottish engineer' },
          { question: 'What tracks the sun across one axis to boost output?', answer: 'Single-axis tracker', alternatives: ['tracker', 'saht'], hint: 'It follows the sun east to west' },
          { question: 'What does the "I" in ITC stand for?', answer: 'Investment', alternatives: [], hint: 'A solar tax credit' }
        ]
      },
      {
        title: 'World Capitals', category: 'Geography', timerSecs: 15, createdAt: Date.now() + 1,
        questions: [
          { question: 'Capital of Japan?', answer: 'Tokyo', alternatives: [], hint: '' },
          { question: 'Capital of Australia?', answer: 'Canberra', alternatives: [], hint: 'Not Sydney!' },
          { question: 'Capital of Canada?', answer: 'Ottawa', alternatives: [], hint: 'Not Toronto' },
          { question: 'Capital of Brazil?', answer: 'Brasilia', alternatives: ['brasília'], hint: 'A planned city' },
          { question: 'Capital of Egypt?', answer: 'Cairo', alternatives: [], hint: 'On the Nile' }
        ]
      }
    ];
    samples.forEach(s => quizzes.push(s));
    persist();
    renderLibrary();
    toast('Sample quizzes loaded ✓');
  }

  /* ---------- init ---------- */
  function init() {
    load();
    renderLibrary();
    renderDraft();

    // file drop / browse
    const dz = $('dropzone');
    const fi = $('file-input');
    dz.addEventListener('click', () => fi.click());
    fi.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  }

  return {
    show, play, remove,
    addQuestion, dropQuestion, saveCreated, clearCreate,
    parsePasted, saveImported, cancelImport, downloadTemplate,
    submit, skip, prev, quit, revealHint,
    loadSamples, init
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
