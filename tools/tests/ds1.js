/* 即時回報打開、收回時燈號不橫向跳。手機 412 觸控。固定 8300 埠
   2026-11-17 改寫（ui-05 審查 P1-1）：ui-05 起即時回報不再是就地展開的 details 膠囊（#events .ev summary），
   而是膠囊（#events .cp）長成全螢幕卡片（#lcFull .lc，clip-path 展開）、返回鍵縮回。改測同一件事：
   膠囊裡燈號的位置收回前後一樣；卡片展開的途中燈號在卡片裡的位置不動（只有外框的 clip-path 在變）。 */
const c=require('./common');(async()=>{const {b,mk}=await c.setup();const p=await mk(412,860,'dark',true);let bad=0;
await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(400);
const id=await p.evaluate(()=>liveOrder()[0].id),S=`#events .cp[data-cp="${id}"]`;
const x=()=>p.evaluate(S=>Math.round(document.querySelector(S+' .live-dot').getBoundingClientRect().left-document.querySelector(S).getBoundingClientRect().left),S);
const closed=await x();
await p.evaluate(()=>{window._xs=[];const t0=performance.now();const f=()=>{const lc=document.querySelector('#lcFull .lc'),d=lc&&lc.querySelector('.lc-head .live-dot');if(d)_xs.push(Math.round(d.getBoundingClientRect().left-lc.getBoundingClientRect().left));if(performance.now()-t0<900)requestAnimationFrame(f)};requestAnimationFrame(f)});
await p.click(S);await p.waitForTimeout(1000);
const during=[...new Set(await p.evaluate(()=>_xs))];
await p.click('#lcFull [data-lcback]');await p.waitForTimeout(1200);
const after=await x();
console.log('closed',closed,'during open (in card)',during,'after close',after,p.errs);
if(during.length!==1){console.log('FAIL 卡片展開途中燈號橫向移動',during);bad++}
if(after!==closed){console.log('FAIL 收回後膠囊的燈號位置變了',closed,after);bad++}
if(p.errs.length){console.log('FAIL 錯誤',p.errs);bad++}
await b.close();process.exit(bad?1:0)})();
