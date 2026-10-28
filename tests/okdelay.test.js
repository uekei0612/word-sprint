// 正解後に次の問題へ自動で進むまでの時間（⚙「正解の後」）：既定 0.6 秒・選んだ時間で進む・タップですぐ進む
const {P, sleep, check, launch, fileUrl, run} = require('./lib');
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  const words = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'].map((w, i) => ({w, p: '', m: '意味' + i}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const load = async (extra = {}) => {
    await p.goto(fileUrl());
    await p.evaluate((P, words, extra) => { localStorage.clear();
      localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}]));
      localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, ...extra})); }, P, words, extra);
    await p.goto(fileUrl()); await sleep(100);
  };
  const counter = () => p.$eval('#counter', e => e.textContent);
  // 正解して、次の問題に進むまでの時間（ms）を計る
  const answer = async () => {
    const w = await p.$eval('#prompt', e => e.textContent);
    const i = await p.$$eval('.choice', (bs, m) => bs.findIndex(b => b.lastChild.textContent === m), M[w]);
    const before = await counter();
    const t0 = Date.now(); await p.click(`.choice:nth-child(${i + 1})`);
    await p.waitForFunction(c => document.querySelector('#counter').textContent !== c, {timeout: 5000, polling: 20}, before);
    return Date.now() - t0;
  };

  await load();
  check('既定は 0.6 秒で、⚙ にその選択が出る', await p.$eval('.seg[data-key="okDelay"] button.on', e => e.textContent) === '0.6秒');
  await p.click('#startBtn'); await sleep(80);
  let ms = await answer();
  check('既定では正解の約 0.6 秒後に次へ進む', ms >= 550 && ms < 1100, ms + 'ms');
  await p.goto(fileUrl()); await sleep(100); // ホームへ（中断すると結果画面になることがある）

  await p.click('#settingsBtn'); await sleep(80); await p.click('.seg[data-key="okDelay"] button[data-val="1500"]'); await sleep(40); await p.click('#settingsDlg [data-close]'); await sleep(60);
  check('選んだ時間は保存される（数値のまま）', (await p.evaluate(P => JSON.parse(localStorage.getItem(P + 'settings')).okDelay, P)) === 1500);
  await p.click('#startBtn'); await sleep(80);
  ms = await answer();
  check('1.5 秒を選ぶと、正解の約 1.5 秒後に次へ進む', ms >= 1450 && ms < 2100, ms + 'ms');
  // 待たずにタップで進む
  { const w = await p.$eval('#prompt', e => e.textContent);
    const i = await p.$$eval('.choice', (bs, m) => bs.findIndex(b => b.lastChild.textContent === m), M[w]);
    const before = await counter(); await p.click(`.choice:nth-child(${i + 1})`); await sleep(350);
    await p.click('#prompt'); await sleep(100);
    check('待たずにタップすると、すぐ次へ進む', (await counter()) !== before); }
  await p.goto(fileUrl()); await sleep(100); // ホームへ（中断すると結果画面になることがある）

  await load({okDelay: 400});
  await p.click('#startBtn'); await sleep(80);
  ms = await answer();
  check('0.4 秒を選ぶと、正解の約 0.4 秒後に次へ進む', ms >= 350 && ms < 900, ms + 'ms');
  await load({okDelay: 380});
  check('選択肢に無い値（以前の 0.38 秒など）は既定の 0.6 秒に戻す', await p.$eval('.seg[data-key="okDelay"] button.on', e => e.textContent) === '0.6秒');

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
