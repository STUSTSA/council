/* 核心｜整體重繪＋區塊切換 */
let openWeeks=null,newWeekId=null,prevDone=null,editing=false,dirty=false,snapshot="",keepIds=new Set();

/* ---------- timeline math ---------- */
/* 甘特圖看的範圍（2026-11-05）：「全部」＝設定的時間軸（state.range）；「上學期」＝8 月～隔年 1 月；「下學期」＝2 月～7 月。
   學年從開學日（termCfg().termStart，秘書處統一設定）的年份算，沒填就用今天（8 月起算新學年）。
   預設跟著秘書處設定頁「學年」選的學期（termCfg().semester）；在甘特圖上臨時切換（ganttTerm）只影響畫面、不存，重新整理回到預設。 */
let ganttTerm=null;
const gTermNow=()=>ganttTerm||termCfg().semester||"all";
function termYear(){const s=termCfg().termStart||today(),y=+s.slice(0,4),m=+s.slice(5,7);return m>=8?y:y-1}
function viewRange(){
  const y=termYear();
  const g=gTermNow();
  if(g==="up")return {start:`${y}-08`,end:`${y+1}-01`};
  if(g==="down")return {start:`${y+1}-02`,end:`${y+1}-07`};
  return state.range;
}
function rangeMs(){const r=viewRange(),s=pd(r.start+"-01"),e=pd(r.end+"-01");e.setMonth(e.getMonth()+1);return[s.getTime(),e.getTime()]}
function pos(date){const[s,e]=rangeMs();return clamp((pd(date).getTime()-s)/(e-s)*100)}
function months(){const r=viewRange(),out=[],d=pd(r.start+"-01"),end=pd(r.end+"-01");while(d<=end){out.push(new Date(d));d.setMonth(d.getMonth()+1)}return out}

/* 單卡編輯（2026-11-06 使用者：頁首的大「編輯」拿掉，全部改成卡片自己的小「編輯」鈕；登入狀態才看得到，即時回報要展開才看得到）
   cardEdit＝正在編輯的那一張，一次只能一張：
     "e:id" 即時回報（含完成紀錄裡的）、"i:id" 議題（含結案的）、"s:區名" 整區（follow 會長室追蹤、meetedit 秘書處會議編輯、gantt 甘特圖時間軸）。
   editing＝有一張在編輯。那張卡片（或那一區）加 .sec-edit，裡面的 .edit-only 工具才出現（board.css 開頭），最下面一條「取消｜儲存」（editBarHTML）。
   「儲存」＝saveFlow（存整份資料、寫一筆編輯紀錄），「取消」＝還原到開始編輯前（snapshot）。
   編輯鈕（.card-edit-btn）一律畫出來，登入（body.authed）而且沒有別張在編輯時才顯示（board.css「單卡編輯」段）。 */
let cardEdit="";
const cardEd=(t,id)=>editing&&cardEdit===`${t}:${id}`;
const secEd=k=>editing&&cardEdit==="s:"+k;
/* 唯讀檢視（DESIGN-next 第十四節）：可編輯的單位按標題列的眼睛鈕，看沒有權限的人看到的樣子。只是這個畫面的切換（不存、不影響資料與權限）；
   開著的時候 canEdit 為假（編輯鈕、新增、拖曳、勾選都沒有），標「唯讀」，通知鈕與設定鍵不出現。
   deptCan＝可編輯的單位（登入、看板沒有被鎖、不是不能寫的託管版；離線暫時不能存不算）；deptRO＝要標「唯讀」：沒有編輯權限的單位（boardLocked）或唯讀檢視中。
   GitHub 模式還沒登入的人不算沒有權限（登入就能編輯），不標唯讀 */
let roView=false;
const deptCan=()=>loggedIn()&&!boardLocked()&&!(HOSTED&&!canWrite);
const deptRO=()=>boardLocked()||roView;
const canEdit=()=>loggedIn()&&!readOnly()&&!roView;
document.addEventListener("click",e=>{if(!e.target.closest||!e.target.closest("#peekBtn"))return;
  if(editing||!deptCan())return;   /* 編輯中不切換（先存好或取消） */
  roView=!roView;render()});
