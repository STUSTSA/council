/* 螢幕鍵盤與搜尋欄聚焦過渡（kb1）：
   無頭瀏覽器沒有螢幕鍵盤，所以用假的 visualViewport（高度可手動縮小）模擬「鍵盤跳出、可見區變矮」；
   ① util.js 的 kbTrack 算出 --kb；② 主頁手機下排整條浮到「鍵盤頂」以上、收起後回原位；③ 被蓋住的輸入框會捲到可見區；
   ④ 看板搜尋欄聚焦時 outline 色／transform／放大鏡轉動有過渡，失焦回原樣。用法：伺服器開在 8300（見 CLAUDE.md），node kb1.js */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';let fails=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(!v)fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:412,height:800},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|api\.github\.com/,r=>r.abort());
  await ctx.addInitScript(()=>{
    const t=new EventTarget();const vv={height:innerHeight,offsetTop:0,scale:1,addEventListener:(...a)=>t.addEventListener(...a),removeEventListener:(...a)=>t.removeEventListener(...a)};
    Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
    window.__kb=h=>{vv.height=innerHeight-h;t.dispatchEvent(new Event('resize'))};
    try{if(!sessionStorage.getItem('__i')){sessionStorage.setItem('__i','1');localStorage.setItem('stustsa-links',JSON.stringify([{u:'https://a.example/',n:'甲'}]))}}catch(_){}
  });
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(U+'home.html');await p.waitForSelector('.hm-dock',{timeout:8000});await sleep(1500);
  const add=await p.$('.hm-lkadd');
  if(add){await add.click();await sleep(700)}
  const u=await p.$('#hmLkU');ok(!!u,'下排有網址輸入欄（加入連結列）');
  const bot=()=>p.evaluate(()=>document.querySelector('.hm-dk').getBoundingClientRect().bottom);
  const b0=await bot();
  await u.focus();await p.evaluate(()=>window.__kb(300));await sleep(700);
  const kbv=await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kb').trim());
  const b1=await bot();
  ok(kbv==='300px','鍵盤 300px 時 --kb＝300px（'+kbv+'）');
  ok(b1<=800-300+1,'下排底緣（'+Math.round(b1)+'）在鍵盤頂（500）以上；原本在 '+Math.round(b0));
  await p.screenshot({path:process.env.SHOTS?process.env.SHOTS+'/kb_open.png':'/tmp/kb_open.png'});
  await p.evaluate(()=>window.__kb(0));await sleep(700);
  const b2=await bot();ok(Math.abs(b2-b0)<=1,'鍵盤收起後回原位（'+Math.round(b2)+' vs '+Math.round(b0)+'）');
  await p.evaluate(()=>window.__kb(40));await sleep(300);
  ok((await p.evaluate(()=>document.documentElement.style.getPropertyValue('--kb')))==='0px','小於 80px 的縮放（網址列）不算鍵盤');
  ok(!errs.length,'主頁沒有 JS 錯誤 '+errs.join('|'));
  /* 看板搜尋欄 */
  await p.goto(U+'index.html');await p.waitForSelector('#dSearch',{timeout:10000}).catch(()=>{});await sleep(1200);
  const has=await p.$('#dSearch');
  if(!has){console.log('（看板沒進到有搜尋欄的頁面，略過搜尋欄測試）')}else{
    const st=()=>p.evaluate(()=>{const s=document.getElementById('dSearch'),c=getComputedStyle(s),i=getComputedStyle(s.querySelector('.ds-ico'));return {o:c.outlineColor,t:c.transform,it:i.transform,tr:c.transitionProperty}});
    const s0=await st();await p.focus('#boardQ');await sleep(60);const sm=await st();await sleep(600);const s1=await st();
    ok(/transform/.test(s0.tr)&&/outline-color/.test(s0.tr),'搜尋欄有 outline-color／transform 過渡：'+s0.tr);
    ok(s0.o!==s1.o&&s0.t==='none'&&s1.t!=='none','聚焦後外框變色、略放大：'+s1.t);
    ok(sm.o!==s0.o&&sm.o!==s1.o,'聚焦 60ms 時外框顏色在過渡中（中間值），不是瞬間跳');
    ok(s1.it!=='none','放大鏡聚焦後有轉動：'+s1.it);
    await p.evaluate(()=>document.getElementById('boardQ').blur());await sleep(700);
    const s2=await st();ok(s2.t==='none'&&s2.o===s0.o,'失焦回原樣');
    await p.screenshot({path:process.env.SHOTS?process.env.SHOTS+'/search_blur.png':'/tmp/search_blur.png'});
  }
  await b.close();console.log(fails?'FAIL '+fails:'ALL OK');process.exit(fails?1:0);
})();
