// 秘書處會議編輯（firestore 模式）：會長室開放（grants/meetingEdit）→ 秘書處改各部門標了報告的卡片 → 記成會議紀錄（meetingMinutes）
// 規則：cards 的 meetingEdit()、events 的 meetingEditOfReportedCard()、grants、meetingMinutes（permissions.md 第 5.1i 節）。
// MT-01～MT-12：開關關著、授權過期、不是秘書處、改不該改的欄位、非報告卡片、timeIds、時間事件、版本、授權本身、會議紀錄、刪除中的卡片。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS,
         createCard, editCard, verData, readDoc, audit, auditId, eventData, commit, purgeStartWrites } from './helpers.js';

let t;
const U = { boss: { super: true }, ed: { depts: { rights: 'editor' } }, sec: { depts: { secretariat: 'editor' } },
            seca: { depts: { secretariat: 'admin' } }, ev: { depts: { events: 'editor' } }, pres: { depts: { president: 'admin' } },
            vw: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);
const HOUR = 3600e3;
const grant = ms => seed(t, d => d.doc('grants/meetingEdit').set({ until: TS.fromMillis(Date.now() + ms), by: '會長', at: TS.now(), rev: 1, updatedAt: TS.now(), updatedBy: 'boss' }));
const BLK = (n = 1) => ({ id: Array.from({ length: n }, (_, i) => 'b' + (i + 1)), text: Array.from({ length: n }, (_, i) => '第' + (i + 1) + '行'),
  check: Array(n).fill(null), time: Array(n).fill(null) });
// 權益部的報告卡片 r1（一個時間事件 r1_t1，內容第二行是那個時間）、非報告卡片 n1（一個時間事件 n1_t1）
async function setup() {
  const x = db('ed');
  for (const [id, report] of [['r1', true], ['n1', false]]) {
    const b = x.batch(), te = `${id}_t1`;
    const c = { deptId: 'rights', title: '卡片', blocks: { id: ['b1', 'b2'], text: ['第一行', '時間'], check: [null, null], time: [null, te] },
      timeIds: [te], issueId: null, staff: ['uidA'], labels: [], links: [], report, state: 'open', doneAt: null, deletedAt: null, deletedBy: null,
      order: 1000, version: 1, createdAt: NOW(), createdBy: 'ed', updatedAt: NOW(), updatedBy: 'ed' };
    b.set(x.doc(`cards/${id}`), c);
    b.set(x.doc(`cards/${id}/versions/1`), verData('ed', id, c));
    b.set(x.doc(`events/${te}`), eventData('ed', id, { blockId: 'b2' }));
    await b.commit();
  }
  // 別的部門（活動部）的時間事件，給 timeIds 攻擊用
  await seed(t, d => d.doc('events/events__x1').set({ ...eventData('ev', null, { deptId: 'events', cardId: 'events__c9' }), updatedAt: TS.now() }));
}
// 秘書處的會議編輯：只改名稱與內容（version +1＋同批新建那一版）
const meet = async (u, id, patch = {}, vo = {}) => editCard(db(u), u, id, await readDoc(t, `cards/${id}`), { title: '秘書處改', ...patch }, vo);
// 改時間事件的時間與地點（rev +1）
const evEdit = async (u, id, patch = {}) => { const cur = await readDoc(t, `events/${id}`);
  return db(u).doc(`events/${id}`).set({ ...cur, place: '會議室', start: TS.fromMillis(Date.UTC(2026, 10, 24)), end: TS.fromMillis(Date.UTC(2026, 10, 24)),
    startRaw: '2026-11-24', endRaw: '2026-11-24', rev: cur.rev + 1, updatedAt: NOW(), updatedBy: u, ...patch }); };

