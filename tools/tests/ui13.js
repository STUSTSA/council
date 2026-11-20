/* ui13：2026-11-20 ui-13（docs/DESIGN.md「進度」甘特圖顏色、「網址」；交接說明該節）。github 模式（data_test.json 加三個議題），固定 8300 埠。
   A. 甘特圖沒選中的列：「已過時程」「剩餘時程」兩段一眼分得出來——兩段亮度比 ≥ 1.8、剩餘段跟卡片底色也分得出來（≥ 1.2）、已過段不是選中色；
      選中的議題維持選中色、它的剩餘段跟其他列同色；圖例兩個色塊跟條同色。412／1300 × 淺色／深色各跑一次；
      另外在 1300 把九組主題 × 淺深色全部換過一遍，同樣的比值都要成立。
   B. 權益部的網址：index.html（沒帶 d）打開後網址列換成 ?d=rights（不重新載入、沒有多一筆歷史、其他參數與 # 後面照留）；
      資料夾網址、?admin、#x 同；帶了 ?d=（含不存在的代號）不動；重新整理仍是權益部；主頁（home.html）本身網址不動，
      兩種主頁（卡片堆、翻頁）所有部門的連結都是 index.html?d=代號（權益部也是），點權益部色塊進到 ?d=rights；報告的看板網址（boardURL）帶 ?d=rights。
   外部請求：本機以外、測試沒有模擬的請求一律攔下並記下來，最後要是空的。
   失敗會印 FAIL 並以非 0 結束 */
const pw=require('playwright');
const ext=[];
{const L=pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch=async o=>{const b=await L(o),nc=b.newContext.bind(b);
    b.newContext=async o2=>{const ctx=await nc(o2);await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(['127.0.0.1','localhost'].includes(u.hostname))return r.fallback();ext.push(u.href.slice(0,120));return r.abort()});return ctx};return b}}
