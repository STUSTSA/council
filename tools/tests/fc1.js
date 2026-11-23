/* fc1：讀取量快取（core/js/fs-cache.js）的單元測試：期限內不再執行讀取、force 重讀、Timestamp 往返、過期重讀、drop 清空、回傳的是複本。
   不需要瀏覽器與模擬器：node tools/tests/fc1.js（沒有 indexedDB 時走記憶體路徑；IndexedDB 路徑由 Playwright 的實測覆蓋） */
const assert = require('assert');
(async () => {
  const { cached, drop, stats, enc, dec } = await import('../../core/js/fs-cache.js');
  class TS { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } toMillis() { return this.seconds * 1e3; } }
  let reads = 0;
  const fn = async () => { reads++; return { a: [1, { t: new TS(5, 123456) }], b: 'x' }; };
  const r1 = await cached('u|dept|x', 1000, fn, TS);
  const r2 = await cached('u|dept|x', 1000, fn, TS);
  assert.strictEqual(reads, 1, '期限內不重讀');
  assert.ok(r2.a[1].t instanceof TS && r2.a[1].t.nanoseconds === 123456, 'Timestamp 還原且保留奈秒');
  r2.a.push(9); const r3 = await cached('u|dept|x', 1000, fn, TS);
  assert.strictEqual(r3.a.length, 2, '每次回傳複本，改動不影響快取');
  await cached('u|dept|x', 1000, fn, TS, true); assert.strictEqual(reads, 2, 'force 重讀');
  await cached('u|dept|y', 0, fn, TS); await cached('u|dept|y', 0, fn, TS); assert.strictEqual(reads, 4, 'ttl 0 每次都讀');
  await drop('u|dept|x'); await cached('u|dept|x', 1000, fn, TS); assert.strictEqual(reads, 5, 'drop 後重讀');
  await cached('u|bad', 1000, async () => { reads++; return { f: new Map() }; }, TS); await cached('u|bad', 1000, async () => { reads++; return { f: new Map() }; }, TS);
  assert.strictEqual(reads, 7, '不能存的內容不快取也不報錯');
  assert.deepStrictEqual(dec(enc({ k: [1, 'a', null] }), TS), { k: [1, 'a', null] });
  console.log('fc1 通過；hits', stats.hits, 'misses', stats.misses);
})().catch(e => { console.error(e); process.exit(1); });
