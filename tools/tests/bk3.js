/* 會長預約（同學申請，2026-11-21，06 第二個 PR；11/21 起畫面在各部門「通知」頁的行事曆「會長室」模式）：Auth＋Firestore 模擬器、正式規則；各部門看板切成 firestore。
   1. 沒有部門角色的登入者在會長室頁只看到指路、沒有按鈕；有部門角色的同學在自己部門的行事曆「會長室」模式看到可預約時段（還有幾格），沒有管理按鈕
   2. 預約表單：沒填事由／超出時段＝對話框提示、沒有寫入
   3. 送出（15:00 起 1 小時）：bookings pending、rev 1、兩格時段鎖、額度 1、稽核 request；畫面「我的預約」出現、剩 6 格
   4. 兩個同學搶重疊的時段：第二個得到「已經被預約」，沒有重複的預約或鎖；別人取消不了、讀不到我的預約
   5. 第四筆待審：規則拒絕、畫面提示；不在開放時段內的申請（繞過畫面）被規則拒絕
   6. 取消：cancelled、鎖全部刪掉、額度減 1、稽核；取消後別人立刻可以約同一時段
   7. 事由帶 HTML：同學與會長室管理員的畫面都照字面顯示
   執行：cd backend && npm run test:web */
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

  const bkOpen=async p=>{await ext(p);await until(()=>p.evaluate(()=>!BK.loading&&BK.cal!==undefined),10000);await p.waitForTimeout(400)};
  const vis=p=>p.evaluate(()=>!$('#bkPanel').hidden&&!!$('#bkPanel [data-bk]'));   /* 卡片人人看得到（2026-11-21）；vis＝卡裡有可以按的預約／管理按鈕 */
  const say=p=>p.evaluate(()=>$('#bkPanel').hidden?'':$('#bkBody').textContent);
  /* 同學的畫面：打開通知頁、行事曆切到「會長室」、跳到時段那一天 */
  const calOpen=async p=>{await p.evaluate(()=>{if(!notiOpen)NOTI.mode='pres'});await p.evaluate(()=>{if(!notiOpen)openNoti()});await p.waitForFunction(()=>notiOpen,null,{timeout:8000});
    await until(()=>p.evaluate(()=>!BK.loading&&BK.cal!==undefined));await p.evaluate(d=>calJump(NOTI,d),day);await p.waitForTimeout(600)};
  const calSay=p=>p.evaluate(()=>$('#notiPage .cal').textContent);
  const reload=async p=>{await p.evaluate(()=>{BK.key='';render()});await until(()=>p.evaluate(()=>!BK.loading&&BK.cal!==undefined),10000);await p.waitForTimeout(300)};
  const fillReq=async(p,s,n,topic)=>{await p.click('#notiPage [data-bk=req]');await p.waitForSelector('#dlgForm [name=s]',{state:'attached'});
    await p.evaluate(([s,n,t])=>{const f=document.querySelector('#dlgForm');f.querySelector('[name=s]').value=s;f.querySelector('[name=n]').value=n;f.querySelector('[name=topic]').value=t},[String(base+s),String(n),topic]);
    await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(400)};
  const bks=async()=>{let v=[];await admin(async d=>{v=(await d.collection('bookings').get()).docs.map(s=>({id:s.id,...s.data()}))});return v};
  const slotsN=async()=>{let n=0;await admin(async d=>{n=(await d.collection('slots').get()).size});return n};
  const hasDept=p=>p.evaluate(()=>Object.keys((acct.roles||{}).depts||{}).length>0);

  /* ---------- 1. 可見性 ---------- */
  const nb=await open('president','nobody');await setRole(await uidOf(nb),{});
  const s1=await open('rights','stu1');const s1U=await uidOf(s1);await setRole(s1U,{rights:'editor'});
  const s2=await open('rights','stu2');const s2U=await uidOf(s2);await setRole(s2U,{rights:'editor'});
  const mg=await open('president','mgr');const mgU=await uidOf(mg);await setRole(mgU,{president:'admin'});
  await admin(async d=>{
    await d.doc(`calendars/${O}`).set({name:'會長室',managers:[mgU],gridMin:30,maxSlots:4,horizonDays:60,maxPendingPerUser:3,rev:1,updatedAt:TS.now(),updatedBy:'su'});
    await d.doc('openWindows/w1').set({ownerId:O,start:TS.fromMillis(base*SLOT),end:TS.fromMillis((base+8)*SLOT),updatedAt:TS.now(),updatedBy:'su'});
  });
  await until(()=>hasDept(s1));await until(()=>hasDept(s2));
  for(const p of [nb,mg]){await reload(p);await ext(p)}
  ok(!(await vis(nb))&&/到你的部門看板/.test(await say(nb)),'沒有部門角色的登入者：會長室頁沒有按鈕，只有一行指路');
  for(const p of [s1,s2])await calOpen(p);
  ok(await s1.evaluate(()=>!$('#bkPanel')||$('#bkPanel').hidden||!$('#bkPanel [data-bk]')),'同學：各部門看板沒有預約卡的按鈕，預約在行事曆');
  ok(await s1.evaluate(()=>/還有 8 格/.test($('#notiPage .cal-list').textContent)&&!!$('#notiPage .cal-ev.bk [data-bk=req]')&&!$('#notiPage [data-bk=wadd]')&&!$('#notiPage [data-bk=ok]')&&!!$('#notiPage .pc-d.has')),'同學：行事曆會長室模式看到可預約時段（還有 8 格）、月曆有標記，沒有管理按鈕');
  ok(await s1.evaluate(()=>/下一個可預約時段/.test($('#notiPage .cal-bk').textContent)&&/最多 3 筆待審/.test($('#notiPage .cal-bk').textContent)),'月曆下面一小塊：下一個可預約時段與規則提醒');
  await s1.evaluate(()=>{NOTI.mode='mine';calPaint(NOTI)});await s1.waitForTimeout(800);   /* 舊清單的淡出分身要等它走完 */
  ok(await s1.evaluate(()=>!document.querySelector('#notiPage [data-bk]')&&!document.querySelector('#notiPage .cal-bk')),'切到「本部門」模式：預約的東西不出現');
  await s1.evaluate(()=>{NOTI.mode='pres';calPaint(NOTI)});

  /* ---------- 2. 表單檢查 ---------- */
  await fillReq(s1,0,2,'');
  ok(await s1.evaluate(()=>/請寫事由/.test($('#dlgForm .dlg-err').textContent)),'沒填事由：對話框提示');
  await s1.evaluate(([s,n])=>{const f=document.querySelector('#dlgForm');f.querySelector('[name=s]').value=s;f.querySelector('[name=n]').value=n;f.querySelector('[name=topic]').value='x'},[String(base+7),'3']);
  await s1.click('#dlgForm [data-act=ok]');await s1.waitForTimeout(300);
  ok(await s1.evaluate(()=>/超出/.test($('#dlgForm .dlg-err').textContent))&&(await bks()).length===0,'超出時段：對話框提示、沒有寫入');
  await s1.click('#dlgForm [data-act=cancel]');await s1.waitForTimeout(400);

  /* ---------- 3. 送出 ---------- */
  await fillReq(s1,2,2,'預算 <img src=x onerror=window.__xss=1>');   /* 15:00 起 1 小時 */
  await until(()=>s1.evaluate(()=>!BK.busy&&BK.mine.length===1));
  const bk=await bks(),q1=await read(`bookingQuota/${O}_${s1U}`),a1=await read(`auditLogs/bookings_${bk[0]&&bk[0].id}_1`);
  ok(bk.length===1&&bk[0].status==='pending'&&bk[0].rev===1&&bk[0].requester===s1U&&bk[0].startSlot===base+2&&bk[0].slotCount===2&&(await slotsN())===2&&q1.pending===1&&a1&&a1.action==='request','送出：pending、rev 1、兩格鎖、額度 1、稽核 request');
  ok(await s1.evaluate(()=>/等會長確認/.test($('#notiPage .cal-list').textContent)&&/還有 6 格/.test($('#notiPage .cal-list').textContent)&&window.__xss!==1&&!document.querySelector('#notiPage img')),'畫面：我的預約出現、剩 6 格、事由帶 HTML 照字面顯示');
  await reload(mg);await until(()=>mg.evaluate(()=>BK.pend.length===1));
  ok(await mg.evaluate(()=>window.__xss!==1&&!document.querySelector('#bkBody img')&&/預算 <img/.test($('#bkBody').textContent)),'會長室管理員的畫面：也照字面顯示');

  /* ---------- 4. 兩個同學搶同一時段 ---------- */
  await reload(s2);await calOpen(s2);
  await s2.evaluate(()=>{BK.taken=new Set()});   /* 模擬 s2 在 s1 送出之前讀的畫面（沒有被鎖的格） */
  await fillReq(s2,3,2,'我也想約');   /* 15:30 起：和 s1 的 15:00–16:00 重疊 */
  await until(()=>s2.evaluate(()=>!BK.busy));
  ok((await bks()).length===1&&(await slotsN())===2&&s2.toasts.some(m=>/已經被預約/.test(m)),'同時搶重疊的時段：第二個得到「已經被預約」，沒有重複的預約或鎖');
  const other=await s2.evaluate(async id=>{try{const B=await bkMod();await B.cancel(CFG.firebase,id);return 'ok'}catch(e){return e.code}},bk[0].id);
  ok(['conflict','permission-denied'].includes(other)&&(await read(`bookings/${bk[0].id}`)).status==='pending','別人取消不了我的預約（讀都讀不到，permission-denied）');
  ok(await s2.evaluate(async()=>{const B=await bkMod();return (await B.mine(CFG.firebase,'president')).length===0}),'別人的「我的預約」讀不到這筆');

  /* ---------- 5. 上限與繞過 ---------- */
  await s1.evaluate(()=>{BK.taken=new Set()});
  await fillReq(s1,0,1,'第二筆');await until(()=>s1.evaluate(()=>!BK.busy));
  await fillReq(s1,5,1,'第三筆');await until(()=>s1.evaluate(()=>!BK.busy));
  await fillReq(s1,6,1,'第四筆');await until(()=>s1.evaluate(()=>!BK.busy));
  ok((await bks()).length===3&&(await read(`bookingQuota/${O}_${s1U}`)).pending===3&&s1.toasts.some(m=>/待審已滿 3 筆/.test(m)),'第四筆待審：規則拒絕、畫面提示、仍是 3 筆');
  const out=await s2.evaluate(async base=>{try{const B=await bkMod();await B.request(CFG.firebase,'president','w1',base+20,1,'不在開放時段');return 'ok'}catch(e){return e.code}},base);
  ok(out==='permission-denied','不在開放時段內的申請（繞過畫面）：被規則拒絕');

  /* ---------- 6. 取消 ---------- */
  await s1.click(`#notiPage [data-bk=cancel][data-id="${bk[0].id}"]`);await s1.waitForSelector('#dlgForm [data-act=delete]');await s1.click('#dlgForm [data-act=delete]');
  await until(()=>s1.evaluate(()=>!BK.busy&&BK.mine.length===2));
  const c1=await read(`bookings/${bk[0].id}`),a2=await read(`auditLogs/bookings_${bk[0].id}_2`);let left=-1;await admin(async d=>{left=(await d.collection('slots').where('ref','==',bk[0].id).get()).size});
  ok(c1.status==='cancelled'&&c1.rev===2&&left===0&&(await read(`bookingQuota/${O}_${s1U}`)).pending===2&&a2&&a2.action==='cancelled','取消：cancelled、鎖全部刪掉、額度減 1、稽核');
  await reload(s2);await calOpen(s2);await fillReq(s2,3,2,'取消後我來約');await until(()=>s2.evaluate(()=>!BK.busy&&BK.mine.length===1));
  ok((await bks()).filter(b=>b.requester===s2U&&b.status==='pending').length===1,'取消後別人立刻可以約同一時段');

  if(process.env.SHOTS){await reload(s2);await calOpen(s2);
    for(const [n,w,h,cs] of [['cal_mob',390,844,'light'],['cal_dark',390,844,'dark'],['cal_desk',1366,900,'light']]){
      await s2.setViewportSize({width:w,height:h});await s2.emulateMedia({colorScheme:cs});await s2.waitForTimeout(600);
      await s2.evaluate(()=>document.querySelector('#notiPage .cal').scrollIntoView());await s2.waitForTimeout(300);
      await s2.screenshot({path:path.join(process.env.SHOTS,`bk_${n}.png`),fullPage:false})}
    await s2.setViewportSize({width:390,height:844});await s2.click('#notiPage [data-bk=req]');await s2.waitForTimeout(600);
    await s2.screenshot({path:path.join(process.env.SHOTS,'bk_req_form.png')})}
  ok([nb,s1,s2,mg].every(p=>!p.errs.length),'沒有頁面錯誤：'+[nb,s1,s2,mg].flatMap(p=>p.errs).join('|'));
  for(const p of pages)await p.context().close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
