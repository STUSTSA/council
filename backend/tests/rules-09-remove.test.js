// 09 總管理員移除別人的帳號：users／profiles 只有總管理員能刪、不能刪自己、批次後對方不能還有權限；roles 文件仍不能刪（稽核鏈要留著）。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, TS, readDoc, commit, superRoleWrites } from './helpers.js';

let t;
const U = { boss: { super: true }, boss2: { super: true }, adm: { depts: { rights: 'admin' } }, ed: { depts: { rights: 'editor' } }, nb: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
  await seed(t, async db => {
    for (const u of [...Object.keys(U), 'plain']) {
      await db.doc(`users/${u}`).set({ email: `${u}@example.test`, createdAt: TS.now(), lastLoginAt: TS.now() });
      await db.doc(`profiles/${u}`).set({ displayName: u, updatedAt: TS.now() });
    }
    await db.doc('deptMembers/rights__ed').set({ deptId: 'rights', uid: 'ed', role: 'editor', at: new Date() });
  });
});
const db = u => google(t, u);
const roleOf = u => readDoc(t, `roles/${u}`);
// 移除帳號的同一批：撤光角色（revoke、ref remove）＋刪名單＋刪 users／profiles
async function removeWrites(actor, uid, depts = {}, sup = false) {
  const cur = await roleOf(uid);
  const w = cur && (cur.super || Object.keys(cur.depts).length) ? superRoleWrites(actor, uid, cur, { super: false, depts: {} }, 'revoke', 'remove') : [];
  const m = Object.keys(depts).map(d => [`deptMembers/${d}__${uid}`, null, 'delete']);
  return [...w, ...m, [`users/${uid}`, null, 'delete'], [`profiles/${uid}`, null, 'delete']];
}

describe('A9-01～A9-10 移除帳號', () => {
  it('A9-01 總管理員移除只有編輯權限的人：角色撤光（留稽核）、名單、users、profiles 都刪', async () => {
    await assertSucceeds(commit(db('boss'), await removeWrites('boss', 'ed', { rights: 1 })));
    assert.deepEqual((await roleOf('ed')).depts, {});
    assert.equal((await roleOf('ed')).lastRef, 'remove');
    assert.equal(await readDoc(t, 'users/ed'), undefined);
    assert.equal(await readDoc(t, 'profiles/ed'), undefined);
    assert.equal(await readDoc(t, 'deptMembers/rights__ed'), undefined);
    assert.ok(await readDoc(t, 'auditLogs/roles_ed_2'));
  });
  it('A9-02 移除沒有任何角色的帳號：允許；移除部長、另一位總管理員（同批撤光）：允許', async () => {
    await assertSucceeds(commit(db('boss'), await removeWrites('boss', 'plain')));
    await assertSucceeds(commit(db('boss'), await removeWrites('boss', 'adm')));
    await assertSucceeds(commit(db('boss'), await removeWrites('boss', 'boss2')));
  });
  it('A9-03 不能移除自己', async () => {
    await assertFails(db('boss').doc('users/boss').delete());
    await assertFails(db('boss').doc('profiles/boss').delete());
    await assertFails(commit(db('boss'), await removeWrites('boss', 'boss')));
  });
  it('A9-04 對方還有權限（沒有同批撤光）時不能刪 users／profiles', async () => {
    for (const u of ['ed', 'adm', 'boss2']) {
      await assertFails(db('boss').doc(`users/${u}`).delete());
      await assertFails(db('boss').doc(`profiles/${u}`).delete());
    }
    // 只撤部門、super 沒撤：仍拒絕
    const cur = await roleOf('boss2');
    await assertFails(commit(db('boss'), [...superRoleWrites('boss', 'boss2', cur, { depts: {} }, 'revoke', 'remove'), ['users/boss2', null, 'delete']]));
  });
  it('A9-05 部長、編輯者、沒有角色的人、未登入：不能刪別人的 users／profiles，也不能刪自己的', async () => {
    for (const x of [db('adm'), db('ed'), db('nb'), anon(t)]) {
      await assertFails(x.doc('users/plain').delete());
      await assertFails(x.doc('profiles/plain').delete());
    }
    await assertFails(db('nb').doc('users/nb').delete());
    await assertFails(db('ed').doc('profiles/ed').delete());
  });
  it('A9-06 roles 文件仍然不能刪（稽核鏈要留著），連總管理員也一樣', async () => {
    await assertFails(db('boss').doc('roles/plain').delete());
    await assertFails(db('boss').doc('roles/ed').delete());
  });
  it('A9-07 被移除的人再登入：自己重新建 users／profiles（原本的規則），不會拿回任何權限', async () => {
    await assertSucceeds(commit(db('boss'), await removeWrites('boss', 'ed', { rights: 1 })));
    const me = db('ed');
    await assertSucceeds(me.doc('users/ed').set({ email: 'ed@example.test', createdAt: (await import('./helpers.js')).NOW(), lastLoginAt: (await import('./helpers.js')).NOW() }));
    await assertFails(me.doc('cards/x').set({ title: 'x' }));
  });
});
