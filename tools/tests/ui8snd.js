/* ui8snd：ui-08 F 音效（docs/DESIGN-next.md 第十五節；core/js/sfx.js）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   開頁前把 AudioContext 換成記錄用的替身：記下建立幾次、每個 oscillator 的波形與頻率（start 時），同一個工作裡建立的算一組＝一次出聲；
   用第一個 oscillator 的「波形:起始頻率:結束頻率」與這組的 oscillator 數認出是哪一種（參數照模擬頁）。
   1. 主頁桌面：開頁、滾輪（不是使用者手勢）都不建立 AudioContext；方向鍵＝移動焦點、滾輪＝滾動、點別張＝移動焦點（只一種）、
      全會行事曆＝展開、月份選單＝展開、換月＝滾動、Esc 關層＝返回、點焦點那張＝進入；同一個工作裡兩次呼叫只響一種（慶祝優先）、
      同一種 40ms 內只響一次、分頁在背景不響；設定裡關掉音效不響
   2. 主頁音效關閉（開頁前就關）：操作後也沒有建立 AudioContext
   3. 主頁手機：手指拖過一張＝滾動、點露出的那一條＝移動焦點（後面跟來的 click 不再響一般按鈕）、點焦點卡＝進入
   4. 看板桌面：開頁不建立；換分頁＝換頁、議題詳情＝進入、返回鍵＝返回、通知＝換頁、今日層＝展開、Esc＝返回、月份選單＝展開、換月＝滾動、
      設定＝展開、Esc＝返回、打開卡片＝進入、方向鍵換張＝換頁、Esc 收回＝返回、一般按鈕＝一般按鈕、工具列鏡片拖過一格＝移動焦點（放開換頁）
   5. 看板登入後：核取＝勾選（只一次）、點外面存檔成功＝確認；對話框確定＝確認、取消＝否定、Esc＝否定、勾選欄（label 包 input）只響一次；
      拖到刪除角後按「刪除」只有否定（儲存成功不再響確認）；拖到完成角放開只有慶祝
   6. 看板音效關閉：操作後沒有建立 AudioContext
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 記錄用的 AudioContext 替身（開頁前注入） */
const STUB=()=>{const L=window.__snd={made:0,groups:[],cur:null};
  const grp=()=>{if(!L.cur){L.cur=[];L.groups.push(L.cur);queueMicrotask(()=>{L.cur=null})}return L.cur};
  const param=(rec,key)=>({value:0,setValueAtTime(v){if(rec&&rec[key]===undefined)rec[key]=v;return this},exponentialRampToValueAtTime(v){if(rec)rec[key+'1']=v;return this},linearRampToValueAtTime(){return this}});
  const node=o=>Object.assign(o,{connect:x=>x,disconnect(){}});
  class AC{constructor(){L.made++;this.state='running';this.currentTime=0;this.sampleRate=44100;this.destination=node({})}
    createGain(){return node({gain:param()})}
    createDynamicsCompressor(){return node({threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()})}
    createBuffer(c,n){const d=new Float32Array(n);return {getChannelData:()=>d}}
    createBiquadFilter(){return node({type:'',frequency:param(),Q:param()})}
    createBufferSource(){return node({buffer:null,start(){}})}
    createOscillator(){const o=node({type:'sine',stop(){}});o.frequency=param(o,'f');o.start=()=>grp().push({type:o.type,f:o.f,f1:o.f1});return o}
    resume(){this.state='running';return Promise.resolve()}suspend(){return Promise.resolve()}close(){return Promise.resolve()}}
  window.AudioContext=AC;window.webkitAudioContext=AC};
const SIG={'triangle:1320:1040':'move','sine:523:784':'enter','sine:784:494':'back','triangle:660:880':'tab','sine:520:780':'open','sine:1200:1700':'check',
  'sine:784:':'ok','triangle:300:170':'no','square:1800:1500':'roll','sine:880:700':'tap','triangle:523:':'fete'};
