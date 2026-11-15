/* 核心｜Firestore 寫入（02D，docs/architecture/permissions.md 第 5.1 節、5.1d 節）。ES module：
   只有 source:"firestore" 的部門、有編輯權限的人按「儲存」時才由 store.js 載入。授權一律由 Security Rules 判斷，這裡只照規則要求的形狀寫：
   - 比對「上次讀回來時的畫面資料」與「現在的畫面資料」（store-map.js 的 desired），只寫改過的文件。
   - 卡片：新增＝卡片＋第 1 版同一批；修改內容＝version +1＋同一批新建那一版；從卡片拿掉的時間標記同一批刪掉（一批最多 3 個）；
     只換順序＝只改 order；結案時間＝伺服器時間。新建就是完成的卡片（完成這一段）先建成進行中，下一批再結案。
   - 時間標記（events）一定列在卡片的 timeIds；換到別張卡片的時間標記（完成這一段）用新的 ID 重建。
   - 永久刪除：開始（purging＋刪除紀錄，亂數 nonce）→ 時間標記每批 3 個 → 版本由新往舊每批 3 個 → 最後一批刪卡片。
   - 部門設定：rev +1＋同一批稽核紀錄 auditLogs/deptSettings_{部門}_{rev}；只有部門管理員與總管理員寫（編輯者改到的週報基準不寫）。
   - 每一批規則讀取不超過 20 次（照 permissions.md 的算法、不依賴快取），用交易：先讀要改的文件，版本號（version、rev、updatedAt）
     跟上次讀到的不同就整批不寫（conflict），不會蓋掉別人剛存的內容。
   錯誤一律丟出帶 code 的 Error（conflict、permission-denied、unavailable、badtime…）；e.committed＝失敗前已經寫入的批數。 */
import { fb, authReady } from "./fb-app.js";
import { doc, collection, query, where, getDocs, runTransaction, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const MAX_READS = 20;
/* 每個寫入的規則讀取次數（不同文件的 get／exists／getAfter／existsAfter 各算一次；角色文件 2） */
const COST = { simple: 2, cardNew: 4, cardEdit: 4, ver: 1, reorder: 2, ev: 4, settings: 4, purgeStart: 6, sweepCard: 5, verDel: 5, cardDel: 3 };
const M = () => window.StoreMap;
const fail = code => Object.assign(new Error(code), { code });
/* 比對用：鍵排序後的 JSON */
const stable = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, y) => (o[y] = x[y], o), {}) : x);
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");

/* {__now}／{__ts} → Firestore 型別；跟原本文件相同的欄位直接用原本的值（時間戳記保留微秒，規則的 unchanged 才會成立） */
function typed(v) {
  if (Array.isArray(v)) return v.map(typed);
  if (v && typeof v === "object") {
    if (v.__now) return serverTimestamp();
    if (typeof v.__ts === "number") return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typed(x)]));
  }
  return v;
}
function finalize(data, orig) {
  const o = {};
  for (const [k, v] of Object.entries(data)) o[k] = orig && k in orig && stable(M().plain(orig[k])) === stable(v) ? orig[k] : typed(v);
  return o;
}

/* 換到別張卡片的時間標記（完成這一段把過去的時間標記移到完成紀錄）：events 的 cardId 不能改，換新的 ID 重建；母議題的處理紀錄跟著換 */
function movedTimes(dept, s, src) {
  const at = new Map((src.events || []).map(e => [e.id, e.cardId])), nid = M().nid;
  (s.events || []).forEach(e => (e.times || []).forEach(t => {
    const was = at.get(nid(dept, t.id));
    if (!was || was === nid(dept, e.id)) return;
    const id = "t" + rand(6);
    (s.issues || []).forEach(i => (i.markers || []).forEach(m => { if (m.evId === e.id && m.tmId === t.id) m.tmId = id; }));
    t.id = id;
  }));
}

let db = null, me = "";
const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: me });
const sameTs = (a, b) => !!a && !!b && typeof a.isEqual === "function" && a.isEqual(b);
/* 一個不可分割的寫入單位：cost＝規則讀取次數、checks＝交易裡先讀的文件與條件、writes＝寫入 */
const unit = (cost, writes, checks = []) => ({ cost, writes, checks, paths: writes.map(w => w.path) });

