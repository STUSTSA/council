/* 03 原位編輯器在 github 模式（data.json）：同一個編輯器、存回資料檔。固定 8300 埠（CLAUDE.md 的測試準備：data_test.json 改名 data.json）。
   1. 讀舊的 data_test.json（schemaVersion 13、只有 desc）：每行顯示成純文字
   2. 原位編輯（加一行、轉成核取並勾選、點外面）→ 寫回 GitHub（模擬）：schemaVersion 14、有 blocks、desc 仍在（核取攤成「☑ 」「☐ 」）
   3. 其他卡片的 desc 跟原本相同；重新讀回來（normalize）blocks 不變
   4. 復原這次修改：存回原本的 desc */
const c=require('./common');const fs=require('fs');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'通過 ':'失敗 ')+m);if(v)passes++;else fails++};
(async()=>{
  const orig=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
  const {b,mk,login,remote}=await c.setup();
  const p=await mk(900,900,'light',false);
  await login(p);
  const live=orig.events.filter(e=>!e.doneAt),src=live.find(e=>e.desc&&!e.desc.includes('\n'))||live[0];
  ok((+orig.schemaVersion||0)<14&&!orig.events.some(e=>e.blocks),'測試資料是舊格式（schemaVersion 14 以前、沒有 blocks）');
  await p.evaluate(i=>{setSection('live',{instant:true});openEv.add(i);render()},src.id);await p.waitForTimeout(500);
  const v1=await p.evaluate(i=>[...document.querySelectorAll(`.ev[data-ev="${i}"] .kp-vl`)].map(x=>[x.querySelector('.kp-tx').textContent,!!x.querySelector('input')]),src.id);
  ok(v1.map(x=>x[0]).join('\n')===src.desc&&v1.every(x=>!x[1]),`舊卡片每行顯示成純文字（${v1.length} 行）`);
  const bid=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,src.id);
  await p.click(`.ev[data-ev="${src.id}"] [data-kpgo="${bid}"]`);await p.waitForTimeout(400);
  await p.keyboard.press('End');await p.keyboard.press('Enter');await p.keyboard.type('github 模式加的一行');
  const ln=`.ev[data-ev="${src.id}"] .kp-lines .kp-line:nth-child(2)`;
  await p.click(`${ln} .kp-type .csel-btn`);await p.waitForTimeout(250);await p.click(`${ln} .csel-opt[data-v="check"]`);await p.waitForTimeout(300);
  await p.click(`${ln} [data-kpck]`);await p.waitForTimeout(200);
  await p.click('#evH');await p.waitForTimeout(2500);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
  const r=remote(),e=r.events.find(x=>x.id===src.id);
  ok(await p.evaluate(()=>!editing&&kpSt&&kpSt.st==='ok'),'點外面：收合、已儲存');
  ok(r.schemaVersion===14&&e&&e.desc===src.desc+'\n☑ github 模式加的一行'&&Array.isArray(e.blocks)&&e.blocks.length===2&&e.blocks[1].check===true,
    `寫回的資料檔：schemaVersion 14、desc 仍在（${JSON.stringify(e&&e.desc)}）、blocks 有勾選`);
  const same=orig.events.filter(x=>x.id!==src.id).every(x=>{const y=r.events.find(z=>z.id===x.id);return y&&(y.desc||'')===(x.desc||'')});
  ok(same,'其他卡片的 desc 跟原本相同');
  const back=await p.evaluate(j=>normalize(JSON.parse(j)).events.find(x=>x.id===JSON.parse(j).events[0].id)&&normalize(JSON.parse(j)),JSON.stringify(r));
  ok(JSON.stringify(back.events.find(x=>x.id===src.id).blocks)===JSON.stringify(e.blocks),'重新讀回來 blocks 不變（行 ID、勾選）');
  await p.click(`.ev[data-ev="${src.id}"] [data-kpundo]`);await p.waitForTimeout(2500);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});
  const e2=remote().events.find(x=>x.id===src.id);
  ok(e2&&e2.desc===src.desc,'復原這次修改：資料檔存回原本的 desc');
  ok(!p.errs.length,`沒有頁面錯誤（${p.errs.join(' | ')}）`);
  await b.close();
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
