/* 03 F3 專員名單（deptMembers）與 F4 安裝成 App（設定 →「這台裝置」）：Auth＋Firestore 模擬器、正式規則；權益部切成 firestore。
   F3：有角色的人登入後補上自己的名單；編輯者選專員時列出同部門全部有角色的人（名字從 profiles）；別部門、沒有角色的人讀不到；總管理員撤權後對齊、打開人員清掉過期的。
   F4：瀏覽器支援安裝時「這台裝置」只有一顆「安裝」；iPhone／iPad Safari 還沒加入主畫面時顯示步驟；已安裝、不支援（iPhone 的 Chrome、電腦還沒提供安裝）時不出現。
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8308,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
const file=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));

(async()=>{
  await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  const {initializeTestEnvironment}=breq('@firebase/rules-unit-testing');const firebase=breq('firebase/compat/app');breq('firebase/compat/firestore');
  const [h,pt]=EMU.split(':');
  const t=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:h,port:+pt,rules:fs.readFileSync(path.join(ROOT,'backend/firestore.rules'),'utf8')}});
  await t.clearFirestore();
  await fetch(`http://${AEMU}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
  const TS=firebase.firestore.Timestamp;
  const admin=fn=>t.withSecurityRulesDisabled(async c=>fn(c.firestore()));
  const tok=uid=>({sub:uid,user_id:uid,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{}}});
  await admin(d=>d.doc('roles/su').set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedBy:'su',updatedAt:TS.now()}));

  const setRole=(uid,depts,sup=false)=>admin(d=>d.doc(`roles/${uid}`).set({super:sup,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  const read=async p=>{let v;await admin(async d=>{const s=await d.doc(p).get();v=s.exists?s.data():null});return v};
  const roster=async dept=>{let v;await admin(async d=>{v=(await d.collection('deptMembers').where('deptId','==',dept).get()).docs.map(x=>x.data().uid).sort()});return v};
  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');   /* 每個部門先回到預設的 github，下面再照這支測試要的切換（不依賴正式網站目前哪些部門已切換，例如水果部實測時是 firestore） */
  const open=async(dept,{ua,standalone,w=1000,vh=850}={})=>{
    const ctx=await b.newContext({viewport:{width:w,height:vh},serviceWorkers:'block',...(ua?{userAgent:ua,isMobile:true,hasTouch:true}:{})});
    if(standalone)await ctx.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{get:()=>true})});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;s=s.replace(new RegExp(`(\\{ id: "${dept}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.toasts=[];p.on('pageerror',e=>p.errs.push(e.message));if(process.env.DVDBG)p.on('console',m=>console.log('CONSOLE',m.type(),m.text().slice(0,300)));
    await p.exposeFunction('__toast',m=>p.toasts.push(m));
    await p.addInitScript(()=>{new MutationObserver(()=>{const t=document.querySelector('#toast');if(t&&t.textContent&&t.classList.contains('show'))window.__toast(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true})});
    await p.goto(`${BASE}/index.html?d=${dept}`);await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1200);
    p.ctx=ctx;return p};
  const signIn=async(p,sub,name)=>{await p.waitForFunction(()=>acct.ready,null,{timeout:10000});await p.evaluate(async([sub,name])=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name})))},[sub,name]);
    await p.waitForFunction(()=>acct.user&&acct.user.uid,null,{timeout:10000});return p.evaluate(()=>acct.user.uid)};
  const openSet=async p=>{if(!await p.evaluate(()=>setOpen))await p.click('#setBtn');await p.waitForTimeout(700)};
  const setText=p=>p.evaluate(()=>document.querySelector('#setOv .set-inner').innerText);

  /* ---------- F3 專員名單 ---------- */
  /* 三個權益部的人（管理員、兩個編輯者）、一個活動部的人；先各自登入一次（建立 profiles、補上自己的名單） */
  const ppl={};
  for(const [sub,name,depts] of [['ra','權益管理員',{rights:'admin'}],['rb','權益編輯一',{rights:'editor'}],['rc','權益編輯二',{rights:'editor'}],['ea','活動部的人',{events:'admin'}],['nr','沒有角色',{}]]){
    const p=await open('rights');const uid=await signIn(p,sub,name);ppl[sub]=uid;await setRole(uid,depts);
    await p.waitForTimeout(1500);await p.ctx.close();}
  ok(JSON.stringify(await roster('rights'))===JSON.stringify([ppl.ra,ppl.rb,ppl.rc].sort()),'F3 名單：有權益部角色的三個人登入後各自補上（沒有角色的、活動部的不在）');
  ok(JSON.stringify(await roster('events'))===JSON.stringify([ppl.ea]),'F3 名單：活動部的人在活動部名單');
  {const e=await read(`deptMembers/rights__${ppl.rb}`);ok(e&&Object.keys(e).sort().join()==='at,deptId,role,uid','F3 名單：只有部門、uid、角色、時間（沒有信箱、名字；05 起多一個 role）');}
  /* 權益部編輯者開始編輯：專員選項＝同部門全部有角色的人（名字），不含活動部、沒有角色的人 */
  {const p=await open('rights');await signIn(p,'rb','權益編輯一');await p.waitForFunction(()=>fsWriter(),null,{timeout:10000});
    const o=await p.evaluate(async()=>{staffPpl.key='';await staffPplLoad();return staffOptsFor({staff:[]}).map(x=>x[1])});
    ok(['權益管理員','權益編輯一','權益編輯二'].every(n=>o.includes(n))&&!o.includes('活動部的人')&&!o.includes('沒有角色'),`F3 編輯者選專員：列出同部門全部有角色的人（${o.join('、')}）`);
    ok(p.errs.length===0,`F3 編輯者：沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);
    await p.ctx.close();}
  /* 別部門的人、沒有角色的登入者：讀不到權益部名單 */
  for(const [sub,name] of [['ea','活動部的人'],['nr','沒有角色']]){const p=await open('rights');await signIn(p,sub,name);await p.waitForTimeout(800);
    const r=await p.evaluate(async()=>{const A=await acctLoad();try{await A.roster('rights');return 'ok'}catch(e){return e.code}});
    ok(r==='permission-denied',`F3 ${name}：讀不到權益部的名單（${r}）`);await p.ctx.close();}
  /* 撤權：總管理員在人員面板撤掉 rc → 名單跟著拿掉；之後打開人員時整份對齊 */
  {const p=await open('rights');const su=await signIn(p,'su2','總管理員');await setRole(su,{},true);await p.waitForFunction(()=>acctSuper(),null,{timeout:10000});
    await p.evaluate(async uid=>{const A=await acctLoad();await A.roleWrite(uid,r=>({...r,depts:{}}),'revoke');await A.rosterSync(uid)},ppl.rc);
    ok(JSON.stringify(await roster('rights'))===JSON.stringify([ppl.ra,ppl.rb].sort()),'F3 撤權後：總管理員對齊名單，被撤的人不在');
    await admin(d=>d.doc(`deptMembers/rights__ghost`).set({deptId:'rights',uid:'ghost',at:TS.now()}));
    await openSet(p);await p.click('[data-set="council"]');await p.waitForTimeout(800);await p.click('[data-hub="people"]');
    await until(async()=>!(await roster('rights')).includes('ghost'),8000);
    ok(!(await roster('rights')).includes('ghost'),'F3 打開人員：沒有角色的過期名單清掉');
    await p.ctx.close();}

  /* ---------- F4 安裝成 App ---------- */
  const fakePrompt=p=>p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.__prompted=true};e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e)});
  {const p=await open('rights');await signIn(p,'rb','權益編輯一');await p.waitForTimeout(800);await openSet(p);
    ok(!(await p.$('[data-set="device"]')),'F4 電腦、瀏覽器還沒提供安裝：設定頁沒有「安裝」那一列');
    await fakePrompt(p);await p.waitForTimeout(400);
    ok(!!(await p.$('[data-set="device"]')),'F4 瀏覽器支援安裝：出現「安裝」那一列');
    await p.click('[data-set="device"]');await p.waitForTimeout(800);
    const t=await p.evaluate(()=>{const b=[...document.querySelectorAll('.set-hub')].pop();return b?b.innerText:''});
    ok(/安裝/.test(t)&&!/分享|加入主畫面/.test(t)&&!/忘記這台裝置/.test(t),`F4 「安裝」頁：只有一顆「安裝」（沒有步驟說明、沒有 GitHub 模式的忘記身分）`);
    await p.click('[data-hub="install"]');await p.waitForTimeout(600);
    ok(await p.evaluate(()=>window.__prompted===true)&&p.toasts.includes('已安裝'),'F4 按「安裝」：叫出瀏覽器的安裝視窗，接受後提示已安裝');
    ok(await p.evaluate(()=>!document.querySelector('[data-hub="install"]')),'F4 安裝之後：「安裝」不再出現');
    ok(p.errs.length===0,`F4：沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);await p.ctx.close();}
  /* 取消安裝：事件只能用一次，取消後「安裝」那一列也收起來（等瀏覽器下次再給）；03 審查 P1-1 */
  {const p=await open('rights');await signIn(p,'rb','權益編輯一');await p.waitForTimeout(800);
    await p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.__n=(window.__n||0)+1};e.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(e)});
    await openSet(p);await p.click('[data-set="device"]');await p.waitForTimeout(800);await p.click('[data-hub="install"]');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>window.__n===1&&!document.querySelector('[data-hub="install"]')&&!pwaCanInstall()),'F4 安裝視窗按取消：只叫一次，「安裝」收起來（不會留一顆按了沒反應的鈕）');
    ok(!(await p.$('[data-set="device"]')),'F4 取消後沒有別的可做：「安裝」那一列也收起來');
    await p.ctx.close();}
  /* 沒登入也能安裝（Chrome 自己的安裝提示被收起來，要給入口；03 審查 P1-2） */
  {const p=await open('rights');await p.waitForTimeout(800);await fakePrompt(p);await openSet(p);
    ok(!!(await p.$('[data-set="device"]'))&&(await setText(p)).includes('用 Google 登入'),'F4 沒登入：瀏覽器支援安裝時也有「安裝」那一列');
    await p.click('[data-set="device"]');await p.waitForTimeout(800);ok(!!(await p.$('[data-hub="install"]')),'F4 沒登入：「安裝」頁裡有「安裝」');
    await p.ctx.close();}
  const IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const IOS_CHROME='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
  {const p=await open('rights',{ua:IOS,w:390,vh:844});await signIn(p,'rb','權益編輯一');await p.waitForTimeout(800);await openSet(p);
    ok(!!(await p.$('[data-set="device"]')),'F4 iPhone Safari 還沒加入主畫面：有「安裝」那一列');
    await p.click('[data-set="device"]');await p.waitForTimeout(900);
    const st=await p.evaluate(()=>[...document.querySelectorAll('.dev-steps li')].map(x=>x.textContent));
    ok(st.length===3&&st[1].includes('加入主畫面')&&!(await p.$('[data-hub="install"]')),`F4 iPhone Safari：顯示加入主畫面的步驟、沒有「安裝」鈕（${st.join('／')}）`);
    await p.ctx.close();}
  {const p=await open('rights',{ua:IOS,w:390,vh:844,standalone:true});await signIn(p,'rb','權益編輯一');await p.waitForTimeout(800);await openSet(p);
    ok(!(await p.$('[data-set="device"]')),'F4 iPhone 已加入主畫面（從主畫面打開）：沒有「安裝」那一列');await p.ctx.close();}
  {const p=await open('rights',{ua:IOS_CHROME,w:390,vh:844});await signIn(p,'rb','權益編輯一');await p.waitForTimeout(800);await openSet(p);
    ok(!(await p.$('[data-set="device"]')),'F4 iPhone 的 Chrome（不是 Safari）：不顯示步驟');await p.ctx.close();}

  await b.close();srv.close();await t.cleanup();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
