// 跨部門共編（卡片的 invite／ask／depts）：主要部門邀請、對方部門管理員同意；或對方申請、主要部門管理員同意。
// 共編的編輯者只能改名稱與逐行內容；不能完成、刪除、改時間、分享。會長（總管理員）用同一套。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seedRole, seedDepts, seed, assertSucceeds, assertFails, NOW, readDoc, cardData, verData, createCard, purgeStartWrites, commit } from './helpers.js';

let t;
const U = { boss: { super: true }, rtAdm: { depts: { rights: 'admin' } }, rtEd: { depts: { rights: 'editor' } },
            evAdm: { depts: { events: 'admin' } }, evEd: { depts: { events: 'editor' } }, mkAdm: { depts: { marketing: 'admin' } }, gen: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
  await seed(t, async db => { const c = cardData('rtAdm'); const b = db.batch(); b.set(db.doc('cards/c1'), c); b.set(db.doc('cards/c1/versions/1'), verData('rtAdm', 'c1', c)); await b.commit(); });
});
const db = u => google(t, u);
const share = (u, cur, p) => db(u).doc('cards/c1').set({ ...cur, co: { ...(cur.co || {}), ...p }, updatedAt: NOW(), updatedBy: u });
const setCo = async (o) => { await seed(t, d => d.doc('cards/c1').update(Object.fromEntries(Object.entries(o).map(([k, v]) => [k === 'state' ? k : `co.${k}`, v])))); };
const cur = () => readDoc(t, 'cards/c1');
const edit = async (u, p) => { const c = await cur(); const n = { ...c, ...p, version: c.version + 1, updatedAt: NOW(), updatedBy: u };
  const x = db(u), b = x.batch(); b.set(x.doc('cards/c1'), n); b.set(x.doc(`cards/c1/versions/${n.version}`), verData(u, 'c1', { ...n, version: n.version })); return b.commit(); };

describe('CO-01～CO-04 主要部門邀請、對方同意', () => {
  it('CO-01 主要部門管理員與總管理員能邀請；編輯者、別部門、沒角色不能', async () => {
    await assertSucceeds(share('rtAdm', await cur(), { invite: ['events'] }));
    await setCo({ invite: [] });
    await assertSucceeds(share('boss', await cur(), { invite: ['events'] }));
    await setCo({ invite: [] });
    for (const u of ['rtEd', 'evAdm', 'gen']) await assertFails(share(u, await cur(), { invite: ['events'] }));
    await assertFails(db('gen').doc('cards/c1').get().then(() => share('gen', {}, { invite: ['events'] })));
  });
  it('CO-02 邀請只能一次一個、只能是真的部門、不能邀自己部門、不能直接塞進 depts', async () => {
    const c = await cur();
    await assertFails(share('rtAdm', c, { invite: ['events', 'marketing'] }));
    await assertFails(share('rtAdm', c, { invite: ['nope'] }));
    await assertFails(share('rtAdm', c, { invite: ['rights'] }));
    await assertFails(share('rtAdm', c, { depts: ['events'] }));
    await assertFails(share('rtAdm', c, { invite: ['events'], depts: ['marketing'] }));
    await assertFails(share('rtAdm', c, { invite: 'events' }));
  });
  it('CO-03 被邀請的部門管理員同意＝移到 depts；編輯者、別的部門、邀請的人自己都不能替它同意', async () => {
    await setCo({ invite: ['events'] });
    const c = await cur();
    for (const u of ['evEd', 'mkAdm', 'rtAdm', 'gen']) await assertFails(share(u, c, { invite: [], depts: ['events'] }));
    await assertFails(share('evAdm', c, { invite: [], depts: ['marketing'] }));          // 同意的不是自己部門
    await assertFails(share('evAdm', c, { invite: ['events'], depts: ['events'] }));     // 沒有從 invite 拿掉
    await assertSucceeds(share('evAdm', c, { invite: [], depts: ['events'] }));
  });
  it('CO-04 對方拒絕、主要部門收回、共編後退出或收回', async () => {
    await setCo({ invite: ['events', 'marketing'] });
    await assertSucceeds(share('evAdm', await cur(), { invite: ['marketing'] }));
    await assertFails(share('evAdm', await cur(), { invite: [] }));                        // 不能順手拿掉別人的
    await assertSucceeds(share('rtAdm', await cur(), { invite: [] }));
    await setCo({ depts: ['events'] });
    await assertSucceeds(share('evAdm', await cur(), { depts: [] }));                      // 退出
    await setCo({ depts: ['events'] });
    await assertSucceeds(share('rtAdm', await cur(), { depts: [] }));                      // 收回
    await setCo({ depts: ['events'] });
    await assertFails(share('mkAdm', await cur(), { depts: [] }));
  });
});