const NOSC={move:1,enter:2,back:1,tab:1,open:1,check:1,ok:2,no:1,roll:1,tap:1,fete:14};
const kind=g=>{const f=g[0]||{},k=SIG[`${f.type}:${f.f}:${f.f1===undefined?'':f.f1}`]||`?${f.type}:${f.f}`;return NOSC[k]===g.length?k:`${k}×${g.length}`};
const take=async(p,ms=260)=>{await p.waitForTimeout(ms);return (await p.evaluate(()=>{const g=window.__snd.groups;window.__snd.groups=[];return g})).map(kind)};
const made=p=>p.evaluate(()=>window.__snd.made);
const is=(got,want,m)=>ok(JSON.stringify(got)===JSON.stringify(want),`${m}：${JSON.stringify(got)}`);
const ESC=async(p,ms=360)=>{await p.keyboard.press('Escape');return take(p,ms)};
(async()=>{
  /* ---------- 主頁 ---------- */
  const b=await chromium.launch();
  const mk=async(w,h,o={})=>{const touch=w<700;const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    if(o.off)await ctx.addInitScript(()=>{try{localStorage.setItem('stustsa-ui',JSON.stringify({pal:'fin',sound:false}))}catch(_){}});
    await ctx.addInitScript(STUB);const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;await p.goto(U+'home.html');await p.waitForTimeout(3300);await p.evaluate(()=>{window.__snd.groups=[]});return p};

  /* 1. 桌面 */
  {const p=await mk(1300,860);
    ok(await made(p)===0,'主頁開頁：還沒有使用者操作，沒有建立 AudioContext');
    await p.mouse.move(650,430);await p.mouse.wheel(0,120);
    is(await take(p,500),[],'操作前的滾輪不出聲');ok(await made(p)===0,'滾輪不算使用者手勢：沒有建立 AudioContext');
    await p.keyboard.press('ArrowRight');is(await take(p),['move'],'方向鍵換焦點＝移動焦點');ok(await made(p)===1,'按鍵後建立一個 AudioContext');
    await p.mouse.wheel(0,120);is(await take(p,400),['roll'],'滾輪一格＝滾動');
    const t0=await p.$('.hm-tile[data-i="0"]');await t0.scrollIntoViewIfNeeded();await p.waitForTimeout(400);await p.evaluate(()=>{window.__snd.groups=[]});
    await t0.click();is(await take(p,400),['move'],'點沒有焦點的色塊＝移動焦點（沒有另外的一般按鈕音）');
    await p.click('#hmPub');is(await take(p,500),['open'],'全會行事曆＝展開');
    await p.click('#hmCal [data-calmon]');is(await take(p),['open'],'月份選單＝展開');
    await p.click('#hmCal .cal-pop [data-calset]:not([aria-selected="true"])');is(await take(p,400),['roll'],'選別的月份＝滾動');
    is(await ESC(p,500),['back'],'Esc 關掉行事曆那一層＝返回');
    /* 同一個工作裡只響一種、節流、背景 */
    await p.evaluate(()=>{Sfx.play('check');Sfx.play('no')});is(await take(p),['check'],'同一個工作裡兩次呼叫：只響先來的那一種');
    await p.evaluate(()=>{Sfx.play('tap');Sfx.play('fete')});is(await take(p,300),['fete'],'慶祝優先');
    await p.evaluate(()=>{Sfx.play('tap');setTimeout(()=>Sfx.play('tap'),12);setTimeout(()=>Sfx.play('tap'),26);setTimeout(()=>Sfx.play('tap'),120)});
    is(await take(p,400),['tap','tap'],'節流：同一種 40ms 內只響一次');
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Sfx.play('tap')});is(await take(p),[],'分頁在背景不響');
    await p.evaluate(()=>{delete document.hidden});
    /* 設定裡關掉音效 */
    await p.click('#hmSet');is(await take(p,500),['open'],'外觀那一層＝展開');
    await p.click('#hmLook [data-look-snd]');is(await take(p),[],'關掉音效的那一下不響');
    await p.click('#hmLook .hm-ly-x');is(await take(p,500),[],'音效關閉：關層不響');
    await p.click('#hmSet');await p.waitForTimeout(500);await p.click('#hmLook [data-look-snd]');is(await take(p),['check'],'打開音效：開關的勾選音');
    await p.click('#hmLook .hm-ly-x');is(await take(p,500),['back'],'關閉鈕關層＝返回（只一種）');
    /* 點關閉鈕→history.back→popstate 才真的關：popstate 晚到（超過 40ms 節流）也只響一次；連按兩下不多退一筆 */
    await p.evaluate(()=>{const ob=history.back.bind(history);window.__hb=0;history.back=()=>{window.__hb++;setTimeout(ob,150)}});
    await p.click('#hmPub');await take(p,500);
    await p.click('#hmCal .hm-ly-x');is(await take(p,700),['back'],'點關閉鈕、popstate 晚 150ms 才到：返回只響一次');
    await p.click('#hmPub');await p.waitForTimeout(500);await p.click('#hmCal .hm-ly-x');await p.click('#hmCal .hm-ly-x',{timeout:300}).catch(()=>{});await take(p,700);
    ok(await p.evaluate(()=>window.__hb===2&&!document.getElementById('hmCal')&&!(history.state&&history.state.hmLayer)),'popstate 還沒到時連按兩下關閉鈕：只退一筆瀏覽紀錄、那一層關掉');
    await p.click('#hmSet');await take(p,500);
    is(await ESC(p,700),['back'],'Esc 關層、popstate 晚 150ms 才到：返回只響一次');
    await p.evaluate(()=>{delete history.back});
    const on=await p.$('.hm-tile.on');await on.click();is(await take(p,150),['enter'],'點焦點那張＝進入');
    ok(await made(p)===1,`整段只建立一個 AudioContext（${await made(p)}）`);
    ok(!p.errs.length,`主頁桌面沒有錯誤（${p.errs.slice(0,2).join(' | ')}）`);await p.ctx.close()}

  /* 2. 開頁前就關掉音效 */
  {const p=await mk(1300,860,{off:1});
    await p.keyboard.press('ArrowRight');await p.click('#hmPub');await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(500);
    ok(await made(p)===0&&!(await take(p)).length,`音效關閉：方向鍵、開關層後都沒有建立 AudioContext（${await made(p)}）`);await p.ctx.close()}

  /* 3. 手機卡片堆 */
  {const p=await mk(412,860);
    const cdp=await p.context().newCDPSession(p);const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    await t('touchStart',200,600);for(let i=1;i<=14;i++){await t('touchMove',200,600-i*10);await p.waitForTimeout(16)}await p.waitForTimeout(200);await t('touchEnd');
    is(await take(p,900),['roll'],'手指拖過一張＝滾動');
    const r1=await p.evaluate(()=>{const c=document.querySelectorAll('.hm-wc')[1].getBoundingClientRect();return [c.left+40,c.top+20]});
    await p.touchscreen.tap(r1[0],r1[1]);is(await take(p,900),['move'],'點露出的那一條＝移動焦點（跟來的 click 不響一般按鈕、彈過去的那幾張不逐張響）');
    const rf=await p.evaluate(()=>{const r=document.querySelector('.hm-wc.on').getBoundingClientRect();return [r.left+r.width/2,r.top+60]});
    await p.touchscreen.tap(rf[0],rf[1]);is(await take(p,150),['enter'],'點焦點卡＝進入');
    await p.ctx.close()}
  await b.close();

  /* ---------- 看板 ---------- */
  const {b:b2,mk:mk2,login}=await c.setup();
  const board=async(off)=>{const p=await mk2(1300,900,'light',false);if(off)await p.evaluate(()=>UI.set({sound:false}));await p.context().addInitScript(STUB);await p.reload();await p.waitForTimeout(1800);await p.evaluate(()=>{window.__snd.groups=[]});return p};
  /* 4. 登入前 */
  const p=await board();
  ok(await made(p)===0,'看板開頁：沒有建立 AudioContext');
  await p.click('#tabbar .tab[data-tab="progress"]');is(await take(p,500),['tab'],'工具列換分頁＝換頁');
  await p.click('[data-jump]');is(await take(p,500),['enter'],'點甘特圖的議題＝進入（詳情）');
  await p.click('.dh-home');is(await take(p,500),['back'],'返回甘特圖＝返回');
  await p.click('#tabbar .tab[data-tab="live"]');is(await take(p,600),['tab'],'回即時回報＝換頁');
  await p.click('#notiBtn');is(await take(p,700),['tab'],'通知與行事曆＝換頁');
  await p.click('#notiPage .nd-card.today');is(await take(p,700),['open'],'今日卡片＝展開（今日層）');
  is(await ESC(p,700),['back'],'Esc 關今日層＝返回');
  await p.click('#notiPage [data-calmon]');is(await take(p),['open'],'月份選單＝展開');
  await p.click('#notiPage .cal-pop [data-calset]:not([aria-selected="true"])');is(await take(p,400),['roll'],'換月＝滾動');
  is(await ESC(p,700),['back'],'Esc 離開通知頁＝返回');
  await p.click('#setBtn');is(await take(p,800),['open'],'設定＝展開');
  is(await ESC(p,800),['back'],'Esc 關設定＝返回');
  const ids=await p.evaluate(()=>liveOrder().map(e=>e.id));
  await p.click(`#events [data-cp="${ids[0]}"]`);is(await take(p,600),['enter'],'點膠囊打開卡片＝進入');
  await p.keyboard.press('ArrowRight');is(await take(p,600),['tab'],'方向鍵下一張＝換頁');
  is(await ESC(p,600),['back'],'Esc 收回卡片＝返回');
  await p.evaluate(()=>{const x=document.createElement('button');x.type='button';x.id='sndTap';x.textContent='一般';x.style.cssText='position:fixed;left:600px;top:20px;z-index:99999';document.body.append(x)});
  await p.click('#sndTap');is(await take(p),['tap'],'其他按鈕＝一般按鈕');await p.evaluate(()=>document.getElementById('sndTap').remove());
  /* 工具列鏡片：拖過一格＝移動焦點，放開換到那一頁＝換頁 */
  {const r=await p.evaluate(()=>{const a=document.querySelector('#tabbar .tab.on').getBoundingClientRect(),n=document.querySelector('#tabbar .tab[data-tab="progress"]').getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2,nx:n.x+n.width/2,ny:n.y+n.height/2}});
    await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move((r.x+r.nx)/2,(r.y+r.ny)/2,{steps:6});await p.mouse.move(r.nx,r.ny,{steps:6});await p.waitForTimeout(120);await p.mouse.up();
    const s=await take(p,800);ok(s.length===2&&s[0]==='move'&&s[1]==='tab'&&await p.evaluate(()=>curSec==='progress'),`拖鏡片過一格＝移動焦點，放開換頁：${JSON.stringify(s)}`);
    await p.click('#tabbar .tab[data-tab="live"]');await take(p,600)}
  ok(await made(p)===1,`看板整段只建立一個 AudioContext（${await made(p)}）`);

  /* 5. 登入後 */
  await login(p);await p.waitForTimeout(500);await take(p,100);
  const seed=id=>p.evaluate(id=>{const ev=state.events.find(e=>e.id===id);ev.blocks=[{id:'bC',text:'要勾的事',check:false,timeId:null},{id:'bD',text:'一般文字',check:null,timeId:null}];ev.desc=StoreMap.descOf(ev.blocks);render()},id);
  {const id=(await p.evaluate(()=>liveOrder().map(e=>e.id)))[0];await seed(id);
    await p.click(`#events [data-cp="${id}"]`);await take(p,600);
    await p.click('#evDetail [data-kpck="bC"]');is(await take(p,600),['check'],'核取＝勾選（只響一次）');
    await p.mouse.click(60,860);const s=await take(p,1500);
    is(s,['ok'],'點外面存檔成功＝確認');
    ok(await p.evaluate(id=>state.events.find(e=>e.id===id).blocks[0].check===true,id),'核取有存進去');
    await p.mouse.click(60,860);await take(p,600)}
  /* 對話框 */
  {const run=async(act,m,want)=>{await p.evaluate(()=>{window.__r=ask('測試',[{name:'v',label:'名稱'},{name:'c',label:'勾選欄',type:'check'}])});await p.waitForTimeout(400);await take(p,50);
      await act();is(await take(p,400),want,m)};
    await run(async()=>{await p.click('#dlgForm .fld-check span');is(await take(p),['check'],'勾選欄（label 包 input）只響一次勾選');await p.click('#dlgForm [data-act=ok]')},'對話框確定＝確認',['ok']);
    await run(()=>p.click('#dlgForm [data-act=cancel]'),'對話框取消＝否定',['no']);
    await run(()=>p.keyboard.press('Escape'),'對話框 Esc＝否定',['no']);}
  /* 拖到角落：刪除確認、完成 */
  const drag=async(id,x,y,hold)=>{const r=await p.evaluate(id=>{const e=document.querySelector(`#events .cp[data-cp="${id}"]`).getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}},id);
    await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x+10,r.y+4,{steps:3});await p.mouse.move(x,y,{steps:14});await p.waitForTimeout(150);if(hold)await hold();await p.mouse.up()};
  {const ids2=await p.evaluate(()=>liveOrder().map(e=>e.id).filter(id=>!(state.events.find(e=>e.id===id).times||[]).length));
    await drag(ids2[0],10,10);await p.waitForTimeout(500);await take(p,50);
    await p.click('#dlgForm [data-act=delete]');const s=await take(p,1800);
    is(s,['no'],'拖到刪除角後按「刪除」：只有否定（之後儲存成功不再響確認）');
    ok(await p.evaluate(id=>!state.events.some(e=>e.id===id),ids2[0]),'真的刪掉了');
    const id2=(await p.evaluate(()=>liveOrder().map(e=>e.id)))[0];
    await drag(id2,1290,10,()=>take(p,10));const f=await take(p,2200);
    is(f,['fete'],'拖到完成角放開：只有慶祝（儲存成功不再響確認）');
    ok(await p.evaluate(id=>!!state.events.find(e=>e.id===id).doneAt,id2),'真的完成了')}
  ok(!p.errs.length,`看板沒有錯誤（${p.errs.slice(0,3).join(' | ')}）`);
  await p.close();

  /* 6. 看板音效關閉 */
  {const q=await board(true);
    await q.click('#tabbar .tab[data-tab="progress"]');await q.waitForTimeout(500);await q.click('#setBtn');await q.waitForTimeout(600);await q.keyboard.press('Escape');await q.waitForTimeout(600);
    ok(await made(q)===0&&!(await take(q)).length,`看板音效關閉：換頁、設定開關後都沒有建立 AudioContext（${await made(q)}）`);await q.close()}
  await b2.close();
  console.log(`\n${passes} OK、${fails} FAIL`);process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL 例外 '+e.stack);process.exit(1)});
