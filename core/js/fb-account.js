/* 核心｜帳號、角色、QR 邀請、權限申請、稽核紀錄的資料操作（02B）。ES module，由 account.js 第一次用到時載入。
   規則與資料結構見 docs/architecture/invitations-roles-audit.md、data-model.md；授權一律由 Security Rules 判斷，這裡只照規則要求的形狀寫入：
   - 受保護的文件（roles、invitations、roleRequests、legacyIdentities）每次寫入 rev 加 1，同一批寫 auditLogs/{集合}_{ID}_{rev}。
   - QR 權杖只在產生它的畫面記憶體裡；資料庫只存 SHA-256。權杖不寫進 localStorage、不印到 console。
   畫面（account.js）只呼叫 window.BoardAccount，錯誤一律回傳代碼（不是 Firebase 原始訊息）。 */
import { fb } from "./fb-app.js";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut as fbSignOut }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, limit, startAfter, onSnapshot, runTransaction, writeBatch,
         serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const TEN_MIN = 10 * 60000;
let db = null, auth = null;
const NOW = () => serverTimestamp();
const uid = () => auth.currentUser && auth.currentUser.uid;
const ref = (c, id) => doc(db, c, id);
const auditRef = (c, id, rev) => ref("auditLogs", `${c}_${id}_${rev}`);
const audit = (col, docId, rev, action, before, after, r = "") => ({ col, docId, rev, action, actor: uid(), at: NOW(), before, after, ref: r });
const plainRole = r => ({ super: !!(r && r.super), depts: { ...((r && r.depts) || {}) } });
const fail = code => Object.assign(new Error(code), { code });
const codeOf = e => (e && e.code) || "error";

/* ---------- 伺服器時間 ----------
   邀請期限由規則以伺服器時間檢查（最長 10 分鐘），裝置時鐘快了就會被拒：用同一個網站回應的 Date 標頭估計時差（誤差約 1 秒），
   期限再預留 15 秒。拿不到 Date 標頭時當作沒有時差。 */
let skew = null;
async function serverSkew() {
  if (skew !== null) return skew;
  try {
    const t0 = Date.now(), r = await fetch(location.href.split("#")[0], { method: "HEAD", cache: "no-store" }), t1 = Date.now();
    const d = Date.parse(r.headers.get("date") || "");
    skew = Number.isFinite(d) ? d + 500 - (t0 + t1) / 2 : 0;
  } catch (_) { skew = 0; }
  return skew;
}
const serverNow = () => Date.now() + (skew || 0);

/* ---------- 登入（invitations-roles-audit.md 第 9.1 節） ---------- */
function init(cfg) { if (!db) ({ db, auth } = fb(cfg)); serverSkew(); return api; }
/* 登入狀態改變時先補建 users／profiles（剛按登入的那一次另外更新 lastLoginAt），完成後 ensured() 才 resolve */
let fresh = false, ensuring = Promise.resolve();
function onUser(cb) {
  return onAuthStateChanged(auth, u => {
    if (u) { const f = fresh; fresh = false; ensuring = ensureUser(f).catch(() => new Promise(r => setTimeout(r, 3000)).then(() => ensureUser(f)).catch(() => {})); }   /* 失敗隔 3 秒重試一次 */
    cb(u ? { uid: u.uid, email: u.email || "", name: u.displayName || "", photo: u.photoURL || "" } : null);
  });
}
const ensured = () => ensuring;
async function signIn() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  fresh = true;
  try { await signInWithPopup(auth, p); return ""; }
  catch (e) {
    if (e.code === "auth/popup-blocked") { try { await signInWithRedirect(auth, p); return "redirect"; } catch (e2) { fresh = false; return codeOf(e2); } }
    fresh = false;
    return codeOf(e);
  }
}
async function signOut() { await fbSignOut(auth); }
/* 個人資料的圖片網址：規則只收 null 或 https 網址（最多 500 字、可見的 ASCII 字元）；不合的當成沒有，不要讓整批（連同 users）寫不進去 */
const photoOf = u => typeof u === "string" && u.length <= 500 && /^https:\/\/[!-~]+$/.test(u) ? u : null;
/* 第一次登入：同一批建 users（信箱＝登入信箱）＋ profiles（名稱取 Google 名稱，最多 40 字）。之後登入只更新 lastLoginAt；
   重新整理（沒有重新登入）只補建缺的文件。 */
