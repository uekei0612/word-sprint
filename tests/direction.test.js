// 学習記録を出題方向ごとに分ける（#3）：記録・ホームの集計・苦手・ミックス・v1 からの写し
const {P, P1, K, sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  const words = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'].map((w, i) => ({w, p: '', m: '意味' + i}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m])), W = Object.fromEntries(words.map(x => [x.m, x.w]));
  const load = async (prefix, values) => {
    await p.goto(INDEX);
    await p.evaluate((prefix, values) => { localStorage.clear(); for (const [k, v] of Object.entries(values)) localStorage.setItem(prefix + k, JSON.stringify(v)); }, prefix, values);
    await p.goto(INDEX); await sleep(100);
  };
  const stats = () => p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats') || '{}'), P);
  const setDir = async dir => { await p.evaluate((P, dir) => { const s = JSON.parse(localStorage.getItem(P + 'settings')); s.dir = dir; localStorage.setItem(P + 'settings', JSON.stringify(s)); }, P, dir); await p.goto(INDEX); await sleep(100); };
  const home = () => p.evaluate(() => ({st: document.querySelector('#curStats').textContent, weak: document.querySelector('#weakBtn').hidden ? '' : document.querySelector('#weakBtn').textContent}));
  const deck = [{id: 'c1', name: 'T', words}];

  // 1. 英→日はすべて定着、日→英は beta だけ誤答あり
  const seeded = {};
  for (const x of words) seeded[K(x.w, x.m, 'e2j')] = {c: 5, w: 0, t: 1};
  seeded[K('beta', M.beta, 'j2e')] = {c: 0, w: 3, t: 1};
  await load(P, {decks: deck, settings: {deck: 'c1', dir: 'e2j', count: 0}, stats: seeded});
  let h = await home();
  check('英→日：英→日の記録だけで集計する（全語が定着・苦手なし）', /出題 6\/6 · 定着 6 · 正答率 100%/.test(h.st) && !h.weak, JSON.stringify(h));
  await setDir('j2e'); h = await home();
  check('日→英：英→日の記録は数えない（出題 1・定着 0・苦手 1 語）', /出題 1\/6 · 定着 0 · 正答率 0%/.test(h.st) && h.weak === '振り返り 1 語を集中練習', JSON.stringify(h));
  await setDir('mix'); h = await home();
  check('ミックス：両方向で定着した語だけを定着に数える', /出題 6\/6 · 定着 0/.test(h.st) && h.weak === '振り返り 1 語を集中練習', JSON.stringify(h));
  check('デッキのタイルも今の方向で集計する', (await p.$eval('.deck.on .dm', e => e.textContent)) === '6語 · 定着 0');

  // 2. 日→英で答えると、日→英の記録だけが増える
  await setDir('j2e');
  await p.click('#startBtn'); await sleep(80);
  const q = await p.$eval('#prompt', e => e.textContent); const w = W[q];
  const right = await p.$$eval('.choice', (bs, w) => bs.findIndex(b => b.lastChild.textContent === w), w);
  await p.click(`.choice:nth-child(${right + 1})`); await sleep(80);
  let st = await stats();
  check('日→英で答えた記録は日→英のキーに入り、英→日の記録は変わらない',
    st[K(w, M[w], 'j2e')].c === (seeded[K(w, M[w], 'j2e')] || {c: 0}).c + 1 && JSON.stringify(st[K(w, M[w], 'e2j')]) === JSON.stringify(seeded[K(w, M[w], 'e2j')]), JSON.stringify([st[K(w, M[w], 'j2e')], st[K(w, M[w], 'e2j')]]));

  // 3. ミックスで全問：同じ語を両方向に出さず、答えた方向のキーに記録する
  await load(P, {decks: deck, settings: {deck: 'c1', dir: 'mix', count: 0}, stats: {}});
  await p.click('#startBtn'); await sleep(80);
  const asked = [];
  for (let i = 0; i < 6; i++) {
    const r = await p.evaluate(() => ({t: document.querySelector('#prompt').textContent, en: document.querySelector('#prompt').classList.contains('en')}));
    const word = r.en ? r.t : W[r.t]; asked.push([word, r.en ? 'e2j' : 'j2e']);
    const want = r.en ? M[word] : word;
    const j = await p.$$eval('.choice', (bs, t) => bs.findIndex(b => b.lastChild.textContent === t), want);
    await p.click(`.choice:nth-child(${j + 1})`); await sleep(450);
  }
  st = await stats();
  check('ミックス：1 回のクイズで同じ語は 1 回だけ（6 語で 6 問）', new Set(asked.map(a => a[0])).size === 6 && await p.$eval('#result', e => !e.hidden), JSON.stringify(asked));
  check('ミックス：出した方向のキーにだけ記録する', Object.keys(st).length === 6 && asked.every(([w, d]) => st[K(w, M[w], d)] && st[K(w, M[w], d)].c === 1), JSON.stringify(Object.keys(st)));

  // 4. 前の版（v1）の保存からの写し
  await load(P1, {decks: deck, settings: {deck: 'c1', dir: 'j2e', count: 0}, stats: {['alpha\u0001' + M.alpha]: {c: 2, w: 1, t: 7}}});
  st = await stats();
  check('v1 の記録は両方向に同じ記録として写る', ['e2j', 'j2e'].every(d => JSON.stringify(st[K('alpha', M.alpha, d)]) === JSON.stringify({c: 2, w: 1, t: 7})) && Object.keys(st).length === 2, JSON.stringify(st));
  check('v1 の設定・自作デッキも写り、v1 の保存はそのまま残る', (await p.$eval('#curName', e => e.textContent)) === 'T' && await p.evaluate(P1 => localStorage.getItem(P1 + 'stats').includes('alpha'), P1));
  await p.evaluate(P => localStorage.setItem(P + 'stats', JSON.stringify({})), P);
  await p.goto(INDEX); await sleep(100);
  check('写すのは一度だけ（v2 の記録を消した後に開き直しても、v1 から写し直さない）', JSON.stringify(await stats()) === '{}');

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
