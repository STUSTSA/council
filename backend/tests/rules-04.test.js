// 04 欄位的型別、格式與長度（permissions.md 第 5.1i 節）：
//   F-01～F-08 看板內容（議題、週報、標籤、時間標記、卡片與版本、部門設定）；A-01～A-03 稽核紀錄的欄位；
//   G-01 舊身分的名字、部門與文件 ID；U-01 個人資料的圖片網址；Q-01～Q-04 權限申請每人每個部門一份。
// 原則：新建一律檢查；修改時欄位沒變不重新檢查（04 之前的文件照常能改其他欄位）；合格的值、網頁與遷移寫出來的形狀都要能寫。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS,
         createCard, editCard, cardData, verData, eventData, readDoc, commit, audit, auditId, purgeCard } from './helpers.js';

let t;
const U = { boss: { super: true }, ed: { depts: { rights: 'editor' } }, adm: { depts: { rights: 'admin' } },
            sec: { depts: { secretariat: 'editor' } }, gen: {}, gen2: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);
const S = n => 'x'.repeat(n);
const BAD_DAYS = ['abc', '2026/11/01', '2026-11-1', '2026-11-01 ', ' 2026-11-01', '2026-11-01T10:00', 20261101, ['2026-11-01'], { d: 1 }, true];
const BAD_WHEN = ['abc', '2026-11-01T', '2026-11-01 1:00', '2026-11-01T10:00:0', '2026-11-01T10:00Z', '10:00', 5, ['2026-11-01'], { d: 1 }];
const each = async (list, fn) => { for (const v of list) await fn(v).catch(e => { throw new Error(JSON.stringify(v) + ' → ' + e.message); }); };

// ---------- 議題、週報、標籤 ----------
const issue = (o = {}) => ({ deptId: 'rights', title: '議題', cur: 0, start: '2026-11-01', end: '2026-12-01', startAt: TS.fromMillis(1e12), endAt: TS.fromMillis(1e12 + 1),
  note: '', tags: ['收案', '處理中'], labels: ['rights__l1'], links: [], staff: ['legacy:rights__m1'], markers: [{ id: 'm1', date: '2026-11-05', text: '紀錄', at: 10 }],
  doneAt: null, order: 0, rev: 1, updatedAt: NOW(), updatedBy: 'ed', ...o });
const week = (o = {}) => ({ deptId: 'rights', date: '2026-11-10', text: '本週', auto: false, createdAt: NOW(), updatedAt: NOW(), updatedBy: 'ed', ...o });
const label = (o = {}) => ({ deptId: 'rights', kind: '人', name: '標籤', updatedAt: NOW(), updatedBy: 'ed', ...o });

