/* tr1：即時回報新手引導（core/js/tour.js）與卡片上的「完成」「刪除」鈕（live.js）。固定 8300 埠，github 模式。
   沒登入不出現；登入後第一張卡片下面依序三步（完成＝右上角亮、刪除＝左上角亮、點卡片編輯＝框起來），「知道了」後記在這台裝置、不再出現；
   設定「重看新手引導」再來一次；「略過」也記下；沒有卡片時＋鈕跳動加一句話；打開卡片有「完成」「刪除」鈕（刪除先確認、完成移到完成紀錄），編輯中收起。
   引導在自動化瀏覽器（navigator.webdriver）預設不出現，這支測試把旗標蓋掉。手機 412、桌面 1366；截圖到 SHOTS */
const c=require('./common');const OUT=process.env.SHOTS||'.';
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
for(const [w,h,sc,tag] of [[412,880,'light','m'],[1366,800,'light','d'],[412,880,'dark','mdark']]){
const {b,mk,login}=await c.setup();const p=await mk(w,h,sc,w<500);
await p.context().addInitScript(()=>Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false}));
await p.reload();await p.waitForTimeout(1800);
await p.waitForFunction(()=>!document.body.classList.contains('intro'));await p.waitForTimeout(1500);
const st=()=>p.evaluate(()=>{const t=document.querySelector('#tour'),f=document.querySelector('#tourFab');return {on:!!t&&!t.hidden,txt:t?t.querySelector('.tour-t').textContent:'',n:t?t.querySelector('.tour-n').textContent:'',go:t?t.querySelector('[data-tournext]').textContent:'',
  ok:!!document.querySelector('#lzOk.show'),del:!!document.querySelector('#lzDel.show'),hl:document.querySelectorAll('.tour-hl').length,fab:!!f&&!f.hidden,pulse:!!document.querySelector('.fab.tour-pulse'),mark:localStorage.getItem('workboard:tour-live')}});
