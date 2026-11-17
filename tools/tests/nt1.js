/* 通知（notify.js）：鈴鐺數字（逾期數）、今日／明日卡片、海報月曆（月份字、時段細線、同週分層）、點明日＝選到那一天、今日層、換月、點日期、Esc 關閉；
   桌面 1300 深色、手機 412 淺色。固定 8300 埠；截圖 nt1_*.png
   ui-06（2026-11-17，DESIGN-next 第九節）改成部門內的一頁（#notiPage），跟新規格衝突的斷言拿掉或改寫：
   - 搜尋欄（#notiQ、結果、sticky）拿掉：新的通知頁沒有搜尋（搜尋列只在即時回報、進度、完成紀錄三頁）
   - 「整理」左右滑（今天處理／還不要、復原、TRI）拿掉：改成逾期卡片堆（左滑延後、右滑改時間），在 ui6.js 測
   - 今日卡片的「今天處理 N 件」、今日層的「今天處理」區拿掉：今日層只剩「本來就要做」
   - 「本部門｜全會」切換拿掉：改成五類模式，在 ui6.js 測；「這一天」區塊（#notiDay）拿掉：點日期換下面的清單
   - 上下月鈕（data-nmon）拿掉：改成月份鈕的選單（data-calmon、data-calset）；關閉鈕（#notiClose）拿掉：再按通知鈕或 Esc */
const c=require('./common');(async()=>{const {b,mk}=await c.setup();let bad=0;const say=(v,m)=>{console.log((v?'':'FAIL ')+m);if(!v)bad++};
for(const [w,h,sc,tc] of [[1300,900,'dark',false],[412,860,'light',true]]){const p=await mk(w,h,sc,tc);
 await p.evaluate(()=>{const t=today(),e=state.events.find(x=>!x.doneAt);e.times=[
   {id:'tA',label:'開會',start:t+'T23:58',end:'',place:'行政大樓'},{id:'tB',label:'問卷期間',start:t,end:addDays(t,4),place:''},{id:'tC',label:'明日回覆',start:addDays(t,1),end:'',place:''},
   {id:'tD',label:'副校長約談',start:addDays(t,3)+'T15:30',end:'',place:'副校長室'},{id:'tE',label:'提案收件',start:addDays(t,2),end:addDays(t,5),place:'學生會辦公室'},{id:'tF',label:'成果發表',start:addDays(t,9),end:'',place:'演講廳'}];
   state.issues.forEach(i=>{i.start=t;i.end=addDays(t,1)});render()});
 /* 鈴鐺數字＝逾期數（ui-04）：上面的時間標記都沒有連到行（沒有勾選狀態）→ 不算，數字是空的；加一行連到過去時間、沒勾的 → 1 */
 {const bd=await p.evaluate(()=>{const e=state.events.find(x=>!x.doneAt),a=$('#notiBtn .noti-n').textContent;e.times.push({id:'tZ',label:'過期',start:addDays(today(),-2),end:'',place:''});e.blocks=[...(e.blocks||[]),{id:'bZ',text:'過期',check:false,timeId:'tZ'}];render();
    const b=$('#notiBtn .noti-n').textContent;e.times=e.times.filter(x=>x.id!=='tZ');e.blocks=e.blocks.filter(x=>x.id!=='bZ');render();return [a,b,$('#notiBtn .noti-n').textContent]});
  say(bd[0]===''&&bd[1]==='1'&&bd[2]==='',`${w} badge 逾期數：時間標記沒有連到行時是空的（${JSON.stringify(bd[0])}），加一行過期沒勾的變 ${bd[1]}，拿掉回到空的`)}
 await p.click('#notiBtn');await p.waitForTimeout(900);
 const cards=await p.evaluate(()=>[...document.querySelectorAll('#notiPage .nd-card')].map(c=>c.querySelectorAll('.nd-row').length+':'+c.classList.contains('today')));
 say(cards.join()==='2:true,2:false',`${w} cards ${cards}`);
 const po=await p.evaluate(()=>[$('.pc-mon').textContent.replace(/^\d+/,''),document.querySelectorAll('.pc-e.span').length,Math.max(...[...document.querySelectorAll('.pc-week')].map(x=>+x.style.getPropertyValue('--lanes')))]);
 say(/^[A-Z]{3}$/.test(po[0])&&po[1]>=2&&po[2]>=2,`${w} poster ${po}`);
 await p.screenshot({path:`nt1_${w}.png`});
 /* 卡片：點明日＝行事曆選到那一天，下面的清單是那一天 */
 await p.click('#notiPage .nd-card:not(.today)');await p.waitForTimeout(900);
 const od=await p.evaluate(()=>[NOTI.day===addDays(today(),1),document.querySelectorAll('.cal-list .cal-ev').length,$('.pc-d.sel')?.dataset.calday===NOTI.day]);
 say(od[0]&&od[1]===2&&od[2],`${w} open day ${od}`);
 /* 今日卡片：點了放大成全螢幕的「今日」層（本來就要做） */
 await p.evaluate(()=>$('#notiPage .nd-card.today').scrollIntoView({block:'center'}));await p.click('#notiPage .nd-card.today');await p.waitForTimeout(250);
 await p.screenshot({path:`nt1_${w}_today_mid.png`});await p.waitForTimeout(900);
 const tl=await p.evaluate(()=>[todayOpen,!$('#todayOv').hidden,[...document.querySelectorAll('#todayOv .td-sec h3')].map(h=>h.textContent.replace(/\s+/g,'')).join('/'),document.querySelectorAll('#todayOv .td-row').length]);
 say(tl[0]&&tl[1]&&tl[2]==='本來就要做2'&&tl[3]===2,`${w} today layer ${tl}`);
 await p.screenshot({path:`nt1_${w}_today.png`});
 await p.keyboard.press('Escape');await p.waitForTimeout(1200);
 const tc2=await p.evaluate(()=>[todayOpen,$('#todayOv').hidden,notiOpen,$('#notiPage .nd-card.today').style.opacity]);
 say(!tc2[0]&&tc2[1]&&tc2[2]&&tc2[3]==='',`${w} today closed, noti still open ${tc2}`);
 /* 換月（月份選單）、點日期 */
 await p.evaluate(()=>$('#notiPage .cal').scrollIntoView());await p.click('[data-calmon]');await p.waitForTimeout(400);
 const nm=await p.evaluate(()=>{const ms=[...document.querySelectorAll('.cal-pop [data-calset]')].map(x=>x.dataset.calset);return ms[ms.indexOf(NOTI.month)+1]||ms[0]});
 await p.click(`.cal-pop [data-calset="${nm}"]`);await p.waitForTimeout(700);
 const mo=await p.evaluate(()=>[NOTI.month,$('.pc-mon').textContent.replace(/^\d+/,'')]);say(mo[0]===nm,`${w} month ${mo}`);
 await p.click('#notiPage .pc-d:not(.pc-pad)');await p.waitForTimeout(400);const dd=await p.evaluate(()=>NOTI.day);say(dd===nm+'-01',`${w} day ${dd}`);
 await p.keyboard.press('Escape');await p.waitForTimeout(800);const cl=await p.evaluate(()=>[notiOpen,$('#notiPage').classList.contains('cur')]);say(!cl[0]&&!cl[1],`${w} closed ${cl}`);
 const er=p.errs.filter(x=>!x.includes('404'));say(!er.length,`${w} errs ${JSON.stringify(er)}`)}
await b.close();process.exit(bad?1:0)})();
