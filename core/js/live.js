/* 核心｜即時回報（部門內第一個分頁）：膠囊、展開的卡片、左右兩欄的右側詳情、Keep 式原位編輯器、逐行內容、時間選取器、拖曳排序
   樣式在 board.css「即時回報」段。從 views.js（畫面）與 events.js（原位編輯器、排序）整段搬來，行為不變；
   載入順序：events.js 之後（index.html），這裡的頂層只有變數、函式與事件監聽，事件監聽的先後跟搬來前相同。
   跟其他分頁共用、留在原處的：views.js 的 evTimesHTML／evLinksHTML／mdStepHTML／linkEditorHTML、events.js 主點擊監聽裡的
   即時回報分支（新增、展開、完成這一段、結案、刪除）與 Esc／Enter 的 keydown（跟逐欄編輯同一個監聽）、render.js 的 startEdit、
   motion.js 的展開與左右兩欄動畫。 */

/* ===== 畫面 =====
   組成：狀態列、編輯工具 → 原位編輯器（逐行內容、編輯器、欄位、儲存回饋、時間選取器）→ 膠囊 evCapHTML → 右側詳情 evDetailHTML → 整區 renderEvents。
   哪一顆在編輯由 cardEd("e",id) 決定：有權限的人點一行、名稱或核取框就開始（原位編輯器）；沒有「編輯」鈕、沒有「取消」。 */
/* 狀態列：狀態標籤、第幾段、最後更新（膠囊與右側詳情共用） */
function evMetaHTML(ev,st){
  return `<p class="ev-meta"><span class="ev-st">${EV_ST[st]}</span>${ev.round>1?`<span>第 ${ev.round} 段</span>`:""}${ev.touchedAt?`<span>最後更新 <span class="num">${esc(fmt(ev.touchedAt).slice(5))} ${esc(String(ev.touchedAt).slice(11,16))}</span></span>`:""}</p>`;
}
/* 展開膠囊裡的動作列（編輯中）：欄位在上面逐欄改，這裡只剩整筆的動作 */
function evToolsHTML(ev){
  return `<span class="ev-tools"><button type="button" class="icon" data-evrep aria-pressed="${ev.report}">${ev.report?"取消報告":"會議要報告"}</button><button type="button" class="icon" data-evround>${ico("progress")}完成這一段</button><button type="button" class="icon" data-evdone>${ico("check")}結案</button></span>`;
}
/* ---------- 原位編輯器（03，Keep 式；操作在本檔後面「操作」的原位編輯器段） ----------
   有編輯權限的人點卡片的一行（或名稱、核取框、「沒有說明」）就在原位改：名稱、逐行內容（純文字／核取／時間＋核取，可以切換、新增、刪除）、
   時間（自製的時間選取器 tpHTML）、母議題、專員、標籤、超連結（kpFieldsHTML）。點卡片外面＝全部一起儲存並收合，沒有「取消」；
   存好後提供「復原這次修改」。kp＝{id,before}：正在編輯的那張與開始前的內容 */
let kp=null,kpSt=null,kpTp=null;   /* kpSt＝{id,st:"saving"|"ok"|"fail"|"bad",msg,before,after}：儲存回饋；kpTp＝打開時間選取器的時間標記 id */
const KP_TYPES=[["text","文字"],["check","核取"],["time","時間"]];
const kpType=b=>b.timeId?"time":b.check===null?"text":"check";
/* 沒有連到任何一行的時間標記（03 以前的舊資料）：照舊列在逐行內容下面 */
const evFreeTimes=ev=>{const on=new Set((ev.blocks||[]).map(b=>b.timeId).filter(Boolean));return evTimesSorted(ev).filter(t=>!on.has(t.id))};
/* 檢視時的逐行內容：核取框（沒有權限的人不能按）、時間、文字；有權限的人點一行＝從那一行開始編輯 */
function evLinesHTML(ev){
  const can=canEdit(),tm=new Map((ev.times||[]).map(t=>[t.id,t]));
  if(!(ev.blocks||[]).length)return can?`<button type="button" class="kp-empty sub" data-kpgo="">沒有說明</button>`:`<p class="sub">沒有說明</p>`;
  return `<ul class="kp-view">${ev.blocks.map(b=>{const t=b.timeId&&tm.get(b.timeId);
    return `<li class="kp-vl" data-k="${kpType(b)}">${b.check===null?"":`<label class="fld-check kp-ck"><input type="checkbox" data-kpck="${esc(b.id)}"${b.check?" checked":""}${can?"":" disabled"} aria-label="完成"></label>`}${t?`<span class="kp-tm num">${esc(evTimeText(t).when)}</span>`:""}<span class="kp-tx${b.check?" done":""}"${can?` data-kpgo="${esc(b.id)}" tabindex="0" role="button"`:""}>${esc(b.text)}</span></li>`}).join("")}</ul>`;
}
/* 編輯中：名稱、每一行（種類、核取框、時間、文字、刪除）、沒有連到行的舊時間標記、「+ 一行」 */
function kpEditorHTML(ev){
  const tm=new Map(ev.times.map(t=>[t.id,t])),max=StoreMap.TXT_MAX;
  const tp=t=>kpTp===t.id?tpHTML(ev,t):"";
  const row=b=>{const k=kpType(b),t=b.timeId&&tm.get(b.timeId);
    return `<div class="kp-line" data-blk="${esc(b.id)}" data-fk="${esc(b.id)}" data-k="${k}">${cselHTML({name:"kpType",value:k,options:KP_TYPES,cls:"kp-type",aria:"這一行的種類"})}${k==="text"?"":`<label class="fld-check kp-ck"><input type="checkbox" data-kpck="${esc(b.id)}"${b.check?" checked":""} aria-label="完成"></label>`}${t?`<button type="button" class="kp-tm num" data-kptm="${esc(t.id)}" aria-expanded="${kpTp===t.id}">${esc(evTimeText(t).when)}</button>`:""}<input class="kp-tx" data-kptx="${esc(b.id)}" value="${esc(b.text)}" maxlength="${max}" aria-label="內容"><button type="button" class="icon kp-del" data-kpdel="${esc(b.id)}" aria-label="刪除這一行">${ico("close","solo")}</button></div>${t?tp(t):""}`};
  const free=t=>`<div class="kp-line kp-free" data-k="time"><button type="button" class="kp-tm num" data-kptm="${esc(t.id)}" aria-expanded="${kpTp===t.id}">${esc(evTimeText(t).when)}</button><input class="kp-tx" data-kplb="${esc(t.id)}" value="${esc(t.label)}" maxlength="${max}" aria-label="時間標記名稱"><button type="button" class="icon kp-del" data-kptdel="${esc(t.id)}" aria-label="刪除這個時間標記">${ico("close","solo")}</button></div>${tp(t)}`;
  const fr=evFreeTimes(ev);
  return `<div class="kp" data-kp="${esc(ev.id)}"><input class="kp-title" data-kptitle value="${esc(ev.name)}" maxlength="500" aria-label="名稱">
      <div class="kp-lines" data-flip="kp">${ev.blocks.map(row).join("")}</div>${fr.length?`<div class="kp-lines kp-frees">${fr.map(free).join("")}</div>`:""}
      ${ev.blocks.length<StoreMap.BLK_MAX?`<button type="button" class="ghost evd-add kp-add" data-kpadd>+ 一行</button>`:""}
      ${kpFieldsHTML(ev)}</div>`;
}
/* 名稱與逐行內容下面：母議題（自製下拉）、專員（勾選膠囊）、標籤（人事時地物的挑選區）、超連結（色點、名稱、網址、刪除；「+ 超連結」）。
   跟逐行內容一樣直接改、改了就寫進 state（本檔「操作」的 input／change／kpClick），點外面跟其他修改一起儲存；沒有各自的「取消／完成」。
   專員只在有選項時出現、標籤只在這個看板有標籤時出現（不放「到設定建立」這類說明） */
