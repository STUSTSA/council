/* ev1：即時回報狀態燈號、時間標記、完成（拖到右上角）、議題卡片裡的小膠囊、深色與手機（用 data_v5.json，固定 8300 埠）。
   2026-11-17（ui-05）：膠囊與卡片換新介面；時間改用工具列加時間行、時間頁分段調整（打不出無效時刻，拿掉那一步）；「完成這一段」新介面沒有入口，拿掉那幾步（含「完成過一段變黃」）；
   結案改成拖到右上角；儲存改成返回鍵（960 寬是全螢幕卡片）；刪時間標記改成刪那一個時間行。
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
const cap=n=>`#events .cp:has(b:text-is("${n}"))`;
const K='.lc:not(.lc-ghost)';   /* 打開的卡片（960 寬：全螢幕 #lcFull） */
const evOfName=(p,n)=>p.evaluate(n=>JSON.parse(JSON.stringify(state.events.find(e=>e.name===n&&!e.doneAt)||null)),n);
const R=p=>p.waitForTimeout(400);
{const p=await open(960,900,'light',false);
 const sts=await p.$$eval('#events .cp',x=>Object.fromEntries(x.map(e=>[e.querySelector('b').textContent,e.dataset.st+':'+getComputedStyle(e).backgroundColor])));
 console.log('statuses',JSON.stringify(sts));
 ok(/^stall/.test(sts['狀態測試紅'])&&/^go/.test(sts['狀態測試橘（補更新）'])&&/^go/.test(sts['狀態測試橘（完成一段）'])&&/^ok/.test(sts['狀態測試綠（期限後新增）']),'狀態：紅＝沒有進度、橘＝補更新／完成一段、綠＝期限後新增');
 const blk=await p.evaluate(()=>{const d=document.createElement('i');d.style.background='var(--blk)';document.body.append(d);const c=getComputedStyle(d).backgroundColor;d.remove();return c});   /* ui-02：膠囊是主題的色塊 --blk（以前一律白底） */
 ok(Object.values(sts).every(v=>v.endsWith(blk)),'膠囊一律是主題的色塊（--blk）');
 await p.screenshot({path:'ev_d_light.png'});
 await login(p);await p.evaluate(()=>setSection('live',{instant:true}));await R(p);
 /* 打開「停車場公告：」→ 點一行開始原位編輯（沒有「編輯」鈕） */
 const N='停車場公告：',C=cap(N);
 await p.click(C);await p.waitForTimeout(800);await p.click(`${K} .ln [data-kpgo]`);await p.waitForTimeout(700);
 ok(await p.evaluate(()=>editing)&&!!(await p.$(`${K} .lc-rep`))&&!!(await p.$(`${K} .lc-tools`)),'原位編輯：卡片上有「報告」、底部工具列（ui-05：完成、刪除改成拖到角落）');
 /* ui-05：時間行用底部工具列的「時間」加，時間頁點一段再用方向鍵、數字調整（日期、時刻、結束時刻、結束日期、寫進母議題） */
 const tpSet=async(tid,{sd,ed,sh,eh,toIssue})=>{const T=`${K} .te[data-te="${tid}"]`;
   const days=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
   const d0=await p.evaluate(id=>state.events.find(e=>e.id===lvOpen).times.find(t=>t.id===id).start.slice(0,10),tid);
   await p.click(`${T} [data-sg="d"]`);for(let i=0;i<Math.abs(days(d0,sd));i++)await p.keyboard.press(days(d0,sd)>0?'ArrowUp':'ArrowDown');
   if(sh){const [h,m]=sh.split(':');await p.click(`${T} [data-sg="h"]`);await p.keyboard.type(h);await p.click(`${T} [data-sg="m"]`);await p.keyboard.type(m)}
   else await p.click(`${T} [data-teclr="s"]`);
   if(eh){const [h,m]=eh.split(':');await p.click(`${T} [data-teset="e"]`);await R(p);await p.click(`${T} [data-sg="eh"]`);await p.keyboard.type(h);await p.click(`${T} [data-sg="em"]`);await p.keyboard.type(m)}
   if(ed){await p.click(`${T} [data-teset="ed"]`);await R(p);for(let i=1;i<days(sd,ed);i++)await p.keyboard.press('ArrowUp')}
   if(toIssue)await p.click(`${T} .te-iss input`);await R(p)};
 const addTime=async(label,o)=>{await p.click(`${K} [data-lctool="time"]`);await R(p);
   if(await p.$eval(`${K} .te:last-of-type .te-nm`,x=>x.value)!==''){await p.click(`${K} [data-teadd]`);await R(p)}
   await p.fill(`${K} .te:last-of-type .te-nm`,label);const tid=await p.$eval(`${K} .te:last-of-type`,x=>x.dataset.te);await tpSet(tid,o);
   await p.click(`${K} [data-lctool="time"]`);await R(p)};
 /* 加時間：開會 11/03 14:00–15:30，寫進母議題 */
 await addTime('與總務處開會',{sd:'2026-11-03',sh:'14:00',eh:'15:30',toIssue:true});
 /* 只有日期的期間、已經過去的時間 */
 await addTime('公告期間',{sd:'2026-11-03',ed:'2026-11-10'});
 await addTime('移除過期公告',{sd:'2026-10-30',sh:'09:30'});
 let ev=await evOfName(p,N);console.log('times',JSON.stringify(ev.times.map(t=>[t.label,t.start,t.end,!!t.toIssue])));
 ok(ev.times.length===3&&ev.times.some(t=>t.label==='與總務處開會'&&t.start==='2026-11-03T14:00'&&t.end==='2026-11-03T15:30'&&t.toIssue)&&ev.times.some(t=>t.label==='公告期間'&&t.start==='2026-11-03'&&t.end==='2026-11-10')&&ev.times.some(t=>t.label==='移除過期公告'&&t.start==='2026-10-30T09:30'),'三個時間標記寫回（時刻、期間、過去的時間）');
 const mk1=await p.evaluate(id=>state.issues.find(i=>i.id===id).markers.filter(m=>m.tmId).map(m=>m.text+'@'+m.date),ev.issueId);console.log('parent markers',JSON.stringify(mk1));
 ok(mk1.some(x=>x.includes('與總務處開會')&&x.endsWith('@2026-11-03')),'勾了「也寫進母議題」的時間進了母議題的處理紀錄');
 await p.screenshot({path:'ev_d_edit_open.png'});
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector('.lc.lc-ed')).getPropertyValue('--st').trim()!==''),'燈號顏色變數還在');
 /* 儲存：960 寬是全螢幕卡片，返回鍵＝存檔並縮回 */
 await p.click(`${K} [data-lcback]`);await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await R(p);
 console.log('commit',(st.commits[0]||'').split('\n')[0]);
 ok(!(await p.evaluate(()=>editing))&&st.commits.length>=1,'儲存：結束編輯、寫一筆 commit');
 /* 完成另一張（ui-05：拖到右上角）：直接儲存、離開清單 */
 const n0=await p.$$eval('#events .cp',x=>x.length),R2=cap('狀態測試紅');
 {const r=await p.$eval(R2,e=>{const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}});
  await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x+10,r.y,{steps:3});await p.mouse.move(950,10,{steps:12});await p.mouse.up();await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await R(p)}
 ok((await p.$$eval('#events .cp',x=>x.length))===n0-1&&await p.evaluate(()=>!!state.events.find(e=>e.name==='狀態測試紅').doneAt&&!editing),'完成（拖到右上角）：離開即時回報清單、直接儲存');
 /* 刪除一個時間行（時間標記跟著拿掉） */
 await p.click(C);await p.waitForTimeout(800);await p.click(`${K} .ln:not(.tm) [data-kpgo]`);await p.waitForTimeout(600);
 const tb=(await evOfName(p,N)).blocks.find(b=>b.timeId).id;await p.click(`${K} [data-kpdel="${tb}"]`);await R(p);
 ok((await evOfName(p,N)).times.length===2,'刪除時間行＝時間標記一起拿掉');
 await p.click(`${K} [data-lcback]`);await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await R(p);
 /* 議題卡片裡的小膠囊 */
 await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},ev.issueId);await p.waitForTimeout(900);
 const kids=await p.$$eval('#cardDetail .kid-ev',x=>x.map(k=>k.textContent.trim()+':'+k.dataset.st));console.log('kid evs',JSON.stringify(kids));
 ok(kids.some(k=>k.startsWith(N)),'母議題詳情裡有這張的小膠囊');
 ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
 await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(900);await p.screenshot({path:'ev_d_done.png'});
}
/* 深色、手機：打開卡片不出錯 */
for(const [w,h,sc,t,tag] of [[960,900,'dark',false,'dark'],[390,844,'light',true,'m']]){const p=await open(w,h,sc,t);await p.screenshot({path:`ev_${tag}.png`});
 await p.click(cap('停車場公告：'));await p.waitForTimeout(900);await p.screenshot({path:`ev_${tag}_open.png`});
 ok(await p.evaluate(()=>lvOpen&&!!document.querySelector('#lcFull .lc.full'))&&!p.errs.length,tag+' 打開卡片（全螢幕）、沒有錯誤 '+p.errs.join(' | '))}
await b.close();process.exit(bad?1:0)})();
