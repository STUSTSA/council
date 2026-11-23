/* 核心｜會長室的「追蹤」面板（設定檔 follow:true 的部門才有）
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
/* 某部門某類別可以選的項目 → [[ref,顯示文字],…] */
function fwOptions(d,kind){
  if(kind==="live")return d.events.filter(e=>!e.doneAt).map(e=>[e.id,e.name]);
  if(kind==="issue")return d.issues.filter(i=>!i.doneAt).map(i=>[i.id,i.title]);
  if(kind==="done")return [...d.issues.filter(i=>i.doneAt).map(i=>[i.id,`${i.title}（議題 ${fmt(i.doneAt)}）`,i.doneAt]),...d.events.filter(e=>e.doneAt).map(e=>[e.id,`${evName(e)}（即時回報 ${fmt(e.doneAt)}）`,e.doneAt])].sort((a,b)=>b[2].localeCompare(a[2])).slice(0,60).map(([a,b])=>[a,b]);
  if(kind==="week")return [["latest","（永遠顯示最新一份）"],...[...d.weeks].sort((a,b)=>b.date.localeCompare(a.date)).map(w=>[w.id,`${fmt(w.date)} 的週報`])];
  return [];
}
/* 一筆追蹤的內容（找不到時說明原因） */
function fwBody(f,d){
  const miss=t=>({title:t,html:`<p class="sub">原本追蹤的項目已經被刪除或搬走。</p>`,gone:true});
  if(f.kind==="live"||(f.kind==="done"&&d.events.some(e=>e.id===f.ref))){
    const e=d.events.find(x=>x.id===f.ref);if(!e)return miss("（找不到）");
    const st=e.doneAt?"":evStatus(e);
    return {title:evName(e),dot:st||"done",html:`<p class="fw-meta">${e.doneAt?`已完成 ${esc(fmt(e.doneAt))}`:EV_ST[st]}${e.round>1&&!e.doneAt?` · 第 ${e.round} 段`:""}${e.touchedAt?` · 最後更新 ${esc(fmt(e.touchedAt).slice(5))}`:""}</p>${e.desc?`<p class="fw-text">${esc(e.desc)}</p>`:""}`};
  }
  if(f.kind==="issue"||f.kind==="done"){
    const i=d.issues.find(x=>x.id===f.ref);if(!i)return miss("（找不到）");
    const mk=sortedMarkers(i)[0];
    return {title:i.title,dot:i.doneAt?"done":"issue",html:`<p class="fw-meta">${i.doneAt?`已結案 ${esc(fmt(i.doneAt))}`:`${esc(i.tags[i.cur]||"")}${i.tags[i.cur]?" · ":""}${schedLabel(i)}`}</p>
      ${hasDates(i)?`<div class="fw-bar">${ticksHTML(48,0,100,(pd(today())-pd(i.start))/Math.max(1,pd(i.end)-pd(i.start))*100)}</div>`:""}${i.note?`<p class="fw-text">${esc(i.note)}</p>`:""}${mk?`<p class="sub fw-mk">${mk.date?esc(fmt(mk.date).slice(5))+" ":""}${esc(mk.text)}</p>`:""}`};
  }
  if(f.kind==="week"){
    const ws=[...d.weeks].sort((a,b)=>b.date.localeCompare(a.date)),w=f.ref==="latest"?ws[0]:ws.find(x=>x.id===f.ref);
    if(!w)return f.ref==="latest"?{title:"最新週報",html:`<p class="sub">這個部門還沒有週報。</p>`}:miss("（找不到）");
    return {title:`${fmt(w.date)} 的週報${f.ref==="latest"?"（最新）":""}`,dot:"week",html:`<pre class="fw-week">${esc(w.text||"")}</pre>`};
  }
  return miss("（不支援的類別）");
}
function renderFollows(){
  const panel=$("#followPanel");if(!panel)return;
  panel.hidden=!CFG.follow;if(!CFG.follow)return;
  const fs=state.follows||[];
  $("#follows").innerHTML=fs.map(f=>{
    const dp=fwDept(f.dept),c=fwCache.get(f.dept);
    const b=!c?{title:"讀取中…",html:""}:c.data?fwBody(f,c.data):{title:"（讀不到）",html:`<p class="sub">${esc(c.err)}</p>`};
    return `<article class="fw${b.gone?" gone":""}" data-fw="${esc(f.id)}" data-dot="${esc(b.dot)}">
      <div class="fw-top"><span class="tag sm">${esc(dp?dp.name:f.dept)}</span><span class="fw-k">${FW_KIND[f.kind]||""}</span>${dp?`<a class="fw-open" href="?d=${encodeURIComponent(dp.id)}" target="_blank" rel="noopener">開啟看板 →</a>`:""}<button type="button" class="icon danger edit-only" data-fwdel aria-label="不再追蹤">移除</button></div>
      <h3 class="fw-t">${esc(b.title)}</h3>${b.html}</article>`}).join("")
    ||`<p class="empty">還沒有追蹤任何項目。登入後按這區的「編輯」→「+ 追蹤項目」，選部門和要看的即時回報、進度、完成紀錄或週報。</p>`;
  /* 需要的部門資料還沒讀過就去讀，讀完再畫一次 */
  const need=[...new Set(fs.map(f=>f.dept))].filter(id=>!fwCache.has(id));
  if(need.length)Promise.all(need.map(id=>fwLoad(id))).then(renderFollows);
}
async function addFollow(){
  const depts=(window.BOARD_DEPTS||[]).filter(d=>d.id!==CFG.deptId);
  const v=await ask("追蹤項目",[{name:"dept",label:"部門",type:"select",value:depts[0]&&depts[0].id,options:depts.map(d=>[d.id,d.name])},
    {name:"kind",label:"要追蹤的是",type:"select",value:"live",options:Object.entries(FW_KIND)}]);
  if(!v)return;
  const c=await fwLoad(v.dept,true);
  if(!c.data){toast(c.err);return}
  const opts=fwOptions(c.data,v.kind);
  if(!opts.length){toast(`${fwDept(v.dept).name}目前沒有可以追蹤的${FW_KIND[v.kind]}`);return}
  const w=await ask(`選擇${fwDept(v.dept).name}的${FW_KIND[v.kind]}`,[{name:"ref",label:"項目",type:"select",value:opts[0][0],options:opts}]);
  if(!w)return;
  if((state.follows||[]).some(f=>f.dept===v.dept&&f.kind===v.kind&&f.ref===w.ref)){toast("已經在追蹤了");return}
  state.follows.push({id:uid("f"),dept:v.dept,kind:v.kind,ref:w.ref});changed();
}
document.addEventListener("click",async e=>{
  const t=e.target;if(!t.closest)return;
  if(t.closest("#addFollow")){if(secEd("follow"))await addFollow();return}
  const del=t.closest("[data-fwdel]");
  if(del&&secEd("follow")){const id=del.closest("[data-fw]").dataset.fw;state.follows=state.follows.filter(f=>f.id!==id);changed();return}
});
if(CFG.follow){
  const refresh=()=>{fwCache.clear();renderFollows()};
  setInterval(refresh,3e5);document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
}

/* ---------- 收藏（2026-11-23，DievE）：會長在別的部門看板（即時回報、完成紀錄、進度）按「收藏」＝加進會長室的「追蹤」清單 ----------
   存在 deptSettings/president 的 follows（跟「+ 追蹤項目」同一份；store-write.js 的 setFavorite，規則本來就允許會長室管理員與總管理員）。
   只有會長室管理員與總管理員、在「不是會長室」的部門看板、會長室已在新資料庫時才有這顆鈕；收藏的會出現在會長室「追蹤」（含進度與最後更新），在那裡也能移除 */
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
  if(!favOk())return "";
  favLoad();
  const on=!!FAV.keys&&FAV.keys.has(favKey(CFG.deptId,id));
  return `<button type="button" class="fav-btn" data-fav="${esc(id)}" data-favk="${esc(kind)}" aria-pressed="${on}"${FAV.keys&&!FAV.busy?"":" disabled"}>${on?"已收藏":"收藏"}</button>`;
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
