/* 02D firestore 模式的看板寫入（core/js/store-write.js、store.js 的 fsPersist、store-map.js 的 desired）：
   用 Auth 模擬器＋Firestore 模擬器、正式規則；權益部用遷移程式（backend/migrate/run.js）匯入後切成 firestore。
   1. 未登入、一般登入者：唯讀（沒有編輯鈕、儲存不寫入）
   2. 編輯者（角色即時生效）：新增卡片、改內容、加／拿掉時間標記、結案、完成這一段（時間標記換卡片）、新增議題／週報／標籤、
      永久刪除有時間標記的卡片（兩次確認、刪除紀錄有標題）；看不到管理員與總管理員才有的項目
   3. 管理員：設定頁沒有看板名稱（標題固定用部門名稱，不寫 deptSettings）
   4. 衝突（別人剛存過）：不寫入、畫面上的修改留著、可以重新載入
   5. 撤權：畫面即時變回唯讀；編輯中按儲存被規則擋下、修改留著；直接呼叫寫入也被拒
   6. 其他部門的 Firestore 文件前後完全相同；沒有頁面錯誤
   7. 編輯紀錄（版本歷史；總管理員加上稽核紀錄）、會長室在 firestore 模式的各部門編輯量（讀不到的部門顯示「—」）（02D D3，跑在第 6 段之前）；讀取失敗時畫面只寫「讀取失敗」、原始錯誤進 console（2026-11-20）
   8. 文件 ID 與欄位帶 HTML（02D 審查 P0）：ID 不合格的文件不顯示、欄位值跳脫，總管理員打開看板不執行（跑在第 6 段之前）
   9. 中斷的永久刪除（timeIds 有不存在的時間標記）不擋別的修改、會接著清完；兩個編輯者同時接著清不會卡住（02D 審查 P1）
   10. 分批儲存中途失敗（route 擋下第二個 commit）：重新讀、只補寫剩下的，完成這一段的時間標記不重複（02D 審查 P1）
   11. 裝置上 github 模式留下的本機暫存（比 Firestore 新、帶雲端設定與權杖）：切到 firestore 後不讀進畫面、不存回 Firestore、不讀寫 GitHub（02D D-e）
   執行（會自己開模擬器與網站）：cd backend && npm run test:web
   只連本機模擬器；Firebase SDK 從 backend/node_modules 供應（route 掉 gstatic），不連外。 */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');const crypto=require('crypto');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8303,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board',DEPT='rights';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};

