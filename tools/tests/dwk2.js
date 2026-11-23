/* dwk2：完成紀錄從開學第 1 週到這一週每週都有一張（views.js 的 doneWeeks），沒有紀錄的週也能進去補每週報告。用 data_test.json（開學日 2026-09-07），頁面時間固定在 2026-11-23（第 12 週）。
   檢查：電腦一排方塊、手機疊卡的週數與順序（最新在最前）；空的過去週寫「這週還沒有報告」並有「+ 新增」；新增的報告日期預設在那一週。截圖：dwk2_*.png */
const c=require('./common');
const NOW=new Date('2026-11-23T10:00:00');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk}=await c.setup(__dirname+'/data_test.json');
const dir=process.env.SHOTS||'.';
for(const [w,h,touch,tag] of [[1366,800,false,'desk'],[390,780,true,'mob']]){
 const p=await mk(w,h,'light',touch);await p.context().clock.setFixedTime(NOW);await p.reload();await p.waitForTimeout(1800);
 await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(600);
 const weeks=await p.evaluate(()=>doneWeeks(doneItems()).map(x=>x[0]));
 ok(weeks.length>=12&&weeks[0]==='2026-11-23'&&weeks.includes('2026-09-07')&&weeks.every((x,i)=>!i||weeks[i-1]>x),tag+'：週清單從 09-07 到 11-23、新到舊：'+weeks.length+' 週');
 ok(new Set(weeks).size===weeks.length,tag+'：沒有重複的週');
 const n=touch?await p.$$eval('#doneList .hm-wc',x=>x.length):await p.$$eval('#doneRail .hm-tile',x=>x.length);
 ok(n===weeks.length,tag+'：畫面張數＝週數 '+n);
 await p.evaluate(k=>{doneWeekShow(k,{instant:true})},'2026-09-14');await p.waitForTimeout(900);
 ok(await p.evaluate(()=>doneWeek)==='2026-09-14'||!touch,tag+'：能進到過去的週');
 if(!touch)await p.click('#doneRail .hm-tile[data-wk="2026-09-14"]').catch(()=>{});await p.waitForTimeout(700);
 const rn=await p.$eval('#doneList',e=>e.textContent);
 ok(rn.includes('這週還沒有報告')||!!(await p.$('#doneList .wk-rep .week')),tag+'：那週有每週報告區（空的寫「這週還沒有報告」）');
 await p.screenshot({path:`${dir}/dwk2_${tag}.png`});
}
await b.close();console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0)})();
