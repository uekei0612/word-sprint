// 内蔵デッキの検証。デッキを直したら `node tools/check-decks.mjs` で確かめる（問題があれば終了コード 1）
//
// - 形式：列数（3 か 6）、品詞の記号、前後の空白、バッククォート、例文中に強調する語形があるか
// - 例文：1 つのデッキの中で、例文のある語と無い語を混ぜない（内蔵デッキはすべて例文つき。#21）
// - 見出し：デッキ内の重複、デッキ間で同じ単語の意味の書き方がそろっているか
//   （学習記録のキーは「単語＋意味」なので、書き方が違うと記録を共有しない）
// - 配信：decks/ のファイル・index.html の <script>・sw.js の FILES が一致しているか
//   （sw.js に無いデッキはオフラインのときに出ない）
// デッキ内で語義が重なる組（「発表する」と「発表する、提示する」）は、出題側で互いの誤答に
// 出しにくくしているので、件数を参考に出すだけにする
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {fileURLToPath} from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const POS = ['n', 'v', 'adj', 'adv', 'phr', ''];
const errors = [], notes = [];

const scripts = [...read('index.html').matchAll(/<script src="(decks\/[^"]+)"/g)].map(m => m[1]);
const cached = [...read('sw.js').matchAll(/'(decks\/[^']+)'/g)].map(m => m[1]);
const files = fs.readdirSync(path.join(root, 'decks')).filter(f => f.endsWith('.js')).map(f => 'decks/' + f);
for (const f of files) {
  if (!scripts.includes(f)) errors.push(`${f}: index.html の <script> に無い`);
  if (!cached.includes(f)) errors.push(`${f}: sw.js の FILES に無い`);
}
for (const f of new Set([...scripts, ...cached])) if (!files.includes(f)) errors.push(`${f}: 参照されているがファイルが無い`);

const ctx = {window: {}};
vm.createContext(ctx);
for (const f of scripts.filter(f => files.includes(f))) vm.runInContext(read(f), ctx, {filename: f});
const decks = ctx.window.WORD_SPRINT_DECKS || [];
const ids = new Set(), byWord = new Map();
for (const d of decks) {
  if (ids.has(d.id)) errors.push(`id「${d.id}」が重複している`);
  ids.add(d.id);
  if (!d.name || !d.desc) errors.push(`${d.id}: name か desc が無い`);
  const seen = new Set(), words = []; let withEx = 0;
  d.raw.trim().split('\n').forEach((line, i) => {
    const at = `${d.id} ${i + 1} 行目「${line}」`, c = line.split('|');
    const [w, p, m, ex, exJa, hl] = c;
    if (c.length !== 3 && c.length !== 6) return errors.push(`${at}: 列数が ${c.length}`);
    if (c.some(x => x !== x.trim())) errors.push(`${at}: 前後に空白がある`);
    if (!w || !m) errors.push(`${at}: 単語か意味が空`);
    if (!POS.includes(p)) errors.push(`${at}: 品詞「${p}」は使えない（${POS.filter(Boolean).join(' / ')}）`);
    if (c.length === 6 && (!ex || !exJa || !hl)) errors.push(`${at}: 例文・和訳・強調する語形のどれかが空`);
    if (c.length === 6 && hl && !ex.includes(hl)) errors.push(`${at}: 例文に強調する語形「${hl}」が無い`);
    if (seen.has(w)) errors.push(`${at}: 同じデッキに「${w}」が 2 回ある`);
    seen.add(w); words.push({w, p, m}); if (c.length === 6) withEx++;
    if (!byWord.has(w)) byWord.set(w, []);
    byWord.get(w).push({id: d.id, m});
  });
  if (withEx && withEx !== words.length) errors.push(`${d.id}: 例文のある語が ${withEx} / ${words.length} 語（すべてに付けるか、すべて外す）`);
  const gloss = m => m.split('、');
  let near = 0;
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++)
    if (gloss(words[i].m).some(s => gloss(words[j].m).includes(s))) near++;
  notes.push(`${d.id}（${d.name}）${words.length} 語${near ? `、語義が重なる組 ${near}` : ''}`);
}
for (const [w, list] of byWord) {
  if (new Set(list.map(x => x.m)).size > 1) errors.push(`「${w}」の意味の書き方がデッキで違う：${list.map(x => `${x.id}「${x.m}」`).join(' / ')}`);
}
const def = (read('app.js').match(/defaults: \{deck:'([^']+)'/) || [])[1];
if (!ids.has(def)) errors.push(`app.js の CONFIG.defaults.deck「${def}」が内蔵デッキの id ではない`);

console.log(notes.join('\n'));
console.log(`延べ ${[...byWord.values()].reduce((n, l) => n + l.length, 0)} 語、異なる単語 ${byWord.size} 語`);
if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }
console.log('問題なし');
