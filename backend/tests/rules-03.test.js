// 03 卡片逐行內容（blocks）的形狀與長度（firestore.rules 的 blocksOk，data-model.md 第 3 節）：L-01～L-11。
// 03 審查（P1-1）：卡片超連結的數量與顏色格式（firestore.rules 的 linksOk）：L-12～L-14。
// blocks＝四個一樣長的陣列 {id, text, check, time}：id 是 safeId 而且不重複、text 每行最多 1000 字而且不能有換行、
// check 是 null／true／false、time 是 null 或這張卡片 timeIds 裡的 ID；最多 50 行。版本的 blocks 等於卡片的 blocks（原有要求）而且一樣檢查形狀。
import { describe, it, before, after, beforeEach } from 'node:test';
import { env, google, seed, seedRole, seedDepts, assertSucceeds, assertFails, NOW,
         createCard, editCard, cardData, verData, eventData, commit, readDoc, purgeCard } from './helpers.js';

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
// 每行 [id, text, check, time] → blocks
const B = (...rows) => ({ id: rows.map(r => r[0]), text: rows.map(r => r[1]), check: rows.map(r => r[2] ?? null), time: rows.map(r => r[3] ?? null) });
const many = n => B(...Array.from({ length: n }, (_, i) => [`b${i}`, `第 ${i} 行`, i % 3 ? null : i % 2 === 0]));
// 卡片＋第 1 版＋時間事件同一批（時間行的 time 指向它）
function cardWithTime(x, uid, cid, blocks, eid = `${cid}_t1`, timeIds = [eid]) {
  const c = cardData(uid, { blocks, timeIds });
  const n = blocks.time.indexOf(eid);
  return commit(x, [[`cards/${cid}`, c], [`cards/${cid}/versions/1`, verData(uid, cid, c)],
    [`events/${eid}`, eventData(uid, cid, { blockId: n >= 0 ? blocks.id[n] : null })]]);
}

