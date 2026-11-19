/* 核心｜通知與行事曆（DESIGN-next 第九節；ui-06 起是部門內的一頁 #notiPage，不再是全畫面疊層）
   - 標題列的通知鈕進到這一頁（shell.js 的 .layout 裡的 .sg-noti；換的動畫跟換分頁同一套，render.js 的 secSwap）。
     標題列、工具列留在原地，工具列的鏡片留在原本的分頁（這一頁不是工具列的分頁）；沒有搜尋列、沒有新增圓鈕。
     返回原分頁：再按通知鈕、Esc、系統返回鍵（打開時推一筆瀏覽紀錄）；按工具列任一分頁＝到那個分頁。
   - 由上到下：今日／明日 → 逾期 → 行事曆。
   - 本部門的事＝還沒結案的即時回報上記錄的時間（ev.times）。不推播，只在看板裡顯示。 */
let notiOpen=false;
/* 部門色：會長室「各部門編輯量」的折線與圖例在用（activity.js） */
const DEPT_COLORS=["#e0342a","#0a5baa","#f0bc23","#2f8f84","#a24fc0","#d84f92","#c26a12","#3d7fe0","#6b6b75"];
const deptColor=id=>DEPT_COLORS[Math.max(0,(window.BOARD_DEPTS||[]).findIndex(d=>d.id===id))%DEPT_COLORS.length];
const WD="日一二三四五六";
/* 一份看板資料 → 事件清單 {key,date,end,time,etime,title,place,ev,dept}（還沒結案的即時回報上的時間） */
function notiItems(s,dept){
  const out=[];
  (s.events||[]).filter(e=>!e.doneAt).forEach(e=>(e.times||[]).forEach(t=>{if(!t.start)return;
    const d=t.start.slice(0,10),en=(t.end||"").slice(0,10);
    out.push({key:`${dept}:t:${t.id}`,date:d,end:en&&en>d?en:"",time:t.start.slice(11,16),etime:(t.end||"").slice(11,16),title:t.label||"（未命名）",place:t.place||"",ev:e.name||"",dept})}));
  return out.sort(byWhen);
}
const byWhen=(a,b)=>(a.date+a.time).localeCompare(b.date+b.time);
const notiMine=()=>notiItems(state,CFG.deptId||"rights");
/* 某一天有這件事：單日＝那天；時段＝頭到尾每一天 */
const covers=(x,d)=>x.end?d>=x.date&&d<=x.end:x.date===d;
const nmd=s=>`${+s.slice(5,7)}/${+s.slice(8,10)}`;
const deptName=id=>{const d=fwDept(id);return d?d.name:id};
/* 標題列通知鈕上的紅色數字＝逾期（DESIGN-next 第六節）：還沒結案的即時回報裡，連到時間的那一行還沒勾、時間已經過了。
   有結束日看結束：結束日在今天以前，或結束是今天、有結束時刻而且時刻到了；沒有結束日看開始：開始日在今天以前，或開始是今天、有時刻而且時刻到了
   （只有日期、沒有時刻的，過了那一天才算）。沒有連到行的舊時間標記沒有勾選狀態，不算 */
function notiLateItems(s=state){
  const t=today(),d=new Date(),hm=`${pad(d.getHours())}:${pad(d.getMinutes())}`,out=[];
  const past=(day,tm)=>day<t||(day===t&&!!tm&&tm<=hm);
  s.events.filter(e=>!e.doneAt).forEach(e=>{const tm=new Map((e.times||[]).map(x=>[x.id,x]));
    (e.blocks||[]).forEach(b=>{const x=b.timeId&&tm.get(b.timeId);if(!x||b.check||!x.start)return;
      const ed=(x.end||"").slice(0,10);
      if(ed?past(ed,x.end.slice(11,16)):past(x.start.slice(0,10),x.start.slice(11,16)))out.push({ev:e,t:x,b})})});
  return out.sort((a,b)=>a.t.start.localeCompare(b.t.start));   /* 最早的在最上面 */
}
const notiLate=(s=state)=>notiLateItems(s).length;
function notiBadge(){
  const b=$("#notiBtn");if(!b)return;
  const n=notiLate(),el=b.querySelector(".noti-n"),txt=n?String(n>99?"99+":n):"";
  if(el.textContent!==txt){el.textContent=txt;el.hidden=!n;if(n)Anim.enter(el,"pop")}
  b.setAttribute("aria-label",n?`通知：${n} 件逾期`:"通知");
}
/* 跨過時刻時數字跟著變：每分鐘開頭（秒數 0）只重算通知鈕的數字（不重畫看板）；頁面不可見時不跑，回到畫面時馬上重算再接著跑 */
let notiTick=0;
function notiTickSet(){clearTimeout(notiTick);notiTick=0;if(document.hidden)return;const d=new Date();
  notiTick=setTimeout(()=>{notiBadge();notiTickSet()},60000-d.getSeconds()*1000-d.getMilliseconds()+50)}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)notiBadge();notiTickSet()});
notiTickSet();

/* ---------- 今日／明日：左右兩張卡片（手機也並排） ---------- */
/* 卡片裡一列的時間欄：當天開始的寫時刻（沒有就「整天」），時段寫「第 k／N 天」。時刻是資料裡的字串，呼叫端一律 esc（ui-06 審查 P2-4；calWhen、dkCardHTML 的時刻也是） */
function dayWhen(x,d){
  if(!x.end)return x.time||"整天";
  const k=Math.round((pd(d)-pd(x.date))/864e5)+1,n=Math.round((pd(x.end)-pd(x.date))/864e5)+1;
  return k===1&&x.time?x.time:`${k}／${n} 天`;
}
/* 一張卡片：大日期、今日／明日・星期、件數；下面最多四列（時刻、名稱、地點・所屬即時回報），多的寫 +N；沒有事＝一條短細線。
   今日＝主要動作色（--pri）底；點今日＝放大成全螢幕的「今日」層（openToday），點明日＝行事曆選到那一天（notiOpenDay） */
