/* prev03：tools/build-preview.js 產生的單一 HTML 預覽檔，用 file:// 直接打開。
   預覽檔不進 repo（2026-11-20 從 main 拿掉、.gitignore）：這支測試自己把它產生到系統暫存資料夾再測，跑完刪掉，不會在 repo 裡留下檔案。
   桌面 1300、手機 412（觸控）各開一次：封鎖所有不是 file: 的請求並確認一個都沒有；讀到內嵌的測試資料、雲端關閉、開頁就能編輯；
   標題列的部門標誌有畫出來（build-preview.js 把 dept/icons/ 的 SVG 內嵌，2026-11-20 起；桌面是預設的權益部，手機加 ?d=pr 換成公關部）；
   沒有 console error、沒有頁面錯誤（不再放行任何訊息）。桌面另外走一次編輯：打開一張即時回報、點一行原位編輯、打字、點外面儲存（存進這個瀏覽器的 localStorage）、重新整理後還在。
   （卡片的操作照 ui-05 之後的介面：膠囊 .cp、右邊的 #evDetail；原位編輯器本身的細節在 kp1／kp2／kp3 測。）
   執行：cd tools/tests && node prev03.js（不用開伺服器、不用先產生）；每一項印「通過／失敗」，有失敗以非 0 結束 */
const {chromium}=require('playwright');const fs=require('fs');const os=require('os');const path=require('path');const {pathToFileURL}=require('url');const {spawnSync}=require('child_process');
const DIR=fs.mkdtempSync(path.join(os.tmpdir(),'prev03-')),OUT=path.join(DIR,'03-即時回報.html'),FILE=pathToFileURL(OUT).href;
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
const done=()=>{try{fs.rmSync(DIR,{recursive:true,force:true})}catch(_){}};
(async()=>{
  const build=spawnSync(process.execPath,[path.resolve(__dirname,'..','build-preview.js'),OUT],{encoding:'utf8'});
  ok(build.status===0&&fs.existsSync(OUT),`產生預覽檔到暫存資料夾（${(build.stdout||build.stderr||'').trim().split('\n').pop().slice(0,80)}）`);
  if(build.status!==0){done();console.log(`有 ${fails} 項失敗`);process.exit(1)}
  const b=await chromium.launch();
  for(const [w,h,touch,tag,dq] of [[1300,900,false,'桌面 1300','rights'],[412,860,true,'手機 412','pr']]){
    const URL_=dq==='rights'?FILE:FILE+'?d='+dq;
    const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    const other=[];await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file:'))return r.continue();other.push(u);return r.abort()});
    const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text())});
    const files=[];p.on('request',q=>{if(q.url().startsWith('file:'))files.push(q.url())});
    await p.goto(URL_);await p.waitForFunction(()=>typeof state!=='undefined'&&!document.getElementById('splash'),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(800);
    ok(await p.evaluate(()=>state.id==='preview-03'&&!cloudOn()&&!fsMode()&&canEdit()),`${tag}：讀到內嵌的測試資料、雲端關閉、github 模式、開頁就能編輯`);
    await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(300);
    await p.waitForFunction(()=>!!document.querySelector('.dhead .dh-logo svg'),null,{timeout:4000}).catch(()=>{});
    {const lg=await p.evaluate(()=>{const s=document.querySelector('.dhead .dh-logo svg'),r=s&&s.getBoundingClientRect();return {dept:CFG.deptId,n:s?s.querySelectorAll('path,circle,rect,polygon,ellipse,g').length:0,w:r?Math.round(r.width):0,h:r?Math.round(r.height):0}});
      ok(lg.dept===dq&&lg.n>0&&lg.w>0&&lg.h>0,`${tag}：標題列的部門標誌有畫出來（${JSON.stringify(lg)}）`);}
    ok(await p.evaluate(()=>document.querySelectorAll('#events .cp').length===liveOrder().length&&liveOrder().length>0),`${tag}：即時回報的膠囊都畫出來`);
    if(w>=1000){
      /* 桌面：打開一張 → 點第一行原位編輯 → 打字 → 點外面儲存 → 重新整理後還在 */
      const id=await p.evaluate(()=>liveOrder().find(e=>e.blocks.length>1).id);
      await p.evaluate(i=>lcShow('live',i),id);await p.waitForTimeout(700);
      ok(await p.evaluate(()=>document.querySelectorAll('#evDetail .ln').length>1),`${tag}：打開卡片，逐行內容畫在右邊`);
      const bid=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,id);
      await p.click(`#evDetail [data-kpgo="${bid}"]`);await p.waitForTimeout(500);
      ok(await p.evaluate(()=>editing&&!!document.querySelector('#evDetail [data-kptx],#evDetail [data-kpgrp]')),`${tag}：點一行就在原位編輯`);
      await p.keyboard.press('End');await p.keyboard.type('（預覽）');
      await p.click('#evH');await p.waitForTimeout(2500);
      const s1=await p.evaluate(id=>{const e=state.events.find(x=>x.id===id);let l=null;try{l=JSON.parse(localStorage.getItem('workboard:preview-03'))}catch(_){}
        const le=l&&l.events.find(x=>x.id===id);return {editing,b:e.blocks[0],lb:le&&le.blocks[0]}},id);
      ok(!s1.editing&&/（預覽）$/.test(s1.b.text)&&!!s1.lb&&s1.lb.text===s1.b.text,`${tag}：點外面儲存，存進 localStorage（${JSON.stringify(s1.lb)}）`);
      await p.reload();await p.waitForTimeout(3600);
      const s2=await p.evaluate(id=>state.events.find(x=>x.id===id).blocks[0],id);
      ok(/（預覽）$/.test(s2.text),`${tag}：重新整理後還在（${JSON.stringify(s2)}）`);
    }
    ok(other.length===0,`${tag}：沒有任何不是 file: 的請求（${other.length} 個：${other.slice(0,3).join(' ')}）`);
    ok(files.every(u=>u===URL_||u===FILE),`${tag}：file: 的請求只有這個檔案本身（${[...new Set(files)].length} 個網址）`);
    ok(!errs.length,`${tag}：沒有 console error、沒有頁面錯誤（${errs.join(' | ')||'無'}）`);
    await ctx.close();
  }
  await b.close();done();
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{done();console.error('失敗 例外：',e);process.exit(1)});
