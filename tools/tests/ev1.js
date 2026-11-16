/* ev1：即時回報狀態燈號、時間標記、完成這一段、結案、議題卡片裡的小膠囊、深色與手機（用 data_v5.json，固定 8300 埠）。
   2026-11-15（03 T4）改寫：原本按頁首「編輯」（#editBtn，11-06 已拿掉）、用對話框加時間（[data-addevtime]、[data-evtime]，已改成逐欄編輯）、
   找 .done-item（完成紀錄已改成膠囊）、最後按 #saveBtn，修改前就壞了。現在：設定頁鎖頭登入（common.js）→ 膠囊自己的「編輯」→ 時間標記用
   「+ 時間」那一欄（views.js 的 evTimeEditor）→ 膠囊的「完成這一段」對話框 → 那張的「儲存」；結案直接儲存。
   2026-11-16（03 T6）：時間標記改成原位編輯器的「時間＋核取」行（自製時間選取器），「儲存」在儲存回饋那一列。
   data_v5.json 的「狀態測試」幾張是照 2026-10-30 排的，頁面時間固定在 2026-10-30 10:00（Playwright clock）。逐項判斷、壞了以非 0 結束 */
const c=require('./common');
const NOW=new Date('2026-10-30T10:00:00');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk,login,st}=await c.setup(__dirname+'/data_v5.json');
const open=async(w,h,sc,touch)=>{const p=await mk(w,h,sc,touch);await p.context().clock.setFixedTime(NOW);await p.reload();await p.waitForTimeout(1800);
  await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);return p};
