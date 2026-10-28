// 学習統計（#11）：日ごとの記録（取り消し・出し直し・ほかのタブ）、4 時の日の区切り、連続日数、統計画面、バックアップとリセット
const {P, K, sleep, check, launch, fileUrl, run} = require('./lib');
const fs = require('fs'), os = require('os'), path = require('path');
const INDEX = fileUrl();
const DAY = 86400000;
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.setViewport({width: 390, height: 844});
  // 時計をずらす：sessionStorage の __off ミリ秒だけ Date.now と new Date() を進める
  await p.evaluateOnNewDocument(() => {
    const RD = Date, n = RD.now.bind(RD), off = () => +sessionStorage.getItem('__off') || 0;
    class D extends RD { constructor(...a) { if (a.length) super(...a); else super(n() + off()); } static now() { return n() + off(); } }
    window.Date = D;
  });
  const setOff = ms => p.evaluate(ms => sessionStorage.setItem('__off', ms), ms);
  const words = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'].map((w, i) => ({w, p: '', m: '意味' + i}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const load = async (values = {}, extra = {}) => {
    await p.goto(INDEX);
    await p.evaluate((P, words, values, extra) => { localStorage.clear();
      localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}]));
      localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, ...extra}));
      for (const [k, v] of Object.entries(values)) localStorage.setItem(P + k, JSON.stringify(v)); }, P, words, values, extra);
    await p.goto(INDEX); await sleep(100);
  };
  const day = () => p.evaluate(() => Math.floor((Date.now() - new Date(Date.now()).getTimezoneOffset() * 60000 - 4 * 3600000) / 86400000));
  const daily = () => p.evaluate(P => JSON.parse(localStorage.getItem(P + 'daily') || '{}'), P);
  const prompt = () => p.$eval('#prompt', e => e.textContent);
  const choose = async right => { const w = await prompt(); const i = await p.$$eval('.choice', (bs, [m, r]) => { const i = bs.findIndex(b => b.lastChild.textContent === m); return r ? i : (i + 1) % bs.length; }, [M[w], right]); await p.click(`.choice:nth-child(${i + 1})`); await sleep(40); return w; };
  const nextQ = async () => { await p.keyboard.press('Enter'); await sleep(60); };
  // 6 問（全部）のクイズを、最初の 1 問だけ間違えて解く（間違えた語は出し直しが入る）
  const quiz = async () => {
    await p.click('#startBtn'); await sleep(80);
    let first = true;
    while (await p.$eval('#quiz', e => !e.hidden)) { await choose(!first); first = false; await nextQ(); }
    await p.click('#homeBtn'); await sleep(80);
  };
  const openStats = async () => { await p.click('#statsBtn'); await sleep(100); };
  const txt = s => p.$eval(s, e => e.textContent);

  // 1. 回答を日ごとに数える。出し直しは数えない
  await load();
  let t = await day();
  await quiz();
  let dl = await daily();
  check('1 回のクイズで、今日・このデッキに 6 問・正解 5 を記録する（出し直しは数えない）', dl[t] && dl[t].c1 && dl[t].c1.n === 6 && dl[t].c1.c === 5, JSON.stringify(dl));
  check('学習時間を記録する', dl[t].c1.ms > 0);

  // 2. 取り消すと日ごとの記録も戻る
  await p.click('#startBtn'); await sleep(80);
  await choose(false); await p.click('#undoBtn'); await sleep(60);
  dl = await daily();
  check('間違えて取り消すと、日ごとの記録も回答前に戻る', dl[t].c1.n === 6 && dl[t].c1.c === 5, JSON.stringify(dl[t]));
  await p.click('#quitBtn'); await sleep(80);

  // 3. ほかのタブの記録に足す
  await p.evaluate((P, t) => { const v = JSON.parse(localStorage.getItem(P + 'daily')); v[t].c1.n += 10; v[t].c1.c += 10; v[t].other = {n: 5, c: 5, ms: 1000}; localStorage.setItem(P + 'daily', JSON.stringify(v)); }, P, t);
  await quiz();
  dl = await daily();
  check('ほかのタブが書いた分を消さずに足す', dl[t].c1.n === 22 && dl[t].c1.c === 20 && dl[t].other.n === 5, JSON.stringify(dl[t]));

  // 4. 統計画面
  await openStats();
  check('統計画面：今日の回答（全デッキの合計）・連続 1 日', (await txt('#sToday')) === '27問' && (await txt('#sStreak')) === '1日' && (await txt('#sBest')) === '1日', [await txt('#sToday'), await txt('#sStreak')].join());
  const cells = await p.$$eval('#heat .cell', l => l.map(c => ({today: c.classList.contains('today'), lv: c.dataset.lv, label: c.getAttribute('aria-label'), future: c.classList.contains('future')})));
  const todayCell = cells.find(c => c.today);
  check('ヒートマップは 18 週 × 7 日で、今日のマスに回答数と正答率', cells.length === 126 && todayCell && /27問 · 正答率 93%/.test(todayCell.label) && todayCell.lv === '2', JSON.stringify(todayCell));
  check('未来の日は見せない（今週の今日より後だけ）', cells.filter(c => c.future).length === cells.length - cells.indexOf(todayCell) - 1);
  await p.click('#heat .cell.today'); await sleep(40);
  check('マスを押すとその日の記録を出す', /27問 · 正答率 93%/.test(await txt('#heatInfo')), await txt('#heatInfo'));
  const trend = await p.$$eval('#trend .trow', l => l.map(r => r.querySelector('.tn').textContent + ':' + r.querySelector('.tv').textContent));
  check('デッキ別の正答率の推移：今のデッキが先頭、消したデッキは「削除したデッキ」', trend.join() === 'T:91%,削除したデッキ:100%', trend.join());
  await p.click('#statsHome'); await sleep(80);

  // 5. 日の区切りは 4 時：3:59 と 4:01 は別の日
  const now = await p.evaluate(() => Date.now());
  const next4 = await p.evaluate(() => { const d = new Date(); d.setHours(4, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d.getTime(); });
  await setOff(next4 - 60000 - now); await p.reload(); await sleep(100);
  const before = await day(); await quiz();
  await setOff(next4 + 60000 - now); await p.reload(); await sleep(100);
  const after = await day(); await quiz();
  dl = await daily();
  check('4 時をまたぐと別の日に数える（3:59 と 4:01）', after === before + 1 && dl[before] && dl[after] && dl[after].c1.n === 6, JSON.stringify([before, after, Object.keys(dl)]));
  await openStats();
  check('続けて答えた日は連続日数が伸びる', (await txt('#sStreak')) === `${after - t + 1}日`, await txt('#sStreak'));
  await p.click('#statsHome'); await sleep(80);

  // 6. 1 日空くと途切れる。今日まだ答えていなくても、昨日まで続いていれば途切れない
  await setOff(next4 + DAY + 60000 - now); await p.reload(); await sleep(100); await openStats();
  const run1 = after - t + 1;
  check('今日まだ答えていなくても、昨日まで続いていれば連続は途切れない', (await txt('#sStreak')) === `${run1}日` && (await txt('#sToday')) === '0問', await txt('#sStreak'));
  await setOff(next4 + 2 * DAY + 60000 - now); await p.reload(); await sleep(100); await openStats();
  check('1 日空くと連続日数が 0 に戻り、最長連続は残る', (await txt('#sStreak')) === '0日' && (await txt('#sBest')) === `${run1}日`, [await txt('#sStreak'), await txt('#sBest')].join());
  await p.click('#statsHome'); await sleep(80); await quiz(); await openStats();
  check('また答えると 1 日から数え直す', (await txt('#sStreak')) === '1日');
  await p.click('#statsHome'); await sleep(80);
  await setOff(0); await p.reload(); await sleep(100);

  // 7. 今後の復習予定（今のデッキ・今の方向。予定日を過ぎた語は今日。出題しない語は除く）
  t = await day();
  await load({stats: {[K('alpha', M.alpha)]: {c: 1, w: 0, b: 1, d: t - 3, t: 1}, [K('beta', M.beta)]: {c: 1, w: 0, b: 1, d: t + 1, t: 1},
    [K('gamma', M.gamma)]: {c: 1, w: 0, b: 1, d: t + 1, t: 1}, [K('delta', M.delta)]: {c: 1, w: 0, b: 3, d: t + 30, t: 1},
    [K('eps', M.eps)]: {c: 1, w: 0, b: 1, d: t + 6, t: 1}, [K('eps', M.eps, 'j2e')]: {c: 1, w: 0, b: 1, d: t, t: 1}},
    suspended: ['gamma\u0001' + M.gamma]});
  await openStats();
  const fc = await p.$$eval('#fcBars .v', l => l.map(x => x.textContent).join());
  check('今後 7 日の復習予定（予定日を過ぎた語は今日・出題しない語と範囲外は除く・ほかの方向は数えない）', fc === '1,1,0,0,0,0,1', fc);
  check('記録が無いときは案内を出し、推移は隠す', /まだ記録がありません/.test(await txt('#sNote')) && await p.$eval('#trendCard', e => e.hidden));
  await p.click('#statsHome'); await sleep(80);
  await p.click('#chips [data-key="dir"]'); await sleep(40); await p.click('#chips [data-key="dir"]'); await sleep(40); // ミックスへ
  await openStats();
  check('ミックスでは両方向のうち早い方の日に数える', (await p.$$eval('#fcBars .v', l => l.map(x => x.textContent).join())) === '2,1,0,0,0,0,0');
  await p.click('#statsHome'); await sleep(80);

  // 8. バックアップの統合（日・デッキごとに回答数の多い方）とリセット
  await load({daily: {[t]: {c1: {n: 5, c: 4, ms: 100}}, [t - 1]: {c1: {n: 2, c: 1, ms: 50}}}});
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')), 'b.json');
  fs.writeFileSync(file, JSON.stringify({app: 'word-sprint', format: 2, exportedAt: '2026-10-01T00:00:00Z', settings: {}, stats: {}, decks: [],
    daily: {[t]: {c1: {n: 3, c: 3, ms: 10}}, [t - 1]: {c1: {n: 9, c: 9, ms: 90}}, [t - 2]: {x: {n: 1, c: 1, ms: 1}}, bad: {c1: {n: 1, c: 1, ms: 1}}, [t - 3]: {c1: {n: 1, c: 2, ms: 1}}}}));
  await p.click('#settingsBtn'); await sleep(100);
  await (await p.$('#importFile')).uploadFile(file); await sleep(400);
  await p.click('#importMerge'); await sleep(300);
  dl = await daily();
  check('統合：日・デッキごとに回答数の多い方を残し、壊れた値は捨てる', JSON.stringify(dl) === JSON.stringify({[t - 2]: {x: {n: 1, c: 1, ms: 1}}, [t - 1]: {c1: {n: 9, c: 9, ms: 90}}, [t]: {c1: {n: 5, c: 4, ms: 100}}}), JSON.stringify(dl));
  await p.click('#settingsBtn'); await sleep(100); await p.click('#resetBtn'); await sleep(100);
  check('学習記録をリセットすると日ごとの記録も消す', JSON.stringify(await daily()) === '{}');

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
