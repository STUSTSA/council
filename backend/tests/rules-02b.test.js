// 02B 卡片刪除紀錄 D-01～D-07（permissions.md 第 5.1c 節）＋權限申請的輸入限制 R-01～R-03（審查發現）：
// 卡片永久刪除後版本也一起消失，所以「開始永久刪除」那一批一定要新建一筆刪除紀錄（誰、何時、卡片標題），
// 不能略過、不能沿用舊的、內容要等於被刪的卡片、事後任何人都不能改或刪；只有總管理員讀得到。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { env, google, anon, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW, TS,
         createCard, editCard, cardData, readDoc, commit, patch,
         purgeCard, purgeNonce, purgeStartData, purgeStartWrites, purgeAudit, purgeAuditId, createCardWithEvents } from './helpers.js';

let t;
const U = { boss: { super: true }, ed: { depts: { rights: 'editor' } }, adm: { depts: { rights: 'admin' } },
            ev: { depts: { events: 'editor' } }, gen: {} };
before(async () => { t = await env(); });
after(async () => { await t.cleanup(); });
beforeEach(async () => {
  await t.clearFirestore();
  await seedDepts(t);
  for (const [u, r] of Object.entries(U)) await seedRole(t, u, r);
});
const db = u => google(t, u);
async function logs() { let v = []; await seed(t, async d => { v = (await d.collection('auditLogs').where('col', '==', 'cards').get()).docs.map(x => ({ id: x.id, ...x.data() })); }); return v; }

