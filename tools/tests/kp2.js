/* 03 原位編輯器在 github 模式（data.json）：同一個編輯器、存回資料檔。固定 8300 埠（CLAUDE.md 的測試準備：data_test.json 改名 data.json）。
   1. 讀舊的 data_test.json（schemaVersion 13、只有 desc）：每行顯示成純文字
   2. 原位編輯（加一行、轉成核取並勾選、點外面）→ 寫回 GitHub（模擬）：schemaVersion 14、有 blocks、desc 仍在（核取攤成「☑ 」「☐ 」）
   3. 其他卡片的 desc 跟原本相同；重新讀回來（normalize）blocks 不變
   4. 復原這次修改：存回原本的 desc
   5. 母議題、超連結在原位改（03 T7），點外面跟其他修改一起存回資料檔
   7. 03 審查 P0-1：檢視時切換勾選、行首尾空白、時間行切換勾選後點外面，種類、行 ID、timeId、時間標記不變（存回的資料檔與重新讀回來）
   6. 跳脫攻擊（03 T8；寬 900 的膠囊、1300 的右側詳情，檢視與編輯兩種狀態）：資料檔裡的卡片 ID、標題、每行文字、時間標記名稱、地點與 ID、
      行 ID、負責人名稱與 ID、標籤名與 ID、母議題名與 ID、超連結網址（含 javascript:）與文字都放惡意字串（github 模式的 ID 不會被過濾，原樣進屬性）；
      確認 window.__x 沒被設定、文字原樣顯示、沒有多出元素、超連結不是 javascript:、可以進入編輯並收合 */
