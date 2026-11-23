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
  const newCard=async(p,name,desc)=>{await liveTop(p);await (async()=>{await p.click('#addEvent');await p.waitForTimeout(350);await p.click('[data-fabadd="text"]')})();await p.waitForSelector('.lc-ed [data-kptitle]');await p.fill('.lc-ed [data-kptitle]',name);
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

  const ed=await open();const edUid=await signIn(ed,'ed');
  await setRole(edUid,{[DEPT]:'editor'});
  ok(await until(async()=>{const u=await ui(ed);return !u.locked&&u.authed}),'編輯者：可以編輯');
  await newCard(ed,'TL 卡片','第一行');
  const nid=await ed.evaluate(()=>(state.events.find(e=>e.name==='TL 卡片')||{}).id);
  /* 兩個過期時間：甲有核取行（走真正的逐行編輯）；乙是舊標記（直接放進 times，沒有核取行，等同 03 以前的卡片） */
  const day=n=>{const x=new Date();x.setDate(x.getDate()+n);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  await ed.evaluate(d=>{window.__d8=d},day(-8));
  await ed.evaluate(([a,b])=>{window.__d5=a;window.__d8=b},[day(-5),day(-8)]);
  await editCard(ed,nid,ev=>{ev.times.push({id:'tA',label:'過期甲',start:window.__d5,end:'',place:'',toIssue:false},{id:'tB',label:'舊標記乙',start:window.__d8,end:'',place:'',toIssue:false})});
  await settled(ed);
  const tA='tA';
  /* 甲接上核取行（像逐行編輯存出來的樣子）；乙維持舊標記。直接寫進模擬器後讓畫面重讀 */
  await admin(async d=>{const ref=d.doc(C(nid));const s=(await ref.get()).data();
    await ref.update({blocks:{id:[...s.blocks.id,'bA'],text:[...s.blocks.text,'過期甲'],check:[...s.blocks.check,false],time:[...s.blocks.time,`${DEPT}__tA`]}})});
  await ed.evaluate(async()=>{storeFsUse(await storeFsLoad());render()});
  await settled(ed);
  const cardDoc=async()=>read(C(nid));
  console.log('狀態',JSON.stringify(await ed.evaluate(id=>{const e=state.events.find(x=>x.id===id);return {times:e.times,blocks:e.blocks}},nid)),JSON.stringify(await read(C(nid))));
  const c0=await cardDoc();
  await liveTop(ed);await ed.click('#notiBtn');await ed.waitForTimeout(1000);
  const s0=await ed.evaluate(()=>({late:notiLate(),top:$('#notiDeck .tl-card[data-i="0"]')&&$('#notiDeck .tl-card[data-i="0"]').dataset.tlcard,cards:document.querySelectorAll('#notiDeck .tl-card').length,errs:0}));
  ok(s0.late>=2&&s0.cards>=2,`清點區在 firestore 模式列出已過期（${JSON.stringify(s0)}）`);
  /* 1. 有核取行的：按完成鈕（最上面是最早的舊標記乙，先處理乙，再處理甲；這裡先用 API 指定甲） */
  const r1=await ed.evaluate(async([id,tid])=>{const ok=await notiDone(id,tid);return {ok,late:notiLate(),busy:fsBusy}},[nid,tA]);
  await settled(ed);
  const c1=await cardDoc();
  console.log('完成後',JSON.stringify(r1),JSON.stringify(c1.blocks),JSON.stringify(await ed.evaluate(id=>{const e=state.events.find(x=>x.id===id);return e.blocks},nid)));
  const idx=c1.blocks.time?c1.blocks.time.findIndex(x=>x&&x.endsWith('__'+tA)):-1;
  ok(r1.ok===true&&c1.version===c0.version+1&&idx>=0&&c1.blocks.check[idx]===true,`完成（有核取行）：寫進 Firestore（版本 ${c0.version}→${c1.version}、check ${c1.blocks.check&&c1.blocks.check[idx]}）`);
  ok(await ed.evaluate(tid=>{const ev=state.events.find(e=>e.name==='TL 卡片');return ev.blocks.find(b=>b.timeId===tid).check===true&&notiLate()>=1},tA),'完成後畫面讀回仍是已勾（沒有彈回）');
  /* 2. 舊標記 */
  const r2=await ed.evaluate(async id=>{const ok=await notiDone(id,'tB');return {ok}},nid);
  await settled(ed);
  const c2=await cardDoc();
  ok(r2.ok===true&&c2.version===c1.version+1&&JSON.stringify(c2.blocks).includes('舊標記乙'),`舊標記完成：補一行核取行寫進 Firestore（版本 ${c1.version}→${c2.version}）`);
  ok(await ed.evaluate(()=>{const ev=state.events.find(e=>e.name==='TL 卡片');const b=ev.blocks.find(b=>b.timeId==='tB');return !!b&&b.check===true}),'舊標記完成後畫面讀回：核取行在、已勾');
  /* 3. 復原 */
  await ed.evaluate(()=>notiUndo());await settled(ed);
  const c3=await cardDoc();ok(c3.version===c2.version+1&&!JSON.stringify(c3.blocks).includes('舊標記乙'),`復原：補的那一行拿掉（版本 ${c2.version}→${c3.version}）`);
  /* 4. 撤權：寫入被擋，要有提示、勾選還原 */
  await setRole(edUid,{});
  await until(async()=>(await ui(ed)).locked);
  const r4=await ed.evaluate(async id=>({ok:await notiDone(id,'tB')}),nid);
  ok(r4.ok===false,'撤權後 notiDone 回 false（沒有寫入）');
  const msgs=await ed.evaluate(()=>[...document.querySelectorAll('#toast')].map(t=>t.textContent));
  console.log('撤權後提示：',JSON.stringify(msgs),JSON.stringify(ed.toasts));

  const errs=pages.flatMap(p=>p.errs);ok(!errs.length,`沒有頁面錯誤 ${errs.join(' | ')}`);
  for(const p of pages)await p.ctx.close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
