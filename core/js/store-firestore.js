/* 核心｜Firestore 讀取橋接（01B；02B 改用 fb-app.js 共用的 app，讀之前先等登入狀態）。ES module：
   只有部門設成 source:"firestore" 時由 store.js 載入，其他部門完全不載入 Firebase。
   只讀，不寫（02D 的寫入在 store-write.js）：查詢條件照 docs/architecture/indexes.md（規則不是篩選器，查詢要帶規則需要的條件，例如卡片只查 open／done）。
   cfg＝dept/config.js 的 BOARD_BASE.firebase（網頁設定，不是機密）。
   回傳 {data（schemaVersion 13 的部門資料）, src（每份文件 {id, ...時間值換成 __ts}）, orig（原始文件，寫入時沿用沒改的欄位，時間戳記保留微秒）}。 */
import { fb, authReady } from "./fb-app.js";
import { cached, drop, stats } from "./fs-cache.js";
import { doc, getDoc, getDocs, collection, collectionGroup, query, where, orderBy, limitToLast, endBefore, Timestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const plain = v => window.StoreMap.plain(v);                 /* Timestamp → {__ts}（store-map.js） */
/* 讀取量（2026-11-23，Spark 每日 5 萬次）：部門資料、版本歷史、行事曆事件讀過就存在這台裝置（fs-cache.js），
   在期限內重新整理、進出部門都不再連線讀。寫入之後與寫入前的衝突檢查傳 force＝一定重讀。stats.docs＝這個分頁實際讀了幾份文件（量測用）。 */
const TTL_PRES = 2 * 60e3, /* 會長室含「開放秘書處會議編輯」的授權，要比較即時 */ TTL_DEPT = 10 * 60e3, TTL_HIST = 5 * 60e3, TTL_EVENTS = 10 * 60e3;
const uidOf = cfg => (fb(cfg).auth.currentUser || {}).uid || "anon";
const T = Timestamp;
const one = async (ref, o) => { const s = await getDoc(ref); stats.docs += 1; if (!s.exists()) return null; if (o) o[s.id] = s.data(); return { id: s.id, ...plain(s.data()) }; };
const many = async (q, o) => (await getDocs(q).then(r => { stats.docs += Math.max(1, r.docs.length); return r; })).docs.map(s => { if (o) o[s.id] = s.data(); return { id: s.id, ...plain(s.data()) }; });

async function loadDept(cfg, dept, force) {
  await authReady(cfg);
  return cached(`${uidOf(cfg)}|dept|${dept}`, dept === "president" ? TTL_PRES : TTL_DEPT, () => loadDeptNet(cfg, dept), T, force);
}
async function loadDeptNet(cfg, dept) {
  const d = fb(cfg).db, by = c => where("deptId", "==", dept);
  const orig = { settings: {}, cards: {}, issues: {}, weeks: {}, labels: {}, events: {} };
  const [settings, org, grant, cards, issues, weeks, labels, events, legacy, minutes] = await Promise.all([
    one(doc(d, "deptSettings", dept), orig.settings),
    one(doc(d, "org", "config")),
    dept === "president" ? one(doc(d, "grants", "meetingEdit")).catch(() => null) : null,   /* 06：沒登入讀不到（只有登入的人看得到會議授權），不影響看板 */
    many(query(collection(d, "cards"), by(), where("state", "in", ["open", "done"])), orig.cards),
    many(query(collection(d, "issues"), by()), orig.issues),
    many(query(collection(d, "weeks"), by()), orig.weeks),
    many(query(collection(d, "labels"), by()), orig.labels),
    many(query(collection(d, "events"), by()), orig.events).catch(() => []),   /* 06：時間事件（行事曆）要登入才讀得到；沒登入時卡片沒有時間、看板其餘照常 */
    many(query(collection(d, "legacyIdentities"), by())).catch(() => []),   /* 06：舊身分（歷史卡片負責人的名字）要登入才讀得到；沒登入時負責人不顯示（team.js staffName） */
    /* 秘書處的會議紀錄（2026-11-20）：只有秘書處與總管理員讀得到；其他人讀不到就當成沒有（不影響看板） */
    dept === "secretariat" ? many(collection(d, "meetingMinutes")).catch(() => null) : null,
  ]);
  const src = { settings, org, grant, cards, issues, weeks, labels, events, legacy, minutes };
  return { data: window.StoreMap.toState(dept, src), src, orig };
}

/* 02D：編輯紀錄與會長室的各部門編輯量。版本歷史＝collection group versions（索引 Q9：deptId＋at；規則只給總管理員與該部門編輯者，
   其他人讀不到＝permission-denied）；稽核紀錄只有總管理員讀得到（依 at，單一欄位索引）。回傳 {t（毫秒）, by（UID）, ...}。 */
const verRow = s => { const v = s.data(); return { kind: "ver", t: v.at ? v.at.toMillis() : 0, by: v.by || "", version: v.version, title: v.title || "", deptId: v.deptId, imported: v.imported === true }; };
async function versionsSince(cfg, dept, since) {
  await authReady(cfg);
  return cached(`${uidOf(cfg)}|ver|${dept}|${since}`, TTL_HIST, async () => {
    const qs = await getDocs(query(collectionGroup(fb(cfg).db, "versions"), where("deptId", "==", dept), where("at", ">=", Timestamp.fromMillis(since)), orderBy("at")));
    stats.docs += Math.max(1, qs.docs.length);
    return qs.docs.map(verRow);
  });
}
/* 一頁（由新往舊）：cursor＝上一頁最舊的那一筆（同一個時間的不會漏掉） */
async function versionsPage(cfg, dept, cursor, n) {
  await authReady(cfg);
  const qs = await getDocs(query(collectionGroup(fb(cfg).db, "versions"), where("deptId", "==", dept), orderBy("at"), ...(cursor ? [endBefore(cursor)] : []), limitToLast(n)));
  stats.docs += Math.max(1, qs.docs.length);
  return { rows: qs.docs.map(verRow), cursor: qs.docs[0] || cursor, more: qs.docs.length === n };
}
async function auditSince(cfg, since) {
  await authReady(cfg);
  return cached(`${uidOf(cfg)}|audit|${since}`, TTL_HIST, async () => {
  const qs = await getDocs(query(collection(fb(cfg).db, "auditLogs"), where("at", ">=", Timestamp.fromMillis(since)), orderBy("at")));
  stats.docs += Math.max(1, qs.docs.length);
  return qs.docs.map(s => { const a = s.data(); return { kind: "audit", id: s.id, t: a.at ? a.at.toMillis() : 0, by: a.actor || "", col: a.col, docId: a.docId, action: a.action, before: a.before || {}, after: a.after || {} }; });
  });
}

/* ui-06：行事曆「活動」「會議」與主頁的全會行事曆：scope 是 all-activity／all-meeting 的時間事件（索引 Q13：scope＋start）。
   讀取量：只讀 [from, to) 開始的那幾筆（呼叫端給一個月份前後的範圍，讀過的留在記憶體）；只讀不寫。回傳 {id, ...時間值換成 __ts}。
   06：行事曆（時間事件）要登入才讀（DievE 2026-11-20 決定）：沒登入直接回 permission-denied，畫面顯示「登入後才看得到」（notify.js）。
   沒有 scope＋visibility＋start 的複合索引，所以用總覽／全會行事曆（未登入）已經有的索引 Q2（visibility＋start），scope 在這裡篩 */
async function eventsByScope(cfg, scope, from, to, o = {}) {
  await authReady(cfg);
  const { db, auth } = fb(cfg);
  if (!auth.currentUser) throw Object.assign(new Error("login required"), { code: "permission-denied" });
  const range = [where("start", ">=", Timestamp.fromMillis(from)), where("start", "<", Timestamp.fromMillis(to)), orderBy("start")];
  return cached(`${auth.currentUser.uid}|scope|${scope}|${from}|${to}`, TTL_EVENTS, () => many(query(collection(db, "events"), where("scope", "==", scope), ...range)), T);
}
/* 登出、換帳號：這台裝置上存的讀取結果全部清掉（不留給下一個人） */
const clearCache = () => drop("");
/* 設定的「強制刷新」：這個登入身分在這台裝置上存的讀取結果全部作廢（別的部門、行事曆、名單下次用到時才重讀；目前的部門由呼叫端立刻強制重讀） */
const dropCache = () => drop("");

window.BoardFirestore = { loadDept, versionsSince, versionsPage, auditSince, eventsByScope, clearCache, dropCache, stats };
dispatchEvent(new Event("board-firestore-ready"));
