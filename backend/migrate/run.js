// 遷移程式（01B）：只讀 repo 根目錄的 data*.json 與 dept/config.js，永遠不寫它們。
// 寫入對象只有呼叫端給的 Firestore（測試與演練＝本機模擬器，經過正式規則，以總管理員身分走 importing() 分支）。
// 欄位對照在 core/js/store-map.js（網頁讀回來也用同一份）。
import { readFileSync, realpathSync, lstatSync, readlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameBoard } from './compare.js';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAP = require(path.join(ROOT, 'core/js/store-map.js'));
// 階段 00 第 1.3 節的預期筆數（只拿來列差異；驗收以來源實際筆數為準）
export const EXPECTED = { cards: 50, versions: 50, issues: 4, weeks: 11, labels: 1, events: 16, markers: 11, legacyIdentities: 11, departments: 10, deptSettings: 10, multiline: 20 };

// 部門清單：直接執行 dept/config.js（不改它），取出 BOARD_DEPTS
export function loadDepts() {
  const code = readFileSync(path.join(ROOT, 'dept/config.js'), 'utf8') + '\n;this.__D = BOARD_DEPTS;';
  const ctx = { window: {}, location: { search: '' }, URLSearchParams };
  vm.runInNewContext(code, ctx);
  return Array.from(ctx.__D, d => ({ id: d.id, name: d.name, path: d.path, test: !!d.test }));   // 換成這個程式自己的陣列（vm 的陣列原型不同，比對會出錯）
}

// 讀來源：預設是目前工作目錄的檔案；給 commit 時用 git show 讀那個版本；給 dir 時讀那個資料夾裡的同名檔案（演練用：先把資料檔複製到暫存資料夾，只讀複本）。都是唯讀。
// dept：只讀這一個部門（02D 逐部門切換）；部門清單仍是完整的（departments 的 order 照全部的順序）
export function loadSources({ commit, dir, dept } = {}) {
  if (commit && dir) throw new Error('--commit 與 --dir 只能擇一');
  const depts = loadDepts();
  if (dept && !depts.some(d => d.id === dept)) throw new Error(`沒有 ${dept} 這個部門（${depts.map(d => d.id).join('、')}）`);
  const head = commit || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
  const files = depts.filter(d => !dept || d.id === dept).map(d => {
    const raw = commit ? execFileSync('git', ['show', `${commit}:${d.path}`], { cwd: ROOT }) : readFileSync(path.join(dir ? path.resolve(dir) : ROOT, d.path));
    const state = JSON.parse(raw.toString('utf8'));
    return { dept: d.id, path: d.path, sha256: createHash('sha256').update(raw).digest('hex'), state };
  });
  return { depts, commit: head, dir: dir ? path.resolve(dir) : null, only: dept || null, files };
}

// 02D D-a：匯入、批次狀態、驗證、筆數報告的邏輯搬到 core/js/migrate-core.js（網頁匯入頁共用同一份）；這裡只把 compat Firestore 包成它要的 io。
export const CORE = require(path.join(ROOT, 'core/js/migrate-core.js'));
export const plan = CORE.plan;

// ---------- 寫入 ----------
export function toFirestore(v, FV, TS) {
  if (Array.isArray(v)) return v.map(x => toFirestore(x, FV, TS));
  if (v && typeof v === 'object') {
    if (v.__now) return FV.serverTimestamp();
    if (typeof v.__ts === 'number') return TS.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFirestore(x, FV, TS)]));
  }
  return v;
}
export const fromFirestore = MAP.plain;
// 比對內容（不看寫入者、時間戳記、批次號）；用來判斷重跑時要不要寫
export const contentHash = data => createHash('sha256').update(CORE.contentKey(data)).digest('hex');
// db：compat Firestore（以總管理員身分登入）；FV／TS：同一個 SDK 的 FieldValue／Timestamp（讀取用不到時可以不給）
export function nodeIO(db, FV, TS) {
  const row = s => ({ id: s.id, path: s.ref.path, ...fromFirestore(s.data()) });
  return {
    get: async p => { const s = await db.doc(p).get(); return s.exists ? fromFirestore(s.data()) : null; },
    list: async c => (await db.collection(c).get()).docs.map(row),
    listGroup: async c => (await db.collectionGroup(c).get()).docs.map(row),
    commit: async writes => { const b = db.batch(); for (const w of writes) b.set(db.doc(w.path), toFirestore(w.data, FV, TS), w.merge ? { merge: true } : undefined); await b.commit(); },
  };
}
export const runImport = (db, FV, TS, src, opt) => CORE.runImport(nodeIO(db, FV, TS), src, opt);

