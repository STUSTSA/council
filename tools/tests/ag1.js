/* 秘書處「行政會議資料」（2026-11-21 重做）：小卡「編輯」進全螢幕文件，各部門最新週報按「貼上」放進來（本週的可一次全貼）、貼上後可改 → 「匯出」存進秘書處資料（state.agendas）→ 重整後還在、同日重新定版會取代。
   也檢查週報文字裡的 HTML 不會變成標籤。GitHub API 用 common.js 模擬，固定 8300 埠。壞了以非 0 結束 */
const c=require('./common');c.q='?d=secretariat';(async()=>{const {b,mk,login,st,remote}=await c.setup();const SEC=()=>remote();   /* 2026-11-21：common.js 把 data-部門.json 的寫入也記在 remote */
let bad=0;const A=(x,m)=>{if(!x){bad++;console.log('FAIL',m)}else console.log('ok',m)};
const API=c.API,d0=new Date(),T=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
const wk=(id,date,text)=>({id,date,text});
st.puts[API+'data-marketing.json']={schemaVersion:11,id:'board-marketing',members:[],issues:[],events:[],weeks:[wk('w1',T,'二、公關部\n    （一）週例行政工作回報\n        1. 社群排程 <img src=x onerror="window.__xss=1">')]};
st.puts[API+'data-events.json']={schemaVersion:11,id:'board-events',members:[],issues:[],events:[],weeks:[wk('w2','2020-01-06','四、活動部\n        1. 很舊的週報')]};
st.puts[API+'data-works.json']={schemaVersion:11,id:'board-works',members:[],issues:[],events:[],weeks:[]};
const p=await mk(412,860,'dark',true);
await p.context().route(/127\.0\.0\.1:8300\/data-.*\.json/,r=>r.fulfill({status:404,body:''}));
await p.evaluate(([o,r])=>{localStorage.setItem('workboard:ghtoken','T');localStorage.setItem('workboard:board-secretariat',JSON.stringify({id:'board-secretariat',issues:[],events:[],members:[],weeks:[],savedAt:'2000-01-01 00:00',sync:{owner:o,repo:r,branch:'main',path:'data-secretariat.json'}}))},API.split('/repos/')[1].split('/').slice(0,2).map(decodeURIComponent));await p.reload();await p.waitForTimeout(3500);await login(p);await p.waitForTimeout(800);
await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);
await p.click('#agEdit');await p.waitForSelector('#agOv .ag-paper');await p.waitForTimeout(1200);
const sec=d=>p.evaluate(d=>{const x=document.querySelector(`#agOv [data-agsec=${d}]`);return x?{chip:(x.querySelector('.ag-chip')||{}).textContent,paste:!!x.querySelector('[data-ag=paste]'),ta:(x.querySelector('textarea')||{}).value}:null},d);
let m=await sec('marketing'),e=await sec('events'),w=await sec('works');
A(m&&/本週/.test(m.chip)&&m.paste&&m.ta===undefined,'本週有週報的公關部：標「本週有週報」、有「貼上」、還沒貼');
A(e&&/舊的/.test(e.chip)&&e.paste,'舊週報的活動部：標「舊的」、也能貼');A(w&&/沒有/.test(w.chip)&&!w.paste,'沒有週報的部門：沒有「貼上」');
A(await p.evaluate(()=>/行政會議資料/.test(document.querySelector('#agOv .sec-h').textContent)&&document.querySelector('#agGo').disabled),'全螢幕文件開了、什麼都沒貼時「匯出」停用');
await p.click('#agOv [data-ag=pasteall]');await p.waitForTimeout(400);
m=await sec('marketing');e=await sec('events');
A(/社群排程/.test(m.ta)&&e.ta===undefined,'「貼上全部本週的」只貼本週的');
A(await p.evaluate(()=>!window.__xss&&!document.querySelector('#agOv img')),'週報文字裡的 HTML 不會變成標籤');
await p.click('#agOv [data-ag=paste][data-d=events]');await p.waitForTimeout(300);
A(/很舊/.test((await sec('events')).ta),'點「貼上」可以加入舊的週報');
await p.fill('#agOv [data-agt=events]','四、活動部\n        1. 改過的內容');
await p.fill('#agOv [data-agf=title]','第十二次行政會議');
await p.screenshot({path:'ag1_mobile.png'});
await p.click('#agGo');await p.waitForTimeout(700);
await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
const sc=SEC();
A(sc&&sc.agendas&&sc.agendas.length===1&&sc.agendas[0].date===T&&sc.agendas[0].items.length===2&&sc.agendas[0].title==='第十二次行政會議','匯出寫進秘書處資料（含名稱）：'+JSON.stringify(sc&&sc.agendas&&sc.agendas.map(a=>[a.date,a.title,a.items.map(i=>i.dept)])));
A(sc.agendas[0].items.find(i=>i.dept==='events').text.includes('改過的內容'),'貼上後改過的文字有存進去');
A(await p.evaluate(()=>!document.querySelector('#agOv')&&document.querySelectorAll('#agDone [data-agdoc]').length===1&&/已匯出/.test(document.querySelector('#agSt').textContent)),'匯出後全螢幕關掉、小卡出現已匯出的議程');
A(!st.puts[API+'data-marketing.json'].agendas&&st.commits.every(m=>!/marketing/.test(m)),'沒有改動各部門的資料');
await p.reload();await p.waitForTimeout(3500);await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);
A(await p.evaluate(()=>document.querySelectorAll('#agDone [data-agdoc]').length===1),'重新整理後匯出的議程還在');
/* 同一天再開：載入已匯出的內容，再匯出＝取代 */
await p.click('#agEdit');await p.waitForTimeout(800);
if(await p.$('#dlgForm input[name=pw]')){await p.fill('#dlgForm input[name=pw]','password-long-1');await p.click('#dlgForm [data-act=ok]')}   /* 重新整理後要再選一次編輯身分 */
await p.waitForSelector('#agOv .ag-paper');await p.waitForTimeout(800);
A(/改過的內容/.test((await sec('events')).ta||''),'同一天再開：載入已匯出的內容');
await p.click('#agOv [data-ag=drop][data-d=events]');await p.waitForTimeout(300);
await p.click('#agGo');await p.waitForTimeout(600);await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
A(SEC().agendas.length===1&&SEC().agendas[0].items.length===1,'同一天再匯出是取代，不是新增');
await p.screenshot({path:'ag1_done.png'});
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))};
c.q='?d=secretariat';await b.close();process.exit(bad?1:0)})();
