/* dl1：刪除即時回報的確認（ui-05 起是把膠囊拖到左上角，live.js 的 lvDelete；以前是編輯中卡片的 [data-evdel]）。先問「刪除「名稱」？」；卡片有時間標記時再問「一起刪掉 N 個時間標記？」，
   兩次都按「刪除」才刪掉並儲存，任一次取消都留著；沒有時間標記的卡片只問一次。
   data_test.json 的即時回報都沒有時間標記，測試在頁面裡替第一張未完成的加 2 個（不改資料檔）。桌面 1300；預設 8300 埠，可用 PORT 改 */
const {chromium}=require('playwright');const fs=require('fs');
const URL='http://127.0.0.1:'+(process.env.PORT||8300)+'/index.html';
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;process.exitCode=1}console.log((c?'通過 ':'失敗 ')+m)};
(async()=>{const b=await chromium.launch();
let remote=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8')),sha='s0';const commits=[];
const ctx=await b.newContext({viewport:{width:1300,height:900},serviceWorkers:'block'});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await ctx.route('https://api.github.com/**',async r=>{const q=r.request(),u=q.url();
  if(u.includes('/commits?'))return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(q.method()==='GET'){if(!u.includes('data.json'))return r.fulfill({status:404,body:'{}'});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sha,content:Buffer.from(JSON.stringify(remote)).toString('base64')})})}
  const bd=JSON.parse(q.postData());const j=JSON.parse(Buffer.from(bd.content,'base64').toString());if(u.includes('data.json'))remote=j;sha='s'+Date.now();commits.unshift(bd.message);
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:{sha}})})});
const p=await ctx.newPage();const errs=[];p.on('pageerror',x=>errs.push(x.message));
await p.goto(URL);await p.waitForFunction(()=>document.body&&!document.body.classList.contains('intro')&&document.querySelector('#tabbar .tab'));await p.waitForTimeout(900);
/* 登入（共用密碼 0000 → 建立身分「王」；同 common.js） */
await p.evaluate(()=>localStorage.setItem('workboard:ghtoken','T'));await p.click('#setBtn');await p.waitForTimeout(800);await p.click('#setOv .set-gate .primary');await p.waitForTimeout(400);
await p.fill('#dlgForm input[name=pw]','0000').catch(()=>{});await p.click('#dlgForm [data-act=ok]').catch(()=>{});await p.waitForTimeout(500);
await p.fill('#dlgForm input[name=name]','王').catch(()=>{});await p.fill('#dlgForm input[name=p1]','password-long-1').catch(()=>{});await p.fill('#dlgForm input[name=p2]','password-long-1').catch(()=>{});await p.click('#dlgForm [data-act=ok]').catch(()=>{});await p.waitForTimeout(1500);
/* 共用密碼 0000 太短：建立身分、儲存後會跳「共用密碼太短」請管理員換（team.js 的 sharedPwFix），測試先取消 */
const pwFix=async(n=4)=>{for(let i=0;i<n;i++){await p.waitForTimeout(500);const t=await p.$eval('#dlg[open] #dlgForm>b',b=>b.textContent).catch(()=>'');if(/共用密碼太短|沒有連上雲端/.test(t))await p.click('#dlgForm [data-act=cancel]').catch(()=>{})}};
await pwFix();
await p.evaluate(()=>{if(setOpen)closeSettings(true)});await p.waitForTimeout(300);
await p.click('#tabbar [data-tab=live]');await p.waitForTimeout(800);
ok(await p.evaluate(()=>loggedIn()),'已登入');

const dlgTitle=()=>p.evaluate(()=>$('#dlg').open?($('#dlgForm b')||{}).textContent:null);
const act=async a=>{await p.click(`#dlg [data-act="${a}"]`);await p.waitForTimeout(600)};
const has=id=>p.evaluate(i=>!!state.events.find(e=>e.id===i),id);
/* ui-05：即時回報卡片沒有刪除鈕，刪除＝把膠囊拖到左上角放開（live.js 的 lvDelete，確認流程不變），不用先進入編輯 */
let cur=null;
const startEdit=async id=>{await pwFix(7);const left=await dlgTitle();if(left)console.log('（還開著的對話框：'+left+'）');await p.evaluate(()=>{if(editing)cancelEdit();lvOpen=null;render()});await p.waitForTimeout(400);
  cur=id;return p.evaluate(i=>!editing&&!!document.querySelector(`#events .cp[data-cp="${i}"]`),id)};
