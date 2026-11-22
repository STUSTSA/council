/* ui6：新介面第 6 步（通知與行事曆：部門內的一頁；docs/DESIGN-next.md 第九節、第五節「彈簧與回彈」、第十三、十四節）。
   github 模式（data_test.json），固定 8300 埠（run-tests.sh 換埠時會一起換）。
   1. 通知鈕進到部門內的一頁：標題列同一個節點、鏡片不動、沒有搜尋列與新增圓鈕；返回四種：再按通知鈕、Esc、系統返回鍵、工具列分頁（到那個分頁）
   2. 今日／明日卡片：今日＝--pri 底；今日層開關（Esc）、只有「本來就要做」；點明日＝行事曆選到那一天
   3. 清點區：已過期／本週到期兩段；已過期是卡片堆（右滑完成、左滑改期、小按鈕、方向鍵）；完成與復原（含沒有核取行的舊時間標記）；改期打開那張卡片的時間頁
   4. 海報月曆：週一開頭、選到的日期 --acc 圓（1280 以上三欄 36px，其餘 40px）、今天 --acc2 粗體、跨天細線與分層 9px；點日期清單換內容（舊的分身淡出）；月份選單 Esc 關、選月份
   5. 五類模式：會長室、「其他」勾了才讀那個部門（攔截請求計數，讀過不重讀）；活動、會議在 github 部門是空的、不讀；只有測試部門是 firestore 也不讀；有 firestore 部門時讀 scope（用替身模組）
   6. 跳脫：事件名稱含 <img onerror>；公共版參數（calMount）；唯讀時沒有通知鈕、開著時變唯讀就回原分頁
   7. 關掉動態（reduced-motion）：進出、今日層、換日期都沒有程式動畫
   8. 412 寬：沒有橫捲、鏡片留在原分頁
   9. 審查修正：沒登入／沒選身分時清點區唯讀（沒有完成／改期鈕、notiDone 回 false 且沒有寫入）；
      固定 11/30 點明日會讀新月份；11/27–12/08 在 11/30 那格畫成半條線；
      時刻欄位含 <!--x 版面不壞；calMount→calUnmount 五次 resize 監聽不累積、拆掉的不吃 Esc；未登入的公共版查詢帶 visibility（替身 Firebase 模組）；
      通知頁開著按設定鍵：瀏覽紀錄不為 null、系統返回關設定
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const XSS='<img src=x onerror="window.__xss=1">';
/* 測試用的時間：逾期三筆（一筆跨天）、勾了的過期一筆（不算）、今天晚上一筆、明天一筆、跨天兩筆（同一週撞在一起） */
const seed=p=>p.evaluate(X=>{const t=today(),e=state.events.find(x=>!x.doneAt);e.name='測試卡片';
  e.times=[{id:'tL1',label:'過期一',start:addDays(t,-3)+'T09:30',end:'',place:'會辦'},{id:'tL2',label:'過期二',start:addDays(t,-2),end:'',place:''},
    {id:'tL3',label:'跨天過期',start:addDays(t,-6),end:addDays(t,-1),place:''},{id:'tD',label:'勾了的',start:addDays(t,-4),end:'',place:''},
    {id:'tT',label:X,start:t+'T23:58',end:'',place:X},{id:'tFar',label:'三週後',start:addDays(t,21)+'T10:00',end:'',place:''},{id:'tM',label:'明天的事',start:addDays(t,1)+'T08:00',end:'',place:''},
    {id:'tS1',label:'跨天一',start:addDays(t,1),end:addDays(t,2),place:''}];
  e.blocks=[{id:'bL1',text:'過期一',check:false,timeId:'tL1'},{id:'bL2',text:'過期二',check:false,timeId:'tL2'},{id:'bL3',text:'跨天過期',check:false,timeId:'tL3'},
    {id:'bD',text:'勾了的',check:true,timeId:'tD'},{id:'bT',text:X,check:false,timeId:'tT'},{id:'bFar',text:'三週後',check:false,timeId:'tFar'},{id:'bM',text:'明天的事',check:false,timeId:'tM'},{id:'bS1',text:'跨天一',check:false,timeId:'tS1'}];
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
      pressed:$('#notiBtn').getAttribute('aria-pressed'),tab:$('#tabbar .tab.on').dataset.tab,lens:[Math.round(l.top),Math.round(l.left)],order:[...$('#notiPage').querySelectorAll('.noti-days,.nt-tally,.cal')].map(x=>x.className.split(' ')[0]).join(','),cols:[...$('#notiPage').children].map(x=>x.className).join(',')}});
    ok(r.open&&r.cur&&r.others===1&&!r.ov,`通知鈕進到部門內的一頁（#notiPage 是唯一顯示的一區、沒有全畫面疊層）`);
    ok(r.same,'標題列是同一個節點');
    ok(r.tab==='progress'&&JSON.stringify(r.lens)===JSON.stringify(lens0),`鏡片留在原分頁、不動（${JSON.stringify(lens0)} → ${JSON.stringify(r.lens)}）`);
    ok(r.search&&r.fab,'這一頁沒有搜尋列、沒有新增圓鈕');
    ok(r.hist==='noti'&&r.pressed==='true','推一筆瀏覽紀錄、通知鈕 aria-pressed');
    ok(r.order==='noti-days,nt-tally,cal'&&r.cols==='noti-l,noti-r',`今日／明日 → 清點區（.noti-l）、行事曆（.noti-r）；手機由上到下、桌面左右兩欄（${r.order}／${r.cols}）`);
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
      return {n:cs.length,today:cs[0].classList.contains('today'),bg:getComputedStyle(cs[0]).backgroundColor,pc,rows:cs.map(c=>c.querySelectorAll('.nd-row').length),cnt:cs.map(c=>c.querySelector('.nd-count')?.textContent),first:cs.map(c=>c.querySelector('.nd-row b')?.textContent),t2:cs[1].textContent}});
    ok(r.n===2&&r.today&&r.bg===r.pc,`兩張並排卡片，今日＝--pri 底（${r.bg} / ${r.pc}）`);
    ok(r.rows[0]===1&&r.rows[1]===1&&r.cnt[0]==='1'&&r.cnt[1]==='3',`每張卡只有一項、右下角是當天總件數：今日 1、明日 3（${r.rows}、${r.cnt}）`);
    ok(r.first[1]==='明天的事',`明日挑有時刻的最早一筆（明天的事 08:00；${r.first[1]}）`);
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

  /* 3. 清點區：兩段、已過期是卡片堆（右滑完成、左滑改期，另有小按鈕與方向鍵）、完成與復原（含舊時間標記）、改期 */
  {const r=await p.evaluate(()=>{const g=k=>[...document.querySelectorAll(`#notiTally .tl-g[data-g="${k}"] .tl-row`)].map(x=>x.dataset.tl);
      return {late:notiLate(),cards:[...document.querySelectorAll('#notiDeck .tl-card')].map(c=>c.dataset.tlcard),top:$('#notiDeck .tl-card[data-i="0"]').dataset.tlcard,gw:g('week'),gx:g('later'),badge:$('#notiBtn .noti-n').textContent,
        hs:[...document.querySelectorAll('#notiTally .tl-gh')].map(h=>h.firstChild.textContent).join(),btns:[...document.querySelectorAll('#notiTally .tl-btn')].map(b=>b.textContent).join('|'),
        inRows:document.querySelectorAll('#notiTally .tl-row .tl-btn').length,all:[...document.querySelectorAll('#notiTally .tl-row')].map(x=>x.dataset.tl)}});
    ok(r.cards.slice().sort().join()==='tL1,tL2,tL3'&&r.late===3&&r.badge==='3'&&r.top==='tL3',`已過期三筆是卡片堆、最早的在最上面（勾了的不列）：${r.cards}，上面那張 ${r.top}，通知鈕 ${r.badge}`);
    ok(r.hs.startsWith('已過期')&&r.gw.includes('tT')&&!r.all.includes('tD')&&r.gx.length===0&&!r.all.includes('tFar'),`本週到期列出（${r.gw}），勾了的不列、下週以後的不收（沒有「之後」段）`);
    ok(r.btns==='改期|完成'&&r.inRows===0,`只有卡片堆下面兩顆小按鈕「改期」「完成」，其他段沒有動作鈕（${r.btns}）`);
    await p.evaluate(()=>$('#notiDeck').scrollIntoView({block:'center'}));await p.waitForTimeout(300);
    const drag=async(dx)=>{const bb=await (await p.$('#notiDeck .tl-card[data-i="0"]')).boundingBox();await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await p.mouse.down();for(let i=1;i<=12;i++){await p.mouse.move(bb.x+bb.width/2+dx*i/12,bb.y+bb.height/2+i);await p.waitForTimeout(16)}};
    const n0=st.commits.length;
    await drag(300);
    const stamp=await p.evaluate(()=>[getComputedStyle($('#notiDeck .tl-card[data-i="0"] .tl-stp.r')).opacity,getComputedStyle($('#notiDeck .tl-card[data-i="0"] .tl-stp.l')).opacity]);
    ok(+stamp[0]>.5&&+stamp[1]===0,`往右拖浮出「完成」（${stamp}）`);
    await p.mouse.up();await p.waitForTimeout(1800);
    const a=await p.evaluate(()=>{const ev=state.events.find(e=>e.times&&e.times.some(t=>t.id==='tL3'));return {chk:ev.blocks.find(b=>b.timeId==='tL3').check,late:notiLate(),top:$('#notiDeck .tl-card[data-i="0"]').dataset.tlcard,u:$('.tl-undo .kp-st')?.textContent}});
    ok(a.chk===true&&a.late===2&&a.top!=='tL3'&&a.u==='已完成'&&st.commits.length>n0,`右滑＝完成：勾起那一行、換下一張（剩 ${a.late}）、有存檔、出現「已完成＋復原」`);
    const n1=st.commits.length;await p.click('[data-tlundo]');await p.waitForTimeout(1400);
    const b2=await p.evaluate(()=>{const ev=state.events.find(e=>e.times&&e.times.some(t=>t.id==='tL3'));return {chk:ev.blocks.find(b=>b.timeId==='tL3').check,late:notiLate(),u:!!$('[data-tlundo]'),top:$('#notiDeck .tl-card[data-i="0"]').dataset.tlcard}});
    ok(b2.chk===false&&b2.late===3&&!b2.u&&b2.top==='tL3'&&st.commits.length>n1,'復原：改回沒勾、卡片回到卡片堆最上面、有存檔');
    /* 舊時間標記（沒有連到任何一行）：也在卡片堆裡；完成當下才補一行核取行，只動這一張卡片；復原拿掉補的那一行 */
    const L0=await p.evaluate(()=>{const ev=state.events.find(e=>e.times&&e.times.some(t=>t.id==='tL1'));ev.times.push({id:'tLg',label:'舊的時間標記',start:addDays(today(),-9),end:'',place:''});render();renderNoti();return {n:ev.blocks.length,o:state.events.filter(e=>e!==ev).map(e=>JSON.stringify(e.blocks)).join()}});
    await p.waitForTimeout(500);
    ok(await p.evaluate(()=>$('#notiDeck .tl-card[data-i="0"]').dataset.tlcard==='tLg'&&notiLate()===4&&$('#notiBtn .noti-n').textContent==='4'),'舊時間標記也在已過期、最早的在最上面（通知鈕 4）');
    await p.click('[data-tlgo="r"]');await p.waitForTimeout(1800);
    const g1=await p.evaluate(()=>{const ev=state.events.find(e=>e.times.some(t=>t.id==='tLg')),b=ev.blocks.find(x=>x.timeId==='tLg');return {b:b&&{chk:b.check,tx:b.text},n:ev.blocks.length,late:notiLate()}});
    ok(g1.b&&g1.b.chk===true&&g1.b.tx==='舊的時間標記'&&g1.n===L0.n+1&&g1.late===3,`舊時間標記按完成：補一行核取行（${JSON.stringify(g1.b)}），只多這一行，已過期剩 ${g1.late}`);
    await p.click('[data-tlundo]');await p.waitForTimeout(1400);
    const g2=await p.evaluate(()=>{const ev=state.events.find(e=>e.times.some(t=>t.id==='tLg'));return {n:ev.blocks.length,b:!!ev.blocks.find(x=>x.timeId==='tLg'),o:state.events.filter(e=>!e.times.some(t=>t.id==='tLg')).map(e=>JSON.stringify(e.blocks)).join(),late:notiLate()}});
    ok(g2.n===L0.n&&!g2.b&&g2.o===L0.o&&g2.late===4,'復原：補的那一行拿掉，其他卡片沒動');
    await p.evaluate(()=>{const ev=state.events.find(e=>e.times.some(t=>t.id==='tLg'));ev.times=ev.times.filter(t=>t.id!=='tLg');render();renderNoti()});await p.waitForTimeout(400);
    /* 30px 快甩不算；方向鍵（鍵盤）右＝完成 */
    {const bb=await (await p.$('#notiDeck .tl-card[data-i="0"]')).boundingBox();const m=st.commits.length;await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await p.mouse.down();for(let i=1;i<=2;i++)await p.mouse.move(bb.x+bb.width/2-i*15,bb.y+bb.height/2);await p.mouse.up();await p.waitForTimeout(1200);
      ok(st.commits.length===m&&await p.evaluate(()=>notiLate()===3),'30px 快甩：不處理（卡片彈回）')}
    await p.focus('#notiDeck .tl-card[data-i="0"]');await p.keyboard.press('ArrowRight');await p.waitForTimeout(1800);
    ok(await p.evaluate(()=>notiLate()===2&&!!$('[data-tlundo]')),'鍵盤：Tab 到最上面那張按右方向鍵＝完成');
    await p.click('[data-tlundo]');await p.waitForTimeout(1400);
    await p.click('[data-tlgo="l"]');await p.waitForTimeout(1800);
    const rr=await p.evaluate(()=>({open:notiOpen,sec:curSec,lv:lvOpen,ed:editing,pane:lvPane,tid:lvSeg&&lvSeg.tid,foc:document.activeElement&&document.activeElement.matches('.lc-ed .sg.on')}));
    ok(!rr.open&&rr.sec==='live'&&rr.lv===evId&&rr.ed&&rr.pane==='time'&&rr.tid==='tL3'&&rr.foc,`改期（左滑／按鈕）：回到即時回報、打開那張卡片、進入時間頁選到那個時間（${JSON.stringify(rr)}）`);
    await p.keyboard.press('Escape');await p.waitForTimeout(900);await p.keyboard.press('Escape');await p.waitForTimeout(900);}

  /* 4. 海報月曆 */
  {await p.click('#notiBtn');await p.waitForTimeout(900);await p.evaluate(()=>$('#notiPage .cal').scrollIntoView());await p.waitForTimeout(300);
    await p.click(`.pc-d[data-calday="${await p.evaluate(()=>addDays(today(),2))}"]`);await p.waitForTimeout(500);   /* 選到別天，今天只剩「今天」的樣子 */
    const r=await p.evaluate(()=>{const wk=[...document.querySelectorAll('.pc-wk span')].map(s=>s.textContent).join(),d1=$('.pc-d[data-calday$="-01"]'),cells=[...d1.parentElement.children].filter(x=>x.classList.contains('pc-d')),
      col=cells.indexOf(d1),exp=(pd(NOTI.month+'-01').getDay()+6)%7,sel=$('.pc-d.sel'),bs=getComputedStyle(sel,'::before'),td=$('.pc-d.is-today .pc-n'),ts=getComputedStyle(td);
      const css=v=>{const i=document.createElement('i');i.style.color=getComputedStyle(document.documentElement).getPropertyValue(v);document.body.append(i);const c=getComputedStyle(i).color;i.remove();return c};
      const wkr=$(`.pc-d[data-calday="${addDays(today(),1)}"]`).parentElement,sp=[...wkr.querySelectorAll('.pc-e.span')].map(e=>({ln:+e.style.getPropertyValue('--ln'),top:e.getBoundingClientRect().top}));
      return {wk,col,exp,w:sel.getBoundingClientRect().width,selBg:bs.backgroundColor,acc:css('--acc'),op:bs.opacity,tdc:ts.color,acc2:css('--acc2'),fw:ts.fontWeight,sp,mon:$('.pc-mon').textContent,yr:$('.pc-yr').textContent,foot:$('.pc-foot').textContent,grid:getComputedStyle($('.pc-d')).borderTopWidth,vw:innerWidth}});
    ok(r.wk==='MON,TUE,WED,THU,FRI,SAT,SUN'&&r.col===r.exp,`週一開頭、上面一排 MON–SUN（1 號在第 ${r.col+1} 格）`);
    ok(/^\d+[A-Z]{3}$/.test(r.mon)&&/^\d{4}$/.test(r.yr)&&/學生會$/.test(r.foot),`超大月份數字加英文縮寫（${r.mon}）、右上兩行年份、底下「部門・學生會」（${r.foot}）`);
    const wantW=r.vw>=1280?36:40;   /* 1280 以上通知頁三欄、月曆縮小（日期圓 36）；1000～1279 兩欄與手機是 40 */
    ok(r.w===wantW&&r.selBg===r.acc&&r.op==='1',`選到的日期＝--acc 實心圓 ${wantW}px（視窗 ${r.vw}；${r.w}、${r.selBg}）`);
    {const vw0=p.viewportSize();for(const w of [1100,412]){await p.setViewportSize({width:w,height:vw0.height});await p.waitForTimeout(600);
      ok(await p.evaluate(()=>$('.pc-d.sel').getBoundingClientRect().width)===40,`${w} 寬（兩欄／手機）：選到的日期圓 40px`)}
      await p.setViewportSize(vw0);await p.waitForTimeout(600)}
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
    /* 只有測試部門（水果部）切到 firestore：不算，活動、會議照舊空的、不讀（2026-11-19，實測 Google 登入時不影響其他部門） */
    const t0=await p.evaluate(()=>{BOARD_DEPTS.find(d=>d.id==='fruit').source='firestore';window.__q0=[];window.__fm=storeFsMod;
      storeFsMod=Promise.resolve({eventsByScope:async(cfg,s)=>{__q0.push(s);return []}});NOTI.day=today();NOTI.month=today().slice(0,7);renderNoti();return storeScopeOn()});
    await p.click('.cal-seg [data-k="act"]');await p.waitForTimeout(500);await p.click('.cal-seg [data-k="meet"]');await p.waitForTimeout(500);
    const t1=await p.evaluate(()=>({on:storeScopeOn(),q:__q0.length,ev:document.querySelectorAll('.cal-list .cal-ev').length}));
    await p.evaluate(()=>{BOARD_DEPTS.find(d=>d.id==='fruit').source='github';storeFsMod=window.__fm;CAL_DATA.forEach((v,k)=>{if(!k.startsWith('dept:'))CAL_DATA.delete(k)})});await p.click('.cal-seg [data-k="mine"]');await p.waitForTimeout(400);
    ok(!t0&&!t1.on&&t1.q===0&&t1.ev===0,`活動、會議：只有測試部門（水果部）是 firestore 不算＝空的、不讀（${JSON.stringify(t1)}）`);
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
    const r=await p.evaluate(()=>({pub:__pc.pub,modes:[...document.querySelectorAll('#pubT .cal-seg [data-k]')].map(x=>x.textContent).join(),h:$('#pubT .sec-h').textContent,foot:$('#pubT .pc-foot').textContent,
      extra:!!$('#pubT .nd-card,#pubT .nt-tally,#pubT .cal-oth')}));
    ok(r.pub&&r.modes==='全部,活動,會議'&&/全會行事曆/.test(r.h)&&r.foot==='全會・學生會'&&!r.extra,`公共版：全部／活動／會議、沒有今日／明日與逾期（${r.modes}，${r.foot}）`);
    await p.click('#pubT .cal-seg [data-k="meet"]');await p.waitForTimeout(400);
    ok(await p.evaluate(()=>__pc.mode==='meet'&&NOTI.mode==='mine'),'公共版自己一份狀態（換模式不影響通知頁）');
    await p.evaluate(()=>{calUnmount($('#pubT'));$('#pubT').remove()});}

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
      cards:[...document.querySelectorAll('.nd-card')].map(c=>Math.round(c.getBoundingClientRect().width)),tl:Math.round($('#notiTally').getBoundingClientRect().width)}));
    ok(r.open&&r.tab===l0&&r.sw<=r.w&&r.pw<=r.cw+1,`412：鏡片留在原分頁（${r.tab}）、沒有橫捲（${r.sw}/${r.pw}/${r.cw}）`);
    ok(r.cards.length===2&&Math.abs(r.cards[0]-r.cards[1])<=1,`412：今日／明日兩張並排（${r.cards}）`);
    await q.screenshot({path:'ui6_412.png'});
    ok(q.errs.length===0,`412 沒有頁面錯誤${q.errs.length?'：'+q.errs.join(' | '):''}`);
    await q.close();}

  /* 9. 審查修正 */
  const blk=(pg,id)=>pg.evaluate(id=>{const b=state.events.flatMap(e=>e.blocks||[]).find(x=>x.timeId===id);return b&&b.check},id);
  /* 9a. 沒選身分（GitHub 模式沒登入）＝唯讀：清點區看得到，沒有完成／改期鈕，notiDone、notiRetime 回 false 且沒有寫入 */
  {const q=await mk(1300,900,'light',false);const evId=await seed(q);await q.click('#notiBtn');await q.waitForTimeout(900);
    await q.evaluate(()=>$('#notiTally').scrollIntoView({block:'center'}));await q.waitForTimeout(300);
    const ls0=await q.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()));const n0=st.commits.length,t0=await blk(q,'tL3');
    const r=await q.evaluate(()=>({btn:document.querySelectorAll('#notiTally .tl-btn').length,late:document.querySelectorAll('#notiDeck .tl-card').length}));
    ok(r.btn===0&&r.late===3,`沒選身分：清點區還看得到（已過期卡片堆 ${r.late} 張），沒有完成／改期鈕（${r.btn}）`);
    const v=await q.evaluate(id=>Promise.race([Promise.resolve(notiDone(id,'tL3')),new Promise(r=>setTimeout(()=>r('還在等'),1500))]),evId);
    const v2=await q.evaluate(id=>Promise.race([Promise.resolve(notiRetime(id,'tL3')),new Promise(r=>setTimeout(()=>r('還在等'),1500))]),evId);
    await q.evaluate(()=>{if($('#dlg').open)$('#dlg').close()});
    const ls1=await q.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()));
    ok(v===false&&v2===false&&st.commits.length===n0&&ls1===ls0&&await blk(q,'tL3')===t0&&await q.evaluate(()=>notiOpen),
      `沒選身分：notiDone、notiRetime 回 false（${v}、${v2}），沒有寫進 GitHub（${st.commits.length-n0}）或這台裝置（${ls1===ls0?'沒變':'變了'}）`);
    await q.close();}
  /* 9c. 固定在 2026-11-30：P2-1 點明日讀新月份、P2-2 跨週只佔一格畫半條線、P2-4 時刻跳脫、P2-5 拆除 */
  {const q=await mk(1300,900,'light',false);await q.context().clock.setFixedTime(new Date(2026,10,30,10,0,0));await q.reload();await q.waitForTimeout(1800);
    await q.evaluate(()=>{const e=state.events.find(x=>!x.doneAt);e.times=[{id:'tW',label:'跨月',start:'2026-11-27',end:'2026-12-08',place:''},{id:'tH',label:'跨週',start:'2026-11-29',end:'2026-12-02',place:''},
      {id:'tX',label:'註解今天',start:'2026-11-30T<!--x',end:'',place:''},{id:'tY',label:'註解過期',start:'2026-11-29T<!--x',end:'',place:''}];
      e.blocks=[{id:'bW',text:'跨月',check:false,timeId:'tW'},{id:'bH',text:'跨週',check:false,timeId:'tH'},{id:'bX',text:'註解今天',check:false,timeId:'tX'},{id:'bY',text:'註解過期',check:false,timeId:'tY'}];render()});
    await q.click('#notiBtn');await q.waitForTimeout(900);
    const h=await q.evaluate(()=>{const d=today(),n=notiMine().filter(x=>covers(x,d)).length;return {today:d,rows:+($('#notiPage .nd-card.today .nd-count')||{}).textContent||0,er:n,
      dk:document.querySelectorAll('#notiDeck .tl-card').length,ed:Math.min(3,notiLateItems().length),ev:document.querySelectorAll('#notiPage .cal-list .cal-ev').length,en:n,
      cal:!!$('#notiPage .pc-foot'),txt:$('#notiPage').textContent.split('<!--x').length-1}});
    ok(h.today==='2026-11-30'&&h.er>=2&&h.rows===h.er&&h.ed>=1&&h.dk===h.ed&&h.ev===h.en&&h.cal&&h.txt>=3,`時刻含 <!--x 版面不壞：今日件數 ${h.rows}/${h.er}、已過期 ${h.dk}/${h.ed} 張、清單 ${h.ev}/${h.en} 件、月曆還在（${h.cal}），照字面顯示 ${h.txt} 次`);
    await q.evaluate(()=>{const e=state.events.find(x=>!x.doneAt);e.times=e.times.filter(t=>/^t[WH]$/.test(t.id));e.blocks=e.blocks.filter(b=>/^b[WH]$/.test(b.id));render()});await q.waitForTimeout(400);   /* 下面各項跟跳脫分開測 */
    const w=await q.evaluate(()=>{const wk=$('.pc-d[data-calday="2026-11-30"]').parentElement,e=[...wk.querySelectorAll('.pc-e')].find(x=>x.style.getPropertyValue('--i0')==='0'&&x.style.getPropertyValue('--i1')==='0'&&/cont-r/.test(x.className));
      const cell=$('.pc-d[data-calday="2026-11-30"]').getBoundingClientRect(),b=e&&getComputedStyle(e,'::before'),a=e&&getComputedStyle(e,'::after');
      const er=e&&e.getBoundingClientRect();return e&&{cls:e.className,bw:parseFloat(b.width)||0,dot:a.content!=='none'&&a.content!=='normal',right:er.right,cellMid:cell.left+cell.width/2}});
    ok(w&&/cont-r/.test(w.cls)&&/cont-l/.test(w.cls)&&!w.dot&&w.bw>12&&w.right>w.cellMid+12,`11/27–12/08 在 11/30 那格（月底、前後都延續）：畫成到格子兩邊的線（${JSON.stringify(w)}），不是小點`);
    const hf=await q.evaluate(()=>{const wk=$('.pc-d[data-calday="2026-11-29"]').parentElement,e=[...wk.querySelectorAll('.pc-e')].find(x=>x.style.getPropertyValue('--i0')==='6'&&x.style.getPropertyValue('--i1')==='6');
      if(!e)return null;const r=e.getBoundingClientRect(),b=getComputedStyle(e,'::before');return {cls:e.className,ratio:Math.round((parseFloat(b.width)||0)/r.width*100)/100,dot:getComputedStyle(e,'::after').content}});
    ok(hf&&/cont-r/.test(hf.cls)&&!/cont-l/.test(hf.cls)&&hf.ratio>.4&&hf.ratio<.65,`11/29–12/02 在 11/29（週日）那格：從中心到右邊緣的半條線（${JSON.stringify(hf)}）`);
    const w2=await q.evaluate(()=>{const wk=$('.pc-d[data-calday="2026-11-27"]').parentElement;return [...wk.querySelectorAll('.pc-e')].map(x=>x.className).join()});
    ok(/span/.test(w2)&&/cont-r/.test(w2),`11/27 那一週：延續到下一週的一端標 cont-r（${w2}）`);
    /* P2-1：活動模式（替身模組）、點明日（12/01）→ 讀十二月 */
    await q.evaluate(()=>{BOARD_DEPTS.find(d=>d.id==='events').source='firestore';window.__q=[];
      storeFsMod=Promise.resolve({eventsByScope:async(cfg,s,a,b,o)=>{__q.push([s,new Date(a).toISOString().slice(0,10),new Date(b).toISOString().slice(0,10),!!(o&&o.pub)]);
        return [{id:'events__d1',deptId:'events',label:'十二月活動',startRaw:'2026-12-01 18:00',endRaw:'',allDay:false,place:'',scope:s}]}})});
    await q.click('.cal-seg [data-k="act"]');await q.waitForTimeout(700);
    await q.click('#notiPage .nd-card:not(.today)');await q.waitForTimeout(1200);
    const m=await q.evaluate(()=>({month:NOTI.month,day:NOTI.day,q:__q.length,last:__q[__q.length-1],list:$('.cal-list').textContent.trim()}));
    ok(m.month==='2026-12'&&m.day==='2026-12-01'&&m.q===2&&!/讀取中/.test(m.list)&&/十二月活動/.test(m.list),`11/30 點明日：換到十二月、發出新月份的查詢（${JSON.stringify(m.last)}，共 ${m.q} 次），清單顯示（${m.list.slice(0,20)}）`);
    /* 小項：活動、會議沒權限（沒登入）＝「登入後才看得到」，不是「這個部門已搬到新資料庫」 */
    await q.evaluate(()=>{storeFsMod=Promise.resolve({eventsByScope:async()=>{throw Object.assign(new Error('x'),{code:'permission-denied'})}})});
    await q.click('.cal-seg [data-k="meet"]');await q.waitForTimeout(700);
    const dn=await q.evaluate(()=>$('.cal-list').textContent.trim());
    ok(dn==='登入後才看得到',`會議沒權限：顯示「${dn}」`);
    /* P2-5：calMount → calUnmount 五次：resize 監聽不累積、CALS 復原、拆掉的不吃 Esc（先關通知頁，Esc 才不會被通知頁接走） */
    await q.evaluate(()=>closeNoti(true));await q.waitForTimeout(300);
    const u=await q.evaluate(async()=>{let n=0;const add=window.addEventListener,rm=window.removeEventListener;
      window.addEventListener=function(t,...a){if(t==='resize')n++;return add.call(this,t,...a)};window.removeEventListener=function(t,...a){if(t==='resize')n--;return rm.call(this,t,...a)};
      /* ui-09 起分段切換（LiquidSeg）用 ResizeObserver 看自己的大小、不掛視窗的 resize：還在看的 ResizeObserver 也算一個監聽，destroy 時 disconnect 才扣回 */
      const RO=ResizeObserver.prototype,obs=RO.observe,dis=RO.disconnect;RO.observe=function(...a){if(!this.__u){this.__u=1;n++}return obs.apply(this,a)};RO.disconnect=function(){if(this.__u){this.__u=0;n--}return dis.call(this)};
      const c0=CALS.length;document.body.insertAdjacentHTML('beforeend','<div id="pubU"></div>');const h=$('#pubU');let peak=0;
      if(typeof calUnmount!=='function'){window.addEventListener=add;window.removeEventListener=rm;return {err:'沒有 calUnmount'}}
      for(let i=0;i<5;i++){const c=calMount(h);await new Promise(r=>setTimeout(r,60));peak=Math.max(peak,n);if(i===4){c.pop=true;calPaint(c)}calUnmount(h)}
      const esc=()=>{const ev=new KeyboardEvent('keydown',{key:'Escape',cancelable:true,bubbles:true});document.dispatchEvent(ev);return ev.defaultPrevented};
      const gone=esc();   /* 拆掉的（月份選單開著時拆的）不吃 Esc */
      const c=calMount(h);c.pop=true;calPaint(c);const live=esc();calUnmount(h);   /* 對照：還掛著、選單開著時 Esc 被它吃掉 */
      window.addEventListener=add;window.removeEventListener=rm;RO.observe=obs;RO.disconnect=dis;h.remove();
      return {n,peak,cals:CALS.length===c0,cal:h._cal===undefined,esc:gone,live}});
    ok(!u.err&&u.n===0&&u.peak>=1&&u.cals&&u.cal&&!u.esc&&u.live,`calMount→calUnmount 五次：resize 監聽（含 ResizeObserver）淨增 ${u.n}（最多 ${u.peak}）、CALS 復原、拆掉的不吃 Esc（${JSON.stringify(u)}）`);
    ok(q.errs.length===0,`9c 沒有頁面錯誤${q.errs.length?'：'+q.errs.join(' | '):''}`);
    await q.close();}
  /* 9d. 未登入的公共版：Firestore 查詢帶 visibility=='public'（替身 Firebase 模組，記下查詢條件；不連任何真的專案）；登入後照舊用 scope */
  {const ctxq=await mk(1300,900,'light',false);const q=ctxq;
    const stub={'firebase-app.js':'export const initializeApp=()=>({});',
      'firebase-auth.js':'export const getAuth=()=>({get currentUser(){return window.__fbUser||null},authStateReady:()=>Promise.resolve(),languageCode:""});export const connectAuthEmulator=()=>{};',
      'firebase-firestore.js':`const T=v=>v&&v.ms!=null?'ts':v;export const getFirestore=()=>({});export const connectFirestoreEmulator=()=>{};export const doc=()=>({});export const getDoc=async()=>({exists:()=>false});
        export const collection=(d,n)=>n;export const collectionGroup=(d,n)=>n;export const query=(col,...cs)=>({col,cs});export const where=(f,op,v)=>({f,op,v});export const orderBy=f=>({f,op:'orderBy'});
        export const limitToLast=n=>({op:'limit'});export const endBefore=()=>({op:'endBefore'});export const Timestamp={fromMillis:ms=>({ms})};
        export const getDocs=async q=>{(window.__fsq=window.__fsq||[]).push(q.col+':'+q.cs.filter(c=>c.op!=='orderBy').map(c=>c.f+c.op+T(c.v)).join('&'));return {docs:(window.__fsDocs||[]).map(d=>({id:d.id,data:()=>d}))}};`};
    await q.route('https://www.gstatic.com/**',r=>{const f=r.request().url().split('/').pop();return r.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:stub[f]||''})});
    const r=await q.evaluate(async()=>{BOARD_DEPTS.find(d=>d.id==='events').source='firestore';
      window.__fsDocs=[{id:'events__p1',deptId:'events',title:'公開活動',startRaw:today()+' 18:00',endRaw:'',allDay:false,scope:'all-activity',visibility:'public'},
        {id:'events__p2',deptId:'events',title:'部門公開事件',startRaw:today()+' 19:00',endRaw:'',allDay:false,scope:'dept',visibility:'public'}];
      document.body.insertAdjacentHTML('beforeend','<div id="pubV"></div>');calMount($('#pubV'));
      for(let i=0;i<40&&/讀取中/.test($('#pubV .cal-list').textContent);i++)await new Promise(r=>setTimeout(r,100));
      const out={q:[...(window.__fsq||[])],list:$('#pubV .cal-list').textContent};
      calUnmount&&calUnmount($('#pubV'));$('#pubV').remove();CAL_DATA.clear();window.__fsq=[];window.__fbUser={uid:'u1'};
      document.body.insertAdjacentHTML('beforeend','<div id="pubW"></div>');calMount($('#pubW'));
      for(let i=0;i<40&&/讀取中/.test($('#pubW .cal-list').textContent);i++)await new Promise(r=>setTimeout(r,100));
      out.q2=[...window.__fsq];calUnmount&&calUnmount($('#pubW'));$('#pubW').remove();return out}).catch(e=>({err:e.message}));
    ok(!r.err&&r.q.length===2&&r.q.every(x=>/^events:visibility==public&/.test(x)&&!/scope==/.test(x))&&/公開活動/.test(r.list)&&!/部門公開事件/.test(r.list),
      `未登入的公共版：查詢帶 visibility=='public'（${JSON.stringify(r.q)}），只列活動／會議（${(r.list||'').trim().slice(0,30)}）`);
    ok(!r.err&&r.q2&&r.q2.length===2&&r.q2.every(x=>/^events:scope==all-(activity|meeting)&/.test(x)&&!/visibility/.test(x)),`登入後的公共版：照舊用 scope 查（${JSON.stringify(r.q2)}）`);
    await q.close();}
  /* 9e. P2-7：通知頁開著時按設定鍵 */
  {const S3=await c.setup(),q=await S3.mk(1300,900,'light',false);await S3.login(q);await q.click('#notiBtn');await q.waitForTimeout(800);
    await q.click('#setBtn');await q.waitForTimeout(1000);
    const a=await q.evaluate(()=>({st:history.state&&history.state.bl,set:setOpen,noti:notiOpen}));
    ok(a.st==='settings'&&a.set&&!a.noti,`通知頁開著按設定鍵：設定打開、瀏覽紀錄是設定那一筆（${JSON.stringify(a)}）`);
    await q.goBack();await q.waitForTimeout(900);
    const b2=await q.evaluate(()=>({set:setOpen,path:location.pathname,st:history.state}));
    ok(!b2.set&&b2.path.endsWith('index.html'),`系統返回：關掉設定、還在看板（${JSON.stringify(b2)}）`);
    await S3.b.close();}

  console.log(`\n${passes} 通過、${fails} 失敗`);await b.close();process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL 例外：'+e.message);process.exit(1)});
