/* 秘書處行政會議資料（第三版）的會議紀錄部分：上次決議追蹤、報告卡片點開、結論／臨時項目／整體決議就地編輯、複製文字資料（state.agendas）→ 重整後還在、同日重新定版會取代。
   也檢查週報文字裡的 HTML 不會變成標籤。GitHub API 用 common.js 模擬，固定 8300 埠。壞了以非 0 結束 */
const c=require('./common');c.q='?d=secretariat';(async()=>{const {b,mk,login,st,remote}=await c.setup();const SEC=()=>remote();   /* 2026-11-21：common.js 把 data-部門.json 的寫入也記在 remote */
let bad=0;const A=(x,m)=>{if(!x){bad++;console.log('FAIL',m)}else console.log('ok',m)};
const API=c.API,d0=new Date(),T=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
const wk=(id,date,text)=>({id,date,text});
st.puts[API+'data-marketing.json']={schemaVersion:11,id:'board-marketing',members:[],issues:[],events:[{id:'e1',name:'社群排程<b id=zz>粗</b>',desc:'每週三貼文',report:true,times:[],links:[],staff:[],labels:[],touched:[T],createdAt:T}],weeks:[wk('w1',T,'二、公關部\n    （一）週例行政工作回報\n        1. 社群排程 <img src=x onerror="window.__xss=1">')]};
st.puts[API+'data-events.json']={schemaVersion:11,id:'board-events',members:[],issues:[],events:[],weeks:[wk('w2','2020-01-06','四、活動部\n        1. 很舊的週報')]};
st.puts[API+'data-works.json']={schemaVersion:11,id:'board-works',members:[],issues:[],events:[],weeks:[]};
st.puts[API+'data-secretariat.json']={schemaVersion:14,id:'board-secretariat',members:[],issues:[],events:[],weeks:[],savedAt:'2026-11-14 10:00',agendas:[{id:'agold',date:'2026-11-13',by:'小芸',at:'2026-11-13 10:00',items:[{dept:'marketing',deptName:'公關部',weekDate:'2026-11-13',text:'x',decision:'貼文延到下週 <b id=xx>粗</b>'},{dept:'events',deptName:'活動部',weekDate:'2026-11-13',text:'y',decision:''}]}]};
const p=await mk(412,860,'dark',true);
await p.context().route(/127\.0\.0\.1:8300\/data-.*\.json/,r=>r.fulfill({status:404,body:''}));
await p.evaluate(([o,r])=>{localStorage.setItem('workboard:ghtoken','T');localStorage.setItem('workboard:board-secretariat',JSON.stringify({id:'board-secretariat',issues:[],events:[],members:[],weeks:[],savedAt:'2000-01-01 00:00',sync:{owner:o,repo:r,branch:'main',path:'data-secretariat.json'}}))},API.split('/repos/')[1].split('/').slice(0,2).map(decodeURIComponent));await p.reload();await p.waitForTimeout(3500);await login(p);await p.waitForTimeout(800);
await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);await p.click('#mnPeek');await p.waitForTimeout(900);
const T2=T;
A(await p.evaluate(()=>/上次決議追蹤/.test(document.querySelector('#agDoc').textContent)&&/貼文延到下週/.test(document.querySelector('#agDoc').textContent)&&!/活動部/.test(document.querySelector('#agDoc .md-sec').textContent)),'文件最前面列上次決議，沒有決議的部門不列');
A(await p.evaluate(()=>!document.querySelector('#xx')),'決議文字裡的 HTML 不會變成標籤');
await p.click('#agLeft .ag-tg');await p.waitForTimeout(500);
await p.click('#agLeft [data-md-sel=marketing]');await p.waitForTimeout(1200);
A(await p.evaluate(()=>!!document.querySelector('#agDoc [data-md=marketing] [data-agc=e1]')&&!document.querySelector('#zz')),'該部門要報告的卡片列在段落裡（名稱的 HTML 不變標籤）');
await p.click('#agDoc [data-agc=e1] .md-it');await p.waitForTimeout(600);
A(await p.evaluate(()=>{const t=document.querySelector('#agDoc [data-agc=e1]').textContent;return /社群排程/.test(t)&&!/每週三貼文/.test(t)&&!document.querySelector('#agDoc .mt-ev')&&document.querySelector('[data-agk=name]').value.startsWith('社群排程')&&/每週三貼文/.test(document.querySelector('[data-agk=desc]').value)}),'文件上只有大標題；點一項，右邊「卡片編輯」出現那一張的全部欄位');
await p.fill('#agCc','結論：照原案 <i id=yy>斜</i>');await p.waitForTimeout(400);
await p.click('#agNoteBody [data-md-xadd=marketing]');await p.waitForTimeout(700);
await p.fill('#agNoteBody [data-agx=title]','臨時動議 <u id=uu>u</u>');await p.waitForTimeout(300);
await p.fill('#agNoteBody [data-agx=note]','下週討論');await p.waitForTimeout(500);
await p.evaluate(()=>{agItemOf('marketing').decision='本週決議：照原案 <i id=yz>斜</i>';renderAgenda()});await p.waitForTimeout(400);
await p.screenshot({path:'ag2_dec.png'});
A(await p.evaluate(()=>!document.querySelector('#yy')&&!document.querySelector('#uu')&&!document.querySelector('#yz')&&agItemOf('marketing').notes.e1.startsWith('結論：照原案')),'結論、臨時項目、決議：右邊編輯、HTML 照字面');
await p.fill('[data-agk=name]','改名後的事項');await p.fill('[data-agk=staff]','小明、小華');await p.click('[data-agst=stall]');await p.waitForTimeout(900);
A(await p.evaluate(()=>/改名後的事項/.test(document.querySelector('#agDoc [data-agc=e1] .md-it').textContent)&&agItemOf('marketing').cards.e1.name==='改名後的事項'&&agItemOf('marketing').cards.e1.staff==='小明、小華'&&agItemOf('marketing').cards.e1.stk==='stall'&&/沒有進度/.test(document.querySelector('#agDoc [data-agc=e1] .md-ist').textContent)),'卡片編輯：改名稱、專員、狀態，紙上同步（只改文件，不改部門的卡片）');
await p.click('#agGo');await p.waitForTimeout(3500);
let ag=remote().agendas;const nw=ag.find(a=>a.date===T);const it=nw&&nw.items.find(i=>i.dept==='marketing');
A(ag.length===2&&it&&it.notes.e1.startsWith('結論：照原案')&&it.extra.length===1&&it.extra[0].title.startsWith('臨時動議')&&it.extra[0].note==='下週討論'&&it.decision.startsWith('本週決議'),'儲存：結論、臨時項目、決議都在那份議程：'+JSON.stringify(it));
A(nw.prev&&nw.prev.date==='2026-11-13'&&nw.prev.items.length===1,'儲存時存下上次決議快照');
A(ag.find(a=>a.id==='agold').items[0].decision.startsWith('貼文延到下週'),'舊的議程沒被動到');
/* 時間、地點：點一下就地改，存進議程，複製文字的第一行也有 */
await p.click('#agDoc [data-ed=time]');await p.fill('#agDoc [data-ed=time] input','12:10');await p.keyboard.press('Enter');await p.waitForTimeout(300);
await p.click('#agDoc [data-ed=place]');await p.fill('#agDoc [data-ed=place] input','L 棟 1 樓');await p.keyboard.press('Enter');await p.waitForTimeout(3500);
A(remote().agendas.find(a=>a.date===T).time==='12:10'&&remote().agendas.find(a=>a.date===T).place==='L 棟 1 樓','時間、地點：就地編輯後自動存');
A(await p.evaluate(()=>/12:10　L 棟 1 樓/.test(agDocText(AG.doc).split('\n')[0])),'複製文字第一行含時間、地點');
const tx=await p.evaluate(()=>agDocText(AG.doc));
A(/上次決議追蹤/.test(tx)&&/會議紀錄/.test(tx)&&/社群排程.*：結論：照原案/.test(tx)&&/下週討論/.test(tx)&&/決議：本週決議/.test(tx),'複製文字含議程、結論、臨時項目與決議');
await p.click('#agNoteBody [data-md-xdel=marketing]');await p.waitForTimeout(3500);
A(remote().agendas.find(a=>a.date===T).items.find(i=>i.dept==='marketing').extra.length===0,'刪除臨時項目：自動存');
await p.evaluate(()=>{AG.doc=agDraftOf(today());renderAgenda()});await p.waitForTimeout(400);await p.evaluate(()=>0);await p.locator('#agOv').screenshot({path:'doc_mob.png'});await p.setViewportSize({width:1100,height:900});await p.waitForTimeout(500);await p.locator('#agOv').screenshot({path:'doc_desk.png'});await p.setViewportSize({width:412,height:860});await p.waitForTimeout(300);
await p.click('#agPast [data-md-pick="2026-11-13"]');await p.waitForTimeout(600);
A(await p.evaluate(()=>/2026\/11\/13/.test(document.querySelector('#agDoc .md-date').textContent)),'上面一排可以切到以前的會議');
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))}
await b.close();process.exit(bad?1:0)})();
