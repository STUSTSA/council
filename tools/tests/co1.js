/* 跨部門共編（2026-11-23）：Auth 模擬器＋Firestore 模擬器、正式規則。
   1. 權益部部長在卡片按「共編」勾選活動部 → 卡片 co.invite；活動部部長在「共編」區同意 → co.depts；活動部編輯者按「編輯」改名稱與內容 → 卡片與新版本寫入
   2. 會長（總管理員）在別部門的卡片「申請共編」→ 權益部部長在「共編」區同意 → co.depts 加上 president
   3. 活動部編輯者不能替自己部門同意；被收回之後「共編」區消失；標題裡的 HTML 不會變成標籤
   執行：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8316,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(!c)fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
const ALL=['rights','president','secretariat','marketing','finance','events','affairs','pr','works'];

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
  await mig.runImport(t.authenticatedContext('su',tok('su')).firestore(),firebase.firestore.FieldValue,TS,mig.loadSources(),{batch:'co-test',uid:'su'});
  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');
  const open=async(dept,sub)=>{
    const ctx=await b.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of ALL)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.goto(`${BASE}/index.html?d=${dept}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});
    await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
      await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    await p.waitForFunction(()=>acct.user&&acct.roles!==undefined&&storeFsBase,null,{timeout:15000});
    await p.waitForTimeout(800);return p};
  const setRole=(uid,depts,sup=false)=>admin(d=>d.doc(`roles/${uid}`).set({super:sup,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  const uidOf=p=>p.evaluate(()=>acct.user.uid);
  const card=async id=>{let v;await admin(async d=>{v=(await d.doc('cards/'+id).get()).data()});return v};
  const rows=p=>p.evaluate(()=>[...document.querySelectorAll('#coPanel:not([hidden]) .mp-row')].map(r=>r.textContent));
  const dlgOk=async p=>{await p.waitForSelector('#dlg[open]');await p.click('#dlg [data-act=ok]');await p.waitForFunction(()=>!document.querySelector('#dlg[open]'))};

  const rt=await open('rights','rtadm');await setRole(await uidOf(rt),{rights:'admin'});
  const evA=await open('events','evadm');await setRole(await uidOf(evA),{events:'admin'});
  const evE=await open('events','eved');await setRole(await uidOf(evE),{events:'editor'});
  const pres=await open('president','boss');await setRole(await uidOf(pres),{},true);
  for(const p of [rt,evA,evE,pres])await until(()=>p.evaluate(()=>acct.roles!==undefined&&storeFsBase&&(fsWriter())));
  /* 權益部的一張進行中卡片（標題帶 HTML，確認有跳脫） */
  const cid=await rt.evaluate(()=>{const e=state.events.find(x=>!x.doneAt);return StoreMap.nid(CFG.deptId,e.id)}),uiId=await rt.evaluate(()=>state.events.find(x=>!x.doneAt).id);
  await admin(d=>d.doc('cards/'+cid).update({title:'共編測試<b id=zz>粗</b>'}));
  await rt.evaluate(()=>storeFsLoad(true).then(r=>{storeFsUse(r);render()}));
  ok(await rt.evaluate(id=>!!coBtnHTML(state.events.find(e=>e.id===id))&&/data-coshare/.test(coBtnHTML(state.events.find(e=>e.id===id))),uiId),'權益部部長看得到卡片上的「共編」鈕');
  ok(await evE.evaluate(()=>coBtnHTML({id:'x',doneAt:''})==='' ),'編輯者看不到「共編」鈕');

  /* 1. 邀請 → 同意 → 共編改內容 */
  rt.evaluate(id=>coShare(id),uiId);
  await rt.waitForSelector('#dlg[open] input[value=events]');
  if(process.env.SHOTS){await rt.waitForTimeout(600);await rt.locator('#dlg').screenshot({path:path.join(process.env.SHOTS,'co_dialog.png')})}
  await rt.check('#dlg input[value=events]',{force:true});await dlgOk(rt);
  ok(await until(async()=>JSON.stringify(((await card(cid)).co||{}).invite)===JSON.stringify(['events'])),'邀請活動部：co.invite＝[events]');
  await evA.reload();await evA.waitForFunction(()=>acct.user&&storeFsBase,null,{timeout:15000});await evA.waitForTimeout(800);
  await until(async()=>(await rows(evA)).length);
  let r=await rows(evA);ok(r.length===1&&/權益部 邀請你們共編/.test(r[0])&&r[0].includes('共編測試<b id=zz>粗</b>'),'活動部部長的「共編」區：邀請列，標題的 HTML 原樣顯示：'+r[0]);
  ok(!(await evA.evaluate(()=>!!document.querySelector('#coList b#zz'))),'標題裡的 HTML 沒有變成標籤');
  if(process.env.SHOTS){const shot=async(n)=>{await evA.evaluate(()=>{const s=document.getElementById('splash');if(s)s.remove()});await evA.waitForTimeout(400);await evA.locator('#coPanel').screenshot({path:path.join(process.env.SHOTS,n)})};
    await shot('co_panel_desktop.png');await evA.setViewportSize({width:390,height:844});await shot('co_panel_mobile.png');await evA.evaluate(()=>document.documentElement.dataset.theme='dark');await shot('co_panel_mobile_dark.png');await evA.evaluate(()=>delete document.documentElement.dataset.theme);await evA.setViewportSize({width:1100,height:900})}
  await evE.reload();await evE.waitForFunction(()=>acct.user&&storeFsBase,null,{timeout:15000});await evE.waitForTimeout(1500);
  r=await rows(evE);ok(r.length===1&&!(await evE.evaluate(()=>!!document.querySelector('#coList [data-co=accept]'))),'活動部編輯者看得到邀請但沒有「同意」鈕');
  await evA.click('#coList [data-co=accept]');
  ok(await until(async()=>JSON.stringify(((await card(cid)).co||{}).depts)===JSON.stringify(['events'])&&!((await card(cid)).co.invite||[]).length),'活動部部長同意：co.depts＝[events]、invite 清空');
  await evE.reload();await evE.waitForFunction(()=>acct.user&&storeFsBase,null,{timeout:15000});await evE.waitForTimeout(800);
  await until(async()=>(await rows(evE)).length);
  r=await rows(evE);ok(r.length===1&&/共編中・來自權益部/.test(r[0]),'活動部編輯者：共編中的卡片列出來：'+r[0]);
  evE.click('#coList [data-co=edit]');
  await evE.waitForSelector('#dlg[open] textarea[name=desc]');
  await evE.fill('#dlg input[name=title]','共編改過的名稱');await evE.fill('#dlg textarea[name=desc]','第一行\n☐ 待辦一件');await dlgOk(evE);
  ok(await until(async()=>(await card(cid)).title==='共編改過的名稱'),'共編的人改名稱：卡片已更新');
  const c2=await card(cid);ok(c2.blocks.text.join('|')==='第一行|☐ 待辦一件'.replace('☐ ','')||c2.blocks.check.includes(false),'逐行內容與核取行寫入：'+JSON.stringify(c2.blocks.text));
  let ver;await admin(async d=>{ver=(await d.doc(`cards/${cid}/versions/${c2.version}`).get()).data()});ok(ver&&ver.by===await uidOf(evE),'同批新建一個版本，記錄是共編的人改的');
  ok(evE.errs.length===0&&evA.errs.length===0&&rt.errs.length===0,'沒有網頁錯誤：'+[...evE.errs,...evA.errs,...rt.errs].join(';'));

  /* 2. 會長申請 → 權益部部長同意 */
  const html=await pres.evaluate(cid=>coAskBtnHTML('rights',cid,'共編改過的名稱'),cid);ok(/data-coask/.test(html),'會長室看得到「申請共編」鈕');
  ok(await evE.evaluate(()=>coAskBtnHTML('rights','x','y')===''),'別的部門看不到「申請共編」鈕');
  await pres.evaluate(h=>{document.body.insertAdjacentHTML('beforeend',`<div id="tmpA">${h}</div>`)},html);
  pres.click('#tmpA [data-coask]');await pres.waitForSelector('#dlg[open]');await pres.click('#dlg [data-act=delete]');
  ok(await until(async()=>JSON.stringify(((await card(cid)).co||{}).ask)===JSON.stringify(['president'])),'會長送出申請：co.ask＝[president]');
  await rt.reload();await rt.waitForFunction(()=>acct.user&&storeFsBase,null,{timeout:15000});await rt.waitForTimeout(1500);
  r=await rows(rt);ok(r.some(x=>/會長室 申請共編這張卡片/.test(x)),'權益部部長的「共編」區：會長室的申請：'+r.join('｜'));
  await rt.click('#coList [data-co=grant]');
  ok(await until(async()=>JSON.stringify(((await card(cid)).co||{}).depts)===JSON.stringify(['events','president'])),'權益部部長同意：co.depts 含 events、president');

  /* 3. 收回 */
  rt.evaluate(id=>coShare(id),uiId);await rt.waitForSelector('#dlg[open] input[value=events]');
  await rt.uncheck('#dlg input[value=events]',{force:true});await rt.uncheck('#dlg input[value=president]',{force:true});await dlgOk(rt);
  ok(await until(async()=>{const c=(await card(cid)).co;return c&&!c.depts.length&&!c.invite.length&&!c.ask.length}),'權益部部長取消勾選：全部收回');
  await evE.reload();await evE.waitForFunction(()=>acct.user&&storeFsBase,null,{timeout:15000});await evE.waitForTimeout(1500);
  ok((await rows(evE)).length===0,'收回後活動部編輯者的「共編」區消失');
  await b.close();srv.close();await t.cleanup();
  console.log(fails?`失敗 ${fails} 項`:'全部通過');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
