// 02D 獨立審查的修正（permissions.md 第 5.1e 節）：
// S-01～S-04 文件 ID 限制：卡片、時間事件、議題、週報、標籤的文件 ID 只能是英數、底線、連字號（1～120 字）。
//   網頁讀回來時會把 ID 放進畫面的屬性，不限制的話，有部門角色的人用 SDK 建一份 ID 帶引號的文件，就能在總管理員的畫面上執行程式。
// P-01～P-02 中斷的永久刪除：timeIds 裡沒有文件的 ID（中斷過的寫入留下的）可以只從清單拿掉；編輯者刪不存在的時間事件會被拒絕
//   （前端接續清除時要先確認文件在不在，store-write.js 的 resumeUnits）。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW,
         createCard, cardData, verData, eventData, readDoc, commit, purgeStartWrites, purgeCard } from './helpers.js';

let t;
const U = { boss: { super: true }, ed: { depts: { rights: 'editor' } } };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);

/* 攻擊用的 ID：引號＋事件屬性、角括號、空白、太長、非英數、空的部門後綴之外的符號 */
const BAD = ['rights__x" onmouseover="alert(1)', 'rights__<img>', 'rights__a b', 'r'.repeat(121), 'rights__中文', "rights__a'b", 'rights__a.b', 'rights__a&b'];
/* 合法：遷移的 {部門}__{舊 ID}、網頁產生的 ID（e…、g…、t…＋亂數）、剛好 120 字 */
const GOOD = ['rights__e1k2j3', 'secretariat__w_mabc12', 'rights__t0a1b2c3d4e5f', 'rights__x-y_z', 'a'.repeat(120)];

const issue = uid => ({ deptId: 'rights', title: '議題', cur: 0, rev: 1, updatedAt: NOW(), updatedBy: uid });
const week = uid => ({ deptId: 'rights', date: '2026-11-15', text: '週報', auto: false, createdAt: NOW(), updatedAt: NOW(), updatedBy: uid });
const label = uid => ({ deptId: 'rights', kind: '人', name: '學務處', updatedAt: NOW(), updatedBy: uid });
/* 時間事件一定屬於卡片：卡片（合法 ID）的 timeIds 列出這個事件 */
function cardWithEvent(x, uid, cid, eid) {
  const c = cardData(uid, { timeIds: [eid] });
  return commit(x, [[`cards/${cid}`, c], [`cards/${cid}/versions/1`, verData(uid, cid, c)], [`events/${eid}`, eventData(uid, cid)]]);
}

describe('S-01～S-04 文件 ID 限制（02D 審查 P0：防止 ID 帶進畫面屬性造成的跨帳號程式執行）', () => {
  it('S-01 卡片：ID 帶引號、角括號、空白、超過 120 字、非英數：編輯者與總管理員都拒絕；合法 ID 可以', async () => {
    for (const u of ['ed', 'boss']) for (const id of BAD) await assertFails(createCard(db(u), u, id));
    for (const id of GOOD) await assertSucceeds(createCard(db('ed'), 'ed', id));
  });
  it('S-02 時間事件：不合格的 ID（卡片 timeIds 也列了它）拒絕；合法 ID 可以', async () => {
    let k = 0;
    for (const id of BAD) await assertFails(cardWithEvent(db('ed'), 'ed', `c${++k}`, id));
    for (const id of GOOD) await assertSucceeds(cardWithEvent(db('ed'), 'ed', `c${++k}`, id));
  });
  it('S-03 議題、週報、標籤：不合格的 ID 拒絕（含總管理員）；合法 ID 可以', async () => {
    for (const [col, data] of [['issues', issue], ['weeks', week], ['labels', label]]) {
      for (const u of ['ed', 'boss']) for (const id of BAD) await assertFails(db(u).doc(`${col}/${id}`).set(data(u)));
      for (const id of GOOD) await assertSucceeds(db('ed').doc(`${col}/${id}`).set(data('ed')));
    }
  });
  it('S-04 現有資料檔的 ID 全部合格（遷移的 {部門}__{舊 ID}，只讀資料檔）', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const ids = [];
    for (const f of readdirSync(root).filter(f => /^data(-[a-z]+)?\.json$/.test(f))) {
      const s = JSON.parse(readFileSync(path.join(root, f), 'utf8'));
      (s.events || []).forEach(e => { ids.push(e.id); (e.times || []).forEach(x => ids.push(x.id)); });
      for (const k of ['issues', 'labels', 'weeks', 'members']) (s[k] || []).forEach(x => ids.push(x.id));
    }
    assert.ok(ids.length > 0);
    const bad = ids.filter(id => !/^[A-Za-z0-9_-]{1,120}$/.test(`secretariat__${id}`));
    assert.deepEqual(bad, []);
  });
});

describe('P-01～P-02 中斷的永久刪除（02D 審查 P1）', () => {
  it('P-01 timeIds 裡有沒有文件的 ID：清除時只從清單拿掉（不刪）可以；同一批刪存在的事件也可以', async () => {
    const c = cardData('ed', { timeIds: ['rights__ghost', 'rights__t1'] });
    await commit(db('ed'), [['cards/c1', c], ['cards/c1/versions/1', verData('ed', 'c1', c)]]);
    await seed(t, d => d.doc('events/rights__t1').set(eventData('ed', 'c1')));   // 只有 t1 有文件，ghost 是中斷過的寫入留下的
    await commit(db('ed'), purgeStartWrites(await readDoc(t, 'cards/c1'), 'ed', 'c1'));
    const x = db('ed'), b = x.batch();
    b.delete(x.doc('events/rights__t1'));
    b.update(x.doc('cards/c1'), { timeIds: [], updatedAt: NOW(), updatedBy: 'ed' });
    await assertSucceeds(b.commit());
    assert.deepEqual((await readDoc(t, 'cards/c1')).timeIds, []);
  });
  it('P-02 編輯者刪不存在的時間事件：拒絕（所以接續清除前要先確認文件在不在）；總管理員可以', async () => {
    const c = cardData('ed', { timeIds: ['rights__ghost'] });
    await commit(db('ed'), [['cards/c1', c], ['cards/c1/versions/1', verData('ed', 'c1', c)]]);
    await commit(db('ed'), purgeStartWrites(await readDoc(t, 'cards/c1'), 'ed', 'c1'));
    const x = db('ed'), b = x.batch();
    b.delete(x.doc('events/rights__ghost'));
    b.update(x.doc('cards/c1'), { timeIds: [], updatedAt: NOW(), updatedBy: 'ed' });
    await assertFails(b.commit());
    const y = db('ed'), b2 = y.batch();   // 只從清單拿掉：可以，之後整張清完
    b2.update(y.doc('cards/c1'), { timeIds: [], updatedAt: NOW(), updatedBy: 'ed' });
    await assertSucceeds(b2.commit());
    await purgeCard(db('ed'), 'ed', 'c1');
    assert.equal(await readDoc(t, 'cards/c1'), undefined);
    await assertSucceeds(db('boss').doc('events/rights__nothing').delete());
  });
});