(async()=>{
  await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  const {initializeTestEnvironment}=breq('@firebase/rules-unit-testing');const firebase=breq('firebase/compat/app');breq('firebase/compat/firestore');
  const [h,pt]=EMU.split(':');
  const t=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:h,port:+pt,rules:fs.readFileSync(path.join(ROOT,'backend/firestore.rules'),'utf8')}});
  await t.clearFirestore();
  await fetch(`http://${AEMU}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
  const TS=firebase.firestore.Timestamp;
  const admin=fn=>t.withSecurityRulesDisabled(async c=>fn(c.firestore()));
  const read=async p=>{let v;await admin(async d=>{const s=await d.doc(p).get();v=s.exists?s.data():null});return v};
  /* 遷移：總管理員經過正式規則匯入全部部門（跟 fs1.js 一樣） */
  const tok=uid=>({sub:uid,user_id:uid,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{}}});
  await admin(d=>d.doc('roles/su').set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedBy:'su',updatedAt:TS.now()}));
  const mig=await import(path.join(ROOT,'backend/migrate/run.js'));
  await mig.runImport(t.authenticatedContext('su',tok('su')).firestore(),firebase.firestore.FieldValue,TS,mig.loadSources(),{batch:'fw-test',uid:'su'});
  /* 其他部門的全部文件（含版本與稽核紀錄以外的看板內容）：前後比對雜湊 */
  const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,y)=>(o[y]=x[y],o),{}):x);
  const others=async()=>{const out={};await admin(async d=>{
    for(const c of ['cards','events','issues','weeks','labels','legacyIdentities']){const qs=await d.collection(c).get();
      for(const s of qs.docs){const x=s.data();if(x.deptId===DEPT)continue;out[`${c}/${s.id}`]=x;
        if(c==='cards')for(const v of (await d.collection(`cards/${s.id}/versions`).get()).docs)out[`cards/${s.id}/versions/${v.id}`]=v.data()}}
    for(const s of (await d.collection('deptSettings').get()).docs)if(s.id!==DEPT)out[`deptSettings/${s.id}`]=s.data();
  });return {n:Object.keys(out).length,h:crypto.createHash('sha256').update(stable(out)).digest('hex')}};
  const before=await others();

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');   /* 每個部門先回到預設的 github，下面再照這支測試要的切換（不依賴正式網站目前哪些部門已切換，例如水果部實測時是 firestore） */
  const pages=[];
  const open=async(dept=DEPT,fsDepts=[DEPT],init=null)=>{
    const ctx=await b.newContext({viewport:{width:900,height:850},serviceWorkers:'block'});
    if(init)await ctx.addInitScript(init.fn,init.arg);   /* 開頁前先放進這台裝置的東西（第 11 段：github 模式留下的本機暫存） */
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    const puts=[],gets=[];await ctx.route('https://api.github.com/**',r=>{if(r.request().method()!=='GET')puts.push(r.request().url());else gets.push(r.request().url());r.fulfill({status:404,body:'{}'})});
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of fsDepts)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.toasts=[];p.puts=puts;p.gets=gets;p.on('pageerror',e=>p.errs.push(e.message));
    await p.exposeFunction('__toast',m=>p.toasts.push(m));
    await p.addInitScript(()=>{new MutationObserver(()=>{const t=document.querySelector('#toast');if(t&&t.textContent&&t.classList.contains('show'))window.__toast(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true})});
    await p.goto(`${BASE}/index.html?d=${dept}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1500);
    p.ctx=ctx;pages.push(p);return p};
  const signIn=async(p,sub)=>{await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    return p.waitForFunction(()=>acct.user&&acct.user.uid&&storeFsBase,null,{timeout:10000}).then(()=>p.evaluate(()=>acct.user.uid))};
  const setRole=(uid,depts,sup=false)=>admin(d=>d.doc(`roles/${uid}`).set({super:sup,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  /* editBtns：看得到的編輯鈕、新增鈕；部門內一次只顯示一區（ui-04）之後，別的分頁裡、切過去就看得到的也算（以前桌面全部區塊同時顯示） */
  const ui=p=>p.evaluate(()=>({locked:boardLocked(),authed:document.body.classList.contains('authed'),
    editBtns:[...document.querySelectorAll('.card-edit-btn,.auth-only')].filter(x=>x.offsetParent||x.closest('.sgroup:not(.cur)')&&getComputedStyle(x).display!=='none'&&!x.closest('details:not([open])')).length,cards:state.events.length}));
  const toastHas=(p,s)=>until(()=>p.toasts.some(x=>x.includes(s)));
  const settled=p=>until(()=>p.evaluate(()=>!fsBusy&&storeFsBase&&!document.querySelector('#dlg[open]')),15000).then(()=>sleep(300));
  /* 新增圓鈕（ui-04）只在即時回報分頁、沒有卡片打開時出現：點之前先回到即時回報、收合打開的卡片 */
  const liveTop=p=>p.evaluate(()=>{if(curSec!=="live")setSection("live",{instant:true});lvOpen=null;dnOpen=null;render()}).then(()=>p.waitForTimeout(400));
  /* ui-05：新增＝浮動圓鈕開一張空白卡片（900 寬是全螢幕），打名稱（Enter 到第一行打說明），返回鍵存檔並收回 */
  const newCard=async(p,name,desc)=>{await liveTop(p);await p.click('#addEvent');await p.waitForSelector('.lc-ed [data-kptitle]');await p.fill('.lc-ed [data-kptitle]',name);
    if(desc){await p.keyboard.press('Enter');await p.keyboard.type(desc)}await p.click('.lc-ed [data-lcback]');await settled(p)};
  /* ui-05：完成、刪除＝把膠囊拖到右上角、左上角（編輯中不能拖） */
  const dragTo=async(p,id,x,y)=>{await liveTop(p);const r=await p.$eval(`#events .cp[data-cp="${id}"]`,e=>{const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}});
    await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x+10,r.y,{steps:3});await p.mouse.move(x,y,{steps:12});await p.mouse.up();await p.waitForTimeout(700)};
  const dlg=p=>p.waitForSelector('#dlg[open]',{timeout:8000}).then(()=>p.evaluate(()=>document.querySelector('#dlgForm b').textContent));
  const dlgSet=(p,o)=>p.evaluate(o=>{for(const [k,v] of Object.entries(o)){const i=document.querySelector(`#dlgForm [name="${k}"]`);i.value=v}},o);
  const dlgAct=async(p,a)=>{await p.click(`#dlg [data-act="${a}"]`);await p.waitForTimeout(500)};
  const openSet=async p=>{if(!await p.evaluate(()=>setOpen))await p.click('#setBtn');await p.waitForTimeout(700)};
  const setText=p=>p.evaluate(()=>document.querySelector('#setOv .set-inner').innerText);
  const closeSet=async p=>{if(await p.evaluate(()=>setOpen)){await p.evaluate(()=>closeSettings(true));await p.waitForTimeout(300)}};
  /* 用畫面的編輯流程改一張卡片：開始編輯 → fn(ev) 改內容 → 按儲存（data-edsave 同一條路） */
  const editCard=(p,id,fn)=>p.evaluate(async([id,fn])=>{await startEdit('e:'+id);const ev=state.events.find(e=>e.id===id);(0,eval)(fn)(ev);evTouch(ev);syncLink(ev);dirty=true;render();if(fldCommitOpen())await saveFlow()},[id,fn.toString()]);
  const C=id=>`cards/${DEPT}__${id}`;
  /* 卡片每一行的文字（03：Firestore 的 blocks 是 {id,text,check,time} 四個陣列；02D 遷移的舊卡片是每行一個物件） */
  const txt=c=>Array.isArray(c.blocks)?c.blocks.map(b=>b.text):c.blocks.text;

  /* ---------- 1. 未登入、一般登入者：唯讀 ---------- */
  {const p=await open();const u=await ui(p);
    ok(u.locked&&!u.authed&&u.editBtns===0&&u.cards>0,`未登入：唯讀、讀得到內容（06 對外公開）、沒有編輯鈕（${JSON.stringify(u)}）`);
    ok(await p.evaluate(()=>persist('x'))===false,'未登入：儲存不寫入');
    await p.ctx.close();}
  const gen=await open();await signIn(gen,'gen');
  await until(async()=>(await ui(gen)).cards>0);
  {const u=await ui(gen);ok(u.locked&&!u.authed&&u.editBtns===0&&u.cards>40,`一般登入者：讀得到（${u.cards} 張）、唯讀、沒有編輯鈕`);}
  /* ui-08：「唯讀」不再寫在帳號列下（列下不放小字），改看清單有「帳號」、沒有看板設定，「唯讀」在帳號頁最上面 */
  await openSet(gen);{const s=await setText(gen);await gen.click('#setOv [data-set="acct"]');await gen.waitForTimeout(800);
    const me=await gen.evaluate(()=>{const e=document.querySelector('#setOv .set-pane .acct-me');return e?e.innerText:''});
    ok(s.includes('帳號')&&me.includes('唯讀')&&!s.includes('標籤')&&!s.includes('看板名稱')&&!s.includes('備份'),'一般登入者：設定頁沒有看板設定、帳號頁寫唯讀');
    await gen.click('#setOv [data-set="acct"]');await gen.waitForTimeout(600);}

  /* ---------- 2. 編輯者 ---------- */
  const ed=await open();const edUid=await signIn(ed,'ed');
  ok((await ui(ed)).locked,'編輯者：角色給之前唯讀');
  await setRole(edUid,{[DEPT]:'editor'});
  ok(await until(async()=>{const u=await ui(ed);return !u.locked&&u.authed&&u.editBtns>0}),'編輯者：角色一給就可以編輯（不用重新整理）');
  {const g=await ed.evaluate(()=>({del:document.querySelectorAll('[data-delissue],[data-deldone],[data-delweek]').length,gantt:document.querySelector('#ganttEdBtn').hidden}));
    ok(g.del===0&&g.gantt,`編輯者：沒有刪除議題、週報（部門管理員以上才能刪，02D D-d）、甘特圖時間軸（管理員）（${JSON.stringify(g)}）`);}
  await openSet(ed);{const s=await setText(ed);ok(s.includes('標籤')&&s.includes('報告')&&s.includes('備份')&&!s.includes('看板名稱')&&!s.includes('人員')&&!s.includes('學年'),'編輯者：設定頁有報告、標籤、備份，沒有看板名稱、人員、學年');}
  await closeSet(ed);
  /* a. 新增卡片（ui-05：浮動圓鈕開一張空白卡片 → 名稱、第一行 → 返回鍵存檔） */
  await newCard(ed,'FW 新卡片','第一行');
  ok(await ed.evaluate(()=>!editing&&!lvOpen),'新增卡片：返回鍵存檔並收回');
  const nid=await ed.evaluate(()=>(state.events.find(e=>e.name==='FW 新卡片')||{}).id);
  let c=nid&&await read(C(nid)),v1=nid&&await read(`${C(nid)}/versions/1`);
  ok(c&&c.version===1&&c.state==='open'&&c.createdBy===edUid&&v1&&v1.title==='FW 新卡片'&&!v1.imported,'新增卡片：卡片＋第 1 版、createdBy＝自己');
  /* b. 改內容 */
  await editCard(ed,nid,ev=>{ev.desc='第一行\n第二行'});await settled(ed);
  c=await read(C(nid));const v2=await read(`${C(nid)}/versions/2`);
  ok(c.version===2&&c.blocks.text.length===2&&c.blocks.text[1]==='第二行'&&v2&&v2.blocks.text.length===2&&v2.by===edUid,'改內容：version 2＋第 2 版同批');
  ok(await ed.evaluate(()=>!editing&&state.events.find(e=>e.name==='FW 新卡片').desc==='第一行\n第二行'),'改內容：儲存後重新讀回、結束編輯');
  /* c. 加時間標記 */
  await editCard(ed,nid,ev=>{ev.times.push({id:'tfw1',label:'開會',start:'2026-12-01T10:00',end:'2026-12-01T12:00',place:'學生會',toIssue:false})});await settled(ed);
  c=await read(C(nid));let e1=await read(`events/${DEPT}__tfw1`);
  ok(c.version===3&&c.timeIds.includes(`${DEPT}__tfw1`)&&e1&&e1.cardId===`${DEPT}__${nid}`&&e1.label==='開會'&&e1.rev===1&&!e1.allDay,'加時間標記：events 文件、列在卡片 timeIds');
  /* d. 改時間標記、再拿掉 */
  await editCard(ed,nid,ev=>{ev.times[0].place='會議室'});await settled(ed);
  e1=await read(`events/${DEPT}__tfw1`);ok(e1&&e1.place==='會議室'&&e1.rev===2,'改時間標記：rev 2');
  await editCard(ed,nid,ev=>{ev.times=[]});await settled(ed);
  c=await read(C(nid));ok(c.timeIds.length===0&&!(await read(`events/${DEPT}__tfw1`)),'拿掉時間標記：同一批刪掉 events 文件');
  /* e. 完成（ui-05：把膠囊拖到右上角）、移回即時回報（完成紀錄卡片的「編輯」裡） */
  await dragTo(ed,nid,890,10);await settled(ed);
  c=await read(C(nid));ok(c.state==='done'&&c.doneAt&&c.doneAt.toMillis()>Date.now()-60000,'完成（拖到右上角）：state done、doneAt＝伺服器時間');
  await ed.evaluate(async id=>{lcShow('done',id);await startEdit('e:'+id)},nid);await ed.waitForTimeout(400);
  await ed.evaluate(id=>document.querySelector(`.lc[data-ev="${id}"] [data-evundo]`).click(),nid);await settled(ed);
  c=await read(C(nid));ok(c.state==='open'&&c.doneAt===null,'移回即時回報：state open、doneAt null');
  /* （ui-05 拿掉）「完成這一段」新介面沒有入口 */
  /* f. 新增議題 */
  await ed.evaluate(()=>{setSection('progress',{instant:true})});await ed.click('#addIssue');await ed.waitForTimeout(400);
  await ed.evaluate(async()=>{const i=state.issues[state.issues.length-1];i.title='FW 新議題';ifFld=null;dirty=true;await saveFlow()});await settled(ed);
  const iid=await ed.evaluate(()=>(state.issues.find(i=>i.title==='FW 新議題')||{}).id);
  const is=iid&&await read(`issues/${DEPT}__${iid}`);ok(is&&is.rev===1&&is.updatedBy===edUid,'新增議題：issues 文件（rev 1）');
  /* g. 新增週報 */
  await openSet(ed);await ed.click('[data-set="report"]');await ed.waitForTimeout(800);await ed.click('[data-hub="week"]');await ed.waitForTimeout(900);
  await ed.click('#addWeek');await dlg(ed);await dlgSet(ed,{text:'FW 週報內容'});await dlgAct(ed,'ok');await settled(ed);await closeSet(ed);
  const wid=await ed.evaluate(()=>(state.weeks.find(w=>w.text==='FW 週報內容')||{}).id);
  const wk=wid&&await read(`weeks/${DEPT}__${wid}`);ok(wk&&wk.createdAt&&wk.updatedBy===edUid,'新增週報：weeks 文件');
  ok((await read(`deptSettings/${DEPT}`)).rev===1,'新增週報：編輯者不寫部門設定（週報基準）');
  /* h. 新增標籤（設定頁 → 標籤） */
  await openSet(ed);await ed.click('[data-set="labels"]');await ed.waitForSelector('[data-x="open"][data-k="人"]',{timeout:8000});   /* ui-09：一類一塊，點虛線「+」才有輸入框 */
  ok(await ed.evaluate(()=>!document.querySelector('#dlgForm [data-x="del"]')),'標籤：編輯者沒有刪除鈕');
  await ed.click('[data-x="open"][data-k="人"]');await ed.fill('[data-newlbl="人"]','FW 標籤');await ed.press('[data-newlbl="人"]','Enter');await ed.click('[data-set="labels"]');await settled(ed);   /* 沒有「完成」：再點一次「標籤」離開這一頁就存 */
  const lid=await ed.evaluate(()=>(state.labels.find(l=>l.name==='FW 標籤')||{}).id);
  const lb=lid&&await read(`labels/${DEPT}__${lid}`);ok(lb&&lb.kind==='人'&&lb.updatedBy===edUid,'新增標籤：labels 文件');
  await closeSet(ed);
  /* i. 永久刪除有時間標記的卡片（兩次確認） */
  const del=await ed.evaluate(()=>{const ev=state.events.filter(e=>!e.doneAt).sort((a,b)=>b.times.length-a.times.length)[0];return {id:ev.id,name:ev.name,times:ev.times.map(x=>x.id)}});
  const dc=await read(C(del.id));
  await dragTo(ed,del.id,10,10);   /* ui-05：刪除＝拖到左上角 */
  ok((await dlg(ed)).startsWith('刪除「'),'刪除（拖到左上角）：第一次確認');await dlgAct(ed,'delete');
  ok((await dlg(ed))===`一起刪掉 ${del.times.length} 個時間標記？`,`刪除：第二次確認寫出 ${del.times.length} 個時間標記`);await dlgAct(ed,'delete');await settled(ed);
  const left=await Promise.all([read(C(del.id)),...del.times.map(x=>read(`events/${DEPT}__${x}`)),...Array.from({length:dc.version},(_,i)=>read(`${C(del.id)}/versions/${i+1}`))]);
  ok(left.every(x=>!x),`刪除：卡片、${dc.version} 個版本、${del.times.length} 個時間標記都不在了`);
  let logs=[];await admin(async d=>{logs=(await d.collection('auditLogs').where('docId','==',`${DEPT}__${del.id}`).get()).docs.map(s=>s.data())});
  ok(logs.length===1&&logs[0].action==='purge'&&logs[0].before.title===del.name&&logs[0].actor===edUid,'刪除：刪除紀錄有標題、刪除者');
  ok(await ed.evaluate(id=>!state.events.some(e=>e.id===id),del.id),'刪除：畫面上也不在了');

  /* j. 時間標記多的卡片：一次加 5 個（分批建立）、一次拿掉 4 個（規則一批最多 3 個：分兩個版本）、永久刪除時分兩批清除 */
  await newCard(ed,'FW 多標記');
  const mid=await ed.evaluate(()=>state.events.find(e=>e.name==='FW 多標記').id);
  await editCard(ed,mid,ev=>{for(let i=1;i<=5;i++)ev.times.push({id:'tmany'+i,label:'標記'+i,start:'2026-12-0'+i,end:'',place:'',toIssue:false})});await settled(ed);
  c=await read(C(mid));let evs=await Promise.all([1,2,3,4,5].map(i=>read(`events/${DEPT}__tmany${i}`)));
  ok(c.version===2&&c.timeIds.length===5&&evs.every(x=>x&&x.cardId===`${DEPT}__${mid}`),'一次加 5 個時間標記：都建好、都列在 timeIds');
  await editCard(ed,mid,ev=>{ev.times=ev.times.filter(x=>x.id==='tmany5')});await settled(ed);
  c=await read(C(mid));evs=await Promise.all([1,2,3,4,5].map(i=>read(`events/${DEPT}__tmany${i}`)));
  ok(c.version===4&&c.timeIds.length===1&&evs.slice(0,4).every(x=>!x)&&evs[4]&&!!(await read(`${C(mid)}/versions/3`)),`一次拿掉 4 個：分成兩個版本（version ${c.version}），4 個都刪掉`);
  await editCard(ed,mid,ev=>{for(let i=6;i<=9;i++)ev.times.push({id:'tmany'+i,label:'標記'+i,start:'2026-12-0'+i,end:'',place:'',toIssue:false})});await settled(ed);
  await dragTo(ed,mid,10,10);
  await dlg(ed);await dlgAct(ed,'delete');ok((await dlg(ed))==='一起刪掉 5 個時間標記？','刪除 5 個時間標記的卡片：第二次確認');await dlgAct(ed,'delete');await settled(ed);
  const left2=await Promise.all([read(C(mid)),...[5,6,7,8,9].map(i=>read(`events/${DEPT}__tmany${i}`)),...[1,2,3,4,5].map(v=>read(`${C(mid)}/versions/${v}`))]);
  ok(left2.every(x=>!x),'刪除 5 個時間標記、5 個版本的卡片：全部清掉（分批）');

  /* ---------- 3. 管理員：沒有看板名稱 ---------- */
  const ad=await open();const adUid=await signIn(ad,'ad');await setRole(adUid,{[DEPT]:'admin'});
  await until(async()=>!(await ui(ad)).locked);
  ok(await ad.evaluate(()=>!document.querySelector('#ganttEdBtn').hidden),'管理員：甘特圖時間軸可以編輯');
  await openSet(ad);ok(await until(async()=>(await setText(ad)).includes('標籤')),'管理員：設定頁開啟');
  ok(!(await setText(ad)).includes('看板名稱')&&await ad.evaluate(()=>!document.querySelector('[data-set="title"]')),'管理員：設定頁沒有看板名稱（看板標題固定用部門名稱）');
  ok(await ad.evaluate(()=>document.title===CFG.dept.name),'分頁標題＝部門名稱');
  ok((await read(`deptSettings/${DEPT}`)).rev===1,'沒有看板名稱的寫入：deptSettings 維持 rev 1');
  await closeSet(ad);
  /* 3b. 管理員刪除議題、週報、標籤（02D D-d）：刪除鈕跟著權限出現；同一批寫刪除紀錄（誰、類型、標題）；編輯者直接呼叫刪除被規則擋下 */
  {const delLogs=async col=>{let out=[];await admin(async d=>{out=(await d.collection('auditLogs').where('col','==',col).where('action','==','delete').get()).docs.map(x=>({id:x.id,...x.data()}))});return out};
    await ad.evaluate(()=>{setSection('progress',{instant:true})});await ad.waitForTimeout(300);
    await ad.evaluate(async id=>{await startEdit('i:'+id);if(typeof progShow==='function')progShow(id)},iid);await ad.waitForTimeout(600);
    ok(await ad.evaluate(id=>!!document.querySelector(`[data-issue="${id}"] [data-delissue]`),iid),'管理員：議題有刪除鈕');
    const wBefore=await read(`weeks/${DEPT}__${wid}`),iBefore=await read(`issues/${DEPT}__${iid}`);
    await ad.click(`[data-issue="${iid}"] [data-delissue]`);await dlg(ad);await dlgAct(ad,'delete');await settled(ad);
    const il=await delLogs('issues');
    ok(!(await read(`issues/${DEPT}__${iid}`))&&il.length===1&&il[0].id===`issues_${DEPT}__${iid}_delete_${iBefore.updatedAt.toMillis()}`&&il[0].actor===adUid&&il[0].before.title==='FW 新議題'&&il[0].before.deptId===DEPT,
      '管理員刪除議題：文件不在、同一批寫了刪除紀錄（誰、標題、部門）');
    await openSet(ad);await ad.click('[data-set="report"]');await ad.waitForTimeout(800);await ad.click('[data-hub="week"]');await ad.waitForTimeout(900);
    ok(await ad.evaluate(id=>!!document.querySelector(`[data-week="${id}"] [data-delweek]`),wid),'管理員：週報有刪除鈕');
    await ad.click(`[data-week="${wid}"] [data-delweek]`);await dlg(ad);await dlgAct(ad,'delete');await settled(ad);await closeSet(ad);
    const wl=await delLogs('weeks');
    ok(!(await read(`weeks/${DEPT}__${wid}`))&&wl.length===1&&wl[0].before.title===wBefore.date&&wl[0].actor===adUid,'管理員刪除週報：文件不在、刪除紀錄的標題是週報日期');
    await openSet(ad);await ad.click('[data-set="labels"]');await ad.waitForSelector('[data-x="open"][data-k="人"]',{timeout:8000});
    ok(await ad.evaluate(id=>!!document.querySelector(`#dlgForm [data-x="del"][data-id="${id}"]`),lid),'管理員：標籤有刪除鈕');
    await ad.click(`#dlgForm [data-x="del"][data-id="${lid}"]`);await ad.click('[data-set="labels"]');await settled(ad);await closeSet(ad);
    const ll=await delLogs('labels');
    ok(!(await read(`labels/${DEPT}__${lid}`))&&ll.length===1&&ll[0].before.title==='FW 標籤'&&ll[0].actor===adUid,'管理員刪除標籤：文件不在、刪除紀錄有標籤名稱');
    /* 正式專案的伺服器時間到微秒（模擬器只到毫秒）：放一個 updatedAt 有微秒的標籤，管理員從畫面刪除也要成功（02D 審查 P1-1） */
    const mic=`${DEPT}__fwmicro`;await admin(d=>d.doc(`labels/${mic}`).set({deptId:DEPT,kind:'物',name:'微秒標籤',updatedAt:new TS(1763000000,123456000),updatedBy:'su'}));
    await ad.evaluate(()=>acctReload());await until(()=>ad.evaluate(()=>state.labels.some(l=>l.name==='微秒標籤')&&!fsBusy));
    await openSet(ad);await ad.click('[data-set="labels"]');await ad.waitForSelector('#dlgForm [data-x="del"][data-id="fwmicro"]',{timeout:8000});
    await ad.click('#dlgForm [data-x="del"][data-id="fwmicro"]');await ad.click('[data-set="labels"]');await settled(ad);await closeSet(ad);
    ok(!(await read(`labels/${mic}`))&&!!(await read(`auditLogs/labels_${mic}_delete_1763000000123`)),'管理員刪除 updatedAt 有微秒的標籤：成功，紀錄 ID 用整數毫秒');
    /* 編輯者繞過畫面：自己寫一模一樣的刪除＋紀錄，規則拒絕 */
    const tmp=`${DEPT}__fwdel`;await admin(d=>d.doc(`labels/${tmp}`).set({deptId:DEPT,kind:'事',name:'暫時',updatedAt:TS.fromMillis(1763000000000),updatedBy:'su'}));
    const r=await ed.evaluate(async id=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');const db=m.getFirestore();const b=m.writeBatch(db);
      b.delete(m.doc(db,'labels',id));b.set(m.doc(db,'auditLogs',`labels_${id}_delete_1763000000000`),{col:'labels',docId:id,rev:0,action:'delete',actor:acct.user.uid,at:m.serverTimestamp(),before:{title:'暫時',deptId:'rights'},after:{},ref:''});
      try{await b.commit();return 'ok'}catch(e){return e.code}},tmp);
    ok(r==='permission-denied'&&!!(await read(`labels/${tmp}`)),`編輯者直接寫刪除＋紀錄：規則拒絕（${r}）`);
    await admin(d=>d.doc(`labels/${tmp}`).delete());}

  /* ---------- 4. 衝突：別人剛存過 ---------- */
  await ed.evaluate(async()=>{await new Promise(r=>setTimeout(r,200));});
  const cf=await ed.evaluate(()=>state.events.find(e=>!e.doneAt&&e.name!=='FW 新卡片').id);
  await ed.evaluate(async id=>{await startEdit('e:'+id);state.events.find(e=>e.id===id).desc='衝突的草稿';dirty=true},cf);
  const cv=await read(C(cf));await admin(d=>d.doc(C(cf)).update({version:cv.version+1}));   /* 模擬別人剛存過一版 */
  ed.toasts.length=0;
  await ed.evaluate(async()=>{if(fldCommitOpen())await saveFlow()});
  ok(await toastHas(ed,'資料剛被別人改過'),'衝突：提示資料剛被別人改過');
  ok((await dlg(ed))==='儲存失敗','衝突：可以重新載入');
  ok(await ed.evaluate(id=>editing&&cardEdit==='e:'+id&&state.events.find(e=>e.id===id).desc==='衝突的草稿',cf),'衝突：畫面上的修改留著、仍在編輯中');
  ok(!txt(await read(C(cf))).includes('衝突的草稿'),'衝突：沒有寫入');
  await dlgAct(ed,'cancel');ok(await ed.evaluate(id=>editing&&state.events.find(e=>e.id===id).desc==='衝突的草稿',cf),'衝突：取消重新載入後修改還在');
  await ed.evaluate(()=>cancelEdit());await ed.waitForTimeout(400);
  /* 重新載入：放棄草稿、讀最新 */
  await ed.evaluate(async id=>{await startEdit('e:'+id);state.events.find(e=>e.id===id).desc='第二次草稿';dirty=true},cf);
  await admin(d=>d.doc(C(cf)).update({version:cv.version+2}));
  await ed.evaluate(async()=>{if(fldCommitOpen())await saveFlow()});await dlg(ed);await dlgAct(ed,'delete');await settled(ed);
  ok(await ed.evaluate(id=>!editing&&state.events.find(e=>e.id===id).desc!=='第二次草稿',cf),'衝突：重新載入後放棄草稿、結束編輯');

  /* ---------- 5. 撤權 ---------- */
  const rv=await ed.evaluate(()=>state.events.find(e=>!e.doneAt).id);
  await ed.evaluate(async id=>{await startEdit('e:'+id);state.events.find(e=>e.id===id).desc='撤權前的草稿';dirty=true},rv);
  await setRole(edUid,{});
  ok(await until(async()=>{const u=await ui(ed);return u.locked&&!u.authed}),'撤權：畫面即時變回唯讀（不用重新整理）');
  ed.toasts.length=0;
  await ed.evaluate(async()=>{if(fldCommitOpen())await saveFlow()});
  ok(await toastHas(ed,'沒有權限'),'撤權：編輯中按儲存被規則擋下、提示沒有權限');
  ok(await ed.evaluate(id=>editing&&state.events.find(e=>e.id===id).desc==='撤權前的草稿',rv),'撤權：畫面上的修改留著');
  ok(!txt(await read(C(rv))).includes('撤權前的草稿'),'撤權：沒有寫入');
  await dlgAct(ed,'cancel');await ed.evaluate(()=>cancelEdit());await ed.waitForTimeout(400);
  ok((await ui(ed)).editBtns===0,'撤權：沒有編輯鈕');
  const direct=await ed.evaluate(async()=>{const n=JSON.parse(JSON.stringify(state));n.events[0].name+='（繞過畫面）';
    try{await window.BoardStoreWrite.saveDept(CFG.firebase,CFG.deptId,storeFsBase,n,{admin:true,super:true});return 'ok'}catch(e){return e.code}});
  ok(direct==='permission-denied',`撤權：直接呼叫寫入也被規則拒絕（${direct}）`);

  /* ---------- 7. 編輯紀錄與會長室的各部門編輯量（02D D3：版本歷史＋總管理員的稽核紀錄） ---------- */
  const logText=async p=>{await openSet(p);await p.click('[data-set="log"]');
    await until(()=>p.evaluate(()=>!logState.busy&&(logState.items.length||document.querySelector('#logMsg').textContent)));await sleep(300);
    const r=await p.evaluate(()=>({t:document.querySelector('#logList').innerText,who:[...document.querySelectorAll('#logList .lg-who')].map(x=>x.textContent),msg:document.querySelector('#logMsg').textContent}));
    await p.evaluate(()=>closeLog(true));await closeSet(p);return r};
  {const r=await logText(ad);
    ok(r.t.includes('即時回報\n新增｜FW 新卡片')&&r.t.includes('即時回報\n修改｜FW 新卡片')&&r.t.includes('遷移\n匯入｜')&&r.who.includes('ed 同學'),'編輯紀錄（管理員）：版本歷史（新增、修改、遷移匯入）、名字');
    ok(!r.t.includes('設定\n')&&!r.t.includes('刪除｜'),'編輯紀錄（管理員）：沒有稽核紀錄（部門設定、卡片刪除只有總管理員讀得到）');}
  await openSet(gen);ok(!(await setText(gen)).includes('編輯紀錄'),'一般登入者：設定頁沒有編輯紀錄');await closeSet(gen);
  ok(await gen.evaluate(async()=>{try{await (await storeFsGet()).versionsPage(CFG.firebase,CFG.deptId,null,5);return 'ok'}catch(e){return e.code}})==='permission-denied','一般登入者：直接查版本歷史被規則拒絕');
  const su2=await open();const suUid=await signIn(su2,'su2');await setRole(suUid,{},true);await until(async()=>!(await ui(su2)).locked);
  {const r=await logText(su2);
    ok(r.t.includes(`即時回報\n刪除｜${del.name}`)&&r.t.includes('即時回報\n修改｜FW 新卡片'),'編輯紀錄（總管理員）：加上稽核紀錄（卡片刪除、修改）');}
  /* 2026-11-20：開發專案缺索引時編輯紀錄只寫「讀取失敗」、console 沒有訊息 → 原始錯誤進 console.error，畫面仍只有簡短原因（不放含專案網址的訊息） */
  {const cons=[];const h=m=>{if(m.type()==='error')cons.push(m.text())};su2.on('console',h);
    await su2.evaluate(()=>{const F=window.BoardFirestore;F.__vp=F.versionsPage;F.versionsPage=async()=>{throw Object.assign(new Error('The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/demo-x/firestore/indexes?create_composite=Q9b'),{code:'failed-precondition'})}});
    const r=await logText(su2);await su2.evaluate(()=>{const F=window.BoardFirestore;F.versionsPage=F.__vp;delete F.__vp});su2.off('console',h);
    ok(r.msg==='讀取失敗'&&!/https?:|index|demo-x/.test(r.msg+r.t)&&cons.some(x=>x.includes('Firestore 讀取失敗（編輯紀錄）')&&x.includes('requires an index')),`編輯紀錄讀取失敗：畫面只寫「${r.msg}」、原始錯誤進 console（${cons.length} 筆）`);}
  /* 會長室（firestore 模式）的各部門編輯量：權益部＝不是匯入的版本＋稽核紀錄；還在 GitHub、沒有設定 repo 的部門＝讀不到（—） */
  let want=0;await admin(async d=>{want=(await d.collectionGroup('versions').where('deptId','==',DEPT).get()).docs.filter(x=>!x.data().imported).length
    +(await d.collection('auditLogs').get()).docs.map(x=>x.data()).filter(a=>a.col==='deptSettings'&&a.action==='update'&&a.docId===DEPT||a.col==='cards'&&a.action==='purge'&&a.before.deptId===DEPT||['issues','weeks','labels'].includes(a.col)&&a.action==='delete'&&a.before.deptId===DEPT).length});   /* 02D D-d：議題、週報、標籤的刪除紀錄也算 */
  const actOf=async p=>{await p.evaluate(()=>actLoad(true));await until(()=>p.evaluate(()=>ACT.rows&&!ACT.busy));
    return p.evaluate(()=>({rows:Object.fromEntries(ACT.rows.map(r=>[r.id,r.fail?'—':r.sum])),leg:(document.querySelector('[data-ack="rights"] .num')||{}).textContent}))};
  const ps=await open('president',[DEPT,'president']);await signIn(ps,'su2');await until(async()=>!(await ui(ps)).locked);
  {const a=await actOf(ps);ok(a.rows.rights===want&&want>10&&a.rows.president===0&&a.rows.events==='—',`會長室（總管理員）：權益部 ${a.rows.rights} 項（版本＋稽核紀錄 ${want}）、會長室 0、還在 GitHub 的部門 —`);}
  const pe=await open('president',[DEPT,'president']);const peUid=await signIn(pe,'pe');await setRole(peUid,{president:'editor'});await until(async()=>!(await ui(pe)).locked);
  {const a=await actOf(pe);ok(a.rows.rights==='—'&&a.leg==='—'&&a.rows.president===0,`會長室（會長室編輯者）：讀不到權益部的版本歷史（—）、會長室 0（${JSON.stringify(a.rows)}）`);}

  /* ---------- 8. 文件 ID 與欄位帶 HTML（02D 審查 P0）：繞過規則塞進去的文件不顯示、欄位值都經過跳脫，總管理員打開看板不會執行 ---------- */
  {const BAD=`${DEPT}__x" onmouseover="window.__xss=1" data-x="`,TSN=TS.now();
    await admin(async d=>{
      await d.doc(`cards/${BAD}`).set({deptId:DEPT,title:'XSS 卡片',blocks:[{id:'b',text:'x',check:null,timeId:null}],timeIds:[],issueId:null,staff:[],labels:[],links:[],report:false,state:'open',doneAt:null,deletedAt:null,deletedBy:null,order:1,version:1,createdAt:TSN,createdBy:'x',updatedAt:TSN,updatedBy:'x'});
      await d.doc(`weeks/${DEPT}__<img src=x onerror=window.__xss=2>`).set({deptId:DEPT,date:'2026-11-15',text:'XSS 週報',auto:false,createdAt:TSN,updatedAt:TSN,updatedBy:'x'});
      await d.doc(`labels/${DEPT}__l" onfocus="window.__xss=3`).set({deptId:DEPT,kind:'人',name:'XSS 標籤',updatedAt:TSN,updatedBy:'x'});
      await d.doc(`issues/${DEPT}__xssi`).set({deptId:DEPT,title:'XSS 議題',cur:0,start:'',end:'',note:'',tags:[],labels:[],links:[],staff:[],doneAt:null,order:999999,rev:1,updatedAt:TSN,updatedBy:'x',
        markers:[{id:'m" onmouseover="window.__xss=4',at:'5%" onmouseover="window.__xss=5" x="',text:'XSS 註記',color:'#000',pos:'up',date:''}]});
    });
    const xs=await open();await signIn(xs,'su2');await until(async()=>!(await ui(xs)).locked);
    await xs.evaluate(()=>{setSection('progress',{instant:true})});await xs.waitForTimeout(800);
    await xs.evaluate(()=>{progOpen='xssi';render()});await xs.waitForTimeout(800);
    const r=await xs.evaluate(()=>({onAttr:[...document.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).map(e=>e.tagName),
      xss:window.__xss,card:state.events.some(e=>e.name==='XSS 卡片'),week:state.weeks.some(w=>w.text==='XSS 週報'),label:state.labels.some(l=>l.name==='XSS 標籤'),
      issue:state.issues.some(i=>i.title==='XSS 議題'),marker:[...document.querySelectorAll('[data-marker]')].some(e=>e.dataset.marker.startsWith('m" onmouseover'))}));
    ok(!r.card&&!r.week&&!r.label&&r.issue,`ID 不合格的卡片、週報、標籤讀回來時略過；ID 合格的議題照常顯示（${JSON.stringify(r)}）`);
    ok(r.marker&&!r.onAttr.length&&r.xss===undefined,'欄位值帶引號（註記的 id、at）：屬性值跳脫，沒有多出事件屬性、沒有執行');
    await xs.hover('[data-issue="xssi"] [data-marker]',{force:true}).catch(()=>{});await xs.waitForTimeout(300);
    ok(await xs.evaluate(()=>window.__xss===undefined),'滑過註記也沒有執行');
    await admin(async d=>{for(const p of [`cards/${BAD}`,`weeks/${DEPT}__<img src=x onerror=window.__xss=2>`,`labels/${DEPT}__l" onfocus="window.__xss=3`,`issues/${DEPT}__xssi`])await d.doc(p).delete()});}

  /* ---------- 9. 中斷的永久刪除（02D 審查 P1）：timeIds 有不存在的時間標記 → 編輯者照常存得進別的修改，刪除也接著清完；兩個人同時接著清不會卡住 ---------- */
  const e2=await open();const e2Uid=await signIn(e2,'ed2');await setRole(e2Uid,{[DEPT]:'editor'});await until(async()=>!(await ui(e2)).locked);
  {const TSN=TS.now();
    const mkPurging=(id,real,ghost,vers)=>admin(async d=>{
      await d.doc(C(id)).set({deptId:DEPT,title:'中斷的刪除',blocks:[{id:'b',text:'x',check:null,timeId:null}],timeIds:[...real,...ghost].map(x=>`${DEPT}__${x}`),issueId:null,staff:[],labels:[],links:[],report:false,
        state:'purging',doneAt:null,deletedAt:TSN,deletedBy:'x',purgeLog:'abcdef123456',order:1,version:vers,createdAt:TSN,createdBy:'x',updatedAt:TSN,updatedBy:'x'});
      for(let v=1;v<=vers;v++)await d.doc(`${C(id)}/versions/${v}`).set({cardId:`${DEPT}__${id}`,deptId:DEPT,version:v,title:'中斷的刪除',blocks:[],times:[],state:'open',by:'x',at:TSN,imported:false});
      for(const x of real)await d.doc(`events/${DEPT}__${x}`).set({deptId:DEPT,cardId:`${DEPT}__${id}`,blockId:null,label:'x',start:TSN,end:TSN,startRaw:'2026-11-20',endRaw:'',allDay:true,place:'',toIssue:false,scope:'dept',visibility:'internal',rev:1,updatedAt:TSN,updatedBy:'x'});
    });
    const gone=async(id,real,vers)=>(await Promise.all([read(C(id)),...real.map(x=>read(`events/${DEPT}__${x}`)),...Array.from({length:vers},(_,i)=>read(`${C(id)}/versions/${i+1}`))])).every(x=>!x);
    await mkPurging('pg1',['pgA'],['pgGhost'],2);
    const tgt=await e2.evaluate(()=>state.events.filter(e=>!e.doneAt)[0].id);
    await editCard(e2,tgt,ev=>{ev.desc='中斷刪除後的修改'});await settled(e2);
    ok(txt(await read(C(tgt))).includes('中斷刪除後的修改'),'有中斷的刪除（timeIds 裡有不存在的時間標記）：編輯者別的修改照常存得進去');
    ok(await gone('pg1',['pgA'],2),'中斷的刪除接著清完：存在的時間標記刪掉、不存在的只從清單拿掉、版本與卡片都刪掉');
    /* 兩個編輯者同時儲存、同時接著清同一張（5 個時間標記＋2 個不存在的、5 個版本，要好幾批） */
    const e3=await open();const e3Uid=await signIn(e3,'ed3');await setRole(e3Uid,{[DEPT]:'editor'});await until(async()=>!(await ui(e3)).locked);
    await mkPurging('pg2',['pgB1','pgB2','pgB3','pgB4','pgB5'],['pgG1','pgG2'],5);
    const [ta,tb]=await e3.evaluate(()=>state.events.filter(e=>!e.doneAt).slice(1,3).map(e=>e.id));
    await Promise.all([editCard(e2,ta,ev=>{ev.desc='同時接著清 A'}),editCard(e3,tb,ev=>{ev.desc='同時接著清 B'})]);await settled(e2);await settled(e3);
    const [ca,cb]=await Promise.all([read(C(ta)),read(C(tb))]);
    ok(txt(ca).includes('同時接著清 A')&&txt(cb).includes('同時接著清 B'),'兩個編輯者同時儲存（都會接著清同一張中斷的刪除）：兩邊的修改都存得進去');
    ok(await gone('pg2',['pgB1','pgB2','pgB3','pgB4','pgB5'],5)||(await e2.evaluate(async id=>{await startEdit('e:'+id);state.events.find(e=>e.id===id).desc+='。';dirty=true;await saveFlow()},ta),await settled(e2),await gone('pg2',['pgB1','pgB2','pgB3','pgB4','pgB5'],5)),
      '兩個人同時接著清：不會卡住，最後全部清完');
    await e3.ctx.close();}

  /* ---------- 10. 分批儲存中途失敗（02D 審查 P1）：前面的批已寫入 → 重新讀一次、只補寫剩下的 ----------
     ui-05：原本用「完成這一段」（新介面沒有入口）製造多批寫入，改成一次拿掉 4 個時間標記（規則一批最多 3 個：分兩批） */
  {await newCard(e2,'FW 分批');
    const pid=await e2.evaluate(()=>state.events.find(e=>e.name==='FW 分批').id);
    await editCard(e2,pid,ev=>{for(let i=1;i<=5;i++)ev.times.push({id:'tpart'+i,label:'分批'+i,start:'2020-01-0'+i,end:'',place:'',toIssue:false})});await settled(e2);
    const v0=(await read(C(pid))).version;
    let n=0,failed=0;
    await e2.ctx.route(/documents:commit/,r=>{n++;if(n===2){failed++;return r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:403,message:'test',status:'PERMISSION_DENIED'}})})}return r.continue()});
    e2.toasts.length=0;
    await editCard(e2,pid,ev=>{ev.times=ev.times.filter(x=>x.id==='tpart5')});await settled(e2);
    await e2.ctx.unroute(/documents:commit/);
    const pc=await read(C(pid)),gone=await Promise.all([1,2,3,4].map(i=>read(`events/${DEPT}__tpart${i}`))),keep=await read(`events/${DEPT}__tpart5`);
    ok(failed===1&&n>=3&&await toastHas(e2,'部分修改已寫入，正在補寫'),`第二批被擋下（模擬）：提示部分已寫入、正在補寫（commit ${n} 次）`);
    ok(pc.timeIds.length===1&&gone.every(x=>!x)&&keep&&pc.version>v0,`補寫後收斂：4 個時間標記都刪掉、剩 1 個、版本前進（${v0}→${pc.version}）`);
    ok(await e2.evaluate(()=>!editing&&!document.querySelector('#dlg[open]')),'補寫成功：結束編輯、沒有跳出儲存失敗');}

  /* ---------- 11. 裝置上 github 模式留下的本機暫存（02D D-e）：部門切到 firestore 後不會被讀進畫面、也不會被存回 Firestore ----------
     這台裝置在切換前用 github 模式開過權益部：localStorage 的 workboard:board-main 有一份比 Firestore「新」的看板（savedAt 2099、多一張卡片、改過的名稱）、
     還有雲端設定（sync）與權杖。切換後：讀到的只有 Firestore；儲存只寫畫面上的修改；本機暫存原封不動；不讀 GitHub。讀取失敗（未登入）時也不拿本機暫存頂上 */
  {const fileData=JSON.parse(fs.readFileSync(path.join(ROOT,'data.json'),'utf8'));
    const stale={...fileData,savedAt:'2099-01-01 00:00',title:'LOCAL 舊暫存看板',sync:{owner:'stale-owner',repo:'stale-repo',branch:'main',path:'data.json'},
      events:[...fileData.events.map((e,i)=>i===0?{...e,name:'LOCAL 舊名稱'}:e),{id:'eLOCAL1',name:'LOCAL 舊暫存卡片',desc:'',createdAt:'2026-11-01',staff:[],links:[],times:[],round:1,touched:[]}]};
    const seedLocal={fn:s=>{try{if(!sessionStorage.getItem('seeded')){localStorage.setItem('workboard:board-main',s);localStorage.setItem('workboard:ghtoken','stale-token');sessionStorage.setItem('seeded','1')}}catch(_){}},arg:JSON.stringify(stale)};
    const anon=await open(DEPT,[DEPT],seedLocal);
    const a=await anon.evaluate(()=>({cards:state.events.length,local:state.events.some(e=>e.id==='eLOCAL1'||e.name.startsWith('LOCAL')),title:state.title,base:!!storeFsBase,sync:!!state.sync}));
    ok(!a.local&&a.title!=='LOCAL 舊暫存看板'&&!a.sync,`本機暫存（未登入）：畫面只有 Firestore 的內容、不拿本機暫存頂上（${JSON.stringify(a)}）`);   /* 06：未登入也讀得到 Firestore，所以 base 會是真的 */
    ok(await anon.evaluate(()=>persist('x'))===false,'本機暫存（未登入）：儲存不寫入');
    const e3=await open(DEPT,[DEPT],seedLocal);const e3Uid=await signIn(e3,'e3');await setRole(e3Uid,{[DEPT]:'editor'});
    await until(async()=>!(await ui(e3)).locked);
    const live=await read(`deptSettings/${DEPT}`);
    const s1=await e3.evaluate(()=>({local:state.events.some(e=>e.id==='eLOCAL1'||e.name.startsWith('LOCAL')),title:state.title,sync:!!state.sync}));
    ok(!s1.local&&s1.title===live.title&&!s1.sync,'本機暫存（編輯者登入後）：看板＝Firestore 的內容（沒有本機的卡片、名稱、雲端設定）');
    const tgt=await e3.evaluate(()=>state.events.find(e=>!e.doneAt).id);
    await editCard(e3,tgt,ev=>{ev.blocks=[...(ev.blocks||[]),{id:'bl'+Date.now(),text:'切換後的修改',check:null,timeId:null}];ev.desc=(ev.desc?ev.desc+'\n':'')+'切換後的修改'});await settled(e3);
    const c=await read(C(tgt));
    ok(c&&JSON.stringify(c.blocks).includes('切換後的修改'),'本機暫存：編輯者的修改照常寫進 Firestore');
    ok(!(await read(C('eLOCAL1')))&&!JSON.stringify(await read(C(fileData.events[0].id))||'').includes('LOCAL 舊名稱')&&(await read(`deptSettings/${DEPT}`)).title!=='LOCAL 舊暫存看板',
      '本機暫存：沒有被存回 Firestore（沒有本機那張卡片、改過的名稱、看板名稱）');
    const kept=await e3.evaluate(()=>{const s=JSON.parse(localStorage.getItem('workboard:board-main')||'null');return s&&s.title});
    ok(kept==='LOCAL 舊暫存看板','本機暫存：firestore 模式不讀也不改它（原封不動，切回 github 時照原本的規則處理）');
    ok(!anon.gets.length&&!e3.gets.length&&!anon.puts.length&&!e3.puts.length,'本機暫存裡有雲端設定與權杖：firestore 模式不讀、不寫 GitHub');
    await anon.ctx.close();}

  /* ---------- 6. 其他部門不受影響、沒有頁面錯誤 ---------- */
  const after=await others();
  ok(before.h===after.h&&before.n===after.n&&before.n>0,`其他部門的 Firestore 文件前後相同（${after.n} 份）`);
  ok(pages.every(p=>!p.puts.length),'沒有寫 GitHub');
  const errs=pages.flatMap(p=>p.errs);ok(!errs.length,`沒有頁面錯誤 ${errs.join(' | ')}`);

  for(const p of pages)await p.ctx.close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
