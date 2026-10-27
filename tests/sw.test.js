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
const barShown = (p, ms) => p.waitForFunction(() => !document.querySelector('#updateBar').hidden, {timeout: ms}).then(() => true, () => false);
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
  check('初回の訪問では更新通知を出さない', !(await barShown(p, 2500)));

  // オフライン：サーバーを止めても開いてクイズができる
  await stop();
  await p.reload(); await sleep(500);
  const decks = await p.$$eval('#decks .deck:not(.new)', e => e.length);
  await p.keyboard.press('Enter'); await sleep(200);
  await p.keyboard.press('1'); await sleep(100);
  const answered = await p.$$eval('.choice', b => b.some(x => x.disabled));
  check('サーバー停止中でも開き、7 デッキが出てクイズに回答できる', decks === 7 && answered, `decks=${decks}`);
  await p.keyboard.press('Escape'); await start();

  // 更新：app.js を変えると、確認のあと通知が出て、「更新する」で新しい版になる
  fs.appendFileSync(SITE + '/app.js', '\nwindow.__ver = 2;\n');
  await sleep(INTERVAL + 500); // 確認の最短間隔を待つ
  await p.goto(BASE);
  const shown = await barShown(p, 8000);
  check('ファイルを変えると、開いたときに更新通知が出る', shown);
  check('通知の時点では、今の画面は古い版のまま（新旧が混ざらない）', await p.evaluate(() => window.__ver === undefined));
  await Promise.all([p.waitForNavigation(), p.click('#updateReload')]); await sleep(300);
  check('「更新する」で新しい版になる', await p.evaluate(() => window.__ver === 2));

  // 1 ファイルでも取れないときは差し替えない
  fs.appendFileSync(SITE + '/app.js', '\nwindow.__ver = 3;\n');
  fs.renameSync(SITE + '/decks/it.js', SITE + '/decks/it.js.bak');
  await sleep(INTERVAL + 500);
  await p.goto(BASE);
  const shown2 = await barShown(p, 6000);
  const c2 = await cachedText(p, 'app.js');
  check('1 ファイルが 404 のときは差し替えず、通知も出さない', !shown2 && c2.includes('__ver = 2;') && !c2.includes('__ver = 3;'));
  fs.renameSync(SITE + '/decks/it.js.bak', SITE + '/decks/it.js');

  // アプリに戻ってきたとき（visibilitychange）にも確認する
  await sleep(INTERVAL + 500);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false}); document.dispatchEvent(new Event('visibilitychange')); });
  check('アプリに戻ってきたときの確認でも更新通知が出る', await barShown(p, 8000));
  check('差し替え後のキャッシュは全部新しい版', (await cachedText(p, 'app.js')).includes('__ver = 3;') && (await cachedText(p, 'decks/it.js')) !== null);
  check('ページのエラーなし', errs.length === 0, errs.join(' ; '));
  await b.close(); await stop();
  fs.rmSync(SITE, {recursive: true, force: true});
});
