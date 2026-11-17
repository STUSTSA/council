/* ui6：新介面第 6 步（通知與行事曆：部門內的一頁；docs/DESIGN-next.md 第九節、第五節「彈簧與回彈」、第十三、十四節）。
   github 模式（data_test.json），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   1. 通知鈕進到部門內的一頁：標題列同一個節點、鏡片不動、沒有搜尋列與新增圓鈕；返回四種：再按通知鈕、Esc、系統返回鍵、工具列分頁（到那個分頁）
   2. 今日／明日卡片：今日＝--pri 底；今日層開關（Esc）、只有「本來就要做」；點明日＝行事曆選到那一天
   3. 逾期卡片堆只列逾期（勾了的、還沒到的不列）；左滑延後（明天同一時刻、存檔）；右滑（改時間鈕）打開那張卡片的時間頁
   4. 海報月曆：週一開頭、選到的日期 40px --acc 圓、今天 --acc2 粗體、跨天細線與分層 9px；點日期清單換內容（舊的分身淡出）；月份選單 Esc 關、選月份
   5. 五類模式：會長室、「其他」勾了才讀那個部門（攔截請求計數，讀過不重讀）；活動、會議在 github 部門是空的、不讀；有 firestore 部門時讀 scope（用替身模組）
   6. 跳脫：事件名稱含 <img onerror>；公共版參數（calMount）；唯讀時沒有通知鈕、開著時變唯讀就回原分頁
   7. 關掉動態（reduced-motion）：進出、今日層、換日期、卡片堆都沒有程式動畫
   8. 412 寬：沒有橫捲、鏡片留在原分頁
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const XSS='<img src=x onerror="window.__xss=1">';
/* 測試用的時間：逾期三筆（一筆跨天）、勾了的過期一筆（不算）、今天晚上一筆、明天一筆、跨天兩筆（同一週撞在一起） */
const seed=p=>p.evaluate(X=>{const t=today(),e=state.events.find(x=>!x.doneAt);e.name='測試卡片';
  e.times=[{id:'tL1',label:'過期一',start:addDays(t,-3)+'T09:30',end:'',place:'會辦'},{id:'tL2',label:'過期二',start:addDays(t,-2),end:'',place:''},
    {id:'tL3',label:'跨天過期',start:addDays(t,-6),end:addDays(t,-1),place:''},{id:'tD',label:'勾了的',start:addDays(t,-4),end:'',place:''},
    {id:'tT',label:X,start:t+'T23:58',end:'',place:X},{id:'tM',label:'明天的事',start:addDays(t,1)+'T08:00',end:'',place:''},
    {id:'tS1',label:'跨天一',start:addDays(t,1),end:addDays(t,2),place:''}];
  e.blocks=[{id:'bL1',text:'過期一',check:false,timeId:'tL1'},{id:'bL2',text:'過期二',check:false,timeId:'tL2'},{id:'bL3',text:'跨天過期',check:false,timeId:'tL3'},
    {id:'bD',text:'勾了的',check:true,timeId:'tD'},{id:'bT',text:X,check:false,timeId:'tT'},{id:'bM',text:'明天的事',check:false,timeId:'tM'},{id:'bS1',text:'跨天一',check:false,timeId:'tS1'}];
  const f=state.events.filter(x=>!x.doneAt)[1];f.times=[{id:'tS2',label:'跨天二',start:addDays(t,1),end:addDays(t,2),place:''}];f.blocks=[{id:'bS2',text:'跨天二',check:false,timeId:'tS2'}];
  render();return e.id},XSS);
