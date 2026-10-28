const {P, P1, K, sleep, check, launch, serve, run} = require('./lib');
const fs = require('fs'), path = require('path');
let BASE;
const S = 'attach\u0001';
const getStats = p => p.evaluate(P => JSON.parse(localStorage.getItem(P + 'stats')), P);
run(async () => {
  ({base: BASE} = await serve());
  const b = await launch(); const errs = [];
  const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(BASE);
  // 1. 初めて開くと既定は TOEIC 300・基礎
  await p.evaluate(() => localStorage.clear()); await p.goto(BASE); await sleep(150);
  const names = await p.$$eval('.deck:not(.new) .dn', es => es.map(e => e.textContent));
  check('内蔵デッキが 7 つ、この順で並ぶ', names.join('/') === 'TOEIC 300・基礎/TOEIC 300・頻出/TOEIC 熟語/中学基礎/中上級/上級/IT・エンジニア', names.join('/'));
  check('既定のデッキは TOEIC 300・基礎', (await p.$eval('.deck.on .dn', e => e.textContent)) === 'TOEIC 300・基礎');

  // 2. 旧「TOEIC頻出」を選んでいた人は TOEIC 300・頻出へ。書き方を変えた語の記録を移す。
  // 前の版（v1・方向の無い記録）の保存から始めて、v2 への写しと合わせて確かめる
  await p.evaluate((P, S) => {
    localStorage.clear();
    localStorage.setItem(P + 'settings', JSON.stringify({deck: 'toeic'}));
    localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: '自作', words: [{w: 'abandon', p: '', m: '捨てる'}, {w: 'a', p: '', m: 'b'}, {w: 'c', p: '', m: 'd'}, {w: 'e', p: '', m: 'f'}]}]));
    localStorage.setItem(P + 'stats', JSON.stringify({
      [S + '添付する、取り付ける']: {c: 2, w: 1, t: 100}, [S + '添付する']: {c: 1, w: 0, t: 200},
      'terminate\u0001終了させる': {c: 4, w: 0}, 'zzz\u0001q': {c: 1, w: 0}, 'abandon\u0001捨てる': {c: 5, w: 0},
      'abandon\u0001捨てる、放棄する': {c: 1, w: 1, t: 5}}));
  }, P1, S);
  await p.goto(BASE); await sleep(150);
  check('旧「TOEIC頻出」を選んでいた人は TOEIC 300・頻出が選ばれる', (await p.$eval('.deck.on .dn', e => e.textContent)) === 'TOEIC 300・頻出');
  const st = await getStats(p), J = JSON.stringify, both = (w, m, v) => ['e2j', 'j2e'].every(d => J(st[K(w, m, d)]) === J(v));
  check('書き方の違う旧キーの記録を新キーに足す（回数は合計、時刻は新しい方。両方向とも）', both('attach', '添付する', {c: 3, w: 1, t: 200}) && !st[K('attach', '添付する、取り付ける')], J(st[K('attach', '添付する')]));
  check('相手に記録が無ければそのまま移す', both('terminate', '終了させる、解除する', {c: 4, w: 0}) && !st[K('terminate', '終了させる')]);
  check('内蔵デッキに無い単語の記録は触らない', both('zzz', 'q', {c: 1, w: 0}));
  check('自作デッキが使っているキーは移さない', both('abandon', '捨てる', {c: 5, w: 0}) && both('abandon', '捨てる、放棄する', {c: 1, w: 1, t: 5}));
  check('設定と自作デッキも v2 へ写り、v1 の保存は残る', await p.evaluate((P, P1) => JSON.parse(localStorage.getItem(P + 'decks'))[0].name === '自作' && !!localStorage.getItem(P1 + 'stats'), P, P1));
  await p.goto(BASE); await sleep(150);
  check('開き直しても記録は変わらない（二重に足さない）', JSON.stringify(await getStats(p)) === JSON.stringify(st));

  // 3. 古い版で書き出したバックアップを読み込んでも、記録が新キーへ移る
  fs.writeFileSync(path.join(require('os').tmpdir(), 'word-sprint-old-backup.json'), JSON.stringify({app: 'word-sprint', format: 1, exportedAt: '2026-10-01T00:00:00Z', settings: {}, decks: [], stats: {'replace\u0001取り替える': {c: 2, w: 2, t: 9}}}));
  await (await p.$('#importFile')).uploadFile(path.join(require('os').tmpdir(), 'word-sprint-old-backup.json')); await sleep(200);
  await p.click('#importMerge'); await sleep(200);
  const st3 = await getStats(p);
  check('古いバックアップ（format 1）の記録は両方向に写り、新キーへ移る', ['e2j', 'j2e'].every(d => JSON.stringify(st3[K('replace', '交換する、取って代わる', d)]) === JSON.stringify({c: 2, w: 2, t: 9})) && !st3[K('replace', '取り替える')], JSON.stringify(st3[K('replace', '交換する、取って代わる')]));

  // 4. 誤答に、正解と語義が重なる語を出さない（語義の重なる組のあるデッキの全語 × 両方向）。
  // 1 問ずつ外から操作すると遅いので、ページの中で正解を押し、Enter で次へ進めながら全部見る
  for (const id of ['toeic300-basic', 'toeic300-core', 'toeic-phrases']) for (const dir of ['e2j', 'j2e']) {
    await p.evaluate((P, id, dir) => { localStorage.clear(); localStorage.setItem(P + 'settings', JSON.stringify({deck: id, dir, count: 0})); }, P, id, dir);
    await p.goto(BASE); await sleep(100); await p.click('#startBtn'); await sleep(60);
    const [n, total, bad] = await p.evaluate((id, dir) => {
      const words = window.WORD_SPRINT_DECKS.find(d => d.id === id).raw.trim().split('\n').map(l => l.split('|')).map(([w, , m]) => ({w, m}));
      const byW = new Map(words.map(x => [x.w, x])), byM = new Map(words.map(x => [x.m, x])), gl = m => m.split('、');
      const bad = []; let n = 0;
      while (!document.querySelector('#quiz').hidden && n < words.length) {
        const prompt = document.querySelector('#prompt').textContent, bs = [...document.querySelectorAll('.choice')];
        const opts = bs.map(b => b.lastChild.textContent);
        // 日→英で意味が同じ語が 2 つある（estimate・quote ＝「見積もり」）ときは、選択肢に出ているほうが正解
        const it = dir === 'e2j' ? byW.get(prompt) : words.find(x => x.m === prompt && opts.includes(x.w));
        // 意味が完全に同じ語（estimate・quote ＝「見積もり」）は同じ選択肢として出ないので、意味で引いた語は it とみなす
        for (const o of opts.map(o => dir === 'e2j' ? byM.get(o) : byW.get(o))) if (o.m !== it.m && gl(o.m).some(s => gl(it.m).includes(s))) bad.push(`${it.w}「${it.m}」に ${o.w}「${o.m}」`);
        bs[opts.indexOf(dir === 'e2j' ? it.m : it.w)].click(); n++;
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      }
      return [n, words.length, bad];
    }, id, dir);
    check(`${id} ${dir}：語義の重なる誤答が出ない`, bad.length === 0 && n === total, `${n} / ${total} 問中 ${bad.length} 件 ${bad.slice(0, 3).join(' ; ')}`);
  }

  // 5. 全部の語義が重なる小さい自作デッキでも 4 択が作れる。品詞 phr は「熟語」
  await p.evaluate(P => { localStorage.clear();
    localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: '走る', words: [{w: 'a', p: 'phr', m: '走る、急ぐ'}, {w: 'b', p: 'phr', m: '走る'}, {w: 'c', p: 'phr', m: '走る、逃げる'}, {w: 'd', p: 'phr', m: '走る、流れる'}]}]));
    localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0})); }, P);
  await p.goto(BASE); await sleep(100); await p.click('#startBtn'); await sleep(60);
  check('語義が全部重なる 4 語のデッキでも 4 択になる', (await p.$$('.choice')).length === 4);
  check('品詞 phr は「熟語」と表示する', (await p.$eval('#pos', e => e.textContent)) === '熟語');
  await p.keyboard.press('Escape'); await sleep(100);

  // 6. クイズが普通に回る
  await p.evaluate(P => { localStorage.clear(); localStorage.setItem(P + 'settings', JSON.stringify({deck: 'upper', count: 10})); }, P);
  await p.goto(BASE); await sleep(150); await p.click('#startBtn'); await sleep(100);
  for (let i = 0; i < 40 && await p.$eval('#quiz', e => !e.hidden); i++) { await p.keyboard.press('1'); await sleep(40); await p.keyboard.press('Enter'); await sleep(40); }
  await sleep(300);
  check('中上級で 10 問解くと結果画面', await p.$eval('#result', e => !e.hidden));
  check('ページのエラーなし', errs.length === 0, errs.join(' ; '));
  await b.close();
});
