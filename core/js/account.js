/* 核心｜Google 登入、QR 加入、系統管理（02B，docs/architecture/invitations-roles-audit.md 第 9 節）
   - 只在 Firebase 設定好（dept/config.js 的 firebase.projectId）時作用；部門是 source:"firestore" 的看板才在設定頁顯示登入與帳號。
     網址帶 #join=（QR 邀請）時任何部門的看板都會走加入流程（角色寫進新資料庫，部門切換後生效）。
   - 資料操作都在 fb-account.js（ES module，第一次用到才載入，其他部門完全不載入 Firebase）。授權一律由 Security Rules 判斷，畫面只負責顯示。
   - 介面不放教學說明文字（2026-11-13 使用者）：只有標題、狀態、按鈕與錯誤訊息。 */
const FB_ON=!!(CFG.firebase&&CFG.firebase.projectId);
const JOIN_KEY="workboard:join";
/* QR 權杖：一讀到就從網址列拿掉（不留在瀏覽紀錄、截圖），暫存在這個分頁的 sessionStorage，加入完成或失效就清掉 */
(function joinCapture(){
  const m=location.hash.match(/(?:^#|&)join=([A-Za-z0-9_-]{20,64})/);if(!m)return;
  try{sessionStorage.setItem(JOIN_KEY,m[1])}catch(_){}
  history.replaceState(history.state,"",location.pathname+location.search);
})();
const joinToken=()=>{try{return sessionStorage.getItem(JOIN_KEY)||""}catch(_){return ""}};
const joinClear=()=>{try{sessionStorage.removeItem(JOIN_KEY)}catch(_){}};
/* 02D D-a：凍結中的部門也用 Google 登入（總管理員在這裡進系統管理 → 匯入；看板本身照舊唯讀、不讀 Firestore） */
const acctOn=()=>FB_ON&&(storeSource()==="firestore"||storeSource()==="frozen");
/* 角色的畫面稱呼（資料裡的角色值仍是 admin／editor）：部門管理員依部門稱呼——預設「部長」，設定 adminTitle 的部門照設定（秘書處「處長」、會長室「會長／副會長」，dept/config.js）；
   表單的下拉選單還沒選部門，用 ROLE_OPT 的合併稱呼 */
const roleT=(r,d)=>r==="admin"?((BOARD_DEPTS.find(x=>x.id===d)||{}).adminTitle||"部長"):r==="editor"?"編輯者":r;
const ROLE_OPT=[["editor","編輯者"],["admin","部長／處長／會長"]];
/* 06 申請的位階：部員、次長（兩者權限都是編輯者，次長只是申請上的頭銜）、部長（管理員，只有總管理員能核准） */
const RANK_OPT=[["member","部員"],["deputy","次長"],["minister","部長／處長／會長"]];
const rankT=q=>q.rank==="deputy"?"次長":q.rank==="member"?"部員":roleT(q.role,q.deptId);
const deptNameOf=id=>(BOARD_DEPTS.find(d=>d.id===id)||{}).name||id;
const acctDeptOpts=()=>BOARD_DEPTS.map(d=>[d.id,d.name]);
const hm=ms=>{if(!ms)return "";const d=new Date(ms),p=n=>String(n).padStart(2,"0");return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`};
const mmss=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`};
/* 內建瀏覽器（LINE、臉書、IG、微信、Android WebView 與用 Google 搜尋／Lens 開的頁面）：Google 不讓這類環境登入，要先換到瀏覽器 */
/* 我們自己的安卓 App（tools/android，window.CouncilApp）不算：它的登入由 App 轉去 Chrome 完成（fb-account.js 的 signIn） */
const inAppBrowser=()=>!window.CouncilApp&&/\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|; wv\)|\bGSA\//i.test(navigator.userAgent);

/* ---------- 登入狀態 ----------
   acct.user＝{uid,email,name}｜null；acct.roles＝自己的 roles 文件（即時監聽，角色被改或撤掉時畫面立刻跟著變）。 */
const acct={ready:false,user:null,roles:null,proj:false,err:"",names:{}};
let acctMod=null,acctRolesOff=null,acctUid=undefined;
function acctLoad(){
  if(!acctMod)acctMod=storeModLoad("fb-account.js","board-account-ready","BoardAccount").then(A=>A.init(CFG.firebase));   /* 載入方式同 store.js */
  return acctMod;
}
/* 記下這台裝置上「你有部門角色」的部門代號（只存代號、不是機密）：首頁的「預約會長」靠它進你的部門行事曆（home.js）。總管理員與沒有角色的不記 */
function acctMyDept(r){try{if(r&&r.depts&&r.depts[CFG.deptId]&&CFG.deptId!=="president")localStorage.setItem("stustsa-mydept",CFG.deptId)}catch(_){}}
const acctSuper=()=>!!(acct.roles&&acct.roles.super);
const acctDepts=()=>(acct.roles&&acct.roles.depts)||{};
/* 02D：firestore 模式的看板跟著角色切換可編輯／唯讀（store.js 的 fsWriter），角色或登入狀態一變就重畫看板 */
let acctCanW="",acctNameEd=false;   /* acctNameEd：帳號頁的名稱正在就地編輯，不重畫（游標才不會跳） */
function acctChanged(){
  if(typeof renderSettings==="function")renderSettings();
  if(typeof hubNow!=="undefined"&&hubNow&&!hubNow.inFlow&&!acctNameEd)hubNow.draw();   /* 帳號頁最上面的名稱、角色跟著即時變（角色被改或撤掉時） */
  const w=`${acct.user&&acct.user.uid}|${fsWriter()}|${fsAdmin()}|${fsDelOk()}|${acctSuper()}|${fsProj()}`;if(w!==acctCanW){acctCanW=w;if(fsMode()&&typeof render==="function")render();}
}
/* 登入狀態與第一次的角色都讀到了（boot.js 等它再決定要不要提示唯讀） */
let acctKnownOk;const acctKnown=new Promise(r=>acctKnownOk=r);
/* firestore 模式畫面上的名字（工作報告封面、儲存者）：profiles 的名稱，沒有就用 Google 名稱 */
const acctName=()=>acct.user?(acct.names[acct.user.uid]||acct.user.name||acct.user.email||""):"";
async function acctStart(){
  if(!FB_ON||!(acctOn()||joinToken())){acctKnownOk();return}
  let A;try{A=await acctLoad()}catch(_){acctKnownOk();return}
  A.onUser(u=>{
    const first=acctUid===undefined,uid=u?u.uid:null;
    if(!u)acctKnownOk();
    if(uid===acctUid){acct.user=u;return}
    const prevUid=acctUid;
    acctUid=uid;acct.user=u;acct.roles=null;acct.proj=false;acct.ready=true;
    if(prevUid&&typeof storeFsGet==="function")storeFsGet().then(fs=>fs.clearCache()).then(w=>{if(w)location.reload()}).catch(()=>{});   /* 登出、換帳號：這台裝置上存的讀取結果（fs-cache.js）清掉，不留給下一個人 */
    if(acctRolesOff){acctRolesOff();acctRolesOff=null}
    if(!first)acctCloseAdmin();   /* 登出、換帳號：已讀到的人員、紀錄這些資料不能留在畫面上 */
    if(!first&&typeof fwCache!=="undefined"){fwCache.clear();if(typeof MT!=="undefined")MT.at=0}   /* 02D D-b：別的部門讀到的內容跟著登入身分（新資料庫的部門要登入才讀得到），換身分就重讀 */
    /* 先等 users／profiles 補建完（這時 Firestore 已經換成這個帳號的憑證）再監聽角色、讀名稱 */
    if(u)A.ensured().then(()=>{if(acctUid!==uid)return;const offR=A.onRoles(r=>{if(acctUid!==uid)return;const was=acctSuper();acct.roles=r;acctMyDept(r);A.rosterSelf(r).catch(()=>{});if(was&&!acctSuper())acctCloseAdmin();acctChanged();acctKnownOk()}),
      offP=A.onProjectGrant(g=>{if(acctUid!==uid)return;acct.proj=g;acctChanged()});   /* 專案權限：撤銷時畫面立刻變回唯讀 */
      acctRolesOff=()=>{offR();offP()};return A.profiles().then(m=>{acct.names=m;acctChanged()})}).catch(()=>{});
    acctChanged();
    if(!first&&fsMode())acctReload();   /* 登入、登出、換帳號：重新讀這個部門（boot.js 第一次讀之前已經等過登入狀態；凍結中的部門照舊讀資料檔） */
    if(joinToken())joinFlow();   /* 沒登入時 joinFlow 先要求登入 */
  });
}
/* 先發出的讀取比較晚回來時不能蓋掉後來的（快速登入又登出） */
let acctReloadSeq=0;
function acctReload(){
  const my=++acctReloadSeq;
  storeFsLoad().then(r=>{if(my!==acctReloadSeq)return;storeFsErr=null;storeFsUse(r);render()})
    .catch(e=>{if(my!==acctReloadSeq)return;storeFsErr=e;storeFsBase=null;state=normalize({});render();if(e&&e.code==="permission-denied")toast("這個部門要登入才能看")});
}
/* 收掉帳號與系統管理的面板（登出、換帳號、失去總管理員時） */
function acctCloseAdmin(){if(typeof setOpen!=="undefined"&&setOpen&&(acctPanels.length||paneKey==="council"||paneKey==="acct"||subOpen))paneClose().catch(()=>{})}
const SIGNIN_ERR={"auth/unauthorized-domain":"這個網址還沒開放登入","auth/network-request-failed":"沒有連上網路，稍後再試","auth/operation-not-allowed":"還沒開放 Google 登入","auth/user-disabled":"這個帳號已停用"};
async function acctSignIn(){
  const A=await acctLoad();acct.err="";acctChanged();
  const c=await A.signIn();
  if(c&&c!=="redirect"&&!/popup-closed-by-user|cancelled-popup-request/.test(c)){acct.err=SIGNIN_ERR[c]||`登入失敗（${c}）`;acctChanged()}
  return c==="redirect"?"redirect":!c;   /* true＝登入了；"redirect"＝轉去 Google 登入頁；false＝取消或失敗 */
}
async function acctSignOut(){
  const A=await acctLoad();await A.signOut();
  if(subOpen||paneKey)await paneClose().catch(()=>{});
  toast("已登出");
}
function acctCopyUrl(){
  const t=joinToken(),u=location.origin+location.pathname+location.search+(t?`#join=${t}`:"");
  (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>toast("已複製網址"),()=>toast("複製失敗"));
}

/* ---------- 設定頁（firestore 模式；nav.js 的 settingsInner 交給這裡） ---------- */
function acctGateHTML(){
  const t=storeSource()==="frozen"?`<b>暫停編輯</b>`:"";   /* 凍結中：「暫停編輯」＋登入鈕；標題下不放說明句（ui-08） */
  if(inAppBrowser())return `<div class="set-gate"><span class="set-gate-ico">${GATE_LOCK}</span>${t||"<b>用瀏覽器開啟</b>"}<button type="button" class="primary" data-fb-copy>複製網址</button></div>`;
  return `<div class="set-gate"><button type="button" class="set-gate-ico" data-fb-login aria-label="用 Google 登入">${GATE_LOCK}</button>${t||"<b>未登入</b>"}<button type="button" class="primary" data-fb-login>用 Google 登入</button>${acct.err?`<p class="acct-err" role="alert">${esc(acct.err)}</p>`:""}</div>`;
}
function acctSettingsInner(){
  if(!FB_ON)return lookSec();
  if(!acct.ready)return `<div class="set-gate"><span class="set-gate-ico">${GATE_LOCK}</span></div>`+lookSec();
  if(!acct.user)return acctGateHTML()+devSec()+refreshSec()+lookSec();   
  /* 02D：有這個部門角色的人多報告、編輯紀錄（版本歷史，team.js 的 fsLoadLog）、標籤；備份（只有匯出）放在系統管理裡、只有總管理員看得到；學年與開學日（只有總管理員能寫 org/config）、人員（舊身分）不出現 */
  const ed=fsWriter()?setSec(setRow("labels","tag","標籤")):"";
  /* 「帳號」列只寫「帳號」：名稱、信箱、角色畫在帳號頁最上面（acctHub 的 head；ui-08 列下面不放小字） */
  /* 06 登入了但還沒有任何部門角色：設定最上面一列「申請編輯權限」，點進帳號頁（有說明與申請）；看板內容照常可看，不強制跳頁 */
  const apply=!acctSuper()&&!Object.keys(acctDepts()).length?setSec(setRow("apply","edit","申請編輯權限")):"";
  return apply+(fsWriter()?setSec(setRow("report","doc","工作報告")+setRow("log","history","編輯紀錄")):"")
    +setSec(setRow("acct","people","帳號"))+ed
    +(acctSuper()?setSec(setRow("council","flag","系統管理")):"")
    +devSec()   /* 03 F4：有東西可以做（安裝、加入主畫面）才出現（nav.js） */
    +refreshSec()
    +(fsWriter()?tourSec():"")   /* 重看新手引導（nav.js、tour.js）：只給能編輯的人 */
    +lookSec();   /* 外觀：獨立一列放最後（2026-11-22 起不再接在帳號頁下面） */
}
/* 強制刷新（2026-11-23）：平常用這台裝置存的讀取結果（fs-cache.js）省讀取量；趕資料（催交、開會前）按一下就作廢本裝置的快取、立刻重讀目前這個部門。
   只立刻讀目前的部門（一次讀取量＝這個部門的文件數）；別的部門、行事曆、名單下次用到時才重讀。有未儲存的修改時不動，免得蓋掉。 */
const refreshSec=()=>setSec(`<button type="button" class="set-row" data-fb-refresh><span class="sr-ico">${ico("refresh","sr-spin")}</span><span class="sr-t">強制刷新</span></button>`);
let acctRefreshing=false;
async function acctRefresh(btn){
  if(acctRefreshing||!fsMode())return;
  if(editing||dirty){toast("有還沒儲存的修改，先儲存或取消再刷新");return}
  acctRefreshing=true;btn.setAttribute("aria-busy","true");const t=btn.querySelector(".sr-t");t.textContent="更新中…";
  try{
    const fs=await storeFsGet();await fs.dropCache();
    if(typeof fwCache!=="undefined")fwCache.clear();if(typeof MT!=="undefined")MT.at=0;
    const r=await storeFsLoad(true);storeFsErr=null;storeFsUse(r);render();
    toast("已更新為最新內容");
  }catch(e){fsReadErr("強制刷新",e);toast("更新失敗，請稍後再試")}
  finally{acctRefreshing=false;btn.removeAttribute("aria-busy");t.textContent="強制刷新"}
}
/* 這些列在 firestore 模式下不用舊的看板登入（nav.js 的點擊處理看 ACCT_FLOWS） */
const ACCT_FLOWS={
  acct:()=>acctHub(),
  apply:()=>acctHub(),
  council:()=>councilHub(),
};
document.addEventListener("click",async e=>{
  if(!e.target.closest)return;
  if(e.target.closest("#setOv [data-fb-login]")){await acctSignIn();return}
  if(e.target.closest("#setOv [data-fb-copy]")){acctCopyUrl();return}
  const rf=e.target.closest("#setOv [data-fb-refresh]");if(rf){acctRefresh(rf);return}
  const nm=e.target.closest("#setOv [data-acct-name]");if(nm)acctNameEdit(nm);
});
document.addEventListener("keydown",e=>{
  const nm=e.target.closest&&e.target.closest("#setOv [data-acct-name]");
  if(nm&&e.target===nm&&(e.key==="Enter"||e.key===" ")){e.preventDefault();acctNameEdit(nm)}
});

/* ---------- 面板（畫在設定頁右側面板／手機子頁，跟合併頁同一個位置）----------
   面板可以疊（人員 → 某人的權限歷史）：只顯示最上面那一層。acctPanelEnd(all)：nav.js 的 paneDismiss 呼叫，
   返回、Esc 一次收一層；換項目、關設定（all）全部收掉。
   面板裡按鈕打開的表單（產生 QR、授予權限、新增部門）畫在同一個位置（#dlg 接在面板後面）：最上面那層換掉（疊一層、收掉）時一律當成取消收掉
   （dialog.js 的 dlgPaneCancel），不會接在別的面板或合併頁下面、也不會被按到「確定」（ui-10）；已經按了確定、還在淡出的照確定完成，
   寫入晚於面板收掉時只寫、不再重讀名單（各面板檢查 p.alive） */
const acctPanels=[];
let acctPanelEnd=null;
const acctPanelSync=()=>{acctPanelEnd=acctPanels.length?all=>(all?[...acctPanels].reverse():[acctPanels[acctPanels.length-1]]).forEach(p=>all||!p.up?p.end():p.up()):null};
function acctPanel(title,draw){
  return new Promise(res=>{
    const host=setPaneHost();if(!host)return res();
    const prev=acctPanels[acctPanels.length-1],depth=acctPanels.length;
    const box=document.createElement("div");box.className="set-hub acct-panel";
    dlgPaneCancel();if(prev){prev.box.hidden=true;prev.box.after(box)}else host.prepend(box);
    let alive=true;const timers=[],ends=[];
    const p={box,get alive(){return alive},every(fn,ms){timers.push(setInterval(()=>alive&&fn(),ms))},onEnd(fn){ends.push(fn)},
      head:(extra="")=>`${panelHead(title)}${extra}`,
      set html(h){morphTo(box,h)}};   /* 面板內容：原位更新（morph.js），QR 倒數、名單重畫時沒變的節點留著 */
    /* 面板裡的下一層（人員 → 某個人、匯入 → 某個部門）：p.sub(true,back) 登記成一層（Back 疊一筆），標題列左上的「上一頁」、系統返回、Esc 都先退這一層（back），
       不在頁面裡另放「返回」鈕；p.sub(false) 收掉登記。back 不想退（流程進行中）時自己再呼叫 p.sub(true,back) 補回 */
    let subName="",subBack=null;
    p.sub=(on,back)=>{if(on){subBack=back;if(!subName){subName="acs"+depth;Back.opened(subName,()=>subBack&&subBack())}}else if(subName){const n=subName;subName="";subBack=null;Back.closed(n)}};
    Object.defineProperty(p,"up",{get:()=>subName?()=>subBack&&subBack():null});
    p.end=()=>{if(!alive)return;p.sub(false);alive=false;dlgPaneCancel();timers.forEach(clearInterval);ends.forEach(f=>{try{f()}catch(_){}});
      acctPanels.splice(acctPanels.indexOf(p),1);box.remove();if(prev&&prev.alive)prev.box.hidden=false;
      if(depth)Back.closed("acct"+depth);acctPanelSync();res()};
    box.innerHTML=`${panelHead(title)}<p class="set-p acct-empty" role="status">讀取中…</p>`;   /* 第一次畫出來之前（讀名單、申請要等）：先放標題與「讀取中…」，不留一片空白 */
    acctPanels.push(p);acctPanelSync();
    if(depth)Back.opened("acct"+depth,()=>p.end());
    Promise.resolve().then(()=>draw(p)).catch(err=>{console.error(err);if(alive)box.insertAdjacentHTML("beforeend",`<p class="acct-err" role="alert">讀取失敗</p>`)});
  });
}
const acctErr=e=>({"permission-denied":"沒有權限","inactive":"已經處理過了","same":"已經是這個角色","pending":"這個部門已經有一筆待審的申請","changed":"這筆申請剛被改過，請再看一次","unavailable":"沒有連上網路，稍後再試","failed-precondition":"資料剛被別人改過，請再試一次","aborted":"資料剛被別人改過，請再試一次"}[e&&e.code]||`失敗（${(e&&e.code)||"error"}）`);
/* 帳號相關的寫入一律經過這裡：處理中防呆（busyRun）＋成功、失敗的提示 */
async function acctTry(fn,ok){try{await busyRun(fn);if(ok)toast(ok);return true}catch(e){toast(acctErr(e));return false}}

/* ---------- 帳號（自己）：最上面一張個人卡（名稱可就地改、信箱、角色）；申請編輯權限、我的申請、登出（外觀在設定清單自己一列，nav.js 的 SET_HUBS.look） ---------- */
async function acctHub(){
  const A=await acctLoad();
  let mine=[];try{mine=await A.requestsMine()}catch(_){}
  const pend=()=>mine.filter(q=>q.status==="pending");
  /* 專案權限（跟部門申請分開）：自己的申請；沒有活動部的角色、還沒有專案權限才顯示申請 */
  let pm=null;try{pm=await A.projectMine()}catch(_){}
  const pmPend=()=>pm&&pm.status==="pending";
  const projAsk=!acctSuper()&&!acctDepts().events&&!acct.proj;
  const head=()=>{const u=acct.user;if(!u)return "";
    return `<div class="acct-me"><div class="acct-person"><b class="md-e acct-name" role="button" tabindex="0" data-acct-name aria-label="名稱，點一下修改">${esc(acct.names[u.uid]||u.name||u.email||"")}${ico("edit","solo")}</b><small>${esc(u.email||"")}</small></div><span class="acct-chips">${roleChips(acct.roles||{})}</span></div>${waitNote()}`};
  /* 06 等待頁：還沒有任何編輯權限的人，帳號頁最上面說明目前的狀態（有待審的申請＝等部長或總管理員審核；沒有＝請申請） */
  const waitNote=()=>{if(acctSuper()||Object.keys(acctDepts()).length)return "";const q=pend()[0];
    return `<p class="set-p acct-empty">${q?`申請已送出，等待${esc(deptNameOf(q.deptId))}${q.role==="admin"?"總管理員":"部長"}審核。審核完成後重新整理就能編輯。`:"還沒有編輯權限。選擇部門與位階送出申請，部長審核後就能編輯。"}</p>`};
  return hubRun("帳號",()=>[
    ...(fsWriter()?[{k:"members",ic:"people",t:"部門成員",flow:()=>membersPanel()}]:[]),   /* 05：這個部門有編輯權限的人看得到名單；部長多了邀請、撤銷與審核申請 */
    {k:"req",ic:"doc",t:"申請加入部門",flow:async()=>{if(await acctRequest(pend()))mine=await A.requestsMine().catch(()=>mine)}},
    /* 自己送出、還沒審的申請：名稱寫「部門・角色（待審）」，點了確認後撤回 */
    ...(projAsk&&!pmPend()?[{k:"preq",ic:"flag",t:"申請專案權限",flow:async()=>{if(await projectRequest())pm=await A.projectMine().catch(()=>pm)}}]:[]),
    ...(projAsk&&pmPend()?[{k:"prq",ic:"history",t:"專案權限（等待活動部審核）",
      act:async()=>{const v=await ask("撤回專案權限的申請",[],{danger:"撤回"});if(v!=="delete")return;
        if(await acctTry(()=>A.projectDecide(pm.id,"cancelled",pm.rev),"已撤回"))pm=await A.projectMine().catch(()=>pm)}}]:[]),
    ...(acctSuper()||acctDepts().events==="admin"?[{k:"pjudge",ic:"people",t:"專案權限審核",flow:()=>projectPanel()}]:[]),
    ...pend().map(q=>({k:"rq-"+q.id,ic:"history",t:`${deptNameOf(q.deptId)}・${rankT(q)}（等待審核）`,
      act:async()=>{const v=await ask(`撤回 ${deptNameOf(q.deptId)}・${rankT(q)} 的申請`,[],{danger:"撤回"});if(v!=="delete")return;
        if(await acctTry(()=>A.requestDecide(q.id,"cancelled",q.rev),"已撤回"))mine=await A.requestsMine().catch(()=>mine)}})),
    {k:"out",ic:"close",t:"登出",act:acctSignOut}],{head});
}
/* 名稱：點帳號頁個人卡上的名字就地變輸入框（跟會議資料文件 meeting.js 的 agEditStart 同一種做法）：Enter／點別處＝存，Esc＝取消；存的地方與權限不變（A.setName） */
async function acctNameEdit(el){
  if(acctNameEd||el.querySelector("input")||!acct.user)return;
  const A=await acctLoad(),uid=acct.user.uid,cur=acct.names[uid]||acct.user.name||"";
  acctNameEd=true;
  const w=document.createElement("input");w.className="md-in";w.value=cur;w.maxLength=40;w.spellcheck=false;w.setAttribute("aria-label","名稱");
  el.replaceChildren(w);el.classList.add("is-ed");w.focus();w.select();
  let done=false;
  const end=async save=>{
    if(done)return;done=true;const v=w.value.trim();acctNameEd=false;
    if(save&&v!==cur){
      if(!v)toast("名稱不能空白");
      else if([...v].length>40)toast("最多 40 字");
      else if(await acctTry(()=>A.setName(v),"已更新名稱"))acct.names[uid]=v}
    if(typeof hubNow!=="undefined"&&hubNow)hubNow.draw()};
  w.addEventListener("blur",()=>end(true));
  w.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();end(false)}else if(e.key==="Enter"){e.preventDefault();end(true)}});
}
/* pending＝自己還在待審的申請：同一個部門已經有一筆就不能再送（04，規則也是每人每個部門一份） */
async function acctRequest(pending=[]){
  const A=await acctLoad();
  const v=await ask("申請編輯權限",[
    {name:"dept",label:"部門",type:"select",value:CFG.deptId,options:acctDeptOpts()},
    {name:"rank",label:"位階",type:"select",value:"member",options:RANK_OPT},
    {name:"note",label:"備註",ph:""}],
    {validate:o=>acctDepts()[o.dept]===(o.rank==="minister"?"admin":"editor")?"已經是這個角色":pending.some(q=>q.deptId===o.dept)?acctErr({code:"pending"}):""});
  if(!v)return false;
  return acctTry(()=>A.requestCreate({deptId:v.dept,rank:v.rank,note:v.note}),"已送出申請");
}