let s=await st();ok(!s.on&&!s.fab,tag+' 沒登入：沒有引導 '+JSON.stringify(s));
await login(p);await p.waitForTimeout(1600);
s=await st();ok(s.on&&s.n==='1/3'&&/右上角＝完成/.test(s.txt)&&s.ok&&!s.del&&s.go==='下一步',tag+' 第一步：完成、右上角亮 '+JSON.stringify(s));
const g=await p.evaluate(()=>{const t=$('#tour').getBoundingClientRect(),c=document.querySelector('#events .cp');c.getAnimations().forEach(a=>a.pause());const r=c.getBoundingClientRect();return {t:[Math.round(t.left),Math.round(t.top),Math.round(t.right),Math.round(t.bottom)],cb:Math.round(r.bottom),W:innerWidth,H:innerHeight}});
ok(g.t[0]>=0&&g.t[2]<=g.W&&g.t[3]<=g.H&&g.t[1]>=0,tag+' 氣泡在畫面內 '+JSON.stringify(g));
await p.evaluate(()=>document.querySelector('#events .cp').getAnimations().forEach(a=>{a.currentTime=450}));await p.waitForTimeout(300);
/* 示範只在原位輕點（實機回報：整張飛走、停在角落像卡住）：最遠的時候離原位不到 24px、不蓋到氣泡；重畫不重播；播兩次就停、回到原位 */
const mv=await p.evaluate(g=>{const c=document.querySelector('#events .cp'),r=c.getBoundingClientRect();return {dy:Math.round(g.cb-r.bottom),gap:Math.round(g.t[1]-r.bottom)}},g);
ok(Math.abs(mv.dy)<24&&mv.gap>0,tag+' 示範最遠時：卡片還在原位附近、沒蓋到氣泡 '+JSON.stringify(mv));
await p.evaluate(()=>{document.querySelector('#events .cp').getAnimations().forEach(a=>a.play());window.__an=document.querySelector('#events .cp').getAnimations()[0];fabSync()});await p.waitForTimeout(1100);
ok(await p.evaluate(()=>document.querySelector('#events .cp').getAnimations()[0]===window.__an),tag+' 畫面重畫：示範不重播');
await p.waitForTimeout(2600);
const rest=await p.evaluate(g=>{const c=document.querySelector('#events .cp');return {n:c.getAnimations().length,dy:Math.round(g.cb-c.getBoundingClientRect().bottom),z:!!document.querySelector('#lzOk.show')}},g);
ok(rest.n===0&&rest.dy===0&&rest.z,tag+' 播兩次就停：卡片回原位、角落還亮著 '+JSON.stringify(rest));
await p.screenshot({path:`${OUT}/tour_${tag}_1完成.png`});
await p.click('[data-tournext]');await p.waitForTimeout(500);
s=await st();ok(s.on&&s.n==='2/3'&&/左上角＝刪除/.test(s.txt)&&!s.ok&&s.del,tag+' 第二步：刪除、左上角亮 '+JSON.stringify(s));
await p.evaluate(()=>document.querySelector('#events .cp').getAnimations().forEach(a=>{a.pause();a.currentTime=450}));await p.waitForTimeout(300);
await p.screenshot({path:`${OUT}/tour_${tag}_2刪除.png`});
await p.click('[data-tournext]');await p.waitForTimeout(500);
s=await st();ok(s.on&&s.n==='3/3'&&/點一下卡片＝編輯/.test(s.txt)&&!s.ok&&!s.del&&s.hl===1&&s.go==='知道了',tag+' 第三步：點卡片編輯、卡片框起來 '+JSON.stringify(s));
await p.screenshot({path:`${OUT}/tour_${tag}_3編輯.png`});
/* 切到別頁藏起來、回來接著第三步 */
if(tag==='m'){await p.evaluate(()=>setSection('progress'));await p.waitForTimeout(1200);s=await st();ok(!s.on&&!s.hl,tag+' 切到進度：藏起來');
  await p.evaluate(()=>setSection('live'));await p.waitForTimeout(1600);s=await st();ok(s.on&&s.n==='3/3',tag+' 回即時回報：接著第三步 '+JSON.stringify(s))}