const daySub=x=>[x.place,x.ev].filter(Boolean).join("・");
function dayCardHTML(d,lab,cls,list){
  const xs=list.filter(x=>covers(x,d)),MAX=4;
  return `<button type="button" class="nd-card${cls?" "+cls:""}" data-nopen="${esc(d)}" aria-label="${esc(lab)} ${esc(fmt(d))}，${xs.length} 件">
    <span class="nd-head"><span class="nd-num num">${+d.slice(8)}</span><span class="nd-lab"><b>${lab}<i>・</i>週${WD[pd(d).getDay()]}</b><small class="num">${xs.length?`${xs.length} 件`:""}</small></span></span>
    ${xs.length?`<span class="nd-list">${xs.slice(0,MAX).map(x=>`<span class="nd-row"><span class="nd-t num">${esc(dayWhen(x,d))}</span><span class="nd-x"><b>${esc(x.title)}</b>${daySub(x)?`<small>${esc(daySub(x))}</small>`:""}</span></span>`).join("")}${xs.length>MAX?`<span class="nd-more num">+${xs.length-MAX}</span>`:""}</span>`
      :`<span class="nd-empty" aria-hidden="true"><i></i></span>`}
  </button>`;
}

/* ---------- 行事曆（DESIGN-next 第九節「海報月曆」） ----------
   一個行事曆的狀態（calState）：month（YYYY-MM）、day（選到的日期，預設今天）、pop（月份選單開著）、mode（顯示哪一類）、oth（「其他」勾的部門）。
   通知頁一份（NOTI）；畫在哪裡：通知頁＝#notiPage（renderNoti），別的地方用 calMount（host._cal 指回狀態，點擊由下面的監聽找到它）。
   海報月曆：超大月份數字加英文縮寫、右上兩行年份；週一開頭、上面一排 MON–SUN；日期只有數字、沒有格線；
   月曆上不寫字：單天的事＝日期下一顆小點、跨天＝橫跨那幾天的細線（兩端圓點），同一週撞在一起的往下排一層（每層 9px）；
   跨週（或跨月）的那一端沒有圓點、線畫到那一格的邊緣（.cont-l／.cont-r），在某一週只佔一格時也是半條線、不會跟單天的小點混在一起；
   選到的日期＝選中色實心圓（直徑 40）、今天＝焦點色粗體；底下一行「部門・學生會」。
   點日期：下面的清單換成那一天（舊的原地淡出、新的一列一列浮上來，calAfter）；右上的月份鈕點開選月份（自製選單，Esc、點外面關） */
const MON_EN=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function calState(pub){const t=today();return {pub:!!pub,month:t.slice(0,7),day:t,pop:false,mode:pub?"all":"mine",oth:[],host:null}}
const NOTI=calState(false),CALS=[NOTI];
/* 清單換內容的判斷：模式、勾的部門、月份、那一天 */
const calKey=c=>[c.mode,c.oth.join(","),c.day].join("|");
function posterHTML(c,list){
  const m=c.month,first=pd(m+"-01"),y=first.getFullYear(),mi=first.getMonth(),dim=new Date(y,mi+1,0).getDate(),off=(first.getDay()+6)%7;
  const t=today(),ds=n=>`${m}-${pad(n)}`;
  const weeks=[];for(let n=1-off;n<=dim;n+=7)weeks.push(Array.from({length:7},(_,i)=>n+i));
  const body=weeks.map(w=>{
    const lo=Math.max(1,w[0]),hi=Math.min(dim,w[6]),a=ds(lo),b=ds(hi);
    const nums=w.map(n=>{if(n<1||n>dim)return `<span class="pc-d pc-pad" aria-hidden="true"></span>`;const d=ds(n),k=list.filter(x=>covers(x,d)).length;
      return `<button type="button" class="pc-d${d===t?" is-today":""}${d===c.day?" sel":""}${k?" has":""}" data-calday="${d}" aria-label="${fmt(d)}${k?`，${k} 件`:""}" aria-pressed="${d===c.day}"><span class="pc-n num">${n}</span></button>`}).join("");
    const lanes=[];
    const evs=list.filter(x=>x.date<=b&&(x.end||x.date)>=a).map(x=>{
      const cl=x.date<a,cr=(x.end||x.date)>b,s=cl?lo:+x.date.slice(8),e=cr?hi:+(x.end||x.date).slice(8),i0=w.indexOf(s),i1=w.indexOf(e);
      let ln=lanes.findIndex(z=>z<i0);if(ln<0){ln=lanes.length;lanes.push(-1)}lanes[ln]=i1;
      return `<span class="pc-e${i1>i0||cl||cr?" span":""}${cl?" cont-l":""}${cr?" cont-r":""}" aria-hidden="true" style="--i0:${i0};--i1:${i1};--ln:${ln}"></span>`}).join("");
    return `<div class="pc-week" style="--lanes:${lanes.length}">${nums}${evs}</div>`}).join("");
  return `<div class="pc-head" aria-hidden="true"><b class="pc-mon"><span class="pc-mn num">${mi+1}</span>${MON_EN[mi]}</b><span class="pc-yr num">${String(y).slice(0,2)}<br>${String(y).slice(2)}</span></div>
    <div class="pc-wk" aria-hidden="true">${["MON","TUE","WED","THU","FRI","SAT","SUN"].map(x=>`<span>${x}</span>`).join("")}</div>
    <div class="pc-body" role="group" aria-label="${y} 年 ${mi+1} 月">${body}</div>
    <p class="pc-foot">${c.pub?"全會":esc(CFG.dept.name||"本部門")}・學生會</p>`;
}
/* 那一天的清單：每件事一張（日期、時刻；名稱；地點、所屬的小膠囊） */
const calWhen=x=>x.end?`${nmd(x.date)}–${nmd(x.end)}`:x.time?x.time+(x.etime&&x.etime>x.time?`–${x.etime}`:""):"整天";
const calPill=(c,x)=>c.mode==="mine"&&x.ev?x.ev:deptName(x.dept);
const calKind=(c,x)=>x.kind==="meet"?" line":x.kind==="act"||c.mode==="mine"?" pri":c.mode==="pres"?" acc":"";
function calListHTML(c,r){
  const d=c.day,xs=r.xs.filter(x=>covers(x,d));
  const body=xs.length?xs.map(x=>`<div class="cal-ev"><div class="ce-t"><b class="num">${nmd(d)}</b><span class="num">${esc(calWhen(x))}</span></div><div class="ce-n">${esc(x.title)}</div>
      <div class="ce-b">${x.place?`<span class="ce-pl">${ico("pin","solo")}${esc(x.place)}</span>`:""}<span class="ce-k${calKind(c,x)}">${esc(calPill(c,x))}</span></div></div>`).join("")
    :r.loading?`<p class="cal-none">讀取中…</p>`:r.err?`<p class="cal-none">${esc(r.err)}</p>`:`<p class="cal-none num">${nmd(d)}</p>`;
  return `<div class="cal-list" data-callist="${esc(calKey(c))}" aria-live="polite">${body}</div>`;
}
/* 月份選單：那個學年（8 月起算）的 12 個月 */
function calMonths(c){const [y,mo]=c.month.split("-").map(Number),y0=mo>=8?y:y-1;return Array.from({length:12},(_,i)=>{const mm=(7+i)%12+1;return `${mm>=8?y0:y0+1}-${pad(mm)}`})}
const calPopHTML=c=>`<div class="cal-pop" role="listbox" aria-label="月份">${calMonths(c).map(v=>`<button type="button" role="option" data-calset="${v}" aria-selected="${v===c.month}"><span class="num">${+v.slice(5)}</span> 月</button>`).join("")}</div>`;
/* ---------- 五類模式（DESIGN-next 第九節）：本部門、會長室、活動、會議、其他（自由勾選部門）；公共版：全部、活動、會議 ----------
   本部門＝這個看板（state）；會長室、其他勾的部門＝讀那個單位的看板（follow.js 的 fwLoad：github 部門讀資料檔、firestore 部門讀新資料庫，只讀）；
   活動、會議＝scope 是 all-activity／all-meeting 的時間事件（store.js 的 storeScopeEvents，只有新資料庫有；都還在 github 時這兩類是空的）。
   讀取量：選到那一類（勾了那個部門）才讀，讀過的留在記憶體（CAL_DATA；重新打開這一頁時超過 5 分鐘、或讀失敗的重讀）；活動、會議只讀那個月前後的範圍。
   公共版的活動、會議另外一組 key（pub:）：沒登入 Google 的人只讀得到公開事件，查詢改成 visibility=='public'（store-firestore.js 的 eventsByScope；ui-06 審查 P2-5） */