const c=require('./common');const fs=require('fs');const os=require('os');const path=require('path');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const ISS='imvpc3f0dcpi6';
const ymdOff=d=>{const t=new Date();t.setDate(t.getDate()+d);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')};
const D=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
const iss=(id,title,start,end)=>({id,title,tags:['收案','處理中','結案'],cur:0,start,end,doneAt:null,markers:[],links:[]});
D.issues.push(iss('iNS','還沒開始的議題',ymdOff(20),ymdOff(80)),iss('iEN','已經結束的議題',ymdOff(-80),ymdOff(-10)),iss('iDN','只在下學期的議題','2027-03-01','2027-04-30'));
const DF=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ui13-')),'data.json');fs.writeFileSync(DF,JSON.stringify(D));
const BASE='http://127.0.0.1:8300/';
const PALS=['fin','b3','ink','sage','mist','fire','pastel','neu','sun'];

/* 把任何 CSS 顏色（rgb()、color(srgb …)）用畫布轉成 [r,g,b] */
const rgbIn=`(col=>{const k=document.createElement('canvas');k.width=k.height=1;const x=k.getContext('2d',{willReadFrequently:true});x.fillStyle='#000';x.fillStyle=col;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)})`;
/* 甘特圖的顏色：每一列已過段、還沒到段、把手；圖例兩個色塊；卡片底色（往上找第一個不透明的底） */
const colors=p=>p.evaluate(`(()=>{const rgb=${rgbIn};const bg=e=>e?rgb(getComputedStyle(e).backgroundColor):null;
  const card=(()=>{let e=document.querySelector('#gantt');while(e){const c=getComputedStyle(e).backgroundColor;const m=c.match(/[\\d.]+/g);if(m&&(m.length<4||+m[3]>0.99))return rgb(c);e=e.parentElement}return rgb(getComputedStyle(document.body).backgroundColor)})();
  const rows=[...document.querySelectorAll('#gantt .g-issue:not(.g-undated)')].map(r=>{const s=r.querySelector('.g-track .sl'),a=s&&s.querySelector('.sl-a'),b=s&&s.querySelector('.sl-b');
    const on=e=>e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>1;
    return {id:r.dataset.jump,sel:!!s&&s.classList.contains('sel'),a:on(a)?bg(a):null,b:on(b)?bg(b):null}});
  const lg=document.querySelector('#pvGantt .legend');
  return {card,rows,acc:rgb(getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#000'),la:bg(lg&&lg.querySelector('.lg-a')),lb:bg(lg&&lg.querySelector('.lg-b'))}})()`);
const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
const cr=(x,y)=>{const a=lum(x),b=lum(y);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
const same=(x,y)=>!!x&&!!y&&x.every((v,i)=>Math.abs(v-y[i])<=1);
const fmt=c=>c?`rgb(${c.join(',')})`:'無';

(async()=>{
  c.serveRemote=true;
  const {b,mk}=await c.setup(DF);
  /* ---------- A. 甘特圖兩段的顏色 ---------- */
  for(const [w,h,sc] of [[412,900,'light'],[1300,900,'light'],[412,900,'dark'],[1300,900,'dark']]){
    const tag=`${w} ${sc}：`;
    const p=await mk(w,h,sc,w<640);
    await p.evaluate(sc=>localStorage.setItem('stustsa-ui',JSON.stringify({pal:'fin',mode:sc,sound:false})),sc);await p.reload();await p.waitForTimeout(1600);
    await p.evaluate(()=>{setSection('progress',{instant:true});progShow(null);ganttTerm='all';render()});await p.waitForTimeout(700);
    /* 先打開再返回＝選中 ISS */
    await p.evaluate(id=>progShow(id),ISS);await p.waitForTimeout(800);await p.evaluate(()=>progShow(null));await p.waitForTimeout(800);
    const k=await colors(p),un=k.rows.filter(r=>!r.sel&&r.a&&r.b),se=k.rows.find(r=>r.id===ISS);
    ok(un.length>=2,tag+`沒選中、兩段都看得到的列至少兩列（${un.length}）`);
    ok(un.length&&un.every(r=>cr(r.a,r.b)>=1.8),tag+`沒選中的列：已過與剩餘亮度比 ≥ 1.8（${un.slice(0,3).map(r=>cr(r.a,r.b).toFixed(2)).join('、')}；以前約 1.1）`);
    ok(un.length&&un.every(r=>cr(r.b,k.card)>=1.2),tag+`剩餘段跟卡片底色分得出來（比值 ${un.length?cr(un[0].b,k.card).toFixed(2):'-'}）`);
    ok(un.length&&un.every(r=>!same(r.a,k.acc)&&same(r.a,un[0].a)&&same(r.b,un[0].b)),tag+`沒選中的列彼此同色、已過段不是選中色（${fmt(un[0]&&un[0].a)}／${fmt(un[0]&&un[0].b)}）`);
    ok(!!se&&se.sel&&same(se.a,k.acc),tag+`選中的議題維持選中色（${fmt(se&&se.a)}＝${fmt(k.acc)}）`);
    ok(!!se&&!!se.b&&un.length>0&&same(se.b,un[0].b),tag+'選中的議題剩餘段跟其他列同色');
    ok(same(k.la,un[0]&&un[0].a)&&same(k.lb,un[0]&&un[0].b),tag+`圖例的兩個色塊跟條同色（${fmt(k.la)}、${fmt(k.lb)}）`);
    /* 九組主題 × 淺深色（只在 1300 做一次；直接換 <html> 的 data-pal／data-theme，看計算後的顏色） */
    if(w===1300&&sc==='light'){
      const bad=[];
      for(const th of ['light','dark'])for(const pal of PALS){
        await p.evaluate(([pal,th])=>{document.documentElement.dataset.pal=pal;document.documentElement.dataset.theme=th},[pal,th]);await p.waitForTimeout(250);
        const q=await colors(p),u=q.rows.filter(r=>!r.sel&&r.a&&r.b);
        const r1=u.length?cr(u[0].a,u[0].b):0,r2=u.length?cr(u[0].b,q.card):0;
        if(!(u.length&&r1>=1.8&&r2>=1.2&&u.every(r=>!same(r.a,q.acc))&&same(q.la,u[0].a)&&same(q.lb,u[0].b)))bad.push(`${pal}/${th}:${r1.toFixed(2)}/${r2.toFixed(2)}`);}
      ok(!bad.length,tag+`九組主題 × 淺深色：兩段亮度比 ≥ 1.8、剩餘段與卡片底色 ≥ 1.2、圖例同色（不合格：${bad.join('、')||'無'}）`);}
    ok(!p.errs.length,tag+'沒有錯誤：'+p.errs.slice(0,3).join(' | '));
    await p.context().close();
  }

  /* ---------- B. 權益部的網址 ---------- */
  const open=async(url,opt={})=>{const ctx=await b.newContext({viewport:{width:1300,height:900},serviceWorkers:'block',...opt});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.docReq=[];
    p.on('request',q=>{if(q.isNavigationRequest()&&q.frame()===p.mainFrame())p.docReq.push(q.url())});
    await p.goto(url);await p.waitForTimeout(1500);p.ctx=ctx;return p};
  const info=p=>p.evaluate(()=>({url:location.href,dept:typeof CFG!=='undefined'?CFG.deptId:null,name:(document.querySelector('#dhName')||{}).textContent,hist:history.length,nav:performance.getEntriesByType('navigation').length}));
  const tail=u=>u.replace(BASE.slice(0,-1),'');
  {const ref=await open(BASE+'index.html?d=rights'),ri=await info(ref);
    const p=await open(BASE+'index.html'),i=await info(p);
    ok(tail(i.url)==='/index.html?d=rights'&&i.dept==='rights'&&i.name==='權益部',`舊網址 index.html：網址列換成 ?d=rights、還是權益部（${tail(i.url)}、${i.name}）`);
    ok(p.docReq.length===1&&i.nav===1,`沒有重新載入（文件請求 ${p.docReq.length} 次）`);
    ok(i.hist===ri.hist,`沒有多一筆歷史（${i.hist}＝直接開 ?d=rights 的 ${ri.hist}）`);
    ok(!p.errs.length,'沒有錯誤：'+p.errs.slice(0,3).join(' | '));
    await p.reload();await p.waitForTimeout(1200);const r2=await info(p);
    ok(tail(r2.url)==='/index.html?d=rights'&&r2.dept==='rights','重新整理：還在 ?d=rights、還是權益部');
    ok(await p.evaluate(()=>boardURL().endsWith('?d=rights')),'報告的看板網址（boardURL）帶 ?d=rights');
    await p.ctx.close();await ref.ctx.close()}
  for(const [src,want,lab] of [['','/?d=rights','資料夾網址（根目錄，沒寫檔名）'],['index.html?admin','/index.html?d=rights&admin','其他參數（?admin）留著、d 放最前面'],['index.html#x','/index.html?d=rights#x','# 後面留著'],['index.html?admin#y','/index.html?d=rights&admin#y','參數與 # 都留著']]){
    const p=await open(BASE+src),i=await info(p);ok(tail(i.url)===want&&i.dept==='rights',`${lab}：${tail(i.url)}`);await p.ctx.close()}
  for(const [src,dept,lab] of [['index.html?d=events','events','別的部門'],['index.html?d=rights','rights','已經帶 ?d=rights'],['index.html?d=zzz','rights','不存在的代號（照舊落到權益部，網址不動）']]){
    const p=await open(BASE+src),i=await info(p);ok(tail(i.url)==='/'+src&&i.dept===dept,`${lab}：網址不動（${tail(i.url)}、${i.dept}）`);await p.ctx.close()}
  {const p=await open(BASE+'home.html');const u=await p.evaluate(()=>location.href);ok(tail(u)==='/home.html','主頁 home.html 本身的網址不加 ?d');
    const hs=await p.evaluate(()=>({tile:[...document.querySelectorAll('.hm-tile')].map(a=>a.getAttribute('href')),wc:[...document.querySelectorAll('.hm-wc')].map(a=>a.getAttribute('href'))}));
    const ids=await p.evaluate(()=>window.BOARD_DEPTS.map(d=>d.id));
    const want=ids.map(d=>`index.html?d=${d}`).sort().join('|');
    ok(hs.tile.slice().sort().join('|')===want&&hs.tile.includes('index.html?d=rights'),`卡片堆：每個部門的連結都帶 ?d=（${hs.tile.length} 個，權益部＝index.html?d=rights）`);
    ok(!hs.tile.some(h=>h==='index.html'),'沒有任何一個連到不帶 d 的 index.html');
    await p.emulateMedia({reducedMotion:'reduce'});
    const r=await p.evaluate(()=>{const a=document.querySelector('.hm-tile[href="index.html?d=rights"]');return !!a});
    await p.evaluate(()=>document.querySelector('.hm-tile[href="index.html?d=rights"]').click());
    await p.waitForURL(/index\.html/,{timeout:8000}).catch(()=>{});await p.waitForTimeout(1500);const i=await info(p);
    ok(r&&tail(i.url)==='/index.html?d=rights'&&i.dept==='rights',`點權益部色塊：進到 ?d=rights 的權益部（${tail(i.url)}）`);
    ok(!p.errs.length,'沒有錯誤：'+p.errs.slice(0,3).join(' | '));
    await p.ctx.close()}
  {const p=await open(BASE+'home.html',{viewport:{width:412,height:860},hasTouch:true,isMobile:true});
    const wc=await p.evaluate(()=>[...document.querySelectorAll('.hm-wc')].map(a=>a.getAttribute('href')));const ids=await p.evaluate(()=>window.BOARD_DEPTS.map(d=>d.id));
    ok(wc.length===ids.length&&wc.slice().sort().join('|')===ids.map(d=>`index.html?d=${d}`).sort().join('|'),`手機的卡片堆：連結都帶 ?d=（${wc.length} 個，權益部＝${wc.find(h=>/rights/.test(h))}）`);
    await p.ctx.close()}
  ok(!ext.length,'沒有預期外的外部請求：'+ext.slice(0,5).join(' '));
  await b.close();
  console.log(`\n${passes} 通過、${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL 例外：'+e.message);process.exit(1)});
