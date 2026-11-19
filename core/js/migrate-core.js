/* 核心｜遷移的共用邏輯（02D D-a）：命令列（backend/migrate/run.js，只連模擬器）與網頁匯入頁（core/js/migrate-web.js，總管理員登入後
   在會長室管理執行）共用這一份，所以兩邊的匯入、跳過、衝突、驗證、筆數報告一定相同。欄位對照在 store-map.js。
   不碰網路與畫面：讀寫都透過呼叫端給的 io（下面），時間值一律 {__ts: 毫秒}，伺服器時間 {__now: true}，由 io 換成 Firestore 的型別。
   io＝{ get(path) → 文件內容（plain）或 null；list(col) → [{id, path, ...內容}]；listGroup(name) → 同上（collection group）；
         commit(writes) → 一批寫入，writes＝[{path, data, merge}]（merge＝只改給的欄位） }
   只讀來源（src＝{depts, commit, only, files:[{dept, path, sha256, state}]}），永遠不寫資料檔。 */
(function (root) {
  "use strict";
  const MAP = typeof module === "object" && module.exports ? require("./store-map.js") : root.StoreMap;
  const NOW = { __now: true };
  const SENSITIVE_KEYS = ["sync", "tokenAll", "tokenEnc", "tok", "kdf", "pwKdf", "pwHash"];
  const PROTECTED = new Set(["legacyIdentities", "deptSettings", "grants"]);            /* 有 rev＋稽核鏈 */
  const ORDER = ["departments", "org", "legacyIdentities", "deptSettings", "grants", "labels", "issues", "weeks", "cards", "versions", "events", "meetingMinutes"];
  const COST = { cards: 12, events: 6, legacyIdentities: 6, deptSettings: 6, grants: 6 };   /* 規則讀取次數估算（整批上限 20，不依賴快取） */
  const IGNORE = new Set(["updatedAt", "updatedBy", "importBatch", "at", "by"]);

  /* 比對內容（不看寫入者、時間戳記、批次號）：鍵排序後的 JSON；命令列再取 SHA-256 當雜湊 */
  const norm = v => Array.isArray(v) ? v.map(norm) : v && typeof v === "object"
    ? (v.__now ? "__now" : Object.keys(v).filter(k => !IGNORE.has(k)).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {})) : v;
  const contentKey = data => JSON.stringify(norm(data));

  /* 產生所有文件（不寫入）。schemaVersion 不是 13 或 14 的檔案直接停下來（不猜舊格式；14＝13＋即時回報的 blocks，03 起 GitHub 模式存的檔案）。
     只匯入一個部門時，departments 只寫那一個 */
  function plan(src, { batch, uid }) {
    const out = [], reports = [];
    src.depts.forEach((d, i) => { if (!src.only || d.id === src.only) out.push({ kind: "departments", path: `departments/${d.id}`,
      data: { name: d.name, order: i, active: !d.test, updatedAt: NOW, updatedBy: uid } }); });
    for (const f of src.files) {
      const v = +f.state.schemaVersion || +f.state.v || 0;
      if (v !== 13 && v !== 14) throw new Error(`${f.path} 的 schemaVersion 是 ${v}，不是 13 或 14：請先用看板開啟並儲存一次（core/js/state.js 的 migrate）再遷移`);
      const r = MAP.toDocs(f.dept, f.state, { batch, uid });
      out.push(...r.docs);
      reports.push(r.report);
    }
    return { docs: out, reports };
  }

  /* 03 審查（P2-2）：超過規則上限的卡片（store-map.js 的 report.tooBig），一行一張 */
  const tooBigLines = reports => reports.flatMap(r => (r.tooBig || []).map(x => `${r.dept}／${x.id}「${x.name}」：${x.why.join("、")}`));

  /* 匯入：先建 migrations/{batch}（running＋稽核），再分批寫；重跑時已存在且內容相同就跳過，不同的不覆寫、列為衝突 */
  async function runImport(io, src, { batch, uid, log = () => {} }) {
    const p = plan(src, { batch, uid });
    /* 有卡片超過規則上限：寫入任何文件（含批次紀錄）之前就停，列出是哪幾張（不讓整個部門寫到一半被規則擋下才發現） */
    const big = tooBigLines(p.reports);
    if (big.length) throw Object.assign(new Error(`有 ${big.length} 張卡片超過上限，請先在看板上改短再匯入（沒有寫入任何文件）：\n${big.join("\n")}`), { code: "too-big", tooBig: big });
    const counts = {}, written = {}, skipped = {}, conflicts = [];
    p.docs.forEach(d => counts[d.kind] = (counts[d.kind] || 0) + 1);
    const existing = await io.get(`migrations/${batch}`);
    let mrev;
    if (!existing) {
      await io.commit([
        { path: `migrations/${batch}`, data: { status: "running", sourceCommit: src.commit, fileHashes: Object.fromEntries(src.files.map(f => [f.dept, f.sha256])),
          counts: {}, report: "", startedBy: uid, startedAt: NOW, rev: 1, updatedAt: NOW, updatedBy: uid } },
        { path: `auditLogs/migrations_${batch}_1`, data: { col: "migrations", docId: batch, rev: 1, action: "start", actor: uid,
          at: NOW, before: {}, after: { status: "running" }, ref: src.commit } }]);
      mrev = 1;
    } else {
      if (existing.status !== "running") throw new Error(`批次 ${batch} 已經是 ${existing.status}，不能再用來寫入`);
      mrev = existing.rev;
    }
    /* 卡片與它的第 1 版放同一個單位（規則要求同批）；其他一份文件一個單位 */
    const units = [];
    const versions = new Map(p.docs.filter(d => d.kind === "versions").map(d => [d.path.split("/versions/")[0], d]));
    for (const kind of ORDER) for (const d of p.docs.filter(x => x.kind === kind)) {
      if (kind === "versions") continue;
      const writes = [d];
      if (kind === "cards") writes.push(versions.get(d.path));
      units.push({ kind, writes, cost: COST[kind] || 3 });
    }
    const todo = [];
    for (const u of units) {
      const have = await io.get(u.writes[0].path);
      if (have) {
        const want = { ...u.writes[0].data }, got = { ...have };
        Object.keys(want).forEach(k => { if (want[k] && want[k].__now) { delete got[k]; delete want[k]; } });   /* 伺服器時間欄位不比 */
        if (contentKey(got) === contentKey(want)) { skipped[u.kind] = (skipped[u.kind] || 0) + 1; continue; }
        conflicts.push(u.writes[0].path); continue;
      }
      todo.push(u);
    }
    /* 分批：讀取估算 ≤ 18、寫入 ≤ 400 */
    const batches = [];
    let cur = [], cost = 0, nw = 0;
    for (const u of todo) {
      const w = u.writes.length + (PROTECTED.has(u.kind) ? 1 : 0);
      if (cur.length && (cost + u.cost > 18 || nw + w > 400)) { batches.push(cur); cur = []; cost = 0; nw = 0; }
      cur.push(u); cost += u.cost; nw += w;
    }
    if (cur.length) batches.push(cur);
    for (const [i, us] of batches.entries()) {
      const writes = [];
      for (const u of us) {
        for (const d of u.writes) writes.push({ path: d.path, data: d.data });
        if (PROTECTED.has(u.kind)) { const [col, id] = u.writes[0].path.split("/");
          writes.push({ path: `auditLogs/${col}_${id}_1`, data: { col, docId: id, rev: 1, action: "import", actor: uid, at: NOW, before: {}, after: {}, ref: batch } }); }
        written[u.kind] = (written[u.kind] || 0) + u.writes.length - (u.kind === "cards" ? 1 : 0);
        if (u.kind === "cards") written.versions = (written.versions || 0) + 1;
      }
      try { await io.commit(writes); } catch (e) { e.message = `第 ${i + 1}/${batches.length} 批失敗（${us.map(u => u.writes[0].path).join(", ")}）：${e.message}`; e.batchNo = i + 1; throw e; }
      log(`批次 ${i + 1}/${batches.length}：${us.length} 個單位`, i + 1, batches.length);
    }
    return { plan: p, counts, written, skipped, conflicts, batches: batches.length, mrev };
  }

  /* 批次狀態轉換（規則：running → done／failed／rollingBack；failed → rollingBack；rollingBack → rolledBack），每次都有稽核紀錄 */
  async function setMigrationStatus(io, batch, uid, status, summary = {}) {
    const cur = await io.get(`migrations/${batch}`);
    /* 只寫改到的欄位（merge）：startedAt 是伺服器時間（微秒），換成 {__ts} 再寫回會變，規則的 unchanged 就不成立 */
    const next = { status, rev: cur.rev + 1, updatedAt: NOW, updatedBy: uid };
    if (summary.counts) next.counts = summary.counts;
    if (Object.keys(summary).length) next.report = JSON.stringify(summary).slice(0, 50000);
    if (["done", "failed", "rolledBack"].includes(status)) next.finishedAt = NOW;
    await io.commit([{ path: `migrations/${batch}`, data: next, merge: true },
      { path: `auditLogs/migrations_${batch}_${cur.rev + 1}`, data: { col: "migrations", docId: batch, rev: cur.rev + 1, action: status, actor: uid,
        at: NOW, before: { status: cur.status }, after: { status }, ref: "" } }]);
  }

  /* ---------- 驗證 V1～V4、V6（V5＝重跑一次：第二次寫入 0、內容雜湊相同，要跑兩次才看得出來，不在單次報告裡；V7 在測試裡用不同身分讀；V8 是現有 Playwright 測試） ----------
     dept：只看這一個部門的文件（逐部門切換時其他部門可能已經匯入、甚至已經在編輯）。連結檢查仍對照整個資料庫；
     指到別的部門而那個部門還沒匯入的（例如會長室追蹤權益部的議題），列出來但不算失敗。回傳的 key 是內容指紋（命令列取 SHA-256 當 hash） */
  const ofDept = (dept, kind, d) => !dept ? true
    : kind === "departments" || kind === "deptSettings" ? d.id === dept
    : kind === "org" ? dept === "secretariat" : kind === "grants" ? dept === "president" : d.deptId === dept;
  async function verify(io, src, p, { dept = src.only } = {}) {
    const out = { ok: true, items: [] };
    const fail = (id, msg) => { out.ok = false; out.items.push({ id, ok: false, msg }); };
    const pass = (id, msg) => out.items.push({ id, ok: true, msg });
    const every = {};
    for (const c of ["departments", "deptSettings", "legacyIdentities", "cards", "issues", "weeks", "labels", "events", "meetingMinutes"])
      every[c] = await io.list(c);
    every.versions = await io.listGroup("versions");
    every.org = await io.list("org");
    every.grants = await io.list("grants");
    const all = Object.fromEntries(Object.entries(every).map(([k, v]) => [k, v.filter(d => ofDept(dept, k, d))]));
    /* V1 筆數：每個集合、每個部門 */
    const want = {};
    p.docs.forEach(d => { const dp = d.data.deptId || d.path.split("/")[1]; const k = `${d.kind}/${d.kind === "departments" || d.kind === "deptSettings" ? "-" : dp}`; want[k] = (want[k] || 0) + 1; });
    const have = {};
    for (const [kind, docs] of Object.entries(all)) docs.forEach(d => { const k = `${kind}/${kind === "departments" || kind === "deptSettings" ? "-" : (d.deptId || d.id)}`; have[k] = (have[k] || 0) + 1; });
    const diff = Object.keys({ ...want, ...have }).filter(k => (want[k] || 0) !== (have[k] || 0) && !k.startsWith("org/") && !k.startsWith("grants/"));
    diff.length ? fail("V1", "筆數不符：" + diff.map(k => `${k} 來源 ${want[k] || 0}／寫入 ${have[k] || 0}`).join("；")) : pass("V1", `${Object.keys(want).length} 組集合×部門筆數相同`);
    /* V2 多行說明：blocks 接回去（攤平成 desc，03）＝legacyDesc＝原始 desc */
    const srcCards = new Map();
    src.files.forEach(f => (f.state.events || []).forEach(e => srcCards.set(`${f.dept}__${e.id}`, String(e.desc || ""))));
    let multi = 0; const bad2 = [];
    for (const c of all.cards) { const joined = MAP.descOf(MAP.fromFsBlocks(c.deptId, c.blocks)), orig = srcCards.get(c.id);
      if (orig != null && orig.includes("\n") && joined === orig) multi++;
      if (joined !== orig || c.legacyDesc !== orig) bad2.push(c.id); }
    bad2.length ? fail("V2", "還原不符：" + bad2.join(", ")) : pass("V2", `${all.cards.length} 張卡片還原相同，其中多行 ${multi} 張`);
    /* V3 連結：議題、註記、追蹤、分段來源、標籤、負責人 */
    const ids = new Set([...every.cards, ...every.issues, ...every.labels, ...every.events, ...every.legacyIdentities].map(d => d.id));
    const broken = [], pending = [];
    const own = id => !dept || String(id).startsWith(dept + "__") || String(id).startsWith(`legacy:${dept}__`);
    const chk = (what, from, id) => { if (id && !ids.has(id)) (own(id) ? broken : pending).push(`${what}:${from}→${id}`); };
    all.cards.forEach(c => { chk("issueId", c.id, c.issueId); chk("fromEv", c.id, c.fromEv); (c.labels || []).forEach(x => chk("label", c.id, x));
      (c.staff || []).forEach(s => chk("staff", c.id, s.replace(/^legacy:/, ""))); (c.timeIds || []).forEach(x => chk("timeId", c.id, x)); });
    all.issues.forEach(i => (i.markers || []).forEach(m => { chk("marker.evId", i.id, m.evId); chk("marker.tmId", i.id, m.tmId); }));
    all.deptSettings.forEach(s => (s.follows || []).forEach(f => chk("follow", s.id, f.ref)));
    all.events.forEach(e => chk("event.cardId", e.id, e.cardId));
    const srcBroken = p.reports.flatMap(r => r.broken.map(b => `${b.what}:${r.dept}__${b.from}→${b.id}`));
    const note = (srcBroken.length ? `；來源本來就斷的 ${srcBroken.length} 筆已保留原值` : "") + (pending.length ? `；指到還沒匯入的部門 ${pending.length} 筆（${pending.join(", ")}）` : "");
    broken.length ? fail("V3", "斷掉的連結：" + broken.join(", ") + (srcBroken.length ? `（來源本來就斷的：${srcBroken.join(", ")}）` : ""))
      : pass("V3", "所有連結都指得到" + note);
    out.pending = pending;
    /* V4 時間：startRaw 重新解析＝start；全天事件在台灣時間是同一天 */
    const bad4 = all.events.filter(e => { const s = MAP.parseTaipei(e.startRaw);
      return !s || s.ms !== e.start.__ts || s.allDay !== e.allDay || (e.allDay && MAP.fmtTaipei(e.start.__ts, true) !== e.startRaw.slice(0, 10)); });
    bad4.length ? fail("V4", "時間不符：" + bad4.map(e => e.id).join(", ")) : pass("V4", `${all.events.length} 筆時間標記相同`);
    /* V6 敏感欄位：鍵名不存在、來源裡的權杖與雜湊字串也不存在（讀得到的整個資料庫都查） */
    const secrets = [];
    const grab = (o, inSecret) => { if (Array.isArray(o)) return o.forEach(x => grab(x, inSecret));
      if (o && typeof o === "object") return Object.entries(o).forEach(([k, v]) => grab(v, inSecret || SENSITIVE_KEYS.includes(k)));
      if (inSecret && typeof o === "string" && o.length >= 16) secrets.push(o); };
    src.files.forEach(f => grab(f.state, false));
    const dump = JSON.stringify(every);
    const keyHit = SENSITIVE_KEYS.filter(k => dump.includes(`"${k}":`));
    const valHit = secrets.filter(s => dump.includes(s));
    keyHit.length || valHit.length ? fail("V6", `找到敏感欄位 ${keyHit.join(",")}，值 ${valHit.length} 筆`) : pass("V6", `沒有敏感欄位；比對了 ${secrets.length} 個來源機密字串`);
    out.counts = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length]));
    out.counts.markers = all.issues.reduce((n, i) => n + (i.markers || []).length, 0);
    out.counts.multiline = multi;
    out.counts.importedVersions = all.versions.filter(v => v.imported === true).length;
    out.key = JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.map(d => [d.path, contentKey(d)]).sort()])));
    return out;
  }

  /* ---------- 逐部門的筆數報告（upgrade-plan.md 第 6.5 節「看報告」） ----------
     左邊直接從資料檔數（不經過對照程式），右邊是 Firestore 裡這個部門的文件；任何一列不同或 V1～V4、V6 任一項失敗＝不通過。
     只在匯入後、開放編輯前看（開始編輯後卡片、時間標記的數量本來就會變）。版本只數遷移產生的第 1 版。 */
  const REPORT_ROWS = [["cards", "卡片（即時回報）"], ["versions", "版本（遷移產生的第 1 版）"], ["issues", "母議題"], ["weeks", "週報"],
    ["labels", "標籤"], ["events", "時間標記"], ["markers", "議題註記"], ["legacyIdentities", "舊身分"], ["multiline", "多行說明（逐字還原）"]];
  function sourceCounts(state) {
    const ev = state.events || [], is = state.issues || [];
    return { cards: ev.length, versions: ev.length, issues: is.length, weeks: (state.weeks || []).length, labels: (state.labels || []).length,
      events: ev.reduce((n, e) => n + (e.times || []).length, 0), markers: is.reduce((n, i) => n + (i.markers || []).length, 0),
      legacyIdentities: (state.members || []).length, multiline: ev.filter(e => String(e.desc || "").includes("\n")).length };
  }
  async function deptReport(io, src, dept) {
    const f = src.files.find(x => x.dept === dept);
    if (!f) throw new Error(`來源裡沒有 ${dept}`);
    const one = { ...src, only: dept, files: [f] }, pl = plan(one, { batch: "report", uid: "report" });
    const tooBig = tooBigLines(pl.reports);   /* 03 審查（P2-2）：超過規則上限的卡片先列出來（有的話不通過） */
    const v = await verify(io, one, pl, { dept });
    const a = sourceCounts(f.state), b = { ...v.counts, versions: v.counts.importedVersions };
    const rows = REPORT_ROWS.map(([k, label]) => ({ key: k, label, source: a[k], firestore: b[k] || 0, ok: a[k] === (b[k] || 0) }));
    return { dept, path: f.path, sha256: f.sha256, commit: src.commit, tooBig, rows, verify: v.items, pending: v.pending, ok: !tooBig.length && v.ok && rows.every(r => r.ok) };
  }

  const api = { SENSITIVE_KEYS, PROTECTED, ORDER, COST, IGNORE, contentKey, plan, runImport, setMigrationStatus, verify, REPORT_ROWS, sourceCounts, deptReport, tooBigLines };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MigrateCore = api;
})(typeof window !== "undefined" ? window : globalThis);
