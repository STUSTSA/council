/* 秘書處會議編輯在 firestore 模式（2026-11-20）：會長室開放 → 秘書處改各部門標了報告的卡片 → 寫回時記成會議紀錄（行為跟 GitHub 模式同一個流程）。
   用 Auth 模擬器＋Firestore 模擬器、正式規則；九個部門都切成 firestore（切換當天的狀態），資料用遷移程式匯入。
   1. 會長室看板：總管理員的開關可以切、寫 grants/meetingEdit（到期＝今天結束）＋稽核紀錄；會長室管理員（不是總管理員）的開關是停用的
   2. 秘書處看板（秘書處編輯者）：有「編輯」；只列報告卡片；逐欄編輯只有名稱、說明、已有時間標記（沒有母議題、專員、標籤、超連結、新增或刪掉時間）
   3. 改名稱、說明、時間標記的地點 → 儲存：Firestore 的卡片（名稱、內容、版本 +1、專員與更新紀錄不變）、新的一版（作者是秘書處）、時間標記（地點、rev +1）、
      meetingMinutes/今天（改了哪一筆、哪些欄位）；權益部看板讀到新內容
   4. 繞過畫面：秘書處直接呼叫 saveMeeting 改專員＝meeting-field、沒有寫入；直接寫卡片的專員被規則拒絕
   5. 會長室關閉後：秘書處的「編輯」不見；關閉前就開始編輯、關閉後才按儲存＝提示授權已關閉、沒有寫入；直接呼叫 saveMeeting＝規則拒絕
   6. 一般登入者（沒有角色）打開秘書處看板：沒有「編輯」；畫面不顯示會議紀錄的內容（讀不到 meetingMinutes 也不影響看板）
   7. 卡片名稱帶 HTML：秘書處面板照字面顯示，不執行
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
  /* 權益部：一張有時間標記的卡片標成報告（名稱帶 HTML），其他都不是報告。會長室資料檔匯入的會議授權（11/09）已經過期＝從關著開始 */
  let A=null,N=null,T=null;
  await admin(async d=>{
    const cs=(await d.collection('cards').where('deptId','==','rights').get()).docs;
    for(const c of cs)if(c.data().report)await c.ref.update({report:false});
    const withT=cs.find(c=>c.data().state==='open'&&(c.data().timeIds||[]).length);A=withT.id;T=withT.data().timeIds[0];
    N=cs.find(c=>c.data().state==='open'&&c.id!==A).id;
    await d.doc(`cards/${A}`).update({report:true,title:'會議卡 '+XSS,staff:['uidA']});
  });
  const oid=x=>x.split('__').slice(1).join('__');

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

  /* ---------- 1. 會長室的開關 ---------- */
  const ps=await open('president','boss');const suUid=await uidOf(ps);await setRole(suUid,{},true);
  await until(()=>ps.evaluate(()=>fsRole()==='super'));await ps.evaluate(()=>render());await ext(ps);
  ok(await ps.evaluate(()=>!$('#grantPanel').hidden&&!$('#grantSw').disabled&&$('#grantSw').getAttribute('aria-checked')==='false'),'會長室（總管理員）：開關可以切，一開始是關的');
  await ps.click('#grantSw');
  await until(()=>ps.evaluate(()=>$('#grantSw').getAttribute('aria-checked')==='true'&&!grantBusy));
  const g1=await read('grants/meetingEdit'),a1=await read(`auditLogs/grants_meetingEdit_${g1&&g1.rev}`);
  const endOfDay=Date.parse(today+'T00:00:00+08:00')+864e5;
  ok(g1&&g1.until.toMillis()===endOfDay&&g1.updatedBy===suUid&&a1&&a1.action==='open'&&a1.actor===suUid,`開放：grants/meetingEdit 到期＝今天結束、rev ${g1&&g1.rev}、稽核紀錄 open`);
  ok(await ps.evaluate(()=>/今天開放中/.test($('#grantSt').textContent)),'開放後狀態寫「今天開放中」');
  const pa=await open('president','pa');await setRole(await uidOf(pa),{president:'admin'});
  await until(()=>pa.evaluate(()=>fsRole()==='admin'));await ext(pa);
  ok(await pa.evaluate(()=>$('#grantSw').disabled),'會長室管理員（不是總管理員）：開關停用（規則只允許總管理員）');

  /* ---------- 2. 秘書處看板 ---------- */
  const sp=await open('secretariat','sec');await setRole(await uidOf(sp),{secretariat:'editor'});
  await until(()=>sp.evaluate(()=>fsRole()==='editor'));await sp.evaluate(()=>mtLoadAll(true));await until(()=>sp.evaluate(()=>MT.depts.size&&!MT.loading));
  await ext(sp);await sp.click('#meetPick [data-mtpick=rights]').catch(()=>{});await sp.waitForTimeout(500);
  const listed=await sp.evaluate(()=>[...document.querySelectorAll('#meetEdList .mt-ev')].map(d=>d.dataset.ev));
  ok(listed.length===1&&listed[0]===A.split('__')[1],`秘書處：只列權益部的報告卡片（${listed.join()}）`);
  ok(await sp.evaluate(()=>{const b=document.querySelector('#meetEdPanel [data-edit]');return !b.hidden}),'秘書處編輯者：有「編輯」');
  await sp.evaluate(()=>document.getElementById('meetEdPanel').scrollIntoView());
  await sp.click('#meetEdPanel [data-edit]');await sp.waitForTimeout(800);
  const id=oid(A),tid=oid(T),sel=`#meetEdList .mt-ev[data-ev="${id}"]`;
  await sp.evaluate(s=>{const d=document.querySelector(s);if(d&&!d.open)d.open=true},sel);await sp.waitForTimeout(400);
  const pens=await sp.evaluate(s=>[...document.querySelectorAll(s+' [data-evpen]')].map(x=>x.dataset.evpen),sel);
  ok(pens.includes('name')&&pens.includes('desc')&&pens.includes('t:'+tid)&&!pens.some(k=>['issue','staff','labels','t:+','l:+'].includes(k)||k.startsWith('l:')),`逐欄編輯只有名稱、說明、已有的時間（${pens.join(',')}）`);
  ok(await sp.evaluate(()=>window.__xss!==1&&!document.querySelector('#meetEdList img')),'卡片名稱帶 HTML：照字面顯示，不執行');

  /* ---------- 3. 改名稱、說明、時間的地點 → 儲存 ---------- */
  const before=await read(`cards/${A}`);
  await sp.click(`${sel} [data-evpen=name]`);await sp.fill(`${sel} .evf.open [data-e=name]`,'秘書處改的名稱');await sp.click(`${sel} [data-evfx=ok]`);await sp.waitForTimeout(300);
  await sp.click(`${sel} [data-evpen=desc]`);await sp.fill(`${sel} .evf.open [data-e=desc]`,'會議決議：照案通過\n第二行');await sp.click(`${sel} [data-evfx=ok]`);await sp.waitForTimeout(300);
  await sp.click(`${sel} [data-evpen="t:${tid}"]`);await sp.fill(`${sel} .evf.open [data-e=place]`,'學生會辦公室');await sp.click(`${sel} [data-evfx=ok]`);await sp.waitForTimeout(300);
  ok(await sp.evaluate(()=>MT.depts.get('rights').dirty),'權益部標成已修改');
  await sp.click('#meetEdPanel [data-edsave]');
  await until(()=>sp.evaluate(()=>!editing&&!MT.depts.get('rights').dirty),15000);await sp.waitForTimeout(1500);
  const after=await read(`cards/${A}`),ev=await read(`events/${T}`),ver=await read(`cards/${A}/versions/${after.version}`);
  const txt=c=>Array.isArray(c.blocks)?c.blocks.map(x=>x.text):c.blocks.text;
  ok(after.title==='秘書處改的名稱'&&txt(after).includes('會議決議：照案通過')&&after.version===before.version+1&&after.updatedBy===await uidOf(sp),`卡片：名稱、內容寫進去，版本 ${before.version}→${after.version}`);
  ok(JSON.stringify(after.staff)===JSON.stringify(before.staff)&&JSON.stringify(after.touched||null)===JSON.stringify(before.touched||null)&&JSON.stringify(after.timeIds)===JSON.stringify(before.timeIds),'卡片：專員、更新紀錄、timeIds 不變');
  ok(ver&&ver.by===after.updatedBy&&ver.title===after.title,'新的一版：作者是秘書處、內容跟卡片相同');
  ok(ev.place==='學生會辦公室'&&ev.updatedBy===after.updatedBy,`時間標記：地點寫進去（rev ${ev.rev}）`);
  const mn=await read(`meetingMinutes/${today}`),it=mn&&mn.items&&mn.items[0]&&mn.items[0].items.find(x=>x.dept==='rights'&&x.ev===id);
  ok(it&&['名稱','說明','時間'].every(k=>it.changed.includes(k))&&mn.items[0].by.includes('sec 同學'),`會議紀錄 meetingMinutes/${today}：記下改了哪一筆、哪些欄位（${it&&it.changed}）`);
  ok(await sp.evaluate(()=>/已記錄 1 次會議/.test($('#minutesInfo').textContent)),'秘書處畫面：已記錄 1 次會議');
  ok(sp.puts.length===0&&!sp.errs.length,`沒有 GitHub 寫入、沒有頁面錯誤（${sp.errs.join('|')}）`);
  const rp=await open('rights','reader');
  ok(await rp.evaluate(i=>(state.events.find(e=>e.id===i)||{}).name==='秘書處改的名稱',id),'權益部看板讀到秘書處改的名稱');

  /* ---------- 4. 繞過畫面 ---------- */
  const r4=await sp.evaluate(async i=>{const m=MT.depts.get('rights'),n=JSON.parse(JSON.stringify(m.data));n.events.find(e=>e.id===i).staff=['secUid'];
    try{await (await storeWriteGet()).saveMeeting(CFG.firebase,'rights',{src:m.fs.src,orig:m.fs.orig,state:m.base},n);return 'ok'}catch(e){return e.code}},id);
  ok(r4==='meeting-field'&&JSON.stringify((await read(`cards/${A}`)).staff)===JSON.stringify(before.staff),`直接呼叫 saveMeeting 改專員：${r4}、沒有寫入`);
  const r4b=await sp.evaluate(async a=>{const {fb}=await import(location.origin+'/core/js/fb-app.js');const F=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
    try{await F.updateDoc(F.doc(fb(CFG.firebase).db,'cards',a),{staff:['secUid'],updatedAt:F.serverTimestamp(),updatedBy:acct.user.uid});return 'ok'}catch(e){return e.code}},A);
  ok(r4b==='permission-denied','直接寫卡片的專員：規則拒絕');

  /* ---------- 5. 會長室關閉 ---------- */
  await sp.click('#meetEdPanel [data-edit]');await sp.waitForTimeout(600);   /* 關閉前就開始編輯 */
  await sp.evaluate(s=>{const d=document.querySelector(s);if(d&&!d.open)d.open=true},sel);
  await sp.click(`${sel} [data-evpen=name]`);await sp.fill(`${sel} .evf.open [data-e=name]`,'關閉後才存');await sp.click(`${sel} [data-evfx=ok]`);await sp.waitForTimeout(300);
  await ps.click('#grantSw');await until(()=>ps.evaluate(()=>$('#grantSw').getAttribute('aria-checked')==='false'&&!grantBusy));
  const g2=await read('grants/meetingEdit'),a2=await read(`auditLogs/grants_meetingEdit_${g2.rev}`);
  ok(g2.until.toMillis()<=Date.now()&&a2&&a2.action==='close','關閉：到期時間＝寫入的那一刻、稽核紀錄 close');
  await sp.click('#meetEdPanel [data-edsave]');
  ok(await until(()=>sp.toasts.some(x=>x.includes('授權已經關閉'))),'關閉後才按儲存：提示會長室的授權已關閉');
  ok((await read(`cards/${A}`)).title==='秘書處改的名稱','沒有寫入');
  const r5=await sp.evaluate(async i=>{const m=MT.depts.get('rights'),n=JSON.parse(JSON.stringify(m.data));n.events.find(e=>e.id===i).name='直接寫';
    try{await (await storeWriteGet()).saveMeeting(CFG.firebase,'rights',{src:m.fs.src,orig:m.fs.orig,state:m.base},n);return 'ok'}catch(e){return e.code}},id);
  ok(r5==='permission-denied','關閉後直接呼叫 saveMeeting：規則拒絕');
  await sp.evaluate(()=>mtLoadAll(true));await until(()=>sp.evaluate(()=>!MT.loading));await sp.waitForTimeout(300);
  ok(await sp.evaluate(()=>document.querySelector('#meetEdPanel [data-edit]').hidden&&/未開放修改/.test($('#meetEdSt').textContent)),'重新讀取後：「編輯」不見、寫「未開放修改」');

  /* ---------- 6. 一般登入者 ---------- */
  await ps.click('#grantSw');await until(()=>ps.evaluate(()=>$('#grantSw').getAttribute('aria-checked')==='true'&&!grantBusy));
  const gp=await open('secretariat','nobody');await ext(gp);await gp.evaluate(()=>mtLoadAll(true));await until(()=>gp.evaluate(()=>MT.depts.size&&!MT.loading));
  ok(await gp.evaluate(()=>document.querySelector('#meetEdPanel [data-edit]').hidden&&!(state.minutes||[]).length&&!!storeFsBase),'一般登入者：沒有「編輯」、讀不到會議紀錄、看板照常讀得到');
  ok(!gp.errs.length&&!ps.errs.length&&!pa.errs.length&&!rp.errs.length,'沒有頁面錯誤');

  for(const p of pages)await p.context().close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
