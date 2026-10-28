const {sleep, check, launch, copySite, serve, run} = require('./lib');
const fs = require('fs');
// 書き換えながら確かめるので、配るファイルを一時フォルダに写して使う
const SITE = copySite();
// 確認の最短間隔（本番は 60 秒）を、テストで配る sw.js だけ 1 秒にする
const INTERVAL = 1000;
const rewrite = (f, d) => f === 'sw.js' ? Buffer.from(String(d).replace(/const CHECK_INTERVAL = [^;]+;/, `const CHECK_INTERVAL = ${INTERVAL};`)) : d;
let server, BASE, PORT = 0;
const start = async () => { server = await serve(SITE, {port: PORT, rewrite}); BASE = server.base; PORT = server.port; };
const stop = () => server.close();
const cachedText = (p, f) => p.evaluate(async f => { const r = await caches.match(f); return r ? r.text() : null; }, f);
run(async () => {
  check('（前提）sw.js に確認の最短間隔 CHECK_INTERVAL があり、テスト用に短くできる', /const CHECK_INTERVAL = [^;]+;/.test(fs.readFileSync(SITE + '/sw.js', 'utf8')));
  // index.html が読むファイルが sw.js の FILES にすべて入っているか（静的な突き合わせ）
  const html = fs.readFileSync(SITE + '/index.html', 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
  const sw = fs.readFileSync(SITE + '/sw.js', 'utf8');
  const FILES = eval(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  const man = JSON.parse(fs.readFileSync(SITE + '/manifest.webmanifest', 'utf8'));
  const need = [...new Set([...refs, ...man.icons.map(i => i.src)])];
  const miss = need.filter(r => !FILES.includes(r));
  check('index.html と manifest が参照するファイルが sw.js の FILES にすべてある', miss.length === 0, `参照 ${need.length} 件` + (miss.length ? ' 不足: ' + miss.join(',') : ''));
  const absent = FILES.filter(f => f !== './' && !fs.existsSync(SITE + '/' + f));
  check('FILES のファイルが実在する', absent.length === 0, absent.join(','));

  await start();
  const b = await launch();
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await sleep(1500);
  const keys = await p.evaluate(async () => (await (await caches.open('word-sprint')).keys()).map(r => r.url.replace(location.origin + '/word-sprint/', '') || './'));
  check('service worker が登録され、全ファイルがキャッシュに入る', FILES.every(f => keys.includes(f === './' ? './' : f)), `${keys.length} 件`);
  const cdp = await p.createCDPSession();
  const inst = await cdp.send('Page.getInstallabilityErrors');
  check('Chrome がインストール可能と判定する（installability エラーなし）', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  await p.reload(); await p.evaluate(() => navigator.serviceWorker.ready); await sleep(500);
  check('再読み込み後は service worker の制御下にある', await p.evaluate(() => !!navigator.serviceWorker.controller));
  check('初回の訪問では読み込み直さない（取り込んだだけで「更新」とみなさない）', !(await p.waitForNavigation({timeout: 2500}).then(() => true, () => false)));

  // オフライン：サーバーを止めても開いてクイズができる
  await stop();
  await p.reload(); await sleep(500);
  const decks = await p.$$eval('#decks .deck:not(.new)', e => e.length);
  await p.keyboard.press('Enter'); await sleep(200);
  await p.keyboard.press('1'); await sleep(100);
  const answered = await p.$$eval('.choice', b => b.some(x => x.disabled));
  check('サーバー停止中でも開き、7 デッキが出てクイズに回答できる', decks === 7 && answered, `decks=${decks}`);
  await p.keyboard.press('Escape'); await start();

  // 更新：app.js を変えると、確認のあと、ホームにいれば自動で読み込み直して新しい版になる
  const ver = () => p.evaluate(() => window.__ver);
  const becomes = (v, ms) => p.waitForFunction(v => window.__ver === v, {timeout: ms}, v).then(() => true, () => false);
  fs.appendFileSync(SITE + '/app.js', '\nwindow.__ver = 2;\n');
  await sleep(INTERVAL + 500); // 確認の最短間隔を待つ
  await p.goto(BASE);
  check('ホームにいるときは、新しい版がそろうと自動で切り替わる', await becomes(2, 10000));
  check('切り替えた後に更新を繰り返さない', !(await becomes(99, 2500)) && await ver() === 2 && await p.$eval('#home', e => !e.hidden));

  // クイズの途中では切り替えず、ホームに戻ったときに切り替える
  fs.appendFileSync(SITE + '/app.js', '\nwindow.__ver = 3;\n');
  await sleep(INTERVAL + 500);
  await p.click('#startBtn'); await sleep(100);
  await p.evaluate(() => localStorage.removeItem('wordsprint.v2.stats'));
  await p.keyboard.press('1'); await sleep(100); // 1 問答えた状態
  const visible = () => p.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false}); document.dispatchEvent(new Event('visibilitychange')); });
  await visible(); // アプリに戻ってきたときの確認
  const got3 = await p.waitForFunction(async () => (await (await caches.match('app.js')).text()).includes('__ver = 3;'), {timeout: 10000}).then(() => true, () => false);
  await sleep(1500);
  const mid = await p.evaluate(P => ({quiz: !document.querySelector('#quiz').hidden, rec: Object.keys(JSON.parse(localStorage.getItem(P + 'stats') || '{}')).length, counter: document.querySelector('#counter').textContent}), 'wordsprint.v2.');
  check('クイズの途中で新しい版がそろっても、読み込み直さない（クイズが続いている）', got3 && await ver() === 2 && mid.quiz && mid.rec === 1, JSON.stringify({got3, ...mid}));
  await p.keyboard.press('Escape'); await sleep(300);
  check('結果画面でも読み込み直さない', await ver() === 2 && await p.$eval('#result', e => !e.hidden));
  await p.click('#homeBtn');
  check('ホームに戻ると新しい版に切り替わる', await becomes(3, 10000));

  // 1 ファイルでも取れないときは差し替えず、読み込み直さない
  fs.appendFileSync(SITE + '/app.js', '\nwindow.__ver = 4;\n');
  fs.renameSync(SITE + '/decks/it.js', SITE + '/decks/it.js.bak');
  await sleep(INTERVAL + 500);
  await p.goto(BASE);
  const moved = await becomes(4, 5000);
  const c2 = await cachedText(p, 'app.js');
  check('1 ファイルが 404 のときは差し替えず、読み込み直さない', !moved && await ver() === 3 && c2.includes('__ver = 3;') && !c2.includes('__ver = 4;'));
  fs.renameSync(SITE + '/decks/it.js.bak', SITE + '/decks/it.js');

  // 設定を開いている間は待ち、閉じたら切り替える（アプリに戻ってきたときの確認で届いた場合）
  await sleep(INTERVAL + 500);
  await p.click('#settingsBtn'); await sleep(100);
  await visible();
  const got4 = await p.waitForFunction(async () => (await (await caches.match('app.js')).text()).includes('__ver = 4;'), {timeout: 10000}).then(() => true, () => false);
  await sleep(1500);
  check('設定を開いている間は読み込み直さない', got4 && await ver() === 3 && !!(await p.$('dialog[open]')));
  await p.click('#settingsDlg [data-close]');
  check('設定を閉じると新しい版に切り替わる', await becomes(4, 10000));
  check('差し替え後のキャッシュは全部新しい版', (await cachedText(p, 'app.js')).includes('__ver = 4;') && (await cachedText(p, 'decks/it.js')) !== null);
  check('ページのエラーなし', errs.length === 0, errs.join(' ; '));
  await b.close(); await stop();
  fs.rmSync(SITE, {recursive: true, force: true});
});
