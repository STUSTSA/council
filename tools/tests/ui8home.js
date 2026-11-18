/* ui8home：ui-08 主頁組（docs/DESIGN-next.md 第五節「開場」、第六節「主頁」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   A. 開場：暫停全部動畫、逐格（16ms）推進 currentTime：任何一個字只要看得見（透明度 > 0 且在自己的窗裡露出來），它的邊界框就不能跟兩個小人的邊界框重疊；
      每個字第一次露出來時露的是左邊（由左到右揭開，不是先露出一截淡字再往左補）；開始前沒有字露出來。412、811×612、1300×800，淺深色各一次。
      關掉動態：沒有程式動畫、字直接是完成的樣子
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
(async()=>{const b=await chromium.launch();
  const mk=async(w,h,o={})=>{const touch=w<700;const ctx=await b.newContext({viewport:{width:w,height:h},colorScheme:o.scheme||'light',hasTouch:touch,isMobile:touch,serviceWorkers:'block',reducedMotion:o.rm?'reduce':'no-preference'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;return p};

  /* ---------- A. 開場：字跟小人不重疊、由左到右 ---------- */
  for(const [w,h] of [[412,860],[811,612],[1300,800]])for(const scheme of ['light','dark']){
    const p=await mk(w,h,{scheme});await p.goto(U+'home.html');await p.waitForSelector('#splash .sp-gw',{state:'attached'});
    const r=await p.evaluate(()=>{
      const sp=document.getElementById('splash'),an=sp.getAnimations({subtree:true});an.forEach(a=>a.pause());
      const end=Math.max(...an.map(a=>{const t=a.effect.getComputedTiming();return t.endTime}));
      const gws=[...sp.querySelectorAll('.sp-gw')],men=[sp.querySelector('.sp-y'),sp.querySelector('.sp-b')];
      const hit=(a,c)=>Math.min(a.right,c.right)-Math.max(a.left,c.left)>0&&Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top)>0;
      let bad=[],first=gws.map(()=>null),early=0,frames=0,grow=true;const last=gws.map(()=>0);
      const embEnd=(()=>{const a=sp.querySelector('.sp-emb').getAnimations()[0].effect.getComputedTiming();return a.endTime})();
      for(let t=0;t<=end+32;t+=16){an.forEach(a=>{a.currentTime=Math.min(t,a.effect.getComputedTiming().endTime)});frames++;
        const m=men.map(x=>x.getBoundingClientRect());
        gws.forEach((g,i)=>{const s=g.firstElementChild,wr=g.getBoundingClientRect(),gr=s.getBoundingClientRect(),op=+getComputedStyle(s).opacity;
          const vl=Math.max(wr.left,gr.left),vr=Math.min(wr.right,gr.right),vis=op>0&&vr-vl>0.01;
          if(!vis)return;
          if(m.some(x=>hit(gr,x)))bad.push(`${t}ms 第${i}字`);
          if(first[i]==null)first[i]={t,dl:vl-gr.left,w:vr-vl,gw:gr.width};
          if(vr-vl<last[i]-0.6)grow=false;last[i]=vr-vl;
          if(t===0)early++});
      }
      return {bad:bad.slice(0,6),nbad:bad.length,first,early,frames,grow,end,embEnd,full:gws.every((g,i)=>last[i]>g.getBoundingClientRect().width-1)};
    });
    const tag=`${w}×${h} ${scheme==='dark'?'深色':'淺色'}`;
    ok(r.frames>100&&r.nbad===0,`${tag}：逐格 ${r.frames} 格，字看得見時都不跟小人重疊（${r.nbad}${r.nbad?' '+r.bad.join('、'):''}）`);
    ok(r.early===0&&r.first.every(f=>f&&f.dl<0.6),`${tag}：開始前沒有字露出來；每個字第一次露出來的是左邊（${r.first.map(f=>f?f.dl.toFixed(1):'-').join(' ')}）`);
    ok(r.grow&&r.full,`${tag}：每個字露出來的寬度只增不減、最後整個字露出來（由左到右揭開）`);
    ok(Math.min(...r.first.map(f=>f.t))>760,`${tag}：第一個字在標誌開始上移之後才出現（${Math.min(...r.first.map(f=>f.t))}ms；上移到 ${r.embEnd}ms）`);
    ok(!p.errs.length,`${tag}：沒有錯誤 `+p.errs.join(' | '));
    await p.ctx.close()}
  {const p=await mk(412,860,{rm:1});await p.goto(U+'home.html');await p.waitForSelector('#splash .sp-gw',{state:'attached'});
    const r=await p.evaluate(()=>{const sp=document.getElementById('splash');return {an:sp.getAnimations({subtree:true}).length,
      full:[...sp.querySelectorAll('.sp-gw')].every(g=>{const a=g.getBoundingClientRect(),s=g.firstElementChild.getBoundingClientRect();return Math.abs(a.left-s.left)<.6&&Math.abs(a.right-s.right)<.6&&+getComputedStyle(g.firstElementChild).opacity===1})}});
    ok(r.an===0&&r.full,`關掉動態：開場沒有程式動畫、字直接是完成的樣子（${r.an}）`);
    await p.ctx.close()}

  await b.close();
  console.log(`\n${fails?'有失敗':'全部通過'}：OK ${passes}／FAIL ${fails}`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
