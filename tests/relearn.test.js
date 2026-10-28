const {P, K, sleep, check, launch, fileUrl, pick, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const words = 'abcdefghij'.split('').map((c, i) => ({w: 'w' + c, p: '', m: '意味' + i}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const load = async (extra = {}) => { await p.goto(INDEX); await p.evaluate((P, words, extra) => { localStorage.clear();
    localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}])); localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, ...extra})); }, P, words, extra);
    await p.goto(INDEX); await sleep(80); await p.click('#startBtn'); await sleep(80); };
  const state = () => p.evaluate(() => ({w: document.querySelector('#prompt').textContent, c: document.querySelector('#counter').textContent, d: document.querySelector('#qdir').textContent, o: [...document.querySelectorAll('.choice')].map(b => b.lastChild.textContent).join(), quiz: !document.querySelector('#quiz').hidden}));
  const pick = async right => { const w = (await state()).w; const i = await p.$$eval('.choice', (bs, [m, r]) => { const i = bs.findIndex(b => b.lastChild.textContent === m); return r ? i : (i + 1) % 4; }, [M[w], right]); await p.click(`.choice:nth-child(${i + 1})`); await sleep(40); await p.keyboard.press('Enter'); await sleep(60); };
  // 1 問目を間違え、以降は正解：4 問後（6 問目の位置）にもう一度出る
  await load();
  const log = [];
  let s = await state(); const first = s; await pick(false); log.push(s);
  while (true) { s = await state(); if (!s.quiz) break; log.push(s); await pick(true); }
  const reIdx = log.findIndex((x, i) => i > 0 && x.c === 'もう一度');
  check('間違えた語が 4 問後にもう一度出る', reIdx === 5 && log[reIdx].w === first.w, log.map(x => x.c).join(','));
  check('もう一度の問題は分母を増やさず「もう一度」と出す', log.filter(x => x.c !== 'もう一度').map(x => x.c).join() === Array.from({length: 10}, (_, i) => `${i + 1} / 10`).join() && /^もう一度：/.test(log[reIdx].d));
  check('もう一度のときは選択肢の並びを変える', log[reIdx].o !== first.o, `${first.o} / ${log[reIdx].o}`);
  check('結果の正答率は最初の回答で計算（9 / 10）', (await p.$eval('#rScore', e => e.textContent)) === '9 / 10' && /1 問もう一度/.test(await p.$eval('#rRelearn', e => e.textContent)));
  const st = await p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats')), P);
  check('もう一度の正解は学習記録に数えない（誤 1・正 0 のまま）', JSON.stringify(st[K(first.w, M[first.w])]).includes('"c":0,"w":1'), JSON.stringify(st[K(first.w, M[first.w])]));
  // 最後の問題で間違えると、終わる前に出る。もう一度も間違えると最大 2 回まで
  await load();
  for (let i = 0; i < 9; i++) await pick(true);
  const last = await state(); await pick(false);
  const seq = []; while (true) { const x = await state(); if (!x.quiz) break; seq.push(x); await pick(false); }
  check('最後の問題で間違えると、終わる前に出る。もう一度も間違えたら最大 2 回まで', seq.length === 2 && seq.every(x => x.w === last.w && x.c === 'もう一度'), seq.map(x => x.w + ':' + x.c).join());
  check('もう一度の誤答は間違えた単語を増やさず、正答率も 9 / 10', (await p.$$eval('#missedList li', l => l.length)) === 1 && (await p.$eval('#rScore', e => e.textContent)) === '9 / 10');
  // 取り消すと差し込みも戻る
  await load();
  await pick(false); // 1 問目を間違える（Enter で次へ進むので、取り消しは次で試す）
  const s2 = await state(); const i2 = await p.$$eval('.choice', (bs, m) => (bs.findIndex(b => b.lastChild.textContent === m) + 1) % 4, M[s2.w]);
  await p.click(`.choice:nth-child(${i2 + 1})`); await sleep(40); await p.click('#undoBtn'); await sleep(40);
  await pick(true);
  const seq2 = []; while (true) { const x = await state(); if (!x.quiz) break; seq2.push(x); await pick(true); }
  check('取り消した誤答の分は差し込まない（もう一度は 1 問目の分の 1 回だけ）', seq2.filter(x => x.c === 'もう一度').length === 1 && seq2.find(x => x.c === 'もう一度').w !== s2.w);
  // 途中でやめても、答えた最初の問題だけで集計
  await load();
  await pick(false); await pick(true); await pick(true);
  await p.keyboard.press('Escape'); await sleep(100);
  check('途中でやめると、答えた最初の問題の数で集計（2 / 3）', (await p.$eval('#rScore', e => e.textContent)) === '2 / 3');
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