function kpFieldsHTML(ev){
  const so=staffOptsFor(ev),on=new Set(ev.staff||[]);
  const opts=[["","（不連結）"],...state.issues.map(i=>[i.id,i.title+(i.doneAt?"（已結案）":"")])];
  const row=(k,l,body)=>`<div class="kp-f" data-kpf="${k}"><span class="kp-fl">${l}</span><div class="kp-fv">${body}</div></div>`;
  return `<div class="kp-flds">${row("issue","母議題",cselHTML({name:"kpIssue",value:ev.issueId||"",options:opts,cls:"kp-issue",aria:"母議題"}))}
      ${so.length?row("staff","專員",`<div class="chips">${so.map(([v,t])=>`<label class="chip"><input type="checkbox" name="kpStaff" value="${esc(v)}"${on.has(v)?" checked":""}><span>${esc(t)}</span></label>`).join("")}</div>`):""}
      ${state.labels.length?row("labels","標籤",labelPickerHTML("kpLabels",ev.labels)):""}
      ${row("links","超連結",`${ev.links.map(l=>`<div class="kp-lk" data-lk="${esc(l.id)}">${linkEditorHTML(l,0,"kplk")}<button type="button" class="icon kp-del" data-kplkdel aria-label="刪除這個超連結">${ico("close","solo")}</button></div>`).join("")}${ev.links.length<StoreMap.LNK_MAX?`<button type="button" class="ghost evd-add kp-add" data-kplkadd>+ 超連結</button>`:""}`)}</div>`;
}
/* 儲存回饋：編輯中＝狀態＋「儲存」（失敗時保留草稿、可以再按）；存好後（檢視）＝已儲存＋「復原這次修改」 */
function kpBarHTML(ev){const s=kpSt&&kpSt.id===ev.id?kpSt:null;
  return `<div class="card-edbar kp-bar"><span class="kp-st" role="status"${s?` data-st="${s.st}"`:""}>${s?esc(s.msg||KP_MSG[s.st]||""):""}</span><button type="button" class="primary" data-kpsave>儲存</button></div>`}
const KP_MSG={saving:"儲存中…",ok:"已儲存",fail:"儲存失敗",bad:""};
function kpStatusHTML(ev){const s=kpSt&&kpSt.id===ev.id&&!editing?kpSt:null;if(!s)return "";
  return `<div class="kp-bar kp-done"><span class="kp-st" role="status" data-st="${s.st}">${esc(s.msg||KP_MSG[s.st]||"")}</span>${s.st==="ok"&&s.before?`<button type="button" class="icon" data-kpundo>復原這次修改</button>`:""}</div>`}
