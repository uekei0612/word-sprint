// 中断した後に画面が裏に回って戻っても、残っていたタイマーで不正解が記録されない（A2 の修正で入った不具合の再発防止）
const {P, sleep, check, launch, fileUrl, seed, getStore, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await seed(p, INDEX, {settings: {deck: 'basic', dir: 'e2j', count: 10, limit: 3, speak: false}});
  await p.keyboard.press('Enter'); await sleep(200);
  await p.keyboard.press('1'); await sleep(2100);           // 1 問目に回答 → 2 問目が出る
  await p.keyboard.press('Escape'); await sleep(200);        // 2 問目の途中で中断 → 結果画面
  const before = JSON.stringify(await getStore(p, 'stats'));
  const setHidden = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => h}); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true); await sleep(300); await setHidden(false); await sleep(3500); // 制限時間（3 秒）を過ぎるまで待つ
  const after = JSON.stringify(await getStore(p, 'stats'));
  check('中断後にタブが戻っても、記録が増えない', before === after, `${before} → ${after}`);
  check('結果画面のまま、集計は答えた 1 問だけ', await p.$eval('#result', e => !e.hidden) && /\/ 1$/.test(await p.$eval('#rScore', e => e.textContent)));
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
