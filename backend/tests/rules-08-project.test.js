// 專案權限申請（跟部門申請分開）：任何登入的人送申請；只有活動部部長或總管理員能審；
// 核准＝同一批寫 projectGrants；授權只能改活動部的專案（issues、deptId＝events），不給其他編輯權、不改 roles。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seedRole, seedDepts, assertSucceeds, assertFails, NOW, readDoc, commit, auditId, audit } from './helpers.js';

let t;
const U = { boss: { super: true }, evAdm: { depts: { events: 'admin' } }, evEd: { depts: { events: 'editor' } }, rtAdm: { depts: { rights: 'admin' } },
            gen: {}, gen2: {}, gen3: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);
const req = (u, o = {}) => ({ uid: u, note: '', status: 'pending', rev: 1, createdAt: NOW(), updatedAt: NOW(), updatedBy: u, ...o });
const aud = (col, id, rev, actor, action, before, after) => [auditId(col, id, rev), audit(col, id, rev, actor, { action, before, after })];
const ask = (u, o = {}) => [[`projectRequests/${u}`, req(u, o)], aud('projectRequests', u, 1, u, 'request', {}, { status: 'pending' })];
const approve = async (actor, u) => {
  const cur = await readDoc(t, `projectRequests/${u}`), rev = cur.rev + 1;
  const g = await readDoc(t, `projectGrants/${u}`).catch(() => null), grev = g ? g.rev + 1 : 1;
  return [[`projectRequests/${u}`, { ...cur, status: 'approved', decidedBy: actor, decidedAt: NOW(), rev, updatedAt: NOW(), updatedBy: actor }],
    aud('projectRequests', u, rev, actor, 'approve', { status: 'pending' }, { status: 'approved' }),
    [`projectGrants/${u}`, { uid: u, active: true, rev: grev, updatedAt: NOW(), updatedBy: actor }],
    aud('projectGrants', u, grev, actor, 'approve', {}, {})];
};
const reject = async (actor, u) => {
  const cur = await readDoc(t, `projectRequests/${u}`), rev = cur.rev + 1;
  return [[`projectRequests/${u}`, { ...cur, status: 'rejected', decidedBy: actor, decidedAt: NOW(), rev, updatedAt: NOW(), updatedBy: actor }],
    aud('projectRequests', u, rev, actor, 'reject', { status: 'pending' }, { status: 'rejected' })];
};
const revoke = async (actor, u) => {
  const g = await readDoc(t, `projectGrants/${u}`), rev = g.rev + 1;
  return [[`projectGrants/${u}`, { uid: u, active: false, rev, updatedAt: NOW(), updatedBy: actor }], aud('projectGrants', u, rev, actor, 'revoke', {}, {})];
};
const grant = async u => { await commit(db(u), ask(u)); await commit(db('evAdm'), await approve('evAdm', u)); };
const issue = (u, o = {}) => ({ deptId: 'events', title: '專案', cur: 0, rev: 1, updatedAt: NOW(), updatedBy: u, ...o });

describe('PJ-01～PJ-03 送申請', () => {
  it('PJ-01 登入的人只能替自己送；沒登入不行；不能帶多餘欄位或超長備註', async () => {
    await assertSucceeds(commit(db('gen'), ask('gen', { note: '想幫忙活動專案' })));
    await assertFails(commit(db('gen2'), ask('gen')));
    await assertFails(commit(anon(t), ask('gen2')));
    await assertFails(commit(db('gen2'), ask('gen2', { role: 'admin' })));
    await assertFails(commit(db('gen2'), ask('gen2', { note: 'x'.repeat(201) })));
    await assertFails(commit(db('gen2'), ask('gen2', { status: 'approved' })));
  });
  it('PJ-02 本人讀得到；別人讀不到；活動部部長與總管理員讀得到；其他部門部長讀不到', async () => {
    await commit(db('gen'), ask('gen'));
    for (const u of ['gen', 'evAdm', 'boss']) await assertSucceeds(db(u).doc('projectRequests/gen').get());
    for (const u of ['gen2', 'rtAdm', 'evEd']) await assertFails(db(u).doc('projectRequests/gen').get());
    await assertFails(anon(t).doc('projectRequests/gen').get());
  });
  it('PJ-03 本人撤回；撤回、被拒絕後可再申請（同一份改回 pending）；待審中不能再送', async () => {
    await commit(db('gen'), ask('gen'));
    await assertFails(commit(db('gen'), [[`projectRequests/gen`, req('gen', { rev: 2 })], aud('projectRequests', 'gen', 2, 'gen', 'request', { status: 'pending' }, { status: 'pending' })]));
    const cur = await readDoc(t, 'projectRequests/gen');
    await assertSucceeds(commit(db('gen'), [[`projectRequests/gen`, { ...cur, status: 'cancelled', rev: 2, updatedAt: NOW(), updatedBy: 'gen' }], aud('projectRequests', 'gen', 2, 'gen', 'cancel', { status: 'pending' }, { status: 'cancelled' })]));
    await assertSucceeds(commit(db('gen'), [[`projectRequests/gen`, req('gen', { rev: 3 })], aud('projectRequests', 'gen', 3, 'gen', 'request', { status: 'cancelled' }, { status: 'pending' })]));
  });
});

