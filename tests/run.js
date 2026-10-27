// tests/*.test.js を 1 本ずつ別のプロセスで回し、最後にまとめる。1 本でも落ちたら終了コード 1。
// 名前を渡すとそれだけ回す（例：node tests/run.js undo relearn）
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))
  .filter(f => !only.length || only.includes(f.replace('.test.js', ''))).sort();
const failed = [];
for (const f of files) {
  console.log(`\n=== ${f}`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {stdio: 'inherit'});
  console.log(`--- ${f}：${r.status === 0 ? 'OK' : 'NG'}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  if (r.status !== 0) failed.push(f);
}
console.log(`\n${files.length - failed.length} / ${files.length} 本が通った` + (failed.length ? `。落ちた：${failed.join(', ')}` : ''));
process.exit(failed.length || !files.length ? 1 : 0);
