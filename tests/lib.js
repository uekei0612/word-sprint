// テストの共通部品。各テストは `node tests/<名前>.test.js` で単独でも回せる（全部は tests/run.js）
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {pathToFileURL} = require('url');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const P = 'wordsprint.v1.'; // localStorage のキーの接頭辞（app.js の CONFIG.storagePrefix）
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? '  ' + info : ''}`); };

const launch = () => puppeteer.launch({args: ['--no-sandbox']});
const fileUrl = (root = ROOT) => pathToFileURL(path.join(root, 'index.html')).href;

// 配るファイル（GitHub Pages に載るもの）だけを一時フォルダへ写す。ファイルを書き換えるテスト用
const SITE = ['index.html', 'style.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'decks', 'icons'];
function copySite({skip = []} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-sprint-'));
  for (const f of SITE) if (!skip.includes(f)) fs.cpSync(path.join(ROOT, f), path.join(dir, f), {recursive: true});
  return dir;
}

// root を http://localhost:<port>/word-sprint/ で配る（GitHub Pages と同じパスとキャッシュ指定）。
// rewrite(相対パス, 中身) で配る中身を差し替えられる。port を省くと空いている番号を使う
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml'};
function serve(root = ROOT, {port = 0, rewrite} = {}) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith('/word-sprint/')) { res.writeHead(404); return res.end(); }
      p = p.slice('/word-sprint/'.length) || 'index.html';
      fs.readFile(path.join(root, p), (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        if (rewrite) d = rewrite(p, d);
        res.writeHead(200, {'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600'});
        res.end(d);
      });
    });
    server.listen(port, '127.0.0.1', () => {
      const base = `http://localhost:${server.address().port}/word-sprint/`;
      resolve({base, port: server.address().port, close: () => new Promise(r => { server.closeAllConnections(); server.close(r); })});
    });
  });
}

// localStorage を空にして、渡した値（キーは接頭辞なし）を入れ、開き直す
async function seed(page, url, values = {}) {
  await page.goto(url);
  await page.evaluate((P, values) => { localStorage.clear(); for (const [k, v] of Object.entries(values)) localStorage.setItem(P + k, JSON.stringify(v)); }, P, values);
  await page.goto(url);
}
const getStore = (page, k) => page.evaluate((P, k) => JSON.parse(localStorage.getItem(P + k)), P, k);

// 内蔵デッキの「単語 → 意味」（正解・不正解を選んで押すため）
const meanings = page => page.evaluate(() => Object.fromEntries(window.WORD_SPRINT_DECKS.flatMap(d => d.raw.trim().split('\n').map(l => l.split('|')).map(([w, , m]) => [w, m]))));
// 今の問題で、正解（right = true）か、正解の次の選択肢を押す。英→日の問題を前提にする
async function pick(page, M, right) {
  const w = await page.$eval('#prompt', e => e.textContent);
  const i = await page.$$eval('.choice', (bs, [m, right]) => { const i = bs.findIndex(b => b.lastChild.textContent === m); return right ? i : (i + 1) % bs.length; }, [M[w], right]);
  await page.click(`.choice:nth-child(${i + 1})`);
}

function run(main) {
  main().then(() => {
    const ok = results.length > 0 && results.every(Boolean);
    console.log(ok ? 'ALL PASS' : `SOME FAILED（${results.filter(x => !x).length} / ${results.length}）`);
    process.exit(ok ? 0 : 1);
  }, e => { console.log('ERROR', e.stack || e); process.exit(1); });
}

module.exports = {ROOT, P, sleep, check, launch, fileUrl, copySite, serve, seed, getStore, meanings, pick, run};
