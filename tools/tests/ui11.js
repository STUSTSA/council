/* ui11：2026-11-20 ui-11（docs/交接說明.md 該節）。github 模式（data_test.json），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   A. 會長室管理「儲存空間用量」：firestore 模式＋總管理員才有這一列；點了在新分頁開 Firebase 主控台的用量頁（projectId 照 dept/config.js、encodeURIComponent），
      新分頁沒有 opener（noopener）；凍結中、github 模式、projectId 空白時沒有這一列；列上沒有小字。
      firestore 模式用替身：把這個部門的 source 改成 firestore、acct 填成已登入的總管理員、acctLoad 換成不載入 Firebase 的替身（不開模擬器、不連任何專案）。
   B. 母議題處理紀錄：時間行寫進來的那一筆，那一行還沒勾＝處理紀錄與甘特圖註記半透明（.pend，opacity .5）；在卡片裡勾了、存檔後變回不透明；取消勾選回到半透明。
      沒有核取框的舊時間標記、找不到來源卡片（卡片刪掉＝連結拿掉、evId 指到不存在的卡片）＝不透明。
   C. 卡片已滿 50 行（沒有時間行）時按「時間」「地點」：不換到空白的時間頁，提示「最多 50 行」。
   D. 會長室管理「紀錄」的動作：遷移與匯入的 start、import、done、failed、rollingBack、rolledBack、delete 顯示中文；匯入的卡片不再寫成「刪除卡片」。
   E. 進度頁沒有議題時：已登入寫「還沒有議題。」（不再叫人登入）；沒登入照舊；唯讀「目前沒有進行中的議題。」。
   外部請求：本機以外、測試沒有模擬的請求一律攔下並記下來，最後要是空的。
   截圖（UI11SHOT＝資料夾時才拍，不 commit）：A 的設定列、B 的處理紀錄與甘特圖註記，412 深色、1300 淺色柔光。
   失敗會印 FAIL 並以非 0 結束 */
const pw=require('playwright');
const ext=[];
{const L=pw.chromium.launch.bind(pw.chromium);   /* 每個 context 最先登記一條全攔（最後才比對；common.js 與下面的 route 優先） */
  pw.chromium.launch=async o=>{const b=await L(o),nc=b.newContext.bind(b);
    b.newContext=async o2=>{const ctx=await nc(o2);await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(['127.0.0.1','localhost'].includes(u.hostname))return r.fallback();ext.push(u.href.slice(0,120));return r.abort()});return ctx};return b}}
const c=require('./common');
const SHOT=process.env.UI11SHOT||'';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const ISS='imvpc3f0dcpi6',EV='emvpd2q3bes2i';
const USAGE=`https://console.firebase.google.com/project/${require('fs').readFileSync(require('path').join(__dirname,'..','..','dept','config.js'),'utf8').match(/projectId: "([^"]+)"/)[1]}/usage`;   /* 專案 ID 照 dept/config.js（不寫死，換專案時不用改測試） */
/* firestore 模式的替身：這個部門 source＝src、已登入的總管理員、acctLoad 不載入 Firebase */
const fsFake=(p,src)=>p.evaluate(src=>{BOARD_DEPTS.find(d=>d.id===CFG.deptId).source=src;acct.ready=true;acct.user={uid:'u1',email:'a@example.com',name:'總管'};acct.roles={super:true,depts:{}};acctMod=Promise.resolve({})},src);
const hubRows=async(p,sel)=>{await p.evaluate(()=>{if(setOpen)closeSettings(true)});await p.waitForTimeout(300);
  await p.click('#setBtn');await p.waitForTimeout(900);
  const has=await p.$('#setOv [data-set="council"]');if(!has)return null;
  await p.click('#setOv [data-set="council"]');await p.waitForTimeout(900);
  return p.evaluate(sel=>[...document.querySelectorAll(sel+' .set-hub:not([hidden]) [data-hub]')].map(b=>({k:b.dataset.hub,t:b.textContent.trim(),small:!!b.querySelector('small')})),sel)};
