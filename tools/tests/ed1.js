/* 單卡編輯（2026-11-06，render.js 的 cardEdit）：頁首沒有「編輯」；沒登入看不到任何編輯鈕與新增鈕；
   登入後：即時回報卡沒有「編輯」鈕（03 T7），點一行或名稱 → 只有那張進入原位編輯，其他編輯鈕藏起來；改名稱 → 儲存（寫一筆 commit）；
   即時回報卡沒有「取消」：沒改就點外面只收合、不寫 commit（03 T6 改規格，原本的「取消會還原」）；新增議題 → 名稱原地打開，沒命名就 Esc＝不留（ui-08）；
   甘特圖時間軸、議題詳情、完成紀錄各自的「編輯」；週報頁登入就有新增、編輯。手機 412 與桌面 1300。固定 8300 埠。
   03 F5（2026-11-17）：原本只印出數值、不會失敗（原本壞的那一步——1300 點詳情說明欄被 .wrap 擋住的「取消會還原」——在 03 T6 已照新規格改寫，
   之後一直通過，但因為只印不判斷，壞了也看不出來），改成每一步都判斷、最後印「全部通過」並用結束碼表示結果；沒改就點外面不寫 commit 兩種寬度都測
   ui-05（2026-11-17）：膠囊（.cp）與卡片（.lc）換新介面；沒有「儲存」鈕，1300 點外面、412（全螢幕卡片）按返回鍵存檔；編輯中的那一列（bars）多算 .lc-ed；完成紀錄點膠囊打開卡片 */
