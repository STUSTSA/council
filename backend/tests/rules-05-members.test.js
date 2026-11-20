// 05 部門成員名單與部長管理（permissions.md 5.1h）：
// ① 名單文件多一個 role（可有可無，有就要等於 roles 裡的角色）；② 部長（部門管理員）只能發本部門「編輯者」QR 邀請、撤掉本部門的編輯者；
// ③ 部長讀得到「在我管理的部門有角色」的人的 roles（為了帶 rev 寫入），其他人、總管理員、別部門的人都讀不到；④ 不能自我升權、不能動管理員與總管理員。
// 舊身分刪除（legacyIdentities delete）沿用 04 的規則：只有總管理員。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS, readDoc, newToken, auditId,
         commit, inviteWrites, redeemWrites, superRoleWrites, createCard } from './helpers.js';

let t;
const U = {
  boss: { super: true },
  adm: { depts: { rights: 'admin' } },
  adm2: { depts: { rights: 'admin' } },
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
  await seed(t, db => db.doc('users/ed').set({ email: 'ed@example.test', createdAt: TS.now(), lastLoginAt: TS.now() }));
});
const db = u => google(t, u);
const roleOf = u => readDoc(t, `roles/${u}`);
const ent = (d, u, o = {}) => ({ deptId: d, uid: u, at: NOW(), ...o });
const put = (d, u, role) => seed(t, x => x.doc(`deptMembers/${d}__${u}`).set({ deptId: d, uid: u, ...(role ? { role } : {}), at: new Date() }));
// 部長撤掉編輯者：roles（lastVia dept、lastRef 部門）＋稽核＋同一批刪名單
function deptRemove(actor, uid, cur, dept, o = {}) {
  const depts = { ...cur.depts }; delete depts[dept];
  return [...superRoleWrites(actor, uid, cur, { depts }, 'dept', dept, o), [`deptMembers/${dept}__${uid}`, null, 'delete']];
}

describe('N5-01～N5-05 名單的 role 欄位', () => {
  it('N5-01 本人、部長、總管理員登記時可以帶 role（必須等於 roles 裡的角色）；不帶也行（舊寫法）', async () => {
    await assertSucceeds(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'editor' })));
    await assertSucceeds(db('adm').doc('deptMembers/rights__adm').set(ent('rights', 'adm')));
    await assertSucceeds(db('boss').doc('deptMembers/rights__adm2').set(ent('rights', 'adm2', { role: 'admin' })));
    await assertSucceeds(db('adm').doc('deptMembers/rights__ed2').set(ent('rights', 'ed2', { role: 'editor' })));   // 部長替本部門的人登記
    assert.equal((await readDoc(t, 'deptMembers/rights__ed')).role, 'editor');
  });
  it('N5-02 role 跟 roles 不一致、不是 admin／editor、帶別的欄位：拒絕', async () => {
    await assertFails(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'admin' })));     // 自己升成管理員
    await assertFails(db('boss').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'owner' })));
    await assertFails(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'editor', email: 'x@y.z' })));
  });
  it('N5-03 部長不能替別的部門、沒有該部門角色的人登記；編輯者不能替別人登記', async () => {
    await assertFails(db('adm').doc('deptMembers/events__ed2').set(ent('events', 'ed2', { role: 'editor' })));  // 別的部門
    await assertFails(db('adm').doc('deptMembers/rights__nb').set(ent('rights', 'nb')));                       // 對方沒有這個部門的角色
    await assertFails(db('ed').doc('deptMembers/rights__ed2').set(ent('rights', 'ed2', { role: 'editor' })));
  });
  it('N5-04 更新：本人、部長、總管理員可以補上或對齊 role；不能改 deptId、uid；編輯者不能改別人的', async () => {
    await put('rights', 'ed');
    await assertSucceeds(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'editor' })));
    await seedRole(t, 'ed', { depts: { rights: 'admin' } });                                                   // 角色被升成管理員後，名單對齊
    await assertFails(db('ed').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'editor' })));   // 還寫舊角色：拒絕
    await assertSucceeds(db('boss').doc('deptMembers/rights__ed').set(ent('rights', 'ed', { role: 'admin' })));
    await put('rights', 'ed2');
    await assertFails(db('nb').doc('deptMembers/rights__ed2').set(ent('rights', 'ed2', { role: 'editor' })));
  });
  it('N5-05 名單的讀取範圍不變：別部門、沒有角色、未登入都讀不到', async () => {
    await put('rights', 'ed', 'editor');
    for (const x of [db('evAdm'), db('nb'), anon(t)]) await assertFails(x.collection('deptMembers').where('deptId', '==', 'rights').get());
    for (const u of ['ed', 'adm', 'boss']) {
      const s = await assertSucceeds(db(u).collection('deptMembers').where('deptId', '==', 'rights').get());
      assert.deepEqual(s.docs.map(d => d.data().role), ['editor']);
    }
  });
});

