/* sh1：視窗很矮時桌面即時回報的詳情卡不被切掉（board.css「卡片外框」的 min-height）。固定 8300 埠，github 模式。
   1536×400、清單很長：打開卡片後不管捲到哪裡，卡片上緣都在標題列下緣（標題看得到），底部工具列在視窗內；1536×700 維持原本高度（視窗高 − 標題列 − 36） */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
for(const H of [400,700]){
const {b,mk,login}=await c.setup();const p=await mk(1536,H,'dark',false);
await p.waitForTimeout(1500);await login(p);await p.waitForTimeout(900);
await p.evaluate(()=>{const e=state.events.find(x=>!x.doneAt);for(let i=0;i<14;i++)state.events.push({...JSON.parse(JSON.stringify(e)),id:'x'+i,name:'卡片'+i});render()});await p.waitForTimeout(600);
const q=()=>p.evaluate(()=>{const q=s=>{const r=document.querySelector(s).getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom)]};return {lc:q('.lc'),head:q('.lc-head'),tools:q('.lc-tools'),dtop:q('.dtop'),H:innerHeight}});
await p.click('#events .cp');await p.waitForTimeout(1200);
for(const d of [0,100,5000]){await p.evaluate(d=>{pageSc().scrollTop=d},d);await p.waitForTimeout(500);const r=await q();
  ok(r.head[0]>=r.dtop[1]&&r.lc[0]>=r.dtop[1]-1&&r.tools[1]<=r.H,`高 ${H} 捲到 ${d}：標題在標題列下面、工具列在視窗內 `+JSON.stringify(r));
  if(H===700&&d===100)ok(r.lc[1]-r.lc[0]===H-r.dtop[1]-36,`高 ${H}：卡片高度照舊（視窗高 − 標題列 − 36）`)}
ok(!p.errs.length,`高 ${H} 沒有錯誤 `+p.errs.join('|'));
await b.close()}
process.exitCode=bad?1:0})();
