/* dwk1：完成紀錄的週資料夾（views.js 的 renderDone／doneWeekShow）。用 data_test.json，頁面時間固定在 2026-10-30（那一週＝10/26 – 11/01）。
   資料夾總覽（週一到週日、最新在最上面、帶完成張數與標題預覽）→ 點進去那一週的膠囊清單 → 開卡片；左上鍵變「上一頁」（不另放返回鈕）、
   手機的系統返回鍵一層一層退（卡片 → 那一週 → 總覽）；切換分頁會離開那一週；搜尋完成紀錄會直接進到那一週並打開卡片；標題裡的 HTML 要被跳脫。
   截圖：桌面、手機、淺色、深色，輸出在目前資料夾（dwk_*.png） */
const c=require('./common');
const NOW=new Date('2026-10-30T10:00:00');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk}=await c.setup(__dirname+'/data_test.json');
const open=async(w,h,sc,touch)=>{const p=await mk(w,h,sc,touch);await p.context().clock.setFixedTime(NOW);await p.reload();await p.waitForTimeout(1800);
  await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(600);return p};
const homeUp=p=>p.evaluate(()=>document.querySelector('.dhead .dh-home').classList.contains('up'));
const expected=p=>p.evaluate(()=>{const it=doneItems(),m={};it.forEach(x=>{const w=wkStart(x.d);m[w]=(m[w]||0)+1});return m});
const dir=process.env.SHOTS||'.';
for(const [w,h,sc,touch,tag] of [[1366,800,'light',false,'desk'],[390,780,'light',true,'mob'],[390,780,'dark',true,'mobdark'],[1366,800,'dark',false,'deskdark']]){
 const p=await open(w,h,sc,touch);const exp=await expected(p);const weeks=Object.keys(exp).sort().reverse();
 ok(weeks.length>=3,tag+'：測試資料至少跨三週：'+weeks.join(','));
 ok(await p.$$eval('#doneList .wkf',x=>x.length)===weeks.length&&!(await p.$('#doneList .cp')),tag+'：總覽是每週一張資料夾（沒有直接列膠囊）');
 const ds=await p.$$eval('#doneList .wkf',x=>x.map(e=>e.dataset.wk));ok(JSON.stringify(ds)===JSON.stringify(weeks),tag+'：最新的一週在最上面');
 ok(weeks.every(k=>new Date(k+'T00:00:00').getDay()===1),tag+'：每一週都從週一開始');
 const t0=await p.$eval('#doneList .wkf',e=>e.textContent);ok(t0.includes('10/26 – 11/01')&&t0.includes(exp[weeks[0]]+' 張完成')&&t0.includes('本週'),tag+'：第一張寫日期範圍、張數、本週：'+t0.slice(0,40));
 ok(!(await homeUp(p)),tag+'：總覽時左上角還是首頁鍵');
 await p.screenshot({path:`${dir}/dwk_${tag}_folders.png`});
 await p.click('#doneList .wkf');await p.waitForTimeout(700);
 ok(await p.$$eval('#doneList .cp.done',x=>x.length)===exp[weeks[0]]&&!!(await p.$('#doneList .wk-head')),tag+'：點進去列出那一週的所有卡片');
 ok(await homeUp(p)&&await p.evaluate(()=>Back.depth())===1,tag+'：左上角變成上一頁、Back 疊一層');
 ok(!(await p.$('#donePanel .pv-back,#donePanel [data-lcback],#donePanel .wk-back')),tag+'：那一頁裡沒有另外的返回鈕');
 await p.screenshot({path:`${dir}/dwk_${tag}_week.png`});
 await p.click('#doneList .cp.done');await p.waitForTimeout(900);
 ok(await p.evaluate(()=>!!dnOpen),tag+'：點膠囊開卡片（沿用原本的樣子）');
 await p.screenshot({path:`${dir}/dwk_${tag}_card.png`});
 if(touch){
  ok(await p.evaluate(()=>Back.depth())===2,tag+'：手機：卡片在那一週上面再疊一層');
  await p.goBack();await p.waitForTimeout(700);ok(await p.evaluate(()=>!dnOpen&&doneWeek!==null),tag+'：系統返回鍵先關卡片，還在那一週');
  await p.click('.dhead .dh-home');await p.waitForTimeout(700);ok(await p.evaluate(()=>doneWeek===null&&Back.depth()===0)&&!!(await p.$('#doneList .wkf')),tag+'：左上角上一頁回到總覽');
  ok(!(await homeUp(p)),tag+'：回到首頁鍵');
  await p.click('#doneList .wkf');await p.waitForTimeout(500);await p.goBack();await p.waitForTimeout(600);
  ok(await p.evaluate(()=>doneWeek===null),tag+'：系統返回鍵在那一週時回到總覽');
 }else{
  await p.click('.dhead .dh-home');await p.waitForTimeout(700);
  ok(await p.evaluate(()=>doneWeek===null&&!dnOpen)&&!!(await p.$('#doneList .wkf')),tag+'：桌面：左上角上一頁關掉卡片並回到總覽');
 }
 if(tag==='desk'){
  /* 切換分頁：離開那一週 */
  await p.click('#doneList .wkf');await p.waitForTimeout(500);await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);
  ok(await p.evaluate(()=>doneWeek===null&&Back.depth()===0)&&!(await homeUp(p)),tag+'：換到別的分頁就離開那一週');
  /* 搜尋 */
  await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(500);
  await p.fill('#boardQ','法規彙編');await p.waitForTimeout(500);
  await p.click('#boardRes .dr-item.done');await p.waitForTimeout(1400);
  ok(await p.evaluate(()=>doneWeek!==null&&dnOpen!==null),tag+'：搜尋完成紀錄：直接進到那一週並開卡片');
  /* 跳脫 */
  await p.evaluate(()=>{window.__x=0;const e=state.events.find(e=>e.doneAt);e.name='<img src=x onerror=window.__x=1>';renderDone()});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>window.__x)===0,tag+'：標題裡的 HTML 不會執行');
 }
 ok(!(await p.evaluate(()=>0))&&p.errs.length===0,tag+'：沒有 console 錯誤 '+p.errs.join('|'));
 await p.close();
}
await b.close();console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0)})();
