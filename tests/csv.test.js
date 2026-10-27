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
  check('閉じていない引用符の行は読み飛ばし、次の行は読む', t('"unterminated,abc\nok,ok') === '[["ok","ok"]]');
});