describe('N5-10～N5-16 部長發本部門編輯者邀請', () => {
  it('N5-10 部長發自己部門的編輯者邀請（可綁信箱）：允許；編輯者核銷後成為編輯者', async () => {
    const k = newToken();
    await assertSucceeds(commit(db('adm'), inviteWrites('adm', k.h, { deptId: 'rights', role: 'editor', boundEmail: 'new@example.test' })));
    const kk = { ...k, inv: await readDoc(t, `invitations/${k.h}`) };
    await assertSucceeds(commit(google(t, 'new', { email: 'new@example.test' }), redeemWrites('new', kk, null, { depts: { rights: 'editor' } })));
    assert.deepEqual((await roleOf('new')).depts, { rights: 'editor' });
  });
  it('N5-11 部長發管理員邀請、別的部門的邀請、帶舊身分：拒絕', async () => {
    await assertFails(commit(db('adm'), inviteWrites('adm', newToken().h, { deptId: 'rights', role: 'admin' })));
    await assertFails(commit(db('adm'), inviteWrites('adm', newToken().h, { deptId: 'events', role: 'editor' })));
    await assertFails(commit(db('adm'), inviteWrites('adm', newToken().h, { deptId: 'rights', role: 'editor', legacyRef: 'rights__m1' })));
  });
  it('N5-12 編輯者、沒有角色的人、別部門的部長發邀請：拒絕', async () => {
    for (const u of ['ed', 'nb', 'evAdm']) await assertFails(commit(db(u), inviteWrites(u, newToken().h, { deptId: 'rights', role: 'editor' })));
    await assertSucceeds(commit(db('boss'), inviteWrites('boss', newToken().h, { deptId: 'rights', role: 'admin' })));   // 總管理員照舊什麼都能發
  });
  it('N5-13 部長只能撤銷自己發的那張；看得到自己那張用掉後的狀態；別人看不到已使用的', async () => {
    const k = newToken();
    await assertSucceeds(commit(db('adm'), inviteWrites('adm', k.h, { deptId: 'rights', role: 'editor' })));
    const inv = await readDoc(t, `invitations/${k.h}`);
    const rv = (u, cur) => commit(db(u), [[`invitations/${k.h}`, { ...cur, status: 'revoked', revokedBy: u, revokedAt: NOW(), rev: cur.rev + 1, updatedAt: NOW(), updatedBy: u }],
      [auditId('invitations', k.h, cur.rev + 1), { col: 'invitations', docId: k.h, rev: cur.rev + 1, action: 'revoke', actor: u, at: NOW(), before: { status: 'active' }, after: { status: 'revoked' }, ref: '' }]]);
    await assertFails(rv('adm2', inv));      // 同部門的另一位部長發的不算
    await assertFails(rv('ed', inv));
    await assertSucceeds(rv('adm', inv));
    const k2 = newToken();
    await assertSucceeds(commit(db('adm'), inviteWrites('adm', k2.h, { deptId: 'rights', role: 'editor' })));
    const kk = { ...k2, inv: await readDoc(t, `invitations/${k2.h}`) };
    await assertSucceeds(commit(db('u9'), redeemWrites('u9', kk, null, { depts: { rights: 'editor' } })));
    await assertSucceeds(db('adm').doc(`invitations/${k2.h}`).get());    // 發的人
    await assertFails(db('adm2').doc(`invitations/${k2.h}`).get());       // 別人：已使用就看不到
    await assertFails(db('adm').collection('invitations').get());         // 列出全部仍只有總管理員
  });
});