const CAL_MODES=[["mine","本部門"],["pres","會長室"],["act","活動"],["meet","會議"],["other","其他"]],CAL_PMODES=[["all","全部"],["act","活動"],["meet","會議"]];
const CAL_DATA=new Map();   /* key（dept:代號、scope:all-activity:YYYY-MM、公共版 pub:all-activity:YYYY-MM）→ {items, err, at} 或 {loading:true} */
const calOthers=()=>(window.BOARD_DEPTS||[]).filter(d=>d.id!==CFG.deptId&&d.id!=="president");
function calKeys(c){
  const sc=s=>storeScopeOn()?[`${c.pub?"pub":"scope"}:${s}:${c.month}`]:[];
  if(c.pub)return c.mode==="act"?sc("all-activity"):c.mode==="meet"?sc("all-meeting"):[...sc("all-activity"),...sc("all-meeting")];
  if(c.mode==="pres")return CFG.deptId==="president"?[]:["dept:president"];
  if(c.mode==="act")return sc("all-activity");
  if(c.mode==="meet")return sc("all-meeting");
  if(c.mode==="other")return c.oth.map(id=>"dept:"+id);
  return [];
}
function calItems(c){
  let xs=!c.pub&&(c.mode==="mine"||c.mode==="pres"&&CFG.deptId==="president")?notiMine():[],loading=false,err="";
  calKeys(c).forEach(k=>{const v=CAL_DATA.get(k);if(!v||v.loading)loading=true;else{if(v.err)err=err||v.err;xs=xs.concat(v.items)}});
  return {xs:xs.sort(byWhen),loading,err};
}
/* 新資料庫的時間事件 → 清單的一件事（kind：act 活動／meet 會議） */
function scopeItems(docs,kind){
  const raw=(v,r,all)=>r!=null&&r!==""?r:v&&v.__ts!=null?StoreMap.fmtTaipei(v.__ts,all):"";
  return docs.map(e=>{const s=raw(e.start,e.startRaw,e.allDay),en=raw(e.end,e.endRaw,e.allDay),d=s.slice(0,10),ed=en.slice(0,10);
    return {key:`scope:${e.id}`,date:d,end:ed&&ed>d?ed:"",time:s.slice(11,16),etime:en.slice(11,16),title:e.label||e.title||"（未命名）",place:e.place||"",ev:"",dept:e.deptId||"",kind}}).filter(x=>x.date);
}
function calLoad(c){
  calKeys(c).forEach(k=>{if(CAL_DATA.has(k))return;CAL_DATA.set(k,{loading:true});
    let p;
    if(k.startsWith("dept:")){const id=k.slice(5);p=fwLoad(id).then(r=>r&&r.data?{items:notiItems(r.data,id)}:{items:[],err:(r&&r.err)||"讀不到這個部門的資料"})}
    else{const [kind,s,m]=k.split(":"),a=StoreMap.parseTaipei(addDays(m+"-01",-31)),b=StoreMap.parseTaipei(ym(new Date(+m.slice(0,4),+m.slice(5,7),1))+"-01");
      p=storeScopeEvents(s,a.ms,b.ms,{pub:kind==="pub"}).then(docs=>({items:scopeItems(docs,s==="all-meeting"?"meet":"act")}))}
    p.catch(e=>{if(!k.startsWith("dept:"))fsReadErr("行事曆 "+k,e);return {items:[],err:!k.startsWith("dept:")&&e&&e.code==="permission-denied"?"登入後才看得到":STORE_XERR(e)}}).then(   /* 活動、會議不是「某個部門搬家」：沒權限只說要登入 */v=>{CAL_DATA.set(k,{...v,at:Date.now()});CALS.forEach(x=>{if(calKeys(x).includes(k)&&(x!==NOTI||notiOpen))calPaint(x)})});
  });
}
/* 重新打開通知頁時：超過 5 分鐘或讀失敗的丟掉重讀 */
function calStale(){CAL_DATA.forEach((v,k)=>{if(!v.loading&&(v.err||Date.now()-v.at>3e5))CAL_DATA.delete(k)})}
function calModesHTML(c){
  const ms=c.pub?CAL_PMODES:CAL_MODES;
  return `<div class="cal-modes"><div class="cal-seg lseg glass" role="tablist" aria-label="行事曆範圍"><span class="lseg-lens" aria-hidden="true"></span>${ms.map(([k,t])=>`<button type="button" role="tab" data-k="${k}" aria-selected="${c.mode===k}">${t}</button>`).join("")}</div></div>
    ${!c.pub&&c.mode==="other"?`<div class="cal-oth" role="group" aria-label="其他部門">${calOthers().map(d=>`<button type="button" class="cal-chip" role="checkbox" data-caloth="${esc(d.id)}" aria-checked="${c.oth.includes(d.id)}">${esc(d.name)}</button>`).join("")}</div>`:""}`;
}
function calMode(c,k){if(c.mode===k)return;c.mode=k;calLoad(c);calPaint(c)}
function calOth(c,id){c.oth=c.oth.includes(id)?c.oth.filter(x=>x!==id):[...c.oth,id];calLoad(c);calPaint(c)}
/* 一個行事曆的 HTML（通知頁的 renderNoti 跟 calMount 共用） */
function calHTML(c){
  const r=calItems(c),m=c.month,id=c.pub?"calPubH":"calH";
  return `<section class="cal${c.pub?" pub":""}" aria-labelledby="${id}"><div class="cal-top">
    <div class="cal-h"><h3 class="sec-h" id="${id}" data-en="${c.pub?"STUSTSA CALENDAR":"CALENDAR"}">${c.pub?"全會行事曆":"行事曆"}</h3>
      <span class="cal-mp"><button type="button" class="cal-mon" data-calmon aria-haspopup="listbox" aria-expanded="${c.pop}"><span class="num">${+m.slice(5)}</span> 月${ico("down","solo")}</button>${c.pop?calPopHTML(c):""}</span></div>
    ${calModesHTML(c)}
    <div class="pc">${posterHTML(c,r.xs)}</div></div>
    ${calListHTML(c,r)}</section>`;
}
/* 重畫一個行事曆（原位更新）。清單換了內容（calKey 不同）：舊的留一個分身原地淡出、新的一列一列浮上來 */
const calHost=c=>c===NOTI?$("#notiPage"):c.host;
function calSwapPrep(host){const l=host&&host.querySelector(".cal-list");return l&&l.offsetParent&&!reduceMotion()?{key:l.dataset.callist,ghost:l.cloneNode(true),r:l.getBoundingClientRect()}:null}
function calAfter(c,host,sw){
  host.dataset.calhost="";host._cal=c;
  const sg=host.querySelector(".cal-seg");if(sg&&!sg._seg)sg._seg=new LiquidSeg(sg,{onPick:k=>calMode(c,k)});   /* 模式切換（分段切換的鏡片，anim.js） */
  const l=host.querySelector(".cal-list");if(!sw||!l||sw.key===l.dataset.callist)return;
  const par=l.parentElement,pr=par.getBoundingClientRect(),g=sw.ghost;
  g.removeAttribute("aria-live");g.setAttribute("aria-hidden","true");g.inert=true;g.classList.add("cal-ghost");
  Object.assign(g.style,{left:(sw.r.left-pr.left)+"px",top:(sw.r.top-pr.top)+"px",width:sw.r.width+"px"});
  par.append(g);const rm=()=>g.remove();g.animate([{opacity:1},{opacity:0}],{duration:MO.fast,easing:MO.in,fill:"forwards"}).finished.then(rm,rm);
  [...l.children].slice(0,12).forEach((x,i)=>x.animate([{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"none"}],{duration:MO.base+80,delay:60+i*40,easing:"cubic-bezier(.25,1.12,.4,1)",fill:"backwards"}));
}
function calPaint(c){if(c===NOTI){renderNoti();return}const h=c.host;if(!h)return;const sw=calSwapPrep(h);morphTo(h,calHTML(c));calAfter(c,h,sw)}
/* 公共版（主頁的全會行事曆，第 7 步接上）：在 host 裡畫一份 pub 的行事曆（全部／活動／會議；沒有今日／明日與逾期），回傳它的狀態。
   拿掉之前呼叫 calUnmount(host)：從 CALS 移除（不再接讀取完成的重畫、點擊、Esc）、拆掉模式切換的 LiquidSeg（視窗 resize 監聽）、清空 host */
