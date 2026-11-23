/* 會長室「收藏」（follow.js 的 favBtnHTML、store-write.js 的 setFavorite）：會長（會長室管理員）在別的部門看板按「收藏」＝加進 deptSettings/president 的 follows
   1. 會長室管理員在權益部看板：即時回報詳情有「收藏」鈕；一般登入者（只有權益部編輯者）、沒登入、在會長室自己的看板都沒有
   2. 按下去：follows 多一筆 {dept:rights, kind:live, ref:rights__ID}、rev+1、稽核紀錄；鈕變「已收藏」；再按＝拿掉
   3. 收藏後會長室自己的即時回報清單有那一張（膠囊）
   4. 沒有權限的帳號直接呼叫 setFavorite 被規則拒絕、follows 不變
   執行（自己開模擬器與網站）：cd backend && firebase emulators:exec --only firestore,auth --project demo-stustsa-board "node ../tools/tests/fav1.js" */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8330,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
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

  const read=async p=>{let v;await admin(async d=>{v=(await d.doc(p).get()).data()});return v};
  const D='rights';
  const pa=await open(D,'pa');const paUid=await uidOf(pa);await setRole(paUid,{president:'admin'});
  const ed=await open(D,'ed');const edUid=await uidOf(ed);await setRole(edUid,{rights:'editor'});
  const gu=await open(D);
  const pp=await open('president','pa2');await setRole(await uidOf(pp),{president:'admin'});
  const openFirst=async p=>{await p.evaluate(()=>render());await p.waitForTimeout(500);
    return p.evaluate(()=>{const ev=state.events.find(e=>!e.doneAt);if(!ev)return null;lvOpen=ev.id;render();return ev.id})};
  await until(()=>pa.evaluate(()=>!!acct.roles&&!!acct.roles.depts&&acct.roles.depts.president==='admin'));
  const id=await openFirst(pa);ok(!!id,'權益部有即時回報可以收藏（'+id+'）');
  const hasBtn=p=>p.evaluate(()=>!!document.querySelector('.lc [data-fav]'));
  await until(()=>pa.evaluate(()=>!!FAV.keys));await pa.evaluate(()=>render());await pa.waitForTimeout(400);
  ok(await hasBtn(pa),'會長室管理員：權益部的即時回報詳情有「收藏」鈕');
  await openFirst(ed);await ed.waitForTimeout(500);ok(!(await hasBtn(ed)),'只有權益部編輯者：沒有「收藏」鈕');
  await openFirst(gu);ok(!(await hasBtn(gu)),'沒登入：沒有「收藏」鈕');
  await pp.evaluate(()=>{state.events.length&&(lvOpen=state.events[0].id);render()});ok(!(await hasBtn(pp)),'會長室自己的看板：沒有「收藏」鈕（那裡用「+ 追蹤項目」）');
  const before=await read('deptSettings/president');
  if(process.env.SHOTS)await pa.locator('.lc').first().screenshot({path:process.env.SHOTS+'/fav_off.png'});
  await pa.click('.lc [data-fav]');
  await until(async()=>((await read('deptSettings/president')).follows||[]).some(f=>f.ref===`${D}__${id}`),8000);
  const a1=await read('deptSettings/president');const hit=(a1.follows||[]).filter(f=>f.ref===`${D}__${id}`);
  ok(hit.length===1&&hit[0].dept===D&&hit[0].kind==='live'&&a1.rev===before.rev+1,`按收藏：follows 多一筆（kind ${hit[0]&&hit[0].kind}）、rev ${before.rev}→${a1.rev}`);
  ok(!!(await read(`auditLogs/deptSettings_president_${a1.rev}`)),'有稽核紀錄');
  await until(()=>pa.evaluate(()=>document.querySelector('.lc [data-fav]')?.getAttribute('aria-pressed')==='true'));
  ok(await pa.evaluate(()=>document.querySelector('.lc [data-fav]').getAttribute('aria-label')==='取消收藏'),'鈕變成實心（已收藏）');
  if(process.env.SHOTS){await pa.waitForTimeout(500);await pa.locator('.lc').first().screenshot({path:process.env.SHOTS+'/fav_on.png'})}
  await pp.reload();await pp.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await pp.waitForTimeout(2500);
  await pp.evaluate(()=>setSection&&setSection('live',{instant:true}));await until(()=>pp.evaluate(()=>!!document.querySelector('#events .fav-cp')),8000);
  ok(await pp.evaluate(id=>!!document.querySelector('#events .fav-cp')&&state.follows.some(f=>f.dept==='rights'&&f.ref===id),id),'會長室自己的即時回報清單有收藏的那一項（膠囊，部門名在右邊）');
  await pa.click('.lc [data-fav]');
  await until(async()=>!((await read('deptSettings/president')).follows||[]).some(f=>f.ref===`${D}__${id}`),8000);
  const a2=await read('deptSettings/president');ok(a2.rev===a1.rev+1,`再按＝取消收藏（rev ${a2.rev}）`);
  const r=await ed.evaluate(async(a)=>{try{const W=await storeWriteGet();await W.setFavorite(CFG.firebase,{dept:a.D,kind:'live',ref:a.id,on:true});return 'ok'}catch(e){return e.code||e.message}},{D,id});
  ok(r!=='ok'&&!((await read('deptSettings/president')).follows||[]).some(f=>f.ref===`${D}__${id}`),`編輯者直接呼叫 setFavorite 被擋（${r}）`);
  ok(pages.every(p=>!p.errs.length),'沒有 JS 錯誤 '+pages.map(p=>p.errs.join('|')).join(''));
  for(const p of pages)await p.context().close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
