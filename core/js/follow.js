/* 核心｜會長室收藏的別的部門項目與跨部門讀取（設定檔 follow:true 的部門才有收藏）
   follows[]：{id,dept,kind,ref}；kind＝live 即時回報／issue 議題進度／done 完成紀錄／week 週報（ref:"latest"＝永遠最新一份）
   其他部門的資料只讀：先用 GitHub 讀（有權杖時最新），不行再讀網站上的檔案；每 5 分鐘、回到分頁時重新整理。
   02D D-b：已切到新資料庫（source:"firestore"）的部門改讀 Firestore（store.js 的 storeDeptData；要登入），還沒切換的照舊讀資料檔。
   會長室追蹤、秘書處會議的授權、行事曆的「會長室」「其他」（notify.js）、讀秘書處學年設定都經過這裡 */
const FW_KIND={live:"即時回報",issue:"進度",done:"完成紀錄",week:"週報"};
const fwCache=new Map();   /* dept id → {at,data|null,err} */
const fwDept=id=>(window.BOARD_DEPTS||[]).find(d=>d.id===id);
async function fwLoad(id,force){
  const c=fwCache.get(id);if(c&&!force&&Date.now()-c.at<3e5)return c;
  const d=fwDept(id);if(!d)return {at:Date.now(),data:null,err:"沒有這個部門"};
  let data=null,err="";
  if(deptSourceOf(id)==="firestore"){try{data=await storeDeptData(id)}catch(e){fsReadErr("讀部門 "+id,e);err=STORE_XERR(e)}}
  else try{
    const cc=cloudCfg(),tok=ghToken();
    if(cc.owner&&cc.repo&&tok){const r=await fetch(apiURL({...cc,path:d.path})+`?ref=${encodeURIComponent(cc.branch)}`,{headers:{Accept:"application/vnd.github.raw+json",Authorization:"Bearer "+tok},cache:"no-store"});if(r.ok)data=await r.json();else if(r.status===404)err="這個部門還沒有資料"}
    if(!data&&!err&&location.protocol!=="file:"){const r=await fetch(d.path,{cache:"no-cache"});if(r.ok)data=await r.json();else err="這個部門還沒有資料"}
  }catch(_){err="讀不到這個部門的資料"}
  if(data)data=normalize(data);
  const v={at:data?Date.now():Date.now()-3e5+3e4,data,err:data?"":(err||"讀不到這個部門的資料")};fwCache.set(id,v);return v;   /* 讀不到的 30 秒後再試（不是 5 分鐘） */
}
/* 會長收藏的項目（state.follows 裡的 live／issue）→ 讀到的別的部門資料裡還在進行中的那幾筆；自動出現在會長室自己的甘特圖（views.js 的 renderGantt）
   與即時回報清單（live.js 的 renderEvents）。還沒讀過的部門在背景讀，讀完重畫；讀不到的就不顯示（不重試成迴圈：失敗的結果也記在 fwCache） */
const fwBusy=new Set();
const favRedraw=()=>{if(!editing){renderGantt();renderEvents()}};   /* 只重畫這兩處（編輯中不動） */
function favItems(){
  const out={live:[],issue:[]};
  if(!CFG.follow)return out;
  const need=new Set();
  (state.follows||[]).forEach(f=>{
    if((f.kind!=="live"&&f.kind!=="issue")||f.dept===CFG.deptId)return;
    const c=fwCache.get(f.dept);
    if(!c){need.add(f.dept);return}
    if(!c.data)return;
    if(f.kind==="live"){const e=c.data.events.find(x=>x.id===f.ref&&!x.doneAt);if(e)out.live.push({e,dept:f.dept})}
    else{const i=c.data.issues.find(x=>x.id===f.ref&&!x.doneAt);if(i)out.issue.push({i,dept:f.dept})}
  });
  need.forEach(id=>{if(fwBusy.has(id))return;fwBusy.add(id);fwLoad(id).finally(()=>{fwBusy.delete(id);favRedraw()})});
  return out;
}
if(CFG.follow){
  const refresh=()=>{[...new Set((state.follows||[]).map(f=>f.dept))].forEach(id=>fwLoad(id,true).then(favRedraw))};   /* 重新讀、讀到再換，不先清空（不會閃） */
  setInterval(refresh,3e5);document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
}

/* ---------- 收藏（2026-11-23，DievE）：會長在別的部門看板（即時回報、完成紀錄、進度）按「收藏」＝加進會長室自己的甘特圖與即時回報 ----------
   存在 deptSettings/president 的 follows（跟「+ 追蹤項目」同一份；store-write.js 的 setFavorite，規則本來就允許會長室管理員與總管理員）。
   只有會長室管理員與總管理員、在「不是會長室」的部門看板、會長室已在新資料庫時才有這顆鈕；收藏的進行中項目自動出現在會長室自己的甘特圖（進度）與即時回報清單（favItems），點了開原看板；要取消收藏回原看板再按一次書籤 */
