/* ui9logo：部門標誌跟著主題變色（docs/DESIGN.md「標誌色」；DievE 11/22 定）：黃零件（.dg-y）＝主題的 --mk-a、藍零件（.dg-b）＝--mk-b、橘零件（.dg-o）＝--mk-c，
   換主題檔案裡的藍黃不再寫死；原本就是白色的零件（秘書處 .dg-w）跟著所在底板的底色。github 模式，固定 8300 埠。
   1. 十三組主題 × 淺色／深色：主頁桌面 1300 的色塊、手機 412 的卡片堆、部門標題列（秘書處，有白色零件）：
      黃零件是 --mk-a、藍零件是 --mk-b、橘零件是 --mk-c；淺色底上黃零件對底板 ≥1.5、藍零件對底板 ≥1.5；白色零件＝所在底板的底色
   2. 進部門的過場（米黃、柔光，淺深各一）：桌面鋪滿時跟著飛的標誌（.hm-fxl）、手機翻面的部門底板（.hm-fb）、看板開頁的底板（.pfx-cover）同一條規則
   3. 標題列的標誌放進頁面（不是 <img>），沒有 pageerror
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const PALS=['fin','b3','ink','sage','mist','fire','pastel','neu','sun','sakura','forest','ocean','wisteria'];
/* 頁面裡：掃一個容器內所有標誌零件的填色；plate＝白色零件應該跟著的底板 */
const SCAN=([sel,plateSel])=>{const out=[];document.querySelectorAll(sel).forEach(h=>{const s=h.matches('svg')?h:h.querySelector('svg');if(!s)return;
  let pb='';if(plateSel==='--bg'){const t=document.createElement('i');t.style.background='var(--bg)';document.body.append(t);pb=getComputedStyle(t).backgroundColor;t.remove()}
  else if(plateSel){const pl=h.closest(plateSel);pb=pl?getComputedStyle(pl).backgroundColor:''}
  const fills=[...s.querySelectorAll('path,rect,circle,polygon')].map(e=>({c:e.getAttribute('class')||'',f:getComputedStyle(e).fill}));
  const ex=v=>{const t=document.createElement('i');t.style.color=`var(${v})`;document.body.append(t);const c=getComputedStyle(t).color;t.remove();return c};
  /* 底板顏色（零件對它的對比）：白色零件的 pb；其他用所在底板的底色 */
  let plate='';{const pl=plateSel&&plateSel!=='--bg'?h.closest(plateSel):null;if(plateSel==='--bg'){const t=document.createElement('i');t.style.background='var(--bg)';document.body.append(t);plate=getComputedStyle(t).backgroundColor;t.remove()}else if(pl)plate=getComputedStyle(pl).backgroundColor}
  out.push({d:s.dataset.d,pb,plate,exp:{y:ex('--mk-a'),b:ex('--mk-b'),o:ex('--mk-c')},fills})});return out};
const lumc=c=>{const m=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*m[0]+.7152*m[1]+.0722*m[2]};
const con=(a,b)=>{const x=lumc(a),y=lumc(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const judge=(list,dark,tag)=>{if(!list.length)return ok(false,`${tag}：找不到標誌`);
  const bad=[];let n=0;list.forEach(l=>l.fills.forEach(x=>{
    const want=/dg-y/.test(x.c)?l.exp.y:/dg-b/.test(x.c)?l.exp.b:/dg-o/.test(x.c)?l.exp.o:null;
    if(want){n++;if(x.f!==want)bad.push(`${l.d} ${x.c.trim()}=${x.f}≠${want}`);
      else if(!dark&&l.plate&&con(x.f,l.plate)<1.5)bad.push(`${l.d} ${x.c.trim()} 對底板只有 ${con(x.f,l.plate).toFixed(2)}`)}
    if(/dg-w/.test(x.c)&&l.pb&&x.f!==l.pb)bad.push(`${l.d} 白色零件 ${x.f}≠底板 ${l.pb}`)}));
  ok(!bad.length&&n>0,`${tag}：${list.length} 個標誌、${n} 個零件，黃＝--mk-a、藍＝--mk-b、橘＝--mk-c${dark?'':'、對底板 ≥1.5'}、白色零件跟底板${bad.length?' '+bad.slice(0,3).join('；'):''}`)};
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
  /* ---------- 4. 開關（.sw）開啟＝主題輔色 --acc2、圓點 --acc2-ink，不是綠色（DievE 11/22） ---------- */
  {const bad=[];const p=await mk(1300,860,'fin','light');await p.goto(U+'index.html');await p.waitForTimeout(800);
    for(const pal of PALS)for(const mode of ['light','dark']){
      const r=await p.evaluate(([pal,mode])=>{const h=document.documentElement;h.dataset.pal=pal;h.dataset.theme=mode;
        const e=document.createElement('button');e.className='sw on';e.innerHTML='<i></i>';e.style.transition='none';e.firstChild.style.transition='none';document.body.append(e);
        const x=i=>{const t=document.createElement('i');t.style.color=`var(${i})`;document.body.append(t);const c=getComputedStyle(t).color;t.remove();return c};
        const o={bg:getComputedStyle(e).backgroundColor,knob:getComputedStyle(e.firstChild).backgroundColor,a2:x('--acc2'),a2i:x('--acc2-ink'),ok:x('--ok'),blk:x('--blk')};e.remove();return o},[pal,mode]);
      if(r.bg!==r.a2||r.knob!==r.a2i)bad.push(`${pal}/${mode} 底 ${r.bg}≠${r.a2} 或圓點 ${r.knob}≠${r.a2i}`);
      else if(con(r.bg,r.blk)<1.5)bad.push(`${pal}/${mode} 開關對卡片底只有 ${con(r.bg,r.blk).toFixed(2)}`);
      else if(con(r.knob,r.bg)<2)bad.push(`${pal}/${mode} 圓點對開關底 ${con(r.knob,r.bg).toFixed(2)}`)}
    ok(!bad.length,`十三組主題 × 淺深色：開啟的開關底＝--acc2、圓點＝--acc2-ink，對卡片底 ≥1.5、圓點對底 ≥2${bad.length?' '+bad.slice(0,4).join('；'):''}`);await p.ctx.close()}
  ok(!errs.length,`沒有 pageerror${errs.length?'：'+errs.slice(0,3).join('；'):''}`);
  await b.close();console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0)})();