const del=async()=>{const r=await p.$eval(`#events .cp[data-cp="${cur}"]`,e=>{const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}});
  await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x+10,r.y,{steps:3});await p.mouse.move(20,20,{steps:12});await p.mouse.up();await p.waitForTimeout(700);return dlgTitle()};

/* 準備：第一張未完成的加 2 個時間標記，第二張確定沒有 */
const [idT,nameT,idN]=await p.evaluate(()=>{const L=liveOrder(),a=L[0],c=L[1];
  a.times=[{id:uid('t'),label:'測試一',start:'2027-01-10T10:00',end:'',place:''},{id:uid('t'),label:'測試二',start:'2027-01-12T14:00',end:'',place:''}];c.times=[];render();return [a.id,a.name,c.id]});
ok(idT&&idN&&idT!==idN,'找到兩張未完成的即時回報 '+nameT);

/* (0) 有時間標記：第一次就取消 → 只出現一個對話框，卡片留著 */
ok(await startEdit(idT),'(0) 準備有時間標記的卡片（拖到左上角刪除）');
let t=await del();ok(t===`刪除「${nameT}」？`,'(0) 第一個對話框標題：'+t);
await act('cancel');ok(await dlgTitle()===null,'(0) 取消第一個後沒有第二個對話框');ok(await has(idT),'(0) 卡片還在');

/* (1) 有時間標記：確認第一個 → 第二個「一起刪掉 2 個時間標記？」→ 取消 → 卡片留著 */
t=await del();ok(/^刪除「/.test(t||''),'(1) 第一個對話框標題以「刪除「」開頭：'+t);
await act('delete');t=await dlgTitle();ok(t==='一起刪掉 2 個時間標記？','(1) 第二個對話框標題：'+t);
ok(await p.$eval('#dlg [data-act="delete"]',x=>x.textContent.trim())==='刪除','(1) 第二個對話框的危險鈕是「刪除」');
await act('cancel');ok(await dlgTitle()===null,'(1) 取消後對話框關閉');ok(await has(idT),'(1) 第二個取消：卡片還在 state.events');
ok(await p.evaluate(i=>state.events.find(e=>e.id===i).times.length,idT)===2,'(1) 時間標記沒被動到');

/* (2) 再刪一次，兩個都確認 → 卡片不見並儲存 */
const c0=commits.length;
t=await del();ok(/^刪除「/.test(t||''),'(2) 第一個對話框：'+t);await act('delete');
t=await dlgTitle();ok(t==='一起刪掉 2 個時間標記？','(2) 第二個對話框：'+t);await act('delete');await p.waitForTimeout(1500);
ok(!(await has(idT)),'(2) 兩次都確認：卡片從 state.events 刪掉');
ok(commits.length>c0&&!remote.events.some(e=>e.id===idT),'(2) 已儲存，遠端也沒有這張 '+(commits[0]||'').split('\n')[0]);

/* (3) 沒有時間標記：只問一次，確認就刪掉 */
ok(await startEdit(idN),'(3) 準備沒有時間標記的卡片（拖到左上角刪除）');
const c1=commits.length;
t=await del();ok(/^刪除「/.test(t||''),'(3) 對話框：'+t);await act('delete');
ok(await dlgTitle()===null,'(3) 沒有第二個對話框');await p.waitForTimeout(1500);
ok(!(await has(idN)),'(3) 卡片從 state.events 刪掉');
ok(commits.length>c1&&!remote.events.some(e=>e.id===idN),'(3) 已儲存，遠端也沒有這張');

ok(!errs.length,'沒有頁面錯誤 '+errs.join(' | '));
console.log(`dl1：通過 ${pass}，失敗 ${fail}`);
await b.close()})().catch(e=>{console.log('失敗 例外：',e.message);process.exitCode=1;process.exit(1)});