/* 從瀏覽紀錄回來（bfcache）：唯讀檢視重設為關（跟重新開頁一樣） */
addEventListener("pageshow",e=>{if(e.persisted&&roView){roView=false;render()}});
const editBtnHTML=key=>boardLocked()?"":`<button type="button" class="icon card-edit-btn" data-edit="${esc(key)}">${ico("edit")}編輯</button>`;
const editBarHTML=()=>`<div class="card-edbar"><button type="button" data-edcancel>取消</button><button type="button" class="primary" data-edsave>${cloudOn()?"儲存並同步":"儲存"}</button></div>`;
/* 開始編輯 key 那一張：then＝開始後馬上要做的事（例如新增一筆空白的、打開名稱欄） */
/* 02D：firestore 模式整區編輯的限制——甘特圖時間軸、會長室追蹤、文件連結寫的是部門設定（部門管理員以上）；
   秘書處會議編輯（2026-11-20 起 firestore 模式也開放）：秘書處的編輯者以上（會長室有沒有開放、能改哪些由 meeting.js 與規則判斷） */
const fsSecOk=key=>!fsMode()||!/^s:/.test(key)||(key==="s:meetedit"?fsWriter():fsAdmin());
async function startEdit(key,then){
  if(roView)return false;   /* 唯讀檢視中不開始編輯（圓鈕、編輯鈕正在消失的途中也一樣） */
  if(editing||kpBusy()||!fsSecOk(key)||!(await ensureLogin()))return false;
  morph(()=>{editing=true;cardEdit=key;dirty=false;evFld=null;ifFld=null;kpSt=null;snapshot=JSON.stringify(state);keepIds=new Set(state.issues.filter(i=>!i.doneAt).map(i=>i.id));if(then)then();
    /* 即時回報卡（進行中、不是秘書處的會議卡）：原位編輯器，記下開始前的內容（新增的卡片＝null） */
    const ev=key[0]==="e"&&state.events.find(e=>e.id===key.slice(2)),was=ev&&JSON.parse(snapshot).events.find(e=>e.id===ev.id);
    kp=ev&&!ev.doneAt?{id:ev.id,before:was?JSON.stringify(was):null}:null;render()});
  if(kp)staffPplLoad();   /* 專員欄的選項（firestore 模式；team.js） */
  const box=document.querySelector(`[data-edbox="${CSS.escape(key)}"]`);   /* 剛打開的那張，編輯工具淡入（board.css「編輯／檢視切換時的動畫」段的 .sec-anim） */
  if(box&&!reduceMotion()){box.classList.remove("sec-anim");void box.offsetWidth;box.classList.add("sec-anim");clearTimeout(box._sa);box._sa=setTimeout(()=>box.classList.remove("sec-anim"),900)}
  return true;
}
function cancelEdit(){morph(()=>{if(CFG.meeting)mtDiscard();if(dirty)state=normalize(JSON.parse(snapshot));editing=false;cardEdit="";dirty=false;evFld=null;ifFld=null;kp=null;render()})}
/* 編輯中按卡片上的按鈕不讓輸入欄失焦（DESIGN-next 第五節）：游標在編輯中卡片（.sec-edit）的文字欄時，按下同一張卡片上的按鈕、核取框、勾選膠囊，
   那一下不搶焦點（擋 mousedown 的預設動作；觸控時瀏覽器補發的 mousedown 也一樣），點擊照常觸發，手機鍵盤不會收起再彈出。
   label（專員、標籤的勾選膠囊，核取框外面那一圈）：mousedown 擋得住，但放開後 label 的 click 會把焦點移到它的核取框，所以按下時記下那一欄（keepFld），
   click／change 處理完放回去——只在焦點被移到那個核取框（或沒有焦點）時放；處理函式自己把游標移到別欄的（逐行內容的核取框＝到那一行）照它的。
   自製下拉（.csel）要把焦點移到選單、包著文字欄的 label 點了本來就是去那一欄，這兩種照舊。拖曳排序只在沒有編輯時才有，不受影響 */
let keepFld=null;
const keepBack=()=>{const k=keepFld;if(!k||performance.now()-k.at>1500)return;const f=document.activeElement;
  if(k.a.isConnected&&f!==k.a&&(!f||f===document.body||f===k.c))k.a.focus({preventScroll:true})};