const cap=n=>`#events .ev:has(>summary b:text-is("${n}"))`;
const evOfName=(p,n)=>p.evaluate(n=>JSON.parse(JSON.stringify(state.events.find(e=>e.name===n&&!e.doneAt)||null)),n);
const R=p=>p.waitForTimeout(400);
{const p=await open(960,900,'light',false);
 const sts=await p.$$eval('#events .ev',x=>Object.fromEntries(x.map(e=>[e.querySelector('b').textContent,e.dataset.st+':'+getComputedStyle(e).backgroundColor])));
 console.log('statuses',JSON.stringify(sts));
 ok(/^stall/.test(sts['狀態測試紅'])&&/^go/.test(sts['狀態測試橘（補更新）'])&&/^go/.test(sts['狀態測試橘（完成一段）'])&&/^ok/.test(sts['狀態測試綠（期限後新增）']),'狀態：紅＝沒有進度、橘＝補更新／完成一段、綠＝期限後新增');
 ok(Object.values(sts).every(v=>v.endsWith('rgb(255, 255, 255)')),'收合的膠囊一律白底');
 await p.screenshot({path:'ev_d_light.png'});
 await login(p);await p.evaluate(()=>setSection('live',{instant:true}));await R(p);
 /* 展開「停車場公告：」→ 膠囊自己的「編輯」 */
 const N='停車場公告：',C=cap(N);
 await p.click(`${C}>summary`);await p.waitForTimeout(800);await p.click(`${C} .card-edit-btn`);await p.waitForTimeout(700);
 ok(await p.evaluate(()=>editing)&&(await p.$$eval(`${C} .ev-tools button`,x=>x.map(b=>b.textContent.trim()))).join()==='會議要報告,完成這一段,結案','單卡編輯：膠囊出現整筆動作（會議要報告、完成這一段、結案）');
 /* 03：時間標記改成原位編輯器的「時間＋核取」行：新增一行、打名稱、種類換成時間、自製時間選取器（月曆、時刻、結束日、寫進母議題）、完成 */
 const lastBlk=async()=>`${C} [data-blk="${(await evOfName(p,N)).blocks.slice(-1)[0].id}"]`;
 const tpSet=async({sd,ed,sh,eh,toIssue})=>{const T=`${C} .tp`;
   for(let i=0;i<24&&(await p.$eval(T,x=>JSON.parse(x.dataset.st).m))!==sd.slice(0,7);i++){await p.click(`${T} [data-tpm="1"]`);await p.waitForTimeout(80)}
   await p.click(`${T} [data-tpd="${sd}"]`);
   if(ed){await p.click(`${T} [data-tpend="e"]`);await p.click(`${T} [data-tpd="${ed}"]`)}
   if(sh)await p.fill(`${T} [data-tpf=sh]`,sh);if(eh)await p.fill(`${T} [data-tpf=eh]`,eh);if(toIssue)await p.click(`${T} .fld-check`);
   await p.click(`${T} [data-tpok]`);await R(p)};
 const addTime=async(label,o)=>{await p.click(`${C} [data-kpadd]`);await R(p);await p.keyboard.type(label);const L=await lastBlk();
   await p.click(`${L} .kp-type .csel-btn`);await p.waitForTimeout(200);await p.click(`${L} .csel-opt[data-v="time"]`);await R(p);await tpSet(o)};
 /* 加時間：開會 11/03 14:00–15:30，寫進母議題 */
 await addTime('與總務處開會',{sd:'2026-11-03',sh:'1400',eh:'15:30',toIssue:true});
 /* 無效時刻：選取器停著、顯示原因、那一行的名稱還在；刪掉這一行（時間標記跟著拿掉） */
 await addTime('壞時間',{sd:'2026-10-30',sh:'25:00'});
 ok(!!(await p.$(`${C} .tp`))&&!(await p.$eval(`${C} .tp-err`,x=>x.hidden))&&await p.inputValue(`${await lastBlk()} [data-kptx]`)==='壞時間','無效時刻：選取器停著、顯示原因、名稱還在');
 await p.click(`${await lastBlk()} [data-kpdel]`);await R(p);
 /* 只有日期的期間、已經過去的時間 */
 await addTime('公告期間',{sd:'2026-11-03',ed:'2026-11-10'});
 await addTime('移除過期公告',{sd:'2026-10-30',sh:'9:30'});
 let ev=await evOfName(p,N);console.log('times',JSON.stringify(ev.times.map(t=>[t.label,t.start,t.end,!!t.toIssue])));
 ok(ev.times.length===3&&ev.times.some(t=>t.label==='與總務處開會'&&t.start==='2026-11-03T14:00'&&t.end==='2026-11-03T15:30'&&t.toIssue)&&ev.times.some(t=>t.label==='公告期間'&&t.start==='2026-11-03'&&t.end==='2026-11-10')&&ev.times.some(t=>t.label==='移除過期公告'&&t.start==='2026-10-30T09:30'),'三個時間標記寫回（時刻、期間、過去的時間）');
 const mk1=await p.evaluate(id=>state.issues.find(i=>i.id===id).markers.filter(m=>m.tmId).map(m=>m.text+'@'+m.date),ev.issueId);console.log('parent markers',JSON.stringify(mk1));
 ok(mk1.some(x=>x.includes('與總務處開會')&&x.endsWith('@2026-11-03')),'勾了「也寫進母議題」的時間進了母議題的處理紀錄');
 await p.screenshot({path:'ev_d_edit_open.png'});
 /* 完成這一段（膠囊的對話框） */
 await p.click(`${C} [data-evround]`);await R(p);
 await p.fill('#dlgForm textarea[name=done]','已移除過期公告');await p.fill('#dlgForm textarea[name=next]','等總務處回覆新公告內容');
 await p.screenshot({path:'ev_d_round_dlg.png'});await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(900);
 ev=await evOfName(p,N);const rec=await p.evaluate(id=>JSON.parse(JSON.stringify(state.events.find(e=>e.fromEv===id))),ev.id);
 console.log('after round',JSON.stringify({round:ev.round,desc:ev.desc,times:ev.times.map(t=>t.label),rec:rec&&{round:rec.round,desc:rec.desc,times:rec.times.map(t=>t.label),done:rec.doneAt}}));
 ok(ev.round===2&&ev.desc==='等總務處回覆新公告內容'&&ev.times.length===2,'完成這一段：進入第 2 段、說明換成下一段、過去的時間移走');
 ok(!!rec&&rec.round===1&&rec.desc==='已移除過期公告'&&rec.times.map(t=>t.label).join()==='移除過期公告'&&rec.doneAt==='2026-10-30','完成紀錄多一筆（第 1 段、帶走過去的時間）');
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector('#events .ev.sec-edit')).getPropertyValue('--st').trim()!==''),'燈號顏色變數還在');
 await p.click(`${C} [data-kpsave]`);await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await R(p);
 console.log('commit',(st.commits[0]||'').split('\n')[0]);
 ok(!(await p.evaluate(()=>editing))&&st.commits.length>=1,'儲存：結束編輯、寫一筆 commit');
 ok((await p.$eval(`${C}`,e=>e.dataset.st))==='go','完成過一段：燈號變黃（go）');
 /* 結案另一張：直接儲存、離開清單 */
 const n0=await p.$$eval('#events .ev',x=>x.length),R2=cap('狀態測試紅');
 if(!(await p.$eval(R2,e=>e.open)))await p.click(`${R2}>summary`);await p.waitForTimeout(700);await p.click(`${R2} .card-edit-btn`);await p.waitForTimeout(600);
 await p.click(`${R2} [data-evdone]`);await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await R(p);
 ok((await p.$$eval('#events .ev',x=>x.length))===n0-1&&await p.evaluate(()=>!!state.events.find(e=>e.name==='狀態測試紅').doneAt&&!editing),'結案：離開即時回報清單、直接儲存');
 /* 刪除一個時間標記（逐欄的「刪除」） */
 if(!(await p.$eval(C,e=>e.open)))await p.click(`${C}>summary`);await p.waitForTimeout(700);await p.click(`${C} .card-edit-btn`);await p.waitForTimeout(600);
 /* 完成這一段換了說明：留下的時間標記不再連到行，列在逐行內容下面，可以刪（data-kptdel） */
 const tid=(await evOfName(p,N)).times[0].id;await p.click(`${C} [data-kptdel="${tid}"]`);await R(p);
 ok((await evOfName(p,N)).times.length===1,'刪除時間標記');
 await p.click(`${C} [data-kpsave]`);await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await R(p);
 /* 議題卡片裡的小膠囊 */
 await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},ev.issueId);await p.waitForTimeout(900);
 const kids=await p.$$eval('#cardDetail .kid-ev',x=>x.map(k=>k.textContent.trim()+':'+k.dataset.st));console.log('kid evs',JSON.stringify(kids));
 ok(kids.some(k=>k.startsWith(N)),'母議題詳情裡有這張的小膠囊');
 ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
 await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(900);await p.screenshot({path:'ev_d_done.png'});
}
/* 深色、手機：展開不出錯 */
for(const [w,h,sc,t,tag] of [[960,900,'dark',false,'dark'],[390,844,'light',true,'m']]){const p=await open(w,h,sc,t);await p.screenshot({path:`ev_${tag}.png`});
 await p.click(`${cap('停車場公告：')}>summary`);await p.waitForTimeout(900);await p.screenshot({path:`ev_${tag}_open.png`});
 ok(await p.$eval(cap('停車場公告：'),e=>e.open)&&!p.errs.length,tag+' 展開、沒有錯誤 '+p.errs.join(' | '))}
await b.close();process.exit(bad?1:0)})();
