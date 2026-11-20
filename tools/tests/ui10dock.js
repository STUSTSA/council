/* ui10dock：主頁下排各元素垂直置中（ui-10，DievE 11/19 標「錯」；docs/DESIGN-next.md 第六節「下排」：下排各元素的中心在同一條水平線）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   現象：常用連結載到網站圖示後，圖示比左邊全會行事曆圓鈕、右邊「+」低約 13px。
   原因：載到圖示時 lkIco 在連結節點（.hm-lk）加的 class 原本叫「ico」，跟全站 SVG 圖示的 .ico（board.css「圖示」段：寬高 1.15em、右邊距、vertical-align）撞名，
   連結框被縮成 17.25×17.25，下排用 align-items:center 置中的是這個小框，44px 的圓鈕從小框頂端往下長，整顆偏下 (44-17.25)/2≈13.4px。
   1300、1920、手機 412 寬 × 米黃淺色、深色，各量一次（外部網址用 fakenet.js 隔離：網站 /favicon.ico 回 64×64 PNG、Google 圖示服務回 16×16 預設圖＝沒有）：
   1. 兩個連結真的顯示網站圖示（img 載到、不透明），一個顯示首字母圓鈕
   2. 每個元素的垂直中心都跟全會行事曆圓鈕（.hm-pub）相差 1px 內：有圖示的連結量 img 的框，並從截圖找出圖示顏色實際畫出來的範圍再量一次；
      首字母圓鈕量 .hm-lkl；「+」量 .hm-lkadd
   3. 連結框（.hm-lk）跟圓鈕一樣大（手機 44×44；桌面跟著色塊，ui-12 起直徑＝--hm-dot，下面的 44、26、6px 都照直徑等比例）；圖示水平也在連結框正中間（1px 內）
   4. 編輯中（點「+」）：行事曆圓鈕、各連結、返回鍵的中心仍在同一條線（1px 內）；紅色 × 相對於自己那顆 44px 圓鈕的位置，有圖示和首字母的連結一樣（1px 內）
   5. 圓鈕（DievE 11/19 定）：有圖示的連結也是 44px 的圓（.hm-lkc），底色跟首字母圓鈕同一個（--blk2）；圖示 26×26、object-fit:contain、不裁成圓
   6. 關掉動態（這一段都用 reducedMotion:reduce）：滑鼠停在連結上不動（transform 維持 none），跟行事曆圓鈕一樣
   7. 沒有預期外的外部請求、沒有頁面錯誤
   另外開動態（1300 深色、412 淺色），每種情況結束後連結（.hm-lk、.hm-lkc、圖示）與下排（.hm-dock、.hm-dk、.hm-dk-in）的 transform 都是 none（或單位矩陣）、
   下排不透明，各元素中心仍跟行事曆圓鈕在同一條線（1px 內）：
   8. 圖示載入前後（網站延遲 2.5 秒才回圖）：載入前首字母圓鈕在線上、載入後圖示在線上
   9. 滑過再移開（1300）：滑過時連結的 transform 跟滑過行事曆圓鈕時一樣（同一套：放大 1.05、同一條過渡曲線與時間），移開後回到 none
  10. 新增連結（從輸入框加，載到圖示）、移除連結（×）、結束編輯之後
  11. 進部門再按返回回到主頁（dockMove：下排往下沉淡出、再浮回來）之後
   SHOTS=<資料夾> 時另存截圖（整頁＋下排特寫，編輯前；1300 深色另存滑過前、中、移開後），不 commit。失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),zlib=require('zlib'),fakeNet=require('./fakenet.js');
const U='http://127.0.0.1:8300/',PORT=+U.match(/:(\d+)\//)[1],FAV_PORT=PORT+11;
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 單色 PNG（寬 W、高 H） */
const png=(W,H,rgb)=>{const crc=b=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0};
  const ch=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;const raw=Buffer.alloc(H*(W*3+1));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let k=0;k<3;k++)raw[y*(W*3+1)+1+x*3+k]=rgb[k];
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])};
/* 兩個網站的圖示用不同的純色，截圖裡分得開 */
const COL={'drive.example':[230,40,40],'threads.example':[40,200,90],'slow.example':[40,90,230],'new.example':[230,170,30]};
const ICO=Object.fromEntries(Object.entries(COL).map(([h,c])=>[h,png(64,64,c)]));
const LINKS=[{u:'https://drive.example/',n:'雲端硬碟'},{u:'https://none.example/',n:''},{u:'https://threads.example/',n:'Threads'}];

