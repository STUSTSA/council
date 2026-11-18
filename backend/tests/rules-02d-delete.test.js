// 02D D-d 議題、週報、標籤的刪除權限與刪除紀錄（permissions.md 第 5.1g 節；使用者 2026-11-16 決定）：
// 部門管理員可以刪自己部門的議題、週報、標籤；部門編輯者不行；總管理員照舊可以。刪除一定要同一批寫一筆刪除紀錄（誰、何時、類型、標題），
// 由規則強制：紀錄 ID＝auditLogs/{集合}_{ID}_delete_{被刪那一版 updatedAt 的毫秒}，內容要等於被刪的文件。
// 遷移失敗回復（rollbackImport，批次是 rollingBack）不另寫紀錄（migrate.test.js 的 R1 照舊通過）。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS, readDoc, audit, auditId } from './helpers.js';

let t;
const U = {
  boss: { super: true },
  adm: { depts: { rights: 'admin' } },
  ed: { depts: { rights: 'editor' } },
  evAdm: { depts: { events: 'admin' } },           // 別部門管理員
  sec: { depts: { secretariat: 'editor' } },
  nb: {},                                          // 沒有角色的登入者
};
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);

const DATA = {
  issues: u => ({ deptId: 'rights', title: '宿舍議題', cur: 0, rev: 3, updatedAt: TS.fromMillis(1763000000123), updatedBy: u }),
  weeks: u => ({ deptId: 'rights', date: '2026-11-15', text: '週報', auto: false, createdAt: TS.fromMillis(1763000000000), updatedAt: TS.fromMillis(1763000000456), updatedBy: u }),
  labels: u => ({ deptId: 'rights', kind: '人', name: '學務處', updatedAt: TS.fromMillis(1763000000789), updatedBy: u }),
};
const titleOf = (col, x) => col === 'issues' ? x.title : col === 'weeks' ? x.date : x.name;
const put = (col, id, o = {}) => seed(t, d => d.doc(`${col}/${id}`).set({ ...DATA[col]('ed'), ...o }));
const logId = (col, id, x) => `auditLogs/${col}_${id}_delete_${Math.floor(x.updatedAt.toMillis())}`;   // 正式專案的伺服器時間到微秒：規則取整數毫秒
const logData = (col, id, x, actor, o = {}) => ({ col, docId: id, rev: x.rev || 0, action: 'delete', actor, at: NOW(),
  before: { title: titleOf(col, x), deptId: x.deptId }, after: {}, ref: '', ...o });
/* 刪除＋紀錄同一批；mut 可以改紀錄的 ID 或內容 */
async function del(u, col, id, { log = true, logPath, logPatch = {}, skipDelete = false } = {}) {
  const x = await readDoc(t, `${col}/${id}`), f = db(u), b = f.batch();
  if (!skipDelete) b.delete(f.doc(`${col}/${id}`));
  if (log) b.set(f.doc(logPath || logId(col, id, x)), logData(col, id, x, u, logPatch));
  return b.commit();
}
const COLS = ['issues', 'weeks', 'labels'];
/* 新建用的內容（伺服器時間、議題 rev 1） */
const fresh = (col, u, importBatch) => ({ ...DATA[col](u), updatedAt: NOW(), ...(col === 'issues' ? { rev: 1 } : {}), ...(col === 'weeks' ? { createdAt: NOW() } : {}), importBatch });

