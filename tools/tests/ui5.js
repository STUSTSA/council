/* ui5：新介面第 5 步（即時回報；docs/DESIGN-next.md 第七節、第五節「容器轉化」、第十三～十五節）。
   github 模式（data_test.json），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   1. 膠囊清單：一筆一顆、高 54；標了報告的排在上面、紅字「報告」、一條細線隔開
   2. 卡片（寬螢幕 1300：左邊清單、右邊卡片）：三排（燈號、名稱｜上一張／下一張、報告｜狀態、負責人、最後更新）、底部工具列（母議題＋六顆）
   3. 時間線：圓點 11px、相鄰時間行的細線、逾期紅字、地點靠右、折行不跑到圓點下面；點圓點＝核取資料改變（存檔後遠端也改了）
   4. 核取行：勾了文字變淡加刪除線
   5. Keep 式編輯：點一行原位編輯；點外面＝存檔（已儲存＋復原）；再點外面＝收回；Esc＝存檔、再 Esc＝收回；編輯中鎖整頁捲動；復原
   6. 上一張／下一張：換卡片、舊內容的分身滑出、工具列不動；到頭變淡
   7. 時間頁：選一段用方向鍵、數字調整；人頁只有負責人；母議題自製選單
   8. 拖到角落：拖到另一顆上＝換位置（存 order）；右上角＝完成（doneAt、彩帶）；左上角＝刪除確認（有時間標記再確認一次）
   9. 音效開關關閉時不建立 AudioContext；開著時建立
   10. reduced-motion：完成時沒有彩帶
   11. 唯讀（唯讀檢視）：沒有工具列、報告鈕，不能勾、不能點一行進編輯、不能拖、不放大
   12. 完成紀錄：同一套卡片、唯讀、狀態「完成」、完成日
   13. 跳脫：名稱、一行、地點含 <img onerror> 不執行
   14. 手機 412：卡片全螢幕（從膠囊長出來）、返回鍵存檔並縮回、系統返回先關卡片
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const live=p=>p.evaluate(()=>liveOrder().map(e=>e.id));
const outside=async p=>{await p.mouse.click(60,860);await p.waitForTimeout(700)};   /* 1300 寬：左下角空白（工具列下面） */
/* 給一張卡片加上測試用的逐行內容：過期的時間、未來的時間（有地點、很長的名稱）、核取、文字 */
const seed=(p,id)=>p.evaluate(id=>{const ev=state.events.find(e=>e.id===id);
  ev.times=[{id:'tA',label:'過期的事',start:'2020-01-02T09:00',end:'',place:'',toIssue:false},{id:'tB',label:'未來的事',start:'2999-01-02T10:00',end:'',place:'六宿交誼廳',toIssue:false}];
  ev.blocks=[{id:'bA',text:'過期的事',check:false,timeId:'tA'},{id:'bB',text:'未來的事'.repeat(14),check:false,timeId:'tB'},{id:'bC',text:'要勾的事',check:false,timeId:null},{id:'bD',text:'一般文字',check:null,timeId:null}];
  ev.desc=StoreMap.descOf(ev.blocks);render()},id);
