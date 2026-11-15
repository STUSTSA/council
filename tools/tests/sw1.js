/* 02D 切換演練（模擬器；docs/遷移步驟.md 的模擬器版本）：
   資料檔先複製到暫存資料夾（SW1_TMP，沒給就在系統暫存區開一個），整個演練只讀複本；網站也從複本讀資料檔。
   A. 十個部門依切換順序（水果部 → 小部門 → 其他 → 權益部最後）各做一次：
      1. 只匯入這個部門（backend/migrate/run.js，總管理員經過正式規則）
      2. 筆數報告每一列相同（deptReport，跟命令列 --report 同一份）
      3. 看板把這個部門切成 firestore（route 掉 dept/config.js，其他部門照舊 github），用 Auth 模擬器以這個部門的編輯者登入
      4. 新增一張卡片並儲存 → Firestore 裡有這張卡片＋第 1 版
      5. 其他部門的 Firestore 文件在匯入與編輯前後雜湊相同；另一個還在 github 模式的部門讀到的內容＝資料檔複本；GitHub 沒有任何寫入
   B. 水果部完整回復：在 firestore 模式再改內容（多行說明、時間標記、標籤）→ 看板「匯出備份」＝命令列 --export（同一個 toState）
      → 切回 github（測試設定，GitHub API 用 route 模擬）→ 用看板「匯入備份」寫回 → 攔下 PUT 的內容
      → 寫回的內容＝切換前的資料檔＋firestore 模式裡的修改（語意比對，不比的欄位見 backend/migrate/compare.js）；雲端設定、權杖等只在 GitHub 模式有的欄位沿用原本的
   最後確認 repo 裡的資料檔沒有被動過。執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');const crypto=require('crypto');const os=require('os');
const {createRequire}=require('module');const {spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8304,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
const ORDER=['fruit','finance','works','marketing','pr','affairs','events','president','secretariat','rights'];
const TMP=process.env.SW1_TMP||fs.mkdtempSync(path.join(os.tmpdir(),'sw1-'));fs.mkdirSync(TMP,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
/* 網站：資料檔一律從暫存資料夾的複本讀 */
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const base=/^\/data[^/]*\.json$/.test(u)?TMP:ROOT;const p=path.join(base,u);
  if(!p.startsWith(base)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
const t0=Date.now();

(async()=>{
  const mig=await import(path.join(ROOT,'backend/migrate/run.js'));const {canon,diffPaths}=await import(path.join(ROOT,'backend/migrate/compare.js'));
  const depts=mig.loadDepts();
  const repoHash=Object.fromEntries(depts.map(d=>[d.path,sha(fs.readFileSync(path.join(ROOT,d.path)))]));
  for(const d of depts)fs.copyFileSync(path.join(ROOT,d.path),path.join(TMP,d.path));
  const orig=Object.fromEntries(depts.map(d=>[d.id,JSON.parse(fs.readFileSync(path.join(TMP,d.path),'utf8'))]));
  const pathOf=id=>depts.find(d=>d.id===id).path;
  console.log(`資料檔複本：${TMP}`);
  await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  const {initializeTestEnvironment}=breq('@firebase/rules-unit-testing');const firebase=breq('firebase/compat/app');breq('firebase/compat/firestore');
  const [h,pt]=EMU.split(':');
  const t=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:h,port:+pt,rules:fs.readFileSync(path.join(ROOT,'backend/firestore.rules'),'utf8')}});
  await t.clearFirestore();
  await fetch(`http://${AEMU}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
  const TS=firebase.firestore.Timestamp,FV=firebase.firestore.FieldValue;
  const admin=fn=>t.withSecurityRulesDisabled(async c=>fn(c.firestore()));
  const read=async p=>{let v;await admin(async d=>{const s=await d.doc(p).get();v=s.exists?s.data():null});return v};
  const tok=uid=>({sub:uid,user_id:uid,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{}}});
  await admin(d=>d.doc('roles/su').set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedBy:'su',updatedAt:TS.now()}));
  const sdb=t.authenticatedContext('su',tok('su')).firestore();
  const setRole=(uid,dps)=>admin(d=>d.doc(`roles/${uid}`).set({super:false,depts:dps,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  /* 其他部門（不是 X）的看板文件：雜湊 */
  const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,y)=>(o[y]=x[y],o),{}):x);
  const others=async X=>{const out={};await admin(async d=>{
    for(const c of ['cards','events','issues','weeks','labels','legacyIdentities','meetingMinutes'])for(const s of (await d.collection(c).get()).docs){const x=s.data();if(x.deptId===X)continue;out[`${c}/${s.id}`]=x;
      if(c==='cards')for(const v of (await d.collection(`cards/${s.id}/versions`).get()).docs)out[`cards/${s.id}/versions/${v.id}`]=v.data()}
    for(const c of ['deptSettings','departments'])for(const s of (await d.collection(c).get()).docs)if(s.id!==X)out[`${c}/${s.id}`]=s.data();
    if(X!=='president')for(const s of (await d.collection('grants').get()).docs)out[`grants/${s.id}`]=s.data();
    if(X!=='secretariat')for(const s of (await d.collection('org').get()).docs)out[`org/${s.id}`]=s.data();
  });return {n:Object.keys(out).length,h:sha(stable(out))}};

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8');
  const errs=[],puts=[];
  /* fsDepts：切成 firestore 的部門；repo：github 模式要不要有雲端設定（回復演練用；GitHub API 一律 route） */
  const open=async(dept,fsDepts,{repo=false,gh=null}={})=>{
    const ctx=await b.newContext({viewport:{width:900,height:850},serviceWorkers:'block',acceptDownloads:true});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>{if(gh)return gh(r);if(r.request().method()!=='GET')puts.push(r.request().url());r.fulfill({status:404,body:'{}'})});
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of fsDepts)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      if(repo)s=s.replace('data: { owner: "", repo: ""','data: { owner: "rehearsal-owner", repo: "rehearsal-repo"');
      r.fulfill({contentType:'text/javascript',body:s})});
    if(repo)await ctx.addInitScript(()=>{try{localStorage.setItem('workboard:ghtoken','rehearsal-dummy-token')}catch(_){}});
    const p=await ctx.newPage();p.on('pageerror',e=>errs.push(`${dept}: ${e.message}`));
    await p.goto(`${BASE}/index.html?d=${dept}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1200);
    p.ctx=ctx;return p};
  const signIn=async(p,sub)=>{await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    await p.waitForFunction(()=>acct.user&&acct.user.uid&&storeFsBase,null,{timeout:10000});return p.evaluate(()=>acct.user.uid)};
  const settled=p=>until(()=>p.evaluate(()=>!fsBusy&&storeFsBase&&!document.querySelector('#dlg[open]')),15000).then(()=>sleep(300));
  const dlgSet=(p,o)=>p.evaluate(o=>{for(const [k,v] of Object.entries(o))document.querySelector(`#dlgForm [name="${k}"]`).value=v},o);
  const dlgAct=async(p,a)=>{await p.click(`#dlg [data-act="${a}"]`);await p.waitForTimeout(500)};
  const editCard=(p,id,fn)=>p.evaluate(async([id,fn])=>{await startEdit('e:'+id);const ev=state.events.find(e=>e.id===id);(0,eval)(fn)(ev);evTouch(ev);syncLink(ev);dirty=true;render();if(fldCommitOpen())await saveFlow()},[id,fn.toString()]);
  /* 新增一張卡片（看板的「新增即時回報」） */
  const addCard=async(p,name,desc)=>{await p.evaluate(()=>document.querySelector('#addEvent').click());
    await p.waitForSelector('#dlg[open]',{timeout:8000});await dlgSet(p,{name,desc});await dlgAct(p,'ok');await settled(p);
    return p.evaluate(n=>(state.events.find(e=>e.name===n)||{}).id,name)};

  /* ---------- A. 十個部門逐一切換 ---------- */
  for(const [i,X] of ORDER.entries()){
    const before=await others(X);
    const src=mig.loadSources({dir:TMP,dept:X});
    const r=await mig.runImport(sdb,FV,TS,src,{batch:`sw-${X}`,uid:'su'});
    const rep=await mig.deptReport(sdb,src,X);
    await mig.finishImport(sdb,FV,`sw-${X}`,'su',rep.ok?'done':'failed',{written:r.written});
    const rows=rep.rows.filter(x=>x.source).map(x=>`${x.label} ${x.firestore}`).join('、')||'只有部門設定';
    ok(rep.ok&&!r.conflicts.length,`${X}：匯入後筆數報告每一列相同、V1～V6 通過（${rows}）`);
    const afterImport=await others(X);
    const p=await open(X,[X]);const uid=await signIn(p,`ed-${X}`);await setRole(uid,{[X]:'editor'});
    ok(await until(()=>p.evaluate(()=>!boardLocked())),`${X}：切成 firestore、編輯者登入後可以編輯`);
    const id=await addCard(p,`SW ${X} 演練卡片`,'演練的第一行');
    const c=id&&await read(`cards/${X}__${id}`),v1=id&&await read(`cards/${X}__${id}/versions/1`);
    ok(c&&c.version===1&&c.createdBy===uid&&v1&&v1.title===`SW ${X} 演練卡片`,`${X}：新增的卡片寫進 Firestore（卡片＋第 1 版）`);
    const after=await others(X);
    ok(before.h===afterImport.h&&afterImport.h===after.h&&before.n===after.n,`${X}：其他部門的 Firestore 文件在匯入、編輯前後相同（${after.n} 份）`);
    await p.ctx.close();
    /* 另一個還在 github 模式的部門：讀到的就是資料檔複本 */
    const Y=ORDER[(i+1)%ORDER.length];
    const q=await open(Y,[X]);
    const st=await q.evaluate(()=>({src:storeSource(),s:JSON.parse(JSON.stringify(state))}));
    const d=diffPaths(canon(st.s,Y),canon(orig[Y],Y));
    ok(st.src==='github'&&!d.length,`${X} 切換後：${Y}（github 模式）讀到的內容＝資料檔${d.length?'；不同：'+d.join('、'):''}`);
    await q.ctx.close();
  }
  ok(!puts.length,`十個部門的演練都沒有寫 GitHub（${puts.length} 次）`);

  /* ---------- B. 水果部完整回復 ---------- */
  const F='fruit';
  const p=await open(F,[F]);await signIn(p,`ed-${F}`);await until(()=>p.evaluate(()=>!boardLocked()));
  const fid=await p.evaluate(()=>state.events.find(e=>e.name==='SW fruit 演練卡片').id);
  await editCard(p,fid,ev=>{ev.desc='演練的第一行\n第二行（firestore 模式改的）';ev.times.push({id:'tsw1',label:'演練開會',start:'2026-12-01T10:00',end:'2026-12-01T12:00',place:'學生會',toIssue:false})});await settled(p);
  const sid=await addCard(p,'SW 第二張卡片','');
  await p.click('#setBtn');await p.waitForTimeout(700);await p.click('[data-set="labels"]');await p.waitForSelector('[data-newlbl="人"]',{timeout:8000});
  await p.fill('[data-newlbl="人"]','SW 演練標籤');await p.click('[data-x="add"][data-k="人"]');await p.click('[data-x="done"]');await settled(p);
  const lid=await p.evaluate(()=>(state.labels.find(l=>l.name==='SW 演練標籤')||{}).id);
  ok(!!lid&&!!sid&&(await read(`events/${F}__tsw1`))&&(await read(`cards/${F}__${fid}`)).version===2,'水果部：firestore 模式改說明、加時間標記、新增卡片與標籤都寫進 Firestore');
  /* 看板的「匯出備份」 */
  await p.evaluate(()=>{window.showSaveFilePicker=undefined});
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:10000}),p.evaluate(()=>exportBackup())]);
  const boardFile=path.join(TMP,'fruit-board-export.json');await dl.saveAs(boardFile);await p.ctx.close();
  const boardExp=JSON.parse(fs.readFileSync(boardFile,'utf8'));
  /* 命令列的匯出 */
  const cliFile=path.join(TMP,'fruit-cli-export.json');
  const cr=spawnSync(process.execPath,[path.join(ROOT,'backend/migrate/cli.js'),'--emulator','--export=fruit',`--out=${cliFile}`],{cwd:path.join(ROOT,'backend'),env:process.env,encoding:'utf8'});
  const cliExp=cr.status===0?JSON.parse(fs.readFileSync(cliFile,'utf8')):null;
  const de=cliExp?diffPaths(canon(boardExp,F),canon(cliExp,F)):['命令列失敗'];
  ok(!de.length,`看板「匯出備份」＝命令列 --export${de.length?'；不同：'+de.join('、'):''}`);
  ok(!('minutes' in boardExp)&&!('sync' in boardExp)&&!('pwKdf' in boardExp)&&boardExp.members.every(m=>!('kdf' in m)&&!('tok' in m)),'匯出的備份沒有只在 GitHub 模式有的欄位（會議紀錄、雲端設定、密碼）');
  /* 切回 github（測試設定）：GitHub API 用 route 模擬，資料檔＝切換前的複本 */
  const fileB64=fs.readFileSync(path.join(TMP,pathOf(F))).toString('base64');const ghPuts=[];
  const gh=r=>{const q=r.request(),u=q.url();
    if(q.method()==='PUT'){ghPuts.push({url:u,body:JSON.parse(q.postData())});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:{sha:'rehearsal-sha-2'}})})}
    if(u.includes(`/contents/${pathOf(F)}`))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sha:'rehearsal-sha-1',content:fileB64,encoding:'base64'})});
    if(u.includes('/commits'))return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    r.fulfill({status:404,body:'{}'})};
  const g=await open(F,[],{repo:true,gh});
  ok(await g.evaluate(()=>storeSource()==='github'&&cloudOn()&&cloud.sha==='rehearsal-sha-1'),'水果部切回 github：讀到 GitHub 上（模擬）的資料檔');
  await g.setInputFiles('#importFile',boardFile);await g.waitForSelector('#dlg[open]',{timeout:8000});await dlgAct(g,'ok');
  await until(()=>ghPuts.length>0,10000);await g.waitForTimeout(500);
  const put=ghPuts[0],restored=put?JSON.parse(Buffer.from(put.body.content,'base64').toString('utf8')):null;
  ok(ghPuts.length===1&&put.url.endsWith(`/contents/${pathOf(F)}`)&&put.body.sha==='rehearsal-sha-1'&&/Board-Log: 1/.test(put.body.message),'匯入備份：寫回 GitHub 一次（data-fruit.json，帶原本的 sha 與編輯紀錄）');
  const dr=restored?diffPaths(canon(restored,F),canon(cliExp,F)):['沒有 PUT'];
  ok(!dr.length,`寫回的內容＝從 Firestore 匯出的內容${dr.length?'；不同：'+dr.join('、'):''}`);
  /* 寫回的內容拿掉 firestore 模式的修改＝切換前的資料檔；修改本身都在 */
  if(restored){
    const ev=restored.events.find(e=>e.id===fid),ev2=restored.events.find(e=>e.id===sid);
    ok(ev&&ev.desc==='演練的第一行\n第二行（firestore 模式改的）'&&ev.times.length===1&&ev.times[0].start==='2026-12-01T10:00'&&ev2&&restored.labels.some(l=>l.id===lid&&l.name==='SW 演練標籤'),'寫回的內容有 firestore 模式的修改（說明、時間標記、新卡片、標籤）');
    const base={...restored,events:restored.events.filter(e=>e.id!==fid&&e.id!==sid),labels:restored.labels.filter(l=>l.id!==lid)};
    const db2=diffPaths(canon(base,F),canon(orig[F],F));
    ok(!db2.length,`寫回的內容拿掉這些修改＝切換前的資料檔${db2.length?'；不同：'+db2.join('、'):''}`);
    ok(stable(restored.sync)===stable(orig[F].sync)&&stable(restored.pwKdf)===stable(orig[F].pwKdf)&&stable(restored.minutes||[])===stable(orig[F].minutes||[]),'只在 GitHub 模式有的欄位（雲端設定與權杖、共用密碼、會議紀錄）沿用原本的值');
  }
  await g.ctx.close();

  ok(!errs.length,`沒有頁面錯誤 ${errs.join(' | ')}`);
  const still=depts.every(d=>sha(fs.readFileSync(path.join(ROOT,d.path)))===repoHash[d.path]);
  const copies=depts.every(d=>sha(fs.readFileSync(path.join(TMP,d.path)))===repoHash[d.path]);
  ok(still&&copies,'repo 裡的資料檔與暫存複本都沒有被改過');
  await b.close();await t.cleanup();srv.close();
  console.log(`用時 ${Math.round((Date.now()-t0)/1000)} 秒`);
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