/* 永久刪除（permissions.md 第 5.1 節，順序同 backend/tests/helpers.js 的 purgeCard）。versions＝現存的版本號（由新往舊刪） */
function purgeUnits(dept, id, card, versions, { start, srcEvents }) {
  const cp = `cards/${id}`, out = [];
  if (start) {
    const nonce = rand(12);
    out.push(unit(COST.purgeStart, [
      { path: cp, op: "update", data: { state: "purging", deletedAt: serverTimestamp(), deletedBy: me, purgeLog: nonce, ...stamp() } },
      { path: `auditLogs/cards_${id}_purge_${nonce}`, op: "set", data: { col: "cards", docId: id, rev: card.version, action: "purge", actor: me, at: serverTimestamp(),
        before: { title: card.title, deptId: card.deptId, state: card.state }, after: { state: "purging" }, ref: nonce } }],
      [{ path: cp, ok: s => s && s.version === card.version && (s.state === "open" || s.state === "done") }]));
  }
  const left = [...(card.timeIds || [])];
  while (left.length) {
    const gone = left.splice(0, 3), rest = left.slice();
    const dels = gone.filter(e => srcEvents.has(e));   /* timeIds 裡沒有文件的 ID（中斷過的寫入）只從清單拿掉 */
    out.push(unit(COST.sweepCard + COST.ev * dels.length,
      [...dels.map(e => ({ path: `events/${e}`, op: "delete" })), { path: cp, op: "update", data: { timeIds: rest, ...stamp() } }],
      [{ path: cp, ok: s => s && s.state === "purging" }]));
  }
  const vs = versions.slice().sort((a, b) => b - a);
  while (vs.length > 3) out.push(unit(COST.verDel * 3, vs.splice(0, 3).map(v => ({ path: `${cp}/versions/${v}`, op: "delete" }))));
  out.push(unit(COST.verDel * vs.length + COST.cardDel, [...vs.map(v => ({ path: `${cp}/versions/${v}`, op: "delete" })), { path: cp, op: "delete" }],
    [{ path: cp, ok: s => s && s.state === "purging" }]));
  return out;
}

/* 上次中斷的永久刪除（卡片停在 purging）：同部門的編輯者下次儲存時接著清完 */
async function resumeUnits(dept) {
  const out = [];
  const qs = await getDocs(query(collection(db, "cards"), where("deptId", "==", dept), where("state", "==", "purging")));
  for (const s of qs.docs) {
    const c = s.data(), ids = new Set();
    for (const e of c.timeIds || []) ids.add(e);   /* 清單上的都當成存在：查不到的會被規則擋下，下次再試 */
    const vs = (await getDocs(collection(db, `cards/${s.id}/versions`))).docs.map(v => +v.id).filter(Number.isFinite);
    out.push(...purgeUnits(dept, s.id, c, vs, { start: false, srcEvents: ids }));
  }
  return out;
}

