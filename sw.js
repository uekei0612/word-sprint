// Word Sprint の service worker（ホーム画面アプリのオフライン動作と更新）
//
// 画面はいつもキャッシュから出す（電波が無くても即座に開く）。開いたときと、アプリに
// 戻ってきたときに裏で全ファイルの新しい版を確かめ、中身が変わっていれば全部そろえて
// 差し替えてから、画面に「新しいバージョンがあります」を出させる。
// 版番号は持たない。中身を比べて判断するので、ファイルを直すたびに何かを上げる必要はない。
const CACHE = 'word-sprint';
// オフラインで要るファイル。index.html が読み込むものを増やしたらここにも足す
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'decks/basic.js', 'decks/toeic.js', 'decks/advanced.js', 'decks/it.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
const CHECK_INTERVAL = 60 * 1000; // 確認の最短間隔（アプリの出入りのたびに通信しない）

// HTTP キャッシュを素通りさせず、サーバーに確かめさせる（変わっていなければ 304 で軽い）
const fresh = f => fetch(new Request(f, {cache: 'no-cache'}));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(f => fresh(f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return c.put(f, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  e.respondWith(caches.match(nav ? './' : req, {ignoreSearch: true}).then(hit => hit || fetch(req)));
  if (nav) e.waitUntil(checkUpdate());
});
// 画面がアプリに戻ってきたとき（ホーム画面アプリは再読み込みされずに再開する）
self.addEventListener('message', e => { if (e.data === 'check') e.waitUntil(checkUpdate()); });

let checking = null, lastCheck = 0;
function checkUpdate() {
  if (checking) return checking;
  if (Date.now() - lastCheck < CHECK_INTERVAL) return Promise.resolve();
  lastCheck = Date.now();
  return checking = doCheck().catch(() => {}).finally(() => { checking = null; });
}
async function doCheck() {
  // 1 つでも取れなければ（オフライン・配信途中）何も変えない。新旧が混ざった組を作らないため
  const res = await Promise.all(FILES.map(fresh));
  if (res.some(r => !r.ok)) return;
  const cache = await caches.open(CACHE);
  const bodies = await Promise.all(res.map(r => r.clone().arrayBuffer()));
  let updated = false;
  for (let i = 0; i < FILES.length; i++) {
    const old = await cache.match(FILES[i]);
    if (old && same(await old.arrayBuffer(), bodies[i])) continue;
    if (old) updated = true; // 初回の取り込み（old なし）は「更新」として知らせない
    await cache.put(FILES[i], res[i]);
  }
  if (!updated) return;
  for (const c of await self.clients.matchAll({type: 'window'})) c.postMessage({type: 'updated'});
}
function same(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