/* B 的資料：卡片 EV 連到議題 ISS；一行有核取框的時間行（寫進母議題）＋一個沒有連到行的舊時間標記（也寫進母議題） */
const seedB=p=>p.evaluate(([iss,evId])=>{const ev=state.events.find(e=>e.id===evId);ev.issueId=iss;
  ev.times=[{id:'tP',label:'待勾的事',start:'2026-11-10T10:00',end:'',place:'',toIssue:true},{id:'tF',label:'舊的時間標記',start:'2026-11-12',end:'',place:'',toIssue:true}];
  ev.blocks=[{id:'bP',text:'待勾的事',check:false,timeId:'tP'},{id:'bT',text:'一般文字',check:null,timeId:null}];
  ev.desc=StoreMap.descOf(ev.blocks);syncLink(ev);render()},[ISS,EV]);
/* 甘特圖這個議題的註記（看標籤文字）與處理紀錄（logHTML）各自是不是 .pend、算出來的透明度 */
const marks=p=>p.evaluate(iss=>{const it=state.issues.find(i=>i.id===iss);
  const g=[...document.querySelectorAll(`#gantt .g-issue[data-jump="${iss}"] .g-mk`)].map(x=>({t:x.querySelector('.lbl').textContent,pend:x.classList.contains('pend'),op:getComputedStyle(x).opacity}));
  const box=document.createElement('div');box.innerHTML=logHTML(it);document.body.append(box);
  const l=[...box.querySelectorAll('.log li')].map(x=>({t:x.textContent,pend:x.classList.contains('pend'),op:getComputedStyle(x).opacity}));box.remove();
  const f=(a,re)=>a.find(x=>re.test(x.t))||{};
  return {gP:f(g,/待勾的事/),gF:f(g,/舊的時間標記/),lP:f(l,/待勾的事/),lF:f(l,/舊的時間標記/),others:l.filter(x=>!/待勾的事|舊的時間標記/.test(x.t)).every(x=>!x.pend)}},ISS);
const outside=async p=>{await p.mouse.click(60,860);await p.waitForTimeout(800)};

