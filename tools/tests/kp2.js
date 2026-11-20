/* 03 原位編輯器在 github 模式（data.json）：同一個編輯器、存回資料檔。固定 8300 埠（CLAUDE.md 的測試準備：data_test.json 改名 data.json）。
   ui-05（2026-11-17）：卡片換新介面（膠囊 .cp、卡片 .lc；1300 在右邊 #evDetail、900 是全螢幕 #lcFull）。主流程改在 1300 跑（點外面＝存檔、卡片留著才看得到「復原」）；
   沒有種類選單（核取行用工具列「核取」加）、母議題是工具列的自製選單、超連結用工具列加；「完成這一段」新介面沒有入口，第 9 項拿掉；
   第 12 項的結案、刪除鈕改成拖到角落（編輯中不能拖），改成驗「點外面時的檢查」＋拖到右上角完成、拖到左上角刪除；第 6 項的時間選取器換成地點頁、超連結色點拿掉。
   1. 讀舊的 data_test.json（schemaVersion 13、只有 desc）：每行顯示成純文字
   2. 原位編輯（加一行、轉成核取並勾選、點外面）→ 寫回 GitHub（模擬）：schemaVersion 14、有 blocks、desc 仍在（核取攤成「☑ 」「☐ 」）
   3. 其他卡片的 desc 跟原本相同；重新讀回來（normalize）blocks 不變
   4. 復原這次修改：存回原本的 desc
   5. 母議題、超連結在原位改（03 T7），點外面跟其他修改一起存回資料檔
   7. 03 審查 P0-1：檢視時切換勾選、行首尾空白、時間行切換勾選後點外面，種類、行 ID、timeId、時間標記不變（存回的資料檔與重新讀回來）
   9. 03 審查 P1-3：右側詳情的「完成這一段」預填按下當下的內容；超過行數、字數上限不寫入
   10. 03 審查 P2-2：完成紀錄的說明欄超過行數、字數上限時給明確訊息、不寫入
   11. 03 審查 P2-3（ui-08 改寫）：設定列沒有小字，週報日期、看板名稱不會注入元素
   12. 03 審查 P2-6：原位編輯中按結案、刪除先檢查名稱與超連結的按鈕名稱；填好後結案，核取行、時間行不變、desc 同步
   8. 03 審查 P1-2：原位編輯打字中關分頁會跳 beforeunload，只點進編輯沒改不擋
   6. 跳脫攻擊（03 T8；寬 900 的膠囊、1300 的右側詳情，檢視與編輯兩種狀態）：資料檔裡的卡片 ID、標題、每行文字、時間標記名稱、地點與 ID、
      行 ID、負責人名稱與 ID、標籤名與 ID、母議題名與 ID、超連結網址（含 javascript:）與文字都放惡意字串（github 模式的 ID 不會被過濾，原樣進屬性）；
      確認 window.__x 沒被設定、文字原樣顯示、沒有多出元素、超連結不是 javascript:、可以進入編輯並收合；
      超連結與議題註記的顏色、註記位置放「;position:fixed;background:url(外部)」（03 審查 P1-1）：不會變成 position:fixed、不會對外請求 */
