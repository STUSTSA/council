/* 核心｜所有點擊／輸入／拖曳事件 */
/* ---------- events ---------- */
document.addEventListener("click",async e=>{
  const t=e.target;
  const jump=t.closest("[data-jump]");
  /* 進度卡片：點甘特圖的議題列換成該議題詳情，按返回回到甘特圖 */
  const wkf=t.closest("[data-wk]");if(wkf){e.preventDefault();Sfx.play("enter");doneWeekShow(wkf.dataset.wk);return}   /* 完成紀錄：點週資料夾進去那一週（views.js） */
  if(jump&&!t.closest("[data-marker]")){e.preventDefault();if(curSec!=="progress")setSection("progress",{instant:true});progShow(jump.dataset.jump);return}
  /* 單卡編輯（render.js 的 startEdit／cancelEdit）：卡片上的「編輯」、編輯中那張的「取消｜儲存」 */
  const edb=t.closest("[data-edit]");if(edb){e.preventDefault();e.stopPropagation();await startEdit(edb.dataset.edit);return}
  if(t.closest("[data-edcancel]")){cancelEdit();return}
  if(t.closest("[data-edsave]")){if(!fldCommitOpen())return;await saveFlow();return}   /* 還開著的那一欄先存回（填錯就停在原欄） */
  if(t.closest("[data-copyweek]")){const bt=t.closest("[data-copyweek]");const w=state.weeks.find(x=>x.id===t.closest("[data-week]").dataset.week);copyText(w.text);bt.classList.add("copied");bt.innerHTML="已複製"+ico("check","sm");clearTimeout(bt._t);bt._t=setTimeout(()=>{bt.classList.remove("copied");bt.textContent="複製文字"},1500);return}
  if(t.closest("[data-genweek]")&&readOnly()){
    const r=buildWeekly();
    const v=await ask("生成每週報告",[{name:"text",label:`統計期間 ${fmt(r.start)} 之後 – ${fmt(r.end)}（唯讀版不會儲存，按確定即複製全文）`,type:"textarea",value:r.text}],{wide:true});
    if(v&&v.text)copyText(v.text);return}
  if(t.closest("[data-genweek]")&&!readOnly()){
    const r=buildWeekly();
    const v=await ask("生成每週報告",[{name:"date",label:"日期",type:"date",value:r.end},{name:"text",label:`內容（${fmt(r.start)} 之後 – ${fmt(r.end)}）`,type:"textarea",value:r.text}],{wide:true});
    if(v&&v.text){{const nw={id:uid("w"),date:v.date||r.end,text:v.text,auto:true};state.weeks.push(nw);newWeekId=nw.id;(openWeeks=openWeeks||new Set()).add(nw.id);setTimeout(()=>{newWeekId=null},1500)}snapshotBase(v.date||r.end);if(editing)changed();else save();toast("已產生並存成每週報告")}return}
  /* 每週報告（完成紀錄的週頁，views.js 的 repHTML）：登入就能新增、修改、刪除，按確定直接儲存（沒有編輯階段） */
  if(t.closest("[data-addweek],[data-editweek],[data-delweek]")&&!canEdit())return;
  if(t.closest("[data-delweek],[data-deldone],[data-delissue]")&&!fsDelOk())return;   /* firestore 模式：議題、週報只有部門管理員與總管理員能刪（規則要求同批寫刪除紀錄，02D D-d） */
  const aw=t.closest("[data-addweek]");
  if(aw){
    const last=[...state.weeks].sort((a,b)=>b.date.localeCompare(a.date))[0];
    const v=await ask("新增每週報告",[{name:"date",label:"日期",type:"date",value:wkStart(today())===aw.dataset.addweek?today():addDays(aw.dataset.addweek,6)},{name:"text",label:"內容",type:"textarea",value:last?last.text:""}],{wide:true});
    if(v&&v.text)await settingSave(()=>{const nw={id:uid("w"),date:v.date||today(),text:v.text};state.weeks.push(nw);newWeekId=nw.id;(openWeeks=openWeeks||new Set()).add(nw.id);setTimeout(()=>{newWeekId=null},1500);snapshotBase(v.date||today())},"已新增每週報告");return}

  const wk=t.closest("[data-week]");
  if(wk&&t.closest("[data-editweek]")){const w=state.weeks.find(x=>x.id===wk.dataset.week);
    const v=await ask("編輯每週報告",[{name:"date",label:"日期",type:"date",value:w.date},{name:"text",label:"內容",type:"textarea",value:w.text}],{wide:true,danger:fsDelOk()?"刪除此週":undefined});
    if(v)await settingSave(()=>{if(v==="delete")state.weeks=state.weeks.filter(x=>x!==w);else Object.assign(w,{date:v.date||w.date,text:v.text})},v==="delete"?"已刪除每週報告":"已更新每週報告");return}
  if(wk&&t.closest("[data-delweek]")){e.preventDefault();const w=state.weeks.find(x=>x.id===wk.dataset.week);const v=await ask(`刪除 ${fmt(w.date)} 的每週報告？`,[],{danger:"刪除"});if(v==="delete")await settingSave(()=>{state.weeks=state.weeks.filter(x=>x!==w)},"已刪除每週報告");return}

  /* small events（即時回報） */
  /* 新增即時回報（右下角的浮動圓鈕，只有 canEdit 時算數：唯讀檢視中圓鈕正在消失時點到也不算）：開始編輯一張空白的卡片（打開、游標在名稱）；什麼都沒填就點外面＝不留（live.js 的 kpCommit） */
  if(t.closest("#addEvent")&&!editing&&canEdit()){const ev={id:uid("e"),name:"新的即時回報",desc:"",blocks:[],createdAt:today(),staff:[],links:[],times:[],round:1,touched:[]};
    if(await startEdit("e:"+ev.id,()=>{evTouch(ev);state.events.push(ev);lcSet("live",ev.id);dirty=true})){lcOpened("live");kpFocus("title",true)}return}
  /* 「+ 議題」：加一個議題、換到它的詳情，游標直接在名稱上（整段選取，打字就換掉；沒有對話框）；沒命名就點外面／Esc＝不留（inmCommit） */
  if(t.closest("#addIssue")&&!editing){const it={id:uid("i"),title:"新"+ISS,tags:[...CFG.stageTags],cur:0,start:"",end:"",doneAt:null,markers:[],links:[]};
    if(await startEdit("i:"+it.id,()=>{state.issues.push(it);keepIds.add(it.id);inm={id:it.id,isNew:true};dirty=true}))progShow(it.id,()=>inmFocus(true));return}
  /* 議題詳情：點名稱＝原地改名稱 */
  const ing=t.closest("[data-iname-go]");if(ing){if(!editing&&canEdit()){const id=ing.closest("[data-issue]").dataset.issue;if(await startEdit("i:"+id,()=>{const it=state.issues.find(i=>i.id===id);inm={id,isNew:false,orig:it?it.title:""}}))inmFocus(false)}return}
  /* 以下都是編輯中那張卡片裡的工具（即時回報卡的原位編輯在 live.js） */
  if(!editing)return;

  /* 完成紀錄卡片（編輯中）的「移回即時回報」「刪除」：卡片會離開原本的位置（找不到它的「儲存」），做完直接儲存、結束這次編輯。
     即時回報卡的完成、刪除是拖到角落（live.js 的 lvComplete／lvDelete） */
  const evAct=t.closest("[data-evundo],[data-evdel]");
  if(evAct){e.preventDefault();const ev=evOf(evAct);
    if(evAct.dataset.evundo!==undefined){if(!fldCommitOpen())return;ev.doneAt=null;evTouch(ev);syncLink(ev);dirty=true;await saveFlow()}
    else{const n=(ev.times||[]).length;   /* 刪除是永久的（D16）：有時間標記再確認一次，寫出會一起刪掉幾個 */
      const v=await ask((ev.name||"").trim()?`刪除「${ev.name.trim()}」？`:"刪除這張卡片？",[],{danger:"刪除"});if(v!=="delete")return;
      if(n&&await ask(`一起刪掉 ${n} 個時間標記？`,[],{danger:"刪除"})!=="delete")return;
      {unlinkEv(ev);state.events=state.events.filter(x=>x!==ev);evFld=null;dirty=true;await saveFlow()}}
    return}
  /* 逐欄編輯（只在編輯中出現）：點一欄＝原本開著的那欄先存回（填錯就停在原欄），再打開這一欄；data-evfx＝取消／完成／刪除 */
  const pen=t.closest("[data-evpen]");if(pen){const id=evOf(pen).id,k=pen.dataset.evpen;
    if(!fldCommitOpen())return;ifFld=null;evFld={ev:id,k};render();evFldFocus();return}
  const fx=t.closest("[data-evfx]");if(fx){evFldAct(fx);return}
  /* 進度、完成紀錄的逐欄編輯（跟即時回報同一套；畫面在 views.js 的 issueFieldsHTML／doneFieldsHTML） */
  const ipen=t.closest("[data-ifpen]");if(ipen){const r=ipen.closest("[data-ifid]");
    if(!fldCommitOpen())return;evFld=null;ifFld={t:r.dataset.ift,id:r.dataset.ifid,k:ipen.dataset.ifpen};render();ifFldFocus();return}
  const ifx=t.closest("[data-iffx]");if(ifx){ifFldAct(ifx);return}

  /* issues */
  if(t.closest("#autoRange")){const ds=state.issues.flatMap(i=>[i.start,i.end,...i.markers.map(m=>m.date)]).filter(Boolean).sort();if(!ds.length){toast("還沒有填日期的"+ISS);return}state.range={start:ds[0].slice(0,7),end:ds[ds.length-1].slice(0,7)};changed();return}
  const it=findIssue(t);if(!it)return;
  if(t.closest("[data-restore]")){if(!fldCommitOpen())return;it.doneAt=null;dirty=true;await saveFlow();toast("已取消結案，移回進行中");return}   /* 卡片會離開完成紀錄：直接儲存 */
  /* 結案／取消結案（編輯中，卡片工具列）：結案的議題儲存後移到完成紀錄 */
  if(t.closest("[data-closeissue]")){it.doneAt=it.doneAt?null:today();keepIds.add(it.id);changed();toast(it.doneAt?"已結案，儲存後移到完成紀錄":"已取消結案");return}
  if(t.closest("[data-deldone]")||t.closest("[data-delissue]")){e.preventDefault();const v=await ask(`刪除「${it.title}」？`,[],{danger:"刪除議題"});if(v==="delete"){state.issues=state.issues.filter(x=>x!==it);ifFld=null;dirty=true;await saveFlow()}return}   /* 刪掉了就沒有「儲存」可按：直接儲存 */
  const mv=t.closest("[data-move]");
  if(mv){const list=activeIssues();const k=list.indexOf(it),o=list[k+(+mv.dataset.move)];if(o){const a=state.issues.indexOf(it),b=state.issues.indexOf(o);[state.issues[a],state.issues[b]]=[o,it];changed()}return}
  if(t.closest("[data-addmarker]")){const tr=t.closest("[data-issue]").querySelector(".c-track");tr.scrollIntoView({behavior:"smooth",block:"center"});makePending(tr,schedPct(it)??50);toast("把虛線標記拖到想要的位置後放開");return}
});
document.addEventListener("toggle",e=>{const d=e.target;if(d.classList&&d.classList.contains("week")&&!d.classList.contains("closing")){openWeeks=openWeeks||new Set();d.open?openWeeks.add(d.dataset.week):openWeeks.delete(d.dataset.week)}},true);
["rStart","rEnd"].forEach(id=>$("#"+id).addEventListener("change",e=>{const k=id==="rStart"?"start":"end";if(e.target.value){state.range[k]=e.target.value;if(state.range.end<state.range.start)state.range.end=state.range.start;changed()}}));

