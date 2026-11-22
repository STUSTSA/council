/* 左上角「上一頁」鍵（views.js 的 homeSync／homeUp、back.js）：走過各個會把它變成上一頁的畫面，
   每一關都檢查三件事：(1) 鍵上沒有東西蓋著（elementFromPoint 命中的是鍵本身）；(2) 按了真的退一層（Back 疊的層數少一、畫面上那一層消失）；
   (3) 全部退完鍵變回「首頁」、Back 疊是空的、瀏覽紀錄沒有殘留（history.state 為空）。
   重點案例：手機上開著即時回報／完成紀錄的卡片，卡片因為資料變動被收掉（結案、被刪）時，Back 疊裡的「card」那一層也要跟著拿掉，
   不然鍵還是「上一頁」、按了沒有任何反應（2026-11-21 DievE 回報「左上返回鍵有時候會失效」）。
   用法：在網站根目錄（含 data.json）開 python3 -m http.server 8300 後 node bk4.js；手機寬 412、桌面寬 1300 各跑一次 */
const C=require('./common.js');
let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);c?pass++:fail++};
(async()=>{
const {b,mk,login}=await C.setup(__dirname+'/data_test.json');
for(const [w,h,touch] of [[412,880,true],[1300,860,false]]){
  const p=await mk(w,h,'light',touch);await login(p);const tag=`${w}px `;
  await p.evaluate(()=>{if(setOpen)closeSettings(true);const d=document.querySelector('#dlg');if(d&&d.open)d.close()});await p.waitForTimeout(500);   /* 桌面版登入後可能還留著對話框 */
  const tap=async sel=>{try{await (touch?p.tap(sel,{timeout:4000}):p.click(sel,{timeout:4000}))}catch(e){ok(false,`${tag}點不到 ${sel}：${String(e.message).split('\n').slice(0,1)}／${String((e.message.match(/- (<[^\n]{0,90})/)||[])[1])}`)}await p.waitForTimeout(900)};
  const S=()=>p.evaluate(()=>({d:Back.depth(),top:Back.top(),up:document.querySelector('.dh-home').classList.contains('up'),hs:history.state&&history.state.bl||null}));
  /* 鍵的位置上命中的東西：鍵本身，或全螢幕卡片自己的返回鍵（[data-lcback]，手機卡片蓋住標題列、同一個位置放它自己的返回鍵）；其他東西蓋著就是失效 */
  const hit=()=>p.evaluate(()=>{const e=document.querySelector('.dh-home'),r=e.getBoundingClientRect(),x=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!(x&&x.closest('.dh-home,[data-lcback]'))});
  const tapBack=async()=>{const r=await p.evaluate(()=>{const r=document.querySelector('.dh-home').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]});await (touch?p.touchscreen.tap(...r):p.mouse.click(...r));await p.waitForTimeout(900)};
  /* 退到底：每按一次層數要減少；回傳按了幾次 */
  const unwind=async(name)=>{let n=0;for(;;){const s=await S();if(!s.up&&s.d===0)break;if(n>6){ok(false,`${tag}${name}：按了 ${n} 次還退不完（${JSON.stringify(s)}）`);return}
      ok(await hit(),`${tag}${name}：第 ${n+1} 次，鍵上沒有東西蓋著`);await tapBack();n++;const t=await S();if(t.d>=s.d&&(t.top===s.top)){ok(false,`${tag}${name}：按了沒有退（${JSON.stringify(s)}→${JSON.stringify(t)}）`);return}}
    const e=await S();ok(e.d===0&&!e.up&&!e.hs,`${tag}${name}：退完＝首頁鍵、Back 疊空、瀏覽紀錄乾淨（${JSON.stringify(e)}）`)};
  /* 設定各子頁 */
  await tap('#setBtn');await unwind('設定');
  for(const k of ['report','log','team','labels','backup']){
    await tap('#setBtn');if(!await p.$(`#setOv [data-set=${k}]`)){await tap('#setBtn');continue}
    await tap(`#setOv [data-set=${k}]`);await unwind('設定→'+k)}
  /* 通知與行事曆 */
  await tap('#notiBtn');await unwind('通知與行事曆');
  /* 進度：議題詳情 */
  await tap('#tabbar [data-tab=progress]');
  if(await p.$('#pvGantt [data-issue], #pvGantt [data-gi]')){await tap('#pvGantt [data-issue], #pvGantt [data-gi]');await unwind('進度議題詳情')}
  /* 完成紀錄：某一週、某一週裡的卡片 */
  await tap('#tabbar [data-tab=done]');
  if(await p.$('#wksWal')){await tap('#wksWal .hm-wc.on');await unwind('完成紀錄某一週');
    await tap('#wksWal .hm-wc.on');if(await p.$('#doneList [data-cp]')){await tap('#doneList [data-cp]');await unwind('完成紀錄某一週的卡片')}else await unwind('完成紀錄某一週')}
  /* 即時回報卡片（手機＝全螢幕，Back 疊有 card；桌面分欄不登記）：開著卡片時資料把它收掉 */
  await tap('#tabbar [data-tab=live]');
  await tap('#events [data-cp]');await unwind('即時回報卡片');
  await tap('#events [data-cp]');
  await p.evaluate(()=>{const e=state.events.find(x=>x.id===lvOpen);if(!e)return;e.status='done';e.doneAt=today();render()});await p.waitForTimeout(700);
  await unwind('即時回報卡片被結案收掉');
  /* 完成紀錄的卡片被刪掉 */
  await tap('#tabbar [data-tab=done]');
  if(await p.$('#wksWal')){await tap('#wksWal .hm-wc.on');
    if(await p.$('#doneList [data-cp]')){await tap('#doneList [data-cp]');
      await p.evaluate(()=>{const id=dnOpen;state.events=state.events.filter(x=>x.id!==id);state.issues=state.issues.filter(x=>x.id!==id);render()});await p.waitForTimeout(700);
      await unwind('完成紀錄卡片被資料收掉')}else await unwind('完成紀錄某一週')}
  /* 系統返回鍵：設定 → 子頁，連按兩次系統返回，要回到首頁鍵、頁面沒有離開 */
  await tap('#setBtn');if(await p.$('#setOv [data-set=report]')){await tap('#setOv [data-set=report]');
    await p.goBack();await p.waitForTimeout(900);await p.goBack();await p.waitForTimeout(900);
    const s=await S();ok(s.d===0&&!s.up&&/index\.html/.test(p.url()),`${tag}系統返回鍵退兩層：回到看板（${JSON.stringify(s)}）`)}
  ok(p.errs.length===0,`${tag}沒有 JS 錯誤 ${p.errs.join('|')}`);
  await p.context().close();
}
console.log(`\n${pass} 通過，${fail} 失敗`);await b.close();process.exit(fail?1:0)})();
