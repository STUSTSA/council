/* ui8center：ui-08 D 圓鈕、膠囊鈕的視覺置中（前後端交接-next 第九節「按鈕做視覺置中校正」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   自動找畫面上所有圓鈕與膠囊鈕（button／a／role=button／.tab／.tb-gear，圓角 ≥ 短邊一半、看得見、在最上層），量「實際圖形」的中心：
   整頁截圖兩次（deviceScaleFactor 3），第二次把這些按鈕裡的內容藏起來（文字透明、svg／img 隱藏；按鈕本身的底、框、陰影先釘成算好的值），
   兩張相減，差異超過該鈕最大差異 30% 的像素取邊界框；第三張把按鈕底色換成洋紅、拿掉陰影與框，取按鈕「畫出來的形狀」的邊界框
   （瀏覽器會把底色與圖示各自對齊到整數像素，所以對照畫出來的形狀，不是排版的小數座標）；兩個邊界框中心的差＝偏移。
   - 只有圖示（沒有文字，或只有 ×／＋／− 這類單一符號）：左右、上下都要在 0.5px 以內。
   - 圖示＋文字的膠囊鈕：整組（圖示＋文字）的左右中心在 0.5px 以內；上下只列出不判定（文字的墨跡上下不對稱，跟字型有關，測試環境沒有載入網路字型）。
   畫面：主頁（下排、設定鈕、常用連結編輯）、全會行事曆層、外觀層、部門標題列、搜尋列、工具列、新增圓鈕、即時回報卡片（含編輯中工具列）、
   通知頁（含行事曆）、今日層、設定（手機子頁）、對話框（數字上下按鈕）。412（觸控）與 1300（滑鼠），淺色與深色。
   環境變數 LIST=1 印出每一顆的偏移（修正前後對照用）。失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');const fs=require('fs');
const U='http://127.0.0.1:8300/';
const TOL=0.5;
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const remote0=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
const W=ms=>new Promise(r=>setTimeout(r,ms));

/* 頁面裡：找候選、藏內容、還原 */
const PAGE_LIB=()=>{
  const st=document.createElement('style');st.id='__u8cs';
  st.textContent=`.__u8f,.__u8f *,.__u8f *::before,.__u8f *::after{transition:none!important}
  .ico *{animation:none!important}
  .__u8h,.__u8h *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}
  .__u8h svg,.__u8h img{visibility:hidden!important}`;
  window.__u8={
    list(){
      document.documentElement.classList.add('__u8f');if(!document.getElementById('__u8cs'))document.head.appendChild(st);
      document.querySelectorAll('.ico-on').forEach(x=>x.classList.remove('ico-on','ico-once'));
      const out=[],els=[...document.querySelectorAll('button,a[href],[role=button],.tab,.tb-gear'+(innerWidth<900?',.tab-ind':''))];   /* 手機工具列：圖示對鏡片那一格（.tab-ind）置中 */
      const visible=el=>{for(let e=el;e&&e.nodeType===1;e=e.parentElement){const c=getComputedStyle(e);if(c.display==='none'||(+c.opacity)<0.99)return false;if(e===el&&c.visibility!=='visible')return false}return true};
      for(const el of els){
        if(el.closest('[hidden],[inert],[aria-hidden="true"]'))continue;
        const r=el.getBoundingClientRect();if(r.width<14||r.height<14)continue;
        if(r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)continue;
        const cs=getComputedStyle(el);const rad=cs.borderTopLeftRadius.endsWith('%')?parseFloat(cs.borderTopLeftRadius)/100*Math.min(r.width,r.height):parseFloat(cs.borderTopLeftRadius);
        if(!(rad>=Math.min(r.width,r.height)/2-1)&&!el.matches('.tab,.tb-gear'))continue;
        if(!visible(el))continue;
        const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!hit||!(el===hit||el.contains(hit)))continue;
        /* 看得見的字（藏起來、透明、被裁掉的不算） */
        const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let txt='';
        for(let n;(n=tw.nextNode());){const t=n.nodeValue.replace(/\s+/g,'');if(!t)continue;const rg=document.createRange();rg.selectNodeContents(n);const q=rg.getBoundingClientRect();
          if(q.width<=1||q.height<=1||q.right<=r.left||q.left>=r.right||q.bottom<=r.top||q.top>=r.bottom)continue;
          let vis=true;for(let e=n.parentElement;e&&e!==el.parentElement;e=e.parentElement){const c=getComputedStyle(e);if((+c.opacity)<0.05||c.visibility!=='visible'||c.clipPath!=='none'||c.color==='rgba(0, 0, 0, 0)'||parseFloat(c.fontSize)<1){vis=false;break}}
          if(vis)txt+=t}
        const hasIco=!!el.querySelector('svg,img');
        if(el.matches('.tab')&&innerWidth<900&&!txt)continue;   /* 手機沒選到的分頁只量 .tab-ind */
        let kind=null;if((txt===''&&hasIco)||/^[×＋+−–\-]$/.test(txt))kind='icon';else if(hasIco&&txt)kind='text';
        if(!kind)continue;
        const name=(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].filter(c=>!/^(ico-|__u8|on$|sel$|in$)/.test(c)).join('.'))+(el.getAttribute('aria-label')?'「'+el.getAttribute('aria-label')+'」':txt?'「'+txt.slice(0,8)+'」':'');
        out.push({el,name,kind,r:{x:r.left,y:r.top,w:r.width,h:r.height}});
      }
      /* 外層候選的量測範圍要扣掉裡面的候選 */
      const seen={};for(const o of out){seen[o.name]=(seen[o.name]||0)+1;if(seen[o.name]>1)o.name+='#'+seen[o.name]}
      window.__u8c=out;
      /* 角落的小紅點、數字徽章（絕對定位、裡面沒有圖示）不算圖形 */
      const badge=o=>[...o.el.querySelectorAll('*')].filter(e=>{const c=getComputedStyle(e);return (c.position==='absolute'||c.position==='fixed')&&!e.querySelector('svg')&&e.tagName.toLowerCase()!=='svg'&&!e.closest('svg')}).map(e=>{const q=e.getBoundingClientRect();return {x:q.left-3,y:q.top-3,w:q.width+6,h:q.height+6}});
      return out.map((o,i)=>({i,name:o.name,kind:o.kind,r:o.r,inner:out.filter(p=>p!==o&&o.el.contains(p.el)&&!p.el.matches('.tab-ind')).map(p=>p.r).concat(badge(o))}));
    },
    hide(){for(const o of window.__u8c){const el=o.el,c=getComputedStyle(el);o.prev=el.getAttribute('style');
      for(const k of ['border-top-color','border-right-color','border-bottom-color','border-left-color','outline-color','background-color','box-shadow'])el.style.setProperty(k,c.getPropertyValue(k),'important');
      el.classList.add('__u8h')}},
    /* 量按鈕本身畫出來的形狀（瀏覽器會把底色與圖示都對齊到整數像素，所以對照的是畫出來的形狀，不是排版的小數座標）：
       內容照樣藏著，底色換成洋紅（套在別的候選裡面的換成青色），拿掉陰影與框 */
    paint(){for(const o of window.__u8c){if(o.el.matches('.tab'))continue;   /* 工具列的格子被整條的圓角裁掉，對照排版的格子中心（鏡片也是同一個中心） */
      const el=o.el,d=window.__u8c.some(p=>p!==o&&p.el.contains(el));o.col=d?[0,255,255]:[255,0,255];
      el.style.setProperty('background',d?'#0ff':'#f0f','important');el.style.setProperty('box-shadow','none','important');el.style.setProperty('border-color','transparent','important');el.style.setProperty('outline','none','important')}
      return window.__u8c.map(o=>o.col||null)},
    show(){for(const o of window.__u8c){const el=o.el;el.classList.remove('__u8h');if(o.prev==null)el.removeAttribute('style');else el.setAttribute('style',o.prev)}},
    done(){document.documentElement.classList.remove('__u8f')}
  };
};

