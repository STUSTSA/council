/* ui8prog：ui-08 進度頁（docs/DESIGN-next.md 第八節、第十三、十四節；前後端交接-next 第七節「時程條細刻度 → 滑桿式」）。
   github 模式（data_test.json 加上專員與兩個只在某一學期的議題），固定 8300 埠（run-tests.sh 換埠時會一起換）。412 與 1300 各跑一次：
   1. 議題詳情的時程條：已過、把手、還沒到三段之間有縫；把手中心＝時程百分比（誤差 1px）；甘特圖每一列也是滑桿（ui-12 起，原本「照舊是細刻度」）
   2. 名稱與百分比的邊界框不跟把手重疊：時程小（3%）放把手右側、時程大（97%）放左側、名稱太長放條的上方（在把手上緣之上）
   3. 負責人：1300 放條的右端、放不下收成「+N」（數字＝沒放的人數，不跟名稱重疊、不超出那一段）；412 不放在條上，看下面議題區塊的專員列
   4. 「+ 議題」：不開對話框、焦點直接在名稱上（整段選取）；打字＋Enter 存檔，攔截 PUT 驗證寫入的名稱（含 HTML 字元，畫面上經過 esc、沒有變成元素）
   5. 議題名稱點了就改：原地換成輸入框（字的位置不動）；Enter 存檔、點外面存檔、Esc＝跟點外面一樣存檔；清空後點外面＝不改、不寫 commit；新增後沒命名就 Esc＝不留
   6. 全部／上學期／下學期切換改變顯示的議題
   7. 唯讀（唯讀檢視、沒登入）：沒有「+ 議題」、名稱點了不能改
   8. 關掉動態：打開詳情時時程條沒有動畫
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');const fs=require('fs');const os=require('os');const path=require('path');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 測試資料：兩個只在某一學期的議題（專員登入後在畫面上加，見 staffIn） */
const D=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
const NM=['林昱辰','陳姵蓁','黃柏叡','周語彤','吳宥廷','李承翰','江柏宇','許哲瑋','鄭羽晴','蔡沛妤','王小明','張大千','劉一','陳二','林三','黃四'];
const staffIn=p=>p.evaluate(NM=>{NM.forEach((n,k)=>state.members.push({id:'u'+k,name:n}));const a=activeIssues();a[0].staff=['u0','u1'];a[1].staff=NM.map((n,k)=>'u'+k);render()},NM);
const iss=(id,title,start,end)=>({id,title,tags:['收案','處理中','結案'],cur:0,start,end,doneAt:null,markers:[],links:[]});
D.issues.push(iss('iUP','只在上學期的議題','2026-09-10','2026-12-20'),iss('iDN','只在下學期的議題','2027-03-01','2027-04-30'));
const DF=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ui8prog-')),'data.json');fs.writeFileSync(DF,JSON.stringify(D));
c.serveRemote=true;
const R=(p,s)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}},s);
const hit=(a,b)=>!!a&&!!b&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;
const vis=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&!e.hidden&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0},sel);
const ymdOff=d=>{const t=new Date();t.setDate(t.getDate()+d);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')};
(async()=>{
  for(const [w,h] of [[1300,900],[412,900]]){
    const {b,mk,login,st,remote}=await c.setup(DF);   /* 每個寬度各一份遠端資料（第一輪存進去的身分不影響第二輪登入） */
    const tag=`${w}：`;
    const p=await mk(w,h,'light',w<640);
    await login(p);await p.waitForTimeout(400);await staffIn(p);
    await p.evaluate(()=>{sharedPwSession=null});   /* 測試的共用密碼 0000 太短：每次存檔後會跳「請換共用密碼」對話框（save.js），這裡不測它 */
    const iid=await p.evaluate(()=>activeIssues()[0].id);
    const open=async id=>{await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},id);await p.waitForTimeout(900)};
    await open(null);
    ok(await p.evaluate(()=>document.querySelectorAll('#gantt .g-issue .sl.g').length>0&&!document.querySelector('#gantt .tk')),tag+'甘特圖每一列也是滑桿式時程條（ui-12；細刻度拿掉，細節在 ui12.js）');
    await open(iid);
    await p.evaluate(()=>{window.__keep=JSON.stringify(state)});   /* 第 1～3 段只改畫面上的資料、不存：做完還原 */

    /* 1. 三段、縫、把手位置 */
    const geo=()=>p.evaluate(()=>{const q=s=>{const e=document.querySelector('#cardDetail '+s);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}};
      const bar=document.querySelector('#cardDetail .sl');return {bar:q('.sl'),a:q('.sl-a'),h:q('.sl-h'),bb:q('.sl-b'),lb:q('.sl-lb'),p:bar&&bar.dataset.p,cls:bar&&['lb-a','lb-b','lb-up'].find(k=>bar.classList.contains(k)),
        pct:schedPct(activeIssues().find(i=>i.id===progOpen)),anim:document.querySelectorAll('#cardDetail .sl *').length&&[...document.querySelectorAll('#cardDetail .sl *')].some(e=>e.getAnimations().some(a=>a.playState==='running'))}});
    await p.waitForTimeout(600);
    let g=await geo();
    ok(g.bar&&g.a&&g.h&&g.bb,tag+'詳情的時程條有已過、把手、還沒到三段');
    ok(g.h.l-g.a.r>=4&&g.bb.l-g.h.r>=4,tag+`三段之間有縫（${(g.h.l-g.a.r).toFixed(1)}、${(g.bb.l-g.h.r).toFixed(1)}px）`);
    ok(g.h.h>g.bar.h&&g.a.h===g.bar.h,tag+`把手是直立的、比條高（${g.h.h}／${g.bar.h}）`);
    ok(+g.p===g.pct&&Math.abs((g.h.l+g.h.r)/2-g.bar.l-g.pct/100*g.bar.w)<=1,tag+`把手位置＝時程百分比 ${g.pct}%（差 ${((g.h.l+g.h.r)/2-g.bar.l-g.pct/100*g.bar.w).toFixed(2)}px）`);
    ok(!hit(g.lb,g.h),tag+`名稱與百分比不跟把手重疊（${g.cls}）`);
    {const cs=await p.evaluate(()=>{const s=e=>getComputedStyle(document.querySelector('#cardDetail '+e)).backgroundColor;const v=n=>{const d=document.createElement('i');d.style.color=`var(${n})`;document.body.append(d);const c=getComputedStyle(d).color;d.remove();return c};return {a:s('.sl-a'),h:s('.sl-h'),acc:v('--acc'),ink:v('--ink')}});
      ok(cs.a===cs.acc&&cs.h===cs.ink,tag+`選中的議題條用選中色（${cs.a}）、把手用深色（${cs.h}）`);}
    /* 2. 名稱的位置：時程小、大、名稱太長 */
    const setIss=(s,e,title)=>p.evaluate(([id,s,e,t])=>{const it=state.issues.find(i=>i.id===id);it.start=s;it.end=e;if(t)it.title=t;render()},[iid,s,e,title]);
    await setIss(ymdOff(-3),ymdOff(97));await p.waitForTimeout(700);g=await geo();
    ok(g.pct<=5&&g.cls==='lb-b'&&g.lb.l>=g.h.r&&!hit(g.lb,g.h)&&g.lb.r<=g.bb.r,tag+`時程 ${g.pct}%（窄的已過段）：名稱與百分比在把手右側`);
    await setIss(ymdOff(-97),ymdOff(3));await p.waitForTimeout(700);g=await geo();
    ok(g.pct>=95&&g.cls==='lb-a'&&g.lb.r<=g.h.l&&g.lb.l>=g.a.l,tag+`時程 ${g.pct}%（窄的還沒到段）：名稱與百分比在把手左側`);
    const long=w<640?'很長很長的議題名稱用來測試放不下的時候':'很長很長的議題名稱用來測試放不下的時候會不會移到時程條的上方而不是被把手蓋住或超出條的範圍';
    await setIss(ymdOff(-50),ymdOff(50),long);await p.waitForTimeout(700);g=await geo();
    ok(g.cls==='lb-up'&&g.lb.b<=g.h.t&&!hit(g.lb,g.h),tag+`名稱太長（兩段都放不下）：移到條的上方（名稱底 ${g.lb.b.toFixed(0)} ≤ 把手頂 ${g.h.t.toFixed(0)}）`);
    {const mk2=await p.evaluate(()=>{const l=document.querySelector('#cardDetail .sl-lb').getBoundingClientRect();return [...document.querySelectorAll('#cardDetail .marker:not(.quiet) .dot,#cardDetail .marker:not(.quiet) .lbl')].some(e=>{const r=e.getBoundingClientRect();return r.width&&r.left<l.right&&l.left<r.right&&r.top<l.bottom&&l.top<r.bottom})});
      ok(!mk2,tag+'名稱移到上方時，註記往上讓、不疊在名稱上');}
    await p.evaluate(()=>{state=normalize(JSON.parse(window.__keep));render()});await p.waitForTimeout(300);
    /* 3. 負責人 */
    const iid2=await p.evaluate(()=>activeIssues()[1].id);await open(iid2);await p.waitForTimeout(500);
    if(w>=640){
      await p.evaluate(id=>{state.issues.find(i=>i.id===id).title='負責人很多的議題名稱放在還沒到的這一段而且名稱很長很長很長要佔掉一半以上的寬度才會擠';render()},iid2);await p.waitForTimeout(500);
      const av=await p.evaluate(()=>{const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width}};const all=[...document.querySelectorAll('#cardDetail .sl-av:not(.sl-more)')];
        const shown=all.filter(e=>!e.hidden&&e.getBoundingClientRect().width>0),more=document.querySelector('#cardDetail .sl-more');
        return {n:all.length,k:shown.length,more:more&&!more.hidden?more.textContent:'',boxes:shown.map(R).concat(more&&!more.hidden?[R(more)]:[]),lb:R(document.querySelector('#cardDetail .sl-lb')),b:R(document.querySelector('#cardDetail .sl-b'))}});
      ok(av.n===16&&av.more===`+${av.n-av.k}`&&av.k<av.n,tag+`負責人放不下：放 ${av.k} 格，其餘收成「${av.more}」`);
      ok(av.boxes.every(x=>!hit(x,av.lb)&&x.l>=av.b.l&&x.r<=av.b.r),tag+'負責人與「+N」不跟名稱重疊、不超出還沒到那段');
      /* 「+N」兩位數（+10 以上，比一位數寬）：名稱長度一個字一個字掃過（窄字 i，剩下的空間每種餘數都碰得到），
         名稱跟第一格之間都要留滿 slFit 預留的 8px（「+N」的寬照實際量；預留不夠時會吃掉這段縫），也不超出還沒到那段 */
      {const bad=[];let two=0,gap=1e9;
        await p.evaluate(id=>{const it=state.issues.find(i=>i.id===id);for(let k=0;k<24;k++){state.members.push({id:'x'+k,name:'加'+k});it.staff.push('x'+k)}},iid2);   /* 40 人：放不下的人數到兩位數 */
        for(let L=1;L<=120;L++){
          const r=await p.evaluate(([id,L])=>{state.issues.find(i=>i.id===id).title='i'.repeat(L);render();const bar=document.querySelector('#cardDetail .sl');
            const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right}};const more=bar.querySelector('.sl-more'),lb=R(bar.querySelector('.sl-lb')),sb=R(bar.querySelector('.sl-b'));
            const boxes=[...bar.querySelectorAll('.sl-av')].filter(e=>!e.hidden&&e.getBoundingClientRect().width>0).map(R);
            return {m:more&&!more.hidden?more.textContent:'',gap:bar.classList.contains('lb-b')&&boxes.length?Math.min(...boxes.map(x=>x.l))-lb.r:null,out:boxes.some(x=>x.l<sb.l-.5||x.r>sb.r+.5)}},[iid2,L]);
          if(!/^\+\d\d$/.test(r.m))continue;two++;if(r.gap!=null)gap=Math.min(gap,r.gap);if(r.out||r.gap!=null&&r.gap<7)bad.push(L+':'+r.m+(r.gap!=null?'/'+r.gap.toFixed(1):''))}
        ok(two>0&&!bad.length,tag+`「+N」兩位數時（${two} 種名稱長度，名稱到第一格最小 ${gap.toFixed(1)}px）不碰名稱、不吃掉預留的縫、不超出那段${bad.length?'：'+bad.slice(0,6).join('、'):''}`);}
      await open(iid);const one=await p.evaluate(()=>[...document.querySelectorAll('#cardDetail .sl-av')].filter(e=>!e.hidden&&e.getBoundingClientRect().width>0).map(e=>e.textContent).join(''));
      ok(one==='林陳',tag+`放得下時每人一格（名字第一個字）：${one}`);
    }else{
      const r=await p.evaluate(()=>({inBar:[...document.querySelectorAll('#cardDetail .sl-av')].some(e=>e.getBoundingClientRect().width>0),row:document.querySelectorAll('#cardDetail .staff-row .staff-chip').length}));
      ok(!r.inBar&&r.row===16,tag+`手機：負責人不放在條上，下面議題區塊的專員列有 ${r.row} 人`);
    }
    /* 4. + 議題 */
    await p.evaluate(()=>{state=normalize(JSON.parse(window.__keep));render()});await open(null);
    const n0=await p.evaluate(()=>state.issues.length),c0=st.commits.length;
    ok(await vis(p,'#addIssue')&&(await p.textContent('#addIssue')).trim()==='議題'&&await p.evaluate(()=>!!$('#addIssue .ico')&&!!$('#addIssue').closest('.panel-head')),tag+'標題列有「+ 議題」（ui-09 起是加號圖示＋「議題」的實心膠囊，在標題列）');
    await p.click('#addIssue');await p.waitForTimeout(900);
    {const r=await p.evaluate(()=>{const a=document.activeElement;return {inp:!!a&&a.matches('#cardDetail .card-head input[data-iname]'),all:a&&a.selectionStart===0&&a.selectionEnd===a.value.length&&a.value.length>0,dlg:$('#dlg').open,fields:!!document.querySelector('#cardDetail .evfs')}});
      ok(r.inp&&r.all&&!r.dlg&&!r.fields,tag+`新增後焦點在名稱上（整段選取）、不開對話框、不是整張卡片的編輯（${JSON.stringify(r)}）`);}
    const evil='<img src=x onerror="window.__x=1">新議題'+w;
    await p.keyboard.type(evil);await p.keyboard.press('Enter');await p.waitForTimeout(1500);
    {const r=await p.evaluate(()=>({ed:editing,img:!!document.querySelector('#cardDetail img,#gantt img'),x:window.__x,t:document.querySelector('#cardDetail .card-title').textContent}));
      const put=(remote().issues||[]).find(i=>i.title===evil);
      ok(st.commits.length===c0+1&&!!put,tag+'Enter 存檔：寫進資料檔（PUT）的議題名稱就是打的字');
      ok(!r.ed&&!r.img&&r.x===undefined&&r.t===evil,tag+'畫面上的名稱經過 esc（沒有變成元素、沒有執行）');}
    ok(await p.evaluate(()=>state.issues.length)===n0+1,tag+'多一個議題');
    /* 5. 點名稱原位編輯 */
    {const b0=await R(p,'#cardDetail .card-title');await p.click('#cardDetail .card-title');await p.waitForTimeout(500);
      const r=await p.evaluate(()=>{const a=document.activeElement;return {inp:!!a&&a.matches('#cardDetail input[data-iname]'),dlg:$('#dlg').open,fields:!!document.querySelector('#cardDetail .evfs'),bar:!!document.querySelector('#cardDetail .card-edbar')}});
      const b1=await R(p,'#cardDetail input.card-title');
      ok(r.inp&&!r.dlg&&!r.fields&&!r.bar,tag+'點名稱：原地換成輸入框、游標在裡面，沒有對話框、沒有整張卡片的編輯工具');
      ok(b1&&Math.abs(b1.l+8-b0.l)<=1.5,tag+`字的位置不動（輸入框左緣 ${b1&&b1.l.toFixed(1)}＋8 ≈ ${b0.l.toFixed(1)}）`);}
    await p.keyboard.press('ControlOrMeta+a');await p.keyboard.type('改名一'+w);await p.keyboard.press('Enter');await p.waitForTimeout(1300);
    ok((remote().issues||[]).some(i=>i.title==='改名一'+w)&&!(await p.evaluate(()=>editing)),tag+'改名稱＋Enter：存檔');
    await p.click('#cardDetail .card-title');await p.waitForTimeout(400);await p.keyboard.press('ControlOrMeta+a');await p.keyboard.type('改名二'+w);
    await p.click('#cardDetail .meta');await p.waitForTimeout(1300);
    ok((remote().issues||[]).some(i=>i.title==='改名二'+w)&&!(await p.evaluate(()=>editing)),tag+'改名稱＋點外面：存檔');
    await p.click('#cardDetail .card-title');await p.waitForTimeout(400);await p.keyboard.press('ControlOrMeta+a');await p.keyboard.type('改名三'+w);
    await p.keyboard.press('Escape');await p.waitForTimeout(1300);
    ok((remote().issues||[]).some(i=>i.title==='改名三'+w)&&!(await p.evaluate(()=>editing)),tag+'改名稱＋Esc：跟點外面一樣存檔並離開（交接檔第九節）');
    {const c1=st.commits.length;await p.click('#cardDetail .card-title');await p.waitForTimeout(400);await p.keyboard.press('ControlOrMeta+a');await p.keyboard.press('Backspace');
      await p.keyboard.press('Enter');await p.waitForTimeout(400);
      const r=await p.evaluate(()=>({ed:editing,bad:!!document.querySelector('#cardDetail input[data-iname].bad'),focus:document.activeElement&&document.activeElement.matches('[data-iname]')}));
      ok(r.ed&&r.bad&&r.focus,tag+'名稱清空按 Enter：留在原地、標紅（請填名稱）');
      await p.click('#cardDetail .meta');await p.waitForTimeout(900);
      ok(st.commits.length===c1&&await p.evaluate(()=>!editing&&document.querySelector('#cardDetail .card-title').textContent)==='改名三'+w,tag+'名稱清空後點外面：不改、不寫 commit');}
    /* 存檔被取消（prepareSave 回 null：沒權杖、取消登入）：輸入框留著；再按 Esc 不會被當成沒改而默默還原（跟開始改名時的原名比） */
    {const c1=st.commits.length,inp='#cardDetail input[data-iname]';
      await p.evaluate(()=>{window.__ps=prepareSave;prepareSave=async()=>null});
      await p.click('#cardDetail .card-title');await p.waitForTimeout(400);await p.keyboard.press('ControlOrMeta+a');await p.keyboard.type('改名四'+w);
      await p.click('#cardDetail .meta');await p.waitForTimeout(700);
      let r=await p.evaluate(s=>({ed:editing,v:(document.querySelector(s)||{}).value}),inp);
      ok(r.ed&&r.v==='改名四'+w&&st.commits.length===c1,tag+`點外面但存檔被取消：留在原地、輸入框是剛打的名稱（${JSON.stringify(r)}）`);
      await p.focus(inp);await p.keyboard.press('Escape');await p.waitForTimeout(700);
      r=await p.evaluate(s=>({ed:editing,v:(document.querySelector(s)||{}).value}),inp);
      ok(r.ed&&r.v==='改名四'+w&&st.commits.length===c1,tag+`存檔被取消後再按 Esc：沒有默默還原（還在原地、名稱是剛打的）（${JSON.stringify(r)}）`);
      await p.evaluate(()=>{prepareSave=window.__ps});await p.focus(inp);await p.keyboard.press('Enter');await p.waitForTimeout(1300);
      ok((remote().issues||[]).some(i=>i.title==='改名四'+w)&&!(await p.evaluate(()=>editing)),tag+'能存檔之後按 Enter：剛打的名稱存進去');}
    /* 注音選字中按 Esc（isComposing）：交給輸入法，不存檔、不離開 */
    {const c1=st.commits.length,inp='#cardDetail input[data-iname]';
      await p.click('#cardDetail .card-title');await p.waitForTimeout(400);await p.keyboard.press('ControlOrMeta+a');await p.keyboard.type('改名五'+w);
      await p.evaluate(s=>document.querySelector(s).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})),inp);await p.waitForTimeout(700);
      ok(await p.evaluate(()=>editing)&&st.commits.length===c1,tag+'選字中按 Esc：不存檔、不離開');
      await p.keyboard.press('Escape');await p.waitForTimeout(1300);
      ok((remote().issues||[]).some(i=>i.title==='改名五'+w)&&!(await p.evaluate(()=>editing)),tag+'選完字再按 Esc：照常存檔並離開');}
    {const n1=await p.evaluate(()=>state.issues.length),c1=st.commits.length;await open(null);await p.click('#addIssue');await p.waitForTimeout(900);await p.keyboard.press('Escape');await p.waitForTimeout(900);
      const r=await p.evaluate(()=>({n:state.issues.length,ed:editing,g:!$('#pvGantt').hidden,d:$('#pvDetail').hidden}));
      ok(r.n===n1&&!r.ed&&r.g&&r.d&&st.commits.length===c1,tag+'新增後沒命名就 Esc：不留、回甘特圖、不寫 commit');}
    /* 6. 全部／上學期／下學期 */
    {const rows=()=>p.evaluate(()=>[...document.querySelectorAll('#gantt .g-issue .g-name a')].map(a=>a.textContent));
      const pick=async k=>{await p.click(`#gTerm [data-k=${k}]`);await p.waitForTimeout(800);return rows()};
      const up=await pick('up'),dn=await pick('down'),all=await pick('all');
      ok(up.includes('只在上學期的議題')&&!up.includes('只在下學期的議題'),tag+`上學期：${up.length} 個議題，只列碰到上學期的`);
      ok(dn.includes('只在下學期的議題')&&!dn.includes('只在上學期的議題'),tag+`下學期：${dn.length} 個議題，只列碰到下學期的`);
      ok(all.includes('只在上學期的議題')&&all.includes('只在下學期的議題')&&all.length>up.length&&all.length>dn.length,tag+`全部：${all.length} 個議題`);
      ok(await p.evaluate(()=>ganttSeg&&ganttSeg.cur===0&&$('#gTerm [aria-selected=true]').dataset.k==='all'),tag+'分段切換的鏡片跟著選到的那一格');}
    /* 7. 唯讀檢視 */
    await p.click('#peekBtn');await p.waitForTimeout(700);
    {const r=await p.evaluate(()=>({add:(e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0)($('#addIssue')),ro:roView}));
      await open(iid);const go=await p.evaluate(()=>!!document.querySelector('#cardDetail [data-iname-go]'));
      await p.click('#cardDetail .card-title');await p.waitForTimeout(500);
      const r2=await p.evaluate(()=>({ed:editing,inp:!!document.querySelector('#cardDetail input[data-iname]')}));
      ok(r.ro&&!r.add&&!go&&!r2.ed&&!r2.inp,tag+'唯讀檢視：沒有「+ 議題」、名稱點了不能改');}
    await p.click('#peekBtn');await p.waitForTimeout(500);
    ok(!p.errs.length,tag+'沒有 pageerror '+p.errs.slice(0,3).join(' | '));
    await b.close();
  }
  const {b,mk}=await c.setup(DF);
  /* 7b. 沒登入（GitHub 模式）：沒有「+ 議題」、名稱不能點 */
  {const p=await mk(1300,900,'light',false);const iid=await p.evaluate(()=>activeIssues()[0].id);
    await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},iid);await p.waitForTimeout(900);
    const r=await p.evaluate(()=>({add:(e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0)($('#addIssue')),go:!!document.querySelector('#cardDetail [data-iname-go]')}));
    ok(!r.add&&!r.go,'沒登入：沒有「+ 議題」、名稱不能點');await p.context().close();}
  /* 8. 關掉動態 */
  {const ctx=await b.newContext({viewport:{width:1300,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route('http://127.0.0.1:8300/data.json*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(D)}));
    const p=await ctx.newPage();await p.goto('http://127.0.0.1:8300/index.html');await p.waitForTimeout(1500);
    const iid=await p.evaluate(()=>activeIssues()[0].id);await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},iid);await p.waitForTimeout(60);
    const n=await p.evaluate(()=>[...document.querySelectorAll('#cardDetail .sl *')].reduce((s,e)=>s+e.getAnimations().length,0));
    ok(n===0,`關掉動態：時程條沒有動畫（${n}）`);await ctx.close();}
  /* 一般動態：打開詳情時把手有動畫（只動 transform／opacity） */
  {const p=await mk(1300,900,'light',false);const iid=await p.evaluate(()=>activeIssues()[0].id);
    await p.evaluate(id=>{setSection('progress',{instant:true});progShow(id)},iid);await p.waitForFunction(id=>progOpen===id,iid);await p.waitForTimeout(40);
    const pr=await p.evaluate(()=>[...document.querySelectorAll('#cardDetail .sl *')].flatMap(e=>e.getAnimations().map(a=>a.effect.getKeyframes().flatMap(k=>Object.keys(k).filter(x=>!['offset','easing','composite','computedOffset'].includes(x))))).flat());
    ok(pr.length>0&&pr.every(x=>x==='transform'||x==='opacity'),`打開詳情：時程條有進場動畫、只動 transform／opacity（${[...new Set(pr)].join('、')}）`);await p.context().close();}
  await b.close();
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
