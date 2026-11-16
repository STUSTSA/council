/* kp3：03 T8 即時回報原位編輯器的驗收（firestore 模式；Auth＋Firestore 模擬器、正式規則；權益部用遷移程式匯入後切成 firestore）。
   桌面 1300（右側詳情卡）、手機 412（就地展開的膠囊，觸控）、深色模式（桌面 1300，最後縮到 412 看展開的膠囊）三種情況各跑一次：
   1. 三行純文字存好，把第 1、3 行轉成核取，重新載入後正確
   2. 核取（勾）、純文字、時間＋核取各一行，重新載入後各自正確
   3. 儲存失敗（中途撤權，規則擋下）時保留草稿、不收合；角色恢復後按「儲存」成功
   4. 點外面儲存；復原這次修改
   5. 母議題、專員、標籤、超連結在原位改（沒有各欄的取消／完成），點外面跟其他修改一起存；重新載入後正確
   深色模式另外檢查：重要元素的文字與底色對比（≥ 4.5）、卡片以外沒有白底殘留（收合的膠囊照規格是白底）。
   跳脫攻擊（桌面與手機各一次，檢視與編輯兩種狀態）：用模擬器的管理寫入（不經規則）塞惡意字串到卡片 ID、標題、每行文字、超連結顏色（03 審查 P1-1：不會變成 position:fixed、不會對外請求）、
   時間標記名稱、地點與 ID、行 ID、負責人名稱與信箱（總管理員看得到信箱）、標籤名、母議題名、超連結網址（含 javascript:）與文字；
   確認 window.__x 沒被設定、文字原樣顯示、沒有多出元素（img、svg、on* 屬性）、超連結不是 javascript:。
   不合格的文件 ID（卡片、時間標記）照 02D 的防護整份略過、不合格的行 ID 換成新的（store-map.js 的 SAFE_ID）。
   每一項印「通過／失敗」，有失敗以非 0 結束。執行：cd backend && npm run test:web（會自己開網站；只連本機模擬器，Firebase SDK 從 backend/node_modules 供應） */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST,AEMU=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!EMU||!AEMU){console.error('要在模擬器裡跑（firestore＋auth）：cd backend && npm run test:web');process.exit(1)}