(async()=>{
  let {b,mk,login,remote}=await c.setup();
  const p=await mk(1300,900,'light',false);
  await login(p);await p.waitForTimeout(400);
  let ids=await live(p);

  /* 1. 膠囊清單 */
  {await p.evaluate(id=>{state.events.find(e=>e.id===id).report=true;render()},ids[2]);await p.waitForTimeout(500);
    const r=await p.evaluate(()=>{const cps=[...document.querySelectorAll('#events .cp')],kids=[...document.querySelector('#events .cps').children];
      return {h:cps.map(x=>Math.round(x.getBoundingClientRect().height)),first:cps[0].dataset.cp,rp:cps[0].querySelector('.cp-rp')?.textContent,rpC:getComputedStyle(cps[0].querySelector('.cp-rp')).color,
        late:(()=>{const s=document.createElement('span');s.style.color='var(--late)';document.body.append(s);const v=getComputedStyle(s).color;s.remove();return v})(),
        sep:kids.findIndex(x=>x.classList.contains('sepr')),sepH:(x=>x&&x.getBoundingClientRect().height)(document.querySelector('#events .sepr')),rad:getComputedStyle(cps[1]).borderRadius,bg:getComputedStyle(cps[1]).backgroundImage}});
    ok(r.h.every(h=>h===54),`膠囊高 54（${r.h.join(',')}）`);
    ok(r.first===ids[2]&&r.rp==='報告'&&r.rpC===r.late,`標了報告的排第一、右邊紅字「報告」（${r.rpC}）`);
    ok(r.sep===1&&r.sepH===1,`報告與其他之間一條 1px 細線（位置 ${r.sep}）`);
    ok(r.bg==='none',`膠囊是平面色塊（沒有漸層）`);
    await p.evaluate(id=>{state.events.find(e=>e.id===id).report=false;render()},ids[2]);await p.waitForTimeout(400);ids=await live(p);}

  /* 2. 卡片三排 */
  await seed(p,ids[0]);
  await p.click(`#events .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(900);
  {const r=await p.evaluate(()=>{const lc=document.querySelector('#evDetail .lc'),y=s=>{const e=lc.querySelector(s);return e?Math.round(e.getBoundingClientRect().top):null};
      return {split:$('#liveMD').classList.contains('split'),sel:!!document.querySelector('#events .cp.sel'),dot:y('.lc-head .live-dot')!==null,title:lc.querySelector('.lc-title').textContent,
        r1:y('.lc-title'),r2:[y('.lc-tri[data-lcstep="-1"]'),y('.lc-tri[data-lcstep="1"]'),y('.lc-rep')],r3:y('.lc-meta .ev-st'),st:lc.querySelector('.lc-meta .ev-st').textContent,
        back:!!lc.querySelector('[data-lcback]'),tools:[...lc.querySelectorAll('.lc-tl [data-lctool]')].map(x=>x.dataset.lctool).join(','),pa:!!lc.querySelector('.lc-tools .lc-pa'),
        prevDis:lc.querySelector('.lc-tri[data-lcstep="-1"]').disabled,tri:!!lc.querySelector('.lc-tri svg path[fill="currentColor"]'),status:lc.querySelector('.lc-save [role=status]')!==null,
        listW:Math.round($('#events').getBoundingClientRect().width),cardX:Math.round(lc.getBoundingClientRect().left)}});
    ok(r.split&&r.sel&&r.cardX>r.listW,`1300：左邊膠囊清單（${r.listW}）、右邊卡片，打開的膠囊有框`);
    ok(r.dot&&r.r1!==null&&r.r2.every(v=>v!==null&&v>r.r1)&&r.r3>r.r2[0],`三排：燈號＋名稱 → 上一張／下一張＋報告 → 狀態「${r.st}」（${r.r1} / ${r.r2.join(',')} / ${r.r3}）`);
    ok(!r.back&&r.prevDis&&r.tri,`寬螢幕沒有返回鍵；第一張的上一張變淡不能按；三角是實心`);
    ok(r.pa&&r.tools==='text,staff,time,place,check,link'&&r.status,`底部工具列：母議題＋文字、人、時間、地點、核取、超連結；儲存回饋 role=status`);}

  /* 3. 時間線 */
  {const r=await p.evaluate(()=>{const lc=document.querySelector('#evDetail .lc'),tm=[...lc.querySelectorAll('.ln.tm')],d=tm[0].querySelector('.ln-dot'),bf=getComputedStyle(d,'::before'),af=getComputedStyle(tm[0],'::after'),af2=getComputedStyle(tm[1],'::after');
      const tx=tm[1].querySelector('.tx'),txR=tx.getBoundingClientRect(),dR=tm[1].querySelector('.ln-dot').getBoundingClientRect(),pl=tm[1].querySelector('.pl'),late=tm[0].querySelector('.tmc'),fut=tm[1].querySelector('.tmc');
      const L=(()=>{const s=document.createElement('span');s.style.color='var(--late)';document.body.append(s);const v=getComputedStyle(s).color;s.remove();return v})();
      return {n:tm.length,dot:[bf.width,bf.height],line:[af.content,af.width],line2:af2.content,lateC:getComputedStyle(late).color,L,futC:getComputedStyle(fut).color,bgTmc:getComputedStyle(late).backgroundColor,
        wrap:txR.height>30,txLeft:txR.left,dotRight:dR.right,plR:Math.round(lc.getBoundingClientRect().right-pl.getBoundingClientRect().right),plC:getComputedStyle(pl).color,mut:getComputedStyle(lc.querySelector('.lc-meta')).color}});
    ok(r.n===2&&r.dot[0]==='11px'&&r.dot[1]==='11px',`時間行左邊圓點 11px（${r.dot}）`);
    ok(r.line[0]!=='none'&&r.line[1]==='1.5px'&&r.line2==='none',`相鄰的時間行用 1.5px 細線串起來（最後一行沒有）`);
    ok(r.lateC===r.L&&r.futC!==r.L&&r.bgTmc==='rgba(0, 0, 0, 0)',`逾期的時間紅字、未逾期的不紅、時間沒有色塊`);
    ok(r.wrap&&r.txLeft>=r.dotRight,`長名稱折行時不跑到圓點下面（文字左緣 ${Math.round(r.txLeft)} ≥ 圓點右緣 ${Math.round(r.dotRight)}）`);
    ok(r.plC===r.mut&&r.plR<60,`地點靠右、次要色`);}
  {await p.click('#evDetail .ln.tm .ln-dot[data-kpck="bA"]');await p.waitForTimeout(600);
    const r=await p.evaluate(id=>({ed:editing,ck:state.events.find(e=>e.id===id).blocks.find(b=>b.id==='bA').check,aria:document.querySelector('#evDetail .ln-dot[data-kpck="bA"]').getAttribute('aria-checked'),
      fill:getComputedStyle(document.querySelector('#evDetail .ln-dot[data-kpck="bA"]'),'::before').backgroundColor,late:document.querySelector('#evDetail [data-blk="bA"] .tmc').classList.contains('late')}),ids[0]);
    ok(r.ed&&r.ck===true&&r.aria==='true'&&r.fill!=='rgba(0, 0, 0, 0)'&&!r.late,`點圓點：進入編輯、這一行的核取變成完成（實心、不再紅字）`);
    await outside(p);
    const rm=remote().events.find(e=>e.id===ids[0]);
    ok(rm&&rm.blocks&&rm.blocks.find(b=>b.id==='bA').check===true,`點外面存檔：遠端資料這一行 check=true`);}

  /* 4. 核取行 */
  {await p.click('#evDetail [data-blk="bC"] .ln-ck input');await p.waitForTimeout(500);await outside(p);
    const r=await p.evaluate(()=>{const t=document.querySelector('#evDetail [data-blk="bC"] .tx'),cs=getComputedStyle(t);return {line:cs.textDecorationLine,c:cs.color,mut:getComputedStyle(document.querySelector('#evDetail .lc-meta')).color,box:getComputedStyle(document.querySelector('#evDetail [data-blk="bC"] input')).appearance}});
    ok(r.line==='line-through'&&r.c===r.mut&&r.box==='none',`核取行：自製方形勾選框，勾了文字變淡加刪除線`);}

  /* 5. Keep 式編輯 */
  {await p.click('#evDetail [data-blk="bD"] .tx');await p.waitForTimeout(500);
    const a=await p.evaluate(()=>({ed:editing,foc:document.activeElement&&document.activeElement.dataset.kptx,lock:document.body.classList.contains('lc-lock'),ov:getComputedStyle($('#pageMain')).overflowY,
      btns:[...document.querySelectorAll('#evDetail .lc button')].map(b=>b.textContent.trim()).filter(t=>/儲存|取消|編輯/.test(t))}));
    ok(a.ed&&a.foc==='bD',`點一行＝原位進入編輯，游標在那一行`);
    ok(a.lock&&a.ov==='hidden',`寬螢幕編輯中鎖住整頁捲動`);
    ok(!a.btns.length,`沒有儲存、取消、編輯鈕（${a.btns.join(',')}）`);
    await p.keyboard.type('X');await outside(p);
    const s=await p.evaluate(()=>({ed:editing,open:lvOpen,st:$('#evDetail .lc-save [role=status]')?.textContent,undo:!!$('#evDetail [data-kpundo]'),lock:document.body.classList.contains('lc-lock')}));
    ok(!s.ed&&s.open===ids[0]&&s.st==='已儲存'&&s.undo&&!s.lock,`點外面＝存檔並離開編輯：卡片還開著、「已儲存」＋「復原」`);
    ok(remote().events.find(e=>e.id===ids[0]).blocks.find(b=>b.id==='bD').text==='一般文字X',`遠端存到修改`);
    await p.click('#evDetail [data-kpundo]');await p.waitForTimeout(900);
    ok(remote().events.find(e=>e.id===ids[0]).blocks.find(b=>b.id==='bD').text==='一般文字',`復原：存回修改前的內容`);
    await outside(p);
    ok(await p.evaluate(()=>!lvOpen&&$('#evDetail').hidden&&!$('#liveMD').classList.contains('split')),`再點一次外面＝卡片收回`);
    await p.click(`#events .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(800);
    await p.click('#evDetail [data-blk="bD"] .tx');await p.waitForTimeout(400);await p.keyboard.type('Y');await p.keyboard.press('Escape');await p.waitForTimeout(900);
    const e1=await p.evaluate(()=>({ed:editing,open:lvOpen,st:$('#evDetail .lc-save [role=status]')?.textContent}));
    ok(!e1.ed&&e1.open===ids[0]&&e1.st==='已儲存',`Esc＝跟點外面一樣存檔`);
    await p.keyboard.press('Escape');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>!lvOpen),`再按 Esc＝卡片收回`);
    /* 名稱空白：請填名稱、留在編輯 */
    await p.click(`#events .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(800);await p.click('#evDetail .lc-title');await p.waitForTimeout(400);
    await p.fill('#evDetail [data-kptitle]','');await outside(p);
    const n=await p.evaluate(()=>({ed:editing,msg:$('#evDetail .lc-save [role=status]').textContent}));
    ok(n.ed&&n.msg==='請填名稱',`名稱空白：「請填名稱」、留在編輯`);
    await p.fill('#evDetail [data-kptitle]','停車場公告');await p.keyboard.press('Enter');await p.waitForTimeout(300);
    /* Enter 新增一行（種類跟上一行）、空行 Backspace 刪掉 */
    await p.click('#evDetail [data-kptx="bC"]');await p.keyboard.press('End');await p.keyboard.press('Enter');await p.waitForTimeout(300);
    const en=await p.evaluate(id=>{const ev=state.events.find(e=>e.id===id),i=ev.blocks.findIndex(b=>b.id==='bC');return {n:ev.blocks.length,nx:ev.blocks[i+1].check,foc:document.activeElement.dataset.kptx===ev.blocks[i+1].id}},ids[0]);
    await p.keyboard.press('Backspace');await p.waitForTimeout(300);
    const bs=await p.evaluate(id=>state.events.find(e=>e.id===id).blocks.length,ids[0]);
    ok(en.n===5&&en.nx===false&&en.foc&&bs===4,`Enter 在下面新增一行（跟上一行一樣是核取）、空行 Backspace 刪掉`);
    await outside(p);}

  /* 6. 上一張／下一張 */
  {const r0=await p.evaluate(()=>!!lvOpen);if(!r0){await p.click(`#events .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(800)}
    await p.evaluate(()=>{window.__tools=document.querySelector('#evDetail .lc-tools');window.__ghost=0;new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('lc-in-ghost'))window.__ghost++}))).observe(document.body,{subtree:true,childList:true})});
    await p.click('#evDetail .lc-tri[data-lcstep="1"]');await p.waitForTimeout(150);
    const m=await p.evaluate(()=>({g:window.__ghost,anim:document.querySelector('#evDetail .lc-in').getAnimations().length}));
    await p.waitForTimeout(700);
    const r=await p.evaluate(()=>({open:lvOpen,title:$('#evDetail .lc-title').textContent,prev:$('#evDetail .lc-tri[data-lcstep="-1"]').disabled,toolsY:Math.round($('#evDetail .lc-tools').getBoundingClientRect().bottom)}));
    ok(r.open===ids[1]&&!r.prev,`下一張：換成第二張（${r.title}），上一張可以按`);
    ok(m.g===1&&m.anim>0,`舊內容的分身滑出、新內容滑進（分身 ${m.g}、動畫 ${m.anim}）`);
    await p.click('#evDetail .lc-tri[data-lcstep="-1"]');await p.waitForTimeout(800);
    ok(await p.evaluate(()=>lvOpen)===ids[0],`上一張：回到第一張`);}

  /* 7. 時間頁、人頁、母議題選單 */
  {await p.click('#evDetail [data-lctool="time"]');await p.waitForTimeout(600);
    const a=await p.evaluate(()=>({ed:editing,te:document.querySelectorAll('#evDetail .te').length,on:$('#evDetail [data-lctool="time"]').classList.contains('on'),paned:$('#evDetail .lc-tl').classList.contains('paned'),
      sc:getComputedStyle($('#evDetail [data-lctool="time"]')).transform,dim:getComputedStyle($('#evDetail [data-lctool="text"]')).color,ink:getComputedStyle($('#evDetail [data-lctool="time"]')).color}));
    ok(a.ed&&a.te===2&&a.on&&a.paned&&a.sc!=='none'&&a.dim!==a.ink,`時間頁：卡片內容換成每個時間行一組，時間圖示放大、其他變淡`);
    const d0=await p.evaluate(()=>state.events.find(e=>e.id===lvOpen).times.find(t=>t.id==='tB').start);
    await p.click('#evDetail .te[data-te="tB"] [data-sg="d"]');await p.keyboard.press('ArrowUp');await p.waitForTimeout(200);
    await p.click('#evDetail .te[data-te="tB"] [data-sg="h"]');await p.keyboard.type('14');await p.waitForTimeout(200);
    const d1=await p.evaluate(()=>state.events.find(e=>e.id===lvOpen).times.find(t=>t.id==='tB').start);
    ok(d0==='2999-01-02T10:00'&&d1==='2999-01-03T14:00',`點一段再用方向鍵、數字調整（${d0} → ${d1}）`);
    await p.click('#evDetail [data-lctool="staff"]');await p.waitForTimeout(500);
    const s=await p.evaluate(()=>({h:[...document.querySelectorAll('#evDetail .lc-body h4')].map(x=>x.textContent)}));
    ok(s.h.join()==='負責人',`人頁只有「負責人」（${s.h.join()}）`);
    await p.click('#evDetail [data-lcpa]');await p.waitForTimeout(400);
    const po=await p.evaluate(()=>({pop:!!$('#evDetail .lc-pop[role=listbox]'),opts:document.querySelectorAll('#evDetail .lc-pop [role=option]').length,native:!!document.querySelector('#evDetail select')}));
    ok(po.pop&&po.opts>1&&!po.native,`母議題：自製選單（${po.opts} 項，沒有原生下拉）`);
    const iss=await p.evaluate(()=>{const b=document.querySelectorAll('#evDetail .lc-pop [role=option]')[1];return b.dataset.lcpar});
    await p.click(`#evDetail .lc-pop [data-lcpar="${iss}"]`);await p.waitForTimeout(300);
    ok(await p.evaluate(()=>state.events.find(e=>e.id===lvOpen).issueId)===iss,`選了母議題就寫進卡片`);
    await outside(p);await outside(p);}

  /* 8. 拖到角落：換位置 */
  ids=await live(p);
  const drag=async(from,x,y,hold)=>{const r=await p.evaluate(id=>{const e=document.querySelector(`#events .cp[data-cp="${id}"]`).getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2}},from);
    await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x+10,r.y+4,{steps:3});await p.mouse.move(x,y,{steps:14});if(hold)await hold();await p.mouse.up();await p.waitForTimeout(900)};
  {const t=await p.evaluate(id=>{const e=document.querySelector(`#events .cp[data-cp="${id}"]`).getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2}},ids[2]);
    await drag(ids[0],t.x,t.y);
    const n=await live(p),rem=remote().events.filter(e=>!e.doneAt).map(e=>e.id);
    ok(n.indexOf(ids[0])>n.indexOf(ids[2])&&rem.indexOf(ids[0])>rem.indexOf(ids[2])&&!(await p.evaluate(()=>!!lvOpen)),`拖到另一顆上放開＝換位置，直接存（${n.indexOf(ids[0])}）`);}
  /* 刪除：左上角，先確認；有時間標記再確認一次 */
  {ids=await live(p);const tid=await p.evaluate(()=>{const ev=state.events.find(e=>!e.doneAt&&e.blocks.some(b=>b.timeId));return ev.id});
    let tilt=null;await drag(tid,30,30,async()=>{tilt=await p.evaluate(id=>{const e=document.querySelector(`#events .cp[data-cp="${id}"]`);return {t:e.style.transform,bg:e.style.backgroundColor,hot:$('#lzDel').classList.contains('hot')}},tid)});
    ok(/rotate\(-/.test(tilt.t)&&/late/.test(tilt.bg)&&tilt.hot,`靠近左上角：往左歪、染上 --late、角落放大`);
    const q1=await p.evaluate(()=>$('#dlg[open] #dlgForm>b')?.textContent||'');
    await p.click('#dlg[open] [data-act=delete]');await p.waitForTimeout(500);
    const q2=await p.evaluate(()=>$('#dlg[open] #dlgForm>b')?.textContent||'');
    await p.click('#dlg[open] [data-act=cancel]');await p.waitForTimeout(500);
    ok(/^刪除「/.test(q1)&&/時間標記/.test(q2)&&(await live(p)).includes(tid),`拖到左上角：先確認「${q1}」，有時間標記再確認一次「${q2}」；取消就不刪`);}
  /* 完成：右上角（音效關閉時不建立 AudioContext） */
  {ids=await live(p);
    let tilt=null;await drag(ids[1],1290,10,async()=>{tilt=await p.evaluate(id=>{const e=document.querySelector(`#events .cp[data-cp="${id}"]`);return {t:e.style.transform,bg:e.style.backgroundColor,hot:$('#lzOk').classList.contains('hot')}},ids[1])});
    const f=await p.evaluate(()=>({fete:!!document.querySelector('.fete')}));
    await p.waitForTimeout(800);
    const r=await p.evaluate(id=>({done:state.events.find(e=>e.id===id).doneAt,inList:liveOrder().some(e=>e.id===id)}),ids[1]);
    ok(/rotate\(\d/.test(tilt.t)&&/ok/.test(tilt.bg)&&tilt.hot,`靠近右上角：往右歪、染上 --ok、角落放大`);
    ok(r.done&&!r.inList&&remote().events.find(e=>e.id===ids[1]).doneAt===r.done,`拖到右上角＝完成（doneAt ${r.done}，已存）`);
    ok(f.fete,`完成：彩帶與光暈`);
    await p.waitForTimeout(1600);}

  /* 11. 唯讀檢視 */
  {ids=await live(p);await seed(p,ids[0]);await p.evaluate(()=>{roView=true;render()});await p.waitForTimeout(500);
    await p.evaluate(id=>{const ev=state.events.find(e=>e.id===id);ev.report=true;render()},ids[0]);
    await p.click(`#events .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(800);
    const r=await p.evaluate(()=>{const lc=$('#evDetail .lc');const d=lc.querySelector('.ln-dot[data-kpck]'),ck=lc.querySelector('.ln-ck input');
      return {ro:lc.classList.contains('ro'),tools:!!lc.querySelector('.lc-tools'),repBtn:!!lc.querySelector('.lc-rep'),repTxt:lc.querySelector('.lc-rp')?.textContent,
        dotDis:d?d.disabled:null,dotPe:d?getComputedStyle(d).pointerEvents:null,ckDis:ck?ck.disabled:null,go:!!lc.querySelector('[data-kpgo]'),cur:getComputedStyle(lc.querySelector('.ln')).cursor,step:!lc.querySelector('.lc-tri[data-lcstep="1"]').disabled}});
    ok(r.ro&&!r.tools&&!r.repBtn&&r.repTxt==='報告',`唯讀：沒有底部工具列、沒有報告鈕（標了報告只顯示紅字）`);
    ok(r.dotDis===true&&r.dotPe==='none'&&r.ckDis===true&&!r.go&&r.cur!=='text',`唯讀：圓點、核取框不能按、不接受指標；一行不能點進編輯`);
    ok(r.step,`唯讀：可以上下切換`);
    await p.click('#evDetail .ln');await p.waitForTimeout(300);
    ok(!(await p.evaluate(()=>editing)),`唯讀：點一行不會進入編輯`);
    await p.keyboard.press('Escape');await p.waitForTimeout(600);
    await drag(ids[1],1290,10);
    ok(await p.evaluate(id=>!state.events.find(e=>e.id===id).doneAt&&!document.querySelector('.cp.drag'),ids[1]),`唯讀：不能拖`);
    await p.evaluate(id=>{roView=false;state.events.find(e=>e.id===id).report=false;render()},ids[0]);await p.waitForTimeout(400);}

  /* 12. 完成紀錄 */
  {await p.click('#tabbar .tab[data-tab="done"]');await p.waitForTimeout(800);
    const did=await p.evaluate(()=>{const e=state.events.find(e=>e.doneAt&&e.blocks&&e.blocks.length);return e.id});
    await p.click(`#doneList .cp[data-cp="${did}"]`);await p.waitForTimeout(900);
    const r=await p.evaluate(()=>{const lc=$('#doneDetail .lc');return lc&&{ro:lc.classList.contains('ro'),k:lc.dataset.lc,st:lc.querySelector('.lc-meta .ev-st').textContent,date:/\d/.test(lc.querySelector('.lc-meta .num')?.textContent||''),
      lines:lc.querySelectorAll('.lc-body .ln').length,tools:!!lc.querySelector('.lc-tools'),go:!!lc.querySelector('[data-kpgo]'),nav:lc.querySelectorAll('.lc-tri').length,op:getComputedStyle(document.querySelector('#doneList .cp:not(.sel)')).opacity}});
    ok(r&&r.ro&&r.k==='done'&&r.st==='完成'&&r.date&&r.lines>0&&!r.tools&&!r.go&&r.nav===2,`完成紀錄：同一套卡片唯讀，狀態「完成」、完成日、逐行內容（${r&&r.lines} 行）、上一張／下一張、沒有工具列`);
    ok(r&&r.op==='0.5',`完成紀錄的膠囊半透明`);
    await p.keyboard.press('Escape');await p.waitForTimeout(500);
    await p.click('#tabbar .tab[data-tab="live"]');await p.waitForTimeout(800);}

  /* 13. 跳脫 */
  {ids=await live(p);const X='<img src=x onerror="window.__x=1">';
    await p.evaluate(([id,X])=>{const ev=state.events.find(e=>e.id===id);ev.name=X;ev.blocks=[{id:'bX',text:X,check:false,timeId:'tX'},{id:'bY',text:X,check:false,timeId:null}];ev.times=[{id:'tX',label:X,start:'2999-01-01T09:00',end:'',place:X,toIssue:false}];ev.links=[{id:'lX',name:X,url:'javascript:alert(1)',color:'#123456'}];render()},[ids[0],X]);
    await p.click(`#events .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(800);
    await p.click('#evDetail [data-blk="bY"] .tx');await p.waitForTimeout(400);
    await p.click('#evDetail [data-lctool="time"]');await p.waitForTimeout(400);await p.click('#evDetail [data-lctool="place"]');await p.waitForTimeout(400);
    const r=await p.evaluate(()=>({x:window.__x,img:document.querySelectorAll('#events img,#evDetail img').length,href:[...document.querySelectorAll('#evDetail a')].map(a=>a.getAttribute('href'))}));
    ok(r.x===undefined&&r.img===0,`跳脫：名稱、一行、時間、地點含 <img onerror> 都不執行（檢視、編輯、時間頁、地點頁）`);
    await p.keyboard.press('Escape');await p.waitForTimeout(300);
    await p.evaluate(()=>{editing=false;cardEdit="";kp=null;state=normalize(JSON.parse(snapshot));lvOpen=null;render()});await p.waitForTimeout(300);}
  ok(!p.errs.length,`1300 沒有錯誤（${p.errs.slice(0,3).join(' | ')}）`);
  await p.close();await b.close();

  /* 9、10. 音效開關、reduced-motion（新的一頁：AudioContext 在開頁前就換成會計數的版本） */
  ({b,mk,login,remote}=await c.setup());
  {const q=await mk(1300,900,'light',false);await q.emulateMedia({reducedMotion:'reduce'});
    await q.evaluate(()=>{window.__ac=0;const A=window.AudioContext;window.AudioContext=class extends A{constructor(...a){super(...a);window.__ac++}};UI.set({sound:false})});
    await login(q);await q.waitForTimeout(300);
    const done=async id=>{const r=await q.evaluate(id=>document.querySelector(`#events .cp[data-cp="${id}"]`).getBoundingClientRect(),id);
      await q.mouse.move(r.x+r.width/2,r.y+r.height/2);await q.mouse.down();await q.mouse.move(r.x+r.width/2+10,r.y+r.height/2,{steps:3});await q.mouse.move(1290,10,{steps:10});await q.mouse.up();await q.waitForTimeout(150);
      const f=await q.evaluate(()=>!!document.querySelector('.fete'));await q.waitForTimeout(900);return {f,done:!!(await q.evaluate(id=>state.events.find(e=>e.id===id).doneAt,id)),ac:await q.evaluate(()=>window.__ac)}};
    let id=(await live(q))[0];const a=await done(id);
    ok(a.done&&a.ac===0,`音效關閉：完成時沒有建立 AudioContext（${a.ac}）`);
    ok(a.done&&!a.f,`reduced-motion：完成直接到結果、沒有彩帶`);
    await q.evaluate(()=>UI.set({sound:true}));id=(await live(q))[0];const s2=await done(id);
    ok(s2.done&&s2.ac===1,`音效開著：完成時建立 AudioContext 出聲（${s2.ac}）`);
    await q.close();}
  await b.close();

  /* 14. 手機 412 */
  ({b,mk,login,remote}=await c.setup());
  {const q=await mk(412,860,'light',true);await login(q);await q.waitForTimeout(400);ids=await live(q);
    await q.evaluate(()=>{window.__grow=0;const o=Element.prototype.animate;Element.prototype.animate=function(k,o2){if(this.classList&&this.classList.contains('lc')&&k&&k[0]&&k[0].clipPath)window.__grow++;return o.call(this,k,o2)}});
    await q.click(`#events .cp[data-cp="${ids[0]}"]`);await q.waitForTimeout(900);
    const r=await q.evaluate(()=>{const lc=$('#lcFull .lc'),b=lc&&lc.getBoundingClientRect();return lc&&{full:lc.classList.contains('full'),w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),back:!!lc.querySelector('[data-lcback]'),
      hist:history.state&&history.state.bl,grow:window.__grow,away:getComputedStyle(document.querySelector('#events .cp.away')).visibility,tb:getComputedStyle(lc.querySelector('.lc-tools')).position,toolsB:Math.round(innerHeight-lc.querySelector('.lc-tools').getBoundingClientRect().bottom)}});
    ok(r&&r.full&&r.w===412&&r.h===860&&r.top===0&&r.back,`412：卡片全螢幕、左上返回鍵`);
    ok(r&&r.grow===1&&r.away==='hidden',`412：外框從膠囊的位置展開（clip-path），那顆膠囊留位置`);
    ok(r&&r.toolsB<=1,`412：底部工具列固定在最下面（離底 ${r&&r.toolsB}）`);
    ok(r&&r.hist==='card',`412：打開卡片推一筆瀏覽紀錄`);
    await q.click('#lcFull [data-kpgo]:not([data-kpgo="title"])');await q.waitForTimeout(500);await q.keyboard.type('Z');
    await q.click('#lcFull [data-lcback]');await q.waitForTimeout(1300);
    const s=await q.evaluate(()=>({ed:editing,open:lvOpen,full:!$('#lcFull')||$('#lcFull').hidden,hist:history.state&&history.state.bl}));
    ok(!s.ed&&!s.open&&s.full&&s.hist!=='card',`412：返回鍵存檔並縮回膠囊`);
    ok(/Z$/.test(remote().events.find(e=>e.id===ids[0]).desc||''),`412：返回鍵存到修改`);
    await q.click(`#events .cp[data-cp="${ids[1]}"]`);await q.waitForTimeout(800);
    await q.goBack();await q.waitForTimeout(900);
    const g=await q.evaluate(()=>({open:lvOpen,url:location.pathname}));
    ok(!g.open&&/index\.html$/.test(g.url),`412：系統返回先關卡片、不離開網站`);
    ok(!q.errs.length,`412 沒有錯誤（${q.errs.slice(0,3).join(' | ')}）`);
    await q.close();}
  await b.close();
  console.log(`\n${passes} 項通過，${fails} 項失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
