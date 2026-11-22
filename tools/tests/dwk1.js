/* dwk1：完成紀錄的週疊卡（views.js 的 renderDone／doneWeekShow）。用 data_test.json，頁面時間固定在 2026-10-30（那一週＝10/26 – 11/01）。
   週疊卡（週一到週日、最新在最上面、每張露出第幾週、日期範圍與張數）→ 點一張就地展開那一週的膠囊清單，再點收起、點別週換那張 → 開卡片；左上鍵變「上一頁」（不另放返回鈕）、
   手機的系統返回鍵一層一層退（卡片 → 那一週 → 總覽）；切換分頁會離開那一週；搜尋完成紀錄會直接進到那一週並打開卡片；標題裡的 HTML 要被跳脫。
   截圖：桌面、手機、淺色、深色，輸出在目前資料夾（dwk_*.png） */
const c=require('./common');
const NOW=new Date('2026-10-30T10:00:00');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk}=await c.setup(__dirname+'/data_test.json');
const open=async(w,h,sc,touch)=>{const p=await mk(w,h,sc,touch);await p.context().clock.setFixedTime(NOW);await p.reload();await p.waitForTimeout(1800);
  await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(600);return p};
const homeUp=p=>p.evaluate(()=>document.querySelector('.dhead .dh-home').classList.contains('up'));
const expected=p=>p.evaluate(()=>{const it=doneItems(),m={};it.forEach(x=>{const w=wkStart(x.d);m[w]=(m[w]||0)+1});return m});
const dir=process.env.SHOTS||'.';
for(const [w,h,sc,touch,tag] of [[1366,800,'light',false,'desk'],[390,780,'light',true,'mob'],[390,780,'dark',true,'mobdark'],[1366,800,'dark',false,'deskdark']]){
 const p=await open(w,h,sc,touch);const exp=await expected(p);const weeks=Object.keys(exp).sort().reverse();
 ok(weeks.length>=3,tag+'：測試資料至少跨三週：'+weeks.join(','));
if(!touch){   /* 電腦：跟電腦版主頁一樣的一排方塊（.wks-rail／.hm-tile／.hm-ring），焦點週的內容畫在下面；不登記 Back */
  const ds=await p.$$eval('#doneRail .hm-tile',x=>x.map(e=>e.dataset.wk));
  ok(weeks.every(k=>ds.includes(k))&&JSON.stringify(ds)===JSON.stringify([...ds].sort().reverse())&&ds[0]===weeks[0],tag+'：一排方塊、最新在最左，有完成紀錄的週都在（另外會多列有每週報告的週與當週）');
  ok(await p.$eval('#doneList',e=>true)&&!(await p.$('#doneList .wks')),tag+'：電腦版沒有手機那種疊卡');
  ok(await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[0]&&!!(await p.$('#wksRing')),tag+'：焦點在最新一週，有焦點框');
  const t0=await p.$eval('#doneRail .hm-tile',e=>e.textContent);ok(t0.includes('第 8 週')&&t0.includes('10/26 – 11/01')&&t0.includes('WEEK 8'),tag+'：方塊寫第幾週與日期：'+t0.slice(0,40));
  ok(await p.$$eval('#doneList .cp.done',x=>x.length)===exp[weeks[0]]&&!!(await p.$('#doneList .wk-rep')),tag+'：下面是焦點週：每週報告＋該週所有卡片');
  ok(!(await homeUp(p))&&await p.evaluate(()=>Back.depth())===0,tag+'：只換焦點，左上角還是首頁鍵、沒登記 Back');
  await p.screenshot({path:`${dir}/dwk_${tag}_rail.png`});
  await p.click('#doneRail .hm-tile:nth-child(3)');await p.waitForTimeout(900);
  ok(await p.evaluate(()=>doneWeek)===weeks[2]&&await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[2]&&await p.$$eval('#doneList .cp.done',x=>x.length)===exp[weeks[2]],tag+'：點第三個方塊，焦點與下面內容換成那一週');
  await p.keyboard.press('ArrowLeft');await p.waitForTimeout(700);
  ok(await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[1],tag+'：左方向鍵移到前一週');
  const rb=await p.$eval('#doneRail',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await p.mouse.move(rb.x,rb.y);await p.mouse.wheel(0,120);await p.waitForTimeout(700);
  ok(await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[2],tag+'：滑鼠在方塊列上往下滾，換到較舊的一週');
  await p.mouse.wheel(0,-120);await p.waitForTimeout(700);
  ok(await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[1],tag+'：往上滾回較新的一週');
  await p.mouse.wheel(0,120);await p.mouse.wheel(0,120);await p.mouse.wheel(0,120);await p.waitForTimeout(700);
  ok(await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[2],tag+'：連滾三下被節流，只換一週');
  await p.mouse.wheel(0,-120);await p.waitForTimeout(700);
  /* 滾輪換週時整頁不能抖：方塊列的上緣、頁面的回彈位移要一直不動 */
  await p.evaluate(()=>{window.__wob=[];(function f(){window.__wob.push([Math.round(document.querySelector('#doneRail').getBoundingClientRect().top),document.querySelector('#pageMain .wrap').style.transform]);requestAnimationFrame(f)})()});
  await p.mouse.move(rb.x,rb.y);for(let k=0;k<3;k++){await p.mouse.wheel(0,100);await p.waitForTimeout(250)}await p.waitForTimeout(500);
  const wob=await p.evaluate(()=>window.__wob);ok(new Set(wob.map(x=>x[0])).size===1&&wob.every(x=>!x[1]),tag+'：滾輪換週時方塊列位置不動、頁面沒有被回彈拉動（'+new Set(wob.map(x=>x[0])).size+' 種位置）');
  for(let k=0;k<3;k++){await p.mouse.wheel(0,-100);await p.waitForTimeout(250)}await p.waitForTimeout(500);
  await p.mouse.move(rb.x,700);const y0=await p.evaluate(()=>document.querySelector('#donePanel').closest('.page').scrollTop);await p.mouse.wheel(0,200);await p.waitForTimeout(500);
  ok(await p.$eval('#doneRail .hm-tile.on',e=>e.dataset.wk)===weeks[1],tag+'：滑鼠不在方塊列上，滾輪不換週');
  await p.click('#doneList .cp.done');await p.waitForTimeout(900);
  ok(await p.evaluate(()=>!!dnOpen&&$('#doneMD').classList.contains('split')),tag+'：點膠囊開卡片，分兩欄、方塊還在上面');
  await p.screenshot({path:`${dir}/dwk_${tag}_card.png`});
  await p.keyboard.press('Escape');await p.waitForTimeout(800);
  await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(400);await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(500);
  await p.fill('#boardQ','法規彙編');await p.waitForTimeout(500);
  await p.click('#boardRes .dr-item.done');await p.waitForTimeout(1400);
  ok(await p.evaluate(()=>doneWeek!==null&&dnOpen!==null),tag+'：搜尋完成紀錄：焦點移到那一週並開卡片');
  ok(p.errs.length===0,tag+'：沒有 console 錯誤 '+p.errs.join('|'));
  await p.close();continue}
 const ds=await p.$$eval('#wksWal .hm-wc',x=>x.map(e=>e.getAttribute('aria-label')));
 const tap=async i=>{await p.click(`#wksWal .hm-wc[data-i="${i}"]`,{position:{x:60,y:18}});await p.waitForTimeout(1000)};
 const foc=()=>p.evaluate(()=>+document.querySelector('#wksWal .hm-wc.on').dataset.i);
 ok(weeks.length<=ds.length&&!(await p.$('#doneList .wks-c')),tag+'：總覽是主頁那種疊卡（.hm-wal／.hm-wc），有完成紀錄的週都在（另外會多列有每週報告的週與當週）');
 ok(await p.evaluate(()=>typeof Wallet.make==='function'&&!!document.querySelector('#wksWal.hm-wal')),tag+'：用的是同一個 Wallet 動作引擎');
 const tf=await p.$$eval('#wksWal .hm-wc',x=>x.map(e=>e.style.transform));
 ok(tf.length>=3&&tf[0]!==tf[1]&&tf[1]!==tf[2]&&tf.every(t=>/translate3d/.test(t)),tag+'：每張位置不同，有前後層次（焦點卡整張、後面只露一條）：'+tf.slice(0,3).join(' / '));
 ok(await foc()===0,tag+'：焦點在最新一週');
 const t0=await p.$eval('#wksWal .hm-wc',e=>e.textContent);ok(/WEEK \d+/.test(t0)&&/第 \d+ 週/.test(t0),tag+'：每張寫第幾週與日期範圍：'+t0.slice(0,40));
 ok(weeks.every(k=>new Date(k+'T00:00:00').getDay()===1),tag+'：每一週都從週一開始');
 ok(!(await homeUp(p)),tag+'：總覽時左上角還是首頁鍵');
 await p.screenshot({path:`${dir}/dwk_${tag}_folders.png`});
 /* 點露出的那一條＝叫到焦點；再點焦點卡＝進那一週的獨立檢視 */
 await tap(2);ok(await foc()===2&&await p.evaluate(()=>doneWeek)===null,tag+'：點露出的一條＝叫到焦點，還沒進去');
 await tap(2);
 ok(await p.$$eval('#doneList .wks-c.on .cp.done',x=>x.length)===exp[weeks[2]]&&!(await p.$('#wksWal')),tag+'：再點焦點卡＝進獨立檢視，列出那一週的所有卡片');
 ok(await homeUp(p)&&await p.evaluate(()=>Back.depth())===1,tag+'：左上角變成上一頁、Back 疊一層');
 ok(!(await p.$('#donePanel .pv-back,#donePanel [data-lcback],#donePanel .wk-back')),tag+'：那一頁裡沒有另外的返回鈕');
 await p.screenshot({path:`${dir}/dwk_${tag}_week.png`});
 await p.click('#doneList .wks-c.on .cp.done');await p.waitForTimeout(900);
 ok(await p.evaluate(()=>!!dnOpen),tag+'：點膠囊開卡片（沿用原本的樣子）');
 await p.screenshot({path:`${dir}/dwk_${tag}_card.png`});
 if(touch){
  ok(await p.evaluate(()=>Back.depth())===2,tag+'：手機：卡片在那一週上面再疊一層');
  await p.goBack();await p.waitForTimeout(700);ok(await p.evaluate(()=>!dnOpen&&doneWeek!==null),tag+'：系統返回鍵先關卡片，還在那一週');
  await p.click('.dhead .dh-home');await p.waitForTimeout(1200);ok(await p.evaluate(()=>doneWeek===null&&Back.depth()===0)&&!!(await p.$('#wksWal')),tag+'：左上角上一頁回到整疊卡片');
  ok(await foc()===2,tag+'：回來時焦點還在剛剛那一週');
  ok(!(await homeUp(p)),tag+'：回到首頁鍵');
  await tap(2);await p.goBack();await p.waitForTimeout(1200);
  ok(await p.evaluate(()=>doneWeek===null),tag+'：系統返回鍵在那一週時回到整疊卡片');
 }
 if(tag==='mob'){
  /* 手機獨立檢視：返回／再點標題／Esc 回整疊卡片，焦點還在那一週 */
  await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(500);
  await p.click('#wksWal .hm-wc.on',{position:{x:60,y:18}});await p.waitForTimeout(1000);
  ok(await p.$$eval('#doneList .wks-c',x=>x.length)===1&&!!(await p.$('#doneList .wks-c.on .wk-rep')),tag+'：進獨立檢視：只有一週，最上方每週報告');
  await p.click('#doneList .wks-c.on .wks-h');await p.waitForTimeout(900);
  ok(await p.evaluate(()=>doneWeek===null&&Back.depth()===0)&&!!(await p.$('#wksWal')),tag+'：再點標題＝回整疊卡片');
  await p.click('#wksWal .hm-wc.on',{position:{x:60,y:18}});await p.waitForTimeout(900);await p.keyboard.press('Escape');await p.waitForTimeout(900);
  ok(await p.evaluate(()=>doneWeek===null&&Back.depth()===0)&&!(await p.$('#doneList .wks-c.on')),tag+'：Esc 回整疊卡片');
  /* 真的手指點（touchstart／touchend 後瀏覽器補一個點擊，落在新畫面的標題上）：進去後不能馬上被收回 */
  await p.tap('#wksWal .hm-wc.on',{position:{x:60,y:18}});await p.waitForTimeout(1000);
  ok(await p.evaluate(()=>doneWeek!==null&&Back.depth()===1)&&!!(await p.$('#doneList .wks-c.on')),tag+'：手指點焦點卡進獨立檢視後沒有被補的點擊收回');
  await p.click('.dhead .dh-home');await p.waitForTimeout(1000);
  /* 拖曳：往上拖換焦點 */
  const bx=await p.$eval('#wksWal',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await p.mouse.move(bx.x,bx.y);await p.mouse.down();await p.mouse.move(bx.x,bx.y-170,{steps:8});await p.mouse.up();await p.waitForTimeout(1200);
  ok(await p.evaluate(()=>+document.querySelector('#wksWal .hm-wc.on').dataset.i)>=1&&await p.evaluate(()=>doneWeek)===null,tag+'：往上拖，焦點換到下一週');
  /* 切換分頁：離開那一週 */
  await p.click('#wksWal .hm-wc.on',{position:{x:60,y:18}});await p.waitForTimeout(1200);await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);
  ok(await p.evaluate(()=>doneWeek===null&&Back.depth()===0)&&!(await homeUp(p)),tag+'：換到別的分頁就離開那一週');
  /* 搜尋 */
  await p.evaluate(()=>setSection('done',{instant:true}));await p.waitForTimeout(500);
  await p.fill('#boardQ','法規彙編');await p.waitForTimeout(500);
  await p.click('#boardRes .dr-item.done');await p.waitForTimeout(1400);
  ok(await p.evaluate(()=>doneWeek!==null&&dnOpen!==null),tag+'：搜尋完成紀錄：直接進到那一週並開卡片');
  /* 跳脫 */
  await p.evaluate(()=>{window.__x=0;const e=state.events.find(e=>e.doneAt);e.name='<img src=x onerror=window.__x=1>';renderDone()});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>window.__x)===0,tag+'：標題裡的 HTML 不會執行');
 }
 ok(!(await p.evaluate(()=>0))&&p.errs.length===0,tag+'：沒有 console 錯誤 '+p.errs.join('|'));
 await p.close();
}
await b.close();console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0)})();