function calMount(host){
  if(host._cal)return host._cal;
  const c=calState(true);c.host=host;CALS.push(c);calLoad(c);calPaint(c);return c;
}
function calUnmount(host){
  const c=host&&host._cal;if(!c||c===NOTI)return;
  const i=CALS.indexOf(c);if(i>=0)CALS.splice(i,1);
  host.querySelector(".cal-seg")?._seg?.destroy();
  c.host=null;c.pop=false;delete host._cal;delete host.dataset.calhost;host.replaceChildren();
}
function calDay(c,d){if(c.day===d)return;c.day=d;calPaint(c)}
/* 換月份：選到的日期換成那個月的今天（不是這個月就 1 號）；月曆從翻頁方向滑進來 */
function calMonth(c,m){
  if(m===c.month){calPop(c,false);return}
  Sfx.play("roll");   /* 換月＝滾動 */
  const dir=m>c.month?1:-1;c.month=m;c.day=today().slice(0,7)===m?today():m+"-01";c.pop=false;calLoad(c);calPaint(c);
  const pc=calHost(c)?.querySelector(".pc");if(pc&&!reduceMotion())pc.animate([{opacity:0,transform:`translateX(${dir*18}px)`},{opacity:1,transform:"none"}],{duration:MO.base,easing:MO.out});
  calHost(c)?.querySelector("[data-calmon]")?.focus({preventScroll:true});
}
/* 月份選單開關：打開時由右上長出來、焦點到選到的那個月；關的時候淡出再拿掉 */
function calPop(c,on){
  if(c.pop===on)return;const h=calHost(c);Sfx.play(on?"open":"back");
  if(on){c.pop=true;calPaint(c);const p=h&&h.querySelector(".cal-pop");if(!p)return;
    if(!reduceMotion())p.animate([{opacity:0,transform:"translateY(-6px) scale(.96)"},{opacity:1,transform:"none"}],{duration:MO.base,easing:MO.spring});
    p.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});return}
  const p=h&&h.querySelector(".cal-pop");c.pop=false;
  if(!p||reduceMotion()){calPaint(c);return}
  p.inert=true;p.animate([{opacity:1},{opacity:0,transform:"translateY(-4px) scale(.97)"}],{duration:MO.fast,easing:MO.in,fill:"forwards"}).finished.then(()=>{if(!c.pop)calPaint(c)},()=>{});
}
document.addEventListener("click",e=>{
  const t=e.target;if(!t.closest)return;
  const host=t.closest("[data-calhost]"),c=host&&host._cal;
  CALS.forEach(x=>{if(x.pop&&!(x===c&&t.closest(".cal-mp")))calPop(x,false)});   /* 點選單以外＝關掉 */
  if(!c)return;
  if(t.closest("[data-calmon]")){calPop(c,!c.pop);return}
  const ms=t.closest("[data-calset]");if(ms){calMonth(c,ms.dataset.calset);return}
  const dd=t.closest("[data-calday]");if(dd){calDay(c,dd.dataset.calday);return}
  const oth=t.closest("[data-caloth]");if(oth){calOth(c,oth.dataset.caloth);return}
});
/* 月份選單：Esc 關（焦點回月份鈕）、上下左右鍵移動 */
document.addEventListener("keydown",e=>{
  const c=CALS.find(x=>x.pop);if(!c)return;
  if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();calPop(c,false);calHost(c)?.querySelector("[data-calmon]")?.focus({preventScroll:true});return}
  const os=[...(calHost(c)?.querySelectorAll(".cal-pop [data-calset]")||[])],i=os.indexOf(document.activeElement),k={ArrowRight:1,ArrowDown:3,ArrowLeft:-1,ArrowUp:-3}[e.key];
  if(k&&i>=0){e.preventDefault();os[Math.max(0,Math.min(os.length-1,i+k))].focus()}
},true);
/* 這一頁的內容：今日／明日、逾期、行事曆 */
function notiInner(){
  const list=notiMine(),t=today();
  return `<div class="noti-days">${dayCardHTML(t,"今日","today",list)}${dayCardHTML(addDays(t,1),"明日","",list)}</div>
    ${lateHTML()}
    ${calHTML(NOTI)}`;
}
/* ---------- 逾期（DESIGN-next 第九節）：卡片堆只列逾期的時間（定義跟標題列通知鈕的數字一樣，notiLateItems） ----------
   一次一張、後面露出兩張；最上面那張跟手指走並傾斜：左滑＝延後（明天同一時刻，notiPostpone）、右滑＝改成具體時間（打開那張卡片的時間頁，notiRetime）。
   下面一排：延後鈕、剩幾件、改時間鈕。沒有逾期就整區不出現。動畫只動 transform／opacity。
   不能編輯（canEdit 為假：GitHub 模式沒選身分、唯讀）時卡片堆照樣看得到，但沒有延後／改時間鈕、卡片拖不動（ui-06 審查 P1-1） */
