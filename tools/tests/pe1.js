/* pe1：進度、完成紀錄改成「點欄位直接改」（views.js 的 issueFieldsHTML／doneFieldsHTML、events.js 的 ifFldAct／ifFldWrite）。
   頁首「編輯」後兩區都沒有「編輯這區」；議題詳情：名稱（Enter 完成）、階段（新增、換目前、刪除）、目前進度（Esc 取消）、期間（結束早於開始擋下）、超連結（新增、刪除）、
   點別欄時先存回目前那欄；新增議題直接打開名稱欄；完成紀錄：議題名稱、即時回報完成日期與母議題；儲存後寫進 data.json。桌面 1300 與手機 412。固定 8300 埠
   2026-11-17（ui-05）：完成紀錄的膠囊與卡片換新介面（.cp 打開 .lc），編輯的流程不變
   2026-11-15（03 T4）：改成單卡編輯的入口——每張卡片按自己的「編輯」（.card-edit-btn）才出現逐欄工具，一次只編一張，按那張的「儲存」（[data-edsave]）；原本按頁首「編輯」、最後一次按 #saveBtn */
const C=require('./common.js');
(async()=>{let bad=0;const ok=(c,m)=>{console.log((c?'OK  ':'FAIL')+' '+m);if(!c)bad++};
for(const [w,tag] of [[1300,'桌面'],[412,'手機']]){
const {b,mk,login,remote}=await C.setup();   /* 每種寬度都從原始測試資料開始（common.js 的登入只處理還沒有身分的看板） */
const p=await mk(w,900,'dark',w<500);await login(p);
const R=()=>p.waitForTimeout(450);
const save=async sc=>{await p.click(`${sc} [data-edsave]`);await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(400)};   /* 存完 2.6 秒後會跳「共用密碼太短」提醒（測試資料是 0000），關掉 */
ok(!(await p.$('[data-secedit="progress"],[data-secedit="done"]')),tag+' 進度、完成紀錄沒有「編輯這區」');
await p.evaluate(()=>setSection('progress',{instant:true}));await R();
const iid=await p.evaluate(()=>activeIssues()[0].id);
await p.evaluate(id=>progShow(id),iid);await p.waitForTimeout(700);
await p.click('#cardDetail .card-edit-btn');await p.waitForTimeout(700);
ok(await p.$$eval('#cardDetail .evf[data-iffk]',x=>x.length)>=5,tag+' 議題詳情是一欄一欄');
/* 名稱 */
await p.click('#cardDetail [data-ifpen="title"]');await R();
await p.fill('#cardDetail .evf.open [data-e="title"]','改過的議題名稱');await p.keyboard.press('Enter');await R();
ok(await p.evaluate(id=>state.issues.find(i=>i.id===id).title,iid)==='改過的議題名稱',tag+' 名稱 Enter 完成');
ok(!(await p.$('#cardDetail .evf.open')),tag+' 完成後收起');
/* 階段：新增一個、設成目前 */
await p.click('#cardDetail [data-ifpen="stage"]');await R();
await p.click('#cardDetail .evf.open [data-iffx="stgadd"]');await p.keyboard.type('公告');
await p.click('#cardDetail .evf.open .stg-row:last-child .stg-cur');
await p.click('#cardDetail .evf.open [data-iffx="ok"]');await R();
let it=await p.evaluate(id=>state.issues.find(i=>i.id===id),iid);
ok(it.tags[it.tags.length-1]==='公告'&&it.cur===it.tags.length-1,tag+' 階段新增並設為目前：'+it.tags.join('/')+' cur='+it.cur);
/* 階段：刪掉目前那個 → 目前回到第一個 */
await p.click('#cardDetail [data-ifpen="stage"]');await R();
await p.click('#cardDetail .evf.open .stg-row:last-child [data-iffx="stgdel"]');await p.click('#cardDetail .evf.open [data-iffx="ok"]');await R();
it=await p.evaluate(id=>state.issues.find(i=>i.id===id),iid);
ok(!it.tags.includes('公告')&&it.cur===0,tag+' 刪掉目前階段後回到第一個');
/* 目前進度：Esc 取消 */
const note0=it.note||'';
await p.click('#cardDetail [data-ifpen="note"]');await R();await p.fill('#cardDetail .evf.open [data-e="note"]','不要存這段');await p.keyboard.press('Escape');await R();
ok((await p.evaluate(id=>state.issues.find(i=>i.id===id).note||'',iid))===note0,tag+' Esc 取消不存');
/* 點別欄＝先存回：打開說明打字，直接點期間 */
await p.click('#cardDetail [data-ifpen="note"]');await R();await p.fill('#cardDetail .evf.open [data-e="note"]','新的進度說明');
await p.click('#cardDetail [data-ifpen="dates"]');await R();
ok(await p.evaluate(id=>state.issues.find(i=>i.id===id).note,iid)==='新的進度說明',tag+' 點別欄時先存回');
ok(await p.$eval('#cardDetail .evf.open',e=>e.dataset.iffk)==='dates',tag+' 期間欄打開');
/* 期間：結束早於開始擋下 */
await p.fill('#cardDetail .evf.open [data-e="start"]','2026-11-20');await p.fill('#cardDetail .evf.open [data-e="end"]','2026-11-10');
await p.click('#cardDetail .evf.open [data-iffx="ok"]');await R();
ok(!!(await p.$('#cardDetail .evf.open[data-iffk="dates"]')),tag+' 結束早於開始：停在原欄');
await p.fill('#cardDetail .evf.open [data-e="end"]','2026-12-10');await p.click('#cardDetail .evf.open [data-iffx="ok"]');await R();
it=await p.evaluate(id=>state.issues.find(i=>i.id===id),iid);
ok(it.start==='2026-11-20'&&it.end==='2026-12-10',tag+' 期間存回');
/* 超連結：新增、刪除 */
const nl=it.links.length;
await p.click('#cardDetail [data-ifpen="l:+"]');await R();
await p.fill('#cardDetail .evf.open [data-e="name"]','會議紀錄');await p.fill('#cardDetail .evf.open [data-e="url"]','https://example.com/a');
await p.click('#cardDetail .evf.open [data-iffx="ok"]');await R();
it=await p.evaluate(id=>state.issues.find(i=>i.id===id),iid);
ok(it.links.length===nl+1,tag+' 新增連結');
await p.click(`#cardDetail [data-ifpen="l:${it.links[it.links.length-1].id}"]`);await R();await p.click('#cardDetail .evf.open [data-iffx="del"]');await R();
ok(await p.evaluate(id=>state.issues.find(i=>i.id===id).links.length,iid)===nl,tag+' 刪除連結');
await save('#cardDetail');
ok(remote().issues.some(i=>i.title==='改過的議題名稱'),tag+' 議題儲存後寫進 data.json');
/* 新增議題：直接打開名稱欄 */
await p.click('#pvBack');await p.waitForTimeout(600);await p.click('#addIssue');await p.waitForTimeout(900);
ok(await p.evaluate(()=>document.activeElement&&document.activeElement.matches('#cardDetail .evf.open [data-e="title"]')),tag+' 新增議題後游標在名稱欄');
await p.keyboard.type('全新議題');await p.keyboard.press('Enter');await R();
ok(await p.evaluate(()=>state.issues.some(i=>i.title==='全新議題')),tag+' 新議題命名');
await save('#cardDetail');
/* 完成紀錄 */
await p.evaluate(()=>setSection('done',{instant:true}));await R();
const did=await p.evaluate(()=>state.issues.find(i=>i.doneAt)?.id||null),eid=await p.evaluate(()=>state.events.find(e=>e.doneAt&&!e.fromEv).id);
/* ui-05：完成紀錄點膠囊打開卡片（寬螢幕在右邊、手機全螢幕，都是 .lc）；換一張前先按 Esc 收回 */
const openDone=async id=>{if(await p.evaluate(()=>!!dnOpen)){await p.keyboard.press('Escape');await p.waitForTimeout(700)}await p.click(`#doneList .cp[data-cp="${id}"]`);await p.waitForTimeout(700)};
const scope=async id=>'.lc:not(.lc-ghost)';
const edit=async id=>{const sc=await scope(id);await p.click(`${sc} .card-edit-btn`);await p.waitForTimeout(700);return scope(id)};
await openDone(eid);let S=await edit(eid);
await p.click(`${S} [data-ifpen="done"]`);await R();await p.fill(`${S} .evf.open [data-e="done"]`,'2026-11-01');await p.click(`${S} .evf.open [data-iffx="ok"]`);await R();
ok(await p.evaluate(id=>state.events.find(e=>e.id===id).doneAt,eid)==='2026-11-01',tag+' 完成紀錄：即時回報完成日期');
S=await scope(eid);
await p.click(`${S} [data-ifpen="issue"]`);await R();
await p.click(`${S} .evf.open .csel-btn`);await p.waitForTimeout(250);
await p.click(`${S} .evf.open .csel-list [role=option]:nth-child(2)`);await p.click(`${S} .evf.open [data-iffx="ok"]`);await R();
const par=await p.evaluate(id=>{const e=state.events.find(x=>x.id===id);const i=state.issues.find(x=>x.id===e.issueId);return i?{t:i.title,m:i.markers.some(m=>m.evId===id)}:null},eid);
ok(!!par&&par.m,tag+' 完成紀錄：改母議題並寫進處理紀錄 '+JSON.stringify(par));
await save(S);
if(did){await openDone(did);S=await edit(did);
  await p.click(`${S} [data-ifpen="title"]`);await R();await p.fill(`${S} .evf.open [data-e="title"]`,'結案議題改名');await p.keyboard.press('Enter');await R();
  ok(await p.evaluate(id=>state.issues.find(i=>i.id===id).title,did)==='結案議題改名',tag+' 完成紀錄：議題改名');await save(S)}
/* 每張各自儲存後都寫進 data.json */
const r=remote();ok(r.issues.some(i=>i.title==='改過的議題名稱')&&r.issues.some(i=>i.title==='全新議題')&&r.events.find(e=>e.id===eid).doneAt==='2026-11-01'&&(!did||r.issues.find(i=>i.id===did).title==='結案議題改名'),tag+' 儲存後寫進 data.json');
ok(!p.errs.length,tag+' 沒有錯誤 '+p.errs.join(' | '));
await b.close();}
process.exit(bad?1:0)})();