describe('F-01～F-04 議題、週報、標籤', () => {
  it('F-01 議題新建：網頁與遷移寫出來的形狀可以；期間、結案日期不是固定格式或型別不對：拒絕', async () => {
    const x = db('ed');
    await assertSucceeds(x.doc('issues/rights__ok1').set(issue()));
    await assertSucceeds(x.doc('issues/rights__ok2').set(issue({ start: '', end: '', startAt: null, endAt: null, doneAt: '2026-11-20', markers: [], tags: [] })));
    await assertSucceeds(x.doc('issues/rights__ok3').set(issue({ doneAt: '2026-11-20 09:30' })));
    await assertSucceeds(x.doc('issues/rights__ok4').set({ deptId: 'rights', title: '只有必要欄位', rev: 1, updatedAt: NOW(), updatedBy: 'ed' }));
    await each(BAD_DAYS, v => assertFails(x.doc('issues/rights__b1').set(issue({ start: v }))));
    await each(BAD_DAYS, v => assertFails(x.doc('issues/rights__b2').set(issue({ end: v }))));
    await each(BAD_WHEN, v => assertFails(x.doc('issues/rights__b3').set(issue({ doneAt: v }))));
    await each(['2026-11-01', 5, {}], v => assertFails(x.doc('issues/rights__b4').set(issue({ startAt: v }))));
    await each(['2026-11-01', 5, {}], v => assertFails(x.doc('issues/rights__b5').set(issue({ endAt: v }))));
  });
  it('F-02 議題新建：名稱、說明太長，階段／標籤／專員不是字串陣列或太多，超連結、處理紀錄不是陣列或太多，cur／order 不是數字：拒絕', async () => {
    const x = db('ed'), bad = o => assertFails(x.doc('issues/rights__b').set(issue(o))).catch(e => { throw new Error(JSON.stringify(o).slice(0, 60) + ' → ' + e.message); });
    await bad({ title: S(501) }); await bad({ note: S(20001) }); await bad({ note: 5 }); await bad({ note: ['x'] });
    await bad({ tags: 'abc' }); await bad({ tags: [1, 2] }); await bad({ tags: [{ a: 1 }] }); await bad({ tags: Array(51).fill('a') }); await bad({ tags: [S(5001)] });
    await bad({ labels: 'abc' }); await bad({ labels: Array(101).fill('a') }); await bad({ labels: [S(15001)] });
    await bad({ staff: { a: 1 } }); await bad({ staff: Array(101).fill('a') }); await bad({ staff: [S(15001)] });
    await bad({ links: 'abc' }); await bad({ links: Array(51).fill({ color: '#112233' }) });
    await bad({ markers: 'abc' }); await bad({ markers: Array(301).fill({ id: 'm' }) });
    await bad({ cur: '1' }); await bad({ order: 'a' });
    await assertSucceeds(x.doc('issues/rights__edge').set(issue({ title: S(500), note: S(20000), tags: Array(50).fill('a'), labels: Array(100).fill('a'),
      links: Array(50).fill({ color: '#112233' }), markers: Array(300).fill({ id: 'm' }) })));
  });
  it('F-03 議題修改：04 之前的文件（欄位不合格式）照常能改其他欄位；不合格的欄位只能改成合格的', async () => {
    await seed(t, d => d.doc('issues/rights__old').set({ deptId: 'rights', title: S(600), start: '2026/1/1', end: 5, doneAt: 'x', tags: 'abc', markers: 'x', note: 5,
      rev: 1, updatedAt: TS.now(), updatedBy: 'ed' }));
    const x = db('ed'), cur = await readDoc(t, 'issues/rights__old');
    const next = (rev, o) => ({ ...cur, ...o, rev, updatedAt: NOW(), updatedBy: 'ed' });
    await assertSucceeds(x.doc('issues/rights__old').set(next(2, { order: 3 })));
    await assertFails(x.doc('issues/rights__old').set(next(3, { start: '2026/2/2' })));
    await assertFails(x.doc('issues/rights__old').set(next(3, { tags: 'abcd' })));
    await assertFails(x.doc('issues/rights__old').set(next(3, { title: S(601) })));
    await assertSucceeds(x.doc('issues/rights__old').set(next(3, { order: 3, start: '2026-01-01', end: '2026-02-01', tags: ['a'], title: '短' })));
  });
  it('F-04 週報、標籤：日期格式、內容與名稱長度、型別；04 之前的文件照常能改其他欄位', async () => {
    const x = db('ed');
    await assertSucceeds(x.doc('weeks/rights__w1').set(week()));
    await assertSucceeds(x.doc('weeks/rights__w2').set(week({ date: '', text: S(50000), auto: true })));
    await each(BAD_DAYS, v => assertFails(x.doc('weeks/rights__b').set(week({ date: v }))));
    await assertFails(x.doc('weeks/rights__b').set(week({ text: S(50001) })));
    await assertFails(x.doc('weeks/rights__b').set(week({ auto: 'yes' })));
    await seed(t, d => d.doc('weeks/rights__old').set({ deptId: 'rights', date: 'x', text: 'a', auto: 1, createdAt: TS.now(), updatedAt: TS.now(), updatedBy: 'ed' }));
    const old = await readDoc(t, 'weeks/rights__old');
    await assertSucceeds(x.doc('weeks/rights__old').set({ ...old, text: 'b', updatedAt: NOW(), updatedBy: 'ed' }));
    await assertFails(x.doc('weeks/rights__old').set({ ...old, text: 'b', date: 'y', updatedAt: NOW(), updatedBy: 'ed' }));
    await assertSucceeds(x.doc('weeks/rights__old').set({ ...old, text: 'b', date: '2026-11-01', auto: false, updatedAt: NOW(), updatedBy: 'ed' }));
    await assertSucceeds(x.doc('labels/rights__l1').set(label({ name: S(200), kind: S(20) })));
    await assertFails(x.doc('labels/rights__b').set(label({ name: S(201) })));
    await assertFails(x.doc('labels/rights__b').set(label({ kind: S(21) })));
    await assertFails(x.doc('labels/rights__b').set(label({ kind: 5 })));
  });
});