/* 專案權限：只能改活動部的專案（進度頁），由活動部部長或總管理員審核；跟申請加入部門是兩件事 */
async function projectRequest(){
  const A=await acctLoad();
  const v=await ask("申請專案權限",[{name:"note",label:"備註（想參與哪個專案）",ph:""}],{});
  if(!v)return false;
  return acctTry(()=>A.projectRequestCreate(v.note),"已送出，等待活動部審核");
}
/* 專案權限審核（活動部部長、總管理員）：待審的申請核准或拒絕；已有專案權限的人可以撤銷 */
function projectPanel(){
  return acctPanel("專案權限審核",async p=>{
    const A=await acctLoad();
    let reqs=[],held=[];
    const load=async()=>{[reqs,held]=await Promise.all([A.projectPending(),A.projectHolders()]);acct.names=await A.profiles().catch(()=>acct.names)};
    const draw=()=>{if(!p.alive)return;
      p.html=p.head()+(reqs.length?`<b class="acct-sub">待審的申請（${reqs.length}）</b><div class="set-list">${reqs.map(q=>`<div class="acct-line acct-req"><span><b>${esc(nameOf(q.uid))}</b><small>${hm(q.createdAt)}${q.note?` · ${esc(q.note)}`:""}</small></span>${q.uid!==acct.user.uid?`<button type="button" class="icon" data-pok="${esc(q.id)}">核准</button><button type="button" class="icon danger" data-pno="${esc(q.id)}">拒絕</button>`:""}</div>`).join("")}</div>`:`<p class="set-p acct-empty">沒有待審的申請</p>`)
        +(held.length?`<b class="acct-sub">有專案權限的人</b><div class="set-list">${held.map(x=>`<div class="acct-line"><span><b>${esc(nameOf(x.uid))}</b><small>可以編輯活動部的專案</small></span><button type="button" class="icon danger" data-prm="${esc(x.uid)}">撤銷</button></div>`).join("")}</div>`:"")};
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      const q=reqs.find(x=>x.id===(b.dataset.pok||b.dataset.pno));
      if(b.dataset.pok&&q){const v=await ask(`核准 ${nameOf(q.uid)} 的專案權限`,[],{danger:"核准",note:"可以新增、修改活動部的專案，不能改其他內容"});if(v!=="delete")return;await acctTry(()=>A.projectApprove(q.id,q.rev),"已核准")}
      else if(b.dataset.pno&&q){const v=await ask("拒絕這筆申請",[],{danger:"拒絕"});if(v!=="delete")return;await acctTry(()=>A.projectDecide(q.id,"rejected",q.rev),"已拒絕")}
      else if(b.dataset.prm){const u=b.dataset.prm,v=await ask(`撤銷 ${nameOf(u)} 的專案權限`,[],{danger:"撤銷"});if(v!=="delete")return;await acctTry(()=>A.projectRevoke(u),"已撤銷")}
      else return;
      if(p.alive){await load();draw()}
    });
    await load();draw();
  });
}