const c=require('./common');const fs=require('fs');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'通過 ':'失敗 ')+m);if(v)passes++;else fails++};
(async()=>{
  const orig=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
  const {b,mk,login,remote}=await c.setup();
  const p=await mk(900,900,'light',false);
  await login(p);
  const live=orig.events.filter(e=>!e.doneAt),src=live.find(e=>e.desc&&!e.desc.includes('\n'))||live[0];
  ok((+orig.schemaVersion||0)<14&&!orig.events.some(e=>e.blocks),'測試資料是舊格式（schemaVersion 14 以前、沒有 blocks）');
  await p.evaluate(i=>{setSection('live',{instant:true});openEv.add(i);render()},src.id);await p.waitForTimeout(500);
  const v1=await p.evaluate(i=>[...document.querySelectorAll(`.ev[data-ev="${i}"] .kp-vl`)].map(x=>[x.querySelector('.kp-tx').textContent,!!x.querySelector('input')]),src.id);
  ok(v1.map(x=>x[0]).join('\n')===src.desc&&v1.every(x=>!x[1]),`舊卡片每行顯示成純文字（${v1.length} 行）`);
  const bid=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,src.id);
  await p.click(`.ev[data-ev="${src.id}"] [data-kpgo="${bid}"]`);await p.waitForTimeout(400);
  await p.keyboard.press('End');await p.keyboard.press('Enter');await p.keyboard.type('github 模式加的一行');
  const ln=`.ev[data-ev="${src.id}"] .kp-lines .kp-line:nth-child(2)`;
  await p.click(`${ln} .kp-type .csel-btn`);await p.waitForTimeout(250);await p.click(`${ln} .csel-opt[data-v="check"]`);await p.waitForTimeout(300);
  await p.click(`${ln} [data-kpck]`);await p.waitForTimeout(200);
  await p.click('#evH');await p.waitForTimeout(2500);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
  const r=remote(),e=r.events.find(x=>x.id===src.id);
  ok(await p.evaluate(()=>!editing&&kpSt&&kpSt.st==='ok'),'點外面：收合、已儲存');
  ok(r.schemaVersion===14&&e&&e.desc===src.desc+'\n☑ github 模式加的一行'&&Array.isArray(e.blocks)&&e.blocks.length===2&&e.blocks[1].check===true,
    `寫回的資料檔：schemaVersion 14、desc 仍在（${JSON.stringify(e&&e.desc)}）、blocks 有勾選`);
  const same=orig.events.filter(x=>x.id!==src.id).every(x=>{const y=r.events.find(z=>z.id===x.id);return y&&(y.desc||'')===(x.desc||'')});
  ok(same,'其他卡片的 desc 跟原本相同');
  const back=await p.evaluate(j=>normalize(JSON.parse(j)).events.find(x=>x.id===JSON.parse(j).events[0].id)&&normalize(JSON.parse(j)),JSON.stringify(r));
  ok(JSON.stringify(back.events.find(x=>x.id===src.id).blocks)===JSON.stringify(e.blocks),'重新讀回來 blocks 不變（行 ID、勾選）');
  await p.click(`.ev[data-ev="${src.id}"] [data-kpundo]`);await p.waitForTimeout(2500);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});
  const e2=remote().events.find(x=>x.id===src.id);
  ok(e2&&e2.desc===src.desc,'復原這次修改：資料檔存回原本的 desc');
  /* 5. 母議題、超連結在原位（沒有各欄的取消／完成） */
  const bid2=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,src.id);
  await p.click(`.ev[data-ev="${src.id}"] [data-kpgo="${bid2}"]`);await p.waitForTimeout(400);
  const S5=`.ev[data-ev="${src.id}"]`;
  ok(await p.evaluate(s=>!document.querySelector(`${s} [data-evpen],${s} [data-evfx]`)&&!!document.querySelector(`${s} [data-kpf=issue]`),S5),'母議題、超連結在原位（沒有各欄的取消／完成）');
  await p.click(`${S5} [data-kpf=issue] .csel-btn`);await p.waitForTimeout(250);await p.click(`${S5} [data-kpf=issue] .csel-opt:nth-child(2)`);await p.waitForTimeout(300);
  await p.click(`${S5} [data-kplkadd]`);await p.waitForTimeout(300);await p.keyboard.type('github 連結');await p.fill(`${S5} .kp-lk:last-of-type [data-e=url]`,'https://example.com/gh');
  await p.click('#evH');await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
  const e5=remote().events.find(x=>x.id===src.id),iss=orig.issues[0].id;
  ok(e5&&e5.issueId===iss&&e5.links.some(l=>l.name==='github 連結'&&l.url==='https://example.com/gh'),`點外面：母議題、超連結寫回資料檔（${JSON.stringify(e5&&[e5.issueId,e5.links.map(l=>l.name)])}）`);
  /* 7. 03 審查 P0-1：編輯器裡以 blocks 為準（勾選、行首尾空白、時間行勾選存回後，種類、行 ID、timeId、時間標記都不變） */
  {
    const id=src.id;
    await p.evaluate(async id=>{const ev=state.events.find(e=>e.id===id);ev.times=[{id:'tq',label:'開會',start:'2026-11-20T14:00',end:'',place:'',toIssue:false}];
      ev.blocks=[{id:'a1',text:'買水',check:false,timeId:null},{id:'a2',text:'開會',check:false,timeId:'tq'},{id:'a3',text:'純文字',check:null,timeId:null}];ev.desc=StoreMap.descOf(ev.blocks);
      await persist('x')},id);await p.waitForTimeout(1500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});
    const sv=async()=>{await p.click('#evH');await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300)};
    /* 存回的資料檔與重新讀回來（normalize）的那一張 */
    const got=async()=>{const r=remote(),e=r.events.find(x=>x.id===id),n=await p.evaluate(([j,id])=>normalize(JSON.parse(j)).events.find(x=>x.id===id),[JSON.stringify(r),id]);return {e,n}};
    const want=(x,checks,texts)=>x&&JSON.stringify(x.blocks.map(b=>[b.id,b.text,b.check,b.timeId]))===JSON.stringify([['a1',texts[0],checks[0],null],['a2',texts[1],checks[1],'tq'],['a3',texts[2],null,null]])
      &&x.times.length===1&&x.times[0].id==='tq'&&x.times[0].label===texts[1];
    const show=x=>JSON.stringify(x&&x.blocks.map(b=>[b.id,b.text,b.check,b.timeId]));
    await p.evaluate(i=>{openEv.add(i);render()},id);await p.waitForTimeout(300);
    /* a. 檢視時點核取框切換勾選 → 點外面 */
    await p.click(`.ev[data-ev="${id}"] .kp-view [data-kpck="a1"]`);await p.waitForTimeout(400);
    ok(await p.evaluate(id=>{const e=state.events.find(x=>x.id===id);return editing&&e.desc===StoreMap.descOf(e.blocks)},id),'P0-1 檢視時切換勾選：進入編輯，desc 跟 blocks 同步');
    await sv();let g=await got();
    ok(want(g.e,[true,false],['買水','開會','純文字'])&&want(g.n,[true,false],['買水','開會','純文字'])&&g.e.desc==='☑ 買水\n☐ 開會\n純文字',`P0-1 檢視時切換勾選後點外面：還是核取行（勾了）、行 ID 不變；重新讀回來一樣（${show(g.e)}）`);
    /* b. 行首、行尾有空白 → 點外面 */
    await p.click(`.ev[data-ev="${id}"] [data-kpgo="a1"]`);await p.waitForTimeout(400);
    await p.keyboard.press('Home');await p.keyboard.type('  ');await p.keyboard.press('End');await p.keyboard.type('  ');
    await p.click(`.ev[data-ev="${id}"] [data-kptx="a3"]`);await p.keyboard.press('End');await p.keyboard.type(' ');
    await sv();g=await got();
    ok(want(g.e,[true,false],['買水','開會','純文字'])&&want(g.n,[true,false],['買水','開會','純文字']),`P0-1 行首行尾加空白後點外面：去掉空白、種類與行 ID 不變；重新讀回來一樣（${show(g.e)}）`);
    /* c. 時間行切換勾選 → 點外面 */
    await p.click(`.ev[data-ev="${id}"] .kp-view [data-kpck="a2"]`);await p.waitForTimeout(400);
    await sv();g=await got();
    ok(want(g.e,[true,true],['買水','開會','純文字'])&&want(g.n,[true,true],['買水','開會','純文字']),`P0-1 時間行切換勾選後點外面：timeId 與時間標記還在、勾了；重新讀回來一樣（${show(g.e)}）`);
    /* d. 編輯中切換時間行的勾選、時間行行尾空白 → 點外面 */
    await p.click(`.ev[data-ev="${id}"] [data-kpgo="a2"]`);await p.waitForTimeout(400);
    await p.keyboard.press('End');await p.keyboard.type(' ');await p.click(`.ev[data-ev="${id}"] .kp [data-kpck="a2"]`);await p.waitForTimeout(200);
    await sv();g=await got();
    ok(want(g.e,[true,false],['買水','開會','純文字'])&&want(g.n,[true,false],['買水','開會','純文字']),`P0-1 編輯中切換時間行勾選＋行尾空白：時間行不變、時間標記名稱沒有多空白（${show(g.e)}）`);
  }
  ok(!p.errs.length,`沒有頁面錯誤（${p.errs.join(' | ')}）`);
  await b.close();

  /* 6. 跳脫攻擊 */
  const X1='<img src=x onerror=window.__x=1>',X2='"><svg onload=window.__x=1>',X3="' onmouseover='window.__x=1",XJ='javascript:window.__x=1';
  const EID='e'+X2,TID='t'+X1,FID='f'+X3,IID='i'+X2,MID='m'+X1,LID='l'+X3;
  const blocks=[{id:'L0',text:X1,check:null,timeId:null},{id:X2,text:X2,check:false,timeId:null},{id:'L2',text:X3,check:true,timeId:null},{id:'L3',text:'時間行',check:false,timeId:TID}];
  const bad=JSON.parse(JSON.stringify(orig));bad.schemaVersion=14;
  bad.issues.unshift({id:IID,title:X2+X1,tags:[],cur:0,start:'',end:'',doneAt:null,markers:[],links:[],note:''});
  bad.labels=[{id:LID,kind:'人',name:X1+X3}];
  bad.events.unshift({id:EID,name:X1+X2+X3,desc:[X1,'☐ '+X2,'☑ '+X3,'☐ 時間行'].join('\n'),blocks,createdAt:'2026-11-01',issueId:IID,staff:[MID],labels:[LID],
    links:[{id:'k1',name:X1,url:XJ,color:'#3b82f6'},{id:X2,name:X3,url:'https://example.com/'+X2,color:'#ef4444'}],
    times:[{id:TID,label:'時間行',start:'2026-11-20T14:00',end:'',place:X2,toIssue:false},{id:FID,label:X2+X1,start:'2026-11-21',end:'',place:X3,toIssue:false}],round:1,touched:[]});
  const tmp=require('os').tmpdir()+'/kp2-xss.json';fs.writeFileSync(tmp,JSON.stringify(bad));
  const q=v=>v.replace(/["\\]/g,m=>'\\'+m);   /* 屬性選擇器裡的引號、反斜線 */
  const xs=pg=>pg.evaluate(()=>{const root=document.querySelector('#livePanel');return {x:window.__x,extra:[...root.querySelectorAll('img,svg:not(.ico):not(.csel-chev):not([aria-hidden="true"]),script,iframe')].map(e=>e.outerHTML.slice(0,60)),
    on:[...root.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length,js:[...root.querySelectorAll('a[href]')].filter(a=>/^\s*javascript:/i.test(a.getAttribute('href'))).length}});
  const hover=async(g,sc)=>{for(const el of (await g.$$(`${sc} *`)).slice(0,100)){const bb=await el.boundingBox().catch(()=>null);if(bb&&bb.width&&bb.height&&bb.y>0&&bb.y<880)await g.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2)}};
  c.serveRemote=true;
  for(const [w,tag] of [[900,'膠囊 900'],[1300,'詳情 1300']]){
    const {b:b2,mk:mk2,login:login2,remote:rem2}=await c.setup(tmp);
    const g=await mk2(w,900,'light',false);await login2(g);
    rem2().members.push({id:MID,name:X1+X2,role:'member'});   /* 負責人：登入建立第一個身分後才加進資料檔，重新讀一次 */
    await g.goto(g.url());await g.waitForTimeout(1800);
    await g.evaluate(()=>setSection('live',{instant:true}));await g.waitForTimeout(400);
    const card=`.ev[data-ev="${q(EID)}"]`,sc=w>=1000?'#evDetail':card;
    if(w>=1000){await g.click(`${card}>summary`);await g.waitForTimeout(1000)}else{await g.evaluate(i=>{openEv.add(i);render()},EID);await g.waitForTimeout(500)}
    await hover(g,sc);
    let x=await xs(g);
    ok(x.x===undefined&&!x.extra.length&&!x.on&&!x.js,`${tag} 檢視：沒有執行、沒有多出元素或 on 屬性、沒有 javascript: 連結（${JSON.stringify(x)}）`);
    const v=await g.evaluate(([sc,card,w])=>{const q=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.textContent);
      return {title:w>=1000?document.querySelector('#evDetail .evd-head b').textContent:document.querySelector(`${card} summary b`).textContent,lines:q('.kp-vl .kp-tx'),
        par:(document.querySelector(`${sc} .evd-par,${sc} .ev-parent-full`)||{}).textContent,staff:q('.staff-chip'),lbl:q('.lbl-chip'),free:q('.ev-times .ev-t-label'),place:q('.ev-times .ev-t-place'),
        links:[...document.querySelectorAll(`${sc} .ev-links a`)].map(a=>[a.textContent,a.getAttribute('href')]),ev:(document.querySelector(card)||{dataset:{}}).dataset.ev}},[sc,card,w]);
    ok(v.ev===EID&&v.title===X1+X2+X3,`${tag} 檢視：卡片 ID（屬性）與標題原樣`);
    ok(JSON.stringify(v.lines)===JSON.stringify([X1,X2,X3,'時間行']),`${tag} 檢視：每行文字原樣（${JSON.stringify(v.lines)}）`);
    ok((v.par||'').includes(X2+X1)&&v.staff.includes(X1+X2)&&v.lbl.some(s=>s.includes(X1+X3)),`${tag} 檢視：母議題名、負責人名稱、標籤名原樣（${JSON.stringify([v.par,v.staff,v.lbl])}）`);
    ok(v.free.includes(X2+X1)&&v.place.some(s=>s.includes(X3)),`${tag} 檢視：沒連到行的時間標記名稱、地點原樣`);
    ok(v.links.some(([n,h])=>n===X1&&!/^javascript:/i.test(h))&&v.links.some(([n,h])=>n===X3&&h.startsWith('https://example.com/')),`${tag} 檢視：超連結文字原樣、javascript: 不會變成可執行的連結（${JSON.stringify(v.links)}）`);
    await g.click(`${sc} .kp-vl:nth-child(1) [data-kpgo]`);await g.waitForTimeout(700);
    await hover(g,sc);
    x=await xs(g);
    const e=await g.evaluate(sc=>{const v=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.value),t=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.textContent);
      return {editing,title:(document.querySelector(`${sc} [data-kptitle]`)||{}).value,lines:v('[data-kptx]'),free:v('[data-kplb]'),issue:t('[data-kpf=issue] .csel-v'),staff:t('[data-kpf=staff] .chip span'),
        lbl:t('[data-kpf=labels] .chip span'),lkn:v('.kp-lk [data-e=name]'),lku:v('.kp-lk [data-e=url]'),tm:t('.kp-lines:not(.kp-frees) .kp-tm').length}},sc);
    ok(x.x===undefined&&!x.extra.length&&!x.on,`${tag} 編輯：沒有執行、沒有多出元素或 on 屬性（${JSON.stringify(x)}）`);
    ok(e.editing&&e.title===X1+X2+X3&&JSON.stringify(e.lines)===JSON.stringify([X1,X2,X3,'時間行'])&&e.tm===1&&e.free.includes(X2+X1),`${tag} 編輯：標題、每行文字、時間行、沒連到行的時間標記原樣（${JSON.stringify(e)}）`);
    ok(e.issue[0]===X2+X1&&e.staff.includes(X1+X2)&&e.lbl.includes(X1+X3),`${tag} 編輯：母議題、負責人、標籤原樣（${JSON.stringify([e.issue,e.staff,e.lbl])}）`);
    ok(e.lkn.includes(X1)&&e.lkn.includes(X3)&&e.lku.includes(XJ),`${tag} 編輯：超連結名稱、網址原樣`);
    await g.click(`${sc} .kp-line [data-kptm]`);await g.waitForTimeout(400);x=await xs(g);
    ok(x.x===undefined&&!x.extra.length&&await g.evaluate(sc=>(document.querySelector(`${sc} .tp [data-tpf=place]`)||{}).value,sc)===X2,`${tag} 編輯：時間選取器的地點原樣、沒有執行`);
    await g.click(`${sc} .tp [data-tpok]`);await g.waitForTimeout(300);
    await g.click('#evH');await g.waitForTimeout(2500);await g.click('#dlg[open] [data-act=cancel]').catch(()=>{});await g.waitForTimeout(300);
    x=await xs(g);const saved=rem2().events.find(z=>z.id===EID);
    ok(x.x===undefined&&!x.extra.length&&await g.evaluate(()=>!editing)&&saved&&saved.name===X1+X2+X3&&saved.blocks.map(z=>z.text).join('|')===[X1,X2,X3,'時間行'].join('|'),`${tag}：點外面存回資料檔、文字照原樣、沒有執行`);
    const ge=g.errs.filter(m=>!/Failed to load resource/.test(m));ok(!ge.length,`${tag}：沒有頁面錯誤（${ge.join(' | ')}；模擬的 GitHub API 對其他檔案回 404 不算）`);
    await b2.close();
  }
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
