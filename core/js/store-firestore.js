/* 核心｜Firestore 讀取橋接（01B；02B 改用 fb-app.js 共用的 app，讀之前先等登入狀態）。ES module：
   只有部門設成 source:"firestore" 時由 store.js 載入，其他部門完全不載入 Firebase。
   只讀，不寫（02D 的寫入在 store-write.js）：查詢條件照 docs/architecture/indexes.md（規則不是篩選器，查詢要帶規則需要的條件，例如卡片只查 open／done）。
   cfg＝dept/config.js 的 BOARD_BASE.firebase（網頁設定，不是機密）。
   回傳 {data（schemaVersion 13 的部門資料）, src（每份文件 {id, ...時間值換成 __ts}）, orig（原始文件，寫入時沿用沒改的欄位，時間戳記保留微秒）}。 */
import { fb, authReady } from "./fb-app.js";
import { doc, getDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const plain = v => window.StoreMap.plain(v);                 /* Timestamp → {__ts}（store-map.js） */
const one = async (ref, o) => { const s = await getDoc(ref); if (!s.exists()) return null; if (o) o[s.id] = s.data(); return { id: s.id, ...plain(s.data()) }; };
const many = async (q, o) => (await getDocs(q)).docs.map(s => { if (o) o[s.id] = s.data(); return { id: s.id, ...plain(s.data()) }; });

async function loadDept(cfg, dept) {
  await authReady(cfg);
  const d = fb(cfg).db, by = c => where("deptId", "==", dept);
  const orig = { settings: {}, cards: {}, issues: {}, weeks: {}, labels: {}, events: {} };
  const [settings, org, grant, cards, issues, weeks, labels, events, legacy] = await Promise.all([
    one(doc(d, "deptSettings", dept), orig.settings),
    one(doc(d, "org", "config")),
    dept === "president" ? one(doc(d, "grants", "meetingEdit")) : null,
    many(query(collection(d, "cards"), by(), where("state", "in", ["open", "done"])), orig.cards),
    many(query(collection(d, "issues"), by()), orig.issues),
    many(query(collection(d, "weeks"), by()), orig.weeks),
    many(query(collection(d, "labels"), by()), orig.labels),
    many(query(collection(d, "events"), by()), orig.events),
    many(query(collection(d, "legacyIdentities"), by())),
  ]);
  const src = { settings, org, grant, cards, issues, weeks, labels, events, legacy };
  return { data: window.StoreMap.toState(dept, src), src, orig };
}

window.BoardFirestore = { loadDept };
dispatchEvent(new Event("board-firestore-ready"));
