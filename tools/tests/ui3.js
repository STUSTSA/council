/* ui3：新介面第 3 步（畫面更新機制：同畫面原位更新、換畫面保留標題列）。github 模式（data_test.json），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   驗證方式照 docs/DESIGN-next.md 第五節「畫面更新」：
   1. 即時回報卡片原位編輯中打字，同時重畫（render、別張卡片的資料更新）：activeElement 是同一個節點、selectionStart 不變、值不變
   2. 捲動到中間後重畫（即時回報、完成紀錄）：scrollTop 不變
   3. 重畫後沒變的膠囊是同一個 DOM 節點（重畫前掛 JS 屬性），沒有加上進場的 class、沒有新的 Web Animation（document.getAnimations() 前後比對）
   4. 換分頁（即時回報→進度→完成紀錄→設定→通知→回來）：頁首是同一個節點、頁首不參加進場動畫；設定、通知的標題列沿用時也不參加
   5. 進場動畫（Element.animate 從透明開始的那些）的目標裡沒有 SVG 或圖示零件
   6. 編輯中按卡片上的按鈕（+ 一行、核取框）：按下那一下輸入欄不失焦，放開後照規則把游標移到新的一行／那一行
   7. 正在播的圖示動作不會被重畫打斷（同一個 Animation、時間接著走）
   8. 同一頁重畫時位置變了的滑到新位置（FLIP，同一個節點）、新的由下浮現、不見的留分身淡出
   9. 設定清單、外觀合併頁、通知頁重畫：沒變的節點留著、外觀的分段切換不重建
   10. 關掉動態（reduced-motion）時換分頁、開關設定、重畫都沒有動畫
   11. 審查 P2-1：外觀的深淺色分段切換重畫兩次後仍有 .glass；執行時的 go-yes／go-no 重畫不拿掉
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 記下每一次 Element.animate（目標、第一格的透明度），測「進場動畫挑了誰」 */
const HOOK=()=>{window.__an=[];const o=Element.prototype.animate;Element.prototype.animate=function(k,opt){try{const f=Array.isArray(k)?k[0]:null;window.__an.push({el:this,in:!!(f&&f.opacity!==undefined&&+f.opacity===0),t:performance.now()})}catch(_){}return o.call(this,k,opt)}};
(async()=>{
  const {b,mk,login}=await c.setup();
  const p=await mk(1300,900,'light',false);
  await p.evaluate(HOOK);
  await login(p);
  await p.evaluate(()=>{setSection('live',{instant:true});render()});await p.waitForTimeout(600);
  const live=await p.evaluate(()=>state.events.filter(e=>!e.doneAt).map(e=>e.id));
  const id=live[0];

  /* 3. 沒變的膠囊是同一個節點、沒有新的動畫 */
  {const r=await p.evaluate(()=>{document.querySelectorAll('#events .ev,#events .ev summary,#events .live-dot,#doneList .ev,#gantt .g-row').forEach(el=>el.__m=1);
      const before=new Set(document.getAnimations()),cls=[...document.querySelectorAll('#events .ev')].map(e=>e.className).join('|');window.__an=[];
      render();
      const same=[...document.querySelectorAll('#events .ev,#events .ev summary,#events .live-dot,#doneList .ev,#gantt .g-row')].every(el=>el.__m===1);
      const fresh=document.getAnimations().filter(a=>!before.has(a));
      return {same,n:document.querySelectorAll('#events .ev').length,fresh:fresh.length,an:window.__an.length,cls:cls===[...document.querySelectorAll('#events .ev')].map(e=>e.className).join('|')}});
    ok(r.same&&r.n>0,`重畫後膠囊、燈號、完成紀錄、甘特圖列都是同一個節點（${r.n} 顆膠囊）`);
    ok(r.fresh===0&&r.an===0,`重畫後沒有新的動畫（getAnimations 多 ${r.fresh}、animate() ${r.an} 次）`);
    ok(r.cls,'重畫後膠囊的 class 沒變（沒有加上進場的 class）');}
  /* 別張卡片的資料變了：只有那一張變，其他同一個節點、沒有新的動畫 */
  {const r=await p.evaluate(([a,b])=>{document.querySelectorAll('#events .ev').forEach(el=>el.__m=1);const before=new Set(document.getAnimations());
      state.events.find(e=>e.id===b).name+='（改）';render();
      const others=[...document.querySelectorAll('#events .ev')].filter(el=>el.dataset.ev!==b);
      const fresh=document.getAnimations().filter(x=>!before.has(x)&&x.effect&&x.effect.target&&others.some(o=>o.contains(x.effect.target)));
      return {same:[...document.querySelectorAll('#events .ev')].every(el=>el.__m===1),txt:document.querySelector(`#events .ev[data-ev="${b}"] summary b`).textContent,fresh:fresh.length}},[id,live[1]]);
    ok(r.same&&/（改）$/.test(r.txt)&&r.fresh===0,`別張卡片的名稱改了：那一張原位改字（${r.txt}）、所有膠囊同一個節點、其他膠囊沒有新的動畫（${r.fresh}）`);}

  /* 1. 原位編輯中打字，同時重畫 */
  await p.evaluate(i=>{openEv.add(i);render()},id);await p.waitForTimeout(700);
  const bid=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,id);
  await p.click(`.ev[data-ev="${id}"] [data-kpgo="${bid}"]`);await p.waitForTimeout(500);
  await p.keyboard.press('End');await p.keyboard.type('打字中');await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');
  {const r=await p.evaluate(([b2])=>{const a=document.activeElement;a.__m=1;const s=[a.selectionStart,a.selectionEnd,a.value];
      render();const r1=document.activeElement===a&&a.isConnected;
      state.events.find(e=>e.id===b2).name+='！';render();   /* 別張卡片的資料更新（像輪詢、別人存檔進來） */
      const a2=document.activeElement;return {tag:a.dataset.kptx!==undefined,r1,same:a2===a&&a2.__m===1,s,s2:[a2.selectionStart,a2.selectionEnd,a2.value]}},[live[1]]);
    ok(r.tag&&r.r1&&r.same,'原位編輯中重畫：activeElement 是同一個節點（render 兩次，第二次另一張卡片的資料變了）');
    ok(r.s[0]===r.s2[0]&&r.s[1]===r.s2[1]&&r.s[0]===r.s[2].length-2,`選取範圍不變（${r.s.slice(0,2)} → ${r.s2.slice(0,2)}）`);
    ok(r.s[2]===r.s2[2]&&/打字中$/.test(r.s2[2]),`值不變（${r.s2[2]}）`);}
  /* 6. 編輯中按卡片上的按鈕：按下那一下不失焦；放開後照規則轉移 */
  {const btn=await p.$(`.ev[data-ev="${id}"] [data-kpadd]`);const bb=await btn.boundingBox();
    await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await p.mouse.down();
    const mid=await p.evaluate(()=>document.activeElement.__m===1);
    await p.mouse.up();await p.waitForTimeout(400);
    const aft=await p.evaluate(i=>{const a=document.activeElement,ev=state.events.find(e=>e.id===i);return {kp:a.dataset.kptx,last:ev.blocks[ev.blocks.length-1].id}},id);
    ok(mid,'編輯中按下「+ 一行」的那一下：輸入欄沒有失焦');
    ok(aft.kp===aft.last,'放開後：游標移到新的一行（照原本的規則）');
    await p.keyboard.type('第二行');
    const ck=await p.evaluate(i=>{const ev=state.events.find(e=>e.id===i);return ev.blocks[0].id},id);
    const cb=await (await p.$(`.ev[data-ev="${id}"] .kp-line[data-blk="${ck}"] .kp-type .csel-btn`)).boundingBox();
    await p.click(`.ev[data-ev="${id}"] .kp-line[data-blk="${ck}"] .kp-type .csel-btn`);await p.waitForTimeout(250);
    await p.click(`.ev[data-ev="${id}"] .kp-line[data-blk="${ck}"] .csel-opt[data-v="check"]`);await p.waitForTimeout(400);
    await p.click(`.ev[data-ev="${id}"] .kp-line:last-child .kp-tx`);await p.waitForTimeout(150);
    const ckb=await (await p.$(`.ev[data-ev="${id}"] .kp-line[data-blk="${ck}"] [data-kpck]`)).boundingBox();
    await p.mouse.move(ckb.x+ckb.width/2,ckb.y+ckb.height/2);await p.mouse.down();
    const mid2=await p.evaluate(()=>{const a=document.activeElement;return a.matches('.kp-tx')&&a.closest('.kp-line:last-child')!==null});
    await p.mouse.up();await p.waitForTimeout(300);
    const aft2=await p.evaluate(([i,k])=>({kp:document.activeElement.dataset.kptx,on:state.events.find(e=>e.id===i).blocks.find(b=>b.id===k).check}),[id,ck]);
    ok(mid2,'編輯中按下核取框的那一下：輸入欄沒有失焦');
    ok(aft2.kp===ck&&aft2.on===true,`放開後：勾起來、游標到那一行（照原本的規則；${aft2.kp===ck}、${aft2.on}）`);}
  /* 8. FLIP：同一頁重畫時位置變了的滑過去（同一個節點）、新的浮現、不見的留分身 */
  await p.click('#evH');await p.waitForTimeout(2600);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(400);
  {const r=await p.evaluate(()=>{const evs=()=>[...document.querySelectorAll('#events .events>.ev')];evs().forEach(el=>el.__m=1);
      const ids=evs().map(e=>e.dataset.ev),a=state.events.findIndex(e=>e.id===ids[0]),z=state.events.findIndex(e=>e.id===ids[ids.length-1]);
      [state.events[a],state.events[z]]=[state.events[z],state.events[a]];window.__an=[];render();
      const now=evs(),moved=[now[0],now[now.length-1]];
      return {same:now.every(el=>el.__m===1),order:now[0].dataset.ev===ids[ids.length-1],slid:moved.every(el=>window.__an.some(x=>x.el===el&&!x.in))}});
    ok(r.same&&r.order,'換順序後膠囊都是同一個節點（搬動，不重建）');
    ok(r.slid,'換順序：頭尾兩顆從舊位置滑到新位置（FLIP）');}
  {const r=await p.evaluate(()=>{const ev={...JSON.parse(JSON.stringify(state.events.find(e=>!e.doneAt))),id:'ui3new',name:'新的一筆'};state.events.push(ev);window.__an=[];render();
      const el=document.querySelector('#events .ev[data-ev="ui3new"]'),rise=window.__an.some(x=>x.el===el&&x.in);
      const n0=document.body.children.length;state.events=state.events.filter(e=>e.id!=='ui3new');render();
      const g=[...document.body.children].slice(n0-1).find(x=>x.matches&&x.matches('.ev')&&x.getAttribute('aria-hidden')==='true');
      return {rise,ghost:!!g,gone:!document.querySelector('#events .ev[data-ev="ui3new"]')}});
    ok(r.rise,'新的一筆由下浮現（從透明開始）');ok(r.ghost&&r.gone,'不見的一筆：清單裡拿掉、原位留一個分身淡出');}

  /* 7. 正在播的圖示動作不會被重畫打斷（右側詳情的「收起」鈕） */
  await p.evaluate(i=>{selEv=i;render()},live[2]);await p.waitForTimeout(800);
  {await p.dispatchEvent('#evDetail [data-mdclose]','pointerdown',{pointerType:'mouse'});await p.waitForTimeout(150);
    const r=await p.evaluate(()=>{const btn=document.querySelector('#evDetail [data-mdclose]');btn.__m=1;
      const a=btn.getAnimations({subtree:true}).filter(x=>/^ico/.test(x.animationName||''));const t0=a.map(x=>x.currentTime);
      render();const btn2=document.querySelector('#evDetail [data-mdclose]');const a2=btn2.getAnimations({subtree:true}).filter(x=>/^ico/.test(x.animationName||''));
      return {n:a.length,same:btn2.__m===1&&btn2.classList.contains('ico-on')&&a2.length===a.length&&a2.every((x,i)=>x===a[i]&&x.currentTime>=t0[i])}});
    ok(r.n>0&&r.same,`圖示正在播的動作重畫後是同一個動畫、時間接著走（${r.n} 個）`);}
  await p.evaluate(()=>{selEv=null;render()});await p.waitForTimeout(500);

  /* 4. 換分頁：頁首同一個節點、不參加進場動畫；5. 進場動畫的目標沒有 SVG 或圖示零件 */
  {await p.evaluate(()=>{document.querySelector('.hero').__m=1;window.__an=[]});
    const seq=[['tab','progress'],['tab','done'],['set'],['sub'],['unsub'],['unset'],['noti'],['unnoti'],['tab','live']];
    let topSame=true,setTopKept=true;
    for(const s of seq){
      if(s[0]==='tab')await p.click(`#tabbar .tab[data-tab="${s[1]}"]`);
      if(s[0]==='set'){await p.click('#setBtn');await p.waitForTimeout(1200);await p.evaluate(()=>{document.querySelector('#setOv .set-top').__m=1})}
      if(s[0]==='sub'){await p.click('#setOv [data-set="look"]')}
      if(s[0]==='unsub'){await p.evaluate(()=>paneClose())}
      if(s[0]==='unset'){setTopKept=await p.evaluate(()=>document.querySelector('#setOv .set-top').__m===1);await p.click('#setBtn')}
      if(s[0]==='noti')await p.click('#notiBtn');
      if(s[0]==='unnoti')await p.click('#notiClose');
      await p.waitForTimeout(1300);
      if(!(await p.evaluate(()=>document.querySelector('.hero').__m===1)))topSame=false;
    }
    const r=await p.evaluate(()=>{const top=[...document.querySelectorAll('.hero,#setOv .set-top,#setSub .set-top,#notiOv .anim-top')];
      const hit=window.__an.filter(x=>x.in&&top.some(t=>t.contains(x.el)));
      const svg=window.__an.filter(x=>x.in&&(x.el instanceof SVGElement||x.el.closest('svg,.ico,.logo')));
      return {n:window.__an.filter(x=>x.in).length,top:hit.map(x=>x.el.className&&x.el.className.baseVal!==undefined?x.el.className.baseVal:x.el.className),svg:svg.map(x=>x.el.tagName+'.'+(x.el.getAttribute('class')||'')),cur:curSec}});
    ok(topSame,'換分頁、進出設定與通知：頁首一直是同一個節點');
    ok(setTopKept,'設定頁的標題列在進出外觀子頁時是同一個節點');
    ok(r.n>0&&!r.top.length,`頁首與設定、通知的標題列不參加進場動畫（進場 ${r.n} 次，挑到標題列 ${r.top.length}：${r.top.join(',')}）`);
    ok(!r.svg.length,`進場動畫的目標裡沒有 SVG 或圖示零件（${r.svg.join(',')||'無'}）`);
    ok(r.cur==='live','回到即時回報');}
  /* 進場動畫的區塊挑選（換頁動畫 pieces）：從頁面上每一層找，看得到的容器裡沒有 svg、.ico */
  {const r=await p.evaluate(()=>{window.__an=[];return new Promise(res=>{openSettings().then(()=>setTimeout(()=>{const a=window.__an.filter(x=>x.in);closeSettings(true);res({n:a.length,svg:a.filter(x=>x.el instanceof SVGElement||x.el.closest('svg,.ico')).length,btn:a.filter(x=>x.el.closest('button')&&!x.el.matches('button')).length})},900))})});
    ok(r.n>0&&!r.svg&&!r.btn,`打開設定的進場：${r.n} 塊，沒有圖示零件、沒有按鈕裡面的東西`);}

  /* 9. 設定清單、外觀合併頁、通知頁重畫 */
  {await p.click('#setBtn');await p.waitForTimeout(1100);
    let r=await p.evaluate(()=>{document.querySelectorAll('#setOv .set-row').forEach(el=>el.__m=1);renderSettings();return [...document.querySelectorAll('#setOv .set-inner .set-row')].every(el=>el.__m===1)});
    ok(r,'設定清單重畫：每一列是同一個節點');
    await p.click('#setOv [data-set="look"]');await p.waitForTimeout(1000);
    r=await p.evaluate(()=>{const sg=document.querySelector('#setOv .set-pane .look-mode'),pal=document.querySelector('#setOv .set-pane .look-pal');sg.__m=1;pal.__m=1;
      const box=document.querySelector('#setOv .set-pane .set-hub');document.querySelector('#setOv .set-pane [data-look-pal="sage"]').click();
      renderSettings();const sg2=document.querySelector('#setOv .set-pane .look-mode');return {same:sg2===sg&&!!sg._seg&&document.querySelector('#setOv .set-pane .look-pal').__m===1,pal:document.documentElement.dataset.pal}});
    ok(r.same,'外觀合併頁：換主題、重畫後分段切換與主題按鈕是同一個節點');
    await p.evaluate(()=>{UI.set({pal:'fin'})});await p.click('#setOv [data-set="labels"]');await p.waitForTimeout(1100);
    /* 標籤（對話框表單 #dlgForm 原位更新）：按 Enter 新增後輸入欄清空、游標留著，已有的列是同一個節點 */
    r=await p.evaluate(()=>{const f=document.getElementById('dlgForm'),inp=f.querySelector('[data-newlbl]');if(!inp)return null;f.querySelectorAll('[data-lblname]').forEach(el=>el.__m=1);inp.__m=1;inp.focus();return state.labels.length});
    if(r!==null){await p.keyboard.type('ui3標籤');await p.keyboard.press('Enter');await p.waitForTimeout(300);
      const s=await p.evaluate(()=>{const f=document.getElementById('dlgForm'),a=document.activeElement;return {n:state.labels.length,has:state.labels.some(l=>l.name==='ui3標籤'),v:a.value,same:a.__m===1,rows:[...f.querySelectorAll('[data-lblname]')].filter(el=>el.__m===1).length}});
      ok(s.n===r+1&&s.has&&s.v===''&&s.same&&s.rows>=r,`標籤按 Enter 新增：多一個（${s.n}）、輸入欄清空且游標留著、原本的列是同一個節點（${s.rows}）`)}
    else ok(false,'標籤設定打不開');
    await p.evaluate(()=>closeSettings(true));await p.waitForTimeout(300);
    await p.click('#notiBtn');await p.waitForTimeout(1300);
    r=await p.evaluate(()=>{const els=[...document.querySelectorAll('#notiOv .noti-days,#notiOv .nd-card,#notiOv #notiCal,#notiOv .noti-cal')];els.forEach(el=>el.__m=1);const before=new Set(document.getAnimations());window.__an=[];
      renderNoti();render();return {same:els.length>2&&els.every(el=>el.isConnected&&el.__m===1),fresh:document.getAnimations().filter(a=>!before.has(a)&&a.playState==='running'&&!(a instanceof CSSTransition)).length,an:window.__an.length}});
    ok(r.same,'通知頁重畫：今日／明日卡片與月曆是同一個節點');
    ok(r.fresh===0&&r.an===0,`通知頁重畫：沒有新的動畫（${r.fresh}／${r.an}）`);
    await p.click('#notiClose');await p.waitForTimeout(900);}

  /* 2. 捲動到中間後重畫：scrollTop 不變（手機寬） */
  {const q=await mk(412,700,'dark',true);await q.evaluate(HOOK);
    await q.evaluate(()=>{state.events.filter(e=>!e.doneAt).forEach(e=>openEv.add(e.id));render()});await q.waitForTimeout(900);
    for(const sec of ['live','done']){
      await q.evaluate(s=>{setSection(s,{instant:true});if(s==='done')state.events.filter(e=>e.doneAt).slice(0,4).forEach(e=>openDone.add(e.id));render()},sec);await q.waitForTimeout(700);
      const r=await q.evaluate(()=>{const sc=document.getElementById('pageMain'),max=sc.scrollHeight-sc.clientHeight;sc.scrollTop=Math.round(max/2);const t=sc.scrollTop;
        render();const t1=sc.scrollTop;state.savedAt='2026-11-17 12:00';render();return {max,t,t1,t2:sc.scrollTop}});
      ok(r.max>100&&r.t>50&&r.t1===r.t&&r.t2===r.t,`${sec}：捲到中間（${r.t}／${r.max}）重畫後 scrollTop 不變（${r.t1}、${r.t2}）`);
    }
    await q.context().close()}

  /* 10. 關掉動態：換分頁、開關設定、重畫都沒有動畫 */
  {const ctx=await b.newContext({viewport:{width:412,height:800},reducedMotion:'reduce',hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.addInitScript(HOOK);const q=await ctx.newPage();await q.goto('http://127.0.0.1:8300/index.html');await q.waitForTimeout(1800);
    await q.evaluate(()=>{window.__an=[]});
    for(const t of ['progress','done','live']){await q.tap(`#tabbar .tab[data-tab="${t}"]`);await q.waitForTimeout(300)}
    await q.tap('#setBtn');await q.waitForTimeout(400);await q.tap('#setBtn');await q.waitForTimeout(400);
    await q.evaluate(()=>{const ev=state.events.filter(e=>!e.doneAt);[ev[0].name,ev[1].name]=[ev[1].name,ev[0].name];state.events.push({...JSON.parse(JSON.stringify(ev[0])),id:'rm1'});render();state.events=state.events.filter(e=>e.id!=='rm1');render()});
    const r=await q.evaluate(()=>({an:window.__an.length,run:document.getAnimations().filter(a=>a.playState==='running'&&!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length}));
    ok(r.an===0&&r.run===0,`關掉動態：沒有 animate() 動畫（${r.an}）、沒有在跑的程式動畫（${r.run}）`);
    await ctx.close()}

  /* 11. 審查 P2-1：外觀的深淺色分段切換重畫（合併頁 draw 的同一段 HTML）兩次後仍是平面色塊（.glass 寫在 HTML 裡，不靠執行時加）；
     卡片堆飛出去時加的 go-yes／go-no 是執行時的 class，重畫不拿掉 */
  {await p.click('#setBtn');await p.waitForTimeout(1100);await p.click('#setOv [data-set="look"]');await p.waitForTimeout(1000);
    const r=await p.evaluate(()=>{const box=document.querySelector('#setOv .set-pane .set-hub'),sg=box.querySelector('.look-mode'),g0=sg.classList.contains('glass');
      for(let i=0;i<2;i++){morphTo(box,'<b class="set-hub-t">外觀</b>'+lookHTML(false));lookMount(box)}
      const sg2=box.querySelector('.look-mode');
      const d=document.createElement('div');document.body.append(d);morphTo(d,'<div class="dk-card" data-dk="x">a</div>');d.firstChild.classList.add('go-yes');morphTo(d,'<div class="dk-card" data-dk="x">b</div>');const gy=d.firstChild.classList.contains('go-yes');d.remove();
      return {g0,same:sg2===sg,glass:sg2.classList.contains('glass'),gy}});
    ok(r.g0&&r.same&&r.glass,`外觀的分段切換重畫兩次後仍有 glass（重畫前 ${r.g0}、同一個節點 ${r.same}、重畫後 ${r.glass}）`);
    ok(r.gy,'卡片堆飛出去時的 go-yes 重畫後還在');
    await p.evaluate(()=>closeSettings(true));await p.waitForTimeout(400);}
  /* 12. 審查 P2-2：編輯中游標在一行的文字欄，點專員、標籤的勾選膠囊（label 包核取框）：勾起來，焦點留在原本那一欄（桌面滑鼠、手機觸控） */
  for(const [w,h,touch] of [[1300,900,false],[412,800,true]]){
    const s2=await c.setup(),q=await s2.mk(w,h,'light',touch);await s2.login(q);   /* 各自一份測試資料（第一頁登入時已經建了身分，同一份再登入一次的流程不同） */
    await q.evaluate(()=>{if(!state.labels.length)state.labels.push({id:'ui3lb',kind:LABEL_KINDS[0],name:'膠囊測試'});setSection('live',{instant:true});render()});await q.waitForTimeout(600);
    const eid=await q.evaluate(()=>{const ev=state.events.find(e=>!e.doneAt&&e.blocks&&e.blocks.length);openEv.add(ev.id);render();return ev.id});await q.waitForTimeout(700);
    const go=`.ev[data-ev="${eid}"] [data-kpgo]`;if(touch)await q.tap(go);else await q.click(go);await q.waitForTimeout(600);
    const tag=touch?'手機觸控':'桌面';
    for(const [f,nm] of [['staff','專員'],['labels','標籤']]){
      const sel=`.ev[data-ev="${eid}"] [data-kpf="${f}"] label.chip`;
      const pre=await q.evaluate(([e])=>{const a=document.activeElement;a.__k=1;return {tx:a.matches('.kp-tx'),n:document.querySelectorAll(`.ev[data-ev="${e}"] .kp [data-kpf] label.chip`).length}},[eid]);
      if(!(await q.$(sel))){ok(false,`${tag}：找不到${nm}膠囊`);continue}
      const b0=await q.evaluate(s=>document.querySelector(s+' input').checked,sel);
      if(touch)await q.tap(sel);else await q.click(sel);await q.waitForTimeout(350);
      const r=await q.evaluate(s=>{const a=document.activeElement;return {same:a.__k===1&&a.matches('.kp-tx'),on:document.querySelector(s+' input').checked,act:a.tagName+'.'+a.className}},sel);
      ok(pre.tx&&r.same&&r.on!==b0,`${tag}：游標在 .kp-tx 點${nm}膠囊後勾選變了（${r.on}）、activeElement 仍是同一個 .kp-tx（${r.act}）`);
    }
    ok(!q.errs.length,`${tag}：沒有錯誤`+(q.errs.length?'：'+q.errs.slice(0,3).join(' | '):''));
    await s2.b.close();
  }

  ok(!p.errs.length,'沒有錯誤'+(p.errs.length?'：'+p.errs.slice(0,3).join(' | '):''));
  await b.close();
  console.log(`\n通過 ${passes}，失敗 ${fails}`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