// ---------- 時間標記 ----------
describe('F-05 時間標記', () => {
  it('F-05 原本輸入的時間文字、標籤、地點、名稱、摘要：格式、長度、型別；04 之前的文件照常能改其他欄位', async () => {
    const x = db('ed'), ev = o => eventData('ed', null, { cardId: null, ...o });
    await assertSucceeds(x.doc('events/rights__e1').set(ev()));
    await assertSucceeds(x.doc('events/rights__e2').set(ev({ startRaw: '2026-11-20T10:00', endRaw: '2026-11-20 12:00:30', label: S(500), place: S(500) })));
    await assertSucceeds(x.doc('events/rights__e3').set(ev({ startRaw: '', endRaw: '' })));
    await each(BAD_WHEN, v => assertFails(x.doc('events/rights__b').set(ev({ startRaw: v }))));
    await each(BAD_WHEN, v => assertFails(x.doc('events/rights__b').set(ev({ endRaw: v }))));
    await assertFails(x.doc('events/rights__b').set(ev({ label: S(501) })));
    await assertFails(x.doc('events/rights__b').set(ev({ label: 5 })));
    await assertFails(x.doc('events/rights__b').set(ev({ place: S(501) })));
    await assertFails(x.doc('events/rights__b').set(ev({ place: ['a'] })));
    await assertFails(x.doc('events/rights__b').set(ev({ toIssue: 'yes' })));
    await assertFails(x.doc('events/rights__b').set(ev({ title: S(501) })));
    await assertFails(x.doc('events/rights__b').set(ev({ summary: S(5001) })));
    await seed(t, d => d.doc('events/rights__old').set({ ...eventData('ed', null, { cardId: null }), startRaw: 'x', endRaw: 5, label: 7, updatedAt: TS.now() }));
    const old = await readDoc(t, 'events/rights__old');
    await assertSucceeds(x.doc('events/rights__old').set({ ...old, place: '會議室', rev: 2, updatedAt: NOW(), updatedBy: 'ed' }));
    await assertFails(x.doc('events/rights__old').set({ ...old, place: '會議室', startRaw: 'y', rev: 3, updatedAt: NOW(), updatedBy: 'ed' }));
    await assertSucceeds(x.doc('events/rights__old').set({ ...old, place: '會議室', startRaw: '2026-11-20', endRaw: '', label: '開會', rev: 3, updatedAt: NOW(), updatedBy: 'ed' }));
  });
});

// ---------- 卡片與版本 ----------
const FULL = { id: Array.from({ length: 50 }, (_, i) => 'b' + i), text: Array.from({ length: 50 }, () => S(1000)), check: Array.from({ length: 50 }, () => false),
  time: Array.from({ length: 50 }, (_, i) => (i < 3 ? `full_t${i + 1}` : null)) };
const LINKS = Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, name: 'n', url: 'https://example.test', color: '#112233' }));
const fullCard = (u, o = {}) => cardData(u, { title: S(500), blocks: FULL, timeIds: ['full_t1', 'full_t2', 'full_t3'], links: LINKS, staff: ['legacy:rights__m1', 'uidA'], labels: ['rights__l1'],
  issueId: 'rights__i1', report: true, round: 2, roundAt: '2026-11-01T10:00', touched: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
  touchedAt: '2026-11-08T09:00', ...o });
