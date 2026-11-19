/* v2b：補充測試（身分、匯出匯入備份、週報與議題刪除的確認、忘記這台裝置、減少動態）。桌面 1300，固定 8300 埠；逐項判斷、壞了以非 0 結束。
   2026-11-15（03 T4）改寫：修改前就在「新增專員」（#newStaff）那一步壞了。拿掉測已不存在功能的段落：
   新增專員（專員就是身分，設定頁「身分」面板裡已經沒有另外的專員名單）、匯出定型版與唯讀（定型版）（功能已移除，交接說明第八節第 8 項）、
   頁首「編輯」中改設定併入這次編輯（頁首編輯模式已拿掉，改成單卡編輯）、工作報告對話框（rp1.js 涵蓋）。
   還有效的段落改用現在的入口：設定頁合併頁（[data-set] → [data-hub]）、議題詳情卡自己的「編輯」 */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk,login}=await c.setup();
const p=await mk(1300,860,'light',false);await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
await p.evaluate(()=>{window.showSaveFilePicker=undefined});
await login(p);
const dlgTitle=()=>p.evaluate(()=>$('#dlg').open?($('#dlgForm b')||{}).textContent:null);
const setOpen_=async()=>{await p.evaluate(()=>{if(!setOpen)$('#setBtn').click()});await p.waitForTimeout(700)};
const setClose=async()=>{await p.evaluate(()=>{if(setOpen)closeSettings(true)});await p.waitForTimeout(400)};
const hub=async(set,k)=>{await setOpen_();await p.click(`#setOv [data-set=${set}]`);await p.waitForTimeout(600);if(k){await p.click(`[data-hub=${k}]`);await p.waitForTimeout(600)}};
/* 身分（專員從這些身分挑選） */
await setOpen_();await p.click('#setOv [data-set=team]');await p.waitForTimeout(700);
ok(await p.evaluate(()=>!!document.querySelector('[data-x=done]')&&[...document.querySelectorAll('.tm-list li')].some(l=>l.textContent.includes('王'))),'身分面板：列出身分（含剛建立的「王」）');
await p.click('[data-x=done]');await p.waitForTimeout(600);await setClose();
/* 匯出備份、匯入備份 */
const dl=p.waitForEvent('download',{timeout:8000});await hub('backup','export');const d=await dl.catch(()=>null);
const dj=d?await d.path().then(f=>JSON.parse(require('fs').readFileSync(f,'utf8'))).catch(()=>null):null;   /* 檔名在測試的 Chromium 裡是 download（連結點完馬上收掉），只看內容 */
ok(!!dj&&Array.isArray(dj.events)&&dj.title===await p.evaluate(()=>state.title),'匯出備份：下載看板內容的 JSON');
await p.click('#dlgForm [data-x=close]').catch(()=>{});await p.waitForTimeout(400);
const fc=p.waitForEvent('filechooser',{timeout:5000});await p.click('[data-hub=import]');const f=await fc.catch(()=>null);
ok(!!f,'匯入備份：打開選檔');await setClose();
/* 週報刪除：登入就有刪除鍵，按了先確認；取消就不刪，摘要列不跟著開合 */
await hub('report','week');
const wn=await p.evaluate(()=>state.weeks.length),vis=await p.$$eval('.week .week-del',x=>x.filter(e=>e.offsetParent).length);
ok(vis>0,'週報摘要列有刪除鍵 '+vis);
const w0=await p.$('.week:has(.week-del)');const wasOpen=await w0.evaluate(d=>d.open);await (await w0.$('.week-del')).click();await p.waitForTimeout(500);
const wt=await dlgTitle();ok(/^刪除/.test(wt||''),'週報刪除先確認：'+wt);
await p.keyboard.press('Escape');await p.waitForTimeout(400);
ok(await p.evaluate(()=>state.weeks.length)===wn&&wasOpen===await w0.evaluate(d=>d.open),'取消就不刪、摘要列不跟著開合');
await setClose();
/* 議題刪除：詳情卡「編輯」後工具列的刪除，按了先確認 */
const iid=await p.evaluate(()=>activeIssues()[0].id);await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},iid);await p.waitForTimeout(900);
await p.click('#cardDetail .card-edit-btn');await p.waitForTimeout(700);await p.click('#cardDetail [data-delissue]');await p.waitForTimeout(500);
const it=await dlgTitle();ok(/^刪除「.+」？$/.test(it||''),'議題刪除先確認：'+it);
await p.keyboard.press('Escape');await p.waitForTimeout(400);
ok(await p.evaluate(id=>state.issues.some(i=>i.id===id),iid),'取消就不刪');
await p.click('#cardDetail [data-edcancel]');await p.waitForTimeout(600);
/* 忘記這台裝置 */
await p.evaluate(async()=>{await remSave(meMember())});await hub('device');
/* ui-08（DESIGN-next 第十二節，DievE 11/16 定）：列下面不放小字、目前的值也不放，所以不再寫出記住誰；只看可以按、名稱只有「忘記這台裝置」 */
ok(await p.$eval('[data-hub=forget]',e=>e.getAttribute('aria-disabled')!=='true'&&e.textContent.trim()==='忘記這台裝置'),'有記住身分時「忘記這台裝置」可以按（列上只有名稱）');
await p.click('[data-hub=forget]');await p.waitForTimeout(400);
ok(await p.evaluate(()=>!localStorage.getItem(REM_KEY)&&!loggedIn()),'忘記後清掉記住的身分、登出');
await setClose();
ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
/* 減少動態：切區塊時沒有在跑的動畫 */
await p.emulateMedia({reducedMotion:'reduce'});await p.reload();await p.waitForTimeout(1800);
await p.evaluate(()=>setSection('done'));await p.waitForTimeout(100);
const n=await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('.layout')).length);
ok(n===0&&await p.evaluate(()=>curSec)==='done','減少動態：切到完成紀錄沒有在跑的動畫 '+n);
ok(!p.errs.filter(e=>!/Failed to load resource/.test(e)).length,'減少動態沒有錯誤 '+p.errs.join(' | '));   /* 重新整理後 data-*.json 等找不到的檔案（404）不算 */
await b.close();process.exit(bad?1:0)})();
