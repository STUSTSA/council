/* sch1：議題的「結案」鈕、時程條上按住拖曳新增註記（拖的時候標籤顯示日期、對話框沒有 %）、結案的議題儲存後移到完成紀錄、存檔是目前的 schemaVersion、沒有舊的 progress 欄。
   2026-11-15（03 T4）改寫：原本按頁首「編輯」（#editBtn，11-06 已拿掉）、在議題卡片清單 #cards 上操作（已改成甘特圖＋議題詳情 #cardDetail）、最後按 #saveBtn，修改前就壞了。
   現在：設定頁鎖頭登入（common.js）→ progShow 打開議題詳情 → 詳情卡的「編輯」→ 工具列 / 時程條 → 那張的「儲存」。桌面 900，固定 8300 埠；逐項判斷、壞了以非 0 結束 */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk,login,st,remote}=await c.setup();
const p=await mk(900,900,'light',false);await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
await login(p);
const show=async id=>{await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},id);await p.waitForTimeout(900)};
const save=async()=>{await p.click('#cardDetail [data-edsave]');await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(400)};
const ids=await p.evaluate(()=>activeIssues().map(i=>i.id));
/* 結案鈕：編輯中的工具列；按了先標記，儲存後移到完成紀錄 */
const cid=ids[1];await show(cid);await p.click('#cardDetail .card-edit-btn');await p.waitForTimeout(700);
await p.click('#cardDetail [data-closeissue]');await p.waitForTimeout(500);
let r=await p.evaluate(id=>{const i=state.issues.find(x=>x.id===id);return [i.title,i.doneAt,document.querySelector('#cardDetail .closed-tag')?.textContent,document.querySelector('#cardDetail [data-closeissue]')?.textContent]},cid);
console.log('after close btn',JSON.stringify(r));
ok(r[1]===await p.evaluate(()=>today())&&r[2]==='已結案'&&r[3]==='取消結案','結案鈕：標記結案日、顯示「已結案」、鈕變「取消結案」');
await save();
ok(await p.evaluate(id=>!!document.querySelector(`#doneList [data-done="${id}"]`)&&!activeIssues().some(i=>i.id===id),cid),'儲存後移到完成紀錄');
/* 時程條上按住拖曳新增註記 */
const mid=ids[0];await show(mid);await p.click('#cardDetail .card-edit-btn');await p.waitForTimeout(700);
const tr=await p.$('#cardDetail .c-track');await tr.scrollIntoViewIfNeeded();await p.waitForTimeout(400);const bb=await tr.boundingBox();
const hasDates=await p.evaluate(id=>hasDates(state.issues.find(i=>i.id===id)),mid);
await p.mouse.move(bb.x+bb.width*0.5,bb.y+bb.height/2);await p.mouse.down();await p.mouse.move(bb.x+bb.width*0.6,bb.y+bb.height/2,{steps:4});
const lbl=await p.textContent('#cardDetail .marker.pending .lbl').catch(()=>null);console.log('pending label',lbl,'hasDates',hasDates);
ok(hasDates?/^\d{2}\/\d{2}$/.test(lbl||''):/^\d+%$/.test(lbl||''),'拖的時候標籤顯示'+(hasDates?'日期':'%'));
await p.mouse.up();await p.waitForTimeout(500);
const dlg=await p.evaluate(()=>[$('#dlgForm b').textContent,[...document.querySelectorAll('#dlgForm [name]')].map(x=>x.name+'='+x.value)]);console.log('marker dlg',JSON.stringify(dlg));
ok(dlg[0]==='新增註記'&&(!hasDates||!dlg[1].some(x=>x.startsWith('at='))),'放開跳「新增註記」'+(hasDates?'、有期間的議題沒有 % 欄':''));
const n0=await p.evaluate(id=>state.issues.find(i=>i.id===id).markers.length,mid);
await p.fill('#dlgForm input[name=text]','測試註記');await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(500);
ok(await p.evaluate(([id,n])=>{const m=state.issues.find(i=>i.id===id).markers;return m.length===n+1&&m.some(x=>x.text==='測試註記')},[mid,n0]),'註記加上去');
await save();
console.log('commit',(st.commits[0]||'').split('\n')[0]);
const R=remote();console.log('remote closed',JSON.stringify(R.issues.filter(i=>i.doneAt).map(i=>i.title)),'v',R.schemaVersion);
ok(R.issues.find(i=>i.id===cid).doneAt&&R.issues.find(i=>i.id===mid).markers.some(m=>m.text==='測試註記'),'兩次儲存都寫進 data.json');
ok(!R.issues.some(i=>'progress' in i)&&R.schemaVersion===await p.evaluate(()=>SCHEMA_VERSION),'存檔沒有舊的 progress 欄、schemaVersion 是目前版本');
ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
await b.close();process.exit(bad?1:0)})();
