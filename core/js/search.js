/* 核心｜部門內搜尋列（DESIGN-next 第六節「部門內」；標題列下面、高 50 的膠囊，只在即時回報、進度、完成紀錄三頁）
   - 找這個單位的：即時回報（名稱、逐行內容、負責人、地點）、完成紀錄（即時回報同上；結案的議題看名稱、說明）、議題（名稱、說明、處理紀錄）。不跨部門。
   - 有輸入時看板內容（.layout）換成分區的結果清單（#boardRes）：即時回報、完成紀錄、議題各一區，每區標題寫件數；符合的字加底色。
     打字時結果原位更新（morph.js 的 morphTo），沒變的列留著，新的由下浮現。
   - 點一筆＝清掉搜尋、換到那一區（底部分頁同一套 setSection），捲到那一項並打開（即時回報／完成紀錄展開膠囊或選到右側詳情、議題打開詳情）。
   - × 與 Esc 清除（搜尋中焦點不在搜尋欄時 Esc 也清）；上下鍵選、Enter 打開。換分頁（render.js 的 setSection）或回主頁（離開這一頁）時清掉。 */
const HS={q:"",items:[],on:-1,mode:false};
const hsHit=(t,ql)=>!!t&&String(t).toLowerCase().includes(ql);
/* 即時回報（進行中或已完成）符合的地方：名稱、逐行內容、負責人、地點；回傳要寫在名稱後面的小字（名稱本身符合就不寫） */
function hsEvHit(e,ql){
  if(hsHit(evName(e),ql))return {sub:""};
  const lines=(e.blocks||[]).length?e.blocks.map(b=>b.text):String(e.desc||"").split("\n");
  const l=lines.find(t=>hsHit(t,ql));if(l)return {sub:l};
  const s=staffNames(e.staff).find(n=>hsHit(n,ql));if(s)return {sub:s};
  const p=(e.times||[]).map(t=>t.place).find(t=>hsHit(t,ql));if(p)return {sub:p};
  return null;
}
function hsIndex(ql){
  const live=[],done=[],issue=[];
  state.events.forEach(e=>{const h=hsEvHit(e,ql);if(!h)return;(e.doneAt?done:live).push({k:e.doneAt?"done":"live",id:e.id,title:evName(e),sub:h.sub,st:e.doneAt?"done":evStatus(e),d:e.doneAt||""})});
  state.issues.forEach(i=>{
    if(i.doneAt){if(hsHit(i.title,ql)||hsHit(i.note,ql))done.push({k:"done",id:i.id,title:i.title,sub:hsHit(i.title,ql)?"":i.note,st:"done",d:i.doneAt});return}
    const m=(i.markers||[]).map(x=>x.text).find(t=>hsHit(t,ql));
    if(hsHit(i.title,ql)||hsHit(i.note,ql)||m)issue.push({k:"issue",id:i.id,title:i.title,sub:hsHit(i.title,ql)?"":hsHit(i.note,ql)?i.note:m});
  });
  done.sort((a,b)=>b.d.localeCompare(a.d));
  return [["live","LIVE","即時回報",live],["done","ARCHIVE","完成紀錄",done],["issue","ISSUES","議題",issue]].filter(([k])=>secTab(secOf(k==="issue"?"progress":k)));
}
const hsHL=(s,q)=>{const t=String(s||"");const i=t.toLowerCase().indexOf(q.toLowerCase());return i<0||!q?esc(t):esc(t.slice(0,i))+`<mark>${esc(t.slice(i,i+q.length))}</mark>`+esc(t.slice(i+q.length))};
/* 搜尋列只在三頁出現（會長室、秘書處自己的分頁沒有）；不在那三頁時順便清掉 */
const hsHere=()=>curSec!=="ext"&&!notiOpen;   /* 通知與行事曆那一頁也沒有搜尋列（notify.js） */
function hsBar(){const bar=$("#dSearch");if(!bar)return;const on=hsHere();bar.hidden=!on;if(!on&&HS.q)hsClear()}
/* 有沒有在搜尋：看板內容（.layout）換成結果清單。換的時候新的一塊一塊由下浮上來 */
function hsMode(on){
  if(HS.mode===on)return;HS.mode=on;
  const box=$("#boardRes"),lay=document.querySelector(".layout");
  [box,lay].forEach(el=>el&&el.getAnimations().forEach(a=>a.cancel()));
  document.body.classList.toggle("searching",on);box.hidden=!on;
  if(!on)box.textContent="";
  if(typeof fabSync==="function")fabSync();
  const tgt=on?[...box.children]:lay?[...lay.children].filter(g=>g.offsetParent):[];
  tgt.slice(0,16).forEach((el,i)=>Anim.enter(el,"rise",{delay:i*30}));
}
function hsRender(){
  const box=$("#boardRes"),bar=$("#dSearch"),q=HS.q.trim();if(!box)return;
  Anim.toggle(bar.querySelector(".ds-x"),!!HS.q);
  if(!q){HS.items=[];HS.on=-1;hsMode(false);return}
  const ql=q.toLowerCase(),secs=hsIndex(ql);
  HS.items=secs.flatMap(s=>s[3]);if(HS.on>=HS.items.length||HS.on<0)HS.on=HS.items.length?0:-1;
  let n=0;
  const row=x=>{const i=n++;return `<button type="button" class="dr-item${x.k==="done"?" done":""}${i===HS.on?" on":""}" data-hs="${i}" data-fk="${esc(x.k+":"+x.id)}">${x.k==="issue"?"":`<span class="dr-dot" data-st="${esc(x.st)}" aria-hidden="true"></span>`}<b>${hsHL(x.title,q)}</b>${x.sub?`<small>${hsHL(x.sub,q)}</small>`:""}</button>`};
  const html=secs.filter(s=>s[3].length).map(([k,en,t,xs])=>`<section class="dr-sec" data-key="${k}"><div class="dr-h"><b><span class="dh-en">${en}</span>${t}</b><span class="num">${xs.length}</span></div><div class="dr-list">${xs.map(row).join("")}</div></section>`).join("")
    ||`<p class="dr-none num" data-key="none">0</p>`;
  const was=HS.mode,flip=was?Anim.capture():null;
  morphTo(box,html,"sres");hsMode(true);
  if(was)Anim.play(flip);
}
function hsMark(i){HS.on=i;document.querySelectorAll("#boardRes .dr-item").forEach((b,j)=>b.classList.toggle("on",j===i));const b=document.querySelectorAll("#boardRes .dr-item")[i];b&&b.scrollIntoView({block:"nearest"})}
/* 清掉搜尋（×、Esc、換分頁、點了一筆結果、離開這一頁） */
function hsClear(){const q=$("#boardQ");if(!q)return;q.value=HS.q="";HS.on=-1;hsRender()}
/* 打開一筆：清掉搜尋 → 換區塊 → 捲到那一項 → 打開 */
function hsGo(x){
  if(!x)return;$("#boardQ").blur();hsClear();
  if(notiOpen)closeNoti(true);if(setOpen)closeSettings(true);
  if(x.k==="done")doneWeekFor(x.id);   /* 完成紀錄先進到那一週（views.js） */
  const sec=secOf(x.k==="issue"?"progress":x.k);if(typeof setSection==="function"&&secTab(sec))setSection(sec);
  setTimeout(()=>{
    const el=x.k==="issue"?document.querySelector(`#gantt [data-jump="${CSS.escape(x.id)}"]`):document.querySelector(x.k==="live"?`#events [data-cp="${CSS.escape(x.id)}"]`:`#donePanel [data-cp="${CSS.escape(x.id)}"]`);
    if(!el){toast("在看板上找不到這一項");return}
    el.scrollIntoView({block:"center",behavior:reduceMotion()?"auto":"smooth"});
    if(x.k==="issue"){el.click();return}
    const k=x.k==="live"?"live":"done",c=lcCur();if(!(c&&c[0]===k&&c[1]===x.id))lcShow(k,x.id);   /* 打開那一張（live.js） */
  },reduceMotion()?0:360);
}
(()=>{
  const q=$("#boardQ");if(!q)return;
  q.addEventListener("input",()=>{HS.q=q.value;HS.on=0;hsRender()});
  q.addEventListener("keydown",e=>{
    if(e.key==="Escape"){if(q.value){e.preventDefault();e.stopPropagation();hsClear()}else q.blur();return}
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(!HS.items.length)return;e.preventDefault();hsMark((HS.on+(e.key==="ArrowDown"?1:-1)+HS.items.length)%HS.items.length);return}
    if(e.key==="Enter"){e.preventDefault();const x=HS.items[HS.on];if(x)hsGo(x)}
  });
  $("#dSearch .ds-x").addEventListener("click",e=>{e.preventDefault();hsClear();q.focus()});
  /* 搜尋中按 Esc（焦點不在搜尋欄也算）：清掉搜尋。在 document 的捕獲階段先處理，排在「收起右側詳情」（events.js）之前；
     有對話框、設定、通知與行事曆、今日層、報告預覽、編輯紀錄開著時不管（各自的 Esc 先關它們） */
  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape"||!HS.mode||$("#dlg").open||setOpen||notiOpen||todayOpen||rptOpen||($("#logOv")&&!$("#logOv").hidden))return;
    e.preventDefault();e.stopImmediatePropagation();hsClear();
  },true);
  document.addEventListener("click",e=>{const it=e.target.closest&&e.target.closest("#boardRes [data-hs]");if(it)hsGo(HS.items[+it.dataset.hs])});
  /* 回主頁（離開這一頁）：清掉，從瀏覽紀錄回來時（bfcache）不會還停在搜尋 */
  addEventListener("pagehide",()=>{if(HS.q)hsClear()});
  addEventListener("pageshow",e=>{if(e.persisted&&(HS.q||q.value))hsClear()});
})();