/* 自製時間選取器（board.css「即時回報」段的 .tp）：月曆選開始日（切到「結束」選結束日）、開始／結束時刻、地點、寫進母議題。按「完成」或點卡片外面時寫回 */
const TP_WD=["日","一","二","三","四","五","六"];
function tpHTML(ev,t,st){
  const sp=x=>[(x||"").slice(0,10),(x||"").slice(11,16)],[sd,sh]=sp(t.start),[ed,eh]=sp(t.end);
  st=st||{sd:sd||today(),ed,sh,eh,place:t.place||"",toIssue:!!t.toIssue,m:(sd||today()).slice(0,7),pick:"s"};
  const [y,mo]=st.m.split("-").map(Number),first=new Date(y,mo-1,1),n=new Date(y,mo,0).getDate(),lead=first.getDay();
  const day=d=>{const v=`${st.m}-${pad(d)}`,on=v===st.sd||v===st.ed,mid=st.ed&&v>st.sd&&v<st.ed;
    return `<button type="button" class="tp-d${v===today()?" now":""}${mid?" mid":""}" data-tpd="${esc(v)}" aria-pressed="${on}">${d}</button>`};
  const par=parentOf(ev),md=v=>v?esc(fmt(v).slice(5)):"—";
  return `<div class="tp" data-tp="${esc(t.id)}" data-st="${esc(JSON.stringify(st))}">
    <div class="tp-ends"><button type="button" class="tp-end" data-tpend="s" aria-pressed="${st.pick==="s"}">開始 <span class="num">${md(st.sd)}</span></button><button type="button" class="tp-end" data-tpend="e" aria-pressed="${st.pick==="e"}">結束 <span class="num">${md(st.ed)}</span></button>${st.ed?`<button type="button" class="icon tp-clr" data-tpclr aria-label="清除結束日">${ico("close","solo")}</button>`:""}</div>
    <div class="tp-mon"><button type="button" class="icon" data-tpm="-1" aria-label="上個月">${ico("prev")}</button><b class="num">${esc(y)} 年 ${esc(mo)} 月</b><button type="button" class="icon" data-tpm="1" aria-label="下個月">${ico("next")}</button></div>
    <div class="tp-grid">${TP_WD.map(w=>`<span class="tp-w">${w}</span>`).join("")}${"<span></span>".repeat(lead)}${Array.from({length:n},(_,i)=>day(i+1)).join("")}</div>
    <div class="tp-row"><label>開始時刻<input data-tpf="sh" value="${esc(st.sh)}" inputmode="numeric" autocomplete="off"></label><label>結束時刻<input data-tpf="eh" value="${esc(st.eh)}" inputmode="numeric" autocomplete="off"></label></div>
    <label class="tp-place">地點<input data-tpf="place" value="${esc(st.place)}">${placeQuickHTML()}</label>
    ${par?`<label class="fld-check"><input type="checkbox" data-tpf="toIssue"${st.toIssue?" checked":""}><span>也寫進母議題的處理紀錄</span></label>`:""}
    <p class="tp-err" role="alert" hidden></p>
    <div class="evf-btns"><button type="button" class="primary" data-tpok>完成</button></div></div>`;
}
/* 一顆膠囊。o：md＝左右兩欄中、sel＝被選到、next＝「下一個」記號。
   編輯中換成原位編輯器（含母議題、專員、標籤、超連結）＋整筆動作＋儲存回饋 */
function evCapHTML(ev,o){
  const st=evStatus(ev),par=parentOf(ev),sel=o.md&&ev.id===o.sel,ed=cardEd("e",ev.id);
  /* 左右兩欄時被選到的那顆只是清單裡的空位，內容在右側詳情，不重複畫編輯欄位 */
  const body=ed&&!sel?`${evMetaHTML(ev,st)}${kpEditorHTML(ev)}${evToolsHTML(ev)}${kpBarHTML(ev)}`
    :`${par?`<p class="ev-parent-full">母議題：${esc(par.title)}</p>`:""}${evMetaHTML(ev,st)}${evLinesHTML(ev)}
        ${evTimesHTML(ev,true)}${staffHTML(ev.staff)}${labelChipsHTML(ev.labels)}
        ${evLinksHTML(ev)}${sel?"":kpStatusHTML(ev)}`;
  return `<details class="ev ${sel?"sel":""} ${ev.id===o.next?"next":""} ${ed?"sec-edit":""}" data-ev="${esc(ev.id)}" data-edbox="e:${esc(ev.id)}" data-st="${st}" ${!o.md&&(openEv.has(ev.id)||ed)?"open":""}${sel?' aria-current="true"':""}>
      <summary><span class="live-dot" aria-hidden="true"></span><b>${esc(ev.name)}</b>${par?`<span class="ev-parent">→ ${esc(par.title)}</span>`:""}${ev.report?'<span class="ev-rep">報告</span>':""}<button type="button" class="ev-del edit-only" data-evdel aria-label="刪除「${esc(ev.name)}」">${ico("close","solo")}</button><span class="ev-chev" aria-hidden="true">▾</span></summary>
      <div class="ev-body">${body}</div>
    </details>`;
}
/* 右側詳情（桌面、即時回報被選到時）：檢視時只看內容（有權限的人點名稱或一行就開始編輯）；編輯中＝原位編輯器＋整筆動作＋儲存回饋 */
function evDetailHTML(ev){
  const st=evStatus(ev),par=parentOf(ev),ed=cardEd("e",ev.id);
  const head=`<div class="evd-head"><span class="live-dot" aria-hidden="true"></span><b${!ed&&canEdit()?` data-kpgo="title" tabindex="0" role="button"`:""}>${esc(ev.name)}</b>${ev.report?'<span class="ev-rep">報告</span>':""}${mdStepHTML("live",liveOrder().map(e=>e.id),ev.id)}<button type="button" class="icon md-close" data-mdclose="live" aria-label="收起右側">${ico("close")}收起</button></div>
    ${evMetaHTML(ev,st)}`;
  if(!ed)return `<div class="evd" data-ev="${esc(ev.id)}" data-st="${st}">${head}
    ${par?`<p class="sub evd-par">母議題：${esc(par.title)}</p>`:""}
    <div class="evd-desc">${evLinesHTML(ev)}</div>
    ${evTimesHTML(ev,true)}${staffHTML(ev.staff)}${labelChipsHTML(ev.labels)}
    ${evLinksHTML(ev)}${kpStatusHTML(ev)}</div>`;
  return `<div class="evd editing sec-edit" data-ev="${esc(ev.id)}" data-edbox="e:${esc(ev.id)}" data-st="${st}">${head}
    ${kpEditorHTML(ev)}
    <section class="evd-sec evd-acts">
      <div class="evd-round" hidden><label class="evd-f">這一段完成了什麼（存進完成紀錄）<textarea data-rf="done" rows="3">${esc(ev.desc||"")}</textarea></label>
        <label class="evd-f">下一段要追蹤什麼（取代說明；留空就沿用）<textarea data-rf="next" rows="2"></textarea></label>
        <div class="evd-btns"><button type="button" class="ghost" data-evd="roundcancel">取消</button><button type="button" class="primary" data-evd="roundok">完成第 ${esc(ev.round)} 段</button></div></div>
      <div class="evd-btns evd-main"><button type="button" class="icon danger" data-evdel>刪除</button><span class="evd-gap"></span><button type="button" class="icon" data-evrep aria-pressed="${!!ev.report}">${ev.report?"取消報告":"會議要報告"}</button><button type="button" class="icon" data-evd="round">${ico("progress")}完成這一段</button><button type="button" class="icon" data-evdone>${ico("check")}結案</button></div>
    </section>${kpBarHTML(ev)}</div>`;
}
/* 會議要報告：ev.report 為真的排在上方「會議報告事項」區，其他在下方；生成週報後標記自動清掉。
   上一個／下一個、「下一個」記號都照畫面順序（上區再下區） */
