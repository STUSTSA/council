/* 核心｜秘書處的「會議報告事項」（只能看）與「會議編輯」（會長室開放才能改）面板（設定檔 meeting:true），以及會長室的授權開關（grant:true）
   - 列出各部門標了「會議要報告」（ev.report）的即時回報，依部門分組；會長室追蹤一樣的讀法，但會記住 sha 以便寫回。
   - 「會議編輯」：會長室今天開放（會長室資料的 meetGrant.date＝今天）時，登入後按這區的「編輯」，，卡片跟部門自己的即時回報同一套逐欄編輯（點哪欄改哪欄：名稱、說明、母議題、專員、標籤、時間標記與地點、連結）。
     做法：畫面與存回時把全域 state 暫時換成那個部門的資料（withState），所以 views.js／events.js 的逐欄編輯不用另寫一份。
   - 按「儲存並同步」：秘書處自己的資料照常存；改過的部門各自寫回 data-代號.json（同一個 repo、同一把權杖），
     commit 訊息照現行格式，作者是秘書處目前登入的身分（該部門的編輯紀錄會看到「〔秘書處 名字〕」）。按「取消」放棄。
   - firestore 模式（2026-11-20）：秘書處看板是 firestore 時，改的是已搬到新資料庫的部門（還在 GitHub 的部門不能改，反過來也一樣）。
     會長室的開放存在 grants/meetingEdit（總管理員才能開關，有稽核紀錄；到期時間＝當天結束）；寫回用 store-write.js 的 saveMeeting，
     只能改報告卡片的名稱、說明（逐行內容）、已有時間標記的內容（規則 cards 的 meetingEdit、events 的 meetingEditOfReportedCard）；
     會議紀錄寫進 meetingMinutes/{日期}（秘書處與總管理員讀得到）。
   - 「會議要報告」標記由各部門手動取消（生成週報不會清；週三自動清待規則更新）；這裡不改標記本身。 */
const MT={depts:new Map(),loading:false,at:0};   /* dept id → {data,base,sha,err,dirty,fs}；fs＝{src,orig}（firestore 的部門，寫回用） */
function withState(s,fn){const keep=state;state=s;try{return fn()}finally{state=keep}}
const mtOf=el=>{const b=el&&el.closest&&el.closest("[data-mtdept]");return b?MT.depts.get(b.dataset.mtdept):null};
async function mtLoadAll(force){
  if(!CFG.meeting||MT.loading||(!force&&Date.now()-MT.at<3e5&&MT.depts.size))return;
  if(editing&&[...MT.depts.values()].some(x=>x.dirty))return;   /* 改到一半不要被覆蓋 */
  MT.loading=true;renderMeet();
  const cc=cloudCfg(),tok=ghToken();
  await Promise.all((window.BOARD_DEPTS||[]).filter(d=>d.id!==CFG.deptId).map(async d=>{
    let data=null,sha=null,err="",fsr=null;
    if(deptSourceOf(d.id)==="firestore"){try{const r=await storeDeptFull(d.id);data=r.data;fsr={src:r.src,orig:r.orig}}catch(e){fsReadErr("讀部門 "+d.id,e);err=STORE_XERR(e)}}   /* 02D D-b：已切到新資料庫的部門讀 Firestore；src／orig 留著給 firestore 模式的會議編輯寫回 */
    else try{
      if(cc.owner&&cc.repo&&tok){const r=await fetch(apiURL({...cc,path:d.path})+`?ref=${encodeURIComponent(cc.branch)}&t=${Date.now()}`,{headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+tok},cache:"no-store"});
        if(r.ok){const j=await r.json();sha=j.sha;data=JSON.parse(b64dec(j.content))}else if(r.status===404)err="還沒有資料"}
      if(!data&&!err&&location.protocol!=="file:"){const r=await fetch(d.path,{cache:"no-cache"});if(r.ok)data=await r.json();else err="還沒有資料"}
    }catch(_){err="讀不到資料"}
    if(data)data=normalize(data);
    MT.depts.set(d.id,{id:d.id,name:d.name,data,base:data&&JSON.parse(JSON.stringify(data)),sha,err,dirty:false,fs:fsr});
  }));
  MT.loading=false;MT.at=Date.now();render();
}
/* 會長室的授權：會長室資料的 meetGrant.date 是今天才算開放（過了那天自動失效） */
function mtGrant(){const pr=MT.depts.get("president"),g=pr&&pr.data&&pr.data.meetGrant;return g&&g.date===today()?g:null}
const mtCanEdit=()=>secEd("meetedit")&&!!mtGrant();
const mtSrcOk=id=>deptSourceOf(id)===(fsMode()?"firestore":"github");   /* 能改的部門：跟秘書處看板同一邊（GitHub 模式改 GitHub 的部門、firestore 模式改新資料庫的部門） */
const mtWho=()=>(fsMode()&&typeof acct!=="undefined"&&acct.user&&acct.user.name)||meName();
/* 一個部門的報告事項（ed＝畫成可以點欄位編輯）。一次只畫一個部門（MTS.sel）。
   2026-11-06 使用者：秘書處看起來依然很臃腫，不要直接粗暴地條列——每一筆收成跟即時回報同一種膠囊（<details class="ev">，motion.js 的展開收合動畫），
   收合只看燈號、名稱、狀態，點了才展開說明、時間、連結；哪幾筆開著記在 MTS.open，重畫後照舊 */
const MTS={sel:"",open:new Set()};
const mtEvs=m=>m&&m.data?m.data.events.filter(e=>!e.doneAt&&reportOn(e)):[];
/* 一張報告事項卡（要在 withState(那個部門的資料) 裡呼叫）：ed＝逐欄編輯；tail＝卡片展開後最後面多放的 HTML（會議紀錄的結論欄）；open＝一開始是否展開 */
function mtEvHTML(e,ed,open,tail){
  const st=evStatus(e),par=parentOf(e);
  return `<details class="ev mt-ev" data-ev="${esc(e.id)}" data-mtev="${esc(e.id)}" data-st="${st}"${open?" open":""}>
    <summary><span class="live-dot" aria-hidden="true"></span><b>${esc(e.name)}</b><span class="mt-st">${EV_ST[st]}</span><span class="ev-chev" aria-hidden="true">▾</span></summary>
    <div class="ev-body">${ed?evFieldsHTML(e,fsMode()):`${par?`<p class="ev-parent-full">母議題：${esc(par.title)}</p>`:""}${e.desc?`<p>${esc(e.desc)}</p>`:`<p class="sub">沒有說明</p>`}${evTimesHTML(e)}${staffHTML(e.staff)}${labelChipsHTML(e.labels)}${evLinksHTML(e)}`}${tail||""}</div></details>`;
}
function mtGroupHTML(m,ed){
  const evs=mtEvs(m);if(!evs.length)return "";
  return `<section class="mt-dept" data-mtdept="${esc(m.id)}" data-fk="mt${esc(m.id)}">${ed&&m.dirty?'<p class="sub mt-dirty">已修改，按「儲存」後寫回</p>':""}
    <div class="events mt-list">${withState(m.data,()=>evs.map(e=>mtEvHTML(e,ed,MTS.open.has(e.id))).join(""))}</div></section>`;
}
document.addEventListener("toggle",e=>{const d=e.target;if(!d.matches||!d.matches("#meetEdList .mt-ev"))return;if(d.open)MTS.open.add(d.dataset.mtev);else MTS.open.delete(d.dataset.mtev)},true);
/* 秘書處「會議」分頁的報告事項（2026-11-06 使用者：一個一個編輯每個部門釘選要報告的即時回報，最後根據改動的紀錄匯出會議紀錄 PDF）：
   上面一排有報告事項的部門（件數；改過還沒儲存的部門有小圓點），一次看一個；下面上一個／下一個部門。
   會長室今天開放時，按這張的「編輯」就能改（每個部門都能改，切換部門不會丟掉；按「儲存」才一起寫回）。沒有報告事項的部門列在最下面一行 */