/* 計算頁：兩張 PNG 相減，每顆按鈕取差異的邊界框中心 */
const CALC=async(calc,a,b,c3,cands,dpr)=>calc.evaluate(async([a,b,c3,cands,dpr])=>{
  const load=s=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('圖片解碼失敗 '+s.length));im.src='data:image/png;base64,'+s});
  const [ia,ib,ic]=await Promise.all([load(a),load(b),load(c3)]);const w=ia.width,h=ia.height;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d',{willReadFrequently:true});
  g.drawImage(ia,0,0);const da=g.getImageData(0,0,w,h).data;g.clearRect(0,0,w,h);g.drawImage(ib,0,0);const db=g.getImageData(0,0,w,h).data;g.clearRect(0,0,w,h);g.drawImage(ic,0,0);const dc=g.getImageData(0,0,w,h).data;
  return cands.map(c=>{const x0=Math.max(0,Math.floor(c.r.x*dpr)),y0=Math.max(0,Math.floor(c.r.y*dpr)),x1=Math.min(w,Math.ceil((c.r.x+c.r.w)*dpr)),y1=Math.min(h,Math.ceil((c.r.y+c.r.h)*dpr));
    const inner=(x,y)=>c.inner.some(q=>x>=q.x*dpr&&x<(q.x+q.w)*dpr&&y>=q.y*dpr&&y<(q.y+q.h)*dpr);
    let mx=0;const D=new Float32Array((x1-x0)*(y1-y0));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(inner(x,y))continue;const k=(y*w+x)*4;const d=Math.max(Math.abs(da[k]-db[k]),Math.abs(da[k+1]-db[k+1]),Math.abs(da[k+2]-db[k+2]));D[(y-y0)*(x1-x0)+(x-x0)]=d;if(d>mx)mx=d}
    if(mx<24)return {...c,none:true};
    const th=mx*0.3;let bx0=1e9,by0=1e9,bx1=-1,by1=-1;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(D[(y-y0)*(x1-x0)+(x-x0)]>th){if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y}}
    const cx=(bx0+bx1+1)/2/dpr,cy=(by0+by1+1)/2/dpr;
    /* 按鈕畫出來的形狀：第三張裡接近這顆的代表色（洋紅或青色）的像素（多看 2px，形狀可能被對齊到外面） */
    let sx0=1e9,sy0=1e9,sx1=-1,sy1=-1;const X0=Math.max(0,x0-2*dpr),Y0=Math.max(0,y0-2*dpr),X1=Math.min(w,x1+2*dpr),Y1=Math.min(h,y1+2*dpr);
    if(c.col)for(let y=Y0;y<Y1;y++)for(let x=X0;x<X1;x++){const k=(y*w+x)*4;if(Math.abs(dc[k]-c.col[0])<100&&Math.abs(dc[k+1]-c.col[1])<100&&Math.abs(dc[k+2]-c.col[2])<100){if(x<sx0)sx0=x;if(x>sx1)sx1=x;if(y<sy0)sy0=y;if(y>sy1)sy1=y}}
    const ok=sx1>=0,scx=ok?(sx0+sx1+1)/2/dpr:c.r.x+c.r.w/2,scy=ok?(sy0+sy1+1)/2/dpr:c.r.y+c.r.h/2;
    return {...c,dx:+(cx-scx).toFixed(2),dy:+(cy-scy).toFixed(2),iw:+((bx1+1-bx0)/dpr).toFixed(1),ih:+((by1+1-by0)/dpr).toFixed(1)}});
},[a,b,c3,cands,dpr]);

