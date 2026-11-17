/* 02D D-b 跨部門讀取跟著各部門的資料來源（混合狀態：部分部門已切到 firestore、部分還在 GitHub）：
   follow.js 的 fwLoad（會長室追蹤、秘書處會議的會長室授權、通知「全會」、讀秘書處學年設定）、meeting.js 的 mtLoadAll（秘書處讀各部門）。
   用 Auth 模擬器＋Firestore 模擬器、正式規則；全部部門先用遷移程式匯入，再在 Firestore 改幾個值（跟資料檔不同），看讀到的是哪一邊。
   A. 設定：權益部、秘書處＝firestore，其他＝github。在行銷部（github）看板：
      1. 已登入：fwLoad 權益部＝Firestore 的內容；活動部＝資料檔的內容；學年設定＝Firestore 的 org/config（秘書處已切換）
      2. 通知「全會」：權益部的時間標記用 Firestore 的名稱
      3. 未登入：權益部讀不到（顯示要登入），還在 GitHub 的部門照常；沒有頁面錯誤
   B. 設定：只有權益部＝firestore（秘書處還在 GitHub）。在秘書處（github）看板：
      4. 秘書處讀各部門：權益部＝Firestore、活動部＝資料檔；學年設定＝秘書處自己的資料檔
      5. 會長室追蹤：在會長室（github）看板追蹤的權益部卡片顯示 Firestore 的名稱
   執行（會自己開模擬器與網站）：cd backend && npm run test:web */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8307,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Date':new Date().toUTCString()});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(200)}};
