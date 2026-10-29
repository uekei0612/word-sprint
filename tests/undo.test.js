const {P, K, sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  const words = [{w: 'alpha', p: '', m: 'あ'}, {w: 'beta', p: '', m: 'い'}, {w: 'gamma', p: '', m: 'う'}, {w: 'delta', p: '', m: 'え'}, {w: 'eps', p: '', m: 'お'}];
  const load = async (stats) => { await p.goto(INDEX); await p.evaluate((P, words, stats) => { localStorage.clear();
    localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}])); localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, okDelay: 600}));
    localStorage.setItem(P + 'stats', JSON.stringify(stats)); }, P, words, stats); await p.goto(INDEX); await sleep(100); };
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const cur = () => p.evaluate(() => document.querySelector('#prompt').textContent);
  const idx = async right => { const w = await cur(); return p.$$eval('.choice', (bs, [m, right]) => { const i = bs.findIndex(b => b.lastChild.textContent === m); return right ? i : (i + 1) % bs.length; }, [M[w], right]); };
  const snap = () => p.evaluate(P => [localStorage.getItem(P + 'stats'), document.querySelector('#score').textContent, document.querySelector('#streak').textContent], P);
  const order = () => p.$$eval('.choice', bs => bs.map(b => b.lastChild.textContent).join());
  // 既存記録あり：2 問正解して連続を作り、3 問目で押し間違えて取り消す
  await load({[K('gamma', 'う')]: {c: 2, w: 1, t: 5}});
  await p.click('#startBtn'); await sleep(80);
  for (let r = 0; r < 2; r++) { await p.click(`.choice:nth-child(${await idx(true) + 1})`); await sleep(800); }
  const before = await snap(); const w3 = await cur(); const o3 = await order();
  await p.click(`.choice:nth-child(${await idx(false) + 1})`); await sleep(80);
  check('間違えると取り消しボタンが出る', await p.$eval('#undoBox', e => !e.hidden));
  await p.click('#undoBtn'); await sleep(80);
  const after = await snap();
  check('取り消すと保存された記録が回答前と完全に一致', after[0] === before[0], `${before[0]} → ${after[0]}`);
  check('スコア・連続正解も回答前に戻る', after[1] === before[1] && after[2] === before[2], JSON.stringify([before.slice(1), after.slice(1)]));
  check('同じ問題を同じ並びで出し直し、また答えられる', (await cur()) === w3 && (await order()) === o3 && await p.$$eval('.choice', bs => bs.every(b => !b.disabled)) && await p.$eval('#undoBox', e => e.hidden));
  check('読み上げで取り消しを伝える', /取り消しました/.test(await p.$eval('#announce', e => e.textContent)));
  await sleep(2000);
  check('取り消した後は自動で次へ進まない', (await cur()) === w3 && await p.$$eval('.choice', bs => bs.every(b => !b.disabled)));
  // 答え直しは正しく記録
  const k3 = K(w3, M[w3]);
  const pre = JSON.parse(before[0] || '{}')[k3] || {c: 0, w: 0};
  await p.click(`.choice:nth-child(${await idx(true) + 1})`); await sleep(80);
  const st = await p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats')), P);
  check('答え直した結果が記録される（正解が 1 増え、誤答は増えない）', st[k3].c === pre.c + 1 && st[k3].w === pre.w, JSON.stringify([pre, st[k3]]));
  await sleep(800);
  // 正解では取り消しを出さない／次に進んだら取り消せない（Z キー）
  check('正解のときは取り消しボタンを出さない', await p.$eval('#undoBox', e => e.hidden));
  await p.click(`.choice:nth-child(${await idx(false) + 1})`); await sleep(80);
  const s4 = await snap(); await p.keyboard.press('Enter'); await sleep(80); await p.keyboard.press('z'); await sleep(80);
  check('次の問題に進んだら Z を押しても取り消さない', (await snap())[0] === s4[0]);
  // Z キーで取り消し（記録の無かった語は記録ごと消える）
  await load({}); await p.click('#startBtn'); await sleep(80);
  const w1 = await cur(); await p.click(`.choice:nth-child(${await idx(false) + 1})`); await sleep(80);
  await p.keyboard.press('z'); await sleep(80);
  const st2 = await p.evaluate(P => localStorage.getItem(P + 'stats'), P);
  check('Z で取り消すと、記録の無かった語は記録ごと消える', st2 === '{}' && (await cur()) === w1, st2);
  // 時間切れは取り消せない
  await p.evaluate(P => localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, okDelay: 600, limit: 3})), P);
  await p.goto(INDEX); await p.click('#startBtn'); await sleep(3300);
  check('時間切れでは取り消しボタンを出さない', await p.$eval('#undoBox', e => e.hidden) && await p.$$eval('.choice', bs => bs.every(b => b.disabled)));
  // 結果画面の間違えた単語に、取り消した語が残らない
  await p.evaluate(P => localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, okDelay: 600, limit: 0})), P);
  await p.goto(INDEX); await p.click('#startBtn'); await sleep(80);
  for (let r = 0; r < 5; r++) { await p.click(`.choice:nth-child(${await idx(false) + 1})`); await sleep(50); await p.click('#undoBtn'); await sleep(50); await p.click(`.choice:nth-child(${await idx(true) + 1})`); await sleep(800); }
  check('全問で押し間違え→取り消し→正解なら、結果は全問正解・間違えた単語なし', (await p.$eval('#rScore', e => e.textContent)) === '5 / 5' && await p.$eval('#missedCard', e => e.hidden));
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