const c=require('./common');(async()=>{
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'通過 ':'失敗 ')+m);if(v)passes++;else fails++};
const vis=(p,sel)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>(e.offsetParent!==null||getComputedStyle(e).position==="fixed"&&e.checkVisibility())&&getComputedStyle(e).display!=="none").length,sel);   /* ui-04：新增即時回報是浮動圓鈕（position:fixed，offsetParent 一定是 null），固定定位的看 checkVisibility */
const S=p=>p.evaluate(()=>({editing,cardEdit,dirty,bars:document.querySelectorAll('.card-edbar,.lc-ed').length,secEdit:[...document.querySelectorAll('.sec-edit')].map(e=>e.dataset.edbox)}));
for(const [w,touch] of [[412,true],[1300,false]]){const {b,mk,login,st}=await c.setup();   /* 每種寬度都從沒有身分的資料開始 */
  const p=await mk(w,860,'dark',touch);await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
  ok(!(await p.$('#editBtn'))&&await vis(p,'.card-edit-btn')===0&&await vis(p,'#addEvent,#addIssue')===0,`${w} 沒登入：頁首沒有「編輯」、沒有編輯鈕與新增鈕`);
  await login(p);
  ok(await p.evaluate(()=>document.body.classList.contains('authed'))&&await vis(p,'#addEvent')===1,`${w} 登入後：可以新增即時回報`);
  /* 即時回報：卡片上沒有「編輯」鈕（收合、展開、右側詳情都沒有） */
  await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);
  const id=await p.evaluate(()=>liveOrder()[0].id);
  await p.evaluate(()=>{lvOpen=null;render()});await p.waitForTimeout(300);
  ok(await vis(p,`.cp[data-ev="${id}"] .card-edit-btn`)===0&&await p.evaluate(()=>!lvOpen),`${w} 即時回報膠囊：沒有「編輯」鈕`);
  await p.click(`#events .cp[data-cp="${id}"]`);await p.waitForTimeout(w<1000?700:900);
  ok(await vis(p,'.lc .card-edit-btn')===0,`${w} 即時回報卡片${w<1000?'（全螢幕）':'（右側）'}：沒有「編輯」鈕（點一行或名稱開始）`);
  const btn='.lc:not(.lc-ghost) .lc-title[data-kpgo]';
  await p.click(btn);await p.waitForTimeout(700);
  {const s=await S(p);ok(s.editing&&s.cardEdit===`e:${id}`&&s.bars===1&&await vis(p,'.card-edit-btn')===0&&await vis(p,'#addEvent')===0,`${w} 點名稱：只有這張進入原位編輯，其他編輯鈕、新增鈕藏起來（${JSON.stringify(s)}）`);}
  const box='.lc:not(.lc-ghost)',out=w<1000?`${box} [data-lcback]`:'#evH';   /* ui-05：沒有「儲存」鈕；寬螢幕點卡片外面、全螢幕卡片按返回鍵＝存檔 */
  /* 03：即時回報卡是原位編輯器（名稱直接改）；ui-05：存檔＝點外面或返回鍵 */
  const n0c=st.commits.length;
  await p.fill(`${box} [data-kptitle]`,'改過的名稱');await p.waitForTimeout(200);
  await p.click(out);await p.waitForTimeout(3200);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(400);   /* 存完 2.6 秒後會跳「共用密碼太短」提醒（測試資料是 0000），關掉 */
  {const s=await S(p),nm=await p.evaluate(i=>state.events.find(e=>e.id===i).name,id),cm=(st.commits[0]||'').split('\n')[0];
    ok(!s.editing&&nm==='改過的名稱'&&st.commits.length===n0c+1&&/即時回報｜改名 .*→改過的名稱/.test(cm),`${w} 改名稱 → 儲存：結束編輯、寫一筆 commit（${cm}）`);}
  /* 即時回報卡沒有「取消」：沒改就點外面＝只收合、不寫 commit */
  {const n=st.commits.length;
    if(w<1000){await p.click(`#events .cp[data-cp="${id}"]`);await p.waitForTimeout(800)}
    await p.click(btn);await p.waitForTimeout(600);
    ok(await p.evaluate(()=>editing)&&!(await p.$(`${box} [data-edcancel]`)),`${w} 即時回報卡編輯中：沒有「取消」`);
    await p.click(out);await p.waitForTimeout(800);
    const s=await S(p);ok(st.commits.length===n&&!s.editing&&s.bars===0,`${w} 沒改就點外面（全螢幕：返回鍵）：只離開編輯、沒有寫 commit（${JSON.stringify(s)}）`);
    if(w<1000&&await p.evaluate(()=>!!lvOpen)){await p.click(`${box} [data-lcback]`);await p.waitForTimeout(800)}else if(w>=1000){await p.click('#evH');await p.waitForTimeout(600)}}
  /* 進度：新增議題＝開始編輯空白議題；取消就不留 */
  await p.evaluate(()=>{setSection('progress',{instant:true});progShow(null)});await p.waitForTimeout(700);
  const n0=await p.evaluate(()=>state.issues.length);
  ok(await vis(p,'#ganttEdBtn')===1&&await vis(p,'#addIssue')===1,`${w} 進度：甘特圖「編輯」與新增議題`);
  await p.click('#addIssue');await p.waitForTimeout(900);
  {const s=await S(p);ok(s.editing&&s.cardEdit.startsWith('i:')&&!!(await p.$('#cardDetail input[data-iname]'))&&s.bars===0,`${w} 新增議題：開始編輯空白議題、名稱原地打開（ui-08：只開名稱，沒有「取消｜儲存」）（${JSON.stringify(s)}）`);}
  await p.keyboard.press('Escape');await p.waitForTimeout(900);
  {const s=await S(p);ok(await p.evaluate(()=>state.issues.length)===n0&&!s.editing,`${w} 新增議題沒命名就 Esc：不留`);}
  /* 甘特圖時間軸：整區編輯 */
  await p.evaluate(()=>progShow(null));await p.waitForTimeout(500);await p.click('#ganttEdBtn');await p.waitForTimeout(600);
  {const s=await S(p);ok(s.cardEdit==='s:gantt'&&await vis(p,'#pvGantt .range')===1,`${w} 甘特圖時間軸：整區編輯、出現期間`);}
  await p.click('#pvGantt [data-edcancel]');await p.waitForTimeout(700);
  /* 議題詳情的「編輯」 */
  const iid=await p.evaluate(()=>activeIssues()[0].id);await p.evaluate(i=>progShow(i),iid);await p.waitForTimeout(800);
  ok(await vis(p,'#cardDetail .card-edit-btn')===1&&await vis(p,'#cardDetail .card-tools')===0,`${w} 議題詳情：有「編輯」，工具列平常藏起來`);
  await p.click('#cardDetail .card-edit-btn');await p.waitForTimeout(700);
  {const s=await S(p);ok(s.cardEdit===`i:${iid}`&&await vis(p,'#cardDetail .card-tools')===1,`${w} 議題按「編輯」：只有這張進入編輯、出現工具列`);}
  await p.click('#cardDetail [data-edcancel]');await p.waitForTimeout(700);
  /* 完成紀錄：展開才有「編輯」 */
  await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(600);
  await p.evaluate(()=>doneWeekShow(wkStart(doneItems()[0].d),{instant:true}));await p.waitForTimeout(300);   /* 完成紀錄先列週資料夾：進到最新的一週 */
  const did=await p.evaluate(()=>document.querySelector('#doneList .cp').dataset.done);
  await p.click(`#doneList .cp[data-cp="${did}"]`);await p.waitForTimeout(900);
  const dbtn='.lc:not(.lc-ghost) .card-edit-btn';
  ok(await vis(p,dbtn)===1,`${w} 完成紀錄卡片：有「編輯」`);
  await p.click(dbtn);await p.waitForTimeout(700);
  {const s=await S(p);ok(s.cardEdit===`e:${did}`&&await vis(p,'.sec-edit .evfs')>=1,`${w} 完成紀錄按「編輯」：進入逐欄編輯`);}
  await p.click('.sec-edit [data-edcancel]');await p.waitForTimeout(700);
  /* 每週報告（完成紀錄的週頁）：登入就有新增、編輯 */
  await p.evaluate(()=>{setSection('done',{instant:true});doneWeekShow(wkStart(state.weeks[0].date),{instant:true})});await p.waitForTimeout(600);
  ok(await p.evaluate(()=>[...document.querySelectorAll('[data-addweek],[data-editweek]')].filter(e=>getComputedStyle(e).display!=='none').length)>=2,`${w} 每週報告：登入就有新增、編輯`);
  ok(!p.errs.length,`${w} 沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);await b.close();
}
console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
