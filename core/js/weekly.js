/* 核心｜左右分頁、即時回報↔議題連結、每週概述產生器 */
/* ---------- 每週概述：設定裡的一頁（2026-11-06 使用者：改成跟其他設定同一種面板，返回先回「報告」合併頁、再返回才是設定清單） ----------
   內容（#weekWrap：標題列、生成週報、週報清單）平常藏在畫面外；從設定「報告 → 每週概述」（或登入前清單上的「每週概述」）打開時，
   weekPane 把它搬進設定的右側面板（桌面）／子頁（手機），關掉再搬回去。按鈕事件都掛在 document 上，搬動不影響。
   開著的時候對話框（生成週報、新增、編輯週報）一律跳出來（nav.js 的 setPaneHost 在 weekPaneEnd 有值時不給面板），不會畫到清單下面。
   返回：標題列左上的「上一頁」鍵（views.js 的 homeUp）、系統返回、Esc 都走 nav.js 的 paneDismiss，一次退一層 */
let weekPaneEnd=null;
function weekPane(){
  return new Promise(res=>{
    const host=setPaneHost(),w=$("#weekWrap");if(!host||!w){res();return}
    host.append(w);w.hidden=false;renderWeeks();
    w.classList.remove("enter");void w.offsetWidth;w.classList.add("enter");clearTimeout(w._t);w._t=setTimeout(()=>w.classList.remove("enter"),1400);   /* 標題列與週報逐一滑入 */
    weekPaneEnd=()=>{weekPaneEnd=null;w.hidden=true;w.classList.remove("enter");document.body.append(w);res()};
  });
}
{const l=$("#weekSecLink");if(l)l.hidden=!!CFG.meeting||CFG.deptId==="secretariat"}   /* 秘書處自己就不顯示「秘書處調閱」 */

/* ---------- 即時回報：母議題連結、分段、狀態、時間標記 ---------- */
const parentOf=ev=>ev&&ev.issueId?state.issues.find(i=>i.id===ev.issueId):null;
/* 顯示用名稱：分段完成的紀錄標「第 N 段」，分過段的卡片結案時標「第 N 段・結案」 */
const evName=ev=>ev.fromEv?`${ev.name}（第 ${ev.round} 段）`:ev.doneAt&&ev.round>1?`${ev.name}（第 ${ev.round} 段・結案）`:ev.name;
/* 母議題同步：完成時寫一筆處理紀錄；勾了「寫進母議題」的時間標記也各寫一筆 */
function syncLink(ev){
  const keepTm=new Set((ev.times||[]).filter(t=>t.toIssue&&t.start).map(t=>t.id));
  state.issues.forEach(i=>{i.markers=i.markers.filter(m=>m.evId!==ev.id||(i.id===ev.issueId&&(m.tmId?keepTm.has(m.tmId):!!ev.doneAt)))});
  const it=parentOf(ev);if(!it)return;
  const put=(find,make,text,date)=>{let m=it.markers.find(find);if(!m){m={id:uid("m"),evId:ev.id,at:schedPct(it,date)??50,stage:it.tags[it.cur]||"",pos:"up",...make};it.markers.push(m)}m.text=text;m.date=date};
  if(ev.doneAt)put(x=>x.evId===ev.id&&!x.tmId,{},evName(ev),ev.doneAt);
  (ev.times||[]).filter(t=>keepTm.has(t.id)).forEach(t=>put(x=>x.evId===ev.id&&x.tmId===t.id,{tmId:t.id,pos:"down"},`${ev.name.replace(/[：:\s]+$/,"")}：${t.label}`,t.start.slice(0,10)));
}
/* 刪除即時回報時：母議題裡由它寫入的處理紀錄保留下來，只拿掉連結 */
function unlinkEv(ev){state.issues.forEach(i=>i.markers.forEach(m=>{if(m.evId===ev.id){delete m.evId;delete m.tmId}}))}
/* 母議題處理紀錄的「還沒完成」（ui-11）：由時間行寫進來的那一筆（m.evId＋m.tmId），在來源卡片裡那一行（blocks 裡 timeId＝m.tmId）還沒勾時半透明。
   每次畫的時候從卡片即時算，不另存；找不到來源（卡片或那一行被刪、沒有核取框的舊時間標記、整張完成寫的那一筆）＝照舊不透明 */
