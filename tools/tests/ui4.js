/* ui4：新介面第 4 步（部門內骨架：標題列、搜尋列、工具列、新增即時回報的浮動圓鈕；docs/DESIGN-next.md 第六節「部門內」、第五節、第十四節）。
   github 模式（data_test.json），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   1. 標題列：首頁鍵（連到 home.html、五邊形房子沒有門）、部門標誌、英文小標 STUDENT RIGHTS、部門名；登入後有眼睛鈕、通知鈕；通知鈕的數字＝逾期數
   2. 唯讀檢視（眼睛鈕）：出現「唯讀」標籤，新增圓鈕、通知鈕、設定鍵消失、沒有編輯鈕；再按一次回來。看板被鎖（沒有權限）：唯讀標籤、沒有眼睛鈕與通知鈕
   3. 換分頁、進出設定與通知：標題列是同一個節點
   4. 搜尋：輸入後內容換成分區結果（即時回報、完成紀錄、議題），點結果打開那一項；Esc、×、換分頁清掉；會長室的「會長室」分頁沒有搜尋列
   5. 工具列：412 寬在底部置中、離底 14、寬＝畫面寬減 24（最寬 480）、鏡片 56×30、設定鍵 62；1300 寬在左側距左 14、垂直置中、鏡片 50×44、只有圖示
   6. 新增圓鈕：只在即時回報分頁、沒有搜尋、沒有卡片打開時出現；點了新增一張；舊的「+ 新增即時回報」小字不在清單裡
   7. 圖示：按下工具列與標題列的圖示有動作（getAnimations）；沒有 title 屬性
   8. 關掉動態（reduced-motion）：按圖示、切換唯讀檢視、搜尋都沒有動畫
   ui-05（2026-11-17）：打開的卡片改看 lvOpen／dnOpen（live.js），膠囊是 #events .cp
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const box=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(innerHeight-r.bottom),r:Math.round(innerWidth-r.right),vis:!!e.offsetParent||getComputedStyle(e).position==='fixed'&&!e.hidden}},sel);
const vis=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&!e.hidden&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0},sel);
(async()=>{
  const {b,mk,login}=await c.setup();
  const p=await mk(1300,900,'light',false);

  /* 1. 標題列（登入前） */
  {const r=await p.evaluate(()=>{const h=document.querySelector('.dhead');return {keep:h&&h.hasAttribute('data-fx-keep'),home:(a=>a&&a.tagName==='A'&&a.getAttribute('href')==='home.html'&&a.getAttribute('aria-label')==='首頁'&&!!a.querySelector('svg .i-roof')&&!a.querySelector('.i-door'))(h.querySelector('.dh-home')),
      logo:(i=>i&&/dept\/icons\/favicon\.svg$/.test(i.getAttribute('src'))&&i.complete&&i.naturalWidth>0)(h.querySelector('.dh-logo')),en:$('#dhEn').textContent,enCs:(s=>[s.fontFamily.split(',')[0].replace(/"/g,''),s.fontSize,s.letterSpacing])(getComputedStyle($('#dhEn'))),
      name:$('#dhName').textContent,nameW:getComputedStyle($('#dhName')).fontWeight,eye:$('#peekBtn').hidden,noti:$('#notiBtn').hidden,ro:$('#dhRo').hidden,old:!!document.querySelector('.hero,.logo-box,.hero-search')}});
    ok(r.keep&&r.home&&r.logo,`標題列是保留節點、首頁鍵連到總覽（五邊形房子沒有門）、部門標誌是 dept/icons 的 SVG`);
    ok(r.en==='STUDENT RIGHTS'&&r.enCs[0]==='Jost'&&r.enCs[1]==='10.5px'&&Math.abs(parseFloat(r.enCs[2])-10.5*.22)<.1,`英文小標 ${r.en}（${r.enCs.join(' ')}）`);
    ok(r.name==='權益部'&&+r.nameW>=700,`部門名 ${r.name}（${r.nameW}）`);
    ok(r.eye&&!r.noti&&r.ro,`登入前（GitHub 模式，登入就能編輯）：沒有眼睛鈕、有通知鈕、沒有唯讀標籤`);
    ok(!r.old,'舊頁首（學生會 logo 置中、玻璃搜尋欄）已經拿掉');}
  await login(p);await p.waitForTimeout(500);
  {const r=await p.evaluate(()=>({eye:$('#peekBtn').hidden,noti:$('#notiBtn').hidden,ro:$('#dhRo').hidden,fab:!$('#addEvent').hidden}));
    ok(!r.eye&&!r.noti&&r.ro&&r.fab,`登入後：有眼睛鈕、通知鈕、新增圓鈕，沒有唯讀標籤`);}
  /* 通知鈕的數字＝逾期數 */
  {const r=await p.evaluate(()=>{const n0=notiLate();const ev=state.events.find(e=>!e.doneAt);ev.times=ev.times||[];ev.blocks=ev.blocks||[];
      ev.times.push({id:'tUi4',start:'2020-01-02 09:00',end:'',label:'過期',place:''});ev.blocks.push({id:'bUi4',text:'ui4 逾期',check:false,timeId:'tUi4'});
      ev.times.push({id:'tUi4b',start:'2999-01-02',end:'',label:'未來',place:''});ev.blocks.push({id:'bUi4b',text:'ui4 未來',check:false,timeId:'tUi4b'});render();
      const n1=notiLate(),t1=$('#notiBtn .noti-n').textContent;ev.blocks.find(b=>b.id==='bUi4').check=true;render();const n2=notiLate();
      ev.blocks=ev.blocks.filter(b=>!/^bUi4/.test(b.id));ev.times=ev.times.filter(t=>!/^tUi4/.test(t.id));render();
      return {n0,n1,t1,n2,label:$('#notiBtn').getAttribute('aria-label')}});
    ok(r.n1===r.n0+1&&r.t1===String(r.n1)&&r.n2===r.n0,`通知鈕數字＝逾期數：加一行過期沒勾的 ${r.n0}→${r.n1}（畫面 ${r.t1}），勾掉回到 ${r.n2}；未來的不算`);}

  /* 2. 唯讀檢視 */
  {await p.click('#peekBtn');await p.waitForTimeout(700);
    const r=await p.evaluate(()=>({ro:!$('#dhRo').hidden,pressed:$('#peekBtn').getAttribute('aria-pressed'),fab:$('#addEvent').hidden,noti:$('#notiBtn').hidden,gear:$('#setBtn').hidden,authed:document.body.classList.contains('authed'),can:canEdit(),
      edit:[...document.querySelectorAll('.card-edit-btn')].some(b=>b.offsetParent)}));
    ok(r.ro&&r.pressed==='true',`唯讀檢視：出現唯讀標籤、眼睛鈕按下`);
    ok(r.fab&&r.noti&&r.gear,`唯讀檢視：新增圓鈕、通知鈕、設定鍵都不出現（${r.fab} ${r.noti} ${r.gear}）`);
    ok(!r.authed&&!r.can&&!r.edit,`唯讀檢視：不能編輯、看不到編輯鈕`);
    await p.click('#peekBtn');await p.waitForTimeout(700);
    const s=await p.evaluate(()=>({ro:$('#dhRo').hidden,fab:!$('#addEvent').hidden,noti:!$('#notiBtn').hidden,gear:!$('#setBtn').hidden,can:canEdit()}));
    ok(s.ro&&s.fab&&s.noti&&s.gear&&s.can,`再按一次回到可以編輯：唯讀標籤消失，圓鈕、通知鈕、設定鍵回來`);
    await p.evaluate(()=>{state.locked=true;render()});await p.waitForTimeout(500);
    const l=await p.evaluate(()=>({ro:!$('#dhRo').hidden,eye:$('#peekBtn').hidden,noti:$('#notiBtn').hidden,fab:$('#addEvent').hidden,gear:!$('#setBtn').hidden}));
    await p.evaluate(()=>{state.locked=false;render()});await p.waitForTimeout(500);
    ok(l.ro&&l.eye&&l.noti&&l.fab&&l.gear,`看板被鎖（沒有編輯權限）：唯讀標籤、沒有眼睛鈕、通知鈕、新增圓鈕；設定鍵照舊（登入用）${JSON.stringify(l)}`);}

  /* 3. 換分頁：標題列同一個節點 */
  {await p.evaluate(()=>{document.querySelector('.dhead').__m=1});
    for(const t of ['progress','done','live']){await p.click(`#tabbar .tab[data-tab="${t}"]`);await p.waitForTimeout(700)}
    await p.click('#setBtn');await p.waitForTimeout(900);await p.click('#setBtn');await p.waitForTimeout(900);
    await p.click('#notiBtn');await p.waitForTimeout(900);await p.click('#notiClose');await p.waitForTimeout(900);
    ok(await p.evaluate(()=>document.querySelector('.dhead').__m===1&&document.querySelectorAll('.dhead').length===1),'換分頁、進出設定與通知：標題列是同一個節點');}

  /* 4. 搜尋 */
  {ok(await p.evaluate(()=>$('#boardQ').placeholder==='搜尋'&&!!$('#boardQ').getAttribute('aria-label')&&!document.querySelector('#dSearch .ds-x').offsetParent),'搜尋列：placeholder 只有「搜尋」、有 aria-label、沒有輸入時沒有 ×');
    const sb=await box(p,'#dSearch'),hb=await box(p,'.dhead');ok(sb.h===50&&sb.t>=hb.t+hb.h,`搜尋列高 50、在標題列下面（${sb.h}、${sb.t}／${hb.t+hb.h}）`);
    await p.fill('#boardQ','停車');await p.waitForTimeout(700);
    let r=await p.evaluate(()=>({lay:getComputedStyle(document.querySelector('.layout')).display,secs:[...document.querySelectorAll('#boardRes .dr-sec')].map(s=>s.dataset.key+':'+s.querySelectorAll('.dr-item').length),x:!!document.querySelector('#dSearch .ds-x').offsetParent,fab:$('#addEvent').hidden,mark:!!document.querySelector('#boardRes mark')}));
    ok(r.lay==='none'&&r.secs.join()==='live:1,done:2,issue:1'&&r.mark,`輸入「停車」：內容換成分區結果（${r.secs.join('、')}），符合的字加底色`);
    ok(r.x&&r.fab,'搜尋中：出現 ×、新增圓鈕不出現');
    /* 逐行內容、負責人、地點也找得到 */
    r=await p.evaluate(()=>{const ev=state.events.find(e=>!e.doneAt&&(e.blocks||[]).length);const line=ev.blocks[0].text.slice(0,4);
      const m=state.members[0];const old=ev.staff;ev.staff=[m.id];const pl=(ev.times||[]).find(t=>t.place);
      const f=q=>{$('#boardQ').value=q;$('#boardQ').dispatchEvent(new Event('input'));return [...document.querySelectorAll('#boardRes .dr-sec[data-key="live"] .dr-item b')].map(b=>b.textContent)};
      const a=f(line),bb=f(m.name),cc=pl?f(pl.place):[ev.name];ev.staff=old;return {name:ev.name,a,bb,cc,pl:!!pl}});
    ok(r.a.includes(r.name)&&r.bb.includes(r.name)&&r.cc.includes(r.name),`逐行內容、負責人、地點都找得到「${r.name}」${r.pl?'':'（測試資料沒有地點，略過）'}`);
    await p.fill('#boardQ','停車');await p.waitForTimeout(500);
    const want=await p.evaluate(()=>HS.items[0].id);
    await p.click('#boardRes .dr-sec[data-key="live"] .dr-item');await p.waitForTimeout(1300);
    r=await p.evaluate(id=>({q:$('#boardQ').value,lay:getComputedStyle(document.querySelector('.layout')).display,res:$('#boardRes').hidden,open:lvOpen===id||dnOpen===id}),want);
    ok(!r.q&&r.lay!=='none'&&r.res&&r.open,`點結果：清掉搜尋、回到看板並打開那一項（${JSON.stringify(r)}）`);
    await p.evaluate(()=>{lvOpen=null;dnOpen=null;render()});await p.waitForTimeout(500);
    await p.fill('#boardQ','議');await p.waitForTimeout(300);await p.press('#boardQ','Escape');await p.waitForTimeout(300);
    r=await p.evaluate(()=>[$('#boardQ').value,$('#boardRes').hidden,getComputedStyle(document.querySelector('.layout')).display]);
    ok(r[0]===''&&r[1]&&r[2]!=='none','Esc 清除搜尋');
    await p.fill('#boardQ','議');await p.waitForTimeout(300);await p.click('#dSearch .ds-x');await p.waitForTimeout(300);
    r=await p.evaluate(()=>[$('#boardQ').value,$('#boardRes').hidden,document.activeElement===$('#boardQ')]);
    ok(r[0]===''&&r[1]&&r[2],'× 清除搜尋、游標留在搜尋列');
    await p.fill('#boardQ','議');await p.waitForTimeout(300);await p.click('#tabbar .tab[data-tab="progress"]');await p.waitForTimeout(700);
    r=await p.evaluate(()=>[$('#boardQ').value,$('#boardRes').hidden,curSec]);
    ok(r[0]===''&&r[1]&&r[2]==='progress','換分頁清掉搜尋');
    await p.fill('#boardQ','zzzz找不到');await p.waitForTimeout(400);
    ok(await p.evaluate(()=>!!document.querySelector('#boardRes .dr-none')&&!document.querySelector('#boardRes .dr-item')),'找不到：只寫 0');
    await p.fill('#boardQ','');await p.click('#tabbar .tab[data-tab="live"]');await p.waitForTimeout(700);}

  /* 6. 新增圓鈕（桌面） */
  {const r=await p.evaluate(()=>({old:!!document.querySelector('#events .add-row,#events #addEvent'),fab:!$('#addEvent').hidden,lbl:$('#addEvent').getAttribute('aria-label'),bg:getComputedStyle($('#addEvent')).backgroundColor,pri:getComputedStyle(document.body).getPropertyValue('--pri').trim(),sh:getComputedStyle($('#addEvent')).boxShadow}));
    const fb=await box(p,'#addEvent');
    ok(!r.old&&r.fab&&r.lbl==='新增即時回報',`即時回報：右下角圓鈕（aria-label ${r.lbl}），清單裡沒有舊的「+ 新增即時回報」`);
    ok(fb.w===60&&fb.h===60&&fb.r<80&&fb.b<=40&&r.sh!=='none',`圓鈕 60×60、右下角（右 ${fb.r}、下 ${fb.b}）、有陰影`);
    await p.click('#tabbar .tab[data-tab="progress"]');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>$('#addEvent').hidden),'進度分頁：圓鈕不出現');
    await p.click('#tabbar .tab[data-tab="live"]');await p.waitForTimeout(700);
    await p.click('#events .cp');await p.waitForTimeout(1000);
    ok(await p.evaluate(()=>$('#addEvent').hidden),'有卡片打開（右側詳情）：圓鈕不出現');
    await p.evaluate(()=>{lvOpen=null;dnOpen=null;render()});await p.waitForTimeout(700);
    const n0=await p.evaluate(()=>state.events.length);
    await p.click('#addEvent');await p.waitForTimeout(900);
    const s=await p.evaluate(()=>({n:state.events.length,editing,fab:$('#addEvent').hidden}));
    ok(s.n===n0+1&&s.editing&&s.fab,`點圓鈕：新增一張並開始編輯（${n0}→${s.n}），編輯中圓鈕不出現`);
    await p.evaluate(()=>cancelEdit());await p.waitForTimeout(800);}

  /* 7. 圖示動作、沒有 title */
  {const sels=['#tabbar .tab[data-tab="progress"]','#tabbar .tab[data-tab="done"]','#tabbar .tab[data-tab="live"]','#setBtn','.dhead .dh-home','#notiBtn'];
    const res=[];
    for(const s of sels){await p.dispatchEvent(s,'pointerdown',{pointerType:'touch',isPrimary:true});await p.waitForTimeout(80);
      res.push(await p.evaluate(s=>{const h=document.querySelector(s);return h.getAnimations({subtree:true}).filter(a=>/^ico/.test(a.animationName||'')&&a.playState==='running').map(a=>a.animationName).join('+')},s))}
    for(const s of sels)await p.dispatchEvent(s,'pointerup',{pointerType:'touch',isPrimary:true});   /* 放開（設定鍵按下時會放大 4px） */
    ok(res.every(Boolean),`按下圖示當下就開始動作：${res.join('、')}`);
    const want={0:/icoGrow/,1:/icoDraw/,2:/icoPop.*icoWave|icoWave.*icoPop/,3:/icoK1.*icoK2|icoK2.*icoK1/,4:/icoRoof/,5:/icoBell/};
    ok(res.every((r,i)=>want[i].test(r)),'進度三條線、完成紀錄打勾、即時回報圓點與波紋、設定滑鈕、首頁整顆跳、通知鈴鐺搖');
    const t=await p.evaluate(()=>{const h=document.querySelector('#tabbar .tab[data-tab="progress"]');const a=h.getAnimations({subtree:true}).filter(a=>a.animationName==='icoGrow');render();renderTabbar();const a2=h.getAnimations({subtree:true}).filter(a=>a.animationName==='icoGrow');return a.length>0&&a2.length===a.length&&a2.every((x,i)=>x===a[i])});
    ok(t,'重畫不打斷正在播的圖示動作');
    await p.waitForTimeout(2000);
    ok(await p.evaluate(()=>!document.querySelector('[title]')),'畫面上沒有 title 屬性');}

  /* 5. 工具列位置與尺寸 */
  {const tb=await box(p,'#tabbar'),ln=await box(p,'#tabbar .tb-lens'),g=await box(p,'#setBtn');
    const lab=await p.evaluate(()=>[...document.querySelectorAll('#tabbar .tab-l')].every(l=>getComputedStyle(l).position==='absolute'&&getComputedStyle(l).clipPath==='inset(50%)'));
    ok(tb.l===14&&Math.abs(tb.t+tb.h/2-450)<=1,`1300：左側距左 14（${tb.l}）、垂直置中（${tb.t+tb.h/2}）`);
    ok(ln.w===50&&ln.h===44&&g.w===62&&g.h===62&&lab,`1300：鏡片 50×44（${ln.w}×${ln.h}）、設定鍵 62（${g.w}×${g.h}）、只有圖示（文字只給讀屏：${lab}）`);
    const sh=await p.evaluate(()=>getComputedStyle(document.querySelector('#tabbar .tb-main')).boxShadow);
    ok(/0px 0px 0px 1px/.test(sh)&&(sh.match(/rgba?\(/g)||[]).length>=2,`工具列帶陰影加一圈 1px 細線（${sh.slice(0,60)}）`);
    const lit=await p.evaluate(()=>{const t=document.querySelector('#tabbar .tab.lit .tab-ind');return t&&getComputedStyle(t).color===getComputedStyle(document.body).getPropertyValue('--pri-ink').trim().replace(/^#(..)(..)(..)$/,(m,a,b,c)=>`rgb(${parseInt(a,16)}, ${parseInt(b,16)}, ${parseInt(c,16)})`)});
    ok(lit,'選中那一格的圖示反白（--pri-ink）');}
  {const c2=await c.setup();const q=await c2.mk(412,860,'light',true);   /* 另開一份資料（剛才那份已經建立身分，共用的登入流程只會建立新身分） */
    const tb=await box(q,'#tabbar'),ln=await box(q,'#tabbar .tb-lens'),g=await box(q,'#setBtn');
    ok(tb.b===14&&Math.abs(tb.l-tb.r)<=1&&tb.w===412-24,`412：底部置中、離底 14（${tb.b}）、寬＝畫面寬減 24（${tb.w}）`);
    ok(ln.w===56&&ln.h===30&&g.w===62&&g.h===62,`412：鏡片 56×30（${ln.w}×${ln.h}）、設定鍵 62×62（${g.w}×${g.h}）`);
    const txt=await q.evaluate(()=>[...document.querySelectorAll('#tabbar .tab')].map(t=>t.classList.contains('lit')+':'+getComputedStyle(t.querySelector('.tab-l')).opacity));
    ok(txt.filter(x=>x.startsWith('true:1')).length===1&&txt.filter(x=>x.startsWith('false')).every(x=>x.endsWith(':0')),`412：只有鏡片那一格顯示文字（${txt.join(' ')}）`);
    await q.setViewportSize({width:700,height:860});await q.waitForTimeout(500);
    const t7=await box(q,'#tabbar');ok(t7.w===480&&t7.b===14,`700：寬上限 480（${t7.w}）`);
    await q.setViewportSize({width:412,height:860});await q.waitForTimeout(500);
    /* 手機的新增圓鈕在工具列上方 */
    await c2.login(q);await q.waitForTimeout(500);
    const fb=await box(q,'#addEvent'),tb2=await box(q,'#tabbar');
    ok(fb.w===60&&fb.t+fb.h<=tb2.t&&fb.r<=30,`412：新增圓鈕在工具列上方（圓鈕底 ${fb.t+fb.h}、工具列頂 ${tb2.t}）`);
    /* 拖過兩端：整條列偏移最多 4px；移動時依速度拉伸最多兩成 */
    const lb=await box(q,'#tabbar .tb-lens');
    await q.evaluate(()=>{window.__mx={off:0,sc:1};const main=document.querySelector('#tabbar .tb-main'),lens=document.querySelector('#tabbar .tb-lens');
      const f=()=>{const m=/translateX\(([-\d.]+)px\)/.exec(main.style.transform);if(m)window.__mx.off=Math.max(window.__mx.off,Math.abs(+m[1]));const s=/scale\(([\d.]+),/.exec(lens.style.transform);if(s)window.__mx.sc=Math.max(window.__mx.sc,+s[1]);if(window.__mx.on!==false)requestAnimationFrame(f)};f()});
    const x0=lb.l+lb.w/2,y0=lb.t+lb.h/2;
    await q.evaluate(([x,y])=>{const m=document.querySelector('#tabbar .tb-main'),t0=document.elementFromPoint(x,y);const ev=(t,x)=>(t==='pointerdown'?t0:m).dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:7,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:t==='pointerup'?0:1}));
      return new Promise(res=>{ev('pointerdown',x);let i=0;const st=()=>{i++;ev('pointermove',x-i*25);if(i<12)setTimeout(st,16);else setTimeout(()=>{ev('pointerup',x-i*25);res()},30)};setTimeout(st,30)})},[x0,y0]);
    await q.waitForTimeout(900);
    const mx=await q.evaluate(()=>{window.__mx.on=false;return window.__mx});
    ok(mx.off>0.5&&mx.off<=4.01,`拖過左端：整條列偏移最多 4px（${mx.off.toFixed(2)}）`);
    await c2.b.close()}

  /* 會長室的「會長室」分頁沒有搜尋列 */
  {const q=await (async()=>{c.q='?d=president';const x=await mk(412,860,'light',true);c.q='';return x})();
    const a=await vis(q,'#dSearch');await q.evaluate(()=>setSection('ext',{instant:true}));await q.waitForTimeout(400);const bb=await vis(q,'#dSearch');
    const en=await q.evaluate(()=>$('#dhEn').textContent);
    ok(a&&!bb&&en==='PRESIDENT',`會長室：即時回報有搜尋列、自己的分頁沒有（${a} ${bb}），英文小標 ${en}`);
    await q.context().close()}
  {c.q='?d=fruit';const q=await mk(412,860,'light',true);c.q='';
    ok(await q.evaluate(()=>$('#dhEn').textContent===''&&$('#dhEn').hidden&&$('#dhName').textContent==='水果部'),'對照表上沒有的部門（水果部）：不放英文小標');
    await q.context().close()}

  /* 8. 關掉動態 */
  {const ctx=await b.newContext({viewport:{width:412,height:860},reducedMotion:'reduce',hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    const q=await ctx.newPage();await q.goto('http://127.0.0.1:8300/index.html');await q.waitForTimeout(1800);
    await q.evaluate(()=>{window.__an=[];const o=Element.prototype.animate;Element.prototype.animate=function(k,opt){window.__an.push(this.className);return o.call(this,k,opt)}});
    for(const s of ['#tabbar .tab[data-tab="progress"]','#setBtn','#notiBtn']){await q.dispatchEvent(s,'pointerdown',{pointerType:'touch',isPrimary:true});await q.waitForTimeout(60)}
    const icoN=await q.evaluate(()=>document.getAnimations().filter(a=>/^ico/.test(a.animationName||'')).length);
    await q.evaluate(()=>{roView=false;$('#boardQ').value='停車';$('#boardQ').dispatchEvent(new Event('input'));$('#boardQ').value='';$('#boardQ').dispatchEvent(new Event('input'));render()});
    const r=await q.evaluate(()=>({an:window.__an.length,run:document.getAnimations().filter(a=>a.playState==='running'&&!(a instanceof CSSTransition)).length}));
    ok(icoN===0&&r.an===0&&r.run===0,`關掉動態：圖示沒有動作（${icoN}）、搜尋與重畫沒有動畫（${r.an}、${r.run}）`);
    await ctx.close()}

  ok(!p.errs.length,'沒有錯誤'+(p.errs.length?'：'+p.errs.slice(0,3).join(' | '):''));
  await b.close();
  console.log(`\n通過 ${passes}，失敗 ${fails}`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