const liveOrder=()=>{const a=state.events.filter(ev=>!ev.doneAt);return[...a.filter(e=>e.report),...a.filter(e=>!e.report)]};
function renderEvents(){
  const live=liveOrder(),rep=live.filter(e=>e.report),rest=live.filter(e=>!e.report);if(selEv&&!live.some(e=>e.id===selEv))selEv=null;
  /* 左右兩欄只在點選一筆之後才出現；沒選的時候照常排成膠囊格 */
  const md=mdOn("live")&&!!selEv,pane=$("#evDetail");mdLast.live=mdOn("live");
  $("#liveMD").classList.toggle("split",md);
  if(!editing){evFld=null;kp=null;kpTp=null;if(kpSt&&kpSt.st!=="saving"&&(md?selEv!==kpSt.id:!openEv.has(kpSt.id)))kpSt=null}   /* 收合（或右側換成別張）＝儲存回饋與「復原這次修改」消失 */
  const o={md,sel:selEv,next:md?(live[live.findIndex(e=>e.id===selEv)+1]||{}).id:null};   /* next：畫面順序裡的下一顆，加「下一個」記號 */
  const cap=ev=>evCapHTML(ev,o);
  const addBtn=`<button type="button" class="ghost auth-only add-row" id="addEvent">+ 新增即時回報</button>`;   /* 新增鈕在清單最後自己一行（不佔一顆膠囊的格子；登入、沒有卡片在編輯時顯示） */
  const empty=`<p class="empty">目前沒有即時回報。</p>`;   /* 不放教學說明文字（03 暫定決策 f） */
  /* 2026-11-06 使用者從預覽選 D：報告區不寫區名（每顆膠囊右邊自己標「報告」），其他回報上面一條細線、中間小字區名 */
  const zone=(k,h,list,tail)=>`<div class="ev-zone" data-zone="${k}">${h?`<div class="ev-zone-h"><span>${h}</span></div>`:""}<div class="events">${list.length?list.map(cap).join(""):h?"":empty}${tail}</div></div>`;
  $("#events").innerHTML=rep.length?zone("rep","",rep,"")+"\n      "+zone("rest","其他回報",rest,addBtn):zone("rest","",live,addBtn);
  if(md){pane.innerHTML=evDetailHTML(live.find(e=>e.id===selEv));pane.hidden=false}else{pane.innerHTML="";pane.hidden=true}
  Anim.syncPings();
}

/* ===== 操作 ===== */
/* ---------- 原位編輯器（03，Keep 式；畫面在本檔前面的 kpEditorHTML、evLinesHTML、tpHTML） ----------
   - 開始：點一行／名稱／核取框／「沒有說明」（kpStart → render.js 的 startEdit 記下 kp）。即時回報卡沒有「編輯」鈕（03 T7：原位編輯涵蓋全部欄位，
     那顆是重複的入口）。一次一張，跟其他卡片的單卡編輯共用 editing／cardEdit。
   - 名稱、逐行內容、時間、母議題、專員、標籤、超連結都直接改：打字、勾選直接寫進 state（不重畫）；換種類、新增、刪除一行、換母議題、
     新增刪除超連結才重畫，游標由 render 前後的 kpFocusGet／kpFocusSet 放回原位。沒有各欄自己的「取消／完成」。
   - 點卡片外面、按「儲存」、Esc＝kpCommit：沒改就只收合；改了就收合並儲存（kpSave）。儲存中／成功／失敗顯示在卡片上；
     失敗＝回到編輯、保留草稿，可以再按「儲存」。成功後「復原這次修改」把這張卡片存回修改前的內容（一樣走 kpSave），收合或開始下一次編輯後就消失。
   - 新增的空白卡片（名稱沒改、沒有內容）點外面就不留。 */
let kpSaving=false;
const kpBusy=()=>kpSaving||(typeof fsBusy!=="undefined"&&fsBusy);
const kpEv=()=>kp&&state.events.find(e=>e.id===kp.id);
/* 每次改到逐行內容就同步 desc：其他存檔路徑（結案、完成這一段…）以 blocks 為準，desc 一定要跟上（store-map.js 的 blocksOf 看到兩邊不同會照 desc 重建） */
const kpSync=ev=>{ev.desc=StoreMap.descOf(ev.blocks);syncLink(ev)};   /* 母議題的處理紀錄（寫進母議題的時間）也跟著 */
/* 完成這一段要預填的內容：目前的逐行內容攤平（每行去掉前後空白，跟存檔時一樣） */
const kpDescNow=ev=>StoreMap.descOf((ev.blocks||[]).map(b=>({...b,text:String(b.text||"").trim()})));
/* 開始編輯 id 這張：o.focus＝行 id／"title"／""（第一行；沒有內容就新增一行），o.toggle＝要切換勾選的行 */
async function kpStart(id,o={}){
  if(kpBusy())return false;
  if(!(await startEdit("e:"+id,()=>{if(o.toggle){const ev=state.events.find(e=>e.id===id),b=(ev?.blocks||[]).find(x=>x.id===o.toggle);if(b){b.check=!b.check;kpSync(ev)}}})))return false;   /* 勾選也要同步 desc（03 審查 P0-1） */
  openEv.add(id);
  const ev=kpEv();if(!ev)return true;
  if(o.focus==="title")kpFocus("title");
  else if(o.focus)kpFocus(o.focus);
  else if(ev.blocks.length)kpFocus(ev.blocks[0].id);
  else kpAdd(ev,0);
  return true;
}
/* 游標放到某一行（或名稱）的文字最後；sel＝true 時全選（新卡片的名稱） */
function kpFocus(id,sel){
  const el=id==="title"?document.querySelector("[data-kptitle]"):document.querySelector(`[data-kptx="${CSS.escape(id)}"]`);if(!el)return;
  el.focus({preventScroll:true});if(sel)el.select();else{const n=el.value.length;el.setSelectionRange(n,n)}
  el.scrollIntoView({block:"nearest",behavior:reduceMotion()?"auto":"smooth"});
}
function kpFocusGet(){const a=document.activeElement;if(!kp||!a||!a.closest||!a.closest(".kp"))return null;
  const k=["kptx","kplb","tpf"].find(x=>a.dataset[x]!==undefined),lk=a.dataset.e&&a.closest(".kp-lk");
  return {sel:a.dataset.kptitle!==undefined?"[data-kptitle]":k?`[data-${k}="${CSS.escape(a.dataset[k])}"]`:lk?`[data-lk="${CSS.escape(lk.dataset.lk)}"] [data-e="${CSS.escape(a.dataset.e)}"]`:null,s:a.selectionStart,e:a.selectionEnd}}
