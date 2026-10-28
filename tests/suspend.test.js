// 出題しない語（#9）：回答後に外す・戻す、出題・今日の復習・振り返りから除く、4 語を割らない、一覧から戻す、バックアップ
const {P, K, sleep, check, launch, fileUrl, run} = require('./lib');
const fs = require('fs'), os = require('os'), path = require('path');
const INDEX = fileUrl();
const W = (w, m) => w + '\u0001' + m; // 出題しない語のキー（出題方向なし）
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.setViewport({width: 390, height: 844});
  const words = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'].map((w, i) => ({w, p: '', m: '意味' + i}));
  const M = Object.fromEntries(words.map(x => [x.w, x.m]));
  const load = async (values, extra = {}) => {
    await p.goto(INDEX);
    await p.evaluate((P, words, values, extra) => { localStorage.clear();
      localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}]));
      localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, ...extra}));
      for (const [k, v] of Object.entries(values)) localStorage.setItem(P + k, JSON.stringify(v)); }, P, words, values, extra);
    await p.goto(INDEX); await sleep(100);
  };
  const out = () => p.evaluate(P => JSON.parse(localStorage.getItem(P + 'suspended') || '[]'), P);
  const prompt = () => p.$eval('#prompt', e => e.textContent);
  const choose = async () => { const w = await prompt(); const i = await p.$$eval('.choice', (bs, m) => bs.findIndex(b => b.lastChild.textContent === m), M[w]); await p.click(`.choice:nth-child(${i + 1})`); await sleep(40); return w; };
  const nextQ = async () => { await p.keyboard.press('Enter'); await sleep(60); };
  const outShown = () => p.$eval('#outBtn', e => !e.hidden);

  // 1. 回答後に外す・戻す
  await load({});
  await p.click('#startBtn'); await sleep(80);
  check('答える前は「出題しない」を出さない', !(await outShown()));
  { const w = await prompt(); const i = await p.$$eval('.choice', (bs, m) => bs.findIndex(b => b.lastChild.textContent !== m), M[w]); await p.click(`.choice:nth-child(${i + 1})`); await sleep(40); }
  check('間違えた後も出さない', !(await outShown()));
  await p.click('#undoBtn'); await sleep(60);
  const w1 = await choose();
  check('答えた後に「出題しない」を出す', await outShown());
  await p.keyboard.press('x'); await sleep(600);
  check('X で外すと保存され、押された状態になる', JSON.stringify(await out()) === JSON.stringify([W(w1, M[w1])]) && await p.$eval('#outBtn', e => e.getAttribute('aria-pressed') === 'true'), JSON.stringify(await out()));
  check('外した後は自動で次へ進まない', (await prompt()) === w1 && await p.$eval('#tapNext', e => !e.hidden));
  check('読み上げで戻し方を伝える', /出題しない語にしました/.test(await p.$eval('#announce', e => e.textContent)));
  await p.click('#outBtn'); await sleep(40);
  check('もう一度押すと戻る', (await out()).length === 0);
  await p.click('#outBtn'); await sleep(40); await nextQ();
  // 2 語目も外す（残り 4 語）。3 語目は外せない（4 択を作れなくなる）
  const w2 = await choose(); await p.keyboard.press('x'); await sleep(40); await nextQ();
  await choose();
  check('残りが 4 語になると、それ以上は外せない（ボタンを出さない）', !(await outShown()) && (await out()).length === 2);
  await p.keyboard.press('x'); await sleep(40);
  check('ボタンが無いときは X でも外さない', (await out()).length === 2);
  await nextQ();
  while (await p.$eval('#quiz', e => !e.hidden)) { await choose(); await nextQ(); }
  await p.click('#homeBtn'); await sleep(100);

  // 2. ホームの表示
  const tile = await p.$eval('.deck.on .dm', e => e.textContent);
  check('デッキの語数は外した語を除き、外した数を出す', tile === '4語 · 定着 0 · 外す 2', tile);
  check('ホームに「出題しない語 2」を出す', await p.$eval('#suspBtn', e => !e.hidden && e.textContent === '出題しない語 2'));
  check('出題数の分母も外した語を除く', /^出題 4\/4 /.test(await p.$eval('#curStats', e => e.textContent)), await p.$eval('#curStats', e => e.textContent));
  check('スタートの問題数も外した語を除く', (await p.$eval('#startBtn', e => e.textContent)) === 'スタート（4問）');
  await p.reload(); await sleep(100);
  check('再読み込みしても残る', (await p.$eval('#suspBtn', e => e.textContent)) === '出題しない語 2');

  // 3. 外した語は出題しないが、誤答の選択肢には出る
  const prompts = [], labels = new Set();
  for (let r = 0; r < 3; r++) {
    await p.click('#startBtn'); await sleep(80);
    while (await p.$eval('#quiz', e => !e.hidden)) {
      prompts.push(await prompt());
      for (const t of await p.$$eval('.choice', bs => bs.map(x => x.lastChild.textContent))) labels.add(t);
      await choose(); await nextQ();
    }
    await p.click('#homeBtn'); await sleep(80);
  }
  check('外した語は出題しない', prompts.length === 12 && !prompts.includes(w1) && !prompts.includes(w2), prompts.join(','));
  check('外した語も誤答の選択肢には出る', labels.has(M[w1]) || labels.has(M[w2]), [...labels].join(','));

  // 4. 今日の復習・振り返りから除く
  const t = await p.evaluate(() => Math.floor((Date.now() - new Date(Date.now()).getTimezoneOffset() * 60000 - 4 * 3600000) / 86400000));
  await load({suspended: [W('alpha', M.alpha), W('beta', M.beta)],
    stats: {[K('alpha', M.alpha)]: {c: 1, w: 3, b: 0, d: t, r: 1, t: 1}, [K('gamma', M.gamma)]: {c: 1, w: 1, b: 0, d: t, t: 1}}});
  check('今日の復習から外した語を除く（復習 1・新規 3）', (await p.$eval('#todayBtn', e => e.textContent)) === '今日の復習（復習 1・新規 3）', await p.$eval('#todayBtn', e => e.textContent));
  check('振り返りから外した語を除く', (await p.$eval('#weakBtn', e => e.textContent)) === '振り返り 1 語を集中練習' && await p.$eval('#curReview', e => e.hidden), await p.$eval('#weakBtn', e => e.textContent));
  await p.click('#todayBtn'); await sleep(80);
  const tp = [];
  while (await p.$eval('#quiz', e => !e.hidden)) { tp.push(await prompt()); await choose(); await nextQ(); }
  check('今日の復習で外した語を出さない', tp.length === 4 && !tp.includes('alpha') && !tp.includes('beta'), tp.join(','));
  await p.click('#homeBtn'); await sleep(80);
  const st = await p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats')), P);
  check('外した語の学習記録は消さない', st[K('alpha', M.alpha)] && st[K('alpha', M.alpha)].w === 3);

  // 5. 一覧から戻す
  await p.click('#suspBtn'); await sleep(100);
  const rows = await p.$$eval('#suspList li', l => l.map(x => x.children[0].textContent + ':' + x.children[1].textContent));
  check('一覧に今のデッキの外した語を出す', await p.$eval('#suspDlg', e => e.open) && rows.join() === 'alpha:意味0,beta:意味1' && (await p.$eval('#suspTitle', e => e.textContent)) === '出題しない語（2）', rows.join());
  await p.click('#suspList li:first-child button'); await sleep(80);
  check('戻すと一覧とホームから消え、保存も変わる', (await p.$$eval('#suspList li', l => l.length)) === 1 && JSON.stringify(await out()) === JSON.stringify([W('beta', M.beta)])
    && (await p.$eval('.deck.on .dm', e => e.textContent)) === '5語 · 定着 0 · 外す 1');
  // 今日の分は解き終えているので、残るのは戻した alpha（予定日が今日）だけ
  check('戻した語は今日の復習に戻る', (await p.$eval('#todayBtn', e => e.textContent)) === '今日の復習（復習 1・新規 0）', await p.$eval('#todayBtn', e => e.textContent));
  await p.click('#suspList li:first-child button'); await sleep(80);
  check('最後の 1 語を戻すと一覧を閉じ、ホームの表示も消える', !(await p.$eval('#suspDlg', e => e.open)) && await p.$eval('#suspBtn', e => e.hidden));

  // 6. 別のデッキにある同じ語も外れる。内蔵デッキでも使える
  await load({suspended: [W('family', '家族')]}, {deck: 'basic'});
  const bt = await p.$eval('.deck.on .dm', e => e.textContent);
  check('内蔵デッキでも外した数を出す', / · 外す 1$/.test(bt) && await p.$eval('#suspBtn', e => e.textContent === '出題しない語 1'), bt);

  // 7. バックアップ：書き出しに入り、統合では合わせ、壊れた値は捨てる
  await load({suspended: [W('alpha', M.alpha)]});
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'susp-')), 'b.json');
  fs.writeFileSync(file, JSON.stringify({app: 'word-sprint', format: 2, exportedAt: '2026-10-01T00:00:00Z', settings: {}, stats: {}, decks: [], suspended: [W('beta', M.beta), 3, 'nokey']}));
  await p.click('#settingsBtn'); await sleep(100);
  await (await p.$('#importFile')).uploadFile(file); await sleep(400);
  await p.click('#importMerge'); await sleep(300);
  check('統合すると出題しない語を合わせる（壊れた値は捨てる）', JSON.stringify((await out()).sort()) === JSON.stringify([W('alpha', M.alpha), W('beta', M.beta)]), JSON.stringify(await out()));
  const broken = await p.evaluate(P => { localStorage.setItem(P + 'suspended', '{"x":1}'); return P; }, P);
  await p.reload(); await sleep(100);
  check('保存が壊れていたら退避して空にする', JSON.stringify(await out()) === '[]' && await p.evaluate(P => Object.keys(localStorage).some(k => k.startsWith(P + 'broken.suspended.')), broken));

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