(async()=>{const b=await chromium.launch();const DPR=3;
  const calc=await (await b.newContext()).newPage();
  const all=new Map();   /* 名稱 → 每個情境的偏移 */
  const mk=async(w,h,scheme)=>{const touch=w<700;let remote=JSON.parse(JSON.stringify(remote0)),sha='s0';
    const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:DPR,colorScheme:scheme,hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://api.github.com/**',async r=>{const q=r.request(),u=q.url();if(u.includes('/commits?'))return r.fulfill({status:200,contentType:'application/json',body:'[]'});
      if(q.method()==='GET'){if(!u.includes('data.json'))return r.fulfill({status:404,body:'{}'});if(/raw/.test(q.headers().accept||''))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remote)});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sha,content:Buffer.from(JSON.stringify(remote)).toString('base64')})})}
      const bd=JSON.parse(q.postData());if(u.includes('data.json'))remote=JSON.parse(Buffer.from(bd.content,'base64').toString());sha='s'+Date.now();return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:{sha}})})});
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!api\.github\.com)(?!fonts\.googleapis\.com)/,r=>r.abort());
    await ctx.addInitScript(PAGE_LIB);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));return p};
  const measure=async(p,screen,tag)=>{await p.mouse.move(1,1).catch(()=>{});await W(150);
    const cands=await p.evaluate(()=>__u8.list());if(!cands.length)return [];
    const a=(await p.screenshot()).toString('base64');await p.evaluate(()=>__u8.hide());await W(60);
    const bb=(await p.screenshot()).toString('base64');const cols=await p.evaluate(()=>__u8.paint());await W(60);
    const cc=(await p.screenshot()).toString('base64');await p.evaluate(()=>{__u8.show();__u8.done()});
    cands.forEach((c,i)=>c.col=cols[i]);
    const res=await CALC(calc,a,bb,cc,cands,DPR);
    for(const r of res){if(r.none)continue;const key=screen+' '+r.name;if(!all.has(key))all.set(key,{kind:r.kind,v:{}});all.get(key).v[tag]=r}
    return res};
  const login=async p=>{await p.evaluate(()=>localStorage.setItem('workboard:ghtoken','T'));await p.click('#setBtn');await W(800);await p.click('#setOv .set-gate .primary');await W(400);
    await p.fill('#dlgForm input[name=pw]','0000').catch(()=>{});await p.click('#dlgForm [data-act=ok]').catch(()=>{});await W(500);
    await p.fill('#dlgForm input[name=name]','王').catch(()=>{});await p.fill('#dlgForm input[name=p1]','password-long-1').catch(()=>{});await p.fill('#dlgForm input[name=p2]','password-long-1').catch(()=>{});await p.click('#dlgForm [data-act=ok]').catch(()=>{});await W(1500);
    for(let i=0;i<4;i++){await W(500);const t=await p.$eval('#dlg[open] #dlgForm>b',b=>b.textContent).catch(()=>'');if(/共用密碼太短|沒有連上雲端/.test(t))await p.click('#dlgForm [data-act=cancel]').catch(()=>{})}
    await p.evaluate(()=>{if(setOpen)closeSettings(true)});await W(500)};
  const tap=async(p,sel)=>{const el=await p.$(sel);if(!el)return false;await el.click().catch(()=>{});return true};

  for(const [w,h] of [[412,860],[1300,820]])for(const scheme of ['light','dark']){
    const tag=`${w} ${scheme==='light'?'淺':'深'}`;
    /* ---- 主頁 ---- */
    {const p=await mk(w,h,scheme);await p.addInitScript(()=>{try{localStorage.setItem('stustsa-links',JSON.stringify([{u:'https://example.com/',n:'範例'},{u:'https://example.org/',n:''}]))}catch(_){}});
      await p.goto(U+'home.html');await W(4200);
      await measure(p,'主頁',tag);
      if(await tap(p,'.hm-lkadd')){await W(900);await measure(p,'主頁連結編輯',tag);await p.keyboard.press('Escape');await W(700)}
      if(await tap(p,'#hmPub')){await W(1400);await measure(p,'全會行事曆層',tag);await tap(p,'.hm-ly-x');await W(1000)}
      if(await tap(p,'#hmSet')){await W(1400);await measure(p,'外觀層',tag);await tap(p,'.hm-ly-x');await W(900)}
      ok(!p.errs.length,`${tag} 主頁沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
    /* ---- 部門 ---- */
    {const p=await mk(w,h,scheme);await p.goto(U+'index.html');await W(2200);await login(p);
      await measure(p,'部門',tag);
      if(await tap(p,'#dSearch input,.dsearch input')){await p.keyboard.type('會');await W(700);await measure(p,'搜尋中',tag);await tap(p,'#dSearch .ds-x');await W(500)}
      await p.evaluate(()=>{const c=document.querySelector('#events .cp');c&&c.click()});await W(1300);
      await measure(p,'即時回報卡片',tag);
      await p.click('#evDetail .lc-title').catch(()=>{});await W(900);
      await measure(p,'即時回報卡片編輯',tag);
      await p.keyboard.press('Escape');await W(900);
      await p.evaluate(()=>{const b=document.querySelector('#evDetail [data-lcback]');b&&b.click()});await W(1000);
      if(await tap(p,'#notiBtn')){await W(1500);await measure(p,'通知頁',tag);
        await p.evaluate(()=>{const s=document.querySelector('#notiPage .cal-mon');s&&s.scrollIntoView({block:'center'})});await W(500);await measure(p,'通知頁行事曆',tag);
        await p.evaluate(()=>{const s=document.querySelector('#notiPage');s&&s.scrollTo&&s.scrollTo(0,0);scrollTo(0,0)});await W(400);
        if(await tap(p,'#notiPage .nd-card.today')){await W(1500);await measure(p,'今日層',tag);await p.keyboard.press('Escape');await W(1100)}
        await p.keyboard.press('Escape');await W(1100)}
      if(await tap(p,'#setBtn')){await W(1300);await measure(p,'設定',tag);
        if(w<700&&await tap(p,'#setOv [data-set="tags"],#setOv [data-set]')){await W(1200);await measure(p,'設定子頁',tag);await tap(p,'.dh-home');await W(900)}
        await p.evaluate(()=>{if(setOpen)closeSettings(true)});await W(700)}
      await p.evaluate(()=>{editBoardInfo('year')});await W(1100);await measure(p,'對話框',tag);
      ok(!p.errs.length,`${tag} 部門沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
  }
  /* ---- 判定 ---- */
  const LIST=!!process.env.LIST;let nIcon=0,nText=0;
  for(const [k,o] of all){const v=Object.entries(o.v);
    const worst=v.reduce((m,[t,r])=>Math.max(m,Math.abs(r.dx),o.kind==='icon'?Math.abs(r.dy):0),0);
    if(o.kind==='icon')nIcon++;else nText++;
    if(LIST)console.log(`LIST ${o.kind==='icon'?'圖示':'圖文'}｜${k}｜`+v.map(([t,r])=>`${t} ${r.dx>=0?'+':''}${r.dx}/${r.dy>=0?'+':''}${r.dy}`).join('，'));
    ok(worst<=TOL,`${o.kind==='icon'?'圖示鈕':'圖文膠囊'} ${k} 偏移最大 ${worst.toFixed(2)}px（`+v.map(([t,r])=>`${t} x${r.dx>=0?'+':''}${r.dx} y${r.dy>=0?'+':''}${r.dy}`).join('，')+'）')}
  ok(nIcon>=12,`量到的只有圖示的圓鈕 ${nIcon} 種、圖文膠囊 ${nText} 種`);
  await b.close();console.log(`\n${passes} OK，${fails} FAIL`);process.exit(fails?1:0)})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
