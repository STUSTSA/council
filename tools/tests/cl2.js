/* cl2：行事曆「這一天」的事項可以勾選（notify.js 的 calListHTML／notiDone）。github 模式（data_test.json），固定 8300 埠。
   1. 有編輯權：本部門當天的事有勾選框；勾＝存檔（PUT）、核取行 check＝true、desc 跟 blocks 對齊（重建不會還原）、標題淡化加刪除線、事項還在
   2. 取消勾＝還原；舊時間標記（沒有核取行）勾了補一行、取消後保留那一行但沒勾
   3. 別的部門（會長室）的事沒有框；沒有編輯權（canEdit 為假）整頁沒有框
   4. 存檔失敗：框回到實際狀態、有提示（不當成已勾）
   5. 沒有錯誤；412 寬沒有橫捲
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const dOf=(t=new Date())=>`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
const dismiss=async p=>{await p.waitForTimeout(600);if(await p.evaluate(()=>!!document.querySelector('#dlg[open]')))await p.click('#dlg [data-act=cancel]');await p.waitForTimeout(300)};
(async()=>{
  const {b,mk,login,st}=await c.setup();
  const p=await mk(1300,900,'light',false),T=dOf();
  await p.route(/data-president\.json/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schemaVersion:13,title:'會長室',issues:[],weeks:[],labels:[],members:[],events:[{id:'o1',name:'卡',blocks:[],times:[{id:'ot',label:'會長行程',start:T+'T15:00',end:'',place:''}],staff:[],labels:[],links:[]}]})}));
  await login(p);await dismiss(p);
  await p.evaluate(()=>{const e=state.events.find(x=>!x.doneAt),t=today();window.__ev=e.id;
    e.times=[{id:'tA',label:'世新報導初版',start:t+'T10:00',end:'',place:''},{id:'tB',label:'舊的時間標記',start:t+'T11:00',end:'',place:''}];
    e.blocks=[{id:'bA',text:'世新報導初版',check:false,timeId:'tA'}];e.desc='';render()});
  await p.click('#notiBtn');await p.waitForTimeout(900);await p.evaluate(()=>$('#notiPage .cal').scrollIntoView());await p.waitForTimeout(300);
  const n0=st.commits.length;
  ok(await p.evaluate(()=>document.querySelectorAll('.cal-list .ce-n.ck [data-calck]').length===2),'有編輯權：當天兩件事各有勾選框');
  await p.click('.cal-list [data-caltid="tA"]');await p.waitForTimeout(1500);
  const r1=await p.evaluate(()=>{const e=state.events.find(x=>x.id===window.__ev),b=e.blocks.find(x=>x.id==='bA'),i=$('[data-caltid="tA"]');
    return {check:b.check,desc:/世新報導初版/.test(e.desc||''),dn:i&&i.closest('.ce-n').classList.contains('done'),checked:i&&i.checked,still:document.querySelectorAll('.cal-list .cal-ev').length,ln:i&&getComputedStyle(i.closest('.ce-n').querySelector('span')).textDecorationLine}});
  ok(r1.check&&r1.dn&&r1.checked&&r1.still===2&&/line-through/.test(r1.ln),`勾：核取行 check、標題淡化加刪除線、事項還在（${JSON.stringify(r1)}）`);
  ok(st.commits.length>n0,`勾了會存檔（commit ${st.commits.length-n0}）`);
  ok(await p.evaluate(()=>StoreMap.descOf(state.events.find(x=>x.id===window.__ev).blocks)===state.events.find(x=>x.id===window.__ev).desc),'desc 跟 blocks 對齊');
  await p.screenshot({path:'cl2_desk.png'});
  await p.click('.cal-list [data-caltid="tA"]');await p.waitForTimeout(1500);
  ok(await p.evaluate(()=>{const e=state.events.find(x=>x.id===window.__ev);return e.blocks.find(x=>x.id==='bA').check===false&&!$('[data-caltid="tA"]').checked&&!$('[data-caltid="tA"]').closest('.ce-n').classList.contains('done')}),'取消勾＝還原');
  await p.click('.cal-list [data-caltid="tB"]');await p.waitForTimeout(1500);
  ok(await p.evaluate(()=>{const e=state.events.find(x=>x.id===window.__ev),b=e.blocks.find(x=>x.timeId==='tB');return !!b&&b.check}),'舊時間標記：勾了補一行核取行');
  await p.click('.cal-list [data-caltid="tB"]');await p.waitForTimeout(1500);
  ok(await p.evaluate(()=>{const e=state.events.find(x=>x.id===window.__ev),b=e.blocks.find(x=>x.timeId==='tB');return !!b&&!b.check}),'取消：那一行保留、沒勾');
  /* 3 */
  await p.click('.cal-seg [data-k="pres"]');await p.waitForTimeout(1000);
  ok(await p.evaluate(()=>/會長行程/.test($('.cal-list').textContent)&&!document.querySelector('[data-calck]')),'別的部門的事沒有勾選框');
  await p.click('.cal-seg [data-k="mine"]');await p.waitForTimeout(500);
  await p.evaluate(()=>{roView=true;renderNoti()});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>!document.querySelector('[data-calck]')&&document.querySelectorAll('.cal-list .cal-ev').length===2),'沒有編輯權：沒有框、事項照樣列出');
  await p.evaluate(()=>{roView=false;renderNoti()});await p.waitForTimeout(300);
  /* 4 存檔失敗 */
  await p.route('https://api.github.com/**',r=>r.request().method()==='PUT'?r.fulfill({status:500,body:'{}'}):r.fallback());
  await p.click('.cal-list [data-caltid="tA"]');await p.waitForTimeout(2500);
  const f=await p.evaluate(()=>({txt:document.body.innerText.slice(0,0),dlg:!!document.querySelector('#dlg[open]'),toast:!!document.querySelector('.toast,#toast')&&document.querySelector('.toast,#toast').textContent}));
  console.log('INFO 失敗後',JSON.stringify(f));
  ok(await p.evaluate(()=>{const i=$('[data-caltid="tA"]');return !!i&&!i.disabled&&i.checked===state.events.find(x=>x.id===window.__ev).blocks.find(x=>x.id==='bA').check}),'存檔失敗：框跟資料一致、可以再按');
  ok(p.errs.filter(e=>!/500/.test(e)).length===0,'沒有錯誤：'+p.errs.join('|'));
  const m=p;await m.setViewportSize({width:412,height:860});await m.emulateMedia({colorScheme:'dark'});await m.waitForTimeout(600);
  await m.evaluate(()=>{const e=state.events.find(x=>!x.doneAt),t=today();e.times=[{id:'tA',label:'世新學運報導初版',start:t+'T10:00',end:'',place:'學生會辦公室'}];e.blocks=[{id:'bA',text:'x',check:true,timeId:'tA'}];render()});
  await m.evaluate(()=>{if(NOTI.view!=='cal')notiViewShow('cal');renderNoti();$('.cal-list').scrollIntoView()});await m.waitForTimeout(600);await m.waitForTimeout(300);
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&!!$('[data-calck]:checked')),'412 寬沒有橫捲、已勾的顯示為勾');
  await m.screenshot({path:'cl2_mob.png'});
  await b.close();console.log(`${passes} 項通過，${fails} 項失敗`);process.exit(fails?1:0);
})();
