/* 會長預約的入口（2026-11-21）：不用模擬器，只看畫面。
   1. 首頁下排有「預約會長」鈕；沒記到你的部門時點下去到會長室頁（index.html?d=president&tab=ext，那裡有指路）
   2. 記到你的部門（localStorage「stustsa-mydept」）時點下去到那個部門的 ?noti=pres（登入後自動打開行事曆的會長室模式；登入要 Firestore，這裡只驗網址）
   3. 網址 ?tab=ext 以外的值（亂寫）不影響開頁
   執行：node tools/tests/po1.js（要先在 repo 根目錄開 python3 -m http.server 8300） */
const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://127.0.0.1:8300';let f=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(!c)f++};
(async()=>{
  const b=await chromium.launch();const p=await (await b.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'})).newPage();
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await p.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
  await p.goto(BASE+'/home.html');await p.waitForSelector('#hmBk',{timeout:15000});await p.waitForTimeout(2500);
  ok(await p.evaluate(()=>{const e=document.getElementById('hmBk');return !!e&&/預約會長/.test(e.textContent)&&e.getBoundingClientRect().width>60}),'首頁下排有「預約會長」鈕');
  await p.click('#hmBk');await p.waitForURL(/d=president&tab=ext/,{timeout:8000});
  await p.waitForFunction(()=>typeof curSec!=='undefined',null,{timeout:15000});
  ok(await p.evaluate(()=>curSec==='ext'),'沒記到部門：到會長室頁「會長室」分頁');
  ok(await p.evaluate(()=>!!document.querySelector('#bkPanel')),'會長室頁的預約卡（管理用）在殼裡');
  await p.goto(BASE+'/home.html');await p.waitForSelector('#hmBk',{timeout:15000});await p.evaluate(()=>localStorage.setItem('stustsa-mydept','finance'));await p.reload();await p.waitForSelector('#hmBk',{timeout:15000});await p.waitForTimeout(2500);
  await p.click('#hmBk');await p.waitForURL(/d=finance&noti=pres/,{timeout:8000});
  ok(/d=finance&noti=pres/.test(p.url()),'記到部門：點下去到 ?d=finance&noti=pres');
  await p.goto(BASE+'/index.html?d=rights&tab=zzz');await p.waitForFunction(()=>typeof curSec!=='undefined',null,{timeout:15000});
  ok(await p.evaluate(()=>curSec==='live'),'?tab 亂寫：照舊從第一個分頁開始');
  await b.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
