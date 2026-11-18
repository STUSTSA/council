/* ui8color：ui-08 G 顏色全部走主題變數（docs/DESIGN-next.md 第二節「新主題只能改變數的值」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   做法（替換法）：同一個畫面、同一個深淺色，把 <html data-pal> 依序換成九組主題（測試時關掉顏色過渡），每次抓畫面上所有看得見的元素（含 ::before／::after）的
   color（自己有字才算）、background-color、background-image 裡的顏色、border-*-color（有框才算）、outline-color（有外框線才算）、fill、stroke、box-shadow 的顏色，
   html 的 scrollbar-color、打開的對話框的 ::backdrop。某個元素的某個屬性在九組主題都是同一個值＝沒有跟著主題變＝寫死，除非是允許的例外：
   部門標誌的藍 rgb(10,91,170)、黃 rgb(240,188,35)（主頁部門色塊的 .dg 整個略過，檔案裡還有行銷部的橘）；陰影用的半透明黑（box-shadow 裡的 rgba(0,0,0,a)）；透明；工作報告的白紙（.rpt-paper、.rpt-ov 裡面）。
   畫面：主頁、即時回報、卡片（展開）、通知頁、設定頁、進度頁、對話框；412（觸控）與 1300，淺色與深色。
   「處」＝不重複的（元素標籤＋class＋偽元素, 屬性）。環境變數 LIST=1 印出每一處。失敗會印 FAIL 並以非 0 結束 */
const C=require('./common.js');
const PALS=['fin','b3','ink','sage','mist','fire','pastel','neu','sun'];
const ALLOW=new Set(['rgb(10, 91, 170)','rgb(240, 188, 35)']);
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

/* 頁面裡：第一次呼叫記下這個畫面看得見的元素，之後每換一組主題就讀一次同一批元素的顏色 */
const GRAB=()=>{
  if(!document.getElementById('__u8nt')){const s=document.createElement('style');s.id='__u8nt';s.textContent='*,*::before,*::after{transition:none!important}';document.head.appendChild(s)}
  const COL=/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b/gi;
  const sig=(el,ps)=>el.tagName.toLowerCase()+(el.classList&&el.classList.length?'.'+[...el.classList].filter(c=>!/^(on|sel|lit|in|open|ico-on|ico-once|hov|due|show)$/.test(c)).sort().join('.'):'')+(el.id&&!el.classList.length?'#'+el.id:'')+(ps||'');
  if(!window.__u8els){
    const list=[];
    for(const el of document.querySelectorAll('body *')){
      if(el.closest('.rpt-paper,.rpt-ov,.dg,script,style'))continue;   /* 白紙報告、部門標誌（.dg，檔案裡的藍黃橘）是例外 */
      const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)continue;
      if(el.checkVisibility&&!el.checkVisibility({opacityProperty:true,visibilityProperty:true}))continue;
      list.push(el)}
    window.__u8els=list}
  const out=[];
  const pick=(el,cs,ps,svg)=>{const o={};
    const own=!ps&&[...el.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim());
    if(own||(ps&&cs.content&&cs.content!=='none'&&cs.content!=='""'&&!/^url/.test(cs.content)))o.color=cs.color;
    if(!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor))o['background-color']=cs.backgroundColor;
    if(cs.backgroundImage&&cs.backgroundImage!=='none'){const m=cs.backgroundImage.match(COL);if(m)o['background-image']=m.join(' ')}
    for(const s of ['top','right','bottom','left'])if(parseFloat(cs[`border-${s}-width`])>0&&cs[`border-${s}-style`]!=='none'&&!/rgba\(0, 0, 0, 0\)/.test(cs[`border-${s}-color`]))o[`border-${s}-color`]=cs[`border-${s}-color`];
    if(cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0)o['outline-color']=cs.outlineColor;
    if(svg){if(cs.fill&&cs.fill!=='none')o.fill=cs.fill;if(cs.stroke&&cs.stroke!=='none')o.stroke=cs.stroke}
    if(cs.boxShadow&&cs.boxShadow!=='none'){const m=(cs.boxShadow.match(COL)||[]).filter(c=>!/^rgba\(0, 0, 0, [\d.]+\)$/.test(c)&&c!=='rgb(0, 0, 0)');if(m.length)o['box-shadow']=m.join(' ')}
    return o};
  window.__u8els.forEach((el,i)=>{const cs=getComputedStyle(el);const svg=el instanceof SVGGeometryElement||el instanceof SVGTextContentElement;   /* g、svg 本身不上色，只看畫出來的形狀 */
    out.push({i,s:sig(el),v:pick(el,cs,'',svg)});
    for(const ps of ['::before','::after']){const p=getComputedStyle(el,ps);if(p.content&&p.content!=='none'&&p.display!=='none')out.push({i,s:sig(el,ps),v:pick(el,p,ps,false)})}});
  document.querySelectorAll('dialog[open]').forEach(d=>{const b=getComputedStyle(d,'::backdrop');out.push({i:-2,s:'dialog::backdrop',v:{'background-color':b.backgroundColor}})});
  const h=getComputedStyle(document.documentElement);if(h.scrollbarColor&&h.scrollbarColor!=='auto')out.push({i:-1,s:'html',v:{'scrollbar-color':h.scrollbarColor}});
  return out};

