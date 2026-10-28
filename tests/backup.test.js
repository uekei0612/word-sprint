const {P, K, sleep, check, launch, serve, run} = require('./lib');
const fs = require('fs'), path = require('path');
let BASE; const DL = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dl-'));
const K1 = (w, m) => w + '\u0001' + m; // format 1 のキー（出題方向なし）
const snap = p => p.evaluate(P => ({stats: JSON.parse(localStorage.getItem(P + 'stats') || '{}'), decks: JSON.parse(localStorage.getItem(P + 'decks') || '[]'), settings: JSON.parse(localStorage.getItem(P + 'settings') || '{}')}), P);
const seed = (p, d) => p.evaluate((P, d) => { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(P + k, JSON.stringify(v)); }, P, d);
run(async () => {
  ({base: BASE} = await serve());
  const b = await launch(); const p = await b.newPage(); const errs = [], dialogs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', async d => { dialogs.push(d.message()); await (p.__dismissNext ? d.dismiss() : d.accept()); p.__dismissNext = false; });
  const cdp = await p.createCDPSession(); await cdp.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: DL});
  await p.goto(BASE);
  const deckA = {id: 'c1', name: '自作A', words: [{w: 'well, then', p: '', m: 'さて'}, {w: 'he said "hi"', p: '', m: 'x'}, {w: 'apple', p: '', m: 'りんご'}, {w: 'pear', p: '', m: '梨'}]};
  const orig = {stats: {[K('family', '家族')]: {c: 3, w: 1, t: 100}, [K('apple', 'りんご')]: {c: 1, w: 2, t: 200}}, decks: [deckA], settings: {deck: 'c1', dir: 'j2e', count: 10, limit: 3, speak: true, example: 'all', okDelay: 1000, newPerDay: 20, theme: 'dark', icon: 'red'}};
  await seed(p, orig); await p.goto(BASE); await sleep(300);

  // 1. 書き出し
  await p.click('#settingsBtn'); await sleep(150); await p.click('#exportBtn'); await sleep(1000);
  const files = fs.readdirSync(DL).filter(f => f.endsWith('.json'));
  const exp = files.length ? JSON.parse(fs.readFileSync(path.join(DL, files[0]), 'utf8')) : null;
  check('書き出すと word-sprint-backup-YYYYMMDD.json ができる', files.length === 1 && /^word-sprint-backup-\d{8}\.json$/.test(files[0]), files.join(','));
  check('中身に記録・自作デッキ・設定がそのまま入る', exp && exp.app === 'word-sprint' && exp.format === 2 && JSON.stringify(exp.stats) === JSON.stringify(orig.stats) && JSON.stringify(exp.decks) === JSON.stringify(orig.decks) && JSON.stringify(exp.settings) === JSON.stringify(orig.settings));

  // 2. 往復：消してから「置き換え」で読み込むと元に戻る
  await seed(p, {}); await p.goto(BASE); await sleep(200);
  const input = await p.$('#importFile'); await input.uploadFile(path.join(DL, files[0])); await sleep(400);
  const summary = await p.$eval('#importSummary', e => e.textContent);
  check('読み込むと中身の要約つきのダイアログが出る', await p.$eval('#importDlg', e => e.open) && /単語 2 語分・自作デッキ 1 個/.test(summary), summary);
  await p.click('#importReplace'); await sleep(400);
  const after = await snap(p);
  check('書き出し → 全消去 → 置き換えで、記録・自作デッキ・設定が完全に元に戻る', JSON.stringify(after.stats) === JSON.stringify(orig.stats) && JSON.stringify(after.decks) === JSON.stringify(orig.decks) && JSON.stringify(after.settings) === JSON.stringify(orig.settings), JSON.stringify(after.settings));
  check('画面にも反映される（自作デッキが選択され、設定ボタンも戻る）', await p.$eval('#curName', e => e.textContent) === '自作A' && JSON.stringify(await p.$$eval('.seg button.on', b => b.map(x => x.textContent))) === '["日→英","10","3秒","オン","毎回","1秒","20語","ダーク","赤"]');

  // 3. 統合
  const deckB = {id: 'c1', name: '別物B', words: [{w: 'dog', p: '', m: '犬'}, {w: 'cat', p: '', m: '猫'}, {w: 'cow', p: '', m: '牛'}, {w: 'pig', p: '', m: '豚'}]};
  await seed(p, {stats: {[K('family', '家族')]: {c: 1, w: 0, t: 999}, [K('river', '川')]: {c: 2, w: 2, t: 5}}, decks: [deckA, deckB].map((d, i) => i ? {...d, id: 'c9'} : d), settings: {deck: 'basic'}});
  await p.goto(BASE); await sleep(200);
  const file2 = path.join(DL, 'merge.json');
  fs.writeFileSync(file2, JSON.stringify({app: 'word-sprint', format: 1, exportedAt: '2026-10-01T00:00:00Z', settings: {deck: 'c1', count: 50},
    stats: {[K1('family', '家族')]: {c: 3, w: 1, t: 100}, [K1('apple', 'りんご')]: {c: 1, w: 2, t: 200}}, decks: [deckA, {...deckB, id: 'c1', name: '同じidの別デッキ', words: [{w: 'sun', p: '', m: '太陽'}, {w: 'moon', p: '', m: '月'}, {w: 'star', p: '', m: '星'}, {w: 'sky', p: '', m: '空'}]}]}));
  await (await p.$('#importFile')).uploadFile(file2); await sleep(400);
  await p.click('#importMerge'); await sleep(400);
  const m = await snap(p);
  check('統合：同じ語は回答数の多い方を残し、片方にしか無い語は両方残る（format 1 の記録は両方向に写る）',
    m.stats[K('family', '家族')].c === 3 && m.stats[K('family', '家族', 'j2e')].c === 3 && m.stats[K('river', '川')].c === 2 && m.stats[K('apple', 'りんご', 'j2e')].w === 2 && Object.keys(m.stats).length === 5, JSON.stringify(m.stats));
  check('統合：中身が同じ自作デッキは重複させず、id が衝突する別デッキは名前に（読み込み）を付けて足す',
    m.decks.length === 3 && m.decks.filter(d => d.name === '自作A').length === 1 && m.decks.some(d => d.name === '同じidの別デッキ（読み込み）' && d.id !== 'c1'), m.decks.map(d => d.id + ':' + d.name).join(', '));
  check('統合：設定は今のまま（ファイル側の deck=c1・count=50 にならない）', m.settings.deck === 'basic' && m.settings.count === 20, JSON.stringify(m.settings));

  // 4. 置き換えの確認でキャンセルすると何も変わらない
  const before4 = await snap(p);
  await (await p.$('#importFile')).uploadFile(path.join(DL, files[0])); await sleep(400);
  p.__dismissNext = true; await p.click('#importReplace'); await sleep(400);
  check('置き換えの確認でキャンセルすると、何も変わらない', JSON.stringify(await snap(p)) === JSON.stringify(before4));
  await p.click('#importCancel'); await sleep(200);

  // 5. 関係ないファイル・壊れたファイル
  for (const [name, body] of [['bad.json', '{broken'], ['other.json', JSON.stringify({foo: 1})], ['future.json', JSON.stringify({app: 'word-sprint', format: 99})]]) {
    fs.writeFileSync(path.join(DL, name), body); dialogs.length = 0;
    await (await p.$('#importFile')).uploadFile(path.join(DL, name)); await sleep(400);
    check(`読めないファイル（${name}）は案内を出して何も変えない`, dialogs.some(d => d.includes('ファイルではないか')) && !(await p.$eval('#importDlg', e => e.open)) && JSON.stringify(await snap(p)) === JSON.stringify(before4));
  }

  // 6. ダイアログ中は Enter でクイズが始まらない
  await (await p.$('#importFile')).uploadFile(path.join(DL, files[0])); await sleep(400);
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('Enter'); await sleep(200);
  check('ダイアログを開いている間は Enter でクイズが始まらない', await p.$eval('#quiz', e => e.hidden));
  await p.keyboard.press('Escape'); await sleep(200);
  check('ページのエラーなし', errs.length === 0, errs.join(' ; '));
  await b.close();
});
