/* st1：即時回報、完成紀錄打開一張、下一張鈕、左方向鍵（三種寬度：1300、1100、412）。固定 8300 埠
   2026-11-17 改寫（ui-05 審查 P1-1）：ui-05 起入口換成膠囊（#events／#doneList .cp）、打開的那張是 lvOpen／dnOpen（以前 selEv／selDone）、
   上一張／下一張在卡片第二排（.lc-tri[data-lcstep]，以前 [data-mdstep]）。測同一件事：打開第一張 → 分不分欄（容器寬 980 以上才分欄）、
   上一張／下一張鈕狀態 → 按下一張換成第二張 → 左方向鍵回到第一張；沒有錯誤、沒有進入編輯 */
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();let bad=0;const A=(ok,m)=>{if(!ok){console.log('FAIL',m);bad++}};
for(const [w,h] of [[1300,860],[1100,800],[412,900]]){
const ctx=await b.newContext({viewport:{width:w,height:h},serviceWorkers:'block'});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8300/index.html');await p.waitForFunction(()=>!document.body.classList.contains('intro'));await p.waitForTimeout(600);
for(const sec of ['live','done']){
 await p.click(`#tabbar [data-tab=${sec}]`);await p.waitForTimeout(900);
 const list=sec==='live'?'#events':'#doneList',ids=await p.evaluate(l=>[...document.querySelectorAll(l+' .cp')].map(x=>x.dataset.cp),list);
 if(!ids.length){console.log(w,sec,'no items');A(false,`${w} ${sec} 沒有膠囊`);continue}
 await p.click(`${list} .cp[data-cp="${ids[0]}"]`);await p.waitForTimeout(900);
 const info=async()=>p.evaluate(s=>({sel:s==='live'?lvOpen:dnOpen,split:document.querySelector(s==='live'?'#liveMD':'#doneMD').classList.contains('split'),
   steps:[...document.querySelectorAll('.lc:not(.lc-ghost) [data-lcstep]')].map(x=>(x.disabled?'x':'o')+(x.offsetParent||x.getClientRects().length?'v':'h'))}),sec);
 const o=await info();console.log(w,sec,'open',JSON.stringify(o));
 A(o.sel===ids[0]&&o.split===(w>=1100)&&o.steps.join()==='xv,'+(ids.length>1?'ov':'xv'),`${w} ${sec} 打開第一張（分欄 ${o.split}、上一張變淡）`);
 const nx=p.locator('.lc:not(.lc-ghost) [data-lcstep="1"]');
 if(ids.length>1){await nx.click();await p.waitForTimeout(900);const n=await info();console.log(w,sec,'next',JSON.stringify(n));A(n.sel===ids[1],`${w} ${sec} 下一張＝第二張`)}
 await p.keyboard.press('ArrowLeft');await p.waitForTimeout(900);const k=await info();console.log(w,sec,'key<-',JSON.stringify(k));A(k.sel===ids[0],`${w} ${sec} 左方向鍵回到第一張`);
 await p.keyboard.press('Escape');await p.waitForTimeout(700);
}
const ed=await p.evaluate(()=>editing);console.log(w,'editing?',ed,'errs',errs);A(!ed&&!errs.length,`${w} 沒有進入編輯、沒有錯誤`);await ctx.close()}
await b.close();process.exit(bad?1:0)})();