function renderMeet(){
  const edp=$("#meetEdPanel");if(!edp)return;
  edp.hidden=!CFG.meeting;if(!CFG.meeting)return;
  if(!MT.depts.size&&!MT.loading){mtLoadAll();return}
  const ms=[...MT.depts.values()],has=ms.filter(m=>mtEvs(m).length),none=ms.filter(m=>m.data&&!mtEvs(m).length),errs=ms.filter(m=>!m.data&&m.err!=="還沒有資料");
  if(!has.some(m=>m.id===MTS.sel))MTS.sel=has[0]?has[0].id:"";
  const g=mtGrant(),btn=edp.querySelector("[data-edit]");
  btn.hidden=!g||!fsSecOk("s:meetedit");   /* 會長室今天有開放才有「編輯」（登入才看得到，見 board.css「單卡編輯」段）；firestore 模式要秘書處的編輯者以上（render.js 的 fsSecOk） */
  /* 狀態只寫一行短的 */
  $("#meetEdSt").innerHTML=g?`<span class="grant-on">開放修改中</span> · ${esc(g.by||"會長室")} ${esc((g.at||"").slice(11,16))} 開，今天有效`
    :`<span class="grant-off">未開放修改</span> · 會長室開放當天才能改`;
  $("#meetPick").innerHTML=has.map(m=>`<button type="button" role="tab" class="wk-d" data-mtpick="${esc(m.id)}" aria-selected="${m.id===MTS.sel}">${m.dirty?'<i class="wk-new" aria-label="已修改"></i>':""}${esc(m.name)}<span class="num">${mtEvs(m).length}</span></button>`).join("")
    +(MTS.sel?`<a class="fw-open mt-open" href="?d=${encodeURIComponent(MTS.sel)}" target="_blank" rel="noopener">開啟看板 →</a>`:"");   /* 開啟看板放在部門膠囊那一排的右邊，不另外佔一列 */
  const ed=mtCanEdit()&&mtSrcOk(MTS.sel),loading=MT.loading&&!MT.depts.size?`<p class="sub">讀取各部門資料中…</p>`:"";
  $("#meetEdList").innerHTML=loading+(MTS.sel?mtGroupHTML(MT.depts.get(MTS.sel),ed):MT.depts.size?`<p class="empty">目前沒有部門標「會議要報告」。各部門在自己的即時回報按「會議要報告」後會出現在這裡。</p>`:"")
    +(none.length?`<p class="sub mt-none">沒有報告事項：${none.map(m=>esc(m.name)).join("、")}</p>`:"")
    +(errs.length?`<p class="sub">讀不到：${errs.map(m=>esc(m.name)).join("、")}</p>`:"")+(mtCanEdit()&&!fsMode()&&!ghToken()?`<p class="sub">這台裝置沒有權杖，改了也寫不回其他部門。</p>`:"")
    +(mtCanEdit()&&MTS.sel&&!mtSrcOk(MTS.sel)?`<p class="sub">${fsMode()?"這個部門還在 GitHub，這裡不能改。":"這個部門已搬到新資料庫，秘書處看板也切換後才能在這裡改。"}</p>`:"");
  const i=has.findIndex(m=>m.id===MTS.sel);
  $("#meetStep").innerHTML=has.length>1?`<button type="button" class="icon" data-mtstep="-1"${i>0?"":" disabled"}>${ico("prev")}${i>0?esc(has[i-1].name):"上一個部門"}</button><span class="sub num">${i+1} / ${has.length}</span><button type="button" class="icon" data-mtstep="1"${i<has.length-1?"":" disabled"}>${i<has.length-1?esc(has[i+1].name):"下一個部門"}${ico("next")}</button>`:"";
  const mins=state.minutes||[];
  $("#minutesInfo").textContent=mins.length?`已記錄 ${mins.length} 次會議（最近 ${fmt(mins[mins.length-1].date)}，${mins[mins.length-1].items.length} 項修改）`:"寫回各部門的修改會自動記下來，之後可以匯出成會議紀錄";
  renderWeekRead();renderAgenda();
}
/* 換部門：清單淡出、新部門由下往上淡入 */
function mtPick(id){
  if(!id||id===MTS.sel)return;MTS.sel=id;const box=$("#meetEdList");
  renderMeet();if(box&&!reduceMotion())box.animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"none"}],{duration:MO.base,easing:MO.out});
}
document.addEventListener("click",e=>{
  const t=e.target;if(!t.closest||!t.closest("#meetEdPanel"))return;
  const p=t.closest("[data-mtpick]");if(p){mtPick(p.dataset.mtpick);return}
  const st=t.closest("[data-mtstep]");if(st){const has=[...MT.depts.values()].filter(m=>mtEvs(m).length),i=has.findIndex(m=>m.id===MTS.sel)+(+st.dataset.mtstep);if(has[i]){mtPick(has[i].id);$("#meetEdPanel").scrollIntoView({block:"start",behavior:reduceMotion()?"auto":"smooth"})}return}
  if(t.closest("#minutesBtn"))minutesDialog();
});
/* ---------- 會長室：開放秘書處會議編輯的開關（設定檔 grant:true） ----------
   切到「開放今天」＝寫入 state.meetGrant＝{date:今天,by,at}，立刻儲存並同步（編輯中就併入這次編輯）；隔天自動失效。
   要登入才能切；取消登入或儲存失敗就切回原本的位置。
   firestore 模式（2026-11-20）：寫 grants/meetingEdit（store-write.js 的 setMeetGrant；規則只允許總管理員，同一批稽核紀錄）：
   開放＝到期時間是今天結束（台灣時間隔天 0 點，store-map.js 讀回來就是 date＝今天）；關閉＝到期時間是寫入的那一刻。寫完重新讀會長室看板 */
