// 06 對外公開讀取：看板內容（卡片、議題、完成紀錄、週報、標籤、時間事件、部門設定、部門名稱）不用登入就讀得到；
// 帳號、信箱、角色、邀請、申請、舊身分、名單、版本歷史、稽核、秘書處會議資料、預約相關一律不公開；未登入不能寫任何東西。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS, createCard, purgeStartData } from './helpers.js';

let t;
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  await seedRole(t, 'ed', { depts: { rights: 'editor' } });
  await seedRole(t, 'boss', { super: true });
  await seed(t, async d => {
    await d.doc('users/ed').set({ email: 'ed@example.test', createdAt: TS.now(), lastLoginAt: TS.now() });
    await d.doc('profiles/ed').set({ displayName: 'ed' });
    await d.doc('deptMembers/rights__ed').set({ deptId: 'rights', uid: 'ed', role: 'editor', at: TS.now() });
    await d.doc('legacyIdentities/rights__m1').set({ deptId: 'rights', name: '舊', oldRole: 'member', createdAt: '', claimedBy: null, rev: 1 });
    await d.doc('invitations/' + 'a'.repeat(64)).set({ deptId: 'rights', role: 'editor', status: 'active', rev: 1 });
    await d.doc('roleRequests/ed_rights').set({ uid: 'ed', deptId: 'rights', role: 'editor', status: 'pending', rev: 1 });
    await d.doc('auditLogs/x').set({ col: 'roles' });
    await d.doc('meetingMinutes/2026-11-20').set({ text: '紀錄' });
    await d.doc('issues/i1').set({ deptId: 'rights', title: '議題', rev: 1 });
    await d.doc('weeks/w1').set({ deptId: 'rights', date: '2026-11-20', text: '週報' });
    await d.doc('labels/l1').set({ deptId: 'rights', name: '標籤' });
    await d.doc('events/e1').set({ deptId: 'rights', cardId: 'c1', visibility: 'internal', scope: 'dept', start: TS.now(), end: TS.now(), allDay: false });
  });
  await createCard(google(t, 'ed'), 'ed', 'c1');
  await createCard(google(t, 'ed'), 'ed', 'c2', { state: 'open' });
});

describe('N6-01～N6-08 對外公開讀取', () => {
  it('N6-01 未登入讀得到：部門、org、卡片、議題、週報、標籤、時間事件、部門設定（get 與帶條件的 list）', async () => {
    const a = anon(t);
    for (const p of ['cards/c1', 'issues/i1', 'weeks/w1', 'labels/l1', 'events/e1']) await assertSucceeds(a.doc(p).get());
    await assertSucceeds(a.collection('cards').where('deptId', '==', 'rights').where('state', 'in', ['open', 'done']).get());
    await assertSucceeds(a.collection('issues').where('deptId', '==', 'rights').get());
    await assertSucceeds(a.collection('events').where('deptId', '==', 'rights').get());
    await assertSucceeds(a.collection('departments').get());
  });
  it('N6-02 未登入讀不到：帳號、信箱、角色、邀請、申請、名單、舊身分、名稱、稽核、版本歷史、會議紀錄', async () => {
    const a = anon(t);
    for (const p of ['users/ed', 'roles/ed', 'invitations/' + 'a'.repeat(64), 'roleRequests/ed_rights', 'deptMembers/rights__ed', 'legacyIdentities/rights__m1',
                     'profiles/ed', 'auditLogs/x', 'meetingMinutes/2026-11-20', 'cards/c1/versions/1'])
      await assertFails(a.doc(p).get());
    for (const c of ['users', 'roles', 'invitations', 'roleRequests', 'deptMembers', 'legacyIdentities', 'profiles', 'auditLogs', 'meetingMinutes'])
      await assertFails(a.collection(c).get());
    await assertFails(a.collectionGroup('versions').get());
  });
  it('N6-03 永久刪除中的卡片不公開：get 與沒有 state 條件的 list 拒絕', async () => {
    const cur = (await google(t, 'ed').doc('cards/c2').get()).data();
    await seed(t, d => d.doc('cards/c2').update({ state: 'purging' }));
    await assertFails(anon(t).doc('cards/c2').get());
    await assertFails(anon(t).collection('cards').where('deptId', '==', 'rights').get());
    await assertSucceeds(anon(t).collection('cards').where('deptId', '==', 'rights').where('state', 'in', ['open', 'done']).get());
    assert.ok(cur);
  });
  it('N6-04 未登入不能寫：卡片、議題、週報、標籤、時間事件、部門設定、帳號相關；刪除也不行', async () => {
    const a = anon(t);
    for (const p of ['cards/c1', 'issues/i1', 'weeks/w1', 'labels/l1', 'events/e1', 'deptSettings/rights', 'users/x', 'roles/x', 'roleRequests/x_rights', 'deptMembers/rights__x'])
      await assertFails(a.doc(p).set({ deptId: 'rights', title: 'x' }));
    for (const p of ['cards/c1', 'issues/i1', 'weeks/w1', 'labels/l1', 'events/e1']) await assertFails(a.doc(p).delete());
  });
  it('N6-05 沒有角色的登入者仍然不能寫看板內容', async () => {
    const nb = google(t, 'nb');
    await assertFails(nb.doc('issues/i2').set({ deptId: 'rights', title: 'x', rev: 1 }));
    await assertFails(createCard(nb, 'nb', 'c9'));
  });
  it('N6-06 internal 的時間事件不能帶 title、summary（整個集合公開，不能夾帶文字）', async () => {
    const ed = google(t, 'ed');
    const ev = o => ({ deptId: 'rights', cardId: 'c1', visibility: 'internal', scope: 'dept', start: TS.now(), end: TS.now(), allDay: false, rev: 1, updatedAt: NOW(), updatedBy: 'ed', ...o });
    await assertFails(ed.doc('events/e9').set(ev({ title: '祕密', summary: '內文' })));
    await assertFails(ed.doc('events/e9').set(ev({ summary: '內文' })));
  });
  it('N6-07 登入帳號讀不到別人的 users（信箱）；profiles 仍要登入', async () => {
    await assertFails(google(t, 'nb').doc('users/ed').get());
    await assertSucceeds(google(t, 'nb').doc('profiles/ed').get());
  });
});
