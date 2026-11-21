/* dn1：完成時間帶時間（"2026-11-21 07:54"，firestore 模式讀回來的樣子）時的歸類。
   修正前 pd() 把它解成當月 1 號，剛完成的卡片掉進很舊的週資料夾；這裡確認：剛完成的卡片在「本週」資料夾、
   生成週報也算進去。頁面時間固定在 2026-11-21 08:00（台北）。 */
const c=require('./common');
const NOW=new Date('2026-11-21T08:00:00');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk}=await c.setup(__dirname+'/data_test.json');
const p=await mk(1366,800,'light',false);await p.context().clock.setFixedTime(NOW);await p.reload();await p.waitForTimeout(1800);
await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
await p.evaluate(()=>{const e=state.events.find(x=>!x.doneAt)||state.events[0];e.name='剛完成的卡片';e.doneAt='2026-11-21 07:54';e.report=false;window.__id=e.id;setSection('done',{instant:true});renderDone()});
await p.waitForTimeout(600);
const r=await p.evaluate(()=>{const x=doneItems().find(y=>y.id===window.__id);return {wk:wkStart(x.d),pd:ymd(pd('2026-11-21 07:54')),weekly:buildWeekly().text.includes('剛完成的卡片')}});
ok(r.pd==='2026-11-21','pd 認得帶時間的日期：'+r.pd);
ok(r.wk==='2026-11-16','剛完成的卡片歸在 11/16 – 11/22 那一週：'+r.wk);
ok(r.weekly,'生成週報的完成事項有它');
const t=await p.$$eval('#doneList .wkf',x=>x.map(e=>e.textContent));
ok(t[0].includes('11/16 – 11/22'),'總覽第一張是本週那一格：'+t[0].slice(0,50));
ok(p.errs.length===0,'沒有 console 錯誤 '+p.errs.join('|'));
await b.close();console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0)})();