const grantOn=()=>!!(state.meetGrant&&state.meetGrant.date===today());
/* 會長室的開關（2026-11-06 使用者：不用這麼大，小小一個開關；在「會長室」分頁）：點一下切換，要登入；狀態只寫一句短的 */
function renderGrant(){
  const p=$("#grantPanel");if(!p)return;p.hidden=!CFG.grant;if(!CFG.grant)return;
  const sw=$("#grantSw"),on=grantOn(),g=state.meetGrant;
  sw.setAttribute("aria-checked",on);sw.classList.toggle("on",on);sw.disabled=fsMode()&&fsRole()!=="super";   /* firestore 模式：授權存在 grants/meetingEdit，只有總管理員能切（規則） */
  $("#grantSt").textContent=on?`今天開放中（${g.by||""} ${(g.at||"").slice(11,16)} 開，23:59 自動關閉）`:"關閉：秘書處只能看各部門的報告事項";
  if(!sw._wired){sw._wired=true;sw.addEventListener("click",async()=>{
    if(fsMode()){await fsGrantSet(!grantOn());return}
    const want=!grantOn();sw.classList.toggle("on",want);
    if(readOnly()||!(await ensureLogin())){renderGrant();return}
    await settingSave(()=>{state.meetGrant=want?{date:today(),by:meName(),at:nowStr()}:null},want?"已開放秘書處今天的會議編輯":"已關閉秘書處的會議編輯");
    render()})}
}
let grantBusy=false;
async function fsGrantSet(want){
  if(grantBusy||fsRole()!=="super")return;grantBusy=true;
  const sw=$("#grantSw");sw.classList.toggle("on",want);
  try{
    const W=await storeWriteGet();
    await W.setMeetGrant(CFG.firebase,want?StoreMap.parseTaipei(today()).ms+864e5:null,mtWho()||"會長室");
    try{storeFsUse(await storeFsLoad())}catch(e){fsReadErr("會長室看板",e)}
    toast(want?"已開放秘書處今天的會議編輯":"已關閉秘書處的會議編輯");
  }catch(e){console.error(e);toast(e&&e.code==="permission-denied"?"沒有權限，沒有切換":"切換失敗，請稍後再試")}
  grantBusy=false;render();
}
/* 存回：秘書處自己的資料存完後，改過的部門各自寫回 */
async function mtPushAll(){
  const dirty=[...MT.depts.values()].filter(m=>m.dirty&&m.data);if(!dirty.length)return;
  if(fsMode())return mtPushFs(dirty);
  const cc=cloudCfg(),tok=ghToken(),who=meName()?`秘書處 ${meName()}`:"秘書處";
  if(!tok){toast("沒有權杖，其他部門的修改沒有寫回");return}
  /* 寫回前再讀一次會長室的授權（可能剛被關掉或已過了當天） */
  const pr=await fwLoad("president",true),g=pr&&pr.data&&pr.data.meetGrant;
  if(!g||g.date!==today()){dirty.forEach(m=>{m.data=JSON.parse(JSON.stringify(m.base));m.dirty=false});render();toast("會長室的授權已經關閉或過期，其他部門的修改沒有寫回");return}
  const fails=[],rec=[];
  for(const m of dirty){
    if(deptSourceOf(m.id)!=="github"){fails.push(m.name+(deptSourceOf(m.id)==="frozen"?"（搬家中，暫停編輯）":"（已搬到新資料庫，請到那個部門的看板修改）"));continue}   /* 凍結或已搬家的部門不寫資料檔（store.js） */
    const items=mtDiff(m);
    const d=fwDept(m.id);m.data.savedAt=nowStr();m.data.savedBy=who;
    const body={message:commitMessage(m.base,m.data,who),content:b64enc(JSON.stringify(m.data,null,1)),branch:cc.branch};if(m.sha)body.sha=m.sha;
    try{const r=await fetch(apiURL({...cc,path:d.path}),{method:"PUT",headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+tok,"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(r.ok){const j=await r.json();m.sha=j.content&&j.content.sha;m.base=JSON.parse(JSON.stringify(m.data));m.dirty=false;rec.push(...items)}
      else fails.push(m.name+(r.status===409||r.status===422?"（對方剛存過，請重新整理再改）":""))}
    catch(_){fails.push(m.name)}
  }
  render();toast(fails.length?`沒有寫回：${fails.join("、")}`:`已寫回 ${dirty.map(m=>m.name).join("、")}`);
  if(rec.length){mtRecord(rec);await persist("已記進今天的會議紀錄");render()}   /* 寫回成功的修改記進秘書處自己的資料（state.minutes），再存一次 */
}
/* firestore 模式的寫回（2026-11-20）：跟 GitHub 模式同一個流程——寫回前再讀一次會長室的授權、逐部門寫、成功的記進今天的會議紀錄。
   每個部門用 saveMeeting 寫（只寫規則允許秘書處改的欄位）；寫完重新讀那個部門。失敗的部門畫面上的修改留著（跟 GitHub 模式一樣，重新整理再改） */
const MT_FS_ERR={conflict:"（對方剛存過，請重新整理再改）","permission-denied":"（沒有權限，或會長室的授權已經關閉）","meeting-field":"（有會議裡不能改的欄位）",unavailable:"（沒有連上網路）",badtime:"（時間格式不正確）"};
async function mtPushFs(dirty){
  const pr=await fwLoad("president",true),g=pr&&pr.data&&pr.data.meetGrant;
  if(!g||g.date!==today()){dirty.forEach(m=>{m.data=JSON.parse(JSON.stringify(m.base));m.dirty=false});render();toast("會長室的授權已經關閉或過期，其他部門的修改沒有寫回");return}
  const W=await storeWriteGet(),fails=[],rec=[];
  for(const m of dirty){
    if(!mtSrcOk(m.id)||!m.fs){fails.push(m.name+"（還在 GitHub）");continue}
    const items=mtDiff(m);
    try{await W.saveMeeting(CFG.firebase,m.id,{src:m.fs.src,orig:m.fs.orig,state:m.base},m.data);rec.push(...items)}
    catch(e){console.error(e);fails.push(m.name+(MT_FS_ERR[e&&e.code]||""));continue}
    try{const r=await storeDeptFull(m.id),d=normalize(r.data);Object.assign(m,{data:d,base:JSON.parse(JSON.stringify(d)),fs:{src:r.src,orig:r.orig},dirty:false})}
    catch(e){fsReadErr("讀部門 "+m.id,e);m.base=JSON.parse(JSON.stringify(m.data));m.fs=null;m.dirty=false}   /* 已寫入但重新讀取失敗：先不能再改這個部門，重新整理後再改 */
  }
  render();toast(fails.length?`沒有寫回：${fails.join("、")}`:`已寫回 ${dirty.map(m=>m.name).join("、")}`);
  if(!rec.length)return;
  mtRecord(rec);render();
  try{await W.saveMinutes(CFG.firebase,today(),(state.minutes||[]).filter(x=>x.date===today()));toast("已記進今天的會議紀錄")}
  catch(e){console.error(e);toast("今天的會議紀錄沒有寫進去，請稍後重新整理再看")}
}
/* ---------- 會議紀錄（2026-11-06）：寫回各部門成功時，記下改了哪一筆、哪些欄位、改完的內容 ----------
   state.minutes[]＝{id,date,by:[名字],items:[{dept,deptName,ev,name,desc,times:[{label,start,end,place}],changed:[欄位],before:{desc}|null,at}]}，
   同一天的修改併成一次會議；同一筆改很多次只留一列（欄位累加、內容是最後的樣子、before 是當天第一次改之前的說明）。
   存在秘書處自己的資料檔（公開的 repo）。匯出：選日期 → report.js 的預覽（openReport 第三個參數）→ 存成 PDF */
const MT_F=[["name","名稱"],["desc","說明"],["times","時間"],["links","連結"],["staff","專員"],["labels","標籤"],["issueId","母議題"]];
function mtDiff(m){
  const B=new Map((m.base.events||[]).map(e=>[e.id,e])),out=[];
  (m.data.events||[]).forEach(e=>{const b=B.get(e.id);
    const ch=b?MT_F.filter(([k])=>JSON.stringify(e[k]??null)!==JSON.stringify(b[k]??null)).map(f=>f[1]):["新增"];if(!ch.length)return;
    out.push({dept:m.id,deptName:m.name,ev:e.id,name:e.name,desc:e.desc||"",times:(e.times||[]).map(t=>({label:t.label||"",start:t.start||"",end:t.end||"",place:t.place||""})),changed:ch,before:b?{desc:b.desc||""}:null})});
  return out;
}
function mtRecord(items){
  const day=today(),who=mtWho()||"秘書處";state.minutes=state.minutes||[];
  let mn=state.minutes.find(x=>x.date===day);if(!mn){mn={id:uid("mn"),date:day,by:[],items:[]};state.minutes.push(mn)}
  if(!mn.by.includes(who))mn.by.push(who);
  items.forEach(x=>{const o=mn.items.find(y=>y.dept===x.dept&&y.ev===x.ev);
    if(o)Object.assign(o,{...x,changed:[...new Set([...o.changed,...x.changed])],before:o.before,at:nowStr()});else mn.items.push({...x,at:nowStr()})});
}
/* 匯出：選哪一天的會議；可以順便列出那天沒有修改的報告事項（各部門目前的內容，只有選今天時有意義） */
async function minutesDialog(){
  const mins=[...(state.minutes||[])].sort((a,b)=>b.date.localeCompare(a.date));
  if(!mins.length){await ask("還沒有會議紀錄",[],{note:"會長室開放當天，在這張卡片按「編輯」修改各部門的報告事項、按「儲存」寫回後，修改會自動記下來，就可以匯出會議紀錄。"});return}
  const v=await ask("匯出會議紀錄",[{name:"d",label:"哪一次會議",type:"select",value:mins[0].id,options:mins.map(m=>[m.id,`${fmt(m.date)}（${m.items.length} 項修改）`])},
    {name:"all",label:"也列出沒有修改的報告事項（各部門目前的內容）",type:"check",value:mins[0].date===today()}],
    {note:"會打開會議紀錄的預覽：字都可以直接改，按「存成 PDF」用瀏覽器另存。預覽裡改的字不會存進看板。"});
  if(!v||v==="alt")return;
  const mn=mins.find(m=>m.id===v.d);if(!mn)return;
  openReport(mn.date,mn.date,{label:"會議紀錄",k:"MINUTES",file:`會議紀錄_${mn.date.replaceAll("-","")}`,html:minutesHTML(mn,!!v.all)});
}
function minutesHTML(mn,all){
  const dot=s=>esc(fmt(s).replaceAll("/",".")),when=t=>{const d=(t.start||"").slice(0,10),h=(t.start||"").slice(11,16),e=(t.end||"").slice(0,10),eh=(t.end||"").slice(11,16);
    return `${d?fmt(d).slice(5):""}${h?" "+h:""}${t.end?` – ${e&&e!==d?fmt(e).slice(5):""}${eh?" "+eh:""}`:""}`};
  const order=(window.BOARD_DEPTS||[]).map(d=>d.id),byDept=new Map();
  mn.items.forEach(x=>{if(!byDept.has(x.dept))byDept.set(x.dept,{name:x.deptName,items:[]});byDept.get(x.dept).items.push(x)});
  if(all)MT.depts.forEach(m=>mtEvs(m).forEach(e=>{if(!byDept.has(m.id))byDept.set(m.id,{name:m.name,items:[]});const g=byDept.get(m.id);
    if(!g.items.some(x=>x.ev===e.id))g.items.push({dept:m.id,deptName:m.name,ev:e.id,name:e.name,desc:e.desc||"",times:(e.times||[]).map(t=>({label:t.label||"",start:t.start||"",end:t.end||"",place:t.place||""})),changed:[],before:null})}));
  const depts=[...byDept.entries()].sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
  const N="一二三四五六七八九十";
  const item=x=>`<article class="rpt-issue"><h3>${esc(x.name)}<span class="rpt-st">${x.changed.length?`會議中修改：${esc(x.changed.join("、"))}`:"未修改"}</span></h3>
    ${x.desc?`<p>${esc(x.desc).replace(/\n/g,"<br>")}</p>`:""}
    ${x.times.length?`<h4>時間</h4><ul class="rpt-tl">${x.times.map(t=>`<li><span class="rpt-d">${esc(when(t))}</span>${esc(t.label)}${t.place?`（${esc(t.place)}）`:""}</li>`).join("")}</ul>`:""}
    ${x.before&&x.changed.includes("說明")&&x.before.desc!==x.desc?`<h4>修改前的說明</h4><p class="rpt-none">${esc(x.before.desc)||"（空白）"}</p>`:""}</article>`;
  const body=depts.map(([id,g],i)=>`<h3 class="rpt-h1">${N[i]||i+1}、${esc(g.name)}</h3>${g.items.map(item).join("")}`).join("")||'<p class="rpt-none">這次沒有報告事項</p>';
  const cover=`<section class="rpt-page rpt-cover">
    <div class="cv-top"><div class="cv-org"><span class="cv-logo">${suLogoColor("南臺科大學生會")}</span><b contenteditable="true">${esc(CFG.dept.name||"秘書處")}</b></div><span class="cv-date num" contenteditable="true">${dot(mn.date)}</span></div>
    <div class="cv-mid"><p class="cv-k num">MEETING MINUTES</p><h1 contenteditable="true">會議紀錄</h1><p class="cv-sub" contenteditable="true">${termCfg().yearLabel?esc(termCfg().yearLabel)+"・":""}${dot(mn.date)}</p></div>
    <div class="cv-foot"><div class="cv-col"><span>紀錄</span><span contenteditable="true">${esc(mn.by.join("、"))}</span><span contenteditable="true">南臺科技大學學生會　${esc(CFG.dept.name||"秘書處")}</span></div>
      <div class="cv-col"><span>出席</span><span contenteditable="true" data-ph="出席人員（可留白）"></span><span class="num">製表 ${dot(today())}</span></div></div></section>`;
  return cover+rptCh("mtrep","各部門報告事項",rptAuto(`<div class="rpt-body" contenteditable="true">${body}</div>`))
    +rptCh("free","討論與決議",rptTextBlk("在這裡輸入會議的討論與決議…"))+rptCh("free","臨時動議",rptTextBlk("在這裡輸入臨時動議…"));
}
/* 取消編輯：丟掉其他部門的修改 */
function mtDiscard(){MT.depts.forEach(m=>{if(m.dirty&&m.base){m.data=JSON.parse(JSON.stringify(m.base));m.dirty=false}})}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-mtrefresh]");if(b){MT.at=0;mtLoadAll(true)}});
if(CFG.meeting)document.addEventListener("visibilitychange",()=>{if(!document.hidden)mtLoadAll()});

/* ---------- 秘書處：各部門週報調閱（2026-11-05，使用者要求「秘書處有按鈕可以擷取每個部門的每週概述跟調閱」） ----------
   只讀：直接用上面 MT.depts 讀到的各部門資料（weeks[]），不另外存任何東西。「擷取最新」＝重新讀一次各部門的資料檔。
   上面一排部門膠囊（後面是週報份數；這週有新的亮綠點），下面是選到的部門：週次膠囊（新到舊）＋那一份的全文＋「複製文字」；
   「全部部門最新一份」把每個部門最新那份接在一起，可以一次複製。 */
const WK={dept:"all",week:null,open:new Set()};   /* open：全部最新裡展開的部門 */
function wkThisWeek(d){return !!d&&d>=addDays(today(),-((pd(today()).getDay()+6)%7))}   /* 這週（週一起）產出的 */
function renderWeekRead(){
  const p=$("#wkPanel");if(!p)return;p.hidden=!CFG.meeting;if(!CFG.meeting)return;
  const ms=[...MT.depts.values()],ws=m=>m.data?[...m.data.weeks].filter(w=>w.text).sort((a,b)=>b.date.localeCompare(a.date)):[];
  if(WK.dept!=="all"&&!MT.depts.has(WK.dept))WK.dept="all";
  $("#wkDepts").innerHTML=[`<button type="button" role="tab" class="wk-d" data-wkd="all" aria-selected="${WK.dept==="all"}">全部最新</button>`,
    ...ms.filter(m=>ws(m).length||m.id===WK.dept).map(m=>{const n=ws(m).length,fresh=n&&wkThisWeek(ws(m)[0].date);return `<button type="button" role="tab" class="wk-d${n?"":" none"}" data-wkd="${esc(m.id)}" aria-selected="${WK.dept===m.id}">${fresh?'<i class="wk-new" aria-label="這週有新的"></i>':""}${esc(m.name)}<span class="num">${n}</span></button>`})].join("");
  const body=$("#wkBody");
  if(MT.loading&&!ms.length){body.innerHTML=`<p class="sub">讀取各部門資料中…</p>`;return}
  const block=(m,w,head)=>`<article class="wk-doc" data-wkdoc><div class="wk-top">${head}<span class="num">${esc(fmt(w.date))}</span>${wkThisWeek(w.date)?'<span class="wk-fresh">本週</span>':""}<button type="button" class="icon" data-wkcopy>複製文字</button></div><pre class="wk-text">${esc(w.text)}</pre></article>`;
  if(WK.dept==="all"){
    /* 全部最新：每個部門一顆膠囊（部門、日期、本週），點了才展開全文（2026-11-06 使用者：秘書處太臃腫，要收起來） */
    const cap=(m,w)=>`<details class="ev wk-cap" data-wkdoc data-wkcap="${esc(m.id)}"${WK.open.has(m.id)?" open":""}><summary><b>${esc(m.name)}</b><span class="num wk-date">${esc(fmt(w.date))}</span>${wkThisWeek(w.date)?'<span class="wk-fresh">本週</span>':""}<span class="ev-chev" aria-hidden="true">▾</span></summary>
      <div class="ev-body"><div class="wk-top"><button type="button" class="icon" data-wkcopy>複製文字</button></div><pre class="wk-text">${esc(w.text)}</pre></div></details>`;
    const docs=ms.map(m=>{const w=ws(m)[0];return w?cap(m,w):""}).filter(Boolean);
    const miss=ms.filter(m=>!ws(m).length).map(m=>m.name);
    body.innerHTML=(docs.length?`<div class="wk-all-tools"><button type="button" class="icon" data-wkcopyall>全部複製</button></div><div class="events wk-caps">${docs.join("")}</div>`:`<p class="empty">還沒有任何部門產出週報。</p>`)+(miss.length?`<p class="sub wk-miss">還沒有週報：${miss.map(esc).join("、")}</p>`:"");
    return;
  }
  const m=MT.depts.get(WK.dept),list=ws(m);
  if(!list.length){body.innerHTML=`<p class="empty">${esc(m.name)}${m.data?"還沒有週報。":esc(m.err||"讀不到資料")}</p>`;return}
  const w=list.find(x=>x.id===WK.week)||list[0];
  body.innerHTML=`<div class="wk-weeks" role="tablist" aria-label="週次">${list.slice(0,12).map(x=>`<button type="button" role="tab" class="wk-w" data-wkw="${esc(x.id)}" aria-selected="${x.id===w.id}"><span class="num">${esc(fmt(x.date).slice(5))}</span></button>`).join("")}</div>
    ${block(m,w,`<span class="tag sm">${esc(m.name)}</span>`)}<a class="wk-open" href="?d=${encodeURIComponent(m.id)}" target="_blank" rel="noopener">開啟${esc(m.name)}看板 →</a>`;
}
document.addEventListener("toggle",e=>{const d=e.target;if(!d.matches||!d.matches("#wkBody .wk-cap"))return;if(d.open)WK.open.add(d.dataset.wkcap);else WK.open.delete(d.dataset.wkcap)},true);
document.addEventListener("click",e=>{
  const t=e.target;if(!t.closest||!t.closest("#wkPanel"))return;
  const d=t.closest("[data-wkd]");if(d){WK.dept=d.dataset.wkd;WK.week=null;renderWeekRead();return}
  const w=t.closest("[data-wkw]");if(w){WK.week=w.dataset.wkw;renderWeekRead();return}
  const c=t.closest("[data-wkcopy]");if(c){navigator.clipboard.writeText(c.closest("[data-wkdoc]").querySelector(".wk-text").textContent).then(()=>toast("已複製"),()=>toast("複製失敗"));return}
  if(t.closest("[data-wkcopyall]")){const txt=[...document.querySelectorAll("#wkBody .wk-text")].map(x=>x.textContent).join("\n\n————————\n\n");navigator.clipboard.writeText(txt).then(()=>toast("已複製全部"),()=>toast("複製失敗"))}
});

/* ---------- 秘書處：行政會議資料（2026-11-21 第三版：一份文件、就地編輯；2026-11-23 第四版：文件預覽＋左右工具） ----------
   版面跟工作報告的預覽同一個感覺：中間是白紙文件（沿用工作報告白紙的配色變數），左邊工具（切換會議、加入部門報告）、右邊工具（目前選到那一段：
   換成最新週報、清空、把要報告的卡片名稱與說明貼進文件）；手機（1000px 以下）兩邊工具收成兩列可展開的標題，白紙在下面。點紙上的任何一段＝選到那一段。
   會議分頁的一張卡就是文件本身：像正式文件的樣子直接看（會議名稱與日期、上次決議追蹤、一個部門一段：週報內容、要報告的卡片、結論、臨時項目、整體決議），
   不用先進「編輯模式」。要改的地方點一下就地變成輸入框（半介面化），點別處或 Enter 就收回成文件的樣子；其他地方保持文件原貌。
   - 貼上：文件上面一排部門膠囊（「本週」＝這週有新週報），點一下把該部門最新一份週報放進文件（沒有週報的也能加入、自己寫），之後文字可以直接改；可以移除。
   - 報告的卡片：點開是完整卡片（唯讀；直接改部門卡片要會長室開放當天、走「會議報告事項」那張卡，這裡不寫）；每張底下「這項的結論」、段落尾端「＋ 臨時項目」與「整體決議」（下次議程最前面的「上次決議追蹤」讀這一欄）。
   - 儲存：還沒存過的是草稿（記憶體裡），按「儲存」存成這一天的議程（一天一份）；存過的之後每改一處就自動存。上面一排「今天」「11/13」…可以切到以前的會議。複製文字＝議程＋會議紀錄。
   存在哪：GitHub 模式存進秘書處自己的資料檔（state.agendas）；firestore 模式存 meetingMinutes/{日期} 的 agenda 欄位（秘書處與總管理員讀寫，其他人讀不到）。
   資料：agendas[]＝{id,date,title,by,at,prev,items:[{dept,deptName,weekDate,text,decision,notes{卡片id:結論},extra[{id,title,note}]}]}。畫面插入的文字一律 esc。 */
const AG={card:"",doc:null,busy:false,t:0,ed:null,open:new Set(),again:false,sel:""};   /* sel：右邊工具現在對著哪個部門那一段 */   /* doc：現在看的那份（草稿或存過的）；ed：就地編輯中的欄位 */
/* 各部門最新一份週報（有內容的）：fresh＝這週產出的 */
function agItems(){
  const last=d=>(d&&d.weeks?[...d.weeks].filter(w=>w.text&&String(w.text).trim()).sort((a,b)=>b.date.localeCompare(a.date))[0]:null)||null;
  return (window.BOARD_DEPTS||[]).map(d=>{
    const data=d.id===CFG.deptId?state:MT.depts.get(d.id)&&MT.depts.get(d.id).data;if(!data)return null;
    const w=last(data);
    return {dept:d.id,name:d.name,w,fresh:!!w&&wkThisWeek(w.date)};
  }).filter(Boolean);
}
const agProjects=()=>[];   /* 活動專案：活動部專案卡片（另一個工作）做好後，回傳 [{id,name,text}]；現在沒有資料 */
/* 上次決議追蹤：議程最前面列「日期更早、而且有寫決議的最近一份議程」的各部門決議（沒有決議的部門不列）；存的時候把那份存成 a.prev 快照 */
function agPrev(date){
  const a=[...(state.agendas||[])].filter(x=>x.date<date&&x.items.some(i=>String(i.decision||"").trim())).sort((x,y)=>y.date.localeCompare(x.date))[0];
  return a?{date:a.date,items:a.items.filter(i=>String(i.decision||"").trim()).map(i=>({deptName:i.deptName,decision:String(i.decision).trim()}))}:null;
}
const agWhen=a=>[a.time,a.place].map(v=>String(v||"").trim()).filter(Boolean).join("　");   /* 時間、地點（都可留白） */
function agText(date,items,prev,title,when){
  const trk=prev&&prev.items&&prev.items.length?[`上次決議追蹤（${fmt(prev.date)}）\n`+prev.items.map(i=>`    ${i.deptName}：${i.decision}`).join("\n")]:[];
  return [`${title||"行政會議議程"}　${fmt(date)}${when?"　"+when:""}`,...trk,...items.filter(x=>String(x.text||"").trim()).map(x=>String(x.text).trim())].join("\n\n");
}
const mnData=id=>id===CFG.deptId?state:(MT.depts.get(id)&&MT.depts.get(id).data)||null;
const agCut=(v,n)=>String(v||"").slice(0,n);
/* 封面的學年度學期預設值：設定頁的學年（例「114學年」）加學期（上學期＝第一學期），沒設就留白 */
function agTermDefault(){const t=termCfg(),m=String(t.yearLabel||"").match(/\d+/);return m?`${m[0]} 學年度${t.semester==="up"?"第一學期":t.semester==="down"?"第二學期":""}`:""}
const agDraftOf=date=>{const a=(state.agendas||[]).find(x=>x.date===date);return a?JSON.parse(JSON.stringify(a)):{date,title:"行政會議",term:agTermDefault(),items:[]}};
const agSaved=()=>!!AG.doc&&(state.agendas||[]).some(a=>a.date===AG.doc.date);
const agItemOf=dept=>AG.doc.items.find(i=>i.dept===dept);
const agKeep=i=>String(i.text||"").trim()||String(i.rec||"").trim()||String(i.decision||"").trim()||Object.values(i.notes||{}).some(v=>String(v).trim())||(i.extra||[]).some(x=>x.title||x.note);
/* 複製的文字：議程＋會議紀錄（結論、臨時項目、決議） */
function agDocText(a){
  const L=[agText(a.date,a.items,agPrev(a.date),a.title,agWhen(a))],mn=[];
  {const h=[a.chair?`會議主席：${a.chair}`:"",a.attend?`出席人員：${a.attend}`:""].filter(Boolean);if(h.length)L.splice(1,0,h.join("\n"))}
  a.items.forEach(it=>{
    const rows=[],data=mnData(it.dept);
    Object.entries(it.notes||{}).filter(([,v])=>String(v).trim()).forEach(([id,v])=>{const e=data&&data.events.find(x=>x.id===id);rows.push(`    ${e?e.name:"（已刪除的卡片）"}：${String(v).trim()}`)});
    (it.extra||[]).filter(x=>x.title||x.note).forEach(x=>rows.push(`    ${x.title||"臨時項目"}：${String(x.note||"").trim()}`));
    if(String(it.rec||"").trim())rows.unshift(`    記錄：${String(it.rec).trim()}`);
    if(String(it.decision||"").trim())rows.push(`    決議：${String(it.decision).trim()}`);
    if(rows.length)mn.push(it.deptName,...rows);
  });
  return mn.length?L.concat(["","會議紀錄",...mn]).join("\n"):L.join("\n");
}
/* ---- 畫面 ---- */
const agPh=t=>`<span class="md-ph">${t}</span>`;
/* 文件版面（2026-11-23 起比照行政會議資料範例）：封面、目錄、內文三張紙（.ag-sheet），內文每張有頁首（機密文件章、「單位 學年度 ｜ 會議名稱 會議資料」、日期）與頁尾（標誌、頁碼）；
   內文：會議議程及說明（一段自動產生的說明）、壹 主席致詞（上次決議追蹤）、貳 各部門工作報告（每個部門一段：週報內容照原樣、卡片、紅字「記錄」＝結論／臨時項目／整體決議）。
   封面欄位 term（學年度學期）、chair（主席）、attend（出席人員）是議程的選填字串（跟 time、place 一樣），舊議程沒有就留白。 */
/* 報告卡片在文件裡的「事項」：文件自己的一份文字（it.cards[卡片id]={name,desc}，選填），沒改過就是部門卡片原本的名稱與說明；不會改到部門的卡片 */
const agCardOf=(it,e)=>{const c=(it.cards||{})[e.id];return c?{...e,name:c.name??e.name,desc:c.desc??e.desc}:e};
const AG_N="壹貳參肆伍陸柒捌玖拾";
function agSecHTML(it,x){
  const data=mnData(it.dept),evs=data?data.events.filter(e=>!e.doneAt&&reportOn(e)):[],notes=it.notes||{},extra=it.extra||[],tx=String(it.text||"").trim();
  const empty=!tx&&!String(it.rec||"").trim()&&!evs.length;   /* 還沒有報告事項可以呈現：整段紅色警示，秘書可以直接點下去手動輸入／貼上這個部門的文字 */
  return `<section class="md-sec${it.dept===AG.sel?" is-sel":""}${empty?" is-alert":""}" data-md="${esc(it.dept)}">${tx.includes(it.deptName)?"":`<h5 class="md-h">${esc(it.deptName)}</h5>`}${empty?`<p class="md-alert">${esc(it.deptName)}還沒有報告事項可以呈現：請在下面手動輸入，或把這個部門的文字貼進來。</p>`:""}
    <div class="md-text md-e" data-ed="text" data-d="${esc(it.dept)}" tabindex="0">${tx?esc(it.text):agPh("沒有週報內容，點一下輸入")}</div>
    <div class="md-recx" data-rec="${esc(it.dept)}">${esc(it.rec||"")}</div>
    ${evs.length?`<div class="events mt-list">${withState(data,()=>evs.map(e=>mtEvHTML(agCardOf(it,e),false,AG.open.has(e.id),`<div class="md-lab md-rec">結論</div><div class="md-note md-e" data-ed="note" data-d="${esc(it.dept)}" data-ev="${esc(e.id)}" tabindex="0">${String(notes[e.id]||"").trim()?esc(notes[e.id]):agPh("點一下寫結論")}</div>`)).join(""))}</div>`:""}
    ${extra.map((y,j)=>`<div class="md-ex"><div class="md-ext md-e" data-ed="xt" data-d="${esc(it.dept)}" data-j="${j}" tabindex="0">${y.title?esc(y.title):agPh("臨時項目名稱")}</div><button type="button" class="icon md-x" data-md-xdel="${esc(it.dept)}" data-j="${j}" aria-label="刪除臨時項目">刪除</button><div class="md-note md-e" data-ed="xn" data-d="${esc(it.dept)}" data-j="${j}" tabindex="0">${String(y.note||"").trim()?esc(y.note):agPh("記錄")}</div></div>`).join("")}
    <button type="button" class="ghost add-row md-add" data-md-xadd="${esc(it.dept)}">+ 臨時項目</button>
    <div class="md-send"><button type="button" class="icon" data-md-send="${esc(it.dept)}"${fsMode()&&deptSourceOf(it.dept)==="firestore"?"":" disabled"}>送到部門等待合併</button><span class="sub">${it.sentAt?`上次送出 ${esc(it.sentAt.slice(5,16))}（${it.sentN||0} 項）`:(fsMode()&&deptSourceOf(it.dept)==="firestore"?"":"這個部門還在舊資料，不能送")}</span></div></section>`;
}
const agEd=(k,v,ph,cls="")=>`<span class="md-e${cls?" "+cls:""}" data-ed="${k}" tabindex="0">${v?esc(v):agPh(ph)}</span>`;
function agDocHTML(){
  const d=AG.doc,its=agItems(),prev=agPrev(d.date),proj=agProjects(),secs=its.filter(x=>agItemOf(x.dept)),org="南臺科技大學學生會",title=d.title||"行政會議";
  const hd=`<header class="ag-hd"><span class="ag-stamp">機密文件</span><span class="ag-hdt"><b>${org}${d.term?" "+esc(d.term):""} ｜ ${esc(title)} 會議資料</b><span class="num">${esc(fmt(d.date))}</span></span></header>`;
  const ft=n=>`<footer class="ag-ft"><span class="ag-logo">${suLogoColor("南臺科大學生會")}</span><span class="ag-pn num">－ ${n} －</span></footer>`;
  const cover=`<section class="ag-sheet ag-cover"><div class="ag-cv-mid"><p class="ag-cv-org">－ ${org} ${agEd("term",d.term,"加上學年度學期")} －</p>
      <h3 class="ag-cv-h"><span class="md-title md-e" data-ed="title" tabindex="0">${esc(title)}</span> 會議資料</h3><hr>
      <p class="ag-cv-f"><b>會議日期／時間：</b><span class="md-date md-e" data-ed="date" tabindex="0">${esc(fmt(d.date))}</span>${agEd("time",d.time,"加上時間","md-date")}</p>
      <p class="ag-cv-f"><b>會議地點：</b>${agEd("place",d.place,"加上地點","md-date")}</p>
      <p class="ag-cv-f"><b>會議主席：</b>${agEd("chair",d.chair,"加上主席")}</p>
      <p class="ag-cv-f"><b>出席人員：</b>${agEd("attend",d.attend,"加上出席人員")}</p></div>
    <footer class="ag-ft"><span class="ag-logo">${suLogoColor("南臺科大學生會")}</span></footer></section>`;
  const toc=`<section class="ag-sheet ag-toc">${hd}<h3 class="ag-toc-h">－ 目錄 －</h3><hr>
    <p class="ag-toc-i"><b>壹、 主席致詞</b><span>（請參見資料 第 3 頁）</span></p>
    <p class="ag-toc-i"><b>貳、 各部門工作報告</b><span>（請參見資料 第 3 頁）</span></p>
    ${secs.map((x,i)=>`<p class="ag-toc-s">${"一二三四五六七八九十"[i]||i+1}、${esc(x.name)}</p>`).join("")}${ft(2)}</section>`;
  const when=[fmt(d.date),d.time].filter(Boolean).map(esc).join(" ");
  const body=`<section class="ag-sheet ag-body">${hd}<h3 class="ag-h1">會議議程及說明</h3>
    <p class="ag-intro">本中心於 ${when} 召集本會指定幹部成員，${d.chair?`由學生會${esc(d.chair)}擔任主席，`:""}進行重點議案討論、本會工作進度追蹤報告並執行，以下為本次會議程序及說明摘述：</p>
    <div class="ag-bar"><h4 class="ag-h2">壹、 主席致詞</h4>
    ${prev&&prev.items.length?`<section class="md-sec"><h5 class="md-h">上次決議追蹤<span class="md-chip">${esc(fmt(prev.date))}</span></h5>${prev.items.map(i=>`<p class="md-trk"><b>${esc(i.deptName)}</b>${esc(i.decision)}</p>`).join("")}</section>`:""}
    <h4 class="ag-h2">貳、 各部門工作報告</h4>
    ${secs.map(x=>agSecHTML(agItemOf(x.dept),x)).join("")}
    ${proj.length?`<section class="md-sec"><h5 class="md-h">活動專案</h5>${proj.map(x=>`<p class="md-trk"><b>${esc(x.name)}</b>${esc(x.text||"")}</p>`).join("")}</section>`:""}
    ${secs.length?"":`<p class="md-empty">還沒有部門報告。從左邊「加入部門報告」點一個部門，把它的週報放進文件。</p>`}</div>${ft(3)}</section>`;
  return cover+toc+body;
}
/* 編輯頁（2026-11-23 照 DievE 畫的排版）：最左窄欄＝會議與部門膠囊（點一個部門＝加進文件並選到那一段，已在文件裡的＝跳到那一段），中間白紙，
   右邊上下兩塊：文字備註（選到那一段的純文字記錄，印在紙上該段的紅字「記錄」）、卡片編輯（要報告的卡片、改部門卡片的「會議報告事項」）；
   點哪一塊哪一塊放大、另一塊縮小（#agRight 的 data-focus，flex-grow 平滑過渡）。左欄手機收成一列標題。 */
const agTg=(label)=>`<button type="button" class="ag-tg" data-ag-tg><span class="ag-tgt">${label}</span><span class="ev-chev" aria-hidden="true">▾</span></button>`;
function agLeftHTML(){
  const its=agItems(),fresh=its.filter(x=>x.fresh&&x.w&&!agItemOf(x.dept)),td=today(),cur=AG.doc.date;
  const past=[...(state.agendas||[])].filter(a=>a.date!==td).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6);   /* 今天那場（存過也一樣）只由「今天」膠囊代表 */
  return agTg("會議與部門")+`<div class="ag-tb"><div class="ag-tbi">
    <span class="md-lab">會議</span><div class="wk-depts ag-past" id="agPast" role="tablist" aria-label="會議"><button type="button" class="wk-d" role="tab" data-md-pick="" aria-selected="${cur===td}">今天</button>${past.map(a=>`<button type="button" class="wk-d" role="tab" data-md-pick="${esc(a.date)}" aria-selected="${a.date===cur}">${esc(fmt(a.date).slice(5))}</button>`).join("")}</div>
    <span class="md-lab">部門</span><div class="wk-depts ag-chips">${fresh.length>1?`<button type="button" class="wk-d" data-md-paste="*">全部本週的<span class="num">${fresh.length}</span></button>`:""}${its.map(x=>`<button type="button" class="wk-d${x.w?"":" none"}${agItemOf(x.dept)?" in-doc":""}" data-md-paste="${esc(x.dept)}" aria-pressed="${x.dept===AG.sel&&!!agItemOf(x.dept)}" title="${x.w?(x.fresh?"本週有週報":"最新週報 "+esc(fmt(x.w.date).slice(5))):"沒有週報"}">${x.fresh?'<i class="wk-new" aria-label="這週有新的"></i>':""}${esc(x.name)}</button>`).join("")}</div>
  </div></div>`;
}
/* 右邊兩塊：標題旁寫現在是哪個部門，內容照選到的那一段畫 */
function agNoteHTML(it){
  if(!it)return `<p class="sub">點左邊的部門，把它放進文件；再點紙上的一段，這裡就能寫那一段的純文字記錄。</p>`;
  const last=agItems().find(x=>x.dept===it.dept),data=mnData(it.dept),e=AG.card&&data?data.events.find(x=>x.id===AG.card&&!x.doneAt&&reportOn(x)):null;
  if(e){   /* 點了紙上的某張報告卡：事項（名稱、說明）與結論兩欄 */
    const c=agCardOf(it,e);
    return `<label class="ag-fl">事項</label><input class="ag-rec ag-one" id="agCn" data-agd="${esc(it.dept)}" data-ev="${esc(e.id)}" maxlength="100" value="${esc(c.name)}" placeholder="事項名稱">
      <textarea class="ag-rec" id="agCd" data-agd="${esc(it.dept)}" data-ev="${esc(e.id)}" maxlength="3000" rows="5" placeholder="事項的說明（只改文件裡的文字，不會改到部門的卡片）">${esc(c.desc||"")}</textarea>
      <label class="ag-fl">結論</label><textarea class="ag-rec" id="agCc" data-agd="${esc(it.dept)}" data-ev="${esc(e.id)}" maxlength="1000" rows="4" placeholder="這一項的結論">${esc((it.notes||{})[e.id]||"")}</textarea>
      <div class="ag-btns"><button type="button" class="wk-d" data-md-cardback>回到${esc(it.deptName)}的文字備註</button></div>`;
  }
  return `<textarea class="ag-rec" id="agRec" data-agd="${esc(it.dept)}" maxlength="2000" rows="6" placeholder="不想直接改卡片，就在這裡用文字記錄。會印在文件裡這個部門的下面（紅字「記錄」）。">${esc(it.rec||"")}</textarea>
    <div class="ag-btns"><button type="button" class="wk-d" data-md-refresh${last&&last.w?"":" disabled"}>換成最新週報</button><button type="button" class="wk-d" data-md-clear${String(it.text||"").trim()?"":" disabled"}>清空週報文字</button><button type="button" class="wk-d" data-md-drop="${esc(it.dept)}">從文件移除${esc(it.deptName)}</button></div>`;
}
function agCardToolsHTML(it){
  if(!it)return "";
  const data=mnData(it.dept),evs=data?data.events.filter(e=>!e.doneAt&&reportOn(e)):[];
  return evs.length?`<div class="ag-cards">${evs.map(e=>`<div class="ag-card"><b>${esc(e.name)}</b><button type="button" class="wk-d" data-md-pastecard="${esc(e.id)}" aria-label="把${esc(e.name)}貼進文件">貼進文件</button></div>`).join("")}${evs.length>1?`<button type="button" class="wk-d" data-md-pastecard="*">全部貼進文件</button>`:""}</div>`:`<p class="sub">${esc(it.deptName)}目前沒有標「要報告」的卡片。</p>`;
}
function agRenderTools(){
  const l=$("#agLeft");if(l)l.innerHTML=agLeftHTML();
  const it=agItemOf(AG.sel)||AG.doc.items[0];AG.sel=it?it.dept:"";
  const nm=it?esc(it.deptName):"";
  $("#agNoteD").textContent=it?it.deptName:"";$("#agCardD").textContent=it?it.deptName:"";
  if(!document.activeElement||!document.activeElement.closest||!document.activeElement.closest("#agNoteBody"))$("#agNoteBody").innerHTML=agNoteHTML(it);   /* 正在打字就不重畫（游標才不會跳） */
  $("#agCardTools").innerHTML=agCardToolsHTML(it);
}
function agSelect(dept,scroll){
  if(!dept)return;const same=dept===AG.sel;AG.sel=dept;if(!same)AG.card="";
  document.querySelectorAll("#agDoc .md-sec[data-md]").forEach(x=>x.classList.toggle("is-sel",x.dataset.md===dept));
  if(!same){agRenderTools();if(MTS.sel!==dept){MTS.sel=dept;renderMeet()}}   /* 右下的「會議報告事項」跟著換部門 */
  if(scroll){const el=$(`#agDoc [data-md="${CSS.escape(dept)}"]`);if(el)el.scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"start"})}
}
/* 右邊兩塊：點哪一塊哪一塊放大 */
function agFocus(rb){const r=$("#agRight");if(r&&rb&&r.dataset.focus!==rb)r.dataset.focus=rb}
/* 「會議」分頁裡的入口卡：一小張白紙縮圖（標題、日期時間地點、各部門第一行），整張可點，點了打開 #agOv */
function agPeekHTML(){
  const d=AG.doc,when=[fmt(d.date),d.time,d.place].filter(Boolean).map(esc).join("　");
  const rows=d.items.slice(0,4).map(i=>`<p><b>${esc(i.deptName)}</b>${esc(String(i.text||"").trim().split("\n")[0].slice(0,40))}</p>`).join("");
  return `<span class="ag-pk-p"><span class="ag-pk-t">${esc(d.title||"行政會議")}</span><span class="ag-pk-m">${when}</span>${rows||'<span class="ag-pk-e">還沒有部門報告</span>'}</span><span class="ag-pk-s">${agSaved()?`已存　${esc((d.at||"").slice(5,16))}`:"草稿：還沒存"}・${d.items.length} 個部門</span>`;
}
function renderAgenda(){
  const e=$("#agEntry");if(!e||!$("#agOv"))return;e.hidden=!CFG.meeting;if(!CFG.meeting)return;
  if(!AG.doc)AG.doc=agDraftOf(today());
  $("#agPeek").innerHTML=agPeekHTML();
  if($("#agOv").hidden)return;   /* 還沒打開文件頁：只更新入口縮圖 */
  if(AG.ed)return;   /* 就地編輯中不重畫（游標才不會跳） */
  const y=$("#agDoc"),top=$("#agOv .ag-scroll").scrollTop;y.innerHTML=agDocHTML();$("#agOv .ag-scroll").scrollTop=top;agRenderTools();
  const ok=AG.doc.items.some(agKeep);
  $("#agGo").disabled=AG.busy||!ok;$("#agCopy").disabled=!ok;{const d=$("#agDrive");d.hidden=!driveReady();d.disabled=!ok}
  $("#agSt").textContent=AG.busy?"儲存中…":agSaved()?`已存（${(AG.doc.at||"").slice(5,16)}${AG.doc.by?"　"+AG.doc.by:""}）；之後每改一處會自動存。`:"草稿：還沒存。點文字就地修改，按「儲存」存成這一天的議程。";
}
/* ---- 就地編輯 ---- */
function agPaste(dept){
  if(agItemOf(dept))return;
  const x=agItems().find(i=>i.dept===dept);if(!x)return;
  const order=(window.BOARD_DEPTS||[]).map(d=>d.id);
  AG.doc.items.push({dept,deptName:x.name,weekDate:x.w?x.w.date:"",text:x.w?String(x.w.text):""});
  AG.doc.items.sort((a,b)=>order.indexOf(a.dept)-order.indexOf(b.dept));AG.sel=dept;
}
/* 每種欄位：目前的值、寫回、輸入元件（title／date／xt／dec 是單行，其餘多行） */
const AGF={
  title:{get:()=>AG.doc.title||"",set:v=>{AG.doc.title=agCut(v,30)||"行政會議"},one:true,max:30},
  date:{get:()=>AG.doc.date,set:v=>{if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v!==AG.doc.date){const had=(state.agendas||[]).find(a=>a.date===v);if(had)AG.doc=JSON.parse(JSON.stringify(had));else{AG.doc.date=v;delete AG.doc.id;delete AG.doc.at;delete AG.doc.by;delete AG.doc.prev}}},type:"date",one:true},
  time:{get:()=>AG.doc.time||"",set:v=>{AG.doc.time=agCut(v,20).trim()},one:true,max:20},
  place:{get:()=>AG.doc.place||"",set:v=>{AG.doc.place=agCut(v,40).trim()},one:true,max:40},
  term:{get:()=>AG.doc.term||"",set:v=>{AG.doc.term=agCut(v,30).trim()},one:true,max:30},
  chair:{get:()=>AG.doc.chair||"",set:v=>{AG.doc.chair=agCut(v,40).trim()},one:true,max:40},
  attend:{get:()=>AG.doc.attend||"",set:v=>{AG.doc.attend=agCut(v,200).trim()},one:true,max:200},
  text:{get:o=>agItemOf(o.d).text||"",set:(v,o)=>{agItemOf(o.d).text=agCut(v,6000)},max:6000},
  note:{get:o=>(agItemOf(o.d).notes||{})[o.ev]||"",set:(v,o)=>{const it=agItemOf(o.d);it.notes={...(it.notes||{}),[o.ev]:agCut(v,1000)}},max:1000},
  xt:{get:o=>agItemOf(o.d).extra[+o.j].title||"",set:(v,o)=>{agItemOf(o.d).extra[+o.j].title=agCut(v,100)},one:true,max:100},
  xn:{get:o=>agItemOf(o.d).extra[+o.j].note||"",set:(v,o)=>{agItemOf(o.d).extra[+o.j].note=agCut(v,1000)},max:1000},
  dec:{get:o=>agItemOf(o.d).decision||"",set:(v,o)=>{agItemOf(o.d).decision=agCut(v,300)},one:true,max:300}
};
const agLogin=async()=>{if(await ensureLogin())return true;if(fsMode())toast("需要秘書處的編輯權限才能編輯");return false};
async function agEditStart(el){
  if(AG.ed||el.querySelector("textarea,input"))return;
  if(!(await agLogin()))return;
  const k=el.dataset.ed,f=AGF[k],o={...el.dataset};if(!f||AG.ed)return;
  let val;try{val=f.get(o)}catch(_){return}
  AG.ed={el,k};
  const w=document.createElement(f.one?"input":"textarea");w.className="md-in";w.value=val;if(f.type)w.type=f.type;if(f.max)w.maxLength=f.max;w.spellcheck=false;
  if(!f.one)w.rows=Math.min(18,Math.max(3,val.split("\n").length+1));
  el.replaceChildren(w);el.classList.add("is-ed");w.focus();if(!f.type)w.setSelectionRange(w.value.length,w.value.length);
  let done=false;
  const end=(save)=>{if(done)return;done=true;AG.ed=null;if(save&&w.value!==val){try{f.set(w.value,o)}catch(_){}agChanged()}renderAgenda()};
  w.addEventListener("blur",()=>end(true));
  w.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();end(false)}else if(e.key==="Enter"&&(f.one||e.ctrlKey||e.metaKey)){e.preventDefault();end(true)}});
}
/* 改過：存過的自動存（停 0.9 秒），還沒存的留在草稿 */
function agChanged(){if(agSaved()){clearTimeout(AG.t);AG.t=setTimeout(()=>agSaveDoc(true),900)}}
async function agSaveDoc(quiet){
  if(AG.busy){AG.again=true;return}
  const d=AG.doc,items=d.items.filter(agKeep);if(!items.length)return;
  if(!(await ensureLogin())){if(fsMode())toast("需要秘書處的編輯權限才能儲存");return}
  const had=(state.agendas||[]).find(a=>a.date===d.date);
  const a={...d,id:d.id||(had&&had.id)||uid("ag"),title:d.title||"行政會議",by:mtWho()||"",at:nowStr(),items:items.map(i=>({...i}))},pv=agPrev(a.date);
  if(pv)a.prev=pv;else delete a.prev;
  const ok=await agSave(a,quiet?"":"已儲存","儲存失敗，請稍後再試","沒有權限，沒有儲存");
  if(ok){AG.doc={...a,items:AG.doc.items};AG.doc.at=a.at;AG.doc.by=a.by;AG.doc.id=a.id}
  if(AG.again){AG.again=false;agChanged()}
  renderAgenda();
}
/* 存一份議程：GitHub 模式進秘書處資料檔，firestore 模式進 meetingMinutes/{日期} 的 agenda 欄位 */
async function agSave(a,okMsg,failMsg,denyMsg){
  AG.busy=true;
  const put=()=>{state.agendas=(state.agendas||[]).filter(x=>x.date!==a.date).concat(JSON.parse(JSON.stringify(a)))};
  try{
    if(fsMode()){const W=await storeWriteGet();await W.saveAgenda(CFG.firebase,a.date,a);put();render();if(okMsg)toast(okMsg)}
    else await settingSave(put,okMsg);
    AG.busy=false;return true
  }catch(e){console.error(e);toast(e&&e.code==="permission-denied"?denyMsg:failMsg)}
  AG.busy=false;return false
}
document.addEventListener("toggle",e=>{const d=e.target;if(!d.matches||!d.matches("#agDoc .mt-ev"))return;if(d.open)AG.open.add(d.dataset.mtev);else AG.open.delete(d.dataset.mtev)},true);
document.addEventListener("click",async e=>{
  const t=e.target;if(!t.closest)return;
  if(t.closest("#agPeek")){openAgenda();return}
  if(t.closest("#agClose")){closeAgenda();return}
  if(!t.closest("#agOv"))return;
  const tg=t.closest("[data-ag-tg]");if(tg){tg.closest(".ag-tools").classList.toggle("is-open");return}
  const pk=t.closest("[data-md-pick]");if(pk){clearTimeout(AG.t);AG.doc=agDraftOf(pk.dataset.mdPick||today());AG.sel="";renderAgenda();return}
  const rf=t.closest("[data-md-refresh]");if(rf&&!rf.disabled){if(!(await agLogin()))return;const it=agItemOf(AG.sel),x=agItems().find(i=>i.dept===AG.sel);if(!it||!x||!x.w)return;
    it.text=agCut(String(x.w.text),6000);it.weekDate=x.w.date;agChanged();renderAgenda();toast("已換成最新週報");return}
  const cl=t.closest("[data-md-clear]");if(cl&&!cl.disabled){if(!(await agLogin()))return;const it=agItemOf(AG.sel);if(!it)return;it.text="";agChanged();renderAgenda();return}
  const pc=t.closest("[data-md-pastecard]");if(pc){if(!(await agLogin()))return;const it=agItemOf(AG.sel),data=it&&mnData(it.dept);if(!it||!data)return;
    const all=data.events.filter(e=>!e.doneAt&&reportOn(e)),pick=pc.dataset.mdPastecard==="*"?all:all.filter(e=>e.id===pc.dataset.mdPastecard);if(!pick.length)return;
    const add=pick.map(e=>[e.name,e.desc].filter(v=>String(v||"").trim()).join("\n")).join("\n\n");
    it.text=agCut((String(it.text||"").trim()?String(it.text).trimEnd()+"\n\n":"")+add,6000);agChanged();renderAgenda();toast(pick.length>1?`已貼進 ${pick.length} 張卡片`:"已貼進文件");return}
  if(t.closest("[data-md-goto]")&&!t.closest("[data-md-goto]").disabled){MTS.sel=AG.sel;renderMeet();const el=$("#meetEdPanel");if(el)el.scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"start"});return}
  const sc=t.closest("#agDoc [data-md]");if(sc)agSelect(sc.dataset.md);
  if(t.closest("[data-md-cardback]")){AG.card="";agRenderTools();return}
  const rb=t.closest("#agRight [data-rb]");if(rb)agFocus(rb.dataset.rb);
  const ps=t.closest("[data-md-paste]");if(ps){const dp=ps.dataset.mdPaste;
    if(dp!=="*"&&agItemOf(dp)){agSelect(dp,true);return}   /* 已經在文件裡：選到那一段、捲過去 */
    if(!(await agLogin()))return;
    if(dp==="*")agItems().forEach(x=>{if(x.fresh&&x.w&&!agItemOf(x.dept))agPaste(x.dept)});else agPaste(dp);agChanged();renderAgenda();if(AG.sel){const d=AG.sel;AG.sel="";agSelect(d,true)}return}
  const dr=t.closest("[data-md-drop]");if(dr){if(!(await agLogin()))return;AG.doc.items=AG.doc.items.filter(i=>i.dept!==dr.dataset.mdDrop);agChanged();renderAgenda();return}
  const sd=t.closest("[data-md-send]");if(sd&&!sd.disabled){if(!(await agLogin()))return;const it=agItemOf(sd.dataset.mdSend);if(!it)return;
    if(!agSaved()){toast("先按「儲存」，再送到部門");return}
    clearTimeout(AG.t);await agSaveDoc(true);sd.disabled=true;const n=await mpSend(it);if(n){it.sentAt=nowStr();it.sentN=n;agChanged()}renderAgenda();return}
  const xa=t.closest("[data-md-xadd]");if(xa){if(!(await agLogin()))return;
    const it=agItemOf(xa.dataset.mdXadd);if(!it)return;it.extra=it.extra||[];if(it.extra.length>=20){toast("臨時項目最多 20 個");return}
    it.extra.push({id:uid("x"),title:"",note:""});renderAgenda();agChanged();const r=$(`#agDoc [data-md="${xa.dataset.mdXadd}"] .md-ext:last-of-type`)||[...document.querySelectorAll(`#agDoc [data-md="${xa.dataset.mdXadd}"] [data-ed=xt]`)].pop();if(r)agEditStart(r);return}
  const xd=t.closest("[data-md-xdel]");if(xd){if(!(await agLogin()))return;const it=agItemOf(xd.dataset.mdXdel);if(it&&it.extra)it.extra.splice(+xd.dataset.j,1);agChanged();renderAgenda();return}
  if(t.closest("#agDrive")){const d=t.closest("#agDrive");if(d.disabled)return;const n=`行政會議資料_${AG.doc.date.replaceAll("-","")}`;driveSave(n,driveText(n,agDocText(AG.doc)));return}
  if(t.closest("#agCopy")){navigator.clipboard.writeText(agDocText(AG.doc)).then(()=>toast("已複製議程與會議紀錄"),()=>toast("複製失敗"));return}
  if(t.closest("#agGo")){clearTimeout(AG.t);agSaveDoc(false);return}
  const ed=t.closest("[data-ed]");if(ed&&!t.closest("summary"))agEditStart(ed);
});
document.addEventListener("keydown",e=>{const el=e.target;if(e.key==="Enter"&&el.matches&&el.matches("#agDoc .md-e")&&!el.querySelector("input,textarea")){e.preventDefault();agEditStart(el)}});