await p.click('[data-tournext]');await p.waitForTimeout(500);
s=await st();ok(!s.on&&!s.hl&&s.mark==='1',tag+' 知道了：收掉並記在這台裝置 '+JSON.stringify(s));
await p.evaluate(()=>render());await p.waitForTimeout(1200);s=await st();ok(!s.on,tag+' 看過了：重畫不再出現');
/* 設定「重看新手引導」 */
await p.click('#setBtn');await p.waitForTimeout(900);
ok(await p.$('#setOv [data-tour-replay]')!==null,tag+' 設定有「重看新手引導」');
if(tag!=='mdark')await p.screenshot({path:`${OUT}/tour_${tag}_設定.png`});
await p.click('#setOv [data-tour-replay]');await p.waitForTimeout(2200);
s=await st();ok(s.on&&s.n==='1/3'&&s.mark===null&&await p.evaluate(()=>!setOpen),tag+' 重看：設定關掉、回到第一步 '+JSON.stringify(s));
await p.click('[data-tourskip]');await p.waitForTimeout(400);
s=await st();ok(!s.on&&!s.ok&&s.mark==='1',tag+' 略過：收掉並記下 '+JSON.stringify(s));
/* 引導中碰了卡片＝算看過 */
await p.evaluate(()=>{localStorage.removeItem('workboard:tour-live');render()});await p.waitForTimeout(1600);s=await st();ok(s.on,tag+' （清掉記號）又出現');
await p.evaluate(()=>document.querySelector('#events .cp').getAnimations().forEach(a=>a.cancel()));
await p.click('#events .cp');await p.waitForTimeout(1200);
s=await st();ok(!s.on&&s.mark==='1',tag+' 引導中點了卡片：收掉並記下 '+JSON.stringify(s));
/* 卡片上的完成、刪除鈕 */
let a=await p.evaluate(()=>({done:!!document.querySelector('.lc [data-lcdone]'),del:!!document.querySelector('.lc [data-lcdel]'),id:lvOpen,n:state.events.filter(e=>!e.doneAt).length}));
ok(a.done&&a.del,tag+' 打開卡片：有「完成」「刪除」鈕 '+JSON.stringify(a));
await p.screenshot({path:`${OUT}/tour_${tag}_卡片按鈕.png`});
await p.click('.lc [data-lcdel]');await p.waitForTimeout(600);
ok(await p.evaluate(()=>$('#dlg').open&&/刪除/.test($('#dlgForm').textContent)),tag+' 刪除：先確認');
await p.click('#dlgForm [data-act=cancel]');await p.waitForTimeout(500);
ok(await p.evaluate(n=>state.events.filter(e=>!e.doneAt).length===n,a.n),tag+' 取消：卡片還在');
await p.click('.lc [data-kpgo="title"]');await p.waitForTimeout(700);
ok(await p.evaluate(()=>editing&&!document.querySelector('.lc [data-lcdone]')),tag+' 編輯中：完成、刪除鈕收起');
await p.keyboard.press('Escape');await p.waitForTimeout(1200);
if(!await p.evaluate(()=>!!lvOpen)){await p.click(`#events .cp[data-cp="${a.id}"]`);await p.waitForTimeout(900)}
await p.click('.lc [data-lcdone]');await p.waitForTimeout(2600);
const d=await p.evaluate(id=>({done:!!state.events.find(e=>e.id===id).doneAt,open:lvOpen,n:state.events.filter(e=>!e.doneAt).length}),a.id);
ok(d.done&&!d.open&&d.n===a.n-1,tag+' 完成：移到完成紀錄、卡片收起 '+JSON.stringify(d));
/* 沒有卡片：＋鈕跳動加一句話；按＋時那句話藏起來 */
await p.evaluate(()=>{localStorage.removeItem('workboard:tour-live');state.events=state.events.filter(e=>e.doneAt);render()});await p.waitForTimeout(1600);
s=await st();ok(!s.on&&s.fab&&s.pulse,tag+' 沒有卡片：＋鈕跳動、旁邊一句話 '+JSON.stringify(s));
const fg=await p.evaluate(()=>{const f=$('#addEvent').getBoundingClientRect(),h=$('#tourFab').getBoundingClientRect();return {gap:Math.round(f.left-h.right),l:Math.round(h.left),mid:Math.abs((f.top+f.bottom)/2-(h.top+h.bottom)/2)}});
ok(fg.gap>4&&fg.gap<30&&fg.l>=0&&fg.mid<14,tag+' 那句話在＋鈕左邊、對齊 '+JSON.stringify(fg));
await p.screenshot({path:`${OUT}/tour_${tag}_沒有卡片.png`});
await p.click('#addEvent',{force:true});await p.waitForTimeout(600);   /* 圓鈕在跳動：不等它靜止 */
ok(await p.evaluate(()=>getComputedStyle($('#tourFab')).display==='none'),tag+' ＋選單打開：那句話藏起來');
await p.click('[data-fabadd="text"]');await p.waitForSelector('.lc-ed [data-kptitle]');await p.fill('.lc-ed [data-kptitle]','第一張');await p.keyboard.press('Escape');await p.waitForTimeout(2400);
if(await p.evaluate(()=>!!lvOpen)){await p.evaluate(()=>lcShow('live',null));await p.waitForTimeout(1800)}
s=await st();ok(s.on&&s.n==='1/3'&&!s.fab&&!s.pulse,tag+' 建了第一張：接著三步提示 '+JSON.stringify(s));
ok(!p.errs.length,tag+' 沒有錯誤 '+p.errs.join('|'));
await b.close()}
process.exitCode=bad?1:0})();
