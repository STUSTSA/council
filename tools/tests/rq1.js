/* 06 申請與審核流程（core/js/account.js 的 acctRequest、等待說明、membersPanel 的待審申請；規則 backend/firestore.rules 06）：
   用 Auth 模擬器＋Firestore 模擬器，從畫面操作走完整流程。
   1. 沒有權限的登入者：帳號頁說明「還沒有編輯權限」；選部門＋位階（部員／次長／部長）送申請 → 申請文件 role／rank 正確；等待說明改成「等待審核」
   2. 部長：本部門成員頁看到待審的部員、次長申請，核准 → 對方有本部門編輯者；部長申請不給核准按鈕（要總管理員）
   3. 部長拒絕；攻擊（直接呼叫資料層）：別部門的部長審、部長核准部長申請、自己核准自己：規則擋下
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');const crypto=require('crypto');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8304,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
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


  const P={},U={};
  for(const n of ['boss','adm','evAdm','g1','g2','g3','g4']){P[n]=await open(`${BASE}/index.html?d=fruit`);await signIn(P[n],n);U[n]=await uidOf(P[n])}
  const role=(uid,r,rev=1)=>admin(d=>d.doc(`roles/${uid}`).set({super:false,depts:{},...r,rev,lastVia:'manual',lastRef:'seed',updatedAt:TS.now(),updatedBy:'seed'}));
  await role(U.boss,{super:true});await role(U.adm,{depts:{fruit:'admin'}});await role(U.evAdm,{depts:{events:'admin'}});
  await admin(d=>d.doc(`auditLogs/roles_${U.boss}_1`).set({col:'roles',docId:U.boss,rev:1,action:'bootstrap',actor:U.boss,at:TS.now(),before:{},after:{super:true,depts:{}},ref:'console'}));
  await admin(async d=>{for(const n of ['adm','evAdm'])await d.doc(`auditLogs/roles_${U[n]}_1`).set({col:'roles',docId:U[n],rev:1,action:'manual',actor:U.boss,at:TS.now(),before:{},after:{super:false,depts:{}},ref:'seed'})});
  for(const n of ['adm','evAdm','g1','g2','g3','g4'])await P[n].reload(),await P[n].waitForTimeout(1500);

  /* 1. 申請頁與等待說明 */
  const hub=async p=>{await openSet(p);return meText(p)};
  let me=await hub(P.g1);
  ok(await P.g1.evaluate(()=>!!document.querySelector('#setOv [data-set="apply"]')),'沒有權限：設定最上面有「申請編輯權限」一列');
  ok(await P.adm.evaluate(()=>!document.querySelector('#setOv [data-set="apply"]')),'有部門角色的人：沒有這一列');
  {const w=await paneText(P.g1);ok(w.includes('還沒有編輯權限'),`沒有權限：帳號頁說明還沒有編輯權限（${w.replace(/\n/g,' / ')}）`)}
  const form=async p=>{await p.evaluate(()=>{const b=[...document.querySelectorAll('#setOv .set-pane button,#setOv .set-pane .set-row')].find(x=>x.textContent.includes('申請加入部門'));b&&b.click()});await dlg(p);
    return p.evaluate(()=>[...document.querySelectorAll('#dlgForm [name="rank"] option')].map(o=>o.textContent).join('|'))};
  await form(P.g1);const opts=await P.g1.evaluate(()=>RANK_OPT.map(o=>o[1]).join('|'));ok(opts==='部員|次長|部長／處長／會長',`申請表單：位階選項（${opts}）`);
  await dlgSet(P.g1,{dept:'fruit',rank:'member',note:'我是新進部員'});
  await P.g1.evaluate(()=>document.querySelector('#dlg [data-act="ok"],#dlg [data-act="confirm"],#dlg .primary').click());await P.g1.waitForTimeout(1200);
  const q1=await read(`roleRequests/${U.g1}_fruit`);
  ok(q1&&q1.role==='editor'&&q1.rank==='member'&&q1.status==='pending'&&q1.note==='我是新進部員','部員申請：role＝editor、rank＝member、待審');
  {const w=await paneText(P.g1);ok(w.includes('等待')&&w.includes('審核'),`送出後：帳號頁改成等待審核說明（${w.replace(/\n/g,' / ')}）`)}
  for(const [n,rank] of [['g2','deputy'],['g3','minister']]){
    await hub(P[n]);await form(P[n]);await dlgSet(P[n],{dept:'fruit',rank,note:''});
    await P[n].evaluate(()=>document.querySelector('#dlg [data-act="ok"],#dlg [data-act="confirm"],#dlg .primary').click());await P[n].waitForTimeout(1200)}
  const q2=await read(`roleRequests/${U.g2}_fruit`),q3=await read(`roleRequests/${U.g3}_fruit`);
  ok(q2&&q2.role==='editor'&&q2.rank==='deputy','次長申請：role＝editor、rank＝deputy');
  ok(q3&&q3.role==='admin'&&q3.rank==='minister','部長申請：role＝admin、rank＝minister');

  /* 2. 部長在成員頁審核 */
  const members=async p=>{await openSet(p);await p.click('#setOv [data-set="members"]');await p.waitForTimeout(1200)};
  await members(P.adm);
  let txt=await paneText(P.adm);
  ok(txt.includes('待審的申請（3）')&&txt.includes('g1 同學・部員')&&txt.includes('g2 同學・次長'),`部長：成員頁看到待審申請（${txt.replace(/\n/g,' / ')}）`);
  ok(await P.adm.evaluate(([a,b,c])=>!!document.querySelector(`[data-rok="${a}_fruit"]`)&&!!document.querySelector(`[data-rok="${b}_fruit"]`)&&!document.querySelector(`[data-rok="${c}_fruit"]`),[U.g1,U.g2,U.g3]),'部長：部員、次長申請有核准按鈕；部長申請沒有（要總管理員）');
  ok(txt.includes('要由總管理員核准'),'部長申請標示要由總管理員核准');
  await P.adm.click(`[data-rok="${U.g1}_fruit"]`);
  {const ti=await dlg(P.adm);ok(ti.includes('核准 g1 同學'),`核准前先確認（${ti}）`)}
  await dlgAct(P.adm,'delete');
  ok(await until(async()=>{const r=await read(`roles/${U.g1}`);return r&&r.depts&&r.depts.fruit==='editor'&&r.lastVia==='request'&&r.updatedBy===U.adm}),'核准：對方成為本部門編輯者（來源 request、操作人＝部長）');
  ok((await read(`roleRequests/${U.g1}_fruit`)).status==='approved','核准：申請改為 approved');
  ok(await until(async()=>P.g1.evaluate(()=>fsWriter())),'核准後：對方畫面即時可編輯');
  ok(await until(async()=>{const m=await read(`deptMembers/fruit__${U.g1}`);return m&&m.role==='editor'}),'核准後：名單補上對方');
  await P.adm.click(`[data-rno="${U.g2}_fruit"]`);await dlg(P.adm);await dlgAct(P.adm,'delete');
  ok(await until(async()=>(await read(`roleRequests/${U.g2}_fruit`)).status==='rejected'),'部長拒絕次長申請：狀態 rejected');
  ok(!(((await read(`roles/${U.g2}`))||{}).depts||{}).fruit,'拒絕：沒有給權限');

  /* 3. 攻擊 */
  const tryW=(p,fn,...a)=>p.evaluate(async([fn,a])=>{try{await window.BoardAccount[fn](...a);return 'ok'}catch(e){return e.code||String(e)}},[fn,a]);
  ok(await tryW(P.adm,'requestApprove',`${U.g3}_fruit`,1)==='permission-denied','攻擊：部長核准部長申請：規則擋下');
  ok(await tryW(P.evAdm,'requestApprove',`${U.g3}_fruit`,1)!=='ok'&&await tryW(P.evAdm,'requestDecide',`${U.g3}_fruit`,'rejected',1)!=='ok','攻擊：別部門的部長審核：規則擋下');
  ok(await tryW(P.g3,'requestApprove',`${U.g3}_fruit`,1)!=='ok','攻擊：自己核准自己：規則擋下');
  ok(!(((await read(`roles/${U.g3}`))||{}).depts||{}).fruit,'攻擊之後：部長申請人仍沒有權限');
  ok(await tryW(P.boss,'requestApprove',`${U.g3}_fruit`,1)==='ok'&&((await read(`roles/${U.g3}`)).depts||{}).fruit==='admin','總管理員核准部長申請：成功');

  for(const p of Object.values(P))await p.ctx.close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
