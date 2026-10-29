// 回答後の例文（#1）：出す場面（設定）・強調・待ち方・結果画面・内蔵デッキ
const {P, sleep, check, launch, fileUrl, run} = require('./lib');
const INDEX = fileUrl();
run(async () => {
  const b = await launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({width: 390, height: 844});
  const words = [
    {w: 'accept', p: 'v', m: '受け入れる', e: 'We accept all major credit cards.', j: '主要なカードはすべて使えます。', b: 'accept'},
    {w: 'offer', p: 'v', m: '申し出る', e: 'She offered to help.', j: '彼女は手伝うと申し出た。', b: 'offered'},
    {w: 'term', p: 'n', m: '条件', e: 'Terminal terms apply. Term ends.', j: '和訳', b: ''},
    {w: 'reply', p: 'v', m: '返事をする', e: 'Nothing matches here.', j: '一致しない。', b: 'zzz'},
    {w: 'plain', p: 'adj', m: '明白な', },
  ];
  const load = async (set) => { await p.goto(INDEX); await p.evaluate((P, words, set) => { localStorage.clear();
    localStorage.setItem(P + 'decks', JSON.stringify([{id: 'c1', name: 'T', words}])); localStorage.setItem(P + 'settings', JSON.stringify({deck: 'c1', dir: 'e2j', count: 0, ...set})); }, P, words, set);
    await p.goto(INDEX); await sleep(100); await p.click('#startBtn'); await sleep(80); };
  const byW = Object.fromEntries(words.map(x => [x.w, x]));
  const cur = () => p.$eval('#prompt', e => e.textContent);
  const choose = async right => { const m = byW[await cur()].m;
    const i = await p.$$eval('.choice', (bs, m) => bs.findIndex(b => b.lastChild.textContent === m), m);
    await p.click(`.choice:nth-child(${(right ? i : (i + 1) % 4) + 1})`); await sleep(80); };
  const ex = () => p.$eval('#example', e => ({shown: !e.hidden, en: e.querySelector('#exEn').textContent, mark: [...e.querySelectorAll('mark')].map(m => m.textContent), ja: e.querySelector('#exJa').textContent}));
  // 次に出したい語が出るまで答えて進める（正解して進む）
  const reach = async pred => { for (let n = 0; n < 40 && !pred(await cur()); n++) { await choose(true); await sleep(500); if (!(await p.$eval('#example', e => e.hidden))) await p.keyboard.press('Enter'); await sleep(60); } return pred(await cur()); };

  // 既定（間違えたとき）
  await load({});
  check('回答前は例文を出さない', !(await ex()).shown);
  check('（前提）例文のある語まで進めた', await reach(w => byW[w].e && byW[w].b && byW[w].b !== 'zzz'));
  let w = await cur(); await choose(true);
  check('既定では、正解したときは例文を出さない', !(await ex()).shown);
  await sleep(800); check('正解して例文を出さないときは、今までどおり自動で次へ', (await cur()) !== w);
  await reach(w => byW[w].e && byW[w].b !== 'zzz' && byW[w].b);
  w = await cur(); await choose(false); let e = await ex();
  check('間違えたら例文と和訳を出す', e.shown && e.en === byW[w].e && e.ja === byW[w].j, JSON.stringify(e));
  check('強調する語形（b）を <mark> にする', e.mark.length === 1 && e.mark[0] === byW[w].b, JSON.stringify(e.mark));
  check('読み上げ用の通知に例文を含める', (await p.$eval('#announce', a => a.textContent)).includes(byW[w].e));
  check('取り消しボタンは例文と一緒に出る', await p.$eval('#undoBox', u => !u.hidden));
  await sleep(2400);
  check('例文を出したときは自動で次へ進まない（2.4 秒待っても同じ問題）', (await cur()) === w && (await ex()).shown);
  await p.click('#exSpeak').catch(() => {}); await sleep(300);
  check('例文の発音ボタンを押しても次へ進まない', (await cur()) === w);
  await p.click('#undoBtn'); await sleep(80);
  check('取り消すと例文を隠して同じ問題を出し直す', (await cur()) === w && !(await ex()).shown);
  await choose(false); await sleep(300); await p.click('#qcard'); await sleep(80); // tapGuard より後に押す
  // 次が同じ語の出し直しのこともあるので、答えられる状態になったかで見る
  check('タップで次へ進み、例文を隠す', await p.$$eval('.choice', bs => bs.every(b => !b.disabled)) && !(await ex()).shown);

  // 強調できない行・b が空の行・例文の無い語
  await load({});
  await reach(w => w === 'reply'); await choose(false); e = await ex();
  check('強調する語形が例文に無ければ、強調せずにそのまま出す', e.shown && e.en === byW.reply.e && !e.mark.length, JSON.stringify(e));
  await p.keyboard.press('Enter'); await sleep(80);
  await load({});
  await reach(w => w === 'term'); await choose(false); e = await ex();
  check('b が空なら単語そのものを、語の切れ目で大小を問わず探して強調する（Terminal・terms には当てない）', e.mark.length === 1 && e.mark[0] === 'Term' && e.en === byW.term.e, JSON.stringify(e));
  await p.keyboard.press('Enter'); await sleep(80);
  await load({});
  await reach(w => w === 'plain'); w = await cur(); await choose(false);
  check('例文の無い語では例文を出さない', !(await ex()).shown);
  await sleep(2000); check('例文の無い語は、間違えても今までどおり自動で次へ', await p.$$eval('.choice', bs => bs.every(b => !b.disabled))); // 次が同じ語の出し直しのこともあるので、答えられる状態かで見る

  // 毎回 ／ 出さない
  await load({example: 'all'});
  await reach(w => byW[w].e); w = await cur(); await choose(true);
  check('「毎回」なら正解でも例文を出す', (await ex()).shown);
  await sleep(800); check('「毎回」で正解したときも、例文を出したら待つ', (await cur()) === w);
  await p.keyboard.press('Enter'); await sleep(80); check('Enter で次へ', (await cur()) !== w);
  await load({example: 'off'});
  await reach(w => byW[w].e); await choose(false);
  check('「出さない」なら間違えても例文を出さない', !(await ex()).shown);

  // 結果画面：間違えた単語に例文を添える
  await load({});
  for (let n = 0; n < 40 && await p.$eval('#quiz', q => !q.hidden); n++) { await choose(false); await sleep(60); await p.keyboard.press('Enter'); await sleep(60); }
  const rows = await p.$$eval('#missedList li', ls => ls.map(l => ({w: l.querySelector('b').textContent, ex: l.querySelector('.ex .ex-en') ? l.querySelector('.ex .ex-en').textContent : null})));
  check('結果画面の間違えた単語に、例文のある語だけ例文を出す', rows.length === 5 && rows.every(r => r.ex === (byW[r.w].e || null)), JSON.stringify(rows));

  // 設定画面に「例文」がある
  await p.click('#homeBtn'); await sleep(80); await p.click('#settingsBtn'); await sleep(80);
  const seg = await p.$$eval('.seg[data-key=example] button', bs => bs.map(b => [b.textContent, b.getAttribute('aria-pressed')]));
  check('設定に「例文」（間違えたとき・毎回・出さない）があり、既定は間違えたとき', JSON.stringify(seg) === JSON.stringify([['間違えたとき', 'true'], ['毎回', 'false'], ['出さない', 'false']]), JSON.stringify(seg));

  // 内蔵デッキ：例文が読めている
  const n = await p.evaluate(() => window.WORD_SPRINT_DECKS.find(d => d.id === 'toeic300-basic').raw.trim().split('\n').length);
  await p.evaluate(P => { localStorage.clear(); localStorage.setItem(P + 'settings', JSON.stringify({deck: 'toeic300-basic', dir: 'j2e', count: 0, example: 'all'})); }, P);
  await p.goto(INDEX); await sleep(100); await p.click('#startBtn'); await sleep(80);
  await p.click('.choice'); await sleep(80); e = await ex();
  check(`内蔵デッキ（TOEIC 300・基礎 ${n} 語）で例文と和訳が出て、強調もある`, e.shown && e.en.length > 10 && e.ja.length > 3 && e.mark.length === 1, JSON.stringify(e));
  check('ページのエラーなし', errs.length === 0, errs.join(';'));
  await b.close();
});
