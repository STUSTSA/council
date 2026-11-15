/* 核心｜Google 登入、QR 加入、會長室管理（02B，docs/architecture/invitations-roles-audit.md 第 9 節）
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
const acctOn=()=>FB_ON&&storeSource()==="firestore";
const ROLE_T={admin:"管理員",editor:"編輯者"};
const deptNameOf=id=>(BOARD_DEPTS.find(d=>d.id===id)||{}).name||id;
const acctDeptOpts=()=>BOARD_DEPTS.map(d=>[d.id,d.name]);
const hm=ms=>{if(!ms)return "";const d=new Date(ms),p=n=>String(n).padStart(2,"0");return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`};
const mmss=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`};
const inAppBrowser=()=>/\bLine\/|FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent);

/* ---------- 登入狀態 ----------
   acct.user＝{uid,email,name}｜null；acct.roles＝自己的 roles 文件（即時監聽，角色被改或撤掉時畫面立刻跟著變）。 */
const acct={ready:false,user:null,roles:null,err:"",names:{}};
let acctMod=null,acctRolesOff=null,acctUid=undefined;
function acctLoad(){
  if(!acctMod)acctMod=storeModLoad("fb-account.js","board-account-ready","BoardAccount").then(A=>A.init(CFG.firebase));   /* 載入方式同 store.js */
  return acctMod;
}
const acctSuper=()=>!!(acct.roles&&acct.roles.super);
const acctDepts=()=>(acct.roles&&acct.roles.depts)||{};
function acctRoleSub(){
  const r=Object.entries(acctDepts()).map(([d,v])=>`${deptNameOf(d)}${ROLE_T[v]||v}`);
  if(acctSuper())r.unshift("總管理員");
  return r.length?r.join("、"):"唯讀";
}
/* 02D：firestore 模式的看板跟著角色切換可編輯／唯讀（store.js 的 fsWriter），角色或登入狀態一變就重畫看板 */
let acctCanW="";
function acctChanged(){
  if(typeof renderSettings==="function")renderSettings();
  const w=`${fsWriter()}|${fsAdmin()}|${fsDelOk()}`;if(w!==acctCanW){acctCanW=w;if(fsMode()&&typeof render==="function")render()}
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
    acctUid=uid;acct.user=u;acct.roles=null;acct.ready=true;
    if(acctRolesOff){acctRolesOff();acctRolesOff=null}
    if(!first)acctCloseAdmin();   /* 登出、換帳號：已讀到的人員、紀錄這些資料不能留在畫面上 */
    /* 先等 users／profiles 補建完（這時 Firestore 已經換成這個帳號的憑證）再監聽角色、讀名稱 */
    if(u)A.ensured().then(()=>{if(acctUid!==uid)return;acctRolesOff=A.onRoles(r=>{if(acctUid!==uid)return;const was=acctSuper();acct.roles=r;if(was&&!acctSuper())acctCloseAdmin();acctChanged();acctKnownOk()});return A.profiles().then(m=>{acct.names=m;acctChanged()})}).catch(()=>{});
    acctChanged();
    if(!first&&acctOn())acctReload();   /* 登入、登出、換帳號：重新讀這個部門（boot.js 第一次讀之前已經等過登入狀態） */
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
/* 收掉帳號與會長室管理的面板（登出、換帳號、失去總管理員時） */
function acctCloseAdmin(){if(typeof setOpen!=="undefined"&&setOpen&&(acctPanels.length||paneKey==="council"||paneKey==="acct"||subOpen))paneClose().catch(()=>{})}
const SIGNIN_ERR={"auth/unauthorized-domain":"這個網址還沒開放登入","auth/network-request-failed":"沒有連上網路，稍後再試","auth/operation-not-allowed":"還沒開放 Google 登入","auth/user-disabled":"這個帳號已停用"};
async function acctSignIn(){
  const A=await acctLoad();acct.err="";acctChanged();
  const c=await A.signIn();
  if(c&&c!=="redirect"&&!/popup-closed-by-user|cancelled-popup-request/.test(c)){acct.err=SIGNIN_ERR[c]||`登入失敗（${c}）`;acctChanged()}
  return !c;
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
  if(inAppBrowser())return `<div class="set-gate"><span class="set-gate-ico">${GATE_LOCK}</span><b>用瀏覽器開啟</b><button type="button" class="primary" data-fb-copy>複製網址</button></div>`;
  return `<div class="set-gate"><button type="button" class="set-gate-ico" data-fb-login aria-label="用 Google 登入">${GATE_LOCK}</button><b>未登入</b><button type="button" class="primary" data-fb-login>用 Google 登入</button>${acct.err?`<p class="acct-err" role="alert">${esc(acct.err)}</p>`:""}</div>`;
}
function acctSettingsInner(){
  const wk=setRow("week","doc","每週概述",weekSub());
  if(!FB_ON)return setSec(wk);
  if(!acct.ready)return setSec(wk)+`<div class="set-gate"><span class="set-gate-ico">${GATE_LOCK}</span></div>`;
  if(!acct.user)return setSec(wk)+acctGateHTML();
  const u=acct.user,name=acct.names[u.uid]||u.name||u.email;
  /* 02D：有這個部門角色的人多報告、看板名稱（管理員以上）、標籤、備份（只有匯出）；學年與開學日（只有總管理員能寫 org/config）、人員（舊身分）不出現 */
  const ed=fsWriter()?setSec((fsAdmin()?setRow("title","edit","看板名稱",esc(state.title)):"")
      +setRow("labels","tag","標籤",state.labels.length?`人事時地物 ${state.labels.length} 個`:"人事時地物，還沒有建立")
      +setRow("backup","download","備份","匯出看板內容（JSON 檔）")):"";
  return setSec(fsWriter()?setRow("report","doc","報告",`每週概述（${weekSub()}）、工作報告`):wk)
    +setSec(setRow("acct","people",esc(name),`${esc(u.email)} · ${esc(acctRoleSub())}`))+ed
    +(acctSuper()?setSec(setRow("council","flag","會長室管理","人員、QR 邀請、申請、紀錄")):"");
}
/* 這些列在 firestore 模式下不用舊的看板登入（nav.js 的點擊處理看 ACCT_FLOWS） */
const ACCT_FLOWS={
  acct:()=>acctHub(),
  council:()=>councilHub(),
};
document.addEventListener("click",async e=>{
  if(!e.target.closest)return;
  if(e.target.closest("#setOv [data-fb-login]")){await acctSignIn();return}
  if(e.target.closest("#setOv [data-fb-copy]")){acctCopyUrl();return}
});

/* ---------- 面板（畫在設定頁右側面板／手機子頁，跟合併頁同一個位置）----------
   面板可以疊（人員 → 某人的權限歷史）：只顯示最上面那一層。acctPanelEnd(all)：nav.js 的 paneDismiss 呼叫，
   返回、Esc 一次收一層；換項目、關設定（all）全部收掉 */
const acctPanels=[];
let acctPanelEnd=null;
const acctPanelSync=()=>{acctPanelEnd=acctPanels.length?all=>(all?[...acctPanels].reverse():[acctPanels[acctPanels.length-1]]).forEach(p=>p.end()):null};
function acctPanel(title,draw){
  return new Promise(res=>{
    const host=setPaneHost();if(!host)return res();
    const prev=acctPanels[acctPanels.length-1],depth=acctPanels.length;
    const box=document.createElement("div");box.className="set-hub acct-panel";
    if(prev){prev.box.hidden=true;prev.box.after(box)}else host.prepend(box);
    let alive=true;const timers=[],ends=[];
    const p={box,get alive(){return alive},every(fn,ms){timers.push(setInterval(()=>alive&&fn(),ms))},onEnd(fn){ends.push(fn)},
      head:(extra="")=>`<b class="set-hub-t">${esc(title)}</b>${extra}`};
    p.end=()=>{if(!alive)return;alive=false;timers.forEach(clearInterval);ends.forEach(f=>{try{f()}catch(_){}});
      acctPanels.splice(acctPanels.indexOf(p),1);box.remove();if(prev&&prev.alive)prev.box.hidden=false;
      if(depth)Back.closed("acct"+depth);acctPanelSync();res()};
    acctPanels.push(p);acctPanelSync();
    if(depth)Back.opened("acct"+depth,()=>p.end());
    Promise.resolve().then(()=>draw(p)).catch(err=>{console.error(err);if(alive)box.insertAdjacentHTML("beforeend",`<p class="acct-err" role="alert">讀取失敗</p>`)});
  });
}
const acctErr=e=>({"permission-denied":"沒有權限","inactive":"已經處理過了","same":"已經是這個角色","unavailable":"沒有連上網路，稍後再試","failed-precondition":"資料剛被別人改過，請再試一次","aborted":"資料剛被別人改過，請再試一次"}[e&&e.code]||`失敗（${(e&&e.code)||"error"}）`);
async function acctTry(fn,ok){try{await fn();if(ok)toast(ok);return true}catch(e){toast(acctErr(e));return false}}

/* ---------- 帳號（自己）：名稱、申請編輯權限、我的申請、登出 ---------- */
async function acctHub(){
  const A=await acctLoad();
  let mine=[];try{mine=await A.requestsMine()}catch(_){}
  const pend=()=>mine.filter(q=>q.status==="pending");
  return hubRun("帳號",()=>[
    {k:"name",ic:"edit",t:"名稱",sub:esc(acct.names[acct.user.uid]||acct.user.name||""),flow:acctRename},
    {k:"req",ic:"doc",t:"申請編輯權限",sub:"",flow:async()=>{if(await acctRequest())mine=await A.requestsMine().catch(()=>mine)}},
    ...pend().map(q=>({k:"rq-"+esc(q.id),ic:"history",t:`${esc(deptNameOf(q.deptId))}・${ROLE_T[q.role]}`,sub:`待審 · ${hm(q.createdAt)} · 撤回`,
      act:async()=>{const v=await ask(`撤回 ${deptNameOf(q.deptId)}・${ROLE_T[q.role]} 的申請`,[],{danger:"撤回"});if(v!=="delete")return;
        if(await acctTry(()=>A.requestDecide(q.id,"cancelled"),"已撤回"))mine=await A.requestsMine().catch(()=>mine)}})),
    {k:"out",ic:"close",t:"登出",sub:"",act:acctSignOut}]);
}
async function acctRename(){
  const A=await acctLoad(),cur=acct.names[acct.user.uid]||acct.user.name||"";
  const v=await ask("名稱",[{name:"v",label:"名稱",value:cur}],{validate:o=>!o.v?"名稱不能空白":[...o.v].length>40?"最多 40 字":""});
  if(!v||v.v===cur)return;
  if(await acctTry(()=>A.setName(v.v),"已更新名稱"))acct.names[acct.user.uid]=v.v;
}
async function acctLegacyOpts(A,dept){
  let l=[];try{l=await A.legacyList()}catch(_){}
  return [["","不指定"],...l.filter(x=>!x.claimedBy&&(!dept||x.deptId===dept)).map(x=>[x.id,`${deptNameOf(x.deptId)}・${x.name}`])];
}
async function acctRequest(){
  const A=await acctLoad(),legacy=await acctLegacyOpts(A);
  const v=await ask("申請編輯權限",[
    {name:"dept",label:"部門",type:"select",value:CFG.deptId,options:acctDeptOpts()},
    {name:"role",label:"角色",type:"select",value:"editor",options:[["editor","編輯者"],["admin","管理員"]]},
    ...(legacy.length>1?[{name:"legacy",label:"舊身分",type:"select",value:"",options:legacy}]:[]),
    {name:"note",label:"備註",ph:""}],
    {validate:o=>acctDepts()[o.dept]===o.role?"已經是這個角色":o.legacy&&!o.legacy.startsWith(o.dept+"__")?"舊身分跟部門不同":""});
  if(!v)return false;
  return acctTry(()=>A.requestCreate({deptId:v.dept,role:v.role,note:v.note,legacyRef:v.legacy||""}),"已送出申請");
}

/* ---------- 會長室管理（總管理員）：人員、QR 邀請、申請、紀錄 ---------- */
async function councilHub(){
  const A=await acctLoad();
  let pending=[];try{pending=await A.requestsPending()}catch(_){}
  return hubRun("會長室管理",()=>[
    {k:"people",ic:"people",t:"人員",sub:"",flow:()=>peoplePanel()},
    {k:"invite",ic:"share",t:"QR 邀請",sub:"",flow:()=>invitePanel()},
    {k:"requests",ic:"doc",t:"申請",sub:pending.length?`${pending.length} 筆待審`:"沒有待審",flow:async()=>{await requestsPanel();pending=await A.requestsPending().catch(()=>pending)}},
    {k:"audit",ic:"history",t:"紀錄",sub:"",flow:()=>auditPanel()}]);
}
const nameOf=uid=>acct.names[uid]||uid.slice(0,8);
const mailOf=(users,uid)=>(users.find(x=>x.uid===uid)||{}).email||"";
const roleChips=r=>[...(r.super?[`<span class="acct-chip on">總管理員</span>`]:[]),...Object.entries(r.depts||{}).map(([d,v])=>`<span class="acct-chip">${esc(deptNameOf(d))}・${ROLE_T[v]||esc(v)}</span>`)].join("")||`<span class="acct-chip">唯讀</span>`;   /* 被撤光的人也列出來（roles 文件還在） */

/* 人員：列出有角色的人；點一個人：改角色、撤銷部門、授予／取消總管理員（不能取消自己）、看他的權限歷史 */
function peoplePanel(){
  return acctPanel("人員",async p=>{
    const A=await acctLoad();
    let roles=[],users=[],who=null;
    const load=async()=>{[roles,users]=await Promise.all([A.rolesList(),A.usersList()]);acct.names=await A.profiles().catch(()=>acct.names)};
    const mail=uid=>mailOf(users,uid);
    const draw=()=>{
      if(!p.alive)return;
      if(who){const r=roles.find(x=>x.uid===who)||{uid:who,super:false,depts:{}},self=who===acct.user.uid;
        p.box.innerHTML=p.head()+`<div class="acct-person"><b>${esc(nameOf(who))}</b><small>${esc(mail(who))}</small></div>
          <div class="set-list">${Object.entries(r.depts).map(([d,v])=>`<div class="acct-line"><span>${esc(deptNameOf(d))}・${ROLE_T[v]}</span>
            <button type="button" class="icon" data-swap="${esc(d)}">改成${v==="admin"?"編輯者":"管理員"}</button><button type="button" class="icon danger" data-rm="${esc(d)}">撤銷</button></div>`).join("")}
            <div class="acct-line"><span>總管理員</span>${self?`<small>自己</small>`:`<button type="button" class="icon${r.super?" danger":""}" data-super>${r.super?"取消":"授予"}</button>`}</div></div>
          <div class="acct-acts"><button type="button" class="add-row" data-add>+ 部門</button><button type="button" class="add-row" data-hist>權限歷史</button><button type="button" class="add-row" data-back>返回</button></div>`;
        return}
      const list=roles.slice().sort((a,b)=>(b.super-a.super)||nameOf(a.uid).localeCompare(nameOf(b.uid),"zh-Hant"));
      p.box.innerHTML=p.head()+`<div class="set-list">${list.map(r=>`<button type="button" class="set-row acct-row" data-who="${esc(r.uid)}"><span class="sr-t"><b>${esc(nameOf(r.uid))}</b><small>${esc(mail(r.uid))}</small><span class="acct-chips">${roleChips(r)}</span></span>${SR_CHEV}</button>`).join("")||`<p class="set-p acct-empty">沒有人</p>`}</div>
        <button type="button" class="add-row" data-grant>+ 授予權限</button>`;
    };
    const write=async(uid,mut,via,ok)=>{if(await acctTry(()=>A.roleWrite(uid,mut,via),ok)){await load();draw()}};
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.who){who=b.dataset.who;draw();return}
      if(b.hasAttribute("data-back")){who=null;draw();return}
      if(b.hasAttribute("data-hist")){await auditPanel({roles:who});return}
      const nm=who&&nameOf(who);
      if(b.dataset.swap){const d=b.dataset.swap,to=(roles.find(x=>x.uid===who).depts[d]==="admin")?"editor":"admin";
        await write(who,r=>({...r,depts:{...r.depts,[d]:to}}),"manual",`已改成${ROLE_T[to]}`);return}
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
          {name:"role",label:"角色",type:"select",value:"editor",options:[["editor","編輯者"],["admin","管理員"]]}],
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
    const watch=()=>{if(curOff){curOff();curOff=null}if(!cur)return;cur.status="active";const h=cur.h;
      curOff=A.inviteWatch(h,v=>{if(!cur||cur.h!==h||!v||v.status===cur.status)return;Object.assign(cur,{status:v.status,usedBy:v.usedBy});load().then(draw)})};
    p.onEnd(()=>{if(curOff)curOff()});
    const statusOf=i=>i.status==="used"?`已使用 · ${esc(nameOf(i.usedBy))} · ${hm(i.usedAt)}`:i.status==="revoked"?"已撤銷":i.expiresAt<=A.serverNow()?"已過期":`剩 ${mmss(i.expiresAt-A.serverNow())}`;
    const load=async()=>{list=await A.inviteList().catch(()=>list)};
    const draw=async()=>{
      if(!p.alive)return;
      const qr=cur?await qrSvg(joinUrl(cur.token,cur.deptId)):"";
      p.box.innerHTML=p.head()+(cur?`<div class="acct-qr${live()?"":" off"}" data-h="${esc(cur.h)}"><div class="acct-qr-img" role="img" aria-label="QR 邀請">${qr}</div>
          <b>${esc(deptNameOf(cur.deptId))}・${ROLE_T[cur.role]}</b><span class="acct-qr-t${cur.status==="active"?" num":""}">${curText()}</span>
          <div class="acct-acts"><button type="button" class="primary" data-regen>重新產生</button>${live()?`<button type="button" class="danger" data-revoke="${esc(cur.h)}">撤銷</button>`:""}</div></div>`
        :`<button type="button" class="primary acct-new" data-new>產生 QR</button>`)
        +`<div class="set-list acct-invites">${list.map(i=>`<div class="acct-line"><span><b>${esc(deptNameOf(i.deptId))}・${ROLE_T[i.role]||esc(i.role)}</b><small data-left="${i.status==="active"?i.expiresAt:""}">${statusOf(i)}</small></span>${i.status==="active"&&i.expiresAt>A.serverNow()&&(!cur||i.h!==cur.h)?`<button type="button" class="icon danger" data-revoke="${esc(i.h)}">撤銷</button>`:""}</div>`).join("")}</div>`;
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
          const legacy=await acctLegacyOpts(A);
          const v=await ask("產生 QR",[
            {name:"dept",label:"部門",type:"select",value:CFG.deptId,options:acctDeptOpts()},
            {name:"role",label:"角色",type:"select",value:"editor",options:[["editor","編輯者"],["admin","管理員"]]},
            {name:"email",label:"綁定信箱（選填）",type:"email",value:""},
            ...(legacy.length>1?[{name:"legacy",label:"舊身分",type:"select",value:"",options:legacy}]:[])],
            {validate:o=>o.email&&!/^[^\s@]+@[^\s@]+$/.test(o.email)?"信箱格式不對":o.legacy&&!o.legacy.startsWith(o.dept+"__")?"舊身分跟部門不同":""});
          if(v){try{cur=await A.inviteCreate({deptId:v.dept,role:v.role,boundEmail:v.email,legacyRef:v.legacy||""});watch()}catch(err){toast(acctErr(err))}}
        }else if(b.hasAttribute("data-regen")&&cur){
          try{cur=await A.inviteRegen(cur.h);watch()}catch(err){toast(acctErr(err))}
        }else if(b.dataset.revoke){
          const h=b.dataset.revoke,v=await ask("撤銷這張 QR",[],{danger:"撤銷"});
          if(v==="delete"&&await acctTry(()=>A.inviteRevoke(h),"已撤銷")&&cur&&cur.h===h){cur=null;watch()}
        }else return;
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
      p.box.innerHTML=p.head()+`<div class="set-list">${list.map(q=>`<div class="acct-line acct-req"><span><b>${esc(nameOf(q.uid))}・${esc(deptNameOf(q.deptId))}${ROLE_T[q.role]}</b>
        <small>${esc(mail(q.uid))} · ${hm(q.createdAt)}${q.legacyRef?` · 舊身分 ${esc(leg[q.legacyRef]||q.legacyRef)}`:""}</small>${q.note?`<small>${esc(q.note)}</small>`:""}</span>
        <button type="button" class="icon" data-ok="${esc(q.id)}">核准</button><button type="button" class="icon danger" data-no="${esc(q.id)}">拒絕</button></div>`).join("")||`<p class="set-p acct-empty">沒有待審的申請</p>`}</div>`};
    const load=async()=>{[list,users,leg]=await Promise.all([A.requestsPending(),A.usersList(),legName()]);acct.names=await A.profiles().catch(()=>acct.names)};
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.ok){if(await acctTry(()=>A.requestApprove(b.dataset.ok),"已核准")){await load();draw()}}
      else if(b.dataset.no){const v=await ask("拒絕這筆申請",[],{danger:"拒絕"});if(v==="delete"&&await acctTry(()=>A.requestDecide(b.dataset.no,"rejected"),"已拒絕")){await load();draw()}}
    });
    await load();draw();
  });
}