describe('N5-20～N5-32 部長撤掉本部門的編輯者', () => {
  it('N5-20 部長撤掉本部門的編輯者：roles＋稽核＋刪名單同一批，允許；對方其他部門的角色不動', async () => {
    await put('rights', 'ed2', 'editor'); await put('events', 'ed2', 'editor');
    await assertSucceeds(db('adm').doc('roles/ed2').get());
    await assertSucceeds(commit(db('adm'), deptRemove('adm', 'ed2', await roleOf('ed2'), 'rights')));
    assert.deepEqual((await roleOf('ed2')).depts, { events: 'editor' });
    assert.equal(await readDoc(t, 'deptMembers/rights__ed2'), undefined);
    assert.ok(await readDoc(t, 'deptMembers/events__ed2'));
    assert.equal((await roleOf('ed2')).lastVia, 'dept');
  });
  it('N5-21 部長不能撤管理員（含另一位部長、自己）、不能撤別的部門的人', async () => {
    await assertFails(commit(db('adm'), deptRemove('adm', 'adm2', await roleOf('adm2'), 'rights')));
    await assertFails(commit(db('adm'), deptRemove('adm', 'adm', await roleOf('adm'), 'rights')));
    await assertFails(commit(db('adm'), deptRemove('adm', 'ed2', await roleOf('ed2'), 'events')));             // 我不是 events 的部長
    await assertFails(commit(db('adm'), deptRemove('adm', 'evAdm', await roleOf('evAdm'), 'events')));
  });
  it('N5-22 部長不能新增、改成管理員、改成別的角色、動 super、一次動兩個部門', async () => {
    const cur = await roleOf('ed');
    const w = n => superRoleWrites('adm', 'ed', cur, n, 'dept', 'rights');
    await assertFails(commit(db('adm'), w({ depts: { rights: 'admin' } })));                                   // 升成管理員
    await assertFails(commit(db('adm'), w({ depts: { rights: 'editor', events: 'editor' } })));                // 新增別的部門
    await assertFails(commit(db('adm'), w({ super: true })));                                                  // 升成總管理員
    await assertFails(commit(db('adm'), w({ super: true, depts: {} })));
    const cur2 = await roleOf('ed2');
    await assertFails(commit(db('adm'), superRoleWrites('adm', 'ed2', cur2, { depts: {} }, 'dept', 'rights')));  // 一次撤兩個部門
    await assertFails(commit(db('adm'), superRoleWrites('adm', 'nb', null, { depts: { rights: 'editor' } }, 'dept', 'rights')));   // 新建 roles（加人要走 QR）
  });
  it('N5-23 lastVia 寫成別的（manual、revoke、request）或 lastRef 不是我管理的部門：拒絕', async () => {
    const cur = await roleOf('ed');
    for (const via of ['manual', 'revoke', 'request']) await assertFails(commit(db('adm'), superRoleWrites('adm', 'ed', cur, { depts: {} }, via, 'rights')));
    await assertFails(commit(db('adm'), superRoleWrites('adm', 'ed', cur, { depts: {} }, 'dept', 'events')));
    await assertFails(commit(db('adm'), superRoleWrites('adm', 'ed', cur, { depts: {} }, 'dept', 'x')));
  });
  it('N5-24 編輯者、別部門的部長、沒有角色的人撤人：拒絕', async () => {
    for (const u of ['ed', 'evAdm', 'nb']) await assertFails(commit(db(u), superRoleWrites(u, 'ed2', await roleOf('ed2'), { depts: { events: 'editor' } }, 'dept', 'rights')));
  });
  it('N5-25 不能撤總管理員的部門角色', async () => {
    await seedRole(t, 'bossEd', { super: true, depts: { rights: 'editor' } });
    await assertFails(commit(db('adm'), superRoleWrites('adm', 'bossEd', await roleOf('bossEd'), { depts: {} }, 'dept', 'rights')));
  });
  it('N5-26 稽核紀錄要同一批寫、內容要對：少寫、寫錯 before／after：拒絕', async () => {
    const cur = await roleOf('ed');
    const w = superRoleWrites('adm', 'ed', cur, { depts: {} }, 'dept', 'rights');
    await assertFails(commit(db('adm'), [w[0]]));
    await assertFails(commit(db('adm'), [w[0], [w[1][0], { ...w[1][1], after: { super: false, depts: { rights: 'editor' } } }]]));
    await assertSucceeds(commit(db('adm'), w));
  });
  it('N5-27 撤掉之後撤掉的人立刻失去編輯權（寫卡片被拒），仍然讀得到', async () => {
    await put('rights', 'ed', 'editor');
    await assertSucceeds(createCard(db('ed'), 'ed', 'c1'));
    await assertSucceeds(commit(db('adm'), deptRemove('adm', 'ed', await roleOf('ed'), 'rights')));
    assert.deepEqual((await roleOf('ed')).depts, {});
    await assertFails(createCard(db('ed'), 'ed', 'c2'));
    await assertSucceeds(db('ed').doc('cards/c1').get());
  });
});