/* ---------- 系統管理（總管理員）：人員、QR 邀請、申請、紀錄、匯入、匯出全部資料、儲存空間用量 ---------- */
/* 儲存空間用量（ui-11）：在新分頁開 Firebase 主控台的用量頁（要用自己的 Google 帳號登入主控台才看得到）；不估算、不讀資料。
   只在這個部門已切到新資料庫（firestore；凍結中不算，同「匯入備份」的 fsMode 判斷）、而且有 projectId 時出現 */
const usageUrl=()=>{const id=fsMode()&&CFG.firebase&&CFG.firebase.projectId;return id?`https://console.firebase.google.com/project/${encodeURIComponent(id)}/usage`:""};
async function councilHub(){
  await acctLoad();
  return hubRun("系統管理",()=>[
    {k:"invite",ic:"share",t:"QR 邀請",flow:()=>invitePanel()},   /* 最常用，放第一個 */
    {k:"people",ic:"people",t:"人員",flow:()=>peoplePanel()},
    {k:"requests",ic:"doc",t:"申請",flow:()=>requestsPanel()},
    {k:"audit",ic:"history",t:"紀錄",flow:()=>auditPanel()},
    {k:"import",ic:"cloud",t:"匯入",flow:()=>importPanel()},
    {k:"backup",ic:"download",t:"匯出這個部門備份",act:()=>exportBackup()},   /* 原本設定清單的「備份」列（2026-11-22 搬進來，只有總管理員）；匯出功能不變 */
    {k:"export",ic:"download",t:"匯出全部資料",act:exportAllData},
    ...(usageUrl()?[{k:"usage",ic:"progress",t:"儲存空間用量",act:()=>{const u=usageUrl();if(u)window.open(u,"_blank","noopener,noreferrer")}}]:[])]);
}
const nameOf=uid=>acct.names[uid]||uid.slice(0,8);
const mailOf=(users,uid)=>(users.find(x=>x.uid===uid)||{}).email||"";
const roleChips=r=>[...(r.super?[`<span class="acct-chip on">總管理員</span>`]:[]),...Object.entries(r.depts||{}).map(([d,v])=>`<span class="acct-chip">${esc(deptNameOf(d))}・${esc(roleT(v,d))}</span>`)].join("")||`<span class="acct-chip">唯讀</span>`;   /* 被撤光的人也列出來（roles 文件還在） */

