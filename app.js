// Word Sprint 本体。decks/*.js の後に読み込む（window.WORD_SPRINT_DECKS を使う）
(() => {
// 調整用の値はここに集める
const CONFIG = {
  defaults: {deck:'toeic', dir:'e2j', count:20, limit:0, speak:false},
  // ホームの設定ボタン。[値, 表示]
  options: {
    dir:   [['e2j', '英→日'], ['j2e', '日→英'], ['mix', 'ミックス']],
    count: [[10, '10'], [20, '20'], [50, '50'], [0, '全部']],
    limit: [[0, 'なし'], [5, '5秒'], [3, '3秒']],
    speak: [[false, 'オフ'], [true, 'オン']],
  },
  nextDelayOk: 380,    // 正解後、次の問題へ進むまで（ms）
  nextDelayNg: 1800,   // 不正解後、次の問題へ進むまで（ms）
  tapGuard: 250,       // 回答直後のタップを「次へ」と取り違えない猶予（ms）
  timerLow: 0.3,       // 残り時間がこの割合を切るとバーを赤くする
  weakMax: 20,         // 「苦手な単語を集中練習」の最大語数
  streakShow: 3,       // この連続正解数から 🔥 を出す
  // 出題の重み。記録あり: base + scale * (誤+1)/(正+誤+2)、記録なし: unseen
  weight: {base:0.3, scale:4, unseen:2.3},
  // 定着の基準：正解 minCorrect 回以上、かつ正解が誤答の ratio 倍以上
  master: {minCorrect:3, ratio:3},
  speechLang: 'en-US',
  storagePrefix: 'wordsprint.v1.',
};

const POS = {n:'名詞', v:'動詞', adj:'形容詞', adv:'副詞'};
const parseRaw = raw => raw.trim().split('\n').map(l => { const [w,p,m] = l.split('|'); return {w, p, m}; });
// 内蔵デッキは decks/*.js が window.WORD_SPRINT_DECKS に積む（追加方法は README）
const BUILTIN_DECKS = (window.WORD_SPRINT_DECKS || [])
  .map(d => ({id:d.id, name:d.name, desc:d.desc, builtin:true, words:parseRaw(d.raw)}));
const $ = s => document.querySelector(s);

const PREFIX = CONFIG.storagePrefix;
// 保存に失敗したら（容量超過・プライベートブラウズなど）1 回だけ画面で知らせる。黙って捨てると閉じたときに記録が消える
let saveWarned = false;
const saveFailed = () => { if (!saveWarned) { saveWarned = true; $('#saveErrBar').hidden = false; } };
const store = {
  get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { saveFailed(); return false; } }
};

// 保存データの検証。{value, ok}、ok=false は一部または全部を捨てたとき
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = n => Number.isInteger(n) && n >= 0;
const CHECK = {
  settings(v) {
    if (!isObj(v)) return {value: {}, ok: false};
    const value = {}; let ok = true;
    for (const [k, x] of Object.entries(v)) {
      const valid = k === 'deck' ? typeof x === 'string' : !!CONFIG.options[k] && CONFIG.options[k].some(([o]) => o === x);
      if (valid) value[k] = x; else ok = false;
    }
    return {value, ok};
  },
  stats(v) {
    if (!isObj(v)) return {value: {}, ok: false};
    const value = {}; let ok = true;
    for (const [k, s] of Object.entries(v)) {
      if (isObj(s) && isCount(s.c) && isCount(s.w) && (s.t === undefined || typeof s.t === 'number')) value[k] = s; else ok = false;
    }
    return {value, ok};
  },
  decks(v) {
    if (!Array.isArray(v)) return {value: [], ok: false};
    const value = []; let ok = true;
    for (const d of v) {
      if (!isObj(d) || typeof d.id !== 'string' || typeof d.name !== 'string' || !Array.isArray(d.words)) { ok = false; continue; }
      const words = d.words.filter(x => isObj(x) && typeof x.w === 'string' && x.w && typeof x.m === 'string' && x.m);
      if (words.length !== d.words.length) ok = false;
      value.push({...d, words: words.map(x => typeof x.p === 'string' ? x : {...x, p: ''})});
    }
    return {value, ok};
  },
};
// 読み込んで検証する。壊れていたら元の文字列を broken.<キー>.<時刻> に退避してから、直した値で保存し直す
// （退避せずに動かすと、次の保存で壊れたデータごと上書きされて取り戻せなくなる）
function load(k, def) {
  let raw;
  try { raw = localStorage.getItem(PREFIX + k); } catch (e) { return def; }
  if (raw == null) return def;
  let r;
  try { r = CHECK[k](JSON.parse(raw)); } catch (e) { r = {value: def, ok: false}; }
  if (!r.ok) {
    try { localStorage.setItem(PREFIX + 'broken.' + k + '.' + Date.now(), raw); } catch (e) {}
    if (r.value != null) store.set(k, r.value);
  }
  return r.value;
}
const settings = Object.assign({}, CONFIG.defaults, load('settings', {}));
let stats = load('stats', {});
let customDecks = load('decks', null);
// 学習記録の保存。ほかのタブが書いた分を消さないよう、変えた語（keys）だけを最新の保存内容に重ねる。
// keys を省くと全体を書く（全消去のとき）
function saveStats(keys) {
  let base = null;
  if (keys) try { const v = JSON.parse(localStorage.getItem(PREFIX + 'stats') || '{}'); if (isObj(v)) base = CHECK.stats(v).value; } catch (e) {}
  if (!base) base = {...stats};
  for (const k of keys || []) { if (stats[k]) base[k] = stats[k]; else delete base[k]; }
  stats = base;
  store.set('stats', stats);
}
if (!customDecks) { // 旧バージョンの「マイ単語」を移行
  const old = store.get('custom', []);
  customDecks = old.length ? [{id:'c1', name:'マイ単語', words:old}] : [];
  store.set('decks', customDecks);
}
const saveDecks = () => store.set('decks', customDecks);
const allDecks = () => [...BUILTIN_DECKS, ...customDecks];
if (settings.deck === 'builtin') settings.deck = CONFIG.defaults.deck;
if (settings.deck === 'custom') settings.deck = customDecks[0] ? customDecks[0].id : CONFIG.defaults.deck;
const canSpeak = 'speechSynthesis' in window;

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sKey = it => it.w + '\u0001' + it.m;
const usable = d => d && d.words.length >= 4;
// 選択中のデッキが使えなければ既定のデッキ、それも無ければ最初の内蔵デッキ
const curDeck = () => [settings.deck, CONFIG.defaults.deck].map(id => allDecks().find(x => x.id === id)).find(usable) || BUILTIN_DECKS.find(usable);
const deck = () => curDeck().words;
function weight(it) { const s = stats[sKey(it)], W = CONFIG.weight; return s ? W.base + W.scale * (s.w + 1) / (s.c + s.w + 2) : W.unseen; }
function sample(list, n) {
  const pool = list.map(it => ({it, wt: weight(it)}));
  const out = []; n = Math.min(n || pool.length, pool.length);
  while (out.length < n) {
    let tot = 0; for (const p of pool) tot += p.wt;
    let r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].wt; if (r <= 0) break; }
    out.push(pool.splice(i, 1)[0].it);
  }
  return out;
}
function speak(t) {
  if (!canSpeak) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = CONFIG.speechLang; speechSynthesis.speak(u); } catch (e) {}
}
function show(id) { for (const s of ['home','quiz','result','editor']) $('#' + s).hidden = s !== id; window.scrollTo(0, 0); }