/* ---------- 議題名稱的原位編輯（畫面在 views.js 的 cardHTML；DESIGN-next 第八節、第十三節，交接檔第九節） ----------
   Enter＝存檔；點外面、Esc＝跟點外面一樣存檔並離開（卡片編輯中 Esc＝點外面）。名稱空白：Enter 提示「請填名稱」留在原地，點外面／Esc＝不改。
   新增的議題沒有命名（空白或還是「新議題」）就點外面／Esc＝不留；按 Enter＝照這個名稱留下。存檔走 saveFlow（同議題的「儲存」），取消存檔時留在原地 */
let inmBusy=false,inmDown=0;
function inmFocus(all){const f=$("#cardDetail [data-iname]");if(!f)return;f.focus({preventScroll:true});if(all)f.select();else f.setSelectionRange(f.value.length,f.value.length)}
async function inmCommit(how){
  if(!inm||inmBusy||!editing||cardEdit!=="i:"+inm.id)return;
  const {id,isNew}=inm,it=state.issues.find(i=>i.id===id),f=$("#cardDetail [data-iname]");
  if(!it){inm=null;return}
  const v=(f?f.value:it.title).trim();
  if(!v&&how==="enter"){toast("請填名稱");if(f){f.classList.add("bad");f.focus()}return}
  if(!v||(isNew?how!=="enter"&&v==="新"+ISS:v===inm.orig)){inm=null;cancelEdit();if(isNew)pvIn($("#pvGantt"));return}   /* 沒改（跟開始改名時的原名比，不跟 it.title 比：上一次存檔被取消時 it.title 已經是新名稱）：只離開；新增的沒命名：不留，回甘特圖 */
  it.title=v;dirty=true;inmBusy=true;
  try{await saveFlow()}finally{inmBusy=false}
}
document.addEventListener("keydown",e=>{
  const t=e.target;if(!t.matches)return;
  if(t.matches("[data-iname-go]")&&(e.key==="Enter"||e.key===" ")){e.preventDefault();t.click();return}
  if(!inm||!t.matches("[data-iname]"))return;
  if(e.key==="Enter"&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();inmCommit("enter")}
  else if(e.key==="Escape"&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();inmCommit("esc")}   /* 注音選字中的 Esc 給輸入法（取消選字），不存檔 */
},true);
document.addEventListener("input",e=>{if(e.target.matches&&e.target.matches("[data-iname]"))e.target.classList.remove("bad")});
/* 點外面（對話框、下拉選單、提示訊息不算）；用鍵盤 Tab 離開也一樣（滑鼠、手指按下時交給 click） */
document.addEventListener("pointerdown",()=>{inmDown=performance.now()},true);
document.addEventListener("click",e=>{const t=e.target;if(inm&&t.closest&&!t.closest("[data-iname],#dlg,.csel-list,#toast"))inmCommit("out")},true);
document.addEventListener("focusout",e=>{if(inm&&e.target.matches&&e.target.matches("[data-iname]")&&e.relatedTarget&&!e.relatedTarget.closest("#dlg")&&performance.now()-inmDown>600)inmCommit("out")});

