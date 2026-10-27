const {sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  const url = INDEX;
  const vis = id => page.$eval('#' + id, el => !el.hidden);
  const load = async (ls = {}) => {
    await page.goto(url);
    await page.evaluate(ls => { localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem('wordsprint.v1.' + k, JSON.stringify(v)); }, ls);
    await page.goto(url);
  };

  // --- 既存動作: ホームで Enter（ボタン外）→ スタート、1〜4 で回答
  await load({settings:{deck:'basic', dir:'e2j', count:10, limit:0, speak:false}});
  await page.keyboard.press('Enter');
  check('ホームの Enter でスタート（従来通り）', await vis('quiz'));
  for (let i = 0; i < 40 && await vis('quiz'); i++) { await page.keyboard.press('1'); await sleep(50); await page.keyboard.press('Enter'); await sleep(80); }
  check('10 問（と間違えた語のもう一度）に答えると結果画面', await vis('result'));

  // --- A1: 結果画面で「ホームへ」にフォーカスして Enter
  await page.focus('#homeBtn'); await page.keyboard.press('Enter'); await sleep(100);
  check('A1 「ホームへ」+Enter でホームに戻る', await vis('home') && !(await vis('quiz')));
  // 結果画面で「間違えた単語だけもう一度」
  await page.keyboard.press('Enter'); for (let i = 0; i < 40 && await vis('quiz'); i++) { await page.keyboard.press('1'); await sleep(50); await page.keyboard.press('Enter'); await sleep(80); }
  const missed = await page.$$eval('#missedList li', l => l.length);
  await page.focus('#retryMissed'); await page.keyboard.press('Enter'); await sleep(100);
  const cnt = await page.$eval('#counter', e => e.textContent);
  check('A1 「間違えた単語だけ」+Enter で復習が始まる', missed > 0 && cnt === `1 / ${missed}`, `missed=${missed} counter=${cnt}`);
  // ホームの設定ボタン
  await page.keyboard.press('Escape'); await sleep(100); check('Esc（未回答）でホームへ', await vis('home'));
  await page.click('#settingsBtn'); await sleep(100); await page.focus('.seg[data-key=count] button[data-val="50"]'); await page.keyboard.press('Enter'); await sleep(100); await page.keyboard.press('Escape'); await sleep(100);
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('wordsprint.v1.settings')).count);
  check('A1 設定ボタン+Enter は設定変更だけ（スタートしない）', await vis('home') && count === 50, `count=${count}`);
  // 苦手な単語を集中練習
  const wn = await page.$eval('#weakBtn', e => e.textContent.match(/(\d+) 語/)[1]);
  await page.focus('#weakBtn'); await page.keyboard.press('Enter'); await sleep(100);
  const wc = await page.$eval('#counter', e => e.textContent);
  check('A1 「苦手な単語を集中練習」+Enter で苦手語が始まる', await vis('quiz') && wc === `1 / ${wn}`, `counter=${wc} weak=${wn}`);

  // --- A2: 制限時間 3 秒、非表示 4 秒 → 戻っても時間切れにならない
  await load({settings:{deck:'basic', dir:'e2j', count:10, limit:3, speak:false}});
  await page.keyboard.press('Enter'); await sleep(500);
  const setHidden = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => h}); Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => h ? 'hidden' : 'visible'}); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true); await sleep(4000); await setHidden(false); await sleep(600);
  const locked = await page.$$eval('.choice', b => b.some(x => x.disabled));
  const c1 = await page.$eval('#counter', e => e.textContent);
  const rec = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('wordsprint.v1.stats') || '{}')).length);
  check('A2 非表示 4 秒から戻っても時間切れにならない', !locked && c1 === '1 / 10' && rec === 0, `counter=${c1} records=${rec}`);
  await sleep(2600);
  const lockedLater = await page.$$eval('.choice', b => b.some(x => x.disabled));
  check('A2 残り時間を使い切れば時間切れになる', lockedLater);

  // --- A3: 自作デッキで意味を直すと記録が引き継がれる
  const words = [{w:'alpha',p:'',m:'あ'},{w:'beta',p:'',m:'い'},{w:'gamma',p:'',m:'う'},{w:'delta',p:'',m:'え'}];
  const k = (w, m) => w + '\u0001' + m;
  await load({settings:{deck:'c1', dir:'e2j', count:10, limit:0, speak:false}, decks:[{id:'c1', name:'T', words}],
    stats:{[k('alpha','あ')]:{c:5,w:1,t:1}, [k('beta','い')]:{c:2,w:3,t:1}}});
  await page.click('#deckChange'); await sleep(100); await page.click('.deck-row .edit'); await sleep(100);
  await page.$eval('#customText', t => { t.value = t.value.replace('alpha,あ', 'alpha,あ（修正）'); });
  await page.click('#saveCustom'); await sleep(100);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wordsprint.v1.stats')));
  check('A3 意味を直した語の記録が新キーへ移る', st[k('alpha','あ（修正）')] && st[k('alpha','あ（修正）')].c === 5 && !st[k('alpha','あ')], JSON.stringify(Object.keys(st)));
  check('A3 変えていない語の記録はそのまま', st[k('beta','い')] && st[k('beta','い')].w === 3);

  // --- A4: エディタで開いて保存しても単語が壊れない
  await load({settings:{deck:'c1'}, decks:[{id:'c1', name:'T', words:[{w:'well, then',p:'',m:'さて'},{w:'he said "hi"',p:'',m:'x'},...words.slice(0,2)]}]});
  await page.click('#deckChange'); await sleep(100); await page.click('.deck-row .edit'); await sleep(100); await page.click('#saveCustom'); await sleep(100);
  const ws = await page.evaluate(() => JSON.parse(localStorage.getItem('wordsprint.v1.decks'))[0].words.map(x => x.w));
  check('A4 開いて保存するだけでは単語が変わらない', ws[0] === 'well, then' && ws[1] === 'he said "hi"', JSON.stringify(ws));

  await browser.close();
});