/* ---------- home ---------- */
function deckStats(words) {
  let seen = 0, master = 0, c = 0, w = 0; const weak = [];
  for (const it of words) {
    const s = stats[sKey(it)]; if (!s) continue;
    seen++; c += s.c; w += s.w;
    if (s.c >= CONFIG.master.minCorrect && s.c >= s.w * CONFIG.master.ratio) master++;
    if (s.w > 0) weak.push(it);
  }
  weak.sort((a, b) => weight(b) - weight(a));
  return {seen, master, c, w, weak};
}
function renderDecks(cur) {
  const box = $('#decks'); box.innerHTML = '';
  for (const d of allDecks()) {
    const st = deckStats(d.words), usable = d.words.length >= 4;
    const el = document.createElement('div');
    el.className = 'deck' + (d.id === cur.id ? ' on' : '') + (usable ? '' : ' off');
    el.tabIndex = 0; el.setAttribute('role', 'button');
    el.innerHTML = '<div class="dn"></div><div class="dd"></div><div class="dm"></div><div class="bar"><i></i></div>';
    el.querySelector('.dn').textContent = d.name;
    el.querySelector('.dd').textContent = d.builtin ? d.desc : (usable ? 'マイデッキ' : '4語以上で使えます');
    el.querySelector('.dm').textContent = `${d.words.length}語 · 定着 ${st.master}`;
    el.querySelector('.bar>i').style.width = (d.words.length ? st.master / d.words.length * 100 : 0) + '%';
    if (!d.builtin) {
      const e = document.createElement('button'); e.className = 'edit'; e.textContent = '✎'; e.setAttribute('aria-label', '編集');
      e.onclick = ev => { ev.stopPropagation(); openEditor(d.id); };
      el.appendChild(e);
    }
    const pick = () => { if (!usable) { openEditor(d.id); return; } settings.deck = d.id; store.set('settings', settings); renderHome(); };
    el.onclick = pick;
    el.onkeydown = ev => { if (ev.target === el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); pick(); } };
    box.appendChild(el);
  }
  const nw = document.createElement('button'); nw.className = 'deck new'; nw.textContent = '＋ 新しいデッキ';
  nw.onclick = () => openEditor(null);
  box.appendChild(nw);
}
function renderHome() {
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.key;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[key]) === b.dataset.val));
  });
  const cur = curDeck(); renderDecks(cur);
  $('#startBtn').textContent = `「${cur.name}」でスタート`;
  const {seen, master, c, w, weak} = deckStats(cur.words);
  const acc = c + w ? Math.round(c / (c + w) * 100) + '%' : '—';
  $('#homeStats').innerHTML =
    `<div class="sec-title" style="margin:0 0 10px"></div><div class="tiles"><div><b>${seen}<small>/${cur.words.length}</small></b><small>出題済み</small></div><div><b>${master}</b><small>定着</small></div><div><b>${acc}</b><small>累計正答率</small></div></div>` +
    (weak.length ? `<button class="btn big" id="weakBtn">苦手な単語を集中練習（${Math.min(weak.length, CONFIG.weakMax)}語）</button>` : '');
  $('#homeStats .sec-title').textContent = `${cur.name} の学習状況`;
  const wb = $('#weakBtn'); if (wb) wb.onclick = () => start(shuffle(weak.slice(0, CONFIG.weakMax)));
}
// 設定ボタンは CONFIG.options から作る。押したボタンの値は型を保ったまま settings に入れる
document.querySelectorAll('.seg').forEach(seg => {
  const key = seg.dataset.key;
  for (const [v, label] of CONFIG.options[key]) {
    const b = document.createElement('button'); b.dataset.val = String(v); b.textContent = label;
    b.addEventListener('click', () => { settings[key] = v; store.set('settings', settings); renderHome(); });
    seg.appendChild(b);
  }
});
const startNew = () => start(sample(deck(), settings.count));
$('#startBtn').onclick = startNew;
$('#resetBtn').onclick = () => { if (confirm('学習記録（正誤履歴）をすべて消去しますか？')) { stats = {}; saveStats(); renderHome(); } };