describe('PJ-04～PJ-08 審核', () => {
  it('PJ-04 活動部部長與總管理員能核准、拒絕；結果＝projectGrants active', async () => {
    await commit(db('gen'), ask('gen'));
    await assertSucceeds(commit(db('evAdm'), await approve('evAdm', 'gen')));
    assert.equal((await readDoc(t, 'projectGrants/gen')).active, true);
    await commit(db('gen2'), ask('gen2'));
    await assertSucceeds(commit(db('boss'), await reject('boss', 'gen2')));
    await commit(db('gen3'), ask('gen3'));
    await assertSucceeds(commit(db('boss'), await approve('boss', 'gen3')));
  });
  it('PJ-05 其他部門部長、活動部編輯者、一般人、本人都不能審', async () => {
    for (const actor of ['rtAdm', 'evEd', 'gen2', 'gen']) {
      await t.clearFirestore(); await seedDepts(t); for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
      await commit(db('gen'), ask('gen'));
      await assertFails(commit(db(actor), await approve(actor, 'gen')));
      await assertFails(commit(db(actor), await reject(actor, 'gen')));
    }
  });
  it('PJ-06 核准一定要同批寫授權；只寫授權不改申請也不行；授權不能自己給自己', async () => {
    await commit(db('gen'), ask('gen'));
    const w = await approve('evAdm', 'gen');
    await assertFails(commit(db('evAdm'), [w[0], w[1]]));
    await assertFails(commit(db('evAdm'), [w[2], w[3]]));
    await assertFails(commit(db('gen'), [[`projectGrants/gen`, { uid: 'gen', active: true, rev: 1, updatedAt: NOW(), updatedBy: 'gen' }], aud('projectGrants', 'gen', 1, 'gen', 'approve', {}, {})]));
    await assertFails(commit(db('boss'), [[`projectGrants/gen3`, { uid: 'gen3', active: true, rev: 1, updatedAt: NOW(), updatedBy: 'boss' }], aud('projectGrants', 'gen3', 1, 'boss', 'approve', {}, {})]));
  });
  it('PJ-07 審核不能改 roles（不會多出部門角色）', async () => {
    await commit(db('gen'), ask('gen'));
    await assertFails(commit(db('evAdm'), [...await approve('evAdm', 'gen'), [`roles/gen`, { super: false, depts: { events: 'editor' }, rev: 1, lastVia: 'request', lastRef: 'gen', updatedAt: NOW(), updatedBy: 'evAdm' }]]));
  });
  it('PJ-08 撤銷：活動部部長／總管理員；本人與其他人不行；撤銷後可重新申請核准', async () => {
    await grant('gen');
    await assertFails(commit(db('gen'), await revoke('gen', 'gen')));
    await assertFails(commit(db('rtAdm'), await revoke('rtAdm', 'gen')));
    await assertSucceeds(commit(db('evAdm'), await revoke('evAdm', 'gen')));
    const cur = await readDoc(t, 'projectRequests/gen');
    await assertSucceeds(commit(db('gen'), [[`projectRequests/gen`, req('gen', { rev: cur.rev + 1 })], aud('projectRequests', 'gen', cur.rev + 1, 'gen', 'request', { status: 'approved' }, { status: 'pending' })]));
    await assertSucceeds(commit(db('evAdm'), await approve('evAdm', 'gen')));
    assert.equal((await readDoc(t, 'projectGrants/gen')).active, true);
  });
});

describe('PJ-09～PJ-12 授權的範圍', () => {
  it('PJ-09 有授權：能新增、修改活動部的專案；不能刪；不能改別的部門的議題；不能碰卡片、週報、標籤', async () => {
    await grant('gen');
    await assertSucceeds(db('gen').doc('issues/events__p1').set(issue('gen')));
    await assertSucceeds(db('gen').doc('issues/events__p1').set(issue('gen', { rev: 2, title: '改' })));
    await assertFails(db('gen').doc('issues/rights__p1').set(issue('gen', { deptId: 'rights' })));
    await assertFails(db('gen').doc('issues/events__p1').delete());
    await assertFails(db('gen').doc('cards/events__c1').set({ deptId: 'events', title: 'x' }));
    await assertFails(db('gen').doc('weeks/events__w1').set({ deptId: 'events', date: '2026-11-23', text: 'x', updatedAt: NOW(), updatedBy: 'gen' }));
    await assertFails(db('gen').doc('labels/events__l1').set({ deptId: 'events', name: 'x', updatedAt: NOW(), updatedBy: 'gen' }));
  });
  it('PJ-10 沒授權、待審中、被拒絕、已撤銷：都不能改專案', async () => {
    await assertFails(db('gen2').doc('issues/events__p2').set(issue('gen2')));
    await commit(db('gen2'), ask('gen2'));
    await assertFails(db('gen2').doc('issues/events__p2').set(issue('gen2')));
    await commit(db('boss'), await reject('boss', 'gen2'));
    await assertFails(db('gen2').doc('issues/events__p2').set(issue('gen2')));
    await grant('gen');
    await commit(db('evAdm'), await revoke('evAdm', 'gen'));
    await assertFails(db('gen').doc('issues/events__p3').set(issue('gen')));
  });
  it('PJ-11 授權讀取：本人、活動部部長、總管理員；其他人與其他部門部長讀不到；只有決定者能列全部', async () => {
    await grant('gen');
    for (const u of ['gen', 'evAdm', 'boss']) await assertSucceeds(db(u).doc('projectGrants/gen').get());
    for (const u of ['gen2', 'rtAdm']) await assertFails(db(u).doc('projectGrants/gen').get());
    await assertSucceeds(db('evAdm').collection('projectGrants').get());
    await assertFails(db('gen').collection('projectGrants').get());
  });
  it('PJ-12 稽核紀錄連號：沒寫稽核的申請與授權寫不進去', async () => {
    await assertFails(commit(db('gen'), [[`projectRequests/gen`, req('gen')]]));
    await commit(db('gen'), ask('gen'));
    const w = await approve('evAdm', 'gen');
    await assertFails(commit(db('evAdm'), [w[0], w[2], w[3]]));
    await assertFails(commit(db('evAdm'), [w[0], w[1], w[2]]));
  });
});
