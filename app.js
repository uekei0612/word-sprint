// Word Sprint 本体。decks/*.js の後に読み込む（window.WORD_SPRINT_DECKS を使う）
(() => {
// 調整用の値はここに集める
const CONFIG = {
  defaults: {deck:'toeic300-basic', dir:'e2j', count:20, limit:0, speak:false, example:'ng', newPerDay:10},
  // 設定の選択肢。[値, 表示]。ホームのチップは押すたびに次の値へ回る
  options: {
    dir:   [['e2j', '英→日'], ['j2e', '日→英'], ['mix', 'ミックス']],
    count: [[10, '10'], [20, '20'], [50, '50'], [0, '全部']],
    limit: [[0, 'なし'], [5, '5秒'], [3, '3秒']],
    speak: [[false, 'オフ'], [true, 'オン']],
    // 例文を出す場面。出したときは自動で次へ進まず、タップ / Enter を待つ（読む時間を取る）
    example: [['ng', '間違えたとき'], ['all', '毎回'], ['off', '出さない']],
    newPerDay: [[5, '5語'], [10, '10語'], [20, '20語'], [0, '出さない']], // 「今日の復習」に入れる新しい語の 1 日の上限（デッキごと）
  },
  nextDelayOk: 380,    // 正解後、次の問題へ進むまで（ms）
  nextDelayNg: 1800,   // 不正解後、次の問題へ進むまで（ms）
  tapGuard: 250,       // 回答直後のタップを「次へ」と取り違えない猶予（ms）
  timerLow: 0.3,       // 残り時間がこの割合を切るとバーを赤くする
  weakMax: 20,         // 「振り返り」の集中練習の最大語数
  // 間違えた語を同じクイズの gap 問後にもう一度出す。1 語につき max 回まで（正答率・記録には数えない）
  relearn: {gap: 4, max: 2},
  streakShow: 3,       // この連続正解数から 🔥 を出す
  // 出題の重み。記録あり: base + scale * (誤+1)/(正+誤+2)、記録なし: unseen
  weight: {base:0.3, scale:4, unseen:2.3},
  // 間隔反復（「今日の復習」）。Leitner 方式：正解で箱を 1 つ上げ、箱の間隔（日）だけ空けて次に出す。
  // 間違えたら箱 0（その日のうちにもう一度）。masterBox 以上の箱を「定着」とする。
  // 日付は dayStart 時で切り替える（夜中の 0 時台の学習を前の日に数える。Anki と同じ）
  srs: {intervals:[0, 1, 3, 7, 14, 30, 60, 120], masterBox:4, reviewMax:100, dayStart:4},
  // 振り返り（#2・#5・#7）。自信なし（手動）・迷った正解（回答時間）・リーチ（何度も忘れる）を 1 つの入れ物に集める。
  // 印を付けた後に clearAfter 回続けて自信を持って正解したら外す。印のある語は通常の出題で weight だけ出やすくする
  review: {clearAfter: 2, weight: 1.5},
  // 迷った正解：その人の正解時間の中央値（記録が minCards 語以上あるとき。無ければ base ms）の ratio 倍を超えたら。
  // min ms 以下は迷いとしない。制限時間ありでは残り (1 - nearLimit) を切ってからの正解も迷いとする
  slow: {ratio: 1.8, min: 1500, base: 3000, minCards: 10, nearLimit: 0.85},
  // リーチ：覚えた後に lapses 回以上忘れた、または誤答が wrong 回以上で、まだ定着していない語。記録には持たず毎回判定する
  leech: {lapses: 4, wrong: 6},
  // 箱を持たない記録（v2 より前）の箱を推定するときだけ使う旧基準：正解 minCorrect 回以上、かつ正解が誤答の ratio 倍以上
  master: {minCorrect:3, ratio:3},
  // 学習統計（#11）。回答時間は 1 問 msCap ms までを学習時間に数える（放置した時間を数えない）。
  // ヒートマップは weeks 週、正答率の推移は trendWeeks 週、復習予定は forecastDays 日。levels は回答数の色の段の下限
  stats: {msCap: 30000, weeks: 18, trendWeeks: 8, forecastDays: 7, levels: [1, 20, 50, 100]},
  speechLang: 'en-US',
  // 保存の版。v2 で学習記録を出題方向ごとに分けた（#3）。前の版の保存は消さずに残す（古い版に戻しても記録が残る）
  storagePrefix: 'wordsprint.v2.',
  oldPrefix: 'wordsprint.v1.',
};

const POS = {n:'名詞', v:'動詞', adj:'形容詞', adv:'副詞', phr:'熟語'};
// 4〜6 列目は例文・和訳・例文中で強調する語形（無い行もある）
const parseRaw = raw => raw.trim().split('\n').map(l => {
  const [w, p, m, e, j, b] = l.split('|'), it = {w, p, m};
  if (e) Object.assign(it, {e, j: j || '', b: b || ''});
  return it;
});
// 内蔵デッキは decks/*.js が window.WORD_SPRINT_DECKS に積む（追加方法は README）
const BUILTIN_DECKS = (window.WORD_SPRINT_DECKS || [])
  .map(d => ({id:d.id, name:d.name, desc:d.desc, group:d.group || 'その他', builtin:true, words:parseRaw(d.raw)}));
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
      // b（箱）・l（忘れた回数）・r（振り返りの印）・k（印の後の連続正解）・a（正解時間 ms）は 0 以上の整数、d（次の日）・f（初めての日）は整数。間隔反復の値は無くてもよい
      const opt = (x, f) => x === undefined || f(x);
      if (isObj(s) && isCount(s.c) && isCount(s.w) && opt(s.t, x => typeof x === 'number') && opt(s.b, isCount) && opt(s.l, isCount)
        && opt(s.d, Number.isInteger) && opt(s.f, Number.isInteger) && opt(s.r, isCount) && opt(s.k, isCount) && opt(s.a, isCount)) value[k] = s; else ok = false;
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
      // 例文（e・j・b）は文字列のときだけ残す。壊れていても単語そのものは使えるので ok は落とさない
      const fix = x => {
        const y = typeof x.p === 'string' ? {...x} : {...x, p: ''};
        if (typeof y.e !== 'string' || !y.e) { delete y.e; delete y.j; delete y.b; }
        else { if (typeof y.j !== 'string') y.j = ''; if (typeof y.b !== 'string') y.b = ''; }
        return y;
      };
      value.push({...d, words: words.map(fix)});
    }
    return {value, ok};
  },
  // 日ごとの記録（#11）。{日: {デッキ: {n 回答数, c 正解数, ms 学習時間}}}。日は dayNo の通し番号
  daily(v) {
    if (!isObj(v)) return {value: {}, ok: false};
    const value = {}; let ok = true;
    for (const [d, decks] of Object.entries(v)) {
      if (!/^\d+$/.test(d) || !isObj(decks)) { ok = false; continue; }
      for (const [id, e] of Object.entries(decks)) {
        if (isObj(e) && isCount(e.n) && isCount(e.c) && isCount(e.ms) && e.c <= e.n) (value[d] = value[d] || {})[id] = e; else ok = false;
      }
    }
    return {value, ok};
  },
  // 出題しない語（#9）。単語＋意味のキーの配列
  suspended(v) {
    if (!Array.isArray(v)) return {value: [], ok: false};
    const value = v.filter(k => typeof k === 'string' && k.includes('\u0001'));
    return {value: [...new Set(value)], ok: value.length === v.length};
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
// 学習記録は単語・意味・出題方向ごと（英→日と日→英は別の記録。Anki の 1 ノート 2 カードと同じ）
const DIRS = ['e2j', 'j2e'];
const wKey = it => it.w + '\u0001' + it.m;
const sKey = (it, dir) => wKey(it) + '\u0001' + dir;
// 方向の無い記録（v1・古いバックアップ）を両方向に写す。どちらの方向で付いた正誤かは分からないため
function splitStats(old) {
  const out = {};
  for (const [k, s] of Object.entries(old)) for (const d of DIRS) out[k + '\u0001' + d] = {...s};
  return out;
}
// v1 の保存を v2 へ一度だけ写す（v2 の保存が 1 つも無いとき）。記録は splitStats、ほかはそのまま
function migrateV1() {
  try {
    const keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i));
    if (keys.some(k => k && k.startsWith(PREFIX))) return;
    for (const k of keys) {
      if (!k || !k.startsWith(CONFIG.oldPrefix) || k.startsWith(CONFIG.oldPrefix + 'broken.')) continue;
      const name = k.slice(CONFIG.oldPrefix.length), raw = localStorage.getItem(k);
      if (name !== 'stats') { localStorage.setItem(PREFIX + name, raw); continue; }
      let v = null; try { v = JSON.parse(raw); } catch (e) {}
      if (isObj(v)) localStorage.setItem(PREFIX + 'stats', JSON.stringify(splitStats(v)));
      else localStorage.setItem(PREFIX + 'stats', raw); // 壊れていれば load が退避して直す
    }
  } catch (e) { saveFailed(); }
}
migrateV1();
const settings = Object.assign({}, CONFIG.defaults, load('settings', {}));
let stats = load('stats', {});
let customDecks = load('decks', null);
// 出題しない語（覚えた語を外す。Anki の一時停止）。単語＋意味で持ち、その語を含むどのデッキでも外す。
// 出題・今日の復習・振り返りから除くが、誤答の選択肢には使い続ける。学習記録はそのまま残す
let suspended = new Set(load('suspended', []));
const saveSuspended = () => store.set('suspended', [...suspended]);
let daily = load('daily', {});
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
if (settings.deck === 'toeic') settings.deck = 'toeic300-core'; // 旧「TOEIC頻出」は TOEIC 300 と「中上級」に分けた
const canSpeak = 'speechSynthesis' in window;

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isOut = it => suspended.has(wKey(it));
const active = words => words.filter(it => !isOut(it));
// 4 択を作れるデッキ。出題しない語を除いて 4 語以上（外すときもこれを割らないようにする）
const usable = d => !!d && active(d.words).length >= 4;
// どのデッキにも無くなった記録（内蔵デッキで意味の書き方を変えた語など）を、今の書き方の記録へ移す。
// 記録のキーは「単語＋意味」なので、そのままだと記録が外れる。内蔵デッキでのその単語の意味が
// 1 つに決まるときだけ移し、両方に記録があれば回数を足す。移したキーを返す
function moveStaleStats() {
  const live = new Set(allDecks().flatMap(d => d.words.flatMap(it => DIRS.map(dir => sKey(it, dir))))), meaning = new Map();
  for (const it of BUILTIN_DECKS.flatMap(d => d.words)) meaning.set(it.w, meaning.has(it.w) && meaning.get(it.w) !== it.m ? null : it.m);
  const changed = [];
  for (const k of Object.keys(stats)) {
    const [w, , dir] = k.split('\u0001'), m = meaning.get(w);
    if (live.has(k) || !m || !DIRS.includes(dir)) continue;
    const to = sKey({w, m}, dir), a = stats[k], b = stats[to] || {c:0, w:0}, t = Math.max(a.t || 0, b.t || 0);
    stats[to] = t ? {c: a.c + b.c, w: a.w + b.w, t} : {c: a.c + b.c, w: a.w + b.w};
    delete stats[k]; changed.push(k, to);
  }
  return changed;
}
{ const moved = moveStaleStats(); if (moved.length) saveStats(moved); }
// 選択中のデッキが使えなければ既定のデッキ、それも無ければ最初の内蔵デッキ
const curDeck = () => [settings.deck, CONFIG.defaults.deck].map(id => allDecks().find(x => x.id === id)).find(usable) || BUILTIN_DECKS.find(usable);
const deck = () => curDeck().words;
// 出題する方向。ミックスは両方向の記録（カード）から選ぶ
const dirsFor = () => settings.dir === 'mix' ? DIRS : [settings.dir];
function weight(it, dir) {
  const s = stats[sKey(it, dir)], W = CONFIG.weight;
  return s ? W.base + W.scale * (s.w + 1) / (s.c + s.w + 2) + (s.r || isLeech(s) ? CONFIG.review.weight : 0) : W.unseen;
}
// 重みつきで n 語選び、出題の列（{it, dir} のカード）にする。ミックスでは方向ごとの重みで選び、
// 同じ語を 1 回のクイズで両方向に出さない
function sample(list, n) {
  const pool = list.flatMap(it => dirsFor().map(dir => ({it, dir, wt: weight(it, dir)})));
  const out = []; n = Math.min(n || list.length, list.length);
  while (out.length < n) {
    let tot = 0; for (const p of pool) tot += p.wt;
    let r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].wt; if (r <= 0) break; }
    const {it, dir} = pool[i]; out.push({it, dir});
    for (let j = pool.length - 1; j >= 0; j--) if (pool[j].it === it) pool.splice(j, 1);
  }
  return out;
}
function speak(t) {
  if (!canSpeak) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = CONFIG.speechLang; speechSynthesis.speak(u); } catch (e) {}
}
// 新しい版がそろったら（service worker の 'updated'）、再読み込みして自動で切り替える。
// クイズ・編集・ダイアログの途中で読み込み直すと答えや入力が消えるので、ホームに戻るまで待つ
// ピンチ拡大を止める。iOS の Safari・ホーム画面アプリは viewport の user-scalable=no を無視するので、ジェスチャーごと止める
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, {passive: false});
let updateReady = false;
function reloadIfIdle() {
  if (updateReady && !$('#home').hidden && !document.querySelector('dialog[open]')) location.reload();
}
// 画面を切り替える。読み上げ機能が新しい画面の頭から読めるよう、見出しへフォーカスを移す
const SCREEN_HEAD = {home: '#curName', result: '#rScore', editor: '#editTitle', stats: '#statsTitle'};
function show(id) {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  for (const s of ['home','quiz','result','editor','stats']) $('#' + s).hidden = s !== id; window.scrollTo(0, 0);
  if (SCREEN_HEAD[id]) $(SCREEN_HEAD[id]).focus({preventScroll: true});
  if (id === 'home') reloadIfIdle();
}