/* ---------- quiz ---------- */
let Q = null;
function makeQ(it, d) {
  const dir = settings.dir === 'mix' ? (Math.random() < .5 ? 'e2j' : 'j2e') : settings.dir;
  const others = d.filter(x => x.m !== it.m && x.w !== it.w);
  let pool = it.p ? others.filter(x => x.p === it.p) : [];
  if (pool.length < 3) pool = others;
  const label = x => dir === 'e2j' ? x.m : x.w;
  const seen = new Set([label(it)]), picks = [];
  for (const x of shuffle(pool.slice())) { if (seen.has(label(x))) continue; seen.add(label(x)); picks.push(x); if (picks.length === 3) break; }
  const opts = shuffle([it, ...picks]);
  return {it, dir, opts, ans: opts.indexOf(it), label};
}
function start(items) {
  if (!items.length) return;
  Q = {items, i:0, ok:0, missed:[], times:[], streak:0, best:0, locked:false, raf:0, to:0};
  show('quiz'); render();
}
function render() {
  const it = Q.items[Q.i]; const q = Q.q = makeQ(it, deck());
  Q.locked = false;
  $('#counter').textContent = `${Q.i + 1} / ${Q.items.length}`;
  $('#prog').style.width = (Q.i / Q.items.length * 100) + '%';
  $('#qdir').textContent = q.dir === 'e2j' ? '意味は？' : '英語では？';
  const p = $('#prompt'); p.textContent = q.dir === 'e2j' ? it.w : it.m; p.className = 'prompt ' + (q.dir === 'e2j' ? 'en' : 'ja');
  $('#pos').textContent = it.p ? (POS[it.p] || it.p) : '';
  const box = $('#choices'); box.innerHTML = '';
  q.opts.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'choice';
    b.innerHTML = `<span class="num">${i + 1}</span><span></span>`;
    b.lastChild.textContent = q.label(o);
    b.addEventListener('click', () => answer(i));
    box.appendChild(b);
  });
  $('#tapNext').hidden = true;
  $('#qcard').classList.remove('ok', 'ng');
  $('#streak').textContent = Q.streak >= CONFIG.streakShow ? `🔥 ${Q.streak}連続` : '';
  $('#score').textContent = `正解 ${Q.ok}`;
  $('#speakBtn').hidden = !canSpeak || q.dir !== 'e2j';
  if (document.activeElement) document.activeElement.blur();
  if (settings.speak && q.dir === 'e2j') speak(it.w);
  Q.qt0 = performance.now();
  startTimer();
}
function startTimer() {
  cancelAnimationFrame(Q.raf);
  const lim = settings.limit * 1000, bar = $('#timerBar');
  $('#timer').hidden = !lim; if (!lim) return;
  const tick = () => {
    if (!Q || Q.locked) return;
    const r = 1 - (performance.now() - Q.qt0) / lim;
    bar.style.transform = `scaleX(${Math.max(0, r)})`;
    bar.classList.toggle('low', r < CONFIG.timerLow);
    if (r <= 0) { answer(-1); return; }
    Q.raf = requestAnimationFrame(tick);
  };
  tick();
}
function answer(i) {
  if (!Q || Q.locked) return;
  Q.locked = true; Q.lockedAt = performance.now(); cancelAnimationFrame(Q.raf);
  const {it, ans, dir} = Q.q, ok = i === ans;
  Q.times.push(performance.now() - Q.qt0);
  [...$('#choices').children].forEach((b, j) => {
    b.disabled = true;
    b.classList.add(j === ans ? 'ok' : j === i ? 'ng' : 'dim');
  });
  const k = sKey(it), s = stats[k] || (stats[k] = {c:0, w:0});
  if (ok) { s.c++; Q.ok++; Q.streak++; Q.best = Math.max(Q.best, Q.streak); }
  else { s.w++; Q.streak = 0; if (!Q.missed.includes(it)) Q.missed.push(it); }
  s.t = Date.now(); saveStats([k]);
  $('#qcard').classList.add(ok ? 'ok' : 'ng');
  $('#score').textContent = `正解 ${Q.ok}`;
  if (settings.speak && dir === 'j2e') speak(it.w);
  if (ok) Q.to = setTimeout(next, CONFIG.nextDelayOk);
  else { $('#tapNext').hidden = false; Q.to = setTimeout(next, CONFIG.nextDelayNg); }
}
function next() {
  if (!Q) return;
  clearTimeout(Q.to); Q.i++;
  if (Q.i >= Q.items.length) finish(); else render();
}
function quit() {
  if (!Q) return;
  clearTimeout(Q.to); cancelAnimationFrame(Q.raf);
  const done = Q.times.length;
  if (!done) { Q = null; renderHome(); show('home'); return; }
  Q.items = Q.items.slice(0, done); finish();
}
function finish() {
  // Q は「間違えた単語だけもう一度」のために残すので、以後の回答・タイマー再開を受け付けない
  Q.locked = true; cancelAnimationFrame(Q.raf); clearTimeout(Q.to);
  const n = Q.items.length;
  const avg = Q.times.reduce((a, b) => a + b, 0) / Q.times.length / 1000;
  $('#rScore').textContent = `${Q.ok} / ${n}`;
  $('#rAcc').textContent = Math.round(Q.ok / n * 100) + '%';
  $('#rAvg').textContent = avg.toFixed(1) + '秒';
  $('#rBest').textContent = Q.best;
  const ul = $('#missedList'); ul.innerHTML = '';
  for (const it of Q.missed) {
    const li = document.createElement('li');
    li.innerHTML = '<b></b><span></span>';
    li.firstChild.textContent = it.w; li.lastChild.textContent = it.m;
    if (canSpeak) { li.style.cursor = 'pointer'; li.onclick = () => speak(it.w); }
    ul.appendChild(li);
  }
  $('#missedCard').hidden = !Q.missed.length;
  $('#retryMissed').hidden = !Q.missed.length;
  show('result');
}
$('#quiz').addEventListener('click', e => {
  if (e.target.closest('#quitBtn, #speakBtn')) return;
  if (Q && Q.locked && performance.now() - Q.lockedAt > CONFIG.tapGuard) next();
});
// 別アプリ・別タブにいた間は回答時間に数えない（戻った瞬間に時間切れにしない）
document.addEventListener('visibilitychange', () => {
  if (!Q) return;
  if (document.hidden) { Q.hiddenAt = performance.now(); cancelAnimationFrame(Q.raf); return; }
  if (!Q.hiddenAt) return;
  const away = performance.now() - Math.max(Q.hiddenAt, Q.qt0); Q.hiddenAt = 0;
  if (!Q.locked && away > 0) { Q.qt0 += away; startTimer(); }
});
$('#quitBtn').onclick = quit;
$('#speakBtn').onclick = () => Q && speak(Q.q.it.w);
$('#retryMissed').onclick = () => { if (Q) start(shuffle(Q.missed.slice())); };
$('#againBtn').onclick = startNew;
$('#homeBtn').onclick = () => { renderHome(); show('home'); };