function kpFocusSet(f){if(!f||!f.sel||!kp)return;const el=document.querySelector(".kp "+f.sel);if(!el||el===document.activeElement)return;
  el.focus({preventScroll:true});try{if(f.s!=null)el.setSelectionRange(f.s,f.e)}catch(_){}}
/* 新增一行（在第 at 個位置），種類跟著 like（核取→核取、時間→核取、文字→文字） */
function kpAdd(ev,at,like){
  if(ev.blocks.length>=StoreMap.BLK_MAX){kpSay("bad",`最多 ${StoreMap.BLK_MAX} 行`);return}
  const b={id:uid("b"),text:"",check:like&&like.check!==null?false:null,timeId:null};
  ev.blocks.splice(at,0,b);kpSync(ev);render();kpFocus(b.id);
}
function kpDel(ev,id){
  const i=ev.blocks.findIndex(b=>b.id===id);if(i<0)return;const b=ev.blocks[i];
  if(b.timeId){ev.times=ev.times.filter(t=>t.id!==b.timeId);if(kpTp===b.timeId)kpTp=null}
  ev.blocks.splice(i,1);kpSync(ev);render();
  const p=ev.blocks[Math.max(0,i-1)];if(p)kpFocus(p.id);
}
/* 換種類：文字（拿掉勾選與時間）、核取（拿掉時間）、時間（新增一個時間標記並打開時間選取器） */
function kpSetType(ev,id,k){
  const b=ev.blocks.find(x=>x.id===id);if(!b||kpType(b)===k)return;
  if(k!=="time"&&b.timeId){ev.times=ev.times.filter(t=>t.id!==b.timeId);if(kpTp===b.timeId)kpTp=null;b.timeId=null}
  if(k==="text")b.check=null;
  else{if(b.check===null)b.check=false;
    if(k==="time"){const t={id:uid("t"),label:b.text,start:today(),end:"",place:"",toIssue:false};ev.times.push(t);b.timeId=t.id;kpTp=t.id}}
  kpSync(ev);render();if(k!=="time")kpFocus(id);
}
function kpSay(st,msg){const s=document.querySelector(".kp-bar .kp-st");kpSt={id:kp&&kp.id,st,msg};if(s){s.dataset.st=st;s.textContent=msg}}
/* 編輯中卡片裡的點擊（回傳 true＝處理掉了） */
function kpClick(t,e){
  const ev=kpEv();if(!ev)return false;
  const ck=t.closest("[data-kpck]");if(ck){const b=ev.blocks.find(x=>x.id===ck.dataset.kpck);if(b)b.check=ck.checked;kpSync(ev);ck.closest(".kp-line")?.querySelector(".kp-tx")?.focus({preventScroll:true});return true}
  if(t.closest("[data-kpsave]")){kpCommit(true);return true}
  if(t.closest("[data-kpadd]")){kpAdd(ev,ev.blocks.length,ev.blocks[ev.blocks.length-1]);return true}
  const del=t.closest("[data-kpdel]");if(del){kpDel(ev,del.dataset.kpdel);return true}
  const tdel=t.closest("[data-kptdel]");if(tdel){ev.times=ev.times.filter(x=>x.id!==tdel.dataset.kptdel);if(kpTp===tdel.dataset.kptdel)kpTp=null;kpSync(ev);render();return true}
  const tm=t.closest("[data-kptm]");if(tm){if(kpTp&&kpTp!==tm.dataset.kptm&&!tpApply())return true;kpTp=kpTp===tm.dataset.kptm?null:tm.dataset.kptm;render();return true}
  const tp=t.closest(".tp");if(tp){tpClick(ev,tp,t);return true}
  /* 超連結：色點換顏色、刪除、「+ 超連結」（名稱、網址打字時在 input 事件寫回） */
  const lk=t.closest(".kp-lk"),lo=lk&&ev.links.find(x=>x.id===lk.dataset.lk);
  const sw=t.closest('[data-kplk="color"]');if(sw&&lo){lo.color=COLORS[(COLORS.indexOf(lo.color)+1)%COLORS.length];sw.dataset.c=lo.color;sw.style.background=lo.color;return true}
  if(t.closest("[data-kplkdel]")&&lo){ev.links=ev.links.filter(x=>x!==lo);render();return true}
  if(t.closest("[data-kplkadd]")){if(ev.links.length>=StoreMap.LNK_MAX){kpSay("bad",`最多 ${StoreMap.LNK_MAX} 個超連結`);return true}const l={id:uid("l"),name:"",url:"",color:COLORS[ev.links.length%COLORS.length]};ev.links.push(l);render();
    document.querySelector(`.kp [data-lk="${CSS.escape(l.id)}"] [data-e="name"]`)?.focus({preventScroll:true});return true}
  return false;
}
/* 鍵盤：Enter＝在下面新增一行（名稱欄＝到第一行）、空白行按 Backspace＝刪掉回到上一行、Esc＝收起時間選取器或儲存並收合 */
function kpKey(e){
  const ev=kpEv(),a=e.target;if(!ev)return false;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(kpTp){if(tpApply()){kpTp=null;render()}}else kpCommit(true);return true}
  if(e.isComposing)return false;
  if(e.key==="Enter"&&a.dataset.kptitle!==undefined){e.preventDefault();if(ev.blocks.length)kpFocus(ev.blocks[0].id);else kpAdd(ev,0);return true}
  const id=a.dataset.kptx;if(id===undefined)return false;
  const i=ev.blocks.findIndex(b=>b.id===id);
  if(e.key==="Enter"){e.preventDefault();kpAdd(ev,i+1,ev.blocks[i]);return true}
  if(e.key==="Backspace"&&!a.value&&ev.blocks.length>1){e.preventDefault();kpDel(ev,id);return true}
  return false;
}
document.addEventListener("input",e=>{
  const a=e.target,ev=kp&&a.closest&&a.closest(".kp")&&kpEv();if(!ev)return;
  if(a.dataset.kptitle!==undefined)ev.name=a.value;
  else if(a.dataset.kptx!==undefined){const b=ev.blocks.find(x=>x.id===a.dataset.kptx);if(b){b.text=a.value.replace(/[\r\n]+/g," ");const t=b.timeId&&ev.times.find(x=>x.id===b.timeId);if(t)t.label=b.text}}
  else if(a.dataset.kplb!==undefined){const t=ev.times.find(x=>x.id===a.dataset.kplb);if(t)t.label=a.value}
  else if((a.dataset.e==="name"||a.dataset.e==="url")&&a.closest(".kp-lk")){const l=ev.links.find(x=>x.id===a.closest(".kp-lk").dataset.lk);if(l)l[a.dataset.e]=a.value}
  kpSync(ev);
});
/* 種類選單、母議題（自製下拉 .csel，選了在隱藏 input 觸發 change）、專員與標籤的勾選膠囊 */
document.addEventListener("change",e=>{
  const a=e.target,box=kp&&a.closest&&a.closest(".kp"),ev=box&&kpEv();if(!ev)return;
  if(a.name==="kpType"){const ln=a.closest(".kp-line");if(ln)kpSetType(ev,ln.dataset.blk,a.value);return}
  if(a.name==="kpIssue"){ev.issueId=a.value||null;kpSync(ev);render();document.querySelector('.kp [data-kpf="issue"] .csel-btn')?.focus({preventScroll:true});return}
  if(a.name==="kpStaff"||a.name==="kpLabels")ev[a.name==="kpStaff"?"staff":"labels"]=[...box.querySelectorAll(`input[name="${a.name}"]:checked`)].map(x=>x.value);
});
/* 時間選取器：狀態放在 .tp 的 data-st（還沒按「完成」前不寫進 state），每次點選重畫選取器本身 */
const tpState=tp=>{const st=JSON.parse(tp.dataset.st);tp.querySelectorAll("[data-tpf]").forEach(i=>{st[i.dataset.tpf]=i.type==="checkbox"?i.checked:i.value.trim()});return st};
function tpClick(ev,tp,t){
  const st=tpState(tp),tm=ev.times.find(x=>x.id===tp.dataset.tp);if(!tm)return;
  const d=t.closest("[data-tpd]"),m=t.closest("[data-tpm]"),end=t.closest("[data-tpend]");
  if(d){const v=d.dataset.tpd;if(st.pick==="e"){st.ed=v<st.sd?st.sd:v===st.ed?"":v}else{st.sd=v;if(st.ed&&st.ed<v)st.ed=""}}
  else if(m){const [y,mo]=st.m.split("-").map(Number),x=new Date(y,mo-1+(+m.dataset.tpm),1);st.m=ym(x)}
  else if(end){st.pick=end.dataset.tpend;const v=st.pick==="e"?st.ed||st.sd:st.sd;if(v)st.m=v.slice(0,7)}
  else if(t.closest("[data-tpclr]")){st.ed="";st.pick="s"}
  else if(t.closest("[data-tpok]")){if(tpApply()){kpTp=null;render();kpFocusTime(ev,tm.id)}return}
  else if(t.closest("[data-place]"))return;   /* 地點快速選項：labels.js 填進地點欄 */
  else return;
  tp.outerHTML=tpHTML(ev,tm,st);
}
const kpFocusTime=(ev,tid)=>{const b=ev.blocks.find(x=>x.timeId===tid);if(b)kpFocus(b.id)};
/* 把打開的時間選取器寫回那個時間標記；格式不對就在選取器裡顯示、回傳 false */
function tpApply(){
  const tp=document.querySelector(".kp .tp"),ev=kpEv();if(!tp||!ev)return true;
  const tm=ev.times.find(x=>x.id===tp.dataset.tp);if(!tm)return true;
  const st=tpState(tp),r=evTimeParts({label:"-",sd:st.sd,st:st.sh,ed:st.ed,et:st.eh});
  if(r.msg){const p=tp.querySelector(".tp-err");p.textContent=r.msg;p.hidden=false;return false}
  Object.assign(tm,{start:r.start,end:r.end,place:st.place||"",toIssue:!!st.toIssue});kpSync(ev);
  return true;
}
/* 整理這張卡片（點外面、結案、刪除、完成這一段前都走這裡）：去掉前後空白、名稱網址都空的超連結不留、時間行的文字寫進時間標記的名稱。
   編輯器裡一律以 blocks 為準：trim 之後先用 blocks 重新攤平 desc，再 evBlocksFix（desc 跟 blocks 對不上時 blocksOf 會照 desc 重建，
   核取行、時間行就變成「☐ …」純文字、行 ID 與時間連結遺失；03 審查 P0-1） */