function mkPending(m){
  if(!m.evId||!m.tmId)return false;
  const ev=state.events.find(e=>e.id===m.evId),b=ev&&(ev.blocks||[]).find(x=>x.timeId===m.tmId);
  return !!b&&b.check===false;
}
/* 記一次更新（狀態顏色用）：touched 只留最近幾天的日期，touchedAt 是最後更新的時刻 */
function evTouch(ev){
  const t=nowStr().replace(" ","T"),d=t.slice(0,10);
  ev.touchedAt=t;ev.touched=[...(ev.touched||[]).filter(x=>x!==d),d].slice(-8);
}
/* 狀態：以每週回報期限（CFG.week.cutoff，預設週二）為界
   ok 綠＝期限前有更新、這週沒完成一段；go 黃＝這週完成過一段，或期限過後才補更新；stall 紅＝期限前後都沒更新 */
const EV_ST={ok:"按時更新",go:"持續進行",stall:"沒有進度"};
function evStatus(ev){
  const ref=today(),back=(pd(ref).getDay()-(+CFG.week.cutoff||0)+7)%7;
  const due=addDays(ref,-back),prev=addDays(due,-7);
  const ds=(ev.touched&&ev.touched.length?ev.touched:[ev.createdAt||""]).map(d=>d.slice(0,10));
  if(ev.roundAt&&ev.roundAt.slice(0,10)>prev)return "go";
  if((ev.createdAt||"")>due)return "ok";          /* 期限過後才新增：還沒錯過任何期限 */
  if(ds.some(d=>d>prev&&d<=due))return "ok";
  if(ds.some(d=>d>due))return "go";
  return "stall";
}
/* 時間標記的顯示文字：日期、時刻、期間長度 */
function evTimeText(t){
  const yr=today().slice(0,4);
  const part=s=>{const d=s.slice(0,10),h=s.slice(11,16);return (d.slice(0,4)===yr?fmt(d).slice(5):fmt(d))+(h?" "+h:"")};
  if(!t.end)return {when:part(t.start),span:""};
  const sameDay=t.start.slice(0,10)===t.end.slice(0,10);
  const when=sameDay&&t.end.length>10?`${part(t.start)}–${t.end.slice(11,16)}`:`${part(t.start)} – ${part(t.end)}`;
  let span="";
  if(t.start.length>10&&t.end.length>10){
    const m=Math.round((new Date(t.end)-new Date(t.start))/6e4),d=Math.floor(m/1440),h=Math.floor(m%1440/60),mm=m%60;
    span=[d?d+" 天":"",h?h+" 小時":"",mm?mm+" 分":""].filter(Boolean).join(" ")||"0 分";
  }else span=Math.round((pd(t.end.slice(0,10))-pd(t.start.slice(0,10)))/864e5)+1+" 天";
  return {when,span};
}
const evTimesSorted=ev=>[...(ev.times||[])].sort((a,b)=>a.start.localeCompare(b.start));
/* ---------- weekly report generator ---------- */
/* 週報基準（下一份週報從哪天算起）存在部門設定；firestore 模式只有部門管理員以上能寫部門設定（規則），編輯者產出週報時不改基準，
   免得畫面上看起來更新了、存檔時卻沒寫進去（02D 審查） */
function snapshotBase(date){
  if(fsMode()&&!fsAdmin())return;
  const issues={};state.issues.forEach(i=>issues[i.id]={stage:i.tags[i.cur]||"",note:i.note||""});
  state.reportBase={date,issues};
}
/* 每週概述的紅點（設定鍵右上角、設定頁「每週概述」那一列）：每週五起亮，直到這一週（週一到週日）有一份週報產出為止；
   沒產出就一直亮到產出（下週一到週四仍以上週為準），下個週五再開始新的一輪 */
