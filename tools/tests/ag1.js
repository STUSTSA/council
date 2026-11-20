/* 秘書處「行政會議議程」（2026-11-21）：各部門最新週報併成一份議程（本週預設併入、舊的預設不併入、可切換）→ 定版存進秘書處資料（state.agendas）→ 重整後還在、同日重新定版會取代。
   也檢查週報文字裡的 HTML 不會變成標籤。GitHub API 用 common.js 模擬，固定 8300 埠。壞了以非 0 結束 */
const c=require('./common');c.q='?d=secretariat';(async()=>{const {b,mk,login,st}=await c.setup();
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
const chips=()=>p.evaluate(()=>[...document.querySelectorAll('#agDepts [data-agd]')].map(x=>x.dataset.agd+':'+x.getAttribute('aria-checked')+(x.disabled?':off':'')).join(' '));
let s=await chips();console.log(s);
A(/marketing:true/.test(s),'本週的公關部預設併入');A(/events:false(?!:off)/.test(s),'舊週報的活動部預設不併入（可勾）');A(/works:false:off/.test(s),'沒有週報的部門停用');
A(await p.evaluate(()=>/行政會議議程/.test(document.querySelector('#agBody .ag-text').textContent)&&/社群排程/.test(document.querySelector('#agBody .ag-text').textContent)&&!/很舊/.test(document.querySelector('#agBody .ag-text').textContent)),'議程只含已勾部門的週報');
A(await p.evaluate(()=>!window.__xss&&!document.querySelector('#agBody img')),'週報文字裡的 HTML 不會變成標籤');
await p.click('#agDepts [data-agd=events]');await p.waitForTimeout(500);
A(await p.evaluate(()=>/很舊/.test(document.querySelector('#agBody .ag-text').textContent)),'點部門可以加入');
await p.screenshot({path:'ag1_mobile.png'});
await p.click('#agFinal');await p.waitForTimeout(700);
await p.screenshot({path:'ag1_dialog.png'});
await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
const sec=st.puts[API+'data-secretariat.json'];
A(sec&&sec.agendas&&sec.agendas.length===1&&sec.agendas[0].date===T&&sec.agendas[0].items.length===2,'定版寫進秘書處資料：'+JSON.stringify(sec&&sec.agendas&&sec.agendas.map(a=>[a.date,a.items.map(i=>i.dept)])));
A(await p.evaluate(()=>document.getElementById('agFinal').textContent==='重新定版'&&document.querySelectorAll('#agDone [data-agdoc]').length===1),'畫面出現已定版的議程、按鈕變「重新定版」');
A(!st.puts[API+'data-marketing.json'].agendas&&st.commits.every(m=>!/marketing/.test(m)),'沒有改動各部門的資料');
await p.reload();await p.waitForTimeout(3500);await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);
A(await p.evaluate(()=>document.querySelectorAll('#agDone [data-agdoc]').length===1),'重新整理後定版的議程還在');
/* 同一天再定版：取代、不增加 */
await p.click('#agDepts [data-agd=events]');await p.waitForTimeout(300);
await p.click('#agFinal');await p.waitForTimeout(600);await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
A(st.puts[API+'data-secretariat.json'].agendas.length===1&&st.puts[API+'data-secretariat.json'].agendas[0].items.length>=1,'同一天再定版是取代，不是新增');
await p.screenshot({path:'ag1_done.png'});
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))};
c.q='?d=secretariat';await b.close();process.exit(bad?1:0)})();
