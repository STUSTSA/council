/* 核心｜人事時地物標籤（schemaVersion 8）
   state.labels[]＝{id,kind,name}，kind 是「人／事／時／地／物」其中之一；由管理員在設定頁「標籤」建立。
   即時回報與議題各自有 labels[]（存標籤 id）。挑選時各類別裡「用得越多的排越前面」（像常用選字）。
   跟時間標記上的「地點」（times[].place，自由文字）分工：「地」標籤是常去的地方，填地點時會列成快速選項，點了就填進地點欄。 */
const LABEL_KINDS=["人","事","時","地","物"];
const labelById=id=>state.labels.find(l=>l.id===id);
/* 每個標籤被用了幾次（即時回報＋議題，含已完成的） */
function labelUse(){const n=new Map();[...state.events,...state.issues].forEach(o=>(o.labels||[]).forEach(id=>n.set(id,(n.get(id)||0)+1)));return n}
/* 某一類的標籤，常用的排前面，同樣次數照名字 */
function labelsOf(kind,use=labelUse()){return state.labels.filter(l=>l.kind===kind).sort((a,b)=>(use.get(b.id)||0)-(use.get(a.id)||0)||a.name.localeCompare(b.name,"zh-Hant"))}
/* 顯示用的小標籤（照人事時地物的順序） */
function labelChipsHTML(ids){
  const ls=(ids||[]).map(labelById).filter(Boolean).sort((a,b)=>LABEL_KINDS.indexOf(a.kind)-LABEL_KINDS.indexOf(b.kind));
  return ls.length?`<div class="lbl-row">${ls.map(l=>`<span class="lbl-chip" data-k="${esc(l.kind)}"><i>${esc(l.kind)}</i>${esc(l.name)}</span>`).join("")}</div>`:"";
}
/* 挑選區：依類別分列，每列可以單獨點選（多選）；name＝表單欄位名（FormData 用 getAll 取） */
function labelPickerHTML(name,sel){
  const use=labelUse(),on=new Set(sel||[]);
  if(!state.labels.length)return `<p class="sub lbl-empty">還沒有標籤。管理員可以到「設定 → 標籤」建立人、事、時、地、物的常用標籤。</p>`;
  return `<div class="lbl-pick">${LABEL_KINDS.map(k=>{const ls=labelsOf(k,use);if(!ls.length)return "";
    return `<div class="lbl-grp" data-k="${k}"><span class="lbl-k">${k}</span><div class="chips">${ls.map(l=>`<label class="chip lbl-opt"><input type="checkbox" name="${name}" value="${esc(l.id)}" ${on.has(l.id)?"checked":""}><span>${esc(l.name)}</span></label>`).join("")}</div></div>`}).join("")}</div>`;
}
/* 時間標記的地點：「地」標籤當快速選項 */
function placeQuickHTML(){
  const ls=labelsOf("地");
  return ls.length?`<span class="place-quick">${ls.slice(0,8).map(l=>`<button type="button" class="tag sm" data-place="${esc(l.name)}">${esc(l.name)}</button>`).join("")}</span>`:"";
}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-place]");if(!b)return;e.preventDefault();
  const box=b.closest(".evf-ed,form"),inp=box&&box.querySelector('[data-e="place"],input[name="place"]');if(inp){inp.value=b.dataset.place;inp.focus()}});

/* ---------- 設定頁「標籤」：一類一塊（DESIGN-next 第十二節、模擬頁 TAGS；ui-09） ----------
   每一類一塊平面色塊：標題（人／事／時／地／物）＋這一類有幾個；下面是標籤膠囊，最後一顆虛線「+」。
   - 新增：點「+」原地變成輸入框（虛線膠囊），Enter＝加入並留著輸入框接著打；Esc＝不加、收回；點別處＝有字就加入再收回。
   - 改名：點膠囊上的名字＝原地變成輸入框（文字點了就改，DESIGN-next 第一節）；Enter、點別處＝存，Esc＝不改；空白或同類重名不改。
   - 刪除：膠囊上的 ×（有刪除權限才有）。
   - 沒有「完成」鈕：離開這一頁（返回、Esc、設定鍵、換項目）時有改過就存（labelSettings 的 done）。
   管理員（firestore 模式：編輯者以上）才能新增、改名；刪除要部門管理員以上（規則要求同批寫刪除紀錄，02D D-d）；其他人只看 */
