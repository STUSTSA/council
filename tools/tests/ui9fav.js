/* ui9fav：主頁下排常用連結的網站圖示後援（docs/DESIGN-next.md 第六節「下排」；DievE 11/19 定）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   順序：網站自己的 /favicon.ico → Google 圖示服務（https://www.google.com/s2/favicons?domain=<hostname>&sz=64，只送網域）→ 首字母圓鈕；圖片不帶 referrer。
   412 與 1300 各跑一次：
   1. 網站有圖示：顯示網站自己的圖，沒有向 Google 要
   2. 網站沒有、Google 有（64×64）：顯示 Google 的圖；Google 請求只含網域（網址帶路徑與查詢字串也一樣）、沒有 Referer
   3. 兩邊都沒有（網站 404、Google 回 16×16 預設圖並附 404 狀態）：首字母圓鈕跟下排其他圓鈕（全會行事曆）同寬高、是圓的、字的中心在圓鈕中心 0.5px 內
   4. 首字是 HTML 字元（&、"）時照字面顯示、名稱含 <img onerror> 不執行
   5. 結果只記在記憶體：再加一個同網站的連結（重畫下排）不重複要；沒有存進 localStorage／sessionStorage
   6. 所有外部網址都模擬，沒有預期外的外部請求
   外部網址不用 page.route：Playwright 只要有攔截，網址結尾是 /favicon.ico 的請求一律直接中止（不經過 route），測不到「網站有圖示」。
   改用 --host-resolver-rules 把所有網域（127.0.0.1 以外）都指到測試自己開的 https 小伺服器（自簽憑證，用 openssl 當場產生），
   由它扮演 Google Fonts、GitHub API、Google 圖示服務與各網站；瀏覽器啟動時拿掉環境裡的 proxy 設定。這樣不會真的連出去，
   小伺服器也記下每個請求（網域、路徑、Referer），不在預期內的就讓測試失敗。
   SHOTS=<資料夾> 時另存截圖（412、1300 × 米黃淺色、深色），不 commit。失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const fs=require('fs'),os=require('os'),path=require('path'),https=require('https'),zlib=require('zlib'),{execFileSync}=require('child_process');
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
const SITE_PNG=png(32,32,[10,91,170]),G64=png(64,64,[47,157,98]),G16=png(16,16,[160,160,160]);
/* 連結：a 網站有圖示；b 網站沒有、Google 有（網址帶路徑、查詢字串、#）；c 兩邊都沒有；&x、"q 首字是 HTML 字元 */
const LINKS=[{u:'https://a.example/',n:'甲站'},{u:'https://b.example/some/path/page.html?q=1&r=two#frag',n:'乙站'},{u:'https://c.example/',n:''},
  {u:'https://&x.example/',n:XSS},{u:'https://"q.example/',n:''}];

