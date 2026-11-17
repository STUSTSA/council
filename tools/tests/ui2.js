/* ui2：新介面第 2 步（主題、材質）。固定 8300 埠（run-tests.sh 換埠時會一起換）。
   - 九組主題 × 淺深色：--bg、--pri、--acc（加上 --blk、--ink、--ok、--late）跟 docs/DESIGN-next.md 第二節的表一字不差
   - localStorage「stustsa-ui」：讀寫、壞值與不認得的值用預設（米黃、跟系統、音效開）
   - 沒選過深淺色時跟系統（Playwright 的 colorScheme 換了就跟著換）；選過就不跟
   - 設定 → 外觀：點主題 data-pal 改變、存起來、重新整理仍保留；點深色／淺色；音效開關；每顆主題按鈕顯示自己那一組的顏色
   - 換主題時整頁淡過去（View Transitions）；關掉動態時不淡；淡的途中點別的主題，那一下照樣算數；淡的途中點工具列 SVG 圖示會換分頁、沒有錯誤；淡的途中拖曳不算點擊
   - 搜尋欄聚焦框九組主題都看得到
   - 頁面上沒有 backdrop-filter、沒有 title 屬性；總覽 home.html 讀同一個設定
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const URL0=process.env.URL||'http://127.0.0.1:8300/';
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'OK ':'FAIL ')+m);if(c)passes++;else fails++};
/* 規格表 */
const md=fs.readFileSync(path.join(__dirname,'../../docs/DESIGN-next.md'),'utf8');
const sec=md.split('### 九組主題的色碼')[1].split('## 三、')[0];
const SPEC={light:{},dark:{}},NAMES={};
const rows=(blk,mode)=>blk.split('\n').forEach(l=>{const m=l.match(/^\|\s*(\S+)（`(\w+)`）\s*\|(.*)\|\s*$/);if(!m)return;const c=m[3].split('|').map(x=>x.trim());NAMES[m[2]]=m[1];
  SPEC[mode][m[2]]={bg:c[0],blk:c[1],ink:c[3],acc:c[6].split('／')[0],'acc-ink':c[6].split('／')[1],pri:c[8].split('／')[0],'pri-ink':c[8].split('／')[1]}});
