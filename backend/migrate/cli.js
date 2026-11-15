// 遷移演練指令。只讀資料檔、只連本機模擬器，不碰正式資料（用法見最下面，或 docs/遷移步驟.md）。
// 正式匯入是「總管理員在瀏覽器執行的匯入頁」（migration.md 第 3 節），不在這裡。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadSources, plan, runImport, finishImport, verify, deptReport, formatReport, exportDept, roundTrip, blockedOut } from './run.js';
import { IGNORED } from './compare.js';

const USAGE = `用法（在 backend/ 資料夾）：
  node migrate/cli.js --dry-run [--dir=資料夾] [--commit=SHA]
      只讀資料檔，印出會產生哪些文件（不連任何資料庫）
  以下只連本機模擬器：先在另一個視窗執行 npm run emulators，這個視窗設 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  node migrate/cli.js --emulator [--dept=代號] [--dir=資料夾]
      匯入全部（或一個部門）＋驗證；有 --dept 時印這個部門的筆數報告，不通過時結束碼 1
  node migrate/cli.js --emulator --dept=代號 --report [--dir=資料夾]
      不匯入，只比對資料檔與模擬器裡這個部門的筆數（結束碼 0＝通過、1＝有不同）
  node migrate/cli.js --emulator --export=代號 --out=檔名.json
      把模擬器裡的一個部門匯出成 schemaVersion 13 的 JSON（看板「匯入備份」可以讀）
  node migrate/cli.js --emulator --roundtrip [--dir=資料夾]
      每個部門：匯入 → 匯出 → 跟原始資料檔比對，列出不同的地方
  --dir：讀這個資料夾裡的資料檔複本（演練時先把資料檔複製過去）；不給就讀 repo 裡的資料檔（只讀）`;

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const has = k => args.includes(`--${k}`);
const fail = m => { console.error(m); process.exit(2); };

if (!has('dry-run') && !has('emulator')) { console.log(USAGE); process.exit(has('help') ? 0 : 2); }
const exportId = opt('export');
const src = exportId ? null : loadSources({ commit: opt('commit'), dir: opt('dir'), dept: opt('dept') });
if (src) {
  console.log(`來源 commit ${src.commit}${src.dir ? `（讀 ${src.dir} 裡的複本）` : ''}`);
  src.files.forEach(f => console.log(`  ${f.path.padEnd(22)} ${f.sha256}`));
}

if (has('dry-run')) {
  const p = plan(src, { batch: 'dry-run', uid: 'dry-run' });
  const by = {}; p.docs.forEach(d => by[d.kind] = (by[d.kind] || 0) + 1);
  console.log('會產生的文件：', by);
  p.reports.forEach(r => { if (r.broken.length || r.badTimes.length) console.log(r.dept, '斷掉的連結', r.broken, '無法解析的時間', r.badTimes); });
  process.exit(0);
}

// ---------- 以下都在模擬器 ----------
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) fail('只能在模擬器執行：先執行 npm run emulators，再設 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080（或用 npm run migrate:emulator）');
const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
const { default: firebase } = await import('firebase/compat/app');
await import('firebase/compat/firestore');
const { readFileSync } = await import('node:fs');
const [h, port] = host.split(':');
const t = await initializeTestEnvironment({ projectId: 'demo-stustsa-board', firestore: { host: h, port: +port, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const uid = 'emulator-super';
await t.withSecurityRulesDisabled(async c => {            // 等同主控台建立第一位總管理員（invitations-roles-audit.md 第 7 節）
  await c.firestore().doc(`roles/${uid}`).set({ super: true, depts: {}, rev: 1, lastVia: 'manual', lastRef: 'bootstrap', updatedBy: uid, updatedAt: firebase.firestore.Timestamp.now() });
});
const db = t.authenticatedContext(uid, { email: 'super@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
const done = async code => { await t.cleanup(); process.exit(code); };

if (exportId) {
  const out = opt('out');
  if (!out) fail('要給 --out=檔名.json');
  const abs = path.resolve(out), rel = blockedOut(abs);
  // 匯出檔不能蓋到 repo 裡的正式資料檔或 archive/（CLAUDE.md 第 1 條；解開符號連結、大小寫不分，run.js 的 blockedOut）
  if (rel) fail(`不能寫到 ${rel}：這是正式資料檔的位置，請存到別的資料夾`);
  const s = await exportDept(db, exportId);
  writeFileSync(abs, JSON.stringify(s, null, 1));
  console.log(`已匯出 ${exportId} 到 ${abs}：${s.issues.length} 個議題、${s.events.length} 則即時回報、${s.weeks.length} 份週報、${s.labels.length} 個標籤`);
  console.log('（沒有雲端設定、權杖、密碼、會議紀錄：用看板「匯入備份」寫回時沿用原本的值）');
  await done(0);
}

if (has('report')) {
  if (!src.only) fail('--report 要搭配 --dept=代號');
  const r = await deptReport(db, src, src.only);
  console.log(formatReport(r));
  await done(r.ok ? 0 : 1);
}

if (has('roundtrip')) {
  const batch = 'emu-rt-' + Date.now();
  const r = await runImport(db, FV, TS, src, { batch, uid, log: () => {} });
  const v = await verify(db, src, r.plan);
  await finishImport(db, FV, batch, uid, v.ok ? 'done' : 'failed', { written: r.written, verify: v.items });
  const rt = await roundTrip(db, src);
  console.log('往返比對（不比：' + IGNORED.join('、') + '）');
  rt.forEach(x => console.log(`  ${x.path.padEnd(22)} ${x.diffs.length ? '不同：' + x.diffs.join('、') : '相同'}`));
  const bad = rt.filter(x => x.diffs.length).length;
  console.log(bad ? `結果：${bad} 個部門不同` : `結果：${rt.length} 個部門都相同`);
  await done(bad || !v.ok ? 1 : 0);
}

const batch = `emu-${src.only ? src.only + '-' : ''}${Date.now()}`;
const r = await runImport(db, FV, TS, src, { batch, uid, log: console.log });
const v = await verify(db, src, r.plan);
await finishImport(db, FV, batch, uid, v.ok ? 'done' : 'failed', { written: r.written, skipped: r.skipped, conflicts: r.conflicts, verify: v.items });
console.log('寫入', r.written, '跳過', r.skipped, '衝突', r.conflicts);
if (src.only) {
  const rep = await deptReport(db, src, src.only);
  console.log(formatReport(rep));
  await done(rep.ok && !r.conflicts.length ? 0 : 1);
}
v.items.forEach(i => console.log(i.ok ? '通過' : '失敗', i.id, i.msg));
console.log('與預期筆數的差異：', v.expectedDiff.length ? v.expectedDiff : '無');
await done(v.ok ? 0 : 1);
