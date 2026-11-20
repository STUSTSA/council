/* 核心｜會長預約的資料讀寫（06，docs/architecture/booking.md）。ES module：只有會長室看板在 firestore 模式、booking.js 要用時才載入。
   授權一律由 Security Rules 判斷（backend/firestore.rules 的 calendars／openWindows／slots／bookings／bookingQuota），這裡只照規則要求的形狀寫：
   - 防重複預約靠「時段鎖」文件（slots/{ownerId}_{格號}）：一格 30 分鐘、格號＝毫秒 ÷ 1,800,000；預約與它的鎖在同一批寫入。
   - 核准：bookings → approved（rev+1）＋稽核紀錄 auditLogs/bookings_{ID}_{rev}；時段鎖不動。
   - 拒絕：bookings → rejected（rev+1）＋刪掉它的所有時段鎖＋bookingQuota 減 1＋稽核紀錄，同一個交易。
   - 開放時段 openWindows：管理者（calendars 的 managers）或總管理員新增、刪除，時間要對齊 30 分鐘。
   - 啟用行事曆 calendars/{ownerId}：只有總管理員寫。
   查詢條件照 docs/architecture/indexes.md：Q17（開放時段）、Q19（待審／已核准，ownerId＋status＋start）。
   錯誤一律丟出帶 code 的 Error（conflict、permission-denied、unavailable…）。 */
import { fb, authReady } from "./fb-app.js";
import { doc, collection, query, where, orderBy, getDoc, getDocs, setDoc, deleteDoc, runTransaction, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const GRID = 1800000;                                        /* 30 分鐘一格（booking.md 決策 D5） */
const NOW = () => serverTimestamp();
const fail = code => Object.assign(new Error(code), { code });
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const ms = t => (t && t.toMillis ? t.toMillis() : 0);
const ctx = async cfg => { await authReady(cfg); const { db, auth } = fb(cfg); if (!auth.currentUser) throw fail("permission-denied"); return { db, me: auth.currentUser.uid }; };

/* 行事曆設定（沒啟用＝null；規則：登入的人都讀得到） */
async function calendar(cfg, owner) {
  await authReady(cfg);
  const s = await getDoc(doc(fb(cfg).db, "calendars", owner));
  return s.exists() ? { id: s.id, ...s.data(), rev: s.data().rev | 0 } : null;
}

/* 總管理員啟用（或更新管理者名單）：managers＝UID 陣列；已經有就 rev +1，沒有就建立 */
async function enable(cfg, owner, name, managers) {
  const { db, me } = await ctx(cfg), r = doc(db, "calendars", owner);
  await runTransaction(db, async tx => {
    const s = await tx.get(r), rev = s.exists() ? (s.data().rev | 0) + 1 : 1, c = s.exists() ? s.data() : {};
    tx.set(r, { name, managers: [...new Set(managers)], gridMin: 30, maxSlots: c.maxSlots || 4, horizonDays: c.horizonDays || 60, maxPendingPerUser: c.maxPendingPerUser || 3,
      rev, updatedAt: NOW(), updatedBy: me });
  });
}

/* 開放時段（Q17）：從 fromMs 起開始的。回傳 {id, ownerId, start, end}（毫秒） */
async function windows(cfg, owner, fromMs) {
  const { db } = await ctx(cfg);
  const q = query(collection(db, "openWindows"), where("ownerId", "==", owner), where("start", ">=", Timestamp.fromMillis(fromMs)), orderBy("start"));
  return (await getDocs(q)).docs.map(s => ({ id: s.id, ownerId: s.data().ownerId, start: ms(s.data().start), end: ms(s.data().end) }));
}
async function addWindow(cfg, owner, start, end) {
  const { db, me } = await ctx(cfg);
  if (!(start % GRID === 0 && end % GRID === 0 && start < end)) throw fail("badtime");
  await setDoc(doc(db, "openWindows", "w" + rand(8)), { ownerId: owner, start: Timestamp.fromMillis(start), end: Timestamp.fromMillis(end), updatedAt: NOW(), updatedBy: me });
}
const removeWindow = async (cfg, id) => deleteDoc(doc(( await ctx(cfg)).db, "openWindows", id));

/* 預約（Q19）：status＝pending｜approved，從 fromMs 起開始的（approved 才需要 fromMs 篩，待審全列） */
async function bookings(cfg, owner, status, fromMs) {
  const { db } = await ctx(cfg);
  const q = query(collection(db, "bookings"), where("ownerId", "==", owner), where("status", "==", status), where("start", ">=", Timestamp.fromMillis(fromMs || 0)), orderBy("start"));
  return (await getDocs(q)).docs.map(s => { const b = s.data(); return { id: s.id, ownerId: b.ownerId, requester: b.requester, windowId: b.windowId, startSlot: b.startSlot, slotCount: b.slotCount,
    start: ms(b.start), end: ms(b.end), topic: b.topic || "", note: b.note || "", status: b.status, rev: b.rev | 0 }; });
}

/* 管理者核准或拒絕：交易內重讀預約，狀態不是預期的（別人剛處理過、申請人剛取消）就 conflict、整批不寫 */
async function decide(cfg, bid, verdict) {
  if (verdict !== "approved" && verdict !== "rejected") throw fail("bad-verdict");
  const { db, me } = await ctx(cfg), br = doc(db, "bookings", bid);
  await runTransaction(db, async tx => {
    const s = await tx.get(br);
    if (!s.exists()) throw fail("conflict");
    const b = s.data(), rev = (b.rev | 0) + 1, from = b.status;
    if (!(from === "pending" || (verdict === "rejected" && from === "approved"))) throw fail("conflict");
    const qr = doc(db, "bookingQuota", `${b.ownerId}_${b.requester}`);
    const qs = verdict === "rejected" ? await tx.get(qr) : null;
    tx.update(br, { status: verdict, decidedBy: me, rev, updatedAt: NOW(), updatedBy: me });
    if (verdict === "rejected") {
      for (let i = 0; i < b.slotCount; i++) tx.delete(doc(db, "slots", `${b.ownerId}_${b.startSlot + i}`));
      if (qs && qs.exists()) tx.set(qr, { ownerId: b.ownerId, uid: b.requester, pending: Math.max(0, (qs.data().pending | 0) - 1), lastRef: bid });
    }
    tx.set(doc(db, "auditLogs", `bookings_${bid}_${rev}`), { col: "bookings", docId: bid, rev, action: verdict === "approved" ? "approve" : "rejected", actor: me, at: NOW(), before: { status: from }, after: { status: verdict }, ref: "" });
  });
}

window.BoardBooking = { calendar, enable, windows, addWindow, removeWindow, bookings, decide, GRID };
dispatchEvent(new Event("board-booking-ready"));