async function ensureUser(fresh) {
  const u = auth.currentUser;
  if (!u) return;
  const [us, ps] = await Promise.all([getDoc(ref("users", u.uid)), getDoc(ref("profiles", u.uid))]);
  const b = writeBatch(db);
  let n = 0;
  if (!us.exists()) { b.set(ref("users", u.uid), { email: u.email, createdAt: NOW(), lastLoginAt: NOW() }); n++; }
  else if (fresh) { b.update(ref("users", u.uid), { lastLoginAt: NOW() }); n++; }
  if (!ps.exists()) {
    const name = ([...(u.displayName || "").trim()].slice(0, 40).join("")) || (u.email || "").split("@")[0].slice(0, 40) || "未命名";
    b.set(ref("profiles", u.uid), { displayName: name, photoURL: photoOf(u.photoURL), updatedAt: NOW() }); n++;
  }
  if (n) await b.commit();
}
/* 監聽自己的 roles。剛登入的那一刻 Firestore 可能還拿著舊的（未登入）憑證，第一次監聽會被拒：同一個帳號還登入著就隔一下重試 */
function onRoles(cb) {
  const me = uid();
  if (!me) { cb(null); return () => {}; }
  let off = () => {}, stop = false, tries = 0;
  const go = () => {
    off = onSnapshot(ref("roles", me), s => { tries = 0; cb(s.exists() ? s.data() : null); }, () => {
      cb(null);
      if (!stop && uid() === me && tries++ < 5) setTimeout(() => { if (!stop && uid() === me) go(); }, 800 * tries);
    });
  };
  go();
  return () => { stop = true; off(); };
}
async function setName(name) {
  const v = [...String(name || "").trim()].slice(0, 40).join("");
  if (!v) throw fail("empty");
  const cur = (await getDoc(ref("profiles", uid()))).data() || {};
  const b = writeBatch(db);
  b.set(ref("profiles", uid()), { displayName: v, photoURL: photoOf(cur.photoURL), updatedAt: NOW() });
  await b.commit();
}

/* ---------- 名稱與舊身分（L1，登入就能讀） ---------- */
async function profiles() {
  const m = {};
  (await getDocs(collection(db, "profiles"))).forEach(s => { m[s.id] = s.data().displayName || ""; });
  return m;
}
async function legacyList() { return (await getDocs(collection(db, "legacyIdentities"))).docs.map(s => ({ id: s.id, ...s.data() })); }

