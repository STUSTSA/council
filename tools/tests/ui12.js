/* ui12：2026-11-20 ui-12 甘特圖每一列改成滑桿式時程條（docs/DESIGN.md 第八節；DESIGN-next 第八節；交接說明該節）。
   github 模式（data_test.json 加三個議題：還沒開始、已經結束、只在下學期），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   五種畫面各跑一次：412 淺色、1300 淺色、412 深色、1300 深色、1300 柔光（neu）：
   1. 每一列是三段（已過、把手、還沒到），段與段之間有縫、圓角；把手比條高；把手中心＝今天在議題期間的位置（誤差 1px）
   2. 還沒開始＝整條還沒到、把手在最左；已經結束＝整條已過、把手在最右
   3. 選中的議題（從詳情返回後）：已過那段用選中色、把手用深色；其他列不用選中色
   4. 沒有小圓點；最新一筆註記是深色膠囊標籤；其他註記是條上方的短線（位置照日期）；未勾選的處理紀錄（.pend）半透明——短線與標籤都要
   5. 月份刻度、今天標記（膠囊與每列的細線）仍在；全部／上學期／下學期切換仍會改變列出的議題；名稱不被條蓋住
   6. 圖例：今天、已過時程、剩餘時程跟條同色（不再是細刻度）
   7. 關掉動態：打開詳情、返回、切換學期時甘特圖裡沒有動畫
   外部請求：本機以外、測試沒有模擬的請求一律攔下並記下來，最後要是空的。
   截圖（UI12SHOT＝資料夾時才拍，不 commit）：每種畫面的甘特圖。
   失敗會印 FAIL 並以非 0 結束 */
const pw=require('playwright');
const ext=[];
{const L=pw.chromium.launch.bind(pw.chromium);   /* 每個 context 最先登記一條全攔（最後才比對；common.js 的 route 優先） */
  pw.chromium.launch=async o=>{const b=await L(o),nc=b.newContext.bind(b);
    b.newContext=async o2=>{const ctx=await nc(o2);await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(['127.0.0.1','localhost'].includes(u.hostname))return r.fallback();ext.push(u.href.slice(0,120));return r.abort()});return ctx};return b}}
const c=require('./common');const fs=require('fs');const os=require('os');const path=require('path');
const SHOT=process.env.UI12SHOT||'';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const ISS='imvpc3f0dcpi6',EV='emvpd2q3bes2i';
const ymdOff=d=>{const t=new Date();t.setDate(t.getDate()+d);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')};
const D=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
const iss=(id,title,start,end)=>({id,title,tags:['收案','處理中','結案'],cur:0,start,end,doneAt:null,markers:[],links:[]});
D.issues.push(iss('iNS','還沒開始的議題',ymdOff(20),ymdOff(80)),iss('iEN','已經結束的議題',ymdOff(-80),ymdOff(-10)),iss('iDN','只在下學期的議題','2027-03-01','2027-04-30'));
const DF=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ui12-')),'data.json');fs.writeFileSync(DF,JSON.stringify(D));
/* 處理紀錄：卡片 EV 連到議題 ISS；一行有核取框、還沒勾的時間行（寫進母議題＝半透明）＋一個沒有連到行的舊時間標記（不透明）。late＝讓還沒勾的那筆變成最新一筆 */
const seed=(p,late)=>p.evaluate(([iss,evId,late])=>{const ev=state.events.find(e=>e.id===evId);ev.issueId=iss;
  ev.times=[{id:'tP',label:'待勾的事',start:(late?'2026-11-15':'2026-11-10')+'T10:00',end:'',place:'',toIssue:true},{id:'tF',label:'舊的時間標記',start:'2026-11-12',end:'',place:'',toIssue:true}];
  ev.blocks=[{id:'bP',text:'待勾的事',check:false,timeId:'tP'},{id:'bT',text:'一般文字',check:null,timeId:null}];
  ev.desc=StoreMap.descOf(ev.blocks);syncLink(ev);ganttTerm='all';render();layoutAll()},[ISS,EV,!!late]);
/* 甘特圖每一列的幾何與顏色 */
const rows=p=>p.evaluate(()=>{
  const R=e=>{if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,vis:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>.5,bg:cs.backgroundColor,rl:parseFloat(cs.borderTopLeftRadius),rr:parseFloat(cs.borderTopRightRadius)}};
  const t0=pd(today()).getTime();
  return [...document.querySelectorAll('#gantt .g-issue:not(.g-undated)')].map(r=>{const id=r.dataset.jump,it=state.issues.find(i=>i.id===id),[s,e]=issueSpan(it),a=pd(s).getTime(),b=pd(e).getTime();
    const q=x=>r.querySelector(x),bar=q('.g-track .sl');
    return {id,t:it.title,sel:!!bar&&bar.classList.contains('sel'),frac:b<=a?(t0>=a?1:0):Math.min(1,Math.max(0,(t0-a)/(b-a))),bar:R(bar),a:R(q('.g-track .sl-a')),h:R(q('.g-track .sl-h')),bb:R(q('.g-track .sl-b')),nm:R(q('.g-name a')),
      top:(()=>{const n=q('.g-name a');if(!n)return false;n.scrollIntoView({block:'center',inline:'nearest'});const k=n.getBoundingClientRect(),el=document.elementFromPoint(k.left+Math.min(10,k.width/2),k.top+k.height/2);return !!el&&!!el.closest('.g-name')})()}})});
