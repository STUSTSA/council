/* 03 即時回報的原位編輯器（Keep 式，core/js/live.js 的 kpEditorHTML／evLinesHTML／tpHTML 與「原位編輯器」段）＋逐行內容 blocks（store-map.js）。
   firestore 模式驗收：Auth 模擬器＋Firestore 模擬器、正式規則；權益部用遷移程式匯入後切成 firestore。全部用畫面操作（點、打字、自製下拉、時間選取器、點外面）。
   1. 三行純文字存好；第 1、3 行轉成核取，重新載入後正確
   2. 純文字、核取（勾）、時間＋核取各一行，重新載入後各自正確（時間標記的 blockId 指向那一行、名稱＝那一行的文字）
   3. 中間插入一行、刪除一行後，勾選與時間沒有掛錯行
   4. 點外面會儲存並收合（沒改就只收合、不寫入）
   5. 復原這次修改：存回原內容（新的版本）、按了就消失；收合後也消失
   6. 儲存失敗（中途撤權，規則擋下）：保留草稿、不收合、顯示失敗；角色恢復後按「儲存」重試成功
   7. 舊卡片（遷移的只有 desc、02D 舊格式；blocks 沒有行 ID）可讀，每行是純文字；改一行後存成新格式、其他行不變
   8. 跳脫：名稱、行內容、負責人名稱放 <img src=x onerror=…> 與帶引號的字串，沒有執行、原樣顯示
   9. 沒有權限的人只能看：核取框不能按、點一行不會進入編輯；沒有頁面錯誤
   10. 03 審查 P0-1：檢視時切換勾選、行首尾空白、時間行切換勾選後點外面，重新載入後種類、行 ID、timeId、時間事件的 blockId 不變
   執行（會自己開模擬器與網站）：cd backend && npm run test:web
   只連本機模擬器；Firebase SDK 從 backend/node_modules 供應（route 掉 gstatic），不連外。 */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8305,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board',DEPT='rights';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(150)}};
const XSS='<img src=x onerror="window.__xss=1">\'"';

