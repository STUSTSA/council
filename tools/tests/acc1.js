/* 02B Google 登入、角色、QR 邀請、撤權、稽核紀錄（core/js/account.js、fb-account.js）：
   用 Auth 模擬器＋Firestore 模擬器，從畫面操作走完整流程（規則用正式的 backend/firestore.rules）。
   1. 未登入：設定頁只有「用 Google 登入」；看板讀不到。App 內建瀏覽器：改成「用瀏覽器開啟」＋「複製網址」
   2. 一般登入者：第一次登入建 users／profiles；讀得到看板；帳號頁「唯讀」（ui-08 起信箱與角色在帳號頁最上面，不在列下）；沒有會長室管理
   3. 總管理員：角色即時出現「會長室管理」；產生 QR（內容＝本站網址＋#join=權杖、文件 ID＝SHA-256）、10 分鐘倒數、重新產生（舊的撤銷）、撤銷
   4. 掃 QR：權杖一讀到就從網址列拿掉；先登入再加入；加入後角色、邀請、稽核鏈正確；重放、過期、綁定信箱、已有角色都擋下
   5. 申請 → 核准；撤權（對方畫面即時變唯讀）；紀錄（含卡片刪除紀錄、權限歷史與檢查連號）；登出
   6. github 模式的部門、沒帶 QR：完全不載入 Firebase
   執行（會自己開模擬器與網站）：cd backend && npm run test:web
   只連本機模擬器；Firebase SDK 從 backend/node_modules 供應（route 掉 gstatic），不連外。 */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');const crypto=require('crypto');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8302,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
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
    await d.doc('cards/fruit__c1').set({deptId:'fruit',title:'測試卡片甲',blocks:[{id:'b1',text:'第一行',check:null,timeId:null}],timeIds:[],issueId:null,staff:[],labels:[],links:[],report:false,state:'open',doneAt:null,deletedAt:null,deletedBy:null,order:1000,version:1,createdAt:TS.now(),createdBy:'seed',updatedAt:TS.now(),updatedBy:'seed'});
    await d.doc('cards/fruit__c1/versions/1').set({cardId:'fruit__c1',deptId:'fruit',version:1,title:'測試卡片甲',blocks:[],times:[],state:'open',by:'seed',at:TS.now(),imported:false});
    await d.doc('legacyIdentities/events__m1').set({deptId:'events',name:'舊專員小明',oldRole:'member',createdAt:'',claimedBy:null,claimedAt:null,rev:1,updatedAt:TS.now(),updatedBy:'seed'});
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

  /* ---------- 6. github 模式、沒帶 QR：不載入 Firebase ---------- */
  {const g=await open(`${BASE}/index.html?d=events`,{fruitSource:null});
    ok(fbReq.length===0&&!(await g.evaluate(()=>!!document.querySelector('script[src*="fb-account"]'))),`github 模式的部門不載入 Firebase（${fbReq.length} 個請求）`);
    await g.ctx.close();}

  /* ---------- 1. 未登入 ---------- */
  const anon=await open(`${BASE}/index.html?d=fruit`);
  ok((await board(anon)).length===0&&await toastHas(anon,'要登入才能看'),'未登入：讀不到看板、提示要登入');
  await openSet(anon);
  let s=await setText(anon);
  ok(s.includes('用 Google 登入')&&!s.includes('會長室管理')&&!s.includes('人員'),'未登入：設定頁只有每週概述與「用 Google 登入」');
  await anon.ctx.close();
  const line=await open(`${BASE}/index.html?d=fruit`,{ua:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Line/14.0.0'});
  await openSet(line);s=await setText(line);
  ok(s.includes('用瀏覽器開啟')&&s.includes('複製網址')&&!s.includes('用 Google 登入'),'LINE 內建瀏覽器：顯示「用瀏覽器開啟」與「複製網址」、不嘗試登入');
  ok(await toastHas(line,'請用瀏覽器開啟'),'LINE 內建瀏覽器：看板上提示要用瀏覽器開啟');
  await line.click('[data-fb-copy]');await line.waitForTimeout(300);
  ok((await line.evaluate(()=>navigator.clipboard.readText()))===`${BASE}/index.html?d=fruit`,'LINE 內建瀏覽器：複製的網址保留 ?d=');
  await line.ctx.close();

  /* ---------- 2. 一般登入者 ---------- */
  const gen=await open(`${BASE}/index.html?d=fruit`);
  await signIn(gen,'gen');const genUid=await uidOf(gen);
  ok(await until(async()=>(await board(gen)).includes('測試卡片甲')),'一般登入者：登入後重新讀到看板內容');
  ok(await until(async()=>{const u=await read(`users/${genUid}`),pf=await read(`profiles/${genUid}`);return u&&u.email==='gen@example.test'&&pf&&pf.displayName==='gen 同學'}),'第一次登入：建立 users（信箱＝登入信箱）與 profiles（Google 名稱）');
  await openSet(gen);
  ok(await until(async()=>{const x=await meText(gen);return x.includes('gen@example.test')&&x.includes('唯讀')&&!(await setText(gen)).includes('會長室管理')}),'一般登入者：帳號頁顯示信箱與「唯讀」、沒有會長室管理');

  /* ---------- 3. 總管理員與 QR ---------- */
  const boss=await open(`${BASE}/index.html?d=fruit`);
  await signIn(boss,'boss');const bossUid=await uidOf(boss);
  await admin(d=>d.doc(`roles/${bossUid}`).set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:bossUid}));
  await admin(d=>d.doc(`auditLogs/roles_${bossUid}_1`).set({col:'roles',docId:bossUid,rev:1,action:'bootstrap',actor:bossUid,at:TS.now(),before:{},after:{super:true,depts:{}},ref:'console'}));
  await openSet(boss);
  ok(await until(async()=>(await setText(boss)).includes('會長室管理')),'總管理員：不用重新整理就出現「會長室管理」（監聽 roles）');
  const hub=async(p,k)=>{await p.click('[data-set="council"]');await p.waitForTimeout(800);if(k){await p.click(`[data-hub="${k}"]`);await p.waitForTimeout(900)}};
  await hub(boss,'invite');
  await boss.click('[data-new]');ok((await dlg(boss))==='產生 QR','QR：「產生 QR」表單');
  await dlgSet(boss,{dept:'events',role:'editor'});await dlgAct(boss,'ok');
  await boss.waitForSelector('.acct-qr svg',{timeout:8000});
  let qr1=await boss.evaluate(()=>window.__qrText),tok1=(qr1.match(/#join=([A-Za-z0-9_-]+)$/)||[])[1];
  ok(qr1.startsWith(`${BASE}/index.html?d=events#join=`)&&tok1&&tok1.length===43,`QR 內容＝本站網址＋部門＋#join=權杖（${qr1.replace(tok1,'…')}）`);
  let inv1=await read(`invitations/${sha(tok1)}`);
  ok(inv1&&inv1.status==='active'&&inv1.deptId==='events'&&inv1.role==='editor'&&!('token' in inv1),'QR：邀請文件 ID＝權杖的 SHA-256，資料庫沒有權杖');
  const life=inv1.expiresAt.toMillis()-inv1.createdAt.toMillis();
  ok(life<=600000&&life>=560000,`QR：期限 ≤ 10 分鐘（${Math.round(life/1000)} 秒）`);
  const t1=await boss.textContent(".acct-qr-t");await boss.waitForTimeout(2500);const t2=await boss.textContent('.acct-qr-t');
  ok(/^0?9:\d\d$/.test(t1)&&t1!==t2,`QR：倒數 mm:ss（${t1} → ${t2}）`);
  ok(!(await boss.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).includes(tok1),'QR：權杖沒有寫進 localStorage／sessionStorage');
  await boss.click('[data-regen]');await boss.waitForTimeout(1200);
  const qr2=await boss.evaluate(()=>window.__qrText),tok2=(qr2.match(/#join=([A-Za-z0-9_-]+)$/)||[])[1];
  inv1=await read(`invitations/${sha(tok1)}`);const inv2=await read(`invitations/${sha(tok2)}`);
  const a1=await read(`auditLogs/invitations_${sha(tok1)}_2`),a2=await read(`auditLogs/invitations_${sha(tok2)}_1`);
  ok(tok2&&tok2!==tok1&&inv1.status==='revoked'&&inv2.status==='active'&&a1.ref===sha(tok2)&&a2.ref===sha(tok1),'重新產生：舊的撤銷、新的有效，兩筆稽核互相指向');
  await boss.click('.acct-qr [data-revoke]');ok((await dlg(boss))==='撤銷這張 QR','撤銷：先確認');await dlgAct(boss,'delete');
  ok(await until(async()=>(await read(`invitations/${sha(tok2)}`)).status==='revoked')&&!(await boss.$('.acct-qr')),'撤銷：邀請改成 revoked、QR 收起');
  ok((await paneText(boss)).includes('已撤銷'),'邀請清單：列出已撤銷的邀請');
  /* 再產生一張給 u1 掃（活動部編輯者＋舊身分） */
  /* 綁定信箱存成小寫（Google 回傳的信箱是小寫，規則用 == 比對） */
  await boss.click('[data-new]');await dlg(boss);await dlgSet(boss,{dept:'pr',role:'editor',email:'Someone@Example.TEST'});await dlgAct(boss,'ok');
  await boss.waitForSelector('.acct-qr svg');const tokB=(await boss.evaluate(()=>window.__qrText)).split('#join=')[1];
  ok((await read(`invitations/${sha(tokB)}`)).boundEmail==='someone@example.test','綁定信箱：存成小寫');
  await boss.click('.acct-qr [data-revoke]');await dlg(boss);await dlgAct(boss,'delete');await until(async()=>!(await boss.$('.acct-qr')));
  await boss.click('[data-new]');await dlg(boss);await dlgSet(boss,{dept:'events',role:'editor',legacy:'events__m1'});await dlgAct(boss,'ok');
  await boss.waitForSelector('.acct-qr svg');const tok3=(await boss.evaluate(()=>window.__qrText)).split('#join=')[1];

  /* ---------- 4. 掃 QR ---------- */
  const u1=await open(`${BASE}/index.html?d=fruit#join=${tok3}`);
  ok((await u1.evaluate(()=>location.hash))===''&&(await u1.evaluate(()=>sessionStorage.getItem('workboard:join')))===tok3,'掃 QR：權杖一讀到就從網址列拿掉、暫存在這個分頁');
  ok((await dlg(u1))==='用 Google 登入','掃 QR：沒登入先要求登入');
  await stubPopup(u1,'u1');await dlgAct(u1,'ok');const u1Uid=await uidOf(u1);
  ok((await dlg(u1))==='加入活動部・編輯者'&&/剩 0?9:\d\d/.test(await u1.textContent('#dlgForm .dlg-note')),'掃 QR：預覽部門、角色與剩餘時間');
  await dlgAct(u1,'ok');
  ok(await toastHas(u1,'已加入活動部（編輯者）'),'加入：提示已加入');
  await u1.waitForURL(/\?d=events$/,{timeout:8000}).catch(()=>{});
  ok(u1.url().endsWith('/index.html?d=events'),'加入：換到那個部門的看板');
  const r1=await read(`roles/${u1Uid}`),i3=await read(`invitations/${sha(tok3)}`),lg=await read('legacyIdentities/events__m1');
  ok(r1&&r1.depts.events==='editor'&&!r1.super&&r1.lastVia==='invite'&&r1.lastRef===sha(tok3)&&r1.rev===1,'加入：roles 只多了邀請上的部門與角色');
  ok(i3.status==='used'&&i3.usedBy===u1Uid&&sha(i3.token)===sha(tok3)&&lg.claimedBy===u1Uid,'加入：邀請改成 used、舊身分由本人認領');
  ok(!!(await read(`auditLogs/invitations_${sha(tok3)}_2`))&&!!(await read(`auditLogs/roles_${u1Uid}_1`))&&!!(await read('auditLogs/legacyIdentities_events__m1_2')),'加入：邀請、角色、舊身分各有一筆稽核');
  ok(!(await u1.evaluate(()=>sessionStorage.getItem('workboard:join'))),'加入：權杖從這個分頁清掉');
  ok(!u1.errs.length,`掃 QR：沒有頁面錯誤 ${u1.errs.join(' | ')}`);
  ok(await until(async()=>(await boss.textContent('.acct-qr-t').catch(()=>'')).includes('已使用'))&&!(await boss.$('.acct-qr [data-revoke]')),'會長室：面板上那張 QR 被用掉後顯示「已使用」、不能再撤銷');
  /* 暫時的錯誤（網路不穩）不能當成失效：權杖留著 */
  {const tkT=crypto.randomBytes(32).toString('base64url');
    await admin(d=>d.doc(`invitations/${sha(tkT)}`).set({deptId:'events',role:'editor',status:'active',rev:1,createdBy:bossUid,createdAt:TS.now(),expiresAt:TS.fromMillis(Date.now()+300000),updatedAt:TS.now(),updatedBy:bossUid}));
    const p=await open(`${BASE}/index.html?d=fruit#join=${tkT}`);await dlg(p);await stubPopup(p,'u3');
    await p.evaluate(()=>{const A=window.BoardAccount,real=A.invitePreview;A.invitePreview=async()=>{A.invitePreview=real;throw Object.assign(new Error('unavailable'),{code:'unavailable'})}});
    await dlgAct(p,'ok');
    ok(await toastHas(p,'沒有連上網路')&&(await p.evaluate(()=>sessionStorage.getItem('workboard:join')))===tkT&&!(await p.$('#dlg[open]')),'掃 QR：暫時的錯誤只提示重試、權杖留著');
    await p.ctx.close();}
  /* 重放、過期、綁定信箱、已有角色 */
  const scan=async(sub,token,expect,label)=>{const p=await open(`${BASE}/index.html?d=fruit#join=${token}`);
    if(await p.evaluate(()=>!acct.user)){await dlg(p);await stubPopup(p,sub);await dlgAct(p,'ok');await uidOf(p)}
    const title=await dlg(p);ok(title===expect,`${label}：「${title}」`);await dlgAct(p,'ok');await p.ctx.close()};
  await scan('u2',tok3,'這張邀請已失效','重放已使用的 QR（別人）');
  await scan('u1',tok3,'這張邀請已失效','重放已使用的 QR（本人）');
  await scan('u2',tok2,'這張邀請已失效','掃已撤銷的 QR');
  const mk=async o=>{const tk=crypto.randomBytes(32).toString('base64url');await admin(d=>d.doc(`invitations/${sha(tk)}`).set({deptId:'events',role:'editor',status:'active',rev:1,createdBy:bossUid,createdAt:TS.now(),expiresAt:TS.fromMillis(Date.now()+300000),updatedAt:TS.now(),updatedBy:bossUid,...o}));return tk};
  await scan('u2',await mk({expiresAt:TS.fromMillis(Date.now()-1000)}),'這張邀請已失效','掃過期 1 秒的 QR');
  await scan('u2',await mk({boundEmail:'other@example.test'}),'這張邀請只限指定的帳號使用','綁定別的信箱');
  await scan('u1',await mk({}),'你已經是活動部的編輯者','已經在那個部門有角色');
  await scan('u2','A'.repeat(43),'這張邀請已失效','竄改的權杖');

  /* ---------- 5. 申請 → 核准；撤權；紀錄；登出 ---------- */
  const u2=await open(`${BASE}/index.html?d=fruit`);await signIn(u2,'u2');const u2Uid=await uidOf(u2);
  await openSet(u2);await u2.click('[data-set="acct"]');await u2.waitForTimeout(800);
  await u2.click('[data-hub="req"]');ok((await dlg(u2))==='申請編輯權限','申請：表單');
  await dlgSet(u2,{dept:'pr',role:'editor',note:'公關部新幹部'});await dlgAct(u2,'ok');
  ok(await toastHas(u2,'已送出申請'),'申請：送出');
  ok(await until(async()=>(await paneText(u2)).includes('公關部・編輯者')),'申請：帳號頁列出待審的申請');
  const u1b=await open(`${BASE}/index.html?d=fruit`);await signIn(u1b,'u1');await uidOf(u1b);await openSet(u1b);
  ok(await until(async()=>(await meText(u1b)).includes('活動部・編輯者')),'u1：帳號頁顯示活動部・編輯者');
  /* 總管理員：核准 */
  await boss.click('#setOv [data-set="council"]');await boss.waitForTimeout(600);   /* 收起 */
  await hub(boss,'requests');
  ok(await until(async()=>(await paneText(boss)).includes('公關部編輯者')&&(await paneText(boss)).includes('公關部新幹部')),'核准：待審清單顯示申請人、部門、角色、備註');
  await boss.click('[data-ok]');
  ok(await until(async()=>{const r=await read(`roles/${u2Uid}`);return r&&r.depts.pr==='editor'&&r.lastVia==='request'}),'核准：同一批寫入角色');
  ok(await until(async()=>(await meText(u2)).includes('公關部・編輯者')),'核准：申請人的帳號頁即時顯示新角色');
  /* 撤權 */
  await boss.click('#setOv [data-set="council"]');await boss.waitForTimeout(600);
  await hub(boss,'people');
  ok(await until(async()=>{const x=await paneText(boss);return x.includes('u1 同學')&&x.includes('u2 同學')&&x.includes('總管理員')}),'人員：列出有角色的人與角色');
  await boss.click(`[data-who="${u1Uid}"]`);await boss.waitForTimeout(500);
  await boss.click('[data-rm="events"]');ok((await dlg(boss)).includes('撤銷 u1 同學 的活動部編輯權限'),'撤權：確認對話框寫出對象與部門');
  await dlgAct(boss,'delete');
  ok(await until(async()=>{const r=await read(`roles/${u1Uid}`);return r&&!r.depts.events&&r.lastVia==='revoke'&&r.rev===2}),'撤權：roles 拿掉那個部門（rev 2、lastVia revoke）');
  ok(await until(async()=>(await meText(u1b)).includes('唯讀')),'撤權：被撤的人帳號頁即時變回唯讀');
  ok((await board(u1b)).includes('測試卡片甲'),'撤權：仍然看得到看板（登入就能讀）');
  /* 自己不能取消自己的總管理員：畫面上沒有按鈕 */
  await boss.click('[data-back]');await boss.waitForTimeout(300);await boss.click(`[data-who="${bossUid}"]`);await boss.waitForTimeout(300);
  ok(!(await boss.$('[data-super]'))&&(await paneText(boss)).includes('自己'),'人員：自己的總管理員不能取消');
  /* 權限歷史＋檢查連號 */
  await boss.click('[data-back]');await boss.waitForTimeout(300);await boss.click(`[data-who="${u1Uid}"]`);await boss.waitForTimeout(300);
  await boss.click('[data-hist]');await boss.waitForTimeout(900);
  let pt2=await paneText(boss);
  ok(pt2.includes('權限歷史')&&pt2.includes('撤權')&&pt2.includes('QR 加入'),'權限歷史：列出 QR 加入與撤權');
  await boss.click('[data-chain]');ok(await until(async()=>(await paneText(boss)).includes('第 1～2 號連續')),'權限歷史：檢查連號');
  /* 卡片刪除紀錄：用規則測試的參考流程（helpers.js 的 purgeCard，部門管理員）刪一張卡片，紀錄裡要看得到誰、標題 */
  await admin(d=>d.doc(`roles/${u2Uid}`).update({'depts.fruit':'admin'}));
  const H=await import(path.join(ROOT,'backend/tests/helpers.js')),tp=await H.env();
  await H.purgeCard(H.google(tp,u2Uid),u2Uid,"fruit__c1");await tp.cleanup();
  ok(!(await read('cards/fruit__c1')),'卡片刪除：卡片已永久刪除');
  await boss.click('#setOv [data-set="council"]');await boss.waitForTimeout(600);
  await hub(boss,'audit');
  pt2=await paneText(boss);
  ok(pt2.includes('刪除卡片')&&pt2.includes('測試卡片甲')&&pt2.includes('u2 同學'),'紀錄：看得到卡片刪除（誰、標題）');
  ok(pt2.includes('核准申請')&&pt2.includes('撤權')&&pt2.includes('重新產生 QR')&&pt2.includes('撤銷 QR'),'紀錄：核准、撤權、重新產生、撤銷都有');
  ok(!boss.errs.length&&!gen.errs.length&&!u2.errs.length,`沒有頁面錯誤 ${[...boss.errs,...gen.errs,...u2.errs].join(' | ')}`);
  /* 登出 */
  await meText(gen);await gen.click('[data-hub="out"]');   /* 帳號頁在第 2 段已經打開（meText），再點那一列會收起 */
  ok(await until(async()=>(await setText(gen)).includes('用 Google 登入')),'登出：設定頁回到「用 Google 登入」');
  ok(await until(async()=>(await board(gen)).length===0),'登出：看板內容清掉');

  for(const p of [gen,boss,u1,u2,u1b])await p.ctx.close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
