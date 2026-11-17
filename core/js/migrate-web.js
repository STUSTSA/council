/* 核心｜網頁匯入頁的資料操作（02D D-a；正式切換用，取代命令列）。ES module：總管理員在「會長室管理 → 匯入」按下匯入時才由 account.js 載入。
   - 讀這個部門的資料檔（只讀）：網站在 github.io 時用 GitHub 讀 dept/config.js 設定的分支最新的 commit（記下 commit SHA），不用權杖；
     本機開發（不是 github.io）讀網站上的同一個檔案。算 SHA-256，跟操作手冊第 B 步抄下來的比對。
   - 照 migrate-core.js（跟命令列同一份）寫進這個網站設定的 Firebase 專案（dept/config.js 的 firebase：開發專案或正式專案），
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

/* 讀來源：gh＝{owner, repo, branch}（沒有 owner／repo＝讀網站上的檔案）；depts＝完整的部門清單（含測試部門，順序＝departments 的 order） */
async function loadSource(gh, depts, dept) {
  const d = depts.find(x => x.id === dept);
  if (!d) throw Object.assign(new Error("沒有這個部門"), { code: "dept" });
  let raw, commit = "";
  try {
    if (gh && gh.owner && gh.repo) {
      const base = `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}`;
      const c = await fetch(`${base}/commits/${encodeURIComponent(gh.branch || "main")}`, { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" });
      if (!c.ok) throw new Error("commit " + c.status);
      commit = (await c.text()).trim();
      if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("commit");
      const r = await fetch(`${base}/contents/${d.path.split("/").map(encodeURIComponent).join("/")}?ref=${commit}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
      if (!r.ok) throw new Error("file " + r.status);
      raw = await r.arrayBuffer();
    } else {
      const r = await fetch(d.path, { cache: "no-store" });
      if (!r.ok) throw new Error("file " + r.status);
      raw = await r.arrayBuffer();
    }
  } catch (e) { console.error(e); throw Object.assign(new Error("讀不到資料檔"), { code: "source", cause: e }); }
  const sha256 = hex(await crypto.subtle.digest("SHA-256", raw));
  let state;
  try { state = JSON.parse(new TextDecoder().decode(raw)); } catch (_) { throw Object.assign(new Error("資料檔不是 JSON"), { code: "source" }); }
  return { depts: depts.map(x => ({ id: x.id, name: x.name, path: x.path, test: !!x.test })), commit, dir: null, only: dept,
    files: [{ dept, path: d.path, sha256, state }] };
}

/* 匯入一個部門＋筆數報告。onStep(文字)：進度。回傳 {batch, src, result, report}；失敗丟出帶 code 的錯誤（permission-denied、source…） */
async function importDept(cfg, gh, depts, dept, onStep = () => {}) {
  await authReady(cfg);
  const f = fb(cfg), uid = f.auth.currentUser && f.auth.currentUser.uid;
  if (!uid) throw Object.assign(new Error("未登入"), { code: "permission-denied" });
  onStep("read");
  const src = await loadSource(gh, depts, dept);
  const X = io(f.db), batch = `web-${dept}-${Date.now()}`;
  onStep("write");
  const result = await C().runImport(X, src, { batch, uid, log: (m, i, n) => onStep("write", i, n) });
  onStep("check");
  const report = await C().deptReport(X, src, dept);
  const ok = report.ok && !result.conflicts.length;
  await C().setMigrationStatus(X, batch, uid, ok ? "done" : "failed",
    { written: result.written, skipped: result.skipped, conflicts: result.conflicts, verify: report.verify, rows: report.rows });
  return { batch, commit: src.commit, sha256: src.files[0].sha256, path: src.files[0].path, result, report, ok };
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

window.BoardMigrate = { loadSource, importDept, exportAll };
dispatchEvent(new Event("board-migrate-ready"));