async function saveDept(cfg, dept, base, next, opt = {}) {
  await authReady(cfg);
  const f = fb(cfg);
  db = f.db; me = f.auth.currentUser && f.auth.currentUser.uid;
  if (!me) throw fail("permission-denied");
  const src = base.src, orig = base.orig;
  const draft = JSON.parse(JSON.stringify(next));
  movedTimes(dept, draft, src);
  const B = M().desired(dept, base.state, src, me), N = M().desired(dept, draft, src, me);
  const rawOf = k => new Map((src[k] || []).map(d => [d.id, d]));
  const R = { cards: rawOf("cards"), issues: rawOf("issues"), weeks: rawOf("weeks"), labels: rawOf("labels"), events: rawOf("events") };
  const units = [];
  const ts = t => { if (!t.start || !t.end) throw fail("badtime"); return t; };

  /* ---- 部門設定（管理員以上；稽核鏈） ---- */
  if (stable(B.settings) !== stable(N.settings) && opt.admin) {
    const r = src.settings, o = orig.settings[dept];
    if (!r && !opt.super) throw fail("permission-denied");
    const rev = r ? r.rev + 1 : 1, keys = Object.keys({ ...B.settings, ...N.settings }).filter(k => stable(B.settings[k]) !== stable(N.settings[k]));
    units.push(unit(COST.settings, [
      { path: `deptSettings/${dept}`, op: "set", data: { ...finalize(N.settings, o), rev, ...stamp() } },
      { path: `auditLogs/deptSettings_${dept}_${rev}`, op: "set", data: { col: "deptSettings", docId: dept, rev, action: "update", actor: me, at: serverTimestamp(),
        before: {}, after: { fields: keys }, ref: "" } }],
      r ? [{ path: `deptSettings/${dept}`, ok: s => s && s.rev === r.rev }] : []));
  }

  /* ---- 標籤、議題、週報：新增、修改；刪除只有總管理員 ---- */
  for (const kind of ["labels", "issues", "weeks"]) {
    const rev = kind === "issues";
    for (const [id, d] of Object.entries(N[kind])) {
      const b = B[kind][id], p = `${kind}/${id}`, r = R[kind].get(id), o = orig[kind][id];
      if (!b) units.push(unit(COST.simple, [{ path: p, op: "set", data: { ...typed(d), ...(rev ? { rev: 1 } : {}), ...stamp() } }]));
      else if (stable(b) !== stable(d)) units.push(unit(COST.simple, [{ path: p, op: "set", data: { ...finalize(d, o), ...(rev ? { rev: r.rev + 1 } : {}), ...stamp() } }],
        [{ path: p, ok: s => s && (rev ? s.rev === r.rev : sameTs(s.updatedAt, o && o.updatedAt)) }]));
    }
    for (const id of Object.keys(B[kind])) if (!N[kind][id]) {
      if (!opt.super) throw fail("permission-denied");
      const r = R[kind].get(id), o = orig[kind][id];
      units.push(unit(COST.simple, [{ path: `${kind}/${id}`, op: "delete" }],
        [{ path: `${kind}/${id}`, ok: s => s && (rev ? s.rev === r.rev : sameTs(s.updatedAt, o && o.updatedAt)) }]));
    }
  }

  /* ---- 卡片與時間標記 ---- */
  const verDoc = (id, c, v, times) => ({ path: `cards/${id}/versions/${v}`, op: "set", data: { cardId: id, deptId: c.deptId, version: v, title: c.title,
    blocks: c.blocks, times, state: c.state, by: me, at: serverTimestamp(), imported: false } });
  const timesOf = (D, id, c) => (c.timeIds || []).filter(e => D.events[e]).map(e => ({ id: e, label: D.events[e].label, startRaw: D.events[e].startRaw, endRaw: D.events[e].endRaw }));
  const evWrites = (id) => {
    const out = [];
    for (const [eid, e] of Object.entries(N.events)) {
      if (e.cardId !== id) continue;
      const b = B.events[eid], r = R.events.get(eid);
      if (!b) out.push(unit(COST.ev, [{ path: `events/${eid}`, op: "set", data: { ...typed(ts(e)), rev: 1, ...stamp() } }]));
      else if (stable(b) !== stable(e)) out.push(unit(COST.ev, [{ path: `events/${eid}`, op: "set", data: { ...finalize(ts(e), orig.events[eid]), rev: r.rev + 1, ...stamp() } }],
        [{ path: `events/${eid}`, ok: s => s && s.rev === r.rev }]));
    }
    return out;
  };
  /* 新卡片先寫、再改舊卡片（完成這一段：完成紀錄與它的時間標記先建好，才從原本的卡片拿掉，中途失敗也不會少掉時間標記） */
  const cardOrder = Object.entries(N.cards).sort(([a], [b]) => (B.cards[a] ? 1 : 0) - (B.cards[b] ? 1 : 0));
  for (const [id, d] of cardOrder) {
    const b = B.cards[id], cp = `cards/${id}`;
    if (!b) {   /* 新增：卡片＋第 1 版（一定是進行中）；時間標記接在後面；完成這一段產生的完成紀錄再結案（第 2 版） */
      const c1 = { ...d, state: "open", doneAt: null };
      units.push(unit(COST.cardNew + COST.ver, [{ path: cp, op: "set", data: { ...typed(c1), version: 1, ...stamp() } }, verDoc(id, c1, 1, timesOf(N, id, d))]));
      units.push(...evWrites(id));
      if (d.state === "done") {   /* createdAt 已是第一批的伺服器時間，不能再寫：只改狀態 */
        const c2 = { ...c1, state: "done" };
        units.push(unit(COST.cardEdit + COST.ver, [{ path: cp, op: "update", data: { state: "done", doneAt: serverTimestamp(), version: 2, ...stamp() } }, verDoc(id, c2, 2, timesOf(N, id, d))],
          [{ path: cp, ok: s => s && s.version === 1 }]));
      }
      continue;
    }
    const r = R.cards.get(id), o = orig.cards[id];
    const content = stable(omit(b, ["order"])) !== stable(omit(d, ["order"]));
    let v = r.version;
    if (content) {
      /* 從 timeIds 拿掉的時間標記同一批刪掉，一批最多 3 個；超過就先分批只拿掉時間標記（每批也是一個新版本），最後一批再寫全部內容 */
      const drop = (r.timeIds || []).filter(e => !d.timeIds.includes(e)), parts = chunks(drop, 3);
      if (!parts.length) parts.push([]);
      let left = (r.timeIds || []).slice();
      parts.forEach((part, k) => {
        const last = k === parts.length - 1, dels = part.filter(e => R.events.has(e));
        left = left.filter(e => !part.includes(e));
        const c = last ? d : { ...b, timeIds: left.slice() }, want = v;
        v++;
        units.push(unit(COST.cardEdit + part.length + COST.ver + COST.ev * dels.length,
          [{ path: cp, op: "set", data: { ...finalize(c, o), version: v, ...stamp() } }, verDoc(id, c, v, timesOf(last ? N : B, id, c)),
           ...dels.map(e => ({ path: `events/${e}`, op: "delete" }))],
          [{ path: cp, ok: s => s && s.version === want && (s.state === "open" || s.state === "done") }]));
      });
    } else if (b.order !== d.order) {
      units.push(unit(COST.reorder, [{ path: cp, op: "update", data: { order: d.order, ...stamp() } }],
        [{ path: cp, ok: s => s && s.version === v && (s.state === "open" || s.state === "done") }]));
    }
    units.push(...evWrites(id));
  }
  /* 畫面上刪掉的卡片：永久刪除（版本是連續的 1～version） */
  for (const id of Object.keys(B.cards)) if (!N.cards[id]) {
    const r = R.cards.get(id);
    units.push(...purgeUnits(dept, id, r, Array.from({ length: r.version }, (_, i) => i + 1), { start: true, srcEvents: R.events }));
  }

  units.unshift(...await resumeUnits(dept));
  return run(units);
}