describe('D-01～D-07 卡片刪除紀錄', () => {
  it('D-01 正常刪除：開始刪除的同一批寫入紀錄（誰、何時、標題、部門）；卡片刪光後紀錄仍在；總管理員讀得到', async () => {
    await createCardWithEvents(db('ed'), 'ed', 'c1', 4, { title: '迎新茶會' });
    await editCard(db('ed'), 'ed', 'c1', await readDoc(t, 'cards/c1'), { title: '迎新茶會（改期）' });
    const before = Date.now();
    await purgeCard(db('adm'), 'adm', 'c1');
    assert.equal(await readDoc(t, 'cards/c1'), undefined);
    const [l] = await logs();
    assert.equal(l.actor, 'adm');
    assert.equal(l.action, 'purge');
    assert.equal(l.docId, 'c1');
    assert.equal(l.rev, 2);
    assert.deepEqual(l.before, { title: '迎新茶會（改期）', deptId: 'rights', state: 'open' });
    assert.ok(l.at.toMillis() >= before - 5000 && l.at.toMillis() <= Date.now() + 5000, '時間＝伺服器時間');
    assert.equal(l.id, `cards_c1_purge_${l.ref}`);
    await assertSucceeds(db('boss').doc(`auditLogs/${l.id}`).get());
    await assertSucceeds(db('boss').collection('auditLogs').where('col', '==', 'cards').get());
    // 總管理員刪別部門的卡片也留紀錄；已完成的卡片紀錄寫 done
    await createCard(db('ev'), 'ev', 'c2', { deptId: 'events' });
    await editCard(db('ev'), 'ev', 'c2', await readDoc(t, 'cards/c2'), { state: 'done', doneAt: NOW() });
    await purgeCard(db('boss'), 'boss', 'c2');
    const l2 = (await logs()).find(x => x.docId === 'c2');
    assert.equal(l2.actor, 'boss');
    assert.deepEqual(l2.before, { title: '卡片', deptId: 'events', state: 'done' });
  });

  it('D-02 開始刪除卻沒寫紀錄（沒有 purgeLog、有 purgeLog 但同批沒有紀錄、紀錄寫到別的 ID）：拒絕', async () => {
    await createCard(db('ed'), 'ed', 'c1');
    const cur = await readDoc(t, 'cards/c1'), x = db('ed');
    const { purgeLog, ...noLog } = purgeStartData(cur, 'ed');
    await assertFails(x.doc('cards/c1').set(noLog));
    await assertFails(x.doc('cards/c1').set(purgeStartData(cur, 'ed')));
    const n = purgeNonce();
    await assertFails(commit(x, [[`cards/c1`, purgeStartData(cur, 'ed', n)], [purgeAuditId('c1', purgeNonce()), purgeAudit(cur, 'ed', 'c1', n)]]));
    await assertFails(commit(x, [[`cards/c1`, purgeStartData(cur, 'ed', n)], [`auditLogs/cards_c1_${cur.version}`, purgeAudit(cur, 'ed', 'c1', n)]]));
    assert.equal((await readDoc(t, 'cards/c1')).state, 'open');
    await assertSucceeds(commit(x, purgeStartWrites(cur, 'ed', 'c1', n)));
  });

  it('D-03 紀錄內容跟被刪的卡片不符：拒絕', async () => {
    await createCard(db('ed'), 'ed', 'c1', { title: '真正的標題' });
    const cur = await readDoc(t, 'cards/c1'), x = db('ed');
    const bad = [
      { before: { title: '假標題', deptId: 'rights', state: 'open' } },
      { before: { title: '真正的標題', deptId: 'events', state: 'open' } },
      { before: { title: '真正的標題', deptId: 'rights', state: 'done' } },
      { before: { title: '真正的標題', deptId: 'rights', state: 'open', extra: 1 } },
      { after: { state: 'deleted' } },
      { rev: 5 },
      { actor: 'adm' },
      { at: TS.fromMillis(Date.now() - 3600e3) },
      { action: 'delete' },
      { col: 'cardz' },
      { note: '多一個欄位' },
    ];
    for (const p of bad) await assertFails(commit(x, patch(purgeStartWrites(cur, 'ed', 'c1'), 1, p))).catch(e => { throw new Error(JSON.stringify(p) + ' ' + e.message); });
    // 亂數格式不對（太短、含底線）
    for (const n of ['abc', 'a_b_c_d_e_f_g']) await assertFails(commit(x, purgeStartWrites(cur, 'ed', 'c1', n)));
    // 卡片的 deletedBy 寫別人
    await assertFails(commit(x, patch(purgeStartWrites(cur, 'ed', 'c1'), 0, { deletedBy: 'adm' })));
    assert.equal((await logs()).length, 0);
    await assertSucceeds(commit(x, purgeStartWrites(cur, 'ed', 'c1')));
  });

  it('D-04 沿用舊紀錄：同一個卡片 ID 刪掉又重建，再刪時用上次的亂數：拒絕；用新的亂數：成功，兩筆紀錄都在', async () => {
    await createCard(db('ed'), 'ed', 'c1', { title: '第一次' });
    const n1 = purgeNonce();
    await assertSucceeds(commit(db('ed'), purgeStartWrites(await readDoc(t, 'cards/c1'), 'ed', 'c1', n1)));
    await purgeCard(db('ed'), 'ed', 'c1');
    await assertSucceeds(createCard(db('ed'), 'ed', 'c1', { title: '第二次' }));                    // C-12：永久刪除後可以用同 ID 重建
    const cur = await readDoc(t, 'cards/c1');
    await assertFails(db('ed').doc('cards/c1').set(purgeStartData(cur, 'ed', n1)));                // 舊紀錄已存在，不能拿來充數
    await assertFails(commit(db('ed'), purgeStartWrites(cur, 'ed', 'c1', n1)));                    // 也不能覆寫舊紀錄
    await assertSucceeds(commit(db('ed'), purgeStartWrites(cur, 'ed', 'c1')));
    assert.deepEqual((await logs()).map(l => l.before.title).sort(), ['第一次', '第二次']);
  });

  it('D-05 沒有在刪卡片卻寫刪除紀錄（卡片仍在、清除中補寫、卡片不存在、借別張卡片的開始刪除）：拒絕', async () => {
    await createCard(db('ed'), 'ed', 'c1');
    await createCard(db('ed'), 'ed', 'c2');
    const c1 = await readDoc(t, 'cards/c1'), c2 = await readDoc(t, 'cards/c2'), x = db('ed'), n = purgeNonce();
    await assertFails(x.doc(purgeAuditId('c1', n)).set(purgeAudit(c1, 'ed', 'c1', n)));            // 卡片仍是 open
    await assertFails(x.doc(purgeAuditId('nope', n)).set(purgeAudit(c1, 'ed', 'nope', n)));        // 卡片不存在
    await assertSucceeds(commit(x, purgeStartWrites(c1, 'ed', 'c1', n)));
    const n2 = purgeNonce();
    await assertFails(x.doc(purgeAuditId('c1', n2)).set(purgeAudit(c1, 'ed', 'c1', n2)));          // 清除中補寫第二筆
    // c2 開始刪除，卻把紀錄寫成 c1 的（c1 已在刪除中）；或 c2 的 purgeLog 指向 c1 的紀錄
    const n3 = purgeNonce();
    await assertFails(commit(x, [[`cards/c2`, purgeStartData(c2, 'ed', n3)], [purgeAuditId('c1', n3), purgeAudit(c1, 'ed', 'c1', n3)]]));
    await assertFails(x.doc('cards/c2').set(purgeStartData(c2, 'ed', n)));
    // 一般登入者、別部門編輯者替別人的刪除寫紀錄
    for (const u of ['gen', 'ev']) await assertFails(db(u).doc(purgeAuditId('c2', n3)).set(purgeAudit(c2, u, 'c2', n3)));
    assert.equal((await logs()).length, 1);
  });

  it('D-06 刪除紀錄不能改、不能刪（含總管理員）；只有總管理員讀得到', async () => {
    await createCard(db('ed'), 'ed', 'c1');
    await purgeCard(db('ed'), 'ed', 'c1');
    const [l] = await logs(), p = `auditLogs/${l.id}`;
    for (const u of ['ed', 'adm', 'boss']) {
      await assertFails(db(u).doc(p).update({ before: { title: '改掉', deptId: 'rights', state: 'open' } }));
      await assertFails(db(u).doc(p).delete());
    }
    for (const u of ['ed', 'adm', 'ev', 'gen']) {
      await assertFails(db(u).doc(p).get());
      await assertFails(db(u).collection('auditLogs').where('col', '==', 'cards').get());
    }
    await assertFails(anon(t).doc(p).get());
    await assertSucceeds(db('boss').doc(p).get());
  });

  it('D-07 purgeLog 只能在開始刪除時寫：新建卡片帶 purgeLog、編輯卡片時加 purgeLog：拒絕', async () => {
    const x = db('ed'), c = cardData('ed', { purgeLog: purgeNonce() });
    const b = x.batch();
    b.set(x.doc('cards/c1'), c);
    b.set(x.doc('cards/c1/versions/1'), { cardId: 'c1', deptId: 'rights', version: 1, title: c.title, blocks: c.blocks, times: [], state: 'open', by: 'ed', at: NOW(), imported: false });
    await assertFails(b.commit());
    await createCard(x, 'ed', 'c1');
    await assertFails(editCard(x, 'ed', 'c1', await readDoc(t, 'cards/c1'), { purgeLog: purgeNonce() }));
    await assertSucceeds(editCard(x, 'ed', 'c1', await readDoc(t, 'cards/c1'), { title: '改' }));
  });
});