const FAV={keys:null,busy:false,loading:false};
const favOk=()=>CFG.deptId!=="president"&&deptSourceOf("president")==="firestore"&&!!(acct.user&&(acctSuper()||acctDepts().president==="admin"));
const favKey=(dept,ref)=>dept+"|"+ref;
function favLoad(){
  if(FAV.keys||FAV.loading||!favOk())return;
  FAV.loading=true;
  fwLoad("president").then(c=>{FAV.loading=false;if(c.data){FAV.keys=new Set((c.data.follows||[]).map(f=>favKey(f.dept,f.ref)));render()}}).catch(()=>{FAV.loading=false});
}
/* kind：live 即時回報／issue 進度／done 完成紀錄；id：卡片或議題的 ID。還沒讀到會長室的清單時鈕先停用 */
function favBtnHTML(kind,id){
  if(!favOk()||kind==="done")return "";
  favLoad();
  const on=!!FAV.keys&&FAV.keys.has(favKey(CFG.deptId,id));
  return `<button type="button" class="fav-btn" data-fav="${esc(id)}" data-favk="${esc(kind)}" aria-pressed="${on}" aria-label="${on?"取消收藏":"收藏"}" title="${on?"已收藏（點一下取消）":"收藏到會長室追蹤"}"${FAV.keys&&!FAV.busy?"":" disabled"}>${ico("bookmark","solo")}</button>`;
}
document.addEventListener("click",async e=>{
  const b=e.target.closest&&e.target.closest("[data-fav]");if(!b||!favOk()||!FAV.keys||FAV.busy)return;
  const id=b.dataset.fav,on=b.getAttribute("aria-pressed")!=="true";
  FAV.busy=true;render();
  try{
    const W=await storeWriteGet();
    await W.setFavorite(CFG.firebase,{dept:CFG.deptId,kind:b.dataset.favk,ref:id,on});
    FAV.keys[on?"add":"delete"](favKey(CFG.deptId,id));fwCache.delete("president");
    if(window.BoardFirestore&&BoardFirestore.dropCache)BoardFirestore.dropCache();
    toast(on?"已收藏，會長室的追蹤看得到":"已取消收藏");
  }catch(err){toast(err&&err.code==="permission-denied"?"沒有權限收藏（需要會長室的部長或總管理員）":"收藏失敗，請再試一次")}
  FAV.busy=false;render();
});

/* ---------- 會長室：文件（2026-11-06 使用者：會長平常有些文件要放在這裡開啟比較方便看） ----------
   state.docs[]＝{id,name,url}。平常是一排膠囊按鈕（點了用新分頁打開）；按這區的「編輯」後每個按鈕旁邊有修改、上下移、刪除，下面「+ 新增文件」。
   新增、修改用對話框（名稱、網址；沒寫 http 的自動補 https://），按這張卡片的「儲存」才上傳。網址存在公開的資料檔，任何人都看得到 */
const docsEd=()=>editing&&cardEdit==="s:docs";
const docURL=u=>{u=String(u||"").trim();return u?safeUrl(u):""};   /* 只收 http(s)，其他（javascript:、data: 等）變成 https:// 開頭的無效網址（util.js 的 safeUrl） */
function renderDocs(){
  const p=$("#docsPanel");if(!p)return;p.hidden=!CFG.follow;if(!CFG.follow)return;
  const ds=state.docs||[],ed=docsEd();
  $("#docsList").innerHTML=ds.map((d,i)=>ed
    ?`<div class="doc-ed" data-doc="${esc(d.id)}"><span class="doc-pill">${ico("doc")}<b>${esc(d.name)}</b></span><small class="doc-u">${esc(d.url)}</small>
       <span class="doc-tools"><button type="button" class="icon" data-docedit>修改</button><button type="button" class="icon" data-docmove="-1" aria-label="往前移"${i?"":" disabled"}>↑</button><button type="button" class="icon" data-docmove="1" aria-label="往後移"${i<ds.length-1?"":" disabled"}>↓</button><button type="button" class="icon danger" data-docdel aria-label="刪除「${esc(d.name)}」">刪除</button></span></div>`
    :`<a class="doc-pill" data-doc="${esc(d.id)}" href="${esc(docURL(d.url))}" target="_blank" rel="noopener">${ico("doc")}<b>${esc(d.name)}</b><span class="doc-go" aria-hidden="true">↗</span></a>`).join("")
    ||`<p class="empty">還沒有文件。登入後按這區的「編輯」→「+ 新增文件」，貼上文件的網址（例如 Google 雲端硬碟的連結）。</p>`;
}
async function docAsk(d){
  const v=await ask(d?"修改文件":"新增文件",[{name:"name",label:"名稱（按鈕上的字）",value:d?d.name:""},{name:"url",label:"網址",value:d?d.url:""}],
    {note:"網址存在公開的資料檔，任何人都看得到；有權限設定的文件（例如 Google 雲端硬碟）照舊要有權限才打得開。",
     validate:o=>!(o.name||"").trim()?"請填名稱":!(o.url||"").trim()?"請填網址":""});
  return v&&v!=="alt"?{name:v.name.trim(),url:docURL(v.url)}:null;
}
document.addEventListener("click",async e=>{
  const t=e.target;if(!t.closest||!CFG.follow)return;
  if(t.closest("#addDoc")){if(!docsEd())return;const v=await docAsk(null);if(!v)return;state.docs.push({id:uid("d"),...v});dirty=true;render();return}
  const row=t.closest("#docsList [data-doc]");if(!row||!docsEd())return;
  const i=state.docs.findIndex(d=>d.id===row.dataset.doc);if(i<0)return;
  if(t.closest("[data-docedit]")){const v=await docAsk(state.docs[i]);if(!v)return;Object.assign(state.docs[i],v);dirty=true;render();return}
  const mv=t.closest("[data-docmove]");if(mv){const j=i+(+mv.dataset.docmove);if(j<0||j>=state.docs.length)return;const [x]=state.docs.splice(i,1);state.docs.splice(j,0,x);dirty=true;render();return}
  if(t.closest("[data-docdel]")){const ok=await ask(`刪除「${state.docs[i].name}」`,[],{danger:"刪除",note:"只會拿掉這個按鈕，文件本身不會被刪除。"});if(ok!=="delete")return;state.docs.splice(i,1);dirty=true;render()}
});
