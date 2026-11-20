/* 標題列左上鍵：部門主頁是「首頁」，進到更深的頁面（設定、設定子頁、通知、進度議題詳情、手機卡片詳情）自動變「上一頁」，一路退回才變回首頁。
   桌面 1300、手機 412；固定 8300 埠；截圖 up1_*.png */
const c=require('./common');c.serveRemote=true;
const A=(ok,m)=>{console.log(ok?'ok  ':'FAIL',m);if(!ok)process.exitCode=1};
(async()=>{const {b,mk}=await c.setup();
for(const [w,h,sc,tc] of [[1300,900,'light',false],[412,860,'light',true]]){c.q='';const p=await mk(w,h,sc,tc);
 await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(500);
 const st=()=>p.evaluate(()=>{const a=document.querySelector('.dh-home');return {up:a.classList.contains('up'),l:a.getAttribute('aria-label'),i:!!a.querySelector('.i-back'),set:setOpen,sub:subOpen,noti:notiOpen,card:!!lvOpen,prog:!!progOpen,depth:Back.depth()}});
 const click=async()=>{await p.click('.dh-home');await p.waitForTimeout(1100)};
 let s=await st();A(!s.up&&s.l==='首頁'&&!s.i,w+' 主頁是首頁鍵');
 await p.evaluate(()=>setSection('done'));await p.waitForTimeout(700);A(!(await st()).up,w+' 切分頁不算更深');
 /* 設定 → 子頁 */
 await p.click('#setBtn');await p.waitForTimeout(900);s=await st();A(s.up&&s.l==='上一頁'&&s.i&&s.set,w+' 設定開著＝上一頁');
 await p.click('#setOv [data-set]');await p.waitForTimeout(1200);s=await st();
 if(w<900)A(s.sub&&s.up,w+' 手機子頁仍是上一頁，且沒有重複的返回膠囊：'+await p.evaluate(()=>!document.querySelector('#subBack,.set-sub-top')));
 await p.screenshot({path:`up1_${w}_set.png`});
 await click();s=await st();A(s.set&&!s.sub&&s.up,w+' 按一下：子頁退回設定清單，仍是上一頁');
 await click();s=await st();A(!s.set&&!s.up&&s.l==='首頁',w+' 再按：設定關掉、變回首頁');
 /* 通知 */
 await p.click('#notiBtn');await p.waitForTimeout(1000);s=await st();A(s.noti&&s.up,w+' 通知頁＝上一頁');
 await click();s=await st();A(!s.noti&&!s.up,w+' 退回主頁變首頁');
 /* 進度議題詳情 */
 await p.evaluate(()=>setSection('progress',{instant:true}));await p.waitForTimeout(700);
 await p.evaluate(()=>progShow(state.issues[0].id));await p.waitForTimeout(900);s=await st();A(s.prog&&s.up,w+' 議題詳情＝上一頁');
 await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(700);A(!(await st()).up,w+' 離開進度分頁就是首頁');
 await p.evaluate(()=>setSection('progress',{instant:true}));await p.waitForTimeout(700);
 await click();s=await st();A(!s.prog&&!s.up,w+' 按上一頁：回甘特圖變首頁');
 /* 手機卡片詳情 */
 if(w<900){await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(700);
  await p.click('#events [data-cp]');await p.waitForTimeout(1200);s=await st();A(s.card&&s.up,w+' 手機卡片詳情（標題列被蓋住）狀態是上一頁');await p.screenshot({path:`up1_${w}_card.png`});
  await p.click('#lcFull [data-lcback]');await p.waitForTimeout(1100);s=await st();A(!s.card&&!s.up,w+' 手機卡片全螢幕蓋住標題列、用卡片自己的返回鈕；退回後是首頁');
  /* 系統返回鍵跟著一致 */
  await p.click('#setBtn');await p.waitForTimeout(900);await p.goBack();await p.waitForTimeout(1000);s=await st();A(!s.set&&!s.up,w+' 系統返回鍵：設定關掉、變回首頁')}
 /* 主頁按首頁鍵＝離開看板 */
 await p.click('.dh-home');await p.waitForTimeout(1500);A(/home\.html/.test(p.url()),w+' 主頁按首頁鍵：離開看板 '+p.url());
 const er=p.errs.filter(x=>!x.includes('404'));A(!er.length,w+' 沒有錯誤 '+er.join('|'));await p.context().close()}
await b.close()})();