const evOf=el=>{const m=mtOf(el);return (m?m.data:state).events.find(x=>x.id===el.closest("[data-ev]").dataset.ev)};   /* 元素所在的即時回報（膠囊、完成紀錄、右側詳情都帶 data-ev）；秘書處面板裡的卡片屬於別的部門（meeting.js） */
/* ---------- 即時回報的逐欄編輯（畫面在 views.js 的 evFieldsHTML） ----------
   按「完成」（或點別欄、按卡片的「儲存」）寫回 state；按「取消」（或 Esc）放棄這一欄的修改。Enter＝完成，說明欄是 Ctrl／⌘＋Enter（鍵盤處理在本檔後面） */
function evFldFocus(){fldFocus($("#evDetail .evf.open")||document.querySelector("#events .evf.open"))}
function ifFldFocus(){fldFocus($("#doneDetail .evf.open")||document.querySelector(".evf.open[data-iffk]"))}
/* 點別欄時，先把目前打開的那一欄存回（即時回報或進度／完成紀錄）；填錯回傳 false、停在原欄 */
function fldCommitOpen(){const cur=document.querySelector(".evf.open");if(!cur)return true;return cur.dataset.iffk!==undefined?ifFldWrite(cur):evFldCommit(cur)}
function fldFocus(box){
  if(!box)return;
  const f=box.querySelector("[data-e],.csel-btn,input[type=checkbox]");if(f){f.focus({preventScroll:true});if(f.select&&f.type!=="date")f.select()}
  box.scrollIntoView({block:"nearest",behavior:reduceMotion()?"auto":"smooth"});
}
function evFldAct(fx){
  const box=fx.closest(".evf"),ev=evOf(box),k=box.dataset.evfk,a=fx.dataset.evfx;
  if(a==="color"){const c=COLORS[(COLORS.indexOf(fx.dataset.c)+1)%COLORS.length];fx.dataset.c=c;fx.style.background=c;return}
  if(a==="cancel"){evFld=null;render();return}
  const tid=k.startsWith("t:")?k.slice(2):null,lid=k.startsWith("l:")?k.slice(2):null;
  if(a==="ok"){if(evFldCommit(box)){evFld=null;changed()}return}
  if(a==="del"){
    if(mtOf(box)&&fsMode())return;   /* 秘書處在 firestore 模式的會議編輯不能刪時間標記、超連結（畫面沒有這個鈕；規則也不允許） */
    const run=()=>{if(tid)ev.times=ev.times.filter(x=>x.id!==tid);if(lid)ev.links=ev.links.filter(x=>x.id!==lid);evTouch(ev);syncLink(ev)},m=mtOf(box);
    if(m){withState(m.data,run);m.dirty=true}else run();
    evFld=null;changed();return}
}
/* 把打開的那一欄寫回 state（不重畫；有改才算更新並標 dirty）；填錯回傳 false、停在原欄 */
function evFldCommit(box){
  const m=mtOf(box);if(!m)return evFldWrite(box);
  const r=withState(m.data,()=>evFldWrite(box));if(JSON.stringify(m.data)!==JSON.stringify(m.base))m.dirty=true;return r;   /* 秘書處改別的部門：在那個部門的資料上寫 */
}
function evFldWrite(box){
  const ev=evOf(box),before=JSON.stringify(ev);
  if(!fldApply(box,ev,box.dataset.evfk))return false;
  if(JSON.stringify(ev)===before)return true;   /* 沒改東西：不算「更新」，燈號不動 */
  evTouch(ev);syncLink(ev);dirty=true;return true;
}
/* ---------- 進度、完成紀錄的逐欄編輯：按鈕與存回 ----------
   跟即時回報一樣：按「完成」才寫回 state；議題的階段（stg）在打開的欄位裡直接加列、刪列、換「目前」，按完成才一起存 */
