/* ui12home：桌面主頁的比例像 Switch 主畫面（ui-12，使用者 11/20 看 1920 寬深色後要求「比例配置更像 Switch 主畫面一點，特別是底下那條」；
   docs/DESIGN-next.md 第六節「主頁」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   外部網址用 fakenet.js 隔離（icon.example 的 /favicon.ico 回 64×64 PNG、Google 圖示服務回 16×16 預設圖＝沒有；另外兩個連結是內網網域、不連），
   最後斷言沒有預期外的外部請求。
   1920×1080、1366×768 × 米黃深色、米黃淺色、柔光淺色，各量：
   1. 三段垂直留白平衡：色塊列（沒選到的那張）中心在視窗高度 42%～50%；色塊底到下排頂的留白 ÷ 下排底到視窗底的留白在 0.6～1.6；
      下排底到視窗底不超過視窗高度的 25%（下半不全空）；上排底到色塊頂有留白
   2. 焦點那張放大的比例跟修改前一樣（1.13）
   3. 下排沒有共用底：下排的容器（.hm-dock、.hm-dk、.hm-dk-in、底板）不是不畫就是透明、沒有陰影；兩顆圓鈕中間的縫的顏色＝頁面底色
   4. 圓鈕直徑在色塊邊長的 1/4～1/3，三種圓鈕（行事曆、連結、「+」）一樣大；圖示跟著圓鈕等比例放大（行事曆圖示＝直徑×20/44、網站圖示＝直徑×26/44（電腦版 641px 以上 20/44）、
      首字母字級＝直徑×16/44），不變形、在圓鈕正中間（1px 內）
   5. 整排（第一顆到最後一顆）的中心＝視窗水平中心（0.5px 內）；各元素中心在同一條水平線（1px 內）
   6. 行事曆圓鈕是主要動作色（--pri）
   7. 滑鼠停在連結上：放大 1.05（ui-10 的現行行為）並浮出名稱小膠囊；移開後回到 none
   8. 編輯模式：「+」進入、加一個、× 刪一個、Esc 結束；編輯中各元素中心仍在同一條線、輸入框與返回鍵看得出來（底色不是頁面底色）、下排在畫面內、整頁不橫捲
   另外：同寬度下色塊邊長隨視窗高度變大（1920、1366 各量 1080 與 768 高）；412 手機版主頁的位置與尺寸跟修改前（bcd067b）一樣、下排仍是帶陰影的膠囊。
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const zlib=require('zlib'),fakeNet=require('./fakenet.js');
const U='http://127.0.0.1:8300/',PORT=+U.match(/:(\d+)\//)[1],FAV_PORT=PORT+13;
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const png=(W,H,rgb)=>{const crc=b=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0};
  const ch=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;const raw=Buffer.alloc(H*(W*3+1));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let k=0;k<3;k++)raw[y*(W*3+1)+1+x*3+k]=rgb[k];
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])};
const LINKS=[{u:'https://icon.example/',n:'有圖示'},{u:'https://wiki.local/',n:'Wiki'},{u:'http://nas.lan/',n:''}];
/* 412 手機版主頁：修改前（bcd067b）量到的位置與尺寸（下排、三種圓鈕、焦點卡、上排） */
const PHONE0={top:[16,16,380,48],dk:[62.5,782,287,60],pub:[70.5,790,44,44],lk:[[135.5,790,44,44],[189.5,790,44,44],[243.5,790,44,44]],add:[297.5,790,44,44],gap:10,wc:[35,86,342,176.4]};
const f1=v=>v==null?'—':(Math.round(v*10)/10).toString(),f3=v=>v==null?'—':(Math.round(v*1000)/1000).toString();
(async()=>{
  const net=await fakeNet(FAV_PORT,(q,r,{host,url})=>{
    if(host==='www.google.com'&&url.pathname==='/s2/favicons'){r.writeHead(404,{'Content-Type':'image/png'});r.end(png(16,16,[160,160,160]));return true}
    if(host==='icon.example'&&q.url==='/favicon.ico'){r.writeHead(200,{'Content-Type':'image/png'});r.end(png(64,64,[230,40,40]));return true}
    return false},/^(www\.google\.com|icon\.example)$/);
  const b=await chromium.launch(net.launch);
  const mk=async(w,h,ui,o={})=>{const touch=w<700;
    const ctx=await b.newContext({viewport:{width:w,height:h},colorScheme:ui.mode,hasTouch:touch,isMobile:touch,serviceWorkers:'block',ignoreHTTPSErrors:true,reducedMotion:o.rm?'reduce':'no-preference'});
    await ctx.addInitScript(([lk,ui])=>{try{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',lk);localStorage.setItem('stustsa-ui',ui)}}catch(_){}},[JSON.stringify(LINKS),JSON.stringify({...ui,sound:false})]);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    p.ipReq=[];p.on('request',q=>{try{const h=new URL(q.url()).hostname;if(/^\d+\.\d+\.\d+\.\d+$/.test(h)&&h!=='127.0.0.1')p.ipReq.push(q.url())}catch(_){}});
    await p.goto(U+'home.html',{referer:U});   /* 站內來的：不放開場（主頁的版面才是這裡要量的） */
    await p.waitForSelector('.hm-tile, .hm-wc');
    await p.waitForFunction(()=>{const i=document.querySelector('.hm-lk[data-nm="有圖示"] img');return !i||i.complete},null,{timeout:8000}).catch(()=>{});
    await p.waitForTimeout(1400);return p};
  const read=p=>p.evaluate(()=>{const R=e=>e.getBoundingClientRect(),cy=r=>r.top+r.height/2,cx=r=>r.left+r.width/2,cs=e=>getComputedStyle(e);
    const H=innerHeight,W=innerWidth,top=R(document.querySelector('.hm-top'));
    const tiles=[...document.querySelectorAll('.hm-tile')],off=tiles.find(t=>!t.classList.contains('on')),on=tiles.find(t=>t.classList.contains('on'));
    const tr=R(off),T=off.offsetWidth;
    const dots=[...document.querySelectorAll('.hm-dk-in>.hm-pub,.hm-dk-in>.hm-lk>.hm-lkc,.hm-dk-in>.hm-lkadd')];
    const dr=dots.map(R),dTop=Math.min(...dr.map(r=>r.top)),dBot=Math.max(...dr.map(r=>r.bottom)),dL=Math.min(...dr.map(r=>r.left)),dR=Math.max(...dr.map(r=>r.right));
    const line=[...document.querySelectorAll('.hm-dk-in>*')].map(e=>{const c=e.matches('.hm-lk')?e.querySelector('.hm-lkc'):e;return cy(R(c))});
    /* 容器：不畫（沒有框）或透明、沒有陰影 */
    const conts=[document.querySelector('.hm-dock'),document.getElementById('hmDk'),document.getElementById('hmDkIn'),...document.querySelectorAll('.hm-dk-bg,.hm-dk-bg>span')];
    const shown=conts.filter(e=>{const r=e.getClientRects();if(!r.length)return false;const s=cs(e);return s.visibility!=='hidden'&&+s.opacity>0&&(s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.boxShadow!=='none'||s.backgroundImage!=='none')}).map(e=>e.className||e.tagName);
    const pri=(()=>{const x=document.createElement('i');x.style.cssText='position:absolute;background:var(--pri)';document.getElementById('hm').append(x);const v=cs(x).backgroundColor;x.remove();return v})();
    const pub=document.getElementById('hmPub'),pico=pub.querySelector('svg'),pr=R(pub),pir=pico&&R(pico);
    const lk=[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const c=l.querySelector('.hm-lkc'),cr=R(c),i=l.querySelector('img.hm-lki'),lab=l.querySelector('.hm-lkl');
      const fav=l.classList.contains('fav')&&i&&cs(i).opacity==='1',ir=fav&&R(i);
      return {nm:l.dataset.nm,fav,w:cr.width,h:cr.height,iw:ir?ir.width:null,ih:ir?ir.height:null,idx:ir?cx(ir)-cx(cr):null,idy:ir?cy(ir)-cy(cr):null,fs:parseFloat(cs(lab).fontSize)}});
    return {H,W,topB:top.bottom,tTop:tr.top,tBot:tr.bottom,T,scale:R(on).width/on.offsetWidth,dTop,dBot,mid:(dL+dR)/2,line,shown,pri,pubBg:cs(pub).backgroundColor,
      pub:{w:pr.width,h:pr.height,iw:pir&&pir.width,ih:pir&&pir.height,idx:pir&&cx(pir)-cx(pr),idy:pir&&cy(pir)-cy(pr)},add:R(document.querySelector('.hm-dk-in>.hm-lkadd')).width,lk,
      gap:dr.length>1?{x:(dr[0].right+dr[1].left)/2,y:cy(dr[0])}:null,sw:document.documentElement.scrollWidth}});
  const pix=async(p,x,y)=>{const s=await p.screenshot({clip:{x:Math.round(x)-1,y:Math.round(y)-1,width:3,height:3}});
    return p.evaluate(async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data;return [d[0],d[1],d[2]]},s.toString('base64'))};
  const bgPix=async p=>pix(p,6,(await p.evaluate(()=>innerHeight))-6);
  const near=(a,c,t=6)=>a&&c&&a.every((v,i)=>Math.abs(v-c[i])<=t);
  const sizes={};
  const CASES=[[1920,1080,{pal:'fin',mode:'dark'},'米黃深色'],[1920,1080,{pal:'neu',mode:'light'},'柔光'],[1920,1080,{pal:'fin',mode:'light'},'米黃淺色'],
    [1366,768,{pal:'fin',mode:'dark'},'米黃深色'],[1366,768,{pal:'fin',mode:'light'},'米黃淺色'],[1366,768,{pal:'neu',mode:'light'},'柔光']];
  for(const [w,h,ui,nm] of CASES){
    const T=`[${w}×${h} ${nm}]`,p=await mk(w,h,ui),r=await read(p);sizes[w+'x'+h]=r.T;
    const c=(r.tTop+r.tBot)/2/r.H,g1=r.dTop-r.tBot,g2=r.H-r.dBot;
    console.log(`${T} 量到：上排底 ${f1(r.topB)}、色塊頂 ${f1(r.tTop)}／底 ${f1(r.tBot)}（邊長 ${f1(r.T)}）、下排頂 ${f1(r.dTop)}／底 ${f1(r.dBot)}、視窗底 ${r.H}；圓鈕 ${f1(r.pub.w)}`);
    ok(c>=.42&&c<=.50,`${T} 色塊列中心在視窗高度 42%～50%（${f3(c)}）`);
    ok(g2>0&&g1/g2>=.6&&g1/g2<=1.6,`${T} 色塊底到下排頂 ÷ 下排底到視窗底在 0.6～1.6（${f1(g1)} ÷ ${f1(g2)} = ${f3(g1/g2)}）`);
    ok(g2<=r.H*.25&&r.tTop-r.topB>=24,`${T} 下排底到視窗底不超過視窗高度 25%（${f1(g2)}）、上排底到色塊頂有留白（${f1(r.tTop-r.topB)}）`);
    ok(Math.abs(r.scale-1.13)<.005,`${T} 焦點那張放大 1.13（${f3(r.scale)}）`);
    ok(!r.shown.length,`${T} 下排的容器都沒有底色、陰影（畫出來的：${r.shown.join('、')||'無'}）`);
    const gp=r.gap&&await pix(p,r.gap.x,r.gap.y),bg=await bgPix(p);
    ok(near(gp,bg),`${T} 兩顆圓鈕中間的縫是頁面底色（縫 ${gp}、頁面 ${bg}）`);
    const ds=[r.pub.w,r.pub.h,r.add,...r.lk.map(l=>l.w),...r.lk.map(l=>l.h)];
    ok(ds.every(d=>Math.abs(d-r.pub.w)<.5)&&r.pub.w>=r.T/4-.01&&r.pub.w<=r.T/3+.01,`${T} 圓鈕一樣大、直徑在色塊邊長 1/4～1/3（${f1(r.pub.w)} ÷ ${f1(r.T)} = ${f3(r.pub.w/r.T)}）`);
    const k=r.pub.w/44,fk=r.W>=641?20:26,fv=r.lk.find(l=>l.fav),lt=r.lk.filter(l=>!l.fav);
    ok(Math.abs(r.pub.iw-20*k)<=.5&&Math.abs(r.pub.ih-r.pub.iw)<.5&&Math.abs(r.pub.idx)<=1&&Math.abs(r.pub.idy)<=1,`${T} 行事曆圖示跟著放大（${f1(r.pub.iw)}×${f1(r.pub.ih)}，應 ${f1(20*k)}）、在正中間`);
    ok(fv&&Math.abs(fv.iw-fk*k)<=.5&&Math.abs(fv.ih-fv.iw)<.5&&Math.abs(fv.idx)<=1&&Math.abs(fv.idy)<=1,`${T} 網站圖示跟著放大（${fv&&f1(fv.iw)}×${fv&&f1(fv.ih)}，應 ${f1(fk*k)}）、不變形、在正中間`);
    ok(lt.length===2&&lt.every(l=>Math.abs(l.fs-16*k)<=.5),`${T} 首字母字級跟著放大（${lt.map(l=>f1(l.fs)).join('、')}，應 ${f1(16*k)}）`);
    ok(Math.abs(r.mid-r.W/2)<=.5,`${T} 整排中心＝視窗中心（差 ${f3(r.mid-r.W/2)}px）`);
    const sp=Math.max(...r.line)-Math.min(...r.line);ok(sp<=1,`${T} 下排各元素中心在同一條水平線（差 ${f3(sp)}px）`);
    ok(r.pubBg===r.pri&&r.pri!=='rgba(0, 0, 0, 0)',`${T} 行事曆圓鈕是主要動作色（${r.pubBg}）`);
    if(ui.pal==='fin'&&ui.mode==='dark'){
      /* 滑過再移開 */
      const sel='.hm-dk-in>.hm-lk[data-nm="Wiki"] .hm-lkc';await p.hover(sel);await p.waitForTimeout(450);
      const hv=await p.evaluate(s=>{const t=document.getElementById('hmTip');return {tf:getComputedStyle(document.querySelector(s)).transform,tip:t&&t.classList.contains('on')&&t.textContent}},sel);
      await p.mouse.move(8,8);await p.waitForTimeout(450);
      const out=await p.evaluate(s=>{const t=document.getElementById('hmTip');return {tf:getComputedStyle(document.querySelector(s)).transform,tip:!!(t&&t.classList.contains('on'))}},sel);
      const m=/^matrix\(([\d.]+)/.exec(hv.tf);
      ok(m&&Math.abs(+m[1]-1.05)<.002&&hv.tip==='Wiki',`${T} 滑過連結：放大 1.05（${hv.tf}）、浮出名稱膠囊（${hv.tip}）`);
      ok((out.tf==='none'||out.tf==='matrix(1, 0, 0, 1, 0, 0)')&&!out.tip,`${T} 移開：回到原樣（${out.tf}）、膠囊收起`);
      /* 編輯模式 */
      const n0=r.lk.length;await p.click('.hm-dk-in>.hm-lkadd');await p.waitForSelector('#hmLkU');await p.waitForTimeout(500);
      await p.fill('#hmLkU','https://nas2.lan/');await p.fill('#hmLkN','NAS2');await p.press('#hmLkN','Enter');await p.waitForTimeout(600);
      const e1=await p.evaluate(()=>{const R=e=>e.getBoundingClientRect(),cy=r=>r.top+r.height/2,cs=e=>getComputedStyle(e);
        const line=[...document.querySelectorAll('.hm-dk-in>*')].filter(e=>!e.matches('.hm-lkf')).map(e=>cy(R(e.matches('.hm-lk')?e.querySelector('.hm-lkc'):e)));
        const f=[...document.querySelectorAll('.hm-lkf input,.hm-lkf .primary')].map(e=>cy(R(e)));
        const dk=R(document.getElementById('hmDk')),bk=document.querySelector('.hm-lkb'),u=document.getElementById('hmLkU');
        return {n:document.querySelectorAll('.hm-dk-in>.hm-lk').length,x:document.querySelectorAll('.hm-dk-in .hm-lkx').length,line:line.concat(f),in:dk.left>=0&&dk.right<=innerWidth&&dk.bottom<=innerHeight,
          sw:document.documentElement.scrollWidth,W:innerWidth,ubg:cs(u).backgroundColor,bbg:cs(bk).backgroundColor,body:cs(document.body).backgroundColor,
          bkc:{x:R(bk).left+R(bk).width/2,y:cy(R(bk))},uc:{x:R(u).left+R(u).width/2,y:cy(R(u))}}});
      const sp2=Math.max(...e1.line)-Math.min(...e1.line);
      ok(e1.n===n0+1&&e1.x===n0+1,`${T} 編輯中：加一個連結（${n0}→${e1.n}）、每個連結都有 ×`);
      ok(sp2<=1&&e1.in&&e1.sw<=e1.W,`${T} 編輯中：各元素中心在同一條線（差 ${f3(sp2)}px）、下排在畫面內、整頁不橫捲`);
      const ub=await pix(p,e1.uc.x,e1.uc.y),bb=await pix(p,e1.bkc.x+12,e1.bkc.y-12);
      ok(!near(ub,bg,3)&&!near(bb,bg,3),`${T} 編輯中：輸入框（${ub}）與返回鍵（${bb}）的底色看得出來（頁面 ${bg}）`);
      await p.click('.hm-dk-in>.hm-lk[data-nm="NAS2"] .hm-lkx');await p.waitForTimeout(600);
      await p.keyboard.press('Escape');await p.mouse.move(8,8);await p.waitForTimeout(600);   /* 滑鼠移開（× 的位置在結束編輯後剛好是「+」，停在上面會放大） */
      const e2=await p.evaluate(()=>({n:document.querySelectorAll('.hm-dk-in>.hm-lk').length,ed:document.getElementById('hmDk').classList.contains('ed'),add:!!document.querySelector('.hm-dk-in>.hm-lkadd')}));
      ok(e2.n===n0&&!e2.ed&&e2.add,`${T} × 刪掉剛加的那個（${e2.n}）、Esc 結束編輯、「+」回來`);
      const r2=await read(p);const sp3=Math.max(...r2.line)-Math.min(...r2.line);
      ok(Math.abs(r2.mid-r2.W/2)<=.5&&sp3<=1&&Math.abs(r2.dTop-r.dTop)<=.5,`${T} 結束編輯後：整排仍置中（${f3(r2.mid-r2.W/2)}）、同一條線（${f3(sp3)}）、高度位置不變（${f1(r.dTop)}→${f1(r2.dTop)}）`);
    }
    ok(!p.errs.length&&!p.ipReq.length,`${T} 沒有頁面錯誤 ${p.errs.join(' | ')}${p.ipReq.join(' ')}`);
    await p.context().close();
  }
  /* 色塊邊長隨視窗高度變大 */
  for(const [w,h] of [[1920,768],[1366,1080]]){const p=await mk(w,h,{pal:'fin',mode:'dark'});sizes[w+'x'+h]=(await read(p)).T;await p.context().close()}
  ok(sizes['1920x1080']>sizes['1920x768']+20&&sizes['1366x1080']>sizes['1366x768']+20,`色塊邊長隨視窗高度變大（1920：768 高 ${f1(sizes['1920x768'])} → 1080 高 ${f1(sizes['1920x1080'])}；1366：${f1(sizes['1366x768'])} → ${f1(sizes['1366x1080'])}）`);
  /* 412 手機：跟修改前一樣 */
  for(const mode of ['dark','light']){
    const p=await mk(412,860,{pal:'fin',mode},{rm:1}),T=`[412 ${mode==='dark'?'深色':'淺色'}]`;
    const m=await p.evaluate(()=>{const R=e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(v=>Math.round(v*10)/10)};
      const kids=[...document.querySelectorAll('.hm-dk-in>*')],bs=[...document.querySelectorAll('.hm-dk-bg>span')].map(s=>getComputedStyle(s));
      return {top:R(document.querySelector('.hm-top')),dk:R(document.getElementById('hmDk')),pub:R(document.getElementById('hmPub')),
        lk:[...document.querySelectorAll('.hm-dk-in>.hm-lk>.hm-lkc')].map(R),add:R(document.querySelector('.hm-dk-in>.hm-lkadd')),gap:parseFloat(getComputedStyle(document.getElementById('hmDkIn')).columnGap),
        wc:R(document.querySelector('.hm-wc')),cap:bs.length===2&&bs.every(s=>s.display!=='none'&&s.backgroundColor!=='rgba(0, 0, 0, 0)'&&/-14px 30px -6px/.test(s.boxShadow))&&[...document.querySelectorAll('.hm-dk-bg')].every(x=>x.getClientRects().length)}});
    const same=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=.5);
    const okAll=same(m.top,PHONE0.top)&&same(m.dk,PHONE0.dk)&&same(m.pub,PHONE0.pub)&&m.lk.length===3&&m.lk.every((l,i)=>same(l,PHONE0.lk[i]))&&same(m.add,PHONE0.add)&&m.gap===PHONE0.gap&&same(m.wc,PHONE0.wc);
    ok(okAll,`${T} 手機版主頁的位置與尺寸跟修改前一樣（下排 ${m.dk}、行事曆 ${m.pub}、連結 ${m.lk.join(' / ')}、「+」${m.add}、縫 ${m.gap}、焦點卡 ${m.wc}、上排 ${m.top}）`);
    ok(m.cap,`${T} 手機下排仍是帶陰影的膠囊`);
    ok(!p.errs.length,`${T} 沒有頁面錯誤 ${p.errs.join(' | ')}`);
    await p.context().close();
  }
  ok(!net.extra.length,`沒有預期外的外部請求（${net.extra.join(' ')||'無'}）`);
  await b.close();await net.close();
  console.log(`\n${passes} 通過、${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
