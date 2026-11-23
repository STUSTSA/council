/* fab1：右下角圓鈕展開「時間／清單／文字」三個選項（nav.js fabOpen、events.js、live.js kpSeed）。固定 8300 埠。
   展開：背景淡暗、三顆膠囊、圓鈕轉 ×；點背景、再按圓鈕、Esc、系統返回都收起；選一個＝新卡片先放好那一種的第一行；沒填就點外面＝不留。手機 412 深色、桌面 1300 */
const c=require('./common');const OUT=process.env.SHOTS||'.';
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
for(const [w,h,sc,tag] of [[412,900,'dark','m'],[1300,860,'light','d']]){
const {b,mk,login}=await c.setup();const p=await mk(w,h,sc,w<500);
await p.waitForFunction(()=>!document.body.classList.contains('intro'));await p.waitForTimeout(600);await login(p);await p.waitForTimeout(600);
const st=()=>p.evaluate(()=>{const m=document.querySelector('#fabMenu'),f=$('#addEvent');return {open:!!m&&!m.hidden,cls:f.classList.contains('open'),opts:m?[...m.querySelectorAll('.fab-opt')].map(o=>o.textContent.trim()):[],depth:Back.depth(),editing}});
await p.screenshot({path:`${OUT}/fab_${tag}_before.png`});
await p.click('#addEvent');await p.waitForTimeout(700);
const hm=await p.evaluate(()=>$('.dhead .dh-home').classList.contains('up'));let s=await st();ok(!hm,tag+' 展開時左上鍵不換成上一頁（不閃）');ok(s.open&&s.cls&&s.opts.join()==='時間,清單,文字'&&s.depth===1,tag+' 展開：三個選項（由上到下 時間、清單、文字）、圓鈕變 ×、推一筆返回紀錄 '+JSON.stringify(s));
await p.screenshot({path:`${OUT}/fab_${tag}_open.png`});
const g=await p.evaluate(()=>{const f=$('#addEvent').getBoundingClientRect();return [...document.querySelectorAll('.fab-opt')].map(o=>{const r=o.getBoundingClientRect();return [Math.round(r.bottom),Math.round(r.right)]}).concat([[Math.round(f.top),Math.round(f.right)]])});
ok(g[0][0]<g[1][0]&&g[1][0]<g[2][0]&&g[2][0]<g[3][0],tag+' 選項在圓鈕上方依序排好 '+JSON.stringify(g));
/* 收起：背景、再按圓鈕、Esc、返回 */
await p.mouse.click(40,200);await p.waitForTimeout(500);s=await st();ok(!s.open&&!s.cls&&s.depth===0,tag+' 點背景收起 '+JSON.stringify(s));
await p.click('#addEvent');await p.waitForTimeout(500);await p.click('#addEvent');await p.waitForTimeout(500);s=await st();ok(!s.open&&s.depth===0,tag+' 再按圓鈕（×）收起');
await p.click('#addEvent');await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(500);s=await st();ok(!s.open&&s.depth===0,tag+' Esc 收起');
await p.click('#addEvent');await p.waitForTimeout(500);await p.goBack().catch(()=>{});await p.waitForTimeout(700);s=await st();ok(!s.open&&s.depth===0,tag+' 返回手勢收起（沒離開頁面）');
/* 選一個：三種各一次 */
for(const [k,exp] of [['text',b0=>b0.check===null&&!b0.timeId],['check',b0=>b0.check===false&&!b0.timeId],['time',b0=>!!b0.timeId]]){
  await p.click('#addEvent');await p.waitForTimeout(500);await p.click(`[data-fabadd="${k}"]`);await p.waitForSelector('.lc-ed [data-kptitle]');await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{const e=kpEv();return {name:e.name,blocks:e.blocks,times:e.times.length,focusTitle:document.activeElement&&document.activeElement.dataset.kptitle!==undefined,menu:!document.querySelector('#fabMenu').hidden}});
  ok(r.name==='新的即時回報'&&r.blocks.length===1&&exp(r.blocks[0])&&r.focusTitle&&!r.menu,tag+` 選「${k}」：新卡片放好第一行、游標在名稱 `+JSON.stringify(r));
  if(k==='time')await p.screenshot({path:`${OUT}/fab_${tag}_picked.png`});
  /* 沒填就點外面＝不留 */
  const n0=await p.evaluate(()=>state.events.length);
  await p.keyboard.press('Escape');await p.waitForTimeout(900);
  const n1=await p.evaluate(()=>({n:state.events.length,editing}));
  ok(n1.n===n0-1&&!n1.editing,tag+` 「${k}」沒填就離開：不留卡片 `+JSON.stringify([n0,n1]));
  await p.waitForTimeout(500)}
/* 有填名稱就留 */
await p.click('#addEvent');await p.waitForTimeout(500);await p.click('[data-fabadd="check"]');await p.waitForSelector('.lc-ed [data-kptitle]');await p.fill('.lc-ed [data-kptitle]','三選項測試');await p.keyboard.press('Escape');await p.waitForTimeout(1500);
ok(await p.evaluate(()=>state.events.some(e=>e.name==='三選項測試')),tag+' 填了名稱就存下來');
ok(!p.errs.length,tag+' 沒有錯誤 '+p.errs.join('|'));
await b.close()}
process.exitCode=bad?1:0})();
