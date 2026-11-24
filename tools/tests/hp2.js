/* hp2：專案頁（index.html?d=events&proj=專案 ID；2026-11-24）。github 模式（data_test.json 當成活動部的資料），固定 8300 埠。
   1. 標題列是專案名稱＋PROJECT 小標（日期、倒數）；只有即時回報、完成紀錄兩個分頁，只列這個專案的；結案後唯讀
   2. 沒帶 proj、proj 找不到：照一般的活動部看板（全部都列）
   3. 登入後在專案頁新增卡片：自動掛在這個專案底下
   4. 活動部看板的專案編輯可以挑圖示（其他部門沒有這一欄）
   失敗會印 FAIL 並以非 0 結束。node hp2.js shot 另存截圖 */
const c=require('./common');c.serveDept=true;
let fails=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(!v)fails++};
const ICO_N=20,PID='imvpc3f0dcpi6',SHOT=process.argv[2]==='shot';
const read=p=>p.evaluate(()=>({nm:$('#dhName').textContent,en:$('#dhEn').textContent,title:document.title,live:liveOrder().length,cp:document.querySelectorAll('#events .cp').length,done:doneItems().length,act:activeIssues().length,
  ro:readOnly()}));
(async()=>{
  c.q='?d=events&proj='+PID;
  {const S=await c.setup(),p=await S.mk(1366,900,'light',false);const a=await read(p);
    ok(a.nm==='六宿停車場雜物'&&/^PROJECT　3\/1　D[−+]\d+/.test(a.en)&&a.title==='六宿停車場雜物',`專案頁標題列：${a.nm}｜${a.en}`);
    ok(a.live===1&&a.cp===1&&a.done===3&&a.act===1,`只列這個專案：即時回報 ${a.live}、完成紀錄 ${a.done}、進度 ${a.act}`);
    if(SHOT)await p.screenshot({path:'/mnt/project-files/home-projects/專案頁_電腦.png'});
    ok(await p.evaluate(()=>SECS.join()==='live,done'&&!document.querySelector('#tabbar [data-sec="progress"],.tb-main [data-sec="progress"]')),'只有即時回報、完成紀錄兩個分頁');
    await S.login(p);await p.waitForTimeout(500);
    const n0=await p.evaluate(()=>state.events.length);
    await p.click('#addEvent').catch(()=>{});await p.waitForTimeout(500);await p.click('[data-fabadd]').catch(()=>{});await p.waitForTimeout(900);
    const b=await p.evaluate(P=>{const e=state.events[state.events.length-1]||{};return {n:state.events.length,iss:state.events.filter(x=>x.name==='新的即時回報').map(x=>x.issueId).join()}},PID);
    ok(b.n===n0+1&&b.iss===PID,`專案頁新增卡片：掛在這個專案底下（${b.n-n0} 張，母專案 ${b.iss}）`);
    ok(!p.errs.length,`沒有錯誤（${p.errs.join('｜').slice(0,200)}）`);await S.b.close()}
  {const S=await c.setup(),p=await S.mk(412,900,'light',true);const a=await read(p);
    ok(a.nm==='六宿停車場雜物'&&a.live===1&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`手機專案頁：${a.nm}，沒有橫捲`);
    if(SHOT){await p.waitForTimeout(3000);await p.screenshot({path:'/mnt/project-files/home-projects/專案頁_手機.png'})};await S.b.close()}
  for(const q of ['?d=events','?d=events&proj=nope']){c.q=q;const S=await c.setup(),p=await S.mk(1366,900,'light',false);const a=await read(p);
    ok(a.nm==='活動部'&&a.live===4&&a.act===4,`${q}：一般的活動部看板（即時回報 ${a.live}、專案 ${a.act}）`);await S.b.close()}
  /* 通知與行事曆：專案頁只有這個專案的時間、沒有範圍切換與找重疊；活動部自己的行事曆把專案的時間標上專案名稱 */
  const seedT=p=>p.evaluate(P=>{const t=today(),a=state.events.find(e=>!e.doneAt&&e.issueId===P),b=state.events.find(e=>!e.doneAt&&!e.issueId);
    a.times=[{id:'tA',label:'專案的事',start:t+'T23:50',end:'',place:''}];a.blocks=[{id:'bA',text:'專案的事',check:false,timeId:'tA'}];
    b.times=[{id:'tB',label:'部門的事',start:t+'T23:55',end:'',place:''}];b.blocks=[{id:'bB',text:'部門的事',check:false,timeId:'tB'}];render()},PID);
  const cal=p=>p.evaluate(()=>({seg:!!document.querySelector('#notiPage .cal-seg'),fb:!!document.querySelector('#notiPage [data-calfind]'),ev:[...document.querySelectorAll('#notiPage .cal-list .cal-ev')].map(x=>x.querySelector('.ce-n').textContent.trim()+'｜'+x.querySelector('.ce-k').textContent).join(),
    cards:document.querySelectorAll('#notiPage .nd-card').length,mine:notiMine().length}));
  {c.q='?d=events&proj='+PID;const S=await c.setup(),p=await S.mk(1366,900,'light',false);await seedT(p);await p.click('#notiBtn');await p.waitForTimeout(1000);const a=await cal(p);
    ok(a.mine===1&&/^專案的事｜/.test(a.ev)&&!/部門的事/.test(a.ev)&&!a.seg&&!a.fb&&a.cards>=2,`專案頁的通知：今日／明日照舊，行事曆只有這個專案的時間、沒有範圍切換（${a.ev}）`);
    if(SHOT)await p.screenshot({path:'/mnt/project-files/home-projects/專案頁_通知.png'});await S.b.close()}
  {c.q='?d=events';const S=await c.setup(),p=await S.mk(1366,900,'light',false);await seedT(p);await p.click('#notiBtn');await p.waitForTimeout(1000);const a=await cal(p);
    ok(a.mine===2&&/專案的事｜六宿停車場雜物/.test(a.ev)&&/部門的事｜/.test(a.ev)&&a.seg,`活動部自己的行事曆：專案的時間標出專案名稱（${a.ev}）`);await S.b.close()}
  /* 專案的圖示：活動部看板的專案編輯裡挑，按完成才寫回；選「不用」拿掉 */
  {c.q='?d=events';const S=await c.setup(),p=await S.mk(1366,900,'light',false);await S.login(p);await p.waitForTimeout(400);
    await p.evaluate(P=>{setSection('progress',{instant:true});progShow(P)},PID);await p.waitForTimeout(900);await p.evaluate(P=>startEdit('i:'+P),PID);await p.waitForTimeout(900);
    await p.click('[data-ifpen="icon"]');await p.waitForTimeout(500);
    const n=await p.evaluate(()=>document.querySelectorAll('[data-iffk="icon"] [data-iffx="icopick"]').length);
    await p.click('[data-iffk="icon"] [data-iffx="icopick"][data-i="flag"]');const mid=await p.evaluate(P=>state.issues.find(i=>i.id===P).icon||'',PID);
    if(SHOT){await p.waitForTimeout(500);await p.screenshot({path:'/mnt/project-files/home-projects/專案圖示選單.png'})}
    await p.click('[data-iffk="icon"] [data-iffx="ok"]');await p.waitForTimeout(500);
    const a=await p.evaluate(P=>({icon:state.issues.find(i=>i.id===P).icon||'',view:!!document.querySelector('[data-iffk="icon"] .ico-view svg')}),PID);
    ok(n===ICO_N+1&&mid===''&&a.icon==='flag'&&a.view,`專案編輯挑圖示：${n} 顆、按完成才寫回（${a.icon}）`);
    await p.click('[data-ifpen="icon"]');await p.waitForTimeout(400);await p.click('[data-iffk="icon"] [data-iffx="icopick"][data-i=""]');await p.click('[data-iffk="icon"] [data-iffx="ok"]');await p.waitForTimeout(400);
    ok(await p.evaluate(P=>!('icon' in state.issues.find(i=>i.id===P)),PID),'選「不用」：圖示欄位拿掉');
    ok(!p.errs.length,`沒有錯誤（${p.errs.join('｜').slice(0,200)}）`);await S.b.close()}
  {c.q='';const S=await c.setup(),p=await S.mk(1366,900,'light',false);await S.login(p);
    await p.evaluate(()=>{setSection('progress',{instant:true});progShow(state.issues[0].id)});await p.waitForTimeout(900);await p.evaluate(()=>startEdit('i:'+state.issues[0].id));await p.waitForTimeout(900);
    ok(await p.evaluate(()=>!document.querySelector('[data-iffk="icon"]')&&!!document.querySelector('[data-iffk="dates"]')),'其他部門的議題沒有圖示欄位');await S.b.close()}
  /* 已結案的專案：專案頁唯讀 */
  {c.q='?d=events&proj='+PID;const S=await c.setup(),p=await S.mk(1366,900,'light',false);await S.login(p);await p.waitForTimeout(400);
    const r=await p.evaluate(P=>{const a=readOnly();state.issues.find(i=>i.id===P).doneAt=today();render();return {a,b:readOnly(),en:$('#dhEn').textContent}},PID);
    ok(!r.a&&r.b&&/已結案/.test(r.en),`專案結案後整頁唯讀（${r.en}）`);await S.b.close()}
  console.log(fails?`\n${fails} 項失敗`:'\n全部通過');process.exit(fails?1:0)})();
