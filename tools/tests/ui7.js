/* ui7：新介面第 7 步（主頁：桌面色塊、手機卡片堆、下排與全會行事曆、開場、進部門過場；docs/DESIGN-next.md 第六節「主頁」、第五節）。
   github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   1. 桌面 1300：只有左上標誌、時間、設定、色塊、下排（沒有工具列、通知）；九張色塊（英文小標、名稱、標誌）；焦點框只用 transform 滑到焦點那張；方向鍵、滾輪、點擊換焦點；到兩端頂一下
   2. 部門標誌：九個 dept/icons/dept-代號.svg 都載得到，色塊裡放的是同一份 SVG（零件 dg- class）；部門標題列用自己的標誌
   3. 手機 412：卡片堆露出 196／60、焦點卡與下一張留 10、退後的縮 5%（量 transform）；手指往上滑 140px 換下一張；點露出的那一條叫到焦點；點焦點卡進入
   4. 下排置中、全會行事曆圓鈕、帶陰影（ui-08 起有個人常用連結與「+」，在 ui8home.js 測）；打開公共版行事曆（全部／活動／會議，沒有今日／明日、逾期），Esc、返回鍵、關閉鈕關；反覆開關 resize 監聽不累積；設定鈕打開外觀
   5. 開場：小人先滑入、標誌再上移、字由左到右揭開（各動畫的延遲順序），播完收掉（現有流程沒有開場登入鈕）；關掉動態直接是結果
   6. 進部門過場（桌面鋪滿、手機翻面）與看板到達的底板：Element.animate 的 keyframes 只有 transform／opacity；交接 pfx-burst 用完就刪；回主頁焦點是那個部門
   7. 進行中的張數（資料檔讀一次）；跳脫（部門名含 <img onerror>）；頁面沒有 title 屬性；412 沒有橫捲；深色左邊小人只留線稿
   9. sw.js：快取版本照 sw.js（board-cache-v數字）、NO_CACHE 也排除 data-部門.json、安裝清單含新介面新增的檔；只開看板時主頁的檔已在離線備份、資料檔不存
      安裝清單含 index.html、home.html 載入的每個本地 CSS／JS（跟網頁同步，漏加會被測出來）
  10. 只開過主頁就離線：再開部門看板畫得出來、沒有 pageerror；activate 只刪自己的舊版本（board-cache-*），同網域其他快取不動
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
const SW_SRC=require('fs').readFileSync(require('path').join(__dirname,'../../sw.js'),'utf8'),SW_CACHE=(SW_SRC.match(/const CACHE="([^"]+)"/)||[])[1];   /* 快取名稱照 sw.js（換版本時測試不用跟著改） */
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const XSS='<img src=x onerror="window.__xss=1">';
/* 攔 Element.animate：記下每一組 keyframes 用到的屬性（主頁的程式動畫只能動 transform／opacity） */
const HOOK=()=>{window.__kp=new Set();const o=Element.prototype.animate;Element.prototype.animate=function(k,t){try{(Array.isArray(k)?k:[k]).forEach(f=>Object.keys(f||{}).forEach(x=>window.__kp.add(x)))}catch(_){}return o.call(this,k,t)};
  /* 視窗 resize 監聽的淨數（加的減掉拆的）：行事曆那一層關掉時 calUnmount 拆掉 LiquidSeg、下次重建，只數加的會一直變多 */
  window.__rs=0;const a=window.addEventListener,d=window.removeEventListener;window.addEventListener=function(t,...r){if(t==='resize')window.__rs++;return a.call(this,t,...r)};
  window.removeEventListener=function(t,...r){if(t==='resize')window.__rs--;return d.call(this,t,...r)}};