describe('L-01～L-11 卡片逐行內容 blocks（03）', () => {
  it('L-01 三種行（純文字、核取、時間＋核取）可以新建、插入一行再存；版本 blocks 不等於卡片的仍然拒絕', async () => {
    const b = B(['a', '純文字'], ['b', '核取', false], ['c', '時間', true, 'c1_t1']);
    await assertSucceeds(cardWithTime(db('ed'), 'ed', 'c1', b));
    const cur = await readDoc(t, 'cards/c1');
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', cur, { blocks: B(['a', '純文字改'], ['n', '插入'], ['b', '核取', true], ['c', '時間', true, 'c1_t1']) }));
    const cur2 = await readDoc(t, 'cards/c1');
    await assertFails(editCard(db('ed'), 'ed', 'c1', cur2, { blocks: B(['a', 'x']) }, { blocks: B(['a', 'y']) }));
  });
  it('L-02 每行最多 1000 字：1000 可以、1001 拒絕（新建與修改）；中文一個字算一個', async () => {
    await assertSucceeds(createCard(db('ed'), 'ed', 'c1', { blocks: B(['a', 'x'.repeat(1000)], ['b', '字'.repeat(1000)]) }));
    await assertFails(createCard(db('ed'), 'ed', 'c2', { blocks: B(['a', 'x'.repeat(1001)]) }));
    await assertFails(createCard(db('ed'), 'ed', 'c3', { blocks: B(['a', 'ok'], ['b', '字'.repeat(1001)]) }));
    const cur = await readDoc(t, 'cards/c1');
    await assertFails(editCard(db('ed'), 'ed', 'c1', cur, { blocks: B(['a', 'ok'], ['b', 'y'.repeat(1001)]) }));
  });
  it('L-03 一行裡不能有換行（不能用換行把超過上限的內容塞進同一行）', async () => {
    await assertFails(createCard(db('ed'), 'ed', 'c1', { blocks: B(['a', '第一行\n第二行']) }));
    await assertFails(createCard(db('ed'), 'ed', 'c2', { blocks: B(['a', 'x'.repeat(900) + '\n' + 'x'.repeat(900)]) }));
    await assertSucceeds(createCard(db('ed'), 'ed', 'c3', { blocks: B(['a', ''], ['b', ''], ['c', '']) }));
  });
  it('L-04 塞 HTML：行 ID、時間 ID 帶 HTML 或引號拒絕；文字內容裡的 HTML 規則照收（畫面一律跳脫，kp1.js 第 8 段）', async () => {
    let k = 0;
    for (const id of ['a"><img src=x onerror=alert(1)>', '<b>', "a'b", 'a b', '中文', '', 'x'.repeat(121)]) {
      await assertFails(createCard(db('ed'), 'ed', `c${++k}`, { blocks: B(['ok', 'x'], [id, 'x']) }));
    }
    await assertFails(cardWithTime(db('ed'), 'ed', 'ch', B(['a', 'x', false, '<img>']), '<img>', ['<img>']));
    await assertSucceeds(createCard(db('ed'), 'ed', 'cok', { blocks: B(['a', '<img src=x onerror=alert(1)>"\'']) }));
  });
  it('L-05 錯型別：陣列長度不一、文字不是字串、check 不是 null／true／false、多欄位、少欄位、不是 map、02D 舊格式新建', async () => {
    const good = () => B(['a', 'x'], ['b', 'y', true]);
    const bad = [
      { ...good(), text: ['x'] },
      { ...good(), check: [null] },
      { ...good(), time: [null, null, null] },
      { ...good(), id: ['a'] },
      { ...good(), text: ['x', 2] },
      { ...good(), check: [null, 'yes'] },
      { ...good(), check: [null, { done: true }] },
      { ...good(), check: [null, 1] },
      { ...good(), time: [null, 7] },
      { ...good(), id: ['a', 7] },
      { ...good(), html: ['<b>'] },
      (() => { const g = good(); delete g.time; return g; })(),
      (() => { const g = good(); delete g.check; return g; })(),
      { id: 'a', text: 'x', check: null, time: null },
      [{ id: 'a', text: 'x', check: null, timeId: null }],
      '第一行',
      null,
    ];
    let k = 0;
    for (const blocks of bad) await assertFails(createCard(db('ed'), 'ed', `c${++k}`, { blocks }));
    await assertFails(createCard(db('boss'), 'boss', 'cboss', { blocks: bad[5] }));   // 總管理員也一樣
  });
  it('L-06 行 ID 重複拒絕（插入、刪除一行時靠 ID 對應勾選與時間）', async () => {
    await assertFails(createCard(db('ed'), 'ed', 'c1', { blocks: B(['a', 'x'], ['a', 'y']) }));
  });
  it('L-07 行數過多：50 行可以、51 行拒絕（新建與修改）', async () => {
    await assertSucceeds(createCard(db('ed'), 'ed', 'c50', { blocks: many(50) }));
    await assertFails(createCard(db('ed'), 'ed', 'c51', { blocks: many(51) }));
    const cur = await readDoc(t, 'cards/c50');
    const plus = { id: [...cur.blocks.id, 'z'], text: [...cur.blocks.text, '第 51 行'], check: [...cur.blocks.check, null], time: [...cur.blocks.time, null] };
    await assertFails(editCard(db('ed'), 'ed', 'c50', cur, { blocks: plus }));
    const less = Object.fromEntries(Object.entries(cur.blocks).map(([k, v]) => [k, v.slice(1)]));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c50', cur, { blocks: less }));
  });
  it('L-08 假的時間 ID：不在卡片 timeIds 裡拒絕（新建、修改、只在版本裡改都不行）', async () => {
    await assertFails(createCard(db('ed'), 'ed', 'c1', { blocks: B(['a', 'x', false, 'rights__t-fake']) }));
    await assertSucceeds(cardWithTime(db('ed'), 'ed', 'c2', B(['a', 'x', false, 'c2_t1'])));
    const cur = await readDoc(t, 'cards/c2');
    await assertFails(editCard(db('ed'), 'ed', 'c2', cur, { blocks: B(['a', 'x', true, 'c9_t1']) }));
    await assertFails(editCard(db('ed'), 'ed', 'c2', cur, { blocks: B(['a', 'x', true, 'c2_t1']) }, { blocks: B(['a', 'x', true, 'c9_t1']) }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c2', cur, { blocks: B(['a', 'x', true, 'c2_t1']) }));
  });
  it('L-09 拿掉時間行：timeIds 同批拿掉、時間事件同批刪掉可以；行還指著它就拒絕', async () => {
    await assertSucceeds(cardWithTime(db('ed'), 'ed', 'c1', B(['a', '純文字'], ['b', '時間', false, 'c1_t1'])));
    const cur = await readDoc(t, 'cards/c1');
    const write = blocks => { const c = { ...cur, blocks, timeIds: [], version: 2, updatedAt: NOW(), updatedBy: 'ed' };
      return commit(db('ed'), [['cards/c1', c], ['cards/c1/versions/2', verData('ed', 'c1', c)], ['events/c1_t1', null, 'delete']]); };
    await assertFails(write(cur.blocks));
    await assertSucceeds(write(B(['a', '純文字'])));
  });
  it('L-10 02D 遷移的舊格式（每行一個物件）：沒改內容的修改（換順序）、永久刪除照常；改內容一定要換成新格式', async () => {
    const old = [{ id: 'rights__c1_L0', text: '舊的一行', check: null, timeId: null }];
    await seed(t, async d => { const c = { ...cardData('seed', { blocks: old }), createdAt: new Date(), updatedAt: new Date() };
      await d.doc('cards/c1').set(c); await d.doc('cards/c1/versions/1').set({ ...verData('seed', 'c1', c), at: new Date() }); });
    const cur = await readDoc(t, 'cards/c1');
    await assertSucceeds(db('ed').doc('cards/c1').update({ order: 5, updatedAt: NOW(), updatedBy: 'ed' }));
    const cur2 = await readDoc(t, 'cards/c1');
    await assertFails(editCard(db('ed'), 'ed', 'c1', cur2, { title: '改名但 blocks 還是舊格式' }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', cur2, { blocks: B(['rights__c1_L0', '舊的一行']) }));
    await seed(t, d => d.doc('cards/c2').set({ ...cardData('seed', { blocks: old }), createdAt: new Date(), updatedAt: new Date() }));
    await seed(t, async d => d.doc('cards/c2/versions/1').set({ ...verData('seed', 'c2', cur), cardId: 'c2', at: new Date() }));
    await assertSucceeds(purgeCard(db('ed'), 'ed', 'c2'));
  });
  it('L-11 永久刪除中不檢查形狀（清 timeIds 時時間行還指著已刪的事件）；滿 50 行＋時間事件同一批可以寫；事件 blockId 帶 HTML 拒絕', async () => {
    await assertSucceeds(cardWithTime(db('ed'), 'ed', 'c1', B(['a', '時間', true, 'c1_t1'])));
    await assertSucceeds(purgeCard(db('ed'), 'ed', 'c1'));
    if (await readDoc(t, 'cards/c1')) throw new Error('卡片沒有刪掉');
    const b = many(50); b.check[49] = false; b.time[49] = 'c5_t1';
    await assertSucceeds(cardWithTime(db('ed'), 'ed', 'c5', b));
    const cur = await readDoc(t, 'cards/c5');
    await assertSucceeds(editCard(db('ed'), 'ed', 'c5', cur, { blocks: { ...cur.blocks, text: cur.blocks.text.map(x => x + '改') } }));
    const c = cardData('ed', { timeIds: ['c6_t1'], blocks: B(['a', 'x', false, 'c6_t1']) });
    await assertFails(commit(db('ed'), [['cards/c6', c], ['cards/c6/versions/1', verData('ed', 'c6', c)], ['events/c6_t1', eventData('ed', 'c6', { blockId: 'a"><img src=x>' })]]));
    await assertSucceeds(commit(db('ed'), [['cards/c6', c], ['cards/c6/versions/1', verData('ed', 'c6', c)], ['events/c6_t1', eventData('ed', 'c6', { blockId: 'a' })]]));
  });
});

// 超連結：顏色放進畫面的 style（03 審查 P1-1），只收 #rrggbb；最多 10 個
const LK = (n, color = i => ['#6a4fd8', '#3d7fe0', '#AbCdEf'][i % 3]) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, name: `連結 ${i}`, url: 'https://example.com/' + i, color: color(i) }));
const EVIL = ['red;position:fixed;inset:0;background:url(https://attacker.invalid/x.png)', '#123456;position:fixed', 'url(https://attacker.invalid/x.png)',
  '#12345', '#1234567', '#12345g', 'red', '', ' #123456', '#123456 ', 7, null, true, ['#123456'], { c: '#123456' }];
describe('L-12～L-14 卡片超連結 links（03 審查 P1-1）', () => {
  it('L-12 最多 10 個：10 個可以、11 個拒絕（新建與修改）；10 個超連結＋50 行＋時間事件同一批不超過運算式上限', async () => {
    await assertSucceeds(createCard(db('ed'), 'ed', 'c10', { links: LK(10) }));
    await assertFails(createCard(db('ed'), 'ed', 'c11', { links: LK(11) }));
    const cur = await readDoc(t, 'cards/c10');
    await assertFails(editCard(db('ed'), 'ed', 'c10', cur, { links: LK(11) }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c10', cur, { links: LK(9) }));
    const b = many(50); b.check[49] = false; b.time[49] = 'c5_t1';
    const c = cardData('ed', { blocks: b, timeIds: ['c5_t1'], links: LK(10) });
    await assertSucceeds(commit(db('ed'), [['cards/c5', c], ['cards/c5/versions/1', verData('ed', 'c5', c)], ['events/c5_t1', eventData('ed', 'c5', { blockId: 'b49' })]]));
    await assertFails(createCard(db('boss'), 'boss', 'cboss', { links: LK(11) }));   // 總管理員也一樣
  });
  it('L-13 顏色注入：分號接新宣告、url()、不是 #rrggbb、不是字串、沒有 color、不是 map，放在第 1 個或第 10 個都拒絕（新建與修改）', async () => {
    let k = 0;
    for (const bad of EVIL) for (const at of [0, 9]) {
      const links = LK(10); links[at] = { ...links[at], color: bad };
      await assertFails(createCard(db('ed'), 'ed', `c${++k}`, { links }));
    }
    const nocolor = LK(1); delete nocolor[0].color;
    await assertFails(createCard(db('ed'), 'ed', 'cnc', { links: nocolor }));
    await assertFails(createCard(db('ed'), 'ed', 'cstr', { links: ['#123456'] }));
    await assertFails(createCard(db('ed'), 'ed', 'cmap', { links: { 0: LK(1)[0] } }));
    await assertSucceeds(createCard(db('ed'), 'ed', 'cok', { links: LK(3) }));
    const cur = await readDoc(t, 'cards/cok');
    for (const bad of EVIL.slice(0, 4)) await assertFails(editCard(db('ed'), 'ed', 'cok', cur, { links: LK(3, i => i === 2 ? bad : '#111114') }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'cok', cur, { links: LK(3, () => '#111114') }));
  });
  it('L-14 舊卡片（超連結已經超過或格式不合）：沒改超連結的修改、換順序、永久刪除照常；改超連結一定要合格', async () => {
    const bad = LK(12, i => i === 3 ? 'red;position:fixed' : '#6a4fd8');
    await seed(t, async d => { const c = { ...cardData('seed', { links: bad }), createdAt: new Date(), updatedAt: new Date() };
      await d.doc('cards/c1').set(c); await d.doc('cards/c1/versions/1').set({ ...verData('seed', 'c1', c), at: new Date() }); });
    const cur = await readDoc(t, 'cards/c1');
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', cur, { title: '只改名稱' }));
    await assertSucceeds(db('ed').doc('cards/c1').update({ order: 5, updatedAt: NOW(), updatedBy: 'ed' }));
    const cur2 = await readDoc(t, 'cards/c1');
    await assertFails(editCard(db('ed'), 'ed', 'c1', cur2, { links: bad.slice(0, 10) }));
    await assertSucceeds(editCard(db('ed'), 'ed', 'c1', cur2, { links: LK(2) }));
    await seed(t, async d => { const c = { ...cardData('seed', { links: bad }), createdAt: new Date(), updatedAt: new Date() };
      await d.doc('cards/c2').set(c); await d.doc('cards/c2/versions/1').set({ ...verData('seed', 'c2', c), at: new Date() }); });
    await assertSucceeds(purgeCard(db('ed'), 'ed', 'c2'));
  });
});