/* 別的部門的資料檔（會長室、行銷部）：今天各一件事 */
const other=(name,label)=>{const t=new Date(),d=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  return {schemaVersion:13,title:name,issues:[],weeks:[],labels:[],members:[],events:[{id:'o1',name:name+'的卡片',blocks:[{id:'ob',text:label,check:false,timeId:'ot'}],times:[{id:'ot',label,start:d+'T15:00',end:'',place:''}],staff:[],labels:[],links:[]}]}};
const noAnims=p=>p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length);
(async()=>{
  const {b,mk,login,st}=await c.setup();
  const p=await mk(1300,900,'light',false);
  const req=[];
  await p.route(/data-(president|marketing)\.json/,r=>{const u=r.request().url();req.push(u.match(/data-(\w+)\.json/)[1]);
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/president/.test(u)?other('會長室','會長行程'):other('行銷部','行銷活動'))})});
  await login(p);
  const evId=await seed(p);

  /* 1. 進到部門內的一頁、返回的四種方式 */
  {await p.click('#tabbar .tab[data-tab="progress"]');await p.waitForTimeout(700);
    const lens0=await p.evaluate(()=>{window.__h=document.querySelector('.dhead');const l=$('#tabbar .tb-lens').getBoundingClientRect();return [Math.round(l.top),Math.round(l.left)]});
    await p.click('#notiBtn');await p.waitForTimeout(900);
    const r=await p.evaluate(()=>{const l=$('#tabbar .tb-lens').getBoundingClientRect();return {open:notiOpen,cur:$('#notiPage').classList.contains('cur'),others:[...document.querySelectorAll('.layout>.sgroup.cur')].length,
      same:document.querySelector('.dhead')===window.__h,ov:!!document.querySelector('#notiOv,.set-ov.noti-ov'),search:$('#dSearch').hidden,fab:$('#addEvent').hidden,hist:history.state&&history.state.bl,
      pressed:$('#notiBtn').getAttribute('aria-pressed'),tab:$('#tabbar .tab.on').dataset.tab,lens:[Math.round(l.top),Math.round(l.left)],order:[...$('#notiPage').children].map(x=>x.className.split(' ')[0]).join(',')}});
    ok(r.open&&r.cur&&r.others===1&&!r.ov,`通知鈕進到部門內的一頁（#notiPage 是唯一顯示的一區、沒有全畫面疊層）`);
    ok(r.same,'標題列是同一個節點');
    ok(r.tab==='progress'&&JSON.stringify(r.lens)===JSON.stringify(lens0),`鏡片留在原分頁、不動（${JSON.stringify(lens0)} → ${JSON.stringify(r.lens)}）`);
    ok(r.search&&r.fab,'這一頁沒有搜尋列、沒有新增圓鈕');
    ok(r.hist==='noti'&&r.pressed==='true','推一筆瀏覽紀錄、通知鈕 aria-pressed');
    ok(r.order==='noti-days,nt-late,cal',`由上到下：今日／明日 → 逾期 → 行事曆（${r.order}）`);
    await p.click('#notiBtn');await p.waitForTimeout(800);
    ok(await p.evaluate(()=>!notiOpen&&curSec==='progress'&&$('.sgroup[data-sec=progress]').classList.contains('cur')&&!history.state),'再按通知鈕：回到原分頁（進度）');
    await p.click('#notiBtn');await p.waitForTimeout(700);await p.keyboard.press('Escape');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>!notiOpen&&curSec==='progress'),'Esc：回到原分頁');
    await p.click('#notiBtn');await p.waitForTimeout(700);await p.goBack();await p.waitForTimeout(700);
    ok(await p.evaluate(()=>!notiOpen&&curSec==='progress'&&location.pathname.endsWith('index.html')),'系統返回鍵：回到原分頁、沒有離開網站');
    await p.click('#notiBtn');await p.waitForTimeout(700);await p.click('#tabbar .tab[data-tab="progress"]');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>!notiOpen&&curSec==='progress'&&!history.state),'按工具列原本那一格：回到原分頁');
    await p.click('#notiBtn');await p.waitForTimeout(700);await p.click('#tabbar .tab[data-tab="live"]');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>!notiOpen&&curSec==='live'&&$('.sgroup[data-sec=live]').classList.contains('cur')&&!history.state),'按工具列別的分頁：離開這一頁、到那個分頁');}

  /* 2. 今日／明日、今日層 */
  {await p.click('#notiBtn');await p.waitForTimeout(900);
    const r=await p.evaluate(()=>{const cs=[...document.querySelectorAll('#notiPage .nd-card')],pri=getComputedStyle(document.documentElement).getPropertyValue('--pri').trim();
      const probe=document.createElement('i');probe.style.color=pri;document.body.append(probe);const pc=getComputedStyle(probe).color;probe.remove();
      return {n:cs.length,today:cs[0].classList.contains('today'),bg:getComputedStyle(cs[0]).backgroundColor,pc,rows:cs.map(c=>c.querySelectorAll('.nd-row').length),t2:cs[1].textContent}});
    ok(r.n===2&&r.today&&r.bg===r.pc,`兩張並排卡片，今日＝--pri 底（${r.bg} / ${r.pc}）`);
    ok(r.rows[0]===1&&r.rows[1]===3&&/明天的事/.test(r.t2),`今日 1 件、明日 3 件（${r.rows}）`);
    await p.click('#notiPage .nd-card.today');await p.waitForTimeout(1300);
    const t=await p.evaluate(()=>({open:todayOpen,vis:!$('#todayOv').hidden,secs:[...document.querySelectorAll('#todayOv .td-sec h3')].map(h=>h.textContent.replace(/\d+/g,'').trim()),rows:document.querySelectorAll('#todayOv .td-row').length,
      big:$('#todayOv .td-num').textContent==String(+today().slice(8)),close:!!$('#todayOv [data-tdclose]'),label:$('#todayOv .td-lab').textContent}));
    ok(t.open&&t.vis&&t.big&&t.close&&/今日/.test(t.label),'點今日：全螢幕今日層（大日期、今日、月份與星期、關閉鈕）');
    ok(t.secs.join()==='本來就要做'&&t.rows===1,`只有「本來就要做」一區（${t.secs}，${t.rows} 列），沒有「今天處理」`);
    await p.keyboard.press('Escape');await p.waitForTimeout(1300);
    ok(await p.evaluate(()=>!todayOpen&&$('#todayOv').hidden&&notiOpen&&$('#notiPage .nd-card.today').style.opacity===''),'Esc 關今日層（通知頁還在、卡片換回來）');
    await p.click('#notiPage .nd-card:not(.today)');await p.waitForTimeout(900);
    ok(await p.evaluate(()=>NOTI.day===addDays(today(),1)&&$('.pc-d.sel').dataset.calday===addDays(today(),1)&&/明天的事/.test($('.cal-list').textContent)),'點明日：行事曆選到那一天、清單是那一天');}

  /* 6a. 跳脫 */
  {const r=await p.evaluate(()=>({img:document.querySelectorAll('#notiPage img:not(.dh-logo),#todayOv img').length,x:window.__xss,txt:$('#notiPage .nd-card.today').textContent.includes('<img')}));
    ok(r.img===0&&!r.x&&r.txt,`事件名稱含 <img onerror>：照字面顯示、沒有產生元素（${JSON.stringify(r)}）`);}

  /* 3. 逾期卡片堆 */
  {const r=await p.evaluate(()=>({late:notiLate(),ids:[...document.querySelectorAll('#notiDeck .dk-card')].map(c=>c.dataset.dk),top:$('#notiDeck .dk-card[data-i="0"]').dataset.dk,n:$('.dk-n').textContent,badge:$('#notiBtn .noti-n').textContent}));
    ok(r.late===3&&r.ids.sort().join()==='tL1,tL2,tL3'&&r.n==='3'&&r.badge==='3',`只列逾期的三筆（勾了的、還沒到的不列）：${r.ids}，件數 ${r.n}、通知鈕 ${r.badge}`);
    ok(r.top==='tL3',`最早的在最上面（${r.top}）`);
    await p.evaluate(()=>$('#notiDeck').scrollIntoView({block:'center'}));await p.waitForTimeout(300);
    const bb=await (await p.$('#notiDeck .dk-card[data-i="0"]')).boundingBox();const n0=st.commits.length;
    await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await p.mouse.down();for(let i=1;i<=12;i++){await p.mouse.move(bb.x+bb.width/2-i*24,bb.y+bb.height/2+i);await p.waitForTimeout(16)}
    const stamp=await p.evaluate(()=>[getComputedStyle($('#notiDeck .dk-card[data-i="0"] .dk-stp.l')).opacity,getComputedStyle($('#notiDeck .dk-card[data-i="0"] .dk-stp.r')).opacity]);
    ok(+stamp[0]>.5&&+stamp[1]===0,`往左拖浮出「延後」（${stamp}）`);
    await p.mouse.up();await p.waitForTimeout(1600);
    const a=await p.evaluate(()=>{const t=state.events.flatMap(e=>e.times||[]).find(x=>x.id==='tL3');return {end:t.end,start:t.start,late:notiLate(),ids:[...document.querySelectorAll('#notiDeck .dk-card')].map(c=>c.dataset.dk).join()}});
    ok(a.end===await p.evaluate(()=>addDays(today(),1))&&a.late===2&&!/tL3/.test(a.ids),`左滑＝延後：跨天的結束日改成明天（${a.start}～${a.end}），從卡片堆拿掉`);
    ok(st.commits.length>n0,'延後有存檔');
    await p.click('[data-dkgo="l"]');await p.waitForTimeout(1600);
    const a2=await p.evaluate(()=>state.events.flatMap(e=>e.times||[]).find(x=>x.id==='tL1').start);
    ok(a2===await p.evaluate(()=>addDays(today(),1)+'T09:30'),`延後鈕：單天的整個搬到明天同一時刻（${a2}）`);
    await p.click('[data-dkgo="r"]');await p.waitForTimeout(1600);
    const rr=await p.evaluate(()=>({open:notiOpen,sec:curSec,lv:lvOpen,ed:editing,pane:lvPane,tid:lvSeg&&lvSeg.tid,foc:document.activeElement&&document.activeElement.matches('.lc-ed .sg.on')}));
    ok(!rr.open&&rr.sec==='live'&&rr.lv===evId&&rr.ed&&rr.pane==='time'&&rr.tid==='tL2'&&rr.foc,`右滑＝改時間：回到即時回報、打開那張卡片、進入時間頁選到那個時間（${JSON.stringify(rr)}）`);
    await p.keyboard.press('Escape');await p.waitForTimeout(900);await p.keyboard.press('Escape');await p.waitForTimeout(900);}

  /* 4. 海報月曆 */
  {await p.click('#notiBtn');await p.waitForTimeout(900);await p.evaluate(()=>$('#notiPage .cal').scrollIntoView());await p.waitForTimeout(300);
    await p.click(`.pc-d[data-calday="${await p.evaluate(()=>addDays(today(),2))}"]`);await p.waitForTimeout(500);   /* 選到別天，今天只剩「今天」的樣子 */
    const r=await p.evaluate(()=>{const wk=[...document.querySelectorAll('.pc-wk span')].map(s=>s.textContent).join(),d1=$('.pc-d[data-calday$="-01"]'),cells=[...d1.parentElement.children].filter(x=>x.classList.contains('pc-d')),
      col=cells.indexOf(d1),exp=(pd(NOTI.month+'-01').getDay()+6)%7,sel=$('.pc-d.sel'),bs=getComputedStyle(sel,'::before'),td=$('.pc-d.is-today .pc-n'),ts=getComputedStyle(td);
      const css=v=>{const i=document.createElement('i');i.style.color=getComputedStyle(document.documentElement).getPropertyValue(v);document.body.append(i);const c=getComputedStyle(i).color;i.remove();return c};
      const wkr=$(`.pc-d[data-calday="${addDays(today(),1)}"]`).parentElement,sp=[...wkr.querySelectorAll('.pc-e.span')].map(e=>({ln:+e.style.getPropertyValue('--ln'),top:e.getBoundingClientRect().top}));
      return {wk,col,exp,w:sel.getBoundingClientRect().width,selBg:bs.backgroundColor,acc:css('--acc'),op:bs.opacity,tdc:ts.color,acc2:css('--acc2'),fw:ts.fontWeight,sp,mon:$('.pc-mon').textContent,yr:$('.pc-yr').textContent,foot:$('.pc-foot').textContent,grid:getComputedStyle($('.pc-d')).borderTopWidth}});
    ok(r.wk==='MON,TUE,WED,THU,FRI,SAT,SUN'&&r.col===r.exp,`週一開頭、上面一排 MON–SUN（1 號在第 ${r.col+1} 格）`);
    ok(/^\d+[A-Z]{3}$/.test(r.mon)&&/^\d{4}$/.test(r.yr)&&/學生會$/.test(r.foot),`超大月份數字加英文縮寫（${r.mon}）、右上兩行年份、底下「部門・學生會」（${r.foot}）`);
    ok(r.w===40&&r.selBg===r.acc&&r.op==='1',`選到的日期＝--acc 實心圓 40px（${r.w}、${r.selBg}）`);
    ok(r.tdc===r.acc2&&+r.fw>=700,`今天＝--acc2 粗體（${r.tdc}、${r.fw}）`);
    const t0=Math.min(...r.sp.map(x=>x.top-x.ln*9)),t1=Math.max(...r.sp.map(x=>x.top-x.ln*9)),lns=[...new Set(r.sp.map(x=>x.ln))].sort();
    ok(r.sp.length>=2&&lns.length>=2&&Math.round(t1-t0)===0,`跨天＝細線，同一週撞在一起的往下排一層、每層 9px（這一週 ${r.sp.length} 條、層 ${lns}、位置＝層×9 誤差 ${Math.round(t1-t0)}）`);
    const day=await p.evaluate(()=>{const d=today().slice(0,7)+'-0'+(today().slice(8)==='05'?'6':'5');return d});
    const k0=await p.evaluate(()=>$('.cal-list').dataset.callist);
    await p.click(`.pc-d[data-calday="${day}"]`);await p.waitForTimeout(60);
    const g=await p.evaluate(()=>({ghost:!!$('.cal-ghost'),anim:[...$('.cal-list').children].some(x=>x.getAnimations().length)}));
    await p.waitForTimeout(700);
    const k1=await p.evaluate(()=>[$('.cal-list').dataset.callist,NOTI.day,$('.pc-d.sel').dataset.calday,!$('.cal-ghost')]);
    ok(k1[0]!==k0&&k1[1]===day&&k1[2]===day&&g.ghost&&g.anim&&k1[3],`點日期：清單換成那一天（舊的分身淡出 ${g.ghost}、新的浮上來 ${g.anim}，結束後分身拿掉）`);
    await p.click('[data-calmon]');await p.waitForTimeout(400);
    const m=await p.evaluate(()=>({pop:NOTI.pop,n:document.querySelectorAll('.cal-pop [role=option]').length,foc:document.activeElement.dataset.calset===NOTI.month,exp:$('[data-calmon]').getAttribute('aria-expanded')}));
    ok(m.pop&&m.n===12&&m.foc&&m.exp==='true',`月份鈕：自製選單 12 個月、焦點在目前的月份（${JSON.stringify(m)}）`);
    await p.keyboard.press('Escape');await p.waitForTimeout(400);
    ok(await p.evaluate(()=>!NOTI.pop&&!$('.cal-pop')&&notiOpen&&document.activeElement.matches('[data-calmon]')),'Esc 關月份選單（通知頁還在、焦點回月份鈕）');
    await p.click('[data-calmon]');await p.waitForTimeout(300);await p.mouse.click(5,5);await p.waitForTimeout(400);
    ok(await p.evaluate(()=>!NOTI.pop&&notiOpen),'點選單外面關掉');
    await p.click('[data-calmon]');await p.waitForTimeout(300);const tgt=await p.evaluate(()=>[...document.querySelectorAll('.cal-pop [data-calset]')].map(x=>x.dataset.calset).find(v=>v!==NOTI.month));
    await p.click(`.cal-pop [data-calset="${tgt}"]`);await p.waitForTimeout(600);
    ok(await p.evaluate(t=>NOTI.month===t&&!NOTI.pop&&$('.pc-mn').textContent==String(+t.slice(5)),tgt),`選月份：月曆換到 ${tgt}`);}

  /* 5. 五類模式與讀取量 */
  {await p.click('#notiBtn');await p.waitForTimeout(700);await p.click('#notiBtn');await p.waitForTimeout(900);await p.evaluate(()=>$('#notiPage .cal').scrollIntoView());
    const segs=await p.evaluate(()=>[...document.querySelectorAll('.cal-seg [data-k]')].map(x=>x.textContent).join());
    ok(segs==='本部門,會長室,活動,會議,其他'&&await p.evaluate(()=>$('.cal-seg').classList.contains('lseg')),`五類模式（分段切換）：${segs}`);
    ok(req.length===0,`本部門：不讀別的部門（請求 ${req.length}）`);
    await p.click('.cal-seg [data-k="pres"]');await p.waitForTimeout(900);
    ok(req.join()==='president'&&await p.evaluate(()=>NOTI.mode==='pres'&&/會長行程/.test($('.cal-list').textContent)&&!!$('.cal-list .ce-k.acc')),`會長室：讀會長室的資料（${req}），清單有那件事`);
    await p.click('.cal-seg [data-k="mine"]');await p.waitForTimeout(500);await p.click('.cal-seg [data-k="pres"]');await p.waitForTimeout(500);
    ok(req.length===1,`切回會長室：讀過的留在記憶體，不重讀（${req.length}）`);
    await p.click('.cal-seg [data-k="act"]');await p.waitForTimeout(500);
    const act=await p.evaluate(()=>({mode:NOTI.mode,ev:document.querySelectorAll('.cal-list .cal-ev').length,on:storeScopeOn()}));
    await p.click('.cal-seg [data-k="meet"]');await p.waitForTimeout(500);
    ok(act.mode==='act'&&act.ev===0&&!act.on&&req.length===1,`活動、會議：部門都還在 github（沒有 scope）＝空的、不讀（${JSON.stringify(act)}）`);
    await p.click('.cal-seg [data-k="other"]');await p.waitForTimeout(600);
    const chips=await p.evaluate(()=>[...document.querySelectorAll('.cal-oth [data-caloth]')].map(x=>x.dataset.caloth+':'+x.getAttribute('role')+':'+x.getAttribute('aria-checked')));
    ok(chips.length===7&&!chips.some(x=>/^(rights|president):/.test(x))&&chips.every(x=>/:checkbox:false$/.test(x))&&req.length===1,`其他：自製勾選（role=checkbox）列出本部門、會長室以外的部門，沒勾不讀（${chips.length}，請求 ${req.length}）`);
    await p.screenshot({path:'ui6_other.png'});
    await p.click('.cal-oth [data-caloth="marketing"]');await p.waitForTimeout(900);
    ok(req.join()==='president,marketing'&&await p.evaluate(()=>$('.cal-oth [data-caloth="marketing"]').getAttribute('aria-checked')==='true'&&/行銷活動/.test($('.cal-list').textContent)),`勾了行銷部才讀（${req}），清單有那件事`);
    await p.click('.cal-oth [data-caloth="marketing"]');await p.waitForTimeout(400);await p.click('.cal-oth [data-caloth="marketing"]');await p.waitForTimeout(500);
    ok(req.length===2,`取消再勾：不重讀（${req.length}）`);
    /* 有部門切到 firestore 時，活動、會議讀 scope 的時間事件（用替身模組，記下查詢參數） */
    const sc=await p.evaluate(async X=>{BOARD_DEPTS.find(d=>d.id==='events').source='firestore';window.__q=[];
      storeFsMod=Promise.resolve({eventsByScope:async(cfg,s,a,b)=>{__q.push([s,a<b]);return [{id:'events__e1',deptId:'events',label:X,startRaw:today()+' 18:00',endRaw:'',allDay:false,place:'操場',scope:s}]}});
      NOTI.day=today();NOTI.month=today().slice(0,7);renderNoti();return storeScopeOn()},XSS);
    await p.click('.cal-seg [data-k="act"]');await p.waitForTimeout(700);
    const a=await p.evaluate(()=>({q:JSON.stringify(__q),ev:document.querySelectorAll('.cal-list .cal-ev').length,pill:$('.cal-list .ce-k')?.textContent,cls:$('.cal-list .ce-k')?.className,img:document.querySelectorAll('.cal-list img').length,x:window.__xss}));
    ok(sc&&a.q==='[["all-activity",true]]'&&a.ev===1&&a.pill==='活動部'&&/pri/.test(a.cls),`活動：讀 scope=all-activity（${a.q}），清單是那個部門的事`);
    ok(a.img===0&&!a.x,'活動清單的事件名稱有 <img onerror>：照字面顯示');
    await p.click('.cal-seg [data-k="meet"]');await p.waitForTimeout(700);
    ok(await p.evaluate(()=>JSON.stringify(__q.map(x=>x[0]))==='["all-activity","all-meeting"]'&&!!$('.cal-list .ce-k.line')),'會議：讀 scope=all-meeting，膠囊是外框');
    await p.click('.cal-seg [data-k="act"]');await p.waitForTimeout(400);
    ok(await p.evaluate(()=>__q.length===2),'切回活動：讀過的不重讀');
    await p.evaluate(()=>{BOARD_DEPTS.find(d=>d.id==='events').source='github'});
    await p.click('.cal-seg [data-k="mine"]');await p.waitForTimeout(400);}

  /* 6b. 公共版參數 */
  {await p.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<div id="pubT"></div>');window.__pc=calMount($('#pubT'))});await p.waitForTimeout(400);
    const r=await p.evaluate(()=>({pub:__pc.pub,modes:[...document.querySelectorAll('#pubT .cal-seg [data-k]')].map(x=>x.textContent).join(),h:$('#pubT .nt-h').textContent,foot:$('#pubT .pc-foot').textContent,
      extra:!!$('#pubT .nd-card,#pubT .dk-card,#pubT .cal-oth')}));
    ok(r.pub&&r.modes==='全部,活動,會議'&&/全會行事曆/.test(r.h)&&r.foot==='全會・學生會'&&!r.extra,`公共版：全部／活動／會議、沒有今日／明日與逾期（${r.modes}，${r.foot}）`);
    await p.click('#pubT .cal-seg [data-k="meet"]');await p.waitForTimeout(400);
    ok(await p.evaluate(()=>__pc.mode==='meet'&&NOTI.mode==='mine'),'公共版自己一份狀態（換模式不影響通知頁）');
    await p.evaluate(()=>$('#pubT').remove());}

  /* 6c. 唯讀：開著時按眼睛（唯讀檢視）→ 通知鈕消失、回原分頁 */
  {await p.click('#notiBtn');await p.waitForTimeout(800);
    await p.click('#peekBtn');await p.waitForTimeout(800);
    ok(await p.evaluate(()=>!notiOpen&&$('#notiBtn').hidden&&!$('#notiPage').classList.contains('cur')),'通知頁開著時變成唯讀檢視：通知鈕不出現、回到原分頁');
    await p.click('#peekBtn');await p.waitForTimeout(600);}
  ok(p.errs.length===0,`1300 沒有頁面錯誤${p.errs.length?'：'+p.errs.join(' | '):''}`);

  /* 7. 關掉動態 */
  {await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{window.__an=[];const o=Element.prototype.animate;Element.prototype.animate=function(...a){__an.push(this.className);return o.apply(this,a)}});
    await p.click('#notiBtn');await p.waitForTimeout(50);const a1=await noAnims(p);
    await p.click('#notiPage .nd-card.today');await p.waitForTimeout(50);const a2=await p.evaluate(()=>[todayOpen,!$('#todayOv').hidden]);await p.keyboard.press('Escape');await p.waitForTimeout(50);
    await p.click('.pc-d[data-calday$="-03"]');await p.waitForTimeout(30);const g=await p.evaluate(()=>!!$('.cal-ghost'));
    await p.click('[data-calmon]');await p.keyboard.press('Escape');
    const r=await p.evaluate(()=>({an:__an.length,run:document.getAnimations().filter(a=>a.playState==='running'&&!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length,today:todayOpen}));
    ok(a1===0&&a2[0]&&a2[1]&&!r.today&&!g&&r.an===0&&r.run===0,`關掉動態：進出、今日層、換日期、月份選單都直接到結果（animate() ${r.an}、在跑 ${r.run}、分身 ${g}）`);
    await p.keyboard.press('Escape');await p.emulateMedia({reducedMotion:'no-preference'});}
  await p.close();

  /* 8. 412 寬 */
  {const q=await mk(412,860,'light',true);await q.route(/data-(president|marketing)\.json/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(other('會長室','會長行程'))}));
    await seed(q);   /* GitHub 模式沒登入也有通知鈕（登入就能編輯，不算沒有權限） */
    const l0=await q.evaluate(()=>$('#tabbar .tab.on').dataset.tab);
    await q.click('#notiBtn');await q.waitForTimeout(1000);
    const r=await q.evaluate(()=>({open:notiOpen,tab:$('#tabbar .tab.on').dataset.tab,sw:document.documentElement.scrollWidth,pw:$('#pageMain').scrollWidth,cw:$('#pageMain').clientWidth,w:innerWidth,
      cards:[...document.querySelectorAll('.nd-card')].map(c=>Math.round(c.getBoundingClientRect().width)),dk:Math.round($('#notiDeck').getBoundingClientRect().width)}));
    ok(r.open&&r.tab===l0&&r.sw<=r.w&&r.pw<=r.cw+1,`412：鏡片留在原分頁（${r.tab}）、沒有橫捲（${r.sw}/${r.pw}/${r.cw}）`);
    ok(r.cards.length===2&&Math.abs(r.cards[0]-r.cards[1])<=1,`412：今日／明日兩張並排（${r.cards}）`);
    await q.screenshot({path:'ui6_412.png'});
    ok(q.errs.length===0,`412 沒有頁面錯誤${q.errs.length?'：'+q.errs.join(' | '):''}`);
    await q.close();}

  console.log(`\n${passes} 通過、${fails} 失敗`);await b.close();process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL 例外：'+e.message);process.exit(1)});