/* 人員：列出有角色的人；點一個人：改角色、撤銷部門、授予／取消總管理員（不能取消自己）、看他的權限歷史 */
function peoplePanel(){
  return acctPanel("人員",async p=>{
    const A=await acctLoad();
    let roles=[],users=[],who=null;
    const load=async()=>{[roles,users]=await Promise.all([A.rolesList(),A.usersList()]);acct.names=await A.profiles().catch(()=>acct.names)};
    A.rosterSync().catch(()=>{});   /* 03 F3：打開人員時把全部的專員名單對齊角色（補上 F3 之前就有角色的人、清掉已撤權的） */
    const mail=uid=>mailOf(users,uid);
    const draw=()=>{
      if(!p.alive)return;
      p.sub(!!who,()=>{who=null;draw()});
      if(who){const r=roles.find(x=>x.uid===who)||{uid:who,super:false,depts:{}},self=who===acct.user.uid;
        p.html=p.head()+`<div class="acct-person"><b>${esc(nameOf(who))}</b><small>${esc(mail(who))}</small></div>
          <div class="set-list">${Object.entries(r.depts).map(([d,v])=>`<div class="acct-line"><span>${esc(deptNameOf(d))}・${esc(roleT(v,d))}</span>
            <button type="button" class="icon" data-swap="${esc(d)}">改成${v==="admin"?"編輯者":roleT("admin",d)}</button><button type="button" class="icon danger" data-rm="${esc(d)}">撤銷</button></div>`).join("")}
            <div class="acct-line"><span>總管理員</span>${self?`<small>自己</small>`:`<button type="button" class="icon${r.super?" danger":""}" data-super>${r.super?"取消":"授予"}</button>`}</div></div>
          <div class="acct-acts"><button type="button" class="add-row" data-add>+ 部門</button><button type="button" class="add-row" data-hist>權限歷史</button></div>`;
        return}
      const list=roles.slice().sort((a,b)=>(b.super-a.super)||nameOf(a.uid).localeCompare(nameOf(b.uid),"zh-Hant"));
      /* 05：登入過、還沒有任何角色文件的帳號也列出來（點進去就能指派部門與角色）；有 roles 文件的（含被撤光的）在上面那一區 */
      const none=users.filter(x=>!roles.some(r=>r.uid===x.uid)).sort((a,b)=>nameOf(a.uid).localeCompare(nameOf(b.uid),"zh-Hant"));
      p.html=p.head()+`<div class="set-list">${list.map(r=>`<button type="button" class="set-row acct-row" data-who="${esc(r.uid)}"><span class="acct-rt"><b>${esc(nameOf(r.uid))}</b><small>${esc(mail(r.uid))}</small><span class="acct-chips">${roleChips(r)}</span></span>${SR_CHEV}</button>`).join("")||`<p class="set-p acct-empty">沒有人</p>`}</div>
        ${none.length?`<p class="acct-sub">尚無權限的帳號（${none.length}）</p><div class="set-list">${none.map(x=>`<button type="button" class="set-row acct-row" data-who="${esc(x.uid)}"><span class="acct-rt"><b>${esc(nameOf(x.uid))}</b><small>${esc(x.email)}</small></span>${SR_CHEV}</button>`).join("")}</div>`:""}
        <button type="button" class="add-row" data-grant>+ 授予權限</button>`;
    };
    const write=async(uid,mut,via,ok)=>{if(await acctTry(()=>A.roleWrite(uid,mut,via),ok)){A.rosterSync(uid).catch(()=>{});if(p.alive){await load();draw()}}};   /* 03 F3：專員名單跟著角色（另一批，失敗下次打開人員再補）；按確定後才離開面板（寫入晚完成）就不重讀 */
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.who){who=b.dataset.who;draw();return}
      if(b.hasAttribute("data-hist")){await auditPanel({roles:who});return}
      const nm=who&&nameOf(who);
      if(b.dataset.swap){const d=b.dataset.swap,to=(roles.find(x=>x.uid===who).depts[d]==="admin")?"editor":"admin";
        /* 改成部長（管理員）先確認（寫出信箱：名稱是本人自己取的，信箱才是登入的帳號）；降成編輯者不用 */
        if(to==="admin"){const v=await ask(`把 ${nm} 改成${deptNameOf(d)}${roleT("admin",d)}`,[],{danger:`改成${roleT("admin",d)}`,note:`帳號：${mail(who)||"（沒有信箱紀錄）"}`});if(v!=="delete")return}
        await write(who,r=>({...r,depts:{...r.depts,[d]:to}}),"manual",`已改成${roleT(to,d)}`);return}
      if(b.dataset.rm){const d=b.dataset.rm;
        const v=await ask(`撤銷 ${nm} 的${deptNameOf(d)}編輯權限`,[],{danger:"撤銷",note:"撤銷後仍可閱讀看板"});if(v!=="delete")return;
        await write(who,r=>{const x={...r.depts};delete x[d];return {...r,depts:x}},"revoke","已撤銷");return}
      if(b.hasAttribute("data-super")){const on=!!(roles.find(x=>x.uid===who)||{}).super;
        const v=await ask(on?`取消 ${nm} 的總管理員`:`授予 ${nm} 總管理員`,[],{danger:on?"取消":"授予"});if(v!=="delete")return;
        await write(who,r=>({...r,super:!on}),on?"revoke":"manual",on?"已取消":"已授予");return}
      if(b.hasAttribute("data-add")||b.hasAttribute("data-grant")){
        const pick=b.hasAttribute("data-grant");
        const opts=users.map(x=>[x.uid,`${nameOf(x.uid)}・${x.email}`]);
        if(pick&&!opts.length){toast("還沒有人登入過");return}
        const v=await ask(pick?"授予權限":`${nm}：新增部門`,[
          ...(pick?[{name:"uid",label:"帳號",type:"select",value:opts[0][0],options:opts}]:[]),
          {name:"dept",label:"部門",type:"select",value:CFG.deptId,options:acctDeptOpts()},
          {name:"role",label:"角色",type:"select",value:"editor",options:ROLE_OPT}],
          {validate:o=>{const r=roles.find(x=>x.uid===(pick?o.uid:who));return r&&r.depts[o.dept]===o.role?"已經是這個角色":""}});
        if(!v)return;
        const target=pick?v.uid:who;
        await write(target,r=>({...r,depts:{...r.depts,[v.dept]:v.role}}),"manual","已授予");
        if(pick){who=target;draw()}
      }
    });
    await load();draw();
  });
}

