/* ui9logo：深色模式的部門標誌（docs/DESIGN-next.md 第二節：標誌的藍 #0a5baa、黃 #f0bc23 不跟主題變；深色時藍改成白 #fff、黃不變；
   原本就是白色的零件（秘書處 .dg-w）跟著所在底板的底色。DievE 11/16 定、11/19 確認）。github 模式，固定 8300 埠。
   1. 十三組主題 × 淺色／深色：主頁桌面 1300 的色塊、手機 412 的卡片堆、部門標題列（秘書處，有白色零件）：
      深色時標誌裡沒有任何零件是 #0a5baa、藍零件（.dg-b）是白、黃零件是 #f0bc23；淺色時藍零件是 #0a5baa；白色零件＝所在底板的底色
   2. 進部門的過場（米黃、柔光，淺深各一）：桌面鋪滿時跟著飛的標誌（.hm-fxl）、手機翻面的部門底板（.hm-fb）、看板開頁的底板（.pfx-cover）同一條規則
   3. 標題列的標誌放進頁面（不是 <img>），沒有 pageerror
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const PALS=['fin','b3','ink','sage','mist','fire','pastel','neu','sun','sakura','forest','ocean','wisteria'];
const BLUE='rgb(10, 91, 170)',YEL='rgb(240, 188, 35)',WHITE='rgb(255, 255, 255)';
/* 頁面裡：掃一個容器內所有標誌零件的填色；plate＝白色零件應該跟著的底板 */
const SCAN=([sel,plateSel])=>{const out=[];document.querySelectorAll(sel).forEach(h=>{const s=h.matches('svg')?h:h.querySelector('svg');if(!s)return;
  let pb='';if(plateSel==='--bg'){const t=document.createElement('i');t.style.background='var(--bg)';document.body.append(t);pb=getComputedStyle(t).backgroundColor;t.remove()}
  else if(plateSel){const pl=h.closest(plateSel);pb=pl?getComputedStyle(pl).backgroundColor:''}
  const fills=[...s.querySelectorAll('path,rect,circle,polygon')].map(e=>({c:e.getAttribute('class')||'',f:getComputedStyle(e).fill}));
  out.push({d:s.dataset.d,pb,fills})});return out};
const judge=(list,dark,tag)=>{if(!list.length)return ok(false,`${tag}：找不到標誌`);
  const bad=[];list.forEach(l=>l.fills.forEach(x=>{
    if(dark&&x.f===BLUE)bad.push(`${l.d} ${x.c} 還是藍`);
    if(/dg-b/.test(x.c)&&x.f!==(dark?WHITE:BLUE))bad.push(`${l.d} ${x.c}=${x.f}`);
    if(/dg-y/.test(x.c)&&x.f!==YEL)bad.push(`${l.d} ${x.c}=${x.f}`);
    if(/dg-w/.test(x.c)&&l.pb&&x.f!==l.pb)bad.push(`${l.d} 白色零件 ${x.f}≠底板 ${l.pb}`)}));
  const nb=list.reduce((n,l)=>n+l.fills.filter(x=>x.f===BLUE).length,0);
  ok(!bad.length&&(dark?nb===0:nb>0),`${tag}：${list.length} 個標誌，${dark?'沒有 #0a5baa、藍零件是白':'藍零件是 #0a5baa'}、黃不變、白色零件跟底板（藍 ${nb} 處）${bad.length?' '+bad.slice(0,3).join('；'):''}`)};