describe('X-01～X-08 議題、週報、標籤的刪除（02D D-d）', () => {
  it('X-01 部門管理員刪自己部門的議題、週報、標籤（同批寫紀錄）：允許；紀錄留下，內容是誰、何時（伺服器時間）、類型、標題；總管理員讀得到', async () => {
    for (const col of COLS) {
      await put(col, 'rights__a1');
      const x = await readDoc(t, `${col}/rights__a1`);
      await assertSucceeds(del('adm', col, 'rights__a1'));
      assert.equal(await readDoc(t, `${col}/rights__a1`), undefined);
      const l = await readDoc(t, logId(col, 'rights__a1', x));
      assert.equal(l.actor, 'adm'); assert.equal(l.col, col); assert.equal(l.action, 'delete');
      assert.equal(l.before.title, titleOf(col, x)); assert.equal(l.before.deptId, 'rights');
      assert.ok(l.at instanceof TS && Math.abs(l.at.toMillis() - Date.now()) < 60000);
      await assertSucceeds(db('boss').doc(logId(col, 'rights__a1', x)).get());
      await assertFails(db('adm').doc(logId(col, 'rights__a1', x)).get());
    }
  });
  it('X-02 總管理員刪任何部門（同批寫紀錄）：允許', async () => {
    for (const col of COLS) { await put(col, 'events__b1', { deptId: 'events' }); await assertSucceeds(del('boss', col, 'events__b1')); }
  });
  it('X-03 部門編輯者刪自己部門的：拒絕（有寫紀錄也一樣）', async () => {
    for (const col of COLS) { await put(col, 'rights__c1'); await assertFails(del('ed', col, 'rights__c1')); assert.ok(await readDoc(t, `${col}/rights__c1`)); }
  });
  it('X-04 別部門的管理員、秘書處、沒有角色的登入者、未登入刪：拒絕', async () => {
    for (const col of COLS) {
      await put(col, 'rights__d1');
      for (const u of ['evAdm', 'sec', 'nb']) await assertFails(del(u, col, 'rights__d1'));
      await assertFails(anon(t).doc(`${col}/rights__d1`).delete());
      assert.ok(await readDoc(t, `${col}/rights__d1`));
    }
  });
  it('X-05 刪了不寫紀錄（管理員、總管理員）；紀錄寫到別的 ID（別份文件、舊的毫秒、少了毫秒、別的集合名）：拒絕', async () => {
    for (const col of COLS) {
      await put(col, 'rights__e1'); await put(col, 'rights__e2');
      const x = await readDoc(t, `${col}/rights__e1`);
      for (const u of ['adm', 'boss']) await assertFails(del(u, col, 'rights__e1', { log: false }));
      await assertFails(del('adm', col, 'rights__e1', { logPath: logId(col, 'rights__e2', x) }));
      await assertFails(del('adm', col, 'rights__e1', { logPath: `auditLogs/${col}_rights__e1_delete_${Math.floor(x.updatedAt.toMillis()) - 1}` }));
      await assertFails(del('adm', col, 'rights__e1', { logPath: `auditLogs/${col}_rights__e1_delete` }));
      await assertFails(del('adm', col, 'rights__e1', { logPath: `auditLogs/cards_rights__e1_delete_${Math.floor(x.updatedAt.toMillis())}` }));
      assert.ok(await readDoc(t, `${col}/rights__e1`));
    }
  });
  it('X-06 紀錄內容不符（標題、部門、rev、actor 寫別人、用戶端時間、action、col、docId、after、ref、白名單外欄位）：拒絕', async () => {
    const bad = [{ before: { title: '別的標題', deptId: 'rights' } }, { before: { title: null, deptId: 'events' } }, { before: {} },
      { rev: 99 }, { actor: 'boss' }, { at: TS.fromMillis(Date.now()) }, { action: 'purge' }, { col: 'cards' }, { docId: 'rights__zz' },
      { after: { state: 'deleted' } }, { ref: 'x' }, { extra: 1 }];
    for (const col of COLS) {
      await put(col, 'rights__f1');
      const x = await readDoc(t, `${col}/rights__f1`);
      for (const p of bad) {
        const patch = p.before && p.before.title === null ? { before: { title: titleOf(col, x), deptId: 'events' } } : p;
        await assertFails(del('adm', col, 'rights__f1', { logPatch: patch }));
      }
      assert.ok(await readDoc(t, `${col}/rights__f1`));
      await assertSucceeds(del('adm', col, 'rights__f1'));
    }
  });
  it('X-07 沒有刪文件卻寫紀錄（文件還在、文件不存在）；事後改、刪紀錄（含總管理員）：拒絕', async () => {
    for (const col of COLS) {
      await put(col, 'rights__g1');
      await assertFails(del('adm', col, 'rights__g1', { skipDelete: true }));
      await assertFails(db('boss').doc(`auditLogs/${col}_rights__none_delete_1`).set({ col, docId: 'rights__none', rev: 0, action: 'delete', actor: 'boss', at: NOW(), before: { title: 'x', deptId: 'rights' }, after: {}, ref: '' }));
      const x = await readDoc(t, `${col}/rights__g1`);
      await assertSucceeds(del('adm', col, 'rights__g1'));
      for (const u of ['adm', 'boss']) {
        await assertFails(db(u).doc(logId(col, 'rights__g1', x)).update({ actor: 'nobody' }));
        await assertFails(db(u).doc(logId(col, 'rights__g1', x)).delete());
      }
    }
  });
  it('X-08 同一個 ID 刪掉又重建、再刪：要用新的紀錄（拿舊紀錄充數拒絕），兩筆紀錄都在', async () => {
    for (const col of COLS) {
      await put(col, 'rights__h1');
      const x1 = await readDoc(t, `${col}/rights__h1`);
      await assertSucceeds(del('adm', col, 'rights__h1'));
      await put(col, 'rights__h1', { updatedAt: TS.fromMillis(x1.updatedAt.toMillis() + 5000) });
      const f = db('adm'), b = f.batch(); b.delete(f.doc(`${col}/rights__h1`));   // 只刪、指望舊紀錄
      await assertFails(b.commit());
      await assertFails(del('adm', col, 'rights__h1', { logPath: logId(col, 'rights__h1', x1) }));   // 覆寫舊紀錄
      await assertSucceeds(del('adm', col, 'rights__h1'));
      assert.ok(await readDoc(t, logId(col, 'rights__h1', x1)));
      assert.ok(await readDoc(t, `auditLogs/${col}_rights__h1_delete_${x1.updatedAt.toMillis() + 5000}`));
    }
  });
  it('X-09 被刪的文件 updatedAt 有微秒（正式專案的伺服器時間）：紀錄 ID 用整數毫秒才對得上；帶小數的 ID 拒絕（02D 審查 P1-1）', async () => {
    for (const col of COLS) {
      await put(col, 'rights__m1', { updatedAt: new TS(1763000000, 123456000) });
      const x = await readDoc(t, `${col}/rights__m1`);
      assert.equal(x.updatedAt.nanoseconds, 123456000);
      await assertFails(del('adm', col, 'rights__m1', { logPath: `auditLogs/${col}_rights__m1_delete_${x.updatedAt.toMillis()}` }));   // 1763000000123.456
      await assertSucceeds(del('adm', col, 'rights__m1'));                                                                              // 1763000000123
      assert.ok(await readDoc(t, `auditLogs/${col}_rights__m1_delete_1763000000123`));
    }
  });
  it('X-10 遷移回復例外：只刪 rollingBack 批次匯入、沒被改過的（議題 rev 1、週報與標籤最後寫入者＝開始批次的人）；新建時自己帶 importBatch 拒絕（02D 審查 P2-2）', async () => {
    await seed(t, async d => {
      await d.doc('migrations/rb1').set({ status: 'rollingBack', startedBy: 'boss', rev: 2 });
      await d.doc('migrations/run1').set({ status: 'running', startedBy: 'boss', rev: 1 });
    });
    // 編輯者、管理員新建時帶 importBatch（想把自己的文件標成「匯入的」）：拒絕；總管理員在 running 批次匯入：允許
    for (const col of COLS) {
      for (const u of ['ed', 'adm']) await assertFails(db(u).doc(`${col}/rights__fake`).set(fresh(col, u, 'rb1')));
      await assertSucceeds(db('boss').doc(`${col}/rights__imp`).set(fresh(col, 'boss', 'run1')));
    }
    // 回復：沒被改過的不寫紀錄可以刪；被改過的（議題 rev 2、週報／標籤最後寫入者是別人）、批次不是 rollingBack 的，不寫紀錄拒絕
    await put('issues', 'rights__r1', { rev: 1, updatedBy: 'boss', importBatch: 'rb1' });
    await put('issues', 'rights__r2', { rev: 2, updatedBy: 'boss', importBatch: 'rb1' });
    await put('weeks', 'rights__r1', { updatedBy: 'boss', importBatch: 'rb1' });
    await put('weeks', 'rights__r2', { updatedBy: 'ed', importBatch: 'rb1' });
    await put('labels', 'rights__r1', { updatedBy: 'boss', importBatch: 'rb1' });
    await put('labels', 'rights__r2', { updatedBy: 'adm', importBatch: 'rb1' });
    await put('labels', 'rights__r3', { updatedBy: 'boss', importBatch: 'run1' });
    for (const col of COLS) {
      await assertSucceeds(db('boss').doc(`${col}/rights__r1`).delete());
      await assertFails(db('boss').doc(`${col}/rights__r2`).delete());
      await assertFails(db('adm').doc(`${col}/rights__r1`).delete());
    }
    await assertFails(db('boss').doc('labels/rights__r3').delete());
    await assertSucceeds(del('boss', 'issues', 'rights__r2'));   // 被改過的照一般刪除（寫紀錄）
  });
});