function dkCardHTML(x,i){
  const d=x.t.start.slice(0,10),en=(x.t.end||"").slice(0,10),tm=x.t.start.slice(11,16);
  return `<div class="dk-card" data-dk="${esc(x.t.id)}" data-i="${i}" style="--i:${i}"${i?' aria-hidden="true"':""}>
    <span class="dk-stp r" aria-hidden="true">改時間</span><span class="dk-stp l" aria-hidden="true">延後</span>
    <span class="dk-date"><b class="num">${+d.slice(8)}</b><small>${+d.slice(5,7)} 月・週${WD[pd(d).getDay()]}${en&&en>d?`<br>到 ${nmd(en)}`:""}</small></span>
    <span class="dk-main"><b>${esc(x.t.label||x.b.text||x.ev.name||"（未命名）")}</b><small>${esc(x.ev.name||"")}${tm?`<span class="num">${esc(tm)}</span>`:""}</small></span>
  </div>`;
}
function lateHTML(){
  const xs=notiLateItems(),ed=canEdit(),u=dkUndoHTML();if(!xs.length&&!u)return "";
  return `<section class="nt-late" id="notiLate" aria-labelledby="ntLateH"><h3 class="sec-h" id="ntLateH" data-en="OVERDUE">逾期</h3>
    ${xs.length?`<div class="dk-stack${ed?"":" ro"}" id="notiDeck">${xs.slice(0,3).map((x,i)=>dkCardHTML(x,i)).reverse().join("")}</div>
    <div class="dk-ctl">${ed?`<button type="button" class="dk-btn" data-dkgo="l" aria-label="延後到明天">${ico("go","solo")}</button>`:""}<span class="dk-n num" aria-label="逾期 ${xs.length} 件">${xs.length}</span>${ed?`<button type="button" class="dk-btn pri" data-dkgo="r" aria-label="改時間">${ico("clock","solo")}</button>`:""}</div>`:""}
    ${u}</section>`;
}
/* 延後：明天同一時刻。單天的（含同一天的結束時刻）整個搬到明天；跨天的只把結束日改成明天。寫回那張即時回報（evTouch、母議題的處理紀錄跟著）。
   存好後卡片堆下面一行「已延後到明天＋復原」（ui-06 審查 P1-2；樣式沿用即時回報卡的「已儲存＋復原」：.lc-save、.kp-st、.lc-undo）。
   復原＝寫回延後前的開始／結束（一樣要能編輯、一樣經 settingSave 存檔）；那個時間在那之後被改過就不復原。關掉這一頁、再延後別張時「復原」消失 */
