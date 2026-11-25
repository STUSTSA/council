/* 核心｜即時回報（部門內第一個分頁；DESIGN-next 第七節）：膠囊清單、卡片（檢視／Keep 式原位編輯／唯讀）、時間線、人・時間・地點頁、
   容器轉化、上一張／下一張、拖到角落（換位置、刪除、完成）與完成的慶祝。完成紀錄的卡片也用這裡的卡片外框（lcFrame、lcLiveHTML；views.js 的 renderDone）。
   樣式在 board.css「即時回報」段。載入順序：events.js 之後（index.html）。 */

/* ===== 狀態 =====
   lvOpen／dnOpen／fvOpen＝打開的即時回報／完成紀錄／會長收藏的別部門卡片（一次只開一張；不會同時有值）。fvOpen 是「部門|live|卡片 ID」（fvKey）。
   版面：寬螢幕（lvWide：即時回報容器可用寬度 980 以上）＝左邊膠囊清單、右邊卡片（#evDetail／#doneDetail）；其他＝卡片從膠囊長成全螢幕（#lcFull，蓋住工具列）。
   編輯中：lvPane＝卡片內容換成哪一頁（staff 人／time 時間／place 地點；null＝逐行內容），lvPop＝母議題選單開著，lvSeg＝時間頁選到的那一段 {tid,k,buf}。
   kp＝{id,before}：正在原位編輯的那張與開始前的內容（render.js 的 startEdit 設定）；kpSt＝儲存回饋 {id,st:"saving"|"ok"|"fail"|"bad",msg,before,after}。 */
let lvOpen=null,dnOpen=null,fvOpen=null,lvPane=null,lvPop=false,lvSeg=null,lvDragAt=0;   /* lvDragAt：最近一次在時間頁上下拖曳調整的時刻（拖完放開不當成「點一下」開選擇器） */
let kp=null,kpSt=null;
/* 寬螢幕的判斷（DESIGN-next 第七節「卡片寬不到 980」）：量即時回報／完成紀錄容器（#liveMD、#doneMD）的可用寬度，不看視窗寬。
   ResizeObserver 只記看得到的那一個（藏起來的分頁量到 0，不算）；寬窄真的變了才在下一格重畫——分不分欄只改容器的高度、不改寬度，不會形成迴圈 */
const LV_MIN=980;
let lvWideV=(()=>{const w=$("#liveMD")?.clientWidth;return w?w>=LV_MIN:innerWidth>=LV_MIN})(),lvWideDone=lvWideV;   /* lvWideDone＝畫面已經照著畫的那個值 */
const lvWide=()=>lvWideV;
{const ro=new ResizeObserver(es=>{const w=Math.max(0,...es.map(x=>x.contentRect.width));if(!w||(w>=LV_MIN)===lvWideV)return;
    lvWideV=w>=LV_MIN;requestAnimationFrame(()=>{if(lvWideV===lvWideDone)return;lvWideDone=lvWideV;
      if(lcCur()){if(lvWide())Back.closed("card");else Back.opened("card",lcBack)}render()})});
  ["#liveMD","#doneMD"].forEach(k=>{const el=$(k);if(el)ro.observe(el)})}
const kpType=b=>b.timeId?"time":b.check===null?"text":"check";
/* 沒有連到任何一行的時間標記（03 以前的舊資料）：列在逐行內容下面（時間頁也列出來，可以改） */
const evFreeTimes=ev=>{const on=new Set((ev.blocks||[]).map(b=>b.timeId).filter(Boolean));return evTimesSorted(ev).filter(t=>!on.has(t.id))};
/* 編輯次數＝版本（firestore 模式 cards.version）；GitHub 模式沒有每張卡片的版本，不顯示 */
const lvVer=ev=>{if(!fsMode()||!storeFsBase)return 0;const c=(storeFsBase.src.cards||[]).find(c=>StoreMap.oid(CFG.deptId,c.id)===ev.id);return c&&+c.version||0};
/* 逾期：還沒勾、時間已經過了（有結束日看結束日；當天有時刻的過了時刻才算；跟 notify.js 的 notiLate 同一條） */
function tmLate(t){if(!t||!t.start)return false;const d=new Date(),now=`${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}`,sd=t.start.slice(0,10),ed=(t.end||"").slice(0,10);
  return (ed||sd)<today()||(!ed&&sd===today()&&t.start.length>10&&t.start<now)}
/* 會議要報告：ev.report 為真的排在上面（細線隔開），上一張／下一張照畫面順序 */
const liveOrder=()=>{const a=state.events.filter(ev=>!ev.doneAt&&inProj(ev));return[...a.filter(reportOn),...a.filter(e=>!reportOn(e))]};

/* ===== 畫面 ===== */
/* 一顆膠囊（高 54）：燈號、名稱、右邊紅字「報告」。o.sel＝寬螢幕右邊打開的那張（細框）；o.away＝全螢幕卡片從這顆長出去（位置留著、看不到） */
function cpHTML(ev,o={}){const st=evStatus(ev);
  return `<button type="button" class="cp${o.sel?" sel":""}${o.away?" away":""}" data-cp="${esc(ev.id)}" data-ev="${esc(ev.id)}" data-st="${st}"${o.sel?' aria-current="true"':""}><span class="live-dot" aria-hidden="true"></span><b>${esc(ev.name)}</b>${ev.report?'<span class="cp-rp">報告</span>':""}</button>`}
/* 卡片外框（即時回報、完成紀錄共用）：第一排（全螢幕時返回鍵）燈號、名稱、編輯次數；第二排上一張／下一張、報告；第三排狀態、負責人、時間；
   內容；儲存回饋（role=status）；底部工具列（母議題選單在工具列裡、往上長）。o＝{k,id,key,st,ids,full,ro,ed,sec,attr,title,cnt,rep,meta,body,view,tail,save,tools} */
function lcFrame(o){
  const ix=o.ids.indexOf(o.id),tri=d=>`<button type="button" class="lc-tri" data-lcstep="${d}" aria-label="${d<0?"上一張":"下一張"}"${(d<0?ix<=0:ix<0||ix>=o.ids.length-1)?" disabled":""}>${ico("tri","solo")}</button>`;
  return `<article class="lc${o.ro?" ro":""}${o.ed?" lc-ed sec-edit":o.sec?" sec-edit":""}${o.full?" full":""}" data-lc="${o.k}" data-edbox="${esc(o.key)}" data-st="${o.st}" ${o.attr}>
    <div class="lc-in"><div class="lc-head">${o.full?`<button type="button" class="lc-back" data-lcback aria-label="返回">${ico("back","solo")}</button>`:""}<span class="live-dot" aria-hidden="true"></span>${o.title}${o.cnt||""}</div>
      <div class="lc-nav">${tri(-1)}${tri(1)}<span class="lc-sp"></span>${o.rep||""}</div>
      <div class="lc-meta">${o.meta}</div>
      <div class="lc-body" data-view="${o.view||"main"}">${o.body}</div>${o.tail||""}
      <div class="lc-save">${o.save||'<span class="kp-st" role="status"></span>'}</div></div>${o.tools||""}</article>`;
}
const lcCntHTML=n=>n?`<button type="button" class="lc-cnt num" data-lclog aria-label="編輯紀錄，${n} 次">${n}</button>`:"";
const lcWhen=s=>s?`<span class="num">${esc(fmt(s).slice(5))}${String(s).length>10?" "+esc(String(s).slice(11,16)):""}</span>`:"";
/* 一行：文字／核取（方形 .fld-check，勾了變淡加刪除線）／時間（時間線：左邊圓點就是核取、時間純文字、名稱、地點靠右）。
   ed＝編輯中（文字變輸入框、時間變可點的淡底膠囊、右邊刪除）；ro＝唯讀（不能勾、不能點） */
function lnHTML(b,t,ed,ro){
  const k=kpType(b),dis=ro?" disabled":"",late=k==="time"&&!b.check&&tmLate(t),when=t?evTimeText(t).when:"";
  const ck=k==="text"?"":k==="time"?`<button type="button" class="ln-dot" role="checkbox" aria-checked="${!!b.check}" data-kpck="${esc(b.id)}" aria-label="完成"${dis}></button>`
    :`<label class="fld-check ln-ck"><input type="checkbox" data-kpck="${esc(b.id)}"${b.check?" checked":""}${dis} aria-label="完成"></label>`;
  const tm=k!=="time"?"":ed?`<button type="button" class="tmc num${late?" late":""}" data-kptm="${esc(t?t.id:"")}">${esc(when)}</button>`:`<span class="tmc num${late?" late":""}">${esc(when)}</span>`;
  const tx=ed?`<textarea class="tx" rows="1" data-kptx="${esc(b.id)}" maxlength="${StoreMap.TXT_MAX}" aria-label="內容">${esc(b.text)}</textarea>`
    :`<span class="tx"${ro?"":` data-kpgo="${esc(b.id)}" tabindex="0" role="button"`}>${esc(b.text)}</span>`;
  return `<div class="ln${k==="time"?" tm":k==="check"?" ck":""}${b.check?" done":""}" data-blk="${esc(b.id)}" data-k="${k}">${ck}${tm}${tx}${t&&t.place?`<span class="pl">${esc(t.place)}</span>`:""}${ed?`<button type="button" class="ln-x" data-kpdel="${esc(b.id)}" aria-label="刪除這一行">${ico("close","solo")}</button>`:""}</div>`;
}
/* 編輯中連續的純文字行合成一個大輸入框（像備忘錄）：每個換行＝一筆，存檔格式不變。
   data-kpids＝這個框裡每一行的行 ID（用空白隔開、跟框裡的換行一一對應），data-kpgrp＝第一行的 ID（重畫後游標放回用）。
   框的內容前面多放一個換行：HTML 會吞掉 textarea 開頭的一個換行，第一行是空行時才不會少一行 */
const kpGrpHTML=g=>`<div class="ln" data-blk="${esc(g[0].id)}" data-k="text"><textarea class="tx" rows="1" data-kpgrp="${esc(g[0].id)}" data-kpids="${g.map(b=>esc(b.id)).join(" ")}" aria-label="內容">\n${esc(g.map(b=>b.text).join("\n"))}</textarea></div>`;
/* 沒有連到行的舊時間標記：時間線的樣子，圓點不能按（沒有勾選狀態）；編輯中名稱可以改、可以刪 */
function freeHTML(t,ed){const when=evTimeText(t).when;
  return `<div class="ln tm free" data-tfree="${esc(t.id)}" data-k="time"><span class="ln-dot" aria-hidden="true"></span>${ed?`<button type="button" class="tmc num" data-kptm="${esc(t.id)}">${esc(when)}</button><textarea class="tx" rows="1" data-kplb="${esc(t.id)}" maxlength="${StoreMap.TXT_MAX}" aria-label="時間標記名稱">${esc(t.label)}</textarea><button type="button" class="ln-x" data-kptdel="${esc(t.id)}" aria-label="刪除這個時間標記">${ico("close","solo")}</button>`:`<span class="tmc num">${esc(when)}</span><span class="tx">${esc(t.label)}</span>`}${t.place?`<span class="pl">${esc(t.place)}</span>`:""}</div>`}