/* 紀錄：最近 50 筆、翻頁；by.roles＝某人的權限歷史（附檢查連號）、by.actor＝某人做過什麼 */
const ACT_T={update:"修改",create:"建立邀請",redeem:"QR 加入",revoke:"撤銷",request:"申請",approve:"核准",reject:"拒絕",cancel:"撤回",invite:"QR 加入",manual:"手動調整",claim:"認領舊身分",purge:"刪除卡片",bootstrap:"建立總管理員"};
function auditWhat(l){
  if(l.col==="roles"){
    const b=l.before||{},a=l.after||{},bd=b.depts||{},ad=a.depts||{},ch=[];
    if(!!b.super!==!!a.super)ch.push(a.super?"+總管理員":"−總管理員");
    new Set([...Object.keys(bd),...Object.keys(ad)]).forEach(d=>{if(bd[d]===ad[d])return;ch.push(!bd[d]?`+${deptNameOf(d)}${ROLE_T[ad[d]]}`:!ad[d]?`−${deptNameOf(d)}`:`${deptNameOf(d)} ${ROLE_T[bd[d]]}→${ROLE_T[ad[d]]}`)});
    return {act:{invite:"QR 加入",request:"核准申請",manual:"手動調整",revoke:"撤權",bootstrap:"建立總管理員"}[l.action]||l.action,obj:nameOf(l.docId),diff:ch.join("、")};
  }
  if(l.col==="cards")return {act:"刪除卡片",obj:`${(l.before||{}).title||""}`,diff:deptNameOf((l.before||{}).deptId||"")};
  if(l.col==="invitations")return {act:l.action==="create"&&l.ref?"重新產生 QR":l.action==="revoke"&&l.ref?"撤銷 QR（重新產生）":{create:"建立 QR",redeem:"QR 加入",revoke:"撤銷 QR"}[l.action]||l.action,obj:`QR #${l.docId.slice(0,6)}`,diff:""};
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
      p.box.innerHTML=p.head(pick?`<div class="acct-filter">${pick}</div>`:"")
        +(by.roles?`<div class="acct-acts"><button type="button" class="icon" data-chain>檢查連號</button>${chain?`<span class="acct-chain${chain.missing.length?" bad":""}">${chain.missing.length?`缺第 ${chain.missing.join("、")} 號`:chain.rev?`第 1～${chain.rev} 號連續`:"沒有紀錄"}</span>`:""}</div>`:"")
        +`<ol class="acct-log">${items.map(l=>{const w=auditWhat(l);return `<li><span class="acct-log-t num">${hm(l.at)}</span><span class="acct-log-b"><b>${esc(w.act)}</b> ${esc(w.obj)}${w.diff?`<small>${esc(w.diff)}</small>`:""}<small>${esc(nameOf(l.actor))}${l.col==="roles"||l.col==="invitations"||l.col==="roleRequests"?` · 第 ${l.rev} 號`:""}</small></span></li>`}).join("")}</ol>`
        +(items.length?"":`<p class="set-p acct-empty">沒有紀錄</p>`)
        +(more?`<button type="button" class="add-row" data-more>更早的紀錄</button>`:"")
        +(by.roles||by.actor?`<button type="button" class="add-row" data-back>返回</button>`:"");
    };
    const page=async(reset)=>{const r=await A.auditList(by,reset?null:items[items.length-1]);items=reset?r.items:items.concat(r.items);more=r.more};
    p.box.addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.hasAttribute("data-more")){await page(false);draw()}
      else if(b.hasAttribute("data-chain")){chain=await A.auditChain("roles",by.roles).catch(()=>null);draw()}
      else if(b.hasAttribute("data-back"))p.end();
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
    if(!acct.user){
      /* 取消登入不清掉權杖：同一個分頁之後從設定頁登入，還會接著加入 */
      if(inAppBrowser()){const v=await ask("用瀏覽器開啟",[],{});if(v)acctCopyUrl();return}
      const v=await ask("用 Google 登入",[],{});
      if(!acct.user){if(!v)return;if(!await acctSignIn()){if(acct.err)toast(acct.err);return}}
      for(let i=0;i<50&&!acct.user;i++)await new Promise(r=>setTimeout(r,100));   /* 等登入狀態傳到 acct（onUser） */
      if(!acct.user)return;
    }
    let inv;
    try{inv=await A.invitePreview(token)}catch(_){toast("沒有連上網路，稍後再試");return}   /* 暫時的錯誤：權杖留著，重新整理或重新登入會再試 */
    if(!inv){joinClear();await ask("這張邀請已失效",[],{});return}
    if(inv.legacyTaken){joinClear();await ask("這張邀請綁定的舊身分已經被認領",[],{});return}
    const has=acctDepts()[inv.deptId];
    if(has){joinClear();await ask(`你已經是${deptNameOf(inv.deptId)}的${ROLE_T[has]}`,[],{});return}
    if(inv.boundEmail&&inv.boundEmail!==String(acct.user.email||"").toLowerCase()){joinClear();await ask("這張邀請只限指定的帳號使用",[],{});return}
    const tick=setInterval(()=>{const n=$("#dlgForm .dlg-note");if(n)n.textContent=`剩 ${mmss(inv.expiresAt-A.serverNow())}`},1000);
    const v=await ask(`加入${deptNameOf(inv.deptId)}・${ROLE_T[inv.role]}`,[],{note:`剩 ${mmss(inv.expiresAt-A.serverNow())}`});
    clearInterval(tick);
    if(!v){joinClear();return}
    try{
      const r=await A.inviteRedeem(token);joinClear();
      toast(`已加入${deptNameOf(r.deptId)}（${ROLE_T[r.role]}）`);
      if(r.deptId!==CFG.deptId)setTimeout(()=>{location.href=`${location.pathname}?d=${encodeURIComponent(r.deptId)}`},900);
    }catch(e){
      joinClear();
      await ask(e.code==="already"?`你已經是${deptNameOf(e.deptId)}的${ROLE_T[e.role]}`:e.code==="bound"?"這張邀請只限指定的帳號使用":e.code==="legacy"?"這張邀請綁定的舊身分已經被認領":e.code==="invalid"?"這張邀請已失效":acctErr(e),[],{});
    }
  }finally{joinBusy=false}
}