/* ---------- 部門成員（05）：這個部門有編輯權限的人（名字、角色）----------
   編輯者、管理員、總管理員都看得到（名單 deptMembers，只有 uid 與角色；名字從 profiles，不含信箱）。
   管理員（部長）與總管理員多兩個動作：產生這個部門「編輯者」的 QR（對方掃了登入就加入）、撤銷編輯者（管理員不能動管理員與自己；升管理員由總管理員在系統管理的人員頁做） */
function membersPanel(){
  const dept=CFG.deptId;
  return acctPanel(`部門成員・${deptNameOf(dept)}`,async p=>{
    const A=await acctLoad(),me=acct.user.uid,manage=acctSuper()||acctDepts()[dept]==="admin";
    let list=[],reqs=[],cur=null,busy=false,curOff=null;
    const left=()=>cur?cur.expiresAt-A.serverNow():0;
    const live=()=>!!cur&&cur.status==="active"&&left()>0;
    /* 部長只能審「部員、次長」（編輯者）申請；部長申請與帶舊身分的申請只有總管理員能核准（規則 canDecide） */
    const canJudge=q=>q.uid!==me&&(acctSuper()||(q.role==="editor"&&!q.legacyRef));
    const rank=r=>r==="admin"?0:r==="editor"?1:2;
    const load=async()=>{list=await A.rosterFull(dept);if(manage)reqs=await A.requestsDept(dept).catch(()=>[]);acct.names=await A.profiles().catch(()=>acct.names);
      list.sort((a,b)=>rank(a.role)-rank(b.role)||nameOf(a.uid).localeCompare(nameOf(b.uid),"zh-Hant"))};
    /* 這張 QR 被用掉或撤銷：跟著變；用掉之後過一下再重讀名單（對方登入後才會補上名單那一份） */
    const watch=()=>{if(curOff){curOff();curOff=null}if(!cur||!p.alive)return;const h=cur.h;
      curOff=A.inviteWatch(h,v=>{if(!cur||cur.h!==h||!v||v.status===cur.status)return;Object.assign(cur,{status:v.status,usedBy:v.usedBy});
        draw();if(v.status==="used")setTimeout(()=>{if(p.alive)load().then(draw)},2500)})};
    p.onEnd(()=>{if(curOff)curOff()});
    const draw=async()=>{
      if(!p.alive)return;
      const qr=cur?await qrSvg(joinUrl(cur.token,cur.deptId)):"";
      if(!p.alive)return;
      const stat=cur?(cur.status==="used"?"已使用":cur.status==="revoked"?"已撤銷":left()>0?mmss(left()):"已過期"):"";
      p.html=p.head()+(manage?(cur?`<div class="acct-qr${live()?"":" off"}" data-h="${esc(cur.h)}"><div class="acct-qr-img" role="img" aria-label="QR 邀請">${qr}</div>
          <b>${esc(deptNameOf(cur.deptId))}・${roleT("editor")}</b><span class="acct-qr-t${cur.status==="active"?" num":""}">${stat}</span>
          <div class="acct-acts"><button type="button" class="primary" data-regen>重新產生</button>${live()?`<button type="button" class="danger" data-revoke>撤銷</button>`:""}</div></div>`
        :`<button type="button" class="primary acct-new" data-new>新增${roleT("editor")}</button>`):"")
        +(reqs.length?`<b class="acct-sub">待審的申請（${reqs.length}）</b><div class="set-list">${reqs.map(q=>`<div class="acct-line acct-req"><span><b>${esc(nameOf(q.uid))}・${esc(rankT(q))}</b><small>${hm(q.createdAt)}${q.note?` · ${esc(q.note)}`:""}${canJudge(q)?"":" · 要由總管理員核准"}</small></span>${canJudge(q)?`<button type="button" class="icon" data-rok="${esc(q.id)}">核准</button><button type="button" class="icon danger" data-rno="${esc(q.id)}">拒絕</button>`:""}</div>`).join("")}</div><b class="acct-sub">成員</b>`:"")
        +`<div class="set-list">${list.map(x=>`<div class="acct-line"><span><b>${esc(nameOf(x.uid))}</b><small>${esc(x.role?roleT(x.role,dept):"成員")}${x.uid===me?"・自己":""}</small></span>${manage&&x.role==="editor"&&x.uid!==me?`<button type="button" class="icon danger" data-rm="${esc(x.uid)}">撤銷</button>`:""}</div>`).join("")||`<p class="set-p acct-empty">沒有人</p>`}</div>`;
    };
    p.every(()=>{
      const t=p.box.querySelector(".acct-qr-t");
      if(t&&cur&&cur.status==="active"){if(left()>0)t.textContent=mmss(left());else if(!p.box.querySelector(".acct-qr.off"))draw()}
    },1000);
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b||busy)return;busy=true;
      try{
        if(b.hasAttribute("data-new")){try{cur=await busyRun(()=>A.inviteCreate({deptId:dept,role:"editor"}));watch()}catch(err){toast(acctErr(err))}}
        else if(b.hasAttribute("data-regen")&&cur){try{cur=await busyRun(()=>A.inviteRegen(cur.h));watch()}catch(err){toast(acctErr(err))}}
        else if(b.hasAttribute("data-revoke")&&cur){const v=await ask("撤銷這張 QR",[],{danger:"撤銷"});if(v!=="delete")return;
          const h=cur.h;if(await acctTry(()=>A.inviteRevoke(h),"已撤銷")){cur=null;watch()}}
        else if(b.dataset.rok||b.dataset.rno){
          const q=reqs.find(x=>x.id===(b.dataset.rok||b.dataset.rno));if(!q)return;
          if(b.dataset.rok){const v=await ask(`核准 ${nameOf(q.uid)} 加入${deptNameOf(dept)}`,[],{danger:"核准",note:`位階：${rankT(q)}\n權限：編輯者`});if(v!=="delete")return;
            if(await acctTry(()=>A.requestApprove(q.id,q.rev),"已核准"))A.rosterSync(q.uid).catch(()=>{})}
          else{const v=await ask("拒絕這筆申請",[],{danger:"拒絕"});if(v!=="delete")return;await acctTry(()=>A.requestDecide(q.id,"rejected",q.rev),"已拒絕")}
        }
        else if(b.dataset.rm){const u=b.dataset.rm,v=await ask(`撤銷 ${nameOf(u)} 的${deptNameOf(dept)}編輯權限`,[],{danger:"撤銷",note:"撤銷後仍可閱讀看板"});if(v!=="delete")return;
          const ok=await acctTry(async()=>{
            if(acctSuper()){await A.roleWrite(u,r=>{const x={...r.depts};delete x[dept];return {...r,depts:x}},"revoke");await A.rosterSync(u).catch(()=>{})}
            else await A.deptRemove(u,dept)},"已撤銷");
          if(!ok&&!p.alive)return;
        }else return;
        if(!p.alive)return;
        await load();await draw();
      }finally{busy=false}
    });
    await load();await draw();
  });
}

/* ---------- 匯入（02D D-a，正式切換用）：選一個部門 → 讀資料檔（只讀）→ 照 migrate-core.js 寫進這個網站設定的 Firebase 專案 → 筆數報告 ----------
   權限由規則判斷（遷移批次與匯入分支只有總管理員）；可重跑（內容相同跳過、不覆寫被改過的）。資料操作在 migrate-web.js */
let migMod=null;
function migLoad(){
  if(!migMod)migMod=new Promise((ok,no)=>{if(window.MigrateCore)return ok();const s=document.createElement("script");s.src="core/js/migrate-core.js";s.onload=ok;s.onerror=()=>no(new Error("load"));document.head.append(s)})
    .then(()=>storeModLoad("migrate-web.js","board-migrate-ready","BoardMigrate")).catch(e=>{migMod=null;throw e});
  return migMod;
}
const SRC_T={github:"GitHub",frozen:"凍結中",firestore:"新資料庫"};
/* 匯入讀哪個 repo：只看 dept/config.js 的 data（owner／repo 留空＝從 github.io 網址推）與它的分支，不看資料檔或本機暫存裡的 sync（02D 審查 P1-2）。
   不是 github.io 又沒設 owner／repo（本機開發）＝讀網站上的檔案 */
function impRepo(){
  let owner=CFG.data.owner||"",repo=CFG.data.repo||"";
  if(!owner&&/\.github\.io$/i.test(location.hostname)){owner=location.hostname.split(".")[0];const seg=location.pathname.split("/").filter(Boolean)[0];repo=seg&&!/\.html?$/i.test(seg)?seg:location.hostname}
  return {owner,repo,branch:CFG.data.branch||"main"};
}
const IMP_STEP={read:"讀取並核對資料檔",write:"寫入",check:"檢查"};
const IMP_ERR={source:"讀不到資料檔","permission-denied":"沒有權限",unavailable:"沒有連上網路"};
const IMP_KIND={departments:"部門",org:"學年設定",legacyIdentities:"舊身分",deptSettings:"部門設定",grants:"會議授權",labels:"標籤",issues:"議題",weeks:"週報",cards:"卡片",versions:"版本",events:"時間標記",meetingMinutes:"會議紀錄"};
/* 04：來源跟輸入的 commit／SHA-256 不符時的說明（都沒有寫入）。讀到的雜湊只顯示前 12 碼：要回操作手冊第 B 步重新確認，不是照畫面抄 */
const impMismatch=e=>({expect:"commit 要 40 碼、SHA-256 要 64 碼",commit:"這個 commit 沒有這個資料檔",
  sha256:`資料檔的 SHA-256 跟輸入的不同（讀到的開頭是 ${String(e.sha256||"").slice(0,12)}）`,
  changed:`這個 commit 之後資料檔又被改過（分支現在是 ${String(e.head||"").slice(0,12)}）`}[e.what]||"來源跟輸入的不同")+"，沒有寫入";
