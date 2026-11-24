/* fav2：會長室收藏的卡片打開方式與分區（2026-11-24）
   用 8300（CLAUDE.md 的準備方式）。開會長室（?d=president），在頁面裡放兩張自己的即時回報、塞一個別的部門的資料（fwCache）與兩筆收藏：
   1. 清單：自己的卡片在上、「收藏」小標（.cps-h）在中間、收藏的膠囊在下（名稱右邊寫部門）
   2. 電腦（1366）：點收藏的膠囊＝右邊詳情卡（跟自己的卡片同一個位置），唯讀：沒有報告／完成／刪除／工具列、沒有 data-ev、核取框停用；右上寫「部門 · 唯讀」
      點自己的卡片＝換成自己的；右鍵頭＝下一張收藏；Esc＝收回
   3. 手機（412）：點收藏的膠囊＝全螢幕卡片（#lcFull，膠囊留位置 .away），返回鍵收回
   SHOTS=資料夾 時存截圖。壞了以非 0 結束。 */
const {chromium}=require('playwright');
const SITE='http://127.0.0.1:8300/';
let fail=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(!c)fail++};
const seed=()=>{
  const dept=(window.BOARD_DEPTS||[]).find(d=>d.id!==CFG.deptId&&!d.follow);
  const mk=(id,name,o={})=>({id,name,desc:'',round:1,touchedAt:'2026-11-24T10:20',times:[],links:[],staff:[],labels:[],blocks:[],...o});
  const d=normalize({...JSON.parse(JSON.stringify(state)),issues:[],events:[
    mk('eA','校慶攤位協調'),mk('eB','宿舍網路問卷')]});
  /* 逐行內容在整理（normalize）之後才放：整理時 blocks 會照 desc 重建 */
  d.events[0].blocks=[{id:'b1',text:'確認攤位配置圖',check:true,timeId:null},{id:'b2',text:'跟總務處借桌椅',check:false,timeId:null},{id:'b3',text:'場地在三連堂前廣場',check:null,timeId:null}];d.events[0].desc=StoreMap.descOf(d.events[0].blocks);
  fwCache.set(dept.id,{at:Date.now(),data:d,err:''});
  state.events=normalize({...JSON.parse(JSON.stringify(state)),events:[mk('p1','與校長座談準備',{report:true}),mk('p2','學生會費說明會')]}).events;
  state.follows=[{id:'f1',dept:dept.id,kind:'live',ref:'eA'},{id:'f2',dept:dept.id,kind:'live',ref:'eB'}];
  setSection('live',{instant:true});render();return dept.name;
};
(async()=>{
  const b=await chromium.launch();
  const open=async(vp,dark)=>{
    const ctx=await b.newContext({viewport:vp,serviceWorkers:'block',colorScheme:dark?'dark':'light',deviceScaleFactor:process.env.SHOTS?2:1,hasTouch:vp.width<600});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:8300)/,r=>r.abort());
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.goto(SITE+'index.html?d=president');await p.waitForTimeout(1800);
    p.dept=await p.evaluate(seed);await p.waitForTimeout(500);return p};
  const shot=async(p,n)=>{if(process.env.SHOTS){await p.waitForTimeout(700);await p.screenshot({path:`${process.env.SHOTS}/${n}.png`})}};

  /* 電腦 */
  let p=await open({width:1366,height:800});
  const L=await p.evaluate(()=>[...document.querySelectorAll('#events .cps>*')].map(x=>x.classList.contains('cps-h')?'H:'+x.textContent:x.classList.contains('sepr')?'-':(x.classList.contains('fav-cp')?'F:':'O:')+x.querySelector('b').textContent));
  ok(L.join('|')==='O:與校長座談準備|-|O:學生會費說明會|H:收藏|F:校慶攤位協調|F:宿舍網路問卷',`清單順序：自己的 → 「收藏」小標 → 收藏的（${L.join('|')}）`);
  ok(await p.evaluate(n=>[...document.querySelectorAll('#events .fav-cp .cp-d')].every(x=>x.textContent===n),p.dept),'收藏的膠囊右邊寫部門');
  await shot(p,'電腦_清單');
  await p.click('#events .fav-cp');await p.waitForTimeout(700);
  const C=await p.evaluate(()=>{const c=document.querySelector('#evDetail>.lc');return c&&{k:c.dataset.lc,ro:c.classList.contains('ro'),ev:c.hasAttribute('data-ev'),
    act:c.querySelectorAll('[data-evrep],[data-lcdone],[data-lcdel],.lc-tools,[data-kpgo],[data-fav]').length,ck:[...c.querySelectorAll('input[type=checkbox]')].every(x=>x.disabled),
    tag:c.querySelector('.lc-nav .lc-tag')?.textContent,title:c.querySelector('.lc-title').textContent,split:document.querySelector('#liveMD').classList.contains('split'),sel:document.querySelector('#events .fav-cp').classList.contains('sel')}});
  ok(C&&C.k==='fav'&&C.split&&C.sel&&C.title==='校慶攤位協調','電腦：點收藏的膠囊＝右邊詳情卡（跟自己的卡片同一個位置）');
  ok(C&&C.ro&&!C.ev&&C.act===0&&C.ck,`唯讀：沒有報告／完成／刪除／工具列／可點的行，核取框停用（可操作的 ${C&&C.act} 個）`);
  ok(C&&C.tag===p.dept+' · 唯讀',`右上寫「${C&&C.tag}」`);
  await shot(p,'電腦_收藏卡片');
  await p.click('#evDetail .ln');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>!editing&&fvOpen&&!document.querySelector('.lc-ed')),'點內容不會進入編輯');
  await p.keyboard.press('ArrowRight');await p.waitForTimeout(700);
  ok(await p.evaluate(()=>document.querySelector('#evDetail .lc-title').textContent==='宿舍網路問卷'&&document.querySelector('#evDetail [data-lcstep="1"]').disabled),'右鍵＝下一張收藏（只在收藏之間換）');
  await p.click('#events .cp[data-cp="p2"]');await p.waitForTimeout(700);
  ok(await p.evaluate(()=>lvOpen==='p2'&&!fvOpen&&document.querySelector('#evDetail>.lc').dataset.lc==='live'),'點自己的卡片＝換成自己的');
  await shot(p,'電腦_自己的卡片');
  await p.click('#events .fav-cp');await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(600);
  ok(await p.evaluate(()=>!fvOpen&&!lvOpen&&document.querySelector('#evDetail').hidden),'Esc＝收回');
  ok(!p.errs.length,'電腦沒有頁面錯誤 '+p.errs.join('|'));await p.context().close();

  /* 手機（淺色、深色各一張圖） */
  for(const dark of [false,true]){
    p=await open({width:412,height:860},dark);
    await shot(p,'手機_清單'+(dark?'_深色':''));
    await p.tap('#events .fav-cp');await p.waitForTimeout(900);
    const M=await p.evaluate(()=>{const c=document.querySelector('#lcFull>.lc');return c&&{k:c.dataset.lc,full:c.classList.contains('full'),ro:c.classList.contains('ro'),back:!!c.querySelector('[data-lcback]'),away:document.querySelector('#events .fav-cp').classList.contains('away'),fab:!!document.querySelector('#addEvent:not([hidden])')}});
    ok(M&&M.k==='fav'&&M.full&&M.ro&&M.back&&M.away,`手機${dark?'深色':''}：點收藏的膠囊＝全螢幕唯讀卡片（膠囊留位置）`);
    await shot(p,'手機_收藏卡片'+(dark?'_深色':''));
    await p.tap('#lcFull [data-lcback]');await p.waitForTimeout(900);
    ok(await p.evaluate(()=>!fvOpen&&(!document.querySelector('#lcFull')||document.querySelector('#lcFull').hidden)&&!document.querySelector('#events .cp.away')),'返回鍵＝縮回膠囊');
    ok(!p.errs.length,'手機沒有頁面錯誤 '+p.errs.join('|'));await p.context().close();
  }
  await b.close();console.log(fail?`fav2：失敗 ${fail} 項`:'fav2：全部通過');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
