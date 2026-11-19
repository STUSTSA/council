/* ui9fav：主頁下排常用連結的網站圖示後援（docs/DESIGN-next.md 第六節「下排」；DievE 11/19 定）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   順序：網站自己的 /favicon.ico → Google 圖示服務（https://www.google.com/s2/favicons?domain=<hostname>&sz=64，只送網域）→ 首字母圓鈕；圖片不帶 referrer。
   412 與 1300 各跑一次：
   1. 網站有圖示：顯示網站自己的圖，沒有向 Google 要
   2. 網站沒有、Google 有（64×64）：顯示 Google 的圖；Google 請求只含網域（網址帶路徑與查詢字串也一樣）、沒有 Referer
   3. 兩邊都沒有（網站 404、Google 回 16×16 預設圖並附 404 狀態）：首字母圓鈕跟下排其他圓鈕（全會行事曆）同寬高、是圓的、
      字形實際墨跡（字色改透明前後的截圖相減，deviceScaleFactor 4）的中心在圓鈕中心 1px 內（基線對齊整數 px，最好也差 0.5px）
   4. 首字是 HTML 字元（&、"）時照字面顯示、名稱含 <img onerror> 不執行
   5. 結果只記在記憶體（LK_ICO）：已知兩邊都沒有的網站再加一個連結，新節點從頭就沒有 <img>；已知用 Google 圖示的，新節點第一個 src 就是 Google 那個網址
      （MutationObserver 記下新節點插入當下的 src；拿掉快取時會先向網站要 /favicon.ico）；沒有存進 localStorage／sessionStorage
   6. 網站回 1×1 的極小圖（透明佔位）＝當成沒有，改向 Google 要
   7. 所有外部網址都模擬，沒有預期外的外部請求
   另外各一次（1300）：
   8. 內網／本機網域（IP、localhost、單段名、.local、.internal、.lan、.home.arpa、.localhost）：不向網站也不向 Google 要任何圖示（page.on('request') 記下全部請求），直接首字母
   9. 載入中刪掉連結（網站延遲 1.5 秒才回 404）：Google 沒收到那個網域、結果沒寫進快取（再加回來會重新向網站要）
  10. 中文網域的首字（M2）：中文網域（去掉 www. 後的網域開頭是 punycode「xn--」）有名稱＝名稱第一個字（照字素：emoji、組合字完整一個）；
      沒名稱（空的或名稱就是網域）＝維持網域第一個字母（punycode 的 X）；英數網域有名稱＝仍用網域首字母；從輸入框打中文網址也一樣。
      審查修正：只看首字母實際取字的那一段（去掉 www. 後的網域開頭）——只有頂級網域或後段是中文（example.台灣、blog.例子.tw）仍用網域首字母、
      中文子網域（中文.github.io）用名稱；名稱寫成網域的各種樣子（例子.tw、www.例子.tw、https://例子.tw/）＝沒取名稱；名稱開頭的零寬空格跳過、只有零寬空格＝沒取名稱
   外部網址用 fakenet.js（--host-resolver-rules 指到測試自己開的 https 小伺服器、拿掉 proxy），不用 route（見 fakenet.js 檔頭）；
   小伺服器扮演 Google Fonts、GitHub API、Google 圖示服務與各網站，記下每個請求（網域、路徑、Referer），不在預期內的就讓測試失敗。
   SHOTS=<資料夾> 時另存截圖（412、1300 × 米黃淺色、深色），不 commit。失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),zlib=require('zlib'),fakeNet=require('./fakenet.js');
const U='http://127.0.0.1:8300/',PORT=+U.match(/:(\d+)\//)[1],FAV_PORT=PORT+9;
const G='https://www.google.com/s2/favicons?domain=';
const XSS='<img src=x onerror="window.__xss=1">';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 單色 PNG（寬 W、高 H） */
const png=(W,H,rgb=[10,91,170])=>{const crc=b=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0};
  const ch=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;const raw=Buffer.alloc(H*(W*3+1));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let k=0;k<3;k++)raw[y*(W*3+1)+1+x*3+k]=rgb[k];
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])};
const SITE_PNG=png(32,32,[10,91,170]),G64=png(64,64,[47,157,98]),G16=png(16,16,[160,160,160]),PX1=png(1,1,[255,255,255]);
/* 連結：a 網站有圖示；b 網站沒有、Google 有（網址帶路徑、查詢字串、#）；c 兩邊都沒有；&x、"q 首字是 HTML 字元；tiny 網站回 1×1、Google 有 */
const LINKS=[{u:'https://a.example/',n:'甲站'},{u:'https://b.example/some/path/page.html?q=1&r=two#frag',n:'乙站'},{u:'https://c.example/',n:''},
  {u:'https://&x.example/',n:XSS},{u:'https://"q.example/',n:''},{u:'https://tiny.example/',n:'小圖'}];
