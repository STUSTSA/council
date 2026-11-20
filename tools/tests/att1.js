/* 點名（秘書處端，2026-11-21，07 第一個 PR）：Auth 模擬器＋Firestore 模擬器、正式規則；秘書處看板切成 firestore，資料用遷移程式匯入。
   1. 可見性：秘書處編輯者、總管理員看得到「點名」卡；別部門的編輯者、一般登入者看不到，直接讀寫被規則拒絕
   2. 匯入名冊：認得部門的收進 attendanceMembers（職稱沒寫＝部員）、認不出的略過、重複的（同部門同姓名）不再加；名字帶 HTML 照字面顯示
   3. 新增場次：attendanceSessions 寫入（名稱、日期、at）；名稱空白＝對話框提示、沒有寫入
   4. 點名：點一下依序 出席→請假→缺席→出席；寫入 attendanceRecords/{場次}_{成員}（決定性 ID、狀態、sessionAt、updatedBy）；快速連點只有一份文件、最後狀態正確
   5. 切換場次：每場各自的結果；重新整理後還在；四個數字對得上
   6. 寫入失敗（沒有權限）：畫面換回原狀並提示
   7. 整理名冊（名冊鈕進整理模式）：一筆一筆新增（驗證、同名擋下、職稱預設部員）、編輯職稱／姓名／部門、「在名冊中」取消＝停用（不刪、紀錄還在、不再出現在點名）、勾回來＝恢復；部門膠囊只看一個部門；複製結果文字；別部門被規則拒絕
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8313,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
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
  const XSS='<img src=x onerror="window.__xss=1">';
  const ps=await open(SECID,'boss');await setRole(await uidOf(ps),{},true);
  const pe=await open(SECID,'sec');const eUid=await uidOf(pe);await setRole(eUid,{secretariat:'editor'});
  const po=await open(SECID,'other');await setRole(await uidOf(po),{rights:'editor'});
  const pv=await open(SECID,'viewer');await setRole(await uidOf(pv),{});
  const vis=p=>p.evaluate(()=>!$('#attPanel').hidden);
  const attOpen=async p=>{await p.evaluate(()=>{AT.key='';render()});await ext(p);await until(()=>p.evaluate(()=>!AT.loading&&AT.members!==undefined||$('#attPanel').hidden),10000);await p.waitForTimeout(300)};
  const list=async c=>{let v=[];await admin(async d=>{v=(await d.collection(c).get()).docs.map(s=>({id:s.id,...s.data()}))});return v};

  /* ---------- 1. 可見性 ---------- */
  for(const [p,r] of [[ps,'super'],[pe,'editor'],[po,'editor'],[pv,'']])await until(()=>p.evaluate(r=>fsRole()===r||(r===''&&fsRole()===''),r));
  await attOpen(ps);await attOpen(pe);await attOpen(po);await attOpen(pv);
  ok(await vis(ps)&&await vis(pe),'總管理員、秘書處編輯者：看得到「點名」');
  ok(!(await vis(po))&&!(await vis(pv)),'別部門編輯者、一般登入者：看不到');
  const denied=await pv.evaluate(async()=>{try{const B=await atMod();await B.members(CFG.firebase);return 'ok'}catch(e){return e.code||e.message}});
  ok(denied==='permission-denied','一般登入者直接讀名冊：被規則拒絕');

  /* ---------- 2. 匯入名冊 ---------- */
  ok(await pe.evaluate(()=>/還沒有名冊/.test($('#attBody').textContent)&&$('#attPanel [data-at=addsess]').disabled),'沒有名冊：提示匯入、「+ 場次」停用');
  const imp=async(p,txt)=>{await p.click('#attPanel [data-at=import]');await p.waitForSelector('#dlgForm [name=txt]');await p.fill('#dlgForm [name=txt]',txt);await p.click('#dlgForm [data-act=ok]')};
  await imp(pe,'權益部 部長 林昱辰\n權益部,部員,黃柏叡\n秘書處 副部長 高苡安\n不存在的部 部員 路人\n財務部 沈小明'+XSS+'\n權益部 部員 黃柏叡');
  await until(()=>pe.evaluate(()=>!AT.busy&&AT.members&&AT.members.length===4));
  let ms=await list('attendanceMembers');
  ok(ms.length===4&&ms.every(m=>m.active===true&&m.updatedBy===eUid),'名冊 4 人（認不出的部門略過、同部門同姓名只留一個）');
  ok(ms.some(m=>m.dept==='財務部'&&m.role==='部員'&&m.name.startsWith('沈小明'))&&ms.some(m=>m.name==='林昱辰'&&m.role==='部長'&&m.dept==='權益部'),'職稱沒寫＝部員；寫了的照寫');
  await pe.click('#attPanel [data-at=roster]');await pe.waitForSelector('#attPanel [data-at=import]');
  await imp(pe,'權益部 部長 林昱辰');await pe.waitForTimeout(600);
  ok((await list('attendanceMembers')).length===4,'再匯入同一個人：不重複');
  ok(await pe.evaluate(()=>window.__xss!==1&&!document.querySelector('#attBody img')),'名字帶 HTML：不執行');
  await pe.click('#attPanel [data-at=import]');await pe.waitForSelector('#dlgForm [name=txt]');await pe.fill('#dlgForm [name=txt]','亂寫一通');await pe.click('#dlgForm [data-act=ok]');await pe.waitForTimeout(300);
  ok(await pe.evaluate(()=>/認不出/.test($('#dlgForm .dlg-err').textContent)),'全部認不出：對話框提示');await pe.click('#dlgForm [data-act=cancel]');await pe.waitForTimeout(300);
  await pe.click('#attPanel [data-at=roster]');await pe.waitForTimeout(200);

  /* ---------- 3. 場次 ---------- */
  await pe.click('#attPanel [data-at=addsess]');await pe.waitForSelector('#dlgForm [name=title]');await pe.fill('#dlgForm [name=title]','');await pe.click('#dlgForm [data-act=ok]');await pe.waitForTimeout(300);
  ok(await pe.evaluate(()=>/請填名稱/.test($('#dlgForm .dlg-err').textContent))&&(await list('attendanceSessions')).length===0,'名稱空白：對話框提示、沒有寫入');
  await pe.fill('#dlgForm [name=title]','第十一次行政會議');await pe.fill('#dlgForm [name=date]','2026-11-18');await pe.click('#dlgForm [data-act=ok]');
  await until(()=>pe.evaluate(()=>!AT.busy&&AT.sessions.length===1));
  const ss=await list('attendanceSessions');
  ok(ss.length===1&&ss[0].title==='第十一次行政會議'&&ss[0].date==='2026-11-18'&&ss[0].at.toMillis()===Date.parse('2026-11-18T00:00:00+08:00')&&ss[0].createdBy===eUid,'場次寫入：名稱、日期、at＝台灣時間當天 00:00');
  const s1=ss[0].id;

  /* ---------- 4. 點名 ---------- */
  const mid=name=>(ms.find(m=>m.name===name)||{}).id;
  const tap=async(p,id)=>p.click(`#attPanel [data-at=mark][data-id="${id}"]`);
  const rec=async(sid,m)=>(await list('attendanceRecords')).find(r=>r.id===`${sid}_${m}`);
  ms=await list('attendanceMembers');const lin=mid('林昱辰'),hua=mid('黃柏叡'),gao=mid('高苡安');
  await tap(pe,lin);await until(()=>rec(s1,lin));
  let r=await rec(s1,lin);
  ok(r&&r.status==='present'&&r.sessionId===s1&&r.memberId===lin&&r.updatedBy===eUid&&r.sessionAt.toMillis()===ss[0].at.toMillis(),'點一下＝出席；文件 ID＝場次＿成員，帶 sessionAt、updatedBy');
  await pe.waitForTimeout(400);await tap(pe,lin);await until(async()=>(await rec(s1,lin)).status==='leave');
  await tap(pe,lin);await until(async()=>(await rec(s1,lin)).status==='absent');
  await tap(pe,lin);await until(async()=>(await rec(s1,lin)).status==='present');
  ok(true,'再點：請假、缺席、回到出席');
  await tap(pe,hua);await tap(pe,hua);await tap(pe,hua);await tap(pe,hua);await tap(pe,hua);   /* 快速連點五下：出席→請假→缺席→出席→請假 */
  await pe.waitForTimeout(1500);
  r=await rec(s1,hua);const nrec=(await list('attendanceRecords')).filter(x=>x.memberId===hua).length;
  ok(r&&r.status==='leave'&&nrec===1,'快速連點五下：只有一份文件，最後是請假');
  ok(await pe.evaluate(h=>$(`#attPanel [data-id="${h}"]`).classList.contains('lv'),hua),'畫面同步：請假＝外框');
  const sum=await pe.evaluate(()=>[...document.querySelectorAll('#attPanel .at-sum b')].map(x=>+x.textContent));
  ok(sum.join()==='1,1,0,2','四個數字：出席 1、請假 1、缺席 0、還沒點 2（'+sum+'）');

  /* ---------- 5. 兩個場次 ---------- */
  await pe.click('#attPanel [data-at=addsess]');await pe.waitForSelector('#dlgForm [name=title]');await pe.fill('#dlgForm [name=title]','臨時會議');await pe.fill('#dlgForm [name=date]','2026-11-25');await pe.click('#dlgForm [data-act=ok]');
  await until(()=>pe.evaluate(()=>!AT.busy&&AT.sessions.length===2));
  ok(await pe.evaluate(()=>AT.sessions[0].title==='臨時會議'&&AT.sel===AT.sessions[0].id&&!document.querySelector('#attPanel .at-m.on, #attPanel .at-m.lv')),'新場次排最前面並自動選取；結果是空的');
  await tap(pe,gao);await tap(pe,gao);await tap(pe,gao);await until(async()=>{const x=(await list('attendanceRecords')).find(y=>y.memberId===gao);return x&&x.status==='absent'});
  await pe.click(`#attPanel [data-at=pick][data-id="${s1}"]`);await until(()=>pe.evaluate(h=>AT.sel&&AT.recs[h]==='leave',hua));
  ok(await pe.evaluate(g=>!AT.recs[g],gao),'切回第一場：第二場的缺席不會混進來');
  await pe.reload();await pe.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});
  await until(()=>pe.evaluate(()=>acct.user&&acct.roles!==undefined&&storeFsBase));await attOpen(pe);
  ok(await pe.evaluate(()=>AT.sessions.length===2&&Object.keys(AT.recs).length===(AT.sel?AT.recs&&Object.keys(AT.recs).length:0)),'重新整理後場次還在');
  ok((await list('attendanceRecords')).length===3,'共 3 份點名紀錄（第一場 2、第二場 1）');

  /* ---------- 6. 寫入失敗與沒有權限 ---------- */
  const werr=await po.evaluate(async s=>{try{const B=await atMod();await B.mark(CFG.firebase,{id:s,date:'2026-11-18'},'x','present');return 'ok'}catch(e){return e.code||e.message}},s1);
  ok(werr==='permission-denied'&&!(await list('attendanceRecords')).some(x=>x.memberId==='x'),'別部門編輯者直接寫點名紀錄：被規則拒絕');
  await pe.evaluate(()=>{window.__orig=BoardAttendance.mark;BoardAttendance.mark=async()=>{throw Object.assign(new Error('x'),{code:'permission-denied'})}});
  pe.toasts.length=0;await tap(pe,lin);await pe.waitForTimeout(600);
  ok(await pe.evaluate(g=>!AT.recs[g]&&!$(`#attPanel [data-id="${g}"]`).classList.contains('on'),lin)&&pe.toasts.some(m=>/沒有權限/.test(m)),'寫入失敗：畫面換回原狀、提示沒有權限');

  /* ---------- 7. 整理名冊與複製結果 ---------- */
  await pe.evaluate(()=>{BoardAttendance.mark=window.__orig});
  const edit1=async id=>{await pe.click(`#attPanel [data-at=edit1][data-id="${id}"]`);await pe.waitForSelector('#dlgForm [name=name]')};
  await pe.click('#attPanel [data-at=roster]');await pe.waitForSelector('#attPanel [data-at=edit1]');
  ok(await pe.evaluate(()=>document.querySelectorAll('#attPanel [data-at=edit1]').length===4&&!document.querySelector('#attPanel [data-at=mark]')&&!!document.querySelector('#attPanel [data-at=add]')),'整理名冊：列出全部 4 人、點人是編輯（不是點名）、有「+ 成員」');
  /* 一筆一筆新增 */
  await pe.click('#attPanel [data-at=add]');await pe.waitForSelector('#dlgForm [name=name]');await pe.click('#dlgForm [data-act=ok]');await pe.waitForTimeout(300);
  ok(await pe.evaluate(()=>/請填姓名/.test($('#dlgForm .dlg-err').textContent)),'新增成員：姓名空白＝提示');
  await pe.fill('#dlgForm [name=name]','林昱辰');
  await pe.click('#dlgForm [data-act=ok]');await pe.waitForTimeout(300);
  ok(await pe.evaluate(()=>/已經有同名/.test($('#dlgForm .dlg-err').textContent))&&(await list('attendanceMembers')).length===4,'新增成員：同部門同姓名＝提示、沒有寫入');
  await pe.fill('#dlgForm [name=name]','陳新人<u>X</u>');await pe.fill('#dlgForm [name=role]','');await pe.click('#dlgForm [data-act=ok]');
  await until(()=>pe.evaluate(()=>!AT.busy&&AT.members.length===5));
  const nm=(await list('attendanceMembers')).find(m=>m.name.startsWith('陳新人'));
  ok(nm&&nm.role==='部員'&&nm.active===true&&nm.updatedBy===eUid&&nm.dept===(await pe.evaluate(()=>AT.dept||BOARD_DEPTS[0].name)),'新增成員：職稱沒填＝部員、寫入名冊');
  ok(await pe.evaluate(()=>!document.querySelector('#attPanel .at-m u')&&/陳新人<u>X<\/u>/.test(document.querySelector('#attPanel').textContent)),'新增的名字帶 HTML：照字面顯示、不當標籤');
  /* 編輯：改職稱與姓名 */
  await edit1(gao);await pe.fill('#dlgForm [name=role]','部長');await pe.fill('#dlgForm [name=name]','高苡安二');await pe.click('#dlgForm [data-act=ok]');
  await until(()=>pe.evaluate(g=>AT.members.find(m=>m.id===g).name==='高苡安二',gao));
  let gm=(await list('attendanceMembers')).find(m=>m.id===gao);
  ok(gm.role==='部長'&&gm.name==='高苡安二'&&gm.dept===ms.find(m=>m.id===gao).dept&&gm.active===true,'編輯：改職稱、姓名（部門不變）');
  /* 編輯：換部門 */
  const deptTo=await pe.evaluate(g=>BOARD_DEPTS.map(d=>d.name).find(n=>n!==AT.members.find(m=>m.id===g).dept),gao);
  await edit1(gao);await pe.evaluate(n=>{const c=document.querySelector('#dlgForm .csel');c.querySelector('.csel-btn').click()},deptTo);
  await pe.waitForSelector('#dlgForm .csel-list:not([hidden])');await pe.evaluate(n=>{[...document.querySelectorAll('#dlgForm .csel-list [role=option]')].find(o=>o.textContent.trim()===n).click()},deptTo);
  await pe.click('#dlgForm [data-act=ok]');await until(()=>pe.evaluate(({g,n})=>AT.members.find(m=>m.id===g).dept===n,{g:gao,n:deptTo}));
  ok((await list('attendanceMembers')).find(m=>m.id===gao).dept===deptTo,'編輯：換部門');
  /* 停用／恢復（編輯視窗的「在名冊中」） */
  await edit1(gao);await pe.evaluate(()=>document.querySelector('#dlgForm input[name=active]').click());await pe.click('#dlgForm [data-act=ok]');
  await until(()=>pe.evaluate(g=>AT.members.find(m=>m.id===g).active===false,gao));
  gm=(await list('attendanceMembers')).find(m=>m.id===gao);
  ok(gm.active===false&&gm.updatedBy===eUid&&(await list('attendanceMembers')).length===5,'取消「在名冊中」＝停用（文件還在）');
  ok(await pe.evaluate(g=>document.querySelector(`#attPanel [data-id="${g}"]`).classList.contains('off'),gao),'整理模式：停用的人淡色、標「停用中」');
  ok(!!(await list('attendanceRecords')).find(x=>x.memberId===gao),'過去的點名紀錄不動');
  /* 部門膠囊 */
  const dcount=await pe.evaluate(()=>[...document.querySelectorAll('#attPanel .at-dept .wk-d')].length);
  ok(dcount>=3,'部門膠囊：全部＋各部門（'+dcount+'）');
  await pe.evaluate(()=>document.querySelectorAll('#attPanel .at-dept .wk-d')[1].click());await pe.waitForTimeout(200);
  ok(await pe.evaluate(()=>{const d=AT.dept;return !!d&&[...document.querySelectorAll('#attPanel .at-h')].length===1&&document.querySelector('#attPanel .at-h').textContent.startsWith(d)}),'點部門膠囊：只列那個部門');
  await pe.evaluate(()=>document.querySelectorAll('#attPanel .at-dept .wk-d')[0].click());
  await pe.click('#attPanel [data-at=roster]');await pe.waitForTimeout(200);
  ok(await pe.evaluate(g=>!document.querySelector(`#attPanel [data-id="${g}"]`)&&!!document.querySelector('#attPanel [data-at=mark]'),gao),'離開整理模式：回到點名、停用的人不在');
  const txt=await pe.evaluate(()=>atText());
  ok(/第十一次行政會議|臨時會議/.test(txt)&&/還沒點：/.test(txt)&&!/高苡安/.test(txt),'複製結果文字：含場次與名單，不含停用的人');
  const dn=await po.evaluate(async()=>{try{const B=await atMod();await B.updateMember(CFG.firebase,'x',{name:'a',dept:'b',role:'c',active:false});return 'ok'}catch(e){return e.code||e.message}});
  ok(dn==='permission-denied','別部門編輯者直接改名冊：被規則拒絕');
  await pe.click('#attPanel [data-at=roster]');await pe.waitForSelector('#attPanel [data-at=edit1]');await edit1(gao);
  await pe.evaluate(()=>document.querySelector('#dlgForm input[name=active]').click());await pe.click('#dlgForm [data-act=ok]');
  await until(()=>pe.evaluate(()=>!AT.busy&&AT.members.filter(m=>m.active).length===5));
  ok(await pe.evaluate(()=>AT.members.filter(m=>m.active).length===5),'勾回來＝恢復');
  await pe.click('#attPanel [data-at=roster]');

  ok(![ps,pe,po,pv].some(p=>p.errs.length),'沒有頁面錯誤：'+[ps,pe,po,pv].flatMap(p=>p.errs).join('|'));
  if(process.env.SHOTS){
    await pe.evaluate(()=>{BoardAttendance.mark=window.__orig});await pe.evaluate(()=>atLoad());await pe.waitForTimeout(800);
    for(const [n,w,h,cs] of [['desk',1100,900,'light'],['mob',390,844,'light'],['dark',390,844,'dark']]){
      await pe.setViewportSize({width:w,height:h});await pe.emulateMedia({colorScheme:cs});await pe.waitForTimeout(500);
      await pe.evaluate(()=>document.getElementById('attPanel').scrollIntoView());await pe.waitForTimeout(300);
      await pe.locator('#attPanel').screenshot({path:path.join(process.env.SHOTS,`att_${n}.png`)});
      await pe.click('#attPanel [data-at=roster]');await pe.waitForTimeout(400);await pe.locator('#attPanel').screenshot({path:path.join(process.env.SHOTS,`att_${n}_edit.png`)});await pe.click('#attPanel [data-at=roster]');await pe.waitForTimeout(300)}}
  for(const p of pages)await p.context().close().catch(()=>{});
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