(async()=>{
  const {b,mk,login,remote}=await c.setup();
  const p=await mk(1300,900,'light',false);
  await p.context().route('https://console.firebase.google.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>usage</title>'}));

  /* E1. 沒登入（github 模式）：照舊 */
  {const t=await p.evaluate(()=>{state.issues.forEach(i=>i._keep=i.doneAt);state.issues.forEach(i=>i.doneAt=i.doneAt||'2026-01-01');render();return $('#gantt .empty')&&$('#gantt .empty').textContent});
    ok(t==='還沒有議題，登入後按「+ 議題」開始。',`沒登入的空狀態照舊（${t}）`);}

  await login(p);await p.waitForTimeout(400);

  /* E2. 已登入＋可編輯：只寫狀態；E3. 唯讀：照舊 */
  {const t=await p.evaluate(()=>{render();return $('#gantt .empty').textContent});
    ok(t==='還沒有議題。',`已登入的空狀態：「還沒有議題。」，不叫人登入（${t}）`);
    const t2=await p.evaluate(()=>{state.locked=true;render();const v=$('#gantt .empty').textContent;state.locked=false;state.issues.forEach(i=>{i.doneAt=i._keep||null;delete i._keep});render();return v});
    ok(t2==='目前沒有進行中的議題。',`唯讀的空狀態照舊（${t2}）`);}

  /* B. 母議題處理紀錄的半透明 */
  await seedB(p);await p.waitForTimeout(400);
  {const r=await marks(p);
    ok(r.gP.pend&&r.gP.op==='0.5'&&r.lP.pend&&r.lP.op==='0.5',`那一行還沒勾：甘特圖註記與處理紀錄半透明（註記 ${r.gP.op}、紀錄 ${r.lP.op}）`);
    ok(r.gF.t&&!r.gF.pend&&r.gF.op==='1'&&r.lF.t&&!r.lF.pend&&r.others,`沒有核取框的舊時間標記、其他紀錄：不透明（${JSON.stringify([r.gF,r.lF])}）`);
    const m=await p.evaluate(([iss,evId])=>state.issues.find(i=>i.id===iss).markers.filter(x=>x.evId===evId).map(x=>Object.keys(x).sort().join(',')),[ISS,EV]);
    ok(m.length===2&&m.every(k=>k.split(',').every(x=>['at','date','evId','id','pos','stage','text','tmId'].includes(x))),`議題的 markers 沒有多存欄位（${m.join(' | ')}）`);}
  /* 在卡片裡勾：存檔後註記與紀錄變回不透明；遠端這一行 check=true */
  await p.click(`#events .cp[data-cp="${EV}"]`);await p.waitForTimeout(900);
  await p.click('#evDetail .ln.tm .ln-dot[data-kpck="bP"]');await p.waitForTimeout(500);await outside(p);await p.waitForTimeout(300);
  {const r=await marks(p),rm=(remote().events.find(e=>e.id===EV)||{}).blocks||[];
    ok(!r.gP.pend&&r.gP.op==='1'&&!r.lP.pend&&r.lP.op==='1',`在卡片裡勾了、存檔：註記與紀錄不透明（${r.gP.op}／${r.lP.op}）`);
    ok((rm.find(x=>x.id==='bP')||{}).check===true,'存檔：遠端這一行 check=true');}
  /* 取消勾選：回到半透明 */
  await p.click('#evDetail .ln.tm .ln-dot[data-kpck="bP"]');await p.waitForTimeout(500);await outside(p);await p.waitForTimeout(300);
  {const r=await marks(p);ok(r.gP.pend&&r.gP.op==='0.5'&&r.lP.pend&&r.lP.op==='0.5',`取消勾選、存檔：回到半透明（${r.gP.op}／${r.lP.op}）`);}
  if(SHOT){for(const [w,h,sc] of [[412,860,'dark'],[1300,900,'light']]){const q=await mk(w,h,sc,w<900);
      await q.evaluate(sc=>{localStorage.setItem('stustsa-ui',JSON.stringify(sc==='light'?{pal:'neu',mode:'light',sound:false}:{pal:'fin',mode:'dark',sound:false}))},sc);await q.reload();await q.waitForTimeout(1600);
      await seedB(q);await q.evaluate(()=>{const t=document.querySelector('.tb-tabs [data-tab="progress"]');if(t)t.click()});await q.waitForTimeout(900);
      await q.evaluate(iss=>{const r=document.querySelector(`#gantt .g-issue[data-jump="${iss}"]`);r&&r.scrollIntoView({block:'center'})},ISS);await q.waitForTimeout(500);
      await q.screenshot({path:`${SHOT}/B-gantt-${w}-${sc}.png`});
      await q.evaluate(iss=>{const a=document.querySelector(`#gantt a[data-jump="${iss}"]`);a&&a.click()},ISS);await q.waitForTimeout(1200);
      await q.evaluate(()=>{const l=document.querySelector('#cardDetail .log');l&&l.scrollIntoView({block:'center'})});await q.waitForTimeout(500);
      await q.screenshot({path:`${SHOT}/B-log-${w}-${sc}.png`});await q.context().close()}}
  /* 找不到來源：卡片刪掉（連結拿掉）、evId 指到不存在的卡片＝不透明 */
  {const r=await p.evaluate(([iss,evId])=>{const it=state.issues.find(i=>i.id===iss);it.markers.push({id:'mGone',evId:'eGone',tmId:'tGone',at:50,date:'2026-11-11',text:'來源不見了',stage:'',pos:'down'});
      const a=mkPending(it.markers.find(m=>m.id==='mGone'));const ev=state.events.find(e=>e.id===evId);unlinkEv(ev);
      const b=it.markers.filter(m=>/待勾的事/.test(m.text)).map(mkPending);return {a,b,ck:ev.blocks.find(x=>x.id==='bP').check}},[ISS,EV]).catch(e=>({err:e.message}));
    ok(!r.err&&r.a===false&&r.b.length===1&&r.b[0]===false&&r.ck===false,`找不到來源（evId 指到不存在的卡片、卡片刪掉拿掉連結）：不透明（${JSON.stringify(r)}）`);}
  await p.evaluate(()=>{if(editing&&typeof kpCommit==='function')kpCommit()});await p.waitForTimeout(600);await p.reload();await p.waitForTimeout(1800);

  /* C. 50 行時按「時間」「地點」 */
  {const r=await p.evaluate(async evId=>{const ev=state.events.find(e=>e.id===evId);ev.times=[];ev.blocks=Array.from({length:StoreMap.BLK_MAX},(_,i)=>({id:'b'+i,text:'第 '+i+' 行',check:null,timeId:null}));ev.desc=StoreMap.descOf(ev.blocks);render();
      lcShow('live',evId);await new Promise(r=>setTimeout(r,700));const ok1=await kpStart(evId,{focus:null});await new Promise(r=>setTimeout(r,300));
      const out={ok1};for(const k of ['time','place']){document.querySelector(`.lc-ed [data-lctool="${k}"]`).click();await new Promise(r=>setTimeout(r,400));
        out[k]={pane:lvPane,te:document.querySelectorAll('.lc-ed .lc-body .te').length,lns:document.querySelectorAll('.lc-ed .ln').length,st:(document.querySelector('.lc-ed .kp-st')||{}).textContent,n:ev.blocks.length,tm:ev.times.length}}
      return out},EV).catch(e=>({err:e.message}));
    ok(!r.err&&r.ok1&&r.time.pane===null&&r.time.te===0&&r.time.lns===50&&r.time.st==='最多 50 行'&&r.time.n===50&&r.time.tm===0,`50 行按「時間」：不換到空白的時間頁、提示「最多 50 行」（${JSON.stringify(r.time||r)}）`);
    ok(!r.err&&r.place&&r.place.pane===null&&r.place.lns===50&&r.place.st==='最多 50 行',`50 行按「地點」：同上（${JSON.stringify(r.place||r)}）`);
    await p.keyboard.press('Escape');await p.waitForTimeout(600);}

  /* D. 紀錄的動作中文 */
  {const r=await p.evaluate(()=>{const mk=(col,action,o={})=>auditWhat({col,docId:'x123456789',rev:1,action,actor:'u1',before:{},after:{},ref:'',...o});
      const xs=[mk('migrations','start'),mk('migrations','done'),mk('migrations','failed'),mk('migrations','rollingBack'),mk('migrations','rolledBack'),mk('issues','import'),mk('labels','import'),mk('cards','import'),mk('deptSettings','import'),mk('legacyIdentities','import'),mk('grants','import'),mk('org','delete')];
      return {acts:xs.map(x=>x.act),purge:mk('cards','purge',{before:{title:'某卡片',deptId:'rights'}}).act,del:mk('issues','delete',{before:{title:'某議題'}}).act}});
    ok(r.acts.every(a=>a&&!/[A-Za-z]/.test(a)),`遷移與匯入的動作都是中文（${r.acts.join('、')}）`);
    ok(r.acts[7]==='匯入'&&r.purge==='刪除卡片'&&r.del==='刪除議題',`匯入的卡片寫「匯入」、刪除卡片照舊、刪除議題照舊（${r.acts[7]}／${r.purge}／${r.del}）`);}

  /* A. 儲存空間用量 */
  {const g=await p.evaluate(()=>typeof usageUrl==='function'?usageUrl():'(none)');ok(g===''||g==='(none)',`github 模式：沒有用量網址（${g}）`);
    const gs=await hubRows(p,'#setOv .set-pane');ok(gs===null,'github 模式：設定清單沒有會長室管理（也就沒有儲存空間用量）');}
  await fsFake(p,'firestore');
  {const rows=await hubRows(p,'#setOv .set-pane'),u=(rows||[]).find(x=>x.k==='usage');
    ok(!!u&&u.t==='儲存空間用量'&&!u.small,`firestore＋總管理員：會長室管理有「儲存空間用量」一列、列上沒有小字（${JSON.stringify(rows&&rows.map(x=>x.t))}）`);
    if(u){const [pg]=await Promise.all([p.context().waitForEvent('page',{timeout:5000}),p.click('#setOv .set-pane [data-hub="usage"]')]);await pg.waitForLoadState().catch(()=>{});
      const o=await pg.evaluate(()=>({op:window.opener,ref:document.referrer})).catch(e=>({err:e.message}));
      ok(pg.url()===USAGE,`點了開新分頁：${pg.url()}`);ok(!o.err&&o.op===null&&o.ref==='',`新分頁沒有 opener、不帶 referrer（${JSON.stringify(o)}）`);
      const still=await p.evaluate(()=>!!document.querySelector('#setOv .set-pane .set-hub:not([hidden]) [data-hub="usage"]'));ok(still,'看板這一頁留在會長室管理（沒有換頁）');await pg.close()}
    const enc=await p.evaluate(()=>{const k=CFG.firebase.projectId;CFG.firebase.projectId='a/b c';const v=usageUrl();CFG.firebase.projectId=k;return v});
    ok(enc==='https://console.firebase.google.com/project/a%2Fb%20c/usage',`projectId 經過 encodeURIComponent（${enc}）`);
    if(SHOT){for(const [w,h,sc] of [[412,860,'dark'],[1300,900,'light']]){const q=await mk(w,h,sc,w<900);
        await q.evaluate(sc=>{localStorage.setItem('stustsa-ui',JSON.stringify(sc==='light'?{pal:'neu',mode:'light',sound:false}:{pal:'fin',mode:'dark',sound:false}))},sc);await q.reload();await q.waitForTimeout(1600);
        await fsFake(q,'firestore');await hubRows(q,w<900?'#setSub':'#setOv .set-pane');await q.waitForTimeout(600);
        await q.screenshot({path:`${SHOT}/A-usage-${w}-${sc}.png`});await q.context().close()}}}
  {const k=await p.evaluate(()=>{const k=CFG.firebase.projectId;CFG.firebase.projectId='';return k});
    const rows=await hubRows(p,'#setOv .set-pane');await p.evaluate(k=>{CFG.firebase.projectId=k},k);
    ok(rows&&rows.length&&!rows.some(x=>x.k==='usage'),`projectId 空白：沒有這一列（${JSON.stringify(rows&&rows.map(x=>x.k))}）`);}
  await fsFake(p,'frozen');
  {const rows=await hubRows(p,'#setOv .set-pane');ok(rows&&rows.length&&!rows.some(x=>x.k==='usage'),`凍結中：會長室管理照舊、沒有儲存空間用量（${JSON.stringify(rows&&rows.map(x=>x.k))}）`);}
  await fsFake(p,'firestore');await p.evaluate(()=>{acct.roles={super:false,depts:{rights:'admin'}}});
  {const rows=await hubRows(p,'#setOv .set-pane');ok(rows===null,'不是總管理員：沒有會長室管理（也就沒有這一列）');}

  const errs=p.errs.filter(x=>!/Failed to load resource: the server responded with a status of 404/.test(x));   /* 模擬的 GitHub API 對資料檔以外回 404（common.js），瀏覽器會記一筆 */
  ok(errs.length===0,`沒有頁面錯誤${errs.length?'：'+errs.slice(0,3).join(' | '):''}`);
  ok(ext.length===0,`沒有預期外的外部請求${ext.length?'：'+ext.slice(0,5).join(' | '):''}`);
  console.log(`\n${passes} 通過、${fails} 失敗`);await b.close();process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL 例外：'+e.message);process.exit(1)});