function kpTidy(ev){
  ev.name=ev.name.trim();
  ev.links.forEach(l=>{l.name=l.name.trim();l.url=l.url.trim()});ev.links=ev.links.filter(l=>l.name||l.url);
  ev.blocks.forEach(b=>{b.text=b.text.trim()});
  ev.times.forEach(t=>{const b=ev.blocks.find(x=>x.timeId===t.id);if(b)t.label=b.text});   /* 時間＋核取那一行的文字就是時間標記的名稱 */
  ev.desc=StoreMap.descOf(ev.blocks);evBlocksFix(ev);
}
/* 存檔前的檢查：收起時間選取器（格式不對就停）、整理、名稱與超連結的按鈕名稱不能空白；不合格回傳 false、游標放到那一欄 */
function kpReady(ev){
  if(kpTp){if(!tpApply())return false;kpTp=null}
  kpTidy(ev);
  if(!ev.name){kpSay("bad","請填名稱");document.querySelector("[data-kptitle]")?.focus();return false}
  {const l=ev.links.find(x=>!x.name);if(l){kpSay("bad","請填按鈕名稱");document.querySelector(`.kp [data-lk="${CSS.escape(l.id)}"] [data-e="name"]`)?.focus();return false}}
  return true;
}
/* 收合：沒改就只結束編輯；改了就儲存（點外面、按「儲存」、Esc 都走這裡） */
async function kpCommit(){
  if(!kp||!editing||cardEdit!=="e:"+kp.id||kpBusy())return true;
  const ev=kpEv();
  if(!ev){kpTp=null;morph(()=>{editing=false;cardEdit="";kp=null;render()});return true}
  if(!kpReady(ev))return false;
  const core=x=>JSON.stringify({...x,report:0,touched:0,touchedAt:0});
  const before=kp.before,was=before&&JSON.parse(before);
  if(!was&&ev.name==="新的即時回報"&&!ev.blocks.length&&!ev.times.length&&!(ev.links||[]).length){   /* 新增後什麼都沒填：不留 */
    morph(()=>{state=normalize(JSON.parse(snapshot));editing=false;cardEdit="";dirty=false;kp=null;selEv=null;render()});return true}
  if(was&&JSON.stringify(ev)===before&&!dirtyOthers()){morph(()=>{editing=false;cardEdit="";dirty=false;kp=null;render()});return true}
  if(!was||core(ev)!==core(was))evTouch(ev);
  syncLink(ev);dirty=true;
  return kpSave();
}
/* 這次編輯有沒有動到這張以外的資料（完成這一段的完成紀錄、母議題的處理紀錄…） */
const dirtyOthers=()=>{const a=JSON.parse(snapshot);a.events=a.events.filter(e=>e.id!==kp.id);const b={...state,events:state.events.filter(e=>e.id!==kp.id)};return JSON.stringify(a)!==JSON.stringify(JSON.parse(JSON.stringify(b)))};
/* 收合並儲存；失敗時回到編輯、保留草稿 */
async function kpSave(){
  const id=kp.id,key=cardEdit,snap=snapshot,draft=kp,undoable=!!kp.before&&!kp.noUndo&&!dirtyOthers();
  if(!fsMode()&&!(await prepareSave())){kpSay("fail",KP_MSG.fail);return false}
  kpSaving=true;
  morph(()=>{editing=false;cardEdit="";dirty=false;kp=null;kpTp=null;kpSt={id,st:"saving"};state.savedAt=nowStr();if(meName())state.savedBy=meName();render()});
  let ok=false;
  try{ok=fsMode()?await fsPersist("",{quiet:true}):await persist()}catch(_){ok=false}
  kpSaving=false;
  if(ok){const ev=state.events.find(e=>e.id===id);kpSt={id,st:"ok",before:undoable?draft.before:null,after:ev?JSON.stringify(ev):""};render();
    if(!fsMode()&&CFG.meeting)mtPushAll();return true}
  /* 失敗：草稿還在 state（firestore 模式的補寫也把畫面資料留著），回到編輯 */
  if(!state.events.some(e=>e.id===id))state=normalize(JSON.parse(snap));
  editing=true;cardEdit=key;snapshot=snap;dirty=true;kp=draft;
  kpSt={id,st:"fail",msg:fsMode()&&fsLastErr?`${KP_MSG.fail}：${fsLastErr}`:KP_MSG.fail};render();
  return false;
}
/* 復原這次修改：卡片換回修改前的內容，當成一次編輯儲存（不再提供復原）；這張在那之後被改過（重新讀到別人的修改）就不復原 */
async function kpUndo(){
  const s=kpSt;if(!s||s.st!=="ok"||!s.before||editing||kpBusy())return;
  const i=state.events.findIndex(e=>e.id===s.id);if(i<0)return;
  if(JSON.stringify(state.events[i])!==s.after){kpSt={id:s.id,st:"fail",msg:"這張卡片已有新的修改，無法復原"};render();return}
  if(!fsMode()&&!(await ensureLogin()))return;
  snapshot=JSON.stringify(state);
  const prev=JSON.parse(s.before);evBlocksFix(prev);state.events[i]=prev;syncLink(prev);
  editing=true;cardEdit="e:"+s.id;dirty=true;kp={id:s.id,before:s.after,noUndo:true};
  await kpSave();
}
/* 點卡片外面＝儲存並收合（捕獲階段先處理，點擊照常往下傳；對話框、下拉選單、提示訊息不算外面）。
   同一張卡片的標題列（收合膠囊）、左右兩欄的「收起」「上一個／下一個」也算 */
