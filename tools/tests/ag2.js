/* 秘書處「行政會議議程」（2026-11-21）：各部門最新週報併成一份議程（本週預設併入、舊的預設不併入、可切換）→ 定版存進秘書處資料（state.agendas）→ 重整後還在、同日重新定版會取代。
   也檢查週報文字裡的 HTML 不會變成標籤。GitHub API 用 common.js 模擬，固定 8300 埠。壞了以非 0 結束 */
const c=require('./common');c.q='?d=secretariat';(async()=>{const {b,mk,login,st}=await c.setup();
let bad=0;const A=(x,m)=>{if(!x){bad++;console.log('FAIL',m)}else console.log('ok',m)};
const API=c.API,d0=new Date(),T=`${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
const wk=(id,date,text)=>({id,date,text});
st.puts[API+'data-marketing.json']={schemaVersion:11,id:'board-marketing',members:[],issues:[],events:[],weeks:[wk('w1',T,'二、公關部\n    （一）週例行政工作回報\n        1. 社群排程 <img src=x onerror="window.__xss=1">')]};
st.puts[API+'data-events.json']={schemaVersion:11,id:'board-events',members:[],issues:[],events:[],weeks:[wk('w2','2020-01-06','四、活動部\n        1. 很舊的週報')]};
st.puts[API+'data-works.json']={schemaVersion:11,id:'board-works',members:[],issues:[],events:[],weeks:[]};
st.puts[API+'data-secretariat.json']={schemaVersion:14,id:'board-secretariat',members:[],issues:[],events:[],weeks:[],savedAt:'2026-11-14 10:00',agendas:[{id:'agold',date:'2026-11-13',by:'小芸',at:'2026-11-13 10:00',items:[{dept:'marketing',deptName:'公關部',weekDate:'2026-11-13',text:'x',decision:'貼文延到下週 <b id=xx>粗</b>'},{dept:'events',deptName:'活動部',weekDate:'2026-11-13',text:'y',decision:''}]}]};
const p=await mk(412,860,'dark',true);
await p.context().route(/127\.0\.0\.1:8300\/data-.*\.json/,r=>r.fulfill({status:404,body:''}));
await p.evaluate(([o,r])=>{localStorage.setItem('workboard:ghtoken','T');localStorage.setItem('workboard:board-secretariat',JSON.stringify({id:'board-secretariat',issues:[],events:[],members:[],weeks:[],savedAt:'2000-01-01 00:00',sync:{owner:o,repo:r,branch:'main',path:'data-secretariat.json'}}))},API.split('/repos/')[1].split('/').slice(0,2).map(decodeURIComponent));await p.reload();await p.waitForTimeout(3500);await login(p);await p.waitForTimeout(800);
await p.click('#tabbar [data-tab=ext]');await p.waitForTimeout(1500);
const chips=()=>p.evaluate(()=>[...document.querySelectorAll('#agDepts [data-agd]')].map(x=>x.dataset.agd+':'+x.getAttribute('aria-checked')+(x.disabled?':off':'')).join(' '));
let s=await chips();console.log(s);
A(/marketing:true/.test(s),'本週的公關部預設併入');A(/events:false(?!:off)/.test(s),'舊週報的活動部預設不併入（可勾）');A(/works:false:off/.test(s),'沒有週報的部門停用');
A(await p.evaluate(()=>/行政會議議程/.test(document.querySelector('#agBody .ag-text').textContent)&&/社群排程/.test(document.querySelector('#agBody .ag-text').textContent)&&!/很舊/.test(document.querySelector('#agBody .ag-text').textContent)),'議程只含已勾部門的週報');
A(await p.evaluate(()=>!window.__xss&&!document.querySelector('#agBody img')),'週報文字裡的 HTML 不會變成標籤');
const prevTxt=()=>p.evaluate(()=>document.querySelector('#agBody .ag-text').textContent);
let t0=await prevTxt();
A(/上次決議追蹤（2026\/11\/13）/.test(t0)&&/公關部：貼文延到下週/.test(t0)&&!/活動部：/.test(t0),'議程最前面列上次決議，沒有決議的部門不列');
A(await p.evaluate(()=>!document.querySelector('#xx')),'決議文字裡的 HTML 不會變成標籤');
await p.click('#agFinal');await p.waitForTimeout(600);await p.click('#dlgForm [data-act=ok]');await p.waitForTimeout(3500);
let ag=st.puts[API+'data-secretariat.json'].agendas;const nw=ag.find(a=>a.date===T);
A(ag.length===2&&nw&&nw.prev&&nw.prev.date==='2026-11-13'&&nw.prev.items.length===1,'定版時存下上次決議快照：'+JSON.stringify(nw&&nw.prev));
await p.click('#agDone [data-agcap="'+nw.id+'"] summary');await p.waitForTimeout(700);
await p.fill('#agDone [data-agdec="'+nw.id+'"] [data-agdi="0"]','本週決議：照原案 <i id=yy>斜</i>');
await p.screenshot({path:'ag2_dec.png'});
await p.click('#agDone [data-agdec="'+nw.id+'"] [data-agdsave]');await p.waitForTimeout(3500);
ag=st.puts[API+'data-secretariat.json'].agendas;
A(ag.find(a=>a.date===T).items[0].decision.startsWith('本週決議'),'決議存進該部門那一行');
A(ag.find(a=>a.id==='agold').items[0].decision.startsWith('貼文延到下週'),'舊的議程沒被動到');
A(await p.evaluate(()=>!document.querySelector('#yy')&&!document.querySelector('#xx')),'畫面沒有被決議文字塞進標籤');
{const e=p.errs.filter(x=>!x.startsWith('console:Failed to load resource'));A(!e.length,'沒有程式錯誤 '+JSON.stringify(e))}
await b.close();process.exit(bad?1:0)})();
