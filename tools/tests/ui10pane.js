/* ui-10 A、B：設定頁面板裡的表單（dialog.js 的 in-pane #dlg）
   A 離開面板時，面板裡開著的表單要當成取消收掉（Promise 照取消的值 null 結束、不送出、不寫資料），不能留在別的頁面：
     手機子頁的「返回」、系統返回（popstate）、再進「紀錄」；桌面換到別的面板、按 Esc、收起設定、首頁鍵；
     疊一層面板（人員 → 權限歷史）；離開後立刻打開另一個表單（申請編輯權限）時新表單不被舊的關閉事件收掉。
   A 競態（ui-10 審查）：第一次關閉的值算數、新表單不沿用上一個的「確定」——
     (a) 授予權限按確定、淡出中又開第二個授予權限，再按 Esc：第一個照確定寫入、第二個照取消結束，只寫一筆角色；
     (b) 授予權限按確定、淡出中按「返回」：照確定寫入一筆；
     (c) 非同步檢查（validate）還在跑時離開面板：不送出；離開後打開別的表單（申請編輯權限），檢查跑完也不會把新表單關掉。
   外部請求：模擬器與本機以外的請求一律攔下並記下來（字型、firebase SDK、GitHub API 照下面的 route 模擬），最後要是空的。
   B 自製下拉（.csel）展開後，每個選項都在最上面、點得到（elementFromPoint 在每個選項中心＝那個選項）：
     產生 QR、申請編輯權限、授予權限（面板裡的表單）、紀錄的篩選、設定外面跳出的表單；412 寬與 1300 寬。
   用 Auth 模擬器＋Firestore 模擬器、正式規則；水果部＝firestore，總管理員。
   執行（會自己開模擬器與網站）：cd backend && npm run test:web
   截圖：UI10SHOT=<資料夾> 時把 412 深色的 A（返回清單後）與 B（下拉展開）存成 A-412-dark.png、B-412-dark.png */
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
    /* 競態測試用的帳號（授予權限的對象；登入過才會在 users） */
    for(const u of ['amy','ben'])await d.doc(`users/${u}-uid`).set({email:`${u}@example.test`,createdAt:TS.now(),lastLoginAt:TS.now()});
  });
  const roleOf=async uid=>{let r;await admin(async d=>{const s=await d.doc(`roles/${uid}`).get();r=s.exists?s.data():null});return r};

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');
  const open=async({w,vh,dark})=>{
    const ctx=await b.newContext({viewport:{width:w,height:vh},colorScheme:dark?'dark':'light',serviceWorkers:'block'});
    /* 外部請求防護：最先登記＝最後才比對（下面的 route 優先）；本機（網站、模擬器）放行，其他一律攔下並記下來 */
    const local=new Set(['127.0.0.1','localhost',h,AEMU.split(':')[0]]);ctx.ext=[];
    await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(local.has(u.hostname))return r.continue();ctx.ext.push(u.href.slice(0,120));return r.abort()});
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
  /* 面板收掉後有沒有白讀：替 BoardAccount 的讀取函式計次（window.__reads） */
  const countReads=p=>p.evaluate(()=>{window.__reads={};const A=window.BoardAccount;['inviteList','rolesList','usersList','requestsPending'].forEach(k=>{const f=A[k];A[k]=(...x)=>{window.__reads[k]=(window.__reads[k]||0)+1;return f(...x)}})});
  const reads=(p,k)=>p.evaluate(k=>(window.__reads||{})[k]||0,k);
  /* 一個節點中心點到的是不是它自己（沒被別的東西蓋住） */
  const onTop=(p,sel)=>p.evaluate(sel=>{const e=[...document.querySelectorAll(sel)].find(x=>x.getClientRects().length);if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!x&&e.contains(x)},sel);

  /* B：在 root 裡把每個 .csel 依序展開，檢查每個選項中心點到的就是那個選項 */
  const cselCheck=async(p,root,label)=>{
    const n=await p.evaluate(r=>document.querySelector(r).querySelectorAll('.csel').length,root);
    if(!n){ok(false,`${label}：找不到下拉`);return}
    for(let i=0;i<n;i++){
      await p.evaluate(([r,i])=>document.querySelector(r).querySelectorAll('.csel')[i].querySelector('.csel-btn').click(),[root,i]);
      await p.waitForTimeout(450);
      const res=await p.evaluate(([r,i])=>{const c=document.querySelector(r).querySelectorAll('.csel')[i],os=[...c.querySelectorAll('.csel-opt')],bad=[];
        for(const o of os){o.scrollIntoView({block:'nearest'});const q=o.getBoundingClientRect(),x=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);
          if(!x||x.closest('.csel-opt')!==o)bad.push(`${o.textContent}→${x?(x.className||x.tagName):'無'}`)}
        return {name:c.querySelector('input').name,open:c.classList.contains('open'),n:os.length,bad}},[root,i]);
      ok(res.open&&res.n>0&&!res.bad.length,`${label}「${res.name}」展開：${res.n} 個選項都在最上面、點得到${res.bad.length?`（被蓋住：${res.bad.slice(0,4).join('、')}${res.bad.length>4?'…':''}）`:''}`);
      if(SHOT&&label.startsWith('412 產生 QR')&&i===0){fs.mkdirSync(SHOT,{recursive:true});await p.screenshot({path:path.join(SHOT,'B-412-dark.png')})}
      await p.keyboard.press('Escape');await p.waitForTimeout(250);
    }
  };

  /* ---------- 手機 412、深色 ---------- */
  const m=await open({w:412,vh:915,dark:true});
  const bossUid=await signIn(m,'boss');await setSuper(bossUid);
  await m.waitForFunction(()=>typeof acctSuper==='function'&&acctSuper(),null,{timeout:10000});
  await openSet(m);await row(m,'council');await hubGo(m,'invite');
  ok(await formOpen(m,'[data-new]','產生 QR'),'412：QR 邀請 →「產生 QR」表單畫在子頁裡');
  await cselCheck(m,'#dlgForm','412 產生 QR');
  await countReads(m);
  /* A1 返回：回到系統管理清單，表單收掉、照取消結束 */
  await m.click('.dh-home');await m.waitForTimeout(900);
  {const a=await lastAsk(m);
    ok(await reads(m,'inviteList')===0,`A 412 返回：取消的「產生 QR」沒有在面板收掉後重讀邀請清單（${await reads(m,'inviteList')} 次）`);
    ok(await formGone(m),'A 412 按「返回」回到系統管理：「產生 QR」表單收掉（不留在清單下面）');
    ok(a&&a.t==='產生 QR'&&a.v===null,`A 412 返回：表單的 Promise 照取消結束（${JSON.stringify(a&&a.v)}）`);
    ok(await m.evaluate(()=>!!document.querySelector('#setSub .set-hub:not([hidden]) [data-hub="export"]')),'A 412 返回：回到系統管理清單');
    ok(await onTop(m,'#setSub [data-hub="export"]'),'A 412 返回：最後一列「匯出全部資料」沒有被別的東西壓住');
    if(SHOT){fs.mkdirSync(SHOT,{recursive:true});await m.screenshot({path:path.join(SHOT,'A-412-dark.png')})}}
  /* A2 再進「紀錄」：不會看到上一個表單 */
  await hubGo(m,'audit');
  ok(await formGone(m)&&await m.evaluate(()=>!!document.querySelector('#setSub .acct-panel:not([hidden]) .acct-log')),'A 412 再進「紀錄」：只有紀錄，沒有「產生 QR」表單');
  await cselCheck(m,'#setSub .acct-panel:not([hidden]) .acct-filter','412 紀錄篩選');
  await m.click('.dh-home');await m.waitForTimeout(900);
  /* A3 系統返回（popstate） */
  await hubGo(m,'invite');await formOpen(m,'[data-new]','產生 QR');
  await m.evaluate(()=>history.back());await m.waitForTimeout(1000);
  {const a=await lastAsk(m);ok(await formGone(m)&&a.v===null,`A 412 系統返回：表單收掉、照取消結束（${JSON.stringify(a.v)}）`)}
  /* 申請編輯權限（帳號頁）：下拉 */
  await m.click('.dh-home');await m.waitForTimeout(900);
  await row(m,'acct');
  ok(await formOpen(m,'[data-hub="req"]','申請編輯權限'),'412：帳號 →「申請編輯權限」表單');
  await cselCheck(m,'#dlgForm','412 申請編輯權限');
  await m.click('.dh-home');await m.waitForTimeout(900);
  {const a=await lastAsk(m);ok(await formGone(m)&&a.v===null,'412 申請編輯權限按返回：表單收掉、照取消結束')}
  ok(await count('invitations')===0&&await count('roleRequests')===0,'A 412：離開時沒有送出（沒有建立邀請、申請）');
  /* A 競態 (b)：授予權限按確定，淡出中（200ms 內）按「返回」→ 照確定寫入一筆（第一次關閉的值算數） */
  await m.click('.dh-home');await m.waitForTimeout(900);   /* 帳號 → 設定清單 */
  await row(m,'council');await hubGo(m,'people');
  ok(await formOpen(m,'.acct-panel:not([hidden]) [data-grant]','授予權限'),'412：人員 →「授予權限」表單');
  await m.evaluate(()=>{const f=document.querySelector('#dlgForm');f.querySelector('[name="uid"]').value='ben-uid';f.querySelector('[name="role"]').value='admin'});
  await m.evaluate(()=>document.querySelector('#dlg [data-act="ok"]').click());await m.waitForTimeout(60);
  ok(await m.evaluate(()=>{const x=document.querySelector('#dlg');return x.open&&!!x._fade}),'A 競態 (b) 412：按確定後還在淡出');
  {const r0=await reads(m,'rolesList');
  await m.click('.dh-home');await m.waitForTimeout(1500);
  ok(await reads(m,'rolesList')===r0,`A 競態 (b) 412：面板收掉後才寫完，不再重讀人員（rolesList ${r0}→${await reads(m,'rolesList')}）`)}
  {const a=await lastAsk(m),r=await roleOf('ben-uid');
    ok(a&&a.t==='授予權限'&&a.v&&a.v.uid==='ben-uid'&&a.v.role==='admin',`A 競態 (b) 412：確定後淡出中按返回，表單照確定結束（${JSON.stringify(a&&a.v)}）`);
    ok(!!r&&r.rev===1&&JSON.stringify(r.depts)==='{"fruit":"admin"}',`A 競態 (b) 412：照確定寫入一筆角色（${JSON.stringify(r&&{depts:r.depts,rev:r.rev})}）`);
    ok(await formGone(m)&&await m.evaluate(()=>!!document.querySelector('#setSub .set-hub:not([hidden]) [data-hub="export"]')),'A 競態 (b) 412：表單收掉、回到系統管理清單');}
  ok(m.ctx.ext.length===0,`412：沒有模擬器與本機以外的請求${m.ctx.ext.length?'：'+m.ctx.ext.slice(0,5).join(' | '):''}`);
  ok(m.errs.length===0,`412：沒有頁面錯誤${m.errs.length?'：'+m.errs.join(' | '):''}`);
  await m.ctx.close();

  /* ---------- 桌面 1300 ---------- */
  const d=await open({w:1300,vh:900,dark:false});
  await signIn(d,'boss');await d.waitForFunction(()=>typeof acctSuper==='function'&&acctSuper(),null,{timeout:10000});
  await openSet(d);await row(d,'council');await hubGo(d,'invite');
  ok(await formOpen(d,'[data-new]','產生 QR'),'1300：QR 邀請 →「產生 QR」表單畫在右側面板');
  await cselCheck(d,'#dlgForm','1300 產生 QR');
  /* A4 換到別的面板 */
  await row(d,'acct');
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null,`A 1300 換到「帳號」：「產生 QR」表單收掉、照取消結束（${JSON.stringify(a.v)}）`);
    ok(await d.evaluate(()=>!!document.querySelector('#setOv .set-pane [data-hub="out"]')),'A 1300 換到「帳號」：右側是帳號頁');}
  ok(await formOpen(d,'[data-hub="req"]','申請編輯權限'),'1300：帳號 →「申請編輯權限」表單');
  await cselCheck(d,'#dlgForm','1300 申請編輯權限');
  /* A5 Esc */
  await row(d,'council');await hubGo(d,'invite');await formOpen(d,'[data-new]','產生 QR');
  await d.keyboard.press('Escape');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>!!document.querySelector('#setOv .set-pane .set-hub:not([hidden]) [data-hub="export"]')),'A 1300 Esc：表單收掉、回到系統管理清單')}
  /* A6 離開後立刻打開另一個表單：新表單留著、不被舊表單的關閉收掉 */
  await hubGo(d,'invite');await formOpen(d,'[data-new]','產生 QR');
  await row(d,'acct');await hubGo(d,'req');await d.waitForTimeout(600);
  {const r=await d.evaluate(()=>window.__ask.slice(-2));
    ok(r.length===2&&r[0].t==='產生 QR'&&r[0].v===null&&r[1].t==='申請編輯權限'&&r[1].v==='(還沒結束)',`A 1300 換到「申請編輯權限」：舊表單照取消結束，新表單還開著等輸入（${JSON.stringify(r.map(x=>x.v))}）`);
    ok(await d.evaluate(()=>{const x=document.querySelector('#dlg');return x.open&&x.classList.contains('in-pane')&&document.querySelector('#dlgForm')}),'A 1300 換到「申請編輯權限」：畫面上是申請編輯權限的表單');}
  await d.click('#dlg [data-act="cancel"]');await d.waitForTimeout(700);
  /* A7 疊一層面板：人員 → 某人 → 新增部門（表單）→ 權限歷史 */
  await row(d,'council');await hubGo(d,'people');
  await d.click('.acct-panel:not([hidden]) [data-who]');await d.waitForTimeout(600);
  await formOpen(d,'.acct-panel:not([hidden]) [data-add]','boss 同學：新增部門');
  await cselCheck(d,'#dlgForm','1300 新增部門');
  await d.click('.acct-panel:not([hidden]) [data-hist]');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>!!document.querySelector('.acct-panel:not([hidden]) [data-chain]')),'A 1300 人員 → 權限歷史：新增部門表單收掉、照取消結束')}
  await d.click('.acct-panel:not([hidden]) [data-back]');await d.waitForTimeout(700);
  await d.click('.acct-panel:not([hidden]) [data-back]');await d.waitForTimeout(700);
  ok(await formOpen(d,'.acct-panel:not([hidden]) [data-grant]','授予權限'),'1300：人員 →「授予權限」表單');
  await cselCheck(d,'#dlgForm','1300 授予權限');
  /* A8 收起設定（工具列的設定鍵） */
  await d.click('#setBtn');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>!setOpen),'A 1300 收起設定：表單收掉、照取消結束')}
  /* A9 標題列左上鍵：設定開著時是「上一頁」（不離開看板），先退一層 */
  await openSet(d);await row(d,'council');await hubGo(d,'invite');await formOpen(d,'[data-new]','產生 QR');
  await d.evaluate(()=>{PageFx.leave=()=>{window.__left=true}});
  await d.click('.dhead .dh-home');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(await formGone(d)&&a.v===null&&await d.evaluate(()=>window.__left!==true),'A 1300 上一頁鍵：表單收掉、照取消結束，不離開看板')}
  /* 設定外面跳出的表單（不在面板裡）：下拉一樣點得到 */
  await d.evaluate(()=>{ask('測試',[{name:'a',label:'部門',type:'select',value:'fruit',options:acctDeptOpts()},{name:'b',label:'角色',type:'select',value:'editor',options:[['editor','編輯者'],['admin','管理員']]},{name:'c',label:'備註'}])});
  await d.waitForTimeout(700);
  ok(await d.evaluate(()=>{const x=document.querySelector('#dlg');return x.open&&!x.classList.contains('in-pane')}),'1300 設定外面：表單跳出來（不在面板裡）');
  await cselCheck(d,'#dlgForm','1300 跳出的表單');
  await d.click('#dlg [data-act="cancel"]');await d.waitForTimeout(500);
  ok(await count('invitations')===0&&await count('roleRequests')===0,'A 1300：離開時沒有送出（沒有建立邀請、申請）');
  ok(await d.evaluate(()=>{const r=window.__ask.find(x=>x.t==='boss 同學：新增部門');return !!r&&r.v===null}),'A 1300：新增部門沒有寫角色');
  /* A 競態 (a)：授予權限按確定，淡出中又開第二個授予權限表單，再按 Esc → 第一個照確定寫入、第二個照取消結束，只多一筆角色 */
  await openSet(d);await row(d,'council');await hubGo(d,'people');
  ok(await formOpen(d,'.acct-panel:not([hidden]) [data-grant]','授予權限'),'1300：人員 →「授予權限」表單（競態 a）');
  await d.evaluate(()=>{const f=document.querySelector('#dlgForm');f.querySelector('[name="uid"]').value='amy-uid';f.querySelector('[name="role"]').value='admin'});
  {const n0=await d.evaluate(()=>window.__ask.length-1),boss0=await roleOf(bossUid);
    await d.evaluate(async()=>{document.querySelector('#dlg [data-act="ok"]').click();await new Promise(r=>setTimeout(r,60));
      document.querySelector('.acct-panel:not([hidden]) [data-grant]').click();await new Promise(r=>setTimeout(r,60))});
    const rv=await d.evaluate(()=>{const x=document.querySelector('#dlg');return {open:x.open,rv:x.returnValue}});
    ok(rv.open&&rv.rv==='','A 競態 (a) 1300：第二個授予權限表單開著、沒有沿用上一個表單的「確定」（returnValue 是空的）');
    await d.keyboard.press('Escape');await d.waitForTimeout(1500);
    const r=await d.evaluate(n0=>window.__ask.slice(n0),n0),amy=await roleOf('amy-uid'),boss1=await roleOf(bossUid),ben=await roleOf('ben-uid');
    ok(r.length===2&&r[0].t==='授予權限'&&r[0].v&&r[0].v.uid==='amy-uid'&&r[0].v.role==='admin'&&r[1].t==='授予權限'&&r[1].v===null,
      `A 競態 (a) 1300：第一個照確定結束、第二個照取消結束（${JSON.stringify(r.map(x=>x.v))}）`);
    ok(!!amy&&amy.rev===1&&JSON.stringify(amy.depts)==='{"fruit":"admin"}'&&boss1?.rev===boss0?.rev&&JSON.stringify(boss1?.depts)==='{}'&&ben?.rev===1,
      `A 競態 (a) 1300：只寫了第一筆角色（amy ${JSON.stringify(amy&&{depts:amy.depts,rev:amy.rev})}、boss rev ${boss0?.rev}→${boss1?.rev}、ben rev ${ben?.rev}）`);
    ok(await count('roles')===3,'A 競態 (a) 1300：roles 只有 boss、ben、amy 三份');
    ok(await formGone(d),'A 競態 (a) 1300：Esc 後表單收掉');}
  /* A 競態 (c1)：非同步檢查還在跑時按 Esc 離開，檢查在淡出期間跑完 → 不送出 */
  await hubGo(d,'invite');
  await d.evaluate(()=>{window.__vd=0;ask('延遲檢查',[{name:'v',label:'名稱',value:'甲'}],{validate:async()=>{await new Promise(r=>setTimeout(r,120));window.__vd++;return ''}})});
  await d.waitForTimeout(500);
  ok(await d.evaluate(()=>{const x=document.querySelector('#dlg');return x.open&&x.classList.contains('in-pane')}),'1300：延遲檢查的表單畫在面板裡（競態 c）');
  await d.evaluate(()=>document.querySelector('#dlg [data-act="ok"]').click());await d.waitForTimeout(30);
  await d.keyboard.press('Escape');await d.waitForTimeout(900);
  {const a=await lastAsk(d);ok(a.t==='延遲檢查'&&a.v===null&&await d.evaluate(()=>window.__vd===1)&&await formGone(d),`A 競態 (c1) 1300：檢查還在跑時離開，檢查跑完也不送出（${JSON.stringify(a.v)}）`)}
  /* A 競態 (c2)：非同步檢查還在跑時換到「申請編輯權限」，檢查跑完 → 舊表單照取消結束，申請編輯權限表單還開著 */
  await hubGo(d,'invite');
  await d.evaluate(()=>{window.__vd=0;ask('延遲檢查',[{name:'v',label:'名稱',value:'乙'}],{validate:async()=>{await new Promise(r=>setTimeout(r,900));window.__vd++;return ''}})});
  await d.waitForTimeout(500);
  await d.evaluate(()=>document.querySelector('#dlg [data-act="ok"]').click());await d.waitForTimeout(30);
  await row(d,'acct');await hubGo(d,'req');await d.waitForTimeout(800);
  {const r=await d.evaluate(()=>window.__ask.slice(-2)),st=await d.evaluate(()=>({vd:window.__vd,open:document.querySelector('#dlg').open,v:!!document.querySelector('#dlgForm')}));
    ok(st.vd===1&&r[0].t==='延遲檢查'&&r[0].v===null&&r[1].t==='申請編輯權限'&&r[1].v==='(還沒結束)'&&st.open&&st.v,
      `A 競態 (c2) 1300：檢查跑完後舊表單照取消、申請編輯權限表單還開著（${JSON.stringify(r.map(x=>x.v))}，檢查 ${st.vd} 次）`);
    if(st.open)await d.click('#dlg [data-act="cancel"]');await d.waitForTimeout(700)}
  ok(d.ctx.ext.length===0,`1300：沒有模擬器與本機以外的請求${d.ctx.ext.length?'：'+d.ctx.ext.slice(0,5).join(' | '):''}`);
  ok(d.errs.length===0,`1300：沒有頁面錯誤${d.errs.length?'：'+d.errs.join(' | '):''}`);
  await d.ctx.close();

  await b.close();srv.close();await t.cleanup();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
