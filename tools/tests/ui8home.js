/* ui8home：ui-08 主頁組（docs/DESIGN-next.md 第五節「開場」、第六節「主頁」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   A. 開場：暫停全部動畫、逐格（16ms）推進 currentTime：任何一個字只要看得見（透明度 > 0 且在自己的窗裡露出來），它的邊界框就不能跟兩個小人的邊界框重疊；
      每個字第一次露出來時露的是左邊（由左到右揭開，不是先露出一截淡字再往左補）；開始前沒有字露出來。412、811×612、1300×800，淺深色各一次。
      關掉動態：沒有程式動畫、字直接是完成的樣子
   E. 主頁左上學生會標誌：沒有膠囊底（沒有底色、陰影、內距）；十三組主題 × 深淺色：字與右邊小人跟頁面底的對比 ≥ 3、
      淺色左邊小人是黃色實心，深色只留線稿（線寬照畫面像素至少 1px）
   H. 下排個人常用連結（只存這台裝置 localStorage「stustsa-links」）：「+」進入編輯、新增（Enter、「加入」）、名稱空的用網域、只收 http(s)
      （javascript:、data:、mailto:、ftp: 拒絕）、跳脫（名稱含 <img onerror> 不執行）、名稱 30 字、最多 12 個（滿了「+」不出現）、× 移除、
      Esc／點下排以外／返回鍵結束編輯、桌面滑鼠停在連結上浮出名稱膠囊（沒有 title）、手機不浮出、重新整理後保留、壞值不出錯、
      新分頁 noopener noreferrer、圖示先向網站自己要 /favicon.ico（不帶 referrer），網站與 Google 圖示服務都載不到顯示網域第一個字母（Google 後援的細節在 ui9fav）、程式動畫只動 transform／opacity
   I. 下排以整個畫面寬置中：412、811、1300 寬，下排膠囊中心與 innerWidth/2 的差在 0.5px 以內（0、3、12 個連結）；左右安全區不一樣時也一樣
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/',FAV_PORT=+U.match(/:(\d+)\//)[1]+7;   /* 圖示那一段的假外部網路（fakenet.js）用的埠 */
const HOOK=()=>{window.__kp=new Set();const o=Element.prototype.animate;Element.prototype.animate=function(k,t){try{(Array.isArray(k)?k:[k]).forEach(f=>Object.keys(f||{}).forEach(x=>window.__kp.add(x)))}catch(_){}return o.call(this,k,t)}};
const ALLOWED=new Set(['transform','opacity','offset','easing','composite']);
const XSS='<img src=x onerror="window.__xss=1">';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
(async()=>{const b=await chromium.launch();
  const mk=async(w,h,o={})=>{const touch=w<700;const ctx=await b.newContext({viewport:{width:w,height:h},colorScheme:o.scheme||'light',hasTouch:touch,isMobile:touch,serviceWorkers:'block',reducedMotion:o.rm?'reduce':'no-preference'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());   /* 其他外部網址（連結的網站圖示）一律不連 */
    if(o.links!==undefined)await ctx.addInitScript(v=>{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',typeof v==='string'?v:JSON.stringify(v))}},o.links);
    await ctx.addInitScript(HOOK);
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

  /* ---------- E. 主頁左上標誌：沒有膠囊底、十三組主題深淺色都看得清楚 ---------- */
  {const lum=c=>{const m=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*m[0]+.7152*m[1]+.0722*m[2]};
    const con=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const p=await mk(1300,800,{rm:1});await p.goto(U+'home.html');await p.waitForTimeout(600);
    const box=await p.evaluate(()=>{const m=getComputedStyle(document.getElementById('hmMe'));return {bg:m.backgroundColor,sh:m.boxShadow,pl:m.paddingLeft,pr:m.paddingRight}});
    ok(box.bg==='rgba(0, 0, 0, 0)'&&box.sh==='none'&&box.pl==='0px'&&box.pr==='0px',`左上標誌沒有膠囊底（底 ${box.bg}、陰影 ${box.sh}、內距 ${box.pl}/${box.pr}）`);
    const bad=[];
    for(const mode of ['light','dark'])for(const pal of ['fin','b3','ink','sage','mist','fire','pastel','neu','sun','sakura','forest','ocean','wisteria']){
      const r=await p.evaluate(([pal,mode])=>{const h=document.documentElement;h.dataset.pal=pal;h.dataset.theme=mode;
        const bg=getComputedStyle(document.body).backgroundColor,g=s=>getComputedStyle(document.querySelector('#hmMe '+s));
        const y=g('.su-y');return {bg,k:g('.su-k').fill,t:g('.su-t').fill,b:g('.su-b').fill,yf:y.fill,ys:y.stroke,yw:parseFloat(y.strokeWidth),ve:y.vectorEffect}},[pal,mode]);
      const c=Math.min(con(r.k,r.bg),con(r.t,r.bg),con(r.b,r.bg)*2);   /* 標誌色跟主題（--mk-a／b／t）：字與右小人 ≥3；淺色左小人（--mk-a）≥1.4 */
      const yok=mode==='light'?r.yf!=='none'&&con(r.yf,r.bg)>=1.4:r.yf==='none'&&r.ys!=='none'&&con(r.ys,r.bg)>=3&&r.yw>=1&&r.ve==='non-scaling-stroke';
      if(mode==='dark'&&(r.b!==r.k||r.t!==r.k||r.ys!==r.k))bad.push(`${pal}/dark 標誌不是單色（右小人 ${r.b}、字 ${r.t}、左小人線 ${r.ys}、文字色 ${r.k}）`);
      if(c<3||!yok)bad.push(`${pal}/${mode} 對比 ${c.toFixed(2)} 左小人 ${r.yf}/${r.ys}/${r.yw}`)}
    ok(!bad.length,'十三組主題 × 深淺色：字對比 ≥ 3、右邊小人（--mk-b）≥ 1.5；淺色左小人實心（主題主色）、深色整個標誌單色（文字色）、左小人只留線稿且線寬 ≥ 1px（照畫面像素） '+bad.join('；'));
    await p.ctx.close()}

  /* ---------- H. 下排個人常用連結 ---------- */
  const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('stustsa-links')||'null'));
  const dock=p=>p.evaluate(()=>{const d=document.getElementById('hmDk');return {ed:d.classList.contains('ed'),
    links:[...d.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const a=l.querySelector('a');return {href:a.getAttribute('href'),lbl:a.getAttribute('aria-label'),t:a.target,rel:a.rel,ch:l.querySelector('.hm-lkl').textContent,x:!!l.querySelector('.hm-lkx')}}),
    add:!!d.querySelector('.hm-dk-in>.hm-lkadd'),back:!!d.querySelector('.hm-dk-in>.hm-lkb'),form:!!d.querySelector('#hmLkU'),title:document.querySelectorAll('[title]').length}});
  const addLk=async(p,u,n='')=>{await p.fill('#hmLkU',u);await p.fill('#hmLkN',n);await p.press('#hmLkU','Enter');await p.waitForTimeout(150)};
  {const p=await mk(1300,800,{links:[]});await p.goto(U+'home.html');await p.waitForTimeout(3600);
    let d=await dock(p);
    ok(d.add&&!d.ed&&!d.links.length&&!d.form,'沒有連結：下排只有全會行事曆、細線、「+」');
    await p.evaluate(()=>{window.__kp=new Set()});
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(120);
    const bg=await p.evaluate(()=>[...document.querySelectorAll('.hm-dk-bg>span')].map(s=>s.getAnimations().map(a=>a.effect.getKeyframes()[0].transform).join()));
    d=await dock(p);
    ok(d.ed&&d.back&&d.form&&!d.add&&await p.evaluate(()=>document.activeElement.id==='hmLkU'),'按「+」進入編輯：返回鍵、網址、名稱、加入，游標在網址');
    ok(bg.every(t=>/translateX\(-?\d/.test(t)),`寬度改變：底板左右兩半各自用 translateX 滑到新的邊（${bg.join(' | ')}）`);
    const lay=await p.evaluate(()=>{const b=document.querySelector('.hm-lkb').getBoundingClientRect(),u=document.getElementById('hmLkU').getBoundingClientRect(),n=document.getElementById('hmLkN').getBoundingClientRect();return b.right<=u.left&&u.right<=n.left});
    ok(lay,'返回鍵在輸入框左邊、名稱在網址右邊');
    await addLk(p,'example.com','測試');d=await dock(p);
    ok(d.links.length===1&&d.links[0].href==='https://example.com/'&&d.links[0].lbl==='測試'&&d.ed&&d.form,`Enter＝加入（沒寫協定補 https），留在編輯中（${JSON.stringify(d.links[0])}）`);
    ok(await p.evaluate(()=>document.getElementById('hmLkU').value===''&&document.getElementById('hmLkN').value===''&&document.activeElement.id==='hmLkU'),'加入後輸入框清空、游標回到網址');
    await addLk(p,'https://www.foo.example/a/b?c=1','');d=await dock(p);
    ok(d.links[1]&&d.links[1].lbl==='foo.example'&&d.links[1].ch==='F',`名稱空的用網域（${d.links[1]&&d.links[1].lbl}，字母 ${d.links[1]&&d.links[1].ch}）`);
    await p.fill('#hmLkU','http://plain.example');await p.click('.hm-lkok');await p.waitForTimeout(150);d=await dock(p);
    ok(d.links.length===3&&d.links[2].href==='http://plain.example/','「加入」鈕也能加；http 也收');
    for(const bad of ['javascript:alert(1)','JavaScript:alert(document.cookie)','data:text/html,<script>alert(1)</script>','mailto:a@b.c','ftp://x.example/','vbscript:x','https://user:pw@x.example/','   ']){
      await addLk(p,bad,'壞');const r=await p.evaluate(()=>({n:document.querySelectorAll('.hm-dk-in>.hm-lk').length,inv:document.getElementById('hmLkU').getAttribute('aria-invalid')}));
      ok(r.n===3&&r.inv==='true',`拒絕「${bad}」：沒有加入、輸入框標成錯誤`)}
    await p.fill('#hmLkU','');
    await addLk(p,'x.example',XSS);d=await dock(p);
    const xs=await p.evaluate(()=>({xss:window.__xss,imgs:[...document.querySelectorAll('#hmDk img')].every(i=>i.classList.contains('hm-lki')),lbl:[...document.querySelectorAll('.hm-dk-in>.hm-lk a')].pop().getAttribute('aria-label')}));
    ok(!xs.xss&&xs.imgs&&xs.lbl===XSS.slice(0,30),'名稱含 <img onerror>：照字面顯示（截到 30 字）、沒有執行（下排只有網站圖示的 img）');
    await addLk(p,'long.example','一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十多出來的字');
    let s1=await st(p);ok(s1&&s1.length===5&&[...s1[4].n].length===30&&s1[4].n.endsWith('九十'),`名稱最長 30 字（存了 ${s1&&[...s1[4].n].length} 字）`);
    ok(s1&&s1[0].u==='https://example.com/'&&s1[0].n==='測試'&&s1[1].n==='','存在這台裝置的 localStorage「stustsa-links」＝[{u,n}]');
    /* × 移除 */
    await p.click('.hm-dk-in>.hm-lk:nth-of-type(2) .hm-lkx');await p.waitForTimeout(80);
    const gh=await p.evaluate(()=>document.querySelectorAll('#hmDk>.hm-lk').length);await p.waitForTimeout(500);
    d=await dock(p);s1=await st(p);
    ok(d.links.length===4&&!d.links.some(l=>l.lbl==='foo.example')&&s1.length===4&&gh===1&&await p.evaluate(()=>!document.querySelector('#hmDk>.hm-lk')),`× 移除：拿掉那一個、存起來，留分身淡出後拿掉（分身 ${gh}）`);
    ok(d.links.every(l=>l.x),'編輯中每個連結右上角有 ×');
    ok(await p.evaluate(()=>getComputedStyle(document.querySelector('.hm-lkc')).pointerEvents==='none'),'編輯中點連結不會打開');
    ok(await p.evaluate(()=>{const x=getComputedStyle(document.querySelector('.hm-lkx'));return x.backgroundColor===getComputedStyle(document.documentElement).getPropertyValue('--late').trim()||x.backgroundColor!=='rgba(0, 0, 0, 0)'}),'× 是紅色圓鈕');
    /* 結束編輯：Esc、點下排以外、返回鍵（注音選字中的 Esc 交給輸入法，不結束） */
    await p.focus('#hmLkU');await p.evaluate(()=>document.getElementById('hmLkU').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})));await p.waitForTimeout(150);d=await dock(p);
    ok(d.ed&&d.form,'選字中按 Esc：不結束編輯');
    await p.keyboard.press('Escape');await p.waitForTimeout(150);d=await dock(p);
    ok(!d.ed&&d.add&&!d.form&&d.links.every(l=>!l.x),'Esc＝結束編輯（「+」回來、× 收掉）');
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(100);await p.mouse.click(650,40);await p.waitForTimeout(150);d=await dock(p);
    ok(!d.ed&&p.url().endsWith('home.html'),'點下排以外＝結束編輯');
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(100);await p.fill('#hmLkU','drop.example');await p.click('.hm-lkb');await p.waitForTimeout(150);d=await dock(p);
    ok(!d.ed&&d.links.length===4,'返回鍵＝結束編輯（沒按 Enter 的不加）');
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(100);d=await dock(p);
    ok(await p.evaluate(()=>document.getElementById('hmLkU').value===''),'再進編輯時輸入框是空的');
    await p.keyboard.press('Escape');await p.waitForTimeout(600);
    ok(d.links.every(l=>l.t==='_blank'&&l.rel==='noopener noreferrer'),'連結開新分頁、rel="noopener noreferrer"');
    /* 桌面：滑鼠停在連結上浮出名稱膠囊 */
    await p.hover('.hm-dk-in>.hm-lk:nth-of-type(1) .hm-lkc');await p.waitForTimeout(260);
    let tp=await p.evaluate(()=>{const t=document.getElementById('hmTip'),a=document.querySelector('.hm-dk-in>.hm-lk:nth-of-type(1) .hm-lkc').getBoundingClientRect();if(!t)return null;const r=t.getBoundingClientRect(),cs=getComputedStyle(t);
      return {txt:t.textContent,op:+cs.opacity,dur:cs.transitionDuration,prop:cs.transitionProperty,above:r.bottom<=a.top+.5,cx:Math.abs((r.left+r.width/2)-(a.left+a.width/2)),bg:cs.backgroundColor,ink:getComputedStyle(document.body).color,r:cs.borderRadius}});
    ok(tp&&tp.txt==='測試'&&tp.op===1&&tp.above&&tp.cx<1,`桌面滑鼠停在連結上：圖示上方置中浮出名稱膠囊（${tp&&tp.txt}）`);
    ok(tp&&tp.prop==='opacity'&&tp.dur==='0.16s'&&tp.bg===tp.ink,`名稱膠囊淡入 fast 160ms、只動 opacity、底色跟著主題（--ink）（${tp&&tp.dur} ${tp&&tp.bg}）`);
    await p.hover('.hm-dk-in>.hm-lk:last-of-type .hm-lkc');await p.waitForTimeout(260);
    tp=await p.evaluate(()=>document.getElementById('hmTip').textContent);
    ok(tp==='一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十','換到另一個連結：膠囊換成那一個的名稱');
    await p.mouse.move(650,200);await p.waitForTimeout(260);
    ok(await p.evaluate(()=>+getComputedStyle(document.getElementById('hmTip')).opacity===0),'移開：膠囊淡出');
    d=await dock(p);ok(d.title===0,'沒有 title 屬性（名稱靠自製膠囊與 aria-label）');
    const kp=await p.evaluate(()=>[...window.__kp]);ok(kp.every(k=>ALLOWED.has(k)),'下排的程式動畫只動 transform／opacity：'+kp.join());
    /* 重新整理後保留 */
    const before=JSON.stringify((await dock(p)).links.map(l=>[l.href,l.lbl]));await p.reload();await p.waitForTimeout(800);
    ok(JSON.stringify((await dock(p)).links.map(l=>[l.href,l.lbl]))===before,'重新整理後連結都還在、順序不變');
    /* 圖示：網站與 Google 圖示服務都載不到（這裡外部網路都擋掉；Playwright 攔截時 /favicon.ico 也一律中止）顯示網域第一個字母 */
    const fv=await p.evaluate(()=>[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>({k:l.classList.contains('fav'),ch:getComputedStyle(l.querySelector('.hm-lkl')).display})));
    ok(fv.every(f=>!f.k&&f.ch!=='none'),'圖示載不到：顯示網域第一個字母');
    /* 別的分頁在這一頁編輯中改了清單（直接改 localStorage；編輯中這一頁不跟著換畫面）：這一頁再加、刪時先讀回最新的，不用舊清單整份蓋掉 */
    {const add=(u,n)=>p.evaluate(([u,n])=>{const a=JSON.parse(localStorage.getItem('stustsa-links'));a.push({u,n});localStorage.setItem('stustsa-links',JSON.stringify(a))},[u,n]);
      await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(150);
      await add('https://other.example/','別頁');
      await addLk(p,'mine.example','這頁');let s2=await st(p);d=await dock(p);
      ok(s2.some(x=>x.n==='別頁')&&s2.some(x=>x.n==='這頁')&&d.links.some(l=>l.lbl==='別頁')&&d.links.some(l=>l.lbl==='這頁'),`編輯中別的分頁加了一個，這一頁再加：兩個都留著（存的 ${s2.map(x=>x.n||'·').join('、')}）`);
      await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('stustsa-links')).filter(x=>x.n!=='別頁');localStorage.setItem('stustsa-links',JSON.stringify(a))});
      await add('https://third.example/','第三');
      await p.click('.hm-dk-in>.hm-lk[data-nm="這頁"] .hm-lkx');await p.waitForTimeout(600);s2=await st(p);d=await dock(p);
      ok(!s2.some(x=>x.n==='這頁'||x.n==='別頁')&&s2.some(x=>x.n==='第三')&&!d.links.some(l=>l.lbl==='別頁')&&d.links.some(l=>l.lbl==='第三'),`編輯中別的分頁刪一個、加一個，這一頁再刪：照最新的清單刪（存的 ${s2.map(x=>x.n||'·').join('、')}）`);
      await p.keyboard.press('Escape');await p.waitForTimeout(300);
      await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('stustsa-links')).filter(x=>x.n!=='第三');localStorage.setItem('stustsa-links',JSON.stringify(a));dispatchEvent(new StorageEvent('storage',{key:'stustsa-links'}))});
      await p.waitForTimeout(200);d=await dock(p);
      ok(!d.links.some(l=>l.lbl==='第三')&&d.links.length===(await st(p)).length,'沒在編輯時收到別的分頁的修改：畫面跟著換')}
    ok(!p.errs.length,'桌面連結沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}
  {/* 圖示載得到：Playwright 只要開了攔截（route），/favicon.ico 一律載入失敗，所以這一段不用 route，改用 fakenet.js——另開一個瀏覽器，
     127.0.0.1 以外的網域都指到測試自己開的 https 小伺服器、拿掉 proxy，不會真的連出去（Google Fonts、Google 圖示服務都到不了外面），預期外的外部請求讓測試失敗。
     連結用一般網域 ico.example（內網、本機網域本來就不要圖示）；「載不到＝首字母」與 Google 後援的細節在 ui9fav */
    const zlib=require('zlib'),fakeNet=require('./fakenet.js');
    const png=(()=>{const crc=b=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0};
      const ch=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
      const ih=Buffer.alloc(13);ih.writeUInt32BE(16,0);ih.writeUInt32BE(16,4);ih[8]=8;ih[9]=2;const raw=Buffer.alloc(16*49);for(let y=0;y<16;y++)for(let x=0;x<16;x++){raw[y*49+1+x*3]=10;raw[y*49+2+x*3]=91;raw[y*49+3+x*3]=170}
      return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])})();
    const seen=[];const net=await fakeNet(FAV_PORT,(q,r,{host,ref})=>{if(host!=='ico.example')return false;seen.push({u:q.url,ref});
      if(q.url==='/favicon.ico'){r.writeHead(200,{'Content-Type':'image/png'});r.end(png)}else{r.writeHead(404);r.end()}return true},/^ico\.example$/);
    const b2=await chromium.launch(net.launch),ctx=await b2.newContext({viewport:{width:1300,height:800},serviceWorkers:'block',reducedMotion:'reduce',ignoreHTTPSErrors:true});
    await ctx.addInitScript(v=>{if(!sessionStorage.getItem('__lk')){sessionStorage.setItem('__lk','1');localStorage.setItem('stustsa-links',JSON.stringify(v))}},[{u:'https://ico.example/some/page',n:'有圖示'}]);
    const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(U+'home.html',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);
    const r=await p.evaluate(()=>[...document.querySelectorAll('.hm-dk-in>.hm-lk')].map(l=>{const i=l.querySelector('img');return {ico:l.classList.contains('fav'),src:i&&i.getAttribute('src'),rp:i&&i.referrerPolicy,ch:getComputedStyle(l.querySelector('.hm-lkl')).display,ltr:l.querySelector('.hm-lkl').textContent}}));
    ok(r[0].ico&&r[0].src==='https://ico.example/favicon.ico'&&r[0].rp==='no-referrer'&&r[0].ch==='none',`圖示：先向網站自己要 /favicon.ico（${r[0].src}）、不帶 referrer，載到就換掉字母`);
    ok(seen.length===1&&seen[0].u==='/favicon.ico'&&!seen[0].ref,`網站只收到 /favicon.ico 一個請求、沒有 Referer（${JSON.stringify(seen)}）`);
    ok(!net.extra.length,`圖示那段沒有預期外的外部請求（${net.extra.join('、')||'無'}）`);
    ok(!errs.length,'圖示那段沒有錯誤 '+errs.join(' | '));
    await b2.close();net.close()}
  {/* 12 個上限 */
    const p=await mk(1300,800,{links:Array.from({length:11},(_,i)=>({u:`https://s${i}.example/`,n:`站${i}`}))});await p.goto(U+'home.html');await p.waitForTimeout(3600);
    await p.click('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(100);await addLk(p,'last.example','第十二');await p.waitForTimeout(500);
    let d=await dock(p);
    ok(d.links.length===12&&!d.form&&d.back&&d.ed,'加到 12 個：輸入框收掉、只剩返回鍵（還能按 × 移除）');
    await p.keyboard.press('Escape');await p.waitForTimeout(300);d=await dock(p);
    ok(!d.add&&d.links.length===12,'滿 12 個：「+」不出現');
    /* 下排放不下（可以橫捲）時，滾輪在下排上不換部門焦點、不擋下排自己捲 */
    await p.setViewportSize({width:700,height:800});await p.waitForTimeout(400);
    const wh=await p.evaluate(()=>{const i=document.getElementById('hmDkIn');return {sc:i.classList.contains('sc'),r:i.getBoundingClientRect().toJSON()}});
    if(wh.sc){const f0=await p.evaluate(()=>document.querySelector('.hm-tile.on').dataset.i);
      await p.evaluate(()=>{window.__wp=null;document.getElementById('hmDkIn').addEventListener('wheel',e=>{setTimeout(()=>{window.__wp=e.defaultPrevented})},{once:true})});
      await p.mouse.move(wh.r.x+wh.r.width/2,wh.r.y+wh.r.height/2);await p.mouse.wheel(0,120);await p.waitForTimeout(400);
      const r=await p.evaluate(()=>({f:document.querySelector('.hm-tile.on').dataset.i,wp:window.__wp}));
      ok(r.f===f0&&r.wp===false,`滾輪在可橫捲的下排上：部門焦點不換（${f0}→${r.f}）、不擋預設捲動（defaultPrevented ${r.wp}）`);
    }else ok(false,'700 寬、12 個連結時下排應該放不下（.sc）');
    await p.ctx.close();
    const q=await mk(1300,800,{links:Array.from({length:15},(_,i)=>({u:`https://t${i}.example/`,n:''}))});await q.goto(U+'home.html');await q.waitForTimeout(800);
    d=await dock(q);ok(d.links.length===12&&!d.add,`存了超過 12 個（被別的程式改過）：只顯示前 12 個（${d.links.length}）`);
    await q.ctx.close()}
  {/* localStorage 壞值：不出錯，當成沒有／只留合法的 */
    for(const v of ['{壞掉的 JSON','null','{"u":"https://x.example"}','"字串"',JSON.stringify([1,'x',null,{u:'javascript:alert(1)',n:'j'},{u:'data:text/html,x'},{u:'https://ok.example',n:5},{u:'https://ok2.example',n:'一'.repeat(40)},{n:'沒有網址'}])]){
      const p=await mk(1300,800,{links:v,rm:1});await p.goto(U+'home.html');await p.waitForTimeout(700);const d=await dock(p);
      const okv=v.startsWith('[')?d.links.length===2&&d.links[0].lbl==='ok.example'&&[...d.links[1].lbl].length===30:d.links.length===0;
      ok(okv&&d.add&&!p.errs.length,`壞值 ${v.slice(0,40)}…：沒有錯誤，${v.startsWith('[')?'只留合法的兩個（名稱不是字串＝用網域、太長截到 30）':'當成沒有連結'}`);
      await p.ctx.close()}}
  {/* 手機：不浮出名稱膠囊；編輯中放不下時下排自己橫捲、整頁不橫捲；不動 height */
    const p=await mk(412,860,{links:Array.from({length:6},(_,i)=>({u:`https://m${i}.example/`,n:`手機${i}`}))});await p.goto(U+'home.html');await p.waitForTimeout(3600);
    await p.evaluate(()=>{window.__kp=new Set()});
    await p.hover('.hm-dk-in>.hm-lk .hm-lkc').catch(()=>{});await p.waitForTimeout(260);
    ok(await p.evaluate(()=>{const t=document.getElementById('hmTip');return !t||getComputedStyle(t).display==='none'||+getComputedStyle(t).opacity===0}),'手機（沒有 hover）：不浮出名稱膠囊');
    await p.tap('.hm-dk-in>.hm-lkadd');await p.waitForTimeout(700);
    const r=await p.evaluate(()=>{const i=document.getElementById('hmDkIn'),u=document.getElementById('hmLkU').getBoundingClientRect(),k=document.querySelector('.hm-lkb').getBoundingClientRect(),c=i.getBoundingClientRect();return {sc:i.classList.contains('sc'),ov:getComputedStyle(i).overflowX,sw:document.documentElement.scrollWidth,vis:k.left>=c.left&&u.left>k.left&&u.right<=c.right,fs:getComputedStyle(document.getElementById('hmLkU')).fontSize}});
    ok(r.sc&&r.ov==='auto'&&r.sw<=412&&r.vis,`手機編輯中放不下：下排自己橫捲、捲到返回鍵與輸入框都看得到、整頁不橫捲（${r.ov} ${r.sw}）`);
    ok(r.fs==='16px','手機輸入框 16px（iPhone 聚焦時不放大整頁）');
    await addLk(p,'phone.example','');await p.waitForTimeout(600);
    const kp=await p.evaluate(()=>[...window.__kp]);ok(kp.every(k=>ALLOWED.has(k)),'手機下排動畫只動 transform／opacity（不動 height、width）：'+kp.join());
    await p.tap('.hm-wc.on',{position:{x:30,y:30}}).catch(()=>{});await p.waitForTimeout(200);
    ok(await p.evaluate(()=>!document.getElementById('hmDk').classList.contains('ed')),'手機點下排以外＝結束編輯');
    ok(!p.errs.length,'手機沒有錯誤 '+p.errs.join(' | '));
    await p.ctx.close()}

  /* ---------- I. 下排以整個畫面寬置中 ---------- */
  for(const n of [0,3,12])for(const [w,h] of [[412,860],[811,612],[1300,800]]){
    const p=await mk(w,h,{rm:1,links:Array.from({length:n},(_,i)=>({u:`https://s${i}.example/`,n:''}))});
    await p.goto(U+'home.html');await p.waitForTimeout(700);
    const r=await p.evaluate(()=>{const d=document.getElementById('hmDk').getBoundingClientRect();return {c:d.left+d.width/2,iw:innerWidth,links:document.querySelectorAll('#hmDk .hm-lk').length,sw:document.documentElement.scrollWidth}});
    ok(Math.abs(r.c-r.iw/2)<=.5&&r.links===n&&r.sw<=r.iw,`${w} 寬、${n} 個連結：下排中心 ${r.c.toFixed(2)}，畫面中心 ${r.iw/2}（差 ${Math.abs(r.c-r.iw/2).toFixed(2)}）；沒有橫捲`);
    await p.ctx.close()}
  {/* 左右安全區不一樣（橫拿的 iPhone）：用 .hm 的內距變數模擬 */
    const p=await mk(1300,800,{rm:1});await p.goto(U+'home.html');await p.waitForTimeout(600);
    const r=await p.evaluate(()=>{const h=document.getElementById('hm');h.style.setProperty('--hm-pl','90px');h.style.setProperty('--hm-pr','20px');const d=document.getElementById('hmDk').getBoundingClientRect();return {c:d.left+d.width/2,iw:innerWidth}});
    ok(Math.abs(r.c-r.iw/2)<=.5,`左右內距不一樣（90／20）時下排仍在畫面正中間（${r.c.toFixed(2)}）`);
    await p.ctx.close()}

  await b.close();
  console.log(`\n${fails?'有失敗':'全部通過'}：OK ${passes}／FAIL ${fails}`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