(async()=>{
  const net=await fakeNet(FAV_PORT,(q,r,{host,url})=>{
    if(host==='www.google.com'&&url.pathname==='/s2/favicons'){r.writeHead(404,{'Content-Type':'image/png'});r.end(png(16,16,[160,160,160]));return true}
    if(!/\.example$/.test(host)||q.url!=='/favicon.ico')return false;
    if(host==='slow.example'){setTimeout(()=>{try{r.writeHead(200,{'Content-Type':'image/png'});r.end(ICO[host])}catch(_){}},2500)}
    else if(ICO[host]){r.writeHead(200,{'Content-Type':'image/png'});r.end(ICO[host])}else{r.writeHead(404,{'Content-Type':'text/html'});r.end('<!doctype html><title>404</title>')}
    return true},/^(www\.google\.com|fonts\.gstatic\.com|.+\.example)$/);
  const b=await chromium.launch(net.launch);
  /* 量：每個下排元素畫出來的垂直中心（減掉 .hm-pub 的中心）；連結另量框的大小、圖示水平位置、× 相對於圓鈕的位置 */
  const read=p=>p.evaluate(()=>{const R=e=>e.getBoundingClientRect(),cy=r=>r.top+r.height/2,cx=r=>r.left+r.width/2;
    const pub=R(document.getElementById('hmPub')),y0=cy(pub);
    const links=[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const i=l.querySelector('img.hm-lki'),lab=l.querySelector('.hm-lkl'),x=l.querySelector('.hm-lkx'),box=R(l);
      const icon=!!i&&i.complete&&i.naturalWidth>2&&getComputedStyle(i).opacity==='1'&&getComputedStyle(lab).display==='none';
      const vis=icon?R(i):R(lab),circle={left:cx(box)-box.width/2,top:cy(box)-box.height/2};
      const c=l.querySelector('.hm-lkc'),cs=getComputedStyle(c),cr=R(c),is=i&&getComputedStyle(i);
      return {nm:l.dataset.nm,icon,dy:cy(vis)-y0,dx:cx(vis)-cx(box),w:box.width,h:box.height,vw:vis.width,vh:vis.height,
        cw:cr.width,ch:cr.height,cbr:parseFloat(cs.borderTopLeftRadius)||0,cbg:cs.backgroundColor,fit:is&&is.objectFit,ibr:is&&is.borderRadius,
        clip:icon?{x:vis.left-6,y:vis.top-6,width:vis.width+12,height:vis.height+12}:null,
        x:x?{dx:cx(R(x))-circle.left,dy:cy(R(x))-circle.top}:null}});
    const one=s=>{const e=document.querySelector('.hm-dk-in>'+s);return e?cy(R(e))-y0:null};
    return {pub:{w:pub.width,h:pub.height},links,add:one('.hm-lkadd'),back:one('.hm-lkb')}});
  /* 圖示實際畫出來的範圍：截那一塊，找跟圖示顏色接近的像素，回傳中心（頁面座標）減 .hm-pub 中心 */
  const drawn=async(p,clip,rgb)=>{const s=(await p.screenshot({clip})).toString('base64');
    return p.evaluate(async([s,rgb,clip])=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const cv=document.createElement('canvas');cv.width=im.naturalWidth;cv.height=im.naturalHeight;
      const x=cv.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,cv.width,cv.height).data,sc=cv.width/clip.width;let y0=1e9,y1=-1,n=0;
      for(let y=0;y<cv.height;y++)for(let i=0;i<cv.width;i++){const k=(y*cv.width+i)*4;if(Math.abs(d[k]-rgb[0])<24&&Math.abs(d[k+1]-rgb[1])<24&&Math.abs(d[k+2]-rgb[2])<24){n++;if(y<y0)y0=y;if(y>y1)y1=y}}
      if(!n)return null;const pr=document.getElementById('hmPub').getBoundingClientRect();return {dy:clip.y+(y0+y1+1)/2/sc-(pr.top+pr.height/2),h:(y1-y0+1)/sc}},[s,rgb,clip])};
  const f2=v=>v==null?'—':(Math.round(v*100)/100).toString();
  const near=v=>v!=null&&Math.abs(v)<=1;
  for(const [w,h] of [[1300,800],[1920,1000],[412,860]])for(const mode of ['light','dark']){
    const T=`[${w} ${mode}]`,touch=w<700;
    const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block',ignoreHTTPSErrors:true,reducedMotion:'reduce'});
    await ctx.addInitScript(([v,ui])=>{try{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',JSON.stringify(v));localStorage.setItem('stustsa-ui',JSON.stringify(ui))}}catch(_){}},[LINKS,{pal:'fin',mode,sound:false}]);
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(U+'home.html');
    /* 等每個連結都有結果：圖示載到且不透明，或圖片已拿掉（首字母） */
    const done=await p.waitForFunction(n=>{const l=[...document.querySelectorAll('.hm-dk-in>.hm-lk')];return l.length===n&&l.every(x=>{const i=x.querySelector('img.hm-lki');return !i||i.complete&&i.naturalWidth>2&&getComputedStyle(i).opacity==='1'})},LINKS.length,{timeout:10000}).then(()=>true).catch(()=>false);
    await p.waitForTimeout(400);
    const r=await read(p);
    ok(done&&r.links.filter(l=>l.icon).length===2&&r.links[1]&&!r.links[1].icon,`${T} 兩個連結顯示網站圖示（64×64 PNG）、一個顯示首字母圓鈕：${r.links.map(l=>l.nm+(l.icon?'＝圖示':'＝字母')).join('、')}`);
    const ic=r.links.filter(l=>l.icon),lt=r.links.filter(l=>!l.icon);
    const D=r.pub.w,k=D/44,eq=(a,b)=>Math.abs(a-b)<.05,E=v=>f2(v*k);   /* 圓鈕直徑：手機 44；桌面跟著色塊（ui-12，--hm-dot），圖示照 44px 時的大小等比例 */
    ok(ic.length&&ic.every(l=>near(l.dy)),`${T} 有圖示的連結：圖示框中心跟全會行事曆圓鈕在同一條線（差 ${ic.map(l=>f2(l.dy)).join('、')}px，要 1px 內）`);
    const dr=[];for(const l of ic)dr.push(await drawn(p,l.clip,COL[l.nm==='雲端硬碟'?'drive.example':'threads.example']));
    ok(dr.length&&dr.every(d=>d&&near(d.dy)&&Math.abs(d.h-26*k)<=1.5),`${T} 有圖示的連結：截圖裡圖示實際畫出來的範圍中心也在同一條線（差 ${dr.map(d=>d?f2(d.dy)+'px／高 '+f2(d.h):'找不到').join('、')}）`);
    ok(lt.length&&lt.every(l=>near(l.dy)&&eq(l.vw,D)&&eq(l.vh,D)),`${T} 首字母圓鈕：中心在同一條線（差 ${lt.map(l=>f2(l.dy)).join('、')}px）、跟行事曆圓鈕一樣大（${f2(D)}；手機 44）`);
    ok(near(r.add),`${T} 「+」圓鈕：中心在同一條線（差 ${f2(r.add)}px）`);
    ok(r.links.every(l=>eq(l.w,D)&&eq(l.h,D))&&eq(r.pub.h,D)&&(!touch||D===44),`${T} 連結框跟行事曆圓鈕一樣大（${f2(D)}，手機 44；連結框 ${r.links.map(l=>f2(l.w)+'×'+f2(l.h)).join('、')}）`);
    ok(ic.every(l=>near(l.dx)&&eq(l.vw,26*k)&&eq(l.vh,26*k)),`${T} 圖示 ${E(26)}×${E(26)}（44px 圓鈕時 26）、水平在連結框正中間（差 ${ic.map(l=>f2(l.dx)).join('、')}px）`);
    const bg0=r.links.find(l=>!l.icon);
    ok(ic.length&&ic.every(l=>eq(l.cw,D)&&eq(l.ch,D)&&l.cbr>=D/2&&/^rgb/.test(l.cbg)&&l.cbg!=='rgba(0, 0, 0, 0)'&&bg0&&l.cbg===bg0.cbg),`${T} 有圖示的連結是跟行事曆一樣大的圓、底色跟首字母圓鈕同一個（${ic.map(l=>f2(l.cw)+'×'+f2(l.ch)+' 圓角 '+f2(l.cbr)+' '+l.cbg).join('、')}；首字母 ${bg0&&bg0.cbg}）`);
    ok(ic.every(l=>l.fit==='contain'&&Math.abs(parseFloat(l.ibr)-6*k)<.05),`${T} 圖示 object-fit:contain、圓角 ${E(6)}px（44px 時 6，不裁成圓）：${ic.map(l=>l.fit+' '+l.ibr).join('、')}`);
    if(!touch){await p.hover('.hm-dk-in>.hm-lk.fav .hm-lkc, .hm-dk-in>.hm-lk:first-of-type .hm-lkc');await p.waitForTimeout(350);
      const hv=await p.evaluate(()=>getComputedStyle(document.querySelector('.hm-dk-in>.hm-lk .hm-lkc')).transform);
      await p.hover('#hmPub');await p.waitForTimeout(350);const hp=await p.evaluate(()=>getComputedStyle(document.getElementById('hmPub')).transform);
      await p.mouse.move(5,5);await p.waitForTimeout(200);
      ok(hv==='none'&&hp==='none',`${T} 關掉動態：滑鼠停在連結上不動（${hv}），跟行事曆圓鈕一樣（${hp}）`)}
    console.log(`  ${T} 偏移（px，正＝偏下）：行事曆 0、${r.links.map(l=>(l.icon?'圖示':'字母')+' '+f2(l.dy)).join('、')}、＋ ${f2(r.add)}`);
    if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});const f=path.join(process.env.SHOTS,`${w}-${mode}.png`);await p.screenshot({path:f});
      const box=await p.evaluate(()=>{const r=document.getElementById('hmDk').getBoundingClientRect();return {x:r.left-12,y:r.top-12,width:r.width+24,height:r.height+24}});
      await p.screenshot({path:f.replace(/\.png$/,'-dock.png'),clip:box});console.log('  截圖 '+f)}
    /* 編輯中 */
    await p.click('.hm-lkadd');await p.waitForSelector('.hm-dk.ed .hm-lkx',{timeout:3000}).catch(()=>{});await p.waitForTimeout(300);
    const e=await read(p),eic=e.links.filter(l=>l.icon),elt=e.links.filter(l=>!l.icon);
    ok(e.links.length===3&&e.links.every(l=>near(l.dy))&&near(e.back),`${T} 編輯中：連結與返回鍵的中心跟行事曆圓鈕在同一條線（連結 ${e.links.map(l=>f2(l.dy)).join('、')}px、返回鍵 ${f2(e.back)}px）`);
    const xs=e.links.map(l=>l.x);
    ok(xs.every(Boolean)&&eic.length&&elt.length&&xs.every(x=>Math.abs(x.dx-xs[1].dx)<=1&&Math.abs(x.dy-xs[1].dy)<=1),`${T} 編輯中：紅色 × 相對於自己那顆圓鈕的位置，有圖示與首字母的連結一樣（${xs.map(x=>x?f2(x.dx)+','+f2(x.dy):'無').join('／')}）`);
    console.log(`  ${T} 編輯中偏移（px）：${e.links.map(l=>(l.icon?'圖示':'字母')+' '+f2(l.dy)).join('、')}、返回鍵 ${f2(e.back)}`);
    ok(!errs.length,`${T} 沒有錯誤 ${errs.join(' | ')}`);
    await ctx.close()}
  /* 開動態：各種情況結束後都回到原位 */
  const ID=t=>t==='none'||/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t);
  const still=p=>p.evaluate(()=>{const out=[];const chk=e=>{if(!e)return;const t=getComputedStyle(e).transform;if(!(t==='none'||/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)))out.push((e.className&&e.className.baseVal==null?e.className:e.tagName)+' '+t)};
    ['.hm-dock','.hm-dk','.hm-dk-in','#hmPub'].forEach(s=>chk(document.querySelector(s)));document.querySelectorAll('.hm-dk-in>.hm-lk,.hm-dk-in>.hm-lk .hm-lkc,.hm-dk-in>.hm-lk img').forEach(chk);
    const op=getComputedStyle(document.querySelector('.hm-dock')).opacity;if(op!=='1')out.push('.hm-dock opacity '+op);
    const run=document.getAnimations().filter(a=>a.playState==='running'&&a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('#hmDock')&&!a.effect.target.closest('svg')).length;if(run)out.push('還在動 '+document.getAnimations().filter(a=>a.playState==='running'&&a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('#hmDock')&&!a.effect.target.closest('svg')).map(a=>(a.effect.target.className||a.effect.target.tagName)+':'+(a.transitionProperty||a.animationName||a.id||'js')+':'+a.effect.getComputedTiming().iterations).join(','));
    return out});
  const line=async p=>{const r=await read(p);return {r,bad:[...r.links.filter(l=>!near(l.dy)).map(l=>l.nm+' '+f2(l.dy)),...(r.add!=null&&!near(r.add)?['＋ '+f2(r.add)]:[])]}};
  const calm=p=>p.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'&&a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('#hm')),null,{timeout:6000}).catch(()=>{});
  const back=(T,what,st,ln)=>ok(!st.length&&!ln.bad.length,`${T} ${what}之後回到原位：transform 都是 none、下排不透明（${st.join('；')||'是'}）、中心都在同一條線（${ln.bad.join('、')||`差 ${ln.r.links.map(l=>f2(l.dy)).join('、')}px`}）`);
  for(const [w,h,mode] of [[1300,800,'dark'],[412,860,'light']]){
    const T=`[動態 ${w} ${mode}]`,touch=w<700;
    const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block',ignoreHTTPSErrors:true,reducedMotion:'no-preference'});
    await ctx.addInitScript(([v,ui])=>{try{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',JSON.stringify(v));localStorage.setItem('stustsa-ui',JSON.stringify(ui))}}catch(_){}},[[...LINKS,{u:'https://slow.example/',n:'慢站'}],{pal:'fin',mode,sound:false}]);
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(U+'home.html',{waitUntil:'domcontentloaded'});await p.waitForSelector('.hm-dk-in>.hm-lk:nth-of-type(4)',{timeout:8000}).catch(()=>{});await p.waitForTimeout(900);   /* 慢站的圖 2.5 秒才回（會拖住 load 事件），這時還沒載到 */
    /* 8. 圖示載入前後 */
    const pre=await read(p),sl=pre.links.find(l=>l.nm==='慢站');
    const st0=(await still(p)).filter(x=>!/還在動/.test(x));
    ok(sl&&!sl.icon&&near(sl.dy)&&!st0.length,`${T} 圖示還沒載到：慢站先顯示首字母圓鈕、中心在同一條線（差 ${sl?f2(sl.dy):'—'}px）、沒有位移（${st0.join('；')||'是'}；${sl&&sl.icon?'已載到':'未載到'}）`);
    await p.waitForFunction(()=>{const i=document.querySelector('.hm-dk-in>.hm-lk[data-nm="慢站"] img');return i&&i.complete&&i.naturalWidth>2&&getComputedStyle(i).opacity==='1'},null,{timeout:6000}).catch(()=>{});
    await calm(p);await p.waitForTimeout(300);
    let ln=await line(p);const sl2=ln.r.links.find(l=>l.nm==='慢站');
    ok(sl2&&sl2.icon,`${T} 慢站的圖示載到了`);back(T,'圖示載入完成',await still(p),ln);
    /* 9. 滑過再移開（桌面） */
    if(!touch){const sel='.hm-dk-in>.hm-lk[data-nm="雲端硬碟"] .hm-lkc',shot=n=>process.env.SHOTS&&mode==='dark'?p.screenshot({path:path.join(process.env.SHOTS,`hover-${n}-${w}-${mode}.png`),clip:{x:0,y:0,width:w,height:h}}).then(()=>p.evaluate(()=>{const r=document.getElementById('hmDk').getBoundingClientRect();return {x:r.left-12,y:r.top-40,width:r.width+24,height:r.height+52}})).then(c=>p.screenshot({path:path.join(process.env.SHOTS,`hover-${n}-${w}-${mode}-dock.png`),clip:c})):null;
      await p.mouse.move(5,5);await shot('before');
      await p.hover('#hmPub');await p.waitForTimeout(400);const hp=await p.evaluate(()=>{const cs=getComputedStyle(document.getElementById('hmPub'));return {t:cs.transform,e:cs.transitionTimingFunction.split(',')[0],d:cs.transitionDuration.split(',')[0]}});
      await p.hover(sel);await p.waitForTimeout(400);
      const hv=await p.evaluate(s=>{const e=document.querySelector(s),cs=getComputedStyle(e),ti=cs.transitionProperty.split(',').map(x=>x.trim()).indexOf('transform');return {t:cs.transform,e:cs.transitionTimingFunction.split(',')[Math.max(0,ti)].trim(),d:cs.transitionDuration.split(',')[Math.max(0,ti)].trim()}},sel);
      const mid=await read(p),dl=mid.links.find(l=>l.nm==='雲端硬碟');await shot('during');
      ok(hv.t===hp.t&&hv.t!=='none'&&hv.e===hp.e&&hv.d===hp.d,`${T} 滑過連結的回饋跟行事曆圓鈕同一套（連結 ${hv.t} ${hv.e} ${hv.d}；行事曆 ${hp.t} ${hp.e} ${hp.d}）`);
      ok(dl&&near(dl.dy),`${T} 滑過時圖示仍在同一條線（原地放大，差 ${dl?f2(dl.dy):'—'}px）`);
      await p.mouse.move(5,5);await p.waitForTimeout(450);await shot('after');
      back(T,'滑過再移開',await still(p),await line(p))}
    /* 10. 新增、移除連結 */
    await p.click('.hm-lkadd');await p.waitForSelector('#hmLkU',{timeout:3000}).catch(()=>{});await p.fill('#hmLkU','new.example');await p.press('#hmLkU','Enter');
    await p.waitForFunction(()=>{const i=document.querySelector('.hm-dk-in>.hm-lk[data-nm="new.example"] img');return i&&i.complete&&i.naturalWidth>2&&getComputedStyle(i).opacity==='1'},null,{timeout:6000}).catch(()=>{});
    await calm(p);await p.waitForTimeout(300);
    ln=await line(p);ok(!!ln.r.links.find(l=>l.nm==='new.example'&&l.icon),`${T} 新增的連結載到圖示`);back(T,'新增連結（編輯中）',await still(p),ln);
    await p.click('.hm-dk-in>.hm-lk[data-nm="new.example"] .hm-lkx');await calm(p);await p.waitForTimeout(300);
    back(T,'移除連結（編輯中）',await still(p),await line(p));
    await p.keyboard.press('Escape');if(!touch)await p.mouse.move(5,5);await calm(p);   /* 移除後版面縮回來，滑鼠可能剛好落在別的連結上（那是正常的滑過），先移開 */await p.waitForTimeout(300);
    back(T,'結束編輯',await still(p),await line(p));
    /* 11. 進部門再回主頁 */
    if(touch){const c=await p.evaluate(()=>{const e=document.querySelector('.hm-wc.on'),q=e.getBoundingClientRect();return [q.left+q.width/2,q.top+60]});await p.mouse.click(c[0],c[1])}
    else await p.evaluate(()=>document.querySelector('.hm-tile.on').click());
    await p.waitForURL(/index\.html/,{timeout:8000}).catch(()=>{});await p.waitForTimeout(2500);
    await p.goBack();await p.waitForURL(/home\.html/,{timeout:8000}).catch(()=>{});await p.waitForTimeout(2600);await calm(p);
    await p.waitForFunction(()=>[...document.querySelectorAll('.hm-dk-in>.hm-lk')].every(l=>{const i=l.querySelector('img.hm-lki');return !i||i.complete&&i.naturalWidth>2&&getComputedStyle(i).opacity==='1'}),null,{timeout:6000}).catch(()=>{});
    ln=await line(p);ok(/home\.html/.test(p.url())&&ln.r.links.filter(l=>l.icon).length>=3,`${T} 按返回回到主頁、圖示都在（${ln.r.links.map(l=>l.nm+(l.icon?'＝圖示':'＝字母')).join('、')}）`);
    back(T,'進部門再回主頁（dockMove）',await still(p),ln);
    ok(!errs.length,`${T} 沒有錯誤 ${errs.join(' | ')}`);
    await ctx.close()}
  ok(!net.extra.length,`沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
  await b.close();net.close();
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