/* ---------- QR 邀請（第 2、9.3 節） ---------- */
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sha256hex(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const tokenOk = t => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
function inviteData(o, exp) {
  const me = uid();
  return { deptId: o.deptId, role: o.role, ...(o.legacyRef ? { legacyRef: o.legacyRef } : {}), ...(o.boundEmail ? { boundEmail: String(o.boundEmail).trim().toLowerCase() } : {}),
    status: "active", rev: 1, createdBy: me, createdAt: NOW(), expiresAt: Timestamp.fromMillis(exp), updatedAt: NOW(), updatedBy: me };
}
async function newInvite() {
  await serverSkew();
  const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
  return { token, h: await sha256hex(token), exp: serverNow() + TEN_MIN - 15000 };
}
function putInvite(w, o, k, r = "") {
  w.set(ref("invitations", k.h), inviteData(o, k.exp));
  w.set(auditRef("invitations", k.h, 1), audit("invitations", k.h, 1, "create", {}, { status: "active" }, r));
}
function revokeInvite(w, h, cur, r = "") {
  const rev = cur.rev + 1;
  w.update(ref("invitations", h), { status: "revoked", revokedBy: uid(), revokedAt: NOW(), rev, updatedAt: NOW(), updatedBy: uid() });
  w.set(auditRef("invitations", h, rev), audit("invitations", h, rev, "revoke", { status: "active" }, { status: "revoked" }, r));
}
async function inviteCreate(o) {
  const k = await newInvite(), b = writeBatch(db);
  putInvite(b, o, k);
  await b.commit();
  return { token: k.token, h: k.h, expiresAt: k.exp, deptId: o.deptId, role: o.role };
}
async function inviteRevoke(h) {
  await runTransaction(db, async tx => {
    const s = await tx.get(ref("invitations", h));
    if (!s.exists() || s.data().status !== "active") throw fail("inactive");
    revokeInvite(tx, h, s.data());
  });
}
/* 重新產生＝同一批撤銷舊的（還是 active 的話，含已過期）＋建立新的（新權杖、新的 10 分鐘），兩筆稽核互相指向對方 */
async function inviteRegen(oldH) {
  const k = await newInvite();
  let o = null;
  await runTransaction(db, async tx => {
    const s = await tx.get(ref("invitations", oldH));
    if (!s.exists()) throw fail("missing");
    const cur = s.data();
    o = { deptId: cur.deptId, role: cur.role, legacyRef: cur.legacyRef || "", boundEmail: cur.boundEmail || "" };
    if (cur.status === "active") revokeInvite(tx, oldH, cur, k.h);
    putInvite(tx, o, k, oldH);
  });
  return { token: k.token, h: k.h, expiresAt: k.exp, deptId: o.deptId, role: o.role };
}
async function inviteList() {
  const q = query(collection(db, "invitations"), orderBy("createdAt", "desc"), limit(30));
  return (await getDocs(q)).docs.map(s => ({ h: s.id, ...plainInv(s.data()) }));
}
const ms = t => (t && t.toMillis ? t.toMillis() : 0);
const plainInv = d => ({ deptId: d.deptId, role: d.role, status: d.status, boundEmail: d.boundEmail || "", legacyRef: d.legacyRef || "",
  createdBy: d.createdBy, createdAt: ms(d.createdAt), expiresAt: ms(d.expiresAt), usedBy: d.usedBy || "", usedAt: ms(d.usedAt), revokedAt: ms(d.revokedAt) });
/* 預覽：讀不到（已使用、已撤銷、不存在）或已過期一律回傳 null，不區分原因。
   網路不穩這類暫時的錯誤要丟出去（畫面保留權杖、請對方再試），不能當成失效。
   綁定的舊身分已被別人認領時這張邀請核銷不了（規則要求認領者是自己）：回傳 legacyTaken */
async function invitePreview(token) {
  if (!tokenOk(token)) return null;
  await serverSkew();
  await ensuring;
  let s;
  try { s = await getDoc(ref("invitations", await sha256hex(token))); }
  catch (e) { if (e.code === "permission-denied" || e.code === "not-found") return null; throw fail(codeOf(e)); }
  if (!s.exists()) return null;
  const v = plainInv(s.data());
  if (!(v.status === "active" && v.expiresAt > serverNow())) return null;
  if (v.legacyRef) {
    const l = await getDoc(ref("legacyIdentities", v.legacyRef)).catch(() => null);
    if (l && l.exists() && l.data().claimedBy && l.data().claimedBy !== uid()) return { ...v, legacyTaken: true };
  }
  return v;
}
/* 總管理員看著的那一張：被用掉或撤銷時畫面跟著變 */
function inviteWatch(h, cb) { return onSnapshot(ref("invitations", h), s => cb(s.exists() ? plainInv(s.data()) : null), () => {}); }
/* 核銷：交易內重讀邀請與自己的角色；同一批寫邀請（used＋權杖）、roles、兩筆稽核，有舊身分再加認領＋稽核 */
async function inviteRedeem(token) {
  if (!tokenOk(token)) throw fail("invalid");
  const h = await sha256hex(token), me = uid(), email = auth.currentUser && auth.currentUser.email;
  let result = null;
  try {
    await runTransaction(db, async tx => {
      let inv;
      try { inv = await tx.get(ref("invitations", h)); } catch (_) { throw fail("invalid"); }
      if (!inv.exists()) throw fail("invalid");
      const v = inv.data();
      if (v.status !== "active" || ms(v.expiresAt) <= serverNow()) throw fail("invalid");
      if (v.boundEmail && v.boundEmail !== String(email || "").toLowerCase()) throw fail("bound");
      const rs = await tx.get(ref("roles", me)), cur = rs.exists() ? rs.data() : null, before = cur ? plainRole(cur) : null;
      if (before && before.depts[v.deptId]) throw Object.assign(fail("already"), { deptId: v.deptId, role: before.depts[v.deptId] });
      let leg = null;
      if (v.legacyRef) { const ls = await tx.get(ref("legacyIdentities", v.legacyRef)); leg = ls.exists() ? ls.data() : null; if (leg && leg.claimedBy) throw fail("legacy"); }
      const irev = v.rev + 1, rrev = cur ? cur.rev + 1 : 1;
      const after = { super: before ? before.super : false, depts: { ...(before ? before.depts : {}), [v.deptId]: v.role } };
      tx.update(ref("invitations", h), { status: "used", usedBy: me, usedAt: NOW(), token, rev: irev, updatedAt: NOW(), updatedBy: me });
      tx.set(auditRef("invitations", h, irev), audit("invitations", h, irev, "redeem", { status: "active" }, { status: "used" }, h));
      tx.set(ref("roles", me), { ...after, rev: rrev, lastVia: "invite", lastRef: h, updatedAt: NOW(), updatedBy: me });
      tx.set(auditRef("roles", me, rrev), audit("roles", me, rrev, "invite", before || {}, after, h));
      if (v.legacyRef && leg) {
        const lrev = leg.rev + 1;
        tx.update(ref("legacyIdentities", v.legacyRef), { claimedBy: me, claimedAt: NOW(), rev: lrev, updatedAt: NOW(), updatedBy: me });
        tx.set(auditRef("legacyIdentities", v.legacyRef, lrev), audit("legacyIdentities", v.legacyRef, lrev, "claim", {}, {}, h));
      }
      result = { deptId: v.deptId, role: v.role };
    });
  } catch (e) {
    if (["invalid", "bound", "already", "legacy"].includes(e.code)) throw e;
    throw fail(e.code === "permission-denied" ? "invalid" : codeOf(e));
  }
  return result;
}

/* ---------- 03 F3 專員名單（deptMembers/{部門}__{uid}：部門、uid、角色 role（05）；名字從 profiles） ---------- */
const rosterId = (d, u) => `${d}__${u}`;
const ROLE_OK = ["admin", "editor"];
/* 同部門的名單（編輯者、管理員、總管理員讀得到；別人 permission-denied）。role 是 05 才有的欄位（舊文件沒有，回傳空字串＝還沒對齊） */
async function roster(dept) { return (await rosterFull(dept)).map(x => x.uid); }
async function rosterFull(dept) { return (await getDocs(query(collection(db, "deptMembers"), where("deptId", "==", dept)))).docs.map(s => ({ uid: s.data().uid, role: ROLE_OK.includes(s.data().role) ? s.data().role : "" })); }
/* 本人：自己有角色的部門補上名單、並讓名單上的 role 跟角色一致（第一次登入、QR 加入、核准、角色被改之後都會補）。讀不到或沒寫成不影響其他功能 */
async function rosterSelf(roles) {
  const me = uid(); if (!me || !roles) return;
  for (const [d, r] of Object.entries(roles.depts || {})) {
    if (!ROLE_OK.includes(r)) continue;
    try { const s = await getDoc(ref("deptMembers", rosterId(d, me))); if (!s.exists() || s.data().role !== r) await setDoc(ref("deptMembers", rosterId(d, me)), { deptId: d, uid: me, role: r, at: NOW() }); } catch (_) { /* 下次登入再試 */ }
  }
}
/* 總管理員：讓名單跟角色一致（改角色、核准、撤權之後，與打開「人員」時）：補上缺的、角色不一致的改正（含補上 role）、清掉多的。only＝只看這個 uid */
async function rosterSync(only) {
  const rs = only ? [await getDoc(ref("roles", only))].filter(s => s.exists()).map(s => ({ uid: s.id, depts: s.data().depts || {} }))
    : (await getDocs(collection(db, "roles"))).docs.map(s => ({ uid: s.id, depts: s.data().depts || {} }));
  const have = (await getDocs(only ? query(collection(db, "deptMembers"), where("uid", "==", only)) : collection(db, "deptMembers"))).docs.map(s => s.data());
  const want = new Map(rs.flatMap(r => Object.entries(r.depts).filter(([, v]) => ROLE_OK.includes(v)).map(([d, v]) => [rosterId(d, r.uid), v])));
  const got = new Map(have.map(x => [rosterId(x.deptId, x.uid), x.role || ""]));
  if (only && !rs.length) want.clear();
  const add = [...want].filter(([k, v]) => got.get(k) !== v).map(([k]) => k), del = [...got.keys()].filter(k => !want.has(k));
  let failed = 0;
  for (let i = 0; i < add.length + del.length; i += 5) {   /* 每份寫入的規則讀取約 3～4 次，整批上限 20（不依賴快取）：一批 5 份 */
    const b = writeBatch(db);
    [...add.map(k => ["add", k]), ...del.map(k => ["del", k])].slice(i, i + 5).forEach(([op, k]) => {
      const [d, u] = k.split("__");
      if (op === "add") b.set(ref("deptMembers", k), { deptId: d, uid: u, role: want.get(k), at: NOW() }); else b.delete(ref("deptMembers", k));
    });
    try { await b.commit(); } catch (e) { failed++; }   /* 一批失敗（例如本人剛好同時補上）不擋後面的批，下次打開人員再對齊（03 審查） */
  }
  if (failed) throw Object.assign(new Error("roster"), { code: "partial", failed });
  return { add: add.length, del: del.length };
}
/* 05 部長（部門管理員）撤掉本部門的編輯者：roles（lastVia dept、lastRef 部門）＋稽核＋刪名單同一批。
   規則只准撤編輯者、不能動自己與管理員、不能動別的部門；總管理員不走這條（人員頁的 roleWrite） */
async function deptRemove(target, dept) {
  await runTransaction(db, async tx => {
    const s = await tx.get(ref("roles", target));
    if (!s.exists()) throw fail("inactive");
    const cur = s.data(), before = plainRole(cur);
    if (before.depts[dept] !== "editor") throw fail("inactive");
    const depts = { ...before.depts }; delete depts[dept];
    const after = { super: before.super, depts }, rev = cur.rev + 1, m = await tx.get(ref("deptMembers", rosterId(dept, target)));
    tx.set(ref("roles", target), { ...after, rev, lastVia: "dept", lastRef: dept, updatedAt: NOW(), updatedBy: uid() });
    tx.set(auditRef("roles", target, rev), audit("roles", target, rev, "dept", before, after, dept));
    if (m.exists()) tx.delete(ref("deptMembers", rosterId(dept, target)));
  });
}
/* 05 總管理員刪除舊身分（legacyIdentities 只有總管理員能刪，規則沿用 04）：一批 10 份，回傳實際刪掉幾份 */
async function legacyDelete(ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const b = writeBatch(db);
    ids.slice(i, i + 10).forEach(id => b.delete(ref("legacyIdentities", id)));
    await b.commit(); n += Math.min(10, ids.length - i);
  }
  return n;
}
/* ---------- 人員與角色（第 9.4 節；只有總管理員） ----------
   mutate(目前的 {super, depts}) 回傳新的；via＝manual（授予、改角色、總管理員）或 revoke（只拿掉） */
