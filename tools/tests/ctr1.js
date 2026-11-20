/* ctr1：2026-11-20 文字置中量測（「所有版面上看起來沒有上下左右置中的字」）。github 模式，固定 8300 埠。
   找畫面上所有「放在有形狀的容器裡、單行」的文字（按鈕、膠囊、標籤、徽章、分頁、日期格…）：
   整頁截圖兩次（deviceScaleFactor 3），第二次把所有文字變透明；兩張相減＝文字真正畫出來的墨跡，取邊界框；
   容器取排版方塊（getBoundingClientRect）。墨跡邊界框中心跟容器中心的差＝偏移（dx 左右、dy 上下，正值＝偏右、偏下）。
   - 一定要在有載入 Jost、Noto Sans TC 的環境跑（系統裝了字型就行；沒裝字型量到的上下偏移沒有意義）。
   - 左右：只判定「應該置中」的容器（text-align:center、或 flex／inline-flex 且 justify-content:center、或寬度是被文字撐開的膠囊）。靠左的列、輸入框不算。
   - 上下：全部判定。含下伸字母（g、y、p、q）或標點的字，墨跡本身不對稱，所以只量每個容器的「第一個字的邊界」不可行；
     這裡的做法是以中文與數字為主，判定門檻 1px，含 g y p q , ; j 的字門檻放寬到 1.5px。
   環境變數 LIST=1 印出每一顆；W=412／1366 只跑一個寬度；SHOT=資料夾 存有偏差的整頁截圖。失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');const fs=require('fs');
const U='http://127.0.0.1:8300/';
const remote0=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
const W=ms=>new Promise(r=>setTimeout(r,ms));
const DPR=3;
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};

/* 頁面裡：找候選、把文字變透明、還原 */
const PAGE_LIB=()=>{
  const st=document.createElement('style');
  st.textContent=`.__cf,.__cf *,.__cf *::before,.__cf *::after{transition:none!important;animation:none!important;caret-color:transparent!important}
  .__ch,.__ch *,.__ch *::before,.__ch *::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}`;
  window.__c={
    list(){
      document.documentElement.classList.add('__cf');if(!st.isConnected)document.head.appendChild(st);
      const visible=el=>{for(let e=el;e&&e.nodeType===1;e=e.parentElement){const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden'||(+c.opacity)<0.99)return false}return true};
      const shaped=(el,r)=>{const c=getComputedStyle(el);const a=v=>{const m=v.match(/[\d.]+/g);return m&&(m.length<4||+m[3]>0.03)};
        const bw=['Top','Right','Bottom','Left'].some(s=>parseFloat(c['border'+s+'Width'])>0&&c['border'+s+'Style']!=='none'&&a(c['border'+s+'Color']));
        const rad=parseFloat(c.borderTopLeftRadius)||0;const bg=a(c.backgroundColor)||(c.backgroundImage!=='none');const sh=c.boxShadow!=='none'&&/\d/.test(c.boxShadow);
        return (bg||bw||sh)&&(rad>0||bw||bg)};
      const els=[...document.querySelectorAll('body *')];const cand=new Map();
      for(const el of els){
        if(['SCRIPT','STYLE','svg','path','INPUT','TEXTAREA','SELECT','OPTION','HTML','HEAD'].includes(el.tagName))continue;
        if(el.closest('svg,[hidden],[inert]'))continue;
        /* 這個元素自己有直接的文字節點才當「文字所在」 */
        let own=false;for(const n of el.childNodes)if(n.nodeType===3&&n.nodeValue.trim())own=true;if(!own)continue;
        /* 往上找最近的有形狀容器（最多 3 層） */
        let box=null;for(let e=el,i=0;e&&i<4&&e!==document.body;e=e.parentElement,i++){const r=e.getBoundingClientRect();if(r.height>96||r.width<8)break;if(shaped(e,r)){box=e;break}}
        if(!box)continue;cand.set(box,1)}
      const SKIP='.look-pal,.tb-main,.tabbar,.tab,.pc-wk,.g-name';
      /* 預設另外量：行事曆日期（字在 40×40 的圓裡；有事件小點的日子字本來就往上讓，不量）；EXTRA 環境變數可再加選擇器 */
      for(const el of document.querySelectorAll('.pc-d:not(:has(i)) .pc-n'+(window.__extra?','+window.__extra:'')))cand.set(el,1);
      const out=[];
      for(const el of cand.keys()){
        const r=el.getBoundingClientRect();if(r.width<8||r.height<8||r.height>96)continue;
        if(el.matches(SKIP)||el.closest('.look-pal'))continue;   /* 圖＋字上下排的格子、整條工具列：字不是要對在格子正中 */
        if(r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=document.documentElement.scrollHeight)continue;
        if(!visible(el))continue;
        const hit=document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));if(!hit||!(el===hit||el.contains(hit)||hit.contains(el)))continue;
        /* 容器裡看得見的文字 */
        const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let txt='',tops=new Set(),lines=0;
        for(let n;(n=tw.nextNode());){const t=n.nodeValue.replace(/\s+/g,'');if(!t)continue;const pe=n.parentElement;if(pe.closest('svg,script,style'))continue;
          let vis=true;for(let e=pe;e&&e!==el.parentElement;e=e.parentElement){const c=getComputedStyle(e);if((+c.opacity)<0.05||c.visibility!=='visible'||c.clipPath!=='none'||c.color==='rgba(0, 0, 0, 0)'||parseFloat(c.fontSize)<1||c.display==='none'){vis=false;break}}
          if(!vis)continue;const rg=document.createRange();rg.selectNodeContents(n);for(const q of rg.getClientRects()){if(q.width>0&&q.height>0)tops.add(Math.round(q.top/4))}txt+=t}
        if(!txt)continue;
        if(tops.size>1)continue;   /* 多行（靠左的內文、說明）不量 */
        const cs=getComputedStyle(el);
        let txtW=0;{const rg=document.createRange();rg.selectNodeContents(el);txtW=rg.getBoundingClientRect().width}   /* 文字（含裡面的圖示）的寬度：容器比文字寬很多＝靠左的列，不判左右 */
        const flexy=/flex|grid/.test(cs.display);const cx=flexy?((cs.justifyContent==='center'||cs.justifyContent==='space-around'||cs.justifyContent==='space-evenly')&&!/^(left|start)$/.test(cs.textAlign)&&r.width-txtW<=120):cs.textAlign==='center'||(el.matches('button')&&!/^(left|start)$/.test(cs.textAlign));
        /* 寬度被文字撐開（膠囊）：容器寬度 − 文字寬度 小於 2×(padding 估 24px) 也算要置中 */
        const name=(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].filter(c=>!/^(ico-|__c|on$|sel$|in$|cur$|open$)/.test(c)).join('.'))+'「'+txt.slice(0,8)+'」';
        /* 外層候選量測範圍要扣掉裡面的候選 */
        const rb=el.matches('.pc-n')?el.parentElement.getBoundingClientRect():r;   /* 行事曆日期：字在 40×40 的圓裡，對圓量 */
        out.push({el,name,txt,r:{x:rb.left+scrollX,y:rb.top+scrollY,w:rb.width,h:rb.height},cx,fs:parseFloat(cs.fontSize),tx:cs.textAlign,disp:cs.display,jc:cs.justifyContent,ai:cs.alignItems,lh:cs.lineHeight,pad:cs.paddingTop+' '+cs.paddingRight+' '+cs.paddingBottom+' '+cs.paddingLeft,fam:cs.fontFamily.slice(0,20)})}
      window.__cc=out;
      return out.map((o,i)=>({i,name:o.name,txt:o.txt,r:o.r,cx:o.cx,fs:o.fs,tx:o.tx,disp:o.disp,jc:o.jc,ai:o.ai,lh:o.lh,pad:o.pad,fam:o.fam,inner:out.filter(p=>p!==o&&o.el.contains(p.el)).map(p=>p.r)}));
    },
    hide(){document.documentElement.classList.add('__ch')},
    show(){document.documentElement.classList.remove('__ch','__cf')}
  };
};

