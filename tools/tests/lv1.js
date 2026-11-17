/* lv1：即時回報桌面左右兩欄（選取、單卡編輯直接在右側改名稱／說明／母議題／時間／連結、一次只開一欄、完成這一段、儲存）、手機不分欄。用 data_v5.json，固定 8300 埠
   2026-11-16（03 T6）：名稱、說明、時間改用原位編輯器（逐行、自製時間選取器），「儲存」在儲存回饋那一列
   2026-11-16（03 T7）：母議題、標籤、連結也在原位編輯器裡直接改（沒有各欄的取消／完成）；即時回報卡沒有「編輯」鈕，點詳情卡的名稱開始
   2026-11-15（03 T4）：入口改成單卡編輯——從設定頁鎖頭登入（common.js 的 login）後按詳情卡自己的「編輯」（.card-edit-btn），存檔按那張的「儲存」；
   原本按頁首「編輯」（#editBtn，11-06 已拿掉）、最後按 #saveBtn。改成用 ok() 判斷、壞了以非 0 結束 */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk,login,st}=await c.setup(__dirname+'/data_v5.json');
const p=await mk(1300,900,'dark',false);await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);
ok(!(await p.evaluate(()=>$('#liveMD').classList.contains('split'))),'還沒點選時不分欄');
await p.click('#events .ev:nth-child(1) summary');await p.waitForTimeout(700);
let r=await p.evaluate(()=>[$('#liveMD').classList.contains('split'),selEv,$('#evDetail .evd-head b').textContent,!!$('#evDetail .evd.editing')]);
ok(r[0]&&r[1]&&r[2]&&!r[3],'點一筆：分欄、右側顯示、沒登入不是編輯中 '+JSON.stringify(r));
await p.screenshot({path:'lv_view.png'});
await p.click('#events .ev:nth-child(3) summary');await p.waitForTimeout(600);
r=await p.evaluate(()=>[$('#evDetail .evd-head b').textContent,document.querySelector('#events .ev:nth-child(3)').open,document.querySelector('#events .ev:nth-child(3)').classList.contains('sel')]);
ok(r[0]&&!r[1]&&r[2],'換選第三筆：右側換內容、清單裡那顆不展開 '+JSON.stringify(r));
const id=await p.evaluate(()=>selEv);
/* 登入後點詳情卡的名稱（03 T7 起沒有「編輯」鈕） */
await login(p);await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);
if(!(await p.$('#evDetail .evd-head [data-kpgo]'))){await p.click(`#events .ev[data-ev="${id}"] summary`);await p.waitForTimeout(700)}
ok(!(await p.$('#evDetail .card-edit-btn')),'即時回報詳情卡沒有「編輯」鈕');
await p.click('#evDetail .evd-head [data-kpgo]');await p.waitForTimeout(700);
r=await p.evaluate(()=>[editing,cardEdit,!!$('#evDetail .evd.editing'),!!document.querySelector('[data-secedit=live]')]);
ok(r[0]&&r[1]==='e:'+id&&r[2]&&!r[3],'單卡編輯：只有這一筆、右側變成逐欄編輯、沒有「編輯這區」 '+JSON.stringify(r));
await p.screenshot({path:'lv_edit.png'});
/* 03：名稱、說明（逐行內容）、時間、母議題、標籤、連結都在原位編輯器 */
await p.fill('#evDetail [data-kptitle]','改名測試');await p.waitForTimeout(200);
while(await p.$('#evDetail .kp-lines [data-kpdel]')){await p.click('#evDetail .kp-lines [data-kpdel]');await p.waitForTimeout(150)}
await p.click('#evDetail [data-kpadd]');await p.waitForTimeout(200);await p.keyboard.type('新的說明');await p.keyboard.press('Enter');await p.keyboard.type('開會');
await p.click('#evDetail .kp-line:nth-child(2) .kp-type .csel-btn');await p.waitForTimeout(200);await p.click('#evDetail .kp-line:nth-child(2) .csel-opt[data-v="time"]');await p.waitForTimeout(300);
await p.fill('#evDetail .tp [data-tpf=sh]','1400');await p.fill('#evDetail .tp [data-tpf=eh]','1530');await p.click('#evDetail .tp [data-tpok]');await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.querySelector('#events .ev.sel b').textContent)==='改名測試','改名後清單裡那顆跟著改');
/* 母議題、超連結直接改：沒有一欄一欄的「取消／完成」 */
ok(await p.evaluate(()=>!document.querySelector('#evDetail [data-evpen],#evDetail [data-evfx]')&&!!document.querySelector('#evDetail [data-kpf=issue] .csel-btn')),'母議題、超連結在原位（沒有各欄的取消／完成）');
await p.click('#evDetail [data-kpf=issue] .csel-btn');await p.waitForTimeout(200);await p.click('#evDetail [data-kpf=issue] .csel-opt:nth-child(2)');await p.waitForTimeout(300);
await p.click('#evDetail [data-kplkadd]');await p.waitForTimeout(300);
await p.keyboard.type('公文');await p.fill('#evDetail .kp-lk:last-of-type [data-e=url]','https://example.com');
const ev=await p.evaluate(i=>{const e=state.events.find(x=>x.id===i);return {name:e.name,desc:e.desc,issue:e.issueId,times:e.times.map(t=>t.label+' '+t.start+'~'+t.end),links:e.links.map(l=>l.name+' '+l.url)}},id);
console.log('edited',JSON.stringify(ev));
ok(ev.name==='改名測試'&&ev.desc==='新的說明\n☐ 開會'&&!!ev.issue&&ev.times.some(t=>/^開會 .*T14:00~.*T15:30$/.test(t))&&ev.links.includes('公文 https://example.com'),'名稱、說明（逐行）、母議題、時間、連結都寫回');
/* 完成這一段（右側展開框） */
const round0=await p.evaluate(i=>state.events.find(x=>x.id===i).round,id);
await p.click('#evDetail [data-evd=round]');await p.waitForTimeout(300);await p.fill('#evDetail [data-rf=next]','下一段');await p.click('#evDetail [data-evd=roundok]');await p.waitForTimeout(600);
r=await p.evaluate(i=>{const e=state.events.find(x=>x.id===i);return [e.round,e.desc,state.events.filter(x=>x.fromEv===e.id).length]},id);
ok(r[0]===round0+1&&r[1]==='下一段'&&r[2]===1,'完成這一段：進入下一段、說明換成下一段、完成紀錄多一筆 '+JSON.stringify(r));
await p.screenshot({path:'lv_edit2.png'});
/* 儲存 */
await p.click('#evDetail [data-kpsave]');await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
console.log('commit',(st.commits[0]||'').split('\n').slice(0,6).join(' | '));
ok(!(await p.evaluate(()=>editing))&&/改名/.test(st.commits[0]||''),'儲存：結束編輯、寫一筆 commit');
ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
const m=await mk(390,844,'dark',true);await m.evaluate(()=>setSection('live',{instant:true}));await m.waitForTimeout(400);
await m.click('#events .ev:nth-child(1) summary');await m.waitForTimeout(700);
ok(!(await m.evaluate(()=>$('#liveMD').classList.contains('split')))&&await m.evaluate(()=>document.querySelector('#events .ev:nth-child(1)').open),'手機不分欄、就地展開');
ok(!m.errs.length,'手機沒有錯誤 '+m.errs.join(' | '));
await b.close();process.exit(bad?1:0)})();
