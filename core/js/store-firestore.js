/* 核心｜Firestore 讀取橋接（01B；02B 改用 fb-app.js 共用的 app，讀之前先等登入狀態）。ES module：
   只有部門設成 source:"firestore" 時由 store.js 載入，其他部門完全不載入 Firebase。
   只讀，不寫（02D 的寫入在 store-write.js）：查詢條件照 docs/architecture/indexes.md（規則不是篩選器，查詢要帶規則需要的條件，例如卡片只查 open／done）。
   cfg＝dept/config.js 的 BOARD_BASE.firebase（網頁設定，不是機密）。
   回傳 {data（schemaVersion 13 的部門資料）, src（每份文件 {id, ...時間值換成 __ts}）, orig（原始文件，寫入時沿用沒改的欄位，時間戳記保留微秒）}。 */
import { fb, authReady } from "./fb-app.js";
import { doc, getDoc, getDocs, collection, collectionGroup, query, where, orderBy, limitToLast, endBefore, Timestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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

/* 02D：編輯紀錄與會長室的各部門編輯量。版本歷史＝collection group versions（索引 Q9：deptId＋at；規則只給總管理員與該部門編輯者，
   其他人讀不到＝permission-denied）；稽核紀錄只有總管理員讀得到（依 at，單一欄位索引）。回傳 {t（毫秒）, by（UID）, ...}。 */
const verRow = s => { const v = s.data(); return { kind: "ver", t: v.at ? v.at.toMillis() : 0, by: v.by || "", version: v.version, title: v.title || "", deptId: v.deptId, imported: v.imported === true }; };
async function versionsSince(cfg, dept, since) {
  await authReady(cfg);
  const qs = await getDocs(query(collectionGroup(fb(cfg).db, "versions"), where("deptId", "==", dept), where("at", ">=", Timestamp.fromMillis(since)), orderBy("at")));
  return qs.docs.map(verRow);
}
/* 一頁（由新往舊）：cursor＝上一頁最舊的那一筆（同一個時間的不會漏掉） */
async function versionsPage(cfg, dept, cursor, n) {
  await authReady(cfg);
  const qs = await getDocs(query(collectionGroup(fb(cfg).db, "versions"), where("deptId", "==", dept), orderBy("at"), ...(cursor ? [endBefore(cursor)] : []), limitToLast(n)));
  return { rows: qs.docs.map(verRow), cursor: qs.docs[0] || cursor, more: qs.docs.length === n };
}
async function auditSince(cfg, since) {
  await authReady(cfg);
  const qs = await getDocs(query(collection(fb(cfg).db, "auditLogs"), where("at", ">=", Timestamp.fromMillis(since)), orderBy("at")));
  return qs.docs.map(s => { const a = s.data(); return { kind: "audit", id: s.id, t: a.at ? a.at.toMillis() : 0, by: a.actor || "", col: a.col, docId: a.docId, action: a.action, before: a.before || {}, after: a.after || {} }; });
}

/* ui-06：行事曆「活動」「會議」與主頁的全會行事曆：scope 是 all-activity／all-meeting 的時間事件（索引 Q13：scope＋start）。
   讀取量：只讀 [from, to) 開始的那幾筆（呼叫端給一個月份前後的範圍，讀過的留在記憶體）；只讀不寫。回傳 {id, ...時間值換成 __ts}。
   o.pub（公共版）而且沒登入：規則只讓沒登入的人讀 visibility 是 public 的事件（L0），查詢要帶這個條件，不然整個被拒（ui-06 審查 P2-5）。
   沒有 scope＋visibility＋start 的複合索引，所以用總覽／全會行事曆（未登入）已經有的索引 Q2（visibility＋start），scope 在這裡篩 */
async function eventsByScope(cfg, scope, from, to, o = {}) {
  await authReady(cfg);
  const { db, auth } = fb(cfg), range = [where("start", ">=", Timestamp.fromMillis(from)), where("start", "<", Timestamp.fromMillis(to)), orderBy("start")];
  if (o.pub && !auth.currentUser)
    return (await many(query(collection(db, "events"), where("visibility", "==", "public"), ...range))).filter(e => e.scope === scope);
  return many(query(collection(db, "events"), where("scope", "==", scope), ...range));
}

window.BoardFirestore = { loadDept, versionsSince, versionsPage, auditSince, eventsByScope };
dispatchEvent(new Event("board-firestore-ready"));
