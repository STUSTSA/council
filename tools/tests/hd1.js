/* 頁首精簡（logo 置中、玻璃搜尋欄、只留週次）、頁首搜尋、設定頁「每週概述」、秘書處「各部門週報」調閱。
   桌面 1300 深色、手機 412 淺色。固定 8300 埠；截圖 hd1_*.png
   2026-11-17（ui-05 審查 P1-1）：搜尋按 Enter 打開的即時回報改看 lvOpen＋卡片（#evDetail／#lcFull 的 .lc；以前是 details.ev[open]、.ev.sel、.evd）
   2026-11-18（ui-07）：頁首改看新標題列（ui-04 起，DESIGN-next 第六節「部門內」）。舊斷言測的是 2026-11-06 的玻璃頁首，第 9 行讀 .logo-box 就中斷：
   - 「logo 置中」→ 標題列最左邊是首頁鍵（連到 home.html），後面是部門名；
   - 「placeholder 搜尋 權益部 第N週」→ 搜尋列 #dSearch 在標題列下面、placeholder 只有「搜尋」（前後端交接-next.md 第九節：輸入框只放欄位名稱；週次已不顯示）；
   - 「通知鈕在搜尋欄右邊、垂直置中」→ 通知鈕在標題列裡、部門名右邊；
   - 「沒有舊頁首殘留」多查 .logo-box、.hero、.hero-search。
   搜尋結果的項目 .hr-item → .dr-item（search.js）。Enter 打開之後加一步 Esc 收回卡片（手機是全螢幕卡片，會蓋住工具列的設定鍵；main 上這支在第 9 行就中斷，從沒走到這裡）。
   秘書處「各部門週報」先切到秘書處自己的分頁（ui-04 起部門內一次只顯示一區，#wkPanel 在 ext 分頁）。搜尋、Enter 打開、每週概述、秘書處週報的斷言不變 */
const c=require('./common');c.serveRemote=true;
const A=(ok,m)=>{if(!ok){console.log('FAIL:',m);process.exitCode=1}};   /* 2026-11-11：只印數值改成逐項判斷，壞了就以非 0 結束 */
(async()=>{const {b,mk}=await c.setup();
for(const [w,h,sc,tc] of [[1300,900,'dark',false],[412,860,'light',true]]){c.q='';const p=await mk(w,h,sc,tc);
 await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(300);
 const hd=await p.evaluate(()=>{const h=$('.dhead'),hr=h.getBoundingClientRect(),home=h.querySelector('.dh-home'),hm=home.getBoundingClientRect(),nm=$('#dhName').getBoundingClientRect(),bl=$('#notiBtn').getBoundingClientRect(),sr=$('#dSearch').getBoundingClientRect();
   return {home:home.getAttribute('href')==='home.html'&&home===h.firstElementChild&&hm.left<nm.left,name:$('#dhName').textContent,ph:$('#boardQ').placeholder,below:sr.top>=hr.bottom-1,
     bell:!$('#notiBtn').hidden&&h.contains($('#notiBtn'))&&bl.left>nm.right,old:!!document.querySelector('#weekBtn,#bigDate,#titleSlot,.logo-box,.hero,.hero-search'),saveInfo:getComputedStyle($('#saveInfo')).width}});console.log(w,'header',JSON.stringify(hd));
 A(hd.home&&hd.name==='權益部','home key leftmost, dept name');A(hd.ph==='搜尋'&&hd.below,'search bar below header, placeholder only 搜尋');A(hd.bell,'bell in header right of name');A(!hd.old,'header leftovers');
 await p.screenshot({path:`hd1_${w}.png`,clip:{x:0,y:0,width:w,height:300}});
 /* 搜尋 */
 const t=await p.evaluate(()=>state.events.find(e=>!e.doneAt).name);const q=t.slice(0,2);
 await p.fill('#boardQ',q);await p.waitForTimeout(400);
 const sr=await p.evaluate(()=>[!$('#boardRes').hidden,document.querySelectorAll('#boardRes .dr-item').length,$('#boardRes mark')?.textContent]);console.log(w,'search',q,sr);A(sr[0]&&sr[1]>0&&sr[2]===q,'search results');
 await p.screenshot({path:`hd1_${w}_search.png`});
 await p.keyboard.press('Enter');await p.waitForTimeout(900);
 const go=await p.evaluate(()=>[curSec,$('#boardRes').hidden||getComputedStyle($('#boardRes')).opacity,!!lvOpen&&!!document.querySelector('#evDetail>.lc, #lcFull:not([hidden])>.lc')]);console.log(w,'go',go);A(go[0]==='live'&&(go[1]===true||go[1]==='0')&&go[2],'enter opens event');
 await p.keyboard.press('Escape');await p.waitForTimeout(900);A(await p.evaluate(()=>!lvOpen),'Esc closes the card');   /* ui-07：手機打開的是全螢幕卡片（ui-05 起），會蓋住工具列的設定鍵，先收回再進設定 */
 /* 設定 → 每週概述 */
 await p.click('#setBtn');await p.waitForTimeout(800);
 const wr=await p.evaluate(()=>!!$('#setOv [data-set=week]'));console.log(w,'set week row',wr);A(wr,'week row');
 await p.click('#setOv [data-set=week]');await p.waitForTimeout(1200);
 const ow=await p.evaluate(()=>[!!weekPaneEnd,setOpen,$('#setOv').hidden,!$('#weekSecLink').hidden,!$('#weekWrap').hidden&&!!$('#weekWrap').closest('#setOv,#setSub')]);console.log(w,'on week',ow);   /* 2026-11-06 每週概述改成設定裡的面板（weekly.js 的 weekPane；weekPaneEnd 有值＝開著），onWeek 已拿掉 */
 A(ow[0]&&ow[1]&&ow[4],'week pane open in settings');
 await p.click('.dh-home');await p.waitForTimeout(900);const bk=await p.evaluate(()=>[!!weekPaneEnd,setOpen,$('#weekWrap').hidden]);console.log(w,'back',bk);A(!bk[0]&&bk[1]&&bk[2],'back to settings list');   /* 手機在子頁，用子頁上方的「返回」 */
 const er=p.errs.filter(x=>!x.includes('404'));console.log(w,'errs',er);A(!er.length,'errors');await p.context().close()}
/* 秘書處 */
c.q='?d=secretariat';const p=await mk(1300,900,'dark',false);
await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(1500);
await p.evaluate(()=>setSection('ext',{instant:true}));await p.waitForTimeout(500);   /* ui-07：部門內一次只顯示一區（ui-04 起），各部門週報在秘書處自己的分頁 */
const sp=await p.evaluate(()=>[!$('#wkPanel').hidden,document.querySelectorAll('#wkDepts .wk-d').length,document.querySelectorAll('#wkBody .wk-doc').length]);console.log('sec panel',sp);A(sp[0]&&sp[1]>0,'sec weekly panel');
await p.click('#wkDepts [data-wkd=rights]');await p.waitForTimeout(400);
const rr=await p.evaluate(()=>[document.querySelectorAll('#wkBody .wk-w').length,$('#wkBody .wk-text')?.textContent.slice(0,20)]);console.log('rights',rr);A(rr[0]>0,'rights weekly reports');
await p.evaluate(()=>$('#wkPanel').scrollIntoView());await p.screenshot({path:'hd1_sec.png'});
const se=p.errs.filter(x=>!x.includes('404'));console.log('sec errs',se);A(!se.length,'sec errors');
await b.close()})();