/* 計算頁：兩張 PNG 相減，每個容器取文字墨跡的邊界框中心 */
const CALC=async(calc,a,b,cands,dpr)=>calc.evaluate(async([a,b,cands,dpr])=>{
  const load=s=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('圖片解碼失敗'));im.src='data:image/png;base64,'+s});
  const [ia,ib]=await Promise.all([load(a),load(b)]);const w=ia.width,h=ia.height;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d',{willReadFrequently:true});
  g.drawImage(ia,0,0);const da=g.getImageData(0,0,w,h).data;g.clearRect(0,0,w,h);g.drawImage(ib,0,0);const db=g.getImageData(0,0,w,h).data;
  return cands.map(c=>{const x0=Math.max(0,Math.floor(c.r.x*dpr)),y0=Math.max(0,Math.floor(c.r.y*dpr)),x1=Math.min(w,Math.ceil((c.r.x+c.r.w)*dpr)),y1=Math.min(h,Math.ceil((c.r.y+c.r.h)*dpr));
    const inner=(x,y)=>c.inner.some(q=>x>=q.x*dpr&&x<(q.x+q.w)*dpr&&y>=q.y*dpr&&y<(q.y+q.h)*dpr);
    let mx=0;const D=new Float32Array(Math.max(0,(x1-x0)*(y1-y0)));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(inner(x,y))continue;const k=(y*w+x)*4;const d=Math.max(Math.abs(da[k]-db[k]),Math.abs(da[k+1]-db[k+1]),Math.abs(da[k+2]-db[k+2]));D[(y-y0)*(x1-x0)+(x-x0)]=d;if(d>mx)mx=d}
    if(mx<40)return {...c,none:true};
    const th=mx*0.35;let bx0=1e9,by0=1e9,bx1=-1,by1=-1;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(D[(y-y0)*(x1-x0)+(x-x0)]>th){if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y}}
    const cx=(bx0+bx1+1)/2/dpr,cy=(by0+by1+1)/2/dpr;
    return {...c,dx:+(cx-(c.r.x+c.r.w/2)).toFixed(2),dy:+(cy-(c.r.y+c.r.h/2)).toFixed(2),iw:+((bx1+1-bx0)/dpr).toFixed(1),ih:+((by1+1-by0)/dpr).toFixed(1),lg:+((bx0/dpr)-c.r.x).toFixed(1),rg:+((c.r.x+c.r.w)-(bx1+1)/dpr).toFixed(1)}});
},[a,b,cands,dpr]);