(async()=>{
  /* https 小伺服器：所有外部網域都到這裡。a.example 有 /favicon.ico，其他網站 404；Google 圖示服務 b.example 有 64×64，其他回 16×16 預設圖＋404 */
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ui9fav-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(tmp,'k.pem'),'-out',path.join(tmp,'c.pem'),'-days','1','-subj','/CN=a.example'],{stdio:'ignore'});
  const site=[],g=[],extra=[];
  const srv=https.createServer({key:fs.readFileSync(path.join(tmp,'k.pem')),cert:fs.readFileSync(path.join(tmp,'c.pem'))},(q,r)=>{
    const host=String(q.headers.host||'').replace(/:\d+$/,''),ref=q.headers.referer||'',u=new URL(q.url,'https://'+(host||'x'));
    if(host==='fonts.googleapis.com'){r.writeHead(200,{'Content-Type':'text/css','Access-Control-Allow-Origin':'*'});return r.end('')}
    if(host==='api.github.com'){r.writeHead(404,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});return r.end('{}')}
    if(host==='www.google.com'&&u.pathname==='/s2/favicons'){const d=u.searchParams.get('domain');g.push({u:'https://www.google.com'+q.url,d,ref});
      if(d==='b.example'){r.writeHead(200,{'Content-Type':'image/png'});return r.end(G64)}
      r.writeHead(404,{'Content-Type':'image/png'});return r.end(G16)}
    if(/\.example$/.test(host)&&q.url==='/favicon.ico'){site.push({host,u:q.url,ref});
      if(host==='a.example'){r.writeHead(200,{'Content-Type':'image/png'});return r.end(SITE_PNG)}
      r.writeHead(404,{'Content-Type':'text/html'});return r.end('<!doctype html><title>404</title>')}
    if(/\.example$/.test(host))site.push({host,u:q.url,ref});
    extra.push('https://'+host+q.url);r.writeHead(404);r.end()});
  /* 自簽憑證：瀏覽器第一次握手會先回「憑證不明」再照 ignoreHTTPSErrors 重連，這種只檢查網域在預期內；其他 TLS 錯誤（例如不是 https）一律算預期外 */
  srv.on('tlsClientError',(e,k)=>{const h=k&&k.servername||'';if(/CERTIFICATE_UNKNOWN/.test(e.code)&&/^(fonts\.googleapis\.com|api\.github\.com|www\.google\.com|.+\.example)$/.test(h))return;extra.push('（TLS '+h+' '+e.code+'）')});
  await new Promise(r=>srv.listen(FAV_PORT,'127.0.0.1',r));
  fs.rmSync(tmp,{recursive:true,force:true});
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/proxy/i.test(k)));
  const b=await chromium.launch({env,args:[`--host-resolver-rules=MAP * 127.0.0.1:${FAV_PORT}, EXCLUDE 127.0.0.1, EXCLUDE localhost`]});
  const mk=async(w,h,o={})=>{const touch=w<700;
    const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block',ignoreHTTPSErrors:true,reducedMotion:'reduce'});
    await ctx.addInitScript(([v,ui])=>{try{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',JSON.stringify(v));if(ui)localStorage.setItem('stustsa-ui',JSON.stringify(ui))}}catch(_){}},[o.links||LINKS,o.ui||null]);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;return p};
  /* 等每個連結都有結果：載到圖示（.ico）或圖片已拿掉（顯示首字母） */
  const settled=p=>p.waitForFunction(n=>{const l=[...document.querySelectorAll('.hm-dk-in>.hm-lk')];return l.length===n&&l.every(x=>x.classList.contains('ico')||!x.querySelector('img'))},LINKS.length,{timeout:10000}).then(()=>true).catch(()=>false);
  const read=p=>p.evaluate(()=>{const pub=document.getElementById('hmPub').getBoundingClientRect();
    return {pub:{w:pub.width,h:pub.height},xss:window.__xss||0,imgs:[...document.querySelectorAll('#hmDk img')].every(i=>i.classList.contains('hm-lki')),
      links:[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const i=l.querySelector('img'),c=l.querySelector('.hm-lkl'),cs=getComputedStyle(c),r=c.getBoundingClientRect();
        let tc=null;if(c.firstChild){const rg=document.createRange();rg.selectNodeContents(c);const t=rg.getBoundingClientRect();tc={dx:t.left+t.width/2-(r.left+r.width/2),dy:t.top+t.height/2-(r.top+r.height/2)}}
        return {nm:l.dataset.nm,ico:l.classList.contains('ico'),src:i&&i.getAttribute('src'),nw:i&&i.naturalWidth,rp:i&&i.referrerPolicy,ivis:i?getComputedStyle(i).opacity:null,
          ch:c.textContent,html:c.innerHTML,kids:c.children.length,disp:cs.display,w:r.width,h:r.height,br:cs.borderRadius,brPx:parseFloat(cs.borderTopLeftRadius)||0,bg:cs.backgroundColor,tc}})}});

  for(const [w,h] of [[412,860],[1300,800]]){const T=`${w} 寬`;site.length=0;g.length=0;extra.length=0;
    const p=await mk(w,h);await p.goto(U+'home.html');
    ok(await settled(p),`${T}：五個連結的圖示都有結果`);
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
    ok(c.tc&&Math.abs(c.tc.dx)<=.5&&Math.abs(c.tc.dy)<=.5,`${T} 字的中心在圓鈕中心 0.5px 內（${c.tc&&c.tc.dx.toFixed(2)}, ${c.tc&&c.tc.dy.toFixed(2)}）`);
    ok(/^rgb/.test(c.bg)&&c.bg!=='rgba(0, 0, 0, 0)',`${T} 首字母圓鈕有底色（${c.bg}）`);
    /* 4. 跳脫 */
    const x=r.links.find(l=>l.nm===XSS.slice(0,30))||{},q=L('"q.example');
    ok(x.ch==='&'&&x.html==='&amp;'&&x.kids===0&&q.ch==='"'&&q.kids===0,`${T} 首字是 HTML 字元：照字面顯示（${x.ch} ${x.html}、${q.ch}），沒有多出元素`);
    ok(!r.xss&&r.imgs,`${T} 名稱含 <img onerror>：沒有執行，下排只有網站圖示的 img`);
    ok(g.some(x=>x.u===G+'%26x.example&sz=64'),`${T} Google 請求的網域經過 encodeURIComponent（${g.filter(x=>/x\.example/.test(x.d)).map(x=>x.u).join('、')}）`);
    /* 5. 只記在記憶體：再加一個同網站的連結（重畫下排），不重複要 */
    const n0={g:g.length,s:site.length};
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(150);
    await p.fill('#hmLkU','https://c.example/other?z=1');await p.fill('#hmLkN','丙二');await p.press('#hmLkU','Enter');
    await p.fill('#hmLkU','https://a.example/again');await p.fill('#hmLkN','甲二');await p.press('#hmLkU','Enter');await p.waitForTimeout(400);
    await p.keyboard.press('Escape');await p.waitForTimeout(300);
    r=await read(p);const c2=L('丙二'),a2=L('甲二');
    ok(g.length===n0.g&&!c2.ico&&!c2.src&&c2.ch==='C'&&a2.ico&&a2.src==='https://a.example/favicon.ico',`${T} 同網站的連結沿用記憶體裡的結果：沒有再向 Google 要（${g.length-n0.g} 次），丙二直接是首字母、甲二用網站的圖`);
    const st=await p.evaluate(()=>{const o=[];for(const s of [localStorage,sessionStorage])for(let i=0;i<s.length;i++){const k=s.key(i);o.push([k,s.getItem(k)])}return o});
    const leak=st.filter(([k,v])=>/favicon|google|s2\//i.test(k+(k==='stustsa-links'?'':v)));
    ok(!leak.length,`${T} 圖示結果沒有存進 localStorage／sessionStorage（${leak.map(x=>x[0]).join('、')||'無'}）`);
    /* 6. 沒有預期外的外部請求 */
    ok(!extra.length,`${T} 沒有預期外的外部請求（${extra.join('、')||'無'}）`);
    ok(!p.errs.length,`${T} 沒有錯誤 `+p.errs.join(' | '));
    await p.ctx.close()}

  /* 截圖（SHOTS=資料夾）：下排三種圖示各一個 */
  if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});
    for(const [w,h] of [[412,860],[1300,800]])for(const mode of ['light','dark']){
      const p=await mk(w,h,{links:LINKS.slice(0,3),ui:{pal:'fin',mode,sound:false}});await p.goto(U+'home.html');
      await p.waitForFunction(()=>{const l=[...document.querySelectorAll('.hm-dk-in>.hm-lk')];return l.length===3&&l.every(x=>x.classList.contains('ico')||!x.querySelector('img'))},null,{timeout:10000}).catch(()=>{});
      await p.waitForTimeout(1500);const f=path.join(process.env.SHOTS,`fav-${w}-${mode}.png`);await p.screenshot({path:f});
      const box=await p.evaluate(()=>{const r=document.getElementById('hmDk').getBoundingClientRect();return {x:r.left-12,y:r.top-12,width:r.width+24,height:r.height+24}});
      await p.screenshot({path:f.replace(/\.png$/,'-dock.png'),clip:box});console.log('截圖 '+f);await p.ctx.close()}}

  await b.close();srv.close();
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
