/* 02D D-a 網頁匯入頁（會長室管理 → 匯入，core/js/migrate-web.js＋migrate-core.js）與 D-c 匯出全部資料：
   用 Auth 模擬器＋Firestore 模擬器、正式規則。網站設定成 github.io 的 repo（dept/config.js 的 data.owner／repo 換成測試值），
   GitHub API 用 route 回應：最新 commit＝固定的 SHA、檔案內容＝repo 裡的資料檔（只讀）。
   1. 凍結中的部門（水果部）：未登入看到「暫停編輯」＋登入；一般登入者、部門管理員沒有會長室管理
   2. 總管理員：會長室管理 → 匯入 → 水果部 → 筆數報告每一列相同、V1～V6 通過、結果通過；commit SHA 與 SHA-256 跟資料檔一樣；批次 done
   3. 再匯入一次：寫入 0、衝突 0，水果部的文件前後完全相同（重跑結果不變）
   4. 權益部（資料最多）從頁面匯入：通過；命令列的 deptReport 也通過
   5. 不是總管理員：直接呼叫匯入被規則拒絕（沒有寫進任何東西）；讀不到資料檔時顯示錯誤、不寫入
   6. 匯出全部資料：按鈕存出一個 JSON（各集合文件、批次資訊、每個部門的 schemaVersion 13 檔＝命令列 exportDept）；不是總管理員讀不到 L4
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');const crypto=require('crypto');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8306,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board',SHA='0123456789abcdef0123456789abcdef01234567';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,y)=>(o[y]=x[y],o),{}):x);

(async()=>{
  await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  const {initializeTestEnvironment}=breq('@firebase/rules-unit-testing');const firebase=breq('firebase/compat/app');breq('firebase/compat/firestore');
  const [h,pt]=EMU.split(':');
  const t=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:h,port:+pt,rules:fs.readFileSync(path.join(ROOT,'backend/firestore.rules'),'utf8')}});
  await t.clearFirestore();
  await fetch(`http://${AEMU}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
  const TS=firebase.firestore.Timestamp;
  const admin=fn=>t.withSecurityRulesDisabled(async c=>fn(c.firestore()));
  const q=async fn=>{let v;await admin(async d=>{v=await fn(d)});return v};   /* 規則停用下讀，回傳 fn 的結果 */
  const read=async p=>{let v;await admin(async d=>{const s=await d.doc(p).get();v=s.exists?s.data():null});return v};
  const setRole=(uid,depts,sup=false)=>admin(d=>d.doc(`roles/${uid}`).set({super:sup,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  /* 一個部門的看板文件（不含遷移批次、稽核紀錄）：前後比對 */
  const deptDocs=async dept=>{const out={};await admin(async d=>{
    for(const c of ['cards','events','issues','weeks','labels','legacyIdentities']){for(const s of (await d.collection(c).where('deptId','==',dept).get()).docs){out[`${c}/${s.id}`]=s.data();
      if(c==='cards')for(const v of (await d.collection(`cards/${s.id}/versions`).get()).docs)out[`cards/${s.id}/versions/${v.id}`]=v.data()}}
    for(const p of [`deptSettings/${dept}`,`departments/${dept}`]){const s=await d.doc(p).get();if(s.exists)out[p]=s.data()}});
    return {n:Object.keys(out).length,h:crypto.createHash('sha256').update(stable(out)).digest('hex')}};
  const fileSha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8');
  const gh={commits:0,files:[]};
  const open=async(dept,{frozen=['fruit'],ghFail=false}={})=>{
    const ctx=await b.newContext({viewport:{width:1000,height:850},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    /* GitHub：只回應讀取（commit、檔案內容）；任何寫入都記下來（應該是 0） */
    const puts=[];await ctx.route('https://api.github.com/**',r=>{const q=r.request(),u=new URL(q.url());
      if(q.method()!=='GET'){puts.push(q.url());return r.fulfill({status:403,body:'{}'})}
      if(ghFail)return r.fulfill({status:500,body:'{}'});
      if(/\/repos\/test-owner\/test-repo\/commits\/main$/.test(u.pathname)){gh.commits++;return r.fulfill({status:200,contentType:'text/plain',headers:{'Access-Control-Allow-Origin':'*'},body:SHA})}
      const m=u.pathname.match(/\/repos\/test-owner\/test-repo\/contents\/(.+)$/);
      if(m&&u.searchParams.get('ref')===SHA&&/^data(-[a-z]+)?\.json$/.test(decodeURIComponent(m[1]))){gh.files.push(decodeURIComponent(m[1]));return r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(ROOT,decodeURIComponent(m[1])))})}
      r.fulfill({status:404,body:'{}'})});
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of frozen)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "frozen"$2`);
      s=s.replace(/data: \{ owner: "", repo: ""/,'data: { owner: "test-owner", repo: "test-repo"');
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    /* 網站上的資料檔不應該被匯入讀到（有 owner／repo 時一律讀 GitHub 的那個 commit） */
    const siteReads=[];await ctx.route(u=>u.origin===BASE&&/^\/data(-[a-z]+)?\.json$/.test(u.pathname),r=>{siteReads.push(r.request().url());r.continue()});
    const p=await ctx.newPage();p.errs=[];p.toasts=[];p.puts=puts;p.siteReads=siteReads;p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&process.env.IMDBG)console.log('CONSOLE',m.text())});
    await p.exposeFunction('__toast',m=>p.toasts.push(m));
    await p.addInitScript(()=>{new MutationObserver(()=>{const t=document.querySelector('#toast');if(t&&t.textContent&&t.classList.contains('show'))window.__toast(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true})});
    await p.goto(`${BASE}/index.html?d=${dept}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1200);
    p.ctx=ctx;return p};
  const signIn=async(p,sub)=>{await p.waitForFunction(()=>acct.ready,null,{timeout:10000});await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    await p.waitForFunction(()=>acct.user&&acct.user.uid,null,{timeout:10000});return p.evaluate(()=>acct.user.uid)};
  const openSet=async p=>{if(!await p.evaluate(()=>setOpen))await p.click('#setBtn');await p.waitForTimeout(700)};
  const setText=p=>p.evaluate(()=>document.querySelector('#setOv .set-inner').innerText);
  const dlg=p=>p.waitForSelector('#dlg[open]',{timeout:8000}).then(()=>p.evaluate(()=>document.querySelector('#dlgForm b').textContent));
  const dlgAct=async(p,a)=>{await p.click(`#dlg [data-act="${a}"]`);await p.waitForTimeout(400)};
  const panel=p=>p.evaluate(()=>{const b=[...document.querySelectorAll('.acct-panel')].filter(x=>!x.hidden).pop();return b?b.innerText:''});
  /* 會長室管理 → 匯入 → 部門 → 確認 → 等報告 */
  const importVia=async(p,dept,first=true)=>{
    if(first){await openSet(p);await p.click('[data-set="council"]');await p.waitForTimeout(800);await p.click('[data-hub="import"]');await p.waitForSelector(`[data-imp="${dept}"]`,{timeout:8000})}
    if(first)await p.click(`[data-imp="${dept}"]`);else await p.click('.acct-panel [data-run]');
    if(first){await dlg(p);await dlgAct(p,'delete')}
    await until(async()=>/結果：|失敗（|讀不到|沒有權限/.test(await panel(p)),60000);
    return panel(p)};

  /* ---------- 1. 凍結中的部門：登入入口、誰看得到會長室管理 ---------- */
  const su=await open('fruit');
  await openSet(su);{const s=await setText(su);ok(s.includes('暫停編輯')&&s.includes('用 Google 登入'),'凍結中、未登入：設定頁有「暫停編輯」與 Google 登入');}
  const suUid=await signIn(su,'su');
  {const g=await open('fruit');const gUid=await signIn(g,'gen');await setRole(gUid,{fruit:'admin'});await g.waitForTimeout(1500);await openSet(g);
    /* ui-08：角色不再寫在帳號列下（列下不放小字），改看帳號頁最上面（.acct-me，角色膠囊「水果部・管理員」） */
    const s=await setText(g);await g.click('#setOv [data-set="acct"]');await g.waitForTimeout(800);
    const me=await g.evaluate(()=>{const e=document.querySelector('#setOv .set-pane .acct-me');return e?e.innerText:''});
    ok(!s.includes('會長室管理')&&me.includes('水果部・管理員'),'凍結中：部門管理員登入後沒有會長室管理（只有總管理員）');
    ok(await g.evaluate(()=>boardLocked()&&storeSource()==='frozen'),'凍結中：登入後看板照舊唯讀');
    await g.ctx.close();}
  await setRole(suUid,{},true);
  ok(await until(async()=>(await setText(su)).includes('會長室管理'),8000),'總管理員：凍結中的部門設定頁有會長室管理');

  /* ---------- 2. 總管理員從頁面匯入水果部 ---------- */
  const before=await deptDocs('fruit');
  ok(before.n===0,'匯入前：模擬器裡沒有水果部的資料');
  const reads0=su.siteReads.length;
  const t1=await importVia(su,'fruit');
  ok(t1.includes('結果：通過'),'水果部：結果通過');
  ok(t1.includes(`test-owner/test-repo@main · commit ${SHA.slice(0,12)}`)&&t1.includes(fileSha('data-fruit.json')),'水果部：報告上的 repo＠分支是 dept/config.js 設定的（不是資料檔裡的 sync）、commit 是最新的、SHA-256＝資料檔的雜湊');
  {const rows=await su.evaluate(()=>[...document.querySelectorAll('.acct-panel .imp-tbl tbody tr')].map(r=>[...r.cells].map(c=>c.textContent)));
    ok(rows.length===9&&rows.every(r=>r[3]==='相同'&&r[1]===r[2]),`水果部：筆數報告 9 列都相同（${rows.map(r=>r[0]+r[1]).join('、')}）`);}
  ok(['V1','V2','V3','V4','V6'].every(v=>t1.includes(v))&&!t1.includes('失敗\nV'),'水果部：V1～V6 通過');
  ok(su.siteReads.length===reads0&&gh.files.includes('data-fruit.json'),'匯入讀的是 GitHub 那個 commit 的資料檔（沒有讀網站上的檔案）');
  ok(su.puts.length===0,'沒有寫 GitHub');
  const mig=await q(async d=>(await d.collection('migrations').get()).docs.map(x=>({id:x.id,...x.data()})));
  ok(mig.length===1&&mig[0].status==='done'&&mig[0].sourceCommit===SHA&&mig[0].fileHashes.fruit===fileSha('data-fruit.json')&&mig[0].startedBy===suUid,'批次：done、記下 commit 與資料檔雜湊、總管理員');
  const after1=await deptDocs('fruit');
  ok(after1.n>=2,`匯入後：水果部有 ${after1.n} 份文件（部門、部門設定）`);

  /* ---------- 3. 重跑：結果不變 ---------- */
  const t2=await importVia(su,'fruit',false);
  ok(t2.includes('結果：通過')&&/寫入 0 · 跳過 \d+ · 衝突 0/.test(t2),`再匯入一次：寫入 0、衝突 0（${(t2.match(/寫入[^\n]*/)||[''])[0]}）`);
  const after2=await deptDocs('fruit');
  ok(after2.h===after1.h&&after2.n===after1.n,'再匯入一次：水果部的文件前後完全相同');
  ok((await q(async d=>(await d.collection('migrations').get()).docs.map(x=>x.data().status))).every(s=>s==='done'),'兩個批次都是 done');

  /* ---------- 4. 權益部（資料最多）：從頁面匯入、命令列的報告也通過 ---------- */
  await su.click('.acct-panel [data-back]');await su.waitForSelector('[data-imp="rights"]');
  await su.click('[data-imp="rights"]');ok((await dlg(su))==='匯入 權益部（還沒凍結）','權益部：確認的標題標出還沒凍結');await dlgAct(su,'delete');
  await until(async()=>/結果：|失敗（|讀不到|沒有權限/.test(await panel(su)),90000);const t3=await panel(su);
  {const rows=await su.evaluate(()=>[...document.querySelectorAll('.acct-panel .imp-tbl tbody tr')].map(r=>[...r.cells].map(c=>c.textContent)));
    ok(t3.includes('結果：通過')&&rows.find(r=>r[0].startsWith('卡片'))[1]===String(JSON.parse(fs.readFileSync(path.join(ROOT,'data.json'),'utf8')).events.length),'權益部（還沒凍結，確認時標出）：卡片數＝資料檔的筆數，匯入通過');   /* release-03：資料會增加，不寫死筆數 */}
  {const mig=await import(path.join(ROOT,'backend/migrate/run.js'));
    const r=await mig.deptReport(t.authenticatedContext(suUid,{email:'su@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore(),mig.loadSources({dept:'rights'}),'rights');
    ok(r.ok,'權益部：命令列的筆數報告（同一份 migrate-core）也通過');}

  /* ---------- 5. 不是總管理員：規則拒絕；讀不到資料檔 ---------- */
  {const p=await open('fruit');const uid=await signIn(p,'adm2');await setRole(uid,{rights:'admin',fruit:'admin'});await p.waitForTimeout(1200);
    const n0=(await q(async d=>(await d.collection('migrations').get()).size));
    const r=await p.evaluate(async()=>{const B=await migLoad();try{await B.importDept(CFG.firebase,impRepo(),BOARD_DEPTS,'works');return 'ok'}catch(e){return e.code||e.message}});
    const n1=(await q(async d=>(await d.collection('migrations').get()).size));
    ok(r==='permission-denied'&&n1===n0&&(await deptDocs('works')).n===0,`部門管理員直接呼叫匯入：規則拒絕（${r}），沒有寫進任何東西`);
    const x=await p.evaluate(async()=>{const B=await migLoad();try{await B.exportAll(CFG.firebase,BOARD_DEPTS);return 'ok'}catch(e){return e.code}});
    const ex=await p.evaluate(async()=>{const B=await migLoad();const x=await B.exportAll(CFG.firebase,BOARD_DEPTS);return x.unreadable});
    ok(x==='ok'&&['roles','users','auditLogs','migrations','invitations','roleRequests'].every(c=>ex.includes(c)),`不是總管理員的匯出：讀不到 L4（${ex.join('、')}）`);
    await p.ctx.close();}
  {const p=await open('fruit',{ghFail:true});const uid=await signIn(p,'su');await p.waitForTimeout(1500);
    const n0=(await q(async d=>(await d.collection('migrations').get()).size));
    const s=await importVia(p,'finance');
    ok(s.includes('讀不到資料檔')&&(await q(async d=>(await d.collection('migrations').get()).size))===n0,'讀不到資料檔：顯示錯誤，沒有建立批次、沒有寫入');
    await p.ctx.close();}
  {const p=await open('fruit');await signIn(p,'su');await p.waitForTimeout(1500);
    await openSet(p);await p.click('[data-set="council"]');await p.waitForTimeout(800);await p.click('[data-hub="import"]');await p.waitForSelector('[data-imp="events"]',{timeout:8000});
    /* 寫到一半失敗（route 擋下第二批 commit）：批次改成 failed（不留在 running）；再試一次補完、結果通過 */
    /* 匯入程式一批一批寫（writeBatch 走寫入串流，不能用 route 擋）：在頁面上把第 3 次寫入換成斷線錯誤 */
    await p.evaluate(()=>migLoad());await p.evaluate(()=>{const orig=MigrateCore.runImport;window.__restore=()=>{MigrateCore.runImport=orig};
      MigrateCore.runImport=(io,src,o)=>{let n=0;const c=io.commit;io.commit=w=>++n===3?Promise.reject(Object.assign(new Error('test'),{code:'unavailable'})):c(w);return orig(io,src,o)}});
    await p.click('[data-imp="events"]');await dlg(p);await dlgAct(p,'delete');
    await until(async()=>/結果：|失敗（|讀不到|沒有權限/.test(await panel(p)),60000);const s2=await panel(p);
    const ms=await q(async d=>(await d.collection('migrations').get()).docs.map(x=>x.data()).filter(m=>m.fileHashes&&m.fileHashes.events));
    ok(/沒有連上網路/.test(s2)&&ms.length===1&&ms[0].status==='failed',`寫到一半失敗：顯示錯誤、批次改成 failed（${ms.map(m=>m.status).join(',')}）`);
    await p.evaluate(()=>window.__restore());
    await p.click('.acct-panel [data-run]');await until(async()=>/結果：/.test(await panel(p)),60000);
    ok((await panel(p)).includes('結果：通過'),'寫到一半失敗後按「再試一次」：補完、結果通過');
    await p.ctx.close();}

  /* ---------- 6. 匯出全部資料 ---------- */
  await su.evaluate(()=>{window.__saved=null;saveJsonFile=async(name,doc)=>{window.__saved={name,doc}}});
  await su.evaluate(()=>closeSettings(true));await su.waitForTimeout(300);
  await openSet(su);await su.click('[data-set="council"]');await su.waitForTimeout(800);await su.click('[data-hub="export"]');
  const saved=await until(()=>su.evaluate(()=>window.__saved),20000);
  ok(saved&&/^學生會看板_全部資料_demo-stustsa-board_\d{4}-\d{2}-\d{2}\.json$/.test(saved.name),`匯出全部資料：存成一個 JSON（${saved&&saved.name}）`);
  if(saved){const x=JSON.parse(saved.doc);
    const nCards=['data.json','data-fruit.json','data-events.json'].reduce((n,f)=>n+(JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8')).events||[]).length,0);
    ok(x.collections.cards.length===nCards&&x.collections.versions.length>=42&&x.collections.roles.length>=1&&x.collections.auditLogs.length>0,`匯出：各集合的文件（卡片 ${x.collections.cards.length}、版本 ${x.collections.versions.length}、角色、稽核紀錄）`);
    ok(x.batches.length===5&&x.batches.filter(b=>b.status==='done').length===4&&x.batches.some(b=>b.status==='failed')&&x.batches.every(b=>b.sourceCommit===SHA),`匯出：批次資訊（${x.batches.length} 批：done 4、中途失敗的 failed 1，都有來源 commit）`);
    ok(x.unreadable.includes('bookings')&&x.unreadable.includes('busyBlocks')&&!x.unreadable.includes('roles'),`匯出：讀不到的集合列出（${x.unreadable.join('、')}）`);
    const mig=await import(path.join(ROOT,'backend/migrate/run.js'));const db=t.authenticatedContext(suUid,{email:'su@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
    const strip=s=>{const o=JSON.parse(JSON.stringify(s));delete o.savedAt;return o};
    let same=0;for(const d of ['rights','fruit','works']){if(stable(strip(x.boards[d]))===stable(strip(await mig.exportDept(db,d))))same++}
    ok(same===3&&x.boards.rights.schemaVersion===13,'匯出：每個部門的 schemaVersion 13 檔＝命令列 exportDept（權益部、水果部、還沒匯入的工務部）');
    ok(!/"(sync|tokenAll|tokenEnc|tok|kdf|pwKdf|pwHash)":/.test(saved.doc),'匯出：沒有權杖、密碼欄位');}
  ok(su.errs.length===0,`沒有頁面錯誤${su.errs.length?'：'+su.errs.join(' | '):''}`);

  await b.close();srv.close();await t.cleanup();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
