/* 進部門提速（sw.js 的 warm、store.js 的 storePreload、home.js 的 hmWarm）
   用法：本機 8300 開網站後 node wm1.js。Service Worker 要開（其他測試大多封鎖它）；Firestore 不連（部門讀不到資料沒關係，這裡只看請求）。
   1. 主頁點部門：換頁之前（過場動畫播的時候）Service Worker 就把看板的檔案各對網路一次；換頁之後看板的腳本、樣式、網頁不再多對一輪
   2. 對照：不從主頁點、直接開看板網址，換頁時每個檔各對一次（證明 1 的差別是 warm 造成的）
   3. 點部門的那一刻、換頁之前，就對 Firebase 的模組送出請求（modulepreload）；看板頁一載入就有 modulepreload 標籤
   4. 沒有頁面錯誤 */
const {chromium}=require('playwright');const SITE='http://127.0.0.1:8300/';let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;console.log('OK',m)}else{fail++;console.log('FAIL',m)}};
(async()=>{
  const b=await chromium.launch();
  const run=async(viaClick)=>{
    const ctx=await b.newContext({viewport:{width:1280,height:800},serviceWorkers:'allow'});
    await ctx.addInitScript(()=>{window.requestIdleCallback=()=>{}});   /* 閒置時的提前下載先關掉，只看點部門那一刻的 */
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route(/gstatic\.com|firestore\.googleapis|identitytoolkit|securetoken|firebaseinstallations/,r=>r.abort());
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto(SITE+'home.html');await p.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:15000}).catch(()=>{});
    await p.reload();await p.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:15000});await p.waitForTimeout(3600);
    const reqs=[];let navAt=Infinity;
    ctx.on('request',q=>{const u=q.url();if(u.startsWith(SITE)&&q.serviceWorker()&&/\.(js|css)(\?|$)|index\.html/.test(u))reqs.push([Date.now(),u.replace(SITE,'')]);else if(/gstatic\.com\/firebasejs/.test(u))reqs.push([Date.now(),'G:'+u.split('/').pop()])});
    p.on('framenavigated',f=>{if(f===p.mainFrame()&&/index\.html/.test(f.url())&&navAt===Infinity)navAt=Date.now()});
    if(viaClick){await p.click('#hm .hm-tile.on, #hm .hm-wc.on');await p.waitForURL(/index\.html/,{timeout:15000})}else await p.goto(SITE+'index.html?d=rights');
    await p.waitForTimeout(3000);
    const pre=await p.evaluate(()=>document.querySelectorAll('link[rel=modulepreload]').length);
    await ctx.close();
    return {before:reqs.filter(r=>r[0]<navAt).map(r=>r[1]),after:reqs.filter(r=>r[0]>=navAt).map(r=>r[1]),pre,errs};
  };
  const a=await run(true),c=await run(false);
  const board=l=>l.filter(u=>/core\/js\/(views|render|boot)\.js|board\.css|index\.html/.test(u));
  ok(a.before.filter(u=>!u.startsWith('G:')).length>=40,'點部門、換頁之前：看板的檔案各對網路一次（'+a.before.filter(u=>!u.startsWith('G:')).length+' 個）');
  ok(board(a.after).length===0,'換頁之後：看板的腳本、樣式、網頁不再多對一輪（換頁後 '+a.after.length+' 個請求：'+a.after.slice(0,4).join(',')+'）');
  ok(board(c.after).length>=3&&c.after.length>=40,'對照（直接開看板）：換頁時每個檔各對一次（'+c.after.length+' 個）');
  ok(a.before.filter(u=>/^G:firebase-(app|auth|firestore)\.js$/.test(u)).length===3,'點部門、換頁之前：Firebase 三個 SDK 檔已經開始下載：'+a.before.filter(u=>u.startsWith('G:')).join(','));
  ok(a.pre>=6&&c.pre>=6,'看板頁一載入就有 modulepreload：'+a.pre+'、'+c.pre+' 個');
  ok(!a.errs.length&&!c.errs.length,'沒有頁面錯誤 '+[...a.errs,...c.errs].join('|'));
  await b.close();console.log(`\n${pass} 通過、${fail} 失敗`);process.exit(fail?1:0);
})();
