/* 02D firestore 模式的看板寫入（core/js/store-write.js、store.js 的 fsPersist、store-map.js 的 desired）：
   用 Auth 模擬器＋Firestore 模擬器、正式規則；權益部用遷移程式（backend/migrate/run.js）匯入後切成 firestore。
   1. 未登入、一般登入者：唯讀（沒有編輯鈕、儲存不寫入）
   2. 編輯者（角色即時生效）：新增卡片、改內容、加／拿掉時間標記、結案、完成這一段（時間標記換卡片）、新增議題／週報／標籤、
      永久刪除有時間標記的卡片（兩次確認、刪除紀錄有標題）；看不到管理員與總管理員才有的項目
   3. 管理員：改看板名稱（deptSettings rev＋稽核紀錄）
   4. 衝突（別人剛存過）：不寫入、畫面上的修改留著、可以重新載入
   5. 撤權：畫面即時變回唯讀；編輯中按儲存被規則擋下、修改留著；直接呼叫寫入也被拒
   6. 其他部門的 Firestore 文件前後完全相同；沒有頁面錯誤
   7. 編輯紀錄（版本歷史；總管理員加上稽核紀錄）、會長室在 firestore 模式的各部門編輯量（讀不到的部門顯示「—」）（02D D3，跑在第 6 段之前）
   8. 文件 ID 與欄位帶 HTML（02D 審查 P0）：ID 不合格的文件不顯示、欄位值跳脫，總管理員打開看板不執行（跑在第 6 段之前）
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

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8');
  const pages=[];
  const open=async(dept=DEPT,fsDepts=[DEPT])=>{
    const ctx=await b.newContext({viewport:{width:900,height:850},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    const puts=[];await ctx.route('https://api.github.com/**',r=>{if(r.request().method()!=='GET')puts.push(r.request().url());r.fulfill({status:404,body:'{}'})});
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of fsDepts)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.toasts=[];p.puts=puts;p.on('pageerror',e=>p.errs.push(e.message));
    await p.exposeFunction('__toast',m=>p.toasts.push(m));
    await p.addInitScript(()=>{new MutationObserver(()=>{const t=document.querySelector('#toast');if(t&&t.textContent&&t.classList.contains('show'))window.__toast(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true})});
    await p.goto(`${BASE}/index.html?d=${dept}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1500);
    p.ctx=ctx;pages.push(p);return p};
  const signIn=async(p,sub)=>{await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    return p.waitForFunction(()=>acct.user&&acct.user.uid&&storeFsBase,null,{timeout:10000}).then(()=>p.evaluate(()=>acct.user.uid))};
  const setRole=(uid,depts,sup=false)=>admin(d=>d.doc(`roles/${uid}`).set({super:sup,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  const ui=p=>p.evaluate(()=>({locked:boardLocked(),authed:document.body.classList.contains('authed'),
    editBtns:[...document.querySelectorAll('.card-edit-btn,.auth-only')].filter(x=>x.offsetParent).length,cards:state.events.length}));
  const toastHas=(p,s)=>until(()=>p.toasts.some(x=>x.includes(s)));
  const settled=p=>until(()=>p.evaluate(()=>!fsBusy&&storeFsBase&&!document.querySelector('#dlg[open]')),15000).then(()=>sleep(300));
  const dlg=p=>p.waitForSelector('#dlg[open]',{timeout:8000}).then(()=>p.evaluate(()=>document.querySelector('#dlgForm b').textContent));
  const dlgSet=(p,o)=>p.evaluate(o=>{for(const [k,v] of Object.entries(o)){const i=document.querySelector(`#dlgForm [name="${k}"]`);i.value=v}},o);
  const dlgAct=async(p,a)=>{await p.click(`#dlg [data-act="${a}"]`);await p.waitForTimeout(500)};
  const openSet=async p=>{if(!await p.evaluate(()=>setOpen))await p.click('#setBtn');await p.waitForTimeout(700)};
  const setText=p=>p.evaluate(()=>document.querySelector('#setOv .set-inner').innerText);
  const closeSet=async p=>{if(await p.evaluate(()=>setOpen)){await p.evaluate(()=>closeSettings(true));await p.waitForTimeout(300)}};
  /* 用畫面的編輯流程改一張卡片：開始編輯 → fn(ev) 改內容 → 按儲存（data-edsave 同一條路） */
  const editCard=(p,id,fn)=>p.evaluate(async([id,fn])=>{await startEdit('e:'+id);const ev=state.events.find(e=>e.id===id);(0,eval)(fn)(ev);evTouch(ev);syncLink(ev);dirty=true;render();if(fldCommitOpen())await saveFlow()},[id,fn.toString()]);
  const C=id=>`cards/${DEPT}__${id}`;

  /* ---------- 1. 未登入、一般登入者：唯讀 ---------- */
  {const p=await open();const u=await ui(p);
    ok(u.locked&&!u.authed&&u.editBtns===0&&u.cards===0,`未登入：唯讀、讀不到內容、沒有編輯鈕（${JSON.stringify(u)}）`);
    ok(await p.evaluate(()=>persist('x'))===false,'未登入：儲存不寫入');
    await p.ctx.close();}
  const gen=await open();await signIn(gen,'gen');
  await until(async()=>(await ui(gen)).cards>0);
  {const u=await ui(gen);ok(u.locked&&!u.authed&&u.editBtns===0&&u.cards>40,`一般登入者：讀得到（${u.cards} 張）、唯讀、沒有編輯鈕`);}
  await openSet(gen);{const s=await setText(gen);ok(s.includes('唯讀')&&!s.includes('標籤')&&!s.includes('看板名稱')&&!s.includes('備份'),'一般登入者：設定頁沒有看板設定');}

  /* ---------- 2. 編輯者 ---------- */
  const ed=await open();const edUid=await signIn(ed,'ed');
  ok((await ui(ed)).locked,'編輯者：角色給之前唯讀');
  await setRole(edUid,{[DEPT]:'editor'});
  ok(await until(async()=>{const u=await ui(ed);return !u.locked&&u.authed&&u.editBtns>0}),'編輯者：角色一給就可以編輯（不用重新整理）');
  {const g=await ed.evaluate(()=>({del:document.querySelectorAll('[data-delissue],[data-deldone],[data-delweek]').length,gantt:document.querySelector('#ganttEdBtn').hidden}));
    ok(g.del===0&&g.gantt,`編輯者：沒有刪除議題、週報（總管理員才能刪）、甘特圖時間軸（管理員）（${JSON.stringify(g)}）`);}
  await openSet(ed);{const s=await setText(ed);ok(s.includes('標籤')&&s.includes('報告')&&s.includes('備份')&&!s.includes('看板名稱')&&!s.includes('人員')&&!s.includes('學年'),'編輯者：設定頁有報告、標籤、備份，沒有看板名稱、人員、學年');}
  await closeSet(ed);
  /* a. 新增卡片（小表單 → 直接儲存） */
  await ed.click('#addEvent');ok((await dlg(ed))==='新增即時回報','新增卡片：表單');
  await dlgSet(ed,{name:'FW 新卡片',desc:'第一行'});await dlgAct(ed,'ok');await settled(ed);
  const nid=await ed.evaluate(()=>(state.events.find(e=>e.name==='FW 新卡片')||{}).id);
  let c=nid&&await read(C(nid)),v1=nid&&await read(`${C(nid)}/versions/1`);
  ok(c&&c.version===1&&c.state==='open'&&c.createdBy===edUid&&v1&&v1.title==='FW 新卡片'&&!v1.imported,'新增卡片：卡片＋第 1 版、createdBy＝自己');
  ok(await toastHas(ed,'已新增即時回報'),'新增卡片：提示已新增');
  /* b. 改內容 */
  await editCard(ed,nid,ev=>{ev.desc='第一行\n第二行'});await settled(ed);
  c=await read(C(nid));const v2=await read(`${C(nid)}/versions/2`);
  ok(c.version===2&&c.blocks.length===2&&c.blocks[1].text==='第二行'&&v2&&v2.blocks.length===2&&v2.by===edUid,'改內容：version 2＋第 2 版同批');
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
  /* e. 結案（卡片上的「結案」鈕） */
  await ed.evaluate(async id=>{await startEdit('e:'+id);openEv.add(id);render()},nid);
  await ed.evaluate(id=>document.querySelector(`#events [data-ev="${id}"] [data-evdone]`).click(),nid);await settled(ed);
  c=await read(C(nid));ok(c.state==='done'&&c.doneAt&&c.doneAt.toMillis()>Date.now()-60000,'結案：state done、doneAt＝伺服器時間');
  await ed.evaluate(async id=>{await startEdit('e:'+id)},nid);
  await ed.evaluate(id=>document.querySelector(`[data-ev="${id}"] [data-evundo]`).click(),nid);await settled(ed);
  c=await read(C(nid));ok(c.state==='open'&&c.doneAt===null,'移回即時回報：state open、doneAt null');
  /* 完成這一段：過去的時間標記移到完成紀錄（events 用新 ID 重建、舊的刪掉；超過 3 個分批） */
  const rd=await ed.evaluate(()=>{const now=nowStr().replace(' ','T');const ev=state.events.filter(e=>!e.doneAt&&e.times.some(x=>x.start<=now)).sort((a,b)=>b.times.length-a.times.length)[0];return ev&&{id:ev.id,past:ev.times.filter(x=>x.start<=now).map(x=>x.id),all:ev.times.length}});
  if(rd){
    const had=await ed.evaluate(()=>state.events.map(e=>e.id));
    await ed.evaluate(async id=>{await startEdit('e:'+id);evRoundDone(state.events.find(e=>e.id===id),'這段完成','下一段');if(fldCommitOpen())await saveFlow()},rd.id);await settled(ed);
    c=await read(C(rd.id));const rec=await ed.evaluate(([id,had])=>{const r=state.events.find(e=>e.fromEv===id&&!had.includes(e.id));return r&&{id:r.id,times:r.times.map(x=>x.id)}},[rd.id,had]);
    const rc=rec&&await read(C(rec.id));const gone=await Promise.all(rd.past.map(x=>read(`events/${DEPT}__${x}`)));
    const fresh=rec?await Promise.all(rec.times.map(x=>read(`events/${DEPT}__${x}`))):[];
    ok(rc&&rc.state==='done'&&rc.version===2&&c.timeIds.length===rd.all-rd.past.length&&gone.every(x=>!x)&&fresh.length===rd.past.length&&fresh.every(x=>x&&x.cardId===`${DEPT}__${rec.id}`),
      `完成這一段：完成紀錄（done、第 2 版）、${rd.past.length} 個過去的時間標記換到完成紀錄（舊的刪掉、用新 ID 重建）`);
  }else ok(false,'完成這一段：找不到有過去時間標記的卡片');
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
  await openSet(ed);await ed.click('[data-set="labels"]');await ed.waitForSelector('[data-newlbl="人"]',{timeout:8000});
  ok(await ed.evaluate(()=>!document.querySelector('#dlgForm [data-x="del"]')),'標籤：編輯者沒有刪除鈕');
  await ed.fill('[data-newlbl="人"]','FW 標籤');await ed.click('[data-x="add"][data-k="人"]');await ed.click('[data-x="done"]');await settled(ed);
  const lid=await ed.evaluate(()=>(state.labels.find(l=>l.name==='FW 標籤')||{}).id);
  const lb=lid&&await read(`labels/${DEPT}__${lid}`);ok(lb&&lb.kind==='人'&&lb.updatedBy===edUid,'新增標籤：labels 文件');
  await closeSet(ed);
  /* i. 永久刪除有時間標記的卡片（兩次確認） */
  const del=await ed.evaluate(()=>{const ev=state.events.filter(e=>!e.doneAt).sort((a,b)=>b.times.length-a.times.length)[0];return {id:ev.id,name:ev.name,times:ev.times.map(x=>x.id)}});
  const dc=await read(C(del.id));
  await ed.evaluate(async id=>{await startEdit('e:'+id);openEv.add(id);render()},del.id);
  await ed.evaluate(id=>document.querySelector(`#events [data-ev="${id}"] [data-evdel]`).click(),del.id);
  ok((await dlg(ed)).startsWith('刪除「'),'刪除：第一次確認');await dlgAct(ed,'delete');
  ok((await dlg(ed))===`一起刪掉 ${del.times.length} 個時間標記？`,`刪除：第二次確認寫出 ${del.times.length} 個時間標記`);await dlgAct(ed,'delete');await settled(ed);
  const left=await Promise.all([read(C(del.id)),...del.times.map(x=>read(`events/${DEPT}__${x}`)),...Array.from({length:dc.version},(_,i)=>read(`${C(del.id)}/versions/${i+1}`))]);
  ok(left.every(x=>!x),`刪除：卡片、${dc.version} 個版本、${del.times.length} 個時間標記都不在了`);
  let logs=[];await admin(async d=>{logs=(await d.collection('auditLogs').where('docId','==',`${DEPT}__${del.id}`).get()).docs.map(s=>s.data())});
  ok(logs.length===1&&logs[0].action==='purge'&&logs[0].before.title===del.name&&logs[0].actor===edUid,'刪除：刪除紀錄有標題、刪除者');
  ok(await ed.evaluate(id=>!state.events.some(e=>e.id===id),del.id),'刪除：畫面上也不在了');

  /* j. 時間標記多的卡片：一次加 5 個（分批建立）、一次拿掉 4 個（規則一批最多 3 個：分兩個版本）、永久刪除時分兩批清除 */
  await ed.click('#addEvent');await dlg(ed);await dlgSet(ed,{name:'FW 多標記',desc:''});await dlgAct(ed,'ok');await settled(ed);
  const mid=await ed.evaluate(()=>state.events.find(e=>e.name==='FW 多標記').id);
  await editCard(ed,mid,ev=>{for(let i=1;i<=5;i++)ev.times.push({id:'tmany'+i,label:'標記'+i,start:'2026-12-0'+i,end:'',place:'',toIssue:false})});await settled(ed);
  c=await read(C(mid));let evs=await Promise.all([1,2,3,4,5].map(i=>read(`events/${DEPT}__tmany${i}`)));
  ok(c.version===2&&c.timeIds.length===5&&evs.every(x=>x&&x.cardId===`${DEPT}__${mid}`),'一次加 5 個時間標記：都建好、都列在 timeIds');
  await editCard(ed,mid,ev=>{ev.times=ev.times.filter(x=>x.id==='tmany5')});await settled(ed);
  c=await read(C(mid));evs=await Promise.all([1,2,3,4,5].map(i=>read(`events/${DEPT}__tmany${i}`)));
  ok(c.version===4&&c.timeIds.length===1&&evs.slice(0,4).every(x=>!x)&&evs[4]&&!!(await read(`${C(mid)}/versions/3`)),`一次拿掉 4 個：分成兩個版本（version ${c.version}），4 個都刪掉`);
  await editCard(ed,mid,ev=>{for(let i=6;i<=9;i++)ev.times.push({id:'tmany'+i,label:'標記'+i,start:'2026-12-0'+i,end:'',place:'',toIssue:false})});await settled(ed);
  await ed.evaluate(async id=>{await startEdit('e:'+id);openEv.add(id);render()},mid);
  await ed.evaluate(id=>document.querySelector(`#events [data-ev="${id}"] [data-evdel]`).click(),mid);
  await dlg(ed);await dlgAct(ed,'delete');ok((await dlg(ed))==='一起刪掉 5 個時間標記？','刪除 5 個時間標記的卡片：第二次確認');await dlgAct(ed,'delete');await settled(ed);
  const left2=await Promise.all([read(C(mid)),...[5,6,7,8,9].map(i=>read(`events/${DEPT}__tmany${i}`)),...[1,2,3,4,5].map(v=>read(`${C(mid)}/versions/${v}`))]);
  ok(left2.every(x=>!x),'刪除 5 個時間標記、5 個版本的卡片：全部清掉（分批）');

  /* ---------- 3. 管理員：看板名稱 ---------- */
  const ad=await open();const adUid=await signIn(ad,'ad');await setRole(adUid,{[DEPT]:'admin'});
  await until(async()=>!(await ui(ad)).locked);
  ok(await ad.evaluate(()=>!document.querySelector('#ganttEdBtn').hidden),'管理員：甘特圖時間軸可以編輯');
  await openSet(ad);ok(await until(async()=>(await setText(ad)).includes('看板名稱')),'管理員：設定頁有看板名稱');
  await ad.click('[data-set="title"]');await dlg(ad);await dlgSet(ad,{v:'FW 權益部看板'});await dlgAct(ad,'ok');await settled(ad);
  const st=await read(`deptSettings/${DEPT}`),al=await read(`auditLogs/deptSettings_${DEPT}_2`);
  ok(st.title==='FW 權益部看板'&&st.rev===2&&st.updatedBy===adUid&&al&&al.actor===adUid&&al.after.fields.includes('title'),'看板名稱：deptSettings rev 2＋稽核紀錄');
  ok(await ad.evaluate(()=>state.title==='FW 權益部看板'),'看板名稱：畫面更新');
  await closeSet(ad);

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
  ok(!(await read(C(cf))).blocks.some(x=>x.text==='衝突的草稿'),'衝突：沒有寫入');
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
  ok(!(await read(C(rv))).blocks.some(x=>x.text==='撤權前的草稿'),'撤權：沒有寫入');
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
    ok(r.t.includes('設定\n看板名稱')&&r.t.includes(`即時回報\n刪除｜${del.name}`)&&r.t.includes('即時回報\n修改｜FW 新卡片'),'編輯紀錄（總管理員）：加上稽核紀錄（看板名稱、卡片刪除）');}
  /* 會長室（firestore 模式）的各部門編輯量：權益部＝不是匯入的版本＋稽核紀錄；還在 GitHub、沒有設定 repo 的部門＝讀不到（—） */
  let want=0;await admin(async d=>{want=(await d.collectionGroup('versions').where('deptId','==',DEPT).get()).docs.filter(x=>!x.data().imported).length
    +(await d.collection('auditLogs').get()).docs.map(x=>x.data()).filter(a=>a.col==='deptSettings'&&a.action==='update'&&a.docId===DEPT||a.col==='cards'&&a.action==='purge'&&a.before.deptId===DEPT).length});
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

  /* ---------- 6. 其他部門不受影響、沒有頁面錯誤 ---------- */
  const after=await others();
  ok(before.h===after.h&&before.n===after.n&&before.n>0,`其他部門的 Firestore 文件前後相同（${after.n} 份）`);
  ok(pages.every(p=>!p.puts.length),'沒有寫 GitHub');
  const errs=pages.flatMap(p=>p.errs);ok(!errs.length,`沒有頁面錯誤 ${errs.join(' | ')}`);

  for(const p of pages)await p.ctx.close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