const WEEK_DUE_DAY=5;
function weekDue(t=today()){
  const d=pd(t),back=(d.getDay()-WEEK_DUE_DAY+7)%7,fri=addDays(t,-back),mon=addDays(fri,-4);
  return !state.weeks.some(w=>w.date&&w.date>=mon);
}
function weekDotSync(){
  const due=weekDue()&&!readOnly();
  document.querySelectorAll("#setBtn,#setOv [data-set=week],#setOv [data-set=report],[data-hub=week]").forEach(el=>el.classList.toggle("due",due));
  const g=$("#setBtn");if(g)g.setAttribute("aria-label",due?"設定（本週週報還沒產出）":"設定");   /* 紅點對讀屏器的說法（03 F1 拿掉 title 後改用名稱，不是提示框） */
}
/* 網頁一直開著跨過週五也要冒出來：每 10 分鐘、回到這個分頁時再檢查一次 */
setInterval(weekDotSync,6e5);document.addEventListener("visibilitychange",()=>{if(!document.hidden)weekDotSync()});
/* 「本週」＝上一份週報之後到今天（生成週報、動畫模式共用） */
function weekRange(){
  const end=today();
  const lastWeek=[...state.weeks].map(w=>w.date).filter(d=>d<end).sort().pop();
  const start=state.reportBase?.date&&state.reportBase.date<end?state.reportBase.date:(lastWeek||addDays(end,-7));
  return {start,end};
}
/* 生成週報（2026-11-05 改；2026-11-21 改成議程式版面）：只列兩區、只寫標題，不寫說明與議題進度
   （一）報告事項：還沒完成、標了「報告」（ev.report）的即時回報標題（照畫面順序）；一筆都沒標就寫一行說明
   （二）完成事項：完成紀錄裡這一整週（今天往前 7 天）完成、或完成後在這七天內編輯過（touchedAt）的項目標題（議題結案、即時回報結案、完成一段都算；議題沒有編輯時間，只看結案日），由新到舊 */
function buildWeekly(){
  const end=today(),start=addDays(end,-7);   /* 一整週：start 之後到今天（含），共 7 天 */
  const inP=d=>!!d&&d>start&&d<=end;
  const dept=CFG.dept.name;
  const live=liveOrder(),rep=live.filter(reportOn);
  /* 完成事項：每張卡只列一次、只寫標題（分段完成的紀錄 fromEv 與最後結案的那張算同一張，不帶「第 N 段」「結案」） */
  const dm=new Map(),add=(k,d,t)=>{const o=dm.get(k);if(!o)dm.set(k,{d,t});else if(d>o.d)o.d=d};
  state.issues.filter(i=>inP(i.doneAt)).forEach(i=>add("i:"+i.id,i.doneAt,i.title));
  state.events.filter(e=>e.doneAt&&(inP(e.doneAt)||inP((e.touchedAt||"").slice(0,10))&&e.touchedAt.slice(0,10)>e.doneAt)).forEach(e=>add("e:"+(e.fromEv||e.id),inP(e.doneAt)?e.doneAt:e.touchedAt.slice(0,10),e.name));
  const done=[...dm.values()].sort((a,b)=>b.d.localeCompare(a.d));
  /* 議程式版面（秘書處行政會議議程的寫法，使用者 2026-11-21 給的標準）：部門標題一行（CFG.dept.agenda，例「三、學權部」；沒設就用部門名稱），
     下面縮排：（一）週例行政工作回報＝有「報告」標記的卡片標題、（二）完成事項＝完成紀錄往前七天（標題後面不加說明，項目直接分行）；編號清單、只列標題，沒有符號與段數 */
  const list=(items,none)=>items.length?items.map((x,i)=>`        ${i+1}. ${x}`):[`        ${none}`];
  const L=[CFG.dept.agenda||dept,"    （一）週例行政工作回報","    說 明：本週行政工作相關執行狀況如下：",...list(rep.map(e=>e.name),"本週沒有標記報告的項目"),"    （二）完成事項",...list(done.map(x=>x.t),"本週沒有完成項目")];
  return {start,end,text:L.join("\n")};
}