/* 內網／本機網域：兩步都不要 */
const LAN=[{u:'http://192.168.1.1/admin',ch:'1'},{u:'http://localhost:3000/',ch:'L'},{u:'http://nas/',ch:'N'},{u:'https://printer.local/',ch:'P'},
  {u:'http://[fd00::1]/',ch:'['},{u:'https://svc.internal/',ch:'S'},{u:'https://pc.lan/',ch:'P'},{u:'https://box.home.arpa/',ch:'B'},{u:'http://app.localhost/',ch:'A'},{u:'http://nas./',ch:'N'}];

(async()=>{
  /* https 小伺服器：a.example 有 /favicon.ico，tiny.example 回 1×1，slow.example 1.5 秒後才回 404，其他網站 404；
     Google 圖示服務 b.example、tiny.example 有 64×64，其他回 16×16 預設圖＋404 */
  const site=[],g=[];
  const net=await fakeNet(FAV_PORT,(q,r,{host,url,ref})=>{
    if(host==='www.google.com'&&url.pathname==='/s2/favicons'){const d=url.searchParams.get('domain');g.push({u:'https://www.google.com'+q.url,d,ref});
      if(d==='b.example'||d==='tiny.example'){r.writeHead(200,{'Content-Type':'image/png'});r.end(G64);return true}
      r.writeHead(404,{'Content-Type':'image/png'});r.end(G16);return true}
    if(!/\.example$|^([a-z0-9-]+\.)?xn--[a-z0-9-]+\.tw$|^example\.xn--kpry57d$|^xn--fiq228c\.github\.io$/.test(host))return false;
    site.push({host,u:q.url,ref});if(q.url!=='/favicon.ico')return false;
    if(host==='a.example'){r.writeHead(200,{'Content-Type':'image/png'});r.end(SITE_PNG);return true}
    if(host==='tiny.example'){r.writeHead(200,{'Content-Type':'image/png'});r.end(PX1);return true}
    const nf=()=>{try{r.writeHead(404,{'Content-Type':'text/html'});r.end('<!doctype html><title>404</title>')}catch(_){}};
    if(host==='slow.example')setTimeout(nf,1500);else nf();return true},/^(www\.google\.com|.+\.example|([a-z0-9-]+\.)?xn--[a-z0-9-]+\.tw|example\.xn--kpry57d|xn--fiq228c\.github\.io)$/);
  const b=await chromium.launch(net.launch);
  const mk=async(w,h,o={})=>{const touch=w<700;
    const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block',ignoreHTTPSErrors:true,reducedMotion:'reduce',deviceScaleFactor:o.dsf||1});
    await ctx.addInitScript(([v,ui])=>{try{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',JSON.stringify(v));if(ui)localStorage.setItem('stustsa-ui',JSON.stringify(ui))}}catch(_){}},[o.links||LINKS,o.ui||null]);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.reqs=[];p.on('request',q=>p.reqs.push(q.url()));p.ctx=ctx;return p};
  /* 等每個連結都有結果：載到圖示（.ico）或圖片已拿掉（顯示首字母） */
  const settled=(p,n=LINKS.length)=>p.waitForFunction(n=>{const l=[...document.querySelectorAll('.hm-dk-in>.hm-lk')];return l.length===n&&l.every(x=>x.classList.contains('fav')||!x.querySelector('img'))},n,{timeout:10000}).then(()=>true).catch(()=>false);
  /* 新插入的圖示節點：插入當下（同一個 microtask 內，網路還沒回來）的 src */
  const watchNew=p=>p.evaluate(()=>{window.__first=[];new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;
    (n.matches('img')?[n]:[...n.querySelectorAll('img')]).forEach(i=>{const l=i.closest('.hm-lk');window.__first.push({nm:l&&l.dataset.nm,src:i.getAttribute('src')})})}}).observe(document.getElementById('hmDkIn'),{childList:true,subtree:true})});
  const first=(p,nm)=>p.evaluate(nm=>window.__first.filter(x=>x.nm===nm).map(x=>x.src),nm);
  /* 字形墨跡：字色改透明前後各截一張圓鈕（裝置像素），相減後有差的像素的外框，換回 CSS px；回傳墨跡中心減圓鈕中心 */
  const ink=async(p,sel)=>{const el=await p.$(sel);if(!el)return null;const box=await el.boundingBox(),dsf=await p.evaluate(()=>devicePixelRatio);
    const s1=(await p.screenshot({clip:box})).toString('base64');await el.evaluate(e=>e.style.color='transparent');
    const s2=(await p.screenshot({clip:box})).toString('base64');await el.evaluate(e=>e.style.color='');
    const bb=await p.evaluate(async([a,c])=>{const dec=async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const cv=document.createElement('canvas');cv.width=im.naturalWidth;cv.height=im.naturalHeight;const x=cv.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,cv.width,cv.height)};
      const A=await dec(a),B=await dec(c),W=A.width,H=A.height,d=new Float32Array(W*H);let mx=0;
      for(let i=0;i<W*H;i++){const v=Math.max(Math.abs(A.data[i*4]-B.data[i*4]),Math.abs(A.data[i*4+1]-B.data[i*4+1]),Math.abs(A.data[i*4+2]-B.data[i*4+2]));d[i]=v;if(v>mx)mx=v}
      let x0=W,x1=-1,y0=H,y1=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(d[y*W+x]>mx*.5){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
      return mx?{x0,x1,y0,y1,W,H}:null},[s1,s2]);
    if(!bb)return null;return {dx:((bb.x0+bb.x1+1)/2-bb.W/2)/dsf,dy:((bb.y0+bb.y1+1)/2-bb.H/2)/dsf,w:(bb.x1-bb.x0+1)/dsf,h:(bb.y1-bb.y0+1)/dsf}};
  const read=p=>p.evaluate(()=>{const pub=document.getElementById('hmPub').getBoundingClientRect();
    return {pub:{w:pub.width,h:pub.height},xss:window.__xss||0,imgs:[...document.querySelectorAll('#hmDk img')].every(i=>i.classList.contains('hm-lki')),
      links:[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const i=l.querySelector('img'),c=l.querySelector('.hm-lkl'),cs=getComputedStyle(c),o=l.querySelector('.hm-lkc'),os=getComputedStyle(o),r=o.getBoundingClientRect();   /* 圓（大小、圓角、底色）在 .hm-lkc（ui-10 起首字母與圖示共用） */
        return {nm:l.dataset.nm,ico:l.classList.contains('fav'),src:i&&i.getAttribute('src'),nw:i&&i.naturalWidth,rp:i&&i.referrerPolicy,ivis:i?getComputedStyle(i).opacity:null,
          ch:c.textContent,html:c.innerHTML,kids:c.children.length,disp:cs.display,w:r.width,h:r.height,br:os.borderRadius,brPx:parseFloat(os.borderTopLeftRadius)||0,bg:os.backgroundColor}})}});

  for(const [w,h] of [[412,860],[1300,800]]){const T=`${w} 寬`;site.length=0;g.length=0;net.extra.length=0;
    const p=await mk(w,h);await p.goto(U+'home.html');
    ok(await settled(p),`${T}：${LINKS.length} 個連結的圖示都有結果`);
    let r=await read(p);const L=n=>r.links.find(l=>l.nm===n)||{};
    /* 1. 網站有圖示 */
    const a=L('甲站');
    ok(a.ico&&a.src==='https://a.example/favicon.ico'&&a.nw===32&&a.rp==='no-referrer'&&a.disp==='none'&&a.ivis==='1',`${T} 網站有圖示：顯示網站自己的 /favicon.ico（${a.src}，${a.nw}px）、不帶 referrer、首字母藏起來`);
    ok(!g.some(x=>x.d==='a.example'),`${T} 網站有圖示：沒有向 Google 要（Google 收到 ${g.map(x=>x.d).join('、')||'無'}）`);
    ok(site.some(x=>x.host==='a.example'&&x.u==='/favicon.ico'&&!x.ref),`${T} 網站收到 /favicon.ico、沒有 Referer`);
    /* 2. 網站沒有、Google 有 */
    const bl=L('乙站'),gb=g.filter(x=>x.d==='b.example');
    ok(site.some(x=>x.host==='b.example'&&x.u==='/favicon.ico'),`${T} 網站沒有：先向網站要過 /favicon.ico（404）`);
    ok(gb.length===1&&gb[0].u===G+'b.example&sz=64'&&!gb[0].ref,`${T} Google 請求只含網域、沒有 Referer（${gb.map(x=>x.u+(x.ref?' ref='+x.ref:'')).join('、')}）`);
    ok(!g.some(x=>/some|path|page|q=1|frag/.test(x.u))&&!site.some(x=>x.host==='b.example'&&x.u!=='/favicon.ico'),`${T} 網址帶路徑、查詢字串時：送出去的只有網域（網站也只收到 /favicon.ico）`);
    ok(bl.ico&&bl.src===G+'b.example&sz=64'&&bl.nw===64&&bl.rp==='no-referrer'&&bl.disp==='none',`${T} 顯示 Google 的圖（${bl.src}，${bl.nw}px）`);
    /* 3. 兩邊都沒有 */
    const c=L('c.example');
    ok(g.some(x=>x.d==='c.example')&&!c.ico&&!c.src&&c.disp!=='none'&&c.ch==='C',`${T} 兩邊都沒有（Google 回 16×16 預設圖、404）：顯示首字母「${c.ch}」`);
    ok(Math.abs(c.w-r.pub.w)<.01&&Math.abs(c.h-r.pub.h)<.01,`${T} 首字母圓鈕跟全會行事曆圓鈕同寬高（${c.w}×${c.h} vs ${r.pub.w}×${r.pub.h}）`);
    ok((c.br==='50%'||c.brPx>=c.w/2-.01)&&c.w===c.h,`${T} 首字母圓鈕是圓的（border-radius ${c.br}）`);
    /* 墨跡置中：另開一頁只放這一個連結（下排不捲、不動），deviceScaleFactor 4。字的基線會對齊到整數 px，44px 圓鈕裡 11px 高的大寫字最好也差 0.5px，所以門檻 1px（見交接說明一百零五「審查修正」） */
    {const q=await mk(w,h,{dsf:4,links:[{u:'https://c.example/',n:''}]});await q.goto(U+'home.html');await settled(q,1);await q.waitForTimeout(300);
      const ik=await ink(q,'.hm-dk-in>.hm-lk .hm-lkl');
      ok(ik&&ik.w>2&&ik.h>2&&Math.abs(ik.dx)<=1&&Math.abs(ik.dy)<=1,`${T} 字形實際墨跡的中心在圓鈕中心 1px 內（${ik?`${ik.dx.toFixed(2)}, ${ik.dy.toFixed(2)}；墨跡 ${ik.w.toFixed(2)}×${ik.h.toFixed(2)}`:'量不到'}）`);
      await q.ctx.close()}
    ok(/^rgb/.test(c.bg)&&c.bg!=='rgba(0, 0, 0, 0)',`${T} 首字母圓鈕有底色（${c.bg}）`);
    /* 4. 跳脫 */
    const x=r.links.find(l=>l.nm===XSS.slice(0,30))||{},q=L('"q.example');
    ok(x.ch==='&'&&x.html==='&amp;'&&x.kids===0&&q.ch==='"'&&q.kids===0,`${T} 首字是 HTML 字元：照字面顯示（${x.ch} ${x.html}、${q.ch}），沒有多出元素`);
    ok(!r.xss&&r.imgs,`${T} 名稱含 <img onerror>：沒有執行，下排只有網站圖示的 img`);
    ok(g.some(x=>x.u===G+'%26x.example&sz=64'),`${T} Google 請求的網域經過 encodeURIComponent（${g.filter(x=>/x\.example/.test(x.d)).map(x=>x.u).join('、')}）`);
    /* 6. 網站回 1×1：當成沒有，改向 Google 要 */
    const tn=L('小圖');
    ok(site.some(x=>x.host==='tiny.example'&&x.u==='/favicon.ico')&&g.some(x=>x.d==='tiny.example')&&tn.ico&&tn.src===G+'tiny.example&sz=64'&&tn.nw===64,`${T} 網站回 1×1 透明佔位：當成沒有，改用 Google 的圖（${tn.src}，${tn.nw}px）`);
    /* 5. 只記在記憶體：已知兩邊都沒有的網站、已知用 Google 圖示的網站各再加一個連結，新節點直接用快取的結果 */
    const n0={g:g.filter(x=>x.d==='c.example').length,s:site.filter(x=>x.host==='b.example'||x.host==='c.example').length};
    await watchNew(p);
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(150);
    await p.fill('#hmLkU','https://c.example/other?z=1');await p.fill('#hmLkN','丙二');await p.press('#hmLkU','Enter');
    await p.fill('#hmLkU','https://b.example/again');await p.fill('#hmLkN','乙二');await p.press('#hmLkU','Enter');await p.waitForTimeout(400);
    await p.keyboard.press('Escape');await p.waitForTimeout(300);
    r=await read(p);const c2=L('丙二'),b2=L('乙二'),fc=await first(p,'丙二'),fb=await first(p,'乙二');
    ok(!fc.length&&!c2.ico&&!c2.src&&c2.ch==='C'&&c2.disp!=='none',`${T} 已知兩邊都沒有的網站再加一個連結：新節點從頭就沒有 <img>、直接是首字母（插入時的 src：${fc.join('、')||'無'}）`);
    ok(fb.length===1&&fb[0]===G+'b.example&sz=64'&&b2.ico&&b2.src===G+'b.example&sz=64',`${T} 已知用 Google 圖示的網站再加一個連結：新節點第一個 src 就是快取的 Google 網址（${fb.join('、')||'無'}）`);
    const n1={g:g.filter(x=>x.d==='c.example').length,s:site.filter(x=>x.host==='b.example'||x.host==='c.example').length};
    ok(n1.g===n0.g&&n1.s===n0.s,`${T} 沒有再向網站或 Google 要這兩個網域（網站 ${n1.s-n0.s} 次、Google ${n1.g-n0.g} 次）`);
    const st=await p.evaluate(()=>{const o=[];for(const s of [localStorage,sessionStorage])for(let i=0;i<s.length;i++){const k=s.key(i);o.push([k,s.getItem(k)])}return o});
    const leak=st.filter(([k,v])=>/favicon|google|s2\//i.test(k+(k==='stustsa-links'?'':v)));
    ok(!leak.length,`${T} 圖示結果沒有存進 localStorage／sessionStorage（${leak.map(x=>x[0]).join('、')||'無'}）`);
    /* 7. 沒有預期外的外部請求 */
    ok(!net.extra.length,`${T} 沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
    ok(!p.errs.length,`${T} 沒有錯誤 `+p.errs.join(' | '));
    await p.ctx.close()}

  /* 8. 內網／本機網域：兩步都不要，直接首字母 */
  {site.length=0;g.length=0;net.extra.length=0;
    const p=await mk(1300,800,{links:LAN.map(x=>({u:x.u,n:''}))});await p.goto(U+'home.html');await p.waitForTimeout(2500);
    const d=await p.evaluate(()=>[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>({nm:l.dataset.nm,img:!!l.querySelector('img'),ico:l.classList.contains('fav'),
      ch:l.querySelector('.hm-lkl').textContent,disp:getComputedStyle(l.querySelector('.hm-lkl')).display})));
    const out=p.reqs.filter(u=>!u.startsWith(U)&&!/^https:\/\/(fonts\.googleapis\.com|api\.github\.com)\//.test(u));
    ok(d.length===LAN.length&&d.every((x,i)=>!x.img&&!x.ico&&x.disp!=='none'&&x.ch===LAN[i].ch),`內網／本機網域：沒有 <img>、直接顯示首字母（${d.map(x=>x.nm+'＝'+x.ch+(x.img?'＋img':'')).join('、')}）`);
    ok(!out.length&&!g.length&&!site.length,`內網／本機網域：瀏覽器沒有發出任何圖示請求（網站、Google 都沒有：${out.concat(g.map(x=>x.u)).join('、')||'無'}）`);
    ok(!net.extra.length,`內網／本機網域：沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
    ok(!p.errs.length,'內網／本機網域：沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}

  /* 9. 載入中刪掉連結：網站 1.5 秒後才回 404，期間刪掉；Google 不能收到、結果不能寫進快取 */
  {site.length=0;g.length=0;net.extra.length=0;
    const p=await mk(1300,800,{links:[{u:'https://slow.example/',n:'慢站'}]});await p.goto(U+'home.html',{waitUntil:'domcontentloaded'});   /* load 事件會等圖片，要在圖片還沒回來時就動手 */
    const t0=Date.now();while(!site.some(x=>x.host==='slow.example')&&Date.now()-t0<5000)await p.waitForTimeout(50);
    const asked=site.some(x=>x.host==='slow.example'&&x.u==='/favicon.ico');
    await p.click('.hm-dk-in>.hm-lkadd');await p.click('.hm-lk[data-nm="慢站"] .hm-lkx');await p.waitForTimeout(2500);
    const left=await p.evaluate(()=>({lk:document.querySelectorAll('.hm-lk').length,img:document.querySelectorAll('#hmDk img').length}));
    ok(asked&&left.lk===0&&left.img===0,`載入中刪掉連結：網站收到過 /favicon.ico（${asked}）、刪掉後畫面上沒有連結與圖片（${left.lk}、${left.img}）`);
    ok(!g.some(x=>x.d==='slow.example'),`載入中刪掉連結：網站晚回 404 之後沒有改向 Google 要（Google 收到 ${g.map(x=>x.d).join('、')||'無'}）`);
    const s0=site.filter(x=>x.host==='slow.example').length;await watchNew(p);
    await p.fill('#hmLkU','https://slow.example/');await p.press('#hmLkU','Enter');await p.waitForTimeout(200);
    const fs2=await first(p,'slow.example'),s1=site.filter(x=>x.host==='slow.example').length;
    ok(fs2[0]==='https://slow.example/favicon.ico'&&s1===s0+1,`載入中刪掉的結果沒有寫進快取：再加回來會重新向網站要（插入時的 src：${fs2.join('、')||'無'}；網站多收到 ${s1-s0} 次）`);
    await p.keyboard.press('Escape');ok(await settled(p,1),'再加回來的連結照常走完後援（網站 404 → Google 預設圖 → 首字母）');
    ok(!net.extra.length,`載入中刪掉連結：沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
    ok(!p.errs.length,'載入中刪掉連結：沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}

  /* 10. 中文網域的首字（M2）：網站與 Google 都沒有圖示（404、16×16 預設圖），看首字 */
  {site.length=0;g.length=0;net.extra.length=0;
    const ZWJ='\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',COMB='e\u0301',FLAG='\u{1F1F9}\u{1F1FC}';
    const CJK=[{u:'https://例子.tw/',n:'範例網站',ch:'範',t:'中文網域有名稱＝名稱第一個字'},
      {u:'https://例子.tw/none',n:'',ch:'X',t:'中文網域沒名稱＝維持網域第一個字母（punycode）'},
      {u:'https://例子.tw/same',n:'xn--fsqu00a.tw',ch:'X',t:'中文網域、名稱就是網域＝維持網域第一個字母'},
      {u:'https://www.範例.example/',n:ZWJ+'家庭',ch:ZWJ,t:'名稱開頭是 ZWJ 組成的 emoji＝完整一個字素'},
      {u:'https://範例.example/f',n:FLAG+'台灣',ch:FLAG,t:'名稱開頭是國旗 emoji＝完整一個字素'},
      {u:'https://範例.example/c',n:COMB+'clair',ch:COMB,t:'名稱開頭是組合字＝完整一個字素（照打的樣子，不轉大寫）'},
      {u:'https://d.example/',n:'丁站',ch:'D',t:'英數網域有名稱＝仍用網域首字母'}];
    const p=await mk(1300,800,{links:CJK.map(({u,n})=>({u,n}))});await p.goto(U+'home.html');
    ok(await settled(p,CJK.length),`中文網域：${CJK.length} 個連結的圖示都有結果`);
    const d=await p.evaluate(()=>[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const c=l.querySelector('.hm-lkl');return {ch:c.textContent,kids:c.children.length,img:!!l.querySelector('img'),disp:getComputedStyle(c).display}}));
    CJK.forEach((x,i)=>{const r=d[i]||{};ok(r.ch===x.ch&&!r.kids&&!r.img&&r.disp!=='none',`${x.t}：${x.u}（名稱「${x.n}」）→「${r.ch}」（應為「${x.ch}」）`)});
    /* 從輸入框打中文網址（原始輸入含非 ASCII） */
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(150);
    await p.fill('#hmLkU','測試.tw');await p.fill('#hmLkN','<b>粗</b>');await p.press('#hmLkU','Enter');await p.waitForTimeout(300);
    await p.keyboard.press('Escape');ok(await settled(p,CJK.length+1),'從輸入框加的中文網域連結也有結果');
    const e=await p.evaluate(()=>{const l=[...document.querySelectorAll('.hm-dk-in>.hm-lk')].pop(),c=l.querySelector('.hm-lkl');return {ch:c.textContent,html:c.innerHTML,kids:c.children.length,u:l.querySelector('a').getAttribute('href')}});
    ok(e.ch==='<'&&e.html==='&lt;'&&!e.kids&&/xn--/.test(e.u),`從輸入框打中文網址：首字照名稱第一個字、照字面（${e.u}「${e.ch}」${e.html}）`);
    /* 中文字的墨跡也在圓鈕正中（行框裁到大寫字高到基線，中文字比大寫字高、略低於基線，兩邊抵掉；門檻同上 1px） */
    {const q=await mk(1300,800,{dsf:4,links:[{u:'https://例子.tw/',n:'範例網站'}]});await q.goto(U+'home.html');await settled(q,1);await q.waitForTimeout(300);
      const ik=await ink(q,'.hm-dk-in>.hm-lk .hm-lkl');
      ok(ik&&ik.w>2&&ik.h>2&&Math.abs(ik.dx)<=1&&Math.abs(ik.dy)<=1,`中文網域：首字「範」的墨跡中心在圓鈕中心 1px 內（${ik?`${ik.dx.toFixed(2)}, ${ik.dy.toFixed(2)}；墨跡 ${ik.w.toFixed(2)}×${ik.h.toFixed(2)}`:'量不到'}）`);
      await q.ctx.close()}
    ok(!net.extra.length,`中文網域：沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
    ok(!p.errs.length,'中文網域：沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close();
    /* 審查修正（下排最多 12 個，另開一頁）：只看取字的那一段、名稱等於網域的各種寫法、零寬字元 */
    const ZW='\u200B',REV=[{u:'https://example.台灣/',n:'我的網站',ch:'E',t:'只有頂級網域是中文＝首字母取得到，仍用網域首字母'},
      {u:'https://blog.例子.tw/',n:'部落格',ch:'B',t:'中文在後段（blog.例子.tw）＝仍用網域首字母'},
      {u:'https://中文.github.io/',n:'測試',ch:'測',t:'中文子網域＝名稱第一個字'},
      {u:'https://例子.tw/u1',n:'https://例子.tw/',ch:'X',t:'名稱是完整中文網址＝當成沒取名稱'},
      {u:'https://例子.tw/u2',n:'www.例子.tw',ch:'X',t:'名稱是 www. 加中文網域＝當成沒取名稱'},
      {u:'https://www.例子.tw/u3',n:'例子.tw',ch:'X',t:'連結有 www.、名稱是中文網域＝當成沒取名稱'},
      {u:'https://例子.tw/z1',n:ZW+'範例',ch:'範',t:'名稱開頭零寬空格＝跳過，取「範」'},
      {u:'https://例子.tw/z2',n:ZW+ZW,ch:'X',t:'名稱只有零寬空格＝當成沒取名稱'}];
    site.length=0;g.length=0;net.extra.length=0;
    const r2=await mk(1300,800,{links:REV.map(({u,n})=>({u,n}))});await r2.goto(U+'home.html');
    ok(await settled(r2,REV.length),`審查修正：${REV.length} 個連結的圖示都有結果`);
    const d2=await r2.evaluate(()=>[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const c=l.querySelector('.hm-lkl');return {ch:c.textContent,kids:c.children.length,img:!!l.querySelector('img')}}));
    REV.forEach((x,i)=>{const r=d2[i]||{};ok(r.ch===x.ch&&!r.kids&&!r.img,`${x.t}：${x.u}（名稱「${x.n.replace(/\u200B/g,'<ZWSP>')}」）→「${(r.ch||'').replace(/\u200B/g,'<ZWSP>')}」（應為「${x.ch}」）`)});
    ok(!net.extra.length,`審查修正：沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
    ok(!r2.errs.length,'審查修正：沒有錯誤 '+r2.errs.join(' | '));
    await r2.ctx.close()}

  /* 截圖（SHOTS=資料夾）：下排三種圖示各一個 */
  if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});
    for(const [w,h] of [[412,860],[1300,800]])for(const mode of ['light','dark']){
      const p=await mk(w,h,{links:LINKS.slice(0,3),ui:{pal:'fin',mode,sound:false}});await p.goto(U+'home.html');
      await p.waitForFunction(()=>{const l=[...document.querySelectorAll('.hm-dk-in>.hm-lk')];return l.length===3&&l.every(x=>x.classList.contains('fav')||!x.querySelector('img'))},null,{timeout:10000}).catch(()=>{});
      await p.waitForTimeout(1500);const f=path.join(process.env.SHOTS,`fav-${w}-${mode}.png`);await p.screenshot({path:f});
      const box=await p.evaluate(()=>{const r=document.getElementById('hmDk').getBoundingClientRect();return {x:r.left-12,y:r.top-12,width:r.width+24,height:r.height+24}});
      await p.screenshot({path:f.replace(/\.png$/,'-dock.png'),clip:box});console.log('截圖 '+f);await p.ctx.close()}}

  await b.close();net.close();
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
