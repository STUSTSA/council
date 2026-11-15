/* lv1：即時回報桌面左右兩欄（選取、單卡編輯直接在右側改名稱／說明／母議題／時間／連結、一次只開一欄、完成這一段、儲存）、手機不分欄。用 data_v5.json，固定 8300 埠
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
/* 登入後按詳情卡的「編輯」 */
await login(p);await p.evaluate(()=>setSection('live',{instant:true}));await p.waitForTimeout(500);
if(!(await p.$('#evDetail .card-edit-btn'))){await p.click(`#events .ev[data-ev="${id}"] summary`);await p.waitForTimeout(700)}
await p.click('#evDetail .card-edit-btn');await p.waitForTimeout(700);
r=await p.evaluate(()=>[editing,cardEdit,!!$('#evDetail .evd.editing'),!!document.querySelector('[data-secedit=live]')]);
ok(r[0]&&r[1]==='e:'+id&&r[2]&&!r[3],'單卡編輯：只有這一筆、右側變成逐欄編輯、沒有「編輯這區」 '+JSON.stringify(r));
await p.screenshot({path:'lv_edit.png'});
const fld=async(k,fn)=>{await p.click(`#evDetail [data-evpen="${k}"]`);await p.waitForTimeout(300);await fn('#evDetail .evf.open ');await p.click('#evDetail .evf.open [data-evfx=ok]');await p.waitForTimeout(300)};
await fld('name',async b=>p.fill(b+'[data-e=name]','改名測試'));
await fld('desc',async b=>p.fill(b+'[data-e=desc]','新的說明'));
ok(await p.evaluate(()=>document.querySelector('#events .ev.sel b').textContent)==='改名測試','改名後清單裡那顆跟著改');
/* 一次只開一欄：開說明時名稱關著 */
await p.click('#evDetail [data-evpen=name]');await p.waitForTimeout(200);await p.click('#evDetail [data-evpen=desc]');await p.waitForTimeout(200);
ok(await p.evaluate(()=>[...document.querySelectorAll('#evDetail .evf.open')].map(x=>x.dataset.evfk).join())==='desc','一次只開一欄');
await p.click('#evDetail .evf.open [data-evfx=cancel]');await p.waitForTimeout(200);
await fld('issue',async b=>{await p.click(b+'.csel-btn');await p.waitForTimeout(200);await p.click(b+'.csel-opt:nth-child(2)')});
await fld('t:+',async b=>{await p.fill(b+'[data-e=label]','開會');await p.fill(b+'[data-e=st]','1400');await p.fill(b+'[data-e=et]','1530')});
await fld('l:+',async b=>{await p.fill(b+'[data-e=name]','公文');await p.fill(b+'[data-e=url]','https://example.com')});
const ev=await p.evaluate(i=>{const e=state.events.find(x=>x.id===i);return {name:e.name,desc:e.desc,issue:e.issueId,times:e.times.map(t=>t.label+' '+t.start+'~'+t.end),links:e.links.map(l=>l.name+' '+l.url)}},id);
console.log('edited',JSON.stringify(ev));
ok(ev.name==='改名測試'&&ev.desc==='新的說明'&&!!ev.issue&&ev.times.some(t=>/^開會 .*T14:00~.*T15:30$/.test(t))&&ev.links.includes('公文 https://example.com'),'名稱、說明、母議題、時間、連結都寫回');
/* 完成這一段（右側展開框） */
const round0=await p.evaluate(i=>state.events.find(x=>x.id===i).round,id);
await p.click('#evDetail [data-evd=round]');await p.waitForTimeout(300);await p.fill('#evDetail [data-rf=next]','下一段');await p.click('#evDetail [data-evd=roundok]');await p.waitForTimeout(600);
r=await p.evaluate(i=>{const e=state.events.find(x=>x.id===i);return [e.round,e.desc,state.events.filter(x=>x.fromEv===e.id).length]},id);
ok(r[0]===round0+1&&r[1]==='下一段'&&r[2]===1,'完成這一段：進入下一段、說明換成下一段、完成紀錄多一筆 '+JSON.stringify(r));
await p.screenshot({path:'lv_edit2.png'});
/* 儲存 */
await p.click('#evDetail [data-edsave]');await p.waitForTimeout(3200);await p.click('#dlg[open] [data-act=cancel]').catch(()=>{});await p.waitForTimeout(300);
console.log('commit',(st.commits[0]||'').split('\n').slice(0,6).join(' | '));
ok(!(await p.evaluate(()=>editing))&&/改名/.test(st.commits[0]||''),'儲存：結束編輯、寫一筆 commit');
ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
const m=await mk(390,844,'dark',true);await m.evaluate(()=>setSection('live',{instant:true}));await m.waitForTimeout(400);
await m.click('#events .ev:nth-child(1) summary');await m.waitForTimeout(700);
ok(!(await m.evaluate(()=>$('#liveMD').classList.contains('split')))&&await m.evaluate(()=>document.querySelector('#events .ev:nth-child(1)').open),'手機不分欄、就地展開');
ok(!m.errs.length,'手機沒有錯誤 '+m.errs.join(' | '));
await b.close();process.exit(bad?1:0)})();
