/* ctr1 的畫面清單：每個函式把網站帶到某個畫面，再叫 measure 量。 */
module.exports=async({mk,measure,login,tap,W,w,h,scheme,tag,U,ok})=>{
  const phone=w<700;
  /* ---- 總入口 ---- */
  {const p=await mk(w,h,scheme);await p.goto(U+'home.html');await W(4200);
    await measure(p,'總入口',tag);
    ok(!p.errs.length,`${tag} 總入口沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
  /* ---- 部門主頁各分頁 ---- */
  {const p=await mk(w,h,scheme);await p.goto(U+'index.html');await W(2200);await login(p);
    for(const k of ['live','progress','done']){await p.evaluate(k=>{if(curSec!==k)setSection(k,{instant:true})},k);await W(900);await measure(p,'部門-'+k,tag)}
    await p.evaluate(()=>setSection('live',{instant:true}));await W(700);
    /* 即時回報：展開、詳情、編輯 */
    await p.evaluate(()=>{const c=document.querySelector('#events .cp');c&&c.click()});await W(1300);await measure(p,'即時回報詳情',tag);
    await p.click('#evDetail .lc-title').catch(()=>{});await W(900);await measure(p,'即時回報編輯',tag);
    await p.keyboard.press('Escape');await W(900);
    /* 進度：議題詳情 */
    await p.evaluate(()=>{setSection('progress',{instant:true});const i=document.querySelector('#gantt .g-issue');i&&progShow(i.dataset.jump)});await W(1000);await measure(p,'議題詳情',tag);
    await p.evaluate(()=>{progShow(null)});await W(600);
    /* 通知與行事曆：找重疊、搜尋、月份清單、各模式、今日層 */
    if(await tap(p,'#notiBtn')){await W(1500);await measure(p,'通知與行事曆',tag);
      if(await tap(p,'[data-calfind]')){await W(1500);await measure(p,'找重疊',tag);await tap(p,'[data-calfind]');await W(900)}
      if(await tap(p,'[data-calmon]')){await W(900);await measure(p,'月份清單',tag);await tap(p,'[data-calmon]');await W(600)}
      for(const k of await p.$$eval('.cal-seg [data-k]',e=>e.map(x=>x.dataset.k))){await p.evaluate(k=>{const x=document.querySelector(`.cal-seg [data-k="${k}"]`);x&&x.click()},k);await W(1100);await measure(p,'行事曆模式-'+k,tag)}
      await p.fill('[data-calq]','會').catch(()=>{});await W(900);await measure(p,'行事曆搜尋',tag);await p.fill('[data-calq]','').catch(()=>{});await W(500);
      if(await tap(p,'#notiPage .nd-card.today')){await W(1500);await measure(p,'今日層',tag);await p.keyboard.press('Escape');await W(1100)}
      await p.keyboard.press('Escape');await W(1100)}
    /* 設定 */
    if(await tap(p,'#setBtn')){await W(1300);await measure(p,'設定',tag);
      const keys=await p.$$eval('#setOv [data-set]',els=>els.map(e=>e.dataset.set));
      for(const k of [...new Set(keys)]){await p.evaluate(k=>{const e=document.querySelector(`#setOv [data-set="${k}"]`);e&&e.click()},k);await W(1100);await measure(p,'設定-'+k,tag);
        if(phone){await tap(p,'.dh-home,#setOv .set-back');await W(800)}}
      /* 報告：每週概述、生成週報、工作報告 */
      await p.evaluate(()=>{if(!setOpen)return;const e=document.querySelector('#setOv [data-set="report"]');e&&e.click()});await W(1100);
      const clickText=async t=>p.evaluate(t=>{const e=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.includes(t));if(e){e.click();return true}return false},t);
      if(await clickText('每週概述')){await W(1300);await measure(p,'每週概述',tag);
        if(await clickText('生成週報')){await W(1200);await measure(p,'生成週報對話框',tag);await p.keyboard.press('Escape');await W(700)}}
      await p.evaluate(()=>{if(setOpen)closeSettings(true)});await W(700)}
    await p.evaluate(()=>{editBoardInfo('year')});await W(1100);await measure(p,'對話框',tag);await p.keyboard.press('Escape');await W(600);
    /* 點名、預約、會議的元件：這三個畫面要 Firestore 才出得來，這裡用同樣的標記塞進頁面，吃同一份 board.css（點名 attendance.js、預約 booking.js、會議 meeting.js 產生的標記） */
    await p.evaluate(()=>{const d=document.createElement('div');d.id='__syn';d.style.cssText='position:fixed;inset:0;z-index:99999;background:var(--bg);overflow:auto;padding:24px 16px';
      d.innerHTML=`<div class="wk-depts at-pick" role="tablist"><button type="button" role="tab" class="wk-d" aria-selected="true">第十一次行政會議<span class="num">11/18</span></button><button type="button" role="tab" class="wk-d" aria-selected="false">第十次<span class="num">11/04</span></button><button type="button" class="wk-d none">權益部<span class="num">3</span></button></div>
      <div class="at-grid" style="max-width:360px"><button type="button" class="at-m on"><span class="nm">林昱辰<small>部長</small></span><i>出席</i></button><button type="button" class="at-m lv"><span class="nm">黃柏叡<small>部員</small></span><i>請假</i></button></div>
      <div class="bk-row"><div class="bk-t"><b class="num">11/22 10:00–11:00</b><span class="sub bk-st">申請人</span></div><div class="bk-b"><button type="button" class="icon">拒絕</button><button type="button" class="primary">核准</button></div></div>
      <div style="margin:14px 0"><button type="button" class="tmc num">11/22 10:30</button> <button type="button" class="tmc num late">11/18 09:00</button></div>
      <div class="mt-foot"><button type="button" class="primary">匯出會議紀錄</button><button type="button" class="icon">上一個</button><button type="button">下一個</button></div>
      <div class="acct-chips" style="margin:14px 0"><span class="acct-chip on">總管理員</span><span class="acct-chip">秘書處・處長</span><span class="acct-chip">唯讀</span></div>
      <div style="margin:14px 0"><a class="doc-pill" href="#"><b>會議文件</b></a> <span class="grant-st"><span class="grant-on">開放修改中</span></span></div>
      <div style="margin:14px 0"><button type="button" class="tl-btn pri">完成</button><button type="button" class="tl-btn">改期</button></div>
      <ol class="lg-day" style="list-style:none;padding:0;margin:14px 0"><li class="lg-item"><span class="lg-time num">07:52</span><div class="lg-main"><span class="lg-who">DievE Dai</span><ul class="lg-lines"><li><span class="lg-cat">即時回報</span><span>修改｜社群內容排程</span></li></ul></div></li></ol>
      <div class="at-tools" style="margin-top:14px"><button type="button" class="icon">匯入名冊</button><button type="button" class="icon">+ 場次</button></div>`;document.body.appendChild(d)});
    await W(300);await measure(p,'點名預約會議元件',tag);await p.evaluate(()=>document.getElementById('__syn').remove());
    ok(!p.errs.length,`${tag} 部門沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
  /* ---- 唯讀狀態：沒登入的看板（三個分頁、設定的鎖頭頁、通知）、登入後按眼睛進唯讀檢視（頁首「唯讀」膠囊、唯讀的設定頁） ---- */
  {const p=await mk(w,h,scheme);await p.goto(U+'index.html');await W(2200);
    for(const k of ['live','progress','done']){await p.evaluate(k=>{if(curSec!==k)setSection(k,{instant:true})},k);await W(900);await measure(p,'未登入-'+k,tag)}
    if(await tap(p,'#setBtn')){await W(1300);await measure(p,'未登入-設定',tag);await p.evaluate(()=>{if(setOpen)closeSettings(true)});await W(700)}
    if(await tap(p,'#notiBtn')){await W(1500);await measure(p,'未登入-通知',tag)}
    ok(!p.errs.length,`${tag} 未登入沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
  {const p=await mk(w,h,scheme);await p.goto(U+'index.html');await W(2200);await login(p);
    if(await tap(p,'#peekBtn')){await W(1000);
      for(const k of ['live','progress','done']){await p.evaluate(k=>{if(curSec!==k)setSection(k,{instant:true})},k);await W(900);await measure(p,'唯讀檢視-'+k,tag)}
      if(await tap(p,'#setBtn')){await W(1300);await measure(p,'唯讀檢視-設定',tag)}}
    ok(!p.errs.length,`${tag} 唯讀檢視沒有錯誤 ${p.errs.join('｜')}`);await p.context().close()}
  /* ---- 工作報告（設定→報告→工作報告）：預設排版、封面、圖片工具列 ---- */
  {const p=await mk(w,h,scheme);await p.goto(U+'index.html');await W(2200);await login(p);
    if(await tap(p,'#setBtn')){await W(1300);await p.evaluate(()=>{const e=document.querySelector('#setOv [data-set="report"]');e&&e.click()});await W(1100);
      const clickText=async t=>p.evaluate(t=>{const e=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.includes(t));if(e){e.click();return true}return false},t);
      for(const t of ['工作報告','匯出工作報告']){if(await clickText(t)){await W(1500);await measure(p,'報告-'+t,tag);await p.keyboard.press('Escape');await W(900)}}}
    await p.context().close()}
  /* ---- 其他部門：會長室、秘書處、活動部、財務部的每個分頁（各自的元件：追蹤、各部門編輯量、會議、專案） ---- */
  for(const d of ['president','secretariat','events','finance']){
    /* 先不登入量一輪；再登入量一輪（登入後出現編輯用的元件）。某個部門的畫面讓瀏覽器掛掉時只記一筆失敗、不影響其他畫面 */
    for(const mode of ['唯讀','登入']){let p;
      try{p=await mk(w,h,scheme);await p.goto(U+'index.html?d='+d);await W(2400);if(mode==='登入')await login(p);
        for(const k of await p.evaluate(()=>SECS.slice())){await p.evaluate(k=>{if(curSec!==k)setSection(k,{instant:true})},k);await W(1100);await measure(p,'部門'+d+'-'+k+(mode==='登入'?'-登入':''),tag)}
        ok(!p.errs.length,`${tag} ${d}（${mode}）沒有錯誤 ${p.errs.join('｜')}`)}
      catch(e){ok(false,`${tag} ${d}（${mode}）量測中斷：${String(e.message).split('\n')[0]}`)}
      await p?.context().close().catch(()=>{})}}
};
