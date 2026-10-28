// 見た目の設定：ライト・ダークの選択（端末の設定より優先・読み込み直後から）と、ホーム画面のアイコンの色（apple-touch-icon の差し替え）
const {ROOT, P, sleep, check, launch, serve, run} = require('./lib');
const fs = require('fs'), path = require('path');
const LIGHT = 'rgb(246, 247, 251)', DARK = 'rgb(15, 17, 21)';
run(async () => {
  const srv = await serve(); const BASE = srv.base;
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  // body が作られた時点の data-theme を残す（app.js より前に当たっているか）
  await p.evaluateOnNewDocument(() => new MutationObserver((_, o) => { if (document.body) { window.__early = document.documentElement.dataset.theme || ''; o.disconnect(); } }).observe(document, {childList: true, subtree: true}));
  const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const metas = () => p.$$eval('meta[name="theme-color"]', l => l.map(m => m.content).join());
  const pick = async (key, val) => { await p.click('#settingsBtn'); await sleep(80); await p.click(`.seg[data-key="${key}"] button[data-val="${val}"]`); await sleep(40); await p.click('#settingsDlg [data-close]'); await sleep(60); };
  const scheme = v => p.emulateMediaFeatures([{name: 'prefers-color-scheme', value: v}]);

  // 1. 既定は端末に合わせる
  await scheme('light');
  await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(150);
  check('既定は「端末に合わせる」：端末がライトならライト', (await bg()) === LIGHT && await p.evaluate(() => !('theme' in document.documentElement.dataset)));
  await scheme('dark'); await sleep(50);
  check('端末がダークならダーク', (await bg()) === DARK);
  check('ステータスバーの色は端末に合わせて 2 つ（ライト・ダーク）', (await metas()) === '#4f46e5,#0f1115');

  // 2. ⚙ でライトを選ぶと、端末がダークでもライト
  await pick('theme', 'light');
  check('「ライト」を選ぶと、端末がダークでもライトになる', (await bg()) === LIGHT && (await p.$eval('html', e => e.dataset.theme)) === 'light');
  check('ステータスバーの色もライトにそろえる', (await metas()) === '#4f46e5,#4f46e5');
  check('選んだボタンが押された状態になる', await p.$eval('.seg[data-key="theme"] button[data-val="light"]', e => e.getAttribute('aria-pressed') === 'true'));
  await p.reload(); await sleep(150);
  check('開き直しても残り、描く前（app.js より先）に当たる', (await bg()) === LIGHT && (await p.evaluate(() => window.__early)) === 'light');

  // 3. ダークを選ぶと、端末がライトでもダーク
  await scheme('light');
  await pick('theme', 'dark');
  check('「ダーク」を選ぶと、端末がライトでもダークになる', (await bg()) === DARK && (await metas()) === '#0f1115,#0f1115');
  check('ダークではフォームの部品もダークにする（color-scheme）', (await p.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'dark');
  await p.reload(); await sleep(150);
  check('ダークも描く前に当たる', (await p.evaluate(() => window.__early)) === 'dark');

  // 4. 端末に合わせるに戻す
  await pick('theme', 'auto');
  check('「端末に合わせる」に戻すと、端末の設定（ライト）に戻る', (await bg()) === LIGHT && (await metas()) === '#4f46e5,#0f1115' && await p.evaluate(() => !('theme' in document.documentElement.dataset)));

  // 5. アイコンの色
  const icon = () => p.$eval('link[rel="apple-touch-icon"]', e => e.getAttribute('href'));
  check('アイコンの既定は藍（今までのアイコン）', (await icon()) === 'icons/apple-touch-icon.png');
  const sw = await p.$$eval('.seg[data-key="icon"] button', l => l.map(x => x.textContent + ':' + x.style.getPropertyValue('--swatch')).join());
  check('色の選択肢は 6 つで、色見本つき', sw === '藍:#4f46e5,青:#0369a1,緑:#047857,赤:#be123c,橙:#c2410c,黒:#1f2937', sw);
  check('ブラウザでは「この後追加したアイコンの色」と説明する', /この後「ホーム画面に追加」したときのアイコンの色/.test(await p.$eval('#iconNote', e => e.textContent)));
  await pick('icon', 'green');
  check('緑を選ぶと apple-touch-icon を緑に差し替える', (await icon()) === 'icons/apple-touch-icon-green.png');
  const st = await p.evaluate(h => fetch(h).then(r => r.status + ' ' + r.headers.get('content-type')), await icon());
  check('差し替えた先のアイコンが配られている', st === '200 image/png', st);
  await p.reload(); await sleep(150);
  check('開き直しても緑のまま', (await icon()) === 'icons/apple-touch-icon-green.png');

  // 6. 壊れた値は捨てる（既定に戻る）
  await p.evaluate(P => localStorage.setItem(P + 'settings', JSON.stringify({theme: 'purple', icon: 'pink'})), P);
  await p.reload(); await sleep(150);
  check('知らない値は捨てて既定（端末に合わせる・藍）に戻す', (await p.evaluate(() => window.__early)) === '' && (await icon()) === 'icons/apple-touch-icon.png' && (await bg()) === LIGHT);
  await p.close();

  // 7. ホーム画面アプリでは、アイコンが変えられないことと変え方を書く
  const q = await b.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'standalone', {get: () => true}));
  await q.goto(BASE); await sleep(150);
  check('ホーム画面アプリでは、追加し直す手順と記録の注意を書く', /追加したときの色のまま/.test(await q.$eval('#iconNote', e => e.textContent)) && /書き出して/.test(await q.$eval('#iconNote', e => e.textContent)));
  await q.close();

  // 8. 色ごとの PNG（180px）がそろっている
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const names = Object.keys(Function('return ' + src.match(/iconColors: (\{.*\}),/)[1])());
  const bad = names.filter(n => { const f = path.join(ROOT, 'icons', n === 'indigo' ? 'apple-touch-icon.png' : `apple-touch-icon-${n}.png`);
    if (!fs.existsSync(f)) return true; const d = fs.readFileSync(f); return d.readUInt32BE(16) !== 180 || d.readUInt32BE(20) !== 180; });
  check('CONFIG.iconColors の色ごとに 180px の PNG がある', names.length === 6 && bad.length === 0, bad.join(','));

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close(); await srv.close();
});