// 審查發現（P0）：申請的文件 ID 會出現在會長室的畫面上。不能讓一般帳號用自訂 ID（例如塞 HTML）建申請；
// 舊身分只能是同部門、存在的那一筆；備註最多 200 字
describe('R-01～R-03 權限申請的輸入限制', () => {
  const req = (u, id, o = {}) => [[`roleRequests/${id}`, { uid: u, deptId: 'rights', role: 'editor', note: '', status: 'pending', rev: 1, createdAt: NOW(), updatedAt: NOW(), updatedBy: u, ...o }],
    [`auditLogs/roleRequests_${id}_1`, { col: 'roleRequests', docId: id, rev: 1, action: 'request', actor: u, at: NOW(), before: {}, after: { status: 'pending' }, ref: '' }]];
  const OK_ID = 'AbCdEfGhIjKlMnOpQrSt';
  it('R-01 申請的文件 ID 不是 SDK 的 20 碼英數字（含 HTML、引號、太短、太長）：拒絕', async () => {
    for (const id of ['q" autofocus onfocus="alert(1)" x="', 'x"><img src=x onerror=alert(1)>', 'short', OK_ID + 'X', 'AbCdEfGhIjKlMnOpQr-t'])
      await assertFails(commit(db('gen'), req('gen', id))).catch(e => { throw new Error(id + ' ' + e.message); });
    await assertSucceeds(commit(db('gen'), req('gen', OK_ID)));
  });
  it('R-02 舊身分：別部門的、不存在的、含斜線的：拒絕；同部門存在的：允許', async () => {
    await seed(t, async d => {
      await d.doc('legacyIdentities/rights__m1').set({ deptId: 'rights', name: '舊', oldRole: 'member', claimedBy: null, rev: 1 });
      await d.doc('legacyIdentities/events__m2').set({ deptId: 'events', name: '舊二', oldRole: 'member', claimedBy: null, rev: 1 });
    });
    const ids = ['A0000000000000000001', 'A0000000000000000002', 'A0000000000000000003', 'A0000000000000000004'];
    await assertFails(commit(db('gen'), req('gen', ids[0], { legacyRef: 'events__m2' })));
    await assertFails(commit(db('gen'), req('gen', ids[1], { legacyRef: 'rights__nope' })));
    await assertFails(commit(db('gen'), req('gen', ids[2], { legacyRef: 'rights__m1/x' })));
    await assertSucceeds(commit(db('gen'), req('gen', ids[3], { legacyRef: 'rights__m1' })));
  });
  it('R-03 備註超過 200 字或不是字串：拒絕', async () => {
    await assertFails(commit(db('gen'), req('gen', 'B0000000000000000001', { note: 'x'.repeat(201) })));
    await assertFails(commit(db('gen'), req('gen', 'B0000000000000000002', { note: { html: '<b>' } })));
    await assertSucceeds(commit(db('gen'), req('gen', 'B0000000000000000003', { note: 'x'.repeat(200) })));
  });
});

