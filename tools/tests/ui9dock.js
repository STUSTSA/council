/* ui9dock：ui-09 O——主頁進部門後，部門頁底部正中不能留下深色小膠囊（主頁下排或過場的殘影）。github 模式，固定 8300 埠。
   原因（ui-09 查到）：看板開頁浮上來的動畫（pagefx.js）把本來透明的提示膠囊 #toast 挑成一個區塊、淡到 1，被別的換頁接手時還會卡在 fill:both。
   桌面 1920 與手機 412（翻面過場）各跑三種進入方式：
   1. 直接打開部門網址  2. 從主頁點進去（桌面點焦點色塊、手機點焦點卡）  3. 進去之後按瀏覽器返回、再前進
   每一種：過場期間每 60ms 取樣，#toast 的 opacity 一直是 0；過場結束後頁面上沒有主頁的節點（.hm-*）、過場分身（.hm-fx、.hm-fxl、.hm-flw）、底板（.pfx-cover）；
   畫面底部正中沒有看板本身（工具列、新增鈕）以外的可見元件。
   另外：從主頁進部門時下排（.hm-dock）往下沉並淡出（MO.base 280ms、出場曲線、只動 transform／opacity）；按返回回到主頁時從底部浮回來（柔回彈），最後是不透明、沒有位移。
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const HOOK=()=>{window.__dock=[];const o=Element.prototype.animate;Element.prototype.animate=function(k,t){try{if(this.classList&&this.classList.contains('hm-dock'))window.__dock.push({k:JSON.parse(JSON.stringify(k)),t:typeof t==='object'?{duration:t.duration,easing:t.easing}:{duration:t}})}catch(_){}return o.call(this,k,t)}};
/* 頁面裡：過場期間取樣 #toast 的最大 opacity（交給 window.__tmax） */
const SAMPLE=()=>{const go=()=>{window.__tmax=0;const t0=performance.now();const tick=()=>{const e=document.getElementById('toast');if(e)window.__tmax=Math.max(window.__tmax,+getComputedStyle(e).opacity);if(performance.now()-t0<3200)setTimeout(tick,60)};tick()};go();addEventListener('pageshow',e=>{if(e.persisted)go()})};   /* 從上一頁快取回來（前進）也重新取樣 */
const AFTER=()=>{const W=innerWidth,H=innerHeight,ok=e=>e.matches('html,body,#pager,#pageMain,.wrap,.layout,.sgroup,.sgroup *,.panel,.panel *,#tabbar,#tabbar *,#addEvent,#addEvent *');
  const left=[];for(const y of [H-12,H-24,H-40,H-60])for(const x of [W/2-30,W/2,W/2+30])document.elementsFromPoint(x,y).forEach(e=>{if(!ok(e)&&getComputedStyle(e).opacity!=='0'&&getComputedStyle(e).visibility!=='hidden')left.push(e.tagName+(e.id?'#'+e.id:'')+'.'+String(e.className).slice(0,30))});
  return {hm:document.querySelectorAll('[class*="hm-"],.pfx-cover').length,toast:getComputedStyle(document.getElementById('toast')).opacity,left:[...new Set(left)],tmax:window.__tmax}};
(async()=>{const b=await chromium.launch();const errs=[];
  for(const [W,Hh] of [[1920,1080],[412,900]]){const touch=W<700,tag=touch?'412':'1920';
    const ctx=await b.newContext({viewport:{width:W,height:Hh},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/,r=>r.fulfill({status:404,body:''}));   /* 常用連結的圖示等外部請求一律擋下 */
    await ctx.addInitScript(HOOK);await ctx.addInitScript(SAMPLE);
    const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
    /* 1. 直接打開部門網址 */
    await p.goto(U+'index.html');await p.waitForTimeout(3600);
    let r=await p.evaluate(AFTER);
    ok(r.hm===0&&r.toast==='0'&&r.tmax===0&&!r.left.length,`${tag} 直接打開：沒有主頁節點與分身（${r.hm}）、提示膠囊一直透明（最大 ${r.tmax}）、底部正中沒有殘留（${r.left.join(',')||'無'}）`);
    /* 2. 從主頁點進去 */
    await p.goto(U+'home.html');await p.waitForTimeout(3600);
    if(touch){const c=await p.evaluate(()=>{const e=document.querySelector('.hm-wc.on'),q=e.getBoundingClientRect();return [q.left+q.width/2,q.top+60]});await p.mouse.click(c[0],c[1])}
    else await p.evaluate(()=>document.querySelector('.hm-tile.on').click());
    await p.waitForTimeout(150);
    const out=await p.evaluate(()=>window.__dock.slice());
    await p.waitForURL(/index\.html/,{timeout:8000}).catch(()=>{});await p.waitForTimeout(3600);
    r=await p.evaluate(AFTER);
    ok(r.hm===0&&r.toast==='0'&&r.tmax===0&&!r.left.length,`${tag} 從主頁點進去：過場結束後沒有主頁節點與分身（${r.hm}）、提示膠囊一直透明（最大 ${r.tmax}）、底部正中沒有殘留（${r.left.join(',')||'無'}）`);
    const d=out[out.length-1],props=d?[...new Set(d.k.flatMap(f=>Object.keys(f)))].filter(x=>!['offset','easing','composite'].includes(x)):[];
    const last=d&&d.k[d.k.length-1],dy=last&&+(String(last.transform).match(/translateY\((-?[\d.]+)px\)/)||[])[1];
    ok(!!d&&props.every(x=>x==='transform'||x==='opacity')&&+last.opacity===0&&dy>0&&d.t.duration===280&&d.t.easing==='cubic-bezier(.2,.9,.25,1)',`${tag} 進部門時下排往下沉並淡出（${d?`${d.t.duration}ms ${d.t.easing} 往下 ${dy}px、屬性 ${props.join('/')}`:'沒有動畫'}）`);
    /* 3. 返回再前進 */
    await p.goBack();await p.waitForTimeout(2600);
    const back=await p.evaluate(()=>{const x=document.querySelector('.hm-dock'),cs=x&&getComputedStyle(x),a=window.__dock[window.__dock.length-1];
      return {home:location.pathname.endsWith('home.html'),op:cs&&cs.opacity,tf:cs&&cs.transform,an:a&&{e:a.t.easing,first:a.k[0],end:a.k[a.k.length-1]},fx:document.querySelectorAll('.hm-fx,.hm-fxl,.hm-flw').length}});
    ok(back.home&&back.op==='1'&&(back.tf==='none'||/matrix\(1, 0, 0, 1, 0, 0\)/.test(back.tf))&&!!back.an&&back.an.e==='cubic-bezier(.25,1.12,.4,1)'&&+back.an.first.opacity===0&&+back.an.end.opacity===1&&back.fx===0,
      `${tag} 按返回回到主頁：下排從底部浮回來（${back.an?back.an.e:'沒有動畫'}），最後不透明、沒有位移，沒有留下過場分身`);
    await p.goForward();await p.waitForTimeout(3600);
    r=await p.evaluate(AFTER);
    ok(/index\.html/.test(p.url())&&r.hm===0&&r.toast==='0'&&r.tmax===0&&!r.left.length,`${tag} 再前進回到部門：沒有主頁節點與分身（${r.hm}）、提示膠囊透明、底部正中沒有殘留（${r.left.join(',')||'無'}）`);
    await ctx.close()}
  ok(!errs.length,`沒有 pageerror${errs.length?'：'+errs.slice(0,3).join('；'):''}`);
  await b.close();console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0)})();
