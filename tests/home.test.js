const {sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.setViewport({width: 390, height: 844, deviceScaleFactor: 2});
  await p.goto(INDEX);
  // 学習途中の状態を作る（TOEIC 300・基礎の先頭 40 語に記録、うち 12 語は誤答あり）
  await p.evaluate(() => { localStorage.clear();
    const ws = window.WORD_SPRINT_DECKS.find(d => d.id === 'toeic300-basic').raw.trim().split('\n').map(l => l.split('|'));
    const st = {}; ws.slice(0, 40).forEach(([w, , m], i) => { st[w + '\u0001' + m] = {c: 4, w: i < 12 ? 2 : 0, t: 1}; });
    localStorage.setItem('wordsprint.v1.stats', JSON.stringify(st)); });
  await p.goto(INDEX); await sleep(150);
  check('ホームにスタートと苦手の集中練習が見える（スクロールなし）', await p.evaluate(() => { const r1 = document.querySelector('#startBtn').getBoundingClientRect(), r2 = document.querySelector('#weakBtn').getBoundingClientRect(); return r1.bottom < innerHeight && r2.bottom < innerHeight && !document.querySelector('#weakBtn').hidden; }));
  console.log('INFO', await p.$eval('#curStats', e => e.textContent), '|', await p.$eval('#startBtn', e => e.textContent), '|', await p.$eval('#weakBtn', e => e.textContent));
  // チップで設定が回る
  await p.click('#chips [data-key=count]'); await sleep(50);
  const s1 = await p.evaluate(() => JSON.parse(localStorage.getItem('wordsprint.v1.settings')).count);
  check('問題数チップを押すと 20 → 50 になり保存される', s1 === 50, String(s1));
  check('スタートボタンの問題数も変わる', (await p.$eval('#startBtn', e => e.textContent)) === 'スタート（50問）');
  for (let i = 0; i < 3; i++) await p.click('#chips [data-key=count]');
  check('一周すると元の 20 に戻る', (await p.$eval('#chips [data-key=count]', e => e.textContent)) === '20問');
  // デッキ一覧
  check('デッキ一覧はホームにそのまま出ている（ダイアログを開かない）', await p.$eval('#decks', e => e.closest('#home') && !e.closest('dialog') && e.getBoundingClientRect().height > 0));
  const groups = await p.$$eval('#decks h3', es => es.map(e => e.textContent));
  check('デッキ一覧は TOEIC → レベル別 → 分野別 → 自作デッキ', groups.join('/') === 'TOEIC/レベル別/分野別/自作デッキ', groups.join('/'));
  await p.evaluate(() => [...document.querySelectorAll('#decks .deck')].find(e => e.querySelector('.dn').textContent === '中上級').click()); await sleep(100);
  check('デッキを 1 タップで選ぶと、ホームのデッキが変わり印が付く', (await p.$eval('#curName', e => e.textContent)) === '中上級' && (await p.$eval('.deck.on .dn', e => e.textContent)) === '中上級');
  // 設定
  await p.click('#settingsBtn'); await sleep(150);
  await p.click('.seg[data-key=dir] button:nth-child(2)'); await sleep(50);
  check('設定画面で変えるとチップも変わる', (await p.$eval('#chips [data-key=dir]', e => e.textContent)) === '日→英');
  await p.click('#settingsDlg [data-close]'); await sleep(100);
  check('閉じるで設定が閉じる', !(await p.$('dialog[open]')));
  // Enter でスタート、ダイアログ中は効かない
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Enter'); await sleep(150);
  check('ホームで Enter を押すとクイズが始まる', await p.$eval('#quiz', e => !e.hidden));
  await p.keyboard.press('Escape'); await sleep(200);
  // 新しいデッキ → エディタが開く
  await p.goto(INDEX); await sleep(100);
  await p.click('#decks .deck.new'); await sleep(100);
  check('「新しいデッキ」でエディタが開く', await p.$eval('#editor', e => !e.hidden));
  // ダークモード
  await p.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'dark'}]);
  await p.goto(INDEX); await sleep(150);
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
