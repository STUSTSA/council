/* 核心｜會議結論的待合併提案的資料讀寫（docs/architecture/permissions.md 第 5.1k 節）。ES module：用到才載入（proposals.js）。
   授權一律由 Security Rules 判斷（mergeProposals：秘書處編輯者以上與總管理員寫、部門編輯者讀自己部門並標已合併／略過），這裡只照規則要求的形狀寫。
   文件 ID 由畫面端決定（日期＋部門＋卡片／臨時項目），同一個結論重送＝更新還沒處理的、已處理的不再動。
   錯誤一律丟出帶 code 的 Error（permission-denied、unavailable…）。 */
import { fb, authReady } from "./fb-app.js";
import { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const NOW = () => serverTimestamp();
const ctx = async cfg => { await authReady(cfg); const { db, auth } = fb(cfg); if (!auth.currentUser) throw Object.assign(new Error("permission-denied"), { code: "permission-denied" }); return { db, me: auth.currentUser.uid }; };

/* 送出（rows＝[{id, deptId, cardId|null, kind: note｜new, title, note, meetingDate}]）→ { created, updated, skipped }；skipped＝部門已處理過、沒有更新的 */
async function send(cfg, rows) {
  const { db, me } = await ctx(cfg), out = { created: 0, updated: 0, skipped: 0 };
  for (const r of rows) {
    const ref = doc(db, "mergeProposals", r.id), cur = await getDoc(ref);
    if (!cur.exists()) {
      await setDoc(ref, { deptId: r.deptId, cardId: r.cardId, kind: r.kind, title: r.title, note: r.note, meetingDate: r.meetingDate, status: "pending", createdBy: me, createdAt: NOW(), updatedAt: NOW(), updatedBy: me });
      out.created++;
    } else if (cur.data().status === "pending") {
      await updateDoc(ref, { title: r.title, note: r.note, updatedAt: NOW(), updatedBy: me }); out.updated++;
    } else out.skipped++;
  }
  return out;
}
/* 某部門還沒處理的提案（部門編輯者讀自己部門：查詢要帶 deptId） */
async function pending(cfg, deptId) {
  const { db } = await ctx(cfg);
  return (await getDocs(query(collection(db, "mergeProposals"), where("deptId", "==", deptId), where("status", "==", "pending"))))
    .docs.map(s => { const p = s.data(); return { id: s.id, cardId: p.cardId || null, kind: p.kind, title: p.title || "", note: p.note || "", meetingDate: p.meetingDate || "", at: p.createdAt ? p.createdAt.toMillis() : 0 }; })
    .sort((a, b) => a.at - b.at);
}
/* 部門標成已合併或略過 */
async function resolve(cfg, id, status) {
  const { db, me } = await ctx(cfg);
  await updateDoc(doc(db, "mergeProposals", id), { status, resolvedBy: me, resolvedAt: NOW(), updatedAt: NOW(), updatedBy: me });
}
window.BoardProposals = { send, pending, resolve };
dispatchEvent(new Event("board-proposals-ready"));
