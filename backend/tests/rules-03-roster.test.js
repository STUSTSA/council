// 03 F3 專員名單（permissions.md 第 5.1h 節、data-model.md）：同部門有角色的人互相看得到顯示名稱，選專員時列出同部門全部有角色的人。
// roles 文件裡有信箱以外的東西（super、別的部門、lastRef＝邀請雜湊），不能開放；所以另外一份只有部門與 uid 的 deptMembers/{部門}__{uid}，
// 名字照舊從 profiles 讀。攻擊：別部門成員、沒有角色的登入者、未登入都讀不到；不能替別人登記、不能登記自己沒有的部門、不能帶其他欄位。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, readDoc } from './helpers.js';

let t;
const U = {
  boss: { super: true },
  adm: { depts: { rights: 'admin' } },
  ed: { depts: { rights: 'editor' } },
  ed2: { depts: { rights: 'editor', events: 'editor' } },
  evAdm: { depts: { events: 'admin' } },
  nb: {},
};
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);
const ent = (d, u, o = {}) => ({ deptId: d, uid: u, at: NOW(), ...o });
const put = (d, u) => seed(t, x => x.doc(`deptMembers/${d}__${u}`).set({ deptId: d, uid: u, at: new Date() }));
const q = (x, d) => x.collection('deptMembers').where('deptId', '==', d).get();

describe('M-01～M-07 專員名單（03 F3）', () => {
  it('M-01 本人登記自己有角色的部門：允許；總管理員替有角色的人登記：允許', async () => {
    await assertSucceeds(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed')));
    await assertSucceeds(db('adm').doc('deptMembers/rights__adm').set(ent('rights', 'adm')));
    await assertSucceeds(db('boss').doc('deptMembers/events__ed2').set(ent('events', 'ed2')));
    assert.deepEqual(Object.keys(await readDoc(t, 'deptMembers/rights__ed')).sort(), ['at', 'deptId', 'uid']);
  });
  it('M-02 同部門的編輯者、管理員、總管理員：列得出整個部門的名單；名單只有 deptId、uid、at（沒有信箱、角色等級）', async () => {
    for (const u of ['adm', 'ed', 'ed2']) await put('rights', u);
    await put('events', 'evAdm');
    for (const u of ['ed', 'adm', 'boss', 'ed2']) {
      const s = await assertSucceeds(q(db(u), 'rights'));
      assert.deepEqual(s.docs.map(d => d.data().uid).sort(), ['adm', 'ed', 'ed2']);
      s.docs.forEach(d => assert.deepEqual(Object.keys(d.data()).sort(), ['at', 'deptId', 'uid']));
    }
    await assertSucceeds(db('ed').doc('deptMembers/rights__adm').get());
    // 名單上的人照舊讀不到別人的 users（信箱）、roles
    await assertFails(db('ed').doc('users/adm').get());
    await assertFails(db('ed').doc('roles/adm').get());
  });
  it('M-03 別部門的成員、沒有角色的登入者、未登入：讀不到（列、單筆、不帶條件都拒絕）', async () => {
    await put('rights', 'ed');
    for (const x of [db('evAdm'), db('nb'), anon(t)]) {
      await assertFails(q(x, 'rights'));
      await assertFails(x.doc('deptMembers/rights__ed').get());
      await assertFails(x.collection('deptMembers').get());
    }
    await assertFails(db('ed').collection('deptMembers').get());   // 有角色的人也不能不帶部門條件列全部
    // 自己那一份不論存不存在都查得到（登入時先查有沒有再補）；別人的、不存在的別人那一份查不到
    await assertSucceeds(db('nb').doc('deptMembers/rights__nb').get());
    await assertSucceeds(db('evAdm').doc('deptMembers/rights__evAdm').get());
    await assertFails(db('nb').doc('deptMembers/rights__nobody').get());
    await assertSucceeds(q(db('evAdm'), 'events'));
  });
  it('M-04 替別人登記（非總管理員）、登記自己沒有的部門、沒有角色的人登記、未登入：拒絕', async () => {
    await assertFails(db('adm').doc('deptMembers/rights__nb').set(ent('rights', 'nb')));
    await assertFails(db('ed').doc('deptMembers/rights__evAdm').set(ent('rights', 'evAdm')));
    await assertFails(db('ed').doc('deptMembers/events__ed').set(ent('events', 'ed')));
    await assertFails(db('nb').doc('deptMembers/rights__nb').set(ent('rights', 'nb')));
    await assertFails(anon(t).doc('deptMembers/rights__x').set(ent('rights', 'x')));
    await assertFails(db('boss').doc('deptMembers/rights__nb').set(ent('rights', 'nb')));   // 總管理員也不能登記沒有角色的人
  });
  it('M-05 形狀：多帶欄位（信箱、角色、名字）、ID 跟內容不符、用戶端時間、不存在的部門：拒絕；不能改', async () => {
    // 05：role 可以帶、但要等於 roles（rules-05-members N5-01、N5-02）；這裡的 role 改測「寫成管理員」
    for (const o of [{ email: 'ed@example.test' }, { role: 'admin' }, { name: 'ed' }, { at: new Date() }])
      await assertFails(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed', o)));
    await assertFails(db('ed').doc('deptMembers/rights__other').set(ent('rights', 'ed')));
    await assertFails(db('ed').doc('deptMembers/nowhere__ed').set(ent('nowhere', 'ed')));
    await assertSucceeds(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed')));
    await assertFails(db('ed').doc('deptMembers/rights__ed').update({ uid: 'adm' }));
    await assertSucceeds(db('boss').doc('deptMembers/rights__ed').set(ent('rights', 'ed')));   // 05：已存在＝更新（補上或對齊 role、at），只有本人、總管理員、同部門部長；deptId、uid 不能改（上面的 update 拒絕）
  });
  it('M-06 刪除：本人、總管理員可以；同部門的人只能刪已經沒有角色的（過期）；別部門、沒有角色的不行', async () => {
    await put('rights', 'ed'); await put('rights', 'adm'); await put('rights', 'gone');
    await assertFails(db('ed').doc('deptMembers/rights__adm').delete());      // 對方還有角色
    await assertFails(db('evAdm').doc('deptMembers/rights__gone').delete());  // 別部門
    await assertFails(db('nb').doc('deptMembers/rights__gone').delete());
    await seedRole(t, 'gone', { depts: {} });
    await assertSucceeds(db('ed').doc('deptMembers/rights__gone').delete());  // 已撤權：同部門的人可以清掉
    await assertSucceeds(db('ed').doc('deptMembers/rights__ed').delete());
    await assertSucceeds(db('boss').doc('deptMembers/rights__adm').delete());
  });
  it('M-07 撤權後：讀不到自己原本部門的名單（名單跟著角色）', async () => {
    await put('rights', 'ed'); await put('rights', 'adm');
    await assertSucceeds(q(db('ed'), 'rights'));
    await seedRole(t, 'ed', { depts: {} });
    await assertFails(q(db('ed'), 'rights'));
  });
});