/* 逐行內容＋超連結（檢視是膠囊、編輯中是名稱與網址兩欄） */
function lcLinesHTML(ev,ed,ro){
  const tm=new Map((ev.times||[]).map(t=>[t.id,t])),out=[];let g=[];const flush=()=>{if(g.length)out.push(kpGrpHTML(g));g=[]};
  (ev.blocks||[]).forEach(b=>{if(ed&&kpType(b)==="text")g.push(b);else{flush();out.push(lnHTML(b,tm.get(b.timeId),ed,ro))}});flush();
  const rows=out.join("")+evFreeTimes(ev).map(t=>freeHTML(t,ed)).join("");
  const empty=rows?"":ed?"":ro?`<p class="ln-empty">沒有說明</p>`:`<button type="button" class="ln-empty" data-kpgo="">沒有說明</button>`;
  const links=ed?(ev.links||[]).map(l=>`<div class="lk kp-lk" data-lk="${esc(l.id)}"><input data-e="name" value="${esc(l.name)}" maxlength="60" placeholder="按鈕名稱" aria-label="按鈕名稱"><input data-e="url" value="${esc(l.url)}" maxlength="2000" placeholder="https://" aria-label="網址" inputmode="url"><button type="button" class="ln-x" data-kplkdel aria-label="刪除這個超連結">${ico("close","solo")}</button></div>`).join("")
    :(ev.links||[]).length?`<div class="lnks">${ev.links.map(l=>`<a class="lnk" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join("")}</div>`:"";
  return `<div class="lns" data-flip="lns">${rows}${empty}</div>${links}`;
}
/* 人頁：負責人（勾選膠囊；相關人是後端「新」項目，這輪不做） */
function lcStaffHTML(ev){const so=staffOptsFor(ev),on=new Set(ev.staff||[]);
  return `<div class="pg-ppl"><h4>負責人</h4><div class="chips">${so.map(([v,t])=>`<label class="chip"><input type="checkbox" name="kpStaff" value="${esc(v)}"${on.has(v)?" checked":""}><span>${esc(t)}</span></label>`).join("")}</div></div>`}
/* 時間頁、地點頁：每個時間行一組。時間：日期、時刻（時：分）、結束時刻、可加結束日期；點一段再用滾輪、方向鍵、數字（觸控上下滑）調整 */
const TE_WD="日一二三四五六";
const teDay=d=>d?`${+d.slice(5,7)}/${+d.slice(8,10)} 週${TE_WD[pd(d).getDay()]}`:"";
const teSplit=t=>{const s=t.start||today(),e=t.end||"",ed=e.slice(0,10);return {d:s.slice(0,10),h:s.slice(11,16),ed:ed&&ed!==s.slice(0,10)?ed:"",eh:e.slice(11,16)}};
function teJoin(t,o){t.start=o.d+(o.h?"T"+o.h:"");const e2=o.ed||(o.eh?o.d:"");t.end=e2?e2+(o.eh?"T"+o.eh:""):""}
const lvTimes=ev=>{const tm=new Map((ev.times||[]).map(t=>[t.id,t]));return [...(ev.blocks||[]).filter(b=>b.timeId&&tm.get(b.timeId)).map(b=>[tm.get(b.timeId),b]),...evFreeTimes(ev).map(t=>[t,null])]};
const teName=(t,b)=>b?`<input class="te-nm" data-kptx="${esc(b.id)}" value="${esc(b.text)}" maxlength="${StoreMap.TXT_MAX}" placeholder="標題（例如：協商會議）" aria-label="名稱">`:`<input class="te-nm" data-kplb="${esc(t.id)}" value="${esc(t.label)}" maxlength="${StoreMap.TXT_MAX}" placeholder="標題（例如：協商會議）" aria-label="名稱">`;
function lcTimeHTML(ev){const par=parentOf(ev);
  return lvTimes(ev).map(([t,b])=>{const o=teSplit(t),id=esc(t.id),on=k=>lvSeg&&lvSeg.tid===t.id&&lvSeg.k===k;
    const sg=(k,v,l)=>`<button type="button" class="sg num${on(k)?" on":""}" data-sg="${k}" data-tid="${id}" aria-label="${l}">${esc(v)}</button>`;
    const hm=(p,v,x)=>`<span class="te-pl">${sg(p+"h",v.slice(0,2),p?"結束時":"時")}:${sg(p+"m",v.slice(3,5),p?"結束分":"分")}<button type="button" class="te-cx" data-teclr="${x}" data-tid="${id}" aria-label="清除">${ico("close","solo")}</button></span>`;
    const add=(k,l)=>`<button type="button" class="te-pl dsh num" data-teset="${k}" data-tid="${id}" aria-label="${l}">--:--</button>`;
    return `<div class="te" data-te="${id}">${teName(t,b)}
      <div class="te-rw"><span class="te-pl">${sg("d",teDay(o.d),"日期")}</span>${o.h?hm("",o.h,"s"):add("s","加上時刻")}${!o.ed&&o.h?(o.eh?hm("e",o.eh,"e"):add("e","加上結束時刻")):""}</div>
      ${o.ed?`<div class="te-rw"><span class="te-pl">${sg("ed",teDay(o.ed),"結束日期")}<button type="button" class="te-cx" data-teclr="ed" data-tid="${id}" aria-label="清除結束日期">${ico("close","solo")}</button></span>${o.h?(o.eh?hm("e",o.eh,"e"):add("e","加上結束時刻")):""}</div>`
        :`<button type="button" class="te-pl plus" data-teset="ed" data-tid="${id}" aria-label="加上結束日期">+</button>`}
      ${par?`<label class="fld-check te-iss"><input type="checkbox" data-teiss="${id}"${t.toIssue?" checked":""}><span>也寫進母議題的處理紀錄</span></label>`:""}</div>`}).join("")
    +(ev.blocks.length<StoreMap.BLK_MAX?`<button type="button" class="te-add" data-teadd aria-label="新增時間">+</button>`:"");
}
function lcPlaceHTML(ev){const ps=labelsOf("地").slice(0,12);
  return lvTimes(ev).map(([t,b])=>`<div class="te" data-te="${esc(t.id)}">${teName(t,b)}<input class="te-plc" data-tepl="${esc(t.id)}" value="${esc(t.place||"")}" maxlength="100" placeholder="地點" aria-label="地點">
    ${ps.length?`<div class="chips">${ps.map(l=>`<button type="button" class="te-chip" data-teplc="${esc(t.id)}" data-v="${esc(l.name)}" aria-pressed="${t.place===l.name}">${esc(l.name)}</button>`).join("")}</div>`:""}</div>`).join("");
}
/* 儲存回饋（卡片最下面，role=status）：儲存中… → 已儲存＋復原；失敗＝紅字「儲存失敗：原因」；編輯中只顯示要修正的（請填名稱…） */
const KP_MSG={saving:"儲存中…",ok:"已儲存",fail:"儲存失敗",bad:""};
function lcSaveHTML(ev){const s=kpSt&&kpSt.id===ev.id&&(!editing||["bad","fail"].includes(kpSt.st))?kpSt:null;
  return `<span class="kp-st" role="status"${s?` data-st="${s.st}"`:""}>${s?esc(s.msg||KP_MSG[s.st]||""):""}</span>${s&&!editing&&s.st==="ok"&&s.before?`<button type="button" class="lc-undo" data-kpundo>復原</button>`:""}`}
/* 底部工具列：左邊母議題膠囊（點開自製選單），右邊文字、人、時間、地點、核取、超連結；人、時間、地點那一頁打開時那顆放大、其他變淡 */
function lcToolsHTML(ev,ed){const par=parentOf(ev),pane=ed&&lvPane;
  const tb=(k,i,l)=>`<button type="button"${pane===k?' class="on"':""} data-lctool="${k}" aria-label="${l}"${["staff","time","place"].includes(k)?` aria-pressed="${pane===k}"`:""}>${ico(i,"solo")}</button>`;
  return `<div class="lc-tools"><button type="button" class="lc-pa" data-lcpa aria-haspopup="listbox" aria-expanded="${ed&&lvPop}" aria-label="母議題"><span>${esc(par?par.title:"母議題")}</span><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2l4 6H1z"/></svg></button>
    <div class="lc-tl${pane?" paned":""}">${tb("text","text","文字")}${tb("staff","user","人")}${tb("time","clock","時間")}${tb("place","pin","地點")}${tb("check","box","核取")}${tb("link","link","超連結")}</div>${ed&&lvPop?lcPopHTML(ev):""}</div>`}
function lcPopHTML(ev){const opts=[["","不連結"],...state.issues.map(i=>[i.id,i.title+(i.doneAt?"（已結案）":"")])];
  return `<div class="lc-pop" role="listbox" aria-label="母議題">${opts.map(([v,t])=>`<button type="button" role="option" data-lcpar="${esc(v)}" aria-selected="${(ev.issueId||"")===v}">${esc(t)}</button>`).join("")}</div>`}
/* 一張即時回報卡片。o＝{k:"live"|"done",ids,full,body,tail}（完成紀錄：唯讀，k="done"；編輯中的完成紀錄由 views.js 傳 body／tail）。
   編輯中被撤權（存檔會失敗）時照樣畫成編輯中：草稿留在畫面上，失敗訊息在卡片上 */
function lcLiveHTML(ev,o){
  const done=o.k==="done",ro=done||!canEdit()&&!cardEd("e",ev.id),ed=!ro&&cardEd("e",ev.id),st=done?"done":evStatus(ev),par=parentOf(ev),view=ed&&lvPane||"main";
  const title=ed?`<input class="lc-title" data-kptitle value="${esc(ev.name)}" maxlength="500" aria-label="名稱">`:`<b class="lc-title"${ro?"":` data-kpgo="title" tabindex="0" role="button"`}>${esc(done?evName(ev):ev.name)}</b>`;   /* 完成紀錄：跟膠囊一樣帶段次（evName） */
  const fav=favBtnHTML(done?"done":"live",ev.id),rep=fav+(done?"":ro?(reportOn(ev)?'<span class="lc-rp">報告</span>':""):`<button type="button" class="lc-rep" data-evrep aria-pressed="${reportOn(ev)}">報告</button>`)+(!done&&!ro&&!ed?`<button type="button" class="lc-act del" data-lcdel>刪除</button>`:"");   /* 刪除：看得見的按鈕（不只靠拖到角落）；編輯中收起，免得跟「點外面存檔」搶。「完成」鈕 2026-11-25 拿掉（DievE：會被當成「寫完按完成」），完成只有把膠囊拖到右上角，新手引導與使用說明教這個 */
  const meta=`<span class="ev-st">${done?"完成":EV_ST[st]}</span>${staffNames(ev.staff).map(n=>`<span class="lc-tag">${esc(n)}</span>`).join("")}${done?lcWhen(ev.doneAt):lcWhen(ev.touchedAt)}${(ro||done)&&par?`<span class="lc-par">${esc(par.title)}</span>`:""}${labelChipsHTML(ev.labels)}`;
  const body=o.body!=null?o.body:view==="staff"?lcStaffHTML(ev):view==="time"?lcTimeHTML(ev):view==="place"?lcPlaceHTML(ev):lcLinesHTML(ev,ed,ro);
  return lcFrame({k:o.k,id:ev.id,key:"e:"+ev.id,st,ids:o.ids,full:o.full,ro,ed,sec:!!o.edit,attr:`data-ev="${esc(ev.id)}"`,title,cnt:lcCntHTML(lvVer(ev)),rep,meta,body,view,tail:o.tail,
    save:done?"":lcSaveHTML(ev),tools:ro?"":lcToolsHTML(ev,ed)});
}
/* 會長收藏的別的部門卡片（follow.js 的 favItems）：同一個外框、同一套打開／收回／上下張動畫，但一律唯讀：沒有報告、完成、刪除、工具列，也沒有 data-ev（events.js 的操作碰不到）。
   右上角寫「部門 · 唯讀」。x＝{e,dept}，o＝{ids,full} */
const fvKey=x=>`${x.dept}|live|${x.e.id}`;
const fvFind=key=>key&&favItems().live.find(x=>fvKey(x)===key);
function lcFavHTML(x,o){
  const e=x.e,st=evStatus(e),key=fvKey(x);
  return lcFrame({k:"fav",id:key,key:"f:"+key,st,ids:o.ids,full:o.full,ro:true,attr:"",title:`<b class="lc-title">${esc(evName(e))}</b>`,
    rep:`<span class="lc-tag">${esc(deptName(x.dept))} · 唯讀</span>`,
    meta:`<span class="ev-st">${EV_ST[st]}</span>${e.round>1?`<span class="lc-tag">第 ${e.round} 段</span>`:""}${lcWhen(e.touchedAt)}`,
    body:(e.blocks&&e.blocks.length)||(e.times&&e.times.length)?lcLinesHTML(e,false,true):e.desc?`<p class="fw-text">${esc(e.desc)}</p>`:`<p class="ln-empty">沒有說明</p>`});
}
/* 分欄時詳情卡往上延伸到搜尋列的高度（搜尋列縮回左欄寬，右邊讓出來）：--rise＝#liveMD 頂端比搜尋列頂端低多少，board.css 的 .lc-pane 用負邊距往上拉。
   搜尋列固定住時它的位置會隨捲動變，所以不量它：用外層 .layout（不會固定）當基準，加上搜尋列自己的高度與下邊距，推回它在一般排版的位置，捲到哪裡量都一樣。 */
function lvRise(split){
  const md=$("#liveMD"),bar=$("#dSearch"),ly=md.closest(".layout");let r=0;
  if(split&&bar&&!bar.hidden&&ly)r=Math.max(0,Math.round(md.offsetTop+bar.parentElement.offsetHeight+parseFloat(getComputedStyle(bar).marginBottom)));
  md.style.setProperty("--rise",r+"px");
}
addEventListener("resize",()=>{const md=$("#liveMD");if(md&&md.classList.contains("split"))lvRise(true)});
/* 整區：膠囊清單（報告在上、細線、其他）＋寬螢幕右邊的卡片；全螢幕的卡片在 #lcFull（lcFullSync） */
function renderEvents(){
  const live=liveOrder(),ids=live.map(e=>e.id),rep=live.filter(reportOn),rest=live.filter(e=>!reportOn(e));
  if(lvOpen&&!ids.includes(lvOpen)){lvOpen=null;lcGone()}
  if(!editing){kp=null;lvPane=null;lvPop=false;lvSeg=null;if(kpSt&&kpSt.st!=="saving"&&kpSt.id!==lvOpen)kpSt=null}   /* 收合（或換成別張）＝儲存回饋與「復原」消失 */
  const favs=favItems().live,fids=favs.map(fvKey),fv=fvOpen&&favs.find(x=>fvKey(x)===fvOpen);
  if(fvOpen&&!fv){fvOpen=null;lcGone()}   /* 收藏的那張完成了、被刪了或讀不到了：卡片收掉 */
  const wide=lvWide(),split=wide&&!!(lvOpen||fvOpen),pane=$("#evDetail");
  $("#liveMD").classList.toggle("split",split);
  lvRise(split);
  const cp=ev=>cpHTML(ev,{sel:split&&ev.id===lvOpen,away:!wide&&ev.id===lvOpen});
  /* 原位更新（morph.js）：沒變的膠囊、正在打字的欄位都是同一個節點，焦點、捲動、正在播的動畫都留著。新增鈕是右下角的浮動圓鈕（nav.js 的 fabSync） */
  /* 會長收藏的別的部門的即時回報：排在自己的後面、自成一區（小標「收藏」＋細線），名稱右邊寫部門；點了跟自己的卡片一樣打開，但唯讀（lcFavHTML） */
  const fav=favs.map(x=>{const key=fvKey(x),on=key===fvOpen;return `<button type="button" class="cp fav-cp${split&&on?" sel":""}${!wide&&on?" away":""}" data-cp="${esc(key)}" data-st="${esc(evStatus(x.e))}"${split&&on?' aria-current="true"':""}><span class="live-dot" aria-hidden="true"></span><b>${esc(evName(x.e))}</b><span class="cp-d">${esc(deptName(x.dept))}</span></button>`}).join("");
  morphTo($("#events"),live.length||fav?`<div class="cps">${rep.map(cp).join("")}${rep.length&&rest.length?'<span class="sepr" aria-hidden="true"></span>':""}${rest.map(cp).join("")}${fav?'<h3 class="cps-h">收藏</h3>':""}${fav}</div>`:`<p class="empty">目前沒有即時回報。</p>`);
  if(split){morphTo(pane,fv?lcFavHTML(fv,{ids:fids}):lcLiveHTML(live.find(e=>e.id===lvOpen),{k:"live",ids}));pane.hidden=false}else{pane.textContent="";pane.hidden=true}
  document.body.classList.toggle("lc-lock",split&&editing&&!!kp);   /* 寬螢幕編輯中：鎖住整頁捲動（卡片內容自己捲） */
  lcFullSync();Anim.syncPings();fabSync();
}
/* 全螢幕卡片（手機與中等寬度）：蓋在整頁與工具列上面，內容自己捲動、底部工具列固定 */
function lcFullSync(){
  let host=$("#lcFull");
  const ev=!lvWide()&&lvOpen&&state.events.find(e=>e.id===lvOpen&&!e.doneAt);
  const fv=!ev&&!lvWide()&&fvFind(fvOpen);
  const html=ev?lcLiveHTML(ev,{k:"live",ids:liveOrder().map(e=>e.id),full:true}):fv?lcFavHTML(fv,{ids:favItems().live.map(fvKey),full:true}):!lvWide()&&dnOpen&&typeof doneCardHTML==="function"?doneCardHTML(dnOpen,true):"";
  if(!html){if(host&&!host.hidden){host.textContent="";host.hidden=true}return}
  if(!host){document.body.insertAdjacentHTML("beforeend",'<div id="lcFull" class="lc-host" role="dialog" aria-modal="true" aria-label="即時回報卡片" hidden></div>');host=$("#lcFull")}
  morphTo(host,html);host.hidden=false;
}

/* ===== 打開、收回、上一張／下一張（容器轉化：DESIGN-next 第五節） ===== */
const lcHostOf=k=>lvWide()?$(k==="done"?"#doneDetail":"#evDetail"):$("#lcFull");
const lcCard=k=>{const h=lcHostOf(k);return h&&h.querySelector(":scope>.lc")};
const lcPill=(k,id)=>id&&document.querySelector(`${k==="done"?"#doneList":"#events"} [data-cp="${CSS.escape(id)}"]`);
const lcCap=el=>{if(!el)return null;const r=el.getBoundingClientRect(),b=el.querySelector(".lc-title,b");return r.width?{r,tr:b?b.getBoundingClientRect():null,rad:parseFloat(getComputedStyle(el).borderRadius)||0}:null};
const lcSet=(k,id)=>{if(id)lvOpen=dnOpen=fvOpen=null;if(k==="live")lvOpen=id;else if(k==="done")dnOpen=id;else fvOpen=id};
const lcKind=cp=>cp.closest("#doneList")?"done":cp.classList.contains("fav-cp")?"fav":"live";   /* 點到的膠囊是哪一種 */
/* 卡片被資料變動收掉（結案、被刪、別人改了）而不是使用者收的：Back 的「card」那一層也要拿掉，不然左上角還顯示「上一頁」、按了沒有任何反應 */
const lcGone=()=>{if(!lcCur())Back.closed("card")};
const lcCur=()=>lvOpen?["live",lvOpen]:dnOpen?["done",dnOpen]:fvOpen?["fav",fvOpen]:null;
/* 外框從膠囊的位置與圓角展開（clip-path），標題從膠囊的名稱滑到卡片標題，其餘淡入 */
function lcGrow(el,from){
  if(!el||reduceMotion())return;
  const n=el.getBoundingClientRect(),px=v=>Math.max(0,v).toFixed(1)+"px";
  const parts=[...el.querySelectorAll(".lc-head>*,.lc-nav,.lc-meta,.lc-body,.lc-save,.lc-tools")];
  if(!from){el.animate([{opacity:0,transform:"translateY(14px)"},{opacity:1,transform:"none"}],{duration:MO.slow,easing:"cubic-bezier(.25,1.12,.4,1)"});return}
  const R=getComputedStyle(el).borderRadius||"0px",f=from.r;
  el.animate([{clipPath:`inset(${px(f.top-n.top)} ${px(n.right-f.right)} ${px(n.bottom-f.bottom)} ${px(f.left-n.left)} round ${Math.min(27,f.height/2)}px)`},{clipPath:`inset(0 0 0 0 round ${R})`}],{duration:MO.layout,easing:"cubic-bezier(.25,1.12,.4,1)"});
  const ti=el.querySelector(".lc-title");
  if(ti&&from.tr){const a=ti.getBoundingClientRect(),k=a.height?from.tr.height/a.height:1;ti.animate([{transformOrigin:"0 0",transform:`translate(${from.tr.left-a.left}px,${from.tr.top-a.top}px) scale(${k.toFixed(3)})`},{transformOrigin:"0 0",transform:"none"}],{duration:MO.layout,easing:"cubic-bezier(.25,1.12,.4,1)"})}
  parts.filter(x=>x!==ti&&!x.contains(ti)).forEach((x,i)=>x.animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"none"}],{duration:MO.base,delay:110+Math.min(i,8)*28,easing:MO.out,fill:"backwards"}));
  ti&&ti.parentElement&&[...ti.parentElement.children].filter(x=>x!==ti).forEach(x=>x.animate([{opacity:0},{opacity:1}],{duration:MO.base,delay:110,easing:MO.out,fill:"backwards"}));
}
/* 收回：卡片的分身縮回膠囊（裡面先淡出、標題滑回膠囊的名稱、外框縮到膠囊大小再淡掉） */
function lcShrink(g,to,from){
  const done=()=>g.remove();if(reduceMotion()||!from){done();return}
  const px=v=>Math.max(0,v).toFixed(1)+"px",R=getComputedStyle(g).borderRadius||"0px",ti=g.querySelector(".lc-title");
  [...g.querySelectorAll(".lc-head>*,.lc-nav,.lc-meta,.lc-body,.lc-save,.lc-tools,.lc-pop")].filter(x=>x!==ti).forEach(x=>x.animate([{opacity:1},{opacity:0}],{duration:MO.fast,easing:MO.in,fill:"forwards"}));
  if(!to){g.animate([{opacity:1},{opacity:0,transform:"translateY(30px)"}],{duration:MO.base,easing:MO.in,fill:"forwards"}).onfinish=done;return}
  const b=to.getBoundingClientRect(),r=from.r,tb=to.querySelector("b");
  if(ti&&tb&&from.tr){const a=tb.getBoundingClientRect(),k=from.tr.height?a.height/from.tr.height:1;ti.animate([{transformOrigin:"0 0",transform:"none"},{transformOrigin:"0 0",transform:`translate(${a.left-from.tr.left}px,${a.top-from.tr.top}px) scale(${k.toFixed(3)})`}],{duration:MO.slow,easing:"cubic-bezier(.25,1.12,.4,1)",fill:"forwards"})}
  const ins=`inset(${px(b.top-r.top)} ${px(r.right-b.right)} ${px(r.bottom-b.bottom)} ${px(b.left-r.left)} round ${Math.min(27,b.height/2)}px)`;
  g.animate([{clipPath:`inset(0 0 0 0 round ${R})`,opacity:1},{clipPath:ins,opacity:1,offset:.82},{clipPath:ins,opacity:0}],{duration:MO.slow+90,easing:"cubic-bezier(.25,1.12,.4,1)",fill:"forwards"}).onfinish=done;
}
/* 卡片的分身（收回、換卡片時舊的那張留在原位做動畫）：固定在畫面上的同一個位置，不能點、沒有 id */
function lcGhost(el){
  if(!el)return null;const r=el.getBoundingClientRect(),g=el.cloneNode(true);
  g.removeAttribute("data-edbox");g.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));g.setAttribute("aria-hidden","true");g.inert=true;g.classList.add("lc-ghost");
  Object.assign(g.style,{position:"fixed",left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px",margin:"0",zIndex:el.closest("#lcFull")?"47":"30"});
  document.body.append(g);return g;
}
/* 打開或收回 k（live／done）那一張：id＝null 收回。全螢幕時推一筆瀏覽紀錄（系統返回鍵先關卡片） */
function lcShow(k,id){
  const cur=lcCur(),was=cur&&cur[0]===k?cur[1]:null;if(was===id&&id)return;
  if(id||cur)Sfx.play(id?"enter":"back");   /* 打開卡片＝進入，收回＝返回 */
  const wide=lvWide(),oldEl=cur&&lcCard(cur[0]),from=id&&!wide?lcCap(lcPill(k,id)):null,oldCap=oldEl&&lcCap(oldEl),g=oldEl&&!reduceMotion()?lcGhost(oldEl):null;
  if(cur&&cur[0]!==k)lcSet(cur[0],null);
  lcSet(k,id);if(kpSt&&kpSt.id!==id&&kpSt.st!=="saving")kpSt=null;
  render();
  const el=id&&lcCard(k);
  if(g){if(!id&&!wide)lcShrink(g,lcPill(cur[0],cur[1]),oldCap);else g.animate([{opacity:1},{opacity:0}],{duration:MO.fast,easing:MO.in,fill:"forwards"}).onfinish=()=>g.remove()}
  if(el&&!reduceMotion()){if(wide)el.animate([{opacity:0,transform:"translateX(14px)"},{opacity:1,transform:"none"}],{duration:MO.base,easing:MO.out});else lcGrow(el,from)}
  if(!wide){if(id&&!cur)Back.opened("card",lcBack);else if(!id)Back.closed("card")}
}
/* 系統返回鍵、卡片左上的返回鍵：編輯中先存檔（名稱空白等就留在原地），再縮回膠囊 */
async function lcBack(){const cur=lcCur();if(!cur){lcGone();return}
  if(!(await lvEndEdit())){if(!lvWide())Back.opened("card",lcBack);return}
  const c=lcCur();if(c)lcShow(c[0],null);
}
/* 編輯中先存檔並離開編輯：回傳 true＝已經不在編輯（存檔可能還在進行，結果顯示在卡片上）；名稱空白等不合格＝false、留在編輯 */
async function lvEndEdit(){
  if(!editing)return true;if(!kp)return false;
  const p=kpCommit();
  for(;;){if(!editing)return true;const r=await Promise.race([p.then(v=>({v})),new Promise(res=>setTimeout(res,30))]);if(r&&"v" in r)return !editing}
}
/* 上一張／下一張：卡片外框留在原地、高度滑到新的（手機不動高度），舊內容往一邊滑出、新內容從另一邊滑進，底部工具列不動 */
async function lcStep(dir){
  const cur=lcCur();if(!cur)return;const [k,id]=cur;
  const ids=k==="live"?liveOrder().map(e=>e.id):k==="fav"?favItems().live.map(fvKey):doneIds(),to=ids[ids.indexOf(id)+dir];if(!to)return;
  Sfx.play("tab");   /* 上一張／下一張＝換頁 */
  if(!(await lvEndEdit()))return;
  const el=lcCard(k),inn=el&&el.querySelector(".lc-in"),h0=el&&el.getBoundingClientRect().height,gi=inn&&!reduceMotion()?inn.cloneNode(true):null,top=inn&&inn.offsetTop;
  lcSet(k,to);kpSt=null;render();
  const ne=lcCard(k),ni=ne&&ne.querySelector(".lc-in");if(!ne||!gi||!ni)return;
  gi.removeAttribute("id");gi.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));gi.setAttribute("aria-hidden","true");gi.inert=true;gi.classList.add("lc-in-ghost");
  Object.assign(gi.style,{position:"absolute",left:ni.offsetLeft+"px",top:top+"px",width:ni.offsetWidth+"px",pointerEvents:"none"});ne.append(gi);
  const dx=dir*48;
  gi.animate([{opacity:1,transform:"none"},{opacity:0,transform:`translateX(${-dx}px)`}],{duration:MO.fast+40,easing:MO.in,fill:"forwards"}).onfinish=()=>gi.remove();
  ni.animate([{opacity:0,transform:`translateX(${dx}px)`},{opacity:1,transform:"none"}],{duration:MO.slow,delay:60,easing:"cubic-bezier(.25,1.12,.4,1)",fill:"backwards"});
  const h1=ne.getBoundingClientRect().height;
  if(!ne.classList.contains("full")&&!isPhone()&&Math.abs(h1-h0)>1)ne.animate([{height:h0+"px",overflow:"clip"},{height:h1+"px",overflow:"clip"}],{duration:MO.layout,easing:"cubic-bezier(.25,1.12,.4,1)"});
}
/* 新增的卡片（events.js 的新增鈕）打開之後：浮上來、全螢幕時推一筆瀏覽紀錄 */
function lcOpened(k){const el=lcCard(k);if(el)lcGrow(el,null);if(!lvWide())Back.opened("card",lcBack)}
const doneIds=()=>typeof doneItems==="function"?doneItems().map(x=>x.id):[];

/* ===== 原位編輯（Keep 式；DESIGN-next 第七節「編輯規則」） =====
   - 開始：有編輯權限的人點名稱、一行、核取框（勾選同時切換）、「沒有說明」、工具列、母議題膠囊（kpStart → render.js 的 startEdit 記下 kp）。
     沒有儲存、取消、編輯鈕。一次一張，跟其他卡片的單卡編輯共用 editing／cardEdit。
   - 名稱、逐行內容、時間、地點、母議題、負責人、超連結都直接改：打字、勾選直接寫進 state；新增、刪除一行、換頁才重畫，游標由 render 前後的 kpFocusGet／kpFocusSet 放回原位。
   - 點卡片外面、Esc＝kpCommit：沒改就只離開編輯；改了就離開編輯並儲存（kpSave）。儲存中／已儲存（＋復原）／失敗顯示在卡片上；
     失敗＝回到編輯、保留草稿。再點一次外面（或 Esc）＝卡片收回。返回鍵、上一張／下一張＝先存檔再動作。
   - 新增的空白卡片（名稱沒改、沒有內容）點外面就不留。 */
let kpSaving=false;
const kpBusy=()=>kpSaving||(typeof fsBusy!=="undefined"&&fsBusy);
const kpEv=()=>kp&&state.events.find(e=>e.id===kp.id);
/* 每次改到逐行內容就同步 desc：其他存檔路徑以 blocks 為準，desc 一定要跟上（store-map.js 的 blocksOf 看到兩邊不同會照 desc 重建） */
const kpSync=ev=>{ev.desc=StoreMap.descOf(ev.blocks);syncLink(ev)};   /* 母議題的處理紀錄（寫進母議題的時間）也跟著 */
/* 開始編輯 id 這張：o.focus＝行 id／"title"／""（第一行；沒有內容就新增一行）／null（不放游標），o.toggle＝要切換勾選的行 */
async function kpStart(id,o={}){
  if(kpBusy())return false;
  if(!(await startEdit("e:"+id,()=>{if(o.toggle){const ev=state.events.find(e=>e.id===id),b=(ev?.blocks||[]).find(x=>x.id===o.toggle);if(b){b.check=!b.check;kpSync(ev)}}})))return false;   /* 勾選也要同步 desc（03 審查 P0-1） */
  const ev=kpEv();if(!ev)return true;
  if(o.focus===null)return true;
  if(o.focus==="title")kpFocus("title");
  else if(o.focus)kpFocus(o.focus);
  else if(ev.blocks.length)kpFocus(ev.blocks[0].id);
  else kpAdd(ev,0);
  return true;
}
/* 逐行內容是自動折行的輸入框：高度跟著內容（渲染後、輸入時、視窗寬度變了都重算；折行只是視覺，一行還是一筆） */
function kpFit(el){el.style.height="auto";if(el.scrollHeight)el.style.height=el.scrollHeight+"px"}
function kpFitAll(){document.querySelectorAll(".lc-ed textarea.tx").forEach(kpFit)}
window.addEventListener("resize",()=>{if(kp)kpFitAll()});
/* 游標放到某一行（或名稱）的文字最後；sel＝true 時全選（新卡片的名稱） */
function kpFocus(id,sel){
  const el=id==="title"?document.querySelector(".lc-ed [data-kptitle]"):document.querySelector(`.lc-ed [data-kptx="${CSS.escape(id)}"]`)||document.querySelector(`.lc-ed [data-kpids~="${CSS.escape(id)}"]`);if(!el)return;
  el.focus({preventScroll:true});
  if(sel)el.select();
  else if(el.dataset.kpids){const i=el.dataset.kpids.split(" ").indexOf(id),n=el.value.split("\n").slice(0,i+1).join("\n").length;el.setSelectionRange(n,n)}   /* 大輸入框：游標放到那一行的最後 */
  else{const n=el.value.length;el.setSelectionRange(n,n)}
  if(!el.dataset.kpids)el.scrollIntoView({block:"nearest",behavior:reduceMotion()?"auto":"smooth"});
}
function kpFocusGet(){const a=document.activeElement;if(!kp||!a||!a.closest||!a.closest(".lc-ed"))return null;
  const k=["kptx","kpgrp","kplb","tepl","sg"].find(x=>a.dataset[x]!==undefined),lk=a.dataset.e&&a.closest(".kp-lk");
  return {sel:a.dataset.kptitle!==undefined?"[data-kptitle]":k==="sg"?`[data-sg="${CSS.escape(a.dataset.sg)}"][data-tid="${CSS.escape(a.dataset.tid)}"]`:k?`[data-${k}="${CSS.escape(a.dataset[k])}"]`:lk?`[data-lk="${CSS.escape(lk.dataset.lk)}"] [data-e="${CSS.escape(a.dataset.e)}"]`:null,s:a.selectionStart,e:a.selectionEnd}}
function kpFocusSet(f){if(!f||!f.sel||!kp)return;const el=document.querySelector(".lc-ed "+f.sel);if(!el||el===document.activeElement)return;
  el.focus({preventScroll:true});try{if(f.s!=null)el.setSelectionRange(f.s,f.e)}catch(_){}}
/* 新增一行（在第 at 個位置），種類跟著 like（核取→核取、時間→核取、文字→文字） */
function kpAdd(ev,at,like){
  if(ev.blocks.length>=StoreMap.BLK_MAX){kpSay("bad",`最多 ${StoreMap.BLK_MAX} 行`);return}
  const b={id:uid("b"),text:"",check:like&&like.check!==null&&like.check!==undefined?false:null,timeId:null};
  ev.blocks.splice(at,0,b);kpSync(ev);lvPane=null;render();kpFocus(b.id);
}
function kpDel(ev,id){
  const i=ev.blocks.findIndex(b=>b.id===id);if(i<0)return;const b=ev.blocks[i];
  if(b.timeId)ev.times=ev.times.filter(t=>t.id!==b.timeId);
  ev.blocks.splice(i,1);kpSync(ev);render();
  const p=ev.blocks[Math.max(0,i-1)];if(p)kpFocus(p.id);
}
/* 圓鈕選了文字／清單／時間後，新卡片先放好那一種的第一行，游標仍在名稱（整段選取，打字就換掉）；空白的第一行不算「填了內容」（kpCommit） */
function kpSeed(kind){
  const ev=kpEv();
  if(ev){if(kind==="time")lvAddTime(ev);else if(ev.blocks.length<StoreMap.BLK_MAX)ev.blocks.push({id:uid("b"),text:"",check:kind==="check"?false:null,timeId:null});kpSync(ev);render()}
  kpFocus("title",true);
}
/* 新增一個時間行：今天、現在的時刻（分鐘取 5 的倍數）；回傳時間標記 */
function lvAddTime(ev){
  if(ev.blocks.length>=StoreMap.BLK_MAX){kpSay("bad",`最多 ${StoreMap.BLK_MAX} 行`);return null}
  const d=new Date(),m=Math.round(d.getMinutes()/5)*5,h=(d.getHours()+(m===60?1:0))%24;
  const t={id:uid("t"),label:"",start:`${today()}T${pad(h)}:${pad(m%60)}`,end:"",place:"",toIssue:false};
  ev.times.push(t);ev.blocks.push({id:uid("b"),text:"",check:false,timeId:t.id});kpSync(ev);return t;
}
function kpSay(st,msg){if(st==="bad")Sfx.play("no");kpSt={id:kp&&kp.id,st,msg};const s=document.querySelector(".lc-ed .kp-st");if(s){s.dataset.st=st;s.textContent=msg}}
/* 工具列：文字、核取＝在最後新增一行；超連結＝新增一組；人、時間、地點＝卡片內容換成那一頁（再按一次回到逐行內容） */
function lvTool(ev,k){
  lvPop=false;
  if(k==="text"||k==="check"){kpAdd(ev,ev.blocks.length,{check:k==="check"?false:null});return}
  if(k==="link"){lvPane=null;if(ev.links.length>=StoreMap.LNK_MAX){kpSay("bad",`最多 ${StoreMap.LNK_MAX} 個超連結`);render();return}
    const l={id:uid("l"),name:"",url:"",color:COLORS[ev.links.length%COLORS.length]};ev.links.push(l);render();
    document.querySelector(`.lc-ed [data-lk="${CSS.escape(l.id)}"] [data-e="name"]`)?.focus({preventScroll:true});return}
  if(lvPane===k){lvPane=null;lvSeg=null;render();return}
  /* 時間、地點頁沒有任何時間行時要先新增一行；已經 50 行加不了：不換頁（換過去會是空白），只提示（ui-11） */
  if(k!=="staff"&&!lvTimes(ev).length&&ev.blocks.length>=StoreMap.BLK_MAX){kpSay("bad",`最多 ${StoreMap.BLK_MAX} 行`);return}
  lvPane=k;lvSeg=null;
  if(k!=="staff"&&!lvTimes(ev).length){const t=lvAddTime(ev);if(t&&k==="time")lvSeg={tid:t.id,k:"d",buf:""}}
  render();
  if(k!=="staff"){const n=document.querySelector(".lc-ed .lc-body .te:last-of-type .te-nm");if(n&&!n.value)n.focus({preventScroll:true})}
  lvBodyIn();
}
/* 換頁：新的內容一列一列浮上來 */
function lvBodyIn(){if(reduceMotion())return;const b=document.querySelector(".lc-ed .lc-body");if(!b)return;
  [...b.children].slice(0,10).forEach((x,i)=>x.animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"none"}],{duration:MO.base,delay:i*26,easing:MO.out,fill:"backwards"}))}
/* 時間頁：調整選到的那一段（dir＝±1，set＝直接打的數字） */
function teTick(t,k,dir,set){
  const o=teSplit(t),f=k.slice(-1),e=k[0]==="e"&&k!=="ed"||k==="eh"||k==="em";
  if(k==="d"){o.d=addDays(o.d,dir);if(o.ed&&o.ed<=o.d)o.ed=""}
  else if(k==="ed"){const n=addDays(o.ed,dir);if(n>o.d)o.ed=n}
  else{let [h,m]=((e?o.eh:o.h)||"00:00").split(":").map(Number);
    if(set!==undefined){if(f==="h")h=set;else m=set}else if(f==="h")h=(h+dir+24)%24;else m=(Math.round(m/5)*5+5*dir+60)%60;
    const v=pad(h)+":"+pad(m);if(e){if(o.ed||v>o.h)o.eh=v}else{o.h=v;if(!o.ed&&o.eh&&o.eh<=v)o.eh=""}}
  teJoin(t,o);
}
function lvSegTick(dir,set){
  const ev=kpEv(),s=lvSeg,t=ev&&s&&ev.times.find(x=>x.id===s.tid);if(!t)return;
  teTick(t,s.k,dir,set);kpSync(ev);render();Sfx.play("roll");
  const el=document.querySelector(`.lc-ed .sg.on`);if(el&&!reduceMotion())el.animate([{transform:`translateY(${(dir||1)>0?8:-8}px)`,opacity:.2},{transform:"none",opacity:1}],{duration:MO.fast,easing:MO.out});
}
/* 時間頁：點日期、時、分（不是拖曳）＝跳出系統的月曆或時間選擇器（原生 input date／time 的 showPicker，安卓是月曆與錶盤）；選好套用到那一段。拖曳、滾輪、方向鍵、打數字照舊 */
function tePick(sg){
  if(performance.now()-lvDragAt<500||typeof HTMLInputElement.prototype.showPicker!=="function")return;
  const ev=kpEv(),t=ev&&ev.times.find(x=>x.id===sg.dataset.tid);if(!t)return;
  const k=sg.dataset.sg,isD=k==="d"||k==="ed",end=!isD&&k[0]==="e",o=teSplit(t),cur=isD?(k==="ed"?o.ed:o.d):(end?o.eh:o.h);
  document.querySelectorAll(".te-pk").forEach(x=>x.remove());
  const inp=document.createElement("input"),r=sg.getBoundingClientRect();
  inp.type=isD?"date":"time";inp.className="te-pk";inp.tabIndex=-1;inp.setAttribute("aria-hidden","true");inp.value=cur||"";inp.style.left=r.left+"px";inp.style.top=r.bottom+"px";
  const gone=()=>{clearTimeout(inp._t);inp.remove()};inp._t=setTimeout(gone,120000);
  inp.addEventListener("cancel",gone);
  inp.addEventListener("change",()=>{const v=inp.value;gone();if(!v)return;const e2=kpEv(),t2=e2&&e2.times.find(x=>x.id===sg.dataset.tid);if(!t2)return;const q=teSplit(t2);
    if(k==="d"){q.d=v;if(q.ed&&q.ed<=v)q.ed=""}
    else if(k==="ed"){if(v<=q.d){kpSay("bad","結束日期要晚於開始日期");return}q.ed=v}
    else if(end){if(!q.ed&&v<=q.h){kpSay("bad","結束時間要晚於開始時間");return}q.eh=v}
    else{q.h=v;if(!q.ed&&q.eh&&q.eh<=v)q.eh=""}
    teJoin(t2,q);kpSync(e2);render();Sfx.play("roll")});
  document.body.append(inp);
  try{inp.showPicker()}catch(_){gone()}
}
/* 編輯中卡片裡的點擊（回傳 true＝處理掉了） */
function lvEdClick(t,ev){
  const ck=t.closest("[data-kpck]");if(ck){lvCheck(ev,ck);return true}
  if(lvPop&&!t.closest("[data-lcpa],.lc-pop")){lvPop=false;render()}
  if(lvSeg&&!t.closest("[data-sg]")){lvSeg=null;document.querySelectorAll(".lc-ed .sg.on").forEach(x=>x.classList.remove("on"))}
  const tool=t.closest("[data-lctool]");if(tool){lvTool(ev,tool.dataset.lctool);return true}
  if(t.closest("[data-lcpa]")){lvPop=!lvPop;render();if(lvPop)document.querySelector(`.lc-pop [aria-selected="true"]`)?.focus({preventScroll:true});return true}
  const par=t.closest("[data-lcpar]");if(par){ev.issueId=par.dataset.lcpar||null;lvPop=false;kpSync(ev);render();document.querySelector(".lc-ed [data-lcpa]")?.focus({preventScroll:true});return true}
  const del=t.closest("[data-kpdel]");if(del){kpDel(ev,del.dataset.kpdel);return true}
  const tdel=t.closest("[data-kptdel]");if(tdel){ev.times=ev.times.filter(x=>x.id!==tdel.dataset.kptdel);kpSync(ev);render();return true}
  const tm=t.closest("[data-kptm]");if(tm){lvPane="time";lvSeg=tm.dataset.kptm?{tid:tm.dataset.kptm,k:"d",buf:""}:null;render();document.querySelector(".lc-ed .sg.on")?.focus({preventScroll:true});lvBodyIn();return true}
  if(t.closest("[data-kplkdel]")){const lk=t.closest(".kp-lk");ev.links=ev.links.filter(x=>x.id!==lk.dataset.lk);render();return true}
  const sg=t.closest("[data-sg]");if(sg){lvSeg={tid:sg.dataset.tid,k:sg.dataset.sg,buf:""};document.querySelectorAll(".lc-ed .sg.on").forEach(x=>x.classList.remove("on"));sg.classList.add("on");sg.focus({preventScroll:true});tePick(sg);return true}
  const set=t.closest("[data-teset]");if(set){const tt=ev.times.find(x=>x.id===set.dataset.tid);if(!tt)return true;const o=teSplit(tt),k=set.dataset.teset,d=new Date();
    if(k==="s"){const m=Math.round(d.getMinutes()/5)*5;o.h=`${pad((d.getHours()+(m===60?1:0))%24)}:${pad(m%60)}`;lvSeg={tid:tt.id,k:"h",buf:""}}
    else if(k==="e"){const h=Math.min(23,+(o.h||"00").slice(0,2)+1);o.eh=pad(h)+":"+(o.h||"00:00").slice(3);if(!o.ed&&o.eh<=o.h)o.eh="";lvSeg={tid:tt.id,k:"eh",buf:""}}
    else{o.ed=addDays(o.d,1);lvSeg={tid:tt.id,k:"ed",buf:""}}
    teJoin(tt,o);kpSync(ev);render();document.querySelector(".lc-ed .sg.on")?.focus({preventScroll:true});return true}
  const clr=t.closest("[data-teclr]");if(clr){const tt=ev.times.find(x=>x.id===clr.dataset.tid);if(!tt)return true;const o=teSplit(tt),k=clr.dataset.teclr;
    if(k==="s"){o.h="";if(!o.ed)o.eh=""}else if(k==="e")o.eh="";else{o.ed="";if(o.eh&&o.eh<=o.h)o.eh=""}
    teJoin(tt,o);lvSeg=null;kpSync(ev);render();return true}
  if(t.closest("[data-teadd]")){const tt=lvAddTime(ev);if(tt)lvSeg=lvPane==="time"?{tid:tt.id,k:"d",buf:""}:null;render();document.querySelector(".lc-ed .lc-body .te:last-of-type .te-nm")?.focus({preventScroll:true});return true}
  const plc=t.closest("[data-teplc]");if(plc){const tt=ev.times.find(x=>x.id===plc.dataset.teplc);if(tt){tt.place=tt.place===plc.dataset.v?"":plc.dataset.v;kpSync(ev);render()}return true}
  const iss=t.closest("[data-teiss]");if(iss){const tt=ev.times.find(x=>x.id===iss.dataset.teiss);if(tt){tt.toIssue=iss.checked;kpSync(ev)}return true}
  return false;
}
/* 勾選（核取框、時間線的圓點）：寫進 state、只換那一行的樣子（不重畫）、勾勾彈一下、游標到那一行 */
function lvCheck(ev,ck){
  const b=ev.blocks.find(x=>x.id===ck.dataset.kpck);if(!b)return;b.check=!b.check;kpSync(ev);
  if(ck.tagName==="INPUT")ck.checked=b.check;else ck.setAttribute("aria-checked",String(b.check));
  const ln=ck.closest(".ln");if(ln){ln.classList.toggle("done",b.check);const tc=ln.querySelector(".tmc");if(tc)tc.classList.toggle("late",!b.check&&tmLate(ev.times.find(x=>x.id===b.timeId)))}
  if(!reduceMotion())ck.animate([{transform:"scale(.7)"},{transform:"scale(1.16)",offset:.55},{transform:"none"}],{duration:280,easing:MO.out});
  ln&&ln.querySelector("textarea.tx")?.focus({preventScroll:true});   /* 游標到那一行（ui-03：按核取框那一下不失焦，放開後到那一行） */
  Sfx.play("check");
}
/* 鍵盤：Enter＝在下面新增一行（名稱欄＝到第一行）、空白行按 Backspace＝刪掉回到上一行；時間頁選到一段時上下鍵、數字調整；Esc＝收起母議題選單或存檔並離開編輯 */
function kpKey(e){
  const ev=kpEv(),a=e.target;if(!ev)return false;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(lvPop){lvPop=false;render();document.querySelector(".lc-ed [data-lcpa]")?.focus({preventScroll:true})}else kpCommit();return true}
  if(e.isComposing)return false;
  if(a.dataset.sg!==undefined&&lvSeg){
    if(e.key==="ArrowUp"||e.key==="ArrowDown"){e.preventDefault();lvSegTick(e.key==="ArrowUp"?1:-1);return true}
    if(/^\d$/.test(e.key)&&!/d$/.test(lvSeg.k)){const b=(lvSeg.buf+e.key).slice(-2),v=+b;lvSeg.buf=b;if(v<(lvSeg.k.slice(-1)==="h"?24:60))lvSegTick(0,v);e.preventDefault();return true}
    return false}
  if(e.key==="Enter"&&a.dataset.kptitle!==undefined){e.preventDefault();lvPane=null;if(ev.blocks.length){render();kpFocus(ev.blocks[0].id)}else kpAdd(ev,0);return true}
  if(e.key==="Enter"&&a.dataset.kplb!==undefined&&a.tagName==="TEXTAREA"){e.preventDefault();return true}   /* 沒連到行的時間標記名稱：一樣不能換行（折行只是視覺） */
  if(a.dataset.kpgrp!==undefined){   /* 大輸入框：Enter 就是換行（多一筆，滿了就擋）；整個框空了按 Backspace＝刪掉這個框唯一的空行 */
    if(e.key==="Enter"&&ev.blocks.length>=StoreMap.BLK_MAX){e.preventDefault();kpSay("bad",`最多 ${StoreMap.BLK_MAX} 行`);return true}
    if(e.key==="Backspace"&&!a.value&&ev.blocks.length>1){e.preventDefault();kpDel(ev,a.dataset.kpgrp);return true}
    return false}
  const id=a.dataset.kptx;if(id===undefined||a.closest(".te"))return false;
  const i=ev.blocks.findIndex(b=>b.id===id);
  if(e.key==="Enter"){e.preventDefault();kpAdd(ev,i+1,ev.blocks[i]);return true}
  if(e.key==="Backspace"&&!a.value&&ev.blocks.length>1){e.preventDefault();kpDel(ev,id);return true}
  return false;
}
/* 大輸入框打字：照換行拆回逐行（blocks），前面、後面沒變的行沿用原本的行 ID，中間改過的依序沿用、多的新增、少的刪掉。
   每行最多 TXT_MAX 字（多的切掉）、全部最多 BLK_MAX 行（超過的行接在最後一行後面、提示）。空行＝空的一筆，行尾空白存檔時照舊 trim（kpTidy） */
function kpGrpIn(a,ev){
  const ids=a.dataset.kpids.split(" "),i0=ev.blocks.findIndex(b=>b.id===ids[0]),old=ids.map(id=>ev.blocks.find(b=>b.id===id));
  if(i0<0||old.some((b,n)=>!b||ev.blocks[i0+n]!==b))return;   /* 對不上（別處改了這幾行）：不動，等重畫 */
  let lines=a.value.replace(/\r\n?/g,"\n").split("\n"),fix=lines.some(x=>x.length>StoreMap.TXT_MAX);
  const room=StoreMap.BLK_MAX-(ev.blocks.length-old.length);
  if(lines.length>room){lines=[...lines.slice(0,room-1),lines.slice(room-1).join(" ")];fix=true;kpSay("bad",`最多 ${StoreMap.BLK_MAX} 行`)}
  lines=lines.map(x=>x.slice(0,StoreMap.TXT_MAX));
  if(fix){const c=a.selectionStart;a.value=lines.join("\n");a.setSelectionRange(Math.min(c,a.value.length),Math.min(c,a.value.length))}
  let p=0;while(p<old.length&&p<lines.length&&old[p].text===lines[p])p++;
  let q=0;while(q<old.length-p&&q<lines.length-p&&old[old.length-1-q].text===lines[lines.length-1-q])q++;
  const mid=lines.slice(p,lines.length-q).map((t,n)=>{const b=old[p+n]&&p+n<old.length-q?old[p+n]:{id:uid("b"),text:"",check:null,timeId:null};b.text=t;return b});
  const res=[...old.slice(0,p),...mid,...old.slice(old.length-q)];
  ev.blocks.splice(i0,old.length,...res);
  a.dataset.kpids=res.map(b=>b.id).join(" ");a.dataset.kpgrp=res[0].id;const ln=a.closest(".ln");if(ln)ln.dataset.blk=res[0].id;
}
document.addEventListener("input",e=>{
  const a=e.target,ev=kp&&a.closest&&a.closest(".lc-ed")&&kpEv();if(!ev)return;
  if(a.tagName==="TEXTAREA"&&a.classList.contains("tx")&&a.dataset.kpgrp===undefined){if(/[\r\n]/.test(a.value)){const c=a.selectionStart;a.value=a.value.replace(/[\r\n]+/g," ");a.setSelectionRange(c,c)}kpFit(a)}   /* 貼上多行文字＝接成一行；高度跟著內容 */
  if(a.dataset.kpgrp!==undefined){kpGrpIn(a,ev);kpFit(a)}
  else if(a.dataset.kptitle!==undefined)ev.name=a.value;
  else if(a.dataset.kptx!==undefined){const b=ev.blocks.find(x=>x.id===a.dataset.kptx);if(b){b.text=a.value.replace(/[\r\n]+/g," ");const t=b.timeId&&ev.times.find(x=>x.id===b.timeId);if(t)t.label=b.text}}
  else if(a.dataset.kplb!==undefined){const t=ev.times.find(x=>x.id===a.dataset.kplb);if(t)t.label=a.value}
  else if(a.dataset.tepl!==undefined){const t=ev.times.find(x=>x.id===a.dataset.tepl);if(t)t.place=a.value}
  else if((a.dataset.e==="name"||a.dataset.e==="url")&&a.closest(".kp-lk")){const l=ev.links.find(x=>x.id===a.closest(".kp-lk").dataset.lk);if(l)l[a.dataset.e]=a.value}
  kpSync(ev);
});
/* 負責人（人頁的勾選膠囊） */
document.addEventListener("change",e=>{
  const a=e.target,box=kp&&a.closest&&a.closest(".lc-ed"),ev=box&&kpEv();if(!ev)return;
  if(a.name==="kpStaff")ev.staff=[...box.querySelectorAll('input[name="kpStaff"]:checked')].map(x=>x.value);
});
/* 時間頁：滾輪調整（指標在某一段上就選它） */
document.addEventListener("wheel",e=>{const sg=kp&&e.target.closest&&e.target.closest(".lc-ed .sg");if(!sg||!e.deltaY)return;e.preventDefault();
  if(!lvSeg||lvSeg.tid!==sg.dataset.tid||lvSeg.k!==sg.dataset.sg){lvSeg={tid:sg.dataset.tid,k:sg.dataset.sg,buf:""}}
  const now=performance.now();if(now-(lvSeg.w||0)<70)return;lvSeg.w=now;lvSegTick(e.deltaY<0?1:-1)},{passive:false});
/* 時間頁：觸控時按住一段上下滑（每 18px 一格） */
(()=>{let d=null;
  document.addEventListener("pointerdown",e=>{const sg=e.pointerType==="touch"&&kp&&e.target.closest&&e.target.closest(".lc-ed .sg");if(!sg)return;d={sg,y:e.clientY,n:0}});
  addEventListener("pointermove",e=>{if(!d)return;const n=Math.trunc((d.y-e.clientY)/18);if(n===d.n)return;
    if(!lvSeg||lvSeg.tid!==d.sg.dataset.tid||lvSeg.k!==d.sg.dataset.sg)lvSeg={tid:d.sg.dataset.tid,k:d.sg.dataset.sg,buf:""};
    const step=n>d.n?1:-1;d.n=n;d.moved=true;lvDragAt=performance.now();lvSegTick(step)});
  addEventListener("pointerup",()=>{d=null});addEventListener("pointercancel",()=>{d=null});
})();
/* 整理這張卡片（存檔前）：去掉前後空白、名稱網址都空的超連結不留、時間行的文字寫進時間標記的名稱。
   一律以 blocks 為準：trim 之後先用 blocks 重新攤平 desc，再 evBlocksFix（03 審查 P0-1） */
function kpTidy(ev){
  ev.name=ev.name.trim();
  ev.links.forEach(l=>{l.name=l.name.trim();l.url=l.url.trim()});ev.links=ev.links.filter(l=>l.name||l.url);
  ev.blocks.forEach(b=>{b.text=b.text.trim()});
  ev.times.forEach(t=>{const b=ev.blocks.find(x=>x.timeId===t.id);if(b)t.label=b.text;t.place=String(t.place||"").trim()});
  ev.desc=StoreMap.descOf(ev.blocks);evBlocksFix(ev);
}
/* 存檔前的檢查：整理、名稱與超連結的按鈕名稱不能空白；不合格回傳 false、游標放到那一欄 */
function kpReady(ev){
  kpTidy(ev);
  if(!ev.name){lvPane=null;lvPop=false;render();kpSay("bad","請填名稱");document.querySelector(".lc-ed [data-kptitle]")?.focus();return false}
  {const l=ev.links.find(x=>!x.name);if(l){lvPane=null;lvPop=false;render();kpSay("bad","請填按鈕名稱");document.querySelector(`.lc-ed [data-lk="${CSS.escape(l.id)}"] [data-e="name"]`)?.focus();return false}}
  return true;
}
/* 離開編輯：沒改就只離開；改了就儲存（點外面、Esc、返回、上一張／下一張都走這裡） */
async function kpCommit(){
  if(!kp||!editing||cardEdit!=="e:"+kp.id||kpBusy())return true;
  const ev=kpEv();
  if(!ev){morph(()=>{editing=false;cardEdit="";kp=null;render()});return true}
  if(!kpReady(ev))return false;
  const core=x=>JSON.stringify({...x,report:0,touched:0,touchedAt:0});
  const before=kp.before,was=before&&JSON.parse(before);
  if(!was&&ev.name==="新的即時回報"&&!ev.blocks.some(b=>b.text)&&!ev.times.some(x=>x.label||x.place)&&!(ev.links||[]).length&&(!ev.issueId||ev.issueId===(projCur()||{}).id)&&!(ev.staff||[]).length&&!ev.report){   /* 新增後什麼都沒填（名稱、內容、時間、連結、母議題、負責人、報告都沒動）：不留 */
    const cur=lcCur(),g=cur&&!reduceMotion()?lcGhost(lcCard(cur[0])):null;
    morph(()=>{state=normalize(JSON.parse(snapshot));editing=false;cardEdit="";dirty=false;kp=null;lvOpen=null;render()});
    if(g)g.animate([{opacity:1},{opacity:0,transform:"translateY(20px)"}],{duration:MO.base,easing:MO.in,fill:"forwards"}).onfinish=()=>g.remove();
    if(!lvWide())Back.closed("card");return true}
  if(was&&JSON.stringify(ev)===before&&!dirtyOthers()){morph(()=>{editing=false;cardEdit="";dirty=false;kp=null;render()});return true}
  if(!was||core(ev)!==core(was))evTouch(ev);
  syncLink(ev);dirty=true;
  return kpSave();
}
/* 這次編輯有沒有動到這張以外的資料（母議題的處理紀錄…） */
const dirtyOthers=()=>{const a=JSON.parse(snapshot);a.events=a.events.filter(e=>e.id!==kp.id);const b={...state,events:state.events.filter(e=>e.id!==kp.id)};return JSON.stringify(a)!==JSON.stringify(JSON.parse(JSON.stringify(b)))};
/* 離開編輯並儲存；失敗時回到編輯（卡片打開）、保留草稿 */
async function kpSave(){
  const id=kp.id,key=cardEdit,snap=snapshot,draft=kp,undoable=!!kp.before&&!kp.noUndo&&!dirtyOthers();
  if(!fsMode()&&!(await prepareSave())){kpSay("fail",`${KP_MSG.fail}：這台裝置沒有連上雲端`);return false}
  kpSaving=true;
  morph(()=>{editing=false;cardEdit="";dirty=false;kp=null;kpSt={id,st:"saving"};state.savedAt=nowStr();if(meName())state.savedBy=meName();render()});
  let ok=false;
  try{ok=fsMode()?await fsPersist("",{quiet:true}):await persist("",{quiet:true})}catch(_){ok=false}   /* 成功不跳提示（卡片上有「已儲存」） */
  if(fsMode())Sfx.result(ok);   /* github 模式的 persist 自己會響 */
  kpSaving=false;
  if(ok){const ev=state.events.find(e=>e.id===id);kpSt={id,st:"ok",before:undoable?draft.before:null,after:ev?JSON.stringify(ev):""};render();
    if(CFG.meeting)mtPushAll();return true}
  /* 失敗：草稿還在 state（firestore 模式的補寫也把畫面資料留著），回到編輯、把那張卡片打開 */
  if(!state.events.some(e=>e.id===id))state=normalize(JSON.parse(snap));
  editing=true;cardEdit=key;snapshot=snap;dirty=true;kp=draft;
  if(lvOpen!==id){const was=lcCur();lcSet("live",id);if(!lvWide()&&!was)Back.opened("card",lcBack)}
  {const why=fsMode()?fsLastErr:persistErr;kpSt={id,st:"fail",msg:why?`${KP_MSG.fail}：${why}`:KP_MSG.fail}}render();   /* 兩種模式都接原因（firestore：store.js 的 fsLastErr；GitHub：save.js 的 persistErr） */
  return false;
}
/* 復原：卡片換回修改前的內容，當成一次編輯儲存（是新的一版、不再提供復原）；這張在那之後被改過（重新讀到別人的修改）就不復原 */
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
/* 關分頁、重新整理前：編輯中有改動就提醒。原位編輯的打字、勾選直接寫進 state、不設 dirty，所以另外比對這張卡片跟開始前的內容（03 審查 P1-2） */
const kpDirty=()=>{if(!kp||!editing||cardEdit!=="e:"+kp.id)return false;const ev=kpEv();return !kp.before||!ev||JSON.stringify(ev)!==kp.before||dirtyOthers()};
/* 會議要報告：只是標記，不算「更新」（不改燈號）。編輯中＝跟其他修改一起存；檢視中＝直接存 */
async function lvReport(ev,btn){
  if(!reduceMotion()&&btn)btn.animate([{transform:"scale(.86)"},{transform:"scale(1.08)",offset:.6},{transform:"none"}],{duration:280,easing:MO.out});
  const on=reportOn(ev),flip=()=>{ev.report=!on;if(ev.report)ev.reportAt=nowTaipei();else delete ev.reportAt};
  if(editing&&kp&&kp.id===ev.id){flip();render();return}
  if(editing)return;
  await settingSave(flip,on?"已取消報告標記":"已標記會議要報告");
}

/* ===== 點擊 =====
   捕獲階段：編輯中點卡片外面＝存檔並離開編輯（對話框、下拉選單、提示訊息、編輯紀錄不算外面）；點的是別的膠囊＝存好後打開那一張。
   冒泡階段：膠囊（打開／收回）、卡片上的東西、沒在編輯時點外面＝卡片收回（寬螢幕；全螢幕的卡片蓋住整頁，用返回鍵）。 */
let lvJust=null;
document.addEventListener("click",e=>{
  if(!kp||!editing||cardEdit!=="e:"+kp.id)return;
  const t=e.target;if(!t.closest||t.closest("#dlg,.csel-list,#toast,#logOv"))return;
  if(t.closest(`[data-edbox="e:${CSS.escape(kp.id)}"]`))return;
  lvJust=e;const cp=t.closest("[data-cp]"),p=kpCommit();
  if(cp){e.preventDefault();e.stopPropagation();const k=lcKind(cp),id=cp.dataset.cp;
    p.then(ok=>{if(ok!==false&&!editing){const c=lcCur();lcShow(k,c&&c[0]===k&&c[1]===id?null:id)}})}
},true);
document.addEventListener("click",async e=>{
  const t=e.target;if(!t.closest)return;
  const cp=t.closest("[data-cp]");
  if(cp&&cp.closest("#events,#doneList")){e.preventDefault();if(editing)return;const k=lcKind(cp),id=cp.dataset.cp,c=lcCur();lcShow(k,c&&c[0]===k&&c[1]===id?null:id);return}
  const card=t.closest(".lc:not(.lc-ghost)");
  if(!card){
    if(lvJust===e||editing||!lcCur()||!lvWide())return;
    if(t.closest("#dlg,.csel-list,#toast,#logOv,#setOv,#notiPage,#todayOv,#tabbar,.dhead,#dSearch,#boardRes,#addEvent,a,input,textarea"))return;
    const c=lcCur();lcShow(c[0],null);return}
  if(t.closest("[data-lcback]")){e.preventDefault();lcBack();return}
  const st=t.closest("[data-lcstep]");if(st){e.preventDefault();if(!st.disabled)lcStep(+st.dataset.lcstep);return}
  if(t.closest("[data-lclog]")){e.preventDefault();openLog();return}
  if(t.closest("[data-kpundo]")){kpUndo();return}
  if(t.closest(".ln-ck")&&!t.closest("[data-kpck]"))return;   /* 核取框外面那圈 label：瀏覽器會再送一次點擊給裡面的核取框，交給那一次 */
  if(card.dataset.lc!=="live"||card.classList.contains("ro"))return;
  const id=card.dataset.ev,ev=state.events.find(x=>x.id===id);if(!ev)return;
  const rep=t.closest("[data-evrep]");if(rep){lvReport(ev,rep);return}
  if(t.closest("[data-lcdel]")){if(!editing&&canEdit())lvDelete(ev);return}   /* 卡片上的「刪除」鈕：跟拖到左上角同一條流程 */
  if(editing&&kp&&kp.id===id){lvEdClick(t,ev);return}
  if(editing||!canEdit())return;
  /* 檢視中：點名稱、一行、核取框（同時切換勾選）、「沒有說明」、工具列、母議題＝原位進入編輯 */
  const ck=t.closest("[data-kpck]");if(ck){e.preventDefault();const ln=ck.closest(".ln");await kpStart(id,{toggle:ck.dataset.kpck,focus:ln&&ln.dataset.k!=="time"?ck.dataset.kpck:null});
    const nb=document.querySelector(`.lc-ed [data-kpck="${CSS.escape(ck.dataset.kpck)}"]`);if(nb&&!reduceMotion())nb.animate([{transform:"scale(.7)"},{transform:"scale(1.16)",offset:.55},{transform:"none"}],{duration:280,easing:MO.out});
    return}   /* 勾選音由點擊預設音（sfx.js 的 [data-kpck]）在按下的當下響，不等進入編輯 */
  const tool=t.closest("[data-lctool]");if(tool){if(await kpStart(id,{focus:null}))lvTool(kpEv(),tool.dataset.lctool);return}
  if(t.closest("[data-lcpa]")){if(await kpStart(id,{focus:null})){lvPop=true;render();document.querySelector(`.lc-pop [aria-selected="true"]`)?.focus({preventScroll:true})}return}
  const go=t.closest("[data-kpgo]")||t.closest(".ln[data-blk]");if(go){e.preventDefault();await kpStart(id,{focus:go.dataset.kpgo!==undefined?go.dataset.kpgo:go.dataset.blk});return}
});
/* 鍵盤：名稱、一行可以用 Enter／空白鍵進入編輯；編輯中的按鍵（kpKey）；沒在編輯時 Esc＝卡片收回、左右鍵＝上一張／下一張 */
document.addEventListener("keydown",e=>{
  if(!editing&&(e.key==="Enter"||e.key===" ")&&!e.isComposing&&e.target.matches&&e.target.matches(".lc [data-kpgo][role=button]")){e.preventDefault();e.target.click();return}
  if(kp&&e.target.closest&&e.target.closest(".lc-ed")&&kpKey(e))return;
  if(kp&&editing&&e.key==="Escape"&&!$("#dlg").open&&!document.querySelector(".csel.open")&&kpKey(e))return;   /* 焦點不在卡片上（換頁後輸入欄被拿掉）時 Esc 一樣＝存檔並離開編輯 */
  if(editing||!lcCur()||setOpen||notiOpen||$("#dlg").open||(typeof HS!=="undefined"&&HS.mode)||($("#logOv")&&!$("#logOv").hidden))return;
  const a=document.activeElement,typing=a&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  if(e.key==="Escape"){e.preventDefault();if(typing)a.blur();lcBack();return}
  if((e.key==="ArrowLeft"||e.key==="ArrowRight")&&!typing&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();lcStep(e.key==="ArrowRight"?1:-1)}
},true);

/* ===== 拖到角落（長按拖曳：滑鼠拖動 6px、觸控長按 0.38 秒；DESIGN-next 第七節「清單」） =====
   拖到另一顆上放開＝換位置（只在同一區：報告／其他；放開直接存 order）；拖到左上角＝刪除（先確認；有時間標記再確認一次）；右上角＝完成（state done、doneAt）。
   越靠近哪一角就往那角歪、染上那角的顏色（左上 --late、右上 --ok）。唯讀、編輯中不能拖。 */
const lvZone=()=>{let z=$("#lzDel");if(!z){document.body.insertAdjacentHTML("beforeend",`<div class="lz del" id="lzDel" aria-hidden="true">${ico("close","solo")}</div><div class="lz ok" id="lzOk" aria-hidden="true">${ico("check","solo")}</div>`)}return [$("#lzDel"),$("#lzOk")]};
(()=>{
  let d=null,suppress=false,pend=null,raf=0;const zq={};
  const handle=t=>canEdit()&&!editing&&t.closest&&t.closest("#events .cp:not(.fav-cp)");
  function zoneAt(x,y){const W=innerWidth,H=innerHeight,R=Math.min(200,W*.38),far=Math.min(W,H)*.8,[zd,zo]=lvZone();let hot="";const k={};
    [["del",Math.hypot(x,y),zd],["ok",Math.hypot(W-x,y),zo]].forEach(([n,dd,z])=>{const v=Math.max(0,Math.min(1,1-(dd-R)/(far-R)));k[n]=v;const q=v.toFixed(2);if(zq[n]!==q){zq[n]=q;z.style.setProperty("--k",q)}   /* 值沒變（兩位小數）不寫：每次寫 --k 都會讓角落重算樣式、重新啟動透明度的過渡 */
      z.classList.toggle("hot",dd<R);if(dd<R)hot=n});
    return {hot,k}}
  function begin(el,x,y){
    d={el,id:el.dataset.cp,x0:x,y0:y,on:true,hot:"",over:null,dx:0,dy:0,tilt:0,mix:-1,hx:-99,hy:-99};zq.del=zq.ok="";
    el.classList.add("drag");document.documentElement.classList.add("ev-drag-on");lvZone().forEach(z=>z.classList.add("show"));
    if(navigator.vibrate)try{navigator.vibrate(12)}catch(_){}
    place(x,y);
  }
  /* 指標事件一格可能來好幾次（高更新率的觸控）：只記最後一個位置，每個畫面格算一次（量測見 PR 說明） */
  function move(x,y){pend=[x,y];if(!raf)raf=requestAnimationFrame(flush)}
  function flush(){raf=0;const p=pend;pend=null;if(p)place(p[0],p[1])}
  function place(x,y){
    if(!d||!d.on)return;const el=d.el,dx=x-d.x0,dy=y-d.y0,was=d.hot,z=zoneAt(x,y);d.hot=z.hot;d.dx=dx;d.dy=dy;
    const side=z.k.ok>=z.k.del?"ok":"del",k=Math.max(z.k.ok,z.k.del),tilt=(side==="ok"?1:-1)*(k*k*7+(d.hot?9:0)),mix=Math.round(k*k*30+(d.hot?26:0));d.tilt=tilt;
    el.style.transform=`translate(${dx}px,${dy}px) rotate(${tilt.toFixed(2)}deg) scale(${d.hot?1.08:1.04})`;
    const mx=mix>2?mix:0;if(mx!==d.mix){d.mix=mx;el.style.backgroundColor=mx?`color-mix(in srgb,var(--${side==="ok"?"ok":"late"}) ${mx}%,var(--blk))`:""}   /* 顏色沒變就不寫：每次寫都要重畫整顆膠囊（連同大陰影） */
    if(d.hot&&d.hot!==was)Sfx.play(d.hot==="ok"?"check":"no");
    /* 底下是哪顆膠囊（換位置用）：elementsFromPoint 要先把版面算乾淨再命中測試，是每格最貴的一步。進了角落的範圍（k＞.6）不算換位置；移動不到 4px 也不重測 */
    if(d.hot||k>.6){if(d.over){d.over.classList.remove("over");d.over=null}return}
    if(Math.hypot(x-d.hx,y-d.hy)<4)return;d.hx=x;d.hy=y;
    const me=state.events.find(e=>e.id===d.id),ov=document.elementsFromPoint(x,y).map(n=>n.closest&&n.closest("#events .cp")).find(n=>n&&n!==el);
    const oe=ov&&state.events.find(e=>e.id===ov.dataset.cp),ok=oe&&me&&!!oe.report===!!me.report?ov:null;
    if(d.over!==ok){d.over&&d.over.classList.remove("over");ok&&ok.classList.add("over");d.over=ok}
  }
  async function end(){
    if(!d)return;if(raf){cancelAnimationFrame(raf);raf=0;flush()}   /* 放開前把還沒算的最後一個位置算完（熱區、傾斜要照最後的位置） */
    const s=d;d=null;clearTimeout(s.timer);if(!s.on)return;
    suppress=true;setTimeout(()=>suppress=false,0);
    lvZone().forEach(z=>z.classList.remove("show","hot"));if(s.over)s.over.classList.remove("over");
    const el=s.el,ev=state.events.find(e=>e.id===s.id);
    const back=()=>{el.classList.remove("drag");document.documentElement.classList.remove("ev-drag-on");
      if(reduceMotion()){el.style.transform="";el.style.backgroundColor="";return}
      el.style.transition="transform .46s cubic-bezier(.3,1.35,.5,1),background-color .3s";el.style.transform="";el.style.backgroundColor="";setTimeout(()=>{el.style.transition=""},480)};
    if(!ev){back();return}
    if(!s.hot&&s.over){lvMove(ev,s.over.dataset.cp,el);return}
    if(s.hot==="ok"){lvComplete(ev,el,s);return}
    back();
    if(s.hot==="del")lvDelete(ev);
  }
  /* 拖完放開的那一下不要當成點擊（不然會打開卡片）：window 捕獲階段最先攔 */
  addEventListener("click",e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false}},true);
  document.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"||e.button!==0)return;const el=handle(e.target);if(!el)return;d={el,sx:e.clientX,sy:e.clientY,on:false}});
  addEventListener("pointermove",e=>{if(!d||e.pointerType==="touch")return;if(!d.on){if(Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<6)return;const el=d.el;d=null;begin(el,e.clientX,e.clientY);return}move(e.clientX,e.clientY)});
  addEventListener("pointerup",e=>{if(e.pointerType!=="touch")end()});
  document.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;const el=handle(e.target);if(!el)return;const t=e.touches[0];
    d={el,sx:t.clientX,sy:t.clientY,on:false};d.timer=setTimeout(()=>{if(d&&!d.on){const x=d.el;d=null;begin(x,t.clientX,t.clientY)}},380)},{passive:true});
  addEventListener("touchmove",e=>{if(!d)return;const t=e.touches[0];
    if(!d.on){if(Math.hypot(t.clientX-d.sx,t.clientY-d.sy)>8){clearTimeout(d.timer);d=null}return}
    e.preventDefault();move(t.clientX,t.clientY)},{passive:false});
  addEventListener("touchend",end);addEventListener("touchcancel",end);
  document.addEventListener("contextmenu",e=>{if(d||handle(e.target))e.preventDefault()});   /* 長按時不要跳出系統選單 */
})();
/* 換位置：放開直接存 order（排序不算「更新」，不改燈號）。其他膠囊從原本的位置滑到新的（拖著的那顆從放開的地方） */
async function lvMove(ev,toId,el){
  const first=new Map([...document.querySelectorAll("#events .cp")].map(x=>[x.dataset.cp,x.getBoundingClientRect()]));
  el.classList.remove("drag");el.style.transform="";el.style.backgroundColor="";
  const flip=()=>{document.documentElement.classList.remove("ev-drag-on");if(reduceMotion())return;
    document.querySelectorAll("#events .cp").forEach(x=>{const o=first.get(x.dataset.cp),n=x.getBoundingClientRect();if(o&&(Math.abs(o.left-n.left)>1||Math.abs(o.top-n.top)>1))x.animate([{transform:`translate(${o.left-n.left}px,${o.top-n.top}px)`},{transform:"none"}],{duration:420,easing:"cubic-bezier(.25,1.12,.4,1)"})})};
  const ok=await settingSave(()=>{const a=state.events.indexOf(ev),to=state.events.find(e=>e.id===toId);if(!to||a<0)return false;const b=state.events.indexOf(to);
    state.events.splice(a,1);state.events.splice(state.events.indexOf(to)+(a<b?1:0),0,ev);queueMicrotask(flip)},"已更新排序");
  if(ok===false)document.documentElement.classList.remove("ev-drag-on");
}
/* 刪除（沿用原本的流程）：一定先確認；刪除是永久的（卡片連同版本與時間標記）；有時間標記再確認一次 */
async function lvDelete(ev){
  const n=(ev.times||[]).length;
  const v=await ask((ev.name||"").trim()?`刪除「${ev.name.trim()}」？`:"刪除這張卡片？",[],{danger:"刪除"});if(v!=="delete")return;
  if(n&&await ask(`一起刪掉 ${n} 個時間標記？`,[],{danger:"刪除"})!=="delete")return;
  if(lvOpen===ev.id)lcShow("live",null);
  await settingSave(()=>{unlinkEv(ev);state.events=state.events.filter(x=>x!==ev)},"已刪除");
}
/* 完成（沿用原本的結案：state done、doneAt）：膠囊被吸進右上角，角落鼓一下，其餘滑上來補位；同時放慶祝 */
function lvComplete(ev,el,s){
  const [,z]=lvZone(),rm=reduceMotion();s=s||{dx:0,dy:0,tilt:0};   /* 沒有 s、el 可能沒有＝按卡片上的「完成」鈕（不是拖過來的）：從原位飛 */
  if(!rm){z.classList.add("show","hot");z.animate([{transform:"scale(1.2)",opacity:1},{transform:"scale(1.55)",opacity:1,offset:.45},{transform:"scale(1)",opacity:0}],{duration:820,easing:MO.out}).onfinish=()=>z.classList.remove("show","hot");
    if(el){const r=el.getBoundingClientRect(),tx=innerWidth-64-(r.left+r.width/2),ty=64-(r.top+r.height/2);
    el.animate([{transform:el.style.transform||"none",opacity:1},{transform:`translate(${s.dx+tx*.6}px,${s.dy+ty*.6}px) rotate(${s.tilt+14}deg) scale(.6)`,opacity:1,offset:.55},{transform:`translate(${s.dx+tx}px,${s.dy+ty}px) rotate(${s.tilt+30}deg) scale(.12)`,opacity:0}],{duration:440,easing:"cubic-bezier(.5,0,.6,1)",fill:"forwards"})}}
  lvCelebrate();
  setTimeout(async()=>{if(el)el.style.visibility="hidden";document.documentElement.classList.remove("ev-drag-on");
    if(lvOpen===ev.id){lcSet("live",null);lcGone()}
    const ok=await settingSave(()=>{ev.doneAt=today();evTouch(ev);syncLink(ev)},parentOf(ev)?`已結案，並記錄到「${parentOf(ev).title}」`:"已結案，移到完成紀錄");
    if(ok===false&&el){el.style.visibility="";el.classList.remove("drag");el.getAnimations().forEach(a=>a.cancel());el.style.transform="";el.style.backgroundColor=""}},rm?0:300);
}
/* 完成的慶祝（約兩秒、不擋操作）：右上角漫開一圈光暈（規格明寫的例外）、彩帶從那一角噴出再落下、一段上行的音（設定的音效開關）。減少動態時只有聲音 */
function lvCelebrate(){
  Sfx.play("fete");
  if(reduceMotion())return;
  const L=document.createElement("div");L.className="fete";L.setAttribute("aria-hidden","true");document.body.append(L);
  const W=innerWidth,H=innerHeight,ox=W-70,oy=70,cols=["var(--acc)","var(--acc2)","var(--ok)","var(--ink)","var(--pri)"],rn=(a,b)=>a+Math.random()*(b-a);
  const wash=document.createElement("i");wash.className="fete-wash";wash.style.cssText=`left:${ox}px;top:${oy}px`;L.append(wash);
  wash.animate([{transform:"translate(-50%,-50%) scale(.2)",opacity:.34},{transform:"translate(-50%,-50%) scale(1)",opacity:0}],{duration:1500,easing:MO.out,fill:"forwards"});
  for(let i=0;i<54;i++){const p=document.createElement("i"),k=i%3,sz=rn(7,13);
    p.style.cssText=`left:${ox}px;top:${oy}px;width:${(k===2?sz*.45:sz).toFixed(1)}px;height:${(k===1?sz:sz*(k===2?2.2:.62)).toFixed(1)}px;border-radius:${k===1?"50%":"3px"};background:${cols[i%cols.length]}`;L.append(p);
    const ang=rn(Math.PI*.52,Math.PI*1.08),sp=rn(.22,.95)*Math.min(W,560),bx=Math.cos(ang)*sp,by=Math.sin(ang)*sp*.7,fall=rn(.45,.95)*H,dr=rn(-90,90),rot=rn(-540,540);
    p.animate([{transform:"translate(-50%,-50%) scale(.3)",opacity:1,easing:"cubic-bezier(.1,.8,.3,1)"},{transform:`translate(calc(-50% + ${bx}px),calc(-50% + ${by}px)) rotate(${rot*.4}deg) scale(1)`,opacity:1,offset:.28,easing:"cubic-bezier(.4,0,.8,.6)"},
      {transform:`translate(calc(-50% + ${bx+dr}px),calc(-50% + ${by+fall}px)) rotate(${rot}deg) scale(.9)`,opacity:1,offset:.86},{transform:`translate(calc(-50% + ${bx+dr*1.1}px),calc(-50% + ${by+fall*1.12}px)) rotate(${rot*1.1}deg) scale(.8)`,opacity:0}],{duration:rn(1500,2000),delay:rn(0,160),fill:"both"})}
  setTimeout(()=>L.remove(),2200);
}
