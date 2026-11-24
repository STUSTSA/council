/* hp1：主頁「部門／專案」切換與活動專案卡片（2026-11-24）。固定 8300 埠；活動部的資料用 route 模擬，不連 GitHub、不連 Firebase。
   1. 上排有切換；切到專案：桌面一排色塊、手機卡片堆，只列還沒結案的、照開始日期排、沒日期的排最後；名稱照字面顯示（跳脫）
   2. 連結到這個專案自己的專案頁（index.html?d=events&proj=ID，見 hp2.js）；切回部門：部門數量與原本的焦點都還在
   3. 活動部在新資料庫：用替身模組讀 issues（帶 open），沒登入也讀
   4. 沒有專案、讀不到：顯示一行說明，方向鍵不出錯
   5. 專案的自訂圖示（議題的 icon）：認得的名稱才顯示
   失敗會印 FAIL 並以非 0 結束。node hp1.js shot 另存截圖 */
const {chromium}=require('playwright');
let fails=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(!v)fails++};
const XSS='<img src=x onerror="window.__xss=1">',SHOT=process.argv[2]==='shot';
const ISS=[{id:'i3',title:'沒日期的專案',start:'',end:'',tags:['籌備'],cur:0},{id:'i2',title:'聖誕點燈',start:'2026-12-16',end:'2026-12-18',tags:['籌備','執行'],cur:1,icon:'flag'},
  {id:'i1',title:'校慶園遊會'+XSS,start:'2026-11-28',end:'2026-11-28',tags:['籌備'],cur:0,icon:'"><img src=x onerror="window.__xss=1'},{id:'i0',title:'結案的',start:'2026-09-01',end:'',doneAt:'2026-09-30T10:00',tags:[],cur:0}];
(async()=>{
  const b=await chromium.launch();
  const mk=async(w,h,touch,issues,sc)=>{const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block',colorScheme:sc||'light',deviceScaleFactor:SHOT?2:1});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route(/\/dept\/config\.js(\?|$)/,async r=>{const res=await r.fetch();r.fulfill({response:res,body:(await res.text()).replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1')})});
    await ctx.route(/\/data(-[a-z]+)?\.json/,r=>/data-events/.test(r.request().url())?(issues?r.fulfill({contentType:'application/json',body:JSON.stringify({events:[],issues})}):r.fulfill({status:500,body:''})):r.fulfill({contentType:'application/json',body:'{"events":[]}'}));
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',x=>p.errs.push(x.message));await p.goto('http://127.0.0.1:8300/home.html');await p.waitForTimeout(3500);return p};
  for(const [w,h,touch,nm] of [[1366,768,false,'桌面'],[412,900,true,'手機']]){
    const p=await mk(w,h,touch,ISS),card=touch?'.hm-wc':'.hm-tile';
    const n0=await p.evaluate(c=>({seg:!document.getElementById('hmSeg').hidden,n:document.querySelectorAll(c).length,ov:document.documentElement.scrollWidth>innerWidth}),card);
    ok(n0.seg&&n0.n>=9&&!n0.ov,`${nm}：上排有部門／專案切換、部門照舊（${n0.n} 張），沒有橫捲`);
    if(SHOT)await p.screenshot({path:`/mnt/project-files/home-projects/${nm==='桌面'?'desk':'mob'}_dept.png`});
    await p.click('#hmSeg [data-k="proj"]');await p.waitForTimeout(1500);
    const a=await p.evaluate(c=>({t:[...document.querySelectorAll(c)].map(x=>x.querySelector('.hm-nm').textContent),d:[...document.querySelectorAll(c)].map(x=>(x.querySelector('.hm-n')||{}).textContent||''),
      en:[...document.querySelectorAll(c)].map(x=>x.querySelector('.hm-en').textContent),href:document.querySelector(c).getAttribute('href'),img:document.querySelectorAll('#hmStage img').length,x:window.__xss,sel:document.querySelector('#hmSeg [data-k="proj"]').getAttribute('aria-selected')}),card);
    ok(a.t.length===3&&/^校慶園遊會/.test(a.t[0])&&a.t[1]==='聖誕點燈'&&a.t[2]==='沒日期的專案',`${nm}：專案三張（結案的不列），照日期排、沒日期的最後（${a.t.map(x=>x.slice(0,5))}）`);
    ok(a.d[0]==='11/28'&&a.d[1]==='12/16–12/18'&&a.d[2]===''&&a.en[1]==='執行',`${nm}：日期與目前階段（${a.d}｜${a.en}）`);
    ok(a.img===0&&!a.x,`${nm}：名稱裡的 <img onerror> 照字面顯示`);
    const ic=await p.evaluate(c=>[...document.querySelectorAll(c)].map(x=>x.querySelector('.hm-pji svg path')?1:0).join(''),card);
    ok(ic==='010',`${nm}：有挑圖示的專案卡片顯示圖示，不認得的圖示名稱當成沒有（${ic}）`);
    ok(a.href==='index.html?d=events&proj=i1'&&a.sel==='true',`${nm}：連到這個專案自己的專案頁（${a.href}）`);
    if(SHOT)await p.screenshot({path:`/mnt/project-files/home-projects/${nm==='桌面'?'desk':'mob'}_proj.png`});
    await p.keyboard.press(touch?'ArrowDown':'ArrowRight');await p.waitForTimeout(500);
    await p.click('#hmSeg [data-k="dept"]');await p.waitForTimeout(1200);
    ok(await p.evaluate(([c,n])=>document.querySelectorAll(c).length===n&&!!document.querySelector(c+' .hm-lg'),[card,n0.n]),`${nm}：切回部門，部門卡片都在`);
    ok(!p.errs.length,`${nm}：沒有錯誤（${p.errs.join('｜')}）`);await p.context().close()}
  {const p=await mk(1366,768,false,ISS);
    const r=await p.evaluate(async I=>{BOARD_DEPTS.find(d=>d.id==='events').source='firestore';window.__o=[];storeFsMod=Promise.resolve({issuesOf:async(cfg,d,o)=>{__o.push([d,!!(o&&o.open)]);return I}});
      document.querySelector('#hmSeg [data-k="proj"]').click();await new Promise(r=>setTimeout(r,1500));return {o:JSON.stringify(__o),n:document.querySelectorAll('.hm-tile').length}},ISS);
    ok(r.o==='[["events",true]]'&&r.n===3,`新資料庫：讀活動部的 issues（帶 open，${r.o}），${r.n} 張`);await p.context().close()}
  for(const [iss,txt] of [[[],'目前沒有進行中的專案'],[null,'讀不到專案，稍後再試']]){
    const p=await mk(1366,768,false,iss);await p.click('#hmSeg [data-k="proj"]');await p.waitForTimeout(1500);await p.keyboard.press('ArrowRight');await p.waitForTimeout(300);
    const t=await p.evaluate(()=>(document.querySelector('.hm-none')||{}).textContent);ok(t===txt&&!p.errs.length,`空的／讀不到：顯示「${t}」，沒有錯誤`);await p.context().close()}
  await b.close();console.log(fails?`\n${fails} 項失敗`:'\n全部通過');process.exit(fails?1:0)})();
