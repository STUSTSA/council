/* 核心｜點名的資料讀寫（07，docs/architecture/data-model.md 第 5 節）。ES module：只有秘書處看板在 firestore 模式、attendance.js 要用時才載入。
   授權一律由 Security Rules 判斷（backend/firestore.rules 的 attendanceMembers／attendanceSessions／attendanceRecords：秘書處編輯者以上與總管理員；刪除只有總管理員），
   這裡只管讀寫。三個集合：
   - attendanceMembers/{id}：名冊 {name, dept（部門名稱）, role（職稱）, active}；停用＝active:false（不刪）
   - attendanceSessions/{id}：場次 {title, date（YYYY-MM-DD，台灣時間）, at（那天 00:00 的時間戳，排序用）}
   - attendanceRecords/{場次ID}_{成員ID}：每人每場一份 {sessionId, memberId, status: present｜leave｜absent, sessionAt}；ID 決定性，快速連點只會覆寫同一份
   規則不讓秘書處刪除文件，所以點過的人只能在三種狀態間改，不能退回「未點」。
   錯誤一律丟出帶 code 的 Error（permission-denied、unavailable…）。 */
import { fb, authReady } from "./fb-app.js";
import { doc, collection, query, where, orderBy, limit, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const NOW = () => serverTimestamp();
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const ctx = async cfg => { await authReady(cfg); const { db, auth } = fb(cfg); if (!auth.currentUser) throw Object.assign(new Error("permission-denied"), { code: "permission-denied" }); return { db, me: auth.currentUser.uid }; };
const dayStart = date => Timestamp.fromMillis(Date.parse(`${date}T00:00:00+08:00`));

async function members(cfg) {
  const { db } = await ctx(cfg);
  return (await getDocs(collection(db, "attendanceMembers"))).docs.map(s => { const m = s.data(); return { id: s.id, name: m.name || "", dept: m.dept || "", role: m.role || "", active: m.active !== false }; });
}
/* 匯入名冊（rows＝[{name,dept,role}]，去重在畫面端做）：一次最多 400 筆一批 */
async function addMembers(cfg, rows) {
  const { db, me } = await ctx(cfg);
  for (let i = 0; i < rows.length; i += 400) {
    const b = writeBatch(db);
    rows.slice(i, i + 400).forEach(r => b.set(doc(db, "attendanceMembers", "m" + rand(8)), { name: r.name, dept: r.dept, role: r.role, active: true, updatedAt: NOW(), updatedBy: me }));
    await b.commit();
  }
}
/* 停用／恢復（不刪文件：規則只讓總管理員刪）：changes＝[{id, active}] */
async function setActive(cfg, changes) {
  const { db, me } = await ctx(cfg);
  for (let i = 0; i < changes.length; i += 400) {
    const b = writeBatch(db);
    changes.slice(i, i + 400).forEach(c => b.update(doc(db, "attendanceMembers", c.id), { active: c.active, updatedAt: NOW(), updatedBy: me }));
    await b.commit();
  }
}
/* 場次：最近的 40 場，新的在前 */
async function sessions(cfg) {
  const { db } = await ctx(cfg);
  return (await getDocs(query(collection(db, "attendanceSessions"), orderBy("at", "desc"), limit(40)))).docs.map(s => ({ id: s.id, title: s.data().title || "", date: s.data().date || "" }));
}
async function addSession(cfg, title, date) {
  const { db, me } = await ctx(cfg), id = "s" + rand(8);
  await setDoc(doc(db, "attendanceSessions", id), { title, date, at: dayStart(date), createdAt: NOW(), createdBy: me, updatedAt: NOW(), updatedBy: me });
  return id;
}
/* 某場次的點名結果（Q28）→ { 成員ID: 狀態 } */
async function records(cfg, sid) {
  const { db } = await ctx(cfg), out = {};
  (await getDocs(query(collection(db, "attendanceRecords"), where("sessionId", "==", sid)))).docs.forEach(s => { out[s.data().memberId] = s.data().status; });
  return out;
}
async function mark(cfg, session, mid, status) {
  if (!["present", "leave", "absent"].includes(status)) throw Object.assign(new Error("bad-status"), { code: "bad-status" });
  const { db, me } = await ctx(cfg);
  await setDoc(doc(db, "attendanceRecords", `${session.id}_${mid}`), { sessionId: session.id, memberId: mid, status, sessionAt: dayStart(session.date), updatedAt: NOW(), updatedBy: me });
}

window.BoardAttendance = { members, addMembers, setActive, sessions, addSession, records, mark };
dispatchEvent(new Event("board-attendance-ready"));
