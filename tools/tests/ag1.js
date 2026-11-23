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
const sec=d=>p.evaluate(d=>{const x=document.querySelector(`#agDoc [data-md=${d}]`);return x?{text:x.querySelector('[data-ed=text]').textContent}:null},d);
/* 不進任何編輯模式，文件就直接看得到 */
A(await p.evaluate(()=>/行政會議/.test(document.querySelector('#agDoc .md-title').textContent)&&document.querySelector('#agDoc .md-date').textContent.length>5&&!document.querySelector('#agDoc textarea,#agDoc input')),'一打開就看得到文件（標題、日期），沒有輸入框');
A(await p.evaluate(()=>document.querySelector('#agGo').disabled&&document.querySelector('#agCopy').disabled),'還沒有內容：「儲存」「複製文字」停用');
const chipTxt=await p.evaluate(()=>[...document.querySelectorAll('#agLeft [data-md-paste]')].map(x=>x.dataset.mdPaste+':'+x.textContent+x.title).join(' '));
console.log(chipTxt);
A(/marketing:.*本週/.test(chipTxt)&&/events:.*01\/06/.test(chipTxt)&&/works:.*沒有週報/.test(chipTxt),'文件下面一排部門膠囊：本週／舊的日期／無週報');
await p.click('#agLeft .ag-tg');await p.waitForTimeout(500);   /* 手機：左邊工具收成一列，先展開 */
await p.click('#agLeft [data-md-paste=marketing]');await p.waitForTimeout(1500);
A((await sec('marketing')).text.includes('社群排程'),'點「行銷部」膠囊：週報放進文件');
A(await p.evaluate(()=>!window.__xss&&!document.querySelector('#agDoc img')),'週報文字裡的 HTML 不會變成標籤');
await p.click('#agLeft [data-md-paste=events]');await p.waitForTimeout(500);
/* 就地編輯：點文字 → 輸入框 → 點別處收回 */
await p.click('#agDoc [data-md=events] [data-ed=text]');await p.waitForTimeout(500);
A(await p.evaluate(()=>!!document.querySelector('#agDoc [data-md=events] [data-ed=text] textarea')&&!document.querySelector('#agDoc [data-md=marketing] textarea')),'點一段文字：只有那一段變成輸入框，其他維持文件原貌');
await p.fill('#agDoc [data-md=events] textarea','四、活動部\n        1. 改過的內容 <u id=uu>u</u>');
await p.click('#agDoc .md-title');await p.waitForTimeout(500);
A(await p.evaluate(()=>/改過的內容/.test(document.querySelector('#agDoc [data-md=events] [data-ed=text]').textContent)&&!document.querySelector('#agDoc textarea')&&!document.querySelector('#uu')),'點別處：收回成文字（改過、HTML 照字面）');
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
A(await p.evaluate(()=>/第十二次/.test(document.querySelector('#agDoc .md-title').textContent)&&/自動存的記錄/.test(document.querySelector('#agDoc').textContent)),'重新整理後文件還在');
await p.evaluate(()=>{agSelect('events');document.querySelector('#agRight [data-md-drop=events]').click()});await p.waitForTimeout(800);
if(await p.$('#dlgForm input[name=pw]')){await p.fill('#dlgForm input[name=pw]','password-long-1');await p.click('#dlgForm [data-act=ok]')}
await p.waitForTimeout(3500);
A(remote().agendas.length===1&&remote().agendas[0].items.length===1,'移除一個部門：自動存、同一天仍是一份');
await p.screenshot({path:'ag1_done.png'});
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))};
c.q='?d=secretariat';await b.close();process.exit(bad?1:0)})();
