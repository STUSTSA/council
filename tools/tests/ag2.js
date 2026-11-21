/* 秘書處「行政會議資料」＋會議紀錄編輯（2026-11-21）：行政會議資料：上次決議追蹤、匯出快照；會議紀錄編輯：點開完整卡片、結論／臨時項目／整體決議自動存進秘書處資料（state.agendas）→ 重整後還在、同日重新定版會取代。
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
await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);
await p.click('#agEdit');await p.waitForSelector('#agOv .ag-paper');await p.waitForTimeout(1200);
const trk=()=>p.evaluate(()=>[...document.querySelectorAll('#agOv .ag-trk')].map(x=>x.textContent).join('|'));
let t0=await trk();
A(/公關部貼文延到下週/.test(t0)&&!/活動部/.test(t0),'文件最前面列上次決議，沒有決議的部門不列');
A(await p.evaluate(()=>!document.querySelector('#xx')),'決議文字裡的 HTML 不會變成標籤');
await p.click('#agOv [data-ag=pasteall]');await p.waitForTimeout(300);
await p.click('#agGo');await p.waitForTimeout(600);await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
let ag=SEC().agendas;const nw=ag.find(a=>a.date===T);
A(ag.length===2&&nw&&nw.prev&&nw.prev.date==='2026-11-13'&&nw.prev.items.length===1,'匯出時存下上次決議快照：'+JSON.stringify(nw&&nw.prev));
await p.click('#agDone [data-agcap="'+nw.id+'"] summary');await p.waitForTimeout(700);
await p.click('#agDone [data-mn=open][data-id="'+nw.id+'"]');await p.waitForSelector('#mnOv .ag-paper');await p.waitForTimeout(1500);
const k=nw.items.findIndex(i=>i.dept==='marketing');
A(await p.evaluate(()=>!!document.querySelector('#mnOv [data-mtev=e1]')&&/社群排程/.test(document.querySelector('#mnOv [data-mtev=e1] summary').textContent)&&!document.querySelector('#zz')),'會議紀錄：部門的報告事項一張一行，名稱裡的 HTML 不會變成標籤');
await p.click('#mnOv [data-mtev=e1] summary');await p.waitForTimeout(500);
A(await p.evaluate(()=>/每週三貼文/.test(document.querySelector('#mnOv [data-mtev=e1] .ev-body').textContent)),'點開是完整卡片（說明在裡面）');
await p.fill('#mnOv [data-mnn=e1]','結論：照原案 <i id=yy>斜</i>');
await p.click('#mnOv [data-mnk="'+k+'"] [data-mn=xadd]');await p.waitForTimeout(300);
await p.fill('#mnOv [data-mnk="'+k+'"] [data-mnxt]','臨時動議 <u id=uu>u</u>');await p.fill('#mnOv [data-mnk="'+k+'"] [data-mnxn]','下週討論');
await p.fill('#mnOv [data-mnk="'+k+'"] [data-mnd]','本週決議：照原案 <i id=yz>斜</i>');
await p.screenshot({path:'ag2_dec.png'});
await p.waitForTimeout(3500);
ag=SEC().agendas;let it=ag.find(a=>a.date===T).items[k];
A(it.notes&&it.notes.e1.startsWith('結論：照原案')&&it.extra.length===1&&it.extra[0].title.startsWith('臨時動議')&&it.extra[0].note==='下週討論'&&it.decision.startsWith('本週決議'),'結論、臨時項目、整體決議自動存進那份議程：'+JSON.stringify(it));
A(ag.find(a=>a.id==='agold').items[0].decision.startsWith('貼文延到下週'),'舊的議程沒被動到');
A(await p.evaluate(()=>!document.querySelector('#yy')&&!document.querySelector('#uu')&&!document.querySelector('#yz')&&!document.querySelector('#xx')&&/已儲存/.test(document.querySelector('#mnSt').textContent)),'畫面沒有被文字塞進標籤、出現「已儲存」');
const mt=await p.evaluate(()=>mnText(MN.a));
A(/會議紀錄/.test(mt)&&/社群排程.*：結論：照原案/.test(mt)&&/下週討論/.test(mt)&&/決議：本週決議/.test(mt),'複製文字含結論、臨時項目與決議');
await p.click('#mnOv [data-mnk="'+k+'"] [data-mn=xdel]');await p.waitForTimeout(300);await p.keyboard.press('Escape');await p.waitForTimeout(1500);
A(await p.evaluate(()=>!document.querySelector('#mnOv')),'Esc 關閉');
A(SEC().agendas.find(a=>a.date===T).items[k].extra.length===0,'刪除臨時項目、關閉時一併存好');
/* 再匯出同一天：已寫的紀錄保留 */
await p.click('#agEdit');await p.waitForSelector('#agOv .ag-paper');await p.waitForTimeout(800);
await p.click('#agGo');await p.waitForTimeout(600);await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
A(SEC().agendas.find(a=>a.date===T).items[k].notes.e1.startsWith('結論'),'重新匯出同一天：會議紀錄保留');
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))}
await b.close();process.exit(bad?1:0)})();