(async()=>{const b=await chromium.launch();
  const mk=async(w,h,pal,mode)=>{const touch=w<700;const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.addInitScript(([pal,mode])=>{try{localStorage.setItem('stustsa-ui',JSON.stringify({pal,mode,sound:false}))}catch(_){}},[pal,mode]);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;return p};
  const errs=[];
  /* ---------- 1. 十三組主題 × 淺深 ---------- */
  for(const pal of PALS)for(const mode of ['light','dark']){const dark=mode==='dark',T=`${pal} ${mode}`;
    {const p=await mk(1300,860,pal,mode);await p.goto(U+'home.html');await p.waitForFunction(()=>document.querySelectorAll('.hm-tile .hm-lg svg').length>=9,null,{timeout:8000}).catch(()=>{});
      judge(await p.evaluate(SCAN,['.hm-tile .hm-lg','.hm-tile']),dark,`${T} 桌面色塊`);errs.push(...p.errs);await p.ctx.close()}
    {const p=await mk(412,860,pal,mode);await p.goto(U+'home.html');await p.waitForFunction(()=>document.querySelectorAll('.hm-wc .hm-lg svg').length>=9,null,{timeout:8000}).catch(()=>{});
      judge(await p.evaluate(SCAN,['.hm-wc .hm-lg','.hm-wc']),dark,`${T} 手機卡片堆`);errs.push(...p.errs);await p.ctx.close()}
    {const p=await mk(pal==='fin'?412:1300,860,pal,mode);await p.goto(U+'index.html?d=secretariat');await p.waitForFunction(()=>!!document.querySelector('.dhead .dh-logo svg'),null,{timeout:8000}).catch(()=>{});
      const r=await p.evaluate(SCAN,['.dhead .dh-logo','--bg']);judge(r,dark,`${T} 部門標題列（秘書處）`);errs.push(...p.errs);await p.ctx.close()}
  }
  /* ---------- 2. 進部門的過場 ---------- */
  for(const pal of ['fin','neu'])for(const mode of ['light','dark']){const dark=mode==='dark',T=`${pal} ${mode}`;
    {const p=await mk(1300,860,pal,mode);await p.goto(U+'home.html');await p.waitForFunction(()=>document.querySelectorAll('.hm-tile .hm-lg svg').length>=9,null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(2600);
      await p.evaluate(()=>{const ts=[...document.querySelectorAll('.hm-tile')],i=ts.findIndex(t=>t.getAttribute('href').includes('secretariat'));window.__fx=null;
        new MutationObserver((m,o)=>{const l=document.querySelector('.hm-fxl svg');if(l&&!window.__fx){window.__fx=1;o.disconnect()}}).observe(document.body,{childList:true,subtree:true});ts[i].click()});
      await p.waitForTimeout(900);await p.evaluate(()=>document.querySelector('.hm-tile.on').click());await p.waitForFunction(()=>!!document.querySelector('.hm-fxl svg'),null,{timeout:3000}).catch(()=>{});
      const r=await p.evaluate(SCAN,['.hm-fxl svg',null]);judge(r,dark,`${T} 桌面鋪滿時跟著飛的標誌`);
      await p.waitForURL(/secretariat/,{timeout:6000}).catch(()=>{});
      const cv=await p.waitForFunction(()=>{const c=document.querySelector('.pfx-cover');return c&&c.querySelector('svg .dg-b')?1:0},null,{timeout:4000}).then(()=>p.evaluate(SCAN,['.pfx-cover svg','.pfx-cover'])).catch(()=>[]);
      judge(cv,dark,`${T} 看板開頁的色塊底板`);errs.push(...p.errs);await p.ctx.close()}
    {const p=await mk(412,860,pal,mode);await p.goto(U+'home.html');await p.waitForFunction(()=>document.querySelectorAll('.hm-wc .hm-lg svg').length>=9,null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(2600);
      const rf=await p.evaluate(()=>{const c=document.querySelector('.hm-wc.on'),r=c.getBoundingClientRect();return [r.left+r.width/2,r.top+60]});
      await p.mouse.click(rf[0],rf[1]);
      const fb=await p.waitForFunction(()=>!!document.querySelector('.hm-fb svg'),null,{timeout:3000}).then(()=>p.evaluate(SCAN,['.hm-fb svg','.hm-fb'])).catch(()=>[]);
      judge(fb,dark,`${T} 手機翻面的部門底板`);
      await p.waitForURL(/index\.html/,{timeout:6000}).catch(()=>{});
      const cv=await p.waitForFunction(()=>{const c=document.querySelector('.pfx-cover');return c&&c.querySelector('svg .dg-b')?1:0},null,{timeout:4000}).then(()=>p.evaluate(SCAN,['.pfx-cover svg','.pfx-cover'])).catch(()=>[]);
      judge(cv,dark,`${T} 看板開頁的翻面底板`);errs.push(...p.errs);await p.ctx.close()}
  }
  /* ---------- 3. 標題列不是 <img> ---------- */
  {const p=await mk(1300,860,'fin','light');await p.goto(U+'index.html');await p.waitForTimeout(1500);
    const r=await p.evaluate(()=>({img:document.querySelectorAll('.dhead img').length,svg:document.querySelector('.dhead .dh-logo svg')?.dataset.d,ah:document.querySelector('.dhead .dh-logo')?.getAttribute('aria-hidden')}));
    ok(r.img===0&&r.svg==='rights'&&r.ah==='true',`標題列的部門標誌放進頁面（${r.svg}），不是 <img>、aria-hidden`);errs.push(...p.errs);await p.ctx.close()}
  ok(!errs.length,`沒有 pageerror${errs.length?'：'+errs.slice(0,3).join('；'):''}`);
  await b.close();console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0)})();