/* ---------- 間隔反復 ---------- */
// 記録の s.b は箱、s.d は次に出す日、s.f は初めて答えた日、s.l は覚えた後に忘れた回数。日は dayNo の通し番号
const SRS = CONFIG.srs, TOP = SRS.intervals.length - 1;
const dayNo = ts => Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000 - SRS.dayStart * 3600000) / 86400000);
const today = () => dayNo(Date.now());
// 箱を持たない記録は、正誤回数から箱を推定し、最後に答えた日から箱の間隔で次の日を決める（保存し直さない）
function srsOf(s) {
  if (s.b !== undefined) return {b: s.b, d: s.d};
  const old = s.c >= CONFIG.master.minCorrect && s.c >= s.w * CONFIG.master.ratio;
  const b = old ? SRS.masterBox : Math.min(Math.max(s.c - s.w, 0), SRS.masterBox - 1);
  return {b, d: s.t ? dayNo(s.t) + SRS.intervals[b] : today()};
}
// 回答を箱に反映する。予定日前の正解（自由な練習）では箱を上げない。間違いは予定日に関係なく箱 0 へ。
// 自信なし・迷った正解（hard）は箱を上げず、今の箱（最低 1）の間隔で出し直す（Anki の「難しい」）
function schedule(s, ok, isNew, hard) {
  const t = today(), {b, d} = isNew ? {b: 0, d: t} : srsOf(s);
  if (isNew) s.f = t;
  if (!ok) { if (b > 0) s.l = (s.l || 0) + 1; s.b = 0; s.d = t; }
  else if (d > t) { s.b = b; s.d = d; }
  else { s.b = hard ? Math.max(b, 1) : Math.min(b + 1, TOP); s.d = t + SRS.intervals[s.b]; }
}
// 振り返りの印 r（1：自信なし、2：迷った正解）。付けたら連続正解 k を 0 から数え直し、clearAfter 回で外す
const R_UNSURE = 1, R_SLOW = 2;
function markReview(s, ok, add) {
  if (add) { s.r = (s.r || 0) | add; s.k = 0; return; }
  if (!s.r) return;
  if (!ok) { s.k = 0; return; }
  s.k = (s.k || 0) + 1;
  if (s.k >= CONFIG.review.clearAfter) { delete s.r; delete s.k; }
}
const isLeech = s => ((s.l || 0) >= CONFIG.leech.lapses || s.w >= CONFIG.leech.wrong) && srsOf(s).b < SRS.masterBox;
// 迷った正解か。基準はその人の正解時間（記録の a）の中央値
function isSlow(ms) {
  const SL = CONFIG.slow, as = Object.values(stats).map(s => s.a).filter(Boolean).sort((x, y) => x - y);
  const base = as.length >= SL.minCards ? as[as.length >> 1] : SL.base;
  return ms > Math.max(SL.min, base * SL.ratio) || (!!settings.limit && ms > settings.limit * 1000 * SL.nearLimit);
}
// 今日の分（今のデッキ・今の出題方向）。復習は予定日を過ぎた順、新しい語はデッキの並び順で 1 日の上限まで。
// 1 語につき 1 枚（ミックスで同じ語を両方向に出さない）
function todayQueue(words) {
  words = active(words);
  const t = today(), dirs = dirsFor(), due = [], fresh = []; let newDone = 0, tomorrow = 0;
  for (const it of words) {
    let pick = null, freshDir = null, next = false;
    for (const dir of dirs) {
      const s = stats[sKey(it, dir)];
      if (!s) { if (!freshDir) freshDir = dir; continue; }
      if (s.f === t) newDone++;
      const {d} = srsOf(s);
      if (d <= t && (!pick || d < pick.d)) pick = {it, dir, d};
      if (d === t + 1) next = true;
    }
    if (pick) due.push(pick); else if (freshDir) fresh.push({it, dir: freshDir});
    if (next) tomorrow++; // 明日の予定（今日の分が終わったときに出す）
  }
  due.sort((a, b) => a.d - b.d);
  const review = due.slice(0, SRS.reviewMax).map(({it, dir}) => ({it, dir}));
  const add = fresh.slice(0, Math.max(0, settings.newPerDay - newDone));
  return {review, add, tomorrow};
}