/* ---------- editor ---------- */
const unquote = s => /^"[\s\S]*"$/.test(s) ? s.slice(1, -1).replace(/""/g, '"') : s;
// 1 行を [単語, 意味] に分ける。タブがあればタブで、無ければ最初の , か | で区切る。
// 先頭が " の CSV フィールドは閉じ " まで読み、"" を " に戻す（書き出しとの往復を保つ）
function splitPair(line) {
  let w, rest;
  if (line[0] === '"') {
    let i = 1, s = '';
    for (; i < line.length; i++) {
      if (line[i] !== '"') s += line[i];
      else if (line[i + 1] === '"') { s += '"'; i++; }
      else break;
    }
    const m = line.slice(i + 1).match(/^\s*[\t,|]\s*(.*)$/);
    if (i >= line.length || !m) return null;
    w = s; rest = m[1];
  } else {
    const m = line.match(line.includes('\t') ? /^(.+?)\s*\t\s*(.+)$/ : /^(.+?)\s*[,|]\s*(.+)$/);
    if (!m) return null;
    w = m[1]; rest = m[2];
  }
  return [w.trim(), unquote(rest.trim()).trim()];
}
const csvField = s => /[",|\t\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
const toLine = x => csvField(x.w) + ',' + csvField(x.m);
const isHeader =(w, m) => /^(word|english|en|term|英単語|単語|英語)$/i.test(w) && /^(meaning|japanese|ja|definition|意味|日本語|訳)$/i.test(m);
function parseList(text) {
  const out = [], seen = new Set();
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const pair = splitPair(line);
    if (!pair) continue;
    const [w, mean] = pair;
    if (!w || !mean || isHeader(w, mean)) continue;
    const k = w + '\u0001' + mean; if (seen.has(k)) continue; seen.add(k);
    out.push({w, p:'', m: mean});
  }
  return out;
}
const updCount = () => { $('#editCount').textContent = parseList($('#customText').value).length + ' 語'; };
$('#customText').addEventListener('input', updCount);
let editingId = null;
function openEditor(id) {
  const d = id ? customDecks.find(x => x.id === id) : null;
  editingId = d ? d.id : null;
  $('#editTitle').textContent = d ? 'デッキを編集' : '新しいデッキ';
  $('#deckName').value = d ? d.name : '';
  $('#customText').value = d ? d.words.map(toLine).join('\n') : '';
  $('#deleteDeck').hidden = !d; $('#exportDeck').hidden = !d;
  updCount(); show('editor');
}
$('#cancelEdit').onclick = () => show('home');
$('#deleteDeck').onclick = () => {
  const d = customDecks.find(x => x.id === editingId); if (!d) return;
  if (!confirm(`デッキ「${d.name}」を削除しますか？`)) return;
  customDecks = customDecks.filter(x => x.id !== d.id); saveDecks();
  if (settings.deck === d.id) { settings.deck = CONFIG.defaults.deck; store.set('settings', settings); }
  renderHome(); show('home');
};
$('#exportDeck').onclick = () => {
  const d = customDecks.find(x => x.id === editingId); if (!d) return;
  const csv = '﻿' + d.words.map(toLine).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = (d.name || 'deck') + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#sampleBtn').onclick = () => {
  const t = $('#customText'); const ex = 'apple,りんご\nborrow,借りる\ncurious,好奇心の強い\ndeliberate,意図的な\nelegant,優雅な';
  t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + ex; updCount();
};
$('#fileIn').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { const t = $('#customText'); if (!$('#deckName').value.trim()) $('#deckName').value = f.name.replace(/\.[^.]+$/, ''); t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + String(r.result).replace(/^\uFEFF/, ''); updCount(); };
  r.readAsText(f); e.target.value = '';
});
// 記録のキーは「単語＋意味」なので、意味だけ直すと記録が外れる。
// 単語が一意に対応するときだけ、旧キーの記録を新キーへ引き継ぐ
function carryStats(deckId, oldWords, newWords) {
  const newKeys = new Set(newWords.map(sKey)), count = (list, w) => list.filter(x => x.w === w).length;
  const usedElsewhere = new Set(allDecks().filter(x => x.id !== deckId).flatMap(x => x.words.map(sKey)));
  const changed = [];
  for (const it of newWords) {
    const k = sKey(it);
    if (stats[k] || count(newWords, it.w) !== 1 || count(oldWords, it.w) !== 1) continue;
    const from = sKey(oldWords.find(x => x.w === it.w));
    if (newKeys.has(from) || !stats[from]) continue;
    stats[k] = {...stats[from]}; changed.push(k);
    if (!usedElsewhere.has(from)) { delete stats[from]; changed.push(from); } // 他デッキと共有している記録は残す
  }
  if (changed.length) saveStats(changed);
}
$('#saveCustom').onclick = () => {
  const list = parseList($('#customText').value);
  if (list.length < 4) { alert('4語以上登録してください（現在 ' + list.length + ' 語）'); return; }
  const name = $('#deckName').value.trim() || 'マイデッキ';
  const d = customDecks.find(x => x.id === editingId);
  if (d) { carryStats(d.id, d.words, list); d.name = name; d.words = list; }
  else { editingId = 'c' + Date.now().toString(36); customDecks.push({id:editingId, name, words:list}); }
  saveDecks();
  settings.deck = editingId; store.set('settings', settings);
  renderHome(); show('home');
};

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return; // ダイアログ中はショートカットを効かせない
  if (e.target.closest && e.target.closest('.deck')) return;
  if (!$('#quiz').hidden) {
    if (/^[1-4]$/.test(e.key)) { answer(+e.key - 1); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { if (Q && Q.locked) next(); e.preventDefault(); }
    else if (e.key === 'Escape') quit();
  } else if (e.key === 'Enter' && e.target.closest && e.target.closest('button, a')) {
    // フォーカス中のボタンの Enter はそのボタンに任せる（奪ってスタートしない）
  } else if (!$('#home').hidden && e.key === 'Enter') { startNew(); e.preventDefault(); }
  else if (!$('#result').hidden && e.key === 'Enter') { startNew(); e.preventDefault(); }
});