/* 會議資料自己一頁（#agOv，常駐在 body，打開才顯示）：跟編輯紀錄、工作報告同一種全螢幕頁，換頁動畫、返回鍵、Esc 都照那兩個的做法（Back.layers.agenda） */
function openAgenda(){
  const ov=$("#agOv");if(!ov||!ov.hidden)return;
  const from=pageUnder(ov);ov.hidden=false;document.body.classList.add("ag-open");Back.layers.agenda();
  renderAgenda();PageFx.swap(from,ov);
}
function closeAgenda(instant){
  const ov=$("#agOv");if(!ov||ov.hidden)return;Back.closed("agenda");
  const done=()=>{ov.hidden=true;document.body.classList.remove("ag-open");renderAgenda()};
  if(instant===true||reduceMotion())return done();
  PageFx.swap(ov,pageUnder(ov),{done});
}
document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.id==="agPeek"){e.preventDefault();openAgenda();return}if(e.key==="Escape"&&$("#agOv")&&!$("#agOv").hidden&&!AG.ed&&!rptOpen&&!$("#dlg").open)closeAgenda()});

/* 文字備註：邊打邊寫進這一段（紙上同步顯示），停 0.9 秒自動存（存過的）；不重畫右邊（agRenderTools 看到游標在裡面就不動） */
document.addEventListener("input",async e=>{
  const ta=e.target;if(!ta.matches||!ta.matches("#agRec"))return;
  if(!(await agLogin())){ta.value=(agItemOf(ta.dataset.agd)||{}).rec||"";return}
  const it=agItemOf(ta.dataset.agd);if(!it)return;it.rec=agCut(ta.value,2000);
  const el=$(`#agDoc [data-rec="${CSS.escape(it.dept)}"]`);if(el)el.textContent=it.rec;agChanged();
});
document.addEventListener("focusin",e=>{const rb=e.target.closest&&e.target.closest("#agRight [data-rb]");if(rb)agFocus(rb.dataset.rb)});

