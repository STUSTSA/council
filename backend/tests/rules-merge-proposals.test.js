// 會議結論的待合併提案（mergeProposals）：秘書處寫、部門編輯者自己合併。
// MP-01～MP-08：誰能讀、誰能建、欄位與大小、卡片要屬於那個部門、秘書處不能自己標成已合併、部門只能處理自己的、處理過就不能再改、刪除。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS, createCard } from './helpers.js';

let t;
const U = { boss: { super: true }, ed: { depts: { rights: 'editor' } }, sec: { depts: { secretariat: 'editor' } },
            ev: { depts: { events: 'editor' } }, vw: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
  await createCard(google(t, 'ed'), 'ed', 'r1');
});
const db = u => google(t, u);
const P = (o = {}) => ({ deptId: 'rights', cardId: 'r1', kind: 'note', title: '', note: '照原案', meetingDate: '2026-11-21', status: 'pending',
  createdBy: 'sec', createdAt: NOW(), updatedAt: NOW(), updatedBy: 'sec', ...o });
const mk = (u, id = 'p1', o = {}) => db(u).doc(`mergeProposals/${id}`).set(P({ createdBy: u, updatedBy: u, ...o }));
const seedP = (id = 'p1', o = {}) => seed(t, d => d.doc(`mergeProposals/${id}`).set({ ...P({ ...o }), createdAt: TS.now(), updatedAt: TS.now() }));
const upd = (u, id, patch) => db(u).doc(`mergeProposals/${id}`).update({ updatedAt: NOW(), updatedBy: u, ...patch });

describe('MP 待合併提案', () => {
  it('MP-01 讀：秘書處與總管理員讀全部；部門編輯者只讀自己部門的；別部門、一般登入者、未登入都不行', async () => {
    await seedP('p1');
    await assertSucceeds(db('sec').doc('mergeProposals/p1').get());
    await assertSucceeds(db('boss').doc('mergeProposals/p1').get());
    await assertSucceeds(db('ed').doc('mergeProposals/p1').get());
    await assertSucceeds(db('ed').collection('mergeProposals').where('deptId', '==', 'rights').get());
    await assertFails(db('ed').collection('mergeProposals').get());                      // 沒有限定部門的查詢
    await assertFails(db('ev').doc('mergeProposals/p1').get());
    await assertFails(db('vw').doc('mergeProposals/p1').get());
    await assertFails(anon(t).doc('mergeProposals/p1').get());
  });
  it('MP-02 建：只有秘書處編輯者與總管理員；部門編輯者、別部門、一般登入者、未登入被拒絕', async () => {
    await assertSucceeds(mk('sec', 'p1'));
    await assertSucceeds(mk('boss', 'p2'));
    for (const u of ['ed', 'ev', 'vw']) await assertFails(mk(u, 'x' + u));
    await assertFails(anon(t).doc('mergeProposals/xa').set(P()));
  });
  it('MP-03 建的內容：狀態一定是 pending、不能多帶欄位或已處理的欄位、卡片要屬於那個部門、臨時項目沒有 cardId、大小與格式', async () => {
    const bad = [{ status: 'merged' }, { extra: 1 }, { resolvedBy: 'sec', resolvedAt: NOW() }, { createdBy: 'ed' }, { deptId: 'nope' },
      { cardId: 'nope' }, { deptId: 'events' }, { kind: 'x' }, { kind: 'new' }, { cardId: null }, { note: '' }, { note: 'x'.repeat(1001) },
      { title: 'x'.repeat(101) }, { meetingDate: '昨天' }, { createdAt: TS.fromMillis(1000) }];
    for (const [i, o] of bad.entries()) await assertFails(mk('sec', 'b' + i, o));
    await assertSucceeds(mk('sec', 'ok1', { kind: 'new', cardId: null, title: '臨時動議' }));
    await assertSucceeds(mk('sec', 'ok2', { note: 'x'.repeat(1000) }));
  });
  it('MP-04 秘書處不能自己把提案標成已合併或略過，也不能改別的欄位；待合併時可以改標題與結論、可以撤回', async () => {
    await seedP('p1');
    await assertFails(upd('sec', 'p1', { status: 'merged', resolvedBy: 'sec', resolvedAt: NOW() }));
    await assertFails(upd('sec', 'p1', { status: 'dismissed', resolvedBy: 'sec', resolvedAt: NOW() }));
    await assertFails(upd('sec', 'p1', { deptId: 'events' }));
    await assertFails(upd('sec', 'p1', { cardId: 'other' }));
    await assertFails(upd('sec', 'p1', { note: '' }));
    await assertSucceeds(upd('sec', 'p1', { note: '改過的結論', title: '新標題' }));
    await assertSucceeds(upd('sec', 'p1', { status: 'withdrawn', resolvedBy: 'sec', resolvedAt: NOW() }));
  });
  it('MP-05 部門編輯者：只能把自己部門待合併的標成已合併或略過；不能改內容、不能標成別的狀態、別部門不行', async () => {
    await seedP('p1'); await seedP('p2', { deptId: 'events', cardId: null, kind: 'new', title: 'x' });
    await assertFails(upd('ed', 'p1', { note: '偷改' }));
    await assertFails(upd('ed', 'p1', { status: 'withdrawn', resolvedBy: 'ed', resolvedAt: NOW() }));
    await assertFails(upd('ed', 'p1', { status: 'merged' }));                                       // 沒帶處理者
    await assertFails(upd('ed', 'p1', { status: 'merged', resolvedBy: 'sec', resolvedAt: NOW() }));
    await assertFails(upd('ed', 'p2', { status: 'merged', resolvedBy: 'ed', resolvedAt: NOW() }));  // 別部門的
    await assertFails(upd('vw', 'p1', { status: 'merged', resolvedBy: 'vw', resolvedAt: NOW() }));
    await assertSucceeds(upd('ed', 'p1', { status: 'merged', resolvedBy: 'ed', resolvedAt: NOW() }));
  });
  it('MP-06 處理過就定了：已合併、略過、撤回的不能再改（任何人）', async () => {
    await seedP('p1', { status: 'merged' }); await seedP('p2', { status: 'dismissed' });
    for (const [u, id] of [['sec', 'p1'], ['ed', 'p1'], ['boss', 'p1'], ['ed', 'p2'], ['sec', 'p2']])
      await assertFails(upd(u, id, { status: 'pending' }));
    await assertFails(upd('sec', 'p1', { note: 'x' }));
  });
  it('MP-07 刪除：只有總管理員', async () => {
    await seedP('p1');
    for (const u of ['sec', 'ed', 'ev', 'vw']) await assertFails(db(u).doc('mergeProposals/p1').delete());
    await assertSucceeds(db('boss').doc('mergeProposals/p1').delete());
  });
  it('MP-08 這個集合不影響卡片：秘書處不能藉提案改別部門的卡片（卡片規則照舊）', async () => {
    await mk('sec', 'p1');
    const cur = (await db('ed').doc('cards/r1').get()).data();
    await assertFails(db('sec').doc('cards/r1').set({ ...cur, title: '秘書處直接改', version: cur.version + 1, updatedAt: NOW(), updatedBy: 'sec' }));
    assert.equal((await db('ed').doc('cards/r1').get()).data().title, cur.title);
  });
});