async function rolesList() { return (await getDocs(collection(db, "roles"))).docs.map(s => ({ uid: s.id, ...plainRole(s.data()), rev: s.data().rev })); }
async function usersList() { return (await getDocs(collection(db, "users"))).docs.map(s => ({ uid: s.id, email: s.data().email || "", lastLoginAt: ms(s.data().lastLoginAt) })); }
async function roleWrite(target, mutate, via, r = "") {
  await runTransaction(db, async tx => {
    const s = await tx.get(ref("roles", target)), cur = s.exists() ? s.data() : null, before = cur ? plainRole(cur) : null;
    const after = plainRole(mutate(before || { super: false, depts: {} }));
    const rev = cur ? cur.rev + 1 : 1;
    tx.set(ref("roles", target), { ...after, rev, lastVia: via, lastRef: r || via, updatedAt: NOW(), updatedBy: uid() });
    tx.set(auditRef("roles", target, rev), audit("roles", target, rev, via, before || {}, after, r || via));
  });
}

/* ---------- 權限申請 ---------- */
/* 04：每人每個部門一份申請，文件 ID＝{自己的 UID}_{部門}（規則要求）。待審中不能再送；撤回、被拒絕、已核准之後再申請＝同一份改回 pending（rev +1＋稽核）。
   04 之前送出的申請（亂數 ID）還在待審時也算，不重複送 */