document.addEventListener("mousedown",e=>{
  keepFld=null;
  const a=document.activeElement,t=e.target;if(!a||!t.closest||e.button>0)return;
  if(!(a.isContentEditable||a.matches("textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden])")))return;
  const box=a.closest(".sec-edit");if(!box||!box.contains(t)||t.closest(".csel"))return;
  const hit=t.closest("button,[role=button],label,input[type=checkbox],input[type=radio]");if(!hit||!box.contains(hit))return;
  if(hit.tagName==="LABEL"&&hit.control&&!/^(checkbox|radio)$/.test(hit.control.type))return;
  e.preventDefault();
  if(hit.tagName==="LABEL"&&hit.control){keepFld={a,c:hit.control,at:performance.now()};
    if(a.selectionStart!==a.selectionEnd&&a.setSelectionRange)try{a.setSelectionRange(a.selectionEnd,a.selectionEnd)}catch(_){}}   /* 文字欄有選取範圍時瀏覽器不讓 label 的點擊勾到核取框（新卡片名稱整段選取時點負責人沒反應；ui-05 審查 P2-1）：收成游標 */
});
document.addEventListener("click",()=>{const k=keepFld;if(!k)return;keepBack();clearTimeout(k.t);k.t=setTimeout(()=>{keepBack();if(keepFld===k)keepFld=null},0)});
document.addEventListener("change",keepBack);
/* 固定在頁面上的整區（追蹤、會議編輯、甘特圖時間軸）：編輯中加 .sec-edit、最下面補上「取消｜儲存」；卡片本身（即時回報、議題、完成紀錄）每次重畫時自己帶 */
function renderSecEdit(){
  document.body.classList.toggle("authed",canEdit());
  if(fsMode())document.querySelectorAll('[data-edit="s:follow"],[data-edit="s:docs"]').forEach(b=>{b.hidden=!fsSecOk(b.dataset.edit)});   /* 甘特圖在 views.js、會議編輯在 meeting.js */
  document.querySelectorAll("[data-edit]:not(:has(.ico))").forEach(b=>b.insertAdjacentHTML("afterbegin",ico("edit")));   /* 骨架（shell.js）裡的編輯鈕載入時還沒有 icon 可用，第一次畫時補上 */
  document.querySelectorAll("[data-edbox^='s:']").forEach(b=>{const on=editing&&cardEdit===b.dataset.edbox,bar=b.querySelector(":scope>.card-edbar");
    b.classList.toggle("sec-edit",on);if(on&&!bar)b.insertAdjacentHTML("beforeend",editBarHTML());else if(!on&&bar)bar.remove()});
}

const activeIssues=()=>state.issues.filter(i=>!i.doneAt||(editing&&keepIds.has(i.id)));
const doneIssues=()=>state.issues.filter(i=>i.doneAt&&!(editing&&keepIds.has(i.id))).sort((a,b)=>(b.doneAt||"").localeCompare(a.doneAt||""));

/* ---------- render ---------- */
let rendering=false;
function render(){
  if(rendering)return;rendering=true;
  const flip=Anim.capture(),kf=kpFocusGet();   /* 原位編輯器裡的游標：重畫後放回原位（live.js） */   /* 動畫規則 2：data-flip 容器裡的項目，render 前後比對位置（anim.js） */
  try{
    document.body.classList.toggle("edit",editing);
    document.body.classList.toggle("locked",boardLocked());
    renderHeader();renderTabbar();renderSections();renderSecEdit();renderWeeks();renderGantt();renderEvents();renderCards();renderDone();renderActivity();renderFollows();renderDocs();renderMeet();renderGrant();renderBooking();renderAttendance();layoutAll();flowWatch();
  }finally{rendering=false}
  kpFitAll();kpFocusSet(kf);
  Anim.play(flip);Anim.syncPings();
}

/* ---------- 區塊切換：工具列的分頁 ----------
   手機、桌面都一次只顯示一區（預設第一個分頁）；換分頁的動畫見下面的 setSection */