rows(sec.split('淺色：')[1].split('深色：')[0],'light');rows(sec.split('深色：')[1].split('「柔光」另外有')[0],'dark');
sec.split('完成與逾期的顏色：')[1].split('\n').forEach(l=>{const m=l.match(/^\|\s*(\S+?)\s*\|\s*(#\w+)／(#\w+)\s*\|\s*(#\w+)／(#\w+)\s*\|/);if(!m)return;const k=Object.keys(NAMES).find(k=>NAMES[k]===m[1]);if(!k)return;
  Object.assign(SPEC.light[k],{ok:m[2],late:m[4]});Object.assign(SPEC.dark[k],{ok:m[3],late:m[5]})});
const PALS=Object.keys(SPEC.light);
const hex=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return h.toLowerCase()};
const sameColor=(a,b)=>hex(a)===hex(b);

(async()=>{
  ok(PALS.join()==='fin,b3,ink,sage,mist,fire,pastel,neu,sun','規格表讀到九組主題：'+PALS.join());
  const b=await chromium.launch();
  const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||1300,height:o.h||900},colorScheme:o.sc||'light',reducedMotion:o.rm||'no-preference',hasTouch:!!o.touch,isMobile:!!o.touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    if(o.init!==undefined)await ctx.addInitScript(v=>{if(!sessionStorage.getItem('ui2-init')){sessionStorage.setItem('ui2-init','1');if(v===null)localStorage.removeItem('stustsa-ui');else localStorage.setItem('stustsa-ui',v)}},o.init);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(URL0+(o.page||'index.html'));await p.waitForTimeout(o.wait||2400);return p};
  const st=p=>p.evaluate(()=>{const r=document.documentElement,cs=getComputedStyle(r),v=k=>cs.getPropertyValue(k).trim();
    let ls=null;try{ls=localStorage.getItem('stustsa-ui')}catch(_){}
    return {pal:r.dataset.pal,theme:r.dataset.theme,bg:v('--bg'),pri:v('--pri'),acc:v('--acc'),blk:v('--blk'),ink:v('--ink'),ok:v('--ok'),late:v('--late'),sh:v('--blk-sh'),meta:document.querySelector('meta[name=theme-color]').content,ls,body:getComputedStyle(document.body).backgroundColor}});

  /* 1. 九組主題 × 淺深色的變數值 */
  {const p=await mk({init:null});
    for(const mode of ['light','dark'])for(const k of PALS){
      const v=await p.evaluate(([k,mode])=>{const r=document.documentElement;r.dataset.pal=k;r.dataset.theme=mode;const cs=getComputedStyle(r),g=n=>cs.getPropertyValue(n).trim();
        return {bg:g('--bg'),blk:g('--blk'),ink:g('--ink'),acc:g('--acc'),'acc-ink':g('--acc-ink'),pri:g('--pri'),'pri-ink':g('--pri-ink'),ok:g('--ok'),late:g('--late'),sh:g('--blk-sh')}},[k,mode]);
      const want=SPEC[mode][k],bad=Object.keys(want).filter(n=>!sameColor(v[n],want[n]));
      ok(!bad.length,`${NAMES[k]}（${k}）${mode}：${bad.length?bad.map(n=>`${n}=${v[n]}≠${want[n]}`).join(' '):'--bg '+v.bg+' --pri '+v.pri+' --acc '+v.acc}`);
      ok(k==='neu'?/rgba/.test(v.sh):v.sh==='none',`${k} ${mode} --blk-sh ${k==='neu'?'有值':'none'}`);
    }
    await p.context().close()}

  /* 2. 沒選過：米黃、跟系統；系統一換就跟著換；meta theme-color＝--bg */
  {const p=await mk({init:null,sc:'light'});let s=await st(p);
    ok(s.pal==='fin'&&s.theme==='light'&&sameColor(s.bg,'#f5f0e1')&&s.body==='rgb(245, 240, 225)'&&sameColor(s.meta,'#f5f0e1'),`沒選過、系統淺色：米黃淺色 ${JSON.stringify([s.pal,s.theme,s.bg,s.meta])}`);
    ok(s.ls===null,'只讀不寫：沒選過時 localStorage 沒有被寫入');
    await p.emulateMedia({colorScheme:'dark'});await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark',null,{timeout:3000}).catch(()=>{});await p.waitForTimeout(300);s=await st(p);   /* 系統深淺色的 change 事件要等下一次畫面更新才來 */
    ok(s.theme==='dark'&&sameColor(s.bg,'#000')&&sameColor(s.meta,'#000'),`系統換成深色：跟著換 ${s.theme} ${s.bg} meta ${s.meta}`);
    await p.context().close()}
  {const p=await mk({init:null,sc:'dark'});const s=await st(p);ok(s.pal==='fin'&&s.theme==='dark','沒選過、系統深色：米黃深色');await p.context().close()}

  /* 3. 壞值與不認得的值 */
  for(const [raw,sc,want] of [['{壞掉','dark',['fin','dark']],['[1,2]','light',['fin','light']],['"fin"','light',['fin','light']],['{"pal":"xyz","mode":"blue","sound":"no"}','dark',['fin','dark']],['{"pal":"sage","mode":"dark"}','light',['sage','dark']],['{"pal":"neu"}','dark',['neu','dark']]]){
    const p=await mk({init:raw,sc,wait:1500});const s=await st(p);
    ok(s.pal===want[0]&&s.theme===want[1]&&!p.errs.length,`localStorage ${raw}（系統 ${sc}）→ ${s.pal} ${s.theme}${p.errs.length?' 錯誤 '+p.errs:''}`);
    if(raw.includes('"mode":"dark"')){await p.emulateMedia({colorScheme:'light'});await p.waitForTimeout(1200);ok((await st(p)).theme==='dark','選過深色：系統換成淺色也不跟')}
    await p.context().close()}
  /* localStorage 不能用（存取丟例外）：照樣開得起來、用預設 */
  {const ctx=await b.newContext({viewport:{width:1300,height:900},colorScheme:'dark',serviceWorkers:'block'});await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.addInitScript(()=>{const t=()=>{throw new Error('blocked')};Object.defineProperty(Storage.prototype,'getItem',{value:t});Object.defineProperty(Storage.prototype,'setItem',{value:t})});
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL0+'index.html');await p.waitForTimeout(1500);
    const s=await p.evaluate(()=>[document.documentElement.dataset.pal,document.documentElement.dataset.theme,typeof UI]);
    ok(s[0]==='fin'&&s[1]==='dark'&&s[2]==='object',`localStorage 不能用：${s}（錯誤 ${errs.filter(e=>/stustsa-ui|theme/.test(e)).length}）`);
    await p.evaluate(()=>UI.set({pal:'sun'}));await p.waitForTimeout(300);ok(await p.evaluate(()=>document.documentElement.dataset.pal)==='sun','localStorage 不能用：這次照樣能換主題');
    await ctx.close()}

  /* 4. 設定 → 外觀（github 模式沒登入：設定清單最後一列「外觀」） */
  for(const o of [{w:1300,sc:'light'},{w:412,sc:'dark',touch:true}]){
    const p=await mk({...o,init:null});const tag=`${o.w}${o.sc}`;
    await p.click('#setBtn');await p.waitForTimeout(900);
    ok(await p.locator('#setOv [data-set="look"]').count()===1,`${tag} 沒登入時設定清單有「外觀」`);
    await p.click('#setOv [data-set="look"]');await p.waitForTimeout(1100);
    const host=o.w<900?'#setSub':'#setOv .set-pane';
    const look=await p.evaluate(h=>{const el=document.querySelector(h+' .look');if(!el)return null;
      return {modes:[...el.querySelectorAll('.look-mode [data-k]')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':'')).join(),
        pals:[...el.querySelectorAll('[data-look-pal]')].map(b=>b.textContent+(b.getAttribute('aria-checked')==='true'?'*':'')).join(),
        snd:el.querySelector('[data-look-snd]')?.getAttribute('aria-checked'),txt:el.textContent.replace(/\s+/g,'')}},host);
    ok(look&&look.modes===(o.sc==='dark'?'淺色,深色*':'淺色*,深色')&&look.pals==='米黃*,白藍,黑白黃,灰綠,霧藍,爐火,粉彩,柔光,暖陽'&&look.snd==='true',`${tag} 外觀：${JSON.stringify(look)}`);
    ok(look&&look.txt==='淺色深色米黃白藍黑白黃灰綠霧藍爐火粉彩柔光暖陽音效','不放說明小字：外觀裡只有選項與名稱');
    /* 每顆主題按鈕顯示自己那一組的顏色（三顆圓＝色塊、主要動作、選中；深淺跟著目前） */
    const sw=await p.evaluate(h=>[...document.querySelectorAll(h+' [data-look-pal]')].map(b=>{const i=b.querySelectorAll('.look-sw i'),c=e=>getComputedStyle(e).backgroundColor;return [b.dataset.lookPal,c(i[0]),c(i[1]),c(i[2]),getComputedStyle(b).backgroundColor]}),host);
    const rgb=h=>{h=hex(h);return `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`};
    const bad=sw.filter(([k,a,c2,c3,bg])=>{const w=SPEC[o.sc][k];return a!==rgb(w.blk)||c2!==rgb(w.pri)||c3!==rgb(w.acc)||bg!==rgb(w.bg)});
    ok(sw.length===9&&!bad.length,`${tag} 每顆主題按鈕是自己主題的顏色${bad.length?'：錯 '+JSON.stringify(bad):''}`);
    /* 點爐火：data-pal 改變、存起來 */
    await p.click(`${host} [data-look-pal="fire"]`);await p.waitForTimeout(500);let s=await st(p);
    ok(s.pal==='fire'&&JSON.parse(s.ls).pal==='fire'&&sameColor(s.bg,SPEC[o.sc].fire.bg),`${tag} 點爐火：${s.pal} ${s.ls} --bg ${s.bg}`);
    ok(await p.evaluate(h=>document.querySelector(h+' [data-look-pal="fire"]').getAttribute('aria-checked')==='true'&&document.querySelector(h+' [data-look-pal="fin"]').getAttribute('aria-checked')==='false',host),`${tag} 選到的按鈕 aria-checked 跟著換`);
    ok(await p.evaluate(h=>{const b=document.querySelector(h+' [data-look-pal="fire"]');return getComputedStyle(b).fontWeight==='700'&&/ 2px/.test(getComputedStyle(b).boxShadow)},host),`${tag} 選到的主題按鈕加粗框、粗體`);
    /* 深淺色：點另一邊 */
    const other=o.sc==='dark'?'light':'dark';
    await p.click(`${host} .look-mode [data-k="${other}"]`);await p.waitForTimeout(700);s=await st(p);
    ok(s.theme===other&&JSON.parse(s.ls).mode===other&&sameColor(s.bg,SPEC[other].fire.bg),`${tag} 點${other==='dark'?'深色':'淺色'}：${s.theme} ${s.ls}`);
    const sw2=await p.evaluate(h=>getComputedStyle(document.querySelector(h+' [data-look-pal="b3"] .look-sw i:nth-child(3)')).backgroundColor,host);
    ok(sw2===rgb(SPEC[other].b3.acc),`${tag} 換深淺色後主題按鈕跟著換成那一邊的顏色（白藍 --acc ${sw2}）`);
    /* 音效開關：只存設定 */
    await p.click(`${host} [data-look-snd]`);await p.waitForTimeout(300);s=await st(p);
    ok(JSON.parse(s.ls).sound===false&&await p.evaluate(h=>document.querySelector(h+' [data-look-snd]').getAttribute('aria-checked'),host)==='false',`${tag} 音效關：${s.ls}`);
    /* 重新整理仍保留 */
    await p.reload();await p.waitForTimeout(1800);s=await st(p);
    ok(s.pal==='fire'&&s.theme===other&&sameColor(s.meta,SPEC[other].fire.bg),`${tag} 重新整理仍保留：${s.pal} ${s.theme} meta ${s.meta}`);
    /* 頁面上沒有 backdrop-filter、沒有 title 屬性（看板、設定、外觀都開過） */
    await p.click('#setBtn');await p.waitForTimeout(900);await p.click('#setOv [data-set="look"]');await p.waitForTimeout(900);
    const mat=await p.evaluate(()=>{const els=[...document.querySelectorAll('*')];return {bf:els.filter(e=>{const c=getComputedStyle(e);return (c.backdropFilter&&c.backdropFilter!=='none')||(c.webkitBackdropFilter&&c.webkitBackdropFilter!=='none')}).map(e=>e.tagName+'.'+e.className).slice(0,5),
      title:[...document.querySelectorAll('[title]')].map(e=>e.tagName+'.'+e.className).slice(0,5),glow:els.filter(e=>/rgba\(255, 255, 255, 0\.[3-9]/.test(getComputedStyle(e).boxShadow)).map(e=>e.tagName+'.'+e.className).slice(0,5)}});
    ok(!mat.bf.length,`${tag} 沒有 backdrop-filter ${mat.bf}`);ok(!mat.title.length,`${tag} 沒有 title 屬性 ${mat.title}`);ok(!mat.glow.length,`${tag} 沒有白色光暈 ${mat.glow}`);
    ok(!p.errs.length,`${tag} 沒有錯誤 ${p.errs}`);
    await p.context().close()}

  /* 5. 換的時候整頁淡過去；關掉動態時不淡；淡的途中點別的主題照樣算數 */
  for(const rm of ['no-preference','reduce']){
    const p=await mk({init:null,rm});
    await p.click('#setBtn');await p.waitForTimeout(900);await p.click('#setOv [data-set="look"]');await p.waitForTimeout(1100);
    await p.evaluate(()=>{window.__vt=0;const o=document.startViewTransition&&document.startViewTransition.bind(document);if(o)document.startViewTransition=f=>{window.__vt++;return o(f)}});
    await p.click('#setOv .set-pane [data-look-pal="neu"]');
    if(rm==='reduce'){await p.waitForTimeout(300);const v=await p.evaluate(()=>[window.__vt,document.documentElement.dataset.pal]);ok(v[0]===0&&v[1]==='neu',`關掉動態：直接換、沒有整頁淡過去 ${v}`)}
    else{await p.waitForTimeout(40);
      const box=await (await p.$('#setOv .set-pane [data-look-pal="sun"]')).boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);await p.waitForTimeout(500);
      const v=await p.evaluate(()=>[window.__vt,document.documentElement.dataset.pal,JSON.parse(localStorage.getItem('stustsa-ui')).pal]);
      ok(v[0]>=1,`換主題時整頁淡過去（View Transition ${v[0]} 次）`);ok(v[1]==='sun'&&v[2]==='sun',`淡的途中點暖陽：那一下照樣算數 ${v}`);
      const d=await p.evaluate(()=>getComputedStyle(document.documentElement,'::view-transition-old(root)').animationDuration);
      ok(d==='0.14s',`整頁淡過去 140ms（${d}）`)}
    await p.context().close()}

  /* 6. 總覽 home.html：讀同一個設定、吃同一組變數 */
  {const p=await mk({init:'{"pal":"sage","mode":"dark"}',page:'home.html',wait:3200});const s=await st(p);
    const card=await p.evaluate(()=>{const c=document.querySelector('.hm-tile');   /* ui-07：主頁的部門色塊（舊的 .card 卡片列已換掉） */const cs=getComputedStyle(c);return [cs.backgroundColor,cs.backgroundImage,cs.borderRadius]});
    ok(s.pal==='sage'&&s.theme==='dark'&&s.body==='rgb(13, 16, 14)',`home.html 讀同一個設定：${s.pal} ${s.theme} ${s.body}`);
    ok(card[0]==='rgb(23, 27, 24)'&&card[1]==='none'&&card[2]==='18px',`home.html 卡片是平面色塊（--blk、沒有漸層、圓角 18）：${card}`);
    ok(!p.errs.length,'home.html 沒有錯誤 '+p.errs);
    await p.context().close()}

  /* 7. 搜尋欄聚焦框：九組主題（淺深色）都看得到（outline 或 box-shadow 不是 none；以前跟 --blk-sh 串在一起，--blk-sh 是 none 時整條失效） */
  {const p=await mk({init:null});
    for(const mode of ['light','dark'])for(const k of PALS){
      const v=await p.evaluate(([k,mode])=>{const r=document.documentElement;r.dataset.pal=k;r.dataset.theme=mode;const q=document.querySelector('#boardQ');q.focus();
        const hs=q.closest('.dsearch'),cs=getComputedStyle(hs);const o=cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0;const r2=[o,cs.outlineStyle,cs.outlineWidth,cs.boxShadow];q.blur();return r2},[k,mode]);
      ok(v[0]||v[3]!=='none',`${k} ${mode} #boardQ 聚焦時看得到聚焦框：outline ${v[1]} ${v[2]}、box-shadow ${v[3].slice(0,40)}`)}
    await p.context().close()}

  /* 8. 淡的途中用滑鼠點工具列的 SVG 圖示：淡出結束後照樣換分頁、沒有錯誤（以前轉點擊時呼叫 svg 的 .click() 丟錯） */
  {const p=await mk({init:null});
    await p.waitForFunction(()=>{const s=document.getElementById('splash');return !s||getComputedStyle(s).display==='none'||getComputedStyle(s).pointerEvents==='none'},null,{timeout:15000}).catch(()=>{});   /* 開場畫面收掉之後才點得到工具列 */
    await p.evaluate(()=>{window.__pd=[];addEventListener('pointerdown',e=>window.__pd.push(e.target===document.documentElement?'root':e.target.tagName),true)});
    const fade=async pal=>{await p.evaluate(pal=>UI.set({pal}),pal);await p.waitForTimeout(30)};
    const pick=()=>p.evaluate(()=>{const b=[...document.querySelectorAll('#tabbar .tab')].find(b=>!b.classList.contains('on'));const r=b.querySelector('svg').getBoundingClientRect();return {k:b.dataset.tab,x:r.x+r.width/2,y:r.y+r.height/2}});
    const onTab=()=>p.evaluate(()=>document.querySelector('#tabbar .tab.on')?.dataset.tab);
    let t=await pick();const before=await onTab();
    const hit=await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e&&e.closest('svg')?'svg':e&&e.tagName},[t.x,t.y]);
    await fade('neu');await p.mouse.click(t.x,t.y);await p.waitForTimeout(700);
    let pd=await p.evaluate(()=>window.__pd.splice(0));
    ok(hit==='svg'&&pd[0]==='root',`點的位置是工具列的 SVG 圖示（${hit}），淡的途中點按落在 <html>（${pd}）`);
    ok(await onTab()===t.k&&before!==t.k,`淡的途中點工具列圖示：換到「${t.k}」分頁（現在 ${await onTab()}）`);
    ok(!p.errs.length,'淡的途中點 SVG 圖示：沒有錯誤 '+p.errs);
    /* 淡的途中按住拖走再放開：不算點擊 */
    t=await pick();const b2=await onTab();
    await fade('sun');await p.mouse.move(t.x,t.y);await p.mouse.down();await p.mouse.move(t.x,t.y-30,{steps:4});await p.mouse.move(t.x,t.y-60,{steps:4});await p.mouse.up();await p.waitForTimeout(700);
    pd=await p.evaluate(()=>window.__pd.splice(0));
    ok(pd[0]==='root'&&await onTab()===b2,`淡的途中拖曳：不觸發點擊（按下落在 ${pd}，分頁仍是 ${await onTab()}）`);
    /* 拖曳之後再正常點一下：照樣有效（held 沒有殘留把點擊轉到別處） */
    await p.mouse.click(t.x,t.y);await p.waitForTimeout(600);
    ok(await onTab()===t.k,`拖曳之後正常點一下：換到「${t.k}」（現在 ${await onTab()}）`);
    ok(!p.errs.length,'拖曳：沒有錯誤 '+p.errs);
    await p.context().close()}

  await b.close();
  console.log(`\n${passes} 通過、${fails} 失敗`);process.exitCode=fails?1:0;
})();