describe('MT 秘書處會議編輯', () => {
  it('MT-01 開關關著（沒有授權文件）：秘書處改報告卡片、改它的時間事件都被拒絕', async () => {
    await setup();
    await assertFails(meet('sec', 'r1'));
    await assertFails(evEdit('sec', 'r1_t1'));
  });
  it('MT-02 授權過期（until 已過）：拒絕；授權有效：秘書處編輯者、管理員都可以改名稱、內容、時間事件的時間與地點', async () => {
    await setup();
    await grant(-1000);
    await assertFails(meet('sec', 'r1'));
    await assertFails(evEdit('sec', 'r1_t1'));
    await grant(HOUR);
    await assertSucceeds(meet('sec', 'r1', { blocks: { id: ['b1', 'b2', 'b3'], text: ['第一行改', '時間', '新的一行'], check: [null, null, null], time: [null, 'r1_t1', null] } }));
    await assertSucceeds(meet('seca', 'r1', { title: '管理員改' }));
    await assertSucceeds(evEdit('sec', 'r1_t1'));
    const c = await readDoc(t, 'cards/r1');
    assert.equal(c.version, 3); assert.equal(c.updatedBy, 'seca'); assert.deepEqual(c.staff, ['uidA']);
  });
  it('MT-03 不是秘書處：活動部編輯者、會長室管理員、一般登入者、未登入、被撤掉秘書處角色的人都被拒絕', async () => {
    await setup(); await grant(HOUR);
    for (const u of ['ev', 'pres', 'vw']) { await assertFails(meet(u, 'r1')); await assertFails(evEdit(u, 'r1_t1')); }
    const cur = await readDoc(t, 'cards/r1');
    await assertFails(anon(t).doc('cards/r1').set({ ...cur, title: 'x', version: 2 }));
    await seed(t, d => d.doc('roles/sec').update({ depts: {} }));                       // 撤權立刻生效
    await assertFails(meet('sec', 'r1'));
    await assertFails(evEdit('sec', 'r1_t1'));
  });
  it('MT-04 改不該改的欄位：deptId、staff、state、report、labels、links、issueId、order、touched、createdBy 一律拒絕', async () => {
    await setup(); await grant(HOUR);
    const bad = [{ deptId: 'events' }, { staff: ['secUid'] }, { staff: [] }, { state: 'done', doneAt: NOW() }, { report: false },
      { labels: ['l1'] }, { links: [{ id: 'k1', name: 'x', url: 'https://example.com', color: '#112233' }] }, { issueId: 'rights__i1' },
      { order: 1 }, { touched: ['2026-11-20'] }, { createdBy: 'sec' }];
    for (const p of bad) await assertFails(meet('sec', 'r1', p));
    await assertSucceeds(meet('sec', 'r1'));                                             // 對照：只改名稱可以
  });
  it('MT-05 非報告卡片：秘書處改卡片或它的時間事件都被拒絕；也不能把卡片改成報告', async () => {
    await setup(); await grant(HOUR);
    await assertFails(meet('sec', 'n1'));
    await assertFails(meet('sec', 'n1', { report: true }));
    await assertFails(evEdit('sec', 'n1_t1'));
  });
  it('MT-06 timeIds 不能改：加進別的部門或別張卡片的時間事件、加不存在的 ID、拿掉一個（事件還在或不在）都被拒絕', async () => {
    await setup(); await grant(HOUR);
    await assertFails(meet('sec', 'r1', { timeIds: ['r1_t1', 'events__x1'] }));
    await assertFails(meet('sec', 'r1', { timeIds: ['r1_t1', 'n1_t1'] }));
    await assertFails(meet('sec', 'r1', { timeIds: ['r1_t1', 'nope'] }));
    await assertFails(meet('sec', 'r1', { timeIds: [], blocks: BLK(1) }));
    await seed(t, d => d.doc('events/r1_t1').delete());                                   // 事件已經不在
    await assertFails(meet('sec', 'r1', { timeIds: [], blocks: BLK(1) }));
    assert.deepEqual((await readDoc(t, 'cards/r1')).timeIds, ['r1_t1']);
  });
  it('MT-07 時間事件：秘書處不能新建、刪除，不能改 deptId、cardId、visibility、blockId；只能改時間、地點、名稱、寫進母議題', async () => {
    await setup(); await grant(HOUR);
    const x = db('sec');
    await assertFails(x.doc('events/r1_t9').set(eventData('sec', 'r1', { blockId: null })));
    await assertFails(x.doc('events/r1_t1').delete());
    for (const p of [{ deptId: 'events' }, { cardId: 'n1' }, { visibility: 'public' }, { blockId: 'b1' }, { rev: 5 }]) await assertFails(evEdit('sec', 'r1_t1', p));
    await assertSucceeds(evEdit('sec', 'r1_t1', { label: '開會', toIssue: true }));
  });
  it('MT-08 版本：不建版本、版本內容跟卡片不同、版本的作者是別人、沿用舊版本號，都被拒絕', async () => {
    await setup(); await grant(HOUR);
    await assertFails(meet('sec', 'r1', {}, null));
    await assertFails(meet('sec', 'r1', {}, { title: '不一樣' }));
    await assertFails(meet('sec', 'r1', {}, { by: 'ed' }));
    const cur = await readDoc(t, 'cards/r1');
    await assertFails(editCard(db('sec'), 'sec', 'r1', cur, { title: 'x', version: 1 }));
  });
  it('MT-09 授權本身：秘書處、會長室管理員、一般登入者都不能開；總管理員開超過 7 天或不寫稽核被拒絕；總管理員開到今天結束、再關閉（until＝現在）可以', async () => {
    const w = (u, until, rev = 1, withAudit = true) => { const x = db(u), b = x.batch();
      b.set(x.doc('grants/meetingEdit'), { until, by: u, at: NOW(), rev, updatedAt: NOW(), updatedBy: u });
      if (withAudit) b.set(x.doc(auditId('grants', 'meetingEdit', rev)), audit('grants', 'meetingEdit', rev, u, { action: 'open' }));
      return b.commit(); };
    const today = TS.fromMillis(Date.now() + 6 * HOUR);
    for (const u of ['sec', 'seca', 'pres', 'vw']) await assertFails(w(u, today));
    await assertFails(w('boss', TS.fromMillis(Date.now() + 8 * 24 * HOUR)));
    await assertFails(w('boss', today, 1, false));
    await assertSucceeds(w('boss', today));
    await assertSucceeds(w('boss', NOW(), 2));                                           // 關閉：到期時間＝寫入的那一刻
    await setup();
    await assertFails(meet('sec', 'r1'));                                                 // 關閉後秘書處就不能改
  });
  it('MT-10 會議紀錄：秘書處編輯者能寫、總管理員能讀；其他部門編輯者、會長室、一般登入者、未登入都不能讀寫', async () => {
    const mn = { date: '2026-11-24', items: [{ id: 'mn1', date: '2026-11-24', by: ['秘書處'], items: [] }], deptId: 'secretariat' };
    await assertSucceeds(db('sec').doc('meetingMinutes/2026-11-24').set(mn));
    await assertSucceeds(db('boss').doc('meetingMinutes/2026-11-24').get());
    for (const u of ['ed', 'ev', 'pres', 'vw']) {
      await assertFails(db(u).doc('meetingMinutes/2026-11-24').get());
      await assertFails(db(u).doc('meetingMinutes/2026-11-25').set(mn));
    }
    await assertFails(anon(t).doc('meetingMinutes/2026-11-24').get());
    await assertFails(db('sec').doc('meetingMinutes/2026-11-24').delete());
  });
  it('MT-11 刪除中（purging）的報告卡片：秘書處不能改', async () => {
    await setup(); await grant(HOUR);
    await commit(db('ed'), purgeStartWrites(await readDoc(t, 'cards/r1'), 'ed', 'r1'));
    await assertFails(meet('sec', 'r1'));
  });
  it('MT-12 部門編輯者自己照常編輯（不受會議授權影響）', async () => {
    await setup();
    await assertSucceeds(editCard(db('ed'), 'ed', 'r1', await readDoc(t, 'cards/r1'), { title: '部門自己改', staff: ['uidB'] }));
  });
});