/* ---------- ほかのタブ・窓との同期 ---------- */
// ほかのタブでの保存を取り込む。取り込まないと、こちらの古い記録で相手の分を上書きしてしまう
window.addEventListener('storage', e => {
  if (!e.key || !e.key.startsWith(PREFIX)) return;
  const k = e.key.slice(PREFIX.length);
  if (!CHECK[k]) return;
  let v = null;
  try { if (e.newValue != null) v = CHECK[k](JSON.parse(e.newValue)).value; } catch (err) { return; }
  if (k === 'stats') stats = v || {};
  else if (k === 'decks') customDecks = v || [];
  else Object.assign(settings, CONFIG.defaults, v || {});
  if (!$('#home').hidden) renderHome();
});
$('#saveErrClose').onclick = () => { $('#saveErrBar').hidden = true; };

/* ---------- 学習記録の書き出し・読み込み（バックアップ） ---------- */
// 記録はこの端末のブラウザにしか無い（iPhone のホーム画面アプリは Safari とも別）。逃げ道はファイルだけ
const BACKUP_FORMAT = 1; // 保存形式を変えたら上げ、readBackup で古い版も読めるようにする
const ymd = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('');
async function exportBackup() {
  const data = {app: 'word-sprint', format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), settings, stats, decks: customDecks};
  const name = `word-sprint-backup-${ymd(new Date())}.json`;
  const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
  // iPhone は共有シートから「ファイルに保存」できる。共有できない環境ではダウンロードにする
  try {
    const file = new File([blob], name, {type: 'application/json'});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file]}); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 読み込んだファイルを検証して {settings, stats, decks, exportedAt} にする。Word Sprint の記録でなければ null
