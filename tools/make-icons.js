// ホーム画面のアイコン（iOS の apple-touch-icon、180px）を色ごとに書き出す。色は app.js の CONFIG.iconColors。
// 図柄は icons/icon.svg と同じ。色を足したら sw.js の FILES にも足す。
// docker run --rm -v "$PWD":/work -w /work -e NODE_PATH=/usr/src/app/node_modules zenika/alpine-chrome:with-puppeteer node tools/make-icons.js
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const colors = Function('return ' + src.match(/iconColors: (\{.*\}),/)[1])();
const svg = fs.readFileSync(path.join(ROOT, 'icons/icon.svg'), 'utf8');
(async () => {
  const b = await puppeteer.launch({args: ['--no-sandbox']}); const p = await b.newPage();
  await p.setViewport({width: 180, height: 180});
  for (const [name, [bg, line]] of Object.entries(colors)) {
    const s = svg.replace('fill="#4f46e5"', `fill="${bg}"`).replace('stroke="#a5b4fc"', `stroke="${line}"`);
    await p.setContent(`<style>*{margin:0}svg{display:block;width:180px;height:180px}</style>${s}`);
    const out = path.join(ROOT, 'icons', name === 'indigo' ? 'apple-touch-icon.png' : `apple-touch-icon-${name}.png`);
    await p.screenshot({path: out, omitBackground: false});
    console.log(out);
  }
  await b.close();
})();
