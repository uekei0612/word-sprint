// ホーム画面に追加する案内（#19）：iPhone のブラウザでだけ出す・閉じたら出さない・ホーム画面アプリと file:// では出さない・Android のインストール
const {P, sleep, check, launch, serve, fileUrl, run} = require('./lib');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
run(async () => {
  const srv = await serve(); const BASE = srv.base;
  const b = await launch(); const errs = [];
  const page = async ({ua, standalone} = {}) => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.setViewport({width: 390, height: 844});
    if (ua) await p.setUserAgent(ua);
    // テストの Chrome は本物の beforeinstallprompt を出す（iPhone は出さない）。本物は止め、テストで作ったもの（__fake）だけを通す
    await p.evaluateOnNewDocument(() => window.addEventListener('beforeinstallprompt', e => { if (!e.__fake) e.stopImmediatePropagation(); }, true));
    if (standalone) await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'standalone', {get: () => true}));
    return p;
  };
  const shown = p => p.$eval('#installBar', e => !e.hidden);

  // 1. iPhone の Safari：出す。閉じたら出さない
  let p = await page({ua: IPHONE});
  await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(150);
  check('iPhone のブラウザでは案内を出す', await shown(p));
  const text = await p.$eval('#installText', e => e.textContent);
  check('共有ボタン →「ホーム画面に追加」の手順と、記録が別になることを書く', /共有ボタン →「ホーム画面に追加」/.test(text) && /記録はこのブラウザとは別/.test(text) && !/書き出す/.test(text), text);
  check('iPhone ではインストールのボタンを出さない（手順だけ）', await p.$eval('#installBtn', e => e.hidden));
  await p.evaluate(P => localStorage.setItem(P + 'stats', JSON.stringify({['a\u0001b\u0001e2j']: {c: 1, w: 0}})), P); await p.reload(); await sleep(150);
  check('記録があるときは、書き出し → 読み込みで移せることも添える', /「書き出す」→ アプリで「読み込む」/.test(await p.$eval('#installText', e => e.textContent)));
  await p.click('#installClose'); await sleep(50);
  check('閉じると消える', !(await shown(p)));
  await p.reload(); await sleep(150);
  check('閉じた後は開き直しても出さない', !(await shown(p)));
  await p.close();

  // 2. ホーム画面アプリ（navigator.standalone）では出さない
  p = await page({ua: IPHONE, standalone: true});
  await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(150);
  check('ホーム画面アプリでは出さない', !(await shown(p)));
  await p.close();

  // 3. file:// では出さない（追加できない）
  p = await page({ua: IPHONE});
  await p.goto(fileUrl()); await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(150);
  check('file:// では出さない', !(await shown(p)));
  await p.close();

  // 4. パソコン・Android：ふだんは出さず、beforeinstallprompt が来たらインストールのボタンつきで出す
  p = await page();
  await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(150);
  check('iPhone 以外では、インストールできると分かるまで出さない', !(await shown(p)));
  await p.evaluate(() => { const e = new Event('beforeinstallprompt', {cancelable: true}); e.__fake = true; e.prompt = () => { window.__prompted = true; }; window.dispatchEvent(e); });
  await sleep(50);
  check('beforeinstallprompt が来たら「インストール」つきで出す', await shown(p) && await p.$eval('#installBtn', e => !e.hidden) && /インストールすると/.test(await p.$eval('#installText', e => e.textContent)));
  await p.click('#installBtn'); await sleep(50);
  check('「インストール」を押すとブラウザの確認を出す', await p.evaluate(() => window.__prompted === true));
  await p.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await sleep(50);
  check('インストールしたら消す', !(await shown(p)));
  await p.close();

  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close(); await srv.close();
});
