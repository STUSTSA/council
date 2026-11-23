/* 秘書處「行政會議資料」（2026-11-21 第三版）：卡片本身就是文件、點一下就地編輯資料（state.agendas）→ 重整後還在、同日重新定版會取代。
   也檢查週報文字裡的 HTML 不會變成標籤。GitHub API 用 common.js 模擬，固定 8300 埠。壞了以非 0 結束 */
const c=require('./common');c.q='?d=secretariat';(async()=>{const {b,mk,login,st,remote}=await c.setup();const SEC=()=>remote();   /* 2026-11-21：common.js 把 data-部門.json 的寫入也記在 remote */
let bad=0;const A=(x,m)=>{if(!x){bad++;console.log('FAIL',m)}else console.log('ok',m)};
const API=c.API,d0=new Date(),T=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
const wk=(id,date,text)=>({id,date,text});
st.puts[API+'data-marketing.json']={schemaVersion:11,id:'board-marketing',members:[],issues:[],events:[{id:'e1',name:'社群排程<b id=zz>粗</b>',desc:'每週三貼文',report:true,times:[],links:[],staff:[],labels:[],touched:[T],createdAt:T}],weeks:[wk('w1',T,'二、公關部\n    （一）週例行政工作回報\n        1. 社群排程 <img src=x onerror="window.__xss=1">')]};
st.puts[API+'data-events.json']={schemaVersion:11,id:'board-events',members:[],issues:[],events:[],weeks:[wk('w2','2020-01-06','四、活動部\n        1. 很舊的週報')]};
st.puts[API+'data-works.json']={schemaVersion:11,id:'board-works',members:[],issues:[],events:[],weeks:[]};
const p=await mk(412,860,'dark',true);
await p.context().route(/127\.0\.0\.1:8300\/data-.*\.json/,r=>r.fulfill({status:404,body:''}));
await p.evaluate(([o,r])=>{localStorage.setItem('workboard:ghtoken','T');localStorage.setItem('workboard:board-secretariat',JSON.stringify({id:'board-secretariat',issues:[],events:[],members:[],weeks:[],savedAt:'2000-01-01 00:00',sync:{owner:o,repo:r,branch:'main',path:'data-secretariat.json'}}))},API.split('/repos/')[1].split('/').slice(0,2).map(decodeURIComponent));await p.reload();await p.waitForTimeout(3500);await login(p);await p.waitForTimeout(800);
await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);await p.click('#agPeek');await p.waitForTimeout(900);
/* 不進任何編輯模式，文件就直接看得到 */
A(await p.evaluate(()=>/行政會議/.test(document.querySelector('#agDoc .md-title').textContent)&&document.querySelector('#agDoc .md-date').textContent.length>5&&!document.querySelector('#agDoc textarea,#agDoc input')),'一打開就看得到文件（標題、日期），沒有輸入框');
A(await p.evaluate(()=>!document.querySelector('#agGo').disabled&&!document.querySelector('#agCopy').disabled),'預設就有各部門的報告：「儲存」「複製文字」可以按');
const chipTxt=await p.evaluate(()=>[...document.querySelectorAll('#agLeft [data-md-sel]')].map(x=>x.dataset.mdSel+(x.classList.contains('is-alert')?':紅':':正常')).join(' '));
console.log(chipTxt);
A(/marketing:正常/.test(chipTxt)&&/events:紅/.test(chipTxt)&&/works:紅/.test(chipTxt),'左邊部門膠囊：有報告卡片的正常、沒交的整顆亮紅');
A(await p.evaluate(()=>document.querySelector('#agDoc [data-md=works]').classList.contains('is-alert')&&!document.querySelector('#agDoc .mt-ev')&&!!document.querySelector('#agDoc [data-md=marketing] [data-agc=e1]')),'預設所有部門都在文件裡：沒交的整塊紅、報告卡片是排好版的文字（沒有嵌入的深色卡片）');
await p.click('#agLeft .ag-tg');await p.waitForTimeout(500);   /* 手機：左邊工具收成一列，先展開 */
await p.click('#agLeft [data-md-sel=marketing]');await p.waitForTimeout(1200);
A(await p.evaluate(()=>document.querySelector('#agDoc [data-md=marketing]').textContent.includes('社群排程')),'行銷部要報告的卡片名稱印在文件裡');
A(await p.evaluate(()=>!window.__xss&&!document.querySelector('#agDoc img')),'週報文字裡的 HTML 不會變成標籤');
await p.click('#agLeft [data-md-sel=events]');await p.waitForTimeout(800);
/* 就地編輯：點文字 → 輸入框 → 點別處收回 */
await p.fill('#agTx','四、活動部\n        1. 改過的內容 <u id=uu>u</u>');await p.waitForTimeout(600);
A(await p.evaluate(()=>/改過的內容/.test(agItemOf('events').text)&&!document.querySelector('#uu')&&!/改過的內容/.test(document.querySelector('#agDoc [data-md=events]').textContent)),'右邊「週報文字」：改了存進議程，文件上只放大標題、HTML 照字面');
if(!await p.$('#agDoc .md-title input')){await p.click('#agDoc .md-title');await p.waitForTimeout(400)}
await p.fill('#agDoc .md-title input','第十二次行政會議');await p.keyboard.press('Enter');await p.waitForTimeout(400);
A(await p.evaluate(()=>/第十二次/.test(document.querySelector('#agDoc .md-title').textContent)),'名稱：點一下改、Enter 收回');
await p.screenshot({path:'ag1_mobile.png'});
await p.click('#agGo');await p.waitForTimeout(3500);
const sc=remote();
A(sc&&sc.agendas&&sc.agendas.length===1&&sc.agendas[0].date===T&&sc.agendas[0].title==='第十二次行政會議'&&sc.agendas[0].items.length===2,'儲存寫進秘書處資料：'+JSON.stringify(sc&&sc.agendas&&sc.agendas.map(a=>[a.date,a.title,a.items.map(i=>i.dept)])));
A(sc.agendas[0].items.find(i=>i.dept==='events').text.includes('改過的內容'),'改過的文字有存進去');
A(!st.puts[API+'data-marketing.json'].agendas&&st.commits.every(m=>!/marketing/.test(m)),'沒有改動各部門的資料');
/* 存過的：之後每改一處自動存 */
await p.evaluate(()=>agSelect('events'));await p.click('#agRec');await p.fill('#agRec','自動存的記錄');await p.waitForTimeout(3500);
A(remote().agendas[0].items.find(i=>i.dept==='events').rec==='自動存的記錄','存過之後：改一處就自動存（不用再按儲存）');
await p.reload();await p.waitForTimeout(3500);await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);await p.click('#agPeek');await p.waitForTimeout(900);
A(await p.evaluate(()=>/第十二次/.test(document.querySelector('#agDoc .md-title').textContent)&&agItemOf('events').rec==='自動存的記錄'),'重新整理後文件還在');
/* 長按部門膠囊拖到另一顆：換報告順序 */
if(!await p.$eval('#agLeft',e=>e.classList.contains('is-open')))await p.click('#agLeft .ag-tg');await p.waitForTimeout(600);
const bx=async d=>(await p.$('#agLeft [data-md-sel='+d+']')).boundingBox();
const bm=await bx('marketing'),bw=await bx('events');
await p.mouse.move(bm.x+bm.width/2,bm.y+bm.height/2);await p.mouse.down();await p.waitForTimeout(500);
await p.mouse.move(bw.x+bw.width/2,bw.y+bw.height/2,{steps:8});await p.waitForTimeout(200);await p.mouse.up();await p.waitForTimeout(800);
A(await p.evaluate(()=>{const o=AG.doc.items.map(i=>i.dept);return o.indexOf('events')<o.indexOf('marketing')&&[...document.querySelectorAll('#agDoc .md-sec')].map(x=>x.dataset.md).indexOf('events')<[...document.querySelectorAll('#agDoc .md-sec')].map(x=>x.dataset.md).indexOf('marketing')}),'長按拖曳膠囊：議程裡的報告順序換了、紙上跟著換');
await p.waitForTimeout(3000);
A(remote().agendas.length===1,'換順序後仍是同一天一份');
await p.screenshot({path:'ag1_done.png'});
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))};
c.q='?d=secretariat';await b.close();process.exit(bad?1:0)})();