describe('CO-05～CO-07 對方申請、主要部門同意（會長同一套）', () => {
  it('CO-05 別部門管理員能申請；會長（總管理員）以 president 申請；編輯者、冒名申請不行', async () => {
    await assertSucceeds(share('evAdm', await cur(), { ask: ['events'] }));
    await setCo({ ask: [] });
    await assertSucceeds(share('boss', await cur(), { ask: ['president'] }));
    await setCo({ ask: [] });
    await assertFails(share('evEd', await cur(), { ask: ['events'] }));
    await assertFails(share('evAdm', await cur(), { ask: ['marketing'] }));
    await assertFails(share('evAdm', await cur(), { ask: ['rights'] }));
    await assertFails(share('boss', await cur(), { ask: ['marketing'] }));                 // 總管理員只代表 president
    await assertFails(share('evAdm', await cur(), { ask: ['events'], depts: ['events'] }));
  });
  it('CO-06 只有主要部門管理員（或總管理員）能同意申請；申請的人自己不行', async () => {
    await setCo({ ask: ['events'] });
    const c = await cur();
    for (const u of ['evAdm', 'rtEd', 'mkAdm', 'gen']) await assertFails(share(u, c, { ask: [], depts: ['events'] }));
    await assertSucceeds(share('rtAdm', c, { ask: [], depts: ['events'] }));
  });
  it('CO-07 申請被拒絕或撤回', async () => {
    await setCo({ ask: ['events'] });
    await assertSucceeds(share('evAdm', await cur(), { ask: [] }));
    await setCo({ ask: ['events'] });
    await assertSucceeds(share('rtAdm', await cur(), { ask: [] }));
  });
});

describe('CO-08～CO-12 共編的編輯者', () => {
  beforeEach(async () => { await setCo({ depts: ['events'] }); });
  it('CO-08 共編部門的編輯者與管理員只能改名稱與內容（同批新版本）', async () => {
    const blocks = { id: ['b1', 'b2'], text: ['第一行', '新的'], check: [null, false], time: [null, null] };
    await assertSucceeds(edit('evEd', { title: '共編改過', blocks }));
    await assertSucceeds(edit('evAdm', { title: '再改' }));
  });
  it('CO-09 不能完成、刪除、移動、改時間標記或專員標籤、也不能分享給別人', async () => {
    await assertFails(edit('evEd', { state: 'done', doneAt: NOW() }));
    await assertFails(edit('evEd', { report: true }));
    await assertFails(edit('evEd', { staff: ['x'] }));
    await assertFails(edit('evEd', { timeIds: ['t1'] }));
    await assertFails(edit('evEd', { deptId: 'events' }));
    await assertFails(db('evEd').doc('cards/c1').set({ ...(await cur()), order: 5, updatedAt: NOW(), updatedBy: 'evEd' }));
    await assertFails(share('evAdm', await cur(), { depts: ['events', 'marketing'] }));
    await assertFails(share('evAdm', await cur(), { invite: ['marketing'] }));
    const [[p1, d1], [p2, d2]] = purgeStartWrites(await cur(), 'evEd', 'c1');
    await assertFails(commit(db('evEd'), [[p1, d1], [p2, d2]]));
    await assertFails(db('evEd').doc('cards/c1').delete());
  });
  it('CO-10 沒被同意的部門（只邀請、只申請、別的部門、沒角色）改不了', async () => {
    await setCo({ depts: [], invite: ['events'], ask: ['marketing'] });
    for (const u of ['evEd', 'evAdm', 'mkAdm', 'gen']) await assertFails(edit(u, { title: 'x' }));
    await setCo({ depts: ['events'], invite: [], ask: [] });
    for (const u of ['mkAdm', 'gen']) await assertFails(edit(u, { title: 'x' }));
    await assertFails(db('gen').doc('cards/c1').update({ title: 'x' }));
  });
  it('CO-11 被收回之後立刻不能再改；已完成的卡片不能共編改', async () => {
    await setCo({ depts: [] });
    await assertFails(edit('evEd', { title: 'x' }));
    await setCo({ depts: ['events'], state: 'done' });
    await assertFails(edit('evEd', { title: 'x' }));
  });
  it('CO-12 主要部門編輯者改內容時不能順手動分享清單；新建卡片不能帶分享清單', async () => {
    await assertFails(edit('rtEd', { co: { depts: ['events', 'marketing'] } }));
    await assertFails(edit('rtEd', { co: { depts: [] } }));
    await assertFails(createCard(db('rtAdm'), 'rtAdm', 'c2', { co: { depts: ['events'] } }));
    await assertSucceeds(createCard(db('rtAdm'), 'rtAdm', 'c3'));
    await assertSucceeds(edit('rtEd', { title: '自己人改' }));
  });
});

describe('CO-13 讀取', () => {
  it('CO-13 條件查詢：登入者查得到共編清單；沒登入查得到卡片（看板本來就公開）', async () => {
    await setCo({ invite: ['events'] });
    const q = d => d.collection('cards').where('co.invite', 'array-contains', 'events').where('state', '==', 'open').get();
    const s = await assertSucceeds(q(db('evAdm')));
    assert.equal(s.size, 1);
    await assertSucceeds(q(anon(t)));
  });
});