const ifObj=box=>(box.dataset.ift==="e"?state.events:state.issues).find(x=>x.id===box.dataset.ifid);
function ifFldAct(fx){
  const box=fx.closest("[data-iffk]"),a=fx.dataset.iffx;
  if(a==="color"){const c=COLORS[(COLORS.indexOf(fx.dataset.c)+1)%COLORS.length];fx.dataset.c=c;fx.style.background=c;return}
  if(a==="stgadd"){const list=box.querySelector(".stg-list");list.insertAdjacentHTML("beforeend",stageRowHTML("",!list.querySelector('.stg-cur[aria-pressed="true"]')));list.lastElementChild.querySelector("input").focus();return}
  if(a==="stgdel"){const row=fx.closest(".stg-row"),was=row.querySelector('.stg-cur[aria-pressed="true"]');row.remove();if(was)box.querySelector(".stg-cur")?.setAttribute("aria-pressed","true");return}
  if(a==="stgcur"){box.querySelectorAll(".stg-cur").forEach(b=>b.setAttribute("aria-pressed",b===fx));return}
  if(a==="cancel"){ifFld=null;render();return}
  if(a==="ok"){if(ifFldWrite(box)){ifFld=null;changed()}return}
  if(a==="del"){const o=ifObj(box),lid=box.dataset.iffk.slice(2);o.links=o.links.filter(x=>x.id!==lid);ifFld=null;changed();return}
}
/* 把打開的那一欄寫回 state（不重畫；有改才標 dirty）；填錯回傳 false、停在原欄。完成紀錄裡的即時回報改了名稱、日期、母議題，同步母議題的處理紀錄 */
function ifFldWrite(box){
  const o=ifObj(box);if(!o)return true;
  const before=JSON.stringify(o);
  if(!fldApply(box,o,box.dataset.iffk))return false;
  if(JSON.stringify(o)===before)return true;
  if(box.dataset.ift==="e")syncLink(o);
  dirty=true;return true;
}
/* 逐欄編輯的寫回（即時回報、議題、完成紀錄、秘書處會議卡共用一份）：把打開的那一欄 k 的值寫進 o；填錯回傳 false、停在原欄。
   k＝name／title／desc／note／dates／stage／staff／labels／done／issue／t:時間標記 id／l:連結 id（t:+、l:+ 是新增） */