const c=require('./common');const fs=require('fs');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'通過 ':'失敗 ')+m);if(v)passes++;else fails++};
(async()=>{
  const orig=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8'));
  const {b,mk,login,remote}=await c.setup();
  const p=await mk(1300,900,'light',false);
  await login(p);
  const live=orig.events.filter(e=>!e.doneAt),src=live.find(e=>e.desc&&!e.desc.includes('\n'))||live[0];
  ok((+orig.schemaVersion||0)<14&&!orig.events.some(e=>e.blocks),'測試資料是舊格式（schemaVersion 14 以前、沒有 blocks）');
  await p.evaluate(i=>{setSection('live',{instant:true});lcShow('live',i)},src.id);await p.waitForTimeout(600);
  const C='#evDetail';
  const v1=await p.evaluate(()=>[...document.querySelectorAll('#evDetail .ln')].map(x=>[x.querySelector('.tx').textContent,!!x.querySelector('input')]));
  ok(v1.map(x=>x[0]).join('\n')===src.desc&&v1.every(x=>!x[1]),`舊卡片每行顯示成純文字（${v1.length} 行）`);
  const bid=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,src.id);
  await p.click(`${C} [data-kpgo="${bid}"]`);await p.waitForTimeout(400);
  await p.click(`${C} [data-lctool="check"]`);await p.waitForTimeout(300);await p.keyboard.type('github 模式加的一行');
  const ln=`${C} .lns .ln:nth-child(2)`;
  await p.click(`${ln} [data-kpck]`);await p.waitForTimeout(200);
  await p.click('#evH');await p.waitForTimeout(2500);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
  const r=remote(),e=r.events.find(x=>x.id===src.id);
  ok(await p.evaluate(()=>!editing&&kpSt&&kpSt.st==='ok'),'點外面：收合、已儲存');
  ok(r.schemaVersion===14&&e&&e.desc===src.desc+'\n☑ github 模式加的一行'&&Array.isArray(e.blocks)&&e.blocks.length===2&&e.blocks[1].check===true,
    `寫回的資料檔：schemaVersion 14、desc 仍在（${JSON.stringify(e&&e.desc)}）、blocks 有勾選`);
  const same=orig.events.filter(x=>x.id!==src.id).every(x=>{const y=r.events.find(z=>z.id===x.id);return y&&(y.desc||'')===(x.desc||'')});
  ok(same,'其他卡片的 desc 跟原本相同');
  const back=await p.evaluate(j=>normalize(JSON.parse(j)).events.find(x=>x.id===JSON.parse(j).events[0].id)&&normalize(JSON.parse(j)),JSON.stringify(r));
  ok(JSON.stringify(back.events.find(x=>x.id===src.id).blocks)===JSON.stringify(e.blocks),'重新讀回來 blocks 不變（行 ID、勾選）');
  await p.click(`${C} [data-kpundo]`);await p.waitForTimeout(2500);
  await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});
  const e2=remote().events.find(x=>x.id===src.id);
  ok(e2&&e2.desc===src.desc,'復原這次修改：資料檔存回原本的 desc');
  /* 5. 母議題、超連結在原位（沒有各欄的取消／完成） */
  const bid2=await p.evaluate(i=>state.events.find(e=>e.id===i).blocks[0].id,src.id);
  await p.click(`${C} [data-kpgo="${bid2}"]`);await p.waitForTimeout(400);
  const S5=C;
  ok(await p.evaluate(s=>!document.querySelector(`${s} [data-evpen],${s} [data-evfx]`)&&!!document.querySelector(`${s} [data-lcpa]`),S5),'母議題、超連結在原位（沒有各欄的取消／完成）');
  await p.click(`${S5} [data-lcpa]`);await p.waitForTimeout(250);await p.click(`${S5} .lc-pop [role=option]:nth-child(2)`);await p.waitForTimeout(300);
  await p.click(`${S5} [data-lctool="link"]`);await p.waitForTimeout(300);await p.keyboard.type('github 連結');await p.fill(`${S5} .kp-lk:last-of-type [data-e=url]`,'https://example.com/gh');
  await p.click('#evH');await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
  const e5=remote().events.find(x=>x.id===src.id),iss=orig.issues[0].id;
  ok(e5&&e5.issueId===iss&&e5.links.some(l=>l.name==='github 連結'&&l.url==='https://example.com/gh'),`點外面：母議題、超連結寫回資料檔（${JSON.stringify(e5&&[e5.issueId,e5.links.map(l=>l.name)])}）`);
  /* 7. 03 審查 P0-1：編輯器裡以 blocks 為準（勾選、行首尾空白、時間行勾選存回後，種類、行 ID、timeId、時間標記都不變） */
  {
    const id=src.id;
    await p.evaluate(async id=>{const ev=state.events.find(e=>e.id===id);ev.times=[{id:'tq',label:'開會',start:'2026-11-20T14:00',end:'',place:'',toIssue:false}];
      ev.blocks=[{id:'a1',text:'買水',check:false,timeId:null},{id:'a2',text:'開會',check:false,timeId:'tq'},{id:'a3',text:'純文字',check:null,timeId:null}];ev.desc=StoreMap.descOf(ev.blocks);
      await persist('x')},id);await p.waitForTimeout(1500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});
    const sv=async()=>{await p.click('#evH');await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300)};
    /* 存回的資料檔與重新讀回來（normalize）的那一張 */
    const got=async()=>{const r=remote(),e=r.events.find(x=>x.id===id),n=await p.evaluate(([j,id])=>normalize(JSON.parse(j)).events.find(x=>x.id===id),[JSON.stringify(r),id]);return {e,n}};
    const want=(x,checks,texts)=>x&&JSON.stringify(x.blocks.map(b=>[b.id,b.text,b.check,b.timeId]))===JSON.stringify([['a1',texts[0],checks[0],null],['a2',texts[1],checks[1],'tq'],['a3',texts[2],null,null]])
      &&x.times.length===1&&x.times[0].id==='tq'&&x.times[0].label===texts[1];
    const show=x=>JSON.stringify(x&&x.blocks.map(b=>[b.id,b.text,b.check,b.timeId]));
    await p.evaluate(i=>{lvOpen=null;lcShow('live',i)},id);await p.waitForTimeout(400);
    /* a. 檢視時點核取框切換勾選 → 點外面 */
    await p.click(`${C} .ln [data-kpck="a1"]`);await p.waitForTimeout(400);
    ok(await p.evaluate(id=>{const e=state.events.find(x=>x.id===id);return editing&&e.desc===StoreMap.descOf(e.blocks)},id),'P0-1 檢視時切換勾選：進入編輯，desc 跟 blocks 同步');
    await sv();let g=await got();
    ok(want(g.e,[true,false],['買水','開會','純文字'])&&want(g.n,[true,false],['買水','開會','純文字'])&&g.e.desc==='☑ 買水\n☐ 開會\n純文字',`P0-1 檢視時切換勾選後點外面：還是核取行（勾了）、行 ID 不變；重新讀回來一樣（${show(g.e)}）`);
    /* b. 行首、行尾有空白 → 點外面 */
    await p.click(`${C} [data-kpgo="a1"]`);await p.waitForTimeout(400);
    await p.keyboard.press('Home');await p.keyboard.type('  ');await p.keyboard.press('End');await p.keyboard.type('  ');
    await p.evaluate(()=>kpFocus('a3'));await p.keyboard.type(' ');
    await sv();g=await got();
    ok(want(g.e,[true,false],['買水','開會','純文字'])&&want(g.n,[true,false],['買水','開會','純文字']),`P0-1 行首行尾加空白後點外面：去掉空白、種類與行 ID 不變；重新讀回來一樣（${show(g.e)}）`);
    /* c. 時間行切換勾選 → 點外面 */
    await p.click(`${C} .ln [data-kpck="a2"]`);await p.waitForTimeout(400);
    await sv();g=await got();
    ok(want(g.e,[true,true],['買水','開會','純文字'])&&want(g.n,[true,true],['買水','開會','純文字']),`P0-1 時間行切換勾選後點外面：timeId 與時間標記還在、勾了；重新讀回來一樣（${show(g.e)}）`);
    /* d. 編輯中切換時間行的勾選、時間行行尾空白 → 點外面 */
    await p.click(`${C} [data-kpgo="a2"]`);await p.waitForTimeout(400);
    await p.keyboard.press('End');await p.keyboard.type(' ');await p.click(`${C} .lc-ed [data-kpck="a2"]`);await p.waitForTimeout(200);
    await sv();g=await got();
    ok(want(g.e,[true,false],['買水','開會','純文字'])&&want(g.n,[true,false],['買水','開會','純文字']),`P0-1 編輯中切換時間行勾選＋行尾空白：時間行不變、時間標記名稱沒有多空白（${show(g.e)}）`);
  }
  /* 9.（ui-05 拿掉）「完成這一段」新介面沒有入口 */
  /* 10. 03 審查 P2-2：完成紀錄的說明欄（逐欄編輯 fldApply）超過行數、字數上限：明確的訊息、停在原欄、不寫入 */
  {
    const rid=await p.evaluate(()=>{const r=state.events.find(e=>e.doneAt);setSection('done',{instant:true});lcShow('done',r.id);return r.id});await p.waitForTimeout(600);
    const D='#doneDetail .lc',before=await p.evaluate(i=>state.events.find(e=>e.id===i).desc,rid);
    await p.click(`${D} [data-edit]`);await p.waitForTimeout(500);
    await p.click(`${D} [data-ifpen="desc"]`);await p.waitForTimeout(300);
    for(const [txt,msg] of [[Array.from({length:51},(_,i)=>'第 '+i+' 行').join('\n'),'最多 50 行'],['y'.repeat(1001),'每行最多 1000 字']]){
      await p.fill(`${D} [data-e="desc"]`,txt);await p.click(`${D} [data-iffx="ok"]`);await p.waitForTimeout(300);
      ok(await p.evaluate(([i,b,msg,D])=>state.events.find(e=>e.id===i).desc===b&&$('#toast').textContent===msg&&!!document.querySelector(`${D} .evf.open [data-e="desc"].bad`),[rid,before,msg,D]),`P2-2 完成紀錄的說明欄 ${msg.includes('行')&&msg.includes('50')?'51 行':'1001 字'}：提示「${msg}」、停在原欄、不寫入`);
    }
    await p.click(`${D} [data-iffx="cancel"]`);await p.waitForTimeout(200);await p.click(`${D} [data-edcancel]`);await p.waitForTimeout(400);
    await p.evaluate(()=>{lcShow('done',null);setSection('live',{instant:true});render()});await p.waitForTimeout(300);
  }
  /* 11. 03 審查 P2-3（ui-08 改寫）：設定列下不再放小字（DESIGN-next 第十二節、DievE 11/16）；週報日期、看板名稱含 HTML 字元時，設定清單沒有被注入的元素、列上也不出現這些值 */
  {
    const XS='<img src=x onerror=window.__x=1>';
    const r=await p.evaluate(XS=>{const keep={t:state.title,w:state.weeks.slice()};state.title=XS;state.weeks.push({id:'wx',date:'9<i>x</i>',text:'x'});
      const ok=()=>{const el=document.querySelector('#setOv'),rows=[...el.querySelectorAll('.set-row')];return {x:window.__x,rows:rows.length,extra:el.querySelectorAll('.set-row img,.set-row i').length,
        small:el.querySelectorAll('.set-row small').length,leak:rows.some(r=>r.textContent.includes('9<i>x</i>')||r.textContent.includes(XS))}};
      return openSettings().then(()=>new Promise(r=>setTimeout(r,600))).then(()=>{const v=ok();state.title=keep.t;state.weeks=keep.w;closeSettings(true);render();return v})},XS);
    ok(r.x===undefined&&r.rows>0&&r.extra===0&&r.small===0&&!r.leak,`P2-3 設定列：沒有小字、週報日期與看板名稱不出現在列上、沒有多出元素（${JSON.stringify(r)}）`);
  }
  /* 12. 03 審查 P2-6（ui-05 改寫）：點外面存檔前的檢查（名稱、超連結的按鈕名稱）與 blocks 同步；完成＝拖到右上角、刪除＝拖到左上角（編輯中不能拖） */
  {
    const id=src.id,S=C,st=()=>p.evaluate(()=>(document.querySelector('#evDetail .lc-save .kp-st')||{}).textContent);
    const out=async()=>{await p.click('#evH');await p.waitForTimeout(500)};
    const drag=async(id,x,y)=>{const r=await p.$eval(`#events .cp[data-cp="${id}"]`,e=>{const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}});
      await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x+10,r.y,{steps:3});await p.mouse.move(x,y,{steps:12});await p.mouse.up();await p.waitForTimeout(600)};
    const name0=await p.evaluate(i=>state.events.find(e=>e.id===i).name,id);
    await p.evaluate(i=>{lvOpen=null;lcShow('live',i)},id);await p.waitForTimeout(400);
    await p.click(`${S} [data-kpgo="a1"]`);await p.waitForTimeout(400);
    await p.fill(`${S} [data-kptitle]`,'  ');await out();
    ok(await p.evaluate(()=>editing)&&await st()==='請填名稱',`P2-6 名稱空白點外面：不存、停在編輯、提示「${await st()}」`);
    await p.fill(`${S} [data-kptitle]`,name0);
    await p.click(`${S} [data-lctool="link"]`);await p.waitForTimeout(300);await p.fill(`${S} .kp-lk:last-of-type [data-e=url]`,'https://example.com/noname');await out();
    ok(await p.evaluate(()=>editing)&&await st()==='請填按鈕名稱','P2-6 超連結沒填名稱點外面：不存、提示「請填按鈕名稱」');
    await p.fill(`${S} .kp-lk:last-of-type [data-e=name]`,'有名稱了');
    await p.evaluate(()=>kpFocus('a1'));await p.keyboard.type('  ');
    await out();await p.waitForTimeout(2000);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
    await out();
    ok(await p.evaluate(()=>!editing&&!lvOpen),'P2-6 填好後點外面：存好、再點一次外面收回');
    await drag(id,1290,10);await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
    const e=remote().events.find(x=>x.id===id);
    ok(e&&e.doneAt&&e.blocks.find(b=>b.id==='a1').check===true&&e.blocks.find(b=>b.id==='a1').text===e.blocks.find(b=>b.id==='a1').text.trim()&&e.blocks.some(b=>b.timeId==='tq')&&e.desc===e.blocks.map(b=>(typeof b.check==='boolean'?(b.check?'☑ ':'☐ '):'')+b.text).join('\n')&&e.links.some(l=>l.name==='有名稱了'),
      `P2-6 拖到右上角完成：存回資料檔、核取行與時間行不變、行尾空白去掉、desc 跟 blocks 同步（${JSON.stringify(e&&e.blocks.map(b=>[b.id,b.text,b.check,b.timeId]))}）`);
    /* 另一張拖到左上角刪除（有時間標記的照舊再確認一次）→ 存回資料檔裡沒有它 */
    {const id2=await p.evaluate(i=>{const e=state.events.find(x=>!x.doneAt&&x.id!==i);return e&&e.id},id);
      if(id2){await drag(id2,20,20);await p.click('#dlg[open] [data-act=delete]');await p.waitForTimeout(400);
        if(await p.$('#dlg[open]'))await p.click('#dlg[open] [data-act=delete]');
        await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
        ok(await p.evaluate(i=>!editing&&!state.events.some(e=>e.id===i),id2)&&!remote().events.some(x=>x.id===id2),'拖到左上角＋確認：刪掉並存回（資料檔裡沒有它）');}
      else ok(false,'找不到第二張進行中的卡片');}
    /* 移回即時回報（完成紀錄卡片的「編輯」裡，位置不變），供後面的步驟使用 */
    await p.evaluate(i=>{setSection('done',{instant:true});lcShow('done',i)},id);await p.waitForTimeout(500);
    await p.click(`#doneDetail [data-edit]`);await p.waitForTimeout(400);await p.click(`#doneDetail [data-evundo]`);await p.waitForTimeout(2500);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});
    await p.evaluate(()=>{lcShow('done',null);setSection('live',{instant:true});render()});await p.waitForTimeout(400);
    ok(await p.evaluate(i=>!editing&&!state.events.find(e=>e.id===i).doneAt,id),'P2-6 移回即時回報');
  }
  /* 8. 03 審查 P1-2：原位編輯打字中關分頁（或重新整理）會跳 beforeunload；只點進編輯、沒改不擋（用合成的 beforeunload 事件看有沒有 preventDefault） */
  {
    const bu=()=>p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented});
    await p.evaluate(i=>{lvOpen=null;lcShow('live',i)},src.id);await p.waitForTimeout(400);
    await p.click(`${C} [data-kpgo="a1"]`);await p.waitForTimeout(400);
    ok(await p.evaluate(()=>editing&&!!kp)&&!(await bu()),'P1-2 只點進編輯、沒改：不擋關分頁');
    await p.keyboard.press('End');await p.keyboard.type('未存的草稿');
    const st=await p.evaluate(()=>({editing,dirty}));
    ok(await bu(),`P1-2 打字中：擋關分頁（dirty=${st.dirty}，原位編輯不設 dirty，改成比對開始前的內容）`);
    let got=null;p.on('dialog',async d=>{got=d.type();await d.dismiss().catch(()=>{})});
    const errs=p.errs.slice();
    await p.close({runBeforeUnload:true});await new Promise(r=>setTimeout(r,1500));
    ok(got==='beforeunload',`P1-2 打字中關分頁（page.close runBeforeUnload）：跳出 beforeunload（${got}）`);
    ok(!errs.length,`沒有頁面錯誤（${errs.join(' | ')}）`);
  }
  await b.close();

  /* 6. 跳脫攻擊 */
  const X1='<img src=x onerror=window.__x=1>',X2='"><svg onload=window.__x=1>',X3="' onmouseover='window.__x=1",XJ='javascript:window.__x=1';
  const EID='e'+X2,TID='t'+X1,FID='f'+X3,IID='i'+X2,MID='m'+X1,LID='l'+X3;
  /* 03 審查 P1-1：顏色用分號接新的宣告、位置不是數字（esc 擋不住），想把元素蓋滿整個畫面並載入外部圖片 */
  const XC='red;position:fixed;inset:0;z-index:99;background:url(https://attacker.invalid/x.png)',XA='1;position:fixed;inset:0;background:url(https://attacker.invalid/a.png)';
  const blocks=[{id:'L0',text:X1,check:null,timeId:null},{id:X2,text:X2,check:false,timeId:null},{id:'L2',text:X3,check:true,timeId:null},{id:'L3',text:'時間行',check:false,timeId:TID}];
  const bad=JSON.parse(JSON.stringify(orig));bad.schemaVersion=14;
  bad.issues.unshift({id:IID,title:X2+X1,tags:[],cur:0,start:'2026-11-01',end:'2026-12-31',doneAt:null,markers:[{id:'mk1',text:'註記',color:XC,at:XA,date:'2026-11-15',pos:'up',stage:''}],links:[{id:'ik1',name:'議題連結',url:'https://example.com/i',color:XC}],note:''});
  bad.labels=[{id:LID,kind:'人',name:X1+X3}];
  bad.events.unshift({id:EID,name:X1+X2+X3,desc:[X1,'☐ '+X2,'☑ '+X3,'☐ 時間行'].join('\n'),blocks,createdAt:'2026-11-01',issueId:IID,staff:[MID],labels:[LID],
    links:[{id:'k1',name:X1,url:XJ,color:'#3b82f6'},{id:X2,name:X3,url:'https://example.com/'+X2,color:'#ef4444'},{id:'k3',name:'壞顏色',url:'https://example.com/c',color:XC}],
    times:[{id:TID,label:'時間行',start:'2026-11-20T14:00',end:'',place:X2,toIssue:false},{id:FID,label:X2+X1,start:'2026-11-21',end:'',place:X3,toIssue:false}],round:1,touched:[]});
  const tmp=require('os').tmpdir()+'/kp2-xss.json';fs.writeFileSync(tmp,JSON.stringify(bad));
  const q=v=>v.replace(/["\\]/g,m=>'\\'+m);   /* 屬性選擇器裡的引號、反斜線 */
  const xs=pg=>pg.evaluate(()=>{const all=s=>[...document.querySelectorAll(s.split(',').map(x=>`#livePanel ${x},#lcFull ${x}`).join(','))];return {x:window.__x,extra:all('img,svg:not(.ico):not(.csel-chev):not([aria-hidden="true"]),script,iframe').map(e=>e.outerHTML.slice(0,60)),
    on:all('*').filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length,js:all('a[href]').filter(a=>/^\s*javascript:/i.test(a.getAttribute('href'))).length}});
  const hover=async(g,sc)=>{for(const el of (await g.$$(`${sc} *`)).slice(0,100)){const bb=await el.boundingBox().catch(()=>null);if(bb&&bb.width&&bb.height&&bb.y>0&&bb.y<880)await g.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2)}};
  c.serveRemote=true;
  for(const [w,tag] of [[900,'全螢幕卡片 900'],[1300,'右邊卡片 1300']]){
    const {b:b2,mk:mk2,login:login2,remote:rem2}=await c.setup(tmp);
    const g=await mk2(w,900,'light',false);g.reqs=[];
    await g.context().route('https://attacker.invalid/**',r=>r.abort());g.on('request',r=>{if(/attacker\.invalid/.test(r.url()))g.reqs.push(r.url())});   /* 惡意樣式想載入的外部圖片：擋下並記錄 */
    await login2(g);
    rem2().members.push({id:MID,name:X1+X2,role:'member'});   /* 負責人：登入建立第一個身分後才加進資料檔，重新讀一次 */
    await g.goto(g.url());await g.waitForTimeout(1800);
    await g.evaluate(()=>setSection('live',{instant:true}));await g.waitForTimeout(400);
    const card=`#events .cp[data-cp="${q(EID)}"]`,sc=w>=1000?'#evDetail':'#lcFull';
    await g.click(card);await g.waitForTimeout(1000);
    await hover(g,sc);
    let x=await xs(g);
    ok(x.x===undefined&&!x.extra.length&&!x.on&&!x.js,`${tag} 檢視：沒有執行、沒有多出元素或 on 屬性、沒有 javascript: 連結（${JSON.stringify(x)}）`);
    const v=await g.evaluate(([sc,card,w])=>{const q=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.textContent);
      return {title:document.querySelector(`${sc} .lc-title`).textContent,pill:document.querySelector(`${card} b`).textContent,lines:q('.ln:not(.free) .tx'),
        par:(document.querySelector(`${sc} .lc-pa span,${sc} .lc-par`)||{}).textContent,staff:q('.lc-tag'),lbl:q('.lbl-chip'),free:q('.ln.free .tx'),place:q('.ln .pl'),
        links:[...document.querySelectorAll(`${sc} .lnks a`)].map(a=>[a.textContent,a.getAttribute('href')]),ev:(document.querySelector(card)||{dataset:{}}).dataset.ev}},[sc,card,w]);
    ok(v.ev===EID&&v.title===X1+X2+X3&&v.pill===X1+X2+X3,`${tag} 檢視：卡片 ID（屬性）與標題（膠囊、卡片）原樣`);
    ok(JSON.stringify(v.lines)===JSON.stringify([X1,X2,X3,'時間行']),`${tag} 檢視：每行文字原樣（${JSON.stringify(v.lines)}）`);
    ok((v.par||'').includes(X2+X1)&&v.staff.includes(X1+X2)&&v.lbl.some(s=>s.includes(X1+X3)),`${tag} 檢視：母議題名、負責人名稱、標籤名原樣（${JSON.stringify([v.par,v.staff,v.lbl])}）`);
    ok(v.free.includes(X2+X1)&&v.place.some(s=>s.includes(X3)),`${tag} 檢視：沒連到行的時間標記名稱、地點原樣`);
    ok(v.links.some(([n,h])=>n===X1&&!/^javascript:/i.test(h))&&v.links.some(([n,h])=>n===X3&&h.startsWith('https://example.com/')),`${tag} 檢視：超連結文字原樣、javascript: 不會變成可執行的連結（${JSON.stringify(v.links)}）`);
    /* 03 審查 P1-1：超連結、議題註記的顏色與位置（資料檔讀進來時 normalize 清一次；畫面組 HTML 時 cssColor／cssNum 再擋一次：直接改 state 不經 normalize 再畫） */
    const css=sel=>g.evaluate(sel=>[...document.querySelectorAll(sel)].map(a=>{const c=getComputedStyle(a);return {pos:c.position,bg:c.backgroundImage,st:a.getAttribute('style')}}),sel);
    const cssOk=l=>l.length>0&&l.every(x=>x.pos!=='fixed'&&!/url\(/.test(x.bg)&&!/attacker|position/.test(x.st));
    {const a=await css(`${sc} .lnks a`),m=await css('#gantt .g-mk');
      ok(cssOk(a)&&a.length===3&&cssOk(m)&&!g.reqs.length,`${tag} 檢視：超連結、甘特圖註記的惡意顏色與位置沒有變成 position:fixed、沒有背景圖、沒有對外請求（${JSON.stringify([a,m])}；請求 ${g.reqs.length}）`);}
    await g.evaluate(([id,iid,XC,XA])=>{const e=state.events.find(x=>x.id===id),i=state.issues.find(x=>x.id===iid);e.links.forEach(l=>{l.color=XC});i.links.forEach(l=>{l.color=XC});i.markers.forEach(m=>{m.color=XC;m.at=XA});progOpen=iid;render()},[EID,IID,XC,XA]);await g.waitForTimeout(300);
    {const a=await css(`${sc} .lnks a`),m=await css('#gantt .g-mk,#cardDetail .marker,#cardDetail .log-dot,#cardDetail .links a');
      ok(cssOk(a)&&a.length===3&&cssOk(m)&&m.length>=3&&!g.reqs.length,`${tag} 檢視（不經 normalize 直接畫）：超連結、註記、處理紀錄的惡意顏色與位置擋在組 HTML 時（${JSON.stringify(m.map(x=>x.st))}；請求 ${g.reqs.length}）`);}
    await g.evaluate(()=>{progOpen=null;render()});
    await g.click(`${sc} .ln:nth-child(1) [data-kpgo]`);await g.waitForTimeout(700);
    await hover(g,sc);
    x=await xs(g);
    await g.click(`${sc} [data-lctool="staff"]`);await g.waitForTimeout(400);
    const staffE=await g.evaluate(sc=>[...document.querySelectorAll(`${sc} .pg-ppl .chip span`)].map(e=>e.textContent),sc);
    await g.click(`${sc} [data-lctool="staff"]`);await g.waitForTimeout(400);
    const e=await g.evaluate(sc=>{const v=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.value),t=s=>[...document.querySelectorAll(`${sc} ${s}`)].map(e=>e.textContent);
      return {editing,title:(document.querySelector(`${sc} [data-kptitle]`)||{}).value,lines:[...document.querySelectorAll(`${sc} .ln:not(.free) [data-kptx],${sc} .ln:not(.free) [data-kpgrp]`)].flatMap(e=>e.dataset.kpgrp!==undefined?e.value.split('\n'):[e.value]),free:v('[data-kplb]'),issue:t('.lc-pa span'),
        lbl:t('.lbl-chip'),lkn:v('.kp-lk [data-e=name]'),lku:v('.kp-lk [data-e=url]'),tm:t('.ln:not(.free) [data-kptm]').length}},sc);e.staff=staffE;
    ok(x.x===undefined&&!x.extra.length&&!x.on,`${tag} 編輯：沒有執行、沒有多出元素或 on 屬性（${JSON.stringify(x)}）`);
    ok(e.editing&&e.title===X1+X2+X3&&JSON.stringify(e.lines)===JSON.stringify([X1,X2,X3,'時間行'])&&e.tm===1&&e.free.includes(X2+X1),`${tag} 編輯：標題、每行文字、時間行、沒連到行的時間標記原樣（${JSON.stringify(e)}）`);
    ok(e.issue[0]===X2+X1&&e.staff.includes(X1+X2)&&e.lbl.some(s=>s.includes(X1+X3)),`${tag} 編輯：母議題（工具列）、負責人（人頁）、標籤原樣（${JSON.stringify([e.issue,e.staff,e.lbl])}）`);
    ok(e.lkn.includes(X1)&&e.lkn.includes(X3)&&e.lku.includes(XJ),`${tag} 編輯：超連結名稱、網址原樣`);
    {const k=await css(`${sc} [style]`);ok(k.every(x=>!/attacker|position|url\(/.test(x.st||''))&&!g.reqs.length,`${tag} 編輯：卡片裡沒有帶惡意樣式的元素、沒有對外請求（ui-05：超連結不再有色點）`);}
    await g.click(`${sc} .ln:not(.free) [data-kptm]`);await g.waitForTimeout(400);x=await xs(g);
    ok(x.x===undefined&&!x.extra.length&&await g.evaluate(sc=>document.querySelectorAll(`${sc} .te`).length,sc)===2,`${tag} 編輯：時間頁（時間行與沒連到行的時間標記）沒有執行`);
    await g.click(`${sc} [data-lctool="place"]`);await g.waitForTimeout(400);x=await xs(g);
    ok(x.x===undefined&&!x.extra.length&&await g.evaluate(([sc,t])=>(document.querySelector(`${sc} [data-tepl="${CSS.escape(t)}"]`)||{}).value,[sc,TID])===X2,`${tag} 編輯：地點頁的地點原樣、沒有執行`);
    await g.click(`${sc} [data-lctool="place"]`);await g.waitForTimeout(300);
    await g.click(w>=1000?'#evH':`${sc} [data-lcback]`);await g.waitForTimeout(2500);await g.click('#dlg[open] [data-act=cancel]').catch(()=>{});await g.waitForTimeout(300);
    x=await xs(g);const saved=rem2().events.find(z=>z.id===EID);
    ok(x.x===undefined&&!x.extra.length&&await g.evaluate(()=>!editing)&&saved&&saved.name===X1+X2+X3&&saved.blocks.map(z=>z.text).join('|')===[X1,X2,X3,'時間行'].join('|'),`${tag}：點外面存回資料檔、文字照原樣、沒有執行`);
    const ge=g.errs.filter(m=>!/Failed to load resource/.test(m));ok(!ge.length,`${tag}：沒有頁面錯誤（${ge.join(' | ')}；模擬的 GitHub API 對其他檔案回 404 不算）`);
    await b2.close();
  }
  console.log(fails?`有 ${fails} 項失敗（通過 ${passes} 項）`:`全部通過（${passes} 項）`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