const impBig=lines=>lines&&lines.length?`<ol class="acct-log imp-big">${lines.map(x=>`<li><span class="acct-log-b"><small>${esc(x)}</small></span></li>`).join("")}</ol>`:"";   /* 超過規則上限的卡片（03 審查 P2-2）、不合規則的舊身分、整理掉的欄位 */
/* 流程（04）：選部門 → 輸入第 B 步的 commit 與 SHA-256 → 讀取並核對（不符就停，不寫入）→ 列出會寫入的筆數與舊身分名單 → 按「確認匯入」才寫入 → 筆數報告 */
function importPanel(){
  return acctPanel("匯入",async p=>{
    let busy=false,pre=null,res=null,err="",errBig=null,step="",dept="",expect=null;
    const nm=id=>deptNameOf(id);
    const rowsHTML=r=>`<table class="imp-tbl"><thead><tr><th>項目</th><th>資料檔</th><th>Firestore</th><th>結果</th></tr></thead><tbody>${r.report.rows.map(x=>
      `<tr${x.ok?"":' class="bad"'}><td>${esc(x.label)}</td><td class="num">${x.source}</td><td class="num">${x.firestore}</td><td>${x.ok?"相同":"不同"}</td></tr>`).join("")}</tbody></table>`;
    const srcHTML=x=>`<div class="acct-person"><small>${esc(x.path)} · ${x.commit?`${esc(x.repo)} · commit ${esc(x.commit.slice(0,12))}`:"網站上的檔案"}</small><small class="imp-hash">SHA-256 ${esc(x.sha256)}</small></div>`;
    /* 匯入前的確認：會寫入的筆數、舊身分名單（名字與角色）、擋下匯入的項目、整理掉的欄位 */
    const preHTML=()=>{const v=pre.preview,stop=[...v.tooBig,...v.badMembers];
      return srcHTML(pre)
        +`<table class="imp-tbl"><thead><tr><th>會寫入</th><th>筆數</th></tr></thead><tbody>${Object.entries(v.counts).map(([k,n])=>`<tr><td>${esc(IMP_KIND[k]||k)}</td><td class="num">${+n}</td></tr>`).join("")}</tbody></table>`
        +`<div class="acct-person"><b>舊身分 ${v.members.length} 筆</b></div>`
        +(v.members.length?`<ol class="acct-log">${v.members.map(m=>`<li><span class="acct-log-t">${m.role==="admin"?"管理員":"成員"}</span><span class="acct-log-b"><b>${esc(m.name)}</b></span></li>`).join("")}</ol>`:"")
        +(v.fixed.length?`<div class="acct-person"><small>格式不合、匯入時會清空的欄位 ${v.fixed.length} 個</small></div>${impBig(v.fixed)}`:"")
        +(stop.length?`<p class="acct-err" role="alert">有 ${stop.length} 項超過規則的上限，要先在看板上改好才能匯入</p>${impBig(stop)}`:"")
        +`<div class="acct-acts">${stop.length?"":`<button type="button" class="primary" data-go>確認匯入</button>`}</div>`};
    const reset=()=>{if(busy){p.sub(true,reset);return}dept="";pre=null;res=null;err="";expect=null;draw()};   /* 讀取、寫入進行中不退（再補回這一層） */
    const draw=()=>{
      if(!p.alive)return;
      p.sub(!!dept,reset);
      if(dept){
        const head=`<div class="acct-person"><b>${esc(nm(dept))}</b><small>${esc(CFG.firebase.projectId)}</small></div>`;
        if(busy){p.html=p.head()+head+`<p class="set-p imp-step" role="status">${esc(step)}</p>`;return}
        if(err){p.html=p.head()+head+`<p class="acct-err" role="alert">${esc(err)}</p>${impBig(errBig)}<div class="acct-acts"><button type="button" class="add-row" data-run>再試一次</button></div>`;return}
        if(!res){p.html=p.head()+head+preHTML();return}
        const w=res.result,n=o=>Object.values(o).reduce((a,b)=>a+b,0);
        p.html=p.head()+head+srcHTML(res)
          +impBig(res.report.tooBig)+rowsHTML(res)
          +`<ol class="acct-log">${res.report.verify.map(i=>`<li><span class="acct-log-t">${i.ok?"通過":"失敗"}</span><span class="acct-log-b"><b>${esc(i.id)}</b><small>${esc(i.msg)}</small></span></li>`).join("")}</ol>`
          +`<div class="acct-line imp-sum"><span><b class="imp-res${res.ok?"":" bad"}">${res.ok?"結果：通過":"結果：不通過"}</b><small>寫入 ${n(w.written)} · 跳過 ${n(w.skipped)} · 衝突 ${w.conflicts.length}${w.conflicts.length?`（${esc(w.conflicts.join("、"))}）`:""}</small></span></div>`
          +`<div class="acct-acts"><button type="button" class="add-row" data-run>再匯入一次</button></div>`;
        return}
      p.html=p.head()+`<div class="set-list">${BOARD_DEPTS.map(d=>`<button type="button" class="set-row acct-row" data-imp="${esc(d.id)}"><span class="acct-rt"><b>${esc(d.name)}</b><span class="acct-chips"><span class="acct-chip${deptSourceOf(d.id)==="frozen"?" on":""}">${SRC_T[deptSourceOf(d.id)]}</span></span></span>${SR_CHEV}</button>`).join("")}</div>`;
    };
    const fail=e=>{console.error(e);errBig=null;
      err=e&&e.code==="mismatch"?impMismatch(e):e&&e.code==="too-big"?`有 ${e.tooBig.length} 項超過規則的上限，沒有寫入`:IMP_ERR[e&&e.code]||`失敗（${(e&&e.code)||(e&&e.message)||"error"}）`;
      if(e&&e.code==="too-big")errBig=e.tooBig};
    /* 讀取並核對（不寫入）：成功就停在確認畫面 */
    const check=async()=>{
      if(busy)return;busy=true;err="";errBig=null;pre=null;res=null;step=IMP_STEP.read;draw();
      try{const B=await migLoad();pre=await B.prepare(CFG.firebase,impRepo(),BOARD_DEPTS,dept,expect)}catch(e){fail(e)}
      busy=false;draw();
    };
    /* 寫入核對過的那一份 */
    const run=async()=>{
      if(busy||!pre)return;busy=true;err="";errBig=null;step=IMP_STEP.write;draw();
      try{
        const B=await migLoad();
        res=await B.importDept(CFG.firebase,pre,dept,(k,i,n)=>{step=IMP_STEP[k]+(n?` ${i}/${n}`:"");if(p.alive){const el=p.box.querySelector(".imp-step");if(el)el.textContent=step}});
      }catch(e){fail(e)}
      busy=false;draw();
    };
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b||busy)return;
      if(b.dataset.imp){const id=b.dataset.imp,src=deptSourceOf(id),gh=impRepo(),remote=!!(gh.owner&&gh.repo);
        const v=await ask(`匯入 ${nm(id)}${src==="frozen"?"":src==="firestore"?"（已切到新資料庫）":"（還沒凍結）"}`,[
          ...(remote?[{name:"commit",label:"commit（40 碼）",value:""}]:[]),
          {name:"sha",label:"資料檔的 SHA-256（64 碼）",value:""}],
          {validate:o=>remote&&!/^[0-9a-f]{40}$/i.test((o.commit||"").trim())?"commit 要 40 碼（0–9、a–f）":!/^[0-9a-f]{64}$/i.test((o.sha||"").trim())?"SHA-256 要 64 碼（0–9、a–f）":""});
        if(!v)return;
        dept=id;expect={commit:(v.commit||"").trim(),sha256:(v.sha||"").trim()};await check();return}
      if(b.hasAttribute("data-go")){await run();return}
      if(b.hasAttribute("data-run")){await check();return}
    });
    draw();
  });
}
/* ---------- 匯出全部資料（02D D-c，migration.md 第 8 節）：總管理員讀得到的全部集合＋批次資訊＋每個部門的 schemaVersion 13 檔，存成一個 JSON ---------- */
let exportBusy=false;
async function exportAllData(){
  if(exportBusy)return;exportBusy=true;toast("匯出中…");
  try{
    const B=await migLoad(),x=await B.exportAll(CFG.firebase,BOARD_DEPTS);
    await saveJsonFile(`學生會看板_全部資料_${x.projectId}_${today()}.json`,JSON.stringify(x,null,1),"全部資料");
  }catch(e){console.error(e);toast(acctErr(e))}
  exportBusy=false;
}