(async()=>{const s=await C.setup();const total=new Map();   /* 「簽名｜屬性」→ {值、出現的畫面} */
  const scan=async(p,screen,tag)=>{await p.mouse.move(1,1).catch(()=>{});await W(250);
    await p.evaluate(()=>{delete window.__u8els});const runs=[];
    for(const pal of PALS){await p.evaluate(x=>{document.documentElement.dataset.pal=x},pal);await W(40);runs.push(await p.evaluate(GRAB))}
    await p.evaluate(()=>{const x=document.getElementById('__u8nt');x&&x.remove();delete window.__u8els;try{document.documentElement.dataset.pal=(JSON.parse(localStorage.getItem('stustsa-ui')||'{}').pal)||'fin'}catch(_){document.documentElement.dataset.pal='fin'}});
    const n0=runs[0].length;let bad=0;
    for(let k=0;k<n0;k++){const e=runs[0][k];for(const prop of Object.keys(e.v)){const v0=e.v[prop];
      if(runs.some(r=>!r[k]||r[k].s!==e.s||r[k].v[prop]!==v0))continue;   /* 有一組不一樣＝跟著主題變 */
      const cols=v0.match(/rgba?\([^)]*\)/g)||[v0];if(cols.every(c=>ALLOW.has(c)||/^rgba\(\d+, \d+, \d+, 0\)$/.test(c)))continue;
      const key=e.s+'｜'+prop;bad++;if(!total.has(key))total.set(key,{v:v0,at:new Set()});total.get(key).at.add(`${screen} ${tag}`)}}
    return bad};
  const close=async p=>{await p.keyboard.press('Escape');await W(700);await p.evaluate(()=>{try{if(typeof setOpen!=='undefined'&&setOpen)closeSettings(true)}catch(_){}});await W(500)};
  for(const [w,h] of [[412,860],[1300,820]])for(const sc of ['light','dark']){const tag=`${w} ${sc==='light'?'淺':'深'}`;
    const p=await s.mk(w,h,sc,w<700);
    await p.goto('http://127.0.0.1:8300/home.html');await W(4200);await scan(p,'主頁',tag);
    await p.goto('http://127.0.0.1:8300/index.html');await W(2000);await s.login(p);await W(600);
    await scan(p,'即時回報',tag);
    await p.evaluate(()=>{const c=document.querySelector('#events .cp');c&&c.click()});await W(1300);await scan(p,'卡片',tag);
    await close(p);await p.evaluate(()=>{const b=document.querySelector('#evDetail [data-lcback]');b&&b.click()});await W(900);
    await p.click('#notiBtn').catch(()=>{});await W(1500);await scan(p,'通知頁',tag);await close(p);await W(600);
    await p.click('#setBtn').catch(()=>{});await W(1300);await scan(p,'設定頁',tag);await close(p);
    await p.click('#tabbar .tab[data-tab="progress"]').catch(()=>{});await W(1400);await scan(p,'進度頁',tag);
    await p.evaluate(()=>{editBoardInfo('year')});await W(1100);await scan(p,'對話框',tag);await close(p);
    ok(!p.errs.length,`${tag} 沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
  const LIST=!!process.env.LIST;
  if(LIST)for(const [k,o] of total)console.log(`LIST ${k}＝${o.v}（${[...o.at].slice(0,4).join('、')}${o.at.size>4?'…':''}）`);
  ok(total.size===0,`九組主題 × 深淺色，七個畫面沒有跟著主題變的顏色：${total.size} 處`+(total.size&&!LIST?'：'+[...total.keys()].slice(0,12).join('；'):''));
  await s.b.close();console.log(`\n${passes} OK，${fails} FAIL`);process.exit(fails?1:0)})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