function fullWrites(x, u, o = {}, vo = {}, eo = {}) {
  const c = fullCard(u, o), b = x.batch();
  b.set(x.doc('cards/full'), c);
  b.set(x.doc('cards/full/versions/1'), verData(u, 'full', c, vo));
  c.timeIds.forEach((e, i) => b.set(x.doc(`events/${e}`), eventData(u, 'full', { blockId: 'b' + i, updatedBy: u, ...eo })));
  return b.commit();
}
describe('F-06～F-07 卡片與版本', () => {
  it('F-06 卡片新建：專員／標籤／時間標記 ID 不是字串陣列或太多、更新紀錄不是日期陣列、分段與最後更新時刻格式不對、其他欄位型別不對：拒絕', async () => {
    const x = db('ed'), bad = (o, why) => assertFails(createCard(x, 'ed', 'c1', o)).catch(e => { throw new Error((why || JSON.stringify(o).slice(0, 80)) + ' → ' + e.message); });
    await bad({ staff: 'abc' }); await bad({ staff: [1, 2] }); await bad({ staff: [{ a: 1 }] }); await bad({ staff: [S(30001)] }, 'staff 太長');
    await bad({ labels: { a: 1 } }); await bad({ labels: Array(251).fill('a') }, 'labels 太多');
    await bad({ staff: Array(100).fill('a'), labels: Array(151).fill('a') }, '合計太多');
    await each(['abc', ['abc'], ['2026-11-01', 'x'], ['2026-11-01 2026-11-02'], [''], [5], Array(21).fill('2026-11-01'), { a: 1 }], v => bad({ touched: v }));
    await each(BAD_WHEN, v => bad({ roundAt: v }));
    await each(BAD_WHEN, v => bad({ touchedAt: v }));
    await bad({ issueId: 5 }); await bad({ issueId: S(131) }); await bad({ fromEv: ['a'] }); await bad({ fromEv: S(131) });
    await bad({ order: 'a' }); await bad({ round: '2' }); await bad({ doneAt: '2026-11-01' }); await bad({ deletedAt: 'x' }); await bad({ deletedBy: 5 });
    await assertSucceeds(createCard(x, 'ed', 'c1', { roundAt: '', touchedAt: null, touched: [], round: null, fromEv: null }));
    await assertSucceeds(createCard(x, 'ed', 'c2', { staff: Array(100).fill('a'), labels: Array(150).fill('a') }));
    // 版本的時間標記摘要
    const c = cardData('ed'), b = x.batch();
    b.set(x.doc('cards/c3'), c); b.set(x.doc('cards/c3/versions/1'), verData('ed', 'c3', c, { times: Array(101).fill({ id: 'a' }) }));
    await assertFails(b.commit());
    await assertFails(createCard(x, 'ed', 'c3', {}, { times: 'abc' }));
    await assertSucceeds(createCard(x, 'ed', 'c3', {}, { times: Array(100).fill({ id: 'a' }) }));
  });
  it('F-07 卡片修改：改內容時同樣檢查；04 之前的卡片照常能換順序、永久刪除，改內容要先把不合格的欄位改好', async () => {
    const x = db('ed');
    await assertSucceeds(createCard(x, 'ed', 'c1'));
    let cur = await readDoc(t, 'cards/c1');
    await assertFails(editCard(x, 'ed', 'c1', cur, { touched: ['x'] }));
    await assertFails(editCard(x, 'ed', 'c1', cur, { touchedAt: 'x' }));
    await assertFails(editCard(x, 'ed', 'c1', cur, { staff: 'abc' }));
    await assertSucceeds(editCard(x, 'ed', 'c1', cur, { touched: ['2026-11-19'], touchedAt: '2026-11-19T10:00', staff: ['uidA'] }));
    await seed(t, async d => {
      const old = { ...cardData('ed'), touched: 'x', roundAt: 5, staff: 'abc', order: 'a', createdAt: TS.now(), updatedAt: TS.now() };
      await d.doc('cards/old').set(old); await d.doc('cards/old/versions/1').set({ cardId: 'old', deptId: 'rights', version: 1 });
      await d.doc('cards/old2').set(old); await d.doc('cards/old2/versions/1').set({ cardId: 'old2', deptId: 'rights', version: 1 });
    });
    cur = await readDoc(t, 'cards/old');
    await assertSucceeds(x.doc('cards/old').update({ order: 5, updatedAt: NOW(), updatedBy: 'ed' }));
    cur = await readDoc(t, 'cards/old');
    await assertFails(editCard(x, 'ed', 'old', cur, { title: '改名' }));
    await assertSucceeds(editCard(x, 'ed', 'old', cur, { title: '改名', touched: ['2026-11-19'], roundAt: '', staff: [] }));
    await purgeCard(x, 'ed', 'old2');
    assert.equal(await readDoc(t, 'cards/old2'), undefined);
  });
  it('F-08 滿載的卡片（50 行 × 1000 字、10 個超連結、3 個時間、8 天更新紀錄）不超過運算量上限：新建、遷移匯入、編輯者改內容並拿掉 3 個時間、秘書處會議編輯改內容', async () => {
    await assertSucceeds(fullWrites(db('ed'), 'ed'));
    let cur = await readDoc(t, 'cards/full');
    // 內容換新；n＝從前面拿掉幾個時間（同批刪掉事件）；o＝其他一起改的欄位
    const edit = (x, u, cur, n, o = {}) => {
      const keep = cur.timeIds.slice(n), blocks = { ...FULL, text: FULL.text.map(() => S(999)), time: FULL.time.map(v => (keep.includes(v) ? v : null)) };
      const c = { ...cur, ...o, blocks, timeIds: keep, title: S(499), version: cur.version + 1, updatedAt: NOW(), updatedBy: u };
      const b = x.batch(); b.set(x.doc('cards/full'), c); b.set(x.doc(`cards/full/versions/${c.version}`), verData(u, 'full', c));
      cur.timeIds.slice(0, n).forEach(e => b.delete(x.doc(`events/${e}`))); return b.commit();
    };
    await assertSucceeds(edit(db('ed'), 'ed', cur, 3, { links: LINKS.map(l => ({ ...l, name: 'm' })), staff: ['uidB'], touched: [...cur.touched.slice(1), '2026-11-09'], touchedAt: '2026-11-09T09:00' }));
    // 秘書處會議編輯（授權未到期）：只改名稱與內容。滿載的卡片在會議編輯裡同時拿掉時間會超過上限，04 之前就是這樣（不在這次範圍）
    const reset = () => seed(t, async d => { for (const p of ['cards/full', 'cards/full/versions/1', 'cards/full/versions/2']) await d.doc(p).delete(); });
    await reset(); await seed(t, d => d.doc('grants/meetingEdit').set({ until: TS.fromMillis(Date.now() + 3600e3), rev: 1 }));
    await assertSucceeds(fullWrites(db('ed'), 'ed'));
    cur = await readDoc(t, 'cards/full');
    await assertSucceeds(edit(db('sec'), 'sec', cur, 0));
    // 遷移匯入（總管理員、running 的批次）
    await reset(); await seed(t, async d => { for (const e of cur.timeIds) await d.doc(`events/${e}`).delete(); await d.doc('migrations/b1').set({ status: 'running', startedBy: 'boss' }); });
    await assertSucceeds(fullWrites(db('boss'), 'boss', { createdAt: null, createdBy: 'legacy:import', legacyDesc: S(1000), importBatch: 'b1' }, { imported: true, importBatch: 'b1' }, { importBatch: 'b1' }));
  });
});

