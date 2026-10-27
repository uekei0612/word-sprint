// 自作デッキの CSV の読み書き（parseList・toLine）の単体テスト。app.js から該当部分だけを取り出して動かす
const {ROOT, check, run} = require('./lib');
const fs = require('fs'), path = require('path');
run(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const a = src.indexOf('const unquote'), b = src.indexOf('const updCount');
  check('（前提）app.js に unquote 〜 updCount の範囲がある', a > 0 && b > a);
  const {parseList, toLine} = new Function(src.slice(a, b) + '; return {parseList, toLine};')();
  const words = [{w: 'he said "hi"', m: '彼は「やあ」と言った'}, {w: 'well, then', m: 'さて, それでは'}, {w: 'a|b', m: 'x\ty'}, {w: 'apple', m: 'りんご'}, {w: 'root cause', m: '"引用"の意味'}];
  const back = parseList(words.map(toLine).join('\r\n')).map(x => ({w: x.w, m: x.m}));
  check('引用符・カンマ・| ・タブを含む語が CSV を往復しても変わらない', JSON.stringify(back) === JSON.stringify(words), JSON.stringify(back));
  const t = s => JSON.stringify(parseList(s).map(x => [x.w, x.m]));
  check('見出し行（word,meaning）は読み飛ばす', t('word,meaning\napple,りんご') === '[["apple","りんご"]]');
  check('タブ区切り（スプレッドシートの貼り付け）', t('英単語\t意味\nwell, then\tさて') === '[["well, then","さて"]]');
  check('カンマ・| ・引用符の混在と、意味の中のカンマ', t('borrow,借りる、貸す\nlend | 貸す\n"x",y\ncurious,好奇心の強い, 詮索好きな') === '[["borrow","借りる、貸す"],["lend","貸す"],["x","y"],["curious","好奇心の強い, 詮索好きな"]]');
  // 3・4 列目の例文と和訳（#1）
  const exs = [{w: 'accept', m: '受け入れる', e: 'We accept all cards, of course.', j: 'もちろん、すべて使えます。'}, {w: 'say', m: '言う', e: 'He said "hi" | waved.', j: '「やあ」'}, {w: 'apple', m: 'りんご'}];
  const back2 = parseList(exs.map(toLine).join('\r\n')).map(x => x.e ? {w: x.w, m: x.m, e: x.e, j: x.j} : {w: x.w, m: x.m});
  check('例文と和訳が CSV を往復しても変わらない（カンマ・引用符・| を含む例文も）', JSON.stringify(back2) === JSON.stringify(exs), JSON.stringify(back2));
  const te = s => JSON.stringify(parseList(s).map(x => [x.w, x.m, x.e || null, x.j === undefined ? null : x.j]));
  check('「単語,意味,例文,和訳」で例文を読み、和訳は省ける', te('run,走る,I run every day.,毎日走る\ngo,行く,Let\'s go.') === JSON.stringify([['run', '走る', 'I run every day.', '毎日走る'], ['go', '行く', "Let's go.", '']]));
  check('3 列目が英文でなければ、今までどおり意味の続きとして読む', te('run,走る,経営する\nset,置く, 定める') === JSON.stringify([['run', '走る,経営する', null, null], ['set', '置く, 定める', null, null]]));
  check('タブ区切りの 4 列（スプレッドシート）', te('run\t走る\tI run, too.\t私も走る') === JSON.stringify([['run', '走る', 'I run, too.', '私も走る']]));
  check('見出し行（word,meaning,example,translation）は読み飛ばす', te('word,meaning,example sentence,translation\napple,りんご') === JSON.stringify([['apple', 'りんご', null, null]]));
  check('閉じていない引用符の行は読み飛ばし、次の行は読む', t('"unterminated,abc\nok,ok') === '[["ok","ok"]]');
});