/* QR 邀請：產生（10 分鐘、一次性）、重新產生（舊的同時撤銷）、撤銷；下面是最近的邀請。權杖只在這個面板的記憶體裡 */
let qrLib=null;
function qrLoad(){if(!qrLib)qrLib=new Promise((ok,no)=>{if(window.qrcode)return ok(window.qrcode);const s=document.createElement("script");s.src="core/vendor/qrcode-generator/qrcode.js";s.onload=()=>ok(window.qrcode);s.onerror=()=>no(new Error("qr"));document.head.append(s)});return qrLib}
const joinUrl=(token,dept)=>`${location.origin}${location.pathname}?d=${encodeURIComponent(dept)}#join=${token}`;
async function qrSvg(text){const q=(await qrLoad())(0,"M");q.addData(text);q.make();return q.createSvgTag({cellSize:4,margin:0,scalable:true})}
function invitePanel(){
  return acctPanel("QR 邀請",async p=>{
    const A=await acctLoad();
    let cur=null,list=[],busy=false,curOff=null;
    const left=()=>cur?cur.expiresAt-A.serverNow():0;
    const live=()=>!!cur&&cur.status==="active"&&left()>0;
    const curText=()=>cur.status==="used"?`已使用 · ${esc(nameOf(cur.usedBy))}`:cur.status==="revoked"?"已撤銷":left()>0?mmss(left()):"已過期";
    /* 面板上這一張被別人用掉或撤銷：跟著變（監聽這一份邀請；換一張或收掉面板就解除） */
    const watch=()=>{if(curOff){curOff();curOff=null}if(!cur||!p.alive)return;cur.status="active";   /* 面板已經收掉（按確定後才離開、產生晚完成）：不再監聽，onEnd 已經解除過 */const h=cur.h;
      curOff=A.inviteWatch(h,v=>{if(!cur||cur.h!==h||!v||v.status===cur.status)return;Object.assign(cur,{status:v.status,usedBy:v.usedBy});load().then(draw)})};
    p.onEnd(()=>{if(curOff)curOff()});
    const statusOf=i=>i.status==="used"?`已使用 · ${esc(nameOf(i.usedBy))} · ${hm(i.usedAt)}`:i.status==="revoked"?"已撤銷":i.expiresAt<=A.serverNow()?"已過期":`剩 ${mmss(i.expiresAt-A.serverNow())}`;
    const load=async()=>{list=await A.inviteList().catch(()=>list)};
    /* 最近的邀請：只列還有效與已使用的（最多 5 筆）；過期、撤銷的合成一行小字，不每筆佔一張卡 */
    const invList=()=>{
      const dead=i=>i.status==="revoked"||(i.status==="active"&&i.expiresAt<=A.serverNow()),shown=list.filter(i=>!dead(i)).slice(0,5),n=list.length-list.filter(i=>!dead(i)).length;
      if(!shown.length&&!n)return "";
      return `${shown.length?`<p class="acct-sub">最近的邀請</p>`:""}<div class="set-list acct-invites">${shown.map(i=>`<div class="acct-line"><span><b>${esc(deptNameOf(i.deptId))}・${esc(roleT(i.role,i.deptId))}</b><small data-left="${i.status==="active"?i.expiresAt:""}">${statusOf(i)}</small></span>${i.status==="active"&&(!cur||i.h!==cur.h)?`<button type="button" class="icon danger" data-revoke="${esc(i.h)}">撤銷</button>`:""}</div>`).join("")}</div>${n?`<p class="acct-more">另有 ${n} 筆已過期或撤銷</p>`:""}`};
    const draw=async()=>{
      if(!p.alive)return;
      const qr=cur?await qrSvg(joinUrl(cur.token,cur.deptId)):"";
      p.html=p.head()+(cur?`<div class="acct-qr${live()?"":" off"}" data-h="${esc(cur.h)}"><div class="acct-qr-img" role="img" aria-label="QR 邀請">${qr}</div>
          <b>${esc(deptNameOf(cur.deptId))}・${esc(roleT(cur.role,cur.deptId))}</b><span class="acct-qr-t${cur.status==="active"?" num":""}">${curText()}</span>
          <div class="acct-acts"><button type="button" class="primary" data-regen>重新產生</button>${live()?`<button type="button" class="danger" data-revoke="${esc(cur.h)}">撤銷</button>`:""}</div></div>`
        :`<button type="button" class="primary acct-new" data-new>產生 QR</button>`)
        +invList();
    };
    p.every(()=>{
      const t=p.box.querySelector(".acct-qr-t");
      if(t&&cur&&cur.status==="active"){if(left()>0)t.textContent=mmss(left());else if(!p.box.querySelector(".acct-qr.off"))draw()}
      p.box.querySelectorAll("[data-left]").forEach(x=>{const e=+x.dataset.left;if(e)x.textContent=e>A.serverNow()?`剩 ${mmss(e-A.serverNow())}`:"已過期"});
    },1000);
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b||busy)return;busy=true;
      try{
        if(b.hasAttribute("data-new")){
          const v=await ask("產生 QR",[
            {name:"dept",label:"部門",type:"select",value:CFG.deptId,options:acctDeptOpts()},
            {name:"role",label:"角色",type:"select",value:"editor",options:ROLE_OPT},
            {name:"email",label:"綁定信箱（選填）",type:"email",value:""}],
            {validate:o=>o.email&&!/^[^\s@]+@[^\s@]+$/.test(o.email)?"信箱格式不對":""});
          if(!v)return;   /* 取消（含離開面板）：沒有變動，不重讀 */
          try{cur=await busyRun(()=>A.inviteCreate({deptId:v.dept,role:v.role,boundEmail:v.email}));watch()}catch(err){toast(acctErr(err))}
        }else if(b.hasAttribute("data-regen")&&cur){
          try{cur=await busyRun(()=>A.inviteRegen(cur.h));watch()}catch(err){toast(acctErr(err))}
        }else if(b.dataset.revoke){
          const h=b.dataset.revoke,v=await ask("撤銷這張 QR",[],{danger:"撤銷"});if(v!=="delete")return;
          if(await acctTry(()=>A.inviteRevoke(h),"已撤銷")&&cur&&cur.h===h){cur=null;watch()}
        }else return;
        if(!p.alive)return;   /* 已經離開面板：不重讀 */
        await load();await draw();
      }finally{busy=false}
    });
    await load();await draw();
  });
}

/* 申請：待審清單，核准（同一批寫角色）或拒絕 */
function requestsPanel(){
  return acctPanel("申請",async p=>{
    const A=await acctLoad();
    let list=[],users=[];
    const mail=uid=>mailOf(users,uid);
    const legName=async()=>{try{const l=await A.legacyList();return Object.fromEntries(l.map(x=>[x.id,x.name]))}catch(_){return {}}};
    let leg={};
    const draw=()=>{if(!p.alive)return;
      /* 信箱（登入的帳號）放在粗體那一行最前面；名稱是申請人自己取的，放在後面的小字 */
      p.html=p.head()+`<div class="set-list">${list.map(q=>`<div class="acct-line acct-req"><span><b>${esc(mail(q.uid)||"（沒有信箱紀錄）")}・${esc(deptNameOf(q.deptId))}${esc(rankT(q))}</b>
        <small>名稱 ${esc(nameOf(q.uid))} · ${hm(q.createdAt)}${q.legacyRef?` · 自稱舊身分 ${esc(leg[q.legacyRef]||q.legacyRef)}`:""}</small>${q.note?`<small>${esc(q.note)}</small>`:""}</span>
        <button type="button" class="icon" data-ok="${esc(q.id)}">核准</button><button type="button" class="icon danger" data-no="${esc(q.id)}">拒絕</button></div>`).join("")||`<p class="set-p acct-empty">沒有待審的申請</p>`}</div>`};
    const load=async()=>{[list,users,leg]=await Promise.all([A.requestsPending(),A.usersList(),legName()]);acct.names=await A.profiles().catch(()=>acct.names)};
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      /* 04：核准、拒絕的是畫面上那一版（rev；同一份申請可以撤回後再申請）。不論成功或失敗都重讀清單（失敗多半是申請剛被撤回或改過）；已經離開面板就不重讀 */
      const q=list.find(x=>x.id===(b.dataset.ok||b.dataset.no));if(!q)return;
      if(b.dataset.ok){
        /* 核准先確認：帳號（信箱）、部門與角色、名稱、舊身分各一行 */
        const v=await ask(`核准 ${mail(q.uid)||nameOf(q.uid)} 的申請`,[],{danger:"核准",note:`帳號：${mail(q.uid)||"（沒有信箱紀錄）"}\n角色：${deptNameOf(q.deptId)}・${rankT(q)}\n名稱：${nameOf(q.uid)}${q.legacyRef?`\n自稱舊身分：${leg[q.legacyRef]||q.legacyRef}`:""}`});
        if(v!=="delete")return;
        if(await acctTry(()=>A.requestApprove(q.id,q.rev),"已核准"))A.rosterSync(q.uid).catch(()=>{})}
      else if(b.dataset.no){const v=await ask("拒絕這筆申請",[],{danger:"拒絕"});if(v!=="delete")return;await acctTry(()=>A.requestDecide(q.id,"rejected",q.rev),"已拒絕")}
      else return;
      if(p.alive){await load();draw()}
    });
    await load();draw();
  });
}

