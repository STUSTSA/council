/* 核心｜跨部門共編的資料讀寫（規則 cards 的 co、collabEdit；docs/architecture/permissions.md「跨部門共編」）。ES module：用到才載入（coedit.js）。
   卡片的 co＝{invite, ask, depts}（部門代號的陣列）：invite＝主要部門邀請、等對方部門管理員同意；ask＝別的部門申請、等主要部門管理員同意；depts＝已同意共編。
   授權一律由 Security Rules 判斷，這裡只照規則要求的形狀寫：每一步只動一個部門；共編的編輯者只能改名稱與逐行內容（同批新建一個版本）。
   錯誤一律丟出帶 code 的 Error（permission-denied、conflict、gone…）。 */
import { fb, authReady } from "./fb-app.js";
import { doc, collection, query, where, getDocs, runTransaction, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const fail = code => Object.assign(new Error(code), { code });
const ctx = async cfg => { await authReady(cfg); const { db, auth } = fb(cfg); if (!auth.currentUser) throw fail("permission-denied"); return { db, me: auth.currentUser.uid }; };
const row = s => { const c = s.data(); return { id: s.id, deptId: c.deptId, title: c.title || "", blocks: c.blocks, timeIds: c.timeIds || [], version: c.version || 1, co: c.co || {}, state: c.state }; };

/* 這個部門的共編：被邀請的、已同意共編的、自己（這個部門）申請中的；都只看進行中的卡片（查詢一定要帶 state，規則才讓列出） */
async function mine(cfg, dept) {
  const { db } = await ctx(cfg);
  const q = k => getDocs(query(collection(db, "cards"), where(`co.${k}`, "array-contains", dept), where("state", "==", "open"))).then(r => r.docs.map(row));
  const [invites, shared, asked] = await Promise.all([q("invite"), q("depts"), q("ask")]);
  return { invites, shared, asked };
}
/* 改一張卡片的 co 一步：fn(co)＝回傳新的 co（只動一個部門）；讀到的卡片已不是進行中、或 fn 回傳 null＝這一步已經沒意義（gone） */
async function step(cfg, cardId, fn) {
  const { db, me } = await ctx(cfg);
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "cards", cardId), s = await tx.get(ref);
      if (!s.exists() || s.data().state !== "open") throw fail("gone");
      const cur = s.data().co || {}, co = fn({ invite: [...(cur.invite || [])], ask: [...(cur.ask || [])], depts: [...(cur.depts || [])] });
      if (!co) throw fail("gone");
      tx.update(ref, { co, updatedAt: serverTimestamp(), updatedBy: me });
    }, { maxAttempts: 3 });
  } catch (e) { throw e && e.code ? e : fail("error"); }
}
/* 共編的人改卡片：只改名稱與逐行內容；version +1＋同一批新建那一版（跟一般編輯同一個形狀）。讀到的版本跟畫面上的不同＝別人剛改過（conflict） */
async function saveCard(cfg, cardId, base, title, blocks) {
  const { db, me } = await ctx(cfg);
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "cards", cardId), s = await tx.get(ref);
      if (!s.exists() || s.data().state !== "open") throw fail("gone");
      const c = s.data();
      if ((c.version || 1) !== base) throw fail("conflict");
      const v = base + 1;
      tx.update(ref, { title, blocks, version: v, updatedAt: serverTimestamp(), updatedBy: me });
      tx.set(doc(db, "cards", cardId, "versions", String(v)), { cardId, deptId: c.deptId, version: v, title, blocks, times: [], state: "open", by: me, at: serverTimestamp(), imported: false });
    }, { maxAttempts: 3 });
  } catch (e) { throw e && e.code ? e : fail("error"); }
}
window.BoardCoedit = { mine, step, saveCard };
dispatchEvent(new Event("board-coedit-ready"));
