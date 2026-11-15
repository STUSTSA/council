// 遷移演練（模擬器）：V1～V7、重跑、回復、讀回來的資料等於原始資料（migration.md 第 6、7 節）；02D 逐部門匯入、筆數報告、匯出、往返、命令列
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, assertFails, assertSucceeds, FV, TS } from './helpers.js';
import { loadSources, runImport, finishImport, rollbackImport, setMigrationStatus, verify, fromFirestore, MAP } from '../migrate/run.js';
import { editCard, readDoc } from './helpers.js';
import { canon } from '../migrate/compare.js';
import { deptReport, exportDept, roundTrip, ROOT } from '../migrate/run.js';
import { mkdtempSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let t, src, first, v1;
const SU = 'mig-super', B = 'test-batch-1';
const sdb = () => google(t, SU);
before(async () => {
  t = await env();
  await t.clearFirestore();
  await seedRole(t, SU, { super: true });
  src = loadSources();
  first = await runImport(sdb(), FV, TS, src, { batch: B, uid: SU });
  v1 = await verify(sdb(), src, first.plan);
});
after(async () => { await t.cleanup(); });

describe('遷移', () => {
  it('V1～V4、V6：筆數、多行還原、連結、時間、敏感欄位', () => {
    for (const i of v1.items) assert.ok(i.ok, `${i.id}：${i.msg}`);
    console.log('遷移驗證：', v1.items.map(i => `${i.id} ${i.msg}`).join('｜'));
    console.log('實際筆數：', JSON.stringify(v1.counts), '與預期差異：', v1.expectedDiff.length ? v1.expectedDiff.join('；') : '無');
    assert.equal(first.conflicts.length, 0);
    // 分批：每批的規則讀取估算 ≤ 18（模擬器不執行整批 20 次上限，見 verification.md）
    assert.ok(first.batches >= 10);
  });
  it('V5 重跑一次：不寫入任何文件、文件數與內容雜湊相同', async () => {
    const again = await runImport(sdb(), FV, TS, src, { batch: B, uid: SU });
    assert.equal(Object.keys(again.written).length, 0, '重跑不應寫入：' + JSON.stringify(again.written));
    assert.equal(again.conflicts.length, 0, again.conflicts.join(','));
    const v2 = await verify(sdb(), src, again.plan);
    assert.equal(v2.hash, v1.hash);
    assert.deepEqual(v2.counts, v1.counts);
  });
  it('V7 讀取分級（02A）：未登入只看得到部門與公開活動；任何登入帳號讀得到看板、讀不到 L3～L4', async () => {
    const card = 'cards/rights__' + src.files[0].state.events[0].id;
    await assertSucceeds(anon(t).collection('departments').get());
    await assertSucceeds(anon(t).doc('org/config').get());
    await assertFails(anon(t).doc(card).get());
    await assertFails(anon(t).collection('deptSettings').get());
    await assertFails(anon(t).collection('events').get());
    await assertSucceeds(anon(t).collection('events').where('visibility', '==', 'public').get());
    const v = google(t, 'nobody');                                                  // 沒有 roles 文件的一般登入者
    await assertSucceeds(v.doc(card).get());
    await assertSucceeds(v.collection('cards').where('deptId', '==', 'rights').where('state', 'in', ['open', 'done']).get());
    await assertSucceeds(v.collection('legacyIdentities').where('deptId', '==', 'rights').get());
    for (const p of ['roles/' + SU, 'migrations/' + B, 'auditLogs/migrations_' + B + '_1', 'meetingMinutes/x', 'users/' + SU]) await assertFails(v.doc(p).get());
    await assertFails(v.collection('auditLogs').get());
  });
  it('讀回來（新 → 舊）等於原始資料：網頁 Firestore 模式看到的內容跟 GitHub 模式相同', async () => {
    const db = sdb();
    const all = async c => (await db.collection(c).get()).docs.map(s => ({ id: s.id, ...fromFirestore(s.data()) }));
    const [settings, cards, issues, weeks, labels, events, legacy, org, grants] = await Promise.all(
      ['deptSettings', 'cards', 'issues', 'weeks', 'labels', 'events', 'legacyIdentities', 'org', 'grants'].map(all));
    for (const f of src.files) {
      const d = f.dept, by = a => a.filter(x => x.deptId === d);
      const back = MAP.toState(d, { settings: settings.find(s => s.id === d), cards: by(cards), issues: by(issues), weeks: by(weeks),
        labels: by(labels), events: by(events), legacy: by(legacy), org: d === 'secretariat' ? org[0] : null, grant: d === 'president' ? grants[0] : null });
      assert.deepEqual(canon(back, d), canon(f.state, d), `${f.path} 讀回來不同`);
    }
  });
  it('非總管理員、或批次已結束：不能匯入', async () => {
    await seedRole(t, 'adm', { depts: { rights: 'admin' } });
    await assertFails(runImport(google(t, 'adm'), FV, TS, src, { batch: 'b-adm', uid: 'adm' }));
    await finishImport(sdb(), FV, B, SU, 'done', { counts: {} });
    await assertFails((async () => {
      await seed(t, d => d.doc('cards/rights__zzz').delete());
      const x = sdb(), b = x.batch(), c = { deptId: 'rights', title: 'x', blocks: [], state: 'open', version: 1, report: false, createdAt: null,
        createdBy: 'legacy:import', importBatch: B, updatedAt: FV.serverTimestamp(), updatedBy: SU };
      b.set(x.doc('cards/rights__zzz'), c);
      b.set(x.doc('cards/rights__zzz/versions/1'), { cardId: 'rights__zzz', deptId: 'rights', version: 1, title: 'x', blocks: [], times: [], state: 'open', by: SU, at: FV.serverTimestamp(), imported: true });
      await b.commit();
    })());
  });
});

describe('遷移失敗回復（R1）', () => {
  const R1 = 'rb-batch-1', R2 = 'rb-batch-2';
  let total, edited;
  before(async () => {
    await t.clearFirestore();
    await seedRole(t, SU, { super: true });
    await seedRole(t, 'ed', { depts: { rights: 'editor' } });
    const r = await runImport(sdb(), FV, TS, src, { batch: R1, uid: SU });
    total = r.written.cards;
    edited = 'cards/rights__' + src.files[0].state.events[0].id;
    // 匯入後有人改過一張卡片（版本 2）：回復時必須保留
    const cur = await readDoc(t, edited);
    await editCard(google(t, 'ed'), 'ed', edited.split('/')[1], cur, { title: cur.title + '（已修改）' });
  });
  it('批次不是 rollingBack 時，總管理員一般的卡片硬刪不能連帶刪掉版本歷史', async () => {
    const db = sdb(), p = 'cards/affairs__' + src.files.find(f => f.dept === 'affairs').state.events[0].id;
    const b = db.batch(); b.delete(db.doc(p)); b.delete(db.doc(p + '/versions/1'));
    await assertFails(b.commit());
    await assertFails(db.doc(p + '/versions/1').delete());
  });
  it('已完成（done）的批次不能進入回復', async () => {
    await seed(t, d => d.doc('migrations/done-1').set({ status: 'done', rev: 1, startedBy: SU, startedAt: TS.now(), updatedAt: TS.now(), updatedBy: SU }));
    await assertFails(setMigrationStatus(sdb(), FV, 'done-1', SU, 'rollingBack'));
    await assert.rejects(rollbackImport(sdb(), FV, 'done-1', SU), /只有 running／failed 能回復/);   // 程式也先擋
  });
  it('回復：只刪這個批次、匯入後沒改過的資料；改過的卡片與它的版本全部保留；狀態轉換有稽核', async () => {
    const r = await rollbackImport(sdb(), FV, R1, SU);
    assert.equal(r.deleted.cards, total - 1);
    assert.deepEqual(r.kept, [edited]);
    assert.ok(await readDoc(t, edited + '/versions/1'));
    assert.ok(await readDoc(t, edited + '/versions/2'));
    const m = await readDoc(t, `migrations/${R1}`);
    assert.equal(m.status, 'rolledBack');
    for (const [rev, st] of [[2, 'rollingBack'], [3, 'rolledBack']]) assert.equal((await readDoc(t, `auditLogs/migrations_${R1}_${rev}`)).after.status, st);
    // 回復結束後，保留下來的版本仍然不能刪（含遷移產生的第 1 版）
    const db = sdb(), b = db.batch(); b.delete(db.doc(edited)); b.delete(db.doc(edited + '/versions/1'));
    await assertFails(b.commit());
    await assertFails(db.doc(edited + '/versions/2').delete());
    await assertFails(setMigrationStatus(sdb(), FV, R1, SU, 'running'));       // rolledBack 不能再回到 running
  });
  it('重新匯入（新批次）可以安全重跑：沒有重複資料、沒有版本衝突', async () => {
    const r = await runImport(sdb(), FV, TS, src, { batch: R2, uid: SU });
    assert.equal(r.written.cards, total - 1);
    assert.deepEqual(r.conflicts, [edited]);                                     // 改過的那張不覆寫，列為衝突
    const again = await runImport(sdb(), FV, TS, src, { batch: R2, uid: SU });
    assert.equal(Object.keys(again.written).length, 0);
    const db = sdb();
    assert.equal((await db.collection('cards').get()).size, total);
    const vs = (await db.collectionGroup('versions').get()).docs;
    assert.equal(vs.length, total + 1);                                          // 每張一個第 1 版，改過的那張多一個第 2 版
    assert.equal(new Set(vs.map(v => v.ref.path)).size, vs.length);
    for (const v of vs) if (v.id === '1') assert.equal(v.data().importBatch, v.ref.path === edited + '/versions/1' ? R1 : R2);
  });
  it('模擬器演練優先用「重置＋重新匯入」：清空後再匯入，筆數與驗證結果相同', async () => {
    await t.clearFirestore();
    await seedRole(t, SU, { super: true });
    const r = await runImport(sdb(), FV, TS, src, { batch: 'reset-1', uid: SU });
    const v = await verify(sdb(), src, r.plan);
    for (const i of v.items) assert.ok(i.ok, `${i.id}：${i.msg}`);
    assert.deepEqual(v.counts, v1.counts);
  });
});

describe('02D 逐部門切換：筆數報告、匯出、往返、命令列', () => {
  let dir;
  const one = dept => loadSources({ dir, dept });
  const count = async (c, dept) => (await sdb().collection(c).where('deptId', '==', dept).get()).size;
  before(async () => {
    await t.clearFirestore();
    await seedRole(t, SU, { super: true });
    dir = mkdtempSync(join(tmpdir(), 'mig-'));                                  // 演練只讀複本
    for (const f of src.files) copyFileSync(join(ROOT, f.path), join(dir, f.path));
  });
  it('--dir 讀複本：內容與雜湊跟 repo 的資料檔相同', () => {
    const c = loadSources({ dir });
    assert.deepEqual(c.files.map(f => f.sha256), src.files.map(f => f.sha256));
    assert.throws(() => loadSources({ dir, dept: 'nope' }), /沒有 nope/);
  });
  it('只匯入水果部：只寫水果部（departments 也只有它），報告每一列相同', async () => {
    const s = one('fruit');
    const r = await runImport(sdb(), FV, TS, s, { batch: 'd-fruit', uid: SU });
    assert.deepEqual(Object.keys(r.written).sort(), ['departments', 'deptSettings']);
    const rep = await deptReport(sdb(), s, 'fruit');
    assert.ok(rep.ok, JSON.stringify(rep));
    assert.equal((await sdb().collection('departments').get()).size, 1);
    assert.equal((await sdb().collection('deptSettings').get()).size, 1);
  });
  it('會長室在權益部之前匯入：追蹤的權益部議題列為「指到還沒匯入的部門」，不算失敗', async () => {
    const s = one('president');
    await runImport(sdb(), FV, TS, s, { batch: 'd-pres', uid: SU });
    const rep = await deptReport(sdb(), s, 'president');
    assert.ok(rep.ok, JSON.stringify(rep.verify));
    assert.equal(rep.pending.length, 1);
    assert.match(rep.pending[0], /^follow:president→rights__/);
  });
  it('權益部單獨匯入：報告 42 張卡片、42 個第 1 版、多行 20 張逐字還原；其他部門的文件沒有被動到', async () => {
    const s = one('rights');
    await runImport(sdb(), FV, TS, s, { batch: 'd-rights', uid: SU });
    const rep = await deptReport(sdb(), s, 'rights');
    assert.ok(rep.ok, JSON.stringify(rep));
    const row = k => rep.rows.find(x => x.key === k);
    assert.equal(row('cards').firestore, 42);
    assert.equal(row('versions').firestore, 42);
    assert.equal(row('multiline').firestore, 20);
    assert.equal(await count('cards', 'events'), 0);
    assert.ok((await deptReport(sdb(), one('president'), 'president')).pending.length === 0, '權益部匯入後，會長室的追蹤指得到');
  });
  it('報告抓得到不一致：少一份週報、卡片說明被改過 → 不通過，列出是哪一列', async () => {
    const s = one('rights'), w = s.files[0].state.weeks[0].id, e = s.files[0].state.events[0].id;
    await seed(t, async d => { await d.doc(`weeks/rights__${w}`).delete(); await d.doc(`cards/rights__${e}`).update({ legacyDesc: 'x' }); });
    const rep = await deptReport(sdb(), s, 'rights');
    assert.equal(rep.ok, false);
    assert.deepEqual(rep.rows.filter(x => !x.ok).map(x => x.key), ['weeks']);
    assert.deepEqual(rep.verify.filter(x => !x.ok).map(x => x.id), ['V1', 'V2']);
    // 復原（演練用重跑同一批：少的補上；被改的那張列為衝突）
    await seed(t, d => d.doc(`cards/rights__${e}`).update({ legacyDesc: s.files[0].state.events[0].desc || '' }));
    const again = await runImport(sdb(), FV, TS, s, { batch: 'd-rights', uid: SU });
    assert.equal(again.written.weeks, 1);
    assert.ok((await deptReport(sdb(), s, 'rights')).ok);
  });
  it('匯出（schemaVersion 13）＝原始資料；往返檢查：其餘部門也匯入後，十個部門都相同', async () => {
    const x = await exportDept(sdb(), 'rights');
    assert.equal(x.schemaVersion, 13);
    assert.ok(Array.isArray(x.issues) && !('sync' in x) && !('pwKdf' in x) && !('minutes' in x));
    assert.ok(x.members.every(m => !('kdf' in m) && !('tok' in m)));
    assert.deepEqual(canon(x, 'rights'), canon(src.files[0].state, 'rights'));
    const all = loadSources({ dir });
    await runImport(sdb(), FV, TS, all, { batch: 'd-rest', uid: SU });
    const rt = await roundTrip(sdb(), all);
    assert.equal(rt.length, 10);
    for (const r of rt) assert.deepEqual(r.diffs, [], `${r.path} 往返不同：${r.diffs.join('、')}`);
  });
  it('命令列：--dept 匯入、--report（通過 0／不同 1）、--export、拒絕寫到資料檔位置', () => {
    const cli = (...a) => spawnSync(process.execPath, [join(ROOT, 'backend/migrate/cli.js'), ...a], { cwd: join(ROOT, 'backend'), env: process.env, encoding: 'utf8' });
    let r = cli('--emulator', '--dept=works', `--dir=${dir}`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /結果：通過/);
    r = cli('--emulator', '--dept=works', '--report', `--dir=${dir}`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = join(dir, 'rights-export.json');
    r = cli('--emulator', '--export=rights', `--out=${out}`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(canon(JSON.parse(readFileSync(out, 'utf8')), 'rights'), canon(src.files[0].state, 'rights'));
    for (const bad of ['../data.json', '../data-fruit.json', '../archive/x.json']) {
      r = cli('--emulator', '--export=fruit', `--out=${bad}`);
      assert.equal(r.status, 2, bad);
      assert.match(r.stderr, /不能寫到/);
    }
    assert.ok(!existsSync(join(ROOT, 'archive/x.json')));
    r = cli('--emulator', '--dept=nope', '--report');
    assert.notEqual(r.status, 0);
  });
  it('命令列 --report：Firestore 跟資料檔不同時結束碼 1', async () => {
    const s = one('events'), w = s.files[0].state.weeks[0];
    await seed(t, d => d.doc(`weeks/events__${w.id}`).delete());
    const r = spawnSync(process.execPath, [join(ROOT, 'backend/migrate/cli.js'), '--emulator', '--dept=events', '--report', `--dir=${dir}`], { cwd: join(ROOT, 'backend'), env: process.env, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /週報\s+\d+\s+\d+\s+不同/);
  });

  it('讀回來時（toState）略過 ID 不合格的文件（02D 審查 P0 的第二道；規則 safeId 已擋下建立）', () => {
    const bad = 'rights__x" onmouseover="alert(1)';
    const card = (id, extra = {}) => ({ id, deptId: 'rights', title: id, blocks: [{ id: 'b', text: 'x' }], timeIds: [], state: 'open', order: 0, ...extra });
    const s = MAP.toState('rights', {
      settings: { title: 't' }, cards: [card('rights__ok1'), card(bad)], issues: [{ id: bad, title: 'i' }, { id: 'rights__i1', title: 'ok' }],
      weeks: [{ id: 'rights__<w>', date: '2026-11-15', text: 'w' }], labels: [{ id: 'rights__l 1', kind: '人', name: 'x' }],
      events: [{ id: 'rights__t"1', cardId: 'rights__ok1', label: 'x', startRaw: '2026-11-15', endRaw: '', start: { __ts: 0 }, end: { __ts: 0 }, allDay: true }],
      legacy: [{ id: 'rights__m"1', deptId: 'rights', name: 'n', oldRole: 'member' }] });
    assert.deepEqual(s.events.map(e => e.id), ['ok1']);
    assert.deepEqual(s.events[0].times, []);
    assert.deepEqual(s.issues.map(i => i.id), ['i1']);
    assert.deepEqual([s.weeks.length, s.labels.length, s.members.length], [0, 0, 0]);
  });
});
