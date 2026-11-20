// 06 申請與審核流程（permissions.md 5.1k）：登入的人選部門＋位階（部長／次長／部員）送申請；
// 部長只能審自己部門的「部員／次長（editor）」申請，申請部長只有總管理員能核准；自己不能核准自己；不能跨部門審。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, readDoc, commit, auditId, superRoleWrites } from './helpers.js';

let t;
const U = { boss: { super: true }, adm: { depts: { rights: 'admin' } }, evAdm: { depts: { events: 'admin' } }, ed: { depts: { rights: 'editor' } },
            gen: {}, gen2: {}, gen3: {}, fresh: {}, fruAdm: { depts: { fruit: 'admin' } } };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);
const reqDoc = (u, o = {}) => ({ uid: u, deptId: 'rights', role: 'editor', rank: 'member', note: '', status: 'pending', rev: 1, createdAt: NOW(), updatedAt: NOW(), updatedBy: u, ...o });
const reqAudit = (u, id, rev, o = {}) => ({ col: 'roleRequests', docId: id, rev, action: 'request', actor: u, at: NOW(), before: {}, after: { status: 'pending' }, ref: '', ...o });
const ask = (u, o = {}, dept = 'rights') => { const id = `${u}_${dept}`; return [[`roleRequests/${id}`, reqDoc(u, { deptId: dept, ...o })], [auditId('roleRequests', id, 1), reqAudit(u, id, 1)]]; };
// 審核：申請改狀態＋同批寫申請人的 roles（lastVia request、lastRef＝申請 ID）
const decide = async (actor, u, status, dept = 'rights', rolesOver = {}, reqOver = {}) => {
  const id = `${u}_${dept}`, cur = await readDoc(t, `roleRequests/${id}`), rev = cur.rev + 1;
  const w = [[`roleRequests/${id}`, { ...cur, status, decidedBy: actor, decidedAt: NOW(), rev, updatedAt: NOW(), updatedBy: actor, ...reqOver }],
    [auditId('roleRequests', id, rev), reqAudit(u, id, rev, { action: status === 'approved' ? 'approve' : 'reject', actor, before: { status: 'pending' }, after: { status } })]];
  if (status === 'approved') {
    const rc = await readDoc(t, `roles/${u}`).catch(() => null);
    w.push(...superRoleWrites(actor, u, rc, { depts: { ...(rc ? rc.depts : {}), [dept]: cur.role }, ...rolesOver }, 'request', id));
  }
  return w;
};
const seedReq = async (u, o = {}, dept = 'rights') => { await commit(db(u), ask(u, o, dept)); };

describe('R-01～R-03 送申請與位階', () => {
  it('R-01 登入的人送申請：部員／次長＝editor、部長＝admin；rank 與 role 不一致、rank 不認得：拒絕', async () => {
    await assertSucceeds(commit(db('gen'), ask('gen', { rank: 'member' })));
    await assertSucceeds(commit(db('gen2'), ask('gen2', { rank: 'deputy' })));
    await assertSucceeds(commit(db('gen3'), ask('gen3', { rank: 'minister', role: 'admin' })));
    await assertSucceeds(commit(db('ed'), ask('ed', {}, 'events')));
    await assertFails(commit(db('gen'), ask('gen', { rank: 'minister', role: 'editor' }), 'events'));
    await assertFails(commit(db('gen'), ask('gen', { rank: 'member', role: 'admin' }), 'events'));
    await assertFails(commit(db('gen'), ask('gen', { rank: 'boss' }), 'events'));
  });
  it('R-02 沒登入不能送；不能替別人送；舊申請（沒有 rank）照舊能送', async () => {
    await assertFails(commit(anon(t), ask('gen')));
    await assertFails(commit(db('gen2'), ask('gen')));
    const noRank = ask('gen'); delete noRank[0][1].rank;
    await assertSucceeds(commit(db('gen'), noRank));
  });
  it('R-03 申請人自己讀得到；別的申請人、別部門的部長讀不到；本部門部長讀得到', async () => {
    await seedReq('gen');
    await assertSucceeds(db('gen').doc('roleRequests/gen_rights').get());
    await assertSucceeds(db('adm').doc('roleRequests/gen_rights').get());
    await assertSucceeds(db('boss').doc('roleRequests/gen_rights').get());
    await assertFails(db('gen2').doc('roleRequests/gen_rights').get());
    await assertFails(db('evAdm').doc('roleRequests/gen_rights').get());
    await assertFails(db('ed').doc('roleRequests/gen_rights').get());
    await assertFails(anon(t).doc('roleRequests/gen_rights').get());
  });
});