let dkUndo=null;   /* {evId, tid, b（延後前 {start,end}）, a（延後後）} */
const tmOf=(evId,tid)=>{const ev=state.events.find(e=>e.id===evId);return {ev,t:ev&&(ev.times||[]).find(y=>y.id===tid)}};
const dkUndoOn=()=>!!(dkUndo&&canEdit()&&tmOf(dkUndo.evId,dkUndo.tid).t);
const dkUndoHTML=()=>dkUndoOn()?`<div class="lc-save dk-undo"><span class="kp-st" role="status" data-st="ok">已延後到明天</span><button type="button" class="lc-undo" data-dkundo>復原</button></div>`:"";
async function notiPostpone(evId,tid){
  if(!canEdit())return false;
  const tm=addDays(today(),1),{t:t0}=tmOf(evId,tid),b=t0&&{start:t0.start,end:t0.end};let a=null;
  const ok=await settingSave(()=>{const {ev,t}=tmOf(evId,tid);if(!t)return false;
    const sd=t.start.slice(0,10),ed=(t.end||"").slice(0,10);
    if(ed&&ed>sd)t.end=tm+t.end.slice(10);
    else{t.start=tm+t.start.slice(10);if(t.end)t.end=tm+t.end.slice(10)}
    a={start:t.start,end:t.end};evTouch(ev);syncLink(ev)},"已延後到明天");
  dkUndo=ok&&b&&a?{evId,tid,b,a}:null;renderNoti();return ok;
}
async function notiUndo(){
  const u=dkUndo;if(!u||!canEdit())return false;dkUndo=null;
  const {t}=tmOf(u.evId,u.tid);
  if(!t||t.start!==u.a.start||t.end!==u.a.end){toast("這個時間已有新的修改，無法復原");renderNoti();return false}
  const ok=await settingSave(()=>{const {ev,t}=tmOf(u.evId,u.tid);if(!t||t.start!==u.a.start||t.end!==u.a.end)return false;
    t.start=u.b.start;if(u.b.end===undefined)delete t.end;else t.end=u.b.end;evTouch(ev);syncLink(ev)},"已復原");
  renderNoti();return ok;
}
/* 改成具體時間：回到即時回報、打開那張卡片、進入編輯並換到時間頁，選到那一個時間的日期（live.js） */
async function notiRetime(evId,tid){
  if(!canEdit())return false;
  closeNoti(true,"live");
  if(!state.events.some(e=>e.id===evId&&!e.doneAt))return;
  lcShow("live",evId);
  if(!canEdit()||!(await kpStart(evId,{focus:null})))return;
  lvPane="time";lvSeg={tid,k:"d",buf:""};render();
  document.querySelector(".lc-ed .sg.on")?.focus({preventScroll:true});lvBodyIn();
}
/* 最上面那張飛出去（dir：l 往左＝延後、r 往右＝改時間），播完才做 */
function dkFly(card,dir,from={x:0,y:0}){
  if(!card||card._gone||!canEdit())return;card._gone=true;
  const W=card.offsetWidth||320,sx=dir==="r"?1:-1,tid=card.dataset.dk,x=notiLateItems().find(y=>y.t.id===tid);
  const reset=()=>{if(!card.isConnected)return;card._gone=false;card.getAnimations().forEach(a=>a.cancel());card.classList.remove("go-l","go-r");card.style.transform="";card.style.transition="";card.style.setProperty("--l",0);card.style.setProperty("--r",0)};
  const act=()=>{if(!x){reset();return}if(dir==="l")Promise.resolve(notiPostpone(x.ev.id,tid)).finally(reset);else{reset();notiRetime(x.ev.id,tid)}};
  card.classList.add(dir==="r"?"go-r":"go-l");
  if(reduceMotion()){act();return}
  const next=card.parentElement.querySelector(`.dk-card[data-i="1"]`);
  if(next)next.animate([{transform:getComputedStyle(next).transform},{transform:"none"}],{duration:MO.base,easing:MO.out,fill:"forwards"});
  card.animate([{transform:`translate(${from.x}px,${from.y}px) rotate(${from.x/18}deg)`,opacity:1},{transform:`translate(${sx*W*1.3}px,${from.y+40}px) rotate(${sx*26}deg)`,opacity:0}],{duration:340,easing:MO.in,fill:"forwards"})
    .finished.then(()=>{if(next)next.getAnimations().forEach(a=>a.cancel());act()}).catch(()=>{});
}
function dkBind(){
  const st=$("#notiDeck");if(!st||st._dk||!canEdit())return;st._dk=true;   /* 不能編輯＝不綁（之後登入、重畫時才綁） */
  ["touchstart","touchmove"].forEach(t=>st.addEventListener(t,e=>{if(e.target.closest(".dk-card"))e.stopPropagation()},{passive:true}));
  let d=null;
  st.addEventListener("pointerdown",e=>{
    const c=e.target.closest(".dk-card");if(!c||e.button>0||c.dataset.i!=="0"||c._gone||!canEdit())return;   /* 綁過之後才變成不能編輯（登出、唯讀） */
    d={c,id:e.pointerId,x0:e.clientX,y0:e.clientY,x:0,y:0,axis:"",vx:0,lx:e.clientX,lt:performance.now()};
    c.getAnimations().forEach(a=>a.cancel());try{st.setPointerCapture(e.pointerId)}catch(_){}
  });
  st.addEventListener("pointermove",e=>{
    if(!d||e.pointerId!==d.id)return;const dx=e.clientX-d.x0,dy=e.clientY-d.y0;
    if(!d.axis){if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;d.axis=Math.abs(dx)>=Math.abs(dy)?"x":"y";if(d.axis==="y"){d=null;return}d.c.style.transition="none"}
    const now=performance.now();d.vx=(e.clientX-d.lx)/Math.max(8,now-d.lt);d.lx=e.clientX;d.lt=now;d.x=dx;d.y=dy*.35;
    const W=d.c.offsetWidth||320,k=Math.min(1,Math.abs(dx)/(W*.3));
    d.c.style.transform=`translate(${dx}px,${d.y}px) rotate(${dx/18}deg)`;d.c.style.setProperty("--r",dx>0?k:0);d.c.style.setProperty("--l",dx<0?k:0);
    const nx=st.querySelector('.dk-card[data-i="1"]');if(nx){nx.style.transition="none";nx.style.transform=`translateY(${(1-k)*12}px) scale(${.95+.05*k})`}
  });
  const end=e=>{
    if(!d||(e&&e.pointerId!==d.id))return;const c=d.c,W=c.offsetWidth||320,x=d.x,y=d.y,v=d.vx;d=null;
    const nx=st.querySelector('.dk-card[data-i="1"]');
    /* 甩出去：拖過卡片寬的 30%，或快甩（速度超過 0.6px/ms）而且至少拖了卡片寬的 15%（ui-06 審查 P1-2：原本 24px 就算，太容易誤觸） */
    if(Math.abs(x)>W*.3||Math.abs(v)>.6&&Math.abs(x)>W*.15){if(nx){nx.style.transform="";nx.style.transition=""}dkFly(c,(x||v)>0?"r":"l",{x,y});return}
    const from=c.style.transform;c.style.transform="";c.style.transition="";c.style.setProperty("--r",0);c.style.setProperty("--l",0);
    if(nx){nx.style.transform="";nx.style.transition=""}
    if(from&&!reduceMotion())c.animate([{transform:from},{transform:"none"}],{duration:MO.slow,easing:MO.spring});
  };
  st.addEventListener("pointerup",end);st.addEventListener("pointercancel",end);
}
/* ---------- 今日層（DESIGN-next 第九節） ----------
   點今日卡片：卡片放大成全螢幕的一層（跟今日卡片同色：--pri 底、--pri-ink 字）：大日期、今日、月份與星期、關閉鈕、「本來就要做」清單（今天本部門的事）。
   返回鍵／手勢、Esc、「關閉」都會關。資料只讀 */