document.addEventListener("click",e=>{
  if(!kp||!editing||cardEdit!=="e:"+kp.id)return;
  const t=e.target;if(!t.closest||t.closest("#dlg,.csel-list,#toast"))return;
  const box=t.closest(`[data-edbox="e:${CSS.escape(kp.id)}"]`);
  if(box&&!t.closest("[data-mdclose],[data-mdstep]")&&!(t.closest("summary")&&!t.closest("button")))return;
  kpCommit();
},true);
/* 關分頁、重新整理前：編輯中有改動就提醒。原位編輯的打字、勾選、新增刪除行直接寫進 state、不設 dirty（cancelEdit 等靠 dirty 判斷），
   所以另外比對這張卡片跟開始前的內容（kp.before；新增的卡片沒有 before＝一定算改了）與這張以外的資料（03 審查 P1-2） */
const kpDirty=()=>{if(!kp||!editing||cardEdit!=="e:"+kp.id)return false;const ev=kpEv();return !kp.before||!ev||JSON.stringify(ev)!==kp.before||dirtyOthers()};

/* ---------- 即時回報排序（登入後、沒有卡片在編輯時拖曳；放開直接儲存） ----------
   滑鼠：按住膠囊標題拖動超過 6px 開始；觸控：長按 0.38 秒開始（之前就移動＝照常捲動）。
   拖到另一顆上面就換位（其他膠囊 FLIP 讓位），放開後依畫面順序寫回 state.events（只換即時回報彼此的位置，完成紀錄的順序不動）。
   排序不算「更新」（不改狀態燈）；放開就直接儲存（settingSave） */