// 批次狀態轉換（規則：running → done／failed／rollingBack；failed → rollingBack；rollingBack → rolledBack），每次都有稽核紀錄
export const setMigrationStatus = (db, FV, batch, uid, status, summary = {}) => CORE.setMigrationStatus(nodeIO(db, FV), batch, uid, status, summary);
export const finishImport = (db, FV, batch, uid, status, summary) => setMigrationStatus(db, FV, batch, uid, status, summary);

// 遷移失敗回復（R1）：只刪這個批次匯入、而且匯入後沒被改過的資料。
// - 卡片：version == 1 才刪，連同遷移產生的第 1 版同批刪（規則只在批次是 rollingBack 時允許刪這種版本）
// - 時間事件、議題：rev == 1；週報、標籤：updatedBy 是匯入的人
// - 有稽核鏈的文件（舊身分、部門設定、授權）與部門、學年設定不刪：重新匯入時內容相同就跳過，不會重複
// 被改過的一律保留並列在報告裡。重新匯入用新的批次號；文件 ID 是決定性的，所以不會產生重複資料。
export async function rollbackImport(db, FV, batch, uid, { log = () => {} } = {}) {
  const m = (await db.doc(`migrations/${batch}`).get()).data();
  if (!m || !['running', 'failed'].includes(m.status)) throw new Error(`批次 ${batch} 的狀態是 ${m && m.status}，只有 running／failed 能回復`);
  await setMigrationStatus(db, FV, batch, uid, 'rollingBack');
  const deleted = {}, kept = [];
  const of = async c => (await db.collection(c).where('importBatch', '==', batch).get()).docs;
  for (const c of await of('cards')) {
    if (c.data().version !== 1) { kept.push(c.ref.path); continue; }
    const b = db.batch(); b.delete(c.ref); b.delete(db.doc(c.ref.path + '/versions/1')); await b.commit();
    deleted.cards = (deleted.cards || 0) + 1;
  }
  for (const [col, untouched] of [['events', d => d.rev === 1], ['issues', d => d.rev === 1], ['weeks', d => d.updatedBy === m.startedBy], ['labels', d => d.updatedBy === m.startedBy]]) {
    for (const x of await of(col)) {
      if (!untouched(x.data())) { kept.push(x.ref.path); continue; }
      await x.ref.delete(); deleted[col] = (deleted[col] || 0) + 1;
    }
  }
  await setMigrationStatus(db, FV, batch, uid, 'rolledBack', { deleted, kept });
  log(`回復完成：刪除 ${JSON.stringify(deleted)}，保留（匯入後被改過）${kept.length} 筆`);
  return { deleted, kept };
}

// ---------- 驗證 V1～V6（邏輯在 migrate-core.js；這裡加上與預期筆數的差異、內容雜湊） ----------
export async function verify(db, src, p, opt = {}) {
  const out = await CORE.verify(nodeIO(db), src, p, opt);
  const dept = opt.dept === undefined ? src.only : opt.dept;
  out.expectedDiff = dept ? [] : Object.entries(EXPECTED).filter(([k, v]) => out.counts[k] !== v).map(([k, v]) => `${k}: 預期 ${v}，實際 ${out.counts[k]}`);
  out.hash = createHash('sha256').update(out.key).digest('hex');
  delete out.key;
  return out;
}