/* 依序裝進每一批（規則讀取 ≤ 20、同一份文件一批只寫一次），每一批一個交易 */
async function run(units) {
  const batches = [];
  let cur = null;
  for (const u of units) {
    if (u.cost > MAX_READS) throw fail("too-big");
    if (!cur || cur.cost + u.cost > MAX_READS || u.paths.some(p => cur.paths.has(p))) { cur = { cost: 0, paths: new Set(), units: [] }; batches.push(cur); }
    cur.cost += u.cost; u.paths.forEach(p => cur.paths.add(p)); cur.units.push(u);
  }
  let committed = 0;
  for (const b of batches) {
    try {
      await runTransaction(db, async tx => {
        const checks = b.units.flatMap(u => u.checks);
        const snaps = await Promise.all(checks.map(c => tx.get(doc(db, c.path))));
        snaps.forEach((s, i) => { if (!checks[i].ok(s.exists() ? s.data() : null)) throw fail("conflict"); });
        for (const u of b.units) for (const w of u.writes) {
          const ref = doc(db, w.path);
          if (w.op === "delete") tx.delete(ref); else if (w.op === "update") tx.update(ref, w.data); else tx.set(ref, w.data);
        }
      }, { maxAttempts: 3 });
    } catch (e) {
      const err = e && e.code ? e : fail("error");
      err.committed = committed;
      throw err;
    }
    committed++;
  }
  return { batches: committed };
}

window.BoardStoreWrite = { saveDept };
dispatchEvent(new Event("board-store-write-ready"));
