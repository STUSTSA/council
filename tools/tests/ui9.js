/* ui9：ui-09 的 K 項（ui-08 回報裡「沒做」「其他」的前端項目；docs/DESIGN-next.md）。github 模式，固定 8300 埠。
   K1 設定是部門內的一頁：1300、412 打開設定時部門標題列還在畫面上、是同一個節點、沒有被蓋住；設定（412 子頁也是）從標題列下緣開始蓋到底；
      底下的頁面不捲；關掉後標題列照舊
   K3 標籤面板一類一塊：五塊（標題＋數量）、沒有「完成」與舊的逐列輸入框；虛線「+」→ 輸入框，Enter 加入且輸入框留著、HTML 字元照字面顯示；
      點名字原地改名（Enter 存、Esc 不改）；× 刪除；點別處有字就加入；離開這一頁才寫一筆 commit；唯讀檢視沒有 +、×，名字不能點
   K4 「這台裝置」「網站管理」合併頁最上面一塊寫目前的狀態：記住的身分（忘記後即時改成「沒有記住身分」）、雲端同步的 repo 與權杖狀態（資料經過跳脫）；設定列上照樣只有名稱
   K5 進度頁標題列：英文小標 TIMELINE＋「進度」（700）；全部／上學期／下學期與實心「+ 議題」（--pri 底、高 52）在標題列（桌面同一列在標題右邊、手機在標題下一列）；
      分段切換的鏡片看得到（寬 > 0，進度頁一開始藏著也一樣）；議題詳情時切換與新增藏起來、回甘特圖再出現；唯讀檢視沒有「+ 議題」
   K6 其他：區塊標題（即時回報）英文小標在上、700、沒有細線箭頭；對話框寬 380（手機畫面寬減 40）、內距 26、標題 17px 700、刪除鈕紅底（沒有 !important 也對）；
      即時回報卡片存檔不跳「已儲存並同步到雲端…」提示（卡片上照樣「已儲存」、有寫 commit）；登入的對話框沒有說明句；時間頁的名稱平面字（聚焦時沒有底線）
   審查修正：設定開著時按首頁鍵＝先存標籤面板再離開；點「+」前沒失焦（觸控）也會先提交輸入框；設定開著時按通知鈕，系統返回先關通知頁、不離站；
      白紙目錄標題 28px 700；長的面板標題會換行不溢出
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

  /* ---------- K4 這台裝置、網站管理的狀態塊 ---------- */
  {c.q='?admin';const p=await fresh(1300);c.q='';await p.click('#setBtn');await p.waitForTimeout(800);
    const row=await p.evaluate(()=>[...document.querySelectorAll('#setOv .set-inner .set-row')].map(r=>r.textContent.trim()).join('|'));
    await p.click('#setOv [data-set="site"]');await p.waitForTimeout(900);
    let r=await p.evaluate(()=>({st:document.querySelector('#setOv .set-pane .set-hub .acct-me')?.textContent||'',c:cloudCfg(),on:cloudOn(),tk:!!ghToken()}));
    ok(r.st===`雲端同步${r.on?`${r.c.owner}/${r.c.repo}・${r.tk?'這台裝置已連上':'這台裝置還沒有權杖'}`:'尚未設定'}`,`網站管理：最上面寫雲端同步的狀態（${r.st}）`);
    await p.click('#setOv [data-set="device"]');await p.waitForTimeout(900);
    r=await p.evaluate(()=>({st:[...document.querySelectorAll('#setOv .set-pane .set-hub .acct-me .acct-person')].map(x=>x.textContent).join('|'),n:remName()}));
    ok(/^記住的身分/.test(r.st)&&r.st.includes(r.n||'沒有記住身分')&&!/記住/.test(row),`這台裝置：最上面寫記住的身分（${r.st}）；設定列上沒有（${row}）`);
    if(r.n){await p.click('#setOv .set-pane [data-hub="forget"]');await p.waitForTimeout(500);
      const t=await p.evaluate(()=>document.querySelector('#setOv .set-pane .acct-me').textContent);ok(t==='記住的身分沒有記住身分',`忘記這台裝置後即時改成「${t}」`)}
    errs.push(...p.errs);await p.__b.close()}

  /* ---------- K5 進度頁標題列 ---------- */
  for(const w of [1300,412]){const touch=w<700,p=await fresh(w);await p.evaluate(()=>setSection('progress',{instant:true}));await p.waitForTimeout(900);
    const geo=()=>p.evaluate(()=>{const R=e=>e&&e.getBoundingClientRect(),V=e=>!!e&&getComputedStyle(e).display!=='none'&&R(e).width>0,h=$('#ganttH'),g=$('#gTerm'),a=$('#addIssue');
      const hb=R(h),gb=R(g),ab=R(a),cs=getComputedStyle(a),pri=getComputedStyle(document.documentElement).getPropertyValue('--pri').trim();
      const t=document.createElement('i');t.style.color=pri;document.body.append(t);const priC=getComputedStyle(t).color;t.remove();
      return {t:h.textContent,en:getComputedStyle(h,'::before').content,fw:getComputedStyle(h).fontWeight,inHead:!!g.closest('.panel-head')&&!!a.closest('.panel-head'),
        gv:V(g),av:V(a),hb:[hb.left,hb.right,hb.top,hb.bottom],gb:[gb.left,gb.top,gb.bottom],ab:[ab.left,ab.height],bg:cs.backgroundColor,priC,lens:R(g.querySelector('.lseg-lens')).width}});
    let r=await geo();
    ok(r.t==='進度'&&r.en==='"TIMELINE"'&&+r.fw>=700&&r.inHead,`${w} 標題「${r.t}」英文小標 ${r.en}、${r.fw}；切換與新增在標題列`);
    ok(r.gv&&r.av&&r.bg===r.priC&&Math.abs(r.ab[1]-52)<1&&r.lens>10,`${w} 「+ 議題」實心（${r.bg}＝--pri）、高 ${r.ab[1]}；鏡片寬 ${r.lens.toFixed(0)}`);
    ok(touch?r.gb[1]>=r.hb[3]-1:(r.gb[0]>r.hb[0]+100&&r.gb[1]<r.hb[3]),`${w} ${touch?'手機：切換在標題下一列':'桌面：切換在標題右邊同一列'}（標題 ${r.hb.map(x=>x.toFixed(0))}，切換 ${r.gb.map(x=>x.toFixed(0))}）`);
    const id=await p.evaluate(()=>activeIssues()[0].id);await p.evaluate(id=>progShow(id),id);await p.waitForTimeout(900);
    r=await geo();const r2=r;await p.evaluate(()=>progShow(null));await p.waitForTimeout(900);r=await geo();
    ok(!r2.gv&&!r2.av&&r.gv&&r.av,`${w} 議題詳情時切換與新增藏起來、回甘特圖再出現`);
    if(!touch){await p.click('#peekBtn');await p.waitForTimeout(600);r=await geo();ok(!r.av&&r.gv,'唯讀檢視：沒有「+ 議題」、切換照常');await p.click('#peekBtn');await p.waitForTimeout(400)}
    errs.push(...p.errs);await p.__b.close()}

  /* ---------- K6 其他 ---------- */
  for(const w of [1300,412]){const touch=w<700,p=await fresh(w);
    let r=await p.evaluate(()=>{const h=$('#evH'),b=getComputedStyle(h,'::before'),a=getComputedStyle(h,'::after');return {t:h.textContent,en:b.content,enFs:b.fontSize,fw:getComputedStyle(h).fontWeight,after:a.content}});
    ok(r.t==='即時回報'&&r.en==='"LIVE"'&&r.enFs==='10.5px'&&+r.fw>=700&&(r.after==='none'||r.after==='normal'),`${w} 即時回報標題：英文小標 ${r.en}（${r.enFs}）在上、${r.fw}、沒有細線箭頭（${r.after}）`);
    await p.evaluate(()=>{window.__dl=ask('刪除這張卡片',[],{danger:'刪除'})});await p.waitForTimeout(500);
    r=await p.evaluate(()=>{const d=$('#dlg'),cs=getComputedStyle(d),b=getComputedStyle($('#dlgForm>b')),x=$('#dlgForm .danger-solid');
      const t=document.createElement('i');t.style.color='var(--late)';document.body.append(t);const late=getComputedStyle(t).color;t.remove();
      return {w:d.getBoundingClientRect().width,pad:cs.paddingLeft,fs:b.fontSize,fw:b.fontWeight,bg:getComputedStyle(x).backgroundColor,late,W:innerWidth}});
    ok(Math.abs(r.w-Math.min(380,r.W-40))<1&&r.pad==='26px'&&r.fs==='17px'&&+r.fw>=700&&r.bg===r.late,`${w} 對話框寬 ${r.w}、內距 ${r.pad}、標題 ${r.fs} ${r.fw}；刪除鈕紅底（${r.bg}）`);
    await p.click('#dlgForm [data-act=cancel]');await p.waitForTimeout(400);
    if(!touch){
      /* 卡片存檔：不跳「已儲存並同步到雲端」提示 */
      const c0=p.__S.st.commits.length;await p.evaluate(()=>{window.__toasts=[];const o=window.toast;const t=$('#toast');new MutationObserver(()=>window.__toasts.push(t.textContent)).observe(t,{childList:true,characterData:true,subtree:true})});
      await p.click('#events .cp, #events [data-ev]').catch(()=>{});await p.waitForTimeout(900);
      await p.click('[data-kpgo="title"]').catch(()=>{});await p.waitForTimeout(400);await p.keyboard.press('End');await p.keyboard.type('Z');await p.click('#evH');await p.waitForTimeout(2600);
      r=await p.evaluate(()=>({toasts:window.__toasts.join('|'),st:(document.querySelector('.kp-st')||{}).textContent||''}));
      ok(p.__S.st.commits.length===c0+1&&!/同步到雲端/.test(r.toasts)&&/已儲存/.test(r.st),`卡片存檔：寫了一筆 commit、卡片上「${r.st}」、沒有跳同步提示（${r.toasts||'無提示'}）`);
      /* 時間頁的名稱：平面字 */
      await p.click('[data-kpgo="title"]').catch(()=>{});await p.waitForTimeout(400);await p.click('[data-lctool="time"]').catch(()=>{});await p.waitForTimeout(600);
      if(!(await p.$('.te-nm'))){await p.click('[data-teadd]').catch(()=>{});await p.waitForTimeout(500)}
      r=await p.evaluate(()=>{const i=document.querySelector('.te-nm');if(!i)return null;i.focus();const cs=getComputedStyle(i);return {bb:cs.borderBottomWidth,bg:cs.backgroundColor,ol:cs.outlineStyle}});
      ok(!!r&&r.bb==='0px'&&r.bg==='rgba(0, 0, 0, 0)'&&r.ol==='none',`時間頁名稱：平面字、聚焦時沒有底線（${JSON.stringify(r)}）`);
      await p.keyboard.press('Escape');await p.waitForTimeout(800);
    }
    errs.push(...p.errs);await p.__b.close()}
  /* 登入的對話框沒有說明句（選擇編輯身分：已有身分時；ui-09 拿掉） */
  {const S=await c.setup(),p=await S.mk(1300,860,'light',false);await S.login(p);await dlgOff(p);await p.evaluate(()=>{localStorage.removeItem('workboard:remember');meId='';sessionPw='';render()}).catch(()=>{});
    await p.evaluate(()=>{if(typeof forgetDevice==='function')forgetDevice()});await p.waitForTimeout(400);
    await p.click('#setBtn');await p.waitForTimeout(800);await p.click('#setOv .set-gate .primary').catch(()=>{});await p.waitForTimeout(700);
    const r=await p.evaluate(()=>({t:$('#dlg').open?$('#dlgForm>b').textContent:'',note:!!document.querySelector('#dlgForm .dlg-note')}));
    ok(r.t==='選擇編輯身分'&&!r.note,`登入（${r.t}）沒有說明句`);errs.push(...p.errs);await S.b.close()}

  /* ---------- 審查修正 ---------- */
  {const p=await fresh(1300);const S=p.__S;let r;
    await p.click('#setBtn');await p.waitForTimeout(800);await p.click('#setOv [data-set="labels"]');await p.waitForTimeout(900);
    /* 觸控：輸入框還有焦點時就點另一類的「+」（blur 跟 click 同一輪） */
    await p.click('#dlgForm [data-x="open"][data-k="人"]');await p.fill('#dlgForm [data-newlbl="人"]','先打的字');
    await p.evaluate(()=>document.querySelector('#dlgForm [data-x="open"][data-k="事"]').click());await p.waitForTimeout(300);
    r=await p.evaluate(()=>({has:state.labels.some(l=>l.name==='先打的字'),inp:document.querySelector('#dlgForm .lbl-in')?.dataset.newlbl}));
    ok(r.has&&r.inp==='事','輸入框沒失焦就點另一類的「+」：打的字先加入、換成那一類的輸入框');
    const id=await p.evaluate(()=>state.labels.find(l=>l.name==='先打的字').id);
    await p.evaluate(id=>document.querySelector(`#dlgForm [data-x="ren"][data-id="${id}"]`).click(),id);await p.waitForTimeout(200);
    await p.fill(`#dlgForm [data-lblname="${id}"]`,'改過的字');await p.evaluate(()=>document.querySelector('#dlgForm [data-x="open"][data-k="時"]').click());await p.waitForTimeout(300);
    r=await p.evaluate(id=>state.labels.find(l=>l.id===id).name,id);ok(r==='改過的字',`改名打到一半就點「+」：名字先存（${r}）`);
    /* 首頁鍵：先存再離開 */
    await p.fill('#dlgForm [data-newlbl="時"]','離開前');const c0=S.st.commits.length;
    await p.click('.dhead .dh-home');await p.waitForURL(/home\.html/,{timeout:8000}).catch(()=>{});
    const saved=S.remote().labels||[];
    ok(/home\.html/.test(p.url())&&S.st.commits.length===c0+1&&['改過的字','離開前'].every(n=>saved.some(l=>l.name===n)),`設定開著時按首頁鍵：先存一筆（${S.st.commits[0]?.split('\n')[0]}）再回主頁`);
    await S.b.close()}
  {const p=await fresh(1300);
    await p.click('#setBtn');await p.waitForTimeout(800);await p.click('#notiBtn');await p.waitForTimeout(1000);
    const a=await p.evaluate(()=>({set:setOpen,noti:notiOpen,st:history.state&&history.state.bl}));
    await p.goBack().catch(()=>{});await p.waitForTimeout(900);
    const b=await p.evaluate(()=>({url:location.pathname,noti:notiOpen})).catch(()=>({url:'?'}));
    ok(!a.set&&a.noti&&a.st==='noti'&&/index\.html$/.test(b.url)&&!b.noti,`設定開著時按通知鈕：瀏覽紀錄換成通知頁（${a.st}），系統返回先關通知頁、留在看板（${b.url}）`);
    const r=await p.evaluate(()=>{const d=document.createElement('div');d.innerHTML='<article class="rpt-paper"><header class="toc-h"><span>CONTENTS</span><h2>目錄</h2></header></article>';document.body.append(d);
      const h=getComputedStyle(d.querySelector('h2'));const o={fs:h.fontSize,fw:h.fontWeight};d.remove();
      const b=document.createElement('b');b.className='sec-h';b.style.width='200px';b.textContent='分享預覽（貼連結到 LINE、IG、FB 時顯示）';document.body.append(b);o.over=b.scrollWidth>b.clientWidth+1;b.remove();return o});
    ok(r.fs==='28px'&&+r.fw>=700&&!r.over,`白紙目錄標題 ${r.fs} ${r.fw}；長的區塊標題換行不溢出`);
    errs.push(...p.errs);await p.__b.close()}

  ok(!errs.length,`沒有 pageerror${errs.length?'：'+errs.slice(0,3).join('；'):''}`);
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0)})();