(()=>{
  let d=null,suppress=false;
  const handle=t=>canEdit()&&!editing&&t.closest&&!t.closest("button,a,input,textarea,select,.csel")&&t.closest("#events .events>.ev>summary");
  const rects=()=>new Map([...document.querySelectorAll("#events .events>.ev")].map(el=>[el,el.getBoundingClientRect()]));
  function begin(el,x,y){
    const r=el.getBoundingClientRect();
    d={el,ox:x-r.left,oy:y-r.top,x,y,on:true};
    el.classList.add("ev-dragging");document.documentElement.classList.add("ev-drag-on");
    el.animate([{scale:1},{scale:1.04}],{duration:180,easing:"cubic-bezier(.3,1.4,.5,1)",fill:"forwards"});
    if(navigator.vibrate)try{navigator.vibrate(12)}catch(_){}
  }
  function move(x,y){
    if(!d||!d.on)return;d.x=x;d.y=y;const el=d.el;
    const hit=[...document.querySelectorAll("#events .events>.ev")].find(o=>{if(o===el||o.parentNode!==el.parentNode)return false;const r=o.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom});
    if(hit&&performance.now()>(d.lock||0)){d.lock=performance.now()+220;   /* 剛換過位，讓位動畫跑一下再判斷，免得來回抖 */
      const list=[...el.parentNode.children],before=rects();
      if(list.indexOf(hit)>list.indexOf(el))hit.after(el);else hit.before(el);
      if(!reduceMotion())before.forEach((a,o)=>{if(o===el)return;const b=o.getBoundingClientRect(),dx=a.left-b.left,dy=a.top-b.top;
        if(Math.abs(dx)>1||Math.abs(dy)>1)o.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:"none"}],{duration:300,easing:"cubic-bezier(.2,.9,.25,1)"})});
    }
    el.style.translate="";const b=el.getBoundingClientRect();
    el.style.translate=`${x-d.ox-b.left}px ${y-d.oy-b.top}px`;
  }
  function end(){
    if(!d)return;const s=d;d=null;clearTimeout(s.timer);if(!s.on)return;
    const el=s.el,from=el.style.translate||"0px 0px";el.style.translate="";
    document.documentElement.classList.remove("ev-drag-on");
    el.getAnimations().forEach(a=>a.cancel());
    const fin=()=>{el.classList.remove("ev-dragging");commit()};
    if(reduceMotion())fin();else el.animate([{translate:from,scale:1.04},{translate:"0px 0px",scale:1}],{duration:260,easing:"cubic-bezier(.2,.9,.25,1)"}).onfinish=fin;
    suppress=true;setTimeout(()=>suppress=false,0);
  }
  function commit(){
    const ids=[...document.querySelectorAll("#events .events>.ev")].map(el=>el.dataset.ev),live=state.events.filter(e=>!e.doneAt);
    if(ids.length!==live.length||ids.every((id,i)=>live[i].id===id))return;
    const by=new Map(live.map(e=>[e.id,e]));let k=0;
    settingSave(()=>{state.events=state.events.map(e=>e.doneAt?e:by.get(ids[k++]))},"已更新排序");
  }
  /* 拖完放開的那一下不要當成點擊（不然會展開／選取）：window 捕獲階段最先攔 */
  addEventListener("click",e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false}},true);
  /* 滑鼠 */
  document.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"||e.button!==0)return;const sm=handle(e.target);if(!sm)return;d={el:sm.parentElement,sx:e.clientX,sy:e.clientY,on:false}});
  addEventListener("pointermove",e=>{if(!d||e.pointerType==="touch")return;if(!d.on){if(Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<6)return;const el=d.el;d=null;begin(el,e.clientX,e.clientY)}move(e.clientX,e.clientY)});
  addEventListener("pointerup",e=>{if(e.pointerType!=="touch")end()});
  /* 觸控：長按 */
  document.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;const sm=handle(e.target);if(!sm)return;const t=e.touches[0];
    d={el:sm.parentElement,sx:t.clientX,sy:t.clientY,on:false};d.timer=setTimeout(()=>{if(d&&!d.on){const el=d.el;d=null;begin(el,t.clientX,t.clientY)}},380)},{passive:true});
  addEventListener("touchmove",e=>{if(!d)return;const t=e.touches[0];
    if(!d.on){if(Math.hypot(t.clientX-d.sx,t.clientY-d.sy)>8){clearTimeout(d.timer);d=null}return}
    e.preventDefault();move(t.clientX,t.clientY)},{passive:false});
  addEventListener("touchend",end);addEventListener("touchcancel",end);
  /* 長按時不要跳出系統選單 */
  document.addEventListener("contextmenu",e=>{if(d||handle(e.target))e.preventDefault()});
})();