async function requestCreate(o) {
  const me = uid(), id = `${me}_${o.deptId}`, r = ref("roleRequests", id);
  const mine = (await getDocs(query(collection(db, "roleRequests"), where("uid", "==", me)))).docs;
  if (mine.some(s => s.data().deptId === o.deptId && s.data().status === "pending")) throw fail("pending");
  const cur = mine.find(s => s.id === id), rev = cur ? cur.data().rev + 1 : 1, b = writeBatch(db);
  b.set(r, { uid: me, deptId: o.deptId, role: o.role, note: String(o.note || "").slice(0, 200), ...(o.legacyRef ? { legacyRef: o.legacyRef } : {}),
    status: "pending", rev, createdAt: NOW(), updatedAt: NOW(), updatedBy: me });
  b.set(auditRef("roleRequests", id, rev), audit("roleRequests", id, rev, "request", cur ? { status: cur.data().status } : {}, { status: "pending" }));
  await b.commit();
  return id;
}
const plainReq = s => { const d = s.data(); return { id: s.id, uid: d.uid, deptId: d.deptId, role: d.role, note: d.note || "", legacyRef: d.legacyRef || "", status: d.status, rev: d.rev, createdAt: ms(d.createdAt) }; };
async function requestsMine() { return (await getDocs(query(collection(db, "roleRequests"), where("uid", "==", uid())))).docs.map(plainReq).sort((a, b) => b.createdAt - a.createdAt); }
async function requestsPending() { return (await getDocs(query(collection(db, "roleRequests"), where("status", "==", "pending"), orderBy("createdAt")))).docs.map(plainReq); }
/* seen＝畫面上那一筆的 rev。04 起同一份申請可以撤回後再申請（內容可能不一樣）：決定的一定是畫面上看到的那一版，
   交易裡讀到的 rev 不同＝清單讀出來之後被改過，不寫入、回 changed，畫面重讀清單 */
