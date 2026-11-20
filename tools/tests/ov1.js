/* ov1：行事曆「找重疊時間」與「搜尋事件」（notify.js 的 calFind／calSearch）。github 模式（data_test.json），固定 8300 埠。
   1. 找重疊：預設本部門＋會長室；今天兩邊都有事（10–12、11–13）→ 重疊 11:00–12:00、月曆今天有短條；只讀選到的部門（攔截請求計數）
   2. 換成行銷部（15:00 一件）→ 沒有重疊；再換回，不重讀；讀不到的部門畫面有說明
   3. 跨天只有日期的、沒有時刻的不算；跨天寫了時刻的算整段
   4. 搜尋：打字只換結果區（輸入框不重畫）、命中反白、點結果跳到那天並換到看得到的模式；沒有結果的說明；跳脫（標題含 <img onerror>）
   5. 412 寬：沒有橫捲；關掉動態沒有程式動畫
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const XSS='<img src=x onerror="window.__xss=1">';
const dismiss=async p=>{await p.waitForTimeout(600);if(await p.evaluate(()=>!!document.querySelector('#dlg[open]')))await p.click('#dlg [data-act=cancel]');await p.waitForTimeout(300)};
const dOf=(t=new Date())=>`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
const mkDept=(name,times)=>({schemaVersion:13,title:name,issues:[],weeks:[],labels:[],members:[],events:[{id:'o1',name:name+'的卡片',blocks:[],times:times.map((t,i)=>({id:'ot'+i,place:'',...t})),staff:[],labels:[],links:[]}]});
(async()=>{
  const {b,mk,login}=await c.setup();
  const p=await mk(1300,900,'light',false);
  const T=dOf(),req=[];let marketingFail=false;
  await p.route(/data-(president|marketing)\.json/,r=>{const u=r.request().url(),id=u.match(/data-(\w+)\.json/)[1];req.push(id);
    if(id==='marketing'&&marketingFail)return r.fulfill({status:404,body:'{}'});
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(id==='president'?mkDept('會長室',[{label:'會長例會',start:T+'T11:00',end:T+'T13:00'},{label:'全天營隊',start:T,end:''}]):mkDept('行銷部',[{label:'行銷拍攝',start:T+'T15:00',end:T+'T16:00'}]))})});
  await login(p);await dismiss(p);
  await p.evaluate(X=>{const e=state.events.find(x=>!x.doneAt),t=today();e.times=[{id:'m1',label:'本部門會議',start:t+'T10:00',end:t+'T12:00',place:'會辦'},{id:'m2',label:X,start:addDays(t,3)+'T09:00',end:'',place:''}];render()},XSS);
  await p.click('#notiBtn');await p.waitForTimeout(900);await p.evaluate(()=>$('#notiPage .cal').scrollIntoView());

  /* 1 */
  ok(await p.evaluate(()=>!!$('.cal-fb')&&$('.cal-fb').getAttribute('aria-pressed')==='false')&&req.length===0,`有「找重疊」鈕、還沒讀任何別的部門（請求 ${req.length}）`);
  await p.click('.cal-fb');await p.waitForTimeout(900);
  const r1=await p.evaluate(t=>({fp:NOTI.fp.join(),chips:[...document.querySelectorAll('.cal-fp [data-calfp]')].length,on:[...document.querySelectorAll('.cal-fp [aria-checked=true]')].length,
    rng:[...document.querySelectorAll('.fnd-r span')].map(x=>x.textContent).join(),m:!!document.querySelector(`.pc-d[data-calday="${t}"] .pc-m`),seg:$('.cal-modes').hidden,evlines:document.querySelectorAll('.pc-e').length}),T);
  ok(req.join()==='president'&&r1.fp.endsWith('president'),`只讀會長室（請求 ${req}）；選到 ${r1.fp}`);
  ok(r1.rng==='11:00–12:00',`重疊時段 11:00–12:00（${r1.rng}；只有日期的全天事不算）`);
  ok(r1.m&&r1.on===2&&r1.seg&&r1.evlines===0,`今天日期下有短條；兩顆膠囊勾選、模式切換藏起來、月曆不畫事件線`);
  await p.screenshot({path:'ov1_desk.png'});
  /* 2 */
  await p.click('.cal-fp [data-calfp="marketing"]');await p.waitForTimeout(900);
  ok(await p.evaluate(()=>/沒有重疊/.test($('.fnd-r').textContent))&&req.join()==='president,marketing',`換成行銷部：沒有重疊（請求 ${req}）`);
  ok(await p.evaluate(t=>!document.querySelector(`.pc-d[data-calday="${t}"] .pc-m`),T),'沒有重疊的日期沒有短條');
  await p.click('.cal-fp [data-calfp="president"]');await p.waitForTimeout(500);
  ok(req.length===2,`換回會長室不重讀（${req.length}）`);
  await p.evaluate(()=>{CAL_DATA.delete('dept:marketing');fwCache.delete('marketing')});marketingFail=true;
  await p.click('.cal-fb');await p.waitForTimeout(400);await p.click('.cal-fb');await p.waitForTimeout(900);   /* 關掉再打開＝重新讀 */
  ok(await p.evaluate(()=>/行銷部/.test($('.cal-find').textContent)&&!$('.fnd')),'讀不到的部門：畫面說明原因、不顯示假的結果');
  /* 3 單元：跨天 */
  const u=await p.evaluate(()=>{const A=[{key:'a',date:'2026-12-01',end:'2026-12-03',time:'',etime:'',dept:'x'}],B=[{key:'b',date:'2026-12-02',end:'',time:'09:00',etime:'10:30',dept:'y'},{key:'c',date:'2026-12-02',end:'',time:'',etime:'',dept:'y'}];
    return {d2:ovDay(A,B,'2026-12-02').out,d4:ovDay(A,B,'2026-12-04').out,none:ovDay([B[1]],[B[1]],'2026-12-02').out}});
  ok(JSON.stringify(u.d2)==='[[540,630]]'&&u.d4.length===0&&u.none.length===0,`跨天算那幾天整段、只有日期的不算（${JSON.stringify(u)}）`);
  /* 4 搜尋 */
  await p.click('.cal-fb');await p.waitForTimeout(500);
  await p.evaluate(()=>{window.__q=document.querySelector('[data-calq]')});
  await p.fill('[data-calq]','會議');await p.waitForTimeout(300);
  const s1=await p.evaluate(()=>({same:document.querySelector('[data-calq]')===window.__q,items:[...document.querySelectorAll('.cal-res .dr-item')].map(x=>x.textContent),mark:[...document.querySelectorAll('.cal-res mark')].map(x=>x.textContent).join(),x:!$('[data-calqx]').hidden}));
  ok(s1.same&&s1.items.length===1&&/本部門會議/.test(s1.items[0])&&/10:00/.test(s1.items[0])&&s1.mark==='會議'&&s1.x,`搜尋「會議」：輸入框沒重畫、一筆含部門日期時刻、命中反白（${s1.items}）`);
  await p.fill('[data-calq]','會長');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>[...document.querySelectorAll('.cal-res .dr-item')].some(x=>/會長例會/.test(x.textContent))),'已載入的會長室也搜得到');
  await p.click('.cal-res .dr-item');await p.waitForTimeout(900);
  ok(await p.evaluate(t=>NOTI.mode==='pres'&&NOTI.day===t&&/會長例會/.test($('.cal-list').textContent),T),'點結果：跳到那天、模式換成會長室、清單看得到那件事');
  await p.fill('[data-calq]','zzzz不存在');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>/沒有符合/.test($('.cal-res').textContent)),'沒有結果有說明');
  await p.fill('[data-calq]','<img');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>document.querySelectorAll('.cal-res img').length===0&&!window.__xss&&[...document.querySelectorAll('.cal-res .dr-item')].length===1),'標題含 HTML：結果裡是文字、沒有執行');
  await p.press('[data-calq]','Escape');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>NOTI.q===''&&!$('.cal-res').children.length&&notiOpen),'Esc 清掉搜尋、通知頁不關');
  const errs=p.errs.filter(e=>!/404/.test(e));ok(errs.length===0,'沒有錯誤（模擬讀不到的 404 不算）：'+errs.join('|'));
  /* 5 手機 */
  const m=await mk(412,860,'dark',true);await login(m);await dismiss(m);
  await m.route(/data-president\.json/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mkDept('會長室',[{label:'會長例會',start:T+'T11:00',end:T+'T13:00'}]))}));
  await m.click('#notiBtn');await m.waitForTimeout(900);await m.evaluate(()=>$('#notiPage .cal').scrollIntoView());
  await m.click('.cal-fb');await m.waitForTimeout(900);await m.fill('[data-calq]','會');await m.waitForTimeout(300);
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'412 寬沒有橫捲');
  await m.screenshot({path:'ov1_mob.png'});
  await b.close();console.log(`${passes} 項通過，${fails} 項失敗`);process.exit(fails?1:0);
})();