// ---------- 部門設定 ----------
describe('F-09 部門設定', () => {
  const set = (u, rev, o) => [['deptSettings/rights', { title: '權益部', range: { start: '2026-09', end: '2027-02' }, reportBase: null, docs: [], rev, updatedAt: NOW(), updatedBy: u, ...o }],
    [auditId('deptSettings', 'rights', rev), audit('deptSettings', 'rights', rev, u, { action: 'update', after: { fields: ['title'] } })]];
  it('F-09 名稱長度、甘特圖範圍、週報基準、追蹤與文件的型別與數量；04 之前的文件照常能改其他欄位', async () => {
    await assertSucceeds(commit(db('boss'), set('boss', 1, {})));
    const x = db('adm'), bad = o => assertFails(commit(x, set('adm', 2, o)));
    await bad({ title: S(201) });
    await bad({ range: 'abc' }); await bad({ range: { start: '2026-09-01', end: '2027-02' } }); await bad({ range: { start: '2026-09', end: 5 } }); await bad({ range: { start: '2026-09', end: '2027-02', x: 1 } });
    await bad({ reportBase: 'abc' }); await bad({ reportBase: { date: 'x', issues: {} } }); await bad({ reportBase: { date: '2026-11-01', issues: 'x' } }); await bad({ reportBase: { date: '2026-11-01', issues: {}, x: 1 } });
    await bad({ docs: 'abc' }); await bad({ docs: Array(51).fill({ id: 'd' }) }); await bad({ follows: { a: 1 } }); await bad({ follows: Array(101).fill({ id: 'f' }) });
    await assertSucceeds(commit(x, set('adm', 2, { range: null, reportBase: { date: '2026-11-01', issues: { rights__i1: { cur: 1 } } }, docs: Array(50).fill({ id: 'd' }), follows: Array(100).fill({ id: 'f' }) })));
    await seed(t, d => d.doc('deptSettings/rights').set({ title: S(300), range: 'x', reportBase: 'x', docs: 'x', rev: 5, updatedAt: TS.now(), updatedBy: 'adm' }));
    const old = await readDoc(t, 'deptSettings/rights');
    await assertSucceeds(commit(x, [['deptSettings/rights', { ...old, follows: [], rev: 6, updatedAt: NOW(), updatedBy: 'adm' }], [auditId('deptSettings', 'rights', 6), audit('deptSettings', 'rights', 6, 'adm', { action: 'update', after: { fields: ['follows'] } })]]));
    await assertFails(commit(x, [['deptSettings/rights', { ...old, follows: [], range: 'y', rev: 7, updatedAt: NOW(), updatedBy: 'adm' }], [auditId('deptSettings', 'rights', 7), audit('deptSettings', 'rights', 7, 'adm', { action: 'update' })]]));
  });
});