(async()=>{const b=await chromium.launch();
  const calc=await (await b.newContext()).newPage();
  const all=new Map();
  const mk=async(w,h,scheme,dept)=>{const touch=w<700;let remote=JSON.parse(JSON.stringify(remote0)),sha='s0';
    const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:DPR,colorScheme:scheme,hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route(/\/dept\/config\.js(\?|$)/,async r=>{const res=await r.fetch();r.fulfill({response:res,body:(await res.text()).replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1')})});
    await ctx.route('https://api.github.com/**',async r=>{const q=r.request(),u=q.url();if(u.includes('/commits?'))return r.fulfill({status:200,contentType:'application/json',body:'[]'});
      if(q.method()==='GET'){if(!u.includes('data.json'))return r.fulfill({status:404,body:'{}'});if(/raw/.test(q.headers().accept||''))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remote)});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sha,content:Buffer.from(JSON.stringify(remote)).toString('base64')})})}
      const bd=JSON.parse(q.postData());if(u.includes('data.json'))remote=JSON.parse(Buffer.from(bd.content,'base64').toString());sha='s'+Date.now();return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:{sha}})})});
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!api\.github\.com)(?!fonts\.googleapis\.com)/,r=>r.abort());
    await ctx.addInitScript(PAGE_LIB);if(process.env.EXTRA)await ctx.addInitScript(x=>{window.__extra=x},process.env.EXTRA);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));return p};
  const measure=async(p,screen,tag)=>{if(process.env.ONLY&&!new RegExp(process.env.ONLY).test(screen))return [];await p.mouse.move(1,1).catch(()=>{});await W(200);
    const cands=await p.evaluate(()=>__c.list());if(!cands.length)return [];
    const a=(await p.screenshot({fullPage:true})).toString('base64');await p.evaluate(()=>__c.hide());await W(80);
    const bb=(await p.screenshot({fullPage:true})).toString('base64');await p.evaluate(()=>__c.show());
    const res=await CALC(calc,a,bb,cands,DPR);
    if(process.env.SHOT){fs.mkdirSync(process.env.SHOT,{recursive:true});fs.writeFileSync(`${process.env.SHOT}/${screen}-${tag}.png`.replace(/\s+/g,'_'),Buffer.from(a,'base64'))}
    for(const r of res){if(r.none)continue;const key=screen+' '+r.name;if(!all.has(key))all.set(key,{v:{},cx:r.cx,txt:r.txt});all.get(key).v[tag]=r}
    return res};
  const login=async p=>{await p.evaluate(()=>localStorage.setItem('workboard:ghtoken','T'));await p.click('#setBtn');await W(800);await p.click('#setOv .set-gate .primary');await W(400);
    await p.fill('#dlgForm input[name=pw]','0000').catch(()=>{});await p.click('#dlgForm [data-act=ok]').catch(()=>{});await W(500);
    await p.fill('#dlgForm input[name=name]','王').catch(()=>{});await p.fill('#dlgForm input[name=p1]','password-long-1').catch(()=>{});await p.fill('#dlgForm input[name=p2]','password-long-1').catch(()=>{});await p.click('#dlgForm [data-act=ok]').catch(()=>{});
    for(let i=0;i<4;i++){await W(500);const t=await p.$eval('#dlg[open] #dlgForm>b',b=>b.textContent).catch(()=>'');if(/共用密碼太短|沒有連上雲端/.test(t))await p.click('#dlgForm [data-act=cancel]').catch(()=>{})}
    await p.evaluate(()=>{if(setOpen)closeSettings(true)});await W(500)};
  const tap=async(p,sel)=>{const el=await p.$(sel);if(!el)return false;await el.click().catch(()=>{});return true};
  const SCEN=require('./ctr1-scenes.js');
  const widths=(process.env.W?process.env.W.split(','):['390','1366']).map(Number);
  for(const w of widths){const h=w<700?844:900;for(const scheme of (process.env.SCHEME?process.env.SCHEME.split(','):['light','dark'])){
    const tag=`${w}${scheme==='light'?'淺':'深'}`;
    await SCEN({mk,measure,login,tap,W,w,h,scheme,tag,U,ok,all});
  }}
  /* ---- 判定 ---- */
  const bad=[];const LIST=!!process.env.LIST;
  for(const [k,o] of all){const v=Object.entries(o.v);
    const descend=/[gjpqy,;]/.test(o.txt);const tolY=descend?1.5:1;
    const wy=v.reduce((m,[t,r])=>Math.abs(r.dy)>Math.abs(m)?r.dy:m,0);
    const wx=o.cx?v.reduce((m,[t,r])=>Math.abs(r.dx)>Math.abs(m)?r.dx:m,0):0;
    const line=`${k}｜${o.txt.slice(0,12)}｜`+v.map(([t,r])=>`${t} x${r.dx>=0?'+':''}${r.dx} y${r.dy>=0?'+':''}${r.dy}`).join('，');
    if(LIST)console.log('LIST '+line);
    if(Math.abs(wy)>tolY||Math.abs(wx)>1)bad.push(line)}
  for(const l of bad)ok(false,'偏移 '+l);
  ok(bad.length===0,`量了 ${all.size} 種容器，偏差超過門檻 ${bad.length} 種`);
  await b.close();console.log(`\n${passes} OK，${fails} FAIL`);process.exit(fails?1:0)})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