let todayOpen=false;
function todayHTML(){
  const t=today(),own=notiMine().filter(x=>covers(x,t));
  return `<div class="td-in"><div class="td-top"><span class="td-num num">${+t.slice(8)}</span><span class="td-lab"><b>今日</b><small class="num">${+t.slice(5,7)} 月・週${WD[pd(t).getDay()]}</small></span><button type="button" class="td-x-btn" data-tdclose aria-label="關閉今日">${ico("close","solo")}關閉</button></div>
    <section class="td-sec"><h3>本來就要做<span class="num">${own.length}</span></h3>${own.length?`<ol class="td-list">${own.map((x,i)=>`<li class="td-row" style="--i:${i}"><span class="td-t num">${esc(dayWhen(x,t))}</span><span class="td-x"><b>${esc(x.title)}</b>${daySub(x)?`<small>${esc(daySub(x))}</small>`:""}</span></li>`).join("")}</ol>`:`<p class="td-none">今天沒有排定的事</p>`}</section></div>`;
}
/* 彈簧曲線取樣（質量 1、阻尼比 z、勁度 k）：回傳 0→1 的進度（會超過 1 再回來＝Q 彈）與總時間，拿來產生 Web Animations 的關鍵影格 */
function springCurve(z,k,tol=.0015){
  const out=[0];let x=0,v=0,t=0;const dt=1/120,c=2*z*Math.sqrt(k);
  while(t<2){for(let i=0;i<2;i++){v+=(-k*(x-1)-c*v)*dt/2;x+=v*dt/2}t+=dt;out.push(x);if(t>.2&&Math.abs(1-x)<tol&&Math.abs(v)<tol*13)break}
  out[out.length-1]=1;return {p:out,dur:Math.round(t*1000)};
}
/* 今日層的展開／收合（2026-11-06 使用者：進入、返回要更 Q 彈流暢）：
   底板（.td-bg，純色）用 clip-path 從卡片的位置與圓角「揭開」到全螢幕（圓角不會被拉歪），裡面的內容同時從卡片的位置彈到定位（transform）；
   clip-path 只裁純色底板（每格重畫很便宜），內容只動 transform／opacity（合成器）。
   展開：彈簧（.62／190）略超出全螢幕再回來。
   收合（2026-11-06 使用者：收回時像動畫突然斷掉，要復位那一下明顯縮小再彈回）：不再倒放展開動畫（倒放的結尾是全速撞到卡片後停住），
   改用自己的欠阻尼彈簧（.55／90）從全螢幕收向卡片；底板只播到剛好收到卡片大小（進度第一次到 0）為止，
   彈簧剩下的那段（縮過頭＝比卡片小、彈回來稍微超過、停住，結束時速度為 0）交給卡片本身接著播（tdCardLand）。
   回傳的 Promise 收合時帶著剩下那段進度（≤0 表示比卡片小） */
function todayMorph(ov,card,reverse){
  const r=card.getBoundingClientRect(),W=innerWidth,H=innerHeight,inner=ov.querySelector(".td-in");
  const ir=inner.getBoundingClientRect(),dx=r.left+14-ir.left,dy=r.top+12-ir.top;   /* 內容的左上（大日期）對齊卡片的大日期 */
  let P,dur,tail=null;
  if(!reverse){const S=springCurve(.62,190);P=S.p;dur=S.dur}   /* 回彈約 8% */
  else{
    const S=springCurve(.55,90,.003),A=S.p.map(x=>1-x);   /* 1（全螢幕）→ 0（卡片），會衝到 0 以下再回來 */
    let k=1;while(k<A.length-1&&A[k]>0)k++;
    P=A.slice(0,k+1);P[k]=0;dur=Math.round(k/120*1000);tail=A.slice(k);   /* springCurve 每 1/120 秒取一點 */
  }
  const n=P.length,o={duration:dur,fill:"both"},rad=parseFloat(getComputedStyle(card).borderTopLeftRadius)||18;   /* 從卡片自己的圓角揭開 */
  const clip=p=>{const q=Math.max(0,p);return `inset(${(r.top*(1-q)).toFixed(1)}px ${((W-r.right)*(1-q)).toFixed(1)}px ${((H-r.bottom)*(1-q)).toFixed(1)}px ${(r.left*(1-q)).toFixed(1)}px round ${(rad*(1-Math.min(1,q))).toFixed(1)}px)`};
  const kf=[],ki=[];
  P.forEach((p,i)=>{const off=i/(n-1);kf.push({offset:off,clipPath:clip(p)});ki.push({offset:off,transform:`translate(${(dx*(1-p)).toFixed(1)}px,${(dy*(1-p)).toFixed(1)}px) scale(${(.92+.08*p).toFixed(4)})`,opacity:Math.max(0,Math.min(1,p*1.5-.1))})});
  inner.style.transformOrigin="0 0";
  ov.querySelector(".td-bg").animate(kf,o);
  return inner.animate(ki,o).finished.then(()=>tail);
}
/* 收回卡片的那一刻，卡片接著播收合彈簧剩下的那段（2026-11-06 使用者：復位那一下要明顯縮小再彈回）：
   進度 p≤0 換成卡片的縮放 1+a·p，a 讓最小值剛好 .94（彈回來約 1.01，最後停在 1、速度為 0）；
   起點就是原尺寸，跟底板收到卡片大小的那一格接得上，不會跳一下 */
