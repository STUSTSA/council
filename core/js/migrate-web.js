/* 核心｜網頁匯入頁的資料操作（02D D-a；正式切換用，取代命令列）。ES module：總管理員在「會長室管理 → 匯入」按下匯入時才由 account.js 載入。
   - 讀這個部門的資料檔（只讀，不用權杖）：操作的人先輸入操作手冊第 B 步抄下來的 commit 與檔案 SHA-256（04）；網站在 github.io 時讀 dept/config.js 設定的 repo
     那個 commit 的資料檔，SHA-256 不符、或分支最新的同一個檔已經跟它不同，就不寫入；本機開發（不是 github.io）讀網站上的同一個檔案、只核對 SHA-256。
   - 核對過之後先給畫面一份摘要（會產生幾份文件、舊身分名單、超過上限的項目、整理掉的日期欄位），確認後才寫入；寫入的就是核對過的那一份（不重讀）。
   - 照 migrate-core.js（跟命令列同一份）寫進這個網站設定的 Firebase 專案（dept/config.js 的 firebase：2026-11-20 起是正式專案），
     走正式規則的匯入分支（importing()：只有總管理員、批次是 running）；不是總管理員一定被規則拒絕。
   - 重跑：新的批次號；內容相同的文件跳過、少的補上、被改過的列為衝突不覆寫，所以重跑結果不變。
   - 匯出全部資料（02D D-c）：總管理員讀得到的全部集合＋批次資訊，並把每個部門轉成 schemaVersion 13 的部門檔格式（migration.md 第 8 節）。 */