function readBackup(text) {
  let v; try { v = JSON.parse(text); } catch (e) { return null; }
  if (!isObj(v) || v.app !== 'word-sprint' || v.format !== BACKUP_FORMAT) return null;
  return {settings: CHECK.settings(v.settings).value, stats: CHECK.stats(v.stats).value, decks: CHECK.decks(v.decks).value, exportedAt: v.exportedAt};
}
// 統合：単語ごとに回答数の多い方（同数なら新しい方）を残す。自作デッキは足し、中身が同じものは重複させない
function mergeBackup(b) {
  const merged = {...stats};
  for (const [k, s] of Object.entries(b.stats)) {
    const cur = merged[k], n = s.c + s.w, m = cur ? cur.c + cur.w : -1;
    if (n > m || (n === m && (s.t || 0) > (cur.t || 0))) merged[k] = s;
  }
  stats = merged;
  const sameWords = (a, d) => JSON.stringify(a.words.map(toLine)) === JSON.stringify(d.words.map(toLine));
  b.decks.forEach((d, i) => {
    if (customDecks.some(x => sameWords(x, d))) return;
    const clash = customDecks.some(x => x.id === d.id);
    customDecks.push(clash ? {...d, id: 'c' + Date.now().toString(36) + i, name: d.name + '（読み込み）'} : d);
  });
}
function replaceBackup(b) {
  stats = b.stats; customDecks = b.decks;
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, CONFIG.defaults, b.settings);
}
let pendingImport = null;
$('#importFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  f.text().then(text => {
    pendingImport = readBackup(text);
    if (!pendingImport) { alert('Word Sprint で書き出した学習記録のファイルではないか、ファイルが壊れています。'); return; }
    const at = Date.parse(pendingImport.exportedAt);
    $('#importSummary').textContent = `${isNaN(at) ? '日時不明' : new Date(at).toLocaleString('ja-JP')} に書き出した記録です（単語 ${Object.keys(pendingImport.stats).length} 語分・自作デッキ ${pendingImport.decks.length} 個）。`;
    $('#importDlg').showModal();
  });
});
function applyImport(mode) {
  if (!pendingImport) return;
  if (mode === 'replace' && !confirm('今の学習記録・自作デッキ・設定を、ファイルの内容で置き換えます。よろしいですか？')) return;
  (mode === 'merge' ? mergeBackup : replaceBackup)(pendingImport);
  pendingImport = null; $('#importDlg').close();
  saveStats(); saveDecks(); store.set('settings', settings);
  renderHome(); show('home');
  alert('学習記録を読み込みました。');
}
$('#importMerge').onclick = () => applyImport('merge');
$('#importReplace').onclick = () => applyImport('replace');
$('#importCancel').onclick = () => { pendingImport = null; $('#importDlg').close(); };
$('#exportBtn').onclick = $('#saveErrExport').onclick = () => { exportBackup(); };
// ホーム画面アプリでは、保存領域を空き容量不足のときに消されにくくしてもらう
// （ブラウザで開いているときは呼ばない。Firefox などは許可を求める表示を出すため）
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (standalone && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});

/* ---------- ホーム画面アプリ（service worker） ---------- */
// file:// では登録できない（失敗しても普通に動く）。更新の確認と差し替えは sw.js 側
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'updated') $('#updateBar').hidden = false; });
  document.addEventListener('visibilitychange', () => {
    const sw = navigator.serviceWorker.controller;
    if (!document.hidden && sw) sw.postMessage('check');
  });
}
$('#updateReload').onclick = () => location.reload();

if (!curDeck()) { // decks/ を置かずに index.html だけ持ち出したときなど
  $('#home').innerHTML = '<div class="card">単語データを読み込めませんでした。index.html と同じ場所に decks フォルダがあるか確認してください。</div>';
  return;
}
renderHome();
})();
