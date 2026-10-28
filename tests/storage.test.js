const {P, sleep, check, launch, serve, run} = require('./lib');
let BASE;
const total = p => p.evaluate(P => Object.values(JSON.parse(localStorage.getItem(P + 'stats') || '{}')).reduce((a, s) => a + s.c + s.w, 0), P);
// 最初の問題として答えたら 1 を返す（間違えた語の「もう一度」は記録に数えない）
const answerOne = async p => { const first = (await p.$eval('#counter', e => e.textContent)) !== 'もう一度'; await p.keyboard.press('1'); await sleep(60); await p.keyboard.press('Enter'); await sleep(60); return first ? 1 : 0; };
run(async () => {
  ({base: BASE} = await serve());
  const b = await launch(); const errs = [];
  const open = async () => { const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE); return p; };
  const p1 = await open();
  await p1.evaluate(P => { localStorage.clear(); localStorage.setItem(P + 'settings', JSON.stringify({deck: 'basic', count: 50})); }, P);
  await p1.goto(BASE); const p2 = await open();

  // 1. 2 つのタブで交互に回答しても、両方の記録が残る
  await p1.keyboard.press('Enter'); await p2.keyboard.press('Enter'); await sleep(200);
  let answered = 0; for (let i = 0; i < 6; i++) { answered += await answerOne(p1); answered += await answerOne(p2); }
  await sleep(300);
  const t = await total(p1);
  check('2 つのタブで 6 問ずつ交互に回答すると、最初の問題として答えた数だけ記録が残る', t === answered && answered >= 10, `記録 ${t} 回 / 回答 ${answered} 回`);

  // 2. ホームを開いているタブに、別のタブの回答が反映される
  await p2.keyboard.press('Escape'); await sleep(200); await p2.click('#homeBtn'); await sleep(200);
  check('（前提）p2 はホームを表示中', await p2.$eval('#home', e => !e.hidden));
  const seen0 = await p2.$eval('#curStats', e => parseInt(e.textContent.match(/出題 (\d+)/)[1]));
  for (let i = 0; i < 4; i++) await answerOne(p1);
  await sleep(300);
  const seen1 = await p2.$eval('#curStats', e => parseInt(e.textContent.match(/出題 (\d+)/)[1]));
  const keys = await p1.evaluate(P => Object.keys(JSON.parse(localStorage.getItem(P + 'stats'))).length, P);
  check('ホームを開いている別タブの「出題済み」が、保存された記録の語数に追いつく', seen1 === keys && keys > 0, `${seen0} → ${seen1}（記録 ${keys} 語）`);
  await p1.keyboard.press('Escape'); await sleep(200);

  // 3. 保存に失敗したら 1 回だけ知らせる
  const p3 = await open(); await sleep(200);
  await p3.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await p3.keyboard.press('Enter'); await sleep(200); await answerOne(p3);
  check('保存に失敗すると警告が出る', await p3.$eval('#saveErrBar', e => !e.hidden));
  await p3.keyboard.press('Escape'); await sleep(200); await p3.click('#saveErrClose');
  await p3.keyboard.press('Enter'); await sleep(200); await answerOne(p3);
  check('閉じた後は、同じ画面で何度失敗しても出し直さない', await p3.$eval('#saveErrBar', e => e.hidden));
  await p3.close();

  // 4. 壊れた保存データでも開ける（退避してから既定値で動く）
  await p1.evaluate(P => { localStorage.clear();
    localStorage.setItem(P + 'stats', '{bad json');
    localStorage.setItem(P + 'decks', '"not an array"');
    localStorage.setItem(P + 'settings', JSON.stringify({deck: 'basic', count: 'abc', dir: 'zzz', speak: true})); }, P);
  await p1.goto(BASE); await sleep(300);
  const st = await p1.evaluate(P => ({
    broken: Object.keys(localStorage).filter(k => k.startsWith(P + 'broken.')).map(k => k.split('.')[3]).sort(),
    settings: JSON.parse(localStorage.getItem(P + 'settings')), stats: localStorage.getItem(P + 'stats'), decks: localStorage.getItem(P + 'decks'),
    on: [...document.querySelectorAll('.seg button.on')].map(x => x.textContent), decksShown: document.querySelectorAll('#decks .deck:not(.new)').length,
    rawStats: localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith(P + 'broken.stats.')))}), P);
  check('壊れた stats・decks・settings を開いても画面が動く', st.decksShown === 7 && errs.length === 0, errs.join(';'));
  check('壊れた元データは broken.* に退避される（中身はそのまま）', JSON.stringify(st.broken) === '["decks","settings","stats"]' && st.rawStats === '{bad json', JSON.stringify(st.broken));
  check('設定は正しい項目だけ残り、壊れた項目は既定値になる', JSON.stringify(st.settings) === '{"deck":"basic","speak":true}' && JSON.stringify(st.on) === '["英→日","20","なし","オン","間違えたとき","10語","端末に合わせる","藍"]', JSON.stringify(st.settings) + ' ' + st.on);
  check('直した値で保存し直される（次回は退避が増えない）', st.stats === '{}' && st.decks === '[]');
  await p1.goto(BASE); await sleep(200);
  const n2 = await p1.evaluate(P => Object.keys(localStorage).filter(k => k.startsWith(P + 'broken.')).length, P);
  check('開き直しても退避は増えない', n2 === 3, `${n2} 件`);

  // 5. 一部だけ壊れた記録：壊れた語だけ外し、ほかは残す
  await p1.evaluate(P => { localStorage.clear(); localStorage.setItem(P + 'stats', JSON.stringify({'family\u0001家族': {c: 3, w: 1, t: 1}, 'x\u0001y': {c: 'many'}, 'z\u0001w': null})); }, P);
  await p1.goto(BASE); await sleep(200);
  const s5 = await p1.evaluate(P => [JSON.parse(localStorage.getItem(P + 'stats')), Object.keys(localStorage).filter(k => k.startsWith(P + 'broken.stats.')).length], P);
  check('一部だけ壊れた記録は、壊れた語だけ外して残りを保つ', JSON.stringify(s5[0]) === JSON.stringify({'family\u0001家族': {c: 3, w: 1, t: 1}}) && s5[1] === 1, JSON.stringify(s5));
  check('ページのエラーなし', errs.length === 0, errs.join(' ; '));
  await b.close();
});
