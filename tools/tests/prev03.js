/* prev03：docs/預覽/03-即時回報.html（tools/build-preview.js 產生）用 file:// 直接打開。
   桌面 1300、手機 412（觸控）各跑一次：封鎖所有不是 file: 的請求並確認一個都沒有；展開卡片、點一行原位編輯、轉成核取並勾選、
   打字、點外面儲存（存進這個瀏覽器的 localStorage）、重新整理後還在；沒有 console error、沒有頁面錯誤。
   執行：node tools/build-preview.js && cd tools/tests && node prev03.js（不用開伺服器）；每一項印「通過／失敗」，有失敗以非 0 結束 */
const {chromium}=require('playwright');const path=require('path');const {pathToFileURL}=require('url');
const FILE=pathToFileURL(path.resolve(__dirname,'..','..','docs','預覽','03-即時回報.html')).href;
let fails=0,passes=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(c)passes++;else fails++};
(async()=>{
  const b=await chromium.launch();
  for(const [w,h,touch,tag] of [[1300,900,false,'桌面 1300'],[412,860,true,'手機 412']]){
    const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
    const other=[];await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file:'))return r.continue();other.push(u);return r.abort()});
    const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text())});
    const files=[];p.on('request',q=>{if(q.url().startsWith('file:'))files.push(q.url())});
    await p.goto(FILE);await p.waitForFunction(()=>typeof state!=='undefined'&&!document.getElementById('splash'),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(800);
    ok(await p.evaluate(()=>state.id==='preview-03'&&!cloudOn()&&!fsMode()&&canEdit()),`${tag}：讀到內嵌的測試資料、雲端關閉、github 模式、開頁就能編輯`);
    await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(300);
    const id=await p.evaluate(()=>liveOrder().find(e=>e.blocks.length>1).id),md=w>=1000,S=md?'#evDetail':`.ev[data-ev="${id}"]`;
    await p.click(`.ev[data-ev="${id}"]>summary`,{position:{x:30,y:18}});await p.waitForTimeout(1000);
    ok(await p.evaluate(([md,id])=>md?!!document.querySelector('#evDetail .evd .kp-vl'):document.querySelector(`.ev[data-ev="${id}"]`).open,[md,id]),`${tag}：展開卡片`);
    await p.click(`${S} .kp-vl:nth-child(1) [data-kpgo]`);await p.waitForTimeout(600);
    ok(await p.evaluate(()=>editing&&!!document.querySelector('.kp [data-kptx]')),`${tag}：點一行就在原位編輯`);
    const L=`${S} .kp-lines .kp-line:nth-child(1)`;
    await p.click(`${L} .kp-type .csel-btn`);await p.waitForTimeout(300);await p.click(`${L} .csel-opt[data-v="check"]`);await p.waitForTimeout(400);
    await p.click(`${L} [data-kpck]`);await p.waitForTimeout(200);
    await p.click(`${L} [data-kptx]`);await p.keyboard.press('End');await p.keyboard.type('（預覽）');
    ok(await p.evaluate(()=>!!document.querySelector('.kp .kp-line:nth-child(1) [data-kpck]:checked')),`${tag}：轉成核取並勾選`);
    await p.click('#evH');await p.waitForTimeout(1500);
    const s1=await p.evaluate(id=>{const e=state.events.find(x=>x.id===id);let l=null;try{l=JSON.parse(localStorage.getItem('workboard:preview-03'))}catch(_){}
      const le=l&&l.events.find(x=>x.id===id);return {editing,st:kpSt&&kpSt.st,b:e.blocks[0],lb:le&&le.blocks[0]}},id);
    ok(!s1.editing&&s1.st==='ok'&&s1.b.check===true&&/（預覽）$/.test(s1.b.text)&&s1.lb&&s1.lb.check===true&&s1.lb.text===s1.b.text,`${tag}：點外面儲存並收合，存進 localStorage（${JSON.stringify(s1.lb)}）`);
    await p.reload();await p.waitForTimeout(3600);
    const s2=await p.evaluate(id=>state.events.find(x=>x.id===id).blocks[0],id);
    ok(s2.check===true&&/（預覽）$/.test(s2.text),`${tag}：重新整理後還在（${JSON.stringify(s2)}）`);
    ok(other.length===0,`${tag}：沒有任何不是 file: 的請求（${other.length} 個：${other.slice(0,3).join(' ')}）`);
    ok(files.every(u=>u===FILE),`${tag}：file: 的請求只有這個檔案本身（${[...new Set(files)].length} 個網址）`);
    ok(!errs.length,`${tag}：沒有 console error、沒有頁面錯誤（${errs.join(' | ')}）`);
    await ctx.close();
  }
  await b.close();
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
