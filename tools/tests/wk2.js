/* wk2：每週報告（原「每週概述」，2026-11-21 搬進完成紀錄；views.js 的 repHTML、events.js、weekly.js 的 weekDotSync）。用 data_test.json，頁面時間固定在 2026-10-30（週五，那一週＝10/26 – 11/01）。
   進到某一週：最上方固定一張「每週報告」卡，點開是那一週的報告；沒有完成紀錄的週也列得出來、也進得去；沒有報告的週寫「這週還沒有報告」、當週有「生成」；
   設定裡不再有「每週概述」；沒產出報告的週五起，完成紀錄分頁鈕有紅點；全站沒有「每週概述」字樣。手機與桌面各跑一次。 */
const c=require('./common');
const NOW=new Date('2026-10-30T10:00:00');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
for(const [w,h,touch,tag] of [[390,780,true,'mob'],[1366,800,false,'desk']]){
 const {b,mk}=await c.setup(__dirname+'/data_test.json');
 const p=await mk(w,h,'light',touch);await p.context().clock.setFixedTime(NOW);await p.reload();await p.waitForTimeout(1800);
 await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
 await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(600);
 const weeks=await p.$$eval('#doneList .wkf',x=>x.map(e=>e.dataset.wk));
 ok(weeks.includes('2026-09-21'),tag+'：沒有完成紀錄、但有每週報告的週（9/21）也列得出來：'+weeks.join(','));
 await p.click('#doneList .wkf');await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>doneWeek==='2026-10-26')&&!!(await p.$('#doneList .wk-rep .week')),tag+'：進到本週：最上方有每週報告卡');
 const top=await p.evaluate(()=>{const r=document.querySelector('#doneList .wk-rep').getBoundingClientRect(),c=document.querySelector('#doneList .cps').getBoundingClientRect();return r.top<c.top});
 ok(top,tag+'：每週報告在完成紀錄卡片上面');
 ok(/每週報告/.test(await p.$eval('#doneList .wk-rep .week summary',e=>e.textContent)),tag+'：卡片標題寫「每週報告」');
 await p.click('#doneList .wk-rep .week summary');await p.waitForTimeout(900);
 ok(await p.$eval('#doneList .wk-rep .week',e=>e.open&&e.querySelector('.week-text').textContent.includes('權益部')),tag+'：點開看到那一週的報告內容');
 ok(await p.$$eval('#doneList .wk-rep [data-addweek]',x=>x.length&&x.every(e=>getComputedStyle(e).display==='none')),tag+'：沒登入看不到「新增」');
 ok(!!(await p.$('#doneList .wk-rep [data-genweek]')),tag+'：當週有「生成」');
 await p.screenshot({path:`wk2_${tag}_rep.png`});
 /* 沒有報告的週 */
 await p.evaluate(()=>{state.weeks=state.weeks.filter(x=>wkStart(x.date)!=='2026-10-26');renderDone();weekDotSync()});await p.waitForTimeout(400);
 ok(/這週還沒有報告/.test(await p.$eval('#doneList .wk-rep',e=>e.textContent)),tag+'：沒有報告的週寫「這週還沒有報告」');
 ok(await p.$eval('#tabbar [data-tab=done]',e=>e.classList.contains('due')),tag+'：週五起還沒產出：完成紀錄分頁鈕有紅點');
 await p.screenshot({path:`wk2_${tag}_none.png`});
 /* 生成（登入後） */
 await p.evaluate(()=>{localStorage.setItem('workboard:ghtoken','T')});
 await p.evaluate(()=>{window.__asked=null;});
 const n0=await p.evaluate(()=>state.weeks.length);
 await p.evaluate(()=>{ask=async(t,f)=>{window.__asked={t,f};return {date:today(),text:'測試報告內容'}}});
 await p.evaluate(()=>{document.body.classList.add('authed')});
 await p.click('#doneList .wk-rep [data-genweek]');await p.waitForTimeout(800);
 const g=await p.evaluate(()=>({t:window.__asked&&window.__asked.t,n:state.weeks.length,card:!!document.querySelector('#doneList .wk-rep .week'),dot:document.querySelector('#tabbar [data-tab=done]').classList.contains('due')}));
 ok(g.t==='生成每週報告'&&g.n===n0+1&&g.card,tag+'：按「生成」存成一份，卡片出現（'+JSON.stringify(g)+'）');
 /* 設定與全站字樣 */
 await p.evaluate(()=>{ask=undefined});
 ok(!(await p.evaluate(()=>/每週概述/.test(document.documentElement.innerText+document.title))),tag+'：畫面上沒有「每週概述」');
 await p.click('#setBtn');await p.waitForTimeout(900);
 ok(!(await p.$('#setOv [data-set=week],#weekWrap')),tag+'：設定裡沒有每週概述／每週報告入口');
 ok(p.errs.length===0,tag+'：沒有 console 錯誤 '+p.errs.join('|'));
 await b.close();
}
console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0)})();
