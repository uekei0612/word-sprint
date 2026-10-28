const {ROOT, sleep, check, launch, fileUrl, copySite, run} = require('./lib');
const fs = require('fs'), path = require('path');
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('requestfailed', r => errors.push('requestfailed ' + r.url()));
  await p.goto(fileUrl()); await p.evaluate(() => localStorage.clear()); await p.goto(fileUrl()); await sleep(150);
  check('file:// で開いて、ホームが出る', (await p.evaluate(() => location.protocol)) === 'file:' && await p.$eval('#home', e => !e.hidden) && (await p.$eval('#curName', e => e.textContent)) !== '');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const want = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const got = await p.evaluate(() => [...document.body.querySelectorAll('script')].map(x => x.getAttribute('src') || 'inline'));
  check('本文では index.html の順に decks/*.js → app.js だけを読む（インラインのスクリプトなし）', JSON.stringify(got) === JSON.stringify(want) && want[want.length - 1] === 'app.js' && want.slice(0, -1).every(s => s.startsWith('decks/')), got.join(','));
  // <head> にはライト・ダークをちらつかせずに当てる 1 行だけ（ファイルを読まない）
  const head = await p.evaluate(() => [...document.head.querySelectorAll('script')].map(x => x.src ? 'src' : x.textContent));
  check('<head> のスクリプトは画面の明るさを当てるインラインの 1 つだけ', head.length === 1 && /dataset\.theme/.test(head[0]), head.join('|'));
  const n = await p.evaluate(() => window.WORD_SPRINT_DECKS.length);
  check('decks/*.js がすべて内蔵デッキとして読まれる', n === want.length - 1 && (await p.$$eval('#decks .deck:not(.new)', e => e.length)) === n, `${n} デッキ`);
  const css = await p.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.wrap')).maxWidth]);
  check('style.css が効いている', JSON.stringify(css) === JSON.stringify(['rgb(246, 247, 251)', '640px']), css.join(' / '));
  check('エラー・読み込み失敗なし', errors.length === 0, errors.join(' ; '));
  // decks/ を置かずに index.html などだけ持ち出したとき
  const dir = copySite({skip: ['decks']});
  const p2 = await b.newPage(); const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(fileUrl(dir)); await sleep(150);
  const msg = await p2.$eval('#home', e => e.textContent.trim());
  check('decks/ が無いと案内を出す（例外で止まらない）', msg.startsWith('単語データを読み込めませんでした') && e2.length === 0, msg.slice(0, 40) + ' ' + e2.join(' ; '));
  fs.rmSync(dir, {recursive: true, force: true});
  await b.close();
});
