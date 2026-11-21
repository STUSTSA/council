/* 會長室入口（2026-11-21）：不用模擬器，只看畫面。
   1. 首頁下排有「預約會長」鈕；點下去到 index.html?d=president&tab=ext，直接落在「會長室」分頁
   2. 網址 ?tab=ext 以外的值（亂寫）不影響開頁
   3. 看板殼裡會長室分頁的第一張是預約卡（#bkPanel 排在 #docsPanel 前面）
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
  ok(await p.evaluate(()=>curSec==='ext'),'點下去：直接在「會長室」分頁');
  ok(await p.evaluate(()=>{const a=document.querySelector('.sgroup-ext');const k=[...a.children].map(x=>x.id);return k.indexOf('bkPanel')===0&&k.indexOf('bkPanel')<k.indexOf('docsPanel')}),'預約卡是會長室分頁的第一張');
  await p.goto(BASE+'/index.html?d=rights&tab=zzz');await p.waitForFunction(()=>typeof curSec!=='undefined',null,{timeout:15000});
  ok(await p.evaluate(()=>curSec==='live'),'?tab 亂寫：照舊從第一個分頁開始');
  await b.close();process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