/* 紀錄：最近 50 筆、翻頁；by.roles＝某人的權限歷史（附檢查連號）、by.actor＝某人做過什麼 */
/* 動作的中文（寫入端：fb-account.js 的 audit()、store-write.js、migrate-core.js 的 runImport／setMigrationStatus；遷移批次的狀態轉換以狀態名當動作） */
const ACT_T={update:"修改",create:"建立邀請",redeem:"QR 加入",revoke:"撤銷",request:"申請",approve:"核准",reject:"拒絕",cancel:"撤回",invite:"QR 加入",manual:"手動調整",claim:"認領舊身分",purge:"刪除卡片",bootstrap:"建立總管理員",
  delete:"刪除",dept:"部門調整",import:"匯入",start:"開始",done:"完成",failed:"失敗",rollingBack:"開始撤回",rolledBack:"撤回完成"};
function auditWhat(l){
  if(l.col==="roles"){
    const b=l.before||{},a=l.after||{},bd=b.depts||{},ad=a.depts||{},ch=[];
    if(!!b.super!==!!a.super)ch.push(a.super?"+總管理員":"−總管理員");
    new Set([...Object.keys(bd),...Object.keys(ad)]).forEach(d=>{if(bd[d]===ad[d])return;ch.push(!bd[d]?`+${deptNameOf(d)}${roleT(ad[d],d)}`:!ad[d]?`−${deptNameOf(d)}`:`${deptNameOf(d)} ${roleT(bd[d],d)}→${roleT(ad[d],d)}`)});
    return {act:{invite:"QR 加入",request:"核准申請",manual:"手動調整",revoke:"撤權",bootstrap:"建立總管理員"}[l.action]||l.action,obj:nameOf(l.docId),diff:ch.join("、")};
  }
  if(l.col==="cards"&&l.action==="purge")return {act:"刪除卡片",obj:`${(l.before||{}).title||""}`,diff:deptNameOf((l.before||{}).deptId||"")};
  if(l.action==="delete"&&{issues:1,weeks:1,labels:1}[l.col])return {act:{issues:"刪除議題",weeks:"刪除週報",labels:"刪除標籤"}[l.col],obj:`${(l.before||{}).title||""}`,diff:deptNameOf((l.before||{}).deptId||"")};   /* 02D D-d */
  if(l.col==="invitations")return {act:l.action==="create"&&l.ref?"重新產生 QR":l.action==="revoke"&&l.ref?"撤銷 QR（重新產生）":{create:"建立 QR",redeem:"QR 加入",revoke:"撤銷 QR"}[l.action]||l.action,obj:`QR #${l.docId.slice(0,6)}`,diff:""};
  if(l.col==="grants")return {act:{open:"開放秘書處會議編輯",close:"關閉秘書處會議編輯",import:"匯入會議授權"}[l.action]||l.action,obj:"會議授權",diff:""};   /* 2026-11-20：會長室的開關（store-write.js 的 setMeetGrant） */
  if(l.col==="roleRequests")return {act:{request:"送出申請",approve:"核准申請",reject:"拒絕申請",cancel:"撤回申請"}[l.action]||l.action,obj:`申請 #${l.docId.slice(0,6)}`,diff:""};
  const col={legacyIdentities:"舊身分",deptSettings:"部門設定",grants:"會議授權",migrations:"遷移",bookings:"預約"}[l.col]||l.col;
  return {act:ACT_T[l.action]||l.action,obj:`${col} ${l.docId}`,diff:""};
}
function auditPanel(by={}){
  return acctPanel(by.roles?`權限歷史・${nameOf(by.roles)}`:by.actor?`紀錄・${nameOf(by.actor)}`:"紀錄",async p=>{
    const A=await acctLoad();
    let items=[],more=false,chain=null,people=[];
    const draw=()=>{if(!p.alive)return;
      const pick=!by.roles&&!by.actor&&people.length?fieldHTML({name:"who",label:"",type:"select",value:"",options:[["","全部"],...people.map(u=>[u,nameOf(u)])]}):"";
      p.html=p.head(pick?`<div class="acct-filter">${pick}</div>`:"")
        +(by.roles?`<div class="acct-acts"><button type="button" class="icon" data-chain>檢查連號</button>${chain?`<span class="acct-chain${chain.missing.length?" bad":""}">${chain.missing.length?`缺第 ${chain.missing.join("、")} 號`:chain.rev?`第 1～${chain.rev} 號連續`:"沒有紀錄"}</span>`:""}</div>`:"")
        +`<ol class="acct-log">${items.map(l=>{const w=auditWhat(l);return `<li><span class="acct-log-t num">${hm(l.at)}</span><span class="acct-log-b"><b>${esc(w.act)}</b> ${esc(w.obj)}${w.diff?`<small>${esc(w.diff)}</small>`:""}<small>${esc(nameOf(l.actor))}${l.col==="roles"||l.col==="invitations"||l.col==="roleRequests"?` · 第 ${l.rev} 號`:""}</small></span></li>`}).join("")}</ol>`
        +(items.length?"":`<p class="set-p acct-empty">沒有紀錄</p>`)
        +(more?`<button type="button" class="add-row" data-more>更早的紀錄</button>`:"")
        ;
    };
    const page=async(reset)=>{const r=await A.auditList(by,reset?null:items[items.length-1]);items=reset?r.items:items.concat(r.items);more=r.more};
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.hasAttribute("data-more")){await page(false);draw()}
      else if(b.hasAttribute("data-chain")){chain=await A.auditChain("roles",by.roles).catch(()=>null);draw()}
    });
    p.box.addEventListener("change",async e=>{if(e.target.name!=="who"||!e.target.value)return;const u=e.target.value;await auditPanel({actor:u});if(p.alive){e.target.value="";draw()}});
    try{people=(await A.rolesList()).map(r=>r.uid)}catch(_){}
    await page(true);draw();
  });
}

/* ---------- QR 加入（掃碼的人；第 9.3 節） ----------
   沒登入先登入 → 用雜湊讀邀請（只有 active 的讀得到；讀不到一律「已失效」）→ 加入 → 交易內核銷 → 換到那個部門 */
let joinBusy=false;
async function joinFlow(){
  const token=joinToken();if(!token||joinBusy||!FB_ON)return;joinBusy=true;
  try{
    const A=await acctLoad();
    /* 還沒登入：一直問到登入成功或按取消。彈出視窗被關掉、登入失敗不能讓人卡在空畫面（以前只能重新掃 QR）；取消不清掉權杖，同一個分頁之後從設定頁登入還會接著加入 */
    while(!acct.user){
      if(inAppBrowser()){const v=await ask("用瀏覽器開啟",[],{});if(v)acctCopyUrl();return}
      const v=await ask("用 Google 登入",[],{note:acct.err});
      if(acct.user)break;
      if(!v)return;
      const r=await acctSignIn();
      if(r==="redirect")return;   /* 轉到 Google 登入頁：回來後會重新接著加入 */
      if(r)break;
      /* 取消或失敗：回到上面再問一次（失敗的原因寫在視窗裡） */
    }
    for(let i=0;i<50&&!acct.user;i++)await new Promise(r=>setTimeout(r,100));   /* 等登入狀態傳到 acct（onUser） */
    if(!acct.user)return;
    let inv;
    /* 暫時的錯誤（沒網路）：權杖留著，問要不要再試 */
    for(;;){
      try{inv=await A.invitePreview(token);break}
      catch(_){if(!await ask("沒有連上網路，再試一次？",[],{}))return}
    }
    if(!inv){joinClear();await ask("這張邀請已失效",[],{});return}
    if(inv.legacyTaken){joinClear();await ask("這張邀請綁定的舊身分已經被認領",[],{});return}
    const has=acctDepts()[inv.deptId];
    if(has){joinClear();await ask(`你已經是${deptNameOf(inv.deptId)}的${roleT(has,inv.deptId)}`,[],{});return}
    if(inv.boundEmail&&inv.boundEmail!==String(acct.user.email||"").toLowerCase()){joinClear();await ask("這張邀請只限指定的帳號使用",[],{});return}
    const tick=setInterval(()=>{const n=$("#dlgForm .dlg-note");if(n)n.textContent=`剩 ${mmss(inv.expiresAt-A.serverNow())}`},1000);
    const v=await ask(`加入${deptNameOf(inv.deptId)}・${roleT(inv.role,inv.deptId)}`,[],{note:`剩 ${mmss(inv.expiresAt-A.serverNow())}`});
    clearInterval(tick);
    if(!v){joinClear();return}
    for(;;){
      try{
        const r=await busyRun(()=>A.inviteRedeem(token));joinClear();
        toast(`已加入${deptNameOf(r.deptId)}（${roleT(r.role,r.deptId)}）`);
        if(r.deptId!==CFG.deptId)setTimeout(()=>{location.href=`${location.pathname}?d=${encodeURIComponent(r.deptId)}`},900);
        return;
      }catch(e){
        if(!["already","bound","legacy","invalid"].includes(e.code)){   /* 網路這類暫時的錯誤：邀請還沒用掉，權杖留著，問要不要再試 */
          if(await ask(`${acctErr(e)}，再試一次？`,[],{}))continue;return}
        joinClear();
        await ask(e.code==="already"?`你已經是${deptNameOf(e.deptId)}的${roleT(e.role,e.deptId)}`:e.code==="bound"?"這張邀請只限指定的帳號使用":e.code==="legacy"?"這張邀請綁定的舊身分已經被認領":"這張邀請已失效",[],{});
        return;
      }
    }
  }finally{joinBusy=false}
}