function fldApply(box,o,k){
  const g=n=>box.querySelector(`[data-e="${n}"]`),bad=n=>{Sfx.play("no");g(n).classList.add("bad");g(n).focus();return false};
  if(k==="title"||k==="name"){const v=g(k).value.trim();if(!v){toast("請填名稱");return bad(k)}o[k]=v}
  else if(k==="note")o.note=g(k).value.trim();
  else if(k==="desc"){const v=g(k).value.trim(),m=descTooBig(v);if(m){toast(m);return bad(k)}evSetDesc(o,v)}   /* 即時回報的說明（會議卡、完成紀錄）：照文字重建逐行內容，沒改的行沿用；超過行數、字數上限給明確訊息（不然存檔時才被規則擋成「沒有權限」；03 審查 P2-2） */
  else if(k==="dates"){const a=g("start").value,b=g("end").value;if(a&&b&&b<a){toast("結束日不能早於開始日");return bad("end")}o.start=a;o.end=b}
  else if(k==="stage"){const rows=[...box.querySelectorAll(".stg-row")].map(r=>({n:r.querySelector("input").value.trim(),cur:r.querySelector(".stg-cur").getAttribute("aria-pressed")==="true"})).filter(r=>r.n);
    o.tags=rows.map(r=>r.n);o.cur=Math.max(0,rows.findIndex(r=>r.cur))}
  else if(k==="staff")o.staff=[...box.querySelectorAll('input[name="staff"]:checked')].map(x=>x.value);
  else if(k==="labels")o.labels=[...box.querySelectorAll('input[name="labels"]:checked')].map(x=>x.value);
  else if(k==="done"){const v=g("done").value;if(!v){toast("請選完成日期");return bad("done")}o.doneAt=v}
  else if(k==="issue"){const v=box.querySelector('input[name="evIssue"]').value||null;
    if(v!==(o.issueId||null)){o.issueId=v;if(box.dataset.evfk)toast(v?`已連結到「${parentOf(o).title}」`:"已取消連結")}}
  else if(k.startsWith("t:")){const tid=k.slice(2),r=evTimeParts({label:g("label").value.trim(),sd:g("sd").value,st:g("st").value,ed:g("ed").value,et:g("et").value});
    if(r.msg){toast(r.msg);return false}
    const v={label:g("label").value.trim(),start:r.start,end:r.end,place:(g("place")?g("place").value.trim():""),toIssue:!!(g("toIssue")&&g("toIssue").checked)};
    if(tid==="+")o.times.push({id:uid("t"),...v});else Object.assign(o.times.find(x=>x.id===tid),v)}
  else if(k.startsWith("l:")){const lid=k.slice(2),v={name:g("name").value.trim(),url:g("url").value.trim(),color:box.querySelector("[data-c]").dataset.c};
    if(!v.name){toast("請填按鈕名稱");return bad("name")}
    if(lid==="+")o.links.push({id:uid("l"),...v});else Object.assign(o.links.find(x=>x.id===lid),v)}
  return true;
}
/* 說明欄的行數、每行字數上限（逐欄編輯的說明欄、右側詳情「完成這一段」共用；上限跟原位編輯器、資料庫規則同一組 StoreMap.BLK_MAX／TXT_MAX） */
const descTooBig=t=>{const L=String(t||"").split("\n");return L.length>StoreMap.BLK_MAX?`最多 ${StoreMap.BLK_MAX} 行`:L.some(l=>l.length>StoreMap.TXT_MAX)?`每行最多 ${StoreMap.TXT_MAX} 字`:""};
/* 打開的欄位（秘書處會議卡、進度、完成紀錄）：Esc＝取消；Enter（說明欄 Ctrl／⌘＋Enter）＝完成。
   即時回報卡（檢視中）的一行、名稱可以用鍵盤進入編輯（Enter／空白鍵，跟點一下一樣） */