const SECS=["live","progress","done","ext"].filter(secTab);
let curSec=(SECS.includes(appStartSec)&&appStartSec)||SECS[0]||"live",secTok=0;   /* appStartSec：app.js 留下的初始區塊（現在都是空的，從第一個區塊開始） */
const isPhone=()=>matchMedia("(max-width:640px)").matches;
/* 畫面上那一區：通知與行事曆（notify.js 的 notiOpen）開著時是它，不然是工具列選到的分頁 */
const secShown=()=>notiOpen?"noti":curSec;
function renderSections(){const k=secShown();document.querySelectorAll(".layout>.sgroup").forEach(g=>g.classList.toggle("cur",g.dataset.sec===k))}
let progOpen=null;   /* 進度：甘特圖／議題詳情切換（views.js 的 progShow）。即時回報、完成紀錄的左右兩欄在 live.js（lvWide） */
/* 換分頁（DESIGN-next 第一節「部門內一次只顯示一區」、第五節「部門內換分頁」）：手機、桌面都一次只顯示一區。
   舊內容往一邊退、新內容從另一邊進，方向跟工具列一致：桌面（左側直排）上下、900px 以下（底部橫排）左右；往工具列後面的分頁＝舊的往上／左退、新的從下／右進，往前反過來。
   舊區塊留成一層（.sg-out：原地絕對定位、不能點）淡出退開，結束後拿掉；新區塊裡的每一塊（面板）帶柔回彈滑進來，每塊錯開 30ms。
   標題列、搜尋列、工具列不動（只有鏡片滑過去）。只動 transform／opacity；關掉動態、背景分頁、instant 時直接換 */
const SEC_IN="cubic-bezier(.25,1.12,.4,1)";
function secFxStop(groups){groups.forEach(g=>{g.getAnimations().forEach(a=>a.cancel());[...g.children].forEach(c=>c.getAnimations().forEach(a=>{if(a.id==="sec-in")a.cancel()}));
  if(g.classList.contains("sg-out")){g.classList.remove("sg-out");g.style.top=g.style.left=g.style.width="";g.inert=false}})}
function setSection(k,{instant}={}){
  if(!SECS.includes(k)||k===curSec)return;
  const prev=curSec,ord=TABS().map(t=>t[0]),dir=ord.indexOf(k)>=ord.indexOf(prev)?1:-1;
  curSec=k;homeSync();if(HS.q)hsClear();hsBar();renderTabbar();   /* 換分頁：搜尋清掉；會長室、秘書處自己的分頁沒有搜尋列（search.js） */
  secSwap(prev,k,dir,instant);
}
/* 從 prev 那一區換到 k 那一區（dir：1＝往工具列後面、-1＝往前；通知與行事曆 noti 也用這一套，notify.js 的 openNoti／closeNoti） */
function secSwap(prev,k,dir,instant){
  const tok=++secTok,lay=document.querySelector(".layout"),sc=$("#pageMain");
  const groups=[...lay.querySelectorAll(":scope>.sgroup")],out=groups.find(g=>g.dataset.sec===prev),inn=groups.find(g=>g.dataset.sec===k);
  /* 區塊頂端已經捲到畫面外時，捲回來讓新區塊從頭看 */
  const toTop=()=>{const d=lay.getBoundingClientRect().top-sc.getBoundingClientRect().top-12;if(d<0)sc.scrollTop+=d};
  secFxStop(groups);
  const r0=out&&out.offsetParent?out.getBoundingClientRect():null;
  renderSections();layoutAll();toTop();
  if(instant||reduceMotion()||document.hidden||!r0||!inn)return;
  const [dx,dy]=isRail()?[0,48*dir]:[60*dir,0],lr=lay.getBoundingClientRect();
  /* 舊的：原地留一層，往反方向退出去 */
  out.classList.add("sg-out");out.inert=true;
  Object.assign(out.style,{top:(r0.top-lr.top)+"px",left:(r0.left-lr.left)+"px",width:r0.width+"px"});
  out.animate([{opacity:1,transform:"none"},{opacity:0,transform:`translate(${-dx}px,${-dy}px)`}],{duration:MO.base,easing:MO.in,fill:"forwards"})
    .finished.catch(()=>{}).then(()=>{if(tok===secTok)secFxStop([out])});
  /* 新的：一塊一塊從另一邊滑進來（淡入的終點是元件自己的透明度） */
  [...inn.children].filter(el=>el.offsetParent).slice(0,16).forEach((el,i)=>{
    el.animate([{opacity:0},{}],{id:"sec-in",duration:180,delay:i*30,easing:"ease-out",fill:"backwards"});
    el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:"none"}],{id:"sec-in",duration:MO.layout,delay:i*30,easing:SEC_IN,fill:"backwards"});
  });
}
