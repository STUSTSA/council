/* 會長預約（會長室端，2026-11-21，06 第一個 PR）：用 Auth 模擬器＋Firestore 模擬器、正式規則；會長室看板切成 firestore，資料用遷移程式匯入。
   1. 還沒啟用：總管理員看到「啟用」，會長室管理員、一般登入者看不到這張卡
   2. 總管理員按「啟用」：calendars/president 建好（rev 1、管理者名單含會長室管理員與總管理員、30 分鐘一格）；會長室管理員（不是總管理員）看得到卡片
   3. 新增開放時段（明天 14:00–16:00）：openWindows 寫入、時間對齊；不是整點或半點、結束早於開始＝對話框提示、沒有寫入；可以刪除
   4. 待審申請（用規則允許的形狀預先寫入：預約＋時段鎖＋額度＋稽核）：核准＝approved、rev+1、decidedBy、稽核 approve、時段鎖還在；
      拒絕＝rejected、時段鎖全部刪掉、額度減 1、稽核；拒絕後同一時段可以重新申請
   5. 兩邊同時處理同一筆：第二個人得到「剛被別人處理過」，沒有重複寫入
   6. 事由帶 HTML：照字面顯示，不執行；一般登入者（沒有管理者身分）完全看不到卡片，直接呼叫 decide 被規則拒絕
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8312,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
const ALL=['rights','president','secretariat','marketing','finance','events','affairs','pr','works'];
const XSS='<img src=x onerror="window.__xss=1">';

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
  const mig=await import(path.join(ROOT,'backend/migrate/run.js'));
  await mig.runImport(t.authenticatedContext('su',tok('su')).firestore(),firebase.firestore.FieldValue,TS,mig.loadSources(),{batch:'mtf-test',uid:'su'});
  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');
  const pages=[];
  const open=async(dept,sub)=>{
    const ctx=await b.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    const puts=[];await ctx.route('https://api.github.com/**',r=>{if(r.request().method()!=='GET')puts.push(r.request().url());r.fulfill({status:404,body:'{}'})});
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of ALL)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.toasts=[];p.puts=puts;p.cons=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error')p.cons.push(m.text())});
    await p.exposeFunction('__toast',m=>p.toasts.push(m));
    await p.addInitScript(()=>{new MutationObserver(()=>{const t=document.querySelector('#toast,.toast');if(t&&t.textContent)window.__toast(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true})});
    await p.goto(`${BASE}/index.html?d=${dept}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});
    if(sub){await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
      await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
      await p.waitForFunction(()=>acct.user&&acct.roles!==undefined&&storeFsBase,null,{timeout:15000});}
    await p.waitForTimeout(1200);
    pages.push(p);return p};
  const setRole=(uid,depts,sup=false)=>admin(d=>d.doc(`roles/${uid}`).set({super:sup,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  const uidOf=p=>p.evaluate(()=>acct.user.uid);
  const ext=async p=>{await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(900)};
  const read=async p=>{let v;await admin(async d=>{v=(await d.doc(p).get()).data()});return v};
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());

  const SLOT=1800000,O='president';
  const day=new Date(Date.now()+864e5+8*36e5).toISOString().slice(0,10);   /* 台灣時間的明天 */
  const base=Math.floor(Date.parse(day+'T14:00:00+08:00')/SLOT);
  const au=(id,rev,action,actor,from,to)=>({col:'bookings',docId:id,rev,action,actor,at:TS.now(),before:from?{status:from}:{},after:{status:to},ref:''});
  /* 預先寫入一筆待審預約（用規則允許的形狀；用 withSecurityRulesDisabled 寫，只是準備資料） */
  const seedBook=(id,who,s,n,topic)=>admin(async d=>{
    await d.doc(`bookings/${id}`).set({ownerId:O,requester:who,windowId:'w-seed',startSlot:base+s,slotCount:n,start:TS.fromMillis((base+s)*SLOT),end:TS.fromMillis((base+s+n)*SLOT),topic,note:'',status:'pending',rev:1,createdAt:TS.now(),updatedAt:TS.now(),updatedBy:who});
    for(let i=0;i<n;i++)await d.doc(`slots/${O}_${base+s+i}`).set({ownerId:O,idx:base+s+i,ref:id});
    const q=(await d.doc(`bookingQuota/${O}_${who}`).get()).data();
    await d.doc(`bookingQuota/${O}_${who}`).set({ownerId:O,uid:who,pending:(q?q.pending:0)+1,lastRef:id});
    await d.doc(`auditLogs/bookings_${id}_1`).set(au(id,1,'request',who,null,'pending'));
  });
  const bkOpen=async p=>{await ext(p);await until(()=>p.evaluate(()=>!BK.loading&&BK.cal!==undefined),10000);await p.waitForTimeout(300)};
  const vis=p=>p.evaluate(()=>!$('#bkPanel').hidden&&!!$('#bkPanel [data-bk]'));   /* 卡片人人看得到（2026-11-21）；vis＝卡裡有可以按的預約／管理按鈕 */
  const say=p=>p.evaluate(()=>$('#bkPanel').hidden?'':$('#bkBody').textContent);

  /* ---------- 1. 還沒啟用 ---------- */
  const ps=await open('president','boss');const suUid=await uidOf(ps);await setRole(suUid,{},true);
  const pa=await open('president','pa');const paUid=await uidOf(pa);await setRole(paUid,{president:'admin'});
  const gp=await open('president','nobody');await setRole(await uidOf(gp),{rights:'editor'});
  await until(()=>ps.evaluate(()=>fsRole()==='super'));await ps.evaluate(()=>render());await bkOpen(ps);
  ok(await ps.evaluate(()=>!$('#bkPanel').hidden&&!!$('#bkPanel [data-bk=enable]')),'總管理員：還沒啟用，看到「啟用會長預約」');
  await until(()=>pa.evaluate(()=>fsRole()==='admin'));await pa.evaluate(()=>render());await bkOpen(pa);
  ok(!(await vis(pa))&&!(await vis(gp))&&/還沒開放/.test(await say(pa))&&/還沒開放/.test(await say(gp)),'會長室管理員、一般登入者：還沒啟用時沒有按鈕，卡片寫「還沒開放」');

  /* ---------- 2. 啟用 ---------- */
  await ps.click('#bkPanel [data-bk=enable]');
  await until(()=>ps.evaluate(()=>BK.cal&&!BK.busy&&!BK.loading));
  const c=await read(`calendars/${O}`);
  ok(c&&c.rev===1&&c.gridMin===30&&c.managers.includes(paUid)&&c.managers.includes(suUid)&&c.updatedBy===suUid,`calendars/president：rev ${c&&c.rev}、管理者含會長室管理員與總管理員`);
  await pa.evaluate(()=>{BK.key='';render()});await until(()=>pa.evaluate(()=>!BK.loading&&!$('#bkPanel').hidden));
  ok(await vis(pa)&&!(await vis(gp)),'啟用後：會長室管理員有管理按鈕，一般登入者沒有（只看到說明）');

  /* ---------- 3. 開放時段 ---------- */
  const addWin=async(p,date,st,et)=>{await p.click('#bkPanel [data-bk=wadd]');await p.waitForSelector('#dlgForm [name=date]');
    await p.fill('#dlgForm [name=date]',date);await p.fill('#dlgForm [name=st]',st);await p.fill('#dlgForm [name=et]',et);await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(500)};
  await addWin(pa,day,'14:10','16:00');
  ok(await pa.evaluate(()=>!$('#dlgForm .dlg-err').hidden&&/整點或半點/.test($('#dlgForm .dlg-err').textContent)),'14:10 開始：對話框提示要整點或半點');
  await pa.fill('#dlgForm [name=st]','16:00');await pa.fill('#dlgForm [name=et]','15:00');await pa.click('#dlgForm [data-act=ok]');await pa.waitForTimeout(300);
  ok(await pa.evaluate(()=>/晚於開始/.test($('#dlgForm .dlg-err').textContent)),'結束早於開始：對話框提示');
  await pa.fill('#dlgForm [name=st]','14:00');await pa.fill('#dlgForm [name=et]','16:00');await pa.click('#dlgForm [data-act=ok]');
  await until(()=>pa.evaluate(()=>BK.wins.length===1&&!BK.busy));
  let ws=[];await admin(async d=>{ws=(await d.collection('openWindows').get()).docs.map(s=>({id:s.id,...s.data()}))});
  ok(ws.length===1&&ws[0].ownerId===O&&ws[0].start.toMillis()===base*SLOT&&ws[0].end.toMillis()===(base+4)*SLOT&&ws[0].updatedBy===paUid,'開放時段寫入：明天 14:00–16:00、對齊格線、updatedBy＝會長室管理員');
  ok(await pa.evaluate(()=>/14:00–16:00/.test($('#bkBody').textContent)),'畫面列出開放時段（台灣時間）');

  /* ---------- 4. 核准與拒絕 ---------- */
  await seedBook('bk1','stu1',0,2,'討論預算 '+XSS);await seedBook('bk2','stu2',2,2,'社團博覽會');
  await pa.evaluate(()=>bkLoad());await until(()=>pa.evaluate(()=>BK.pend.length===2&&!BK.loading));
  ok(await pa.evaluate(()=>window.__xss!==1&&!document.querySelector('#bkBody img')&&/討論預算 <img/.test($('#bkBody').textContent)),'事由帶 HTML：照字面顯示，不執行');
  await pa.click('#bkPanel [data-bk=ok][data-id=bk1]');await until(()=>pa.evaluate(()=>BK.pend.length===1&&!BK.busy));
  const b1=await read('bookings/bk1'),a2=await read('auditLogs/bookings_bk1_2');let sl1=0;await admin(async d=>{sl1=(await d.collection('slots').where('ref','==','bk1').get()).size});
  ok(b1.status==='approved'&&b1.rev===2&&b1.decidedBy===paUid&&a2&&a2.action==='approve'&&a2.actor===paUid&&sl1===2,'核准：approved、rev 2、decidedBy、稽核 approve、時段鎖還在（2 格）');
  await pa.click('#bkPanel [data-bk=no][data-id=bk2]');await pa.waitForSelector('#dlgForm [data-act=delete]');await pa.click('#dlgForm [data-act=delete]');
  await until(()=>pa.evaluate(()=>BK.pend.length===0&&!BK.busy));
  const b2=await read('bookings/bk2'),q2=await read(`bookingQuota/${O}_stu2`),a3=await read('auditLogs/bookings_bk2_2');let sl2=-1;await admin(async d=>{sl2=(await d.collection('slots').where('ref','==','bk2').get()).size});
  ok(b2.status==='rejected'&&b2.rev===2&&sl2===0&&q2.pending===0&&a3&&a3.after.status==='rejected','拒絕：rejected、時段鎖全部刪掉、額度減 1、稽核');
  await seedBook('bk3','stu2',2,2,'重新申請同一時段');
  ok((await read('bookings/bk3')).status==='pending','拒絕後同一時段可以重新申請');
  ok(await pa.evaluate(()=>BK.appr.length===1),'已核准清單有一筆');

  /* ---------- 5. 同時處理同一筆 ---------- */
  const pa2=await open('president','pa2');const pa2Uid=await uidOf(pa2);await setRole(pa2Uid,{president:'admin'});
  await admin(d=>d.doc(`calendars/${O}`).update({managers:[paUid,suUid,pa2Uid]}));
  await ext(pa2);await seedBook('bk4','stu3',4,1,'兩人同時處理');
  for(const p of [pa,pa2]){await p.evaluate(()=>{BK.key='';render()});await until(()=>p.evaluate(()=>!BK.loading&&BK.pend.some(x=>x.id==='bk4')),12000)}
  await pa.click('#bkPanel [data-bk=ok][data-id=bk4]');await until(()=>pa.evaluate(()=>!BK.busy&&!BK.pend.some(x=>x.id==='bk4')));
  pa2.toasts.length=0;await pa2.click('#bkPanel [data-bk=ok][data-id=bk4]');await until(()=>pa2.evaluate(()=>!BK.busy&&!BK.pend.some(x=>x.id==='bk4')));
  const b4=await read('bookings/bk4');
  ok(b4.status==='approved'&&b4.rev===2&&b4.decidedBy===paUid&&pa2.toasts.some(m=>/剛被別人處理/.test(m)),'同時處理同一筆：第二個人得到「剛被別人處理過」，只寫一次（rev 2、decidedBy＝先按的人）');

  /* ---------- 6. 沒有管理者身分 ---------- */
  const gpErr=await gp.evaluate(async()=>{try{const B=await bkMod();await B.decide(CFG.firebase,'bk3','approved');return 'ok'}catch(e){return e.code||e.message}});
  ok(gpErr==='permission-denied'&&(await read('bookings/bk3')).status==='pending','一般登入者直接呼叫 decide：被規則拒絕，預約不變');
  ok(!(await vis(gp)),'一般登入者：卡片沒有任何按鈕');

  ok(!ps.errs.length&&!pa.errs.length&&!pa2.errs.length&&!gp.errs.length,'沒有頁面錯誤：'+[ps,pa,pa2,gp].flatMap(p=>p.errs).join('|'));

  if(process.env.SHOTS){   /* 只在要截圖時：桌面、手機、深色（檔案不 commit） */
    await pa.evaluate(()=>bkLoad());await pa.waitForTimeout(800);
    for(const [n,w,h,cs] of [['desk',1100,900,'light'],['mob',390,844,'light'],['dark',390,844,'dark']]){
      await pa.setViewportSize({width:w,height:h});await pa.emulateMedia({colorScheme:cs});await pa.waitForTimeout(500);
      await pa.evaluate(()=>document.getElementById('bkPanel').scrollIntoView());await pa.waitForTimeout(300);
      await pa.locator('#bkPanel').screenshot({path:path.join(process.env.SHOTS,`bk_${n}.png`)})}}
  for(const p of pages)await p.context().close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