const file=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));

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
  await mig.runImport(t.authenticatedContext('su',tok('su')).firestore(),firebase.firestore.FieldValue,TS,mig.loadSources(),{batch:'cx-test',uid:'su'});
  /* Firestore 裡改成跟資料檔不同的值：活動部第一張卡片的名稱、第一個時間標記的名稱、學年 */
  const ev=file('data.json'),e0=ev.events.find(e=>!e.doneAt&&(e.times||[]).length);
  const t0=(e0.times||[])[0];
  await admin(async d=>{await d.doc(`cards/rights__${e0.id}`).update({title:'FS 權益部卡片'});
    if(t0)await d.doc(`events/rights__${t0.id}`).update({label:'FS 時間標記'});
    await d.doc('org/config').update({yearLabel:'FS 學年'})});
  const mk=file('data-marketing.json'),rt=file('data-events.json');   /* rt＝還在 GitHub 的活動部 */

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8');
  const open=async(dept,fsDepts,{signin}={})=>{
    const ctx=await b.newContext({viewport:{width:1000,height:850},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc;for(const x of fsDepts)s=s.replace(new RegExp(`(\\{ id: "${x}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    const go=async()=>{await p.goto(`${BASE}/index.html?d=${dept}`);await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1500)};
    await go();
    if(signin){
      /* github 模式的看板沒有 Google 登入入口：用同一個網站在別的分頁登入過（登入狀態存在這個網站），這裡模擬成直接登入後重新整理 */
      await p.evaluate(async sub=>{const A=await import(location.origin+'/core/js/fb-app.js');A.fb(CFG.firebase);const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
        await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:sub})))},signin);
      await go();
    }
    p.ctx=ctx;return p};
  const fw=(p,id)=>p.evaluate(async id=>{const c=await fwLoad(id,true);return {err:c.err,ev:c.data?c.data.events.map(e=>({id:e.id,name:e.name,times:(e.times||[]).map(x=>x.label)})):null,year:c.data&&c.data.yearLabel,events:c.data?c.data.events.length:0}},id);

  /* ---------- A. 活動部、秘書處＝firestore；在權益部（github）看板 ---------- */
  {const p=await open('marketing',['rights','secretariat'],{signin:'reader'});
    ok(await p.evaluate(()=>storeSource()==='github'),'行銷部看板照舊是 GitHub 模式');
    const a=await fw(p,'rights');
    ok(!a.err&&a.ev&&a.ev.find(e=>e.id===e0.id).name==='FS 權益部卡片'&&a.events===ev.events.length,`已切換的權益部：讀 Firestore（卡片名稱是 Firestore 改過的，${a.events} 張）`);
    if(t0)ok(a.ev.find(e=>e.id===e0.id).times.includes('FS 時間標記'),'已切換的權益部：時間標記也是 Firestore 的');
    const m=await fw(p,'events');
    ok(!m.err&&m.events===(rt.events||[]).length&&!m.ev.some(e=>e.name.startsWith('FS ')),'還在 GitHub 的活動部：讀資料檔');
    ok(await until(()=>p.evaluate(()=>termCfg().yearLabel==='FS 學年')),'學年設定：秘書處已切換＝讀 Firestore 的 org/config（FS 學年）');
    await p.evaluate(()=>{NOTI.scope='all'});const nn=await p.evaluate(async()=>{await notiLoadAll();return NOTI.all.filter(x=>JSON.stringify(x).includes('FS 時間標記')).length});
    if(t0)ok(nn>0,'通知「全會」：權益部（已切換）的時間標記用 Firestore 的名稱');
    ok(p.errs.length===0,`沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);
    await p.ctx.close();}
  {const p=await open('marketing',['rights','secretariat']);
    const a=await fw(p,'rights'),m=await fw(p,'events');
    ok(!a.ev&&/登入/.test(a.err),`未登入：已切換的權益部讀不到（「${a.err}」）`);
    ok(!m.err&&m.events===(rt.events||[]).length,'未登入：還在 GitHub 的部門照常讀資料檔');
    ok(await p.evaluate(()=>termCfg().yearLabel)!=='FS 學年','未登入：讀不到秘書處（已切換），學年設定退回自己資料裡的值');
    ok(p.errs.length===0,`未登入：沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);
    await p.ctx.close();}

  /* ---------- B. 只有活動部＝firestore；秘書處、會長室還在 GitHub ---------- */
  {const p=await open('secretariat',['rights'],{signin:'reader'});
    await p.evaluate(()=>mtLoadAll(true));await until(()=>p.evaluate(()=>!MT.loading&&MT.depts.size>0));
    const r=await p.evaluate(()=>{const g=id=>{const m=MT.depts.get(id);return m&&m.data?{n:m.data.events.length,names:m.data.events.map(e=>e.name),sha:m.sha}:{err:m&&m.err}};return {fs:g('rights'),gh:g('events')}});
    ok(r.fs.names&&r.fs.names.includes('FS 權益部卡片')&&!r.fs.sha,'秘書處讀各部門：已切換的權益部讀 Firestore（沒有 sha，不會寫回）');
    ok(r.gh.n===rt.events.length&&!r.gh.names.some(n=>n.startsWith('FS ')),'秘書處讀各部門：還在 GitHub 的活動部讀資料檔');
    ok(await p.evaluate(()=>termOwn()&&termCfg().yearLabel)===file('data-secretariat.json').yearLabel,'學年設定：秘書處還在 GitHub＝用自己的資料檔');
    ok(p.errs.length===0,`秘書處：沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);
    await p.ctx.close();}
  {const p=await open('marketing',['rights'],{signin:'reader'});
    await p.waitForTimeout(800);const y=await p.evaluate(()=>({src:termSrc&&termSrc.yearLabel,cfg:termCfg().yearLabel}));
    ok(y.src===file('data-secretariat.json').yearLabel&&y.cfg!=='FS 學年','學年設定：秘書處還在 GitHub＝其他部門讀秘書處的資料檔（不是 Firestore 的 org/config）');
    await p.ctx.close();}
  {const p=await open('president',['rights'],{signin:'reader'});
    /* 追蹤一張權益部的卡片（畫面上的追蹤清單用 fwLoad＋fwBody 畫） */
    const html=await p.evaluate(async id=>{const c=await fwLoad('rights',true);return fwBody({id:'f1',dept:'rights',kind:'live',ref:id},c.data).title},e0.id);
    ok(html==='FS 權益部卡片','會長室追蹤：權益部（已切換）的卡片顯示 Firestore 的名稱');
    const rr=await p.evaluate(async()=>{const c=await fwLoad('events',true);return c.data.events.length});
    ok(rr===rt.events.length,'會長室追蹤：活動部（還在 GitHub）讀資料檔');
    /* 追蹤面板真的畫出來（會長室資料檔的 follows 裡有權益部的項目時） */
    const fol=await p.evaluate(()=>(state.follows||[]).filter(f=>f.dept==='rights').length);
    if(fol){await p.evaluate(()=>renderFollows&&renderFollows());await p.waitForTimeout(1500);
      const txt=await p.evaluate(()=>document.body.innerText);ok(!/登入後才看得到/.test(txt),`會長室追蹤面板：權益部的 ${fol} 項讀得到（已登入）`);}
    ok(p.errs.length===0,`會長室：沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);
    await p.ctx.close();}

  await b.close();srv.close();await t.cleanup();
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