document.addEventListener("keydown",e=>{
  const box=e.target.closest&&e.target.closest(".evf.open");if(!box||document.querySelector(".csel.open"))return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();evFld=null;ifFld=null;render();return}
  const ok=box.querySelector('[data-evfx="ok"],[data-iffx="ok"]');if(!ok)return;
  if(e.key==="Enter"&&!e.isComposing&&e.target.matches("input[data-e],input[data-stg]")){e.preventDefault();ok.click()}
  if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&e.target.matches("textarea[data-e]")){e.preventDefault();ok.click()}
},true);
/* markers on cards: press-and-drag to place a new one, drag to move, click to edit */
let drag=null;
function makePending(tr,pct){
  tr.querySelector(".marker.pending")?.remove();
  const el=document.createElement("div");el.className="marker up pending";el.dataset.marker="__pending";
  el.style.left=pct+"%";el.style.setProperty("--mc","var(--tone)");
  el.innerHTML='<span class="stem"></span><span class="dot"></span><span class="lbl">拖到位置後放開</span>';
  tr.append(el);layoutTrack(tr);return el;
}
async function finishPending(it,at){
  const v=await ask("新增註記",markerFields({at:Math.round(at),date:hasDates(it)?dateAtPct(it,at):today(),pos:"up",stage:it.tags[it.cur]||""},it));
  if(v&&v.text){it.markers.push(applyMarker({id:uid("m"),at:Math.round(at)},v,it));changed()}else render();
}
document.addEventListener("pointerdown",e=>{
  if(!editing||e.button>0)return;{const c=e.target.closest&&e.target.closest("[data-issue]");if(!c||!cardEd("i",c.dataset.issue))return}   /* 只有編輯中的那個議題可以加、拖註記 */
  const m=e.target.closest("[data-marker]");
  if(m){e.preventDefault();const tr=m.closest("[data-track]");drag={m,tr,it:findIssue(m),id:m.dataset.marker,x0:e.clientX,moved:false,pending:m.classList.contains("pending"),pct:parseFloat(m.style.left)};m.setPointerCapture(e.pointerId);return}
  const tr=e.target.closest(".c-track");if(!tr)return;
  e.preventDefault();const r=tr.getBoundingClientRect();const pct=clamp((e.clientX-r.left)/r.width*100);
  const el=makePending(tr,pct);drag={m:el,tr,it:findIssue(tr),x0:e.clientX,moved:true,pending:true,pct};tr.setPointerCapture(e.pointerId);
});
document.addEventListener("pointermove",e=>{
  if(!drag)return;if(Math.abs(e.clientX-drag.x0)>3)drag.moved=true;if(!drag.moved)return;
  const r=drag.tr.getBoundingClientRect();drag.pct=clamp((e.clientX-r.left)/r.width*100);drag.m.style.left=drag.pct+"%";
  const lbl=drag.pending&&drag.m.querySelector(".lbl");if(lbl)lbl.textContent=hasDates(drag.it)?fmt(dateAtPct(drag.it,drag.pct)).slice(5):Math.round(drag.pct)+"%";
});
document.addEventListener("pointerup",async()=>{
  if(!drag)return;const d=drag;drag=null;
  if(d.pending){finishPending(d.it,d.pct);return}
  const mk=d.it.markers.find(x=>x.id===d.id);
  if(d.moved){mk.at=Math.round(d.pct);if(hasDates(d.it))mk.date=dateAtPct(d.it,d.pct);changed();return}   /* 有期間的議題：拖到哪就是哪一天 */
  editMarker(d.it,mk);
});
/* import data from a backup / older version file */
$("#importFile").addEventListener("change",async e=>{
  const f=e.target.files[0];e.target.value="";if(!f)return;
  if(storeSource()!=="github"){toast(fsMode()?"新資料庫的看板不能匯入備份（會整份取代）":STORE_NOTE.frozen);return}   /* 鈕在這兩個模式不出現；這裡再擋一次 */
  try{
    const txt=await f.text();
    const m=txt.match(/<script id="state" type="application\/json">([\s\S]*?)<\/script>/);
    const raw=JSON.parse(m?m[1]:txt);
    if(!raw||!Array.isArray(raw.issues))throw 0;
    const has=new Set(Object.keys(raw)),memHas=new Map((Array.isArray(raw.members)?raw.members:[]).map(m=>[m&&m.id,new Set(Object.keys(m||{}))]));   /* normalize 會補預設值（例如 minutes:[]），先記下備份裡原本有哪些欄位 */
    const data=normalize(raw);
    const v=await ask(`匯入「${f.name}」？`,[],{});
    if(v===null)return;
    data.locked=false;data.id=state.id;
    /* 02D：從新資料庫匯出的備份（切換後退回 GitHub 的回復路徑，docs/architecture/migration.md 第 7 節）沒有只在 GitHub 模式有的欄位：
       雲端設定與權杖、共用密碼、身分的密碼與權杖、會議紀錄。備份裡沒有的就沿用目前看板的值，匯入不會把它們清掉。
       權杖（sync）是用共用密碼加密的，所以 sync、pwKdf、pwHash 是一組，看備份裡有沒有 sync 決定：有＝整組用備份的；沒有＝整組沿用目前的
       （不會把現在的權杖配上備份裡舊的密碼，也不會留下對不上的組合）。每個身分的 kdf、tok 也是一組（02D 審查） */
    const PW=["sync","pwKdf","pwHash"];
    if(!has.has("sync"))PW.forEach(k=>{if(state[k]!==undefined)data[k]=JSON.parse(JSON.stringify(state[k]));else delete data[k]});
    if(!has.has("minutes")&&state.minutes!==undefined)data.minutes=JSON.parse(JSON.stringify(state.minutes));
    data.members.forEach(m=>{const o=(state.members||[]).find(x=>x.id===m.id),r=memHas.get(m.id)||new Set();
      if(o&&!r.has("kdf")&&!r.has("tok"))["kdf","tok"].forEach(k=>{if(o[k]!==undefined)m[k]=o[k]})});
    state=data;state.savedAt=nowStr();
    editing=false;dirty=false;progOpen=null;render();await persist(`已匯入並${HOSTED?'發布':'儲存'}`);
    toast(`已匯入：${state.issues.length} 個議題、${state.events.length} 則即時回報、${state.weeks.length} 份週報`);
  }catch(err){toast("這個檔案讀不到看板資料")}
});
/* 關分頁、重新整理前：編輯中有改動就提醒（原位編輯的判斷 kpDirty 在 live.js） */
window.addEventListener("beforeunload",e=>{if(editing&&(dirty||kpDirty())){e.preventDefault();e.returnValue=""}});

