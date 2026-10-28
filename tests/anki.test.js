// Anki の「ノートをプレーンテキストで書き出し」の取り込み（#10）と #columns:。見本は tests/fixtures/anki/（Anki 26.09.3 で実際に書き出したもの。作り方は gen.py）
const {ROOT, P, sleep, check, launch, fileUrl, run} = require('./lib');
const fs = require('fs'), path = require('path');
const FX = path.join(__dirname, 'fixtures', 'anki');
run(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const a = src.indexOf('const unquote'), b = src.indexOf('const updCount');
  const {parseList, isTable} = new Function(src.slice(a, b) + '; return {parseList, isTable};')();
  const fx = n => fs.readFileSync(path.join(FX, n), 'utf8');
  const wm = s => JSON.stringify(parseList(s).map(x => x.e ? [x.w, x.m, x.e, x.j] : [x.w, x.m]));
  const expect = JSON.stringify([['abandon', '放棄する 見捨てる'], ['look forward to', '楽しみに待つ & 期待する'], ['quote "this"', '引用する'],
    ['tab here', 'タブ, カンマ; 区切り'], ['multi', '1行目 2行目'], ['<tag>', '山括弧']]);

  check('HTML あり：タグ・&nbsp; などの文字参照・音声の参照を取り除き、囲みの中のタブと改行も読める', wm(fx('html.txt')) === expect, wm(fx('html.txt')));
  check('GUID・ノートタイプ・デッキ・タグの列があっても、単語と意味だけを読む', wm(fx('html-all.txt')) === expect, wm(fx('html-all.txt')));
  check('HTML なし（#html:false）：Anki が取り除いた後なので、<tag> のような語はそのまま', wm(fx('plain-all.txt')) === expect, wm(fx('plain-all.txt')));
  check('3・4 列目の例文と和訳を読む（例文の HTML と音声も取り除く。欄の無い行も読む）', wm(fx('example.txt')) === JSON.stringify([['deploy', '配備する', 'We deploy on Fridays.', '金曜にデプロイする。'], ['run', '走る', 'I run every day.', '毎日走る。'], ['go', '行く']]), wm(fx('example.txt')));
  check('Anki の書き出しと見分ける（ふつうの CSV は違う）', isTable(fx('html.txt')) && isTable('﻿' + fx('plain-all.txt')) && !isTable('apple,りんご\n#memo\nx,y') && !isTable('# 単語帳\napple,りんご'));
  // #columns: で列を指定する
  check('#columns: で列の割り当てを指定できる（- は読まない列）', wm('#columns:意味,単語,-,例文,和訳\nりんご\tapple\tメモ\tAn apple a day.\t1日1個') === JSON.stringify([['apple', 'りんご', 'An apple a day.', '1日1個']]));
  check('#columns: と #separator: を合わせて使える（英語の列名・カンマ区切り・囲み）', wm('#separator:comma\n#columns:word,meaning\n"well, then",さて\nx,y') === JSON.stringify([['well, then', 'さて'], ['x', 'y']]));
  check('Anki の見出しの 3 列目が英文でなければ読まない（意味に足さない）', wm('#separator:tab\n#html:false\nrun\t走る\tはしる') === JSON.stringify([['run', '走る']]));
  check('同じ単語・意味は 1 つにする', wm('#separator:tab\nrun\t走る\nrun\t走る') === JSON.stringify([['run', '走る']]));
  // 既存の読み込みは変わらない（csv.test.js の主な形を念のため）
  check('見出しの無いふつうの CSV・タブ区切り・| 区切りは今までどおり', wm('apple,りんご\nlend | 貸す\nwell, then\tさて\n# メモ\nrun,走る,経営する') === JSON.stringify([['apple', 'りんご'], ['lend', '貸す'], ['well, then', 'さて'], ['run', '走る,経営する']]));

  // 画面：エディタの「ファイル読込」で Anki の書き出しを読むと、直した行が入り、そのまま保存できる
  const br = await launch(); const p = await br.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(fileUrl()); await p.evaluate(() => localStorage.clear()); await p.goto(fileUrl()); await sleep(100);
  await p.click('.deck.new'); await sleep(100);
  await (await p.$('#fileIn')).uploadFile(path.join(FX, 'html-all.txt')); await sleep(300);
  const ta = await p.$eval('#customText', e => e.value);
  check('ファイル読込で Anki の書き出しを読むと、HTML を除いた「単語,意味」の行にして入れる', ta.split('\n')[0] === 'abandon,放棄する 見捨てる' && !/[<>]b|sound|#separator/.test(ta) && ta.split('\n').length === 6, ta);
  check('デッキ名はファイル名、語数は 6 語', (await p.$eval('#deckName', e => e.value)) === 'html-all' && (await p.$eval('#editCount', e => e.textContent)) === '6 語');
  await p.click('#saveCustom'); await sleep(150);
  const decks = await p.evaluate(P => JSON.parse(localStorage.getItem(P + 'decks')), P);
  check('保存すると単語と意味が入る', decks.length === 1 && decks[0].words.map(x => x.w).join('|') === 'abandon|look forward to|quote "this"|tab here|multi|<tag>', JSON.stringify(decks[0] && decks[0].words.map(x => x.w)));
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await br.close();
});