/* 左邊窄欄：滑鼠滾輪本來就能捲；滑鼠按住拖曳也能上下捲（拖超過 5px 就不算點擊） */
document.addEventListener("pointerdown",e=>{
  const l=e.target.closest&&e.target.closest("#agLeft");if(!l||e.pointerType!=="mouse"||e.button||l.scrollHeight<=l.clientHeight)return;
  const y0=e.clientY,s0=l.scrollTop;let drag=false;
  const mv=m=>{if(!drag&&Math.abs(m.clientY-y0)>5)drag=true;if(drag)l.scrollTop=s0-(m.clientY-y0)};
  const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);if(drag)addEventListener("click",x=>{x.stopPropagation();x.preventDefault()},{capture:true,once:true})};
  addEventListener("pointermove",mv);addEventListener("pointerup",up);
});
/* 點紙上的某張報告卡：右下「卡片編輯」展開那一張（會議報告事項照選到的部門） */
document.addEventListener("click",e=>{
  const c=e.target.closest&&e.target.closest("#agDoc [data-mtev]");if(!c)return;
  const id=c.dataset.mtev,sec=c.closest("[data-md]");MTS.open.add(id);
  if(sec){AG.sel=sec.dataset.md;AG.card=id;document.querySelectorAll("#agDoc .md-sec[data-md]").forEach(x=>x.classList.toggle("is-sel",x===sec));agRenderTools();agFocus("note")}   /* 右邊「文字備註」切到那一項的事項與結論 */
  setTimeout(()=>{renderMeet();const t=document.querySelector(`#agCardHost [data-mtev="${CSS.escape(id)}"]`);if(t){t.open=true;t.scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"nearest"})}},0);
});

/* 單項報告事項的「事項」「結論」：右邊文字備註裡改，邊打邊存進議程（事項放 it.cards，結論放 it.notes），紙上稍後同步 */
let agRedraw=0;
document.addEventListener("input",async e=>{
  const ta=e.target;if(!ta.matches||!ta.matches("#agCn,#agCd,#agCc"))return;
  if(!(await agLogin()))return;
  const it=agItemOf(ta.dataset.agd);if(!it)return;const id=ta.dataset.ev;
  if(ta.id==="agCc")it.notes={...(it.notes||{}),[id]:agCut(ta.value,1000)};
  else{it.cards={...(it.cards||{})};const c={...(it.cards[id]||{})};c[ta.id==="agCn"?"name":"desc"]=agCut(ta.value,ta.id==="agCn"?100:3000);it.cards[id]=c}
  agChanged();clearTimeout(agRedraw);agRedraw=setTimeout(renderAgenda,300);
});