function tdCardLand(card,tail){
  if(!card||!tail||tail.length<3||reduceMotion())return;
  const lo=Math.min(...tail),a=lo<0?.06/-lo:0,N=tail.length-1,kf=tail.map((p,i)=>({offset:i/N,transform:`scale(${(1+a*p).toFixed(4)})`}));
  kf[N].transform="scale(1)";card.animate(kf,{duration:Math.round(N/120*1000),easing:"linear"});
}
/* 卡片藏起來／換回來要「瞬間」：卡片本身的 opacity 有 CSS 過渡，直接改會慢慢淡入，今日層收掉後卡片晚一點才出現＝閃一下（2026-11-06 使用者回報） */
function tdCardShow(card,on){if(!card)return;card.style.transition="none";card.style.opacity=on?"":"0";void card.offsetWidth;card.style.transition=""}
function openToday(card){
  if(todayOpen)return;todayOpen=true;
  let ov=$("#todayOv");if(!ov){document.body.insertAdjacentHTML("beforeend",`<div class="td-ov" id="todayOv" role="dialog" aria-modal="true" aria-label="今日" hidden><div class="td-bg"></div><div class="td-scroll"></div></div>`);ov=$("#todayOv")}
  ov.getAnimations({subtree:true}).forEach(a=>a.cancel());
  ov.querySelector(".td-scroll").innerHTML=todayHTML();ov.querySelector(".td-scroll").scrollTop=0;ov.hidden=false;ov.classList.remove("off");Back.opened("today",i=>closeToday(i));ov._card=card;
  if(reduceMotion()||!card){ov.classList.add("on");return}
  tdCardShow(card,false);ov.classList.add("on");
  todayMorph(ov,card,false).then(()=>ov.getAnimations({subtree:true}).forEach(a=>a.cancel())).catch(()=>{});
}
function closeToday(instant){
  const ov=$("#todayOv");if(!ov||!todayOpen)return;todayOpen=false;Back.closed("today");Sfx.play("back");
  const card=ov._card&&ov._card.isConnected?ov._card:$("#notiPage .nd-card.today"),done=()=>{ov.hidden=true;ov.classList.remove("on","off");ov.getAnimations({subtree:true}).forEach(a=>a.cancel());tdCardShow(card,true)};
  if(instant===true||reduceMotion()||!card){done();return}
  ov.getAnimations({subtree:true}).forEach(a=>a.cancel());ov.querySelector(".td-scroll").scrollTo({top:0});
  tdCardShow(card,false);   /* 收合期間卡片藏著（底板收到卡片的位置與圓角時換回卡片，看起來就是同一張；剩下的縮過頭、彈回由卡片接著播） */
  todayMorph(ov,card,true).then(tail=>{done();tdCardLand(card,tail)}).catch(done);
}
function renderNoti(){
  const el=$("#notiPage");if(!el||!notiOpen)return;
  const sw=calSwapPrep(el);morphTo(el,notiInner());calAfter(NOTI,el,sw);   /* 原位更新（morph.js）：卡片堆、月曆沒變的節點留著 */
  dkBind();
}

/* ---------- 進出這一頁 ----------
   打開：編輯中的卡片先存檔（名稱空白等不能存就不進來）、設定頁收起、搜尋清掉；推一筆瀏覽紀錄；從原分頁換到這一頁（render.js 的 secSwap）。
   沒有權限、唯讀檢視時沒有通知鈕（views.js 的 renderHero），這一頁進不來；開著時變成唯讀就直接回原分頁 */
async function openNoti(){
  if(notiOpen||deptRO())return;
  if(editing&&!(await lvEndEdit()))return;
  if(notiOpen||deptRO())return;
  /* 設定開著（ui-09 起設定開著時標題列的通知鈕按得到）：把設定那一筆瀏覽紀錄直接換成通知頁，不先退一筆再推一筆（跟 nav.js 設定鍵那條同一個做法；ui-09 審查） */
  if(setOpen){Back.replace("settings","noti",i=>closeNoti(i));closeSettings(true)}
  if(HS.q)hsClear();
  notiOpen=true;Object.assign(NOTI,{month:today().slice(0,7),day:today(),pop:false});calStale();calLoad(NOTI);
  Back.layers.noti();$("#notiBtn").setAttribute("aria-pressed","true");
  hsBar();renderTabbar();renderNoti();
  secSwap(curSec,"noti",1);
}
/* 關掉：回到原分頁；to＝工具列按的那個分頁（nav.js 的 tabGo）。instant＝直接換（系統返回鍵已經播過動畫、開設定頁、權限變了） */
function closeNoti(instant,to){
  if(!notiOpen)return;if(!instant)Sfx.play("back");   /* 從工具列換分頁（to）時換頁音先響，這裡不會蓋過 */
  if(todayOpen)closeToday(true);notiOpen=false;NOTI.pop=false;dkUndo=null;Back.closed("noti");$("#notiBtn").setAttribute("aria-pressed","false");
  if(to&&SECS.includes(to))curSec=to;
  hsBar();renderTabbar();secSwap("noti",curSec,-1,instant===true);
}
/* 明日卡片：行事曆選到那一天（換到那個月：要讀那個月的活動、會議，calLoad），捲到行事曆 */
function notiOpenDay(d){
  const m=d.slice(0,7);if(m!==NOTI.month){NOTI.month=m;calLoad(NOTI)}calDay(NOTI,d);renderNoti();
  const c=$("#notiPage .cal");if(c)c.scrollIntoView({block:"start",behavior:reduceMotion()?"auto":"smooth"});
}
/* 今日／明日卡片的按壓回饋：按下微縮到 .97、放開略帶回彈地彈回（只動 transform） */
function ndPress(el,down){
  if(!el||reduceMotion())return;
  const cur=getComputedStyle(el).transform;el._pa&&el._pa.cancel();
  el._pa=el.animate([{transform:cur==="none"?"scale(1)":cur},{transform:down?"scale(.97)":"scale(1)"}],down?{duration:140,easing:MO.out,fill:"forwards"}:{duration:520,easing:"cubic-bezier(.3,1.6,.5,1)",fill:"forwards"});
  if(!down){const a=el._pa;a.finished.then(()=>{if(el._pa===a){a.cancel();el._pa=null}}).catch(()=>{})}
}
document.addEventListener("pointerdown",e=>{const c=e.target.closest&&e.target.closest(".nd-card");if(!c||e.button>0)return;ndPress(c,true);
  const up=()=>{ndPress(c,false);removeEventListener("pointerup",up);removeEventListener("pointercancel",up)};addEventListener("pointerup",up);addEventListener("pointercancel",up)});
document.addEventListener("click",e=>{
  const t=e.target;if(!t.closest)return;
  if(t.closest("#notiBtn")){notiOpen?closeNoti():openNoti();return}
  if(!notiOpen||!t.closest("#notiPage"))return;
  const card=t.closest(".nd-card");if(card){const d=card.dataset.nopen;if(card.classList.contains("today")){setTimeout(()=>{if(notiOpen)openToday(card)},reduceMotion()?0:140);return}setTimeout(()=>{if(notiOpen)notiOpenDay(d)},reduceMotion()?0:200);return}   /* 等回彈跑一段再換內容，按壓動畫不會被重畫打斷 */
  const g=t.closest("[data-dkgo]");if(g){const c=$('#notiDeck .dk-card[data-i="0"]');if(c)dkFly(c,g.dataset.dkgo);return}
  if(t.closest("[data-dkundo]")){notiUndo();return}
});
/* Esc＝回到原分頁（今日層、月份選單開著時先關那一層，在它們自己的監聽） */
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&notiOpen&&!todayOpen&&!$("#dlg").open&&!setOpen&&!(typeof rptOpen!=="undefined"&&rptOpen)){e.preventDefault();closeNoti()}});


document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("[data-tdclose]"))closeToday()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&todayOpen){e.preventDefault();e.stopImmediatePropagation();closeToday()}},true);