describe('R-04～R-09 部長審本部門部員申請', () => {
  it('R-04 部長核准本部門部員申請（同批寫 roles）：成功，只新增那個部門的 editor', async () => {
    await seedReq('gen');
    await assertSucceeds(commit(db('adm'), await decide('adm', 'gen', 'approved')));
    assert.deepEqual((await readDoc(t, 'roles/gen')).depts, { rights: 'editor' });
    assert.equal((await readDoc(t, 'roles/gen')).super, false);
  });
  it('R-04b 申請人還沒有 roles 文件（第一次拿到權限）：部長讀得到（不存在）、核准時新建 roles 成功', async () => {
    await t.withSecurityRulesDisabled(async c => { await c.firestore().doc('roles/fresh').delete(); });
    await seedReq('fresh');
    await assertSucceeds(db('adm').doc('roles/fresh').get());
    await assertSucceeds(commit(db('adm'), await decide('adm', 'fresh', 'approved')));
    assert.deepEqual((await readDoc(t, 'roles/fresh')).depts, { rights: 'editor' });
  });
  it('R-04c 最後一個部門（水果部）的部長審申請：同樣成功（規則有運算次數上限，部門順序不能影響結果）', async () => {
    await seedReq('fresh', {}, 'fruit');
    await assertSucceeds(db('fruAdm').doc('roles/fresh').get());
    await assertSucceeds(commit(db('fruAdm'), await decide('fruAdm', 'fresh', 'approved', 'fruit')));
    assert.deepEqual((await readDoc(t, 'roles/fresh')).depts, { fruit: 'editor' });
  });
  it('R-05 部長拒絕本部門申請：成功；沒有角色寫入', async () => {
    await seedReq('gen');
    await assertSucceeds(commit(db('adm'), await decide('adm', 'gen', 'rejected')));
    assert.deepEqual((await readDoc(t, 'roles/gen')).depts, {});
  });
  it('R-06 部長不能核准部長申請；不能把人升成 admin；總管理員可以', async () => {
    await seedReq('gen', { rank: 'minister', role: 'admin' });
    await assertFails(commit(db('adm'), await decide('adm', 'gen', 'approved')));
    await assertFails(commit(db('adm'), await decide('adm', 'gen', 'rejected')));
    await assertFails(commit(db('adm'), await decide('adm', 'gen', 'approved', 'rights', { depts: { rights: 'admin' } })));
    await assertSucceeds(commit(db('boss'), await decide('boss', 'gen', 'approved')));
    assert.equal((await readDoc(t, 'roles/gen')).depts.rights, 'admin');
  });
  it('R-07 攻擊：別部門的部長不能審；申請人不能核准自己；一般編輯者不能審', async () => {
    await seedReq('gen');
    await assertFails(commit(db('evAdm'), await decide('evAdm', 'gen', 'approved')));
    await assertFails(commit(db('evAdm'), await decide('evAdm', 'gen', 'rejected')));
    await assertFails(commit(db('gen'), await decide('gen', 'gen', 'approved')));
    await assertFails(commit(db('ed'), await decide('ed', 'gen', 'approved')));
    assert.equal((await readDoc(t, 'roleRequests/gen_rights')).status, 'pending');
  });
  it('R-08 攻擊：部長自己申請別部門、自己的申請自己核准：拒絕；部長不能核准自己的申請', async () => {
    await seedReq('adm', {}, 'events');
    await assertFails(commit(db('adm'), await decide('adm', 'adm', 'approved', 'events')));
    await assertFails(commit(db('evAdm'), await decide('adm', 'adm', 'approved', 'events')));
    await assertSucceeds(commit(db('evAdm'), await decide('evAdm', 'adm', 'approved', 'events')));
  });
  it('R-09 攻擊：核准同批夾帶其他改動（升 super、順便給別的部門、動既有角色、沒同批寫 roles）：拒絕', async () => {
    await seedReq('ed');
    await assertFails(commit(db('adm'), await decide('adm', 'ed', 'approved', 'rights', { super: true })));
    await seedReq('gen');
    await assertFails(commit(db('adm'), await decide('adm', 'gen', 'approved', 'rights', { depts: { rights: 'editor', events: 'editor' } })));
    const w = await decide('adm', 'gen', 'approved'); 
    await assertFails(commit(db('adm'), w.slice(0, 2)));                                                  // 只改申請、沒寫 roles
    await assertFails(commit(db('adm'), w.slice(2)));                                                     // 只寫 roles、申請沒改
    await assertFails(commit(db('adm'), await decide('adm', 'gen', 'approved', 'rights', {}, { role: 'admin' })));
  });
  it('R-10 部長讀申請人的 roles 只限有待審申請的人；沒申請的人、已處理的申請都讀不到', async () => {
    await assertFails(db('adm').doc('roles/gen').get());
    await seedReq('gen');
    await assertSucceeds(db('adm').doc('roles/gen').get());
    await assertFails(db('evAdm').doc('roles/gen').get());
    await assertSucceeds(commit(db('adm'), await decide('adm', 'gen', 'rejected')));
    await assertFails(db('adm').doc('roles/gen').get());
  });
  it('R-11 部長列出申請：只能查自己部門；查全部或別部門：拒絕', async () => {
    await seedReq('gen'); await seedReq('gen2', {}, 'events');
    await assertSucceeds(db('adm').collection('roleRequests').where('deptId', '==', 'rights').where('status', '==', 'pending').get());
    await assertFails(db('adm').collection('roleRequests').where('status', '==', 'pending').get());
    await assertFails(db('adm').collection('roleRequests').where('deptId', '==', 'events').get());
    await assertSucceeds(db('boss').collection('roleRequests').where('status', '==', 'pending').get());
  });
});