// ---------- 稽核紀錄 ----------
const reqDoc = (u, o = {}) => ({ uid: u, deptId: 'rights', role: 'editor', note: '', status: 'pending', rev: 1, createdAt: NOW(), updatedAt: NOW(), updatedBy: u, ...o });
const reqAudit = (u, id, rev, o = {}) => ({ col: 'roleRequests', docId: id, rev, action: 'request', actor: u, at: NOW(), before: {}, after: { status: 'pending' }, ref: '', ...o });
const ask = (u, o = {}, ao = {}, dept = 'rights') => { const id = `${u}_${dept}`; return [[`roleRequests/${id}`, reqDoc(u, { deptId: dept, ...o })], [auditId('roleRequests', id, 1), reqAudit(u, id, 1, ao)]]; };
describe('A-01～A-03 稽核紀錄的欄位', () => {
  it('A-01 動作只能是一個英文單字（最多 20 字）、ref 只能是字串（最多 200 字）', async () => {
    const x = db('gen');
    await each(['', 'two words', '中文', 'a-b', S(21), 5, null, ['request'], { a: 1 }], v => assertFails(commit(x, ask('gen', {}, { action: v }))));
    await each([S(201), 5, null, ['a'], { a: 1 }], v => assertFails(commit(x, ask('gen', {}, { ref: v }))));
    await assertSucceeds(commit(x, ask('gen', {}, { action: 'rollingBack', ref: S(200) })));
  });
  it('A-02 有狀態的集合（申請、邀請、預約、遷移）：前後內容只能是狀態，不能多帶欄位', async () => {
    const x = db('gen');
    await assertFails(commit(x, ask('gen', {}, { after: { status: 'pending', more: 'x' } })));
    await assertFails(commit(x, ask('gen', {}, { after: { status: 'pending', more: S(1000) } })));
    await assertFails(commit(x, ask('gen', {}, { before: { more: 'x' } })));
    await assertFails(commit(x, ask('gen', {}, { after: 'pending' })));
    await assertSucceeds(commit(x, ask('gen')));
    const cur = await readDoc(t, 'roleRequests/gen_rights');
    const cancel = ao => [['roleRequests/gen_rights', { ...cur, status: 'cancelled', rev: 2, updatedAt: NOW(), updatedBy: 'gen' }],
      [auditId('roleRequests', 'gen_rights', 2), reqAudit('gen', 'gen_rights', 2, { action: 'cancel', before: { status: 'pending' }, after: { status: 'cancelled' }, ...ao })]];
    await assertFails(commit(x, cancel({ before: { status: 'pending', more: 'x' } })));
    await assertFails(commit(x, cancel({ after: { status: 'cancelled', more: 'x' } })));
    await assertSucceeds(commit(x, cancel({})));
  });
  it('A-03 部門設定、舊身分、會議授權：before 是空的；after 是空的，或部門設定這次改了哪些欄位', async () => {
    const set = (rev, ao) => [['deptSettings/rights', { title: '權益部' + rev, rev, updatedAt: NOW(), updatedBy: 'boss' }], [auditId('deptSettings', 'rights', rev), audit('deptSettings', 'rights', rev, 'boss', { action: 'update', ...ao })]];
    const x = db('boss');
    await assertFails(commit(x, set(1, { before: { title: 'x' } })));
    await assertFails(commit(x, set(1, { after: { other: 'x' } })));
    await assertFails(commit(x, set(1, { after: { fields: ['title', 'other'] } })));
    await assertFails(commit(x, set(1, { after: { fields: 'title' } })));
    await assertFails(commit(x, set(1, { after: { fields: ['title'], more: 'x' } })));
    await assertFails(commit(x, set(1, { after: S(100) })));
    await assertSucceeds(commit(x, set(1, { after: {} })));
    await assertSucceeds(commit(x, set(2, { after: { fields: ['title', 'range', 'reportBase', 'follows', 'docs'] } })));
    const leg = (id, ao) => [[`legacyIdentities/${id}`, { deptId: 'rights', name: '舊', oldRole: 'member', createdAt: '', claimedBy: null, claimedAt: null, rev: 1, updatedAt: NOW(), updatedBy: 'boss' }],
      [auditId('legacyIdentities', id, 1), audit('legacyIdentities', id, 1, 'boss', { action: 'import', ...ao })]];
    await assertFails(commit(x, leg('rights__m1', { after: { fields: ['title'] } })));
    await assertFails(commit(x, leg('rights__m1', { before: { x: 1 } })));
    await assertSucceeds(commit(x, leg('rights__m1', {})));
    const grant = ao => [['grants/meetingEdit', { until: TS.fromMillis(Date.now() + 3600e3), by: 'boss', at: TS.now(), rev: 1, updatedAt: NOW(), updatedBy: 'boss' }],
      [auditId('grants', 'meetingEdit', 1), audit('grants', 'meetingEdit', 1, 'boss', { action: 'import', ...ao })]];
    await assertFails(commit(x, grant({ after: { x: S(100) } })));
    await assertSucceeds(commit(x, grant({})));
  });
});

// ---------- 舊身分 ----------
describe('G-01 舊身分', () => {
  it('G-01 新建：文件 ID 要是「部門＋兩個底線＋英數、底線、連字號」而且部門相符；名字是字串、最多 60 字；舊角色只有 admin／member；createdAt 最多 40 字', async () => {
    const x = db('boss');
    const leg = (id, o = {}) => [[`legacyIdentities/${id}`, { deptId: 'rights', name: '舊身分', oldRole: 'member', createdAt: '2026-11-01 10:00', claimedBy: null, claimedAt: null, rev: 1, updatedAt: NOW(), updatedBy: 'boss', ...o }],
      [auditId('legacyIdentities', id, 1), audit('legacyIdentities', id, 1, 'boss', { action: 'import' })]];
    await each(['rights__a b', 'rights__a.b', 'rights__', 'rights_m1', 'events__m1', 'm1', 'rights__' + S(81)], id => assertFails(commit(x, leg(id))));
    await assertFails(commit(x, leg('rights__m1', { deptId: 'nope' })));
    await assertFails(commit(x, leg('rights__m1', { deptId: 5 })));
    await each([S(61), 5, ['a'], { a: 1 }, null], v => assertFails(commit(x, leg('rights__m1', { name: v }))));
    await each(['super', 'editor', '', 5, null], v => assertFails(commit(x, leg('rights__m1', { oldRole: v }))));
    await each([S(41), 5, { a: 1 }], v => assertFails(commit(x, leg('rights__m1', { createdAt: v }))));
    await assertFails(commit(db('adm'), leg('rights__m1')));
    await assertSucceeds(commit(x, leg('rights__m1', { name: S(60), oldRole: 'admin', createdAt: S(40) })));
    await assertSucceeds(commit(x, leg('events__m-2_x', { deptId: 'events', name: '' })));
    await assertSucceeds(commit(x, leg('rights__' + S(80))));
  });
});