/* ---------- home ---------- */
// 今の出題方向（ミックスは両方向）での集計。出題しない語は数えない（out にその数、n に残りの語数）。定着は選んだ方向すべてで定着した語。
// 振り返り（weak）はカード（{it, dir}）で、リーチ → 印あり → 誤答あり の順、同じ中では重みの大きい順。
// ミックスでは 1 語につき 1 枚。leech・unsure・slow は印ごとの語数
const mastered = s => !!s && srsOf(s).b >= SRS.masterBox;
function deckStats(words) {
  const out = words.length - (words = active(words)).length;
  let seen = 0, master = 0, c = 0, w = 0, leech = 0, unsure = 0, slow = 0; const weak = [], dirs = dirsFor();
  for (const it of words) {
    const ss = dirs.map(dir => stats[sKey(it, dir)]); if (!ss.some(Boolean)) continue;
    seen++;
    for (const s of ss) if (s) { c += s.c; w += s.w; }
    if (ss.every(mastered)) master++;
    if (ss.some(s => s && isLeech(s))) leech++;
    if (ss.some(s => s && s.r & R_UNSURE)) unsure++;
    if (ss.some(s => s && s.r & R_SLOW)) slow++;
    const rank = s => !s ? 0 : isLeech(s) ? 3 : s.r ? 2 : s.w > 0 ? 1 : 0;
    const bad = dirs.map((dir, i) => ({it, dir, rk: rank(ss[i]), wt: weight(it, dir)})).filter(x => x.rk);
    if (bad.length) weak.push(bad.reduce((a, b) => b.rk > a.rk || (b.rk === a.rk && b.wt > a.wt) ? b : a));
  }
  weak.sort((a, b) => b.rk - a.rk || b.wt - a.wt);
  return {seen, master, c, w, leech, unsure, slow, out, n: words.length, weak: weak.map(({it, dir}) => ({it, dir}))};
}
// デッキ一覧（ホーム）。内蔵デッキは group の順、自作デッキは最後に並べる。押すとその場で選ぶ。
// スクロールを減らすため見出しは置かず、1 つのタイルの並びにする（見出しごとに行の空きが出る）
function renderDecks(cur) {
  const box = $('#decks'); box.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'deck-grid'; box.appendChild(grid);
  const groups = new Map();
  for (const d of allDecks()) { const g = d.builtin ? d.group : '自作デッキ'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(d); }
  if (!groups.has('自作デッキ')) groups.set('自作デッキ', []);
  for (const [g, list] of groups) {
    for (const d of list) {
      const st = deckStats(d.words), ok = usable(d);
      // 選ぶボタンと編集ボタンは入れ子にせず、行の中に並べる
      const row = document.createElement('div'); row.className = 'deck-row';
      const el = document.createElement('button');
      el.className = 'deck' + (d.id === cur.id ? ' on' : '') + (ok ? '' : ' off') + (d.builtin ? '' : ' has-edit');
      if (d.id === cur.id) el.setAttribute('aria-current', 'true');
      el.innerHTML = '<span class="dn"></span><span class="dd"></span><span class="dm"></span><span class="bar"><i></i></span>';
      row.appendChild(el);
      el.querySelector('.dn').textContent = d.name;
      // タイルは 1 行に収めるため「目安。特徴」の目安だけを出す（全文は上のカードと title に出る）
      el.querySelector('.dd').textContent = d.builtin ? d.desc.split('。')[0].replace(/の目安$/, '') : (ok ? 'マイデッキ' : '4語以上で使えます');
      if (d.builtin) el.title = d.desc;
      el.querySelector('.dm').textContent = `${st.n}語 · 定着 ${st.master}${st.out ? ` · 外す ${st.out}` : ''}`;
      el.querySelector('.bar>i').style.width = (st.n ? st.master / st.n * 100 : 0) + '%';
      if (!d.builtin) {
        const e = document.createElement('button'); e.className = 'edit'; e.textContent = '✎'; e.setAttribute('aria-label', d.name + 'を編集');
        e.onclick = ev => { ev.stopPropagation(); openEditor(d.id); };
        row.appendChild(e);
      }
      const pick = () => { if (!ok) { openEditor(d.id); return; } settings.deck = d.id; store.set('settings', settings); renderHome(); };
      el.onclick = pick;
      grid.appendChild(row);
    }
    if (g === '自作デッキ') {
      const nw = document.createElement('button'); nw.className = 'deck new'; nw.textContent = '＋ 新しいデッキ';
      nw.onclick = () => openEditor(null);
      grid.appendChild(nw);
    }
  }
}
const optLabel = k => (CONFIG.options[k].find(([v]) => v === settings[k]) || [])[1];
// ホームの設定チップの表示。押すと CONFIG.options の次の値へ回る。
// iPhone の幅で ⚙ と 1 行に収めるため、変えることの少ない自動発音は ⚙ の中だけに置く
const CHIPS = {
  dir: () => optLabel('dir'),
  count: () => settings.count ? optLabel('count') + '問' : '全問',
  limit: () => settings.limit ? '制限 ' + optLabel('limit') : '制限なし',
};
const CHIP_NAME = {dir: '出題', count: '問題数', limit: '制限時間'};
function renderHome() {
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.key;
    seg.querySelectorAll('button').forEach(b => { const on = String(settings[key]) === b.dataset.val; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  });
  const cur = curDeck(); renderDecks(cur);
  const {seen, master, c, w, weak, leech, unsure, slow, out, n: total} = deckStats(cur.words);
  $('#curName').textContent = cur.name;
  $('#curDesc').textContent = cur.builtin ? cur.desc : 'マイデッキ';
  $('#curStats').textContent = `出題 ${seen}/${total} · 定着 ${master} · 正答率 ${c + w ? Math.round(c / (c + w) * 100) + '%' : '—'}`;
  $('#curBar').style.width = master / total * 100 + '%';
  $('#suspBtn').hidden = !out; $('#suspBtn').textContent = `出題しない語 ${out}`;
  const marks = [[leech, 'リーチ'], [unsure, '自信なし'], [slow, '迷った']].filter(([n]) => n).map(([n, l]) => `${l} ${n}`);
  $('#curReview').hidden = !marks.length; $('#curReview').textContent = '振り返り：' + marks.join(' · ');
  const n = settings.count ? Math.min(settings.count, total) : total;
  $('#startBtn').textContent = `スタート（${n}問）`;
  // 今日の分があればそれを主のボタンにし、無ければ「完了」と明日の予定を出してスタートを主にする
  const tq = todayQueue(cur.words), tn = tq.review.length + tq.add.length, tb = $('#todayBtn');
  tb.disabled = !tn; tb.classList.toggle('primary', !!tn); $('#startBtn').classList.toggle('primary', !tn);
  tb.textContent = tn ? `今日の復習（復習 ${tq.review.length}・新規 ${tq.add.length}）` : `今日の分は完了 ✓${tq.tomorrow ? `（明日 ${tq.tomorrow} 語）` : ''}`;
  tb.onclick = () => { const q = todayQueue(curDeck().words), all = shuffle([...q.review, ...q.add]); start(settings.count ? all.slice(0, settings.count) : all); };
  const wb = $('#weakBtn'), wn = Math.min(weak.length, CONFIG.weakMax);
  wb.hidden = !wn; wb.textContent = `振り返り ${wn} 語を集中練習`;
  wb.onclick = () => start(shuffle(weak.slice(0, CONFIG.weakMax)));
  for (const k of Object.keys(CHIPS)) {
    const b = $('#chips [data-key="' + k + '"]'); if (!b) continue;
    b.textContent = CHIPS[k](); b.setAttribute('aria-label', `${CHIP_NAME[k]}：${CHIPS[k]()}（押すと切り替え）`);
  }
}
// 設定チップ。📊・⚙ の前に並べる
for (const k of Object.keys(CHIPS)) {
  const b = document.createElement('button'); b.className = 'chip'; b.dataset.key = k;
  b.onclick = () => {
    const opts = CONFIG.options[k], i = opts.findIndex(([v]) => v === settings[k]);
    settings[k] = opts[(i + 1) % opts.length][0]; store.set('settings', settings); renderHome();
  };
  $('#chips').insertBefore(b, $('#statsBtn'));
}
$('#settingsBtn').onclick = () => $('#settingsDlg').showModal();
document.querySelectorAll('dialog [data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
// ダイアログの外（背景）を押したら閉じる
document.querySelectorAll('dialog.sheet').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
// 設定ボタンは CONFIG.options から作る。押したボタンの値は型を保ったまま settings に入れる
document.querySelectorAll('.seg').forEach(seg => {
  const key = seg.dataset.key;
  for (const [v, label] of CONFIG.options[key]) {
    const b = document.createElement('button'); b.dataset.val = String(v); b.textContent = label;
    b.addEventListener('click', () => { settings[key] = v; store.set('settings', settings); renderHome(); });
    seg.appendChild(b);
  }
});
const startNew = () => start(sample(active(deck()), settings.count));
$('#startBtn').onclick = startNew;
$('#resetBtn').onclick = () => { if (confirm('学習記録（正誤履歴と毎日の記録）をすべて消去しますか？')) { stats = {}; saveStats(); daily = {}; store.set('daily', daily); renderHome(); } };

/* ---------- quiz ---------- */
let Q = null;
const gloss = m => m.split(/[、，,;；/／]/).map(s => s.trim()).filter(Boolean);
function makeQ(it, dir, d) {
  const others = d.filter(x => x.m !== it.m && x.w !== it.w);
  // 語義が 1 つでも重なる語（「発表する」と「発表する、提示する」）は正解が 2 つに見えるので、
  // 同じ品詞で重ならない語 → 重ならない語 → 残り、の順に選ぶ
  const g = new Set(gloss(it.m)), apart = others.filter(x => !gloss(x.m).some(s => g.has(s)));
  const label = x => dir === 'e2j' ? x.m : x.w;
  const seen = new Set([label(it)]), picks = [];
  for (const pool of [it.p ? apart.filter(x => x.p === it.p) : [], apart, others])
    for (const x of shuffle(pool.slice())) { if (picks.length === 3) break; if (seen.has(label(x))) continue; seen.add(label(x)); picks.push(x); }
  const opts = shuffle([it, ...picks]);
  return {it, dir, opts, ans: opts.indexOf(it), label};
}
function start(items) {
  if (!items.length) return;
  // items は出題の列（{it, dir} のカード）。間違えた語を途中に差し込むので、re[i] で出し直しかどうかを持つ。base は最初の問題数
  Q = {deck: curDeck().id, items, re: items.map(() => false), base: items.length, again: new Map(), relearned: 0, i:0, ok:0, missed:[], flagged:[], times:[], streak:0, best:0, locked:false, raf:0, to:0};
  show('quiz'); render();
}
// keep を渡すと同じ選択肢の並びで出し直す（取り消したとき）
function render(keep) {
  const {it, dir} = Q.items[Q.i], re = Q.re[Q.i];
  let q = keep || makeQ(it, dir, deck());
  // 出し直しでは、前に出したときと選択肢の並びを変える
  for (let n = 0; !keep && re && n < 5 && q.opts.map(q.label).join() === Q.again.get(it).order; n++) q = makeQ(it, dir, deck());
  Q.q = q; Q.locked = false;
  const nth = Q.re.slice(0, Q.i + 1).filter(x => !x).length;
  $('#counter').textContent = re ? 'もう一度' : `${nth} / ${Q.base}`;
  $('#prog').style.width = (Q.i / Q.items.length * 100) + '%';
  $('#qdir').textContent = (re ? 'もう一度：' : '') + (q.dir === 'e2j' ? '意味は？' : '英語では？');
  const p = $('#prompt'); p.textContent = q.dir === 'e2j' ? it.w : it.m; p.className = 'prompt ' + (q.dir === 'e2j' ? 'en' : 'ja');
  p.lang = q.dir === 'e2j' ? 'en' : 'ja'; // 読み上げ機能が英単語を英語の発音で読むように
  $('#pos').textContent = it.p ? (POS[it.p] || it.p) : '';
  const box = $('#choices'); box.innerHTML = '';
  q.opts.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'choice';
    b.innerHTML = `<span class="num">${i + 1}</span><span></span>`;
    b.lastChild.textContent = q.label(o); if (q.dir === 'j2e') b.lastChild.lang = 'en';
    b.addEventListener('click', () => answer(i));
    box.appendChild(b);
  });
  $('#tapNext').hidden = true; $('#undoBox').hidden = true; $('#example').hidden = true;
  Q.unsure = false; setUnsure(); $('#outBtn').hidden = true;
  $('#qcard').classList.remove('ok', 'ng');
  $('#streak').textContent = Q.streak >= CONFIG.streakShow ? `🔥 ${Q.streak}連続` : '';
  $('#score').textContent = `正解 ${Q.ok}`;
  $('#speakBtn').hidden = !canSpeak || q.dir !== 'e2j';
  $('#announce').textContent = '';
  // 前の問題で押したボタンからフォーカスを外し、問題のカードへ移す（読み上げ機能が問題から読む）
  $('#qcard').focus({preventScroll: true});
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
  const {it, ans, dir} = Q.q, ok = i === ans, k = sKey(it, dir), card = Q.items[Q.i], ms = performance.now() - Q.qt0;
  // 押して間違えたときだけ、回答前の状態を取っておいて取り消せるようにする（押し間違い対策）
  Q.undo = ok || i < 0 ? null : {k, s: stats[k] ? {...stats[k]} : null, ok: Q.ok, streak: Q.streak, best: Q.best, missed: Q.missed.slice(), times: Q.times.length,
    items: Q.items.slice(), re: Q.re.slice(), again: new Map([...Q.again].map(([w, a]) => [w, {...a}])), relearned: Q.relearned, flagged: Q.flagged.slice()};
  const re = Q.re[Q.i];
  [...$('#choices').children].forEach((b, j) => {
    b.disabled = true;
    b.classList.add(j === ans ? 'ok' : j === i ? 'ng' : 'dim');
  });
  if (re) { // 出し直しの回答は、記録・スコア・回答時間に数えない（同じ回の中で覚えた答えで水増ししない）。自信なしの印だけは付ける
    Q.relearned++;
    if (Q.unsure && stats[k]) { markReview(stats[k], ok, R_UNSURE); saveStats([k]); }
    Q.slowNote = false;
  } else {
    Q.times.push(ms);
    const isNew = !stats[k], s = stats[k] || (stats[k] = {c:0, w:0});
    const slow = ok && !Q.unsure && isSlow(ms), add = (Q.unsure ? R_UNSURE : 0) | (slow ? R_SLOW : 0);
    schedule(s, ok, isNew, ok && !!add);
    markReview(s, ok, add);
    if (ok) s.a = Math.round(s.a ? s.a * 0.7 + ms * 0.3 : ms); // 正解時間の平均（直近ほど重く）
    if (add && !Q.flagged.some(x => x.card.it === it)) Q.flagged.push({card, why: slow ? '迷った' : '自信なし'});
    Q.slowNote = slow;
    if (ok) { s.c++; Q.ok++; Q.streak++; Q.best = Math.max(Q.best, Q.streak); }
    else { s.w++; Q.streak = 0; if (!Q.missed.some(x => x.it === it)) Q.missed.push(card); }
    s.t = Date.now(); saveStats([k]);
    if (Q.undo) Q.undo.day = logDay(Q.deck, ok, ms);
    else logDay(Q.deck, ok, ms);
  }
  if (!ok) relearnLater(card);
  $('#qcard').classList.add(ok ? 'ok' : 'ng');
  $('#announce').textContent = ok ? '正解' : `${i < 0 ? '時間切れ' : '不正解'}。正解は ${Q.q.label(it)}`;
  if (Q.slowNote) $('#announce').textContent += '。時間がかかったので振り返りに入れました';
  $('#score').textContent = `正解 ${Q.ok}`;
  if (settings.speak && dir === 'j2e') speak(it.w);
  $('#undoBox').hidden = !Q.undo;
  Q.answeredOk = ok; setOut();
  // 例文を出したときは読み終わるまで待つ。出さないときは今までどおり自動で次へ
  if (showExample(it, ok, stats[k])) $('#tapNext').hidden = false;
  else if (ok) Q.to = setTimeout(next, CONFIG.nextDelayOk);
  else { $('#tapNext').hidden = false; Q.to = setTimeout(next, CONFIG.nextDelayNg); }
}
// 例文の英文を、強調する語形（b。無ければ単語そのもの）を <mark> にして el に入れる。見つからなければそのまま
function fillExample(el, it) {
  const t = it.e, b = it.b || it.w;
  // 語の途中（accept と acceptable）に当てないよう、まず語の切れ目で探す
  const m = t.match(new RegExp('\\b' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
  const at = m ? m.index : t.indexOf(b);
  el.textContent = '';
  if (at < 0) { el.textContent = t; return; }
  const mk = document.createElement('mark'); mk.textContent = t.slice(at, at + b.length);
  el.append(t.slice(0, at), mk, t.slice(at + b.length));
}
// 回答後の例文。設定と正誤で出すか決め、出したら true。リーチの語は正解でも出す（覚え方を変えるきっかけ）
function showExample(it, ok, s) {
  const on = it.e && (settings.example === 'all' || (settings.example === 'ng' && (!ok || (!!s && isLeech(s)))));
  $('#example').hidden = !on;
  if (!on) return false;
  fillExample($('#exEn'), it); $('#exJa').textContent = it.j;
  $('#exSpeak').hidden = !canSpeak;
  $('#announce').textContent += `。例文：${it.e}${it.j ? '　' + it.j : ''}`;
  return true;
}
// 間違えた語を gap 問後に差し込む。残りが gap 問より少なければ最後に出す
function relearnLater(card) {
  const a = Q.again.get(card.it) || {n: 0};
  if (a.n >= CONFIG.relearn.max) return;
  a.n++; a.order = Q.q.opts.map(Q.q.label).join(); Q.again.set(card.it, a);
  const at = Math.min(Q.i + 1 + CONFIG.relearn.gap, Q.items.length);
  Q.items.splice(at, 0, card); Q.re.splice(at, 0, true);
}
// 直前の回答（間違えたもの）を取り消し、記録とスコアを回答前に戻して同じ問題を出し直す
function undo() {
  if (!Q || !Q.locked || !Q.undo) return;
  const u = Q.undo; Q.undo = null; clearTimeout(Q.to);
  if (u.s) stats[u.k] = u.s; else delete stats[u.k];
  saveStats([u.k]);
  if (u.day) logDay(u.day.deck, u.day.ok, u.day.ms, -1);
  Object.assign(Q, {ok: u.ok, streak: u.streak, best: u.best, missed: u.missed, items: u.items, re: u.re, again: u.again, relearned: u.relearned, flagged: u.flagged}); Q.times.length = u.times;
  render(Q.q);
  $('#announce').textContent = '取り消しました。もう一度答えてください';
}
function next() {
  if (!Q) return;
  clearTimeout(Q.to); Q.i++;
  if (Q.i >= Q.items.length) finish(); else render();
}
function quit() {
  if (!Q) return;
  clearTimeout(Q.to); cancelAnimationFrame(Q.raf);
  const done = Q.times.length; // 答えた最初の問題の数（出し直しは数えない）
  if (!done) { Q = null; renderHome(); show('home'); return; }
  Q.base = done; finish();
}
function finish() {
  // Q は「間違えた単語だけもう一度」のために残すので、以後の回答・タイマー再開を受け付けない
  Q.locked = true; cancelAnimationFrame(Q.raf); clearTimeout(Q.to);
  const n = Q.base;
  const avg = Q.times.reduce((a, b) => a + b, 0) / Q.times.length / 1000;
  $('#rScore').textContent = `${Q.ok} / ${n}`;
  $('#rAcc').textContent = Math.round(Q.ok / n * 100) + '%';
  $('#rAvg').textContent = avg.toFixed(1) + '秒';
  $('#rBest').textContent = Q.best;
  $('#rRelearn').textContent = Q.relearned ? `間違えた語を ${Q.relearned} 問もう一度出しました（正答率には数えません）` : '';
  const ul = $('#missedList'); ul.innerHTML = '';
  for (const {it} of Q.missed) {
    const li = document.createElement('li');
    li.innerHTML = '<b></b><span></span>';
    li.firstChild.textContent = it.w; li.firstChild.lang = 'en'; li.lastChild.textContent = it.m;
    if (it.e) {
      const ex = document.createElement('div'); ex.className = 'ex';
      ex.innerHTML = '<span class="ex-en" lang="en"></span><span class="ex-ja"></span>';
      fillExample(ex.firstChild, it); ex.lastChild.textContent = it.j;
      li.appendChild(ex);
    }
    if (canSpeak) { li.style.cursor = 'pointer'; li.onclick = () => speak(it.w); }
    ul.appendChild(li);
  }
  $('#missedCard').hidden = !Q.missed.length;
  // 振り返りに入れた語（間違えた語は上に出ているので除く）
  const fl = Q.flagged.filter(x => !Q.missed.some(m => m.it === x.card.it)), rl = $('#reviewList'); rl.innerHTML = '';
  for (const {card: {it}, why} of fl) {
    const li = document.createElement('li'); li.innerHTML = '<b></b><span></span>';
    li.firstChild.textContent = it.w; li.firstChild.lang = 'en'; li.lastChild.textContent = `${it.m}（${why}）`;
    rl.appendChild(li);
  }
  $('#reviewCard').hidden = !fl.length;
  $('#retryMissed').hidden = !Q.missed.length;
  show('result');
}
$('#quiz').addEventListener('click', e => {
  if (e.target.closest('#quitBtn, #speakBtn, #undoBtn, #exSpeak, #unsureBtn, #outBtn')) return;
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
$('#undoBtn').onclick = undo;
// 「自信なし」。答える前に押しておくか、答えた後（次へ進む前）に押す。答えた後は記録の印をその場で付け外しする
function setUnsure() { const b = $('#unsureBtn'); b.setAttribute('aria-pressed', Q.unsure); b.classList.toggle('on', Q.unsure); }
function toggleUnsure() {
  if (!Q || $('#quiz').hidden) return;
  Q.unsure = !Q.unsure; setUnsure();
  if (!Q.locked) return;
  const k = sKey(Q.q.it, Q.q.dir), s = stats[k]; if (!s) return;
  if (Q.unsure) markReview(s, true, R_UNSURE);
  else { s.r = (s.r || 0) & ~R_UNSURE; if (!s.r) { delete s.r; delete s.k; } }
  const has = Q.flagged.findIndex(x => x.card.it === Q.q.it && x.why === '自信なし');
  if (Q.unsure && has < 0) Q.flagged.push({card: Q.items[Q.i], why: '自信なし'});
  if (!Q.unsure && has >= 0) Q.flagged.splice(has, 1);
  saveStats([k]);
  clearTimeout(Q.to); $('#tapNext').hidden = false; // 押したら自動で進まず、タップ / Enter を待つ
}
$('#unsureBtn').onclick = toggleUnsure;
// 外すと 4 択を作れなくなるデッキがあれば外さない（その語を含み、今は使えるデッキで、残りが 4 語を割る）
const canOut = it => allDecks().every(d => !usable(d) || !d.words.some(x => wKey(x) === wKey(it)) || active(d.words).length > 4);
// 「出題しない」。正解した後に出し、押すとその語を外す（もう一度押すと戻す）。押したら自動で進まない
function setOut() {
  const b = $('#outBtn'), on = isOut(Q.q.it);
  b.hidden = !on && !(Q.answeredOk && canOut(Q.q.it)); b.setAttribute('aria-pressed', on); b.classList.toggle('on', on);
}
function toggleOut() {
  if (!Q || $('#quiz').hidden || !Q.locked || $('#outBtn').hidden) return;
  const it = Q.q.it, k = wKey(it);
  if (suspended.has(k)) suspended.delete(k);
  else {
    suspended.add(k);
    // このクイズで後に出す予定の出し直しも取り除く
    for (let j = Q.items.length - 1; j > Q.i; j--) if (Q.re[j] && Q.items[j].it === it) { Q.items.splice(j, 1); Q.re.splice(j, 1); }
  }
  saveSuspended(); setOut();
  $('#announce').textContent = isOut(it) ? `${it.w} を出題しない語にしました。ホームの「出題しない語」から戻せます` : `${it.w} を出題に戻しました`;
  clearTimeout(Q.to); $('#tapNext').hidden = false;
}
$('#outBtn').onclick = toggleOut;
// 出題しない語の一覧（今のデッキ）。ここから出題に戻す
function renderSuspended() {
  const ul = $('#suspList'), list = curDeck().words.filter(isOut); ul.innerHTML = '';
  for (const it of list) {
    const li = document.createElement('li'); li.innerHTML = '<b lang="en"></b><span></span><button class="btn small">戻す</button>';
    li.children[0].textContent = it.w; li.children[1].textContent = it.m;
    li.children[2].setAttribute('aria-label', it.w + 'を出題に戻す');
    li.children[2].onclick = () => { suspended.delete(wKey(it)); saveSuspended(); renderHome(); if (!renderSuspended()) $('#suspDlg').close(); };
    ul.appendChild(li);
  }
  $('#suspTitle').textContent = `出題しない語（${list.length}）`;
  return list.length;
}
$('#suspBtn').onclick = () => { renderSuspended(); $('#suspDlg').showModal(); };
$('#speakBtn').onclick = () => Q && speak(Q.q.it.w);
$('#exSpeak').onclick = () => Q && speak(Q.q.it.e);
$('#retryMissed').onclick = () => { if (Q) start(shuffle(Q.missed.slice())); };
$('#againBtn').onclick = startNew;
$('#homeBtn').onclick = () => { renderHome(); show('home'); };

/* ---------- 学習統計（#11） ---------- */
// その日・そのデッキの記録に 1 問足す（sign = -1 で取り消す）。ほかのタブの分を消さないよう、最新の保存内容に足して書く。
// 足した値を返す（取り消し用）
function logDay(deck, ok, ms, sign = 1) {
  let base = null;
  try { const v = JSON.parse(localStorage.getItem(PREFIX + 'daily') || '{}'); base = CHECK.daily(v).value; } catch (e) {}
  daily = base || daily;
  const t = today(), d = daily[t] = daily[t] || {}, e = d[deck] = d[deck] || {n: 0, c: 0, ms: 0};
  ms = Math.round(Math.min(ms, CONFIG.stats.msCap));
  e.n = Math.max(0, e.n + sign); e.c = Math.max(0, Math.min(e.n, e.c + (ok ? sign : 0))); e.ms = Math.max(0, e.ms + sign * ms);
  if (!e.n) delete d[deck];
  if (!Object.keys(d).length) delete daily[t];
  store.set('daily', daily);
  return {deck, ok, ms};
}
// 日ごとの合計（全デッキ）
const dayTotal = d => Object.values(daily[d] || {}).reduce((a, e) => ({n: a.n + e.n, c: a.c + e.c, ms: a.ms + e.ms}), {n: 0, c: 0, ms: 0});
// 連続学習日数。今日まだ答えていなくても、昨日まで続いていれば途切れていない（今日のうちに答えれば続く）
function streaks() {
  const days = Object.keys(daily).map(Number).filter(d => dayTotal(d).n).sort((a, b) => a - b), t = today();
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev === d - 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const has = new Set(days); let cur = 0;
  for (let d = has.has(t) ? t : t - 1; has.has(d); d--) cur++;
  return {cur, best, total: days.length};
}
// 通し番号の日から日付（4 時区切りの日なので、その日の正午で作る）
const dayDate = d => new Date(d * 86400000 + 12 * 3600000 + new Date(d * 86400000).getTimezoneOffset() * 60000);
const WD = '日月火水木金土';
const mdw = d => { const x = dayDate(d); return `${x.getMonth() + 1}/${x.getDate()}（${WD[x.getDay()]}）`; };
const minutes = ms => ms >= 60000 ? Math.round(ms / 60000) + '分' : ms ? '1分未満' : '0分';
// 今後 days 日の復習予定（今のデッキ・今の出題方向。1 語につきいちばん早い日。予定日を過ぎた語は今日に数える）
function forecast(words, days) {
  const t = today(), out = Array(days).fill(0);
  for (const it of active(words)) {
    const ds = dirsFor().map(dir => stats[sKey(it, dir)]).filter(Boolean).map(s => srsOf(s).d);
    if (!ds.length) continue;
    const i = Math.max(Math.min(...ds), t) - t; if (i < days) out[i]++;
  }
  return out;
}
function renderStats() {
  const C = CONFIG.stats, t = today(), st = streaks(), td = dayTotal(t);
  $('#sStreak').textContent = st.cur + '日'; $('#sToday').textContent = td.n + '問'; $('#sBest').textContent = st.best + '日';
  $('#sNote').textContent = st.total ? `今日の学習時間 ${minutes(td.ms)} · 学習した日 ${st.total}日` : 'まだ記録がありません。答えると、その日の回答数がここに並びます。';
  // ヒートマップ：列が週（月曜はじまり）、行が曜日。右端の列が今週
  const hm = $('#heat'); hm.innerHTML = '';
  const wd = (dayDate(t).getDay() + 6) % 7, start = t - wd - (C.weeks - 1) * 7;
  hm.style.gridTemplateColumns = `repeat(${C.weeks}, 1fr)`;
  for (let d = start; d < start + C.weeks * 7; d++) {
    const b = document.createElement('button'); b.className = 'cell';
    if (d > t) { b.disabled = true; b.classList.add('future'); b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); hm.appendChild(b); continue; }
    const e = dayTotal(d), lv = C.levels.filter(x => e.n >= x).length;
    b.dataset.lv = lv; if (d === t) b.classList.add('today');
    const label = `${mdw(d)} ${e.n}問${e.n ? ` · 正答率 ${Math.round(e.c / e.n * 100)}% · ${minutes(e.ms)}` : ''}`;
    b.setAttribute('aria-label', label); b.title = label;
    b.onclick = () => { $('#heatInfo').textContent = label; hm.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
    hm.appendChild(b);
  }
  $('#heatInfo').textContent = `今日 ${mdw(t)} ${td.n}問（マスを押すとその日の記録）`;
  // 今後の復習予定
  const fc = forecast(curDeck().words, C.forecastDays), mx = Math.max(1, ...fc), fb = $('#fcBars'); fb.innerHTML = '';
  $('#fcTitle').textContent = `今後 ${C.forecastDays} 日の復習予定（${curDeck().name}）`;
  fc.forEach((n, i) => {
    const col = document.createElement('div'); col.className = 'col';
    col.innerHTML = '<span class="v"></span><span class="b"><i></i></span><span class="l"></span>';
    col.querySelector('.v').textContent = n;
    col.querySelector('i').style.height = (n / mx * 100) + '%';
    col.querySelector('.l').textContent = i === 0 ? '今日' : i === 1 ? '明日' : WD[dayDate(t + i).getDay()];
    col.setAttribute('aria-label', `${i === 0 ? '今日' : mdw(t + i)} ${n}語`); col.setAttribute('role', 'img');
    fb.appendChild(col);
  });
  // デッキ別の正答率の推移（週ごと。直近 trendWeeks 週に答えたデッキだけ。今のデッキを先頭に）
  const tw = $('#trend'); tw.innerHTML = '';
  const w0 = t - wd - (C.trendWeeks - 1) * 7, names = new Map(allDecks().map(d => [d.id, d.name])), rows = new Map();
  for (const [d, decks] of Object.entries(daily)) {
    const wi = Math.floor((d - w0) / 7); if (wi < 0 || wi >= C.trendWeeks) continue;
    for (const [id, e] of Object.entries(decks)) {
      if (!rows.has(id)) rows.set(id, Array.from({length: C.trendWeeks}, () => ({n: 0, c: 0})));
      const r = rows.get(id)[wi]; r.n += e.n; r.c += e.c;
    }
  }
  const ids = [...rows.keys()].sort((a, b) => (b === curDeck().id) - (a === curDeck().id));
  for (const id of ids) {
    const weeks = rows.get(id), last = [...weeks].reverse().find(x => x.n);
    const row = document.createElement('div'); row.className = 'trow';
    row.innerHTML = '<span class="tn"></span><span class="tb"></span><span class="tv"></span>';
    row.querySelector('.tn').textContent = names.get(id) || '削除したデッキ';
    row.querySelector('.tv').textContent = last ? Math.round(last.c / last.n * 100) + '%' : '';
    weeks.forEach((x, i) => {
      const bar = document.createElement('i'); const from = dayDate(w0 + i * 7);
      const label = `${from.getMonth() + 1}/${from.getDate()}の週 ${x.n ? `正答率 ${Math.round(x.c / x.n * 100)}%（${x.n}問）` : '記録なし'}`;
      bar.title = label; bar.setAttribute('aria-label', label); bar.setAttribute('role', 'img');
      if (x.n) bar.style.height = Math.max(4, x.c / x.n * 100) + '%'; else bar.className = 'none';
      row.querySelector('.tb').appendChild(bar);
    });
    tw.appendChild(row);
  }
  $('#trendCard').hidden = !ids.length;
}
$('#statsBtn').onclick = () => { renderStats(); show('stats'); };
$('#statsHome').onclick = () => { renderHome(); show('home'); };

/* ---------- editor ---------- */
const unquote = s => /^"[\s\S]*"$/.test(s) ? s.slice(1, -1).replace(/""/g, '"') : s;
// 1 行を [単語, 意味, 意味以降の生の文字列, 区切り文字] に分ける。タブがあればタブで、無ければ最初の , か | で区切る。
// 先頭が " の CSV フィールドは閉じ " まで読み、"" を " に戻す（書き出しとの往復を保つ）
function splitPair(line) {
  let w, rest, sep;
  if (line[0] === '"') {
    let i = 1, s = '';
    for (; i < line.length; i++) {
      if (line[i] !== '"') s += line[i];
      else if (line[i + 1] === '"') { s += '"'; i++; }
      else break;
    }
    const m = line.slice(i + 1).match(/^\s*([\t,|])\s*(.*)$/);
    if (i >= line.length || !m) return null;
    w = s; sep = m[1]; rest = m[2];
  } else {
    const m = line.match(line.includes('\t') ? /^(.+?)\s*(\t)\s*(.+)$/ : /^(.+?)\s*([,|])\s*(.+)$/);
    if (!m) return null;
    w = m[1]; sep = m[2]; rest = m[3];
  }
  return [w.trim(), unquote(rest.trim()).trim(), rest.trim(), sep];
}
const csvField = s => /[",|\t\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
const toLine = x => [x.w, x.m, ...(x.e ? [x.e, x.j || ''] : [])].map(csvField).join(',');
// 区切り文字 sep で 1 行を列に分ける（" で囲んだ列の中の区切りと "" を扱う）
function splitFields(line, sep) {
  const out = []; let f = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c !== '"') f += c; else if (line[i + 1] === '"') { f += '"'; i++; } else q = false; }
    else if (c === '"' && !f.trim()) { f = ''; q = true; }
    else if (c === sep) { out.push(f.trim()); f = ''; }
    else f += c;
  }
  out.push(f.trim());
  return out;
}
// 意味のあとの 3〜4 列目は例文と和訳。3 列目が英文に見えないときは、今までどおり意味の続きとして読む
// （「run,走る,経営する」を「意味＝走る、例文＝経営する」にしない）
const looksLikeSentence = s => /[A-Za-z]+[^A-Za-z]+[A-Za-z]+/.test(s) && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(s);
function splitExample(rest, sep) {
  const f = splitFields(rest, sep);
  return f.length >= 2 && f[0] && looksLikeSentence(f[1]) ? {m: f[0], e: f[1], j: f.slice(2).join(sep)} : null;
}
const isHeader =(w, m) => /^(word|english|en|term|英単語|単語|英語)$/i.test(w) && /^(meaning|japanese|ja|definition|意味|日本語|訳)$/i.test(m);
// Anki の「ノートをプレーンテキストで書き出し」（#10）。先頭の見出し（#separator:tab・#html:true・#deck column:3 など）を読む。
// #columns:単語,意味,-,例文,和訳 で列の割り当てを指定できる（- は読まない列。Anki 以外の表にも使える）
const SEPS = {tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ', colon: ':'};
const COLS = {word: 'w', '単語': 'w', '英単語': 'w', meaning: 'm', '意味': 'm', example: 'e', '例文': 'e', translation: 'j', '和訳': 'j'};
const ENT = {nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
const decodeEnt = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => e[0] !== '#' ? (ENT[e.toLowerCase()] || all)
  : String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)));
// 欄の HTML（#html:true のときだけ。false のとき Anki は文字だけを書き出すので、<tag> のような語はそのまま）と音声の参照を取り除く
const cleanField = (s, html) => (html ? decodeEnt(s.replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ').replace(/<[^>]*>/g, '')) : s)
  .replace(/\[sound:[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
// sep で区切った行と列にする。" で囲んだ列の中の区切り・改行と "" を扱う（Anki は改行やタブを含む欄を囲む）
function splitRecords(text, sep) {
  const recs = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c !== '"') f += c; else if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
    else if (c === '"' && !f) q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); recs.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); recs.push(row); }
  return recs;
}
function parseTable(body, head, add) {
  const sep = SEPS[(head.separator || '').toLowerCase()] || (head.separator && head.separator.length === 1 ? head.separator : '\t');
  const html = head.html === 'true';
  // ノートタイプ・デッキ・タグ・GUID の列（「#deck column:3」は 1 から数える）は単語・意味として読まない
  const skip = new Set(Object.keys(head).filter(k => / column$/.test(k)).map(k => +head[k] - 1));
  const cols = head.columns ? head.columns.split(/[,、\s]+/).filter(Boolean).map(x => COLS[x.toLowerCase()] || null) : null;
  for (const rec of splitRecords(body, sep)) {
    const f = rec.filter((_, i) => !skip.has(i)).map(x => cleanField(x, html));
    if (!f.some(Boolean)) continue;
    let x = {};
    if (cols) cols.forEach((k, i) => { if (k && f[i] && !x[k]) x[k] = f[i]; });
    // 既定は 1 列目＝単語・2 列目＝意味。3 列目が英文なら例文、4 列目を和訳にする。ほかの列（読み・メモなど）は読まない
    else x = {w: f[0], m: f[1], ...(f[2] && looksLikeSentence(f[2]) ? {e: f[2], j: f[3] || ''} : {})};
    add(x.w, x.m, x.e ? x : null);
  }
}
function parseList(text) {
  const out = [], seen = new Set();
  const add = (w, m, ex) => {
    if (!w || !m || isHeader(w, m)) return;
    const k = w + '\u0001' + m; if (seen.has(k)) return; seen.add(k);
    out.push(ex ? {w, p:'', m, e: ex.e, j: ex.j || '', b: ''} : {w, p:'', m});
  };
  // 先頭の見出しに Anki の書き出しの印か #columns: があれば、表として読む
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), head = {}; let n = 0;
  for (; n < lines.length && (lines[n].startsWith('#') || !lines[n].trim()); n++) {
    const m = lines[n].match(/^#\s*([^:]+?)\s*:\s*(.*?)\s*$/); if (m) head[m[1].toLowerCase()] = m[2];
  }
  if (head.separator || head.html || head.columns) { parseTable(lines.slice(n).join('\n'), head, add); return out; }
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const pair = splitPair(line);
    if (!pair) continue;
    const [w, m1, rest, sep] = pair, ex = splitExample(rest, sep);
    add(w, ex ? ex.m : m1, ex);
  }
  return out;
}
// Anki の書き出し・#columns: のある表か（ファイルを読んだとき、そのままではなく「単語,意味」の行に直して入れる）
const isTable = text => /^\uFEFF?(#[^\n]*\n|\s*\n)*#\s*(separator|html|columns)\s*:/i.test(text);
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
  r.onload = () => {
    const t = $('#customText'), raw = String(r.result).replace(/^\uFEFF/, '');
    if (!$('#deckName').value.trim()) $('#deckName').value = f.name.replace(/\.[^.]+$/, '');
    // Anki の書き出しは HTML などを取り除いた「単語,意味」の行に直して入れる（中身を確かめてから保存できる）
    const text = isTable(raw) ? parseList(raw).map(toLine).join('\n') : raw;
    t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + text; updCount();
  };
  r.readAsText(f); e.target.value = '';
});
// 記録のキーは「単語＋意味」なので、意味だけ直すと記録が外れる。
// 単語が一意に対応するときだけ、旧キーの記録を新キーへ引き継ぐ
function carryStats(deckId, oldWords, newWords) {
  const newKeys = new Set(newWords.map(wKey)), count = (list, w) => list.filter(x => x.w === w).length;
  const usedElsewhere = new Set(allDecks().filter(x => x.id !== deckId).flatMap(x => x.words.map(wKey)));
  const changed = [];
  for (const it of newWords) {
    if (count(newWords, it.w) !== 1 || count(oldWords, it.w) !== 1) continue;
    const old = oldWords.find(x => x.w === it.w);
    if (newKeys.has(wKey(old))) continue;
    for (const dir of DIRS) { // 方向ごとに引き継ぐ
      const k = sKey(it, dir), from = sKey(old, dir);
      if (stats[k] || !stats[from]) continue;
      stats[k] = {...stats[from]}; changed.push(k);
      if (!usedElsewhere.has(wKey(old))) { delete stats[from]; changed.push(from); } // 他デッキと共有している記録は残す
    }
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
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { undo(); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') { toggleUnsure(); e.preventDefault(); }
    else if (e.key === 'x' || e.key === 'X') { toggleOut(); e.preventDefault(); }
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
  else if (k === 'suspended') suspended = new Set(v || []);
  else if (k === 'daily') daily = v || {};
  else Object.assign(settings, CONFIG.defaults, v || {});
  if (!$('#home').hidden) renderHome();
});
$('#saveErrClose').onclick = () => { $('#saveErrBar').hidden = true; };

/* ---------- 学習記録の書き出し・読み込み（バックアップ） ---------- */
// 記録はこの端末のブラウザにしか無い（iPhone のホーム画面アプリは Safari とも別）。逃げ道はファイルだけ
const BACKUP_FORMAT = 2; // 保存形式を変えたら上げ、readBackup で古い版も読めるようにする（2：記録を出題方向ごとに分けた）
const ymd = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('');
async function exportBackup() {
  const data = {app: 'word-sprint', format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), settings, stats, decks: customDecks, suspended: [...suspended], daily};
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
// 読み込んだファイルを検証して {settings, stats, decks, suspended, daily, exportedAt} にする（出題しない語・日ごとの記録は無くてもよい）。Word Sprint の記録でなければ null
function readBackup(text) {
  let v; try { v = JSON.parse(text); } catch (e) { return null; }
  if (!isObj(v) || v.app !== 'word-sprint' || !(v.format >= 1 && v.format <= BACKUP_FORMAT)) return null;
  const st = CHECK.stats(v.stats).value;
  return {settings: CHECK.settings(v.settings).value, stats: v.format === 1 ? splitStats(st) : st, decks: CHECK.decks(v.decks).value,
    suspended: CHECK.suspended(v.suspended || []).value, daily: CHECK.daily(v.daily || {}).value, exportedAt: v.exportedAt};
}
// 統合：単語ごとに回答数の多い方（同数なら新しい方）を残す。自作デッキは足し、中身が同じものは重複させない。出題しない語は合わせる
function mergeBackup(b) {
  const merged = {...stats};
  for (const [k, s] of Object.entries(b.stats)) {
    const cur = merged[k], n = s.c + s.w, m = cur ? cur.c + cur.w : -1;
    if (n > m || (n === m && (s.t || 0) > (cur.t || 0))) merged[k] = s;
  }
  stats = merged;
  for (const k of b.suspended) suspended.add(k);
  // 日ごとの記録は日・デッキごとに回答数の多い方（同じ端末の古い書き出しと足して二重にしない）
  for (const [d, decks] of Object.entries(b.daily)) for (const [id, e] of Object.entries(decks)) {
    const cur = (daily[d] = daily[d] || {})[id]; if (!cur || e.n > cur.n) daily[d][id] = e;
  }
  const sameWords = (a, d) => JSON.stringify(a.words.map(toLine)) === JSON.stringify(d.words.map(toLine));
  b.decks.forEach((d, i) => {
    if (customDecks.some(x => sameWords(x, d))) return;
    const clash = customDecks.some(x => x.id === d.id);
    customDecks.push(clash ? {...d, id: 'c' + Date.now().toString(36) + i, name: d.name + '（読み込み）'} : d);
  });
}
function replaceBackup(b) {
  stats = b.stats; customDecks = b.decks; suspended = new Set(b.suspended); daily = b.daily;
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
    $('#importSummary').textContent = `${isNaN(at) ? '日時不明' : new Date(at).toLocaleString('ja-JP')} に書き出した記録です（単語 ${new Set(Object.keys(pendingImport.stats).map(k => k.split('\u0001', 2).join('\u0001'))).size} 語分・自作デッキ ${pendingImport.decks.length} 個）。`;
    $('#importDlg').showModal();
  });
});
function applyImport(mode) {
  if (!pendingImport) return;
  if (mode === 'replace' && !confirm('今の学習記録・自作デッキ・設定を、ファイルの内容で置き換えます。よろしいですか？')) return;
  (mode === 'merge' ? mergeBackup : replaceBackup)(pendingImport);
  moveStaleStats(); // 古い版で書き出したファイルには、意味の書き方を変える前の記録が入っている
  pendingImport = null; $('#importDlg').close();
  saveStats(); saveDecks(); saveSuspended(); store.set('daily', daily); store.set('settings', settings);
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
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'updated') { updateReady = true; reloadIfIdle(); } });
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', reloadIfIdle));
  document.addEventListener('visibilitychange', () => {
    const sw = navigator.serviceWorker.controller;
    if (!document.hidden && sw) sw.postMessage('check');
  });
}

if (!curDeck()) { // decks/ を置かずに index.html だけ持ち出したときなど
  $('#home').innerHTML = '<div class="card">単語データを読み込めませんでした。index.html と同じ場所に decks フォルダがあるか確認してください。</div>';
  return;
}
renderHome();
})();
