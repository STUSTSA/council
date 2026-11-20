/* 子頁一律用標題列左上鍵退回：逐頁走過手機（412）與桌面（1300）的設定各項、合併頁裡的各功能、通知、進度議題詳情，
   確認「進到子頁＝左上是上一頁（.up）、頁面內沒有第二顆『返回』鈕」，再逐層按左上鍵退回、最後變回首頁。截圖 up2_*.png */
const c=require('./common');c.serveRemote=true;
const A=(ok,m)=>{console.log(ok?'ok  ':'FAIL',m);if(!ok)process.exitCode=1};
(async()=>{
for(const [w,h,tc] of [[412,860,true],[1300,900,false]]){c.q='';const {b,mk,login}=await c.setup();const p=await mk(w,h,'light',tc);
 await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});await p.waitForTimeout(500);
 await login(p);await p.waitForTimeout(800);await p.waitForFunction(()=>!document.querySelector('#dlg[open]'),null,{timeout:8000}).catch(()=>{});A(await p.evaluate(()=>loggedIn()),w+' 已登入');
 const st=()=>p.evaluate(()=>{const a=document.querySelector('.dh-home');const dup=[...document.querySelectorAll('button,a')].filter(x=>x.offsetParent&&!x.closest('#lcFull')&&/^\s*返回/.test(x.textContent.trim()||'')&&x.textContent.trim().length<8).map(x=>x.id||x.className);return {up:a.classList.contains('up'),i:!!a.querySelector('.i-back'),l:a.getAttribute('aria-label'),dup,depth:Back.depth(),set:setOpen}});
 const up=async()=>{await p.click('.dh-home');await p.waitForTimeout(1200)};
 const chk=async(name,shot)=>{const s=await st();A(s.up&&s.i&&s.l==='上一頁'&&!s.dup.length,`${w} ${name}：左上＝上一頁、沒有第二顆返回 ${JSON.stringify(s.dup)}`);if(shot)await p.screenshot({path:`up2_${w}_${shot}.png`});return s};
 if(!(await p.evaluate(()=>!!document.querySelector('#setBtn')))){A(false,'no setBtn');continue}
 await p.click('#setBtn');await p.waitForTimeout(1000);await chk('設定清單','set');
 const rows=await p.evaluate(()=>[...document.querySelectorAll('#setOv [data-set]')].map(r=>r.dataset.set));
 for(const k of rows){
  if(k==='look'||k==='device')continue;
  await p.click(`#setOv [data-set="${k}"]`);await p.waitForTimeout(1300);
  await chk('設定 '+k,'set_'+k);
  const hubs=await p.evaluate(()=>[...document.querySelectorAll('#setOv [data-hub],#setSub [data-hub]')].filter(x=>x.offsetParent).map(r=>r.dataset.hub));
  for(const hk of hubs){
   if(!(await p.$(`[data-hub="${hk}"]`))||!(await p.isVisible(`[data-hub="${hk}"]`)))continue;
   await p.click(`[data-hub="${hk}"]`);await p.waitForTimeout(1300);
   if(await p.evaluate(()=>!!document.querySelector('#dlg[open]:not(.in-pane)'))){await p.keyboard.press('Escape');await p.waitForTimeout(800)}
   await chk(`設定 ${k} → ${hk}`,`set_${k}_${hk}`);
   const d0=(await st()).depth;await up();
   const s2=await st();A(s2.up&&(w<900?s2.depth<d0:true),`${w} 設定 ${k} → ${hk} 按左上：退回上一層`);
   if(w>=900&&s2.up&&!(await p.evaluate(()=>!!hubNow)))break;
  }
  /* 退回設定清單 */
  for(let i=0;i<4;i++){const s=await st();if(!s.up||(w<900&&await p.evaluate(()=>!subOpen&&!paneKey)))break;if(w>=900&&await p.evaluate(()=>!paneKey&&!hubNow))break;await up()}
  if(!(await p.evaluate(()=>setOpen)))await p.click('#setBtn'),await p.waitForTimeout(1000);
 }
 /* 設定關掉、變回首頁 */
 for(let i=0;i<6&&await p.evaluate(()=>setOpen);i++)await up();
 let s=await st();A(!s.up&&s.l==='首頁'&&!s.set,w+' 退回主頁：變回首頁');
 /* 通知 */
 await p.click('#notiBtn');await p.waitForTimeout(1100);await chk('通知與行事曆','noti');await up();s=await st();A(!s.up,w+' 通知退回：首頁');
 /* 進度議題詳情 */
 await p.evaluate(()=>setSection('progress',{instant:true}));await p.waitForTimeout(700);
 await p.evaluate(()=>progShow(state.issues[0].id));await p.waitForTimeout(1000);await chk('進度議題詳情','prog');await up();s=await st();A(!s.up,w+' 議題詳情退回：首頁');
 const er=p.errs.filter(x=>!x.includes('404'));A(!er.length,w+' 沒有錯誤 '+er.join('|'));await b.close()}
})();
