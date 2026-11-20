/* 05 部門成員名單、部長管理、全部帳號、舊身分清除（core/js/account.js 的 membersPanel、peoplePanel、legacyPanel；規則 backend/firestore.rules 05）：
   用 Auth 模擬器＋Firestore 模擬器，從畫面操作走完整流程。
   1. 部門成員：編輯者、管理員、總管理員看得到名單（名字、角色、沒有信箱）；沒有角色的人沒有這一列；編輯者只能看
   2. 部長：新增編輯者（QR、本部門、編輯者）→ 對方掃了加入後名單跟著變；撤銷編輯者（roles、稽核、名單同一批）；不能撤管理員與自己
   3. 攻擊（直接呼叫資料層）：部長刪舊身分、編輯者撤人、部長撤別的部門的人：規則擋下
   4. 總管理員：人員頁多一區「尚無權限的帳號」→ 點進去指派；舊身分頁逐筆、整個部門、全部刪除，刪除前確認；刪掉後負責人顯示「（已移除）」
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');const crypto=require('crypto');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8303,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

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
  const DEPTS=['rights','president','secretariat','marketing','finance','events','affairs','pr','works','fruit'];
  await admin(async d=>{
    for(const [i,id] of DEPTS.entries())await d.doc(`departments/${id}`).set({name:id,order:i,active:true,updatedAt:TS.now(),updatedBy:'seed'});
    await d.doc('deptSettings/fruit').set({title:'水果部工作進度',rev:1,updatedAt:TS.now(),updatedBy:'seed'});
    const L=(dept,name,claimedBy=null)=>({deptId:dept,name,oldRole:'member',createdAt:'',claimedBy,claimedAt:null,rev:1,updatedAt:TS.now(),updatedBy:'seed'});
    await d.doc('legacyIdentities/fruit__m1').set(L('fruit','舊專員小明'));
    await d.doc('legacyIdentities/fruit__m2').set(L('fruit','舊專員小華','someone'));
    await d.doc('legacyIdentities/events__m1').set(L('events','舊專員阿德'));
    await d.doc('legacyIdentities/rights__m1').set(L('rights','舊專員小美'));
  });

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');   /* 每個部門先回到預設的 github，下面再照這支測試要的切換（不依賴正式網站目前哪些部門已切換，例如水果部實測時是 firestore） */
  const fbReq=[];
  /* source：把 fruit 設成 firestore（其他部門照設定檔＝github）；firebase 設定改成模擬器 */
  const open=async(url,{ua,fruitSource='firestore'}={})=>{
    const ctx=await b.newContext({viewport:{width:1200,height:850},serviceWorkers:'block',...(ua?{userAgent:ua}:{})});
    await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());fbReq.push(r.request().url());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;
      if(fruitSource)s=s.replace(/(\{ id: "fruit",[^\n]*?)( \},?\n)/,`$1, source: "${fruitSource}"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.toasts=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.exposeFunction('__toast',m=>p.toasts.push(m));
    await p.addInitScript(()=>{
      new MutationObserver(()=>{const t=document.querySelector('#toast');if(t&&t.textContent&&t.classList.contains('show'))window.__toast(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
      /* 記下 QR 的內容（測試用：權杖只在產生它的面板記憶體裡，畫面上只有 QR 圖） */
      let real;Object.defineProperty(window,'qrcode',{configurable:true,get(){return real},set(v){real=Object.assign(function(n,e){const q=v(n,e),ad=q.addData;q.addData=(s,...r)=>{window.__qrText=s;return ad.call(q,s,...r)};return q},v)}});
    });
    await p.goto(url);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1500);
    p.ctx=ctx;return p};
  /* Auth 模擬器接受未簽章的 Google ID token：同一個 sub＝同一個帳號 */
  /* 掃 QR 的真正流程：對話框按「確定」→ account.js 的 acctSignIn → BoardAccount.signIn（彈出視窗）。
     測試把彈出視窗那一步換成同一個帳號的 signInWithCredential，其餘照正式程式走 */
  const stubPopup=(p,sub)=>p.waitForFunction(()=>!!window.BoardAccount,null,{timeout:10000}).then(()=>p.evaluate(sub=>{window.BoardAccount.signIn=async()=>{
    const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})));return ""}},sub));
  const signIn=(p,sub)=>p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
  const uidOf=p=>p.waitForFunction(()=>acct.user&&acct.user.uid,null,{timeout:10000}).then(x=>x.jsonValue());
  const openSet=async p=>{if(!await p.evaluate(()=>setOpen))await p.click('#setBtn');await p.waitForTimeout(700)};
  const setText=p=>p.evaluate(()=>document.querySelector('#setOv .set-inner').innerText);
  const paneText=p=>p.evaluate(()=>{const e=document.querySelector('#setOv .set-pane');return e?e.innerText:''});
  /* ui-08：設定清單的列只寫「帳號」，信箱與角色畫在帳號頁最上面（.acct-me）；沒打開就先打開帳號頁 */
  const meText=async p=>{if(await p.evaluate(()=>paneKey!=='acct'&&!!document.querySelector('#setOv [data-set="acct"]'))){await p.click('#setOv [data-set="acct"]');await p.waitForTimeout(800)}
    return p.evaluate(()=>{const e=document.querySelector('#setOv .set-pane .acct-me');return e?e.innerText:''})};
  const dlg=p=>p.waitForSelector('#dlg[open]',{timeout:8000}).then(()=>p.evaluate(()=>document.querySelector('#dlgForm b').textContent));
  const dlgSet=(p,o)=>p.evaluate(o=>{for(const [k,v] of Object.entries(o)){const i=document.querySelector(`#dlgForm [name="${k}"]`);i.value=v}},o);
  const dlgAct=async(p,a)=>{await p.click(`#dlg [data-act="${a}"]`);await p.waitForTimeout(600)};
  const until=async(fn,ms=8000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
  const toastHas=(p,s)=>until(()=>p.toasts.some(x=>x.includes(s)));
  const board=p=>p.evaluate(()=>state.events.map(e=>e.name));

  /* ---------- 準備：每個人各開一頁、登入、拿到 uid，再用管理端（等同主控台）給角色 ---------- */
  const P={},U={};
  for(const n of ['boss','adm','edA','edB','nb','x1']){P[n]=await open(`${BASE}/index.html?d=fruit`);await signIn(P[n],n);U[n]=await uidOf(P[n])}
  const role=(uid,r,rev=1)=>admin(d=>d.doc(`roles/${uid}`).set({super:false,depts:{},...r,rev,lastVia:'manual',lastRef:'seed',updatedAt:TS.now(),updatedBy:'seed'}));
  await role(U.boss,{super:true});await role(U.adm,{depts:{fruit:'admin'}});await role(U.edA,{depts:{fruit:'editor'}});await role(U.edB,{depts:{fruit:'editor'}});
  await admin(d=>d.doc(`auditLogs/roles_${U.boss}_1`).set({col:'roles',docId:U.boss,rev:1,action:'bootstrap',actor:U.boss,at:TS.now(),before:{},after:{super:true,depts:{}},ref:'console'}));
  /* 名單由各人登入時自己補（rosterSelf，帶 role）；edB 改成沒有 role 的舊文件 */
  ok(await until(async()=>{const m=await read(`deptMembers/fruit__${U.adm}`);return m&&m.role==='admin'}),'名單：管理員登入時補上自己那一份（含 role＝admin）');
  ok(await until(async()=>{const m=await read(`deptMembers/fruit__${U.edA}`);return m&&m.role==='editor'}),'名單：編輯者登入時補上自己那一份（含 role＝editor）');
  await until(async()=>!!(await read(`deptMembers/fruit__${U.edB}`)));
  await admin(d=>d.doc(`deptMembers/fruit__${U.edB}`).set({deptId:'fruit',uid:U.edB,at:TS.now()}));
  const setHas=async(p,k)=>p.evaluate(k=>!!document.querySelector(`#setOv [data-set="${k}"]`),k);
  const members=async p=>{await openSet(p);if(!await until(()=>setHas(p,'members'),4000))return false;
    if(await p.evaluate(()=>paneKey==='members'))return true;await p.click('#setOv [data-set="members"]');await p.waitForTimeout(900);return true};

  /* ---------- 1. 部門成員名單 ---------- */
  ok(await members(P.edA),'編輯者：設定有「部門成員」');
  let txt=await paneText(P.edA);
  ok(txt.includes('adm 同學')&&txt.includes('部長')&&txt.includes('edA 同學')&&txt.includes('編輯者')&&txt.includes('edB 同學'),`編輯者：看得到本部門的成員與角色（${txt.replace(/\n/g,' / ')}）`);
  ok(!txt.includes('example.test'),'編輯者：名單沒有信箱');
  ok(txt.includes('成員')&&await P.edA.evaluate(()=>!document.querySelector('#setOv .acct-panel [data-rm],#setOv .acct-panel [data-new]')),'編輯者：沒有「新增編輯者」與「撤銷」；沒有 role 的舊文件顯示「成員」');
  await openSet(P.nb);ok(!(await setHas(P.nb,'members')),'沒有角色的登入者：沒有「部門成員」');

  /* ---------- 2. 部長：新增編輯者、撤銷 ---------- */
  ok(await members(P.adm),'部長：設定有「部門成員」');
  ok((await paneText(P.adm)).includes('新增編輯者'),'部長：看得到「新增編輯者」');
  ok(await P.adm.evaluate(([a,b,c])=>!document.querySelector(`#setOv .acct-panel [data-rm="${a}"]`)&&!!document.querySelector(`#setOv .acct-panel [data-rm="${b}"]`)&&!document.querySelector(`#setOv .acct-panel [data-rm="${c}"]`),[U.adm,U.edA,U.edB]),'部長：只有編輯者（edA）有「撤銷」；自己、沒有 role 的 edB 沒有');
  await P.adm.click('.acct-panel [data-new]');
  await P.adm.waitForSelector('.acct-qr svg',{timeout:8000});
  const qr=await P.adm.evaluate(()=>window.__qrText),tok=(qr.match(/#join=([A-Za-z0-9_-]+)$/)||[])[1];
  ok(qr.startsWith(`${BASE}/index.html?d=fruit#join=`)&&tok&&tok.length===43,'部長：QR 內容＝本站網址＋本部門＋#join=權杖');
  const inv=await read(`invitations/${sha(tok)}`);
  ok(inv&&inv.deptId==='fruit'&&inv.role==='editor'&&inv.createdBy===U.adm&&inv.status==='active'&&!('legacyRef' in inv),'部長：邀請文件＝本部門、編輯者、自己發的、沒有舊身分');
  const red=await P.nb.evaluate(t=>window.BoardAccount.inviteRedeem(t).then(r=>r,e=>({err:e.code})),tok);
  ok(red&&red.deptId==='fruit'&&red.role==='editor','對方掃 QR 加入：成為本部門編輯者');
  ok(await until(async()=>(await paneText(P.adm)).includes('nb 同學'),9000),'部長：對方加入後名單自動多一列');
  ok(await until(async()=>{const m=await read(`deptMembers/fruit__${U.nb}`);return m&&m.role==='editor'}),'對方的名單文件帶 role＝editor');
  /* 撤銷 edA */
  await P.adm.click(`.acct-panel [data-rm="${U.edA}"]`);
  {const ti=await dlg(P.adm);ok(ti.includes('撤銷 edA 同學')&&ti.includes('編輯權限'),`撤銷：先確認（${ti}）`)}
  await dlgAct(P.adm,'cancel');await P.adm.waitForTimeout(500);
  ok(((await read(`roles/${U.edA}`)).depts||{}).fruit==='editor','撤銷：按取消不寫入');
  await P.adm.click(`.acct-panel [data-rm="${U.edA}"]`);await dlg(P.adm);await dlgAct(P.adm,'delete');
  ok(await until(async()=>{const r=await read(`roles/${U.edA}`);return r&&!(r.depts||{}).fruit&&r.lastVia==='dept'&&r.lastRef==='fruit'}),'撤銷：roles 拿掉本部門（lastVia＝dept、lastRef＝部門）');
  ok(!(await read(`deptMembers/fruit__${U.edA}`)),'撤銷：名單文件同一批刪掉');
  const au=await read(`auditLogs/roles_${U.edA}_2`);
  ok(au&&au.action==='dept'&&au.actor===U.adm&&au.ref==='fruit','撤銷：稽核紀錄（動作 dept、操作人＝部長、ref＝部門）');
  ok(await until(async()=>!(await paneText(P.adm)).includes('edA 同學')),'撤銷：名單即時少一列');
  ok(await until(async()=>(await P.edA.evaluate(()=>!fsWriter()))),'被撤銷的人：畫面即時變唯讀');

  /* ---------- 3. 攻擊：直接呼叫資料層，規則要擋 ---------- */
  const call=(p,fn,...a)=>p.evaluate(async([fn,a])=>{try{await window.BoardAccount[fn](...a);return 'ok'}catch(e){return e.code||String(e)}},[fn,a]);
  ok(await call(P.adm,'legacyDelete',['fruit__m1'])==='permission-denied'&&!!(await read('legacyIdentities/fruit__m1')),'部長刪舊身分：被擋，資料還在');
  ok(await call(P.nb,'deptRemove',U.edB,'fruit')==='permission-denied'&&((await read(`roles/${U.edB}`)).depts||{}).fruit==='editor','編輯者撤別人：被擋');
  ok(await call(P.adm,'deptRemove',U.adm,'fruit')!=='ok'&&((await read(`roles/${U.adm}`)).depts||{}).fruit==='admin','部長撤自己：被擋');
  const evA=await open(`${BASE}/index.html?d=fruit`);await signIn(evA,'evA');const evAUid=await uidOf(evA);
  await role(evAUid,{depts:{events:'admin'}});await role(U.edB,{depts:{fruit:'editor',events:'editor'}},2);await evA.waitForTimeout(800);
  ok(await call(P.adm,'deptRemove',U.edB,'events')==='permission-denied'&&((await read(`roles/${U.edB}`)).depts||{}).events==='editor','部長撤別的部門的人：被擋');
  ok(await call(evA,'deptRemove',U.edB,'fruit')==='permission-denied','別的部門的部長撤本部門的人：被擋');
  ok(await call(P.adm,'inviteCreate',{deptId:'fruit',role:'admin'})==='permission-denied'&&await call(P.adm,'inviteCreate',{deptId:'events',role:'editor'})==='permission-denied','部長發管理員邀請、發別的部門的邀請：被擋');
  ok(await call(P.adm,'rolesList')==='permission-denied'&&await call(P.adm,'usersList')==='permission-denied','部長讀全部 roles、全部 users（信箱）：被擋');

  /* ---------- 4. 總管理員：全部帳號、舊身分 ---------- */
  await openSet(P.boss);
  await P.boss.click('#setOv [data-set="council"]');await P.boss.waitForTimeout(800);await P.boss.click('[data-hub="people"]');await P.boss.waitForTimeout(1200);
  txt=await paneText(P.boss);
  ok(txt.includes('尚無權限的帳號')&&txt.includes('x1@example.test'),'總管理員人員頁：多一區「尚無權限的帳號」，列出登入過但沒有權限的人（含信箱）');
  ok(txt.includes('adm@example.test')&&txt.includes('nb@example.test'),'總管理員人員頁：有權限的人在上面一區');
  await P.boss.click(`[data-who="${U.x1}"]`);await P.boss.waitForTimeout(500);await P.boss.click('[data-add]');await dlg(P.boss);
  await dlgSet(P.boss,{dept:'fruit',role:'editor'});await dlgAct(P.boss,'ok');
  ok(await until(async()=>{const r=await read(`roles/${U.x1}`);return r&&(r.depts||{}).fruit==='editor'}),'總管理員：從「尚無權限的帳號」指派部門與角色');
  ok(await until(async()=>!!(await read(`deptMembers/fruit__${U.x1}`))),'指派後名單也補上');
  await P.boss.click('[data-back]');await P.boss.waitForTimeout(600);
  ok(!(await paneText(P.boss)).includes('尚無權限的帳號')||!(await paneText(P.boss)).split('尚無權限的帳號')[1].includes('x1@example.test'),'指派後：x1 不再在「尚無權限的帳號」');
  /* 舊身分 */
  P.boss=await open(`${BASE}/index.html?d=fruit`);await signIn(P.boss,'boss');await P.boss.waitForTimeout(1500);await openSet(P.boss);await P.boss.click('#setOv [data-set="council"]');await P.boss.waitForTimeout(800);
  await P.boss.click('[data-hub="legacy"]');await P.boss.waitForTimeout(1000);
  txt=await paneText(P.boss);
  ok(txt.includes('舊專員小明')&&txt.includes('舊專員小華')&&txt.includes('舊專員阿德')&&txt.includes('舊專員小美')&&txt.includes('全部刪除（4）'),'舊身分頁：列出全部（依部門分組）與「全部刪除（4）」');
  ok(txt.includes('已有人認領')&&txt.includes('沒有人認領'),'舊身分頁：標出有沒有人認領');
  await P.boss.click('[data-del="fruit__m1"]');
  ok((await dlg(P.boss))==='刪除舊身分「舊專員小明」','逐筆刪除：先確認（標題寫出名字）');
  const note=await P.boss.evaluate(()=>{const n=document.querySelector('#dlgForm .dlg-note');return n?n.innerText:''});
  ok(note.includes('無法復原')&&note.includes('（已移除）')&&note.includes('匯出全部資料'),'刪除確認：說明無法復原、負責人改顯示（已移除）、先備份');
  await dlgAct(P.boss,'cancel');await P.boss.waitForTimeout(500);
  ok(!!(await read('legacyIdentities/fruit__m1')),'逐筆刪除：按取消不刪');
  await P.boss.click('[data-del="fruit__m1"]');await dlg(P.boss);await dlgAct(P.boss,'delete');
  ok(await until(async()=>!(await read('legacyIdentities/fruit__m1'))&&!!(await read('legacyIdentities/fruit__m2'))),'逐筆刪除：只刪那一筆');
  await P.boss.waitForTimeout(800);
  await P.boss.click('[data-deldept="fruit"]');
  const t2=await dlg(P.boss),n2=await P.boss.evaluate(()=>document.querySelector('#dlgForm .dlg-note').innerText);
  ok(t2.includes('1 個舊身分')&&n2.includes('其中 1 位已有人認領'),'整個部門刪除：確認寫出筆數與已認領的人數');
  await dlgAct(P.boss,'delete');
  ok(await until(async()=>!(await read('legacyIdentities/fruit__m2'))&&!!(await read('legacyIdentities/events__m1'))),'整個部門刪除：只刪那個部門');
  await P.boss.waitForTimeout(800);
  await P.boss.click('[data-delall]');await dlg(P.boss);await dlgAct(P.boss,'delete');
  ok(await until(async()=>!(await read('legacyIdentities/events__m1'))&&!(await read('legacyIdentities/rights__m1'))),'全部刪除：全部清掉');
  ok(await until(async()=>(await paneText(P.boss)).includes('沒有舊身分')),'全部刪除後：畫面顯示「沒有舊身分」');
  const gone=await open(`${BASE}/index.html?d=fruit`);await signIn(gone,'boss');await gone.waitForTimeout(1500);
  ok(await gone.evaluate(()=>JSON.stringify(staffNames(["legacy:fruit__m1","legacy:fruit__m2","legacy:fruit__zz"])))==='["（已移除）"]','刪除後：卡片負責人顯示「（已移除）」（只顯示一次），不是代號');

  for(const p of [...Object.values(P),evA,gone])await p.ctx.close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