// ---------- 個人資料 ----------
describe('U-01 個人資料', () => {
  it('U-01 圖片網址：沒有、null、或 https 網址（最多 500 字、不含空白）；其他型別、其他開頭、太長：拒絕', async () => {
    const x = db('gen'), p = v => x.doc('profiles/gen').set({ displayName: '小明', ...(v === undefined ? {} : { photoURL: v }), updatedAt: NOW() });
    await assertSucceeds(p(undefined)); await assertSucceeds(p(null));
    await assertSucceeds(p('https://lh3.googleusercontent.com/a/abc=s96-c'));
    await assertSucceeds(p('https://example.test/' + S(479)));   // 剛好 500 字
    await each(['http://example.test/a.png', 'data:image/png;base64,AAAA', 'ftp://example.test/a', 'abc', '', 'https://', 'https://example.test/a b', 'https://example.test/a\nb',
      'https://example.test/' + S(480), 5, true, ['https://example.test/a'], { url: 'https://example.test/a' }], v => assertFails(p(v)));
  });
});

// ---------- 權限申請：每人每個部門一份 ----------
describe('Q-01～Q-04 權限申請每人每個部門一份', () => {
  const upd = (u, cur, o, ao = {}, id = `${u}_rights`) => [[`roleRequests/${id}`, { ...cur, ...o, rev: cur.rev + 1, updatedAt: NOW(), updatedBy: u }],
    [auditId('roleRequests', id, cur.rev + 1), reqAudit(u, id, cur.rev + 1, { before: { status: cur.status }, after: { status: o.status }, ...ao })]];
  const strip = c => { const o = { ...c }; delete o.decidedBy; delete o.decidedAt; return o; };
  it('Q-01 待審中再送一份同部門的申請：拒絕；別的部門可以；每個部門各一份', async () => {
    const x = db('gen');
    await assertSucceeds(commit(x, ask('gen')));
    await assertFails(commit(x, ask('gen')));                                               // 同一份文件已經存在（待審）
    await assertFails(commit(x, ask('gen', { role: 'admin' })));
    const cur = await readDoc(t, 'roleRequests/gen_rights');
    await assertFails(commit(x, upd('gen', cur, { status: 'pending', role: 'admin', createdAt: NOW() }, { before: { status: 'pending' } })));   // 待審 → 待審
    await assertSucceeds(commit(x, ask('gen', {}, {}, 'events')));
    await assertFails(commit(x, [['roleRequests/AbCdEfGhIjKlMnOpQrSt', reqDoc('gen')], [auditId('roleRequests', 'AbCdEfGhIjKlMnOpQrSt', 1), reqAudit('gen', 'AbCdEfGhIjKlMnOpQrSt', 1)]]));
    let n = 0; await seed(t, async d => { n = (await d.collection('roleRequests').where('uid', '==', 'gen').get()).size; });
    assert.equal(n, 2);
  });
  it('Q-02 撤回、被拒絕、已核准之後再申請＝同一份改回待審（rev 加 1、同批稽核、時間重設、不留上一輪的決定）；少一項就拒絕', async () => {
    const x = db('gen');
    await assertSucceeds(commit(x, ask('gen')));
    let cur = await readDoc(t, 'roleRequests/gen_rights');
    await assertSucceeds(commit(x, upd('gen', cur, { status: 'cancelled' }, { action: 'cancel' })));
    cur = await readDoc(t, 'roleRequests/gen_rights');
    const again = (o = {}) => ({ status: 'pending', role: 'admin', note: '再申請', createdAt: NOW(), ...o });
    await assertFails(db('gen').doc('roleRequests/gen_rights').set({ ...cur, ...again(), rev: 3, updatedAt: NOW(), updatedBy: 'gen' }));      // 沒有稽核
    await assertFails(commit(x, upd('gen', cur, again({ createdAt: cur.createdAt }))));                                                       // 時間沒重設
    await assertFails(commit(x, upd('gen', cur, again({ deptId: 'events' }))));                                                               // 換部門
    await assertFails(commit(x, upd('gen', cur, again({ uid: 'gen2' }))));
    await assertFails(commit(x, upd('gen', cur, again({ role: 'super' }))));
    await assertFails(commit(x, upd('gen', cur, again({ note: S(201) }))));
    await assertFails(commit(x, upd('gen', cur, again({ extra: 1 }))));
    await assertFails(commit(db('gen2'), upd('gen2', cur, again(), {}, 'gen_rights')));                                                       // 別人
    await assertFails(commit(db('boss'), upd('boss', cur, again(), {}, 'gen_rights')));
    await assertFails(commit(x, upd('gen', cur, again(), { after: { status: 'approved' } })));
    await assertSucceeds(commit(x, upd('gen', cur, again())));
    cur = await readDoc(t, 'roleRequests/gen_rights');
    assert.equal(cur.rev, 3); assert.equal(cur.status, 'pending'); assert.equal(cur.role, 'admin');
    // 拒絕 → 再申請時上一輪的決定欄位要拿掉
    await assertSucceeds(commit(db('boss'), upd('boss', cur, { status: 'rejected', decidedBy: 'boss', decidedAt: NOW() }, { action: 'reject' }, 'gen_rights')));
    cur = await readDoc(t, 'roleRequests/gen_rights');
    await assertFails(commit(x, upd('gen', cur, again())));                                                                                   // 還帶著 decidedBy／decidedAt
    await assertSucceeds(commit(x, upd('gen', strip(cur), again({ role: 'editor' }))));
    cur = await readDoc(t, 'roleRequests/gen_rights');
    assert.equal(cur.rev, 5); assert.equal(cur.decidedBy, undefined);
  });
  it('Q-03 改回待審的申請照常核准（同批寫角色）；核准之後又再申請（換角色）也照同一套', async () => {
    const x = db('gen'), roleW = (cur, next, rev) => [['roles/gen', { super: false, depts: next, rev, lastVia: 'request', lastRef: 'gen_rights', updatedAt: NOW(), updatedBy: 'boss' }],
      [auditId('roles', 'gen', rev), { col: 'roles', docId: 'gen', rev, action: 'request', actor: 'boss', at: NOW(), before: { super: false, depts: cur }, after: { super: false, depts: next }, ref: 'gen_rights' }]];
    await assertSucceeds(commit(x, ask('gen')));
    let cur = await readDoc(t, 'roleRequests/gen_rights');
    const approve = c => upd('boss', c, { status: 'approved', decidedBy: 'boss', decidedAt: NOW() }, { action: 'approve' }, 'gen_rights');
    await assertSucceeds(commit(db('boss'), [...approve(cur), ...roleW({}, { rights: 'editor' }, 2)]));
    cur = await readDoc(t, 'roleRequests/gen_rights');
    await assertSucceeds(commit(x, upd('gen', strip(cur), { status: 'pending', role: 'admin', createdAt: NOW() })));
    cur = await readDoc(t, 'roleRequests/gen_rights');
    await assertFails(commit(db('boss'), roleW({ rights: 'editor' }, { rights: 'admin' }, 3)));                                               // 沒有同批核准
    await assertSucceeds(commit(db('boss'), [...approve(cur), ...roleW({ rights: 'editor' }, { rights: 'admin' }, 3)]));
    assert.equal((await readDoc(t, 'roles/gen')).depts.rights, 'admin');
  });
  it('Q-04 04 之前的申請（SDK 亂數 ID）：照常撤回、拒絕、核准；不能改回待審', async () => {
    const OLD = 'AbCdEfGhIjKlMnOpQrSt';
    await seed(t, async d => { for (const [id, u] of [[OLD, 'gen'], ['B0000000000000000002', 'gen2']]) await d.doc(`roleRequests/${id}`).set({ uid: u, deptId: 'rights', role: 'editor', note: '', status: 'pending', rev: 1, createdAt: TS.now(), updatedAt: TS.now(), updatedBy: u }); });
    let cur = await readDoc(t, `roleRequests/${OLD}`);
    await assertSucceeds(commit(db('gen'), upd('gen', cur, { status: 'cancelled' }, { action: 'cancel' }, OLD)));
    cur = await readDoc(t, `roleRequests/${OLD}`);
    await assertFails(commit(db('gen'), upd('gen', cur, { status: 'pending', createdAt: NOW() }, {}, OLD)));
    const c2 = await readDoc(t, 'roleRequests/B0000000000000000002');
    await assertSucceeds(commit(db('boss'), upd('boss', c2, { status: 'rejected', decidedBy: 'boss', decidedAt: NOW() }, { action: 'reject' }, 'B0000000000000000002')));
  });
});