import { fb, authReady } from "./fb-app.js";
import { doc, getDoc, getDocs, collection, collectionGroup, writeBatch, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const C = () => window.MigrateCore, M = () => window.StoreMap;
const plain = v => M().plain(v);
function typed(v) {
  if (Array.isArray(v)) return v.map(typed);
  if (v && typeof v === "object") {
    if (v.__now) return serverTimestamp();
    if (typeof v.__ts === "number") return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typed(x)]));
  }
  return v;
}
function io(db) {
  const row = s => ({ id: s.id, path: s.ref.path, ...plain(s.data()) });
  return {
    get: async p => { const s = await getDoc(doc(db, p)); return s.exists() ? plain(s.data()) : null; },
    list: async c => (await getDocs(collection(db, c))).docs.map(row),
    listGroup: async c => (await getDocs(collectionGroup(db, c))).docs.map(row),
    commit: async writes => { const b = writeBatch(db); for (const w of writes) b.set(doc(db, w.path), typed(w.data), w.merge ? { merge: true } : {}); await b.commit(); },
  };
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

/* 讀來源並核對（04）：expect＝{commit, sha256}，操作手冊第 B 步抄下來的來源版本。任何一項不符就丟 mismatch，不寫入任何文件。
   gh＝{owner, repo, branch}：
     1. 讀「expect.commit 那個版本」的資料檔，SHA-256 要等於 expect.sha256（匯入的就是這一份內容）
     2. 再讀分支最新 commit 的同一個檔：內容要跟第 1 步相同（不同＝那個 commit 之後資料檔又被改過）
   沒有 owner／repo（本機開發）：讀網站上的檔案，SHA-256 要等於 expect.sha256（沒有 commit 可核對）。
   depts＝完整的部門清單（含測試部門，順序＝departments 的 order）。讀完先整理日期格式（migrate-core.js 的 tidySource） */
const HEX40 = /^[0-9a-f]{40}$/, HEX64 = /^[0-9a-f]{64}$/;
const mismatch = (what, o) => Object.assign(new Error("來源跟預期的不同"), { code: "mismatch", what, ...o });
async function loadSource(gh, depts, dept, expect) {
  const d = depts.find(x => x.id === dept);
  if (!d) throw Object.assign(new Error("沒有這個部門"), { code: "dept" });
  const want = { commit: String((expect && expect.commit) || "").trim().toLowerCase(), sha256: String((expect && expect.sha256) || "").trim().toLowerCase() };
  const remote = !!(gh && gh.owner && gh.repo);
  if (!HEX64.test(want.sha256) || (remote && !HEX40.test(want.commit))) throw mismatch("expect", {});
  const sha = async buf => hex(await crypto.subtle.digest("SHA-256", buf));
  let raw, commit = "", head = "";
  try {
    if (remote) {
      const base = `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}`;
      const file = async ref => { const r = await fetch(`${base}/contents/${d.path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
        if (r.status === 404) return null; if (!r.ok) throw new Error("file " + r.status); return r.arrayBuffer(); };
      commit = want.commit;
      raw = await file(commit);
      if (!raw) throw mismatch("commit", { commit });
      const c = await fetch(`${base}/commits/${encodeURIComponent(gh.branch || "main")}`, { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" });
      if (!c.ok) throw new Error("commit " + c.status);
      head = (await c.text()).trim();
      if (!HEX40.test(head)) throw new Error("commit");
      if (head !== commit) { const now = await file(head); if (!now || await sha(now) !== await sha(raw)) throw mismatch("changed", { commit, head }); }
    } else {
      const r = await fetch(d.path, { cache: "no-store" });
      if (!r.ok) throw new Error("file " + r.status);
      raw = await r.arrayBuffer();
    }
  } catch (e) { if (e && e.code === "mismatch") throw e; console.error(e); throw Object.assign(new Error("讀不到資料檔"), { code: "source", cause: e }); }
  const sha256 = await sha(raw);
  if (sha256 !== want.sha256) throw mismatch("sha256", { commit, sha256 });
  let state;
  try { state = JSON.parse(new TextDecoder().decode(raw)); } catch (_) { throw Object.assign(new Error("資料檔不是 JSON"), { code: "source" }); }
  return C().tidySource({ depts: depts.map(x => ({ id: x.id, name: x.name, path: x.path, test: !!x.test })), commit, head, dir: null, only: dept,
    files: [{ dept, path: d.path, sha256, state }] });
}

/* 匯入前的確認資料（04，不寫入）：核對過的來源＋會產生幾份文件、舊身分名單、超過上限的項目、整理掉的欄位。
   回傳 {src, repo, commit, head, sha256, path, preview}；畫面確認後把 src 原樣交給 importDept（不重讀，匯入的就是核對過的那一份） */
async function prepare(cfg, gh, depts, dept, expect) {
  await authReady(cfg);
  const f = fb(cfg), uid = f.auth.currentUser && f.auth.currentUser.uid;
  if (!uid) throw Object.assign(new Error("未登入"), { code: "permission-denied" });
  const src = await loadSource(gh, depts, dept, expect);
  return { src, repo: gh && gh.owner ? `${gh.owner}/${gh.repo}@${gh.branch || "main"}` : "", commit: src.commit, head: src.head, sha256: src.files[0].sha256, path: src.files[0].path,
    preview: C().preview(src, uid) };
}

/* 匯入一個部門＋筆數報告。src＝prepare 回傳的那一份。onStep(文字)：進度。回傳 {batch, src, result, report}；失敗丟出帶 code 的錯誤（permission-denied…） */
async function importDept(cfg, pre, dept, onStep = () => {}) {
  await authReady(cfg);
  const f = fb(cfg), uid = f.auth.currentUser && f.auth.currentUser.uid;
  if (!uid) throw Object.assign(new Error("未登入"), { code: "permission-denied" });
  const src = pre && pre.src;
  if (!src || src.only !== dept || !src.files || src.files.length !== 1) throw Object.assign(new Error("沒有核對過的來源"), { code: "mismatch", what: "expect" });
  const X = io(f.db), batch = `web-${dept}-${Date.now()}`;
  onStep("write");
  let result, report;
  try {
    result = await C().runImport(X, src, { batch, uid, log: (m, i, n) => onStep("write", i, n) });
    onStep("check");
    report = await C().deptReport(X, src, dept);
  } catch (e) {
    /* 中途失敗：批次已建立的話改成 failed（不留在 running），再把錯誤丟出去；已寫入的內容按「再試一次」時相同的會跳過（02D 審查 P2-1） */
    try { const m = await X.get(`migrations/${batch}`); if (m && m.status === "running") await C().setMigrationStatus(X, batch, uid, "failed", { error: String(e && (e.code || e.message) || "error").slice(0, 300) }); } catch (_) { /* 狀態改不了：留在 running */ }
    throw e;
  }
  const ok = report.ok && !result.conflicts.length;
  await C().setMigrationStatus(X, batch, uid, ok ? "done" : "failed",
    { written: result.written, skipped: result.skipped, conflicts: result.conflicts, verify: report.verify, rows: report.rows });
  return { batch, repo: pre.repo, commit: src.commit, sha256: src.files[0].sha256, path: src.files[0].path, result, report, ok };
}

/* ---------- 匯出全部資料（02D D-c，migration.md 第 8 節） ----------
   總管理員讀得到的每個集合（含子集合 versions）：文件陣列 {id, path, data}，時間值是 {__ts: 毫秒}；讀不到的集合列在 unreadable。
   另外把每個部門轉成 schemaVersion 13 的部門檔格式（跟看板「匯出備份」同一個 toState；03 之前）。 */
const ALL_COLS = ["departments", "org", "deptSettings", "cards", "issues", "weeks", "labels", "events", "legacyIdentities",
  "users", "profiles", "roles", "roleRequests", "invitations", "auditLogs", "migrations", "grants",
  "calendars", "openWindows", "slots", "bookings", "busyBlocks", "bookingQuota", "meetingMinutes", "attendanceMembers", "attendanceSessions", "attendanceRecords"];
async function exportAll(cfg, depts) {
  await authReady(cfg);
  const f = fb(cfg), uid = f.auth.currentUser && f.auth.currentUser.uid;
  if (!uid) throw Object.assign(new Error("未登入"), { code: "permission-denied" });
  const collections = {}, unreadable = [];
  const row = s => ({ id: s.id, path: s.ref.path, data: plain(s.data()) });
  for (const c of [...ALL_COLS, "versions"]) {
    try { collections[c] = (await getDocs(c === "versions" ? collectionGroup(f.db, c) : collection(f.db, c))).docs.map(row); }
    catch (e) { if (e && e.code === "permission-denied") unreadable.push(c); else throw e; }
  }
  /* 部門檔格式：只用 open／done 的卡片（跟網頁讀取、看板匯出相同） */
  const byDept = (c, d) => (collections[c] || []).filter(x => x.data.deptId === d).map(x => ({ id: x.id, ...x.data }));
  const one = (c, id) => { const x = (collections[c] || []).find(y => y.id === id); return x ? { id: x.id, ...x.data } : null; };
  const boards = {};
  for (const d of depts) {
    const s = M().toState(d.id, { settings: one("deptSettings", d.id), org: one("org", "config"), grant: d.id === "president" ? one("grants", "meetingEdit") : null,
      cards: byDept("cards", d.id).filter(x => x.state === "open" || x.state === "done"), issues: byDept("issues", d.id), weeks: byDept("weeks", d.id),
      labels: byDept("labels", d.id), events: byDept("events", d.id), legacy: byDept("legacyIdentities", d.id) });
    s.savedAt = M().fmtTaipei(Date.now(), false);
    boards[d.id] = s;
  }
  return { kind: "stustsa-board-export", version: 1, projectId: cfg.projectId, exportedAt: new Date().toISOString(), exportedBy: uid,
    batches: (collections.migrations || []).map(x => ({ id: x.id, status: x.data.status, sourceCommit: x.data.sourceCommit, fileHashes: x.data.fileHashes,
      startedAt: x.data.startedAt, finishedAt: x.data.finishedAt || null })),
    unreadable, counts: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length])), collections, boards };
}

window.BoardMigrate = { prepare, importDept, exportAll };
dispatchEvent(new Event("board-migrate-ready"));
