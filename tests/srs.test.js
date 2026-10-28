// 間隔反復（#4）：今日の復習・新規の上限・箱の上げ下げ・日付をまたいだとき・自由な練習・箱の無い記録の推定
const {P, K, sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
const DAY = 86400000;
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  // 時計を進める：sessionStorage の __days 日だけ Date.now をずらす
  await p.evaluateOnNewDocument(DAY => { const n = Date.now.bind(Date), off = () => (+sessionStorage.getItem('__days') || 0) * DAY; Date.now = () => n() + off(); }, DAY);
  const words = 'abcdefghijkl'.split('').map((c, i) => ({w: 'w' + c, p: '', m: '意味' + i}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const setDays = async n => { await p.evaluate(n => sessionStorage.setItem('__days', n), n); await p.goto(INDEX); await sleep(100); };
  const day = () => p.evaluate(() => Math.floor((Date.now() - new Date(Date.now()).getTimezoneOffset() * 60000 - 4 * 3600000) / 86400000));
  const stats = () => p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats') || '{}'), P);
  const btn = () => p.$eval('#todayBtn', e => ({t: e.textContent, off: e.disabled, primary: e.classList.contains('primary'), startPrimary: document.querySelector('#startBtn').classList.contains('primary')}));
  // 結果画面まで答える。wrong に入っている語は最初の 1 回だけ間違える（もう一度は正解）
  const play = async (wrong = []) => {
    const seen = [], missed = new Set();
    while (await p.$eval('#quiz', e => !e.hidden)) {
      const w = await p.$eval('#prompt', e => e.textContent); seen.push(w);
      const bad = wrong.includes(w) && !missed.has(w); if (bad) missed.add(w);
      const i = await p.$$eval('.choice', (bs, [m, bad]) => { const i = bs.findIndex(b => b.lastChild.textContent === m); return bad ? (i + 1) % bs.length : i; }, [M[w], bad]);
      await p.click(`.choice:nth-child(${i + 1})`); await sleep(40); await p.keyboard.press('Enter'); await sleep(60);
    }
    return seen;
  };
  await p.goto(INDEX);
  await p.evaluate((P, words) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}]));
    localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, newPerDay: 5})); }, P, words);
  await setDays(0);

  // 1. 初日：新規は 1 日 5 語まで
  let x = await btn();
  check('初日は「今日の復習（復習 0・新規 5）」が主のボタン', x.t === '今日の復習（復習 0・新規 5）' && !x.off && x.primary && !x.startPrimary, JSON.stringify(x));
  await p.click('#todayBtn'); await sleep(80);
  const d0 = await day(), first = await play();
  let st = await stats();
  check('今日の分は 5 問。新しい語はデッキの並び順で入る', first.length === 5 && [...first].sort().join() === 'wa,wb,wc,wd,we', first.join());
  check('初めての正解で箱 1・次は明日', first.every(w => { const s = st[K(w, M[w])]; return s.b === 1 && s.d === d0 + 1 && s.f === d0; }), JSON.stringify(st[K('wa', M.wa)]));
  await p.click('#homeBtn'); await sleep(100); x = await btn();
  check('終わると「今日の分は完了 ✓（明日 5 語）」になり、スタートが主のボタンに戻る', x.t === '今日の分は完了 ✓（明日 5 語）' && x.off && !x.primary && x.startPrimary, JSON.stringify(x));
  await p.reload(); await sleep(100);
  check('開き直しても新規の上限は今日の分を数える（新規を足さない）', (await btn()).off);

  // 2. 自由な練習（スタート）で正解しても、予定日前の箱は上げない
  await p.click('#startBtn'); await sleep(80); await play(); await p.click('#homeBtn'); await sleep(80);
  st = await stats();
  check('自由な練習の正解では予定日前の語の箱は上がらない', st[K('wa', M.wa)].b === 1 && st[K('wa', M.wa)].d === d0 + 1, JSON.stringify(st[K('wa', M.wa)]));
  check('自由な練習で初めて答えた語も、今日の新規に数える', (await btn()).off);
  // 自由な練習で答えた 7 語は明日の予定に入るので、今日の新規の分だけ元の状態に戻す
  await p.evaluate((P, ws) => { const st = JSON.parse(localStorage.getItem(P + 'stats')); for (const w of ws) for (const k of Object.keys(st)) if (k.startsWith(w + '\u0001')) delete st[k]; localStorage.setItem(P + 'stats', JSON.stringify(st)); }, P, ['wf', 'wg', 'wh', 'wi', 'wj', 'wk', 'wl']);

  // 3. 翌日：昨日の 5 語が復習に入り、新規 5 語が足される。正解で間隔が伸び、間違いで箱 0
  await setDays(1); const d1 = await day();
  x = await btn();
  check('日付をまたぐと昨日の語が「今日の復習」に入る（復習 5・新規 5）', x.t === '今日の復習（復習 5・新規 5）', x.t);
  await p.click('#todayBtn'); await sleep(80);
  const seen = await play(['wa']);
  st = await stats();
  check('今日の分は 10 問（と間違えた語のもう一度）', seen.filter((w, i) => seen.indexOf(w) === i).length === 10, seen.join());
  check('正解した復習は箱 2・次は 3 日後', st[K('wb', M.wb)].b === 2 && st[K('wb', M.wb)].d === d1 + 3, JSON.stringify(st[K('wb', M.wb)]));
  check('間違えた復習は箱 0・今日のうち・忘れた回数 1', st[K('wa', M.wa)].b === 0 && st[K('wa', M.wa)].d === d1 && st[K('wa', M.wa)].l === 1, JSON.stringify(st[K('wa', M.wa)]));
  await p.click('#homeBtn'); await sleep(100);
  check('間違えた語はその日のうちにもう一度「今日の復習」に残る', (await btn()).t === '今日の復習（復習 1・新規 0）', (await btn()).t);
  await p.click('#todayBtn'); await sleep(80); await play(); st = await stats();
  check('箱 0 の語に正解すると箱 1・次は明日', st[K('wa', M.wa)].b === 1 && st[K('wa', M.wa)].d === d1 + 1);

  // 4. 3 日後：箱 2 の語が戻ってくる。問題数の設定で区切れる
  await setDays(4); x = await btn();
  check('3 日後には箱 2 の語と、遅れた箱 1 の語がまとめて出る（復習 10・新規 2）', x.t === '今日の復習（復習 10・新規 2）', x.t);
  await p.evaluate(P => { const s = JSON.parse(localStorage.getItem(P + 'settings')); s.count = 10; localStorage.setItem(P + 'settings', JSON.stringify(s)); }, P);
  await p.goto(INDEX); await sleep(100); await p.click('#todayBtn'); await sleep(80);
  check('問題数（10 問）で区切って出す', (await p.$eval('#counter', e => e.textContent)) === '1 / 10');
  await play(); await p.click('#homeBtn'); await sleep(100);
  check('区切った残りは「今日の復習」に残る', /^今日の復習（復習 \d+・新規 \d+）$/.test((await btn()).t) && !(await btn()).off, (await btn()).t);

  // 5. 箱を持たない記録（前の版）は正誤回数と最後に答えた日から推定する
  const now = await p.evaluate(() => Date.now());
  await p.evaluate((P, st) => localStorage.setItem(P + 'stats', JSON.stringify(st)), P, {
    [K('wa', M.wa)]: {c: 5, w: 0, t: now - 10 * DAY}, // 旧基準で定着 → 箱 4（14 日）→ まだ先
    [K('wb', M.wb)]: {c: 1, w: 2, t: now - 10 * DAY}, // 箱 0 → 今日
    [K('wc', M.wc)]: {c: 2, w: 0, t: now - 10 * DAY}, // 箱 2（3 日）→ 過ぎている
  });
  await p.goto(INDEX); await sleep(100);
  check('箱の無い記録：定着は 14 日先、誤答の多い語と間隔を過ぎた語は今日の復習', (await btn()).t === '今日の復習（復習 2・新規 5）' && /定着 1/.test(await p.$eval('#curStats', e => e.textContent)), (await btn()).t);

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
