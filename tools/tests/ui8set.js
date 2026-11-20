/* ui-08 設定子頁（DESIGN-next 第三、十二節；前後端交接-next 第九節「設定頁的登入相關」）——github 模式
   1. 設定頁沒有 logo、沒有「關閉」（#setOv、#setSub 都查）；設定鍵開：選中（.on、aria-expanded），再按＝關；Esc、系統返回也關
   2. 登入前：.set-gate 裡只有標題（b）與按鈕，沒有說明句；定型版唯讀只有標題
   3. 每一列（設定清單、合併頁）：除了名稱（.sr-t，裡面沒有別的元素）沒有其他文字；沒有 small
   4. 相鄰的列留縫（下一列的上緣 > 上一列的下緣），每列四個角都是 14 的圓角、各自有底色
   5. 九項功能都有入口、點得開：每週概述、工作報告、編輯紀錄、人員、標籤、備份、這台裝置、網站管理、外觀
   6. 1300：點了清單在左、面板在右；412：進全畫面子頁（上方只有「返回」），返回回到清單
   7. 設定頁、子頁裡沒有 title 屬性 */
const {setup}=require('./common.js');
let fails=0;const ok=(c,m)=>{console.log((c?'OK  ':'FAIL')+' '+m);if(!c)fails++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

/* 列的檢查：在頁面裡跑，回傳不合格的列 */
const rowCheck=p=>p.evaluate(()=>{
  const bad=[],gap=[],rad=[];
  const rows=[...document.querySelectorAll('#setOv .set-row,#setSub .set-row')].filter(r=>r.getClientRects().length&&!r.closest('[hidden]'));
  for(const r of rows){
    const t=r.querySelector('.sr-t');
    const tw=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let n,extra=[];
    while((n=tw.nextNode()))if(n.textContent.trim()&&!(t&&t.contains(n)))extra.push(n.textContent.trim());
    if(!t||t.children.length||extra.length||r.querySelector('small'))bad.push((r.dataset.set||r.dataset.hub)+':'+extra.join('|'));
    const cs=getComputedStyle(r);
    if(![cs.borderTopLeftRadius,cs.borderTopRightRadius,cs.borderBottomLeftRadius,cs.borderBottomRightRadius].every(v=>parseFloat(v)===14)||cs.backgroundColor==='rgba(0, 0, 0, 0)')rad.push(r.dataset.set||r.dataset.hub);
  }
  /* 同一個清單裡相鄰的兩列 */
  document.querySelectorAll('#setOv .set-list,#setSub .set-list').forEach(l=>{const rs=[...l.children].filter(x=>x.getClientRects().length);
    for(let i=1;i<rs.length;i++){const a=rs[i-1].getBoundingClientRect(),b=rs[i].getBoundingClientRect();if(!(b.top-a.bottom>0))gap.push((rs[i].dataset.set||rs[i].dataset.hub)+':'+(b.top-a.bottom).toFixed(1))}});
  /* 清單之間（setSec）也不黏在一起 */
  const secs=[...document.querySelectorAll('#setOv .set-inner>.set-sec')];
  for(let i=1;i<secs.length;i++){const a=secs[i-1].getBoundingClientRect(),b=secs[i].getBoundingClientRect();if(!(b.top-a.bottom>0))gap.push('sec'+i)}
  return {n:rows.length,bad,gap,rad};
});
const noChrome=p=>p.evaluate(()=>{const s=[...document.querySelectorAll('#setOv,#setSub')];
  return {logo:s.some(x=>x.querySelector('.logo,.set-logo,svg[aria-label*="學生會"]')),close:!!document.querySelector('#setClose')||s.some(x=>[...x.querySelectorAll('button')].some(b=>b.getClientRects().length&&/關閉/.test(b.textContent+(b.getAttribute('aria-label')||'')))),
    title:s.reduce((n,x)=>n+x.querySelectorAll('[title]').length,0)}});
const gearSt=p=>p.evaluate(()=>{const g=$('#setBtn');return {open:setOpen,on:g.classList.contains('on'),exp:g.getAttribute('aria-expanded'),hidden:$('#setOv').hidden}});

(async()=>{
  /* ---------- 桌面 1300 ---------- */
  {const {b,mk,login}=await setup();const p=await mk(1300,860,'light',false);
    /* 1. 設定鍵開關、沒有 logo 與關閉 */
    await p.click('#setBtn');await W(900);
    let g=await gearSt(p);ok(g.open&&g.on&&g.exp==='true'&&!g.hidden,'1300 設定鍵打開設定、鍵是選中狀態 '+JSON.stringify(g));
    ok(await p.evaluate(()=>!$('#setOv').hasAttribute('aria-modal')&&!$('#setBtn').closest('[inert],[aria-hidden="true"]')),'1300 設定頁不設 aria-modal：唯一的關閉控制（工具列的設定鍵）報讀器也用得到');
    let c=await noChrome(p);ok(!c.logo&&!c.close,'1300 設定頁沒有 logo、沒有關閉 '+JSON.stringify(c));
    ok(await p.evaluate(()=>!document.querySelector('#setOv .set-top,#setOv .anim-top')),'1300 設定頁沒有標題列');
    /* 2. 登入前 */
    const gate=await p.evaluate(()=>{const gt=$('#setOv .set-gate');return gt&&{kids:[...gt.children].map(x=>x.tagName+(x.className?'.'+x.className:'')),p:gt.querySelectorAll('p,small,.sub').length,b:gt.querySelector('b').textContent,
      rows:[...document.querySelectorAll('#setOv .set-row')].map(r=>r.dataset.set)}});
    ok(gate&&gate.p===0&&gate.kids.every(k=>/^(B|BUTTON)/.test(k))&&gate.b==='登入後才能使用設定','登入前只有標題與按鈕 '+JSON.stringify(gate));
    ok(gate&&gate.rows.join()==='week,look','登入前清單：每週概述、外觀 '+(gate&&gate.rows));
    let rc=await rowCheck(p);ok(rc.n>0&&!rc.bad.length&&!rc.gap.length&&!rc.rad.length,'登入前列：沒有小字、留縫、圓角 14 '+JSON.stringify(rc));
    /* 定型版（唯讀）：只有標題 */
    const lock=await p.evaluate(async()=>{state.locked=true;renderSettings();await new Promise(r=>setTimeout(r,50));const gt=$('#setOv .set-gate');const r={kids:[...gt.children].map(x=>x.tagName),t:gt.textContent.trim()};state.locked=false;renderSettings();return r});
    ok(lock.kids.join()==='B'&&lock.t==='這是唯讀版','定型版唯讀：只有標題 '+JSON.stringify(lock));
    /* 再按設定鍵＝關 */
    await p.click('#setBtn');await W(900);g=await gearSt(p);ok(!g.open&&!g.on&&g.exp==='false'&&g.hidden,'1300 再按設定鍵＝關閉 '+JSON.stringify(g));
    /* Esc、系統返回 */
    await p.click('#setBtn');await W(800);await p.keyboard.press('Escape');await W(900);g=await gearSt(p);ok(!g.open&&g.hidden,'1300 Esc 關閉設定');
    await p.click('#setBtn');await W(800);await p.goBack();await W(900);g=await gearSt(p);ok(!g.open&&g.hidden&&/index\.html/.test(p.url()),'1300 系統返回關閉設定、留在看板');
    /* 登入 */
    await login(p);
    await p.evaluate(()=>{localStorage.setItem('workboard:siteadmin','1')});
    await p.click('#setBtn');await W(900);
    const rows=await p.evaluate(()=>[...document.querySelectorAll('#setOv .set-inner .set-row')].map(r=>r.dataset.set));
    ok(['report','log','team','labels','backup','device','site','look'].every(k=>rows.includes(k)),'登入後清單有全部入口 '+rows);
    rc=await rowCheck(p);ok(rc.n>=8&&!rc.bad.length&&!rc.gap.length&&!rc.rad.length,'登入後列：沒有小字、留縫、圓角 14 '+JSON.stringify(rc));
    /* 5. 九項功能（＋ 6. 兩欄） */
    const pane=()=>p.evaluate(()=>{const b=$('#setOv .set-body'),sc=b.querySelector('.set-scroll').getBoundingClientRect(),pn=b.querySelector('.set-pane'),pr=pn.getBoundingClientRect();
      return {split:b.classList.contains('split'),paneShown:!pn.hidden,left:sc.right<=pr.left,cur:(document.querySelector('#setOv .set-row[aria-current="true"]')||{dataset:{}}).dataset.set,
        hub:[...pn.querySelectorAll('.set-hub:not([hidden]) [data-hub]')].map(x=>x.dataset.hub),dlg:$('#dlg').open&&$('#dlg').classList.contains('in-pane')&&pn.contains($('#dlg'))?$('#dlgForm>b')?.textContent:'',
        log:!!pn.querySelector('#logOv:not([hidden])'),week:!!pn.querySelector('#weekWrap:not([hidden])'),look:!!pn.querySelector('.look'),dev:!!pn.querySelector('.set-hub')}});
    const open=async k=>{await p.click(`#setOv [data-set="${k}"]`);await W(1000);return pane()};
    const shut=async k=>{await p.click(`#setOv [data-set="${k}"]`);await W(900)};
    const seen={};
    let s=await open('report');ok(s.split&&s.paneShown&&s.left&&s.cur==='report'&&s.hub.join()==='week,report','1300 報告：清單在左、面板在右 '+JSON.stringify(s));
    rc=await rowCheck(p);ok(!rc.bad.length&&!rc.gap.length&&!rc.rad.length,'合併頁的列：沒有小字、留縫、圓角 14 '+JSON.stringify(rc));
    await p.click('#setOv .set-pane [data-hub="week"]');await W(1000);s=await pane();seen['每週概述']=s.week;
    await p.keyboard.press('Escape');await W(800);
    await p.click('#setOv .set-pane [data-hub="report"]');await W(1000);s=await pane();seen['工作報告']=s.dlg==='匯出工作報告';
    if(s.dlg){await p.click('#dlgForm [data-act=ok]');await W(1500);seen['工作報告']=seen['工作報告']&&await p.evaluate(()=>!!$('#rptOv')&&!$('#rptOv').hidden);await p.click('#rptClose');await W(900)}
    await shut('report');
    s=await open('log');seen['編輯紀錄']=s.log;c=await noChrome(p);ok(!c.close,'1300 編輯紀錄面板沒有「關閉」');await shut('log');
    s=await open('team');seen['人員']=s.dlg==='身分與專員';await shut('team');
    s=await open('labels');seen['標籤']=s.dlg==='標籤';
    const lblNote=await p.evaluate(()=>[...document.querySelectorAll('#dlgForm .sub,#dlgForm .tm-note')].map(x=>x.textContent).filter(t=>/例如|按「完成」|需要管理員/.test(t)));
    ok(!lblNote.length,'標籤面板沒有說明小字 '+lblNote);await shut('labels');
    s=await open('backup');seen['備份']=s.hub.includes('export')&&s.hub.includes('import');await shut('backup');
    s=await open('device');seen['這台裝置']=s.hub.includes('forget');await shut('device');
    s=await open('site');seen['網站管理']=s.hub.includes('cloud')&&!s.hub.includes('share');   /* ui-09 N：分享預覽入口拿掉（ui9og 另外檢查） */await shut('site');
    s=await open('look');seen['外觀']=s.look;
    c=await noChrome(p);ok(c.title===0,'設定頁沒有 title 屬性');
    await shut('look');
    ok(Object.keys(seen).length===9&&Object.values(seen).every(Boolean),'九項功能都點得開（1300）'+JSON.stringify(seen));
    const back=await pane();ok(!back.split&&!back.paneShown,'再點一次選到的項目＝收起面板');
    ok(!p.errs.length,'1300 沒有錯誤 '+p.errs.join(' | '));
    await b.close()}

  /* ---------- 手機 412 ---------- */
  {const {b,mk,login}=await setup();const p=await mk(412,900,'light',true);
    await p.click('#setBtn');await W(900);
    let c=await noChrome(p);ok(!c.logo&&!c.close,'412 設定頁沒有 logo、沒有關閉 '+JSON.stringify(c));
    let g=await gearSt(p);ok(g.open&&g.on,'412 設定鍵選中');
    await p.evaluate(()=>closeSettings(true));await login(p);
    await p.click('#setBtn');await W(900);
    let rc=await rowCheck(p);ok(rc.n>=7&&!rc.bad.length&&!rc.gap.length&&!rc.rad.length,'412 列：沒有小字、留縫、圓角 14 '+JSON.stringify(rc));
    const sub=()=>p.evaluate(()=>{const s=$('#setSub'),r=s&&s.getBoundingClientRect();return {sub:subOpen,shown:!!s&&!s.hidden,full:!!r&&r.left===0&&Math.abs(r.top-document.querySelector('.dhead').getBoundingClientRect().bottom)<1.5&&r.top>20&&r.width===innerWidth&&r.bottom===innerHeight,listHidden:$('#setOv').hidden,
      top:s?[...s.querySelector('.set-sub-top').children].map(x=>x.id):[],logo:!!s&&!!s.querySelector('.logo,.set-logo'),hub:s?[...s.querySelectorAll('.set-hub:not([hidden]) [data-hub]')].map(x=>x.dataset.hub):[],
      dlg:$('#dlg').open&&!!s&&s.contains($('#dlg'))?$('#dlgForm>b')?.textContent:'',log:!!s&&!!s.querySelector('#logOv:not([hidden])'),week:!!s&&!!s.querySelector('#weekWrap:not([hidden])'),look:!!s&&!!s.querySelector('.look')}});
    const seen={};
    const go=async k=>{await p.click(`#setOv [data-set="${k}"]`);await W(1100);return sub()};
    const leave=async()=>{for(let i=0;i<3&&await p.evaluate(()=>subOpen);i++){await p.click('#subBack');await W(1000)}};
    let s=await go('report');ok(s.sub&&s.shown&&s.full&&s.top.join()==='subBack'&&!s.logo&&s.hub.join()==='week,report','412 進子頁（ui-09 起從部門標題列下緣蓋到底，標題列留著）、上方只有返回 '+JSON.stringify(s));
    rc=await rowCheck(p);ok(!rc.bad.length&&!rc.gap.length&&!rc.rad.length,'412 子頁的列：沒有小字、留縫、圓角 14 '+JSON.stringify(rc));
    await p.click('#setSub [data-hub="week"]');await W(1000);seen['每週概述']=(await sub()).week;await p.click('#subBack');await W(1000);
    await p.click('#setSub [data-hub="report"]');await W(1000);seen['工作報告']=(await sub()).dlg==='匯出工作報告';await leave();
    s=await sub();ok(!s.sub&&!s.listHidden,'412 返回回到設定清單');
    s=await go('log');seen['編輯紀錄']=s.log;c=await noChrome(p);ok(!c.close,'412 編輯紀錄子頁沒有「關閉」');await leave();
    s=await go('team');seen['人員']=s.dlg==='身分與專員';await leave();
    s=await go('labels');seen['標籤']=s.dlg==='標籤';await leave();
    s=await go('backup');seen['備份']=s.hub.includes('export');await leave();
    s=await go('device');seen['這台裝置']=s.hub.includes('forget');await leave();
    s=await go('look');seen['外觀']=s.look;
    c=await noChrome(p);ok(c.title===0&&!c.logo&&!c.close,'412 子頁沒有 title、logo、關閉 '+JSON.stringify(c));
    await leave();
    ok(Object.values(seen).every(Boolean)&&Object.keys(seen).length===8,'412 八項（網站管理只給後台管理員）都點得開 '+JSON.stringify(seen));
    /* 子頁開著時按設定鍵＝整個關掉 */
    await go('labels');await p.click('#setBtn');await W(1200);
    s=await sub();g=await gearSt(p);ok(!g.open&&!s.sub&&!s.shown&&!g.on,'412 子頁開著時按設定鍵＝關閉設定 '+JSON.stringify({g,s}));
    ok(!p.errs.length,'412 沒有錯誤 '+p.errs.join(' | '));
    await b.close()}
  console.log(fails?`失敗 ${fails} 項`:'全部通過');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
