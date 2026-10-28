// 振り返り（#2 自信なし・#5 迷った正解・#7 リーチ）：印の付け外し・間隔への効き方・ホームと結果画面・リーチの例文
const {P, K, sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  const words = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'].map((w, i) => ({w, p: '', m: '意味' + i, e: `The ${w} example.`, j: '例文' + i, b: ''}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const day = () => p.evaluate(() => Math.floor((Date.now() - new Date(Date.now()).getTimezoneOffset() * 60000 - 4 * 3600000) / 86400000));
  const load = async (stats, extra = {}) => {
    await p.goto(INDEX);
    await p.evaluate((P, words, stats, extra) => { localStorage.clear();
      localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}]));
      localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, ...extra}));
      localStorage.setItem(P + 'stats', JSON.stringify(stats)); }, P, words, stats, extra);
    await p.goto(INDEX); await sleep(100);
  };
  const stats = () => p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats') || '{}'), P);
  const prompt = () => p.$eval('#prompt', e => e.textContent);
  const choose = async right => { const w = await prompt(); const i = await p.$$eval('.choice', (bs, [m, r]) => { const i = bs.findIndex(b => b.lastChild.textContent === m); return r ? i : (i + 1) % bs.length; }, [M[w], right]); await p.click(`.choice:nth-child(${i + 1})`); await sleep(40); return w; };
  const nextQ = async () => { await p.keyboard.press('Enter'); await sleep(60); };
  // 中央値 1000ms の正解時間を持つ記録（迷いの基準）。対象の 6 語とは別の語
  const pace = Object.fromEntries(Array.from({length: 10}, (_, i) => [K('pace' + i, 'x'), {c: 1, w: 0, a: 1000}]));

  // 1. 答える前に「自信なし」を押して正解：印が付き、箱は上がらない（予定日の語）
  const t = await day();
  await load({...pace, ...Object.fromEntries(words.map(x => [K(x.w, x.m), {c: 3, w: 0, b: 2, d: t, t: 1}]))});
  await p.click('#startBtn'); await sleep(80);
  await p.click('#unsureBtn'); await sleep(40);
  check('「自信なし」を押すと押された状態になる', await p.$eval('#unsureBtn', e => e.getAttribute('aria-pressed') === 'true' && e.classList.contains('on')));
  const w1 = await choose(true); await nextQ();
  let st = await stats();
  check('自信なしで正解：印 r=1、箱は 2 のまま・次は 3 日後（上げない）', st[K(w1, M[w1])].r === 1 && st[K(w1, M[w1])].b === 2 && st[K(w1, M[w1])].d === t + 3, JSON.stringify(st[K(w1, M[w1])]));
  check('次の問題では「自信なし」が戻っている', await p.$eval('#unsureBtn', e => e.getAttribute('aria-pressed') === 'false'));
  // 2. 普通の正解は箱が上がる・印は付かない
  const w2 = await choose(true); await nextQ(); st = await stats();
  check('速い正解：箱 3・印なし', st[K(w2, M[w2])].b === 3 && !st[K(w2, M[w2])].r, JSON.stringify(st[K(w2, M[w2])]));
  // 3. 時間のかかった正解は「迷った」
  await sleep(2200); const w3 = await choose(true);
  const ann = await p.$eval('#announce', e => e.textContent); await nextQ(); st = await stats();
  check('基準（中央値 1000ms の 1.8 倍）を超えた正解は迷った：印 r=2・箱は上げない・読み上げで伝える', st[K(w3, M[w3])].r === 2 && st[K(w3, M[w3])].b === 2 && /振り返りに入れました/.test(ann), JSON.stringify(st[K(w3, M[w3])]) + ann);
  // 4. 間違えた後に「自信なし」を押す：印が付き、自動で進まない
  const w4 = await choose(false);
  await p.keyboard.press('f'); await sleep(2400);
  st = await stats();
  check('答えた後に F で印を付けられ、自動では次へ進まない', st[K(w4, M[w4])].r === 1 && (await prompt()) === w4 && await p.$eval('#tapNext', e => !e.hidden), JSON.stringify(st[K(w4, M[w4])]));
  await p.keyboard.press('f'); await sleep(40); st = await stats();
  check('もう一度押すと印が外れる', !st[K(w4, M[w4])].r);
  await p.keyboard.press('f'); await sleep(40); await nextQ();
  while (await p.$eval('#quiz', e => !e.hidden)) { await choose(true); await nextQ(); }
  // 結果画面
  const rev = await p.$$eval('#reviewList li', l => l.map(x => x.textContent));
  check('結果画面に「振り返りに入れた単語」を理由つきで出す（間違えた語は除く）', rev.length === 2 && rev.some(x => x.includes(w1) && x.includes('自信なし')) && rev.some(x => x.includes(w3) && x.includes('迷った')), rev.join(' / '));
  await p.click('#homeBtn'); await sleep(100);
  // 5. ホーム：振り返りの内訳と、振り返りの集中練習
  await p.reload(); await sleep(100);
  const cr = await p.$eval('#curReview', e => e.hidden ? '' : e.textContent);
  check('ホームに振り返りの内訳を出す（再読み込みしても残る）', cr === '振り返り：自信なし 2 · 迷った 1', cr);
  check('振り返りの集中練習は印のある語と誤答のある語', (await p.$eval('#weakBtn', e => e.textContent)) === '振り返り 3 語を集中練習', await p.$eval('#weakBtn', e => e.textContent));
  // 6. 印の後に 2 回続けて自信を持って正解すると外れる
  for (let r = 0; r < 2; r++) {
    await p.click('#weakBtn'); await sleep(80);
    while (await p.$eval('#quiz', e => !e.hidden)) { const w = await prompt(); await choose(w !== w4); await nextQ(); }
    await p.click('#homeBtn'); await sleep(80);
  }
  st = await stats();
  check('2 回続けて自信を持って正解した語は印が外れる', !st[K(w1, M[w1])].r && !st[K(w3, M[w3])].r, JSON.stringify([st[K(w1, M[w1])], st[K(w3, M[w3])]]));
  check('間違えている語は印が残る（連続正解を数え直す）', st[K(w4, M[w4])].r === 1 && st[K(w4, M[w4])].k === 0, JSON.stringify(st[K(w4, M[w4])]));

  // 7. リーチ：4 回以上忘れた・まだ定着していない語。正解でも例文を出し、ホームに数を出す
  await load({...pace, [K('alpha', M.alpha)]: {c: 9, w: 5, l: 4, b: 1, d: t + 5, t: 1}, [K('beta', M.beta)]: {c: 9, w: 7, l: 4, b: 5, d: t + 5, t: 1}});
  check('リーチは忘れた回数が条件以上で、まだ定着していない語だけ（定着した語は外れる）', (await p.$eval('#curReview', e => e.textContent)) === '振り返り：リーチ 1', await p.$eval('#curReview', e => e.textContent));
  await p.click('#weakBtn'); await sleep(80);
  const ex = {};
  while (await p.$eval('#quiz', e => !e.hidden)) { const w = await choose(true); ex[w] = await p.$eval('#example', e => !e.hidden); await nextQ(); }
  check('リーチの語は正解でも例文を出す', ex.alpha === true, JSON.stringify(ex));
  check('リーチでない語の正解では例文を出さない（設定「間違えたとき」）', ex.beta === false, JSON.stringify(ex));

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