const ALLOWED=new Set(['transform','opacity','offset','easing','composite']);
(async()=>{const b=await chromium.launch();
  const mk=async(w,h,o={})=>{const touch=w<700;const ctx=await b.newContext({viewport:{width:w,height:h},colorScheme:o.scheme||'light',hasTouch:touch,isMobile:touch,serviceWorkers:'block',reducedMotion:o.rm?'reduce':'no-preference'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    if(o.cfg)await ctx.route('**/dept/config.js',async r=>{const res=await r.fetch();r.fulfill({response:res,body:(await res.text()).replace('name: "行銷部"',`name: ${JSON.stringify(XSS)}`)})});
    if(o.data)await ctx.route('**/data-finance.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({schemaVersion:13,events:[{id:'a'},{id:'b'},{id:'c'},{id:'d',doneAt:'2026-11-01'}],issues:[],weeks:[]})}));
    await ctx.addInitScript(HOOK);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;return p};
  const go=async(p,u,ms=3300)=>{await p.goto(U+u);await p.waitForTimeout(ms)};

  /* ---------- 1. 桌面 ---------- */
  {const p=await mk(1300,860,{data:1});await go(p,'home.html');
    const r=await p.evaluate(()=>({tiles:document.querySelectorAll('.hm-tile').length,on:document.querySelector('.hm-tile.on .hm-nm')?.textContent,en:document.querySelector('.hm-tile.on .hm-en')?.textContent,
      su:!!document.querySelector('#hmMe svg.hm-su .su-emb'),clock:document.getElementById('hmClock').textContent,set:document.getElementById('hmSet').getAttribute('aria-label'),
      bad:document.querySelectorAll('#tabbar,.tb-main,#notiBtn,.noti-n,.lseg').length,title:document.querySelectorAll('[title]').length}));
    ok(r.tiles===9&&r.on==='權益部'&&r.en==='STUDENT RIGHTS',`九張色塊、焦點預設權益部（${r.tiles} ${r.on} ${r.en}）`);
    ok(r.su&&/^\d\d:\d\d$/.test(r.clock)&&r.set==='設定'&&r.bad===0,`只有左上標誌、時間 ${r.clock}、設定鈕；沒有工具列、通知、部門／專案切換`);
    ok(r.title===0,'主頁沒有 title 屬性');
    const ring=()=>p.evaluate(()=>{const g=document.getElementById('hmRing'),t=document.querySelector('.hm-tile.on'),m=new DOMMatrix(getComputedStyle(g).transform);
      return {tf:g.style.transform,cx:m.m41+g.offsetWidth/2,tx:t.offsetLeft+t.offsetWidth/2,w:g.offsetWidth,i:+t.dataset.i,trans:getComputedStyle(g).transitionProperty}});
    let a=await ring();await p.waitForTimeout(500);a=await ring();
    ok(Math.abs(a.cx-a.tx)<1.5&&/translate/.test(a.tf)&&a.trans==='transform',`焦點框對準焦點那張、只用 transform 過渡（${a.cx.toFixed(1)} vs ${a.tx}）`);
    await p.keyboard.press('ArrowRight');await p.waitForTimeout(700);let b1=await ring();
    ok(b1.i===a.i+1&&Math.abs(b1.cx-b1.tx)<1.5&&b1.w===a.w,`方向鍵右：焦點到下一張、焦點框滑過去、大小不變（${b1.i}）`);
    ok(await p.evaluate(()=>document.activeElement===document.querySelector('.hm-tile.on')),'鍵盤焦點跟著選到的那張');
    await p.mouse.move(650,430);await p.mouse.wheel(0,120);await p.waitForTimeout(700);let c1=await ring();
    ok(c1.i===b1.i+1,`滾輪：焦點再往後一張（${c1.i}）`);
    const t0=await p.$('.hm-tile[data-i="0"]');await t0.scrollIntoViewIfNeeded();await t0.click();await p.waitForTimeout(800);let d1=await ring();
    ok(d1.i===0&&p.url().endsWith('home.html')&&Math.abs(d1.cx-d1.tx)<1.5,`點沒有焦點的色塊＝換焦點、不進入（${d1.i}）`);
    await p.keyboard.press('ArrowLeft');await p.waitForTimeout(120);
    ok(await p.evaluate(()=>!!document.getElementById('hmRail').getAnimations().length),'到頭還往前：整列頂一下（拉過頭的回彈動畫）');
    /* 標誌與張數 */
    const lg=await p.evaluate(async()=>{const ids=['president','secretariat','rights','marketing','finance','events','affairs','pr','works'];
      const res=await Promise.all(ids.map(id=>fetch(`dept/icons/dept-${id}.svg`).then(async r=>r.ok&&/<svg[^>]*class="dg" data-d="/.test(await r.text()))));
      return {res,inl:[...document.querySelectorAll('.hm-tile .hm-lg svg.dg')].map(s=>s.dataset.d).length,parts:document.querySelectorAll('.hm-tile .dg-all').length,
        fin:document.querySelector('.hm-tile[href="index.html?d=finance"] .hm-n'),n:document.querySelector('.hm-tile[href="index.html?d=finance"] .hm-n')?.textContent}});
    ok(lg.res.every(Boolean),'九個部門標誌 SVG 都載得到（dept/icons/dept-代號.svg） '+lg.res);
    ok(lg.inl===9&&lg.parts===9,`色塊裡放的是同一份 SVG（${lg.inl} 個、零件 .dg-all ${lg.parts}）`);
    ok(lg.n==='3','進行中的張數：資料檔的未結案即時回報（財務部 3） '+lg.n);
    ok(!p.errs.length,'桌面沒有錯誤 '+p.errs.join(' | '));
    /* 下排與全會行事曆 */
    /* ui-08：下排＝跟畫面一樣寬的一條（#hmDock）裡置中的膠囊（#hmDk），底色與陰影在膠囊左右兩半的底板（.hm-dk-bg）上；個人常用連結的「+」與連結在 ui8home.js 測 */
    const dk=await p.evaluate(()=>{const d=document.getElementById('hmDk'),r=d.getBoundingClientRect();return {c:r.left+r.width/2,btn:d.querySelectorAll('button:not(.hm-lkadd),a').length,pub:!!d.querySelector('.hm-pub[aria-label="全會行事曆"]'),sh:getComputedStyle(d.querySelector('.hm-dk-bg>span')).boxShadow,
      bg:getComputedStyle(d.querySelector('.hm-pub')).backgroundColor,pri:getComputedStyle(document.documentElement).getPropertyValue('--pri').trim()}});
    ok(Math.abs(dk.c-650)<2&&dk.btn===1&&dk.pub&&dk.sh!=='none',`下排置中、全會行事曆圓鈕（主要動作色）、帶陰影（${dk.c} ${dk.btn}；個人常用連結與「+」在 ui8home.js）`);
    const hl=await p.evaluate(()=>history.length);
    await p.click('#hmPub');await p.waitForTimeout(700);
    const cal=await p.evaluate(()=>{const l=document.getElementById('hmCal');return {vis:!!l&&!l.hidden,pub:!!l.querySelector('.cal.pub'),modes:[...l.querySelectorAll('.cal-seg [data-k]')].map(x=>x.textContent).join(),
      noday:!l.querySelector('.nd-card,.nt-late,#notiDeck'),title:l.querySelector('.sec-h')?.textContent,hl:history.length,inert:document.getElementById('hm').inert}});
    ok(cal.vis&&cal.pub&&cal.modes==='全部,活動,會議'&&cal.noday,`全會行事曆：公共版（${cal.modes}；${cal.title}），沒有今日／明日、逾期`);
    ok(cal.hl===hl+1&&cal.inert,'打開推一筆瀏覽紀錄、主頁 inert');
    await p.keyboard.press('Escape');await p.waitForTimeout(500);
    ok(await p.evaluate(()=>!document.getElementById('hmCal')||document.getElementById('hmCal').hidden)&&p.url().endsWith('home.html'),'Esc 關掉');
    await p.click('#hmPub');await p.waitForTimeout(500);await p.goBack();await p.waitForTimeout(500);
    ok(await p.evaluate(()=>!document.getElementById('hmCal')||document.getElementById('hmCal').hidden)&&p.url().endsWith('home.html'),'返回鍵關掉、還在主頁');
    await p.click('#hmPub');await p.waitForTimeout(500);await p.click('#hmCal .hm-ly-x');await p.waitForTimeout(500);
    ok(await p.evaluate(()=>!document.getElementById('hmCal')||document.getElementById('hmCal').hidden),'關閉鈕關掉');
    const rs1=await p.evaluate(()=>window.__rs);
    for(let i=0;i<5;i++){await p.click('#hmPub');await p.waitForTimeout(350);await p.keyboard.press('Escape');await p.waitForTimeout(350)}
    const rs2=await p.evaluate(()=>window.__rs);
    ok(rs2===rs1,`反覆開關行事曆 resize 監聽不累積（${rs1} → ${rs2}）`);
    await p.click('#hmSet');await p.waitForTimeout(600);
    ok(await p.evaluate(()=>{const l=document.getElementById('hmLook');return !!l&&!l.hidden&&l.querySelectorAll('[data-look-pal]').length===9&&!!l.querySelector('.look-mode')}),'設定鈕打開外觀（九組主題、深淺色）');
    await p.keyboard.press('Escape');await p.waitForTimeout(400);
    /* 進部門（桌面）：焦點那張鋪滿 */
    await p.evaluate(()=>{window.__kp=new Set()});
    await p.keyboard.press('ArrowRight');await p.waitForTimeout(600);await p.keyboard.press('ArrowLeft');await p.waitForTimeout(600);
    const on=await p.$('.hm-tile.on');const nm=await on.$eval('.hm-nm',x=>x.textContent);const bb=await on.boundingBox();
    await p.mouse.click(bb.x+bb.width/2,bb.y+bb.height/2);await p.waitForTimeout(200);
    const mid=await p.evaluate(()=>({fx:document.querySelectorAll('.hm-fx').length,lg:document.querySelectorAll('.hm-fxl svg').length,kp:[...window.__kp],ho:sessionStorage.getItem('pfx-burst')}));
    ok(mid.fx===1&&mid.lg===1,`桌面：被點的色塊連同標誌鋪滿（${nm}）`);
    ok(mid.kp.every(k=>ALLOWED.has(k)),'主頁的動畫只動 transform／opacity：'+mid.kp.join());
    await p.waitForURL(/index\.html/,{timeout:5000}).catch(()=>{});await p.waitForTimeout(30);
    const arr=await p.evaluate(()=>({cover:document.querySelector('.pfx-cover')?.dataset.k,ho:sessionStorage.getItem('pfx-burst')}));
    arr.img=await p.waitForFunction(()=>document.querySelector('.pfx-cover svg.dg')?.dataset.d,null,{timeout:1500}).then(h=>h.jsonValue()).catch(()=>null);
    ok(arr.cover==='tile'&&arr.img===(new URL(p.url()).searchParams.get('d')||'rights')&&arr.ho===null,`看板開頁第一格蓋著同一個終點（${arr.cover}，標誌 ${arr.img} 放進頁面），交接用完就刪`);
    await p.waitForTimeout(2600);
    ok(await p.evaluate(()=>!document.querySelector('.pfx-cover')),'看板穩定後底板淡掉');
    /* 回主頁：收回那一張 */
    const dept=new URL(p.url()).searchParams.get('d');
    await p.click('.dh-home');await p.waitForURL(/home\.html/,{timeout:5000}).catch(()=>{});await p.waitForTimeout(150);
    const back=await p.evaluate(()=>({fx:document.querySelectorAll('.hm-fx').length,on:document.querySelector('.hm-tile.on')?.getAttribute('href')}));
    await p.waitForTimeout(1800);
    ok(back.on===`index.html?d=${dept||'rights'}`&&await p.evaluate(()=>!document.querySelector('.hm-fx')),`回主頁：焦點是剛才的部門、收回的底板播完就拿掉（${back.on}）`);
    await p.ctx.close()}

  /* ---------- 3. 手機卡片堆 ---------- */
  {const p=await mk(412,860);await go(p,'home.html');
    const ws=()=>p.evaluate(()=>[...document.querySelectorAll('.hm-wc')].map(c=>{const m=new DOMMatrix(getComputedStyle(c).transform);return {y:+m.m42.toFixed(1),s:+m.a.toFixed(3),h:c.offsetHeight,o:+getComputedStyle(c).opacity,on:c.classList.contains('on')}}));
    let w=await ws();
    ok(w.length===9&&w[2].on&&w.every(x=>x.h===196),'九張卡片、焦點卡權益部、每張高 196');
    ok(w[0].y===0&&w[1].y===60&&w[2].y===120,`退到後面的疊在上方、每張露 60、貼齊上緣（${w[0].y} ${w[1].y} ${w[2].y}）`);
    ok(w[3].y-w[2].y===206&&w[4].y-w[3].y===60&&w[5].y-w[4].y===60,`焦點卡整張露出、與下一張留 10、還沒輪到的每張露 60（${w[3].y-w[2].y} ${w[4].y-w[3].y}）`);
    ok(w[1].s===.95&&w[0].s===.9&&w[2].s===1,`退一張縮 5%（${w[1].s} ${w[0].s}）`);
    ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'412 沒有橫捲');
    const dk=await p.evaluate(()=>{const r=document.getElementById('hmDk').getBoundingClientRect();return {c:r.left+r.width/2,b:innerHeight-r.bottom,pos:getComputedStyle(document.getElementById('hmDock')).position}});
    ok(Math.abs(dk.c-206)<2&&dk.pos==='fixed'&&dk.b>=17,`下排浮在底部置中（${dk.c} 離底 ${dk.b}）`);
    const cdp=await p.context().newCDPSession(p);const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    /* 手指往上滑 140px（停住再放開＝沒有速度）＝下一張 */
    await t('touchStart',200,600);for(let i=1;i<=14;i++){await t('touchMove',200,600-i*10);await p.waitForTimeout(16)}
    const midw=await ws();await p.waitForTimeout(200);await t('touchEnd');await p.waitForTimeout(900);w=await ws();
    ok(Math.abs(midw[2].y-60)<4&&w[3].on&&w[3].y===120,`跟著手指（拖 140px 時焦點卡在 ${midw[2].y}），放開停在下一張（行銷部）`);
    /* 點露出的那一條＝叫到焦點 */
    const r1=await p.evaluate(()=>{const c=document.querySelectorAll('.hm-wc')[1].getBoundingClientRect();return [c.left+40,c.top+20]});
    await p.touchscreen.tap(r1[0],r1[1]);await p.waitForTimeout(900);w=await ws();
    ok(w[1].on&&p.url().endsWith('home.html'),'點露出的那一條：叫到焦點、不進入');
    /* 甩：快速往上甩，最多多走 3 張 */
    await t('touchStart',200,700);for(let i=1;i<=6;i++){await t('touchMove',200,700-i*40);await p.waitForTimeout(8)}await t('touchEnd');await p.waitForTimeout(1200);w=await ws();
    const fi=w.findIndex(x=>x.on);ok(fi>2&&fi<=1+3+2,`甩得快多走幾張（停在第 ${fi} 張）`);
    /* 點焦點卡＝進入（翻面） */
    await p.evaluate(()=>{window.__kp=new Set()});
    const rf=await p.evaluate(()=>{const c=document.querySelector('.hm-wc.on'),r=c.getBoundingClientRect();return [r.left+r.width/2,r.top+60,c.getAttribute('href')]});
    await p.touchscreen.tap(rf[0],rf[1]);await p.waitForTimeout(80);
    const pre=await p.evaluate(()=>document.querySelectorAll('.hm-flw').length);await p.waitForTimeout(380);
    await p.screenshot({path:'ui7_flip_412.png'});
    const fl=await p.evaluate(()=>({flw:!!document.querySelector('.hm-flw .hm-ff')&&!!document.querySelector('.hm-flw .hm-fb svg.dg'),kp:[...window.__kp]}));
    ok(pre===1&&fl.flw,'手機：點焦點卡進入，卡片分身翻面、部門底板帶標誌');
    ok(fl.kp.every(k=>ALLOWED.has(k)),'翻面過場只動 transform／opacity：'+fl.kp.join());
    await p.waitForURL(/index\.html/,{timeout:5000}).catch(()=>{});await p.waitForTimeout(30);
    ok(p.url().endsWith(rf[2])&&await p.evaluate(()=>document.querySelector('.pfx-cover')?.dataset.k)==='flip',`進到 ${rf[2]}，開頁蓋著翻過來的部門底板`);
    await p.evaluate(()=>{window.__kp2=[];const o=Element.prototype.animate;Element.prototype.animate=function(k,t){if(this.classList&&this.classList.contains('pfx-cover'))(Array.isArray(k)?k:[k]).forEach(f=>window.__kp2.push(...Object.keys(f)));return o.call(this,k,t)}});
    await p.waitForTimeout(2500);
    ok(await p.evaluate(()=>!document.querySelector('.pfx-cover')&&window.__kp2.length>0&&window.__kp2.every(k=>['opacity','transform','offset'].includes(k))),'底板淡出（只動 opacity）、看板區塊浮上來');
    ok(!p.errs.length,'手機沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}

  /* ---------- 5. 開場 ---------- */
  {const p=await mk(412,860);await p.goto(U+'home.html');await p.waitForTimeout(120);
    const sp=await p.evaluate(()=>{const s=document.getElementById('splash');if(!s)return null;
      const d=el=>el.getAnimations().map(a=>a.effect.getTiming().delay)[0];
      const gw=[...s.querySelectorAll('.sp-gw')];return {y:d(s.querySelector('.sp-y')),b:d(s.querySelector('.sp-b')),emb:d(s.querySelector('.sp-emb')),g:gw.map(d),n:gw.length,login:!!s.querySelector('button')}});
    ok(sp&&sp.n===14,'開場：小人＋14 個字（STUSTSA、南臺科大學生會）');
    ok(sp&&sp.y<sp.emb&&sp.b<sp.emb&&Math.min(...sp.g)>sp.emb,`順序：兩個小人滑入（${sp&&sp.y}ms）→ 標誌上移（${sp&&sp.emb}ms）→ 字揭開（${sp&&Math.min(...sp.g)}ms 起）`);
    const inc=a=>a.every((x,i)=>!i||x>a[i-1]);
    ok(sp&&inc(sp.g.slice(0,7))&&inc(sp.g.slice(7)),'兩行字都由左到右（左邊的先開始）');
    ok(sp&&!sp.login,'現有流程沒有開場登入鈕：播完直接收掉');
    const ar=await p.evaluate(()=>{const e=document.querySelector('.sp-emb').getBoundingClientRect(),g=[...document.querySelectorAll('.sp-gw')].slice(0,7).map(x=>x.getBoundingClientRect()),lg=document.querySelector('.sp-logo').getBoundingClientRect();
      return {r:(g[6].right-g[0].left)/e.width,h:lg.height/innerHeight}});
    ok(ar.r>1.9&&ar.r<2.3&&ar.h<=.4,`字寬約為小人的 ${ar.r.toFixed(2)} 倍、標誌高 ${(ar.h*100).toFixed(0)}% 畫面高`);
    await p.waitForTimeout(3200);
    ok(await p.evaluate(()=>!document.getElementById('splash')&&!document.querySelector('.sp-fly')),'播完收掉（小人縮到左上標誌上後分身拿掉）');
    await p.ctx.close();
    const q=await mk(412,860,{rm:1});await q.goto(U+'home.html');await q.waitForTimeout(150);
    const r=await q.evaluate(()=>({sp:!!document.getElementById('splash'),an:document.getAnimations().filter(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length}));
    await q.waitForTimeout(1200);
    ok(r.sp&&r.an===0&&await q.evaluate(()=>!document.getElementById('splash')),`關掉動態：開場沒有程式動畫、直接是結果再收掉（${r.an}）`);
    /* 關掉動態：點焦點卡直接換頁、不交接 */
    const rf=await q.evaluate(()=>{const r=document.querySelector('.hm-wc.on').getBoundingClientRect();return [r.left+r.width/2,r.top+60]});
    await q.touchscreen.tap(rf[0],rf[1]);await q.waitForURL(/index\.html/,{timeout:3000}).catch(()=>{});
    ok(q.url().includes('index.html')&&await q.evaluate(()=>!document.querySelector('.pfx-cover')),'關掉動態：直接換頁、沒有底板');
    await q.ctx.close()}

  /* ---------- 7. 跳脫、深色 ---------- */
  {const p=await mk(1300,860,{cfg:1,scheme:'dark'});await go(p,'home.html');
    const r=await p.evaluate(()=>({xss:window.__xss,img:document.querySelectorAll('#hmStage img').length,txt:[...document.querySelectorAll('.hm-nm')].some(x=>x.textContent.includes('<img')),
      y:getComputedStyle(document.querySelector('#hmMe .su-y')).fill,ys:getComputedStyle(document.querySelector('#hmMe .su-y')).stroke,
      sh:getComputedStyle(document.documentElement).getPropertyValue('--wal-sh').trim(),hid:[...document.querySelectorAll('.hm-n')].map(n=>{const h=n.hidden;n.hidden=true;const d=getComputedStyle(n).display;n.hidden=h;return d})}));
    ok(!r.xss&&r.img===0&&r.txt,'部門名含 <img onerror>：當成文字（esc），沒有執行');
    ok(r.y==='none'&&r.ys!=='none','深色：左邊小人只留線稿');
    ok(r.sh==='rgba(0,0,0,.62)'&&r.hid.length>0&&r.hid.every(x=>x==='none'),`深色的浮起陰影（theme.css 的 --wal-sh ${r.sh}）；張數藏起來時不顯示（${r.hid.length} 個都是 display:none）`);
    ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}

  /* ---------- 8. 審查修正 ---------- */
  /* 8a 手機：拖過卡片堆之後，鍵盤 Enter 第一次就進焦點卡（拖完放開沒有點擊，不能留著「吃掉下一次點擊」的旗標） */
  {const p=await mk(412,860);await go(p,'home.html');
    const cdp=await p.context().newCDPSession(p);const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    await t('touchStart',200,600);for(let i=1;i<=14;i++){await t('touchMove',200,600-i*10);await p.waitForTimeout(16)}await p.waitForTimeout(200);await t('touchEnd');await p.waitForTimeout(900);
    const want=await p.evaluate(()=>{const c=document.querySelector('.hm-wc.on');c.focus();return c.getAttribute('href')});
    await p.keyboard.press('Enter');await p.waitForURL(/index\.html/,{timeout:4000}).catch(()=>{});
    ok(p.url().endsWith(want),`拖過之後第一次 Enter 就進焦點卡（${want} → ${p.url().replace(U,'')}）`);
    await p.ctx.close()}
  /* 8b 桌面深色：秘書處標誌的白色零件（.dg-w）在色塊、鋪滿的分身、看板開頁的底板都是同一個顏色（色塊底色，不是白） */
  {const p=await mk(1300,860,{scheme:'dark'});await go(p,'home.html');
    await p.keyboard.press('ArrowLeft');await p.waitForTimeout(700);
    const h0=await p.evaluate(()=>{const t=document.querySelector('.hm-tile.on'),w=t.querySelector('.dg-w');return {href:t.getAttribute('href'),bg:getComputedStyle(t).backgroundColor,w:w&&getComputedStyle(w).fill}});
    await p.click('.hm-tile.on');await p.waitForTimeout(150);
    const fx=await p.evaluate(()=>{const w=document.querySelector('.hm-fxl .dg-w'),o=document.querySelector('.hm-fx');return {w:w&&getComputedStyle(w).fill,bg:o&&getComputedStyle(o).backgroundColor}});
    await p.waitForURL(/index\.html/,{timeout:5000}).catch(()=>{});
    const cv=await p.waitForFunction(()=>{const c=document.querySelector('.pfx-cover'),w=c&&c.querySelector('svg .dg-w');return w&&{w:getComputedStyle(w).fill,bg:getComputedStyle(c).backgroundColor,k:c.dataset.k}},null,{timeout:1500}).then(h=>h.jsonValue()).catch(()=>null);
    ok(h0.href==='index.html?d=secretariat'&&h0.w===h0.bg&&fx.w===h0.bg&&fx.bg===h0.bg,`深色：色塊與鋪滿分身裡的白色零件＝色塊底色（${h0.w} ${fx.w} 底 ${h0.bg}）`);
    ok(!!cv&&cv.k==='tile'&&cv.w===h0.bg&&cv.bg===h0.bg&&cv.w!=='rgb(255, 255, 255)',`深色：看板開頁的底板裡同一個零件也是同色，沒有白塊（${cv&&cv.w} 底 ${cv&&cv.bg}）`);
    await p.ctx.close()}
  /* 8c 系統返回鍵（沒走 bfcache）回主頁：焦點是剛才的部門、收回那一張、不放開場 */
  {const p=await mk(1300,860);await go(p,'home.html');
    await p.keyboard.press('ArrowLeft');await p.waitForTimeout(700);await p.click('.hm-tile.on');
    await p.waitForURL(/index\.html/,{timeout:5000}).catch(()=>{});await p.waitForTimeout(2600);
    await p.goBack();await p.waitForTimeout(160);
    const bk=await p.evaluate(()=>({on:document.querySelector('.hm-tile.on')?.getAttribute('href'),fx:document.querySelectorAll('.hm-fx').length,sp:!!document.getElementById('splash'),
      nav:performance.getEntriesByType('navigation')[0]?.type}));
    ok(bk.nav==='back_forward'&&bk.on==='index.html?d=secretariat'&&bk.fx===1&&!bk.sp,`系統返回鍵回主頁（${bk.nav}）：焦點是秘書處、收回那一張、不放開場（${bk.on} ${bk.fx} ${bk.sp}）`);
    await p.waitForTimeout(1800);
    ok(await p.evaluate(()=>!document.querySelector('.hm-fx')),'收回的底板播完就拿掉');
    ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}
  /* 8d 手機深色：翻面的部門底板（--bg）與看板開頁的翻面底板裡，白色零件＝底板底色 */
  {const p=await mk(412,860,{scheme:'dark'});await go(p,'home.html');
    await p.keyboard.press('ArrowUp');await p.waitForTimeout(900);
    const rf=await p.evaluate(()=>{const c=document.querySelector('.hm-wc.on'),r=c.getBoundingClientRect();return [r.left+r.width/2,r.top+60,c.getAttribute('href'),getComputedStyle(c.querySelector('.dg-w')).fill,getComputedStyle(c).backgroundColor]});
    await p.touchscreen.tap(rf[0],rf[1]);await p.waitForTimeout(150);
    const fb=await p.evaluate(()=>{const f=document.querySelector('.hm-fb'),w=f&&f.querySelector('.dg-w');return {w:w&&getComputedStyle(w).fill,bg:f&&getComputedStyle(f).backgroundColor}});
    await p.waitForURL(/index\.html/,{timeout:5000}).catch(()=>{});
    const cv=await p.waitForFunction(()=>{const c=document.querySelector('.pfx-cover'),w=c&&c.querySelector('svg .dg-w');return w&&{w:getComputedStyle(w).fill,bg:getComputedStyle(c).backgroundColor,k:c.dataset.k}},null,{timeout:1500}).then(h=>h.jsonValue()).catch(()=>null);
    ok(rf[2]==='index.html?d=secretariat'&&rf[3]===rf[4]&&fb.w===fb.bg&&!!cv&&cv.k==='flip'&&cv.w===fb.bg&&cv.bg===fb.bg,`手機深色：卡片（${rf[3]}／${rf[4]}）、翻面底板（${fb.w}／${fb.bg}）、看板翻面底板（${cv&&cv.w}／${cv&&cv.bg}）的白色零件都＝底色`);
    await p.ctx.close()}
  /* 8e 離線：第一次打開主頁（Service Worker 剛裝好）就把主頁要用的檔案收進離線備份（home.js、部門標誌、主題） */
  {const ctx=await b.newContext({viewport:{width:1300,height:860}});await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    const p=await ctx.newPage();await p.goto(U+'home.html');
    const want=['core/js/home.js','core/theme.css','core/js/theme.js','core/js/pagefx.js','dept/icons/dept-secretariat.svg','dept/icons/dept-works.svg'];
    /* waitForFunction 不等 Promise，自己輪詢：Service Worker 裝好、接手、收完 precache 訊息 */
    const miss=()=>p.evaluate(async([w,cn])=>{if(!(await navigator.serviceWorker.getRegistration()))return w;const c=await caches.open(cn),o=[];
      for(const u of w)if(!(await c.match(new URL(u,location.href).href,{ignoreSearch:true})))o.push(u);return o},[want,SW_CACHE]).catch(e=>['?'+e.message]);
    let m=want;for(let i=0;i<30&&m.length;i++){await p.waitForTimeout(300);m=await miss()}
    const got=!m.length;
    ok(got,'第一次打開主頁就收進離線備份：'+(m.length?'缺 '+m.join():want.join()));
    await ctx.close()}

  /* 9 sw.js（ui-07）：快取版本寫死 board-cache-v21（ui-14；沒換版號時這裡會失敗，提醒換版），並跟 sw.js 一致；NO_CACHE 也排除各部門的 data-*.json；安裝清單含新介面新增的檔。
     實際跑：只打開看板（沒開過主頁）時，主頁要用的 home.js、部門標誌已在離線備份裡，資料檔不在 */
  {const fs=require('fs'),path=require('path'),vm=require('vm');
    const sw=vm.runInNewContext(SW_SRC+';({CACHE,NO_CACHE,SHELL})',{self:{addEventListener(){}},caches:{},fetch(){},location:{origin:''}});
    ok(sw.CACHE==='board-cache-v21'&&sw.CACHE===SW_CACHE,'sw.js 快取版本是 board-cache-v24（週報改議程式版面要換新版號，換了這裡跟著改），跟 sw.js 一致：'+sw.CACHE);
    const nc=['/data.json','/council/data.json','/data-finance.json','/council/data-president.json','/archive/2026-1.json'],yc=['/index.html','/core/js/store-map.js','/tools/tests/data_test.json','/dept/icons/dept-works.svg'];
    ok(nc.every(u=>sw.NO_CACHE.test(u))&&!yc.some(u=>sw.NO_CACHE.test(u)),'NO_CACHE 排除 data.json、data-部門.json、archive/，不排除其他檔');
    const DEPTS=['president','secretariat','rights','marketing','finance','events','affairs','pr','works'];
    const need=['./','index.html','home.html','core/theme.css','core/js/theme.js','core/js/live.js','core/js/morph.js','core/js/sfx.js','core/js/home.js',...DEPTS.map(d=>`dept/icons/dept-${d}.svg`)];
    const lack=need.filter(u=>!sw.SHELL.includes(u)),gone=sw.SHELL.filter(u=>u!=='./'&&!fs.existsSync(path.join(__dirname,'../..',u)));
    ok(!lack.length&&!gone.length,'安裝清單含網頁與新介面新增的檔、每個都存在：'+(lack.length?'缺 '+lack.join():'')+(gone.length?'不存在 '+gone.join():'')+(lack.length||gone.length?'':sw.SHELL.length+' 個'));
    /* 安裝清單跟網頁同步：index.html、home.html 用 <link rel="stylesheet">／<script src> 載入的每個本地檔都要在 SHELL 裡（只開過主頁就離線時看板才畫得出來） */
    const refs=f=>{const h=fs.readFileSync(path.join(__dirname,'../..',f),'utf8'),o=[];
      for(const m of h.matchAll(/<link\b[^>]*>/g))if(/rel="stylesheet"/.test(m[0])){const u=(m[0].match(/href="([^"]+)"/)||[])[1];if(u)o.push(u)}
      for(const m of h.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g))o.push(m[1]);
      return o.filter(u=>!/^(https?:)?\/\//.test(u)).map(u=>u.split(/[?#]/)[0])};
    const pg=[...new Set([...refs('index.html'),...refs('home.html')])],lack2=pg.filter(u=>!sw.SHELL.includes(u));
    ok(pg.length>=30&&!lack2.length,`安裝清單含 index.html、home.html 載入的每個本地 CSS／JS（${pg.length} 個）`+(lack2.length?'：缺 '+lack2.join():''));
    const ctx=await b.newContext({viewport:{width:1300,height:860}});await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    const p=await ctx.newPage();await p.goto(U+'index.html');
    const want=['core/js/home.js','dept/icons/dept-works.svg','dept/icons/dept-rights.svg','core/js/live.js','core/theme.css'];
    const look=()=>p.evaluate(async([w,cn])=>{if(!(await navigator.serviceWorker.getRegistration()))return null;const c=await caches.open(cn),has=async u=>!!(await c.match(new URL(u,location.href).href,{ignoreSearch:true}));
      const o={miss:[],data:[]};for(const u of w)if(!(await has(u)))o.miss.push(u);for(const u of ['data.json','data-finance.json'])if(await has(u))o.data.push(u);return o},[want,SW_CACHE]).catch(e=>({miss:['?'+e.message],data:[]}));
    let r=null;for(let i=0;i<30;i++){await p.waitForTimeout(300);r=await look();if(r&&!r.miss.length)break}
    await p.evaluate(()=>Promise.all(['data.json','data-finance.json'].map(u=>fetch(u,{cache:'no-cache'}).catch(()=>{}))));await p.waitForTimeout(600);r=await look()||r;
    ok(r&&!r.miss.length&&!r.data.length,'只打開看板：主頁的 home.js、部門標誌已在離線備份，data.json、data-finance.json 不存：'+JSON.stringify(r));
    await ctx.close()}

  /* 10 sw.js（ui-07）：App 打開的是主頁。只開過主頁（沒開過看板）就離線，再點部門：看板要用的 CSS／JS 已在安裝清單裡，看板畫得出來。
     同一個 context 先放 other-cache（同網域其他 repo 的快取）與 board-cache-v1（自己的舊版本）：activate 後只刪自己的舊版本 */
  {const ctx=await b.newContext({viewport:{width:1300,height:860}});await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.goto(U+'docs/');   /* 不註冊 Service Worker 的頁（目錄清單），先建好兩個快取 */
    await p.evaluate(async()=>{await (await caches.open('other-cache')).put('/x-other',new Response('x'));await (await caches.open('board-cache-v1')).put('/x-old',new Response('x'))});
    await p.goto(U+'home.html');
    const st=()=>p.evaluate(async cn=>{const r=await navigator.serviceWorker.getRegistration();if(!r||!r.active||!navigator.serviceWorker.controller)return null;
      const c=await caches.open(cn),n=['core/board.css','core/splash.css','core/js/boot.js','core/js/render.js','core/js/views.js','dept/config.js'];let m=0;for(const u of n)if(await c.match(new URL(u,location.href).href,{ignoreSearch:true}))m++;
      return {keys:await caches.keys(),all:m===n.length}},SW_CACHE).catch(()=>null);
    let r=null;for(let i=0;i<40;i++){await p.waitForTimeout(300);r=await st();if(r&&r.all)break}
    ok(!!r&&r.keys.includes('other-cache')&&!r.keys.includes('board-cache-v1')&&r.keys.includes(SW_CACHE),'activate 只刪自己的舊版本：other-cache 還在、board-cache-v1 刪掉：'+JSON.stringify(r&&r.keys));
    ok(!!r&&r.all,'只開過主頁：看板的 board.css、splash.css、boot.js 等已在離線備份');
    await ctx.setOffline(true);p.errs=[];
    await p.goto(U+'index.html?d=finance').catch(e=>p.errs.push('goto '+e.message));await p.waitForTimeout(3500);
    const bd=await p.evaluate(()=>{const t=document.getElementById('tabbar');return {js:typeof render==='function',tab:!!t,css:t?getComputedStyle(t).position:'',txt:document.body.innerText.trim().length}}).catch(e=>({err:e.message}));
    ok(bd.js&&bd.tab&&bd.css==='fixed'&&bd.txt>0&&!p.errs.length,'離線開部門：看板畫得出來、沒有 pageerror：'+JSON.stringify(bd)+(p.errs.length?' '+p.errs.join(' | '):''));
    await ctx.close()}

  await b.close();console.log(`\n${passes} 通過、${fails} 失敗`);process.exit(fails?1:0)})();