async function requestDecide(id, to, seen) {   /* to＝cancelled（本人撤回）｜rejected（總管理員） */
  await runTransaction(db, async tx => {
    const s = await tx.get(ref("roleRequests", id));
    if (!s.exists() || s.data().status !== "pending") throw fail("inactive");
    if (seen != null && s.data().rev !== seen) throw fail("changed");
    const rev = s.data().rev + 1, w = { status: to, rev, updatedAt: NOW(), updatedBy: uid() };
    if (to === "rejected") Object.assign(w, { decidedBy: uid(), decidedAt: NOW() });
    tx.update(ref("roleRequests", id), w);
    tx.set(auditRef("roleRequests", id, rev), audit("roleRequests", id, rev, to === "rejected" ? "reject" : "cancel", { status: "pending" }, { status: to }));
  });
}
/* 核准：同一批把申請改成 approved、roles 只加（或改成）申請的那一項（lastVia request、lastRef＝申請 ID），各自稽核；
   申請帶舊身分而且還沒人認領時，同一批替申請人認領 */
async function requestApprove(id, seen) {
  if (seen == null) throw fail("changed");   /* 一定要帶畫面上那一版的 rev */
  await runTransaction(db, async tx => {
    const s = await tx.get(ref("roleRequests", id));
    if (!s.exists() || s.data().status !== "pending") throw fail("inactive");
    if (s.data().rev !== seen) throw fail("changed");
    const q = s.data(), rs = await tx.get(ref("roles", q.uid)), cur = rs.exists() ? rs.data() : null, before = cur ? plainRole(cur) : null;
    if (before && before.depts[q.deptId] === q.role) throw fail("same");
    let leg = null;
    if (q.legacyRef) { const ls = await tx.get(ref("legacyIdentities", q.legacyRef)); leg = ls.exists() && !ls.data().claimedBy ? ls.data() : null; }
    const qrev = q.rev + 1, rrev = cur ? cur.rev + 1 : 1;
    const after = { super: before ? before.super : false, depts: { ...(before ? before.depts : {}), [q.deptId]: q.role } };
    tx.update(ref("roleRequests", id), { status: "approved", decidedBy: uid(), decidedAt: NOW(), rev: qrev, updatedAt: NOW(), updatedBy: uid() });
    tx.set(auditRef("roleRequests", id, qrev), audit("roleRequests", id, qrev, "approve", { status: "pending" }, { status: "approved" }));
    tx.set(ref("roles", q.uid), { ...after, rev: rrev, lastVia: "request", lastRef: id, updatedAt: NOW(), updatedBy: uid() });
    tx.set(auditRef("roles", q.uid, rrev), audit("roles", q.uid, rrev, "request", before || {}, after, id));
    if (leg) {
      const lrev = leg.rev + 1;
      tx.update(ref("legacyIdentities", q.legacyRef), { claimedBy: q.uid, claimedAt: NOW(), rev: lrev, updatedAt: NOW(), updatedBy: uid() });
      tx.set(auditRef("legacyIdentities", q.legacyRef, lrev), audit("legacyIdentities", q.legacyRef, lrev, "claim", {}, {}, id));
    }
  });
}

