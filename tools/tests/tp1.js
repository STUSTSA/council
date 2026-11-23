/* tp1：時間頁點日期、時、分跳出系統選擇器（live.js 的 tePick）；拖曳調整不跳。固定 8300 埠。
   headless 沒有真的選擇器：把 showPicker 換成記下輸入欄、手動設值送 change */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk,login}=await c.setup();const p=await mk(412,900,'light',true);
await p.waitForFunction(()=>!document.body.classList.contains('intro'));await p.waitForTimeout(600);await login(p);await p.waitForTimeout(600);
await p.evaluate(()=>{window.__pk=[];HTMLInputElement.prototype.showPicker=function(){window.__pk.push({type:this.type,value:this.value})}});
await p.click('#addEvent');await p.waitForTimeout(500);await p.click('[data-fabadd="time"]');await p.waitForSelector('.lc-ed [data-kptitle]');await p.waitForTimeout(400);
await p.click('[data-lctool="time"]');await p.waitForTimeout(700);
const pick=async(sel,val)=>{await p.evaluate(()=>{window.__pk=[]});await p.tap(sel);await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({pk:window.__pk,n:document.querySelectorAll('.te-pk').length}));
  if(val){await p.evaluate(v=>{const i=document.querySelector('.te-pk');i.value=v;i.dispatchEvent(new Event('change'))},val);await p.waitForTimeout(300)}return r};
const t=()=>p.evaluate(()=>{const e=kpEv();return e.times[0].start+'|'+e.times[0].end});
let r=await pick('.lc-ed .sg[data-sg="d"]','2026-12-05');ok(r.pk.length===1&&r.pk[0].type==='date'&&r.n===1,'點日期：叫出日期選擇器 '+JSON.stringify(r));
ok((await t()).startsWith('2026-12-05T'),'選了日期套用 '+await t());
r=await pick('.lc-ed .sg[data-sg="h"]','16:45');ok(r.pk[0]&&r.pk[0].type==='time','點時：叫出時間選擇器');
ok((await t()).startsWith('2026-12-05T16:45'),'選了時間套用 '+await t());
r=await pick('.lc-ed .sg[data-sg="m"]','17:20');ok(r.pk[0]&&r.pk[0].type==='time'&&(await t()).startsWith('2026-12-05T17:20'),'點分也一樣 '+await t());
await p.screenshot({path:(process.env.SHOTS||'.')+'/tp_pane.png'});
/* 拖曳（上下滑）不跳選擇器 */
await p.evaluate(()=>{window.__pk=[]});
const bx=await p.locator('.lc-ed .sg[data-sg="h"]').boundingBox();
const cdp=await p.context().newCDPSession(p);const x=bx.x+bx.width/2,y=bx.y+bx.height/2;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*10}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400);
const pk=await p.evaluate(()=>window.__pk.length);ok(pk===0&&(await t())!=='x','拖曳調整時不跳選擇器（'+pk+'）'+await t());
ok(!p.errs.length,'沒有錯誤 '+p.errs.join('|'));await b.close();process.exitCode=bad?1:0})();
