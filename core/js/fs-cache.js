/* 核心｜Firestore 讀取的本機快取（省讀取量用）。ES module，沒有外部相依（store-firestore.js、fb-account.js 共用）。
   Spark 免費方案每天只有 5 萬次讀取，而「重新整理、進出部門」每次都會把整個部門重讀一遍。這裡把讀到的結果存在這台裝置
   （IndexedDB，不能用時退回記憶體），在有效期限內直接用、不再連線讀取。只存這個登入身分自己讀得到的內容（key 帶 uid），登出時清空。
   Timestamp 轉成 {__fts:[秒,奈秒]} 存、讀出時還原（寫入時要沿用原始時間戳記的微秒，store-write.js）。
   不碰權限：快取只是這個人剛讀到的東西；寫入前的衝突檢查（store.js fsFinish）一律強制重讀最新的。 */
const DB = "board-fs-cache", ST = "c", VER = "1";   /* VER：資料轉換格式（store-map.js）改了就跳一號，舊快取自動作廢 */
const mem = new Map();
let off = false;
/* 模擬器測試預設關掉快取（測試會直接改資料庫再重新整理、要馬上讀到）；要測快取本身時 cfg.emulator.cache＝true（fb-app.js） */
export const setOff = v => { off = !!v; };
let idb = null;
const open = () => idb || (idb = new Promise(res => {
  try {
    if (typeof indexedDB === "undefined") return res(null);
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = r.onblocked = () => res(null);
  } catch (_) { res(null); }
}));
const run = async (mode, f) => {
  const db = await open();
  if (!db) return f(null);
  return new Promise((ok, no) => { try { const tx = db.transaction(ST, mode), r = f(tx.objectStore(ST)); tx.oncomplete = () => ok(r && r.result); tx.onerror = tx.onabort = () => no(tx.error); } catch (e) { no(e); } });
};
const get = async k => { try { const db = await open(); return db ? await run("readonly", s => s.get(k)) : mem.get(k); } catch (_) { return mem.get(k); } };
const put = async (k, v) => { try { const db = await open(); if (db) await run("readwrite", s => s.put(v, k)); else mem.set(k, v); } catch (_) { mem.set(k, v); } };
const isTs = v => v && typeof v === "object" && typeof v.toMillis === "function" && typeof v.seconds === "number" && typeof v.nanoseconds === "number";
export const enc = v => isTs(v) ? { __fts: [v.seconds, v.nanoseconds] }
  : Array.isArray(v) ? v.map(enc)
  : v && typeof v === "object" ? (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) : (() => { throw new Error("uncacheable"); })())
  : v;
export const dec = (v, T) => Array.isArray(v) ? v.map(x => dec(x, T))
  : v && typeof v === "object" ? (v.__fts ? new T(v.__fts[0], v.__fts[1]) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x, T)])))
  : v;

export const stats = { docs: 0, hits: 0, misses: 0 };   /* docs＝這個分頁讀了幾份文件（量測用）；hits／misses＝快取命中／沒命中 */

/* 在 ttl 毫秒內直接給上次的結果，否則執行 fn（真的去讀）並存起來。force＝一定重讀（寫入之後、衝突檢查）。T＝Timestamp 類別（還原時間戳記用）。
   每次都回傳全新的物件（從儲存區讀出來的複本），呼叫端可以放心修改。讀不出來或存不進去都當作沒有快取，不影響功能。 */
export async function cached(key, ttl, fn, T, force) {
  if (off) { stats.misses++; return fn(); }
  const k = VER + "|" + key;
  if (!force) {
    const e = await get(k).catch(() => null);
    if (e && Date.now() - e.at < ttl) { stats.hits++; try { return dec(e.v, T); } catch (_) { /* 壞掉的快取：重讀 */ } }
  }
  stats.misses++;
  const v = await fn();
  try { await put(k, { at: Date.now(), v: enc(v) }); } catch (_) { /* 存不進去就算了 */ }
  return v;
}
/* 某個前綴的快取作廢（寫入之後讓其他讀取也重讀）；登出時全部清掉 */
export async function drop(prefix) {
  for (const k of [...mem.keys()]) if (k.startsWith(VER + "|" + prefix)) mem.delete(k);
  try {
    const db = await open(); if (!db) return;
    await run("readwrite", s => { const r = s.openCursor(); r.onsuccess = () => { const c = r.result; if (c) { if (String(c.key).startsWith(VER + "|" + prefix)) c.delete(); c.continue(); } }; return r; });
  } catch (_) { /* 清不掉就等它過期 */ }
}