const PORT=8306,BASE=`http://127.0.0.1:${PORT}`,PROJECT='demo-stustsa-board',DEPT='rights';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});if(q.method==='HEAD')return r.end();fs.createReadStream(p).pipe(r)});
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{const t0=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t0>ms)return v;await sleep(150)}};
/* 惡意字串 */
const X1='<img src=x onerror=window.__x=1>',X2='"><svg onload=window.__x=1>',X3="' onmouseover='window.__x=1",XJ='javascript:window.__x=1';
const XC='red;position:fixed;inset:0;z-index:99;background:url(https://attacker.invalid/x.png)';   /* 03 審查 P1-1：超連結顏色用分號接新的宣告 */

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
  await mig.runImport(t.authenticatedContext('su',tok('su')).firestore(),firebase.firestore.FieldValue,TS,mig.loadSources({dept:DEPT}),{batch:'kp3-test',uid:'su'});
  const setRole=(uid,depts)=>admin(d=>d.doc(`roles/${uid}`).set({super:false,depts,rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:TS.now(),updatedBy:'su'}));
  const C=id=>`cards/${DEPT}__${id}`;
  const rows=c=>{const B=c.blocks;if(Array.isArray(B))return B.map(x=>[x.text,x.check??null,x.timeId||null]);return B.id.map((_,n)=>[B.text[n],B.check[n],B.time[n]?B.time[n].replace(`${DEPT}__`,''):null])};
  /* 標籤：遷移的資料只有一個，再加一個，專員欄才有東西可勾 */
  await admin(d=>d.doc(`labels/${DEPT}__kp3lbl`).set({deptId:DEPT,kind:'地',name:'六宿',updatedAt:TS.now(),updatedBy:'su'}));

  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8');
  const open=async(o)=>{
    const ctx=await b.newContext({viewport:{width:o.w,height:o.h},colorScheme:o.sc,hasTouch:!!o.touch,isMobile:!!o.touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`${BASE}/dept/config.js*`,r=>{let s=cfgSrc.replace(new RegExp(`(\\{ id: "${DEPT}",[^\\n]*?)( \\},?\\n)`),`$1, source: "firestore"$2`);
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo-key", authDomain: "", projectId: "${PROJECT}", appId: "", emulator: { host: "${h}", port: ${pt}, auth: "http://${AEMU}" } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    await ctx.route('https://attacker.invalid/**',r=>r.abort());   /* 惡意樣式想載入的外部圖片：擋下並記錄（request 事件照樣會觸發） */
    const p=await ctx.newPage();p.errs=[];p.reqs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))p.errs.push('console:'+m.text())});
    p.on('request',r=>{if(/attacker\.invalid/.test(r.url()))p.reqs.push(r.url())});
    await p.goto(`${BASE}/index.html?d=${DEPT}`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1200);
    p.o=o;return p};
  const signIn=async(p,sub)=>{await p.evaluate(async sub=>{const m=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    await m.signInWithCredential(m.getAuth(),m.GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.test`,email_verified:true,name:`${sub} 同學`})))},sub);
    return p.waitForFunction(()=>acct.user&&acct.user.uid&&storeFsBase,null,{timeout:10000}).then(()=>p.evaluate(()=>acct.user.uid))};
  const evOf=(p,id)=>p.evaluate(id=>{const e=state.events.find(x=>x.id===id);return e&&JSON.parse(JSON.stringify(e))},id);
  const settled=p=>until(()=>p.evaluate(()=>!fsBusy&&!kpBusy()&&storeFsBase&&(!kpSt||kpSt.st!=='saving')),15000).then(()=>sleep(300));
  const reload=async p=>{await p.reload();await p.waitForFunction(()=>typeof storeFsBase!=='undefined'&&storeFsBase&&state.events.length>0,null,{timeout:15000});await p.waitForTimeout(900);
    await until(()=>p.evaluate(()=>!boardLocked()))};
  const md=p=>p.o.w>=1000;
  const cap=id=>`.ev[data-ev="${id}"]`;
  const S=(p,id)=>md(p)?'#evDetail':cap(id);   /* 這張卡片顯示（與編輯）的地方 */
  /* 打開這張：桌面＝選到它（右側詳情）；手機＝就地展開 */
  const show=async(p,id)=>{
    if(md(p)){if(await p.evaluate(id=>selEv===id&&!!document.querySelector('#evDetail .evd'),id))return;await p.click(`${cap(id)}>summary`,{position:{x:30,y:18}});await p.waitForTimeout(1000);return}
    if(!await p.evaluate(s=>document.querySelector(s).open,cap(id))){await p.click(`${cap(id)}>summary`,{position:{x:30,y:18}});await p.waitForTimeout(800)}};
  const outside=async p=>{await p.click('#evH');await settled(p)};
  const line=(p,id,n)=>`${S(p,id)} .kp-lines:not(.kp-frees) .kp-line:nth-child(${n})`;
  const setType=async(p,id,n,k)=>{await p.click(`${line(p,id,n)} .kp-type .csel-btn`);await p.waitForTimeout(300);await p.click(`${line(p,id,n)} .csel-opt[data-v="${k}"]`);await p.waitForTimeout(400)};
  /* 新卡片：桌面＝「+ 新增即時回報」直接在右側原位編輯（名稱）；手機＝小表單 */
  const newCard=async(p,name)=>{
    if(md(p)){await p.click('#addEvent');await p.waitForTimeout(900);await p.fill('#evDetail [data-kptitle]',name);await outside(p)}
    else{await p.click('#addEvent');await p.waitForSelector('#dlg[open]');await p.fill('#dlgForm [name="name"]',name);await p.click('#dlg [data-act="ok"]');await settled(p)}
    const id=await p.evaluate(n=>(state.events.find(e=>e.name===n)||{}).id,name);await show(p,id);return id};
  const typeLines=async(p,id,lines)=>{await p.click(`${S(p,id)} [data-kpgo=""]`);await p.waitForTimeout(500);
    for(let i=0;i<lines.length;i++){if(i)await p.keyboard.press('Enter');await p.keyboard.type(lines[i])}};
  const goLine=async(p,id,bid)=>{await show(p,id);await p.click(`${S(p,id)} [data-kpgo="${bid}"]`);await p.waitForTimeout(500)};

  /* 對比：文字色與往上找到的第一個不透明底色 */
  const contrast=(p,sels,scope)=>p.evaluate(([sels,scope])=>{
    const rgb=s=>{const m=s.match(/[\d.]+/g);return m?m.map(Number):[0,0,0,0]};
    const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
    const bgOf=el=>{for(let e=el;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length<4||c[3]>.9)return c}return [255,255,255]};
    const root=document.querySelector(scope),out=[];sels.forEach(s=>[...root.querySelectorAll(s)].filter(el=>el.checkVisibility({visibilityProperty:true,opacityProperty:true})).forEach((el,i)=>{if(i>2)return;const fg=rgb(getComputedStyle(el).color),bg=bgOf(el);
      const a=lum(fg),z=lum(bg),red=el.matches('.danger,.ev-rep,[aria-pressed="true"][data-evrep]');out.push({s,cls:el.className,t:(el.textContent||el.value||'').slice(0,12),r:+((Math.max(a,z)+.05)/(Math.min(a,z)+.05)).toFixed(2),min:red?3:4.5,fg:getComputedStyle(el).color,bg:`rgb(${bg.slice(0,3).join(',')})`})}));return out},[sels,scope]);
  const low=cs=>cs.filter(x=>x.r<x.min);
  /* 卡片以外的白底：收合的膠囊、展開的卡片、右側詳情、議題裡的小膠囊、下拉清單、對話框、提示照規格可以是白（或淺色）底 */
  const whiteLeft=p=>p.evaluate(()=>[...document.querySelectorAll('#pageMain *')].filter(e=>{if(!e.checkVisibility({visibilityProperty:true}))return false;const c=getComputedStyle(e).backgroundColor;if(!/^rgba?\(25[0-5], 25[0-5], 25[0-5](, 1)?\)$/.test(c))return false;
    return !e.closest('.ev,#evDetail,#doneDetail,.kid-ev,.csel-list,#dlg,#toast,.glass,.link,.tag,.lbl-chip,.staff-chip,.rpt-paper')}).map(e=>e.tagName+'.'+e.className).slice(0,5));

  const ed0=await open({w:1300,h:900,sc:'light'});const edUid=await signIn(ed0,'kp3ed');await setRole(edUid,{[DEPT]:'editor'});await ed0.context().close();

  for(const o of [{tag:'桌面 1300',w:1300,h:900,sc:'light'},{tag:'手機 412',w:412,h:860,sc:'light',touch:true},{tag:'深色',w:1300,h:900,sc:'dark'}]){
    const T=o.tag;console.log(`---------- ${T} ----------`);
    const p=await open(o);await signIn(p,'kp3ed');
    await until(()=>p.evaluate(()=>!boardLocked()&&document.body.classList.contains('authed')));
    await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(400);

    /* 1. 三行純文字 → 第 1、3 行轉成核取 */
    const k1=await newCard(p,`KP3 三行 ${T}`);
    ok(await p.evaluate(s=>!document.querySelector(`${s} .card-edit-btn`),S(p,k1)),`${T}：即時回報卡沒有「編輯」鈕（點內容就編輯）`);
    await typeLines(p,k1,['甲','乙','丙']);
    ok(await p.evaluate(id=>editing&&cardEdit==='e:'+id&&!!document.querySelector('.kp')&&!document.querySelector('.kp [data-evfx],.kp [data-edcancel]'),k1),`${T}：點「沒有說明」直接在原位編輯，沒有「取消」`);
    await outside(p);
    let c=await read(C(k1));
    ok(JSON.stringify(rows(c))===JSON.stringify([['甲',null,null],['乙',null,null],['丙',null,null]]),`${T} 1：三行純文字存好（${JSON.stringify(rows(c))}）`);
    const ids1=c.blocks.id,b1=await evOf(p,k1);
    await goLine(p,k1,b1.blocks[0].id);await setType(p,k1,1,'check');await setType(p,k1,3,'check');await outside(p);
    await reload(p);await show(p,k1);
    let r=await evOf(p,k1);c=await read(C(k1));
    const v1=await p.evaluate(s=>[...document.querySelectorAll(`${s} .kp-vl`)].map(li=>[li.dataset.k,li.querySelector('.kp-tx').textContent,!!li.querySelector('input[type=checkbox]')]),S(p,k1));
    ok(JSON.stringify(r.blocks.map(x=>[x.text,x.check]))===JSON.stringify([['甲',false],['乙',null],['丙',false]])&&JSON.stringify(c.blocks.id)===JSON.stringify(ids1)
      &&JSON.stringify(v1)===JSON.stringify([['check','甲',true],['text','乙',false],['check','丙',true]]),`${T} 1：重新載入後第 1、3 行是核取、第 2 行純文字、行 ID 不變、畫面一致（${JSON.stringify(v1)}）`);

    /* 2. 核取（勾）、純文字、時間＋核取 */
    const k2=await newCard(p,`KP3 三種 ${T}`);
    await typeLines(p,k2,['要勾的','文字一行','開會']);
    await setType(p,k2,1,'check');await p.click(`${line(p,k2,1)} [data-kpck]`);await p.waitForTimeout(200);
    await setType(p,k2,3,'time');
    ok(await p.evaluate(()=>!!document.querySelector('.kp .tp')&&!document.querySelector('.kp input[type=date],.kp input[type=time]')),`${T} 2：換成時間打開自製時間選取器（沒有原生日期、時間欄）`);
    const month=await p.evaluate(()=>JSON.parse(document.querySelector('.tp').dataset.st).m);
    await p.click(`.tp [data-tpd="${month}-20"]`);await p.waitForTimeout(150);await p.fill('.tp [data-tpf="sh"]','14:00');await p.fill('.tp [data-tpf="eh"]','15:30');await p.click('.tp [data-tpok]');await p.waitForTimeout(300);
    await outside(p);await reload(p);await show(p,k2);
    r=await evOf(p,k2);const tid2=r.blocks[2]&&r.blocks[2].timeId,ev2=tid2&&await read(`events/${DEPT}__${tid2}`);
    const v2=await p.evaluate(s=>[...document.querySelectorAll(`${s} .kp-vl`)].map(li=>[li.dataset.k,!!(li.querySelector('input')||{}).checked,!!li.querySelector('.kp-tm')]),S(p,k2));
    ok(JSON.stringify(r.blocks.map(x=>[x.text,x.check,!!x.timeId]))===JSON.stringify([['要勾的',true,false],['文字一行',null,false],['開會',false,true]])
      &&JSON.stringify(v2)===JSON.stringify([['check',true,false],['text',false,false],['time',false,true]]),`${T} 2：重新載入後核取（勾）、純文字、時間＋核取各自正確（${JSON.stringify(v2)}）`);
    ok(ev2&&ev2.blockId===r.blocks[2].id&&ev2.label==='開會'&&ev2.startRaw===`${month}-20T14:00`&&ev2.endRaw===`${month}-20T15:30`,`${T} 2：時間標記 blockId、名稱、時間正確`);

    /* 3. 儲存失敗保留草稿 */
    const v3=(await read(C(k1))).version;
    await goLine(p,k1,(await evOf(p,k1)).blocks[1].id);await p.keyboard.type('（草稿）');
    await setRole(edUid,{});await until(()=>p.evaluate(()=>boardLocked()));
    await p.click('#evH');await settled(p);
    const f3=await p.evaluate(()=>({editing,kp:!!document.querySelector('.kp'),st:(document.querySelector('.kp-bar .kp-st')||{dataset:{}}).dataset.st,txt:(document.querySelector('.kp-bar .kp-st')||{}).textContent,
      draft:[...document.querySelectorAll('.kp [data-kptx]')].map(x=>x.value),dlg:!!document.querySelector('#dlg[open]')}));
    ok(f3.editing&&f3.kp&&f3.st==='fail'&&/儲存失敗/.test(f3.txt)&&f3.draft.includes('乙（草稿）')&&!f3.dlg,`${T} 3：儲存失敗不收合、保留草稿、顯示「${f3.txt}」、不跳對話框`);
    ok((await read(C(k1))).version===v3,`${T} 3：規則擋下、沒有寫入`);
    await setRole(edUid,{[DEPT]:'editor'});await until(()=>p.evaluate(()=>!boardLocked()));
    await p.click(`${S(p,k1)} [data-kpsave]`);await settled(p);
    c=await read(C(k1));ok(c.version===v3+1&&c.blocks.text[1]==='乙（草稿）'&&await p.evaluate(()=>!editing),`${T} 3：角色恢復後按「儲存」寫入、收合`);

    /* 4. 點外面儲存、復原這次修改 */
    await show(p,k1);const v4=(await read(C(k1))).version;
    await goLine(p,k1,(await evOf(p,k1)).blocks[2].id);await p.keyboard.type('（改）');
    await p.click('#evH');
    ok(await p.evaluate(()=>!editing&&!document.querySelector('.kp')),`${T} 4：點外面馬上收合`);
    ok(await until(()=>p.evaluate(s=>{const x=document.querySelector(`${s} .kp-done .kp-st`);return x&&x.dataset.st==='ok'&&x.textContent==='已儲存'},S(p,k1))),`${T} 4：儲存回饋「已儲存」`);
    c=await read(C(k1));ok(c.version===v4+1&&c.blocks.text[2]==='丙（改）',`${T} 4：點外面寫入新的一版`);
    ok(await p.evaluate(s=>!!document.querySelector(`${s} [data-kpundo]`),S(p,k1)),`${T} 4：有「復原這次修改」`);
    await p.click(`${S(p,k1)} [data-kpundo]`);await settled(p);
    c=await read(C(k1));ok(c.version===v4+2&&c.blocks.text[2]==='丙'&&!await p.evaluate(s=>!!document.querySelector(`${s} [data-kpundo]`),S(p,k1)),`${T} 4：復原存回修改前（第 ${c.version} 版）、復原鈕消失`);

    /* 5. 母議題、專員、標籤、超連結在原位 */
    await show(p,k2);await goLine(p,k2,(await evOf(p,k2)).blocks[1].id);
    const sc=S(p,k2);
    ok(await p.evaluate(s=>{const q=x=>document.querySelector(`${s} ${x}`);return !!q('[data-kpf=issue] .csel-btn')&&!!q('[data-kpf=staff] .chip')&&!!q('[data-kpf=labels] .chip')&&!!q('[data-kplkadd]')&&!q('[data-evpen],[data-evfx]')},sc),`${T} 5：母議題、專員、標籤、超連結直接在原位（沒有一欄一欄的取消／完成）`);
    await p.click(`${sc} [data-kpf=issue] .csel-btn`);await p.waitForTimeout(300);await p.click(`${sc} [data-kpf=issue] .csel-opt:nth-child(2)`);await p.waitForTimeout(400);
    const iss=await p.evaluate(()=>state.issues[0].id);
    await p.click(`${sc} [data-kpf=staff] label.chip:has(input[value="${edUid}"])`);await p.waitForTimeout(200);
    await p.click(`${sc} [data-kpf=labels] label.chip:has(input[value="kp3lbl"])`);await p.waitForTimeout(200);
    await p.click(`${sc} [data-kplkadd]`);await p.waitForTimeout(400);await p.keyboard.type('公文');
    await p.fill(`${sc} .kp-lk:last-of-type [data-e=url]`,'https://example.com/a');
    await p.click(`${sc} .kp-lk:last-of-type [data-kplk=color]`);await p.waitForTimeout(150);
    await outside(p);
    c=await read(C(k2));
    ok(c.issueId===`${DEPT}__${iss}`&&c.staff.includes(edUid)&&c.labels.includes(`${DEPT}__kp3lbl`)&&c.links.some(l=>l.name==='公文'&&l.url==='https://example.com/a'),`${T} 5：點外面存好母議題、專員、標籤、超連結（${JSON.stringify({i:c.issueId,s:c.staff,l:c.labels,k:c.links.map(l=>l.name)})}）`);
    await reload(p);await show(p,k2);
    const v5=await p.evaluate(s=>{const q=x=>[...document.querySelectorAll(`${s} ${x}`)].map(e=>e.textContent);return {par:(document.querySelector(`${s} .evd-par,${s} .ev-parent-full`)||{}).textContent,staff:q('.staff-chip'),lbl:q('.lbl-chip'),links:q('.ev-links .link')}},S(p,k2));
    ok(!!v5.par&&v5.staff.length>0&&v5.lbl.some(x=>x.includes('六宿'))&&v5.links.includes('公文'),`${T} 5：重新載入後畫面有母議題、專員、標籤、超連結（${JSON.stringify(v5)}）`);
    /* 超連結有網址沒名稱：不收合 */
    await goLine(p,k2,(await evOf(p,k2)).blocks[1].id);await p.click(`${sc} [data-kplkadd]`);await p.waitForTimeout(300);
    await p.fill(`${sc} .kp-lk:last-of-type [data-e=url]`,'https://example.com/b');await p.click('#evH');await p.waitForTimeout(500);
    ok(await p.evaluate(()=>editing&&/請填按鈕名稱/.test((document.querySelector('.kp-bar .kp-st')||{}).textContent||'')),`${T} 5：超連結沒有名稱＝「請填按鈕名稱」、不收合`);
    await p.click(`${sc} .kp-lk:last-of-type [data-kplkdel]`);await p.waitForTimeout(300);await outside(p);
    ok(await p.evaluate(()=>!editing),`${T} 5：刪掉那一筆後點外面收合`);

    if(o.sc==='dark'){
      /* 深色：對比、白底殘留（桌面右側詳情卡＋編輯中；再縮到 412 看展開的膠囊） */
      const K=['.evd-head b','.kp-vl .kp-tx','.ev-meta','.staff-chip','.lbl-chip'];
      const KE=['.kp-title','.kp [data-kptx]','.kp-fl','.kp-type .csel-v','.kp-issue .csel-v','.kp .chip span','.kp-lk input','.ev-tools button,.evd-main button','.kp-bar [data-kpsave]'];
      let cs=await contrast(p,K,S(p,k2));ok(cs.length>=4&&!low(cs).length,`深色 檢視（右側詳情）對比都夠（一般 ≥ 4.5、重點紅 ≥ 3；${cs.length} 個，不夠的：${JSON.stringify(low(cs))}）`);
      await goLine(p,k2,(await evOf(p,k2)).blocks[1].id);
      cs=await contrast(p,KE,S(p,k2));ok(cs.length>=8&&!low(cs).length,`深色 編輯中對比都夠（${cs.length} 個，不夠的：${JSON.stringify(low(cs))}）`);
      let wl=await whiteLeft(p);ok(!wl.length,`深色 卡片以外沒有白底殘留（${wl.join(' ')}）`);
      ok(await p.evaluate(()=>getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)'&&getComputedStyle(document.querySelector('#evDetail')).backgroundColor==='rgb(246, 246, 248)'),'深色 頁面黑底、詳情卡淺灰底');
      const hair=await p.evaluate(()=>[getComputedStyle(document.querySelector('#evDetail .kp-f')).borderBottomColor,getComputedStyle(document.querySelector('#evDetail')).getPropertyValue('--hair').trim()]);
      ok(hair[0]==='rgb(226, 226, 232)'&&hair[1]==='#e2e2e8',`深色 詳情卡的分隔線是淺色那一組（${hair.join(' ')}）`);
      await outside(p);
      await p.setViewportSize({width:412,height:860});await p.waitForTimeout(900);p.o={...p.o,w:412};
      await show(p,k2);
      cs=await contrast(p,K.slice(1),S(p,k2));ok(cs.length>=3&&!low(cs).length,`深色 412 展開的膠囊對比都夠（${cs.length} 個，不夠的：${JSON.stringify(low(cs))}）`);
      const hair2=await p.evaluate(id=>getComputedStyle(document.querySelector(`.ev[data-ev="${id}"]`)).getPropertyValue('--hair').trim(),k2);
      ok(hair2==='#e2e2e8',`深色 展開的膠囊也重設 --hair（${hair2}）`);
      await goLine(p,k2,(await evOf(p,k2)).blocks[1].id);
      cs=await contrast(p,KE,S(p,k2));ok(cs.length>=8&&!low(cs).length,`深色 412 編輯中對比都夠（${cs.length} 個，不夠的：${JSON.stringify(low(cs))}）`);
      wl=await whiteLeft(p);ok(!wl.length,`深色 412 卡片以外沒有白底殘留（${wl.join(' ')}）`);
      await outside(p);
    }
    ok(!p.errs.length,`${T}：沒有頁面錯誤（${p.errs.join(' | ')}）`);
    await p.context().close();
  }

  /* ---------- 跳脫攻擊 ---------- */
  console.log('---------- 跳脫攻擊 ----------');
  const now=TS.now(),stamp={updatedAt:now,updatedBy:'x'};
  await admin(async d=>{
    await d.doc(`issues/${DEPT}__kpxi`).set({deptId:DEPT,title:X2+X1,cur:0,start:'',end:'',startAt:null,endAt:null,note:'',tags:[],labels:[],links:[],staff:[],markers:[],doneAt:null,order:-1,rev:1,...stamp});
    await d.doc(`labels/${DEPT}__kpxl`).set({deptId:DEPT,kind:'人',name:X1+X3,...stamp});
    await d.doc(`labels/${DEPT}__"><img src=x onerror=window.__x=1>`).set({deptId:DEPT,kind:'物',name:'不合格 ID 的標籤',...stamp});
    await d.doc('profiles/kpxs').set({displayName:X1+X2,photoURL:null,updatedAt:now});
    await d.doc('users/kpxe').set({email:`${X2}@x.test`,lastLoginAt:now});
    await d.doc('roles/kpxe').set({super:false,depts:{[DEPT]:'editor'},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedAt:now,updatedBy:'su'});
    const B={id:['kpxL1',X2,'kpxL3','kpxL4'],text:[X1,X2,X3,'時間行'],check:[null,false,true,false],time:[null,null,null,`${DEPT}__kpxt`]};
    const card={deptId:DEPT,title:X1+X2+X3,blocks:B,timeIds:[`${DEPT}__kpxt`,`${DEPT}__kpxf`,`${DEPT}__${X2}`],issueId:`${DEPT}__kpxi`,staff:['kpxs','kpxe',X2],labels:[`${DEPT}__kpxl`,`${DEPT}__"><img src=x onerror=window.__x=1>`],
      links:[{id:'kpxk1',name:X1,url:XJ,color:'#3b82f6'},{id:X2,name:X3,url:`https://example.com/${X2}`,color:'#ef4444'},{id:'kpxk3',name:'壞顏色',url:'https://example.com/c',color:XC}],report:false,state:'open',doneAt:null,deletedAt:null,deletedBy:null,order:-1,version:1,createdAt:now,createdBy:'x',...stamp};
    await d.doc(C('kpxss')).set(card);
    await d.doc(`${C('kpxss')}/versions/1`).set({cardId:`${DEPT}__kpxss`,deptId:DEPT,version:1,title:card.title,blocks:B,times:[],state:'open',by:'x',at:now,imported:false});
    for(const [id,label,place] of [['kpxt',X1+X3,X2],['kpxf',X2+X1,X3],[X2,'不合格 ID 的時間','']])
      await d.doc(`events/${DEPT}__${id}`).set({deptId:DEPT,cardId:`${DEPT}__kpxss`,blockId:id==='kpxt'?'kpxL4':null,label,start:now,end:now,startRaw:'2026-11-20T14:00',endRaw:'',allDay:false,place,toIssue:false,scope:'dept',visibility:'internal',rev:1,...stamp});
    /* 卡片 ID 本身是惡意字串（02D 的防護：讀回來時整份略過） */
    await d.doc(C(X1)).set({...card,title:'不合格 ID 的卡片',timeIds:[]});
  });
  const xs=async(p,where)=>p.evaluate(([where,X])=>{
    const root=document.querySelector('#livePanel');
    const extra=[...root.querySelectorAll('img,svg:not(.ico):not(.csel-chev):not([aria-hidden="true"]),script,iframe')].map(e=>e.outerHTML.slice(0,60));
    const onAttr=[...root.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).map(e=>e.tagName);
    const jsHref=[...root.querySelectorAll('a[href]')].filter(a=>/^\s*javascript:/i.test(a.getAttribute('href'))).length;
    return {x:window.__x,extra,onAttr,jsHref,where}},[where]);
  /* 超連結（檢視的按鈕、編輯的色點）：惡意顏色沒有變成 position:fixed、沒有背景圖、沒有對外請求 */
  const css=async(p,sc)=>p.evaluate(sc=>[...document.querySelectorAll(`${sc} .ev-links a,${sc} .kp-lk .evf-sw`)].map(a=>{const c=getComputedStyle(a);return {pos:c.position,bg:c.backgroundImage,st:a.getAttribute('style')}}),sc);
  const cssOk=l=>l.length>0&&l.every(x=>x.pos!=='fixed'&&!/url\(/.test(x.bg)&&!/attacker|position|;/.test(x.st));
  const hoverAll=async(p,sc)=>{for(const el of (await p.$$(`${sc} *`)).slice(0,120)){try{const bb=await el.boundingBox();if(bb&&bb.width>0&&bb.height>0&&bb.y>0&&bb.y<800)await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2)}catch(_){}}};
  for(const o of [{tag:'桌面 1300',w:1300,h:900,sc:'light'},{tag:'手機 412',w:412,h:860,sc:'light',touch:true}]){
    const T=o.tag;const p=await open(o);await signIn(p,'kp3ed');await setRole(edUid,{[DEPT]:'editor'});await until(()=>p.evaluate(()=>!boardLocked()&&state.events.some(e=>e.id==='kpxss')));
    await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(400);
    ok(await p.evaluate(()=>!state.events.some(e=>e.name==='不合格 ID 的卡片')&&!document.querySelector('[data-ev^="<img"]')),`${T}：卡片 ID 是惡意字串的文件整份略過（02D 防護）`);
    await until(()=>p.evaluate(X=>!!acct.names.kpxs,X1));await p.evaluate(()=>render());
    await show(p,'kpxss');const sc=S(p,'kpxss');
    await hoverAll(p,sc);
    let x=await xs(p,'檢視');
    const view=await p.evaluate(([sc,id,isMd])=>{const q=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.textContent);
      return {title:isMd?document.querySelector('#evDetail .evd-head b').textContent:document.querySelector(`.ev[data-ev="${id}"] summary b`).textContent,
        lines:q('.kp-vl .kp-tx'),par:(document.querySelector(`${sc} .evd-par,${sc} .ev-parent-full`)||{}).textContent,staff:q('.staff-chip'),lbl:q('.lbl-chip'),times:q('.ev-times li .ev-t-label'),place:q('.ev-times li .ev-t-place'),
        links:[...document.querySelectorAll(`${sc} .ev-links a`)].map(a=>[a.textContent,a.getAttribute('href')]),ids:[...document.querySelectorAll(`${sc} [data-kpgo]`)].map(e=>e.dataset.kpgo)}},[sc,'kpxss',md(p)]);
    ok(x.x===undefined&&!x.extra.length&&!x.onAttr.length&&!x.jsHref,`${T} 檢視：沒有執行、沒有多出元素或 on 屬性、沒有 javascript: 連結（${JSON.stringify(x)}）`);
    ok(JSON.stringify(view.lines)===JSON.stringify([X1,X2,X3,'時間行']),`${T} 檢視：每行文字原樣（${JSON.stringify(view.lines)}）`);
    ok(view.title===X1+X2+X3,`${T} 檢視：標題原樣（${view.title}）`);
    ok(view.par&&view.par.includes(X2+X1),`${T} 檢視：母議題名原樣（${view.par}）`);
    ok(view.staff.includes(X1+X2)&&view.staff.some(s=>s===X2.slice(0,8)),`${T} 檢視：負責人名稱原樣、不合格的負責人 ID 只顯示前 8 字（${JSON.stringify(view.staff)}）`);
    ok(view.lbl.some(s=>s.includes(X1+X3))&&!view.lbl.some(s=>s.includes('不合格 ID')),`${T} 檢視：標籤名原樣、不合格 ID 的標籤略過（${JSON.stringify(view.lbl)}）`);
    ok(view.times.includes(X2+X1)&&view.place.some(s=>s.includes(X3))&&!view.times.includes('不合格 ID 的時間'),`${T} 檢視：沒連到行的時間標記名稱、地點原樣，不合格 ID 的時間略過（${JSON.stringify([view.times,view.place])}）`);
    ok(view.links.some(([n,h])=>n===X1&&!/^javascript:/i.test(h))&&view.links.some(([n,h])=>n===X3&&h.startsWith('https://example.com/')),`${T} 檢視：超連結文字原樣、javascript: 網址不會變成可執行的連結（${JSON.stringify(view.links)}）`);
    ok(view.ids.every(i=>/^[A-Za-z0-9_-]*$/.test(i)||i==='title')&&!view.ids.includes(X2),`${T} 檢視：不合格的行 ID 換成新的（${JSON.stringify(view.ids)}）`);
    {const cs=await css(p,sc);ok(cssOk(cs)&&cs.length===3&&!p.reqs.length,`${T} 檢視：超連結的惡意顏色沒有變成 position:fixed、沒有背景圖、沒有對外請求（${JSON.stringify(cs)}；請求 ${p.reqs.length}）`);}
    /* 編輯 */
    await p.click(`${sc} .kp-vl:nth-child(1) [data-kpgo]`);await p.waitForTimeout(700);
    await hoverAll(p,sc);
    x=await xs(p,'編輯');
    const edv=await p.evaluate(sc=>{const v=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.value);const t=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.textContent);
      return {title:(document.querySelector(`${sc} [data-kptitle]`)||{}).value,lines:v('[data-kptx]'),free:v('[data-kplb]'),issue:t('[data-kpf=issue] .csel-v'),issueOpts:t('[data-kpf=issue] .csel-opt'),staff:t('[data-kpf=staff] .chip span'),
        lbl:t('[data-kpf=labels] .chip span'),lkn:[...document.querySelectorAll(`${sc} .kp-lk [data-e=name]`)].map(e=>e.value),lku:[...document.querySelectorAll(`${sc} .kp-lk [data-e=url]`)].map(e=>e.value),editing}},sc);
    ok(x.x===undefined&&!x.extra.length&&!x.onAttr.length,`${T} 編輯：沒有執行、沒有多出元素或 on 屬性（${JSON.stringify(x)}）`);
    ok(edv.editing&&edv.title===X1+X2+X3&&JSON.stringify(edv.lines)===JSON.stringify([X1,X2,X3,'時間行']),`${T} 編輯：標題、每行文字在輸入框裡原樣`);
    ok(edv.free.includes(X2+X1),`${T} 編輯：沒連到行的時間標記名稱原樣（${JSON.stringify(edv.free)}）`);
    ok(edv.issue[0]===X2+X1&&edv.issueOpts.includes(X2+X1),`${T} 編輯：母議題選單原樣`);
    ok(edv.staff.includes(X1+X2),`${T} 編輯：負責人名稱原樣（${JSON.stringify(edv.staff)}）`);
    ok(edv.lbl.includes(X1+X3),`${T} 編輯：標籤名原樣`);
    ok(edv.lkn.includes(X1)&&edv.lkn.includes(X3)&&edv.lku.includes(XJ)&&edv.lku.includes(`https://example.com/${X2}`),`${T} 編輯：超連結名稱、網址原樣（${JSON.stringify(edv.lku)}）`);
    {const cs=await css(p,sc);ok(cssOk(cs)&&cs.length===3&&!p.reqs.length,`${T} 編輯：超連結色點的惡意顏色沒有變成 position:fixed、沒有背景圖、沒有對外請求（${JSON.stringify(cs)}；請求 ${p.reqs.length}）`);}
    /* 打開時間選取器（地點是惡意字串） */
    await p.click(`${sc} .kp-free [data-kptm]`);await p.waitForTimeout(500);
    x=await xs(p,'時間選取器');
    ok(x.x===undefined&&!x.extra.length&&!x.onAttr.length&&await p.evaluate(sc=>(document.querySelector(`${sc} .tp [data-tpf=place]`)||{}).value,sc)===X3,`${T} 編輯：時間選取器的地點原樣、沒有執行`);
    await p.keyboard.press('Escape');await p.waitForTimeout(300);await p.keyboard.press('Escape');await settled(p);   /* 惡意資料本身不符合規則，存檔會失敗（停在編輯、顯示失敗），這裡只看有沒有執行 */
    x=await xs(p,'Esc 之後');ok(x.x===undefined&&!x.extra.length&&!x.onAttr.length,`${T}：Esc（儲存）之後仍沒有執行、沒有多出元素（${JSON.stringify(x)}）`);
    ok(!p.errs.length,`${T} 跳脫：沒有頁面錯誤（${p.errs.join(' | ')}）`);
    await p.context().close();
  }
  /* 信箱：只有總管理員看得到；沒有名稱的負責人顯示信箱 */
  {const p=await open({w:412,h:860,sc:'light',touch:true});const suUid=await signIn(p,'kp3su');   /* 模擬器的 uid 不是 sub：拿到 uid 再給總管理員 */
    await admin(d=>d.doc(`roles/${suUid}`).set({super:true,depts:{},rev:1,lastVia:'manual',lastRef:'bootstrap',updatedBy:'su',updatedAt:TS.now()}));
    await until(()=>p.evaluate(()=>fsRole()==='super'&&!boardLocked()&&state.events.some(e=>e.id==='kpxss')));
    await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(400);await show(p,'kpxss');
    await p.click(`${cap('kpxss')} .kp-vl:nth-child(1) [data-kpgo]`);await p.waitForTimeout(700);
    await until(()=>p.evaluate(()=>[...document.querySelectorAll('.kp [data-kpf=staff] .chip span')].some(s=>s.textContent.includes('@x.test'))),8000);
    const st=await p.evaluate(()=>[...document.querySelectorAll('.kp [data-kpf=staff] .chip span')].map(s=>s.textContent));
    const x=await xs(p,'信箱');
    ok(st.includes(`${X2}@x.test`)&&x.x===undefined&&!x.extra.length&&!x.onAttr.length,`總管理員：負責人信箱原樣顯示、沒有執行（${JSON.stringify(st)}）`);
    await p.click('#evH');await settled(p);
    const st2=await p.evaluate(()=>[...document.querySelectorAll(`.ev[data-ev="kpxss"] .staff-chip`)].map(s=>s.textContent));
    ok(st2.includes(`${X2}@x.test`)&&await p.evaluate(()=>window.__x===undefined),`總管理員 檢視：負責人信箱原樣（${JSON.stringify(st2)}）`);
    ok(!p.errs.length,`總管理員：沒有頁面錯誤（${p.errs.join(' | ')}）`);
    await p.context().close();}

  await b.close();await t.cleanup();srv.close();
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
