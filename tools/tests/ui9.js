/* ui9：ui-09 的 K 項（ui-08 回報裡「沒做」「其他」的前端項目；docs/DESIGN-next.md）。github 模式，固定 8300 埠。
   K1 設定是部門內的一頁：1300、412 打開設定時部門標題列還在畫面上、是同一個節點、沒有被蓋住；設定（412 子頁也是）從標題列下緣開始蓋到底；
      底下的頁面不捲；關掉後標題列照舊
   K3 標籤面板一類一塊：五塊（標題＋數量）、沒有「完成」與舊的逐列輸入框；虛線「+」→ 輸入框，Enter 加入且輸入框留著、HTML 字元照字面顯示；
      點名字原地改名（Enter 存、Esc 不改）；× 刪除；點別處有字就加入；離開這一頁才寫一筆 commit；唯讀檢視沒有 +、×，名字不能點
   （其他 K 項的斷言接在後面）
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common.js');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 登入後共用密碼太短的對話框可能晚一點才跳出來（team.js 的 sharedPwFix）：測試先取消 */
const dlgOff=async p=>{for(let i=0;i<4;i++){await p.waitForTimeout(400);if(await p.evaluate(()=>$('#dlg').open))await p.click('#dlgForm [data-act=cancel]').catch(()=>{})}};
/* 每一輪各開一個瀏覽器（common.js 的測試資料在同一輪裡共用：第二次登入時身分「王」已經建好，流程不一樣） */
const fresh=async(w,sc='light')=>{const S=await c.setup(),touch=w<700,p=await S.mk(w,touch?900:860,sc,touch);await S.login(p);await dlgOff(p);p.__b=S.b;p.__S=S;return p};
(async()=>{const errs=[];
  /* ---------- K1 設定是部門內的一頁 ---------- */
  for(const w of [1300,412]){const touch=w<700,p=await fresh(w);
    await p.evaluate(()=>{window.__dh=document.querySelector('.dhead');document.querySelector('#pageMain').scrollTop=400});
    await p.click('#setBtn');await p.waitForTimeout(900);
    const r=await p.evaluate(()=>{const h=document.querySelector('.dhead'),hr=h.getBoundingClientRect(),o=$('#setOv').getBoundingClientRect(),
      hit=document.elementFromPoint(hr.left+hr.width/2,hr.top+hr.height/2),home=document.elementFromPoint(...(r=>[r.left+r.width/2,r.top+r.height/2])($('.dh-home').getBoundingClientRect()));
      return {same:h===window.__dh,top:hr.top,hb:hr.bottom,ot:o.top,ob:o.bottom,ow:o.width,H:innerHeight,W:innerWidth,hit:!!hit&&!!hit.closest('.dhead'),home:!!home&&!!home.closest('.dh-home'),
        ovf:getComputedStyle($('#pageMain')).overflowY,st:$('#pageMain').scrollTop}});
    ok(r.same&&r.top>=0&&r.hit&&r.home,`${w} 設定開著：部門標題列還在畫面上（top ${r.top.toFixed(0)}）、同一個節點、沒有被蓋住（首頁鍵點得到）`);
    ok(Math.abs(r.ot-r.hb)<1.5&&Math.abs(r.ob-r.H)<1.5&&Math.abs(r.ow-r.W)<1.5,`${w} 設定從標題列下緣（${r.hb.toFixed(0)}）蓋到底（${r.ot.toFixed(0)}–${r.ob.toFixed(0)}）`);
    ok(r.ovf==='hidden'&&r.st===0,`${w} 打開時頁面捲回頂端、底下的頁面不捲（${r.ovf} ${r.st}）`);
    if(touch){await p.evaluate(()=>document.querySelector('#setOv [data-set="labels"]').click());await p.waitForTimeout(1100);
      const s=await p.evaluate(()=>{const s=$('#setSub').getBoundingClientRect(),h=document.querySelector('.dhead').getBoundingClientRect();return {open:subOpen,t:s.top,hb:h.bottom,b:s.bottom,H:innerHeight}});
      ok(s.open&&Math.abs(s.t-s.hb)<1.5&&Math.abs(s.b-s.H)<1.5,`412 子頁也從標題列下緣開始（${s.t.toFixed(0)}／${s.hb.toFixed(0)}）`);
      await p.evaluate(()=>$('#subBack').click());await p.waitForTimeout(900)}
    await p.click('#setBtn');await p.waitForTimeout(900);
    const e=await p.evaluate(()=>({open:setOpen,hid:$('#setOv').hidden,ovf:getComputedStyle($('#pageMain')).overflowY,same:document.querySelector('.dhead')===window.__dh}));
    ok(!e.open&&e.hid&&e.ovf==='auto'&&e.same,`${w} 再按設定鍵關掉：頁面可以捲、標題列同一個節點`);
    errs.push(...p.errs);await p.__b.close()}

  /* ---------- K3 標籤面板 ---------- */
  {const p=await fresh(1300);await p.click('#setBtn');await p.waitForTimeout(800);await p.click('#setOv [data-set="labels"]');await p.waitForTimeout(1000);
    const F='#dlgForm';
    let r=await p.evaluate(()=>({box:[...document.querySelectorAll('#dlgForm .lbl-box')].map(b=>b.querySelector('.lbl-h').textContent).join(),done:!!document.querySelector('#dlgForm [data-x="done"],#dlgForm .tm-row,#dlgForm .tm-tools'),
      en:getComputedStyle(document.querySelector('#dlgForm .sec-h'),'::before').content,radius:getComputedStyle(document.querySelector('#dlgForm .lbl-box')).borderRadius}));
    ok(r.box==='人0,事0,時0,地0,物0'&&!r.done&&r.en==='"TAGS"'&&r.radius==='18px',`五塊（${r.box}）、英文小標 ${r.en}、圓角 ${r.radius}、沒有完成鈕與舊的逐列輸入框`);
    const c0=p.__S.st.commits.length;
    await p.click(`${F} [data-x="open"][data-k="人"]`);await p.waitForTimeout(200);
    for(const n of ['林昱辰','<img src=x onerror="window.__xss=1">']){await p.fill(`${F} [data-newlbl="人"]`,n);await p.press(`${F} [data-newlbl="人"]`,'Enter');await p.waitForTimeout(250)}
    r=await p.evaluate(()=>({tags:[...document.querySelectorAll('#dlgForm .lbl-box[data-k="人"] .lbl-n')].map(x=>x.textContent).sort().join('|'),h:document.querySelector('#dlgForm .lbl-box[data-k="人"] .lbl-h').textContent,
      inp:document.activeElement&&document.activeElement.dataset.newlbl,img:document.querySelectorAll('#dlgForm img').length,x:!!window.__xss}));
    ok(r.tags.includes('林昱辰')&&r.tags.includes('<img src=x onerror="window.__xss=1">')&&r.h==='人2'&&r.inp==='人'&&!r.img&&!r.x,`Enter 加入、輸入框留著打下一個（${r.h}）；HTML 字元照字面顯示、沒有插入元素`);
    await p.keyboard.press('Escape');await p.waitForTimeout(250);
    r=await p.evaluate(()=>({inp:!!document.querySelector('#dlgForm [data-newlbl]'),set:setOpen,pane:paneKey}));
    ok(!r.inp&&r.set&&r.pane==='labels','Esc 收回輸入框、不離開這一頁');
    const id=await p.evaluate(()=>state.labels.find(l=>l.name==='林昱辰').id);
    await p.click(`${F} [data-x="ren"][data-id="${id}"]`);await p.waitForTimeout(200);
    r=await p.evaluate(id=>({inp:document.activeElement&&document.activeElement.dataset.lblname===id,v:document.activeElement.value}),id);
    await p.keyboard.type('林昱辰二');await p.keyboard.press('Enter');await p.waitForTimeout(250);
    const nm=await p.evaluate(id=>state.labels.find(l=>l.id===id).name,id);
    await p.click(`${F} [data-x="ren"][data-id="${id}"]`);await p.waitForTimeout(200);await p.keyboard.type('不要');await p.keyboard.press('Escape');await p.waitForTimeout(250);
    const nm2=await p.evaluate(id=>({n:state.labels.find(l=>l.id===id).name,set:setOpen}),id);
    ok(r.inp&&nm==='林昱辰二'&&nm2.n==='林昱辰二'&&nm2.set,`點名字原地改名：Enter 存（${nm}）、Esc 不改（${nm2.n}）`);
    await p.click(`${F} [data-x="open"][data-k="地"]`);await p.fill(`${F} [data-newlbl="地"]`,'學生會辦');await p.click(`${F} .lbl-box[data-k="物"] .lbl-h`);await p.waitForTimeout(300);
    r=await p.evaluate(()=>({has:state.labels.some(l=>l.kind==='地'&&l.name==='學生會辦'),inp:!!document.querySelector('#dlgForm [data-newlbl]')}));
    ok(r.has&&!r.inp,'點別處：有字就加入、收回輸入框');
    const xid=await p.evaluate(()=>state.labels.find(l=>l.name.startsWith('<img')).id);
    await p.click(`${F} [data-x="del"][data-id="${xid}"]`);await p.waitForTimeout(250);
    r=await p.evaluate(()=>({n:state.labels.length,h:document.querySelector('#dlgForm .lbl-box[data-k="人"] .lbl-h').textContent}));
    ok(r.n===2&&r.h==='人1',`× 刪除（剩 ${r.n}、${r.h}）`);
    const c1=p.__S.st.commits.length;
    await p.click('#setOv [data-set="labels"]');await p.waitForTimeout(2500);
    const c2=p.__S.st.commits.length,msg=p.__S.st.commits[0]||'';
    ok(c1===c0&&c2===c0+1&&/標籤/.test(msg),`改的過程不存、離開這一頁才寫一筆 commit（${msg.split('\n')[0]}）`);
    /* 設定開著時按眼睛鈕：設定收起來（唯讀檢視沒有設定鍵），改到一半的標籤照離開處理（存） */
    await p.click('#setOv [data-set="labels"]');await p.waitForTimeout(900);await p.click(`${F} [data-x="open"][data-k="物"]`);await p.fill(`${F} [data-newlbl="物"]`,'公文');
    await p.click('#peekBtn');await p.waitForTimeout(2500);
    r=await p.evaluate(()=>({set:setOpen,ro:roView,gear:(b=>!b||b.hidden||getComputedStyle(b).display==='none'||getComputedStyle(b).visibility==='hidden')(document.querySelector('#tabbar .tb-gear')),has:state.labels.some(l=>l.name==='公文')}));
    ok(!r.set&&r.ro&&r.gear&&r.has&&p.__S.st.commits.length===c0+2,`設定開著時按眼睛鈕：設定收起、沒有設定鍵、打到一半的標籤有存（${JSON.stringify(r)}）`);
    errs.push(...p.errs);await p.__b.close()}

  ok(!errs.length,`沒有 pageerror${errs.length?'：'+errs.slice(0,3).join('；'):''}`);
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0)})();