/* ---------- 稽核紀錄（第 9.5 節；只有總管理員） ----------
   by：{actor}＝某人做過什麼（Q27）｜{roles: uid}＝某人的權限歷史（Q25）｜空＝最近（Q26）；after＝上一頁最後一筆（翻頁） */
const plainLog = s => { const d = s.data(); return { id: s.id, col: d.col, docId: d.docId, rev: d.rev, action: d.action, actor: d.actor, at: ms(d.at), before: d.before || {}, after: d.after || {}, ref: d.ref || "", _s: s }; };
async function auditList(by = {}, after = null, n = 50) {
  const c = collection(db, "auditLogs"), parts = [];
  if (by.actor) parts.push(where("actor", "==", by.actor), orderBy("at", "desc"));
  else if (by.roles) parts.push(where("col", "==", "roles"), where("docId", "==", by.roles), orderBy("rev", "desc"));
  else parts.push(orderBy("at", "desc"));
  if (after) parts.push(startAfter(after._s));
  parts.push(limit(n));
  const docs = (await getDocs(query(c, ...parts))).docs.map(plainLog);
  return { items: docs, more: docs.length === n };
}
/* 檢查連號：從第 1 號到目前的 rev，回傳缺的號碼（規則保證不會缺；這是給會長室事後確認的工具） */
async function auditChain(col, id) {
  const cur = await getDoc(ref(col, id));
  if (!cur.exists()) return { rev: 0, missing: [] };
  const rev = cur.data().rev || 0;
  const have = new Set((await getDocs(query(collection(db, "auditLogs"), where("col", "==", col), where("docId", "==", id), orderBy("rev", "desc")))).docs.map(s => s.data().rev));
  const missing = [];
  for (let i = 1; i <= rev; i++) if (!have.has(i)) missing.push(i);
  return { rev, missing };
}

const api = { init, onUser, ensured, signIn, signOut, onRoles, setName, profiles, legacyList, legacyDelete, roster, rosterFull, rosterSelf, rosterSync, deptRemove,
  inviteCreate, inviteRevoke, inviteRegen, inviteList, invitePreview, inviteRedeem, inviteWatch,
  rolesList, usersList, roleWrite, requestCreate, requestsMine, requestsPending, requestDecide, requestApprove,
  auditList, auditChain, serverNow: () => serverNow() };
window.BoardAccount = api;
dispatchEvent(new Event("board-account-ready"));
