// 05 報告標記每週三（台灣時間）自動失效：卡片多一個 reportAt（標記當下的台灣時間「YYYY-MM-DD HH:mm」）。
// 規則：只有 report 為 true 時才能有、格式固定、改的時候只能往後；寫入權限照舊（本部門編輯者以上，別部門、沒有角色的人不行）。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, seed, seedRole, seedDepts, assertSucceeds, assertFails, cardData, createCard, editCard, readDoc } from './helpers.js';

let t;
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  await seedRole(t, 'ed', { depts: { rights: 'editor' } });
  await seedRole(t, 'ev', { depts: { events: 'editor' } });
  await seedRole(t, 'nb', {});
});
const db = u => google(t, u);
const mk = (id, o) => createCard(db('ed'), 'ed', id, o);
const cur = id => readDoc(t, `cards/${id}`);

describe('N5-50～N5-55 報告標記 reportAt', () => {
  it('N5-50 標記報告時帶 reportAt：允許；舊寫法（report 為 true 沒有 reportAt）照舊允許', async () => {
    await assertSucceeds(mk('c1', { report: true, reportAt: '2026-11-25 10:30' }));
    await assertSucceeds(mk('c2', { report: true }));
    await assertSucceeds(mk('c3', { report: false }));
    assert.equal((await cur('c1')).reportAt, '2026-11-25 10:30');
  });
  it('N5-51 report 不是 true 卻帶 reportAt、格式不對、不是字串：拒絕', async () => {
    await assertFails(mk('c1', { report: false, reportAt: '2026-11-25 10:30' }));
    for (const v of ['2026-11-25', '2026/11/25 10:30', '2026-11-25T10:30', 'x'.repeat(500), 20261125, ' 2026-11-25 10:30'])
      await assertFails(mk('c1', { report: true, reportAt: v }));
  });
  it('N5-52 修改：往後（或相同）允許；往前拒絕（不能讓過期的標記復活）', async () => {
    await mk('c1', { report: true, reportAt: '2026-11-25 10:30' });
    await assertFails(editCard(db('ed'), 'ed', 'c1', await cur('c1'), { reportAt: '2026-11-18 10:30' }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', await cur('c1'), { reportAt: '2026-11-25 10:30' }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', await cur('c1'), { reportAt: '2026-12-02 09:00' }));
    assert.equal((await cur('c1')).reportAt, '2026-12-02 09:00');
  });
  it('N5-53 取消標記（report 改 false、拿掉 reportAt）允許；取消後再標記允許；只把 report 改 false 但留著 reportAt：拒絕', async () => {
    await mk('c1', { report: true, reportAt: '2026-11-25 10:30' });
    await assertFails(editCard(db('ed'), 'ed', 'c1', await cur('c1'), { report: false }));
    const c = await cur('c1'); const { reportAt, ...rest } = c;
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', rest, { report: false }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', await cur('c1'), { report: true, reportAt: '2026-11-26 08:00' }));
  });
  it('N5-54 沒有權限的人、別部門的編輯者改 reportAt：拒絕', async () => {
    await mk('c1', { report: true, reportAt: '2026-11-25 10:30' });
    for (const u of ['ev', 'nb']) await assertFails(editCard(db(u), u, 'c1', await cur('c1'), { reportAt: '2026-12-02 09:00' }));
  });
  it('N5-55 還是不能新增別的欄位', async () => {
    await assertFails(mk('c1', { report: true, reportAtX: '2026-11-25 10:30' }));
  });
});
