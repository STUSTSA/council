// 遷移演練（模擬器）：V1～V7、重跑、回復、讀回來的資料等於原始資料（migration.md 第 6、7 節）；02D 逐部門匯入、筆數報告、匯出、往返、命令列
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, assertFails, assertSucceeds, FV, TS } from './helpers.js';
import { loadSources, runImport, finishImport, rollbackImport, setMigrationStatus, verify, fromFirestore, MAP } from '../migrate/run.js';
import { editCard, readDoc } from './helpers.js';
import { canon } from '../migrate/compare.js';
import { deptReport, formatReport, exportDept, roundTrip, ROOT, blockedOut, plan } from '../migrate/run.js';
import { mkdtempSync, copyFileSync, readFileSync, existsSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
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
  // release-03：筆數改成從資料檔直接數（main 上的權益部資料會一直增加；寫死 42／20 會在資料變多時誤報）。至少要有多行卡片，逐字還原才有測到
  it('權益部單獨匯入：報告的卡片、第 1 版、多行逐字還原＝資料檔直接數的筆數；其他部門的文件沒有被動到', async () => {
    const s = one('rights'), ev = s.files[0].state.events, nCards = ev.length, nMulti = ev.filter(e => String(e.desc || '').includes('\n')).length;
    assert.ok(nCards > 0 && nMulti > 0);
    await runImport(sdb(), FV, TS, s, { batch: 'd-rights', uid: SU });
    const rep = await deptReport(sdb(), s, 'rights');
    assert.ok(rep.ok, JSON.stringify(rep));
    const row = k => rep.rows.find(x => x.key === k);
    assert.equal(row('cards').firestore, nCards);
    assert.equal(row('versions').firestore, nCards);
    assert.equal(row('multiline').firestore, nMulti);
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

  it('03 逐行內容：schemaVersion 14 的檔案照 blocks 搬（行 ID、勾選、時間行與事件的 blockId）；讀回來 desc 攤平、仍是 schemaVersion 13', () => {
    const st = { schemaVersion: 14, title: 't', members: [], labels: [], issues: [], weeks: [], events: [
      { id: 'e1', name: '卡', desc: '純文字\n☐ 核取\n☑ 開會', times: [{ id: 't1', label: '開會', start: '2026-11-20T10:00', end: '', place: '', toIssue: false }],
        blocks: [{ id: 'a', text: '純文字', check: null, timeId: null }, { id: 'b', text: '核取', check: false, timeId: null }, { id: 'c', text: '開會', check: true, timeId: 't1' }] },
      { id: 'e2', name: '舊卡', desc: '第一行\n第二行', times: [] }] };
    const { docs } = MAP.toDocs('rights', st, { batch: 'b', uid: 'u' });
    const card = docs.find(d => d.path === 'cards/rights__e1').data, ev = docs.find(d => d.path === 'events/rights__t1').data;
    assert.deepEqual(card.blocks, { id: ['a', 'b', 'c'], text: ['純文字', '核取', '開會'], check: [null, false, true], time: [null, null, 'rights__t1'] });
    assert.equal(ev.blockId, 'c');
    assert.deepEqual(docs.find(d => d.path === 'cards/rights__e1/versions/1').data.blocks, card.blocks);
    const old = docs.find(d => d.path === 'cards/rights__e2').data;
    assert.deepEqual(old.blocks, { id: ['rights__e2_L0', 'rights__e2_L1'], text: ['第一行', '第二行'], check: [null, null], time: [null, null] });
    // desc 跟 blocks 對不上（舊網站改過 desc）：照 desc 重建，對得上的行沿用 ID 與勾選
    const st2 = JSON.parse(JSON.stringify(st)); st2.events[0].desc = '純文字\n新的一行\n☑ 開會';
    const c2 = MAP.toDocs('rights', st2, { batch: 'b', uid: 'u' }).docs.find(d => d.path === 'cards/rights__e1').data;
    assert.deepEqual([c2.blocks.id[0], c2.blocks.id[2], c2.blocks.check, c2.blocks.time], ['a', 'c', [null, null, true], [null, null, 'rights__t1']]);
    // 讀回來（新網站的 firestore 模式、回復匯出）：schemaVersion 13、desc 攤平（核取變成文字）、blocks 是多出來的欄位
    const back = MAP.toState('rights', { settings: { title: 't' }, cards: [{ id: 'rights__e1', ...card }, { id: 'rights__e2', ...old }],
      events: [{ id: 'rights__t1', ...ev, start: { __ts: 0 }, end: { __ts: 0 } }] });
    assert.equal(back.schemaVersion, 13);
    assert.equal(back.events[0].desc, '純文字\n☐ 核取\n☑ 開會');
    assert.deepEqual(back.events[0].blocks[2], { id: 'c', text: '開會', check: true, timeId: 't1' });
    assert.equal(back.events[1].desc, '第一行\n第二行');
    // 02D 遷移的舊格式（每行一個物件）也讀得到
    const legacy = MAP.toState('rights', { settings: {}, cards: [{ id: 'rights__e3', title: 'x', state: 'open', blocks: [{ id: 'rights__e3_L0', text: '舊', check: null, timeId: null }] }] });
    assert.equal(legacy.events[0].desc, '舊');
    assert.equal(canon(back, 'rights').events[0].desc, '純文字\n☐ 核取\n☑ 開會');
  });
  it('03：schemaVersion 14 可以遷移、15 停下來', () => {
    const f = v => ({ depts: [], only: null, files: [{ dept: 'rights', path: 'x.json', state: { schemaVersion: v, events: [], issues: [], weeks: [], labels: [], members: [] } }] });
    assert.ok(plan(f(14), { batch: 'b', uid: 'u' }).docs.length > 0);
    assert.throws(() => plan(f(15), { batch: 'b', uid: 'u' }), /不是 13 或 14/);
  });
  it('03 審查 P2-2：超過規則上限的卡片（51 行、一行 1001 字、11 個超連結、顏色不是 #rrggbb）在寫入前就列出來並停下；報告、--dry-run 也列出', async () => {
    const d2 = mkdtempSync(join(tmpdir(), 'mig-big-'));                         // 暫存的水果部複本（不碰正式資料檔）
    const st = JSON.parse(readFileSync(join(ROOT, 'data-fruit.json'), 'utf8'));
    const ev = (id, o) => ({ id, name: id, desc: '', createdAt: '2026-11-01', staff: [], links: [], times: [], round: 1, touched: [], ...o });
    const lk = (n, color = '#6a4fd8') => Array.from({ length: n }, (_, i) => ({ id: 'l' + i, name: '連結', url: 'https://example.com/', color }));
    st.events = [...(st.events || []), ev('big51', { desc: Array.from({ length: 51 }, (_, i) => `第 ${i} 行`).join('\n') }), ev('ok50', { desc: Array.from({ length: 50 }, (_, i) => 'x'.repeat(1000)).join('\n') }),
      ev('big1001', { desc: '一行\n' + 'x'.repeat(1001) }), ev('lk11', { links: lk(11) }), ev('ok10', { links: lk(10), desc: Array.from({ length: 50 }, (_, i) => `第 ${i} 行`).join('\n'), times: [{ id: 't1', label: '開會', start: '2026-11-20T14:00', end: '', place: '' }] }), ev('lkbad', { links: lk(1, 'red;position:fixed') }),
      ev('blk51', { desc: '', blocks: Array.from({ length: 51 }, (_, i) => ({ id: 'b' + i, text: 't', check: null, timeId: null })) })];
    st.events.find(e => e.id === 'blk51').desc = Array(51).fill('t').join('\n');
    writeFileSync(join(d2, 'data-fruit.json'), JSON.stringify(st));
    const s = loadSources({ dir: d2, dept: 'fruit' });
    const big = plan(s, { batch: 'x', uid: SU }).reports[0].tooBig;
    assert.deepEqual(big.map(x => x.id), ['big51', 'big1001', 'lk11', 'lkbad', 'blk51']);
    await assert.rejects(runImport(sdb(), FV, TS, s, { batch: 'd-big', uid: SU }),
      /有 5 張卡片超過上限[\s\S]*big51「big51」：51 行[\s\S]*big1001[\s\S]*最長一行 1001 字[\s\S]*lk11[\s\S]*11 個超連結[\s\S]*lkbad[\s\S]*#rrggbb[\s\S]*blk51[\s\S]*51 行/);
    assert.ok(!(await readDoc(t, 'migrations/d-big')), '停在寫入之前：連批次紀錄都沒有寫');
    assert.equal(await count('cards', 'fruit'), 0);
    const rep = await deptReport(sdb(), s, 'fruit');
    assert.equal(rep.ok, false);
    assert.equal(rep.tooBig.length, 5);
    const txt = formatReport(rep);
    assert.ok(txt.indexOf('超過上限的卡片 5 張') > 0 && txt.indexOf('超過上限的卡片') < txt.indexOf('項目'), '報告先列出超過上限的卡片：' + txt);
    const dry = spawnSync(process.execPath, [join(ROOT, 'backend/migrate/cli.js'), '--dry-run', `--dir=${d2}`, '--dept=fruit'], { cwd: join(ROOT, 'backend'), env: process.env, encoding: 'utf8' });
    assert.equal(dry.status, 1, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /超過上限的卡片 5 張[\s\S]*fruit／big51/);
    // 剛好在上限內的（50 行 × 1000 字；10 個超連結＋50 行＋時間標記）照常匯入、規則接受（遷移匯入最吃運算式，firestore.rules 的 linkOk 註解）
    st.events = st.events.filter(e => !big.some(x => x.id === e.id));
    writeFileSync(join(d2, 'data-fruit.json'), JSON.stringify(st));
    const s2 = loadSources({ dir: d2, dept: 'fruit' });
    const r = await runImport(sdb(), FV, TS, s2, { batch: 'd-big2', uid: SU });
    assert.equal(r.written.cards, 2, JSON.stringify(r.written));
  });

  it('匯出位置檢查（02D 審查）：大小寫不分、解開符號連結（檔案或資料夾）；只在暫存的假 repo 裡測，不碰正式資料檔', () => {
    const root = mkdtempSync(join(tmpdir(), 'blk-root-')), other = mkdtempSync(join(tmpdir(), 'blk-other-'));
    mkdirSync(join(root, 'archive')); writeFileSync(join(root, 'data-fruit.json'), '{}'); writeFileSync(join(root, 'data.json'), '{}');
    symlinkSync(join(root, 'data-fruit.json'), join(other, 'link.json'));        // 檔案連結 → 正式資料檔
    symlinkSync(root, join(other, 'repo'));                                       // 資料夾連結 → repo 根目錄
    symlinkSync(join(root, 'archive'), join(other, 'arc'));
    symlinkSync(join(root, 'data-new.json'), join(other, 'dangling.json'));       // 指向還不存在的 data-*.json
    for (const p of [join(root, 'data.json'), join(root, 'DATA-FRUIT.JSON'), join(root, 'Data-x.Json'), join(root, 'ARCHIVE', 'x.json'), join(root, 'Archive'),
                     join(other, 'link.json'), join(other, 'repo', 'data-fruit.json'), join(other, 'repo', 'Archive', 'y.json'), join(other, 'arc', 'z.json'),
                     join(other, 'dangling.json'), join(root, 'docs', '..', 'data.json')])
      assert.ok(blockedOut(p, root), `應該擋下 ${p}`);
    for (const p of [join(other, 'export.json'), join(root, 'docs', 'data.json'), join(root, 'backup-data.json'), join(other, 'repo', 'exports', 'x.json')])
      assert.equal(blockedOut(p, root), null, `不該擋 ${p}`);
    assert.equal(readFileSync(join(root, 'data-fruit.json'), 'utf8'), '{}');
  });
});

// release-03 檢查 C：舊網站（schemaVersion 13 的程式）只會改 desc。核取行攤平成「☑ 」「☐ 」開頭的文字，被改了文字或新加時，
// 網頁（blocksFromDesc）與遷移（toDocs 沒有 blocks 的卡片）都還原成核取行，攤平回去跟原本的 desc 逐字相同
describe('release-03 核取行從 desc 還原', () => {
  it('網頁重建與遷移：開頭 ☑／☐ 的行是核取行，其他純文字；攤平回去逐字相同', () => {
    const desc = '☑ 做完（舊網站改過）\n☐ 還沒\n普通的一行\n☑沒有空白不算';
    const b = MAP.blocksFromDesc(desc, []);
    assert.deepEqual(b.map(x => [x.text, x.check]), [['做完（舊網站改過）', true], ['還沒', false], ['普通的一行', null], ['☑沒有空白不算', null]]);
    assert.equal(MAP.descOf(b), desc);
    const r = MAP.toDocs('rights', { schemaVersion: 13, events: [{ id: 'e1', name: 'x', desc, times: [] }], issues: [], weeks: [], labels: [], members: [] }, { batch: 'b', uid: 'u' });
    const c = r.docs.find(d => d.kind === 'cards').data;
    assert.deepEqual(c.blocks.check, [true, false, null, null]);
    assert.deepEqual(c.blocks.id, ['rights__e1_L0', 'rights__e1_L1', 'rights__e1_L2', 'rights__e1_L3']);
    assert.equal(MAP.descOf(MAP.fromFsBlocks('rights', c.blocks)), desc);
    assert.equal(c.legacyDesc, desc);
  });
  it('新程式存的檔案被舊網站改了核取行的文字：沒改的行沿用（ID、勾選），改過的還原成核取行', () => {
    const old = [{ id: 'a', text: '第一行', check: true, timeId: null }, { id: 'b', text: '第二行', check: null, timeId: null }];
    const b = MAP.blocksOf({ blocks: old, desc: '☑ 第一行（改）\n第二行', times: [] });
    assert.deepEqual(b.map(x => [x.text, x.check]), [['第一行（改）', true], ['第二行', null]]);
    assert.equal(b[1].id, 'b');
  });
});