describe('N5-30～N5-35 roles 的讀取', () => {
  it('N5-30 部長讀得到在自己管理的部門有角色的人（編輯者、管理員）；讀不到別部門的人、沒有角色的人、總管理員', async () => {
    for (const u of ['ed', 'ed2', 'adm2']) await assertSucceeds(db('adm').doc(`roles/${u}`).get());
    for (const u of ['evAdm', 'nb', 'boss']) await assertFails(db('adm').doc(`roles/${u}`).get());
  });
  it('N5-31 編輯者、沒有角色的人、未登入讀不到別人的 roles；本人與總管理員照舊；列出全部仍只有總管理員', async () => {
    for (const x of [db('ed'), db('nb'), anon(t)]) await assertFails(x.doc('roles/adm').get());
    await assertSucceeds(db('ed').doc('roles/ed').get());
    await assertSucceeds(db('boss').doc('roles/adm').get());
    await assertFails(db('adm').collection('roles').get());
    await assertFails(db('adm').collection('roles').where('depts.rights', '==', 'editor').get());
  });
  it('N5-32 部長讀不到 users（信箱）、auditLogs、別人的名單以外的東西', async () => {
    await assertFails(db('adm').doc('users/ed').get());
    await assertFails(db('adm').collection('users').get());
    await assertFails(db('adm').collection('auditLogs').get());
  });
});

describe('N5-40 舊身分刪除（沿用 04）', () => {
  const legacy = { deptId: 'rights', name: '測試', oldRole: 'member', createdAt: '2025', claimedBy: null, claimedAt: null, rev: 1, updatedAt: new Date(), updatedBy: 'seed' };
  it('N5-40 只有總管理員能刪舊身分；部長、編輯者、沒有角色的人、未登入都不行；刪了不影響其他舊身分', async () => {
    await seed(t, x => Promise.all(['rights__a', 'rights__b'].map(i => x.doc(`legacyIdentities/${i}`).set(legacy))));
    for (const x of [db('adm'), db('ed'), db('nb'), anon(t)]) await assertFails(x.doc('legacyIdentities/rights__a').delete());
    await assertSucceeds(db('boss').doc('legacyIdentities/rights__a').delete());
    assert.equal(await readDoc(t, 'legacyIdentities/rights__a'), undefined);
    assert.ok(await readDoc(t, 'legacyIdentities/rights__b'));
  });
});
