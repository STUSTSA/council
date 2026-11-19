/* ui-10 A：設定頁面板裡的表單（dialog.js 的 in-pane #dlg）
   A 離開面板時，面板裡開著的表單要當成取消收掉（Promise 照取消的值 null 結束、不送出、不寫資料），不能留在別的頁面：
     手機子頁的「返回」、系統返回（popstate）、再進「紀錄」；桌面換到別的面板、按 Esc、收起設定、首頁鍵；
     疊一層面板（人員 → 權限歷史）；離開後立刻打開另一個表單（看板名稱）時新表單不被舊的關閉事件收掉。
   用 Auth 模擬器＋Firestore 模擬器、正式規則；水果部＝firestore，總管理員。
   執行（會自己開模擬器與網站）：cd backend && npm run test:web
   截圖：UI10SHOT=<資料夾> 時把 412 深色的 A（返回清單後）存成 A-412-dark.png */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8309,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board',SHOT=process.env.UI10SHOT||'';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
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
  const count=async col=>{let n;await admin(async d=>{n=(await d.collection(col).get()).size});return n};
  const DEPTS=['rights','president','secretariat','marketing','finance','events','affairs','pr','works','fruit'];
  await admin(async d=>{
    for(const [i,id] of DEPTS.entries())await d.doc(`departments/${id}`).set({name:id,order:i,active:true,updatedAt:TS.now(),updatedBy:'seed'});
    await d.doc('deptSettings/fruit').set({title:'水果部工作進度',rev:1,updatedAt:TS.now(),updatedBy:'seed'});
  });

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');
  const open=async({w,vh,dark})=>{
    const ctx=await b.newContext({viewport:{width:w,height:vh},colorScheme:dark?'dark':'light',serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc.replace(/(\{ id: "fruit",[^\n]*?)( \},?\n)/,`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.goto(`${BASE}/index.html?d=fruit`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1200);
    /* 記下每個 ask 的結果（離開面板時要照取消的值 null 結束） */
    await p.evaluate(()=>{window.__ask=[];const real=window.ask;window.ask=(...a)=>{const i=window.__ask.push({t:a[0],v:'(還沒結束)'})-1;return real(...a).then(v=>{window.__ask[i].v=v;return v})}});
    p.ctx=ctx;return p};
  const signIn=async(p,sub)=>{await p.waitForFunction(()=>acct.ready,null,{timeout:10000});await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    return (await p.waitForFunction(()=>acct.user&&acct.user.uid,null,{timeout:10000})).jsonValue()};
  const setSuper=uid=>admin(d=>d.doc(`roles/${uid}`).set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:uid}));
  const openSet=async p=>{if(!await p.evaluate(()=>setOpen))await p.click('#setBtn');await p.waitForTimeout(800)};
  const row=async(p,k)=>{await p.click(`#setOv [data-set="${k}"]`);await p.waitForTimeout(900)};
  const hubGo=async(p,k)=>{await p.click(`[data-hub="${k}"]`);await p.waitForTimeout(900)};
  const formOpen=async(p,sel,title)=>{await p.click(sel);await p.waitForSelector('#dlg[open]',{timeout:8000});await p.waitForTimeout(700);
    return p.evaluate(t=>{const b=document.querySelector('#dlgForm .sec-h,#dlgForm b');return !!b&&b.textContent===t},title)};
  /* 表單收掉了沒：#dlg 沒開、畫面上看不到它的任何一塊 */
  const formGone=p=>p.evaluate(()=>{const d=document.querySelector('#dlg');return !d.open&&!d.getClientRects().length});
  const lastAsk=p=>p.evaluate(()=>window.__ask[window.__ask.length-1]);
  /* 一個節點中心點到的是不是它自己（沒被別的東西蓋住） */
  const onTop=(p,sel)=>p.evaluate(sel=>{const e=[...document.querySelectorAll(sel)].find(x=>x.getClientRects().length);if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!x&&e.contains(x)},sel);

  /* ---------- 手機 412、深色 ---------- */
  const m=await open({w:412,vh:915,dark:true});
  const bossUid=await signIn(m,'boss');await setSuper(bossUid);
  await m.waitForFunction(()=>typeof acctSuper==='function'&&acctSuper(),null,{timeout:10000});
  await openSet(m);await row(m,'council');await hubGo(m,'invite');
  ok(await formOpen(m,'[data-new]','產生 QR'),'412：QR 邀請 →「產生 QR」表單畫在子頁裡');
  /* A1 返回：回到會長室管理清單，表單收掉、照取消結束 */
  await m.click('#subBack');await m.waitForTimeout(900);
  {const a=await lastAsk(m);
    ok(await formGone(m),'A 412 按「返回」回到會長室管理：「產生 QR」表單收掉（不留在清單下面）');
    ok(a&&a.t==='產生 QR'&&a.v===null,`A 412 返回：表單的 Promise 照取消結束（${JSON.stringify(a&&a.v)}）`);
    ok(await m.evaluate(()=>!!document.querySelector('#setSub .set-hub:not([hidden]) [data-hub="export"]')),'A 412 返回：回到會長室管理清單');
    ok(await onTop(m,'#setSub [data-hub="export"]'),'A 412 返回：最後一列「匯出全部資料」沒有被別的東西壓住');
    if(SHOT){fs.mkdirSync(SHOT,{recursive:true});await m.screenshot({path:path.join(SHOT,'A-412-dark.png')})}}
  /* A2 再進「紀錄」：不會看到上一個表單 */
  await hubGo(m,'audit');
  ok(await formGone(m)&&await m.evaluate(()=>!!document.querySelector('#setSub .acct-panel:not([hidden]) .acct-log')),'A 412 再進「紀錄」：只有紀錄，沒有「產生 QR」表單');
  await m.click('#subBack');await m.waitForTimeout(900);
  /* A3 系統返回（popstate） */
  await hubGo(m,'invite');await formOpen(m,'[data-new]','產生 QR');
  await m.evaluate(()=>history.back());await m.waitForTimeout(1000);
  {const a=await lastAsk(m);ok(await formGone(m)&&a.v===null,`A 412 系統返回：表單收掉、照取消結束（${JSON.stringify(a.v)}）`)}
  /* 申請編輯權限（帳號頁）：下拉 */
  await m.click('#subBack');await m.waitForTimeout(900);
  await row(m,'acct');
  ok(await formOpen(m,'[data-hub="req"]','申請編輯權限'),'412：帳號 →「申請編輯權限」表單');
  await m.click('#subBack');await m.waitForTimeout(900);
  {const a=await lastAsk(m);ok(await formGone(m)&&a.v===null,'412 申請編輯權限按返回：表單收掉、照取消結束')}
  ok(await count('invitations')===0&&await count('roleRequests')===0,'A 412：離開時沒有送出（沒有建立邀請、申請）');
  ok(m.errs.length===0,`412：沒有頁面錯誤${m.errs.length?'：'+m.errs.join(' | '):''}`);
  await m.ctx.close();

  /* ---------- 桌面 1300 ---------- */
  const d=await open({w:1300,vh:900,dark:false});
  await signIn(d,'boss');await d.waitForFunction(()=>typeof acctSuper==='function'&&acctSuper(),null,{timeout:10000});
  await openSet(d);await row(d,'council');await hubGo(d,'invite');
  ok(await formOpen(d,'[data-new]','產生 QR'),'1300：QR 邀請 →「產生 QR」表單畫在右側面板');
  /* A4 換到別的面板 */
  await row(d,'acct');
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null,`A 1300 換到「帳號」：「產生 QR」表單收掉、照取消結束（${JSON.stringify(a.v)}）`);
    ok(await d.evaluate(()=>!!document.querySelector('#setOv .set-pane [data-hub="out"]')),'A 1300 換到「帳號」：右側是帳號頁');}
  ok(await formOpen(d,'[data-hub="req"]','申請編輯權限'),'1300：帳號 →「申請編輯權限」表單');
  /* A5 Esc */
  await row(d,'council');await hubGo(d,'invite');await formOpen(d,'[data-new]','產生 QR');
  await d.keyboard.press('Escape');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>!!document.querySelector('#setOv .set-pane .set-hub:not([hidden]) [data-hub="export"]')),'A 1300 Esc：表單收掉、回到會長室管理清單')}
  /* A6 離開後立刻打開另一個表單：新表單留著、不被舊表單的關閉收掉 */
  await hubGo(d,'invite');await formOpen(d,'[data-new]','產生 QR');
  await row(d,'title');await d.waitForTimeout(600);
  {const r=await d.evaluate(()=>window.__ask.slice(-2));
    ok(r.length===2&&r[0].t==='產生 QR'&&r[0].v===null&&r[1].t==='看板名稱'&&r[1].v==='(還沒結束)',`A 1300 換到「看板名稱」：舊表單照取消結束，新表單還開著等輸入（${JSON.stringify(r.map(x=>x.v))}）`);
    ok(await d.evaluate(()=>{const x=document.querySelector('#dlg');return x.open&&x.classList.contains('in-pane')&&document.querySelector('#dlgForm [name="v"]')}),'A 1300 換到「看板名稱」：畫面上是看板名稱的表單');}
  await d.click('#dlg [data-act="cancel"]');await d.waitForTimeout(700);
  /* A7 疊一層面板：人員 → 某人 → 新增部門（表單）→ 權限歷史 */
  await row(d,'council');await hubGo(d,'people');
  await d.click('.acct-panel:not([hidden]) [data-who]');await d.waitForTimeout(600);
  await formOpen(d,'.acct-panel:not([hidden]) [data-add]','boss 同學：新增部門');
  await d.click('.acct-panel:not([hidden]) [data-hist]');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>!!document.querySelector('.acct-panel:not([hidden]) [data-chain]')),'A 1300 人員 → 權限歷史：新增部門表單收掉、照取消結束')}
  await d.click('.acct-panel:not([hidden]) [data-back]');await d.waitForTimeout(700);
  await d.click('.acct-panel:not([hidden]) [data-back]');await d.waitForTimeout(700);
  ok(await formOpen(d,'.acct-panel:not([hidden]) [data-grant]','授予權限'),'1300：人員 →「授予權限」表單');
  /* A8 收起設定（工具列的設定鍵） */
  await d.click('#setBtn');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>!setOpen),'A 1300 收起設定：表單收掉、照取消結束')}
  /* A9 首頁鍵（離開看板前先收起設定） */
  await openSet(d);await row(d,'council');await hubGo(d,'invite');await formOpen(d,'[data-new]','產生 QR');
  await d.evaluate(()=>{PageFx.leave=()=>{window.__left=true}});
  await d.click('.dhead .dh-home');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>window.__left===true),'A 1300 首頁鍵：表單收掉、照取消結束，再離開看板')}
  /* 設定外面跳出的表單（不在面板裡）：下拉一樣點得到 */
  ok(await count('invitations')===0&&await count('roleRequests')===0,'A 1300：離開時沒有送出（沒有建立邀請、申請）');
  ok(await d.evaluate(()=>{const r=window.__ask.find(x=>x.t==='boss 同學：新增部門');return !!r&&r.v===null}),'A 1300：新增部門沒有寫角色');
  ok(d.errs.length===0,`1300：沒有頁面錯誤${d.errs.length?'：'+d.errs.join(' | '):''}`);
  await d.ctx.close();

  await b.close();srv.close();await t.cleanup();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