const cv=(p,n)=>p.evaluate(n=>{const d=document.createElement('i');d.style.color=`var(${n})`;document.querySelector('#gantt').append(d);const c=getComputedStyle(d).color;d.remove();return c},n);
const hit=(a,b)=>!!a&&!!b&&a.vis&&b.vis&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;

(async()=>{
  c.serveRemote=true;
  const {b,mk}=await c.setup(DF);
  for(const [w,h,sc,pal] of [[412,900,'light','fin'],[1300,900,'light','fin'],[412,900,'dark','fin'],[1300,900,'dark','fin'],[1300,900,'light','neu']]){
    const tag=`${w} ${sc} ${pal}：`;
    const p=await mk(w,h,sc,w<640);
    await p.evaluate(([pal,sc])=>localStorage.setItem('stustsa-ui',JSON.stringify({pal,mode:sc,sound:false})),[pal,sc]);await p.reload();await p.waitForTimeout(1600);
    await p.evaluate(()=>{setSection('progress',{instant:true});progShow(null)});await p.waitForTimeout(700);
    await seed(p,false);await p.waitForTimeout(500);

    /* 1～2. 三段、縫、圓角、把手位置；還沒開始、已經結束 */
    let rs=await rows(p);
    const mid=rs.filter(r=>r.frac>0.03&&r.frac<0.97),ns=rs.find(r=>r.id==='iNS'),en=rs.find(r=>r.id==='iEN');
    ok(rs.length>=5&&rs.every(r=>r.bar&&r.a&&r.h&&r.bb),tag+`每一列都有滑桿式時程條（已過、把手、還沒到）：${rs.length} 列`);
    ok(mid.length>=3&&mid.every(r=>r.a&&r.bb&&r.a.vis&&r.bb.vis&&r.h.l-r.a.r>=3&&r.bb.l-r.h.r>=3),tag+'進行中的列：三段都在、段與段之間有縫（'+mid.map(r=>r.a&&r.h&&r.bb?(r.h.l-r.a.r).toFixed(1)+'/'+(r.bb.l-r.h.r).toFixed(1):'無').join('、')+'）');
    ok(mid.length&&mid.every(r=>r.a&&r.bb&&r.a.rl>=4&&r.bb.rr>=4&&r.h&&r.h.rl>=1),tag+'圓角矩形（外側圓角 '+mid.map(r=>r.a?r.a.rl+'/'+r.bb.rr:'無').join('、')+'）');
    ok(rs.length&&rs.every(r=>r.h&&r.bar&&r.h.h>r.bar.h&&r.h.w<r.h.h),tag+'把手是直立的、比條高');
    {const d=rs.map(r=>r.h&&r.bar?Math.abs((r.h.l+r.h.r)/2-r.bar.l-r.frac*r.bar.w):99);
      ok(d.every(x=>x<=1),tag+'把手中心＝今天在議題期間的位置（差 '+d.map(x=>x.toFixed(2)).join('、')+' px）');}
    ok(!!ns&&ns.frac===0&&!!ns.h&&Math.abs((ns.h.l+ns.h.r)/2-ns.bar.l)<=1&&!(ns.a&&ns.a.vis)&&ns.bb&&ns.bb.vis&&Math.abs(ns.bb.r-ns.bar.r)<=1,tag+'還沒開始：整條是還沒到、把手在最左');
    ok(!!en&&en.frac===1&&!!en.h&&Math.abs((en.h.l+en.h.r)/2-en.bar.r)<=1&&!(en.bb&&en.bb.vis)&&en.a&&en.a.vis&&Math.abs(en.a.l-en.bar.l)<=1,tag+'已經結束：整條是已過、把手在最右');
    ok(rs.length&&rs.every(r=>r.top&&!hit(r.nm,r.a)&&!hit(r.nm,r.h)&&!hit(r.nm,r.bb)),tag+'名稱不被條蓋住');
    /* 3. 選中的議題：從詳情返回 */
    await p.evaluate(id=>progShow(id),ISS);await p.waitForTimeout(800);await p.evaluate(()=>progShow(null));await p.waitForTimeout(800);
    rs=await rows(p);
    {const acc=await cv(p,'--acc'),ink=await cv(p,'--ink'),blk2=await cv(p,'--blk2'),s=rs.find(r=>r.id===ISS),o=rs.filter(r=>r.id!==ISS&&r.a&&r.a.vis);
      ok(!!s&&s.sel&&s.a&&s.a.bg===acc&&s.h.bg===ink,tag+`選中的議題條用選中色（${s&&s.a&&s.a.bg}）、把手用深色（${s&&s.h&&s.h.bg}）`);
      ok(o.length>=2&&o.every(r=>!r.sel&&r.a.bg!==acc&&r.a.bg===blk2&&r.h.bg===ink),tag+`其他列不用選中色（${o.map(r=>r.a.bg).filter((v,i,a)=>a.indexOf(v)===i).join('、')}）`);}
    /* 4. 註記 */
    const mk4=()=>p.evaluate(iss=>{const row=document.querySelector(`#gantt .g-issue[data-jump="${iss}"]`),tr=row&&row.querySelector('.g-track'),bar=tr&&tr.querySelector('.sl');
      const v=e=>{if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,op:+cs.opacity,vis:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0,bg:cs.backgroundColor}};
      const T=tr&&tr.getBoundingClientRect(),B=bar&&bar.getBoundingClientRect();
      return {dots:[...document.querySelectorAll('#gantt .dot')].filter(d=>{const r=d.getBoundingClientRect();return getComputedStyle(d).display!=='none'&&r.width>0&&+getComputedStyle(d).opacity>0}).length,
        barT:B&&B.top,list:tr?[...tr.querySelectorAll('.g-mk')].map(m=>({t:m.querySelector('.lbl').textContent,quiet:m.classList.contains('quiet'),pend:m.classList.contains('pend'),op:+getComputedStyle(m).opacity,
          x:T.left+parseFloat(m.style.left)/100*T.width,lbl:v(m.querySelector('.lbl')),stem:v(m.querySelector('.stem'))})):[]}},ISS);
    let m=await mk4();
    {const ink=await cv(p,'--ink'),late=m.list.find(x=>!x.quiet),q=m.list.filter(x=>x.quiet);
      ok(m.dots===0,tag+`沒有小圓點（看得到的 .dot：${m.dots}）`);
      ok(m.list.length>=5&&m.list.filter(x=>!x.quiet).length===1&&late&&/舊的時間標記/.test(late.t)&&late.lbl.vis&&late.lbl.op===1&&late.lbl.bg===ink,tag+`最新一筆註記是深色膠囊標籤（${late&&late.t}，${late&&late.lbl.bg}）`);
      ok(q.length>=4&&q.every(x=>x.lbl.op===0&&x.stem&&x.stem.vis&&x.stem.op>0&&x.stem.h>=3&&x.stem.h<=12&&x.stem.w<=2.5&&x.stem.b<=m.barT+.5&&Math.abs((x.stem.l+x.stem.r)/2-x.x)<=1),
        tag+'其他註記是條上方的短線（位置照日期）：'+q.map(x=>x.stem?`${x.stem.h.toFixed(0)}×${x.stem.w.toFixed(1)}`:'無').join('、'));
      const pe=m.list.find(x=>/待勾的事/.test(x.t)),fx=m.list.find(x=>/舊的時間標記/.test(x.t));
      ok(!!pe&&pe.quiet&&pe.pend&&pe.op===0.5&&fx&&!fx.pend&&fx.op===1,tag+`還沒勾的處理紀錄（短線）半透明（${pe&&pe.op}／不透明的 ${fx&&fx.op}）`);}
    await seed(p,true);await p.waitForTimeout(400);m=await mk4();
    {const pe=m.list.find(x=>/待勾的事/.test(x.t));ok(!!pe&&!pe.quiet&&pe.pend&&pe.op===0.5&&pe.lbl.vis,tag+`還沒勾的那筆是最新一筆時：標籤半透明（${pe&&pe.op}）`);}
    await seed(p,false);await p.waitForTimeout(400);
    /* 5. 月份刻度、今天標記、學期切換 */
    {const r=await p.evaluate(()=>({mon:document.querySelectorAll('#gantt .g-axis span:not(.today-tag)').length,tag:(document.querySelector('#gantt .today-tag')||{}).textContent||'',
        lines:document.querySelectorAll('#gantt .g-issue .g-track .today').length,n:document.querySelectorAll('#gantt .g-issue').length,tk:document.querySelectorAll('#gantt .tk').length}));
      ok(r.mon>=6&&/今天/.test(r.tag)&&r.lines===r.n,tag+`月份刻度 ${r.mon} 個、今天膠囊「${r.tag}」、每列的今天細線 ${r.lines}/${r.n}`);
      ok(r.tk===0,tag+`甘特圖不再有細刻度（.tk：${r.tk}）`);}
    {const names=()=>p.evaluate(()=>[...document.querySelectorAll('#gantt .g-issue .g-name a')].map(a=>a.textContent));
      const all=await names();await p.evaluate(()=>{ganttTerm='up';renderGantt();layoutAll()});await p.waitForTimeout(300);const up=await names();
      const upBars=await p.evaluate(()=>[...document.querySelectorAll('#gantt .g-issue:not(.g-undated)')].every(r=>r.querySelector('.g-track .sl .sl-h')));
      await p.evaluate(()=>{ganttTerm='all';renderGantt();layoutAll()});await p.waitForTimeout(300);
      ok(all.includes('只在下學期的議題')&&!up.includes('只在下學期的議題')&&up.length>0&&up.length<all.length&&upBars,tag+`學期切換改變列出的議題（全部 ${all.length}、上學期 ${up.length}），上學期也是滑桿`);}
    /* 6. 圖例 */
    {const r=await p.evaluate(()=>{const lg=document.querySelector('#pvGantt .legend'),bg=s=>{const e=lg&&lg.querySelector(s);return e?getComputedStyle(e).backgroundColor:null};
        const row=[...document.querySelectorAll('#gantt .g-issue:not(.g-undated) .sl:not(.sel)')].find(x=>getComputedStyle(x.querySelector('.sl-a')).display!=='none'&&getComputedStyle(x.querySelector('.sl-b')).display!=='none');
        return {txt:lg?[...lg.querySelectorAll(':scope>span')].map(s=>s.textContent.trim()):[],old:lg?lg.querySelectorAll('.lg-tk').length:-1,now:bg('.lg-now'),a:bg('.lg-a'),b:bg('.lg-b'),
          ra:row&&getComputedStyle(row.querySelector('.sl-a')).backgroundColor,rb:row&&getComputedStyle(row.querySelector('.sl-b')).backgroundColor}});
      const okc=await cv(p,'--ok');
      ok(r.txt.join('|')==='今天|已過時程|剩餘時程'&&r.old===0&&r.now===okc&&r.a&&r.a===r.ra&&r.b&&r.b===r.rb,tag+`圖例跟條同色（今天 ${r.now}、已過 ${r.a}＝${r.ra}、剩餘 ${r.b}＝${r.rb}）`);}
    if(SHOT){await p.evaluate(()=>{const g=document.querySelector('#progPanel');g&&g.scrollIntoView({block:'start'})});await p.waitForTimeout(400);
      await p.screenshot({path:`${SHOT}/gantt-${w}-${sc}-${pal}.png`});}
    /* 7. 關掉動態 */
    if(w===1300&&pal==='fin'){await p.emulateMedia({reducedMotion:'reduce'});
      const run=()=>p.evaluate(()=>document.getAnimations().filter(a=>{const t=a.effect&&a.effect.target;return t&&t.closest&&t.closest('#progPanel')&&a.playState==='running'}).length);
      const seen=[];await p.evaluate(id=>progShow(id),ISS);seen.push(await run());await p.waitForTimeout(200);await p.evaluate(()=>progShow(null));seen.push(await run());
      await p.evaluate(()=>{const b=document.querySelector('#gTerm [data-k="up"]');b&&b.click()});seen.push(await run());await p.waitForTimeout(100);seen.push(await run());
      await p.evaluate(()=>{const b=document.querySelector('#gTerm [data-k="all"]');b&&b.click()});seen.push(await run());
      ok(seen.every(n=>n===0),tag+`關掉動態：打開詳情、返回、切換學期時沒有動畫（${seen.join(',')}）`);
      await p.emulateMedia({reducedMotion:'no-preference'});}
    ok(!p.errs.length,tag+'沒有錯誤：'+p.errs.slice(0,3).join(' | '));
    await p.context().close();
  }
  ok(!ext.length,'沒有預期外的外部請求：'+ext.slice(0,5).join(' '));
  await b.close();
  console.log(`\n${passes} 通過、${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL 例外：'+e.message);process.exit(1)});