// ---------- 02D：逐部門的筆數報告（upgrade-plan.md 第 6.5 節「看報告」） ----------
// 左邊直接從資料檔數（不經過對照程式），右邊是 Firestore 裡這個部門的文件；任何一列不同或 V1～V6 任一項失敗＝不通過。
// 只在匯入後、開放編輯前看（開始編輯後卡片、時間標記的數量本來就會變）。版本只數遷移產生的第 1 版。
export const REPORT_ROWS = CORE.REPORT_ROWS;
export const sourceCounts = CORE.sourceCounts;
export const deptReport = (db, src, dept) => CORE.deptReport(nodeIO(db), src, dept);
const cols = t => [...String(t)].reduce((n, c) => n + (c.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
const padTo = (t, n) => t + ' '.repeat(Math.max(0, n - cols(t)));
export function formatReport(r) {
  const w = Math.max(...r.rows.map(x => cols(x.label))) + 2;
  return [`部門 ${r.dept}（${r.path}，SHA-256 ${r.sha256}）`, `${padTo('項目', w)}資料檔  Firestore  結果`,
    ...r.rows.map(x => `${padTo(x.label, w)}${String(x.source).padStart(6)}  ${String(x.firestore).padStart(9)}  ${x.ok ? '相同' : '不同'}`),
    ...r.verify.map(i => `${i.ok ? '通過' : '失敗'} ${i.id} ${i.msg}`),
    r.ok ? '結果：通過（每一列相同、V1～V6 都通過）' : '結果：不通過（看上面標「不同」或「失敗」的列）'].join('\n');
}

// ---------- 02D：回復用的匯出（upgrade-plan.md 第 6.6 節第 2 列） ----------
// 從 Firestore 讀一個部門，轉回 schemaVersion 13 的部門資料（跟網頁 firestore 模式讀取同一組查詢、同一個 store-map.js 的 toState），
// 看板的「匯入備份」可以直接讀。只在 GitHub 模式有的欄位（雲端設定、權杖、密碼、會議紀錄）不在裡面：看板匯入時沿用原本的值。
export async function exportDept(db, dept) {
  const one = async p => { const s = await db.doc(p).get(); return s.exists ? { id: s.id, ...fromFirestore(s.data()) } : null; };
  const many = async q => (await q.get()).docs.map(s => ({ id: s.id, ...fromFirestore(s.data()) }));
  const by = c => db.collection(c).where('deptId', '==', dept);
  const [settings, org, grant, cards, issues, weeks, labels, events, legacy] = await Promise.all([
    one(`deptSettings/${dept}`), one('org/config'), dept === 'president' ? one('grants/meetingEdit') : null,
    many(by('cards').where('state', 'in', ['open', 'done'])), many(by('issues')), many(by('weeks')), many(by('labels')), many(by('events')), many(by('legacyIdentities'))]);
  const s = MAP.toState(dept, { settings, org, grant, cards, issues, weeks, labels, events, legacy });
  s.savedAt = MAP.fmtTaipei(Date.now(), false);
  return s;
}

// 匯出檔不能寫到 repo 裡的正式資料檔或 archive/（CLAUDE.md 第 1 條）。02D 審查：先解開符號連結（檔案本身、或它所在的資料夾）再比對，
// 大小寫不分（Windows、macOS 預設不分大小寫）。回傳擋下的相對位置，可以寫就回傳 null。root 給測試用（預設＝repo 根目錄）
export function blockedOut(out, root = ROOT) {
  const real = (p, n = 0) => {
    if (n > 40) return p;
    try { return realpathSync(p); } catch (_) { /* 還不存在：看是不是指向別處的連結，否則解開上一層資料夾 */ }
    try { if (lstatSync(p).isSymbolicLink()) return real(path.resolve(path.dirname(p), readlinkSync(p)), n + 1); } catch (_) { /* 不存在 */ }
    const up = path.dirname(p);
    return up === p ? p : path.join(real(up, n + 1), path.basename(p));
  };
  const rel = path.relative(real(root), real(path.resolve(out)));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return /^data[^/\\]*\.json$/i.test(rel) || /^archive([/\\]|$)/i.test(rel) ? rel : null;
}

// 往返檢查：每個部門 Firestore → 匯出 → 跟原始資料檔做語意比對（不比的欄位見 compare.js 的 IGNORED）。回傳每個部門不同的位置
export async function roundTrip(db, src) {
  const out = [];
  for (const f of src.files) out.push({ dept: f.dept, path: f.path, diffs: sameBoard(await exportDept(db, f.dept), f.state, f.dept) });
  return out;
}
