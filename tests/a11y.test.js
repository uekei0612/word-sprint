const {P, sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true});
  const load = async s => { await p.goto(INDEX); await p.evaluate((P, s) => { localStorage.clear(); for (const k in s) localStorage.setItem(P + k, JSON.stringify(s[k])); }, P, s); await p.goto(INDEX); await sleep(150); };
  const size = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  // 英→日：問題の英単語に lang=en、カードにフォーカス
  await load({settings: {deck: 'basic', dir: 'e2j', count: 10, speak: false}, decks: [{id: 'c1', name: '自作', words: [{w: 'a', p: '', m: 'あ'}, {w: 'b', p: '', m: 'い'}, {w: 'c', p: '', m: 'う'}, {w: 'd', p: '', m: 'え'}]}]});
  await p.click('#startBtn'); await sleep(100);
  check('英→日の問題に lang="en"', await p.$eval('#prompt', e => e.lang) === 'en');
  check('出題すると問題のカードにフォーカスが移る', await p.evaluate(() => document.activeElement.id) === 'qcard');
  for (const s of ['#quitBtn', '#speakBtn']) { const [w, h] = await size(s); check(`${s} のタップ範囲が 44px 以上`, w >= 44 && h >= 44, `${w}×${h}`); }
  // 正誤の読み上げ
  const ans = await p.evaluate(() => [...document.querySelectorAll('.choice')].findIndex(b => b.lastChild.textContent === window.__x) );
  const correct = await p.evaluate(() => { const w = document.querySelector('#prompt').textContent; const raw = window.WORD_SPRINT_DECKS.find(d => d.id === 'basic').raw; const m = raw.split('\n').find(l => l.startsWith(w + '|')).split('|')[2]; return [...document.querySelectorAll('.choice')].findIndex(b => b.lastChild.textContent === m); });
  await p.click(`.choice:nth-child(${(correct + 1) % 4 + 1})`); await sleep(50);
  const ann = await p.$eval('#announce', e => [e.textContent, e.getAttribute('aria-live')]);
  check('不正解を aria-live で伝え、正解も言う', ann[1] === 'assertive' && /^不正解。正解は .+/.test(ann[0]), ann[0]);
  await p.keyboard.press('Enter'); await sleep(100);
  check('次の問題で読み上げ欄が空に戻る', await p.$eval('#announce', e => e.textContent) === '');
  // 日→英：選択肢に lang=en
  await p.keyboard.press('Escape'); await sleep(150);
  await load({settings: {deck: 'basic', dir: 'j2e', count: 10}});
  await p.click('#startBtn'); await sleep(100);
  check('日→英の問題は lang="ja"、選択肢は lang="en"', await p.$eval('#prompt', e => e.lang) === 'ja' && (await p.$$eval('.choice span:last-child', s => s.every(x => x.lang === 'en'))));
  await p.keyboard.press('Escape'); await sleep(150);
  check('ホームに戻ると見出しにフォーカス', await p.evaluate(() => document.activeElement.id) === 'curName');
  // 設定ボタンの選択状態
  await p.click('#settingsBtn'); await sleep(100);
  check('設定ボタンが aria-pressed で選択状態を伝える', JSON.stringify(await p.$$eval('.seg[data-key=dir] button', bs => bs.map(x => x.getAttribute('aria-pressed')))) === '["false","true","false"]');
  check('設定の各行は名前つきの group', await p.$$eval('.seg', ss => ss.every(s => s.getAttribute('role') === 'group' && document.getElementById(s.getAttribute('aria-labelledby')))));
  await p.keyboard.press('Escape'); await sleep(100);
  // デッキ一覧：操作できる要素の入れ子なし、編集は 44px
  await load({decks: [{id: 'c1', name: '自作', words: [{w: 'a', p: '', m: 'あ'}, {w: 'b', p: '', m: 'い'}, {w: 'c', p: '', m: 'う'}, {w: 'd', p: '', m: 'え'}]}]});
  check('デッキの行にボタンの入れ子が無い', await p.$$eval('#decks button', bs => bs.every(x => !x.querySelector('button'))));
  const [ew, eh] = await size('.deck-row .edit'); check('編集ボタンのタップ範囲が 44px 以上', ew >= 44 && eh >= 44, `${ew}×${eh}`);
  await p.click('.deck-row .edit'); await sleep(100);
  check('編集ボタンでエディタが開き、見出しにフォーカス', await p.$eval('#editor', e => !e.hidden) && await p.evaluate(() => document.activeElement.id) === 'editTitle');
  // ダークモードの番号の文字色
  await p.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'dark'}]);
  const dark = await p.evaluate(() => { const s = getComputedStyle(document.documentElement); return [s.getPropertyValue('--on-mark').trim(), s.getPropertyValue('--on-accent').trim()]; });
  check('ダークモードでは番号・ボタンの文字を濃い色にする', dark.join() === '#0f1115,#0f1115', dark.join());
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