function labelSetHTML(st){
  const adm=fsMode()?fsWriter():isAdmin(),del=fsMode()?fsDelOk():adm;
  const grp=k=>{const ls=labelsOf(k);
    return `<section class="lbl-box" data-k="${k}"><h3 class="lbl-h">${k}<span class="num">${ls.length}</span></h3><div class="lbl-tags">${ls.map(l=>
      `<span class="lbl-tag">${adm&&st.ren===l.id?`<input class="lbl-in" data-lblname="${esc(l.id)}" value="${esc(l.name)}" aria-label="標籤名稱">`
        :adm?`<button type="button" class="lbl-n" data-x="ren" data-id="${esc(l.id)}" aria-label="改名 ${esc(l.name)}">${esc(l.name)}</button>`:`<span class="lbl-n">${esc(l.name)}</span>`}${del?`<button type="button" class="lbl-x" data-x="del" data-id="${esc(l.id)}" aria-label="刪除 ${esc(l.name)}">×</button>`:""}</span>`).join("")}${
      adm?(st.add===k?`<input class="lbl-add lbl-in" data-newlbl="${k}" aria-label="新增${k}標籤">`:`<button type="button" class="lbl-add" data-x="open" data-k="${k}" aria-label="新增${k}標籤">+</button>`):""}</div></section>`};
  return `${panelHead("標籤")}${LABEL_KINDS.map(grp).join("")}`;
}
async function labelSettings(){
  const d=$("#dlg"),f=$("#dlgForm"),st={add:"",ren:""};d.classList.add("wide");
  const paint=()=>{morphTo(f,labelSetHTML(st),"labels");bind()};   /* 原位更新（morph.js）：打字中的輸入框留著 */
  const addLbl=(k,inp)=>{const n=inp.value.trim();if(!n)return false;
    if(state.labels.some(l=>l.kind===k&&l.name===n)){toast("已經有這個標籤");return false}
    state.labels.push({id:uid("g"),kind:k,name:n});dirty=true;inp.value="";return true};
  const renLbl=inp=>{const l=labelById(inp.dataset.lblname),n=inp.value.trim();
    if(l&&n&&n!==l.name&&!state.labels.some(x=>x!==l&&x.kind===l.kind&&x.name===n)){l.name=n;dirty=true}};
  const focusIn=()=>{const i=f.querySelector(".lbl-in");if(i&&document.activeElement!==i){i.focus();if(i.dataset.lblname)i.select()}};
  const bind=()=>{
    f.onsubmit=ev=>ev.preventDefault();
    f.onkeydown=ev=>{const t=ev.target;if(ev.isComposing||!t.classList||!t.classList.contains("lbl-in"))return;
      if(ev.key==="Enter"){ev.preventDefault();if(t.dataset.newlbl){if(addLbl(t.dataset.newlbl,t))paint()}else{renLbl(t);st.ren="";paint()}}
      else if(ev.key==="Escape"){ev.preventDefault();ev.stopPropagation();st.add=st.ren="";paint()}};   /* Esc 只收回輸入框，不離開這一頁 */
    f.querySelectorAll(".lbl-in").forEach(i=>i.onblur=()=>setTimeout(()=>{if(!i.isConnected||document.activeElement===i)return;
      if(i.dataset.newlbl){addLbl(i.dataset.newlbl,i);if(st.add===i.dataset.newlbl)st.add=""}else{renLbl(i);st.ren=""}paint()},0));   /* 點別處：有字就存，再收回 */
    f.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{
      const x=b.dataset.x;
      if(x==="open"){st.add=b.dataset.k;st.ren="";paint();focusIn();return}
      if(x==="ren"){st.ren=b.dataset.id;st.add="";paint();focusIn();return}
      if(x==="del"){const id=b.dataset.id;state.labels=state.labels.filter(l=>l.id!==id);[...state.events,...state.issues].forEach(o=>{if(o.labels)o.labels=o.labels.filter(v=>v!==id)});dirty=true;paint();return}
    });
  };
  /* 離開這一頁：還開著的輸入框照「點別處」處理，有改過就存 */
  const done=async()=>{const i=f.querySelector(".lbl-in");if(i){if(i.dataset.newlbl)addLbl(i.dataset.newlbl,i);else renLbl(i)}st.add=st.ren="";
    d.oncancel=null;if(d.open)await new Promise(r=>{d.addEventListener("close",()=>setTimeout(r,0),{once:true});d.close()});d.classList.remove("wide");
    if(editing)changed();else if(dirty)await settingSave(()=>{},"已更新標籤");else render();finish()};
  let finish;return new Promise(r=>{finish=r;paint();d.oncancel=ev=>{ev.preventDefault();done()};dlgOpen(false)});
}