(async()=>{
  await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  const {initializeTestEnvironment}=breq('@firebase/rules-unit-testing');const firebase=breq('firebase/compat/app');breq('firebase/compat/firestore');
  const [h,pt]=EMU.split(':');
  const t=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:h,port:+pt,rules:fs.readFileSync(path.join(ROOT,'backend/firestore.rules'),'utf8')}});
  await t.clearFirestore();
  await fetch(`http://${AEMU}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
  const TS=firebase.firestore.Timestamp;
  const admin=fn=>t.withSecurityRulesDisabled(async c=>fn(c.firestore()));
  const read=async p=>{let v;await admin(async d=>{const s=await d.doc(p).get();v=s.exists?s.data():null});return v};
  const tok=uid=>({sub:uid,user_id:uid,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{}}});
  await admin(d=>d.doc('roles/su').set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedBy:'su',updatedAt:TS.now()}));
  const mig=await import(path.join(ROOT,'backend/migrate/run.js'));
  await mig.runImport(t.authenticatedContext('su',tok('su')).firestore(),firebase.firestore.FieldValue,TS,mig.loadSources({dept:DEPT}),{batch:'kp-test',uid:'su'});

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8');
  const open=async()=>{
    const ctx=await b.newContext({viewport:{width:900,height:900},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc.replace(new RegExp(`(\\{ id: "${DEPT}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.goto(`${BASE}/index.html?d=${DEPT}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1200);
    p.ctx=ctx;return p};
  const signIn=async(p,sub)=>{await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    return p.waitForFunction(()=>acct.user&&acct.user.uid&&storeFsBase,null,{timeout:10000}).then(()=>p.evaluate(()=>acct.user.uid))};
  const setRole=(uid,depts)=>admin(d=>d.doc(`roles/${uid}`).set({super:false,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  const C=id=>`cards/${DEPT}__${id}`;
  /* 卡片在 Firestore 的每一行：[文字, check, 時間 ID（拿掉部門前綴）]；舊格式（每行一個物件）也看得懂 */
  const rows=c=>{const B=c.blocks;if(Array.isArray(B))return B.map(x=>[x.text,x.check??null,x.timeId||null]);return B.id.map((_,n)=>[B.text[n],B.check[n],B.time[n]?B.time[n].replace(`${DEPT}__`,''):null])};
  const evOf=(p,id)=>p.evaluate(id=>{const e=state.events.find(x=>x.id===id);return e&&JSON.parse(JSON.stringify(e))},id);
  const settled=p=>until(()=>p.evaluate(()=>!fsBusy&&!kpBusy()&&storeFsBase&&(!kpSt||kpSt.st!=='saving')),15000).then(()=>sleep(250));
  const box=id=>`.ev[data-ev="${id}"]`;
  /* 打開膠囊（還沒開的話點標題列） */
  const expand=async(p,id)=>{if(!await p.evaluate(s=>document.querySelector(s).open,box(id))){await p.click(`${box(id)}>summary`,{position:{x:30,y:20}});await p.waitForTimeout(700)}};
  const outside=async p=>{await p.click('#evH');await settled(p)};
  const lineSel=(id,n)=>`${box(id)} .kp-lines:not(.kp-frees) .kp-line:nth-child(${n})`;
  const setType=async(p,id,n,k)=>{await p.click(`${lineSel(id,n)} .kp-type .csel-btn`);await p.waitForTimeout(250);await p.click(`${lineSel(id,n)} .csel-opt[data-v="${k}"]`);await p.waitForTimeout(350)};
  /* 新卡片（小表單：名稱、沒有說明）→ 直接儲存 */
  const newCard=async(p,name)=>{await p.click('#addEvent');await p.waitForSelector('#dlg[open]');await p.fill('#dlgForm [name="name"]',name);await p.click('#dlg [data-act="ok"]');await settled(p);
    const id=await p.evaluate(n=>state.events.find(e=>e.name===n).id,name);await expand(p,id);return id};
  /* 原位編輯：點「沒有說明」開始、每一行打字＋Enter */
  const typeLines=async(p,id,lines)=>{await p.click(`${box(id)} [data-kpgo=""]`);await p.waitForTimeout(500);
    for(let i=0;i<lines.length;i++){if(i)await p.keyboard.press('Enter');await p.keyboard.type(lines[i])}};

  const ed=await open();const edUid=await signIn(ed,'kped');await setRole(edUid,{[DEPT]:'editor'});
  await until(()=>ed.evaluate(()=>!boardLocked()&&document.body.classList.contains('authed')));

  /* ---------- 1. 三行純文字 → 第 1、3 行轉成核取 ---------- */
  const k1=await newCard(ed,'KP 三行');
  await typeLines(ed,k1,['甲','乙','丙']);
  ok(await ed.evaluate(id=>editing&&cardEdit==='e:'+id&&!!document.querySelector('.kp'),k1),'點「沒有說明」：直接在原位編輯（有原位編輯器）');
  await outside(ed);
  let c=await read(C(k1));
  ok(JSON.stringify(rows(c))===JSON.stringify([['甲',null,null],['乙',null,null],['丙',null,null]]),`三行純文字存好（${JSON.stringify(rows(c))}）`);
  const ids1=c.blocks.id;
  const b1=await evOf(ed,k1);
  await ed.click(`${box(k1)} [data-kpgo="${b1.blocks[0].id}"]`);await ed.waitForTimeout(400);
  await setType(ed,k1,1,'check');await setType(ed,k1,3,'check');
  await outside(ed);
  await ed.reload();await ed.waitForFunction(()=>typeof storeFsBase!=='undefined'&&storeFsBase&&state.events.length>0,null,{timeout:15000});await ed.waitForTimeout(800);
  const r1=await evOf(ed,k1);c=await read(C(k1));
  ok(JSON.stringify(r1.blocks.map(x=>[x.text,x.check]))===JSON.stringify([['甲',false],['乙',null],['丙',false]])&&JSON.stringify(c.blocks.id)===JSON.stringify(ids1)&&r1.desc==='☐ 甲\n乙\n☐ 丙',
    `重新載入：第 1、3 行是核取（沒勾）、第 2 行純文字、行 ID 不變、desc 攤平（${JSON.stringify(r1.blocks.map(x=>[x.text,x.check]))}）`);
  await until(()=>ed.evaluate(()=>!boardLocked()));

  /* ---------- 2. 純文字、核取（勾）、時間＋核取 ---------- */
  const k2=await newCard(ed,'KP 三種');
  await typeLines(ed,k2,['文字一行','要勾的','開會']);
  await setType(ed,k2,2,'check');await ed.click(`${lineSel(k2,2)} [data-kpck]`);await ed.waitForTimeout(200);
  await setType(ed,k2,3,'time');
  ok(await ed.evaluate(()=>!!document.querySelector('.kp .tp')&&!document.querySelector('.kp input[type=date],.kp input[type=time]')),'換成時間：打開自製時間選取器（沒有原生日期、時間欄）');
  const month=await ed.evaluate(()=>JSON.parse(document.querySelector('.tp').dataset.st).m);
  await ed.click(`.tp [data-tpd="${month}-20"]`);await ed.waitForTimeout(150);await ed.fill('.tp [data-tpf="sh"]','14:00');await ed.fill('.tp [data-tpf="eh"]','15:30');await ed.click('.tp [data-tpok]');await ed.waitForTimeout(300);
  await outside(ed);
  await ed.reload();await ed.waitForFunction(()=>typeof storeFsBase!=='undefined'&&storeFsBase&&state.events.length>0,null,{timeout:15000});await ed.waitForTimeout(800);
  const r2=await evOf(ed,k2);c=await read(C(k2));
  const tid2=r2.blocks[2].timeId,ev2=tid2&&await read(`events/${DEPT}__${tid2}`);
  ok(JSON.stringify(r2.blocks.map(x=>[x.text,x.check,!!x.timeId]))===JSON.stringify([['文字一行',null,false],['要勾的',true,false],['開會',false,true]]),`重新載入：純文字、核取（勾了）、時間＋核取各自正確（${JSON.stringify(r2.blocks.map(x=>[x.text,x.check,!!x.timeId]))}）`);
  ok(ev2&&ev2.blockId===r2.blocks[2].id&&ev2.label==='開會'&&ev2.startRaw===`${month}-20T14:00`&&ev2.endRaw===`${month}-20T15:30`&&c.timeIds.includes(`${DEPT}__${tid2}`)&&c.blocks.time[2]===`${DEPT}__${tid2}`,
    `時間標記：blockId 指向那一行、名稱＝那一行的文字、時間對（${ev2&&JSON.stringify([ev2.blockId,ev2.label,ev2.startRaw,ev2.endRaw])}）`);
  ok(await ed.evaluate(id=>{const li=[...document.querySelectorAll(`.ev[data-ev="${id}"] .kp-vl`)];return li.length===3&&li[1].querySelector('input').checked&&!!li[2].querySelector('.kp-tm')},k2),'檢視：核取框勾著、時間行有時間');
  await until(()=>ed.evaluate(()=>!boardLocked()));

  /* ---------- 3. 中間插入一行、刪除一行：勾選與時間沒有掛錯行 ---------- */
  await expand(ed,k2);
  await ed.click(`${box(k2)} [data-kpgo="${r2.blocks[0].id}"]`);await ed.waitForTimeout(400);
  await ed.keyboard.press('End');await ed.keyboard.press('Enter');await ed.keyboard.type('插入的一行');
  await ed.click(`${lineSel(k2,1)} [data-kpdel]`);await ed.waitForTimeout(300);
  await outside(ed);
  await ed.reload();await ed.waitForFunction(()=>typeof storeFsBase!=='undefined'&&storeFsBase&&state.events.length>0,null,{timeout:15000});await ed.waitForTimeout(800);
  const r3=await evOf(ed,k2);c=await read(C(k2));const ev3=await read(`events/${DEPT}__${tid2}`);
  ok(JSON.stringify(r3.blocks.map(x=>[x.text,x.check,x.timeId]))===JSON.stringify([['插入的一行',null,null],['要勾的',true,null],['開會',false,tid2]])
    &&r3.blocks[1].id===r2.blocks[1].id&&r3.blocks[2].id===r2.blocks[2].id&&ev3&&ev3.blockId===r2.blocks[2].id,
    `插入、刪除後：勾選還在「要勾的」、時間還連在「開會」（行 ID 不變，事件 blockId 不變）（${JSON.stringify(r3.blocks.map(x=>[x.text,x.check,!!x.timeId]))}）`);
  await until(()=>ed.evaluate(()=>!boardLocked()));

  /* ---------- 4. 點外面：儲存並收合；沒改就只收合 ---------- */
  await expand(ed,k1);
  const v4=(await read(C(k1))).version;
  await ed.click(`${box(k1)} [data-kpgo="${r1.blocks[1].id}"]`);await ed.waitForTimeout(300);
  await outside(ed);
  ok(await ed.evaluate(()=>!editing&&!document.querySelector('.kp'))&&(await read(C(k1))).version===v4,'沒改就點外面：只收合、不寫入');
  await ed.click(`${box(k1)} [data-kpgo="${r1.blocks[1].id}"]`);await ed.waitForTimeout(300);
  await ed.keyboard.type('（改）');
  await ed.click('#evH');
  ok(await ed.evaluate(()=>!editing&&!document.querySelector('.kp')),'點外面：馬上收合');
  ok(await until(()=>ed.evaluate(id=>{const s=document.querySelector(`.ev[data-ev="${id}"] .kp-done .kp-st`);return s&&s.dataset.st==='ok'&&s.textContent==='已儲存'},k1)),'儲存回饋：已儲存');
  c=await read(C(k1));ok(c.version===v4+1&&c.blocks.text[1]==='乙（改）','點外面：寫入（新的版本）');

  /* ---------- 5. 復原這次修改 ---------- */
  ok(await ed.evaluate(id=>!!document.querySelector(`.ev[data-ev="${id}"] [data-kpundo]`),k1),'存好後有「復原這次修改」');
  await ed.click(`${box(k1)} [data-kpundo]`);await settled(ed);
  c=await read(C(k1));
  ok(c.version===v4+2&&c.blocks.text[1]==='乙'&&JSON.stringify(c.blocks.check)===JSON.stringify([false,null,false]),`復原：存回修改前的內容（第 ${c.version} 版）`);
  ok(await ed.evaluate(id=>!document.querySelector(`.ev[data-ev="${id}"] [data-kpundo]`)&&document.querySelector(`.ev[data-ev="${id}"] .kp-st`).dataset.st==='ok',k1),'復原後：顯示已儲存、不再有復原鈕');
  /* 收合就消失 */
  await ed.click(`${box(k1)} [data-kpgo="${r1.blocks[1].id}"]`);await ed.waitForTimeout(300);await ed.keyboard.type('x');await outside(ed);
  ok(await ed.evaluate(id=>!!document.querySelector(`.ev[data-ev="${id}"] [data-kpundo]`),k1),'再改一次：又有復原鈕');
  await ed.click(`${box(k1)}>summary`,{position:{x:30,y:20}});await ed.waitForTimeout(900);await expand(ed,k1);
  ok(await ed.evaluate(id=>!document.querySelector(`.ev[data-ev="${id}"] [data-kpundo]`),k1),'收合後再打開：復原鈕消失');
  /* 開始下一次編輯就消失 */
  await ed.click(`${box(k1)} [data-kpgo="${r1.blocks[1].id}"]`);await ed.waitForTimeout(300);await ed.keyboard.press('Backspace');await outside(ed);
  await ed.click(`${box(k1)} [data-kpgo="${r1.blocks[0].id}"]`);await ed.waitForTimeout(300);
  ok(await ed.evaluate(()=>editing&&!document.querySelector('[data-kpundo]')),'開始下一次編輯：復原鈕消失');
  await outside(ed);

  /* ---------- 6. 儲存失敗（中途撤權）：保留草稿、不收合、可以重試 ---------- */
  await expand(ed,k2);
  const r6=await evOf(ed,k2),v6=(await read(C(k2))).version;
  await ed.click(`${box(k2)} [data-kpgo="${r6.blocks[0].id}"]`);await ed.waitForTimeout(300);await ed.keyboard.type('（草稿）');
  await setRole(edUid,{});await until(()=>ed.evaluate(()=>boardLocked()));
  await ed.click('#evH');await settled(ed);
  const f6=await ed.evaluate(id=>({editing,card:cardEdit,kp:!!document.querySelector('.kp'),st:(document.querySelector('.kp-bar .kp-st')||{}).dataset,txt:(document.querySelector('.kp-bar .kp-st')||{}).textContent,
    draft:(document.querySelector(`[data-kptx]`)||{}).value,dlg:!!document.querySelector('#dlg[open]')}),k2);
  ok(f6.editing&&f6.card==='e:'+k2&&f6.kp&&f6.st&&f6.st.st==='fail'&&/儲存失敗/.test(f6.txt)&&f6.draft==='插入的一行（草稿）'&&!f6.dlg,`儲存失敗：不收合、保留草稿、顯示「${f6.txt}」、不跳對話框`);
  ok((await read(C(k2))).version===v6,'儲存失敗：規則擋下、沒有寫入');
  await setRole(edUid,{[DEPT]:'editor'});await until(()=>ed.evaluate(()=>!boardLocked()));
  await ed.click(`${box(k2)} [data-kpsave]`);await settled(ed);
  c=await read(C(k2));
  ok(c.version===v6+1&&c.blocks.text[0]==='插入的一行（草稿）'&&await ed.evaluate(()=>!editing),'角色恢復後再按「儲存」：寫入、收合');

  /* ---------- 7. 舊卡片 ---------- */
  const legacy=await ed.evaluate(()=>{const e=state.events.find(x=>!x.doneAt&&x.desc.includes('\n')&&x.blocks.every(b=>b.check===null));return e&&{id:e.id,desc:e.desc,n:e.desc.split('\n').length}});
  {const lc=legacy&&rows(await read(C(legacy.id)));ok(!!lc&&lc.length===legacy.n&&lc.every(x=>x[1]===null&&x[2]===null)&&lc.map(x=>x[0]).join('\n')===legacy.desc,`遷移的舊卡片（資料檔只有 desc）：每行一個純文字行（${legacy&&legacy.n} 行）`);}
  await expand(ed,legacy.id);
  const lv=await ed.evaluate(id=>{const li=[...document.querySelectorAll(`.ev[data-ev="${id}"] .kp-vl`)];return {n:li.length,boxes:li.filter(x=>x.querySelector('input')).length,txt:li.map(x=>x.querySelector('.kp-tx').textContent).join('\n')}},legacy.id);
  ok(lv.n===legacy.n&&lv.boxes===0&&lv.txt===legacy.desc,`舊卡片：每行顯示成純文字（${lv.n} 行）`);
  /* 02D 遷移的舊格式（每行一個物件），而且沒有行 ID */
  await admin(d=>d.doc(C('kpold')).set({deptId:DEPT,title:'沒有行 ID 的舊卡',blocks:[{text:'第一行'},{text:'第二行'}],timeIds:[],issueId:null,staff:[],labels:[],links:[],report:false,state:'open',
    doneAt:null,deletedAt:null,deletedBy:null,order:999999,version:1,createdAt:TS.now(),createdBy:'x',updatedAt:TS.now(),updatedBy:'x'}));
  await admin(d=>d.doc(`${C('kpold')}/versions/1`).set({cardId:`${DEPT}__kpold`,deptId:DEPT,version:1,title:'沒有行 ID 的舊卡',blocks:[{text:'第一行'},{text:'第二行'}],times:[],state:'open',by:'x',at:TS.now(),imported:false}));
  await ed.reload();await ed.waitForFunction(()=>typeof storeFsBase!=='undefined'&&storeFsBase&&state.events.some(e=>e.id==='kpold'),null,{timeout:15000});await ed.waitForTimeout(800);
  await until(()=>ed.evaluate(()=>!boardLocked()));
  await expand(ed,'kpold');
  ok(await ed.evaluate(()=>[...document.querySelectorAll('.ev[data-ev="kpold"] .kp-vl .kp-tx')].map(x=>x.textContent).join('|')==='第一行|第二行'),'blocks 沒有行 ID 的舊卡片：每行純文字顯示');
  const old=await evOf(ed,'kpold');
  await ed.click(`${box('kpold')} [data-kpgo="${old.blocks[1].id}"]`);await ed.waitForTimeout(300);
  await setType(ed,'kpold',2,'check');await outside(ed);
  c=await read(C('kpold'));
  ok(!Array.isArray(c.blocks)&&JSON.stringify(rows(c))===JSON.stringify([['第一行',null,null],['第二行',false,null]])&&c.blocks.id.every(x=>/^[A-Za-z0-9_-]+$/.test(x)),'改一行後存成新格式（補上行 ID）、其他行不變');

  /* ---------- 8. 跳脫 ---------- */
  await admin(d=>d.doc(`profiles/${edUid}`).set({displayName:'<img src=x onerror=window.__xss=2>"\'',photoURL:null,updatedAt:TS.now()}));
  await ed.evaluate(async()=>{const A=await acctLoad();acct.names=await A.profiles()});
  const k8=await newCard(ed,'KP 跳脫');
  await typeLines(ed,k8,[XSS,'第二行 "引號" \'單引號\'']);
  await ed.fill(`${box(k8)} [data-kptitle]`,XSS);
  await ed.click(`${box(k8)} [data-kpf="staff"] label.chip:has(input[value="${edUid}"])`);await ed.waitForTimeout(300);   /* 03 T7：專員在原位直接勾選 */
  await outside(ed);
  await expand(ed,k8);
  const x8=await ed.evaluate(id=>{const el=document.querySelector(`.ev[data-ev="${id}"]`);
    return {xss:window.__xss,imgs:document.querySelectorAll('#events img,#evDetail img').length,onAttr:[...document.querySelectorAll('#events *')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length,
      title:el.querySelector('summary b').textContent,lines:[...el.querySelectorAll('.kp-vl .kp-tx')].map(x=>x.textContent),staff:[...el.querySelectorAll('.staff-chip')].map(x=>x.textContent)}},k8);
  ok(x8.xss===undefined&&x8.imgs===0&&x8.onAttr===0,`沒有執行、沒有多出 img 或事件屬性（${JSON.stringify({xss:x8.xss,imgs:x8.imgs,on:x8.onAttr})}）`);
  ok(x8.title===XSS&&x8.lines[0]===XSS&&x8.lines[1]==='第二行 "引號" \'單引號\''&&x8.staff[0]==='<img src=x onerror=window.__xss=2>"\'',`名稱、行內容、負責人名稱原樣顯示（${JSON.stringify(x8.staff)}）`);
  await ed.click(`${box(k8)} [data-kpgo="${(await evOf(ed,k8)).blocks[0].id}"]`);await ed.waitForTimeout(400);
  ok(await ed.evaluate(x=>document.querySelector('[data-kptitle]').value===x&&window.__xss===undefined&&!document.querySelector('#events img'),XSS),'編輯中：輸入框的值原樣、沒有執行');
  await outside(ed);
  c=await read(C(k8));ok(c.title===XSS&&c.blocks.text[0]===XSS&&c.staff.includes(edUid),'寫進 Firestore 的是原本的文字');

  /* ---------- 10. 03 審查 P0-1：編輯器裡以 blocks 為準 ----------
     檢視時切換勾選、行首尾空白、時間行切換勾選，點外面存好、重新載入後：種類、行 ID、timeId、時間事件的 blockId 都不變 */
  {
    const reload=async()=>{await ed.reload();await ed.waitForFunction(()=>typeof storeFsBase!=='undefined'&&storeFsBase&&state.events.length>0,null,{timeout:15000});await ed.waitForTimeout(800);await until(()=>ed.evaluate(()=>!boardLocked()))};
    const base=await evOf(ed,k2),ids=base.blocks.map(x=>x.id),tid=base.blocks[2].timeId,texts=base.blocks.map(x=>x.text);
    const check=async(checks,m)=>{await reload();const r=await evOf(ed,k2),c=await read(C(k2)),te=await read(`events/${DEPT}__${tid}`);
      const got=r.blocks.map(x=>[x.id,x.text,x.check,x.timeId]),exp=ids.map((id,n)=>[id,texts[n],checks[n],n===2?tid:null]);
      ok(JSON.stringify(got)===JSON.stringify(exp)&&JSON.stringify(c.blocks.id)===JSON.stringify(ids)&&c.blocks.time[2]===`${DEPT}__${tid}`&&te&&te.blockId===ids[2]&&te.label===texts[2]&&r.desc===StoreDesc(r.blocks),
        `${m}：重新載入後種類、行 ID、timeId、事件 blockId 不變（${JSON.stringify(got)}）`)};
    const StoreDesc=b=>b.map(x=>(typeof x.check==='boolean'?(x.check?'☑ ':'☐ '):'')+x.text).join('\n');
    await expand(ed,k2);
    /* a. 檢視時點核取框（要勾的：勾 → 不勾），點外面 */
    await ed.click(`${box(k2)} .kp-view [data-kpck="${ids[1]}"]`);await ed.waitForTimeout(400);await outside(ed);
    await check([null,false,false],'P0-1 檢視時切換勾選後點外面');
    /* b. 行首、行尾加空白，點外面 */
    await expand(ed,k2);
    await ed.click(`${box(k2)} [data-kpgo="${ids[1]}"]`);await ed.waitForTimeout(400);
    await ed.keyboard.press('Home');await ed.keyboard.type('  ');await ed.keyboard.press('End');await ed.keyboard.type('  ');
    await ed.click(`${box(k2)} [data-kptx="${ids[2]}"]`);await ed.keyboard.press('End');await ed.keyboard.type(' ');
    await outside(ed);
    await check([null,false,false],'P0-1 行首行尾加空白後點外面');
    /* c. 時間行切換勾選，點外面 */
    await expand(ed,k2);
    await ed.click(`${box(k2)} .kp-view [data-kpck="${ids[2]}"]`);await ed.waitForTimeout(400);await outside(ed);
    await check([null,false,true],'P0-1 時間行切換勾選後點外面');
  }

  /* ---------- 9. 沒有權限的人只能看 ---------- */
  const gen=await open();await signIn(gen,'kpgen');await until(()=>gen.evaluate(()=>state.events.length>0));
  await expand(gen,k2);
  const g9=await gen.evaluate(id=>{const el=document.querySelector(`.ev[data-ev="${id}"]`);return {disabled:[...el.querySelectorAll('[data-kpck]')].every(x=>x.disabled),go:el.querySelectorAll('[data-kpgo]').length}},k2);
  await gen.click(`${box(k2)} .kp-vl:nth-child(1) .kp-tx`);await gen.waitForTimeout(300);
  ok(g9.disabled&&g9.go===0&&await gen.evaluate(()=>!editing),`一般登入者：核取框不能按、點一行不會進入編輯（${JSON.stringify(g9)}）`);
  ok(!ed.errs.length&&!gen.errs.length,`沒有頁面錯誤（${[...ed.errs,...gen.errs].join(' | ')}）`);

  await b.close();await t.cleanup();srv.close();
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
