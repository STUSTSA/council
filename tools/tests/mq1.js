/* 會議結論的待合併提案（2026-11-21）：Auth 模擬器＋Firestore 模擬器、正式規則。
   1. 秘書處在會議紀錄寫結論、加臨時項目 → 「送到部門等待合併」：mergeProposals 寫入（note＝附在卡片、new＝臨時項目）；重送＝更新還沒處理的
   2. 部門（權益部編輯者）的即時回報頁出現「會議結論」卡；「合併到卡片」＝卡片多一行結論並標成已合併；「建成新卡片」＝新卡片＋標成已合併；「略過」＝標成略過
   3. 別部門編輯者、一般登入者看不到卡片、也讀不到提案；結論裡的 HTML 不會變成標籤
   執行：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8315,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
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

  const SECID='secretariat';
  const list=async c=>{let v=[];await admin(async d=>{v=(await d.collection(c).get()).docs.map(s=>({id:s.id,...s.data()}))});return v};
  const ped=await open('rights','red');await setRole(await uidOf(ped),{rights:'editor'});
  const pe=await open(SECID,'sec');await setRole(await uidOf(pe),{secretariat:'editor'});
  const pv=await open('rights','viewer');await setRole(await uidOf(pv),{});
  const po=await open('rights','other');await setRole(await uidOf(po),{events:'editor'});
  for(const p of [ped,pe,pv,po])await until(()=>p.evaluate(()=>acct.roles!==undefined&&storeFsBase));
  await ped.waitForTimeout(500);
  /* 權益部先有一張報告卡片 */
  await ped.evaluate(async()=>{state.events.push({id:'ec1',name:'社群排程'+'<b id=zz>粗</b>',desc:'',blocks:[{id:'bk1',text:'每週三貼文',check:null,timeId:null}],createdAt:today(),staff:[],links:[],times:[],round:1,touched:[],report:true});kpSync(state.events[state.events.length-1]);await fsPersist('',{quiet:true})});
  await until(async()=>(await list('cards')).some(c=>c.deptId==='rights'&&/社群排程/.test(c.title)));
  const card=(await list('cards')).find(c=>/社群排程/.test(c.title));
  ok(!!card,'權益部有一張報告卡片：'+(card&&card.id));
  /* 秘書處：做一份今天的議程、進會議紀錄編輯、寫結論 */
  const T=await pe.evaluate(()=>today());
  const aid='agt1';
  await pe.evaluate(async([T,aid])=>{const a={id:aid,date:T,title:'行政會議',by:'x',at:T+' 10:00',items:[{dept:'rights',deptName:'權益部',weekDate:T,text:'三、學權部'},{dept:'works',deptName:'工務部',weekDate:T,text:'x'}]};
    await (await storeWriteGet()).saveAgenda(CFG.firebase,T,a);state.agendas=[a];render()},[T,aid]);
  await pe.evaluate(()=>{AG.key='';render()});await ext(pe);
  await pe.evaluate(()=>mtLoadAll(true));await until(()=>pe.evaluate(()=>!MT.loading&&MT.depts.get('rights')&&MT.depts.get('rights').data),10000);
  await pe.evaluate(id=>mnOpen(id),aid);await pe.waitForSelector('#mnOv [data-mnk]');await pe.waitForTimeout(800);
  const evSel='#mnOv [data-mnk="0"]';
  {ok(await pe.evaluate(s=>!!document.querySelector(s+' [data-mtev=ec1]'),evSel),'會議紀錄裡有權益部的報告卡片')}
  await pe.click(evSel+' [data-mtev=ec1] summary');await pe.fill(evSel+' [data-mnn=ec1]','結論：照原案 '+XSS);
  await pe.click(evSel+' [data-mn=xadd]');await pe.fill(evSel+' [data-mnxt]','臨時動議 A');await pe.fill(evSel+' [data-mnxn]','下週討論');
  ok(await pe.evaluate(s=>document.querySelector(s+' [data-mn=send]').disabled===false,evSel),'權益部（新資料庫）：「送到部門等待合併」可按');
  await pe.click(evSel+' [data-mn=send]');await until(async()=>(await list('mergeProposals')).length===2,10000);
  let ps=await list('mergeProposals');const pn=ps.find(p=>p.kind==='note'),pw=ps.find(p=>p.kind==='new');
  ok(pn&&pn.cardId===card.id&&pn.deptId==='rights'&&pn.status==='pending'&&pn.note.startsWith('結論：照原案')&&pn.meetingDate===T,'note 提案：附在那張卡片、待合併、帶會議日期');
  ok(pw&&pw.cardId===null&&pw.title==='臨時動議 A'&&pw.note==='下週討論','new 提案：臨時項目、沒有 cardId');
  /* 重送：改結論 → 更新、不新增 */
  await pe.fill(evSel+' [data-mnn=ec1]','結論：改成延後');await pe.click(evSel+' [data-mn=send]');
  await until(async()=>(await list('mergeProposals')).find(p=>p.kind==='note').note==='結論：改成延後',10000);
  ok((await list('mergeProposals')).length===2,'重送：更新那一則，沒有多出新的');
  /* 部門端 */
  await ped.reload();await ped.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});
  await until(()=>ped.evaluate(()=>acct.roles!==undefined&&storeFsBase));
  await until(()=>ped.evaluate(()=>!$('#mpPanel').hidden),10000);
  ok(await ped.evaluate(()=>document.querySelectorAll('#mpPanel .mp-row').length===2&&/2 則待合併/.test($('#mpCnt').textContent)),'權益部編輯者：即時回報頁出現「會議結論」兩則');
  if(process.env.SHOTS){await ped.setViewportSize({width:390,height:844});await ped.waitForTimeout(1500);await ped.evaluate(()=>{const s=document.getElementById('splash');if(s)s.remove()});await ped.waitForTimeout(300);await ped.locator('#mpPanel').screenshot({path:path.join(process.env.SHOTS,'mp_inbox.png')});await ped.setViewportSize({width:1100,height:900})}
  ok(await ped.evaluate(()=>window.__xss!==1&&!document.querySelector('#mpPanel img')&&!document.querySelector('#zz')),'提案與卡片名稱裡的 HTML 不會變成標籤');
  await ped.click('#mpPanel [data-mpid]:has-text("延後") [data-mp=merge]');
  await until(async()=>(await list('mergeProposals')).find(p=>p.kind==='note').status==='merged',10000);
  const c2=(await list('cards')).find(c=>c.id===card.id);
  ok(c2.blocks.text.some(x=>/會議結論（.*）：結論：改成延後/.test(x))&&c2.blocks.text[0]==='每週三貼文'&&c2.version===card.version+1,'合併到卡片：多一行「會議結論」、原本的行不動、版本 +1');
  const mp=(await list('mergeProposals')).find(p=>p.kind==='note');ok(mp.resolvedBy&&mp.resolvedAt,'提案標成已合併、記下處理者');
  await ped.click('#mpPanel [data-mpid] [data-mp=merge]');
  await until(async()=>(await list('cards')).some(c=>c.title==='臨時動議 A'),10000);
  ok(!!(await list('cards')).find(c=>c.title==='臨時動議 A'&&c.deptId==='rights'),'建成新卡片：臨時動議 A');
  await until(async()=>(await list('mergeProposals')).every(p=>p.status==='merged'),10000);
  ok(await ped.evaluate(()=>$('#mpPanel').hidden),'都處理完：這張卡片收起來');
  /* 略過 */
  await pe.fill(evSel+' [data-mnn=ec1]','再一個結論');await pe.click(evSel+' [data-mn=send]');
  await until(async()=>(await list('mergeProposals')).find(p=>p.kind==='note').status==='merged'&&true,3000);
  const cnt=(await list('mergeProposals')).length;
  ok(cnt===2,'部門已處理過的不會被重送蓋掉（仍 2 筆、仍是已合併）');
  await pe.click(evSel+' [data-mn=xadd]');await pe.fill(evSel+' [data-mnx="1"] [data-mnxt]','臨時動議 B');await pe.fill(evSel+' [data-mnx="1"] [data-mnxn]','b');
  await pe.click(evSel+' [data-mn=send]');await until(async()=>(await list('mergeProposals')).length===3,10000);
  await ped.reload();await ped.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});
  await until(()=>ped.evaluate(()=>!$('#mpPanel').hidden),10000);
  await ped.click('#mpPanel [data-mp=skip]');await until(async()=>(await list('mergeProposals')).some(p=>p.status==='dismissed'),10000);
  ok(!(await list('cards')).some(c=>c.title==='臨時動議 B'),'略過：標成略過、不建卡片');
  /* 別人看不到 */
  for(const p of [pv,po])await p.reload().then(()=>p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000}));
  await pv.waitForTimeout(1500);await po.waitForTimeout(500);
  ok(await pv.evaluate(()=>$('#mpPanel').hidden)&&await po.evaluate(()=>$('#mpPanel').hidden),'一般登入者、別部門編輯者：沒有「會議結論」卡');
  const dn=await pv.evaluate(async()=>{try{const B=await mpMod();await B.pending(CFG.firebase,'rights');return 'ok'}catch(e){return e.code||e.message}});
  ok(dn==='permission-denied','一般登入者直接讀提案：被規則拒絕');
  ok(![ped,pe,pv,po].some(p=>p.errs.length),'沒有頁面錯誤：'+[ped,pe,pv,po].flatMap(p=>p.errs).join('|'));
  if(process.env.SHOTS){await pe.setViewportSize({width:390,height:844});await pe.waitForTimeout(400);await pe.locator('#mnOv').screenshot({path:path.join(process.env.SHOTS,'mn_send.png')});
}
  for(const p of pages)await p.context().close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
